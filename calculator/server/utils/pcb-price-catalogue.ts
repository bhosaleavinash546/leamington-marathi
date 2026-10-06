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
  /** Unit price, GBP. q200k / q300k: derived along the part's volume slope (Oct 2026 research). */
  gbp: { q1k: number; q10k: number; q100k: number; q200k?: number; q300k?: number };
  confidence: 'distributor' | 'estimate'; source: string; asOf: string;
  /** ECUs the part is used in (research tags). */
  ecuRoles?: string[];
  /** The distributor prices behind a researched entry, as read. */
  observations?: Array<{ distributor: string; qty: number; price: number; currency: string; url: string; date: string; gbp: number }>;
  /** How the volume breaks were derived. */
  volumeModel?: { b: number; basis: string; derivedAbove: number };
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
// The literal orderable code ("2N7002,215") is tried before its normalised key, which drops a
// ",215"-style suffix and would land on the family estimate "2N7002". On a shared normalised key a
// distributor-priced entry wins over an estimate.
const LITERAL = new Map<string, CatalogueEntry>();
const literalKey = (s: string) => (s || '').toUpperCase().replace(/\s+/g, '');
const EXACT = new Map<string, CatalogueEntry>();
const PREFIX: Array<[string, CatalogueEntry]> = [];
for (const e of CAT.parts) {
  for (const k of [e.mpn, ...(e.aliases ?? [])]) if (k && !LITERAL.has(literalKey(k))) LITERAL.set(literalKey(k), e);
  const keys = new Set([normaliseMPN(e.mpn), normaliseMPN(e.family), ...(e.aliases ?? []).map(normaliseMPN)]);
  for (const k of keys) if (k && (!EXACT.has(k) || (EXACT.get(k)!.confidence !== 'distributor' && e.confidence === 'distributor' && normaliseMPN(e.mpn) === k))) EXACT.set(k, e);
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
  // A hedged guess is not an orderable part: "assumed TLF35584" used to resolve to TLF35584 and the line
  // was labelled catalogue-confirmed (360 review, Oct 2026). It stays a range, flagged to verify.
  if (/\b(CLASS|EST|UNKNOWN|GENERIC|ASSUMED?|LIKELY|PROBABLY|POSSIBLY|SIMILAR|EQUIV(ALENT)?|TYPICAL|E\.?G\.?|OR)\b|[?~]/i.test(mpn)) return null;
  const lit = LITERAL.get(literalKey(mpn));
  if (lit) return lit;
  // Candidate tokens: the whole string AND each whitespace/comma token, so
  // "NXP TJA1145" and "TJA1044GT/3" both resolve to the manufacturer part.
  const cands = new Set<string>([normaliseMPN(mpn)]);
  for (const tok of mpn.toUpperCase().split(/[\s,;/]+/)) {
    const t = normaliseMPN(tok);
    if (t.length >= 4) cands.add(t);
  }
  for (const c of cands) { const e = EXACT.get(c); if (e) return e; }
  // TI's family form "DS90UB935-Q1" names the automotive grade of a family whose orderable
  // codes are DS90UB935TRHBRQ1 / …RHBTQ1: the catalogued code that starts with the family and
  // ends in Q1 (the AEC-Q100 suffix) is that part. Only when exactly one such code is catalogued.
  const q1 = /^([A-Z0-9]{5,})-?Q1$/.exec(literalKey(mpn).replace(/[^A-Z0-9-]/g, ''));
  if (q1) {
    const hits = [...new Set(CAT.parts.filter(p => { const k = normaliseMPN(p.mpn); return k.startsWith(q1[1]) && /Q1$/.test(k) && k.length > q1[1].length + 2; }))];
    if (hits.length === 1) return hits[0];
  }
  for (const c of cands) for (const [pre, e] of PREFIX) if (c.startsWith(pre) && orderingSuffix(c.slice(pre.length))) return e;
  return null;
}

/**
 * A family entry may price a longer part number only when what follows the family
 * is an ordering suffix — package, temperature grade, tape-and-reel (STM32F407 + VGT6,
 * TJA1044 + GT). When it starts with a digit it is a value, density or pin-count code,
 * and a different part: MT53E + 1G32… is 32 Gb, not the 8 Gb entry; 744043 + 471 is
 * 470 µH; DF40C + 100DS is 100 ways (PCB review, Oct 2026). Those lines fall to the
 * class range and are flagged instead of being priced as the wrong part at 0.95.
 */
function orderingSuffix(rest: string): boolean {
  if (rest === '') return true;
  if (rest.length > 6) return false;
  if (!/^[A-Z]/.test(rest)) return false;
  return (rest.match(/\d/g) ?? []).length <= 1;
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
  const { q200k, q300k } = e.gbp;
  let p: number;
  // Annual programme volumes 100k–300k have their own breaks (derived along the part's
  // slope); flat above the last break rather than extrapolated further.
  if (q300k != null && q >= 300000) p = q300k;
  else if (q200k != null && q300k != null && q >= 200000) p = lerp(200000, q200k, 300000, q300k);
  else if (q200k != null && q >= 100000) p = lerp(100000, q100k, 200000, q200k);
  else if (q >= 100000) p = q100k;
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
