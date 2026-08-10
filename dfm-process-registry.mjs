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

/**
 * PROCESSES THAT ARE OPERATIONS, NOT ROUTES.
 *
 * Each of these has a rule family and a price, and each is a real thing a
 * supplier does — but none of them turns raw stock into this part. Broaching
 * finishes a hole somebody else drilled; wire EDM cuts a profile out of a blank;
 * gun drilling makes a deep bore in a part that already exists.
 *
 * They were sitting in the route-comparison table as alternatives to die casting
 * a bracket, priced at EUR 4.74 and EUR 68.46 and ranked among genuine routes.
 * The rules still run — "can this part be broached" is a useful question — but
 * the table has to say what kind of answer it is giving, and the "switch to this
 * route" recommendation must never land on one.
 */
export const SECONDARY_OPERATION_FAMILIES = {
  broaching: 'Broaching finishes a hole or a form in an existing part; it does not produce the part.',
  'wire-edm': 'Wire EDM cuts a profile from a blank somebody else made, and cuts it slowly. It is a toolroom and low-volume route, not a production one.',
  'deep-hole-drilling': 'Gun drilling makes a deep bore in an existing part; it does not produce the part.',
  turning: 'Turning is a route only for a part that starts as bar or a turned blank. On a non-axisymmetric part it is a secondary operation.',
};

/**
 * Largest bounding-box dimension a process can physically make, in mm.
 *
 * Only for processes whose SIZE ceiling is the thing that rules them out, and
 * where nothing else in the rule family would catch it. A cold header runs cut
 * slugs of wire through a multi-station machine; a MIM part is moulded then
 * sintered, and the shrink makes a large one impossible to hold. Neither had any
 * size gate, so both were offered — and cold heading recommended — for a 133 mm
 * die-cast bracket and a 256 mm stamping.
 */
export const MAX_ENVELOPE_MM = {
  'cold-heading': 150,
  mim: 100,
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

// ─────────────────────────────────────────────────────────────────────────────
// WHAT THE PROCESS IS CALLED IN A PLANT, versus what this codebase calls it.
//
// This exists because of a live demo that failed in front of a director. The
// user went looking for HPDC and could not find it — because the process is
// keyed 'Die Casting (Aluminium)' and the letters H, P, D, C appear nowhere in
// the product. LPDC is 'Low-Pressure Die Casting'; sheet metal is 'Stamping /
// Deep Drawing', with neither "sheet" nor "metal" in the string. Every one of
// those processes was implemented, tested and working. None of them was
// FINDABLE, which for a person scanning a 37-row menu is the same thing.
//
// The key must not change: it indexes PROCESSES in costing-engine.mjs and
// PROCESS_TO_DFM_FAMILY here, it is stored in saved analyses, and it is printed
// in every report already exported. So the name stays and a DISPLAY LABEL is
// added beside it, with the acronym FIRST — a native <select> jumps to the
// option whose label starts with what you type, so "H" now lands on HPDC rather
// than on Hydroforming.
//
// `aliases` are the other words people search with, including the German and
// the shop-floor terms. `group` is the commodity heading the menu sorts under,
// because 37 flat options is not a menu, it is a haystack.
export const PROCESS_DISPLAY = {
  // ── Casting ──────────────────────────────────────────────────────────────
  'Die Casting (Aluminium)': { label: 'HPDC — High-pressure die casting (Al / Mg)', group: 'Casting', aliases: ['hpdc', 'high pressure die casting', 'pressure die casting', 'druckguss', 'aluminium die casting'] },
  'Die Casting (Zinc)': { label: 'HPDC (Zinc) — Hot-chamber die casting', group: 'Casting', aliases: ['hpdc', 'zinc die casting', 'zamak', 'hot chamber'] },
  'Low-Pressure Die Casting': { label: 'LPDC — Low-pressure die casting', group: 'Casting', aliases: ['lpdc', 'low pressure'] },
  'Gravity Die Casting': { label: 'GDC — Gravity die casting (permanent mould)', group: 'Casting', aliases: ['gdc', 'gravity', 'permanent mould', 'permanent mold', 'chill casting', 'kokillenguss'] },
  'Vacuum-Assisted Die Casting': { label: 'VHPDC — Vacuum-assisted die casting', group: 'Casting', aliases: ['vhpdc', 'vacuum', 'vacural', 'vacuum die casting'] },
  'Squeeze Casting': { label: 'Squeeze casting (liquid forging)', group: 'Casting', aliases: ['liquid forging', 'squeeze'] },
  'Semi-Solid Casting (Thixo/Rheo)': { label: 'SSM — Semi-solid casting (thixo / rheo)', group: 'Casting', aliases: ['ssm', 'thixo', 'rheo', 'thixocasting', 'rheocasting', 'thixomoulding'] },
  'Sand Casting': { label: 'Sand casting (green sand / no-bake)', group: 'Casting', aliases: ['sand', 'green sand', 'no bake', 'sandguss'] },
  'Shell Mould Casting': { label: 'Shell mould casting (Croning)', group: 'Casting', aliases: ['shell', 'croning', 'shell moulding'] },
  'Investment Casting': { label: 'Investment casting (lost wax)', group: 'Casting', aliases: ['lost wax', 'precision casting', 'feinguss'] },
  'Centrifugal Casting': { label: 'Centrifugal casting (spun)', group: 'Casting', aliases: ['centrifugal', 'spun casting'] },

  // ── Sheet metal and forming ──────────────────────────────────────────────
  'Stamping / Deep Drawing': { label: 'Sheet metal — stamping / deep drawing', group: 'Sheet metal & forming', aliases: ['sheetmetal', 'sheet metal', 'stamping', 'pressing', 'blanking', 'progressive die', 'transfer die', 'presswerk'] },
  'Deep Drawing (Multi-stage)': { label: 'Sheet metal — deep drawing (multi-stage)', group: 'Sheet metal & forming', aliases: ['sheetmetal', 'sheet metal', 'deep draw', 'multi stage', 'tiefziehen'] },
  'Fine Blanking': { label: 'Fine blanking', group: 'Sheet metal & forming', aliases: ['fineblanking', 'feinschneiden'] },
  'Hot Stamping (Press Hardening)': { label: 'Hot stamping / press hardening (PHS)', group: 'Sheet metal & forming', aliases: ['phs', 'press hardening', 'hot forming', 'usibor', '22mnb5', 'boron steel'] },
  'Roll Forming': { label: 'Roll forming', group: 'Sheet metal & forming', aliases: ['rollforming', 'roll form', 'profiling'] },
  'Hydroforming': { label: 'Hydroforming (tube / sheet)', group: 'Sheet metal & forming', aliases: ['hydroform', 'ihu'] },
  'Metal Spinning': { label: 'Metal spinning / flow forming', group: 'Sheet metal & forming', aliases: ['spinning', 'flow forming', 'drucken'] },
  'Laser Cutting + Bending': { label: 'Sheet metal — laser cut + press brake', group: 'Sheet metal & forming', aliases: ['sheetmetal', 'sheet metal', 'laser', 'press brake', 'prototype sheet'] },
  'Lamination Stamping (Electrical Steel)': { label: 'Lamination stamping (electrical steel)', group: 'Sheet metal & forming', aliases: ['lamination', 'stator', 'rotor', 'e-steel', 'blanking'] },
  'Tube Bending': { label: 'Tube bending (mandrel)', group: 'Sheet metal & forming', aliases: ['tube', 'mandrel bend', 'pipe bending'] },

  // ── Forging and bulk forming ─────────────────────────────────────────────
  'Forging (Hot)': { label: 'Hot forging (closed die)', group: 'Forging & bulk forming', aliases: ['forging', 'closed die', 'drop forging', 'gesenkschmieden', 'hot forge'] },
  'Forging (Cold)': { label: 'Cold forging', group: 'Forging & bulk forming', aliases: ['forging', 'cold forming', 'cold forge', 'kaltumformung'] },
  'Open-Die Forging': { label: 'Open-die forging (free forging)', group: 'Forging & bulk forming', aliases: ['forging', 'open die', 'free forging'] },
  'Cold Heading / Upsetting': { label: 'Cold heading / upsetting (fasteners)', group: 'Forging & bulk forming', aliases: ['heading', 'header', 'upsetting', 'fastener', 'bolt making'] },
  'Extrusion': { label: 'Extrusion (aluminium profile)', group: 'Forging & bulk forming', aliases: ['extrusion', 'profile', 'strangpressen'] },

  // ── Machining and material removal ───────────────────────────────────────
  'Machining (CNC)': { label: 'Machining — CNC milling (3 / 5-axis)', group: 'Machining', aliases: ['cnc', 'milling', 'mill', 'machining', 'zerspanung'] },
  'Turning (CNC)': { label: 'Turning — CNC lathe', group: 'Machining', aliases: ['cnc', 'lathe', 'turning', 'drehen'] },
  'Wire EDM': { label: 'Wire EDM (spark erosion)', group: 'Machining', aliases: ['edm', 'wire cut', 'spark erosion', 'erodieren'] },
  'Deep-Hole / Gun Drilling': { label: 'Deep-hole / gun drilling', group: 'Machining', aliases: ['gundrill', 'gun drilling', 'deep hole', 'bta'] },
  'Broaching': { label: 'Broaching (spline / keyway)', group: 'Machining', aliases: ['broach', 'spline', 'raumen'] },

  // ── Polymers, rubber and composites ──────────────────────────────────────
  'Injection Moulding': { label: 'Injection moulding (thermoplastic)', group: 'Polymer, rubber & composite', aliases: ['im', 'injection molding', 'plastic moulding', 'spritzguss'] },
  'Thermoforming': { label: 'Thermoforming (vacuum / pressure)', group: 'Polymer, rubber & composite', aliases: ['vacuum forming', 'thermoform'] },
  'Rotational Moulding': { label: 'Rotational moulding (rotomoulding)', group: 'Polymer, rubber & composite', aliases: ['rotomoulding', 'rotomolding', 'rotational molding'] },
  'Rubber Moulding (Compression/Injection)': { label: 'Rubber moulding (compression / injection)', group: 'Polymer, rubber & composite', aliases: ['rubber', 'elastomer', 'seal', 'gasket'] },
  'Composite Layup (RTM)': { label: 'RTM — composite layup / resin transfer', group: 'Polymer, rubber & composite', aliases: ['rtm', 'composite', 'prepreg', 'cfrp', 'layup'] },
  'Glass Forming (Bend + Temper)': { label: 'Glass forming (bend + temper)', group: 'Polymer, rubber & composite', aliases: ['glass', 'glazing', 'tempering'] },

  // ── Powder and additive ──────────────────────────────────────────────────
  'Powder Metallurgy (Press & Sinter)': { label: 'PM — powder metallurgy (press & sinter)', group: 'Powder & additive', aliases: ['pm', 'sinter', 'sintering', 'press and sinter', 'sintermetall'] },
  'Metal Injection Moulding (MIM)': { label: 'MIM — metal injection moulding', group: 'Powder & additive', aliases: ['mim', 'metal injection'] },
  'Laser Powder Bed Fusion (DMLS/SLM)': { label: 'LPBF — laser powder bed fusion (DMLS / SLM)', group: 'Powder & additive', aliases: ['lpbf', 'dmls', 'slm', 'additive', 'am', '3d printing', 'printing'] },

  // ── Joining, heat treatment and finishing ────────────────────────────────
  'MIG Welding Assembly': { label: 'MIG welding assembly', group: 'Joining & finishing', aliases: ['welding', 'mig', 'mag', 'gmaw'] },
  'Resistance Spot Welding': { label: 'Resistance spot welding', group: 'Joining & finishing', aliases: ['welding', 'spot weld', 'rsw'] },
  'Machining (secondary ops)': { label: 'Machining (secondary operations)', group: 'Joining & finishing', aliases: ['secondary', 'finish machining'] },
  'Heat Treatment (batch)': { label: 'Heat treatment (batch)', group: 'Joining & finishing', aliases: ['heat treat', 'hardening', 'annealing', 't6', 'ageing'] },
  'E-coat (KTL)': { label: 'E-coat (KTL / cathodic dip)', group: 'Joining & finishing', aliases: ['ktl', 'ecoat', 'e-coat', 'cathodic dip', 'edip'] },
  'Powder Coating': { label: 'Powder coating', group: 'Joining & finishing', aliases: ['powder coat', 'paint'] },
  'Zinc Plating': { label: 'Zinc plating', group: 'Joining & finishing', aliases: ['plating', 'galvanising', 'zinc flake'] },
  'Grinding (finish)': { label: 'Grinding (finish)', group: 'Joining & finishing', aliases: ['grind', 'honing', 'superfinish'] },
  'Washing & Final Inspection': { label: 'Washing & final inspection', group: 'Joining & finishing', aliases: ['washing', 'inspection', 'cleaning'] },
};

/** Menu order for the commodity groups. Casting first — it is the biggest family. */
export const PROCESS_GROUP_ORDER = [
  'Casting', 'Sheet metal & forming', 'Forging & bulk forming', 'Machining',
  'Polymer, rubber & composite', 'Powder & additive', 'Joining & finishing',
];

/** Display label for a process key, falling back to the key itself. */
export function labelForProcess(name) {
  return PROCESS_DISPLAY[name]?.label ?? name;
}

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
    const display = PROCESS_DISPLAY[name] ?? {};
    rows.push({
      // The KEY. Everything downstream — the cost tables, the rule routing,
      // saved analyses, reports already exported — is indexed on this, so it is
      // what the picker submits no matter what the menu shows.
      name,
      // What a person reads, acronym first so a native select's type-ahead
      // lands on it. Falls back to the key rather than to nothing.
      label: display.label ?? name,
      // The commodity heading it sorts under, and the words somebody might
      // search with. Both were absent, and the cost was a director watching
      // someone fail to find HPDC in a list that contained it.
      group: display.group ?? 'Other',
      aliases: display.aliases ?? [],
      dfmFamily,
      dfmFamilyName: dfmFamily ? PROCESS_FAMILIES[dfmFamily] ?? dfmFamily : null,
      // A process with no rules is offered with its reason attached, so the UI
      // can grey it out honestly instead of pretending the analysis will run.
      noDfmReason: dfmFamily ? null : (NO_DFM_REASON[name] ?? 'This process does not shape the geometry, so no geometric DFM rule applies.'),
    });
  }
  // Menu order: commodity groups in PROCESS_GROUP_ORDER, and inside a group the
  // ones that carry DFM rules first — those are the ones the tool can judge.
  const rank = (r) => {
    const g = PROCESS_GROUP_ORDER.indexOf(r.group);
    return (g < 0 ? PROCESS_GROUP_ORDER.length : g) * 100 + (r.dfmFamily ? 0 : 50);
  };
  return rows.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
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
