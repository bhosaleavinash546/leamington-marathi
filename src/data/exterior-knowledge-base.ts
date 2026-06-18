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
