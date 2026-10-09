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
import { catalogueEntry, cataloguePriceAt, classMedianCap, descriptionCap, isNotFitted, isExactCatalogueMatch } from './pcb-price-catalogue.js';
import { classRange, classDefaultPrice } from './pcb-class-pricing.js';

export type BomLine = Record<string, unknown>;

/**
 * Image sensors are priced at AUTOMOTIVE VOLUME (the imager class rule, £3–15 — camera-board trial, Oct 2026), never at
 * a distributor listing: a listing (AR0233AT ≈ £24) is a small-quantity price several times the volume price, and a
 * named imager used to take it while an unnamed one took the volume rule (decision of 9 Oct 2026). A catalogue or live
 * hit for an imager is kept on the line as a REFERENCE only.
 */
export const IMAGER_RE = /image sensor|cmos sensor|camera sensor|imager\b/i;

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
    let hit = pn.length > 0 ? byMpn.get(pn) : undefined;

    const hitEntry = hit && hit.provider === 'catalogue' ? catalogueEntry(pn) : null;
    if (hit && IMAGER_RE.test(`${hitEntry?.desc ?? ''} ${hit.description ?? ''}`)) {
      // An imager: the listing is a reference; capUnconfirmedPrices prices the line by the imager volume rule.
      return {
        ...line,
        imagerVolumeRule: true,
        distributorListingGBP: round(hit.unitPriceGBP, 4),
        distributorListingNote: hit.sourceNote,
        catalogueMpn: hit.distPartNumber ?? hit.mpn,
        catalogueMfr: hit.manufacturer ?? hitEntry?.mfr,
        catalogueDesc: hit.description ?? hitEntry?.desc,
        catalogueAsOf: hitEntry?.asOf,
        automotiveGrade: hit.automotiveGrade,
        specSource: hit.provider === 'catalogue' ? 'catalogue' : hit.provider,
        lineConf: Math.max(num(line.lineConf), 0.95),          // the part is identified; only its price basis differs
      };
    }

    if (hit && hit.provider !== 'catalogue') {
      // A LIVE distributor price is a small-quantity break (RS: one unit; Nexar: the deepest break ≤ the board count),
      // not a price at the parts bought (pipeline review F10: "Fetch Live Prices" RAISED the BOM at programme volume).
      // At volume the catalogue's distributor-priced volume model is used and the live figure kept as a reference; with
      // no such entry the live price is moved to the parts bought along the catalogue's franchise curve and says so.
      const parts = num(line.partsBought) || qty;
      const brk = Math.max(1, num(hit.priceBreakQty, 1));
      if (parts > brk) {
        const e = catalogueEntry(pn);
        const cat = e?.confidence === 'distributor' ? cataloguePriceAt(pn, parts) : null;
        const b = -Math.log(0.85) / Math.log(10);
        const derived = hit.unitPriceGBP * Math.pow(Math.min(parts, 300_000) / brk, -b);
        const unit = cat ?? derived;
        hit = { ...hit, unitPriceGBP: unit, priceBreakQty: parts,
          sourceNote: cat != null
            ? `Catalogue ${e!.mpn} at ${parts.toLocaleString('en-GB')} parts (distributor volume model); live ${hit.provider} £${round(hit.unitPriceGBP, 4)} @${brk} shown for reference`
            : `Live ${hit.provider} £${round(hit.unitPriceGBP, 4)} @${brk}, DERIVED to ${parts.toLocaleString('en-GB')} parts along the franchise curve (10k = 1k × 0.85) — not a quote`,
          liveReferenceGBP: round(hit.unitPriceGBP, 5), liveReferenceBreak: brk } as typeof hit & { liveReferenceGBP: number; liveReferenceBreak: number };
      }
    }
    if (hit) {
      matched++;
      // The catalogue matched a FAMILY entry or another variant, not this exact code: a family price, listed to verify
      // (pipeline review F5 — "TDA4VEN" priced as TDA4VE at catalogue confidence).
      const exact = hitEntry ? isExactCatalogueMatch(pn, hitEntry) : true;
      const aiPrice = num(line.unitPriceGBP);
      const offline = hit.provider === 'catalogue';
      const entry = hitEntry;
      return {
        ...line,
        aiEstimatedPriceGBP: round(aiPrice, 4),
        unitPriceGBP: round(hit.unitPriceGBP, 5),
        lineTotalGBP: round(hit.unitPriceGBP * qty, 4),
        priceSource: 'catalogue',
        // LIVE means a distributor was asked during this run. The offline catalogue is
        // a dated table (most entries are engineering estimates) — it was badged LIVE.
        livePriced: !offline,
        catalogueConfidence: offline ? (entry?.confidence ?? 'estimate') : 'distributor',
        liveProvider: hit.provider,
        // Specifications from the source that priced the line, not the model's reading.
        specSource: offline ? 'catalogue' : hit.provider,
        catalogueMpn: hit.distPartNumber ?? hit.mpn,
        catalogueMfr: hit.manufacturer ?? entry?.mfr,
        catalogueDesc: hit.description ?? entry?.desc,
        cataloguePkg: entry?.pkg,
        catalogueAsOf: entry?.asOf,
        // The catalogue matched a FAMILY entry, not this exact part — say which part priced it.
        catalogueExact: exact,
        stockQty: hit.stockQty,
        leadTimeWeeks: hit.leadTimeWeeks,
        automotiveGrade: hit.automotiveGrade,
        lineConf: Math.max(num(line.lineConf), 0.95),
        // A catalogue ESTIMATE is a price with a stated basis, not a quote: it
        // stays in the headline (identity is confirmed) but is listed to verify
        // when the line is worth it.
        // A catalogue ESTIMATE, and a live single-unit price (RS) for a volume buy, are
        // prices with a stated basis, not quotes: listed to verify when the line matters.
        needsVerification: (!exact && hit.unitPriceGBP * qty >= 0.1) || hit.unitPriceGBP * qty >= 1 && (
          (hit.provider === 'catalogue' && /engineering estimate/.test(hit.sourceNote ?? ''))
          || (hit.provider !== 'catalogue' && (hit.priceBreakQty ?? 0) <= 1 && num(line.partsBought) > 100)),
        priceNote: `${exact ? '' : `Family price: ${pn} is not catalogued itself — priced as ${hitEntry?.mpn ?? hit.mpn}; confirm the variant. `}${hit.sourceNote ?? (line.priceNote as string | undefined) ?? ''}`,
      };
    }

    // No catalogue match. The line is priced from the tool's own tables in
    // capUnconfirmedPrices; here it is only flagged when its identity is weak.
    const conf = num(line.lineConf);
    const flag = pn.length === 0 || conf < VERIFY_CONFIDENCE_THRESHOLD;
    if (flag) needsVerification++;
    return {
      ...line,
      priceSource: (line.priceSource as string) ?? 'ai-estimate',
      specSource: 'photo',
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
      sourceNote: `Catalogue ${e.mpn} (${e.confidence === 'distributor' ? 'distributor price' : 'engineering estimate'}, ${e.asOf}): ${e.source}; at ${qty.toLocaleString('en-GB')} from the 1k/10k/100k/200k/300k breaks`
        // Above the largest published break the catalogue's breaks are DERIVED along a slope (pipeline review F9) — say so.
        + (e.confidence === 'distributor' && qty > (e.volumeModel?.derivedAbove ?? 1000)
          ? ` — DERIVED above the largest published break (${(e.volumeModel?.derivedAbove ?? 1000).toLocaleString('en-GB')}) along ${e.volumeModel ? `slope b = ${e.volumeModel.b} (${e.volumeModel.basis})` : 'the franchise curve (10k = 1k × 0.85)'}, not a quote`
          : ''),
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

export interface CapOptions {
  automotive?: boolean;
  /** The order's price factor relative to the 100K basis of the class table (pcb.ts
   *  getVolumeMultiplier). Model estimates arrive already scaled by it; the table
   *  must be too, or a 100-board order is clamped back to 100K prices. Default 1. */
  volumeMultiplier?: number;
}

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
      || ((line.bomSource === 'file' || line.bomSource === 'image') && pn.length > 0);
    const range0 = knownRange?.(line) ?? null;
    // An image sensor is priced by the imager volume rule whoever names it (decision of 9 Oct 2026): a named-part range
    // (Sony IMX, OmniVision OX) or the model's component type ("ic_qfn") used to route it elsewhere — AR0233AT came
    // out £13.20 as a BGA and £3.52 as a QFN, an OCR-read IMX390 £30 (pipeline review F12).
    const imager = line.imagerVolumeRule === true || IMAGER_RE.test(`${String(line.description ?? '')} ${String(line.catalogueDesc ?? '')}`)
      || (range0 != null && IMAGER_RE.test(range0.label));
    const range = range0 && !imager && (identityConfirmed || range0.generic) ? range0 : null;
    if (range) {
      // The point inside the range is the TOOL's — its lower-half midpoint — never the model's estimate, which used
      // to choose it (pipeline review F2: one unread "ADAS processor" line moved the board from £95 to £384 with the
      // model's number alone). The estimate is kept for audit only.
      const inRange = round(range.lo + (range.hi - range.lo) * 0.25, 4);
      if (Math.abs(inRange - unit) > 1e-6) capped++;
      return {
        ...line,
        aiEstimatedPriceGBP: (line.aiEstimatedPriceGBP as number) ?? round(unit, 4),
        unitPriceGBP: round(inRange, 4),
        lineTotalGBP: round(inRange * qty0, 4),
        priceSource: range.generic ? 'function-range' : 'known-range',
        priceCapped: inRange < unit - 1e-6,
        priceRaised: inRange > unit + 1e-6,
        priceNote: `${range.generic ? 'Part not read; ' : line.bomSource === 'file' || line.bomSource === 'image' ? 'Named in your BOM: ' : 'OCR-confirmed '}${range.label}; tool range £${range.lo}–${range.hi} at this volume, priced at its lower-half midpoint${unit > 0 ? ` (AI estimate £${round(unit, 4)} not used)` : ''} — confirm with a quote`
          + (line.priceNote ? ` · ${String(line.priceNote)}` : ''),
        needsVerification: true,
      };
    }
    // EVERY line without a catalogue or live hit is priced from the tool's own
    // table — the model's estimate never reaches the total on its own. A line
    // used to keep the model's price whenever it carried a part number, lineConf
    // ≥ 0.6 and a price ≤ £10, and was then counted as CONFIRMED (PCB review,
    // Oct 2026: the golden rule "AI never sets a price" was broken for most of a
    // typical BOM).
    const qty = qty0;
    // Every other unconfirmed line is priced INSIDE its class range (the tool's
    // own table, pcb-class-pricing.ts). The model's estimate only chooses the
    // point within the range; with no estimate the line lands at the lower-half
    // midpoint. Ceilings: the class median for an unidentified part (a guessed
    // "AURIX-class" BGA must not enter at £60) and the description caps (an
    // inductor, an electrolytic, a SOT-23 diode) where they are tighter.
    const k = num(line.volumeMultiplier) > 0 ? num(line.volumeMultiplier) : opts.volumeMultiplier && opts.volumeMultiplier > 0 ? opts.volumeMultiplier : 1;
    // A catalogue-identified imager carries the catalogue's description, so the imager class row applies even when the
    // BOM line names only the part number ("AR0233AT").
    const cls0 = classRange({ ...line, ...(imager ? { componentType: 'ic_bga' } : {}),
      description: `${String(line.description ?? '')} ${String(line.partNumber ?? '')}${imager ? ' image sensor' : ''}${line.imagerVolumeRule === true ? ` ${String(line.catalogueDesc ?? '')}` : ''}` }, opts.automotive === true);
    const cls = k === 1 ? cls0 : { ...cls0, lo: round(cls0.lo * k, 5), hi: round(cls0.hi * k, 5) };
    const dCap = descriptionCap(String(line.description ?? ''));
    // The class median is a guard for an UNIDENTIFIED part ("some BGA"); a line
    // whose description names its kind (inductor, PMIC, electrolytic) is bounded
    // by that kind's own range instead.
    // An IC nobody read (no evidenced part number) is unidentified whatever the model called it: "ADAS radar processor"
    // on an unread BGA used to select the £60–400 row (pipeline review F2) — the description is a guess, so the class
    // median bounds it. Passives, connectors and other kinds keep their kind's own row.
    const unidentified = /\.any(\.|$)/.test(cls.key) || /\b(class|est|unknown|generic)\b/i.test(pn) || (pn.length === 0 && /^ic_/.test(cls.key));
    // The median of the TABLE class the line was priced in (an imager is a BGA-class part whatever package the model named).
    const ceiling = Math.min(unidentified ? classMedianCap(cls.key.split('.')[0], Infinity) * k : Infinity, cls.hi, dCap != null ? dCap * k : Infinity);
    const lo = Math.min(cls.lo, ceiling);
    // The TOOL's point in the range (lower-half midpoint, under the ceiling) — never the model's estimate, which used to
    // choose it: on the radar fixture the model's numbers alone moved the board £57.54 → £90.40 (pipeline review F2).
    const priced = Math.max(lo, Math.min(classDefaultPrice(cls0) * k, ceiling));
    const lowered = priced < unit - 1e-6;
    // Counted as a cap only when it moved the price by a margin (a 0402 guessed
    // £0.001 over its ceiling is a rounding, not a caught misread).
    if (lowered && (unit - priced) / unit > 0.10) capped++;
    const lineTotal = round(priced * qty, 4);
    return {
      ...line,
      aiEstimatedPriceGBP: (line.aiEstimatedPriceGBP as number) ?? (unit > 0 ? round(unit, 4) : undefined),
      unitPriceGBP: round(priced, 5),
      lineTotalGBP: lineTotal,
      priceSource: 'class-range',
      priceBasis: cls.key,
      priceCapped: lowered,
      priceRaised: priced > unit + 1e-6 && unit > 0,
      priceNote: `${cls.label}: table range £${round(cls.lo, 4)}–£${round(cls.hi, 4)} at this volume${ceiling < cls.hi ? `, ceiling £${round(ceiling, 3)} (unidentified part)` : ''}; priced at the lower-half midpoint${unit > 0 ? ` (AI estimate £${round(unit, 4)} not used)` : ''}`
        + (line.imagerVolumeRule === true && line.distributorListingGBP != null
          ? `; distributor listing £${round(num(line.distributorListingGBP), 2)} shown for reference only — imagers are priced at automotive volume`
          : ''),
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
  const c = round(confirmed, 2);
  return { confirmed: c, unverified: round(round(confirmed + unverified, 2) - c, 2) };
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
    // Counted on the FINAL lines: the cap step flags lines too, and the count shown
    // on screen must equal the rows marked "to verify" (it counted reconcile only).
    needsVerification: capResult.bom.filter(l => l.needsVerification === true).length,
    capped: capResult.capped,
  };
}
