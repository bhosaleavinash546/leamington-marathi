/**
 * Layer 3 against the shapes the drawing reader really writes (server/drawing/extract/*, read on 10 Nov 2026).
 *
 * The reader fills some dictionary names in ITS OWN vocabulary: the family as "ductile iron", the general class as the
 * ISO 2768 letter, the coating as "e-coat", the heat treatment as a keyword with the clause in rawText; holes as
 * { diameter, count, fit, upper, lower }, threads as { designation, system, nominal, pitch, pitchSource, count }.
 * These parameters are hand-written in exactly those shapes (this test does not run the reader): the unified layer
 * must take them as they are.
 */
import { describe, it, expect } from 'vitest';
import { consolidate } from '../src/engine/engineering-data/reconcile.js';
import { answersFromEngineeringData } from '../src/engine/engineering-data/to-costing.js';
import { inEngineVocabulary } from '../src/engine/engineering-data/vocabulary.js';
import type { EngineeringParameter } from '../src/engine/engineering-data/model.js';
import { recorded, dp, drawingOf, byName, confirmNames } from './engineering-data-helpers.js';

const axle = recorded('PRCR002.stp');
const reader = (extra: EngineeringParameter[] = []): EngineeringParameter[] => [
  dp('material.designation', 'EN-GJS-500-7', 'MATERIAL EN-GJS-500-7 EN 1563', { id: 'r:mat' }),
  dp('material.family', 'ductile iron', 'EN-GJS-500-7', { id: 'r:family', kind: 'interpreted', note: 'From the form of the designation "EN-GJS-500-7" (designation grammar), not from a grade list.' }),
  dp('material.standard', 'EN 1563', 'MATERIAL EN-GJS-500-7 EN 1563', { id: 'r:std' }),
  dp('tolerance.general', 'ISO 2768-mK', 'GENERAL TOLERANCES ISO 2768-mK', { id: 'r:tol' }),
  dp('tolerance.generalClass', 'm', 'ISO 2768-mK', { id: 'r:class', kind: 'interpreted', note: 'ISO 2768-1 class letter; ISO 2768-2 geometrical class K.' }),
  dp('finish.coating', 'KTL COATED BLACK 20 µm MIN', undefined, { id: 'r:coat', note: 'Process words recognised: e-coat.' }),
  dp('finish.coatingRoute', 'e-coat', 'KTL COATED BLACK 20 µm MIN', { id: 'r:route', kind: 'interpreted', note: 'Named from the process words on the drawing.' }),
  dp('finish.coatingThickness', { min: 20 }, '20 µm MIN', { id: 'r:um', unit: 'µm' }),
  dp('quality.safetyCritical', true, 'SAFETY CRITICAL PART', { id: 'r:safety', kind: 'interpreted' }),
  dp('hole.diameter', { diameter: 24, fit: 'H7', upper: 0.021, lower: 0 }, 'Ø24 H7', { id: 'r:bore', unit: 'mm', kind: 'interpreted' }),
  dp('hole.diameter', { diameter: 14, count: 6 }, '6x Ø14', { id: 'r:h14', unit: 'mm' }),
  dp('dimension', { type: 'linear', nominal: 177, upper: 0.2, lower: -0.2 }, '177 ±0.2', { id: 'r:len', unit: 'mm' }),
  dp('tolerance.tightest', { band: 0.021, nominal: 24, type: 'diameter' }, 'Ø24 H7', { id: 'r:tight', unit: 'mm', kind: 'interpreted' }),
  dp('feature.count.holes', 7, '2 hole callout(s)', { id: 'r:count', kind: 'interpreted' }),
  dp('thread', { designation: 'M10', system: 'ISO metric', nominal: 10, pitch: 1.5, pitchSource: 'ISO 261 coarse', count: 2 }, '2x M10', { id: 'r:m10', unit: 'mm', kind: 'interpreted' }),
  dp('heatTreat.hardness', { min: 170, max: 230 }, '170-230 HBW', { id: 'r:hbw', unit: 'HBW' }),
  dp('part.mass', 7.4, 'MASS 7.4 kg', { id: 'r:mass', unit: 'kg' }),
  dp('title.units', 'mm', 'ALL DIMENSIONS IN mm', { id: 'r:units', kind: 'interpreted' }),
  ...extra,
];
const build = (commodity: string, extra: EngineeringParameter[] = []) =>
  consolidate({ cad: { geo: axle.geometry, filename: axle.part }, drawing: drawingOf(reader(extra)), commodity });

describe('the reader\'s own vocabulary is re-stated in the engine\'s, through the mapping tables', () => {
  const data = build('cast_and_machine');

  it('family "ductile iron" is the engine\'s "cast iron" — one parameter with the interpretation of the designation', () => {
    const fam = byName(data, 'material.family');
    expect(fam).toHaveLength(1);
    expect(fam[0].value).toBe('cast iron');
    // the interpretation that names its source is kept; the reader's own row agrees and is folded in with its provenance
    expect(fam[0].id).toBe('r:mat>material.family');
    expect(fam[0].derivedFrom).toEqual(['r:mat']);
    expect(fam[0].alsoFrom).toEqual([expect.objectContaining({ parameterId: 'r:family', source: 'drawing', rawText: 'EN-GJS-500-7' })]);
    // alone (a designation the engine's own reader does not know), the reader's row stands, re-stated, and says so
    const alone = consolidate({ drawing: drawingOf([dp('material.designation', 'GG-25', undefined, { id: 'm' }), dp('material.family', 'grey iron', 'GG-25', { id: 'f', kind: 'interpreted' })]) });
    expect(byName(alone, 'material.family')).toEqual([expect.objectContaining({ id: 'f', value: 'cast iron', rawText: 'GG-25' })]);
    expect(byName(alone, 'material.family')[0].note).toMatch(/the source wrote "grey iron"; held in the costing's vocabulary as "cast iron"/);
  });

  it('class letter "m" is the question\'s "tight" by the ISO 2768 row — flagged as a judgement', () => {
    const cls = byName(data, 'tolerance.generalClass');
    expect(cls).toHaveLength(1);
    expect(cls[0]).toMatchObject({ id: 'r:tol>tolerance.generalClass', value: 'tight', status: 'needs-validation' });
    expect(cls[0].alsoFrom![0]).toMatchObject({ parameterId: 'r:class', rawText: 'ISO 2768-mK' });
    expect(cls[0].note).toMatch(/ENGINEERING JUDGEMENT/);
  });

  it('route "e-coat" is the finish question\'s "e_coat"', () => {
    const r = byName(data, 'finish.coatingRoute');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'r:coat>finish.coatingRoute', value: 'e_coat', status: 'extracted' });
    expect(r[0].alsoFrom![0].parameterId).toBe('r:route');
    expect(inEngineVocabulary('finish.coatingRoute', r[0].value)).toBe(true);
  });

  it('no conflict is invented between the reader\'s word and the engine\'s', () => {
    expect(data.conflicts).toEqual([]);
  });

  it('unconfirmed: leanings in the engine\'s vocabulary and no answer; confirmed: the answers an engineer would click', () => {
    const lean = answersFromEngineeringData(data);
    expect(lean.answers).toEqual({});
    expect(lean.leanings.map(l => [l.decisionId, l.value]).sort()).toEqual([
      ['material.family', 'cast iron'], ['material.grade', 'mat-gjs500'], ['service.finish', 'e_coat'],
      ['service.safetyCritical', 'yes'], ['service.toleranceClass', 'tight'],
    ]);
    const a = answersFromEngineeringData(confirmNames(data, ['material.family', 'material.grade', 'tolerance.generalClass', 'finish.coatingRoute', 'quality.safetyCritical']));
    expect(a.answers).toEqual({ 'material.family': 'cast iron', 'material.grade': 'mat-gjs500', 'service.toleranceClass': 'tight', 'service.safetyCritical': 'yes', 'service.finish': 'e_coat' });
    expect(a.dropped).toEqual([]);
  });
});

describe('a word the tables do not carry is left as written — never compared, never passed on', () => {
  it('a casting grade beside the ISO 2768 class: the grade governs, the letter is kept as the reader wrote it', () => {
    const data = build('cast_and_machine', [dp('tolerance.castingGrade', 'DCTG 9', 'ISO 8062-3 DCTG 9', { id: 'r:dctg', kind: 'interpreted' })]);
    const cls = byName(data, 'tolerance.generalClass');
    expect(cls.map(p => [p.id, p.value]).sort()).toEqual([['r:class', 'm'], ['r:dctg>tolerance.generalClass', 'standard']]);
    expect(cls.find(p => p.id === 'r:class')!.note).toMatch(/kept as written \("m"\), not in the costing's vocabulary: it would read as "tight", but .*DCTG 9.*governs/);
    expect(data.conflicts).toEqual([]);
    const a = answersFromEngineeringData(data);
    expect(a.leanings.filter(l => l.decisionId === 'service.toleranceClass').map(l => l.value)).toEqual(['standard']);
    // even confirmed, the letter is not an option of the question: dropped with the reason
    const forced = answersFromEngineeringData(confirmNames(data, ['tolerance.generalClass']));
    expect(forced.answers).toEqual({ 'service.toleranceClass': 'standard' });
    expect(forced.dropped).toEqual([expect.objectContaining({ parameterId: 'r:class', why: expect.stringMatching(/not a tolerance class the question offers/) })]);
  });

  it('"hard-anodise", "paint", an elastomer family: no engine value, so no leaning and no answer', () => {
    const data = consolidate({ drawing: drawingOf([
      dp('finish.coating', 'HARD ANODISE 50 µm', undefined, { id: 'c' }), dp('finish.coatingRoute', 'hard-anodise', 'HARD ANODISE 50 µm', { id: 'route', kind: 'interpreted' }),
      dp('material.family', 'elastomer', 'EPDM 70', { id: 'fam', kind: 'interpreted' }),
    ]), commodity: 'forging' });
    expect(byName(data, 'finish.coatingRoute')[0]).toMatchObject({ value: 'hard-anodise', status: 'extracted' });
    expect(byName(data, 'finish.coatingRoute')[0].note).toMatch(/kept as written .* hard anodising is not the sulphuric anodise route/);
    expect(byName(data, 'material.family')[0].note).toMatch(/not one of the engine's material families/);
    const a = answersFromEngineeringData(confirmNames(data, ['finish.coatingRoute', 'material.family']));
    expect(a.answers).toEqual({});
    expect(a.leanings).toEqual([]);
    expect(a.dropped.map(d => d.decisionId).sort()).toEqual(['material.family', 'service.finish']);
    // the coating itself is still reported as specified and not costed
    expect(data.notCosted.map(n => n.parameterId)).toContain('c');
  });

  it('two finishes named together are not one route', () => {
    const data = consolidate({ drawing: drawingOf([dp('finish.coatingRoute', 'zinc-plate + powder-coat', undefined, { id: 'route', kind: 'interpreted', status: 'needs-validation', rawText: '' })]), commodity: 'sheet_metal' });
    expect(byName(data, 'finish.coatingRoute')[0].value).toBe('zinc-plate + powder-coat');
    expect(byName(data, 'finish.coatingRoute')[0].note).toMatch(/names more than one finish/);
    expect(answersFromEngineeringData(data).leanings).toEqual([]);
  });

  it('the reader\'s route words map one to one where a route exists', () => {
    for (const [word, route] of [['zinc-nickel', 'zinc_nickel'], ['zinc-flake', 'zinc_flake'], ['hot-dip-galvanise', 'galvanise'], ['zinc-plate', 'zinc_plate'],
      ['e-coat', 'e_coat'], ['powder-coat', 'powder_coat'], ['anodise', 'anodise']]) {
      const data = consolidate({ drawing: drawingOf([dp('finish.coatingRoute', word, '', { id: 'route', kind: 'interpreted', rawText: '' })]), commodity: 'sheet_metal' });
      expect(byName(data, 'finish.coatingRoute')[0].value, word).toBe(route);
    }
    for (const word of ['phosphate', 'electroless-nickel', 'chrome', 'nickel', 'tin', 'black-oxide', 'conversion-coat', 'passivate', 'paint', 'hard-anodise']) {
      const data = consolidate({ drawing: drawingOf([dp('finish.coatingRoute', word, '', { id: 'route', kind: 'interpreted', rawText: '' })]), commodity: 'sheet_metal' });
      expect(byName(data, 'finish.coatingRoute')[0].value, word).toBe(word);
      expect(answersFromEngineeringData(data).leanings, word).toEqual([]);
    }
  });

  it('every family word the reader uses is the engine\'s family or is left as written', () => {
    const expected: Record<string, string | null> = {
      'aluminium (cast)': 'aluminium', 'aluminium (wrought)': 'aluminium', 'cast iron': 'cast iron', 'compacted graphite iron': 'cast iron',
      'ductile iron': 'cast iron', 'grey iron': 'cast iron', 'malleable iron': 'cast iron', steel: 'steel', magnesium: 'magnesium', titanium: 'titanium',
      zinc: 'zinc', 'nickel alloy': 'nickel alloy', 'copper alloy': 'copper alloy', copper: 'copper alloy', thermoplastic: 'plastic',
      elastomer: null, composite: null,
    };
    for (const [word, family] of Object.entries(expected)) {
      const data = consolidate({ drawing: drawingOf([dp('material.family', word, 'X', { id: 'fam', kind: 'interpreted' })]) });
      expect(byName(data, 'material.family')[0].value, word).toBe(family ?? word);
    }
  });
});

describe('the reader\'s structured values', () => {
  const data = build('cast_and_machine');
  const get = (id: string) => data.parameters.find(p => p.id === id)!;

  it('a hole { diameter, fit, upper, lower } links to its CAD hole and is kept (it carries a fit)', () => {
    expect(get('r:bore').appliesTo!.featureId).toMatch(/^cad-hole-\d+$/);
    expect(get('r:bore').status).toBe('extracted');
    // "6x Ø14" is the model's three rows of two Ø14 holes together
    expect(get('r:h14').appliesTo!.featureId!.split('+')).toHaveLength(3);
  });

  it('a thread { designation, nominal, pitch (ISO coarse), count } matches at its tapping-drill size', () => {
    const t = get('r:m10');
    expect(t.appliesTo!.featureId).toMatch(/^cad-hole-\d+$/);          // 2 × Ø8.5 through, 31.3 deep
    expect(t.note).toMatch(/tapping-drill Ø8.5 — ISO 261 coarse pitch 1.5 mm/);
  });

  it('a callout count below the model\'s hole count is not a conflict', () => {
    expect(data.conflicts).toEqual([]);
    expect(get('r:count').status).toBe('extracted');
    expect(get('r:count').note).toMatch(/calls out 7 of the 22 the 3D model has/);
    // more callouts than the model has holes IS one
    const over = consolidate({ cad: { geo: axle.geometry, filename: axle.part }, drawing: drawingOf([dp('feature.count.holes', 30, '9 hole callout(s)', { id: 'n', kind: 'interpreted' })]), commodity: 'cast_and_machine' });
    expect(over.conflicts.map(c => c.name)).toEqual(['feature.count.holes']);
  });

  it('what no question takes is listed as not costed; identity, units and cross-checks are not', () => {
    expect(data.notCosted.map(n => n.parameterId).sort()).toEqual(['r:bore', 'r:hbw', 'r:len', 'r:m10', 'r:tight'].sort());
    // "6x Ø14" with no tolerance says no more than the model does: a cross-check, not a requirement
  });

  it('the finish thickness { min } reaches the form-field path only once the route is confirmed — and e-coat does not price by thickness', () => {
    const a = answersFromEngineeringData(confirmNames(data, ['material.family', 'finish.coatingRoute', 'finish.coatingThickness']));
    expect(a.answers['service.finish']).toBe('e_coat');
    expect(a.formFields).toEqual([]);
    expect(a.formNotes).toEqual([expect.stringMatching(/20 µm is not used: the e coat route does not price by deposit thickness/)]);
  });

  it('the reader\'s heat-treatment keyword, with the clause in rawText, reads into the gear question', () => {
    const g = recorded('test-gear-m3-z38.step');
    const gear = consolidate({ cad: { geo: g.geometry, filename: g.part }, drawing: drawingOf([
      dp('heatTreat.process', 'case-harden', 'CASE HARDEN AND TEMPER TO 58-62 HRC', { id: 'ht', kind: 'interpreted' }),
      dp('heatTreat.caseDepth', { type: 'CHD', min: 0.8, max: 0.8, limitHardness: '550 HV1' }, 'CHD 0.8', { id: 'chd', unit: 'mm' }),
      dp('gear.qualityClass', '7', 'QUALITY ISO 1328: 7', { id: 'q' }),
      dp('gear.helixAngle', 0, 'β 0°', { id: 'helix', unit: 'deg' }),
      dp('gear.helixHand', 'right', 'RH', { id: 'hand' }), dp('gear.pressureAngle', 20, 'α 20°', { id: 'pa', unit: 'deg' }),
    ]), commodity: 'gear' });
    expect(byName(gear, 'heatTreat.route')[0].value).toBe('case_hardening');
    const a = answersFromEngineeringData(confirmNames(gear, ['heatTreat.route', 'heatTreat.caseDepth', 'gear.qualityClassIso', 'gear.helixAngle']));
    expect(a.answers).toEqual({ 'gear.helix': '0', 'gear.qualityClass': '7', 'gear.hardeningRoute': 'case_hardening', 'gear.effectiveCaseDepthMm': 0.8 });
    expect(gear.notCosted.map(n => n.parameterId).sort()).toEqual(['hand', 'pa']);
  });

  it('a solution-treat + age-harden pair from one clause is one T6 on an aluminium casting', () => {
    const cast = consolidate({ drawing: drawingOf([
      dp('heatTreat.process', 'solution-treat', 'SOLUTION TREATED AND ARTIFICIALLY AGED', { id: 'a', kind: 'interpreted' }),
      dp('heatTreat.process', 'age-harden', 'SOLUTION TREATED AND ARTIFICIALLY AGED', { id: 'b', kind: 'interpreted' }),
    ]), commodity: 'casting' });
    expect(byName(cast, 'material.condition').map(p => p.value)).toEqual(['T6']);
  });
});
