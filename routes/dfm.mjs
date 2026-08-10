// ─────────────────────────────────────────────────────────────────────────────
// DFM / DFA Studio routes.
//
//   POST /api/dfm/analyze   part file  → measured geometry + rule findings +
//                                        priced cost impact
//   POST /api/dfm/dfa       assembly   → decomposition + DFA analysis
//   GET  /api/dfm/rules     the rule catalogue (thresholds + sources), so the UI
//                           can show what WILL be checked before anything is run
//
// Every number these return comes from a deterministic engine. Nothing here
// calls an LLM: the AI's role in this feature is narration on top of a finished
// analysis, and it is deliberately not on the path that produces the figures.
// ─────────────────────────────────────────────────────────────────────────────
import multer from 'multer';
import { analyzeGeometry, decomposeAssembly } from '../cad-engine/cad-geometry-bridge.mjs';
import { runDfmRules, runAllDfmRules, inferProcessFamily, processFamilyConflict } from '../dfm-rules.mjs';
import {
  dfmOptions, familyForSelection, familyOfMaterial, processesForMaterial,
} from '../dfm-process-registry.mjs';
import { compareRoutes, rankRoutes } from '../dfm-routing.mjs';
import { priceFindings, summarisePricedImpact } from '../dfm-cost-impact.mjs';
import { DFM_RULES, PROCESS_FAMILIES, UNWRITTEN_RULES } from '../dfm-rule-catalogue.mjs';
import { analyseDfa } from '../dfa-engine.mjs';
import { TIME_MODEL } from '../dfa-time-model.mjs';
import { MATERIALS, REGIONS } from '../costing-engine.mjs';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

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

export function registerDfmRoutes(app, { requireAuth, rateLimit, db }) {
  // ── Company standards ──────────────────────────────────────────────────────
  // A plant's own guideline outranks a published one, and this is how DFMPro
  // gets bought: an organisation encodes ITS standards rather than accepting a
  // vendor's. The catalogue is already pure data, so this is storage, not an
  // engine change. Per-user rather than global — one workspace retuning a
  // threshold must not silently change everyone else's reports.
  try {
    db?.exec(`CREATE TABLE IF NOT EXISTS dfm_rule_overrides (
      user_id    TEXT NOT NULL,
      rule_id    TEXT NOT NULL,
      enabled    INTEGER NOT NULL DEFAULT 1,
      threshold  TEXT,
      note       TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, rule_id)
    )`);
  } catch { /* migration is best-effort, same as the rest of the schema block */ }

  /** Overrides for one user, keyed by rule id, in the shape runDfmRules takes. */
  function overridesFor(userId) {
    if (!db || !userId) return undefined;
    try {
      const rows = db.prepare('SELECT rule_id, enabled, threshold, note FROM dfm_rule_overrides WHERE user_id = ?').all(userId);
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

  // Each call forks a Python OCP process; the bridge caps concurrency, this caps
  // request rate.
  const limit = rateLimit(Number(process.env.CV_DFM_RATE_MAX ?? 40), 10 * 60 * 1000);

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

  /** This workspace's rule overrides, alongside the published defaults. */
  app.get('/api/dfm/rule-overrides', requireAuth, (req, res) => {
    res.json({ overrides: overridesFor(req.user?.id) ?? {} });
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
      db.prepare(`INSERT INTO dfm_rule_overrides (user_id, rule_id, enabled, threshold, note, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?)
                  ON CONFLICT(user_id, rule_id) DO UPDATE SET
                    enabled = excluded.enabled, threshold = excluded.threshold,
                    note = excluded.note, updated_at = excluded.updated_at`)
        .run(req.user.id, rule.id, enabled ? 1 : 0, stored,
             note ? String(note).slice(0, 500) : null, new Date().toISOString());
    } catch (e) {
      return res.status(500).json({ error: `Could not save: ${e.message}` });
    }
    res.json({ ok: true, overrides: overridesFor(req.user.id) ?? {} });
  });

  app.delete('/api/dfm/rule-overrides/:ruleId', requireAuth, (req, res) => {
    if (!db) return res.status(503).json({ error: 'No database configured.' });
    try {
      db.prepare('DELETE FROM dfm_rule_overrides WHERE user_id = ? AND rule_id = ?')
        .run(req.user.id, req.params.ruleId);
    } catch { /* deleting something absent is not an error */ }
    res.json({ ok: true, overrides: overridesFor(req.user.id) ?? {} });
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
    if (rejectUnsupported(req, res)) return;

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

    const geo = await analyzeGeometry(
      req.file.buffer, req.file.originalname, 120_000,
      useSSE ? (ev) => { if (!clientGone) emit({ type: 'stage', ...ev }); } : null,
      pinnedDraw);
    if (geo.status !== 'success') {
      if (useSSE) { emit({ type: 'error', error: geo.error }); return res.end(); }
      return res.status(422).json({ error: geo.error });
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
    const inferred = inferProcessFamily(geo);
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
    const ruleOpts = { material, overrides: overridesFor(req.user?.id), declaredToleranceMm };
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
      return { ...r, findings: priced, impact: summarisePricedImpact(priced) };
    });

    const payload = {
      // The engine names the part after the file it was handed, which is the
      // bridge's temp file (cv-cad-3e46530a…). Use the name the user actually
      // uploaded, or their report is titled with a random hex string.
      partName: String(req.file.originalname || '').replace(/\.[^.]+$/, '') || geo.partName,
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
    const overrides = overridesFor(req.user?.id);
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
        geo = await analyzeGeometry(f.buffer, f.originalname, 120_000);
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

      const inferred = inferProcessFamily(geo);
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
