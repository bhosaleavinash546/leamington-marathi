/**
 * How a parameter is WORDED for a person — one set of words for the review panel, the PDF and the workbook (offline 2D
 * drawing intelligence, integration — Nov 2026).
 *
 * Pure text helpers over the data model. Nothing here decides anything: a status is the model's status in a word, a
 * source is the model's source in a word, and a value is printed as it was read. No cost formula.
 */
import type { ConsolidatedEngineeringData, DrawingLocation, EngineeringParameter, ParameterValue } from './model.js';
import { parameterDef, type ParameterDef } from './dictionary.js';
import { DEFAULT_RATE_LIBRARY } from '../rate-library.js';
import { SURFACE_ROUTE_LABELS } from '../surface-finish-routes.js';
import { LAMINATE_SYSTEMS } from '../cost-input-rules/derive/laminate.js';

/** The status badge: always a word, never colour alone. */
export type StatusWord = 'Read' | 'Needs checking' | 'Missing' | 'Conflict' | 'Confirmed' | 'Corrected' | 'Rejected' | 'Inferred';

export function statusWord(p: Pick<EngineeringParameter, 'status' | 'kind'>): StatusWord {
  switch (p.status) {
    case 'confirmed': return 'Confirmed';
    case 'corrected': return 'Corrected';
    case 'rejected': return 'Rejected';
    case 'conflict': return 'Conflict';
    case 'missing': return 'Missing';
    case 'needs-validation': return p.kind === 'inferred' ? 'Inferred' : 'Needs checking';
    default: return p.kind === 'inferred' ? 'Inferred' : 'Read';
  }
}

/** The source badge. */
export type SourceWord = 'CAD' | 'Drawing' | 'Derived' | 'Typed';

export function sourceWord(p: Pick<EngineeringParameter, 'source'>): SourceWord {
  return p.source === 'cad' ? 'CAD' : p.source === 'drawing' ? 'Drawing' : p.source === 'manual' ? 'Typed' : 'Derived';
}

/** The dictionary's label, or the name itself for a name the dictionary does not hold. */
export function parameterLabel(name: string): string {
  return parameterDef(name)?.label ?? name;
}

const num = (n: number): string => (Number.isInteger(n) ? String(n) : String(+n.toFixed(4)));

/**
 * An internal code as a person names it: a rate-book grade by its grade name ("LM25 / A356", never "mat-lm25"), a
 * finish route by its label, a laminate system by its label, any other code with its separators as spaces. A value
 * that is not a code comes back unchanged. No library id reaches a screen or a report.
 */
export function codeLabel(value: unknown): string {
  const v = String(value ?? '');
  const grade = /^mat-/.test(v) ? DEFAULT_RATE_LIBRARY.materials.find(m => m.id === v)?.grade : undefined;
  if (grade) return grade;
  if (v && SURFACE_ROUTE_LABELS[v]) return SURFACE_ROUTE_LABELS[v];
  const lam = LAMINATE_SYSTEMS.find(x => x.value === v);
  if (lam) return lam.label;
  return /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(v) ? v.replace(/_/g, ' ') : v;
}

/** Parameters whose value is one of the engine's own codes (interpreted into a question's vocabulary). */
const CODED = new Set(['material.grade', 'finish.coatingRoute', 'heatTreat.route', 'material.laminateSystem']);

/** A small object as "key value, key value" — the fallback when a reading has no text of its own. */
function objectText(v: Record<string, unknown>): string {
  return Object.entries(v).filter(([, x]) => x !== undefined && x !== null && x !== '' && !(Array.isArray(x) && !x.length))
    .map(([k, x]) => `${k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()} ${Array.isArray(x) ? x.join(' ') : typeof x === 'number' ? num(x) : String(x)}`).join(', ');
}

/**
 * A value as a person reads it. A structured reading (a thread, a toleranced diameter, a frame) is shown as it is
 * WRITTEN on the source — that is what the engineer compares with the sheet; a typed or interpreted value as its value.
 */
export function valueText(p: { value: ParameterValue; unit?: string; rawText?: string; name?: string; source?: EngineeringParameter['source'] }): string {
  const v = p.value;
  const unit = p.unit && typeof v !== 'object' ? ` ${p.unit}` : '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return `${num(v)}${unit}`;
  if (typeof v === 'string') return p.name && CODED.has(p.name) ? codeLabel(v) : v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.min === 'number' && typeof o.max === 'number' && Object.keys(o).every(k => ['min', 'max', 'scale', 'unit'].includes(k))) {
      const u = typeof o.scale === 'string' ? ` ${o.scale}` : p.unit ? ` ${p.unit}` : '';
      return o.min === o.max ? `${num(o.min)}${u}` : `${num(o.min)}–${num(o.max)}${u}`;
    }
    if (p.name === 'part.envelope' && typeof o.lengthMm === 'number') return `${num(o.lengthMm)} × ${num(Number(o.widthMm))} × ${num(Number(o.heightMm))} mm`;
    if (p.rawText && p.source !== 'cad') return p.rawText;
    return objectText(o);
  }
  return String(v ?? '');
}

const REGION_WORD: Record<NonNullable<DrawingLocation['region']>, string> = {
  'title-block': 'title block', notes: 'notes', 'revision-table': 'revision table', view: 'view', table: 'table', other: 'sheet',
};

/** How a value was obtained, in the words the panel prints ("exact text", "OCR 87 %"). */
export function methodText(p: Pick<EngineeringParameter, 'method' | 'reliability' | 'source' | 'kind'>): string {
  switch (p.method) {
    case 'pdf-text': return 'exact text';
    case 'ocr': return p.reliability !== undefined ? `OCR ${Math.round(p.reliability * 100)} %` : 'OCR';
    case 'dxf-entity': return 'DXF text';
    case 'kernel': return 'measured on the 3D model';
    case 'cad-metadata': return 'declared in the CAD file';
    case 'typed': return 'typed by the engineer';
    default: return p.kind === 'inferred' ? 'inferred by a rule' : 'interpreted';
  }
}

/** Where a reading sits: "Sheet 1 · zone D1 · title block". Empty for a value with no place on a sheet. */
export function locationText(loc: DrawingLocation | undefined): string {
  if (!loc) return '';
  return [`Sheet ${loc.sheet}`, loc.zone ? `zone ${loc.zone}` : '', loc.region ? REGION_WORD[loc.region] : ''].filter(Boolean).join(' · ');
}

/** Source, place and method on one line: "Sheet 1 · zone D1 · title block · exact text". */
export function whereText(p: EngineeringParameter, root?: EngineeringParameter): string {
  const at = p.location ?? root?.location;
  const m = p.source === 'derived' && root ? `interpreted from ${JSON.stringify(valueText(root)).slice(0, 80)} (${methodText(root)})` : methodText(p);
  return [locationText(at), m].filter(Boolean).join(' · ');
}

/** The reading a derived value was worked out from (the first parameter of its chain that is not itself derived). */
export function rootOf(p: EngineeringParameter, byId: ReadonlyMap<string, EngineeringParameter>): EngineeringParameter {
  let cur = p; const seen = new Set<string>();
  while (cur.derivedFrom?.length && !seen.has(cur.id)) {
    seen.add(cur.id);
    const up = byId.get(cur.derivedFrom[0]);
    if (!up) break;
    cur = up;
  }
  return cur;
}

/**
 * Read with nothing to doubt, all the way up: the parameter is `extracted`, and so is every reading it was worked out
 * from, and none of them came from OCR. Only such rows are offered to "Confirm all read exactly".
 */
export function exactlyRead(p: EngineeringParameter, byId: ReadonlyMap<string, EngineeringParameter>): boolean {
  let cur: EngineeringParameter | undefined = p; const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.method === 'ocr') return false;
    if (cur === p ? cur.status !== 'extracted' : !['extracted', 'confirmed', 'corrected'].includes(cur.status)) return false;
    cur = cur.derivedFrom?.length ? byId.get(cur.derivedFrom[0]) : undefined;
  }
  return true;
}

// ─── Groups of the review panel and the report table ──────────────────────────────────────────────────────────────

export type ReviewGroupKey = 'identity' | 'material' | 'tolerances' | 'finish' | 'heat-treatment' | 'features' | 'quality' | 'gear' | 'notes';

export const REVIEW_GROUPS: ReadonlyArray<{ key: ReviewGroupKey; title: string }> = [
  { key: 'identity', title: 'Identity' },
  { key: 'material', title: 'Material' },
  { key: 'tolerances', title: 'Tolerances' },
  { key: 'finish', title: 'Finish' },
  { key: 'heat-treatment', title: 'Heat treatment' },
  { key: 'features', title: 'Threads & holes' },
  { key: 'quality', title: 'Quality' },
  { key: 'gear', title: 'Gear' },
  { key: 'notes', title: 'Notes' },
];

const GROUP_OF: Record<ParameterDef['group'], ReviewGroupKey> = {
  identity: 'identity', geometry: 'identity', material: 'material', tolerance: 'tolerances', finish: 'finish',
  'heat-treatment': 'heat-treatment', feature: 'features', joining: 'notes', quality: 'quality', gear: 'gear', note: 'notes',
};

export function reviewGroupOf(name: string): ReviewGroupKey {
  const def = parameterDef(name);
  if (name === 'dimension') return 'tolerances';
  return def ? GROUP_OF[def.group] : 'notes';
}

/** Counts for the panel's summary line and the report's heading. */
export function reviewCounts(data: ConsolidatedEngineeringData): { readings: number; confirmed: number; needsChecking: number; openConflicts: number; rejected: number; notCosted: number; missing: number } {
  const own = data.parameters.filter(p => p.source !== 'cad');
  return {
    readings: own.length,
    confirmed: own.filter(p => p.status === 'confirmed' || p.status === 'corrected').length,
    needsChecking: own.filter(p => p.status === 'needs-validation').length,
    openConflicts: data.conflicts.filter(c => !c.resolution).length,
    rejected: own.filter(p => p.status === 'rejected').length,
    notCosted: data.notCosted.length,
    missing: data.missing.length,
  };
}
