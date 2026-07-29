import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { assessRates, assertRatesFitForUse } from '../src/engine/rate-freshness.js';
import { loadTariffSnapshot, clearTariffSnapshot, snapshotCoverage } from '../src/engine/tariff-snapshot.js';
import { HS_CANDIDATES } from '../src/engine/landed-cost-data.js';

/**
 * THE VERIFICATION GATE.
 *
 * Every commodity code the engine can use is checked for a verified, in-date
 * duty rate.
 *
 *   - Always: prints the current verification state, so a CI run shows it.
 *   - With REQUIRE_VERIFIED_TARIFFS=1: FAILS the build if any rate is
 *     unverified or stale.
 *
 * Set the flag in the release pipeline. It is off by default so day-to-day
 * development is not blocked by a gap that is external to the code — but the
 * moment a snapshot lands, turning it on makes shipping an unverified rate
 * impossible rather than merely inadvisable.
 */
const SNAPSHOT_PATH = 'data/tariff-snapshot.json';

function engineCodes(): string[] {
  return [...new Set(Object.values(HS_CANDIDATES).flat().map(l => l.hsCode))].sort();
}

describe('tariff verification gate', () => {
  it('reports the current verification state of every engine rate', () => {
    clearTariffSnapshot();
    let loaded = false;
    if (existsSync(SNAPSHOT_PATH)) {
      loadTariffSnapshot(JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')));
      loaded = true;
    }

    const codes = engineCodes();
    const cov = snapshotCoverage(codes);
    const lines = Object.values(HS_CANDIDATES).flat();
    const rates = codes.map(c => {
      const l = lines.find(x => x.hsCode === c)!;
      return { hsCode: c, status: l.status, fetchedAt: undefined as string | undefined };
    });
    const report = assessRates(rates);

    // eslint-disable-next-line no-console
    console.log(
      `\n  TARIFF VERIFICATION STATE\n` +
      `  snapshot present : ${loaded ? 'yes' : 'NO — all rates are built-in defaults'}\n` +
      `  codes in engine  : ${codes.length}\n` +
      `  snapshot coverage: ${cov.coveragePct}%\n` +
      `  fit for use      : ${report.fitForCommercialUse ? 'YES' : 'NO'}\n` +
      `  ${report.summary}\n` +
      `  To fix: npx tsx scripts/ingest-tariff.ts --out ${SNAPSHOT_PATH}\n`,
    );

    expect(codes.length).toBeGreaterThan(0);
    expect(report.checked).toBe(codes.length);
  });

  it('FAILS the build when REQUIRE_VERIFIED_TARIFFS=1 and rates are unfit', () => {
    const enforcing = process.env.REQUIRE_VERIFIED_TARIFFS === '1';
    const lines = Object.values(HS_CANDIDATES).flat();
    const rates = engineCodes().map(c => {
      const l = lines.find(x => x.hsCode === c)!;
      return { hsCode: c, status: l.status, fetchedAt: undefined as string | undefined };
    });

    if (enforcing) {
      // In the release pipeline this MUST pass, i.e. rates must be verified.
      expect(() => assertRatesFitForUse(rates)).not.toThrow();
    } else {
      // Off by default — but prove the gate would bite if switched on.
      expect(() => assertRatesFitForUse(rates)).toThrow(/not fit for commercial use/);
    }
  });
});
