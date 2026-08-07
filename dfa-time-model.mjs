// ─────────────────────────────────────────────────────────────────────────────
// BrainSpark manual assembly time model — handling and insertion.
//
// PROVENANCE, STATED PLAINLY. Boothroyd & Dewhurst's DFA method is public and
// well documented, and it is the method this follows: score each part on how
// hard it is to grasp and orient (handling), then on how hard it is to place and
// secure (insertion), sum to an assembly time, and compare against a theoretical
// minimum. Their TABLES, however, are copyrighted and licensed with their
// software, so none of the numbers below are theirs.
//
// This is our own model, built on the same MTM-derived structure the published
// method describes: a base grasp-and-move time, adjusted by the geometric
// factors that are known to drive it — size, thickness, weight and rotational
// symmetry — plus insertion penalties for the conditions that demonstrably slow
// an operator down. The coefficients are declared here as data, in one table, so
// they can be argued with and CALIBRATED against a plant's own line-balance data
// rather than believed.
//
// Because the coefficients are ours, the report must never present a time as an
// industry-standard figure. It is a consistent, transparent basis for COMPARING
// designs and for finding the parts worth deleting — which is what DFA is
// actually for. Absolute times should be calibrated before they are used in a
// labour-cost commitment, and `calibration` exists for exactly that.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Model coefficients. Every number here is a lever, not a law.
 * Times are seconds. Sources for the STRUCTURE are the published DFA method and
 * MTM; the VALUES are BrainSpark's own and are meant to be calibrated.
 */
export const TIME_MODEL = {
  version: 'brainspark-dfa-v1',
  basis: 'MTM-structured; BrainSpark coefficients; calibratable. NOT Boothroyd & Dewhurst tables.',

  // Reach, grasp and move a small, easily handled part with no orientation
  // difficulty. Everything else is an addition to this.
  baseHandlingSec: 1.13,

  // Orientation penalty as a function of measured alpha+beta symmetry.
  // A body of revolution (180) needs almost no orienting; a fully asymmetric
  // part (720) has to be looked at and turned.
  symmetry: [
    { maxTotalDeg: 180, addSec: 0.0 },
    { maxTotalDeg: 360, addSec: 0.5 },
    { maxTotalDeg: 540, addSec: 1.1 },
    { maxTotalDeg: 720, addSec: 1.6 },
    { maxTotalDeg: Infinity, addSec: 2.1 },
  ],

  // Very small parts need precision grasping; very large ones need two hands.
  size: [
    { maxDimMm: 6, addSec: 1.5, note: 'needs precision grasp or tweezers' },
    { maxDimMm: 15, addSec: 0.4, note: 'small but graspable' },
    { maxDimMm: 300, addSec: 0.0, note: 'comfortable one-hand size' },
    { maxDimMm: 600, addSec: 1.2, note: 'two hands' },
    { maxDimMm: Infinity, addSec: 3.0, note: 'two-person or hoist-assisted' },
  ],

  // Thin flat parts are hard to pick off a flat surface.
  thinPartMm: 2.0,
  thinPartAddSec: 0.7,

  // Weight slows the move. Linear above a threshold; below it, negligible.
  weightFreeKg: 1.0,
  weightSecPerKg: 0.45,
  // Above this a single operator should not lift at all — flagged, not just timed.
  twoPersonLiftKg: 15.0,
  hoistAddSec: 12.0,

  // ── Insertion ──
  baseInsertionSec: 1.5,
  insertion: {
    notSelfLocating: 1.4,       // no chamfer, spigot or feature to guide it
    holdingDownRequired: 2.0,   // must be held until the next part secures it
    restrictedAccess: 1.5,      // hand or tool access is obstructed
    obstructedVision: 1.2,      // the mating point cannot be seen
    resistanceToInsertion: 1.0, // press or interference fit
  },
  // Securing operations, per part.
  securing: {
    none: 0.0,
    snapFit: 0.9,
    screw: 5.0,                 // pick, engage, run down, torque
    boltNut: 8.5,
    rivet: 4.0,
    weldSpot: 3.5,
    adhesive: 6.0,
  },

  // Boothroyd's theoretical-minimum yardstick: an ideal part that needs no
  // orienting and drops into place. Used only as the denominator of the index.
  idealPartSec: 3.0,
};

const bandFor = (bands, key, value) => bands.find(b => value <= b[key]) ?? bands[bands.length - 1];

/**
 * Handling time for one part from its measured geometry.
 * Returns the time AND the reasons, so the report can show its working.
 */
export function handlingTime(part, model = TIME_MODEL) {
  const reasons = [];
  let t = model.baseHandlingSec;
  reasons.push({ factor: 'base grasp and move', sec: model.baseHandlingSec });

  const sym = part.symmetry || {};
  if (Number.isFinite(sym.totalDeg)) {
    const band = bandFor(model.symmetry, 'maxTotalDeg', sym.totalDeg);
    if (band.addSec) reasons.push({ factor: `orientation (α+β = ${sym.totalDeg}°)`, sec: band.addSec });
    t += band.addSec;
  } else {
    // No measured symmetry means no orientation penalty can be justified. Say
    // so rather than assuming the worst or the best.
    reasons.push({ factor: 'orientation', sec: 0, note: 'symmetry not measured — no penalty applied' });
  }

  const maxDim = Number(part.maxDimMm);
  if (Number.isFinite(maxDim)) {
    const band = bandFor(model.size, 'maxDimMm', maxDim);
    if (band.addSec) reasons.push({ factor: `size (${maxDim} mm — ${band.note})`, sec: band.addSec });
    t += band.addSec;
  }

  const minDim = Number(part.minDimMm);
  if (Number.isFinite(minDim) && minDim < model.thinPartMm) {
    reasons.push({ factor: `thin part (${minDim} mm)`, sec: model.thinPartAddSec });
    t += model.thinPartAddSec;
  }

  const kg = Number(part.massKg);
  let needsHoist = false;
  if (Number.isFinite(kg) && kg > model.weightFreeKg) {
    const add = (kg - model.weightFreeKg) * model.weightSecPerKg;
    reasons.push({ factor: `weight (${kg.toFixed(2)} kg)`, sec: Math.round(add * 100) / 100 });
    t += add;
    if (kg >= model.twoPersonLiftKg) {
      needsHoist = true;
      reasons.push({ factor: `over ${model.twoPersonLiftKg} kg — hoist or two-person lift`, sec: model.hoistAddSec });
      t += model.hoistAddSec;
    }
  }

  return { sec: Math.round(t * 100) / 100, reasons, needsHoist };
}

/**
 * Insertion time for one part. Difficulty flags are USER-CONFIRMABLE: geometry
 * can suggest some of them but cannot prove any, so an unset flag contributes
 * nothing and the report says which were assumed clear.
 */
export function insertionTime(part, model = TIME_MODEL) {
  const reasons = [];
  let t = model.baseInsertionSec;
  reasons.push({ factor: 'base insertion', sec: model.baseInsertionSec });

  const flags = part.insertionFlags || {};
  for (const [key, sec] of Object.entries(model.insertion)) {
    if (flags[key]) {
      reasons.push({ factor: key.replace(/([A-Z])/g, ' $1').toLowerCase(), sec });
      t += sec;
    }
  }

  const sec = model.securing[part.securing || 'none'] ?? 0;
  if (sec) {
    reasons.push({ factor: `securing: ${part.securing}`, sec });
    t += sec;
  }

  return { sec: Math.round(t * 100) / 100, reasons };
}

/** Full per-part time. `calibration` scales the model to a plant's own data. */
export function partTime(part, model = TIME_MODEL, calibration = 1) {
  const h = handlingTime(part, model);
  const i = insertionTime(part, model);
  const total = (h.sec + i.sec) * calibration;
  return {
    handlingSec: h.sec,
    insertionSec: i.sec,
    totalSec: Math.round(total * 100) / 100,
    needsHoist: h.needsHoist,
    handlingReasons: h.reasons,
    insertionReasons: i.reasons,
    calibration,
  };
}
