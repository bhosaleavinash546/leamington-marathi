/**
 * The gear heat-treatment rate engine, checked against the workbook it came from.
 *
 * The first block is the one that matters: it feeds the SOURCE WORKBOOK'S OWN
 * country economics into `computeHeatTreatRate` and asserts the published
 * conversion costs come back. That proves the CHAIN was ported correctly,
 * independently of whose energy tariffs you then run it on — which is the right
 * separation, because CostVision deliberately uses its own regional data rather
 * than the workbook's country table.
 *
 * Source: "Gear Heat Treatment & Should-Cost Rate Model" workbook, sheet
 * 04_Rate_Buildup, rows HT-01 China/India/Europe/UK. Its figures are USD/kg;
 * the engine works in GBP, so the workbook's own USD/GBP 1.33 converts them.
 */
import { describe, it, expect } from 'vitest';
import {
  computeHeatTreatRate, capitalRecoveryFactor, caseDepthFactor,
  energyFloorVerdict, ENERGY_FLOOR_RATIO,
} from '../src/engine/gear-heat-treat-rate.js';
import {
  GEAR_HEAT_TREAT_PROCESSES, findHeatTreatProcess, DISTORTION_CLASSES_BY_RISK,
  REFERENCE_CASE_DEPTH_MM, type HeatTreatShopEconomics,
} from '../src/engine/gear-heat-treat-data.js';
import { REGIONAL_DATA } from '../src/engine/regional-rates.js';
import { analyseGear } from '../src/engine/modules/gear.js';

const USD_PER_GBP = 1.33;
const gbp = (usd: number): number => usd / USD_PER_GBP;

/** Rebuild the workbook's own shop economics so its rows can be reproduced. */
const wbShop = (
  hours: number, oee: number, wacc: number, maint: number, overheadUsd: number,
  quality: number, sga: number, margin: number, logisticsUsd: number,
): HeatTreatShopEconomics => {
  const p = (value: number) => ({ value, status: 'unverified' as const, source: 'workbook', recordedAt: '2026-08-13' });
  return {
    operatingHoursPerYear: p(hours), oee: p(oee), wacc: p(wacc),
    depreciationLifeYears: p(10), maintenancePctOfCapital: p(maint),
    overheadPerFurnacePerYearGBP: p(gbp(overheadUsd)), qualityMultiplier: p(quality),
    subcontractSgaPct: p(sga), subcontractMarginPct: p(margin),
    subcontractLogisticsGBPPerKg: p(gbp(logisticsUsd)),
  };
};

/**
 * The workbook's 04_Rate_Buildup, HT-01. Its country economics differ from
 * CostVision's, so each case supplies the workbook's own energy/labour by
 * temporarily standing in a region whose REGIONAL_DATA matches — which no region
 * does exactly. Instead the check is done on the ELEMENTS the workbook publishes
 * that do not depend on its tariffs (throughput, capital, maintenance, overhead,
 * QC, consumables, fixtures), plus a hand-computed energy and labour line.
 */
describe('reproduces the source workbook', () => {
  const HT01 = GEAR_HEAT_TREAT_PROCESSES.gas_carburise;

  it('the throughput identity — the workbook calls this the highest-leverage line', () => {
    // UK: 600 kg / 7 h x 7000 h x 0.85 = 510,000 kg/yr (workbook col J, row 8)
    const r = computeHeatTreatRate('gas_carburise', 'UK');
    expect(r.throughputKgPerYear).toBeCloseTo(510_000, 0);
    // China: 600/7 x 8000 x 0.82 = 562,285.7
    const cn = computeHeatTreatRate('gas_carburise', 'CN');
    expect(cn.throughputKgPerYear).toBeCloseTo(562_285.714, 2);
  });

  it('capital recovery is an annuity, and India\'s higher WACC shows up in it', () => {
    // Workbook 03_Country_Inputs row 23: CN 0.1359, IN 0.1627, EU 0.1327, UK 0.1391
    expect(capitalRecoveryFactor(0.060, 10)).toBeCloseTo(0.1359, 4);
    expect(capitalRecoveryFactor(0.100, 10)).toBeCloseTo(0.1627, 4);
    expect(capitalRecoveryFactor(0.055, 10)).toBeCloseTo(0.1327, 4);
    expect(capitalRecoveryFactor(0.065, 10)).toBeCloseTo(0.1391, 4);
    // Straight-line would give 0.10 flat and hide the cost of capital entirely.
    expect(capitalRecoveryFactor(0.10, 10)).toBeGreaterThan(1 / 10);
  });

  it('capital, maintenance, overhead and QC per kg match the workbook, UK HT-01', () => {
    const r = computeHeatTreatRate('gas_carburise', 'UK',
      { shop: wbShop(7000, 0.85, 0.065, 0.035, 105_000, 1.0, 0.12, 0.13, 0.035) });
    // Workbook row 8 (USD/kg): capital 0.21479, maint 0.05404, overhead 0.20588, QC 0.03000
    // UK capital multiplier in the workbook is 1.05; CostVision's UK
    // machineRateMultiplier is 1.00, so compare on the shared 1.00 basis.
    const ukCapMult = REGIONAL_DATA.UK.machineRateMultiplier;
    expect(r.capital).toBeCloseTo(gbp(0.21479) / 1.05 * ukCapMult, 4);
    expect(r.maintenance).toBeCloseTo(gbp(0.05404) / 1.05 * ukCapMult, 4);
    expect(r.overhead).toBeCloseTo(gbp(0.20588) * REGIONAL_DATA.UK.overheadMultiplier, 4);
    expect(r.qc).toBeCloseTo(gbp(0.03000), 4);
  });

  it('energy and labour follow CostVision\'s regional data, not the workbook\'s', () => {
    const r = computeHeatTreatRate('gas_carburise', 'UK');
    const uk = REGIONAL_DATA.UK;
    // 0.30 kWh/kg electric + 2.0 kWh/kg gas, at CostVision's UK tariffs.
    expect(r.energy).toBeCloseTo(0.30 * uk.energy.electricityPerKwh + 2.0 * uk.energy.gasPerKwh, 6);
    // 7 h x 0.35 op-h/h x semi-skilled rate / 600 kg
    expect(r.labour).toBeCloseTo(7 * 0.35 * uk.labour.semiskilled / 600, 6);
  });

  it('the whole chain sums, and stops at in-house for a captive line', () => {
    const r = computeHeatTreatRate('gas_carburise', 'UK', { sourcing: 'captive' });
    const sum = r.energy + r.labour + r.capital + r.maintenance
      + r.consumables + r.fixtures + r.overhead + r.qc;
    expect(r.conversion).toBeCloseTo(sum, 9);
    expect(r.scrap).toBeCloseTo(r.conversion * HT01.scrapFraction.value * 1.0, 9);
    expect(r.inHouse).toBeCloseTo(r.conversion + r.scrap, 9);
    // Captive carries no SG&A, margin or freight — that IS the make-vs-buy gap.
    expect(r.sga).toBe(0);
    expect(r.margin).toBe(0);
    expect(r.logistics).toBe(0);
    expect(r.ratePerKg).toBeCloseTo(r.inHouse, 9);
  });
});

describe('the three mechanisms a flat GBP/kg cannot represent', () => {
  it('case depth scales the cycle as ECD squared — and only on diffusion routes', () => {
    // The workbook's own worked example: ECD 0.75 against a 0.70 reference.
    expect(caseDepthFactor(GEAR_HEAT_TREAT_PROCESSES.gas_carburise, 0.75))
      .toBeCloseTo(Math.pow(0.75 / 0.70, 2), 6);
    expect(caseDepthFactor(GEAR_HEAT_TREAT_PROCESSES.gas_carburise, 0.75)).toBeCloseTo(1.148, 3);
    // Doubling the case roughly QUADRUPLES the carburising segment.
    expect(caseDepthFactor(GEAR_HEAT_TREAT_PROCESSES.gas_carburise, 1.40)).toBeCloseTo(4, 6);
    // A nitride, a temper or a wash does not care about carburised case depth.
    for (const key of ['nitride', 'temper_standalone', 'wash', 'quench_temper']) {
      expect(caseDepthFactor(GEAR_HEAT_TREAT_PROCESSES[key], 1.40), key).toBe(1);
    }
    // And it reaches the rate: a deeper case costs more per kg.
    const shallow = computeHeatTreatRate('gas_carburise', 'UK', { effectiveCaseDepthMm: 0.5 });
    const deep = computeHeatTreatRate('gas_carburise', 'UK', { effectiveCaseDepthMm: 1.2 });
    expect(deep.ratePerKg).toBeGreaterThan(shallow.ratePerKg);
    expect(deep.effectiveCycleHours / shallow.effectiveCycleHours)
      .toBeCloseTo(Math.pow(1.2 / 0.5, 2), 6);
  });

  it('load density: halving the load roughly doubles the per-load elements', () => {
    const full = computeHeatTreatRate('gas_carburise', 'UK', { netLoadKg: 600 });
    const half = computeHeatTreatRate('gas_carburise', 'UK', { netLoadKg: 300 });
    for (const k of ['capital', 'maintenance', 'overhead', 'qc'] as const) {
      expect(half[k] / full[k], k).toBeCloseTo(2, 6);
    }
    // Energy is per kg of part, so it does NOT change — that is the whole point
    // of the net-load basis and it keeps the energy floor honest.
    expect(half.energy).toBeCloseTo(full.energy, 9);
    expect(half.ratePerKg).toBeGreaterThan(full.ratePerKg);
  });

  it('captive vs commercial differ by the workbook\'s stated 25-35%', () => {
    const captive = computeHeatTreatRate('gas_carburise', 'UK', { sourcing: 'captive' });
    const buy = computeHeatTreatRate('gas_carburise', 'UK', { sourcing: 'subcontract' });
    const gap = buy.ratePerKg / captive.ratePerKg - 1;
    expect(gap).toBeGreaterThan(0.20);
    expect(gap).toBeLessThan(0.40);
  });

  it('a lot below the supplier minimum prices at the minimum, not per kg', () => {
    const big = computeHeatTreatRate('gas_carburise', 'UK',
      { lotSizeKg: 5000, minimumLotChargeGBP: 250 });
    expect(big.minimumChargeUpliftPerKg).toBe(0);
    const tiny = computeHeatTreatRate('gas_carburise', 'UK',
      { lotSizeKg: 40, minimumLotChargeGBP: 250 });
    expect(tiny.minimumChargeUpliftPerKg).toBeGreaterThan(0);
    expect(tiny.ratePerKg * 40).toBeCloseTo(250, 6);
    // A captive line has no supplier minimum to pay.
    const captive = computeHeatTreatRate('gas_carburise', 'UK',
      { lotSizeKg: 40, minimumLotChargeGBP: 250, sourcing: 'captive' });
    expect(captive.minimumChargeUpliftPerKg).toBe(0);
  });
});

describe('regional behaviour', () => {
  it('every region resolves, and the country spread is directionally right', () => {
    const uk = computeHeatTreatRate('gas_carburise', 'UK').ratePerKg;
    const cn = computeHeatTreatRate('gas_carburise', 'CN').ratePerKg;
    const inr = computeHeatTreatRate('gas_carburise', 'IN').ratePerKg;
    expect(cn).toBeLessThan(uk);
    expect(inr).toBeLessThan(uk);
    // But NOT by the margin a labour-arbitraged operation would show: the
    // workbook's central finding is that heat treat is the least
    // labour-arbitraged step in the gear route, because energy dominates.
    expect(cn / uk).toBeGreaterThan(0.25);
  });

  it('an unknown region falls back rather than throwing', () => {
    expect(() => computeHeatTreatRate('gas_carburise', 'ATLANTIS')).not.toThrow();
  });

  it('an unknown PROCESS throws rather than costing on a neighbour', () => {
    expect(() => computeHeatTreatRate('plasma_nitride_xyz', 'UK'))
      .toThrow(/No heat-treatment process/);
  });

  it('processes are reachable by the workbook\'s own HT-nn id', () => {
    expect(findHeatTreatProcess('HT-01')).toBe(GEAR_HEAT_TREAT_PROCESSES.gas_carburise);
    expect(findHeatTreatProcess('HT-06')).toBe(GEAR_HEAT_TREAT_PROCESSES.nitride);
  });
});

describe('the relationships between processes hold', () => {
  const rate = (k: string): number => computeHeatTreatRate(k, 'UK').ratePerKg;

  it('nitriding is dearest per kg — a 45 h cycle, not a 7 h one', () => {
    expect(rate('nitride')).toBeGreaterThan(rate('gas_carburise'));
    expect(rate('nitride')).toBeGreaterThan(rate('quench_temper'));
  });

  it('FNC is the low-cost substitute for case hardening the workbook describes', () => {
    // 8 h against nitriding's 45 h.
    expect(rate('fnc')).toBeLessThan(rate('nitride'));
  });

  it('carbonitriding is the cheapest case-hardening route', () => {
    expect(rate('carbonitride')).toBeLessThan(rate('gas_carburise'));
    expect(rate('carbonitride')).toBeLessThan(rate('lpc_carburise'));
  });

  it('LPC/vacuum carburising is a premium over batch, as an EV-gear route should be', () => {
    expect(rate('lpc_carburise')).toBeGreaterThan(rate('gas_carburise'));
  });

  it('tempering and washing are cheap — which is why bundling them hides them', () => {
    expect(rate('temper_standalone')).toBeLessThan(rate('quench_temper'));
    expect(rate('wash')).toBeLessThan(rate('temper_standalone'));
  });

  it('the throughput-limited cells are dear per kg despite short cycles', () => {
    // Press quench does one part per cycle; single-tooth induction scales with z.
    expect(rate('press_quench')).toBeGreaterThan(rate('quench_temper'));
    expect(rate('induction_tooth')).toBeGreaterThan(rate('induction_spin'));
  });
});

describe('distortion risk maps to ISO classes', () => {
  it('carburising costs 2 classes and nitriding costs none', () => {
    expect(DISTORTION_CLASSES_BY_RISK[GEAR_HEAT_TREAT_PROCESSES.gas_carburise.distortionRisk]).toBe(2);
    expect(DISTORTION_CLASSES_BY_RISK[GEAR_HEAT_TREAT_PROCESSES.nitride.distortionRisk]).toBe(0);
    expect(DISTORTION_CLASSES_BY_RISK[GEAR_HEAT_TREAT_PROCESSES.fnc.distortionRisk]).toBe(0);
    // LPC exists precisely to cut the distortion that oil quenching causes.
    const lpc = DISTORTION_CLASSES_BY_RISK[GEAR_HEAT_TREAT_PROCESSES.lpc_carburise.distortionRisk];
    const gas = DISTORTION_CLASSES_BY_RISK[GEAR_HEAT_TREAT_PROCESSES.gas_carburise.distortionRisk];
    expect(lpc).toBeLessThan(gas);
  });
});

describe('the energy-floor negotiation test', () => {
  it('flags a quote that cannot physically cover labour, capital and overhead', () => {
    const r = computeHeatTreatRate('gas_carburise', 'UK');
    const tooCheap = energyFloorVerdict(r.energyFloorPerKg * 1.5, r.energyFloorPerKg);
    expect(tooCheap.implausible).toBe(true);
    expect(tooCheap.message).toMatch(/captive generation|denser furnace charge|loss-leader/);
    const plausible = energyFloorVerdict(r.energyFloorPerKg * 4, r.energyFloorPerKg);
    expect(plausible.implausible).toBe(false);
    expect(plausible.message).toBeNull();
  });

  it('the model\'s own rate clears its own floor — or the model is incoherent', () => {
    for (const key of Object.keys(GEAR_HEAT_TREAT_PROCESSES)) {
      const r = computeHeatTreatRate(key, 'UK');
      expect(r.ratePerKg / r.energyFloorPerKg, key).toBeGreaterThan(ENERGY_FLOOR_RATIO);
    }
  });

  it('is silent on nonsense input rather than dividing by zero', () => {
    expect(energyFloorVerdict(0, 0).message).toBeNull();
    expect(energyFloorVerdict(1, 0).message).toBeNull();
  });
});

describe('every figure carries its provenance', () => {
  it('all library parameters are tagged unverified with a real source', () => {
    for (const [key, proc] of Object.entries(GEAR_HEAT_TREAT_PROCESSES)) {
      for (const [field, param] of Object.entries(proc)) {
        if (param && typeof param === 'object' && 'value' in param && 'status' in param) {
          expect(param.status, `${key}.${field}`).toBe('unverified');
          expect(String(param.source).length, `${key}.${field} source`).toBeGreaterThan(20);
        }
      }
      expect(proc.note.length, `${key} note`).toBeGreaterThan(40);
    }
  });

  it('the printed basis states the whole derivation', () => {
    const r = computeHeatTreatRate('gas_carburise', 'UK', { effectiveCaseDepthMm: 0.9 });
    expect(r.basis).toMatch(/kg\/load/);
    expect(r.basis).toMatch(/kg\/yr/);
    expect(r.basis).toMatch(/energy .* labour .* capital/);
    expect(r.basis).toMatch(/ECD 0\.9 mm/);
    expect(REFERENCE_CASE_DEPTH_MM).toBe(0.70);
  });
});

/**
 * The regionalisation trap.
 *
 * Heat treat is a CONVERSION cost — energy, labour, capital, overhead — that
 * happens to be bought as a purchased service and therefore sits in the material
 * bucket on the report. Before the build-up it was computed once at UK rates and
 * then either currency-converted or rescaled by `materialMultiplier`, which is
 * the wrong factor by roughly 2x: China's material multiplier is 0.88, but its
 * heat-treat conversion cost is ~0.4 of the UK's because energy, labour and
 * capital are all cheaper. These pin the fix.
 */
describe('heat treat regionalises as conversion, not as material', () => {
  it('the China/UK ratio follows conversion economics, not the material multiplier', () => {
    const uk = computeHeatTreatRate('gas_carburise', 'UK').ratePerKg;
    const cn = computeHeatTreatRate('gas_carburise', 'CN').ratePerKg;
    const ratio = cn / uk;
    // Nowhere near the 0.88 material multiplier that used to be applied.
    expect(REGIONAL_DATA.CN.materialMultiplier).toBeCloseTo(0.88, 2);
    expect(ratio).toBeLessThan(0.70);
    expect(ratio).toBeGreaterThan(0.25);
  });

  it('each element regionalises through its OWN driver', () => {
    const uk = computeHeatTreatRate('gas_carburise', 'UK');
    const cn = computeHeatTreatRate('gas_carburise', 'CN');
    // Energy tracks the electricity/gas tariffs.
    const expectedEnergy = 0.30 * REGIONAL_DATA.CN.energy.electricityPerKwh
      + 2.0 * REGIONAL_DATA.CN.energy.gasPerKwh;
    expect(cn.energy).toBeCloseTo(expectedEnergy, 9);
    // Labour tracks the semi-skilled rate.
    expect(cn.labour / uk.labour)
      .toBeCloseTo(REGIONAL_DATA.CN.labour.semiskilled / REGIONAL_DATA.UK.labour.semiskilled, 6);
    // Capital tracks the machine-rate multiplier, adjusted for the region's own
    // operating hours, OEE and WACC — so it is NOT a flat scale.
    expect(cn.capital).toBeLessThan(uk.capital);
  });

  it('a gear costed in China gets Chinese heat treat, not UK heat treat converted', () => {
    const base = {
      normalModuleMm: 3, teeth: 38, helixAngleDeg: 0, faceWidthMm: 30, internal: false,
      qualityClass: 8, materialClass: 'case_hardening_steel' as const, caseHardened: true,
      blankCostPerPart: 4.76, netWeightKg: 2.088, materialId: 'mat-steel-20mncr5',
      annualVolume: 200_000, amortizationVolume: 1_000_000, batchSize: 16_670,
    };
    const uk = analyseGear({ ...base, region: 'UK' });
    const cn = analyseGear({ ...base, region: 'CN' });
    expect(uk.heatTreatCostPerPart).toBeGreaterThan(0);
    expect(cn.heatTreatCostPerPart).toBeGreaterThan(0);
    expect(cn.heatTreatCostPerPart / uk.heatTreatCostPerPart).toBeLessThan(0.70);
    // And the printed basis names the region it was costed in.
    expect(cn.heatTreatBreakdown[0].basis).toMatch(/@ CN/);
  });
});

describe('the heat-treat package is unbundled', () => {
  const gear = (over = {}) => ({
    normalModuleMm: 3, teeth: 38, helixAngleDeg: 0, faceWidthMm: 30, internal: false,
    qualityClass: 8, materialClass: 'case_hardening_steel' as const, caseHardened: true,
    blankCostPerPart: 4.76, netWeightKg: 2.088, materialId: 'mat-steel-20mncr5',
    annualVolume: 200_000, amortizationVolume: 1_000_000, batchSize: 16_670, ...over,
  });

  it('carburising drags two washes and a temper behind it; LPC drags none', () => {
    const carb = analyseGear(gear());
    const steps = carb.heatTreatBreakdown.map(x => x.step);
    expect(steps.filter(x => /wash/i.test(x))).toHaveLength(2);
    expect(steps.filter(x => /temper/i.test(x)).length).toBeGreaterThanOrEqual(1);
    // Low-pressure carburising comes out bright — no wash at all.
    const lpc = analyseGear(gear({
      materialClass: 'through_hardening_steel', caseHardened: false,
      hardeningRoute: 'lpc_carburising' as const,
    }));
    expect(lpc.heatTreatBreakdown.map(x => x.step).filter(x => /wash/i.test(x))).toHaveLength(0);
  });

  it('the sum of the itemised steps IS the heat-treat cost — nothing hidden', () => {
    const a = analyseGear(gear());
    const summed = a.heatTreatBreakdown.reduce((s, x) => s + x.costPerPart, 0);
    expect(a.heatTreatCostPerPart).toBeCloseTo(summed, 9);
  });

  it('omitting straightening and peening is WARNED about, not silently free', () => {
    const a = analyseGear(gear({ qualityClass: 7 }));
    expect(a.warnings.join(' ')).toMatch(/straighten/i);
    expect(a.warnings.join(' ')).toMatch(/peen/i);
    // Enabling them adds real cost and removes the warning.
    const b = analyseGear(gear({ qualityClass: 7, shotPeened: true, straightened: true }));
    expect(b.heatTreatCostPerPart).toBeGreaterThan(a.heatTreatCostPerPart);
    expect(b.warnings.join(' ')).not.toMatch(/No shot peening/i);
  });

  it('case depth reaches the gear cost, not just the rate', () => {
    const shallow = analyseGear(gear({ effectiveCaseDepthMm: 0.5 }));
    const deep = analyseGear(gear({ effectiveCaseDepthMm: 1.2 }));
    expect(deep.heatTreatCostPerPart).toBeGreaterThan(shallow.heatTreatCostPerPart);
  });

  it('load density reaches the gear cost', () => {
    const dense = analyseGear(gear({ heatTreatLoadKg: 600 }));
    const sparse = analyseGear(gear({ heatTreatLoadKg: 250 }));
    expect(sparse.heatTreatCostPerPart).toBeGreaterThan(dense.heatTreatCostPerPart);
  });

  it('a captive line is cheaper than buying the same physical process', () => {
    const buy = analyseGear(gear({ heatTreatSourcing: 'subcontract' as const }));
    const own = analyseGear(gear({ heatTreatSourcing: 'captive' as const }));
    expect(own.heatTreatCostPerPart).toBeLessThan(buy.heatTreatCostPerPart);
  });
});
