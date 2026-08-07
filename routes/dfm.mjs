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
import { DFM_RULES, PROCESS_FAMILIES } from '../dfm-rule-catalogue.mjs';
import { analyseDfa } from '../dfa-engine.mjs';
import { TIME_MODEL } from '../dfa-time-model.mjs';

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
        rationale: r.rationale, fix: r.fix, source: r.source,
      })),
      timeModel: { version: TIME_MODEL.version, basis: TIME_MODEL.basis },
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
    const DENSITY = {
      'Aluminium A356 (cast)': 2.68, 'Aluminium 6061': 2.70, 'Aluminium 7075': 2.81,
      'Steel (mild)': 7.85, 'Steel (high-strength)': 7.85, 'Stainless Steel 304': 7.9,
      'Cast Iron (Grey)': 7.2, 'Cast Iron (Ductile/GJS)': 7.1, 'Zinc (ZAMAK 5)': 6.6,
      'Magnesium AZ31': 1.77, 'Titanium Ti-6Al-4V': 4.43, 'Brass (CuZn39)': 8.4,
      ABS: 1.05, 'Polypropylene (PP)': 0.91, 'PA6 (Nylon)': 1.14,
      'PA66-GF30 (glass-filled)': 1.36, 'POM (Acetal)': 1.41, 'Polycarbonate (PC)': 1.20,
    };
    const density = DENSITY[req.body?.material];
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
    };

    const results = ruleResults.map(r => {
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
        labourRateEurPerHr: numOr(parsed.labourRateEurPerHr, undefined),
        calibration: numOr(parsed.calibration, 1),
      });
    } catch (e) {
      return res.status(422).json({ error: e.message });
    }
    res.json({ decomposition, dfa, analysedAt: new Date().toISOString() });
  });
}
