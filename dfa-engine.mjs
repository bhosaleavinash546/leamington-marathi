// ─────────────────────────────────────────────────────────────────────────────
// Design for Assembly — geometry-fed, deterministic.
//
// Boothroyd's method asks three questions of every part, and the answers give a
// theoretical minimum part count against which the actual design is scored:
//
//   1. Does it MOVE relative to parts already assembled?
//   2. Must it be a DIFFERENT MATERIAL for a fundamental reason?
//   3. Must it be SEPARABLE for assembly or service?
//
// A part answering "no" to all three is a consolidation candidate. Those
// questions are about FUNCTION and INTENT, so geometry cannot answer them — but
// it can propose. Contact and instance data narrow the list, and the user
// confirms. Every unconfirmed row is flagged as such in the output and in the
// report; an assumed answer presented as a finding would be a fabrication with a
// number attached.
//
// What geometry CAN settle is the handling side: size, thickness, weight and
// measured alpha/beta symmetry all come from the solid (see
// cad-engine/assembly_decompose.py). That is the part incumbent tools still ask
// an engineer to type in by hand, one row per component.
// ─────────────────────────────────────────────────────────────────────────────
import { TIME_MODEL, partTime } from './dfa-time-model.mjs';

/** Density defaults, g/cm³, used only when the caller gives no material. */
const DEFAULT_DENSITY = 7.85;

const round2 = n => Math.round(n * 100) / 100;

/**
 * Geometry proposes an answer to each of the three questions, with its reason
 * and a confidence. It never asserts one. `proposed` is a suggestion for the
 * user to accept or reject; `confirmed` starts undefined and only the user
 * sets it.
 */
export function proposeNecessity(part, ctx = {}) {
  const contacts = ctx.contactCount ?? 0;
  const groupSize = ctx.groupSize ?? 1;
  const props = [];

  // Q1 — relative motion. Geometry cannot see motion at all. A body of
  // revolution touching exactly one neighbour is a weak hint (shafts, pins,
  // bushes look like this) and is offered as no more than that.
  const rotational = part.symmetry?.continuous === true;
  props.push({
    question: 'moves',
    proposed: null,
    confidence: 'none',
    reason: rotational && contacts === 1
      ? 'Body of revolution touching a single neighbour — could be a shaft, pin or bush. Geometry cannot tell motion from a press fit.'
      : 'Relative motion is not visible in a static solid model.',
  });

  // Q2 — different material. STEP carries no reliable material property, so this
  // is answerable only from the user's BOM.
  props.push({
    question: 'differentMaterial',
    proposed: null,
    confidence: 'none',
    reason: 'Material is not reliably present in the geometry; answer from the BOM.',
  });

  // Q3 — must be separable. Repeated small parts touching one larger part is the
  // classic fastener signature, and a fastener IS separable by definition.
  const fastenerish = groupSize >= 2 && rotational && (part.maxDimMm ?? 0) <= 80;
  props.push({
    question: 'mustSeparate',
    proposed: fastenerish ? true : null,
    confidence: fastenerish ? 'low' : 'none',
    reason: fastenerish
      ? `Repeated (${groupSize} off) small body of revolution — consistent with a fastener, which is separable by definition.`
      : 'Serviceability is a design decision, not a geometric property.',
  });

  return props;
}

/**
 * Fastener detection from geometry. Deliberately conservative: a suspected
 * fastener changes the theoretical minimum, so a false positive would understate
 * the part count the design actually needs.
 */
export function looksLikeFastener(part, groupSize = 1) {
  const rotational = part.symmetry?.continuous === true;
  const maxDim = Number(part.maxDimMm) || 0;
  const minDim = Number(part.minDimMm) || 0;
  const slender = minDim > 0 && maxDim / minDim >= 2;
  const small = maxDim <= 80;
  const repeated = groupSize >= 2;
  const score = [rotational, slender, small, repeated].filter(Boolean).length;
  return {
    isFastener: score >= 3,
    score,
    signals: { rotational, slender, small, repeated },
    confidence: score === 4 ? 'medium' : score === 3 ? 'low' : 'none',
    note: 'Geometric signature only. A dowel and a bolt look identical to a solid modeller; confirm against the BOM.',
  };
}

/**
 * Full DFA analysis.
 *
 * @param {object} decomposition  output of cad-engine/assembly_decompose.py
 * @param {object} opts
 *   - densityByIndex   {i: g/cm³} or a single `density`
 *   - answers          {i: {moves, differentMaterial, mustSeparate}} user-confirmed
 *   - securingByIndex  {i: 'screw'|'boltNut'|...}
 *   - insertionFlags   {i: {notSelfLocating, ...}}
 *   - labourRateEurPerHr
 *   - calibration      scale factor for the time model
 */
export function analyseDfa(decomposition, opts = {}) {
  if (!decomposition || decomposition.status !== 'success') {
    throw new Error('analyseDfa needs a successful assembly decomposition');
  }
  const model = opts.model || TIME_MODEL;
  const calibration = Number(opts.calibration) > 0 ? Number(opts.calibration) : 1;
  const answers = opts.answers || {};
  const groupOf = new Map();
  for (const g of decomposition.instanceGroups || []) {
    for (const i of g.partIndices) groupOf.set(i, g);
  }
  const contactCount = new Map();
  for (const [a, b] of decomposition.contacts || []) {
    contactCount.set(a, (contactCount.get(a) || 0) + 1);
    contactCount.set(b, (contactCount.get(b) || 0) + 1);
  }

  const rows = [];
  for (const p of decomposition.parts || []) {
    if (p.error) {
      rows.push({ index: p.index, name: p.name, error: p.error, skipped: true });
      continue;
    }
    const group = groupOf.get(p.index);
    const groupSize = group?.count ?? 1;
    const density = opts.densityByIndex?.[p.index] ?? opts.density ?? DEFAULT_DENSITY;
    const massKg = (p.volumeMm3 / 1000) * density / 1000;   // mm³→cm³→g→kg

    const part = {
      ...p,
      massKg,
      securing: opts.securingByIndex?.[p.index] || 'none',
      insertionFlags: opts.insertionFlags?.[p.index] || {},
    };
    const time = partTime(part, model, calibration);
    const fastener = looksLikeFastener(p, groupSize);
    const proposals = proposeNecessity(p, { contactCount: contactCount.get(p.index) || 0, groupSize });

    const a = answers[p.index] || {};
    const answered = ['moves', 'differentMaterial', 'mustSeparate']
      .filter(k => typeof a[k] === 'boolean');
    const necessary = answered.length
      ? (a.moves === true || a.differentMaterial === true || a.mustSeparate === true)
      : null;

    rows.push({
      index: p.index,
      name: p.name,
      groupSize,
      massKg: round2(massKg),
      maxDimMm: p.maxDimMm,
      minDimMm: p.minDimMm,
      symmetry: p.symmetry,
      contacts: contactCount.get(p.index) || 0,
      fastener,
      time,
      proposals,
      answers: a,
      // null means "nobody has answered the three questions for this part yet".
      // It is NOT the same as false, and the summary below keeps them apart.
      necessary,
      answeredCount: answered.length,
    });
  }

  const scored = rows.filter(r => !r.skipped);
  const totalParts = scored.reduce((s, r) => s + 1, 0);
  const totalTimeSec = round2(scored.reduce((s, r) => s + r.time.totalSec, 0));

  const confirmed = scored.filter(r => r.necessary !== null);
  const unconfirmed = scored.filter(r => r.necessary === null);
  const necessaryCount = confirmed.filter(r => r.necessary === true).length;
  const candidates = confirmed.filter(r => r.necessary === false)
    .map(r => ({ index: r.index, name: r.name, timeSec: r.time.totalSec }));

  // The index is only meaningful once the questions are answered. Reporting one
  // from proposals would be scoring the design against a guess.
  const complete = unconfirmed.length === 0 && totalParts > 0;
  // THE BASE PART ALWAYS COUNTS. Boothroyd's three questions are asked of a part
  // RELATIVE TO THOSE ALREADY ASSEMBLED, and the first part has nothing to be
  // assembled to — assembly has to start somewhere, so the base is necessary by
  // definition however its three answers come back.
  //
  // This was covered by a `Math.max(1, necessaryCount)` floor, which is right
  // only while NO other part is necessary. Found on a ten-part bracket where the
  // housing was marked a different material and the base was not: the count came
  // back 1 instead of 2, and the design efficiency it drives was therefore
  // reported at half its true value. The three-solid fixture could not show it —
  // there, the one necessary part WAS the base.
  const basePart = scored[0];
  const theoreticalMin = complete
    ? necessaryCount + (basePart && basePart.necessary === true ? 0 : 1)
    : null;
  const idealTimeSec = complete ? round2(theoreticalMin * model.idealPartSec) : null;
  const designEfficiencyPct = complete && totalTimeSec > 0
    ? Math.round((idealTimeSec / totalTimeSec) * 1000) / 10
    : null;

  const rate = Number(opts.labourRateEurPerHr);
  const assemblyCostEur = Number.isFinite(rate) && rate > 0
    ? round2((totalTimeSec / 3600) * rate)
    : null;

  return {
    engine: 'dfa-v1',
    timeModel: { version: model.version, basis: model.basis, calibration },
    totalParts,
    distinctPartTypes: decomposition.distinctPartTypes,
    totalAssemblyTimeSec: totalTimeSec,
    assemblyCostEur,
    labourRateEurPerHr: Number.isFinite(rate) ? rate : null,
    theoreticalMinParts: theoreticalMin,
    idealAssemblyTimeSec: idealTimeSec,
    designEfficiencyPct,
    consolidationCandidates: candidates,
    suspectedFasteners: scored.filter(r => r.fastener.isFastener)
      .map(r => ({ index: r.index, name: r.name, confidence: r.fastener.confidence })),
    rows,
    // The honesty block. A DFA index computed over unanswered parts would be a
    // number with nothing behind it, so it is withheld and the gap is named.
    completeness: {
      answered: confirmed.length,
      unanswered: unconfirmed.length,
      unansweredParts: unconfirmed.map(r => ({ index: r.index, name: r.name })),
      indexAvailable: complete,
      note: complete
        ? 'All three DFA questions answered for every part.'
        : `${unconfirmed.length} of ${totalParts} parts have unanswered DFA questions, so the theoretical minimum and design efficiency are withheld. Handling and insertion times below are geometric and stand on their own.`,
    },
  };
}
