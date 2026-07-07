/**
 * PCB vision accuracy harness (Rec #4).
 *
 * Scores a predicted BOM (from the image pipeline) against a labelled
 * ground-truth BOM, so "accuracy" becomes a measured number — detection
 * precision/recall, part-number accuracy, and price error — instead of an
 * assertion. Pure and deterministic: the scoring is unit-tested here; plug real
 * labelled boards into tests/fixtures/pcb-boards/ to measure the live pipeline.
 */

export interface BomItem {
  refDes?: string;
  partNumber?: string;
  componentType?: string;
  unitPriceGBP?: number;
  qty?: number;
}

export interface BomScore {
  truePositives:  number;   // components detected that exist on the board
  falsePositives: number;   // detected but not real (hallucinated / duplicated)
  falseNegatives: number;   // real but missed
  componentPrecision: number;
  componentRecall:    number;
  componentF1:        number;
  partNumberAccuracy: number; // of matched components, fraction with the correct MPN
  priceMAPE:          number; // mean abs % price error over matched priced items (0..1+)
  totalCostError:     number; // |Σpred − Σtruth| / Σtruth
}

const norm = (s: unknown) => String(s ?? '').trim().toUpperCase();
const lineTotal = (i: BomItem) => (Number(i.qty) || 0) * (Number(i.unitPriceGBP) || 0);

/**
 * Expand a grouped reference designator into individual refs so that a
 * predicted "R1-R10" scores against ten truth lines "R1".."R10" (and vice
 * versa) instead of collapsing to a single unmatchable key (audit fix).
 * Handles "R1-R10", "C1–C4" (en-dash), comma/space lists "R1, R2 R3",
 * and plain single refs. Malformed ranges fall back to the raw token.
 */
export function expandRefDes(refDes: unknown): string[] {
  const raw = norm(refDes);
  if (!raw) return [];
  const out: string[] = [];
  for (const token of raw.split(/[,\s]+/).filter(Boolean)) {
    const m = /^([A-Z]+)(\d+)[-–]([A-Z]*)(\d+)$/.exec(token);
    if (m && (m[3] === '' || m[3] === m[1])) {
      const prefix = m[1];
      const lo = parseInt(m[2], 10), hi = parseInt(m[4], 10);
      if (hi >= lo && hi - lo < 500) {
        for (let n = lo; n <= hi; n++) out.push(`${prefix}${n}`);
        continue;
      }
    }
    out.push(token);
  }
  return out;
}

/** Score predicted vs ground-truth, matching components by reference designator. */
export function scoreBom(predicted: BomItem[], truth: BomItem[]): BomScore {
  const predByRef = new Map<string, BomItem>();
  for (const p of predicted) for (const r of expandRefDes(p.refDes)) predByRef.set(r, p);
  const truthByRef = new Map<string, BomItem>();
  for (const t of truth) for (const r of expandRefDes(t.refDes)) truthByRef.set(r, t);

  let tp = 0, pnCorrect = 0, pnComparable = 0;
  const mape: number[] = [];

  for (const [ref, t] of truthByRef) {
    const p = predByRef.get(ref);
    if (!p) continue;
    tp++;
    const tPN = norm(t.partNumber), pPN = norm(p.partNumber);
    if (tPN) { pnComparable++; if (tPN === pPN) pnCorrect++; }
    const tPrice = Number(t.unitPriceGBP);
    const pPrice = Number(p.unitPriceGBP);
    if (Number.isFinite(tPrice) && tPrice > 0 && Number.isFinite(pPrice)) {
      mape.push(Math.abs(pPrice - tPrice) / tPrice);
    }
  }

  const fp = predByRef.size - tp;       // predicted refs with no truth match
  const fn = truthByRef.size - tp;      // truth refs the pipeline missed
  const precision = predByRef.size ? tp / predByRef.size : 0;
  const recall    = truthByRef.size ? tp / truthByRef.size : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

  const truthTotal = truth.reduce((s, i) => s + lineTotal(i), 0);
  const predTotal  = predicted.reduce((s, i) => s + lineTotal(i), 0);
  const totalCostError = truthTotal > 0 ? Math.abs(predTotal - truthTotal) / truthTotal : 0;

  return {
    truePositives: tp, falsePositives: fp, falseNegatives: fn,
    componentPrecision: precision, componentRecall: recall, componentF1: f1,
    partNumberAccuracy: pnComparable ? pnCorrect / pnComparable : 0,
    priceMAPE: mape.length ? mape.reduce((a, b) => a + b, 0) / mape.length : 0,
    totalCostError,
  };
}

/** Aggregate scores across several boards (macro-average). */
export function aggregateScores(scores: BomScore[]): BomScore {
  if (!scores.length) return scoreBom([], []);
  const avg = (sel: (s: BomScore) => number) => scores.reduce((a, s) => a + sel(s), 0) / scores.length;
  const sum = (sel: (s: BomScore) => number) => scores.reduce((a, s) => a + sel(s), 0);
  return {
    truePositives: sum(s => s.truePositives),
    falsePositives: sum(s => s.falsePositives),
    falseNegatives: sum(s => s.falseNegatives),
    componentPrecision: avg(s => s.componentPrecision),
    componentRecall: avg(s => s.componentRecall),
    componentF1: avg(s => s.componentF1),
    partNumberAccuracy: avg(s => s.partNumberAccuracy),
    priceMAPE: avg(s => s.priceMAPE),
    totalCostError: avg(s => s.totalCostError),
  };
}
