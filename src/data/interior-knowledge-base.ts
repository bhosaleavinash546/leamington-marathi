import { ConfidenceLevel } from '../types';

export interface InteriorLever {
  action: string;
  saving: string;
  conf: ConfidenceLevel;
  bench: string;
  note?: string;
}

export interface InteriorComponent {
  id: string;
  name: string;
  levers: InteriorLever[];
}

export interface InteriorTrend {
  id: string;
  title: string;
  description: string;
  status: 'Mainstream' | 'Emerging' | 'Next-Gen';
  impact: string;
}

export const INTERIOR_COMPONENTS: InteriorComponent[] = [
  {
    id: 'instrument-panel',
    name: 'Instrument Panel (Dashboard)',
    levers: [
      { action: 'PP-LGF (long-glass-fibre) structural IP carrier replacing Mg/Al cross-car beam where column load allows', saving: '35-45% CCB mass, £34-68/unit cost saving (no casting NRE)', conf: 'verified', bench: 'BMW iX, VW ID.4 — LGF cross-car beam replacing Mg die-cast' },
      { action: 'Delete slush-moulded PVC soft pad in favour of IMC (In-Mould Coating) on PP substrate', saving: '£15-30/instrument panel — delete foam + skin laminate process', conf: 'estimated', bench: 'Toyota bZ4X — reduced soft-touch area with premium finish on hard PP' },
      { action: 'Integrate digital cluster + centre display into single panel assembly (cockpit module)', saving: '2 assemblies → 1 module, £13-21 assembly labour saving + delete interconnect harness section', conf: 'benchmarked', bench: 'VW MIB3 cockpit module (ID series), BMW Curved Display (G26)' },
      { action: 'Delete dedicated HUD projector unit in base/mid trim (replace with enhanced digital cluster)', saving: '£102-170/vehicle on non-premium variants', conf: 'estimated', bench: 'Toyota Corolla — standard cluster vs HUD option. Cost split: £128 base cluster vs £238 HUD spec' },
      { action: 'Common IP substrate across sedan/SUV on shared platform (different surface geometry same carrier)', saving: '£425K-1.02M tooling saving across 2 derivatives', conf: 'estimated', bench: 'VW MQB — shared IP carrier Golf/Tiguan/Passat with geometry adaptation' },
    ],
  },
  {
    id: 'seats',
    name: 'Seat Systems',
    levers: [
      { action: 'Al seat frame (extruded profile) vs welded steel — same crashworthiness at 30-35% mass saving', saving: '£47-72/seat frame at scale; unsprung mass benefit for NCAP dynamic', conf: 'verified', bench: 'BMW M GmbH, Recaro performance seats — Al frame standard premium' },
      { action: 'Delete 4-way lumbar on base trim (1-way or no lumbar vs power lumbar)', saving: '£30-47/seat pair; delete motor, bladder assembly, ECU connection', conf: 'estimated', bench: 'VW Golf base trim — 2-way manual vs 4-way electric on higher spec' },
      { action: 'Seat heating carbon-fibre mat vs resistive wire — faster warm-up, no hot-spot warranty', saving: '£2.5-5.1/seat material; warranty improvement (hotspot failures -80%)', conf: 'verified', bench: 'Gentherm CarbonCore — standard on BMW G-series, Mercedes W206' },
      { action: 'Common seat track across LHD/RHD by symmetric design — halve tooling investment', saving: '£153-238K tooling saving across platform derivatives', conf: 'benchmarked', bench: 'Toyota TNGA — symmetric seat rail in Corolla GR/RAV4 shared platform' },
      { action: 'Delete rear seat massage on base/mid trim (retain front only on premium spec)', saving: '£68-119/vehicle rear massage system delete on non-luxury variants', conf: 'estimated', bench: 'Mercedes E-Class W214 — massage standard on E350+, delete on E220d base' },
    ],
  },
  {
    id: 'door-trim',
    name: 'Door Trim Panels',
    levers: [
      { action: 'PP-NF (natural-fibre hemp/flax composite) door trim carrier replacing PP-GF30 — lower density, better CO2', saving: '12-18% door carrier mass; CO2 footprint -25% per panel', conf: 'verified', bench: 'BMW i3 hemp-flax door trim, Ford Escape soy-based foam' },
      { action: 'Delete premium stitching (laser-simulated stitch pattern on IML insert vs sewn cover)', saving: '£6.8-12/door trim pair in assembly labour + fixture tooling saving', conf: 'estimated', bench: 'Toyota Crown — IML stitching pattern vs hand-sewn on premium trim' },
      { action: 'Common door switch pack front/rear (4 buttons → 2 buttons on rear): rear has no mirror/seat control', saving: '£5.1-10/rear door pair in switch content delete', conf: 'benchmarked', bench: 'VW Group MQB — rear door switch simplified to 2-way window on base' },
      { action: 'Ambient LED integration into door trim extrusion (single strip vs individual LEDs on brackets)', saving: '£3.4-6.8/door in assembly labour; IP54 protection improvement', conf: 'benchmarked', bench: 'BMW G60 5-Series door ambient — single flex-LED strip vs dot LED' },
      { action: 'Delete map pocket soft lining (moulded surface vs fabric lining in storage bin)', saving: '£1.7-4.3/door trim on mid-spec variants; removes sewing operation', conf: 'estimated', bench: 'Renault Espace — moulded recess vs fabric pocket on base trim' },
    ],
  },
  {
    id: 'centre-console',
    name: 'Centre Console',
    levers: [
      { action: 'Wireless charging coil integration into console armrest lid (flat Qi vs under-tray mounted)', saving: '£4.3-8.5 in bracket + assembly saving; improves user access', conf: 'verified', bench: 'Tesla Model 3/Y — flush Qi pad in console armrest, delete mounting bracket' },
      { action: 'Single USB-C hub PCB (2× 45W) replacing separate 12V socket + USB-A + USB-C modules', saving: '3 parts → 1; £10-19 combined saving vs individual modules', conf: 'benchmarked', bench: 'BMW iX — USB-C only, delete 12V socket on BEV spec (charging via USB-C)' },
      { action: 'Common console carrier across wheelbase variants (extend insert for LWB with same carrier)', saving: '£298-510K tooling saving on LWB/SWB derivative', conf: 'estimated', bench: 'Mercedes S-Class W223 — SWB/LWB share console carrier with geometry insert' },
    ],
  },
];

export const INTERIOR_TRENDS: InteriorTrend[] = [
  { id: 'screen-domination', title: 'Large Screen Consolidation (Single Slab Display)', description: 'Transition from multiple screens to single curved OLED slab (BMW, Mercedes EQS, Rivian). Eliminates bezel frames, instrument cluster housing, and complex multi-harness. Cost-neutral at volume >200K/yr.', status: 'Mainstream', impact: 'Single curved display: £408-553 vs separate cluster + HUD + centre screen (~£468-595 combined).' },
  { id: 'sustainable-materials', title: 'Sustainable & Recycled Interior Materials', description: 'EU End-of-Life Vehicle Regulation (ELV 2025) mandating 25% recycled content. OEMs targeting vegan leather (Dinamica, MicoTech), recycled ocean plastic trim, hemp/flax panels.', status: 'Mainstream', impact: 'Recycled/bio materials 5-15% premium over conventional — justified by ELV compliance and brand positioning.' },
  { id: 'haptic-controls', title: 'Haptic Feedback Replacing Physical Buttons', description: 'Capacitive surfaces with haptic feedback replacing buttons: BMW iX force-sensing buttons, Mercedes hyperscreen. Reduces part count, enables OTA reconfiguration but increases ECU complexity.', status: 'Emerging', impact: 'Part count reduction 30-50% on centre console. ECU complexity increases — warranty risk on first gen.' },
  { id: 'zonal-lighting', title: 'Zonal 64-Colour Ambient Lighting Systems', description: '64+ colour RGB ambient lighting in doors, footwells, dashboard becoming standard from B-segment premium. Single controller drives 8-12 zones via LIN bus — minimal harness.', status: 'Mainstream', impact: '£13-30/vehicle ambient system — standard on C-segment from 2023. Customer satisfaction uplift.' },
  { id: 'flat-floor-bev', title: 'BEV Flat Floor Interior Redesign', description: 'CTP battery enabling flat floor eliminates tunnel, enabling new console architecture. Sliding rear seats viable. Interior volume +8-12% on same external footprint.', status: 'Mainstream', impact: 'Redesign opportunity: delete tunnel, centre console repackaging, 2nd-row seat comfort improvement.' },
  { id: 'biometric-monitoring', title: 'In-Cabin Biometric & Occupancy Monitoring', description: 'Driver monitoring system (DMS) with camera mandatory EU NCAP 2026. Adds IR camera (£21-38), ECU function, and integration to ADAS domain controller. DMS + occupant detection replacing weight sensors.', status: 'Emerging', impact: 'DMS mandatory from NCAP 2026 (Assisted Driving assessment). Delete rear seat weight sensor (replace with occupancy monitor).' },
];

export const INTERIOR_COST_STRUCTURE = [
  { name: 'Instrument Panel', value: 30, color: '#f59e0b' },
  { name: 'Seats', value: 28, color: '#f97316' },
  { name: 'Door Trims', value: 18, color: '#ef4444' },
  { name: 'Centre Console', value: 12, color: '#ec4899' },
  { name: 'Headliner & Trim', value: 8, color: '#a855f7' },
  { name: 'Floor & Boot', value: 4, color: '#6366f1' },
];

export function getTotalInteriorIdeas(): number {
  return INTERIOR_COMPONENTS.reduce((sum, c) => sum + c.levers.length, 0);
}

export interface InteriorMfgLever {
  id: string;
  name: string;
  description: string;
  saving: string;
  status: 'Mainstream' | 'Emerging' | 'Next-Gen';
}

export const INTERIOR_MFG_LEVERS: InteriorMfgLever[] = [
  { id: 'eva-carpet-mould', name: 'One-Shot EVA Floor Carpet Moulding', description: 'EVA (ethylene vinyl acetate) composite carpet — acoustic layer + carrier + pile — co-moulded in a single 90-second press cycle at 180°C. Replaces 3-layer hand-laid assembly (barrier mat + PU decoupler + carpet). Labour saving: 8 min/vehicle. STC +3 dB vs layered system.', saving: '8 min assembly; £65/vehicle material vs 3-layer system', status: 'Mainstream' as const },
  { id: 'seat-robot-sew', name: 'Robotic Seat Trim Automated Sewing Cell', description: 'Sewbot-style 6-axis robot sewing cell (SOFTWEAR Automation) handles leather/Alcantara seat cover sewing with ±0.4 mm stitch positioning. Replaces manual sewing (60 operations/cover). Cycle time: 22 min/set of 4 seats vs 42 min manual. First-pass quality rate 97.8% vs 91% manual.', saving: '45% seat trim sewing time; consistent stitch quality', status: 'Emerging' as const },
  { id: 'cockpit-beam-common', name: 'Common IP Cockpit Beam Injection Tool Across Platform', description: 'Standardise long glass-fibre PP cockpit beam geometry (cross-car beam) across sedan/SUV derivatives with geometry inserts for model-specific attachment bosses. Single tool £357k vs 3 model-specific tools £0.94M. Volume pooling: PA66-LGF30 compound at 280K units/yr reduces material cost 6%.', saving: '£578K tooling saving; 6% material cost from volume', status: 'Mainstream' as const },
  { id: 'iml-door-panel', name: 'IML (In-Mould Labelling) Door Panel — Delete Secondary Decoration', description: 'In-mould label (IML) process embeds decorative grain/woodgrain/metallic film directly during PP door trim injection — eliminates secondary painting, laminating, or foil-embossing operation. Cycle time saving: 3.5 min/door. VOC elimination from paint step.', saving: '3.5 min/door decoration op; VOC step eliminated', status: 'Mainstream' as const },
  { id: 'ip-foam-scan', name: 'Inline IP Foam Dimensional AI Camera Scan', description: 'Stereo AI vision system (Photoneo MotionCam-3D, 2 Mpx structured light) scans instrument panel foam surface after moulding for sink marks, shorts, flash — at 100% inline. Replaces offline CMM sampling (3% sample, 6-min cycle). Defect detection rate: 99.1% at 0.3 mm sensitivity.', saving: '30-40% rework from IP foam defects; 100% inline quality', status: 'Emerging' as const },
  { id: 'jit-seat-seq', name: 'JIT Seat Sequencing Direct-to-Line from Seat Supplier', description: 'Seat supplier (Lear/Faurecia/Adient) delivers sequenced seats via VMI kanban directly to body marriage station — eliminates OEM internal seat storage buffer (500 m² warehouse space, 3 h buffer). Delivery window: ±8 min per vehicle. EDI trigger on body VIN scan.', saving: 'Delete 500 m² storage, 3 h buffer; £10-15 logistics cost', status: 'Mainstream' as const },
  { id: 'ambient-led-clip', name: 'Automated Ambient LED Strip Clip-In Installation', description: 'Collaborative robot (UR10e) installs 6 m ambient LED strip per vehicle (dashboard + door perimeter) via vision-guided guided clip insertion at 95 mm/s. Replaces manual tool-tip feeding (12 min/vehicle). Error-proofing: camera confirms each clip seated to 2 mm ±0.3 mm.', saving: '12 min LED installation; 100% clip engagement verified', status: 'Emerging' as const },
  { id: 'cockpit-pcb-harness', name: 'Single Cockpit PCB Harness (Replace 6 Pigtail Connectors)', description: 'Consolidated cockpit zone wiring: single moulded PCB interconnect (Molex 48-way flat flex) replaces 6 individual pigtail harness segments for cluster, HMI, ambient, HVAC control, USB hub, and camera. Assembly time: 2 min vs 9 min (6 connectors). Mass saving: 0.34 kg.', saving: '7 min harness assembly; 0.34 kg wiring mass saving', status: 'Mainstream' as const },
  { id: 'door-seal-robot', name: 'Robotic Door Seal Foam Application (No Primer)', description: 'Nordson robot applies 8 mm bead of self-adhesive NVH foam (3M 4016) to door trim panel perimeter at 180 mm/s — eliminating primer + hand application (6 min). Robot path programmed per model via offline simulation. Application force ±0.5 N controlled via force sensor.', saving: '6 min/door NVH application; consistent bead geometry', status: 'Mainstream' as const },
  { id: 'hvac-duct-common', name: 'Common HVAC Duct Architecture Across Platform (Shroud-Only Change)', description: 'Platform-common HVAC duct core geometry with model-specific shroud insert (3D-printed prototype, injection production) for outlet positioning changes. Single duct tool £153K vs 3 model-specific £383K. Core thermal performance (air volume/noise) unchanged across derivatives.', saving: '£230K tooling NRC saving; single homologation cycle', status: 'Mainstream' as const },
  { id: 'hmi-ota-station', name: 'Automated HMI Function Test + OTA Pre-Load Station', description: 'End-of-line HMI test bench: automated touchscreen grid test (25-point, ±1.5 mm accuracy), audio functional sweep, OTA vehicle map/software pre-load (15 GB in 4 min via 5G link). Replaces manual tap test + offline OTA pre-load (offline: 18 min). Station cycle: 6 min total.', saving: '12 min per vehicle vs manual; 100% HMI quality coverage', status: 'Emerging' as const },
  { id: 'pp-nf-compression', name: 'PP-NF Door Carrier Blanket Compression Moulding (Replace Injection)', description: 'Natural-fibre (30% hemp/flax) PP door trim carrier moulded via compression moulding (180°C, 80 bar, 45 s) replacing injection moulding. Density 0.94 vs 1.04 g/cm³ (injection) — 10% lighter panel. Tooling: matched-die compression tool £80.8K vs injection tool £204K for same geometry.', saving: '10% carrier mass; £123K tooling NRC; 30 s cycle vs 60 s injection', status: 'Emerging' as const },
  { id: 'overhead-console-common', name: 'Common Overhead Console Architecture Across SUV/Sedan', description: 'Platform-shared overhead console carrier (map lights + SOS/assist button + sunroof switch substrate) with model-specific trim ring insert. Carrier tool: £153K × 1 vs £153K × 3 (sedan/SUV/estate). Switch substrate: same part number all variants. Map light position adapted via trim ring.', saving: '£306K tooling NRC; single MLA harness connector', status: 'Mainstream' as const },
  { id: 'glove-box-robot', name: 'Automated Glove Box + Storage Bin Pick-and-Place Assembly', description: 'Stäubli TX2-90L collaborative robot assembles glove box hinge, damper, and lid snap-fit in one 38-second cell cycle. Hinge pin insertion verified by force-torque sensor (Schunk FTN040). Replaces 3 manual assembly stations. Error-rate: 0.04% vs 0.6% manual.', saving: '0.6% → 0.04% error rate; 1.2 min cycle saving per vehicle', status: 'Emerging' as const },
  { id: 'ip-ai-vision', name: 'Inline AI Camera Colour/Grain Inspection on IP Surface', description: 'Chromasens AllPIXA evo line-scan camera (12k pixels, 12-bit colour depth) with Matrox Imaging AI model classifies IP surface colour deviation (ΔE >0.8 CIELAB), grain depth (gloss meter equiv.), and scratch (0.05 mm width) at 100% inline. Previous: 5% sample + visual jury.', saving: '5% sample → 100% inline; £38 rework saving on caught IP defects', status: 'Emerging' as const },
];

export const INTERIOR_OEM_BENCHMARKS = [
  { oem: 'BMW', model: 'G60 5-Series / G70 7-Series / iX', moves: ['Curved slab display (BMW Curved Display, G26/G30): single 1.4 m OLED slab replaces instrument cluster + centre screen + housing, delete inter-display harness section', 'Common IP carrier MQB-style across G20/G22/G26 — shared long-glass PP cross-car beam tooling, model-specific upper trim ring only', 'Rear seat ambient climate tablet (7-Series G70): 5.5-inch iDrive rear touchpad + ventilation control on seat back — delete rear HVAC button panel', 'Bowers & Wilkins 4D speaker integration: speaker exciter bonded to seat structure (fabric-mounted), delete separate speaker housing'] },
  { oem: 'Mercedes-Benz', model: 'W206 C-Class / W213 E-Class / EQS', moves: ['MBUX Hyperscreen (EQS): 1.41 m curved glass spanning full dashboard — single Gorilla Glass 7 cover, 3 OLED screens beneath, delete all physical button zones', 'MB.OS cockpit domain: Snapdragon 8295 runs all cockpit displays on 1 SoC — delete 3 standalone display ECUs (cluster ECU, HMI ECU, rear display ECU)', 'Sustainable materials: 40% recycled PET Nappa seat fabric (Dynamica microfibre) across C-Class base spec — no cost premium vs virgin material at volume', 'Single-zone Burmester 3D surround (W213 base): delete 4 dedicated speaker enclosures, use door panel foam as Burmester bass resonator cavity'] },
  { oem: 'Tesla', model: 'Model 3 Highland / Model Y Gen2', moves: ['Centre-console floating design: no dashboard touchpoints for IP/console mounting — 3-point mount to floor chassis rail, delete IP-to-A-pillar bracket', 'Full-glass panoramic roof: single cold-bent tempered glass delete sunblind entirely (electrochromic option adds PDLC layer to same glass)', 'Zero physical buttons below screen: delete 22 physical switches — all controls via 15.4-inch touchscreen + 4 steering buttons only (EU mandate-compliant)', 'Voice-first interface: Bluetooth 5.2 multi-mic array in headliner — delete separate far-field microphone pod unit'] },
  { oem: 'NIO', model: 'ET5 / ET7 / ES6 / ES8 NT2.0', moves: ['NIO Digital Cockpit: Qualcomm 8295 + NVIDIA Orin-X shared compute handles cluster, centre, rear screens — delete 2 standalone display ECUs', 'NOMI AI avatar: rotating orb on dashboard top — single servo actuator + speaker, replaces 3-button voice prompt button + separate mic array ECU', 'Rear entertainment screen (ET9): 15.6-inch OLED integrated into headrest — delete OEM headrest speaker unit, screen IS the rear entertainment system', 'Smart ambient personalisation: 1024-LED strip addressable per-zone via LIN daisy chain — 1 driver IC vs 8 separate zone controllers'] },
  { oem: 'Rivian', model: 'R1T / R1S Gen 2', moves: ['Gear tunnel storage system: 1,000-litre truck-bed integration under seat-back — replaces conventional rear cargo net + boot liner assembly', '15.6-inch driver display: 12.3-inch cluster + 15.6-inch centre shared display controller — 1 ARM Cortex-A78 runs both vs 2 ECUs (cluster + centre)', 'Composite floor trim: single GFR-PP moulded floor mat (2-shot compression) replaces 4 carpet sections + 2 rubber mats — delete 12 retention clips', 'Camp mode 72-hour battery: interior accent lighting + HVAC fan remain on — ambient demand managed via BMS priority queue, no additional hardware'] },
  { oem: 'BYD', model: 'Han EV / Sea Lion / Seal / Atto 3', moves: ['Rotating 15.6-inch display (Han EV): single motorised pivot (delete slide rail via offset geometry) saves £24/vehicle — display flips portrait/landscape in 3 s', 'Flat floor storage (Ocean platform CTB): tunnel deleted → 400 mm wide centre floor box with sliding lid replaces tunnel console', 'Integrated solar roof + interior blind: PDLC electrochromic glass replaces fabric sunblind + motor + cable (£67/vehicle saving) across Han/Seal', 'Yoke steering (Han EV 4th gen): flat-bottom wheel deletes lower spoke leather + switchgear — capacitive touch surface for all signals'] },
];
