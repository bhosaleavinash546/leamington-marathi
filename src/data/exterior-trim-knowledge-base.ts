// Exterior Trim & Ornamentation Knowledge Base
// Source: Exterior Trim Cost Engineer — VAVE & Manufacturing Ideation
// Author: Avinash Bhosale, Senior Cost Improvement Engineer (Propulsion)

export interface ExteriorTrimIdea {
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

export interface ExteriorTrimComponent {
  id: string;
  sub: string;
  name: string;
  baseline: string;
  fn: string;
  ideas: ExteriorTrimIdea[];
  top3: { t: string; v: string }[];
}

export interface ExteriorTrimMfgItem {
  t: string;
  lev: string;
  save: string;
  note: string;
}

export interface ExteriorTrimTrend {
  t: string;
  status: string;
  save: string;
  dir: string;
}

export interface ExteriorTrimBenchmark {
  oem: string;
  model: string;
  moves: string[];
}

// ─── COMPONENT IDEAS DATABASE ────────────────────────────────────────────────

export const EXTERIOR_TRIM_COMPONENTS: ExteriorTrimComponent[] = [
  {
    id: 'grille-shutters',
    sub: 'Front Grille & Active Aero',
    name: 'Front grille, active grille shutters & air management',
    baseline: 'Chromed ABS grille surround with open mesh insert, multi-zone active grille shutter (AGS) system with 2 actuator motors, separate radar bracket behind grille mesh, passive air curtains formed in bumper fascia ends.',
    fn: 'Manage aerodynamic drag and brake cooling airflow; provide brand-identity face; integrate long-range radar mounting; enable active aero for fuel economy and EV range.',
    ideas: [
      {
        t: 'AGS actuator right-size: delete multi-zone to single-zone for non-performance variants',
        lev: 'Spec opt.',
        save: '€18-32/unit (delete 1 actuator motor + linkage + ECU zone)',
        bench: 'Valeo single-zone AGS (2021, applied Renault Arkana / Nissan Qashqai); Continental single-zone AGS on Ford Puma (2022)',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Low',
        new: 1,
        tech: 'Multi-zone AGS (upper + lower independently controlled) was introduced to optimise airflow to separate brake duct and radiator cooling zones independently. For non-performance, non-towing vehicles where cooling demands are moderate, aerodynamic simulation consistently shows that single-zone AGS achieves 90-95% of the Cd improvement of dual-zone with one actuator motor. Valeo validated single-zone AGS on Renault Arkana achieving Cd 0.28 — equivalent to dual-zone performance on that vehicle class. Continental applied the same logic to Ford Puma, deleting the upper-zone actuator on standard-range variants.',
        mfg: 'Deletes one actuator motor (brushless DC €8-14), one gear-train linkage assembly, one ECU control channel, and the associated wiring harness branch (1.2-2.0m sub-loom). AGS assembly fixture is simplified — single-motor drive train vs dual-motor with synchronisation requirement.',
        why: 'Multi-zone AGS is driven by performance and towing variants that must manage heavy cooling loads independently. Standard-range non-performance variants never stress both zones simultaneously in real-world use. Specifying dual-zone on all variants means 70%+ of the build volume pays for actuation authority it never uses. Single-zone achieves the same Cd improvement for the standard use case.',
        tr: 'Cooling validation at maximum sustained load (trailer towing at motorway speed in 40°C ambient); Cd measurement confirmation at single-zone full-open/full-closed; NCAP active safety sensor obstruction check.',
      },
      {
        t: 'Passive grille delete on BEV — smooth surface replacing open mesh',
        lev: 'Consolidation',
        save: '€22-38/unit (delete grille mesh, surround, separate AGS sub-assembly)',
        bench: 'Tesla Model 3/Y (2017–, sealed front fascia); BMW iX (2021, smooth shield front); Hyundai Ioniq 6 (2022, aerodynamic pixel shield)',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Low',
        new: 1,
        tech: 'Battery electric vehicles have no combustion engine requiring large cooling airflow through the grille opening. The thermal management system for motor, inverter and battery operates at lower cooling demand (lower waste heat) and can be served by a smaller sealed duct with a dedicated HVAC-loop radiator behind a partially-open lower fascia. A smooth or low-porosity front shield (Tesla, BMW iX, Ioniq 6 Parametric Pixel shield) achieves Cd 0.21-0.23 vs a traditional grille opening at 0.27-0.30, directly extending range. Deleting the open grille mesh, its chrome surround, AGS shutter system and bracket removes 5-9 individual parts.',
        mfg: 'Smooth front shield is a single PP or PP/TPO injection moulding with optional painted or body-colour finish. Replaces grille mesh (injection-moulded or die-cut), chrome surround (plated ABS), AGS shutter assembly, and separate radar bracket. Reduces front module assembly operations by 4-7 steps. Eliminates electroplating process from supply chain.',
        why: 'The traditional grille is a design legacy from the ICE era where large radiator airflow was essential. BEV thermal management does not require it. A smooth front surface is aerodynamically superior, has fewer parts, no moving components, and no chrome plating. Every BEV that carries a cosmetic open-grille adds unnecessary cost and aerodynamic drag (range penalty). Industry trend is clearly toward smooth or near-sealed fronts on BEV.',
        tr: 'Thermal validation of motor/inverter/battery at maximum load in worst-case ambient without large grille opening; pedestrian protection regulation compliance with solid shield; brand identity continuity in design studio sign-off.',
      },
      {
        t: 'Grille integration with radar bracket — common moulding delete separate bracket',
        lev: 'Consolidation',
        save: '€4-9/unit (delete separate radar bracket + 4-6 fasteners)',
        bench: 'Continental radar integration on VW ID.4 front module (2021); Valeo long-range radar bracket integrated in Stellantis STLA front module grille (2022)',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'Long-range radar (LRR) sensors for ACC/AEB/highway assist are mounted behind the front grille in a separate bracket that is located to the front bumper beam or front end module. This bracket requires precise positioning (±1.5mm) for sensor alignment. Integrating the radar location boss and bracket tabs directly into the grille moulding achieves the same positioning accuracy from the grille datum, eliminating the separate stamped steel or PP-GF bracket. Valeo demonstrated this on STLA platform front module, reducing bracket and assembly interface. Continental validated LRR integration into VW ID.4 grille structure with repeatable radar alignment within specification.',
        mfg: 'Radar positioning boss moulded into grille surround — no additional tool required beyond adding bosses/locators in the existing grille tool (tool modification €3-8K vs separate bracket tool €15-25K). Deletes separate bracket, 4-6 fasteners and torque operations. Front-of-dash (FOD) assembly operation simplified.',
        why: 'Separate radar brackets are a symptom of sequential engineering where radar was added to a vehicle architecture designed before radar was a standard feature. Integrated design from the outset — or a platform re-tooling — achieves the same sensor positioning with fewer parts. Positioning accuracy from the grille moulding datum is comparable to a separate bracket when the moulding is properly located.',
        tr: 'Radar alignment validation over temperature (grille thermal expansion vs alignment tolerance); vibration fatigue at grille natural frequency; grille replacement/serviceability sequence for radar recalibration.',
      },
      {
        t: 'Front active air curtains integration in bumper fascia — delete separate duct inserts',
        lev: 'Consolidation',
        save: '€6-12/unit (delete separate air curtain duct + fasteners)',
        bench: 'JLR Defender L663 (moulded-in air curtain channels, 2020); BMW G07 X7 (integrated active air curtain in front fascia, 2022)',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'Front wheel air curtains — ducts that guide airflow from the front fascia opening to the front wheel arch, reducing turbulence drag from rotating wheels — are commonly supplied as separate injection-moulded duct inserts clipped into the front bumper fascia. Integrating the air curtain channel geometry directly into the bumper fascia moulding (thickened rib structures forming the duct wall) achieves equivalent Cd reduction without a separate part. JLR integrated air curtain channels on Defender L663 fascia, deleting a separate duct insert. BMW G07 X7 front fascia incorporates active air curtain flap geometry within the one-shot fascia moulding.',
        mfg: 'Additional ribs in the bumper fascia tool create the air curtain geometry — tool modification vs separate duct tool and assembly. Deletes the separate duct moulding, its sub-assembly fixturing, and the clip-in assembly operation at the trim line. Reduces FOL (front-of-line) assembly parts by 2 per vehicle.',
        why: 'Separate air curtain duct inserts are commonly added as incremental aerodynamic improvements after the front fascia geometry was frozen — a late-change workaround. Platform-integrated design incorporates them from the outset in the fascia moulding, achieving the same aerodynamic result with no additional parts. Deletion of a clip-in part also removes a rattling failure mode.',
        tr: 'CFD validation of integrated channel geometry vs separate duct; Cd measurement confirmation on vehicle; injection moulding flow-fill analysis for thickened rib areas to ensure no sink marks on Class A surface.',
      },
      {
        t: 'AGS linkage simplification: 2 actuator motors → 1 via common drive shaft',
        lev: 'Design',
        save: '€12-20/unit (delete 1 motor + 1 separate linkage drive)',
        bench: 'Brose single-motor AGS with common drive shaft (2022); Valeo AGS mono-motor architecture on Renault Megane E-Tech',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Low',
        tech: 'Dual-motor AGS systems use independent actuators for upper and lower shutter zones to allow independent control. Where single-zone control is acceptable, a mechanically coupled single-motor system driving both zones via a common shaft and linkage provides full open/close operation from one motor. Brose commercialised a single-motor AGS with a common horizontal drive shaft that synchronously operates all shutter blades across both zones via a slotted-link mechanism. Valeo applied the same approach on Renault Megane E-Tech BEV, achieving open/close cycle time equivalent to dual-motor with one actuator.',
        mfg: 'Deletes one brushless DC motor (€8-14), one motor bracket, one independent control harness stub, and its ECU driver circuit. Common shaft adds a minor linkage cost (€2-3) but net saving is €10-17/unit. Assembly sequence simplifies to single motor attachment and one electrical connection.',
        why: 'Two independent actuator motors on a single-zone application are redundant mechanical complexity. The original dual-motor design enables zone-independent control that non-performance variants never exploit. A common-shaft single-motor design achieves the required open/close function with simpler mechanics, lower part count and reduced harness complexity.',
        tr: 'Simultaneous blade actuation synchronisation validation (no blade bind across full thermal range); motor torque adequacy at minimum temperature (blade seal friction at −30°C); fail-safe open validation for cooling.',
      },
    ],
    top3: [
      { t: 'Delete AGS entirely on BEV — smooth front shield', v: 'Thermal validation at max load; pedestrian protection compliance; brand design sign-off' },
      { t: 'Single-zone AGS replacing multi-zone on standard variants', v: 'Cooling validation at towing condition; Cd confirmation; save validation per derivative' },
      { t: 'Grille integration with radar bracket', v: 'Radar alignment over temperature; vibration fatigue; serviceability sequence' },
    ],
  },
  {
    id: 'badges-emblems',
    sub: 'Badges & Brand Identity',
    name: 'Badges, emblems & powertrain designation',
    baseline: 'Backlit illuminated brand badge (LED + wiring + diffuser) on non-flagship, clip-on badge mounting with 4-6 retention clips, derivative-specific EV/PHEV/hybrid designation badges, separate front and rear badge part numbers on symmetric designs.',
    fn: 'Communicate brand identity, model grade and powertrain designation; provide illuminated brand presence on flagship; retain securely across all environments over vehicle life.',
    ideas: [
      {
        t: 'Backlit illuminated badge delete on non-flagship — replace with non-lit adhesive badge',
        lev: 'Consolidation',
        save: '€14-26/unit (delete LED board + wiring + diffuser + ECU channel)',
        bench: 'VW ID.3/ID.4 base/Style (non-lit badge on non-GTX), BMW i4 eDrive35 (non-lit vs M50); Tesla Model 3 (no badge illumination on standard range)',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Low',
        new: 1,
        tech: 'Illuminated brand badges (e.g. VW/BMW/JLR branded glowing emblems) use an LED light-guide assembly with a dedicated wiring stub and ECU lighting channel. This system adds meaningful cost (LED PCB, diffuser moulding, connector, wiring, ECU driver) for what is a flagship-differentiating feature. Non-flagship derivatives on the same platform can use a conventional adhesive-bonded non-lit badge with identical graphic design, removing the entire electronic assembly. VW differentiates GTX (illuminated) vs ID.3/ID.4 Style (non-lit) on the same badge aperture. BMW M50 has animated illuminated badge; eDrive35 does not.',
        mfg: 'Deletes LED PCB sub-assembly, wiring loom stub (0.4-0.8m), in-loom connector, and ECU lighting driver assignment. Non-lit badge is an injection-moulded and vacuum-metallised unit with 3M VHB tape backing — one push-fit install operation vs connect + press + tuck wiring. Simplifies lighting ECU software calibration across derivatives.',
        why: 'Badge illumination is a luxury differentiation feature justified at flagship/performance trim. Specifying it across the volume trim levels means 60-70% of the build carries a costly electronic feature without a commercial premium to recover the cost. Non-lit badge achieves identical brand communication for the majority of customers at substantially lower cost.',
        tr: 'Class A surface quality of non-lit badge at same aperture as lit version; 3M VHB tape adhesive durability over temperature range (−40°C to +85°C, 1,000 cycles); UV yellowing validation on badge diffuser if non-lit version retains diffuser cosmetically.',
      },
      {
        t: 'Badge adhesive direct-bond replacing clip-on mounting — delete 4-6 retention clips',
        lev: 'Design',
        save: '€1.80-3.50/unit (delete clips + boss tooling + assembly ops)',
        bench: '3M VHB 5952 badge bonding (adopted BMW G-series badge standardisation, 2019); Henkel Terokal badge adhesive bonding (JLR L461 New Defender)',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'Traditional clip-on badge mounting uses 4-6 injection-moulded PP retention clips on the badge rear that press-fit into corresponding bosses on the body panel — requiring accurately positioned boss tooling in the body die. 3M VHB structural adhesive tape (5952 series, 1.1mm, double-sided acrylic foam) provides equivalent badge retention across the specified temperature and vibration envelope without retention clips. BMW standardised VHB badge bonding across the G-series (G20, G30, G01, G05) from 2019, deleting body panel clip bosses and badge retention lugs. JLR applied the same approach on the L461 Defender.',
        mfg: 'Deletes 4-6 injection-moulded retention clips on badge rear, body panel clip bosses (requiring dedicated spot in body die or separate bracket), and clip-press assembly operation. VHB-bonded badge installation is a peel-and-press operation (15-20 seconds) replacing clip-align-and-press (30-45 seconds with alignment checking). Eliminates clip-alignment gauging fixture on the trim line.',
        why: 'Retention clips are a common badge mounting failure mode — clips break at extreme temperatures and can allow badge lifting. VHB bonding is structurally superior, weather-resistant to −40°C / +120°C, and simpler to install. Deleting the clip hardware and body boss tooling is a straightforward cost reduction that also improves quality.',
        tr: '3M VHB 5952 peel force validation at +85°C (hot-soak garage) and −40°C; UV durability at badge bond line over 15 years; badge removal for panel repair (hot-wire removal procedure must be validated with body shop tooling).',
      },
      {
        t: 'Common badge family across models — volume pricing and tooling rationalisation',
        lev: 'Standardization',
        save: '€0.60-1.40/unit piece price (volume consolidation) + €15-30K tooling NRE per model avoided',
        bench: 'Toyota global badge standardisation (2019, common badge across Corolla/RAV4/Camry/C-HR in 14 markets); Renault Group common badge across Renault/Dacia (2021, shared badge supplier)',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'Brand badge shape, fixings and graphics are historically designed per nameplate even within the same brand family, resulting in multiple badge variants, multiple tool sets, multiple supplier qualifications and split purchase volumes. Standardising badge geometry (outer envelope, adhesive footprint, and finish specification) across all models in a brand family allows one tool, one supplier and consolidated purchase volume. Toyota standardised the front/rear badge outer envelope across all global nameplates (Corolla, RAV4, Camry, C-HR) from 2019 — nameplate differentiation is via front badging only, not the brand emblem itself. Renault/Dacia consolidated badge supplier to single Tier-1 for both brands from 2021.',
        mfg: 'One injection mould tool + chrome/vacuum-metallising process covers all models. Volume on one SKU improves supplier throughput pricing and reduces safety-stock holding. Reduces supplier qualification and quality approval overhead (one PPAP, one material specification, one supplier audit).',
        why: 'Per-model badge design is a legacy of nameplate-specific engineering that predates modern platform thinking. The brand emblem — the most common badge — is legally identical across all models; only the nameplate designation differs. Consolidating the brand emblem to one global part achieves volume pricing without any customer-visible change.',
        tr: 'Trademark/legal review of common badge across markets; surface finish consistency across models (Class A matching assessment); lifecycle change management across all models if badge design evolves.',
      },
      {
        t: 'Front/rear badge same part number on symmetric design variants',
        lev: 'Standardization',
        save: '€0.40-0.90/unit (1 part number deleted) + 50% tooling on badge',
        bench: 'Tesla (front/rear T-badge same P/N on Model 3/Y, 2017–); BMW iX (same badge front/rear, 2021); Skoda (same winged badge front/rear on Octavia Mk4)',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'Many badge designs are geometrically symmetric (circular, oval or rectangular without direction-specific graphics), but the front and rear badges are historically specified as separate part numbers due to different fixing dimensions, sizes or reflective backing requirements. On symmetric badge designs, specifying a common badge for front and rear — with a common adhesive footprint — halves the badge tooling investment and consolidates purchase volume. Tesla uses an identical T-badge front and rear on Model 3 and Model Y with the same 3M VHB adhesive backing. BMW iX uses an identical badge front and rear. Skoda Octavia Mk4 shares the front/rear Skoda winged badge.',
        mfg: 'One injection tool and one metallising fixture replaces two. One part number on BOM, one kanban, one quality release, one warranty tracking number. Assembly line runs one SKU for both front and rear badge install stations.',
        why: 'Front/rear badge differentiation is an unnecessary part proliferation on symmetric designs. The front and rear may differ in position, surface curvature and ambient lighting — but not in the badge itself. Standardising eliminates one BOM entry, one tool, one supplier delivery stream, and half the safety-stock.',
        tr: 'Verify surface curvature compatibility of common adhesive footprint on both front and rear panel radii; confirm same part passes both front stone-chip environment and rear tail-light thermal soak at 85°C; nameplate regulation check for mandatory rear-only identification requirements.',
      },
      {
        t: 'EV/PHEV/hybrid designation badge standardise across powertrain variants',
        lev: 'Standardization',
        save: '€0.50-1.20/unit + tooling rationalisation',
        bench: 'Stellantis "e" powertrain badge across Peugeot/Citroën/Opel BEV/PHEV (2021, common badge family); Hyundai Ioniq sub-brand badge standardisation across Ioniq 5/6/7 (2022)',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'As powertrain variants (BEV, PHEV, HEV, MHEV) multiply, each is commonly given a unique designation badge — "e-Tron", "xDrive30e", "eHybrid", "Plug-In Hybrid" — often as model-specific parts with no cross-derivative commonality. Stellantis standardised a single "e" suffix badge across all electrified Peugeot (e-208, e-2008), Citroën (ë-C4), and Opel (Corsa-e) models — one injection tool, one metallising process, one part number covering 6+ derivatives. Hyundai created a common Ioniq sub-brand graphic badge applied consistently across Ioniq 5, 6, and 7.',
        mfg: 'One tool, one part, one finish specification for all powertrain designation badges within the platform family. Eliminates per-model badge tooling (€6-12K per designation badge tool). Simplifies logistics across the production line (one bin covering all electrified variants vs separate bins per powertrain badge).',
        why: 'Proliferation of powertrain designation badges is driven by marketing differentiation that rarely justifies the engineering cost of maintaining multiple unique parts. A standardised powertrain badge family across the model range reduces part count, tooling investment, and supply chain complexity with no consumer-perceptible quality impact.',
        tr: 'Trademark review per market for standardised powertrain designation; confirm marketing sign-off on common badge across sub-brands; ensure badge size is appropriate for all body panel locations across model range.',
      },
    ],
    top3: [
      { t: 'Delete illuminated badge on non-flagship', v: 'Class A surface quality at badge aperture; VHB temp durability; ECU channel freed' },
      { t: 'VHB direct-bond replacing clip-on', v: 'Peel force at +85°C and −40°C; panel repair removal procedure' },
      { t: 'Common badge family across models', v: 'Volume consolidation pricing; trademark/legal review; Class A consistency' },
    ],
  },
  {
    id: 'wheel-arch-cladding',
    sub: 'Wheel Arch & Underbody',
    name: 'Wheel arch cladding, underbody shields & towing hardware',
    baseline: 'PP-EPDM wheel arch cladding painted in body colour (separate paint process), L/R asymmetric arch liner mouldings with separate tools, HDPE underbody shield on front, separate tow bar bracket welded to rear bumper beam, side step as standard equipment on 4x4 spec.',
    fn: 'Protect body panels from stone chips and road debris; reduce aerodynamic drag under vehicle; provide towing attachment; enable side access on high-ride-height vehicles.',
    ideas: [
      {
        t: 'PP-EPDM cladding in-mould colour — delete paint process',
        lev: 'Process',
        save: '€8-18/unit (delete external paint operation per cladding set)',
        bench: 'Toyota RAV4 (IMC black/dark grey arch cladding, 2019–); Honda CR-V (IMC PP-EPDM cladding 2023); Valeo/Plastic Omnium IMC process',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Low',
        new: 1,
        tech: 'In-mould colour (IMC) PP-EPDM arch cladding uses pigmented polymer compounded to final colour (typically matt black or dark graphite grey) and moulded to a Class A surface finish — eliminating the post-mould painting process. Toyota RAV4 and Honda CR-V both specify IMC black PP-EPDM arch cladding, validated for UV durability, stone-chip resistance and colour stability over 10 years/150K km. The IMC material (PP-EPDM + UV stabiliser package from LyondellBasell Hifax or Borealis Daplen) achieves Class A finish directly from the tool, meeting the same visual specification as painted cladding at lower total cost.',
        mfg: 'Eliminates the entire external painting process for arch cladding: no primer, no paint, no clear coat, no paint booth capital allocation, no paint masking, no flash-off oven. Reduces energy consumption per unit by 35-50% vs painted equivalent. Cycle time at trim line reduces by 1 operation (no paint inspection before installation).',
        why: 'External painting of plastic cladding adds 3-4 process steps (prime, paint, cure, inspect) that are fully eliminated by IMC specification. Paint adds €6-14/unit in materials and process cost per cladding set. IMC also eliminates paint delamination warranty claims (typically 0.2-0.4 failures/1000 vehicles on painted PP-EPDM) — a quality improvement compounding the cost benefit.',
        tr: 'UV yellowing/greying resistance over 10-year outdoor exposure (Florida and Arizona weathering test); stone-chip resistance at −30°C on brittle PP-EPDM; gloss consistency Class A specification per viewing angle; scratch resistance vs painted equivalent (pencil hardness H).',
      },
      {
        t: 'Common L/R symmetric arch liner — shared tool halving liner tooling',
        lev: 'Standardization',
        save: '50% arch liner tooling cost (€25-45K per derivative saved) + 1 part number deleted',
        bench: 'Renault Megane E-Tech (symmetric front arch liner, 2022); Ford Kuga (symmetric rear arch liner, 2021); BMW G-series common arch liner strategy',
        v8: 'any',
        mat: 'Proven',
        risk: 'Med',
        tech: 'Arch liners (inner wheelarch guards) are typically moulded as L/R mirrored parts using separate tools, despite carrying no structural load and having no handed features beyond panel-location clips. Designing the arch liner geometry to be symmetric about the vehicle centreline — with clip positions mirrored from one shared tool using a mirror-image cavity — achieves the same stone-chip protection with one tool. Renault adopted this for Megane E-Tech front arch liner with symmetric clip pattern; Ford Kuga rear arch liner uses a symmetric design with flip-reversible clip bosses. BMW G-series arch liner strategy defines common symmetric profiles wherever tyre/suspension clearance geometry allows.',
        mfg: 'One injection tool (€25-45K per size) replaces two (€50-90K combined). One part number on BOM. If the tool uses a flippable cavity, the same tool physically produces both L and R variants in sequence — maximum tooling amortisation. Sub-assembly operation is identical; the liner is simply flipped at installation.',
        why: 'L/R arch liners are a classic part-proliferation opportunity — they are identical in function and nearly identical in geometry. Separate tools are justified only if the wheel arch geometry is genuinely asymmetric, which in practice is rare for the front and common for rear only on some platform layouts. Designing for symmetry from the outset eliminates one tool for every arch liner in the vehicle.',
        tr: 'Clearance check of symmetric geometry against full wheel-suspension-turn envelope at jounce/rebound; NVH patter validation of symmetric clip pattern (both L and R installed from same tool); fuel economy neutral (no aero change vs asymmetric liner).',
      },
      {
        t: 'Underbody shield PP-LGF vs HDPE — structural front shield replacing non-structural HDPE',
        lev: 'Material',
        save: '€5-10/unit (delete secondary reinforcement bracket at mounting points)',
        bench: 'JLR Discovery Sport L550 PP-LGF front underbody shield (2019–); Volvo XC60 PP-LGF front engine shield replacing HDPE (2021)',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'HDPE underbody shields are non-structural and require separate steel reinforcement brackets at mounting point areas to distribute fastener loads without shield tearing. PP-LGF (long-glass-fibre reinforced polypropylene, 30-40% GF) provides sufficient stiffness and strength at mounting points to eliminate the separate reinforcement brackets, while offering a 15-25% mass saving over HDPE. JLR L550 front engine shield in PP-LGF 30GF eliminates 3 steel reinforcement brackets vs the prior HDPE part. Volvo XC60 made the same transition in 2021. PP-LGF also offers better thermal resistance (HDT 160°C vs HDPE 80°C), relevant for shields near exhaust systems.',
        mfg: 'PP-LGF is injection-moulded vs HDPE thermoformed — different process requiring injection tool vs press tool. However, brackets moulded into the PP-LGF part eliminate separate metal stampings, their tooling, and the assembly operation to attach them. Net process change is favourable — fewer parts and operations at comparable capital investment.',
        why: 'HDPE shields are lightweight and cheap per area, but require reinforcement at every attachment point. PP-LGF\'s structural capability at 30% glass loading allows the shield to be self-supporting without brackets — a consolidation that removes metal parts from the underbody and simplifies the assembly sequence. The mass saving vs HDPE+brackets is also positive.',
        tr: 'Ground clearance/stone-impact resistance validation of PP-LGF vs thermoformed HDPE in rough-road test; fastener pull-out force at mounting boss (PP-LGF must meet same clamp load as HDPE+bracket); NVH drum-rattle validation of stiffer PP-LGF shield at excitation frequency.',
      },
      {
        t: 'Tow bar bracket integration in rear bumper beam casting — delete separate weld-on bracket',
        lev: 'Consolidation',
        save: '€12-22/unit (delete bracket stamping + weld operation + reinforcement)',
        bench: 'Volvo XC60/XC90 Al rear bumper beam with integral tow point (2017–); JLR Defender tow bracket integrated in rear bumper cross-beam (L663, 2020)',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Med',
        tech: 'Tow bar attachment typically requires a dedicated reinforcement bracket welded or bolted to the rear bumper beam and rear rail structure, rated to the required vertical/horizontal/diagonal towing loads. Integrating the tow attachment eye or receiver tube mounting bosses into the rear bumper beam casting/extrusion at design — particularly on Al rear beams — eliminates the separate bracket while achieving the required tow rating. Volvo XC60 and XC90 Al rear bumper beams include integral tow attachment bosses as cast features of the Al extrusion. JLR Defender L663 integrates the tow receiver tube mounting into the rear bumper cross-beam structure, deleting a separate weld-on bracket.',
        mfg: 'Tow bracket integration is a design-time change — the Al extrusion or HPDC beam die is modified to include mounting bosses as cast features. Eliminates the bracket stamping tool (€15-25K), bracket welding/press operation, weld inspection, and the bracket part itself. On Al extrusion beams, the boss is machined from the extrusion — no additional casting tool required.',
        why: 'Separate tow bar brackets are a parts proliferation and assembly complication driven by late-stage trailer hitch engineering. Designing the mounting integral to the rear beam from the outset delivers a cleaner, stronger load path (direct load transfer to the beam section vs a welded bracket with stress concentration at welds), fewer parts, and lower assembly cost.',
        tr: 'Tow ball vertical load (750N MSLD) and diagonal load validation on integrated boss geometry; fatigue test at towing loads over 100K cycles; rear beam crush performance (IIHS/RCAR) must not be compromised by tow boss integration.',
      },
      {
        t: 'Side step delete on non-4x4 specification — €55-120 per vehicle saving',
        lev: 'Spec opt.',
        save: '€55-120/unit (delete side step tube + mounting brackets + sub-assembly)',
        bench: 'Ford Ranger Raptor (delete side step vs standard Ranger, 2022–); Toyota Hilux GR Sport (delete step vs Invincible, 2022); JLR Defender 110 (delete step on SE/HSE vs base D110)',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Low',
        new: 1,
        tech: 'Side steps (running boards) are functionally required on vehicles with high sill height (pickup trucks, large SUVs) where door sill height exceeds 650mm and egress requires assistance. For variants with lower suspension settings, urban-spec tyres, and reduced ride height, the sill height may be below the egress-assistance threshold and the side step can be deleted without usability impact. Ford Ranger Raptor (performance-spec, standard ride height) deletes the side step vs the standard Ranger which carries it. Toyota Hilux GR Sport (lower suspension) deletes step vs Invincible grade. JLR Defender 110 SE/HSE deletes step, relying on the sill grab handle instead.',
        mfg: 'Deletes extruded Al or roll-formed steel side step tube, 4-6 steel mounting brackets, bracket welding sub-assembly, and trim-line installation (2-3 min per vehicle). Deleting the mounting bracket welding operation also removes a weld quality check from the rear quarter lower sub-assembly. Underbody weight saving 4-8 kg per vehicle.',
        why: 'Side steps are specified uniformly across variants for dealer simplicity but represent €55-120 of avoidable cost on variants where the functional case is weak (lower ride height, urban customer profile). Offering step deletion as a standard non-spec derivative differentiator is a straightforward VAVE saving — the step can remain as a dealer-fit or factory option on high-ride variants.',
        tr: 'Egress/ingress usability assessment at sill height on non-step variants with 5th/95th percentile users; lower body panel paint/corrosion exposure without step (check if step shadows the rocker); trailer wiring check if step mount carries trailer socket bracket.',
      },
    ],
    top3: [
      { t: 'IMC cladding delete paint process', v: 'UV weathering 10yr; stone-chip at −30°C; Class A gloss consistency' },
      { t: 'Symmetric arch liner shared tool', v: 'Clearance check vs full suspension travel; clip pattern NVH' },
      { t: 'Side step delete on non-4x4 spec', v: 'Ergonomic usability assessment at sill height; corrosion exposure on rocker' },
    ],
  },
  {
    id: 'exterior-sealing',
    sub: 'Exterior Seals & Closures',
    name: 'Window seals, belt-line seals, weather strips & glass channels',
    baseline: 'Window surround seal derivative-specific per door width, separate belt-line seal per side with derivative-specific lengths, seam sealer applied around full door perimeter on adhesive-bonded Al door, weather strip end-caps separately moulded and assembled, separate glass channel profiles for front and rear doors.',
    fn: 'Provide water ingress sealing, wind noise isolation, glass guidance and UV/weathering protection at all closure interfaces over vehicle life.',
    ideas: [
      {
        t: 'Window surround seal geometry standardise across door widths',
        lev: 'Standardization',
        save: '€4-9/unit (reduce seal SKUs; volume pricing on common profile)',
        bench: 'VW MQB belt-line seal standardisation across Golf/Tiguan/Passat (Hutchinson, 2020); Toyoda Gosei window seal platform strategy across Toyota TNGA-K variants',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'Window surround seals (door glass run channels and outer belt-line finisher) are typically styled per derivative, with profile cross-section varying across door widths and models. Standardising the seal cross-section geometry across all door variants on a platform — varying only the extruded length — allows one die, one rubber compound specification, and one process to produce seals for all derivatives. VW rationalised MQB belt-line seal cross-sections across Golf 8, Tiguan 2 and Passat B9 via a common Hutchinson die family, varying only length and end-cap clip spacing. Toyoda Gosei standardised TNGA-K window surround profiles across Camry, RAV4 and Highlander.',
        mfg: 'One extrusion die (€8-15K) replaces 3-4 derivative dies (€25-45K combined). One compound specification and one colour specification across all variants. Volume consolidation on one rubber compound improves raw material pricing and reduces safety-stock. End-cap tooling may remain derivative-specific (body angle variation) but is low-cost injection tool.',
        why: 'Window seal profiles are geometrically very similar across derivatives on the same platform — the functional requirements (water shed angle, glass contact force, UV resistance) are identical. Cross-section differentiation is historically driven by styling desire for derivative distinctiveness that customers rarely perceive in the seal profile. Standardising the invisible cross-section geometry is a pure cost saving.',
        tr: 'Wind tunnel NVH validation of common seal profile on all door/glass combinations across platform; water ingress test at worst-case pressure wash and driving rain; glass run friction validation across full travel range.',
      },
      {
        t: 'Belt-line seal common across derivatives — volume pricing via platform standardisation',
        lev: 'Standardization',
        save: '€3-7/unit (compound volume + die amortisation)',
        bench: 'Stellantis STLA Medium belt-line seal standardisation (Nishikawa, 2022); JLR MLA belt-line seal common profile across Defender/Discovery 5 (Schlegel/Cooper Standard, 2020)',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'Belt-line seals (inner and outer) are specified per derivative, with compound, cross-section and clip geometry varying across models. On a common platform architecture, the door cross-section and glass geometry are shared — the belt-line seal cross-section functional requirements are therefore identical. Defining a platform-wide belt-line seal family with a common cross-section and compound specification, differentiated only by length and end termination geometry, allows volume consolidation across all platform derivatives. Stellantis STLA Medium standardised belt-line seals across Peugeot 308/408, Citroën C5X and DS4 via Nishikawa. JLR consolidated MLA belt-line seals across Defender 110/90 and Discovery 5.',
        mfg: 'One extrusion compound, one colour specification, one die geometry. Volume on one seal family doubles or triples, improving raw material (EPDM/TPV) batch pricing and reducing formulation changeover on extrusion lines. Reduces supplier qualification to one cross-section family per platform.',
        why: 'Belt-line seal differentiation across derivatives is driven by historical model-by-model engineering without platform-level standardisation. Consolidating to a common cross-section captures volume pricing benefits and reduces tooling, qualification, and supply chain complexity with no consumer impact.',
        tr: 'Water ingress validation across all door sizes with common seal profile; glass insertion/extraction force uniformity; UV/ozone resistance of common compound across geographic markets.',
      },
      {
        t: 'Door seam sealer delete on adhesive-bonded Al door — structural adhesive provides seal function',
        lev: 'Consolidation',
        save: '€3-6/unit (delete seam sealer application, material and baking)',
        bench: 'Jaguar XE/XF aluminium door adhesive-bond design (Sika SikaBiresin, 2015–): no hemming seam sealer required; BMW 3 Series G20 Al door bonded hem — structural adhesive replaces seam sealer at inner/outer hem',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Low',
        new: 1,
        tech: 'Steel door construction uses hemming followed by PVC-based seam sealer applied to the hemmed flange periphery to prevent water ingress and corrosion at the hem joint. Aluminium door panels bonded with structural epoxy adhesive (Sika SikaBiresin, Henkel Terokal 5020) at the hem joint achieve equivalent sealing through the adhesive bond line — PVC seam sealer is not required at adhesively bonded Al hem flanges because the structural adhesive is continuous and waterproof. JLR adopted adhesive-only Al door construction on XE/XF, eliminating seam sealer at the door hem. BMW G20 Al doors use structural adhesive at the hem, reducing seam sealer to a cosmetic bead at exposed edges only.',
        mfg: 'Deletes the seam sealer dispensing robot pass (or manual gun application), the PVC sealer material cost, and the baking cycle required to cure PVC sealers on painted bodies. Reduces body shop energy consumption and cycle time. Structural adhesive (already applied for bonding) provides the sealing function without additional material or process.',
        why: 'PVC seam sealer on aluminium doors is a direct carry-over from steel body practice. Structural adhesive bonding of Al doors is materially different from steel spot-weld + hem — the adhesive is already continuous and waterproof. Applying additional seam sealer is double-sealing that adds cost and process without functional benefit. Deleting it recognises the aluminium joining process as fundamentally different from steel.',
        tr: 'Water ingress soak test on bonded-only hem joint (pressure wash equivalent, per IP requirements); corrosion test at Al hem joint without sealer (Al galvanic protection from adhesive must be validated); bond line inspection method for 100% quality verification without sealer masking.',
      },
      {
        t: 'Weather strip end-caps injection-moulded in seal — delete separate assembly operation',
        lev: 'Consolidation',
        save: '€1.20-2.40/unit (delete separate end-cap parts + assembly)',
        bench: 'Nishikawa over-moulded end-cap door seal (Toyota TNGA-GA, 2020); Toyoda Gosei integral end-cap seal on RAV4/Camry weather strip (2019)',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'Conventional door weather strips are extruded as a continuous EPDM profile, then have separately injection-moulded plastic or rubber end-caps bonded or mechanically attached at each end to provide a finished termination and retain the seal in position. Over-moulding or splicing end-cap geometry directly onto the extruded seal at the extrusion line eliminates the separate end-cap part and assembly step. Nishikawa developed an over-moulded EPDM end-cap integrated seal for Toyota TNGA-GA applications — the end-cap is moulded directly onto the extruded profile in a secondary mould at the end of the extrusion line. Toyoda Gosei uses the same technique on RAV4 and Camry door weather strips.',
        mfg: 'Deletes 2 separately injection-moulded end-cap parts per seal, the end-cap bond adhesive application, and the assembly operation to attach end-caps. Reduces handling — the seal is a complete finished assembly off the extrusion line rather than a semi-finished profile requiring secondary assembly. Reduces part count by 2 per door seal.',
        why: 'Separate end-caps exist because extruded profiles cannot terminate cleanly — they require a separate moulded cap to provide a cosmetic, weather-sealed termination. Integrating the end-cap at the extrusion process eliminates the separate part by resolving the terminal geometry in the same operation as the seal cross-section. This is an established process capability at leading rubber seal suppliers; specifying it at programme outset is a simple cost reduction.',
        tr: 'Adhesion/bond strength of over-moulded end-cap to extruded profile at temperature extremes; seal installation retention force at end-cap (clip-in force must match assembly line requirements); end-cap appearance quality — over-moulded surface must meet Class A interior seal visibility standard.',
      },
      {
        t: 'Glass channel seal common across front/rear doors — platform-wide profile',
        lev: 'Standardization',
        save: '€2-4/unit (2 SKUs consolidated to 1; volume pricing)',
        bench: 'BMW G-series glass run channel standardisation across front/rear doors (Cqlt/Hutchinson, 2020); Honda Civic (common inner glass channel profile front/rear, 11th gen, 2022)',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'Glass run channels (the rubber guide into which the window glass slides) are typically specified as separate front-door and rear-door profiles due to slight differences in glass thickness tolerance, glass edge radius and door aperture curvature. Modern glass run channel materials (EPDM, TPV) with flexible lip geometry can accommodate the glass thickness and edge-radius variation between front and rear doors with one cross-section profile, provided the glass specification is harmonised. BMW rationalised G-series glass run channels to a common front/rear inner profile across 3 Series, 5 Series and X3 through a common die specification with Cqlt/Hutchinson. Honda Civic 11th generation uses a common inner glass channel across front and rear doors.',
        mfg: 'One die, one extrusion run, one colour and compound specification for front and rear door glass channels. Purchase volume doubles on one SKU — improved raw material pricing and batch efficiency. Glass channel installation tooling at trim line is identical for front and rear application, reducing operator training and error rate.',
        why: 'Front/rear glass channel differentiation is driven by conservative design practice — specifying slightly different profiles as a safety margin against glass thickness and curvature variation. Modern glass specifications are tightly controlled at the glazing supplier, making this differentiation unnecessary in most cases. Consolidation is a straightforward tooling and volume saving.',
        tr: 'Glass insertion and extraction force validation across full travel on both front and rear with common channel profile; wind noise excitation from glass seal at 130 km/h; glass position repeatability (channel retention of glass against wind load) on largest rear door glass area.',
      },
    ],
    top3: [
      { t: 'Delete seam sealer on bonded Al door', v: 'Water ingress soak test; corrosion at Al hem without sealer; bond inspection method' },
      { t: 'Integrated end-cap over-moulded on weather strip', v: 'Bond strength at temperature extremes; Class A appearance; install retention force' },
      { t: 'Window surround common seal geometry across platform', v: 'Wind tunnel NVH across all door combinations; water ingress across full rain/pressure test' },
    ],
  },
];

// ─── INDUSTRY TRENDS ─────────────────────────────────────────────────────────

export const EXTERIOR_TRIM_TRENDS: ExteriorTrimTrend[] = [
  {
    t: 'BEV smooth-front transition: sealed fascia replacing traditional open grille',
    status: 'Mainstream (BEV)',
    save: 'Delete AGS + grille mesh + surround: €22-38/unit',
    dir: 'Tesla, BMW iX, Hyundai Ioniq 6, Polestar 2, Rivian R1T all use smooth or near-sealed front fascias. VW ID.4 and Stellantis BEV models following suit for ID.7 and future STLA BEV. Trend is driven by aerodynamic range benefit (Cd 0.21-0.23 vs 0.27-0.30 for open grille) and BOM simplification. JLR Freelander 3 BEV and Range Rover EV both expected to adopt smooth shield front. Active aero for PHEVs and higher-power BEVs retained via minimal-aperture AGS rather than open grille.',
  },
  {
    t: 'In-mould colour (IMC) replacing painted exterior trim — arch cladding, bumper inserts',
    status: 'Mainstream',
    save: 'Delete paint process: €8-18/unit for cladding set',
    dir: 'Toyota, Honda, Ford, Renault and Hyundai all specify IMC PP-EPDM arch cladding on C/D-segment SUVs. LyondellBasell Hifax and Borealis Daplen IMC compounds now offer 10-year UV stability matching painted equivalents. Plastic Omnium and Valeo both expanded IMC cladding production capacity 2021-23. Paint-free exterior trim is extending beyond arch cladding to bumper lower inserts and side sill trim on urban-grade derivatives.',
  },
  {
    t: 'VHB adhesive badge bonding replacing mechanical clip-on — BMW/JLR/Toyota leading',
    status: 'Mainstream',
    save: 'Delete 4-6 clips + body bosses + assembly ops: €1.80-3.50/unit',
    dir: '3M VHB 5952 series validated across BMW G-series (2019), JLR L663 (2020), Toyota TNGA-GA (2021). Process adoption expanding to Stellantis STLA and Renault CMF platforms from 2024. Badge adhesive bonding also enables smooth panel design (no boss holes in body) which is a styling benefit on flush-surface BEV designs. 3M estimates 70%+ of new European OEM platform programmes specify VHB badge bonding from 2025.',
  },
  {
    t: 'Common platform seal profiles: one die family across all derivatives',
    status: 'Emerging → Mainstream',
    save: '€4-9/unit seal cost + €25-45K tooling NRE per derivative avoided',
    dir: 'VW MQB, Toyota TNGA and Stellantis STLA all define platform-wide seal cross-section families. Hutchinson, Toyoda Gosei, Nishikawa and Cooper Standard all have platform-seal programs with major OEMs. Trend is driven by OEM engineering cost reduction targets and increasing platform derivative counts — more derivatives with same tooling investment requires common cross-section design.',
  },
  {
    t: 'Structural adhesive elimination of seam sealer on Al closure panels',
    status: 'Mainstream (Al closures)',
    save: 'Delete sealer application + material + bake: €3-6/unit per Al door',
    dir: 'JLR aluminium-intensive vehicle (AIV) architecture (XE/XF/F-Pace) pioneered adhesive-only hem joining. BMW G-series Al doors, Audi A6 C8 Al doors and Mercedes C-Class W206 partial Al door — all eliminating seam sealer at bonded hem joints. As Al door penetration increases beyond D-segment (pushed by pedestrian protection regulations and mass reduction), adhesive-only sealing practice follows.',
  },
  {
    t: 'Single-zone AGS replacing multi-zone on standard powertrain variants',
    status: 'Emerging → Mainstream',
    save: 'Delete 1 actuator + zone: €18-32/unit',
    dir: 'Valeo, Brose and Continental all commercially offer single-zone AGS mono-motor systems. Ford Puma (Continental single-zone, 2022), Renault Megane E-Tech (Valeo mono-motor, 2022) and Nissan Qashqai (Valeo single-zone, 2021) all specify single-zone on standard variants. Multi-zone retained only for high-towing-capacity pickups and performance variants where independent zone control is technically justified.',
  },
  {
    t: 'Integrated radar bracket in grille/fascia moulding — delete standalone bracket',
    status: 'Mainstream',
    save: 'Delete bracket + 4-6 fasteners: €4-9/unit',
    dir: 'Continental, Valeo and Bosch all supply LRR modules with OEM-specified integrated mounting. VW Group MQB integrated radar bracket in front fascia module from 2021. Stellantis STLA Medium and STLA Large define integrated radar location in front module moulding. As 77GHz radar becomes standard on C-segment and above (Euro NCAP 2024 AEB requirements), integrated mounting strategy is being extended to all new platforms.',
  },
  {
    t: 'Over-moulded weather strip end-caps — process integration at extrusion line',
    status: 'Emerging → Mainstream',
    save: 'Delete 2 end-cap parts + assembly: €1.20-2.40/unit',
    dir: 'Nishikawa and Toyoda Gosei both qualified over-moulded end-cap weather strips for Toyota TNGA programmes (2019-2021). Cooper Standard applying the same process for Stellantis STLA weather strip supply from 2023. Process adoption driven by Toyota supplier programme requirements and OEM lean initiatives. Expected to become standard specification for new platform weather strip supply contracts from 2025.',
  },
  {
    t: 'Symmetrical / common arch liner strategy — L/R shared tool from design stage',
    status: 'Emerging',
    save: '50% arch liner tooling: €25-45K per derivative saved',
    dir: 'BMW G-series, Renault Megane E-Tech and Ford Kuga all adopted symmetric arch liner strategy on recent programmes. Magna International and Faurecia both offer symmetric arch liner design services as part of platform engineering. Trend is accelerating as OEM NRE budgets tighten and platform derivative counts increase — more derivatives need more arch liner tools, making symmetry an increasing priority.',
  },
];

// ─── COST STRUCTURE ──────────────────────────────────────────────────────────

export const EXTERIOR_TRIM_COST_STRUCTURE = [
  { name: 'Grille & active aero (AGS)', share: 32, color: '#6366f1' },
  { name: 'Wheel arch cladding & underbody', share: 24, color: '#8b5cf6' },
  { name: 'Exterior seals & weather strips', share: 22, color: '#a855f7' },
  { name: 'Badges & emblems', share: 14, color: '#7c3aed' },
  { name: 'Other exterior ornamentation', share: 8, color: '#5b21b6' },
];

// ─── MANUFACTURING LEVERS ─────────────────────────────────────────────────────

export const EXTERIOR_TRIM_MFG_LEVERS: ExteriorTrimMfgItem[] = [
  {
    t: 'IMC compound specification at programme start — eliminate post-mould paint loop from supply chain',
    lev: 'Process',
    save: '€8-18/unit for cladding set; 35-50% energy per cladding part',
    note: 'Specifying IMC PP-EPDM at programme engineering start removes the entire external painting loop from the exterior trim supply chain for arch cladding and bumper inserts. Plastic Omnium and Valeo both offer vertically integrated IMC supply (compound + injection + delivery). Eliminates primer, paint, clear, flash, bake, and paint inspection — 4-5 process steps per part.',
  },
  {
    t: 'Robotic AGS assembly: shutter blade load + motor clip + electrical test in one cell',
    lev: 'Automation',
    save: '30-40% AGS labour; defect rate ↓',
    note: 'Automated shutter blade insertion, motor clip-in and end-of-line electrical actuate-test in a single robotic cell replacing manual assembly with human electrical check. Valeo AGS automated assembly cell achieves 180 units/hour vs 90 manual. Force-monitoring blade insertion confirms correct blade seating, reducing escape rate. Continental applies the same automation on Ford and GM AGS programmes.',
  },
  {
    t: 'VHB badge bonding automated dispense fixture — peel-and-press with alignment tool',
    lev: 'Automation',
    save: '15-20 sec/badge; eliminate alignment scrap',
    note: 'Automated or semi-automated VHB tape peeling and badge alignment fixture (body-datum referenced) improves badge position repeatability to ±0.5mm vs ±1.5mm manual. 3M and BMW jointly developed a badge-press fixture with LED position guide for G-series badge installation. Eliminates 60-70% of badge misalignment warranty claims. Can be applied as a simple hand-held fixture without full robot investment.',
  },
  {
    t: 'Common weather strip extrusion die family across platform — one production run for all derivatives',
    lev: 'Standardization',
    save: '€25-45K die NRE per derivative; 15-20% compound pricing',
    note: 'Platform-common seal cross-section enables one extrusion production run with length cutting to derivative specification. Hutchinson, Toyoda Gosei and Nishikawa all offer platform seal supply programs. One die, one compound batch, one colour mix covers all platform seal requirements — batch efficiency improves raw material (EPDM/TPV) pricing by 12-20% vs split-derivative volumes.',
  },
  {
    t: 'Over-mould end-cap integration on weather strip extrusion line — eliminate secondary assembly',
    lev: 'Consolidation',
    save: 'Delete 2 parts + assembly: €1.20-2.40/unit; 1 assembly operation removed',
    note: 'Nishikawa and Toyoda Gosei both offer over-moulded end-cap weather strip as a standard product offering for Toyota/Stellantis supply. The over-mould station is inline with the extrusion line — the seal passes through a secondary compression mould at line end to apply end-cap geometry. No additional handling or transport step required. Complete finished seal delivered directly to trim line.',
  },
  {
    t: 'Symmetric arch liner flip-cavity tool — L and R from single tool with reversible core',
    lev: 'Tooling',
    save: '50% arch liner tooling: €25-45K per liner set',
    note: 'A flip-cavity injection mould (reversible core insert) produces both L and R arch liner variants from a single tool by rotating the core insert between shots. Faurecia and Magna International both offer flip-cavity tooling for symmetric arch liners. Requires symmetric clip pattern design from engineering — a design decision that must be confirmed at tool design gate. Tool cycle is slightly longer (core flip time) but eliminates the second tool entirely.',
  },
  {
    t: 'Underbody shield PP-LGF injection moulding: integrate clips and brackets in-mould vs post-weld',
    lev: 'Consolidation',
    save: '3-4 parts deleted per shield; 2-3 assembly operations removed',
    note: 'PP-LGF front engine shield with moulded-in mounting clips and bracket integration (vs HDPE thermoformed shield with welded reinforcement brackets). Injection moulding allows complex feature integration impossible in thermoforming — mounting clips, reinforcement ribs, sensor bosses and drain channels all in one moulding. Volvo and JLR validated this approach for compact front engine shield on XC60 and L550.',
  },
];

// ─── OEM BENCHMARKS ──────────────────────────────────────────────────────────

export const EXTERIOR_TRIM_OEM_BENCHMARKS: ExteriorTrimBenchmark[] = [
  {
    oem: 'Tesla',
    model: 'Model 3 Highland / Model Y (2023–)',
    moves: [
      'Sealed smooth front fascia — no open grille mesh, no AGS, no chrome surround: saves €30-45/unit vs comparable C-segment SUV with AGS',
      'Identical front/rear T-badge (same P/N, VHB bonded): one badge tool, one SKU, peel-and-press install — saves €12-18K tooling + €0.60/unit piece price',
      'Highland redesign: smooth lower fascia integrating radar housing directly in moulding — deleted separate radar bracket from Model 3 RHD update',
      'IMC black lower bumper insert (no paint): eliminates paint process from fascia sub-supply chain on lower accent elements',
    ],
  },
  {
    oem: 'BMW',
    model: 'G-series (G20 3 Series / G05 X5 / iX i20, 2019–)',
    moves: [
      'VHB 5952 badge bonding standardised across all G-series nameplates from 2019: deleted body boss tooling from BIW, saves €2.20/unit + €30K tooling NRE per model',
      'iX smooth front shield (2021): deleted AGS, grille mesh and chrome surround — sealed aerodynamic shield with integral radar housing; Cd 0.25 achieved',
      'Common glass run channel profile (Hutchinson) across G20/G30/G01 front and rear doors: one die, one compound, volume doubled — 14% improvement in unit pricing',
      'Over-moulded end-cap weather strips (Toyoda Gosei) on G-series door seals from 2020: deleted 4 separately assembled end-caps per vehicle',
    ],
  },
  {
    oem: 'Valeo / Continental (Tier-1)',
    model: 'Single-zone AGS platform (Renault Arkana / Ford Puma / Nissan Qashqai, 2021–2022)',
    moves: [
      'Valeo mono-motor AGS (single actuator, common linkage shaft): validated on Renault Arkana Cd 0.28 — saved €20/unit vs dual-motor AGS; adopted Renault Megane E-Tech same architecture',
      'Continental single-zone AGS on Ford Puma (2022): deleted upper-zone motor and wiring on standard 1.0T EcoBoost spec — €18 saving per vehicle retained on lower trims',
      'Valeo: integrated radar boss in AGS grille moulding on Stellantis STLA Medium (2022): deleted separate radar bracket, 6 fasteners and €6.50/unit at assembly',
      'Continental EVAP+AGS combined front module for Nissan Qashqai: front module assembly consolidation delivering 3 fewer fasteners and 2 fewer assembly ops at Tier-2',
    ],
  },
  {
    oem: 'JLR',
    model: 'Defender L663 / Discovery Sport L550 (2020–)',
    moves: [
      'Defender L663 tow bracket integrated into rear bumper cross-beam structure: deleted standalone bracket weld and inspection — saves €15/unit, stronger load path vs welded bracket',
      'L550 PP-LGF front engine shield (2019): deleted 3 steel reinforcement brackets vs HDPE shield — saves €9/unit, 18% mass reduction, integral clip bosses moulded in',
      'Defender air curtain integration in front fascia moulding: deleted separate clip-in duct inserts, saves €7/unit — Cd benefit of −0.005 maintained with moulded-in channel',
      'Common belt-line seal cross-section across Defender 90/110/130 (Cooper Standard): one die, three lengths — saves €28K die NRE vs derivative-specific profiles; 11% unit price improvement',
    ],
  },
];

// ─── TOTAL IDEAS FUNCTION ─────────────────────────────────────────────────────

export function getTotalExteriorTrimIdeas(): number {
  return EXTERIOR_TRIM_COMPONENTS.reduce((acc, c) => acc + c.ideas.length, 0);
}
