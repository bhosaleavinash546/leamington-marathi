import { describe, it, expect } from 'vitest';
import {
  assessOrigin, findOriginRule, findNextOriginRule, originSummary, ORIGIN_RULES,
} from '../src/engine/rules-of-origin.js';
import { computeLandedCost } from '../src/engine/landed-cost.js';
import { ORIGIN_PREFERENCES } from '../src/engine/landed-cost-data.js';

// ─── The MaxNOM calculation ──────────────────────────────────────────────────

describe('rules of origin — MaxNOM test', () => {
  it('qualifies when non-originating material is under the limit', () => {
    // £12.68 non-originating metal in a £40.99 part = 30.9% vs 50% limit
    const a = assessOrigin({
      agreement: 'UK-EU TCA', exWorksPrice: 40.99, nonOriginatingMaterialCost: 12.68,
      mfnDutyPct: 4.5, asOfDate: '2026-07-29',
    });
    expect(a.nonOriginatingPct).toBeCloseTo(30.93, 1);
    expect(a.thresholdPct).toBe(50);
    expect(a.qualifies).toBe(true);
    expect(a.headroomPct).toBeGreaterThan(0);
  });

  it('FAILS when non-originating material exceeds the limit — and prices the failure', () => {
    // A part machined in Germany from a £30 Chinese casting, sold at £41
    const a = assessOrigin({
      agreement: 'UK-EU TCA', exWorksPrice: 41, nonOriginatingMaterialCost: 30,
      mfnDutyPct: 4.5, customsValueCif: 42, asOfDate: '2026-07-29',
    });
    expect(a.nonOriginatingPct).toBeCloseTo(73.17, 1);
    expect(a.qualifies).toBe(false);
    expect(a.headroomPct).toBeLessThan(0);
    expect(a.costOfFailureGbp).toBeCloseTo(1.89, 2);
    expect(a.warnings.join(' ')).toMatch(/ORIGIN FAILS/);
  });

  it('warns when qualifying with thin headroom', () => {
    const a = assessOrigin({
      agreement: 'UK-EU TCA', exWorksPrice: 100, nonOriginatingMaterialCost: 45,
      mfnDutyPct: 4.5, asOfDate: '2026-07-29',
    });
    expect(a.qualifies).toBe(true);
    expect(a.headroomPct).toBe(5);
    expect(a.warnings.join(' ')).toMatch(/only 5.0 percentage points of headroom/);
  });

  it('returns unknown (not a silent pass) when no rule is recorded', () => {
    const a = assessOrigin({
      agreement: 'UK-Atlantis FTA', exWorksPrice: 100, nonOriginatingMaterialCost: 10,
      mfnDutyPct: 4.5, asOfDate: '2026-07-29',
    });
    expect(a.qualifies).toBe('unknown');
    expect(a.warnings.join(' ')).toMatch(/CANNOT be assumed/);
  });
});

// ─── The 1 January 2027 EV cliff edge ────────────────────────────────────────

describe('UK-EU EV/battery rules of origin — 2027 tightening', () => {
  it('EV rule is 40% local content until end-2026, 55% from 2027', () => {
    const now = findOriginRule('UK-EU TCA', 'vehicle', '2026-07-29')!;
    const then = findOriginRule('UK-EU TCA', 'vehicle', '2027-01-01')!;
    expect(now.minLocalContentPct).toBe(40);
    expect(then.minLocalContentPct).toBe(55);
    expect(now.maxNonOriginatingPct).toBe(60);
    expect(then.maxNonOriginatingPct).toBe(45);
  });

  it('battery packs tighten from 30% to 70% local content', () => {
    expect(findOriginRule('UK-EU TCA', 'battery_pack', '2026-07-29')!.minLocalContentPct).toBe(30);
    expect(findOriginRule('UK-EU TCA', 'battery_pack', '2027-01-01')!.minLocalContentPct).toBe(70);
  });

  it('battery cells tighten to 65% local content', () => {
    expect(findOriginRule('UK-EU TCA', 'battery_cell', '2027-01-01')!.minLocalContentPct).toBe(65);
  });

  it('flags a CLIFF EDGE: a battery pack that passes today fails in 2027', () => {
    // 55% non-originating: fine under the 70% limit, fails the 30% limit
    const a = assessOrigin({
      agreement: 'UK-EU TCA', productType: 'battery_pack',
      exWorksPrice: 4000, nonOriginatingMaterialCost: 2200,
      mfnDutyPct: 4.5, customsValueCif: 4100, asOfDate: '2026-07-29',
    });
    expect(a.qualifies).toBe(true);
    expect(a.future).toBeDefined();
    expect(a.future!.qualifies).toBe(false);
    expect(a.future!.rule.from).toBe('2027-01-01');
    expect(a.warnings.join(' ')).toMatch(/CLIFF EDGE/);
    expect(a.warnings.join(' ')).toMatch(/FAILS from 2027-01-01/);
    expect(originSummary(a)).toMatch(/FAILS from 2027-01-01/);
  });

  it('counts the days to the cliff so it can be scheduled', () => {
    const a = assessOrigin({
      agreement: 'UK-EU TCA', productType: 'vehicle',
      exWorksPrice: 30000, nonOriginatingMaterialCost: 15000,
      mfnDutyPct: 10, asOfDate: '2026-07-29',
    });
    expect(a.future!.daysUntil).toBe(156);
  });

  it('finds no successor rule once the 2027 regime is in force (locked to 2032)', () => {
    expect(findNextOriginRule('UK-EU TCA', 'vehicle', '2027-06-01')).toBeNull();
  });
});

// ─── UK-India CETA in force ──────────────────────────────────────────────────

describe('UK-India CETA', () => {
  it('is recorded as in force from 15 July 2026', () => {
    const before = findOriginRule('UK-India CETA', 'part', '2026-07-01');
    const after = findOriginRule('UK-India CETA', 'part', '2026-07-29');
    expect(before).toBeNull();
    expect(after).not.toBeNull();
    expect(after!.from).toBe('2026-07-15');
  });

  it('India now carries a preference in the origin table (was MFN-only)', () => {
    const india = ORIGIN_PREFERENCES.find(p => p.region === 'IN')!;
    expect(india.preferentialDutyPct).toBe(0);
    expect(india.note).toMatch(/ENTERED INTO FORCE 15 July 2026/);
  });
});

// ─── Integration with landed cost ────────────────────────────────────────────

describe('landed cost × rules of origin', () => {
  it('TESTS origin when non-originating cost is supplied, and applies MFN on failure', () => {
    const failing = computeLandedCost({
      exWorksCost: 41, commodity: 'cast_and_machine', originRegion: 'DE',
      partWeightKg: 2.8, annualVolume: 60000,
      nonOriginatingMaterialCost: 30,   // 73% non-originating → fails
    });
    expect(failing.origin).toBeDefined();
    expect(failing.origin!.qualifies).toBe(false);
    expect(failing.dutyRatePctApplied).toBe(4.5);        // MFN, not 0
    expect(failing.preferenceApplied).toBeUndefined();
  });

  it('grants preference when the origin test passes', () => {
    const passing = computeLandedCost({
      exWorksCost: 41, commodity: 'cast_and_machine', originRegion: 'DE',
      partWeightKg: 2.8, annualVolume: 60000,
      nonOriginatingMaterialCost: 8,    // 19.5% → qualifies
    });
    expect(passing.origin!.qualifies).toBe(true);
    expect(passing.dutyRatePctApplied).toBe(0);
    expect(passing.preferenceApplied).toMatch(/TCA/);
  });

  it('states plainly when preference was ASSUMED rather than tested', () => {
    const assumed = computeLandedCost({
      exWorksCost: 41, commodity: 'cast_and_machine', originRegion: 'DE',
      partWeightKg: 2.8, annualVolume: 60000,
    });
    expect(assumed.origin).toBeUndefined();
    expect(assumed.warnings.join(' ')).toMatch(/origin was ASSUMED, not tested/);
    expect(assumed.warnings.join(' ')).toMatch(/swing of £/);
  });

  it('failing origin materially raises landed cost vs the assumed case', () => {
    const assumed = computeLandedCost({
      exWorksCost: 41, commodity: 'cast_and_machine', originRegion: 'DE',
      partWeightKg: 2.8, annualVolume: 60000,
    });
    const tested = computeLandedCost({
      exWorksCost: 41, commodity: 'cast_and_machine', originRegion: 'DE',
      partWeightKg: 2.8, annualVolume: 60000, nonOriginatingMaterialCost: 30,
    });
    expect(tested.totalLandedCost).toBeGreaterThan(assumed.totalLandedCost);
  });

  it('India origin now runs the CETA test rather than defaulting to MFN', () => {
    const r = computeLandedCost({
      exWorksCost: 41, commodity: 'cast_and_machine', originRegion: 'IN',
      partWeightKg: 2.8, annualVolume: 60000,
      nonOriginatingMaterialCost: 10, asOfDate: '2026-07-29',
    });
    expect(r.origin?.agreement).toBe('UK-India CETA');
    expect(r.origin?.qualifies).toBe(true);
    expect(r.dutyRatePctApplied).toBe(0);
  });
});

// ─── Data hygiene ────────────────────────────────────────────────────────────

describe('origin rule data', () => {
  it('every rule has a date, thresholds that agree, and a source', () => {
    for (const r of ORIGIN_RULES) {
      expect(r.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (r.until) expect(r.until > r.from).toBe(true);
      expect(r.maxNonOriginatingPct + r.minLocalContentPct).toBe(100);
      expect(r.source.length).toBeGreaterThan(10);
    }
  });

  it('no overlapping rules for the same agreement + product type', () => {
    const seen = new Map<string, { from: string; until?: string }[]>();
    for (const r of ORIGIN_RULES) {
      const k = `${r.agreement}|${r.productType}`;
      const list = seen.get(k) ?? [];
      for (const prev of list) {
        const overlap = (prev.until ?? '9999') >= r.from && (r.until ?? '9999') >= prev.from;
        expect(overlap, `${k} rules overlap`).toBe(false);
      }
      list.push({ from: r.from, until: r.until });
      seen.set(k, list);
    }
  });
});
