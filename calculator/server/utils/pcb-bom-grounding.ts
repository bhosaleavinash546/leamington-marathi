/**
 * BOM ↔ catalogue reconciliation and confidence flagging.
 *
 * Pure, deterministic, unit-testable. Given a BOM (AI-extracted, with guessed
 * prices) and a set of live distributor price results, it:
 *   - replaces guessed prices with catalogue prices where the MPN matches,
 *   - preserves the AI estimate for transparency,
 *   - tags each line's price provenance (catalogue vs ai-estimate),
 *   - flags low-confidence / unverified lines for human review (Rec #3).
 *
 * This makes the cost defensible ("this price came from RS, MPN matched, in
 * stock") rather than a black-box guess, and surfaces exactly which lines a
 * new user should double-check before trusting the total.
 */

import type { LivePriceResult } from './pcb-live-pricing.js';

export type BomLine = Record<string, unknown>;

/** Below this line-confidence, a line that was NOT catalogue-verified is flagged for review. */
export const VERIFY_CONFIDENCE_THRESHOLD = 0.6;

function num(v: unknown, d = 0): number { const n = Number(v); return Number.isFinite(n) ? n : d; }
function round(v: number, dp: number): number { const f = 10 ** dp; return Math.round(v * f) / f; }

export interface ReconcileResult {
  bom: BomLine[];
  matched: number;          // lines priced from the catalogue
  needsVerification: number; // lines flagged for human review
}

/**
 * Merge catalogue prices into the BOM and flag every line's verification state.
 * Lines without a catalogue match keep their AI estimate but are marked
 * `priceSource: 'ai-estimate'`; those below the confidence threshold (or with no
 * part number at all) get `needsVerification: true`.
 */
export function reconcileBomWithCatalogue(
  bom: BomLine[],
  livePrices: LivePriceResult[],
): ReconcileResult {
  const byMpn = new Map<string, LivePriceResult>();
  for (const p of livePrices) byMpn.set(p.mpn.trim().toUpperCase(), p);

  let matched = 0;
  let needsVerification = 0;

  const out = bom.map(line => {
    const pn = String(line.partNumber ?? '').trim().toUpperCase();
    const qty = num(line.qty, 1);
    const hit = pn.length > 0 ? byMpn.get(pn) : undefined;

    if (hit) {
      matched++;
      const aiPrice = num(line.unitPriceGBP);
      return {
        ...line,
        aiEstimatedPriceGBP: round(aiPrice, 4),
        unitPriceGBP: round(hit.unitPriceGBP, 4),
        lineTotalGBP: round(hit.unitPriceGBP * qty, 2),
        priceSource: 'catalogue',
        livePriced: true,
        liveProvider: hit.provider,
        stockQty: hit.stockQty,
        leadTimeWeeks: hit.leadTimeWeeks,
        automotiveGrade: hit.automotiveGrade,
        lineConf: Math.max(num(line.lineConf), 0.95),
        needsVerification: false,
      };
    }

    // No catalogue match — keep the AI estimate, flag if low-confidence or unidentified.
    const conf = num(line.lineConf);
    const flag = pn.length === 0 || conf < VERIFY_CONFIDENCE_THRESHOLD;
    if (flag) needsVerification++;
    return {
      ...line,
      priceSource: (line.priceSource as string) ?? 'ai-estimate',
      needsVerification: flag,
    };
  });

  return { bom: out, matched, needsVerification };
}

/**
 * Flag verification state WITHOUT any catalogue data (used when no parts-API key
 * is configured) so the human-in-the-loop review still works offline.
 */
export function flagBomConfidence(bom: BomLine[]): ReconcileResult {
  return reconcileBomWithCatalogue(bom, []);
}

/** Candidate part numbers worth grounding: any line with a plausible MPN, capped. */
export function groundingCandidates(bom: BomLine[], cap = 20): string[] {
  const seen = new Set<string>();
  for (const line of bom) {
    const pn = String(line.partNumber ?? '').trim();
    if (pn.length > 3) seen.add(pn);
    if (seen.size >= cap) break;
  }
  return [...seen];
}
