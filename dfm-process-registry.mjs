// ─────────────────────────────────────────────────────────────────────────────
// Material → manufacturing process → DFM rule family.
//
// WHY THIS FILE EXISTS. The DFM Studio hand-typed a ten-material, six-process
// subset of the tables in costing-engine.mjs and then collapsed it into four
// rule families. Two of those mappings were wrong in ways that put wrong
// findings in front of a customer:
//
//   * "Gravity Die Casting" was routed to the HPDC rules, which want a 1.0-3.5 mm
//     wall. A gravity casting runs 3-8 mm, so every gravity part failed the wall
//     rule automatically and was priced for a saving that does not exist.
//   * "Sand Casting" mapped to NOTHING, so it silently fell through to a
//     speculative sweep of all four families — injection-moulding findings on a
//     sand casting.
//
// costing-engine.mjs ALREADY knows every material, its family, every process,
// and which material families each process accepts. Deriving the pickers and the
// rule routing from those same tables is what stops the two halves of the product
// from drifting apart again. Nothing here re-declares a material or a process.
//
// A process that shapes the part gets a DFM family. A process that does not —
// e-coat, plating, heat treatment, washing — is listed with an explicit reason
// rather than silently offered and then silently unanalysed. "This process has no
// geometric DFM rules" is a real answer; an empty report is not.
// ─────────────────────────────────────────────────────────────────────────────
import { MATERIALS, PROCESSES } from './costing-engine.mjs';
import { PROCESS_FAMILIES } from './dfm-rule-catalogue.mjs';

/** Display names for the top-level material categories, in menu order. */
export const MATERIAL_FAMILIES = {
  ferrous: 'Steel & stainless',
  castiron: 'Cast iron',
  aluminium: 'Aluminium',
  magnesium: 'Magnesium',
  zinc: 'Zinc',
  copper: 'Copper & brass',
  titanium: 'Titanium',
  plastic: 'Thermoplastic',
  elastomer: 'Elastomer',
  composite: 'Composite',
  electricalsteel: 'Electrical steel',
  glass: 'Glass',
};

/**
 * Which DFM rule family judges a part made by each costing process.
 *
 * `null` is a POSITIVE statement, not an oversight: that process does not shape
 * the geometry, so no geometric rule applies to it and the reason is printed.
 */
export const PROCESS_TO_DFM_FAMILY = {
  // ── Shape-forming ────────────────────────────────────────────────────────
  'Machining (CNC)': 'machining',
  'Turning (CNC)': 'turning',
  'Wire EDM': 'wire-edm',
  'Deep-Hole / Gun Drilling': 'deep-hole-drilling',
  'Broaching': 'broaching',
  'Injection Moulding': 'injection-moulding',
  'Thermoforming': 'thermoforming',
  'Rotational Moulding': 'rotational-moulding',
  'Powder Metallurgy (Press & Sinter)': 'powder-metallurgy',
  'Metal Injection Moulding (MIM)': 'mim',
  'Laser Powder Bed Fusion (DMLS/SLM)': 'lpbf',
  'Die Casting (Aluminium)': 'hpdc',
  'Die Casting (Zinc)': 'hpdc-zinc',
  'Gravity Die Casting': 'gravity-die',
  'Sand Casting': 'sand-casting',
  'Investment Casting': 'investment-casting',
  'Low-Pressure Die Casting': 'lpdc',
  'Squeeze Casting': 'squeeze-casting',
  'Semi-Solid Casting (Thixo/Rheo)': 'semi-solid',
  'Shell Mould Casting': 'shell-mould',
  'Centrifugal Casting': 'centrifugal',
  // DELIBERATELY THE SAME FAMILY AS HPDC, and that is a statement rather than an
  // omission. Evacuating the cavity changes the GAS in it, not the geometry the
  // die can produce: the wall, draft, core slenderness and undercut limits are
  // the die-casting limits either way. What vacuum buys is porosity low enough
  // to heat-treat and weld — a metallurgical property, and this tool measures
  // geometry. Giving it a near-copy family would invent six thresholds to say
  // the same thing the HPDC family already says correctly.
  'Vacuum-Assisted Die Casting': 'hpdc',
  'Stamping / Deep Drawing': 'sheet-metal',
  'Fine Blanking': 'fine-blanking',
  'Hot Stamping (Press Hardening)': 'hot-stamping',
  'Deep Drawing (Multi-stage)': 'deep-drawing',
  'Metal Spinning': 'metal-spinning',
  'Cold Heading / Upsetting': 'cold-heading',
  'Open-Die Forging': 'open-die-forging',
  'Laser Cutting + Bending': 'sheet-metal',
  'Lamination Stamping (Electrical Steel)': 'sheet-metal',
  'Roll Forming': 'roll-forming',
  'Hydroforming': 'hydroforming',
  'Forging (Hot)': 'forging-hot',
  'Forging (Cold)': 'forging-cold',
  'Extrusion': 'extrusion',
  'Rubber Moulding (Compression/Injection)': 'rubber-moulding',
  'Composite Layup (RTM)': 'composite-rtm',

  // ── Not shape-forming. The reason travels with the null. ────────────────
  //
  // Tube bending IS shape-forming, and it is the one exception here: it is
  // priced like any other route and carries no rule family because the engine
  // cannot recognise a tube. Inventing a family whose every rule reported NOT
  // EVALUATED would have added six rules to the catalogue count and judged
  // nothing.
  'Tube Bending': null,
  'Machining (secondary ops)': null,
  'Glass Forming (Bend + Temper)': null,
  'MIG Welding Assembly': null,
  'Resistance Spot Welding': null,
  'Heat Treatment (batch)': null,
  'E-coat (KTL)': null,
  'Powder Coating': null,
  'Zinc Plating': null,
  'Grinding (finish)': null,
  'Washing & Final Inspection': null,
};

/** Why a non-shaping process carries no geometric DFM rules. Printed, not hidden. */
export const NO_DFM_REASON = {
  'Tube Bending':
    'Tube bending is judged on bend radius against tube outside diameter and on wall thinning round the bend, and both need the part to be recognised AS a tube — a swept circular section with a centreline. That recogniser is not built, so this process is priced and carbon-scored but not judged. It is the only shaping process in this tool without a rule family, and it is named here rather than left to look like an oversight.',
  'Machining (secondary ops)':
    'A secondary machining operation is judged against the machining rules for the whole part — pick "Machining (CNC)" to run them.',
  'Glass Forming (Bend + Temper)':
    'Glass bending is governed by radius-of-curvature and stress limits that need the forming schedule and the glass spec, neither of which is in the solid geometry.',
  'MIG Welding Assembly':
    'Weld design is an assembly question — joint access, fit-up and distortion. Use the DFA path, which measures part count, handling and insertion.',
  'Resistance Spot Welding':
    'Spot-weld design is an assembly question — flange width, gun access and pitch. Use the DFA path.',
  'Heat Treatment (batch)':
    'Heat treatment does not shape the part. Distortion risk is driven by section change, which the wall-uniformity rule of the FORMING process already covers.',
  'E-coat (KTL)':
    'Coating does not shape the part. Drainage and Faraday-cage rules need the rack orientation and bath chemistry, which are not in the geometry.',
  'Powder Coating':
    'Coating does not shape the part. Coverage in recesses depends on the gun and rack setup, not on the solid alone.',
  'Zinc Plating':
    'Plating does not shape the part. Throwing power into recesses depends on the bath and rack, not on the solid alone.',
  'Grinding (finish)':
    'A finishing operation is judged against the rules of the process that formed the part.',
  'Washing & Final Inspection':
    'Neither operation shapes the part, so no geometric rule applies.',
};

/** Material family of a named grade, or undefined when the grade is unknown. */
export function familyOfMaterial(material) {
  return MATERIALS[material]?.family;
}

/** Every material grade, grouped by its top-level category, in menu order. */
export function materialsByFamily() {
  const out = [];
  for (const [key, label] of Object.entries(MATERIAL_FAMILIES)) {
    const grades = Object.keys(MATERIALS).filter(m => MATERIALS[m].family === key);
    if (grades.length) out.push({ family: key, label, grades });
  }
  // A material family present in the tables but missing from the display map
  // must still appear, or a grade silently becomes unselectable.
  const known = new Set(Object.keys(MATERIAL_FAMILIES));
  const orphans = [...new Set(Object.values(MATERIALS).map(m => m.family))].filter(f => !known.has(f));
  for (const f of orphans) {
    out.push({ family: f, label: f, grades: Object.keys(MATERIALS).filter(m => MATERIALS[m].family === f) });
  }
  return out;
}

/**
 * The processes that can actually make a part from this material.
 *
 * Driven by the `families` tag each process already carries in the costing
 * engine, so an impossible combination — injection moulding a steel bracket,
 * sand casting an ABS clip — cannot be selected rather than being caught later
 * by a warning nobody reads.
 */
export function processesForMaterial(material) {
  const family = familyOfMaterial(material);
  const rows = [];
  for (const [name, spec] of Object.entries(PROCESSES)) {
    if (family && Array.isArray(spec.families) && !spec.families.includes(family)) continue;
    const dfmFamily = PROCESS_TO_DFM_FAMILY[name] ?? null;
    rows.push({
      name,
      dfmFamily,
      dfmFamilyName: dfmFamily ? PROCESS_FAMILIES[dfmFamily] ?? dfmFamily : null,
      // A process with no rules is offered with its reason attached, so the UI
      // can grey it out honestly instead of pretending the analysis will run.
      noDfmReason: dfmFamily ? null : (NO_DFM_REASON[name] ?? 'This process does not shape the geometry, so no geometric DFM rule applies.'),
    });
  }
  return rows;
}

/**
 * The whole picker in one payload: material categories with their grades, and
 * for each grade the processes it can take. Served to the UI so the page never
 * hand-maintains a copy of either list again.
 */
export function dfmOptions() {
  const families = materialsByFamily();
  const processesFor = {};
  for (const { grades } of families) {
    for (const g of grades) processesFor[g] = processesForMaterial(g);
  }
  return {
    materialFamilies: families,
    processesForMaterial: processesFor,
    // Every process, unfiltered — what the UI shows before a material is chosen.
    allProcesses: processesForMaterial(null),
    dfmFamilies: PROCESS_FAMILIES,
  };
}

/**
 * Resolve the DFM rule family from what the user actually chose.
 *
 * Returns the family plus HOW it was decided, because the report has to say so:
 * a family the user picked and a family the geometry guessed are not the same
 * claim, and the previous code presented them identically.
 */
export function familyForSelection({ process, dfmProcess } = {}) {
  const explicit = String(dfmProcess || '').trim();
  if (PROCESS_FAMILIES[explicit]) {
    return { family: explicit, basis: 'chosen', chosenProcess: null };
  }
  const named = String(process || '').trim();
  if (named && Object.prototype.hasOwnProperty.call(PROCESS_TO_DFM_FAMILY, named)) {
    const family = PROCESS_TO_DFM_FAMILY[named];
    if (family) return { family, basis: 'chosen', chosenProcess: named };
    return {
      family: null, basis: 'no-rules', chosenProcess: named,
      reason: NO_DFM_REASON[named] ?? 'This process does not shape the geometry, so no geometric DFM rule applies.',
    };
  }
  return { family: null, basis: 'none', chosenProcess: null };
}
