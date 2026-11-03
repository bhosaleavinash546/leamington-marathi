/**
 * The cost-reduction levers and insights, after the independent review of the exported reports (7 countries,
 * 200k / yr, 5 years, ex-works; 3 Nov 2026). Each block pins one finding against the real part that exposed it:
 *
 *  H4  lights-out re-costed the 4-man sand-moulding crew as if it were a cutting operation (£4.36 for a £3.46 lever)
 *  H5  "re-quote the machining" proposed a routing the router had ranked and rejected; a 20 % cap beside an uncapped £;
 *      a saving that was not the difference of the two printed figures; §11 "quote 5-axis" v §12 "5-axis does NOT win"
 *  H6  "grinding / honing / reaming content" was the foundry's fettling
 *  H7  "doubling volume halves per-part tooling" where tool life sets the tool count
 *  M6  three different utilisation references for one forging
 *  M7  a fixed "India ~67 % lower conversion" index printed on every part
 *  M19 levers that do not fit the part (fasteners on a forging, energy "in the machine rate", remelt alloy on steel,
 *      bought-out content that does not exist, a saw cut read as manual finishing, a normal material share CRITICAL)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { costMeasuredPart, regionalBook } from '../server/services/bulk-run.js';
import { generateDFMDFA } from '../src/engine/dfm-dfa.js';
import { generateInsights, realMachiningStations } from '../src/engine/insights.js';
import { machinePacedCut, generateIdeaLevers } from '../src/engine/idea-levers.js';
import {
  machiningRoutingVerdict, utilisationReference, toolingBoughtByLife, remeltableAlloy,
} from '../src/engine/suggestion-facts.js';
import { FORGING_PROCESS_REFERENCE } from '../src/engine/modules/forging-advisor.js';
import { optimiseMachiningRouting, standardBatchSize } from '../src/engine/routing-optimiser.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { PartCostResult, UniversalStackInput, CommodityType } from '../src/engine/types.js';
import type { ManufacturingRegion } from '../src/engine/regional-rates.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry }>;
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);

/** A real part costed headless as the reports were: 200k / yr, 5-year programme, ex-works, in `region`. */
async function costed(part: string, answers: Record<string, unknown>, region: ManufacturingRegion = 'UK') {
  const geo = structuredClone(baseline.find(b => b.part === part)!.geometry);
  const r = await costMeasuredPart(geo, part, { partNumber: part, file: part, annualVolume: 200_000 } as never, answers, region,
    { annualVolume: 200_000, programmeYears: 5, deliveryTerms: 'EXW' } as never, book,
    { partNumber: part, file: part, status: 'error' } as never) as unknown as {
      status: string; commodity: CommodityType; breakdown: Record<string, number>;
      trace: { drivers: { rawMaterial: never; operations: never; tooling: never } } };
  expect(r.status).toBe('costed');
  const lib = regionalBook(book, region, new Map());
  const d = r.trace.drivers;
  const input = { partName: part, rawMaterial: d.rawMaterial, operations: d.operations, tooling: d.tooling,
    annualVolume: 200_000, programmeYears: 5, packagingPerPart: r.breakdown.packaging, logisticsPerPart: r.breakdown.logistics,
    overheadPct: 0.12, marginPct: 0.08 } as unknown as UniversalStackInput;
  const result = computeUniversalStack(input, lib);
  const ctx = { region, volumeProvided: true, pkgLogisticsEstimated: false, library: lib };
  return { input, result, lib, commodity: r.commodity, ctx,
    dfm: generateDFMDFA(result, input, r.commodity, ctx),
    ins: generateInsights(result, input, lib, r.commodity, ctx) };
}

const STUB_ANSWERS = { 'commodity.route': 'cast_and_machine', 'material.family': 'cast iron', 'service.pressureTight': 'no',
  'service.toleranceClass': 'standard', 'service.safetyCritical': 'yes' };

type Costed = Awaited<ReturnType<typeof costed>>;
let stubUK: Costed;
let stubCN: Costed;
beforeAll(async () => {
  stubUK = await costed('PRCR002.stp', STUB_ANSWERS, 'UK');
  stubCN = await costed('PRCR002.stp', STUB_ANSWERS, 'CN');
}, 120_000);

// ─── H4 ──────────────────────────────────────────────────────────────────────

describe('H4 — lights-out acts on the cutting operations only', () => {
  it('the sand moulding line, its crew, the melt shop, fettling, set-up, loading and bench are not machine-paced cuts', () => {
    const ops = stubUK.input.operations;
    const cut = ops.filter(machinePacedCut).map(o => o.operationName);
    expect(cut.some(n => /moulding/i.test(n))).toBe(false);
    expect(cut.some(n => /melt|fettl|set-?up|load|pallet change|deburr/i.test(n))).toBe(false);
    expect(cut.some(n => /^Finish machining/.test(n))).toBe(true);
    expect(cut.some(n => /^Drilling/.test(n))).toBe(true);
    expect(cut.some(n => /^Turning/.test(n))).toBe(true);
  });

  it('the re-costed £ is the stack re-run with manning ×0.6 on the cutting ops alone — not with the moulding crew', () => {
    const { input, result, lib, dfm } = stubUK;
    const lever = dfm.costOptimisations.find(o => o.title === 'Unmanned / Lights-Out Running');
    expect(lever).toBeDefined();
    expect(lever!.savingBasis).toBe('recosted');
    const base = computeUniversalStack(input, lib).total;
    const thin = (pred: (o: UniversalStackInput['operations'][number]) => boolean) => base - computeUniversalStack({
      ...input, operations: input.operations.map(o => pred(o) ? { ...o, manning: Math.max(0.3, (o.manning ?? 1) * 0.6) } : o),
    }, lib).total;
    const cuttingOnly = thin(machinePacedCut);
    const withMoulding = thin(o => machinePacedCut(o) || /moulding/i.test(o.operationName));
    expect(lever!.savingGBP!).toBeCloseTo(cuttingOnly, 3);
    expect(withMoulding - cuttingOnly).toBeGreaterThan(0.5);   // the crew of 4 was worth ~£0.9 of the old £4.36
    // and the text quotes the cutting ops' labour, not the whole labour bucket (34.1 % on the report)
    const labPct = result.breakdown.labour / result.total * 100;
    expect(lever!.description).not.toContain(`Labour is ${labPct.toFixed(1)}%`);
    expect(lever!.description).toMatch(/cutting operations is \d/);
  });
});

// ─── H5 ──────────────────────────────────────────────────────────────────────

describe('H5 — no routing lever against the router; printed figures subtract; no capped %', () => {
  it('the stub axle the router put on the volume cell gets no "re-quote" lever and no "quote 5-axis" action (UK and CN)', () => {
    for (const c of [stubUK, stubCN]) {
      const text = JSON.stringify([c.dfm, c.ins]);
      expect(text).not.toMatch(/Re-quote Machining on the Cost-Optimal Routing/);
      expect(text).not.toMatch(/Quote a multi-axis/i);
      expect(text).not.toMatch(/machine-mix saving/);
    }
  });

  it('the fettling bench is not a machining station, and the 4th-axis HMC cell is a multi-axis consolidation', () => {
    const st = realMachiningStations(stubUK.input);
    expect(st.stations).toBe(2);              // HMC cell + lathe (was 3: the fettling bench read as "grind")
    expect(st.consolidated).toBe(true);
  });

  it('CN: the split routing the router chose is reported as the cost-ranked choice', () => {
    const v = machiningRoutingVerdict(stubCN.input, 'cast_and_machine', stubCN.lib);
    expect(v).not.toBeNull();
    expect(v!.alreadyChosen).toBe(true);
    expect(stubCN.ins.some(i => i.lever === 'verified' && /cost-ranked|consolidated/.test(i.title))).toBe(true);
  });

  const op = (operationName: string, machineId: string, cycleTimeHr = 0.05) =>
    ({ operationName, machineId, cycleTimeHr, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: cycleTimeHr,
       labourEfficiency: 0.9, labourId: 'lab-uk-skilled' });
  const res = { total: 100, breakdown: { rawMaterial: 18, process: 48, labour: 15, tooling: 6, packaging: 1, logistics: 1,
    overhead: 7, margin: 4 }, operationDetails: [] } as unknown as PartCostResult;
  const inp = (ops: ReturnType<typeof op>[]) => ({ operations: ops, rawMaterial: { materialUtilization: 0.75 },
    tooling: { amortizationVolume: 100_000 }, overheadPct: 0.09 } as unknown as UniversalStackInput);

  it('a re-quote lever prints figures that subtract to the penny, and an uncapped % of them', () => {
    // Long cuts and the drilling on dear 5-axis centres: the cheapest split wins by well over 20 % (≈ 32 %).
    const ops = [
      op('Rough turn shaft', 'mach-lathe-cnc'),
      op('Mill flange face', 'mach-dmg-dmu50', 0.4), op('Mill side', 'mach-vmc5', 0.4),
      op('5-axis finish cross-bore', 'mach-haas-umc500', 0.4),
      op('Drill 12 holes', 'mach-dmg-dmu50', 0.3),
    ];
    const r = generateDFMDFA(res, inp(ops), 'cast_and_machine');
    const lever = r.costOptimisations.find(o => /Re-quote Machining|Multi-Axis Machining/.test(o.title));
    expect(lever).toBeDefined();
    const m = lever!.description.match(/£(\d+\.\d\d)\/part of machining.*?costs £(\d+\.\d\d) — a £(\d+\.\d\d)\/part \((\d+)% of that machining\)/);
    expect(m, lever!.description).not.toBeNull();
    const [given, best, saving, pct] = [Number(m![1]), Number(m![2]), Number(m![3]), Number(m![4])];
    expect(Math.round((given - best) * 100)).toBe(Math.round(saving * 100));
    expect(pct).toBe(Math.round(saving / given * 100));
    expect(pct).toBeGreaterThan(20);              // the old Math.min(20, …) printed 20 % here
    expect(lever!.description).toContain('does NOT win');
  });

  it('a split routing already on the router\'s cheapest machines is verified, not re-quoted, in every section', () => {
    // the routing the router itself chooses for split milling + drilling (machine + operator, as it ranks)
    const opt = optimiseMachiningRouting({ millingHr: 0.6, drillHr: 0.1, principalDirections: 3, axisymmetric: false,
      bboxSortedMm: null, batchSize: standardBatchSize(100_000) });
    expect(opt.chosen.label).toBe('split-3axis');
    const millId = opt.chosen.primaryMachineId;
    const drillId = opt.chosen.drillMachineId;
    const ops = [op('Turn journal', 'mach-lathe-cnc'), op('Mill face', millId, 0.2), op('Mill side', millId, 0.2),
      op('Mill top', millId, 0.2), op('Drill holes', drillId, 0.1)];
    const v = machiningRoutingVerdict(inp(ops), 'cast_and_machine')!;
    expect(v.alreadyChosen).toBe(true);
    const r = generateDFMDFA(res, inp(ops), 'cast_and_machine');
    const ins = generateInsights(res, inp(ops), book, 'cast_and_machine');
    const text = JSON.stringify([r, ins]);
    expect(text).not.toMatch(/Re-quote Machining|Quote a multi-axis|Quote multi-axis/i);
    expect(ins.some(i => i.lever === 'verified' && /cost-ranked/.test(i.title))).toBe(true);
  });
});

// ─── H6 ──────────────────────────────────────────────────────────────────────

describe('H6 — fettling is not tolerance-driven grinding', () => {
  it('the stub axle\'s "Fettling (gate / riser removal, grind)" does not make a grinding / honing / reaming finding', () => {
    expect(JSON.stringify(stubUK.dfm)).not.toMatch(/Grinding\/honing\/reaming content/);
  });
  it('a real grinding operation still does', () => {
    const res = { total: 100, breakdown: { rawMaterial: 30, process: 30, labour: 15, tooling: 8, packaging: 2, logistics: 3,
      overhead: 8, margin: 4 }, operationDetails: [{ operationName: 'Cylindrical Grinding — Bearing Journal', processCost: 4, labourCost: 2 }] } as unknown as PartCostResult;
    const input = { operations: [{ operationName: 'Cylindrical Grinding — Bearing Journal', machineId: 'mach-grind', cycleTimeHr: 0.05,
      partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.05, labourEfficiency: 0.9, labourId: 'lab-uk-skilled' }],
      rawMaterial: { materialUtilization: 0.9 }, tooling: { amortizationVolume: 100_000, totalToolingCost: 1000 }, overheadPct: 0.09 } as unknown as UniversalStackInput;
    const r = generateDFMDFA(res, input, 'machining');
    expect(r.costOptimisations.some(o => /Grinding\/honing\/reaming content is 6\.0%/.test(o.description))).toBe(true);
  });
});

// ─── H7 ──────────────────────────────────────────────────────────────────────

describe('H7 — "doubling volume halves the tooling" only for one fixed investment', () => {
  const res = (tooling: number) => ({ total: 100, breakdown: { rawMaterial: 30, process: 20, labour: 10, tooling, packaging: 2,
    logistics: 2, overhead: 8, margin: 4 }, operationDetails: [] } as unknown as PartCostResult);
  const inp = (items?: Array<{ label: string; gbp: number }>) => ({ operations: [{ operationName: 'Layup', machineId: 'x',
    cycleTimeHr: 0.1, partsPerCycle: 1, oee: 0.8, manning: 1, labourTimeHr: 0.1, labourEfficiency: 1, labourId: 'lab-uk-skilled' }],
    rawMaterial: { materialUtilization: 0.85 }, tooling: { totalToolingCost: 25_342_000, amortizationVolume: 1_000_000, mode: 'amortized', items },
    overheadPct: 0.12, marginPct: 0.08 } as unknown as UniversalStackInput);
  const COMPOSITE_ITEMS = [{ label: '222 tools in service (the set the volume needs) × £12,671', gbp: 2_812_962 },
    { label: '1,778 replacement tools as they wear out (programme parts ÷ 500 a tool = 2,000 tools, less 222 in service)', gbp: 22_529_038 }];

  it('a composite with replacement tools: no "halves", no volume lever, the tool life named', () => {
    const ctx = { volumeProvided: true };
    const ins = generateInsights(res(36), inp(COMPOSITE_ITEMS), book, 'composites', ctx);
    const r = generateDFMDFA(res(36), inp(COMPOSITE_ITEMS), 'composites', ctx);
    const text = JSON.stringify([ins, r]);
    expect(text).not.toMatch(/halves|half as much/i);
    expect(r.costOptimisations.some(o => o.title === 'Volume Increase to Dilute Tooling NRE')).toBe(false);
    expect(ins.find(i => i.category === 'tooling')!.actions[0]).toMatch(/set by tool life.*replacement tools/);
  });

  it('a stamping (die sets = ⌈volume ÷ die life⌉) is bought by tool life too — the seat bracket', async () => {
    expect(toolingBoughtByLife({ tooling: { totalToolingCost: 1, amortizationVolume: 1 } } as never, 'sheet_metal').byLife).toBe(true);
    const seat = await costed('Seat_Locking_Bracket.stp', { 'material.family': 'steel', 'commodity.route': 'sheet_metal' });
    expect(JSON.stringify([seat.ins, seat.dfm])).not.toMatch(/halves|Doubling volume/i);
  }, 60_000);

  it('a machining fixture (one investment) keeps the halving, with its own volume', () => {
    const fixed = { ...inp([{ label: 'Machining fixtures', gbp: 40_000 }]), tooling: { totalToolingCost: 40_000, amortizationVolume: 100_000, mode: 'amortized',
      items: [{ label: 'Machining fixtures', gbp: 40_000 }] } } as unknown as UniversalStackInput;
    expect(toolingBoughtByLife(fixed, 'machining').byLife).toBe(false);
    const ins = generateInsights(res(20), fixed, book, 'machining', { volumeProvided: true });
    expect(ins.find(i => i.category === 'tooling')!.actions[0]).toMatch(/amortised over 200,000 parts it would be half/);
    const r = generateDFMDFA(res(20), fixed, 'machining', { volumeProvided: true });
    expect(r.costOptimisations.find(o => o.title === 'Volume Increase to Dilute Tooling NRE')!.description).toMatch(/halves the tooling per part/);
  });
});

// ─── M6 ──────────────────────────────────────────────────────────────────────

describe('M6 — one utilisation reference per process, the band the rules use', () => {
  it('forging is the closed-die yield band the forging rules size the billet from', () => {
    expect(utilisationReference('forging')!.band).toEqual(FORGING_PROCESS_REFERENCE['closed-die'].yieldBand);
  });

  it('the hub flange at 68 % (inside 55–80 %) is not "below the forging reference of 75%"', async () => {
    const hub = await costed('FORGE_Hub_Flange.stp', { 'material.family': 'steel', 'commodity.route': 'forging',
      'service.toleranceClass': 'standard', 'service.safetyCritical': 'no' });
    const text = JSON.stringify([hub.ins, hub.dfm]);
    expect(text).not.toMatch(/reference of 75%|75% forging benchmark|75–90|targets 80–90%/);
    expect(hub.ins.some(i => /Low material utilisation/.test(i.title))).toBe(false);
  }, 60_000);

  it('below the band, the finding and the DFM issue quote the same band', () => {
    const res = { total: 100, breakdown: { rawMaterial: 40, process: 20, labour: 10, tooling: 5, packaging: 2, logistics: 2,
      overhead: 8, margin: 4 }, operationDetails: [] } as unknown as PartCostResult;
    const input = { operations: [], rawMaterial: { materialUtilization: 0.5 }, tooling: { amortizationVolume: 1, totalToolingCost: 0 },
      overheadPct: 0.12, marginPct: 0.08 } as unknown as UniversalStackInput;
    for (const [c, band] of [['forging', '55–80 %'], ['sheet_metal', '55–75 %'], ['machining', '60–75 %']] as const) {
      const ins = generateInsights(res, input, book, c).find(i => /Low material utilisation/.test(i.title))!;
      expect(ins.finding, c).toContain(band);
      const issue = generateDFMDFA(res, input, c).dfm.issues.find(i => i.description.includes('reference band'))!;
      expect(issue.description, c).toContain(band);
      expect(JSON.stringify(generateDFMDFA(res, input, c)), c).not.toMatch(/typical 72% benchmark|75% forging benchmark/);
    }
  });
});

// ─── M7 ──────────────────────────────────────────────────────────────────────

describe('M7 — no fixed country index', () => {
  it('the regional insight names no index figure (the country table is the figure)', () => {
    const text = JSON.stringify(stubUK.ins);
    expect(text).toMatch(/Regional sourcing opportunity/);
    expect(text).not.toMatch(/quick index|% lower conversion/);
  });
});

// ─── M19 ─────────────────────────────────────────────────────────────────────

describe('M19 — every lever fits the part it is printed on', () => {
  const res = (over: Record<string, number> = {}, traceability: unknown[] = []) => ({ total: 100, breakdown: { rawMaterial: 50,
    process: 15, labour: 22, tooling: 3, packaging: 1, logistics: 1, overhead: 5, margin: 3, ...over }, operationDetails: [], traceability } as unknown as PartCostResult);
  const op = (operationName: string) => ({ operationName, machineId: 'x', cycleTimeHr: 0.01, partsPerCycle: 1, oee: 0.8, manning: 1,
    labourTimeHr: 0.01, labourEfficiency: 1, labourId: 'lab-uk-skilled' });
  const inp = (names: string[], rm: Record<string, unknown> = {}) => ({ operations: names.map(op),
    rawMaterial: { materialId: 'mat-dc04', materialUtilization: 0.9, netWeightKg: 1, ...rm },
    tooling: { amortizationVolume: 1_000_000, totalToolingCost: 10_000 }, overheadPct: 0.12, marginPct: 0.08 } as unknown as UniversalStackInput);

  it('a one-piece forging is not told to standardise fasteners; an assembly is', () => {
    const forge = generateDFMDFA(res(), inp(['Billet shear', 'Induction heat', 'Forge', 'Trim', 'Turning']), 'forging');
    expect(JSON.stringify(forge)).not.toMatch(/fastener/i);
    const asm = generateDFMDFA(res(), inp(['Load', 'Insert bolts', 'Torque', 'Clinch', 'Inspect']), 'biw_assembly');
    expect(asm.dfa.issues.some(i => /fastener/i.test(i.title))).toBe(true);
  });

  it('billet heating itemised in the material line is said to be there, not "inside the machine rate"', () => {
    const r = res({}, [{ field: 'rawMaterial.energyKwh: electricity', value: 0.27 }]);
    const lever = generateIdeaLevers(r, inp(['Forge']), 'forging', undefined,
      { matPct: 50, procPct: 15, labPct: 22, toolPct: 3, oheadPct: 5, mgnPct: 3, opCount: 1, avgOEE: 0.8, matUtil: 0.9 })
      .find(o => o.title === 'Energy Productivity Programme')!;
    expect(lever.description).toMatch(/itemised in the material line/);
    expect(lever.description).not.toMatch(/Energy sits inside the machine rate/);
  });

  it('"secondary / remelt alloy" only on a non-ferrous alloy', () => {
    expect(remeltableAlloy(inp([], { materialId: 'mat-dc04' }), book)).toBe(false);
    expect(remeltableAlloy(inp([], { materialId: 'mat-lm25' }), book)).toBe(true);
    const sig = { matPct: 60, procPct: 15, labPct: 10, toolPct: 3, oheadPct: 5, mgnPct: 3, opCount: 1, avgOEE: 0.8, matUtil: 0.65 };
    const steel = generateIdeaLevers(res({ rawMaterial: 60 }), inp(['Press'], { materialId: 'mat-dc04' }), 'sheet_metal', { library: book }, sig)
      .find(o => o.title === 'Alternate Material Grade Study')!;
    expect(steel.description + steel.technicalJustification).not.toMatch(/secondary|remelt|6082/i);
    const ins = generateInsights(res({ rawMaterial: 70 }), inp(['Cast'], { materialId: 'mat-gjs500' }), book, 'casting');
    expect(JSON.stringify(ins)).not.toMatch(/secondary\/recycled alloy/);
  });

  it('no bought-out content → no "re-cost the bought-out content"; a saw cut is not manual finishing', () => {
    const rail = inp(['Extrude', 'Precision cut-to-length and deburr (cold saw, end trims)', 'Age'], { materialId: 'mat-al-billet-6063' });
    const ins = generateInsights(res({ rawMaterial: 72 }), rail, book, 'aluminium_extrusion');
    expect(JSON.stringify(ins)).not.toMatch(/bought-out content/);
    const r = generateDFMDFA(res({ rawMaterial: 72 }), rail, 'aluminium_extrusion');
    expect(JSON.stringify(r)).not.toMatch(/Fix the burr|fettling|gate redesign|Manual finishing/);
  });

  it('a material share above its band is an observation, never CRITICAL — and an extrusion is not judged on the machining band', () => {
    const sheet = generateInsights(res({ rawMaterial: 58 }), inp(['Press']), book, 'sheet_metal');
    const mat = sheet.find(i => i.title === 'Material is the dominant cost driver')!;
    expect(mat.type).not.toBe('critical');
    const rail = generateInsights(res({ rawMaterial: 72 }), inp(['Extrude'], { materialId: 'mat-al-billet-6063' }), book, 'aluminium_extrusion');
    const rm = rail.find(i => i.title === 'Material is the dominant cost driver')!;
    expect(rm.type).not.toBe('critical');
    expect(rm.finding).not.toMatch(/ceiling of 55%/);
  });
});
