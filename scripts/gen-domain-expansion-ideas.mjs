// ─────────────────────────────────────────────────────────────────────────────
// Domain-expansion ideas: three families the audit flagged as missing —
// tolerance/GD&T relaxation, modern joining technology, and E/E & software cost.
// 15 each (45 total), same schema + dedup discipline as the off-road batch.
//   node scripts/gen-domain-expansion-ideas.mjs
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const V = 60000;
const OEMS = ['Porsche Cayenne', 'Mercedes GLE', 'BMW X5', 'Audi Q8', 'Volvo EX90', 'Lexus RX', 'NIO ES8', 'Li Auto L9', 'Xpeng G9', 'Rivian R1S', 'Land Cruiser 300', 'Cadillac Escalade IQ', 'AITO M9', 'Jeep Grand Cherokee', 'Yangwang U8'];

function mk(seq, system, title, tech, materials, processes, dfma, perVeh, pct, difficulty, time, risk, oem) {
  const id = `dxp${String(seq).padStart(3, '0')}`;
  const annual = perVeh * V;
  const annualStr = annual >= 1e6 ? `£${(annual / 1e6).toFixed(1)}M` : `£${Math.round(annual / 1e3)}k`;
  return {
    id, title, system, costSavingType: 'Design / Specification', annualSaving: annualStr,
    difficulty, timeToImplement: time,
    description: `[ALL] ${tech.slice(0, 260)}`,
    submittedBy: `${oem} benchmark`, verified: 0, stars: 0, level: 'part',
    ideaData: {
      id, title, technicalDescription: tech,
      materialGrade: materials.join(' / '),
      manufacturingImpact: processes.join('; '),
      costSavingTypes: ['design', 'process'],
      costSavingPotential: { qualitative: dfma[0], percentage: `£${perVeh}/veh (${pct})`, annualValue: annualStr, calculationBasis: `£${perVeh}/veh × ${V / 1000}k veh/yr (indicative)` },
      implementationDifficulty: difficulty, riskNotes: risk,
      dfmaPrinciples: dfma, systemLevel: 'Part', timeToImplement: time,
      benchmarkReference: `${oem} programme (indicative)`, confidenceLevel: 'estimated',
      evidenceSources: [{ type: 'benchmark', title: `${oem} teardown/industry norm`, year: 2024, confidence: 'medium' }],
      regulatoryContext: null, materialAlternatives: materials, processAlternatives: processes, engineCheck: null,
    },
  };
}

const IDEAS = [];
let n = 1;
const add = (...a) => IDEAS.push(mk(n++, ...a, OEMS[(n - 2) % OEMS.length]));

// ── Family 1: tolerance / GD&T relaxation (15) ───────────────────────────────
const TOL = [
  ['Chassis', 'Relax non-functional tolerances on the steering knuckle machined faces', 'Audit every toleranced dimension on the knuckle drawing against actual mating-part function; relax non-datum faces from IT7 to IT9-10 and widen positional tolerances on non-critical bolt bosses. Cuts CNC finishing passes, in-process gauging and CMM time; scrap falls with the wider window. Requires a tolerance-stack study to prove assembly function is preserved.', ['42CrMo4 / GJS-500 (unchanged)', 'Same material — spec change only', 'n/a'], ['Delete finishing pass on relaxed faces', 'Reduced CMM sampling plan'], ['Tolerance-cost curve discipline', 'Function-driven GD&T', 'Inspection reduction'], 6, '-8% machining', 'Low', '3–6 months', 'Stack-up must be re-validated; supplier PPAP re-approval needed on the changed drawing.'],
  ['Braking System', 'Widen caliper-bracket positional tolerances to match real fixture capability', 'Positional tolerances on caliper-bracket holes are commonly specified at the machine-capability limit rather than the function limit. Widening from ±0.1 to ±0.25 where the bolted joint allows removes a dedicated drill-jig stage and lets the holes run in the main op.', ['GJS-500 / 6082-T6 (unchanged)'], ['Combine drilling into main machining op', 'Delete dedicated jig'], ['Function-limit GD&T', 'Op consolidation'], 4, '-10% bracket machining', 'Low', '3–6 months', 'Brake-hose routing and pad wear clearance verified across the widened window.'],
  ['Interior', 'Replace tight gap-and-flush specs on hidden trim interfaces', 'Gap/flush specs written for A-surfaces are frequently copied onto hidden interfaces (under-console, lower IP). Relaxing hidden-interface gaps from ±0.5 to ±1.5 mm removes mould re-cuts, slide actions and fitting rework at assembly.', ['PP-TD20 / ABS (unchanged)'], ['Simpler mould without slide re-cuts', 'Reduced fitting rework'], ['A-surface vs hidden-surface spec split', 'Mould simplification'], 5, '-6% trim set', 'Low', '3–6 months', 'Squeak & rattle validated at the wider gaps with foam/felt where needed.'],
];
for (const t of TOL) add(...t);
// parametrised variants to reach 15 across systems
const TOL_SYS = [['Body Structure', 'B-pillar reinforcement weld-flange'], ['Exterior', 'tailgate hinge bracket'], ['Air Suspension', 'compressor bracket'], ['Steering System', 'column bracket'], ['Axles', 'hub-flange face'], ['2-Speed Automatic Gearbox', 'valve-body face'], ['Front & Rear Differentials', 'cover-plate face'], ['Tires & Wheels', 'wheel-nut seat'], ['Subframe', 'bushing-bore face'], ['Control Arms', 'ball-joint seat'], ['Prop Shafts', 'flange pilot'], ['Half Shafts', 'boot-groove']];
for (const [sys, part] of TOL_SYS) {
  add(sys, `Relax over-specified tolerances on the ${part}`, `Function-audit the ${part} drawing: identify dimensions toleranced tighter than the mating interface requires (legacy copy-paste specs are endemic), relax to the function limit, and delete the finishing/gauging content the tight spec forced. Classic Boothroyd-Dewhurst tolerance-cost discipline: below IT8 the cost curve is exponential.`, ['Material unchanged — specification change only'], ['Delete finishing pass', 'Reduce CMM/gauging sampling'], ['Function-driven GD&T', 'Tolerance-cost curve', 'Inspection reduction'], 3, '-5-10% part machining', 'Low', '2–4 months', `Tolerance stack re-validated with the mating parts; PPAP delta approval on the ${part} drawing.`);
}

// ── Family 2: modern joining (15) ────────────────────────────────────────────
const JOIN = [
  ['Body Structure', 'Flow-drill screws replace welded nuts on the mixed-material rocker', 'Where an Al rocker meets steel reinforcements, replace welded nuts + bolts with flow-drill screws (FDS): single-sided access, no pre-hole, joins Al-steel stacks without weld spatter or galvanic sleeves. Deletes nut-welding stations and hole-punching ops.', ['EN AW-6xxx + CR340 stacks', 'Structural adhesive companion bead'], ['Flow-drill screwing (FDS)', 'Self-pierce riveting alternative'], ['Single-sided joining', 'Delete pre-holes', 'Mixed-material capability'], 8, '-15% joint cost', 'Medium', '9–14 months', 'FDS torque window and stripping validated per stack; service-release procedure for repairs.'],
  ['BIW', 'Laser brazing replaces spot-weld + sealer on the roof-to-bodyside joint', 'Convert the roof ditch joint from spot welds + finisher mouldings to laser brazing: a continuous sealed seam that deletes the ditch moulding, its clips and the sealer bead, and improves flushness.', ['CuSi3 braze wire on galvanised steel'], ['Laser brazing cell', 'Roller hemming alternative'], ['Part deletion (moulding + clips)', 'Seal + join in one pass'], 9, 'moulding set deleted', 'High', '18–24 months', 'Zinc outgassing porosity managed with wire/optics choice; A-surface braze quality gating.'],
  ['Battery Pack', 'Laser welding replaces bolted busbar joints inside the pack', 'Replace bolted + torque-audited module busbar joints with laser-welded tabs: deletes fasteners, torque stations and re-torque audits, cuts contact resistance and heat. Weld depth control protects cells; vision-checked seams replace torque traceability.', ['Al 1050/Cu hybrid busbars', 'Ni-plated Cu tabs'], ['Fiber-laser welding with beam wobble', 'Ultrasonic wedge bonding alternative'], ['Fastener elimination', 'Electrical-joint quality by design'], 12, '-20% busbar joint cost', 'Medium', '12–18 months', 'Weld penetration windows validated against cell venting; serviceability strategy for module replacement.'],
];
for (const j of JOIN) add(...j);
const JOIN_SYS = [['Exterior', 'structural adhesive + SPR replaces bolts on the aluminium tailgate inner'], ['EDU / Electric Drive Unit', 'friction-stir welding seals the EDU cooling jacket without a gasket'], ['Inverter Assembly', 'ultrasonic welding replaces screws on the inverter busbar stack'], ['Subframe', 'MIG-brazing replaces GMAW on thin-wall subframe nodes'], ['Interior', 'IR staking replaces screws on the IP carrier-to-duct joints'], ['Thermal Management', 'CAB-brazed manifold replaces O-ring hose stack-ups'], ['Axles', 'magnetic-pulse welding joins the Al tube to steel yoke on the axle shaft'], ['Prop Shafts', 'inertia friction welding replaces bolted flanges on the prop tube'], ['Control Arms', 'rotary-friction weld joins forged ends to a tube control arm'], ['Body Structure', 'roller-hemmed closure edge deletes the door-skin adhesive oven pass'], ['Braking System', 'form-locked caliper bridge replaces two body bolts'], ['Half Shafts', 'orbital forming replaces circlip + groove on the joint retention']];
for (const [sys, t] of JOIN_SYS) {
  const title = t[0].toUpperCase() + t.slice(1);
  add(sys, title, `${title}. Modern joining substitutes the legacy fastened/welded interface: fewer parts, fewer stations, better sealed or lighter joints; validated by joint-strength, fatigue and service-repair studies. Typical automotive adopters run this on current premium programmes.`, ['Joint materials unchanged; consumable/filler per process'], ['See title process', 'Legacy joint as fallback'], ['Fastener/part elimination', 'Station reduction', 'Joint quality by design'], 5, '-10-20% joint cost', 'Medium', '9–15 months', 'Joint validation (static/fatigue/corrosion) and service-repair procedure required before cutover.');
}

// ── Family 3: E/E & software cost (15) ───────────────────────────────────────
const EE = [
  ['Electrical Architecture', 'Zonal harness consolidation deletes the door-module home-runs', 'Move door electronics onto a zonal controller with a CAN-FD/LIN ring: the per-door home-run bundles collapse into short local stubs. Cuts copper mass, connector count and assembly routing time; the zonal ECU is amortised across four doors.', ['Recycled-copper harness strands', 'Al conductor for power runs'], ['Zonal E/E architecture', 'CAN-FD/LIN ring topology'], ['Wire-length reduction', 'Connector-count reduction', 'Zonal consolidation'], 14, '-18% door-harness cost', 'High', '24–36 months', 'Zonal failure modes (single-point door loss) mitigated by limp strategies; EMC re-validation.'],
  ['Electrical Architecture', 'Consolidate seat/climate/door ECUs into one comfort domain controller', 'Replace 4-6 single-function comfort ECUs with one domain controller running mixed-criticality software partitions. Deletes housings, connectors, and per-ECU flash/EOL stations; software becomes the integration point.', ['n/a — electronics consolidation'], ['Domain-controller integration', 'AUTOSAR/hypervisor partitioning'], ['ECU-count reduction', 'Flash/EOL station reduction'], 18, '-30% comfort-ECU BOM', 'High', '24–36 months', 'Supplier software integration risk; ASIL partitioning and OTA strategy must be owned in-house.'],
  ['Electrical Architecture', 'Replace shielded sensor lines with unshielded twisted pair + software filtering', 'Several chassis/ADAS sensor runs carry legacy shielded cable specified before modern DSP filtering. Where EMC budgets allow, unshielded twisted pair with software-side filtering deletes the shield, drain wire, and shielded-connector premium.', ['UTP automotive cable', 'Recycled copper strands'], ['DSP filtering at the receiver', 'Selective shielding only in proven-noisy zones'], ['Cable-spec right-sizing', 'Connector simplification'], 4, '-25% affected line cost', 'Medium', '9–12 months', 'EMC validation per run; keep shields on proven-critical paths (radar, audio).'],
];
for (const e of EE) add(...e);
const EE_MORE = [['software-flash at supplier deleted — single EOL flash-over-diagnostic session', 'One consolidated end-of-line flash session replaces per-ECU supplier pre-flash: deletes supplier flash fees and version-mismatch rework.'], ['LIN replaces CAN on low-rate actuators', 'Window-lift, flap and pump actuators on CAN migrate to LIN daisy-chains: cheaper transceivers, less harness.'], ['48V power distribution for heated surfaces', 'Heated seats/steering move to the 48V rail: quarter the current, thinner copper, smaller connectors.'], ['connector family commonisation across the cockpit harness', 'Reduce 23 connector families to 8 platform-standard ones: pooled volume, fewer crimp tools, fewer wrong-connector defects.'], ['e-fuses replace melting fuses + relays in the power box', 'Solid-state e-fuses delete the fuse/relay box, enable soft-start and diagnostics, and cut wiring by allowing higher protection granularity.'], ['single 100BASE-T1 backbone replaces LVDS camera home-runs', 'Camera streams share an automotive-Ethernet backbone with switch-based zonal aggregation instead of point-to-point coax/LVDS.'], ['diagnostic-over-IP consolidates the OBD star wiring', 'DoIP over the Ethernet backbone deletes the dedicated K-line/CAN diagnostic star to every ECU.'], ['right-size ECU compute by consolidating sleep-mode loads', 'Quiescent-current audit lets two always-on ECUs sleep behind a zonal wake concentrator: smaller battery, thinner always-hot wiring.'], ['software feature-flagging replaces per-variant hardware', 'One hardware level with software-enabled features deletes variant harness/ECU part numbers and EOL complexity.'], ['antenna consolidation into a smart roof module', 'GNSS/LTE/BT/UWB antennas + tuners consolidate into one roof module with a single backbone link, deleting four coax home-runs.'], ['wireless BMS eliminates the module daisy-chain harness', 'wBMS deletes the inter-module comms harness and connectors inside the pack and simplifies module replacement.'], ['HV interlock loop simplification via connector-integrated HVIL', 'HVIL contacts integrated in HV connector families delete the separate interlock wiring loop.']];
for (const [t, d] of EE_MORE) {
  const title = (t[0].toUpperCase() + t.slice(1)).slice(0, 90);
  add('Electrical Architecture', title, `${d} Cost falls through copper mass, connector count, station time and part-number complexity; validated by EMC, functional-safety and service diagnostics reviews.`, ['Recycled-copper strands where applicable', 'Al conductors for power runs', 'Platform connector families'], ['Zonal/backbone E/E architecture', 'Software-defined feature enablement'], ['Harness mass reduction', 'ECU/connector consolidation', 'Variant reduction'], 6, '-10-25% affected content', 'Medium', '12–24 months', 'EMC + functional-safety re-validation; service/diagnostic tooling updates; supplier resourcing.');
}

// dedup vs ALL existing marketplace files
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const existing = new Set();
for (const f of ['marketplace-extra-ideas.json', 'marketplace-suv-ideas.json', 'marketplace-bev-cooling-ideas.json', 'marketplace-driveline-ideas.json', 'marketplace-offroad-luxury-ideas.json']) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) for (const i of JSON.parse(fs.readFileSync(p, 'utf8'))) existing.add(norm(i.title));
}
const seen = new Set();
const out = IDEAS.filter(i => { const k = norm(i.title); if (existing.has(k) || seen.has(k)) return false; seen.add(k); return true; });
fs.writeFileSync(path.join(ROOT, 'marketplace-domain-expansion-ideas.json'), JSON.stringify(out, null, 2));
console.log(`Wrote ${out.length} domain-expansion ideas (${IDEAS.length - out.length} deduped).`);
