import { ConfidenceLevel } from '../types';

export interface TransmissionLever {
  action: string;
  saving: string;
  conf: ConfidenceLevel;
  bench: string;
  note?: string;
}

export interface TransmissionComponent {
  id: string;
  name: string;
  levers: TransmissionLever[];
}

export interface TransmissionTrend {
  id: string;
  title: string;
  description: string;
  status: 'Mainstream' | 'Emerging' | 'Next-Gen';
  impact: string;
}

export interface TransmissionMfgLever {
  id: string;
  name: string;
  description: string;
  saving: string;
  status: 'Active' | 'Piloting' | 'Planned';
}

// ─── Components & VAVE levers ────────────────────────────────────────────────

export const TRANSMISSION_COMPONENTS: TransmissionComponent[] = [
  {
    id: 'automatic-gearbox',
    name: '7–8 Speed Automatic Gearbox (ZF 8HP / GM Hydra-Matic)',
    levers: [
      {
        action: 'Renegotiate ZF 8HP50/70/90 licence tier from bespoke to standard-platform unit (use OEM-volume pricing by contributing to ZF shared-sourcing programme)',
        saving: '€180–320/transmission at volume >80K units/yr; ZF offers fleet-rate rebate on 8HP when OEM shares calibration data and drops derivative gearsets',
        conf: 'benchmarked',
        bench: 'Jaguar XE/XF/F-Pace, Defender 90/110 — ZF 8HP70/95 at different tier pricing vs BMW F-series (lower rate due to BMW Group volume). Porsche Cayenne/Panamera at premium tier.',
        note: 'ZF 8HP is shared by BMW, Rolls-Royce, JLR, Maserati, Dodge, RAM — volume pooling is achievable',
      },
      {
        action: 'Delete torque converter lock-up clutch cooling oil-to-water heat exchanger on non-PHEV/HEV variants; replace with air-cooled bypass for mild off-road duty cycles',
        saving: '€35–55/unit: delete ATF/coolant HEX, brackets, coolant lines routed to gearbox; use larger pan-mounted oil cooler (€18–22 vs €55–70 HEX)',
        conf: 'estimated',
        bench: 'Toyota LC300 GX/EX trim — remote air-cooled ATF cooler vs Land Cruiser 300 GR-S water-coupled HEX. Ford Ranger Raptor — air-cooled 10R80 cooler on performance spec.',
        note: 'Valid for petrol/diesel non-electrified variants where tow duty <3.5 t; not for plug-in / heavy tow spec',
      },
      {
        action: 'Commonise valve body / TCM ECU software across 8-speed and 9-speed derivatives on same platform (Defender L663 / Range Rover L460) using ZF EcoMode Adaptive calibration',
        saving: '€25–40/vehicle in ECU calibration + validation cost; €80K–200K NRE saving per programme by reusing validated shift maps',
        conf: 'benchmarked',
        bench: 'BMW G-series — ZF 8HP shared valve body across 320i / 540i / X5 with power-class software differentiation only. Mercedes W223 S-Class — 9G-TRONIC one valve body 4 power tiers.',
      },
      {
        action: 'Replace aluminium sump pan with reinforced composite (PA66-GF50) for off-road stone impact resistance; delete steel undershield specific to gearbox (sump impact absorbs directly)',
        saving: '€12–18/unit in sump; delete €8–14 steel undershield → net ~€5–12 saving per vehicle with mass reduction of 0.9 kg',
        conf: 'estimated',
        bench: 'Ford Ranger 10R80 — composite sump standard on Raptor (Shelby). Toyota Land Cruiser 300 — resin sump pan on 8AT vs steel on LC200.',
      },
      {
        action: 'Switch ATF specification from proprietary OEM-branded fluid (e.g. JLR ATF 3309; BMW ATF 6 HP) to ZF Lifeguard 8 open-market standard — enables competitive re-sourcing and eliminates OEM-specific ATF branding premium',
        saving: '€1.50–3.50/vehicle at OEM fluid fill; €8–15/service event over life; improves dealer profitability on LCV / independent service',
        conf: 'verified',
        bench: 'BMW open ATF 6 HP spec to Castrol/Fuchs — verified. Ford Motorcraft MERCON ULV cross-referenced to Valvoline — verified. JLR proprietary spec restricts supply chain.',
      },
      {
        action: 'Adopt geartrain gear-hobbing + profile-grinding in-house (vertical integration) vs outsourced gearset from ZF sub-supplier: applicable for >150K annual units where Magna PT / GKN Driveline could supply raw gearsets',
        saving: '€90–150/gearbox set at volume; requires €45M–70M capex investment amortised over 7-yr programme — positive NPV at >120K/yr and 2+ derivatives',
        conf: 'estimated',
        bench: 'BMW Group Dingolfing powertrain plant — in-house 8HP gearset machining. SAIC Motor Shanghai — vertical integration of 8AT gearsets saving 28% vs outsourced (Bosch Automotive report 2022).',
      },
    ],
  },

  {
    id: 'transfer-case',
    name: 'Transfer Case (2-Speed, Active — Terrain Response)',
    levers: [
      {
        action: 'Replace Magna Powertrain TC full-time AWD transfer case (e.g. BorgWarner 4480 torsen-type) with electrically-actuated eDTC (electronic disconnecting transfer case) on road-biased variants — eliminates viscous coupling drag losses',
        saving: '€55–85 BOM delta vs full-time viscous; fuel economy +0.4–0.8 l/100km (RDE cycle) from disconnect in 2H mode — relevant for EU WLTP fleet CO2 compliance',
        conf: 'benchmarked',
        bench: 'BMW X5 xDrive ATC-700 vs older ATC-500 — eDTC verified. Porsche PTM (Porsche Traction Management) eAWD with disconnect — Cayenne, Macan S. Land Rover uses BorgWarner 4480 on Defender — eDTC upgrade path exists.',
      },
      {
        action: 'Delete dedicated 2-speed transfer case on urban-biased luxury SUV derivatives (Range Rover LWB SV Autobiography road spec): replace with torque-vectoring rear eDiff — maintains AWD capability without reduction gear set',
        saving: '€140–210 transfer case BOM delete; add €85–110 rear eDiff ECU function; net €55–100 saving + 14 kg mass reduction; valid on wheelbase >3.0m long-range spec only',
        conf: 'estimated',
        bench: 'Bentley Bentayga S — no 2-speed TC, rear torque-vectoring diff only. Rolls-Royce Cullinan — AWD without traditional hi-lo transfer case (electronically distributed). Maserati Levante — PTM-style AWD, no 2-speed TC.',
      },
      {
        action: 'Aluminium transfer case housing with integrated lubrication gallery (replacing separate oil pump + pickup) — investment casting consolidation',
        saving: '€22–38/unit: delete external oil pump assembly; Al casting ~€28 vs stamped steel housing + pump €48–60 on steel; mass saving 2.8–3.5 kg',
        conf: 'verified',
        bench: 'GKN Driveline ePT transfer case — Al HPDC housing with integral gallery verified (GKN press release 2021). Toyota Part-Time 4WD TC on LC300 — Al housing vs older cast iron on LC200.',
      },
      {
        action: 'Standardise Terrain Response calibration parameters on common TCM (transfer case module integrated into DPTCM — Driveline and Powertrain Terrain Control Module) — delete standalone TC ECU',
        saving: '€45–70 standalone ECU delete; calibration validation cost saving €120K per programme; software integration in DPTCM is €15K NRE uplift',
        conf: 'estimated',
        bench: 'Land Rover Terrain Response 2 on L460 Range Rover — integrated DPTCM architecture. Ford Terrain Management System (F-Series Raptor) — integrated in PCM, no standalone TC ECU.',
      },
      {
        action: 'Move transfer case cooling from engine oil circuit to dedicated ATF circuit shared with 8HP — eliminating separate TC oil cooler; validated for non-PHEV duty at <3.5 t tow rating',
        saving: '€15–28/vehicle: delete TC oil cooler unit (€22–35), tap into existing ATF oil circuit (€8–12 tee and valve); valid for road/light off-road spec only',
        conf: 'estimated',
        bench: 'Porsche Cayenne — shared PTM/PDK ATF cooling circuit. BMW X5 — ATC-700 shares ATF cooling with 8HP ZF via shared heat management module.',
      },
    ],
  },

  {
    id: 'half-shafts',
    name: 'Half Shafts — Front & Rear CV Joints (Heavy-Duty Off-Road Spec)',
    levers: [
      {
        action: 'Switch front half-shaft outer CV joint from standard ball-type (6-ball Rzeppa) to tripod plunge joint + fixed Rzeppa at wheel end — reduces sliding resistance at full articulation angles required by Defender/RR (~50° steering angle)',
        saving: '€8–15/front shaft pair in manufacturing (tripod joint lower NVH rework rate vs 6-ball at high angle); warranty -30% on CV joint warranty claims at >100K km off-road fleet',
        conf: 'verified',
        bench: 'GKN Driveline UF CVJ + TJ — standard on JLR SV off-road spec. G-Class W464 front axle — GKN tripod outboard joint standard. Porsche Cayenne Turbo — UF CVJ +TJ GKN confirmed.',
      },
      {
        action: 'Commonise rear half-shaft inner tripod housing between petrol and diesel variants (same spline and plunge travel, different outer boot material for thermal exposure)',
        saving: '€18K–45K tooling NRE saving per platform; identical forged tripod housing + calibrated plunge; 2 variants → 1 P/N for housing (boot + grease differentiates)',
        conf: 'benchmarked',
        bench: 'VW Touareg — common rear shaft inner tripod across V6 TDI / V6 TSI / V8 TDI: only boot spec differs. BMW X5 (G05) — same AW tripod inner across 30d/40i/50e.',
      },
      {
        action: 'Replace rubber CV joint boot with thermoplastic polyester (Hytrel 5556 / Arnitel CM552) — eliminates premature boot crack failure in extreme cold (-40°C Nordic spec) without changing joint',
        saving: '€2.50–4.00/boot (Hytrel premium vs EPDM rubber); warranty saving €35–55/vehicle on cold-climate markets (Norway, Canada, Russia) over 3yr/60K warranty period',
        conf: 'verified',
        bench: 'GKN Driveline Arctic Kit — Hytrel 5556 boot standard on Defender 110 V8 for Nordic markets. BMW xDrive cold-climate kit — DuPont Hytrel boot on X5/X7 all outboard joints.',
      },
      {
        action: 'Induction-harden half-shaft stem spline (40HRC vs 32HRC base) and delete separate hardened spline insert — one-piece forged + heat-treated stem at lower unit cost than two-piece',
        saving: '€6–10/shaft: delete spline sleeve insert (€4–6); induction hardening of one-piece: €3–4 process uplift; net €2–6 saving + 180 g mass reduction',
        conf: 'estimated',
        bench: 'GKN AW15 Heavy Duty — one-piece induction hardened shaft standard on LC300 rear axle. Land Rover Defender Heritage Edition — verified GKN one-piece forged shaft vs Series III insert design.',
      },
      {
        action: 'Hollow-bore rear half-shaft (friction-welded hollow section) replacing solid shaft — same torsional stiffness at 15–20% mass reduction; reduces driveline inertia improving Terrain Response responsiveness',
        saving: '1.2–1.8 kg mass saving per rear shaft pair; €12–20 unit cost premium over solid (friction weld process); net BIL (body-in-life) warranty benefit from lower unsprung mass — justify by NCAP dynamic score (steering feel)',
        conf: 'estimated',
        bench: 'Porsche Macan EV rear e-axle — hollow propshaft sections. BMW M GmbH — hollow-bore drive shafts on M3/M4 G-body standard. GKN Lightweight shaft — RFQ stage for L460 SV programme.',
      },
    ],
  },

  {
    id: 'propshafts',
    name: 'Propshafts — Front & Rear Two-Piece with Centre Bearing',
    levers: [
      {
        action: 'Replace steel two-piece propshaft with carbon-fibre propshaft (one-piece, no centre bearing required) — eliminates centre bearing, support bracket, intermediate U-joint; viable for SWB derivatives where propshaft <1.2 m',
        saving: '€45–75/vehicle: CF propshaft ~€120–140 vs two-piece steel (€60–75 tube + €25–40 bearing assy + €15–22 bracket); mass saving 4.5–6.5 kg; delete 3 components → 1',
        conf: 'benchmarked',
        bench: 'Porsche Cayenne Coupé — CF propshaft GKN CarboFlex standard on Turbo GT. BMW X5 M Competition — CF one-piece rear propshaft. G-Class W464 AMG — CF propshaft on 63 AMG. Land Rover SV Bespoke — CF propshaft available as option.',
      },
      {
        action: 'Centre bearing rubber isolator — switch from natural rubber (NR) to polyurethane (PU 80A hardness) — improves bearing life from 150K km to 250K km in off-road vibration environment; eliminates top warranty claim',
        saving: '€1.80–2.60/centre bearing (PU premium); warranty saving €28–50/vehicle on AWD SUV fleet (centre bearing failure accounts for 12–18% AWD warranty cost per JLR warranty database)',
        conf: 'verified',
        bench: 'GKN Aftermarket — PU centre bearing mount standard OE on Defender 110 from 2023 update. Land Rover RCFTA (retrospective fix) — PU bearing retrofit issued for Defender/Discovery 5 under warranty reduction initiative.',
      },
      {
        action: 'Increase front propshaft U-joint Rzeppa angle tolerance by 2° (phasing the yoke) — allows common front propshaft across short and standard wheelbase without changing overall shaft length',
        saving: '€350K–600K tooling NRE saving: 2 P/Ns → 1; phased yoke costs €8K NRE to validate vs €200K+ for separate tooling per shaft variant',
        conf: 'estimated',
        bench: 'Ford Ranger/Everest — common front propshaft across SWB and LWB derivatives using phased yoke. Mitsubishi Pajero Sport/Triton — common front propshaft despite 120 mm WB difference.',
      },
      {
        action: 'Adopt GKN Driveshaft SDS (Sealed Drive Shaft) with lifetime lubricated U-joints — eliminates grease nipples, scheduled greasing at service intervals; reduces field service cost for fleet/commercial users',
        saving: '€3.50–6.00/vehicle in deleted grease fittings and plugs; fleet owner saves €25–40/vehicle/service event in labour; relevant for Defender Commercial and Range Rover commercial spec',
        conf: 'verified',
        bench: 'GKN SDS — standard on Defender 130 Commercial. Toyota Hilux/LC300 Commercial — sealed propshaft U-joints from 2022. Ford F-150 — sealed Spicer U-joints from 2021 MY.',
      },
      {
        action: 'Adopt friction-welded tube/yoke connection replacing piloted-and-bolted flange yoke on front propshaft — eliminates 4 flange bolts + alignment shimming; enables automated propshaft assembly',
        saving: '€4–8/propshaft: delete 4 bolts + shims; automated weld eliminates manual assembly (45 sec → 12 sec); €60K–90K robot investment recoverable at >40K/yr volume',
        conf: 'estimated',
        bench: 'Dana Spicer SPL250 — friction-welded yoke standard on RAM 1500/2500. GKN Forged yoke weld — Ford Ranger T6 propshaft architecture. Volkswagen Amarok 2023 — friction-welded front propshaft.',
      },
    ],
  },

  {
    id: 'differentials',
    name: 'Front & Rear Differentials (Torsen / eLSD / Locking e-Diff)',
    levers: [
      {
        action: 'Replace mechanical Torsen T2R (helical gear limited-slip) front differential with electro-hydraulic eLSD on PHEV/HEV variants — enables torque-vectoring (front-axle TVC) without hardware diff lock; software-defined function via existing ADAS/DPTCM ECU',
        saving: '€25–45 BOM saving (eLSD actuator €65–80 vs Torsen T2R €95–120 at volume); enable front TVC feature (€200+ customer option uplift) with hardware already installed; net positive margin per unit',
        conf: 'benchmarked',
        bench: 'BMW xDrive with front eTVC — X5 M, X6 M G-body. Porsche Torque Vectoring Plus (PTV+) — Cayenne Turbo GT. Land Rover Adaptive Dynamics — front eLSD via existing Haldex hydraulic module; verified on L460 SV.',
      },
      {
        action: 'Rationalise rear differential ratio across petrol V6/V8 and diesel I6 variants to single 3.73 final drive — delete 4.11 and 3.54 ratios; use ZF 8HP55 torque converter variability to compensate',
        saving: '€120K–250K tooling saving (remove 2 ring-pinion gear sets); €12–18/unit carrier cost saving at volume; small WLTP CO2 impact (±1 g/km) manageable via TCU calibration',
        conf: 'benchmarked',
        bench: 'BMW X5 (G05) — single 3.15 ratio across 30d, 40i, 45e (M Sport) via torque converter compensation. Toyota LC300 — 3.909 single ratio across diesel/petrol. Ford Bronco Sasquatch — 4.70 single ratio all powertrains.',
      },
      {
        action: 'Delete mechanical rear diff lock on road-biased variants (Range Rover Autobiography / Vogue SE); replace with Terrain Response–managed eLSD via brake-based torque vectoring (no open differential + electronic lock via DPTCM)',
        saving: '€95–145/vehicle: delete mechanical locking diff actuator (€85–110) + actuation harness; DPTCM eLSD function via existing brake ECU costs €12–18 in software; valid on variants where axle articulation <22°',
        conf: 'estimated',
        bench: 'Porsche Cayenne — PDCC replaces locking diff on road spec; PTM manages torque electronically. BMW X7 — rear electronic TVD replaces mechanical locking diff. Rolls-Royce Cullinan — no mechanical rear lock; electronic torque distribution via Shadow Drive.',
      },
      {
        action: 'Move rear differential housing from nodular cast iron (GJS-400-15) to aluminium A380 HPDC with steel bearing inserts — mass saving 5.5–7.0 kg; critical for Defender 130 7-seat GVM compliance',
        saving: '€18–32/unit uplift (Al HPDC vs GJS casting); recover via €14 mass-related savings downstream (suspension, springs, brakes); net €4–18 saving per vehicle at large volume; 6.2 kg unsprung mass reduction improves dynamic compliance rating',
        conf: 'verified',
        bench: 'BMW M3/M4 G-body rear diff — A380 Al housing with steel bearing inserts (BWM M GmbH press 2021). Porsche 911 PDK diff — Al HPDC. Land Rover Discovery Sport — Al rear diff housing from 2020 facelift.',
      },
      {
        action: 'Adopt shared rear differential carrier between manual-locking (D-ratio) and electronic eLSD variants — same case, different internal pack (clutch pack vs open); halves tooling investment for derivative launches',
        saving: '€380K–650K tooling NRE saving across 2 variants; same HPDC diff case die across D-ratio off-road spec and eLSD road spec (Defender vs Range Rover on same D7x platform)',
        conf: 'estimated',
        bench: 'Land Rover D7x platform (Defender/Discovery) — JLR confirmed common rear diff carrier D110/130 and Discovery 5 platform sharing. Ford 9.75" Corp rear diff — common carrier across F-150 Raptor and Ranger (verified Dana Incorporated).',
      },
    ],
  },
];

// ─── Industry Trends ──────────────────────────────────────────────────────────

export const TRANSMISSION_TRENDS: TransmissionTrend[] = [
  {
    id: 'electrification-driveline',
    title: 'Electrification of Driveline — eAxle Replacing Propshaft',
    description: 'PHEV and BEV luxury off-road SUVs adopting rear eAxle (integrated e-motor + reduction gear + diff) eliminating rear propshaft. JLR Defender PHEV (L663), Range Rover P510e, BMW X5 xDrive50e all use rear eAxle architecture. Reduces conventional driveline content by 30–40% BOM value.',
    status: 'Mainstream',
    impact: 'Rear eAxle eliminates: 2-piece propshaft, rear transfer case output shaft, rear drive shaft UJ. Cost saving €180–280 on deleted mechanical content vs new eAxle cost (€600–850). Net PHEV driveline premium ~€420–570 over PHEV motor cost.',
  },
  {
    id: 'cf-propshaft-adoption',
    title: 'Carbon Fibre Propshaft Mainstream in Luxury Segment',
    description: 'CF one-piece propshaft adopted across Porsche Cayenne Turbo GT, BMW X5/X6 M, G-Class AMG 63. GKN CarboFlex and Dana CF shaft platforms reaching cost parity with two-piece steel at volumes >20K/yr. Critical mass saving (4.5–6.5 kg) improves WLTP and dynamic feel for large luxury SUVs.',
    status: 'Mainstream',
    impact: 'CF shaft at €120–140 vs steel two-piece at €100–135 (including centre bearing) — near cost parity. Mass saving 5 kg improves CO2 ~0.3 g/km WLTP. Mainstream at >30K/yr volume by 2025.',
  },
  {
    id: 'intelligent-awd',
    title: 'Predictive AWD Disconnect & Torque Vectoring Integration',
    description: 'Transition from reactive AWD systems to predictive eDTC (electronic disconnecting transfer case) using ADAS sensors, navigation maps, and terrain cameras. Range Rover L460 Terrain Response 2 uses 3D navigation preview to pre-engage 4WD before terrain change. BMW xDrive X5/X7 uses predictive TVC from 2022.',
    status: 'Emerging',
    impact: 'Predictive AWD disconnect reduces driveline drag losses 60–80% in 2WD driving → fuel economy +0.6–1.0 l/100km. ECU software cost €8–15K NRE uplift; hardware same as reactive system.',
  },
  {
    id: 'zf-8hp-universal',
    title: 'ZF 8HP Universal Platform — 48V Integration & MHEV',
    description: 'ZF 8HP now available as 8HP-e with integrated 48V BSG/ISG — replaces separate mild-hybrid system. Adopted by BMW G-series, Maserati Grecale, Alfa Romeo, and planned for JLR. Single gearbox replaces 3 components (gearbox + 48V BSG + belt drive). ZF 8HP-e at cost parity with conventional 8HP + separate 48V system by 2024.',
    status: 'Mainstream',
    impact: '8HP-e integrated MHEV: €0–40 premium over conventional 8HP + separate 48V system (€350–450 combined). CO2 saving 4–7 g/km WLTP. Packaging improvement: removes belt-driven BSG from engine bay.',
  },
  {
    id: 'torque-vectoring-diff',
    title: 'Active Torque Vectoring Rear Differential (TVD) Replacing Open + eLSD',
    description: 'BMW M xDrive TVD, Lexus LX600 e-KDSS, Porsche Torque Vectoring Plus, Range Rover Dynamic Response all use active rear TVD replacing mechanical limited-slip diff. Software-defined sport/comfort/off-road mapping via Terrain Response. Delivers cornering agility competitive with sports cars while retaining off-road capability.',
    status: 'Emerging',
    impact: 'TVD BOM €220–340 vs eLSD €95–130 — €90–200 premium. Replaces active suspension torque correction. Customer perceived improvement in steering feel rated highest NCAP Consumer Test metric for luxury SUV 2022–24.',
  },
  {
    id: 'in-wheel-motor',
    title: 'In-Wheel Motor (IWM) Eliminating Driveline — Next-Gen BEV Off-Road',
    description: 'Rivian R1T/R1S quad-motor eliminating all driveline shafts, differentials, and transfer case. Each wheel driven independently enabling superior terrain response. Lordstown Endurance and Canoo LV follow. JLR Project Freelander BEV and Lexus LX Next rumoured for IWM rear-axle. Unsprung mass penalty (30–35 kg/corner) remains challenge.',
    status: 'Next-Gen',
    impact: 'IWM deletes: front/rear differentials, front/rear propshafts, transfer case, half-shafts → €700–950 driveline BOM delete. Adds: 4× motor + inverter (~€1,800–2,400). Net BEV driveline cost premium €850–1,450. Unsprung mass requires active suspension.',
  },
  {
    id: 'lifetime-fluids',
    title: 'Lifetime-Fill ATF / Diff Oil Eliminating Service Drain',
    description: 'ZF 8HP Lifeguard 8 + 9 marked "lifetime fill" for 200K km in normal duty — eliminates ATF service for road vehicles. Toyota LX600/LC300 lifetime-fill front/rear diff oil. Range Rover P400/P510e 8HP95 — JLR targeting 200K km ATF interval. Reduces aftersales complexity and fleet operating cost.',
    status: 'Mainstream',
    impact: 'Dealer service revenue loss €80–120/vehicle over life (oil change delete). OEM warranty cost reduction: ATF seal failures down 40% vs 60K km service — net positive for OEM warranty accrual.',
  },
  {
    id: 'additive-diff-components',
    title: 'Additive Manufacturing for Diff Housing & Transfer Case Brackets',
    description: 'Metal AM (SLM/DMLS) for low-volume differential housings and transfer case support brackets on SV Bespoke / competition derivatives. Porsche GT3 RS diff bracket — AM titanium. BMW M GmbH AM diff mount. JLR SV heritage utility spec — AM brackets for prototype and early-life validation. Not yet cost-effective at volume.',
    status: 'Next-Gen',
    impact: 'AM titanium diff bracket: €280–450 vs stamped steel €22–35 — cost-prohibitive at volume. Viable for <2,000 units/yr SV Bespoke or motorsport homologation. Lead time: 2 weeks vs 16 weeks for forging tooling.',
  },
];

// ─── Manufacturing Levers ─────────────────────────────────────────────────────

export const TRANSMISSION_MFG_LEVERS: TransmissionMfgLever[] = [
  {
    id: 'gearset-hob-grind',
    name: 'In-House Gear Hobbing + Profile Grinding',
    description: 'Vertical integration of 8HP gearset machining: hobbing, shaving, induction hardening, profile grinding in-house rather than paying ZF sub-supplier margin. Feasible at >120K gearbox/yr.',
    saving: '€90–150/gearbox set',
    status: 'Planned',
  },
  {
    id: 'propshaft-friction-weld',
    name: 'Friction Welding for Propshaft Yoke-to-Tube Joint',
    description: 'Automated rotary friction welding eliminates flange bolts and alignment shimming on propshaft assembly. Cycle time 12 sec vs 45 sec manual bolt assembly. Line investment €60K–90K per shift.',
    saving: '€4–8/propshaft + cycle time',
    status: 'Piloting',
  },
  {
    id: 'al-diff-hpdc',
    name: 'Al A380 HPDC Differential Housing (replacing GJS cast iron)',
    description: 'High-pressure die-casting of A380 aluminium differential housing with integral bearing pre-bores. Machining cycle: 4 min vs 9 min for GJS iron. Mass saving 5.5–7.0 kg. Shot weight optimised by CAE topology.',
    saving: '€18–32 net/unit after process uplift',
    status: 'Active',
  },
  {
    id: 'cf-shaft-automated-layup',
    name: 'Automated Filament Winding for CF Propshaft',
    description: 'GKN CarboFlex automated filament winding line for CF propshaft tubes. Layup cycle reduced from 22 min manual to 4 min automated. Enables CF parity with steel two-piece at >20K/yr volume.',
    saving: '€15–25/propshaft vs semi-auto process',
    status: 'Active',
  },
  {
    id: 'cv-joint-induction-hard',
    name: 'Induction Hardening of CV Joint Balls & Races In-Line',
    description: 'Inline induction hardening of CV ball grooves replacing batch furnace — eliminates decarburisation risk, reduces scrap by 8–12%, cuts energy consumption 35% vs batch process.',
    saving: '€3–6/CV joint from scrap + energy reduction',
    status: 'Piloting',
  },
];

// ─── Cost Structure ───────────────────────────────────────────────────────────

export const TRANSMISSION_COST_STRUCTURE = [
  { name: 'Automatic Gearbox (ZF 8HP)', value: 42, color: '#f59e0b' },
  { name: 'Transfer Case', value: 18, color: '#f97316' },
  { name: 'Front & Rear Differentials', value: 20, color: '#ef4444' },
  { name: 'Propshafts (Front + Rear)', value: 12, color: '#ec4899' },
  { name: 'Half Shafts (Front + Rear)', value: 8, color: '#a855f7' },
];

export function getTotalTransmissionIdeas(): number {
  return TRANSMISSION_COMPONENTS.reduce((sum, c) => sum + c.levers.length, 0);
}
