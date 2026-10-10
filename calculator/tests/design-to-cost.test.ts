/**
 * Design to Cost (Oct 2026, docs/cad/dfm-cost-drivers-2026-10.md §DtC): the live target-v-should-cost tab.
 * Every figure is the costed input re-run through computeUniversalStack — these tests hold it to that: a lever
 * removes exactly its £ from the factory base, drivers add up to the piece price, "to hit target alone" re-costs
 * to the target, and the panel prints what the engine said (escaped).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { findingVariant, dfmLevers, costDrivers, projectDesignToCost, costsNotInStack, type DtcFindingLike } from '../src/engine/design-to-cost.js';
import { analyseGeometricDFM, restackFindingCosts, type ManufacturingFeature } from '../src/engine/dfm-geometry/index.js';
import { buildDtcPanel, computeDtc, freshDtcState, gapStatus, type DtcPanelModel } from '../src/ui/design-to-cost-panel.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const lib = DEFAULT_RATE_LIBRARY;
const OH = 0.12, MG = 0.08;
// Parts per cycle 2, OEE 0.8, half a crew — exactly the cases the old £ ÷ (machine + labour) conversion got wrong.
const input: UniversalStackInput = {
  partName: 'bracket',
  rawMaterial: { materialId: 'mat-al6061', netWeightKg: 0.5, materialUtilization: 0.65 },
  operations: [
    { operationName: 'Mill', machineId: 'mach-vmc3', labourId: 'lab-uk-skilled',
      cycleTimeHr: 0.12, partsPerCycle: 2, oee: 0.8, manning: 0.5, labourTimeHr: 0.12, labourEfficiency: 0.92 },
    { operationName: 'Deburr', machineId: 'mach-vmc3', labourId: 'lab-uk-skilled',
      cycleTimeHr: 0.02, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.02, labourEfficiency: 0.92 },
  ],
  tooling: { totalToolingCost: 15_000, amortizationVolume: 50_000, mode: 'amortized' },
  packagingPerPart: 0.15, logisticsPerPart: 0.25, overheadPct: OH, marginPct: MG, annualVolume: 50_000,
};
const base = computeUniversalStack(input, lib);
const holeFinding: DtcFindingLike = { ruleId: 'machining.hole.depth-beyond-standard-drill', title: 'Deep hole <b>', totalCostGBP: 0.3,
  faceIds: [4, 5], worst: { costImpact: { kind: 'feature_cost', confidence: 'modelled' } } };
const slideFinding: DtcFindingLike = { ruleId: 'moulding.undercut.requires-side-action', title: 'Undercut', totalCostGBP: 0.06,
  faceIds: [9], worst: { costImpact: { kind: 'tooling' } } };

describe('a design lever removes exactly its £ from the factory base', () => {
  it('feature cost: parts/cycle, OEE and crew are honoured — Δ factory base = the finding, Δ price = × (1+OH)(1+M)', () => {
    const v = findingVariant(holeFinding, input, lib)!;
    const after = computeUniversalStack(v.next, lib);
    const baseF = base.factoryCost - base.breakdown.packaging - base.breakdown.logistics;
    const afterF = after.factoryCost - after.breakdown.packaging - after.breakdown.logistics;
    expect(baseF - afterF).toBeCloseTo(0.3, 6);
    expect(base.total - after.total).toBeCloseTo(0.3 * (1 + OH) * (1 + MG), 6);
    expect(v.basis).toMatch(/off Mill/);              // the longest machine cycle carries the feature
  });
  it('tooling: the slide NRE comes off the tool, amortised back to the same £/part', () => {
    const [l] = dfmLevers([slideFinding], input, lib);
    expect(l.savingGBP).toBeCloseTo(0.06 * (1 + OH) * (1 + MG), 4);
    expect(l.basis).toMatch(/tooling NRE −£3000/);
  });
  it('a finding priced above its operation is capped at 90 % of the op, and says so', () => {
    const v = findingVariant({ ...holeFinding, totalCostGBP: 500 }, input, lib)!;
    expect(v.next.operations[0].cycleTimeHr).toBeCloseTo(0.012, 6);
    expect(v.basis).toMatch(/capped at 90 %/);
  });
  it('the DFM restack reads the same definition (one way to take a finding out)', () => {
    const [r] = restackFindingCosts([holeFinding as never], input, lib);
    const [l] = dfmLevers([holeFinding], input, lib);
    expect(r.stackGBP).toBeCloseTo(l.savingGBP, 4);
  });
  it('unpriced findings are not levers', () => {
    expect(dfmLevers([{ ruleId: 'casting.draft.insufficient', totalCostGBP: 0, worst: {} }], input, lib)).toEqual([]);
  });
});

describe('projection: levers on, what-ifs set', () => {
  it('two levers together = the stack re-run on both changes (overhead and margin follow)', () => {
    const levers = dfmLevers([holeFinding, slideFinding], input, lib);
    const p = projectDesignToCost(input, lib, levers);
    const manual = computeUniversalStack(levers[1].apply(levers[0].apply(input)), lib);
    expect(p.projected.total).toBeCloseTo(manual.total, 8);
    expect(p.savingGBP).toBeCloseTo((0.3 + 0.06) * (1 + OH) * (1 + MG), 4);
    expect(p.applied).toHaveLength(2);
  });
  it('mass what-if −20 % = the same part 20 % lighter', () => {
    const p = projectDesignToCost(input, lib, [], { massPct: -20 });
    const manual = computeUniversalStack({ ...input, rawMaterial: { ...input.rawMaterial, netWeightKg: 0.4 } }, lib);
    expect(p.projected.total).toBeCloseTo(manual.total, 8);
  });
  it('cycle what-if scales that op only; tooling volume ×2 halves the amortised tool', () => {
    const p = projectDesignToCost(input, lib, [], { cyclePct: { 0: -25 } });
    const ops = input.operations.map((o, i) => i === 0 ? { ...o, cycleTimeHr: 0.09, labourTimeHr: 0.09 } : o);
    expect(p.projected.total).toBeCloseTo(computeUniversalStack({ ...input, operations: ops }, lib).total, 8);
    const t = projectDesignToCost(input, lib, [], { toolingVolumeFactor: 2 });
    expect(base.breakdown.tooling - t.projected.breakdown.tooling).toBeCloseTo(base.breakdown.tooling / 2, 6);
  });
  it('gapClosed is the saving over the gap', () => {
    const levers = dfmLevers([holeFinding], input, lib);
    const target = base.total - 1;
    const p = projectDesignToCost(input, lib, levers, {}, target);
    expect(p.gapClosed).toBeCloseTo(p.savingGBP / 1, 6);
  });
});

describe('drivers: where the money is, and what each must fall to', () => {
  const drivers = costDrivers(input, lib, base.total * 0.9);
  it('drivers add up to the piece price (every bucket is one of them, overhead and margin spread on)', () => {
    const sum = drivers.reduce((a, d) => a + d.stackGBP, 0);
    expect(sum).toBeCloseTo(base.total, 3);
    expect(drivers[0].stackGBP).toBeGreaterThanOrEqual(drivers[drivers.length - 1].stackGBP);
  });
  it('"to hit target alone" re-costs to the target', () => {
    const target = base.total * 0.9;
    const m = drivers.find(d => d.id === 'material')!;
    if (typeof m.toTarget === 'object') {
      const p = projectDesignToCost(input, lib, [], { massPct: m.toTarget.pct }, target);
      expect(p.projected.total).toBeCloseTo(target, 2);
    } else {
      expect(m.toTarget).toBe('not-alone');
    }
    const mill = drivers.find(d => d.id === 'op:0')!;
    expect(typeof mill.toTarget).toBe('object');
    if (typeof mill.toTarget === 'object') {
      const p = projectDesignToCost(input, lib, [], { cyclePct: { 0: mill.toTarget.pct } }, target);
      expect(p.projected.total).toBeCloseTo(target, 2);
      expect(mill.toTarget.value).toBeCloseTo(0.12 * 3600 * (1 + mill.toTarget.pct / 100), 3);
    }
  });
  it('a gap bigger than the driver is "cannot close alone"; a target above the cost is "met"', () => {
    const small = costDrivers(input, lib, base.total * 0.3).find(d => d.id === 'packaging')!;
    expect(small.toTarget).toBe('not-alone');
    expect(costDrivers(input, lib, base.total * 2)[0].toTarget).toBe('met');
  });
});

describe('a real part: the hydraulic manifold\'s measured findings become levers', () => {
  const fx = JSON.parse(readFileSync('tests/fixtures/dfm/manifold-features.json', 'utf8'));
  const feats: ManufacturingFeature[] = fx.manufacturingFeatures.features;
  const mr = lib.machines.find(m => m.id === 'mach-vmc3')!.computedRatePerHr;
  const lr = lib.labour.find(l => l.id === 'lab-uk-skilled')!.fullyLoadedRatePerHr;
  const dfm = analyseGeometricDFM({
    commodity: 'machining',
    featureSet: fx.manufacturingFeatures,
    cost: { annualVolume: 50_000, machineRatePerHr: mr, labourRatePerHr: lr, engineerRatePerHr: 55 },
  });
  void feats;
  it('every priced finding is a lever; it saves its MINUTES at the costed operation\'s own rates, × (1+OH)(1+M)', () => {
    // arithmetic audit, Oct 2026: the job's £ is at reference rates; the lever must move the costing's own numbers
    const priced = dfm.grouped.filter(g => g.totalCostGBP > 0);
    expect(priced.length).toBeGreaterThan(0);
    const levers = dfmLevers(dfm.grouped as unknown as DtcFindingLike[], input, lib);
    expect(levers.length).toBe(priced.length);
    for (const l of levers) {
      if (l.basis.includes('capped')) continue;
      const g = dfm.grouped.find(x => `dfm:${x.ruleId}` === l.id)!;
      // the costing's minutes, once per feature
      const minutes = [...new Map(g.instances.filter(x => x.costImpact?.minutes)
        .map(x => [x.featureId, x.costImpact!.minutes!])).values()].reduce((a, b) => a + b, 0);
      const op = input.operations.find(o => /drill|bore|hole/i.test(o.operationName)) ?? input.operations[0];
      const rate = lib.machines.find(m => m.id === op.machineId)!.computedRatePerHr / op.partsPerCycle / op.oee
        + lib.labour.find(x => x.id === op.labourId)!.fullyLoadedRatePerHr * op.manning / op.partsPerCycle / op.labourEfficiency;
      expect(l.savingGBP).toBeCloseTo((minutes / 60) * rate * (1 + OH) * (1 + MG), 3);
    }
  });
});

describe('the panel prints what the engine said', () => {
  const money = (g: number) => `£${g.toFixed(g !== 0 && Math.abs(g) < 0.01 ? 4 : 2)}`;
  const model = (o: Partial<DtcPanelModel> = {}): DtcPanelModel => ({ input, library: lib, grouped: [holeFinding, slideFinding], targetGBP: base.total * 0.9, money, ...o });
  const render = (m: DtcPanelModel) => { const st = freshDtcState(m.input); const c = computeDtc(m, st); return buildDtcPanel(m, st, c.levers, c.drivers, c.proj); };
  it('lists the levers (escaped), the gap and the "to hit target" column', () => {
    const html = render(model());
    expect(html).toContain('Deep hole &lt;b&gt;');
    expect(html).not.toContain('Deep hole <b>');
    expect(html).toContain('data-dtc-lever="dfm:machining.hole.depth-beyond-standard-drill"');
    expect(html).toContain('Show 2 faces');
    expect(html).toMatch(/over target by \+11\.1 %/);
    expect(html).toContain('To hit target alone');
  });
  it('says why there are no design levers — never an empty table that reads as "nothing to do"', () => {
    expect(render(model({ grouped: null }))).toContain('No CAD analysis for this costing');
    expect(render(model({ grouped: [], dfmPending: true }))).toContain('still running');
    expect(render(model({ grouped: [] }))).toContain('none of its findings carries a modelled £');
  });
  it('without a target there is no gap and no "to hit target" column', () => {
    const html = render(model({ targetGBP: null }));
    expect(html).toContain('Set a target price');
    expect(html).not.toContain('To hit target alone');
  });
  it('gap bands follow the cost card: ±5 % is on target', () => {
    expect(gapStatus(104, 100)!.cls).toBe('ok');
    expect(gapStatus(110, 100)!.cls).toBe('over');
    expect(gapStatus(90, 100)!.cls).toBe('under');
    expect(gapStatus(90, null)).toBeNull();
  });
});

describe('drivers cover the whole material line', () => {
  it('consumables and bought-in content are drivers too — the drivers still add up to the headline', () => {
    const full: UniversalStackInput = { ...input, rawMaterial: { ...input.rawMaterial, consumablesCostPerPart: 0.42,
      consumablesItems: [{ label: 'tool wear', gbp: 0.3 }, { label: 'deburr media', gbp: 0.12 }], boughtIn: { cost: 1.5, handlingPct: 0.05 } } };
    const total = computeUniversalStack(full, lib).total;
    const d = costDrivers(full, lib);
    expect(d.map(x => x.id)).toEqual(expect.arrayContaining(['material', 'consumables', 'bought-in']));
    expect(d.reduce((a, x) => a + x.stackGBP, 0)).toBeCloseTo(total, 3);
    expect(d.find(x => x.id === 'consumables')!.label).toContain('tool wear');
  });
});

describe('independent review fixes (Oct 2026)', () => {
  const opFactory = (o: Partial<UniversalStackInput['operations'][number]>) => ({ ...input.operations[0], ...o });
  const factoryBase = (r: ReturnType<typeof computeUniversalStack>) => r.factoryCost - r.breakdown.packaging - r.breakdown.logistics;

  it('a slide comes off the tool at the NRE it was priced from — not × the stack\'s amortisation volume', () => {
    // priced over 50k a year → £0.06/part; the stack amortises over 250k: the old lever took off £15,000 for a £3,000 slide
    const amort = { ...input, tooling: { ...input.tooling, amortizationVolume: 250_000 } };
    const slide: DtcFindingLike = { ...slideFinding, worst: { costImpact: { kind: 'tooling', nreGBP: 3000 } },
      instances: [{ featureId: 'P9', costImpact: { perPartGBP: 0.06, kind: 'tooling', nreGBP: 3000, costGroup: 'slide:9' } }] };
    const [l] = dfmLevers([slide], amort, lib);
    expect(l.basis).toMatch(/tooling NRE −£3000/);
    const after = computeUniversalStack(l.apply(amort), lib);
    expect(computeUniversalStack(amort, lib).breakdown.tooling - after.breakdown.tooling).toBeCloseTo(3000 / 250_000, 6);
  });

  it('a tended op (labour time below the cycle) still gives up exactly the finding\'s £', () => {
    const tended = { ...input, operations: [opFactory({ cycleTimeHr: 0.12, labourTimeHr: 0.01 })] };
    // £0.50 — inside the op's 90 % cap at machine-only rates (UK rate book, Oct 2026: £1.00 now exceeds it and is capped)
    const f: DtcFindingLike = { ...holeFinding, totalCostGBP: 0.5 };
    const v = findingVariant(f, tended, lib)!;
    expect(factoryBase(computeUniversalStack(tended, lib)) - factoryBase(computeUniversalStack(v.next, lib))).toBeCloseTo(0.5, 6);
    expect(v.removedGBP).toBeCloseTo(0.5, 6);
  });

  it('one hole flagged by two rules comes out once when both levers are on', () => {
    const a: DtcFindingLike = { ruleId: 'machining.hole.depth-beyond-standard-drill', title: 'deep', totalCostGBP: 0.25, worst: { costImpact: { kind: 'feature_cost' } },
      instances: [{ featureId: 'H1', costImpact: { perPartGBP: 0.25, kind: 'feature_cost' } }] };
    const b: DtcFindingLike = { ruleId: 'machining.hole.other-rule-same-hole', title: 'other', totalCostGBP: 0.25, worst: { costImpact: { kind: 'feature_cost' } },
      instances: [{ featureId: 'H1', costImpact: { perPartGBP: 0.25, kind: 'feature_cost' } }] };
    const levers = dfmLevers([a, b], input, lib);
    expect(levers).toHaveLength(2);
    const both = projectDesignToCost(input, lib, levers);
    expect(factoryBase(both.base) - factoryBase(both.projected)).toBeCloseTo(0.25, 6);   // not 0.50
  });

  it('a hole the sheet prices as pierced but must drill is a cost to ADD, never a lever to take out', () => {
    const cored: DtcFindingLike = { ruleId: 'sheetmetal.hole.smaller-than-thickness', title: 'small hole', totalCostGBP: 0.3, worst: { costImpact: { kind: 'feature_cost' } } };
    expect(dfmLevers([cored], input, lib)).toHaveLength(0);
    expect(costsNotInStack([cored])).toEqual([expect.objectContaining({ gbp: 0.3 })]);
    expect(restackFindingCosts([cored as never], input, lib)).toEqual([]);
    const html = (() => { const m = { input, library: lib, grouped: [cored], targetGBP: null, money: (g: number) => `£${g.toFixed(2)}` };
      const st = freshDtcState(input); const c = computeDtc(m, st); return buildDtcPanel(m, st, c.levers, c.drivers, c.proj); })();
    expect(html).toContain('Not in the should-cost yet');
  });

  it('a whole-feature price is labelled an upper bound on the lever', () => {
    const [l] = dfmLevers([holeFinding], input, lib);
    expect(l.kind).toBe('upper-bound');
    expect(l.steps.some(x => /^Upper bound: /.test(x))).toBe(true);
    // the screen line is one plain sentence; the calculation sits behind "How is this calculated?"
    expect(l.summary).toMatch(/^\d+\.\d{2} min of \w+ off each part/);
    expect(l.summary.length).toBeLessThan(120);
    expect(l.summary).not.toMatch(/mach-|lab-uk|\[|reference/);
    const [s] = dfmLevers([{ ruleId: 'machining.setup.access-directions', title: 'setups', totalCostGBP: 0.2, worst: { costImpact: { kind: 'feature_cost' } } }], input, lib);
    expect(s.kind).toBe('redesign');
  });
});
