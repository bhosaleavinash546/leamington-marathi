/**
 * Layer 3 — interpretation. From what a drawing writes to the form an existing engine question takes.
 *
 *  - every row of every mapping table has a case here (a row added without one fails "every row is tested");
 *  - the vocabularies are the ENGINE's: checked against the decisions the rule engine really builds;
 *  - an unknown designation, standard, coating or treatment never produces a value.
 */
import { describe, it, expect } from 'vitest';
import {
  interpretParameters, gradeNamed, toleranceClassOf, coatingRouteOf, coatingThicknessOf, alTemperOf, hardeningRouteOf, gearQualityOf,
} from '../src/engine/engineering-data/interpret.js';
import {
  TOLERANCE_RULES, GENERAL_TOLERANCE_NOT_MAPPED, COATING_RULES, COATING_NOT_MAPPED, AL_TEMPER_RULES, AL_TEMPER_NOT_MAPPED, AL_CASTING_TEMPERS,
  HARDENING_RULES, GEAR_HARDENING_ROUTES, GEAR_QUALITY_RULES, classOfCastingGrade, parseSpecLookup,
} from '../src/engine/engineering-data/interpret-tables.js';
import { toleranceClassDecision } from '../src/engine/cost-input-rules/derive/service-context.js';
import { SURFACE_FINISH_ROUTES, finishOptionsFor } from '../src/engine/surface-finish-routes.js';
import { COMMODITY_FAMILIES } from '../src/engine/cost-input-rules/derive/material.js';
import { gradeCandidates } from '../src/engine/cost-input-rules/derive/grade.js';
import { runCostInputRules, specForCommodity, type Decision, type RuleContext } from '../src/engine/cost-input-rules/index.js';
import type { EngineeringParameter } from '../src/engine/engineering-data/model.js';
import { dp, recorded } from './engineering-data-helpers.js';

function decisionsFor(part: string, commodity: string, answers: Record<string, unknown>): Decision[] {
  const b = recorded(part);
  return runCostInputRules(specForCommodity(commodity)!, {
    geo: b.geometry, geometryQuality: 'occt', commodity, commoditySource: 'engineer', annualVolume: 50_000, filename: part, answers,
  } as RuleContext).decisions;
}
const derived = (ps: EngineeringParameter[], commodity: string | undefined, name: string) =>
  interpretParameters(ps, commodity ? { commodity } : {}).parameters.filter(p => p.name === name);

// ─── General tolerance ────────────────────────────────────────────────────────────────────────────────────────────

describe('general tolerance → the tolerance-class question', () => {
  /** rule id → [text, expected class] — at least one case per row. */
  const CASES: Record<string, Array<[string, string]>> = {
    'iso8062-dctg': [['ISO 8062-3 DCTG 5', 'tight'], ['ISO 8062-3:2007 - DCTG 9 - RMA 2 (RMAG H)', 'standard'], ['GENERAL TOLERANCES ISO 8062 CT12', 'loose'], ['DCTG 6', 'tight'], ['DCTG 7', 'standard'], ['DCTG 10', 'standard'], ['DCTG 11', 'loose']],
    'en10243-grade': [['EN 10243-1 grade F', 'standard'], ['Tolerances to EN 10243-1 - E', 'tight'], ['DIN 7526 Schmiedegüte F', 'standard']],
    'explicit-plus-minus': [['UNLESS OTHERWISE STATED ±0.25', 'tight'], ['general tolerance +/- 0,5 mm', 'tight'], ['ALL DIMENSIONS ±0.1', 'tight']],
  };

  it('every row is tested', () => {
    expect(Object.keys(CASES).sort()).toEqual(TOLERANCE_RULES.map(r => r.id).sort());
  });

  it.each(Object.entries(CASES).flatMap(([id, cs]) => cs.map(([text, cls]) => ({ id, text, cls }))))('$id: "$text" → $cls', ({ id, text, cls }) => {
    const r = toleranceClassOf(text)!;
    expect(r).toMatchObject({ value: cls, ruleId: id });
  });

  it('the classes are exactly the options the engine\'s question offers', () => {
    const options = toleranceClassDecision().options.map(o => o.value).sort();
    expect(options).toEqual(['loose', 'standard', 'tight']);
    const produced = new Set<string>();
    for (const cs of Object.values(CASES)) for (const [text] of cs) produced.add((toleranceClassOf(text) as { value: string }).value);
    for (const v of produced) expect(options).toContain(v);
    // and the question a real casting asks carries the same three
    const d = decisionsFor('PRCR002.stp', 'cast_and_machine', { 'material.family': 'cast iron' }).find(x => x.id === 'service.toleranceClass')!;
    expect(d.options.map(o => o.value).sort()).toEqual(options);
  });

  it('only a row whose mapping needs no judgement is left unflagged', () => {
    for (const r of TOLERANCE_RULES) {
      if (r.certainty === 'judgement') expect(r.basis, r.id).toMatch(/ENGINEERING JUDGEMENT/);
      else expect(r.basis, r.id).not.toMatch(/ENGINEERING JUDGEMENT/);
    }
    const p = dp('tolerance.general', 'ISO 8062-3 DCTG 9');
    expect(derived([p], 'casting', 'tolerance.generalClass')[0]).toMatchObject({ value: 'standard', status: 'needs-validation', kind: 'interpreted', source: 'derived', method: 'rule', derivedFrom: [p.id] });
    expect(derived([dp('tolerance.general', 'EN 10243-1 grade E')], 'forging', 'tolerance.generalClass')[0]).toMatchObject({ value: 'tight', status: 'extracted' });
    expect(derived([dp('tolerance.general', '±0.2')], 'casting', 'tolerance.generalClass')[0]).toMatchObject({ value: 'tight', status: 'extracted' });
  });

  it('inches: a ± figure is read in the drawing\'s units', () => {
    expect(toleranceClassOf('±.010', 'in')).toMatchObject({ value: 'tight' });            // 0.254 mm
    expect(toleranceClassOf('±.030"')).toMatchObject({ unmapped: expect.stringMatching(/wider/) });   // 0.762 mm
    const ps = [dp('title.units', 'INCH'), dp('tolerance.general', '±.010')];
    expect(derived(ps, 'casting', 'tolerance.generalClass')[0].value).toBe('tight');
  });

  // ISO 2768 / DIN 7168 set MACHINED dimensions; the question is the as-cast / as-forged tolerance (validation, 10 Nov 2026)
  it('a machining general tolerance (ISO 2768, DIN 7168), a wider ± figure, a block of tolerances and an unmapped standard give NO class', () => {
    for (const text of ['ISO 2768-mK', 'GENERAL TOLERANCES ISO 2768-1 medium', 'DIN ISO 2768 T1 - c', 'DIN 7168 m', '±1.5', '.XX ±.01  .XXX ±.005', 'VDG P 690 D1', 'DIN 1688 GTA 14', 'ISO 20457', 'ISO 13920-B', 'see specification 1234', 'TOLERANCES PER COMPANY STD']) {
      const r = toleranceClassOf(text);
      expect(r === null || 'unmapped' in r, text).toBe(true);
      const i = interpretParameters([dp('tolerance.general', text)], { commodity: 'casting' });
      expect(i.parameters.filter(p => p.name === 'tolerance.generalClass'), text).toEqual([]);
      expect(i.unresolved.some(u => u.name === 'tolerance.generalClass'), text).toBe(true);
      if (/2768|7168/.test(text)) expect(i.unresolved.find(u => u.name === 'tolerance.generalClass')!.why, text).toMatch(/as-cast \/ as-forged/);
    }
    for (const n of GENERAL_TOLERANCE_NOT_MAPPED) expect(n.why.length).toBeGreaterThan(20);
  });

  it('a casting grade outranks the machining general tolerance beside it', () => {
    const ps = [dp('tolerance.general', 'ISO 2768-mK'), dp('tolerance.castingGrade', 'DCTG 11')];
    const out = derived(ps, 'casting', 'tolerance.generalClass');
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe('loose');
    expect(derived([dp('tolerance.castingGrade', 9)], 'casting', 'tolerance.generalClass')[0].value).toBe('standard');
  });

  it('casting grades outside 1–16 are not a grade', () => {
    expect(classOfCastingGrade(0)).toBeNull();
    expect(classOfCastingGrade(17)).toBeNull();
    expect(classOfCastingGrade(8.5)).toBeNull();
  });
});

// ─── Coating ──────────────────────────────────────────────────────────────────────────────────────────────────────

describe('coating text → the finish question', () => {
  const CASES: Record<string, string[]> = {
    zinc_nickel: ['Zn-Ni 8 µm + passivation', 'ZINC NICKEL PLATED ISO 19598', 'ZnNi8'],
    zinc_flake: ['Zinc flake coating ISO 10683 flZn/240h', 'GEOMET 321 grade A', 'Delta-Protekt KL100', 'DACROMET 320'],
    galvanise: ['Hot dip galvanised to ISO 1461', 'HDG', 'feuerverzinkt', 'tZn 70'],
    zinc_plate: ['Zinc plated Fe//Zn8//A', 'ELECTRO ZINC PLATE 12 µm', 'galvanisch verzinkt', 'ISO 2081 Fe/Zn12/C', 'Zn8 trivalent passivate'],
    e_coat: ['KTL black', 'E-COAT 20 µm', 'cataphoretic coating', 'CED PRIMER', 'electrocoat'],
    powder_coat_zn: ['Zinc phosphate + powder coat RAL 9005', 'POWDER COAT OVER ZINC PHOSPHATE'],
    powder_coat: ['Powder coat RAL 7016', 'pulverbeschichtet RAL 9005', 'POWDER PAINT BLACK'],
    anodise: ['Anodise AA15 natural', 'ANODIZED 10 µm ISO 7599', 'eloxiert E6/EV1', 'MIL-A-8625 Type II'],
    mass_finish: ['Vibratory deburr and finish', 'TUMBLE FINISH', 'gleitschleifen'],
  };

  it('every row is tested', () => {
    expect(Object.keys(CASES).sort()).toEqual(COATING_RULES.map(r => r.route).sort());
  });

  it.each(Object.entries(CASES).flatMap(([route, ts]) => ts.map(text => ({ route, text }))))('"$text" → $route', ({ route, text }) => {
    expect(coatingRouteOf(text)).toMatchObject({ route });
  });

  it('every route is one the engine knows AND its finish question offers on some route and metal', () => {
    const offered = new Set<string>();
    for (const c of ['casting', 'cast_and_machine', 'forging', 'sheet_metal', 'sheet_metal_fab']) {
      for (const f of [...(COMMODITY_FAMILIES[c] ?? []), null]) for (const r of finishOptionsFor(c, f)) offered.add(r);
    }
    for (const r of COATING_RULES) {
      expect(SURFACE_FINISH_ROUTES[r.route], `${r.route} is a finish route`).toBeDefined();
      expect([...offered], `${r.route} is offered by the finish question`).toContain(r.route);
    }
    // and a real part's question shows them
    const d = decisionsFor('Seat_Locking_Bracket.stp', 'sheet_metal', { 'material.family': 'steel' }).find(x => x.id === 'service.finish')!;
    for (const r of ['e_coat', 'powder_coat', 'powder_coat_zn', 'zinc_plate', 'zinc_nickel', 'zinc_flake', 'galvanise']) expect(d.options.map(o => o.value)).toContain(r);
  });

  it('finishes with no route are recognised and NOT mapped', () => {
    const texts = ['Hard anodise 50 µm', 'Paint to RAL 9005, primer + top coat', 'BLACK OXIDE', 'Hard chrome plate 20 µm', 'Electroless nickel 10 µm',
      'TIN PLATED', 'Manganese phosphate and oil', 'Passivate to ASTM A967', 'SHOT BLAST SA 2.5'];
    for (const text of texts) {
      const r = coatingRouteOf(text);
      expect(r && 'unmapped' in r, text).toBe(true);
      const i = interpretParameters([dp('finish.coating', text)], { commodity: 'forging' });
      expect(i.parameters.filter(p => p.name === 'finish.coatingRoute'), text).toEqual([]);
      expect(i.unresolved.some(u => u.name === 'finish.coatingRoute'), text).toBe(true);
    }
    expect(COATING_NOT_MAPPED.length).toBeGreaterThanOrEqual(texts.length);
  });

  it('an unknown finish is nothing at all', () => {
    for (const text of ['Finish per spec 12345', 'SEE NOTE 4', 'Teflon impregnated wonder-coat']) {
      expect(coatingRouteOf(text), text).toBeNull();
      expect(interpretParameters([dp('finish.coating', text)], { commodity: 'casting' }).parameters).toEqual([]);
    }
  });

  it('a deposit thickness written in the note is read as written', () => {
    expect(coatingThicknessOf('Zinc plated Fe//Zn8//A')).toEqual({ min: 8, max: 8 });
    expect(coatingThicknessOf('E-COAT 20-35 µm')).toEqual({ min: 20, max: 35 });
    expect(coatingThicknessOf('Anodise AA15')).toEqual({ min: 15, max: 15 });
    expect(coatingThicknessOf('KTL black')).toBeNull();
    const p = dp('finish.coating', 'Zinc plated Fe//Zn8//A');
    const out = interpretParameters([p], { commodity: 'sheet_metal' }).parameters;
    expect(out.find(x => x.name === 'finish.coatingRoute')).toMatchObject({ value: 'zinc_plate', status: 'extracted', kind: 'interpreted', derivedFrom: [p.id], rawText: 'Zinc plated Fe//Zn8//A' });
    expect(out.find(x => x.name === 'finish.coatingThickness')).toMatchObject({ value: { min: 8, max: 8 }, unit: 'µm' });
  });

  it('a powder coat with no pre-treatment stated is flagged; two different finishes are both flagged', () => {
    expect(derived([dp('finish.coating', 'Powder coat RAL 7016')], 'sheet_metal', 'finish.coatingRoute')[0]).toMatchObject({ value: 'powder_coat', status: 'needs-validation' });
    const two = derived([dp('finish.coating', 'KTL black'), dp('finish.coating', 'Zinc flake ISO 10683')], 'forging', 'finish.coatingRoute');
    expect(two.map(p => p.status)).toEqual(['needs-validation', 'needs-validation']);
  });
});

// ─── Heat treatment ───────────────────────────────────────────────────────────────────────────────────────────────

describe('heat treatment → the aluminium casting question', () => {
  const CASES: Record<string, string[]> = {
    T6: ['Heat treat to T6', 'EN AC-42100 T6', 'SOLUTION TREATED AND ARTIFICIALLY AGED', 'solution heat treat + age'],
    T5: ['Temper T5', 'ARTIFICIALLY AGED ONLY'],
    F: ['As cast', 'AS-CAST CONDITION', 'no heat treatment', 'temper F'],
  };
  it('every row is tested, and the options are the question\'s own', () => {
    expect(Object.keys(CASES).sort()).toEqual(AL_TEMPER_RULES.map(r => r.temper).sort());
    const d = decisionsFor('Part1.stp', 'casting', { 'material.family': 'aluminium', 'service.pressureTight': 'no', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'no' })
      .find(x => x.id === 'casting.heatTreat')!;
    expect(d.options.map(o => o.value)).toEqual([...AL_CASTING_TEMPERS]);
  });
  it.each(Object.entries(CASES).flatMap(([temper, ts]) => ts.map(text => ({ temper, text }))))('"$text" → $temper', ({ temper, text }) => {
    expect(alTemperOf(text)).toMatchObject({ temper });
    expect(derived([dp('heatTreat.process', text)], 'casting', 'material.condition')[0]).toMatchObject({ value: temper, kind: 'interpreted' });
  });
  it('T7, T4 and T64 are not options — recognised, not mapped', () => {
    for (const text of ['T7', 'Heat treat T4', 'T64', 'over-aged']) {
      expect(alTemperOf(text), text).toMatchObject({ unmapped: expect.any(String) });
      const i = interpretParameters([dp('heatTreat.process', text)], { commodity: 'casting' });
      expect(i.parameters, text).toEqual([]);
      expect(i.unresolved[0].name).toBe('material.condition');
    }
    expect(AL_TEMPER_NOT_MAPPED.length).toBe(3);
    expect(alTemperOf('stress relieve at 550 °C')).toBeNull();
  });
  it('a temper carried in the designation is read; a route with no heat-treat question reads none', () => {
    expect(derived([dp('material.designation', 'EN AC-42100 T6')], 'casting', 'material.condition')[0].value).toBe('T6');
    expect(interpretParameters([dp('heatTreat.process', 'Heat treat to T6')], { commodity: 'forging' }).parameters).toEqual([]);
    expect(interpretParameters([dp('heatTreat.process', 'Heat treat to T6')], { commodity: 'machining' }).parameters).toEqual([]);
  });
});

describe('heat treatment → the gear hardening question', () => {
  const CASES: Record<string, string[]> = {
    lpc_carburising: ['Low pressure carburise and gas quench', 'VACUUM CARBURISED', 'LPC + HPGQ'],
    carbonitriding: ['Carbonitride 0.3 mm', 'carbonitriert'],
    fnc: ['Ferritic nitrocarburise', 'TENIFER QPQ', 'FNC 10 µm compound layer'],
    nitriding: ['Gas nitrided 0.4 mm', 'plasma nitride', 'nitriert'],
    induction_hardening: ['Induction harden teeth 55-60 HRC', 'induktiv gehärtet'],
    case_hardening: ['Case harden 58-62 HRC', 'CARBURISE, QUENCH AND TEMPER', 'einsatzgehärtet Eht 0,8+0,4', 'CHD 0.8-1.2'],
    martempering: ['Martemper'],
    austempering: ['Austemper to 300 HB', 'bainitic'],
    quench_temper: ['Quench and temper to 28-32 HRC', 'Q&T', 'vergütet', 'through hardened', 'hardened and tempered'],
    none: ['No heat treatment', 'not hardened', 'soft condition'],
  };
  it('every row is tested, and every route is one of the engine\'s', () => {
    expect(Object.keys(CASES).sort()).toEqual(HARDENING_RULES.map(r => r.route).sort());
    expect(Object.keys(CASES).sort()).toEqual(Object.keys(GEAR_HARDENING_ROUTES).sort());
    // the real question, over the two steel classes, offers exactly these
    const base = { 'gear.helix': '0', 'gear.qualityClass': '7' };
    const offered = new Set(['case_hardening_steel', 'through_hardening_steel'].flatMap(mc =>
      decisionsFor('test-gear-m3-z38.step', 'gear', { ...base, 'gear.materialClass': mc }).find(d => d.id === 'gear.hardeningRoute')!.options.map(o => String(o.value))));
    expect([...offered].sort()).toEqual(Object.keys(GEAR_HARDENING_ROUTES).sort());
  });
  it.each(Object.entries(CASES).flatMap(([route, ts]) => ts.map(text => ({ route, text }))))('"$text" → $route', ({ route, text }) => {
    expect(hardeningRouteOf(text)).toMatchObject({ route });
    expect(derived([dp('heatTreat.process', text)], 'gear', 'heatTreat.route')[0]).toMatchObject({ value: route, kind: 'interpreted', status: 'extracted' });
  });
  it('an unknown treatment is nothing', () => {
    for (const text of ['Stress relieve', 'Cryogenic treatment', 'HT per spec 99']) {
      expect(hardeningRouteOf(text), text).toBeNull();
      const i = interpretParameters([dp('heatTreat.process', text)], { commodity: 'gear' });
      expect(i.parameters).toEqual([]);
      expect(i.unresolved[0].name).toBe('heatTreat.route');
    }
  });
});

// ─── Gear quality ─────────────────────────────────────────────────────────────────────────────────────────────────

describe('gear quality → the ISO 1328 class', () => {
  const CASES: Record<string, Array<[string, number, string]>> = {
    iso1328: [['ISO 1328 class 7', 7, 'extracted'], ['Accuracy ISO 1328-1:2013 - 6', 6, 'extracted'], ['ISO 1328 grade 10', 10, 'extracted']],
    din396x: [['DIN 3962 8', 8, 'needs-validation'], ['Verzahnungsqualität DIN 3961 - 7', 7, 'needs-validation']],
    'agma-q': [['AGMA 2000-A88 Q10', 7, 'needs-validation'], ['AGMA Q 9', 8, 'needs-validation']],
  };
  it('every row is tested', () => expect(Object.keys(CASES).sort()).toEqual(GEAR_QUALITY_RULES.map(r => r.id).sort()));
  it.each(Object.entries(CASES).flatMap(([id, cs]) => cs.map(([text, n, status]) => ({ id, text, n, status }))))('$id: "$text" → class $n', ({ text, n, status }) => {
    expect(gearQualityOf(text)!.value).toBe(n);
    expect(derived([dp('gear.qualityClass', text)], 'gear', 'gear.qualityClassIso')[0]).toMatchObject({ value: n, status });
  });
  it('a bare number is read as ISO but flagged; a class the engine does not accept is nothing', () => {
    expect(derived([dp('gear.qualityClass', 7, '7')], 'gear', 'gear.qualityClassIso')[0]).toMatchObject({ value: 7, status: 'needs-validation' });
    for (const text of ['ISO 1328 class 14', 'AGMA Q3', 'precision grade A', 'JIS B 1702 N5']) {
      const i = interpretParameters([dp('gear.qualityClass', text)], { commodity: 'gear' });
      expect(i.parameters, text).toEqual([]);
      expect(i.unresolved[0].name).toBe('gear.qualityClassIso');
    }
  });
});

// ─── Material ─────────────────────────────────────────────────────────────────────────────────────────────────────

describe('material designation → family and rate-book grade (the engine\'s own matchers)', () => {
  const one = (text: string, commodity: string, name: string) => derived([dp('material.designation', text)], commodity, name)[0];

  it.each([
    ['EN-GJS-500-7', 'cast_and_machine', 'cast iron', 'mat-gjs500'],
    ['EN-GJL-250', 'casting', 'cast iron', 'mat-gjl250'],
    ['EN AC-46000', 'casting', 'aluminium', 'mat-a380'],
    ['ADC12', 'casting', 'aluminium', 'mat-adc12'],
    ['38MnVS6', 'forging', 'steel', 'mat-steel-38mnvs6'],
    ['42CrMo4', 'forging', 'steel', 'mat-steel-42crmo4'],
    ['1.7225', 'forging', 'steel', 'mat-steel-42crmo4'],
    ['Ti-6Al-4V', 'forging', 'titanium', 'mat-ti-6al4v-forge'],
    ['DC04', 'sheet_metal', 'steel', 'mat-dc04'],
    ['HC420LA', 'sheet_metal', 'steel', 'mat-hsla420'],
    ['S355MC', 'sheet_metal_fab', 'steel', 'mat-s355mc'],
    ['5754-H22', 'sheet_metal', 'aluminium', 'mat-aa5754-sheet'],
  ])('%s on %s → %s, %s — exactly one grade', (text, commodity, family, grade) => {
    const g = one(text, commodity, 'material.grade');
    expect(g).toMatchObject({ value: grade, kind: 'interpreted', status: 'extracted', source: 'derived', method: 'rule' });
    expect(g.note).toMatch(/engine's own designation matcher/);
    expect(g.candidates).toBeUndefined();
    expect(one(text, commodity, 'material.family')).toMatchObject({ value: family, kind: 'interpreted', status: 'extracted' });
    // the grade is one the route's grade question accepts
    expect(gradeCandidates(commodity, family as never).map(m => m.id)).toContain(grade);
  });

  it('a designation that names several grades needs validation, with the candidates listed', () => {
    const g = one('GJS-500', 'casting', 'material.grade');
    expect(g.status).toBe('needs-validation');
    expect(g.candidates!.map(c => c.value).sort()).toEqual(['mat-gjs500', 'mat-gjs500-14']);
    expect(g.note).toMatch(/choose the grade/);
    // a stem the engine's matcher would follow to a DIFFERENT alloy is not taken as read by the matcher alone…
    expect(gradeNamed('AlSi7Mg0.3', gradeCandidates('casting', 'aluminium')).exact).toBe(false);
    // …and the EN 1706 table names the right one: AlSi7Mg0.3 is A356, not A357 (validation, 10 Nov 2026)
    expect(one('AlSi7Mg0.3', 'casting', 'material.grade')).toMatchObject({ value: 'mat-lm25', status: 'extracted' });
  });

  it('a designation that names no grade gives no grade parameter and says so', () => {
    for (const [text, commodity] of [['EN AC-42000', 'casting'], ['AlSi9Cu3(Fe)', 'casting'], ['unobtainium', 'forging'], ['Stahl nach Werksnorm', 'sheet_metal']]) {
      const i = interpretParameters([dp('material.designation', text)], { commodity });
      expect(i.parameters.filter(p => p.name === 'material.grade'), text).toEqual([]);
      expect(i.unresolved.find(u => u.name === 'material.grade')?.why, text).toMatch(/names no grade/);
    }
    // and nothing at all for a word that is no material
    const none = interpretParameters([dp('material.designation', 'unobtainium')], { commodity: 'forging' });
    expect(none.parameters).toEqual([]);
    expect(none.unresolved.map(u => u.name).sort()).toEqual(['material.family', 'material.grade']);
  });

  it('a family the route cannot be made from is flagged, never silently accepted', () => {
    expect(one('EN-GJS-500-7', 'forging', 'material.family')).toMatchObject({ value: 'cast iron', status: 'needs-validation' });
    expect(one('EN-GJS-500-7', 'forging', 'material.family').note).toMatch(/not a material the forging route offers/);
  });

  it('machining asks the family only: a grade is read through its scope for the family, and no grade parameter is made', () => {
    expect(one('42CrMo4', 'machining', 'material.family').value).toBe('steel');
    expect(one('6082-T6', 'machining', 'material.family').value).toBe('aluminium');
    expect(derived([dp('material.designation', '42CrMo4')], 'machining', 'material.grade')).toEqual([]);
  });

  it('without a commodity only the family is read', () => {
    const out = interpretParameters([dp('material.designation', 'EN-GJS-500-7')]).parameters;
    expect(out.map(p => p.name)).toEqual(['material.family']);
  });

  it('plastics: the ISO 11469 marking names the grade when one grade is filed under it', () => {
    expect(one('>PA66-GF30<', 'injection_moulding', 'material.grade')).toMatchObject({ value: 'mat-pa66gf30', status: 'extracted' });
    expect(one('PA6 GF30', 'injection_moulding', 'material.grade')).toMatchObject({ value: 'mat-pa6-gf30', status: 'extracted' });
    const pp = one('>PP<', 'injection_moulding', 'material.grade');
    expect(pp.status).toBe('needs-validation');
    expect(pp.candidates!.length).toBeGreaterThan(1);
    // no marking match: the resin question's own hint, flagged
    expect(one('HDPE', 'blow_moulding', 'material.grade')).toMatchObject({ value: 'mat-hdpe-bm', status: 'needs-validation' });
    expect(interpretParameters([dp('material.designation', 'XYZ-123')], { commodity: 'injection_moulding' }).parameters).toEqual([]);
  });

  it('rubber: the engine\'s compound classifier on the text and on the library', () => {
    expect(one('NR 55 Shore A', 'rubber', 'material.grade')).toMatchObject({ value: 'mat-nr', status: 'extracted' });
    const epdm = one('EPDM 70', 'rubber', 'material.grade');
    expect(['mat-epdm']).toContain(epdm.value);
    // an unknown compound is NOT read as natural rubber (the classifier's fallback)
    const i = interpretParameters([dp('material.designation', 'Compound 4711')], { commodity: 'rubber' });
    expect(i.parameters).toEqual([]);
    expect(i.unresolved[0].why).toMatch(/names no rubber compound/);
  });

  it('aluminium extrusion: the alloy and its temper', () => {
    const out = interpretParameters([dp('material.designation', 'EN AW-6082 T6')], { commodity: 'aluminium_extrusion' }).parameters;
    expect(out.find(p => p.name === 'material.alloy')).toMatchObject({ value: '6082', status: 'extracted' });
    expect(out.find(p => p.name === 'material.condition')).toMatchObject({ value: 'T6', status: 'extracted' });
    const none = interpretParameters([dp('material.designation', 'AlMgSi')], { commodity: 'aluminium_extrusion' });
    expect(none.parameters.filter(p => p.name === 'material.alloy')).toEqual([]);
  });

  it('composites: only the laminate question\'s own hint, always flagged', () => {
    expect(one('CFRP prepreg T700', 'composites', 'material.laminateSystem')).toMatchObject({ value: 'prepreg-cf', status: 'needs-validation' });
    expect(interpretParameters([dp('material.designation', 'GF-UP')], { commodity: 'composites' }).parameters).toEqual([]);
  });
});

// ─── Company specification codes ──────────────────────────────────────────────────────────────────────────────────

describe('company specification codes', () => {
  const code = dp('material.specCode', 'STD.50.5021', 'MATERIAL: STD.50.5021');
  it('a code that is not in the table is never given a meaning', () => {
    const i = interpretParameters([code], { commodity: 'casting' });
    expect(i.parameters).toEqual([]);
    expect(i.unresolved[0]).toMatchObject({ parameterId: code.id, name: 'material.designation' });
    expect(i.unresolved[0].why).toMatch(/never guessed/);
    // an empty table (the shipped file) resolves nothing
    expect(interpretParameters([code], { commodity: 'casting', specLookup: parseSpecLookup({ entries: {} }) }).parameters).toEqual([]);
  });
  it('a code in the table resolves through its designation, and the note names the table\'s source', () => {
    const specLookup = parseSpecLookup({ entries: { 'std 50 5021': { designation: 'EN-GJS-500-7', standard: 'EN 1563', source: 'Materials Engineering register rev 3, 2026-11' } } });
    const out = interpretParameters([code], { commodity: 'casting', specLookup }).parameters;
    const d = out.find(p => p.name === 'material.designation')!;
    expect(d).toMatchObject({ value: 'EN-GJS-500-7', kind: 'interpreted', derivedFrom: [code.id], rawText: 'MATERIAL: STD.50.5021' });
    expect(d.note).toMatch(/Materials Engineering register rev 3/);
    expect(out.find(p => p.name === 'material.grade')).toMatchObject({ value: 'mat-gjs500', derivedFrom: [d.id] });
    expect(out.find(p => p.name === 'material.family')!.value).toBe('cast iron');
  });
  it('a table row without a designation or a source is ignored', () => {
    const t = parseSpecLookup({ entries: { A1: { designation: 'C45' }, A2: { source: 'x' }, A3: { designation: ' ', source: 'x' }, A4: { designation: 'C45', source: 'register' } } });
    expect(Object.keys(t)).toEqual(['A4']);
    expect(parseSpecLookup(null)).toEqual({});
    expect(parseSpecLookup({})).toEqual({});
  });
});

// ─── Notes ────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('notes → the service flags', () => {
  it('a leak-test specification is a leak requirement', () => {
    const p = dp('quality.leakTestSpec', 'Leak test at 2 bar air, max 5 cc/min');
    expect(derived([p], 'casting', 'quality.pressureTight')[0]).toMatchObject({ value: true, kind: 'interpreted', status: 'extracted', derivedFrom: [p.id] });
    expect(derived([dp('note.general', 'PART TO BE PRESSURE TESTED AT 6 BAR')], 'casting', 'quality.pressureTight')[0].value).toBe(true);
    expect(derived([dp('note.general', 'Dichtheitsprüfung 1,5 bar')], 'casting', 'quality.pressureTight')[0].value).toBe(true);
  });
  it('the ABSENCE of a leak note is not "no", and a negated note is not a requirement', () => {
    expect(derived([dp('note.general', 'Deburr all edges')], 'casting', 'quality.pressureTight')).toEqual([]);
    expect(derived([dp('note.general', 'No leak test required')], 'casting', 'quality.pressureTight')).toEqual([]);
    expect(derived([dp('quality.leakTestSpec', 'Leak test not required')], 'casting', 'quality.pressureTight')).toEqual([]);
  });
  it('a critical-characteristic marking is an INFERRED safety flag that needs validation', () => {
    const p = dp('note.general', '<CC> CRITICAL CHARACTERISTIC — see control plan');
    expect(derived([p], 'forging', 'quality.safetyCritical')[0]).toMatchObject({ value: true, kind: 'inferred', status: 'needs-validation', derivedFrom: [p.id] });
    expect(derived([p], 'forging', 'quality.safetyCritical')[0].note).toMatch(/INFERRED/);
    expect(derived([dp('note.general', 'Sicherheitsteil — dokumentationspflichtig')], 'forging', 'quality.safetyCritical')).toHaveLength(1);
    expect(derived([dp('note.general', 'Break sharp edges 0.5 max')], 'forging', 'quality.safetyCritical')).toEqual([]);
  });
  it('an impregnation note is yes; a note ruling it out is no', () => {
    expect(derived([dp('quality.impregnation', 'Vacuum impregnate to MIL-I-17563')], 'casting', 'quality.impregnationRequired')[0].value).toBe(true);
    expect(derived([dp('quality.impregnation', 'Impregnation not permitted')], 'casting', 'quality.impregnationRequired')[0].value).toBe(false);
    expect(derived([dp('note.manufacturing', 'Castings may be impregnated')], 'casting', 'quality.impregnationRequired')[0].value).toBe(true);
  });
  it('a note is not read where the reader already states the fact', () => {
    const ps = [dp('quality.pressureTight', true, 'LEAK TIGHT'), dp('note.general', 'Leak test 2 bar')];
    expect(derived(ps, 'casting', 'quality.pressureTight')).toEqual([]);
  });
});

describe('what is and is not interpreted', () => {
  it('a rejected reading is not interpreted; a derived value is not interpreted again', () => {
    expect(interpretParameters([dp('material.designation', 'EN-GJS-500-7', undefined, { status: 'rejected' })], { commodity: 'casting' }).parameters).toEqual([]);
    const first = interpretParameters([dp('material.designation', 'EN-GJS-500-7')], { commodity: 'casting' }).parameters;
    expect(interpretParameters(first, { commodity: 'casting' }).parameters).toEqual([]);
  });
  it('every derived parameter prints its rule and links what it came from', () => {
    const ps = [dp('material.designation', 'EN-GJS-500-7'), dp('tolerance.general', 'ISO 8062-3 DCTG 9'), dp('finish.coating', 'KTL'),
      dp('quality.leakTestSpec', 'leak test 2 bar'), dp('note.general', 'SAFETY CRITICAL PART')];
    const out = interpretParameters(ps, { commodity: 'casting' }).parameters;
    expect(out.length).toBeGreaterThanOrEqual(6);
    for (const p of out) {
      expect(p.source).toBe('derived');
      expect(p.method).toBe('rule');
      expect(['interpreted', 'inferred']).toContain(p.kind);
      expect(p.note!.length, p.name).toBeGreaterThan(20);
      expect(ps.map(x => x.id)).toContain(p.derivedFrom![0]);
      expect(p.location, `${p.name} keeps its drawing location`).toBeDefined();
      expect(['extracted', 'needs-validation']).toContain(p.status);     // never confirmed by a rule
    }
  });
});
