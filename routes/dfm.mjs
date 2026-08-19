// ─────────────────────────────────────────────────────────────────────────────
// DFM / DFA Studio routes.
//
//   POST /api/dfm/analyze          part file and/or a 2D drawing extraction →
//                                  measured geometry + rule findings + priced
//                                  cost impact
//   POST /api/dfm/drawing-extract  2D drawing (PDF/image) → dimensions, GD&T,
//                                  roughness and title block, read by vision
//   POST /api/dfm/dfa              assembly → decomposition + DFA analysis
//   GET  /api/dfm/rules            the rule catalogue (thresholds + sources)
//
// Every number a REPORT carries comes from a deterministic engine. Exactly one
// endpoint here calls an LLM — `/drawing-extract`, where vision READS what a
// drawing prints — and everything it extracts is then normalized, judged and
// cross-checked by the same pure engines as any typed input, with each finding
// stamped as drawing-read. The AI extracts; it never invents a number, and it
// is never on the path that JUDGES one.
// ─────────────────────────────────────────────────────────────────────────────
import multer from 'multer';
import { analyzeGeometry, decomposeAssembly } from '../cad-engine/cad-geometry-bridge.mjs';
import { runDfmRules, runAllDfmRules, inferProcessFamily, processFamilyConflict, extractMeasures } from '../dfm-rules.mjs';
import {
  extractDrawing, normalizeExtraction, drawingToRuleInputs, crossCheckDrawing,
  geoFromDrawing, mergeDrawingIntoGeo,
} from '../drawing-analysis.mjs';
import {
  dfmOptions, familyForSelection, familyOfMaterial, processesForMaterial,
} from '../dfm-process-registry.mjs';
import { compareRoutes, rankRoutes } from '../dfm-routing.mjs';
import { priceFindings, summarisePricedImpact, formingContent } from '../dfm-cost-impact.mjs';
import { DFM_RULES, PROCESS_FAMILIES, UNWRITTEN_RULES } from '../dfm-rule-catalogue.mjs';
import { analyseDfa } from '../dfa-engine.mjs';
import { TIME_MODEL } from '../dfa-time-model.mjs';
import { MATERIALS, REGIONS, computeShouldCost } from '../costing-engine.mjs';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// OCCT budget per part. 120 s covers every fixture and typical production
// part; genuinely huge exports (a 31 MB full fuel tank measured ~real-world)
// need more, so the cap is env-tunable — bounded at 10 min so a pathological
// file cannot pin a worker forever.
const GEO_TIMEOUT_MS = Math.min(Number(process.env.CV_DFM_GEO_TIMEOUT_MS) || 120_000, 600_000);

const PROPRIETARY = ['x_t', 'x_b', 'xmt_txt', 'jt', 'prt', 'sldprt', 'catpart'];
const BREP_FORMATS = ['stp', 'step', 'igs', 'iges'];
const extOf = name => (name || '').toLowerCase().split('.').pop() ?? '';

function rejectUnsupported(req, res) {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return true;
  }
  const ext = extOf(req.file.originalname);
  if (PROPRIETARY.includes(ext)) {
    res.status(422).json({
      error: `.${ext} is a proprietary format that needs a licensed kernel. Export the part as STEP (.step/.stp) — every major CAD tool can — and upload that instead.`,
    });
    return true;
  }
  if (!BREP_FORMATS.includes(ext)) {
    res.status(400).json({
      error: 'DFM analysis needs B-rep geometry (STEP or IGES). An STL is a triangle mesh with no topology, so draft, undercuts and features cannot be measured from it.',
    });
    return true;
  }
  return false;
}

const numOr = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

//: Parts per batch. Each one forks an OCP process and takes 5-30 s, so a
//: request is already a minutes-long operation at this size; a larger cap would
//: reliably time out at the proxy rather than return a bigger table.
const BATCH_MAX = 25;

export function registerDfmRoutes(app, {
  requireAuth, rateLimit, db, orgAccess,
  // LLM deps, used ONLY by /drawing-extract. Optional: a registration without
  // them (older tests, stripped deployments) keeps every deterministic route
  // and the extract endpoint answers 503 rather than crashing.
  makeAnthropic, resolveApiKey, safeLlmError, checkUsageQuota,
}) {
  // WHOSE standards, and whose revision history.
  //
  // Both stores were keyed on `user_id`, which made "our company standard" mean
  // "my standard": a colleague could not see a threshold the plant had agreed,
  // and the revision history of a part belonged to whoever happened to upload
  // it. That is a single-player tool wearing a team product's language. Both
  // now key on the ORG, with the personal workspace as the default so a lone
  // user notices nothing.
  const access = orgAccess ? orgAccess(db) : null;

  /**
   * The org this request acts in, or null if the user may not do this here.
   *
   * `viewer` may read; `member` and above may write. The split matters: a
   * quality engineer should be able to read the standards their plant runs to
   * without being able to retune them.
   */
  function scope(req, minRole = 'member') {
    if (!access) return { orgId: req.user.id, role: 'owner' };   // orgs not wired: fall back to per-user
    return access.resolve(req.user, req.body?.orgId || req.query?.orgId, minRole);
  }
  // ── Company standards ──────────────────────────────────────────────────────
  // A plant's own guideline outranks a published one, and this is how DFMPro
  // gets bought: an organisation encodes ITS standards rather than accepting a
  // vendor's. The catalogue is already pure data, so this is storage, not an
  // engine change. Per-user rather than global — one workspace retuning a
  // threshold must not silently change everyone else's reports.
  try {
    db?.exec(`CREATE TABLE IF NOT EXISTS dfm_rule_overrides (
      user_id    TEXT NOT NULL,
      -- WHOSE standard this is. Declared here for a fresh database and ALTERed
      -- in for an existing one; the unique index below needs the column to
      -- exist, and creating it first was a silent failure that left the upsert
      -- with no conflict target and every save returning 500.
      org_id     TEXT,
      rule_id    TEXT NOT NULL,
      enabled    INTEGER NOT NULL DEFAULT 1,
      threshold  TEXT,
      note       TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, rule_id)
    )`);
    // The key moves with the scope. SQLite cannot re-key in place, so the
    // constraint is enforced by a UNIQUE INDEX instead — cheaper than a table
    // rebuild and it survives the ALTER that adds the column.
    db?.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_dfm_overrides_org_rule ON dfm_rule_overrides (org_id, rule_id)');
  } catch { /* migration is best-effort, same as the rest of the schema block */ }

  /**
   * ONE-TIME BACKFILL, user -> that user's personal org.
   *
   * Adding the column is the easy half. The half that matters is that every row
   * written before this change still belongs to somebody: dropping them, or
   * leaving org_id null and filtering it out, would silently delete a plant's
   * retuned thresholds and every saved revision. So each distinct historic
   * user_id is resolved to their personal org — the same org `resolve()` gives
   * them by default — and the rows move with them. Idempotent: rows that
   * already carry an org are left alone.
   */
  function backfillOrgIds(table) {
    if (!db || !access) return;
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN org_id TEXT`); } catch { /* already there */ }
    try {
      const orphans = db.prepare(`SELECT DISTINCT user_id FROM ${table} WHERE org_id IS NULL`).all();
      for (const { user_id: uid } of orphans) {
        const row = db.prepare('SELECT id, email, data FROM users WHERE id = ?').get(uid);
        if (!row) continue;                       // a deleted user's rows stay orphaned rather than land in someone else's org
        let name;
        try { name = JSON.parse(row.data || '{}').name; } catch { name = undefined; }
        const org = access.ensurePersonalOrg({ id: row.id, email: row.email, name });
        db.prepare(`UPDATE ${table} SET org_id = ? WHERE user_id = ? AND org_id IS NULL`).run(org.id, uid);
      }
    } catch { /* best-effort, same as the schema block */ }
  }

  /** Overrides for one org, keyed by rule id, in the shape runDfmRules takes. */
  function overridesFor(orgId) {
    if (!db || !orgId) return undefined;
    try {
      const rows = db.prepare('SELECT rule_id, enabled, threshold, note FROM dfm_rule_overrides WHERE org_id = ?').all(orgId);
      if (!rows.length) return undefined;
      const out = {};
      for (const r of rows) {
        let threshold;
        // A stored threshold that no longer parses must not become a silent
        // `undefined` that reads as "no override" — the rule then runs at the
        // published value while the UI shows a company standard.
        try { threshold = r.threshold == null ? undefined : JSON.parse(r.threshold); } catch { threshold = undefined; }
        out[r.rule_id] = { enabled: r.enabled !== 0, threshold, note: r.note || undefined };
      }
      return out;
    } catch { return undefined; }
  }

  // ── Revision snapshots ─────────────────────────────────────────────────────
  //
  // A DFM report was a snapshot with nothing to compare it to. Answering "did
  // the changes we agreed last month work?" needs rev A to still exist when rev
  // B is analysed, and nothing persisted an analysis at all.
  //
  // What is stored is the RULE VERDICTS, not the geometry: the diff matches by
  // rule id and needs the measured value, the threshold and the priced impact.
  // Keeping the tessellation would multiply the row size by a thousand for data
  // no comparison reads.
  try {
    db?.exec(`CREATE TABLE IF NOT EXISTS dfm_snapshots (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      org_id     TEXT,
      saved_by   TEXT,
      part_key   TEXT NOT NULL,
      label      TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload    TEXT NOT NULL
    )`);
    // WHO saved it. With history shared across a team, "Rev A - 2026-07-02" is
    // not enough to know whose analysis you are comparing against.
    try { db?.exec('ALTER TABLE dfm_snapshots ADD COLUMN saved_by TEXT'); } catch { /* already there */ }
    db?.exec('CREATE INDEX IF NOT EXISTS idx_dfm_snapshots_user_part ON dfm_snapshots (user_id, part_key)');
    db?.exec('CREATE INDEX IF NOT EXISTS idx_dfm_snapshots_org_part ON dfm_snapshots (org_id, part_key)');
  } catch { /* migration is best-effort, same as the rest of the schema block */ }

  backfillOrgIds('dfm_rule_overrides');
  backfillOrgIds('dfm_snapshots');

  /** Two revisions of one part share a key; case and spacing must not split them. */
  const partKeyOf = (a) => String(a?.partName || a?.fileName || 'part')
    .toLowerCase().replace(/\.(step|stp|igs|iges)$/i, '').replace(/[^a-z0-9]+/g, '-').slice(0, 80);

  /**
   * Only what the comparison reads.
   *
   * Storing the whole analysis would put a megabyte of tessellation and feature
   * tables in every row to support a diff that looks at rule ids — and a store
   * that big is a store people turn off.
   */
  function compactForDiff(a) {
    const slim = (f) => ({
      id: f.id, title: f.title, severity: f.severity, measure: f.measure,
      measured: f.measured ?? null, unit: f.unit, thresholdText: f.thresholdText,
      status: f.status, reason: f.reason,
      cost: f.cost ? { annualDeltaEur: f.cost.annualDeltaEur ?? null } : undefined,
    });
    return {
      partName: a?.partName, fileName: a?.fileName, subject: a?.subject, material: a?.material,
      results: (a?.results || []).map((r) => ({
        process: r.process, processName: r.processName, ruleCount: r.ruleCount,
        evaluatedCount: r.evaluatedCount, coveragePct: r.coveragePct, score: r.score,
        impact: r.impact ? { annualEur: r.impact.annualEur } : undefined,
        findings: (r.findings || []).map(slim),
        passed: (r.passed || []).map(slim),
        notEvaluated: (r.notEvaluated || []).map(slim),
      })),
    };
  }

  app.get('/api/dfm/snapshots', requireAuth, (req, res) => {
    if (!db) return res.json({ snapshots: [] });
    const key = String(req.query.partKey || '').slice(0, 80);
    try {
      const sc = scope(req, 'viewer');
      if (!sc) return res.status(403).json({ error: 'You are not a member of that workspace.' });
      const rows = key
        ? db.prepare('SELECT id, label, created_at, part_key, saved_by FROM dfm_snapshots WHERE org_id = ? AND part_key = ? ORDER BY created_at DESC LIMIT 20')
          .all(sc.orgId, key)
        : db.prepare('SELECT id, label, created_at, part_key, saved_by FROM dfm_snapshots WHERE org_id = ? ORDER BY created_at DESC LIMIT 20')
          .all(sc.orgId);
      res.json({ snapshots: rows.map((r) => ({ id: r.id, label: r.label, createdAt: r.created_at, partKey: r.part_key, savedBy: r.saved_by })) });
    } catch { res.json({ snapshots: [] }); }
  });

  app.get('/api/dfm/snapshots/:id', requireAuth, (req, res) => {
    if (!db) return res.status(404).json({ error: 'No store configured.' });
    try {
      const sc = scope(req, 'viewer');
      if (!sc) return res.status(404).json({ error: 'No such snapshot.' });
      const row = db.prepare('SELECT payload, label, created_at FROM dfm_snapshots WHERE id = ? AND org_id = ?')
        .get(req.params.id, sc.orgId);
      if (!row) return res.status(404).json({ error: 'No such snapshot.' });
      res.json({ label: row.label, createdAt: row.created_at, analysis: JSON.parse(row.payload) });
    } catch { res.status(500).json({ error: 'Could not read that snapshot.' }); }
  });

  app.post('/api/dfm/snapshots', requireAuth, (req, res) => {
    if (!db) return res.status(503).json({ error: 'No store configured.' });
    const analysis = req.body?.analysis;
    if (!analysis?.results) return res.status(400).json({ error: 'An analysis with results is required.' });
    const sc = scope(req, 'member');
    if (!sc) return res.status(403).json({ error: 'Only a member of this workspace can save a revision.' });
    const key = partKeyOf(analysis);
    const label = String(req.body?.label || '').trim().slice(0, 80)
      || `${analysis.partName || analysis.fileName || 'Part'} — ${new Date().toISOString().slice(0, 10)}`;
    const id = `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      db.prepare('INSERT INTO dfm_snapshots (id, org_id, user_id, saved_by, part_key, label, created_at, payload) VALUES (?,?,?,?,?,?,?,?)')
        .run(id, sc.orgId, req.user.id, req.user.email || req.user.id, key, label,
             new Date().toISOString(), JSON.stringify(compactForDiff(analysis)));
      // Twenty per part is plenty of history and bounds the table without a cron.
      db.prepare(`DELETE FROM dfm_snapshots WHERE org_id = ? AND part_key = ? AND id NOT IN (
        SELECT id FROM dfm_snapshots WHERE org_id = ? AND part_key = ? ORDER BY created_at DESC LIMIT 20)`)
        .run(sc.orgId, key, sc.orgId, key);
      res.json({ id, label, partKey: key, orgId: sc.orgId });
    } catch (e) { res.status(500).json({ error: 'Could not save that revision.' }); }
  });

  app.delete('/api/dfm/snapshots/:id', requireAuth, (req, res) => {
    if (!db) return res.status(503).json({ error: 'No store configured.' });
    try {
      const sc = scope(req, 'member');
      if (!sc) return res.status(403).json({ error: 'Only a member of this workspace can delete a revision.' });
      db.prepare('DELETE FROM dfm_snapshots WHERE id = ? AND org_id = ?').run(req.params.id, sc.orgId);
      res.json({ ok: true });
    } catch { res.status(500).json({ error: 'Could not delete that revision.' }); }
  });

  // Each call forks a Python OCP process; the bridge caps concurrency, this caps
  // request rate.
  const limit = rateLimit(Number(process.env.CV_DFM_RATE_MAX ?? 40), 10 * 60 * 1000);

  // ── 2D DRAWING EXTRACTION — the one vision call in this file ──────────────
  //
  // The drawing PDF (or image) goes to the model as a native document block
  // and comes back as structured dimensions, GD&T frames, roughness callouts
  // and a title block — via forced tool-use, so the output is always
  // schema-shaped. Nothing is judged here: the client shows the extraction to
  // the engineer, who can exclude misread rows, and only then does /analyze
  // hand the survivors to the deterministic rule engines. Extraction has its
  // own tighter rate limit because a multi-sheet vision read costs real
  // tokens, unlike every other endpoint in this file.
  const extractLimit = rateLimit(15, 60 * 60 * 1000);
  const quota = checkUsageQuota ?? ((_req, _res, next) => next());
  app.post('/api/dfm/drawing-extract', requireAuth, quota, extractLimit, async (req, res) => {
    if (!makeAnthropic || !resolveApiKey) {
      return res.status(503).json({ error: 'Drawing extraction is not configured on this server.' });
    }
    const { fileBase64, mimeType } = req.body ?? {};
    if (typeof fileBase64 !== 'string' || !fileBase64) {
      return res.status(400).json({ error: 'Send the drawing as { fileBase64, mimeType }.' });
    }
    // ~8 MB of base64 — the same ceiling the PCB BOM import enforces. A
    // heavier drawing pack should be split or downscaled client-side.
    if (fileBase64.length > 11_000_000) {
      return res.status(413).json({ error: 'The drawing is too large (over ~8 MB). Split the PDF or downscale the image.' });
    }
    const ALLOWED_MIMES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    if (!ALLOWED_MIMES.includes(mimeType)) {
      return res.status(400).json({ error: 'Unsupported drawing format. Upload a PDF, PNG, JPEG or WebP.' });
    }
    const apiKey = resolveApiKey(req);
    if (!apiKey) return res.status(400).json({ error: 'No API key configured — add one in Settings.' });
    try {
      const client = makeAnthropic(apiKey, { userId: req.user.id, route: 'dfm-drawing-extract' });
      const raw = await extractDrawing(client, { base64: fileBase64, mimeType });
      const drawing = normalizeExtraction(raw);
      if (!drawing.ok) return res.status(422).json({ error: drawing.reason });
      res.json({ drawing });
    } catch (err) {
      res.status(500).json({ error: safeLlmError ? safeLlmError(err) : 'Drawing extraction failed. Please try again.' });
    }
  });

  /**
   * The pickers, served from the SAME tables the cost model uses.
   *
   * The Studio page used to hand-type a ten-material, six-process subset of
   * costing-engine.mjs and it drifted: two of its six processes were routed to
   * the wrong DFM rules and four fifths of the material list was missing. The
   * page now renders whatever this returns, so there is one list, not two.
   */
  app.get('/api/dfm/options', requireAuth, (_req, res) => {
    res.json(dfmOptions());
  });

  /** This ORG's rule overrides, alongside the published defaults. */
  app.get('/api/dfm/rule-overrides', requireAuth, (req, res) => {
    // A viewer may READ the standards their plant runs to. Only a member and
    // above may retune them — a quality engineer needs to see the threshold
    // without being able to move it.
    const sc = scope(req, 'viewer');
    if (!sc) return res.status(403).json({ error: 'You are not a member of that workspace.' });
    res.json({ orgId: sc.orgId, role: sc.role, overrides: overridesFor(sc.orgId) ?? {} });
  });

  /**
   * Set or clear one rule's company standard.
   *
   * A threshold of null clears the override and the published guideline returns.
   * Shape is validated against the rule it targets: a `between` rule takes a
   * two-number array and a comparison rule takes a number, and storing the wrong
   * shape would make the rule silently unevaluatable on every future part.
   */
  app.put('/api/dfm/rule-overrides/:ruleId', requireAuth, (req, res) => {
    if (!db) return res.status(503).json({ error: 'No database configured.' });
    const sc = scope(req, 'member');
    if (!sc) return res.status(403).json({ error: 'Only a member of this workspace can set a company standard.' });
    const rule = DFM_RULES.find(r => r.id === req.params.ruleId);
    if (!rule) return res.status(404).json({ error: `Unknown rule: ${req.params.ruleId}` });

    const { enabled = true, threshold = null, note = null } = req.body ?? {};
    if (threshold !== null && threshold !== undefined) {
      const wantsPair = rule.compare === 'between';
      const ok = wantsPair
        ? Array.isArray(threshold) && threshold.length === 2
          && threshold.every(v => Number.isFinite(Number(v))) && Number(threshold[0]) <= Number(threshold[1])
        : Number.isFinite(Number(threshold));
      if (!ok) {
        return res.status(400).json({
          error: wantsPair
            ? `"${rule.id}" is a range rule: give [min, max] with min <= max.`
            : `"${rule.id}" is a ${rule.compare} rule: give a single number.`,
        });
      }
    }
    const stored = threshold === null || threshold === undefined ? null
      : JSON.stringify(rule.compare === 'between' ? threshold.map(Number) : Number(threshold));
    try {
      // `user_id` is still written: WHO set a company standard is worth keeping
      // even once WHOSE it is has moved to the org.
      db.prepare(`INSERT INTO dfm_rule_overrides (org_id, user_id, rule_id, enabled, threshold, note, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(org_id, rule_id) DO UPDATE SET
                    enabled = excluded.enabled, threshold = excluded.threshold,
                    note = excluded.note, updated_at = excluded.updated_at,
                    user_id = excluded.user_id`)
        .run(sc.orgId, req.user.id, rule.id, enabled ? 1 : 0, stored,
             note ? String(note).slice(0, 500) : null, new Date().toISOString());
    } catch (e) {
      return res.status(500).json({ error: `Could not save: ${e.message}` });
    }
    res.json({ ok: true, orgId: sc.orgId, overrides: overridesFor(sc.orgId) ?? {} });
  });

  app.delete('/api/dfm/rule-overrides/:ruleId', requireAuth, (req, res) => {
    if (!db) return res.status(503).json({ error: 'No database configured.' });
    const sc = scope(req, 'member');
    if (!sc) return res.status(403).json({ error: 'Only a member of this workspace can clear a company standard.' });
    try {
      db.prepare('DELETE FROM dfm_rule_overrides WHERE org_id = ? AND rule_id = ?')
        .run(sc.orgId, req.params.ruleId);
    } catch { /* deleting something absent is not an error */ }
    res.json({ ok: true, orgId: sc.orgId, overrides: overridesFor(sc.orgId) ?? {} });
  });

  /** The catalogue, so the UI can show what will be checked and cite thresholds. */
  app.get('/api/dfm/rules', requireAuth, (_req, res) => {
    res.json({
      processFamilies: PROCESS_FAMILIES,
      rules: DFM_RULES.map(r => ({
        id: r.id, process: r.process, severity: r.severity, title: r.title,
        measure: r.measure, threshold: r.threshold, unit: r.unit,
        rationale: r.rationale, fix: r.fix, source: r.source, sourceStatus: r.sourceStatus,
      })),
      timeModel: { version: TIME_MODEL.version, basis: TIME_MODEL.basis },
      // Named so a reader can see the SHAPE of the gap, not just the rules that
      // exist. A catalogue that lists only what it covers invites the reader to
      // assume the rest was checked and passed.
      unwritten: UNWRITTEN_RULES,
    });
  });

  /** Single-part DFM: measure, apply the rules, price what the engines can. */
  app.post('/api/dfm/analyze', requireAuth, limit, upload.single('cadFile'), async (req, res) => {
    // ── THE 2D DRAWING, extracted earlier by /drawing-extract and reviewed
    // by the engineer. RE-NORMALIZED here, not trusted: the blob arrives
    // from the client and the API is reachable without the UI, so a tampered
    // or hand-built row gets the same clamps as a fresh extraction. The
    // client holds NORMALIZED rows (already millimetres), so units are
    // pinned to mm on the way back in — re-applying an inch conversion to
    // converted values would scale every band by 25.4 a second time.
    let drawing = null;
    if (req.body?.drawing) {
      let parsed;
      try { parsed = JSON.parse(req.body.drawing); } catch {
        return res.status(400).json({ error: 'The drawing field must be the JSON object returned by /api/dfm/drawing-extract.' });
      }
      const renorm = normalizeExtraction({
        units: 'mm',
        readability: parsed?.readability,
        dimensions: (Array.isArray(parsed?.dimensions) ? parsed.dimensions : []).map((d) => ({
          nominal: d?.nominalMm, totalBand: d?.bandMm, type: d?.type,
          toleranced: d?.toleranced, sheet: d?.sheet, zone: d?.zone, sourceText: d?.sourceText,
        })),
        gdt: (Array.isArray(parsed?.gdt) ? parsed.gdt : []).map((g) => ({
          symbol: g?.symbol, tolerance: g?.toleranceMm, datums: g?.datums, sourceText: g?.sourceText,
        })),
        roughness: (Array.isArray(parsed?.roughness) ? parsed.roughness : []).map((r) => ({
          raUm: r?.raUm, scope: r?.scope, sourceText: r?.sourceText,
        })),
        titleBlock: parsed?.titleBlock,
        overall: parsed?.overall
          ? { width: parsed.overall.widthMm, height: parsed.overall.heightMm, thickness: parsed.overall.thicknessMm }
          : undefined,
        notes: parsed?.notes,
        pageCount: parsed?.pageCount,
      });
      if (!renorm.ok) return res.status(400).json({ error: 'The drawing data could not be read.' });
      // Keep the ORIGINAL units label for display — the values are mm either
      // way, and the report should still say what the drawing was drawn in.
      renorm.units = ['mm', 'inch', 'unknown'].includes(parsed?.units) ? parsed.units : 'unknown';
      drawing = renorm;
    }
    const drawingOnly = !req.file && !!drawing;
    if (!drawingOnly && rejectUnsupported(req, res)) return;

    // STREAM THE STAGES THAT GENUINELY COMPLETE, when the caller asks for it.
    // A real part takes 5-30 s and the page had nothing to show for it but a
    // spinner. The engine already announces each phase the moment it finishes,
    // so this forwards those events and then sends the finished analysis as a
    // final `result` event. Same handler, same code path, same output — a plain
    // JSON caller (and the benchmark) sees exactly what it saw before.
    const useSSE = String(req.headers.accept || '').includes('text/event-stream');
    if (useSSE) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
    }
    const emit = (data) => {
      if (useSSE) { try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch { /* closed */ } }
    };
    // A stage that arrives after the client has gone must not throw.
    //
    // RESPONSE close, not REQUEST close. `req.on('close')` fires when the
    // request STREAM ends — and for a multipart upload that is the moment multer
    // finishes reading the body, long before the client goes anywhere. Watching
    // it marked every caller as disconnected immediately and silently swallowed
    // every stage event, while the final result still went out. The symptom was
    // a stream that worked and showed no progress.
    let clientGone = false;
    if (useSSE) res.on('close', () => { clientGone = true; });

    // A DRAW DIRECTION THE ENGINEER PINNED. The sweep picks the axis with the
    // least undercut area, which is the right default and the wrong answer when
    // the tool split is already decided — by an existing die, a mating part, or
    // a foundry who has said where the parting line goes. Measuring draft along
    // an axis the part will never be drawn on produces findings for a tool that
    // does not exist.
    let pinnedDraw = null;
    try {
      const raw = req.body?.drawDirection ? JSON.parse(req.body.drawDirection) : null;
      if (Array.isArray(raw) && raw.length === 3 && raw.every(v => Number.isFinite(Number(v)))) {
        pinnedDraw = raw.map(Number);
      }
    } catch { pinnedDraw = null; }

    let geo;
    let drawingCheck;
    let modelPmi = null;
    let drawingApplied = [];
    const drawingInputs = drawing ? drawingToRuleInputs(drawing) : null;
    if (drawingOnly) {
      // No 3D model: the drawing's toleranced callouts become the part
      // evidence, and every rule that reads measured geometry will say so
      // instead of judging. This is the quote-stage case — the drawing
      // exists, the model does not.
      geo = geoFromDrawing(drawing, String(req.body?.partName || '').slice(0, 120) || undefined);
      if (drawingInputs.pmiDimensions.length) drawingApplied.push(`${drawingInputs.pmiDimensions.length} toleranced dimensions`);
      emit({ type: 'stage', stage: 'drawing-only', dimensions: drawingInputs.pmiDimensions.length });
    } else {
      geo = await analyzeGeometry(
        req.file.buffer, req.file.originalname, GEO_TIMEOUT_MS,
        useSSE ? (ev) => { if (!clientGone) emit({ type: 'stage', ...ev }); } : null,
        pinnedDraw);
      if (geo.status !== 'success') {
        if (useSSE) { emit({ type: 'error', error: geo.error }); return res.end(); }
        return res.status(422).json({ error: geo.error });
      }
      if (drawing) {
        // BOTH documents present: reconcile them deterministically first, so
        // the provenance note on every judged dimension can say how many of
        // the drawing's callouts the model actually confirms — then the
        // drawing's rows replace the pmi block (the drawing is the document
        // that carries tolerances) and the model's own PMI, if it had any,
        // is kept on the payload rather than silently discarded.
        drawingCheck = crossCheckDrawing(drawing, geo);
        const c = drawingCheck?.counts;
        const sourceNote = c
          ? `read from the uploaded 2D drawing by AI vision; ${c.confirmed} of ${drawingCheck.rows.length} dimensions confirmed against the 3D model within their own bands${c.conflict ? `, ${c.conflict} in CONFLICT with it` : ''}`
          : undefined;
        const merged = mergeDrawingIntoGeo(geo, drawing, sourceNote ? { sourceNote } : {});
        modelPmi = merged.previousPmi?.present ? merged.previousPmi : null;
        geo = merged.geo;
        drawingApplied = merged.applied;
        emit({ type: 'stage', stage: 'drawing-merge',
          dimensions: drawingInputs.pmiDimensions.length,
          confirmed: c?.confirmed ?? 0, conflicts: c?.conflict ?? 0 });
      }
    }

    // WHICH RULE FAMILY JUDGES THIS PART.
    //
    // The mapping used to be a six-entry literal in this file, and two of its
    // entries were wrong: "Gravity Die Casting" was routed to the HPDC rules
    // (which want a 1.0-3.5 mm wall, against gravity's 3-8) and "Sand Casting"
    // mapped to nothing, so it fell through to a speculative sweep of all
    // families. dfm-process-registry.mjs now derives the routing from the same
    // process table the cost model uses, so the two halves cannot drift again.
    const explicit = String(req.body?.process || '').trim();
    const chosenProcess = String(req.body?.costProcess || '').trim();
    const material = req.body?.material || undefined;
    const selected = familyForSelection({ process: chosenProcess, dfmProcess: explicit });

    // What the GEOMETRY says, independently of what anybody chose. Used to pick
    // the family when nobody named one, and to CONTRADICT one when it was named
    // and the geometry disagrees. It never silently overrides a choice.
    // The material is part of the evidence: draft says the part leaves a tool,
    // and the material says WHICH tool. Withholding it left the inference silent
    // on every casting and moulding.
    const inferred = inferProcessFamily(geo, { material });
    const measuredOnly = inferred.confidence === 'measured' ? inferred.family : null;
    const family = selected.family || measuredOnly;
    const conflict = processFamilyConflict(selected.family, inferred);

    // The ALLOY decides the threshold wherever it matters — 6061-T6 needs 3 r/t
    // where mild steel needs 1, zinc fills a 0.6 mm wall where aluminium needs
    // 1.5. Passing it through is what makes the finding specific rather than
    // generic, and every finding records which basis it got.
    // The tightest band on the drawing, when the engineer types it. Almost no
    // STEP carries semantic PMI, so without this every tolerance-capability rule
    // in the catalogue abstains on every part — measured at 93 abstentions over
    // a 93-part commodity sweep. Declared, labelled as declared, and always
    // outranked by real PMI when the file has it.
    const declaredToleranceMm = (() => {
      const v = Number(req.body?.tightestToleranceMm);
      return Number.isFinite(v) && v > 0 ? v : undefined;
    })();
    // TWO MORE DECLARED INPUTS, on the same footing as the tolerance above.
    //
    // Neither can be measured from one STEP file — a solid model does not know
    // what a machinist will take off it, nor what finish the drawing asks for.
    // Declared, labelled as declared, and ABSENT when the engineer has not
    // typed one, so the rules that need them abstain rather than pass on a
    // default. NADCA gives both a hard limit worth checking: the chilled skin
    // is only 0.4-0.5 mm deep, and each alloy holds a published roughness.
    const declaredMachiningStockMm = (() => {
      const v = Number(req.body?.machiningStockMm);
      return Number.isFinite(v) && v >= 0 ? v : undefined;
    })();
    const declaredSurfaceRoughnessUin = (() => {
      const v = Number(req.body?.surfaceRoughnessUin);
      return Number.isFinite(v) && v > 0 ? v : undefined;
    })();
    // THE DRAWING FILLS WHAT NOBODY TYPED, and only that. A typed value is a
    // deliberate act and wins; a drawing value is labelled as drawing-read.
    // Each substitution is recorded so the payload can say which inputs the
    // drawing supplied rather than the engineer.
    const drawingFlatnessMm = drawingInputs?.flatnessMm;
    const drawingRoughnessUin = drawingInputs?.surfaceRoughnessUin;
    const ruleOpts = {
      material,
      overrides: overridesFor(scope(req, 'viewer')?.orgId),
      declaredToleranceMm,
      machiningStockMm: declaredMachiningStockMm,
      surfaceRoughnessUin: declaredSurfaceRoughnessUin ?? drawingRoughnessUin,
      // NADCA #402 grade: Standard is what a first quotation assumes, so it is
      // the default; Precision is a die-cost decision the engineer declares.
      toleranceGrade: req.body?.toleranceGrade === 'precision' ? 'precision' : 'standard',
      // SFSA 2000 production series: short is the first-article assumption
      // (no pattern re-engineering has centred the dimensions yet), long is a
      // declaration that tooling has been iterated - it LOOSENS nothing by
      // default and tightens the judged CT grade by one when declared.
      productionSeries: req.body?.productionSeries === 'long' ? 'long' : 'short',
      // Declared flatness callout, mm; the drawing's tightest flatness frame
      // fills in when nothing was typed. Absent when neither exists - the
      // flatness rule abstains rather than passing on a default.
      flatnessMm: (() => {
        const v = Number(req.body?.flatnessMm);
        return Number.isFinite(v) && v > 0 ? v : drawingFlatnessMm;
      })(),
      // Mass for the SFSA capability models, derived from the kernel-measured
      // volume and the chosen material's density - never typed.
      weightKg: (() => {
        const d = MATERIALS[req.body?.material]?.density;
        return d && geo.volume?.cm3 > 0 ? (geo.volume.cm3 * d) / 1000 : undefined;
      })(),
    };
    // Record which inputs the drawing supplied INSTEAD of the engineer — the
    // payload prints this, so a report never implies a person typed a number
    // the drawing carried.
    if (drawing) {
      if (!(Number(req.body?.flatnessMm) > 0) && drawingFlatnessMm !== undefined) drawingApplied.push('flatness callout');
      if (!(Number(req.body?.surfaceRoughnessUin) > 0) && drawingRoughnessUin !== undefined) drawingApplied.push('surface roughness');
    }
    const ruleResults = family ? [runDfmRules(geo, family, ruleOpts)] : runAllDfmRules(geo, ruleOpts);
    const familyBasis = selected.basis === 'chosen'
      ? (selected.chosenProcess ? `chosen — ${selected.chosenProcess}` : 'chosen')
      : selected.basis === 'no-rules' ? selected.reason
        : measuredOnly ? `measured from the geometry — ${inferred.evidence.join('; ')}`
          : 'no process given — every family run speculatively, so findings may not all apply';

    // An impossible material/process pair should never have been selectable, but
    // the API is reachable without the UI, so it is checked here too.
    let materialProcessConflict = null;
    if (material && chosenProcess) {
      const allowed = processesForMaterial(material).some(p => p.name === chosenProcess);
      if (!allowed) {
        materialProcessConflict = {
          material, process: chosenProcess,
          message: `${chosenProcess} cannot be used with ${material}. The cost model lists this process as accepting only certain material families, and ${material} is not one of them — so every threshold below was chosen for a route this part cannot take.`,
        };
      }
    }

    // Mass is derived from the kernel-measured volume and the chosen material,
    // never taken from the request: a typed weight could silently disagree with
    // the geometry every finding is based on.
    // Density read from the costing engine's own MATERIALS table rather than a
    // local copy, so the two can never drift apart.
    const density = MATERIALS[req.body?.material]?.density;
    const weightKg = density && geo.volume?.cm3 > 0
      ? (geo.volume.cm3 * density) / 1000
      : undefined;

    const ctx = {
      material: req.body?.material || undefined,
      process: req.body?.costProcess || undefined,
      region: req.body?.region || 'Germany',
      annualVolume: numOr(req.body?.annualVolume, 50000),
      weightKg,
      toleranceClass: req.body?.toleranceClass || undefined,
      surfaceFinish: req.body?.surfaceFinish || undefined,
      geometry: {
        boundingBoxMm: {
          x: geo.boundingBox?.xMm, y: geo.boundingBox?.yMm, z: geo.boundingBox?.zMm,
        },
        partVolumeCm3: geo.volume?.cm3,
        surfaceAreaCm2: geo.surfaceArea?.cm2,
        holes: (geo.featureTable || []).filter(f => f.kind === 'hole')
          .map(f => ({ diaMm: f.diaMm, depthMm: f.depthMm, count: f.count })),
        setupCount: geo.setupAnalysis?.estimatedSetupCount,
      },
      // Recognised bends, so the stamping engine can be driven from measured
      // geometry rather than its default of 2 bends.
      sheet: geo.dfm?.sheetMetal?.isSheetMetal ? geo.dfm.sheetMetal : undefined,
      // Recognised ribs and the wall they stand on, so the material an
      // over-thick rib carries can be priced from measured volume rather than
      // described in words.
      ribs: geo.dfm?.features?.ribs,
      nominalWallMm: geo.dfm?.wallThickness?.p50Mm,
      // The measured spread of the section. A "reduce the wall to 3.5 mm"
      // saving is only meaningful when there IS a nominal wall to reduce; on a
      // chunky bracket whose section runs 4.95 to 44 mm the median is not a
      // wall at all, and pricing it as one produced a EUR 328,800/yr headline
      // from a category error. The pricer needs this to refuse.
      wallSpreadRatio: geo.dfm?.wallThickness?.spreadRatio,
    };

    // Every way the analysis was LIMITED, gathered in one place. These were all
    // produced by the engine and none reached a user: a part drawn in metres
    // returned HTTP 200 and a confident report claiming a 0.05 mm wall with
    // three "wall below minimum" findings, and the warning was invisible.
    const limits = [];
    if (geo.unitWarning) {
      limits.push({ kind: 'units', severity: 'blocking', message: geo.unitWarning });
    }
    if (geo.assemblyWarning) {
      limits.push({ kind: 'assembly', severity: 'warning', message: geo.assemblyWarning });
    }
    if (geo.dfm?.tessellation?.truncated) {
      limits.push({
        kind: 'tessellation', severity: 'warning',
        message: `The mesh hit its ${geo.dfm.tessellation.triangles} triangle budget, so draft, undercut and wall figures cover only part of the model.`,
      });
    }
    if (geo.dfm?.budgetExceeded) {
      limits.push({
        kind: 'timeBudget', severity: 'warning',
        message: geo.dfm.budgetExceeded.message,
      });
    }
    if (geo.dfm?.draft?.drawDirectionAmbiguous) {
      // Two parting directions within a couple of points is a DESIGN decision,
      // not something the geometry settles. Silently picking one and reporting
      // its draft percentages as fact hides a choice the toolmaker owns.
      limits.push({
        kind: 'drawDirection', severity: 'warning',
        message: `Two draw directions score within ${geo.dfm.draft.drawDirectionMarginPct} percentage points of each other on undercut area, so the parting direction is a design decision rather than a geometric conclusion. The draft figures below are for the one shown; see the alternatives before treating them as settled.`,
      });
    }
    if (geo.dfm?.draft?.sampled) {
      // A percentage that quietly changes from a census to an estimate as parts
      // get bigger is the sort of number this feature exists not to produce.
      limits.push({
        kind: 'sampling', severity: 'warning',
        message: `Draft and undercut areas are estimated from ${geo.dfm.draft.raysCast} visibility tests across ${geo.dfm.draft.trianglesTotal} triangles, not from every one. The undercut count is stable under sampling; the "% below minimum draft" figure carries a few points of uncertainty.`,
      });
    }
    if (geo.dfm && !geo.dfm.wallThickness && geo.dfm.wallThicknessNote) {
      limits.push({ kind: 'wallThickness', severity: 'warning', message: geo.dfm.wallThicknessNote });
    }
    // ── HOW THE DRAWING LIMITED OR CONTRADICTED THE ANALYSIS ─────────────────
    if (drawingOnly) {
      limits.push({
        kind: 'drawingOnly', severity: 'warning',
        message: 'Drawing-only analysis: no 3D model was uploaded. Tolerance, flatness and roughness callouts are judged from the drawing; every rule that reads measured 3D geometry (walls, draft, features, undercuts) reports NOT EVALUATED below rather than guessing.',
      });
    }
    if (drawing && drawing.units === 'unknown') {
      limits.push({
        kind: 'drawingUnits', severity: 'warning',
        message: 'The drawing does not state its units, so its values were taken as millimetres. If it is an inch drawing, every drawing-read figure here is 25.4x too small — check the title block.',
      });
    }
    if (drawingCheck?.unitsSuspect) {
      limits.push({
        kind: 'drawingUnits', severity: 'warning',
        message: 'The drawing\'s stated overall size is roughly 25x smaller than the 3D model — an inch drawing read as millimetres looks exactly like this. Every drawing-read figure below is suspect until the units are confirmed.',
      });
    }
    {
      const conflicts = (drawingCheck?.rows || []).filter((r) => r.status === 'conflict');
      for (const row of conflicts.slice(0, 5)) {
        limits.push({
          kind: 'drawingConflict', severity: 'warning',
          message: `Drawing vs model: "${row.sourceText}" (${row.nominalMm} mm) does not match the model's ${row.candidate.kind} of ${row.candidate.valueMm} mm — ${row.candidate.deltaMm} mm apart, outside ${row.bandMm ? 'its own tolerance band' : 'the default window'}. One of the two documents is wrong, and this tool cannot say which.`,
        });
      }
      if (conflicts.length > 5) {
        limits.push({
          kind: 'drawingConflict', severity: 'warning',
          message: `…and ${conflicts.length - 5} more drawing-vs-model conflicts — see the drawing check table.`,
        });
      }
    }
    if (modelPmi && Number.isFinite(Number(modelPmi.tightestToleranceMm))
      && Number.isFinite(Number(geo.dfm?.pmi?.tightestToleranceMm))
      && Math.abs(Number(modelPmi.tightestToleranceMm) - Number(geo.dfm.pmi.tightestToleranceMm)) > 1e-9) {
      limits.push({
        kind: 'drawingVsModelPmi', severity: 'warning',
        message: `The model carries its own AP242 PMI (tightest band ${modelPmi.tightestToleranceMm} mm) and the drawing disagrees (tightest ${geo.dfm.pmi.tightestToleranceMm} mm). The drawing governs the tolerance judgments below — it is the document that carries tolerances — and the model's PMI is kept on this payload, not discarded.`,
      });
    }

    // A unit error invalidates every dimensional threshold. Findings computed at
    // the wrong scale are worse than no findings, so they are withheld and the
    // reason is stated — the same discipline the rule engine already applies to
    // measurements it does not have.
    const unitsSuspect = limits.some(l => l.kind === 'units');
    const results = ruleResults.map(r => {
      if (unitsSuspect) {
        return {
          ...r,
          findings: [], passed: [],
          notEvaluated: [...r.findings, ...r.passed, ...r.notEvaluated].map(f => ({
            ...f, status: 'not-evaluated',
            reason: 'Withheld: the model appears to be in metres, not millimetres, so every dimensional threshold would be compared against the wrong scale.',
          })),
          evaluatedCount: 0, coveragePct: 0, score: null,
          impact: { pricedCount: 0, unpricedCount: 0, perPartEur: 0, annualEur: 0, caveat: null },
        };
      }
      const priced = priceFindings(r.findings, ctx);
      const mapped = { ...r, findings: priced, impact: summarisePricedImpact(priced) };
      // In drawing-only mode every abstention gets the mode named in its
      // reason — a reader must be able to tell "the geometry had no ribs"
      // apart from "no geometry was ever uploaded".
      if (drawingOnly) {
        mapped.notEvaluated = mapped.notEvaluated.map((f) => ({
          ...f,
          reason: `Drawing-only analysis (no 3D model uploaded): ${f.reason ?? 'this rule reads measured 3D geometry.'}`,
        }));
      }
      return mapped;
    });

    const payload = {
      // The engine names the part after the file it was handed, which is the
      // bridge's temp file (cv-cad-3e46530a…). Use the name the user actually
      // uploaded, or their report is titled with a random hex string.
      partName: req.file
        ? (String(req.file.originalname || '').replace(/\.[^.]+$/, '') || geo.partName)
        : geo.partName,
      geometry: {
        boundingBox: geo.boundingBox, volume: geo.volume, surfaceArea: geo.surfaceArea,
        fillRatio: geo.fillRatio, faces: geo.faces, weights: geo.weights,
        featureTable: geo.featureTable, wallThickness: geo.wallThickness,
        setupAnalysis: geo.setupAnalysis,
        assemblyWarning: geo.assemblyWarning, unitWarning: geo.unitWarning,
      },
      dfm: geo.dfm,
      results,
      analysisLimits: limits,
      // ── THE 2D DRAWING'S SIDE OF THE STORY ───────────────────────────────
      // The normalized extraction (as reviewed by the engineer), the
      // deterministic reconciliation against the model, the model's own PMI
      // when the drawing displaced it, and which inputs the drawing supplied.
      drawing: drawing ?? null,
      drawingCheck: drawingCheck ?? null,
      modelPmi,
      drawingApplied: drawing ? drawingApplied : null,
      processFamily: family || null,
      processFamilyBasis: familyBasis,
      // Published whether or not it was used, so a reader can always see what
      // the geometry itself says about how this part is made.
      measuredProcess: inferred,
      processConflict: conflict,
      materialProcessConflict,
      // The alloy the thresholds were resolved against, so the report can say
      // whether a number was tuned to this material or is the generic band.
      // Which company standards were in force for this analysis, so a report can
      // be reproduced later and a reader can see the catalogue was not the stock
      // one. A retuned threshold that leaves no trace is indistinguishable from
      // a published guideline.
      ruleOverrides: ruleOpts.overrides ?? null,
      // ── WHERE THE MONEY GOES on the route the user actually chose ────────
      //
      // The tool priced FINDINGS and priced ALTERNATIVE ROUTES, and never once
      // showed the cost structure of the route in hand — which is the first
      // thing a cost engineer asks of any part: what is the biggest adder,
      // material or machine or tooling? The engine computed this all along;
      // it just never left the routes table. Sorted largest-first so the page
      // can name the dominant driver without arithmetic.
      costDrivers: (() => {
        const proc = req.body?.costProcess || req.body?.process;
        if (!material || !proc || !(weightKg > 0)) return null;
        try {
          const c = computeShouldCost(
            { material, process: proc, weightKg, annualVolume: numOr(req.body?.annualVolume, 50000), region: req.body?.region || 'Germany' },
            {}, null, null);
          const rows = Object.entries(c.breakdown || {})
            .map(([k, v]) => ({ driver: k, eur: v.value, pct: v.pct }))
            .sort((a, b) => b.eur - a.eur);
          return {
            process: proc,
            totalEur: c.totalShouldCost,
            rows,
            dominant: rows[0] ?? null,
            // The physical levers behind the rows, so "material is 35%" can be
            // followed by WHY: buy-to-fly mass, cycle seconds, scrap.
            inputMassKg: c.drivers?.inputMassKg ?? null,
            cycleSecPerPart: c.drivers?.cycleSecPerPart ?? null,
            scrapPct: c.drivers?.scrapPct ?? null,
            toolingTotalEur: c.drivers?.toolingTotal ?? null,
            basis: 'computeShouldCost on the chosen route — the same engine that prices the alternatives table, so the rows reconcile.',
          };
        } catch { return null; }
      })(),
      // ── THE SHEET-FORMING FIGURES ────────────────────────────────────────
      //
      // Press tonnage, strip utilisation, bend allowance and the draw-stage
      // count are computed by the measure pass and, until now, went nowhere: a
      // rule reads a ratio, and the numbers a stamping engineer actually asks
      // for — "what press does this need", "how much of the coil ends up in the
      // part" — never left the engine. They are figures, not verdicts, so they
      // travel beside the findings rather than as findings.
      // Named `sheetForming` when it only carried press tonnage and strip layout.
      // It now also carries the NADCA die-casting figures, so a die casting
      // reaches this block with no sheet data at all and must still keep it.
      sheetForming: (() => {
        const m = extractMeasures(geo, ruleOpts);
        const out = {};
        for (const [k, v] of Object.entries(m)) {
          if (k.startsWith('_') && v && typeof v === 'object'
              && /^_(press|stripLayout|bendAllowance|drawStages|springback|bendLimit|bendMaxLimit|punchLimit)$/.test(k)) {
            out[k.slice(1)] = v;
          }
        }
        if (m._bookBasis) out.unavailable = m._bookBasis;
        // The NADCA figures a die-casting engineer wants on the page whether or
        // not a threshold applies to them: the general-note draft their drawing
        // should carry, the worst bore and what it needed at its own depth, the
        // fillet requirement, and the skin the machining stock has to respect.
        for (const k of ['_nadcaDraft', '_nadcaCoredHole', '_nadcaFillet', '_nadcaBoss', '_nadcaSkin', '_nadcaRoughness',
          '_nadca402Summary', '_nadca402Tolerance', '_nadca402Flatness',
          // The SFSA steel-casting figures, same contract: what the handbook
          // asks of THIS part, printed whether or not a rule fired.
          '_sfsaMinSection', '_sfsaJunctionFillet', '_sfsaRibNeutrality', '_sfsaBoss', '_sfsaCoreDia',
          '_sfsaCtSummary', '_sfsaCapabilityModel', '_sfsaRma', '_sfsaWeightTolerance',
          '_sfsaSandTolerance', '_sfsaSandFlatness',
          // The DuPont moulding figures, same contract.
          '_resinDraft', '_resinFillet', '_dupontBoss',
          // The ISO 8062-4 figures: the permanent-mould tolerance verdict at
          // the worst dimension, and the Table 4-8 draft requirement per
          // casting family at the part's own draw extent.
          '_iso8062PmTolerance', '_iso8062Draft',
          // The DIN 16742 figures: the moulded-part tolerance verdict, the
          // rotomoulding TG9 verdict, and the what-the-standard-promises
          // summary at the part's own size and resin.
          '_din16742Tolerance', '_din16742RmTolerance', '_din16742Summary']) {
          if (m[k]) out[k.slice(1)] = m[k];
        }
        if (m._nadcaBasis) out.nadcaUnavailable = m._nadcaBasis;
        // FORMING CONTENT LIVES HERE, NOT ON A FINDING. It used to be attached
        // to `sm-bend-radius`, where a figure that measures "all the bends
        // against a flat blank" read as the saving from opening one radius. It
        // is a property of the part, so it is reported with the press tonnage
        // and the strip layout, which are the other properties of the part.
        const forming = formingContent(ctx);
        if (forming) out.formingContent = forming;
        return Object.keys(out).length ? out : null;
      })(),
      // Counted here, beside the catalogue that produced the findings, so the
      // report's provenance sentence can never drift from the ruleset again.
      catalogue: {
        total: DFM_RULES.length,
        byGrade: DFM_RULES.reduce((acc, r) => {
          const g = r.sourceStatus || 'industry-consensus';
          acc[g] = (acc[g] ?? 0) + 1;
          return acc;
        }, {}),
      },
      material: material || null,
      materialFamily: material ? familyOfMaterial(material) ?? null : null,
      // EVERY VIABLE ROUTE, not just the one that was chosen. The report answers
      // "is this part good for the process you named"; the question a cost
      // engineer actually arrives with is "which process should make it". Both
      // are now on the page, from one measurement of the geometry.
      routes: weightKg > 0 && material
        ? compareRoutes(geo, { material, region: req.body?.region || 'Germany',
            annualVolume: numOr(req.body?.annualVolume, 50000), weightKg,
            // So the table can mark the row the user is standing on and price
            // every other row as a difference from it.
            chosenProcess: chosenProcess || null })
        : null,
      // Named when the chosen process shapes nothing, so the reader is told why
      // there are no findings instead of seeing an empty report.
      noDfmRulesReason: selected.basis === 'no-rules' ? selected.reason : null,
      analysedAt: new Date().toISOString(),
    };
    if (useSSE) { emit({ type: 'result', result: payload }); return res.end(); }
    res.json(payload);
  });

  /**
   * BATCH: many parts, one ranked answer.
   *
   * A plant head does not care about one bracket; they care about which twenty
   * of five hundred are worst. The tool was strictly one-part-at-a-time, so the
   * portfolio question could only be answered by uploading parts one by one and
   * transcribing the results.
   *
   * Parts are analysed SEQUENTIALLY on purpose. Each one forks a Python OCP
   * process and the bridge already caps concurrency; firing twenty at once would
   * queue behind that cap anyway while holding twenty file buffers in memory. A
   * part that fails keeps its row with the reason — a batch table that silently
   * drops what it could not read reads as "these are your parts".
   */
  app.post('/api/dfm/batch', requireAuth, limit, upload.array('cadFiles', BATCH_MAX), async (req, res) => {
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) return res.status(400).json({ error: 'No files uploaded' });

    const material = req.body?.material || undefined;
    const region = req.body?.region || 'Germany';
    const annualVolume = numOr(req.body?.annualVolume, 50000);
    const chosenProcess = String(req.body?.costProcess || '').trim();
    const overrides = overridesFor(scope(req, 'viewer')?.orgId);
    const density = MATERIALS[material]?.density;

    const rows = [];
    for (const f of files) {
      const ext = extOf(f.originalname);
      const row = { fileName: f.originalname, partName: String(f.originalname).replace(/\.[^.]+$/, '') };
      if (!BREP_FORMATS.includes(ext)) {
        row.error = PROPRIETARY.includes(ext)
          ? `.${ext} is a proprietary format that needs a licensed kernel — export as STEP.`
          : 'DFM analysis needs B-rep geometry (STEP or IGES).';
        rows.push(row);
        continue;
      }
      let geo;
      try {
        geo = await analyzeGeometry(f.buffer, f.originalname, GEO_TIMEOUT_MS);
      } catch (e) {
        row.error = `Geometry engine failed: ${e.message}`;
        rows.push(row);
        continue;
      }
      if (geo.status !== 'success') { row.error = geo.error; rows.push(row); continue; }

      row.volumeCm3 = geo.volume?.cm3 ?? null;
      row.weightKg = density && geo.volume?.cm3 > 0
        ? Math.round((geo.volume.cm3 * density) / 10) / 100 : null;
      row.wallP50Mm = geo.dfm?.wallThickness?.p50Mm ?? null;
      row.undercutRegions = geo.dfm?.draft?.undercutFaceCount ?? null;

      // The material is part of the evidence: draft says the part leaves a tool,
    // and the material says WHICH tool. Withholding it left the inference silent
    // on every casting and moulding.
    const inferred = inferProcessFamily(geo, { material });
      const selected = familyForSelection({ process: chosenProcess });
      const family = selected.family
        || (inferred.confidence === 'measured' ? inferred.family : null);
      row.measuredProcess = inferred.family;
      row.processFamily = family;
      if (family) {
        const r = runDfmRules(geo, family, { material, overrides });
        row.processName = r.processName;
        row.score = r.score;
        row.coveragePct = r.coveragePct;
        row.findingCount = r.findings.length;
        row.highSeverityCount = r.findings.filter(x => x.severity === 'high').length;
        row.worstFinding = r.findings[0]?.title ?? null;
      } else {
        row.scoreReason = 'No process chosen and the geometry does not settle it, so this part was measured but not judged.';
      }
      // The cheapest viable route, which is the one number that makes a
      // portfolio table actionable rather than merely a ranking of badness.
      if (material && row.weightKg > 0) {
        const { routes } = compareRoutes(geo, {
          material, region, annualVolume, weightKg: row.weightKg,
          chosenProcess: chosenProcess || null,
        });
        // What switching would actually be worth on THIS part, rather than a
        // cheapest-route name the reader has to price against their own by hand.
        const chosenRow = routes.find(r2 => r2.isChosen) ?? null;
        row.chosenRoutePieceEur = chosenRow?.piecePriceEur ?? null;
        const priced = rankRoutes(routes, 'piecePriceEur').filter(r2 => Number.isFinite(r2.piecePriceEur));
        row.bestRoute = priced[0] ? { process: priced[0].process, piecePriceEur: priced[0].piecePriceEur, score: priced[0].score } : null;
        row.routeCount = routes.length;
      }
      rows.push(row);
    }

    res.json({
      parts: rows,
      analysedAt: new Date().toISOString(),
      material: material || null,
      basis: 'Each part measured independently by the same kernel and judged by the same rule family. Parts that could not be read keep their row with the reason rather than being dropped.',
    });
  });

  /** Assembly DFA: decompose, then score. */
  app.post('/api/dfm/dfa', requireAuth, limit, upload.single('cadFile'), async (req, res) => {
    if (rejectUnsupported(req, res)) return;
    const decomposition = await decomposeAssembly(req.file.buffer, req.file.originalname);
    if (decomposition.status !== 'success') {
      return res.status(422).json({ error: decomposition.error });
    }
    let parsed = {};
    try {
      parsed = req.body?.options ? JSON.parse(req.body.options) : {};
    } catch {
      return res.status(400).json({ error: 'options must be valid JSON' });
    }
    let dfa;
    try {
      dfa = analyseDfa(decomposition, {
        density: numOr(parsed.density, undefined),
        densityByIndex: parsed.densityByIndex,
        answers: parsed.answers,
        securingByIndex: parsed.securingByIndex,
        insertionFlags: parsed.insertionFlags,
        // Region drives the labour rate from the same REGIONS table the costing
        // engine uses. A DFA costed at German rates for an Indian plant is a
        // wrong number, not a rough one. An explicit rate still wins.
        labourRateEurPerHr: numOr(parsed.labourRateEurPerHr,
          REGIONS[parsed.region]?.labour ?? undefined),
        calibration: numOr(parsed.calibration, 1),
      });
    } catch (e) {
      return res.status(422).json({ error: e.message });
    }
    const dfaLimits = [];
    if (decomposition.solidCount === 1) {
      dfaLimits.push({
        kind: 'singleSolid', severity: 'blocking',
        message: 'This file contains a single solid, so there is no assembly to analyse. DFA needs a multi-part STEP assembly.',
      });
    }
    if (decomposition.symmetryMeasured === false) {
      // The count matters: symmetry now degrades PER SOLID against a wall-clock
      // budget rather than being all-or-nothing, so "not measured" usually means
      // "not measured on some of them" and the reader needs to know how many.
      const done = decomposition.symmetryMeasuredCount ?? 0;
      dfaLimits.push({
        kind: 'symmetry', severity: 'warning',
        message: `Symmetry was measured on ${done} of ${decomposition.solidCount} solids — the rest ran out of the analysis budget or were too complex to test. Handling times for the unmeasured parts carry no orientation term, and each one says so in its own row.`,
      });
    }
    if (decomposition.contactsTruncated) {
      dfaLimits.push({
        kind: 'contacts', severity: 'warning',
        message: 'Contact detection hit its pair budget, so the part-adjacency list is incomplete.',
      });
    }
    res.json({ decomposition, dfa, analysisLimits: dfaLimits, analysedAt: new Date().toISOString() });
  });
}
