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
 *
 * A decision is BOUND to the drawing and the value it was taken on (review F04 / D02, Nov 2026). Reading ids are
 * positional (`drawing:<name>:<n>`), so an id alone could land on another reading — of another drawing, or of the same
 * drawing re-read by a newer reader. Each decision therefore carries the drawing's hash (or the review states it once)
 * and, for one taken on a reading, the value the engineer saw (`seen`). On replay a decision made on another drawing,
 * one that says no drawing at all, or one whose reading now holds a different value is SKIPPED with the reason.
 *
 * Who decided and when are the SERVER's (review F05): `parseReviewState(raw, stamp)` writes the signed-in user and the
 * server's clock over whatever the client sent. The cache key (`reviewStateKey`) holds the decisions only — never who
 * or when (D16).
 */
import type { ConsolidatedEngineeringData, ParameterValue } from './model.js';
import { confirm, correct, reject, resolveConflict, reopen, supply, OverrideError, type OverrideOptions, type Who } from './overrides.js';
import { isKnownParameter } from './dictionary.js';

interface OpBase {
  by: string; at: string; reason?: string;
  /** The SHA-256 of the drawing the decision was taken on (else the review's own `drawingHash`). */
  drawingHash?: string;
  /**
   * The value of the reading when the decision was taken (`seenKey` of it) — confirm, correct, reject, reopen, and the
   * chosen side of a resolve. Replay skips the decision when the reading now holds another value.
   */
  seen?: string;
}

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
  /** The drawing every decision without its own `drawingHash` was taken on. */
  drawingHash?: string;
  ops: ReviewOp[];
}

/** Who decided and when, as the SERVER knows it: the signed-in user and the server's clock. */
export interface ReviewStamp { by: string; at: string }

/** What a replay is told about the drawing it replays onto. */
export interface ReplayOptions extends OverrideOptions {
  /** The hash of the drawing this dataset was read from. Given (the server always gives it), every decision must name it. */
  drawingHash?: string;
}

export interface SkippedOp { index: number; op: ReviewOp; why: string }

export const EMPTY_REVIEW: DrawingReviewState = { schemaVersion: 1, ops: [] };

/** The most decisions one review may hold (a sheet has a few hundred readings; every one decided twice fits). */
export const MAX_REVIEW_OPS = 2000;

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
const HASH_RE = /^[a-f0-9]{64}$/;
const hashOf = (v: unknown): string | null => (typeof v === 'string' && HASH_RE.test(v) ? v : null);

/** A value as stable text: object keys sorted, so the same value always gives the same text. */
function canonical(v: unknown): string {
  const sorted = (x: unknown): unknown => (x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.keys(x as object).sort().map(k => [k, sorted((x as Record<string, unknown>)[k])]))
    : Array.isArray(x) ? x.map(sorted) : x);
  return JSON.stringify(sorted(v)) ?? 'null';
}

/** FNV-1a, 2 × 32 bit — a short fingerprint of a long value (not a security hash: it only detects a changed reading). */
function fnv(text: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/** The most text a `seen` value keeps as itself; a longer value is kept as its fingerprint. */
const SEEN_MAX = 400;

/**
 * The value of a reading as a decision records it (`seen`): the value itself as stable text, or `#` + a fingerprint
 * when it is long. The screen and the server compute it with this one function.
 */
export function seenKey(value: unknown): string {
  const t = canonical(value);
  return t.length <= SEEN_MAX ? t : `#${fnv(t)}`;
}

/** A `seen` value for a message: short, and said as the value it was. */
function seenText(seen: string): string {
  if (seen.startsWith('#')) return 'a longer value';
  let v: unknown = seen;
  try { v = JSON.parse(seen) as unknown; } catch { /* the text itself */ }
  const t = typeof v === 'string' ? `"${v}"` : typeof v === 'object' ? seen : String(v);
  return t.length > 80 ? `${t.slice(0, 77)}…` : t;
}

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
 *
 * `stamp` (the server always passes it): who decided and when are the signed-in user and the server's clock, written
 * over whatever the client sent — the history the reports print is never the client's word (F05).
 */
export function parseReviewState(raw: unknown, stamp?: ReviewStamp): DrawingReviewState {
  let v: unknown = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v) as unknown; } catch { return { schemaVersion: 1, ops: [] }; } }
  const list = v && typeof v === 'object' ? (v as { ops?: unknown }).ops : null;
  if (!Array.isArray(list)) return { schemaVersion: 1, ops: [] };
  const reviewHash = hashOf((v as { drawingHash?: unknown }).drawingHash);
  const ops: ReviewOp[] = [];
  for (const o of list.slice(0, MAX_REVIEW_OPS)) {
    if (!o || typeof o !== 'object') continue;
    const r = o as Record<string, unknown>;
    const by = stamp ? stamp.by : str(r.by, 120) ?? 'engineer';
    const at = stamp ? stamp.at : str(r.at, 40) && !Number.isNaN(Date.parse(String(r.at))) ? String(r.at) : null;
    if (!at) continue;
    const reason = str(r.reason, 400);
    const opHash = hashOf(r.drawingHash);
    const seen = str(r.seen, SEEN_MAX + 2);
    const base: OpBase = { by, at, ...(reason ? { reason } : {}), ...(opHash ? { drawingHash: opHash } : {}), ...(seen ? { seen } : {}) };
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
  return { schemaVersion: 1, ...(reviewHash ? { drawingHash: reviewHash } : {}), ops };
}

/**
 * The review state as stable text — the same DECISIONS give the same text, for cache keys and change detection: the
 * action, the reading or conflict it names, the value typed or chosen, the value seen, the drawing, and the reason the
 * engineer wrote (it is part of the decision as recorded and printed). Who decided and when are NOT in it (D16): the same
 * decisions taken again later, or stamped by the server at another request, give the same key.
 */
export function reviewStateKey(state: DrawingReviewState | null | undefined): string {
  const ops = state?.ops ?? [];
  if (!ops.length) return '';
  return JSON.stringify(ops.map(op => {
    const { by: _by, at: _at, drawingHash, ...decision } = op;
    return JSON.parse(canonical({ ...decision, drawing: drawingHash ?? state?.drawingHash ?? null })) as unknown;
  }));
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

/** The reading a decision was taken on, for the `seen` check: the id it names, or the side it chose. */
function readingOf(op: ReviewOp): string | null {
  if (op.op === 'confirm' || op.op === 'correct' || op.op === 'reject' || op.op === 'reopen') return op.id;
  if (op.op === 'resolve' && op.choose) return op.choose;
  return null;
}

/** Why a decision does not belong on this dataset — another drawing, no drawing named, a reading that changed — or null. */
export function bindingProblem(data: ConsolidatedEngineeringData, op: ReviewOp, state: DrawingReviewState | null | undefined,
  drawingHash: string | undefined): string | null {
  if (drawingHash) {
    const stated = op.drawingHash ?? state?.drawingHash;
    if (!stated) return 'the decision does not say which drawing it was taken on (a review saved before decisions were bound to their drawing) — take it again on this drawing';
    if (stated !== drawingHash) return `the decision was taken on another drawing (${stated.slice(0, 8)}), not this one (${drawingHash.slice(0, 8)})`;
  }
  const rid = readingOf(op);
  if (op.seen !== undefined && rid) {
    const p = data.parameters.find(x => x.id === rid);
    if (p && seenKey(p.value) !== op.seen) {
      return `the reading "${rid}" now holds ${seenText(seenKey(p.value))}; the decision was taken when it held ${seenText(op.seen)}`;
    }
  }
  return null;
}

/**
 * Replay the engineer's decisions, in order, onto a freshly consolidated dataset. A decision that cannot be applied
 * (its reading is not in this dataset, its conflict is not open, it was taken on another drawing, or its reading now
 * holds another value) is skipped with the reason; the rest still apply.
 */
export function replayReview(data: ConsolidatedEngineeringData, state: DrawingReviewState | null | undefined,
  opts: ReplayOptions = {}): { data: ConsolidatedEngineeringData; skipped: SkippedOp[] } {
  const { drawingHash, ...overrideOpts } = opts;
  let cur = data;
  const skipped: SkippedOp[] = [];
  (state?.ops ?? []).forEach((op, index) => {
    const why = bindingProblem(cur, op, state, drawingHash);
    if (why) { skipped.push({ index, op, why }); return; }
    try { cur = applyOne(cur, op, overrideOpts); }
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
