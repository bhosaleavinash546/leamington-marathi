/**
 * Foundry practice at volume (3 Nov 2026) — the report-standard review found the sand-casting rules costing JOBBING
 * practice at 200,000 castings a year. The research (scripts/research/2026-11-report-standard/foundry/notes.md, P1–P6,
 * re-read in verify.md; capital in foundry-capex/) is implemented here; P5 (the core build-up) waits on a binder quote.
 *
 *   P1  the moulding line is chosen by the part's moulds a year and its mould size (semi-automatic HSP-2D class below a
 *       labelled-judgement threshold, the automatic DISAMATIC 270 class above), rated output sourced;
 *   P2  the crew is the line class's (automatic vertical: 3 with manual pouring — Trakya Döküm);
 *   P3  the pattern life follows the pattern material PRICED (aluminium), not the wood band;
 *   P4  a ferrous casting ≤ 30 kg off the automatic line is fettled on a robotic cell, 40 s, 0.5 operator;
 *   P6  the ductile-iron yield band cites its sources and the casting ÷ pour definition;
 *   and the two new rate-book machines, written by the UK book generator and carried by every country book at par.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { buildRegionalLibrary, REGIONAL_DATA, type ManufacturingRegion } from '../src/engine/regional-rates.js';
import { computeCastingDrivers, type CastingInputs } from '../src/engine/modules/casting.js';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { CASTING_RULES } from '../src/engine/cost-input-rules/commodities/casting.js';
import { CAST_AND_MACHINE_RULES } from '../src/engine/cost-input-rules/commodities/cast-and-machine.js';
import { BASELINE, ANSWERS } from '../scripts/real-parts-baseline.js';
import type { OCCTGeometry } from '../server/utils/geometry-bridge.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

process.env.AIR_GAPPED = '1';
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Array<{ part: string; geometry: OCCTGeometry }>;
const geoOf = (part: string) => base.find(b => b.part === part)!.geometry;
const machine = (id: string) => DEFAULT_RATE_LIBRARY.machines.find(m => m.id === id);
const rate = (id: string) => (book.machines.find(m => m.id === id) as unknown as { computedRatePerHr: number }).computedRatePerHr;
const labour = (id: string) => book.labour.find(l => l.id === id)!.fullyLoadedRatePerHr;

const ctxOf = (part: string, annualVolume: number, answers: Record<string, unknown> = ANSWERS[part].answers,
  commodity: RuleContext['commodity'] = 'cast_and_machine'): RuleContext => ({
  geo: geoOf(part) as never, geometryQuality: 'occt', commodity, commoditySource: 'engineer',
  annualVolume, programmeYears: 5, filename: part, answers,
});
const rulesFor = (part: string, annualVolume: number) => runCostInputRules(CAST_AND_MACHINE_RULES, ctxOf(part, annualVolume));
const prov = (r: ReturnType<typeof rulesFor>, id: string) => r.provenance[id];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cost(part: string, annualVolume: number): Promise<any> {
  const p = base.find(x => x.part === part)!;
  return costMeasuredPart(p.geometry, part,
    { partNumber: part, file: part, annualVolume } as never,
    ANSWERS[part].answers, 'UK', { annualVolume, programmeYears: 5, deliveryTerms: 'EXW' } as never, book,
    { partNumber: part, file: part, status: 'error' } as never);
}

describe('rate book — two machines added through the UK book generator', () => {
  it('the generator config carries both, each with its research row, scope and hours basis', () => {
    const cfg = JSON.parse(readFileSync(new URL('../scripts/rate-refresh/2026-10-uk.json', import.meta.url), 'utf8'));
    const added = cfg.machines.added as Array<{ id: string; capexGbp: number; hours: number; utilisation: number; research: string; hoursBasis: string }>;
    expect(added.map(a => a.id)).toEqual(['sand-auto-vertical-line', 'fettle-robot-cell']);
    expect(added[0].capexGbp).toBe(Math.round(3_000_000 / 1.1965));   // Dovre €3.0 M at the book's €1.1965
    expect(added[1].capexGbp).toBe(Math.round(1_634_390 / 5.096));    // KAW-MET zł1,634,390 at zł5.096
    for (const a of added) {
      expect([a.hours, a.utilisation]).toEqual([6000, 0.8]);
      expect(a.hoursBasis).toMatch(/NOT a foundry-specific source/);
    }
  });

  it('the automatic line: Dovre DISAMATIC 270-A capex, moulding equipment only, 2015 money not escalated, the book method', () => {
    const m = machine('sand-auto-vertical-line')!;
    const capex = 2_507_313;
    expect(m.buildup.annualDepreciation).toBe(Math.round(capex / 13));
    expect(m.buildup.maintenance).toBe(Math.round(capex * 0.03));
    expect(m.buildup.indirectSupport).toBe(Math.round(capex * 0.05));
    expect(m.buildup.financeCost).toBe(Math.round(capex / 2 * 0.04));
    expect([m.buildup.annualAvailableHours, m.buildup.machineUtilization]).toEqual([6000, 0.8]);
    expect(m.sourceNote).toMatch(/moulding equipment only/);
    expect(m.sourceNote).toMatch(/2015 money, NOT escalated/);
    expect(m.sourceNote).toMatch(/kept its DISA sand plant/);
    // the hours are the book's convention and the note says what other hours would give (≈ 2× — foundry-capex §3)
    expect(m.sourceNote).toMatch(/At 6,000 h a year × 0\.80 utilisation the rate is £[0-9.]+\/h — the UK book’s convention for a three-shift production line/);
    expect(m.sourceNote).toMatch(/at 3,500 h × 0\.75 .* it would be £[0-9.]+\/h/);
    expect(m.sourceNote).not.toMatch(/sand-cast-line|mach-hmc|CONTINUOUS_UK_HOURS/);   // no library id or constant in report text
  });

  it('the fettling cell: KAW-MET 2025 budget with its scope', () => {
    const m = machine('fettle-robot-cell')!;
    expect(m.buildup.annualDepreciation).toBe(Math.round(320_720 / 13));
    expect(m.sourceNote).toMatch(/zł1,634,390 net \(2025/);
    expect(m.sourceNote).toMatch(/three tool sets, installation/);
    expect(m.sourceNote).toMatch(/30\.0 kW \(the tender’s ≤ 30 kW power limit/);
  });

  it('every one of the 39 country books carries both machines, capital AT PAR and labelled (no country capex was sourced)', () => {
    const regions = Object.keys(REGIONAL_DATA) as ManufacturingRegion[];
    expect(regions.length).toBe(39);
    for (const r of regions) {
      const lib = r === 'UK' ? book : buildRegionalLibrary(book, r);
      for (const id of ['sand-auto-vertical-line', 'fettle-robot-cell']) {
        const m = lib.machines.find(x => x.id === id);
        expect(m, `${r} ${id}`).toBeDefined();
        expect(m!.computedRatePerHr, `${r} ${id}`).toBeGreaterThan(0);
        if (r !== 'UK') expect(m!.sourceNote, `${r} ${id}`).toMatch(/capital AT PAR/);
      }
    }
  });
});

describe('P1 / P2 — the line is chosen by moulds a year and mould size; the crew is the line\'s', () => {
  it('stub axle at 200,000 a year: the automatic vertical line, 9 cored impressions, 250 moulds/h, crew of 3', () => {
    const r = rulesFor('PRCR002.stp', 200_000);
    expect(prov(r, 'cam-sand-line').value).toBe('sand-auto-vertical-line');
    expect(prov(r, 'cam-cast-manning').value).toBe(3);
    expect(prov(r, 'cam-cast-manning').basis).toMatch(/Trakya Döküm/);
    expect(prov(r, 'cam-sand-ct').value).toBe(Math.round(1 / 250 / 9 * 1e6) / 1e6);   // 6 dp below 0.01 h (4 dp cut it 10 %)
    expect(prov(r, 'cam-sand-ct').basis).toMatch(/250 cored moulds\/h \(DISA 270-280/);
    // the threshold is a labelled judgement and the loading is printed
    expect(prov(r, 'cam-sand-line').basis).toMatch(/CostVision engineering judgement, not sourced/);
    expect(prov(r, 'cam-sand-line').basis).toMatch(/loading 22,222 moulds ÷ 250 moulds\/h = 89 h of the line's 4,800 h/);
  });

  it('the same part at 1,000 a year stays on the semi-automatic HSP-2D class line, 6 impressions, 60 moulds/h, crew of 4', () => {
    const r = rulesFor('PRCR002.stp', 1_000);
    expect(prov(r, 'cam-sand-line').value).toBe('sand-cast-line');
    expect(prov(r, 'cam-cast-manning').value).toBe(4);
    expect(prov(r, 'cam-cast-manning').basis).toMatch(/not sourced/);
    expect(prov(r, 'cam-sand-ct').value).toBe(Math.round(1 / 60 / 6 * 1e6) / 1e6);
    expect(prov(r, 'cam-sand-ct').basis).toMatch(/HSP-2D/);
  });

  it('the threshold reads moulds on the semi-automatic line: the bracket (12 a mould) changes line between 50k and 200k', () => {
    expect(prov(rulesFor('Casting_Braket.stp', 50_000), 'cam-sand-line').value).toBe('sand-cast-line');          // 4,167 moulds
    expect(prov(rulesFor('Casting_Braket.stp', 200_000), 'cam-sand-line').value).toBe('sand-auto-vertical-line'); // 16,667
  });

  it('headless costs the line the rules chose — the moulding op runs on it, with its crew', async () => {
    const res = await cost('PRCR002.stp', 200_000);
    const op = (res.trace.operations as Array<{ operationName: string; machineId: string; manning: number }>).find(o => /^Sand Casting — Moulding/.test(o.operationName))!;
    expect(op.machineId).toBe('sand-auto-vertical-line');
    expect(op.manning).toBe(3);
    expect(res.params.sand.mouldLineId).toBe('sand-auto-vertical-line');
  });
});

describe('P3 — pattern life follows the pattern material that is priced', () => {
  it('an aluminium match plate lasts 100,000 moulds (judgement inside the published 10k–150k), × impressions', () => {
    const hi = rulesFor('PRCR002.stp', 200_000);
    expect(prov(hi, 'cam-hpdc-die-life').value).toBe(100_000 * 9);
    expect(prov(hi, 'cam-hpdc-die-life').basis).toMatch(/aluminium match-plate life 100,000 moulds × 9/);
    expect(prov(hi, 'cam-hpdc-die-life').basis).toMatch(/CostVision engineering judgement/);
    expect(prov(hi, 'cam-hpdc-die-life').basis).not.toMatch(/wood-pattern band/);
    const lo = rulesFor('PRCR002.stp', 1_000);
    expect(prov(lo, 'cam-hpdc-die-life').value).toBe(100_000 * 6);
  });

  it('the stub axle buys 2 pattern sets over 5 years at 200,000 a year, not 65', async () => {
    const res = await cost('PRCR002.stp', 200_000);
    const items = (res.trace.drivers.tooling.items as Array<{ label: string; sets?: number; gbp: number }>).filter(i => /^Pattern/.test(i.label));
    const sets = items.reduce((s, i) => s + (i.sets ?? 0), 0);
    expect(sets).toBe(Math.ceil(1_000_000 / 0.97 / 900_000 - 1e-9));
  });
});

describe('P4 — fettling: a robotic cell off the automatic line, bench minutes on the semi-automatic line', () => {
  it('the stub axle at 200,000: 40 s on the cell, no bench minutes; the cell op is machine time + half an operator', async () => {
    const r = rulesFor('PRCR002.stp', 200_000);
    expect(prov(r, 'cam-fettle-cell-sec').value).toBe(40);
    expect(prov(r, 'cam-fettle-cell-sec').basis).toMatch(/Malleable Castings time study/);
    expect(prov(r, 'cam-fettle-min').value).toBe(0);
    const res = await cost('PRCR002.stp', 200_000);
    const ops = res.trace.operations as Array<{ operationName: string; machineId: string; cycleTimeHr: number; manning: number; processCost: number; labourCost: number }>;
    const cell = ops.find(o => /^Fettling — robotic grinding cell/.test(o.operationName))!;
    expect(cell.machineId).toBe('fettle-robot-cell');
    const h = 40 / 3600 / 0.97;
    expect(cell.cycleTimeHr).toBeCloseTo(h, 12);
    expect(cell.processCost).toBeCloseTo(h * rate('fettle-robot-cell') / 0.8, 9);
    expect(cell.labourCost).toBeCloseTo(h * 0.5 * labour('lab-uk-foundry') / 0.92, 9);
    expect(ops.some(o => /^Fettling \(gate/.test(o.operationName))).toBe(false);
  });

  it('on the semi-automatic line the bench minutes stay, labelled unsourced', () => {
    const r = rulesFor('PRCR002.stp', 1_000);
    expect(prov(r, 'cam-fettle-cell-sec').value).toBe(0);
    expect(prov(r, 'cam-fettle-min').value).toBe(6);
    expect(prov(r, 'cam-fettle-min').basis).toMatch(/engineering-typical, not sourced/);
  });

  it('an aluminium sand casting on the automatic line keeps bench minutes (the cell is sourced for ferrous only)', () => {
    const r = runCostInputRules(CASTING_RULES, ctxOf('PRCR002.stp', 200_000, {
      ...ANSWERS['PRCR002.stp'].answers, 'material.family': 'aluminium', 'casting.processChoice': 'sand',
    }, 'casting'));
    expect(r.provenance['cast-sand-line'].value).toBe('sand-auto-vertical-line');
    expect(r.provenance['cast-fettle-cell-sec'].value).toBe(0);
    expect(Number(r.provenance['cast-fettle-min'].value)).toBeGreaterThan(0);
  });

  it('the module: no cell input, no cell op — and the cell op carries the reject uplift', () => {
    const inputs: CastingInputs = {
      subtype: 'sand', materialId: 'mat-gjs500', partWeightKg: 5, castingYield: 0.625, rejectRate: 0.03,
      labourId: 'lab-uk-foundry', oee: 0.8, manning: 3, labourEfficiency: 0.92, amortizationVolume: 1_000_000,
      sand: { mouldLineId: 'sand-auto-vertical-line', cycleTimeHr: 0.0004, patternCost: 20_000, patternLife: 900_000, coreCostPerPart: 1 },
    };
    expect(computeCastingDrivers(inputs).operations.some(o => /robotic/.test(o.operationName))).toBe(false);
    const d = computeCastingDrivers({ ...inputs, fettlingCell: { machineId: 'fettle-robot-cell', secPerCasting: 40, manning: 0.5 } });
    const op = d.operations.find(o => /robotic/.test(o.operationName))!;
    expect(op.cycleTimeHr).toBeCloseTo(40 / 3600 / 0.97, 12);
    expect(op.manning).toBe(0.5);
  });
});

describe('P6 — the ductile-iron yield band says where it stands', () => {
  it('cites BREF 2024, Döktaş and Fundimig and the casting ÷ pour definition; steel stays labelled unsourced', () => {
    const iron = rulesFor('PRCR002.stp', 200_000);
    expect(prov(iron, 'cam-cast-yield').value).toBe(0.625);   // the band is kept
    const b = String(prov(iron, 'cam-cast-yield').basis);
    expect(b).toMatch(/Döktaş EN-GJS-500, a 26\.8 kg casting from 53 kg poured, 50\.6 %/);
    expect(b).toMatch(/EU BREF 2024 Table 3\.13/);
    expect(b).toMatch(/Fundimig 68 %/);
    expect(b).toMatch(/Casting ÷ pour; melt loss and rejects are charged separately/);
    expect(b).not.toMatch(/not sourced/);
    expect(String(prov(rulesFor('Casting_Braket.stp', 200_000), 'cam-cast-yield').basis)).toMatch(/not sourced/);
  });
});

describe('screen = headless — the new rules reach a field on both forms', () => {
  it('the casting and cast + machine forms carry the line and the cell fields the rules fill', () => {
    const html = readFileSync(new URL('../src/ui/main.ts', import.meta.url), 'utf8');
    for (const id of ['cast-sand-line', 'cam-sand-line', 'cast-fettle-cell-sec', 'cam-fettle-cell-sec']) expect(html).toContain(`id="${id}"`);
    expect(html).toContain("fettlingCell: fettlingCellInput(num('cast-fettle-cell-sec'))");
    expect(html).toContain("fettlingCell: fettlingCellInput(num('cam-fettle-cell-sec'))");
    const r = rulesFor('PRCR002.stp', 200_000);
    expect(prov(r, 'cam-sand-line')).toBeDefined();
    expect(prov(r, 'cam-fettle-cell-sec')).toBeDefined();
  });
});
