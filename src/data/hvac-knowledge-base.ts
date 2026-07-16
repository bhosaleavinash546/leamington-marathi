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
      { action: 'Single-zone HVAC housing platform serving dual-zone via add-on rear duct module', saving: '£238-425K tooling saving vs dedicated dual-zone housing, 2 SKUs → 1', conf: 'verified', bench: 'Valeo ThermoSystem — shared housing architecture across Renault/Nissan platforms' },
      { action: 'BLDC brushless blower motor replace brushed motor — delete EMC filter, lower warranty', saving: '£3.4-6.8 part saving; warranty cost -40% on HVAC complaints', conf: 'verified', bench: 'Standard from 2021: Valeo, MAHLE, Denso BLDC blower' },
      { action: 'Delete heater core on BEV (PTC electric heater replaces coolant loop)', saving: '£19-32 heater core + hoses saving; simplifies thermal loop', conf: 'verified', bench: 'Tesla Model 3/Y, VW ID.3 — no coolant heater core on BEV' },
      { action: 'Microfilter reduce to single-layer ePTFE on lower-pollutant markets (delete activated carbon layer)', saving: '£3.4-7.6/filter on markets where VOC is non-issue (certain APAC markets)', conf: 'estimated', bench: 'Mann+Hummel FreciousPlus — market-specific filter spec' },
      { action: 'Common flap actuator stepper motor across all zones (single part number)', saving: '8-14 actuator SKUs → 3; £2.5-5.1 unit cost reduction via volume', conf: 'benchmarked', bench: 'Bosch/Hella standardised actuator family — proven on MQB platform' },
    ],
  },
  {
    id: 'refrigerant-circuit',
    name: 'Refrigerant Circuit & Heat Pump',
    levers: [
      { action: 'Electric scroll compressor BEV — right-size displacement to heat pump mode (not just cooling)', saving: '15-20% compressor displacement reduction enables 8-12% cost saving', conf: 'benchmarked', bench: 'MAHLE/Sanden ECS compressor right-sizing — Tesla heat pump 2021' },
      { action: 'R1234yf EXV (electronic expansion valve) vs TXV on BEV: enables heat pump reversal', saving: '£6.8-13 premium vs TXV but enables heat pump COP 2.5-3.5 (vs 1.0 PTC)', conf: 'verified', bench: 'BMW iX, Audi Q4 e-tron, Hyundai Ioniq 5 — EXV standard on BEV' },
      { action: 'Delete refrigerant receiver-dryer on R1234yf systems with internal dryer in condenser', saving: '£10-15 component saving + 1 brazed joint delete', conf: 'estimated', bench: 'Delphi/APTIV condenser with integrated dryer — Ford Mach-E' },
      { action: 'Multi-port extrusion (MPE) condenser vs tube-and-fin — 15% smaller, same capacity', saving: '8-12% condenser cost at equal thermal performance', conf: 'verified', bench: 'All modern OEM — MPE condenser standard since 2015+' },
      { action: 'Brazed plate chiller (refrigerant-to-coolant) integrated into valve block — delete external chiller unit', saving: '£30-47/unit parts saving + packaging benefit', conf: 'estimated', bench: 'Denso integrated chiller valve block — Toyota BEV thermal module' },
    ],
  },
  {
    id: 'battery-thermal',
    name: 'Battery Thermal Management',
    levers: [
      { action: 'TIM thickness reduction to ≤0.3mm via flatness tolerancing improvement on cells', saving: '15-20% TIM material cost — thermal resistance also improves', conf: 'benchmarked', bench: 'Henkel Bergquist — controlled flatness enables <0.3mm TIM' },
      { action: 'Single-fluid (ATF) cooling loop for motor + battery — delete separate glycol circuit', saving: '20-30% thermal system cost (Ford F-150 Lightning proven)', conf: 'verified', bench: 'Ford Lightning — shared oil loop motor/gearbox/battery' },
      { action: 'Direct refrigerant cooling (DRC) of battery — delete glycol chiller stage', saving: '£47-68/vehicle by removing chiller HX and coolant circuit', conf: 'verified', bench: 'BMW i4 M50, Porsche Taycan Turbo — DRC standard on performance BEV' },
      { action: 'Phase-change thermal interface material (PCTIM) on PHEV — delete cooling circuit on low-use cycle', saving: 'PHEV battery cooling circuit delete potential (30 min drive duty)', conf: 'theoretical', bench: 'Phase-change wax PCM TIM — research at NXP/Henkel' },
      { action: 'Ribbon-fin Al extrusion cooling plate: 20-30% thermal component cost vs complex brazed serpentine plate', saving: '£15-30/plate vs brazed plate at same heat flux', conf: 'benchmarked', bench: 'Thermal Engineering Associates — ribbon-fin for volume BEV' },
    ],
  },
];

export const HVAC_MFG_LEVERS = [
  { id: 'heat-pump-integration', name: 'Heat Pump System Integration', description: 'Combine A/C compressor, chiller, and heat exchanger into a single thermal module (Octovalve-type) reducing packaging and assembly time.', saving: '15-20% assembly time on BEV thermal line', status: 'Mainstream' as const },
  { id: 'aluminium-hvac-housing', name: 'Al HVAC Housing Elements', description: 'Replace selected PP housing components with thin-wall Al extrusion for under-hood routing where temperature resistance is critical.', saving: '5-8% NRE via corrosion-resistance improvement', status: 'Emerging' as const },
  { id: 'refrigerant-line-simplification', name: 'Pre-Charged A/C Module', description: 'Pre-charged refrigerant circuit supplied as module — eliminates vehicle-level charging line on final assembly.', saving: '£10-17 assembly and tooling cost per vehicle', status: 'Emerging' as const },
];

export const HVAC_TRENDS: HvacTrend[] = [
  { id: 'heat-pump-bev', title: 'Heat Pump Becoming BEV Standard', description: 'By 2025, >80% of BEV programmes include heat pump — reversal mode COP 2.5-3.5 vs PTC COP 1.0. Range benefit at -10°C: +20-30km. EXV enables seamless mode switching.', status: 'Mainstream', impact: 'Heat pump adds £153-238 but justified by range impact and EU climate neutrality targets.' },
  { id: 'r1234yf-transition', title: 'R1234yf Universal Adoption', description: 'R1234yf (GWP=4) now universal on all new EU programmes. R744 (CO2) heat pump gaining on premium BEV for sub-freezing performance advantage.', status: 'Mainstream', impact: 'R744 offers COP advantage at -20°C but adds £102-170 compressor premium vs R1234yf.' },
  { id: 'thermal-module', title: 'Thermal Module Consolidation', description: 'Multi-function thermal management unit (coolant valve, chiller, heat pump valve) in single casting: BMW eDrive thermal module, Tesla Octovalve. Reduces thermal circuit complexity by 40%.', status: 'Emerging', impact: '6-8 thermal circuit components → 1 module. Tesla Octovalve reduces piping connections by 60%.' },
  { id: 'active-grille', title: 'Active Grille Shutters (AGS)', description: 'Motorised grille shutters improve aerodynamic Cd by 0.003-0.008 and reduce warm-up time by controlling airflow. Becoming standard on C-segment+ BEV for range.', status: 'Mainstream', impact: '1-2% range improvement on BEV. £21-38/vehicle content — justified by CO2 penalties.' },
  { id: 'cabin-preconditioning', title: 'Remote Cabin Pre-Conditioning', description: 'Grid-connected cabin conditioning before departure on BEV: standard feature. Software-controlled thermal pre-set eliminates 10-15 min seat/mirror heating loads from battery energy.', status: 'Mainstream', impact: 'Software feature — no hardware cost. 5-8% effective range improvement in winter.' },
  { id: 'immersion-cooling', title: 'Immersion Cooling for Ultra-Fast Charging', description: 'Direct immersion cooling of cells in dielectric fluid enables 350kW+ sustainable charging. Required for 800kW charging corridors targeted 2027. Immersion fluid cost ~£1.3-2.1/litre.', status: 'Next-Gen', impact: 'Cost impact: +£153-272/vehicle vs glycol plate cooling. NRE: £21-34M per platform.' },
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

export const HVAC_OEM_BENCHMARKS = [
  { oem: 'Valeo', model: 'Valeo ThermoSystem / R744 CO₂ Compressor', moves: ['ThermoSystem 8-in-1 thermal management block (BEV): integrates heat pump compressor, OBC, DC-DC, battery heater, chiller, coolant pump in one Al housing — delete 7 separate component brackets', 'R744 CO₂ electric compressor (Valeo Compleo): –30°C heat pump capable, COP 2.1 at –10°C — enables range-extended winter driving without LiDAR heater delete', 'Smart thermal valve (7-port proportional valve, Valeo): replaces 6 ON/OFF 2-way valves — 1 actuator manages all coolant routing, saves £27/vehicle', 'OBC + DC-DC combined unit (Valeo E3): 11 kW OBC + 3.3 kW DC-DC in single housing, liquid-cooled — delete separate DC-DC housing and 2 coolant connections'] },
  { oem: 'Mahle', model: 'Mahle ThermoElectric Module / Smart Coolant Management', moves: ['R1234yf scroll compressor (Mahle): 3.5 cc fixed displacement electric scroll replaces piston compressor — 18% efficiency gain, 0.4 kg lighter, quieter NVH (no piston pulses)', 'GHX (Gearbox Heat Exchanger) combined with OBC cooling (Mahle): single coolant circuit services transmission + OBC — delete separate gearbox HEX and 2 coolant ports', 'SmartCoolant 3-way valve (Mahle): thermostatically controlled 3-way valve at engine/motor junction — active mixing algorithm saves 2% WLTP energy in partial-warm scenarios', 'Flat-tube radiator (Mahle FTTM): MPE flat-tube core replaces round-tube radiator — 12% higher heat transfer per unit frontal area, 15% thinner (30 mm vs 35 mm)'] },
  { oem: 'BYD', model: 'BYD DM5 8-in-1 Thermal / Han EV Heat Pump', moves: ['8-in-1 thermal block (BYD e-Platform 3.0): single Al casting integrates motor cooling loop, battery thermal loop, OBC heat rejection, cabin heat pump evaporator — delete 3 separate housings + 8 brazed connections', 'DM5 heat pump (Han L PHEV): R134a heat pump COP 3.2 at +7°C, 2.4 at –10°C — delete PTC heater as primary heat source, PTC retained only as backup (<–20°C)', '3-way coolant valve (4xe-style, BYD): ICE coolant shares battery thermal circuit when ICE warm — delete dedicated battery pump during ICE-running PHEV mode', 'Denza D9 HVAC consolidation: single front HVAC unit + rotary drum air distribution valve serves front + rear zones — delete secondary rear blower motor (£32/vehicle saving)'] },
  { oem: 'Denso', model: 'Toyota THS-II HVAC / Heat Pump EV / Integrated Thermal Unit', moves: ['Toyota THS-II heat pump (bZ4X): CO₂ refrigerant circuit with heat pump mode using waste motor heat — delete PTC as primary heat (retained <–25°C backup only)', 'Denso Integrated Thermal Management Unit (ITMU, Lexus RZ): single body integrates air conditioning, battery chiller, heat pump valve — 3 units → 1, 0.6 kg saving', 'Smart cabin pre-conditioning (Denso pre-A/C algorithm): pre-cools cabin 15 min before departure using HVAC at min compressor speed — net range saving vs full-speed blast at departure', 'EV heat pump COP benchmark: Denso 3-fluid (R744 CO₂): COP 2.6 at –15°C test condition — highest in class at 2025; 35% more efficient than R1234yf pump at same condition'] },
  { oem: 'Porsche / Audi', model: 'PPE Platform / Taycan EIS / Q8 e-tron', moves: ['EIS (Electric Intelligence System) heat pump (Taycan): refrigerant-to-refrigerant heat pump using waste inverter heat — COP 3.4 at +5°C, deletes dedicated coolant-to-refrigerant HEX', 'Refrigerant cable routing (BMW/Audi approach): refrigerant loop integrated into high-voltage cable route — co-run reduces bracket, clip, and route length by 0.9 m', 'GF-PA66 moulded coolant manifold (Audi e-tron GT): 35% GF PA66 moulded 6-port manifold replaces machined Al 6061 — 0.28 kg saving, £34/vehicle cost saving', 'Predictive thermal management (PPE platform): ADAS map data pre-conditions battery 20 min before DC fast charger arrival — reduces charge time from 22 min → 16 min (10–80%)'] },
  { oem: 'NIO / Range Rover', model: 'NIO ET9 R290 / Range Rover L460 ORC', moves: ['NIO ET9 R290 heat pump (propane refrigerant): GWP = 3 (vs R1234yf GWP = 4) — enables 0°C start without PTC pre-heat, COP 2.8 at –15°C, natural refrigerant compressor smaller by 20%', 'Range Rover L460 ORC (Organic Rankine Cycle, JLR-Ricardo): exhaust heat recovery converts 4.4kW waste heat → 0.9 kW electricity — reduces alternator load, 1.5% WLTP CO2 saving', 'Dual-evaporator HVAC (NIO/Rivian approach): separate battery chiller evaporator + cabin evaporator on same refrigerant loop — enables independent battery cooling during fast charge without running cabin fan', 'Li-Auto L9 exhaust heat exchanger: ICE exhaust gases pre-heat coolant for HVAC in REEV mode — 9°C faster cabin heat, delete PTC draw from battery during ICE warmup'] },
];
