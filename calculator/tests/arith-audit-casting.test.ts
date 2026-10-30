/**
 * Arithmetic audit — casting and cast + machine (Oct 2026, docs/review/arith-audit/casting.md).
 *
 * Each block pins one defect the independent shadow model (scripts/arith-audit/casting.ts) found, on the real parts
 * the audit worked: the arithmetic printed must be the arithmetic done, a step must be charged once on the right
 * quantity, in the process order, and every constant that moves cost must say what it is.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { computeCastingDrivers, type CastingInputs } from '../src/engine/modules/casting.js';
import { bandMid } from '../src/engine/cost-input-rules/commodities/casting.js';
import { BASELINE, ANSWERS } from '../scripts/real-parts-baseline.js';
import type { OCCTGeometry } from '../server/utils/geometry-bridge.js';

process.env.AIR_GAPPED = '1';
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Array<{ part: string; geometry: OCCTGeometry }>;
const machineRate = (id: string) => (book.machines.find(m => m.id === id) as unknown as { computedRatePerHr: number }).computedRatePerHr;
const labourRate = (id: string) => book.labour.find(l => l.id === id)!.fullyLoadedRatePerHr;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cost(part: string, commodity?: string): Promise<any> {
  const p = base.find(x => x.part === part)!;
  return costMeasuredPart(p.geometry, part,
    { partNumber: part, file: part, annualVolume: 50_000, ...(commodity ? { commodity } : {}) } as never,
    ANSWERS[part].answers, 'UK', { annualVolume: 50_000, programmeYears: 5 } as never, book,
    { partNumber: part, file: part, status: 'error' } as never);
}

describe('A1 — the yield basis says "midpoint", so the yield is the midpoint', () => {
  it('bandMid keeps the third decimal (0.45–0.60 → 0.525, not 0.53)', () => {
    expect(bandMid([0.45, 0.60])).toBe(0.525);
    expect(bandMid([0.55, 0.70])).toBe(0.625);
  });
  it('the Casting Bracket (steel sand) is costed at 0.525', async () => {
    const r = await cost('Casting_Braket.stp');
    expect(r.provenance['cam-cast-yield'].value).toBe(0.525);
    expect(r.params.castingYield).toBe(0.525);
  });
});

describe('A2 — cast + machine blasts the CASTING, so the blast is sized on the as-cast weight', () => {
  it('PRCR002: 9.084 kg as cast ÷ 600 kg/h × (blast + operator), not the 7.364 kg finished', async () => {
    const r = await cost('PRCR002.stp');
    const castKg = Number(r.provenance['cam-cast-wt'].value);
    const want = Math.round(castKg / 600 * (machineRate('blast-machine') + labourRate('lab-uk-foundry')) * 100) / 100;
    expect(r.provenance['cam-shot-blast'].value).toBe(want);
    expect(r.provenance['cam-shot-blast'].basis).toContain(`${castKg.toFixed(2)} kg as cast`);
    expect(r.params.shotBlastCostPerPart).toBe(want);
  });
  it('the casting route (no machining stock) still blasts the part as cast = its own weight', async () => {
    const r = await cost('Casting_Braket.stp', 'casting');
    const kg = Number(r.provenance['cast-part-wt'].value);
    expect(r.provenance['cast-shot-blast'].value).toBe(Math.max(0.1, Math.round(kg / 600 * (machineRate('blast-machine') + labourRate('lab-uk-foundry')) * 100) / 100));
  });
});

const SAND: CastingInputs = {
  subtype: 'sand', materialId: 'mat-gs-c25', partWeightKg: 3, castingYield: 0.5, rejectRate: 0.03,
  labourId: 'lab-uk-foundry', oee: 0.8, manning: 4, labourEfficiency: 0.92, amortizationVolume: 250_000,
  sand: { mouldLineId: 'sand-cast-line', cycleTimeHr: 0.01, patternCost: 8_000, patternLife: 32_000, coreCostPerPart: 0 },
  fettlingMinutes: 6,
};

describe('A3 — a pattern wears per mould rammed: sets are counted on castings POURED, rejects included', () => {
  it('250,000 good at 3% reject = 257,732 poured ÷ 32,000 → 9 sets (it bought 8)', () => {
    const d = computeCastingDrivers(SAND);
    expect(d.tooling.totalToolingCost).toBe(9 * 8_000);
    expect(d.tooling.items![0].label).toMatch(/^Pattern equipment: 9 set\(s\) \(life 32,000 castings each; 257,732 poured incl\. 3% rejects\)/);
  });
  it('an exact fit does not buy a spare set', () => {
    const d = computeCastingDrivers({ ...SAND, rejectRate: 0, amortizationVolume: 64_000 });
    expect(d.tooling.totalToolingCost).toBe(2 * 8_000);
  });
  it('HPDC dies and gravity moulds the same', () => {
    const h = computeCastingDrivers({ ...SAND, subtype: 'hpdc', sand: undefined,
      hpdc: { machineId: 'hpdc-400t', cycleTimeSec: 60, cavities: 1, dieCost: 50_000, dieLife: 125_000 } });
    expect(h.tooling.totalToolingCost).toBe(3 * 50_000);       // 257,732 shots ÷ 125,000 → 3 (it bought 2)
    const g = computeCastingDrivers({ ...SAND, subtype: 'gravity', sand: undefined,
      gravity: { machineId: 'grav-die-cast-std', cycleTimeHr: 0.08, mouldCost: 20_000, mouldLife: 125_000 } });
    expect(g.tooling.totalToolingCost).toBe(3 * 20_000);
  });
});

describe('A4 — the melt shop is in the process order and its figures are printed', () => {
  it('melt shop comes before fettling (melt → mould / pour → knock-out → fettle)', () => {
    const names = computeCastingDrivers(SAND).operations.map(o => o.operationName);
    const melt = names.findIndex(n => /^Melt shop/.test(n));
    const fettle = names.findIndex(n => /^Fettling/.test(n));
    expect(melt).toBeGreaterThan(0);
    expect(melt).toBeLessThan(fettle);
    expect(names[0]).toBe('Sand Casting — Moulding');
  });
  it('the melt-shop line, the green sand and the melt energy state their kg poured and constants', () => {
    const d = computeCastingDrivers(SAND);
    const pour = 3 / 0.97 / 0.5;
    expect(d.operations.find(o => /^Melt shop/.test(o.operationName))!.operationName)
      .toContain(`${pour.toFixed(2)} kg poured × 1.5 operator-h/t`);
    expect(d.rawMaterial.consumablesItems!.find(i => /^green-sand/.test(i.label))!.label)
      .toContain(`${pour.toFixed(2)} kg poured × £0.01/kg`);
    const basis = d.rawMaterial.energyKwh!.basis!;
    expect(basis).toContain(`${pour.toFixed(3)} kg poured`);
    expect(basis).toContain('× 0.7 kWh/kg');
    expect(basis).toContain('3% of them lost');
    expect(basis).toMatch(/engineering-typical/);
  });
});

describe('A5 — every constant that moves a real part says what it is', () => {
  it('Casting Bracket: pattern life, heat treat, blast, yield and crew are labelled unsourced', async () => {
    const r = await cost('Casting_Braket.stp');
    const b = (id: string) => String(r.provenance[id].basis);
    expect(b('cam-hpdc-die-life')).toMatch(/engineering-typical, not sourced/);
    expect(b('cam-ht-cost')).toMatch(/stress-relieve \/ normalise rate.*not sourced/);
    expect(b('cam-shot-blast')).toMatch(/engineering-typical, not sourced/);
    expect(b('cam-cast-yield')).toMatch(/not sourced/);
    expect(b('cam-cast-manning')).toMatch(/not sourced/);
  });
  it('PRCR002: the sand pattern basis claims no slides (a sand pattern has none; the model takes core boxes only)', async () => {
    const r = await cost('PRCR002.stp');
    const b = String(r.provenance['cam-hpdc-die-cost'].basis);
    expect(b).not.toMatch(/slide/);
    expect(b).toMatch(/2 core box\(es\) \(32 undercut face\(s\)\)/);
    expect(b).toMatch(/aluminium plate/);
  });
});
