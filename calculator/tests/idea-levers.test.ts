/**
 * 360° idea-generation levers + expanded DFM/DFA rules.
 *
 * Every lever must (a) fire only when its trigger is true in the costed
 * numbers, (b) respect the SuggestionContext gates (assumed volume, quoted
 * region, tool-estimated pack rates), and (c) carry a category so the report
 * can show the 360° coverage. Deterministic: same fixture, same ideas.
 */
import { describe, it, expect } from 'vitest';
import { generateDFMDFA } from '../src/engine/dfm-dfa.js';
import { generateIdeaLevers } from '../src/engine/idea-levers.js';
import type { PartCostResult, UniversalStackInput, CommodityType } from '../src/engine/types.js';

const op = (operationName: string, over: Record<string, unknown> = {}) =>
  ({ operationName, machineId: 'mach-vmc3', cycleTimeHr: 0.05, partsPerCycle: 1, oee: 0.85,
     manning: 1, labourTimeHr: 0.05, labourEfficiency: 0.9, labourId: 'lab-uk-skilled', ...over });

const result = (
  over: Partial<PartCostResult['breakdown']> = {},
  operationDetails: Array<{ operationName: string; processCost: number; labourCost: number }> = [],
): PartCostResult => ({
  total: 100,
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

const run = (r: PartCostResult, i: UniversalStackInput, c: CommodityType, ctx?: object) =>
  generateDFMDFA(r, i, c, ctx as never);

// ─── Packaging & logistics ───────────────────────────────────────────────────

describe('packaging & logistics levers', () => {
  it('returnable packaging fires on a pack-heavy part, as a sourcing lever', () => {
    const r = run(result({ packaging: 7, logistics: 2 }), input([op('Pressing')]), 'sheet_metal');
    const lev = r.costOptimisations.find(o => o.title.includes('Returnable Packaging'));
    expect(lev).toBeDefined();
    expect(lev!.category).toBe('logistics');
    expect(lev!.lever).toBe('sourcing');
  });

  it('tool-estimated pack rates downgrade the same lever to confirm-first', () => {
    const r = run(result({ packaging: 7, logistics: 2 }), input([op('Pressing')]), 'sheet_metal',
      { pkgLogisticsEstimated: true });
    const lev = r.costOptimisations.find(o => o.title.includes('Packaging Cost — Confirm'));
    expect(lev).toBeDefined();
    expect(lev!.lever).toBe('assumption');
  });

  it('freight-mode review fires outside low-cost regions; near-shore check replaces it inside them', () => {
    const heavyLog = result({ logistics: 10, packaging: 1 });
    const abroad = run(heavyLog, input([op('Casting')]), 'casting', { region: 'UK' });
    expect(abroad.costOptimisations.some(o => o.title.includes('Freight Mode'))).toBe(true);
    expect(abroad.costOptimisations.some(o => o.title.includes('Near-Shore'))).toBe(false);
    const inChina = run(heavyLog, input([op('Casting')]), 'casting', { region: 'CN' });
    expect(inChina.costOptimisations.some(o => o.title.includes('Freight Mode'))).toBe(false);
    expect(inChina.costOptimisations.some(o => o.title.includes('Near-Shore'))).toBe(true);
  });

  it('packaging >5% is also a DFM finding', () => {
    const r = run(result({ packaging: 7 }), input([op('Pressing')]), 'sheet_metal');
    expect(r.dfm.issues.some(i => i.title.includes('Packaging cost heavy'))).toBe(true);
  });
});

// ─── Process levers ──────────────────────────────────────────────────────────

describe('process levers', () => {
  it('multi-cavity fires for single-cavity moulding, never for machining, never when already multi-cavity', () => {
    const im = run(result(), input([op('Injection Moulding')]), 'injection_moulding');
    expect(im.costOptimisations.some(o => o.title.includes('Multi-Cavity'))).toBe(true);
    const mach = run(result(), input([op('Milling')]), 'machining');
    expect(mach.costOptimisations.some(o => o.title.includes('Multi-Cavity'))).toBe(false);
    const twoCav = run(result(), input([op('Injection Moulding', { partsPerCycle: 2 })]), 'injection_moulding');
    expect(twoCav.costOptimisations.some(o => o.title.includes('Multi-Cavity'))).toBe(false);
  });

  it('multi-cavity on an assumed volume becomes confirm-first', () => {
    const r = run(result(), input([op('Injection Moulding')]), 'injection_moulding', { volumeProvided: false });
    const lev = r.costOptimisations.find(o => o.title.includes('Multi-Cavity'));
    expect(lev!.title).toContain('Confirm the Annual Volume');
  });

  it('lights-out running fires on machine-paced machining with healthy OEE and real labour', () => {
    const r = run(result({ labour: 18 }), input([op('CNC Milling')]), 'machining');
    expect(r.costOptimisations.some(o => o.title.includes('Lights-Out'))).toBe(true);
  });

  it('the bottleneck rule names the dominant operation', () => {
    const details = [
      { operationName: 'HPDC Casting', processCost: 40, labourCost: 5 },
      { operationName: 'CNC Machining', processCost: 8, labourCost: 2 },
      { operationName: 'Deburr', processCost: 2, labourCost: 1 },
    ];
    const r = run(result({}, details), input([op('HPDC Casting'), op('CNC Machining'), op('Deburr')]), 'casting');
    const hit = r.dfm.issues.find(i => i.title.includes('One operation dominates'));
    expect(hit).toBeDefined();
    expect(hit!.title).toContain('HPDC Casting');
  });
});

// ─── Material levers ─────────────────────────────────────────────────────────

describe('material levers', () => {
  it('scrap revenue recovery fires on low-utilisation machining', () => {
    const r = run(result({ rawMaterial: 45 }),
      input([op('Milling')], { rawMaterial: { materialUtilization: 0.55 } }), 'machining');
    expect(r.costOptimisations.some(o => o.title.includes('Scrap Revenue'))).toBe(true);
  });

  it('regrind fires for moulding below 92% utilisation, and PCR blend on resin-heavy parts', () => {
    const r = run(result({ rawMaterial: 45 }),
      input([op('Injection Moulding')], { rawMaterial: { materialUtilization: 0.82 } }), 'injection_moulding');
    expect(r.costOptimisations.some(o => o.title.includes('Regrind'))).toBe(true);
    const pcr = r.costOptimisations.find(o => o.title.includes('Recycled-Content'));
    expect(pcr).toBeDefined();
    expect(pcr!.category).toBe('sustainability');
  });

  it('alternate grade study fires on material-heavy metal parts only', () => {
    const metal = run(result({ rawMaterial: 50 }), input([op('Forging')]), 'forging');
    expect(metal.costOptimisations.some(o => o.title.includes('Alternate Material Grade'))).toBe(true);
    const pcb = run(result({ rawMaterial: 50 }), input([op('SMT')]), 'pcba');
    expect(pcb.costOptimisations.some(o => o.title.includes('Alternate Material Grade'))).toBe(false);
  });
});

// ─── Commercial + tooling levers ─────────────────────────────────────────────

describe('commercial and tooling levers', () => {
  it('learning-curve price-down fires only when a person provided the volume and none is priced in', () => {
    const withVol = run(result({ labour: 25 }), input([op('Assembly')]), 'wiring_harness', { volumeProvided: true });
    expect(withVol.costOptimisations.some(o => o.title.includes('Learning-Curve'))).toBe(true);
    const noVol = run(result({ labour: 25 }), input([op('Assembly')]), 'wiring_harness', { volumeProvided: false });
    expect(noVol.costOptimisations.some(o => o.title.includes('Learning-Curve'))).toBe(false);
  });

  it('soft tooling fires on low-volume tooling-heavy parts', () => {
    const r = run(result({ tooling: 35, process: 15 }),
      input([op('Injection Moulding')], { tooling: { amortizationVolume: 8_000, totalToolingCost: 60_000 } }),
      'injection_moulding');
    expect(r.costOptimisations.some(o => o.title.includes('Soft / Bridge Tooling'))).toBe(true);
  });

  it('the amortisation-mismatch DFM check fires when the tool is amortised over less than the annual volume', () => {
    const r = run(result(), input([op('Milling')], {
      annualVolume: 200_000,
      tooling: { amortizationVolume: 60_000, totalToolingCost: 40_000 },
    }), 'machining');
    const hit = r.dfm.issues.find(i => i.title.includes('amortised over less than the annual volume'));
    expect(hit).toBeDefined();
    expect(hit!.lever).toBe('assumption');
    expect(hit!.savingPct).toBe(0);
  });
});

// ─── Boothroyd-flavoured DFA additions ───────────────────────────────────────

describe('DFA additions from the operation list', () => {
  it('multi-manned stations are flagged as the first automation candidate', () => {
    const r = run(result(), input([op('Manual Assembly', { manning: 2.5 })]), 'biw_assembly');
    expect(r.dfa.issues.some(i => i.title.includes('High manning'))).toBe(true);
  });

  it('a standalone inspection step is flagged when it carries real cost', () => {
    const details = [
      { operationName: 'CNC Milling', processCost: 30, labourCost: 5 },
      { operationName: 'Final Inspection', processCost: 4, labourCost: 3 },
    ];
    const r = run(result({}, details), input([op('CNC Milling'), op('Final Inspection')]), 'machining');
    expect(r.dfa.issues.some(i => i.title.includes('Inspection is a separate manual step'))).toBe(true);
  });

  it('labour running past the machine cycle is flagged', () => {
    const r = run(result({ labour: 20 }),
      input([op('Moulding + hand-finish', { cycleTimeHr: 0.03, labourTimeHr: 0.06 })]), 'injection_moulding');
    expect(r.dfa.issues.some(i => i.title.includes('Labour time exceeds the machine cycle'))).toBe(true);
  });
});

// ─── 360° shape of the output ────────────────────────────────────────────────

describe('360° output shape', () => {
  it('every lever from the extended catalogue carries a category', () => {
    const levers = generateIdeaLevers(
      result({ rawMaterial: 45, packaging: 6, logistics: 9, labour: 20 }),
      input([op('CNC Milling'), op('Drilling'), op('Deburr'), op('Final Inspection'), op('Packing')]),
      'machining', { region: 'UK' },
      { matPct: 45, procPct: 30, labPct: 20, toolPct: 8, oheadPct: 8, mgnPct: 4, opCount: 5, avgOEE: 0.85, matUtil: 0.75 });
    expect(levers.length).toBeGreaterThan(3);
    for (const l of levers) {
      expect(l.category).toBeDefined();
      expect(l.expectedSavingPct).toBeGreaterThan(0);
    }
  });

  it('a rich part draws ideas from at least four different categories', () => {
    const details = [
      { operationName: 'HPDC Casting', processCost: 25, labourCost: 4 },
      { operationName: 'CNC Machining', processCost: 10, labourCost: 3 },
      { operationName: 'Deburr + Polish', processCost: 1, labourCost: 2 },
      { operationName: 'Final Inspection', processCost: 2, labourCost: 2 },
    ];
    const r = run(
      result({ rawMaterial: 44, process: 26, labour: 11, tooling: 13, packaging: 5, logistics: 7, overhead: 16, margin: 13 }, details),
      input([op('HPDC Casting'), op('CNC Machining'), op('Deburr + Polish'), op('Final Inspection')],
        { rawMaterial: { materialUtilization: 0.7, consumablesCostPerPart: 12 } }),
      'casting', { region: 'UK', volumeProvided: true });
    const cats = new Set(r.costOptimisations.map(o => o.category).filter(Boolean));
    expect(cats.size).toBeGreaterThanOrEqual(4);
    expect(r.costOptimisations.length).toBeGreaterThanOrEqual(8);
  });

  it('levers are sorted biggest saving first (backstops excepted — they always append last)', () => {
    const r = run(result({ rawMaterial: 45, labour: 35, process: 10 }), input([op('Layup'), op('Cure'), op('Trim'), op('Inspect')]), 'composites');
    const BACKSTOPS = /Design Review for DFM Compliance|Annual Volume Re-Commitment/;
    const savings = r.costOptimisations.filter(o => !BACKSTOPS.test(o.title)).map(o => o.expectedSavingPct);
    const sorted = [...savings].sort((a, b) => b - a);
    expect(savings).toEqual(sorted);
  });

  it('is deterministic — same fixture, identical output', () => {
    const make = () => run(result({ rawMaterial: 45 }), input([op('Milling'), op('Drilling')]), 'machining', { region: 'UK' });
    expect(JSON.stringify(make())).toBe(JSON.stringify(make()));
  });
});

// ─── New commodity DFM rules ─────────────────────────────────────────────────

describe('new commodity rules', () => {
  it('extrusion: conversion-cost and offcut rules fire', () => {
    const r = run(result({ process: 45 }),
      input([op('Extrusion')], { rawMaterial: { materialUtilization: 0.7 } }), 'extrusion');
    expect(r.dfm.issues.some(i => i.title.includes('Extrusion conversion cost high'))).toBe(true);
    expect(r.dfm.issues.some(i => i.title.includes('start-up and offcut scrap'))).toBe(true);
  });

  it('rotational moulding: oven-cycle rule fires', () => {
    const r = run(result({ process: 55, rawMaterial: 25 }), input([op('Rotomoulding')]), 'rotational_moulding');
    expect(r.dfm.issues.some(i => i.title.includes('Oven cycle dominates'))).toBe(true);
  });

  it('painting: transfer-efficiency rule fires on paint-material-heavy costings', () => {
    const r = run(result({ rawMaterial: 45 }), input([op('Basecoat Application')]), 'painting');
    expect(r.dfm.issues.some(i => i.title.includes('transfer efficiency'))).toBe(true);
  });
});
