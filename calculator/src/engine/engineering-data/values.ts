/**
 * Reading structured parameter values (offline 2D drawing intelligence, Layer 3).
 *
 * The dictionary says `hole.diameter`, `thread`, `dimension`, `heatTreat.caseDepth` … hold an OBJECT, and model.ts
 * leaves the object's fields to the source. The CAD mapper (from-cad.ts) writes the shapes below; a drawing reader
 * may spell the same fact a little differently ("diameter" / "diameterMm" / "nominal"). These readers accept the
 * spellings listed and return one shape, so the reconciliation never guesses at a field name. Anything they cannot
 * read returns null — the caller then leaves the parameter unmatched rather than inventing a figure.
 *
 * Pure functions; no cost formula.
 */
import type { EngineeringParameter, ParameterValue } from './model.js';
import { parseNumber } from './normalise.js';

/** A hole as the CAD mapper writes it (and the shape a drawing callout is read into). */
export interface HoleValue {
  diameterMm: number;
  /** How many holes the row / callout covers ("4x Ø8.5" → 4). Undefined when a callout does not say. */
  count?: number;
  through?: boolean | null;
  depthMm?: number;
  /** True when the callout carries a tolerance or fit — information the CAD model does not hold. */
  toleranced?: boolean;
}

/** A thread callout: "M8", "M10x1", "4x M6 - 6H". */
export interface ThreadValue {
  /** "M8" — the metric designation without the pitch. */
  designation: string;
  nominalMm: number;
  /** Stated pitch (a fine thread); undefined for a coarse thread written without one. */
  pitchMm?: number;
  count?: number;
  depthMm?: number;
}

/** A lower / upper pair in the parameter's unit; a single figure has min = max. */
export interface RangeValue { min: number; max: number }

const rec = (v: ParameterValue): Record<string, unknown> | null =>
  v && typeof v === 'object' ? v as Record<string, unknown> : null;

function num(o: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = o[k];
    const n = typeof v === 'number' ? v : typeof v === 'string' ? parseNumber(v) : null;
    if (n != null && Number.isFinite(n)) return n;
  }
  return undefined;
}

const COUNT_KEYS = ['count', 'quantity', 'qty', 'n'] as const;
const DIA_KEYS = ['diameterMm', 'diameter', 'diaMm', 'dia', 'nominalMm', 'nominal', 'value'] as const;
const DEPTH_KEYS = ['depthMm', 'depth'] as const;

/** A "4x" / "4 ×" / "4 HOLES" multiplier at the head of a callout. */
function countFromText(raw: string | undefined): number | undefined {
  const m = /^\s*(\d{1,3})\s*(?:[x×X]|HOLES?|OFF|PLACES?|PLCS?)\b/i.exec(raw ?? '') ?? /\b(\d{1,3})\s*(?:HOLES|PLACES|PLCS|OFF)\b/i.exec(raw ?? '');
  return m ? Number(m[1]) : undefined;
}

/** Does the value or the raw text mark a tolerance or a fit (H7, ±0.05, +0.02/0, upper / lower limits)? */
function isToleranced(o: Record<string, unknown> | null, raw: string | undefined): boolean {
  if (o && ['fit', 'tolerance', 'upper', 'lower', 'upperMm', 'lowerMm', 'plus', 'minus', 'max', 'min', 'itGrade']
    .some(k => o[k] !== undefined && o[k] !== null && o[k] !== '')) return true;
  return /±|\+\s*\d|\b[A-Za-z]{1,2}\d{1,2}\b(?!\s*[x×])/.test((raw ?? '').replace(/^\s*\d+\s*[x×]\s*/, '').replace(/[Ø⌀]\s*[\d.,]+/, ''));
}

/** Is this `dimension` a diameter (so it can be matched to a CAD hole)? */
export function isDiameterDimension(p: EngineeringParameter): boolean {
  const o = rec(p.value);
  if (o && (o.kind === 'diameter' || o.type === 'diameter' || o.symbol === 'Ø' || o.symbol === '⌀' || o.diameter === true
    || typeof o.diameterMm === 'number')) return true;
  return /[Ø⌀]|\bDIA\b/i.test(p.rawText ?? '');
}

/** The hole a `hole.diameter` parameter (or a diameter `dimension`) describes, or null when no diameter can be read. */
export function holeOf(p: EngineeringParameter): HoleValue | null {
  const o = rec(p.value);
  const fromText = () => { const m = /[Ø⌀]\s*([\d.,]+)/.exec(p.rawText ?? ''); return m ? parseNumber(m[1]) : null; };
  const d = o ? num(o, ...DIA_KEYS) : typeof p.value === 'number' ? p.value : typeof p.value === 'string' ? (parseNumber(p.value) ?? fromText()) : null;
  const dia = d ?? fromText();
  if (dia == null || !(dia > 0)) return null;
  const count = (o ? num(o, ...COUNT_KEYS) : undefined) ?? countFromText(p.rawText);
  const through = o && typeof o.through === 'boolean' ? o.through : o && o.blind === true ? false : undefined;
  const depth = o ? num(o, ...DEPTH_KEYS) : undefined;
  return {
    diameterMm: dia,
    ...(count != null && count > 0 ? { count: Math.round(count) } : {}),
    ...(through !== undefined ? { through } : {}),
    ...(depth != null && depth > 0 ? { depthMm: depth } : {}),
    ...(isToleranced(o, p.rawText) ? { toleranced: true } : {}),
  };
}

/** The thread a `thread` parameter states, or null when it is not a metric designation this file can read. */
export function threadOf(p: EngineeringParameter): ThreadValue | null {
  const o = rec(p.value);
  const text = o ? String(o.designation ?? o.size ?? o.thread ?? o.callout ?? p.rawText ?? '') : String(p.value ?? p.rawText ?? '');
  const m = /\bM\s*(\d+(?:[.,]\d+)?)(?:\s*[x×X]\s*(\d+(?:[.,]\d+)?))?/.exec(text) ?? /\bM\s*(\d+(?:[.,]\d+)?)(?:\s*[x×X]\s*(\d+(?:[.,]\d+)?))?/.exec(p.rawText ?? '');
  if (!m) return null;
  const nominal = parseNumber(m[1]);
  if (nominal == null || !(nominal > 0)) return null;
  const pitch = (o ? num(o, 'pitchMm', 'pitch') : undefined) ?? (m[2] ? parseNumber(m[2]) ?? undefined : undefined);
  const count = (o ? num(o, ...COUNT_KEYS) : undefined) ?? countFromText(p.rawText);
  const depth = o ? num(o, ...DEPTH_KEYS) : undefined;
  return {
    designation: `M${nominal}`, nominalMm: nominal,
    ...(pitch != null && pitch > 0 ? { pitchMm: pitch } : {}),
    ...(count != null && count > 0 ? { count: Math.round(count) } : {}),
    ...(depth != null && depth > 0 ? { depthMm: depth } : {}),
  };
}

/** A figure or a range: 0.8, "0,8", { min, max }, { value }, { lower, upper }, "0.8-1.2". Null when unreadable. */
export function rangeOf(v: ParameterValue): RangeValue | null {
  if (typeof v === 'number') return Number.isFinite(v) ? { min: v, max: v } : null;
  if (typeof v === 'string') {
    const one = parseNumber(v);
    if (one != null) return { min: one, max: one };
    const m = /([\d.,]+)\s*(?:-|–|—|to|\.\.)\s*([\d.,]+)/i.exec(v);
    const a = m ? parseNumber(m[1]) : null; const b = m ? parseNumber(m[2]) : null;
    return a != null && b != null ? { min: Math.min(a, b), max: Math.max(a, b) } : null;
  }
  const o = rec(v);
  if (!o) return null;
  const lo = num(o, 'min', 'minMm', 'lower', 'lowerMm', 'from');
  const hi = num(o, 'max', 'maxMm', 'upper', 'upperMm', 'to');
  const one = num(o, 'value', 'nominal', 'nominalMm', 'thicknessUm', 'depthMm');
  if (lo != null && hi != null) return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
  if (lo != null) return { min: lo, max: lo };
  if (hi != null) return { min: hi, max: hi };
  return one != null ? { min: one, max: one } : null;
}

/** A flag as a source may write it: true / false, "yes" / "no". Null when it is neither. */
export function flagOf(v: ParameterValue): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['yes', 'true', 'y', 'required', 'specified'].includes(s)) return true;
    if (['no', 'false', 'n', 'not required', 'none'].includes(s)) return false;
  }
  return null;
}

/** The text of a parameter for a text rule: its string value, else what was read. */
export function textOf(p: EngineeringParameter): string {
  if (typeof p.value === 'string') return p.value;
  const o = rec(p.value);
  if (o && typeof o.text === 'string') return o.text;
  return p.rawText ?? '';
}
