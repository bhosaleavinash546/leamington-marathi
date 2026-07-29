/**
 * Rate freshness — makes the data-verification gap LOUD instead of silent.
 *
 * The problem this solves: an unverified duty rate currently produces a warning
 * that a user can scroll past. Warnings are advisory, and advisory controls fail
 * quietly — which is how a `corroborated` guess ends up in a supplier
 * negotiation. Tariff rates also decay: a measure amended next month leaves the
 * tool wrong with nothing in the system noticing.
 *
 * Two mechanisms:
 *
 *   1. A freshness VERDICT per rate, so the UI/report can show age, not just
 *      status.
 *   2. A GATE (`assertRatesFitForUse`) that THROWS. Wired into CI, an
 *      unverified or stale rate fails the build instead of shipping quietly.
 *
 * The thresholds are deliberately conservative — duty rates are cheap to
 * re-check and expensive to get wrong.
 */

import type { VerificationStatus } from './landed-cost-data.js';

/** Days after which a verified rate should be re-checked. */
export const STALE_WARN_DAYS = 30;
/** Days after which a rate must not be used at all. */
export const STALE_FAIL_DAYS = 90;

export type FreshnessVerdict = 'fresh' | 'ageing' | 'stale' | 'unverified';

export interface RateFreshness {
  hsCode: string;
  status: VerificationStatus;
  verdict: FreshnessVerdict;
  ageDays: number | null;
  fetchedAt?: string;
  message: string;
  /** True when this rate must not be used commercially. */
  blocking: boolean;
}

function daysSince(iso: string, now: Date): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 86400000);
}

/**
 * Assess one rate. `fetchedAt` absent means it came from a hardcoded default
 * and has never been verified against the official source.
 */
export function assessRateFreshness(
  hsCode: string,
  status: VerificationStatus,
  fetchedAt: string | undefined,
  now: Date = new Date(),
): RateFreshness {
  if (status !== 'verified' || !fetchedAt) {
    return {
      hsCode, status, verdict: 'unverified', ageDays: null, fetchedAt,
      message:
        `${hsCode}: rate is ${status.toUpperCase()} and has never been confirmed against the official tariff. ` +
        `Not fit for supplier negotiation, duty budgeting or customs declarations.`,
      blocking: true,
    };
  }

  const ageDays = daysSince(fetchedAt, now);
  if (ageDays === null) {
    return {
      hsCode, status, verdict: 'unverified', ageDays: null, fetchedAt,
      message: `${hsCode}: fetchedAt "${fetchedAt}" is not a valid date — provenance cannot be trusted.`,
      blocking: true,
    };
  }

  if (ageDays >= STALE_FAIL_DAYS) {
    return {
      hsCode, status, verdict: 'stale', ageDays, fetchedAt,
      message:
        `${hsCode}: verified ${ageDays} days ago, beyond the ${STALE_FAIL_DAYS}-day limit. ` +
        `Tariff measures change; re-run the ingestion before using this rate.`,
      blocking: true,
    };
  }
  if (ageDays >= STALE_WARN_DAYS) {
    return {
      hsCode, status, verdict: 'ageing', ageDays, fetchedAt,
      message: `${hsCode}: verified ${ageDays} days ago — due for refresh (limit ${STALE_FAIL_DAYS} days).`,
      blocking: false,
    };
  }
  return {
    hsCode, status, verdict: 'fresh', ageDays, fetchedAt,
    message: `${hsCode}: verified ${ageDays} day(s) ago.`,
    blocking: false,
  };
}

export interface FitnessReport {
  fitForCommercialUse: boolean;
  checked: number;
  blocking: RateFreshness[];
  ageing: RateFreshness[];
  fresh: RateFreshness[];
  summary: string;
}

/** Assess a set of rates and summarise whether the tool may be used commercially. */
export function assessRates(
  rates: Array<{ hsCode: string; status: VerificationStatus; fetchedAt?: string }>,
  now: Date = new Date(),
): FitnessReport {
  const all = rates.map(r => assessRateFreshness(r.hsCode, r.status, r.fetchedAt, now));
  const blocking = all.filter(r => r.blocking);
  const ageing = all.filter(r => r.verdict === 'ageing');
  const fresh = all.filter(r => r.verdict === 'fresh');
  return {
    fitForCommercialUse: blocking.length === 0,
    checked: all.length,
    blocking, ageing, fresh,
    summary: blocking.length === 0
      ? `All ${all.length} rate(s) verified and within ${STALE_FAIL_DAYS} days${ageing.length ? ` (${ageing.length} due for refresh)` : ''}.`
      : `${blocking.length} of ${all.length} rate(s) NOT fit for commercial use: ` +
        `${blocking.filter(b => b.verdict === 'unverified').length} unverified, ` +
        `${blocking.filter(b => b.verdict === 'stale').length} stale.`,
  };
}

/**
 * THE GATE. Throws when any rate is unfit.
 *
 * Wire this into CI (see tests/rate-freshness-gate.test.ts). It is deliberately
 * a throw and not a warning: the whole point is that an unverified rate should
 * be unable to reach production silently.
 */
export function assertRatesFitForUse(
  rates: Array<{ hsCode: string; status: VerificationStatus; fetchedAt?: string }>,
  now: Date = new Date(),
): void {
  const report = assessRates(rates, now);
  if (!report.fitForCommercialUse) {
    throw new Error(
      `Tariff rates are not fit for commercial use.\n${report.summary}\n\n` +
      report.blocking.map(b => `  - ${b.message}`).join('\n') +
      `\n\nFix: run the ingestion client against the official tariff service ` +
      `(scripts/ingest-tariff.ts) and commit the refreshed snapshot.`,
    );
  }
}
