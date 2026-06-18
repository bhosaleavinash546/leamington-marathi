import { ConfidenceLevel } from '../types';

export interface HvacLever {
  action: string;
  saving: string;
  conf: ConfidenceLevel;
  bench: string;
  note?: string;
}

export interface HvacComponent {
  id: string;
  name: string;
  levers: HvacLever[];
}

export interface HvacTrend {
  id: string;
  title: string;
  description: string;
  status: 'Mainstream' | 'Emerging' | 'Next-Gen';
  impact: string;
}

export const HVAC_COMPONENTS: HvacComponent[] = [
  {
    id: 'hvac-core',
    name: 'HVAC Core Unit',
    levers: [
      { action: 'Single-zone HVAC housing platform serving dual-zone via add-on rear duct module', saving: '€280-500K tooling saving vs dedicated dual-zone housing, 2 SKUs → 1', conf: 'verified', bench: 'Valeo ThermoSystem — shared housing architecture across Renault/Nissan platforms' },
      { action: 'BLDC brushless blower motor replace brushed motor — delete EMC filter, lower warranty', saving: '€4-8 part saving; warranty cost -40% on HVAC complaints', conf: 'verified', bench: 'Standard from 2021: Valeo, MAHLE, Denso BLDC blower' },
      { action: 'Delete heater core on BEV (PTC electric heater replaces coolant loop)', saving: '€22-38 heater core + hoses saving; simplifies thermal loop', conf: 'verified', bench: 'Tesla Model 3/Y, VW ID.3 — no coolant heater core on BEV' },
      { action: 'Microfilter reduce to single-layer ePTFE on lower-pollutant markets (delete activated carbon layer)', saving: '€4-9/filter on markets where VOC is non-issue (certain APAC markets)', conf: 'estimated', bench: 'Mann+Hummel FreciousPlus — market-specific filter spec' },
      { action: 'Common flap actuator stepper motor across all zones (single part number)', saving: '8-14 actuator SKUs → 3; €3-6 unit cost reduction via volume', conf: 'benchmarked', bench: 'Bosch/Hella standardised actuator family — proven on MQB platform' },
    ],
  },
  {
    id: 'refrigerant-circuit',
    name: 'Refrigerant Circuit & Heat Pump',
    levers: [
      { action: 'Electric scroll compressor BEV — right-size displacement to heat pump mode (not just cooling)', saving: '15-20% compressor displacement reduction enables 8-12% cost saving', conf: 'benchmarked', bench: 'MAHLE/Sanden ECS compressor right-sizing — Tesla heat pump 2021' },
      { action: 'R1234yf EXV (electronic expansion valve) vs TXV on BEV: enables heat pump reversal', saving: '€8-15 premium vs TXV but enables heat pump COP 2.5-3.5 (vs 1.0 PTC)', conf: 'verified', bench: 'BMW iX, Audi Q4 e-tron, Hyundai Ioniq 5 — EXV standard on BEV' },
      { action: 'Delete refrigerant receiver-dryer on R1234yf systems with internal dryer in condenser', saving: '€12-18 component saving + 1 brazed joint delete', conf: 'estimated', bench: 'Delphi/APTIV condenser with integrated dryer — Ford Mach-E' },
      { action: 'Multi-port extrusion (MPE) condenser vs tube-and-fin — 15% smaller, same capacity', saving: '8-12% condenser cost at equal thermal performance', conf: 'verified', bench: 'All modern OEM — MPE condenser standard since 2015+' },
      { action: 'Brazed plate chiller (refrigerant-to-coolant) integrated into valve block — delete external chiller unit', saving: '€35-55/unit parts saving + packaging benefit', conf: 'estimated', bench: 'Denso integrated chiller valve block — Toyota BEV thermal module' },
    ],
  },
  {
    id: 'battery-thermal',
    name: 'Battery Thermal Management',
    levers: [
      { action: 'TIM thickness reduction to ≤0.3mm via flatness tolerancing improvement on cells', saving: '15-20% TIM material cost — thermal resistance also improves', conf: 'benchmarked', bench: 'Henkel Bergquist — controlled flatness enables <0.3mm TIM' },
      { action: 'Single-fluid (ATF) cooling loop for motor + battery — delete separate glycol circuit', saving: '20-30% thermal system cost (Ford F-150 Lightning proven)', conf: 'verified', bench: 'Ford Lightning — shared oil loop motor/gearbox/battery' },
      { action: 'Direct refrigerant cooling (DRC) of battery — delete glycol chiller stage', saving: '€55-80/vehicle by removing chiller HX and coolant circuit', conf: 'verified', bench: 'BMW i4 M50, Porsche Taycan Turbo — DRC standard on performance BEV' },
      { action: 'Phase-change thermal interface material (PCTIM) on PHEV — delete cooling circuit on low-use cycle', saving: 'PHEV battery cooling circuit delete potential (30 min drive duty)', conf: 'theoretical', bench: 'Phase-change wax PCM TIM — research at NXP/Henkel' },
      { action: 'Ribbon-fin Al extrusion cooling plate: 20-30% thermal component cost vs complex brazed serpentine plate', saving: '€18-35/plate vs brazed plate at same heat flux', conf: 'benchmarked', bench: 'Thermal Engineering Associates — ribbon-fin for volume BEV' },
    ],
  },
];

export const HVAC_MFG_LEVERS = [
  { id: 'heat-pump-integration', name: 'Heat Pump System Integration', description: 'Combine A/C compressor, chiller, and heat exchanger into a single thermal module (Octovalve-type) reducing packaging and assembly time.', saving: '15-20% assembly time on BEV thermal line', status: 'Mainstream' as const },
  { id: 'aluminium-hvac-housing', name: 'Al HVAC Housing Elements', description: 'Replace selected PP housing components with thin-wall Al extrusion for under-hood routing where temperature resistance is critical.', saving: '5-8% NRE via corrosion-resistance improvement', status: 'Emerging' as const },
  { id: 'refrigerant-line-simplification', name: 'Pre-Charged A/C Module', description: 'Pre-charged refrigerant circuit supplied as module — eliminates vehicle-level charging line on final assembly.', saving: '€12-20 assembly and tooling cost per vehicle', status: 'Emerging' as const },
];

export const HVAC_TRENDS: HvacTrend[] = [
  { id: 'heat-pump-bev', title: 'Heat Pump Becoming BEV Standard', description: 'By 2025, >80% of BEV programmes include heat pump — reversal mode COP 2.5-3.5 vs PTC COP 1.0. Range benefit at -10°C: +20-30km. EXV enables seamless mode switching.', status: 'Mainstream', impact: 'Heat pump adds €180-280 but justified by range impact and EU climate neutrality targets.' },
  { id: 'r1234yf-transition', title: 'R1234yf Universal Adoption', description: 'R1234yf (GWP=4) now universal on all new EU programmes. R744 (CO2) heat pump gaining on premium BEV for sub-freezing performance advantage.', status: 'Mainstream', impact: 'R744 offers COP advantage at -20°C but adds €120-200 compressor premium vs R1234yf.' },
  { id: 'thermal-module', title: 'Thermal Module Consolidation', description: 'Multi-function thermal management unit (coolant valve, chiller, heat pump valve) in single casting: BMW eDrive thermal module, Tesla Octovalve. Reduces thermal circuit complexity by 40%.', status: 'Emerging', impact: '6-8 thermal circuit components → 1 module. Tesla Octovalve reduces piping connections by 60%.' },
  { id: 'active-grille', title: 'Active Grille Shutters (AGS)', description: 'Motorised grille shutters improve aerodynamic Cd by 0.003-0.008 and reduce warm-up time by controlling airflow. Becoming standard on C-segment+ BEV for range.', status: 'Mainstream', impact: '1-2% range improvement on BEV. €25-45/vehicle content — justified by CO2 penalties.' },
  { id: 'cabin-preconditioning', title: 'Remote Cabin Pre-Conditioning', description: 'Grid-connected cabin conditioning before departure on BEV: standard feature. Software-controlled thermal pre-set eliminates 10-15 min seat/mirror heating loads from battery energy.', status: 'Mainstream', impact: 'Software feature — no hardware cost. 5-8% effective range improvement in winter.' },
  { id: 'immersion-cooling', title: 'Immersion Cooling for Ultra-Fast Charging', description: 'Direct immersion cooling of cells in dielectric fluid enables 350kW+ sustainable charging. Required for 800kW charging corridors targeted 2027. Immersion fluid cost ~€1.5-2.5/litre.', status: 'Next-Gen', impact: 'Cost impact: +€180-320/vehicle vs glycol plate cooling. NRE: €25-40M per platform.' },
];

export const HVAC_COST_STRUCTURE = [
  { name: 'Refrigerant Circuit', value: 35, color: '#06b6d4' },
  { name: 'HVAC Core Unit', value: 28, color: '#0ea5e9' },
  { name: 'Battery Thermal', value: 22, color: '#3b82f6' },
  { name: 'Rear HVAC', value: 8, color: '#6366f1' },
  { name: 'Controls & Actuators', value: 7, color: '#8b5cf6' },
];

export function getTotalHvacIdeas(): number {
  return HVAC_COMPONENTS.reduce((sum, c) => sum + c.levers.length, 0);
}
