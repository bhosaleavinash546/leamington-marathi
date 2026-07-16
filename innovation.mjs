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

const round = (x, dp = 1) => Number(Number(x).toFixed(dp));

// ── Method catalogue (drives the UI picker + the Analyze lenses) ─────────────
export const METHODS = [
  { id: 'triz', name: 'TRIZ', tier: 1, mode: 'contradiction', blurb: 'Break an engineering trade-off with 40 inventive principles.', input: 'contradiction' },
  { id: 'value-engineering', name: 'Value Engineering', tier: 1, mode: 'functional', blurb: 'Find functions where you pay a lot for little value, then attack them.', input: 'part' },
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
