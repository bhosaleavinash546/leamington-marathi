// Hostile fixture for the DFM / DFA report: Unicode in the part name, long
// rationale and fix prose, a finding priced by the engine and one explicitly
// unpriced, a process family where NOTHING could be evaluated (score null), a
// long not-evaluated list, and a DFA table with an unanswered completeness state.
//
// The unevaluated/withheld cases are here on purpose — they are the states the
// report must render legibly, and they are the ones a layout is most likely to
// forget.
const LONG_RATIONALE = 'Below about 1 mm the die will not fill reliably before the melt freezes off, and cold shuts appear along the last-to-fill boundary; above about 3.5 mm the section traps porosity as it solidifies from the outside in, holds the cycle open while the centre gives up its heat, and leaves a shrinkage void exactly where the casting is thickest and a machinist is most likely to break into it. Neither failure is recoverable by process tuning once the wall is drawn, which is why wall thickness is the first thing a die caster looks at and the last thing a designer wants to change.';
const LONG_FIX = 'Hold a uniform nominal wall in the 2.0-3.5 mm band and core out heavy sections rather than leaving solid mass. Where local stiffness is needed, add ribs at 40-60% of the nominal wall rather than thickening the wall itself; where a boss must be thick, core it from the back so the section stays even. WARNING_TOKEN_THAT_IS_EXTREMELY_LONG_AND_UNBREAKABLE_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const finding = (over = {}) => ({
  id: over.id || 'hpdc-wall-thickness-range',
  title: over.title || 'Wall thickness outside the die-casting range',
  severity: over.severity || 'high',
  measure: 'wallP50Mm',
  measured: over.measured ?? 30,
  unit: over.unit || 'mm',
  thresholdText: over.thresholdText || '1–3.5 mm',
  rationale: over.rationale || LONG_RATIONALE,
  fix: over.fix || LONG_FIX,
  source: over.source || 'Aluminium HPDC design guidance (1.0 mm minimum, 2.0–3.5 mm recommended).',
  // Passed through, or the customer-standard grade can never be exercised — the
  // branch that prints "YOUR COMPANY STANDARD" instead of crediting a handbook
  // for a number it never gave.
  sourceStatus: over.sourceStatus,
  status: 'fail',
  instances: over.instances,
  instanceCount: over.instanceCount,
  instanceTotal: over.instanceTotal,
  thresholdBasis: over.thresholdBasis,
  thresholdMatchedOn: over.thresholdMatchedOn,
  cost: over.cost ?? {
    priced: true,
    basis: 'computeShouldCost — cooling-limited cycle (base + k·wall²) and the mass change that comes with it',
    changeDescription: 'wall 30 mm → 3.5 mm',
    asDrawnEur: 12.84, improvedEur: 12.2, deltaEur: 0.64, annualDeltaEur: 76800,
  },
});

export const DFM_RESULT = {
  partName: 'Rear subframe bracket — «hostile» “fixture” × ½',
  fileName: 'rear-subframe-bracket.step',
  subject: { part: 'Rear subframe bracket', system: 'Chassis', material: 'Aluminium A356 (cast)', process: 'Die Casting (Aluminium)' },
  geometry: {
    boundingBox: { xMm: 248.5, yMm: 162.3, zMm: 88.1 },
    volume: { cm3: 412.7 }, surfaceArea: { cm2: 1863.2 }, fillRatio: 0.116,
    faces: { total: 214, byType: { PLANE: 88, CYLINDER: 41, BSPLINE: 79, CONE: 6 } },
    setupAnalysis: { estimatedSetupCount: 3, basis: 'distinct feature access directions (not raw face normals)' },
    featureTable: [
      { kind: 'hole', diaMm: 10.5, depthMm: 24, through: true, count: 4, axisXYZ: [0, 0, 1] },
      { kind: 'hole', diaMm: 6.8, depthMm: 12, through: false, count: 8, axisXYZ: [0, 0, 1] },
      { kind: 'boss', diaMm: 32, depthMm: 18, through: null, count: 2, axisXYZ: [0, 0, 1] },
    ],
    assemblyWarning: null, unitWarning: null,
  },
  dfm: {
    wallThickness: { p5Mm: 2.1, p50Mm: 30.0, p95Mm: 61.4, spreadRatio: 1.98, uniformity: 'non-uniform', samples: 2841 },
    // PMI PRESENT. The absent branch gets its own render below — that is the
    // one whose wording matters most, and a fixture that only covers the happy
    // path leaves it unverified.
    pmi: {
      present: true, reason: null,
      dimensionCount: 12, geometricToleranceCount: 3, datumCount: 2,
      tightestToleranceMm: 0.02,
      geometricTolerances: [
        { typeName: 'flatness', valueMm: 0.05 },
        { typeName: 'true position', valueMm: 0.1 },
        { typeName: 'perpendicularity', valueMm: 0.08 },
      ],
    },
    toolAccess: {
      toolDiaMm: 10, reachableAreaPct: 76.51, unreachableAreaPct: 23.49,
      method: 'shank clearance: a Ø10 mm cylinder swept along each of 6 approach directions must clear the solid, tested with 4 circumference probes plus the axis',
      knownLimits: 'The HOLDER, spindle nose and machine envelope are not modelled, so a face reported as reachable may still be unreachable on a real machine. Approach is limited to the six axis directions.',
      excludedBecause: 'Cylindrical bores are excluded: a Ø8 hole is drilled by a Ø8 drill, not reached by the end mill.',
    },
    draft: {
      drawDirectionXYZ: [0, 0, 1], undercutFaceCount: 3, zeroDraftFaceCount: 11,
      wallAreaBelowMinDraftPct: 41.2, minWallDraftDeg: 0.4, maxWallDraftDeg: 5.1,
      areaPct: { partingParallel: 31.4, releasing: 27.4, zeroDraft: 24.6, undercut: 16.6 },
    },
    features: {
      counts: { 'through-hole': 4, 'blind-hole': 8, boss: 2, pocket: 3, 'counterbored-hole': 1, rib: 4 },
      unclassifiedAreaPct: 22.8,
      knownLimits: [
        'Through holes carry no concave edge, so they come from the analytic cylinder pass rather than the graph.',
        'Threads are not recognised; any thread signal is reported unverified.',
        'GD&T and tolerance callouts are not present in the solid geometry.',
        'Ribs are found from opposed PLANAR side faces standing on a planar base. A rib with curved sides, or one standing on a freeform wall, is not recognised and its proportions are therefore not checked.',
      ],
      // A rib table wide enough to test the column stops, with a drafted rib
      // (so the degree sign has to survive pdfSafe) and a rib whose length the
      // recogniser could not measure — the '—' path in every column.
      ribs: [
        { thicknessMm: 4.85, heightMm: 28.4, lengthMm: 112.75, draftPerSideDeg: 1.5, confidence: 'medium' },
        { thicknessMm: 3.2, heightMm: 19.6, lengthMm: 88.4, draftPerSideDeg: 0, confidence: 'high' },
        { thicknessMm: 2.05, heightMm: 14.2, lengthMm: null, draftPerSideDeg: 2.25, confidence: 'medium' },
        { thicknessMm: 1.9, heightMm: 33.8, lengthMm: 64.1, draftPerSideDeg: 0, confidence: 'high' },
      ],
      prismatic: [
        { kind: 'pocket', faceIds: [4, 5, 6, 7, 8], faceCount: 5, wallCount: 4, concaveArcs: 8, areaMm2: 1842.6, confidence: 'high' },
      ],
      compoundHoles: [{ kind: 'counterbored-hole', boreDiaMm: 8, boreDepthMm: 14, through: true, featureDiaMm: 16, featureDepthMm: 6, includedAngleDeg: null, axisXYZ: [0, 0, 1], count: 1 }],
    },
  },
  results: [
    {
      process: 'hpdc', processName: 'High-pressure die casting',
      ruleCount: 4, evaluatedCount: 3, coveragePct: 75, score: 25,
      findings: [
        finding(),
        finding({
          id: 'hpdc-draft-minimum', title: 'Wall area below the minimum die-casting draft',
          measured: 41.2, unit: '% of wall area', thresholdText: '≤ 5 % of wall area',
          cost: { priced: false, reason: 'Insufficient draft shortens die life through galling; die life is a tooling-amortisation input, not a geometric one the engine derives.' },
        }),
        finding({
          id: 'hpdc-core-ld', title: 'Cored hole beyond the core-pin slenderness limit',
          severity: 'medium', measured: 14.2, unit: 'core L/D', thresholdText: '≤ 10 core L/D',
          // The per-instance branch: named offenders with coordinates, and a
          // count that says how many were CHECKED so a pass reads as a pass.
          instanceCount: 3, instanceTotal: 9,
          instances: [
            { ratio: 14.2, diaMm: 5, depthMm: 71, count: 2, atXYZ: [42.5, -18.25, 6.125] },
            { ratio: 12.8, diaMm: 6.5, depthMm: 83.2, count: 1, atXYZ: [-104.75, 62.5, 33] },
            { ratio: 10.4, diaMm: 10, depthMm: 104, count: 4, atXYZ: [0, 0, -12.5] },
          ],
          // A company standard replacing a published guideline: a STRONGER
          // grade, and it must not print under the original citation.
          thresholdBasis: 'customer-standard', thresholdMatchedOn: 'company standard',
          sourceStatus: 'customer-standard',
          source: 'Company standard: our tool room will not run a core pin past 10 L/D after the 2023 die failures.',
          cost: { priced: false, reason: 'Core-pin replacement frequency is a tooling-maintenance input, not a geometric one the engine derives.' },
        }),
        finding({
          id: 'hpdc-undercuts', title: 'Undercuts require slides or lifters in the die',
          severity: 'high', measured: 3, unit: 'regions', thresholdText: '≤ 0 regions',
          cost: {
            priced: false,
            reason: 'Slide and loose-core tooling is quoted by the diemaker; the piece-price engines do not model it.',
            externalGuideline: 'Industry guidance puts a side action, lifter or collapsible core at roughly $500–$5,000 of tooling per feature. Cited literature, NOT an engine result — confirm with your toolmaker.',
          },
        }),
      ],
      passed: [finding({ id: 'hpdc-internal-radius', title: 'Sharp internal corners concentrate stress and restrict flow', measured: 2.4, thresholdText: '≥ 1.6 mm', severity: 'medium' })],
      notEvaluated: [],
      impact: { pricedCount: 1, unpricedCount: 2, perPartEur: 0.64, annualEur: 76800, caveat: '2 of 3 findings could not be priced by the engines; the total below excludes them.' },
    },
    {
      // A whole family with nothing measurable. The report must show a null
      // score and the reasons, not an implied clean sheet.
      process: 'sheet-metal', processName: 'Sheet metal / stamping',
      ruleCount: 4, evaluatedCount: 0, coveragePct: 0, score: null,
      findings: [], passed: [],
      notEvaluated: [
        { id: 'sm-bend-radius', title: 'Inside bend radius below one material thickness', measure: 'minBendRadiusToThickness', unit: 'r/t', thresholdText: '≥ 1 r/t', rationale: '', fix: '', status: 'not-evaluated', source: 'Sheet-metal design guidance (1x t typical, 1.5–2x for stainless and 6061-T6).', reason: 'no measurement available for "minBendRadiusToThickness" on this geometry' },
        { id: 'sm-hole-diameter', title: 'Punched hole smaller than the material thickness', measure: 'minHoleDiaToThickness', unit: 'd/t', thresholdText: '≥ 1 d/t', rationale: '', fix: '', status: 'not-evaluated', source: 'Sheet-metal design guidance.', reason: 'no measurement available for "minHoleDiaToThickness" on this geometry' },
        { id: 'sm-hole-to-bend', title: 'Hole too close to a bend line', measure: 'minHoleToBendMm', unit: 'mm', thresholdText: '2t+r', rationale: '', fix: '', status: 'not-evaluated', source: 'Sheet-metal design guidance (hole-to-bend >= 2T + R).', reason: 'threshold is a formula' },
        { id: 'sm-flange-length', title: 'Flange too short to form', measure: 'minFlangeToThickness', unit: 'flange/t', thresholdText: '≥ 3 flange/t', rationale: '', fix: '', status: 'not-evaluated', source: 'Sheet-metal design guidance (minimum flange ~3x thickness).', reason: 'no measurement available for "minFlangeToThickness" on this geometry' },
      ],
      impact: { pricedCount: 0, unpricedCount: 0, perPartEur: 0, annualEur: 0, caveat: null },
    },
  ],
  dfa: {
    engine: 'dfa-v1',
    timeModel: { version: 'brainspark-dfa-v1', basis: 'MTM-structured; BrainSpark coefficients; calibratable. NOT Boothroyd & Dewhurst tables.', calibration: 1 },
    totalParts: 6, distinctPartTypes: 3,
    totalAssemblyTimeSec: 41.8, assemblyCostEur: 0.49, labourRateEurPerHr: 42,
    theoreticalMinParts: null, idealAssemblyTimeSec: null, designEfficiencyPct: null,
    consolidationCandidates: [],
    suspectedFasteners: [{ index: 2, name: 'solid-3', confidence: 'medium' }, { index: 3, name: 'solid-4', confidence: 'medium' }],
    rows: [
      { index: 0, name: 'bracket casting', groupSize: 1, massKg: 1.11, contacts: 4, symmetry: { totalDeg: 720, continuous: false, order: 1 }, time: { handlingSec: 3.24, insertionSec: 1.5, totalSec: 4.74 }, fastener: { isFastener: false }, necessary: null },
      { index: 1, name: 'reinforcement plate — very long descriptive name that must not overflow the column', groupSize: 1, massKg: 0.42, contacts: 2, symmetry: { totalDeg: 360, continuous: false, order: 2 }, time: { handlingSec: 1.63, insertionSec: 1.5, totalSec: 3.13 }, fastener: { isFastener: false }, necessary: null },
      { index: 2, name: 'M10 bolt', groupSize: 4, massKg: 0.05, contacts: 2, symmetry: { totalDeg: 180, continuous: true, order: null }, time: { handlingSec: 1.13, insertionSec: 6.5, totalSec: 7.63 }, fastener: { isFastener: true, confidence: 'medium' }, necessary: null },
      { index: 3, name: 'washer', groupSize: 4, massKg: 0.01, contacts: 2, symmetry: { totalDeg: 180, continuous: true, order: null }, time: { handlingSec: 1.83, insertionSec: 1.5, totalSec: 3.33 }, fastener: { isFastener: true, confidence: 'medium' }, necessary: null },
      { index: 4, name: 'bush', groupSize: 2, massKg: 0.03, contacts: 1, symmetry: { totalDeg: 180, continuous: true, order: null }, time: { handlingSec: 1.13, insertionSec: 2.5, totalSec: 3.63 }, fastener: { isFastener: false }, necessary: null },
      { index: 5, name: 'broken solid', skipped: true, error: 'boolean failed' },
    ],
    completeness: {
      answered: 0, unanswered: 5,
      unansweredParts: [{ index: 0 }, { index: 1 }, { index: 2 }, { index: 3 }, { index: 4 }],
      indexAvailable: false,
      note: '5 of 5 parts have unanswered DFA questions, so the theoretical minimum and design efficiency are withheld. Handling and insertion times below are geometric and stand on their own.',
    },
  },
};


/**
 * Annotated views, passed as the SECOND argument to exportDfmPdf.
 *
 * A flat placeholder image rather than a real render — this harness has no
 * WebGL and never will. What it proves is that the report consumes a data URI
 * as data, places markers at normalised coordinates, and paginates around the
 * image. The `noCallouts` view exercises the "nothing visible from this angle"
 * branch, which is the one a reader hits on a real part.
 */
export const DFM_FIGURES = [
  {
    id: 'iso', view: 'iso', width: 140, height: 100,
    dataUri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIwAAABkCAIAAADbtU+GAAABTElEQVR4nO3OQQ3AMADEsCApgKIYf1SDkOf1EckAzLlfHsd8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EPUDcXcPNAHVkcQAAAAASUVORK5CYII=',
    callouts: [
      { n: 1, x: 0.22, y: 0.31, label: 'Undercut', value: '2,256.45 mm2', severity: 'high' },
      { n: 2, x: 0.68, y: 0.44, label: 'Zero draft', value: '0.4 deg', severity: 'medium' },
      { n: 3, x: 0.51, y: 0.77, label: 'Thinnest wall', value: '2.1 mm', severity: 'medium' },
      { n: 4, x: 0.95, y: 0.05, label: 'Rib 1 - a deliberately long label to test truncation', value: '4.85 x 28.4 mm', severity: 'info' },
    ],
  },
  { id: 'front', view: 'front', width: 140, height: 100,
    dataUri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIwAAABkCAIAAADbtU+GAAABTElEQVR4nO3OQQ3AMADEsCApgKIYf1SDkOf1EckAzLlfHsd8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EMV8EPUDcXcPNAHVkcQAAAAASUVORK5CYII=', callouts: [] },
];


/**
 * The most dangerous state the cover can be in: a NAMED process that the
 * geometry CONTRADICTS. Every finding below is then judged against the wrong
 * family and every cost priced for a process the part will never see. It is
 * also the longest block on the page and the one most likely to collide with
 * what follows, so it gets its own render rather than riding on the fixture
 * every other variant shares.
 */
export const DFM_RESULT_CONFLICT = {
  ...DFM_RESULT,
  partName: DFM_RESULT.partName + ' (process conflict)',
  processFamily: 'hpdc',
  processFamilyBasis: 'derived from the costing process',
  measuredProcess: {
    family: 'sheet-metal', confidence: 'measured',
    evidence: ['38 bends recognised, sheet thickness 1.602 mm', 'wall p50 1.6 mm, uniform'],
    notes: [],
  },
  processConflict: {
    chosenName: 'High-pressure die casting',
    measuredName: 'Sheet metal / stamping',
    evidence: ['38 bends recognised, sheet thickness 1.602 mm', 'wall p50 1.6 mm, uniform'],
  },
};

/** The benign counterpart: geometry and process agree, and the cover says so. */
export const DFM_RESULT_MEASURED = {
  ...DFM_RESULT,
  partName: DFM_RESULT.partName + ' (measured process)',
  processFamily: 'sheet-metal',
  processFamilyBasis: 'measured from the geometry',
  measuredProcess: {
    family: 'sheet-metal', confidence: 'measured',
    evidence: ['38 bends recognised, sheet thickness 1.602 mm', 'wall p50 1.6 mm, uniform'],
    notes: [],
  },
  processConflict: null,
};


/** Company standards in force, plus the route table and the two conflict banners. */
export const DFM_RESULT_FULL = {
  ...DFM_RESULT,
  partName: DFM_RESULT.partName + ' (full)',
  processFamily: 'hpdc',
  material: 'Aluminium A356 (cast)',
  ruleOverrides: {
    'hpdc-core-ld': { enabled: true, threshold: 10, note: 'our tool room will not run a core pin past 10 L/D' },
    'hpdc-internal-radius': { enabled: false },
  },
  routes: {
    basis: "Each row is the SAME measured geometry run through that process's own rule family, priced by computeShouldCost and carbon-scored on the cost engine's own input mass. Nothing is blended into a single ranking.",
    skipped: [
      { process: 'Injection Moulding', reason: 'incompatible' },
      { process: 'Die Casting (Zinc)', reason: 'incompatible' },
    ],
    routes: [
      { process: 'Extrusion', dfmFamilyName: 'Extrusion', score: 50, coveragePct: 100, evaluatedCount: 3, ruleCount: 3, findingCount: 2, highSeverityCount: 2, scoreCaveat: null, piecePriceEur: 3.18, toolingEur: 25000, inputMassKg: 1.009, kgCo2e: 5.2, cbamEur: null },
      { process: 'Die Casting (Aluminium)', dfmFamilyName: 'High-pressure die casting (Al / Mg)', score: 13, coveragePct: 55.6, evaluatedCount: 5, ruleCount: 9, findingCount: 4, highSeverityCount: 3, scoreCaveat: 'Only 5 of 9 rules could be evaluated, so this score rests on a partial check.', piecePriceEur: 6.6, toolingEur: 141458.41, inputMassKg: 1.429, kgCo2e: 7.48, cbamEur: null },
      { process: 'Sand Casting', dfmFamilyName: 'Sand casting', score: 33, coveragePct: 100, evaluatedCount: 10, ruleCount: 10, findingCount: 4, highSeverityCount: 2, scoreCaveat: null, piecePriceEur: 7.55, toolingEur: 28291.68, inputMassKg: 1.559, kgCo2e: 8.1, cbamEur: 0.648 },
      // A route the cost model refused. It KEEPS ITS ROW: a table that drops
      // what it failed on reads as "these are the options".
      { process: 'Hydroforming', dfmFamilyName: 'Hydroforming', score: null, coveragePct: 0, evaluatedCount: 0, ruleCount: 3, findingCount: 0, highSeverityCount: 0, scoreCaveat: 'No rule in this family could be evaluated on this geometry, so there is no score — not a clean sheet.', piecePriceEur: null, toolingEur: null, inputMassKg: null, kgCo2e: null, cbamEur: null, costReason: 'Hydroforming needs a tube blank, and no tube geometry was recognised.' },
      { process: 'Machining (CNC)', dfmFamilyName: 'Machining (CNC mill/turn)', score: 100, coveragePct: 60, evaluatedCount: 3, ruleCount: 5, findingCount: 0, highSeverityCount: 0, scoreCaveat: null, piecePriceEur: 27.54, toolingEur: 4000, inputMassKg: 1.906, kgCo2e: 9.98, cbamEur: null },
    ],
  },
};

/** The two states that must never be silently empty: an impossible pair, and a
 *  process that shapes nothing. Both plus a file with NO PMI. */
export const DFM_RESULT_NO_RULES = {
  ...DFM_RESULT,
  partName: DFM_RESULT.partName + ' (no rules)',
  processFamily: null,
  material: 'Steel (mild)',
  materialProcessConflict: {
    material: 'Steel (mild)', process: 'Injection Moulding',
    message: 'Injection Moulding cannot be used with Steel (mild). The cost model lists this process as accepting only certain material families, and Steel (mild) is not one of them — so every threshold below was chosen for a route this part cannot take.',
  },
  noDfmRulesReason: 'Coating does not shape the part. Drainage and Faraday-cage rules need the rack orientation and bath chemistry, which are not in the geometry.',
  dfm: {
    ...DFM_RESULT.dfm,
    pmi: {
      present: false,
      reason: 'This file carries no semantic PMI. That means the tolerances were not exported into the STEP — not that the part has none. They are on the drawing, and every tolerance rule below abstains rather than passing. Re-export as AP242 with semantic PMI to have them checked.',
      dimensionCount: 0, geometricToleranceCount: 0, datumCount: 0, tightestToleranceMm: null,
      geometricTolerances: [],
    },
    toolAccess: null,
  },
};
