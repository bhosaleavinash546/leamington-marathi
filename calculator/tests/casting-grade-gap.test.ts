/**
 * Casting grade gap review (Oct 2026): 11 common automotive casting grades the library lacked, each
 * priced as its library sibling + the change in alloy content (arithmetic in its note), filed in the
 * picker, reachable by the grade question and a declared designation, costed in all 39 countries.
 * docs/cad/casting-grade-gap-2026-10.md.
 */
import { COUNTRY_BOOKS } from '../src/engine/country-books.js';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { MATERIAL_SCOPE_BY_COMMODITY } from '../src/engine/material-scope.js';
import { REGIONAL_DATA, buildRegionalLibrary, classifyMaterialFamily, type ManufacturingRegion } from '../src/engine/regional-rates.js';
import { castGradeInfo } from '../src/engine/casting-material-taxonomy.js';
import { castingAlloyOf, meltFactsFor } from '../src/engine/casting-melt.js';
import { BRITTLE_IRON, gradeCandidates, gradeEvidence } from '../src/engine/cost-input-rules/derive/grade.js';
import { familyFromMaterialId } from '../src/engine/cost-input-rules/derive/material.js';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const LIB = DEFAULT_RATE_LIBRARY;
const mat = (id: string) => LIB.materials.find(m => m.id === id)!;

/** id → [UK £/kg, family, casting advisor alloy, sibling]. */
const GAP: Record<string, [number, string, string, string]> = {
  'mat-en-ac-46200': [2.85, 'aluminium', 'aluminium', 'mat-lm4'],
  'mat-en-ac-45300': [3.11, 'aluminium', 'aluminium', 'mat-lm25'],
  'mat-lm13': [3.08, 'aluminium', 'aluminium', 'mat-lm6'],
  'mat-gjl150': [0.56, 'cast iron', 'grey-iron', 'mat-gjl200'],
  'mat-gjs350-lt': [0.87, 'cast iron', 'ductile-iron', 'mat-gjs400'],
  'mat-gjs500-14': [0.84, 'cast iron', 'ductile-iron', 'mat-gjs450-ssf'],
  'mat-gjv500': [1.15, 'cast iron', 'ductile-iron', 'mat-gjv450'],
  'mat-ni-resist-d5s': [4.89, 'cast iron', 'ductile-iron', 'mat-ni-resist-d2'],
  'mat-astm-a216-wcb': [2.10, 'steel', 'carbon-steel', 'mat-gs-c25'],
  'mat-gx40crnisi25-20': [6.65, 'steel', 'stainless-steel', 'mat-ss304-cast'],
  'mat-cusn12-cast': [14.43, 'copper alloy', 'copper', 'mat-bronze-c905'],
};
const IDS = Object.keys(GAP);

describe('1. the grades, each priced from its sibling with the arithmetic shown', () => {
  it.each(IDS)('%s: in the library, in the casting scope, priced as stated', id => {
    const m = mat(id);
    expect(m, id).toBeDefined();
    expect(MATERIAL_SCOPE_BY_COMMODITY.casting.test(m.category)).toBe(true);
    expect(MATERIAL_SCOPE_BY_COMMODITY.cast_and_machine.test(m.category)).toBe(true);
    expect(m.pricePerKg).toBeCloseTo(GAP[id][0], 2);
    expect(m.sourceNote).toContain(GAP[id][3]);                       // names its sibling
    expect(m.sourceNote).toContain(`= £${m.pricePerKg.toFixed(2)}/kg`);   // and its result
    expect(m.region).toBe('UK');
  });

  it('the alloy arithmetic reproduces (Ni-Resist D-5S, 1.4848, LM13)', () => {
    // D-2 + 15% Ni × £12.38 + 3% Si × £1.00 − 18% of GJS-400 £0.82
    expect(mat('mat-ni-resist-d2').pricePerKg + 0.15 * 12.38 + 0.03 * 1.00 - 0.18 * 0.82).toBeCloseTo(4.89, 2);
    // CF8 + 6% Cr × £1.94 + 11% Ni × £12.38
    expect(mat('mat-ss304-cast').pricePerKg + 0.06 * 1.94 + 0.11 * 12.38).toBeCloseTo(6.65, 2);
    // LM6 + 1% Cu + 1% Ni + 1% Mg − 3% Al
    expect(mat('mat-lm6').pricePerKg + 0.01 * 10.77 + 0.01 * 12.38 + 0.01 * 1.77 - 0.03 * 2.85).toBeCloseTo(3.08, 2);
  });

  it('estimates are labelled and carry Low confidence', () => {
    for (const id of ['mat-gjl150', 'mat-gjs350-lt']) {
      expect(mat(id).sourceNote).toMatch(/ESTIMATE/);
      expect(mat(id).confidence).toBe('Low');
    }
  });
});

describe('2. the workflow reaches them', () => {
  it.each(IDS)('%s: family, advisor alloy and melt data; filed in the picker', id => {
    expect(familyFromMaterialId(id)).toBe(GAP[id][1]);
    expect(castingAlloyOf(id)).toBe(GAP[id][2]);
    expect(meltFactsFor(id)).not.toBeNull();
    expect(castGradeInfo(mat(id)).known).toBe(true);
  });

  it('the grade question offers them on their route', () => {
    const ids = (fam: Parameters<typeof gradeCandidates>[1], sub?: string) => gradeCandidates('casting', fam, sub).map(m => m.id);
    expect(ids('cast iron')).toEqual(expect.arrayContaining(['mat-gjl150', 'mat-gjs350-lt', 'mat-gjs500-14', 'mat-gjv500', 'mat-ni-resist-d5s']));
    expect(ids('steel')).toEqual(expect.arrayContaining(['mat-astm-a216-wcb', 'mat-gx40crnisi25-20']));
    expect(ids('copper alloy')).toContain('mat-cusn12-cast');
    expect(ids('aluminium', 'gravity')).toEqual(expect.arrayContaining(['mat-en-ac-46200', 'mat-en-ac-45300', 'mat-lm13']));
    expect(ids('aluminium', 'hpdc')).not.toContain('mat-lm13');     // gravity / sand alloys are not offered for HPDC
  });

  it('grey EN-GJL-150 is brittle (safety-critical check)', () => {
    expect(BRITTLE_IRON.test('mat-gjl150')).toBe(true);
    expect(BRITTLE_IRON.test('mat-gjs500-14')).toBe(false);
  });

  const declared = (text: string, fam: Parameters<typeof gradeCandidates>[1]) => gradeEvidence(
    { geo: { cadMetadata: { productNames: [], materialDesignations: [text] } }, answers: {}, filename: 'part.stp', commodity: 'casting' } as unknown as RuleContext,
    gradeCandidates('casting', fam))?.id;

  it('a declared designation finds its own grade — the full designation beats a shared stem', () => {
    expect(declared('EN-GJS-500-14', 'cast iron')).toBe('mat-gjs500-14');
    expect(declared('EN-GJS-500-7', 'cast iron')).toBe('mat-gjs500');      // not the 500-14 that shares "EN-GJS-500"
    expect(declared('GJS-500', 'cast iron')).toBe('mat-gjs500');           // a bare stem → the base grade
    expect(declared('EN-GJS-350-22-LT', 'cast iron')).toBe('mat-gjs350-lt');
    expect(declared('EN-GJV-500', 'cast iron')).toBe('mat-gjv500');
    expect(declared('1.4848', 'steel')).toBe('mat-gx40crnisi25-20');
    expect(declared('ASTM A216 WCB', 'steel')).toBe('mat-astm-a216-wcb');
    expect(declared('CuSn12-C', 'copper alloy')).toBe('mat-cusn12-cast');
  });
});

describe('3. priced in every country', () => {
  const regions = Object.keys(REGIONAL_DATA) as ManufacturingRegion[];

  it('there are 39 countries', () => expect(regions.length).toBe(39));

  it.each(regions)('%s: every new grade has a £/kg = UK × that country\'s factor for its metal class', region => {
    const book = buildRegionalLibrary(LIB, region);
    const rd = REGIONAL_DATA[region];
    for (const id of IDS) {
      // A country with its own rate book prices the grade from its own evidence (India, Oct 2026: foundry charge).
      if (COUNTRY_BOOKS[region]?.materials[id]) continue;
      const uk = mat(id);
      const local = book.materials.find(m => m.id === id)!;
      const cls = classifyMaterialFamily(uk);
      const factor = cls === 'millSteel' ? rd.materialMultiplier : rd.materialFactors.highPerfResin;
      expect(local.pricePerKg, `${region} ${id}`).toBeCloseTo(uk.pricePerKg * factor, 6);
      expect(local.pricePerKg).toBeGreaterThan(0);
    }
  });

  it('iron and steel follow the country\'s steel factor; aluminium, copper and the Ni-bearing iron is classed by category', () => {
    expect(classifyMaterialFamily(mat('mat-gjl150'))).toBe('millSteel');
    expect(classifyMaterialFamily(mat('mat-astm-a216-wcb'))).toBe('millSteel');
    expect(classifyMaterialFamily(mat('mat-lm13'))).toBe('exchangeMetal');
    expect(classifyMaterialFamily(mat('mat-cusn12-cast'))).toBe('exchangeMetal');
  });
});

describe('4. costed end to end (headless = the product\'s chain)', () => {
  const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
    Array<{ part: string; geometry: OCCTGeometry }>;
  const BRACKET = 'Casting_Braket.stp';
  const geo = () => structuredClone(baseline.find(b => b.part === BRACKET)!.geometry);
  const ANS = { 'material.family': 'cast iron', 'commodity.route': 'cast_and_machine', 'service.pressureTight': 'no',
    'service.toleranceClass': 'standard', 'service.safetyCritical': 'no' };
  const cost = async (answers: Record<string, unknown>, region: ManufacturingRegion = 'UK') => await costMeasuredPart(geo(), BRACKET,
    { partNumber: BRACKET, file: BRACKET, annualVolume: 50_000, commodity: 'cast_and_machine' } as never, answers, region,
    { annualVolume: 50_000 } as never, recomputeMachineRates(LIB), { partNumber: BRACKET, file: BRACKET, status: 'error' } as never) as
    { status: string; total: number };

  it('the cast-and-machine bracket costs in Ni-Resist D-5S above GJL-250 and in GJL-150 below it', async () => {
    const base = await cost(ANS);
    const d5s = await cost({ ...ANS, 'material.grade': 'mat-ni-resist-d5s' });
    const gjl150 = await cost({ ...ANS, 'material.grade': 'mat-gjl150' });
    expect(base.status).toBe('costed');
    expect(d5s.total).toBeGreaterThan(base.total);
    expect(gjl150.total).toBeLessThan(base.total);
  });

  it('the same grade costs in India in India\'s book', async () => {
    const uk = await cost({ ...ANS, 'material.grade': 'mat-gjs500-14' });
    const india = await cost({ ...ANS, 'material.grade': 'mat-gjs500-14' }, 'IN');
    expect(india.status).toBe('costed');
    expect(india.total).toBeLessThan(uk.total);
  });
});
