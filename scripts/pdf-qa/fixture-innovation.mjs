// Hostile fixture for the Innovation Studio report: Unicode arrows and dashes,
// 200-word descriptions, a long unbroken token, an idea whose engine check
// CONTRADICTS it, an unchecked idea, a wide FAST-style matrix (7 keys, so the
// 6-column cap bites), a nested-object cell, and enough ideas to force
// mid-card pagination in every text block.
const LONG = 'Replace the two-piece welded bracket with a single cold-formed part — the current design carries a 4 mm stamped web joined to a 6 mm boss by six MAG welds, each requiring fixturing, post-weld dress and a 100% dye-penetrant check. A cold-forming route eliminates the weld operation entirely, removes the fixture asset from the tooling bill, and collapses three routing steps into one. Wall thickness can be graded 4 mm → 6 mm through the forming die rather than by joining two gauges, which also removes the distortion allowance currently held on the mounting face. Expect a tooling investment of roughly 3× the current progressive die, amortised over the programme volume, against a per-part conversion saving driven by the deleted weld cell and its inspection. Material utilisation improves because the blank nests without the second gauge strip. The risk sits in fatigue performance at the graded transition: the current welded joint has a validated S-N curve from the previous programme, and the formed transition does not, so a coupon test campaign is required before this can move past a G1 gate. Supplier capability is the second constraint — only two of the five sourced stampers hold cold-forming presses in the required tonnage class.';

const IDEA = (n, over) => ({
  lens: over?.lens ?? 'Manufacturing process substitution',
  title: over?.title ?? `${String(n).padStart(2, '0')} — Consolidate welded bracket assembly into a single cold-formed part with graded wall thickness`,
  technicalDescription: over?.technicalDescription ?? LONG,
  costAngle: over?.costAngle ?? 'Deletes one weld cell (6 MAG welds → 0) and its dye-penetrant inspection; ≈ 18% conversion-cost reduction at 240k/yr, offset by a 3× tooling step — payback inside programme year 2. Material utilisation 61% → 74% on the nested blank.',
  riskNotes: over?.riskNotes ?? 'Fatigue at the graded transition is unvalidated — the welded joint carries a programme-proven S-N curve, the formed one does not. Coupon campaign required before G1. Only 2 of 5 sourced stampers hold the press tonnage. WARNING_TOKEN_THAT_IS_EXTREMELY_LONG_AND_UNBREAKABLE_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  engineCheck: over?.engineCheck === undefined ? { direction: 'confirmed', savingPct: 18.4 } : over.engineCheck,
});

export const INNOVATION_RESULT = {
  method: { id: 'fast', name: 'FAST — function-cost matrix' },
  subject: {
    part: 'Front suspension upper control-arm bracket — welded assembly (hostile «fixture» / “quoted” × ½)',
    system: 'Chassis — Front corner module',
    material: 'HR440 / 4 mm + 6 mm',
  },
  engineChecks: { checked: 14, confirmed: 9, contradicted: 3 },
  analysis: {
    totalCost: 12.47,
    currency: 'GBP',
    functionsIdentified: 7,
    componentsMapped: 11,
    allocationValid: true,
    poorValueFunctions: 3,
    matrixNote: 'Rows sum to 100% ±0.5% — invariant enforced in the deterministic core, not in the prompt.',
    functionCostMatrix: [
      { function: 'Locate control arm', worthPct: 34, costPct: 21, costGbp: 2.62, valueIndex: 1.62, verdict: 'good value', components: { web: 40, boss: 60 } },
      { function: 'React lateral load', worthPct: 28, costPct: 44, costGbp: 5.49, valueIndex: 0.64, verdict: 'poor value — over-engineered for the duty cycle it actually sees in the load case matrix', components: { web: 70, boss: 30 } },
      { function: 'Resist corrosion', worthPct: 12, costPct: 19, costGbp: 2.37, valueIndex: 0.63, verdict: 'poor value', components: { coating: 100 } },
      { function: 'Enable assembly', worthPct: 14, costPct: 9, costGbp: 1.12, valueIndex: 1.56, verdict: 'good value', components: { fastener: 100 } },
      { function: 'Damp NVH path', worthPct: 8, costPct: 4, costGbp: 0.50, valueIndex: 2.00, verdict: 'good value', components: { isolator: 100 } },
      { function: 'Carry sensor mount', worthPct: 3, costPct: 2, costGbp: 0.25, valueIndex: 1.50, verdict: 'good value', components: { tab: 100 } },
      { function: 'Provide service access', worthPct: 1, costPct: 1, costGbp: 0.12, valueIndex: 1.00, verdict: 'neutral', components: { aperture: 100 } },
    ],
    poorValueList: ['React lateral load', 'Resist corrosion', 'Provide service access'],
  },
  ideas: [
    IDEA(1),
    IDEA(2, {
      lens: 'Specification challenge',
      title: 'Relax the mounting-face flatness from 0.15 mm to 0.35 mm — the bush compliance already absorbs it',
      engineCheck: { direction: 'contradicted', savingPct: 2.1, note: 'Re-costed at the relaxed tolerance class the should-cost engine returns a 0.4% delta, not the claimed 6% — the flatness call-out is not the binding driver; the two grinding passes are set by the bore, which this idea does not touch.' },
    }),
    IDEA(3, { lens: 'Teardown delta', engineCheck: null }),
    IDEA(4, { lens: 'Design for assembly', engineCheck: { direction: 'confirmed', savingPct: 7.9 } }),
    IDEA(5, { lens: 'TRIZ — segmentation', engineCheck: { status: 'partially verified', note: 'Engine could model the material change but not the process change; the confirmed portion is ≈ 40% of the claim.' } }),
    IDEA(6, { lens: 'Circularity', engineCheck: { direction: 'contradicted', savingPct: -3.2 } }),
    IDEA(7),
    IDEA(8, { lens: 'SCAMPER — combine' }),
    IDEA(9, { lens: 'Morphological analysis', engineCheck: null }),
    IDEA(10, { lens: 'Design-to-cost' }),
    IDEA(11, { lens: 'Value engineering', engineCheck: { direction: 'contradicted', savingPct: 0 } }),
    IDEA(12, { lens: 'Effects & trends' }),
    IDEA(13, { lens: 'Manufacturing process substitution', riskNotes: '' }),
    IDEA(14, { lens: 'Spec challenge', technicalDescription: 'Short one.', costAngle: '≈ 3%.' }),
  ],
};

// The TRIZ Studio feeds the same generator a differently-shaped analysis block
// (scalars + one table of principles) — proof the renderer is genuinely generic
// and not quietly shaped around the FAST matrix.
export const TRIZ_RESULT = {
  method: { id: 'triz', name: 'TRIZ — contradiction resolution' },
  subject: { part: 'Front knuckle', system: 'Chassis', material: 'A356-T6' },
  engineChecks: { checked: 3, confirmed: 2, contradicted: 1 },
  analysis: {
    improving: 'Weight of moving object',
    worsening: 'Strength',
    restatement: 'Reduce knuckle mass without losing the stiffness the steering feel depends on — the two are coupled through section modulus, so the resolution has to come from geometry or material, not from thinning the section.',
    selectionBasis: 'contradiction matrix row 1 / column 14',
    principlesApplied: [
      { id: 1, principle: 'Segmentation', hint: 'Divide the object into independent parts so each can be sized for its own load path.' },
      { id: 40, principle: 'Composite materials', hint: 'Replace a homogeneous material with a composite one.' },
      { id: 3, principle: 'Local quality', hint: 'Make each part of the object work under conditions most suitable for its operation.' },
    ],
  },
  ideas: [
    IDEA(1, { lens: 'P1 · Segmentation' }),
    IDEA(2, { lens: 'P40 · Composite materials', engineCheck: { direction: 'contradicted', savingPct: 1.2 } }),
    IDEA(3, { lens: 'P3 · Local quality', engineCheck: null }),
  ],
};
