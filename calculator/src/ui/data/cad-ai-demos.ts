import type { CADAnalysisResult } from '../../engine/ai-analysis.js';

// AI CAD-to-Cost pre-computed demo results.
// Expert-crafted CADAnalysisResult objects for 16 luxury-SUV automotive parts.
// These simulate what a live AI analysis returns, so users can explore the full
// CAD-to-Cost output (DFM issues, process comparison cards, cost ranges, etc.)
// without uploading a STEP file or consuming API credits.
export const CAD_AI_DEMOS: Record<string, CADAnalysisResult> = {

  // ── 1. MACHINING ──────────────────────────────────────────────────────────
  machining: {
    partName: 'Bentley Bentayga Front Wheel Carrier',
    geometry: {
      boundingBoxMm: { x: 295, y: 220, z: 175 },
      estimatedVolumeCm3: 342,
      estimatedSurfaceAreaCm2: 1840,
      estimatedWeightKg: { aluminum: 0.923, steel: 2.68, plastic: 0.376 },
    },
    detectedFeatures: [
      { type: 'Bore', description: 'Hub bearing bore Ø92 mm H7 precision bore', count: 1, significance: 'High' },
      { type: 'Threaded Hole', description: 'M14×1.5 wheel stud tapped holes', count: 5, significance: 'High' },
      { type: 'Threaded Hole', description: 'M12×1.25 caliper mounting tapped holes', count: 2, significance: 'High' },
      { type: 'Milled Pocket', description: 'Lightening pockets and material-reduction features', count: 8, significance: 'Medium' },
      { type: 'Flat Face', description: 'Bearing seat and mating face precision lands', count: 6, significance: 'Medium' },
      { type: 'Radius / Fillet', description: 'Stress-relief fillets at load-path intersections', count: 12, significance: 'Low' },
    ],
    materialAnalysis: {
      fromMetadata: false,
      primarySuggestion: { materialId: 'mat-al6061', name: 'Aluminium 6061-T6', confidencePct: 89, reasoning: 'Chassis/suspension geometry, 2.65 kg target weight, and OEM specification for premium BEV-compatible carriers all point to Al 6061-T6 aerospace billet.' },
      alternatives: [
        { materialId: 'mat-hss', name: 'High-Strength Steel', confidencePct: 8 },
        { materialId: 'mat-stainless-316', name: 'Stainless 316', confidencePct: 3 },
      ],
    },
    processRecommendations: [
      { process: '5-Axis CNC Machining (Primary)', commodityType: 'machining', confidencePct: 91, reasoning: 'Complex multi-plane geometry with tight H7 bearing bore and undercut features requires 5-axis simultaneous machining on a DMG DMU 50 or equivalent. Single-setup indexing keeps geometric tolerances within ±0.02 mm.', estimatedCycleTimeHr: 0.72 },
      { process: '3-Axis CNC Finish Mill (Secondary)', commodityType: 'machining', confidencePct: 6, reasoning: 'Feasible only if component is redesigned to eliminate undercuts — would require 3 setups and increase cycle time by ~40%.', estimatedCycleTimeHr: 1.05 },
    ],
    manufacturabilityScore: 78,
    manufacturabilityRisks: [
      { severity: 'High', feature: 'Hub Bore Ø92 H7', description: 'Bore tolerance ±0.018 mm requires boring after milling; tool deflection risk at depth.', suggestion: 'Use CBN-tipped boring bar at <50 mm/min feed; measure with air-gauge between passes.' },
      { severity: 'Medium', feature: 'Deep Pocket Depth-to-Width Ratio', description: 'Lightening pockets reach D:W of 3.8:1 — chatter risk with standard end mills.', suggestion: 'Use high-helix carbide variable-pitch cutters and reduce step-over to 30 % ae.' },
      { severity: 'Low', feature: 'Thin Wall Section 4.2 mm', description: 'Adjacent to knuckle arm; deflection during finish pass may exceed profile tolerance.', suggestion: 'Rough from solid leaving 0.5 mm stock; support with viscous damper fixture.' },
    ],
    costInputSuggestions: {
      recommendedCommodity: 'machining',
      netWeightKg: 2.65,
      materialId: 'mat-al6061',
      estimatedCycleTimeHr: 0.72,
      estimatedSetupTimeHr: 0.50,
      estimatedOperations: [
        { name: '5-Axis Rough Mill', machineId: 'mach-dmg-dmu50', cycleTimeHr: 0.28, labourId: 'lab-uk-skilled', oee: 0.82, manning: 1, labourEfficiency: 0.90 },
        { name: '5-Axis Semi-Finish Mill', machineId: 'mach-dmg-dmu50', cycleTimeHr: 0.22, labourId: 'lab-uk-skilled', oee: 0.82, manning: 1, labourEfficiency: 0.90 },
        { name: 'Hub Bore — Finish Boring', machineId: 'mach-lathe-cnc', cycleTimeHr: 0.12, labourId: 'lab-uk-skilled', oee: 0.85, manning: 1, labourEfficiency: 0.92 },
        { name: 'Tapping & Drilling Cycle', machineId: 'mach-drill', cycleTimeHr: 0.10, labourId: 'lab-uk-skilled', oee: 0.88, manning: 1, labourEfficiency: 0.92 },
      ],
      fieldConfidences: { 'mach-weight': 0.88, 'mach-cycle': 0.82, 'mach-setup': 0.79, 'mach-op0-cycle': 0.84, 'mach-op1-cycle': 0.80 },
      dfmIssues: [
        { severity: 'High', area: 'Hub Bore Tolerance', description: 'Ø92 H7 (+0/+0.035 mm) — tightest feature on part.', impact: 'Scrap rate 3–5 % if boring strategy not planned from program start.', fix: 'Dedicated boring operation; specify go/no-go gauge 100 % inspection.' },
        { severity: 'Medium', area: 'Pocket Depth', description: 'Pocket depth 38 mm with 10 mm tool diameter = D/W 3.8.', impact: 'Tool deflection ±0.04 mm in finishing pass; surface finish Rz 6.3 vs. Rz 3.2 spec.', fix: 'Split into roughing pass (1.5× Ø) + solid-carbide 6-flute finish mill.' },
      ],
      costRange: { low: 148, mid: 185, high: 245, currency: 'GBP' },
      stage1Selection: { primary: 'machining', conf: 0.91, alt: [{ type: 'casting', conf: 0.06 }, { type: 'forging', conf: 0.03 }] },
    },
    aiExplanation: 'The Bentley Bentayga Front Wheel Carrier is a structurally complex Al 6061-T6 suspension component. Its multi-plane geometry, H7 precision bearing bore, and array of tapped holes make 5-axis simultaneous machining the only economical single-step route. The billet weight starts at ~7.8 kg (Al), yielding a buy-to-fly ratio of 2.95 — consistent with aerospace-grade structural machining. DFM attention is needed on the hub bore and deep pockets. Estimated part cost at 100 k units/year: £148–£245.',
    confidenceLevel: 'High',
    analysisLimitations: ['Wall thickness derived from bounding-box heuristic; actual thin sections require STEP analysis.', 'Fixture cost not included in cost range.'],
  },

  // ── 2. CASTING ────────────────────────────────────────────────────────────
  casting: {
    partName: 'Range Rover Sport Auxiliary Oil Pump Housing',
    geometry: {
      boundingBoxMm: { x: 185, y: 145, z: 120 },
      estimatedVolumeCm3: 128,
      estimatedSurfaceAreaCm2: 820,
      estimatedWeightKg: { aluminum: 0.346, steel: 1.004, plastic: 0.141 },
    },
    detectedFeatures: [
      { type: 'Boss', description: 'Pump bore bosses × 2, Ø45 mm', count: 2, significance: 'High' },
      { type: 'Port', description: 'Oil inlet/outlet ports with threaded inserts', count: 4, significance: 'High' },
      { type: 'Fin / Rib', description: 'Cooling fins on external faces', count: 14, significance: 'Medium' },
      { type: 'Cored Hole', description: 'Internal oil gallery passages', count: 6, significance: 'High' },
      { type: 'Draft Surface', description: 'Die-cast tooling pull faces', count: 22, significance: 'Low' },
    ],
    materialAnalysis: {
      fromMetadata: false,
      primarySuggestion: { materialId: 'mat-lm25', name: 'LM25 / A356 Aluminium', confidencePct: 84, reasoning: 'Oil pump housing demands pressure-tight casting (porosity <0.5 %), elevated temperature performance to 150 °C, and good machinability for bore finishing — all met by LM25 (A356-T6).' },
      alternatives: [
        { materialId: 'mat-al6061', name: 'Al 6061-T6 (machined)', confidencePct: 10 },
        { materialId: 'mat-gjl350', name: 'Grey Cast Iron GJL-350', confidencePct: 6 },
      ],
    },
    processRecommendations: [
      { process: 'High Pressure Die Casting 800T (Primary)', commodityType: 'casting', confidencePct: 86, reasoning: 'Complex internal galleries and thin-wall cooling fins suit HPDC; 65 s cycle time, 2-cavity tool, 140 k die life. Subsequent bore/port machining in 2-op sequence.', estimatedCycleTimeHr: 0.018 },
      { process: 'Gravity Die Casting (Alternative)', commodityType: 'casting', confidencePct: 9, reasoning: 'Better porosity for pressure-critical parts but 4× cycle time and higher piece cost at volume.', estimatedCycleTimeHr: 0.25 },
      { process: 'Sand Casting (Low Volume)', commodityType: 'casting', confidencePct: 5, reasoning: 'Viable only below 5 000 ppa; pattern cost £18 k but eliminates die investment.', estimatedCycleTimeHr: 1.20 },
    ],
    manufacturabilityScore: 82,
    manufacturabilityRisks: [
      { severity: 'High', feature: 'Internal Oil Galleries', description: 'Cores for galleries require salt/sand core sets; core shift risk ±0.3 mm.', suggestion: 'Use HPDC salt cores or gravity route for pressure-critical galleries; X-ray inspect 5 % of production.' },
      { severity: 'Medium', feature: 'Thin Fins (1.8 mm)', description: 'HPDC fill risk on fins thinner than 2.0 mm — cold shut defects likely.', suggestion: 'Increase fin thickness to 2.2 mm min or increase shot velocity; add overflow wells.' },
      { severity: 'Low', feature: 'Port Thread Insert Pull-Out', description: 'M14 threaded steel inserts in aluminium — differential thermal expansion.', suggestion: 'Specify PEM-style helical inserts and torque-tension audit in production.' },
    ],
    costInputSuggestions: {
      recommendedCommodity: 'casting',
      netWeightKg: 1.85,
      materialId: 'mat-lm25',
      estimatedCycleTimeHr: 0.018,
      estimatedSetupTimeHr: 0.083,
      estimatedOperations: [
        { name: 'HPDC Shot', machineId: 'mach-vmc3', cycleTimeHr: 0.018, labourId: 'lab-uk-skilled', oee: 0.88, manning: 1, labourEfficiency: 0.90 },
        { name: 'Bore & Port Finish Mill', machineId: 'mach-haas-vf2', cycleTimeHr: 0.10, labourId: 'lab-uk-skilled', oee: 0.85, manning: 1, labourEfficiency: 0.92 },
      ],
      casting: { subtype: 'hpdc', dieMouldCostGBP: 140000, dieMouldLife: 140000, cavities: 2, yieldFraction: 0.92, cycleTimeHpdcSec: 65, cycleTimeSandGravHr: 0 },
      fieldConfidences: { 'cast-weight': 0.86, 'cast-cycle': 0.83, 'cast-die-cost': 0.78, 'cast-die-life': 0.75, 'cast-cav': 0.88 },
      dfmIssues: [
        { severity: 'High', area: 'Internal Gallery Porosity', description: 'Oil galleries at 4 bar operating pressure require <0.5 % porosity.', impact: 'Field warranty risk if undetected; oil pump housing failures cause engine damage.', fix: 'Specify HIP treatment or vacuum-assisted HPDC; 100 % leak test at 6 bar air.' },
        { severity: 'Medium', area: 'Cooling Fin Fill', description: '1.8 mm fins at HPDC fill velocity may trap gas.', impact: 'Surface porosity and cold-shut up to 15 % first-off rejection rate.', fix: 'Redesign fins to 2.2 mm; relocate overflows; increase shot velocity to 55 m/s.' },
      ],
      costRange: { low: 8.20, mid: 11.50, high: 16.80, currency: 'GBP' },
      stage1Selection: { primary: 'casting', conf: 0.86, alt: [{ type: 'machining', conf: 0.10 }, { type: 'forging', conf: 0.04 }] },
    },
    aiExplanation: 'The Range Rover Sport Oil Pump Housing is an ideal HPDC candidate: enclosed galleries, moderate complexity, high annual volumes. LM25 provides the necessary pressure-tightness and thermal stability. At 100 k ppa with a 2-cavity 140 k-life die, amortised tooling contributes £0.70/part and piece cost settles at £8.20–£11.50 in the mid range.',
    confidenceLevel: 'High',
    analysisLimitations: ['Internal gallery geometry estimated from external bounding box; actual core complexity requires STEP file.'],
  },

  // ── 3. CAST AND MACHINE ──────────────────────────────────────────────────
  cast_and_machine: {
    partName: 'Rolls-Royce Cullinan Transfer Case Housing',
    geometry: {
      boundingBoxMm: { x: 320, y: 280, z: 220 },
      estimatedVolumeCm3: 892,
      estimatedSurfaceAreaCm2: 3640,
      estimatedWeightKg: { aluminum: 2.41, steel: 7.00, plastic: 0.98 },
    },
    detectedFeatures: [
      { type: 'Precision Bore', description: 'Input shaft bearing bore Ø110 H6', count: 1, significance: 'High' },
      { type: 'Precision Bore', description: 'Output shaft bearing bores Ø95 H6', count: 2, significance: 'High' },
      { type: 'Mating Face', description: 'Gearbox-mating flange face Ra 1.6', count: 2, significance: 'High' },
      { type: 'Fastener Boss', description: 'M12 cap screw bosses', count: 16, significance: 'Medium' },
      { type: 'Oil Gallery', description: 'Internal lubrication passages', count: 8, significance: 'High' },
      { type: 'Rib / Web', description: 'Stiffening ribs between bore towers', count: 10, significance: 'Medium' },
    ],
    materialAnalysis: {
      fromMetadata: false,
      primarySuggestion: { materialId: 'mat-lm25', name: 'LM25 / A380 Aluminium', confidencePct: 82, reasoning: 'Transfer case housings combine structural stiffness with weight targets; LM25 gravity die or HPDC followed by precision boring of bearing bores meets both OEM requirements.' },
      alternatives: [
        { materialId: 'mat-gjl350', name: 'Grey Iron GJL-350', confidencePct: 12 },
        { materialId: 'mat-al6061', name: 'Al 6061-T6 Billet', confidencePct: 6 },
      ],
    },
    processRecommendations: [
      { process: 'HPDC + 5-Axis Precision Machine (Primary)', commodityType: 'cast_and_machine', confidencePct: 88, reasoning: 'Housing geometry with closed cavities and ribs is produced most economically by HPDC, followed by 5-axis precision boring of bearing seats and surfacing of mating flanges. Total 2-operation sequence.', estimatedCycleTimeHr: 0.62 },
      { process: 'Gravity Die + 3-Axis Machine', commodityType: 'cast_and_machine', confidencePct: 9, reasoning: 'Lower tooling cost £180k vs £285k but 3× cycle time and porosity risk on bearing seats.', estimatedCycleTimeHr: 1.20 },
    ],
    manufacturabilityScore: 76,
    manufacturabilityRisks: [
      { severity: 'High', feature: 'Bearing Bore Alignment Ø110 / Ø95 H6', description: 'Three bores must be co-axial within 0.015 mm; HPDC die shift can introduce 0.08 mm offset before machining.', suggestion: 'Single-setup 5-axis boring of all three bores from common datum; specify CMM 100 % bore check.' },
      { severity: 'Medium', feature: 'Mating Face Flatness 0.03 mm', description: 'Casting distortion post-shot may exceed 0.1 mm; needs stress-relief ageing before machine.', suggestion: 'Natural age 24 h or oven age 180 °C × 4 h before finish milling; clamp pattern to avoid induced distortion.' },
      { severity: 'Medium', feature: 'Wall Section 3.5 mm Adjacent to Gallery', description: 'Thin wall next to cored oil passages — risk of porosity and crack propagation under fatigue.', suggestion: 'Increase section to 4.5 mm or specify vacuum-assisted HPDC; proof-test 100 % at 6 bar oil.' },
    ],
    costInputSuggestions: {
      recommendedCommodity: 'cast_and_machine',
      netWeightKg: 3.40,
      materialId: 'mat-lm25',
      estimatedCycleTimeHr: 0.62,
      estimatedSetupTimeHr: 0.167,
      estimatedOperations: [
        { name: 'HPDC Cast — Housing', machineId: 'mach-vmc3', cycleTimeHr: 0.025, labourId: 'lab-uk-skilled', oee: 0.88, manning: 1, labourEfficiency: 0.90 },
        { name: 'Face Mill — Mating Flanges', machineId: 'mach-haas-vf2', cycleTimeHr: 0.15, labourId: 'lab-uk-skilled', oee: 0.85, manning: 1, labourEfficiency: 0.92 },
        { name: '5-Axis Bore — Bearing Seats', machineId: 'mach-dmg-dmu50', cycleTimeHr: 0.28, labourId: 'lab-uk-skilled', oee: 0.82, manning: 1, labourEfficiency: 0.90 },
        { name: 'Drill & Tap — Cap Screw Bosses', machineId: 'mach-drill', cycleTimeHr: 0.15, labourId: 'lab-uk-skilled', oee: 0.88, manning: 1, labourEfficiency: 0.92 },
      ],
      casting: { subtype: 'hpdc', dieMouldCostGBP: 285000, dieMouldLife: 100000, cavities: 1, yieldFraction: 0.90, cycleTimeHpdcSec: 90, cycleTimeSandGravHr: 0 },
      fieldConfidences: { 'cam-cast-weight': 0.83, 'cam-mach-cycle': 0.80, 'cam-die-cost': 0.76, 'cam-bore-align': 0.85 },
      dfmIssues: [
        { severity: 'High', area: 'Bearing Bore Co-axiality', description: 'Three bearing seats must align ±0.015 mm after casting and machining.', impact: 'Transfer case noise, gear wear, and potential NVH warranty claims.', fix: 'Single datum 5-axis boring; CMM inline measurement after boring; torque-tighten in assembly fixture.' },
        { severity: 'Medium', area: 'Mating Face Flatness', description: 'Ra 1.6 µm flatness 0.03 mm on HPDC casting.', impact: 'Oil leak at housing joint under thermal cycling.', fix: 'Stress-relief anneal; finish face-mill in single pass using rigid fixture.' },
      ],
      costRange: { low: 42, mid: 58, high: 85, currency: 'GBP' },
      stage1Selection: { primary: 'cast_and_machine', conf: 0.88, alt: [{ type: 'casting', conf: 0.09 }, { type: 'machining', conf: 0.03 }] },
    },
    aiExplanation: 'The Rolls-Royce Cullinan Transfer Case Housing is a large, complex Al casting with precision bearing bores. HPDC provides the most economical route at volume; 5-axis boring of the three co-axial seats is the critical machining sequence. Total piece cost £42–£85 at 20 k ppa, driven predominantly by tooling amortisation and 5-axis cycle time.',
    confidenceLevel: 'High',
    analysisLimitations: ['Bore co-axiality requirement estimated from class-C SUV specs; actual tolerance confirmed from OEM drawing.'],
  },

  // ── 4. FORGING ───────────────────────────────────────────────────────────
  forging: {
    partName: 'Mercedes GLS 580 Rear Upper Control Arm',
    geometry: {
      boundingBoxMm: { x: 385, y: 85, z: 55 },
      estimatedVolumeCm3: 185,
      estimatedSurfaceAreaCm2: 960,
      estimatedWeightKg: { aluminum: 0.50, steel: 1.45, plastic: 0.20 },
    },
    detectedFeatures: [
      { type: 'Ball Joint Eye', description: 'Spherical bearing housing ends × 2', count: 2, significance: 'High' },
      { type: 'Arm Profile', description: 'Tapered I-section arm between eyes', count: 1, significance: 'High' },
      { type: 'Precision Bore', description: 'Bearing bore Ø42 H7 reamed after forging', count: 2, significance: 'High' },
      { type: 'Flash Line', description: 'Forging flash trim line along parting plane', count: 1, significance: 'Low' },
    ],
    materialAnalysis: {
      fromMetadata: false,
      primarySuggestion: { materialId: 'mat-al6061', name: 'Al 6082-T6 (close to Al6061)', confidencePct: 85, reasoning: 'Suspension control arms require fatigue-rated forged aluminium; Al 6082-T6 is the standard OEM choice for its fine-grain forgeable microstructure and excellent fatigue endurance at low weight.' },
      alternatives: [
        { materialId: 'mat-hss', name: 'Stamped HSS (Alternative)', confidencePct: 10 },
        { materialId: 'mat-stainless-316', name: 'Stainless (Niche)', confidencePct: 5 },
      ],
    },
    processRecommendations: [
      { process: 'Closed-Die Forge 500T + Trim + Ream (Primary)', commodityType: 'forging', confidencePct: 90, reasoning: 'Closed-die aluminium forging on a 500-tonne press delivers the grain-flow alignment needed for fatigue life. 4-stroke sequence (billet heat → block → semi-finish → finish → trim). Post-forge ream of ball-joint bores to H7.', estimatedCycleTimeHr: 0.022 },
      { process: 'Extrusion + Machine (Alternative)', commodityType: 'extrusion', confidencePct: 7, reasoning: 'Extruded 6082 with machined ends — cheaper tooling but inferior grain flow and fatigue properties; not acceptable for primary suspension.', estimatedCycleTimeHr: 0.45 },
    ],
    manufacturabilityScore: 84,
    manufacturabilityRisks: [
      { severity: 'Medium', feature: 'Draft Angle at Eye Forging', description: 'Spherical eye requires 3° draft; insufficient draft causes die lock.', suggestion: 'Confirm minimum 3° on all die pull faces; add 0.2 mm forge allowance on bore IDs.' },
      { severity: 'Medium', feature: 'Underfill Risk at Thin I-Section', description: 'Tapered web <8 mm may underfill at reduced billet temperature.', suggestion: 'Maintain billet temperature 490–510 °C; monitor forging load vs. displacement.' },
      { severity: 'Low', feature: 'Bore Reaming Datum', description: 'Bore ream datum must be the forged parting plane — not the flash trim edge.', suggestion: 'Specify datum in drawing; use self-centring collet fixture for ream operation.' },
    ],
    costInputSuggestions: {
      recommendedCommodity: 'forging',
      netWeightKg: 1.45,
      materialId: 'mat-al6061',
      estimatedCycleTimeHr: 0.022,
      estimatedSetupTimeHr: 0.083,
      estimatedOperations: [
        { name: 'Billet Heat & Load', machineId: 'mach-vmc3', cycleTimeHr: 0.005, labourId: 'lab-uk-skilled', oee: 0.88, manning: 1, labourEfficiency: 0.90 },
        { name: 'Forge — 4-Stroke 500T Press', machineId: 'mach-vmc3', cycleTimeHr: 0.012, labourId: 'lab-uk-skilled', oee: 0.85, manning: 1, labourEfficiency: 0.90 },
        { name: 'Flash Trim', machineId: 'mach-vmc3', cycleTimeHr: 0.003, labourId: 'lab-uk-semiskilled', oee: 0.90, manning: 1, labourEfficiency: 0.92 },
        { name: 'Bore Ream — Ball Joint Ø42 H7', machineId: 'mach-drill', cycleTimeHr: 0.018, labourId: 'lab-uk-skilled', oee: 0.88, manning: 1, labourEfficiency: 0.92 },
      ],
      forging: { flashKg: 0.22, yieldFraction: 0.87, dieCostGBP: 95000, dieLife: 80000, strokes: 4, timePerBlowSec: 3.0 },
      fieldConfidences: { 'forg-weight': 0.88, 'forg-flash': 0.82, 'forg-die-cost': 0.80, 'forg-strokes': 0.85, 'forg-die-life': 0.78 },
      dfmIssues: [
        { severity: 'Medium', area: 'Eye Draft Angle', description: 'Insufficient draft causes die lock; production stoppage.', impact: 'Die lock at 5 % of shots; tooling damage; unplanned downtime.', fix: 'Minimum 3° all pull faces; confirm with die designer before cut.' },
        { severity: 'Low', area: 'Bore Datum', description: 'Ream datum ambiguity in drawing.', impact: 'Ball joint bore run-out >0.05 mm; NVH complaints.', fix: 'Specify parting-plane datum; call out in PPAP control plan.' },
      ],
      costRange: { low: 12.50, mid: 17.80, high: 26.50, currency: 'GBP' },
      stage1Selection: { primary: 'forging', conf: 0.90, alt: [{ type: 'casting', conf: 0.07 }, { type: 'machining', conf: 0.03 }] },
    },
    aiExplanation: 'The Mercedes GLS 580 Rear Upper Control Arm is a fatigue-critical suspension forging. Closed-die Al 6082-T6 on a 500T press delivers the grain-flow alignment and tensile strength (≥310 MPa) required by FMEA. At 80 k ppa, tooling amortisation is £1.19/part; piece cost range £12.50–£26.50 depending on scrap, heat treatment, and bore finishing.',
    confidenceLevel: 'High',
    analysisLimitations: ['Fatigue life estimation requires FEA with actual grain-flow model; not computed from geometry alone.'],
  },

  // ── 5. SHEET METAL ───────────────────────────────────────────────────────
  sheet_metal: {
    partName: 'Bentley Bentayga Boot Lid Outer Skin',
    geometry: {
      boundingBoxMm: { x: 1280, y: 1050, z: 220 },
      estimatedVolumeCm3: 3080,
      estimatedSurfaceAreaCm2: 16400,
      estimatedWeightKg: { aluminum: 4.43, steel: 12.87, plastic: 3.54 },
    },
    detectedFeatures: [
      { type: 'Class-A Surface', description: 'Exterior styling surface — curvature continuity G2', count: 1, significance: 'High' },
      { type: 'Hem Flange', description: 'Perimeter inner-to-outer panel hem', count: 1, significance: 'High' },
      { type: 'Character Line', description: 'Crisp styling character lines across width', count: 2, significance: 'High' },
      { type: 'Aperture', description: 'Rear number plate aperture', count: 1, significance: 'Medium' },
      { type: 'Mounting Hole', description: 'Hinge, gas strut, and seal mounting holes', count: 12, significance: 'Medium' },
    ],
    materialAnalysis: {
      fromMetadata: false,
      primarySuggestion: { materialId: 'mat-al5052', name: 'AA6016-T4 Aluminium (approximated by Al5052)', confidencePct: 86, reasoning: 'Bentley ultra-premium closure panels specify AA6016-T4 automotive body sheet for paint-bake hardening, excellent hemming, and Class-A surface quality after stamping.' },
      alternatives: [
        { materialId: 'mat-dc01', name: 'DC04 Deep-Draw Steel', confidencePct: 8 },
        { materialId: 'mat-al6061', name: 'Al 6061-T4', confidencePct: 6 },
      ],
    },
    processRecommendations: [
      { process: 'Tandem Progressive Draw + Restrike (Primary)', commodityType: 'sheet_metal', confidencePct: 87, reasoning: 'Large closure panel requires 1.4 m transfer press or tandem line: Draw → Restrike → Trim → Flange → Pierce. 5-operation progressive in servo-transfer press at 6 spm delivers Class-A surface.', estimatedCycleTimeHr: 0.0028 },
      { process: 'Superplastic Forming (Premium Alternative)', commodityType: 'sheet_metal', confidencePct: 10, reasoning: 'SPF eliminates springback and allows deeper draws, but cycle time 4–8 min/part limits to <2 000 ppa; not viable at volume.', estimatedCycleTimeHr: 0.10 },
    ],
    manufacturabilityScore: 74,
    manufacturabilityRisks: [
      { severity: 'High', feature: 'Springback on Character Lines', description: 'Al 6016-T4 exhibits 3–5° springback on crisp feature lines; requires overbend compensation.', suggestion: 'Simulate springback in AutoForm; build 4° overbend into restrike die; validate with blue-light scan.' },
      { severity: 'High', feature: 'Hem Flange Cracking', description: 'Al alloys prone to cracking on tight hems at 0° fold-over without pre-hemming.', suggestion: 'Specify 3-stage hem (pre-hem 30° → 60° → flat); apply hem adhesive for stiffness.' },
      { severity: 'Medium', feature: 'Draw Depth 220 mm', description: 'Deep draw ratio 0.17 (depth/diagonal) — moderate risk; lubrication critical.', suggestion: 'Use draw compound (Quaker Ferrocoat 3180); monitor binder force via tonnage trace.' },
    ],
    costInputSuggestions: {
      recommendedCommodity: 'sheet_metal',
      netWeightKg: 3.85,
      materialId: 'mat-al5052',
      estimatedCycleTimeHr: 0.0028,
      estimatedSetupTimeHr: 0.333,
      estimatedOperations: [
        { name: 'Blank & First Draw', machineId: 'mach-vmc3', cycleTimeHr: 0.0010, labourId: 'lab-uk-skilled', oee: 0.85, manning: 1, labourEfficiency: 0.92 },
        { name: 'Restrike & Flange', machineId: 'mach-vmc3', cycleTimeHr: 0.0008, labourId: 'lab-uk-skilled', oee: 0.85, manning: 1, labourEfficiency: 0.92 },
        { name: 'Trim & Pierce', machineId: 'mach-vmc3', cycleTimeHr: 0.0006, labourId: 'lab-uk-semiskilled', oee: 0.88, manning: 1, labourEfficiency: 0.92 },
        { name: 'Hem (3-Stage)', machineId: 'mach-vmc3', cycleTimeHr: 0.0004, labourId: 'lab-uk-skilled', oee: 0.85, manning: 1, labourEfficiency: 0.90 },
      ],
      fieldConfidences: { 'sm-weight': 0.85, 'sm-blank-len': 0.82, 'sm-blank-wid': 0.82, 'sm-cycle': 0.78, 'sm-die-cost': 0.80 },
      dfmIssues: [
        { severity: 'High', area: 'Springback on Character Lines', description: 'Al 6016 springback 3–5° on crisp lines.', impact: 'Panel gap variation >1.5 mm; fit/finish reject at final quality gate.', fix: 'AutoForm springback simulation; restrike die overbend 4°; 100 % blue-light scan.' },
        { severity: 'High', area: 'Hem Cracking', description: 'Flat hem on 0.9 mm Al 6016 — cracking risk at corners.', impact: 'Assembly line stoppage; hem rework or scrap at 8–12 % without pre-hem.', fix: '3-stage progressive hem; hem radius min 0.5 × t; adhesive bond before final close.' },
      ],
      costRange: { low: 18.50, mid: 28.40, high: 42.00, currency: 'GBP' },
      stage1Selection: { primary: 'sheet_metal', conf: 0.87, alt: [{ type: 'composites', conf: 0.10 }, { type: 'thermoforming', conf: 0.03 }] },
    },
    aiExplanation: 'The Bentley Bentayga Boot Lid Outer Skin is a large Class-A aluminium closure panel. Servo-transfer press stamping is the only economical route at volume (100 k+ ppa). Springback management and hem integrity are the critical DFM issues for this alloy. Piece cost £18.50–£42 driven by die amortisation (£320 k / 300 k shots) and material buy-to-fly ratio of 1.62.',
    confidenceLevel: 'High',
    analysisLimitations: ['Springback amount is material-grade dependent; AutoForm simulation required for actual die compensation.'],
  },

  // ── 6. SHEET METAL FAB ──────────────────────────────────────────────────
  sheet_metal_fab: {
    partName: 'Range Rover Vogue Engine Undertray Support Bracket',
    geometry: {
      boundingBoxMm: { x: 520, y: 380, z: 85 },
      estimatedVolumeCm3: 248,
      estimatedSurfaceAreaCm2: 1820,
      estimatedWeightKg: { aluminum: 0.67, steel: 1.95, plastic: 0.27 },
    },
    detectedFeatures: [
      { type: 'Bent Flange', description: 'Mounting flanges bent to 90° both ends', count: 4, significance: 'High' },
      { type: 'Laser Cut Profile', description: 'Laser-cut perimeter with lightening apertures', count: 1, significance: 'High' },
      { type: 'Spot Weld', description: 'Reinforcement plate spot welded × 12 SW', count: 12, significance: 'Medium' },
      { type: 'Weld Nut', description: 'M10 weld nuts for undertray attachment', count: 6, significance: 'Medium' },
      { type: 'Emboss', description: 'Channel section embosses for stiffness', count: 3, significance: 'Low' },
    ],
    materialAnalysis: {
      fromMetadata: false,
      primarySuggestion: { materialId: 'mat-dc01', name: 'DC01-GI 2.0 mm (Galvanised)', confidencePct: 88, reasoning: 'Underbody structural bracket requires deep-draw quality galvanised steel for corrosion resistance; DC01-GI 2.0 mm is the standard JLR specification for non-primary structural members.' },
      alternatives: [
        { materialId: 'mat-al5052', name: 'Al 5052 H32 (weight saving)', confidencePct: 8 },
        { materialId: 'mat-stainless-316', name: 'Stainless 304 (premium)', confidencePct: 4 },
      ],
    },
    processRecommendations: [
      { process: 'Laser Blank + 4 Bends + 12 Spot Welds (Primary)', commodityType: 'sheet_metal_fab', confidencePct: 90, reasoning: 'Typical SMF route: Trumpf 3030 laser blank → Amada press brake (4 bends) → Lincoln spot weld (12 SW) → press weld nuts. Total 4-operation sequence, 18–22 min per part in job-shop context.', estimatedCycleTimeHr: 0.35 },
      { process: 'Transfer Die Stamp (High Volume)', commodityType: 'sheet_metal', confidencePct: 8, reasoning: 'Viable above 50 k ppa; die cost £180 k amortises at 18 k/part at 10 k volume vs. £0.45/part at 100 k.', estimatedCycleTimeHr: 0.008 },
    ],
    manufacturabilityScore: 86,
    manufacturabilityRisks: [
      { severity: 'Low', feature: 'Galvanising Burn-Off at Weld', description: 'Spot welding galvanised steel produces zinc fume — extraction required.', suggestion: 'Specify LEV extraction at weld cell; PPE zinc fume protocol; increase weld current 10% vs. bare steel.' },
      { severity: 'Low', feature: 'Weld Nut Projection Tolerance', description: 'Weld nut projection welded blind side — thread damage if overtorqued.', suggestion: 'Specify 100 % torque check after welding; use M10 class 8.8 weld nuts with captive washer.' },
    ],
    costInputSuggestions: {
      recommendedCommodity: 'sheet_metal_fab',
      netWeightKg: 1.95,
      materialId: 'mat-dc01',
      estimatedCycleTimeHr: 0.35,
      estimatedSetupTimeHr: 0.167,
      estimatedOperations: [
        { name: 'Laser Blank — Trumpf 3030', machineId: 'mach-vmc3', cycleTimeHr: 0.08, labourId: 'lab-uk-skilled', oee: 0.88, manning: 1, labourEfficiency: 0.92 },
        { name: 'Press Brake — 4 Bends', machineId: 'mach-vmc3', cycleTimeHr: 0.12, labourId: 'lab-uk-semiskilled', oee: 0.85, manning: 1, labourEfficiency: 0.90 },
        { name: 'Spot Weld — 12 SW + Weld Nuts', machineId: 'mach-vmc3', cycleTimeHr: 0.12, labourId: 'lab-uk-skilled', oee: 0.88, manning: 1, labourEfficiency: 0.90 },
        { name: 'Visual + Torque Check', machineId: 'mach-vmc3', cycleTimeHr: 0.03, labourId: 'lab-uk-semiskilled', oee: 0.95, manning: 1, labourEfficiency: 0.95 },
      ],
      fieldConfidences: { 'smf-weight': 0.88, 'smf-laser-time': 0.85, 'smf-bends': 0.90, 'smf-sw-count': 0.92 },
      dfmIssues: [
        { severity: 'Low', area: 'Zinc Fume at Weld', description: 'Galvanised steel weld generates zinc oxide fume.', impact: 'Operator health risk; regulatory non-compliance without LEV.', fix: 'LEV extraction at weld station; operator zinc fume exposure monitoring.' },
      ],
      costRange: { low: 6.80, mid: 9.50, high: 14.20, currency: 'GBP' },
      stage1Selection: { primary: 'sheet_metal_fab', conf: 0.90, alt: [{ type: 'sheet_metal', conf: 0.08 }, { type: 'machining', conf: 0.02 }] },
    },
    aiExplanation: 'The Range Rover Vogue Engine Undertray Support Bracket is a classic SMF application: laser blank from 2.0 mm DC01-GI, 4 press-brake bends, 12 spot welds with reinforcement plate, and M10 weld nuts. Simple DFM profile with only low-severity risks. Piece cost £6.80–£14.20 depending on batch size; SMF is most economical below 30 k ppa.',
    confidenceLevel: 'High',
    analysisLimitations: ['Cycle time assumes job-shop single-part production; progressive die time at high volume would be 40× faster.'],
  },

  // ── 7. INJECTION MOULDING ────────────────────────────────────────────────
  injection_moulding: {
    partName: 'Rolls-Royce Cullinan Headliner Central Trim Panel',
    geometry: {
      boundingBoxMm: { x: 680, y: 420, z: 55 },
      estimatedVolumeCm3: 428,
      estimatedSurfaceAreaCm2: 5800,
      estimatedWeightKg: { aluminum: 1.156, steel: 3.358, plastic: 0.471 },
    },
    detectedFeatures: [
      { type: 'Class-A Surface', description: 'Visible interior Class-A moulding face', count: 1, significance: 'High' },
      { type: 'Snap Clip', description: 'Integrated snap-fit retainer clips', count: 8, significance: 'High' },
      { type: 'Boss', description: 'Light diffuser mounting bosses', count: 6, significance: 'Medium' },
      { type: 'Rib Grid', description: 'Rear-face stiffening rib pattern', count: 24, significance: 'Medium' },
      { type: 'Gate Vestige Area', description: 'Sub-gate vestige area — hidden face', count: 2, significance: 'Low' },
    ],
    materialAnalysis: {
      fromMetadata: false,
      primarySuggestion: { materialId: 'mat-pp', name: 'PP-GF15 (Polypropylene 15% GF)', confidencePct: 82, reasoning: 'Interior headliner trim balances stiffness (GF reinforcement), low density, and Class-A paintability. PP-GF15 is standard for non-structural headliner components in ultra-premium cabins; flame-retardant grade FR-PP for regulation compliance.' },
      alternatives: [
        { materialId: 'mat-pc', name: 'PC/ABS (Higher Gloss)', confidencePct: 12 },
        { materialId: 'mat-pa6', name: 'PA6-GF30 (Higher Stiffness)', confidencePct: 6 },
      ],
    },
    processRecommendations: [
      { process: '1-Cavity Hot Runner IMM 500T (Primary)', commodityType: 'injection_moulding', confidencePct: 88, reasoning: 'Large trim panel (680 × 420 mm) fits comfortably in a 500T machine. 1-cavity hot-runner tool with sub-gate on B-face; 58 s cycle time; polished A-side for direct paint or foil laminate.', estimatedCycleTimeHr: 0.0161 },
      { process: '2-Cavity IMM 800T (High Volume)', commodityType: 'injection_moulding', confidencePct: 9, reasoning: 'Doubles output but requires 800T press; mould cost increases 35% to £155k; viable above 250 k ppa.', estimatedCycleTimeHr: 0.0081 },
    ],
    manufacturabilityScore: 80,
    manufacturabilityRisks: [
      { severity: 'Medium', feature: 'Snap Clip Undercut', description: 'Integrated snap clips require side-action or lifter — adds £6 k to tooling.', suggestion: 'Review snap geometry with tool designer; if possible change to flex clip eliminating lifter.' },
      { severity: 'Medium', feature: 'Sink Mark at Rib Roots', description: 'Rib thickness >0.6 × wall will cause sink marks on Class-A face.', suggestion: 'Reduce all rib thickness to 0.55 × wall (0.9 mm for 1.65 mm wall); add texture to hide micro-sink.' },
      { severity: 'Low', feature: 'Warp in Large Panel', description: '680 mm panel span; uneven cooling may cause 2–4 mm warp.', suggestion: 'Symmetrical cooling circuit both halves; hold pack pressure 80 % for 20 s; verify with CMM.' },
    ],
    costInputSuggestions: {
      recommendedCommodity: 'injection_moulding',
      netWeightKg: 0.72,
      materialId: 'mat-pp',
      estimatedCycleTimeHr: 0.0161,
      estimatedSetupTimeHr: 0.25,
      estimatedOperations: [
        { name: 'IMM 500T — Inject & Cool', machineId: 'mach-vmc3', cycleTimeHr: 0.0138, labourId: 'lab-uk-semiskilled', oee: 0.88, manning: 1, labourEfficiency: 0.92 },
        { name: 'Gate Remove & Degating', machineId: 'mach-vmc3', cycleTimeHr: 0.0023, labourId: 'lab-uk-semiskilled', oee: 0.95, manning: 1, labourEfficiency: 0.95 },
      ],
      injectionMoulding: { cavities: 1, projectedAreaCm2: 2856, wallThicknessMm: 1.65, mouldCostGBP: 115000, mouldLife: 500000, runnerWeightKg: 0 },
      fieldConfidences: { 'imm-weight': 0.86, 'imm-cycle': 0.84, 'imm-cav': 0.90, 'imm-wall': 0.82, 'imm-mould-cost': 0.78 },
      dfmIssues: [
        { severity: 'Medium', area: 'Snap Clip Lifters', description: '8 snap clips require lifters in tool — cost and cycle impact.', impact: 'Mould cost +£6 k; cycle time +3 s for lifter stroke.', fix: 'Evaluate flex-snap geometry with <0.5 mm undercut eliminating lifter.' },
        { severity: 'Medium', area: 'Rib Sink Mark on Class-A', description: 'Rib-to-wall ratio >0.6 will create visible sink marks.', impact: 'Class-A rejection; polishing/rectification cost; warranty risk.', fix: 'Cap rib thickness at 0.55 × wall; add grain texture SPI-C1 to A-face.' },
      ],
      costRange: { low: 2.80, mid: 4.20, high: 6.80, currency: 'GBP' },
      stage1Selection: { primary: 'injection_moulding', conf: 0.88, alt: [{ type: 'thermoforming', conf: 0.09 }, { type: 'composites', conf: 0.03 }] },
    },
    aiExplanation: 'The Rolls-Royce Cullinan Headliner Central Trim Panel is an ideal injection moulding candidate. PP-GF15 provides the stiffness and finish quality for ultra-premium interior trim. 1-cavity 500T hot-runner tooling at £115 k delivers 58 s cycle; at 100 k ppa piece cost is £2.80–£6.80 depending on decoration method (IML, foil, or post-paint).',
    confidenceLevel: 'High',
    analysisLimitations: ['Decoration cost (foil laminate, IML, or spray) not included in cost range — add £0.80–£4.00/part.'],
  },

  // ── 8. BLOW MOULDING ────────────────────────────────────────────────────
  blow_moulding: {
    partName: 'Mercedes GLS 580 Coolant Expansion Tank',
    geometry: {
      boundingBoxMm: { x: 220, y: 160, z: 180 },
      estimatedVolumeCm3: 982,
      estimatedSurfaceAreaCm2: 2240,
      estimatedWeightKg: { aluminum: 2.65, steel: 7.70, plastic: 1.08 },
    },
    detectedFeatures: [
      { type: 'Neck / Port', description: 'Filler neck with locking cap thread', count: 1, significance: 'High' },
      { type: 'Neck / Port', description: 'Coolant in/out nipple ports × 3', count: 3, significance: 'High' },
      { type: 'Wall', description: 'Uniform HDPE wall 3.5 mm EBM', count: 1, significance: 'Medium' },
      { type: 'Pinch-Off', description: 'Mould parting pinch-off weld line', count: 1, significance: 'Medium' },
      { type: 'Level Sight', description: 'Transparent level indicator window area', count: 1, significance: 'Low' },
    ],
    materialAnalysis: {
      fromMetadata: false,
      primarySuggestion: { materialId: 'mat-pp', name: 'HDPE (nearest: PP grade)', confidencePct: 84, reasoning: 'Coolant tanks require HDPE for chemical resistance to ethylene glycol at 130 °C, ESCR performance, and regulatory compliance (SAE J1285). HDPE EBM is the OEM standard for expansion tanks across all premium brands.' },
      alternatives: [
        { materialId: 'mat-pa6', name: 'PA6 (injection moulded, 2-part)', confidencePct: 10 },
        { materialId: 'mat-pp', name: 'PP Copolymer', confidencePct: 6 },
      ],
    },
    processRecommendations: [
      { process: 'Extrusion Blow Moulding 2-Cavity (Primary)', commodityType: 'blow_moulding', confidencePct: 88, reasoning: 'Hollow enclosed container with multiple port inserts is the defining EBM application. 2-cavity mould on continuous-extrusion EBM machine; 8 s blow time; inserts for nipple ports loaded pre-blow.', estimatedCycleTimeHr: 0.0044 },
      { process: 'Injection Blow Moulding (Alternative)', commodityType: 'blow_moulding', confidencePct: 8, reasoning: 'IBM gives tighter wall tolerance but limited to simpler geometries; not suitable for asymmetric tank with offset ports.', estimatedCycleTimeHr: 0.0030 },
    ],
    manufacturabilityScore: 88,
    manufacturabilityRisks: [
      { severity: 'Medium', feature: 'Port Insert Pull-Out', description: 'In-mould steel inserts for coolant ports — differential thermal expansion risk.', suggestion: 'Use knurled/barbed inserts with hose-clamp compatibility; pull-out torque test 50 N·m min.' },
      { severity: 'Low', feature: 'Pinch-Off Weld Strength', description: 'EBM pinch-off weld typically 70–80 % of parent strength.', suggestion: 'Locate pinch-off in low-stress zone; qualify with burst test at 3× operating pressure (4.5 bar).' },
      { severity: 'Low', feature: 'Wall Thickness Uniformity', description: 'EBM parison programming needed to achieve 3.5 ± 0.4 mm across complex geometry.', suggestion: 'Use parison programming (PWDS) to vary die gap during extrusion; verify with CT scan at first-off.' },
    ],
    costInputSuggestions: {
      recommendedCommodity: 'blow_moulding',
      netWeightKg: 0.48,
      materialId: 'mat-pp',
      estimatedCycleTimeHr: 0.0044,
      estimatedSetupTimeHr: 0.167,
      estimatedOperations: [
        { name: 'EBM Blow — 2-Cavity', machineId: 'mach-vmc3', cycleTimeHr: 0.0038, labourId: 'lab-uk-semiskilled', oee: 0.88, manning: 1, labourEfficiency: 0.92 },
        { name: 'Flash Deflash & Inspect', machineId: 'mach-vmc3', cycleTimeHr: 0.0006, labourId: 'lab-uk-semiskilled', oee: 0.95, manning: 1, labourEfficiency: 0.95 },
      ],
      blowMoulding: { subtype: 'ebm', wallThicknessMm: 3.5, flashWeightKg: 0.04, cavities: 2, mouldCostGBP: 16500, mouldLife: 300000, blowTimeSec: 8, openCloseSec: 6 },
      fieldConfidences: { 'bm-weight': 0.88, 'bm-wall': 0.80, 'bm-cycle': 0.86, 'bm-cav': 0.90, 'bm-mould-cost': 0.82 },
      dfmIssues: [
        { severity: 'Medium', area: 'Port Insert Pull-Out', description: 'Steel nipple inserts in HDPE — torque resistance depends on knurl geometry.', impact: 'Field coolant leak if insert rotates under hose clamp torque.', fix: 'Specify DIN 16903 insert geometry; 100 % pull-out torque test at 50 N·m.' },
      ],
      costRange: { low: 1.85, mid: 2.65, high: 4.10, currency: 'GBP' },
      stage1Selection: { primary: 'blow_moulding', conf: 0.88, alt: [{ type: 'injection_moulding', conf: 0.08 }, { type: 'rotational_moulding', conf: 0.04 }] },
    },
    aiExplanation: 'The Mercedes GLS 580 Coolant Expansion Tank is a textbook EBM application. HDPE delivers the chemical resistance and ESCR performance required by SAE J1285 at 130 °C coolant temperature. 2-cavity EBM with in-mould port inserts achieves 8 s blow cycle; piece cost £1.85–£4.10 at 100 k ppa.',
    confidenceLevel: 'High',
    analysisLimitations: ['Wall thickness uniformity requires actual parison programming data; estimated from part geometry.'],
  },

  // ── 9. THERMOFORMING ────────────────────────────────────────────────────
  thermoforming: {
    partName: 'Lamborghini Urus Rear Cargo Liner',
    geometry: {
      boundingBoxMm: { x: 980, y: 720, z: 120 },
      estimatedVolumeCm3: 2280,
      estimatedSurfaceAreaCm2: 8640,
      estimatedWeightKg: { aluminum: 6.156, steel: 17.88, plastic: 2.48 },
    },
    detectedFeatures: [
      { type: 'Class-A Trim Surface', description: 'Textured load floor surface SPI-B3', count: 1, significance: 'High' },
      { type: 'Side Wall', description: 'Upswept cargo side walls with undercut trim', count: 2, significance: 'High' },
      { type: 'Locating Pin Hole', description: 'Vehicle body locating holes', count: 4, significance: 'Medium' },
      { type: 'Trim Edge', description: 'CNC routed perimeter trim line', count: 1, significance: 'Medium' },
    ],
    materialAnalysis: {
      fromMetadata: false,
      primarySuggestion: { materialId: 'mat-pp', name: 'ABS 2.5 mm (nearest: PP for thermoform)', confidencePct: 80, reasoning: 'Premium cargo liners use ABS 2.5 mm for UV stability, scratch resistance, and ability to accept fine SPI-B3 texture in the thermoforming tool. ABS thermoforms readily with vacuum and delivers Class-B surface suitable for carpet lamination.' },
      alternatives: [
        { materialId: 'mat-pc', name: 'PC/ABS (Higher Temp)', confidencePct: 12 },
        { materialId: 'mat-pp', name: 'PP-GF (Structural)', confidencePct: 8 },
      ],
    },
    processRecommendations: [
      { process: 'Single-Sided Vacuum Thermoforming (Primary)', commodityType: 'thermoforming', confidencePct: 86, reasoning: 'Large flat-to-moderate-curvature cargo liner is ideal for vacuum thermoforming on a twin-station machine. ABS sheet heated to 165 °C, formed to aluminium tool, CNC trimmed. 90 s total cycle including load/unload.', estimatedCycleTimeHr: 0.025 },
      { process: 'Injection Moulding (Alternative)', commodityType: 'injection_moulding', confidencePct: 10, reasoning: 'IMM gives tighter tolerance but requires 2 000T machine for this size; tool cost £380 k vs. £9.5 k thermoforming; thermoforming preferred below 80 k ppa.', estimatedCycleTimeHr: 0.020 },
    ],
    manufacturabilityScore: 85,
    manufacturabilityRisks: [
      { severity: 'Medium', feature: 'Draw Ratio at Sidewall Corners', description: 'Side wall depth 120 mm with corner radii 15 mm — draw ratio 8:1; wall thinning risk.', suggestion: 'Plug-assist forming recommended; minimum corner radius 20 mm or accept 1.5 mm wall at deepest draw.' },
      { severity: 'Low', feature: 'CNC Trim Path Accuracy', description: 'Perimeter trim tolerance ±0.8 mm for body-fit.', suggestion: '3-axis CNC router with vacuum fixture; program from CMM scan of formed part.' },
    ],
    costInputSuggestions: {
      recommendedCommodity: 'thermoforming',
      netWeightKg: 1.24,
      materialId: 'mat-pp',
      estimatedCycleTimeHr: 0.025,
      estimatedSetupTimeHr: 0.25,
      estimatedOperations: [
        { name: 'Sheet Load & Heat', machineId: 'mach-vmc3', cycleTimeHr: 0.010, labourId: 'lab-uk-semiskilled', oee: 0.88, manning: 1, labourEfficiency: 0.92 },
        { name: 'Vacuum Form', machineId: 'mach-vmc3', cycleTimeHr: 0.008, labourId: 'lab-uk-semiskilled', oee: 0.88, manning: 1, labourEfficiency: 0.92 },
        { name: 'CNC Trim', machineId: 'mach-vmc3', cycleTimeHr: 0.007, labourId: 'lab-uk-skilled', oee: 0.85, manning: 1, labourEfficiency: 0.92 },
      ],
      thermoforming: { method: 'vacuum', sheetWeightKg: 1.86, partWeightKg: 1.24, toolCostGBP: 9500, heatTimeSec: 35, formTimeSec: 18, trimTimeSec: 37 },
      fieldConfidences: { 'tf-weight': 0.84, 'tf-wall': 0.80, 'tf-cycle': 0.82, 'tf-tool-cost': 0.86 },
      dfmIssues: [
        { severity: 'Medium', area: 'Corner Wall Thinning', description: 'Draw ratio 8:1 at sidewall corners — wall drops below 1.2 mm.', impact: 'Structural weakness; visual thinning mark visible on A-surface texture.', fix: 'Plug-assist forming; increase corner radius to 20 mm min; verify with thickness gauge.' },
      ],
      costRange: { low: 4.20, mid: 5.80, high: 8.50, currency: 'GBP' },
      stage1Selection: { primary: 'thermoforming', conf: 0.86, alt: [{ type: 'injection_moulding', conf: 0.10 }, { type: 'composites', conf: 0.04 }] },
    },
    aiExplanation: 'The Lamborghini Urus Rear Cargo Liner is a large, low-curvature interior trim component perfectly suited to vacuum thermoforming. ABS 2.5 mm provides the surface quality and UV stability for premium interior. Tool cost £9.5 k and 90 s cycle make thermoforming highly economical at all volumes below 200 k ppa.',
    confidenceLevel: 'High',
    analysisLimitations: ['Sheet waste (buy-to-fly ~1.5×) included in cost range; recycled ABS trim can reduce material cost 15%.'],
  },

  // ── 10. ROTATIONAL MOULDING ──────────────────────────────────────────────
  rotational_moulding: {
    partName: 'Land Rover Defender Rear Fuel Tank 90L',
    geometry: {
      boundingBoxMm: { x: 780, y: 520, z: 380 },
      estimatedVolumeCm3: 91800,
      estimatedSurfaceAreaCm2: 12400,
      estimatedWeightKg: { aluminum: 24.8, steel: 72.0, plastic: 9.89 },
    },
    detectedFeatures: [
      { type: 'Enclosed Volume', description: '90-litre hollow fuel containment volume', count: 1, significance: 'High' },
      { type: 'Neck / Filler', description: 'Filler neck and vapour port bosses', count: 2, significance: 'High' },
      { type: 'Strap Groove', description: 'External retention strap locating grooves', count: 4, significance: 'Medium' },
      { type: 'Insert Boss', description: 'Sender unit and drain plug inserts', count: 3, significance: 'High' },
      { type: 'Anti-Slosh Baffle', description: 'Internal baffle structures', count: 2, significance: 'Medium' },
    ],
    materialAnalysis: {
      fromMetadata: false,
      primarySuggestion: { materialId: 'mat-pp', name: 'LLDPE (Crosslinked, nearest: PP)', confidencePct: 85, reasoning: 'Fuel tank regulations (ECE R34, FMVSS 301) require cross-linked LLDPE for chemical resistance to petrol, diesel, and flex-fuel blends; impact resistance at -40 °C; and multi-layer construction to meet EU 6d permeability limits.' },
      alternatives: [
        { materialId: 'mat-pa6', name: 'HDPE (standard grade)', confidencePct: 10 },
        { materialId: 'mat-pp', name: 'PP (non-fuel applications only)', confidencePct: 5 },
      ],
    },
    processRecommendations: [
      { process: 'Biaxial Rotational Moulding 3-Arm Carousel (Primary)', commodityType: 'rotational_moulding', confidencePct: 90, reasoning: 'Enclosed irregular fuel tank shape with baffles is the defining rotomoulding application. 3-arm carousel: oven arm 28 min at 320 °C → cooling arm 18 min → demould arm; insert loading for filler necks and sender boss. Cycle 28 min governed by oven time.', estimatedCycleTimeHr: 0.467 },
      { process: 'Blow Moulding (Large EBM)', commodityType: 'blow_moulding', confidencePct: 8, reasoning: 'Accumulator-head EBM viable for simpler tank geometry but poor for internal baffles; rotomoulding preferred for Defender off-road shape.', estimatedCycleTimeHr: 0.050 },
    ],
    manufacturabilityScore: 83,
    manufacturabilityRisks: [
      { severity: 'High', feature: 'Fuel Permeability Compliance', description: 'EU 6d requires <0.2 g/24h HC emission; LLDPE alone may not meet without barrier layer.', suggestion: 'Specify fluorinated post-treatment or co-rotomould with EVOH barrier layer; 100 % permeation test per ECE R34.' },
      { severity: 'Medium', feature: 'Insert Pull-Out Strength', description: 'Sender unit M52 insert in rotomoulded LLDPE — pull-out load >2 kN required.', suggestion: 'Knurled insert with weld ring; qualify pull-out at -40 °C to match cold impact spec.' },
      { severity: 'Low', feature: 'Wall Uniformity at Strap Grooves', description: 'Groove features cause sintering shadow — local thinning 10–15%.', suggestion: 'Increase groove radius; rotate cycle speed during groove fill; verify with cutting and caliper.' },
    ],
    costInputSuggestions: {
      recommendedCommodity: 'rotational_moulding',
      netWeightKg: 8.20,
      materialId: 'mat-pp',
      estimatedCycleTimeHr: 0.467,
      estimatedSetupTimeHr: 0.333,
      estimatedOperations: [
        { name: 'Oven Rotation 320 °C', machineId: 'mach-vmc3', cycleTimeHr: 0.467, labourId: 'lab-uk-semiskilled', oee: 0.85, manning: 1, labourEfficiency: 0.90 },
        { name: 'Cool & Demould', machineId: 'mach-vmc3', cycleTimeHr: 0.300, labourId: 'lab-uk-semiskilled', oee: 0.88, manning: 1, labourEfficiency: 0.92 },
        { name: 'Insert Press & Trim', machineId: 'mach-vmc3', cycleTimeHr: 0.150, labourId: 'lab-uk-skilled', oee: 0.92, manning: 1, labourEfficiency: 0.92 },
      ],
      rotationalMoulding: { numArms: 3, partsPerArm: 1, heatTimeSec: 1680, coolTimeSec: 1080, mouldCostGBP: 38000, mouldLife: 15000 },
      fieldConfidences: { 'rm-weight': 0.86, 'rm-heat-time': 0.84, 'rm-cool-time': 0.82, 'rm-mould-cost': 0.80, 'rm-arms': 0.90 },
      dfmIssues: [
        { severity: 'High', area: 'HC Permeability', description: 'LLDPE alone may not meet EU 6d <0.2 g/24h HC emission.', impact: 'Type approval failure; full recall risk if permeability test fails on production parts.', fix: 'Fluorination post-treatment OR multi-layer rotomoulding with EVOH barrier; 100 % permeation test.' },
        { severity: 'Medium', area: 'Insert Pull-Out', description: 'Sender M52 insert pull-out <2 kN at -40 °C.', impact: 'In-service fuel leak; fire hazard.', fix: 'Knurled weld ring insert; freeze-condition pull-out qualification per FMVSS 301.' },
      ],
      costRange: { low: 28, mid: 38, high: 55, currency: 'GBP' },
      stage1Selection: { primary: 'rotational_moulding', conf: 0.90, alt: [{ type: 'blow_moulding', conf: 0.08 }, { type: 'thermoforming', conf: 0.02 }] },
    },
    aiExplanation: 'The Land Rover Defender 90L Fuel Tank is a large, complex hollow component ideally suited to rotational moulding. LLDPE with fluorination delivers EU 6d HC permeability compliance. At 15 k ppa with 3-arm carousel, mould amortisation is £2.53/part; total piece cost £28–£55.',
    confidenceLevel: 'High',
    analysisLimitations: ['Multi-layer barrier rotomoulding cost not included; add £4–£8/part for EVOH barrier layer if required.'],
  },

  // ── 11. RUBBER ───────────────────────────────────────────────────────────
  rubber: {
    partName: 'Rolls-Royce Ghost Front Engine Mount Isolator',
    geometry: {
      boundingBoxMm: { x: 145, y: 145, z: 92 },
      estimatedVolumeCm3: 485,
      estimatedSurfaceAreaCm2: 1280,
      estimatedWeightKg: { aluminum: 1.31, steel: 3.80, plastic: 0.53 },
    },
    detectedFeatures: [
      { type: 'Rubber Body', description: 'NR 60A durometer main isolator body', count: 1, significance: 'High' },
      { type: 'Metal Insert', description: 'Top plate M14 threaded steel outer ring', count: 1, significance: 'High' },
      { type: 'Metal Insert', description: 'Bottom plate steel bonded base', count: 1, significance: 'High' },
      { type: 'Void', description: 'Rate-change cavity for progressive stiffness', count: 2, significance: 'High' },
      { type: 'Bond Surface', description: 'Rubber-to-metal bond interface', count: 2, significance: 'High' },
    ],
    materialAnalysis: {
      fromMetadata: false,
      primarySuggestion: { materialId: 'mat-pp', name: 'NR/SBR Blend 60 ShA (nearest: PP)', confidencePct: 80, reasoning: 'Ultra-premium engine mounts use natural rubber (NR) or NR/SBR blend for superior dynamic stiffness ratio (kt/ks <4 at 100 Hz) and excellent bond adhesion to steel inserts. 60 Shore A is the standard isolator hardness for luxury V12 powertrain isolation.' },
      alternatives: [
        { materialId: 'mat-pp', name: 'EPDM (Better Heat/Ozone)', confidencePct: 12 },
        { materialId: 'mat-pa6', name: 'Silicone (High Temp)', confidencePct: 8 },
      ],
    },
    processRecommendations: [
      { process: 'Compression Moulding 2-Cavity (Primary)', commodityType: 'rubber', confidencePct: 87, reasoning: 'Engine mount isolator with bonded metal inserts and rate-change voids is produced by compression moulding: inserts pre-primed with Chemosil, compound pre-form loaded, press closes at 180 °C × 12 min. 2-cavity tool; 85 s effective cycle + 12 min cure.', estimatedCycleTimeHr: 0.222 },
      { process: 'Transfer Moulding (Alternative)', commodityType: 'rubber', confidencePct: 10, reasoning: 'Transfer moulding allows tighter flash control but lower bonding pressure; compression preferred for thick isolator sections.', estimatedCycleTimeHr: 0.200 },
    ],
    manufacturabilityScore: 80,
    manufacturabilityRisks: [
      { severity: 'High', feature: 'Rubber-to-Metal Bond Strength', description: 'Bond adhesion must withstand 15 kN separation load per OEM spec; primer contamination or oil on inserts causes immediate bond failure.', suggestion: 'Shot-blast inserts, apply Chemosil 211 + 220 primer, bake at 80 °C; 100 % bond shear test at 15 kN.' },
      { severity: 'Medium', feature: 'Void Geometry Accuracy', description: 'Rate-change cavity dims ±0.5 mm critically affect dynamic stiffness ratio (kt/ks).', suggestion: 'Tool voids machined to ±0.1 mm; first-off dynamic characterisation at 10/100/200 Hz.' },
      { severity: 'Low', feature: 'Flash at Insert Parting', description: 'Rubber flash at metal insert parting plane — cosmetic and potential chafing.', suggestion: 'Flash trim or buffing operation; 100 % visual inspection of bond line.' },
    ],
    costInputSuggestions: {
      recommendedCommodity: 'rubber',
      netWeightKg: 0.85,
      materialId: 'mat-pp',
      estimatedCycleTimeHr: 0.222,
      estimatedSetupTimeHr: 0.167,
      estimatedOperations: [
        { name: 'Insert Prep & Prime', machineId: 'mach-vmc3', cycleTimeHr: 0.050, labourId: 'lab-uk-skilled', oee: 0.90, manning: 1, labourEfficiency: 0.92 },
        { name: 'Compression Mould 180 °C', machineId: 'mach-vmc3', cycleTimeHr: 0.222, labourId: 'lab-uk-skilled', oee: 0.85, manning: 1, labourEfficiency: 0.90 },
        { name: 'Flash Trim & Bond Check', machineId: 'mach-vmc3', cycleTimeHr: 0.030, labourId: 'lab-uk-skilled', oee: 0.92, manning: 1, labourEfficiency: 0.92 },
      ],
      rubber: { process: 'compression', flashWeightKg: 0.04, cavities: 2, cycleTimeSec: 800, mouldCostGBP: 14500, mouldLife: 80000 },
      fieldConfidences: { 'rub-weight': 0.82, 'rub-cycle': 0.80, 'rub-cav': 0.88, 'rub-mould-cost': 0.78 },
      dfmIssues: [
        { severity: 'High', area: 'Bond Primer Protocol', description: 'Metal insert surface prep and primer application are critical process variables.', impact: 'Bond failure at <5 kN → catastrophic powertrain misalignment.', fix: 'Shot-blast Ra 3–4 µm; Chemosil 211 + 220; controlled bake; no handling between prime and mould.' },
        { severity: 'Medium', area: 'Dynamic Stiffness Ratio', description: 'Rate-change void dimensions ±0.5 mm affect kt/ks ratio.', impact: 'NVH performance outside OEM specification window.', fix: 'Tool void machined ±0.1 mm; first-off dynamic characterisation; SPC on void dimensions.' },
      ],
      costRange: { low: 8.50, mid: 12.80, high: 19.50, currency: 'GBP' },
      stage1Selection: { primary: 'rubber', conf: 0.87, alt: [{ type: 'injection_moulding', conf: 0.08 }, { type: 'rubber', conf: 0.05 }] },
    },
    aiExplanation: 'The Rolls-Royce Ghost Engine Mount Isolator is a complex rubber-to-metal bonded compression moulding. NR 60A with bonded steel inserts and rate-change voids meets the dynamic isolation specification for a 6.75L V12. At 20 k ppa with 2-cavity tooling, piece cost is £8.50–£19.50 depending on bond qualification and dynamic test inclusion.',
    confidenceLevel: 'Medium',
    analysisLimitations: ['Dynamic stiffness characterisation cost (£120/part for NVH lab measurement) not included in cost range.'],
  },

  // ── 12. COMPOSITES ───────────────────────────────────────────────────────
  composites: {
    partName: 'Lamborghini Urus Active Rear Diffuser Wing',
    geometry: {
      boundingBoxMm: { x: 1420, y: 380, z: 95 },
      estimatedVolumeCm3: 2840,
      estimatedSurfaceAreaCm2: 18600,
      estimatedWeightKg: { aluminum: 7.67, steel: 22.28, plastic: 3.11 },
    },
    detectedFeatures: [
      { type: 'Aerofoil Profile', description: 'NACA 4-digit aerofoil cross-section across span', count: 1, significance: 'High' },
      { type: 'Ply Build-Up', description: 'T700 carbon fibre 10-ply quasi-isotropic layup', count: 10, significance: 'High' },
      { type: 'Actuator Mount', description: 'Aluminium insert bonded for active actuator attachment', count: 2, significance: 'High' },
      { type: 'Resin Rich Zone', description: 'Leading edge resin-rich zone for impact resistance', count: 1, significance: 'Medium' },
      { type: 'Clear Coat Surface', description: 'Gloss visible carbon weave clear coat A-surface', count: 1, significance: 'High' },
    ],
    materialAnalysis: {
      fromMetadata: false,
      primarySuggestion: { materialId: 'mat-pp', name: 'T700 CFRP (nearest: PP placeholder)', confidencePct: 88, reasoning: 'Lamborghini Urus active diffuser wing requires T700 UD/woven prepreg CFRP for stiffness-to-weight ratio (E ~70 GPa, ρ ~1.55 g/cm³), Class-A visible carbon finish, and structural bond points for active actuators.' },
      alternatives: [
        { materialId: 'mat-al6061', name: 'Al 6061-T6 (mainstream SUVs)', confidencePct: 8 },
        { materialId: 'mat-pp', name: 'SMC CFRP (Higher Volume)', confidencePct: 4 },
      ],
    },
    processRecommendations: [
      { process: 'Prepreg Autoclave (Primary)', commodityType: 'composites', confidencePct: 89, reasoning: 'Visible Class-A carbon fibre with aerofoil precision and structural actuator mounts requires prepreg autoclave cure at 125 °C × 90 min, 6 bar consolidation pressure. 10 plies T700/epoxy, quasi-isotropic [0/±45/90]s layup. Gloss tool for outer surface.', estimatedCycleTimeHr: 4.5 },
      { process: 'Resin Transfer Moulding (RTM)', commodityType: 'composites', confidencePct: 8, reasoning: 'RTM reduces cycle time to 45 min but cannot achieve Class-A surface without secondary painting; prepreg preferred for Lamborghini exposed carbon.', estimatedCycleTimeHr: 1.5 },
    ],
    manufacturabilityScore: 71,
    manufacturabilityRisks: [
      { severity: 'High', feature: 'Ply Orientation Accuracy', description: 'Quasi-isotropic layup tolerates ±2° fibre angle; misalignment reduces stiffness 12%.', suggestion: 'Use laser projection layup aid; automated fibre placement (AFP) for critical UD plies; first-article cross-section inspection.' },
      { severity: 'High', feature: 'Actuator Insert Bond', description: 'Al insert bonded into CFRP with dissimilar CTE — fatigue cracking at 10 k cycles risk.', suggestion: 'Titanium or CFRP inserts preferred; if Al used, co-cure with adhesive film; validate with fatigue test 10 M cycles ±2 kN.' },
      { severity: 'Medium', feature: 'Void Content', description: 'Void content >2 % in aerofoil section reduces fatigue life 30%.', suggestion: 'Autoclave 6 bar + 125 °C cure; void content <1 % verified by C-scan; reject criterion >2 %.' },
    ],
    costInputSuggestions: {
      recommendedCommodity: 'composites',
      netWeightKg: 1.62,
      materialId: 'mat-pp',
      estimatedCycleTimeHr: 4.5,
      estimatedSetupTimeHr: 1.0,
      estimatedOperations: [
        { name: 'Prepreg Cut & Layup (10 plies)', machineId: 'mach-vmc3', cycleTimeHr: 1.50, labourId: 'lab-uk-skilled', oee: 0.85, manning: 2, labourEfficiency: 0.88 },
        { name: 'Autoclave Cure 125 °C × 90 min', machineId: 'mach-vmc3', cycleTimeHr: 2.50, labourId: 'lab-uk-skilled', oee: 0.80, manning: 1, labourEfficiency: 0.90 },
        { name: 'C-Scan Inspection', machineId: 'mach-vmc3', cycleTimeHr: 0.33, labourId: 'lab-uk-skilled', oee: 0.90, manning: 1, labourEfficiency: 0.92 },
        { name: 'CNC Trim & Bond Insert', machineId: 'mach-5ax', cycleTimeHr: 0.50, labourId: 'lab-uk-skilled', oee: 0.85, manning: 1, labourEfficiency: 0.90 },
      ],
      composites: { process: 'prepreg_autoclave', fibreFraction: 0.58, wasteFraction: 0.22, areaCm2: 18600, plies: 10, toolCostGBP: 42000, toolLife: 3000, cureTimeSec: 5400 },
      fieldConfidences: { 'comp-weight': 0.86, 'comp-plies': 0.88, 'comp-area': 0.84, 'comp-tool-cost': 0.80, 'comp-cycle': 0.82 },
      dfmIssues: [
        { severity: 'High', area: 'Actuator Insert CTE Mismatch', description: 'Al inserts in CFRP: CTE_Al 23 µm/m°C vs CFRP 2 µm/m°C.', impact: 'Bond fatigue cracking at 10 k thermal cycles (Lamborghini target 50 k).', fix: 'Switch to Ti inserts (CTE 8.6) or CFRP inserts; co-cure with Redux 319A film.' },
        { severity: 'High', area: 'Ply Angle Tolerance', description: 'Manual layup ±5° vs. AFP ±1° — stiffness reduction 12% at 5° misalignment.', impact: 'Wing camber deviation under aero load; active spoiler position error.', fix: 'AFP for UD plies; laser projection for woven plies; first-article CT scan layup verification.' },
      ],
      costRange: { low: 145, mid: 220, high: 380, currency: 'GBP' },
      stage1Selection: { primary: 'composites', conf: 0.89, alt: [{ type: 'sheet_metal', conf: 0.07 }, { type: 'injection_moulding', conf: 0.04 }] },
    },
    aiExplanation: 'The Lamborghini Urus Active Rear Diffuser Wing is a structurally demanding aerofoil-section CFRP component. T700 prepreg autoclave delivers Class-A visible carbon finish with stiffness-to-weight ratio unmatched by aluminium. At 5 k ppa, tooling amortisation is £8.40/part; total piece cost £145–£380 depending on inspection and insert specification.',
    confidenceLevel: 'High',
    analysisLimitations: ['AFP (automated fibre placement) machine time not separated from manual layup; premium for AFP applies from ~2 k ppa.'],
  },

  // ── 13. WIRING HARNESS ──────────────────────────────────────────────────
  wiring_harness: {
    partName: 'Bentley Bentayga Full Body Main Wiring Harness',
    geometry: {
      boundingBoxMm: { x: 1800, y: 400, z: 120 },
      estimatedVolumeCm3: 18200,
      estimatedSurfaceAreaCm2: 28400,
      estimatedWeightKg: { aluminum: 4.91, steel: 14.27, plastic: 1.99 },
    },
    detectedFeatures: [
      { type: 'Circuit', description: 'Independent circuits — mixed signal and power', count: 58, significance: 'High' },
      { type: 'Connector', description: 'Multi-pin connectors (Delphi/TE) — various sizes', count: 22, significance: 'High' },
      { type: 'Branch', description: 'Harness branches to zones: powertrain / dash / rear / roof', count: 8, significance: 'High' },
      { type: 'Splice', description: 'Crimp splice joints in harness body', count: 34, significance: 'Medium' },
      { type: 'Grommet', description: 'Bulkhead grommets for firewall/panel pass-through', count: 6, significance: 'Medium' },
      { type: 'Tape Wrap', description: 'PVC tape and corrugated conduit protection', count: 1, significance: 'Low' },
    ],
    materialAnalysis: {
      fromMetadata: false,
      primarySuggestion: { materialId: 'mat-pp', name: 'GXL/SXL Automotive Wire, FR-PVC insulation', confidencePct: 82, reasoning: 'Bentley full-body harness uses OEM GXL/SXL wire to SAE J1128 — FR-PVC insulation to LV 112 automotive standard; copper conductors from 0.35 mm² (signal) to 25 mm² (power/earth). Connectors to Delphi GT 150 / TE Econoseal specification.' },
      alternatives: [
        { materialId: 'mat-pp', name: 'Aluminium wiring (weight reduction)', confidencePct: 10 },
        { materialId: 'mat-pp', name: 'Cross-linked PE insulation (XLPE)', confidencePct: 8 },
      ],
    },
    processRecommendations: [
      { process: 'Manual Assembly Gr.2 + Semi-Auto Crimp (Primary)', commodityType: 'wiring_harness', confidencePct: 86, reasoning: 'Bentley volumes (5–8 k ppa) do not justify full automation. Assembly board (formboard) with 18 operators; semi-automatic crimp applicators (Komax α series) for all terminations; HiPot test 500 V + continuity scan 100 %.', estimatedCycleTimeHr: 3.20 },
      { process: 'Komax Full-Auto Wire Processing (Partial)', commodityType: 'wiring_harness', confidencePct: 11, reasoning: 'Wire cut-strip-crimp automated (Komax Sigma series) for the 35 highest-volume circuits; remaining 23 manual; reduces direct labour by 22%.', estimatedCycleTimeHr: 2.80 },
    ],
    manufacturabilityScore: 77,
    manufacturabilityRisks: [
      { severity: 'High', feature: 'Splice Crimp Quality', description: '34 crimp splices — single bad crimp can cause intermittent fault; voltage drop risk.', suggestion: 'Specify Komax crimping with 100 % pull-test (≥70 N for 0.5 mm²); SPC on crimp height.' },
      { severity: 'Medium', feature: 'Connector Mating Force', description: '22 connectors — incorrect mating (half-latched) is top warranty cause for harnesses.', suggestion: 'Poka-yoke formboard with presence sensors; 100 % connector lock audit in test rig.' },
      { severity: 'Medium', feature: 'Routing Complexity — 8 Branches', description: 'Complex branching harness; incorrect branch routing in assembly common defect.', suggestion: 'Colour-coded branch sleeves; assembly formboard with branch routing pins; video training for new operators.' },
    ],
    costInputSuggestions: {
      recommendedCommodity: 'wiring_harness',
      netWeightKg: 4.80,
      materialId: 'mat-pp',
      estimatedCycleTimeHr: 3.20,
      estimatedSetupTimeHr: 0.50,
      estimatedOperations: [
        { name: 'Wire Cut-Strip-Crimp (Komax)', machineId: 'mach-vmc3', cycleTimeHr: 0.80, labourId: 'lab-uk-skilled', oee: 0.88, manning: 2, labourEfficiency: 0.90 },
        { name: 'Board Assembly & Branching', machineId: 'mach-vmc3', cycleTimeHr: 1.40, labourId: 'lab-uk-skilled', oee: 0.85, manning: 8, labourEfficiency: 0.88 },
        { name: 'Connector Insertion & Latch', machineId: 'mach-vmc3', cycleTimeHr: 0.60, labourId: 'lab-uk-skilled', oee: 0.88, manning: 4, labourEfficiency: 0.90 },
        { name: 'HiPot + Continuity Test', machineId: 'mach-vmc3', cycleTimeHr: 0.25, labourId: 'lab-uk-skilled', oee: 0.92, manning: 1, labourEfficiency: 0.95 },
        { name: 'Tape, Conduit & Final Wrap', machineId: 'mach-vmc3', cycleTimeHr: 0.15, labourId: 'lab-uk-semiskilled', oee: 0.90, manning: 3, labourEfficiency: 0.90 },
      ],
      fieldConfidences: { 'wh-circuits': 0.85, 'wh-connectors': 0.88, 'wh-weight': 0.82, 'wh-labour': 0.80 },
      dfmIssues: [
        { severity: 'High', area: 'Crimp Splice Reliability', description: '34 crimp splices — each is a potential open-circuit defect point.', impact: 'Intermittent electrical fault; field diagnosis cost >£350; warranty recall risk.', fix: '100 % pull test ≥70 N; SPC crimp height Cpk >1.67; automated vision of crimp barrel.' },
        { severity: 'Medium', area: 'Half-Latched Connectors', description: '22 connectors — top harness warranty defect mode.', impact: 'Field disconnect; electrical system failure; customer satisfaction impact for Bentley.', fix: 'Formboard connector presence sensor; mating force >40 N verified in test rig; 100 % lock audit.' },
      ],
      costRange: { low: 185, mid: 265, high: 380, currency: 'GBP' },
      stage1Selection: { primary: 'wiring_harness', conf: 0.86, alt: [{ type: 'biw_assembly', conf: 0.08 }, { type: 'machining', conf: 0.06 }] },
    },
    aiExplanation: 'The Bentley Bentayga Full Body Main Harness is a complex 58-circuit, 22-connector harness assembled on a formboard with semi-automated crimping. At 6 k ppa, the primary cost driver is direct labour (18 operators × 3.2 hr). Cost range £185–£380 reflecting wire material, connector grade, and testing specification differences.',
    confidenceLevel: 'Medium',
    analysisLimitations: ['Circuit count estimated from bounding box and SUV class; actual circuit count from vehicle electrical architecture.'],
  },

  // ── 14. EXTRUSION ────────────────────────────────────────────────────────
  extrusion: {
    partName: 'Range Rover Vogue EPDM Full Door Seal (Co-Extruded)',
    geometry: {
      boundingBoxMm: { x: 4400, y: 28, z: 24 },
      estimatedVolumeCm3: 1140,
      estimatedSurfaceAreaCm2: 7040,
      estimatedWeightKg: { aluminum: 3.08, steel: 8.95, plastic: 1.25 },
    },
    detectedFeatures: [
      { type: 'Co-Extrusion Profile', description: 'Sponge (40 Shore A) + dense (70 Shore A) EPDM co-extrusion', count: 1, significance: 'High' },
      { type: 'Embedded Carrier', description: 'Steel/Al wire carrier for retention in door frame', count: 1, significance: 'High' },
      { type: 'Lip Seal', description: 'Flexible wiping lip for glass seal', count: 2, significance: 'High' },
      { type: 'Corner Moulding', description: 'Injection-moulded corner joints', count: 4, significance: 'Medium' },
    ],
    materialAnalysis: {
      fromMetadata: false,
      primarySuggestion: { materialId: 'mat-pp', name: 'EPDM (Ethylene Propylene Diene Monomer)', confidencePct: 90, reasoning: 'Automotive door seals universally specify EPDM for its ozone resistance, UV stability (-40 °C to +120 °C), low compression set, and acoustic sealing performance. Co-extruded sponge/dense profile is standard JLR specification.' },
      alternatives: [
        { materialId: 'mat-pp', name: 'TPV (Santoprene) — Recyclable', confidencePct: 7 },
        { materialId: 'mat-pp', name: 'Silicone (High Temp)', confidencePct: 3 },
      ],
    },
    processRecommendations: [
      { process: 'Co-Extrusion 75 mm Line + CV Cure (Primary)', commodityType: 'extrusion', confidencePct: 92, reasoning: 'EPDM co-extrusion on a dual 75/35 mm extruder with steel carrier wire feed, continuous vulcanisation (CV) salt bath or microwave at 200 °C. 4.4 m door seal cut-to-length at line speed 8 m/min. Corner moulding joined offline.', estimatedCycleTimeHr: 0.0092 },
      { process: 'Injection Moulding (Full-Perimeter)', commodityType: 'rubber', confidencePct: 6, reasoning: 'Transfer moulded full-perimeter seal — no joining but very long tool and cycle >8 min; only viable for <1 000 ppa.', estimatedCycleTimeHr: 0.133 },
    ],
    manufacturabilityScore: 90,
    manufacturabilityRisks: [
      { severity: 'Medium', feature: 'Corner Joint Adhesion', description: 'Extruded EPDM joined to injection-moulded corners by vulcanisation bonding — joint peel strength must exceed 4 N/mm.', suggestion: 'Hot-press bonding at 180 °C × 45 s; 100 % peel test at 50 mm/min; store joints ≤72 h before assembly.' },
      { severity: 'Low', feature: 'Compression Set After Aging', description: 'EPDM compression set <30 % after 168 h at 70 °C (ISO 815) — critical for sealing retention.', suggestion: 'Specify low-CS formulation; cure state validation; QC compression set every 1 000 m production.' },
    ],
    costInputSuggestions: {
      recommendedCommodity: 'extrusion',
      netWeightKg: 0.38,
      materialId: 'mat-pp',
      estimatedCycleTimeHr: 0.0092,
      estimatedSetupTimeHr: 0.083,
      estimatedOperations: [
        { name: 'Co-Extrusion + CV Cure', machineId: 'mach-vmc3', cycleTimeHr: 0.0083, labourId: 'lab-uk-skilled', oee: 0.90, manning: 2, labourEfficiency: 0.92 },
        { name: 'Cut-to-Length & Corner Join', machineId: 'mach-vmc3', cycleTimeHr: 0.0009, labourId: 'lab-uk-semiskilled', oee: 0.92, manning: 1, labourEfficiency: 0.92 },
      ],
      fieldConfidences: { 'ext-weight': 0.88, 'ext-cycle': 0.90, 'ext-profile': 0.86 },
      dfmIssues: [
        { severity: 'Medium', area: 'Corner Joint Peel', description: 'Extruded-to-moulded corner joint peel <4 N/mm = water ingress leak.', impact: 'Water ingress; wind noise; customer complaint rate >8 % for JLR without controlled bonding.', fix: 'Hot-press bond 180 °C × 45 s; 100 % peel test; shelf-life control <72 h.' },
      ],
      costRange: { low: 2.10, mid: 3.20, high: 4.80, currency: 'GBP' },
      stage1Selection: { primary: 'extrusion', conf: 0.92, alt: [{ type: 'rubber', conf: 0.06 }, { type: 'injection_moulding', conf: 0.02 }] },
    },
    aiExplanation: 'The Range Rover Vogue EPDM Door Seal is a 4.4 m co-extruded sponge/dense EPDM profile with embedded carrier wire and injection-moulded corners. Co-extrusion is the only economical process at automotive volumes; 8 m/min line speed gives high throughput. Piece cost £2.10–£4.80 including corner moulding and CV cure.',
    confidenceLevel: 'High',
    analysisLimitations: ['Corner moulding tooling (£4 800 × 4 corners = £19 200) amortised over lifetime volume; not shown separately in cost range.'],
  },

  // ── 15. BIW ASSEMBLY ────────────────────────────────────────────────────
  biw_assembly: {
    partName: 'Mercedes GLS 580 Front Door Inner Frame Assembly',
    geometry: {
      boundingBoxMm: { x: 1150, y: 820, z: 85 },
      estimatedVolumeCm3: 12400,
      estimatedSurfaceAreaCm2: 22800,
      estimatedWeightKg: { aluminum: 33.5, steel: 97.2, plastic: 13.6 },
    },
    detectedFeatures: [
      { type: 'Spot Weld', description: 'Resistance spot welds across sub-assembly', count: 38, significance: 'High' },
      { type: 'MIG Weld', description: 'MIG welds at structural joints and reinforcements', count: 4, significance: 'High' },
      { type: 'Sub-Part', description: 'Stamped sub-parts joined in sequence', count: 5, significance: 'High' },
      { type: 'Datum Hole', description: 'CMM datum reference holes for body-in-white fit', count: 4, significance: 'High' },
      { type: 'Hem Flange', description: 'Inner-outer panel hem at perimeter', count: 1, significance: 'Medium' },
    ],
    materialAnalysis: {
      fromMetadata: false,
      primarySuggestion: { materialId: 'mat-dc01', name: 'DP600/DC04 Steel Stampings', confidencePct: 86, reasoning: 'Front door inner frame uses DP600 AHSS for intrusion beam and B-pillar sections; DC04 for latch reinforcement and perimeter. Steel BIW construction is standard for W167 (GLS-class) door structures.' },
      alternatives: [
        { materialId: 'mat-al5052', name: 'Full Aluminium (EV platform)', confidencePct: 10 },
        { materialId: 'mat-hss', name: 'HSS 780 MPa (Ultra-lightweight)', confidencePct: 4 },
      ],
    },
    processRecommendations: [
      { process: '5-Station BIW Weld Cell + Fixture (Primary)', commodityType: 'biw_assembly', confidencePct: 87, reasoning: 'Front door inner frame assembled in 5-station dedicated BIW weld cell: station 1 tack, S2 main SW (26 welds), S3 reinforcement fit + SW (12 welds), S4 MIG structural joints, S5 CMM measure + hem. Dedicated weld fixtures per station.', estimatedCycleTimeHr: 0.0083 },
      { process: 'Flexible Robot Cell (Lower Volume)', commodityType: 'biw_assembly', confidencePct: 10, reasoning: 'Flex cell with KUKA robots allows multiple body variants but 25 % lower throughput; preferred only if <3 body variants.', estimatedCycleTimeHr: 0.0100 },
    ],
    manufacturabilityScore: 81,
    manufacturabilityRisks: [
      { severity: 'High', feature: 'Spot Weld Nugget Size 38 SW', description: 'All 38 spot welds must meet 6.0 mm nugget diameter (AWS D8.1M); insufficient heat input on DP600 is common defect.', suggestion: 'Increase weld current 8% vs. mild steel; weld timer adaptive control; peel test 5 % sampling each batch.' },
      { severity: 'Medium', feature: 'CMM Datum Hole Position ±0.2 mm', description: 'BIW datum holes control door-gap consistency; stamping variation accumulates.', suggestion: 'Pin-locate both datum holes in all 5 fixture stations; CMM 100 % at station 5; SPC on datum hole positions.' },
      { severity: 'Low', feature: 'MIG Weld Spatter in Sub-Assembly Nest', description: 'MIG spatter on inner surface — interference with trim clip locations.', suggestion: 'Anti-spatter coating on fixture locators; post-weld spatter brush at S4 exit.' },
    ],
    costInputSuggestions: {
      recommendedCommodity: 'biw_assembly',
      netWeightKg: 14.20,
      materialId: 'mat-dc01',
      estimatedCycleTimeHr: 0.0083,
      estimatedSetupTimeHr: 0.25,
      estimatedOperations: [
        { name: 'S1 — Tack & Load', machineId: 'mach-vmc3', cycleTimeHr: 0.0014, labourId: 'lab-uk-skilled', oee: 0.88, manning: 2, labourEfficiency: 0.90 },
        { name: 'S2 — Main Spot Weld (26 SW)', machineId: 'mach-vmc3', cycleTimeHr: 0.0022, labourId: 'lab-uk-skilled', oee: 0.85, manning: 2, labourEfficiency: 0.90 },
        { name: 'S3 — Reinforcement SW (12 SW)', machineId: 'mach-vmc3', cycleTimeHr: 0.0018, labourId: 'lab-uk-skilled', oee: 0.85, manning: 2, labourEfficiency: 0.90 },
        { name: 'S4 — MIG Structural Joints', machineId: 'mach-vmc3', cycleTimeHr: 0.0015, labourId: 'lab-uk-skilled', oee: 0.88, manning: 1, labourEfficiency: 0.90 },
        { name: 'S5 — CMM + Hem Flange', machineId: 'mach-vmc3', cycleTimeHr: 0.0014, labourId: 'lab-uk-skilled', oee: 0.90, manning: 1, labourEfficiency: 0.92 },
      ],
      fieldConfidences: { 'biw-weight': 0.84, 'biw-sw-count': 0.88, 'biw-stations': 0.86, 'biw-cycle': 0.82 },
      dfmIssues: [
        { severity: 'High', area: 'DP600 Spot Weld Nugget', description: '38 SW on DP600 — nugget formation requires 8% higher current vs. mild steel.', impact: 'Undersized nuggets cause delamination in crash test; NCAP rating risk.', fix: 'Adaptive weld timer; 5 % peel test; AWS D8.1M nugget spec 6.0 mm min.' },
        { severity: 'Medium', area: 'CMM Datum Position', description: 'BIW datum hole ±0.2 mm controls door gap in vehicle.', impact: 'Door gap >3.5 mm; panel gap mismatch; luxury brand image impact.', fix: 'Pin-locate all 5 stations; 100 % CMM at S5; SPC Cpk >1.67 on datum holes.' },
      ],
      costRange: { low: 62, mid: 92, high: 138, currency: 'GBP' },
      stage1Selection: { primary: 'biw_assembly', conf: 0.87, alt: [{ type: 'sheet_metal_fab', conf: 0.09 }, { type: 'sheet_metal', conf: 0.04 }] },
    },
    aiExplanation: 'The Mercedes GLS 580 Front Door Inner Frame is a 5-station BIW weld cell assembly of 5 DP600/DC04 stampings, 38 spot welds, and 4 MIG joints. At 80 k ppa, fixture amortisation is £1.85/part; assembly labour (9 operators across 5 stations) is the dominant cost at £28/part. Total piece cost £62–£138.',
    confidenceLevel: 'High',
    analysisLimitations: ['Sub-component stamping cost (£148 total) not included in assembly cost range; represents incoming material cost.'],
  },

  // ── 16. PAINTING ────────────────────────────────────────────────────────
  painting: {
    partName: 'Bentley Bentayga Exterior Body Paint — 4-Stage System',
    geometry: {
      boundingBoxMm: { x: 5200, y: 2060, z: 1760 },
      estimatedVolumeCm3: 4820000,
      estimatedSurfaceAreaCm2: 112000,
      estimatedWeightKg: { aluminum: 0, steel: 0, plastic: 0 },
    },
    detectedFeatures: [
      { type: 'Paint Zone', description: 'Exterior Class-A body panels — 11.2 m² paintable area', count: 1, significance: 'High' },
      { type: 'E-Coat Layer', description: 'Cathodic electrophoretic primer (e-coat) full immersion', count: 1, significance: 'High' },
      { type: 'Primer Layer', description: 'High-build spray primer 35 µm dry', count: 1, significance: 'High' },
      { type: 'Basecoat Layer', description: 'Aquabase metallic/pearl basecoat 15 µm', count: 1, significance: 'High' },
      { type: 'Clearcoat Layer', description: 'High-gloss 2K clearcoat 50 µm — polished to DOI >92', count: 1, significance: 'High' },
      { type: 'Masking Zone', description: 'Rubber seal, glass, and chrome masking areas', count: 1, significance: 'Medium' },
    ],
    materialAnalysis: {
      fromMetadata: false,
      primarySuggestion: { materialId: 'mat-dc01', name: 'Steel Body (painting process — substrate)', confidencePct: 78, reasoning: 'Bentley Bentayga body-in-white is mixed aluminium/steel; painting process applies to all exterior panels. 4-stage paint system (e-coat → primer → aquabase → clearcoat) meets Bentley lifetime corrosion warranty (12 years) and DOI (distinctness of image) target >92.' },
      alternatives: [
        { materialId: 'mat-al5052', name: 'Full Aluminium BIW (requires chromate pre-treatment)', confidencePct: 15 },
        { materialId: 'mat-pp', name: 'Plastic bumper (different paint line)', confidencePct: 7 },
      ],
    },
    processRecommendations: [
      { process: '4-Stage Aquabase Paint Line (Primary)', commodityType: 'painting', confidencePct: 88, reasoning: 'Bentley Crewe paint shop: e-coat full immersion → sealer robot apply → high-build primer spray → aquabase colour robot → 2K clearcoat robot → cure oven 60 °C × 30 min (waterborne) + 140 °C × 25 min (clearcoat). Final hand-polish to DOI >92. 11.2 m² body area.', estimatedCycleTimeHr: 3.5 },
      { process: '3-Stage (Skip Primer)', commodityType: 'painting', confidencePct: 9, reasoning: 'Mainstream OEM 3-stage skips high-build primer; lower film build and DOI — not acceptable for Bentley ultra-premium specification.', estimatedCycleTimeHr: 2.8 },
    ],
    manufacturabilityScore: 85,
    manufacturabilityRisks: [
      { severity: 'High', feature: 'DOI (Distinctness of Image) Target >92', description: 'Bentley 20 ft inspection standard requires DOI >92 — highest in automotive. Requires hand-polish after clearcoat cure.', suggestion: 'Robot clearcoat application with electrostatic bell applicator; bake 140 °C × 25 min; hand-cut and polish with 3M Trizact + DA polisher; 100 % DOI measurement with BYK-mac.' },
      { severity: 'Medium', feature: 'E-Coat Coverage in Cavities', description: 'Body cavities (rocker inner, A-pillar box) require >20 µm e-coat for corrosion warranty.', suggestion: 'Confirm minimum tank immersion time 4 min at 30 V; cavity wax injection to all enclosed sections post e-coat.' },
      { severity: 'Low', feature: 'Aquabase Colour Metameric Match', description: 'Metallic/pearl colours show metameric mismatch between panels at dawn/dusk lighting.', suggestion: 'Spray all body panels in single robot pass from same mixed batch; colour measurement CIE ΔE <0.5 between panels.' },
    ],
    costInputSuggestions: {
      recommendedCommodity: 'painting',
      netWeightKg: 0,
      materialId: 'mat-dc01',
      estimatedCycleTimeHr: 3.5,
      estimatedSetupTimeHr: 0.25,
      estimatedOperations: [
        { name: 'E-Coat Immersion + Cure', machineId: 'mach-vmc3', cycleTimeHr: 0.50, labourId: 'lab-uk-skilled', oee: 0.90, manning: 2, labourEfficiency: 0.92 },
        { name: 'Primer Robot Apply + Bake', machineId: 'mach-vmc3', cycleTimeHr: 0.60, labourId: 'lab-uk-skilled', oee: 0.88, manning: 2, labourEfficiency: 0.90 },
        { name: 'Aquabase Colour Robot', machineId: 'mach-vmc3', cycleTimeHr: 0.45, labourId: 'lab-uk-skilled', oee: 0.88, manning: 2, labourEfficiency: 0.90 },
        { name: '2K Clearcoat Robot + Cure', machineId: 'mach-vmc3', cycleTimeHr: 0.75, labourId: 'lab-uk-skilled', oee: 0.88, manning: 2, labourEfficiency: 0.90 },
        { name: 'Hand Cut & Polish + DOI Check', machineId: 'mach-vmc3', cycleTimeHr: 1.20, labourId: 'lab-uk-skilled', oee: 0.92, manning: 4, labourEfficiency: 0.88 },
      ],
      fieldConfidences: { 'paint-area': 0.85, 'paint-stages': 0.90, 'paint-cycle': 0.80, 'paint-doi': 0.88 },
      dfmIssues: [
        { severity: 'High', area: 'DOI Achievement', description: 'DOI >92 requires 4-stage system + hand-polish. Skipping any stage drops DOI to <80.', impact: 'Bentley quality gate reject; rework cost >£380/vehicle; customer perception impact.', fix: 'Mandatory 4-stage process; electrostatic bell applicator for clearcoat; 100 % BYK-mac DOI measurement.' },
        { severity: 'Medium', area: 'Cavity Corrosion', description: 'Enclosed body cavities require 20 µm e-coat + cavity wax for 12-year corrosion warranty.', impact: 'Perforation corrosion in <8 years; warranty replacement body panels >£12 k.', fix: 'Minimum 4 min at 30 V e-coat; post-body cavity wax injection all enclosed sections; salt-spray qualification 1 000 h.' },
      ],
      costRange: { low: 285, mid: 385, high: 520, currency: 'GBP' },
      stage1Selection: { primary: 'painting', conf: 0.88, alt: [{ type: 'composites', conf: 0.08 }, { type: 'injection_moulding', conf: 0.04 }] },
    },
    aiExplanation: 'The Bentley Bentayga 4-stage exterior paint system covers 11.2 m² of Class-A body area. E-coat + primer + aquabase + 2K clearcoat with hand-polish to DOI >92 represents the highest paint specification in automotive production. At 6 k ppa, paint shop amortisation is £48/vehicle; hand-polish labour (4 operators × 1.2 hr) is £38; total cost £285–£520 per vehicle depending on colour complexity.',
    confidenceLevel: 'High',
    analysisLimitations: ['Colour-change flush cost (£12–£80 depending on colour contrast) not included; premium solid colours at low end, special-effect metallics at high end.'],
  },

};
