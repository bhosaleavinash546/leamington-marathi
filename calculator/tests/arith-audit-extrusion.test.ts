/**
 * Arithmetic audit — polymer and aluminium extrusion (30 Oct 2026, docs/review/arith-audit/extrusion.md).
 *
 * 1. The independent shadow (scripts/arith-audit/extrusion.ts) re-derives every input, operation, the material line,
 *    the tooling and the 8 buckets of the 12 real extrusion parts from geometry + rate book + answers, and the
 *    product's headless chain must agree with it to ½ p (money) / 0.5 % (inputs).
 * 2. One test per defect fixed — each failed before its fix.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { runExtrusionAudit, type Check } from '../scripts/arith-audit/extrusion.js';
import { buildAlExtrusionInputs, computeAluminiumExtrusionDrivers, type AlExtrusionSpec } from '../src/engine/modules/aluminium-extrusion.js';
import { computeExtrusionDrivers } from '../src/engine/modules/extrusion.js';
import { AL_IMPACT, AL_LINE } from '../src/engine/al-extrusion-data.js';

process.env.AIR_GAPPED = '1';

const RAIL: AlExtrusionSpec = {
  alloy: '6063', route: 'direct',
  section: { areaMm2: 1437.5, perimeterMm: 1135, ccdMm: 161.6, voids: 4, minWallMm: 2.5, partLengthMm: 1800 },
  partWeightKg: 6.9863, annualVolume: 50_000, amortizationVolume: 250_000, temper: 'T6', finish: 'mill',
  finishAreaM2: 2.0459, finishOutsideAreaM2: 0.756, bends: 0, cncMinutes: 0, cncFixturings: 0, fabFeatureRows: 0,
};

describe('shadow model: every real extrusion part re-derived independently', () => {
  let checks: Check[] = [];
  let parts: Record<string, Record<string, unknown>> = {};
  beforeAll(async () => { ({ checks, parts } = await runExtrusionAudit()); }, 180_000);

  it('covers the 12 real parts with every check passing', () => {
    expect(new Set(checks.map(c => c.part)).size).toBe(12);
    expect(checks.length).toBeGreaterThan(600);
    const fails = checks.filter(c => !c.pass).map(c => `${c.part}: ${c.what} shadow ${c.expected} product ${c.actual}`);
    expect(fails).toEqual([]);
  });

  it('battery rail by hand: £33.5154 a part (worked to the penny in the write-up)', () => {
    expect(Number(parts.AL_Battery_Rail.total)).toBeCloseTo(33.5154, 3);
  });
});

describe('X1 — the impact tool wears out by hits', () => {
  it('250,000 cans on a 150,000-hit tool buy 1.67 tool sets, not one', () => {
    const spec: AlExtrusionSpec = { ...RAIL, alloy: '1050', route: 'impact', temper: 'H112',
      section: { areaMm2: 0, perimeterMm: 0, ccdMm: 46, voids: 0, minWallMm: 0.82, partLengthMm: 0 }, partWeightKg: 0.0288, impactOuterDiaMm: 46 };
    const b = buildAlExtrusionInputs(spec);
    expect(b.inputs.dieLifeKg).toBeCloseTo(AL_IMPACT.toolLifeHits * 0.0288, 6);       // was 0 — the cup has no section area
    const d = computeAluminiumExtrusionDrivers(b.inputs);
    expect(d.tooling.totalToolingCost).toBeCloseTo(b.inputs.dieCostGbp * 250_000 / AL_IMPACT.toolLifeHits, 2);
  });
});

describe('X2 — a rejected extrusion is credited as scrap', () => {
  it('the net weight is the good part; the billet for the rejects is bought and its metal credited', () => {
    const b = buildAlExtrusionInputs(RAIL);
    const rm = computeAluminiumExtrusionDrivers(b.inputs).rawMaterial;
    expect(rm.netWeightKg).toBeCloseTo(b.inputs.partWeightKg, 9);                       // was part × 1/(1 − 2 %)
    expect(rm.netWeightKg / rm.materialUtilization).toBeCloseTo(b.inputs.billetKgPerPart / (1 - AL_LINE.rejectRate), 9);
  });
});

describe('X3 — the polymer start-up purge runs at the line rate', () => {
  it('a cooling-limited pipe purges 0.25 h × 95 kg/h, not 0.25 h × the screw\'s 432 kg/h', async () => {
    const { checks } = await runExtrusionAudit();
    const c = checks.find(x => x.part === 'EXT_Vent_Pipe' && x.what === 'input startupScrapFraction')!;
    expect(c.actual).toBeCloseTo(0.0217, 4);                                            // was 0.0988
  }, 180_000);
});

describe('X4 — the die line says it is dies consumed, not a one-off investment', () => {
  it('itemises the die price a set × the sets worn out over the programme tonnes', () => {
    const b = buildAlExtrusionInputs(RAIL);
    const t = computeAluminiumExtrusionDrivers(b.inputs).tooling;
    const sets = 250_000 * b.inputs.extrudedKgPerPart / b.inputs.dieLifeKg;
    expect(t.items?.[0].gbp).toBeCloseTo(b.inputs.dieCostGbp * sets, 2);
    expect(t.items?.[0].label).toMatch(/£10,003 a set \(the up-front investment\) × 43\.66 sets worn out over the programme \(1,746\.6 t extruded ÷ 40 t life a set\)/);
  });
});

describe('X5 — a bent profile is cut and bent before it is aged', () => {
  it('cut to length → stretch bend → age; a straight one ages the mill lengths first', () => {
    const bent = computeAluminiumExtrusionDrivers(buildAlExtrusionInputs({ ...RAIL, alloy: '7003', bends: 1 }).inputs).operations.map(o => o.operationName);
    const iCut = bent.findIndex(n => n.startsWith('Precision cut'));
    const iBend = bent.findIndex(n => n.startsWith('Stretch bending'));
    const iAge = bent.findIndex(n => n.startsWith('Artificial ageing'));
    expect(iCut).toBeLessThan(iBend);
    expect(iBend).toBeLessThan(iAge);
    const straight = computeAluminiumExtrusionDrivers(buildAlExtrusionInputs(RAIL).inputs).operations.map(o => o.operationName);
    expect(straight.findIndex(n => n.startsWith('Artificial ageing'))).toBeLessThan(straight.findIndex(n => n.startsWith('Precision cut')));
  });
});

describe('X6 — the constants that move cost are printed with what they are', () => {
  it('line OEE, rejects, runs and die change; billet-heat and ageing kWh; pack time', () => {
    const b = buildAlExtrusionInputs(RAIL);
    expect(b.notes.join(' | ')).toMatch(/OEE 78%, 2\.0% rejects .* 12 runs a year × 0\.5 h die change .* ESTIMATES \(engineering-typical, not sourced\)/);
    const d = computeAluminiumExtrusionDrivers(b.inputs);
    expect(d.rawMaterial.energyKwh?.basis).toMatch(/billet heating 0\.29 kWh\/kg × 7\.574 kg \+ ageing 0\.1 kWh\/kg × 6\.986 kg/);
    expect(d.operations.find(o => o.operationName.startsWith('Inspect, interleave'))?.operationName).toMatch(/13\.2 s — 6 s \+ 4 s a metre, engineering-typical/);
  });
});

describe('X7 — the polymer inspection station is not a second cut-off', () => {
  it('names what it does and its times', () => {
    const d = computeExtrusionDrivers({ materialId: 'mat-pe100-pipe', profileWeightKgPerM: 0.26, partLengthM: 1, lineRateKgPerHr: 95,
      extruderId: 'extruder-pipe-line', labourId: 'lab-uk-semiskilled', oee: 0.8, manning: 0.5, labourEfficiency: 0.92, startupScrapFraction: 0.02,
      dieCost: 7488, amortizationVolume: 250_000, process: 'pipe' });
    expect(d.operations[1].operationName).toBe('Inspect and bundle (station 4 s, operator 6 s — engineering-typical, not sourced)');
  });
});
