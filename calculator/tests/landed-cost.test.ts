import { describe, it, expect } from 'vitest';
import { computeLandedCost, selectTariffLine, landedCostSummary } from '../src/engine/landed-cost.js';
import { CBAM_SCHEMES, HS_CANDIDATES, UK_STEEL_MEASURE, cbamSector } from '../src/engine/landed-cost-data.js';
import type { CarbonEstimate } from '../src/engine/carbon.js';

const carbon = (materialKgCO2e: number, materialClass: string): CarbonEstimate => ({
  materialKgCO2e, processKgCO2e: 0, logisticsKgCO2e: 0,
  totalKgCO2e: materialKgCO2e, perNetKgCO2e: 0, gridKgPerKwh: 0.2,
  processKwh: 0, materialFactorKgPerKg: 8.6, materialClass, notes: [],
});

// ─── Core arithmetic ─────────────────────────────────────────────────────────

describe('landed cost — customs value and duty basis', () => {
  it('charges duty on CIF, not on ex-works (the classic error)', () => {
    const r = computeLandedCost({
      exWorksCost: 100, commodity: 'machining', originRegion: 'CN',
      partWeightKg: 2, annualVolume: 60000,
      freightPerPartGbp: 10, insuranceRate: 0, clearancePerShipmentGbp: 0,
      inlandHaulagePerPartGbp: 0,
    });
    // CIF = 100 + 10 + 0 = 110; duty 4.5% → £4.95 (NOT 4.50 on ex-works)
    expect(r.customsValueCif).toBeCloseTo(110, 6);
    const duty = r.adders.find(a => a.key === 'duty')!;
    expect(duty.amountGbp).toBeCloseTo(4.95, 6);
    expect(duty.amountGbp).not.toBeCloseTo(4.50, 6);
  });

  it('three-part result reconciles exactly: exW + adders = total landed', () => {
    const r = computeLandedCost({
      exWorksCost: 40.99, commodity: 'cast_and_machine', originRegion: 'CN',
      partWeightKg: 2.8, annualVolume: 60000,
    });
    const sum = r.adders.reduce((s, a) => s + a.amountGbp, 0);
    expect(r.addersTotal).toBeCloseTo(sum, 6);
    expect(r.totalLandedCost).toBeCloseTo(r.exWorksCost + r.addersTotal, 6);
    // upliftPct is rounded to 2dp by design
    expect(r.upliftPct).toBeCloseTo((r.addersTotal / r.exWorksCost) * 100, 1);
  });

  it('every adder is itemised with a stated basis', () => {
    const r = computeLandedCost({
      exWorksCost: 10, commodity: 'sheet_metal', originRegion: 'CN',
      partWeightKg: 0.5, annualVolume: 100000,
    });
    for (const a of r.adders) {
      expect(a.label.length).toBeGreaterThan(0);
      expect(a.basis.length).toBeGreaterThan(0);
      expect(Number.isFinite(a.amountGbp)).toBe(true);
    }
    expect(r.adders.map(a => a.key)).toEqual(
      expect.arrayContaining(['freight', 'insurance', 'duty', 'clearance', 'inland']),
    );
  });
});

// ─── Chargeable (volumetric) weight ──────────────────────────────────────────

describe('volumetric weight', () => {
  it('charges freight on the GREATER of actual and volumetric weight', () => {
    const heavy = computeLandedCost({
      exWorksCost: 2.08, commodity: 'injection_moulding', originRegion: 'CN',
      partWeightKg: 0.28, annualVolume: 250000, volumetricWeightKg: 4.0,
    });
    const naive = computeLandedCost({
      exWorksCost: 2.08, commodity: 'injection_moulding', originRegion: 'CN',
      partWeightKg: 0.28, annualVolume: 250000,
    });
    const fHeavy = heavy.adders.find(a => a.key === 'freight')!.amountGbp;
    const fNaive = naive.adders.find(a => a.key === 'freight')!.amountGbp;
    // A bulky moulding costs far more to ship than its mass implies
    expect(fHeavy).toBeGreaterThan(fNaive * 5);
    expect(heavy.totalLandedCost).toBeGreaterThan(naive.totalLandedCost);
  });

  it('higher freight also raises duty, because duty is charged on CIF', () => {
    const bulky = computeLandedCost({
      exWorksCost: 2.08, commodity: 'injection_moulding', originRegion: 'CN',
      partWeightKg: 0.28, annualVolume: 250000, volumetricWeightKg: 4.0,
    });
    const naive = computeLandedCost({
      exWorksCost: 2.08, commodity: 'injection_moulding', originRegion: 'CN',
      partWeightKg: 0.28, annualVolume: 250000,
    });
    expect(bulky.customsValueCif).toBeGreaterThan(naive.customsValueCif);
    expect(bulky.adders.find(a => a.key === 'duty')!.amountGbp)
      .toBeGreaterThan(naive.adders.find(a => a.key === 'duty')!.amountGbp);
  });

  it('warns when volumetric weight is not supplied', () => {
    const r = computeLandedCost({
      exWorksCost: 2.08, commodity: 'injection_moulding', originRegion: 'CN',
      partWeightKg: 0.28, annualVolume: 250000,
    });
    expect(r.warnings.join(' ')).toMatch(/volumetric weight/i);
  });
});

// ─── Import VAT must never be a cost ─────────────────────────────────────────

describe('import VAT treatment', () => {
  it('computes import VAT on (CIF + duty) but EXCLUDES it from landed cost', () => {
    const r = computeLandedCost({
      exWorksCost: 100, commodity: 'machining', originRegion: 'CN',
      partWeightKg: 2, annualVolume: 60000,
      freightPerPartGbp: 10, insuranceRate: 0,
      clearancePerShipmentGbp: 0, inlandHaulagePerPartGbp: 0,
    });
    // (110 + 4.95) × 20% = 22.99
    expect(r.recoverable.importVatGbp).toBeCloseTo(22.99, 2);
    expect(r.recoverable.ratePct).toBe(20);
    // and it must NOT be inside the cost
    expect(r.adders.some(a => /vat/i.test(a.label))).toBe(false);
    expect(r.totalLandedCost).toBeCloseTo(100 + 10 + 4.95, 2);
  });
});

// ─── Domestic vs imported ────────────────────────────────────────────────────

describe('domestic supply', () => {
  it('UK origin attracts no duty, no clearance, no VAT', () => {
    const r = computeLandedCost({
      exWorksCost: 62.42, commodity: 'cast_and_machine', originRegion: 'UK',
      partWeightKg: 2.8, annualVolume: 60000,
    });
    expect(r.dutyRatePctApplied).toBe(0);
    expect(r.recoverable.importVatGbp).toBe(0);
    expect(r.adders.map(a => a.key)).toEqual(['inland']);
    expect(r.needsVerification).toBe(false);
  });

  it('landed comparison can reverse an ex-works advantage', () => {
    // Same part: China cheaper ex-works, but duty+freight narrow the gap.
    const cn = computeLandedCost({
      exWorksCost: 40.99, commodity: 'cast_and_machine', originRegion: 'CN',
      partWeightKg: 2.8, annualVolume: 60000,
    });
    const uk = computeLandedCost({
      exWorksCost: 62.42, commodity: 'cast_and_machine', originRegion: 'UK',
      partWeightKg: 2.8, annualVolume: 60000,
    });
    expect(cn.totalLandedCost).toBeGreaterThan(cn.exWorksCost);
    // the gap must NARROW once landed
    const exwGap = uk.exWorksCost - cn.exWorksCost;
    const landedGap = uk.totalLandedCost - cn.totalLandedCost;
    expect(landedGap).toBeLessThan(exwGap);
  });
});

// ─── CBAM timing — the headline correctness point ────────────────────────────

describe('CBAM', () => {
  it('UK CBAM is NOT charged before 2027-01-01 — it becomes a future line', () => {
    const r = computeLandedCost({
      exWorksCost: 40.99, commodity: 'cast_and_machine', originRegion: 'CN',
      partWeightKg: 2.8, annualVolume: 60000,
      carbon: carbon(24.1, 'Aluminium (primary mix)'),
      asOfDate: '2026-07-29', cbamScheme: 'UK',
    });
    expect(r.adders.some(a => a.key === 'cbam')).toBe(false);
    expect(r.futureLines.some(a => a.key === 'cbam')).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/CBAM begins 2027-01-01/);
  });

  it('UK CBAM IS charged on/after 2027-01-01', () => {
    const r = computeLandedCost({
      exWorksCost: 40.99, commodity: 'cast_and_machine', originRegion: 'CN',
      partWeightKg: 2.8, annualVolume: 60000,
      carbon: carbon(24.1, 'Aluminium (primary mix)'),
      asOfDate: '2027-01-01', cbamScheme: 'UK',
    });
    const cbam = r.adders.find(a => a.key === 'cbam');
    expect(cbam).toBeDefined();
    // 24.1 kg = 0.0241 t × £40/t = £0.964
    expect(cbam!.amountGbp).toBeCloseTo(0.96, 2);
  });

  it('EU CBAM is already in force in 2026 (different date to the UK)', () => {
    const r = computeLandedCost({
      exWorksCost: 40.99, commodity: 'cast_and_machine', originRegion: 'CN',
      partWeightKg: 2.8, annualVolume: 60000,
      carbon: carbon(24.1, 'Aluminium (primary mix)'),
      asOfDate: '2026-07-29', cbamScheme: 'EU',
    });
    expect(r.adders.some(a => a.key === 'cbam')).toBe(true);
    expect(CBAM_SCHEMES.EU.liveFrom < CBAM_SCHEMES.UK.liveFrom).toBe(true);
  });

  it('plastics and electronics are OUT of CBAM scope', () => {
    expect(cbamSector('injection_moulding', 'Thermoplastic')).toBeNull();
    expect(cbamSector('pcba', 'Mixed electronics')).toBeNull();
    const r = computeLandedCost({
      exWorksCost: 2.08, commodity: 'injection_moulding', originRegion: 'CN',
      partWeightKg: 0.28, annualVolume: 250000,
      carbon: carbon(0.9, 'Thermoplastic'),
      asOfDate: '2027-06-01', cbamScheme: 'UK',
    });
    expect(r.adders.some(a => a.key === 'cbam')).toBe(false);
    expect(r.futureLines.some(a => a.key === 'cbam')).toBe(false);
    expect(r.provenance.join(' ')).toMatch(/outside the UK CBAM sector scope/);
  });

  it('steel IS in CBAM scope', () => {
    expect(cbamSector('sheet_metal', 'Steel')).toBe('iron_steel');
  });
});

// ─── Classification and preference ───────────────────────────────────────────

describe('classification & origin preference', () => {
  it('automotive vs non-automotive classification changes the duty rate', () => {
    const auto = selectTariffLine('cast_and_machine')!;
    const generic = selectTariffLine('cast_and_machine', { nonAutomotive: true })!;
    expect(auto.hsCode).toBe('8708999790');
    expect(generic.hsCode).toBe('7616999090');
    expect(generic.mfnDutyPct).toBeGreaterThan(auto.mfnDutyPct);
  });

  it('China gets no preference — full MFN', () => {
    const r = computeLandedCost({
      exWorksCost: 100, commodity: 'machining', originRegion: 'CN',
      partWeightKg: 1, annualVolume: 10000,
    });
    expect(r.preferenceApplied).toBeUndefined();
    expect(r.dutyRatePctApplied).toBe(4.5);
  });

  it('EU origin gets TCA preference but with an explicit rules-of-origin caveat', () => {
    const r = computeLandedCost({
      exWorksCost: 100, commodity: 'machining', originRegion: 'DE',
      partWeightKg: 1, annualVolume: 10000,
    });
    expect(r.dutyRatePctApplied).toBe(0);
    expect(r.preferenceApplied).toMatch(/TCA|Trade & Cooperation/);
    expect(r.warnings.join(' ')).toMatch(/rules of origin/i);
  });

  it('India defaults to MFN because the agreement status is unverified', () => {
    const r = computeLandedCost({
      exWorksCost: 100, commodity: 'machining', originRegion: 'IN',
      partWeightKg: 1, annualVolume: 10000,
    });
    expect(r.dutyRatePctApplied).toBe(4.5);
    expect(r.preferenceApplied).toBeUndefined();
  });

  it('PCB fab is duty-free under ITA', () => {
    const r = computeLandedCost({
      exWorksCost: 42.36, commodity: 'pcb_fab', originRegion: 'CN',
      partWeightKg: 0.15, annualVolume: 100000,
    });
    expect(r.dutyRatePctApplied).toBe(0);
    expect(r.adders.find(a => a.key === 'duty')!.amountGbp).toBe(0);
  });
});

// ─── Honesty / provenance guarantees ─────────────────────────────────────────

describe('provenance and honesty', () => {
  it('flags unverified duty rates rather than presenting them as fact', () => {
    const r = computeLandedCost({
      exWorksCost: 10, commodity: 'machining', originRegion: 'CN',
      partWeightKg: 1, annualVolume: 10000,
    });
    expect(r.needsVerification).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/not verified against the official tariff/);
    expect(r.adders.find(a => a.key === 'duty')!.verifyUrl).toMatch(/trade-tariff\.service\.gov\.uk/);
  });

  it('every HS candidate carries a verify URL and review date', () => {
    for (const [commodity, lines] of Object.entries(HS_CANDIDATES)) {
      expect(lines.length, commodity).toBeGreaterThan(0);
      for (const l of lines) {
        expect(l.verifyUrl, `${commodity}/${l.hsCode}`).toMatch(/^https:\/\/www\.trade-tariff\.service\.gov\.uk\/commodities\//);
        expect(l.reviewed, `${commodity}/${l.hsCode}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(l.mfnDutyPct).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('warns about double-counting when the ex-works stack already has logistics', () => {
    const r = computeLandedCost({
      exWorksCost: 10, commodity: 'sheet_metal', originRegion: 'CN',
      partWeightKg: 0.5, annualVolume: 100000, exWorksLogisticsPerPart: 0.85,
    });
    expect(r.warnings.join(' ')).toMatch(/double-counted/);
  });

  it('warns that a DDP quote already contains the landed adders', () => {
    const r = computeLandedCost({
      exWorksCost: 10, commodity: 'sheet_metal', originRegion: 'CN',
      partWeightKg: 0.5, annualVolume: 100000, incoterm: 'DDP',
    });
    expect(r.warnings.join(' ')).toMatch(/DDP/);
  });

  it('flags the new UK steel trade measure for mill products after 2026-07-01', () => {
    const r = computeLandedCost({
      exWorksCost: 10, commodity: 'sheet_metal', originRegion: 'CN',
      partWeightKg: 0.5, annualVolume: 100000,
      steelMillProduct: true, asOfDate: '2026-07-29',
    });
    expect(r.warnings.join(' ')).toMatch(/50% duty|50%/);
    expect(UK_STEEL_MEASURE.liveFrom).toBe('2026-07-01');
  });

  it('summary line states ex-works, adders, total and verification state', () => {
    const r = computeLandedCost({
      exWorksCost: 40.99, commodity: 'cast_and_machine', originRegion: 'CN',
      partWeightKg: 2.8, annualVolume: 60000,
    });
    const s = landedCostSummary(r);
    expect(s).toMatch(/Ex-works £40\.99/);
    expect(s).toMatch(/landed UK/);
    expect(s).toMatch(/UNVERIFIED/);
  });
});
