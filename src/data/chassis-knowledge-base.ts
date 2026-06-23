export interface ChassisLever {
  t: string;
  save: string;
  bench: string;
  bodyStyles: ('hatchback' | 'sedan' | 'suv' | 'coupe' | 'pickup' | 'mpv' | 'crossover' | 'universal')[];
  conf: 'verified' | 'benchmarked' | 'estimated' | 'theoretical';
  note: string;
}

export interface ChassisComponent {
  id: string;
  name: string;
  subassembly: string;
  baseline: string;
  levers: ChassisLever[];
  trends: string;
}

export interface ChassisTrend {
  t: string;
  status: 'Mainstream' | 'Emerging' | 'Next-Gen' | 'Declining';
  save: string;
  dir: string;
}

export const CHASSIS_COMPONENTS: ChassisComponent[] = [
  {
    id: 'front-suspension',
    name: 'Front Suspension System',
    subassembly: 'Front Suspension System',
    baseline: 'Double-wishbone with cast iron/steel arms. MacPherson strut on B/C-segment. Steel coil spring + twin-tube damper.',
    trends: 'Al HPDC knuckle + forged Al arms standard from C-segment+ on BEV. McPherson remains cost-optimal for B-segment. Spring/damper right-sizing needed post-BEV (unsprung mass redistribution).',
    levers: [
      { t: 'Al HPDC front knuckle vs cast iron/steel', save: '2-3 kg/corner, 15-25% cost saving', bench: 'BMW G20/G30, Audi B9 A4', bodyStyles: ['sedan','suv','coupe','crossover','universal'], conf: 'verified', note: 'Weight saving improves ride; cost premium offset at C-segment volume. ABS tone ring integration standard' },
      { t: 'Forged Al lower control arm (LCA)', save: '35-45% arm mass, similar cost at >100K', bench: 'Mercedes W213, Porsche Macan', bodyStyles: ['sedan','suv','coupe','crossover','universal'], conf: 'verified', note: 'Forged Al vs stamped AHSS: 40% lighter, better crash fold, integral ball joint housing' },
      { t: 'McPherson → double-wishbone base variant delete upper arm', save: '€35-60/corner', bench: 'Ford Focus ST, Peugeot 508', bodyStyles: ['hatchback','sedan','universal'], conf: 'benchmarked', note: 'On non-performance/non-SUV: delete upper A-arm, use standard McPherson — cost advantage outweighs dynamic' },
      { t: 'Hollow stabiliser bar (12mm wall vs solid)', save: '20-25% ARB mass', bench: 'Continental, ZF (OEM standard)', bodyStyles: ['universal'], conf: 'verified', note: 'Same NVH/roll stiffness. Standard on BMW/Audi since 2015. Drop-in replacement for solid bar' },
      { t: 'Standardise bushing compound across platform family', save: '8-12% bushing cost', bench: 'VW Group MQB/MLB', bodyStyles: ['universal'], conf: 'estimated', note: 'Common rubber compound shore hardness: single Tier-2 compound, volume pricing across 4+ models' },
    ],
  },
  {
    id: 'rear-suspension',
    name: 'Rear Suspension System',
    subassembly: 'Rear Suspension System',
    baseline: 'Multi-link with steel lateral links + trailing arm. CDC adaptive damping on mid/premium. Air spring optional.',
    trends: 'BEV rear axle redesigned for motor integration (eDifferential, rear motor). Multi-link deletion (CTBA) viable for sub-C BEV. Adaptive damping cost falling.',
    levers: [
      { t: 'Multi-link → CTBA (twist beam) for B/C-segment', save: '€150-250/axle', bench: 'VW Polo Mk6, Renault Clio V', bodyStyles: ['hatchback','crossover','mpv'], conf: 'verified', note: 'CTBA adequate for FWD sub-C. Saves lateral links + knuckle + subframe vs multi-link. NVH trade-off managed with bushing tuning' },
      { t: 'Al multi-link rear arms (forged/HPDC)', save: '30-40% arm mass', bench: 'BMW 5 Series G30, Audi A6 C8', bodyStyles: ['sedan','suv','coupe','crossover','universal'], conf: 'verified', note: 'Essential for BEV unsprung mass targets. Cost-neutral vs steel at >80K/yr. Better corrosion resistance' },
      { t: 'Delete adaptive (CDC) damping on base/mid trim', save: '€200-400/vehicle', bench: 'BMW 5 Series base, Audi A4 base', bodyStyles: ['sedan','suv','coupe','hatchback','crossover'], conf: 'verified', note: 'CDC only on Sport/M-Sport/S-Line trims — deletes actuator + ECU. Passive damper well-tuned suffices' },
      { t: 'Air spring → coil spring delete (non-load-levelling)', save: '€350-600/vehicle', bench: 'Land Rover Freelander vs Discovery', bodyStyles: ['suv','pickup','mpv'], conf: 'verified', note: 'Remove air spring on trim grades not requiring height adjust. Significant cost save; tuned coil spring ride parity possible' },
      { t: 'Delete rear-wheel steering (non-performance models)', save: '€180-280/vehicle', bench: 'BMW 7 Series base vs M760Li', bodyStyles: ['sedan','suv','coupe'], conf: 'benchmarked', note: 'RWS only justified on L-WB or performance — delete on standard WB variants. Electric actuator cost reduces as volume grows' },
    ],
  },
  {
    id: 'steering',
    name: 'Steering System',
    subassembly: 'Steering System',
    baseline: 'Rack-assist EPAS (REPS) on C-segment+. Column-assist (CEPS) on B-segment. Variable ratio rack standard.',
    trends: 'Steer-by-wire (SbW) arriving with Neue Klasse/BMW from 2025. Variable ratio rack now standard. EPS ECU integration into domain controller reducing cost.',
    levers: [
      { t: 'EPS motor right-size to vehicle class', save: '15-20% EPS cost', bench: 'ZF, Jtekt, JTEKTSE product lines', bodyStyles: ['hatchback','sedan','crossover'], conf: 'estimated', note: 'B-segment vehicles often fitted C-segment motor spec — right-size to actual steering effort and frequency' },
      { t: 'Standardise EPS rack across 2 platform families', save: '8-12% EPS unit cost', bench: 'VW MQB A0/A-shared rack', bodyStyles: ['universal'], conf: 'benchmarked', note: 'Common rack geometry on shared platforms: volume pricing with supplier, single homologation cycle' },
      { t: 'Delete 4-way electric column adjustment on base trim', save: '€45-80/vehicle', bench: 'Audi A3 base vs Sportback', bodyStyles: ['hatchback','sedan','suv','universal'], conf: 'verified', note: 'Manual reach/rake or 2-way electric sufficient for base — delete 2-axis motor + memory function' },
      { t: 'Integrate EPS ECU into vehicle domain controller', save: '€25-50 ECU cost', bench: 'Rivian R1T/R1S, BMW Neue Klasse', bodyStyles: ['universal'], conf: 'estimated', note: 'Centralised domain computing absorbs EPS function — delete standalone EPS ECU unit' },
      { t: 'Simplify tie rod: delete adjustable length (use fixed + shimmed)', save: '8-12% tie rod cost', bench: 'Toyota Corolla E210, Honda Civic', bodyStyles: ['hatchback','sedan','crossover','universal'], conf: 'estimated', note: 'Fixed-length tie rod with shim pack for alignment: eliminates adjuster nut, reduces parts by 2/corner' },
    ],
  },
  {
    id: 'braking',
    name: 'Braking System',
    subassembly: 'Braking System',
    baseline: 'Front: 330-360mm vented disc, 4-pot fixed caliper on performance / 1-pot floating on base. Rear: 300-320mm disc + EPB.',
    trends: 'EURO 7 (2027): brake dust particle emission limits. Brake-by-wire (BBW) for ADAS L3+ regenerative blending. Disc size right-sizing critical with BEV regen.',
    levers: [
      { t: 'Right-size front disc diameter (regen brake bias on BEV)', save: '10-15% brake cost', bench: 'Tesla Model 3, Hyundai Ioniq 6', bodyStyles: ['sedan','hatchback','suv','crossover'], conf: 'benchmarked', note: 'BEV regen provides 0.3g deceleration — reduce friction disc load. 320mm adequate where 360mm specified' },
      { t: '4-pot fixed → 1-pot floating caliper on base/mid trim', save: '30-40% caliper cost', bench: 'BMW 3 Series base vs M-sport', bodyStyles: ['sedan','hatchback','suv','universal'], conf: 'verified', note: 'No performance difference on base trim. Massive cost saving. M/sport trims retain fixed caliper' },
      { t: 'Cast iron rotor grade right-size (duty-matched alloy)', save: '8-12%', bench: 'Brembo, Akebono standard lines', bodyStyles: ['universal'], conf: 'estimated', note: 'Hypereutectic vs standard grey iron: right-spec by vehicle duty — standard LE grey iron adequate for most' },
      { t: 'Brake pad commonisation across platform', save: '15-20% pad SKU cost', bench: 'VW Group (shared pad compound)', bodyStyles: ['universal'], conf: 'benchmarked', note: 'Common pad compound with 2 backing plate sizes across 4+ models: volume + single homologation' },
      { t: 'Eliminate separate front caliper dust shield', save: '1 part/corner', bench: 'Skoda Octavia, SEAT Leon', bodyStyles: ['hatchback','sedan','crossover'], conf: 'estimated', note: 'EURO 7 brake dust filter to replace dust shield function — delete shield if filter integrated into caliper' },
    ],
  },
  {
    id: 'subframe',
    name: 'Front/Rear Subframe',
    subassembly: 'Front End Module (FEM) / Rear Suspension',
    baseline: 'Welded steel tubular subframe. Front: hydroformed or stamped sections. Rear: welded steel cradle.',
    trends: 'Al HPDC subframes standard on BEV C-segment+ (fewer packaging constraints). Integral motor mount bosses in rear subframe. EV gigacasting replacing 3-5 part welded subframes.',
    levers: [
      { t: 'Al HPDC front subframe (>80K/yr)', save: '25-35% subframe mass', bench: 'BMW G20 3 Series, Mercedes C-Class', bodyStyles: ['sedan','suv','coupe','crossover','universal'], conf: 'verified', note: 'Similar cost to welded steel at volume. Better dimensional accuracy. Integral engine/motor mount bosses' },
      { t: 'Hydroformed closed-section rear subframe', save: '15-20% mass vs open', bench: 'Ford Mondeo, Volvo S60', bodyStyles: ['sedan','suv','crossover'], conf: 'benchmarked', note: 'Closed-section hydro tube: higher torsional stiffness, less mass vs equivalent stamped open-section' },
      { t: 'Integral rear motor mount in subframe casting (BEV)', save: '2 separate brackets deleted', bench: 'BMW iX xDrive50, Porsche Macan EV', bodyStyles: ['sedan','suv','coupe','crossover'], conf: 'verified', note: 'Cast motor mount boss into rear Al subframe — eliminates bolted bracketing and reduces NVH paths' },
      { t: 'Standardise subframe bolt pattern across vehicle family', save: '3-4 location brackets deleted', bench: 'Stellantis STLA / VW MQB', bodyStyles: ['universal'], conf: 'estimated', note: 'Common subframe attachment geometry: single body-side reinforcement design, no model-specific brackets' },
      { t: 'Gigacast front cradle + strut tower (Al)', save: '5+ parts → 1', bench: 'Tesla Model 3 Highland, NIO', bodyStyles: ['sedan','suv','crossover'], conf: 'theoretical', note: 'Large HPDC integrates front subframe + strut towers + rails in one casting — $50-100M press required' },
    ],
  },
  {
    id: 'wheel-end',
    name: 'Wheel Hub & Bearing',
    subassembly: 'Wheel & Tyre',
    baseline: 'Generation-3 hub bearing unit (HBU3). Cast iron hub. Steel ARB drop links.',
    trends: 'HBU Gen-4 with integrated ABS encoder. Integrated temperature sensing. Tyre cost optimisation now in VAVE scope for BEV range impact.',
    levers: [
      { t: 'HBU right-size to actual load (remove overspec)', save: '10-15% bearing cost', bench: 'Schaeffler/SKF product optimisation', bodyStyles: ['hatchback','sedan','crossover','universal'], conf: 'estimated', note: 'B/C-segment SUV often fitted D-segment HBU spec — right-size by FEA load analysis, save 10-15%' },
      { t: 'Integrate ABS tone ring in HBU inner race', save: '1 part/corner', bench: 'NSK, Jtekt Gen-3 HBU', bodyStyles: ['universal'], conf: 'verified', note: 'Pressed-on tone ring eliminated: Gen-3 HBU with integral encoding ring standard from C-segment up' },
      { t: 'Al wheel hub vs grey iron (BEV unsprung mass)', save: '1.2-1.8 kg/corner', bench: 'BMW iX, Porsche Taycan', bodyStyles: ['sedan','suv','coupe','crossover'], conf: 'benchmarked', note: 'Forged Al hub: 30-40% lighter at similar cost at volume. Critical for BEV unsprung mass target' },
      { t: 'Steel ARB drop links vs Al forged (non-performance)', save: '€12-18/link', bench: 'VW/Skoda base specification', bodyStyles: ['hatchback','sedan','mpv','crossover','universal'], conf: 'verified', note: 'Stamped + ball-jointed steel links: identical function at significantly lower cost for non-performance' },
      { t: 'Common wheel bolt pattern across platform', save: '5-8% wheel/hub tooling', bench: 'VW Group 5×112 standard', bodyStyles: ['universal'], conf: 'benchmarked', note: 'PCD commonisation: same wheel/hub tooling across D/E-segment, share wheel design, volume wheel pricing' },
    ],
  },
];

export const CHASSIS_TRENDS: ChassisTrend[] = [
  { t: 'Brake-by-wire (BBW) for ADAS regen blending', status: 'Emerging', save: 'Enabler for L3+ ADAS', dir: 'Continental MK C2, ZF IBC: fully decoupled BBW for seamless regen integration. Mandatory for ADAS L3+. BMW Neue Klasse, GM Ultium from 2025. +€150-250/vehicle vs conventional.' },
  { t: 'Al suspension arms standard on BEV C-segment+', status: 'Mainstream', save: '30-40% arm mass', dir: 'Forged/HPDC Al control arms now mandatory for BEV unsprung mass budgets. Cost parity with steel at >80K/yr. All major BEV platforms from 2023+.' },
  { t: 'Adaptive damping (CDC) cost reduction at volume', status: 'Mainstream', save: 'Enabler (cost falling)', dir: 'ZF, Bilstein, Sachs CDC damping cost down 30% from 2018-2025 as volume grows. Now standard on C-segment premium trims. Predictive semi-active using GPS/camera data.' },
  { t: 'Steer-by-wire (SbW) — mechanical column deletion', status: 'Emerging', save: 'Packaging + ADAS enabler', dir: 'BMW Neue Klasse 2025 first high-volume SbW. Lexus RZ450e (optional). No mechanical column → design freedom + ADAS integration. Adds redundancy cost €200-350 but saves column €80-120.' },
  { t: 'EURO 7 brake dust particle limits (2027)', status: 'Emerging', save: 'Design constraint', dir: 'Brake dust particle filter (BDPF) mandatory EU from 2027: €15-25/wheel. Drives disc size right-sizing (BEV regen reduces friction load). May render separate dust shield obsolete.' },
  { t: 'Rear-wheel steering (RWS) volume increase', status: 'Emerging', save: 'Delete on sub-premium', dir: 'ZF AKC, Porsche, BMW now offer RWS on C-segment+. But cost still €180-300. Delete on non-performance variants — justified only for L-WB wheelbase or sport grade.' },
  { t: 'Air suspension democratisation (B/C-segment)', status: 'Emerging', save: 'Variable', dir: 'Arnott, Continental making air suspension accessible at B-segment. Reduces cost from €600→€350. Load-levelling function key differentiator vs coil. Growing in MPV/SUV.' },
  { t: 'Electrification of active systems (eSAW, eARB)', status: 'Emerging', save: 'Performance enabler', dir: 'Active roll control (eARB) becoming mainstream on BEV SUV (BMWi7, Rolls Royce). Electro-mechanical vs hydraulic: 40% weight saving, no hydraulic leak risk.' },
];

export const CHASSIS_COST_STRUCTURE = [
  { name: 'Suspension', share: 38, color: '#3b82f6' },
  { name: 'Steering', share: 18, color: '#60a5fa' },
  { name: 'Braking', share: 20, color: '#93c5fd' },
  { name: 'Subframe', share: 14, color: '#2563eb' },
  { name: 'Wheel/Hub', share: 10, color: '#1d4ed8' },
];

export function getTotalChassisIdeas(): number {
  return CHASSIS_COMPONENTS.reduce((sum, c) => sum + c.levers.length, 0);
}

export interface ChassisMfgLever {
  id: string;
  name: string;
  description: string;
  saving: string;
  status: 'Mainstream' | 'Emerging' | 'Next-Gen';
}

export const CHASSIS_MFG_LEVERS: ChassisMfgLever[] = [
  { id: 'al-knuckle-cell', name: 'Automated Al HPDC Knuckle Deburring + Inline CMM', description: 'Robotic 6-axis deburring cell (Fanuc M-10iD) with integrated 3D vision directly after HPDC knuckle casting. Inline CMM probe checks 12 critical dimensions at 100% — replaces offline CMM sampling (5% sample rate). Cycle time per knuckle: 48 s. Scrap rate reduction 55%.', saving: '10-15% machining cost; 55% scrap reduction', status: 'Mainstream' as const },
  { id: 'roll-form-arb', name: 'Roll-Formed Hollow ARB (Anti-Roll Bar)', description: 'Replace solid-bar ARB stock with hollow-tube roll-formed ARB (12 mm wall, 35 mm OD): same spring rate, 22% mass saving. Single die set produces all diameter variants via tooling inserts. Straightening tolerance: ±0.8 mm over 1,200 mm.', saving: '20-25% ARB mass; 8-12% tooling saving via common die', status: 'Mainstream' as const },
  { id: 'robot-subframe-weld', name: 'Robotic MIG Subframe Welding (Seam-Tracking Camera)', description: 'Replace manual MIG/TIG subframe welding with 6-axis robot cell (Fronius TPS500i, Servo-seam tracking camera). Weld speed: 850 mm/min vs 420 mm/min manual. Spatters reduced 60%. First-pass quality rate: 98.5% vs 87% manual.', saving: '20-30% weld cycle time; 60% spatter rework', status: 'Mainstream' as const },
  { id: 'hydroform-subframe', name: 'Hydroformed Rear Subframe Tubular Sections', description: 'Internal high-pressure hydroforming (280 bar) of rear subframe longitudinal tubes: closed cross-section 120×80 mm from 2.0 mm S420MC steel. Eliminates separate inner tube and longitudinal weld seam. Dimensional repeatability ±0.3 mm along 800 mm length. Line investment: €2.1M per press.', saving: '15-20% subframe mass; delete weld seam operation', status: 'Mainstream' as const },
  { id: 'bushing-press-auto', name: 'Automated Bushing Press Station (Force-Displacement Monitoring)', description: 'Hydraulic servo bushing press (Promess EP350, ±0.1 mm depth control) with force-displacement signature check per bushing. Replaces manual press + separate go/no-go gauge check. Cycle time per bushing: 8 s. 100% inline quality vs 10% manual torque sample.', saving: '40% bushing assembly cycle; 100% inline quality', status: 'Mainstream' as const },
  { id: 'brake-subassembly', name: 'Modular Brake Sub-Line (Multi-Model Flexible Cell)', description: 'Common brake corner assembly cell (Stäubli TX90 robot) handling front/rear caliper assembly across 3 vehicle families via model-recognition via RFID. Flexible tooling change: 90 s vs 4 h dedicated line changeover. OEE target 92%.', saving: '12-18% brake assembly overhead vs dedicated line', status: 'Mainstream' as const },
  { id: 'brake-pad-sort', name: 'Automated Brake Pad Friction Coefficient 100% Inline Test', description: 'Inline tribometer (Kistler brake pad test rig) tests every brake pad at simulated 60 kN/m² press load before assembly — replaces incoming batch testing (5% sample). Rejects: 0.4% catch rate. Eliminates field warranty from out-of-spec pads (historically 0.15% warranty events/yr).', saving: '15-25% pad warranty events; 100% inline quality', status: 'Emerging' as const },
  { id: 'disc-laser-mark', name: 'Laser Brake Disc Traceability Marking (Delete Label)', description: '1064 nm fiber laser marking on inboard disc face (batch, date, supplier, cavity number) at 0.3 mm character height. Replaces adhesive paper label (€0.08/disc, 8 s application per disc). Permanent traceability enables warranty root-cause in 2 h vs 2 weeks.', saving: '2-4% trace cost; permanent traceability in field', status: 'Mainstream' as const },
  { id: 'spring-die-common', name: 'Common Coil Spring Winding Die Across Platform Family', description: 'Standardise wire diameter (12.5 mm) and winding pitch across 4 coil spring variants (F/R, sedan/SUV) enabling 1 winding die vs 4. Free-length varies via pitch adjustment; rate varies via wire-length control. Single heat-treatment cycle covers all variants.', saving: '8-12% spring tooling + 7% free length repeatability improvement', status: 'Mainstream' as const },
  { id: 'epb-eol-auto', name: 'Automated EPB Adjustment + EOL Functional Test Integration', description: 'EPB (electric park brake) spindle calibration and park force ramp test integrated into end-of-line axle test bench (ZF testline ATE4). Current: separate EPB rig (4 min) + EOL test (6 min) = 10 min. Integrated: 6 min. Test bench communicates via OBD to ECU — stores park force map for traceability.', saving: '6-10% axle EOL test time; delete separate EPB rig', status: 'Emerging' as const },
  { id: 'abs-vision-ring', name: 'ABS Tone Ring 100% Vision Inspection Inline', description: 'AI vision camera (Cognex In-Sight 9000, 8 MP) checks tone ring tooth count, profile and eccentricity at 100% after press-fit — replaces offline CMM at 10% sample rate. Defect detection: missing tooth (0.1 mm gap), radial run-out >0.08 mm.', saving: '20-35% warranty skip-rate from bad tone rings', status: 'Mainstream' as const },
  { id: 'eps-eol-axle', name: 'EPS EOL Test Integrated into Steering Axle Assembly', description: 'Electric power steering torque + friction test integrated into steering column final assembly bench. Sensor: reaction torque transducer (HBK T40B). Measures: assist torque map vs ECU command, friction Nm at 5 speed conditions. Replaces standalone EPS test station.', saving: '8-12% EPS EOL test time; delete standalone EPS rig', status: 'Mainstream' as const },
  { id: 'steering-ai-test', name: 'AI Steering Torque Signature Anomaly Detection', description: 'Machine-learning model (TensorFlow Lite, deployed on EOL bench PC) classifies EPS torque signatures against trained good/reject library of 12,000 samples. Catches: contaminated gearsets, worn pinion, binding column — invisible to conventional limit-check. Warranty saving modelled at €22/vehicle on affected fraction.', saving: '€18-30 warranty saving per vehicle at population level', status: 'Emerging' as const },
  { id: 'hub-bearing-cleanroom', name: 'Wheel Bearing Assembly Cleanroom Cell (ISO Class 7)', description: 'HBU Gen-3 bearing assembly moved into ISO 7 clean cell (particle count ≤352,000 /m³ for ≥0.5 µm). Reduces bearing contamination failures (historically 0.08% warranty rate). Cell investment: €180k. Payback via warranty: 14 months at 80K units/yr bearing volume.', saving: '0.08% warranty rate elimination; 14-month payback', status: 'Mainstream' as const },
  { id: 'gigacast-cradle', name: 'Gigacast Front Cradle + Strut Tower (Al HPDC 6,000T)', description: 'Large-format Al HPDC front cradle integrating front subframe + strut tower nodes in one casting (6,000-tonne Idra press). Eliminates 5-part welded assembly + 60 weld joints. Part: 7.8 kg Al vs 11.2 kg welded steel. Press investment: €55-80M. Applicable >200K units/yr.', saving: '5 parts → 1; 3.4 kg saving; 60 weld operations deleted', status: 'Next-Gen' as const },
];

export const CHASSIS_OEM_BENCHMARKS = [
  { oem: 'BMW', model: 'G20 3-Series / G05 X5 / Neue Klasse', moves: ['Al HPDC front subframe standard from G20 — cost-neutral at 200K/yr vs welded steel + 30% lighter', 'Forged Al upper + lower control arms all around: Gen6 Neue Klasse confirms weight target −20%', 'Tailor-rolled ARB (hollow tube, variable wall) standard G05 X5 — 22% ARB mass saving', 'Steer-by-wire (Neue Klasse 2025): delete mechanical column, 35-mm packaging gain, ADAS-native'] },
  { oem: 'Tesla', model: 'Model 3 Highland / Model Y', moves: ['Rear gigacasting (6,000T): 171 parts → 1 casting, cycle time 90 s, saves €350/vehicle BOM', 'Front structural casting integrates strut tower + subframe cradle — delete 5 welded assemblies', 'Flat floor enables right-sized brake discs (regen covers 0.3g): front disc 320 mm vs 360 mm', 'Camera-vision brake dust monitor (2025 EU7 road map) — no BDPF hardware, software-only approach'] },
  { oem: 'Mercedes-Benz', model: 'W214 E-Class / W223 S-Class / C294 EQE SUV', moves: ['Air Body Control (ABC) standard S-Class: active spring + damper per corner, 36-sensor suite', '4MATIC+ EAD (Electronic Axle Drive) torque vectoring replaces mechanical LSD — software only', 'Steer-by-wire planned S-Class successor: delete 1.8 m steering column, save 3.2 kg', 'Predictive CDC using front camera road scan — pre-sets damper for impending bump 200 ms ahead'] },
  { oem: 'Hyundai / Kia', model: 'Ioniq 6 / EV6 / Ioniq 5N', moves: ['CTBA (twist beam) rear on FWD Ioniq 6 base — saves €185 vs multi-link at equivalent ride grade', 'Forged Al front knuckle standard on E-GMP IRA — 2.1 kg saving per corner, meets NCAP 2026', 'Integrated EPB + auto-hold standard from Ioniq 5 — delete separate handbrake cable + bracket', 'Ioniq 5N MR (magneto-rheological) damper: sub-ms response, delete CDC actuator latency'] },
  { oem: 'BYD', model: 'Sea-Lion / Han EV / Ocean Platform', moves: ['Forged 6061-T6 Al front lower arm standard Ocean platform — 35% lighter vs AHSS stamped at >300K/yr', 'Common hollow ARB across Han/Atto/Seal (26 mm OD, 3 mm wall) — 1 winding die for all models', 'EHPAS (electric hydraulic assist) common rack across e-Platform 3.0 — single homologation', 'CDC rear-only on PHEV variants: reduce CDC to 2 corners (rear), save €80/vehicle on standard BEV'] },
  { oem: 'Porsche / Audi', model: 'Cayenne E3 / Q8 e-tron / Taycan / PPE Platform', moves: ['Forged Al MacPherson wishbone (Cayenne): same geometry, −40% mass vs cast Al, NCAP load paths confirmed', 'PASM 2-valve CDC standard from Cayenne base (2024 MY) — cost dropped 28% vs Gen1 PASM', 'Common Gen-3 HBU (hub bearing) across Taycan / Q8 e-tron / Macan EV via PPE platform sharing', 'Porsche Torque Vectoring Plus (PTV+) software delete rear mechanical LSD: €320 saving, faster response'] },
];
