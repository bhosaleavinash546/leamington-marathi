/**
 * Part similarity + case-based suggestions — the tool's memory of past analyses.
 *
 * Every costing is stored as a "case" with a numeric fingerprint. When a new part
 * is costed, we find the nearest past cases (a Gower-style distance: categorical
 * exact-match + log-scale numeric differences — explainable, no black box) and
 * derive suggestions from them: median cost, consensus material, logged actuals,
 * and proactive "this differs from history" insights. This is deliberately
 * case-based reasoning, not a neural net: at tens-to-hundreds of cases it is more
 * accurate AND fully defensible (every suggestion cites its source parts).
 */

export interface PartFingerprint {
  commodity: string;
  materialId?: string;
  materialFamily?: string;   // e.g. 'Aluminium', 'Steel', 'Thermoplastic'
  region?: string;
  netWeightKg?: number;
  annualVolume?: number;
  // Optional CAD-derived shape signals
  bboxMaxMm?: number;
  volumeCm3?: number;
  holeCount?: number;
  freeFormFaceCount?: number;
}

export interface KnowledgeCase {
  id: string;
  savedAt: number;
  partName: string;
  fingerprint: PartFingerprint;
  totalCost: number;
  currency: string;
  breakdown?: Record<string, number>;
  actualCost?: number;         // logged real quote/PO, when known
  userAdjusted?: boolean;      // did the user correct AI/auto-filled values?
  dfmIssueCount?: number;
}

export interface SimilarCase extends KnowledgeCase { similarity: number; matchedOn: string[]; }

// ── Distance ──────────────────────────────────────────────────────────────────

/** Log-ratio closeness for positive numerics: 1 when equal, →0 as they diverge ×10. */
function numericCloseness(a?: number, b?: number): number | null {
  if (!a || !b || a <= 0 || b <= 0) return null;
  const r = Math.abs(Math.log10(a / b));
  return Math.max(0, 1 - r);   // 1 decade apart → 0
}

/** Similarity 0–1 between two fingerprints, with the reasons it matched. */
export function fingerprintSimilarity(a: PartFingerprint, b: PartFingerprint): { score: number; matchedOn: string[] } {
  // Commodity is a hard gate — comparing a casting to a PCB is meaningless.
  if (a.commodity !== b.commodity) return { score: 0, matchedOn: [] };

  const parts: Array<{ w: number; s: number; label: string }> = [];
  parts.push({ w: 2, s: 1, label: 'commodity' });
  if (a.materialFamily && b.materialFamily) parts.push({ w: 2, s: a.materialFamily === b.materialFamily ? 1 : 0, label: 'material family' });
  if (a.materialId && b.materialId && a.materialId === b.materialId) parts.push({ w: 1, s: 1, label: 'exact material' });
  if (a.region && b.region) parts.push({ w: 0.5, s: a.region === b.region ? 1 : 0, label: 'region' });

  const wt = numericCloseness(a.netWeightKg, b.netWeightKg);
  if (wt !== null) parts.push({ w: 2, s: wt, label: 'weight' });
  const vol = numericCloseness(a.annualVolume, b.annualVolume);
  if (vol !== null) parts.push({ w: 1, s: vol, label: 'annual volume' });
  const bbox = numericCloseness(a.bboxMaxMm, b.bboxMaxMm);
  if (bbox !== null) parts.push({ w: 1, s: bbox, label: 'size' });
  const v3 = numericCloseness(a.volumeCm3, b.volumeCm3);
  if (v3 !== null) parts.push({ w: 1, s: v3, label: 'volume' });
  const holes = numericCloseness((a.holeCount ?? 0) + 1, (b.holeCount ?? 0) + 1);
  if (a.holeCount !== undefined && b.holeCount !== undefined && holes !== null) parts.push({ w: 0.5, s: holes, label: 'features' });

  const wSum = parts.reduce((s, p) => s + p.w, 0);
  const score = wSum > 0 ? parts.reduce((s, p) => s + p.w * p.s, 0) / wSum : 0;
  const matchedOn = parts.filter(p => p.s >= 0.75).map(p => p.label);
  return { score: Math.round(score * 1000) / 1000, matchedOn };
}

/** Find the k most similar past cases above a minimum similarity. */
export function findSimilarCases(fp: PartFingerprint, cases: KnowledgeCase[], k = 3, minScore = 0.55): SimilarCase[] {
  return cases
    .map(c => { const { score, matchedOn } = fingerprintSimilarity(fp, c.fingerprint); return { ...c, similarity: score, matchedOn }; })
    .filter(c => c.similarity >= minScore)
    .sort((x, y) => y.similarity - x.similarity)
    .slice(0, k);
}

// ── Suggestions from similar cases ────────────────────────────────────────────

export interface CaseSuggestion { kind: 'benchmark' | 'material' | 'actual' | 'warning'; text: string; sourceParts: string[]; }

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Derive concrete, source-cited suggestions from the similar cases. */
export function deriveSuggestions(similar: SimilarCase[], currentTotal?: number): CaseSuggestion[] {
  if (!similar.length) return [];
  const out: CaseSuggestion[] = [];
  const names = similar.map(s => s.partName);

  const med = median(similar.map(s => s.totalCost));
  out.push({ kind: 'benchmark', text: `Median cost of ${similar.length} similar part${similar.length > 1 ? 's' : ''}: £${med.toFixed(2)}.`, sourceParts: names });

  // Consensus material: same material on the majority of matches.
  const mats = new Map<string, number>();
  for (const s of similar) if (s.fingerprint.materialId) mats.set(s.fingerprint.materialId, (mats.get(s.fingerprint.materialId) ?? 0) + 1);
  const topMat = [...mats.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topMat && topMat[1] >= Math.ceil(similar.length / 2)) {
    out.push({ kind: 'material', text: `${topMat[1]}/${similar.length} similar parts used material "${topMat[0]}".`, sourceParts: names });
  }

  const withActual = similar.filter(s => s.actualCost && s.actualCost > 0);
  if (withActual.length) {
    const medA = median(withActual.map(s => s.actualCost!));
    out.push({ kind: 'actual', text: `Real quoted prices logged for ${withActual.length} of them — median actual £${medA.toFixed(2)}.`, sourceParts: withActual.map(s => s.partName) });
  }

  // Proactive deviation warning (the "agentic" nudge).
  if (currentTotal && currentTotal > 0 && med > 0) {
    const devPct = ((currentTotal - med) / med) * 100;
    if (Math.abs(devPct) >= 15) {
      out.push({
        kind: 'warning',
        text: `This estimate is ${devPct > 0 ? '+' : ''}${devPct.toFixed(0)}% vs similar past parts — review the inputs that differ before trusting it.`,
        sourceParts: names,
      });
    }
  }
  return out;
}

// ── Proactive insights (Step 5's deterministic core) ──────────────────────────

export interface ProactiveInsight { severity: 'info' | 'attention'; text: string; }

/**
 * Messages the tool volunteers after a costing, from its accumulated knowledge:
 * similar-part deviation (with the biggest differing bucket named), and the
 * knowledge-base state itself.
 */
export function proactiveInsights(
  similar: SimilarCase[],
  current: { totalCost: number; breakdown?: Record<string, number> },
  kbSize: number,
): ProactiveInsight[] {
  const out: ProactiveInsight[] = [];
  if (similar.length) {
    const med = median(similar.map(s => s.totalCost));
    const devPct = med > 0 ? ((current.totalCost - med) / med) * 100 : 0;
    if (Math.abs(devPct) >= 15 && current.breakdown) {
      // Name the bucket that differs most from the similar-case median breakdowns.
      const buckets = Object.keys(current.breakdown);
      let worst = ''; let worstDelta = 0;
      for (const b of buckets) {
        const past = similar.map(s => s.breakdown?.[b]).filter((v): v is number => typeof v === 'number');
        if (!past.length) continue;
        const delta = Math.abs((current.breakdown[b] ?? 0) - median(past));
        if (delta > worstDelta) { worstDelta = delta; worst = b; }
      }
      out.push({
        severity: 'attention',
        text: `Estimate is ${devPct > 0 ? '+' : ''}${devPct.toFixed(0)}% vs ${similar.length} similar past part(s)${worst ? ` — the biggest difference is in "${worst}" (Δ£${worstDelta.toFixed(2)})` : ''}. Worth a second look.`,
      });
    } else {
      out.push({ severity: 'info', text: `Consistent with ${similar.length} similar past part(s) (median £${med.toFixed(2)}).` });
    }
    const adjusted = similar.filter(s => s.userAdjusted).length;
    if (adjusted >= 2) out.push({ severity: 'info', text: `${adjusted} of the similar parts needed manual corrections after auto-fill — double-check auto-filled values here.` });
  }
  if (kbSize > 0 && !similar.length) out.push({ severity: 'info', text: `No close matches among ${kbSize} stored analyses yet — this case will teach the tool a new part family.` });
  return out;
}
