// Hostile-but-realistic fixture: Unicode garbage, long everything, empty fields.
const LONG_DESC = 'Replace the baseline rectangular I-pin winding with a 3rd-generation 8-layer square flat-wire hairpin using ~4.2 mm × 2.1 mm conductors and Class-H PEEK/PEI insulation. Higher layer count with square cross-section lifts slot fill factor from ~42–45% → ~62%, cutting active copper mass 15-18% for equal torque and reducing DC I²R loss. The tighter fill also permits a shorter lamination stack at equal MMF, cascading into Si-steel savings and a lighter, more efficient motor that lets the pack shrink slightly. AC (proximity/skin) loss in the outer layers must be managed by layer transposition and correct conductor aspect ratio, which the 8-layer topology inherently improves versus 4-layer designs. At 800V the phase current halves versus 400V, so the smaller conductor cross-section is dielectrically and thermally comfortable under oil-spray cooling. Copper at €14.5/kg hairpin profile makes each kg removed worth real money at 80k/yr volumes. Winding, forming, insertion and welding cells are established at Tier-1s (Bosch, Schaeffler, Grob lines), so process risk is contained and the change is a line reconfiguration rather than a greenfield investment. Target copper mass reduction ≈ 6.8 kg → 5.6 kg per stator, with measurable knock-on savings in the impregnation and balancing steps downstream of winding.';
const LONG_MFG = 'Requires 8-layer hairpin forming, insertion and twisting tooling plus a higher weld count per stator (more pin pairs). Grob/Schaeffler-class winding lines already run 8-layer square wire in volume, so this is line reconfiguration rather than green-field. Higher pin count raises laser-weld cycle count ~30-50%, partly offset by faster fill and shorter varnish/impregnation cycles. Slot insulation paper and pin coating tolerances tighten measurably. Net cell cycle time roughly neutral to slightly higher, but material and efficiency gains dominate the business case at 80,000 units/yr across both drive units.';
const LONG_RISK = 'AC copper loss at high rpm can erode the efficiency benefit if conductor aspect ratio is wrong; validate with electromagnetic FEA before tooling commitment. Weld quality on the higher pin count needs inline inspection to protect first-pass yield. Insulation system change requires full dielectric requalification at 800V including partial-discharge testing, and supplier capacity for square wire must be secured early — mitigations: dual-source the profile and gate tooling release on B-sample results.';
export function makeIdea(i, over = {}) {
  return {
    id: `idea-${i}`, title: over.title ?? `Idea ${i}: slot fill 42%→62%, copper ↓18% with 8-layer square hairpin winding conversion programme`,
    technicalDescription: LONG_DESC, manufacturingImpact: LONG_MFG, riskNotes: LONG_RISK,
    costSavingTypes: over.types ?? ['material', 'weight', 'process', 'commonisation'],
    costSavingPotential: { qualitative: 'High — copper mass and efficiency both improve', percentage: over.pct ?? '0.5-1.5 efficiency pts → pack saving, resin ↓30-50%', annualValue: over.annual ?? '£1.1M–£1.5M at 80,000 units/yr', calculationBasis: 'copper delta × volume', paybackMonths: 14 },
    implementationDifficulty: ['Low', 'Medium', 'High'][i % 3], systemLevel: ['Part', 'Subassembly', 'Assembly'][i % 3],
    timeToImplement: '12-18 months (tooling-gated, B-sample Q3)', benchmarkReference: 'unverified: XPeng G6 3rd-gen PMSM (2023): 8-layer square hairpin, 97.86% motor efficiency; NIO ET9 925V W-pin continuous wave winding, 4.3 kW/kg',
    dfmaPrinciples: ['Design for higher functional density', 'Reduce material content', 'Error-proof welding with inspection', 'Standardise conductor geometry'],
    searchDataUsed: false, confidenceLevel: 'benchmarked', evidenceUnverified: true,
    evidenceSources: [{ type: 'teardown', title: 'XPeng G6 e-drive teardown ≈ 62% slot fill', confidence: 'medium', year: 2024 }, { type: 'oem_press_release', title: 'NIO ET9 925V architecture', confidence: 'low', year: 2025 }],
    validationFlags: [], qualityScore: 84,
    engineCheck: i % 2 === 0 ? { referenceCase: '1.2 kg Copper (wire) via Winding → 1.0 kg, 80k/yr, Germany', baselineEur: 23.4, proposedEur: 17.1, savingPct: 26.9, direction: 'confirmed', basis: 'Deterministic should-cost engine on a reference part — validates the DIRECTION of the move, not this part’s exact figure.' } : null,
    rank: { score: 812345.6, basis: 'payback 14mo ×1.09 · quality 84 ×0.92 · engine confirmed ×1.2' },
  };
}
export const RESULT = {
  id: 'fix-1', config: { systemId: 's', subassemblyId: 'x', vehicleType: 'Performance SUV — BEV (Dual-Motor, 800V)', annualVolume: 80000, plantRegion: 'germany', currency: 'GBP', apiKey: '' },
  ideas: Array.from({ length: 18 }, (_, i) => makeIdea(i + 1)),
  sources: [{ query: 'hairpin winding cost', purpose: 'technology_benchmark', results: [{ title: 'r', url: 'https://x', snippet: 's', source: 'x.com' }], timestamp: 'now' }],
  summary: { totalIdeas: 18, quickWins: 6, programmeItems: 6, strategicItems: 6 }, generatedAt: 'now',
};
