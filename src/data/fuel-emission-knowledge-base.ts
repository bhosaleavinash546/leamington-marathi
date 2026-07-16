// Fuel & Emission Systems Knowledge Base
// Source: Fuel & Emission Cost Engineer — VAVE & Manufacturing Ideation
// Author: Avinash Bhosale, Senior Cost Improvement Engineer (Propulsion)

export interface FuelEmissionIdea {
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

export interface FuelEmissionComponent {
  id: string;
  sub: string;
  name: string;
  baseline: string;
  fn: string;
  ideas: FuelEmissionIdea[];
  top3: { t: string; v: string }[];
}

export interface FuelEmissionMfgItem {
  t: string;
  lev: string;
  save: string;
  note: string;
}

export interface FuelEmissionTrend {
  t: string;
  status: string;
  save: string;
  dir: string;
}

export interface FuelEmissionBenchmark {
  oem: string;
  model: string;
  moves: string[];
}

// ─── COMPONENT IDEAS DATABASE ────────────────────────────────────────────────

export const FUEL_EMISSION_COMPONENTS: FuelEmissionComponent[] = [
  {
    id: 'fuel-storage',
    sub: 'Fuel Storage & Delivery',
    name: 'Fuel tank, rail & delivery system',
    baseline: 'Multi-layer HDPE blow-moulded saddle tank, separate in-tank pump module, stainless steel fuel rail, GDI + port injectors (dual fuel path), high-pressure fuel pump (HPFP) sized for peak demand.',
    fn: 'Store, deliver and meter fuel at required pressure and flow across all operating conditions while meeting EVAP permeation and crash safety regulations.',
    ideas: [
      {
        t: 'Delete saddle shape: flat-bottom mono-layer PE tank topology optimisation',
        lev: 'Design',
        save: '£6.8-12/unit tooling + weight ↓',
        bench: 'Toyota TNGA-K platform (RAV4/Camry shared tank architecture, 2019–)',
        v8: 'any',
        mat: 'Proven',
        risk: 'Med',
        tech: 'Saddle-shaped tanks are driven by spare-wheel packaging on ICE vehicles. Removing the saddle and using a flat or single-lobe geometry simplifies the blow-mould tool from 4-cavity with saddle bypass tubing to a 2-cavity flat tool. Toyota TNGA rationalised tank shapes across the platform, sharing a common rectangular outer envelope and enabling one blow-mould family for 3 derivatives.',
        mfg: 'Simpler blow-mould tooling (fewer moving slides), shorter cycle time, deletion of saddle-bridge anti-sloshing baffles and associated fuel transfer jet pump. Eliminates the secondary saddle-fill hose, reducing part count by 4-6 sub-components.',
        why: 'Saddle geometry adds tooling complexity (£51-102K per tool vs £30-51K flat), increases wall-thickness variation risk and requires a transfer jet pump to move fuel between lobes — each lobe needs its own fuel level sender. Flat topology deletes the transfer pump and second sender.',
        tr: 'Packaging study required — loss of saddle clearance over exhaust/propshaft; fuel slosh NVH must be validated; crash sled test at new centroid.',
      },
      {
        t: 'Modular tank family: shared outer envelope across platform derivatives',
        lev: 'Standardization',
        save: '£77-128K tooling NRE per derivative',
        bench: 'Toyota TNGA (common 50L envelope across 4 nameplates); VW MQB A/B (60L standard tank shared Tiguan/Touareg-based, 2021)',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        new: 1,
        tech: 'Define one outer tank envelope with volume adjusted by fill height (same tool, different fill quantity) and wall-thickness optimisation rather than a new tool per derivative. VW MQB uses a single 60L standard tool across 3 wheelbase variants by adjusting pump module flange position only. Toyota TNGA-K shares the tank outer moulding between Camry and RAV4 US derivatives, differing only in sender unit and straps.',
        mfg: 'One blow-mould tool (£30-51K) replaces 2-3 derivative tools (£85-153K combined). Common strap/bracket tooling. One part number family rationalisation reduces logistics complexity across the supply chain.',
        why: 'Each unique tank shape requires dedicated blow-mould tooling, testing, homologation and supplier qualification. Sharing the envelope across platform derivatives typically saves £77-128K NRE and improves piece price by 3-6% through volume consolidation on one supplier.',
        tr: 'Volume capacity may not perfectly match all derivatives without fill height adjustment; EVAP test per variant still required.',
      },
      {
        t: 'In-tank pump module right-size to actual flow demand — delete performance head-room',
        lev: 'Spec opt.',
        save: '£3.4-7.6/unit pump cost',
        bench: 'Continental LPFP right-sizing programme (2020-23, applicable across VW Group); Bosch EKP-IV modular pump family',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'Low-pressure fuel pump (LPFP) modules are commonly over-specified to cover worst-case engine demand at maximum load and altitude — a condition rarely sustained. Bosch and Continental offer flow-optimised pump variants matched to actual peak GDI flow demand (typically 120-180 L/h for 1.5-2.0L GDI engines). Right-sizing cuts motor winding material and impeller diameter without compromising fuel delivery, reducing pump unit cost by 15-25%.',
        mfg: 'No manufacturing change at OEM level — this is a pump module specification change supplied complete. Supplier saves on impeller tool and motor winding copper. Common module flange maintained across pump flow variants.',
        why: 'Fuel pump modules are typically over-specified by 15-30% to cover DFMEA hot/altitude edge cases. The performance head-room is bought and paid for in every unit produced. A matched pump also draws less parasitic electrical load (reducing fuel economy penalty at part load).',
        tr: 'Re-validation at high-altitude hot restart; flow bench test at max engine demand; fuel economy confirmation on WLTP cycle.',
      },
      {
        t: 'Aluminium fuel rail replacing stainless steel on GDI systems',
        lev: 'Material',
        save: '£5.1-9.3/unit (50-60% rail cost)',
        bench: 'BMW B48 engine (Al fuel rail standard from G20 3 Series, 2019); Toyota 2.5L A25A-FXS hybrid (Al rail)',
        v8: 'any',
        mat: 'Proven',
        risk: 'Med',
        tech: 'GDI high-pressure rails have historically used 316L stainless steel for corrosion resistance and pressure capability. Advanced anodised 6061-T6 aluminium extrusions with Al-Si weld inserts for injector seats now meet the same 200-250 bar proof pressure at significantly lower mass and cost. BMW standardised Al fuel rails on the B48 family. Wall thickness is managed via autofrettage pre-stress treatment.',
        mfg: 'Al rail is extruded and CNC-machined vs drawn/formed SS tube with MIG-welded injector bungs. Al machining cycle time is 40-50% shorter; material cost is substantially lower per kg (Al ~£2.1/kg vs SS ~£3.8/kg for fuel-grade alloy).',
        why: 'Stainless steel rail accounts for 65-75% of the fuel rail BOM cost vs aluminium equivalent. Al rail is also 65% lighter per unit. At platform volumes the piece-price saving scales directly with unit count — £5.1-9.3 per car with no performance trade-off.',
        tr: 'Anodise/coating durability in ethanol-blend fuels (E10/E15); weld joint fatigue at pressure cycling; corrosion validation to EN ISO 9227.',
      },
      {
        t: 'GDI-only architecture: delete port injectors and port fuel injection (PFI) rail',
        lev: 'Consolidation',
        save: '£21-38/unit (delete PFI injectors + rail + ECU channel)',
        bench: 'Toyota 2GR-FKS V6 (GDI-only 2020–, replaced prior D-4ST dual injection); VW TSI Evo 2 (2023, GDI-only on Euro 6e)',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Med',
        new: 1,
        tech: 'Dual-injection systems (GDI + PFI) were adopted to manage carbon deposit build-up on intake valves caused by GDI operation without fuel washing. Improved GDI spray patterns (outward-opening piezo injectors, 350 bar multi-hole), enhanced LSPI control and low-speed pre-ignition countermeasures in modern GDI calibrations now achieve acceptable deposit and LSPI performance without PFI. VW TSI Evo 2 deleted PFI on the 1.5 eTSI for Euro 6e compliance using optimised GDI spray alone.',
        mfg: 'Deletes the entire PFI sub-system: manifold rail, 4 port injectors, return line, additional ECU driver channels, intake manifold injector bosses (or blanks). Reduces intake manifold complexity and engine wiring harness.',
        why: 'Dual-injection systems add £21-38/unit for what is essentially a carbon-management band-aid on legacy GDI designs. Advanced GDI spray design makes the workaround unnecessary. Deleting PFI also reduces EVAP purge loading (fewer fuel vapour sources) and simplifies OBD-II injector monitoring.',
        tr: 'Intake valve deposit performance at 150K km must be demonstrated; LSPI frequency at cold-start must be validated without PFI enrichment; Euro 7 compliance impact to assess.',
      },
      {
        t: 'HPFP right-size to peak torque demand — delete over-specified displacement',
        lev: 'Spec opt.',
        save: '£6-13/unit',
        bench: 'Bosch HDP5 modular HPFP family (displacement variants 0.24-0.48 cc/stroke); Continental V-HPFP right-sizing on Ford 2.3L EcoBoost',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'High-pressure fuel pumps for GDI are mechanically driven by a dedicated camshaft lobe. Pump displacement is typically over-specified by 20-35% to ensure adequate rail pressure build-up at cold start, idle and maximum injection demand simultaneously. Bosch HDP5 offers a modular displacement family; selecting the matched plunger diameter for actual maximum engine fuelling demand removes cost without rail pressure compromise. Ford 2.3L EcoBoost HPFP was right-sized between Mustang and Focus RS derivatives sharing the same engine family.',
        mfg: 'No OEM process change — plunger diameter specification change at supplier level. Smaller plunger may allow a lighter cam follower and reduced cam-lobe base-circle radius, compounding savings into the valvetrain.',
        why: 'HPFP unit cost scales closely with maximum displacement (plunger area × stroke). Over-specification at 20-35% excess capacity means 1 in 4-5 engines pays for a pump size it never requires. Right-sizing the pump to actual peak demand is a direct piece-price reduction.',
        tr: 'Fuel rail pressure at cold-start (sub −15°C) and maximum injection demand validation; pressure-ripple NVH on fuel rail.',
      },
    ],
    top3: [
      { t: 'GDI-only delete PFI sub-system', v: 'Deposit/LSPI 150K km validation; Euro 7 calibration sign-off' },
      { t: 'Platform tank family — shared envelope', v: 'Packaging study across derivatives; EVAP homologation per variant' },
      { t: 'Al fuel rail replacing SS', v: 'Anodise durability in E10/E15; pressure-cycle fatigue validation' },
    ],
  },
  {
    id: 'evap-system',
    sub: 'EVAP (Evaporative Emission)',
    name: 'EVAP canister, purge valve & vapour management',
    baseline: 'Oversized activated-carbon canister (1500-2000 cc working capacity), standalone purge solenoid valve, separate canister bracket, bleed restrictor on canister vent, OBD-II large-leak/small-leak EVAP monitor.',
    fn: 'Adsorb fuel vapour from tank and fuel system during hot soak, purge vapour to intake during engine operation, and maintain vapour-tight system for OBD leak detection.',
    ideas: [
      {
        t: 'Right-size canister working capacity to actual vapour generation — delete oversize buffer',
        lev: 'Spec opt.',
        save: '£4.3-8.5/unit (canister size ↓ 25-35%)',
        bench: 'Toyota TNGA-K canister right-sizing vs legacy platforms (2019); Valeo EVAP optimisation programme across PSA EB-series engines',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'Canister working capacity is routinely over-specified to accommodate worst-case diurnal vapour generation (California 72-hour diurnal test, SHED chamber). Modern high-barrier HDPE tanks (7-layer co-extrusion with EVOH barrier layer) substantially reduce vapour permeation load, allowing canister working capacity to be reduced 25-35% without EVAP compliance risk. Toyota validated this reduction across TNGA-K platforms, switching from legacy over-sized canisters to compact units matched to the reduced permeation rate of their 7-layer HDPE tank.',
        mfg: 'Canister working capacity is proportional to activated carbon volume — a 30% reduction means a smaller canister housing, less activated carbon, smaller bracket and reduced purge flow requirement. The purge valve orifice can also be right-sized to match the lower vapour load.',
        why: 'Canister and its activated carbon fill account for 60-70% of EVAP sub-system BOM cost. Over-sizing is driven by conservative design margins applied on legacy tank permeation data. Pairing a right-sized canister with a modern low-permeation tank removes cost without compliance risk.',
        tr: 'SHED 72-hour diurnal test on worst-case ambient temperature profile; bleed emission validation at canister breakthrough; OBD purge-monitor calibration to reduced canister size.',
      },
      {
        t: 'Delete purge valve on PHEV — sealed tank EVAP architecture',
        lev: 'Consolidation',
        save: '£10-19/unit (delete purge valve + ECU channel + harness)',
        bench: 'Toyota RAV4 PHEV (sealed EVAP, 2021–); BMW X3 xDrive30e (sealed EVAP G01, 2020); Mitsubishi Outlander PHEV (sealed tank EVAP)',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Med',
        new: 1,
        tech: 'PHEVs operating in zero-emission mode (EV priority) may run for extended periods without engine fuelling, preventing conventional canister purge. US regulations (CARB LEV-III) permit a sealed fuel tank EVAP architecture on PHEVs where the tank is pressurised above ambient and vapour is managed via a sealed system with active pressure control rather than an open-canister + purge path. Toyota RAV4 PHEV uses a sealed canister-less EVAP: a piezo tank pressure valve controls vapour containment; purge occurs opportunistically during engine-on events. BMW X3 xDrive30e uses a similar sealed approach.',
        mfg: 'Deletes: purge solenoid valve, purge hose from canister to intake manifold, canister in some architectures, ECU purge driver channel, and associated wiring. Adds a tank pressure control valve (piezo) and bladder or expansion chamber, but the net system is lower cost at OEM assembly.',
        why: 'Conventional EVAP purge relies on consistent engine operation to regenerate the canister — PHEVs cannot guarantee this. The purge-valve system on a PHEV is therefore a compliance liability as well as a cost. Sealed architectures delete the purge path entirely, simplifying the system and removing parts.',
        tr: 'Tank structural integrity under vapour pressure cycling (up to +/− 25 kPa); piezo valve durability over life; OBD-II EVAP leak test compliance under CARB LEV-III; hot soak vapour containment at 40°C.',
      },
      {
        t: 'OBD-III EVAP monitor simplification: onboard pump-down leak detection replacing external reference',
        lev: 'Design',
        save: '£6.8-13/unit (delete external reference orifice + vacuum pump variant)',
        bench: 'Bosch leak detection pump (LDP) integrated vs external reference; Continental ORVR+LDP combined system (VW Group MEB)',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'OBD-II EVAP leak detection has historically used an external reference orifice (0.020" calibrated hole) for large-leak detection and a separate vacuum decay method for small-leak. Modern onboard reference-less systems (Bosch LDP with integrated reference, Continental combined pump) use a solenoid-switched internal pressure reference, eliminating the external hardware. MEB EVAP integrates the LDP with ORVR vapour management in one module, deleting the standalone reference orifice assembly and its bracket.',
        mfg: 'Deletes external reference orifice housing, bracket, and 2-way hose routing to EVAP canister. Integrated pump module is a single connection point vs multi-port manifold. Reduces assembly operations at the engine line by 2-3 steps.',
        why: 'Separate EVAP leak detection hardware adds part count, hose routing complexity and assembly operations. Integration into the LDP module achieves the same OBD compliance from a single device, reducing supplier interfaces and vehicle integration cost.',
        tr: 'OBD-II EVAP monitor readiness calibration; false-positive rate validation over temperature range; altitude compensation for pump-down pressure reference.',
      },
      {
        t: 'Common canister bracket across platform — delete derivative-specific brackets',
        lev: 'Standardization',
        save: '£1.3-3/unit + £21-38.3K tooling NRE per derivative avoided',
        bench: 'Ford EcoBoost platform (common EVAP bracket across 1.0L/1.5L/2.0L, 2020–); VW MQB EVAP bracket standardisation',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'EVAP canister brackets are often styled to the specific underbody packaging of each derivative despite the canister itself being common. Designing a universal bracket with slotted mounting positions and a common canister foot-print allows the same pressed-steel or PP-GF bracket to be used across multiple engine variants on the same platform. Ford rationalised EVAP brackets across EcoBoost 1.0L, 1.5L and 2.0L to a single adjustable design.',
        mfg: 'One bracket tool (£6.8-10.2K progressive die) replaces 3-4 derivative tools (£21-38.3K combined). Common sub-assembly line for all derivatives. Reduces supplier SKU count and safety-stock holding.',
        why: 'Derivative-specific EVAP brackets are a classic platform-design inefficiency — the packaging constraint that drives them is often a 5-10mm underbody clearance difference that can be accommodated with slotted holes or a simple spacer, rather than a new tool.',
        tr: 'Vibration/fatigue validation of common bracket at worst-case engine mount and road load; clearance check across all derivatives at full bump.',
      },
      {
        t: 'Delete bleed restrictor on improved-adsorption canister design',
        lev: 'Consolidation',
        save: '£0.7-1.5/unit + 1 assembly operation',
        bench: 'Ingevity activated carbon high-adsorption pellet canister eliminating vent restrictor (2022); Kuraray MAXXAM high-BWC carbon (working capacity +30% per volume)',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'Bleed restrictors on canister vent lines limit the flow rate during vapour loading to improve carbon adsorption efficiency, preventing channelling and vapour breakthrough. High-adsorption activated carbons (Ingevity Bleed Emission Reduction, Kuraray MAXXAM) with butane working capacity >14 g/dL and low bleed emission allow the vent path to be unrestricted without compromising breakthrough performance. Several OEMs have qualified these carbon grades and deleted the vent restrictor orifice.',
        mfg: 'Deletes a pressed-in orifice insert from the canister vent port — one plastic component and one assembly press-fit operation per unit. Simple cost saving with no system architecture change.',
        why: 'The bleed restrictor exists to compensate for standard-grade carbon adsorption performance. Upgrading the carbon grade removes the root cause and allows the restrictor to be deleted. Carbon grade upgrade cost (£0.3-0.5/unit) is more than offset by deletion savings.',
        tr: 'Bleed emission validation at canister breakthrough; 72-hour SHED test with new carbon grade; ensure vent line routing does not create pressure drop that substitutes for the deleted restrictor.',
      },
    ],
    top3: [
      { t: 'Delete purge valve on PHEV — sealed EVAP', v: 'Tank pressure cycling durability; CARB LEV-III compliance validation' },
      { t: 'Right-size canister working capacity', v: 'SHED 72-hour diurnal test; OBD purge-monitor calibration' },
      { t: 'Common bracket across platform', v: 'Vibration fatigue validation; clearance check across all derivatives' },
    ],
  },
  {
    id: 'nox-aftertreatment',
    sub: 'NOx Aftertreatment',
    name: 'SCR catalyst, AdBlue system & EGR cooler',
    baseline: 'SCR catalyst 600 cpsi substrate, separate DPF upstream of SCR, large AdBlue tank (20-25L) sized to max service interval, engine-specific EGR cooler, separate DPF + SCR bricks in downstream can.',
    fn: 'Reduce engine-out NOx to below Euro 6e/Euro 7 limits via selective catalytic reduction with urea (AdBlue), while managing soot loading via DPF and recirculated exhaust gas temperature via EGR cooler.',
    ideas: [
      {
        t: 'SCR substrate right-size: 400 cpsi vs 600 cpsi — delete excess cell density where space-velocity allows',
        lev: 'Spec opt.',
        save: '£6.8-15/unit substrate cost',
        bench: 'BASF SCR substrate optimisation (2021); Corning DuraTrap AT — 400 cpsi standard for light-duty <2.0L diesel (2020–)',
        v8: 'any',
        mat: 'Proven',
        risk: 'Med',
        tech: 'SCR substrate cell density selection (400 vs 600 cpsi) is driven by the trade-off between geometric surface area (catalyst contact) and pressure drop. 600 cpsi was adopted broadly to meet Euro 6 NOx targets with smaller substrate volumes, but as engine-out NOx improved (improved combustion, cooled EGR), the catalyst volume requirement reduced. For engines with engine-out NOx <0.6 g/kWh, a 400 cpsi substrate in an equivalent volume achieves comparable SCR NOx conversion efficiency at 12-18% lower substrate cost (less cordierite). Corning validated 400 cpsi as the standard for sub-2.0L diesel applications in 2020.',
        mfg: 'No change to catalyst can tooling — the substrate outer diameter and length remain the same; only cell density is changed. Lower-cpsi substrates are extruded faster and have lower die complexity, reducing substrate piece price.',
        why: '600 cpsi was a response to tight packaging on early Euro 6 systems where catalyst volume was limited. Modern engine-out NOx levels and improved catalyst washcoat loading enable equivalent conversion efficiency at lower cell density and lower cost. The pressure-drop reduction at 400 cpsi also reduces exhaust backpressure and fuel economy penalty.',
        tr: 'NOx conversion efficiency at cold-start RDE; pressure drop on turbo back-pressure map; catalyst durability at 240K km (Euro 7 requirement); substrate crack resistance vs 600 cpsi.',
      },
      {
        t: 'AdBlue tank right-size to actual service interval — delete oversized tank on short-range/urban-cycle vehicles',
        lev: 'Spec opt.',
        save: '£13-24/unit (tank volume ↓, mounting simplification)',
        bench: 'VW Group AdBlue right-sizing programme (Polo/Golf TDI 12L vs A6/Q7 26L, 2022); Toyota Hilux 2.8D Euro 6e (10L AdBlue, matched to 15K km service)',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Low',
        new: 1,
        tech: 'AdBlue consumption rate is approximately 3-5% of diesel fuel consumption. A vehicle with a 50L diesel tank consuming 6L/100km at WLTP uses 0.18-0.30L AdBlue/100km, requiring 10.8-18L AdBlue per 6,000 km service interval. Many B/C-segment diesels specify 15-20L AdBlue tanks that are over-sized relative to their actual service interval and usage pattern. VW Polo TDI was rationalised from a 17L tank to 12L when matched to a 20K km service interval; Toyota Hilux uses a compact 10L tank on its 2.8L engine matched precisely to a 15K km oil change interval.',
        mfg: 'Smaller blow-moulded HDPE AdBlue tank, smaller underbody mounting bracket, shorter supply line, smaller heating element (if coolant-heated). Deletion of tank-overfill protection level if volume is below the packaging constraint. Reduces sub-system mass by 1.5-4 kg.',
        why: 'AdBlue tanks are sized to either the maximum service interval or to worst-case AdBlue consumption on towing/mountain drive cycles. For the majority of customers in B/C segment, a right-sized tank matched to the actual service interval achieves identical AdBlue availability without over-sizing. Smaller tank directly reduces material, forming cost and mounting hardware.',
        tr: 'AdBlue depletion rate validation on full RDE cycle with trailer towing; low-level warning system calibration to right-sized volume; Euro 7 depletion monitoring compliance.',
      },
      {
        t: 'Common SCR catalyst washcoat formulation across engine family — delete engine-specific washcoats',
        lev: 'Standardization',
        save: '£4.3-10/unit washcoat + £68-128K qualification cost per variant avoided',
        bench: 'BASF SmartSCR universal washcoat platform (2021, adopted by BMW B47/B57 diesel family); Umicore universal Cu-zeolite washcoat across VW Group TDI engines',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'SCR washcoat formulations (Cu-zeolite vs Fe-zeolite vs V2O5-TiO2) have historically been engine-specific to match the exhaust temperature window of each engine. Advances in Cu-SSZ-13 zeolite washcoat technology (BASF SmartSCR, Umicore UnifNOx) now provide adequate NOx conversion efficiency across a wider temperature range (180-600°C), allowing one washcoat formulation to serve multiple engine calibrations on the same platform. BMW standardised a single BASF washcoat across B47 (2.0L) and B57 (3.0L) diesel in 2021.',
        mfg: 'One washcoat recipe, one supplier qualification, one batch process across all engine variants. Consolidates catalyst volume purchasing (better pricing), reduces supplier SKU complexity and allows single-batch wash-coating of substrates for all derivatives.',
        why: 'Engine-specific washcoat formulations are a significant source of hidden cost in the catalyst supply chain — each formulation requires separate supplier qualification, batch production, quality hold, and inventory management. Platform washcoat standardisation removes most of this overhead.',
        tr: 'NOx conversion efficiency across temperature window of all engine variants; durability at 240K km on highest-temperature engine; calibration validation per engine with common washcoat.',
      },
      {
        t: 'EGR cooler right-size to actual recirculation demand — delete over-sized core',
        lev: 'Spec opt.',
        save: '£8.5-17/unit',
        bench: 'BorgWarner EGR cooler right-sizing (2020); Valeo EGR cooler compact core on Stellantis 1.5L BlueHDi (2021)',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'EGR cooler core area is typically sized for maximum EGR rate at rated power — a condition that occurs briefly and rarely in real-world driving. WLTP and RDE drive cycle analysis shows that most diesel engines operate below 50% rated power for 90%+ of drive time, with EGR rates well below maximum. Right-sizing the cooler core to cover the 90th-percentile actual operating demand (vs 100th-percentile peak) allows a 20-30% reduction in core tube count and heat transfer area without compromising RDE NOx performance. BorgWarner applied this methodology across a tier-1 customer programme in 2020, reducing EGR cooler mass by 18% and cost by £8.5-17/unit.',
        mfg: 'Fewer corrugated tubes in the cooler core, smaller housing, and potentially lighter coolant fittings. Core is brazed aluminium or stainless; fewer tubes means shorter brazing cycle and less material. Packaging benefit: smaller cooler envelope improves engine bay layout.',
        why: 'EGR cooler is one of the higher-cost engine ancillaries (£38-77 depending on engine). Over-sizing for a rarely-achieved peak condition means every vehicle in the fleet carries cost for a condition that 90% of customers never encounter. Right-sizing to real-world demand removes the excess without compliance risk.',
        tr: 'EGR outlet temperature at maximum load and towing; cooler effectiveness at minimum coolant flow (cold idle); deposit fouling rate validation at reduced cooler core size.',
      },
      {
        t: 'DPF + SCR combined substrate (SCRF) vs separate DPF + SCR bricks',
        lev: 'Consolidation',
        save: '£21-43/unit (delete separate DPF housing + can)',
        bench: 'Johnson Matthey SCRF (SCR on Filter); Continental/BASF close-coupled SCRF on BMW B47 Euro 6e (2022); Corning DuraTrap SCRF (Ford 2.0L EcoBlue)',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Med',
        new: 1,
        tech: 'SCR-coated DPF (SCRF or SDPF) combines soot filtration and selective catalytic reduction into one substrate, eliminating the separate DPF housing and its downstream connection to the SCR brick. Johnson Matthey, Corning and BASF commercialised SCRF for Euro 6e at scale; Ford 2.0L EcoBlue uses a Corning SCRF as the sole aftertreatment element downstream of a close-coupled oxidation catalyst. BMW B47 Euro 6e uses a BASF SCRF from 2022, deleting the separate DPF body. Net catalyst system goes from 3 bricks (DOC + DPF + SCR) to 2 (DOC + SCRF).',
        mfg: 'Deletes one catalyst housing (canister), one set of flanged joints, associated heat shields, lambda sensor boss and packaging hardware. Aftertreatment line length is reduced, benefiting underbody package and exhaust pipe routing. Assembly reduces by 4-6 fastening and sealing operations.',
        why: 'Separate DPF and SCR bricks represent the legacy Euro 5 architecture carried into Euro 6. SCRF technology is proven in volume production and delivers equivalent soot and NOx performance from one substrate, deleting an entire can assembly from the system. The system simplification compounds savings in heat-shield material, assembly operations and quality checkpoints.',
        tr: 'DPF regeneration temperature management with SCR washcoat (avoid de-greening during regen); NOx conversion efficiency immediately post-regen; passive regen frequency vs separate DPF; 240K km durability validation.',
      },
    ],
    top3: [
      { t: 'DPF+SCR combined SCRF — delete separate DPF housing', v: 'Regen temperature/SCR washcoat interaction; 240K km durability validation' },
      { t: 'AdBlue tank right-size to service interval', v: 'RDE towing consumption validation; Euro 7 depletion monitor compliance' },
      { t: 'Common SCR washcoat across engine family', v: 'NOx conversion across temperature window; durability at highest-temp engine' },
    ],
  },
  {
    id: 'exhaust-aftertreatment',
    sub: 'Catalytic Emission Control',
    name: 'GPF, TWC, manifold catalysts & heat shields',
    baseline: 'GPF 300 cpsi thin-wall substrate separate from TWC, standalone TWC brick in underfloor position, separate engine-specific manifold casting, full stainless steel heat shield cladding sized conservatively.',
    fn: 'Oxidise HC/CO, control NOx via three-way catalysis, and filter particulates (GPF) to meet Euro 6e/Euro 7 emission limits over 240K km.',
    ideas: [
      {
        t: 'Euro 7 GPF thin-wall substrate cost optimisation — 4-mil wall vs legacy 6-mil',
        lev: 'Spec opt.',
        save: '£4.3-10/unit substrate cost ↓, backpressure ↓',
        bench: 'Corning DuraTrap GPF 4-mil/300 cpsi (2022, adopted VW EA888 Evo4 Euro 7 programme); NGK 4-mil thin-wall GPF',
        v8: 'any',
        mat: 'Proven',
        risk: 'Med',
        tech: 'GPF substrate wall thickness selection affects backpressure (fuel economy), filtration efficiency and manufacturing cost. Legacy 6-mil wall substrates were specified conservatively for Euro 6d-TEMP; Euro 7 particulate limits can be met with 4-mil wall substrates when paired with improved cordierite or silicon carbide formulations that maintain adequate pore architecture for PM filtration. Corning validated 4-mil DuraTrap GPF for Euro 7 compliance on VW EA888 Evo4. Thinner walls reduce extrusion cycle time, cordierite material volume and substrate mass.',
        mfg: 'Thinner-wall substrates are extruded at lower die pressure with faster throughput. Less cordierite per unit reduces raw material cost. Can skin and mounting mat (ceramic fibre) can be reduced proportionally if substrate diameter remains constant. Reduces substrate firing time in kiln by 8-12%.',
        why: 'GPF substrates represent 35-50% of the gasoline aftertreatment system BOM cost. Wall thickness is a key cost driver — reducing from 6-mil to 4-mil reduces cordierite volume by 33%, directly cutting material and kiln energy cost at equivalent substrate dimensions. Backpressure benefit (CO2 saving on WLTP) is an additional commercial argument.',
        tr: 'PM filtration efficiency at Euro 7 WLTC-PM limit; substrate crack resistance at thermal shock (cold start on hot substrate); ash loading capacity over 240K km; pressure drop validation at maximum exhaust flow.',
      },
      {
        t: 'PGM loading reduction via advanced washcoat — Pd/Rh optimisation (BASF, Umicore)',
        lev: 'Material',
        save: '£6.8-21/unit (PGM is 40-60% of TWC cost)',
        bench: 'BASF EMICAT advanced Pd-dominant TWC (2021, adopted by Toyota/BMW); Umicore ZPGM and reduced-Rh TWC programmes (2022)',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Med',
        new: 1,
        tech: 'Platinum group metal (PGM) loading — particularly Rhodium (Rh) which is the most expensive PGM at £85-255/troy oz — accounts for 40-60% of three-way catalyst BOM cost. BASF EMICAT technology uses advanced Pd-dominant washcoat chemistry with nano-particle stabilisation, achieving equivalent NOx/HC/CO conversion efficiency at 30-40% lower total PGM loading vs 2018-era TWC. Umicore ZPGM research targets partial Rh replacement with base metals (Mn, Fe). Toyota specified BASF reduced-PGM washcoat from 2021 on the 2.5L A25A-FXS; BMW adopted similar BASF formulations on B38/B48 from 2022.',
        mfg: 'PGM loading is applied in the washcoat slurry step at the catalyst supplier — no OEM manufacturing change. Reduced PGM loading reduces washcoat batch cost and stabilises BOM against PGM spot-price volatility. Pd price is £30-60/troy oz vs Rh at £85-255/troy oz — shifting to Pd-dominant further reduces cost risk.',
        why: 'PGM cost is the single largest variable in TWC total cost of ownership and is exposed to commodity price volatility. A 30-40% reduction in total PGM loading — achieved without conversion efficiency compromise through advanced washcoat chemistry — directly reduces cost and reduces exposure to Rh price spikes. Every gram of Rh removed saves £2.5-8.5 at spot price.',
        tr: 'Euro 7 HC/CO/NOx compliance at 240K km aging equivalent; cold-start light-off temperature validation with reduced PGM; oxygen storage capacity (OSC) performance at reduced washcoat loading.',
      },
      {
        t: 'TWC + GPF combined brick — delete separate TWC underfloor can',
        lev: 'Consolidation',
        save: '£17-34/unit (delete underfloor TWC housing and associated plumbing)',
        bench: 'BASF four-way catalyst (4WC: TWC + GPF combined, 2020); Umicore gasoline particulate filter with TWC washcoat (adopted Stellantis 1.2 PureTech Euro 6e); Continental/BASF close-coupled 4WC on VW EA211 Evo Euro 7',
        v8: 'fav',
        mat: 'Proven',
        risk: 'Med',
        tech: 'Four-way catalyst (4WC) combines TWC functionality (HC, CO, NOx conversion) with GPF particulate filtration in a single coated filter substrate, close-coupled to the manifold. This replaces the architecture of a close-coupled TWC + underfloor TWC + underfloor GPF with two bricks (close-coupled 4WC + underfloor oxidation/TWC trim if required). BASF commercialised 4WC for Euro 6e/Euro 7 applications. Stellantis adopted Umicore 4WC on the 1.2 PureTech for Euro 6e, deleting the separate underfloor TWC body. Exhaust system part count reduces from 4-5 cans to 2-3.',
        mfg: 'Deletes one underfloor catalyst housing, associated lambda sensor boss, flanged joint, heat shield section and mounting bracket. Assembly operations reduced by 3-5 steps. Exhaust pipe routing simplified with fewer connecting sections. Sub-supplier interface reduced (one fewer catalyst order/quality stream).',
        why: 'The legacy Euro 5 architecture of close-coupled TWC + underfloor TWC + separate GPF was assembled incrementally as each regulation was added. Euro 7 rationalisation with a 4WC close-coupled brick deletes the underfloor TWC entirely, which represents the simplest and most cost-effective architecture for Euro 7 gasoline compliance. The deletion of a whole aftertreatment can assembly is a significant manufacturing and BOM cost saving.',
        tr: 'TWC light-off performance at cold-start with GPF substrate thermal mass; GPF filtration efficiency after washcoat application; backpressure on turbocharged applications; oxygen sensor placement for 4WC control.',
      },
      {
        t: 'Common manifold casting across engine power variants — delete derivative-specific manifolds',
        lev: 'Standardization',
        save: '£51-102K manifold tooling NRE per variant + £6.8-13/unit piece-price volume benefit',
        bench: 'Toyota A25A engine family (common cast manifold across Camry/RAV4/Highlander, 3 power states, 2018–); BMW B48 common manifold across 150kW/135kW/120kW variants',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'Exhaust manifolds (especially integrated manifolds cast into the cylinder head — IEM) are commonly differentiated across power variants due to different exhaust port exit geometries driven by turbine matching. Designing a common manifold casting with power-variant differentiation achieved through turbo outlet geometry only (machined flanges, outlet cone) allows one manifold casting tool to cover 2-3 power states. Toyota A25A uses a common cast IEM across the Camry 2.5L (203 hp), RAV4 2.5L (203 hp) and Highlander 2.5L hybrid (190 hp); BMW B48 uses a common cast IEM across three power levels with turbocharger and outlet port machining providing power differentiation.',
        mfg: 'One gravity-tilt or lost-foam manifold casting tool (£51-102K) replaces 2-3 derivative tools (£128-238K combined). Common casting simplifies foundry scheduling, alloy specification and quality management. Piece-price benefits from volume consolidation on one cast part vs split volumes.',
        why: 'Manifold casting tool amortisation is a significant fixed cost in small-volume derivatives. Each unique manifold casting requires its own foundry tooling, PFMEA qualification, foundry process, CMM programme and supply chain approval. A common casting eliminates most of this overhead across derivatives, with power differentiation achieved through lower-cost machining variations.',
        tr: 'Turbine inlet temperature mapping across all power states with common manifold geometry; exhaust pulse tuning validation for lowest-power variant; NVH/acoustic validation of common manifold on all engine calibrations.',
      },
      {
        t: 'Catalytic converter heat shield material right-size — Al-clad vs SS where temperature is below 600°C',
        lev: 'Material',
        save: '£2.5-6.8/unit heat shield assembly',
        bench: 'Autoneum/Dana underfloor heat shield Al-clad replacement programme (2020-23, applicable PSA/Stellantis diesel platforms); Corus/Tata aluminium-clad heat shield validation for gasoline underfloor',
        v8: 'any',
        mat: 'Proven',
        risk: 'Low',
        tech: 'Catalytic converter heat shields are commonly specified in 409/439 ferritic stainless steel throughout the exhaust system for uniformity. However, for underfloor catalyst shields remote from the turbocharger where surface temperatures are below 600°C, aluminium-clad steel (Al-clad 1050) provides equivalent thermal protection and corrosion resistance at 30-40% lower material cost and 20% lower mass. Dana and Autoneum validated Al-clad heat shield material on Stellantis BlueHDi and PSA diesel platforms from 2020 where underfloor shield temperature data confirmed sustained surface temperatures below 580°C.',
        mfg: 'Al-clad heat shields are formed on the same progressive dies as stainless; no tooling change. Al-clad is easier to form (lower spring-back vs stainless), improving dimensional accuracy and reducing die wear. Lighter heat shield reduces robotic handling tooling loading and sub-assembly mass.',
        why: 'Specifying 409 SS throughout the exhaust heat shield system regardless of local temperature is a material over-specification on the underfloor sections. Finite element thermal analysis of underfloor shield temperatures typically shows 150-200°C headroom below the SS justification threshold. Al-clad is a proven drop-in substitution that removes 30-40% of shield material cost on applicable sections.',
        tr: 'Thermal survey of shield surface temperatures at maximum sustained power; corrosion validation to salt-spray standard (EN ISO 9227); vibration fatigue at manifold-mounting frequency.',
      },
    ],
    top3: [
      { t: 'TWC + GPF combined 4WC brick — delete underfloor TWC', v: 'Cold-start light-off; backpressure on turbocharged variant; O2 sensor placement' },
      { t: 'PGM loading reduction via BASF/Umicore advanced washcoat', v: '240K km aging validation; cold-start HC/CO light-off with reduced PGM' },
      { t: 'Common manifold casting across power variants', v: 'Turbine inlet temp mapping; exhaust pulse NVH on lowest-power variant' },
    ],
  },
];

// ─── INDUSTRY TRENDS ─────────────────────────────────────────────────────────

export const FUEL_EMISSION_TRENDS: FuelEmissionTrend[] = [
  {
    t: 'Euro 7 catalyst: 4WC close-coupled replacing 3-brick architecture',
    status: 'Mainstream (Euro 7)',
    save: 'Delete underfloor TWC can: £17-34/unit',
    dir: 'BASF, Umicore and Johnson Matthey 4WC (four-way catalyst) — TWC + GPF in one brick — is the consensus Euro 7 gasoline architecture. VW EA211/EA888 Evo4, Stellantis PureTech 1.2 Evo and BMW B38 Euro 7 variants all moving to close-coupled 4WC, deleting the underfloor TWC can. Johnson Matthey expects 4WC to represent 60%+ of gasoline catalyst supply by 2027.',
  },
  {
    t: 'SCR-on-filter (SCRF) replacing separate DPF + SCR on Euro 7 diesel',
    status: 'Mainstream (Euro 7 diesel)',
    save: 'Delete separate DPF housing: £21-43/unit',
    dir: 'Ford EcoBlue 2.0L (Corning SCRF from 2022), BMW B47 Euro 6e/7 (BASF SCRF), Stellantis BlueHDi Evo. SCRF eliminates the separate DPF can, reducing diesel aftertreatment to DOC + SCRF (2 elements vs 3). Continental and BASF both report SCRF as the default Euro 7 diesel architecture for >90% of their new diesel programmes from 2024.',
  },
  {
    t: 'GDI-only architecture replacing dual-injection (GDI + PFI)',
    status: 'Emerging → Mainstream',
    save: 'Delete PFI sub-system: £21-38/unit',
    dir: 'Toyota 2GR-FKS, VW TSI Evo 2 (2023 Golf Evo), BMW B58 Evo — all moving to optimised GDI-only after 5+ years of dual-injection. Advanced outward-opening GDI injectors and improved LSPI management eliminate the need for port fuel washing. Reduces intake manifold complexity, ECU channel count and fuel system parts.',
  },
  {
    t: 'PHEV sealed EVAP replacing conventional purge-based EVAP',
    status: 'Mainstream (PHEV)',
    save: 'Delete purge valve system: £10-19/unit',
    dir: 'Toyota RAV4 PHEV, BMW X3 xDrive30e, Mitsubishi Outlander PHEV, Ford Escape PHEV — all using sealed EVAP architecture. CARB LEV-III specifically accommodates sealed PHEV EVAP; China GB standards follow. Continental estimates 80%+ of PHEV programmes from 2025 will specify sealed EVAP, eliminating the purge valve entirely.',
  },
  {
    t: 'Reduced-PGM washcoat via advanced Pd/Rh chemistry (BASF, Umicore)',
    status: 'Mainstream',
    save: 'PGM loading −30-40%: £6.8-21/unit',
    dir: 'BASF EMICAT, Umicore UnifNOx and Johnson Matthey StepEx all deliver equivalent TWC/SCR performance at substantially lower PGM loading. Toyota/BMW leading adoption from 2021-22. Rh price volatility (£128-425/troy oz range 2020-24) driving every OEM to accelerate Pd-dominant reformulation. All major OEMs now have active PGM reduction programmes with 3-year targets.',
  },
  {
    t: 'Al fuel rail replacing stainless steel on GDI systems',
    status: 'Mainstream',
    save: 'Fuel rail cost −50-60%: £5.1-9.3/unit',
    dir: 'BMW B-series, Toyota A-series, Hyundai Theta-III and Kia Smartstream G all specify anodised Al GDI fuel rails. Bosch and Continental both supply Al rail variants for their high-pressure fuel delivery systems. SS rails increasingly confined to flex-fuel/E85 applications where alcohol corrosion justifies the premium.',
  },
  {
    t: 'Modular platform tank families replacing derivative-specific tank designs',
    status: 'Mainstream',
    save: 'NRE tooling saved: £77-128K per derivative',
    dir: 'Toyota TNGA, VW MQB, Stellantis STLA and Renault CMF all define common tank envelope families. Blow-mould tooling cost is the primary driver — shared tools are now an explicit design requirement in platform engineering. Trend is accelerating as platform derivatives multiply but development budgets tighten.',
  },
  {
    t: 'Thin-wall GPF substrates (4-mil) replacing legacy 6-mil for Euro 7',
    status: 'Emerging → Mainstream',
    save: 'Substrate cost −15-25%: £4.3-10/unit',
    dir: 'Corning DuraTrap AT 4-mil GPF, NGK 4-mil GPF both qualified for Euro 7. VW Group EA888 Evo4 Euro 7 specification uses 4-mil substrate. Backpressure benefit (CO2 saving on WLTP) and cordierite material reduction both drive adoption. NGK estimates 4-mil will represent 65%+ of new European gasoline GPF supply by 2026.',
  },
  {
    t: 'OBD-III integrated EVAP leak detection — onboard pump reference replacing external orifice',
    status: 'Emerging',
    save: 'Delete external reference hardware: £6.8-13/unit',
    dir: 'Bosch LDP with integrated reference, Continental EVAP module — both eliminate the external reference orifice hardware required by earlier OBD-II EVAP systems. MEB EVAP system demonstrates full integration. US EPA and CARB OBD update cycles are accommodating onboard reference systems. Trend is being accelerated by PHEV sealed systems which require onboard pressure monitoring regardless.',
  },
];

// ─── COST STRUCTURE ──────────────────────────────────────────────────────────

export const FUEL_EMISSION_COST_STRUCTURE = [
  { name: 'Aftertreatment (TWC/GPF/SCR)', share: 38, color: '#6366f1' },
  { name: 'Fuel storage & delivery', share: 26, color: '#8b5cf6' },
  { name: 'NOx / DPF system (diesel)', share: 20, color: '#a855f7' },
  { name: 'EVAP & vapour management', share: 10, color: '#7c3aed' },
  { name: 'Heat shields & sealing', share: 6, color: '#5b21b6' },
];

// ─── MANUFACTURING LEVERS ─────────────────────────────────────────────────────

export const FUEL_EMISSION_MFG_LEVERS: FuelEmissionMfgItem[] = [
  {
    t: 'Common catalyst can tooling across engine family (press-formed SS body)',
    lev: 'Standardization',
    save: '£34-68K NRE tooling per derivative avoided',
    note: 'Define common catalyst can outer diameter and flange geometry across all engine variants on a platform — differentiate only by substrate diameter and length insert. One press tool, one end-cap die, shared bracket. VW Group MQB standardised catalyst can flanges across TSI/TDI families reducing can tooling by 40%.',
  },
  {
    t: 'Robotic catalyst substrate loading and mat wrapping replacing manual',
    lev: 'Automation',
    save: '30-40% labour on catalyst line',
    note: 'Robotic mat-wrap and push-in loading of GPF/SCR substrates replaces manual handling. Consistent mat compression improves substrate retention and reduces can swell failures. Continental Emitec automated catalyst assembly lines achieve 120 units/hour vs 60-80 manual. Reduces direct labour by 2-3 operators per shift.',
  },
  {
    t: 'AdBlue tank blow-moulding: integrate pump flange and level sender boss in-mould',
    lev: 'Consolidation',
    save: '2-3 machining and assembly operations',
    note: 'Moulded-in flange for the AdBlue pump/heating module and the level sender boss, replacing post-mould welded or machined ports. Kautex and TI Fluid Systems both offer in-mould flange integration for AdBlue HDPE tanks. Eliminates welded insert and associated leak test at these interfaces.',
  },
  {
    t: 'EVAP canister activated-carbon fill automation (vibratory settle + vacuum check)',
    lev: 'Automation',
    save: '15-20% fill variation; 1 operator saved',
    note: 'Automated vibratory filling of activated carbon pellets into EVAP canister housings with vacuum settle and weight-check verification. Eliminates manual fill variation and ensures consistent working capacity. Reduces canister-to-canister SHED performance scatter. Applied by Ingevity and MAHLE Aftermarket canister supply lines.',
  },
  {
    t: 'Laser welding of fuel rail injector bosses replacing MIG on Al rail',
    lev: 'Joining',
    save: '40-50% weld cycle time; distortion ↓',
    note: 'Laser welding of Al injector cup bosses to extruded Al rail achieves narrow HAZ (3-4mm vs 12-15mm MIG) and eliminates post-weld straightening. Faster cycle (0.8 sec/joint vs 4 sec MIG) and no filler material. BMW and Toyota both specify laser-welded Al fuel rails on B48/A25A families. Improves dimensional accuracy of injector-to-bore alignment.',
  },
  {
    t: 'Press-form exhaust heat shields with Al-clad material — replace roll-formed SS',
    lev: 'Process',
    save: '20-30% less spring-back; lower die wear',
    note: 'Al-clad heat shield blanks press-form with less spring-back than 409 SS, improving dimensional conformance to exhaust routing and reducing re-strike operations. Lower material hardness extends die life by 25-35%. Dana and Tenneco both validated Al-clad formability for underfloor heat shield applications. Reduces scrap rate on complex double-curved shield geometry.',
  },
  {
    t: 'Single EVAP canister sub-assembly cell across all derivatives (common fixture)',
    lev: 'Standardization',
    save: '1 assembly cell vs 2-3 derivative-specific cells',
    note: 'Common EVAP sub-assembly fixture accommodating all platform variants by adjustment rather than tooling change. Common bracket welding fixture with adjustable stops for different canister heights. Reduces cell footprint, training burden and changeover time. Applied on VW MQB EVAP sub-assembly at Wolfsburg to consolidate 4 derivative cells into 1 flexible cell.',
  },
];

// ─── OEM BENCHMARKS ──────────────────────────────────────────────────────────

export const FUEL_EMISSION_OEM_BENCHMARKS: FuelEmissionBenchmark[] = [
  {
    oem: 'Toyota',
    model: 'TNGA-K platform (RAV4 / Camry / Highlander, 2019–)',
    moves: [
      'Common fuel tank outer envelope across 3 nameplates — blow-mould tooling shared, sender/strap differentiate derivatives',
      'Canister right-sized (25% smaller vs TNGA-C) using 7-layer EVOH-barrier HDPE tank permeation data',
      'Al fuel rail on 2.5L A25A-FXS hybrid — laser-welded injector bosses replacing SS rail',
      'Reduced-PGM TWC washcoat (BASF EMICAT): 30% lower Rh loading validated at 150K km on A25A',
    ],
  },
  {
    oem: 'Volkswagen Group',
    model: 'MQB Evo / EA888 Evo4 Euro 7 (Golf/Tiguan, 2023–)',
    moves: [
      'Euro 7 EA888 Evo4: 4WC (four-way catalyst, BASF) close-coupled replacing TWC + underfloor TWC + separate GPF — 3 cans → 2',
      'GDI-only TSI Evo 2 (2023): deleted PFI injectors/rail saving £24/unit; LSPI managed by calibration and outward-opening GDI injector',
      'MQB EVAP integrated LDP with onboard reference (Continental) — deleted external EVAP reference orifice assembly',
      'Common 400 cpsi SCR substrate washcoat (Umicore Cu-SSZ-13) across TDI 2.0L and TDI 3.0L engine families on MQB/MLB',
    ],
  },
  {
    oem: 'BMW',
    model: 'B47 / B48 engine family (G20 3 Series / G05 X5, 2019–)',
    moves: [
      'BASF SCRF on B47 Euro 6e (2022): combined DPF+SCR substrate — deleted separate DPF housing, saving £27/unit at system level',
      'Al fuel rail on B48 (from G20, 2019): laser-welded Al 6061 rail replacing legacy SS rail — 58% cost reduction on rail sub-assembly',
      'Common IEM manifold casting across B48 150/135/120kW variants: one casting tool, turbo outlet differentiates power level',
      'BASF reduced-PGM TWC (2022): Pd-dominant washcoat with 35% lower Rh loading on B38/B48 — validated 240K km Euro 7 durability',
    ],
  },
  {
    oem: 'Stellantis',
    model: 'PureTech 1.2 / BlueHDi Euro 6e → Euro 7 (2021–)',
    moves: [
      'PureTech 1.2 Euro 6e: Umicore 4WC (TWC+GPF) close-coupled — deleted underfloor TWC can, saving £19/unit; 2 aftertreatment bricks vs prior 3',
      'BlueHDi Euro 6e/7: Johnson Matthey SCRF eliminating separate DPF housing — aftertreatment simplification saving £26/unit',
      'PHEV (Citroën C5 X, DS 7 PHEV): sealed EVAP architecture (Continental sealed tank valve) — deleted purge valve system saving £13/unit',
      'STLA platform fuel tank: common 42L envelope across Peugeot 308/408 and Opel Astra PHEV derivatives — single blow-mould tooling investment',
    ],
  },
];

// ─── TOTAL IDEAS FUNCTION ─────────────────────────────────────────────────────

export function getTotalFuelEmissionIdeas(): number {
  return FUEL_EMISSION_COMPONENTS.reduce((acc, c) => acc + c.ideas.length, 0);
}
