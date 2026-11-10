/**
 * Normalisation — units, numbers and comparison text (offline 2D drawing intelligence, Layer 3).
 *
 * Every source hands in what it read; this file puts a value into the unit the dictionary holds it in, so a CAD value
 * and a drawing value can be compared. Three rules:
 *
 *  1. `rawText` is never touched. Normalisation changes `value` and `unit` only.
 *  2. A conversion is exact arithmetic on a defined factor (1 in = 25.4 mm). Nothing is rounded here.
 *  3. A roughness PARAMETER is never converted: Rz stays Rz, Ra stays Ra. There is no exact relation between them
 *     (the ratio depends on the surface), so converting would invent a figure.
 *
 * Pure functions; no cost formula.
 */
import type { EngineeringParameter, ParameterValue } from './model.js';
import { parameterDef } from './dictionary.js';

// ─── Numbers ──────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Read a number as a drawing writes it. ISO drawings use a decimal comma ("12,5"); US drawings a decimal point and a
 * bare leading point (".005"). With both separators present the LAST one is the decimal mark ("1.234,5" / "1,234.5").
 * A lone comma is a decimal comma — drawings do not group thousands in a dimension. Returns null when the text is not
 * one number (never 0 for a blank).
 */
export function parseNumber(text: string | number | null | undefined): number | null {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  if (text == null) return null;
  let s = String(text).trim().replace(/−/g, '-').replace(/\s+/g, '');
  if (!s) return null;
  if (!/^[+-]?[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(','); const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    if (s.indexOf(',') !== lastComma) return null;        // "1,2,3" is not a number
    s = s.replace(',', '.');
  } else if (s.indexOf('.') !== lastDot) {
    return null;                                           // "1.2.3" is not a number
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ─── Units ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** How a source may spell a unit → the one spelling used here. */
const UNIT_ALIASES: Record<string, string> = {
  mm: 'mm', millimetre: 'mm', millimeter: 'mm', millimetres: 'mm', millimeters: 'mm',
  cm: 'cm', m: 'm',
  in: 'in', inch: 'in', inches: 'in', '"': 'in', '″': 'in',
  thou: 'thou', mil: 'thou', mils: 'thou',
  'µm': 'µm', 'μm': 'µm', um: 'µm', micron: 'µm', microns: 'µm', micrometre: 'µm', micrometer: 'µm',
  'µin': 'µin', 'μin': 'µin', uin: 'µin', microinch: 'µin', microinches: 'µin', 'µ"': 'µin', 'μ"': 'µin',
  kg: 'kg', g: 'g', lb: 'lb', lbs: 'lb',
  cm3: 'cm3', 'cm³': 'cm3', cc: 'cm3', mm3: 'mm3', 'mm³': 'mm3', in3: 'in3', 'in³': 'in3',
  cm2: 'cm2', 'cm²': 'cm2', mm2: 'mm2', 'mm²': 'mm2', m2: 'm2', 'm²': 'm2', in2: 'in2', 'in²': 'in2',
  deg: 'deg', '°': 'deg', degree: 'deg', degrees: 'deg', rad: 'rad',
  'g/cm3': 'g/cm3', 'g/cm³': 'g/cm3', 'kg/dm3': 'g/cm3', 'kg/dm³': 'g/cm3', 'kg/m3': 'kg/m3', 'kg/m³': 'kg/m3',
};

/** The canonical spelling of a unit, or the trimmed input when it is not one this file knows. */
export function canonicalUnit(unit: string | undefined | null): string | undefined {
  if (unit == null) return undefined;
  const u = String(unit).trim();
  if (!u) return undefined;
  return UNIT_ALIASES[u] ?? UNIT_ALIASES[u.toLowerCase()] ?? u;
}

/**
 * Each unit as an exact fraction (num / den) of its quantity's base unit. Every factor is a definition, not a
 * measurement: 1 in = 25.4 mm exactly (international inch, 1959); 1 lb = 0.45359237 kg exactly; 1 µin = 0.0254 µm.
 * Held as integers so a conversion is one multiplication and one division — 250 µin is 6.35 µm, not 6.3500000000000005.
 */
const TO_BASE: Record<string, { base: string; num: number; den: number }> = {
  mm: { base: 'mm', num: 1, den: 1 }, cm: { base: 'mm', num: 10, den: 1 }, m: { base: 'mm', num: 1000, den: 1 },
  in: { base: 'mm', num: 254, den: 10 }, thou: { base: 'mm', num: 254, den: 10_000 },
  'µm': { base: 'mm', num: 1, den: 1000 }, 'µin': { base: 'mm', num: 254, den: 10_000_000 },
  kg: { base: 'kg', num: 1, den: 1 }, g: { base: 'kg', num: 1, den: 1000 }, lb: { base: 'kg', num: 45_359_237, den: 100_000_000 },
  cm3: { base: 'cm3', num: 1, den: 1 }, mm3: { base: 'cm3', num: 1, den: 1000 }, in3: { base: 'cm3', num: 16_387_064, den: 1_000_000 },
  cm2: { base: 'cm2', num: 1, den: 1 }, mm2: { base: 'cm2', num: 1, den: 100 }, m2: { base: 'cm2', num: 10_000, den: 1 }, in2: { base: 'cm2', num: 64_516, den: 10_000 },
  deg: { base: 'deg', num: 1, den: 1 }, rad: { base: 'deg', num: 180 / Math.PI, den: 1 },
  'g/cm3': { base: 'g/cm3', num: 1, den: 1 }, 'kg/m3': { base: 'g/cm3', num: 1, den: 1000 },
};

/** Convert a number between two units of the same quantity; null when they are not the same quantity or unknown. */
export function convertUnit(value: number, from: string | undefined, to: string | undefined): number | null {
  const f = canonicalUnit(from); const t = canonicalUnit(to);
  if (!f || !t) return null;
  if (f === t) return value;
  const a = TO_BASE[f]; const b = TO_BASE[t];
  if (!a || !b || a.base !== b.base) return null;
  return value * (a.num * b.den) / (a.den * b.num);
}

// ─── Roughness ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface RoughnessValue {
  /** The roughness parameter as written: Ra, Rz, Rq, Rt, Rmax … Kept; never converted to another parameter. */
  parameter: string;
  /** In µm. */
  value: number;
  unit: 'µm';
}

/**
 * A roughness reading in µm, with its parameter kept. µin → µm is exact (× 0.0254). Rz is NOT turned into Ra: the
 * two are different measurements of the same profile and no fixed ratio holds between them.
 */
export function normaliseRoughness(input: { parameter?: string; value: number | string; unit?: string }): RoughnessValue | null {
  const n = parseNumber(input.value);
  if (n == null) return null;
  const um = convertUnit(n, input.unit ?? 'µm', 'µm');
  if (um == null) return null;
  const p = (input.parameter ?? 'Ra').trim();
  return { parameter: p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(), value: um, unit: 'µm' };
}

// ─── Text for comparison ──────────────────────────────────────────────────────────────────────────────────────────

/** Trimmed, single-spaced, upper-case — for showing two readings side by side. Not for storage. */
export function canonicalText(s: string): string {
  return String(s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toUpperCase();
}

/** Letters and digits only, upper-case: "EN-GJS-500-7", "en gjs 500 7" and "EN GJS 500-7" are one key. */
export function comparisonKey(s: string): string {
  return String(s ?? '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

/** Lower-case alphanumeric tokens ("EN AC-46000" → en, ac, 46000). */
export function tokens(s: string): string[] {
  return String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

/**
 * Standards-body and series prefixes a material designation may or may not carry ("EN-GJS-500-7" v "GJS-500-7",
 * "EN AW-6082" v "6082", "AA5754" v "5754"). Dropped for COMPARISON only: the prefix names who standardised the
 * grade, not a different grade.
 */
const DESIGNATION_PREFIXES = new Set(['en', 'din', 'iso', 'astm', 'aisi', 'sae', 'bs', 'jis', 'uns', 'aa', 'aw', 'ac', 'wnr', 'w', 'nr']);

/** Designation tokens without the standards prefixes; a glued "aa5754" becomes "5754". */
export function designationTokens(s: string): string[] {
  const out: string[] = [];
  for (const t of tokens(s)) {
    if (DESIGNATION_PREFIXES.has(t)) continue;
    const glued = /^(aa|aw|ac)(\d{4,5}[a-z]?)$/.exec(t);
    out.push(glued ? glued[2] : t);
  }
  return out;
}

/** The comparison key of a material designation: standards prefixes dropped, separators ignored. */
export function designationKey(s: string): string {
  return designationTokens(s).join('').toUpperCase();
}

// ─── Parameters ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Object fields that are counts, flags or angles — never scaled when a length unit is converted. */
const NOT_A_LENGTH = /^(count|qty|quantity|n|sheet|teeth|through|blind|pages?|index|.*deg|.*angle|.*count|grade|class)$/i;

function convertObject(value: Record<string, unknown>, from: string, to: string): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  let converted = false;
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'number' && !NOT_A_LENGTH.test(k)) {
      const c = convertUnit(v, from, to);
      if (c == null) return null;
      out[k] = c; converted = true;
    } else out[k] = v;
  }
  return converted ? out : null;
}

/**
 * A parameter in the dictionary's unit. Returns the SAME object when nothing needs doing (no unit on the dictionary
 * row, the unit already matches, or the unit is not one this file can convert — then it is left exactly as read and
 * the reconciliation will not compare it numerically). `rawText` is carried over untouched; the conversion is stated
 * in `note`.
 */
export function normaliseParameter(p: EngineeringParameter): EngineeringParameter {
  const def = parameterDef(p.name);
  const from = canonicalUnit(p.unit);
  if (!def?.unit) return from && from !== p.unit ? { ...p, unit: from } : p;
  const to = def.unit;
  if (!from) return p;
  if (from === to) return from === p.unit ? p : { ...p, unit: from };
  // Roughness carries its parameter; only the unit moves.
  let value: ParameterValue | null = null;
  if (typeof p.value === 'number') value = convertUnit(p.value, from, to);
  else if (typeof p.value === 'string') { const n = parseNumber(p.value); value = n == null ? null : convertUnit(n, from, to); }
  else if (p.value && typeof p.value === 'object') value = convertObject(p.value as Record<string, unknown>, from, to);
  if (value == null) return p;
  const said = `converted from ${from} to ${to} (exact factor)`;
  return { ...p, value, unit: to, note: p.note ? `${p.note}; ${said}` : said };
}

/** A numeric reading of a parameter value, when it is one number (a number, or text that is one number). */
export function numericValue(v: ParameterValue): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') return parseNumber(v);
  return null;
}
