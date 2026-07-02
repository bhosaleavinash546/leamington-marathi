import { ConfidenceLevel } from '../types';

export interface IceLever {
  action: string;
  saving: string;
  conf: ConfidenceLevel;
  bench: string;
  note?: string;
}

export interface IceComponent {
  id: string;
  name: string;
  levers: IceLever[];
}

export interface IceTrend {
  id: string;
  title: string;
  description: string;
  status: 'Mainstream' | 'Emerging' | 'Next-Gen';
  impact: string;
}

export const ICE_COMPONENTS: IceComponent[] = [
  {
    id: 'engine-assembly',
    name: 'Engine Assembly',
    levers: [
      { action: 'Al block with Al-Si bore coating (LDS/Plasma) — delete cast-iron liners', saving: '8-14% block mass, 12-18% machining cost', conf: 'verified', bench: 'BMW N20, Mercedes M254 bore coating', note: 'Enables tighter bore tolerances and thinner walls' },
      { action: 'Integrated exhaust manifold in cylinder head (IEM): delete standalone manifold', saving: '€40-80/unit, faster warm-up (5-8% fuel saving)', conf: 'verified', bench: 'Ford EcoBoost, VW EA211 evo, BMW B48' },
      { action: 'Bedplate / ladder-frame crankshaft carrier — delete main bearing caps as individual parts', saving: '6-10% block machining, NVH improvement', conf: 'benchmarked', bench: 'GM Ecotec, Ford Cyclone V6 — noise floor -2 dB' },
      { action: 'Hollow camshaft (assembled) vs solid forged — same stiffness, 25-30% cam mass', saving: '€8-15/cam in material, enables oil-through spray bar', conf: 'verified', bench: 'BMW, Audi TFSI — standard on DOHC >2.0L' },
      { action: 'VVT phaser integration into single actuator hub — delete separate OCV valve', saving: '€12-20/unit parts + €4-6 assembly time', conf: 'estimated', bench: 'Denso unified VVT, BorgWarner eTVT system' },
    ],
  },
  {
    id: 'exhaust-system',
    name: 'Exhaust & Aftertreatment',
    levers: [
      { action: 'Reduce PGM loading via advanced washcoat (TWC) — Pd/Rh ratio optimisation', saving: '15-30% catalyst metal cost (Pd ~€30/g, Rh ~€200/g)', conf: 'benchmarked', bench: 'BASF, Umicore Gen5 washcoat — 30% Pd reduction' },
      { action: 'Thin-wall cordierite GPF substrate (100 cpsi, 6 mil wall) — EU7 compliant', saving: '8-12% GPF cost vs current heavy-wall, lower back-pressure', conf: 'benchmarked', bench: 'NGK/NTK UltraThin wall, Corning Gen3 ThinWall' },
      { action: 'Hydroformed SS exhaust manifold — delete flanged joint to turbo', saving: '15-20% weight, 10% fewer parts, faster light-off', conf: 'verified', bench: 'BMW M5 G90, Porsche 911 GT3 — tubular headers' },
      { action: 'Common centre-pipe section across 2 engine variants — shared tooling', saving: '€180-350K tooling amortised across higher volumes', conf: 'estimated', bench: 'VW Group MQB — shared NF pipe + single muffler platform' },
      { action: 'Acoustic resonator delete via active exhaust control valve (motor only models)', saving: '€35-55/vehicle NRE + content on non-performance spec', conf: 'estimated', bench: 'Ford Mustang active exhaust delete option (base trim)' },
    ],
  },
  {
    id: 'turbo-system',
    name: 'Turbocharger & Forced Induction',
    levers: [
      { action: 'Twin-scroll single turbo vs twin turbo layout — same output, fewer parts', saving: '€180-280/unit vs twin turbo configuration', conf: 'verified', bench: 'BMW B58 vs N54, Ford EcoBoost 2.7L twin-scroll' },
      { action: 'Integrated wastegate in turbine housing — delete external actuator', saving: '€25-45/unit + packaging benefit', conf: 'verified', bench: 'Garrett GTX, BorgWarner Regulated 2-Stage (R2S)' },
      { action: 'Water-cooled bearing housing — enables oil-free idle down, delete turbo timer', saving: '€15-25 content reduction + warranty improvement', conf: 'benchmarked', bench: 'All modern OEM turbos — standard feature from 2019+' },
      { action: 'Air-to-air FMAC intercooler vs water-cooled WCAC on base/mid trim', saving: '€80-130/unit cost saving on lower-output applications', conf: 'estimated', bench: 'VW EA888 Gen3 uses WCAC — base trims can use FMAC' },
      { action: 'Al compressor housing casting right-size to flow requirement — delete overspec', saving: '6-12% compressor housing cost on downsized castings', conf: 'estimated', bench: 'Turbo sizing analysis — common overspec on base trims by 15%' },
    ],
  },
  {
    id: 'fuel-system',
    name: 'Fuel System (GDI)',
    levers: [
      { action: 'Combined port + GDI (CPDI) injection delete port injectors on base spec', saving: '€35-55/vehicle by removing port injection on entry trims', conf: 'verified', bench: 'VW EA888 Gen3B vs Gen3: delete port injectors on base MY' },
      { action: 'Al fuel rail (electroless Ni plated) vs stainless — GDI applications', saving: '15-20% fuel rail cost at same pressure rating', conf: 'benchmarked', bench: 'Bosch, Delphi Al GDI rail — proven to 350 bar' },
      { action: 'Modular 6-layer HDPE fuel tank (standard geometry) across platform — shared blow-mould tool', saving: '€250-500K tooling saving across 2 derivatives', conf: 'estimated', bench: 'Toyota TNGA shared tank geometry (GR86/BRZ vs SUV derivs)' },
      { action: 'Delete high-pressure fuel pump accumulator on systems with electronic pressure control', saving: '€8-14/unit part + 1 part count reduction', conf: 'estimated', bench: 'Bosch HDEV5 — integrated pressure control deletes accumulator' },
      { action: 'Common HPFP cam lobe across 4-cyl variants on same block — shared manufacturing', saving: '15-25% HPFP development cost, single validation', conf: 'benchmarked', bench: 'BMW B46/B48 common HPFP architecture across 1.5/2.0L' },
    ],
  },
  {
    id: 'engine-cooling',
    name: 'Engine Cooling System',
    levers: [
      { action: 'Electric coolant pump (EWP) + map thermostat — delete belt-drive parasitic drag', saving: '€20-35 net save after EWP premium, 2-3% fuel saving at warm-up', conf: 'verified', bench: 'BMW N20/B48, Mercedes M264 — electric pump standard from 2016' },
      { action: 'Split-cooling (cylinder head/block) — optimise warm-up temperature map', saving: '3-5% fuel saving via faster warm-up, delete heater bypass valve', conf: 'verified', bench: 'VW EA888 Gen3B split-cooling — confirmed CO2 reduction 2g/km' },
      { action: 'Brazed Al radiator (flat tube) vs round tube — 15% smaller core same thermal load', saving: '8-12% radiator cost at equal thermal performance', conf: 'benchmarked', bench: 'Modine, Denso flat-tube — standard on C-segment from 2020' },
      { action: 'Coolant hose integration into single blow-moulded manifold (2-port header)', saving: '3 parts → 1, delete 4 clamps, 8-12 min assembly time saving', conf: 'estimated', bench: 'BMW G20 coolant routing — moulded manifold vs hose + tee' },
      { action: 'Low-temperature (LT) coolant loop share with charge air cooling — delete dedicated WCAC loop', saving: '€45-75/vehicle by combining LT circuits', conf: 'estimated', bench: 'Ford EcoBoost Gen3 shared LT coolant loop' },
    ],
  },
];

export const ICE_MFG_LEVERS = [
  { id: 'near-net-machining', name: 'Near-Net Casting / Forging', description: 'Reduce machining stock on critical ICE components via tighter foundry process control. Target 60% machining allowance reduction on non-critical surfaces.', saving: '10-15% machining cost reduction', status: 'Mainstream' as const },
  { id: 'laser-honing', name: 'Laser-Honed Bore Surface', description: 'Replace conventional cross-hatch honing with laser-textured bore: lower friction, better oil retention, 0.3 μRa achievable.', saving: '3-5% fuel consumption improvement', status: 'Emerging' as const },
  { id: 'composite-piston', name: 'Steel Crown / Al Skirt Composite Piston', description: 'Steel piston crown for thermal resistance + Al skirt for weight — enables higher compression ratio on downsized engines.', saving: '8-12% piston mass, enables 0.5-1.0 CR increase', status: 'Emerging' as const },
  { id: 'friction-reduction', name: 'Diamond-Like Carbon (DLC) Coating on Tappets', description: 'PVD DLC coating on follower faces and camshaft lobes: friction -30%, wear -70%. Justifiable on premium ICE/MHEV programmes.', saving: '1-2% fuel saving, warranty extension', status: 'Mainstream' as const },
  { id: 'modular-assembly', name: 'Modular Sub-Assembly Lines', description: 'Move camshaft/VVT and fuel system assembly to modular sub-lines: just-in-time delivery to main engine line, 15% line balancing improvement.', saving: '8-12% assembly plant overhead per engine', status: 'Mainstream' as const },
];

export const ICE_TRENDS: IceTrend[] = [
  { id: 'eu7-compliance', title: 'EU7 Aftertreatment Requirements', description: 'EU7 mandates stricter PN/NOx limits (0.1°C cold-start window), requiring close-coupled TWC + GPF with electrically heated catalyst (eCAT) on all petrol engines from 2026 light duty.', status: 'Mainstream', impact: 'eCAT adds €35-60/vehicle — offset partially via thinner-wall GPF and Pd/Rh optimisation.' },
  { id: 'mhev-integration', title: '48V MHEV Integration on ICE', description: 'Belt-starter generator (BSG/RSG) becoming standard on C-segment+ ICE: 12-15% fuel saving vs conventional; eCAT function transferred to BSG catalyst heating.', status: 'Mainstream', impact: 'MHEV premium ~€350-600 partially offset by downsized engine, delete idle stop starter.' },
  { id: 'atkinson-cycle', title: 'Atkinson / Miller Cycle Expansion', description: 'High expansion ratio cycles (Atkinson/Miller) with variable compression ratio (VCR) or high EGR dilution deliver 8-12% thermal efficiency gain for hybrid applications.', status: 'Emerging', impact: 'Nissan VCR, Infiniti VC-Turbo — 2.0L achieves 40% thermal efficiency.' },
  { id: 'pgm-reduction', title: 'Platinum Group Metal Reduction', description: 'Advanced washcoat formulations (Pd-rich, Rh-reduction) reducing PGM loading 20-35% while maintaining EU6d temp light-off performance. Critical given Rh volatility (€150-250/g range).', status: 'Mainstream', impact: '20-35% catalyst system cost reduction at material level.' },
  { id: 'igcc-combustion', title: 'Ignition Gasoline Compression (IGCI)', description: 'Pre-chamber ignition enabling very lean combustion (λ=2), reducing fuel consumption 12-18% vs stoichiometric. BMW Neue Klasse ICE range-extender applies this.', status: 'Emerging', impact: 'NRE investment ~€50-80M for combustion system and injector development.' },
  { id: 'integrated-exhaust', title: 'Cylinder Head with Integrated Exhaust Manifold', description: 'IEM (Integrated Exhaust Manifold) in the head eliminates a separate manifold part, reduces gasket interface, enables water-cooling of exhaust port reducing need for oil cooling.', status: 'Mainstream', impact: '€40-80/vehicle parts saving + faster catalyst light-off (2-3% CO2).' },
  { id: 'variable-displacement', title: 'Cylinder Deactivation (CDA/VDE)', description: 'Cylinder deactivation on 4/6-cylinder via hydraulic valve train deactivation: 5-8% fuel saving in highway cruise. Becoming standard on all 4-cyl ICE with MHEV.', status: 'Emerging', impact: 'Honda i-VTEC, GM AFM — NRE ~€25-40M per engine family.' },
  { id: 'digital-combustion', title: 'AI-Optimised Combustion Calibration', description: 'Machine learning combustion calibration reducing knock-protection retard: 1-2% efficiency gain. Enables smaller safety margins in compression ratio and ignition advance maps.', status: 'Emerging', impact: 'Software-only improvement; minimal NRE. BMW / Continental now deploying AI ECU calibration.' },
];

export const ICE_COST_STRUCTURE = [
  { name: 'Engine Assembly', value: 38, color: '#ef4444' },
  { name: 'Exhaust/Aftertreatment', value: 18, color: '#f97316' },
  { name: 'Fuel System (GDI)', value: 12, color: '#eab308' },
  { name: 'Turbocharger', value: 14, color: '#84cc16' },
  { name: 'Cooling System', value: 8, color: '#22c55e' },
  { name: 'Lubrication', value: 5, color: '#06b6d4' },
  { name: 'Mounts & Ancillaries', value: 5, color: '#8b5cf6' },
];

export function getTotalIceIdeas(): number {
  return ICE_COMPONENTS.reduce((sum, c) => sum + c.levers.length, 0);
}

export const ICE_OEM_BENCHMARKS = [
  { oem: 'Toyota', model: 'GR Corolla 1.6T / THS-II 2.5 Hybrid', moves: ['GR Corolla G16E-GTS 1.6T 3-cylinder: 224 kW at 6,500 rpm — demonstrating 3-cyl viability for performance, delete 1 cylinder + balance shaft vs 4-cyl baseline', 'THS-II (Toyota Hybrid System): 2.5 Atkinson cycle at 41% thermal efficiency — highest mass-market ICE thermal efficiency 2024, Pd-only TWC eliminates Rh', 'Integrated intake + exhaust camshaft (gear-driven): delete timing chain + separate tensioner assembly, −4 parts per engine', 'EU7 road map: solid electrolyte catalyst (ceramic substrate eCAT) for sub-0°C light-off — 35 g Pt replacement with Pd-rich washcoat saving €18/vehicle'] },
  { oem: 'BMW', model: 'B48 EU7 / S58 M / B57 Diesel MHEV', moves: ['B48 EU7 MHEV (48V BSG): Valeo eStarter 18 kW at 48V replaces 12V alternator + starter — delete 2 components → 1; 9 g/km CO2 saving WLTP', 'IEM (Integrated Exhaust Manifold) B48 EU7: exhaust manifold cast into cylinder head — delete separate manifold gasket, faster catalyst light-off −2.8 s, 4% CO2', 'S58 M: close-coupled TWC (Pd3.2g/Rh0.4g) + underfloor GPF — Rh loading −22% vs S55 via improved washcoat dispersion technique (BMW IP)', 'Variable-load turbo (VTG on petrol B58TU2): VTG turbine eliminates wastegate solenoid — 1.8 s boost response improvement, delete wastegate actuator'] },
  { oem: 'Mercedes-Benz', model: 'M254 4-cyl / M256 6-cyl MHEV / OM654 Diesel', moves: ['M254 MHEV: 48V integrated starter-generator (ISG) on gearbox bell-housing — 16 kW recuperation, delete 12V alternator entirely from engine ancillaries', 'IEM (Integrated Exhaust Manifold in head): M254 EU7 — exhaust port water-cooling via cylinder head jacket, faster TWC light-off, 3% CO2 saving', 'PGM optimisation: Pd:Rh ratio shift 4:1 → 6:1 on M254 TWC (BASF Catalysts) — saves 0.3 g Rh/engine @ €220/g = €66/engine at Rh peak pricing', 'OM654 diesel 4-cyl: delete 2 balance shafts at Gen2 (NVH target achieved by revised crankshaft balance factor) — 1.4 kg saving, 2 parts deleted'] },
  { oem: 'Stellantis', model: '1.2T PureTech EU7 / 2.0T GME / 3.0T Hurricane', moves: ['PureTech 1.2T 3-cyl EU7: eCAT (48V electrically heated catalyst, Vitesco supply) eliminates 95% cold-start HC emissions — mandatory EU7 from 2026', 'GME (Global Medium Engine) 2.0T: delete balance shaft via counter-rotating balancer integrated into oil pump drive — saves 0.8 kg', '3.0L Hurricane I6 PHEV: delete 2 balance shafts inherent to inline-6 — cost saving vs V6 ($240/engine) for equivalent power class', 'DynaCT (Dynamic Compression Technology): variable compression ratio prototype (PCBU ICE Lab) targets 43% thermal efficiency for Range Extender application'] },
  { oem: 'Volkswagen Group', model: 'TSI evo3 / EA888 Gen4 / TDI Evo MHEV', moves: ['TSI evo3 (EA211 1.5L): Miller cycle + EIPI direct injection + 48V MHEV (belt-alternator-starter) — 10% CO2 improvement over evo2 base', 'EA888 Gen4 (2.0 TSI): IEM head + electric water pump + active cylinder management (CDA 4→2) — delete 2 injectors active in cylinders 1+4 deactivated', 'TDI evo MHEV: 48V BSG (Continental P0 architecture) on TDI EU7 — delete 12V Bosch alternator, recuperate 15 kW braking energy, 7% WLTP CO2', 'Scalable Systems Platform (SSP): common engine management ECU across TSI/TDI — 1 ECU replaces 2 (engine + gearbox separate ECUs merge onto 1 Bosch MDG1)'] },
  { oem: 'Hyundai / Kia', model: 'Smartstream G2.5 / Lambda III V6 / CVVD Engine', moves: ['CVVD (Continuously Variable Valve Duration) on Smartstream G1.6T: first mass-production CVVD — 4% efficiency gain over CVVT, enables Atkinson cycle at cruise without cam profile switch', 'Smartstream G2.5 GDI: Pd-dominant TWC (4.8 g Pd, 0.4 g Rh vs 3.6/0.8 on outgoing Lambda II) — 50% Rh reduction, saving €35/TWC at peak Rh pricing', 'Lambda III V6 3.5T: delete balance shaft (inline-60° V6 inherently balanced) — 0.6 kg + 2 parts saving vs previous V6 Lambda requiring balance shaft', 'Integrated MHEV (48V RSG, Hyundai-Kia in-house motor): replace Bosch MHEV with in-house unit — €38/system saving at 300K units/yr volume'] },
];
