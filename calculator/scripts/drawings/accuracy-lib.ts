/**
 * Scoring of a drawing extraction against a hand-checked truth file — shared by the accuracy report
 * (scripts/drawings/accuracy.ts) and the tests that pin the measured precision and recall.
 *
 * A truth row is one fact written on the drawing. A reading is CORRECT when a parameter of the same name carries
 * that value; WRONG when the reader emitted a parameter in a group the truth lists completely and no truth row
 * accepts it (a wrong reading costs precision — a miss only costs recall); MISSED when no parameter matches a row.
 */
import type { DrawingExtraction, EngineeringParameter } from '../../src/engine/engineering-data/model.js';

export interface TruthRow {
  name: string; value?: unknown; match?: Record<string, unknown>; contains?: string;
  /**
   * A weaker match for a reading the reader itself flags as incomplete (status needs-validation): e.g. a
   * feature-control frame whose tolerance and datums are read but whose symbol is not text. Counted as PARTIAL —
   * neither correct nor wrong — and it still counts against recall.
   */
  partial?: Record<string, unknown>;
}
export interface TruthFile {
  drawing: string; origin: 'public' | 'generated' | 'real-part'; commodity?: string; source?: string; checked?: string;
  /** Groups whose rows are the complete list of what the drawing states: an extra reading there is wrong. */
  complete: string[];
  expect: TruthRow[];
  /** Per file: the content class the file is ('vector' | 'curves' | 'scan'). Generated fixtures name it in the file name. */
  files?: Record<string, 'vector' | 'curves' | 'scan'>;
  /** Only these sheets were hand-checked: readings on other sheets are left out of the score. */
  sheets?: number[];
}

export const GROUPS = ['title block', 'material', 'general tolerance', 'roughness', 'coating', 'heat treatment', 'threads', 'dimensions', 'fits', 'GD&T', 'notes', 'quality', 'welds', 'gear'] as const;
export type Group = typeof GROUPS[number];

export function groupOf(name: string, value: unknown): Group | undefined {
  if (name.startsWith('title.') || name === 'part.mass') return 'title block';
  if (name.startsWith('material.')) return 'material';
  if (name === 'tolerance.general' || name === 'tolerance.generalClass' || name === 'tolerance.castingGrade') return 'general tolerance';
  if (name.startsWith('finish.roughness')) return 'roughness';
  if (name.startsWith('finish.coating') || name === 'finish.masking' || name === 'finish.maskedFeatures') return 'coating';
  if (name.startsWith('heatTreat.')) return 'heat treatment';
  if (name === 'thread' || name === 'feature.count.threads') return 'threads';
  if (name === 'dimension' || name === 'hole.diameter') return value && typeof value === 'object' && 'fit' in (value as object) ? 'fits' : 'dimensions';
  if (name === 'tolerance.tightest' || name === 'feature.count.holes') return 'dimensions';
  if (name.startsWith('gdt.')) return 'GD&T';
  if (name.startsWith('note.')) return 'notes';
  if (name.startsWith('quality.') || name === 'finish.edges') return 'quality';
  if (name.startsWith('weld.')) return 'welds';
  if (name.startsWith('gear.')) return 'gear';
  return undefined;
}

const norm = (s: unknown): string => String(s).toUpperCase().replace(/[−–—]/g, '-').replace(/\s+/g, ' ').trim();
const tight = (s: unknown): string => norm(s).replace(/\s/g, '');

function same(a: unknown, b: unknown): boolean {
  if (typeof b === 'number') return typeof a === 'number' && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
  if (typeof b === 'boolean') return a === b;
  if (Array.isArray(b)) return Array.isArray(a) && a.length === b.length && b.every((x, i) => same(a[i], x));
  if (typeof b === 'string') return (typeof a === 'string' || typeof a === 'number') && tight(a) === tight(b);
  return JSON.stringify(a) === JSON.stringify(b);
}

export function rowAccepts(row: TruthRow, p: EngineeringParameter): boolean {
  const nameOk = row.name === p.name || (row.name.startsWith('note.') && p.name.startsWith('note.'));
  if (!nameOk) return false;
  if (row.contains !== undefined) {
    const hay = typeof p.value === 'string' ? p.value : `${JSON.stringify(p.value)} ${p.rawText ?? ''}`;
    return norm(hay).includes(norm(row.contains));
  }
  if (row.match) {
    if (!p.value || typeof p.value !== 'object') return false;
    const v = p.value as Record<string, unknown>;
    return Object.entries(row.match).every(([k, want]) => same(v[k], want));
  }
  return same(p.value, row.value);
}

export interface GroupScore { found: number; correct: number; wrong: number; missed: number; unchecked: number; partial: number }
export interface Score { groups: Partial<Record<Group, GroupScore>>; wrongList: string[]; missedList: string[] }

const show = (v: unknown): string => { const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return s.length > 90 ? `${s.slice(0, 87)}…` : s; };

export function scoreExtraction(ex: DrawingExtraction, truth: TruthFile): Score {
  const groups: Partial<Record<Group, GroupScore>> = {};
  const g = (k: Group): GroupScore => (groups[k] ??= { found: 0, correct: 0, wrong: 0, missed: 0, unchecked: 0, partial: 0 });
  const used = new Set<string>();
  const wrongList: string[] = [], missedList: string[] = [];
  const params = truth.sheets ? ex.parameters.filter(p => !p.location || truth.sheets!.includes(p.location.sheet)) : ex.parameters;
  const open: TruthRow[] = [];
  // the most specific rows claim their readings first ("2x Ø6 THRU" before a plain "Ø6")
  const specific = (r: TruthRow): number => (r.match ? Object.keys(r.match).length : 1);
  const rows = truth.expect.map((r, i) => ({ r, i })).sort((a, b) => specific(b.r) - specific(a.r) || a.i - b.i).map(x => x.r);
  for (const row of rows) {
    const grp = groupOf(row.name, row.match ?? row.value);
    if (!grp) continue;
    const hit = params.find(p => !used.has(p.id) && rowAccepts(row, p));
    if (hit) { used.add(hit.id); g(grp).correct++; g(grp).found++; } else open.push(row);
  }
  for (const row of open) {
    const grp = groupOf(row.name, row.match ?? row.value)!;
    const part = row.partial ? params.find(p => !used.has(p.id) && p.status === 'needs-validation' && rowAccepts({ name: row.name, match: row.partial }, p)) : undefined;
    if (part) { used.add(part.id); g(grp).partial++; g(grp).found++; }
    else g(grp).missed++;
    missedList.push(`${grp}: ${row.name} = ${show(row.contains ?? row.match ?? row.value)}${part ? '   (read in part, flagged for validation)' : ''}`);
  }
  for (const p of params) {
    if (used.has(p.id)) continue;
    const grp = groupOf(p.name, p.value);
    if (!grp) continue;
    if (truth.complete.includes(grp)) { g(grp).found++; g(grp).wrong++; wrongList.push(`${grp}: ${p.name} = ${show(p.value)}   [${show(p.rawText ?? '')}]`); }
    else g(grp).unchecked++;
  }
  return { groups, wrongList, missedList };
}

export function addScores(into: Partial<Record<Group, GroupScore>>, s: Partial<Record<Group, GroupScore>>): void {
  for (const k of GROUPS) {
    const a = s[k]; if (!a) continue;
    const b = (into[k] ??= { found: 0, correct: 0, wrong: 0, missed: 0, unchecked: 0, partial: 0 });
    b.found += a.found; b.correct += a.correct; b.wrong += a.wrong; b.missed += a.missed; b.unchecked += a.unchecked; b.partial += a.partial;
  }
}

export const precision = (s: GroupScore): number | undefined => (s.correct + s.wrong ? s.correct / (s.correct + s.wrong) : undefined);
export const recall = (s: GroupScore): number | undefined => (s.correct + s.missed + s.partial ? s.correct / (s.correct + s.missed + s.partial) : undefined);

export function totals(groups: Partial<Record<Group, GroupScore>>): GroupScore {
  const t: GroupScore = { found: 0, correct: 0, wrong: 0, missed: 0, unchecked: 0, partial: 0 };
  for (const k of GROUPS) { const a = groups[k]; if (a) { t.found += a.found; t.correct += a.correct; t.wrong += a.wrong; t.missed += a.missed; t.unchecked += a.unchecked; t.partial += a.partial; } }
  return t;
}

/** The content class a fixture file exercises, from its name (generated) or the truth file (public). */
export function classOfFile(file: string, truth: TruthFile): 'vector' | 'curves' | 'scan' {
  if (truth.files?.[file]) return truth.files[file];
  if (/\.curves\./.test(file)) return 'curves';
  if (/\.scan\d*\./.test(file)) return 'scan';
  return 'vector';
}
