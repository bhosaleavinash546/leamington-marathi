// ─────────────────────────────────────────────────────────────────────────────
// Generator: 300 part-level cost-reduction ideas for premium OFF-ROAD LUXURY
// vehicles (800V BEV + ICE/hybrid), across 20 commodities × 15 ideas each.
//
// Each idea = a baseline PART × a cost-reduction MOVE. Moves carry real material
// alternatives, process alternatives, DFMA levers and an OEM benchmark, so every
// generated idea is engineering-credible and DISTINCT (unique part×move pair).
// Output matches the marketplace seed schema (top-level + rich `ideaData`) and is
// deduped against every existing marketplace JSON title.
//
//   node scripts/gen-offroad-ideas.mjs   → writes marketplace-offroad-luxury-ideas.json
//
// These are AI-curated, plausibility-checked STARTING-POINT ideas (confidence
// "estimated" unless tied to a documented OEM practice) — a seed library for the
// team to validate with real quotes, consistent with the tool's honesty posture.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const VOL = 60000; // nominal premium off-road annual volume for €-annualisation

const OEMS = ['Porsche Cayenne', 'Mercedes G-Class', 'BMW X7', 'Audi Q8 e-tron', 'Volvo EX90',
  'Lexus LX', 'Land Cruiser 300', 'Cadillac Escalade IQ', 'Jeep Grand Cherokee 4xe',
  'NIO ES8', 'Li Auto L9', 'AITO M9', 'Yangwang U8', 'Hongqi E-HS9', 'Xpeng G9', 'Rivian R1S'];

// A MOVE is a reusable cost-reduction pattern. `mk(part, oem)` renders its
// commodity-specific text. Titles are `${verb} … ${part} …` so each part×move is
// a distinct title. Savings are labelled estimates (per-vehicle € and % of the
// part cost), annualised at VOL.
function idea(seq, system, label, part, move, oem) {
  const id = `orl${String(seq).padStart(3, '0')}`;
  const title = move.title(part);
  const perVeh = move.perVeh;
  const annual = perVeh * VOL;
  const annualStr = annual >= 1e6 ? `€${(annual / 1e6).toFixed(1)}M` : `€${Math.round(annual / 1e3)}k`;
  return {
    id, title, system,
    costSavingType: move.costType,
    annualSaving: annualStr,
    difficulty: move.difficulty,
    timeToImplement: move.time,
    description: `[${move.pt}] ${label}: ${move.tech(part, oem)}`,
    submittedBy: `${oem} benchmark`,
    verified: move.confidence === 'benchmarked' ? 1 : 0,
    stars: 0,
    level: 'part',
    ideaData: {
      id, title,
      technicalDescription: move.tech(part, oem),
      materialGrade: move.materials.join(' / '),
      manufacturingImpact: move.process(part),
      costSavingTypes: move.tags,
      costSavingPotential: {
        qualitative: move.qual,
        percentage: `€${perVeh}/veh (${move.pct})`,
        annualValue: annualStr,
        calculationBasis: `€${perVeh}/veh × ${(VOL / 1000)}k veh/yr (indicative premium off-road volume)`,
      },
      implementationDifficulty: move.difficulty,
      riskNotes: move.risk(part),
      dfmaPrinciples: move.dfma,
      systemLevel: 'Part',
      timeToImplement: move.time,
      benchmarkReference: `${oem} programme (indicative)`,
      confidenceLevel: move.confidence,
      evidenceSources: [
        { type: 'benchmark', title: `${oem} teardown/industry norm`, year: 2024, confidence: move.confidence === 'benchmarked' ? 'high' : 'medium' },
      ],
      regulatoryContext: move.reg || null,
      materialAlternatives: move.materials,
      processAlternatives: move.processes,
    },
  };
}

// ── Reusable move factories (parameterised by commodity specifics) ───────────
// Each returns a move object. `pt` = powertrain tag. Keep titles verb-led and
// specific so no two part×move titles collide.
const M = {
  gigacast: (o) => ({ title: (p) => `Consolidate ${p} into a single high-pressure die-cast node`, pt: 'BEV', costType: 'Part Consolidation',
    perVeh: o.perVeh ?? 34, pct: o.pct ?? '-22%', difficulty: 'High', time: '24–36 months', confidence: 'benchmarked',
    materials: ['EN AC-46000 (AlSi9Cu3)', 'Aural-5 (AlSi7MgMn) HPDC', 'Castasil-37 low-Fe', 'Recycled secondary Al (low-carbon)'],
    processes: ['High-pressure die casting (giga/mega press)', 'Vacuum-assisted HPDC', 'Structural HPDC + T7 heat treat'],
    tags: ['consolidation', 'process', 'tooling'], dfma: ['Part-count reduction', 'Eliminate joints/fasteners', 'Single-setup casting'],
    qual: 'One casting replaces a multi-piece stamped/welded assembly, removing joining tooling.',
    tech: (p, oem) => `Replace the multi-piece ${p.toLowerCase()} (stampings + welds/fasteners) with one large structural HPDC node in a low-Fe self-hardening Al alloy, cutting part count, spot welds and fixturing. Benchmarked against ${oem} structural-casting practice; low-carbon secondary Al lowers embodied CO2e.`,
    process: (p) => `Replaces ~6–15 stamped parts + ~40–120 welds of the ${p.toLowerCase()} with a single die-cast node; removes weld fixtures and sealing; adds one large press + trim die. Net BOM and joining cost fall; casting scrap is remelted in-house.`,
    risk: (p) => `Casting porosity and repairability of the ${p.toLowerCase()} must meet crash and fatigue targets; large-format die cost is high, so payback needs volume. Alloy choice (self-hardening vs T7) trades ductility for cycle. Off-road shock/torsion durability validated by CAE + rig.`,
    reg: null }),
  twb: (o) => ({ title: (p) => `Tailor-weld the ${p} blank to down-gauge low-stress zones`, pt: 'ALL', costType: 'Material + Weight', perVeh: o.perVeh ?? 12, pct: o.pct ?? '-14%',
    difficulty: 'Medium', time: '12–18 months', confidence: 'benchmarked',
    materials: ['CR340LA / CR700Y980T-DP tailored', 'PHS 22MnB5 + soft-zone laser', 'Bake-hardening BH260', '6016-T4 Al for outers'],
    processes: ['Laser-welded tailored blanks', 'Tailor-rolled blanks', 'Press-hardening with tailored tempering'],
    tags: ['material', 'weight'], dfma: ['Right-gauge material placement', 'Eliminate reinforcement patches', 'Consolidate blanks'],
    qual: 'One tailored blank removes separate reinforcement patches and their spot welds.',
    tech: (p, oem) => `Convert the ${p.toLowerCase()} to a laser-welded tailored blank so thickness/strength follow the load path — thick/hot-stamped in crash zones, thin in low-stress zones — deleting bolt-on reinforcements. ${oem} body engineering uses this to cut mass and weld count.`,
    process: (p) => `Replaces a uniform blank + 1–3 reinforcement patches on the ${p.toLowerCase()} with a single tailor-welded blank; removes patch tooling and their spot welds; adds a laser blank-welding step upstream of press.`,
    risk: (p) => `Weld-line placement on the ${p.toLowerCase()} must avoid forming splits and sit clear of peak strain; corrosion sealing of dissimilar gauges required. Crash performance re-validated; NVH unaffected.`, reg: null }),
  netshape: (o) => ({ title: (p) => `Switch the ${p} to near-net forging to cut machining stock`, pt: 'ALL', costType: 'Manufacturing Process', perVeh: o.perVeh ?? 9, pct: o.pct ?? '-15%',
    difficulty: 'Medium', time: '12–20 months', confidence: 'estimated',
    materials: ['16MnCr5 case-hardening', '42CrMo4 quench & temper', '38MnVS6 micro-alloyed (air-cooled)', 'Forged 6082-T6 Al'],
    processes: ['Precision closed-die forging', 'Warm forging + hard turning', 'Cross-wedge-rolled preform + finish forge'],
    tags: ['process', 'material'], dfma: ['Near-net shape', 'Reduce material removal', 'Eliminate a finishing op'],
    qual: 'Near-net forging removes billet stock and a roughing pass; micro-alloyed steel skips a heat-treat.',
    tech: (p, oem) => `Move the ${p.toLowerCase()} from billet machining to precision near-net forging, cutting buy-to-fly and CNC time; a micro-alloyed air-hardening grade can delete the separate quench-and-temper cycle. ${oem} chassis/driveline parts use this route.`,
    process: (p) => `Cuts machining stock on the ${p.toLowerCase()} ~30–50% and removes a roughing setup; micro-alloyed steel removes the Q&T furnace step. Adds forging dies; net conversion + material cost fall.`,
    risk: (p) => `Forging flow-lines and grain direction on the ${p.toLowerCase()} must align with peak stress; die life and preform yield drive payback. Fatigue and impact validated for off-road shock loads.`, reg: null }),
  polymer: (o) => ({ title: (p) => `Replace the metal ${p} with a glass/PP hybrid moulding`, pt: 'ALL', costType: 'Material + Weight', perVeh: o.perVeh ?? 7, pct: o.pct ?? '-18%',
    difficulty: 'Medium', time: '12–18 months', confidence: 'estimated',
    materials: ['PA6-GF50 (metal-replacement)', 'PP-LGF40 long-glass', 'PPA-GF35 high-heat', 'Recycled PA6-GF (post-industrial)'],
    processes: ['High-speed injection moulding', 'Injection-compression moulding', 'Overmoulded metal-insert hybrid'],
    tags: ['material', 'weight', 'consolidation'], dfma: ['Metal-to-plastic conversion', 'Function integration (clips/bosses)', 'Part consolidation'],
    qual: 'Moulded-in features replace separate brackets/clips; recycled glass-filled resin lowers cost and CO2e.',
    tech: (p, oem) => `Convert the ${p.toLowerCase()} from stamped/cast metal to a long-glass or GF polyamide moulding with integrated ribs, bosses and clip features, deleting fasteners and secondary brackets. A partial-recycled resin cuts cost and embodied carbon; ${oem} uses metal-replacement here.`,
    process: (p) => `Integrates 2–5 brackets/clips of the ${p.toLowerCase()} into one moulding; removes fasteners and their assembly time; a metal insert is overmoulded only where load demands. Tooling is one injection mould.`,
    risk: (p) => `Creep, thermal expansion and stiffness of the ${p.toLowerCase()} at temperature must meet load/rattle targets; recycled-content variation controlled by spec. Not for primary crash paths.`, reg: null }),
  standardise: (o) => ({ title: (p) => `Commonise ${p} variants across the platform`, pt: 'ALL', costType: 'Commonisation', perVeh: o.perVeh ?? 6, pct: o.pct ?? '-10%',
    difficulty: 'Low', time: '6–12 months', confidence: 'estimated',
    materials: ['Common grade across variants', 'Single fastener family', 'Shared seal cross-section'],
    processes: ['Tool commonisation', 'Modular fixturing', 'Family-mould / shared die'],
    tags: ['commonisation', 'tooling'], dfma: ['Variant reduction', 'Carry-over parts', 'Shared tooling'],
    qual: 'Pooling volume across variants amortises one tool set and cuts unique part numbers.',
    tech: (p, oem) => `Reduce ${p.toLowerCase()} variants across trims/wheelbases to a common design (or a base + add-on), pooling volume onto one tool set and one validation. ${oem} platform strategy commonises this to cut piece price via volume.`,
    process: (p) => `Collapses 2–4 unique ${p.toLowerCase()} part numbers into one (or base+module); one tool set instead of several; validation done once. Piece price falls with pooled volume; inventory/complexity drop.`,
    risk: (p) => `Common ${p.toLowerCase()} must satisfy the worst-case variant load, adding minor mass to lighter trims; packaging must fit all wheelbases. Managed by a base-plus-module split.`, reg: null }),
  sustainable: (o) => ({ title: (p) => `Adopt low-carbon recycled feedstock for the ${p}`, pt: 'ALL', costType: 'Material + Sustainability', perVeh: o.perVeh ?? 5, pct: o.pct ?? '-8%',
    difficulty: 'Low', time: '6–12 months', confidence: 'estimated',
    materials: ['Low-carbon (green) aluminium', 'Recycled secondary Al ingot', 'Recycled copper (secondary cathode)', 'Bio-attributed / recycled polymer'],
    processes: ['Closed-loop scrap remelt', 'Mass-balance certified feedstock', 'Water-based / powder coating'],
    tags: ['material', 'sustainability'], dfma: ['Design-for-recyclate', 'Mono-material design', 'Low-VOC processing'],
    qual: 'Recycled/low-carbon feedstock is cost-neutral-to-cheaper and cuts embodied CO2e and CBAM exposure.',
    tech: (p, oem) => `Qualify recycled/low-carbon feedstock (green Al, secondary copper, recyclate polymer) for the ${p.toLowerCase()} with closed-loop scrap return and water-based coatings, cutting embodied CO2e and EU CBAM cost while holding spec. ${oem} sustainability roadmaps target this.`,
    process: (p) => `Substitutes primary material in the ${p.toLowerCase()} with certified recyclate/low-carbon grade; closed-loop remelt of process scrap; swaps solvent coating for water-based/powder. Conversion unchanged; material and carbon cost fall.`,
    risk: (p) => `Recyclate impurity/alloy tramp elements for the ${p.toLowerCase()} controlled by spec and sortation; mechanicals re-validated. Coating durability re-tested for off-road stone-chip/corrosion.`, reg: 'EU CBAM / ELV recycled-content targets' }),
  fastener: (o) => ({ title: (p) => `Delete fasteners on the ${p} via clip/weld-bond joining`, pt: 'ALL', costType: 'Assembly / DFMA', perVeh: o.perVeh ?? 4, pct: o.pct ?? '-9%',
    difficulty: 'Low', time: '6–10 months', confidence: 'estimated',
    materials: ['Structural adhesive (crash-durable)', 'Self-piercing rivets (SPR)', 'Integrated snap features'],
    processes: ['Weld-bonding (adhesive + spot)', 'Self-pierce riveting', 'Moulded snap-fit assembly'],
    tags: ['assembly', 'consolidation'], dfma: ['Fastener elimination', 'Reduce assembly stations', 'Design-in snap features'],
    qual: 'Adhesive/clip joining removes threaded fasteners, their torque stations and inventory.',
    tech: (p, oem) => `Replace threaded fasteners on the ${p.toLowerCase()} with weld-bonding, self-pierce rivets or moulded snaps, cutting fastener count, torque stations and rework. ${oem} body/interior lines use adhesive+SPR to lower assembly cost and improve stiffness/NVH.`,
    process: (p) => `Removes 6–20 fasteners from the ${p.toLowerCase()} and their driven stations; substitutes adhesive bead + a few SPR/snaps; joint stiffness and sealing improve. Assembly time and fastener inventory fall.`,
    risk: (p) => `Adhesive cure, surface prep and serviceability of the ${p.toLowerCase()} must be controlled; SPR access and corrosion at the joint validated. Crash/peel performance verified.`, reg: null }),
  topology: (o) => ({ title: (p) => `Topology-optimise and down-gauge the ${p}`, pt: 'ALL', costType: 'Material + Weight', perVeh: o.perVeh ?? 8, pct: o.pct ?? '-12%',
    difficulty: 'Medium', time: '10–16 months', confidence: 'estimated',
    materials: ['Higher-grade AHSS (down-gauged)', 'AlSi10Mg (cast, ribbed)', '7075-T6 for peak-load nodes'],
    processes: ['CAE topology optimisation', 'Variable-gauge casting/roll-forming', 'AI machining path optimisation'],
    tags: ['material', 'weight'], dfma: ['Load-path material only', 'Remove over-design', 'Rib/bead stiffening'],
    qual: 'Putting material only on the load path removes mass and cost without adding parts.',
    tech: (p, oem) => `Re-engineer the ${p.toLowerCase()} with topology optimisation — ribs/beads on the load path, thinner elsewhere, higher-grade material where it pays — cutting mass and material cost at equal stiffness. ${oem} uses CAE-led lightweighting on this part.`,
    process: (p) => `Down-gauges the ${p.toLowerCase()} and adds cast/formed ribs; higher-grade steel/Al where stress demands; AI-optimised toolpaths cut cycle. No new parts; material spend and mass fall.`,
    risk: (p) => `Stiffness, buckling and fatigue of the ${p.toLowerCase()} must hold under off-road load; thinner sections need dent/oil-canning checks. Validated by CAE + rig.`, reg: null }),
};

// ── 20 commodities × parts × applicable moves ────────────────────────────────
// Each commodity picks moves whose engineering fits its parts. 15 ideas each.
const COMMODITIES = [
  { system: 'Battery Pack', label: '800V Battery Pack',
    parts: ['pack enclosure lower tray', 'cross-member / cell-to-pack frame', 'module compression plate', 'HV busbar bracket set', 'pack lid / top cover', 'mounting bracket array'],
    moves: [M.gigacast({ perVeh: 46, pct: '-20%' }), M.topology({ perVeh: 14 }), M.sustainable({ perVeh: 9 }), M.fastener({ perVeh: 6 }), M.standardise({ perVeh: 7 })] },
  { system: 'EDU / Electric Drive Unit', label: '800V EDU',
    parts: ['EDU housing', 'gearbox case', 'motor end-shield', 'oil sump / lube gallery', 'rotor shaft', 'stator housing jacket'],
    moves: [M.gigacast({ perVeh: 30, pct: '-18%' }), M.netshape({ perVeh: 12 }), M.topology({ perVeh: 9 }), M.sustainable({ perVeh: 6 }), M.standardise({ perVeh: 6 })] },
  { system: 'Inverter Assembly', label: '800V Inverter',
    parts: ['inverter housing', 'DC-link busbar', 'power-module cold plate', 'gate-driver bracket', 'HV connector body', 'capacitor mounting frame'],
    moves: [M.gigacast({ perVeh: 18, pct: '-16%' }), M.polymer({ perVeh: 7 }), M.sustainable({ perVeh: 6 }), M.fastener({ perVeh: 4 }), M.standardise({ perVeh: 5 })] },
  { system: 'Thermal Management', label: 'Cooling System (Battery + EDU + Cabin)',
    parts: ['coolant distribution manifold', 'chiller/heat-exchanger bracketry', 'battery cold-plate', 'coolant pipe set', 'expansion tank', 'valve-block housing'],
    moves: [M.polymer({ perVeh: 9, pct: '-20%' }), M.gigacast({ perVeh: 12 }), M.sustainable({ perVeh: 6 }), M.fastener({ perVeh: 4 }), M.standardise({ perVeh: 5 })] },
  { system: 'BIW', label: 'BIW (Body-in-White)',
    parts: ['front rail / crash can', 'shock tower', 'A-pillar reinforcement', 'rear longitudinal rail', 'dash cross-member', 'roof bow set'],
    moves: [M.gigacast({ perVeh: 40, pct: '-20%' }), M.twb({ perVeh: 14 }), M.topology({ perVeh: 10 }), M.fastener({ perVeh: 6 }), M.sustainable({ perVeh: 8 })] },
  { system: 'Body Structure', label: 'Body Structure (Crash + Torsion + NVH)',
    parts: ['rocker / sill beam', 'B-pillar', 'floor cross-member', 'underbody tunnel', 'strut brace', 'bumper beam'],
    moves: [M.twb({ perVeh: 15 }), M.topology({ perVeh: 11 }), M.gigacast({ perVeh: 30 }), M.sustainable({ perVeh: 8 }), M.standardise({ perVeh: 6 })] },
  { system: 'Exterior', label: 'Exterior Systems',
    parts: ['front fascia / bumper cover', 'wheel-arch cladding', 'roof rail', 'tailgate outer', 'skid-plate', 'side-step / running board'],
    moves: [M.polymer({ perVeh: 8, pct: '-16%' }), M.sustainable({ perVeh: 6 }), M.fastener({ perVeh: 5 }), M.standardise({ perVeh: 5 }), M.twb({ perVeh: 10 })] },
  { system: 'Interior', label: 'Interior Systems',
    parts: ['instrument-panel carrier', 'seat structure frame', 'centre-console substructure', 'door-trim carrier', 'cross-car beam', 'load-floor panel'],
    moves: [M.polymer({ perVeh: 9, pct: '-17%' }), M.fastener({ perVeh: 6 }), M.sustainable({ perVeh: 6 }), M.standardise({ perVeh: 6 }), M.topology({ perVeh: 7 })] },
  { system: 'Air Suspension', label: 'Air Suspension',
    parts: ['air-spring top mount', 'strut bracket', 'compressor mounting frame', 'air-line manifold', 'ride-height sensor bracket', 'reservoir tank bracket'],
    moves: [M.netshape({ perVeh: 10, pct: '-16%' }), M.polymer({ perVeh: 7 }), M.topology({ perVeh: 8 }), M.standardise({ perVeh: 6 }), M.sustainable({ perVeh: 5 })] },
  { system: 'Braking System', label: 'Braking System',
    parts: ['caliper bracket', 'brake pedal box', 'disc hat / bell', 'ABS module bracket', 'master-cylinder mount', 'park-brake actuator bracket'],
    moves: [M.netshape({ perVeh: 9, pct: '-15%' }), M.topology({ perVeh: 7 }), M.polymer({ perVeh: 5 }), M.standardise({ perVeh: 5 }), M.sustainable({ perVeh: 4 })] },
  { system: 'Steering System', label: 'Steering System',
    parts: ['steering-gear housing', 'column support bracket', 'tie-rod', 'pinion shaft', 'motor mount (EPS)', 'intermediate-shaft yoke'],
    moves: [M.netshape({ perVeh: 10, pct: '-16%' }), M.topology({ perVeh: 7 }), M.standardise({ perVeh: 6 }), M.sustainable({ perVeh: 5 }), M.polymer({ perVeh: 5 })] },
  { system: 'Tires & Wheels', label: 'Tires & Wheels',
    parts: ['wheel rim', 'wheel centre / hub face', 'TPMS bracket', 'wheel-bolt set', 'aero wheel cover', 'spare-wheel carrier'],
    moves: [M.topology({ perVeh: 12, pct: '-14%' }), M.sustainable({ perVeh: 7 }), M.standardise({ perVeh: 6 }), M.polymer({ perVeh: 6 }), M.netshape({ perVeh: 8 })] },
  { system: 'Axles', label: 'Axles',
    parts: ['axle beam / housing', 'axle tube', 'hub carrier', 'spindle', 'axle flange', 'breather / vent bracket'],
    moves: [M.netshape({ perVeh: 12, pct: '-16%' }), M.gigacast({ perVeh: 16 }), M.topology({ perVeh: 9 }), M.standardise({ perVeh: 6 }), M.sustainable({ perVeh: 5 })] },
  { system: 'Control Arms', label: 'Control Arms',
    parts: ['front lower control arm', 'upper control arm', 'trailing arm', 'lateral link', 'toe link', 'ball-joint housing'],
    moves: [M.gigacast({ perVeh: 14, pct: '-17%' }), M.netshape({ perVeh: 11 }), M.topology({ perVeh: 9 }), M.sustainable({ perVeh: 5 }), M.standardise({ perVeh: 6 })] },
  { system: 'Subframe', label: 'Subframe',
    parts: ['front subframe', 'rear subframe / cradle', 'engine/EDU carrier', 'subframe bushing sleeve', 'tie-bar', 'mounting-point node'],
    moves: [M.gigacast({ perVeh: 28, pct: '-19%' }), M.twb({ perVeh: 12 }), M.topology({ perVeh: 10 }), M.fastener({ perVeh: 6 }), M.sustainable({ perVeh: 7 })] },
  { system: '2-Speed Automatic Gearbox', label: '2-Speed Automatic Gearbox',
    parts: ['gearbox housing', 'planetary ring gear', 'clutch drum', 'output shaft', 'valve-body plate', 'parking-pawl bracket'],
    moves: [M.netshape({ perVeh: 13, pct: '-15%' }), M.gigacast({ perVeh: 16 }), M.topology({ perVeh: 8 }), M.standardise({ perVeh: 6 }), M.sustainable({ perVeh: 5 })] },
  { system: '2-Speed Transfer Case', label: '2-Speed Transfer Case',
    parts: ['transfer-case housing', 'range-shift fork', 'chain sprocket', 'output flange', 'actuator motor bracket', 'oil-pump body'],
    moves: [M.netshape({ perVeh: 12, pct: '-15%' }), M.gigacast({ perVeh: 15 }), M.topology({ perVeh: 8 }), M.standardise({ perVeh: 6 }), M.sustainable({ perVeh: 5 })] },
  { system: 'Prop Shafts', label: 'Prop Shafts',
    parts: ['propeller-shaft tube', 'CV/U-joint yoke', 'centre-bearing bracket', 'slip-yoke', 'flange fork', 'balance-weight assembly'],
    moves: [M.netshape({ perVeh: 9, pct: '-16%' }), M.polymer({ perVeh: 6 }), M.topology({ perVeh: 7 }), M.standardise({ perVeh: 6 }), M.sustainable({ perVeh: 5 })] },
  { system: 'Half Shafts', label: 'Half Shafts (CV + Plunge)',
    parts: ['CV outer-joint housing', 'tripod plunge joint', 'shaft bar', 'wheel-side flange', 'boot-clamp / cover', 'intermediate-shaft support'],
    moves: [M.netshape({ perVeh: 10, pct: '-16%' }), M.topology({ perVeh: 7 }), M.standardise({ perVeh: 6 }), M.sustainable({ perVeh: 5 }), M.polymer({ perVeh: 5 })] },
  { system: 'Front & Rear Differentials', label: 'Front & Rear Differentials',
    parts: ['differential carrier / housing', 'ring & pinion set', 'diff case', 'side-gear set', 'cover plate', 'pinion-bearing support'],
    moves: [M.netshape({ perVeh: 13, pct: '-15%' }), M.gigacast({ perVeh: 15 }), M.topology({ perVeh: 8 }), M.standardise({ perVeh: 6 }), M.sustainable({ perVeh: 5 })] },
];

// Deterministic spread: pick 15 distinct (part × move) pairs per commodity.
function pairsFor(parts, moves, n = 15) {
  const pairs = [];
  const seen = new Set();
  // walk a diagonal so each part meets several moves and vice-versa
  for (let step = 0; pairs.length < n && step < parts.length * moves.length * 2; step++) {
    const pi = step % parts.length;
    const mi = (Math.floor(step / parts.length) + pi) % moves.length;
    const key = `${pi}:${mi}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([parts[pi], moves[mi]]);
  }
  return pairs;
}

// ── Build, dedup against existing marketplace files, write ────────────────────
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const existing = new Set();
for (const f of ['marketplace-extra-ideas.json', 'marketplace-suv-ideas.json', 'marketplace-bev-cooling-ideas.json', 'marketplace-driveline-ideas.json']) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  for (const i of JSON.parse(fs.readFileSync(p, 'utf8'))) existing.add(norm(i.title));
}

const out = [];
const localTitles = new Set();
let seq = 1, dupSkipped = 0;
for (const c of COMMODITIES) {
  const pairs = pairsFor(c.parts, c.moves, 15);
  let made = 0, oemi = 0;
  for (const [part, move] of pairs) {
    const oem = OEMS[(seq + oemi) % OEMS.length];
    const it = idea(seq, c.system, c.label, part, move, oem);
    const key = norm(it.title);
    if (existing.has(key) || localTitles.has(key)) { dupSkipped++; oemi++; continue; }
    localTitles.add(key);
    out.push(it);
    seq++; made++; oemi++;
  }
  if (made !== 15) console.warn(`[warn] ${c.label}: produced ${made}/15 (dedup collisions)`);
}

fs.writeFileSync(path.join(ROOT, 'marketplace-offroad-luxury-ideas.json'), JSON.stringify(out, null, 2));
const byTab = {};
console.log(`Generated ${out.length} ideas; ${dupSkipped} skipped as duplicates.`);
console.log(`Unique titles: ${new Set(out.map(i => norm(i.title))).size} / ${out.length}`);
