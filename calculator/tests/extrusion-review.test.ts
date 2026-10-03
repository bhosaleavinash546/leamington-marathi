/**
 * The extrusion review, Oct 2026 — one test per finding.
 *
 * docs/cad/extrusion-review-2026-10.md has the findings, the sources and the
 * hand reconciliation. Aluminium first, then the polymer grades the review added.
 */
import { describe, it, expect } from 'vitest';
import {
  AL_ALLOYS, AL_ALLOY_LIST, AL_LINE, AL_DOWNSTREAM, AL_MARKET, SCRAP_DIFF_6XXX_USD, alScrapGbpPerKg, alBilletId,
} from '../src/engine/al-extrusion-data.js';
import { planAlExtrusion, chooseDieType } from '../src/engine/modules/aluminium-extrusion-advisor.js';
import { buildAlExtrusionInputs, computeAluminiumExtrusionDrivers, temperNeeds, ctlSecPerPart } from '../src/engine/modules/aluminium-extrusion.js';
import { ALUMINIUM_EXTRUSION_RULES, alloyEvidence } from '../src/engine/cost-input-rules/commodities/aluminium-extrusion.js';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { buildRegionalLibrary } from '../src/engine/regional-rates.js';
import { extrusionFamilyOf } from '../src/engine/modules/extrusion-advisor.js';
import { MATERIAL_SCOPE_BY_SELECT } from '../src/ui/material-scope.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

const LIB = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const CRASH = { areaMm2: 1386, perimeterMm: 918, ccdMm: 144.2, voids: 2, minWallMm: 3, partLengthMm: 400 };
const spec = (over: Partial<Parameters<typeof buildAlExtrusionInputs>[0]> = {}) => buildAlExtrusionInputs({
  alloy: '6082', route: 'direct', section: CRASH, partWeightKg: 1.49, annualVolume: 50_000, temper: 'T6',
  finish: 'mill', finishAreaM2: 0.37, bends: 0, cncMinutes: 0, cncFixturings: 0, fabFeatureRows: 0, ...over,
});
const stack = (b: ReturnType<typeof buildAlExtrusionInputs>, lib = LIB) => computeUniversalStack({
  partName: 'p', packagingPerPart: 0, logisticsPerPart: 0, overheadPct: 0, marginPct: 0,
  ...computeAluminiumExtrusionDrivers(b.inputs),
} as never, lib);

describe('1. grades: every wrought alloy extruded in volume', () => {
  it('30 alloys across all six extrusion series, each with a billet in the library', () => {
    expect(AL_ALLOY_LIST.length).toBe(30);
    const series = new Set(AL_ALLOY_LIST.map(a => AL_ALLOYS[a].series));
    for (const s of ['1xxx', '2xxx', '3xxx', '5xxx', '6xxx', '7xxx']) expect(series.has(s as never)).toBe(true);
    for (const a of ['1350', '1070A', '3103', '5754', '5086', '6063A', '6106', '6008', '6351', '6026', '2011', '2014', '2017A', '7005', '7046']) {
      expect(AL_ALLOY_LIST, a).toContain(a);
      expect(LIB.materials.some(m => m.id === alBilletId(a as never)), a).toBe(true);
    }
  });
  it('every alloy states where its speed comes from, and its default temper is one it is supplied in', () => {
    for (const a of AL_ALLOY_LIST) {
      const d = AL_ALLOYS[a];
      expect(d.speedBasis, a).toMatch(/m\/min/);
      expect(d.tempers, a).toContain(d.defaultTemper);
      expect(d.densityKgPerM3, a).toBeGreaterThan(2600); expect(d.densityKgPerM3, a).toBeLessThan(2900);
    }
  });
  it('published relative extrudability orders the speeds: 1350 > 3003 > 6063 > 6061 > 5083, 2024 > 7075', () => {
    const v = (a: string) => AL_ALLOYS[a as never as keyof typeof AL_ALLOYS].baseExitSpeedMPerMin;
    expect(v('1350')).toBeGreaterThan(v('3003'));
    expect(v('3003')).toBeGreaterThan(v('6063'));
    expect(v('6063')).toBeGreaterThan(v('6061'));
    expect(v('6061')).toBeGreaterThan(v('5083'));
    expect(v('2024')).toBeGreaterThan(v('7075'));
    expect(v('7075')).toBeGreaterThanOrEqual(0.8); expect(v('7075')).toBeLessThanOrEqual(2);   // published band
  });
  it('tempers: 2024 T3511 is solution-treated not aged; 6008 T7 ages; 7075 T73 does both', () => {
    expect(temperNeeds('2024', 'T3511')).toEqual({ age: false, sht: true });
    expect(temperNeeds('6008', 'T7')).toEqual({ age: true, sht: false });
    expect(temperNeeds('7075', 'T73')).toEqual({ age: true, sht: true });
    expect(temperNeeds('5083', 'H112')).toEqual({ age: false, sht: false });
  });
});

describe('2. scrap is credited at what clean extrusion scrap sells for', () => {
  it('6xxx process scrap = LME + €48/t (Fastmarkets 2026), not 88% of LME', () => {
    expect(SCRAP_DIFF_6XXX_USD).toBe(56);
    expect(alScrapGbpPerKg('6063')).toBeCloseTo((AL_MARKET.lmeUsdPerT + 56) / AL_MARKET.usdPerGbp / 1000, 3);
    expect(alScrapGbpPerKg('6063')).toBeGreaterThan(AL_MARKET.lmeUsdPerT / AL_MARKET.usdPerGbp / 1000);
  });
  it('alloyed scrap (2xxx, 7xxx) is worth less than 6xxx', () => {
    expect(alScrapGbpPerKg('2024')).toBeLessThan(alScrapGbpPerKg('6063'));
    expect(alScrapGbpPerKg('7075')).toBeLessThan(alScrapGbpPerKg('6063'));
  });
});

describe('3. press force: container friction on the billet length', () => {
  it('the crash box (6082 hollow) is force-limited: the press cannot push its longest billet', () => {
    const p = planAlExtrusion({ ...CRASH, alloy: '6082', annualVolume: 50_000 });
    expect(p.forceLimitedBilletMm).not.toBeNull();
    expect(p.forceLimitedBilletMm!).toBeLessThan(1000);                  // the press's 1,000 mm max billet
    expect(p.billetMm).toBeLessThanOrEqual(p.forceLimitedBilletMm!);
    expect(p.forceT).toBeLessThanOrEqual(AL_LINE.forceUse * 2500 + 1);
  });
  it('friction rises with billet length — the breakthrough is above the deformation pressure on a direct press', () => {
    const p = planAlExtrusion({ ...CRASH, alloy: '6082', annualVolume: 50_000 });
    expect(p.basis.join(' ')).toMatch(/container friction \d+ on a \d+ mm billet/);
  });
  it('an indirect press has no container friction, so force does not cap the billet', () => {
    const p = planAlExtrusion({ ...CRASH, voids: 1, alloy: '7075', annualVolume: 50_000, route: 'indirect' });
    expect(p.forceLimitedBilletMm).toBeNull();
  });
  it('a soft 6063 profile is not force-limited on its press', () => {
    const p = planAlExtrusion({ areaMm2: 132, perimeterMm: 136, ccdMm: 42.7, voids: 0, minWallMm: 2, partLengthMm: 1200, alloy: '6060', annualVolume: 50_000 });
    expect(p.billetMm).toBeLessThan(p.forceLimitedBilletMm!);
  });
});

describe('4. mill lengths and cold cut-to-length', () => {
  it('the strand is cut into mill lengths of whole parts, each between the stacking minimum and the basket maximum', () => {
    for (const len of [150, 400, 1300, 1800]) {
      const p = planAlExtrusion({ ...CRASH, partLengthMm: len, alloy: '6082', annualVolume: 50_000 });
      expect(p.partsPerStrand).toBe(p.millLengthsPerStrand * p.partsPerMillLength);
      expect(p.millLengthMm).toBeLessThanOrEqual(AL_LINE.millLengthMaxMm);
      if (p.partsPerMillLength > 1) expect(p.millLengthMm).toBeGreaterThanOrEqual(AL_LINE.millLengthMinMm);
    }
  });
  it('the cold saw is an operation, and its time falls as a bundle grows', () => {
    const b = spec();
    expect(computeAluminiumExtrusionDrivers(b.inputs).operations.some(o => /cut-to-length/i.test(o.operationName))).toBe(true);
    expect(ctlSecPerPart(30, 10).sec).toBeLessThan(ctlSecPerPart(200, 10).sec);
  });
});

describe('5. semi-hollow sections', () => {
  it('a tongue of 3:1 or more takes a semi-hollow die', () => {
    expect(chooseDieType({ ...CRASH, voids: 0, tongueRatio: 13 }, '6060', 'direct').type).toBe('semi-hollow');
    expect(chooseDieType({ ...CRASH, voids: 0, tongueRatio: 0.4 }, '6060', 'direct').type).toBe('solid');
  });
});

describe('6. finishing: area by process, and what the coating consumes', () => {
  it('powder coats the outside only; anodise every surface', () => {
    const powder = spec({ finish: 'powder', finishOutsideAreaM2: 0.16 }).inputs;
    const anod = spec({ finish: 'anodise', finishOutsideAreaM2: 0.16 }).inputs;
    expect(powder.finishAreaM2).toBe(0.16);
    expect(anod.finishAreaM2).toBe(0.37);
  });
  it('coating consumables are charged per m²', () => {
    const mill = stack(spec()).breakdown.rawMaterial;
    const powder = stack(spec({ finish: 'powder', finishOutsideAreaM2: 0.16 })).breakdown.rawMaterial;
    expect(powder - mill).toBeCloseTo(AL_DOWNSTREAM.powder.consumablesGbpPerM2 * 0.16 / (1 - AL_LINE.rejectRate), 3);
  });
  it('stretch bending carries its form tooling', () => {
    const t0 = stack(spec()).breakdown.tooling;
    const t1 = stack(spec({ bends: 1 })).breakdown.tooling;
    expect((t1 - t0) * 50_000).toBeCloseTo(AL_DOWNSTREAM.bender.toolFirstGbp, 0);
  });
});

describe('7. energy is priced at the region\'s tariff', () => {
  it('billet heating and ageing gas are kWh on the material line, priced from the library', () => {
    const b = spec();
    const d = computeAluminiumExtrusionDrivers(b.inputs);
    expect(d.rawMaterial.energyKwh?.gas).toBeGreaterThan(0);
    const uk = stack(b, LIB);
    const cn = stack(b, buildRegionalLibrary(LIB, 'CN'));
    const gasUk = uk.traceability.find(t => t.field === 'rawMaterial.energyKwh.gas')!;
    const gasCn = cn.traceability.find(t => t.field === 'rawMaterial.energyKwh.gas')!;
    expect(gasUk.value).toBeCloseTo(d.rawMaterial.energyKwh!.gas! * LIB.energy[0].gasPerKwh, 6);
    expect(gasCn.value).not.toBeCloseTo(gasUk.value, 4);
  });
});

describe('8. reading the file: designation, drawing, name', () => {
  const ctx = (filename: string, designations: string[] = [], answers: Record<string, unknown> = {}) => ({
    filename, answers, commodity: 'aluminium_extrusion', annualVolume: 50_000, geometryQuality: 'occt',
    geo: { cadMetadata: { productNames: [], materialDesignations: designations } } as unknown as OCCTGeometry,
  } as unknown as RuleContext);
  it('a declared designation names the alloy and the temper, suffix included', () => {
    const e = alloyEvidence(ctx('part.stp', ['EN AW-6063A T5']));
    expect(e).toMatchObject({ alloy: '6063A', temper: 'T5' });
    expect(e.source).toMatch(/declared/);
  });
  it('a grade read off the drawing is evidence too — after a declared one', () => {
    expect(alloyEvidence(ctx('part.stp', [], { 'material.gradeText': 'AlZn5,5MgCu 7075-T73' })).alloy).toBe('7075');
    expect(alloyEvidence(ctx('part.stp', ['6082 T6'], { 'material.gradeText': '7075' })).alloy).toBe('6082');
  });
  it('the alloy stays a blocking question whatever the evidence', () => {
    const r = runCostInputRules(ALUMINIUM_EXTRUSION_RULES, ctx('RAIL 6005A.stp', ['EN AW-6005A T6']));
    const q = r.decisions.find(d => d.id === 'material.alAlloy')!;
    expect(q.severity).toBe('blocking');
    expect(q.options.find(o => o.value === '6005A')?.leaning).toBe(true);
  });
});

describe('9. polymer extrusion grades and the polymer form', () => {
  it('the review adds window / seal PVC, PP-R, PE-X, PA11, PVDF, TPV, POM, PEEK and capstock — each with its source', () => {
    for (const id of ['mat-upvc-window-profile', 'mat-pvcp-profile', 'mat-ppr-pipe', 'mat-pex-pipe', 'mat-pa11-tube', 'mat-pvdf-ext',
      'mat-tpv-profile', 'mat-pom-rod', 'mat-hdpe-profile', 'mat-ldpe-tube', 'mat-pa6-ext-tube', 'mat-tpu-ext-hose', 'mat-peek-ext', 'mat-asa-capstock']) {
      const m = LIB.materials.find(x => x.id === id);
      expect(m, id).toBeDefined();
      expect(m!.category).toBe('Extrusion');
      expect(m!.sourceNote.length, id).toBeGreaterThan(40);
    }
  });
  it('the polymer form no longer offers the aluminium billets', () => {
    const scope = MATERIAL_SCOPE_BY_SELECT['ext-mat'];
    expect(scope.test('Extrusion')).toBe(true);
    expect(scope.test('Aluminium Extrusion Billet')).toBe(false);
  });
  it('each grade extrudes as its own family — PVDF / PEEK were PE, PMMA was PE, medical PVC was rigid', () => {
    expect(extrusionFamilyOf('mat-pvdf-ext')).toBe('high-temp');
    expect(extrusionFamilyOf('mat-peek-ext')).toBe('high-temp');
    expect(extrusionFamilyOf('mat-pmma-ext-sheet')).toBe('abs');
    expect(extrusionFamilyOf('mat-pvc-medical-tube')).toBe('flex-pvc');
    expect(extrusionFamilyOf('mat-upvc-pipe')).toBe('rigid-pvc');
    expect(extrusionFamilyOf('mat-pvcp-profile')).toBe('flex-pvc');
  });
});
