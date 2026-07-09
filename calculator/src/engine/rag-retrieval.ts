import type { RateLibrary } from './types.js';

/**
 * RAG grounding — dependency-free retrieval over the tool's own data.
 *
 * The AI agent should answer from the actual rate library and past costings, not
 * from parametric memory. This builds a small corpus of grounding "documents"
 * (each material / machine / labour rate + any saved costing) and retrieves the
 * most relevant ones for a query using TF-IDF cosine similarity — no external
 * vector DB, fully deterministic and offline. The retrieved facts (with their
 * rateIds) are injected into the LLM prompt so answers are traceable.
 */

export interface RagDoc { id: string; kind: 'material' | 'machine' | 'labour' | 'costing'; text: string; }
export interface RagHit extends RagDoc { score: number; }

const STOP = new Set(['the', 'a', 'an', 'of', 'for', 'to', 'in', 'and', 'or', 'is', 'at', 'on', 'per', 'with', 'by', 'from', 'this', 'that', 'it', 'as', 'be']);

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t.length > 1 && !STOP.has(t));
}

/** Build the grounding corpus from the rate library (and optional saved costings). */
export function buildRateCorpus(
  library: RateLibrary,
  costings: Array<{ id: string; partName: string; commodity: string; totalCost: number; currency: string; region?: string }> = [],
): RagDoc[] {
  const docs: RagDoc[] = [];
  for (const m of library.materials) {
    docs.push({ id: m.id, kind: 'material', text: `Material ${m.grade} (${m.category}) — ${m.pricePerKg} ${m.region} per kg, scrap recovery ${m.scrapRecoveryPricePerKg}, density ${m.densityKgPerM3} kg/m3. ${m.sourceNote}` });
  }
  for (const mc of library.machines) {
    docs.push({ id: mc.id, kind: 'machine', text: `Machine ${mc.machineClass} — ${mc.computedRatePerHr} per hour, region ${mc.region}. ${mc.sourceNote ?? ''}` });
  }
  for (const l of library.labour) {
    docs.push({ id: l.id, kind: 'labour', text: `Labour ${l.skillLevel} (${l.region}) — ${l.fullyLoadedRatePerHr} per hour fully loaded. ${l.sourceNote}` });
  }
  for (const c of costings) {
    docs.push({ id: c.id, kind: 'costing', text: `Past costing ${c.partName} — ${c.commodity} ${c.totalCost} ${c.currency}${c.region ? ` region ${c.region}` : ''}.` });
  }
  return docs;
}

interface Index { docs: RagDoc[]; vectors: Map<string, number>[]; idf: Map<string, number>; }

function buildIndex(docs: RagDoc[]): Index {
  const df = new Map<string, number>();
  const tokenized = docs.map(d => tokenize(d.text));
  for (const toks of tokenized) for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length || 1;
  const idf = new Map<string, number>();
  for (const [t, c] of df) idf.set(t, Math.log(1 + n / c));
  const vectors = tokenized.map(toks => {
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    const v = new Map<string, number>();
    for (const [t, c] of tf) v.set(t, (c / toks.length) * (idf.get(t) ?? 0));
    return v;
  });
  return { docs, vectors, idf };
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, na = 0, nb = 0;
  for (const [, w] of a) na += w * w;
  for (const [, w] of b) nb += w * w;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const [t, w] of small) { const w2 = large.get(t); if (w2) dot += w * w2; }
  return na > 0 && nb > 0 ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/** Retrieve the top-k grounding docs for a query. */
export function retrieve(query: string, docs: RagDoc[], k = 6): RagHit[] {
  if (!docs.length) return [];
  const idx = buildIndex(docs);
  const qToks = tokenize(query);
  const qv = new Map<string, number>();
  const tf = new Map<string, number>();
  for (const t of qToks) tf.set(t, (tf.get(t) ?? 0) + 1);
  for (const [t, c] of tf) qv.set(t, (c / (qToks.length || 1)) * (idx.idf.get(t) ?? 0));

  return idx.docs
    .map((d, i) => ({ ...d, score: Math.round(cosine(qv, idx.vectors[i]) * 1000) / 1000 }))
    .filter(h => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** Format retrieved grounding into a prompt block the LLM can cite. */
export function groundingBlock(query: string, docs: RagDoc[], k = 6): string {
  const hits = retrieve(query, docs, k);
  if (!hits.length) return '';
  const lines = hits.map(h => `- [${h.kind}:${h.id}] ${h.text}`).join('\n');
  return `GROUNDING DATA (cite the [kind:id] tag when you use a figure; do not invent rates):\n${lines}`;
}
