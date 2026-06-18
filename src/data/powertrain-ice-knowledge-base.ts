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
