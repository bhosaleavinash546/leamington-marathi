/**
 * Bulk costing — a basket of parts in, a defensible record out, with no AI.
 *
 * The per-part chain (measure → rules → cost) has existed headlessly since
 * `scripts/cost-from-cad.ts`. What has never existed is the *run*: a list going
 * in, work happening in parallel, one question answered once instead of once per
 * part, and a record that can be reproduced next quarter. That is this file.
 *
 * ## Three design rules, and why
 *
 * 1. **No AI, anywhere.** Every step here is the deterministic path — the same
 *    one `cost-from-cad.ts` drives. Commodity comes from the list or from
 *    `inferCommodity` on measured geometry; material comes from the list. There
 *    is no model call to make, so this runs unchanged under `AIR_GAPPED=1`.
 *
 * 2. **Refuse rather than default.** A part whose geometry cannot settle the
 *    process, or which still has a blocking question, is returned as
 *    `needs_answer` with the question — not costed on a guess. A non-UK region
 *    is `refused`, because `executeCalculateCost` has no region parameter and
 *    costing a Poland part at UK rates would be quietly wrong, which is worse
 *    than not costing it. When that gap closes, delete `regionGuard`.
 *
 * 3. **One answer, every part it affects.** Open questions are aggregated by
 *    decision id across the whole basket, so forty parts asking "what material?"
 *    surface as one question naming forty parts. Answering it in `answers`
 *    re-runs all of them.
 *
 * The returned `BulkRunRecord` is the durable artefact: it carries the rule
 * engine version, the rate library version and the shop defaults alongside every
 * input and every answer, so a run can be reproduced and explained later. That
 * is the "record of every costing" the business case lists as a prerequisite.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { analyzeGeometry } from '../utils/geometry-bridge.js';
import { executeCalculateCost } from './cost-executor.js';
import { buildDeterministicAnalysis } from '../../src/engine/cost-input-rules/deterministic.js';
import { specForCommodity } from '../../src/engine/cost-input-rules/index.js';
import { inferCommodity } from '../../src/engine/cost-input-rules/derive/commodity.js';
import { materialFacts } from '../../src/engine/cost-input-rules/derive/material.js';
import {
  toCostParams, SHOP_DEFAULTS, COSTABLE_COMMODITIES,
} from '../../src/engine/cost-input-rules/to-cost-params.js';
import { RULE_ENGINE_VERSION } from '../../src/engine/cost-input-rules/types.js';
import { DEFAULT_RATE_LIBRARY } from '../../src/engine/rate-library.js';
import type { RateLibrary } from '../../src/engine/types.js';
import type { RuleContext } from '../../src/engine/cost-input-rules/types.js';

/** One line of the part list. Extra `a.b` keys are per-part decision answers. */
export interface BulkPartInput {
  partNumber: string;
  /** Path to the CAD file, or the bytes directly (tests, in-memory callers). */
  file: string;
  bytes?: Buffer;
  commodity?: string;
  /** Shorthand for the `material.family` answer, the question every part asks. */
  material?: string;
  annualVolume?: number;
  region?: string;
  /** Any other decision answers for this part alone, keyed by decision id. */
  answers?: Record<string, unknown>;
}

export type BulkPartStatus = 'costed' | 'needs_answer' | 'refused' | 'error';

export interface BulkOpenQuestion {
  id: string;
  question: string;
  why: string;
  options: { value: string; label: string; leaning?: boolean }[];
  /** Part numbers this one answer would unblock. */
  blocks: string[];
}

export interface BulkPartResult {
  partNumber: string;
  file: string;
  status: BulkPartStatus;
  commodity?: string;
  /** How the commodity was settled — the list, or the geometry. */
  commoditySource?: 'list' | 'inferred';
  geometry?: { volumeCm3: number; bboxMm: [number, number, number] };
  breakdown?: Record<string, number>;
  total?: number;
  /** Values no CAD file carries, taken from SHOP_DEFAULTS or a picker. */
  assumed?: string[];
  /** field → { value, basis } — why each costed input is what it is. */
  provenance?: Record<string, { value: unknown; basis: string }>;
  questions?: BulkOpenQuestion[];
  answersUsed?: Record<string, unknown>;
  error?: string;
  code?: string;
}

export interface BulkRunRecord {
  runId: string;
  startedAt: string;
  finishedAt: string;
  /** Everything needed to explain or reproduce the numbers later. */
  engine: {
    ruleEngineVersion: number;
    rateLibraryVersion: string;
    rateLibraryLastModified: string;
    /** 'builtin' = the shipped UK book; 'supplied' = rates handed in by the caller. */
    rateLibrarySource: 'builtin' | 'supplied';
    /** Row counts, so a report can be checked against the sheet that produced it. */
    rateLibraryCounts: { materials: number; machines: number; labour: number };
    shopDefaults: typeof SHOP_DEFAULTS;
    aiUsed: false;
  };
  /** Stable over the inputs — two runs of the same basket share it. */
  inputHash: string;
  basketAnswers: Record<string, unknown>;
  parts: BulkPartResult[];
  openQuestions: BulkOpenQuestion[];
  summary: {
    parts: number;
    costed: number;
    needsAnswer: number;
    refused: number;
    errored: number;
    basketTotalGBP: number;
  };
}

export interface BulkRunOptions {
  /**
   * Cost on these rates instead of the built-in UK book.
   *
   * This is how an uploaded JLR rate sheet reaches the run. Pass the library
   * from `resolveActiveLibrary` (server) or `parseRateLibraryWorkbook` (CLI).
   * Omitted, the built-in book is used and the record says so — a run must
   * never leave it ambiguous which rates produced the numbers.
   */
  rateLibrary?: RateLibrary;
  /** Applied to every part; a part's own answer wins on a clash. */
  answers?: Record<string, unknown>;
  annualVolume?: number;
  /** Parts measured at once. The geometry pool bounds the Python side anyway. */
  concurrency?: number;
  timeoutMs?: number;
  /** Progress for a CLI; the record is unaffected. */
  onProgress?: (done: number, total: number, part: BulkPartResult) => void;
}

/**
 * UK only, and loudly.
 *
 * `executeCalculateCost` takes no region and always costs on
 * `DEFAULT_RATE_LIBRARY`, which is the UK book. A basket costed at UK rates when
 * the list said Poland is wrong in a way nobody would spot in a spreadsheet, so
 * the part is refused instead. Delete this once the executor takes a region.
 */
const UK = new Set(['', 'uk', 'gb', 'gbr', 'united kingdom', 'great britain']);
function regionGuard(region: string | undefined): string | null {
  const r = (region ?? '').trim().toLowerCase();
  if (UK.has(r)) return null;
  return `region '${region}' is not supported on the automated route yet — it always costs `
       + 'on the UK rate book. Cost this part in the screens, or leave the region blank for UK.';
}

/** Stable across key order so a re-run of the same basket hashes the same. */
function hashInputs(parts: BulkPartInput[], answers: Record<string, unknown>): string {
  const norm = parts
    .map(p => [p.partNumber, basename(p.file), p.commodity ?? '', p.material ?? '',
               String(p.annualVolume ?? ''), p.region ?? '',
               JSON.stringify(Object.entries(p.answers ?? {}).sort())].join('|'))
    .sort();
  const a = JSON.stringify(Object.entries(answers).sort());
  return createHash('sha256').update(norm.join('\n') + '\n' + a).digest('hex').slice(0, 16);
}

/** Cost one part through the deterministic chain. Never throws. */
async function costOnePart(
  part: BulkPartInput, opts: BulkRunOptions,
): Promise<BulkPartResult> {
  const name = basename(part.file);
  const base: BulkPartResult = { partNumber: part.partNumber, file: part.file, status: 'error' };

  const badRegion = regionGuard(part.region);
  if (badRegion) return { ...base, status: 'refused', code: 'region_unsupported', error: badRegion };

  const answers: Record<string, unknown> = { ...(opts.answers ?? {}), ...(part.answers ?? {}) };
  if (part.material) answers['material.family'] = part.material;

  let bytes: Buffer;
  try {
    bytes = part.bytes ?? readFileSync(part.file);
  } catch (e) {
    return { ...base, status: 'error', code: 'unreadable', error: (e as Error).message };
  }

  const geo = await analyzeGeometry(bytes, name, opts.timeoutMs ?? 300_000);
  if (geo.status !== 'success') {
    // A refusal is the geometry engine doing its job — a part it cannot honestly
    // measure must not reach a price. Keep its reason; it is the useful output.
    return { ...base, status: 'refused', code: geo.code ?? 'geometry_refused',
             error: geo.error ?? 'geometry could not be measured' };
  }

  const annualVolume = part.annualVolume ?? opts.annualVolume ?? SHOP_DEFAULTS.annualVolume;
  const ctxFor = (commodity: string): RuleContext => ({
    geo, geometryQuality: 'occt', commodity, commoditySource: 'engineer',
    annualVolume, filename: name, answers,
  } as RuleContext);

  const geometry = {
    volumeCm3: Number((geo.volume?.cm3 ?? 0).toFixed(3)),
    bboxMm: [geo.boundingBox?.xMm ?? 0, geo.boundingBox?.yMm ?? 0, geo.boundingBox?.zMm ?? 0],
  } as BulkPartResult['geometry'];

  let commodity = part.commodity;
  let commoditySource: 'list' | 'inferred' = 'list';
  if (!commodity) {
    const verdict = inferCommodity(ctxFor('machining'));
    if (!verdict.commodity) {
      const d = verdict.decision;
      return { ...base, status: 'needs_answer', geometry, answersUsed: answers,
               code: 'commodity_unknown',
               questions: d ? [{ id: d.id, question: d.question, why: d.why,
                                 options: d.options.map(o => ({ value: String(o.value), label: o.label,
                                                                ...(o.leaning ? { leaning: true } : {}) })),
                                 blocks: [part.partNumber] }] : [] };
    }
    commodity = verdict.commodity;
    commoditySource = 'inferred';
  }

  const spec = specForCommodity(commodity);
  if (!spec) {
    return { ...base, status: 'refused', commodity, commoditySource, geometry, code: 'no_rules',
             error: `no deterministic rules for '${commodity}' (have: ${COSTABLE_COMMODITIES.join(', ')})` };
  }

  const ctx = ctxFor(commodity);
  const { analysis, result } = buildDeterministicAnalysis(spec, ctx, geo.partName || name);

  const blocking = result.decisions.filter(d => d.severity === 'blocking');
  if (blocking.length) {
    return { ...base, status: 'needs_answer', commodity, commoditySource, geometry,
             answersUsed: answers,
             questions: blocking.map(d => ({
               id: d.id, question: d.question, why: d.why,
               options: d.options.map(o => ({ value: String(o.value), label: o.label,
                                              ...(o.leaning ? { leaning: true } : {}) })),
               blocks: [part.partNumber],
             })) };
  }

  const mapped = toCostParams(commodity, analysis.costInputSuggestions, annualVolume,
                              materialFacts(ctx).family, geo);
  if (!mapped) {
    return { ...base, status: 'refused', commodity, commoditySource, geometry, code: 'no_cost_mapping',
             error: `no cost mapping for '${commodity}' yet (have: ${COSTABLE_COMMODITIES.join(', ')})` };
  }

  const cost = executeCalculateCost({
    commodity, params: mapped.params, partName: geo.partName || name,
    ...(opts.rateLibrary ? { rateLibrary: opts.rateLibrary } : {}),
    overheadPct: SHOP_DEFAULTS.overheadPct, marginPct: SHOP_DEFAULTS.marginPct,
    packagingPerPart: mapped.packagingPerPart ?? SHOP_DEFAULTS.packagingPerPart,
    logisticsPerPart: mapped.logisticsPerPart ?? SHOP_DEFAULTS.logisticsPerPart,
  });
  if (!cost.success) {
    return { ...base, status: 'error', commodity, commoditySource, geometry, code: 'costing_failed',
             error: cost.error ?? 'costing failed' };
  }

  const provenance: Record<string, { value: unknown; basis: string }> = {};
  for (const [field, p] of Object.entries(result.provenance)) {
    provenance[field] = { value: p.value, basis: p.basis };
  }

  return {
    partNumber: part.partNumber, file: part.file, status: 'costed',
    commodity, commoditySource, geometry,
    breakdown: cost.breakdown as unknown as Record<string, number>,
    total: cost.total,
    assumed: mapped.assumed,
    provenance,
    answersUsed: answers,
  };
}

/** Collapse per-part questions into one entry per decision id. */
function aggregateQuestions(parts: BulkPartResult[]): BulkOpenQuestion[] {
  const byId = new Map<string, BulkOpenQuestion>();
  for (const p of parts) {
    for (const q of p.questions ?? []) {
      const seen = byId.get(q.id);
      if (seen) seen.blocks.push(p.partNumber);
      else byId.set(q.id, { ...q, blocks: [p.partNumber] });
    }
  }
  // Most-blocking first: that is the one answer worth giving.
  return [...byId.values()].sort((a, b) => b.blocks.length - a.blocks.length || a.id.localeCompare(b.id));
}

/**
 * Cost a basket.
 *
 * Parts are measured concurrently; the geometry pool bounds the Python side, so
 * `concurrency` here controls how many jobs are in flight, not how many CPUs are
 * burned. Order of results follows the input list regardless of finish order, so
 * the report is stable.
 */
export async function runBulkCosting(
  parts: BulkPartInput[], opts: BulkRunOptions = {},
): Promise<BulkRunRecord> {
  const startedAt = new Date().toISOString();
  const basketAnswers = opts.answers ?? {};
  const rates = opts.rateLibrary ?? DEFAULT_RATE_LIBRARY;
  const results: BulkPartResult[] = new Array(parts.length);
  const conc = Math.max(1, opts.concurrency ?? 4);

  let next = 0, done = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= parts.length) return;
      const r = await costOnePart(parts[i], opts);
      results[i] = r;
      opts.onProgress?.(++done, parts.length, r);
    }
  }
  await Promise.all(Array.from({ length: Math.min(conc, parts.length) }, () => worker()));

  const costed = results.filter(r => r.status === 'costed');
  return {
    runId: randomUUID(),
    startedAt,
    finishedAt: new Date().toISOString(),
    engine: {
      ruleEngineVersion: RULE_ENGINE_VERSION,
      rateLibraryVersion: rates.version,
      rateLibraryLastModified: rates.lastModified,
      rateLibrarySource: opts.rateLibrary ? 'supplied' : 'builtin',
      rateLibraryCounts: {
        materials: rates.materials.length,
        machines: rates.machines.length,
        labour: rates.labour.length,
      },
      shopDefaults: SHOP_DEFAULTS,
      aiUsed: false,
    },
    inputHash: hashInputs(parts, basketAnswers),
    basketAnswers,
    parts: results,
    openQuestions: aggregateQuestions(results),
    summary: {
      parts: results.length,
      costed: costed.length,
      needsAnswer: results.filter(r => r.status === 'needs_answer').length,
      refused: results.filter(r => r.status === 'refused').length,
      errored: results.filter(r => r.status === 'error').length,
      basketTotalGBP: Number(costed.reduce((s, r) => s + (r.total ?? 0), 0).toFixed(2)),
    },
  };
}
