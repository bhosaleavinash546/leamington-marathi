import { Router } from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import { preprocessCADFile } from '../utils/preprocessor.js';
import { analyzeGeometry } from '../utils/geometry-bridge.js';
import type { OCCTGeometry } from '../utils/geometry-bridge.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ─── Specialist system prompts per commodity ─────────────────────────────────

const SPECIALIST_SYSTEM_PROMPTS: Record<string, string> = {
  machining: `You are a senior CNC process engineer with 20+ years experience in precision machining should-cost. You specialise in cycle-time estimation from geometry (feature-based MBD), fixturing, cutting parameter selection, and make-vs-buy analysis. Estimate material removal rates, tool changes, and setup count from B-rep topology. Return ONLY valid JSON.`,

  casting: `You are an expert foundry engineer specialising in HPDC, gravity die, sand casting, and investment casting. You can derive gating/risering requirements, solidification time, yield losses, and tooling costs from part geometry. You understand the trade-offs between processes by alloy, weight class, and annual volume. Return ONLY valid JSON.`,

  cast_and_machine: `You are a near-net-shape manufacturing specialist combining foundry and CNC expertise. You assess which features must be cast-to-print vs machined, determine as-cast tolerances, and plan the minimum machining operations after casting. You understand how to optimise the cast/machine split to minimise total cost. Return ONLY valid JSON.`,

  forging: `You are a closed-die forging engineer with deep expertise in billet sizing, flash allowance, stroke sequencing (blocker/finisher), trimming, heat treatment, and die cost estimation. You assess part geometry for forgeability: grain flow, parting line position, undercuts, and taper. Return ONLY valid JSON.`,

  sheet_metal: `You are a progressive die tooling engineer with expertise in stamping, blanking, drawing, and forming. You estimate blank layout and material utilisation, press tonnage, and die cost from part envelope. You understand material springback, bend radii, and formability limits. Return ONLY valid JSON.`,

  sheet_metal_fab: `You are a laser-cut, press-brake, and MIG/TIG welding job shop estimator. You decompose fabricated assemblies into individual blanking, forming, and joining operations. You understand laser cutting speed by material and thickness, bend time per hit, and welding deposition rates. Return ONLY valid JSON.`,

  injection_moulding: `You are a plastics toolmaker and moulding process engineer. You determine cavity count from part mass and volume requirements, estimate cooling time from wall thickness (Fourier equation), select machine tonnage from projected area and cavity pressure, and price moulds from complexity and cavity count. You flag warpage, sink, and weld-line risks. Return ONLY valid JSON.`,

  blow_moulding: `You are an extrusion blow moulding (EBM), injection blow moulding (IBM), and stretch blow moulding (SBM) process engineer. You estimate parison weight and flash from part geometry, cooling time from wall thickness, and cycle time from parison extrusion + blow + cool + open/close. You distinguish EBM (hollow extrusions, tanks, ducts) from IBM (small precision bottles) and SBM (PET bottles). Return ONLY valid JSON.`,

  thermoforming: `You are a thermoforming process engineer specialising in vacuum forming, pressure forming, and twin-sheet forming. You estimate sheet weight from projected area and gauge, trim waste, cycle time from heat + form + cool + trim, and tool cost from part size. You understand material drawability and wall-thinning at corners. Return ONLY valid JSON.`,

  rotational_moulding: `You are a rotational moulding (rotomoulding) specialist. You estimate cycle time from oven heat + cooling + load/unload, powder charge weight, carousel arm count, and mould cost from part volume and complexity. You assess wall uniformity, insert suitability, and compare to blow moulding for large hollow parts. Return ONLY valid JSON.`,

  rubber: `You are a rubber moulding process engineer covering compression, transfer, and injection moulding of elastomers, plus die-cut sheet goods. You estimate flash fraction, cure time from part cross-section and compound, cavity count from press daylight, and mould cost. You flag rubber-to-metal bonding requirements and durometer considerations. Return ONLY valid JSON.`,

  composites: `You are a CFRP/GFRP composite manufacturing engineer with expertise in hand layup, prepreg/autoclave, VARTM/infusion, RTM, and SMC/BMC. You estimate ply count from structural loading hints, fibre-to-resin ratio, layup time per ply, cure cycle time, trimming, and NDI. You assess tool cost from part complexity and batch size. Return ONLY valid JSON.`,

  wiring_harness: `You are a wiring harness and electromechanical assembly cost engineer. You estimate conductor count, total wire length, splice and connector count, crimping time, bundling, and test time. You assess harness complexity from geometric envelope and connector density. Return ONLY valid JSON.`,

  extrusion: `You are a metal and plastic extrusion process engineer. You estimate die cost from profile complexity and cross-sectional area, extrusion speed, billet weight, die life, and post-extrusion operations (cutting, drilling, anodising). Return ONLY valid JSON.`,

  pcb_fab: `You are a PCB fabrication cost engineer covering FR4, flex, rigid-flex, and HDI. You estimate layer count, copper weight, via count, surface finish, and test cost from board dimensions and complexity. Return ONLY valid JSON.`,

  pcba: `You are an EMS (electronics manufacturing services) PCBA cost engineer. You estimate SMT placement time from component count and pitch, reflow profile, through-hole and manual solder time, ICT and functional test, and conformal coating. Return ONLY valid JSON.`,
};

const DEFAULT_SYSTEM_PROMPT = `You are an expert manufacturing engineer AI specialising in should-cost analysis. Analyse the CAD data and return ONLY valid JSON — no markdown, no prose, just the JSON object.`;

// ─── Stage 1 fast commodity selector ────────────────────────────────────────

function stage1Prompt(geo: OCCTGeometry): string {
  if (geo.status !== 'success') {
    return 'Geometry engine failed. Select the most plausible manufacturing commodity for an unspecified mechanical part.';
  }
  const bb = geo.boundingBox!;
  const vol = geo.volume!;
  const fill = geo.fillRatio ?? 0;
  const faces = geo.faces?.total ?? 0;
  const freeForms = geo.features?.freeFormFaceCount ?? 0;
  const holes = geo.features?.estimatedHoleCount ?? 0;
  const wallMean = geo.wallThickness?.meanMm ?? null;
  const weights = geo.weights!;

  return `Part geometry snapshot:
Bounding box: ${bb.xMm.toFixed(0)}×${bb.yMm.toFixed(0)}×${bb.zMm.toFixed(0)}mm
Volume: ${vol.cm3.toFixed(1)} cm³  Fill ratio: ${fill.toFixed(2)}  Faces: ${faces}  Free-form: ${freeForms}  Holes: ${holes}
Wall mean: ${wallMean?.toFixed(1) ?? 'N/A'} mm
Weights — Al: ${weights.aluminiumKg.toFixed(3)} kg  Steel: ${weights.steelKg.toFixed(3)} kg  Plastic: ${weights.plasticKg.toFixed(3)} kg

Valid commodity types: machining, sheet_metal, sheet_metal_fab, injection_moulding, casting, forging, cast_and_machine, blow_moulding, thermoforming, rotational_moulding, rubber, composites, wiring_harness, extrusion, pcb_fab, pcba, biw_assembly, painting, assembly

Return JSON only (no prose): {"primary":"casting","conf":0.87,"alt":[{"type":"machining","conf":0.61},{"type":"forging","conf":0.31}]}`;
}

// POST /api/cad/analyze
router.post('/analyze', upload.single('cadFile'), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

  const { originalname, size, buffer } = req.file;
  const ext = originalname.toLowerCase().split('.').pop() ?? '';
  if (!['stp', 'step', 'igs', 'iges'].includes(ext)) {
    res.status(400).json({ error: 'Unsupported format. Use STEP (.stp/.step) or IGES (.igs/.iges)' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? (req.headers['x-api-key'] as string);
  if (!apiKey) {
    res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured. Set it in .env or pass as x-api-key header.' });
    return;
  }

  // --- Phase 1: Real geometry extraction (OCCT via Python/CadQuery) ---
  let geo: OCCTGeometry;
  let geometrySource: 'occt' | 'text_parsing';

  console.log(`[CAD] Running OCCT geometry engine on ${originalname} (${(size / 1024).toFixed(0)} KB)…`);
  geo = await analyzeGeometry(buffer, originalname, 120_000);

  if (geo.status === 'success') {
    geometrySource = 'occt';
    console.log(`[CAD] OCCT success — V=${geo.volume!.cm3.toFixed(1)}cm³  SA=${geo.surfaceArea!.cm2.toFixed(0)}cm²  faces=${geo.faces!.total}`);
  } else {
    console.warn(`[CAD] OCCT failed (${geo.error}) — falling back to text preprocessor`);
    geometrySource = 'text_parsing';
    geo = { status: 'error', error: geo.error };
  }

  // --- Phase 2: Build text-preprocessor summary for Claude (always computed as context) ---
  const content = buffer.toString('utf-8');
  const preprocessed = preprocessCADFile(content, originalname, size);

  const anthropic = new Anthropic({ apiKey });

  // --- Phase 3: Stage 1 — Fast commodity pre-selection (Haiku) ---
  let stage1Selection: { primary: string; conf: number; alt: Array<{ type: string; conf: number }> } | null = null;
  let selectedCommodity = 'machining'; // fallback

  try {
    console.log('[CAD] Stage 1: Haiku commodity selection…');
    const s1Msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: 'You are a manufacturing process selector. Given part geometry metrics, select the most likely manufacturing commodity. Return ONLY a JSON object, no prose, no markdown.',
      messages: [{ role: 'user', content: stage1Prompt(geo) }],
    });
    const s1Raw = s1Msg.content[0]?.type === 'text' ? s1Msg.content[0].text.trim() : '';
    const parsed = JSON.parse(extractJson(s1Raw)) as typeof stage1Selection;
    if (parsed && typeof parsed.primary === 'string') {
      stage1Selection = parsed;
      selectedCommodity = parsed.primary;
      console.log(`[CAD] Stage 1 result: ${selectedCommodity} (conf=${parsed.conf})`);
    }
  } catch (err) {
    console.warn('[CAD] Stage 1 Haiku failed, using default commodity:', (err as Error).message);
  }

  // --- Phase 4: Stage 2 — Specialist deep analysis (Sonnet) ---
  const systemPrompt = SPECIALIST_SYSTEM_PROMPTS[selectedCommodity] ?? DEFAULT_SYSTEM_PROMPT;
  const userPrompt = buildPrompt(geo, preprocessed, originalname, selectedCommodity, stage1Selection);

  let analysis: unknown;
  let lastRaw = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      messages: attempt === 1
        ? [{ role: 'user', content: userPrompt }]
        : [
            { role: 'user', content: userPrompt },
            { role: 'assistant', content: lastRaw },
            { role: 'user', content: 'The JSON above is malformed or incomplete. Return ONLY the corrected, complete JSON object starting with { and ending with }. No markdown, no prose.' },
          ],
    });

    const raw = message.content[0]?.type === 'text' ? message.content[0].text : '';
    lastRaw = raw;
    const jsonStr = extractJson(raw);

    try {
      analysis = JSON.parse(jsonStr);
      break;
    } catch {
      if (attempt === 2) {
        res.status(500).json({ error: `AI returned unparseable JSON after 2 attempts. Raw: ${raw.slice(0, 400)}` });
        return;
      }
      console.warn('[CAD] JSON parse failed on attempt 1, sending repair request…');
    }
  }

  res.json({
    success: true,
    analysis,
    geometrySource,
    occtGeometry: geo.status === 'success' ? geo : null,
    preprocessed: {
      format: preprocessed.format,
      partName: preprocessed.partName,
      boundingBoxEstMm: preprocessed.boundingBoxEstMm,
      entityStats: preprocessed.entityStats,
    },
  });
});

// ─── JSON extraction helper ──────────────────────────────────────────────────
// Handles: plain JSON, ```json\n{...}\n```, ```{...}```, "here is json: {...}"
function extractJson(text: string): string {
  let s = text.trim();
  // Strip opening code fence (```json, ```JSON, ``` on same line or followed by newline)
  s = s.replace(/^```(?:json)?\s*/i, '');
  // Strip closing code fence
  s = s.replace(/\s*```\s*$/i, '');
  s = s.trim();
  // Extract from first { to last } to discard any surrounding prose
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  return s;
}

// ─── Prompt builder ─────────────────────────────────────────────────────────

function buildPrompt(
  geo: OCCTGeometry,
  pre: ReturnType<typeof preprocessCADFile>,
  filename: string,
  selectedCommodity: string,
  stage1: { primary: string; conf: number; alt: Array<{ type: string; conf: number }> } | null,
): string {
  const validMaterials = 'mat-al6061, mat-al5052, mat-dc01, mat-hss, mat-stainless-316, mat-brass-crz, mat-pp, mat-pa6, mat-pc, mat-lm25, mat-gjl350, mat-az91d, mat-ss304c, mat-bronze-c905';
  const validCommodities = 'machining, sheet_metal, sheet_metal_fab, injection_moulding, casting, forging, cast_and_machine, blow_moulding, thermoforming, rotational_moulding, rubber, composites, wiring_harness, extrusion, pcb_fab, pcba, biw_assembly, painting, assembly';
  const validMachines = 'mach-vmc3, mach-lathe-cnc, mach-drill, mach-5ax, mach-haas-vf2, mach-dmg-dmu50, mach-haas-umc500, mach-mazak-qt200';

  let geometrySection: string;

  if (geo.status === 'success') {
    const bb = geo.boundingBox!;
    const vol = geo.volume!;
    const sa = geo.surfaceArea!;
    const w = geo.weights!;
    const f = geo.features!;
    const faces = geo.faces!;
    const edges = geo.edges!;

    const faceBreakdown = Object.entries(faces.byType)
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => `  ${k}: ${v} (${((v / faces.total) * 100).toFixed(0)}%)`)
      .join('\n');

    const edgeBreakdown = Object.entries(edges.byType)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n');

    const fillHint =
      geo.fillRatio! < 0.20 ? 'very sparse/hollow → sheet metal, casting, or thin-wall machined'
      : geo.fillRatio! < 0.40 ? 'moderate fill → casting or machined from billet'
      : geo.fillRatio! < 0.65 ? 'semi-solid → forging or heavy section casting'
      : 'near-solid → forging or machined from solid bar';

    const wt = geo.wallThickness;
    const wallThicknessStr = wt
      ? `min=${wt.minMm.toFixed(2)}mm  mean=${wt.meanMm.toFixed(2)}mm  max=${wt.maxMm.toFixed(2)}mm  σ=${wt.stdDevMm.toFixed(2)}mm  [${wt.method}, ${wt.uniformity}, n=${wt.sampleCount}]`
      : 'N/A (ray-cast not available)';

    const da = geo.draftAnalysis;
    const draftStr = da
      ? `undercuts=${da.undercutFaceCount}  zero-draft=${da.zeroDraftFaceCount}  adequate=${da.adequateDraftFaceCount}  range=${da.minPositiveDraftDeg?.toFixed(1) ?? '?'}°–${da.maxPositiveDraftDeg?.toFixed(1) ?? '?'}°  (draw dir=[${da.drawDirectionXYZ.join(',')}])`
      : 'N/A';

    const sa2 = geo.setupAnalysis;
    const setupStr = sa2
      ? `${sa2.estimatedSetupCount} setups  [${sa2.principalDirections.map(d => `${d.directionLabel}:${d.faceCount}f`).join(', ')}]`
      : 'N/A';

    const cnc = geo.cncCycleTimeEstimate;
    const cncStr = cnc
      ? `total=${cnc.estimatedTotalHrs.toFixed(3)} hr (${cnc.estimatedTotalMins.toFixed(1)} min)  setup=${cnc.setupTimeMins.toFixed(1)}min  milling=${cnc.planarMillingTimeMins.toFixed(1)}min  drill/bore=${cnc.drillBoreTimeMins.toFixed(1)}min`
      : 'N/A';

    const tc = geo.toolingCostEstimates;
    const toolingStr = tc
      ? `HPDC die=${tc.hpdcDieCostGBP.toFixed(0)}  Gravity mould=${tc.gravityMouldCostGBP.toFixed(0)}  Sand pattern=${tc.sandPatternCostGBP.toFixed(0)}  IM mould=${tc.imMouldCostGBP.toFixed(0)}  Forge die=${tc.forgeDieCostGBP.toFixed(0)}  Progressive die=${tc.progressiveDieCostGBP.toFixed(0)} (all GBP)`
      : 'N/A';

    const ps = geo.processSpecificEstimates;
    const psStr = ps
      ? `Sand cycle=${ps.sandCycleTimeHr.toFixed(3)}hr  Sand(ferrous)=${ps.sandCycleTimeHrFerrous.toFixed(3)}hr  Forge strokes=${ps.forgeStrokes}  Invest wax=${ps.investWaxCostGBP.toFixed(2)}GBP  Invest shell=${ps.investShellCostGBP.toFixed(2)}GBP`
      : 'N/A';

    const mfgScore = geo.manufacturabilityScore ?? null;

    const warningLines: string[] = [];
    if (geo.assemblyWarning) warningLines.push(`⚠ ASSEMBLY DETECTED: ${geo.assemblyWarning} — cost per component, not per assembly`);
    if (geo.unitWarning)    warningLines.push(`⚠ UNIT WARNING: ${geo.unitWarning}`);

    geometrySection = `=== GEOMETRY (measured by Open CASCADE OCCT — all values are precise) ===
File: ${filename}
Bounding box: ${bb.xMm}mm × ${bb.yMm}mm × ${bb.zMm}mm
True volume: ${vol.cm3} cm³ (${vol.mm3.toFixed(0)} mm³)
True surface area: ${sa.cm2} cm²
Fill ratio: ${geo.fillRatio} → ${fillHint}
${warningLines.length ? '\n' + warningLines.join('\n') + '\n' : ''}
=== WALL THICKNESS ANALYSIS ===
${wallThicknessStr}

=== DRAFT & UNDERCUT ANALYSIS ===
${draftStr}
${da && da.undercutFaceCount > 0 ? `⚠ ${da.undercutFaceCount} undercut faces detected — casting/moulding will require side actions or re-orientation` : 'No undercuts detected'}

=== MACHINING SETUP ESTIMATION ===
${setupStr}

=== CNC CYCLE TIME ESTIMATE (bottom-up) ===
${cncStr}
${cnc ? `  Assumptions: feed=${cnc.assumedFeedRateMm2PerMin}mm²/min, drill=${cnc.assumedDrillBoreMinPerFeature}min/feature, setup=${cnc.assumedSetupTimeMinsPerSetup}min/setup` : ''}

=== COMPUTED MANUFACTURABILITY SCORE ===
${mfgScore !== null ? `Score: ${mfgScore}/100 (geometry-derived — use this value verbatim in manufacturabilityScore field)` : 'N/A — use your own assessment'}

=== PARAMETRIC TOOLING COST ESTIMATES (geometry-derived — use these verbatim) ===
${toolingStr}

=== PROCESS-SPECIFIC ESTIMATES (geometry-derived — use these verbatim) ===
${psStr}

Weight at density:
  Aluminium 2.70 g/cm³: ${w.aluminiumKg.toFixed(3)} kg
  Steel 7.85 g/cm³: ${w.steelKg.toFixed(3)} kg
  Cast iron 7.15 g/cm³: ${w.castIronKg.toFixed(3)} kg
  Plastic 1.05 g/cm³: ${w.plasticKg.toFixed(3)} kg
  Copper 8.96 g/cm³: ${w.copperKg.toFixed(3)} kg
  Titanium 4.43 g/cm³: ${w.titaniumKg.toFixed(3)} kg

=== FACE TOPOLOGY (B-rep surface classification) ===
Total faces: ${faces.total}
${faceBreakdown}

=== EDGE TOPOLOGY ===
Total edges: ${edges.total}
${edgeBreakdown}
Sample circle edge radii (mm): [${edges.sampleCircleRadiiMm.join(', ')}]

=== DETECTED FEATURES ===
Cylindrical faces: ${f.cylindricalFaceCount} (radii mm: [${f.cylindricalFaceRadiiMm.join(', ')}])
Estimated holes (r < 30mm): ${f.estimatedHoleCount} at radii [${f.holeRadiiMm.join(', ')}] mm
Boss/shaft features (r ≥ 30mm): ${f.bossShaftRadiiMm.length > 0 ? f.bossShaftRadiiMm.join(', ') + ' mm' : 'none detected'}
Threaded features: ${f.threadFeaturesDetected ? 'DETECTED' : 'not detected'}
Planar faces: ${f.planarFaceCount}
Free-form surfaces (B-spline/Bezier): ${f.freeFormFaceCount}`;
  } else {
    geometrySection = `=== GEOMETRY (text-parsed from ${pre.format} file — lower confidence) ===
File: ${filename}  Size: ${pre.fileSizeKB.toFixed(0)} KB
${pre.summary}`;
  }

  const cncHrs = geo.cncCycleTimeEstimate?.estimatedTotalHrs ?? null;
  const setupCount = geo.setupAnalysis?.estimatedSetupCount ?? null;
  const undercutCount = geo.draftAnalysis?.undercutFaceCount ?? 0;

  const bb = geo.status === 'success' ? geo.boundingBox! : null;
  const bbDimsSorted = bb ? [bb.xMm, bb.yMm, bb.zMm].sort((a, b) => b - a) : null;
  const wallMean = geo.wallThickness?.meanMm ?? null;
  const wallMin  = geo.wallThickness?.minMm ?? null;

  const ps  = geo.processSpecificEstimates;
  const tc  = geo.toolingCostEstimates;
  const mfgScore = geo.manufacturabilityScore ?? null;

  // Stage 1 selection context for the specialist
  const stage1Context = stage1
    ? `\n=== STAGE 1 PRE-SELECTION (Haiku fast classifier) ===\nPrimary: ${stage1.primary} (conf=${stage1.conf})\nAlternatives: ${stage1.alt.map(a => `${a.type}(${a.conf})`).join(', ')}\nYou are the specialist for: ${selectedCommodity} — focus your analysis accordingly.\n`
    : '';

  // Commodity-specific cost input rules
  const commodityRules = buildCommodityRules(selectedCommodity, geo, tc, ps, wallMean, wallMin, bbDimsSorted, bb, cncHrs, setupCount, undercutCount, mfgScore);

  const baseInstructions = geo.status === 'success'
    ? `IMPORTANT GUIDELINES:
- Use the PRECISE OCCT measurements above — do NOT re-estimate geometry
- Set boundingBoxMm to the exact values from the bounding box above
- Set estimatedVolumeCm3 and estimatedSurfaceAreaCm2 to the exact OCCT values
- Set estimatedWeightKg.aluminum/steel/plastic using the weights above
- Set netWeightKg for the primary material suggestion using its weight from above
- Fill ratio ${geo.fillRatio} and face topology determine process: ${geo.fillRatio! > 0.5 ? 'high fill → likely machined or forged' : 'low fill → likely cast, moulded, or fabricated'}
- ${geo.features!.freeFormFaceCount > (geo.faces!.total * 0.15) ? `High free-form content (${geo.features!.freeFormFaceCount}/${geo.faces!.total} faces) → organic shape → favour casting or 5-axis` : 'Mostly prismatic geometry → favour machining or forging'}
- ${geo.features!.estimatedHoleCount > 8 ? `${geo.features!.estimatedHoleCount} holes detected → significant drilling/boring operations required` : ''}
- ${geo.features!.threadFeaturesDetected ? 'Threads detected → include threading operation' : ''}
- ${cncHrs !== null ? `For machining: use estimatedCycleTimeHr=${cncHrs.toFixed(3)} from bottom-up CNC estimate (do NOT guess)` : ''}
- ${setupCount !== null ? `For machining/CAM: estimatedSetupTimeHr=${((setupCount * (geo.cncCycleTimeEstimate?.assumedSetupTimeMinsPerSetup ?? 45)) / 60).toFixed(3)} (${setupCount} setups)` : ''}
- ${undercutCount > 0 ? `${undercutCount} undercuts detected → add High severity manufacturability risk for casting/moulding; machining may need 5-axis` : 'No undercuts — standard tooling angles acceptable'}
- manufacturabilityScore: ${mfgScore !== null ? `use EXACTLY ${mfgScore} (geometry-derived, do NOT alter)` : '0–100 (100 = easiest); deduct 5–15 pts per undercut, 5 pts per zero-draft cluster'}`
    : `GUIDELINES:
- estimatedVolumeCm3: bbox_cm3 × fill_factor (machined: 0.35–0.55, cast: 0.5–0.7, sheet metal: 0.1–0.25)
- estimatedWeightKg: volume × density (Al 2.70, steel 7.85, plastic 1.05 g/cm³)
- manufacturabilityScore: 0–100
- Populate the appropriate costInputSuggestions sub-object for the recommended process`;

  return `${geometrySection}
${stage1Context}
Valid materialId values: ${validMaterials}
Valid commodityType values: ${validCommodities}
Valid machineId values: ${validMachines}

${baseInstructions}

${commodityRules}

FIELD CONFIDENCE INSTRUCTIONS:
For each key field you populate, provide a confidence score 0.0–1.0 in fieldConfidences.
Keys should match the form field IDs. Examples:
  "bm-wall": 0.72 (if you estimated from OCCT mean wall)
  "imm-cav": 0.90 (if cavity count is clearly derivable from part mass)
  "cast-hpdc-die-cost": 0.95 (if OCCT parametric estimate used verbatim)
Score 0.9+ only when using OCCT-derived verbatim values. Score 0.5–0.7 for geometry-informed estimates. Score 0.3–0.5 for rule-of-thumb bracket estimates.

DFM ISSUES:
List 2–5 DFM issues specific to the ${selectedCommodity} process. Each should have:
  severity: "Critical"|"High"|"Medium"|"Low"
  area: short feature/area name
  description: what the issue is
  impact: cost or quality impact
  fix: actionable design change

COST RANGE:
Provide a cost range estimate: { "low": number, "mid": number, "high": number, "currency": "GBP" }
  low = optimistic (ideal tooling amortisation, high volume, simple features)
  mid = most likely unit cost
  high = conservative (complex features, low volume, rework allowance)

Return ONLY this JSON structure (no prose, no markdown fences):
${buildJSONSchema(selectedCommodity, geo)}`;
}

// ─── Commodity-specific cost input rules ────────────────────────────────────

function buildCommodityRules(
  commodity: string,
  geo: OCCTGeometry,
  tc: OCCTGeometry['toolingCostEstimates'],
  ps: OCCTGeometry['processSpecificEstimates'],
  wallMean: number | null,
  wallMin: number | null,
  bbDimsSorted: number[] | null,
  bb: { xMm: number; yMm: number; zMm: number } | null,
  cncHrs: number | null,
  setupCount: number | null,
  undercutCount: number,
  mfgScore: number | null,
): string {
  switch (commodity) {
    case 'machining':
      return `MACHINING COST INPUT RULES:
  estimatedCycleTimeHr: ${cncHrs !== null ? cncHrs.toFixed(3) : 'sum of all operation cycle times'}
  estimatedSetupTimeHr: ${setupCount !== null ? ((setupCount * 45) / 60).toFixed(3) : '0.75 per setup, estimate from geometry complexity'}
  Operations: list each distinct setup as a separate operation (roughing, semi-finish, finish, drilling, threading)
  machineId: choose from mach-vmc3 (3ax), mach-5ax (5ax), mach-lathe-cnc, mach-drill, mach-haas-vf2`;

    case 'casting':
    case 'cast_and_machine': {
      const hpdcCt = wallMean ? Math.round(45 + wallMean * 3) : 75;
      return `CASTING COST INPUT RULES:
  subtype: "hpdc" if Al/Mg and mean_wall<6mm; "sand" if Fe/iron or >8kg or complex cores; "gravity" if Al/Zn 0.5–5kg moderate; "investment" if precision <0.5kg or >40% free-form faces
  HPDC: cycleTimeHpdcSec=${hpdcCt} (45+3×wall), cavities=1 if >1kg else 2
        dieMouldCostGBP=${tc ? tc.hpdcDieCostGBP.toFixed(0) : '<1kg→60000/1-3kg→110000/>3kg→180000'} (OCCT parametric — use verbatim), dieMouldLife=150000, yieldFraction=0.65
  Sand: cycleTimeSandGravHr=${ps ? ps.sandCycleTimeHr.toFixed(3) : '0.5'} (OCCT — use verbatim)
        dieMouldCostGBP=${tc ? tc.sandPatternCostGBP.toFixed(0) : '6000'} (OCCT — use verbatim), dieMouldLife=8000, yieldFraction=0.78
  Gravity: cycleTimeSandGravHr=0.08, dieMouldCostGBP=${tc ? tc.gravityMouldCostGBP.toFixed(0) : '22000'} (OCCT — use verbatim), dieMouldLife=50000, yieldFraction=0.85
  Investment: cycleTimeSandGravHr=0.40, dieMouldCostGBP=12000, dieMouldLife=5000, yieldFraction=0.90
              (wax≈${ps ? ps.investWaxCostGBP.toFixed(2) : '?'}GBP, shell≈${ps ? ps.investShellCostGBP.toFixed(2) : '?'}GBP per part)
${commodity === 'cast_and_machine' ? `  MACHINING SECTION: estimatedCycleTimeHr=${cncHrs !== null ? cncHrs.toFixed(3) : '0.25–2.0 depending on machined features'}` : ''}`;
    }

    case 'forging':
      return `FORGING COST INPUT RULES:
  flashKg=netWeightKg×0.10, yieldFraction=0.90
  strokes=${ps ? ps.forgeStrokes : '3–5 for simple prismatic, 6–9 for complex'} (OCCT-derived — use verbatim if number given); timePerBlowSec=10
  dieCostGBP=${tc ? tc.forgeDieCostGBP.toFixed(0) : 'simple→25000/medium→55000/complex→120000'} (OCCT — use verbatim), dieLife=20000`;

    case 'sheet_metal':
    case 'sheet_metal_fab':
      return `SHEET METAL COST INPUT RULES:
  thicknessMm=${wallMin ? wallMin.toFixed(1) : '1.5'} (use OCCT min wall thickness)
  blankLengthMm=${bbDimsSorted ? (bbDimsSorted[0] * 1.05).toFixed(0) : '?'} (largest bbox × 1.05)
  blankWidthMm=${bbDimsSorted ? (bbDimsSorted[1] * 1.05).toFixed(0) : '?'} (second-largest × 1.05)
  dieCostGBP=${tc ? tc.progressiveDieCostGBP.toFixed(0) : 'progressive→80000/single→15000/laser+brake→3000'} (OCCT — use verbatim)
  dieLife: progressive→1000000; single-stage→300000; laser+brake→999999
  numOps: 2 for simple bracket, 3–5 for formed, 6–8 for complex progressive`;

    case 'injection_moulding':
      return `INJECTION MOULDING COST INPUT RULES:
  wallThicknessMm=${wallMean ? wallMean.toFixed(1) : '2.5'} (use OCCT mean wall)
  projectedAreaCm2=${bb ? ((bb.xMm * bb.yMm) / 100).toFixed(1) : '?'} (bbox X×Y÷100)
  cavities: >50g→1; 10–50g→2; <10g→4–8
  mouldCostGBP=${tc ? tc.imMouldCostGBP.toFixed(0) : '1-cav small→20000/medium→50000/large→100000'} (OCCT — use verbatim)
  mouldLife=1000000, runnerWeightKg=netWeightKg×0.15 (cold runner) or 0 (hot runner)`;

    case 'blow_moulding':
      return `BLOW MOULDING COST INPUT RULES:
  subtype: "ebm" for hollow extrusions (cans, tanks, ducts, jerricans); "ibm" for small precision bottles (<250ml); "sbm" for PET/PP bottles (>250ml stretch)
  wallThicknessMm=${wallMean ? wallMean.toFixed(1) : '2.0'} (OCCT mean wall — use verbatim)
  flashWeightKg = partWeightKg × 0.12 (pinch-off + neck trim typical 10–15%)
  cavities: <250ml→2–4; 250ml–2L→1–2; >2L→1
  mouldCostGBP: single-cav EBM blow mould Al → 8000–25000; IBM → 15000–40000; SBM → 20000–60000
  mouldLife: Al EBM → 500000 cycles; steel IBM → 2000000
  blowTimeSec: 3–8s for bottles; 8–20s for large industrial parts
  openCloseSec: 4–8s typical`;

    case 'thermoforming':
      return `THERMOFORMING COST INPUT RULES:
  method: "vacuum" for simple trays/covers; "pressure" for higher detail; "twin_sheet" for hollow double-wall parts
  sheetWeightKg = partWeightKg / (1 - wasteFraction); wasteFraction = 0.25–0.45 depending on draw ratio
  partWeightKg = netWeightKg (OCCT plastic weight: ${geo.weights?.plasticKg.toFixed(3) ?? '?'} kg)
  toolCostGBP: simple Al vacuum tool → 3000–8000; pressure form with detail → 8000–25000; twin-sheet → 15000–40000
  heatTimeSec: 30–90s (depends on gauge and material)
  formTimeSec: 5–20s vacuum; 10–30s pressure
  trimTimeSec: 10–30s per part`;

    case 'rotational_moulding':
      return `ROTATIONAL MOULDING COST INPUT RULES:
  numArms: 3–4 (standard carousel); 2 (large/complex)
  partsPerArm: 1 for large parts (>5L); 2–4 for medium; up to 8 for small
  heatTimeSec: 900–2400s (15–40 min oven time; scales with wall thickness and part volume)
  coolTimeSec: 600–1800s (10–30 min; forced air or water mist)
  mouldCostGBP: simple Al mould → 8000–20000; complex with inserts → 20000–60000
  mouldLife: Al → 3000–10000 cycles; steel → 20000+ cycles`;

    case 'rubber':
      return `RUBBER MOULDING COST INPUT RULES:
  process: "compression" for solid mounts/gaskets; "transfer" for complex cross-sections with inserts; "injection" for high volume precision; "extrusion" for profiles/seals; "die_cut" for flat gaskets
  flashWeightKg = partWeightKg × 0.08 (compression) or 0.03 (transfer/injection)
  cavities: compression → 1–4; transfer/injection → 2–12; die_cut → 6+
  cycleTimeSec: compression 120–600s; transfer 90–300s; injection 45–120s
  mouldCostGBP: compression simple → 2500–8000; transfer → 5000–20000; injection → 10000–40000
  mouldLife: rubber moulds → 200000–1000000 cycles`;

    case 'composites':
      return `COMPOSITES COST INPUT RULES:
  process: "hand_layup" for simple large parts; "prepreg_autoclave" for aerospace CFRP; "rtm" for medium complexity closed-mould; "infusion" for large marine/wind; "smc" for automotive high-volume; "wet_layup" for GFRP marine
  fibreFraction: 0.30–0.45 (hand layup); 0.55–0.65 (prepreg); 0.45–0.60 (RTM/infusion)
  wasteFraction: 0.15–0.30 (hand layup); 0.05–0.15 (prepreg cut/ply)
  areaCm2=${geo.surfaceArea?.cm2.toFixed(0) ?? '?'} (OCCT surface area — use verbatim)
  plies: estimate from structural requirement (typical CFRP 4–16 plies; GFRP 3–8 plies)
  toolCostGBP: GFRP/infusion → 5000–20000; CFRP prepreg → 15000–60000; RTM matched die → 30000–120000
  cureTimeSec: autoclave 7200–14400s (2–4hr); RTM 1800–5400s; infusion 3600–7200s`;

    default:
      return `COST INPUT RULES:
  Populate the sub-object matching the recommended commodity in costInputSuggestions.
  Use OCCT geometry measurements where available.`;
  }
}

// ─── JSON schema builder ─────────────────────────────────────────────────────

function buildJSONSchema(commodity: string, geo: OCCTGeometry): string {
  // The process-specific sub-object for the selected commodity
  const processSubObjects: Record<string, string> = {
    casting: `    "casting": {
      "subtype": "hpdc"|"sand"|"gravity"|"investment",
      "dieMouldCostGBP": number,
      "dieMouldLife": number,
      "cavities": number,
      "yieldFraction": number,
      "cycleTimeHpdcSec": number,
      "cycleTimeSandGravHr": number
    },`,
    cast_and_machine: `    "casting": {
      "subtype": "hpdc"|"sand"|"gravity"|"investment",
      "dieMouldCostGBP": number,
      "dieMouldLife": number,
      "cavities": number,
      "yieldFraction": number,
      "cycleTimeHpdcSec": number,
      "cycleTimeSandGravHr": number
    },`,
    forging: `    "forging": {
      "flashKg": number,
      "yieldFraction": number,
      "dieCostGBP": number,
      "dieLife": number,
      "strokes": number,
      "timePerBlowSec": number
    },`,
    sheet_metal: `    "sheetMetal": {
      "thicknessMm": number,
      "blankLengthMm": number,
      "blankWidthMm": number,
      "dieCostGBP": number,
      "dieLife": number,
      "numOps": number
    },`,
    sheet_metal_fab: `    "sheetMetal": {
      "thicknessMm": number,
      "blankLengthMm": number,
      "blankWidthMm": number,
      "dieCostGBP": number,
      "dieLife": number,
      "numOps": number
    },`,
    injection_moulding: `    "injectionMoulding": {
      "cavities": number,
      "projectedAreaCm2": number,
      "wallThicknessMm": number,
      "mouldCostGBP": number,
      "mouldLife": number,
      "runnerWeightKg": number
    },`,
    blow_moulding: `    "blowMoulding": {
      "subtype": "ebm"|"ibm"|"sbm",
      "wallThicknessMm": number,
      "flashWeightKg": number,
      "cavities": number,
      "mouldCostGBP": number,
      "mouldLife": number,
      "blowTimeSec": number,
      "openCloseSec": number
    },`,
    thermoforming: `    "thermoforming": {
      "method": "vacuum"|"pressure"|"twin_sheet",
      "sheetWeightKg": number,
      "partWeightKg": number,
      "toolCostGBP": number,
      "heatTimeSec": number,
      "formTimeSec": number,
      "trimTimeSec": number
    },`,
    rotational_moulding: `    "rotationalMoulding": {
      "numArms": number,
      "partsPerArm": number,
      "heatTimeSec": number,
      "coolTimeSec": number,
      "mouldCostGBP": number,
      "mouldLife": number
    },`,
    rubber: `    "rubber": {
      "process": "compression"|"transfer"|"injection"|"extrusion"|"calendering"|"die_cut",
      "flashWeightKg": number,
      "cavities": number,
      "cycleTimeSec": number,
      "mouldCostGBP": number,
      "mouldLife": number
    },`,
    composites: `    "composites": {
      "process": "hand_layup"|"prepreg_autoclave"|"rtm"|"infusion"|"smc"|"wet_layup",
      "fibreFraction": number,
      "wasteFraction": number,
      "areaCm2": number,
      "plies": number,
      "toolCostGBP": number,
      "toolLife": number,
      "cureTimeSec": number
    },`,
  };

  // Include both the primary commodity sub-object plus the four always-present ones
  // so front-end can switch commodity without losing data
  const primarySub = processSubObjects[commodity] ?? '';
  const alwaysSubs = ['casting', 'forging', 'sheet_metal', 'injection_moulding']
    .filter(c => c !== commodity && c !== 'cast_and_machine')
    .map(c => processSubObjects[c] ?? '')
    .join('\n');

  return `{
  "partName": string,
  "geometry": {
    "boundingBoxMm": {"x": number, "y": number, "z": number},
    "estimatedVolumeCm3": number,
    "estimatedSurfaceAreaCm2": number,
    "estimatedWeightKg": {"aluminum": number, "steel": number, "plastic": number}
  },
  "detectedFeatures": [
    {"type": string, "description": string, "count": number, "significance": "High"|"Medium"|"Low"}
  ],
  "materialAnalysis": {
    "fromMetadata": boolean,
    "primarySuggestion": {"materialId": string, "name": string, "confidencePct": number, "reasoning": string},
    "alternatives": [{"materialId": string, "name": string, "confidencePct": number}]
  },
  "processRecommendations": [
    {"process": string, "commodityType": string, "confidencePct": number, "reasoning": string, "estimatedCycleTimeHr": number}
  ],
  "manufacturabilityScore": number,
  "manufacturabilityRisks": [
    {"severity": "High"|"Medium"|"Low", "feature": string, "description": string, "suggestion": string}
  ],
  "costInputSuggestions": {
    "recommendedCommodity": string,
    "netWeightKg": number,
    "materialId": string,
    "estimatedCycleTimeHr": number,
    "estimatedSetupTimeHr": number,
    "estimatedOperations": [
      {"name": string, "machineId": string, "cycleTimeHr": number, "labourId": "lab-uk-skilled", "oee": 0.85, "manning": 1, "labourEfficiency": 0.92}
    ],
${primarySub}
${alwaysSubs}
    "fieldConfidences": { "<fieldId>": number },
    "dfmIssues": [
      {"severity": "Critical"|"High"|"Medium"|"Low", "area": string, "description": string, "impact": string, "fix": string}
    ],
    "costRange": {"low": number, "mid": number, "high": number, "currency": "GBP"},
    "stage1Selection": ${JSON.stringify(geo.status === 'success' ? { primary: 'auto', conf: 0.0, alt: [] } : null)}
  },
  "aiExplanation": string,
  "confidenceLevel": "${geo.status === 'success' ? 'High' : 'Medium'}",
  "analysisLimitations": [string]
}`;
}

export default router;
