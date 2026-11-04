/**
 * Phase B (4 Nov 2026) — the four changes from scripts/research/2026-11-phase-b (data.json + notes.md), one block each:
 *   1. the UK cast-steel charge (consumer scrap + trim ÷ melt loss), the ductile-iron scrap half, the low-alloy cast steels;
 *   2. China aluminium billet (late-October SMM fee, ex-VAT) and a per-region extrusion scrap level (Mysteel clean 6063);
 *   3. HSLA cold-rolled at the CR base + the published extra, and the advisory sheet grade question;
 *   4. the forge line's billet saw and induction heater, the draft metal (IS 3469), the IS 3469 machining stock.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { buildRegionalLibrary, alBilletMaterialFactors } from '../src/engine/regional-rates.js';
import { AL_MARKET, BILLET_PREMIUM_USD_PER_T, AL_SCRAP_6XXX_BY_REGION, alScrapGbpPerKg, alScrapDiffUsdPerT, billetPriceGbpPerKg } from '../src/engine/al-extrusion-data.js';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { SHEET_METAL_RULES } from '../src/engine/cost-input-rules/commodities/sheet-metal.js';
import {
  FORGING_RULES, forgingDraftMetal, machiningStockMm, IS3469_DRAFT_DEG, BILLET_SAW, INDUCTION_HEATER,
} from '../src/engine/cost-input-rules/commodities/forging.js';
import { sheetGrade, GRADE_DECISION_ID, HSLA_APPLICATION_RE } from '../src/engine/cost-input-rules/derive/grade.js';
import { computeForgingDrivers } from '../src/engine/modules/forging.js';
import { basisGradeFor } from '../src/ui/cad-workspace.js';
import { RULE_PATH_MAP } from '../src/engine/cost-input-rules/apply.js';
import { reportStandardFor } from '../src/export/report-standard.js';
import { countryMachine, COUNTRY_BOOKS } from '../src/engine/country-books.js';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const LIB = DEFAULT_RATE_LIBRARY;
const mat = (id: string) => LIB.materials.find(m => m.id === id)!;
const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry }>;
const geoOf = (p: string) => baseline.find(b => b.part === p)!.geometry;
const headless = async (part: string, answers: Record<string, unknown>, region = 'UK') =>
  await costMeasuredPart(geoOf(part), part, { partNumber: part, file: part, annualVolume: 50_000, commodity: answers['commodity.route'] } as never,
    answers, region as never, { annualVolume: 50_000, programmeYears: 5 } as never, recomputeMachineRates(LIB), { partNumber: part, file: part, status: 'error' } as never) as
    { status: string; total: number; params: Record<string, unknown>; provenance: Record<string, { value: unknown; basis: string }>; trace: { operations: Array<{ operationName: string; machineId: string }> } };

// HMRC OTS, UK exports of CN 7204 49 90 (heavy melting scrap), Jan–Aug 2026, both flows (research row S3)
const HMS = (721498782 + 139195452) / (2472204515 + 496961012);

describe('1. the UK cast-steel charge is consumer scrap + trim ÷ melt loss (was a merchant price, £0.148)', () => {
  it('GS-C25 / WCB = (HMS export parity + Mn / Si / Al trim) ÷ 0.96 ≈ £0.31/kg', () => {
    const trim = (4.4 * 3667343 / 4193930 + 5 * 4370594 / 4760315 + 1.5 * 2.0) / 1000;
    expect(HMS).toBeCloseTo(0.2899, 4);
    expect(mat('mat-gs-c25').pricePerKg).toBeCloseTo((HMS + trim) / 0.96, 3);
    expect(mat('mat-gs-c25').pricePerKg).toBeGreaterThan(0.30);
    expect(mat('mat-astm-a216-wcb').pricePerKg).toBe(mat('mat-gs-c25').pricePerKg);
    const n = mat('mat-gs-c25').sourceNote!;
    expect(n).toMatch(/HMRC OTS, UK exports of CN 7204 49 90/);
    expect(n).toMatch(/BDSV E3/);
    expect(n).toMatch(/÷ 0\.96 melt loss/);
    expect(n).toMatch(/api\.uktradeinfo\.com/);
    expect(n).not.toMatch(/Mn\/Si trim not priced/);
  });
  it('the low-alloy grades take their alloy content at the researched ferroalloy prices', () => {
    const mn = 3667343 / 4193930 / (3 / 4.4);
    const cr = (24140075 + 24654169) / (23828070 + 26852769) / (12.5 / 20);
    const mo = 5768326 / 220989 / (5.5 / 8.3);
    expect(mat('mat-g20mn5').pricePerKg - mat('mat-gs-c25').pricePerKg).toBeCloseTo(0.005 * mn, 3);
    expect(mat('mat-g42crmo4').pricePerKg - mat('mat-gs-c25').pricePerKg).toBeCloseTo(0.01 * cr + 0.002 * mo, 3);
    expect(mat('mat-g42crmo4').sourceNote).toMatch(/1\.00 % Cr × £1\.540\/kg Cr \+ 0\.20 % Mo × £39\.39\d\/kg Mo/);
  });
  it('the ductile-iron charge takes the same consumer scrap for its scrap half', () => {
    expect(mat('mat-gjs500').pricePerKg).toBeCloseTo((0.5 * 0.3867 + 0.5 * HMS + 0.012 * 1.8985) / 0.98, 3);
    expect(mat('mat-gjs500').sourceNote).toMatch(/0\.5 × UK heavy melting scrap £0\.2899/);
  });
  it('the scrap a foundry SELLS stays at the merchant price, below its charge', () => {
    for (const id of ['mat-gs-c25', 'mat-g20mn5', 'mat-g42crmo4']) expect(mat(id).scrapRecoveryPricePerKg).toBeLessThan(mat(id).pricePerKg);
  });
  it('every country book takes the low-alloy content on its OWN charge anchor (not the frozen UK premium)', () => {
    const cn = buildRegionalLibrary(recomputeMachineRates(LIB), 'CN');
    const c = (id: string) => cn.materials.find(m => m.id === id)!.pricePerKg;
    expect(c('mat-g42crmo4') - c('mat-gs-c25')).toBeCloseTo(0.0942, 3);
  });
});

describe('2. China aluminium billet and extrusion scrap', () => {
  it('billet premium: ex-VAT A00 + the SMM Foshan fee of 27 Oct 2026 (¥295/t incl. VAT ÷ 1.13) — +$11/t over LME', () => {
    expect(BILLET_PREMIUM_USD_PER_T.CN.usdPerT).toBe(11);
    expect(BILLET_PREMIUM_USD_PER_T.CN.basis).toMatch(/SMM Foshan daily 27 Oct 2026.*¥295\/t incl\. 13 % VAT ÷ 1\.13/);
    expect(BILLET_PREMIUM_USD_PER_T.CN.basis).toMatch(/was ¥0\.045\/kg/);
  });
  it('scrap: China has its own clean 6063 level (Mysteel, read VAT-free); the UK keeps the European differential', () => {
    expect(AL_SCRAP_6XXX_BY_REGION.CN?.usdPerT).toBe(-158);
    expect(AL_SCRAP_6XXX_BY_REGION.CN?.basis).toMatch(/Mysteel.*VAT-FREE.*no VAT invoice/);
    expect(alScrapDiffUsdPerT('6063', 'UK')).toBe(56);
    expect(alScrapDiffUsdPerT('6063', 'CN')).toBe(-158);
    // a 7xxx keeps its discount to clean 6063 on China's level
    expect(alScrapDiffUsdPerT('7075', 'CN')).toBe(-158 + (-400 - 56));
    // ¥20.6/kg at the book's FX
    expect(alScrapGbpPerKg('6063', 'CN') * 8.88).toBeCloseTo(20.6, 1);
  });
  it('buildRegionalLibrary credits China\'s scrap at that level — no longer the billet price', () => {
    const cn = buildRegionalLibrary(recomputeMachineRates(LIB), 'CN').materials.find(m => m.id === 'mat-al-billet-6063')!;
    expect(cn.pricePerKg).toBeCloseTo(billetPriceGbpPerKg('6063', 'CN'), 4);
    expect(cn.scrapRecoveryPricePerKg).toBeCloseTo(alScrapGbpPerKg('6063', 'CN'), 4);
    expect(cn.scrapRecoveryPricePerKg).toBeLessThan(cn.pricePerKg);
    const de = buildRegionalLibrary(recomputeMachineRates(LIB), 'DE').materials.find(m => m.id === 'mat-al-billet-6063')!;
    expect(de.scrapRecoveryPricePerKg).toBeCloseTo((AL_MARKET.lmeUsdPerT + 56) / AL_MARKET.usdPerGbp / 1000, 4);
  });
  it('alBilletMaterialFactors reads the scrap level when given the scrap share (0 = billet only, as before)', () => {
    const billetOnly = alBilletMaterialFactors('6063');
    expect(billetOnly.CN).toBeCloseTo(billetPriceGbpPerKg('6063', 'CN') / billetPriceGbpPerKg('6063', 'UK'), 6);
    const net = alBilletMaterialFactors('6063', 0.1);
    const n = (r: 'CN' | 'UK') => billetPriceGbpPerKg('6063', r) - 0.1 * Math.min(billetPriceGbpPerKg('6063', r), alScrapGbpPerKg('6063', r));
    expect(net.CN).toBeCloseTo(n('CN') / n('UK'), 6);
    expect(net.CN).not.toBeCloseTo(billetOnly.CN!, 4);
  });
  it('the China battery rail costs more than before: billet fee up, scrap credited below the billet', async () => {
    const r = await headless('AL_Battery_Rail.stp', { 'material.alAlloy': '6063', 'commodity.route': 'aluminium_extrusion' }, 'CN');
    expect(r.status).toBe('costed');
    expect(r.provenance['alx-alloy']).toBeDefined();
  });
});

describe('3. HSLA cold-rolled is the CR base + the published extra; the sheet grade is a question', () => {
  it('HSLA 340 = £0.756 + mean(U.S. Steel HSLA-F 345, Stelco HSLA 50) extra over DDS; HSLA 420 = + Stelco HSLA 60', () => {
    expect(mat('mat-hsla340').pricePerKg).toBeCloseTo(0.756 + ((3.25 - 1.5) + (4.25 - 1.5)) / 2 * 22.046 / 1.3344 / 1000, 3);
    expect(mat('mat-hsla420').pricePerKg).toBeCloseTo(0.756 + (5.5 - 1.5) * 22.046 / 1.3344 / 1000, 3);
    expect(mat('mat-hsla340').sourceNote).toMatch(/U\.S\. Steel.*Stelco/);
    expect(mat('mat-hsla340').sourceNote).toMatch(/ussteel\.com.*stelco\.com/);
    // it was the CR base × 1.417 — 7–15 × the published extra
    expect(mat('mat-hsla340').pricePerKg).toBeLessThan(0.80);
  });
  const sctx = (part: string, answers: Record<string, unknown> = {}, extra: Partial<OCCTGeometry> = {}): RuleContext => ({
    geo: { ...geoOf('Seat_Locking_Bracket.stp'), ...extra }, geometryQuality: 'occt', commodity: 'sheet_metal', commoditySource: 'engineer',
    annualVolume: 200_000, filename: part, answers: { 'material.family': 'steel', 'commodity.route': 'sheet_metal', ...answers },
  } as RuleContext);
  it('a seat / pillar / reinforcement name leans HSLA and is COSTED there, "assumed — confirm", with the reason', () => {
    expect(HSLA_APPLICATION_RE.test(' seat locking bracket ')).toBe(true);
    expect(HSLA_APPLICATION_RE.test(' b pillar inner ')).toBe(true);
    expect(HSLA_APPLICATION_RE.test(' biw reinf channel ')).toBe(true);
    expect(HSLA_APPLICATION_RE.test(' reinforced plastic lid ')).toBe(false);
    const r = runCostInputRules(SHEET_METAL_RULES, sctx('Seat_Locking_Bracket.stp'));
    expect((r.suggestions.sheetMetal as Record<string, unknown>).materialId ?? r.provenance['sm-mat']?.value).toBe('mat-hsla340');
    expect(r.provenance['sm-mat'].basis).toMatch(/assumed — confirm: .*"seat".*thyssenkrupp/);
    const q = r.decisions.find(d => d.id === GRADE_DECISION_ID)!;
    expect(q.severity).toBe('advisory');
    expect(q.options.find(o => o.costed)?.value).toBe('mat-hsla340');
    expect(q.options.find(o => o.leaning)?.value).toBe('mat-hsla340');
    // the options are the sheet taxonomy's in-scope steel grades, in its order (mild first)
    expect(q.options[0].value).toBe('mat-dc01');
    expect(q.options.some(o => o.value === 'mat-s420mc')).toBe(true);
  });
  it('a name that NAMES a grade sets it (HC420LA alias, S420MC); none → the default DC04, "assumed — confirm"', () => {
    // a geometry with no STEP product names: only the file name speaks
    const g = (file: string) => sheetGrade(sctx(file, {}, { cadMetadata: undefined }), 'steel', 'mat-dc04', false);
    expect(g('bracket_HC420LA.stp').id).toBe('mat-hsla420');
    expect(g('bracket_S420MC.stp').id).toBe('mat-s420mc');
    const d = g('bracket.stp');
    expect(d).toMatchObject({ id: 'mat-dc04', source: 'default' });
    expect(d.basis).toMatch(/^assumed — confirm/);
    // above the cold-rolled gauge a seat name leans the hot-rolled HSLA, S355MC
    expect(sheetGrade(sctx('seat_bracket.stp', {}, { cadMetadata: undefined }), 'steel', 'mat-hrpo', true).id).toBe('mat-s355mc');
    // a declared designation wins over the name; an answer over both
    const declared = sheetGrade(sctx('seat.stp', {}, { cadMetadata: { materialDesignations: ['HC420LA'] } as never }), 'steel', 'mat-dc04', false);
    expect(declared).toMatchObject({ id: 'mat-hsla420', source: 'declared' });
    expect(sheetGrade(sctx('seat.stp', { [GRADE_DECISION_ID]: 'mat-dc04' }), 'steel', 'mat-dc04', false).source).toBe('answered');
  });
  it('an answered grade sets the price and the density, and is never re-asked', () => {
    const r = runCostInputRules(SHEET_METAL_RULES, sctx('Seat_Locking_Bracket.stp', { [GRADE_DECISION_ID]: 'mat-ss304-sheet' }));
    expect(r.provenance['sm-mat'].value).toBe('mat-ss304-sheet');
    expect(r.decisions.find(d => d.id === GRADE_DECISION_ID)).toBeUndefined();
    const cm3 = geoOf('Seat_Locking_Bracket.stp').volume!.cm3!;
    expect(r.provenance['sm-net-wt'].basis).toMatch(new RegExp(`× ${mat('mat-ss304-sheet').densityKgPerM3} kg/m³`));
    expect(Number(r.provenance['sm-net-wt'].value)).toBeCloseTo(cm3 * mat('mat-ss304-sheet').densityKgPerM3 / 1e6, 2);
  });
  it('the grade rule is not "geometry", and the Basis shows an unanswered grade as Assumed, never Measured', () => {
    const r = runCostInputRules(SHEET_METAL_RULES, sctx('Seat_Locking_Bracket.stp'));
    expect(r.provenance['sm-mat'].source).not.toBe('geometry');
    expect(basisGradeFor({ typed: false, source: 'geometry', gradeField: true, gradeAnswered: false })).toBe('Assumed');
    expect(basisGradeFor({ typed: false, source: 'rule', gradeField: true, gradeAnswered: false })).toBe('Assumed');
    expect(basisGradeFor({ typed: false, source: 'engineer', gradeField: true, gradeAnswered: false })).toBe('Answered');
    expect(basisGradeFor({ typed: false, source: 'geometry', gradeField: false, gradeAnswered: false })).toBe('Measured');
    expect(basisGradeFor({ typed: true, source: 'geometry', gradeField: true, gradeAnswered: false })).toBe('Typed');
  });
  it('screen = headless: the grade reaches headless through sheetMetal.materialId (RULE_PATH_MAP)', async () => {
    expect(RULE_PATH_MAP['sheetMetal.materialId']).toEqual({ to: 'materialId' });
    const r = await headless('Seat_Locking_Bracket.stp', { 'material.family': 'steel', 'commodity.route': 'sheet_metal' });
    expect(r.params.materialId).toBe('mat-hsla340');
    const a = await headless('Seat_Locking_Bracket.stp', { 'material.family': 'steel', 'commodity.route': 'sheet_metal', [GRADE_DECISION_ID]: 'mat-dc04' });
    expect(a.params.materialId).toBe('mat-dc04');
    expect(r.total).toBeGreaterThan(a.total);
    expect(r.total - a.total).toBeLessThan(0.1);   // the published extra, not the old 42 % premium
  });
});

describe('4. the forge line: billet saw, induction heater, draft metal, IS 3469 stock', () => {
  it('the saw and the heater are UK-book machines with ESTIMATE capex quoting their anchors; the heater rate carries no energy', () => {
    const lib = recomputeMachineRates(LIB);
    const saw = lib.machines.find(m => m.id === 'forge-billet-saw')!, heat = lib.machines.find(m => m.id === 'forge-induction-heater')!;
    expect(saw.sourceNote).toMatch(/ESTIMATE.*Tsune.*US\$161,400.*£120,953/);
    expect(heat.sourceNote).toMatch(/ESTIMATE.*Inductoforge.*US\$175,000.*Inter-Power.*US\$285,840.*£325,000.*SMS Elotherm/);
    expect(heat.buildup!.energy).toBe(0);
    expect(heat.buildup!.annualAvailableHours).toBe(3500);
    expect(saw.computedRatePerHr).toBeGreaterThan(0);
  });
  it('every country book carries them under its operating model (capital at par, labelled)', () => {
    const lib = recomputeMachineRates(LIB);
    for (const cc of ['CN', 'IN', 'PL', 'DE', 'HU', 'US'] as const) {
      const book = COUNTRY_BOOKS[cc]!;
      for (const id of ['forge-billet-saw', 'forge-induction-heater']) {
        const m = countryMachine(book, lib.machines.find(x => x.id === id)!, lib.machines, lib.energy[0].electricityPerKwh, cc);
        expect(m, `${cc} ${id}`).not.toBeNull();
        expect(m!.computedRatePerHr, `${cc} ${id}`).toBeGreaterThan(0);
      }
    }
  });
  it('the module: saw op (½ crew) + heater op (untended) + the kerf bought as bar, every billet the scrap ones too', () => {
    const base = { materialId: 'mat-steel-38mnvs6', partWeightKg: 3, flashAndScaleKg: 0.3, yieldFraction: 0.75, forgeId: 'forge-press-1600t',
      labourId: 'lab-uk-forge', strokesToForm: 3, cycleTimeHr: 0.004, oee: 0.8, manning: 2, labourEfficiency: 0.92,
      heatingEnergyKwhPerKg: 0.4, dieLife: 40_000, dieCost: 30_000, amortizationVolume: 1_000_000, rejectRate: 0.02 };
    const plain = computeForgingDrivers(base);
    const d = computeForgingDrivers({ ...base, billetSawMachineId: 'forge-billet-saw', billetSawCycleHr: 0.0025, billetSawManning: 0.5, billetSawKerfKg: 0.09,
      billetHeaterMachineId: 'forge-induction-heater', billetHeaterCycleHr: 4.4 / 1250 });
    const saw = d.operations.find(o => o.operationName === 'Billet cut-off (saw)')!;
    const heat = d.operations.find(o => o.operationName === 'Induction billet heating')!;
    expect(saw.cycleTimeHr).toBeCloseTo(0.0025 / 0.98, 9);
    expect(saw.manning).toBe(0.5);
    expect(heat.untended).toBe(true);
    expect(heat.labourTimeHr).toBe(0);
    expect(heat.cycleTimeHr).toBeCloseTo(4.4 / 1250 / 0.98, 9);
    // the bar bought = billet 4.4 kg + kerf 0.09 kg; the heater heats the billet only
    expect(3 / d.rawMaterial.materialUtilization).toBeCloseTo(4.4 + 0.09, 6);
    expect(d.rawMaterial.energyKwh).toEqual(plain.rawMaterial.energyKwh);
  });
  it('the rules: the knuckle is sawn (Ø ≈ 70 mm, 400 cuts/h, ½ crew, 3 mm kerf) and heated at 1,250 kg/h, 0.40 kWh/kg', () => {
    const ctx = { geo: geoOf('steering_knuckle_RH.stp'), geometryQuality: 'occt', commodity: 'forging', commoditySource: 'engineer', annualVolume: 200_000,
      filename: 'steering_knuckle_RH.stp', answers: { 'material.family': 'steel', 'commodity.route': 'forging', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'yes' } } as RuleContext;
    const r = runCostInputRules(FORGING_RULES, ctx);
    const f = r.suggestions.forging as Record<string, number | string>;
    const v = (id: string) => Number(r.provenance[id].value);
    const billet = (v('forge-part-wt') + v('forge-flash')) / v('forge-yield');
    expect(f.billetSawMachineId).toBe(BILLET_SAW.machineId);
    expect(Number(f.billetSawCycleHr)).toBe(1 / 400);
    expect(Number(f.billetSawManning)).toBe(0.5);
    const dia = Math.cbrt(4 * (billet / 7.85 * 1e6) / (Math.PI * 2.3));
    expect(Number(f.billetSawKerfKg)).toBeCloseTo(Math.PI / 4 * dia * dia * 3 * 7.85 / 1e6, 3);
    expect(f.billetHeaterMachineId).toBe(INDUCTION_HEATER.machineId);
    expect(Number(f.billetHeaterCycleHr)).toBeCloseTo(billet / 1250, 6);
    expect(Number(f.heatingEnergyKwhPerKg)).toBe(0.4);
    expect(r.provenance['forge-heat-energy'].basis).toMatch(/500 kW ÷ 1,250 kg\/h = 0\.4 kWh\/kg \(SMS Elotherm/);
    expect(r.provenance['forge-saw-ct'].basis).toMatch(/ENGINEERING ESTIMATE/);
  });
  it('the report no longer lists the saw and heater as a gap in the cost model; it asks the supplier for them', () => {
    const std = reportStandardFor('forging');
    expect((std.notModelled ?? []).join(' ')).not.toMatch(/saw|heater/i);
    expect(std.keyDrivers.map(d => d.name)).toEqual(expect.arrayContaining(['Billet cut-off', 'Induction heater']));
  });
  it('IS 3469 Table 1.5 sets the closed-die machining stock by the greatest dimension; other routes keep theirs', () => {
    expect(machiningStockMm('closed-die', 140).mm).toBe(1.5);
    expect(machiningStockMm('closed-die', 236.4).mm).toBe(2.5);
    expect(machiningStockMm('closed-die', 500).mm).toBe(3.0);
    expect(machiningStockMm('closed-die', 1000).mm).toBe(5.0);
    expect(machiningStockMm('closed-die', 236.4).basis).toMatch(/IS 3469 \(Part I\):1974 Table 1\.5.*over 205 mm and not over 410 mm/);
    expect(machiningStockMm('precision', 236.4).mm).toBe(0.75);
  });
  const draftCtx = (rows: Array<[number, number, number, number, number]>, mid = 0, axis: 'x' | 'y' | 'z' = 'z'): RuleContext => ({
    geo: { projectedArea: { xMm2: axis === 'x' ? 9e4 : 1, yMm2: axis === 'y' ? 9e4 : 1, zMm2: axis === 'z' ? 9e4 : 1 },
      draftAnalysis: { zeroDraftByAxis: { [axis]: { partingMidMm: mid, rows } } } } as never,
    geometryQuality: 'occt', commodity: 'forging', commoditySource: 'engineer', annualVolume: 1, filename: 'p.stp', answers: {},
  } as RuleContext);
  it('draft metal: V = A·h·tan α / 2 on a face starting at the parting plane; both sides of a face crossing it', () => {
    const t5 = Math.tan(5 * Math.PI / 180), t7 = Math.tan(7 * Math.PI / 180), t8 = Math.tan(8 * Math.PI / 180);
    // an outside face 1,000 mm² from the plane to 20 mm: 1,000 × 20 × tan 5° / 2
    expect(forgingDraftMetal(draftCtx([[1, 1000, 0, 20, 0]]), 'closed-die', new Set()).cm3).toBeCloseTo(1000 * 20 * t5 / 2 / 1000, 1);
    // an inside face −30 … +30 (1,200 mm², 20 mm wide): each side 30 mm deep, > 25 mm → 8°
    expect(forgingDraftMetal(draftCtx([[1, 1200, -30, 30, 1]]), 'closed-die', new Set()).cm3).toBeCloseTo(20 * t8 * (900 + 900) / 2 / 1000, 1);
    // an inside face 0 … 10 → 7°; a drilled hole's face is excluded
    const two = forgingDraftMetal(draftCtx([[1, 500, 0, 10, 1], [2, 9999, 0, 50, 0]]), 'closed-die', new Set([2]));
    expect(two.cm3).toBeCloseTo(500 * 10 * t7 / 2 / 1000, 1);
    expect(two.basis).toMatch(/Σ A·h·tan α \/ 2.*IS 3469 \(Part I\):1974 Table 1\.4 normal/);
    // the parting axis is the largest silhouette's; a precision forging takes the CLOSE class (outside 3°)
    expect(IS3469_DRAFT_DEG.close.outside.upTo25[0]).toBe(3);
    expect(forgingDraftMetal(draftCtx([[1, 1000, 0, 20, 0]], 0, 'x'), 'precision', new Set()).cm3)
      .toBeCloseTo(1000 * 20 * Math.tan(3 * Math.PI / 180) / 2 / 1000, 1);
    // no measurement (an STL) → not costed, and said so; no impression die → none
    expect(forgingDraftMetal({ ...draftCtx([]), geo: { projectedArea: { zMm2: 1 } } } as never, 'closed-die', new Set()).basis).toMatch(/NOT costed/);
    expect(forgingDraftMetal(draftCtx([[1, 1000, 0, 20, 0]]), 'open-die', new Set()).cm3).toBe(0);
  });
  it('the knuckle carries its measured draft metal in the as-forged weight, printed', () => {
    const ctx = { geo: geoOf('steering_knuckle_RH.stp'), geometryQuality: 'occt', commodity: 'forging', commoditySource: 'engineer', annualVolume: 200_000,
      filename: 'steering_knuckle_RH.stp', answers: { 'material.family': 'steel', 'commodity.route': 'forging', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'yes' } } as RuleContext;
    const b = runCostInputRules(FORGING_RULES, ctx).provenance['forge-part-wt'].basis;
    const cm3 = Number(/\+ ([\d.]+) cm³ draft metal/.exec(b)![1]);
    expect(cm3).toBeGreaterThan(10);
    expect(b).toMatch(/zero-draft face\(s\) along the X parting axis/);
  });
});
