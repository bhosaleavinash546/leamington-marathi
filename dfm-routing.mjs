// ─────────────────────────────────────────────────────────────────────────────
// ROUTE COMPARISON — the same part, judged and priced down every process the
// material can actually take.
//
// A DFM report answers "is this part good for the process you named". The
// question a cost engineer actually arrives with is "which process should this
// part be made by, and what does each one cost me". Answering it needs no new
// measurement: the geometry is measured once, and each candidate route is the
// existing rule engine plus the existing cost engine plus the existing carbon
// model, run with a different process.
//
// TWO HONESTY RULES SHAPE THIS FILE.
//
// A route is only offered when the cost model ACCEPTS the material — the same
// `families` tag the picker uses — so a comparison never quietly prices steel as
// an injection moulding. And a route whose numbers could not be produced is
// returned WITH THE REASON rather than dropped: a table that silently omits the
// routes it failed on reads as "these are the options", when it means "these are
// the options that happened to work".
//
// Nothing here ranks by a blended score. Cost, manufacturability and carbon are
// three different questions with three different units, and collapsing them into
// one number would hide exactly the trade-off the reader is here to make. The
// caller sorts; this returns the measured columns.
// ─────────────────────────────────────────────────────────────────────────────
import { computeShouldCost } from './costing-engine.mjs';
import { computeCarbon } from './carbon.mjs';
import { runDfmRules } from './dfm-rules.mjs';
import { processesForMaterial, SECONDARY_OPERATION_FAMILIES } from './dfm-process-registry.mjs';

/**
 * @param {object} geo      measured geometry (the engine's analyze() output)
 * @param {object} opts     { material, region, annualVolume, weightKg, library }
 * @returns {{routes: Array, skipped: Array, basis: string}}
 */
export function compareRoutes(geo, opts = {}) {
  const {
    material, region = 'Germany', annualVolume = 50_000, weightKg, library = null,
    // The process the user actually picked. It is compared here — not shown as
    // one anonymous row among nine — because "which of these am I on" is the
    // first question anybody asks of this table, and a reader who cannot answer
    // it reads the whole page as a generic survey of every process.
    chosenProcess = null,
  } = opts;
  if (!material) {
    return {
      routes: [], skipped: [],
      basis: 'No material chosen. A route comparison needs one: the material decides which processes are even possible, and it sets the thresholds the rules are judged against.',
    };
  }

  const routes = [];
  const skipped = [];

  for (const candidate of processesForMaterial(material)) {
    // Only processes that SHAPE the part are routes. E-coat and washing are
    // operations you add to a route, not alternatives to it.
    if (!candidate.dfmFamily) continue;

    const row = {
      process: candidate.name,
      dfmFamily: candidate.dfmFamily,
      dfmFamilyName: candidate.dfmFamilyName,
      isChosen: !!chosenProcess && candidate.name === chosenProcess,
    };

    // ── Manufacturability, judged by THIS process's own rules ───────────────
    try {
      const r = runDfmRules(geo, candidate.dfmFamily, { material });
      row.score = r.score;
      row.coveragePct = r.coveragePct;
      row.ruleCount = r.ruleCount;
      row.evaluatedCount = r.evaluatedCount;
      row.findingCount = r.findings.length;
      row.highSeverityCount = r.findings.filter(f => f.severity === 'high').length;
      // NOT VIABLE is a different statement from a low score, and the table has
      // to make it. Centrifugal casting priced this bracket at EUR 7.77 with a
      // score of 63 while the geometry said the mould cannot make it at all —
      // a cheap-looking row for a route that does not exist.
      row.viable = !r.blockers?.length;
      row.blockedReason = r.blockedReason ?? null;
      // AN OPERATION IS NOT A ROUTE. Broaching, wire EDM and gun drilling finish
      // a part that already exists, so pricing them per-part beside die casting
      // compares "make this bracket" with "cut one feature in it". They stay in
      // the table — "can this be broached" is worth answering — but they are
      // labelled, and the recommendation below can never land on one.
      row.netShape = !SECONDARY_OPERATION_FAMILIES[candidate.dfmFamily];
      row.secondaryReason = SECONDARY_OPERATION_FAMILIES[candidate.dfmFamily] ?? null;
      // The two worst findings, so a row explains itself without a drill-down.
      row.topFindings = r.findings.slice(0, 2).map(f => ({
        title: f.title, severity: f.severity, measured: f.measured,
        thresholdText: f.thresholdText, thresholdBasis: f.thresholdBasis,
      }));
      // A score over 3 of 9 rules is not the same claim as a score over 9 of 9,
      // and a table of bare scores invites the reader to compare them as if it
      // were. The coverage travels in the row for exactly that reason.
      row.scoreCaveat = r.evaluatedCount === 0
        ? 'No rule in this family could be evaluated on this geometry, so there is no score — not a clean sheet.'
        : r.coveragePct < 60
          ? `Only ${r.evaluatedCount} of ${r.ruleCount} rules could be evaluated, so this score rests on a partial check.`
          : null;
    } catch (e) {
      row.score = null;
      row.dfmError = `Rules could not be run: ${e.message}`;
    }

    // ── Cost, from the same engine the rest of BrainSpark uses ──────────────
    if (weightKg > 0) {
      try {
        const cost = computeShouldCost(
          { material, process: candidate.name, weightKg, annualVolume, region },
          {}, null, library);
        row.piecePriceEur = round2(cost.totalShouldCost);
        // TOTAL tooling investment, not the amortised slice. Two routes at the
        // same piece price are not the same decision when one needs a EUR 140k
        // die and the other a EUR 8k fixture, and the per-part number hides that
        // completely — it is the up-front cheque that decides a programme.
        row.toolingEur = round2(cost.drivers?.toolingTotal);
        row.toolingPerPartEur = round2(cost.breakdown?.tooling?.value);
        row.annualEur = annualVolume ? round2(cost.totalShouldCost * annualVolume) : null;
        // Buy-to-fly: what must be bought to yield one finished part. A casting
        // at 60% yield pours 1.43 kg to ship 0.86, and that is the mass the
        // material cost AND the material carbon are both computed on.
        row.inputMassKg = cost.drivers?.inputMassKg ?? null;

        // ── Carbon, on the SAME mass basis the cost used ────────────────────
        // Passing the cost engine's own buy-to-fly mass rather than the finished
        // weight is what keeps the two columns talking about the same part: a
        // route with 45% metal yield emits the material carbon of everything it
        // pours, not of what survives.
        const carbon = computeCarbon(
          { material, process: candidate.name, region },
          { inputMassKg: cost.drivers?.inputMassKg ?? weightKg, finishedMassKg: weightKg });
        if (carbon) {
          row.kgCo2e = carbon.totalKgCo2e;
          row.kgCo2eMaterial = carbon.materialKgCo2e;
          row.kgCo2eProcess = carbon.processKgCo2e;
          row.cbamEur = carbon.cbam?.eur ?? null;
        } else {
          row.kgCo2e = null;
          row.carbonReason = `No published emission factor for ${material}, so this route's carbon is not estimated rather than assumed.`;
        }
      } catch (e) {
        // A route the cost model refuses is still a route the DFM rules judged.
        // Keeping the row with its reason is the difference between "we cannot
        // price this" and the reader assuming the option does not exist.
        row.piecePriceEur = null;
        row.costReason = e.message;
      }
    } else {
      row.piecePriceEur = null;
      row.costReason = 'No mass — a material must be chosen for the kernel volume to become a weight.';
    }

    routes.push(row);
  }

  // ── What each alternative is worth AGAINST the route you are on ───────────
  // An absolute price answers "what does this cost"; only a delta answers "is it
  // worth changing". It is left null when the chosen route could not be priced,
  // because a difference from an unknown is not a number.
  const chosenRow = routes.find(r => r.isChosen) ?? null;
  if (chosenRow && Number.isFinite(chosenRow.piecePriceEur)) {
    for (const r of routes) {
      if (r.isChosen) continue;
      r.deltaPieceEur = Number.isFinite(r.piecePriceEur)
        ? round2(r.piecePriceEur - chosenRow.piecePriceEur) : null;
      r.deltaToolingEur = Number.isFinite(r.toolingEur) && Number.isFinite(chosenRow.toolingEur)
        ? round2(r.toolingEur - chosenRow.toolingEur) : null;
    }
  }

  // Processes the material cannot take at all. Named, not hidden: "sand casting
  // is not on this list" is information, and its absence looks like an oversight.
  for (const [name, why] of unsuitableFor(material)) skipped.push({ process: name, reason: why });

  return {
    routes,
    skipped,
    chosenProcess: chosenRow ? chosenRow.process : null,
    basis: chosenRow
      ? `Your route is ${chosenRow.process}. Every other row is the SAME measured geometry run through THAT process's own rule family, priced by computeShouldCost and carbon-scored by computeCarbon on the cost engine's own input mass — offered as an alternative to yours, not as a competing analysis of it. Nothing is blended into a single ranking: cost, manufacturability and CO2e are three different questions.`
      : 'Each row is the SAME measured geometry run through that process\'s own rule family, priced by computeShouldCost and carbon-scored by computeCarbon on the cost engine\'s own input mass. Nothing is blended into a single ranking: cost, manufacturability and CO2e are three different questions.',
  };
}

/**
 * Processes excluded because the material family is wrong for them.
 *
 * Derived from the same tags the picker uses, so the exclusion list cannot
 * disagree with the offer list.
 */
function unsuitableFor(material) {
  const offered = new Set(processesForMaterial(material).map(p => p.name));
  const all = processesForMaterial(null);
  return all
    .filter(p => p.dfmFamily && !offered.has(p.name))
    .map(p => [p.name, `The cost model lists this process as incompatible with ${material}.`]);
}

const round2 = n => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

/**
 * Rank routes without inventing a blended score.
 *
 * `by` names ONE measured column. A route missing that column sorts last and
 * keeps its reason, rather than being treated as zero — which would put every
 * unpriceable route at the top of a cheapest-first list.
 */
export function rankRoutes(routes, by = 'piecePriceEur') {
  const dir = by === 'score' ? -1 : 1;   // high score good, low cost/carbon good
  return [...routes].sort((a, b) => {
    const av = a[by], bv = b[by];
    if (!Number.isFinite(av) && !Number.isFinite(bv)) return 0;
    if (!Number.isFinite(av)) return 1;
    if (!Number.isFinite(bv)) return -1;
    return (av - bv) * dir;
  });
}
