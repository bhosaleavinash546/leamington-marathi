/**
 * The suggestion layer must not critique the tool's own choices.
 *
 * Four shipped defects pinned here:
 *  1. "Consolidate using multi-axis" fired on op COUNT alone — even when every
 *     op already ran on one 5-axis machine, and even against routings the tool
 *     itself chose. Now it is station-aware and flips to a 'verified' line.
 *  2. Synthetic ops (the amortised-setup pseudo-op, the casting pour) counted
 *     as machining operations — 2 of a real stub axle's "7 operations".
 *  3. "Source in China" recommended on a part costed in China.
 *  4. "Increase volume to dilute tooling" instructed when no volume was ever
 *     provided (it was a tool assumption).
 */
import { describe, it, expect } from 'vitest';
import { generateInsights, realMachiningStations } from '../src/engine/insights.js';
import { generateDFMDFA } from '../src/engine/dfm-dfa.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { PartCostResult, UniversalStackInput } from '../src/engine/types.js';

const op = (operationName: string, machineId: string) =>
  ({ operationName, machineId, cycleTimeHr: 0.05, partsPerCycle: 1, oee: 0.85,
     manning: 1, labourTimeHr: 0.05, labourEfficiency: 0.9, labourId: 'lab-uk-skilled' });

/** A cast+machine-ish part: high process share so the benchmark rules fire. */
const result = (over: Partial<PartCostResult['breakdown']> = {}): PartCostResult => ({
  total: 100,
  breakdown: {
    rawMaterial: 18, process: 48, labour: 15, tooling: 6,
    packaging: 1, logistics: 1, overhead: 7, margin: 4, ...over,
  },
  operationDetails: [],
} as unknown as PartCostResult);

const input = (ops: ReturnType<typeof op>[], amortizationVolume = 100_000): UniversalStackInput => ({
  operations: ops,
  rawMaterial: { materialUtilization: 0.75 },
  tooling: { amortizationVolume },
  overheadPct: 0.09,
} as unknown as UniversalStackInput);

const SPLIT_OPS = [
  op('Machining Setup (amortised)', 'mach-haas-vf2'),   // synthetic — must not count
  op('Sand Casting — Moulding', 'sand-cast-line'),      // synthetic — must not count
  op('Rough turn shaft/journal', 'mach-lathe-cnc'),
  op('Mill flange face, holes & boss', 'mach-vmc3'),
  op('Drill/tap 21 holes + threads', 'mach-drill'),
  op('5-axis finish cross-bore/undercuts', 'mach-haas-umc500'),
  op('Cylindrical Grinding — Bearing Journal', 'mach-grind'),
];

const CONSOLIDATED_OPS = [
  op('Machining Setup (amortised)', 'mach-vmc5'),
  op('Milling — +Z (40 faces)', 'mach-vmc5'),
  op('Milling — -Z (30 faces)', 'mach-vmc5'),
  op('Milling — +X (20 faces)', 'mach-vmc5'),
  op('Milling — -X (18 faces)', 'mach-vmc5'),
  op('Drilling — 10 holes', 'mach-vmc5'),
];

describe('realMachiningStations — synthetic ops excluded, consolidation recognised', () => {
  it('sees through the stub-axle routing: 5 real ops on 5 stations, 2 synthetic excluded', () => {
    const st = realMachiningStations(input(SPLIT_OPS));
    expect(st.opCount).toBe(5);
    expect(st.stations).toBe(5);
    expect(st.consolidated).toBe(false);
  });

  it('a 5-axis single-machine routing is consolidated', () => {
    const st = realMachiningStations(input(CONSOLIDATED_OPS));
    expect(st.stations).toBe(1);
    expect(st.fiveAxis).toBe(true);
    expect(st.consolidated).toBe(true);
  });
});

describe('generateInsights — no self-critique', () => {
  it('a genuinely split routing gets a supplier-lever consolidation insight', () => {
    const ins = generateInsights(result(), input(SPLIT_OPS), DEFAULT_RATE_LIBRARY, 'cast_and_machine');
    const hit = ins.find(i => i.title.includes('Split routing'));
    expect(hit).toBeDefined();
    expect(hit!.lever).toBe('supplier');
    expect(hit!.finding).toContain('5 separate stations');
  });

  it('a consolidated routing gets a VERIFIED line, never "use multi-axis"', () => {
    const ins = generateInsights(result(), input(CONSOLIDATED_OPS), DEFAULT_RATE_LIBRARY, 'machining');
    expect(ins.some(i => i.actions.some(a => /multi-axis \(4\/5-axis\) consolidation/i.test(a)))).toBe(false);
    const verified = ins.find(i => i.lever === 'verified');
    expect(verified).toBeDefined();
    expect(verified!.title).toContain('already consolidated');
    expect(verified!.potentialSavingPct).toBe(0);
  });

  it('does not recommend China to a part costed in China; still does with no context', () => {
    const base = result({ process: 40, labour: 25 });
    const withCtx = generateInsights(base, input(SPLIT_OPS), DEFAULT_RATE_LIBRARY, 'casting', { region: 'CN' });
    expect(withCtx.some(i => i.title.includes('Regional sourcing'))).toBe(false);
    const withoutCtx = generateInsights(base, input(SPLIT_OPS), DEFAULT_RATE_LIBRARY, 'casting');
    expect(withoutCtx.some(i => i.title.includes('Regional sourcing'))).toBe(true);
  });

  it('volume levers on an ASSUMED volume are downgraded to an assumption check', () => {
    const toolingHeavy = result({ tooling: 30, process: 25 });   // IM ceiling is 25%
    const ins = generateInsights(toolingHeavy, input(SPLIT_OPS), DEFAULT_RATE_LIBRARY, 'injection_moulding',
      { volumeProvided: false });
    const t = ins.find(i => i.category === 'tooling');
    expect(t).toBeDefined();
    expect(t!.lever).toBe('assumption');
    expect(t!.type).toBe('info');
    expect(t!.finding).toContain('tool assumption');
  });

  it('tool-estimated packaging/logistics is an assumption to confirm, not a saving', () => {
    const pkgHeavy = result({ packaging: 20, logistics: 23, process: 10, labour: 5 });
    const ins = generateInsights(pkgHeavy, input(SPLIT_OPS), DEFAULT_RATE_LIBRARY, 'sheet_metal',
      { pkgLogisticsEstimated: true });
    const p = ins.find(i => i.category === 'commercial');
    expect(p).toBeDefined();
    expect(p!.lever).toBe('assumption');
    expect(p!.title).toContain('estimates');
  });
});

describe('casting scope check — verify, never "add to the module"', () => {
  const CAST_OPS_BARE = [op('HPDC Casting', 'hpdc-800t'), op('CNC Machining', 'mach-vmc3')];
  const CAST_OPS_FINISHED = [...CAST_OPS_BARE.slice(0, 1), op('T6 Heat Treatment + Shot Blast', 'bench-assembly')];

  it('with no finishing ops: an assumption check pointing at the derivation trace', () => {
    const ins = generateInsights(result(), input(CAST_OPS_BARE), DEFAULT_RATE_LIBRARY, 'casting');
    const hit = ins.find(i => i.title.includes('post-casting scope'));
    expect(hit).toBeDefined();
    expect(hit!.lever).toBe('assumption');
    expect(hit!.actions.join(' ')).not.toContain('to Cast+Machine module');
  });

  it('stays silent when the operation list already carries the finishing ops', () => {
    const ins = generateInsights(result(), input(CAST_OPS_FINISHED), DEFAULT_RATE_LIBRARY, 'casting');
    expect(ins.some(i => i.title.includes('post-casting scope'))).toBe(false);
  });
});

describe('generateDFMDFA — same facts, one verdict', () => {
  it('cast_and_machine now scores the split routing in DFM too (was 10/10 vs DFA MAJOR)', () => {
    const r = generateDFMDFA(result(), input(SPLIT_OPS), 'cast_and_machine');
    expect(r.dfm.issues.some(i => i.title.includes('Split routing'))).toBe(true);
    expect(r.dfm.score).toBeLessThan(10);
  });

  it('consolidated routing: DFA reports a verified lever and §14 drops the multi-axis action', () => {
    const r = generateDFMDFA(result(), input(CONSOLIDATED_OPS), 'machining');
    expect(r.costOptimisations.some(o => o.title.includes('Multi-Axis Machining'))).toBe(false);
    const v = r.dfa.issues.find(i => i.lever === 'verified');
    expect(v).toBeDefined();
    expect(v!.severity).toBe('opportunity');   // no score deduction for a taken lever
  });

  it('§14 volume actions on an assumed volume become confirm-first, and the filler action drops', () => {
    const toolingHeavy = result({ tooling: 25, process: 30 });
    const r = generateDFMDFA(toolingHeavy, input(SPLIT_OPS), 'cast_and_machine', { volumeProvided: false });
    const vol = r.costOptimisations.find(o => o.title.includes('volume-sensitive'));
    expect(vol).toBeDefined();
    expect(vol!.title).toContain('confirm the annual volume');
    expect(r.costOptimisations.some(o => o.title.includes('Annual Volume Re-Commitment'))).toBe(false);
  });

  it('§14 regional-sourcing action is suppressed when already costed in a low-cost region', () => {
    const convHeavy = result({ process: 45, labour: 20 });
    const withCtx = generateDFMDFA(convHeavy, input(SPLIT_OPS), 'cast_and_machine', { region: 'CN' });
    expect(withCtx.costOptimisations.some(o => o.title.includes('Regional Sourcing'))).toBe(false);
    const withoutCtx = generateDFMDFA(convHeavy, input(SPLIT_OPS), 'cast_and_machine');
    expect(withoutCtx.costOptimisations.some(o => o.title.includes('Regional Sourcing'))).toBe(true);
  });

  it('split routing still earns the §14 multi-axis action, with station counts in the text', () => {
    const r = generateDFMDFA(result(), input(SPLIT_OPS), 'cast_and_machine');
    const act = r.costOptimisations.find(o => o.title.includes('Multi-Axis Machining'));
    expect(act).toBeDefined();
    expect(act!.description).toContain('5 stations');
  });
});
