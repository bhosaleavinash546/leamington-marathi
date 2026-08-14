// ─────────────────────────────────────────────────────────────────────────────
// Engine cross-check for LIVE generated ideas — the same discipline the
// marketplace seeds get (scripts/verify-marketplace-costs.mjs), applied at
// /api/analyze time. The model attaches a machine-checkable claim to any
// material/process-substitution or mass-reduction idea:
//
//   engineCheckRequest: { baselineMaterial, baselineProcess, proposedMaterial,
//                         proposedProcess, referenceWeightKg, proposedWeightKg }
//
// and this module runs BOTH sides through the deterministic engine, stamping
//
//   engineCheck: { referenceCase, baselineEur, proposedEur, savingPct,
//                  direction: 'confirmed' | 'contradicted', basis }
//
// Ideas whose move isn't engine-expressible (or whose request doesn't resolve
// against the catalogue) keep engineCheck: null — honestly unverifiable by
// math alone, never faked.
// ─────────────────────────────────────────────────────────────────────────────
import { computeShouldCost, computeRouteCost } from './costing-engine.mjs';
import { computeHarnessCost } from './harness-cost.mjs';
import { resolveMaterial, resolveRoute } from './material-process-resolve.mjs';

/** Harness parameters an idea may propose changing, and their sane ranges. */
const HARNESS_FIELDS = {
  circuits:    [1, 2000],
  avgLengthM:  [0.05, 60],
  connectors:  [0, 400],
  splices:     [0, 400],
  sealedPct:   [0, 1],
};

/**
 * Cross-check a harness idea by costing both sides through harness-cost.mjs.
 *
 * Returns the same engineCheck stamp shape the material/process path produces,
 * so every downstream consumer — badges, exports, ranking — works unchanged.
 * Returns null (never a fabricated stamp) when the request does not describe a
 * real change or falls outside a modellable range.
 */
function checkHarness(req, { region, annualVolume, library }) {
  const baseIn = req.baseline && typeof req.baseline === 'object' ? req.baseline : null;
  const propIn = req.proposed && typeof req.proposed === 'object' ? req.proposed : null;
  if (!baseIn || !propIn) return null;

  const clean = (src, fallback = {}) => {
    const out = { ...fallback };
    for (const [k, [lo, hi]] of Object.entries(HARNESS_FIELDS)) {
      const n = Number(src[k]);
      if (Number.isFinite(n) && n >= lo && n <= hi) out[k] = n;
    }
    return out;
  };
  const base = clean(baseIn);
  if (!Number.isFinite(base.circuits)) return null;         // circuits is the one required input
  const prop = clean(propIn, base);                          // unstated fields are unchanged

  // A "check" where nothing moved proves nothing.
  if (HARNESS_FIELDS && Object.keys(HARNESS_FIELDS).every(k => base[k] === prop[k])) return null;

  try {
    const r = (input) => computeHarnessCost({ ...input, region, annualVolume }, library);
    const b = r(base), p = r(prop);
    // harness-cost.mjs returns `totalEur`; the parametric engine returns
    // `totalShouldCost`. Read the harness field, not the other one.
    const bt = Number(b?.totalEur), pt = Number(p?.totalEur);
    if (!Number.isFinite(bt) || !Number.isFinite(pt) || bt <= 0) return null;
    const savingPct = Number(((bt - pt) / bt * 100).toFixed(1));
    const changed = Object.keys(HARNESS_FIELDS)
      .filter(k => base[k] !== prop[k])
      .map(k => `${k} ${base[k]} → ${prop[k]}`)
      .join(', ');
    return {
      referenceCase: `wiring harness, ${changed}, ${(annualVolume / 1000).toFixed(0)}k/yr, ${region}`,
      baselineEur: Number(bt.toFixed(2)),
      proposedEur: Number(pt.toFixed(2)),
      savingPct,
      direction: savingPct > 0 ? 'confirmed' : 'contradicted',
      basis: 'Deterministic wiring-harness cost model (copper, connectors, crimp/insertion/test labour) — validates the DIRECTION of the move, not this harness’s exact figure.',
    };
  } catch {
    return null;   // out of modellable range — honestly unverifiable, never faked
  }
}

const clampW = (w, fallback) => {
  const n = Number(w);
  return Number.isFinite(n) && n >= 0.005 && n <= 500 ? n : fallback;
};

function computeSide(materialTyped, processTyped, weightKg, annualVolume, region, library) {
  const mat = resolveMaterial(String(materialTyped || ''), library?.MATERIALS);
  const route = resolveRoute(String(processTyped || ''), library?.PROCESSES);
  if (!mat || !route || route.keys.length === 0) return null;
  const input = { material: mat.key, weightKg, annualVolume, region };
  const r = route.keys.length > 1
    ? computeRouteCost({ ...input, route: route.keys }, {}, null, library)
    : computeShouldCost({ ...input, process: route.keys[0] }, {}, null, library);
  return { totalEur: r.totalShouldCost, material: mat.key, process: route.keys.join(' → ') };
}

/**
 * Mutates each idea: sets idea.engineCheck (object or null).
 * Returns a summary { checked, confirmed, contradicted, unexpressible }.
 */
export function runEngineChecks(ideas, { region = 'Germany', annualVolume = 80000, library = undefined, defaultWeightKg = 1.0 } = {}) {
  const summary = { checked: 0, confirmed: 0, contradicted: 0, unexpressible: 0 };
  for (const idea of ideas) {
    const req = idea.engineCheckRequest;
    const harnessReq = idea.harnessCheckRequest;
    delete idea.engineCheckRequest;   // request is model-internal; the stamp is the product
    delete idea.harnessCheckRequest;

    // A wiring harness is not "a part with a process", so no material/process
    // substitution resolves for it and every harness idea came back
    // unexpressible — measured at 0 of 14 on the body harness, the worst
    // coverage of any part class. harness-cost.mjs models the commodity
    // properly (copper × circuits × connectors × labour-minutes) and was sitting
    // in the repo with nothing calling it. This is that engine, wired in.
    if (harnessReq && typeof harnessReq === 'object') {
      const stamped = checkHarness(harnessReq, { region, annualVolume, library });
      idea.engineCheck = stamped;
      if (stamped) {
        summary.checked++;
        summary[stamped.direction === 'confirmed' ? 'confirmed' : 'contradicted']++;
      } else {
        summary.unexpressible++;
      }
      continue;
    }

    if (!req || typeof req !== 'object') { idea.engineCheck = null; summary.unexpressible++; continue; }
    try {
      const wBase = clampW(req.referenceWeightKg, defaultWeightKg);
      const wProp = clampW(req.proposedWeightKg, wBase);
      const base = computeSide(req.baselineMaterial, req.baselineProcess, wBase, annualVolume, region, library);
      const prop = computeSide(req.proposedMaterial ?? req.baselineMaterial, req.proposedProcess ?? req.baselineProcess, wProp, annualVolume, region, library);
      if (!base || !prop) { idea.engineCheck = null; summary.unexpressible++; continue; }
      // A "check" where nothing changed proves nothing — refuse to stamp it.
      if (base.material === prop.material && base.process === prop.process && wBase === wProp) {
        idea.engineCheck = null; summary.unexpressible++; continue;
      }
      const savingPct = Number(((base.totalEur - prop.totalEur) / base.totalEur * 100).toFixed(1));
      const direction = savingPct > 0 ? 'confirmed' : 'contradicted';
      idea.engineCheck = {
        referenceCase: `${wBase} kg ${base.material} via ${base.process} → ${wProp} kg ${prop.material} via ${prop.process}, ${(annualVolume / 1000).toFixed(0)}k/yr, ${region}`,
        baselineEur: Number(base.totalEur.toFixed(2)),
        proposedEur: Number(prop.totalEur.toFixed(2)),
        savingPct,
        direction,
        basis: 'Deterministic should-cost engine on a reference part — validates the DIRECTION of the move, not this part’s exact figure.',
      };
      summary.checked++;
      summary[direction === 'confirmed' ? 'confirmed' : 'contradicted']++;
    } catch {
      idea.engineCheck = null;   // family-incompatible or out-of-range — honestly unverifiable
      summary.unexpressible++;
    }
  }
  return summary;
}
