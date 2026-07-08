/**
 * PCB BOM accuracy layer — deterministic, pure, unit-tested.
 *
 *  A) File import  — pick-and-place (centroid) parser + BOM→BomItem converter,
 *     so an uploaded BOM/CPL becomes a costable, near-exact BOM (file path is
 *     far more accurate than a single photo).
 *  B) Post-process — footprint→component type, MPN normalise/validate, passive
 *     price fallback (cost right by count even when values are unreadable),
 *     per-line confidence and a cost range.
 *  C) Self-consistency — merge N independent extractions by reference designator,
 *     voting per field; agreement drives confidence.
 *
 * No network, no model — the runtime vision calls happen elsewhere; everything
 * here is deterministic so it can be tested and trusted.
 */

import type { BomItem } from './pcb-vision-accuracy.js';
import { expandRefDes } from './pcb-vision-accuracy.js';
import type { ParsedBOMLine } from './pcb-bom-parser.js';

// ─── Component-type inference ─────────────────────────────────────────────────

export type ComponentClass =
  | 'resistor' | 'capacitor' | 'inductor' | 'ferrite' | 'diode' | 'led'
  | 'transistor' | 'ic' | 'connector' | 'crystal' | 'switch' | 'fuse'
  | 'transformer' | 'relay' | 'testpoint' | 'mechanical' | 'unknown';

/** Ref-des prefix → component class (strongest single signal). */
const REFDES_PREFIX: Array<[RegExp, ComponentClass]> = [
  [/^R(N|V|T)?\d/, 'resistor'], [/^C\d/, 'capacitor'], [/^L\d/, 'inductor'],
  [/^FB\d/, 'ferrite'], [/^(D|CR)\d/, 'diode'], [/^(LED|DS)\d/, 'led'],
  [/^Q\d/, 'transistor'], [/^(U|IC)\d/, 'ic'],
  [/^(J|CN|P|CON|X)\d/, 'connector'], [/^(Y|XT|X)\d/, 'crystal'],
  [/^(SW|S)\d/, 'switch'], [/^F\d/, 'fuse'], [/^T\d/, 'transformer'],
  [/^(K|RLY)\d/, 'relay'], [/^TP\d/, 'testpoint'],
  [/^(MH|MP|H)\d/, 'mechanical'],
];

/** Standard chip footprint sizes for passives. */
const CHIP_SIZE_RE = /\b(01005|0201|0402|0603|0805|1206|1210|1812|2010|2512|2920)\b/;

/**
 * Infer a component type string. Ref-des prefix wins; otherwise use the
 * footprint. Passives carry their chip size (e.g. "resistor_0402") so downstream
 * cost/DFM can reason about placement difficulty and price band.
 */
export function inferComponentType(input: {
  refDes?: string; pkg?: string; value?: string; description?: string;
}): string {
  const ref = String(input.refDes ?? '').trim().toUpperCase();
  const pkg = String(input.pkg ?? '').toLowerCase();
  const desc = String(input.description ?? '').toLowerCase();

  let cls: ComponentClass = 'unknown';
  for (const [re, c] of REFDES_PREFIX) { if (re.test(ref)) { cls = c; break; } }

  if (cls === 'unknown') {
    if (/conn|header|socket|receptacle|usb|rj45|smd_conn/.test(pkg + desc)) cls = 'connector';
    else if (/qfn|qfp|bga|soic|sot|tssop|dfn|son|lga|dpak/.test(pkg)) cls = 'ic';
    else if (/led/.test(pkg + desc)) cls = 'led';
    else if (/diode|sod|sma|smb|smc/.test(pkg + desc)) cls = 'diode';
    else if (/crystal|xtal|osc/.test(pkg + desc)) cls = 'crystal';
    else if (/cap|electrolytic|tantal/.test(desc)) cls = 'capacitor';
    else if (/res/.test(desc)) cls = 'resistor';
    else if (CHIP_SIZE_RE.test(pkg)) cls = 'resistor'; // bare chip footprint, default to R
  }

  const size = (CHIP_SIZE_RE.exec(pkg) ?? [])[1];
  const isChip = cls === 'resistor' || cls === 'capacitor' || cls === 'inductor' || cls === 'ferrite' || cls === 'led';
  // electrolytic / tantalum caps read from description
  if (cls === 'capacitor' && /electrolytic|alu|tantal|tant/.test(desc)) return 'capacitor_electrolytic';
  return isChip && size ? `${cls}_${size}` : cls;
}

// ─── Default unit-price fallback (qty-1 GBP) ──────────────────────────────────
// Used ONLY when no MPN/price is known — gets passive-dominated cost right by
// COUNT even when values are unreadable from a photo. Real prices override via
// live grounding.
const DEFAULT_UNIT_PRICE_GBP: Record<ComponentClass, number> = {
  resistor: 0.008, capacitor: 0.012, inductor: 0.06, ferrite: 0.03,
  diode: 0.06, led: 0.10, transistor: 0.10, ic: 1.20, connector: 0.35,
  crystal: 0.35, switch: 0.30, fuse: 0.12, transformer: 1.50, relay: 0.90,
  testpoint: 0.01, mechanical: 0.15, unknown: 0.15,
};

function baseClassOf(componentType: string | undefined): ComponentClass {
  const t = String(componentType ?? '').toLowerCase();
  if (t.startsWith('capacitor')) return 'capacitor';
  for (const c of Object.keys(DEFAULT_UNIT_PRICE_GBP) as ComponentClass[]) {
    if (t.startsWith(c)) return c;
  }
  return 'unknown';
}

export function defaultUnitPriceGBP(componentType: string | undefined): number {
  return DEFAULT_UNIT_PRICE_GBP[baseClassOf(componentType)];
}

// ─── MPN normalisation & validation ───────────────────────────────────────────

export function normalizeMPN(mpn: unknown): string {
  return String(mpn ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

// Value/footprint tokens that are frequently mis-captured as an "MPN".
const VALUE_LIKE_RE = /^(\d+(\.\d+)?(K|M|R|E|G)?(OHM|Ω)?|\d+(\.\d+)?(P|N|U|Μ|M)?F|\d+(\.\d+)?(N|U|Μ|M)?H|\d+(\.\d+)?V|\d+%|0201|0402|0603|0805|1206|1210)$/i;

/**
 * A plausible manufacturer part number: 3–40 chars, contains BOTH a letter and a
 * digit, and is not merely a value/footprint token (e.g. "10K", "100NF", "0402").
 */
export function isPlausibleMPN(mpn: unknown): boolean {
  const n = normalizeMPN(mpn);
  if (n.length < 3 || n.length > 40) return false;
  if (!/[A-Z]/.test(n) || !/\d/.test(n)) return false;
  if (VALUE_LIKE_RE.test(n)) return false;
  return true;
}

// ─── Per-line confidence & cost band ──────────────────────────────────────────

export interface EnrichedBomItem extends BomItem {
  componentType?: string;
  footprint?: string;
  value?: string;
  confidence: number;        // 0..1
  priceLowGBP?: number;
  priceHighGBP?: number;
  priceEstimated?: boolean;  // true when unit price came from the fallback, not a real MPN/quote
}

/** Confidence a line is real and correctly identified. */
export function lineConfidence(item: EnrichedBomItem): number {
  let c = 0.30;
  if (isPlausibleMPN(item.partNumber)) c += 0.35;
  else if (item.partNumber) c -= 0.15;   // a present-but-implausible MPN is a mis-read red flag
  if (item.componentType && item.componentType !== 'unknown') c += 0.15;
  if (item.value) c += 0.10;
  if (item.refDes && expandRefDes(item.refDes).length > 0) c += 0.10;
  return Math.max(0, Math.min(1, Math.round(c * 100) / 100));
}

/** Cost band widens as confidence falls; skewed high (missed parts cost more). */
function priceBand(unit: number, confidence: number): { low: number; high: number } {
  const u = Math.max(0, unit);
  const spread = 1 - confidence;
  return {
    low: Math.round(u * (1 - spread * 0.4) * 1e4) / 1e4,
    high: Math.round(u * (1 + spread * 1.0) * 1e4) / 1e4,
  };
}

export interface PostProcessResult {
  items: EnrichedBomItem[];
  lineCount: number;
  avgConfidence: number;
  lowConfidenceCount: number;   // lines below 0.5 — surface as "verify"
  estimatedPriceCount: number;  // lines using the fallback price
  totalLowGBP: number;
  totalMidGBP: number;
  totalHighGBP: number;
}

/**
 * Post-process an extracted (or imported) BOM: normalise MPNs, infer component
 * type, fill a fallback unit price for un-priced passives, and attach per-line
 * confidence + a cost range. Deterministic; safe to run on photo or file BOMs.
 */
export function postProcessBom(raw: BomItem[]): PostProcessResult {
  const items: EnrichedBomItem[] = raw.map(r => {
    const e: EnrichedBomItem = { ...r, confidence: 0 };
    e.partNumber = isPlausibleMPN(r.partNumber) ? normalizeMPN(r.partNumber) : (r.partNumber ? normalizeMPN(r.partNumber) : undefined);
    if (!e.componentType) e.componentType = inferComponentType({ refDes: r.refDes, description: r.componentType });
    e.qty = Number(r.qty) > 0 ? Number(r.qty) : Math.max(1, expandRefDes(r.refDes).length || 1);

    const hasRealPrice = Number.isFinite(Number(r.unitPriceGBP)) && Number(r.unitPriceGBP) > 0;
    if (!hasRealPrice) {
      e.unitPriceGBP = defaultUnitPriceGBP(e.componentType);
      e.priceEstimated = true;
    }
    e.confidence = lineConfidence(e);
    const band = priceBand(Number(e.unitPriceGBP) || 0, e.confidence);
    e.priceLowGBP = band.low;
    e.priceHighGBP = band.high;
    return e;
  });

  const n = items.length || 1;
  const sum = (f: (i: EnrichedBomItem) => number) => items.reduce((a, i) => a + f(i), 0);
  const qty = (i: EnrichedBomItem) => Number(i.qty) || 0;
  return {
    items,
    lineCount: items.length,
    avgConfidence: Math.round((sum(i => i.confidence) / n) * 100) / 100,
    lowConfidenceCount: items.filter(i => i.confidence < 0.5).length,
    estimatedPriceCount: items.filter(i => i.priceEstimated).length,
    totalLowGBP: Math.round(sum(i => qty(i) * (i.priceLowGBP ?? 0)) * 100) / 100,
    totalMidGBP: Math.round(sum(i => qty(i) * (Number(i.unitPriceGBP) || 0)) * 100) / 100,
    totalHighGBP: Math.round(sum(i => qty(i) * (i.priceHighGBP ?? 0)) * 100) / 100,
  };
}

// ─── A) BOM-line → BomItem converter ──────────────────────────────────────────

/**
 * Convert parsed BOM lines (from parseBOMFile) into costable BomItems, inferring
 * component type from footprint/ref-des and taking qty from the line or from the
 * expanded ref-des count. This is the "file → near-exact BOM" path.
 */
export function bomLinesToItems(lines: ParsedBOMLine[]): BomItem[] {
  return lines.map(l => {
    const expanded = expandRefDes(l.refDes).length;
    const qty = Number(l.qty) > 0 ? Number(l.qty) : Math.max(1, expanded || 1);
    return {
      refDes: l.refDes || undefined,
      partNumber: l.partNumber || undefined,
      componentType: inferComponentType({ refDes: l.refDes, pkg: l.pkg, value: l.value, description: l.description }),
      qty,
    } as BomItem;
  });
}

// ─── A) Pick-and-place (centroid / CPL) parser ────────────────────────────────

export interface Placement {
  refDes: string;
  footprint?: string;
  value?: string;
  side: 'top' | 'bottom';
  rotationDeg?: number;
  x?: number;
  y?: number;
}

export interface PickAndPlaceResult {
  placements: Placement[];
  topCount: number;
  bottomCount: number;
  totalPlacements: number;
}

function splitDelimited(line: string): string[] {
  // CSV with quotes, or whitespace/tab-delimited (KiCad .pos) fallback.
  if (line.includes(',')) {
    const out: string[] = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === ',' && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  }
  return line.trim().split(/\s+/);
}

const PNP_HEADERS = {
  refDes: ['designator', 'ref', 'refdes', 'reference', 'part', 'comment/designator'],
  footprint: ['footprint', 'package', 'pattern', 'pkg'],
  value: ['value', 'val', 'comment'],
  side: ['layer', 'side', 'tb'],
  rot: ['rotation', 'rot', 'rotate'],
  x: ['mid x', 'midx', 'posx', 'pos x', 'ref x', 'x'],
  y: ['mid y', 'midy', 'posy', 'pos y', 'ref y', 'y'],
};

function findCol(header: string[], names: string[]): number {
  const h = header.map(c => c.toLowerCase().replace(/[()"]/g, '').trim());
  for (const name of names) { const i = h.indexOf(name); if (i >= 0) return i; }
  // loose contains-match
  for (let i = 0; i < h.length; i++) if (names.some(n => h[i] === n || h[i].startsWith(n + ' '))) return i;
  return -1;
}

/**
 * Parse an Altium/KiCad/generic pick-and-place (centroid) file. Gives an exact
 * placement count, per-side split and footprints — enough to cost SMT assembly
 * accurately even when component *values* are unknown. Never throws.
 */
export function parsePickAndPlace(content: string): PickAndPlaceResult {
  const empty: PickAndPlaceResult = { placements: [], topCount: 0, bottomCount: 0, totalPlacements: 0 };
  if (!content || !content.trim()) return empty;

  // Keep '#' lines: KiCad .pos comments the COLUMN HEADER with a leading '#'.
  const rawLines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!rawLines.length) return empty;
  const deComment = (l: string) => l.replace(/^#+\s*/, '');   // strip a leading '# ' (KiCad header)

  // Find the header row (mentions a designator + a coordinate/footprint), even if commented.
  let headerIdx = rawLines.findIndex(l =>
    /design|ref|part/i.test(l) && /(mid ?x|pos ?x|footprint|package|layer|rotation|\bx\b)/i.test(l));
  if (headerIdx < 0) headerIdx = 0;
  const header = splitDelimited(deComment(rawLines[headerIdx]));

  const cRef = findCol(header, PNP_HEADERS.refDes);
  const cFp = findCol(header, PNP_HEADERS.footprint);
  const cVal = findCol(header, PNP_HEADERS.value);
  const cSide = findCol(header, PNP_HEADERS.side);
  const cRot = findCol(header, PNP_HEADERS.rot);
  const cX = findCol(header, PNP_HEADERS.x);
  const cY = findCol(header, PNP_HEADERS.y);
  if (cRef < 0) return empty;

  const placements: Placement[] = [];
  for (let i = headerIdx + 1; i < rawLines.length; i++) {
    if (rawLines[i].startsWith('#') || rawLines[i].startsWith('//')) continue;  // skip comment rows
    const cells = splitDelimited(rawLines[i]);
    const refDes = (cells[cRef] ?? '').trim();
    if (!refDes) continue;
    const sideRaw = (cSide >= 0 ? cells[cSide] ?? '' : '').toLowerCase();
    const side: 'top' | 'bottom' =
      /bot|bottom|\bb\b|backside/.test(sideRaw) ? 'bottom' : 'top';
    const num = (v: string | undefined) => { const f = parseFloat(String(v ?? '').replace(/[^\d.\-]/g, '')); return Number.isFinite(f) ? f : undefined; };
    placements.push({
      refDes,
      footprint: cFp >= 0 ? (cells[cFp] || undefined) : undefined,
      value: cVal >= 0 ? (cells[cVal] || undefined) : undefined,
      side,
      rotationDeg: cRot >= 0 ? num(cells[cRot]) : undefined,
      x: cX >= 0 ? num(cells[cX]) : undefined,
      y: cY >= 0 ? num(cells[cY]) : undefined,
    });
  }

  const topCount = placements.filter(p => p.side === 'top').length;
  const bottomCount = placements.filter(p => p.side === 'bottom').length;
  return { placements, topCount, bottomCount, totalPlacements: placements.length };
}

/** Convert placements to BomItems (one per placement; footprint-typed). */
export function placementsToItems(placements: Placement[]): BomItem[] {
  return placements.map(p => ({
    refDes: p.refDes,
    componentType: inferComponentType({ refDes: p.refDes, pkg: p.footprint, value: p.value }),
    qty: 1,
  } as BomItem));
}

// ─── C) Self-consistency merge ────────────────────────────────────────────────

export interface MergedBomItem extends BomItem {
  componentType?: string;
  confidence: number;   // agreement across runs (0..1)
  agreementRuns: number; // how many runs contained this ref
}

function mode<T>(vals: T[]): T | undefined {
  const m = new Map<string, { v: T; n: number }>();
  for (const v of vals) {
    if (v === undefined || v === null || v === '') continue;
    const k = String(v);
    const e = m.get(k) ?? { v, n: 0 }; e.n++; m.set(k, e);
  }
  let best: { v: T; n: number } | undefined;
  for (const e of m.values()) if (!best || e.n > best.n) best = e;
  return best?.v;
}

function median(vals: number[]): number | undefined {
  const xs = vals.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return undefined;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/**
 * Merge several independent BOM extractions (e.g. N vision passes) by reference
 * designator, voting per field. Cancels random single-pass errors; a line's
 * confidence is the fraction of runs that contained it.
 */
export function mergeBomExtractions(runs: BomItem[][]): MergedBomItem[] {
  const nRuns = runs.filter(r => Array.isArray(r) && r.length).length || 1;
  const byRef = new Map<string, BomItem[]>();
  for (const run of runs) {
    if (!Array.isArray(run)) continue;
    for (const item of run) {
      for (const ref of expandRefDes(item.refDes)) {
        const arr = byRef.get(ref) ?? []; arr.push(item); byRef.set(ref, arr);
      }
    }
  }

  const out: MergedBomItem[] = [];
  for (const [ref, cands] of byRef) {
    const mpns = cands.map(c => c.partNumber).filter(isPlausibleMPN).map(normalizeMPN);
    const types = cands.map(c => c.componentType).filter(Boolean) as string[];
    const prices = cands.map(c => Number(c.unitPriceGBP)).filter(v => Number.isFinite(v) && v > 0);
    const agreementRuns = cands.length;
    out.push({
      refDes: ref,
      partNumber: mode(mpns),
      componentType: mode(types) ?? inferComponentType({ refDes: ref }),
      unitPriceGBP: median(prices),
      qty: 1,
      agreementRuns,
      confidence: Math.round(Math.min(1, agreementRuns / nRuns) * 100) / 100,
    });
  }
  // Highest-agreement first.
  out.sort((a, b) => b.confidence - a.confidence);
  return out;
}
