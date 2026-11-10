/**
 * A drawing in a costing — the ONE place the server joins the drawing reader's extraction to the cost engine
 * (offline 2D drawing intelligence, integration — Nov 2026).
 *
 *   extraction (read on this server) + geometry (measured on this server)
 *        └─ consolidate (Layer 3) ─ replay the engineer's review decisions ─ answersFromEngineeringData ─┐
 *                                                                                                        ▼
 *                                      answers to the engine's EXISTING questions, under the engineer's own
 *
 * Rules this file keeps:
 *  - the dataset is built here, from the server's own readings — a client sends decisions, never a dataset;
 *  - only confirmed and corrected parameters become answers (the adapter's rule), and an answer the engineer gave by
 *    hand always wins: a differing confirmed drawing value is reported (`overridden`), never applied;
 *  - with no drawing, or a drawing nobody has reviewed, `answers` is `{}` and the costing is exactly what it is today.
 *
 * No cost formula. /analyze, /reanalyze, compare-routes and the option re-costs all call `drawingContextFor`, so the
 * headline and every comparison row are costed on the same drawing-derived answers.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OCCTGeometry } from '../utils/geometry-bridge.js';
import type { Decision } from '../../src/engine/cost-input-rules/types.js';
import {
  consolidate, answersFromEngineeringData, parseSpecLookup, replayReview, reviewStateKey, parseReviewState,
  type ConsolidatedEngineeringData, type CostingAnswers, type DrawingExtraction, type DrawingReviewState, type SkippedOp, type SpecLookup,
} from '../../src/engine/engineering-data/index.js';
import { drawingFinishFields, type DrawingFinishFields } from '../../src/engine/surface-finish-routes.js';
import { READER_VERSION } from '../drawing/index.js';
import { getDrawing, drawingInfo, type DrawingInfo, type DrawingRecord } from './drawing-service.js';

// ─── The company specification table (data, admin-maintained) ───────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLED_LOOKUP = join(HERE, '..', 'data', 'spec-lookup.json');

/** Where the specification table is read from: an explicit file, the data folder's copy, or the bundled (empty) one. */
export function specLookupPath(): string {
  if (process.env.CV_SPEC_LOOKUP_FILE) return process.env.CV_SPEC_LOOKUP_FILE;
  const inData = process.env.CV_DATA_DIR ? join(process.env.CV_DATA_DIR, 'spec-lookup.json') : '';
  return inData && existsSync(inData) ? inData : BUNDLED_LOOKUP;
}

let lookupCache: { path: string; mtimeMs: number; lookup: SpecLookup; print: string } | null = null;

/** The table and a fingerprint of its content (part of every cache key: a changed table changes what a code means). */
export function specLookup(): { lookup: SpecLookup; print: string } {
  const path = specLookupPath();
  try {
    const mtimeMs = statSync(path).mtimeMs;
    if (lookupCache && lookupCache.path === path && lookupCache.mtimeMs === mtimeMs) return lookupCache;
    const lookup = parseSpecLookup(JSON.parse(readFileSync(path, 'utf8')) as unknown);
    const print = createHash('sha256').update(JSON.stringify(Object.keys(lookup).sort().map(k => [k, lookup[k]]))).digest('hex').slice(0, 12);
    lookupCache = { path, mtimeMs, lookup, print };
    return lookupCache;
  } catch (e) {
    console.warn('[drawing] specification lookup not readable — no code is resolved:', e instanceof Error ? e.message : String(e));
    return { lookup: {}, print: 'none' };
  }
}

// ─── The request side ───────────────────────────────────────────────────────────────────────────────────────────

/** What a request says about its drawing: the drawing by hash (after the first analysis) and the review decisions. */
export interface DrawingRequest {
  /** The drawing's record — read in this request (/analyze) or looked up by hash. */
  record: DrawingRecord;
  review: DrawingReviewState;
}

/** The refusal when a request names a drawing the server no longer holds — never costed without it silently. */
export const DRAWING_GONE = 'The drawing for this part is no longer on this server — attach it and measure the part again (it is not costed without the drawing it was reviewed against).';

/**
 * The drawing a JSON request names (`drawingHash` + `drawingReview`). Returns null when the request names none;
 * `{ gone: true }` when it names one this server does not hold.
 */
export function drawingFromBody(body: Record<string, unknown> | undefined | null): DrawingRequest | { gone: true } | null {
  const hash = typeof body?.drawingHash === 'string' ? body.drawingHash.trim() : '';
  if (!hash) return null;
  const record = getDrawing(hash, typeof body?.drawingFile === 'string' ? body.drawingFile.slice(0, 200) : undefined);
  if (!record) return { gone: true };
  return { record, review: parseReviewState(body?.drawingReview) };
}

/** What goes into a cache key for a costing with a drawing: the bytes, the reader, how far the read got, the decisions and the lookup table. */
export function drawingCacheKey(req: DrawingRequest | null): string {
  if (!req) return '';
  return JSON.stringify({ drawing: req.record.hash, reader: READER_VERSION, status: req.record.status, review: reviewStateKey(req.review), spec: specLookup().print });
}

// ─── The join ───────────────────────────────────────────────────────────────────────────────────────────────────

/** A confirmed drawing value the engineer's own answer overrode — shown on the panel as a conflict to settle. */
export interface OverriddenByHand { decisionId: string; parameterId: string; drawingValue: unknown; handValue: unknown; why: string }

/** The questions the adapter was shown, in the little the screen needs to say which question a reading answers. */
export interface DrawingQuestion {
  id: string; question: string; why: string; severity: Decision['severity'];
  options: Array<{ value: string; label: string; consequence?: string }>;
  /** A typed-value question: the adapter accepts a value of this kind (the screen previews with the same rule). */
  entry?: Decision['entry'];
}

export interface DrawingContext {
  /** The consolidated dataset with the engineer's decisions replayed. */
  data: ConsolidatedEngineeringData;
  /** The adapter's output: answers (confirmed only), evidence, leanings, dropped, not costed, form fields. */
  costing: CostingAnswers;
  /** Decisions that could not be replayed on this dataset (the reading is gone on this route / this read). */
  skipped: SkippedOp[];
  overridden: OverriddenByHand[];
  questions: DrawingQuestion[];
  finishFields: DrawingFinishFields;
}

export interface DrawingContextInput {
  geo: OCCTGeometry;
  /** The CAD file's name (the source of the CAD parameters). */
  filename: string;
  commodity: string;
  extraction: DrawingExtraction;
  review: DrawingReviewState;
  /** The engineer's own answers: what they clicked or typed, and a material they pinned. They always win. */
  explicitAnswers: Readonly<Record<string, unknown>>;
  /** The engine's open questions for this part, built WITHOUT any answer from the drawing. */
  bareDecisions: readonly Decision[];
}

/** Holes and bosses the kernel measured — the most a drawing may ask to mask (the screen's own bound). */
function measuredMaskable(geo: OCCTGeometry): number | undefined {
  const ft = (geo as { featureTable?: Array<{ kind?: string; count?: number }> }).featureTable;
  return ft ? ft.filter(f => f.kind === 'hole' || f.kind === 'boss').reduce((n, f) => n + (f.count || 1), 0) : undefined;
}

export function drawingContextFor(i: DrawingContextInput): DrawingContext {
  const { lookup } = specLookup();
  const fresh = consolidate({ cad: { geo: i.geo, filename: i.filename }, drawing: i.extraction, commodity: i.commodity, specLookup: lookup });
  const { data, skipped } = replayReview(fresh, i.review, { specLookup: lookup });
  const cap = measuredMaskable(i.geo);
  const costing = answersFromEngineeringData(data, i.commodity, {
    decisions: i.bareDecisions, answered: i.explicitAnswers, ...(cap !== undefined ? { measuredMaskableFeatures: cap } : {}),
  });
  // A confirmed reading the engineer's own answer overrode: said, with both values, never applied.
  const overridden: OverriddenByHand[] = costing.dropped
    .filter(d => i.explicitAnswers[d.decisionId] !== undefined && /already answered this question by hand/.test(d.why))
    .map(d => ({ decisionId: d.decisionId, parameterId: d.parameterId, drawingValue: d.value, handValue: i.explicitAnswers[d.decisionId], why: d.why }));
  const questions: DrawingQuestion[] = i.bareDecisions.map(d => ({
    id: d.id, question: d.question, why: d.why, severity: d.severity,
    options: d.options.map(o => ({ value: String(o.value), label: o.label, ...(o.consequence ? { consequence: o.consequence } : {}) })),
    ...(d.entry ? { entry: d.entry } : {}),
  }));
  return { data, costing, skipped, overridden, questions, finishFields: drawingFinishFields(costing.formFields) };
}

/** The answers a costing runs on: the drawing's confirmed answers UNDER the engineer's own. No drawing → the same object. */
export function mergeDrawingAnswers(explicit: Record<string, unknown>, ctx: DrawingContext | null): Record<string, unknown> {
  if (!ctx || !Object.keys(ctx.costing.answers).length) return explicit;
  return { ...ctx.costing.answers, ...explicit };
}

/** The three keys a costing response gains when a drawing is attached. A response without a drawing gains none. */
export function drawingResponse(req: DrawingRequest | null, ctx: DrawingContext | null): Record<string, unknown> {
  if (!req) return {};
  const info: DrawingInfo = drawingInfo(req.record);
  return {
    drawing: info,
    engineeringData: ctx?.data ?? null,
    drawingCosting: ctx ? { ...ctx.costing, skipped: ctx.skipped, overridden: ctx.overridden, questions: ctx.questions } : null,
  };
}
