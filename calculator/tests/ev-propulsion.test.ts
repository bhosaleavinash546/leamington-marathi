/**
 * EV propulsion build (Oct 2026): battery pack and e-motor should-cost.
 * Hand-reconciled arithmetic, the bought-in rule on cells, the cited benchmarks, and the country behaviour
 * (labour / machines follow the country; traded cells and magnets do not; library metals do).
 * docs/ev/battery-emotor-build-2026-10.md.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { buildRegionalLibrary } from '../src/engine/regional-rates.js';
import { withRates } from '../src/engine/rate-context.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { computeBatteryPackDrivers, batteryPackFacts, type BatteryPackInputs } from '../src/engine/modules/battery-pack.js';
import { computeEMotorDrivers, eMotorFacts, magnetGbpPerKg, type EMotorInputs } from '../src/engine/modules/e-motor.js';
import { batteryPackChecks, eMotorChecks } from '../src/engine/modules/ev-advisor.js';
import { CELL_PRICE_USD_PER_KWH, MAGNET_GRADES, TB_OXIDE_CNY_PER_KG, TB_IN_OXIDE, MAGNET_FINISHING_UPLIFT, EV_MACHINES } from '../src/engine/ev-data.js';
import { executeCalculateCost } from '../server/services/cost-executor.js';

const LIB = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const SHOP = { overheadPct: 0.10, marginPct: 0.07, packagingPerPart: 0, logisticsPerPart: 0 };

const PACK: BatteryPackInputs = { chemistry: 'NMC', cellFormat: 'prismatic', cellCapacityAh: 140, seriesCount: 192, parallelCount: 1,
  architecture: 'module', cellsPerModule: 24, packLengthMm: 2000, packWidthMm: 1400, enclosure: 'aluminium',
  labourId: 'lab-uk-semiskilled', testLabourId: 'lab-uk-technician', oee: 0.85, labourEfficiency: 0.9, rejectRate: 0, amortizationVolume: 300_000 };
const MOTOR: EMotorInputs = { motorType: 'pmsm', statorOdMm: 220, statorIdMm: 150, stackLengthMm: 150, slots: 48, airgapMm: 0.8, shaftDiaMm: 45,
  laminationThicknessMm: 0.27, laminationMaterialId: 'mat-no27-27a', winding: 'hairpin', conductorMaterialId: 'mat-cu-hairpin', hairpinLayers: 6,
  magnetGrade: '45UH_GBD', magnetMassKg: 1.6, labourId: 'lab-uk-semiskilled', testLabourId: 'lab-uk-technician', oee: 0.85, labourEfficiency: 0.9,
  rejectRate: 0, amortizationVolume: 300_000 };
const stack = (d: ReturnType<typeof computeBatteryPackDrivers>, lib = LIB) => computeUniversalStack({ partName: 'x', ...d, ...SHOP } as never, lib);

describe('battery pack', () => {
  it('electrical facts by hand: 192 × 140 Ah × 3.65 V = 98.1 kWh, 700.8 V, 8 modules of 24, 384 welded joints', () => {
    const f = batteryPackFacts(PACK);
    expect(f.packKwh).toBeCloseTo(192 * 140 * 3.65 / 1000, 6);
    expect(f.packV).toBeCloseTo(700.8, 6);
    expect(f.modules).toBe(8);
    expect(f.joints).toBe(384);
  });

  it('cells at the BNEF-derived market price ($128 NMC pack × 80 % cell share = $102.4/kWh) — or the quote', () => {
    expect(CELL_PRICE_USD_PER_KWH.NMC.usd).toBeCloseTo(128 * 0.8, 6);
    expect(CELL_PRICE_USD_PER_KWH.LFP.usd).toBeCloseTo(81 * 0.8, 6);
    const f = batteryPackFacts(PACK);
    expect(f.cellGbpPerKwh).toBeCloseTo(102.4 / 1.324, 6);
    expect(batteryPackFacts({ ...PACK, cellPriceGbpPerKwh: 70 }).cellGbpPerKwh).toBe(70);
  });

  it('the cells are bought in ONCE: in the material line, outside the overhead and margin base, with handling only', () => {
    const d = computeBatteryPackDrivers(PACK);
    const r = stack(d);
    const cells = d.rawMaterial.boughtIn!.cost;
    expect(cells).toBeCloseTo(batteryPackFacts(PACK).packKwh * 102.4 / 1.324, 4);
    // Material = integration (direct) + cells (added by the core) — never twice.
    expect(r.breakdown.rawMaterial).toBeCloseTo(d.rawMaterial.directCost! + cells, 4);
    const factory = r.breakdown.rawMaterial + r.breakdown.process + r.breakdown.labour + r.breakdown.tooling;
    expect(r.breakdown.overhead).toBeCloseTo(0.10 * (factory - cells) + 0.03 * cells, 4);
    expect(r.breakdown.margin).toBeCloseTo(0.07 * (factory + r.breakdown.overhead - cells), 4);
  });

  it('the material lines add up to the material bucket (every line itemised)', () => {
    const d = computeBatteryPackDrivers(PACK);
    const sum = d.rawMaterial.lines!.reduce((t, l) => t + l.qty * l.unitCost, 0);
    expect(sum).toBeCloseTo(d.rawMaterial.directCost! + d.rawMaterial.boughtIn!.cost, 1);
  });

  it('against BNEF 2025: cell share ≈ 80 %, NMC pack ≈ $128/kWh — both checks pass on the reference pack', () => {
    const d = computeBatteryPackDrivers(PACK);
    const r = stack(d);
    const checks = batteryPackChecks(r, batteryPackFacts(PACK), d.rawMaterial.boughtIn!.cost, 'NMC');
    expect(checks.every(c => c.flag === 'ok'), JSON.stringify(checks)).toBe(true);
  });

  it('cell-to-pack has no modules, no module test, and adds structural adhesive', () => {
    const d = computeBatteryPackDrivers({ ...PACK, architecture: 'cell_to_pack' });
    expect(d.operations.some(o => /Module end-of-line/.test(o.operationName))).toBe(false);
    expect(d.rawMaterial.lines!.some(l => l.ref === 'ADH')).toBe(true);
  });

  it('in India: labour and machines follow the country; the traded cells do not', () => {
    const IN = buildRegionalLibrary(DEFAULT_RATE_LIBRARY, 'IN');
    const uk = computeBatteryPackDrivers(PACK);
    const inn = withRates(IN, () => computeBatteryPackDrivers(PACK));
    expect(inn.rawMaterial.boughtIn!.cost).toBeCloseTo(uk.rawMaterial.boughtIn!.cost, 6);
    const ukR = stack(uk), inR = stack(inn, recomputeMachineRates(IN));
    expect(inR.breakdown.labour).toBeLessThan(ukR.breakdown.labour * 0.5);
  });
});

describe('e-motor', () => {
  it('geometry by hand: laminations, stator and rotor steel, copper', () => {
    const f = eMotorFacts(MOTOR);
    const rho = DEFAULT_RATE_LIBRARY.materials.find(m => m.id === 'mat-no27-27a')!.densityKgPerM3;
    expect(f.laminations).toBe(Math.ceil(150 / 0.27 * 0.96));
    const annulus = Math.PI / 4 * (0.22 ** 2 - 0.15 ** 2);
    expect(f.statorSteelKg).toBeCloseTo(annulus * 0.6 * 0.15 * 0.96 * rho, 3);
    const rotor = Math.PI / 4 * (0.1484 ** 2 - 0.045 ** 2);
    expect(f.rotorSteelKg).toBeCloseTo(rotor * 0.92 * 0.15 * 0.96 * rho, 3);
    expect(f.grossSteelKg).toBeCloseTo(f.laminations * 0.226 ** 2 * 0.00027 * rho, 3);
    const cu = DEFAULT_RATE_LIBRARY.materials.find(m => m.id === 'mat-cu-hairpin')!.densityKgPerM3;
    expect(f.copperKg).toBeCloseTo(annulus * 0.4 * 0.65 * 0.15 * 1.5 * cu, 3);
    expect(f.welds).toBe(48 * 6 / 2);
  });

  it('magnet price: (blank + Tb content ÷ oxide share) × finishing ÷ CNY/£', () => {
    const g = MAGNET_GRADES['45UH_GBD'];
    const byHand = (g.blankCnyPerKg + g.tbMassFraction * TB_OXIDE_CNY_PER_KG / TB_IN_OXIDE) * (1 + MAGNET_FINISHING_UPLIFT) / 8.88;
    expect(magnetGbpPerKg('45UH_GBD')).toBeCloseTo(byHand, 3);
    expect(magnetGbpPerKg('42EH_GBD')).toBeGreaterThan(magnetGbpPerKg('45UH_GBD'));
    expect(magnetGbpPerKg('45UH_GBD')).toBeGreaterThan(magnetGbpPerKg('45SH'));
  });

  it('the lamination scrap is credited (a negative line), and the lines add up to the material bucket', () => {
    const d = computeEMotorDrivers(MOTOR);
    const scr = d.rawMaterial.lines!.find(l => l.ref === 'LAM-SCR')!;
    expect(scr.unitCost).toBeLessThan(0);
    const sum = d.rawMaterial.lines!.reduce((t, l) => t + l.qty * l.unitCost, 0);
    expect(sum).toBeCloseTo(d.rawMaterial.directCost!, 2);
  });

  it('induction and EESM carry no magnets; induction adds a cage, EESM rotor copper and slip rings', () => {
    const im = computeEMotorDrivers({ ...MOTOR, motorType: 'induction' }).rawMaterial.lines!.map(l => l.ref);
    const ee = computeEMotorDrivers({ ...MOTOR, motorType: 'eesm' }).rawMaterial.lines!.map(l => l.ref);
    expect(im).not.toContain('MAG'); expect(im).toContain('CAGE');
    expect(ee).not.toContain('MAG'); expect(ee).toEqual(expect.arrayContaining(['CU-ROT', 'SLIP']));
  });

  it('round wire has no hairpin weld; dies wear out fractionally', () => {
    const d = computeEMotorDrivers({ ...MOTOR, winding: 'round_wire' });
    expect(d.operations.some(o => /Hairpin/.test(o.operationName))).toBe(false);
    const big = computeEMotorDrivers({ ...MOTOR, amortizationVolume: 120_000 });
    const f = eMotorFacts(MOTOR);
    expect(f.strokes * 120_000).toBeGreaterThan(50_000_000);
    expect(big.tooling.totalToolingCost).toBeCloseTo((f.strokes * 120_000 / 50_000_000) * 350_000 + 250_000 + 200_000, 0);
  });

  it('magnet mass check on the 1–2 kg benchmark; strip utilisation ≥ 40 %', () => {
    const d = computeEMotorDrivers(MOTOR);
    const r = stack(d);
    expect(eMotorChecks(r, eMotorFacts(MOTOR), 'pmsm').every(c => c.flag === 'ok')).toBe(true);
  });
});

describe('the product reaches them', () => {
  it('the line machines are in the library with a rate', () => {
    for (const m of EV_MACHINES) expect(LIB.machines.find(x => x.id === m.id)?.computedRatePerHr ?? 0, m.id).toBeGreaterThan(0);
  });
  it('the agent / headless executor costs both', () => {
    const bp = executeCalculateCost({ commodity: 'battery_pack', params: PACK, rateLibrary: LIB } as never);
    const em = executeCalculateCost({ commodity: 'e_motor', params: MOTOR, rateLibrary: LIB } as never);
    expect(bp.total).toBeGreaterThan(5000);
    expect(em.total).toBeGreaterThan(300);
  });
});
