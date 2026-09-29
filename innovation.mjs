// ─────────────────────────────────────────────────────────────────────────────
// Innovation methods — deterministic cores for structured idea generation.
//
// Same philosophy as triz.mjs: the METHOD supplies the reasoning structure
// (deterministic where there is real math to do), the LLM supplies the concrete
// embodiment, and the cost engine checks the numbers. Each method exposes a
// deterministic pre-step so the studio can show a real analysis, not just a
// prompt result.
//
// Tiers (per the roadmap):
//   T1  value-engineering · dfa · design-to-cost   (rigorous, engine-leveraged)
//   T2  scamper · morphological                    (breadth lenses)
//   T3  effects-trends · circularity               (advanced / regulation)
// TRIZ lives in triz.mjs and is surfaced alongside these.
// ─────────────────────────────────────────────────────────────────────────────

import { computeShouldCost, computeRouteCost } from './costing-engine.mjs';
import { resolveMaterial, resolveRoute } from './material-process-resolve.mjs';

const round = (x, dp = 1) => Number(Number(x).toFixed(dp));

// ── Method catalogue (drives the UI picker + the Analyze lenses) ─────────────
export const METHODS = [
  { id: 'triz', name: 'TRIZ', tier: 1, mode: 'contradiction', blurb: 'Break an engineering trade-off with 40 inventive principles.', input: 'contradiction' },
  { id: 'value-engineering', name: 'Value Engineering', tier: 1, mode: 'functional', blurb: 'Find functions where you pay a lot for little value, then attack them.', input: 'part' },
  { id: 'fast', name: 'FAST Function-Cost Matrix', tier: 1, mode: 'functional', blurb: 'Cross-map every component\'s cost onto the functions it serves; attack poor-value functions.', input: 'part' },
  { id: 'spec-challenge', name: 'Spec & Tolerance Challenge', tier: 1, mode: 'target', blurb: 'Challenge tolerances, grades, finishes and test levels — CTQ characteristics stay locked.', input: 'part' },
  { id: 'teardown-delta', name: 'Teardown Delta', tier: 1, mode: 'benchmark', blurb: 'Compare your part attribute-by-attribute against a benchmark; every gap becomes an idea target.', input: 'part' },
  { id: 'dfa', name: 'DFA / Part Consolidation', tier: 1, mode: 'structural', blurb: 'Find deletable parts — theoretical minimum count via the 3 DFA questions.', input: 'parts' },
  { id: 'design-to-cost', name: 'Design-to-Cost', tier: 1, mode: 'target', blurb: 'Work backwards from a price target; close the cost gap bucket by bucket.', input: 'target' },
  { id: 'scamper', name: 'SCAMPER', tier: 2, mode: 'checklist', blurb: 'Fast 7-verb creativity checklist — broad first pass.', input: 'part' },
  { id: 'morphological', name: 'Morphological Analysis', tier: 2, mode: 'combinatorial', blurb: 'Explore genuinely different concepts by mixing sub-function options.', input: 'part' },
  { id: 'effects-trends', name: 'Effects & Evolution Trends', tier: 3, mode: 'advanced-triz', blurb: 'Achieve a function with a physical effect; jump to the next tech generation.', input: 'part' },
  { id: 'circularity', name: 'Design for Circularity', tier: 3, mode: 'dfx', blurb: 'Cut cost and meet end-of-life rules (EU ELV) via disassembly strategies.', input: 'part' },
];
export const methodIds = () => METHODS.map(m => m.id);
export const getMethod = (id) => METHODS.find(m => m.id === id) || null;

// ── SCAMPER (curated verbs + automotive prompts) ─────────────────────────────
export const SCAMPER = [
  { verb: 'Substitute', q: 'What cheaper material, process, or component could replace part of this?', auto: 'DP steel → press-hardened boron; machined billet → near-net forging; metal bracket → PA66-GF30.' },
  { verb: 'Combine', q: 'Which adjacent parts or operations could merge into one?', auto: 'Two stampings + weld → one casting; drill + chamfer in one tool; bracket that is also the heat sink.' },
  { verb: 'Adapt', q: 'What proven solution from another system or industry fits here?', auto: 'Aerospace tailored blanks; appliance snap-fits; consumer-electronics flex-PCB in place of a wired board.' },
  { verb: 'Modify (Magnify/Minify)', q: 'What if a dimension, tolerance, or feature were changed?', auto: 'Relax a non-functional IT7 tolerance to IT10; down-gauge 12%; enlarge a radius to delete a machining pass.' },
  { verb: 'Put to other use', q: 'Could this part do a second job and delete another?', auto: 'Battery pack as structural floor; closing panel as pedestrian-protection stiffener.' },
  { verb: 'Eliminate', q: 'What can be removed entirely — a part, feature, fastener, or step?', auto: 'Delete a bracket via integrated boss; mould-in-colour deletes the paint line; snap-fit deletes 2 fasteners.' },
  { verb: 'Reverse (Rearrange)', q: 'What if the order, orientation, or which-part-moves were flipped?', auto: 'Fixed nut + turning bolt-runner; assemble before paint; move the tool not the part in the machining cell.' },
];

// ── TRIZ Effects (function → physical effects that deliver it cheaply) ───────
export const EFFECTS = [
  { fn: 'Hold / fix two parts', effects: ['Thermal expansion (shrink-fit)', 'Elastic snap-fit', 'Magnetism', 'Vacuum / suction', 'Adhesion / self-pierce rivet', 'Friction (press-fit)'] },
  { fn: 'Sense position / presence', effects: ['Hall effect (magnetic)', 'Capacitance', 'Optical / IR', 'Inductive (eddy current)', 'Resistive contact'] },
  { fn: 'Absorb energy / cushion', effects: ['Plastic deformation (crush can)', 'Foam / porous cellular', 'Hydraulic / pneumatic damping', 'Phase change'] },
  { fn: 'Transmit torque', effects: ['Splines / form-fit', 'Friction clutch', 'Magnetic coupling', 'Shrink-fit interference'] },
  { fn: 'Move / actuate', effects: ['Bimetal (thermal)', 'Shape-memory alloy', 'Electromagnetic (solenoid)', 'Pneumatic', 'Electrostatic (micro)'] },
  { fn: 'Seal against fluid', effects: ['Elastomer lip', 'Interference / crush rib', 'Labyrinth (non-contact)', 'Magnetic ferrofluid', 'Surface tension'] },
  { fn: 'Dissipate / manage heat', effects: ['Conduction (heat pipe)', 'Phase-change material', 'Convection fins', 'Thermo-electric (Peltier)'] },
  { fn: 'Reduce mass / stiffen', effects: ['Curvature / sandwich', 'Topology-optimised ribs', 'Composite local reinforcement', 'Pre-stress (tension)'] },
];

// ── Trends of Engineering System Evolution (TESE) — classic laws ─────────────
export const TRENDS = [
  { name: 'Increasing ideality', next: 'Deliver the function with fewer parts / less material / no dedicated component (the ideal machine does the job while barely existing).', auto: 'Separate VCU → function absorbed into the inverter MCU (part deleted).' },
  { name: 'Mono → bi → poly-system', next: 'Combine identical or complementary units, then trim the shared elements.', auto: 'Left+right brackets in one die; 3-in-1 e-drive; then delete duplicated housings.' },
  { name: 'Increasing dynamism / segmentation', next: 'Make a rigid, single-piece part adjustable, segmented, or field-controlled.', auto: 'Fixed grille → active shutters (smaller cooling pack); one-piece → segmented cooling plate.' },
  { name: 'Transition to the super-system', next: 'Offload the function to a neighbouring system that is already there.', auto: 'Dedicated ANC box → speakers already in the B-pillar; standalone sensor → shared domain ECU.' },
  { name: 'Transition to micro-level / fields', next: 'Replace a mechanical mechanism with an electrical, magnetic, or material-level effect.', auto: 'Cable + lever shifter → shift-by-wire; mechanical linkage → Hall sensor.' },
  { name: 'Increasing controllability', next: 'Add feedback / software control so a cheaper, looser part can be tuned in service.', auto: 'Two mount variants → one switchable mount tuned by software.' },
  { name: 'Uneven development of parts (resolve the lagging part)', next: 'Find the one part holding the whole assembly at a high cost/spec and right-size it.', auto: 'Over-specified fastener grade across a joint set → downgrade the non-critical majority.' },
  { name: 'S-curve maturity', next: 'A mature part (small yearly gains) is ripe for a discontinuous jump — new material, process, or architecture.', auto: 'Mature stamped rail → hydroformed or roll-formed replacement.' },
  { name: 'Increasing use of resources / waste', next: 'Use a by-product, waste stream, or existing field for free.', auto: 'Stamping offal → small-bracket blanks; compressor waste heat → battery pre-conditioning.' },
];

// ── Design for Circularity / Disassembly (DfD) strategies (EU ELV context) ───
export const CIRCULARITY = [
  { strategy: 'Reversible joints', detail: 'Replace adhesive/weld with snap-fit, screw, or clip so the part comes apart at end-of-life — often also deletes a bonding/cure station now.' },
  { strategy: 'Mono-material design', detail: 'Make an assembly from one polymer/alloy family so it recycles without separation — deletes galvanic isolators and sorting cost.' },
  { strategy: 'Reduce fastener variety', detail: 'Fewer fastener types and head styles cut tool changes now and speed disassembly later.' },
  { strategy: 'Easy separation of dissimilar materials', detail: 'Design clean break-lines between metal and plastic so shredding/float-sink separation works — improves recyclate value.' },
  { strategy: 'Marked & accessible polymers', detail: 'ISO 11469 marking + accessible clips lets recyclers identify and remove high-value polymers fast.' },
  { strategy: 'Remanufacture-ready', detail: 'Standard interfaces + non-destructive disassembly enable core recovery (a second revenue/credit stream).' },
  { strategy: 'Design out hazardous joins', detail: 'Avoid PU foams bonded to trim and mixed-metal spot welds that block ELV recyclability targets (85% reuse/recycle).' },
];

// ── DETERMINISTIC CORES ───────────────────────────────────────────────────────

/** DFA (Boothroyd-Dewhurst): a part is THEORETICALLY NECESSARY if any of the
 *  three questions is true — it moves relative to already-assembled parts, it
 *  must be a different material for a fundamental reason, or it must be
 *  separable for assembly/service. Parts failing all three are consolidation
 *  candidates. Design efficiency ≈ minParts / actualParts. */
export function dfaScore(parts) {
  if (!Array.isArray(parts) || parts.length === 0) throw new Error('parts must be a non-empty array');
  const rows = parts.map((p) => {
    const moves = !!p.moves;
    const material = !!p.differentMaterial;
    const separate = !!p.mustSeparate;
    const necessary = moves || material || separate;
    return { name: String(p.name || 'part').slice(0, 80), moves, differentMaterial: material, mustSeparate: separate, necessary };
  });
  // THE BASE PART. In Boothroyd-Dewhurst the three questions are asked of
  // each part AS IT IS ADDED; the first part has nothing to be assembled to,
  // so it is theoretically necessary by definition. The old `|| 1` put the
  // minimum at 1 while still listing EVERY part as deletable — a bracket and
  // two screws read "delete all 3" — and a base with no flag of its own was
  // offered for deletion (Innovation review, 29 Sept 2026). The first line is
  // the base; the output marks it and the page asks for it first.
  rows[0].basePart = true;
  if (!rows[0].necessary) { rows[0].necessary = true; rows[0].necessaryBecause = 'base part'; }
  const total = rows.length;
  const theoreticalMin = rows.filter(r => r.necessary).length;
  const candidates = rows.filter(r => !r.necessary).map(r => r.name);
  const designEfficiencyPct = round((theoreticalMin / total) * 100, 0);
  return { totalParts: total, theoreticalMin, consolidationCandidates: candidates, designEfficiencyPct, rows };
}

/** Value Engineering: given functions with a cost share and a worth (importance)
 *  share, value index = worthShare / costShare. Index < ~0.7 = poor value (you
 *  pay more than the function is worth). Shares are normalised so the caller can
 *  pass raw weights. */
export function valueIndex(functions) {
  if (!Array.isArray(functions) || functions.length === 0) throw new Error('functions must be a non-empty array');
  const costSum = functions.reduce((s, f) => s + Math.max(0, Number(f.costPct) || 0), 0) || 1;
  const worthSum = functions.reduce((s, f) => s + Math.max(0, Number(f.worthPct) || 0), 0) || 1;
  const rows = functions.map((f) => {
    const cost = (Math.max(0, Number(f.costPct) || 0) / costSum) * 100;
    const worth = (Math.max(0, Number(f.worthPct) || 0) / worthSum) * 100;
    const vi = cost > 0 ? worth / cost : (worth > 0 ? Infinity : 1);
    return {
      name: String(f.name || 'function').slice(0, 80),
      costPct: round(cost, 1), worthPct: round(worth, 1),
      valueIndex: Number.isFinite(vi) ? round(vi, 2) : 9.99,
      verdict: vi < 0.7 ? 'poor value — attack' : vi > 1.4 ? 'under-served' : 'balanced',
    };
  });
  const poorValue = rows.filter(r => r.valueIndex < 0.7).sort((a, b) => a.valueIndex - b.valueIndex).map(r => r.name);
  return { rows, poorValueFunctions: poorValue };
}

/** Design-to-Cost: gap = current − target, allocated across cost buckets by
 *  their reducibility-weighted share. Bucket {name, cost, reducibility?0-1}. */
export function targetGap(currentCost, targetCost, buckets = []) {
  const cur = Number(currentCost), tgt = Number(targetCost);
  if (!Number.isFinite(cur) || cur <= 0) throw new Error('currentCost must be > 0');
  if (!Number.isFinite(tgt) || tgt < 0) throw new Error('targetCost must be ≥ 0');
  const gap = round(cur - tgt, 3);
  const gapPct = round((gap / cur) * 100, 1);
  let allocations = [];
  let reducibleTotal = null, shortfall = null;
  if (gap > 0 && Array.isArray(buckets) && buckets.length) {
    // A bucket can give at most cost × reducibility. The old proportional split
    // had no ceiling, so a €4 labour bucket at 50% reducibility was asked for
    // €5 (Innovation review, 29 Sept 2026). The split is now proportional to
    // each bucket's REDUCIBLE amount (cost × reducibility), which by
    // construction never exceeds a ceiling while the gap fits; the loop below
    // is a guard, not the mechanism. Whatever no bucket can absorb is reported
    // as a shortfall rather than hidden in an impossible target.
    // Reducibility is the caller's judgement; when absent it defaults to 0.5
    // and the row says so.
    const weighted = buckets.map(b => {
      const r = Number(b?.reducibility);
      const stated = b?.reducibility != null && b?.reducibility !== '' && Number.isFinite(r);
      const red = stated ? Math.min(1, Math.max(0, r)) : 0.5;
      const cost = Math.max(0, Number(b?.cost) || 0);
      return { name: String(b?.name || 'bucket'), cost, red, stated, cap: cost * red };
    });
    reducibleTotal = weighted.reduce((a, b) => a + b.cap, 0);
    const give = weighted.map(() => 0);
    let remaining = Math.min(gap, reducibleTotal);
    for (let pass = 0; pass < weighted.length && remaining > 1e-9; pass++) {
      const open = weighted.map((b, i) => i).filter(i => weighted[i].cap - give[i] > 1e-9);
      const w = open.reduce((a, i) => a + weighted[i].cap, 0);
      if (w <= 0) break;
      let used = 0;
      for (const i of open) {
        const want = remaining * weighted[i].cap / w;
        const got = Math.min(want, weighted[i].cap - give[i]);
        give[i] += got; used += got;
      }
      remaining -= used;
    }
    shortfall = round(Math.max(0, gap - reducibleTotal), 3);
    allocations = weighted.map((b, i) => ({
      name: b.name, target: round(give[i], 3), bucketCost: round(b.cost, 3),
      maxReducible: round(b.cap, 3), reducibility: b.red, reducibilityStated: b.stated,
    }));
  }
  return {
    currentCost: round(cur, 3), targetCost: round(tgt, 3), gap, gapPct,
    // `achievable` has always meant "the target is already met" (gap ≤ 0) —
    // kept for compatibility, and named plainly beside it.
    achievable: gap <= 0, alreadyMet: gap <= 0,
    allocations,
    ...(reducibleTotal != null ? { reducibleTotal: round(reducibleTotal, 3), shortfall, closableWithStatedReducibility: shortfall === 0 } : {}),
  };
}

/** FAST function-cost matrix — the classical VE core that valueIndex only
 *  approximates. Components carry cost; alloc[i][j] is the % of component i's
 *  cost spent serving function j. Invariants enforced (not assumed):
 *  every allocation row sums to 100 (±2 tolerance for LLM-proposed rounding),
 *  so function costs sum exactly to total component cost. Value index per
 *  function reuses the VE verdict bands (<0.7 poor value, >1.4 under-served).
 *  `components` = [{ name, cost }] (absolute £ or shares — only ratios matter),
 *  `functions`  = [{ name, worthPct }] (verb-noun names; worth normalised). */
export function functionCostMatrix(components, functions, alloc) {
  if (!Array.isArray(components) || components.length === 0) throw new Error('components must be a non-empty array');
  if (!Array.isArray(functions) || functions.length === 0) throw new Error('functions must be a non-empty array');
  if (!Array.isArray(alloc) || alloc.length !== components.length) throw new Error(`alloc needs one row per component (${components.length})`);

  const comps = components.map(c => ({ name: String(c.name || 'component').slice(0, 80), cost: Math.max(0, Number(c.cost) || 0) }));
  const totalCost = comps.reduce((s, c) => s + c.cost, 0);
  if (totalCost <= 0) throw new Error('component costs must sum to > 0');

  const norm = alloc.map((row, i) => {
    if (!Array.isArray(row) || row.length !== functions.length) throw new Error(`alloc row for "${comps[i].name}" needs ${functions.length} entries`);
    const r = row.map(v => Math.max(0, Number(v) || 0));
    const sum = r.reduce((s, v) => s + v, 0);
    if (Math.abs(sum - 100) > 2) throw new Error(`alloc row for "${comps[i].name}" sums to ${round(sum, 1)}% — must sum to 100%`);
    return r.map(v => (v / sum) * 100);   // exact renormalisation inside tolerance
  });

  const worthSum = functions.reduce((s, f) => s + Math.max(0, Number(f.worthPct) || 0), 0) || 1;
  const fnRows = functions.map((f, j) => {
    const cost = comps.reduce((s, c, i) => s + c.cost * norm[i][j] / 100, 0);
    const costPct = (cost / totalCost) * 100;
    const worthPct = (Math.max(0, Number(f.worthPct) || 0) / worthSum) * 100;
    const vi = costPct > 0 ? worthPct / costPct : (worthPct > 0 ? 9.99 : 1);
    return {
      name: String(f.name || 'function').slice(0, 80),
      cost: round(cost, 2), costPct: round(costPct, 1), worthPct: round(worthPct, 1),
      valueIndex: round(Math.min(vi, 9.99), 2),
      verdict: vi < 0.7 ? 'poor value — attack' : vi > 1.4 ? 'under-served' : 'balanced',
    };
  });
  const poorValue = fnRows.filter(r => r.valueIndex < 0.7).sort((a, b) => a.valueIndex - b.valueIndex).map(r => r.name);
  return {
    totalCost: round(totalCost, 2),
    functions: fnRows,
    components: comps.map((c, i) => ({ ...c, cost: round(c.cost, 2), costPct: round((c.cost / totalCost) * 100, 1), allocations: norm[i].map(v => round(v, 1)) })),
    poorValueFunctions: poorValue,
  };
}

// Relaxation ladders — ordered strict → loose, matching the cost engine's
// TOL_CLASSES / FIN_CLASSES driver keys exactly.
const TOL_LADDER = ['precision', 'tight', 'standard'];
const FIN_LADDER = ['polished', 'fine', 'standard'];

function engineCost(base, library) {
  return base.routeKeys.length > 1
    ? computeRouteCost({ ...base.input, route: base.routeKeys }, {}, null, library).totalShouldCost
    : computeShouldCost({ ...base.input, process: base.routeKeys[0] }, {}, null, library).totalShouldCost;
}

/** Spec/Tolerance Challenge — REAL engine deltas, not LLM guesses. Re-costs the
 *  part at each relaxation step (tolerance class down, finish down, critical-
 *  characteristic count halved/zeroed) via the deterministic engine's own
 *  drawing drivers, and returns only steps that change the input. The LLM's
 *  later job is deciding WHICH drawing characteristics can take the relaxation
 *  and framing the risk — never inventing the saving. */
export function specRelaxationDeltas(input, library = null) {
  const mat = resolveMaterial(String(input?.material || ''), library?.MATERIALS);
  const route = resolveRoute(String(input?.process || ''), library?.PROCESSES);
  if (!mat || !route || route.keys.length === 0) throw new Error('material/process not recognised by the cost engine');
  const weightKg = Number(input?.weightKg);
  if (!Number.isFinite(weightKg) || weightKg <= 0) throw new Error('weightKg must be > 0');

  const tol = TOL_LADDER.includes(input?.toleranceClass) ? input.toleranceClass : 'standard';
  const fin = FIN_LADDER.includes(input?.surfaceFinish) ? input.surfaceFinish : 'standard';
  const cc = Math.max(0, Math.min(50, Number(input?.criticalCharacteristics) || 0));
  const base = {
    routeKeys: route.keys,
    input: {
      material: mat.key, weightKg,
      annualVolume: Number(input?.annualVolume) > 0 ? Number(input.annualVolume) : 80000,
      region: input?.region || 'Germany',
      toleranceClass: tol, surfaceFinish: fin, criticalCharacteristics: cc,
    },
  };
  const baseline = engineCost(base, library);
  const steps = [];
  const addStep = (id, kind, label, patch) => {
    const t = engineCost({ ...base, input: { ...base.input, ...patch } }, library);
    const savingEur = baseline - t;
    steps.push({ id, kind, label, newTotal: round(t, 3), savingEur: round(savingEur, 3), savingPct: round((savingEur / baseline) * 100, 1) });
  };
  for (let i = TOL_LADDER.indexOf(tol) + 1; i < TOL_LADDER.length; i++) {
    addStep(`tol-${TOL_LADDER[i]}`, 'tolerance', `Tolerance ${tol} → ${TOL_LADDER[i]}`, { toleranceClass: TOL_LADDER[i] });
  }
  for (let i = FIN_LADDER.indexOf(fin) + 1; i < FIN_LADDER.length; i++) {
    addStep(`fin-${FIN_LADDER[i]}`, 'finish', `Surface finish ${fin} → ${FIN_LADDER[i]}`, { surfaceFinish: FIN_LADDER[i] });
  }
  if (cc > 1) addStep('cc-half', 'test', `Critical characteristics ${cc} → ${Math.floor(cc / 2)} (de-designate non-safety CCs)`, { criticalCharacteristics: Math.floor(cc / 2) });
  if (cc > 0) addStep('cc-zero', 'test', `Critical characteristics ${cc} → 0 (all CCs de-designated)`, { criticalCharacteristics: 0 });

  return {
    baseline: round(baseline, 3),
    material: mat.key, process: route.keys.join(' → '), region: base.input.region,
    current: { toleranceClass: tol, surfaceFinish: fin, criticalCharacteristics: cc },
    steps,
  };
}

/** Teardown delta — the A2Mac1 pattern at manual-entry scale. Two normalized
 *  attribute sets (subject vs benchmark) → deterministic delta list. Numeric
 *  attributes get delta/deltaPct and a significance flag (≥10% adverse gap);
 *  categorical attributes flag any mismatch. The LLM's later job is explaining
 *  HOW the benchmark achieves each significant delta — never inventing gaps. */
// Attributes where MORE is worse — the teardown convention for mass, count,
// cost and time. Anything else has no known polarity: its gap is reported both
// ways with `adverse: null`, never assumed. A caller can state it per
// attribute with `better: 'lower' | 'higher'`.
const LOWER_IS_BETTER = /\b(mass|weight|cost|price|part(?:s| count)?|piece count|fasteners?|screws?|bolts?|rivets?|clips?|welds?|spot welds?|joints?|time|cycle|seconds?|minutes?|steps?|operations?|variants?|scrap|waste|co2e?|emissions?|tooling)\b/i;

/** A leading number with an optional unit: "2.4 kg", "1,200", "~12 pcs". */
function numberWithUnit(v) {
  const m = /^\s*~?\s*([-−]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[-−]?\d+(?:\.\d+)?)\s*([^\d\s].*)?$/.exec(String(v ?? ''));
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, '').replace('−', '-'));
  return Number.isFinite(n) ? { n, unit: (m[2] || '').trim().toLowerCase() } : null;
}

export function teardownDelta(subject, benchmark) {
  const rows = [];
  const norm = (side) => {
    const out = new Map();
    for (const a of Array.isArray(side) ? side : []) {
      const name = String(a?.name || '').trim().slice(0, 80);
      if (!name) continue;
      out.set(name.toLowerCase(), { name, value: a?.value, better: a?.better === 'lower' || a?.better === 'higher' ? a.better : null });
    }
    return out;
  };
  const subj = norm(subject);
  const bench = norm(benchmark);
  if (subj.size === 0 || bench.size === 0) throw new Error('subject and benchmark each need at least one attribute');
  for (const [key, s] of subj) {
    const b = bench.get(key);
    if (!b) { rows.push({ attribute: s.name, subject: s.value, benchmark: null, kind: 'subject-only', significant: false }); continue; }
    // NUMBERS WITH UNITS ARE NUMBERS. "2.4 kg" vs "2.0 kg" — exactly what the
    // verbatim extraction produces — used to be compared as TEXT ("differs",
    // no size), and "1,200" likewise. A leading number is read; the units must
    // match (or one side be bare), else the pair stays categorical and says why.
    const sv = numberWithUnit(s.value), bv = numberWithUnit(b.value);
    const unitsAgree = sv && bv && (sv.unit === bv.unit || !sv.unit || !bv.unit);
    if (sv && bv && unitsAgree) {
      const sn = sv.n, bn = bv.n;
      const delta = round(sn - bn, 3);
      const deltaPct = bn !== 0 ? round((delta / Math.abs(bn)) * 100, 1) : null;
      const better = s.better || b.better || (LOWER_IS_BETTER.test(s.name) ? 'lower' : null);
      const direction = delta > 0 ? 'subject-higher' : delta < 0 ? 'subject-lower' : 'equal';
      // SIGNIFICANCE IS A GAP EITHER WAY. It used to be "subject higher by
      // >10%" only, so a stiffness 33% below the benchmark, an efficiency 5
      // points down, or 4 fasteners against the benchmark's 0 (a zero base, so
      // no percentage at all) were never flagged. Polarity decides whether the
      // gap is ADVERSE; it does not decide whether it is a gap.
      const significant = deltaPct != null ? Math.abs(deltaPct) > 10 : delta !== 0;
      const adverse = !significant || !better ? (significant ? null : false)
        : better === 'lower' ? delta > 0 : delta < 0;
      rows.push({
        attribute: s.name, subject: s.value, benchmark: b.value,
        subjectValue: sn, benchmarkValue: bn, unit: sv.unit || bv.unit || null,
        delta, deltaPct, kind: 'numeric', direction, better, adverse, significant,
        ...(deltaPct == null && delta !== 0 ? { note: 'benchmark is zero — no percentage, the absolute gap is the finding' } : {}),
      });
    } else {
      const differs = String(s.value ?? '').trim().toLowerCase() !== String(b.value ?? '').trim().toLowerCase();
      rows.push({ attribute: s.name, subject: s.value, benchmark: b.value, kind: 'categorical', direction: differs ? 'differs' : 'equal', significant: differs,
        ...(sv && bv && !unitsAgree ? { note: `units differ (${sv.unit} vs ${bv.unit}) — not compared as numbers` } : {}) });
    }
  }
  for (const [key, b] of bench) {
    if (!subj.has(key)) rows.push({ attribute: b.name, subject: null, benchmark: b.value, kind: 'benchmark-only', significant: false });
  }
  const significantDeltas = rows.filter(r => r.significant);
  return { rows, significantDeltas, significantCount: significantDeltas.length };
}

/** Morphological (Zwicky): combination space of sub-functions × options, plus a
 *  deterministic diverse sample of concepts (Latin-square-style spread so no
 *  single option dominates the sample). */
export function morphology(subFunctions, sampleN = 5) {
  if (!Array.isArray(subFunctions) || subFunctions.length === 0) throw new Error('subFunctions must be a non-empty array');
  const dims = subFunctions.map(sf => ({ name: String(sf.name || 'sub-function').slice(0, 60), options: (Array.isArray(sf.options) ? sf.options : []).map(o => String(o).slice(0, 60)) }))
    .filter(d => d.options.length > 0);
  if (dims.length === 0) throw new Error('each sub-function needs at least one option');
  const totalCombinations = dims.reduce((n, d) => n * d.options.length, 1);
  const n = Math.max(0, Math.min(Number(sampleN) || 0, totalCombinations));
  // DISTINCT CONCEPTS, SPREAD APART. The old diagonal walk repeated itself
  // whenever the option counts shared a factor: six "concepts" from a 3×3×3
  // space were three concepts listed twice (Innovation review, 29 Sept 2026).
  // Now a greedy max-min spread: each pick is the combination furthest (in
  // sub-functions changed) from every pick so far, ties broken toward options
  // used least, then by index — deterministic, and never a repeat.
  const decode = (k) => { const idx = []; for (let d = dims.length - 1; d >= 0; d--) { idx[d] = k % dims[d].options.length; k = Math.floor(k / dims[d].options.length); } return idx; };
  const POOL = 4096;
  const step = totalCombinations <= POOL ? 1 : Math.floor(totalCombinations / POOL);
  const pool = [];
  for (let k = 0; k < totalCombinations && pool.length < POOL; k += step) pool.push(decode(k));
  const chosen = [], usage = dims.map(d => d.options.map(() => 0));
  const dist = (a, b) => a.reduce((s, v, i) => s + (v !== b[i] ? 1 : 0), 0);
  const taken = new Set();
  for (let i = 0; i < n; i++) {
    let best = null, bestKey = null;
    for (let c = 0; c < pool.length; c++) {
      if (taken.has(c)) continue;
      const minD = chosen.length ? Math.min(...chosen.map(x => dist(x, pool[c]))) : dims.length;
      const use = pool[c].reduce((s, v, d) => s + usage[d][v], 0);
      const key = [minD, -use];
      if (!bestKey || key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) { best = c; bestKey = key; }
    }
    if (best == null) break;
    taken.add(best); chosen.push(pool[best]);
    pool[best].forEach((v, d) => { usage[d][v]++; });
  }
  const concepts = chosen.map(idx => dims.map((d, di) => ({ subFunction: d.name, option: d.options[idx[di]] })));
  return { dimensions: dims, totalCombinations, sampledConcepts: concepts };
}
