/**
 * Reconciliation — the 3D CAD measurement, the 2D drawing and the engineer's own entries as ONE dataset (Layer 3).
 *
 * `consolidate` takes what each source says and returns `ConsolidatedEngineeringData`:
 *
 *  - DUPLICATES  the same value from two sources is ONE parameter that keeps both provenances (`alsoFrom`);
 *  - CONFLICTS   a different value from two sources is flagged on every side, with a suggestion by the configured
 *                precedence — and nothing is chosen. Only the engineer resolves a conflict (overrides.ts);
 *  - MISSING     what the commodity expects and no source states is listed. It is never given a value;
 *  - NOT COSTED  what the drawing states and no existing engine question consumes is listed, never dropped.
 *
 * Feature callouts (holes, threads, toleranced diameters) are matched to the CAD hole table by diameter AND count; a
 * unique match links the feature, anything else goes to the engineer with the candidates named.
 *
 * This file names no commodity: what a route expects and consumes comes from its pack (commodity/). It holds no cost
 * formula and calls no costing code.
 */
import type { OCCTGeometry } from '../ai-analysis.js';
import { tappedThread, TAPPING_DRILL_MM, type FeatureRow } from '../feature-ops.js';
import { ISO_COARSE_PITCH_MM } from '../cutting-catalogue.js';
import type {
  ConflictSide, ConsolidatedEngineeringData, DrawingExtraction, EngineeringParameter, ParameterCandidate, ParameterConflict,
  ParameterProvenance, ParameterValue,
} from './model.js';
import { isKnownParameter, parameterDef } from './dictionary.js';
import { cadToParameters } from './from-cad.js';
import { comparisonKey, designationKey, normaliseParameter, numericValue } from './normalise.js';
import { flagOf, holeOf, isDiameterDimension, rangeOf, threadOf, type HoleValue } from './values.js';
import { interpretParameters, INTERPRETS, type Unresolved } from './interpret.js';
import type { SpecLookup } from './interpret-tables.js';
import {
  DEFAULT_PRECEDENCE, DEFAULT_TOLERANCES, NEAR_MISS_DIAMETER, CALLOUT_COUNT_NAMES, precedenceFor, rankIndex, sourceRank, toleranceFor, withinTolerance,
  type ComparisonTolerance, type PrecedenceRule,
} from './precedence.js';
import { allPacks, packFor, type CommodityPack } from './commodity/index.js';
import { alignVocabulary } from './vocabulary.js';

export interface ConsolidateInput {
  /** The CAD measurement: already mapped (`cadToParameters`), or the geometry and file name to map. */
  cad?: EngineeringParameter[] | { geo: OCCTGeometry; filename: string };
  /** What the drawing reader returned — one drawing or several sheets' files. */
  drawing?: DrawingExtraction | DrawingExtraction[];
  /** Values the engineer typed (source 'manual'). */
  manual?: EngineeringParameter[];
  /** The route being costed. Without it nothing is "expected", and only route-independent readings are interpreted. */
  commodity?: string;
  /** Which source to SUGGEST on a conflict, per parameter. Default: `DEFAULT_PRECEDENCE`. */
  precedence?: readonly PrecedenceRule[];
  /** Numeric agreement per parameter. Default: `DEFAULT_TOLERANCES` (0.5 % or 0.05 mm, whichever is larger). */
  tolerances?: Readonly<Record<string, ComparisonTolerance>>;
  /** The company specification table; absent = no specification code resolves. */
  specLookup?: SpecLookup;
}

/** The one reason printed for a drawing reading no existing question consumes. */
export const NOT_COSTED_REASON = 'specified on the drawing — not in the cost model yet';
/** The reason when a question exists on another route but not on the one being costed. */
export const notCostedOnRoute = (commodity: string): string =>
  `specified on the drawing — no question on the ${commodity.replace(/_/g, ' ')} route takes it`;
/** The reason when this route HAS the question but the text could not be read into its options (also listed as missing). */
export const NOT_COSTED_UNREAD = 'specified on the drawing — not readable into the question this route asks; the question stays open';

const ENGINEER_SET = new Set(['confirmed', 'corrected']);
const FEATURE_NAMES = new Set(['hole.diameter', 'thread', 'dimension']);

const provenanceOf = (p: EngineeringParameter): ParameterProvenance => ({
  parameterId: p.id, source: p.source, method: p.method,
  ...(p.sourceFile ? { sourceFile: p.sourceFile } : {}), ...(p.rawText !== undefined ? { rawText: p.rawText } : {}),
  ...(p.location ? { location: p.location } : {}),
});
const sideOf = (p: EngineeringParameter): ConflictSide => ({
  parameterId: p.id, source: p.source, value: p.value, ...(p.unit ? { unit: p.unit } : {}), ...(p.rawText !== undefined ? { rawText: p.rawText } : {}),
});
const addNote = (p: EngineeringParameter, note: string): void => { p.note = p.note ? `${p.note}; ${note}` : note; };
const where = (p: EngineeringParameter): string =>
  p.source === 'drawing' ? `the drawing${p.location ? ` (sheet ${p.location.sheet}${p.location.zone ? `, zone ${p.location.zone}` : ''})` : ''}`
    : p.source === 'cad' ? (p.method === 'cad-metadata' ? 'the CAD file\'s own declaration' : 'the 3D model')
    : p.source === 'manual' ? 'the engineer' : 'a rule';
const show = (v: ParameterValue, unit?: string): string =>
  `${typeof v === 'object' ? JSON.stringify(v) : String(v)}${unit && typeof v !== 'object' ? ` ${unit}` : ''}`;

// ─── Value comparison ─────────────────────────────────────────────────────────────────────────────────────────────

function stableKey(v: unknown): string {
  if (typeof v === 'number') return String(Math.round(v * 1e4) / 1e4);
  if (typeof v === 'string') return comparisonKey(v);
  if (Array.isArray(v)) return `[${v.map(stableKey).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map(k => `${k}:${stableKey((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return String(v);
}

/** Do two readings of one parameter state the same value? */
export function sameValue(name: string, a: EngineeringParameter, b: EngineeringParameter, tol: ComparisonTolerance): boolean {
  const def = parameterDef(name);
  if (def?.valueType === 'flag') { const x = flagOf(a.value); const y = flagOf(b.value); return x !== null && x === y; }
  const na = numericValue(a.value); const nb = numericValue(b.value);
  if (na != null && nb != null && (def?.valueType === 'number' || def?.valueType === 'object')) return withinTolerance(na, nb, tol);
  if (name === 'part.envelope') {
    const ea = a.value as Record<string, number>; const eb = b.value as Record<string, number>;
    return ['lengthMm', 'widthMm', 'heightMm'].every(k => typeof ea?.[k] === 'number' && typeof eb?.[k] === 'number' && withinTolerance(ea[k], eb[k], tol));
  }
  if (def?.valueType === 'object' && typeof a.value === 'object' && typeof b.value === 'object') {
    const ra = rangeOf(a.value); const rb = rangeOf(b.value);
    if (ra && rb) return withinTolerance(ra.min, rb.min, tol) && withinTolerance(ra.max, rb.max, tol);
    return stableKey(a.value) === stableKey(b.value);
  }
  if (typeof a.value === 'string' && typeof b.value === 'string') {
    return name === 'material.designation'
      ? designationKey(a.value) === designationKey(b.value) || comparisonKey(a.value) === comparisonKey(b.value)
      : comparisonKey(a.value) === comparisonKey(b.value);
  }
  if (na != null && nb != null) return withinTolerance(na, nb, tol);
  return stableKey(a.value) === stableKey(b.value);
}

// ─── The working set ──────────────────────────────────────────────────────────────────────────────────────────────

interface Work {
  params: EngineeringParameter[];
  byId: Map<string, EngineeringParameter>;
  conflicts: ParameterConflict[];
  removed: Set<string>;
  /** Values left in a source's own vocabulary (vocabulary.ts): never compared with engine-vocabulary values. */
  foreign: Set<string>;
  precedence: readonly PrecedenceRule[];
  tolerances: Readonly<Record<string, ComparisonTolerance>>;
}

function originOf(w: Work, p: EngineeringParameter): EngineeringParameter | undefined {
  let cur = p; const seen = new Set<string>();
  while (cur.source === 'derived' && cur.derivedFrom?.length && !seen.has(cur.id)) {
    seen.add(cur.id);
    const next = w.byId.get(cur.derivedFrom[0]);
    if (!next) break;
    cur = next;
  }
  return cur === p ? undefined : cur;
}

function rankOf(w: Work, p: EngineeringParameter): number {
  return rankIndex(sourceRank(p, originOf(w, p)), precedenceFor(p.name, w.precedence));
}

/** Fold `others` into `primary`: one parameter, every provenance kept. */
function merge(w: Work, primary: EngineeringParameter, others: EngineeringParameter[]): void {
  if (!others.length) return;
  primary.alsoFrom = [...(primary.alsoFrom ?? []), ...others.flatMap(o => [provenanceOf(o), ...(o.alsoFrom ?? [])])];
  addNote(primary, `also stated by ${[...new Set(others.map(where))].join(' and ')} — the same value`);
  for (const o of others) {
    w.removed.add(o.id);
    // Anything derived from a folded reading now hangs off the reading that was kept.
    for (const d of w.params) if (d.derivedFrom?.includes(o.id)) d.derivedFrom = d.derivedFrom.map(id => (id === o.id ? primary.id : id));
  }
}

function flagConflict(w: Work, name: string, sides: EngineeringParameter[], why: string, appliesTo?: EngineeringParameter['appliesTo']): void {
  const ranked = sides.map(p => ({ p, r: rankOf(w, p) })).sort((a, b) => a.r - b.r);
  const suggested = ranked.length > 1 && ranked[0].r < ranked[1].r ? ranked[0].p.id : undefined;
  const rule = precedenceFor(name, w.precedence);
  const nums = sides.map(s => numericValue(s.value) ?? holeOf(s)?.diameterMm ?? null);
  const difference = sides.length === 2 && nums[0] != null && nums[1] != null
    ? { abs: Math.abs(nums[0] - nums[1]), rel: Math.abs(nums[0] - nums[1]) / Math.max(Math.abs(nums[0]), Math.abs(nums[1]), 1e-12) } : undefined;
  for (const s of sides) {
    if (!ENGINEER_SET.has(s.status)) s.status = 'conflict';
    addNote(s, `conflict: ${why}`);
  }
  w.conflicts.push({
    name, ...(appliesTo ? { appliesTo } : {}), sides: sides.map(sideOf),
    ...(suggested ? { suggested } : {}), ...(difference ? { difference } : {}),
    why: why + (suggested && rule ? ` Suggested: ${where(w.byId.get(suggested)!)} — ${rule.why}. Nothing is applied until the engineer chooses.` : ' Nothing is applied until the engineer chooses.'),
  });
}

// ─── Features: drawing callouts against the CAD hole table ────────────────────────────────────────────────────────

interface CadHole { p: EngineeringParameter; h: HoleValue; featureId: string }

const holeLabel = (c: CadHole): string => c.p.appliesTo?.description ?? `${c.h.count ?? 1} × Ø${c.h.diameterMm}`;
const candidateOf = (c: CadHole): ParameterCandidate => ({ value: c.h.diameterMm, label: holeLabel(c), featureId: c.featureId });

function link(callout: EngineeringParameter, rows: CadHole[], how: string): void {
  callout.appliesTo = {
    ...(callout.appliesTo ?? {}),
    featureId: rows.map(r => r.featureId).join('+'),
    faceIds: [...new Set(rows.flatMap(r => r.p.appliesTo?.faceIds ?? []))],
  };
  addNote(callout, `matched to the 3D model: ${rows.map(holeLabel).join(' + ')} (${how})`);
}

/** Choose the CAD rows a callout of `count` holes covers among rows of the right diameter. */
function byCount(rows: CadHole[], count: number | undefined): { rows: CadHole[] } | { ambiguous: true } | { countDiffers: number } | null {
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + (r.h.count ?? 1), 0);
  if (count == null) return rows.length === 1 ? { rows } : { ambiguous: true };
  const exact = rows.filter(r => (r.h.count ?? 1) === count);
  if (exact.length === 1) return { rows: exact };
  if (total === count) return { rows };
  if (exact.length > 1) return { ambiguous: true };
  return rows.length === 1 ? { countDiffers: total } : { ambiguous: true };
}

function matchFeatures(w: Work): void {
  const hasTable = w.params.some(p => p.source === 'cad' && p.name === 'feature.count.holes');
  const cad: CadHole[] = w.params.filter(p => p.source === 'cad' && p.name === 'hole.diameter')
    .flatMap(p => { const h = holeOf(p); return h && p.appliesTo?.featureId ? [{ p, h, featureId: p.appliesTo.featureId }] : []; });
  if (!hasTable) return;        // no measured feature table to match against: callouts stay exactly as read
  const tol = toleranceFor('hole.diameter', w.tolerances);
  const claimed = new Set<string>();
  const near: Array<{ p: EngineeringParameter; h: HoleValue }> = [];

  // ── Holes and toleranced diameters ──
  const callouts = w.params.filter(p => p.source === 'drawing' && !ENGINEER_SET.has(p.status) && p.status !== 'rejected'
    && (p.name === 'hole.diameter' || (p.name === 'dimension' && isDiameterDimension(p))));
  for (const p of callouts) {
    const h = holeOf(p);
    if (!h) continue;
    const isHole = p.name === 'hole.diameter';
    const atDia = cad.filter(c => withinTolerance(c.h.diameterMm, h.diameterMm, tol));
    const m = byCount(atDia, h.count);
    if (m && 'rows' in m) {
      m.rows.forEach(r => claimed.add(r.featureId));
      link(p, m.rows, `Ø${h.diameterMm}${h.count ? ` × ${h.count}` : ''} by diameter and count`);
      // A callout that says no more than the model does is the same fact twice: one parameter, both provenances.
      if (isHole && !h.toleranced && m.rows.length === 1) merge(w, m.rows[0].p, [p]);
    } else if (!isHole) {
      continue;      // a diameter dimension that is not a unique hole may be a shaft or a boss — left as read
    } else if (m && 'countDiffers' in m) {
      claimed.add(atDia[0].featureId);
      link(p, atDia, 'by diameter');
      flagConflict(w, 'hole.diameter', [atDia[0].p, p],
        `the drawing calls ${h.count} × Ø${h.diameterMm} and the 3D model has ${m.countDiffers} × Ø${atDia[0].h.diameterMm}.`, p.appliesTo);
    } else if (m && 'ambiguous' in m) {
      p.status = 'needs-validation'; p.candidates = atDia.map(candidateOf);
      addNote(p, `Ø${h.diameterMm}${h.count ? ` × ${h.count}` : ''} fits more than one group of holes in the 3D model (${atDia.map(holeLabel).join('; ')}) — say which`);
    } else {
      near.push({ p, h });
    }
  }
  // A callout with no hole of its size: the SAME hole at another size (a conflict), or a hole the model does not have.
  for (const { p, h } of near) {
    const free = cad.filter(c => !claimed.has(c.featureId) && withinTolerance(c.h.diameterMm, h.diameterMm, NEAR_MISS_DIAMETER)
      && (h.count == null || (c.h.count ?? 1) === h.count));
    if (free.length === 1) {
      claimed.add(free[0].featureId);
      link(p, free, 'the only hole of that count near that size');
      flagConflict(w, 'hole.diameter', [free[0].p, p],
        `the drawing states Ø${h.diameterMm} and the 3D model measures Ø${free[0].h.diameterMm} on the same ${(h.count ?? 1) > 1 ? `${h.count} holes` : 'hole'}.`, p.appliesTo);
    } else {
      const nearest = [...cad].sort((a, b) => Math.abs(a.h.diameterMm - h.diameterMm) - Math.abs(b.h.diameterMm - h.diameterMm)).slice(0, 3);
      p.status = 'needs-validation';
      if (nearest.length) p.candidates = nearest.map(candidateOf);
      addNote(p, nearest.length
        ? `no hole of Ø${h.diameterMm}${h.count ? ` × ${h.count}` : ''} in the 3D model — the nearest are ${nearest.map(holeLabel).join('; ')}`
        : `no hole of Ø${h.diameterMm} in the 3D model — it has no holes`);
    }
  }

  // ── Threads: at the tapping-drill Ø (ISO 261 coarse pitch, the costing's own table) or at the nominal Ø ──
  const inferred = new Map<string, EngineeringParameter>(w.params.filter(p => p.name === 'thread' && p.source === 'derived' && p.appliesTo?.featureId)
    .map(p => [p.appliesTo!.featureId!, p]));
  for (const p of w.params.filter(x => x.source === 'drawing' && x.name === 'thread' && !ENGINEER_SET.has(x.status) && x.status !== 'rejected')) {
    const t = threadOf(p);
    if (!t) { p.status = 'needs-validation'; addNote(p, 'not a metric thread designation this layer reads — cannot be matched to the 3D model'); continue; }
    const coarse = ISO_COARSE_PITCH_MM[t.designation];
    const isCoarse = t.pitchMm == null || (coarse != null && Math.abs(coarse - t.pitchMm) < 1e-9);
    const drill = isCoarse ? TAPPING_DRILL_MM[t.designation] : t.pitchMm != null ? t.nominalMm - t.pitchMm : undefined;
    const row = (c: CadHole): FeatureRow => ({ kind: 'hole', diaMm: c.h.diameterMm, depthMm: c.h.depthMm ?? 0, through: c.h.through ?? null, count: c.h.count ?? 1 });
    const atDrill = cad.filter(c => (isCoarse && tappedThread(row(c)) === t.designation) || (drill != null && Math.abs(c.h.diameterMm - drill) <= 0.1));
    const atNominal = cad.filter(c => withinTolerance(c.h.diameterMm, t.nominalMm, tol));
    const pool = atDrill.length ? atDrill : atNominal;
    const m = byCount(pool, t.count);
    const how = atDrill.length
      ? `at the tapping-drill Ø${drill ?? pool[0].h.diameterMm} — ${isCoarse ? `ISO 261 coarse pitch ${coarse ?? '?'} mm, the costing's tapping-drill table` : `nominal − the stated pitch ${t.pitchMm} mm (engineering judgement)`}`
      : `at the nominal Ø${t.nominalMm} (the thread is modelled at its nominal size)`;
    if (m && 'rows' in m) {
      link(p, m.rows, how);
      const inf = m.rows.length === 1 ? inferred.get(m.rows[0].featureId) : undefined;
      const said = inf ? threadOf(inf) : null;
      if (inf && said && !w.removed.has(inf.id)) {
        // The drawing's explicit callout and the model's inferred thread on one feature: agree → one row; differ → conflict.
        if (said.designation === t.designation && isCoarse) merge(w, p, [inf]);
        else flagConflict(w, 'thread', [inf, p], `the drawing calls ${t.designation}${t.pitchMm ? ` × ${t.pitchMm}` : ''} where the hole size implies ${said.designation}.`, p.appliesTo);
      }
    } else if (m && 'countDiffers' in m) {
      link(p, pool, how);
      p.status = 'needs-validation'; p.candidates = pool.map(candidateOf);
      addNote(p, `the drawing calls ${t.count} × ${t.designation} and the 3D model has ${m.countDiffers} hole(s) of that size — check the count`);
    } else {
      const options = pool.length ? pool : [...cad].sort((a, b) => Math.abs(a.h.diameterMm - (drill ?? t.nominalMm)) - Math.abs(b.h.diameterMm - (drill ?? t.nominalMm))).slice(0, 3);
      p.status = 'needs-validation';
      if (options.length) p.candidates = options.map(candidateOf);
      addNote(p, pool.length
        ? `${t.designation} fits more than one group of holes in the 3D model (${pool.map(holeLabel).join('; ')}) — say which`
        : `no hole at the ${t.designation} tapping-drill${drill != null ? ` (Ø${drill})` : ''} or nominal (Ø${t.nominalMm}) size in the 3D model${options.length ? ` — the nearest are ${options.map(holeLabel).join('; ')}` : ''}`);
    }
  }
}

// ─── Whole-part parameters: duplicates and conflicts ──────────────────────────────────────────────────────────────

function reconcileGroups(w: Work): void {
  const groups = new Map<string, EngineeringParameter[]>();
  for (const p of w.params) {
    if (w.removed.has(p.id) || w.foreign.has(p.id) || p.status === 'rejected' || p.status === 'missing' || FEATURE_NAMES.has(p.name)) continue;
    const def = parameterDef(p.name);
    const key = def?.multiple
      // A repeating name never conflicts with itself: only an identical reading of the same thing is a duplicate.
      ? `${p.name}|${p.appliesTo?.featureId ?? p.appliesTo?.description ?? ''}|${stableKey(p.value)}`
      : p.name;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(p);
  }
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const name = members[0].name;
    const tol = toleranceFor(name, w.tolerances);
    // Classes of agreeing readings.
    const classes: EngineeringParameter[][] = [];
    for (const p of members) {
      const c = classes.find(k => sameValue(name, k[0], p, tol));
      if (c) c.push(p); else classes.push([p]);
    }
    const primaries = classes.map(c => {
      // The engineer's value first; then the configured precedence; then, between a source's own interpreted value and
      // this layer's interpretation of the same reading, the one that names what it was read from.
      const sorted = [...c].sort((a, b) => Number(ENGINEER_SET.has(b.status)) - Number(ENGINEER_SET.has(a.status)) || rankOf(w, a) - rankOf(w, b)
        || Number(Boolean(b.derivedFrom?.length)) - Number(Boolean(a.derivedFrom?.length)));
      merge(w, sorted[0], sorted.slice(1));
      return sorted[0];
    });
    if (primaries.length < 2) continue;
    // The engineer's own value settles a difference; every other reading stays visible and is not costed.
    const decided = primaries.find(p => ENGINEER_SET.has(p.status));
    if (decided) {
      for (const p of primaries) if (p !== decided && !ENGINEER_SET.has(p.status)) addNote(p, `differs from the value the engineer set (${show(decided.value, decided.unit)}), which stands`);
      continue;
    }
    // A count summed from the drawing's callouts covers only what is called out: fewer than the model has is not a conflict.
    if (CALLOUT_COUNT_NAMES.has(name)) {
      const measured = primaries.find(p => p.source === 'cad');
      const m = measured ? numericValue(measured.value) : null;
      const called = primaries.filter(p => p !== measured);
      if (m != null && called.every(p => { const n = numericValue(p.value); return n != null && n < m; })) {
        for (const p of called) addNote(p, `the drawing calls out ${show(p.value)} of the ${m} the 3D model has — a count of callouts is not a full count, so this is not a conflict`);
        continue;
      }
    }
    flagConflict(w, name, primaries,
      `${parameterDef(name)?.label ?? name}: ${primaries.map(p => `${where(p)} says ${show(p.value, p.unit)}`).join('; ')}.`);
  }
}

// ─── Missing and not costed ───────────────────────────────────────────────────────────────────────────────────────

/** What the commodity expects and no live parameter states, plus readings that could not be interpreted. */
export function computeMissing(params: readonly EngineeringParameter[], commodity: string | undefined, unresolved: readonly Unresolved[] = [],
  pack: CommodityPack | undefined = packFor(commodity)): ConsolidatedEngineeringData['missing'] {
  const live = new Set(params.filter(p => p.status !== 'rejected' && p.status !== 'missing').map(p => p.name));
  const out: ConsolidatedEngineeringData['missing'] = [];
  for (const e of pack?.expected ?? []) {
    if (![e.name, ...(e.alternatives ?? [])].some(n => live.has(n))) out.push({ name: e.name, why: e.why });
  }
  for (const u of unresolved) {
    if (!live.has(u.name) && !out.some(m => m.name === u.name && m.why === u.why)) out.push({ name: u.name, why: u.why });
  }
  return out;
}

/** A drawing figure the 3D model also measures: a cross-check of the model, not a requirement to cost. */
function isCrossCheck(p: EngineeringParameter): boolean {
  const def = parameterDef(p.name);
  if (def?.group === 'geometry' || def?.group === 'identity') return true;
  if (p.name.startsWith('feature.count.') || p.name === 'material.stockThickness' || p.name === 'material.standard') return true;
  if (p.name === 'gear.teeth' || p.name === 'gear.module' || p.name === 'gear.faceWidth') return true;
  if (p.name === 'hole.diameter') return !holeOf(p)?.toleranced;
  return false;
}

/** Drawing readings with no consumer on this route: shown and reported, never costed. */
export function computeNotCosted(params: readonly EngineeringParameter[], commodity: string | undefined,
  pack: CommodityPack | undefined = packFor(commodity)): ConsolidatedEngineeringData['notCosted'] {
  const namesOf = (p: CommodityPack) => [...p.bindings.map(b => b.parameter), ...(p.formFields ?? []).map(f => f.parameter)];
  const here = new Set(pack ? namesOf(pack) : allPacks().flatMap(namesOf));
  const anywhere = new Set(allPacks().flatMap(namesOf));
  const derivedFrom = new Map<string, EngineeringParameter[]>();
  for (const d of params) for (const id of d.derivedFrom ?? []) (derivedFrom.get(id) ?? derivedFrom.set(id, []).get(id)!).push(d);
  const consumed = (p: EngineeringParameter, names: Set<string>, seen = new Set<string>()): boolean => {
    if (names.has(p.name)) return true;
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return (derivedFrom.get(p.id) ?? []).some(d => consumed(d, names, seen));
  };
  const couldYield = (p: EngineeringParameter, names: Set<string>): boolean => (INTERPRETS[p.name] ?? []).some(n => names.has(n));
  const out: ConsolidatedEngineeringData['notCosted'] = [];
  for (const p of params) {
    if (p.source !== 'drawing' || p.status === 'rejected' || p.status === 'missing' || isCrossCheck(p)) continue;
    if (consumed(p, here)) continue;
    const why = commodity && pack && couldYield(p, here) ? NOT_COSTED_UNREAD
      : commodity && pack && (consumed(p, anywhere) || couldYield(p, anywhere)) ? notCostedOnRoute(commodity)
      : NOT_COSTED_REASON;
    out.push({ parameterId: p.id, why });
  }
  return out;
}

// ─── consolidate ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * One dataset from every source. Pure: the inputs are not changed. A dataset built from the CAD measurement alone has
 * no drawing parameter, so the adapter (to-costing.ts) gives the engine nothing it did not already have.
 */
export function consolidate(input: ConsolidateInput): ConsolidatedEngineeringData {
  const drawings = input.drawing ? (Array.isArray(input.drawing) ? input.drawing : [input.drawing]) : [];
  const cadParams = !input.cad ? [] : Array.isArray(input.cad) ? input.cad : cadToParameters(input.cad.geo, input.cad.filename);

  // Every parameter as its own copy, in the dictionary's unit, under an id that is unique in the dataset.
  const ids = new Set<string>();
  const take = (p: EngineeringParameter, prefix: string, sourceFile?: string): EngineeringParameter => {
    const n = normaliseParameter({ ...p, ...(p.sourceFile || !sourceFile ? {} : { sourceFile }) });
    let id = n.id || `${prefix}:${n.name}`;
    for (let i = 2; ids.has(id); i++) id = `${n.id || `${prefix}:${n.name}`}#${i}`;
    ids.add(id);
    const copy: EngineeringParameter = { ...n, id, ...(n.appliesTo ? { appliesTo: { ...n.appliesTo } } : {}) };
    if (!isKnownParameter(copy.name)) {
      if (!ENGINEER_SET.has(copy.status) && copy.status !== 'rejected') copy.status = 'needs-validation';
      addNote(copy, `"${copy.name}" is not a name in the parameter dictionary — shown, never used`);
    }
    return copy;
  };
  const read: EngineeringParameter[] = [
    ...cadParams.map(p => take(p, 'cad')),
    ...drawings.flatMap((d, i) => d.parameters.map(p => take(p, drawings.length > 1 ? `drawing${i + 1}` : 'drawing', d.sourceFile))),
    ...(input.manual ?? []).map(p => take(p, 'manual')),
  ];
  const interpretation = interpretParameters(read, { ...(input.commodity ? { commodity: input.commodity } : {}), ...(input.specLookup ? { specLookup: input.specLookup } : {}) });
  const params = [...read, ...interpretation.parameters.map(p => take(p, 'derived'))];

  // A source's own word for a value the engine's question takes is re-stated in the engine's vocabulary — unless an
  // interpretation of the same source already settles that name differently (a casting grade beside an ISO 2768 class).
  const byIdAll = new Map(params.map(p => [p.id, p]));
  const rootOf = (p: EngineeringParameter): EngineeringParameter => {
    let cur = p; const seen = new Set<string>();
    while (cur.derivedFrom?.length && !seen.has(cur.id)) { seen.add(cur.id); const up = byIdAll.get(cur.derivedFrom[0]); if (!up) break; cur = up; }
    return cur;
  };
  const foreign = alignVocabulary(params, (p, value) => {
    const other = params.find(d => d.source === 'derived' && d.name === p.name && comparisonKey(String(d.value)) !== comparisonKey(value)
      && rootOf(d).source === p.source && (rootOf(d).sourceFile ?? '') === (p.sourceFile ?? ''));
    return other ? `${where(rootOf(other))} also states ${show(rootOf(other).value)}, which reads as "${String(other.value)}" and governs` : null;
  });

  const w: Work = {
    params, byId: byIdAll, conflicts: [], removed: new Set(), foreign,
    precedence: input.precedence ?? DEFAULT_PRECEDENCE, tolerances: input.tolerances ?? DEFAULT_TOLERANCES,
  };
  matchFeatures(w);
  reconcileGroups(w);

  const kept = w.params.filter(p => !w.removed.has(p.id));
  const sources: ConsolidatedEngineeringData['sources'] = [];
  const cadFile = cadParams.find(p => p.sourceFile)?.sourceFile;
  if (cadParams.length) sources.push({ source: 'cad', ...(cadFile ? { file: cadFile } : {}) });
  for (const d of drawings) sources.push({ source: 'drawing', file: d.sourceFile, readerVersion: d.readerVersion });
  if (input.manual?.length) sources.push({ source: 'manual' });
  if (interpretation.parameters.length) sources.push({ source: 'derived' });

  return {
    schemaVersion: 1,
    ...(input.commodity ? { commodity: input.commodity } : {}),
    parameters: kept,
    conflicts: w.conflicts,
    missing: computeMissing(kept, input.commodity, interpretation.unresolved),
    notCosted: computeNotCosted(kept, input.commodity),
    sources,
  };
}
