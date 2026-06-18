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
      { action: 'PP-LGF (long-glass-fibre) structural IP carrier replacing Mg/Al cross-car beam where column load allows', saving: '35-45% CCB mass, €40-80/unit cost saving (no casting NRE)', conf: 'verified', bench: 'BMW iX, VW ID.4 — LGF cross-car beam replacing Mg die-cast' },
      { action: 'Delete slush-moulded PVC soft pad in favour of IMC (In-Mould Coating) on PP substrate', saving: '€18-35/instrument panel — delete foam + skin laminate process', conf: 'estimated', bench: 'Toyota bZ4X — reduced soft-touch area with premium finish on hard PP' },
      { action: 'Integrate digital cluster + centre display into single panel assembly (cockpit module)', saving: '2 assemblies → 1 module, €15-25 assembly labour saving + delete interconnect harness section', conf: 'benchmarked', bench: 'VW MIB3 cockpit module (ID series), BMW Curved Display (G26)' },
      { action: 'Delete dedicated HUD projector unit in base/mid trim (replace with enhanced digital cluster)', saving: '€120-200/vehicle on non-premium variants', conf: 'estimated', bench: 'Toyota Corolla — standard cluster vs HUD option. Cost split: €150 base cluster vs €280 HUD spec' },
      { action: 'Common IP substrate across sedan/SUV on shared platform (different surface geometry same carrier)', saving: '€500K-1.2M tooling saving across 2 derivatives', conf: 'estimated', bench: 'VW MQB — shared IP carrier Golf/Tiguan/Passat with geometry adaptation' },
    ],
  },
  {
    id: 'seats',
    name: 'Seat Systems',
    levers: [
      { action: 'Al seat frame (extruded profile) vs welded steel — same crashworthiness at 30-35% mass saving', saving: '€55-85/seat frame at scale; unsprung mass benefit for NCAP dynamic', conf: 'verified', bench: 'BMW M GmbH, Recaro performance seats — Al frame standard premium' },
      { action: 'Delete 4-way lumbar on base trim (1-way or no lumbar vs power lumbar)', saving: '€35-55/seat pair; delete motor, bladder assembly, ECU connection', conf: 'estimated', bench: 'VW Golf base trim — 2-way manual vs 4-way electric on higher spec' },
      { action: 'Seat heating carbon-fibre mat vs resistive wire — faster warm-up, no hot-spot warranty', saving: '€3-6/seat material; warranty improvement (hotspot failures -80%)', conf: 'verified', bench: 'Gentherm CarbonCore — standard on BMW G-series, Mercedes W206' },
      { action: 'Common seat track across LHD/RHD by symmetric design — halve tooling investment', saving: '€180-280K tooling saving across platform derivatives', conf: 'benchmarked', bench: 'Toyota TNGA — symmetric seat rail in Corolla GR/RAV4 shared platform' },
      { action: 'Delete rear seat massage on base/mid trim (retain front only on premium spec)', saving: '€80-140/vehicle rear massage system delete on non-luxury variants', conf: 'estimated', bench: 'Mercedes E-Class W214 — massage standard on E350+, delete on E220d base' },
    ],
  },
  {
    id: 'door-trim',
    name: 'Door Trim Panels',
    levers: [
      { action: 'PP-NF (natural-fibre hemp/flax composite) door trim carrier replacing PP-GF30 — lower density, better CO2', saving: '12-18% door carrier mass; CO2 footprint -25% per panel', conf: 'verified', bench: 'BMW i3 hemp-flax door trim, Ford Escape soy-based foam' },
      { action: 'Delete premium stitching (laser-simulated stitch pattern on IML insert vs sewn cover)', saving: '€8-14/door trim pair in assembly labour + fixture tooling saving', conf: 'estimated', bench: 'Toyota Crown — IML stitching pattern vs hand-sewn on premium trim' },
      { action: 'Common door switch pack front/rear (4 buttons → 2 buttons on rear): rear has no mirror/seat control', saving: '€6-12/rear door pair in switch content delete', conf: 'benchmarked', bench: 'VW Group MQB — rear door switch simplified to 2-way window on base' },
      { action: 'Ambient LED integration into door trim extrusion (single strip vs individual LEDs on brackets)', saving: '€4-8/door in assembly labour; IP54 protection improvement', conf: 'benchmarked', bench: 'BMW G60 5-Series door ambient — single flex-LED strip vs dot LED' },
      { action: 'Delete map pocket soft lining (moulded surface vs fabric lining in storage bin)', saving: '€2-5/door trim on mid-spec variants; removes sewing operation', conf: 'estimated', bench: 'Renault Espace — moulded recess vs fabric pocket on base trim' },
    ],
  },
  {
    id: 'centre-console',
    name: 'Centre Console',
    levers: [
      { action: 'Wireless charging coil integration into console armrest lid (flat Qi vs under-tray mounted)', saving: '€5-10 in bracket + assembly saving; improves user access', conf: 'verified', bench: 'Tesla Model 3/Y — flush Qi pad in console armrest, delete mounting bracket' },
      { action: 'Single USB-C hub PCB (2× 45W) replacing separate 12V socket + USB-A + USB-C modules', saving: '3 parts → 1; €12-22 combined saving vs individual modules', conf: 'benchmarked', bench: 'BMW iX — USB-C only, delete 12V socket on BEV spec (charging via USB-C)' },
      { action: 'Common console carrier across wheelbase variants (extend insert for LWB with same carrier)', saving: '€350-600K tooling saving on LWB/SWB derivative', conf: 'estimated', bench: 'Mercedes S-Class W223 — SWB/LWB share console carrier with geometry insert' },
    ],
  },
];

export const INTERIOR_TRENDS: InteriorTrend[] = [
  { id: 'screen-domination', title: 'Large Screen Consolidation (Single Slab Display)', description: 'Transition from multiple screens to single curved OLED slab (BMW, Mercedes EQS, Rivian). Eliminates bezel frames, instrument cluster housing, and complex multi-harness. Cost-neutral at volume >200K/yr.', status: 'Mainstream', impact: 'Single curved display: €480-650 vs separate cluster + HUD + centre screen (~€550-700 combined).' },
  { id: 'sustainable-materials', title: 'Sustainable & Recycled Interior Materials', description: 'EU End-of-Life Vehicle Regulation (ELV 2025) mandating 25% recycled content. OEMs targeting vegan leather (Dinamica, MicoTech), recycled ocean plastic trim, hemp/flax panels.', status: 'Mainstream', impact: 'Recycled/bio materials 5-15% premium over conventional — justified by ELV compliance and brand positioning.' },
  { id: 'haptic-controls', title: 'Haptic Feedback Replacing Physical Buttons', description: 'Capacitive surfaces with haptic feedback replacing buttons: BMW iX force-sensing buttons, Mercedes hyperscreen. Reduces part count, enables OTA reconfiguration but increases ECU complexity.', status: 'Emerging', impact: 'Part count reduction 30-50% on centre console. ECU complexity increases — warranty risk on first gen.' },
  { id: 'zonal-lighting', title: 'Zonal 64-Colour Ambient Lighting Systems', description: '64+ colour RGB ambient lighting in doors, footwells, dashboard becoming standard from B-segment premium. Single controller drives 8-12 zones via LIN bus — minimal harness.', status: 'Mainstream', impact: '€15-35/vehicle ambient system — standard on C-segment from 2023. Customer satisfaction uplift.' },
  { id: 'flat-floor-bev', title: 'BEV Flat Floor Interior Redesign', description: 'CTP battery enabling flat floor eliminates tunnel, enabling new console architecture. Sliding rear seats viable. Interior volume +8-12% on same external footprint.', status: 'Mainstream', impact: 'Redesign opportunity: delete tunnel, centre console repackaging, 2nd-row seat comfort improvement.' },
  { id: 'biometric-monitoring', title: 'In-Cabin Biometric & Occupancy Monitoring', description: 'Driver monitoring system (DMS) with camera mandatory EU NCAP 2026. Adds IR camera (€25-45), ECU function, and integration to ADAS domain controller. DMS + occupant detection replacing weight sensors.', status: 'Emerging', impact: 'DMS mandatory from NCAP 2026 (Assisted Driving assessment). Delete rear seat weight sensor (replace with occupancy monitor).' },
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
