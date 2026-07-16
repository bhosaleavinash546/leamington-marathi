// ADAS & Safety Systems Knowledge Base
// Source: ADAS & Safety Cost Engineer — VAVE & Manufacturing Ideation
// Author: Avinash Bhosale, Senior Cost Improvement Engineer (ADAS & Safety)

export interface AdasIdea {
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

export interface AdasComponent {
  id: string;
  sub: string;
  name: string;
  baseline: string;
  fn: string;
  ideas: AdasIdea[];
  top3: { t: string; v: string }[];
}

export interface AdasTrendItem {
  t: string;
  status: string;
  save: string;
  dir: string;
}

export interface AdasCostEntry {
  label: string;
  pct: number;
  color: string;
  note: string;
}

export interface AdasMfgItem {
  t: string;
  lev: string;
  save: string;
  note: string;
}

export interface AdasOemBenchmark {
  oem: string;
  model: string;
  moves: string[];
}

// ─── COMPONENT IDEAS DATABASE ────────────────────────────────────────────────

export const ADAS_COMPONENTS: AdasComponent[] = [
  {
    id: 'camera-suite',
    sub: 'Perception — Vision',
    name: 'Camera suite (forward + surround)',
    baseline: 'Dedicated forward mono camera (Mobileye EyeQ4), 4× surround cameras on separate image-processor SoC, standalone rain sensor, standalone light sensor, separate DMS camera with own ECU. Total: 7 cameras, 4 ECUs, 4 harness stubs.',
    fn: 'Provide forward lane / object detection for L2 ADAS, surround-view parking assistance, driver monitoring for drowsiness and distraction, plus rain and ambient-light sensing for automatic wiper/light activation.',
    ideas: [
      {
        t: 'Forward mono → stereo camera: delete standalone radar on SAE L2+',
        lev: 'Technology',
        save: 'Delete 1× radar (£34-68), depth perception without radar',
        bench: 'Tesla Vision (2021): deleted all radar from Model 3/Y; Mobileye SuperVision (2023): stereo-forward camera replaces long-range radar on NIO ET7',
        v8: 'fav',
        mat: 'Emerging',
        risk: 'High',
        new: 1,
        tech: 'A stereo forward camera pair derives depth from parallax, giving range-to-object without a forward radar. Tesla Vision operates at pure camera-only on all Model 3/Y/S/X from 2021. Mobileye SuperVision provides stereo depth on NIO ET7. At L2+, stereo can meet NCAP AEB requirements without radar for urban/highway scenarios.',
        mfg: 'Delete forward radar module, its mounting bracket, harness stub and ECU interface. Stereo camera uses same housing footprint as dual-cam unit; adds second lens and image processor.',
        why: 'Forward radar is £34–68 BOM. Deleting it with camera-only depth sensing removes a sensor, its housing, connector and harness — and simplifies the perception fusion stack.',
        tr: 'Tesla Vision showed performance drop in adverse weather and low-light vs radar-fusion; regulatory type-approval for AEB requires validation of camera-only depth in all conditions; NCAP 2026 scoring may penalise radar-less AEB.',
      },
      {
        t: 'Surround cameras on shared image-processor SoC (delete dedicated surround ECU)',
        lev: 'Consolidation',
        save: 'Delete surround-view ECU (£26-51), consolidate 4 ISPs',
        bench: 'Mobileye EyeQ5H surroundview on shared ADAS SoC (2023); Continental MFC6 multi-function camera with integrated ISP; Valeo 360 surround on shared ADAS domain',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'All 4 surround cameras feed a shared image-signal processor on the ADAS SoC (Mobileye EyeQ5, Nvidia Orin). Deletes the dedicated surround-view ECU, its housing and connector. Mobileye EyeQ5H integrates surround processing alongside forward ADAS in one chip.',
        mfg: 'Delete surround-view ECU PCB, housing and connector. Camera cables routed to ADAS domain controller directly. PCBA simplification reduces test fixtures.',
        why: 'A dedicated surround-view ECU (£26–51) does only one job. Moving it to the ADAS SoC costs incremental compute but deletes an entire ECU housing and assembly.',
        tr: 'ADAS SoC thermal envelope must accommodate surround-view processing load; image latency must be within parking-assist response requirements.',
      },
      {
        t: 'Camera-based rain and light sensing — delete standalone sensors',
        lev: 'Consolidation',
        save: 'Delete rain sensor module (£6.8-13) + light sensor (£2.5-5.1)',
        bench: 'Bosch multi-purpose camera (rain+lane+ADAS on one lens, 2019); Valeo SCALA rain-sensing camera; Aptiv unified sensor on Stellantis STLA',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'The windscreen-mounted forward camera can detect rain droplets on glass and ambient luminance in the same frame as lane/object detection. A neural-network classifier distinguishes rain patterns and triggers wipers without a dedicated rain sensor. Bosch has offered this since 2019.',
        mfg: 'Delete rain sensor piezo element, housing and wiper-control wiring stub. Light sensor delete removes a component from the rearview-mirror assembly. Net: 2 parts deleted, zero added.',
        why: 'Standalone rain and light sensors are small-cost but nonzero BOM items. Deletion via camera software is pure cost reduction with no new hardware.',
        tr: 'Rain-sensing camera must meet OEM wiper-trigger latency spec; forward-facing camera must not be positioned where rain detection FOV is compromised by wiper park zone.',
      },
      {
        t: 'DMS camera on shared forward ADAS SoC (Euro NCAP 2024 mandate)',
        lev: 'Consolidation',
        save: 'Delete standalone DMS ECU (£26-51)',
        bench: 'Mobileye EyeQ5H DMS on shared SoC (Zeekr 001, 2023); Continental ContiGuard DMS on ADAS SoC; ZF TRW ProViu360 shared domain (2024)',
        v8: 'any',
        mat: 'Proven',
        risk: 'Med',
        new: 1,
        tech: 'Driver monitoring camera neural network runs on the ADAS domain SoC alongside forward perception. Euro NCAP mandates DMS from 2024 (2 stars require camera-based drowsiness and distraction monitoring). Mobileye EyeQ5H does this in production on Zeekr 001 (2023). The DMS inference model occupies <10% of EyeQ5H compute budget.',
        mfg: 'Delete DMS ECU PCB, housing, LV connector and wiring loom. Integrate DMS camera cable into ADAS domain harness branch.',
        why: 'Euro NCAP mandate means every new model needs DMS. A standalone ECU at £26–51 is avoidable cost when the ADAS SoC already has capacity. Deletion saves BOM on every vehicle sold.',
        tr: 'ASIL-B classification for DMS must be safety-partitioned from QM ADAS functions on the shared SoC; camera placement must cover driver eye-box and not conflict with forward perception FOV.',
      },
      {
        t: 'Camera-first Tesla Vision strategy — delete forward radar entirely',
        lev: 'Architecture',
        save: 'Delete forward radar (£34-68) + processing ECU',
        bench: 'Tesla Vision across Model 3/Y/S/X/Cybertruck from 2021; Mobileye EyeQ6L camera-centric L2+',
        v8: 'any',
        mat: 'Emerging',
        risk: 'High',
        tech: "Camera-only perception relies on neural-network depth estimation from mono/stereo forward cameras, eliminating radar-based range. Tesla's occupancy-network approach (2022 FSD Beta v11) replaced radar-derived object lists with camera-derived voxel occupancy. As of 2024, all Tesla production vehicles are radar-free.",
        mfg: 'Delete radar module, radome, mounting bracket, microwave-transparent facia cutout, coax harness and ECU interface board. Simplifies front-end assembly by eliminating a separate sensor installation station.',
        why: "At scale, camera-first deletes the single most expensive active sensor on the car for non-premium L2 vehicles. Combined with Mobileye or Nvidia's neural-depth estimation, camera-only meets regulatory AEB thresholds in most OEM target markets.",
        tr: 'Adverse weather performance (fog, rain, direct sun) is demonstrably lower without radar; some markets and NCAP versions require radar for maximum AEB scoring; type-approval pathway must be agreed with homologation authority.',
      },
    ],
    top3: [
      { t: 'Shared ADAS SoC for surround + DMS (delete 2 ECUs)', v: 'Thermal budget study on SoC; ASIL-B partitioning for DMS on QM ADAS processor' },
      { t: 'Camera-based rain + light sensor deletion', v: 'Wiper-trigger latency validation; FOV co-optimisation with forward camera placement' },
      { t: 'Stereo forward / camera-first depth strategy', v: 'NCAP AEB validation without radar; all-weather performance characterisation' },
    ],
  },
  {
    id: 'radar-lidar',
    sub: 'Perception — Radar/LiDAR',
    name: 'Radar & LiDAR suite',
    baseline: 'One forward long-range radar (77 GHz), two front-corner radars, two rear-corner radars, one roof-mount mechanical spinning LiDAR (64-beam) for L3 models; separate ADAS ECU per sensor domain.',
    fn: 'Provide all-weather range measurement, velocity (Doppler), blind-spot and cross-traffic detection, and high-density point-cloud mapping for automated driving functions.',
    ideas: [
      {
        t: '77 GHz corner radar multi-function (L2 ADAS + blind-spot + cross-traffic alert)',
        lev: 'Consolidation',
        save: 'Delete standalone BSM radar (£17-30/corner), 2 ECU stubs',
        bench: 'Bosch mid-range radar MRR Gen3 (2023) multi-function; Continental ARS540 4D corner multi-function; Aptiv ESR2 multi-function radar (GM)',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Low',
        tech: 'A single 77 GHz corner radar handles L2 ADAS forward assist, blind-spot monitoring (BSM) and rear cross-traffic alert (RCTA) via wide-angle scanning mode. Bosch MRR Gen3 and Continental ARS540 combine all three functions in one module. Deletes standalone BSM sensor per corner.',
        mfg: 'Delete 2× standalone BSM radar modules, their brackets, connectors and harness stubs. Corner ADAS radar mounts in existing location with new firmware enabling BSM/RCTA function.',
        why: 'Standalone BSM radars (£17–30 each) are added to the rear quarters for NCAP-mandated blind-spot detection. A multi-function corner radar achieves all three functions without added hardware.',
        tr: 'Multi-function firmware must meet detection performance spec for each function simultaneously; beam-steering sweep rate must support all modes within latency budget.',
      },
      {
        t: 'LiDAR right-size: reduce scan rate and FOV for highway vs urban use case',
        lev: 'Spec opt.',
        save: 'LiDAR unit cost −25-40%',
        bench: 'Luminar Iris highway-optimised LiDAR (250 m range, 120° H × 20° V, on Volvo EX90 2024); Innoviz One automotive LiDAR (BMW iX L3); Hesai AT128 automotive (2024)',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Med',
        new: 1,
        tech: 'Highway L3 LiDAR needs long range (>200 m) but narrow FOV (horizontal ±30°) — a simpler, cheaper configuration than a 360° urban LiDAR. Luminar Iris on Volvo EX90 provides 250 m range at 120° H × 20° V — sufficient for highway hands-free while costing significantly less than a 360° scanner. Right-sizing scan rate from 20 Hz to 10 Hz for highway also reduces data bandwidth and processing cost.',
        mfg: 'Reduced-FOV LiDAR is smaller, lighter and has fewer beam-steering elements (MEMS mirror or fewer VCSEL rows). Assembly is simplified vs wide-FOV rotating scanner.',
        why: 'LiDAR is £170–680+ per unit depending on specification. Right-sizing FOV, range and scan rate to the actual use-case eliminates over-specification — the largest single LiDAR cost lever.',
        tr: 'Highway-optimised LiDAR cannot cover urban/parking use cases; requires complementary sensor for urban operation or explicit geo-fencing of L3 function to highway.',
      },
      {
        t: '4D imaging radar replacing standalone LiDAR on L2+ vehicles',
        lev: 'Technology',
        save: 'Delete LiDAR (£170-680+); 4D radar £68-128',
        bench: "Continental ARS540 4D imaging radar (2023); Arbe Phoenix 4D radar (Stellantis partnership 2022); ZF PREMIUM 4D radar; Bosch LRR5 4D",
        v8: 'fav',
        mat: 'Emerging',
        risk: 'Med',
        new: 1,
        tech: '4D imaging radar (range, azimuth, elevation, Doppler) produces a sparse point cloud that approximates LiDAR object classification at a fraction of the cost for L2+ highway ADAS. Continental ARS540 provides 400 virtual receive channels at 77 GHz — sufficient for pedestrian and cyclist classification without LiDAR. Stellantis STLA uses 4D imaging radar as the primary ranging sensor on L2+ trims, with LiDAR reserved for L3.',
        mfg: 'No change to radar integration process — same antenna/housing mounting as previous-generation radar. Avoids the specialist LiDAR integration station (window-mount, calibration target) required for spinning LiDAR.',
        why: 'Scanning LiDAR at £170–680 per unit is the largest single ADAS BOM item for non-robotaxi vehicles. 4D imaging radar at £68–128 delivers comparable object detection for highway L2+ at 70–80% cost reduction.',
        tr: 'Rain/fog performance of 4D radar is better than LiDAR but resolution is 5–10× lower; classification accuracy of pedestrians and cyclists below LiDAR spec for L3 scenarios; validate per NCAP 2026 MPDB pedestrian matrix.',
      },
      {
        t: 'Solid-state LiDAR (MEMS / OPA) vs spinning mechanical scanner',
        lev: 'Technology',
        save: 'Unit cost −50-70% vs spinning LiDAR, reliability ↑',
        bench: 'Luminar Iris (MEMS galvo, Volvo EX90 2024 production); Innoviz Two solid-state (BMW L3 2025 roadmap); Aeye IDAR solid-state (Stellantis 2023 program)',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Med',
        tech: 'MEMS mirror or optical phased array (OPA) LiDAR has no rotating bearing — no wear mode, smaller and cheaper. Luminar Iris (MEMS galvo) targets <$500 at high volume; solid-state equivalent of a 64-beam spinning unit costs $2,000–4,000. Luminar Iris entered production on Volvo EX90 in 2024.',
        mfg: 'Solid-state LiDAR is a sealed unit like a camera — mounted flush to the vehicle surface. Eliminates the motorised-head mounting frame, rotating interface and IP67 boot seal required for spinning LiDAR. Assembly simplified to bracket mount + connector.',
        why: 'Spinning LiDAR requires a motor, slip ring, IP67 rotating seal and large roofline package. Solid-state replaces all of this with a stamped housing. Cost trajectory is toward camera parity by 2027 according to Luminar.',
        tr: 'Solid-state currently has narrower FOV than spinning 360° LiDAR; multiple units may be needed for full surround coverage, potentially eliminating cost advantage vs a single spinner; MEMS mirror fatigue life must be validated over 200K km.',
      },
    ],
    top3: [
      { t: '4D imaging radar replacing LiDAR on L2+ vehicles', v: 'Classification accuracy vs LiDAR; NCAP 2026 pedestrian/cyclist scoring; Continental ARS540 benchmark' },
      { t: 'Multi-function corner radar (BSM + ADAS + RCTA)', v: 'Multi-mode firmware validation; beam-scheduling latency study' },
      { t: 'Solid-state LiDAR vs spinning for L3 highway', v: 'FOV coverage analysis (1 vs 2 units); Luminar Iris production cost trend' },
    ],
  },
  {
    id: 'airbag-system',
    sub: 'Passive Safety',
    name: 'Airbag system',
    baseline: 'Driver airbag, front passenger airbag, 2× side thorax airbags, 2× curtain airbags, 2× knee airbags, far-side airbag, 1× central airbag; distributed ACU architecture with 8–12 satellite sensors; separate inflator per bag.',
    fn: 'Deploy restraint bags in a crash event to limit occupant head, chest and knee loads within Euro NCAP and FMVSS 208 injury criteria — timed precisely to crash pulse, seat position and occupant classification.',
    ideas: [
      {
        t: 'Airbag count right-size by NCAP test matrix — delete knee airbag on high-sill BEV',
        lev: 'Spec opt.',
        save: 'Delete knee airbag module (£15-30 per side)',
        bench: 'Tesla Model 3/Y: no knee airbag (NCAP 5-star, 2021–2023); BYD Seal: no knee airbag; Rivian R1T: no knee airbag due to BEV high floor',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Med',
        new: 1,
        tech: 'BEV flat-floor architecture raises the H-point significantly relative to the footwell — reducing femur loading in a frontal crash below the threshold that knee airbags protect against. Tesla, BYD and Rivian all achieve NCAP 5-star without knee airbags on BEV platforms. NCAP knee airbag is required only where femur/tibia injury risk exceeds thresholds — the BEV floor geometry changes the load path.',
        mfg: 'Delete airbag module from instrument panel knee zone, its inflator, squib, wiring stub and ACU channel. IP mould tool simplifies (no knee airbag door/hinge recess).',
        why: 'Knee airbag deletion removes module, inflator, squib, connector, wiring stub and instrument panel integration feature. The BEV platform justification makes this a credible deletion with existing NCAP precedent.',
        tr: 'Full NCAP dummy run (Hybrid III 50th, 5th percentile female) must confirm femur loads are within limits without knee airbag; deletion cannot be carried over to ICE/low-floor platforms without re-testing.',
      },
      {
        t: 'Centralised ACU replacing distributed satellite sensor architecture',
        lev: 'Consolidation',
        save: 'Delete 6–8 satellite sensors (£3.4-6.8 each), simplify wiring',
        bench: 'Bosch SDM centralised ACU with MEMS accelerometers (mainstream since 2018); Continental MRS6 single ACU; ZF TRW centralised ACU on Toyota/Lexus from 2020',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'Modern MEMS accelerometers integrated into a single centralised ACU (with redundant sense axes) replace 6–12 distributed satellite sensors. The satellite sensors (mounted at door B-pillar, front rails) added latency-reducing local sense capability that is now met by high-speed central MEMS. Bosch MRS5/6 and Continental MRS6 have been mainstream for 5+ years.',
        mfg: 'Delete 6–12 satellite sensor assemblies, their brackets, harness stubs and connectors. Centralised ACU wiring is simpler — one module, one harness branch.',
        why: 'Each satellite sensor is £3.4–6.8 BOM. Deleting 8 saves £27–54 per vehicle. Central MEMS achieves equivalent crash discrimination with higher MEMS sensitivity at lower system cost.',
        tr: 'Centralised ACU must meet NCAP discriminating pulse timing without satellite pre-trigger; validate door-pole-side sensing latency with central-only architecture.',
      },
      {
        t: 'Far-side airbag via seat-mounted centre airbag (delete dedicated far-side module)',
        lev: 'Consolidation',
        save: 'Delete far-side airbag module (£21-38), simplify far-side wiring',
        bench: 'Mercedes-Benz S-Class (2021): centre airbag in driver seat cushion for far-side protection; Toyota bZ4X seat-mounted centre bag; Autoliv centre airbag (production 2022)',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Med',
        new: 1,
        tech: 'A cushion airbag integrated into the outboard seat between driver and front passenger deploys to prevent head-to-head contact in far-side crashes (Euro NCAP far-side test from 2023). Mercedes S-Class (2021) was the first production application. This replaces a dedicated far-side thorax airbag module with a shared centre module that also protects multiple occupant sizes.',
        mfg: 'Delete far-side thorax airbag from door/seat rail location. Centre seat airbag is integrated into seat cushion by seat supplier — moves the assembly step to the seat Tier-1 (Faurecia, Lear) rather than vehicle trim.',
        why: 'Euro NCAP far-side mandatory from 2023 (AOP protocol). A dedicated far-side airbag on each side doubles the module count for far-side protection. A single centre bag provides the same function for both driver and front passenger in one module.',
        tr: 'Centre airbag deployment energy and shape must be validated across all occupant sizes and seat positions; seat integration requires Tier-1 re-validation of seat structure and seam design.',
      },
      {
        t: 'Curtain airbag L/R tooling commonisation (mirror-image strategy)',
        lev: 'Standardization',
        save: 'Tooling NRE −50%, piece price −8-12%',
        bench: 'Autoliv curtain airbag symmetric design across BMW G-series; ZF TRW symmetric curtain on Stellantis STLA; Joyson Safety Systems common curtain tooling on VW MQB',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'Design the curtain airbag as a symmetric bilaterally-reversed part — one bag pattern and one inflation tube geometry serves both left and right sides. The inflator location and routing adapt via a symmetric bracket. Autoliv achieves this on BMW G-series. Saves one full bag-sewing tool set (£0.7–1.27M NRE) per programme.',
        mfg: 'One sewing-fixture programme, one cutting pattern. Inflators and gas generators remain common. Curtain assembly line serves both sides with flip-fixture. Part number halved.',
        why: 'Curtain airbag tooling NRE is significant (£0.8–2.55M per programme across L+R). Commonising L/R also consolidates volume on one SKU for better piece-price leverage with Autoliv/ZF TRW/Joyson.',
        tr: 'Symmetric design requires packaging review — particularly where A-pillar and rear-pillar routing differ; validate that symmetric inflation covers both occupant rows equally.',
      },
      {
        t: 'Airbag inflator right-size — single-stage vs dual-stage gas generator',
        lev: 'Spec opt.',
        save: 'Inflator cost −15-25% where single-stage sufficient',
        bench: 'Autoliv micro-gas-generator (MGG) right-sizing; ZF TRW inflator family optimisation; ARC Automotive inflator portfolio',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: "Dual-stage inflators fire sequentially to tailor bag pressure to crash severity — required for driver/passenger frontal airbags under FMVSS 208 multi-severity requirements. Side and curtain bags typically need single-stage. Audit inflator selection: right-size single-stage on curtain, side thorax and knee positions where regulatory/NCAP requirements don't mandate dual-stage.",
        mfg: 'Single-stage inflators are 20–25% cheaper than dual-stage at equal propellant load. No manufacturing change at vehicle level — swap done at airbag module supplier.',
        why: 'Inflator is the highest unit-cost component within each airbag module (typically 40–55% of module BOM). Right-sizing from dual-stage to single-stage on non-mandated positions removes cost without performance compromise.',
        tr: 'Verify NCAP test matrix — MDB oblique, side-pole and far-side tests — confirm single-stage calibration is sufficient; FMVSS 208 dual-stage mandate applies to driver and front passenger frontal only.',
      },
    ],
    top3: [
      { t: 'Knee airbag deletion on BEV high-floor platform', v: 'Full NCAP 5th/50th dummy femur load confirmation without knee bag' },
      { t: 'Centre seat airbag for far-side (delete dedicated far-side module)', v: 'Occupant size matrix validation; seat Tier-1 integration plan' },
      { t: 'Curtain airbag L/R commonisation', v: 'Symmetric packaging review; NRE saving quantification per programme' },
    ],
  },
  {
    id: 'seatbelt-system',
    sub: 'Passive Safety',
    name: 'Seatbelt system',
    baseline: 'Separate pyrotechnic pretensioner per seating position, 2-stage load limiter in spool, 5 unique retractor assemblies per vehicle, separate buckle sensor per position, belt-in-seat on rear-row performance variants.',
    fn: 'Restrain occupant during a crash by tensioning and energy-limiting the belt webbing in precise coordination with airbag deployment — minimising chest deflection, neck load and submarining across all NCAP and FMVSS test scenarios.',
    ideas: [
      {
        t: 'Pretensioner pyrotechnic right-size: 1-stage vs 2-stage gas generator',
        lev: 'Spec opt.',
        save: 'Pretensioner cost −15-20% where 1-stage sufficient',
        bench: 'Autoliv 1-stage pretensioner on rear outboard positions across Toyota/Lexus (2021); ZF TRW right-sizing on Stellantis STLA; Joyson Safety Systems tuned GGU family',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'A 2-stage gas generator fires in two pulses to give a soft-then-hard tensioning profile — necessary for front occupants where chest compression must be managed precisely. Rear outboard seatbelt pretensioners typically need only single-stage tensioning because the NCAP test matrix for rear occupants permits a faster, less calibrated tension event. Audit each position against NCAP test requirements.',
        mfg: 'Gas generator sourced from Autoliv, ZF TRW, Joyson, ARC Automotive. Single-stage GGU is 15–20% cheaper. No vehicle assembly process change — swap at the seatbelt Tier-1.',
        why: 'Pretensioner gas generator is 30–45% of seatbelt module BOM. Right-sizing eliminates unnecessary dual-stage cost on positions where single-stage meets all regulatory and NCAP requirements.',
        tr: 'Validate with full NCAP MDB, far-side and rear-occupant dummy test; rear-occupant NCAP scoring from 2023 requires rear AEB coordination — confirm single-stage timing is adequate.',
      },
      {
        t: 'Load limiter integration in spool — delete external torsion bar assembly',
        lev: 'Consolidation',
        save: 'Delete external load-limiter assembly (£3.4-7.6), part count −3',
        bench: 'Autoliv inertia-reel integrated load limiter across VW MQB platform (2019); Continental Safety integrated torsion bar; ZF TRW iFL (integrated force limiter)',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: "Integrating the torsion-bar load limiter inside the retractor spool (inline with the webbing take-up) eliminates the external load-limiter module and its bracket. Autoliv's integrated design is standard across VW MQB and BMW G-series for 5+ years.",
        mfg: 'Delete external load-limiter housing, torsion bar subassembly and mounting bracket. Retractor supplier absorbs integration — net BOM at vehicle level reduces.',
        why: 'An external load-limiter assembly adds 3+ parts and a separate bracket to each seating position. Integration into the spool is a mature, proven approach that removes these at no performance penalty.',
        tr: 'Integrated spool design increases retractor housing diameter slightly — packaging review with seat and B-pillar packaging team required.',
      },
      {
        t: 'Common seatbelt retractor across front and rear seat positions',
        lev: 'Standardization',
        save: 'SKU reduction −60%, tooling NRE −£0.4-1.27M',
        bench: "Autoliv common retractor platform (CPRS) across Ford C2 platform (Kuga, Galaxy, S-Max 2020); Joyson Safety Systems common rear retractor on VW Group's MQB",
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: "Design a common retractor housing and spool mechanism that serves all seat positions — differentiated only by webbing length, mounting bracket and GGU — rather than a unique retractor per position and per variant. Autoliv's CPRS platform covers front outboard, front centre and rear positions on one housing tool.",
        mfg: 'One spool-housing tool amortised across all positions. Bracket variety is stamped (low-cost tooling). Volume on one retractor housing type improves supplier yield and piece-price leverage.',
        why: 'A typical 5-seat vehicle carries 5 unique retractor part numbers. Commonising to 1–2 families halves or quarters the SKU count, concentrates volume and allows a simpler supplier base.',
        tr: 'Common housing must accommodate packaging variation (angle, mounting hole pattern) across front/rear positions; belt angle sensor (where fitted) must be validated across all positions.',
      },
      {
        t: 'Delete belt-in-seat (BIS) on non-performance rear variants',
        lev: 'Spec opt.',
        save: 'Delete BIS system (£38-77 per seating position)',
        bench: 'Porsche Taycan Sport Turismo BIS on rear (performance variant only); BMW 4-series Gran Coupé BIS rear delete on base trim; Mercedes C-class AMG BIS vs standard',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'Belt-in-seat integrates the seatbelt retractor into the seat backrest instead of the B-pillar — providing better belt geometry for rear occupant protection and enabling bucket-seat packaging. BIS is typically applied only to performance/AMG variants where bucket seating makes B-pillar belt routing impractical. On standard rear bench seats with conventional seating, a B-pillar-mounted retractor meets all NCAP requirements and costs £38–77 less.',
        mfg: 'BIS requires seat integration of retractor, reel cover, webbing guide and buckle routing — all assembled by the seat Tier-1 and tested as part of the seat. Deletion returns retractor to the body-side supplier (simpler BIW interface).',
        why: 'BIS adds significant cost per rear outboard position — £38–77 for the additional hardware integration vs a B-pillar retractor. On non-sport variants with a conventional bench seat, BIS provides no meaningful NCAP advantage.',
        tr: 'Confirm that B-pillar retractor geometry meets NCAP rear-occupant head-protection test (available from 2023 Euro NCAP protocol); validate webbing shoulder alignment for 5th and 95th percentile rear occupants.',
      },
      {
        t: 'Buckle sensor standardise — one part number across all positions',
        lev: 'Standardization',
        save: 'SKU reduction −70%, tooling −£0.2-0.34M',
        bench: 'Ford common buckle sensor on C2 platform (2020); Hyundai/Kia common hall-effect buckle sensor across GN/NE platforms; Autoliv common buckle switch family',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'A common Hall-effect buckle sensor (contact-free, durable) standardised across all seating positions and all vehicle variants. Only the buckle housing and webbing tongue differ. Ford C2 platform uses one common buckle sensor PCB across all 5 positions.',
        mfg: 'One buckle sensor PCB procurement, one qualification. Volume consolidated onto single part number — better leverage with Autoliv/ZF TRW/Joyson. Reduces line-side bin count at vehicle assembly.',
        why: 'Five seating positions with unique buckle sensors (different part numbers due to legacy design) multiplies qualification cost, inventory and supplier diversity. A single common sensor is a straightforward consolidation.',
        tr: 'Confirm common sensor interface (resistance/voltage output) is compatible with ACU and body-control module across all variants before consolidating.',
      },
    ],
    top3: [
      { t: 'Common retractor platform (front + rear)', v: 'Packaging validation across all positions; NCAP rear-occupant geometry confirmation' },
      { t: 'Delete BIS on non-performance rear trims', v: 'NCAP rear-occupant head-protection score without BIS; cost delta vs performance variant' },
      { t: 'Buckle sensor commonisation', v: 'Signal interface compatibility check across ACU variants; volume leverage quantification' },
    ],
  },
];

// ─── INDUSTRY TRENDS ─────────────────────────────────────────────────────────

export const ADAS_TRENDS: AdasTrendItem[] = [
  { t: 'Camera-centric perception replacing radar-fusion on L2 vehicles', status: 'Mainstream', save: 'Forward radar delete (£34-68)', dir: "Tesla Vision (2021) validated camera-only AEB at scale. Mobileye EyeQ6L camera-centric L2+ targets emerging market OEMs at <$50/vehicle. NCAP 2026 updates being monitored — most OEMs hedging with radar-optional architecture rather than full delete." },
  { t: '4D imaging radar displacing LiDAR on L2+ ADAS', status: 'Emerging → Mainstream', save: 'LiDAR delete on L2+: −£170-680', dir: 'Continental ARS540, Arbe Phoenix, ZF PREMIUM 4D entering volume production 2024–25. Stellantis STLA uses 4D radar as primary ranging sensor. LiDAR reserved for L3+. 4D radar at £68–128 vs LiDAR at £170–680+.' },
  { t: 'Solid-state LiDAR entering automotive volume production', status: 'Emerging', save: 'Unit cost −50-70% vs spinning LiDAR', dir: 'Luminar Iris on Volvo EX90 (2024) — first solid-state LiDAR in volume production for L3 highway. Innoviz Two (BMW L3, 2025 roadmap). Aeye IDAR (Stellantis). Cost trajectory toward <$200 by 2027 as volume scales.' },
  { t: 'Euro NCAP DMS mandate (2024) driving shared-SoC DMS adoption', status: 'Mandatory', save: 'Delete standalone DMS ECU (£26-51)', dir: 'Euro NCAP 2024 requires camera-based driver drowsiness and distraction monitoring for 5-star rating. Mobileye EyeQ5H shared ADAS+DMS validated in production (Zeekr 001, 2023). Continental ContiGuard, ZF TRW ProViu360 all consolidating DMS onto shared ADAS SoC.' },
  { t: 'Euro NCAP far-side test from 2023 — centre airbag adoption', status: 'Mandatory', save: 'Replace dedicated far-side module', dir: 'Euro NCAP AOP (Adult Occupant Protection) far-side test from 2023 drives centre airbag fitment. Mercedes S-Class (2021), Toyota bZ4X, Autoliv and ZF TRW all with seat-mounted centre airbag in production. Replaces dedicated far-side thorax bag with single shared module.' },
  { t: 'Rear-occupant passive safety: NCAP rear protocol from 2022', status: 'Mainstream', save: 'Design constraint driving belt/airbag changes', dir: 'Euro NCAP rear-row AEB and occupant protection from 2022 drives rear seatbelt pretensioner calibration, rear curtain bag coverage and rear-seat airbag addition on D-segment+. Autoliv rear inflatable seatbelt (Tesla Model S, Lexus LS) entering consideration for further rear protection.' },
  { t: 'Airbag count right-sizing on BEV high-floor platforms', status: 'Emerging', save: 'Knee airbag delete per vehicle (£15-30/side)', dir: 'Tesla Model 3/Y, BYD Seal, Rivian R1T all achieve NCAP 5-star without knee airbags due to BEV high-sill floor geometry. NCAP analysis confirms femur load reduction from raised H-point. BMW iX and Mercedes EQS also omit knee airbag.' },
  { t: 'Mobileye SuperVision / EyeQ Ultra: camera-based L2+ without LiDAR', status: 'Emerging', save: 'Delete LiDAR on supervised L2+ trims', dir: 'Mobileye SuperVision (NIO ET7, 2023) uses 11 cameras + EyeQ5H for hands-on L2+ highway without LiDAR. EyeQ Ultra (2025 roadmap) targets Level 4 with cameras only. Benchmark pricing for camera-only L2+: ~£128/vehicle vs £340+ with LiDAR.' },
  { t: 'Autoliv / ZF TRW inflatable seatbelt for rear occupants', status: 'Emerging', save: 'Replace rear curtain + thorax airbag with belt', dir: 'Ford Explorer (US, 2011) first — inflatable belt webbing replaces separate side airbag for rear outboard. Reduces rear airbag count by 1–2 modules per vehicle. Autoliv and ZF TRW both offer inflatable rear seatbelt for current OEM programmes targeting NCAP rear-occupant improvement from 2024.' },
];

// ─── COST STRUCTURE ───────────────────────────────────────────────────────────

export const ADAS_COST_STRUCTURE: AdasCostEntry[] = [
  { label: 'Camera & image-processing', pct: 28, color: '#6757c2', note: 'Forward camera SoC (Mobileye EyeQ5/6), surround cameras, image signal processors. Shared SoC (cluster + DMS + surround) and camera-first perception strategy are primary reduction levers.' },
  { label: 'Radar suite (77 GHz)', pct: 22, color: '#2f6fae', note: 'Forward long-range + 4× corner radars. Multi-function corner radar deletes standalone BSM sensors. 4D imaging radar on mid-range programmes replaces LiDAR add-on. Key target for consolidation.' },
  { label: 'LiDAR (L3 models)', pct: 18, color: '#1d9488', note: 'Largest unit-cost sensor (£170–680+). Solid-state right-sizing and 4D imaging radar substitution are the two principal levers. Reserved for L3+ vehicles; right-sized FOV for highway vs full 360° scan.' },
  { label: 'Airbag modules & inflators', pct: 16, color: '#a85f24', note: 'Airbag modules (8–12 per vehicle), gas generators, squibs. Knee airbag deletion on BEV, curtain L/R commonisation, centre airbag for far-side, inflator right-sizing collectively reduce by 15–25%.' },
  { label: 'Seatbelt system', pct: 10, color: '#c08418', note: 'Retractor, pretensioner GGU, load limiter, webbing, buckle sensor. Common retractor platform, pretensioner right-sizing, BIS deletion and buckle sensor standardisation each deliver 8–20% subsystem saving.' },
  { label: 'ADAS domain ECU & wiring', pct: 6, color: '#b1547c', note: 'ADAS domain controller, ACU, sensor harness stubs and connectors. Centralised ACU (delete satellite sensors), shared SoC and 4D radar integration directly reduce ECU count and wiring.' },
];

// ─── MANUFACTURING LEVERS ─────────────────────────────────────────────────────

export const ADAS_MFG_LEVERS: AdasMfgItem[] = [
  { t: 'Camera automated assembly + active optical alignment (6-DOF)', lev: 'Automation', save: '20-30% camera module assembly cost', note: 'Active lens-to-sensor alignment under live image feedback achieves <1 µm accuracy — replacing manual assembly which requires expensive rework. Bosch, Valeo and Continental camera lines are fully automated at >1M units/year.' },
  { t: 'Radar module automated radome bonding and antenna calibration', lev: 'Automation', save: '15-20% radar assembly cost', note: 'Robotic adhesive dispensing for radome bonding + automated antenna pattern calibration in anechoic cell replaces manual bond-and-measure. Reduces calibration time from 8 min to 90 sec per unit at volume.' },
  { t: 'LiDAR solid-state: sealed unit mounting vs spinning-head specialist installation', lev: 'Process', save: 'LiDAR integration station simplified (−40% time)', note: 'Solid-state LiDAR (Luminar Iris) mounts on a simple stamped bracket — no rotating head alignment, no motorised-mount IP67 boot, no vibration-isolation platform. Integration station cycle time halves vs spinning LiDAR.' },
  { t: 'ADAS domain controller single-board test (HIL before vehicle integration)', lev: 'Test', save: 'Catch-at-lowest-cost; rework cost −60%', note: 'Hardware-in-the-loop functional test of ADAS domain controller with simulated sensor inputs catches 90%+ of software and hardware faults before the unit enters the vehicle — avoiding expensive line-stop and re-work at trim/chassis.' },
  { t: 'Airbag module automated inflation fixture and leak test', lev: 'Quality', save: 'Scrap −12%, warranty −15%', note: 'Automated inflation-test fixture at 100% inspection (vs sampling) on every airbag module detects micro-leaks that would cause deployment failure. Drives warranty field returns below 1 ppm — the automotive passive-safety quality target.' },
  { t: 'Seatbelt retractor common housing enabling one assembly fixture', lev: 'Standardization', save: 'Tooling NRE −50-60%, line changeover eliminated', note: 'A common retractor housing across all positions allows one assembly jig to serve front and rear retractors. Eliminates changeover time between position-specific fixtures. Autoliv CPRS achieves this on Ford C2.' },
  { t: 'Curtain airbag symmetric sewing programme (one cut pattern)', lev: 'Process', save: 'Tooling NRE −£0.7-1.27M, L/R inventory simplified', note: 'A single sewing programme for a symmetric curtain airbag runs on the same cutting and sewing machines for both L and R. Halves the programme NRE and eliminates L/R inventory mismatch.' },
  { t: 'Squib/initiator standardised across all airbag positions', lev: 'Standardization', save: 'SKU −50%, procurement leverage ↑', note: 'A common squib part number (standardised connector, resistance and current threshold) across driver airbag, PAB, side, curtain and pretensioner allows volume consolidation with Autoliv/ZF TRW and simplifies incoming inspection.' },
];

// ─── OEM BENCHMARKS ───────────────────────────────────────────────────────────

export const ADAS_OEM_BENCHMARKS: AdasOemBenchmark[] = [
  {
    oem: 'Tesla',
    model: 'Model 3/Y Tesla Vision (2021) & Cybertruck (2023)',
    moves: [
      'Tesla Vision (2021): deleted all forward radar from Model 3/Y/S/X — camera-only AEB using mono forward camera + neural-network depth estimation',
      'Model 3/Y NCAP 5-star without knee airbags: BEV high-floor geometry confirmed femur loads within limits',
      'FSD Computer (Hardware 3, 2019): consolidated 8 discrete ADAS ECUs into one domain controller — benchmark for domain consolidation',
      'Cybertruck (2023): Autopilot Supercomputer with in-house AI inference — deleted Mobileye supply chain entirely',
    ],
  },
  {
    oem: 'Mobileye / NIO',
    model: 'SuperVision on NIO ET7 (2023)',
    moves: [
      'Mobileye SuperVision: 11 cameras + EyeQ5H stereo depth estimation for hands-on L2+ highway — no LiDAR on SuperVision trim',
      'EyeQ5H integrates forward ADAS + surround-view + DMS on single SoC — deletes 3 discrete ECUs',
      'NIO ET7 SuperVision configuration: camera-based rain/light sensing (deleted standalone sensors)',
      'Mobileye EyeQ5H DMS on shared SoC in Zeekr 001 (2023) production — Euro NCAP DMS compliance without standalone DMS ECU',
    ],
  },
  {
    oem: 'Volvo / Luminar',
    model: 'EX90 (2024)',
    moves: [
      'Luminar Iris solid-state LiDAR: first volume-production automotive solid-state LiDAR (MEMS galvo, 250 m range, 120° H × 20° V)',
      'Highway-right-sized FOV: Iris targets highway L3 use case, avoids over-specified 360° spinning LiDAR — 50–70% unit cost reduction vs predecessor',
      'Nvidia Drive Orin domain controller consolidates all ADAS/DMS/surround functions — 4 ECUs → 1 domain',
      'Continental ARS540 4D corner radars replace separate BSM radars — multi-function corner radar deleting standalone blind-spot modules',
    ],
  },
  {
    oem: 'Autoliv / Mercedes-Benz',
    model: 'S-Class W223 (2021) & STLA platform (Stellantis)',
    moves: [
      'Mercedes S-Class (2021): first mass-production centre seat airbag (Autoliv) for far-side protection — deletes dedicated far-side thorax airbag per side',
      'Autoliv CPRS (Common Platform Retractor System): one retractor housing across front/rear positions on Ford C2/Kuga/S-Max — tooling NRE halved',
      'Stellantis STLA platform: curtain airbag L/R commonisation and centralised ACU (Bosch MRS6) deleting 8 satellite sensors across all STLA models',
      'ZF TRW ProViu360: combined surround-view + DMS on shared SoC across Mercedes GLC (2023) — standalone DMS ECU deleted',
    ],
  },
];

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────

export function getAdasComponentsBySubsystem(sub: string) {
  return ADAS_COMPONENTS.filter(c => c.sub === sub);
}

export function getAdasComponentById(id: string) {
  return ADAS_COMPONENTS.find(c => c.id === id);
}

export function getTotalAdasIdeas() {
  return ADAS_COMPONENTS.reduce((acc, c) => acc + c.ideas.length, 0);
}
