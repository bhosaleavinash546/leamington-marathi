// EDU (Electric Drive Unit) Knowledge Base
// Source: EDU Cost Engineer — VAVE & Manufacturing Ideation
// Author: Avinash Bhosale, Senior Cost Improvement Engineer (Propulsion)

export interface EduIdea {
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

export interface EduComponent {
  id: string;
  sub: string;
  name: string;
  baseline: string;
  fn: string;
  ideas: EduIdea[];
  top3: { t: string; v: string }[];
}

export interface MfgItem {
  t: string;
  lev: string;
  save: string;
  note: string;
}

export interface MfgLevel {
  title: string;
  sub: string;
  items: MfgItem[];
}

export interface TrendItem {
  t: string;
  status: string;
  save: string;
  dir: string;
}

export interface BrandMove {
  brand: string;
  model: string;
  moves: string[];
}

// ─── COMPONENT IDEAS DATABASE ────────────────────────────────────────────────

export const EDU_COMPONENTS: EduComponent[] = [
  {
    id: 'stator-winding',
    sub: 'Electric machine',
    name: 'Stator winding',
    baseline: 'Round-wire distributed winding, ~40-45% slot fill, copper conductors, varnish-impregnated, water-jacket cooled.',
    fn: 'Carry phase current at low loss, deliver required MMF/torque, withstand thermal/dielectric/AC-loss stress, be wound and terminated at volume.',
    ideas: [
      { t: 'Square flat-wire, 8-layer hairpin (~97.9% motor efficiency)', lev: 'Technology', save: 'Copper + loss ↓', bench: 'XPeng G6 3rd-gen PMSM', v8: 'fav', mat: 'Emerging', risk: 'Med', new: 1, tech: 'Square-section conductors in an 8-layer hairpin lift slot fill well above round wire and 4-6 layer hairpins; XPeng quotes 97.86% motor efficiency.', mfg: 'More layers per slot need precise forming/insertion and more welds.', why: 'Higher fill means less copper and a shorter stack for equal torque; efficiency gain lets the battery shrink.', tr: 'Forming/weld complexity and top-speed AC loss rise with layer count.' },
      { t: 'W-pin (continuous-wave) winding + motor downsizing', lev: 'Technology', save: 'Copper ↓, ~−30% mass', bench: 'NIO ET9 925V (79 kg, 4.3 kW/kg)', v8: 'fav', mat: 'Emerging', risk: 'Med', new: 1, tech: "NIO's 925V W-Pin synchronous motor uses continuous-wave winding for high fill and few welds; the rear motor is 79 kg at 4.3 kW/kg and 280 mm shorter.", mfg: 'Continuous form-and-insert tooling cuts weld stations versus U-pin hairpin.', why: 'Higher power density removes active copper, steel and magnet per kW and shrinks the housing.', tr: 'Sophisticated forming tooling and tight tolerance control.' },
      { t: 'Round-wire → hairpin / bar winding', lev: 'Technology', save: '10-20% copper', bench: 'VW APP550, BMW Gen5, Hyundai E-GMP, Ford F-150 Lightning', v8: 'fav', mat: 'Proven', risk: 'Med', tech: 'Rectangular Cu bars give 65-75% slot fill vs 40-48%, so equal torque needs less copper and a shorter active stack; sub-conductor splitting controls AC/skin loss.', mfg: 'Bend-insert-twist-laser-weld bar set replaces needle/round winding; high-capex automated cells.', why: 'Copper is typically the #2 motor cost; lifting fill cuts conductor mass 10-20%.', tr: 'High forming/weld capital; AC loss at top speed needs careful sub-conductor design.' },
      { t: 'Conductor section / parallel-path right-size for 800V', lev: 'Spec opt.', save: '3-7% copper', bench: 'Universal lever', v8: 'fav', mat: 'Proven', risk: 'Low', tech: 'Match strand count and parallel paths to the real RMS current; 800V halves phase current for equal power, so conductors can be thinner.', mfg: 'Pure design/spec change — no new process.', why: 'Removes copper bought for worst-case current that the 800V duty never draws.', tr: 'Balance DC vs AC loss across the speed range.' },
      { t: 'End-winding length reduction', lev: 'Design', save: '3-8% copper', bench: 'Compact-motor practice', v8: 'any', mat: 'Proven', risk: 'Low', tech: 'Tighter crown geometry and winding scheme cut the overhang where copper carries current but produces no torque.', mfg: 'Forming dies set the crown; tighter geometry needs better insertion control.', why: 'End-turn copper is dead weight and loss; trimming it cuts material and I²R directly.', tr: 'Manufacturability of tighter end-turns.' },
    ],
    top3: [
      { t: 'Hairpin / bar winding', v: 'Slot-fill + stack study, AC-loss check at top speed, weld validation' },
      { t: 'Conductor right-size for 800V current', v: 'RMS/AC-loss simulation at the 800V operating points' },
      { t: 'End-winding reduction', v: 'Manufacturability + thermal check of tighter crowns' },
    ],
  },
  {
    id: 'stator-core',
    sub: 'Electric machine',
    name: 'Lamination core / electrical steel',
    baseline: 'Premium thin-gauge non-grain-oriented steel, conservative grade, ~60% sheet utilisation.',
    fn: 'Conduct flux at low core loss, provide stiffness, be blanked at volume.',
    ideas: [
      { t: 'Raise base/max speed (20-30k rpm) to shrink active material', lev: 'Spec opt.', save: 'Active material ↓', bench: 'BYD ~23k, Yangwang U9 30k, Xiaomi V8s 27.2k', v8: 'fav', mat: 'Emerging', risk: 'High', new: 1, tech: 'Spinning faster lets magnet, copper and steel shrink, with a higher reduction ratio restoring wheel torque.', mfg: 'Needs thin high-grade NO steel (Yangwang uses 0.1 mm), high-speed balancing and rotor-sleeve/bearing upgrades.', why: 'Active material scales with torque/size — raising speed is the most direct route to less material per kW.', tr: 'Thin steel, sleeve, bearings and NVH cost rise; AC/iron loss and rotor stress must be managed.' },
      { t: 'Grade & gauge right-size to duty', lev: 'Material', save: '5-20% core', bench: 'Universal lever', v8: 'fav', mat: 'Proven', risk: 'Low', tech: 'Move premium NO20/M235-35A → M330-35A where base-speed frequency is moderate; reserve 0.10-0.15mm only for >18-20k rpm rotors.', mfg: 'Thicker, lower-Si steel stamps faster and gives longer die life.', why: 'Thicker lower-grade steel is ~10-25% cheaper per kg and removes unused loss margin.', tr: 'Higher eddy/hysteresis loss; place thin gauge only where it pays.' },
      { t: 'Higher sheet utilisation (segmented / nested blanking)', lev: 'Process', save: '5-12% core', bench: 'Segmented-core motors', v8: 'any', mat: 'Proven', risk: 'Med', tech: 'Segment teeth/yoke or nest blanks to lift utilisation from ~60% toward 85-90%.', mfg: 'Progressive-die nesting + scrap buy-back; segment assembly into the yoke adds a step.', why: 'NO-steel skeleton scrap is 35-45% of the coil — recovering it cuts material cost with no design change.', tr: 'Back-iron joints add small reluctance/NVH; assembly complexity.' },
    ],
    top3: [
      { t: 'Grade/gauge right-size', v: 'Loss/efficiency simulation at the 800V duty cycle' },
      { t: 'Sheet utilisation + scrap buy-back', v: 'Nesting study and reclaim contract' },
      { t: 'Joining method to loss budget', v: 'NVH and core-loss confirmation' },
    ],
  },
  {
    id: 'rotor-magnets',
    sub: 'Electric machine',
    name: 'Rotor magnets / magnet strategy',
    baseline: 'Sintered NdFeB IPM, conservative heavy-rare-earth (Dy/Tb) content, full-block magnets.',
    fn: 'Provide rotor excitation/torque at temperature without irreversible demagnetisation.',
    ideas: [
      { t: 'Externally-excited (wound-rotor) synchronous motor — delete the magnets', lev: 'Technology', save: 'Magnet eliminated', bench: 'BMW Gen6 (rear), ZF/Renault', v8: 'fav', mat: 'Proven', risk: 'High', new: 1, tech: 'An electrically-excited rotor makes its own field, removing NdFeB entirely. BMW Gen6 uses EESM on the rear axle of the Neue Klasse.', mfg: 'Adds a rotor winding + slip-ring/inductive exciter but removes magnet handling and magnetising; BMW reports −20% cost, −10% weight, −40% losses vs Gen5.', why: 'Eliminates the volatile heavy-rare-earth magnet bill entirely and de-risks supply — magnets are often a third of motor cost.', tr: 'Rotor excitation losses under sustained high load; slip-ring/exciter complexity.' },
      { t: 'Rare-earth-free permanent-magnet motor (ferrite / non-REE)', lev: 'Material', save: 'Heavy REE → ~0', bench: 'Tesla next-gen drive unit', v8: 'any', mat: 'Emerging', risk: 'High', new: 1, tech: 'A PM motor designed around ferrite / non-rare-earth material. Tesla announced a zero-rare-earth PM motor for its next-gen unit.', mfg: 'Ferrite is cheap and abundant but weaker, so flux-concentrating geometry and thinner segments compensate.', why: 'Removes the entire rare-earth cost and supply risk while keeping PM-class controllability.', tr: 'Lower remanence needs more magnet volume/clever geometry — a power-density vs cost trade.' },
      { t: 'Grain-boundary diffusion (GBD) of Dy/Tb', lev: 'Technology', save: '10-25% magnet', bench: 'Toyota, Hyundai, mainstream IPM', v8: 'any', mat: 'Proven', risk: 'Med', tech: 'Diffuse heavy rare earth only at grain boundaries to hold coercivity with 20-60% less Dy/Tb.', mfg: 'Supplier process step on sintered blanks; needs qualification.', why: 'Heavy rare earth is the costliest, most volatile input — cutting it drops magnet cost 10-25%.', tr: 'Supplier process qualification and dual-source.' },
      { t: 'Rotor oil-cooling to cut heavy rare earth + add ~20% density', lev: 'Design', save: 'Heavy REE ↓, +20% density', bench: 'Audi / Porsche PPE', v8: 'fav', mat: 'Proven', risk: 'Med', new: 1, tech: 'Cooling magnets directly via rotor oil keeps them below the demag knee, so the heavy-rare-earth additive can be cut while power density rises ~20% (PPE).', mfg: 'Adds rotor oil feed/shaft galleries; pairs with hairpin stator oil-spray.', why: 'Heavy rare earths are the priciest, most volatile magnet ingredient — running cooler lets you specify less.', tr: 'Rotor oil-feed sealing and churning losses to manage.' },
      { t: 'Spec-to-duty grade selection (stop over-specifying)', lev: 'Spec opt.', save: '5-15% magnet', bench: 'Universal lever', v8: 'any', mat: 'Proven', risk: 'Low', tech: 'Pick N42UH/N48SH matched to the real demag temperature seen with oil cooling, not a blanket worst case.', mfg: 'No process change.', why: 'Stops paying for coercivity/temperature headroom the duty never uses.', tr: 'Less thermal headroom — needs validated cooling.' },
    ],
    top3: [
      { t: 'EESM feasibility (rare-earth-free)', v: 'Architecture trade vs IPM at vehicle level; longest lead' },
      { t: 'GBD qualification', v: 'Heavy-RE reduction with coercivity hold, dual-source' },
      { t: 'Iron-nitride watch track', v: 'Sample test + qualification timing' },
    ],
  },
  {
    id: 'rotor-shaft',
    sub: 'Electric machine',
    name: 'Rotor & shaft',
    baseline: 'Solid gun-drilled shaft, continuous skew, surface-PM retention sleeve, two-plane balance.',
    fn: 'Transmit torque, locate the rotor stack/magnets, manage rotordynamics and cooling.',
    ideas: [
      { t: 'Hollow shaft via flow-forming or friction-welded halves', lev: 'Process', save: '15-25% shaft mass', bench: 'Tesla, BMW, oil-through-rotor designs', v8: 'fav', mat: 'Proven', risk: 'Med', tech: 'A hollow shaft cuts inertia and enables oil-through cooling that lets you raise current density and shrink magnet volume — valuable for high-speed 800V rotors.', mfg: 'Flow-forming or friction-welding replaces deep gun-drilling.', why: 'Less material and machining, plus the cooling enables downstream magnet/copper savings.', tr: 'Rotordynamics; forming/weld process control.' },
      { t: 'Raise speed + gear ratio to shrink active material', lev: 'Design', save: '10-20% active', bench: 'High-speed e-axles', v8: 'fav', mat: 'Proven', risk: 'Med', tech: '16-20k rpm reduces magnet/copper/steel for equal wheel torque; the SiC 800V inverter and high-frequency steel make this practical.', mfg: 'Higher-ratio gearset; tighter rotor balancing.', why: 'Cheapest path to magnet reduction — shrinks the most expensive materials together.', tr: 'Bearing life, rotor stress, gear NVH, churning loss.' },
      { t: 'IPM retention vs surface-PM sleeve (delete sleeve)', lev: 'Design', save: 'delete sleeve', bench: 'Most IPM traction motors', v8: 'any', mat: 'Proven', risk: 'Low', tech: 'Burying magnets in pockets avoids the costly CFRP/Inconel retention sleeve needed only for surface-PM above ~16-18k rpm.', mfg: 'Pocketed laminations vs sleeve fitting.', why: 'Deletes an expensive sleeve and its assembly.', tr: 'Bridge design and flux leakage to manage.' },
    ],
    top3: [
      { t: 'Hollow shaft + oil-through', v: 'Rotordynamic + cooling validation' },
      { t: 'Speed-up architecture', v: 'NVH/bearing/gear trade at higher rpm' },
      { t: 'Delete retention sleeve', v: 'Bridge stress + flux-leakage check' },
    ],
  },
  {
    id: 'motor-bearings',
    sub: 'Electric machine',
    name: 'Bearings & seals (motor)',
    baseline: 'Two deep-groove ball bearings, contact lip seals, conservative grade; standard steel races.',
    fn: 'Support the rotor, exclude contamination, contain oil, manage shaft currents over life.',
    ideas: [
      { t: 'Shaft-current mitigation: grounding ring vs hybrid-ceramic bearing', lev: 'Spec opt.', save: 'avoid premium bearing', bench: 'SiC-inverter EVs', v8: 'crit', mat: 'Proven', risk: 'Med', tech: 'Fast SiC switching at 800V raises common-mode dv/dt and bearing (EDM) currents; a low-cost grounding ring can protect the bearing instead of fitting full hybrid-ceramic bearings everywhere.', mfg: 'Add grounding ring/insulation vs sourcing ceramic-ball bearings.', why: 'Targets the SiC bearing-current problem at a fraction of the cost of hybrid-ceramic on both ends.', tr: 'Validate EDM-current protection over life; place ceramic only where essential.' },
      { t: 'Bearing size/grade right-size to load & speed', lev: 'Spec opt.', save: '5-12%', bench: 'Universal lever', v8: 'any', mat: 'Proven', risk: 'Low', tech: 'Match bore/precision class to actual radial/axial load and rpm rather than worst case.', mfg: 'Catalogue part change.', why: 'Removes over-specified precision/size.', tr: 'Re-validate life (L10) at duty.' },
      { t: 'Integrated / cassette seal & standardisation', lev: 'Standardization', save: 'part count', bench: 'Driveline practice', v8: 'any', mat: 'Proven', risk: 'Low', tech: 'Combine bearing + seal into one cassette and standardise across platform variants.', mfg: 'Single press-in operation; fewer SKUs.', why: 'Cuts piece price via volume and removes an assembly step.', tr: 'Serviceability of integrated unit.' },
    ],
    top3: [
      { t: 'Shaft-current strategy for SiC', v: 'EDM-current test; ring vs ceramic decision' },
      { t: 'Bearing right-size', v: 'L10 life recalculation' },
      { t: 'Seal standardisation', v: 'Leak/contamination validation' },
    ],
  },
  {
    id: 'motor-housing',
    sub: 'Electric machine',
    name: 'Motor housing',
    baseline: 'Gravity/standard HPDC aluminium, separate water jacket, machined cooling channels.',
    fn: 'Locate stator, carry cooling, provide stiffness/NVH and sealing.',
    ideas: [
      { t: 'Large-format HPDC / structural casting to consolidate the housing', lev: 'Process', save: 'Part count −30-50%, assembly ↓', bench: 'Tesla, NIO, Zeekr, XPeng (gigacasting)', v8: 'any', mat: 'Emerging', risk: 'High', new: 1, tech: 'High-pressure die-cast the motor/gear housing as one large structural part with integrated mounts, cooling jackets and brackets — the EDU analogue of body gigacasting.', mfg: 'A large-tonnage HPDC cell deletes welds, fasteners, fixtures and their quality checks.', why: 'Consolidating dozens of parts into one removes joints, sealing faces, fasteners and assembly labour.', tr: 'Big-press capex, alloy/casting expertise, and repairability/scrap risk.' },
      { t: 'HPDC AlSi10MnMg (Silafont-36) + topology ribs', lev: 'Material', save: '5-12% Al', bench: 'VW MEB, GM Ultium, Tesla', v8: 'any', mat: 'Proven', risk: 'Low', tech: 'Self-hardening HPDC alloy with rib/wall topology optimisation removes mass while keeping stiffness.', mfg: 'Standard HPDC; vacuum-assist if weld/heat-treat needed.', why: 'Cuts aluminium mass 5-12% on the heaviest motor part.', tr: 'Die complexity.' },
      { t: 'Integrate cooling jacket as cast-in channels', lev: 'Consolidation', save: 'part + leak points', bench: 'Most modern EDUs', v8: 'fav', mat: 'Proven', risk: 'Med', tech: 'Cast coolant galleries into the housing instead of a separate jacket; pairs with single-fluid concepts.', mfg: 'Sand/lost-core or machined-then-plugged galleries.', why: 'Deletes a part, seals and assembly; fewer leak points.', tr: 'Casting/coring complexity, pressure test.' },
    ],
    top3: [
      { t: 'Cast-in cooling', v: 'Coring + pressure-test validation' },
      { t: 'Topology + alloy', v: 'Stiffness/NVH and mass study' },
      { t: 'FSW joining', v: 'Joint strength + leak validation' },
    ],
  },
  {
    id: 'power-module',
    sub: 'Inverter / power electronics',
    name: 'Power module',
    baseline: 'Discrete Si-IGBT module, Al2O3 DBC substrate, Al wire bonds, single-sided cooling, worst-case die sizing.',
    fn: 'Switch traction current at required voltage/frequency within thermal-cycle life.',
    ideas: [
      { t: 'Proprietary multi-chip SiC module (~75% less SiC die)', lev: 'Technology', save: 'SiC die −60-75%', bench: 'Tesla next-gen drive unit', v8: 'fav', mat: 'Emerging', risk: 'High', new: 1, tech: 'A custom multi-die module with a new thermal stack pulls roughly twice the heat out of each chip, so the same current rating is met with far less SiC area.', mfg: 'Tesla-proprietary module package; die bought from multiple foundries and packaged in-house.', why: 'SiC is expensive and hard to scale; cutting die area 60-75% is the biggest single inverter cost lever.', tr: 'Heavy packaging/thermal R&D and qualification; saving is only realised with the matched cooling design.' },
      { t: 'One inverter platform with selectable Si-or-SiC power stage', lev: 'Standardization', save: 'Right-cost per trim', bench: 'Stellantis STLA EDM', v8: 'fav', mat: 'Proven', risk: 'Med', new: 1, tech: 'A single inverter design — common microprocessor, 350-750 A, 400/800 V, up to 350 kW — accepts either silicon or silicon-carbide devices, so SiC is only paid for where the duty needs it.', mfg: 'Common board, housing and control software across the whole range; only the power device populates differently.', why: 'Avoids over-specifying SiC on cost trims while amortising one design across millions of units.', tr: 'The power stage must suit both device types, slightly compromising a point-optimised board.' },
      { t: 'Bring the SiC power module in-house', lev: 'Sourcing', save: 'Inverter −10-20%', bench: 'Li Auto, NIO 1200V, BYD', v8: 'fav', mat: 'Emerging', risk: 'High', new: 1, tech: 'Own the costliest part: Li Auto fabs its SiC chip (Suzhou) and packs its own module; NIO runs an in-house 1200V module at 1315 kW/L; BYD makes its own SiC inside the 8-in-1 box.', mfg: 'Captive semiconductor + module lines feed the e-drive plant — a vertical closed loop from die to vehicle.', why: 'Removes supplier margin-stacking on the highest-value component and de-risks SiC supply.', tr: 'Very high capital and semiconductor capability — only justified at high volume.' },
      { t: 'SiC MOSFET module for 800V (1200V class)', lev: 'Technology', save: 'system 8-18%', bench: 'Tesla, BYD, Hyundai E-GMP, Porsche Taycan', v8: 'crit', mat: 'Proven', risk: 'Med', tech: '1200V SiC MOSFETs are the enabler for 800V traction, giving ~5-8% efficiency over Si and higher switching frequency that shrinks the magnetics, DC-link cap and cooler.', mfg: 'SiC die on upgraded substrate; tighter gate-drive layout.', why: 'The efficiency gain downsizes the battery and the faster switching shrinks expensive passives — a system cost-down even though SiC die cost more.', tr: 'SiC die price; EMC/gate-drive and motor-insulation stress from fast edges.' },
      { t: 'Die-area sizing to real duty cycle', lev: 'Spec opt.', save: '5-15% semi', bench: 'Universal lever', v8: 'fav', mat: 'Proven', risk: 'Med', tech: 'Size SiC die to actual RMS/peak from the drive cycle, not worst case.', mfg: 'Fewer/smaller die per module.', why: 'Semiconductor is the dominant inverter cost; right-sizing the most expensive part pays directly.', tr: 'Tighter thermal margin — needs validated cooling.' },
    ],
    top3: [
      { t: 'SiC vs hybrid system trade', v: 'Cost the system (cap+cooler+harness), not the die' },
      { t: 'Die-area right-size', v: 'Drive-cycle thermal validation' },
      { t: 'DSC packaging', v: 'kW/L + reliability bench vs incumbent' },
    ],
  },
  {
    id: 'gate-driver',
    sub: 'Inverter / power electronics',
    name: 'Gate driver & control',
    baseline: 'Discrete gate drivers + separate digital isolators, multi-layer PCB, discrete current sensors, redundant NTCs.',
    fn: 'Drive switches safely/isolated, sense current/voltage/temperature, run motor control.',
    ideas: [
      { t: 'Single isolated gate-driver ASIC/SoC', lev: 'Consolidation', save: 'PCBA', bench: 'Modern traction inverters', v8: 'any', mat: 'Proven', risk: 'Low', tech: 'One integrated isolated driver replaces discrete drivers + isolators with protection built in.', mfg: 'Fewer placements, smaller board.', why: 'Cuts part count and board area directly.', tr: 'Single-source dependency.' },
      { t: 'PCB layer-count + one board across power classes', lev: 'Standardization', save: 'PCBA', bench: 'Platform inverters', v8: 'any', mat: 'Proven', risk: 'Low', tech: 'Standard FR-4, fewer layers where EMC/thermal allow; one gate-drive board family across power ratings.', mfg: 'Common PCBA panel; volume pricing.', why: 'Standardisation + fewer layers cut board cost and SKUs.', tr: 'EMC/thermal validation per class.' },
      { t: 'Integrated / coreless current sensing', lev: 'Consolidation', save: 'delete sensors', bench: 'On-module shunt/Hall designs', v8: 'any', mat: 'Proven', risk: 'Med', tech: 'Shunt or Hall integrated on the module replaces discrete current sensors.', mfg: 'One fewer sub-assembly to place and wire.', why: 'Deletes discrete sensor cost and harness.', tr: 'Calibration/accuracy validation.' },
    ],
    top3: [
      { t: 'Integrated gate-driver SoC', v: 'Protection coverage + EMC validation' },
      { t: 'Common board family', v: 'Cross-class EMC/thermal sign-off' },
      { t: 'On-module sensing', v: 'Accuracy/calibration validation' },
    ],
  },
  {
    id: 'dc-link-cap',
    sub: 'Inverter / power electronics',
    name: 'DC-link capacitor',
    baseline: 'Oversized metallised-PP film capacitor sized for Si-IGBT ripple, separate busbar interface.',
    fn: 'Stabilise DC-bus voltage, absorb ripple current, present low loop inductance.',
    ideas: [
      { t: 'Downsize via SiC ripple reduction', lev: 'Technology', save: '20-40% cap', bench: 'SiC 800V inverters', v8: 'crit', mat: 'Proven', risk: 'Med', tech: 'Higher SiC switching frequency cuts required capacitance for the same ripple, shrinking the film volume 20-40%.', mfg: 'Smaller can; less film wound.', why: 'The film cap is a top-3 inverter cost; SiC lets you buy less of it.', tr: 'Ripple/thermal re-validation at the new switching scheme.' },
      { t: 'Integrate cap + busbar into the power stack', lev: 'Consolidation', save: 'interconnect', bench: 'Integrated power stacks', v8: 'fav', mat: 'Proven', risk: 'Med', tech: 'Merge the cap and laminated busbar into the module stack to delete interconnects and shrink the commutation loop.', mfg: 'Co-assembled stack vs separate cap + bolted bus.', why: 'Removes connection hardware and assembly, and the tighter loop allows smaller devices.', tr: 'Thermomechanical co-design.' },
    ],
    top3: [
      { t: 'SiC-enabled downsizing', v: 'Ripple/thermal validation' },
      { t: 'Film optimisation', v: 'Self-healing/derating sign-off' },
      { t: 'Cap+busbar integration', v: 'Loop-inductance + thermal validation' },
    ],
  },
  {
    id: 'busbar',
    sub: 'Inverter / power electronics',
    name: 'Busbar / interconnect',
    baseline: 'Solid copper busbars, bolted joints, separate HV connectors.',
    fn: 'Carry phase/DC current at low resistance and inductance, interface motor/cap/module.',
    ideas: [
      { t: 'Aluminium busbar with Cu-clad terminals', lev: 'Material', save: 'conductor $/kg', bench: 'Cost-down inverters', v8: 'fav', mat: 'Proven', risk: 'Med', tech: 'Al body with Cu-clad contact zones; 800V halves current so a thinner/Al bus carries it with acceptable loss.', mfg: 'Stamp/form Al + clad/weld Cu pads.', why: 'Aluminium is far cheaper per kg than copper for the same current at 800V.', tr: 'Bi-metal joint reliability; section sizing.' },
      { t: 'Laser/ultrasonic-welded terminations vs crimp+bolt', lev: 'Joining', save: 'joints + resistance', bench: 'Modern inverters', v8: 'any', mat: 'Proven', risk: 'Low', tech: 'Welded terminations replace bolted lugs, cutting joint count and contact resistance.', mfg: 'Weld cell vs torque + inspection.', why: 'Fewer joints = less labour, lower loss and higher reliability.', tr: 'Weld-quality control.' },
      { t: 'Direct hairpin-terminal → busbar weld', lev: 'Consolidation', save: 'interface', bench: 'Integrated stators', v8: 'fav', mat: 'Proven', risk: 'Med', tech: 'Weld the stator hairpin terminals straight to the busbar, deleting a connector interface.', mfg: 'Combined weld station.', why: 'Removes a connection interface and its parts.', tr: 'Access/repair and weld validation.' },
    ],
    top3: [
      { t: 'Al busbar', v: 'Bi-metal joint + thermal validation' },
      { t: 'Welded terminations', v: 'Resistance/quality validation' },
      { t: 'Direct hairpin weld', v: 'Access + weld sign-off' },
    ],
  },
  {
    id: 'inverter-cooling',
    sub: 'Inverter / power electronics',
    name: 'Inverter cold plate / thermal',
    baseline: 'Deep-machined channel cold plate, separate from module, AlSiC where CTE-matched.',
    fn: 'Remove switching/conduction heat within junction-temperature limits.',
    ideas: [
      { t: 'FSW or brazed pin-fin cold plate (Al 3003/6061)', lev: 'Process', save: 'plate cost', bench: 'Mainstream inverters', v8: 'any', mat: 'Proven', risk: 'Low', tech: 'Pin-fin plate joined by FSW/braze replaces deep-machined channels.', mfg: 'FSW/braze vs heavy machining.', why: 'Less machining time and scrap.', tr: 'Joint leak validation.' },
      { t: 'Direct-cooled pin-fin baseplate (delete separate cold plate)', lev: 'Consolidation', save: 'delete part', bench: 'Integrated power modules', v8: 'fav', mat: 'Proven', risk: 'Med', tech: 'Integrate pin-fins onto the module baseplate so coolant hits it directly — pairs with DSC SiC.', mfg: 'Module with integral fins; sealed coolant interface.', why: 'Deletes the cold plate and a thermal interface, and SiC\'s lower loss means less cooler needed.', tr: 'Sealing and serviceability.' },
      { t: 'Avoid AlSiC unless CTE-matching truly required', lev: 'Material', save: 'material', bench: 'Cost-down practice', v8: 'any', mat: 'Proven', risk: 'Low', tech: 'Use standard Al where the substrate/attach can tolerate the CTE mismatch.', mfg: 'Standard casting/machining.', why: 'AlSiC is cost-prohibitive; use it only where it is genuinely needed.', tr: 'Thermal-cycle validation.' },
    ],
    top3: [
      { t: 'Direct-cooled baseplate', v: 'Seal + thermal validation with DSC' },
      { t: 'FSW pin-fin plate', v: 'Leak/throughput test' },
      { t: 'Drop AlSiC', v: 'Thermal-cycle confirmation' },
    ],
  },
  {
    id: 'gears',
    sub: 'Gearbox',
    name: 'Gear train',
    baseline: 'Bar-turned blanks, atmosphere carburize + free quench, full grind finish, premium Ni alloy.',
    fn: 'Reduce motor speed / multiply torque quietly within fatigue and NVH limits.',
    ideas: [
      { t: 'Lower the reduction ratio (e.g. ~13:1 → 9.8:1) to cut friction', lev: 'Spec opt.', save: 'Gear loss ↓', bench: 'VW APP550', v8: 'any', mat: 'Proven', risk: 'Low', new: 1, tech: 'APP550 dropped the ratio from ~13:1 to 9.8:1, reducing meshing/churning friction while a higher-torque motor restores wheel torque.', mfg: 'A ratio/spec change within the existing two-stage layout.', why: 'Less reduction means lower gear losses and can simplify the gear set.', tr: 'Needs the motor to supply higher torque and an NVH retune.' },
      { t: 'Low-pressure carburizing + press quench → skip grinding', lev: 'Process', save: '30-60% hard-finish', bench: 'Best-in-class HT', v8: 'any', mat: 'Proven', risk: 'Med', tech: 'LPC with press quench cuts distortion so hard-finishing stock drops 30-60% and grinding can sometimes be eliminated in favour of honing.', mfg: 'LPC line + press-quench fixturing; hone instead of grind.', why: 'Heat-treat + finishing is the gearbox\'s dominant cost; less distortion removes the most expensive operation.', tr: 'Press-quench fixturing and process control.' },
      { t: 'Near-net / precision-forged blanks', lev: 'Process', save: '10-20% soft-machining', bench: 'High-volume driveline', v8: 'any', mat: 'Proven', risk: 'Med', tech: 'Forge the gear blank close to shape to lift material yield and cut soft-machining.', mfg: 'Forging dies + reduced turning; cycle time −30-50%.', why: 'Less stock to remove and higher yield.', tr: 'Forging die cost, MOQ.' },
      { t: 'Isotropic superfinish on high-duty flanks', lev: 'Process', save: 'efficiency → oil/cooling', bench: 'Premium/efficiency-led EVs', v8: 'fav', mat: 'Proven', risk: 'Low', tech: 'REM/chemical-mechanical superfinish lowers friction, enabling lower-viscosity oil and less cooling.', mfg: 'Added superfinish step.', why: 'Pays back through efficiency, lower oil viscosity and reduced cooling.', tr: 'Added operation cost.' },
    ],
    top3: [
      { t: 'LPC + press-quench → hone', v: 'Distortion + grind-elimination trial' },
      { t: 'Precision-forged blanks', v: 'Yield + soft-machining study' },
      { t: 'Superfinish', v: 'Efficiency / oil-viscosity validation' },
    ],
  },
  {
    id: 'gearbox-housing',
    sub: 'Gearbox',
    name: 'Gearbox / transmission housing',
    baseline: 'HPDC aluminium case, machined oil galleries, tight tolerances throughout, bolted covers.',
    fn: 'Locate shafts/bearings, contain oil, provide stiffness/NVH and sealing.',
    ideas: [
      { t: 'Cast-in oil galleries & sensor bosses', lev: 'Consolidation', save: 'drilling/plugging', bench: 'Modern gear housings', v8: 'any', mat: 'Proven', risk: 'Med', tech: 'Cast galleries/bosses instead of drilling and plugging.', mfg: 'Cores vs drilled-and-plugged passages.', why: 'Deletes drilling, plugs and leak paths.', tr: 'Coring complexity, pressure test.' },
      { t: 'Tolerance right-size (IT6/IT7 only on bearing seats)', lev: 'Spec opt.', save: 'machining', bench: 'Universal lever', v8: 'any', mat: 'Proven', risk: 'Low', tech: 'Hold tight tolerance and fine finish only on dynamic seal/bearing surfaces; relax hidden faces to as-cast/IT9.', mfg: 'Fewer fine-machining passes.', why: 'Machining cost tracks tolerance — relaxing non-critical faces removes passes.', tr: 'GD&T discipline.' },
      { t: 'Magnesium covers (AZ91D / AM60B) where non-pressure', lev: 'Material', save: '30% cover mass', bench: 'Premium covers', v8: 'any', mat: 'Proven', risk: 'Med', tech: 'Mg covers cut ~30% mass vs Al on non-pressure, non-EMI covers.', mfg: 'Mg die-casting/thixomolding.', why: 'Lighter covers reduce material and vehicle mass.', tr: 'Cost premium + galvanic isolation.' },
    ],
    top3: [
      { t: 'Cast-in galleries', v: 'Coring + pressure validation' },
      { t: 'Tolerance right-size', v: 'GD&T review vs function' },
      { t: 'Fastener standard', v: 'Joint + sealing sign-off' },
    ],
  },
  {
    id: 'park-lock',
    sub: 'Gearbox',
    name: 'Park lock mechanism',
    baseline: 'Dedicated park pawl, ratchet wheel, actuator and linkage inside the gearbox.',
    fn: 'Hold the vehicle stationary when parked.',
    ideas: [
      { t: 'Delete park-lock via brake-based park (EPB)', lev: 'Consolidation', save: 'delete sub-assembly', bench: 'Munro-cited lean designs', v8: 'any', mat: 'Emerging', risk: 'High', tech: 'Use the electric park brake to hold the vehicle, removing the mechanical pawl system where the safety case closes.', mfg: 'Deletes pawl, ratchet, actuator and linkage assembly.', why: 'Removes an entire sub-assembly\'s parts and assembly time.', tr: 'Functional-safety/homologation case must close (grade hold, redundancy).' },
      { t: 'Simplify pawl + integrate actuator', lev: 'Design', save: 'part count', bench: 'Compact e-axles', v8: 'any', mat: 'Proven', risk: 'Low', tech: 'Reduce pawl/linkage parts and integrate the actuator into the housing where full delete isn\'t approved.', mfg: 'Fewer parts, simpler assembly.', why: 'Cuts piece count and assembly steps.', tr: 'Packaging.' },
    ],
    top3: [
      { t: 'Brake-based park study', v: 'Functional-safety + homologation assessment' },
      { t: 'Pawl simplification', v: 'Hold/re-engagement validation' },
    ],
  },
  {
    id: 'differential',
    sub: 'Differential',
    name: 'Differential & output shafts',
    baseline: 'Forged-steel bevel/side gears, forged diff case, machined splines, gun-drilled half-shafts.',
    fn: 'Split torque to wheels, allow speed difference, transmit to half-shafts/CV joints.',
    ideas: [
      { t: 'Net-shape forged / PM bevel & side gears', lev: 'Process', save: '15-30% machining', bench: 'Driveline practice', v8: 'any', mat: 'Proven', risk: 'Med', tech: 'Net-shape forge or PM/MIM the bevel and side gears.', mfg: 'Near-net forming, minimal machining.', why: 'Removes most machining on these gears.', tr: 'Fatigue/densification for loaded gears.' },
      { t: 'Welded ring gear to diff case (delete bolts)', lev: 'Joining', save: 'fasteners', bench: 'Modern final drives', v8: 'any', mat: 'Proven', risk: 'Med', tech: 'Laser-weld the ring gear to the case instead of a bolted flange.', mfg: 'Weld vs drilled/bolted flange.', why: 'Removes the bolt circle and machining.', tr: 'Weld distortion/runout control.' },
      { t: 'Delete differential via dual-motor torque vectoring', lev: 'Design', save: 'delete diff', bench: 'Performance dual-motor EVs', v8: 'any', mat: 'Proven', risk: 'High', tech: 'Two drive units vector torque electronically, removing the mechanical diff.', mfg: 'Deletes diff assembly (only economic where a 2nd EDU already exists).', why: 'Removes the whole differential where the architecture already carries two motors.', tr: 'Only economic with an existing 2nd drive unit.' },
      { t: 'Hollow half-shafts + rolled splines', lev: 'Process', save: 'mass + machining', bench: 'Driveline best practice', v8: 'any', mat: 'Proven', risk: 'Low', tech: 'Hollow shafts cut mass; spline rolling replaces cutting.', mfg: 'Tube + roll-form vs solid + cut.', why: 'Less material and faster spline forming.', tr: 'Torsional/rotordynamic validation.' },
    ],
    top3: [
      { t: 'Net-shape diff gears', v: 'Fatigue/densification validation' },
      { t: 'Cast diff case', v: 'Load-capability sign-off' },
      { t: 'Welded ring gear', v: 'Runout/distortion validation' },
    ],
  },
  {
    id: 'thermal-cooling',
    sub: 'Thermal & lubrication',
    name: 'Thermal management / cooling circuit',
    baseline: 'Separate water-glycol jacket for motor+inverter plus an oil circuit for gears; two pumps, external oil cooler.',
    fn: 'Keep magnets, windings, dies and gears within temperature at all duty points.',
    ideas: [
      { t: 'Delete the electric oil pump — passive gear-driven splash + coolant-coupled oil', lev: 'Design', save: 'Pump + parasitic load', bench: 'VW APP550', v8: 'any', mat: 'Proven', risk: 'Med', new: 1, tech: 'APP550 dispenses with the electrically-driven oil pump: the gearwheels sling oil for lubrication/cooling and a stator heat-sink ties the oil to the coolant circuit.', mfg: 'Removes a pump, its motor, driver and wiring from the BOM and the line.', why: 'Deletes a bought component and its parasitic electrical load, improving both cost and efficiency.', tr: 'Passive flow must be validated across speed/temperature; cold-start oil distribution needs care.' },
      { t: 'Single-fluid (oil) cooling + lubrication', lev: 'Consolidation', save: '20-35% subsystem', bench: 'Ford F-150 Lightning, modern e-axles', v8: 'fav', mat: 'Proven', risk: 'Med', tech: 'One low-viscosity ATF both spray/through-cools the motor and lubricates the gears, deleting the water jacket and second circuit.', mfg: 'Delete jacket, second pump and seals; one fluid fill.', why: 'Removes a whole circuit, its seals and leak points — 20-35% of the thermal subsystem.', tr: 'Fluid must be dielectric and EP-additive capable — a spec compromise.' },
      { t: 'Direct rotor / end-turn oil cooling', lev: 'Technology', save: 'smaller magnet/copper', bench: 'Tesla, premium e-axles', v8: 'fav', mat: 'Proven', risk: 'Med', tech: 'Hollow-shaft + spray bars on the hairpins let you raise current density and shrink magnet/copper.', mfg: 'Spray manifold + hollow shaft.', why: 'Better cooling unlocks downstream active-material savings.', tr: 'Sealing and oil-churning loss.' },
    ],
    top3: [
      { t: 'Single-fluid cooling', v: 'Dielectric fluid + seal validation' },
      { t: 'Housing heat-exchanger', v: 'Thermal duty-cycle confirmation' },
      { t: 'Direct rotor oil cooling', v: 'Sealing + churning-loss test' },
    ],
  },
  {
    id: 'lubrication',
    sub: 'Thermal & lubrication',
    name: 'Lubrication system',
    baseline: 'Generous oil fill, mechanical pump, separate filter and cooler, two-plane sump.',
    fn: 'Lubricate gears/bearings, carry heat, stay clean over life.',
    ideas: [
      { t: 'Lifetime fill at reduced volume + baffled sump', lev: 'Design', save: 'oil + churning', bench: 'Efficiency-led EVs', v8: 'any', mat: 'Proven', risk: 'Low', tech: 'Optimised oil level and baffling reduce fill volume and churning loss.', mfg: 'Sump baffle design; no service fill.', why: 'Less oil cost and lower drag loss.', tr: 'Cold-start lubrication validation.' },
      { t: 'Low-viscosity ATF enabled by superfinished gears', lev: 'Spec opt.', save: 'efficiency', bench: 'Premium driveline', v8: 'fav', mat: 'Proven', risk: 'Low', tech: 'Superfinished flanks allow a thinner oil, cutting drag and cooling demand.', mfg: 'Fluid spec change.', why: 'Efficiency gain compounds with 800V range/cost targets.', tr: 'Film-strength validation at load.' },
    ],
    top3: [
      { t: 'Reduced lifetime fill', v: 'Cold-start lubrication test' },
      { t: 'Low-viscosity oil', v: 'Film-strength validation' },
      { t: 'Pump right-size', v: 'Flow validation across temperature' },
    ],
  },
  {
    id: 'hv-interface',
    sub: 'Electrical & sensors',
    name: 'HV interface & harness',
    baseline: 'External HV cables + connectors between inverter and motor, copper harness sized for 400V current.',
    fn: 'Carry HV power between subsystems, isolate, seal and allow assembly/service.',
    ideas: [
      { t: 'Inverter-into-EDU integration (delete external HV cables/connectors)', lev: 'Consolidation', save: 'interconnect', bench: 'Hyundai E-GMP, Tesla, BYD 8-in-1', v8: 'crit', mat: 'Proven', risk: 'Med', tech: 'Mount the inverter on the EDU and replace external HV cables and two HV connectors with an internal stamped/laminated busbar.', mfg: 'Delete cable assembly + connector pair; add internal bus.', why: 'Removes the most expensive HV connectors and cable, plus assembly labour.', tr: 'Serviceability; thermal/EMC co-design.' },
      { t: 'Thinner harness from 800V (current halved)', lev: 'Design', save: 'copper', bench: 'All 800V platforms, Tesla 48V LV', v8: 'crit', mat: 'Proven', risk: 'Low', tech: 'At 800V the current for a given power is roughly halved, so HV conductor cross-section and cooling shrink; pairing with a 48V low-voltage net further cuts LV copper.', mfg: 'Smaller gauge cable/bus.', why: 'Less copper mass in HV and LV wiring directly.', tr: 'Insulation/creepage for higher voltage.' },
      { t: 'Smart 4th-lead inverter for 400/800V charging (delete boost converter)', lev: 'Design', save: 'delete converter', bench: 'Hyundai/Kia E-GMP', v8: 'crit', mat: 'Proven', risk: 'Med', tech: 'Use the motor windings + inverter as a boost stage so an 800V car charges on 400V infrastructure without a dedicated HV boost converter.', mfg: 'Adds a power lead/control vs a bulky converter module with its own cooling/cabling.', why: 'Deletes an expensive standalone boost converter and its thermal/harness overhead.', tr: 'Control complexity; NVH during charge.' },
    ],
    top3: [
      { t: 'Inverter integration', v: 'Serviceability + EMC/thermal sign-off' },
      { t: '800V harness right-size', v: 'Creepage/insulation validation' },
      { t: '4th-lead charging', v: 'Boost-control + NVH validation' },
    ],
  },
  {
    id: 'position-sensor',
    sub: 'Electrical & sensors',
    name: 'Position & current sensors',
    baseline: 'Wound resolver for rotor position, discrete current sensors, multiple NTCs.',
    fn: 'Provide rotor angle and current/temperature feedback for safe, efficient control.',
    ideas: [
      { t: 'Resolver → inductive (eddy-current) / TMR-GMR sensor', lev: 'Technology', save: '20-40% sensor', bench: 'Modern e-axles, Rivian (compact)', v8: 'any', mat: 'Proven', risk: 'Med', tech: 'Inductive or magneto-resistive position sensors replace the wound resolver — lighter, cheaper, no fine windings.', mfg: 'PCB-based sensor vs wound resolver.', why: 'Cuts sensor cost 20-40% and simplifies assembly.', tr: 'EMC and accuracy validation at speed.' },
      { t: 'Sensorless at mid/high speed (start-up sensor only)', lev: 'Design', save: 'delete sensor', bench: 'Software-rich drives', v8: 'any', mat: 'Emerging', risk: 'High', tech: 'Estimate position from motor states above a threshold, keeping a low-cost sensor only for start-up.', mfg: 'Deletes sensor + harness + connector.', why: 'Removes a sensor, its wiring and a connector.', tr: 'Low-speed/standstill robustness; functional safety.' },
      { t: 'Model-based thermal estimation to delete redundant NTCs', lev: 'Design', save: 'sensor cost', bench: 'Software-rich inverters', v8: 'any', mat: 'Emerging', risk: 'Med', tech: 'Software temperature models remove redundant NTC hardware.', mfg: 'No hardware to place.', why: 'Software replaces recurring sensor cost.', tr: 'Functional-safety validation.' },
    ],
    top3: [
      { t: 'Inductive position sensor', v: 'EMC/accuracy validation' },
      { t: 'Sensorless strategy', v: 'Standstill robustness + safety case' },
      { t: 'Delete redundant NTCs', v: 'Thermal-model safety sign-off' },
    ],
  },
  {
    id: 'integration',
    sub: 'Integration',
    name: 'EDU integration / architecture',
    baseline: 'Discrete motor + gearbox + separately-mounted inverter with their own housings, fasteners and cooling.',
    fn: 'Deliver the complete drive function at lowest system part-count, mass and assembly time.',
    ideas: [
      { t: '8-in-1 e-axle: motor+gear+inverter+OBC+DC-DC+BMS+VCU+MCU in one box', lev: 'Consolidation', save: 'Part count / assembly ↓↓', bench: 'BYD e-Platform 3.0 (Seal)', v8: 'any', mat: 'Proven', risk: 'High', new: 1, tech: "BYD's world-first mass-produced 8-in-1 box shares one housing, coolant circuit, busbars and connectors across eight functions, for ~89% system efficiency.", mfg: 'One assembly line, one housing casting and far fewer external HV cables/connectors.', why: 'Every function folded in deletes a housing, a connector set and a wiring run, plus assembly stations.', tr: 'Thermal/EMC packaging is hard and serviceability/vertical-integration demands are high.' },
      { t: 'Scalable-length motor family on one shared inverter platform', lev: 'Standardization', save: 'Tooling amortised, piece price ↓', bench: 'Mercedes eATS 2.0, Audi PPE, XPeng SEPA2.0', v8: 'fav', mat: 'Proven', risk: 'Low', new: 1, tech: 'One motor cross-section is stretched or shortened by active length to cover a power range; XPeng SEPA2.0 carries 80% of components across models.', mfg: 'Shared laminations, tooling, winding and inverter across variants — they differ only by stack length.', why: 'Maximises volume on common tooling and parts and cuts per-variant NRE.', tr: 'A scalable design is slightly heavier/larger than a point design at each power point.' },
      { t: '3-in-1 → 8-in-1 high integration', lev: 'Consolidation', save: 'part count −30-50%', bench: 'BYD 8-in-1 (Seal), Tesla, Geely', v8: 'fav', mat: 'Proven', risk: 'High', tech: 'Collapse motor + gear + inverter mount + cooling galleries into 1-3 castings with shared housing.', mfg: 'Fewer housings, fasteners (−25-40%) and assembly steps (−15-25%).', why: 'Each deleted housing/connector/fastener removes parts, sealing and station time across the whole unit.', tr: 'Thermal coupling and serviceability; tooling investment.' },
      { t: 'Shared front/rear EDU base parts (scalable family)', lev: 'Standardization', save: 'tooling + piece price', bench: 'Ford F-150 Lightning (shared front/rear)', v8: 'any', mat: 'Proven', risk: 'Med', tech: 'Use the same motor + inverter base across front and rear (and across power classes) and scale by stack length.', mfg: 'One tool set across variants; volume pricing.', why: 'Amortises tooling and lifts volume on common parts.', tr: 'Some over-design on the lower-power axle.' },
      { t: '48V low-voltage net to cut LV copper', lev: 'Design', save: 'LV copper', bench: 'Tesla Cybertruck', v8: 'fav', mat: 'Emerging', risk: 'Med', tech: 'Moving the low-voltage net from 12V to 48V shrinks LV wiring diameter, mass and cost; complements the 800V HV side.', mfg: 'Smaller-gauge LV harness.', why: 'Reduces copper in the low-voltage harness.', tr: '48V component ecosystem maturity.' },
    ],
    top3: [
      { t: 'High integration (n-in-1)', v: 'Part-count/assembly delta + thermal/service trade' },
      { t: 'Scalable EDU family', v: 'Cross-axle/power reuse study' },
      { t: 'Inverter re-use', v: 'Mode/safety validation' },
    ],
  },
  {
    id: 'axial-flux-motor',
    sub: 'Electric machine',
    name: 'Axial-Flux Motor Integration',
    baseline: 'Radial-flux PMSM as the default architecture; axial-flux being introduced in premium/sport applications.',
    fn: 'Deliver high power density with reduced active-material mass by exploiting axial-flux topology.',
    ideas: [
      { t: 'YASA axial-flux motor: 50% active-material mass saving vs radial-flux equivalent', lev: 'Technology', save: '50% motor mass, £38-77/kW saving', bench: 'Mercedes AMG SL 53 (YASA), Ferrari SF90 Stradale, Stellantis (YASA acquisition 2021)', v8: 'fav', mat: 'Emerging', risk: 'High', new: 1, tech: 'Axial-flux topology eliminates the bulky radial stator back-iron; YASA Yokeless And Segmented Armature topology achieves 10+ kW/kg. Mercedes AMG SL 53 uses a YASA axial-flux motor as the 48V integrated unit (P2 hybrid). Ferrari SF90 uses three YASA motors for hybrid drive. Shorter axial length enables tight packaging in tandem with a radial motor for AWD axle.', mfg: 'Axial-flux PCB-stator or hairpin stator manufacturing differs substantially from radial — new tooling investment required; YASA produced in Berlin from 2026.', why: 'Halves active copper, iron and magnet mass for equal peak torque at matched speed; critical for unsprung weight targets in in-wheel or hub-close configurations.', tr: 'Thermal management of both disc stators; manufacturing scale-up and supplier base limited to 2025; high tooling NRE.' },
      { t: 'Magnax axial-flux (no rotor back-iron): 15 kW/kg — eliminate rotor iron', lev: 'Technology', save: 'Rotor iron eliminated, magnet ↓ 30%', bench: 'Magnax MX-45 (Belgium) — 225 kW, 15 kW/kg at 15k rpm; adopted by aerospace/industrial', v8: 'fav', mat: 'Emerging', risk: 'High', new: 1, tech: 'Magnax topology uses Halbach-array magnets that focus flux through the coil, eliminating the rotor back-iron disc entirely. Result: 15 kW/kg — vs 4-5 kW/kg for typical radial-flux and 10 kW/kg for YASA. Reduces magnet use by ~30% due to Halbach concentration.', mfg: 'Halbach magnet array assembly requires high precision; no mass-automotive deployment yet but automotive RFQ stage.', why: 'Eliminating rotor iron (40-50% of rotor mass) and concentrating flux reduces magnet content while raising power density to aerospace-class.', tr: 'Mass-production maturity; rotor structural integrity at high rpm; no automotive volume reference yet.' },
      { t: 'Axial-flux PCB stator (Printed Motor Works / YASA thin): delete windings with PCB copper traces', lev: 'Technology', save: 'Winding cost −40%, zero weld', bench: 'Printed Motor Works (UK, Valeo partnership), Saietta (Agility), light-duty applications', v8: 'any', mat: 'Emerging', risk: 'High', new: 1, tech: 'PCB stator uses etched copper spiral traces instead of wound copper wire — eliminates winding labour, insulation, and end-turns. Enables frequencies up to 100 kHz. Power density limited vs YASA hairpin but suitable for lower-power auxiliary/climate applications and light-duty EV drive.', mfg: 'PCB manufacturing scales with existing electronics factory capacity — no winding tooling needed; Valeo partnered Printed Motor Works for automotive volume.', why: 'Complete elimination of copper winding labour and insulation process; enables automated PCB production of motor stators.', tr: 'Thermal limits of PCB copper traces; max power density lower than wound axial-flux; qualification timeline.' },
    ],
    top3: [
      { t: 'YASA axial-flux integration', v: 'Thermal management and tooling NRE study vs radial-flux baseline' },
      { t: 'Magnax Halbach-array topology', v: 'Rotor structural validation at target rpm; supplier RFQ' },
      { t: 'PCB stator for auxiliary/light-duty', v: 'Thermal derating validation; Valeo/PMW qualification timeline' },
    ],
  },
  {
    id: 'eesm-wound-rotor',
    sub: 'Electric machine',
    name: 'EESM — Electrically Excited Synchronous Motor (Wound Rotor)',
    baseline: 'Rare-earth NdFeB IPM as market standard; EESM offered as zero-magnet alternative.',
    fn: 'Provide rotor excitation via DC winding instead of permanent magnets, eliminating rare-earth content.',
    ideas: [
      { t: 'EESM wound-rotor: eliminate all rare-earth magnets', lev: 'Technology', save: 'Magnet cost eliminated (£6.8-21/kW NdFeB)', bench: 'BMW i4 Gen5 EESM (2024), Renault Megane E-Tech, ZF EVSys320 EESM, Nissan Ariya (front EESM)', v8: 'fav', mat: 'Emerging', risk: 'Med', new: 1, tech: 'EESM replaces permanent magnets with a DC-energised rotor winding. BMW Gen5 Neue Klasse EESM eliminates rare earths entirely; validated in iX3 (2024). Renault Megane E-Tech uses EESM front motor. Rotor excitation current ~5% of stator current adds a modest copper loss (excitation loss) that SiC-driven high efficiency can more than offset by removing magnet eddy and demagnetisation risk.', mfg: 'Rotor winding adds ~3-4 process steps vs magnet insert; brush ring or rotary transformer for slip-ring-free excitation adds sub-£8.5 cost.', why: "NdFeB magnets are 20-35% of motor BOM and subject to rare-earth price volatility and China export control risk — EESM eliminates this entirely. BMW's Gen6 strategy is EESM rear + induction front, achieving −40% system losses vs Gen5.", tr: 'Excitation copper loss at low load reduces efficiency vs IPM; rotor winding thermal management; rotary transformer reliability validation.' },
      { t: 'Switched reluctance motor (SRM): zero rare earth, zero copper magnets', lev: 'Technology', save: 'Magnet + copper cost −30-50%', bench: 'Stellantis STLA SRM program, BorgWarner SRM, Nidec SRM', v8: 'any', mat: 'Emerging', risk: 'High', new: 1, tech: 'SRM uses doubly-salient silicon-steel stator and rotor — no magnets, no rotor copper. Stator-only excitation with phase switching. Torque ripple historically high but modern asymmetric half-bridge inverter + control algorithms bring NVH to acceptable levels. Stellantis STLA program validated SRM for urban-range BEV. BorgWarner/Remy electric target mid-performance segment.', mfg: 'Stamped silicon-steel stator and rotor (same grade as induction machine); no magnet handling or hairpin winding — potentially 25-35% lower manufacturing cost.', why: 'Complete elimination of rare-earth magnets and rotor copper; robust against extreme temperature since no demagnetisation risk; raw material BOM lowest of all motor types.', tr: 'Torque ripple control requires advanced inverter; acoustic NVH; efficiency dip at partial load vs IPM.' },
      { t: 'Induction motor (IM) for front/lower-power axle: zero magnets, low cost', lev: 'Technology', save: 'Magnet cost eliminated; rotor cost −20%', bench: 'BMW Neue Klasse (front IM), Tesla Model S/X (front IM), Audi e-tron S (IM front triple-motor)', v8: 'any', mat: 'Proven', risk: 'Low', tech: 'Squirrel-cage induction motor is the lowest BOM cost motor topology — no magnets, cast aluminium rotor bar. BMW Neue Klasse pairs EESM rear + IM front: technology-open architecture optimised per axle. Tesla still uses IM front (for efficiency reasons at low load the IM is disconnected). Audi e-tron S uses three IM motors.', mfg: 'Aluminium die-cast rotor cage: lowest manufacturing complexity of all motor types. Stator identical hairpin process.', why: 'IM front axle deletes all magnets on the lower-performance axle where occasional use means full-time magnet drag loss matters — BMW Neue Klasse validated this optimisation achieving −40% system losses vs Gen5.', tr: 'Lower peak efficiency than IPM (94-95% vs 97-98%); magnetising current draws reactive power; slip frequency adds inverter complexity.' },
    ],
    top3: [
      { t: 'EESM rear axle feasibility', v: 'Excitation loss vs magnet cost trade at duty cycle; rotary transformer vs slip-ring decision' },
      { t: 'SRM NVH validation', v: 'Torque-ripple control strategy; acoustic package sign-off' },
      { t: 'IM front axle trade', v: 'Efficiency map vs IPM front across the drive cycle; BMW Neue Klasse benchmark' },
    ],
  },
  {
    id: 'multi-speed-gearbox',
    sub: 'Gearbox',
    name: 'Multi-Speed EV Gearbox (2-Speed & Above)',
    baseline: 'Single-speed fixed-ratio helical gearbox (~10-15:1 total ratio) as the EV standard.',
    fn: 'Enable motor optimisation across a wider operating range, allowing motor downsizing for equal vehicle performance.',
    ideas: [
      { t: '2-speed gearbox: downsize motor 20-25% for equal 0-100 performance', lev: 'Technology', save: 'Motor active material −20-25%, £72-119/unit motor saving', bench: 'Porsche Taycan 2-speed (PDK rear), Rimac Nevera 2-speed per axle, Stellantis STLA 2-speed (Jeep Wagoneer S)', v8: 'fav', mat: 'Emerging', risk: 'High', new: 1, tech: 'A 2-speed gearbox allows motor optimisation for mid-range efficiency (motorway) while still achieving high launch torque through the low gear. Porsche Taycan rear motor uses a 2-speed PDK; 1st gear for 0-100 acceleration, 2nd gear for top speed and motorway efficiency. Motor sized for 2nd-gear top-speed torque, reducing peak torque requirement by ~45% → active material savings. Rimac Nevera uses one 2-speed transmission per wheel (4 in total).', mfg: 'Dog-clutch or wet multi-plate 2-speed: adds £51-77 gearbox content but removes £119-170+ from motor BOM. Net system saving positive at high power levels.', why: 'Motor mass, copper, magnets and inverter size all scale with peak torque — a 2-speed gearbox substantially reduces this peak torque requirement at the motor, enabling a significantly smaller motor for the same vehicle performance.', tr: 'Shift quality, NVH during gear change; actuator cost/reliability; only positive business case at motor peak torque >400 Nm.' },
      { t: 'Gear ratio optimisation for 800V: single-speed ratio reduction', lev: 'Design', save: 'Motor copper/magnet −8-15%', bench: 'XPeng G6 (optimised ratio 9.5:1), Mercedes eATS 2.0, Hyundai IONIQ 6', v8: 'fav', mat: 'Proven', risk: 'Low', tech: 'Higher motor operating speed (enabled by 800V, thinner steel, better bearing design) allows a higher reduction ratio — same wheel torque with a smaller, faster-spinning motor. XPeng G6 uses a 9.5:1 ratio enabling the 3rd-gen motor to run at 21,000 rpm. Each 10% increase in operating speed allows roughly 8-10% motor volume reduction.', mfg: 'Higher-ratio gearset: pinion diameter reduces, gear loads increase — requires grade upgrade on pinion but net gear cost impact is small.', why: 'Higher gear ratio is the most cost-effective way to reduce motor size for a given wheel performance — no new technology required, just motor speed capability.', tr: 'Gear noise at high speed; bearing PV rating; thermal management of high-speed motor.' },
      { t: 'Delete planetary reduction stage: use coaxial helical (2-stage) for packaging', lev: 'Design', save: 'Planetary set delete: £21-38/unit', bench: 'Hyundai IONIQ 5/6 (coaxial 2-stage), Porsche Taycan, Audi e-tron GT (helical 2-stage)', v8: 'any', mat: 'Proven', risk: 'Low', tech: 'Planetary final drives (ring + sun + carrier) add axial packaging complexity and are harder to manufacture at tight NVH tolerances than parallel-axis helical gears. Hyundai E-GMP and Porsche PPE/Taycan use 2-stage coaxial helical reduction — offset axis but simpler, quieter and cheaper tooling. Delete ring gear, carrier and planet pins (6-9 parts) → 2 helical gear pairs (4 parts).', mfg: 'Hobbing + skiving of parallel helical gears vs planetary: simpler tooling, faster cycle times, better quality assurance.', why: 'Planetary stages are more compact but cost more to manufacture to the NVH tolerances required in an EV gearbox where road noise is the dominant source.', tr: 'Larger centre distance (packaging); offset axis may conflict with AWD layout.' },
    ],
    top3: [
      { t: '2-speed motor downsizing business case', v: 'System cost trade: gearbox content added vs motor+inverter reduction; NVH shift-quality validation' },
      { t: 'Single-speed ratio optimisation for 800V', v: 'Motor speed capability study; bearing/gear NVH at higher ratio' },
      { t: 'Delete planetary: coaxial helical', v: 'Packaging impact on AWD layout; NVH comparison vs planetary' },
    ],
  },
  {
    id: 'advanced-inverter',
    sub: 'Inverter / power electronics',
    name: 'Advanced Inverter Architecture (SiC / GaN / Chiplet)',
    baseline: 'Half-bridge SiC 6-switch 3-phase inverter with sintered-silver DCB module, wire-bonded interconnect, liquid-cooled baseplate.',
    fn: 'Switch traction current at high efficiency and power density using advanced device and packaging technologies.',
    ideas: [
      { t: 'Double-sided cooled SiC power module (Bosch / Hitachi / Mitsubishi): halve junction-to-coolant resistance', lev: 'Technology', save: 'SiC die area −20-30%, inverter size −25%', bench: 'Toyota Prius 4th gen (double-sided), Hyundai IONIQ 6 (SiC double-sided), Bosch SMG180B200 (double-sided)', v8: 'fav', mat: 'Emerging', risk: 'Med', new: 1, tech: 'Double-sided cooling applies coolant channels to both top and bottom of the power module die — halving thermal resistance (Rth junction-to-coolant) vs single-sided. This allows either smaller SiC die for same current/temperature, or higher current density with same die. Bosch SMG180B200, Hitachi, and Mitsubishi Electric all offer double-sided cooled modules. Toyota Gen4 Prius pioneered this for IGBT; SiC double-sided now entering automotive production.', mfg: 'Both substrate faces need precision-machined coolant manifold interfacing — adds sub-assembly complexity but eliminates the large liquid-cooled baseplate heatsink.', why: 'SiC MOSFET is 55-65% of 800V inverter module cost — shrinking die area 20-30% for the same electrical performance reduces the single largest cost driver in the inverter.', tr: 'Coolant manifold sealing on both sides; double-sided AMB substrate co-planarity tolerance; limited automotive volume supply at launch.' },
      { t: 'GaN (gallium nitride) for OBC/DC-DC: magnetics shrink 60-70%', lev: 'Technology', save: 'OBC magnetics/caps −60%, OBC volume −50%', bench: 'BYD OBC (GaN totem-pole PFC), GM Ultium OBC, Vitesco/Continental GaN OBC, NXP GaN automotive', v8: 'any', mat: 'Emerging', risk: 'Med', new: 1, tech: 'GaN switches at 300-600 kHz vs 20-30 kHz for Si IGBT — shrinking OBC inductors and capacitors by 60-70%. GaN-based totem-pole PFC achieves 99%+ OBC efficiency. BYD, GM Ultium and Continental GaN OBC modules are in production or near-production. Not yet cost-competitive for traction (SiC wins on high-voltage breakdown), but GaN dominates OBC/DC-DC where voltage is lower.', mfg: 'GaN lateral device (E-mode) integrates well into existing PCB process; eliminates multiple winding stages vs Si totem-pole.', why: 'Smaller, lighter OBC (target 3.5 kg → 1.8 kg, 3L → 1.2L) reduces vehicle mass and packaging cost; enables higher-power 22 kW AC charging in same form factor as current 11 kW unit.', tr: 'GaN device cost still 2-3× Si at equal current rating; PCB thermal management for GaN lateral device; ESD sensitivity in automotive environment.' },
      { t: 'Chiplet / 3D power integration: integrate gate driver + DSP + SiC in one package', lev: 'Technology', save: 'Inverter part count −40%, PCB area −35%', bench: 'Infineon CoolSiC™ Chiplet (2024 roadmap), Wolfspeed Gen4 SiC chiplet, STMicro MDmesh chiplet', v8: 'fav', mat: 'Emerging', risk: 'High', new: 1, tech: 'Chiplet integration stacks the gate driver, SiC die and sometimes DSP microcontroller into a single 3D package using through-silicon vias or bump bonding. Eliminates discrete gate driver PCB, isolator, bootstrapping components and interconnecting leads/PCB traces. Infineon, Wolfspeed and STMicro all have automotive chiplet roadmaps targeting 2025-2027 production.', mfg: 'Wafer-level fan-out packaging or 2.5D interposer technology — reduces pick-and-place steps from 15-20 components to 2-3 chiplet packages.', why: 'Gate driver + SiC integration removes 40-60% of inverter PCB components, reduces switching loop inductance (improves EMC/noise), and enables inverter cost below $5/kW at high volume.', tr: 'Automotive qualification of 3D packaging at high junction temperatures (175°C+); repair/rework complexity; limited automotive-qualified suppliers until 2026.' },
      { t: 'Huawei DriveONE: all-in-one SiC intelligent drive system (latest benchmark)', lev: 'Technology', save: 'System integration −35%, efficiency 97%+ system', bench: 'Huawei DriveONE 3rd gen (2024): motor+inverter+MCU+thermal fully integrated; AITO M9, Avatr 12, Chery Exlantix ET', v8: 'fav', mat: 'Proven', risk: 'Med', new: 1, tech: "Huawei DriveONE 3rd generation (2024) integrates SiC inverter, motor control MCU, resolver decoder, thermal management, and CAN/Ethernet gateway in a single housing. Adopted by AITO M9 (Huawei flagship SUV), Avatr 12 (Changan-Huawei), and Chery Exlantix ET. Achieves 97.5% peak motor efficiency and 92% system efficiency battery-to-wheel. The DriveONE architecture is supplier-integrated: OEM gets a drop-in e-axle with OTA-updatable control software — reducing OEM EDU engineering cost by £13-21.25M/programme.", mfg: "Single drop-in e-axle module for OEM assembly: one coolant connection, one HV connector, one LV connector. OEM assembly station reduced from 8-12 operations to 3-4 for the e-axle install.", why: "Huawei's vertically integrated approach (owns SiC chip design, inverter, motor, MCU software) achieves the lowest system cost per kW of any Tier-1 supplier — critical benchmark for JLR, BMW and Stellantis cost teams.", tr: 'Geopolitical risk: Huawei components are US export-controlled — European/US OEMs cannot adopt directly but use as cost benchmark for their own suppliers.' },
    ],
    top3: [
      { t: 'Double-sided cooled SiC module', v: 'Thermal resistance validation; die area reduction quantification vs single-sided baseline' },
      { t: 'GaN OBC/DC-DC replacement', v: 'Switching frequency + magnetics sizing study; cost crossover vs Si' },
      { t: 'SiC chiplet qualification timeline', v: 'Infineon/Wolfspeed automotive roadmap review; 175°C+ packaging validation plan' },
    ],
  },
];

// ─── MANUFACTURING LEVERS ─────────────────────────────────────────────────────

export const MFG_LEVERS: Record<string, MfgLevel> = {
  edu: {
    title: 'EDU / unit level',
    sub: 'Line, assembly, test and plant economics for the whole drive unit',
    items: [
      { t: 'Integrate to a 3-in-1 line layout', lev: 'Layout', save: 'handling, stations', note: 'One integrated unit removes inter-unit transport, packaging and duplicate sealing/joining stations.' },
      { t: 'Combined end-of-line (EOL) test', lev: 'Test', save: 'capex, cycle', note: 'Single functional + HV + NVH EOL test for the assembled EDU instead of separate motor/inverter/gearbox testers.' },
      { t: 'Design for assembly: cut fastener count and joint types', lev: 'Assembly', save: 'labour, tools', note: 'Fewer, common fasteners and joint types reduce stations, tool changes and error modes.' },
      { t: 'Takt balancing and bottleneck removal', lev: 'Layout', save: 'throughput', note: 'Balancing stations spreads fixed cost over more units, lowering cost per unit without new capex.' },
      { t: 'Poka-yoke fixturing and error-proofing', lev: 'Quality', save: 'scrap, rework', note: 'Mistake-proof fixtures and vision checks lift first-time-right and cut warranty risk.' },
      { t: 'Automate high-labour stations where volume justifies', lev: 'Automation', save: 'labour', note: 'Bolting, magnet handling, winding insertion and dispensing automated at the right volume.' },
      { t: 'SMED / quick-changeover for mixed-model lines', lev: 'Layout', save: 'utilisation', note: 'Run multiple variants on one line, lifting asset utilisation and cutting per-unit overhead.' },
      { t: 'In-line leak and HV test vs offline', lev: 'Test', save: 'WIP, cycle', note: 'Catch defects in sequence to reduce work-in-process and scrapped value-added content.' },
      { t: 'Reduce HV connector count via integration', lev: 'Consolidation', save: 'crimp/test ops', note: 'Direct busbar coupling removes crimping, sealing and connector test stations.' },
      { t: 'Regional localisation of high-logistics parts', lev: 'Logistics', save: 'freight, duty, inventory', note: 'Localise heavy/bulky castings and magnets to cut freight, duty and safety stock.' },
      { t: 'Common coolant fill/evacuation station', lev: 'Layout', save: 'capex', note: 'Single shared fill station for an integrated loop vs multiple subsystem fills.' },
      { t: 'Digital traceability and SPC', lev: 'Quality', save: 'warranty, scrap', note: 'Per-unit traceability and statistical process control reduce escapes, recall exposure and scrap.' },
      { t: 'Energy management across casting and ovens', lev: 'Energy', save: 'unit energy cost', note: 'Heat recovery, scheduling and efficient HPDC/cure ovens cut a real per-unit conversion cost.' },
      { t: 'Design-to-cost gate with should-cost targets', lev: 'Tooling', save: 'program cost', note: 'Set per-process cost targets early so tooling and line investment are sized to the should-cost.' },
    ],
  },
  sub: {
    title: 'Sub-assembly level',
    sub: 'Stator, rotor, inverter, gearbox and housing build cells',
    items: [
      { t: 'Automated hairpin forming + laser-weld cell (stator)', lev: 'Automation', save: 'labour, cycle', note: 'Replaces manual winding; raises slot-fill and weld-yield consistency.' },
      { t: 'Automated magnet insertion + adhesive cure (rotor)', lev: 'Automation', save: 'labour, scrap', note: 'Robotic magnet handling and controlled cure reduce breakage and misplacement.' },
      { t: 'In-line rotor balancing automation', lev: 'Quality', save: 'scrap, cycle', note: 'Automated measure-and-correct balancing reduces NVH rejects.' },
      { t: 'Pick-and-place + reflow / sinter cell (inverter)', lev: 'Automation', save: 'labour, yield', note: 'Automated module assembly with sinter press improves throughput and reliability.' },
      { t: 'Direct-cooled module to remove TIM dispense station', lev: 'Process', save: 'a station', note: 'Pin-fin direct cooling deletes the thermal-interface dispensing and cure step.' },
      { t: 'Gear hard-finishing cell vs grinding line', lev: 'Process', save: 'cycle, capex', note: 'Skiving/honing cells replace slower, costlier grinding for suitable gears.' },
      { t: 'In-line gear metrology (double-flank / CMM)', lev: 'Quality', save: 'scrap', note: 'Catch tooth errors in-cell before value is added downstream.' },
      { t: 'HPDC cell with vacuum + automated spray (housing)', lev: 'Process', save: 'scrap, cycle', note: 'Vacuum-assisted HPDC and automated die spray cut porosity scrap and cycle time.' },
      { t: 'One-clamp machining fixtures', lev: 'Tooling', save: 'cycle, accuracy', note: 'Machine multiple faces in one setup to cut handling and tolerance stack.' },
      { t: 'Robotic FIPG dispensing vs cut gaskets', lev: 'Automation', save: 'material, labour', note: 'Form-in-place sealing removes gasket parts and manual placement.' },
      { t: 'Press-fit bearing automation', lev: 'Automation', save: 'labour, quality', note: 'Servo-press with force monitoring improves consistency and traceability.' },
      { t: 'Sub-assembly EOL test before integration', lev: 'Test', save: 'cost of failure', note: 'Test stator/rotor/inverter before final build so defects are caught at lowest added value.' },
    ],
  },
  part: {
    title: 'Part level',
    sub: 'Process, tooling and material levers on individual components',
    items: [
      { t: 'Net-shape processes to cut machining stock', lev: 'Process', save: '10-30%', note: 'HPDC, near-net forging and PM reduce material removal and cycle time on housings, shafts and gears.' },
      { t: 'Stamping strip-layout and nesting optimisation', lev: 'Yield', save: '5-15% material', note: 'Better nesting and progressive dies lift electrical-steel and busbar utilisation; reclaim offal.' },
      { t: 'Reduce machining setups and datums', lev: 'Tooling', save: '5-15% machining', note: 'One-clamp fixtures, near-net blanks and fewer finished faces cut cost and stack-up.' },
      { t: 'Skiving / honing vs hobbing + grinding (gears)', lev: 'Process', save: '15-35%', note: 'Hard-finishing replaces slow grinding where the quality class allows.' },
      { t: 'Grain-boundary diffusion to cut magnet material', lev: 'Material', save: '10-25% magnet', note: 'Same coercivity with less heavy rare earth - the largest part-level material lever.' },
      { t: 'Stamp vs machine + selective plating (busbar)', lev: 'Process', save: '15-25%', note: 'Blanking replaces machining; plate precious metal only at contacts.' },
      { t: 'Roll-formed splines + induction hardening (shaft)', lev: 'Process', save: '5-15%', note: 'Forming and localised hardening replace cutting and full carburising where duty allows.' },
      { t: 'Component consolidation on PCBA / fewer layers', lev: 'Consolidation', save: '5-15% PCBA', note: 'Integrate functions, use standard automotive ICs and minimum adequate layer count.' },
      { t: 'Fastener and feature standardisation', lev: 'Standardization', save: 'SKU, tooling', note: 'Common fasteners and features cut SKUs, tool changes and inventory.' },
      { t: 'Tolerance right-sizing on non-functional features', lev: 'Spec opt.', save: '5-10%', note: 'Relax tight specs away from bearing bores and sealing faces to drop expensive operations.' },
      { t: 'Heat-treat batching and energy recovery', lev: 'Energy', save: 'process cost', note: 'Batch optimisation and oven heat recovery cut per-part heat-treat energy cost.' },
      { t: 'Secondary (recycled) alloy where spec allows', lev: 'Material', save: '3-10%', note: 'Use secondary aluminium for non-critical castings to cut material cost and footprint.' },
      { t: 'Selective surface finishing only where it functions', lev: 'Spec opt.', save: '5-12%', note: 'Superfinish/coat only loaded flanks or contact zones, not whole parts.' },
      { t: 'Dual-source and reclaim on high-spend materials', lev: 'Logistics', save: '3-10%', note: 'Competitive second sources plus scrap reclamation on copper, magnets and steel.' },
    ],
  },
};

// ─── INDUSTRY TRENDS ─────────────────────────────────────────────────────────

export const EDU_TRENDS: Record<string, TrendItem[]> = {
  unit: [
    { t: '800V architecture is the premium-mainstream standard', status: 'Mainstream (800V)', save: 'Battery/cabling ↓, efficiency +5-8%', dir: 'SiC + 800V passed the tipping point in 2025-26; 1200V SiC MOSFETs are standard in premium traction (Tesla, BYD, Hyundai/Kia E-GMP, Porsche Taycan, Audi PPE). 800V roughly halves current for a given power, so harness and cooling shrink and the 5-8% efficiency can downsize the battery.' },
    { t: 'Above 800V: 900-1000V class at the high end', status: '>800V frontier', save: 'Cabling/battery ↓ further, ultra-fast charge', dir: '900V-class (NIO), ~924V (Lucid Air) and 1000V-class (BYD) enable sub-10-minute charging, with megawatt charging (MCS, >1000V) for trucks. Pushes conductor and cooling mass down further but needs 1700V-class SiC and tighter insulation/creepage.' },
    { t: 'n-in-1 integration: 3-in-1 to 8-in-1', status: 'Mainstream → frontier', save: 'Part count −30-50%, assembly −15-25%', dir: 'Collapsing motor + gear + inverter (plus OBC/DC-DC in 8-in-1) into 1-3 castings. BYD 8-in-1 (Seal), Tesla and Geely lead; Ford F-150 Lightning shares the same motor+inverter base front and rear.' },
    { t: 'Lean, scalable EDU platform families', status: 'Mainstream', save: 'Tooling amortised, piece price ↓', dir: 'One motor+inverter base scaled by stack length across power classes and axles; Hyundai/Kia re-use the inverter for added functions. Munro teardowns repeatedly flag integrated, low-part-count drive units as the cost battleground.' },
    { t: '48V low-voltage net alongside 800V HV', status: 'Emerging', save: 'LV copper ↓', dir: 'Tesla Cybertruck pairs a 48V low-voltage system with 800V charging, cutting low-voltage wiring diameter, mass and cost — a complement to the 800V high-voltage side.' },
    { t: 'EESM & zero-rare-earth motors entering volume production', status: 'Mainstream → frontier', save: 'Magnet cost eliminated (£6.8-21/kW)', dir: 'BMW Gen5 EESM (iX3/i4, 2024), Renault Megane E-Tech, ZF EVSys320 — electrically excited synchronous motors eliminate NdFeB entirely. BMW Gen6 Neue Klasse: EESM rear + IM front = −40% system losses vs Gen5. ZF targeting EESM for 50%+ of new EDU programs by 2027.' },
    { t: 'Axial-flux motors entering automotive production', status: 'Emerging → Mainstream', save: 'Motor mass −50%, magnet −30%', dir: 'YASA (Stellantis-owned) in production at Mercedes AMG SL 53 and Ferrari SF90. Stellantis building dedicated YASA axial-flux line in Oxford for 2026. Magnax targeting automotive from 2026. Power density 10+ kW/kg vs 3-5 kW/kg radial-flux.' },
    { t: 'Chinese OEM vertical integration: SiC + motor + inverter + software', status: 'Mainstream (China)', save: 'System cost −25-35% vs Tier-1 supply', dir: 'BYD (SiC chip→module→inverter→motor→BMS in-house), Xiaomi (SiC module in-house, 27k rpm motor), Li Auto (Suzhou SiC fab), NIO (in-house 1200V SiC), Huawei DriveONE. By 2026 top-5 Chinese EV OEMs are fully vertically integrated on e-drive — European OEMs face structural cost disadvantage of £255-425/EDU if they remain Tier-1 dependent.' },
  ],
  sub: [
    { t: 'Inverter: SiC cost-down + advanced packaging', status: 'Mainstream (800V)', save: 'Module system −8-18%', dir: 'SiC MOSFETs are about 56% of 800V inverter modules. The battleground is packaging: double-sided cooling + sintered-silver + Si3N4 AMB shrinks die and cooler; hybrid Si/SiC bridges cost on entry trims.' },
    { t: 'Motor winding: hairpin / continuous-wave + oil cooling', status: 'Mainstream', save: 'Copper −10-20%', dir: 'Flat-wire hairpin and continuous-wave windings with direct oil-spray cooling are now standard on cost-led motors — Mercedes/VW APP550, BYD flat-wire, Lucid continuous-wave, Ford F-150 Lightning segment-coil.' },
    { t: 'Motor magnets: rare-earth reduction and removal', status: 'Mainstream → frontier', save: 'Magnet −15-40% or eliminated', dir: 'GBD-reduced IPM is mainstream; EESM removes magnets in volume (BMW Gen5 iX3/i4, Nissan Ariya; Renault/ZF around 2027). Axial-flux (YASA at Mercedes, Berlin 2026) cuts copper/iron/magnet ~50% mass.' },
    { t: 'Thermal: single-fluid (oil) cooling', status: 'Mainstream', save: 'Subsystem −20-35%', dir: 'One low-viscosity ATF cools the motor and inverter and lubricates the gears, deleting the water jacket and a whole circuit (Ford F-150 Lightning oil cooling, most new e-axles). 800V SiC efficiency means less heat to reject in the first place.' },
    { t: 'Gearbox: forge → skive → LPC → hone + superfinish', status: 'Mainstream', save: 'Gear machining −10-20%', dir: 'Precision-forged blanks, power skiving, low-pressure carburizing with press quench and honing (skipping grinding), plus isotropic superfinish on high-duty flanks.' },
    { t: 'HV interface: integration + smart charging', status: 'Mainstream (800V)', save: 'Delete HV connectors / boost converter', dir: 'Mounting the inverter on the EDU deletes external HV cables and connectors. Hyundai/Kia E-GMP uses a 4th-lead smart inverter to charge an 800V car on 400V infrastructure without a dedicated boost converter.' },
    { t: 'Oil immersion (full stator immersion) replacing oil-spray cooling', status: 'Emerging', save: 'Thermal resistance −50%, power density +30%', dir: 'CATL Shenxing motor uses full oil immersion (stator submerged) vs end-winding oil spray — thermal resistance halved. Enables 99% slot fill with only slot liner. GAC Aion Hyper motor also uses immersion cooling. Entering pre-production validation at multiple Chinese OEMs in 2024-25.' },
    { t: 'Rotary transformer for EESM excitation (brush-free wound rotor)', status: 'Emerging', save: 'Brush maintenance eliminated, reliability ↑', dir: 'BMW Gen5 EESM uses rotary transformer (non-contact inductive coupling) to supply rotor excitation current without brushes — eliminates wear and carbon dust. ZF and Renault use slip rings (lower cost); BMW approach superior for 200K km warranty. Adds £6.8-13/unit vs slip ring.' },
  ],
  part: [
    { t: 'DC-link capacitor downsizing via SiC ripple', status: 'Mainstream (SiC)', save: 'Cap −20-40%', dir: 'Faster SiC switching cuts the capacitance needed for the same ripple; leaders also integrate the cap and busbar into the power stack to delete interconnects.' },
    { t: 'Substrate/interconnect: Si3N4 AMB + Cu-clip (wire-bond-free)', status: 'Mainstream → frontier', save: 'Die downsize, warranty ↑', dir: 'Si3N4 active-metal-brazed substrate survives more thermal cycles and Cu-clip/planar interconnect cuts parasitics — increasingly important at 800V fast switching.' },
    { t: 'Busbar: aluminium + laser/ultrasonic weld', status: 'Mainstream', save: 'Conductor $/kg, joints ↓', dir: '800V halves current, so thinner aluminium busbars (Cu-clad terminals) carry the power; welded terminations replace bolted lugs for fewer joints and lower resistance.' },
    { t: 'Magnet: grain-boundary diffusion + segmentation', status: 'Mainstream', save: 'Magnet −10-25%, eddy loss ↓', dir: 'GBD cuts heavy rare earth 20-60% at equal coercivity; segmenting magnets cuts the high-frequency eddy loss of 800V high-speed rotors.' },
    { t: 'Electrical steel: thin-gauge NO for high frequency', status: 'Mainstream', save: 'Core right-size', dir: '0.20-0.27mm non-grain-oriented steel only where the 800V high-speed fundamental demands it; thicker, cheaper grades elsewhere to avoid paying for unused loss margin.' },
    { t: 'Sensors: resolver → inductive / sensorless', status: 'Mainstream → emerging', save: 'Sensor −20-40% or deleted', dir: 'Inductive position sensors replace wound resolvers (Munro praised Rivian\'s compact unit); model-based thermal estimation deletes redundant NTCs.' },
    { t: 'Bearings: shaft-current mitigation for SiC', status: 'Emerging (SiC)', save: 'Avoid premium ceramic everywhere', dir: 'Fast SiC dv/dt raises bearing (EDM) currents; grounding rings or insulated coatings protect bearings far cheaper than fitting hybrid-ceramic bearings on both ends.' },
    { t: 'GaN for auxiliaries (OBC / DC-DC)', status: 'Emerging', save: 'Magnetics/caps ↓', dir: "GaN's higher switching frequency shrinks on-board-charger and DC-DC magnetics; uptake is faster in auxiliaries than in high-power traction." },
    { t: 'SiC chiplet / 3D packaging: gate driver + SiC in one module', status: 'Emerging (2025-27)', save: 'Inverter BOM −25-35%', dir: 'Infineon CoolSiC Chiplet, Wolfspeed Gen4, STMicro MDmesh — stacking gate driver + SiC die in 3D package eliminates discrete gate driver board, isolator, bootstrapping components. Reduces switching loop inductance (better EMC) and inverter PCB area by 35%. Infineon targets automotive qualification 2026.' },
    { t: 'AI-optimised winding (CATL Shenxing): 99% slot fill target', status: 'Next-Gen', save: 'Copper −10%, slot fill +15%', dir: "CATL's Shenxing motor program uses AI-generated winding geometry targeting 99% slot fill vs 85% industry standard for flat-wire hairpin. Combined with immersion cooling, enables motor power density >6 kW/kg at production volume — benchmarked by JLR, BMW and Stellantis cost teams as the 2027 target architecture." },
  ],
};

// ─── OEM LATEST MOVES ─────────────────────────────────────────────────────────

export const OEM_MOVES: BrandMove[] = [
  { brand: 'BYD', model: 'e-Platform 3.0 · 8-in-1', moves: ['World-first mass-produced 8-in-1 e-axle (motor+gear+inverter+OBC+DC-DC+BMS+VCU+MCU), ~89% system efficiency', 'Deep vertical integration: in-house SiC module, current sensor, DC-link and relays', 'Blade LFP cell-to-body; flat-wire motors; high-speed rotors (~23k rpm)'] },
  { brand: 'Tesla', model: 'Next-gen drive unit · 400V', moves: ['Permanent-magnet motor with zero rare earths', 'New multi-chip SiC module extracts ~2× heat → 75% less SiC; ~$1,000 drive-unit cost', 'Integrated motor+inverter, 50% smaller factory footprint, battery-chemistry agnostic'] },
  { brand: 'XPeng', model: 'SEPA2.0 · 800V', moves: ['Full-stack in-house XPower oil-cooled flat-wire SiC integrated e-drive — 97.5% peak / 92% overall efficiency', 'G6 3rd-gen PMSM: square flat-wire 8-layer hairpin, 97.86% motor efficiency', 'Platform carries 80% of components across models; −20% R&D cycle'] },
  { brand: 'Li Auto', model: '800V BEV · in-house', moves: ['Self-developed SiC chip (Suzhou) → own SiC module → next-gen e-drive (Changzhou): vertical closed loop', 'More compact, quieter drive with lower energy use', '70% of key components localised by 2026'] },
  { brand: 'Yangwang (BYD)', model: 'e4 · 1200V', moves: ['World-first mass-produced 1200V SiC platform — ~67% less heat than 800V at matched power', 'Quad-motor: four 30,000-rpm motors, one per wheel, per-wheel torque vectoring', '0.1 mm electrical steel, ultra-high-strength rotor steel, aluminium housing'] },
  { brand: 'NIO', model: 'NT3.0 Thunder · 900V', moves: ['World-first mass-produced 900V (up to 925V) drive system', 'In-house 1200V SiC module at 1315 kW/L — among the highest in mass production', '925V W-pin (continuous-wave) PSM, 79 kg, 4.3 kW/kg; motors 30% lighter and 280 mm shorter'] },
  { brand: 'Mercedes-Benz', model: 'MMA eATS 2.0 · 800V', moves: ['In-house 800V SiC drive (front+rear on 4MATIC); oil-cooled PSM', 'Scalable-length motor family across MMA / EVA2M / MB.EA', 'Near-zero heavy rare earths; ~93% battery-to-wheel efficiency'] },
  { brand: 'Porsche', model: 'PPE · 800V', moves: ['800V PSM with rectangular-wire hairpin; SiC rear inverter (up to 900 A on Turbo), Si front', 'Scalable motor — one diameter, varied active length — across the range', 'High-volume PPE platform shared with Audi'] },
  { brand: 'Audi', model: 'PPE · 800V', moves: ['Hairpin fill factor 60% vs 45%; direct oil-spray stator + rotor oil cooling', 'Rotor cooling lets Audi largely drop heavy rare earths while +20% power density', 'Si-front / SiC-rear inverter split fits device cost to axle duty'] },
  { brand: 'Volkswagen', model: 'MEB · APP550', moves: ['New rear PSM: larger-cross-section windings + thin laminations, stronger magnet', 'No electric oil pump — passive gear-driven splash + coolant-coupled oil', 'Lower 9.8:1 gear ratio cuts friction; pulse inverter integrated in the housing'] },
  { brand: 'BMW', model: 'Neue Klasse Gen6 · 800V', moves: ['Rare-earth-free EESM (rear) + induction ASM (front): technology-open 1/2/3/4-motor', 'In-house SiC inverter built at the repurposed Steyr engine plant', 'vs Gen5: −40% losses, −20% cost, −10% weight, +20% efficiency'] },
  { brand: 'Stellantis', model: 'STLA · 3-in-1 EDM', moves: ['Three scalable 3-in-1 EDMs (motor+inverter+reduction) across all platforms', 'ONE inverter design + common microprocessor + in-house software for the whole range', 'Selectable Si-or-SiC power stage (400/800V, 350-750 A) fits device cost to application'] },
  { brand: 'Denza (BYD)', model: 'BYD premium platform', moves: ['Shares BYD\'s high-integration e-axle and in-house SiC / flat-wire motors', 'Integration scaled to premium torque-vectoring AWD (e.g. tri-motor)'] },
  { brand: 'Huawei / AITO', model: 'DriveONE 3rd Gen · 800V', moves: ['97.5% peak motor efficiency + 92% battery-to-wheel; all-in-one SiC e-axle with integrated MCU, thermal management and OTA control software', 'Adopted by AITO M9, Avatr 12 (Changan-Huawei JV), Chery Exlantix ET — 3 platforms, 1 drop-in module', 'DriveONE architecture: OEM gets 3-connection e-axle (HV, coolant, LV) — reduces OEM EDU assembly from 12 to 3 operations'] },
  { brand: 'Xiaomi', model: 'HyperEngine V8s · 800V', moves: ['Self-developed: 27,200 rpm PMSM — highest rpm in mass-production automotive (2024)', 'In-house SiC MOSFET + power module + motor: full vertical integration achieved in <3 years from zero', 'Motor power density: 10.14 kW/kg; SU7 Ultra dual-motor: 1,548 hp, 0-100 km/h in 1.98 sec'] },
  { brand: 'Zeekr / Geely', model: 'Golden Ratio EDU · 800V', moves: ['In-house flat-wire 8-layer hairpin motor + SiC inverter at Geely Panasonic EDC joint venture', 'Zeekr 001 FR: 1,265 hp quad-motor torque vectoring using Zeekr/Geely-developed e-axles', '96% system efficiency; shared motor+inverter base across Zeekr, Lynk & Co, Volvo EX90 EV'] },
  { brand: 'Rivian', model: 'Gen 2 Enduro · 400/800V', moves: ['Rivian-designed motor + 2-speed gearbox on R2 Gen2: first US OEM 2-speed EV gearbox at mainstream volume', 'In-house SiC inverter; inductive position sensor (no resolver — praised by Munro teardown)', 'Motor power density vs Gen1 +40%; 2-speed gearbox enables 20% motor active-material reduction'] },
  { brand: 'Lucid Motors', model: 'PDRIVE · 924V', moves: ['924V traction system — highest voltage series-production EV in the world (2024)', 'In-house motor: 670 kW continuous, 9.0 kW/kg — benchmarked above Ferrari SF90 motor density', 'All-in-one compact integration; no external gear reduction; stator immersion-adjacent oil cooling'] },
  { brand: 'GM Ultium', model: 'Ultium Drive 3.0 · 800V', moves: ['Scalable motor family: 3 sizes (front small, rear medium, rear large) shared across Cadillac, GMC, Chevrolet EV', 'GM-developed SiC inverter from 2025 replacing Bosch supply; GaN OBC in Cadillac Celestiq', 'Ultrium cell-to-pack + structural frame integration: propulsion + structural in one — Silverado EV, Sierra EV'] },
  { brand: 'CATL / Avatr', model: 'Shenxing Motor Platform · 800V', moves: ['CATL entering e-motor market: "Shenxing" motor targets 99% slot fill vs 85% industry standard via AI-optimised winding', 'Full oil immersion stator cooling (not just spray): thermal resistance halved vs oil-spray standard', 'Avatr 12 (Changan+CATL+Huawei): CATL battery structural frame + Huawei DriveONE — zero separate EDU housing'] },
  { brand: 'GAC Aion / Hyper', model: 'AET Motor · 800V', moves: ['GAC in-house AET (Aion Electric Technology) flat-wire motor: 97.5% peak efficiency, 21,000 rpm', 'Hyper GT: 0-100 in 3.0 sec on single rear motor — motor power density 4.8 kW/kg at production cost', 'Full SiC inverter + motor in single aluminium housing; single coolant loop eliminates inter-subsystem HV connectors'] },
];

// ─── EDU COST STRUCTURE ───────────────────────────────────────────────────────

export const EDU_COST_STRUCTURE = [
  { name: 'Inverter (SiC)', share: 32, color: '#6757c2' },
  { name: 'E-motor', share: 27, color: '#2f6fae' },
  { name: 'Reducer + diff', share: 17, color: '#1d9488' },
  { name: 'Housing', share: 11, color: '#a85f24' },
  { name: 'Thermal / lube', share: 8, color: '#c08418' },
  { name: 'Sensors / ctrl', share: 5, color: '#b1547c' },
];

// ─── SUBSYSTEM GROUPS ─────────────────────────────────────────────────────────

export const EDU_SUBSYSTEMS = [
  'Electric machine',
  'Inverter / power electronics',
  'Gearbox',
  'Differential',
  'Thermal & lubrication',
  'Electrical & sensors',
  'Integration',
];

export function getEduComponentsBySubsystem(sub: string) {
  return EDU_COMPONENTS.filter(c => c.sub === sub);
}

export function getEduComponentById(id: string) {
  return EDU_COMPONENTS.find(c => c.id === id);
}

export function getTotalEduIdeas() {
  return EDU_COMPONENTS.reduce((acc, c) => acc + c.ideas.length, 0);
}
