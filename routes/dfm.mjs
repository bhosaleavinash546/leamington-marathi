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

export function registerDfmRoutes(app, { requireAuth, rateLimit }) {
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
    const ruleOpts = { material };
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
      material: material || null,
      materialFamily: material ? familyOfMaterial(material) ?? null : null,
      // EVERY VIABLE ROUTE, not just the one that was chosen. The report answers
      // "is this part good for the process you named"; the question a cost
      // engineer actually arrives with is "which process should make it". Both
      // are now on the page, from one measurement of the geometry.
      routes: weightKg > 0 && material
        ? compareRoutes(geo, { material, region: req.body?.region || 'Germany',
            annualVolume: numOr(req.body?.annualVolume, 50000), weightKg })
        : null,
      // Named when the chosen process shapes nothing, so the reader is told why
      // there are no findings instead of seeing an empty report.
      noDfmRulesReason: selected.basis === 'no-rules' ? selected.reason : null,
      analysedAt: new Date().toISOString(),
    };
    if (useSSE) { emit({ type: 'result', result: payload }); return res.end(); }
    res.json(payload);
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
