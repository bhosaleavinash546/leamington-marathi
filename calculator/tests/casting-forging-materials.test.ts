/**
 * Casting & forging materials review, Oct 2026 — one test per finding.
 * docs/cad/casting-forging-materials-review-2026-10.md has the findings and sources.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { MATERIAL_SCOPE_BY_SELECT } from '../src/ui/material-scope.js';
import { CAD_MATERIALS_BY_COMMODITY } from '../src/ui/data/cad-options.js';
import { GRADE_SCOPE, GRADE_DECISION_ID, gradeCandidates, gradeEvidence, explicitGrade, gradedMaterialFacts } from '../src/engine/cost-input-rules/derive/grade.js';
import { representativeMaterialId } from '../src/engine/cost-input-rules/derive/material.js';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { CASTING_RULES } from '../src/engine/cost-input-rules/commodities/casting.js';
import { FORGING_RULES } from '../src/engine/cost-input-rules/commodities/forging.js';
import { answersFromContext } from '../server/routes/cad.js';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const LIB = DEFAULT_RATE_LIBRARY;
const price = (id: string) => LIB.materials.find(m => m.id === id)!.pricePerKg;
const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry; outcome: { total?: number } }>;
const geoOf = (p: string) => structuredClone(baseline.find(b => b.part === p)!.geometry);
const FLANGE = 'FORGE_Hub_Flange.stp', BRACKET = 'Casting_Braket.stp';
const FORGE_ANS = { 'material.family': 'steel', 'commodity.route': 'forging', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'no' };
const CAST_ANS = { 'material.family': 'cast iron', 'commodity.route': 'cast_and_machine', 'service.pressureTight': 'no',
  'service.toleranceClass': 'standard', 'service.safetyCritical': 'no' };
const ctx = (part: string, commodity: string, answers: Record<string, unknown>, designations: string[] = []): RuleContext => {
  const geo = geoOf(part);
  geo.cadMetadata = { ...(geo.cadMetadata ?? { productNames: [] }), materialDesignations: designations } as never;
  return { geo, geometryQuality: 'occt', commodity, commoditySource: 'engineer', annualVolume: 50_000, filename: part, answers } as RuleContext;
};
const headless = async (part: string, answers: Record<string, unknown>) =>
  await costMeasuredPart(geoOf(part), part, { partNumber: part, file: part, annualVolume: 50_000, commodity: answers['commodity.route'] } as never,
    answers, 'UK', { annualVolume: 50_000 } as never, recomputeMachineRates(LIB), { partNumber: part, file: part, status: 'error' } as never) as
    { status: string; total: number; provenance: Record<string, { value: unknown }> };

describe('1. the grades the review added, each priced from its sibling', () => {
  const NEW = ['mat-lm6', 'mat-lm4', 'mat-almg5-cast', 'mat-a206', 'mat-zamak2', 'mat-gjs450-ssf', 'mat-ni-resist-d2', 'mat-gjmb350',
    'mat-hicr-white', 'mat-g20mn5', 'mat-g42crmo4', 'mat-hadfield', 'mat-cf8m-cast', 'mat-ca6nm-cast', 'mat-cd4mcun-cast', 'mat-in713c-cast',
    'mat-lg2-gunmetal', 'mat-ab2-cast', 'mat-brass-cast-cb754',
    'mat-steel-c35', 'mat-steel-c45', 'mat-steel-c70s6', 'mat-steel-a105', 'mat-steel-30mnvs6', 'mat-steel-42crmo4', 'mat-steel-34crnimo6',
    'mat-steel-18crnimo7-6', 'mat-steel-16mncr5', 'mat-steel-41cr4', 'mat-steel-f22', 'mat-ss420-bar', 'mat-ss431-bar', 'mat-ss2205-bar',
    'mat-al2014-forge', 'mat-ab2-forge'];
  it('35 grades, each in its form\'s drop-down, each note showing its arithmetic', () => {
    for (const id of NEW) {
      const m = LIB.materials.find(x => x.id === id);
      expect(m, id).toBeDefined();
      expect(m!.sourceNote, id).toMatch(/Sibling \+ alloy content: mat-[a-z0-9-]+ £[\d.]+.* = £[\d.]+\/kg/);
      const inCast = MATERIAL_SCOPE_BY_SELECT['cast-mat'].test(m!.category);
      const inForge = MATERIAL_SCOPE_BY_SELECT['forge-mat'].test(m!.category);
      expect(inCast || inForge, id).toBe(true);
    }
  });
  it('the arithmetic orders the grades the way the metal does', () => {
    expect(price('mat-cf8m-cast')).toBeCloseTo(price('mat-ss304-cast') + 1.088, 2);      // Aperam 316 v 304 surcharge, Sep 2026
    expect(price('mat-steel-34crnimo6')).toBeGreaterThan(price('mat-steel-42crmo4'));    // + 1.5% Ni
    expect(price('mat-lm4')).toBeLessThan(price('mat-lm25'));                           // secondary v primary ingot
    expect(price('mat-lg2-gunmetal')).toBeLessThan(price('mat-bronze-c905'));           // 5% Sn v 10%
    expect(price('mat-ni-resist-d2')).toBeGreaterThan(3 * price('mat-gjs400'));          // 20% Ni
  });
});

describe('2. zinc and nickel alloys can now be reached from CAD', () => {
  it('casting offers zinc (Zamak 3 representative) and nickel alloy (Inconel 718)', () => {
    expect(representativeMaterialId('casting', 'zinc')).toBe('mat-zamak3');
    expect(representativeMaterialId('casting', 'nickel alloy')).toBe('mat-inconel718-cast');
    expect(representativeMaterialId('forging', 'nickel alloy')).toBe('mat-inconel718-forge');
  });
  it('a zinc casting and a nickel forging cost headless', async () => {
    expect((await headless(BRACKET, { ...CAST_ANS, 'material.family': 'zinc' })).status).toBe('costed');
    expect((await headless(FLANGE, { ...FORGE_ANS, 'material.family': 'nickel alloy' })).status).toBe('costed');
  });
});

describe('3. the grade is a question, advisory, defaulting to the representative', () => {
  it('a steel forging asks the grade, leans on the STEP name ("… FORGING C45"), costs 38MnVS6 until answered', async () => {
    const r = runCostInputRules(FORGING_RULES, ctx(FLANGE, 'forging', FORGE_ANS));
    const q = r.decisions.find(d => d.id === GRADE_DECISION_ID)!;
    expect(q.severity).toBe('advisory');
    expect(q.options.find(o => o.leaning)?.value).toBe('mat-steel-c45');
    expect(q.why).toMatch(/costed at 38MnVS6/);
    expect((await headless(FLANGE, FORGE_ANS)).total).toBeCloseTo(baseline.find(b => b.part === FLANGE)!.outcome.total!, 2);
  });
  it('an answered grade is priced, weighed at its own density, and forged as its own alloy', async () => {
    const plain = await headless(FLANGE, FORGE_ANS);
    const cr = await headless(FLANGE, { ...FORGE_ANS, [GRADE_DECISION_ID]: 'mat-steel-42crmo4' });
    const ss = await headless(FLANGE, { ...FORGE_ANS, [GRADE_DECISION_ID]: 'mat-ss316l-bar' });
    expect(cr.total).toBeGreaterThan(plain.total);
    expect(ss.total).toBeGreaterThan(cr.total);
    const m = gradedMaterialFacts(ctx(FLANGE, 'forging', { ...FORGE_ANS, [GRADE_DECISION_ID]: 'mat-ss316l-bar' }));
    expect(m.massKg).toBeCloseTo((geoOf(FLANGE).volume!.cm3) * 8000 / 1e6, 3);
  });
  it('a grade from another family is not accepted', () => {
    expect(explicitGrade(ctx(FLANGE, 'forging', { ...FORGE_ANS, [GRADE_DECISION_ID]: 'mat-al2014-forge' }), 'steel')).toBeNull();
  });
  it('an aluminium casting lists the alloys of its route (die v gravity / sand)', () => {
    const die = gradeCandidates('casting', 'aluminium', 'hpdc').map(m => m.category);
    const grav = gradeCandidates('casting', 'aluminium', 'gravity').map(m => m.category);
    expect(die.every(c => /Die Cast|HPDC/.test(c))).toBe(true);
    expect(grav.every(c => /Gravity\/Sand/.test(c))).toBe(true);
  });
});

describe('4. the file\'s own words: declared designation applies, names only lean', () => {
  it('a declared "EN-GJS-500-7" is the grade, and ductile iron is the alloy', () => {
    const c = ctx(BRACKET, 'cast_and_machine', CAST_ANS, ['EN-GJS-500-7']);
    expect(explicitGrade(c, 'cast iron')?.id).toBe('mat-gjs500');
    const r = runCostInputRules(CASTING_RULES, c);
    expect(r.suggestions.casting && (r.suggestions.casting as Record<string, unknown>).materialId).toBe('mat-gjs500');
  });
  it('a grade in the part name is a leaning, not applied', () => {
    const c = { ...ctx(FLANGE, 'forging', FORGE_ANS), filename: 'hub flange 42CrMo4.stp' } as RuleContext;
    expect(gradeEvidence(c, gradeCandidates('forging', 'steel'))?.id).toBe('mat-steel-42crmo4');
    expect(explicitGrade(c, 'steel')).toBeNull();
  });
  it('the longest designation wins: "GJS-400-15" is not read as some other 400', () => {
    expect(gradeEvidence(ctx(BRACKET, 'cast_and_machine', CAST_ANS, ['GJS-400-15']), gradeCandidates('cast_and_machine', 'cast iron'))?.id).toBe('mat-gjs400');
  });
  it('a grade pinned on the CAD panel answers the grade question and the family', () => {
    expect(answersFromContext('mat-cf8m-cast', 'x.stp')).toEqual({ 'material.family': 'steel', 'material.grade': 'mat-cf8m-cast' });
  });
});

describe('5. the drop-downs offer what the route buys', () => {
  it('the forging scope no longer offers the aluminium extrusion logs', () => {
    expect(MATERIAL_SCOPE_BY_SELECT['forge-mat'].test('Aluminium Extrusion Billet')).toBe(false);
    expect(MATERIAL_SCOPE_BY_SELECT['forge-mat'].test('Alloy Steel Billet')).toBe(true);
  });
  it('the engine\'s grade scopes are the forms\' scopes', () => {
    expect(GRADE_SCOPE.casting.source).toBe(MATERIAL_SCOPE_BY_SELECT['cast-mat'].source);
    expect(GRADE_SCOPE.cast_and_machine.source).toBe(MATERIAL_SCOPE_BY_SELECT['cam-mat'].source);
    expect(GRADE_SCOPE.forging.source).toBe(MATERIAL_SCOPE_BY_SELECT['forge-mat'].source);
  });
  it('the CAD panel lists real casting / forging grades — not 6061 bar labelled LM25, nor 5052 sheet labelled ADC12', () => {
    for (const [com, sel] of [['casting', 'cast-mat'], ['cast_and_machine', 'cam-mat'], ['forging', 'forge-mat']] as const) {
      const list = CAD_MATERIALS_BY_COMMODITY[com];
      expect(list.length).toBeGreaterThan(10);
      for (const o of list) expect(MATERIAL_SCOPE_BY_SELECT[sel].test(LIB.materials.find(m => m.id === o.id)!.category), `${com} ${o.id}`).toBe(true);
    }
    for (const list of Object.values(CAD_MATERIALS_BY_COMMODITY)) {
      for (const o of list) expect(LIB.materials.some(m => m.id === o.id), o.id).toBe(true);
    }
  });
});
