/**
 * Savings-ranked opportunity view.
 *
 * The engineering-facing requirement behind this module: present the SAME
 * deterministic findings without grading the design. So the contract is
 *   1. everything is ranked on money per part, biggest first;
 *   2. nothing carries a score or a severity;
 *   3. a lever and a rule finding that fire on the same cost signal appear
 *      ONCE — otherwise the same saving is counted twice in the same category;
 *   4. zero-saving findings are separated out as inputs to confirm, never
 *      presented as a shortfall.
 */
import { describe, it, expect } from 'vitest';
import { generateDFMDFA } from '../src/engine/dfm-dfa.js';
import { rankOpportunities, CATEGORY_LABELS } from '../src/engine/opportunity-ranking.js';
import type { PartCostResult, UniversalStackInput, CommodityType } from '../src/engine/types.js';

const op = (operationName: string, over: Record<string, unknown> = {}) =>
  ({ operationName, machineId: 'mach-vmc3', cycleTimeHr: 0.05, partsPerCycle: 1, oee: 0.85,
     manning: 1, labourTimeHr: 0.05, labourEfficiency: 0.9, labourId: 'lab-uk-skilled', ...over });

const result = (
  over: Partial<PartCostResult['breakdown']> = {},
  operationDetails: Array<{ operationName: string; processCost: number; labourCost: number }> = [],
  total = 100,
): PartCostResult => ({
  total,
  breakdown: {
    rawMaterial: 30, process: 30, labour: 15, tooling: 8,
    packaging: 2, logistics: 3, overhead: 8, margin: 4, ...over,
  },
  operationDetails,
} as unknown as PartCostResult);

const input = (ops: ReturnType<typeof op>[], over: Record<string, unknown> = {}): UniversalStackInput => ({
  operations: ops,
  rawMaterial: { materialUtilization: 0.75 },
  tooling: { amortizationVolume: 100_000, totalToolingCost: 40_000 },
  overheadPct: 0.09,
  ...over,
} as unknown as UniversalStackInput);

const rank = (r: PartCostResult, i: UniversalStackInput, c: CommodityType, ctx?: object) =>
  rankOpportunities(generateDFMDFA(r, i, c, ctx as never), r.total);

const RICH = () => rank(
  result(
    { rawMaterial: 44, process: 26, labour: 11, tooling: 13, packaging: 5, logistics: 7, overhead: 16, margin: 13 },
    [
      { operationName: 'HPDC Casting', processCost: 25, labourCost: 4 },
      { operationName: 'CNC Machining', processCost: 10, labourCost: 3 },
      { operationName: 'Deburr + Polish', processCost: 1, labourCost: 2 },
      { operationName: 'Final Inspection', processCost: 2, labourCost: 2 },
    ],
    140,
  ),
  input([op('HPDC Casting'), op('CNC Machining'), op('Deburr + Polish'), op('Final Inspection')],
    { rawMaterial: { materialUtilization: 0.7, consumablesCostPerPart: 12 } }),
  'casting', { region: 'UK', volumeProvided: true });

describe('ranking — money per part, biggest first', () => {
  it('ranks every opportunity by saving per part, descending', () => {
    const r = RICH();
    const savings = r.all.map(o => o.savingPerPart);
    expect(savings).toEqual([...savings].sort((a, b) => b - a));
    expect(r.all.length).toBeGreaterThan(4);
  });

  it('saving per part is the part total times the percentage', () => {
    const r = RICH();
    for (const o of r.all) {
      expect(o.savingPerPart).toBeCloseTo((r.partTotal * o.savingPct) / 100, 6);
    }
  });

  it('groups are ordered by their single biggest opportunity, and each group is internally ranked', () => {
    const r = RICH();
    const tops = r.groups.map(g => g.topSavingPerPart);
    expect(tops).toEqual([...tops].sort((a, b) => b - a));
    for (const g of r.groups) {
      const s = g.opportunities.map(o => o.savingPerPart);
      expect(s).toEqual([...s].sort((a, b) => b - a));
      expect(g.topSavingPerPart).toBe(s[0]);
      expect(g.label).toBe(CATEGORY_LABELS[g.category]);
    }
  });

  it('covers several categories on a rich part', () => {
    expect(RICH().groups.length).toBeGreaterThanOrEqual(4);
  });

  it('every group opportunity also appears exactly once in the flat list', () => {
    const r = RICH();
    const grouped = r.groups.flatMap(g => g.opportunities);
    expect(grouped.length).toBe(r.all.length);
    expect(new Set(grouped).size).toBe(r.all.length);
  });
});

describe('no double counting', () => {
  it('a rule finding folds into the lever that already covers its cost signal', () => {
    // Utilisation at 55% fires BOTH the "Low material utilisation" DFM rule and
    // the near-net-shape lever. Only the lever — the action — may survive.
    const r = rank(result({ rawMaterial: 45 }),
      input([op('Milling')], { rawMaterial: { materialUtilization: 0.55 } }), 'machining');
    const matUtil = r.all.filter(o => o.signal === 'mat-util');
    expect(matUtil.length).toBeGreaterThan(0);
    // Every surviving row on this signal is lever-sourced (levers carry detail).
    expect(matUtil.every(o => Boolean(o.detail))).toBe(true);
    expect(matUtil.some(o => /near-net-shape/i.test(o.action))).toBe(true);
    // …and the rule's own observation text is nowhere in the ranked list.
    expect(r.all.some(o => /^Improve nesting\/billet size/.test(o.action))).toBe(false);
  });

  it('distinct levers on one signal both survive — four tooling actions are four rows', () => {
    // Deduplication exists to stop a finding echoing a lever, never to collapse
    // separately-authored levers into one.
    const r = rank(result({ tooling: 35, process: 15 }),
      input([op('Injection Moulding')], { tooling: { amortizationVolume: 8_000, totalToolingCost: 60_000 } }),
      'injection_moulding');
    const tooling = r.groups.find(g => g.category === 'tooling');
    expect(tooling).toBeDefined();
    const titles = tooling!.opportunities.map(o => o.action);
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles.length).toBeGreaterThanOrEqual(2);
  });
});

describe('zero-saving findings are checks, not shortfalls', () => {
  it('the amortisation-basis check lands in verificationChecks, never in the ranking', () => {
    const r = rank(result(), input([op('Milling')], {
      annualVolume: 200_000,
      tooling: { amortizationVolume: 60_000, totalToolingCost: 40_000 },
    }), 'machining');
    expect(r.verificationChecks.some(v => /amortised over less than the annual volume/i.test(v.title))).toBe(true);
    expect(r.all.every(o => o.savingPerPart > 0)).toBe(true);
  });

  it('a verified "already consolidated" routing is a check, not a criticism', () => {
    const consolidated = [
      op('Milling — +Z', { machineId: 'mach-vmc5' }), op('Milling — -Z', { machineId: 'mach-vmc5' }),
      op('Milling — +X', { machineId: 'mach-vmc5' }), op('Milling — -X', { machineId: 'mach-vmc5' }),
      op('Drilling', { machineId: 'mach-vmc5' }),
    ];
    const r = rank(result(), input(consolidated), 'machining');
    expect(r.verificationChecks.some(v => /already consolidated/i.test(v.title))).toBe(true);
  });
});

describe('nothing grades the design', () => {
  it('no opportunity or check carries a score or a severity word', () => {
    const r = RICH();
    const text = JSON.stringify([...r.all, ...r.verificationChecks]);
    expect(text).not.toMatch(/\bcritical\b/i);
    expect(text).not.toMatch(/\bseverity\b/i);
    expect(text).not.toMatch(/\/10\b/);
    for (const o of r.all) {
      expect(o).not.toHaveProperty('severity');
      expect(o).not.toHaveProperty('score');
    }
  });

  it('the action is imperative — it says what to do, not what is wrong', () => {
    // Rule-sourced rows take their action from the recommendation, never from
    // the observation title (the title becomes the supporting basis instead).
    const r = rank(result({ labour: 20 }),
      input([op('Moulding + hand-finish', { cycleTimeHr: 0.03, labourTimeHr: 0.06 })]), 'injection_moulding');
    const fromRule = r.all.find(o => /offline|parallel/i.test(o.action));
    expect(fromRule).toBeDefined();
    expect(fromRule!.basis).toContain('Labour time exceeds the machine cycle');
  });
});

describe('headline maths is unchanged', () => {
  it('keeps the engine root-sum-square headline, and never the sum of the list', () => {
    const r = RICH();
    const sum = r.all.reduce((s, o) => s + o.savingPct, 0);
    expect(r.headlineSavingPct).toBeLessThan(sum);
    expect(r.headlineSavingPct).toBeLessThanOrEqual(40);
    expect(r.headlineSavingPerPart).toBeCloseTo((r.partTotal * r.headlineSavingPct) / 100, 6);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(RICH())).toBe(JSON.stringify(RICH()));
  });

  it('survives a zero-total costing without producing NaN', () => {
    const r = rank(result({}, [], 0), input([op('Milling')]), 'machining');
    expect(r.all.every(o => Number.isFinite(o.savingPerPart))).toBe(true);
    expect(Number.isFinite(r.headlineSavingPerPart)).toBe(true);
  });
});
