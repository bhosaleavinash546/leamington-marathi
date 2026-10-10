/**
 * The thermoforming review, 3 Oct 2026 — one test per finding.
 *
 * Traced on two parts modelled in OCP (cad-audit/parts/TF_modelled_parts.py —
 * not customer parts): a deep 900 × 600 × 250 mm HDPE battery-box lid and a
 * shallow 300 × 200 × 40 mm ABS trim cover. docs/cad/thermoforming-review-2026-10.md
 * has the trace and the hand reconciliation of the cover at 5,000/yr (£4.94).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import {
  THERMOFORMING_RULES, planAreaCm2, nestOnSheet, TF_MACHINES,
} from '../src/engine/cost-input-rules/commodities/thermoforming.js';
import { RESIN_DECISION_ID, resinFacts } from '../src/engine/cost-input-rules/derive/resin.js';
import { inferCommodity } from '../src/engine/cost-input-rules/derive/commodity.js';
import { polymerFromNames, processFromNames } from '../src/engine/cost-input-rules/derive/part-evidence.js';
import { buildDeterministicAnalysis } from '../src/engine/cost-input-rules/deterministic.js';
import { toCostParams } from '../src/engine/cost-input-rules/to-cost-params.js';
import { computeThermoformingDrivers } from '../src/engine/modules/thermoforming.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry; outcome: { total?: number } }>;
const geoOf = (p: string) => structuredClone(baseline.find(b => b.part === p)!.geometry);
const LID = 'TF_Battery_Box_Lid.stp', COVER = 'TF_Trim_Cover.stp';
const ans = (resin: string) => ({ 'material.family': 'plastic', [RESIN_DECISION_ID]: resin, 'commodity.route': 'thermoforming' });
const ctx = (part: string, resin: string, annualVolume = 5_000): RuleContext => ({
  geo: geoOf(part), geometryQuality: 'occt', commodity: 'thermoforming', commoditySource: 'engineer', annualVolume,
  filename: part, answers: ans(resin),
} as RuleContext);
const tf = (part: string, resin: string, v = 5_000) => {
  const r = runCostInputRules(THERMOFORMING_RULES, ctx(part, resin, v));
  return { r, s: r.suggestions.thermoforming as Record<string, number | string | boolean> };
};
const headless = async (part: string, resin: string, v: number) =>
  await costMeasuredPart(geoOf(part), part, { partNumber: part, file: part, annualVolume: v, commodity: 'thermoforming' } as never,
    ans(resin), 'UK', { annualVolume: v } as never, recomputeMachineRates(DEFAULT_RATE_LIBRARY),
    { partNumber: part, file: part, status: 'error' } as never) as { status: string; total: number; error?: string };

describe('1. the sheet the part came from: plan area, then mass balance', () => {
  it('the plan is the largest silhouette — whatever the kernel\'s draw says (it was the cover\'s SIDE, 139 cm², not 600)', () => {
    // Since the two-half release test (Oct 2026) the pull search finds the cover's real draw, so "along draw" IS the
    // plan now; the rule must not depend on that — a side-on draw is still read as the largest silhouette.
    const g = geoOf(COVER);
    expect(g.projectedArea!.alongDrawMm2! / 100).toBeGreaterThan(580);
    expect(planAreaCm2(ctx(COVER, 'mat-abs-tf'))!.cm2).toBeGreaterThan(580);
    const side = structuredClone(g);
    side.projectedArea!.alongDrawMm2 = 13_900;
    expect(planAreaCm2({ ...ctx(COVER, 'mat-abs-tf'), geo: side })!.cm2).toBeGreaterThan(580);
  });
  it('gauge = part volume ÷ plan: the lid needs 9.4 mm (the draw formula bought 7.5 mm, less than the part weighs)', () => {
    expect(tf(LID, 'mat-hdpe-tf').s.sheetThicknessMm).toBeCloseTo(9.41, 1);
    expect(tf(COVER, 'mat-abs-tf').s.sheetThicknessMm).toBeCloseTo(4.08, 1);
  });
  it('the sheet always outweighs the parts on it', () => {
    for (const [p, m] of [[LID, 'mat-hdpe-tf'], [COVER, 'mat-abs-tf']] as const) {
      const s = tf(p, m).s as Record<string, number>;
      expect(s.sheetWeightKg).toBeGreaterThan(s.partWeightKg * s.partsPerSheet);
    }
  });
});

describe('2. headless costs a thermoforming at all', () => {
  it('both parts cost (all failed: "materialUtilization must be in (0, 1]")', async () => {
    expect((await headless(COVER, 'mat-abs-tf', 5_000)).total).toBeCloseTo(5.07, 2);
    expect((await headless(LID, 'mat-hdpe-tf', 5_000)).total).toBeCloseTo(23.64, 2);
  });
  it('parts per sheet is the nest, not sheet ÷ part (which charged no web)', () => {
    const c = ctx(COVER, 'mat-abs-tf', 50_000);
    const { analysis } = buildDeterministicAnalysis(THERMOFORMING_RULES, c, 'cover');
    const p = toCostParams('thermoforming', analysis.costInputSuggestions as never, 50_000, 'plastic', c.geo)!.params as Record<string, number>;
    expect(p.partsPerSheet).toBe(4);
    expect(p.partWeightKg * p.partsPerSheet / p.sheetWeightKg).toBeLessThan(0.7);
  });
});

describe('3. nesting on the machine sheet', () => {
  it('one up below 10,000/yr; 4 covers on the small former at 50,000/yr', () => {
    expect(nestOnSheet(300, 200, 47, TF_MACHINES['thermoform-small'].windowMm, 5_000).n).toBe(1);
    expect(nestOnSheet(300, 200, 47, TF_MACHINES['thermoform-small'].windowMm, 50_000).n).toBe(4);
  });
});

describe('4. the screen fields carry what they say', () => {
  it('index time is a time (the draw ratio was written into it) and electricity is £/kWh (kWh/kg was)', () => {
    const r = tf(COVER, 'mat-abs-tf').r;
    expect(r.provenance['tf-index'].ruleId).toBe('thermoforming.indexTimeSec');
    // No tariff rule any more: copying the tariff into tf-kwh fixed it at the analysis
    // country. The forming kWh are priced by the core in the costing country (module-energy.ts).
    expect(r.provenance['tf-kwh']).toBeUndefined();
    expect(THERMOFORMING_RULES.rules.find(x => x.id === 'thermoforming.drawRatio')!.fieldId).toBeUndefined();
  });
  it('parts per sheet, machine, crew, OEE, scrap, tool cooling and trim are set (the screen kept 4 up, its defaults)', () => {
    const ids = Object.keys(tf(COVER, 'mat-abs-tf').r.provenance);
    for (const f of ['tf-pps', 'tf-mach', 'tf-manning', 'tf-oee', 'tf-lab-eff', 'tf-reject', 'tf-tool-cool', 'tf-trim-mach', 'tf-rotary']) {
      expect(ids).toContain(f);
    }
  });
});

describe('5. the cycle and the trim', () => {
  it('a rotary former is paced by its slowest station (the lid: oven 433 s, not 433 + 265 + 20)', () => {
    const s = tf(LID, 'mat-hdpe-tf').s;
    expect(s.machineId).toBe('thermoform-large');
    expect(s.rotaryIndex).toBe(true);
    const d = computeThermoformingDrivers({
      materialId: 'mat-hdpe-tf', sheetWeightKg: 6.26, partsPerSheet: 1, partWeightKg: 4.83, machineId: 'thermoform-large',
      labourId: 'lab-uk-thermoform', heatTimeSec: 433, formTimeSec: 6, coolTimeSec: 259, trimTimeSec: 56, indexTimeSec: 20,
      oee: 0.8, manning: 1, labourEfficiency: 0.92, toolCost: 11_331, amortizationVolume: 5_000,
      rotary: true, trimMachineId: 'thermoform-trim-router',
    });
    expect(d.operations[0].cycleTimeHr).toBeCloseTo(438 / 3600, 8);
    expect(d.operations[1]).toMatchObject({ machineId: 'thermoform-trim-router', cycleTimeHr: 56 / 3600, partsPerCycle: 1 });
  });
});

describe('6. the material is formable sheet', () => {
  it('the menu is the library\'s sheet grades (it offered pellets)', () => {
    const q = resinFacts({ ...ctx(COVER, 'x'), answers: {} } as RuleContext).decision!;
    expect(q.options.every(o => o.value.endsWith('-tf'))).toBe(true);
  });
});

describe('7. a formed part named as one is asked, not pressed', () => {
  it('the name reader knows the forming processes and polymers', () => {
    expect(processFromNames([{ text: 'TRIM COVER ABS VACUUM FORMED', where: 'STEP product' }] as never).route).toBe('thermoforming');
    expect(polymerFromNames([{ text: 'BATTERY BOX LID HDPE', where: 'STEP product' }] as never)!.word).toBe('HDPE');
  });
  it('both parts are offered thermoforming, leaning on it (both went to sheet metal without a question)', () => {
    for (const p of [LID, COVER]) {
      const r = inferCommodity({ geo: geoOf(p), geometryQuality: 'occt', annualVolume: 5_000, filename: p, answers: {} } as never) as
        { decision: { options: Array<{ value: string; leaning?: boolean }> } };
      expect(r.decision.options.find(o => o.leaning)!.value).toBe('thermoforming');
    }
  });
});

describe('8. baseline', () => {
  it('records both at 50,000/yr', () => {
    expect(baseline.find(b => b.part === LID)!.outcome.total).toBe(21.17);
    expect(baseline.find(b => b.part === COVER)!.outcome.total).toBe(2.48);
  });
});
