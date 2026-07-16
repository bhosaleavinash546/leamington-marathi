export interface BatteryLever {
  t: string;
  save: string;
  bench: string;
  bodyStyles: ('hatchback' | 'sedan' | 'suv' | 'coupe' | 'pickup' | 'mpv' | 'crossover' | 'universal')[];
  conf: 'verified' | 'benchmarked' | 'estimated' | 'theoretical';
  note: string;
}

export interface BatteryComponent {
  id: string;
  name: string;
  subassembly: string;
  baseline: string;
  levers: BatteryLever[];
  trends: string;
}

export interface BatteryTrend {
  t: string;
  status: 'Mainstream' | 'Emerging' | 'Next-Gen' | 'Declining';
  save: string;
  dir: string;
}

export const BATTERY_COMPONENTS: BatteryComponent[] = [
  {
    id: 'battery-cells',
    name: 'Battery Cells',
    subassembly: 'Cell Chemistry & Format',
    baseline: 'NMC622/811 pouch or prismatic cells at pack level. 400V architecture. Sourced from LG/CATL/Samsung SDI.',
    trends: 'LFP now >35% of global BEV (2025). CATL M3P (LFP+Mn) achieving 210 Wh/kg. 4680 cylindrical at Tesla/Panasonic reaching maturity. Sodium-ion targeting city car segment from 2026.',
    levers: [
      { t: 'NMC → LFP chemistry for range-appropriate models', save: '20-35% cell cost', bench: 'CATL (BYD Blade, Tesla LFP Standard)', bodyStyles: ['hatchback','sedan','suv','crossover','mpv','universal'], conf: 'verified', note: 'LFP: lower cobalt/nickel cost, longer cycle life (3000+), safer thermal. Penalty: 15-20% energy density' },
      { t: 'CATL M3P (Mn-doped LFP): density bridge', save: '8-12% vs NMC at same range', bench: 'CATL Shenxing Plus, BYD Sea-Lion 6', bodyStyles: ['sedan','suv','crossover','universal'], conf: 'benchmarked', note: 'M3P achieves 210 Wh/kg at LFP-comparable cost — narrows density gap to NMC while keeping cost advantage' },
      { t: '4680 cylindrical: 15-25% $/kWh reduction vs 21700', save: '15-25% cell $/kWh', bench: 'Tesla Giga Texas/Berlin 4680', bodyStyles: ['sedan','suv','pickup'], conf: 'benchmarked', note: 'Tabless electrode: less cell parts, higher energy density, faster charge. At scale ($B capex) breaks NMC21700 cost floor' },
      { t: 'Localise cell supply (China → regional)', save: '12-18% logistics + duties', bench: 'CATL Germany, SK On US/Hungary', bodyStyles: ['universal'], conf: 'benchmarked', note: 'EU/US: eliminate 18% import duty + 3-5% logistics cost. Regional cell supply also qualifies for IRA/EU CRMA subsidies' },
      { t: 'SoC window extension via better BMS algorithm', save: '3-5% effective capacity', bench: 'Tesla OTA improvements, BYD', bodyStyles: ['universal'], conf: 'estimated', note: 'Narrow DoD buffer from 10-90% → 8-92% via improved SoC estimation: more usable energy from same cells' },
    ],
  },
  {
    id: 'battery-module',
    name: 'Module Architecture',
    subassembly: 'Cell Module Assembly',
    baseline: 'Module-based pack: 4-8 modules per pack. Individual module frame + busbar + housing.',
    trends: 'CTP now mainstream on BEV (CATL Qilin 255 Wh/kg, BYD Blade). Module count reduction (2 modules vs 6) interim step. CTB (cell-to-body) arriving on performance BEV.',
    levers: [
      { t: 'Cell-to-Pack (CTP): delete module frame entirely', save: '15-20% pack cost, +5-15% energy density', bench: 'CATL Qilin, BYD Blade, Tesla 4680', bodyStyles: ['sedan','suv','hatchback','crossover','universal'], conf: 'verified', note: 'Delete module housing, reduce busbars. Thermal management direct on cells. Best-in-class: CATL Qilin 255 Wh/kg' },
      { t: 'Reduce module SKU count: 6→2 per pack', save: '8-12% module tooling', bench: 'BMW iX 3.0 platform', bodyStyles: ['sedan','suv','coupe','crossover','universal'], conf: 'benchmarked', note: 'Common module height/width × 2 lengths covers all pack capacities: shared tooling, volume on single process line' },
      { t: 'Ultrasonic busbar welding (replace bolt-on)', save: '8-12% interconnect cost', bench: 'Manz, Fronius ultrasonic welding', bodyStyles: ['universal'], conf: 'estimated', note: 'Welded Al busbars: lower resistance, no torque creep, 30% faster vs bolted tab assembly' },
      { t: 'Adhesive bonding module-to-tray (replace fasteners)', save: '5-8% assembly time', bench: 'BMW i4, Audi Q8 e-tron', bodyStyles: ['universal'], conf: 'benchmarked', note: 'Structural adhesive module bonding: vibration-optimised, eliminates 20+ fasteners per module' },
      { t: 'Delete inter-module HV connector (direct busbar routing)', save: '£2.5-4.3/connector × N modules', bench: 'Tesla Model 3, BYD Blade', bodyStyles: ['universal'], conf: 'benchmarked', note: 'CTP/CTC direct cell-to-busbar eliminates inter-module connectors — requires pack-level serviceability planning' },
    ],
  },
  {
    id: 'bms',
    name: 'Battery Management System',
    subassembly: 'BMS / Electronics',
    baseline: 'Distributed BMS: standalone BMS master ECU + cell monitoring boards per module. Wired daisy-chain monitoring.',
    trends: 'Wireless BMS (wBMS) proven in GM Ultium. Centralised compute absorbing BMS function. Software-defined SoC improving usable range without hardware changes.',
    levers: [
      { t: 'Centralised BMS (one node vs distributed per module)', save: '25-35% BMS component cost', bench: 'CATL centralised BMS, VW Group', bodyStyles: ['universal'], conf: 'verified', note: 'Single BMS master with ASIC cell monitoring ICs: fewer PCBs, one calibration, simpler harness topology' },
      { t: 'Wireless BMS (wBMS): delete cell monitoring harness', save: '£6.8-13 per kWh (harness)', bench: 'GM Ultium (Analog Devices wBMS)', bodyStyles: ['sedan','suv','pickup','universal'], conf: 'verified', note: 'Proven in production: GM Hummer EV/Lyriq. Eliminates harness looms between modules. Pack reassembly simplified' },
      { t: 'Integrate BMS function into VCU/Domain controller', save: '£34-68 standalone ECU cost', bench: 'Rivian R1T/R1S, Lucid Air', bodyStyles: ['sedan','suv','pickup'], conf: 'estimated', note: 'High-performance compute node absorbs BMS: one fewer ECU, shared HW platform, one validation effort' },
      { t: 'Model-based SoC/SoH (no additional hardware)', save: 'Extend cell life 8-12%', bench: 'Tesla OTA SW updates, NIO', bodyStyles: ['universal'], conf: 'benchmarked', note: 'Improved Kalman/EKF algorithm for SoC: tighter DoD buffers possible → more usable capacity from same cell' },
      { t: 'Pack-level isolation monitoring (vs per-module)', save: '2-3 isolation IC units deleted', bench: 'CATL, Hitachi standard practice', bodyStyles: ['universal'], conf: 'estimated', note: 'Single pack-level IMD vs individual module IMD: simplifies topology, meets IEC 60664 at pack boundary' },
    ],
  },
  {
    id: 'battery-thermal',
    name: 'Thermal Management',
    subassembly: 'Battery Thermal Management System',
    baseline: 'Bottom cooling plate (brazed Al ribbons). Separate chiller and HVAC loop. Liquid glycol circuit.',
    trends: 'Immersion cooling for ultra-fast charging (>250kW) emerging. Single-fluid architecture (motor+battery ATF loop) reducing hardware count. TIM thickness reduction is key lever.',
    levers: [
      { t: 'Ribbon-fin Al extrusion cooling plate (vs brazed flat)', save: '20-30% thermal component cost', bench: 'Modine, Dana Thermal standard', bodyStyles: ['universal'], conf: 'estimated', note: 'Extruded ribbon-fin plate: fewer brazing ops, better geometry consistency, faster lead-time vs complex brazed plate' },
      { t: 'Reduce TIM thickness via surface flatness spec', save: '15-20% TIM material cost', bench: 'Henkel, Shin-Etsu TIM optimisation', bodyStyles: ['universal'], conf: 'estimated', note: 'Specify cell bottom/cooling plate flatness to enable ≤0.4mm TIM vs current 0.6-0.8mm — same thermal resistance' },
      { t: 'Single-fluid (ATF) cooling: motor + battery loop', save: '20-30% thermal system cost', bench: 'Ford F-150 Lightning, Lucid Air', bodyStyles: ['sedan','suv','pickup','universal'], conf: 'benchmarked', note: 'One pump, one fluid, fewer heat exchangers. Ford F-150 Lightning pioneered this. Requires ATF-compatible cell selection' },
      { t: 'Delete chiller for PHEV (phase-change TIM substitution)', save: '£68-128 chiller + plumbing', bench: 'Stellantis PHEV platforms', bodyStyles: ['hatchback','sedan','suv','crossover'], conf: 'estimated', note: 'PHEV partial-charge cycles: phase-change TIM buffers heat spikes, simplifies cooling loop vs full BEV chiller' },
      { t: 'Direct refrigerant cooling (DRC) delete chiller', save: '8-15% HVAC system cost', bench: 'BMW i4 M50, Porsche Taycan Turbo', bodyStyles: ['sedan','coupe','suv'], conf: 'benchmarked', note: 'Refrigerant flows directly through battery floor plate: eliminates glycol/water chiller, fewer HXs — requires R744 or R1234yf rated sealing' },
    ],
  },
  {
    id: 'pack-housing',
    name: 'Pack Enclosure & Structure',
    subassembly: 'Battery Pack Housing',
    baseline: 'Al extrusion frame + bottom Al sheet + top Al cover. Multiple internal crossmembers.',
    trends: 'Al HPDC integrated trays replacing welded extrusion frames. Structural packs (CTB) making pack enclosure part of vehicle structure. Composite covers reducing mass. Gigacast bottom trays emerging.',
    levers: [
      { t: 'Al HPDC integrated tray (vs welded extrusion frame)', save: '8-12 parts → 2-3', bench: 'BMW i4/iX, Hyundai Ioniq 5', bodyStyles: ['sedan','suv','hatchback','crossover','universal'], conf: 'benchmarked', note: 'Cast Al tray integrates cross-members, mounting bosses, coolant ports: fewer machining ops, better sealing' },
      { t: 'GF-PP composite top cover (vs Al sheet)', save: '40-50% cover mass', bench: 'CATL standard, Mubea composites', bodyStyles: ['universal'], conf: 'verified', note: 'GF-PP injection-moulded cover: 40% lighter, no corrosion, lower tooling cost than Al stampings, better thermal' },
      { t: 'Structural pack integration (CTB): BIW floor deletion', save: 'BIW floor layer removed', bench: 'BYD Ocean e-Platform, Tesla Model Y, NIO', bodyStyles: ['sedan','suv','hatchback','crossover'], conf: 'verified', note: 'Pack tray carries torsional loads → delete vehicle floor crossmembers. 10-15% total vehicle cost saving when done at platform level' },
      { t: 'Foam structural fill of pack void spaces', save: '25% stiffness gain without steel', bench: 'Sika FoamCore, Dow structural foam', bodyStyles: ['universal'], conf: 'estimated', note: 'Expandable foam between cells/modules: stiffens pack, absorbs vibration, no added mass. Thermal properties manageable' },
      { t: 'Relax coolant port machining: IT6→IT7 on non-sealing faces', save: '8-12% machining cost', bench: 'Automotive machining benchmarks', bodyStyles: ['universal'], conf: 'estimated', note: 'Only seal-face features require IT6 — remaining faces run at IT7: reduces cycle time and tool wear' },
    ],
  },
  {
    id: 'hv-electrical',
    name: 'HV Electrical System',
    subassembly: 'HV Electrical (BDU, Busbars, Connectors)',
    baseline: 'Cu busbars. Separate BDU housing. Manual service disconnect (MSD). Multiple HV connectors.',
    trends: '800V enabling Al busbar adoption. BDU integration into n-in-1 powerunit. Pyro fuse replacing MSD for faster isolation.',
    levers: [
      { t: 'Al busbar vs Cu at 800V (current halved)', save: '20-30% busbar material cost', bench: 'Porsche Taycan, Hyundai E-GMP, Lucid', bodyStyles: ['sedan','suv','coupe','crossover','universal'], conf: 'verified', note: 'At 800V, phase current halves → Al conductor viable. £/kg Al vs Cu: 80% lower. Crimp/weld terminations at joints' },
      { t: 'Pre-assembled HV harness module (kitted assembly)', save: '25-35% body-line time', bench: 'Aptiv, TE Connectivity modular HV', bodyStyles: ['universal'], conf: 'estimated', note: 'Pre-wired HV harness with connectors, tested before fitment: eliminate in-station connection errors, reduce assembly time' },
      { t: 'Integrate BDU + pyro fuse + current sensor: single housing', save: '4 parts → 1', bench: 'BYD 8-in-1, Marelli BDU', bodyStyles: ['sedan','suv','coupe','crossover','universal'], conf: 'verified', note: 'Integrated BDU: isolator + fuse + current measurement in one box — delete external housing, brackets, 3 connectors' },
      { t: 'CTP: reduce HV connectors (direct cell-to-busbar)', save: '£2.5-4.3 × N inter-module connectors', bench: 'Tesla Model 3, BYD Blade CTP', bodyStyles: ['universal'], conf: 'verified', note: 'CTP eliminates inter-module connections — busbar routes directly over cells. Fewer HVIL loops required' },
      { t: 'Standardise HV connector interface across platform', save: '8-12% connector cost', bench: 'VW Group, HVIL standard (NACS/CCS)', bodyStyles: ['universal'], conf: 'benchmarked', note: 'Common HV connector family (2-pin/3-pin) across 3-4 models: volume pricing, single qualification' },
    ],
  },
];

export const BATTERY_MFG_LEVERS = [
  { t: 'Automated cell stacking (pouch/prismatic)', save: '30-40% assembly ops', process: 'Automation', note: 'Fully automated pick-place cell stacking with vision QC: replaces manual stacking, better cell alignment, 40% faster' },
  { t: 'Laser tab welding (replace ultrasonic wire bond)', save: '20-30% tab weld cost', process: 'Laser Weld', note: 'Fibre laser busbar-to-tab welding: single pass, no tooling wear, no cleaning between welds — CATL/LG standard' },
  { t: 'Formation cycling optimisation (reduce time 25%)', save: '20-25% formation cost', process: 'Process', note: 'Fast-formation protocol (temp + rate optimised): cut formation cycle from 16hr → 12hr. CATL IP-protected fast-form' },
  { t: 'Inline electrochemical impedance spectroscopy (EIS) QC', save: '15-25% EOL test time', process: 'Quality', note: 'EIS during formation replaces EOL discharge cycle: predict SoH with 99% confidence, cut overall cycle time 20%' },
  { t: 'Robotic busbar routing + sealing', save: '15-20% HV assembly time', process: 'Automation', note: 'KUKA/Fanuc robot: busbar placement + sealer application in one cell — consistent geometry, less rework' },
  { t: 'Direct coating (no primer) on Al cooling plates', save: '5-8% thermal coating cost', process: 'Surface', note: 'Nano-surface treatment enabling direct TIM bond to anodised Al — delete primer step + drying oven pass' },
];

export const BATTERY_TRENDS: BatteryTrend[] = [
  { t: 'LFP (LiFePO₄) cell mainstream for mid-range BEV', status: 'Mainstream', save: '20-35% cell cost', dir: 'CATL, BYD, SVOLT LFP now >35% global BEV (2025). 150-165 Wh/kg (blade) to 210 Wh/kg (M3P). Zero cobalt, 3000+ cycles, safer thermal. Penalty: 15-20% less energy-dense than NMC.' },
  { t: 'Cell-to-Pack (CTP) architecture', status: 'Mainstream', save: '15-20% pack cost', dir: 'CATL Qilin (255 Wh/kg), BYD Blade, Tesla 4680 CTP: delete module housing. 2023-25: majority of new BEV programmes adopt CTP. CTP3.0 from CATL adds immersion cooling.' },
  { t: 'Wireless BMS (wBMS): delete monitoring harness', status: 'Emerging', save: '£6.8-13/kWh harness', dir: 'Analog Devices + GM Ultium: first high-volume wBMS in production. Eliminates cell voltage monitoring wiring loom. Simplifies pack assembly. Remaining challenge: EMI validation in dense cell environment.' },
  { t: 'Cell-to-Body (CTB) structural integration', status: 'Emerging', save: 'Delete BIW floor layer', dir: 'BYD Ocean Platform, Tesla (Model Y), NIO NT3: battery IS the floor. Pack tray provides torsional stiffness. 10-15% total vehicle cost saving at platform level. Complex repairability challenge.' },
  { t: '4680 large-format cylindrical cell', status: 'Emerging', save: '15-25% cell $/kWh (at scale)', dir: 'Tesla Giga Texas/Berlin 4680 in production. Tabless electrode: no tab welding, better thermal. 5× energy vs 2170 per cell. Panasonic GN ramping. Cost target: $65/kWh at 100 GWh/yr.' },
  { t: 'Sodium-ion cells for city car / entry BEV', status: 'Next-Gen', save: '£30-38/kWh target', dir: 'CATL Naci Na-ion in production (2024) for Chery BEV. BYD Na-ion prototypes. Lower cost than LFP. 0°C performance advantage. 100-130 Wh/kg — city car range adequate. Zero lithium, cobalt, nickel.' },
  { t: 'Solid-state batteries (SSB)', status: 'Next-Gen', save: '+50% energy density potential', dir: 'Toyota (2027 target), Samsung SDI, QuantumScape (VW-backed). No liquid electrolyte → safer, higher density. Still 2-3× NMC cost at 2025. First applications: PHEV small pack where cost premium justified.' },
  { t: 'Second-life batteries for stationary storage', status: 'Emerging', save: 'End-of-life value recovery', dir: 'BMW, Nissan, Renault: second-life BEV packs in grid storage (70-80% SoH). Extends value chain, reduces battery disposal cost. EU Battery Regulation 2027 mandates SoH reporting.' },
];

export const BATTERY_COST_STRUCTURE = [
  { name: 'Cells', share: 58, color: '#10b981' },
  { name: 'BMS/Electronics', share: 8, color: '#34d399' },
  { name: 'Thermal Mgmt', share: 8, color: '#6ee7b7' },
  { name: 'Housing/Structure', share: 10, color: '#059669' },
  { name: 'HV Electrical', share: 9, color: '#047857' },
  { name: 'Assembly/Other', share: 7, color: '#065f46' },
];

export function getTotalBatteryIdeas(): number {
  return BATTERY_COMPONENTS.reduce((sum, c) => sum + c.levers.length, 0);
}

export const BATTERY_OEM_BENCHMARKS = [
  { oem: 'CATL', model: 'Qilin CTP 3.0 / Shenxing / M3P / Naci Na-ion', moves: ['Qilin CTP 3.0 (255 Wh/kg pack level): multifunctional Al honeycomb cooling beam replaces foam + busbar support — 15% part count saving', 'Shenxing fast-charge: 10–80% in 10 min (4C LFP) via pre-heating algorithm — no hardware change, software-controlled thermal pre-conditioning', 'M3P (Mn-rich LFP variant): 15% higher energy density than standard LFP at same cell cost — enables range improvement without NMC switch', 'Naci Na-ion (2024): first mass-produced Na-ion pack (Chery iCar) — zero Li/Co/Ni, –30°C start capability, 100–130 Wh/kg cell'] },
  { oem: 'BYD', model: 'Blade CTP / CTB Ocean Platform / DM5 Integration', moves: ['Blade LFP CTP (5th gen): cells load-bearing in tray, delete all module frames — 142 Wh/kg pack level, 43 fewer parts per 100 kWh', 'CTB (Cell-to-Body) Ocean: pack tray IS the floor — BIW floor beams deleted, ±0.15 mm cell flatness control enables structural load path', 'DM5 PHEV integration: 8-in-1 thermal block manages battery + motor + OBC thermal in one unit, delete 3 separate loops', 'Sodium-ion 12V auxiliary pack (BYD Seagull): zero critical minerals in 12V system, –30°C cold-start, 3,000+ cycle life'] },
  { oem: 'Panasonic / Tesla', model: '4680 Tabless / Dry Electrode / Structural CTB', moves: ['4680 tabless cylindrical cell: no electrode tab → full-face conduction, 5× energy per cell vs 2170, no tab weld operation', 'Dry electrode (Maxwell IP, Tesla licence): solvent-free coating eliminates drying oven — 40% reduction in manufacturing footprint', 'Structural 4680 CTB (Model Y): cell array bonds to body floor — BIW floor rails deleted, torsional stiffness +50%', 'wBMS (wireless BMS): GM Ultium-style — delete cell monitoring harness entirely, assembly time −18 min/pack'] },
  { oem: 'LG Energy Solution', model: 'NCMA Gen6 / Large-Format Prismatic / wBMS', moves: ['NCMA Gen6 (Ni90 + Al): 5% Al reduces Ni content, improves thermal stability, 12% cycle-life improvement vs NMC90', 'Large-format prismatic 300 Ah: fewer cells per pack (40 prismatic vs 288 pouch on same kWh) — cell handling ops −65%', 'Wireless BMS (wBMS) qualification: Analog Devices ADI MSDK chip, eliminates 4.2 km cell voltage monitoring wire per pack', 'Si-anode programme (10% Si-C blend): 15% energy density gain on pouch cell — LG confirmed OEM supply Honda AFEELA 2026'] },
  { oem: 'Samsung SDI', model: 'P6 Prismatic / PRiMX Cylindrical / Si-Anode Gen5', moves: ['P6 large-format (91 Ah prismatic): 30% more energy per cell vs P5 — fewer cells, lower cell-to-pack assembly cost per kWh', 'PRiMX 46-series cylindrical (4695 format): 46 mm diameter for BMW Neue Klasse — 350 Wh/kg cell, eliminates 2170 pouch module assembly', 'Gen5 Si-anode NCMA: 10% Si-C anode blend, 730 Wh/L cell energy density, 20% range improvement on same envelope', 'Prismatic standardisation: P5 → P6 dimensional compatibility allows OEM pack tray reuse — NRC saving £1.53M per programme'] },
  { oem: 'NIO', model: 'Semi-Solid 150 kWh / Power Swap 3.0 / 2nd Life', moves: ['Semi-solid 150 kWh pack (CATL supply): quasi-solid ceramic gel electrolyte — 360 Wh/kg cell, eliminates liquid electrolyte leak warranty mode', 'Power Swap 3.0 station: 5-minute swap, standardised pack dimensions across ET5/ET7/ES6/ES8 — single swap station handles all models', 'BMS thermal mapping: 256-sensor distributed BMS tracks cell temperature gradient to ±0.5°C — enables faster charge without degradation', '2nd-life programme: NIO guarantees 70% SoH at 5-year swap — returned packs certified for grid storage (CATL FREEDY stationary unit)'] },
];
