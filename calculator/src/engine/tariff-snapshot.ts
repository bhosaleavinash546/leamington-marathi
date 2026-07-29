/**
 * Tariff snapshot — dated, sourced, replaceable duty data.
 *
 * WHY THIS EXISTS
 *
 * Duty rates were hardcoded in landed-cost-data.ts as `corroborated` values I
 * could not verify, because the official tariff service is unreachable from the
 * build sandbox. Hardcoding has two failure modes beyond that:
 *
 *   1. Verification is a code edit, so it needs a developer and a release.
 *   2. Rates DECAY. A measure amended next month leaves the tool silently
 *      wrong, and nothing in the system notices.
 *
 * A snapshot fixes both. Rates live in a versioned JSON file carrying the value,
 * the source URL, and the timestamp it was fetched. Verifying the tool becomes
 * "replace a file"; the diff is reviewable; and because every rate has an age,
 * staleness becomes measurable and therefore ENFORCEABLE (see rate-freshness.ts).
 *
 * The snapshot OVERRIDES the built-in defaults. With no snapshot present the
 * engine still runs on its `estimate`/`corroborated` defaults — it just says so
 * loudly. That keeps the tool usable while making the unverified state visible.
 */

import type { VerificationStatus } from './landed-cost-data.js';

/** One verified rate, with everything needed to audit where it came from. */
export interface SnapshotRate {
  hsCode: string;
  /** Third-country / MFN duty, percent of customs value. */
  mfnDutyPct: number;
  description?: string;
  /** ISO timestamp the value was read from the source. */
  fetchedAt: string;
  /** The exact page/endpoint it came from. */
  sourceUrl: string;
  /** 'verified' once it comes from the official service. */
  status: VerificationStatus;
  /** Measures found on this code (ADD/CVD/quota), for cross-checking. */
  measures?: Array<{
    type: string;
    dutyPct?: number;
    originRegions?: string[];
    expires?: string;
  }>;
}

export interface TariffSnapshot {
  /** Monotonic identifier, e.g. '2026-07-29T13:40:00Z'. */
  snapshotId: string;
  /** Where the data came from as a whole. */
  source: string;
  /** ISO date the snapshot was generated. */
  generatedAt: string;
  /** Schema version, so a future format change is detectable. */
  schemaVersion: 1;
  rates: SnapshotRate[];
  /** Codes that were requested but could not be resolved. */
  failures?: Array<{ hsCode: string; reason: string }>;
}

/** Result of applying a snapshot to a lookup. */
export interface ResolvedRate {
  mfnDutyPct: number;
  status: VerificationStatus;
  sourceUrl: string;
  /** ISO timestamp, or undefined when it came from a built-in default. */
  fetchedAt?: string;
  /** True when the value came from a snapshot rather than a hardcoded default. */
  fromSnapshot: boolean;
}

let ACTIVE: TariffSnapshot | null = null;

/**
 * Install a snapshot. Validated defensively: a malformed snapshot must FAIL
 * LOUDLY rather than silently reverting to unverified defaults, because a
 * silent revert is exactly the failure this module exists to prevent.
 */
export function loadTariffSnapshot(snap: unknown): TariffSnapshot {
  const s = snap as TariffSnapshot;
  if (!s || typeof s !== 'object') throw new Error('Tariff snapshot: not an object');
  if (s.schemaVersion !== 1) {
    throw new Error(`Tariff snapshot: unsupported schemaVersion ${(s as { schemaVersion?: unknown }).schemaVersion} (expected 1)`);
  }
  if (!Array.isArray(s.rates)) throw new Error('Tariff snapshot: rates[] missing');
  if (!s.snapshotId || !s.generatedAt) throw new Error('Tariff snapshot: snapshotId and generatedAt are required');

  for (const r of s.rates) {
    if (!r.hsCode || typeof r.hsCode !== 'string') throw new Error('Tariff snapshot: rate without hsCode');
    if (typeof r.mfnDutyPct !== 'number' || !Number.isFinite(r.mfnDutyPct) || r.mfnDutyPct < 0 || r.mfnDutyPct > 100) {
      throw new Error(`Tariff snapshot: implausible duty ${r.mfnDutyPct}% for ${r.hsCode}`);
    }
    if (!r.fetchedAt || !r.sourceUrl) {
      throw new Error(`Tariff snapshot: ${r.hsCode} missing fetchedAt/sourceUrl — provenance is mandatory`);
    }
  }
  ACTIVE = s;
  return s;
}

export function activeSnapshot(): TariffSnapshot | null {
  return ACTIVE;
}

export function clearTariffSnapshot(): void {
  ACTIVE = null;
}

/**
 * Resolve a code against the active snapshot, falling back to the built-in
 * default. The caller always learns which it got via `fromSnapshot`.
 */
export function resolveRate(
  hsCode: string,
  fallback: { mfnDutyPct: number; status: VerificationStatus; verifyUrl: string },
): ResolvedRate {
  const hit = ACTIVE?.rates.find(r => r.hsCode === hsCode);
  if (hit) {
    return {
      mfnDutyPct: hit.mfnDutyPct,
      status: hit.status,
      sourceUrl: hit.sourceUrl,
      fetchedAt: hit.fetchedAt,
      fromSnapshot: true,
    };
  }
  return {
    mfnDutyPct: fallback.mfnDutyPct,
    status: fallback.status,
    sourceUrl: fallback.verifyUrl,
    fromSnapshot: false,
  };
}

/** Codes present in the snapshot — used by coverage reporting. */
export function snapshotCoverage(requiredCodes: string[]): {
  covered: string[];
  missing: string[];
  coveragePct: number;
} {
  const have = new Set(ACTIVE?.rates.map(r => r.hsCode) ?? []);
  const covered = requiredCodes.filter(c => have.has(c));
  const missing = requiredCodes.filter(c => !have.has(c));
  return {
    covered, missing,
    coveragePct: requiredCodes.length > 0
      ? Math.round((covered.length / requiredCodes.length) * 1000) / 10
      : 0,
  };
}
