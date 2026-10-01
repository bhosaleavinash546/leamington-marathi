// ─── Offline component price catalogue ───────────────────────────────────────
// Purpose: price BOM lines by part number WITHOUT an external distributor API.
// The data lives in server/data/pcb-component-catalogue.json — one entry per
// part or family, with GBP prices at the 1k / 10k / 100k breaks and, on every
// entry, where the number came from and when:
//   confidence "distributor" — a distributor's published price read on `asOf`
//   confidence "estimate"    — an engineering estimate at 2025/26 distributor levels
// Refresh / extend it with scripts/pcb-catalogue-import.ts (a distributor CSV
// export, or Nexar when a key exists). A live provider hit, when available, wins.

import { readFileSync } from 'node:fs';

export interface CatalogueEntry {
  mpn: string; family: string; mfr: string; desc: string; category: string; pkg: string; aecq: boolean;
  /** Other spellings the part is seen under — chip top marks ("25Q32JW", "1044AV"), order codes. */
  aliases?: string[];
  gbp: { q1k: number; q10k: number; q100k: number };
  confidence: 'distributor' | 'estimate'; source: string; asOf: string;
}
interface CatalogueFile { asOf: string; fxUsdToGbp: number; currency: string; basis: string; parts: CatalogueEntry[] }

const FILE = new URL('../data/pcb-component-catalogue.json', import.meta.url);
const CAT: CatalogueFile = JSON.parse(readFileSync(FILE, 'utf8'));
export const CATALOGUE_AS_OF: string = CAT.asOf;
export const CATALOGUE_SIZE: number = CAT.parts.length;

/** Normalise an MPN for matching: uppercase, drop packaging/grade/rev suffixes. */
export function normaliseMPN(raw: string): string {
  return (raw || '')
    .toUpperCase()
    .replace(/\([^)]*\)/g, '')                 // strip "(est. …)" notes
    .replace(/[✓✔⚠★]/g, '')
    .replace(/\s+/g, '')
    .replace(/[,;].*$/, '')                     // first token only
    .trim();
}

// Exact keys (normalised mpn and family) → entry; family keys also serve as prefixes.
const EXACT = new Map<string, CatalogueEntry>();
const PREFIX: Array<[string, CatalogueEntry]> = [];
for (const e of CAT.parts) {
  const keys = new Set([normaliseMPN(e.mpn), normaliseMPN(e.family), ...(e.aliases ?? []).map(normaliseMPN)]);
  for (const k of keys) if (k && !EXACT.has(k)) EXACT.set(k, e);
  // A prefix must be specific enough to name a family: ≥4 chars with a digit.
  for (const k of keys) if (k.length >= 4 && /\d/.test(k)) PREFIX.push([k, e]);
}
PREFIX.sort((a, b) => b[0].length - a[0].length);   // longest first

/**
 * The catalogue entry for an MPN, or null if the string is not a plausible
 * orderable part (a description like "OBD-II DE9" or a guessed family like
 * "MX150-class" returns null → the line stays flagged for verification).
 */
export function catalogueEntry(mpn: string): CatalogueEntry | null {
  if (!mpn) return null;
  if (/\b(CLASS|EST|UNKNOWN|GENERIC)\b/i.test(mpn)) return null;
  // Candidate tokens: the whole string AND each whitespace/comma token, so
  // "NXP TJA1145" and "TJA1044GT/3" both resolve to the manufacturer part.
  const cands = new Set<string>([normaliseMPN(mpn)]);
  for (const tok of mpn.toUpperCase().split(/[\s,;/]+/)) {
    const t = normaliseMPN(tok);
    if (t.length >= 4) cands.add(t);
  }
  for (const c of cands) { const e = EXACT.get(c); if (e) return e; }
  for (const c of cands) for (const [pre, e] of PREFIX) if (c.startsWith(pre)) return e;
  return null;
}

/** Catalogue unit price at the ~10k break (GBP), or null. */
export function cataloguePrice(mpn: string): number | null {
  return catalogueEntry(mpn)?.gbp.q10k ?? null;
}

/** Catalogue unit price at an order quantity: log-linear between the 1k / 10k /
 *  100k breaks, the 1k price below 1k scaled by the prototype curve, flat above 100k. */
export function cataloguePriceAt(mpn: string, qty: number): number | null {
  const e = catalogueEntry(mpn);
  if (!e) return null;
  const { q1k, q10k, q100k } = e.gbp;
  const q = Math.max(1, qty || 1);
  const lerp = (qa: number, pa: number, qb: number, pb: number) => {
    const t = (Math.log10(q) - Math.log10(qa)) / (Math.log10(qb) - Math.log10(qa));
    return pa + (pb - pa) * t;
  };
  let p: number;
  if (q >= 100000) p = q100k;
  else if (q >= 10000) p = lerp(10000, q10k, 100000, q100k);
  else if (q >= 1000) p = lerp(1000, q1k, 10000, q10k);
  else p = q1k * volumeScaleFrom10k(q) / volumeScaleFrom10k(1000);
  return Math.round(p * 10000) / 10000;
}

/**
 * Multiplier relative to the ~10k price for an order quantity (1.0 at 10k):
 * gentle for production volumes, steeper for prototype quantities.
 */
export function volumeScaleFrom10k(qty: number): number {
  const steps: Array<[number, number]> = [
    [100, 2.4], [500, 1.8], [1000, 1.45], [2500, 1.22],
    [5000, 1.10], [10000, 1.00], [25000, 0.95], [100000, 0.90],
  ];
  for (const [maxQty, mult] of steps) if (qty <= maxQty) return mult;
  return 0.87;
}

// Category median caps (GBP) — the most an UNCONFIRMED part of this class may
// contribute per unit. Stops a conservative AI guess (e.g. "automotive MCU BGA")
// from entering the BOM at 3–4× market when the exact part can't be read.
const CLASS_MEDIAN: Record<string, number> = {
  ic_bga: 18.00, ic_tqfp: 6.00, ic_qfp: 6.00, ic_qfn: 4.00, ic_soic: 3.50,
  ic_sot: 1.20, ic: 4.00,
  connector_smt: 6.00, through_hole: 3.50, connector: 6.00,
  crystal_osc: 2.00, fuse_tvs: 0.60,
  passive_0402: 0.03, passive_0603: 0.06, passive_0805: 0.08, passive_1206: 0.12, passive: 0.06,
};

/** Power inductors / chokes have no component type of their own (the prompt's
 *  list has none), so they arrive as passive_0805 and were capped at a chip
 *  capacitor's £0.08. The tool's own anchor is £0.018–0.60 for 0805-class
 *  inductors, ×3–5 at AEC-Q200 — cap at that ceiling instead. */
export const POWER_INDUCTOR_CAP_GBP = 1.80;

/** An aluminium electrolytic filed as through_hole met a £3.50 connector-class
 *  cap, so the radar run's two 100 µF / 100 V came in at £1.58 each. Research
 *  (2026-10-01): Nichicon UCD 100 µF / 100 V $1.04 @1k, Panasonic EEE-FK
 *  100 µF / 35 V $0.17–0.27 @1k — so the ceiling is £0.90, not the £0.60 first set. */
export const ELECTROLYTIC_CAP_GBP = 0.90;
/** SOT-23 / SOD-123-class diodes, TVS and small-signal transistors: £0.02–0.10. */
export const SMALL_SIGNAL_DISCRETE_CAP_GBP = 0.12;

/** The tightest cap a line's DESCRIPTION justifies, or null when it names no such part. */
export function descriptionCap(description: string): number | null {
  const d = description || '';
  if (/inductor|choke/i.test(d)) return POWER_INDUCTOR_CAP_GBP;
  if (/electrolytic/i.test(d)) return ELECTROLYTIC_CAP_GBP;
  if (/\b(SOT-?23|SOD-?123|SOD-?323|SOD-?523|SC-?70|SOT-?323)\b/i.test(d)
    && /diode|TVS|transistor|MOSFET|\bESD\b|rectifier|zener/i.test(d)
    && !/regulator|\bLDO\b|\bIC\b|driver|op-?amp/i.test(d)) return SMALL_SIGNAL_DISCRETE_CAP_GBP;
  return null;
}

/** Pads, test points or an unfitted footprint — a BOM line with no part to buy.
 *  Needs both a no-part word AND a connector/test context, so an IC's "exposed
 *  thermal pad" never matches. */
export function isNotFitted(line: Record<string, unknown>): boolean {
  const d = `${String(line.description ?? '')} ${String(line.value ?? '')}`;
  if (/\b(DNP|DNF|not fitted|not populated|unpopulated|footprint only|no[- ]?pop)\b/i.test(d)) return true;
  const ct = String(line.componentType ?? '').toLowerCase();
  const connectorish = /connector|header|through_hole/.test(ct) || /header|connector|test|pogo|probe/i.test(d);
  return connectorish && /\b(test ?points?|test ?pads?|header pads|pads)\b/i.test(d) && !/thermal pad|exposed pad/i.test(d);
}

/**
 * Cap the unit price of an UNCONFIRMED part to its class median. Returns the
 * (possibly reduced) unit price; never raises a price. `componentType` is the
 * BOM line's category; unknown categories fall back to a generic IC cap.
 */
export function classMedianCap(componentType: string, unitPriceGBP: number): number {
  const key = (componentType || '').toLowerCase();
  let cap = CLASS_MEDIAN[key];
  if (cap === undefined) {
    // fuzzy: pick the closest category family
    if (key.includes('bga')) cap = CLASS_MEDIAN.ic_bga;
    else if (key.includes('qfn')) cap = CLASS_MEDIAN.ic_qfn;
    else if (key.includes('qfp') || key.includes('tqfp')) cap = CLASS_MEDIAN.ic_tqfp;
    else if (key.includes('soic') || key.includes('sot')) cap = CLASS_MEDIAN.ic_soic;
    else if (key.includes('connector') || key.includes('header')) cap = CLASS_MEDIAN.connector_smt;
    else if (key.includes('crystal') || key.includes('osc') || key.includes('tcxo')) cap = CLASS_MEDIAN.crystal_osc;
    else if (key.includes('tvs') || key.includes('fuse') || key.includes('diode')) cap = CLASS_MEDIAN.fuse_tvs;
    else if (key.includes('passive') || key.includes('0402')) cap = CLASS_MEDIAN.passive_0402;
    else if (key.includes('0805') || key.includes('1206')) cap = CLASS_MEDIAN.passive_0805;
    else cap = CLASS_MEDIAN.ic;
  }
  return Math.min(unitPriceGBP, cap);
}
