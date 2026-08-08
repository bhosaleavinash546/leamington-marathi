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
import { runDfmRules, runAllDfmRules } from '../dfm-rules.mjs';
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
    const geo = await analyzeGeometry(req.file.buffer, req.file.originalname);
    if (geo.status !== 'success') return res.status(422).json({ error: geo.error });

    // Which rule families to run. If the user named a costing process, the DFM
    // family follows from it — running injection-moulding rules on an aluminium
    // die casting produces findings for a process the part will never see, and
    // prices a "saving" against it. A live run on a die-cast bracket did exactly
    // that: EUR 36,000/yr of moulding savings on a part nobody will mould.
    const COST_TO_FAMILY = {
      'Die Casting (Aluminium)': 'hpdc',
      'Die Casting (Zinc)': 'hpdc',
      'Gravity Die Casting': 'hpdc',
      'Injection Moulding': 'injection-moulding',
      'Machining (CNC)': 'machining',
      'Machining (secondary ops)': 'machining',
      'Stamping / Deep Drawing': 'sheet-metal',
      'Lamination Stamping (Electrical Steel)': 'sheet-metal',
    };
    const explicit = String(req.body?.process || '').trim();
    const derived = COST_TO_FAMILY[req.body?.costProcess];
    const family = PROCESS_FAMILIES[explicit] ? explicit : derived;
    const ruleResults = family ? [runDfmRules(geo, family)] : runAllDfmRules(geo);
    const familyBasis = PROCESS_FAMILIES[explicit] ? 'chosen'
      : derived ? 'derived from the costing process'
        : 'no process given — every family run speculatively, so findings may not all apply';

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

    res.json({
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
      analysedAt: new Date().toISOString(),
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
