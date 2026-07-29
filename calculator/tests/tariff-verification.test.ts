import { describe, it, expect, afterEach } from 'vitest';
import {
  loadTariffSnapshot, clearTariffSnapshot, resolveRate, activeSnapshot, snapshotCoverage,
} from '../src/engine/tariff-snapshot.js';
import {
  assessRateFreshness, assessRates, assertRatesFitForUse,
  STALE_WARN_DAYS, STALE_FAIL_DAYS,
} from '../src/engine/rate-freshness.js';
import { computeLandedCost } from '../src/engine/landed-cost.js';
import { HS_CANDIDATES } from '../src/engine/landed-cost-data.js';

afterEach(() => clearTariffSnapshot());

const snap = (over: Partial<any> = {}) => ({
  snapshotId: '2026-07-29T00:00:00Z',
  source: 'test',
  generatedAt: '2026-07-29T00:00:00Z',
  schemaVersion: 1,
  rates: [{
    hsCode: '8708999790', mfnDutyPct: 3.5,
    fetchedAt: '2026-07-29T00:00:00Z',
    sourceUrl: 'https://www.trade-tariff.service.gov.uk/commodities/8708999790',
    status: 'verified',
  }],
  ...over,
});

// ─── STEP 1: snapshot ────────────────────────────────────────────────────────

describe('tariff snapshot', () => {
  it('overrides the built-in default rate', () => {
    const before = computeLandedCost({
      exWorksCost: 100, commodity: 'cast_and_machine', originRegion: 'CN',
      partWeightKg: 2.8, annualVolume: 60000, asOfDate: '2026-07-29',
    });
    expect(before.dutyRatePctApplied).toBe(4.5);
    expect(before.rateProvenance.fromSnapshot).toBe(false);

    loadTariffSnapshot(snap());
    const after = computeLandedCost({
      exWorksCost: 100, commodity: 'cast_and_machine', originRegion: 'CN',
      partWeightKg: 2.8, annualVolume: 60000, asOfDate: '2026-07-29',
    });
    expect(after.dutyRatePctApplied).toBe(3.5);
    expect(after.rateProvenance.fromSnapshot).toBe(true);
    expect(after.rateProvenance.fetchedAt).toBe('2026-07-29T00:00:00Z');
  });

  it('falls back to the built-in default for codes not in the snapshot', () => {
    loadTariffSnapshot(snap());
    const r = resolveRate('9999999999', { mfnDutyPct: 7, status: 'estimate', verifyUrl: 'x' });
    expect(r.fromSnapshot).toBe(false);
    expect(r.mfnDutyPct).toBe(7);
  });

  it('REJECTS a malformed snapshot loudly rather than silently reverting', () => {
    expect(() => loadTariffSnapshot({ schemaVersion: 2, rates: [] })).toThrow(/schemaVersion/);
    expect(() => loadTariffSnapshot(snap({ rates: [{ hsCode: 'x', mfnDutyPct: 5 }] }))).toThrow(/provenance is mandatory/);
    expect(() => loadTariffSnapshot(snap({ rates: [{ hsCode: 'x', mfnDutyPct: 900, fetchedAt: 'a', sourceUrl: 'b' }] }))).toThrow(/implausible duty/);
    expect(() => loadTariffSnapshot(snap({ snapshotId: '' }))).toThrow(/snapshotId/);
    expect(activeSnapshot()).toBeNull();   // nothing installed after a failure
  });

  it('reports coverage against the codes the engine actually uses', () => {
    loadTariffSnapshot(snap());
    const all = [...new Set(Object.values(HS_CANDIDATES).flat().map(l => l.hsCode))];
    const cov = snapshotCoverage(all);
    expect(cov.covered).toContain('8708999790');
    expect(cov.missing.length).toBeGreaterThan(0);
    expect(cov.coveragePct).toBeGreaterThan(0);
    expect(cov.coveragePct).toBeLessThan(100);
  });
});

// ─── STEP 3: freshness ───────────────────────────────────────────────────────

describe('rate freshness', () => {
  const NOW = new Date('2026-07-29T00:00:00Z');
  const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString();

  it('a built-in default is UNVERIFIED and blocking', () => {
    const f = assessRateFreshness('8708999790', 'corroborated', undefined, NOW);
    expect(f.verdict).toBe('unverified');
    expect(f.blocking).toBe(true);
    expect(f.message).toMatch(/Not fit for supplier negotiation/);
  });

  it('a freshly verified rate is fresh and non-blocking', () => {
    const f = assessRateFreshness('x', 'verified', daysAgo(2), NOW);
    expect(f.verdict).toBe('fresh');
    expect(f.blocking).toBe(false);
  });

  it('ages through warn then fail thresholds', () => {
    expect(assessRateFreshness('x', 'verified', daysAgo(STALE_WARN_DAYS + 1), NOW).verdict).toBe('ageing');
    expect(assessRateFreshness('x', 'verified', daysAgo(STALE_WARN_DAYS + 1), NOW).blocking).toBe(false);
    expect(assessRateFreshness('x', 'verified', daysAgo(STALE_FAIL_DAYS + 1), NOW).verdict).toBe('stale');
    expect(assessRateFreshness('x', 'verified', daysAgo(STALE_FAIL_DAYS + 1), NOW).blocking).toBe(true);
  });

  it('an unparseable timestamp is treated as untrustworthy, not as fresh', () => {
    const f = assessRateFreshness('x', 'verified', 'not-a-date', NOW);
    expect(f.blocking).toBe(true);
    expect(f.message).toMatch(/not a valid date/);
  });

  it('summarises fitness across a set', () => {
    const rep = assessRates([
      { hsCode: 'a', status: 'verified', fetchedAt: daysAgo(1) },
      { hsCode: 'b', status: 'corroborated' },
      { hsCode: 'c', status: 'verified', fetchedAt: daysAgo(200) },
    ], NOW);
    expect(rep.fitForCommercialUse).toBe(false);
    expect(rep.blocking).toHaveLength(2);
    expect(rep.fresh).toHaveLength(1);
    expect(rep.summary).toMatch(/1 unverified/);
    expect(rep.summary).toMatch(/1 stale/);
  });

  it('THE GATE throws on unfit rates and passes on fit ones', () => {
    expect(() => assertRatesFitForUse([{ hsCode: 'a', status: 'corroborated' }], NOW))
      .toThrow(/not fit for commercial use/);
    expect(() => assertRatesFitForUse([{ hsCode: 'a', status: 'verified', fetchedAt: daysAgo(1) }], NOW))
      .not.toThrow();
  });

  it('the gate error tells you how to fix it', () => {
    try {
      assertRatesFitForUse([{ hsCode: 'a', status: 'estimate' }], NOW);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as Error).message).toMatch(/scripts\/ingest-tariff\.ts/);
    }
  });
});

// ─── Engine surfaces the verification state ──────────────────────────────────

describe('engine reports rate provenance', () => {
  it('warns that an unsnapshotted rate has never been verified', () => {
    const r = computeLandedCost({
      exWorksCost: 100, commodity: 'cast_and_machine', originRegion: 'CN',
      partWeightKg: 2.8, annualVolume: 60000, asOfDate: '2026-07-29',
    });
    expect(r.rateProvenance.freshness!.blocking).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/never been confirmed against the official tariff/);
    expect(r.provenance.join(' ')).toMatch(/BUILT-IN DEFAULT/);
  });

  it('stops warning once a fresh snapshot rate is in use', () => {
    loadTariffSnapshot(snap({
      rates: [{
        hsCode: '8708999790', mfnDutyPct: 3.5,
        fetchedAt: '2026-07-28T00:00:00Z',
        sourceUrl: 'https://www.trade-tariff.service.gov.uk/commodities/8708999790',
        status: 'verified',
      }],
    }));
    const r = computeLandedCost({
      exWorksCost: 100, commodity: 'cast_and_machine', originRegion: 'CN',
      partWeightKg: 2.8, annualVolume: 60000, asOfDate: '2026-07-29',
    });
    expect(r.rateProvenance.freshness!.verdict).toBe('fresh');
    expect(r.warnings.join(' ')).not.toMatch(/never been confirmed/);
  });

  it('a stale snapshot rate blocks again', () => {
    loadTariffSnapshot(snap({
      rates: [{
        hsCode: '8708999790', mfnDutyPct: 3.5,
        fetchedAt: '2026-01-01T00:00:00Z',
        sourceUrl: 'https://www.trade-tariff.service.gov.uk/commodities/8708999790',
        status: 'verified',
      }],
    }));
    const r = computeLandedCost({
      exWorksCost: 100, commodity: 'cast_and_machine', originRegion: 'CN',
      partWeightKg: 2.8, annualVolume: 60000, asOfDate: '2026-07-29',
    });
    expect(r.rateProvenance.freshness!.verdict).toBe('stale');
    expect(r.warnings.join(' ')).toMatch(/beyond the 90-day limit/);
  });
});
