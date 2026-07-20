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
  const total = rows.length;
  const theoreticalMin = rows.filter(r => r.necessary).length || 1;
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
  if (gap > 0 && Array.isArray(buckets) && buckets.length) {
    // weight = bucket cost × reducibility (default reducibility 0.5)
    const weighted = buckets.map(b => ({ name: String(b.name || 'bucket'), cost: Math.max(0, Number(b.cost) || 0), red: Math.min(1, Math.max(0, b.reducibility ?? 0.5)) }));
    const wSum = weighted.reduce((s, b) => s + b.cost * b.red, 0) || 1;
    allocations = weighted.map(b => ({ name: b.name, target: round(gap * (b.cost * b.red) / wSum, 3) }));
  }
  return { currentCost: round(cur, 3), targetCost: round(tgt, 3), gap, gapPct, achievable: gap <= 0, allocations };
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
export function teardownDelta(subject, benchmark) {
  const rows = [];
  const norm = (side) => {
    const out = new Map();
    for (const a of Array.isArray(side) ? side : []) {
      const name = String(a?.name || '').trim().slice(0, 80);
      if (!name) continue;
      out.set(name.toLowerCase(), { name, value: a?.value });
    }
    return out;
  };
  const subj = norm(subject);
  const bench = norm(benchmark);
  if (subj.size === 0 || bench.size === 0) throw new Error('subject and benchmark each need at least one attribute');
  for (const [key, s] of subj) {
    const b = bench.get(key);
    if (!b) { rows.push({ attribute: s.name, subject: s.value, benchmark: null, kind: 'subject-only', significant: false }); continue; }
    const sn = Number(s.value), bn = Number(b.value);
    if (Number.isFinite(sn) && Number.isFinite(bn) && String(s.value).trim() !== '' && String(b.value).trim() !== '') {
      const delta = round(sn - bn, 3);
      const deltaPct = bn !== 0 ? round((delta / Math.abs(bn)) * 100, 1) : null;
      rows.push({
        attribute: s.name, subject: sn, benchmark: bn, delta, deltaPct, kind: 'numeric',
        // Adverse = subject carries MORE than the benchmark (mass, parts,
        // fasteners, cost — for these attributes more is worse).
        direction: delta > 0 ? 'subject-higher' : delta < 0 ? 'subject-lower' : 'equal',
        significant: deltaPct != null && deltaPct > 10,
      });
    } else {
      const differs = String(s.value ?? '').trim().toLowerCase() !== String(b.value ?? '').trim().toLowerCase();
      rows.push({ attribute: s.name, subject: s.value, benchmark: b.value, kind: 'categorical', direction: differs ? 'differs' : 'equal', significant: differs });
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
  const n = Math.min(sampleN, totalCombinations);
  const concepts = [];
  for (let i = 0; i < n; i++) {
    // diagonal walk: option index i+dim spread modulo option count → spreads picks
    const combo = dims.map((d, di) => d.options[(i + di) % d.options.length]);
    concepts.push(dims.map((d, di) => ({ subFunction: d.name, option: combo[di] })));
  }
  return { dimensions: dims, totalCombinations, sampledConcepts: concepts };
}
