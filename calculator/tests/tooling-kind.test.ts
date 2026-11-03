/**
 * Tooling the way it is contracted (report standard, Nov 2026, register #9; director #28, cost engineer #13 / #54,
 * manufacturing #3 / #15 / #110).
 *
 * Every tooling item says what KIND of money it is — the first set a supplier invoices (initial), the sets bought
 * because the first wears out (replacement), cutting tools worn by every part (perishable), or one-off fixtures and
 * programming (nre) — and the items add up to the total the costing amortises, exactly as before: no £ moves. The
 * stub axle's "£731,491 tooling" is £25,891 up front and £705,600 of replacement pattern sets; the gear's £625,512 is
 * £18,500 up front and £607,012 of hob and wheel wear. The route comparison's payback is on the up-front tooling only.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import { crossovers, type RouteRow } from '../server/services/route-compare.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { BASELINE } from '../scripts/real-parts-baseline.js';
import { toolSetItems, toolingSplit } from '../src/engine/tooling-split.js';
import { computeGearDrivers } from '../src/engine/modules/gear.js';
import type { ToolingInput } from '../src/engine/types.js';

process.env.AIR_GAPPED = '1';
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);

describe('toolSetItems — a tool bought by life is its first set plus the replacements', () => {
  it('65 sets → the first set up front, 64 replacements; they add to set × sets', () => {
    const items = toolSetItems('Pattern equipment', 11_025, 65, 'life 16,000 castings each');
    expect(items).toEqual([
      { label: 'Pattern equipment — first set', gbp: 11_025, kind: 'initial', firstSetGbp: 11_025, sets: 1 },
      { label: 'Pattern equipment — 64 replacement sets as it wears out (65 sets over the programme; life 16,000 castings each)',
        gbp: 11_025 * 64, kind: 'replacement', firstSetGbp: 11_025, sets: 64 },
    ]);
  });
  it('fractional wear: 1.28 sets → 1 up front + 0.28 of a set worn out', () => {
    const items = toolSetItems('Forging die set', 29_000, 1.28);
    expect(items.map(i => i.kind)).toEqual(['initial', 'replacement']);
    expect(items[0].gbp).toBe(29_000);
    expect(items[1].sets).toBeCloseTo(0.28, 12);
    expect(items[0].gbp + items[1].gbp).toBeCloseTo(29_000 * 1.28, 9);
    expect(items[1].label).toMatch(/^Forging die set — 0\.28 replacement sets as it wears out \(1\.28 sets over the programme\)$/);
  });
  it('one set (or less) is all up front, with no "first set" wording', () => {
    expect(toolSetItems('Extrusion die', 7_488, 1)).toEqual([{ label: 'Extrusion die', gbp: 7_488, kind: 'initial', firstSetGbp: 7_488, sets: 1 }]);
    expect(toolSetItems('Die', 1_000, 0.5)).toEqual([{ label: 'Die', gbp: 500, kind: 'initial', firstSetGbp: 1_000, sets: 0.5 }]);
  });
});

describe('toolingSplit — the total by kind', () => {
  it('sums the kinds; up front = initial + nre; running = replacement + perishable', () => {
    const t: ToolingInput = { totalToolingCost: 1_000, amortizationVolume: 1, mode: 'amortized', items: [
      { label: 'a', gbp: 100, kind: 'initial' }, { label: 'b', gbp: 600, kind: 'replacement' },
      { label: 'c', gbp: 200, kind: 'perishable' }, { label: 'd', gbp: 100, kind: 'nre' }] };
    expect(toolingSplit(t)).toEqual({ initial: 100, nre: 100, replacement: 600, perishable: 200, unclassified: 0, upFront: 200, running: 800, total: 1_000 });
  });
  it('an item without a kind, or a total the items do not cover, is read as up front (the old single figure)', () => {
    expect(toolingSplit({ totalToolingCost: 500, items: [{ label: 'x', gbp: 100 }] })).toMatchObject({ unclassified: 500, upFront: 500, running: 0 });
    expect(toolingSplit({ totalToolingCost: 500 })).toMatchObject({ unclassified: 500, upFront: 500 });
  });
});

// The real parts, costed by the product's own headless chain at the 7-country review's basis (200,000 a year, 5 years).
const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Array<{ part: string; geometry: never; answers: Record<string, string>; commodity?: string }>;
async function cost(b: (typeof base)[number]) {
  return costMeasuredPart(b.geometry, b.part,
    { partNumber: b.part, file: b.part, annualVolume: 200_000, ...(b.commodity ? { commodity: b.commodity } : {}) } as never,
    b.answers, 'UK', { annualVolume: 200_000, programmeYears: 5 }, book, { partNumber: b.part, file: b.part, status: 'error' } as never);
}

describe('every real part: each tooling item has a kind and the items add up to the total', () => {
  it.each(base.map(b => ({ part: b.part, b })))('$part', async ({ b }) => {
    const r = await cost(b);
    if (r.status !== 'costed') return;
    const t = r.trace!.stackInput!.tooling;
    const items = t.items ?? [];
    if (t.totalToolingCost > 0) expect(items.length, `${b.part}: tooling £${t.totalToolingCost} with no items`).toBeGreaterThan(0);
    for (const i of items) expect(i.kind, `${b.part}: "${i.label}" has no kind`).toBeDefined();
    const sum = items.reduce((a, i) => a + i.gbp, 0);
    expect(Math.abs(sum - t.totalToolingCost), `${b.part}: items £${sum} v total £${t.totalToolingCost}`)
      .toBeLessThanOrEqual(1e-9 * Math.max(1, t.totalToolingCost));
    // a first set is one set of the tool: its £ is the set price
    for (const i of items.filter(x => x.kind === 'initial' && x.sets === 1 && x.firstSetGbp != null)) expect(i.gbp).toBe(i.firstSetGbp);
    // a replacement line never carries the first set: it is (sets) × the set price
    for (const i of items.filter(x => x.kind === 'replacement' && x.firstSetGbp != null && x.sets != null)) {
      expect(i.gbp).toBeCloseTo(i.firstSetGbp! * i.sets!, 4);
    }
    const s = toolingSplit(t);
    expect(s.unclassified).toBe(0);
    expect(s.upFront + s.running).toBeCloseTo(t.totalToolingCost, 6);
  }, 60_000);
});

describe('the reviewers\' cases', () => {
  it('stub axle: up front = the first pattern set + fixtures + CNC programming; the other pattern sets are replacements', async () => {
    const r = await cost(base.find(b => b.part === 'PRCR002.stp')!);
    const t = r.trace!.stackInput!.tooling;
    const pattern = t.items!.filter(i => /^Pattern equipment/.test(i.label));
    const set = pattern[0].firstSetGbp!;
    const sets = 1 + (pattern[1]?.sets ?? 0);
    expect(pattern.map(i => i.kind)).toEqual(sets > 1 ? ['initial', 'replacement'] : ['initial']);
    const fixtures = t.items!.filter(i => i.kind === 'nre').reduce((a, i) => a + i.gbp, 0);
    const s = toolingSplit(t);
    expect(s.upFront).toBeCloseTo(set + fixtures, 6);
    expect(s.replacement).toBeCloseTo(set * (sets - 1), 6);
    expect(s.perishable).toBe(0);
  }, 60_000);

  it('gear: hob and wheel wear are perishable (a running cost), fixture / programming / master are NRE', async () => {
    const r = await cost(base.find(b => b.part === 'test-gear-m3-z38.step')!);
    const t = r.trace!.stackInput!.tooling;
    expect(t.items!.map(i => [i.label.split(':')[0], i.kind])).toEqual([
      ['Hob wear', 'perishable'], ['Grinding wheel wear', 'perishable'],
      ['Dedicated fixture', 'nre'], ['Programming & first article', 'nre'], ['Inspection master', 'nre'],
    ]);
    const s = toolingSplit(t);
    expect(s.initial).toBe(0);
    expect(s.upFront).toBe(t.items!.slice(2).reduce((a, i) => a + i.gbp, 0));
    expect(s.perishable).toBeGreaterThan(20 * s.upFront);
  }, 60_000);

  it('a broach is a dedicated tool bought up front (initial), not NRE and not perishable', () => {
    // the internal ring gear the gear audit routes to broaching above 250k/yr (tests/gear-audit-fixes.test.ts)
    const d = computeGearDrivers({
      normalModuleMm: 2.5, teeth: 78, helixAngleDeg: 0, faceWidthMm: 22, internal: true, qualityClass: 6,
      materialClass: 'case_hardening_steel', caseHardened: true, blankCostPerPart: 3.20, netWeightKg: 0.65,
      materialId: 'mat-steel-20mncr5', annualVolume: 400_000, amortizationVolume: 400_000, batchSize: 500, setupTimeHrPerOperation: 1.5,
    });
    const broach = d.tooling.items!.find(i => i.label === 'Broach')!;
    expect(broach).toMatchObject({ kind: 'initial', sets: 1 });
    expect(broach.firstSetGbp).toBe(broach.gbp);
    for (const i of d.tooling.items!) expect(i.kind).toBeDefined();
  });
});

describe('route comparison: the payback is on the up-front tooling; replacement and wear stay in the piece price', () => {
  const row = (route: string, total: number, pieceExTooling: number, investment: number, upFront: number): RouteRow => ({
    route, process: null, label: route, total,
    byVolume: [100_000, 200_000].map(volume => ({ volume, total, p10: null, p90: null, note: null })),
    programme: { parts: 1_000_000, years: 5, pieceExTooling, pieceSpend: 0, tooling: investment, total: 0 },
    tooling: { investment, amortisedOver: 1_000_000, items: [], split: { upFront, replacement: investment - upFront, perishable: 0, running: investment - upFront } },
  }) as unknown as RouteRow;

  it('die consumption is not paid back: a route cheaper only before its die wear shows no payback', () => {
    // ref: £10k up front, £3.00 a part with £1 of tooling through the stack. alt: £20k up front + £980k of replacement
    // dies, £1.50 a part before tooling but £3.46 with its die wear — dearer, so nothing is paid back. The old payback
    // read £990k of "investment" against a £0.50 saving: "paid back after 1,980,000 parts".
    const ref = row('a', 3, 2, 10_000, 10_000);
    const alt = row('b', 3.5, 1.5, 1_000_000, 20_000);
    expect(crossovers([ref, alt], ref, [100_000, 200_000], 200_000)[0].payback).toBeNull();
  });

  it('extra up-front £10k ÷ (piece saving with the running tooling in) = parts', () => {
    // alt: £40k tooling, half up front; £0.50 through the stack, half of it running → piece £1.50 + £0.25 = £1.75.
    const ref = row('a', 3, 2, 10_000, 10_000);
    const alt = row('b', 2, 1.5, 40_000, 20_000);
    const x = crossovers([ref, alt], ref, [100_000, 200_000], 200_000)[0];
    expect(x.payback).toEqual({ extraTooling: 10_000, pieceSaving: 0.25, parts: 40_000, months: 2.4 });
    expect(x.text).toMatch(/extra £10,000 of up-front tooling \(first sets, fixtures, programming\) is paid back by a £0\.2500 lower piece price \(tool replacement and wear included\) after 40,000 parts/);
  });
});
