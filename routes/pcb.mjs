/**
 * PCB → BOM → Cost routes (extracted from server.mjs, v2).
 *  - POST /api/pcb-bom-cost   1-5 board photos → fused BOM (vision + OCR of
 *                             markings) → costed. Schema-forced output.
 *  - GET  /api/pcb-cost/catalogue
 *  - POST /api/pcb-cost       deterministic re-cost (+ multi-region + sensitivity)
 *  - POST /api/pcb-insights   AI cost/DFM/sourcing ideas, engine-verified.
 */
import { messagesJson } from '../llm-json.mjs';
import {
  costBom, costBomMultiRegion, simulatePcbCost, pcbTornado, classVolMult,
  COMPONENT_TYPES, COMPONENT_CLASSES, PCB_REGIONS, PCB_REGION_KEYS,
} from '../pcb-cost.mjs';

const FINISHES = ['hasl', 'leadfree_hasl', 'enig', 'osp', 'immersion_silver'];
const LAYERS = [1, 2, 4, 6, 8, 10];

const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    board: {
      type: 'object',
      properties: {
        widthMm: { type: 'number' }, heightMm: { type: 'number' },
        layers: { type: 'number', enum: LAYERS }, finish: { type: 'string', enum: FINISHES },
        assumptions: { type: 'string', description: 'What could NOT be observed (layer count, hidden side, under-shield areas…)' },
      },
      required: ['widthMm', 'heightMm', 'layers', 'finish'],
    },
    components: {
      type: 'array', maxItems: 150,
      items: {
        type: 'object',
        properties: {
          refDes: { type: 'string' },
          type: { type: 'string', enum: COMPONENT_TYPES },
          package: { type: 'string' },
          mount: { type: 'string', enum: ['SMT', 'TH'] },
          pins: { type: 'number' },
          qty: { type: 'number' },
          confidence: { type: 'string', enum: ['high', 'med', 'low'] },
          markings: { type: 'string', description: 'Text actually read off the part (OCR), verbatim, if legible' },
          partGuess: { type: 'string', description: 'Part FAMILY inferred from markings (e.g. "STM32F4 MCU", "TPS5430 buck") — family only, never an invented full part number' },
          estUnitPrice1k: { type: 'number', description: 'ONLY when the part family is confidently identified: rough distributor unit price in GBP at 1k qty. Omit when unsure.' },
        },
        required: ['type', 'qty'],
      },
    },
    coverage: {
      type: 'object',
      properties: {
        viewsSeen: { type: 'array', items: { type: 'string' }, description: 'e.g. ["top","bottom","detail top-left"]' },
        hiddenAreas: { type: 'array', items: { type: 'string' }, description: 'shield cans, BGA undersides, unseen bottom side…' },
        bomCoveragePct: { type: 'number', description: 'honest 0-100 estimate of how much of the real BOM these photos can see' },
      },
    },
  },
  required: ['board', 'components'],
};

function buildExtractionPrompt({ imageCount, bottomPopulated, boardWidthMm }) {
  const scaleHint = typeof boardWidthMm === 'number' && boardWidthMm > 0
    ? ` The user states the board is ~${Math.round(boardWidthMm)} mm wide — use that to scale widthMm/heightMm and component sizes.`
    : ' No physical scale reference was given, so board dimensions are a best guess from recognisable packages/connectors — say so in assumptions.';
  return `You are a PCB teardown estimator. You are given ${imageCount} photo${imageCount > 1 ? 's' : ''} of the SAME printed circuit board (different views: top/bottom/angles/close-ups). Produce ONE fused, structured bill-of-materials ESTIMATE for the whole board.

Method:
1. Identify what each photo shows (top, bottom, detail crop) and report it in coverage.viewsSeen.
2. Fuse views: the same component seen in two photos is ONE line — never double-count. Group identical components into one line with qty. Cap at 150 grouped lines.
3. READ text: silkscreen reference designators and IC package markings (OCR). Put verbatim legible markings in "markings". From markings you may infer the part FAMILY into "partGuess" (e.g. "STM32F103 MCU") — family only, do NOT invent a full orderable part number.
4. When (and only when) a part family is confidently identified, you may give "estUnitPrice1k": a rough GBP distributor price at 1k quantity. Omit it when unsure — a wrong price is worse than none.
5. Report honestly what you CANNOT see in coverage.hiddenAreas (under shield cans, BGA undersides, an unphotographed side) and give coverage.bomCoveragePct.
${bottomPopulated ? '6. The BOTTOM side is populated but NOT shown in any photo — include your best estimate of likely bottom-side parts (typically mirrored decoupling caps/passives) at confidence "low".' : '6. Assume single-sided population unless a photo clearly shows otherwise.'}
${scaleHint}

Per line: refDes (silkscreen ref if legible, else ""), type (EXACTLY one of the allowed enum), package (e.g. "0402","SOIC-8","QFN-48","TH"), mount, pins (approx), qty (integer), confidence ("high" clearly identified / "med" / "low" inferred or hidden).
Board: widthMm, heightMm, layers, finish, assumptions (what you could not observe).
Estimate conservatively from what is visible.`;
}

export function registerPcbRoutes(app, deps) {
  const { requireAuth, checkUsageQuota, rateLimit, makeAnthropic, resolveApiKey, safeLlmError } = deps;

  // Shared: pull v2 costing options out of a request body.
  const costOpts = (b = {}) => ({
    volume: Number(b.volume) || 1000,
    region: typeof b.region === 'string' ? b.region : 'china',
    autoGrade: b.autoGrade !== false,
    testStrategy: b.testStrategy,
    sides: b.sides,
    panelUtil: b.panelUtil,
    tariffPct: b.tariffPct,
  });

  // ── Vision: 1-5 photos → fused BOM → cost ─────────────────────────────────
  app.post('/api/pcb-bom-cost', requireAuth, checkUsageQuota, rateLimit(15, 60 * 60 * 1000), async (req, res) => {
    const body = req.body || {};
    // v2 `images: [{base64,mimeType}]`; legacy single `imageBase64` still accepted.
    let images = Array.isArray(body.images) ? body.images : [];
    if (images.length === 0 && typeof body.imageBase64 === 'string') {
      images = [{ base64: body.imageBase64, mimeType: body.mimeType }];
    }
    images = images
      .filter(i => i && typeof (i.base64 || i.imageBase64) === 'string')
      .map(i => ({ base64: i.base64 || i.imageBase64, mimeType: typeof i.mimeType === 'string' ? i.mimeType : 'image/jpeg' }))
      .slice(0, 5);
    if (images.length === 0) return res.status(400).json({ error: 'At least one board photo is required (images[] or imageBase64).' });
    const totalChars = images.reduce((s, i) => s + i.base64.length, 0);
    if (totalChars > 11_000_000) return res.status(413).json({ error: 'Photos too large in total (~8 MB max). The app downscales automatically — retry, or remove a photo.' });

    const apiKey = resolveApiKey(req);
    if (!apiKey) return res.status(400).json({ error: 'No API key configured — add one in Settings.' });

    const prompt = buildExtractionPrompt({
      imageCount: images.length,
      bottomPopulated: body.bottomPopulated === true,
      boardWidthMm: typeof body.boardWidthMm === 'number' ? body.boardWidthMm : undefined,
    });

    try {
      const client = makeAnthropic(apiKey, { userId: req.user?.id, route: '/api/pcb-bom-cost' });
      const extracted = await messagesJson(client, {
        model: 'claude-opus-4-8',
        maxTokens: 8000,
        toolName: 'emit_bom',
        toolDescription: 'Emit the fused PCB BOM estimate.',
        messages: [{
          role: 'user',
          content: [
            ...images.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mimeType, data: i.base64 } })),
            { type: 'text', text: prompt },
          ],
        }],
        schema: EXTRACT_SCHEMA,
        requestOptions: { timeout: 240_000, maxRetries: 1 },
      });

      const opts = costOpts(body);
      // AI 1k price estimates become volume-adjusted overrides the user can edit;
      // returned per-line as aiPrice1k so the UI can label them as AI-estimated.
      const comps = (Array.isArray(extracted.components) ? extracted.components : []).map(c => {
        const est = Number(c.estUnitPrice1k);
        if (Number.isFinite(est) && est > 0 && est < 10000) {
          return { ...c, unitCostOverride: Number((est * classVolMult(String(c.type), opts.volume)).toFixed(4)) };
        }
        return c;
      });
      const cost = costBom({ board: extracted.board, components: comps }, opts);
      cost.lines = cost.lines.map((l, i) => {
        const src = comps[i] || {};
        return {
          ...l,
          confidence: ['high', 'med', 'low'].includes(src.confidence) ? src.confidence : 'med',
          markings: String(src.markings || '').slice(0, 60),
          partGuess: String(src.partGuess || '').slice(0, 60),
          aiPrice1k: Number.isFinite(Number(src.estUnitPrice1k)) && Number(src.estUnitPrice1k) > 0 ? Number(src.estUnitPrice1k) : null,
        };
      });
      const coverage = extracted.coverage && typeof extracted.coverage === 'object' ? {
        viewsSeen: (extracted.coverage.viewsSeen || []).slice(0, 8).map(v => String(v).slice(0, 40)),
        hiddenAreas: (extracted.coverage.hiddenAreas || []).slice(0, 8).map(v => String(v).slice(0, 80)),
        bomCoveragePct: Math.max(0, Math.min(100, Number(extracted.coverage.bomCoveragePct) || 0)) || null,
      } : null;
      res.json({
        board: cost.board, cost,
        assumptions: String(extracted.board?.assumptions || '').slice(0, 400),
        coverage, imagesUsed: images.length, extraction: 'ai-vision',
      });
    } catch (err) {
      res.status(500).json({ error: safeLlmError(err) });
    }
  });

  // ── Catalogue for the UI dropdown ─────────────────────────────────────────
  app.get('/api/pcb-cost/catalogue', (_req, res) => {
    res.json({
      types: COMPONENT_TYPES,
      classes: Object.fromEntries(Object.entries(COMPONENT_CLASSES).map(([k, v]) => [k, { label: v.label, mount: v.mount, unit: v.unit }])),
      regions: Object.fromEntries(Object.entries(PCB_REGIONS).map(([k, v]) => [k, { label: v.label, labourHr: v.labourHr }])),
    });
  });

  // ── Deterministic re-cost (+ multi-region + sensitivity) — no API key ─────
  app.post('/api/pcb-cost', requireAuth, rateLimit(120, 60 * 60 * 1000), (req, res) => {
    const { board, components } = req.body || {};
    if (!Array.isArray(components) || components.length === 0) return res.status(400).json({ error: 'components array is required.' });
    if (components.length > 2000) return res.status(400).json({ error: 'Too many BOM lines (max 2000).' });
    try {
      const opts = costOpts(req.body);
      const input = { board, components };
      const cost = costBom(input, opts);
      const out = { cost };
      if (req.body.allRegions === true) out.multiRegion = costBomMultiRegion(input, opts);
      if (req.body.sensitivity === true) {
        out.sensitivity = { simulation: simulatePcbCost(input, opts), tornado: pcbTornado(input, opts) };
      }
      res.json(out);
    } catch (e) {
      res.status(400).json({ error: e.message || 'Could not cost that BOM.' });
    }
  });

  // ── AI insights: cost-optimization / DFM / sourcing, engine-verified ──────
  const LEVERS = ['finish_downgrade', 'layer_reduction', 'single_side', 'th_to_smt', 'region_move', 'panel_util', 'test_right_size', 'consolidate_parts', 'part_substitution', 'other'];
  const INSIGHT_SCHEMA = {
    type: 'object',
    properties: {
      ideas: {
        type: 'array', maxItems: 12,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            bucket: { type: 'string', enum: ['optimization', 'dfm', 'sourcing'] },
            lever: { type: 'string', enum: LEVERS },
            detail: { type: 'string', description: '2-3 sentences: what to change and why it saves money; name trade-offs' },
            targetRegion: { type: 'string', description: 'for region_move only: one of the region keys' },
          },
          required: ['title', 'bucket', 'lever', 'detail'],
        },
      },
    },
    required: ['ideas'],
  };

  // Re-cost the lever deterministically; null when not expressible in the engine.
  function verifyLever(idea, input, opts, base) {
    const run = (i2, o2) => costBom(i2 || input, { ...opts, ...(o2 || {}) }).total;
    let proposed = null, basis = null;
    const layers = base.board.layers;
    const steps = [1, 2, 4, 6, 8, 10];
    switch (idea.lever) {
      case 'finish_downgrade':
        if (base.board.finish !== 'hasl') { proposed = run({ ...input, board: { ...input.board, finish: 'hasl' } }); basis = 'finish → HASL'; }
        break;
      case 'layer_reduction': {
        const li = steps.indexOf(layers);
        if (li > 1) { proposed = run({ ...input, board: { ...input.board, layers: steps[li - 1] } }); basis = `${layers}L → ${steps[li - 1]}L`; }
        break;
      }
      case 'single_side':
        if (opts.sides === 'double') { proposed = run(null, { sides: 'single' }); basis = 'double → single-side assembly'; }
        break;
      case 'th_to_smt': {
        const comps = input.components.map(c => {
          const key = String(c.type || '').toLowerCase();
          const isTh = (c.mount === 'TH') || (COMPONENT_CLASSES[key]?.mount === 'TH' && c.mount !== 'SMT');
          return isTh && key !== 'connector' ? { ...c, mount: 'SMT' } : c;
        });
        proposed = run({ ...input, components: comps }); basis = 'convert non-connector TH parts to SMT';
        break;
      }
      case 'region_move': {
        const r = String(idea.targetRegion || '').toLowerCase();
        if (PCB_REGION_KEYS.includes(r) && r !== base.region) { proposed = run(null, { region: r }); basis = `${base.regionLabel} → ${PCB_REGIONS[r].label}`; }
        break;
      }
      case 'panel_util':
        proposed = run(null, { panelUtil: 0.95 }); basis = 'panel utilisation → 0.95';
        break;
      case 'test_right_size':
        if (base.params.testStrategy === 'aoi_ict_fct') { proposed = run(null, { testStrategy: 'aoi_ict' }); basis = 'drop FCT (verify coverage first)'; }
        break;
      default:
        break;   // consolidate_parts / part_substitution / other → qualitative
    }
    if (proposed == null) return { basis: 'qualitative — not expressible in the deterministic engine', direction: 'unverified' };
    const delta = Number((proposed - base.total).toFixed(2));
    return {
      baseline: base.total, proposed: Number(proposed.toFixed(2)), delta,
      direction: delta < 0 ? 'confirmed' : 'contradicted', basis,
    };
  }

  app.post('/api/pcb-insights', requireAuth, checkUsageQuota, rateLimit(20, 60 * 60 * 1000), async (req, res) => {
    const { board, components } = req.body || {};
    if (!Array.isArray(components) || components.length === 0) return res.status(400).json({ error: 'components array is required.' });
    const apiKey = resolveApiKey(req);
    if (!apiKey) return res.status(400).json({ error: 'No API key configured — add one in Settings.' });
    try {
      const opts = costOpts(req.body);
      const input = { board, components: components.slice(0, 500) };
      const base = costBom(input, opts);
      const bomSummary = base.lines.slice(0, 60).map(l => `${l.qty}× ${l.label}${l.package ? ` (${l.package})` : ''}${l.mount === 'TH' ? ' [TH]' : ''} @£${l.unitCost}`).join('; ');
      const breakdown = Object.entries(base.breakdown).map(([k, v]) => `${k} £${v.value} (${v.pct}%)`).join(', ');

      const client = makeAnthropic(apiKey, { userId: req.user?.id, route: '/api/pcb-insights' });
      const out = await messagesJson(client, {
        model: 'claude-opus-4-8',
        maxTokens: 3000,
        toolName: 'emit_insights',
        toolDescription: 'Emit PCBA cost-reduction insights.',
        messages: [{
          role: 'user',
          content: `You are a senior PCBA cost engineer. Propose 6-10 SPECIFIC cost-reduction insights for this board, split across three buckets: "optimization" (cost levers), "dfm" (design-for-manufacturing), "sourcing" (where/how to buy). Tag each with the closest machine-readable lever from the enum — a deterministic engine will re-cost expressible levers, so prefer levers it can verify. Name real trade-offs; no generic filler.

Board: ${base.board.widthMm}×${base.board.heightMm} mm, ${base.board.layers}L, ${base.board.finish}, ${base.params.sides ?? 'single'}-side, region ${base.regionLabel}, ${base.volume.toLocaleString()} boards/yr, automotive-grade ${base.params.autoGrade ? 'yes' : 'no'}, test ${base.params.testStrategy}.
Unit cost £${base.total}: ${breakdown}.
BOM (${base.stats.lineItems} lines, ${base.stats.totalPlacements} SMT placements, ${base.stats.thLeads} TH leads): ${bomSummary}`,
        }],
        schema: INSIGHT_SCHEMA,
        requestOptions: { timeout: 120_000, maxRetries: 1 },
      });

      const ideas = (out.ideas || []).slice(0, 12).map(idea => ({
        title: String(idea.title || '').slice(0, 120),
        bucket: ['optimization', 'dfm', 'sourcing'].includes(idea.bucket) ? idea.bucket : 'optimization',
        lever: LEVERS.includes(idea.lever) ? idea.lever : 'other',
        detail: String(idea.detail || '').slice(0, 500),
        engineCheck: verifyLever(idea, input, opts, base),
      }));
      res.json({ baseline: { total: base.total, currency: 'GBP', region: base.region, volume: base.volume }, ideas });
    } catch (err) {
      res.status(500).json({ error: safeLlmError(err) });
    }
  });
}
