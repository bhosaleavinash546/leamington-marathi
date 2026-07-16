// ─────────────────────────────────────────────────────────────────────────────
// TRIZ core — deterministic inventive-principle recommender for cost
// contradictions ("lighter WITHOUT losing stiffness", "fewer parts WITHOUT
// losing serviceability").
//
// Contents:
//   • The 40 classical inventive principles (Altshuller), each with automotive
//     cost-engineering examples.
//   • The 39 classical engineering parameters.
//   • A principle recommender: curated high-confidence classic pairs first,
//     then a per-parameter affinity model for full coverage.
//
// HONESTY NOTE: this is an automotive-tuned mapping INSPIRED by the classical
// contradiction matrix — not a verbatim reproduction of the 1969 matrix.
// Recommendations are deterministic and explainable; the LLM only turns the
// chosen principles into concrete embodiments (which the engine then checks).
// ─────────────────────────────────────────────────────────────────────────────

export const PRINCIPLES = [
  { id: 1,  name: 'Segmentation', hint: 'Divide into independent parts; make sectional; increase fragmentation.', auto: 'Split a large HPDC into two simpler dies to halve tooling risk; segmented battery cooling plates; modular seat frame.' },
  { id: 2,  name: 'Taking out', hint: 'Extract the disturbing part or the only necessary part.', auto: 'Move the sensor off the hot casting to the harness side; remote-mount the compressor; separate wear part as cheap insert.' },
  { id: 3,  name: 'Local quality', hint: 'Make each part work where its properties are needed; non-uniform structure.', auto: 'Tailor-welded/rolled blanks — thickness only where loads are; local heat treat instead of through-hardening; PHS soft zones.' },
  { id: 4,  name: 'Asymmetry', hint: 'Replace symmetry with asymmetry; increase existing asymmetry.', auto: 'Asymmetric bushing stiffness tunes NVH without adding mass; asymmetric door seal profile cuts material 15%.' },
  { id: 5,  name: 'Merging', hint: 'Combine identical/similar objects or operations in space or time.', auto: 'Gigacasting: 70 stampings → 1 casting; 3-in-1 e-drive (motor+inverter+reducer); combine drill+chamfer in one tool.' },
  { id: 6,  name: 'Universality', hint: 'Make a part perform multiple functions; eliminate other parts.', auto: 'Battery pack as structural floor (CTB); bracket that is also the heat sink; closing plate doubling as pedestrian-protection stiffener.' },
  { id: 7,  name: 'Nested doll', hint: 'Place objects inside each other; pass through cavities.', auto: 'Route the harness through the roof bow cavity; nested shipping racks cut logistics 40%; telescoping steering column.' },
  { id: 8,  name: 'Anti-weight', hint: 'Compensate weight by lift/buoyancy or interaction with environment.', auto: 'Gas struts replace counterweights; use exhaust flow for muffler valve actuation instead of an actuator.' },
  { id: 9,  name: 'Preliminary anti-action', hint: 'Pre-stress against known harmful working stresses.', auto: 'Shot-peen springs to allow thinner wire; pre-tensioned belts allow lighter anchors; compressive-stressed glass.' },
  { id: 10, name: 'Preliminary action', hint: 'Perform required changes before they are needed; pre-arrange objects.', auto: 'Pre-applied thread-locker deletes a dispensing station; pre-lubed bushings; kitted fasteners at lineside.' },
  { id: 11, name: 'Beforehand cushioning', hint: 'Prepare emergency means to compensate low reliability.', auto: 'Sacrificial anode instead of full stainless; designed crush initiators let the rest of the rail be thinner.' },
  { id: 12, name: 'Equipotentiality', hint: 'Limit position changes; eliminate lifting/lowering work.', auto: 'Design assembly sequence so the pack never needs re-orientation — deletes a €2M turnover fixture.' },
  { id: 13, name: 'The other way round', hint: 'Invert the action; make movable parts fixed and vice versa.', auto: 'Fixed nut + turning bolt-runner instead of nut-runner access holes; move the tool, not the part, in machining cells.' },
  { id: 14, name: 'Spheroidality / curvature', hint: 'Use curves instead of straight lines; rollers, balls, spirals.', auto: 'Curved crash-can profile absorbs same energy at −18% mass; roll-formed curved sill replaces stamped 2-piece.' },
  { id: 15, name: 'Dynamics', hint: 'Make characteristics adjustable; divide into relatively movable parts.', auto: 'Active grille shutters allow smaller cooling pack; switchable engine mounts replace two mount variants.' },
  { id: 16, name: 'Partial or excessive actions', hint: 'If 100% is hard, use slightly less or more.', auto: 'E-coat only the corrosion-critical zones; over-mould only the seal land instead of the full housing.' },
  { id: 17, name: 'Another dimension', hint: 'Move into 2D/3D; multi-storey; tilt; use the other side.', auto: 'Stack PCBAs vertically to shrink the housing; use the underside of the floor as the aero surface (deletes panels).' },
  { id: 18, name: 'Mechanical vibration', hint: 'Use oscillation/resonance/ultrasonics.', auto: 'Ultrasonic welding replaces adhesive + cure oven; vibratory bowl feeding deletes manual orientation labour.' },
  { id: 19, name: 'Periodic action', hint: 'Use periodic/pulsed actions instead of continuous.', auto: 'Pulsed seam welding cuts energy 30%; duty-cycled pump replaces continuous-run + relief valve.' },
  { id: 20, name: 'Continuity of useful action', hint: 'Work without idle runs; all parts at full load.', auto: 'Balance the line so the €180/hr HPDC cell never waits; combine left/right parts in one die to fill press strokes.' },
  { id: 21, name: 'Skipping (hurrying)', hint: 'Do hazardous/harmful steps at high speed.', auto: 'Laser trim in-die at line speed instead of an offline trim press; flash-cure powder coat.' },
  { id: 22, name: 'Blessing in disguise', hint: 'Use harmful factors for positive effect.', auto: 'Use stamping offal as small-bracket blanks (−12% material); use waste heat from the compressor for battery pre-conditioning.' },
  { id: 23, name: 'Feedback', hint: 'Introduce or adapt feedback.', auto: 'In-die force monitoring drops scrap 3%→0.5%; adaptive torque tools delete re-torque audit stations.' },
  { id: 24, name: 'Intermediary', hint: 'Use an intermediate carrier or temporary object.', auto: 'Removable carrier film lets one robot handle five trim variants; masking plug reused 10,000 cycles.' },
  { id: 25, name: 'Self-service', hint: 'Object serves itself; use waste resources.', auto: 'Self-piercing rivets (the part is its own die); self-locating snap features delete fixtures; regen braking as service brake assist (smaller rotors).' },
  { id: 26, name: 'Copying', hint: 'Use cheap copies instead of expensive/fragile objects.', auto: 'Vision-based virtual gauge replaces €80k check fixture; digital-twin trial assembly replaces two prototype loops.' },
  { id: 27, name: 'Cheap short-living objects', hint: 'Replace one expensive object with many cheap ones, conceding some qualities.', auto: 'Consumable aluminium tool for launch volumes, steel tool only after demand proof; peel-off protective film instead of blankets.' },
  { id: 28, name: 'Mechanics substitution', hint: 'Replace mechanical with fields (optical, electrical, magnetic).', auto: 'Shift-by-wire deletes cables + levers; hall sensor replaces mechanical position linkage; magnetic door checks.' },
  { id: 29, name: 'Pneumatics and hydraulics', hint: 'Use gas/liquid instead of solid parts.', auto: 'Air springs replace steel + variants (one part, software tune); hydroforming replaces 4-piece welded rail.' },
  { id: 30, name: 'Flexible shells and thin films', hint: 'Use flexible shells/films instead of 3D structures; isolate with films.', auto: 'Film-insert moulded decor deletes paint line; flexible PCB replaces rigid board + connectors + brackets.' },
  { id: 31, name: 'Porous materials', hint: 'Make objects porous or add porous elements.', auto: 'MuCell foamed injection moulding −10% resin at equal stiffness; porous sound absorber replaces heavy mass barrier.' },
  { id: 32, name: 'Colour changes', hint: 'Change colour/transparency; use additives for observation.', auto: 'Mould-in-colour deletes the paint process (−€8-15/part); UV-fluorescent sealant enables automated inspection.' },
  { id: 33, name: 'Homogeneity', hint: 'Make interacting objects from the same material.', auto: 'Mono-material door module (all PP) enables recycling credit + deletes galvanic isolation; same-alloy self-pierce riveting.' },
  { id: 34, name: 'Discarding and recovering', hint: 'Make parts disappear after use or restore them in-process.', auto: 'Soluble 3D-print cores for hollow castings; returnable packaging loop replaces one-way crates.' },
  { id: 35, name: 'Parameter changes', hint: 'Change state, concentration, flexibility, temperature.', auto: 'Warm forming lets 6xxx replace 5xxx at same springback; higher-solids paint cuts booth passes from 3 to 2.' },
  { id: 36, name: 'Phase transitions', hint: 'Use phenomena of phase change.', auto: 'PCM in battery pack shaves peak-cooling hardware; heat-shrink boots replace clamped covers.' },
  { id: 37, name: 'Thermal expansion', hint: 'Use expansion/contraction; different coefficients.', auto: 'Shrink-fit ring gear deletes bolts; bimetal snap disc replaces a sensor + controller for a flap.' },
  { id: 38, name: 'Strong oxidants', hint: 'Use enriched atmospheres/oxidisers.', auto: 'Plasma pre-treatment replaces primer on PP bumpers; oxygen-boosted brazing cuts cycle time.' },
  { id: 39, name: 'Inert atmosphere', hint: 'Use inert environments; add neutral parts.', auto: 'Nitrogen-assisted moulding for Class-A without paint; vacuum brazing deletes flux + wash line.' },
  { id: 40, name: 'Composite materials', hint: 'Change from uniform to composite materials.', auto: 'Steel-CFRP hybrid B-pillar (−40% mass at +cost only where it pays); glass-mat thermoplastic seat back.' },
];

export const PARAMETERS = [
  { id: 1, name: 'Weight of moving object' }, { id: 2, name: 'Weight of stationary object' },
  { id: 3, name: 'Length of moving object' }, { id: 4, name: 'Length of stationary object' },
  { id: 5, name: 'Area of moving object' }, { id: 6, name: 'Area of stationary object' },
  { id: 7, name: 'Volume of moving object' }, { id: 8, name: 'Volume of stationary object' },
  { id: 9, name: 'Speed' }, { id: 10, name: 'Force' },
  { id: 11, name: 'Stress or pressure' }, { id: 12, name: 'Shape' },
  { id: 13, name: 'Stability of the object' }, { id: 14, name: 'Strength' },
  { id: 15, name: 'Duration of action (moving)' }, { id: 16, name: 'Duration of action (stationary)' },
  { id: 17, name: 'Temperature' }, { id: 18, name: 'Illumination intensity' },
  { id: 19, name: 'Energy use (moving)' }, { id: 20, name: 'Energy use (stationary)' },
  { id: 21, name: 'Power' }, { id: 22, name: 'Loss of energy' },
  { id: 23, name: 'Loss of substance' }, { id: 24, name: 'Loss of information' },
  { id: 25, name: 'Loss of time' }, { id: 26, name: 'Quantity of substance' },
  { id: 27, name: 'Reliability' }, { id: 28, name: 'Measurement accuracy' },
  { id: 29, name: 'Manufacturing precision' }, { id: 30, name: 'External harm affects the object' },
  { id: 31, name: 'Object-generated harmful factors' }, { id: 32, name: 'Ease of manufacture' },
  { id: 33, name: 'Ease of operation' }, { id: 34, name: 'Ease of repair' },
  { id: 35, name: 'Adaptability or versatility' }, { id: 36, name: 'Device complexity' },
  { id: 37, name: 'Difficulty of detecting/measuring' }, { id: 38, name: 'Extent of automation' },
  { id: 39, name: 'Productivity' },
];

// High-confidence classical pairs (improving × worsening → principles), the
// ones cost engineers hit constantly. Curated, not exhaustive.
const CURATED = {
  '1|14': [1, 8, 40, 15],    // lighter (moving) vs strength
  '2|14': [40, 26, 27, 1],   // lighter (stationary) vs strength
  '1|13': [1, 35, 19, 39],   // lighter vs stability
  '14|32': [1, 3, 10, 40],   // stronger vs ease of manufacture
  '32|14': [1, 3, 10, 40],
  '36|32': [1, 26, 12, 17],  // simpler device vs manufacturability
  '32|36': [1, 13, 27, 26],  // easier to make vs complexity
  '26|32': [35, 29, 25, 10], // less material vs ease of manufacture
  '32|27': [1, 35, 12, 18],  // easier to make vs reliability
  '27|32': [1, 35, 12, 18],
  '39|29': [10, 18, 28, 32], // productivity vs precision
  '29|39': [10, 18, 28, 32],
  '25|32': [35, 28, 34, 4],  // faster vs ease of manufacture
  '36|34': [1, 13, 11, 26],  // simpler vs serviceability
  '34|36': [1, 11, 10, 26],  // serviceable vs complexity
  '2|32': [1, 27, 36, 13],   // lighter (stationary) vs manufacturability
  '1|27': [3, 8, 10, 40],    // lighter vs reliability
  '23|32': [35, 15, 23, 10], // less scrap vs ease of manufacture
  '27|36': [13, 35, 1, 11],  // reliability vs complexity
  '14|26': [14, 35, 34, 10], // strength vs amount of material
};

// Per-parameter affinity: principles that classically address each parameter.
// Used for full coverage when a pair is not curated: score = improving-side
// affinity, +1 boost when the principle also mitigates the worsening side.
const AFFINITY = {
  1: [1, 8, 15, 35, 40, 28], 2: [1, 10, 26, 35, 40, 27], 3: [1, 7, 14, 17, 4, 35], 4: [1, 7, 14, 17, 35, 26],
  5: [2, 14, 17, 30, 26, 4], 6: [2, 17, 30, 26, 39, 16], 7: [1, 7, 17, 29, 35, 4], 8: [7, 17, 35, 2, 30, 1],
  9: [13, 28, 15, 19, 35, 38], 10: [8, 10, 18, 28, 35, 37], 11: [10, 35, 14, 36, 22, 1], 12: [1, 4, 14, 17, 30, 35],
  13: [33, 1, 35, 39, 11, 9], 14: [3, 9, 40, 10, 14, 35], 15: [11, 27, 3, 35, 10, 34], 16: [11, 16, 34, 35, 3, 39],
  17: [17, 36, 37, 35, 19, 32], 18: [32, 18, 26, 17, 28, 24], 19: [19, 35, 28, 2, 25, 12], 20: [19, 35, 28, 27, 18, 16],
  21: [19, 35, 2, 28, 15, 25], 22: [22, 19, 35, 2, 6, 25], 23: [22, 23, 25, 35, 3, 34], 24: [24, 26, 32, 23, 10, 28],
  25: [10, 20, 25, 35, 28, 5], 26: [3, 26, 29, 31, 35, 16], 27: [3, 11, 23, 27, 35, 40], 28: [23, 26, 28, 32, 37, 24],
  29: [3, 10, 28, 32, 37, 18], 30: [11, 22, 24, 30, 39, 33], 31: [2, 22, 24, 33, 39, 35], 32: [1, 13, 27, 32, 35, 25],
  33: [1, 13, 25, 32, 34, 12], 34: [1, 2, 10, 11, 34, 25], 35: [1, 6, 15, 29, 35, 16], 36: [1, 13, 26, 28, 36, 2],
  37: [23, 26, 28, 37, 24, 32], 38: [23, 25, 28, 38, 35, 26], 39: [5, 10, 20, 25, 38, 35],
};

/** Deterministic principle recommendation for an (improving, worsening) pair. */
export function recommendPrinciples(improvingId, worseningId, topN = 4) {
  const imp = Number(improvingId), wor = Number(worseningId);
  if (!AFFINITY[imp] || !AFFINITY[wor]) throw new Error('parameter ids must be 1–39');
  const curated = CURATED[`${imp}|${wor}`];
  let ids, basis;
  if (curated) {
    ids = curated.slice(0, topN);
    basis = 'curated classical pair';
  } else {
    // Affinity scoring: improving-side position (earlier = stronger), boosted
    // when the principle also serves the worsening side.
    const worSet = new Set(AFFINITY[wor]);
    ids = AFFINITY[imp]
      .map((p, i) => ({ p, score: (AFFINITY[imp].length - i) + (worSet.has(p) ? 2 : 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
      .map(x => x.p);
    basis = 'affinity model (pair not in curated set)';
  }
  return {
    improving: PARAMETERS.find(p => p.id === imp),
    worsening: PARAMETERS.find(p => p.id === wor),
    basis,
    principles: ids.map(id => PRINCIPLES.find(pr => pr.id === id)),
  };
}

/** Compact catalogue for prompts/UI. */
export function trizCatalogue() {
  return { principles: PRINCIPLES, parameters: PARAMETERS };
}
