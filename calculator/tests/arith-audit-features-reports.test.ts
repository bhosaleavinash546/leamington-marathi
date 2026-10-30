/**
 * Arithmetic audit — cross-commodity features and reports (30 Oct 2026, docs/review/arith-audit/features-reports.md).
 * Each block fails on the code before the audit and passes after it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { analyzeDetailedQuote, type PartDetail } from '../src/engine/quote-teardown-detailed.js';
import { analyzeQuote } from '../src/engine/quote-teardown.js';
import { buildCausalModel, coachSentence, metalCostOf } from '../src/engine/causal-model.js';
import { UNCERTAINTY_BASIS, UNCERTAINTY_BUCKET_BASIS, DRIVER_CV } from '../src/engine/uncertainty.js';
import { computeCarbon } from '../src/engine/carbon.js';
import { computeRegionalComparisonExact } from '../src/engine/regional-comparison.js';
import { regionalShopDefaults } from '../src/engine/regional-rates.js';
import { toolingAmortisationBasis } from '../src/export/decision-text.js';
import { auditRow, compareRoutes, crossovers, type RouteRow } from '../server/services/route-compare.js';
import { BASELINE, ANSWERS } from '../scripts/real-parts-baseline.js';
import type { UniversalStackInput, PartCostResult } from '../src/engine/types.js';

const lib = recomputeMachineRates(DEFAULT_RATE_LIBRARY);

/** A forging-like costing with every material-line item: metal, consumables, energy; packaging and logistics. */
function forgeLike(extra: Partial<UniversalStackInput['rawMaterial']> = {}): { input: UniversalStackInput; result: PartCostResult } {
  const input: UniversalStackInput = {
    partName: 'hub flange (audit)',
    rawMaterial: { materialId: 'mat-steel-38mnvs6', netWeightKg: 2.9, materialUtilization: 0.675, consumablesCostPerPart: 1.864,
      energyKwh: { electricity: 1.4725, basis: 'billet heating' }, ...extra },
    operations: [
      { operationName: 'Forging', machineId: 'forge-press-1600t', labourId: 'lab-uk-forge', cycleTimeHr: 0.0031184, partsPerCycle: 1, oee: 0.8, manning: 2, labourTimeHr: 0.0031184, labourEfficiency: 0.92 },
      { operationName: 'Turning', machineId: 'mach-lathe-cnc', labourId: 'lab-uk-skilled', cycleTimeHr: 0.13033, partsPerCycle: 1, oee: 0.8, manning: 0.5, labourTimeHr: 0.13033, labourEfficiency: 0.92 },
    ],
    tooling: { totalToolingCost: 140_263.2, amortizationVolume: 250_000, mode: 'amortized' },
    packagingPerPart: 0.17, logisticsPerPart: 0.3, overheadPct: 0.12, marginPct: 0.08,
  };
  return { input, result: computeUniversalStack(input, lib) };
}

function detailOf(result: PartCostResult, input: UniversalStackInput, shop: boolean): PartDetail {
  const tr = (f: string) => result.traceability.find(t => t.field === f)?.value ?? 0;
  const rm = input.rawMaterial;
  return {
    commodity: 'forging',
    material: { grade: rm.materialId, directMode: false, netWeightKg: rm.netWeightKg, utilization: rm.materialUtilization, pricePerKg: tr('material.pricePerKg'),
      scrapRecoveryPerKg: tr('material.scrapRecoveryPricePerKg'), consumablesPerPart: rm.consumablesCostPerPart ?? 0, materialCost: result.breakdown.rawMaterial },
    operations: result.operationDetails.map(o => ({ name: o.operationName, cycleTimeHr: o.cycleTimeHr, machineRate: o.machineRateUsed, partsPerCycle: o.partsPerCycle, oee: o.oee,
      labourTimeHr: o.labourTimeHr, labourRate: o.labourRateUsed, manning: o.manning, labourEfficiency: o.labourEfficiency, processCost: o.processCost, labourCost: o.labourCost })),
    toolingPerPart: result.breakdown.tooling, overheadPct: input.overheadPct, marginPct: input.marginPct, total: result.total,
    ...(shop ? { packagingPerPart: input.packagingPerPart, logisticsPerPart: input.logisticsPerPart, boughtInGBP: rm.boughtIn?.cost ?? 0, boughtInHandlingPct: rm.boughtIn?.handlingPct ?? 0 } : {}),
  };
}

describe('F1 — the detailed quote teardown mirrors the stack (margin on packaging + logistics, bought-in carve-out)', () => {
  it('a supplier quoting our own figures shows no margin gap and our total is the should-cost', () => {
    const { input, result } = forgeLike();
    const d = detailOf(result, input, true);
    const dt = analyzeDetailedQuote(d, { overheadPct: input.overheadPct, marginPct: input.marginPct });
    expect(dt.shopBasis).toBe('costed');
    expect(Math.abs(dt.margin.ourGBP - result.breakdown.margin)).toBeLessThanOrEqual(0.0051);   // the teardown rounds to pence
    expect(dt.margin.gapGBP).toBe(0);
    expect(dt.ourTotal).toBeCloseTo(result.total, 1);
  });
  it('bought-in content takes handling, not overhead, and no margin — as core.ts', () => {
    const { input, result } = forgeLike({ boughtIn: { cost: 5, handlingPct: 0.03 } });
    const dt = analyzeDetailedQuote(detailOf(result, input, true), {});
    expect(Math.abs(dt.overhead.ourGBP - result.breakdown.overhead)).toBeLessThanOrEqual(0.0051);
    expect(Math.abs(dt.margin.ourGBP - result.breakdown.margin)).toBeLessThanOrEqual(0.0051);
  });
  it('an older detail without packaging / logistics says so', () => {
    const { input, result } = forgeLike();
    expect(analyzeDetailedQuote(detailOf(result, input, false), {}).shopBasis).toBe('missing');
  });
});

describe('F2–F4 — the summary teardown says only what it holds', () => {
  const bd = { rawMaterial: 40, process: 20, labour: 10, tooling: 5, packaging: 1, logistics: 2, overhead: 9, margin: 7 };
  it('a quote 30 % below the should-cost is not "competitive; hold"', () => {
    const r = analyzeQuote({ commodity: 'casting', shouldCost: 94, shouldBreakdown: bd, supplierQuoteGBP: 65.8 });
    expect(r.headline).not.toMatch(/competitive; hold/);
    expect(r.headline).toMatch(/below should-cost/);
    expect(r.verdict.rag).toBe('red');
  });
  it('the overhead / margin ranges are named a heuristic, never a sourced norm', () => {
    const r = analyzeQuote({ commodity: 'casting', shouldCost: 94, shouldBreakdown: bd, supplierQuoteGBP: 130,
      supplierBreakdown: { ...bd, overhead: 30, margin: 30 } });
    expect(r.benchmarkFlags.length).toBe(2);
    for (const f of r.benchmarkFlags) { expect(f).toMatch(/heuristic/); expect(f).not.toMatch(/\bnorm\b/); }
    expect(readFileSync('src/engine/quote-teardown.ts', 'utf8')).not.toMatch(/sector norm|sector benchmark|industry range/);
    const report = readFileSync('src/export/negotiation-report.ts', 'latin1');
    expect(report).not.toMatch(/% norm`/);
  });
  it('a total-only quote says its recovery per bucket is apportioned, not disclosed', () => {
    const r = analyzeQuote({ commodity: 'casting', shouldCost: 94, shouldBreakdown: bd, supplierQuoteGBP: 110, annualVolume: 10_000 });
    const priced = r.levers.filter(l => l.expectedRecoveryGBP > 0);
    expect(priced.length).toBeGreaterThan(0);
    for (const l of priced) expect(l.lever).toMatch(/apportioned by this bucket's [\d.]+% share/);
  });
});

describe('F5 — the causal model moves only the metal an index moves', () => {
  it('metalCostOf leaves consumables and energy out and matches a 1 % metal re-cost through the stack', () => {
    const { input, result } = forgeLike();
    const metal = metalCostOf(result, input);
    expect(metal).toBeLessThan(result.breakdown.rawMaterial - input.rawMaterial.consumablesCostPerPart! + 1e-9);
    const up = { ...lib, materials: lib.materials.map(m => m.id === input.rawMaterial.materialId ? { ...m, pricePerKg: m.pricePerKg * 1.01, scrapRecoveryPricePerKg: m.scrapRecoveryPricePerKg * 1.01 } : m) };
    const moved = computeUniversalStack(input, up).total - result.total;
    const model = buildCausalModel({ partTotal: result.total, materialCostGBP: metal, materialFamily: 'steel', overheadPct: input.overheadPct, marginPct: input.marginPct, indices: [{ category: 'Steel' }] });
    expect(model.driver!.gbpPer1pctIndex).toBeCloseTo(moved, 6);
  });
  it('the counter-sentence does not claim a "today\'s index" the costing does not hold', () => {
    const m = buildCausalModel({ partTotal: 100, materialCostGBP: 40, materialFamily: 'steel', overheadPct: 0.12, marginPct: 0.08, indices: [{ category: 'Steel' }] });
    expect(coachSentence(m, 120, n => `£${n.toFixed(2)}`)).not.toMatch(/today/);
    expect(coachSentence(m, 120, n => `£${n.toFixed(2)}`)).toMatch(/material price this should-cost uses/);
  });
});

describe('F6 / F7 — the band and the carbon print the numbers they are made of', () => {
  it('the band basis names every spread and says they are not sourced', () => {
    for (const v of Object.values(DRIVER_CV)) expect(UNCERTAINTY_BASIS).toContain(String(v));
    for (const v of ['0.05', '0.12', '0.22', '1.8', '0.6']) { expect(UNCERTAINTY_BASIS).toContain(v); expect(UNCERTAINTY_BUCKET_BASIS).toContain(v); }
    expect(UNCERTAINTY_BASIS).toMatch(/not sourced/);
    const pdf = readFileSync('src/export/pdf.ts', 'utf8');
    expect(pdf).toMatch(/UNCERTAINTY_BASIS/);
    expect(pdf).not.toMatch(/'Monte-Carlo over the cost buckets, each spread by its rate-data confidence \(High \/ Medium \/ Low\)'/);
  });
  it('the carbon notes state the 85 % scrap credit and that the factors are not sourced', () => {
    const { input, result } = forgeLike();
    const cb = computeCarbon({ result, input, library: lib, commodity: 'forging', region: 'UK' });
    expect(cb.notes.join(' ')).toMatch(/85 %/);
    expect(cb.notes.join(' ')).toMatch(/not sourced/);
  });
});

describe('F8 — the country comparison fallback carries the country default overhead and says which rows are approximations', () => {
  it('a 12 % default goes to the country\'s own default (India 9 %, not 12 % × 0.72 = 8.64 %)', () => {
    const { input, result } = forgeLike();
    const rows = computeRegionalComparisonExact(input, lib, { regions: ['UK', 'IN', 'PL'], sourceRegion: 'UK', sourceResult: result });
    for (const code of ['IN', 'PL'] as const) {
      const r = rows.find(x => x.code === code)!;
      expect(r.basis).toBe('stack-reprice');
      const base = r.material + r.process + r.labour + r.tooling;
      expect(r.overhead / base).toBeCloseTo(regionalShopDefaults(code).overheadPct, 9);
    }
    expect(rows.find(x => x.code === 'UK')!.basis).toBe('costed');
  });
  it('a row from the whole chain is marked chain', () => {
    const { input, result } = forgeLike();
    const rows = computeRegionalComparisonExact(input, lib, { regions: ['UK', 'IN'], sourceRegion: 'UK', sourceResult: result, resultFor: c => (c === 'IN' ? result : null) });
    expect(rows.find(x => x.code === 'IN')!.basis).toBe('chain');
  });
  it('the PDF marks the re-priced rows and says what they carry', () => {
    const pdf = readFileSync('src/export/pdf.ts', 'utf8');
    expect(pdf).toMatch(/basis === 'stack-reprice' \? ' \\u2020'/);
    expect(pdf).toMatch(/are carried from the costing country, so they are an approximation/);
  });
});

describe('F9 — the amortisation basis never claims a volume was typed when the costing does not say so', () => {
  it('a CAD / headless input with no annual volume', () => {
    const { input } = forgeLike();
    expect(toolingAmortisationBasis(input)).not.toMatch(/typed on the form/);
    expect(toolingAmortisationBasis(input)).toMatch(/250,000 parts/);
  });
  it('the programme and one-year cases are unchanged', () => {
    const { input } = forgeLike();
    expect(toolingAmortisationBasis({ ...input, annualVolume: 50_000, programmeYears: 5 })).toMatch(/5 years × 50,000/);
    expect(toolingAmortisationBasis({ ...input, annualVolume: 250_000 })).toMatch(/ONE year/);
  });
});

describe('F10 — the route comparison\'s re-add and programme view', () => {
  it('a learning-curve costing re-adds (the signed saving is added, not subtracted)', () => {
    const { input } = forgeLike();
    const lcInput: UniversalStackInput = { ...input, annualVolume: 200_000, learningCurve: { enabled: true, referenceVolume: 50_000, curvePct: 0.9 } };
    const result = computeUniversalStack(lcInput, lib);
    expect(result.learningCurveApplied?.labourSaving).toBeLessThan(0);
    const a = auditRow({ status: 'costed', total: result.total, breakdown: result.breakdown, trace: { stackInput: lcInput, result } } as never);
    expect(a!.lines.find(l => l.line === 'Labour')!.closes).toBe(true);
    expect(a!.closes).toBe(true);
  });
  it('piece price ex-tooling takes the tooling\'s overhead and margin out too; the payback uses it', async () => {
    const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Array<{ part: string; geometry: never }>;
    const p = base.find(x => x.part === 'IM_ECU_Cover.stp')!;
    process.env.AIR_GAPPED = '1';
    const cmp = await compareRoutes({ geo: p.geometry, filename: p.part, current: 'injection_moulding', answers: { ...ANSWERS[p.part].answers },
      region: 'UK', annualVolume: 50_000, programmeYears: 5, baseBook: lib, ladder: false, bands: false }, ['injection_moulding']);
    const r = cmp.rows[0];
    expect(r.programme!.pieceExTooling).toBeCloseTo(r.total! - r.toolingPerPart! * 1.12 * 1.08, 3);
    expect(r.programme!.total).toBeCloseTo(r.programme!.pieceExTooling * r.programme!.parts + r.tooling!.investment, 1);
    // payback: extra tooling over the ex-tooling piece saving
    const ref = { ...r, route: 'a', programme: { ...r.programme!, pieceExTooling: 2 }, tooling: { ...r.tooling!, investment: 10_000 }, byVolume: [] } as RouteRow;
    const alt = { ...r, route: 'b', programme: { ...r.programme!, pieceExTooling: 1.5 }, tooling: { ...r.tooling!, investment: 30_000 }, byVolume: [] } as RouteRow;
    const x = crossovers([ref, alt], ref, [50_000], 50_000)[0];
    expect(x.payback).toEqual({ extraTooling: 20_000, pieceSaving: 0.5, parts: 40_000, months: 9.6 });
  }, 60_000);
});
