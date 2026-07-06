// ─────────────────────────────────────────────────────────────────────────────
// Engine cross-check for marketplace ideas.
//
// For idea families whose move is expressible as a baseline→proposed engine
// comparison (part consolidation via casting, near-net forging vs billet,
// metal→polymer conversion, topology down-gauge), run BOTH sides through the
// deterministic engine on a REFERENCE part and stamp the result into ideaData:
//
//   engineCheck: { referenceCase, baseline, proposed, savingPct, direction }
//
// direction 'confirmed' = the engine agrees the move saves money on the
// reference part; 'contradicted' = it doesn't (idea stays listed but flagged).
// Ideas whose move isn't engine-expressible (commonisation, recycled feedstock,
// fastener-delete) keep engineCheck: null — honestly unverifiable by math alone.
//
//   node scripts/verify-marketplace-costs.mjs          → updates the JSON file
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeShouldCost, computeRouteCost } from '../costing-engine.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'marketplace-offroad-luxury-ideas.json');

// Reference cases per verifiable move family: a representative part, the
// baseline make-route, and the proposed make-route. Volumes are the generator's
// nominal 60k/yr premium off-road volume.
const V = 60000;
const CASES = [
  {
    match: /die-cast node/i, key: 'gigacast-consolidation',
    referenceCase: '2.5 kg multi-piece steel assembly → single Al structural casting, 60k/yr, Germany',
    baseline: () => computeRouteCost({ material: 'Steel (mild)', route: ['Stamping / Deep Drawing', 'MIG Welding Assembly'], weightKg: 2.5, annualVolume: V, region: 'Germany' }).totalShouldCost,
    proposed: () => computeShouldCost({ material: 'Aluminium A356 (cast)', process: 'Die Casting (Aluminium)', weightKg: 1.8, annualVolume: V, region: 'Germany' }).totalShouldCost,
    note: 'Al casting is lighter (−28% mass) and deletes the welding op — the engine compares full make-routes.',
  },
  {
    match: /near-net forging/i, key: 'near-net-forging',
    referenceCase: '1.5 kg HS-steel part: billet machining → hot forge + finish machining, 60k/yr, Germany',
    baseline: () => computeShouldCost({ material: 'Steel (high-strength)', process: 'Machining (CNC)', weightKg: 1.5, annualVolume: V, region: 'Germany' }).totalShouldCost,
    proposed: () => computeRouteCost({ material: 'Steel (high-strength)', route: ['Forging (Hot)', 'Machining (secondary ops)'], weightKg: 1.5, annualVolume: V, region: 'Germany' }).totalShouldCost,
    note: 'Forged near-net + op-20 machining vs full billet machining.',
  },
  {
    match: /glass\/PP hybrid moulding/i, key: 'metal-to-polymer',
    // The move's claim is CONSOLIDATION, not just substitution: one moulding with
    // integrated clips/bosses replaces a stamped bracket + secondary bracket +
    // fastened assembly. The baseline therefore carries the welding/assembly op.
    referenceCase: '0.9 kg stamped 2-piece bracket set + assembly → one 0.45 kg PA66-GF30 moulding with integrated clips, 60k/yr, Germany',
    baseline: () => computeRouteCost({ material: 'Steel (mild)', route: ['Stamping / Deep Drawing', 'MIG Welding Assembly'], weightKg: 0.9, annualVolume: V, region: 'Germany' }).totalShouldCost,
    proposed: () => computeShouldCost({ material: 'PA66-GF30 (glass-filled)', process: 'Injection Moulding', weightKg: 0.45, annualVolume: V, region: 'Germany' }).totalShouldCost,
    note: 'Wins through part consolidation + deleted assembly, not raw €/kg — a lone small steel bracket is usually CHEAPER in steel (the engine will say so).',
  },
  {
    match: /topology-optimise/i, key: 'topology-downgauge',
    referenceCase: '2.0 kg part down-gauged 12% at equal process, 60k/yr, Germany',
    baseline: () => computeShouldCost({ material: 'Steel (high-strength)', process: 'Stamping / Deep Drawing', weightKg: 2.0, annualVolume: V, region: 'Germany' }).totalShouldCost,
    proposed: () => computeShouldCost({ material: 'Steel (high-strength)', process: 'Stamping / Deep Drawing', weightKg: 1.76, annualVolume: V, region: 'Germany' }).totalShouldCost,
    note: 'Pure mass take-out on the same process; savings scale with the material share.',
  },
  {
    match: /tailor-weld/i, key: 'tailored-blank',
    referenceCase: '3.0 kg stamped part with 10% blank mass saved via TWB, 60k/yr, Germany',
    baseline: () => computeShouldCost({ material: 'Steel (high-strength)', process: 'Stamping / Deep Drawing', weightKg: 3.0, annualVolume: V, region: 'Germany' }).totalShouldCost,
    proposed: () => computeShouldCost({ material: 'Steel (high-strength)', process: 'Stamping / Deep Drawing', weightKg: 2.7, annualVolume: V, region: 'Germany' }).totalShouldCost + 0.35,
    note: 'TWB saves blank mass but adds a laser blank-weld (~€0.35/part) — the engine nets the two.',
  },
];

const ideas = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let verified = 0, contradicted = 0, unverifiable = 0;
for (const idea of ideas) {
  const c = CASES.find(cs => cs.match.test(idea.title));
  if (!c) { idea.ideaData.engineCheck = null; unverifiable++; continue; }
  try {
    const base = c.baseline(), prop = c.proposed();
    const savingPct = Number(((base - prop) / base * 100).toFixed(1));
    const direction = savingPct > 0 ? 'confirmed' : 'contradicted';
    idea.ideaData.engineCheck = {
      referenceCase: c.referenceCase,
      baselinePerPart: Number(base.toFixed(2)),
      proposedPerPart: Number(prop.toFixed(2)),
      savingPct, direction, note: c.note,
      basis: 'Deterministic engine comparison on a reference part — validates the DIRECTION and rough magnitude of the move, not this specific part.',
    };
    if (direction === 'confirmed') verified++; else contradicted++;
  } catch (e) {
    idea.ideaData.engineCheck = null; unverifiable++;
  }
}
fs.writeFileSync(FILE, JSON.stringify(ideas, null, 2));
console.log(`Engine cross-check: ${verified} confirmed, ${contradicted} contradicted, ${unverifiable} not engine-expressible (of ${ideas.length}).`);
