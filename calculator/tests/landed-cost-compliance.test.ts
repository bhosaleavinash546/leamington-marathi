import { describe, it, expect } from 'vitest';
import { computeLandedCost, selectTariffLine } from '../src/engine/landed-cost.js';
import {
  TRADE_REMEDIES, HIGH_REMEDY_ORIGINS, findTradeRemedies, freeAllocationFactor,
  ORIGIN_CARBON_PRICE_GBP_PER_TONNE,
} from '../src/engine/landed-cost-data.js';
import {
  assessOrigin, countsAsOriginating, isInsufficientProcessing,
  INSUFFICIENT_OPERATIONS, CUMULATION_PARTNERS,
} from '../src/engine/rules-of-origin.js';
import type { CarbonEstimate } from '../src/engine/carbon.js';

const carbon = (kg: number, cls: string): CarbonEstimate => ({
  materialKgCO2e: kg, processKgCO2e: 0, logisticsKgCO2e: 0, totalKgCO2e: kg,
  perNetKgCO2e: 0, gridKgPerKwh: 0.2, processKwh: 0, materialFactorKgPerKg: 0,
  materialClass: cls, notes: [],
});

// ─── FIX 1: trade remedies ───────────────────────────────────────────────────

describe('anti-dumping / countervailing duties', () => {
  it('END TO END: a Chinese aluminium road wheel gets the 22.3% ADD in its landed cost', () => {
    const wheel = computeLandedCost({
      exWorksCost: 100, commodity: 'road_wheel', originRegion: 'CN',
      partWeightKg: 9, annualVolume: 50000, asOfDate: '2026-07-29',
    });
    const remedy = wheel.adders.find(a => a.key.startsWith('remedy'));
    expect(remedy, 'ADD must appear as an adder').toBeDefined();
    expect(remedy!.amountGbp).toBeCloseTo(wheel.customsValueCif * 0.223, 2);
    // and it must be INSIDE the total, not merely reported
    expect(wheel.addersTotal).toBeGreaterThan(remedy!.amountGbp);
    expect(wheel.totalLandedCost).toBeCloseTo(wheel.exWorksCost + wheel.addersTotal, 2);
  });

  it('the ADD dwarfs the MFN duty on the SAME part (real engine output, not arithmetic)', () => {
    const wheel = computeLandedCost({
      exWorksCost: 100, commodity: 'road_wheel', originRegion: 'CN',
      partWeightKg: 9, annualVolume: 50000, asOfDate: '2026-07-29',
    });
    const add = wheel.adders.find(a => a.key.startsWith('remedy'))!.amountGbp;
    const mfn = wheel.adders.find(a => a.key === 'duty')!.amountGbp;
    expect(add / mfn).toBeGreaterThan(4);
  });

  it('the same wheel from a non-remedy origin costs materially less', () => {
    const cn = computeLandedCost({
      exWorksCost: 100, commodity: 'road_wheel', originRegion: 'CN',
      partWeightKg: 9, annualVolume: 50000, asOfDate: '2026-07-29',
    });
    const de = computeLandedCost({
      exWorksCost: 100, commodity: 'road_wheel', originRegion: 'DE',
      partWeightKg: 9, annualVolume: 50000, asOfDate: '2026-07-29',
    });
    expect(de.adders.some(a => a.key.startsWith('remedy'))).toBe(false);
    expect(cn.totalLandedCost - de.totalLandedCost).toBeGreaterThan(20);
  });

  it('an hsCodeOverride outside the candidate list is HONOURED, not silently dropped', () => {
    // Regression: the override used to be discarded, which also defeated
    // trade-remedy matching so anti-dumping duty could never fire.
    const r = computeLandedCost({
      exWorksCost: 100, commodity: 'cast_and_machine', originRegion: 'CN',
      hsCodeOverride: '8708701000', partWeightKg: 9, annualVolume: 50000,
      asOfDate: '2026-07-29',
    });
    expect(r.hsCode).toBe('8708701000');
    expect(r.adders.some(a => a.key.startsWith('remedy'))).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/TRADE REMEDY APPLIES/);
  });

  it('an inherited rate on an unknown code is flagged as unconfirmed', () => {
    const line = selectTariffLine('cast_and_machine', { hsCodeOverride: '9999999999' });
    expect(line!.hsCode).toBe('9999999999');
    expect(line!.status).toBe('estimate');
    expect(line!.source).toMatch(/INHERITED/);
  });

  it('respects the measure expiry date', () => {
    expect(findTradeRemedies('8708701000', 'CN', '2026-12-31')).toHaveLength(1);
    expect(findTradeRemedies('8708701000', 'CN', '2027-06-01')).toHaveLength(0);
  });

  it('does not apply the measure to other origins', () => {
    expect(findTradeRemedies('8708701000', 'DE', '2026-07-29')).toHaveLength(0);
  });

  it('warns that no-match means NOT CHECKED for high-remedy origins', () => {
    const r = computeLandedCost({
      exWorksCost: 41, commodity: 'cast_and_machine', originRegion: 'CN',
      partWeightKg: 2.8, annualVolume: 60000, asOfDate: '2026-07-29',
    });
    expect(r.warnings.join(' ')).toMatch(/TRADE REMEDY NOT CHECKED/);
    expect(r.warnings.join(' ')).toMatch(/NOT CHECKED, not "no duty"/);
    expect(HIGH_REMEDY_ORIGINS).toContain('CN');
  });

  it('does not raise the screening warning for low-remedy origins', () => {
    const r = computeLandedCost({
      exWorksCost: 41, commodity: 'cast_and_machine', originRegion: 'DE',
      partWeightKg: 2.8, annualVolume: 60000, asOfDate: '2026-07-29',
    });
    expect(r.warnings.join(' ')).not.toMatch(/TRADE REMEDY NOT CHECKED/);
  });

  it('every registered measure carries an expiry and a verify URL', () => {
    for (const m of TRADE_REMEDIES) {
      expect(m.verifyUrl).toMatch(/^https:\/\//);
      expect(m.dutyPct).toBeGreaterThan(0);
      expect(m.source.length).toBeGreaterThan(10);
    }
  });
});

// ─── FIX 2: assists ──────────────────────────────────────────────────────────

describe('customs valuation — assists', () => {
  it('adds buyer-supplied tooling to the customs value, apportioned', () => {
    const without = computeLandedCost({
      exWorksCost: 41, commodity: 'cast_and_machine', originRegion: 'CN',
      partWeightKg: 2.8, annualVolume: 60000,
    });
    const withAssist = computeLandedCost({
      exWorksCost: 41, commodity: 'cast_and_machine', originRegion: 'CN',
      partWeightKg: 2.8, annualVolume: 60000,
      assists: { toolingValueGbp: 218000, toolingApportionVolume: 60000 },
    });
    // £218,000 / 60,000 = £3.63/part added to customs value
    expect(withAssist.customsValueCif - without.customsValueCif).toBeCloseTo(3.63, 2);
    // and therefore MORE duty
    const d0 = without.adders.find(a => a.key === 'duty')!.amountGbp;
    const d1 = withAssist.adders.find(a => a.key === 'duty')!.amountGbp;
    expect(d1).toBeGreaterThan(d0);
  });

  it('includes free-issue material and royalties', () => {
    const r = computeLandedCost({
      exWorksCost: 100, commodity: 'machining', originRegion: 'CN',
      partWeightKg: 1, annualVolume: 10000, freightPerPartGbp: 0, insuranceRate: 0,
      assists: { freeIssueMaterialPerPartGbp: 5, royaltiesPerPartGbp: 2 },
    });
    expect(r.customsValueCif).toBeCloseTo(107, 2);
  });

  it('warns that assists are dutiable and must be declared', () => {
    const r = computeLandedCost({
      exWorksCost: 41, commodity: 'cast_and_machine', originRegion: 'CN',
      partWeightKg: 2.8, annualVolume: 60000,
      assists: { toolingValueGbp: 218000 },
    });
    expect(r.warnings.join(' ')).toMatch(/DUTIABLE/);
    expect(r.warnings.join(' ')).toMatch(/under-declaration offence/);
  });

  it('prompts for assists when none are declared', () => {
    const r = computeLandedCost({
      exWorksCost: 41, commodity: 'cast_and_machine', originRegion: 'CN',
      partWeightKg: 2.8, annualVolume: 60000,
    });
    expect(r.provenance.join(' ')).toMatch(/No assists declared/);
  });
});

// ─── FIX 3: valuation basis ──────────────────────────────────────────────────

describe('valuation basis statement', () => {
  it('every result states it is should-cost, not transaction value', () => {
    for (const region of ['CN', 'UK', 'DE']) {
      const r = computeLandedCost({
        exWorksCost: 41, commodity: 'cast_and_machine', originRegion: region,
        partWeightKg: 2.8, annualVolume: 60000,
      });
      expect(r.valuationBasis.basis).toBe('modelled-should-cost');
      expect(r.valuationBasis.statement).toMatch(/price actually paid or payable/);
      expect(r.valuationBasis.statement).toMatch(/not for duty budgeting/i);
      expect(r.valuationBasis.declaredValueWouldBe).toMatch(/assists/);
    }
  });
});

// ─── FIX 4: CBAM gap + free allocation ───────────────────────────────────────

describe('CBAM — gap-based levy and free allocation', () => {
  it('deducts the carbon price already paid in the country of origin', () => {
    const fromEU = computeLandedCost({
      exWorksCost: 41, commodity: 'cast_and_machine', originRegion: 'DE',
      partWeightKg: 2.8, annualVolume: 60000,
      carbon: carbon(41.5, 'Aluminium (primary mix)'),
      asOfDate: '2027-06-01', cbamScheme: 'UK',
    });
    // EU carbon price (55) exceeds UK (40) → gap is zero → no CBAM
    expect(fromEU.adders.some(x => x.key === 'cbam' && x.amountGbp > 0)).toBe(false);
    expect(fromEU.provenance.join(' ')).toMatch(/No CBAM liability/);
  });

  it('charges only the gap for a low-carbon-price origin', () => {
    const r = computeLandedCost({
      exWorksCost: 41, commodity: 'cast_and_machine', originRegion: 'CN',
      partWeightKg: 2.8, annualVolume: 60000,
      carbon: carbon(41.5, 'Aluminium (primary mix)'),
      asOfDate: '2027-06-01', cbamScheme: 'UK',
    });
    // 0.0415 t x (40 - 8 China) x (1 - 0.90 free alloc 2027) = 0.13
    const cbam = r.adders.find(x => x.key === 'cbam')!;
    expect(cbam.amountGbp).toBeCloseTo(0.13, 2);
    expect(ORIGIN_CARBON_PRICE_GBP_PER_TONNE.CN).toBe(8);
  });

  it('free allocation phases out, so the charge RISES year on year', () => {
    const year = (y: string) => computeLandedCost({
      exWorksCost: 41, commodity: 'cast_and_machine', originRegion: 'CN',
      partWeightKg: 2.8, annualVolume: 60000,
      carbon: carbon(41.5, 'Aluminium (primary mix)'),
      asOfDate: y, cbamScheme: 'UK',
    }).adders.find(x => x.key === 'cbam')?.amountGbp ?? 0;

    expect(freeAllocationFactor(2027)).toBe(0.90);
    expect(freeAllocationFactor(2036)).toBe(0);
    expect(year('2030-01-01')).toBeGreaterThan(year('2027-06-01'));
    expect(year('2036-01-01')).toBeGreaterThan(year('2030-01-01'));
  });

  it('an explicit origin carbon price overrides the table', () => {
    const r = computeLandedCost({
      exWorksCost: 41, commodity: 'cast_and_machine', originRegion: 'CN',
      partWeightKg: 2.8, annualVolume: 60000,
      carbon: carbon(41.5, 'Aluminium (primary mix)'),
      asOfDate: '2027-06-01', cbamScheme: 'UK',
      originCarbonPriceGbpPerTonne: 40,
    });
    expect(r.adders.find(x => x.key === 'cbam')!.amountGbp).toBe(0);
  });
});

// ─── FIX 5: cumulation, insufficient processing, tolerance ───────────────────

describe('rules of origin — cumulation and processing', () => {
  it('UK material counts as ORIGINATING under the TCA (bilateral cumulation)', () => {
    expect(countsAsOriginating('UK-EU TCA', 'UK')).toBe(true);
    expect(countsAsOriginating('UK-EU TCA', 'CN')).toBe(false);
    expect(CUMULATION_PARTNERS['UK-EU TCA']).toContain('UK');
  });

  it('cumulation converts a false FAIL into a genuine PASS', () => {
    // £30 of material: £22 UK-supplied, £8 Chinese. Naive = 73% NOM → FAIL.
    const naive = assessOrigin({
      agreement: 'UK-EU TCA', exWorksPrice: 41, nonOriginatingMaterialCost: 30,
      mfnDutyPct: 4.5, asOfDate: '2026-07-29',
    });
    expect(naive.qualifies).toBe(false);

    const cumulated = assessOrigin({
      agreement: 'UK-EU TCA', exWorksPrice: 41, nonOriginatingMaterialCost: 30,
      mfnDutyPct: 4.5, asOfDate: '2026-07-29',
      materialByOrigin: { UK: 22, CN: 8 },
    });
    expect(cumulated.qualifies).toBe(true);
    expect(cumulated.nonOriginatingPct).toBeCloseTo(19.5, 1);
    expect(cumulated.notes.join(' ')).toMatch(/counts as ORIGINATING/);
  });

  it('insufficient processing FAILS origin even when the value test PASSES', () => {
    const a = assessOrigin({
      agreement: 'UK-EU TCA', exWorksPrice: 100, nonOriginatingMaterialCost: 10,
      mfnDutyPct: 4.5, customsValueCif: 105, asOfDate: '2026-07-29',
      operationsPerformed: ['simple_painting_or_polishing', 'affixing_marks_labels_logos'],
    });
    expect(a.nonOriginatingPct).toBe(10);        // comfortably under 50%
    expect(a.qualifies).toBe(false);             // but still fails
    expect(a.warnings.join(' ')).toMatch(/INSUFFICIENT PROCESSING/);
    expect(a.warnings.join(' ')).toMatch(/which this part PASSES/);
  });

  it('a single substantive operation rescues it', () => {
    const a = assessOrigin({
      agreement: 'UK-EU TCA', exWorksPrice: 100, nonOriginatingMaterialCost: 10,
      mfnDutyPct: 4.5, asOfDate: '2026-07-29',
      operationsPerformed: ['simple_painting_or_polishing', 'cnc_machining'],
    });
    expect(a.qualifies).toBe(true);
    expect(isInsufficientProcessing(['simple_painting_or_polishing', 'cnc_machining'])).toBe(false);
  });

  it('notes when the processing test has not been run', () => {
    const a = assessOrigin({
      agreement: 'UK-EU TCA', exWorksPrice: 100, nonOriginatingMaterialCost: 10,
      mfnDutyPct: 4.5, asOfDate: '2026-07-29',
    });
    expect(a.notes.join(' ')).toMatch(/Insufficient-processing test NOT run/);
  });

  it('states that de minimis rescues a CTC failure, not a value failure', () => {
    const a = assessOrigin({
      agreement: 'UK-EU TCA', exWorksPrice: 100, nonOriginatingMaterialCost: 75,
      mfnDutyPct: 4.5, asOfDate: '2026-07-29',
    });
    expect(a.notes.join(' ')).toMatch(/rescues a failed CHANGE-OF-CLASSIFICATION rule, NOT a failed value test/);
  });

  it('the insufficient list covers the standard minimal operations', () => {
    expect(INSUFFICIENT_OPERATIONS).toContain('simple_assembly_of_parts');
    expect(INSUFFICIENT_OPERATIONS).toContain('affixing_marks_labels_logos');
    expect(isInsufficientProcessing([])).toBe(false);      // undeclared ≠ insufficient
    expect(isInsufficientProcessing(undefined)).toBe(false);
  });

  it('cumulation and processing flow through computeLandedCost', () => {
    const r = computeLandedCost({
      exWorksCost: 41, commodity: 'cast_and_machine', originRegion: 'DE',
      partWeightKg: 2.8, annualVolume: 60000,
      nonOriginatingMaterialCost: 30,
      materialByOrigin: { UK: 22, CN: 8 },
      operationsPerformed: ['die_casting', 'cnc_machining'],
    });
    expect(r.origin!.qualifies).toBe(true);
    expect(r.dutyRatePctApplied).toBe(0);
  });
});

// ─── Incoterm cost logic ─────────────────────────────────────────────────────

describe('incoterm affects cost (regression: it used to be decorative)', () => {
  const base = {
    exWorksCost: 100, commodity: 'road_wheel', originRegion: 'CN',
    partWeightKg: 9, annualVolume: 50000, asOfDate: '2026-07-29',
  } as const;

  it('EXW costs MORE than FOB — buyer bears origin inland haulage', () => {
    const exw = computeLandedCost({ ...base, incoterm: 'EXW' });
    const fob = computeLandedCost({ ...base, incoterm: 'FOB' });
    expect(exw.totalLandedCost).toBeGreaterThan(fob.totalLandedCost);
    expect(exw.adders.some(a => a.key === 'origin-inland')).toBe(true);
    expect(fob.adders.some(a => a.key === 'origin-inland')).toBe(false);
  });

  it('origin inland under EXW is DUTIABLE — it raises the customs value', () => {
    const exw = computeLandedCost({ ...base, incoterm: 'EXW' });
    const fob = computeLandedCost({ ...base, incoterm: 'FOB' });
    expect(exw.customsValueCif).toBeGreaterThan(fob.customsValueCif);
    // and therefore more duty
    const dExw = exw.adders.find(a => a.key === 'duty')!.amountGbp;
    const dFob = fob.adders.find(a => a.key === 'duty')!.amountGbp;
    expect(dExw).toBeGreaterThan(dFob);
  });

  it('CIF does NOT add a second freight line — that would double-count', () => {
    const cif = computeLandedCost({ ...base, incoterm: 'CIF' });
    expect(cif.adders.find(a => a.key === 'freight')!.amountGbp).toBe(0);
    expect(cif.warnings.join(' ')).toMatch(/already inside the supplier's price/i);
  });

  it('CIF total is lower than FOB because carriage sits in the seller price', () => {
    const cif = computeLandedCost({ ...base, incoterm: 'CIF' });
    const fob = computeLandedCost({ ...base, incoterm: 'FOB' });
    expect(cif.totalLandedCost).toBeLessThan(fob.totalLandedCost);
  });

  it('an explicit freight override still wins under CIF', () => {
    const cif = computeLandedCost({ ...base, incoterm: 'CIF', freightPerPartGbp: 7 });
    expect(cif.adders.find(a => a.key === 'freight')!.amountGbp).toBe(7);
  });

  it('all five incoterms now produce distinct-or-justified totals', () => {
    const totals = (['EXW', 'FOB', 'CIF', 'DAP', 'DDP'] as const)
      .map(t => computeLandedCost({ ...base, incoterm: t }).totalLandedCost);
    // EXW > FOB > CIF (=DAP=DDP on cost, they differ in who pays duty)
    expect(totals[0]).toBeGreaterThan(totals[1]);
    expect(totals[1]).toBeGreaterThan(totals[2]);
    expect(new Set(totals).size).toBeGreaterThan(1);   // no longer all identical
  });
});

// ─── Duty relief regimes ─────────────────────────────────────────────────────

describe('duty relief opportunities', () => {
  it('surfaces IP / OPR / RGR when duty is actually payable', () => {
    const r = computeLandedCost({
      exWorksCost: 100, commodity: 'road_wheel', originRegion: 'CN',
      partWeightKg: 9, annualVolume: 50000, asOfDate: '2026-07-29',
    });
    const codes = r.reliefOpportunities.map(x => x.code);
    expect(codes).toEqual(expect.arrayContaining(['IP', 'OPR', 'RGR', 'CW']));
    for (const rel of r.reliefOpportunities) {
      expect(rel.verifyUrl).toMatch(/^https:\/\/www\.gov\.uk\//);
      expect(rel.benefit.length).toBeGreaterThan(20);
    }
  });

  it('offers none for a domestic part — there is no duty to relieve', () => {
    const r = computeLandedCost({
      exWorksCost: 100, commodity: 'road_wheel', originRegion: 'UK',
      partWeightKg: 9, annualVolume: 50000,
    });
    expect(r.reliefOpportunities).toHaveLength(0);
  });

  it('offers none when preference already gives 0% and no remedy applies', () => {
    const r = computeLandedCost({
      exWorksCost: 100, commodity: 'cast_and_machine', originRegion: 'DE',
      partWeightKg: 2.8, annualVolume: 60000,
      nonOriginatingMaterialCost: 5,
    });
    expect(r.dutyRatePctApplied).toBe(0);
    expect(r.reliefOpportunities).toHaveLength(0);
  });
});
