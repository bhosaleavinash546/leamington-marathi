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
import { catalogueEntry, cataloguePriceAt, classMedianCap, descriptionCap, isNotFitted } from './pcb-price-catalogue.js';
import { classRange, classDefaultPrice } from './pcb-class-pricing.js';

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
        // A catalogue ESTIMATE is a price with a stated basis, not a quote: it
        // stays in the headline (identity is confirmed) but is listed to verify
        // when the line is worth it.
        needsVerification: hit.provider === 'catalogue' && /engineering estimate/.test(hit.sourceNote ?? '') && hit.unitPriceGBP * qty >= 1,
        priceNote: hit.sourceNote ?? (line.priceNote as string | undefined),
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
    const e = catalogueEntry(pn);
    const price = cataloguePriceAt(pn, qty);
    if (!e || price == null) continue;
    out.push({
      mpn: pn, description: e.desc, manufacturer: e.mfr,
      unitPriceGBP: price, priceBreakQty: qty, stockQty: 0, leadTimeWeeks: null,
      provider: 'catalogue', automotiveGrade: e.aecq, distPartNumber: e.mpn,
      rawCurrency: 'GBP', rawUnitPrice: price,
      sourceNote: `Catalogue ${e.mpn} (${e.confidence === 'distributor' ? 'distributor price' : 'engineering estimate'}, ${e.asOf}): ${e.source}; at ${qty.toLocaleString('en-GB')} from the 1k/10k/100k breaks`,
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
// A costly line with NO catalogue/live confirmation is a verification risk even
// when the model sounded confident: a confident MISREAD (a BGA read as an £84
// FPGA) escapes every confidence-based check. Any unmatched line above this
// unit price is treated as unverified — capped to its class median AND flagged.
const HIGH_VALUE_UNMATCHED_GBP = 10;

/** The tool's own stated price range for a part it can name (e.g. an OCR-read
 *  NXP S32R294 → £22–48 at 100K). Supplied by the route, which owns the ranges. */
export type KnownRange = (line: BomLine) => { lo: number; hi: number; label: string; generic?: boolean } | null;

export interface CapOptions { automotive?: boolean }

export function capUnconfirmedPrices(bom: BomLine[], knownRange?: KnownRange, opts: CapOptions = {}): { bom: BomLine[]; capped: number } {
  let capped = 0;
  const out = bom.map(line => {
    const verified = line.livePriced === true || line.priceSource === 'catalogue';
    if (verified) return line;                       // a real catalogue/live hit is trusted
    const pn = String(line.partNumber ?? '').trim();
    const unit = num(line.unitPriceGBP);
    const qty0 = num(line.qty, 1);
    // Bare pads / test points / unfitted footprints carry no part. The radar run
    // priced "test/board-to-board header pads" as two £4.40 connectors.
    if (isNotFitted(line)) {
      if (unit === 0) return line;
      capped++;
      return {
        ...line,
        aiEstimatedPriceGBP: (line.aiEstimatedPriceGBP as number) ?? round(unit, 4),
        unitPriceGBP: 0, lineTotalGBP: 0,
        priceSource: 'not-fitted', priceCapped: true, notFitted: true,
        priceNote: 'Described as pads / test points / not fitted — no part to buy. Price it if a part is actually fitted.',
        needsVerification: true,
      };
    }
    // A part the tool can name — read off the chip, or a function only one class of
    // die performs (a 77 GHz transceiver) — is held inside the tool's stated range
    // at this volume, UP as well as down: a TEF8105-class MMIC guessed at £4 is as
    // wrong as an S32R294 cut to a generic £18 median. Still flagged: a range is not a quote.
    // Identity is confirmed by a chip marking read with confidence, or by a part
    // number in the user's BOM file — the file names the part.
    const identityConfirmed = (line.ocrExtracted === true && num(line.lineConf) >= 0.95)
      || (line.bomSource === 'file' && pn.length > 0);
    const range0 = knownRange?.(line) ?? null;
    const range = range0 && (identityConfirmed || range0.generic) ? range0 : null;
    if (range) {
      // No estimate at all (a BOM-file line): the lower-half midpoint, not the floor.
      const est = unit > 0 ? unit : range.lo + (range.hi - range.lo) * 0.25;
      const inRange = Math.min(Math.max(est, range.lo), range.hi);
      if (Math.abs(inRange - unit) > 1e-6) capped++;
      return {
        ...line,
        aiEstimatedPriceGBP: (line.aiEstimatedPriceGBP as number) ?? round(unit, 4),
        unitPriceGBP: round(inRange, 4),
        lineTotalGBP: round(inRange * qty0, 2),
        priceSource: range.generic ? 'function-range' : 'known-range',
        priceCapped: inRange < unit - 1e-6,
        priceRaised: inRange > unit + 1e-6,
        priceNote: `${range.generic ? 'Part not read; ' : line.bomSource === 'file' ? 'Named in your BOM: ' : 'OCR-confirmed '}${range.label}; tool range £${range.lo}–${range.hi} at this volume${unit > 0 ? '' : '; no estimate — lower-half midpoint'} — confirm with a quote`
          + (line.priceNote ? ` · ${String(line.priceNote)}` : ''),
        needsVerification: true,
      };
    }
    const unconfirmed = line.needsVerification === true
      || line.unconfirmedHighValue === true
      || line.bomSource === 'file'                    // a file names the part; the table prices it
      || !(unit > 0)                                  // no estimate at all
      || pn.length === 0
      || /\b(class|est|unknown|generic)\b/i.test(pn)
      // Magnitude / no-match guard — the fix for confident misreads.
      || unit > HIGH_VALUE_UNMATCHED_GBP;
    if (!unconfirmed) return line;
    const qty = qty0;
    // Every other unconfirmed line is priced INSIDE its class range (the tool's
    // own table, pcb-class-pricing.ts). The model's estimate only chooses the
    // point within the range; with no estimate the line lands at the lower-half
    // midpoint. Ceilings: the class median for an unidentified part (a guessed
    // "AURIX-class" BGA must not enter at £60) and the description caps (an
    // inductor, an electrolytic, a SOT-23 diode) where they are tighter.
    const cls = classRange({ ...line, description: `${String(line.description ?? '')} ${String(line.partNumber ?? '')}` }, opts.automotive === true);
    const dCap = descriptionCap(String(line.description ?? ''));
    // The class median is a guard for an UNIDENTIFIED part ("some BGA"); a line
    // whose description names its kind (inductor, PMIC, electrolytic) is bounded
    // by that kind's own range instead.
    const unidentified = /\.any(\.|$)/.test(cls.key) || /\b(class|est|unknown|generic)\b/i.test(pn);
    const ceiling = Math.min(unidentified ? classMedianCap(String(line.componentType ?? ''), Infinity) : Infinity, cls.hi, dCap ?? Infinity);
    const lo = Math.min(cls.lo, ceiling);
    const priced = unit > 0 ? Math.min(Math.max(unit, lo), ceiling) : Math.min(classDefaultPrice(cls), ceiling);
    const lowered = priced < unit - 1e-6;
    // Counted as a cap only when it moved the price by a margin (a 0402 guessed
    // £0.001 over its ceiling is a rounding, not a caught misread).
    if (lowered && (unit - priced) / unit > 0.10) capped++;
    const lineTotal = round(priced * qty, 2);
    return {
      ...line,
      aiEstimatedPriceGBP: (line.aiEstimatedPriceGBP as number) ?? (unit > 0 ? round(unit, 4) : undefined),
      unitPriceGBP: round(priced, 5),
      lineTotalGBP: lineTotal,
      priceSource: 'class-range',
      priceBasis: cls.key,
      priceCapped: lowered,
      priceRaised: priced > unit + 1e-6 && unit > 0,
      priceNote: `${cls.label}: table range £${cls.lo}–£${cls.hi} at 100K${ceiling < cls.hi ? `, ceiling £${round(ceiling, 3)} (unidentified part)` : ''}${unit > 0 ? `; AI estimate £${round(unit, 4)}` : '; no estimate — lower-half midpoint'}`,
      // A table price is a class average, not a quote: worth an engineer's minute
      // only where the line moves the board (≥ £1). Passives priced by count from
      // the table are the best anyone can do without an order, and stay in the
      // priced total instead of flooding "to verify" with £0.37 lines.
      needsVerification: lineTotal >= 1 || unit > HIGH_VALUE_UNMATCHED_GBP,
    };
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
export function groundAndSplit(bom: BomLine[], livePrices: LivePriceResult[], knownRange?: KnownRange, opts: CapOptions = {}): GroundingOutcome {
  const reconciled = reconcileBomWithCatalogue(bom, livePrices);
  const capResult = capUnconfirmedPrices(reconciled.bom, knownRange, opts);
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
