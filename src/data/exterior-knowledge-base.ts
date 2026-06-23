import { ConfidenceLevel } from '../types';

export interface ExteriorLever {
  action: string;
  saving: string;
  conf: ConfidenceLevel;
  bench: string;
  note?: string;
}

export interface ExteriorComponent {
  id: string;
  name: string;
  levers: ExteriorLever[];
}

export interface ExteriorTrend {
  id: string;
  title: string;
  description: string;
  status: 'Mainstream' | 'Emerging' | 'Next-Gen';
  impact: string;
}

export const EXTERIOR_COMPONENTS: ExteriorComponent[] = [
  {
    id: 'bumpers',
    name: 'Bumper Systems',
    levers: [
      { action: 'EPP (expanded polypropylene) energy absorber — replace dual-density EPE foam + separate bracket', saving: '2 parts → 1, 20-30% mass saving, recyclable', conf: 'verified', bench: 'JSP Arpro EPP — standard BMW/VW front energy absorber from 2018+' },
      { action: 'Roll-formed Al extrusion bumper beam replacing stamped AHSS — 45-50% mass saving', saving: '45-50% mass reduction; cost neutral >120K/yr at scrap credit offset', conf: 'verified', bench: 'Audi A4/A6, BMW 5-Series Al bumper beam standard on D-segment' },
      { action: 'Common rear/front bumper beam section geometry (symmetric crash can mount) — shared tool', saving: '€200-400K tooling saving on F/R beam family sharing mount geometry', conf: 'estimated', bench: 'Toyota TNGA — shared bumper beam mount brackets F/R' },
      { action: 'PP-EPDM fascia replace with PP-GF15 for structural integration of sensors/PDC brackets', saving: 'Delete 4-6 clip-on sensor brackets; €8-14 assembly saving', conf: 'benchmarked', bench: 'Valeo bumper module — integrated PDC mounting in fascia' },
      { action: 'Delete lower NVH deflector on base trim (retain aero shield only on premium with active aero)', saving: '€12-22/vehicle NVH under-bumper deflector delete on price-sensitive spec', conf: 'estimated', bench: 'VW Golf base spec — delete lower air deflector vs GTI with active aero flap' },
    ],
  },
  {
    id: 'lighting',
    name: 'Lighting Systems',
    levers: [
      { action: 'Zoned LED headlight replacing full Matrix ADB on base trim — meets legal obligation at lower cost', saving: '€180-320/unit zoned LED vs ADB Matrix (7-12 segment vs 84 pixel)', conf: 'verified', bench: 'Osram LED chip cost: ADB matrix 84-LED vs 4-zone LED — 3× cost difference' },
      { action: 'Single LiDAR-free LED strip DRL (delete individual LED positions, single injection-moulded wave guide)', saving: '€15-28/headlight unit in LED component and fixture assembly saving', conf: 'benchmarked', bench: 'Valeo LED guide DRL — single injection-moulded PMMA strip vs discrete LEDs' },
      { action: 'Front and rear lamp shared inner optic carrier (shared bezel moulding geometry)', saving: '€150-280K shared tooling on inner lamp housing', conf: 'estimated', bench: 'BMW Group strategy: shared optic carrier across G20/G26 derivatives' },
      { action: 'Delete front fog lamp (replace with cornering function in main headlight — legislative change 2024)', saving: '€28-45/vehicle fog lamp delete per EU UNECE ECE R48 amendment (2024)', conf: 'verified', bench: 'EU 2024 regulation: cornering function in ADB headlight replaces standalone fog lamp requirement' },
      { action: 'Tail lamp common outer lens across hatchback/estate using oversize lens + clip-in infill', saving: '€120-220K tooling save on derivative programmes with shared outer lens', conf: 'estimated', bench: 'VW Golf variant/estate — lens overhang cover approach for boot extension' },
    ],
  },
  {
    id: 'glass-glazing',
    name: 'Glass & Glazing',
    levers: [
      { action: 'Acoustic interlayer windscreen (PVB acoustic) — delete separate NVH damping pad on A-pillar', saving: '€4-8/vehicle A-pillar NVH pad delete; improved high-freq attenuation', conf: 'verified', bench: 'AGC Planibel Acoustic — standard BEV windscreen with acoustic PVB layer' },
      { action: 'Thermal comfort glazing (heat-reflecting) side glass — reduces HVAC load 8-12% in summer', saving: 'HVAC compressor right-size: €25-40 compressor displacement reduction', conf: 'benchmarked', bench: 'Saint-Gobain EasyCool — deployed on Renault Espace, Peugeot 3008' },
      { action: 'Electrochromic panoramic glass (switchable tint) replacing mechanical blind — delete mechanism', saving: '€85-140 mechanism saving offset by €65-110 electrochromic premium = €20-30 net saving', conf: 'estimated', bench: 'Continental / View Inc electrochromic glass — BMW M3 panoramic, Mercedes S-Class' },
      { action: 'Heated windscreen (ITO coating) for faster defrost — reduce HVAC and idle time', saving: '3-5% BEV range improvement in winter via faster demist (less HVAC energy)', conf: 'benchmarked', bench: 'AGC Thermo-Coat — deployed on Ford Ranger, VW ID.7 — €35-55/windscreen premium' },
    ],
  },
  {
    id: 'wipers-washers',
    name: 'Wiper & Washer System',
    levers: [
      { action: 'Aero flat blade replacing conventional frame blade — aerodynamic noise reduction, longer life', saving: '€2-5/set material saving + warranty improvement (blade lift at >130km/h)', conf: 'verified', bench: 'Bosch AeroTwin — standard D-segment from 2019. Flat blade now industry standard' },
      { action: 'Single-arm wiper (RHD design delete: right-side post vs dual post) on SUV/hatchback', saving: '€15-25/unit (1 arm + motor vs 2) + windscreen sweep area improvement', conf: 'estimated', bench: 'Mercedes CLA W118 — single-arm wiper. Cost case at >150K/yr justified' },
      { action: 'Rain sensor integrated into camera module (forward camera uses wiping algorithm)', saving: '€18-30/vehicle standalone rain sensor delete — function absorbed by ADAS camera', conf: 'theoretical', bench: 'Tesla Vision-based wiper control — no separate rain sensor (2021+ Autopilot camera)' },
      { action: 'Heated washer nozzle delete on markets with >0°C average winter (replace with fluid additive spec)', saving: '€8-15/vehicle heated nozzle delete on APAC/MENA market specifications', conf: 'estimated', bench: 'Toyota Land Cruiser regional specification — climate-based content deletion' },
    ],
  },
];

export const EXTERIOR_TRENDS: ExteriorTrend[] = [
  { id: 'aero-optimisation', title: 'Aerodynamic Drag Reduction for BEV Range', description: 'Cd reduction is the primary BEV range lever. Active aero grille shutters, underbody panels, flush door handles, aero wheels targeting Cd ≤0.20. Each 0.01 Cd saving adds ~3-5km range.', status: 'Mainstream', impact: 'Cd 0.22 → 0.19: +15km WLTP range. €35-65/vehicle aero content investment.' },
  { id: 'matrix-led', title: 'Matrix/Pixel LED Headlights (Glare-Free High Beam)', description: 'ADB Matrix LED (84-128 pixels) providing glare-free high beam — Euro NCAP 2026 ADAS assessment. ZKW/Marelli/Hella all offering pixel modules. Cost declining 8-12%/yr.', status: 'Mainstream', impact: 'ADB Matrix cost: €220-380/unit. NCAP 2026 advanced lighting gives +1.5 star in ADAS score.' },
  { id: 'camera-mirrors', title: 'Camera-Based Wing Mirrors (CSMS)', description: 'Camera Surround Monitor System replacing physical wing mirrors: EU type-approval from 2024. Cd improvement 0.005-0.010. Lexus ES, Honda e, Audi e-tron deployed. €280-400 premium.', status: 'Emerging', impact: 'Cd improvement worth 8-15km BEV range. Mirror-to-camera cost: net €180-300 premium on BEV.' },
  { id: 'flush-handles', title: 'Flush Retractable Door Handles', description: 'Electric flush door handles (retracted position) improve Cd by 0.002-0.005 and are a design signature. Standard on Tesla, Polestar, Lucid, Rimac. Power mechanism adds complexity.', status: 'Mainstream', impact: 'Door handle cost: conventional €18-28 vs flush €45-75. Net Cd/range gain partially offsets premium.' },
  { id: 'led-signature', title: 'Full-LED Signature Lighting as Brand Differentiator', description: 'Brand-signature LED DRL evolving into full-light language strategy: day, night, welcome animations. Software-defined lighting (OTA updates) replacing physical programming. Standard from C-segment.', status: 'Mainstream', impact: 'LED DRL system: €35-65/unit. Software animation: €0 marginal. Brand equity value high.' },
  { id: 'eu7-gpf', title: 'EU7 Brake Dust Filters (BDPF)', description: 'EU7 mandates brake dust particle filter from 2027 (4 mg/km PN limit). €15-25/wheel added content. ITELMA/Mann+Hummel suppliers qualifying. Electric park brake integration requirement.', status: 'Emerging', impact: 'Mandatory 2027 EU LD vehicles. Cost: €60-100/vehicle (4 wheels). Offset by disc right-sizing on BEV.' },
];

export const EXTERIOR_COST_STRUCTURE = [
  { name: 'Glazing & Sunroof', value: 28, color: '#eab308' },
  { name: 'Bumper Systems', value: 22, color: '#f59e0b' },
  { name: 'Lighting', value: 25, color: '#f97316' },
  { name: 'Mirrors', value: 10, color: '#ef4444' },
  { name: 'Wipers & Washers', value: 8, color: '#ec4899' },
  { name: 'Seals & Weatherstrips', value: 7, color: '#a855f7' },
];

export function getTotalExteriorIdeas(): number {
  return EXTERIOR_COMPONENTS.reduce((sum, c) => sum + c.levers.length, 0);
}

export interface ExteriorMfgLever {
  id: string;
  name: string;
  description: string;
  saving: string;
  status: 'Mainstream' | 'Emerging' | 'Next-Gen';
}

export const EXTERIOR_MFG_LEVERS: ExteriorMfgLever[] = [
  { id: 'bumper-auto-transfer', name: 'Automated Bumper Fascia Transfer Moulding → Paint Line', description: 'Overhead conveyor robot (Dürr RoDip) transfers bumper fascia from injection moulding press directly to paint cell without manual handling. Eliminates: 2 manual transfers, 1 pallet rack, 4 min transit time. Surface contamination (airborne particle) rate reduced from 2.4 to 0.3 defects/m².', saving: '4 min transit; 87% surface defect reduction in painting', status: 'Mainstream' as const },
  { id: 'glass-robot-prime', name: 'Robotic Glass Bonding Primer + PU Bead Application', description: 'Fanuc M-710iD robot applies primer (Sika 205 A+B, 15 s flash-off window, ±0.5 mm bead width) then PU bead (Sika 552 AT, 6-9 mm cross-section ±0.3 mm) in one continuous robot path. Replaces 2 manual operators. Bead geometry: 100% inline laser profile check. Watertest pass rate: 99.8%.', saving: '6 min glass-bond cycle; 99.8% watertest first-time pass', status: 'Mainstream' as const },
  { id: 'headlamp-flex-rig', name: 'Flexible Headlamp PCB Test Rig (Multi-Model Tooling)', description: 'Common headlamp EOL bench with model-changeable fixture (RFID-identified, 90 s changeover) tests LED forward current, photometric output (0.1 lux resolution), function each circuit (DRL / position / indicator / main). Tests 4 models on 1 bench vs 4 dedicated benches. OEE: 91%.', saving: '3 benches capital deleted (€240K); 91% OEE vs 71% dedicated', status: 'Mainstream' as const },
  { id: 'headlamp-auto-aim', name: 'Robot Headlamp Installation + Automatic Optical Aim Check', description: 'ABB IRB 6700 robot installs headlamp assembly onto body (3 M8 fasteners + 1 electrical connector), then automated photometric screen (3 m distance, ISO 10604) verifies beam cut-off position ±0.1°. Replaces manual installation (4 min) + manual aim adjustment (2 min) using spirit level.', saving: '6 min per headlamp pair; ±0.1° aim accuracy vs ±0.5° manual', status: 'Emerging' as const },
  { id: 'drl-eol-photo', name: 'DRL LED Automated Photometric EOL Test (Zero Manual Adjustment)', description: 'Inline photometric goniophotometer (Radiant Vision Systems ProMetric Y29) at body-line end measures DRL luminous intensity (CCT, CRI, lux at 10 m) per channel at 100% — replaces manual aim screw adjustment (3 min/vehicle) + 5% sample photometric check.', saving: '3 min/vehicle DRL adjustment eliminated; 100% coverage', status: 'Emerging' as const },
  { id: 'washer-nozzle-common', name: 'Common Washer Nozzle Injection Tool Across 3 Models', description: 'Single injection tool (8-cavity) for PP washer nozzle body serves 3 vehicle models via interchangeable jet inserts (45°/60°/90° spray angle). Tool: €85K vs 3 model-specific tools at €210K. Volume pooling (3 models, 240K units/yr): PP compound cost −5%.', saving: '€125K tooling NRC; 5% material cost saving from volume', status: 'Mainstream' as const },
  { id: 'spoiler-bond-robot', name: 'Automated Spoiler Bonding + Alignment (Robot-Held Jig)', description: 'KUKA KR 20 robot holds spoiler in laser-surveyed alignment position (±0.2 mm relative to body datum) while 3M 5310 urethane adhesive cures (15-min fixture hold vs 2 h tooled jig). Vision confirms spoiler position before adhesive application. Adhesive bead: 8 mm ±0.5 mm.', saving: '1.75 h fixture time saved; ±0.2 mm vs ±1.5 mm manual alignment', status: 'Emerging' as const },
  { id: 'badge-vision-robot', name: 'Vision-Guided Robotic Badge + Emblem Placement', description: 'Cognex In-Sight 9000 locates badge datum (body pressing datum in rear quarter), robot picks badge from tape-dispenser jig and places to ±0.3 mm. Replaces operator template + hand-press (4 min). Adhesion verified by pull-check sensor at 25 N release. Error rate: 0.02% vs 0.8% manual.', saving: '4 min badge application; 0.02% vs 0.8% placement error', status: 'Mainstream' as const },
  { id: 'exterior-flex-paint', name: 'Flexible Exterior Panel Paint Stand (SUV + Sedan on Same Line)', description: 'Adjustable height paint stand (Dürr EcoRodip V) accommodates SUV (1,720 mm height) and sedan (1,440 mm) body profiles on same paint conveyor with ±150 mm height servo adjustment. Eliminates 2 separate paint lines. Booth changeover: automatic, 0 minutes (concurrent production).', saving: 'Delete 1 paint line (€8M capital); concurrent body types', status: 'Mainstream' as const },
  { id: 'mirror-sub-assembly', name: 'Automated Door Mirror Sub-Assembly (Fold + Actuator)', description: 'Automated mirror cell: actuator press-fit (14 N·m torque), wiring connector clip-in (force-monitored, 25 N insertion), fold mechanism functional test (3 cycles, ±0.3° position). 1 operator cell previously requiring 3 operators. Cycle time: 55 s vs 3 × 45 s.', saving: '2 operators; 80 s cycle time; 100% fold function verified', status: 'Mainstream' as const },
  { id: 'mirror-cap-common', name: 'Common Outer Mirror Cap Injection Mould (Skin-Change Only)', description: 'Mirror cap outer skin is model-unique; structural carrier is platform-common. Cavity insert change (skin geometry only, 45 min tool changeover) vs full tool change (4 h). Common carrier tool €90K vs 3 model-specific tools €240K. Volume: 3 models, 280K units/yr.', saving: '€150K tooling NRC; 45 min changeover vs 4 h', status: 'Mainstream' as const },
  { id: 'water-leak-auto', name: 'Automated 120-Nozzle Water-Leak Test (Robot Spray Pattern)', description: 'Robot-mounted spray nozzle array (120 nozzles, 8 bar, 15 L/min, CECO equipment) tests full body water ingress in 3 min vs 8 min conventional walk-around spray. Pressure and flow monitored per zone. Interior moisture detected via 8-point resistance sensor array. First-time pass rate: 98.4%.', saving: '5 min test time; 8-point interior moisture validation', status: 'Mainstream' as const },
  { id: 'tail-lamp-heat-eol', name: 'Tail Lamp Heated Element EOL Test (100% Inline)', description: 'Inline IR thermography (FLIR A70, ±0.5°C) tests tail lamp heated element (rear screen heater function) by energising at 13.5V, scanning surface temperature uniformity within 45 s. Replaces downstream warranty claim process. Detects: broken trace, poor connection. Catch rate: 100% vs field return.', saving: '100% heated-element quality; delete downstream warranty field returns', status: 'Mainstream' as const },
  { id: 'gap-flush-ai', name: 'AI Vision Gap-and-Flush Measurement at Body + Trim Assembly', description: 'Perceptron/Hexagon automated gap-and-flush measurement system (24-point scan per vehicle, laser triangulation ±0.05 mm) at BIW + trim assembly stations. Real-time SPC feedback to body framing robot. Reduces gap/flush customer complaints from 2.1% to 0.4% fleet.', saving: '0.4% vs 2.1% gap/flush complaints; real-time SPC feedback', status: 'Mainstream' as const },
  { id: 'active-aero-eol', name: 'Active Aero Shutter + Grille Function EOL Test (Zero Manual)', description: 'Automated end-of-line active grille shutter test (Röchling / Delphi AGS): ECU command cycle (open/close 3×), actuator position ±0.5° verification via resolver, aero drag delta <0.002 Cd confirmation via downstream fan tunnel. Replaces manual actuator inspection (2 min + visual). Cycle: 45 s.', saving: '2 min manual inspection deleted; resolver position verified 100%', status: 'Emerging' as const },
];

export const EXTERIOR_OEM_BENCHMARKS = [
  { oem: 'Tesla', model: 'Model 3 / Model Y / Cybertruck', moves: ['Flush electric door handles (Model 3/Y): delete conventional handle mechanism — present position sensor triggers motor at 0.5 N touch, saves €8/vehicle vs conventional handle mechanism weight', 'Camera mirror (Cybertruck, EU approval 2024): CSMS camera replaces wing mirrors — Cd improvement 0.006, equivalent to +12 km WLTP range on RWD', 'One-piece front/rear bumper fascia (Model 3 Highland): single large PP-EPDM injection, delete 6 clip-on sensor bracket inserts — integrated parking sensor boss moulded into fascia', 'Active underbody aero panels (Model Y Long Range): front undertray + mid undertray + rear diffuser sealed to body — Cd 0.208 vs 0.220 without panels'] },
  { oem: 'Porsche', model: 'Cayenne E3 Facelift / Taycan / 911 GT3 RS', moves: ['4-LED DRL signature (Cayenne E3): 4 LEDs + 1 PCB replaces 12 LEDs + 3 PCBs — €18/headlamp saving + 2.4 min assembly saving per vehicle', 'OLED rear cluster (Taycan/Panamera): 6-tile OLEDWorks flat panel, 22 mm housing depth vs 95 mm LED cluster — 0.8 kg/pair lighter, tooling saving €420K', 'Active aero wing (GT3 RS): 4-position carbon DRS wing replaces fixed element — aerodynamic downforce control via ECU from ADAS lateral g-sensor', 'CFRP bonnet + bootlid (911 GT3): dry carbon compression-moulded — 4.2 kg bonnet saving, enables 52:48 weight distribution target'] },
  { oem: 'BMW', model: 'i7 G70 / iX / M4 G82', moves: ['Laserlight headlamp (i7/iX): 1 GaN laser module replaces 3 high-beam LED modules — 600 m range vs 300 m, housing 65 mm vs 180 mm wide', 'Thor\'s Hammer LED bar (i7 standard): full LED horizontal DRL + position lamp on single injection-moulded PMMA lightguide — delete 12 individual LED positions', 'Active kidney grille shutters (standard on iX): 9 slats, Brose actuator, close at >70 km/h — ΔCd −0.008 = +9 km BEV range', 'Flush mirror base with camera assist: mirror stalk integrates PDC corner-zone camera (1080p) — delete separate corner radar unit'] },
  { oem: 'Range Rover', model: 'L460 / Velar / Defender L663', moves: ['e-Latch flush door handles (L460 standard): electric release replaces mechanical rod linkage — Cd −0.003 from flush position, saves 0.4 kg door handle assembly per door', '2 mm Al DRL extrusion (Velar): extruded 6063-T5 Al profile acts as heat sink + structural mount — replaces injection-moulded ABS housing, tooling saving €102K', 'Camera wing mirrors (L460 optional): CSMS mirrors type-approved in EU 2024 — mirror-to-camera saves 0.8 kg/side, Cd improvement 0.004', 'Acoustic triple-pane side glass (L460): AGC acoustic PVB reduces A-weighted wind noise 2 dB without added NVH barrier mat — net 0.9 kg lighter per vehicle'] },
  { oem: 'NIO', model: 'ET5 / ET7 / ES6 NT2.0', moves: ['11-in-1 LED headlamp module (ET7 NT2.0): single Marelli module integrates DRL + low + high beam — replace 3 assemblies, save €43/vehicle pair + 8.3 min assembly', 'Electrochromic panoramic roof (ES8): PDLC smart glass replaces solar film + roller shade — 1.2 kg lighter, delete shade motor + guide rail (€80/vehicle saving)', 'Full-matrix 1024-pixel LED headlamp (ET9): pixel row masking for digital beam aim — delete mechanical aim screw (€22 + 3.2 min factory)', 'Single-mirror base camera integration (ET9 side cameras): B-pillar camera replaces door wing mirror at door aperture — Cd −0.005, view shown on door OLED sill display'] },
  { oem: 'Xiaomi / Xpeng', model: 'Xiaomi SU7 / Xpeng X9 / G6', moves: ['Xiaomi SU7 electrochromic PDLC roof: polymer PDLC replaces laminated glass sunblind — 1.4 kg saving, delete shade motor + rail (€79/vehicle), VLT 74%→3% in 100 ms', 'Xpeng X9 OLED interactive rear lamp: 0.5 mm capacitive OLED panel replaces LED cluster + infotainment display ECU — €49/vehicle net saving', 'Xpeng G6 mono-material PP front bumper fascia: single-grade PP-EPDM fascia with integral energy absorber ribs — delete separate EPP energy absorber (1 part, 0.4 kg, €14)', 'Xiaomi SU7 software headlamp levelling: pixel row masking replaces mechanical aim actuator — €22/vehicle hardware saving + 3.2 min factory time'] },
];
