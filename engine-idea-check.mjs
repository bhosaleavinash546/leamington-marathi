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
//   footprint     same part, different plant region — { material, process,
//                 weightKg, baselineRegion, proposedRegion }
//   commonisation N variants collapsed onto one part — { material, process,
//                 weightKg, variants, baselineVolumePerVariant }
//   cycle         throughput / machine-rate change on the same part —
//                 { material, process, weightKg, cycleMult, machineMult }
//
// WHY THE EXTENSION. Measured on four live Prism runs, the substitution-only
// check left 47–100% of ideas with engineCheck: null — every part-count,
// joining, tolerance and architecture idea was "not expressible", and on the
// assembly-level EDU run not one of 22 ideas could be checked. When the engine
// COULD look it contradicted a third to a half of the ideas, so the unchecked
// majority was hiding the same error rate unseen.
//
// WHY THE SECOND EXTENSION (Sept 2026). The four kinds above reached 43.5% of
// ideas on the live Prism corpus. Reading the 35 that stayed null showed the
// gap was not physics — it was QUESTION SHAPE. Five ideas proposed collapsing
// variants onto a common part, two proposed moving the plant to another region
// and one proposed a faster press. Every one of those is a single
// computeShouldCost call away: volume, region and cycle are already first-class
// engine inputs. The checker simply had no way to ASK those questions, so
// eight genuinely priceable ideas were reported as unverifiable.
//
// The remaining nulls are honest: a bought-in resolver has no should-cost, and
// a commercial-gap argument is priced by the waterfall's W1 step rather than by
// re-running the engine on a design that has not changed.
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

// ── The three kinds added Sept 2026, all one engine call apart ──────────────
//
// Each asks the engine a question it could always answer but was never asked.
// They share `sameSideOf`: resolve the part once, then cost it twice under
// different conditions, so a difference can only come from the condition under
// test and never from a resolution difference between the two sides.
function sameSideOf(req, defaultWeightKg) {
  const w = clampW(req.weightKg, defaultWeightKg);
  const mat = resolveMaterial(String(req.material || ''), undefined);
  if (!mat) return { reason: `material "${String(req.material || '').slice(0, 40) || '(none)'}" not in the engine catalogue` };
  const route = resolveRoute(String(req.process || ''), undefined);
  if (!route || route.keys.length === 0) return { reason: `process "${String(req.process || '').slice(0, 40) || '(none)'}" not in the engine catalogue` };
  return { w, matKey: mat.key, routeKeys: route.keys };
}

function costAt(matKey, routeKeys, weightKg, annualVolume, region, library) {
  const input = { material: matKey, weightKg, annualVolume, region };
  return routeKeys.length > 1
    ? computeRouteCost({ ...input, route: routeKeys }, {}, null, library).totalShouldCost
    : computeShouldCost({ ...input, process: routeKeys[0] }, {}, null, library).totalShouldCost;
}

/**
 * FOOTPRINT — the same part made in a different region.
 *
 * This was the single clearest miss: two live ideas proposed exactly the move
 * the entitlement waterfall's W4 step computes, and the substitution check
 * refused them with "nothing changed" because it compared material, process and
 * mass and had no region axis at all. Region became a real axis in Sept 2026
 * (labour, machine rate, energy, commercial), so the answer is now meaningful
 * rather than a labour-rate ratio.
 */
function checkFootprint(req, { region, annualVolume, library, defaultWeightKg }) {
  const side = sameSideOf(req, defaultWeightKg);
  if (side.reason) return { reason: side.reason };
  const from = typeof req.baselineRegion === 'string' && REGIONS[req.baselineRegion] ? req.baselineRegion : region;
  const to = typeof req.proposedRegion === 'string' ? req.proposedRegion : null;
  if (!to) return { reason: 'footprint check needs a proposedRegion' };
  if (!REGIONS[to]) return { reason: `region "${String(to).slice(0, 40)}" is not in the engine's rate library` };
  if (to === from) return { reason: 'nothing changed between baseline and proposed region' };
  const baselineEur = costAt(side.matKey, side.routeKeys, side.w, annualVolume, from, library);
  const proposedEur = costAt(side.matKey, side.routeKeys, side.w, annualVolume, to, library);
  const savingPct = Number(((baselineEur - proposedEur) / baselineEur * 100).toFixed(1));
  return { stamp: {
    kind: 'footprint',
    referenceCase: `${side.w} kg ${side.matKey} via ${side.routeKeys.join(' → ')}, ${(annualVolume / 1000).toFixed(0)}k/yr: ${from} → ${to}`,
    baselineEur: Number(baselineEur.toFixed(2)), proposedEur: Number(proposedEur.toFixed(2)), savingPct,
    direction: savingPct > 0 ? 'confirmed' : 'contradicted',
    basis: 'Deterministic should-cost engine re-run against the proposed region\u2019s labour, machine, energy and commercial rates \u2014 EX-WORKS. Freight, duty, tariff, inventory and the launch cost of a resourcing are NOT in this figure, and on a low-value part they can exceed the whole saving.',
  } };
}

/**
 * COMMONISATION — N variants collapsed onto one part.
 *
 * Five of the ten unexpressible ideas on the live corpus were this: one common
 * lamination diameter, one carrier across a length family, a symmetric LH/RH
 * bracket. The lever is volume — each variant is made at V and the common part
 * at N x V, so tooling amortises over N times as many parts and the batch/setup
 * term falls. That is the volume axis, which the engine has always had.
 *
 * What it deliberately does NOT price: the mass or content penalty of designing
 * one part to satisfy every variant's duty. A common part is usually the
 * heaviest variant, and that trade is an engineering judgement, so the basis
 * says so and the idea should carry a substitution request for the mass side.
 */
function checkCommonisation(req, { region, annualVolume, library, defaultWeightKg }) {
  const side = sameSideOf(req, defaultWeightKg);
  if (side.reason) return { reason: side.reason };
  const variants = Number(req.variants);
  if (!Number.isFinite(variants) || variants < 2 || variants > 50) {
    return { reason: 'commonisation check needs a variant count of 2\u201350 — how many part numbers collapse into one' };
  }
  const per = clampW(req.baselineVolumePerVariant, 0) || Math.max(1, Math.round(annualVolume / variants));
  const baseVol = Math.max(1, Math.round(per));
  const commonVol = Math.min(1e8, baseVol * variants);
  const baselineEur = costAt(side.matKey, side.routeKeys, side.w, baseVol, region, library);
  const proposedEur = costAt(side.matKey, side.routeKeys, side.w, commonVol, region, library);
  const savingPct = Number(((baselineEur - proposedEur) / baselineEur * 100).toFixed(1));
  return { stamp: {
    kind: 'commonisation',
    referenceCase: `${side.w} kg ${side.matKey} via ${side.routeKeys.join(' \u2192 ')} in ${region}: ${variants} variants at ${(baseVol / 1000).toFixed(0)}k/yr each \u2192 one common part at ${(commonVol / 1000).toFixed(0)}k/yr`,
    baselineEur: Number(baselineEur.toFixed(2)), proposedEur: Number(proposedEur.toFixed(2)), savingPct,
    direction: savingPct > 0 ? 'confirmed' : 'contradicted',
    basis: 'Deterministic should-cost engine at the per-variant volume versus the consolidated volume \u2014 the tooling-amortisation and setup effect of commonisation, per part. It does NOT price the content penalty of one part covering every variant\u2019s duty (a common part is usually the heaviest variant), nor the engineering and validation cost of the change.',
  } };
}

/**
 * CYCLE — a throughput or machine-rate change on the same part.
 *
 * A faster press, a higher-cavitation tool, an extra spindle: the part does not
 * change, the rate does. computeShouldCost has always taken cycleMult and
 * machineMult overrides; nothing could ask it to use them. Both multipliers are
 * clamped, and a claim outside the clamp is refused rather than quietly capped,
 * because "3x faster at the same machine rate" is a claim someone must defend.
 */
const CYCLE_MULT_MIN = 0.2, CYCLE_MULT_MAX = 5;
function checkCycle(req, { region, annualVolume, library, defaultWeightKg }) {
  const side = sameSideOf(req, defaultWeightKg);
  if (side.reason) return { reason: side.reason };
  const cycleMult = req.cycleMult === undefined ? 1 : Number(req.cycleMult);
  const machineMult = req.machineMult === undefined ? 1 : Number(req.machineMult);
  for (const [name, v] of [['cycleMult', cycleMult], ['machineMult', machineMult]]) {
    if (!Number.isFinite(v) || v < CYCLE_MULT_MIN || v > CYCLE_MULT_MAX) {
      return { reason: `${name} must be a number between ${CYCLE_MULT_MIN} and ${CYCLE_MULT_MAX} — a larger claim needs evidence the engine cannot supply` };
    }
  }
  if (cycleMult === 1 && machineMult === 1) return { reason: 'nothing changed between baseline and proposed rate (both multipliers are 1)' };
  if (side.routeKeys.length > 1) return { reason: 'rate changes are priced on a single operation — name the one process whose rate changes, not the whole route' };
  const input = { material: side.matKey, process: side.routeKeys[0], weightKg: side.w, annualVolume, region };
  const baselineEur = computeShouldCost(input, {}, null, library).totalShouldCost;
  const proposedEur = computeShouldCost(input, { cycleMult, machineMult }, null, library).totalShouldCost;
  const savingPct = Number(((baselineEur - proposedEur) / baselineEur * 100).toFixed(1));
  const pctOf = (m) => `${m > 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`;
  return { stamp: {
    kind: 'cycle',
    referenceCase: `${side.w} kg ${side.matKey} via ${side.routeKeys[0]}, ${(annualVolume / 1000).toFixed(0)}k/yr, ${region}: cycle ${pctOf(cycleMult)}, machine rate ${pctOf(machineMult)}`,
    baselineEur: Number(baselineEur.toFixed(2)), proposedEur: Number(proposedEur.toFixed(2)), savingPct,
    direction: savingPct > 0 ? 'confirmed' : 'contradicted',
    basis: 'Deterministic should-cost engine re-run with the stated cycle-time and machine-rate multipliers \u2014 it prices the CONSEQUENCE of the claimed rate, not the claim itself. Whether the line can actually run that fast on this part is an engineering judgement, and the capital cost of the faster asset is not in the machine-rate multiplier unless you put it there.',
  } };
}

/**
 * Mutates each idea: sets idea.engineCheck (object or null) and, whenever it
 * is null, idea.engineCheckReason (string). Returns a summary
 * { checked, confirmed, contradicted, unexpressible, byKind, reasons }.
 */
/** How many phrasings of one move the engine will try before giving up. */
export const MAX_CHECK_CANDIDATES = 3;

const describeKind = (req) => {
  const k = typeof req?.kind === 'string' ? req.kind.toLowerCase() : 'substitution';
  if (k === 'substitution' && (req.proposedMaterial || req.baselineMaterial)) {
    return `substitution ${String(req.baselineMaterial ?? '?').slice(0, 28)} → ${String(req.proposedMaterial ?? req.baselineMaterial ?? '?').slice(0, 28)}`;
  }
  return k;
};

/** One candidate through the right checker. Never throws — a throw is a reason. */
function runOneCheck(req, ctx) {
  const kind = typeof req.kind === 'string' ? req.kind.toLowerCase() : 'substitution';
  try {
    if (kind === 'tolerance') return checkTolerance(req, ctx);
    if (kind === 'assembly') return checkAssembly(req, ctx);
    if (kind === 'footprint') return checkFootprint(req, ctx);
    if (kind === 'commonisation' || kind === 'commonization') return checkCommonisation(req, ctx);
    if (kind === 'cycle') return checkCycle(req, ctx);
    return checkSubstitution(req, ctx);
  } catch (e) {
    return { reason: `engine could not price this move: ${String(e?.message || e).slice(0, 80)}` };
  }
}

export const KINDS = Object.freeze(['substitution', 'mass', 'tolerance', 'assembly', 'footprint', 'commonisation', 'cycle', 'harness']);

export function runEngineChecks(ideas, { region = 'Germany', annualVolume = 80000, library = undefined, defaultWeightKg = 1.0 } = {}) {
  const summary = { checked: 0, confirmed: 0, contradicted: 0, unexpressible: 0, byKind: {}, reasons: {} };
  const ctx = { region, annualVolume, library, defaultWeightKg };
  // The REQUEST travels with the verdict (Sept 2026). It used to be deleted as
  // "model-internal", which made a deterministic check the one thing in this
  // pipeline that could not be re-derived: when the resolver improved, there was
  // no way to ask the saved corpus whether the improvement helped, short of
  // paying for a fresh live run. A check you cannot replay is a check you have
  // to take on trust. It is kept on the stamp AND on the null, so a stated
  // limitation can be re-tested against a later engine.
  const stamp = (idea, res, req = null) => {
    if (req) idea.engineCheckInput = req;
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
    const harnessReq = idea.harnessCheckRequest;
    // BEST-OF-N, ADJUDICATED BY THE ENGINE (Sept 2026 review, Tier 1).
    //
    // An idea may now offer SEVERAL ways of expressing the same move, and the
    // engine picks. This is the one place in the pipeline where extra compute
    // is genuinely worth spending, and the reason is asymmetry: generating a
    // second candidate costs a few output tokens in a call already being made,
    // while the verifier is local, deterministic and free. Test-time scaling
    // only pays where something can actually adjudicate — everywhere else in
    // this pipeline there is no ground truth to check against, and sampling
    // more would just produce more confident output.
    //
    // Coverage was 43.5% on the live corpus, and reading the misses showed the
    // commonest failure was a single request whose material or process name did
    // not resolve. A second phrasing of the same physical move — "DP600" beside
    // "Steel DP600 (dual-phase)", or a substitution beside a footprint framing —
    // converts many of those without changing the idea at all.
    //
    // The candidates that did NOT price are kept on the stamp. An engineer
    // reading "we also tried X and Y, and here is why they did not resolve"
    // learns something about the catalogue; a silent winner teaches nothing.
    const candidates = [
      ...(Array.isArray(idea.engineCheckRequests) ? idea.engineCheckRequests : []),
      ...(idea.engineCheckRequest && typeof idea.engineCheckRequest === 'object' ? [idea.engineCheckRequest] : []),
    ].filter(r => r && typeof r === 'object').slice(0, MAX_CHECK_CANDIDATES);
    delete idea.engineCheckRequest;    // re-homed onto engineCheckInput by stamp()
    delete idea.engineCheckRequests;
    delete idea.harnessCheckRequest;

    if (harnessReq && typeof harnessReq === 'object') { stamp(idea, checkHarness(harnessReq, ctx), harnessReq); continue; }
    if (!candidates.length) {
      stamp(idea, { reason: `no engine-check request — the idea was not expressed as any of the ${KINDS.join(', ')} changes the engine can price` });
      continue;
    }

    const tried = [];
    let winner = null, winnerReq = null;
    for (const req of candidates) {
      const res = runOneCheck(req, ctx);
      if (res.stamp && !winner) { winner = res; winnerReq = req; }
      else tried.push({ kind: describeKind(req), reason: res.stamp ? 'not used — an earlier candidate already priced' : res.reason });
    }
    if (winner) {
      stamp(idea, winner, winnerReq);
      if (tried.length && idea.engineCheck) idea.engineCheck.alsoTried = tried;
      if (candidates.length > 1) summary.multiCandidate = (summary.multiCandidate || 0) + 1;
    } else {
      // Every candidate failed. Report the FIRST reason as the verdict and the
      // rest beside it — "none of the three ways we could express this priced"
      // is a sharper statement about the catalogue than any single failure.
      const first = runOneCheck(candidates[0], ctx);
      stamp(idea, first, candidates[0]);
      if (tried.length && idea.engineCheckReason) {
        idea.engineCheckAlsoTried = tried;
      }
    }
  }
  return summary;
}
