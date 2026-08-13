// ─────────────────────────────────────────────────────────────────────────────
// TRIZ TRIMMING — the subtraction tool.
//
// Every other method in this product asks "what could we change?". Trimming
// asks the harder question: "what could we DELETE, and who picks up its job?"
// Engineers default to addition and substitution; trimming is the discipline
// that removes a component and REDISTRIBUTES its useful function to something
// already present. Published applications report component-count reductions
// around 83% and component-cost reductions around 95% — it is the TRIZ tool
// with the strongest cost record, and it was the one this product lacked.
//
// ── THE THREE CLASSICAL RULES ────────────────────────────────────────────────
// A function is "carrier acts on object". Given that, a carrier can be trimmed
// if any of these holds:
//
//   A  the OBJECT of the function is itself removed — with nothing to act on,
//      the carrier has no reason to exist. The most radical rule: it deletes
//      two components, not one.
//   B  the OBJECT can perform the function ITSELF — the carrier was only ever
//      enabling something the object could do unaided.
//   C  ANOTHER component, in the system or its supersystem, can perform the
//      function — the job survives, the component does not.
//
// ── WHAT THIS MODULE DOES AND DELIBERATELY DOES NOT DO ───────────────────────
// It decides which rules are AVAILABLE and what money is released. It does not
// decide whether a rule is right — that is an engineering judgement about a
// specific part, and the honest place for it is a human or (narrowly prompted)
// an LLM answering the exact question the rule poses. So each candidate carries
// its question in the classical form, ready to be asked.
//
// Relationship to `dfaScore` in innovation.mjs — they look alike and are not.
// DFA (Boothroyd) asks whether a part must exist for ASSEMBLY reasons: does it
// move, must it be a different material, must it come apart. Trimming asks
// whether a FUNCTION CARRIER must exist at all, given who else could carry the
// function. A part can be theoretically necessary under DFA and still trimmable
// under Rule C, and vice versa. Run both; they disagree usefully.
// ─────────────────────────────────────────────────────────────────────────────

const round = (x, dp = 2) => Number(Number(x).toFixed(dp));

/** Function ranks, in the classical set. `useful` is the only rank whose
 *  removal needs the function redistributed — the others are pure gain. */
export const FUNCTION_RANKS = ['useful', 'harmful', 'excessive', 'insufficient'];

export const TRIMMING_RULES = {
  A: {
    id: 'A',
    name: 'The object goes too',
    question: (f) => `Can "${f.object}" be removed from the system entirely? If it can, "${f.carrier}" has nothing left to act on.`,
    rationale: 'Trims the function carrier because the object of its function is itself removed — deletes two components, not one.',
  },
  B: {
    id: 'B',
    name: 'The object does it itself',
    question: (f) => `Can "${f.object}" ${f.function} by itself, without "${f.carrier}"?`,
    rationale: 'Trims the carrier because the object can perform the function unaided — the carrier was only enabling it.',
  },
  C: {
    id: 'C',
    name: 'Something already there does it',
    question: (f) => `Which other component — in the system or around it — could ${f.function} instead of "${f.carrier}"?`,
    rationale: 'Trims the carrier because another existing component, in the system or supersystem, can perform the useful function.',
  },
};

/**
 * Validate a function model on the way in.
 *
 * Thrown, never silently scored. A malformed model that scores anyway produces
 * a confident-looking trimming list built on nothing, which is the single worst
 * outcome for a tool whose whole output is "delete this part".
 *
 * @param {Array<{carrier,function,object,rank?}>} functions
 * @returns {Array} the normalised model
 */
export function validateFunctionModel(functions) {
  if (!Array.isArray(functions) || functions.length === 0) {
    throw new Error('function model must be a non-empty array of { carrier, function, object }');
  }
  return functions.map((f, i) => {
    const carrier = String(f?.carrier ?? '').trim();
    const fn = String(f?.function ?? '').trim();
    const object = String(f?.object ?? '').trim();
    if (!carrier) throw new Error(`function ${i + 1}: carrier is required`);
    if (!fn) throw new Error(`function ${i + 1} ("${carrier}"): function is required`);
    if (!object) throw new Error(`function ${i + 1} ("${carrier}"): object is required`);
    if (carrier.toLowerCase() === object.toLowerCase()) {
      throw new Error(`function ${i + 1}: "${carrier}" cannot be both the carrier and the object`);
    }
    const rank = FUNCTION_RANKS.includes(f?.rank) ? f.rank : 'useful';
    return { carrier: carrier.slice(0, 80), function: fn.slice(0, 80), object: object.slice(0, 80), rank };
  });
}

/**
 * Which rules are available for one function, given the whole model.
 *
 * A and B are always *askable* — whether they hold is the engineering question
 * the candidate carries. C is only offered when there is genuinely another
 * component that could take the job: offering "let something else do it" on a
 * two-component system is noise dressed as method.
 */
function rulesFor(f, componentNames) {
  const out = [{ ...TRIMMING_RULES.A, question: TRIMMING_RULES.A.question(f) },
    { ...TRIMMING_RULES.B, question: TRIMMING_RULES.B.question(f) }];
  const others = componentNames.filter(n => n !== f.carrier && n !== f.object);
  if (others.length > 0) {
    out.push({ ...TRIMMING_RULES.C, question: TRIMMING_RULES.C.question(f), alternativeCarriers: others.slice(0, 8) });
  }
  return out;
}

/**
 * Trimming candidates, ordered by the money they release.
 *
 * @param {Array} functions  the function model (validated here)
 * @param {Array<{name,cost}>} [costs]  component costs. OPTIONAL — and when it
 *        is absent every candidate reports `costReleased: null` rather than a
 *        guessed figure. A trimming list ranked by an invented number is worse
 *        than one that admits it does not know the order.
 * @returns {{candidates, componentsWithoutCost, totalCost, costed}}
 */
export function trimmingCandidates(functions, costs = null) {
  const model = validateFunctionModel(functions);

  const costOf = new Map();
  if (Array.isArray(costs)) {
    for (const c of costs) {
      const name = String(c?.name ?? '').trim();
      const v = Number(c?.cost);
      if (name && Number.isFinite(v) && v >= 0) costOf.set(name.toLowerCase(), v);
    }
  }
  const costed = costOf.size > 0;

  // Every component named anywhere in the model — carriers AND objects. A
  // component that only ever appears as an object is still a component, and
  // Rule A is precisely about removing one of those.
  const componentNames = [];
  for (const f of model) {
    for (const n of [f.carrier, f.object]) if (!componentNames.includes(n)) componentNames.push(n);
  }

  const byCarrier = new Map();
  for (const f of model) {
    if (!byCarrier.has(f.carrier)) byCarrier.set(f.carrier, []);
    byCarrier.get(f.carrier).push(f);
  }

  const candidates = [];
  for (const [carrier, fns] of byCarrier) {
    const cost = costOf.has(carrier.toLowerCase()) ? costOf.get(carrier.toLowerCase()) : null;
    // A carrier is trimmable only if EVERY useful function it carries can be
    // redistributed. One un-redistributable useful function keeps the part.
    const useful = fns.filter(f => f.rank === 'useful');
    const nonUseful = fns.filter(f => f.rank !== 'useful');
    const perFunction = fns.map(f => ({
      function: f.function,
      object: f.object,
      rank: f.rank,
      // A harmful/excessive function needs no redistribution at all — losing it
      // IS the benefit. Saying so stops the reader hunting for a new carrier.
      redistributionNeeded: f.rank === 'useful',
      rules: f.rank === 'useful' ? rulesFor(f, componentNames) : [],
    }));
    candidates.push({
      carrier,
      costReleased: cost,
      functionCount: fns.length,
      usefulFunctionCount: useful.length,
      nonUsefulFunctionCount: nonUseful.length,
      // The headline: how many separate questions have to be answered YES
      // before this component can actually go.
      questionsToAnswer: useful.length,
      functions: perFunction,
      note: useful.length === 0
        ? 'Carries no useful function — every function it carries is harmful, excessive or insufficient. Deleting it is pure gain.'
        : null,
    });
  }

  // Worst-first by money released. Components with no cost sort last rather
  // than sorting as zero — absent is not cheap.
  candidates.sort((a, b) => {
    if (a.costReleased == null && b.costReleased == null) return a.carrier.localeCompare(b.carrier);
    if (a.costReleased == null) return 1;
    if (b.costReleased == null) return -1;
    return b.costReleased - a.costReleased;
  });

  const componentsWithoutCost = costed
    ? componentNames.filter(n => !costOf.has(n.toLowerCase()))
    : componentNames.slice();
  const totalCost = costed
    ? round([...costOf.values()].reduce((s, v) => s + v, 0))
    : null;

  return { candidates, componentsWithoutCost, totalCost, costed };
}

/**
 * Turn an existing FAST function-cost matrix into a trimming function model.
 *
 * This is why trimming is cheap to add: `functionCostMatrix()` in
 * innovation.mjs already produces components × functions with a validated cost
 * allocation, which is the exact input trimming needs. A user who has run FAST
 * gets trimming with no extra data entry.
 *
 * The OBJECT is not something FAST records — a function-cost matrix says which
 * functions a component serves, not what it acts upon. Rather than invent one,
 * the object is named for the function it serves ("the ‹function› interface"),
 * and `objectInferred: true` is set on every row so the caller can see that the
 * object side of each rule is a placeholder awaiting a real answer.
 *
 * @param {object} fast  the return value of functionCostMatrix()
 * @param {number} [minAllocationPct=5] ignore allocations below this — a
 *        component contributing 1% of one function is not a carrier of it, and
 *        including it buries the real carriers in noise.
 */
export function functionModelFromFast(fast, minAllocationPct = 5) {
  const comps = fast?.components;
  const fns = fast?.functions;
  if (!Array.isArray(comps) || comps.length === 0) throw new Error('FAST result has no components');
  if (!Array.isArray(fns) || fns.length === 0) throw new Error('FAST result has no functions');

  const functions = [];
  for (const c of comps) {
    const alloc = Array.isArray(c.allocations) ? c.allocations : [];
    if (alloc.length !== fns.length) {
      throw new Error(`component "${c.name}" has ${alloc.length} allocations for ${fns.length} functions`);
    }
    alloc.forEach((pct, j) => {
      if (Number(pct) < minAllocationPct) return;
      functions.push({
        carrier: c.name,
        function: fns[j].name,
        object: `the ${fns[j].name} interface`,
        objectInferred: true,
        rank: 'useful',
        allocationPct: Number(pct),
      });
    });
  }
  if (functions.length === 0) {
    throw new Error(`no component carries any function at ${minAllocationPct}% or more — lower minAllocationPct or check the matrix`);
  }
  const costs = comps.map(c => ({ name: c.name, cost: Number(c.cost) || 0 }));
  return { functions, costs, objectsInferred: true };
}

/**
 * The one number a trimming exercise is judged on.
 *
 * Reported as a RANGE over the candidates the caller marks as confirmed, never
 * as a single figure over all candidates — "we could save £40" when every
 * candidate is still an open question would be the same fabrication this
 * codebase refuses everywhere else.
 */
export function trimmingUpside(result, confirmedCarriers = []) {
  const confirmed = new Set(confirmedCarriers.map(s => String(s).toLowerCase()));
  const rows = result.candidates.filter(c => confirmed.has(c.carrier.toLowerCase()));
  const withCost = rows.filter(c => c.costReleased != null);
  return {
    confirmedCount: rows.length,
    costedCount: withCost.length,
    uncostedCount: rows.length - withCost.length,
    costReleased: withCost.length ? round(withCost.reduce((s, c) => s + c.costReleased, 0)) : null,
    ofTotalPct: withCost.length && result.totalCost
      ? round((withCost.reduce((s, c) => s + c.costReleased, 0) / result.totalCost) * 100, 1)
      : null,
  };
}
