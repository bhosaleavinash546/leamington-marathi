// E/E (Electrical & Electronics) Knowledge Base
// Source: E/E Cost Engineer — VAVE & Manufacturing Ideation
// Author: Avinash Bhosale, Senior Cost Improvement Engineer (E/E Systems)

export interface EeIdea {
  t: string;
  lev: string;
  save: string;
  bench: string;
  v8: 'crit' | 'fav' | 'any';
  mat: string;
  risk: string;
  tech: string;
  mfg: string;
  why: string;
  tr: string;
  new?: number;
}

export interface EeComponent {
  id: string;
  sub: string;
  name: string;
  baseline: string;
  fn: string;
  ideas: EeIdea[];
  top3: { t: string; v: string }[];
}

export interface EeTrendItem {
  t: string;
  status: string;
  save: string;
  dir: string;
}

export interface EeCostEntry {
  label: string;
  pct: number;
  color: string;
  note: string;
}

export interface EeMfgItem {
  t: string;
  lev: string;
  save: string;
  note: string;
}

export interface EeOemBenchmark {
  oem: string;
  model: string;
  moves: string[];
}

// ─── COMPONENT IDEAS DATABASE ────────────────────────────────────────────────

export const EE_COMPONENTS: EeComponent[] = [
  {
    id: 'wiring-harness',
    sub: 'Wiring & Connectivity',
    name: 'Vehicle wiring harness',
    baseline: 'Round-wire copper harness, point-to-point topology, 1,500–3,000 individually routed circuits, conventional splice/connector architecture, ~50 kg harness mass on a C/D-segment BEV.',
    fn: 'Distribute power and signals to every ECU, sensor, actuator and load across the vehicle; provide mating interfaces that survive vibration, moisture and temperature over 15+ years.',
    ideas: [
      {
        t: 'Flat flexible cable / FFC replacing round-wire trunk runs',
        lev: 'Technology',
        save: 'Harness mass −20-35%, labour −25%',
        bench: 'Aptiv Gen 3.5 Smart Vehicle Architecture (2024); Sumitomo FFC bundles on Toyota bZ4X',
        v8: 'fav',
        mat: 'Emerging',
        risk: 'Med',
        new: 1,
        tech: 'FFC/FPC replaces round-wire bundle runs in doors, instrument panel and roof: 50% thinner, 30% lighter, automated cut-and-crimp replaces manual harness assembly. Aptiv Gen 3.5 SVA adopts FFC for all backbone runs.',
        mfg: 'Automated FFC cutting + ZIF connector insertion replaces manual wire-sorting, bundling and taping. Labour per unit drops ~25% on sub-harnesses.',
        why: 'Harness is often the third-largest cost assembly in a vehicle. Flattening the conductor profile compresses routing space by ~60%, cuts copper mass and enables full automation of a traditionally manual process.',
        tr: 'Repair/splice in field is harder on FFC; ZIF connectors need sealed variant for underbody; tooling NRE for each new form-factor.',
      },
      {
        t: 'Zone-based topology deleting long cross-car trunk runs',
        lev: 'Architecture',
        save: 'Wire length −30-40%, connector count −25%',
        bench: 'Tesla Model 3/Y (2021): 100 m → 50 m harness target; Volkswagen SSP zone architecture (2025)',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Med',
        new: 1,
        tech: 'Zonal E/E replaces star-wired point-to-point with 4–6 zone controllers. Each zone box aggregates local signals onto an Ethernet or CAN FD backbone, cutting total wire length by 30–40%. Tesla cut harness from 1,500 m to <100 m wire in Model 3 vs Model S.',
        mfg: 'Fewer unique harness assemblies per zone; standardised backbone connectors cut crimp-and-seal variants. Zone box assembly automated via pick-and-place PCB lines.',
        why: 'Every metre of wire removed saves material and weight; fewer splices and connectors reduce failure modes and warranty cost. Zone architecture also enables OTA updates to replace costly dealer visits.',
        tr: 'Zone ECU adds an upfront cost; software latency routing through zone nodes must be validated for safety-critical functions.',
      },
      {
        t: 'Aluminium replacing copper on low-current circuits (<5 A)',
        lev: 'Material',
        save: 'Conductor cost −30-40% on applicable circuits',
        bench: 'Delphi/Aptiv Al harness on GM trucks (2015–); Leoni Al ground straps on BMW i-series',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'Al wire (1350 series) at 1.5–2× cross-section replaces Cu on non-safety body circuits: lighting, HVAC blower, seat heat. Al costs ~60% less per kg and is 67% lighter. Bi-metal crimps (Cu-Al) are production-proven on GM light trucks since 2015.',
        mfg: 'Al crimping requires controlled crimp geometry and sealed connectors to prevent galvanic corrosion. Process validated at high volume by Delphi/Aptiv and Lear.',
        why: 'Copper is the dominant harness material cost. Swapping even 20–30% of circuit mass to Al yields significant saving with proven tooling.',
        tr: 'Bi-metal crimp quality must be controlled; Al cannot replace Cu on high-flex or high-current power feeds.',
      },
      {
        t: 'Wireless sensor deletion — TPMS direct + wireless BMS (wBMS)',
        lev: 'Consolidation',
        save: 'Delete 4–8 wired sensor runs; harness −3-6 m',
        bench: "GM Ultium wBMS (2022, Hummer EV): first mass-production wireless BMS; Continental direct TPMS standard on all EU vehicles since 2014",
        v8: 'fav',
        mat: 'Proven',
        risk: 'Med',
        new: 1,
        tech: 'Direct TPMS eliminates 4 wheel-to-body signal wires (already mandated EU/US). GM Ultium wBMS uses 2.4 GHz radio to connect battery module sensors to BMU — deletes an entire wired sensing harness inside the pack (~20 m wire, 5 connectors per pack).',
        mfg: 'Delete wire-harnessing stations for TPMS wheel circuits and battery module cabling. GM reports 90% reduction in battery assembly wiring operations with wBMS.',
        why: 'Wireless deletion is irreversible cost reduction: no recurring material, no connector wear modes, no harness rework at vehicle assembly.',
        tr: 'RF interference in metal battery pack must be validated; functional safety classification (ASIL B) for wBMS requires redundancy protocol.',
      },
      {
        t: 'Connector standardisation across platforms',
        lev: 'Standardization',
        save: 'Tooling −20%, piece price −8-15% on connectors',
        bench: 'Volkswagen MQB/PPE connector family; Aptiv Metri-Pack 630 across GM platforms',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'Define a single-platform connector family (3 pitch sizes, 2 sealing classes) and enforce for all new programs. VW MQB achieved 60% connector SKU reduction vs prior generation.',
        mfg: 'Fewer tooled variants means volume leverage per connector type and fewer change-overs on crimping lines.',
        why: 'Connector proliferation is a hidden cost: each unique connector needs its own tool, seal, CPA and validation. Standardisation consolidates spend.',
        tr: 'Legacy carryover programs resist change; packaging constraints occasionally force unique pitches.',
      },
      {
        t: 'Automated harness assembly (KOMAX / Schleuniger wiring centres)',
        lev: 'Process',
        save: 'Labour −30-50% on applicable sub-harnesses',
        bench: 'Aptiv ADAS harness automation (Slovakia, 2023); Leoni automated door harness cells',
        v8: 'any',
        mat: 'Proven',
        risk: 'Med',
        tech: 'Automated cut-strip-crimp-insert cells (KOMAX Omega 850) handle straight-run sub-harnesses. Collaborative robots (KUKA, Fanuc) manage bundling and taping. Leoni reports 40% labour saving on door harnesses.',
        mfg: 'High capex per cell (~€0.8M) but scalable; justified at >500K units/year per harness variant. Requires design-for-automation: straight runs, standardised connector pitches.',
        why: 'Harness assembly is one of the last high-labour manual operations in vehicle manufacturing. Automation converts labour to depreciation — better at scale and immune to wage inflation.',
        tr: 'Complex branching and custom lengths resist automation; upfront capex and programming effort per variant.',
      },
    ],
    top3: [
      { t: 'Zone architecture + FFC backbone', v: 'Wire-length reduction study; zone ECU cost trade; OTA architecture' },
      { t: 'Al wire on low-current circuits', v: 'Bi-metal crimp validation; galvanic corrosion life test' },
      { t: 'Wireless sensor deletion (wBMS + TPMS)', v: 'RF validation in battery pack; ASIL-B redundancy protocol' },
    ],
  },
  {
    id: 'ecu-architecture',
    sub: 'E/E Architecture',
    name: 'ECU / E-Architecture',
    baseline: 'Distributed ECU architecture: 70–150 discrete ECUs, each function in a separate control unit, CAN bus backbone, proprietary middleware per supplier, dealer-reflash for software updates.',
    fn: 'Execute all vehicle functions in software — safety, powertrain, chassis, body, ADAS, infotainment — with deterministic real-time performance, functional safety, and OTA software update capability.',
    ideas: [
      {
        t: 'Domain controller consolidation: 4+ ECUs → 1 domain unit',
        lev: 'Consolidation',
        save: 'ECU count −40-60%, hardware BOM −25%',
        bench: 'Tesla FSD computer (2019): one domain controller replaces 8 ADAS ECUs; Volkswagen E3 1.2 domain architecture (2025); Bosch Vehicle Motion Domain Controller',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Med',
        new: 1,
        tech: 'Consolidate ADAS, chassis, body and powertrain ECUs into 4–6 domain controllers running on high-performance SoCs (Qualcomm Snapdragon Ride, NVIDIA Orin). Tesla replaced 8 discrete ADAS ECUs with one FSD computer in Model 3/Y.',
        mfg: 'Fewer PCBAs to manufacture, test and stock. Domain controller is a complex unit but replaces 4+ simpler units — net part count and assembly operations fall.',
        why: 'Each deleted ECU removes a housing, PCB, connector set, harness stub and calibration event. At 50+ ECUs, consolidation is the single largest E/E BOM lever.',
        tr: 'Software integration complexity rises; safety partitioning (ASIL D isolation) on shared silicon needs validation; programme risk if SoC is delayed.',
      },
      {
        t: 'AUTOSAR Adaptive platform enabling OTA — delete dealer reflash',
        lev: 'Architecture',
        save: 'Dealer visit cost −€80-150/vehicle/update; software rework −30%',
        bench: 'Tesla OTA since 2012 (>200M updates delivered by 2024); BMW ConnectedDrive OTA (since 2020); Volkswagen E3 AUTOSAR Adaptive',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Low',
        tech: 'AUTOSAR Adaptive on Linux/QNX enables containerised software deployment. OTA update removes the need for dealer flash visits ($80–150 each). BMW delivers OTA software packs for every connected vehicle; Volkswagen targets full E3-domain OTA by 2025.',
        mfg: 'No manufacturing change; software team absorbs update pipeline. Deletes physical ECU reflash fixtures from PDI line.',
        why: 'Eliminating dealer reflash events saves €80–150 per vehicle per update cycle, compounds over the fleet, and monetises software updates as revenue.',
        tr: 'Cybersecurity (ISO 21434) and functional safety (ISO 26262) for OTA patches; bandwidth cost for cellular update delivery.',
      },
      {
        t: 'Zonal E/E: centralised compute with zonal power/signal nodes',
        lev: 'Architecture',
        save: 'Harness −30-40%, ECU count −50%, assembly −15%',
        bench: "Tesla's octopus architecture (Model 3/Y); Volkswagen SSP Zonal (2026); Toyota E3 zonal (2025); Aptiv SVA",
        v8: 'fav',
        mat: 'Emerging',
        risk: 'High',
        new: 1,
        tech: 'Central vehicle computer + 4–6 zone nodes replaces 100+ distributed ECUs. Zone nodes distribute power and aggregate local sensors/actuators. Backbone is 10GbE + CAN FD. Volkswagen SSP targets a single central compute plus 6 zone controllers for the 2026 platform.',
        mfg: 'Zone nodes are simple gateway PCBAs (low complexity); central computer is highly complex. Net: fewer unique PCBA variants, simplified wiring from zone box to actuators.',
        why: 'Zonal architecture eliminates the long cross-car wiring runs that are most expensive to route, test and service. Central compute enables software-defined features sold post-sale.',
        tr: 'Central compute is a single point of failure — requires redundant power, cooling and safety partitioning. Software migration from 150+ ECU suppliers is a 5-year programme.',
      },
      {
        t: '48V low-voltage architecture — delete 12V-to-48V DC-DC converters on BEV',
        lev: 'Design',
        save: 'Delete DC-DC converter (€80-150), LV harness −25%',
        bench: 'Tesla Cybertruck 48V LV (2023): industry first production 48V LV net; Rivian R2 48V LV; Mercedes EQS 48V body domain',
        v8: 'fav',
        mat: 'Emerging',
        risk: 'Med',
        new: 1,
        tech: 'Replacing the 12V LV net with 48V allows LV wire gauge to halve (current halves at 4× voltage for equal power). On BEV, the 12V battery and DC-DC converter (HV→12V) are deleted; OBC directly charges 48V. Tesla Cybertruck uses 48V exclusively — wiring mass cut 17 kg vs Model X equivalent.',
        mfg: 'Deletes the DC-DC converter housing, transformer, capacitor bank and cooling. LV harness uses thinner wire. However, all 12V-native components (lights, actuators, ECUs) must be re-sourced at 48V — significant supplier ecosystem disruption.',
        why: 'DC-DC converter is typically €80–150 BOM; 48V LV harness is 25% lighter. For BEV, where 12V battery serves only accessories, the case for a separate 12V subsystem is purely inertia.',
        tr: '48V component ecosystem is immature outside ADAS/mild hybrid segments; OEM must qualify 48V-native fuses, relays, actuators, lights — 3–5 year transition.',
      },
    ],
    top3: [
      { t: 'Domain/zonal ECU consolidation', v: 'ECU count delta analysis; ASIL partitioning review; programme risk for SoC availability' },
      { t: '48V LV architecture on BEV', v: 'DC-DC delete business case; 48V ecosystem maturity assessment by function' },
      { t: 'OTA via AUTOSAR Adaptive', v: 'Cybersecurity architecture; dealer-visit cost avoidance quantification' },
    ],
  },
  {
    id: 'infotainment',
    sub: 'Infotainment & HMI',
    name: 'Infotainment & HMI system',
    baseline: 'Separate proprietary head unit SoC per trim level, standalone navigation box, dedicated digital instrument cluster SoC, proprietary middleware stack, 8–10 inch centre display + 12 inch cluster.',
    fn: 'Deliver driver/occupant information, navigation, media, connectivity, voice interface, vehicle settings control and driver monitoring within functional safety and cybersecurity constraints.',
    ideas: [
      {
        t: 'Shared SoC platform across all trim levels',
        lev: 'Standardization',
        save: 'HU BOM −20-30%, NRE −€8-15M per programme',
        bench: 'Qualcomm Snapdragon SA8295P across BMW iX/i4/7 Series (2023); Stellantis STLA Brain shared HU SoC across all brands',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Low',
        tech: 'One high-performance SoC (Qualcomm SA8295, MediaTek DimensityAuto 9300) across all trims — base trim runs fewer processes, not a cheaper chip. BMW uses SA8295 across all Neue Klasse models; Stellantis STLA Brain targets 7 OEM brands on one SoC.',
        mfg: 'One PCBA variant per segment (not per trim). Volume consolidated onto single part number — better negotiating leverage, one qualification.',
        why: 'Separate SoC per trim multiplies NRE, qualification cost and spare-parts proliferation. A shared high-end SoC amortises over more units and supports future feature additions via software.',
        tr: 'Premium SoC is over-specified for base trim but cost still falls vs separate lower-end SoC once volume is consolidated.',
      },
      {
        t: 'Android Automotive OS replacing proprietary middleware',
        lev: 'Architecture',
        save: 'Middleware development −€15-25M, app ecosystem standard',
        bench: 'Volvo/Polestar (AAOS since 2021); Renault Scenic E-Tech (AAOS 2024); GM Ultifi; Honda e:Ny1',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'Android Automotive OS (AAOS) replaces proprietary Linux/QNX middleware. Google Maps, Google Assistant and Play Store built-in; OEM adds a custom UI layer. Volvo, Renault, Honda, GM all transitioned to AAOS.',
        mfg: 'Eliminates custom middleware build team and toolchain; OEM licenses AAOS and focuses on UI differentiation.',
        why: 'Proprietary middleware costs €15–25M per programme in development, carries constant app-compatibility debt, and has no app ecosystem. AAOS delivers this for a per-vehicle royalty that is lower than the development saving.',
        tr: 'Data-sharing agreements with Google; loss of some software control; Google dependency risk.',
      },
      {
        t: 'Common HMI — cluster + centre display on shared SoC (delete separate cluster ECU)',
        lev: 'Consolidation',
        save: 'Delete cluster ECU + housing (€45-90), PCB area −30%',
        bench: 'Tesla single-screen (delete cluster entirely); Rivian dual-pane single-SoC HMI; Polestar 2 shared SoC cluster+centre',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Med',
        new: 1,
        tech: 'Run instrument cluster and centre display as two display outputs from a single HU SoC, deleting the separate cluster ECU and its PCB, housing and wiring. Polestar 2 and Rivian implemented this; Tesla deleted the cluster display entirely.',
        mfg: 'Delete cluster ECU PCBA manufacturing, test and stock. Shared SoC is more complex but one unit replaces two.',
        why: 'Instrument cluster ECU is typically €45–90 BOM. Running it as a display output from the HU SoC costs the SoC a few percent extra processing headroom but deletes an entire ECU assembly.',
        tr: 'ASIL B requirement for speedometer/warning functions must be met on the shared SoC via hypervisor safety partition; driver acceptance of large-format or single-screen HMI.',
      },
      {
        t: 'Camera-based DMS on shared forward-camera SoC',
        lev: 'Consolidation',
        save: 'Delete standalone DMS ECU (€30-60)',
        bench: 'Mobileye EyeQ5H shared ADAS+DMS (2023); Continental ContiGuard DMS on shared SoC; Euro NCAP DMS mandate from 2024',
        v8: 'any',
        mat: 'Proven',
        risk: 'Med',
        tech: 'Driver monitoring camera neural network runs on the ADAS SoC (Mobileye EyeQ5, Nvidia Orin) alongside forward perception — deleting a separate DMS ECU box. Mobileye EyeQ5H does this in production on Zeekr 001 (2023).',
        mfg: 'Delete DMS ECU PCB, housing, connector and wiring loom. Footprint on shared SoC is <10% of processing budget.',
        why: 'Euro NCAP mandates DMS from 2024. A standalone DMS ECU at €30–60 is added cost for every vehicle; the ADAS SoC already has sufficient compute headroom.',
        tr: 'Safety partitioning for ASIL B DMS running alongside QM ADAS functions; camera placement must serve both forward perception and driver monitoring field-of-view.',
      },
      {
        t: 'Delete standalone NAV box via cloud-connected head unit',
        lev: 'Consolidation',
        save: 'Delete NAV module (€40-80)',
        bench: 'Tesla connected navigation (no onboard maps); BMW Live View Telematics; Volkswagen MIB3 cloud NAV (map on server)',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: "Cloud-based maps streamed to the HU delete the local NAND/eMMC map storage module and its housing. BMW MIB3 and Tesla use live cloud maps. Local cache for tunnel/offline retained in HU SoC's internal eMMC.",
        mfg: 'Delete standalone NAV PCB, housing and antenna assembly. Cloud connectivity uses existing telematics module.',
        why: 'Standalone NAV hardware is €40–80 BOM for storage and processing that the HU SoC already has. Cloud maps are always current, removing costly annual map update logistics.',
        tr: 'Requires reliable cellular connectivity; degraded mode (offline) must be validated; data cost to OEM.',
      },
    ],
    top3: [
      { t: 'Shared SoC across trims (cluster + HU)', v: 'Consolidated volume BOM trade; ASIL-B hypervisor sign-off for cluster function' },
      { t: 'Android Automotive OS migration', v: 'Google licensing cost vs middleware development saving; data-sharing terms' },
      { t: 'DMS on shared ADAS SoC', v: 'Euro NCAP compliance validation; field-of-view co-optimisation' },
    ],
  },
  {
    id: '12v-power',
    sub: '12V Power Distribution',
    name: '12V power distribution & battery',
    baseline: 'Conventional fusebox + relay matrix, AGM 12V battery (50–80 Ah), separate DC-DC converter (HV→12V, 2–3 kW), main power relay, analogue fuse panels in engine bay and passenger cell.',
    fn: 'Store and distribute 12V (or 48V) accessory power to all loads, protect circuits from overcurrent, provide pre-charge/main-relay switching, and survive key-off drain.',
    ideas: [
      {
        t: 'Smart PDU replacing fusebox + relay matrix',
        lev: 'Technology',
        save: 'Part count −60%, wiring stubs −30%, warranty ↓',
        bench: 'Aptiv Smart PDU (2022) in Rivian R1T/R1S; Continental Smart Fuse Box; Tesla Model S/X power distribution board',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Med',
        new: 1,
        tech: 'A smart PDU uses solid-state MOSFETs and an embedded microcontroller to replace the fuse box, relay matrix and junction blocks. Each channel is software-configurable: current limit, load-shed order, fault logging. Aptiv Smart PDU is in Rivian R1T production from 2022.',
        mfg: 'Delete fuse-box assembly, relay population, connector taping and wiring stubs. Smart PDU is one PCB assembly. Rivian reports 60% reduction in power-distribution part count.',
        why: 'The conventional fuse/relay matrix is a significant assembly cost: fuses, relays, blade connectors, housings, wiring stubs, and the labour to populate and test each. A smart PDU replaces this with one PCBA and enables diagnostics.',
        tr: 'MOSFET solid-state switches are more expensive per channel than fuses at low volume; software-configurability adds cybersecurity scope.',
      },
      {
        t: 'AGM → LFP 12V battery (delete AGM tray, vent tube and acid containment)',
        lev: 'Material',
        save: 'Battery mass −40%, delete vent/acid containment, cycle life ×5',
        bench: 'Tesla LFP 12V auxiliary battery (Model 3/Y from 2021); BYD LFP 12V across all BEV models; BMW i-series LFP 12V',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Low',
        tech: 'LFP chemistry replaces AGM for the 12V auxiliary battery: no acid hazard (delete vent tube and acid tray), 40% lighter, 5× cycle life, no sulphation from partial-state-of-charge operation typical of BEV. Tesla, BYD and BMW have all standardised on LFP 12V.',
        mfg: 'Delete AGM acid tray, vent manifold, vent tube routing and acid-containment packaging. LFP battery is a drop-in to the battery space with simpler housing.',
        why: 'AGM requires acid containment, venting and size overhead. LFP deletes those constraints, is smaller, lighter and lasts the life of the vehicle without replacement — removing a service event.',
        tr: 'LFP requires a BMS (low power — already present on most BEV); cell cost higher than AGM per Ah but total system is cheaper when BOM deletions counted.',
      },
      {
        t: 'Delete separate DC-DC converter via integrated OBC',
        lev: 'Consolidation',
        save: 'Delete DC-DC unit (€80-150), housings and wiring',
        bench: 'BYD 8-in-1 (integrated OBC+DC-DC); Hyundai/Kia E-GMP integrated OBC; Tesla Gen3 OBC with integral 12V output',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Med',
        new: 1,
        tech: 'Integrate the HV→LV DC-DC function into the OBC as an auxiliary LLC stage. The OBC already handles AC→HV DC conversion; adding a HV→12V stage adds <10% to OBC cost but deletes the standalone DC-DC module. BYD 8-in-1 and Tesla Gen3 OBC both integrate the 12V supply.',
        mfg: 'Delete DC-DC converter housing, transformer, inductor, capacitor bank, coolant connections and wiring harness. OBC assembly adds a daughter board for the 12V stage.',
        why: 'Standalone DC-DC converter is €80–150 BOM with its own housing, cooling and connectors. Integration into OBC removes all of these as standalone items.',
        tr: 'Integrated OBC is more complex and a single-point failure for both HV charging and 12V supply; requires careful safety isolation between AC input and 12V output.',
      },
      {
        t: 'Main relay delete via solid-state circuit breaker',
        lev: 'Technology',
        save: 'Delete main relay (€15-30), faster switching, no arc wear',
        bench: 'Littelfuse/Sensata solid-state CB in BEV; Infineon OptiMOS solid-state relay; Tesla high-voltage relay replacement (internal)',
        v8: 'any',
        mat: 'Emerging',
        risk: 'Med',
        tech: 'Solid-state MOSFET-based circuit breaker replaces electromechanical main relay. No moving parts, no contact arcing, <1 ms interruption vs 10–20 ms for relay, lower on-resistance at 12V current levels.',
        mfg: 'Replace relay socket, wiring terminal and relay PCB footprint with MOSFET package. Automated PCBA insertion replaces manual relay insertion.',
        why: 'Electromechanical relays arc at every switch event, degrading over life. Solid-state switches are silent, faster, more reliable and smaller. As volumes rise, MOSFET cost approaches relay cost.',
        tr: 'MOSFET must handle inrush current and fault interruption; thermal design for continuous current; cost premium at low volume.',
      },
      {
        t: '48V LV architecture eliminating 12V entirely on BEV',
        lev: 'Architecture',
        save: 'Delete 12V battery, DC-DC converter, dual-voltage routing',
        bench: 'Tesla Cybertruck 48V LV (2023): delete 12V entirely; Rivian R2 48V LV (2025)',
        v8: 'fav',
        mat: 'Emerging',
        risk: 'High',
        new: 1,
        tech: 'Eliminate 12V from the LV architecture entirely: BEV HV pack charges 48V LV directly via a single-stage DC-DC (simpler, no intermediate 12V rail). All accessories — lights, HVAC blower, actuators, ECUs — sourced in 48V variants. Tesla Cybertruck is the only mass-production vehicle with a full 48V LV net as of 2024.',
        mfg: 'Delete 12V battery, 12V DC-DC stage, 12V fuse box layer and all 12V-rated connectors/fuses. Wiring gauge halves for equal power delivery. Factory wiring cost drops ~17 kg per vehicle (Tesla Cybertruck figure).',
        why: 'A 48V-native vehicle has one voltage domain in the LV system, one type of accessory component, and lighter wiring. The DC-DC becomes a simple single-rail converter. Net system saving is substantial but requires full ecosystem transition.',
        tr: 'All 12V-native components (lamps, actuators, ECUs) must be re-specified to 48V — a 3–5 year supplier ecosystem transition with significant NRE; cannot be phased partway.',
      },
    ],
    top3: [
      { t: 'Smart PDU replacing fusebox + relay matrix', v: 'Per-channel MOSFET cost trade vs fuse/relay; Rivian Aptiv benchmark study' },
      { t: 'AGM → LFP 12V battery', v: 'BOM deletion (vent/tray) + cycle-life modelling; warranty saving quantification' },
      { t: 'Integrated OBC + DC-DC (delete standalone DC-DC)', v: 'Isolation and safety architecture; OBC complexity trade' },
    ],
  },
];

// ─── INDUSTRY TRENDS ─────────────────────────────────────────────────────────

export const EE_TRENDS: EeTrendItem[] = [
  { t: 'Zonal E/E architecture replacing distributed ECU topology', status: 'Mainstream → frontier', save: 'Harness −30-40%, ECU count −50%', dir: 'Volkswagen SSP (2026), Toyota E3, Aptiv SVA, Tesla octopus architecture. Zone controllers aggregate local signals; central compute runs vehicle software. Mandated by complexity of ADAS, OTA and software-defined vehicle strategy.' },
  { t: '48V LV net replacing 12V on BEV', status: 'Emerging', save: 'LV harness −25%, delete DC-DC', dir: 'Tesla Cybertruck (2023) first mass-production 48V-only LV. Rivian R2 (2025) follows. Ecosystem maturing: Bosch, Continental, Aptiv all qualifying 48V actuators, ECUs and lighting. Saves ~17 kg harness per vehicle at full adoption.' },
  { t: 'Software-defined vehicle: OTA-first feature delivery', status: 'Mainstream', save: 'Dealer reflash cost deleted', dir: 'Tesla >200M OTA updates since 2012. BMW, Mercedes, Volkswagen all offer full-vehicle OTA via AUTOSAR Adaptive. Monetisation via post-sale feature unlock (BMW heated seats, Tesla FSD subscription) represents new revenue stream that justifies domain/zonal hardware investment.' },
  { t: 'Android Automotive OS displacing proprietary middleware', status: 'Mainstream', save: 'Middleware NRE −€15-25M', dir: 'Volvo (2021), Renault (2024), Honda, GM adopting AAOS. Qualcomm SA8295 + AAOS becoming the default HU stack for European/Korean OEMs. Reduces HMI software development cycle from 3 years to 18 months.' },
  { t: 'Flat flexible cable / FFC for harness backbone', status: 'Emerging', save: 'Harness mass −20-35%', dir: 'Aptiv Gen 3.5 SVA adopts FFC for instrument panel and door modules. Toyota bZ4X, Sumitomo FFC bundles in body harness. Automated FFC insertion lines replacing manual harness boards reducing labour 25%.' },
  { t: 'Solid-state power distribution replacing fuse/relay matrix', status: 'Emerging', save: 'Part count −60%, warranty ↓', dir: 'Aptiv Smart PDU in Rivian R1T production (2022). Continental Smart Fuse Box in development. Solid-state circuit breakers (Infineon, Littelfuse) entering vehicle electrical systems. Smart PDU enables load diagnostics and software-configurable circuit protection.' },
  { t: 'Wireless BMS (wBMS) in battery packs', status: 'Emerging → Mainstream', save: 'Pack wiring −90% vs wired BMS', dir: 'GM Ultium wBMS (2022, Hummer EV) first mass-production wireless BMS using 2.4 GHz radio. Texas Instruments, Analog Devices developing wBMS silicon. Eliminates 20+ m of wiring inside battery pack. ASIL-B protocols validated for production.' },
  { t: 'LFP replacing AGM for 12V auxiliary battery on BEV', status: 'Mainstream', save: 'Mass −40%, delete vent/tray, life ×5', dir: 'Tesla (2021), BYD, BMW all standardised on LFP 12V. AGM acid-containment requirements deleted. LFP does not sulphate in BEV partial-state-of-charge cycling. Heading toward no 12V auxiliary battery at all on full 48V architectures.' },
  { t: 'Integrated OBC + DC-DC + on-board charger consolidation', status: 'Mainstream', save: 'Delete DC-DC unit (€80-150)', dir: 'BYD 8-in-1 integrates OBC, DC-DC and PDU. Hyundai E-GMP integrated OBC (11 kW AC + 800V DC fast charge + 12V DC-DC in one unit). Consolidation reduces HV connector count by 4–6 and deletes separate cooling circuit.' },
];

// ─── COST STRUCTURE ───────────────────────────────────────────────────────────

export const EE_COST_STRUCTURE: EeCostEntry[] = [
  { label: 'Wiring harness', pct: 28, color: '#6757c2', note: 'Largest single E/E cost item; dominated by copper conductor, connector and manual assembly labour. Key reduction levers: zone architecture, FFC, Al wire, wireless sensors.' },
  { label: 'ECU hardware (all domains)', pct: 24, color: '#2f6fae', note: 'Distributed ECU BOM: 70–150 PCBAs, housings and connectors. Domain/zonal consolidation targets 40–60% ECU count reduction with net BOM saving of 20–25%.' },
  { label: 'Infotainment & HMI', pct: 18, color: '#1d9488', note: 'Head unit SoC, cluster ECU, displays, nav module, audio amplifier. Consolidation of SoC across trims and deletion of standalone NAV/DMS modules are primary levers.' },
  { label: '12V power & distribution', pct: 12, color: '#a85f24', note: 'AGM battery, fusebox, relay matrix, DC-DC converter, junction blocks. Smart PDU, LFP battery and integrated DC-DC each independently deliver 8–15% subsystem saving.' },
  { label: 'Connectors & terminals', pct: 10, color: '#c08418', note: 'Connector proliferation driven by per-function ECU topology. Standardisation to 3-pitch family and zone-node aggregation directly attacks this cost.' },
  { label: 'Sensors & actuators (E/E share)', pct: 8, color: '#b1547c', note: 'TPMS, park sensors, ambient light, rain sensor. Deletion via wireless (wBMS, TPMS direct) and camera-based substitution reduces part count.' },
];

// ─── MANUFACTURING LEVERS ─────────────────────────────────────────────────────

export const EE_MFG_LEVERS: EeMfgItem[] = [
  { t: 'Automated harness assembly (KOMAX cut-strip-crimp-insert)', lev: 'Automation', save: '30-50% labour on sub-harnesses', note: 'Straight-run sub-harnesses (door, roof, IP backbone) fully automatable at >500 K units/year. KOMAX Omega 850 cells handle cut, strip, crimp and connector insertion in one pass.' },
  { t: 'Design-for-automation: standard connector pitch family', lev: 'Standardization', save: '15-25% connector cost', note: 'Enforcing 2–3 connector pitch families across all harness assemblies enables batch-run automated crimping and reduces unique tooling from 80+ to <20 variants.' },
  { t: 'Zone node PCB automated SMT + AOI line', lev: 'Automation', save: '20-30% PCBA cost', note: 'Zone controllers are simple low-layer-count PCBAs well-suited to high-speed SMT pick-and-place + reflow + AOI. Volume leverage from one design across platforms reduces cost per board.' },
  { t: 'Smart PDU single-board manufacturing vs relay-box population', lev: 'Process', save: 'Delete relay insertion + test stations', note: 'Smart PDU manufactured as a standard PCBA on SMT lines replaces manual relay insertion, blade-fuse population and point-by-point circuit test on conventional fuse boxes.' },
  { t: 'In-line EOL electrical test on harness bundles', lev: 'Test', save: 'Warranty cost −8-15%', note: 'Automated continuity, insulation resistance and connector-seating verification inline on the harness board catches defects before vehicle assembly — avoiding costly line-stop and rework at trim/chassis.' },
  { t: 'Wireless BMS enabling battery pack assembly automation', lev: 'Process', save: '90% reduction in pack wiring operations', note: "GM Ultium wBMS removes the inter-module wiring harness from battery pack assembly — a process that was entirely manual. Modules are dropped in and radio-paired. Assembly takt drops ~30% on the pack line." },
  { t: 'Domain controller functional test at sub-assembly vs full vehicle', lev: 'Test', save: 'Catch-at-lowest-cost principle', note: 'Testing domain controllers with a hardware-in-the-loop (HIL) rig before vehicle integration catches 90%+ of software and hardware faults at the cheapest point in the build sequence.' },
  { t: 'Regional localisation of wiring harness assembly', lev: 'Logistics', save: 'Freight + duty −10-20%', note: 'Harness is large, bulky and labour-intensive — best assembled regionally near the vehicle plant. Localising harness assembly in Mexico (for US plants) or North Africa (for European plants) combines low labour cost with short logistics.' },
];

// ─── OEM BENCHMARKS ───────────────────────────────────────────────────────────

export const EE_OEM_BENCHMARKS: EeOemBenchmark[] = [
  {
    oem: 'Tesla',
    model: 'Model 3/Y (2021) & Cybertruck (2023)',
    moves: [
      'Model 3/Y: harness reduced from 1,500 m (Model S) to <100 m using zone topology and FFC backbone',
      'Cybertruck: first mass-production 48V-only LV architecture, saving ~17 kg harness vs Model X equivalent',
      'LFP 12V auxiliary battery (2021): deleted AGM acid tray and vent, 40% mass saving',
      'OTA-first: >200M software updates delivered without dealer visit since 2012; FSD feature sold post-sale',
    ],
  },
  {
    oem: 'Volkswagen',
    model: 'ID. series E3 1.2 / SSP Zonal (2025–26)',
    moves: [
      'E3 1.2 domain architecture: 70 ECUs consolidated to 3 domains on MEB+ for Tiguan/Passat 2024',
      'SSP Zonal (2026): central compute + 6 zone nodes targets 50% ECU reduction vs MQB',
      'MQB connector standardisation: 60% connector SKU reduction vs PQ platform',
      'MIB3 HU: Android Automotive OS + cloud-based navigation deleting onboard nav storage module',
    ],
  },
  {
    oem: 'GM',
    model: 'Ultium Platform (2022–)',
    moves: [
      'Ultium wBMS (Hummer EV 2022): first mass-production wireless battery management system — 90% reduction in pack wiring operations',
      'Ultifi software platform: AUTOSAR Adaptive OTA architecture across all Ultium models from 2023',
      'GaN OBC in Cadillac Celestiq: magnetics/caps −60%, OBC volume −50% vs Si equivalent',
      'Smart fuse box development with Continental targeting Ultium Gen 2 (2025)',
    ],
  },
  {
    oem: 'Rivian',
    model: 'R1T/R1S (2022) & R2 (2025)',
    moves: [
      'Aptiv Smart PDU in production R1T: 60% reduction in power-distribution part count vs conventional fuse box',
      'R2 targets 48V LV architecture — following Tesla Cybertruck lead, eliminating 12V battery and DC-DC',
      'Inductive position sensor in motor (no resolver) validated by Munro teardown as cost benchmark',
      'Zone harness architecture: 4-zone layout with FFC backbone reduces harness assembly variants by 40%',
    ],
  },
];

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────

export function getEeComponentsBySubsystem(sub: string) {
  return EE_COMPONENTS.filter(c => c.sub === sub);
}

export function getEeComponentById(id: string) {
  return EE_COMPONENTS.find(c => c.id === id);
}

export function getTotalEeIdeas() {
  return EE_COMPONENTS.reduce((acc, c) => acc + c.ideas.length, 0);
}
