/**
 * The engineer's review of a drawing as a LIST OF DECISIONS that can be stored and replayed (offline 2D drawing
 * intelligence, integration — Nov 2026).
 *
 * The screen never sends a dataset to be costed. It sends the decisions the engineer took — confirm, correct, reject,
 * settle a conflict, reopen — and the server replays them, in order, onto a consolidation it built itself from the
 * drawing it read and the model it measured. A decision that no longer applies (the reading it names is gone because
 * the route changed, or the drawing was re-read by a newer reader) is SKIPPED and reported; it is never guessed at.
 *
 * Pure: `replayReview` is `overrides.ts` applied in order, with the clock and the name carried by each decision. No
 * cost formula; no costing code is called.
 */
import type { ConsolidatedEngineeringData, ParameterValue } from './model.js';
import { confirm, correct, reject, resolveConflict, reopen, supply, OverrideError, type OverrideOptions, type Who } from './overrides.js';
import { isKnownParameter } from './dictionary.js';

interface OpBase { by: string; at: string; reason?: string }

export type ReviewOp =
  | (OpBase & { op: 'confirm'; id: string })
  | (OpBase & { op: 'correct'; id: string; value: ParameterValue; unit?: string })
  | (OpBase & { op: 'reject'; id: string })
  /** Settle a conflict: `choose` one side's parameter id, or type the `value`. */
  | (OpBase & { op: 'resolve'; name: string; featureId?: string; choose?: string; value?: ParameterValue; unit?: string })
  | (OpBase & { op: 'reopen'; id: string })
  /** A value no source states. */
  | (OpBase & { op: 'supply'; name: string; value: ParameterValue; unit?: string });

export interface DrawingReviewState {
  schemaVersion: 1;
  ops: ReviewOp[];
}

export interface SkippedOp { index: number; op: ReviewOp; why: string }

export const EMPTY_REVIEW: DrawingReviewState = { schemaVersion: 1, ops: [] };

/** The most decisions one review may hold (a sheet has a few hundred readings; every one decided twice fits). */
export const MAX_REVIEW_OPS = 2000;

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

function valueOf(v: unknown): ParameterValue | null {
  if (typeof v === 'string') return v.length <= 400 ? v : null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v;
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    // a small flat object (a range, a hole, a thread): numbers, strings and flags only
    const out: Record<string, unknown> = {};
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length > 16) return null;
    for (const [k, x] of entries) {
      if (k.length > 40) return null;
      if (typeof x === 'number' ? Number.isFinite(x) : typeof x === 'boolean' || (typeof x === 'string' && x.length <= 200)) out[k] = x;
      else if (Array.isArray(x) && x.length <= 16 && x.every(e => typeof e === 'string' && e.length <= 40)) out[k] = x;
      else return null;
    }
    return out;
  }
  return null;
}

/**
 * A review state from JSON a client or a saved project supplied. Anything that is not a well-formed decision is
 * dropped — this list is replayed on the server and reaches the costing, so nothing is taken on trust.
 */
export function parseReviewState(raw: unknown): DrawingReviewState {
  let v: unknown = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v) as unknown; } catch { return { schemaVersion: 1, ops: [] }; } }
  const list = v && typeof v === 'object' ? (v as { ops?: unknown }).ops : null;
  if (!Array.isArray(list)) return { schemaVersion: 1, ops: [] };
  const ops: ReviewOp[] = [];
  for (const o of list.slice(0, MAX_REVIEW_OPS)) {
    if (!o || typeof o !== 'object') continue;
    const r = o as Record<string, unknown>;
    const by = str(r.by, 120) ?? 'engineer';
    const at = str(r.at, 40) && !Number.isNaN(Date.parse(String(r.at))) ? String(r.at) : null;
    if (!at) continue;
    const reason = str(r.reason, 400);
    const base: OpBase = { by, at, ...(reason ? { reason } : {}) };
    const id = str(r.id, 300);
    const unit = str(r.unit, 20);
    switch (r.op) {
      case 'confirm': case 'reject': case 'reopen':
        if (id) ops.push({ ...base, op: r.op, id });
        break;
      case 'correct': {
        const value = valueOf(r.value);
        if (id && value !== null && value !== '') ops.push({ ...base, op: 'correct', id, value, ...(unit ? { unit } : {}) });
        break;
      }
      case 'resolve': {
        const name = str(r.name, 80);
        const choose = str(r.choose, 300);
        const value = valueOf(r.value);
        const featureId = str(r.featureId, 80);
        if (!name || (!choose && (value === null || value === ''))) break;
        ops.push({ ...base, op: 'resolve', name, ...(featureId ? { featureId } : {}),
          ...(choose ? { choose } : { value: value as ParameterValue, ...(unit ? { unit } : {}) }) });
        break;
      }
      case 'supply': {
        const name = str(r.name, 80);
        const value = valueOf(r.value);
        if (name && isKnownParameter(name) && value !== null && value !== '') ops.push({ ...base, op: 'supply', name, value, ...(unit ? { unit } : {}) });
        break;
      }
      default: break;
    }
  }
  return { schemaVersion: 1, ops };
}

/** The review state as stable text — the same decisions give the same text, for cache keys and for storing. */
export function reviewStateKey(state: DrawingReviewState | null | undefined): string {
  const ops = state?.ops ?? [];
  if (!ops.length) return '';
  const sorted = (v: unknown): unknown => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v as object).sort().map(k => [k, sorted((v as Record<string, unknown>)[k])])) : v);
  return JSON.stringify(ops.map(sorted));
}

function applyOne(data: ConsolidatedEngineeringData, op: ReviewOp, opts: OverrideOptions): ConsolidatedEngineeringData {
  const who: Who = { by: op.by, at: op.at, ...(op.reason ? { reason: op.reason } : {}) };
  switch (op.op) {
    case 'confirm': return confirm(data, op.id, who);
    case 'correct': return correct(data, op.id, op.value, who, { ...opts, ...(op.unit ? { unit: op.unit } : {}) });
    case 'reject': return reject(data, op.id, who);
    case 'reopen': return reopen(data, op.id, who);
    case 'supply': return supply(data, { name: op.name, value: op.value, ...(op.unit ? { unit: op.unit } : {}) }, who);
    case 'resolve':
      return resolveConflict(data, { name: op.name, ...(op.featureId ? { featureId: op.featureId } : {}) },
        op.choose ? { parameterId: op.choose } : { value: op.value as ParameterValue, ...(op.unit ? { unit: op.unit } : {}) }, who);
  }
}

/**
 * Replay the engineer's decisions, in order, onto a freshly consolidated dataset. A decision that cannot be applied
 * (its reading is not in this dataset, its conflict is not open) is skipped with the reason; the rest still apply.
 */
export function replayReview(data: ConsolidatedEngineeringData, state: DrawingReviewState | null | undefined,
  opts: OverrideOptions = {}): { data: ConsolidatedEngineeringData; skipped: SkippedOp[] } {
  let cur = data;
  const skipped: SkippedOp[] = [];
  (state?.ops ?? []).forEach((op, index) => {
    try { cur = applyOne(cur, op, opts); }
    catch (e) {
      if (!(e instanceof OverrideError)) throw e;
      skipped.push({ index, op, why: e.message });
    }
  });
  return { data: cur, skipped };
}

/** One decision applied — what the screen does on a click, with the same functions the server replays. */
export function applyReviewOp(data: ConsolidatedEngineeringData, op: ReviewOp, opts: OverrideOptions = {}): ConsolidatedEngineeringData {
  return applyOne(data, op, opts);
}
