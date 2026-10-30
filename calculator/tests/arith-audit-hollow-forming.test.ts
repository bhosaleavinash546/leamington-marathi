/**
 * Arithmetic audit — blow moulding, rotational moulding, thermoforming (30 Oct 2026).
 * docs/review/arith-audit/hollow-forming.md has the findings; scripts/arith-audit/hollow-forming.ts is the
 * independent shadow model the totals at the bottom were reconciled against (196 checks, 0 FAIL).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { ROTATIONAL_MOULDING_RULES, rotoMoulds } from '../src/engine/cost-input-rules/commodities/rotational-moulding.js';
import { BLOW_MOULDING_RULES } from '../src/engine/cost-input-rules/commodities/blow-moulding.js';
import { THERMOFORMING_RULES } from '../src/engine/cost-input-rules/commodities/thermoforming.js';
import { computeRotationalMouldingDrivers } from '../src/engine/modules/rotational-moulding.js';
import { computeBlowMouldingDrivers } from '../src/engine/modules/blow-moulding.js';
import { computeThermoformingDrivers } from '../src/engine/modules/thermoforming.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import { ANSWERS } from '../scripts/real-parts-baseline.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext, CommodityRuleSpec } from '../src/engine/cost-input-rules/types.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry }>;
const geoOf = (p: string) => structuredClone(baseline.find(b => b.part === p)!.geometry);
const ctx = (part: string, commodity: string, annualVolume = 50_000, programmeYears?: number): RuleContext => ({
  geo: geoOf(part), geometryQuality: 'occt', commodity, commoditySource: 'engineer', annualVolume,
  ...(programmeYears ? { programmeYears } : {}), filename: part, answers: ANSWERS[part].answers,
} as RuleContext);
const prov = (spec: CommodityRuleSpec, c: RuleContext) => {
  const r = runCostInputRules(spec, c);
  const all = Object.values(r.byRule) as Array<{ ruleId: string; value: any; basis: string; source: string }>;
  return { r, get: (id: string) => { const d = all.find(x => x.ruleId === id); if (!d) throw new Error(`no ${id}`); return d; } };
};

describe('rotational moulding', () => {
  it('H1 the moulds-in-service basis re-adds on the page (it printed 4 arms × 22 min index = 86 min)', () => {
    const m = rotoMoulds(50_000, 4, 2, 1290);
    expect(m.basis).toContain('4 arms × 1290 s index = 5160 s');
    expect(m.basis).not.toMatch(/× 22 min/);
  });
  it('M7 moulds are sized for the parts moulded (good ÷ (1 − reject)), as the machine time is: coolant tank 26 → 28', () => {
    expect(rotoMoulds(50_000, 4, 2, 1290).moulds).toBe(28);
    expect(rotoMoulds(50_000, 4, 4, 1078).moulds).toBe(24);
  });
  it('M2 the oven basis prints the per-mm bake rate and re-adds; mould life is a labelled rule constant, not "library"', () => {
    const { get } = prov(ROTATIONAL_MOULDING_RULES, ctx('ROTO_Coolant_Tank.stp', 'rotational_moulding'));
    const heat = get('roto.heatTimeSec');
    expect(heat.basis).toContain('240 s mould soak + 5.00 mm × 210 s/mm');
    expect(heat.basis).toMatch(/not sourced/);
    expect(heat.value).toBe(Math.round(240 + 5.00 * 210));
    expect(get('roto.coolTimeSec').basis).toContain('1290 s bake × 1.35 = 1742 s');
    const life = get('roto.mouldLife');
    expect(life.source).toBe('rule');
    expect(life.basis).toMatch(/engineering-typical, not sourced/);
    expect(get('roto.mouldCost').basis).toContain('1430.2 cm² × £18/cm² × 0.75 simple = £19,308');
  });
  it('H8 grinding is charged on the powder charged (scrap + 1% loss), and a mould wears on parts moulded', () => {
    const base = {
      materialId: 'mat-lldpe-roto', partWeightKg: 1, powderCostAdderPerKg: 0.25, numArms: 4, partsPerArm: 2,
      heatingTimeSec: 1000, coolingTimeSec: 1300, loadUnloadTimeSec: 240, indexTimeSec: 1000, mouldsInService: 10,
      machineId: 'rotomould-carousel-4arm', labourId: 'lab-uk-roto', oee: 0.8, manning: 2, labourEfficiency: 0.92,
      mouldCost: 10_000, mouldLife: 10_000, amortizationVolume: 200_000, rejectRate: 0.03,
    };
    const d = computeRotationalMouldingDrivers(base);
    expect(d.rawMaterial.consumablesCostPerPart).toBeCloseTo(0.25 / 0.97 / 0.99, 10);
    expect(d.tooling.totalToolingCost).toBeCloseTo(10_000 * 200_000 / 0.97 / 10_000, 4);
  });
});

describe('blow moulding', () => {
  it('H10 the in-line deflash station is charged as the line runs: reject uplift and the line OEE', () => {
    const d = computeBlowMouldingDrivers({
      materialId: 'mat-pp-bm', partWeightKg: 0.3, flashWeightKg: 0.036, wallThicknessMm: 2, coolTimeFactorSPerMm2: 3.16,
      blowTimeSec: 5, openCloseSec: 4.3, machineId: 'blow-ebm-100l', labourId: 'lab-uk-blow', cavities: 1, oee: 0.8,
      manning: 0.5, labourEfficiency: 0.92, mouldCost: 10_000, mouldLife: 500_000, amortizationVolume: 250_000,
      deflashMachineId: 'blow-deflash-trimmer', deflashLabourId: 'lab-uk-blow', deflashCycleTimeSec: 22, deflashManning: 0,
      parisonExtrusionTimeSec: 0, rejectRate: 0.025, flashRegrindFraction: 1,
    });
    const trim = d.operations[1];
    expect(trim.oee).toBe(0.8);
    expect(trim.cycleTimeHr).toBeCloseTo(22 / 3600 / 0.975, 12);
    expect(trim.labourTimeHr).toBe(0);
  });
  it('H11 / H12 mould life and the cooling factor no longer claim a source they do not have', () => {
    const { get } = prov(BLOW_MOULDING_RULES, ctx('BM_Air_Duct.stp', 'blow_moulding'));
    const life = get('blowMoulding.mouldLife');
    expect(life.basis).not.toMatch(/documented/);
    expect(life.source).toBe('rule');
    const cool = get('blowMoulding.coolTimeFactorSPerMm2');
    expect(cool.basis).toMatch(/curated cooling factor/);
    expect(cool.basis).toContain('3.16 × 1.99² = 12.5 s');
    expect(cool.source).toBe('rule');
    // the mould build-up re-adds on the page
    const mould = get('blowMoulding.mouldCostGBP');
    const pounds = [...(mould.basis as string).matchAll(/£([\d,]+)(?!\/h)(?=;| =)/g)].map(m => Number(m[1].replace(/,/g, '')));
    expect(pounds.reduce((a, b) => a + b, 0)).toBe(mould.value);
  });
});

describe('thermoforming', () => {
  it('M21 heat / cool bases print their coefficients and re-add', () => {
    const { get } = prov(THERMOFORMING_RULES, ctx('TF_Battery_Box_Lid.stp', 'thermoforming'));
    expect(get('thermoforming.heatTimeSec').basis).toContain('12 × 9.41^1.6 = 433 s');
    expect(get('thermoforming.coolTimeSec').basis).toContain('4.5 × 9.41² × 0.65 (water-cooled) = 259 s');
  });
  it('M25 the printed tool life is applied: 1-up lid at 100,000/yr × 5 yr = 2 cast-Al tools', () => {
    const one = prov(THERMOFORMING_RULES, ctx('TF_Battery_Box_Lid.stp', 'thermoforming', 50_000, 5)).get('thermoforming.toolCost');
    const two = prov(THERMOFORMING_RULES, ctx('TF_Battery_Box_Lid.stp', 'thermoforming', 100_000, 5)).get('thermoforming.toolCost');
    expect(one.value).toBe(11_331);
    expect(two.value).toBe(22_662);
    expect(two.basis).toContain('2.00 tool sets');
  });
  it('M27 the oven energy line prints its arithmetic', () => {
    const d = computeThermoformingDrivers({
      materialId: 'mat-hdpe-tf', sheetWeightKg: 6.2577, partsPerSheet: 1, partWeightKg: 4.8286, method: 'vacuum',
      machineId: 'thermoform-large', labourId: 'lab-uk-thermoform', heatTimeSec: 433, formTimeSec: 6, coolTimeSec: 259,
      trimTimeSec: 56, indexTimeSec: 20, oee: 0.8, manning: 1, labourEfficiency: 0.92, toolCost: 11_331,
      amortizationVolume: 250_000, rejectRate: 0.03, rotary: true, trimMachineId: 'thermoform-trim-router',
    });
    expect(d.rawMaterial.energyKwh!.basis).toContain('6.2577 kg sheet × 0.234 kWh/kg');
    expect(d.rawMaterial.energyKwh!.electricity).toBeCloseTo(6.2577 * 0.234 / 0.97, 10);
  });
});

describe('the six real parts, headless (UK, 50,000/yr, 5 years) = the independent shadow model', () => {
  const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
  const cases: Array<[string, number]> = [
    ['BM_Air_Duct.stp', 1.0175], ['BM_Washer_Reservoir.stp', 1.3495],
    ['ROTO_Header_Tank.stp', 14.5883], ['ROTO_Coolant_Tank.stp', 38.0213],
    ['TF_Trim_Cover.stp', 2.2134], ['TF_Battery_Box_Lid.stp', 20.9543],
  ];
  for (const [part, total] of cases) {
    it(`${part} £${total}`, async () => {
      const spec = ANSWERS[part];
      const r = await costMeasuredPart(geoOf(part), part,
        { partNumber: part, file: part, annualVolume: 50_000, ...(spec.commodity ? { commodity: spec.commodity } : {}) } as never,
        spec.answers, 'UK', { annualVolume: 50_000, programmeYears: 5 } as never, book,
        { partNumber: part, file: part, status: 'error' } as never) as { status: string; total: number };
      expect(r.status).toBe('costed');
      expect(r.total).toBeCloseTo(total, 3);
    });
  }
});
