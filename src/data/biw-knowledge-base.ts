export interface BiwLever {
  t: string;
  save: string;
  bench: string;
  bodyStyles: ('hatchback' | 'sedan' | 'suv' | 'coupe' | 'pickup' | 'mpv' | 'crossover' | 'universal')[];
  conf: 'verified' | 'benchmarked' | 'estimated' | 'theoretical';
  note: string;
}

export interface BiwComponent {
  id: string;
  name: string;
  subassembly: string;
  baseline: string;
  levers: BiwLever[];
  trends: string;
}

export interface BiwMfgLever {
  t: string;
  save: string;
  process: string;
  note: string;
}

export interface BiwTrend {
  t: string;
  status: 'Mainstream' | 'Emerging' | 'Next-Gen' | 'Declining';
  save: string;
  dir: string;
}

export const BIW_COMPONENTS: BiwComponent[] = [
  {
    id: 'crash-structure',
    name: 'Front Crash Structure',
    subassembly: 'Front End Module (FEM)',
    baseline: 'Stamped AHSS rails + separate crash cans + roll-formed bumper beam',
    trends: 'Al extrusion crash cans standard at D-segment+. Tailor-welded blank rails eliminating inner reinforcements. NCAP 2026 mobile progressive deformable barrier (MPDB) tightening energy management requirements.',
    levers: [
      { t: 'Roll-formed AHSS DP1200 bumper beam', save: '25-35%', bench: 'Honda CR-V, Toyota RAV4', bodyStyles: ['suv','crossover','sedan','hatchback','universal'], conf: 'verified', note: 'Replaces stamped + cast bracket assembly, 1 part vs 4, same or better ODB performance' },
      { t: 'Al extrusion crash can (symmetric L/R)', save: '35-45% mass', bench: 'BMW 5 Series, Audi A6', bodyStyles: ['sedan','suv','coupe','universal'], conf: 'verified', note: 'At 800K+ units/yr cost-neutral to steel, 40% lighter. L/R symmetry halves tooling cost' },
      { t: 'Tailor-welded blank (TWB) front rail', save: '10-15%', bench: 'VW MQB A0, Hyundai K3', bodyStyles: ['hatchback','sedan','crossover','universal'], conf: 'benchmarked', note: 'Eliminates inner reinforcement pressing via graded TWB — single part replaces 2' },
      { t: 'PHS (22MnB5) roll-formed crash box', save: '18-22% mass', bench: 'BMW 5 Series Gen7', bodyStyles: ['sedan','suv','coupe','universal'], conf: 'benchmarked', note: 'Higher intrusion resistance vs DP980 stamped, thinner gauge possible' },
      { t: 'Commonise crash can geometry L/R', save: '5-8% piece cost', bench: 'Ford Puma, Volkswagen', bodyStyles: ['universal'], conf: 'verified', note: 'Single symmetric design — halves tooling investment and call-off SKU count' },
    ],
  },
  {
    id: 'pillars',
    name: 'A/B/C-Pillar Structure',
    subassembly: 'Upper Body Structure',
    baseline: 'B-pillar: 2-part stamped DP780+DP980 hat sections. A-pillar: TWB inner + outer pressing.',
    trends: 'Hot-formed B-pillars (PHS via progressive/transfer die) standard on C-segment+. Tailor-rolled blanks enabling variable thickness in single hot-stamped part. Euro NCAP 2026 MDB side intrusion now dominant design driver.',
    levers: [
      { t: 'Hot-stamped roll-formed B-pillar (1200-1500 MPa)', save: '20-35% mass', bench: 'VW Golf Mk8, Hyundai Ioniq 6', bodyStyles: ['sedan','hatchback','suv','coupe','universal'], conf: 'verified', note: 'Delete 2-part hat-section assembly → single hot-formed part. Tool + weld ops reduced' },
      { t: 'Tailor-rolled blank (TRB) B-pillar', save: '5-10% over TWB', bench: 'BMW 3 Series G20', bodyStyles: ['sedan','coupe','universal'], conf: 'benchmarked', note: 'Variable thickness in 1 part without weld lines — delete inner reinforcement section' },
      { t: 'TWB A-pillar inner: delete inner reinforcement', save: '8-12%', bench: 'Hyundai Tucson, Ford Focus', bodyStyles: ['universal'], conf: 'verified', note: 'Graded TWB provides strong base/thin top — eliminates separate reinforcement pressing' },
      { t: 'Grade right-size C/D pillar (TRIP vs PHS)', save: '12-18%', bench: 'JLR I-Pace, Skoda Octavia', bodyStyles: ['hatchback','sedan','coupe','universal'], conf: 'estimated', note: 'C-pillar carries lower crash load — TRIP/TWIP viable, 10-18% cost saving vs over-specified PHS' },
      { t: 'Common PHS grade across A/B/C pillars', save: '5-8% material overhead', bench: 'Toyota TNGA-K', bodyStyles: ['universal'], conf: 'benchmarked', note: 'Single PHS grade: 1 HTS die pool, 1 material call-off, higher annual volume on same press' },
    ],
  },
  {
    id: 'sill-floor',
    name: 'Sill / Rocker & Floor Pan',
    subassembly: 'Lower Body Structure',
    baseline: 'Sill: 3-part stamped hat-section assembly. Floor: separate front/rear/tunnel panels.',
    trends: 'BEV platforms: Al extrusion sill integrating battery side-protection. Floor tunnel constraint removed on BEV → simpler 2-zone floor. CTP packs enabling floor structure deletion.',
    levers: [
      { t: 'Roll-formed closed-section sill (DP1200/UHSS)', save: '1 part vs 3', bench: 'BMW G30, Volvo S90', bodyStyles: ['sedan','suv','coupe','universal'], conf: 'verified', note: 'Single roll-formed closed section replaces inner+outer+reinforcement, eliminates 250+ spot welds' },
      { t: 'Al extrusion sill on BEV (FMVSS214 / NCAP side-pole)', save: '30-40% mass', bench: 'Tesla Model Y, BMW iX', bodyStyles: ['suv','sedan','hatchback','crossover'], conf: 'verified', note: 'Extrusion doubles as battery side-protection rail, BEV-specific architecture' },
      { t: 'Stamp floor + tunnel from single TWB', save: '2 parts deleted', bench: 'Toyota TNGA-GA, Suzuki Swift', bodyStyles: ['hatchback','sedan','mpv','universal'], conf: 'benchmarked', note: 'Single tailor-welded pressing combining front floor + tunnel — deletes junction weld flange' },
      { t: 'Gauge right-size outer floor panels (non-loaded)', save: '8-12% floor steel', bench: 'Renault Clio, VW Polo', bodyStyles: ['hatchback','sedan','mpv','universal'], conf: 'estimated', note: 'Topology shows 0.65mm sufficient for acoustic panels — remove 15-20% over-spec gauge' },
      { t: 'Commonise floor crossmember section across platform', save: '5-8% tooling amortisation', bench: 'Stellantis STLA Medium', bodyStyles: ['universal'], conf: 'benchmarked', note: 'Common C-channel crossmember section across 3-4 models: shared roll-tool, volume pricing' },
    ],
  },
  {
    id: 'closures',
    name: 'Doors / Hood / Tailgate',
    subassembly: 'Closures — Doors, Hood, Tailgate',
    baseline: 'Steel door skins 0.75mm CQ. Steel hood with inner frame. Steel liftgate with reinforcement.',
    trends: 'Al door outers standard from D-segment (cost vs benefit positive above 150K units/yr). Composite tailgates mainstream on D/E-segment. Full Al closures on BEV improving cost case as Al price stabilises.',
    levers: [
      { t: 'Al outer door skin (all 4 doors)', save: '40-50% door mass', bench: 'BMW 3 Series, Jaguar XE, Audi A4', bodyStyles: ['sedan','coupe','universal'], conf: 'verified', note: '2.8→1.1 kg/door. Pedestrian protection improvement. Cost neutral >150K/yr. Requires hem/adhesive bond' },
      { t: 'Single-part hemmed door panel (adhesive+RSW)', save: '2-3 parts deleted', bench: 'Ford Fiesta, VW Polo', bodyStyles: ['hatchback','sedan','universal'], conf: 'verified', note: 'Weld-bonded hem eliminates separate inner flange reinforcement and reduces sealer length' },
      { t: 'Al hood outer + Al inner frame', save: '50-60% hood mass', bench: 'Toyota Land Cruiser 300, Range Rover L460', bodyStyles: ['suv','pickup','universal'], conf: 'verified', note: 'Essential for Euro NCAP 2024 pedestrian head-impact — enables thinner bonnet cross-section' },
      { t: 'Composite liftgate (SMC outer + GMT inner)', save: '40-45% tailgate mass', bench: 'BMW X5 G05, Land Rover Defender L663', bodyStyles: ['suv','mpv','crossover'], conf: 'verified', note: 'No corrosion, 40% lighter, enables powered tailgate at lower actuator cost' },
      { t: 'Standardise door hinge across platform (common geometry)', save: '5-8% hinge cost', bench: 'Stellantis STLA Medium', bodyStyles: ['universal'], conf: 'estimated', note: 'Common hinge bolt pattern and pivot geometry — shared tooling, volume pricing with Tier-2' },
    ],
  },
  {
    id: 'roof-structure',
    name: 'Roof Panel & Bows',
    subassembly: 'Upper Body Structure',
    baseline: 'Mild steel roof outer (0.7mm). 3 pressed steel roof bows. Steel roof rails.',
    trends: 'Panoramic roof structural adhesive bonding becoming load-bearing — enabling bow deletion. CFRP fixed roof on performance models. Al roof for premium BEV weight-budget management.',
    levers: [
      { t: 'Reduce roof bow count: 3→2 with optimised cross-section', save: '1 part + tooling', bench: 'Mazda CX-60, Kia EV6', bodyStyles: ['sedan','suv','coupe','crossover','universal'], conf: 'benchmarked', note: 'Topology optimisation shows 2 bows sufficient with structural adhesive bonding of roof skin' },
      { t: 'Panoramic glass structural bonding (delete reinforcement bows)', save: '2-3 bows deleted', bench: 'BMW iX, Mercedes EQS', bodyStyles: ['sedan','suv','coupe','mpv'], conf: 'estimated', note: 'Glass-bonded panoramic surround acts as structural element — careful NCAP roof-crush validation required' },
      { t: 'Al roof outer skin (weight-budget BEV)', save: '35-45% roof mass', bench: 'BMW i7, Audi Q8 e-tron', bodyStyles: ['sedan','suv','coupe','universal'], conf: 'benchmarked', note: 'Lowers CG, reduces total BEV weight. Cost premium £15-26 offset by battery savings on range model' },
      { t: 'CFRP fixed roof panel (performance)', save: '50-60% roof mass', bench: 'BMW M4, Porsche 718', bodyStyles: ['coupe','sedan'], conf: 'verified', note: 'Lowers CG for performance, premium segment. Delete bows entirely with monocoque CFRP roof' },
      { t: 'Grade right-size: HSLA220 → mild DC04 outer roof', save: '5-8%', bench: 'VW Group (general)', bodyStyles: ['universal'], conf: 'estimated', note: 'Roof outer not a structural load path — 0.65mm DC04 sufficient for Class A surface quality' },
    ],
  },
  {
    id: 'rear-structure',
    name: 'Rear End Structure',
    subassembly: 'Rear End Structure',
    baseline: '3-part stamped rear floor. Steel rear rails. Steel rear bumper beam.',
    trends: 'BEV platforms eliminate spare wheel recess. Hot-stamped rear floor (1 press vs 3) becoming standard. Al rear bumper beam extrusion standard on premium BEV.',
    levers: [
      { t: 'Hot-stamped rear floor (1 pressing vs 3 panels)', save: '15-20% mass, 250+ welds deleted', bench: 'BMW G30 5 Series, Audi A4 B9', bodyStyles: ['sedan','coupe','universal'], conf: 'verified', note: 'Single hot-formed floor pan eliminates intermediate spot welds and assembly stages' },
      { t: 'Al rear bumper beam extrusion', save: '45-50% mass', bench: 'Audi Q5, BMW X3 G01', bodyStyles: ['suv','sedan','crossover','universal'], conf: 'verified', note: 'Al extrusion meets RCAR/IIHS low-speed impact at lower mass. Crash cans integral or bolted' },
      { t: 'Delete spare wheel recess on BEV (flat load floor)', save: '1 pressing + tooling', bench: 'Tesla Model 3/Y, Hyundai Ioniq 5', bodyStyles: ['sedan','suv','hatchback','crossover'], conf: 'verified', note: 'BEV flat floor enables deletion of spare tyre recess — carry compressed tyre repair kit instead' },
      { t: 'Al HPDC rear subframe (>80K/yr)', save: '25-35% subframe mass', bench: 'BMW G01 X3, Mercedes W213', bodyStyles: ['sedan','suv','coupe','crossover','universal'], conf: 'benchmarked', note: 'Al cast cradle at high volume: similar cost to welded steel, 30% lighter, better dimensional accuracy' },
      { t: 'Commonise rear wheelhouse inner (L/R symmetric)', save: '50% tooling for wheelhouse', bench: 'Renault Megane E-Tech', bodyStyles: ['hatchback','sedan','universal'], conf: 'estimated', note: 'Symmetric inner arch pressing — one die set for both L and R, reduces BIW tooling investment' },
    ],
  },
  {
    id: 'reinforcements',
    name: 'Reinforcements & NVH',
    subassembly: 'Reinforcements & NVH Treatments',
    baseline: 'Multiple steel reinforcement stampings. Bitumen acoustic pads. Seam sealers around full perimeter.',
    trends: 'Structural foam replacing discrete reinforcements. Topology-optimised NVH treatment positioning reducing pad area. Weld-bonding enabling sealer reduction.',
    levers: [
      { t: 'Structural foam cavity fill (Sika/Dow): replace 3 discrete reinforcements', save: '3 parts deleted', bench: 'BMW G11 7 Series, Land Rover', bodyStyles: ['universal'], conf: 'verified', note: 'Pillar/sill foam fill delivers NVH + stiffness target, deletes 3 separate steel bracketing' },
      { t: 'Optimise acoustic pad area by 20-25% via position mapping', save: '15-20% pad cost', bench: 'Nissan internal process', bodyStyles: ['universal'], conf: 'estimated', note: 'OEM acoustic data shows 80% benefit from 60% of pad area — remove low-ROI peripheral pads' },
      { t: 'Flow-drill screws replace T-nuts in floor attachment', save: '1 press + 1 op per joint', bench: 'VW MQB platform', bodyStyles: ['universal'], conf: 'verified', note: 'FDS eliminates nut insertion op and T-nut tool investment — equivalent clamping load' },
      { t: 'Delete crash sensor bracket: integrate into subframe casting boss', save: '1 part per corner', bench: 'BMW F20, Porsche 992', bodyStyles: ['universal'], conf: 'benchmarked', note: 'Cast sensor boss in Al subframe or strut tower — eliminates stamped bracket + 4 weld nuts' },
      { t: 'Weld bonding (adhesive + spot weld): reduce seam sealer length 25%', save: '5-8% sealer/NVH', bench: 'Volvo, BMW (Henkel Teroson)', bodyStyles: ['universal'], conf: 'benchmarked', note: 'Structural adhesive between flanges provides NVH benefit, allows sealer length reduction' },
    ],
  },
];

export const BIW_MFG_LEVERS: BiwMfgLever[] = [
  { t: 'Laser tailored blanks (TWB) in-press welding', save: '15-25% assembly ops', process: 'Laser Weld', note: 'Pre-weld blanks before forming — eliminates post-press weld ops and separate reinforcement parts' },
  { t: 'Progressive die hot-stamping (PHS) for pillars', save: '20-30% cycle time vs transfer', process: 'Hot Stamp', note: 'Progressive PHS tooling for B-pillars achieves cycle time parity with cold stamping at volume' },
  { t: 'Roll forming for sills, rails, roof rails', save: '25-35% vs stamping', process: 'Roll Form', note: 'Continuous roll-formed closed sections: higher yield, better dimensional, 1 tool vs 4+ dies' },
  { t: 'Robotic laser welding of closures (hood, door)', save: '20-30% vs MIG/CO2', process: 'Laser Weld', note: 'Laser weld Al closures: narrow HAZ, no distortion, faster cycle, better surface quality' },
  { t: 'Self-piercing rivets (SPR) for multi-material joints', save: '10-15% vs RSW+adhesive', process: 'SPR', note: 'SPR joins mixed materials (steel/Al) reliably, replaces separate drill-and-rivet operation' },
  { t: 'Structural adhesive bonding (weld-bonding)', save: '15-25% spot weld count', process: 'Adhesive', note: 'Henkel/Dow structural adhesive between flanges: 30% torsional stiffness gain, lower weld count' },
  { t: 'Inline quality vision + AI part tracking', save: '20-35% rework cost', process: 'Quality', note: 'Camera-based 100% dimensional check post-stamp: catch problems before assembly, reduce scrap' },
  { t: 'Combine BIW and closures line (flexible cells)', save: '10-20% floor space/capital', process: 'Layout', note: 'Flexible robotic cells handle both BIW subassemblies and closures hemming — reduces capital by sharing' },
  { t: 'Blanking laser nesting software (scrap optimisation)', save: '5-10% material yield', process: 'Yield', note: 'AI nesting for stamping blanks: reduce coil scrap from 28% → 20% on complex BIW shapes' },
  { t: 'HPDC Al component casting replacing assemblies', save: '3-5 parts → 1', process: 'HPDC', note: 'Al HPDC strut towers, subframe nodes: eliminate welded assemblies — Tesla gigacasting proven' },
];

export const BIW_TRENDS: BiwTrend[] = [
  { t: 'Gigacasting (large-format Al HPDC)', status: 'Emerging', save: '30-50% part count', dir: 'Tesla rear-underbody in 1 shot. NIO, Volvo, Toyota adopting. Eliminates 80+ parts. Requires £43-85M press investment. Now proven viable at 200K+/yr.' },
  { t: 'Multi-material BIW (steel-Al hybrid)', status: 'Mainstream', save: '10-18% total BIW mass', dir: 'Al closures + roof + inner panels with steel structure. BMW CLAR, JLR MLA. Best mass/cost balance for premium. Full Al still confined to ultra-premium (Jaguar XJ, Bentley).' },
  { t: 'Structural adhesive bonding (weld-bonding)', status: 'Mainstream', save: '15-25% spot weld ops', dir: 'Henkel/Sika/Dow weld-bonding on flanges: 30% torsional rigidity improvement while reducing spot weld count. Standard on BMW/Audi/VW from 2020.' },
  { t: 'Tailor-rolled blanks (TRB) for hot-stamping', status: 'Emerging', save: '8-15% vs TWB', dir: 'ThyssenKrupp/Salzgitter TRB: continuous variable thickness without weld lines. Better fatigue, cleaner forming. BMW G20/G30 B-pillar. Spreading to VW/Hyundai.' },
  { t: 'Hot-stamping (PHS) for ultra-high strength parts', status: 'Mainstream', save: '20-35% mass on crash parts', dir: 'PHS (22MnB5) now standard for B-pillars, front/rear rails, sill reinforcements. 1500-2000 MPa. Enables gauge reduction impossible with cold-formed DP/AHSS.' },
  { t: 'Roll-formed closed-section structural members', status: 'Mainstream', save: '25-35% vs stamped', dir: 'Sill beams, crash rails, roof rails increasingly roll-formed: better consistency, less tooling, continuous sections possible. Dominating premium BEV sill design.' },
  { t: 'Composite tailgates (SMC/GFR-PP)', status: 'Mainstream', save: '40-45% tailgate mass', dir: 'BMW, Volvo, Land Rover: SMC outer + GMT/GFR-PP inner. Zero corrosion, lighter, no paint adhesion issues. Cost competitive at >60K/yr on D-segment+.' },
  { t: 'Structural floor pack (CTB / Cell-to-Body)', status: 'Emerging', save: 'Delete floor structure layer', dir: 'BYD Ocean Platform, Tesla Model Y: battery pack IS the floor. Pack tray provides torsional stiffness. Eliminates separate BIW floor cross-members. 10-15% total vehicle cost saving.' },
  { t: 'Euro NCAP 2026: MPDB + full-width frontal', status: 'Mainstream', save: 'Design constraint', dir: 'New mobile progressive deformable barrier (MPDB) test from 2026 requires new crash energy management. Aluminium progressive crash systems gaining compliance advantage over steel.' },
];

export const BIW_OEM_BENCHMARKS = [
  { oem: 'Tesla', model: 'Model Y (2023 Highland)', moves: ['Rear gigacasting: 1 Al HPDC part replaces 171 stamped parts', 'Front structural casting integrates subframe + strut tower', '4680 CTB (cell-to-body): battery IS the floor structure', 'Al extrusion sill for side-pole protection'] },
  { oem: 'BMW', model: 'i7 G70 / 5 Series G60', moves: ['CLAR architecture: steel structure + Al closures + Al roof', 'B-pillar: tailor-rolled blank (TRB) hot-stamped, 2 parts → 1', 'Structural foam in all 4 pillars standard: delete 4 bracketing parts', 'Roll-formed sill (2 parts → 1 closed section)'] },
  { oem: 'Hyundai/Kia', model: 'IRA-based platforms (Ioniq 5/6, EV6)', moves: ['Hot-formed B-pillar: PHS progressive die, 1500 MPa', 'CTBA rear → multi-link: packaging for eDifferential', 'Panoramic roof structural bonding: delete 1 bow', 'Al HPDC strut towers standard on GN (Ioniq 5)'] },
  { oem: 'NIO', model: 'NIO NT3 / ET9', moves: ['Composite panoramic roof + structural bonding: delete 2 bows', 'Al extrusion sill integrated with battery enclosure', 'Hot-stamped rear floor: 1 press vs 3', 'CTB (cell-to-body) on NT3 platform'] },
  { oem: 'BYD', model: 'Ocean e-Platform 3.0', moves: ['Blade LFP pack as structural floor (CTB)', 'Hot-formed B-pillar with TRB grade optimization', 'Al HPDC front subframe cradle', 'Composite liftgate on Seal/Sea-Lion range'] },
];

export const BIW_COST_STRUCTURE = [
  { name: 'Structure/Rails', share: 25, color: '#6366f1' },
  { name: 'Closures', share: 22, color: '#8b5cf6' },
  { name: 'Pillars', share: 18, color: '#a855f7' },
  { name: 'Floor/Sill', share: 15, color: '#7c3aed' },
  { name: 'Roof', share: 8, color: '#5b21b6' },
  { name: 'Reinforcements', share: 7, color: '#4c1d95' },
  { name: 'Seals/NVH', share: 5, color: '#3b0764' },
];

export function getTotalBiwIdeas(): number {
  return BIW_COMPONENTS.reduce((sum, c) => sum + c.levers.length, 0);
}
