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
import { cataloguePrice, classMedianCap } from './pcb-price-catalogue.js';

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

/**
 * Offline catalogue prices for candidate MPNs — no distributor API, no network.
 * Lets confirmed lines snap to real market prices in air-gapped/on-prem deployments
 * (and everywhere a live provider key isn't configured). Returns LivePriceResult[]
 * so it feeds reconcileBomWithCatalogue exactly like a live provider would.
 */
export function offlineCataloguePrices(partNumbers: string[], qty: number): LivePriceResult[] {
  const out: LivePriceResult[] = [];
  for (const pn of partNumbers) {
    const price = cataloguePrice(pn);
    if (price == null) continue;
    out.push({
      mpn: pn, description: 'offline catalogue', manufacturer: '',
      unitPriceGBP: price, priceBreakQty: qty, stockQty: 0, leadTimeWeeks: null,
      provider: 'catalogue', automotiveGrade: true, distPartNumber: '',
      rawCurrency: 'GBP', rawUnitPrice: price,
    });
  }
  return out;
}

/**
 * Cap the price of every UNCONFIRMED line (no catalogue match, not OCR-confirmed)
 * to its component-class median. This is the single most important accuracy fix:
 * when the model can't read a high-value part it estimates conservatively HIGH
 * (a guessed "AURIX-class MCU" at £60, a "sealed header" at £24), and that single
 * guess can triple the board cost. The cap never RAISES a price.
 */
export function capUnconfirmedPrices(bom: BomLine[]): { bom: BomLine[]; capped: number } {
  let capped = 0;
  const out = bom.map(line => {
    const verified = line.livePriced === true || line.priceSource === 'catalogue';
    const pn = String(line.partNumber ?? '').trim();
    const unconfirmed = line.needsVerification === true
      || line.unconfirmedHighValue === true
      || pn.length === 0
      || /\b(class|est|unknown|generic)\b/i.test(pn);
    if (verified || !unconfirmed) return line;
    const unit = num(line.unitPriceGBP);
    const capUnit = classMedianCap(String(line.componentType ?? ''), unit);
    if (capUnit < unit - 1e-6) {
      capped++;
      const qty = num(line.qty, 1);
      return {
        ...line,
        aiEstimatedPriceGBP: (line.aiEstimatedPriceGBP as number) ?? round(unit, 4),
        unitPriceGBP: round(capUnit, 4),
        lineTotalGBP: round(capUnit * qty, 2),
        priceSource: 'class-median-cap',
        priceCapped: true,
        // A capped line is, by definition, an unconfirmed guess — send it to the
        // "needs verification" bucket so it never inflates the confirmed headline.
        needsVerification: true,
      };
    }
    return line;
  });
  return { bom: out, capped };
}

/** Split the BOM total into a confirmed subtotal and a flagged "needs verification"
 *  subtotal, so the headline should-cost isn't dominated by unconfirmed guesses. */
export function splitConfirmedUnverified(bom: BomLine[]): { confirmed: number; unverified: number } {
  let confirmed = 0, unverified = 0;
  for (const l of bom) {
    const t = num(l.lineTotalGBP);
    if (l.needsVerification === true) unverified += t; else confirmed += t;
  }
  return { confirmed: round(confirmed, 2), unverified: round(unverified, 2) };
}

export interface GroundingOutcome {
  bom: BomLine[];
  bomTotal: number;        // resummed from grounded + capped line prices
  confirmedTotal: number;  // catalogue-verified / high-confidence lines
  unverifiedTotal: number; // flagged lines (capped to class median)
  matched: number;         // catalogue/live hits
  needsVerification: number;
  capped: number;          // class-median caps applied
}

/**
 * One-shot grounding for a BOM: reconcile against catalogue/live prices, cap the
 * unconfirmed lines, resum the total, and split confirmed vs needs-verification.
 * Called from BOTH the streaming and non-streaming Stage-4 paths so they can't drift.
 */
export function groundAndSplit(bom: BomLine[], livePrices: LivePriceResult[]): GroundingOutcome {
  const reconciled = reconcileBomWithCatalogue(bom, livePrices);
  const capResult = capUnconfirmedPrices(reconciled.bom);
  const split = splitConfirmedUnverified(capResult.bom);
  return {
    bom: capResult.bom,
    bomTotal: round(split.confirmed + split.unverified, 2),
    confirmedTotal: split.confirmed,
    unverifiedTotal: split.unverified,
    matched: reconciled.matched,
    needsVerification: reconciled.needsVerification,
    capped: capResult.capped,
  };
}
