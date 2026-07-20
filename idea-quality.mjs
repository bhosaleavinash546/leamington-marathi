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
export function dedupeIdeas(ideas, { threshold = 0.6 } = {}) {
  const arr = Array.isArray(ideas) ? [...ideas] : [];
  const vecs = arr.map(i => tfVector(ideaText(i)));
  const droppedIdx = new Set();
  const merged = [];
  for (let i = 0; i < arr.length; i++) {
    if (droppedIdx.has(i)) continue;
    for (let j = i + 1; j < arr.length; j++) {
      if (droppedIdx.has(j)) continue;
      const s = cosine(vecs[i], vecs[j]);
      if (s < threshold) continue;
      const [keep, drop] = (arr[j].qualityScore || 0) > (arr[i].qualityScore || 0) ? [j, i] : [i, j];
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
  const clean = val.toLowerCase().replace(/[€£$¥₹,\s%]/g, '');
  const parts = clean.split(/[–—-]/).filter(Boolean);
  const parseOne = (s) => {
    const m = s.match(/([\d.]+)\s*([mk]?)/);
    if (!m) return 0;
    return parseFloat(m[1]) * (m[2] === 'm' ? 1_000_000 : m[2] === 'k' ? 1_000 : 1);
  };
  return parts.length >= 2 ? (parseOne(parts[0]) + parseOne(parts[1])) / 2 : parseOne(clean);
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
  for (const idea of Array.isArray(ideas) ? ideas : []) {
    const csp = idea.costSavingPotential || {};
    const annualMid = parseAnnualValueMid(csp.annualValue);
    const basis = [];
    if (!annualMid) basis.push('no annual value stated — ranked by quality only');

    const payback = typeof csp.paybackMonths === 'number' ? csp.paybackMonths : null;
    // 0mo → ×2.0 · 12mo → ×1.0 · 36mo → ×0.5; unknown payback stays neutral.
    const paybackFactor = payback == null ? 1 : Math.min(2, Math.max(0.5, 24 / (payback + 12)));
    if (payback != null) basis.push(`payback ${payback}mo ×${paybackFactor.toFixed(2)}`);

    const quality = typeof idea.qualityScore === 'number' ? idea.qualityScore : 70;
    const qualityFactor = 0.5 + quality / 200;                       // 0.5..1.0
    basis.push(`quality ${quality} ×${qualityFactor.toFixed(2)}`);

    const dir = idea.engineCheck?.direction;
    const engineFactor = dir === 'confirmed' ? 1.2 : dir === 'contradicted' ? 0.35 : 1;
    if (dir) basis.push(`engine ${dir} ×${engineFactor}`);

    const evidenceFactor = idea.evidenceUnverified === false ? 1.1 : idea.evidenceUnverified === true ? 0.9 : 1;
    if (idea.evidenceUnverified === false) basis.push('search-backed evidence ×1.1');
    if (idea.evidenceUnverified === true) basis.push('evidence unverified ×0.9');

    const tasteFactor = idea.tasteMatch ? 1.15 : 1;
    if (idea.tasteMatch) basis.push(`similar to previously approved "${idea.tasteMatch.title}" ×1.15`);

    // Deep-mode Elo (bounded ×0.85–1.15, stamped by idea-deep.mjs) — soft-axis
    // panel judgement, never allowed to outweigh the engine factor.
    const eloF = typeof idea.eloFactor === 'number' ? Math.min(1.15, Math.max(0.85, idea.eloFactor)) : 1;
    if (eloF !== 1) basis.push(`panel Elo ${idea.eloRating ?? ''} ×${eloF.toFixed(2)}`);

    // Value-less ideas rank on their factors alone (base 1) so verified
    // high-quality ideas still beat broken ones instead of all tying at 0.
    const base = annualMid || 1;
    const score = base * paybackFactor * qualityFactor * engineFactor * evidenceFactor * tasteFactor * eloF;
    idea.rank = { score: Number(score.toFixed(1)), basis: basis.join(' · ') };
  }
  return ideas;
}
