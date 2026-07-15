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
import { resolveMaterial, resolveRoute } from './material-process-resolve.mjs';

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
    delete idea.engineCheckRequest;   // request is model-internal; the stamp is the product
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
