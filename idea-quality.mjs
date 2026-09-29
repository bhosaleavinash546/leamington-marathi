/**
 * Idea quality mechanics — diversity measurement, intra-batch dedup, ranking.
 * ------------------------------------------------------------------
 * The documented failure mode of LLM ideation is homogeneity, not idea
 * quality (Si et al. 2409.04109; Wharton/Nature HB 2025): batches converge on
 * the same few mechanisms. These are the deterministic counter-measures:
 *
 *   ideaSimilarity(a, b)     cosine over TF vectors of title+description
 *   batchDiversity(ideas)    0-100 score + near-duplicate pair list
 *   dedupeIdeas(ideas)       merge near-duplicates, keep the stronger idea
 *   rankIdeas(ideas)         explainable value ranking (ROI proxy × quality
 *                            × engine-check × evidence × taste factors)
 *
 * Pure & dependency-light (only the shared tokenizer) so every function is
 * unit-testable and usable from both the server and the eval harness.
 */
import { tokenize } from './idea-index.mjs';

function tfVector(text) {
  const tf = new Map();
  for (const t of tokenize(text)) tf.set(t, (tf.get(t) || 0) + 1);
  return tf;
}

function cosine(a, b) {
  if (!a.size || !b.size) return 0;
  let dot = 0, na = 0, nb = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [t, f] of small) { const g = large.get(t); if (g) dot += f * g; }
  for (const f of a.values()) na += f * f;
  for (const f of b.values()) nb += f * f;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function ideaText(idea) {
  return `${idea?.title || ''} ${idea?.technicalDescription || ''}`;
}

/** Cosine similarity (0..1) between two ideas' title+description. */
export function ideaSimilarity(a, b) {
  return cosine(tfVector(ideaText(a)), tfVector(ideaText(b)));
}

/**
 * Batch diversity: 100 × (1 − mean pairwise similarity), plus the list of
 * near-duplicate pairs above `dupThreshold`. Deterministic — same batch,
 * same score — so it can gate the eval harness.
 */
export function batchDiversity(ideas, { dupThreshold = 0.45 } = {}) {
  const arr = Array.isArray(ideas) ? ideas : [];
  if (arr.length < 2) return { diversityScore: 100, meanPairwiseSim: 0, pairs: 0, nearDupPairs: [] };
  const vecs = arr.map(i => tfVector(ideaText(i)));
  let sum = 0, pairs = 0;
  const nearDupPairs = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const s = cosine(vecs[i], vecs[j]);
      sum += s; pairs++;
      if (s >= dupThreshold) {
        nearDupPairs.push({ a: arr[i].title, b: arr[j].title, similarity: Number(s.toFixed(3)) });
      }
    }
  }
  const mean = sum / pairs;
  return {
    diversityScore: Number((100 * (1 - mean)).toFixed(1)),
    meanPairwiseSim: Number(mean.toFixed(3)),
    pairs,
    nearDupPairs,
  };
}

/**
 * Intra-batch dedup: when two ideas are near-duplicates, keep the one with the
 * higher qualityScore (ties: the earlier one) and fold the other's title into
 * survivor.mergedTitles. The prompt already tells the model to merge same-root
 * ideas; this is the deterministic enforcement of that instruction.
 */
export function dedupeIdeas(ideas, { threshold = 0.6, crossLensThreshold = 0.45 } = {}) {
  const arr = Array.isArray(ideas) ? [...ideas] : [];
  const vecs = arr.map(i => tfVector(ideaText(i)));
  const droppedIdx = new Set();
  const merged = [];
  // Prism runs generate through several lenses (or, for assemblies, three
  // system levels) in PARALLEL, so the same lever comes back once per lens
  // with different wording — "GBD Dy-lean magnets" three times at three
  // levels on the live EDU run, 18 near-duplicate pairs the 0.6 title-cosine
  // could not see. Across lenses a lower bar applies; within one lens the
  // model was already told to merge same-root ideas and 0.6 stands.
  const LEVEL_RANK = { Part: 3, Subassembly: 2, Assembly: 1 };
  for (let i = 0; i < arr.length; i++) {
    if (droppedIdx.has(i)) continue;
    for (let j = i + 1; j < arr.length; j++) {
      if (droppedIdx.has(j)) continue;
      const s = cosine(vecs[i], vecs[j]);
      const crossLens = arr[i].lensId && arr[j].lensId && arr[i].lensId !== arr[j].lensId;
      if (s < (crossLens ? crossLensThreshold : threshold)) continue;
      // Survivor: higher quality; on a tie the deeper system level (a
      // part-level statement of the lever is the more actionable one).
      const qi = arr[i].qualityScore || 0, qj = arr[j].qualityScore || 0;
      const li = LEVEL_RANK[arr[i].systemLevel] || 0, lj = LEVEL_RANK[arr[j].systemLevel] || 0;
      const [keep, drop] = qj > qi || (qj === qi && lj > li) ? [j, i] : [i, j];
      droppedIdx.add(drop);
      arr[keep].mergedTitles = [...(arr[keep].mergedTitles || []), arr[drop].title];
      merged.push({ kept: arr[keep].title, dropped: arr[drop].title, similarity: Number(s.toFixed(3)) });
      if (drop === i) break;   // survivor is j — stop comparing from the dropped i
    }
  }
  return { ideas: arr.filter((_, k) => !droppedIdx.has(k)), merged };
}

/**
 * Similarity matches of one subject against a corpus of docs
 * [{ id, title, description }] — powers the submission duplicate check.
 * Returns [{ id, title, similarity }] best-first above the threshold.
 */
export function similarityMatches(subject, docs, { threshold = 0.5, max = 5 } = {}) {
  const sv = tfVector(`${subject?.title || ''} ${subject?.description || ''}`);
  if (!sv.size) return [];
  const out = [];
  for (const d of Array.isArray(docs) ? docs : []) {
    const s = cosine(sv, tfVector(`${d.title || ''} ${d.description || ''}`));
    if (s >= threshold) out.push({ id: d.id, title: d.title, similarity: Number(s.toFixed(3)) });
  }
  return out.sort((a, b) => b.similarity - a.similarity).slice(0, max);
}

/**
 * Deterministic theme clustering over a corpus [{ id, title, description }]:
 * pairwise TF-cosine above `threshold` → connected components (union-find).
 * Cluster labels are the components' most frequent distinctive tokens.
 * O(n²) pairwise — fine at marketplace scale (~1.6k docs) behind a
 * count-keyed cache; not for unbounded corpora.
 */
export function clusterIdeas(docs, { threshold = 0.45, minSize = 3, maxClusters = 40 } = {}) {
  const arr = Array.isArray(docs) ? docs : [];
  const vecs = arr.map(d => tfVector(`${d.title || ''} ${d.description || ''}`));
  const parent = arr.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (cosine(vecs[i], vecs[j]) >= threshold) union(i, j);
    }
  }
  const groups = new Map();
  for (let i = 0; i < arr.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  }
  // Corpus-level document frequency, to keep ubiquitous tokens out of labels.
  const df = new Map();
  for (const v of vecs) for (const t of v.keys()) df.set(t, (df.get(t) || 0) + 1);
  const clusters = [];
  for (const members of groups.values()) {
    if (members.length < minSize) continue;
    const tf = new Map();
    for (const m of members) for (const [t, f] of vecs[m]) tf.set(t, (tf.get(t) || 0) + f);
    const label = [...tf.entries()]
      .map(([t, f]) => [t, f * Math.log(arr.length / (1 + (df.get(t) || 0)))])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3).map(([t]) => t).join(' · ');
    clusters.push({ label, count: members.length, ideaIds: members.map(m => arr[m].id) });
  }
  return clusters.sort((a, b) => b.count - a.count).slice(0, maxClusters);
}

/**
 * Midpoint of an annual-value string ("£350K–£650K at 80,000 units/yr" → 500000).
 * Mirrors the client-side parser so server rank and UI sort agree.
 */
export function parseAnnualValueMid(val) {
  if (!val || typeof val !== 'string') return 0;
  // The FIRST money figure, with its range and its sign — not every number in
  // the string. Splitting on every hyphen averaged "€0.4M ex-works at
  // 10,000,000 units/yr" with the VOLUME (€5.2M), read "Net −€0.6M–€1.2M part
  // cost" as a €0.9M saving, and returned NaN for "cost-neutral" (Analyze
  // review, 29 Sept 2026: 3 of 127 live claims). A minus directly before the
  // currency symbol is a sign; a dash between two figures is a range.
  const t = val.replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
  const SYM = '[€£$¥₹]';
  const NUM = '(\\d+(?:\\.\\d+)?)\\s?([kKmM](?![a-zA-Z]))?';
  const re = new RegExp(`(^|[\\s(~:])([-−]\\s?)?${SYM}\\s?${NUM}(?:\\s?(?:[-–—]|to)\\s?([-−]\\s?)?${SYM}?\\s?${NUM})?`);
  let m = re.exec(t);
  // No currency symbol at all: a figure carrying a K/M suffix ("350K–650K").
  if (!m) m = new RegExp(`(^|[\\s(~:])([-−]\\s?)?(\\d+(?:\\.\\d+)?)\\s?([kKmM])(?![a-zA-Z])(?:\\s?(?:[-–—]|to)\\s?([-−]\\s?)?${NUM})?`).exec(t);
  if (!m) return 0;
  const sc = (s) => (!s ? 1 : /k/i.test(s) ? 1e3 : 1e6);
  const aSuf = m[4] || m[7], bSuf = m[7] || m[4];
  const a = parseFloat(m[3]) * sc(aSuf) * (m[2] ? -1 : 1);
  if (m[6] == null) return Number.isFinite(a) ? a : 0;
  const bSign = m[5] ? -1 : m[2] && !m[5] ? -1 : 1;
  const b = parseFloat(m[6]) * sc(bSuf) * bSign;
  const mid = (a + b) / 2;
  return Number.isFinite(mid) ? mid : 0;
}

/**
 * Explainable value ranking. Stamps idea.rank = { score, basis } on every idea
 * (mutates in place, returns the array). The score is an ROI proxy — annual
 * value scaled by payback speed — weighted by what the pipeline actually
 * verified: critic quality, engine-check direction, evidence status, and
 * similarity to ideas this org previously approved/confirmed (tasteMatch,
 * stamped by the caller before ranking).
 *
 * A contradicted engine check is the strongest negative signal we own — it
 * multiplies the score down hard rather than deleting the idea, so the user
 * still sees it (with the contradiction visible) but never at the top.
 */
export function rankIdeas(ideas) {
  const list = Array.isArray(ideas) ? ideas : [];

  // The annual value is a free-text figure the MODEL wrote, and it is the base
  // of the score — so without a bound, an idea that simply overstates itself
  // outranks one the engine actually checked. Winsorise each claim against the
  // batch: anything beyond CLAIM_CAP_X times the median stated value is pulled
  // back to that ceiling. A genuinely larger prize still ranks higher; a
  // runaway number no longer buys the top slot. The median is used rather than
  // the mean precisely because it is the inflated outliers we are guarding
  // against, and they would drag a mean up with them.
  const CLAIM_CAP_X = 3;
  // THE MATHS OUTRANKS THE ASSERTION (Analyze review, 29 Sept 2026). When an
  // idea's own calculation basis multiplies out to LESS than the annual value
  // it claims, the claim is the model's assertion and the product is its
  // arithmetic — and the house rule is math for numbers. Ranking on the claim
  // with a ×0.7 discount left two ideas at #1 and #2 of a live lamination run
  // whose bases came to 1/7 and 1/20 of what they claimed. An OVERSHOOT (basis
  // above the claim) keeps the claim: it is the conservative figure.
  const rankedValue = (i) => {
    const claimed = parseAnnualValueMid(i.costSavingPotential?.annualValue);
    const a = i.arithmetic;
    return a?.status === 'mismatch' && Number.isFinite(a.computedEur) && a.computedEur >= 0 && a.computedEur < claimed
      ? { value: a.computedEur, claimed, fromBasis: true }
      : { value: claimed, claimed, fromBasis: false };
  };
  const stated = list
    .map(i => rankedValue(i).value)
    .filter(v => v > 0)
    .sort((a, b) => a - b);
  const median = stated.length
    ? (stated.length % 2 ? stated[(stated.length - 1) / 2]
      : (stated[stated.length / 2 - 1] + stated[stated.length / 2]) / 2)
    : 0;
  // A single stated value has no batch to be an outlier against.
  const claimCap = stated.length > 2 && median > 0 ? median * CLAIM_CAP_X : Infinity;

  for (const idea of list) {
    const csp = idea.costSavingPotential || {};
    const rv = rankedValue(idea);
    const claimed = rv.value;
    const annualMid = Math.min(claimed, claimCap);
    const basis = [];
    const fmtV = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}K`);
    if (rv.fromBasis) basis.push(`ranked on its own basis €${fmtV(rv.value)}, not the claimed €${fmtV(rv.claimed)} — the claim does not multiply out`);
    if (!annualMid) basis.push('no annual value stated — ranked by quality only');
    if (annualMid < 0) basis.push('the idea states a net cost INCREASE — ranked below every saving');
    if (claimed > annualMid) {
      const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}K`);
      basis.push(`claim ${fmt(claimed)} capped at ${CLAIM_CAP_X}x batch median (${fmt(annualMid)}) — unverified figure`);
    }

    const payback = typeof csp.paybackMonths === 'number' ? csp.paybackMonths : null;
    // 0mo → ×2.0 · 12mo → ×1.0 · 36mo → ×0.5; unknown payback stays neutral.
    const paybackFactor = payback == null ? 1 : Math.min(2, Math.max(0.5, 24 / (payback + 12)));
    if (payback != null) basis.push(`payback ${payback}mo ×${paybackFactor.toFixed(2)}`);

    const quality = typeof idea.qualityScore === 'number' ? idea.qualityScore : 70;
    const qualityFactor = 0.5 + quality / 200;                       // 0.5..1.0
    basis.push(`quality ${quality} ×${qualityFactor.toFixed(2)}`);

    // Not being engine-checked has to cost something, or verification buys the
    // idea nothing. It stays a light touch on purpose: only a minority of ideas
    // are expressible as a substitution the engine can re-cost, so a heavy
    // penalty would bury most of the output for being unrepresentable rather
    // than for being wrong.
    const dir = idea.engineCheck?.direction;
    const engineFactor = dir === 'confirmed' ? 1.25 : dir === 'contradicted' ? 0.35 : 0.85;
    basis.push(dir ? `engine ${dir} ×${engineFactor}` : `not engine-checked ×${engineFactor}`);

    // The annual value is the BASE of this score, so a claim whose own stated
    // basis does not multiply out to it must not keep the full base. The
    // arithmetic check (idea-arith.mjs) recomputes the basis; a mismatch of
    // up to 50% costs ×0.85, a larger one ×0.7. "unparsed" is not a verdict
    // and is neutral.
    const arith = idea.arithmetic;
    // With the base already corrected to the basis on a shortfall, the factor
    // is only the price of stating two different numbers — one light touch,
    // not a second discount on the size of the error.
    const arithFactor = arith?.status === 'mismatch' ? 0.85 : 1;
    if (arith?.status === 'mismatch') basis.push(`stated basis multiplies out ${arith.deltaPct > 0 ? '+' : ''}${arith.deltaPct}% vs claim ×${arithFactor}`);
    if (arith?.status === 'consistent') basis.push('stated basis multiplies out');
    // `partial` is NEUTRAL and must say so. It means the basis names a term the
    // parser could not price, so the computed figure is a floor — the reader's
    // gap, not the model's error. Silence here would leave a visible badge with
    // no counterpart in the rank explanation.
    if (arith?.status === 'partial') basis.push(arith.bound === 'ceiling'
      ? 'stated basis is a ceiling — an unpriced deduction named ×1'
      : 'stated basis is a floor — an unpriced term named ×1');

    const evidenceFactor = idea.evidenceUnverified === false ? 1.1 : idea.evidenceUnverified === true ? 0.9 : 1;
    if (idea.evidenceUnverified === false) basis.push('search-backed evidence ×1.1');
    if (idea.evidenceUnverified === true) basis.push('evidence unverified ×0.9');

    const tasteFactor = idea.tasteMatch ? 1.15 : 1;
    if (idea.tasteMatch) basis.push(`similar to previously approved "${idea.tasteMatch.title}" ×1.15`);

    // Corpus novelty. `priorArt` was stamped on every near-restatement of an
    // existing marketplace idea, rendered as a badge, counted in the eval — and
    // read by nothing here, so a restatement of a known lever ranked exactly
    // like a genuinely new idea of the same claimed value. Measured at 83% of
    // generated ideas, that made the ranking effectively novelty-blind.
    //
    // Note this is NOT what batch diversity measures. Diversity asks whether
    // the ideas differ from EACH OTHER; a batch can be perfectly diverse and
    // still be nine restatements of nine known levers.
    //
    // The discount is deliberately gentle and scales with how close the match
    // is. A proven, already-catalogued lever is genuinely valuable — surfacing
    // what actually works is what the marketplace is FOR — so the goal is only
    // to stop a restatement outranking a novel idea at equal value, never to
    // bury precedent. A 4x more valuable proven idea still wins comfortably.
    const paScore = idea.priorArt ? Number(idea.priorArt.score) : 0;
    const noveltyFactor = idea.priorArt
      ? Math.max(0.70, 1 - 0.30 * Math.min(1, (Number.isFinite(paScore) ? paScore : 12) / 30))
      : 1;
    if (idea.priorArt) {
      basis.push(`prior art "${idea.priorArt.title}" ×${noveltyFactor.toFixed(2)}`);
    }

    // Deep-mode Elo (bounded ×0.85–1.15, stamped by idea-deep.mjs) — soft-axis
    // panel judgement, never allowed to outweigh the engine factor.
    const eloF = typeof idea.eloFactor === 'number' ? Math.min(1.15, Math.max(0.85, idea.eloFactor)) : 1;
    if (eloF !== 1) basis.push(`panel Elo ${idea.eloRating ?? ''} ×${eloF.toFixed(2)}`);

    // Value-less ideas rank on their factors alone (base 1) so verified
    // high-quality ideas still beat broken ones instead of all tying at 0.
    const base = annualMid || 1;
    const score = base * paybackFactor * qualityFactor * engineFactor * evidenceFactor * tasteFactor * noveltyFactor * eloF * arithFactor;
    idea.rank = { score: Number(score.toFixed(1)), basis: basis.join(' · ') };
  }
  return ideas;
}
