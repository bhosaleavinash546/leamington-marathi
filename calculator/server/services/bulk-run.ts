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
 *    `needs_answer` with the question — not costed on a guess. A region the
 *    rate model does not know is refused rather than quietly costed in the UK
 *    and reported as that region; a region it does know has the whole rate book
 *    rebuilt for it, the way the screens do it.
 *
 * 3. **The same geometry guards as the CAD route.** `runAllGuards` — the
 *    near-net machining cap and the cad-sanity cross-checks — runs here on the
 *    same analysis, in the same order cad.ts uses. It has to run *before*
 *    `toCostParams`, because the machining cap mutates the analysis; after it,
 *    the cap would be reported and the uncapped time still costed. A blocking
 *    code refuses the part rather than being waved through, since nobody is at
 *    a screen to acknowledge it mid-run; `acknowledge` accepts one deliberately.
 *
 * 4. **One answer, every part it affects.** Open questions are aggregated by
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
import { runAllGuards, statedFromAnswers, isCostable } from '../routes/cad.js';
import type { CADSanityWarning } from '../utils/cad-sanity.js';
import { buildDeterministicAnalysis } from '../../src/engine/cost-input-rules/deterministic.js';
import { specForCommodity } from '../../src/engine/cost-input-rules/index.js';
import { inferCommodity } from '../../src/engine/cost-input-rules/derive/commodity.js';
import { materialFacts } from '../../src/engine/cost-input-rules/derive/material.js';
import {
  toCostParams, SHOP_DEFAULTS, COSTABLE_COMMODITIES,
} from '../../src/engine/cost-input-rules/to-cost-params.js';
import { RULE_ENGINE_VERSION } from '../../src/engine/cost-input-rules/types.js';
import { DEFAULT_RATE_LIBRARY } from '../../src/engine/rate-library.js';
import { fingerprintRateLibrary } from '../../src/engine/rate-library-merge.js';
import {
  buildRegionalLibrary, resolveManufacturingRegion, supportedRegions,
} from '../../src/engine/regional-rates.js';
import { recomputeMachineRates } from '../../src/engine/rate-library.js';
import type { RateLibrary } from '../../src/engine/types.js';
import type { ManufacturingRegion } from '../../src/engine/regional-rates.js';
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
  /** The region this part was costed in — the rate book was rebuilt for it. */
  region?: ManufacturingRegion;
  breakdown?: Record<string, number>;
  total?: number;
  /** Values no CAD file carries, taken from SHOP_DEFAULTS or a picker. */
  assumed?: string[];
  /** field → { value, basis } — why each costed input is what it is. */
  provenance?: Record<string, { value: unknown; basis: string }>;
  questions?: BulkOpenQuestion[];
  /** Geometry-vs-claim checks. Blocking ones stop the costing until acknowledged. */
  warnings?: CADSanityWarning[];
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
    /**
     * Content fingerprint of the book these numbers were costed on.
     *
     * The library's own `version` is author-supplied and not unique — every
     * uploaded sheet is stamped `company-upload` — so it cannot say WHICH book
     * produced a report. This can, and `getRateLibraryVersion` takes it back to
     * the stored book, which is what makes a run reproducible.
     */
    rateLibraryFingerprint: string;
    /** Row counts, so a report can be checked against the sheet that produced it. */
    rateLibraryCounts: { materials: number; machines: number; labour: number };
    shopDefaults: typeof SHOP_DEFAULTS;
    aiUsed: false;
  };
  /** Stable over the inputs — two runs of the same basket share it. */
  inputHash: string;
  basketAnswers: Record<string, unknown>;
  /** Blocking sanity codes accepted for this run. Empty means nothing was overridden. */
  acknowledged: string[];
  parts: BulkPartResult[];
  openQuestions: BulkOpenQuestion[];
  summary: {
    parts: number;
    costed: number;
    needsAnswer: number;
    refused: number;
    errored: number;
    /** Costed parts that carried at least one advisory (non-blocking) warning. */
    withWarnings: number;
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
  /**
   * Sanity codes accepted for this run, mirroring the per-code acknowledgement
   * the browser requires before Calculate. Nobody is at the screen during a
   * bulk run, so a blocking code refuses the part rather than being waved
   * through — listing it here is the deliberate, recorded decision to accept it.
   */
  acknowledge?: string[];
  annualVolume?: number;
  /** Parts measured at once. The geometry pool bounds the Python side anyway. */
  concurrency?: number;
  timeoutMs?: number;
  /** Progress for a CLI; the record is unaffected. */
  onProgress?: (done: number, total: number, part: BulkPartResult) => void;
}

/**
 * The rate book for a region, built the way the screens build it.
 *
 * `buildRegionalLibrary` rescales the whole book — labour by category, machines
 * by the regional capital and energy picture, materials by family — rather than
 * scaling a finished UK total, which is the difference between costing a part in
 * Poland and estimating it. `recomputeMachineRates` first, matching
 * `src/ui/main.ts`, so a machine rate is always re-derived from its buildup
 * instead of trusting a stale `computedRatePerHr` carried in from storage.
 *
 * Memoised per run: a 500-part basket in three regions rebuilds three books,
 * not five hundred.
 */
function regionalBook(
  base: RateLibrary, region: ManufacturingRegion, cache: Map<string, RateLibrary>,
): RateLibrary {
  // Keyed on the region alone: the cache is created per run and the base book is
  // fixed for that run, so hashing the whole 328-material library into the key
  // on every part was pure waste — it turned a 1-second basket into 11.
  const key = region;
  const hit = cache.get(key);
  if (hit) return hit;
  // UK is the basis the book is already expressed in — rescaling it by 1.0
  // everywhere would be a no-op that still costs a full rebuild.
  const built = region === 'UK'
    ? recomputeMachineRates(base)
    : buildRegionalLibrary(recomputeMachineRates(base), region);
  cache.set(key, built);
  return built;
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
  part: BulkPartInput, opts: BulkRunOptions & { _regionCache?: Map<string, RateLibrary> },
  baseBook: RateLibrary,
): Promise<BulkPartResult> {
  const name = basename(part.file);
  const base: BulkPartResult = { partNumber: part.partNumber, file: part.file, status: 'error' };

  // Blank means the book as supplied — for the built-in library that is the UK.
  const region = part.region?.trim()
    ? resolveManufacturingRegion(part.region)
    : 'UK' as ManufacturingRegion;
  if (!region) {
    // Refuse rather than default: a part list saying "Polandd" costed in the UK
    // and reported as Poland is the silent kind of wrong this tool exists to avoid.
    return { ...base, status: 'refused', code: 'region_unknown',
             error: `region '${part.region}' is not one this rate model knows. `
                  + `Use a code or name from: ${supportedRegions().join(', ')}` };
  }

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

  // Before toCostParams, not after: applyNearNetMachiningCap MUTATES the
  // analysis, so running the guards afterwards would report the cap and still
  // cost the uncapped time. This is the order cad.ts uses on its own
  // deterministic branch.
  const warnings = runAllGuards(analysis, geo, geo.volume?.cm3 ?? null, statedFromAnswers(answers));
  if (!isCostable([], warnings, opts.acknowledge ?? [])) {
    const blocking = warnings.filter(w => w.blocking && !(opts.acknowledge ?? []).includes(w.code));
    return { ...base, status: 'refused', commodity, commoditySource, geometry, warnings,
             answersUsed: answers, code: 'sanity_blocked',
             error: `blocked by ${blocking.map(w => w.code).join(', ')} — `
                  + blocking.map(w => w.message).join(' | ') };
  }

  const mapped = toCostParams(commodity, analysis.costInputSuggestions, annualVolume,
                              materialFacts(ctx).family, geo);
  if (!mapped) {
    // Warnings ride along even here: a part that was acknowledged past a
    // blocking check and then failed for another reason must still show that
    // the check fired, or the record understates what was overridden.
    return { ...base, status: 'refused', commodity, commoditySource, geometry, code: 'no_cost_mapping',
             ...(warnings.length ? { warnings } : {}), answersUsed: answers,
             error: `no cost mapping for '${commodity}' yet (have: ${COSTABLE_COMMODITIES.join(', ')})` };
  }

  const cost = executeCalculateCost({
    commodity, params: mapped.params, partName: geo.partName || name,
    rateLibrary: regionalBook(baseBook, region, opts._regionCache ?? new Map()),
    overheadPct: SHOP_DEFAULTS.overheadPct, marginPct: SHOP_DEFAULTS.marginPct,
    packagingPerPart: mapped.packagingPerPart ?? SHOP_DEFAULTS.packagingPerPart,
    logisticsPerPart: mapped.logisticsPerPart ?? SHOP_DEFAULTS.logisticsPerPart,
  });
  if (!cost.success) {
    return { ...base, status: 'error', commodity, commoditySource, geometry, code: 'costing_failed',
             ...(warnings.length ? { warnings } : {}), answersUsed: answers,
             error: cost.error ?? 'costing failed' };
  }

  const provenance: Record<string, { value: unknown; basis: string }> = {};
  for (const [field, p] of Object.entries(result.provenance)) {
    provenance[field] = { value: p.value, basis: p.basis };
  }

  return {
    partNumber: part.partNumber, file: part.file, status: 'costed',
    commodity, commoditySource, geometry, region,
    breakdown: cost.breakdown as unknown as Record<string, number>,
    total: cost.total,
    assumed: mapped.assumed,
    provenance,
    ...(warnings.length ? { warnings } : {}),
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
  const regionCache = new Map<string, RateLibrary>();
  const results: BulkPartResult[] = new Array(parts.length);
  const conc = Math.max(1, opts.concurrency ?? 4);

  let next = 0, done = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= parts.length) return;
      const r = await costOnePart(parts[i], { ...opts, _regionCache: regionCache }, rates);
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
      rateLibraryFingerprint: fingerprintRateLibrary(rates),
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
    acknowledged: opts.acknowledge ?? [],
    parts: results,
    openQuestions: aggregateQuestions(results),
    summary: {
      parts: results.length,
      costed: costed.length,
      needsAnswer: results.filter(r => r.status === 'needs_answer').length,
      refused: results.filter(r => r.status === 'refused').length,
      errored: results.filter(r => r.status === 'error').length,
      withWarnings: costed.filter(r => (r.warnings ?? []).length > 0).length,
      basketTotalGBP: Number(costed.reduce((s, r) => s + (r.total ?? 0), 0).toFixed(2)),
    },
  };
}
