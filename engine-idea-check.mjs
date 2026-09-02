// ─────────────────────────────────────────────────────────────────────────────
// Engine cross-check for LIVE generated ideas — the same discipline the
// marketplace seeds get (scripts/verify-marketplace-costs.mjs), applied at
// /api/analyze time. The model attaches a machine-checkable claim to an idea
// and this module runs BOTH sides through the deterministic engine, stamping
//
//   engineCheck: { referenceCase, baselineEur, proposedEur, savingPct,
//                  direction: 'confirmed' | 'contradicted', basis, kind }
//
// Four kinds of claim are expressible, selected by engineCheckRequest.kind:
//
//   substitution  (default) material / process / mass change on a reference
//                 part — { baselineMaterial, baselineProcess, proposedMaterial,
//                 proposedProcess, referenceWeightKg, proposedWeightKg }
//   tolerance     drawing relaxation on the same part — { material, process,
//                 weightKg, baseline:{toleranceClass,surfaceFinish,
//                 criticalCharacteristics}, proposed:{…} }
//   assembly      part-count / joining change — { baseline:{parts, fasteners:
//                 {screw,boltNut,rivet,snapFit,weldSpot,adhesive}}, proposed:{…} }
//                 priced through the DFA time model + fastener piece prices
//   harness       (via harnessCheckRequest) wiring-harness parameters
//
// WHY THE EXTENSION. Measured on four live Prism runs, the substitution-only
// check left 47–100% of ideas with engineCheck: null — every part-count,
// joining, tolerance and architecture idea was "not expressible", and on the
// assembly-level EDU run not one of 22 ideas could be checked. When the engine
// COULD look it contradicted a third to a half of the ideas, so the unchecked
// majority was hiding the same error rate unseen.
//
// Ideas the engine still cannot price keep engineCheck: null — honestly
// unverifiable by math alone, never faked — and now ALWAYS carry
// engineCheckReason saying why (no request; material not in catalogue; nothing
// changed; out of range), so a null reads as a stated limitation instead of
// an unremarkable blank.
// ─────────────────────────────────────────────────────────────────────────────
import { computeShouldCost, computeRouteCost, REGIONS } from './costing-engine.mjs';
import { computeHarnessCost } from './harness-cost.mjs';
import { resolveMaterial, resolveRoute } from './material-process-resolve.mjs';
import { TIME_MODEL } from './dfa-time-model.mjs';

/** Harness parameters an idea may propose changing, and their sane ranges. */
const HARNESS_FIELDS = {
  circuits:    [1, 2000],
  avgLengthM:  [0.05, 60],
  connectors:  [0, 400],
  splices:     [0, 400],
  sealedPct:   [0, 1],
};

const TOL_CLASSES = ['standard', 'tight', 'precision'];
const FIN_CLASSES = ['standard', 'fine', 'polished'];

// Fastener piece prices, €/each. ILLUSTRATIVE anchors in the same spirit as
// the material catalogue — order-of-magnitude, never a supplier quote. The
// securing TIME is the DFA model's; these are the consumable on top of it.
export const FASTENER_PIECE_EUR = Object.freeze({ screw: 0.05, boltNut: 0.12, rivet: 0.04, snapFit: 0, weldSpot: 0.01, adhesive: 0.15 });

/**
 * Cross-check a harness idea by costing both sides through harness-cost.mjs.
 * Returns { stamp } or { reason } — never a fabricated stamp.
 */
function checkHarness(req, { region, annualVolume, library }) {
  const baseIn = req.baseline && typeof req.baseline === 'object' ? req.baseline : null;
  const propIn = req.proposed && typeof req.proposed === 'object' ? req.proposed : null;
  if (!baseIn || !propIn) return { reason: 'harness request lacks a baseline or proposed side' };

  const clean = (src, fallback = {}) => {
    const out = { ...fallback };
    for (const [k, [lo, hi]] of Object.entries(HARNESS_FIELDS)) {
      const n = Number(src[k]);
      if (Number.isFinite(n) && n >= lo && n <= hi) out[k] = n;
    }
    return out;
  };
  const base = clean(baseIn);
  if (!Number.isFinite(base.circuits)) return { reason: 'harness request has no circuit count' };
  const prop = clean(propIn, base);
  if (Object.keys(HARNESS_FIELDS).every(k => base[k] === prop[k])) return { reason: 'nothing changed between baseline and proposed harness' };

  try {
    const r = (input) => computeHarnessCost({ ...input, region, annualVolume }, library);
    const b = r(base), p = r(prop);
    const bt = Number(b?.totalEur), pt = Number(p?.totalEur);
    if (!Number.isFinite(bt) || !Number.isFinite(pt) || bt <= 0) return { reason: 'harness model returned no cost for one side' };
    const savingPct = Number(((bt - pt) / bt * 100).toFixed(1));
    const changed = Object.keys(HARNESS_FIELDS).filter(k => base[k] !== prop[k]).map(k => `${k} ${base[k]} → ${prop[k]}`).join(', ');
    return { stamp: {
      kind: 'harness',
      referenceCase: `wiring harness, ${changed}, ${(annualVolume / 1000).toFixed(0)}k/yr, ${region}`,
      baselineEur: Number(bt.toFixed(2)), proposedEur: Number(pt.toFixed(2)), savingPct,
      direction: savingPct > 0 ? 'confirmed' : 'contradicted',
      basis: 'Deterministic wiring-harness cost model (copper, connectors, crimp/insertion/test labour) — validates the DIRECTION of the move, not this harness’s exact figure.',
    } };
  } catch (e) {
    return { reason: `harness model out of range: ${String(e?.message || e).slice(0, 80)}` };
  }
}

const clampW = (w, fallback) => {
  const n = Number(w);
  return Number.isFinite(n) && n >= 0.005 && n <= 500 ? n : fallback;
};

function computeSide(materialTyped, processTyped, weightKg, annualVolume, region, library, spec = {}) {
  const mat = resolveMaterial(String(materialTyped || ''), library?.MATERIALS);
  if (!mat) return { reason: `material "${String(materialTyped || '').slice(0, 40) || '(none)'}" not in the engine catalogue` };
  const route = resolveRoute(String(processTyped || ''), library?.PROCESSES);
  if (!route || route.keys.length === 0) return { reason: `process "${String(processTyped || '').slice(0, 40) || '(none)'}" not in the engine catalogue` };
  const input = { material: mat.key, weightKg, annualVolume, region, ...spec };
  const r = route.keys.length > 1
    ? computeRouteCost({ ...input, route: route.keys }, {}, null, library)
    : computeShouldCost({ ...input, process: route.keys[0] }, {}, null, library);
  return { totalEur: r.totalShouldCost, material: mat.key, process: route.keys.join(' → ') };
}

const SUBSTITUTION_BASIS = 'Deterministic should-cost engine on a reference part — validates the DIRECTION of the move, not this part’s exact figure.';

function checkSubstitution(req, { region, annualVolume, library, defaultWeightKg }) {
  const wBase = clampW(req.referenceWeightKg, defaultWeightKg);
  const wProp = clampW(req.proposedWeightKg, wBase);
  const base = computeSide(req.baselineMaterial, req.baselineProcess, wBase, annualVolume, region, library);
  if (base.reason) return { reason: `baseline ${base.reason}` };
  const prop = computeSide(req.proposedMaterial ?? req.baselineMaterial, req.proposedProcess ?? req.baselineProcess, wProp, annualVolume, region, library);
  if (prop.reason) return { reason: `proposed ${prop.reason}` };
  if (base.material === prop.material && base.process === prop.process && wBase === wProp) {
    return { reason: 'nothing changed between baseline and proposed (same material, process and mass)' };
  }
  const savingPct = Number(((base.totalEur - prop.totalEur) / base.totalEur * 100).toFixed(1));
  return { stamp: {
    kind: wBase !== wProp && base.material === prop.material && base.process === prop.process ? 'mass' : 'substitution',
    referenceCase: `${wBase} kg ${base.material} via ${base.process} → ${wProp} kg ${prop.material} via ${prop.process}, ${(annualVolume / 1000).toFixed(0)}k/yr, ${region}`,
    baselineEur: Number(base.totalEur.toFixed(2)), proposedEur: Number(prop.totalEur.toFixed(2)), savingPct,
    direction: savingPct > 0 ? 'confirmed' : 'contradicted',
    basis: SUBSTITUTION_BASIS,
  } };
}

const specOf = (s) => {
  const o = s && typeof s === 'object' ? s : {};
  return {
    toleranceClass: TOL_CLASSES.includes(o.toleranceClass) ? o.toleranceClass : 'standard',
    surfaceFinish: FIN_CLASSES.includes(o.surfaceFinish) ? o.surfaceFinish : 'standard',
    criticalCharacteristics: Math.max(0, Math.min(50, Number(o.criticalCharacteristics) || 0)),
  };
};

/** Tolerance / finish / CC relaxation on the SAME part, both sides through the engine's drawing drivers. */
function checkTolerance(req, { region, annualVolume, library, defaultWeightKg }) {
  const w = clampW(req.weightKg, defaultWeightKg);
  const b = specOf(req.baseline), p = specOf(req.proposed);
  if (b.toleranceClass === p.toleranceClass && b.surfaceFinish === p.surfaceFinish && b.criticalCharacteristics === p.criticalCharacteristics) {
    return { reason: 'nothing changed between baseline and proposed drawing spec' };
  }
  const base = computeSide(req.material, req.process, w, annualVolume, region, library, b);
  if (base.reason) return { reason: base.reason };
  const prop = computeSide(req.material, req.process, w, annualVolume, region, library, p);
  if (prop.reason) return { reason: prop.reason };
  const savingPct = Number(((base.totalEur - prop.totalEur) / base.totalEur * 100).toFixed(1));
  const desc = (s) => `${s.toleranceClass} tol / ${s.surfaceFinish} finish / ${s.criticalCharacteristics} CC`;
  return { stamp: {
    kind: 'tolerance',
    referenceCase: `${w} kg ${base.material} via ${base.process}: ${desc(b)} → ${desc(p)}, ${(annualVolume / 1000).toFixed(0)}k/yr, ${region}`,
    baselineEur: Number(base.totalEur.toFixed(2)), proposedEur: Number(prop.totalEur.toFixed(2)), savingPct,
    direction: savingPct > 0 ? 'confirmed' : 'contradicted',
    basis: 'Deterministic should-cost engine re-run with the relaxed drawing drivers (tolerance cycle multiplier, finish multiplier, critical-characteristic inspection) — validates the DIRECTION, not this part’s exact figure. Whether the characteristic CAN be relaxed is an engineering judgement the engine does not make.',
  } };
}

// Assembly side: parts × (handling + insertion) + Σ fasteners × securing time,
// at the region's loaded labour rate, plus fastener piece prices.
function assemblySide(side, region) {
  const o = side && typeof side === 'object' ? side : {};
  const parts = Number(o.parts);
  if (!Number.isFinite(parts) || parts < 0 || parts > 2000) return { reason: 'assembly side needs a part count (0–2000)' };
  const f = o.fasteners && typeof o.fasteners === 'object' ? o.fasteners : {};
  const fasteners = {};
  for (const k of Object.keys(FASTENER_PIECE_EUR)) {
    const n = Number(f[k]);
    fasteners[k] = Number.isFinite(n) && n >= 0 && n <= 5000 ? n : 0;
  }
  const r = REGIONS[region] || REGIONS.Germany;
  const ratePerSec = (r.labour * (1 + r.overheadPct)) / 3600;
  const perPartSec = TIME_MODEL.baseHandlingSec + TIME_MODEL.baseInsertionSec;
  let sec = parts * perPartSec, pieces = 0;
  for (const [k, n] of Object.entries(fasteners)) {
    sec += n * (TIME_MODEL.securing[k] ?? 0);
    pieces += n * FASTENER_PIECE_EUR[k];
  }
  const labourEur = sec * ratePerSec;
  return { parts, fasteners, sec: Number(sec.toFixed(1)), labourEur, piecesEur: pieces, totalEur: labourEur + pieces };
}

/** Part-count / joining change priced through the DFA time model. */
function checkAssembly(req, { region, annualVolume }) {
  const base = assemblySide(req.baseline, region);
  if (base.reason) return { reason: `baseline ${base.reason}` };
  const prop = assemblySide(req.proposed, region);
  if (prop.reason) return { reason: `proposed ${prop.reason}` };
  const same = base.parts === prop.parts && Object.keys(FASTENER_PIECE_EUR).every(k => base.fasteners[k] === prop.fasteners[k]);
  if (same) return { reason: 'nothing changed between baseline and proposed assembly (same part and fastener counts)' };
  if (base.totalEur <= 0) return { reason: 'baseline assembly has no labour or fastener content to compare' };
  const savingPct = Number(((base.totalEur - prop.totalEur) / base.totalEur * 100).toFixed(1));
  const fl = (s) => Object.entries(s.fasteners).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ') || 'no fasteners';
  return { stamp: {
    kind: 'assembly',
    referenceCase: `${base.parts} parts (${fl(base)}) → ${prop.parts} parts (${fl(prop)}), ${base.sec}s → ${prop.sec}s assembly time, ${(annualVolume / 1000).toFixed(0)}k/yr, ${region}`,
    baselineEur: Number(base.totalEur.toFixed(2)), proposedEur: Number(prop.totalEur.toFixed(2)), savingPct,
    direction: savingPct > 0 ? 'confirmed' : 'contradicted',
    basis: 'Deterministic DFA time model (BrainSpark coefficients, MTM-structured, calibratable) at the region’s loaded labour rate, plus illustrative fastener piece prices — validates the DIRECTION of the assembly-content change ONLY. Material and tooling consequences of a consolidation are NOT included; add a substitution request for those.',
  } };
}

/**
 * Mutates each idea: sets idea.engineCheck (object or null) and, whenever it
 * is null, idea.engineCheckReason (string). Returns a summary
 * { checked, confirmed, contradicted, unexpressible, byKind, reasons }.
 */
export function runEngineChecks(ideas, { region = 'Germany', annualVolume = 80000, library = undefined, defaultWeightKg = 1.0 } = {}) {
  const summary = { checked: 0, confirmed: 0, contradicted: 0, unexpressible: 0, byKind: {}, reasons: {} };
  const ctx = { region, annualVolume, library, defaultWeightKg };
  const stamp = (idea, res) => {
    if (res.stamp) {
      idea.engineCheck = res.stamp;
      delete idea.engineCheckReason;
      summary.checked++;
      summary[res.stamp.direction === 'confirmed' ? 'confirmed' : 'contradicted']++;
      summary.byKind[res.stamp.kind] = (summary.byKind[res.stamp.kind] || 0) + 1;
    } else {
      idea.engineCheck = null;
      idea.engineCheckReason = res.reason;
      summary.unexpressible++;
      const key = res.reason.replace(/"[^"]*"/g, '"…"').slice(0, 60);
      summary.reasons[key] = (summary.reasons[key] || 0) + 1;
    }
  };

  for (const idea of ideas) {
    if (!idea || typeof idea !== 'object') continue;
    const req = idea.engineCheckRequest;
    const harnessReq = idea.harnessCheckRequest;
    delete idea.engineCheckRequest;   // request is model-internal; the stamp is the product
    delete idea.harnessCheckRequest;

    if (harnessReq && typeof harnessReq === 'object') { stamp(idea, checkHarness(harnessReq, ctx)); continue; }
    if (!req || typeof req !== 'object') {
      stamp(idea, { reason: 'no engine-check request — the idea was not expressed as a substitution, tolerance, assembly or harness change the engine can price' });
      continue;
    }
    const kind = typeof req.kind === 'string' ? req.kind.toLowerCase() : 'substitution';
    try {
      if (kind === 'tolerance') stamp(idea, checkTolerance(req, ctx));
      else if (kind === 'assembly') stamp(idea, checkAssembly(req, ctx));
      else stamp(idea, checkSubstitution(req, ctx));
    } catch (e) {
      stamp(idea, { reason: `engine could not price this move: ${String(e?.message || e).slice(0, 80)}` });
    }
  }
  return summary;
}
