/**
 * Lexical idea index (BM25) — retrieval over the marketplace/idea corpus.
 * ------------------------------------------------------------------
 * At ~1,500 documents a vector DB is overkill: BM25 over title+description is
 * fast (<1 ms/query), dependency-free, fully explainable, and good enough to
 * (a) power global search and (b) feed "these ideas already exist — don't
 * duplicate them" retrieval into idea generation.
 *
 *   const idx = buildIndex(docs);            // [{ id, text, ...meta }]
 *   idx.search('aluminium subframe rivets')  // → [{ doc, score }] best-first
 */

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'with', 'on', 'by', 'is', 'are', 'be', 'as', 'at', 'that', 'this', 'from', 'it', 'its', 'into', 'via', 'per']);

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9äöüß\-+]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP.has(t));
}

export function buildIndex(docs) {
  const N = docs.length;
  const df = new Map();                    // term → doc frequency
  const docTerms = [];                     // per-doc term-frequency maps
  let totalLen = 0;
  for (const d of docs) {
    const terms = tokenize(d.text);
    totalLen += terms.length;
    const tf = new Map();
    for (const t of terms) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    docTerms.push({ tf, len: terms.length });
  }
  const avgLen = N ? totalLen / N : 0;
  const K1 = 1.4, B = 0.75;

  function search(query, k = 10) {
    const qTerms = [...new Set(tokenize(query))];
    if (!qTerms.length || !N) return [];
    const scores = new Float64Array(N);
    for (const t of qTerms) {
      const n = df.get(t);
      if (!n) continue;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      for (let i = 0; i < N; i++) {
        const f = docTerms[i].tf.get(t);
        if (!f) continue;
        scores[i] += idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * docTerms[i].len / avgLen));
      }
    }
    const out = [];
    for (let i = 0; i < N; i++) if (scores[i] > 0) out.push({ doc: docs[i], score: scores[i] });
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, k);
  }

  return { search, size: N };
}
