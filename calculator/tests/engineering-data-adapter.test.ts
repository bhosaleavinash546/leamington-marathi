/**
 * Layer 3 → 4 — THE adapter, and the proof that it changes no costing.
 *
 *  A. CAD only: every real part gives the engine ZERO answers, and costs exactly what it does today.
 *  B. A drawing nobody has confirmed gives zero answers — only leanings.
 *  C. Once confirmed, the answers are exactly what the engineer would have clicked, and the cost is the cost of those
 *     answers typed by hand (through `costMeasuredPart`, the product's own chain).
 *  D. A value the question does not accept is dropped with a reason — never passed through.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import { PARTS_DIR, outcomeFor } from '../scripts/real-parts-baseline.js';
import { runCostInputRules, specForCommodity, type Decision, type RuleContext } from '../src/engine/cost-input-rules/index.js';
import { consolidate } from '../src/engine/engineering-data/reconcile.js';
import { confirm, correct, reject, supply } from '../src/engine/engineering-data/overrides.js';
import { answersFromEngineeringData, ANSWER_CODECS } from '../src/engine/engineering-data/to-costing.js';
import type { ConsolidatedEngineeringData, EngineeringParameter } from '../src/engine/engineering-data/model.js';
import { RECORDED, recorded, dp, drawingOf, confirmNames, byName, WHO, LOCATIONS } from './engineering-data-helpers.js';

process.env.AIR_GAPPED = '1';

const cost = (part: string, geo: OCCTGeometry, answers: Record<string, unknown>, commodity?: string) =>
  outcomeFor(join(PARTS_DIR, part), geo, answers as Record<string, string>, commodity);

function openDecisions(part: string, commodity: string, answers: Record<string, unknown>, geo: OCCTGeometry = recorded(part).geometry): Decision[] {
  return runCostInputRules(specForCommodity(commodity)!, {
    geo, geometryQuality: 'occt', commodity, commoditySource: 'engineer', annualVolume: 50_000, filename: part, answers,
  } as RuleContext).decisions;
}
function withDrawing(part: string, commodity: string, params: EngineeringParameter[]): ConsolidatedEngineeringData {
  const b = recorded(part);
  return consolidate({ cad: { geo: b.geometry, filename: b.part }, drawing: drawingOf(params), commodity });
}

// ─── A. CAD only ──────────────────────────────────────────────────────────────────────────────────────────────────

describe('A. CAD only — nothing is added and nothing moves', () => {
  it.each(RECORDED.map(b => ({ part: b.part, b })))('$part: zero answers, and the cost is today\'s to the penny', async ({ b }) => {
    const commodity = b.outcome.commodity!;
    const adapted = answersFromEngineeringData(consolidate({ cad: { geo: b.geometry, filename: b.part }, commodity }));
    expect(adapted.answers).toEqual({});
    expect(adapted.evidence).toEqual({});
    expect(adapted.leanings).toEqual([]);
    expect(adapted.dropped).toEqual([]);
    expect(adapted.formFields).toEqual([]);
    expect(adapted.notCosted).toEqual([]);
    // The engine is handed the engineer's answers plus what the adapter adds (nothing): the recorded outcome, exactly.
    const now = await cost(b.part, b.geometry, { ...b.answers, ...adapted.answers }, b.commodity);
    expect(now.status).toBe(b.outcome.status);
    expect(now.commodity).toBe(b.outcome.commodity);
    expect(now.total).toBe(b.outcome.total);
    expect(now.breakdown).toEqual(b.outcome.breakdown);
  });

  it('a material the CAD file DECLARES is a leaning here too — never an answer (the engine reads the declaration itself, as today)', async () => {
    const b = recorded('PRCR002.stp');
    const geo = { ...b.geometry, cadMetadata: { productNames: ['PRCR002'], materialDesignations: ['EN-GJS-500-7'] } } as OCCTGeometry;
    const adapted = answersFromEngineeringData(consolidate({ cad: { geo, filename: b.part }, commodity: 'cast_and_machine' }));
    expect(adapted.answers).toEqual({});
    expect(adapted.leanings.map(l => [l.decisionId, l.value, l.source])).toEqual([['material.family', 'cast iron', 'derived'], ['material.grade', 'mat-gjs500', 'derived']]);
    // same geometry, same answers, with and without this layer: the same outcome
    expect(await cost(b.part, geo, { ...b.answers, ...adapted.answers })).toEqual(await cost(b.part, geo, { ...b.answers }));
  });

  it('with no route named the adapter still adds nothing', () => {
    const b = recorded('PRCR002.stp');
    expect(answersFromEngineeringData(consolidate({ cad: { geo: b.geometry, filename: b.part } })).answers).toEqual({});
    expect(answersFromEngineeringData(consolidate({ cad: { geo: b.geometry, filename: b.part } }), 'cast_and_machine').answers).toEqual({});
    expect(answersFromEngineeringData(consolidate({ cad: { geo: b.geometry, filename: b.part } }), 'no_such_route').answers).toEqual({});
  });
});

// ─── B + C. A casting ─────────────────────────────────────────────────────────────────────────────────────────────

describe('B, C. the stub axle (cast + machine) with its drawing', () => {
  const axle = recorded('PRCR002.stp');
  const drawing = [
    dp('material.designation', 'EN-GJS-500-7', 'MATERIAL: EN-GJS-500-7 TO EN 1563', { id: 'd:mat' }),
    dp('tolerance.castingGrade', 'DCTG 9', 'ISO 8062-3 - DCTG 9', { id: 'd:dctg' }),
    dp('quality.safetyCritical', true, '<S> SAFETY CRITICAL PART', { id: 'd:safety' }),
    dp('hole.diameter', { diameterMm: 24, count: 1, fit: 'H7' }, 'Ø24 H7', { id: 'd:bore' }),
    dp('gdt.frame', { characteristic: 'runout', toleranceMm: 0.05, datums: ['A'] }, '↗ 0.05 A', { id: 'd:gdt' }),
    dp('heatTreat.hardness', { min: 170, max: 230, scale: 'HBW' }, '170-230 HBW', { id: 'd:hbw' }),
  ];
  const unconfirmed = withDrawing(axle.part, 'cast_and_machine', drawing);
  const ROUTE = { 'commodity.route': 'cast_and_machine' };

  it('B. unconfirmed: zero answers; each reading is a leaning with its drawing location and text', () => {
    const a = answersFromEngineeringData(unconfirmed);
    expect(a.answers).toEqual({});
    expect(a.evidence).toEqual({});
    expect(a.leanings.map(l => [l.decisionId, l.value, l.status]).sort()).toEqual([
      ['material.family', 'cast iron', 'extracted'],
      ['material.grade', 'mat-gjs500', 'extracted'],
      ['service.safetyCritical', 'yes', 'extracted'],
      ['service.toleranceClass', 'standard', 'needs-validation'],
    ]);
    const lean = a.leanings.find(l => l.decisionId === 'material.grade')!;
    expect(lean).toMatchObject({ parameterId: 'd:mat>material.grade', sourceText: 'MATERIAL: EN-GJS-500-7 TO EN 1563', location: LOCATIONS.TITLE, kind: 'interpreted', sourceFile: 'part-drawing.pdf' });
    expect(lean.note).toMatch(/engine's own designation matcher/);
  });

  it('B. unconfirmed: the costing is exactly the costing without the drawing', async () => {
    const a = answersFromEngineeringData(unconfirmed);
    // with nothing answered the part asks its questions — the same ones, drawing or no drawing
    const without = await cost(axle.part, axle.geometry, { ...ROUTE });
    const withUnconfirmed = await cost(axle.part, axle.geometry, { ...ROUTE, ...a.answers });
    expect(withUnconfirmed).toEqual(without);
    expect(without.status).toBe('needs_answer');
    // and with the engineer's own answers it is today's recorded cost
    const today = await cost(axle.part, axle.geometry, { ...axle.answers, ...a.answers });
    expect(today.total).toBe(axle.outcome.total);
  });

  it('C. confirmed: the answers are exactly what the engineer would have clicked', async () => {
    let data = confirmNames(unconfirmed, ['material.family', 'material.grade', 'tolerance.generalClass', 'quality.safetyCritical']);
    // "not leak-tight" is not something a drawing states: the engineer says it
    data = supply(data, { name: 'quality.pressureTight', value: false }, WHO);
    const a = answersFromEngineeringData(data);
    const byHand = {
      'material.family': 'cast iron', 'material.grade': 'mat-gjs500', 'service.pressureTight': 'no',
      'service.toleranceClass': 'standard', 'service.safetyCritical': 'yes',
    };
    expect(a.answers).toEqual(byHand);
    expect(a.dropped).toEqual([]);
    expect(a.leanings).toEqual([]);
    // every answer is one the question the engine asks for THIS part accepts
    const asked = [...openDecisions(axle.part, 'cast_and_machine', {}), ...openDecisions(axle.part, 'cast_and_machine', { 'material.family': 'cast iron' }),
      ...openDecisions(axle.part, 'cast_and_machine', { 'material.family': 'cast iron', 'service.pressureTight': 'no', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'yes' })];
    for (const [id, value] of Object.entries(a.answers)) {
      const d = asked.find(x => x.id === id)!;
      expect(d, `the engine asks ${id}`).toBeDefined();
      expect(d.options.map(o => String(o.value)), id).toContain(String(value));
    }
    // evidence points at the drawing
    expect(a.evidence['material.grade']).toEqual({ parameterId: 'd:mat>material.grade', sourceText: 'MATERIAL: EN-GJS-500-7 TO EN 1563', location: LOCATIONS.TITLE, status: 'confirmed', source: 'derived', sourceFile: 'part-drawing.pdf' });
    expect(a.evidence['service.safetyCritical']).toMatchObject({ parameterId: 'd:safety', sourceText: '<S> SAFETY CRITICAL PART', status: 'confirmed', source: 'drawing' });
    expect(a.evidence['service.pressureTight']).toMatchObject({ source: 'manual', status: 'corrected' });

    // the cost through the adapter IS the cost of those answers typed by hand
    const viaAdapter = await cost(axle.part, axle.geometry, { ...ROUTE, ...a.answers });
    const typed = await cost(axle.part, axle.geometry, { ...ROUTE, ...byHand });
    expect(viaAdapter).toEqual(typed);
    expect(viaAdapter.status).toBe('costed');
    expect(viaAdapter.total).toBeGreaterThan(0);
    // the recorded baseline answered the same facts without naming the grade; EN-GJS-500-7 is the grade it costed
    expect(viaAdapter.total).toBe(axle.outcome.total);
  });

  it('what the drawing states that no question takes is returned as not costed, with its text and location', () => {
    const a = answersFromEngineeringData(unconfirmed);
    expect(a.notCosted.map(n => n.parameterId).sort()).toEqual(['d:bore', 'd:gdt', 'd:hbw']);
    for (const n of a.notCosted) expect(n.why).toBe('specified on the drawing — not in the cost model yet');
    expect(a.notCosted.find(n => n.parameterId === 'd:bore')).toMatchObject({ name: 'hole.diameter', sourceText: 'Ø24 H7', location: LOCATIONS.VIEW });
  });

  it('the dataset is asked for another route: the answers follow that route\'s questions', () => {
    const data = confirmNames(unconfirmed, ['material.family', 'material.grade', 'tolerance.generalClass', 'quality.safetyCritical']);
    // machining asks the family and safety only; cast iron is a family it offers; it has no grade or tolerance question
    expect(answersFromEngineeringData(data, 'machining').answers).toEqual({ 'material.family': 'cast iron', 'service.safetyCritical': 'yes' });
    // forging cannot be cast iron: the family and the grade are dropped with the reason, never passed
    const f = answersFromEngineeringData(data, 'forging');
    expect(f.answers).toEqual({ 'service.toleranceClass': 'standard', 'service.safetyCritical': 'yes' });
    expect(f.dropped.map(d => d.decisionId).sort()).toEqual(['material.family', 'material.grade']);
    expect(f.dropped.find(d => d.decisionId === 'material.family')!.why).toMatch(/not a material the forging route offers/);
  });
});

// ─── C. Other routes ──────────────────────────────────────────────────────────────────────────────────────────────

describe('C. confirmed drawings on the other routes cost as the same answers typed by hand', () => {
  it('forging: the steering knuckle', async () => {
    const k = recorded('steering_knuckle_RH.stp');
    let data = withDrawing(k.part, 'forging', [
      dp('material.designation', '38MnVS6'), dp('tolerance.general', 'EN 10243-1 grade F'), dp('note.general', 'SAFETY CRITICAL PART — 100 % CRACK DETECTION'),
    ]);
    expect(answersFromEngineeringData(data).answers).toEqual({});
    data = confirmNames(data, ['material.family', 'material.grade', 'tolerance.generalClass', 'quality.safetyCritical']);
    const a = answersFromEngineeringData(data);
    const byHand = { 'material.family': 'steel', 'material.grade': 'mat-steel-38mnvs6', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'yes' };
    expect(a.answers).toEqual(byHand);
    const viaAdapter = await cost(k.part, k.geometry, { 'commodity.route': 'forging', ...a.answers });
    expect(viaAdapter).toEqual(await cost(k.part, k.geometry, { 'commodity.route': 'forging', ...byHand }));
    expect(viaAdapter.status).toBe('costed');
  });

  it('gear: the data table answers helix and quality; the measured teeth are not overridden', async () => {
    const g = recorded('test-gear-m3-z38.step');
    let data = withDrawing(g.part, 'gear', [
      dp('gear.teeth', 38, 'z = 38'), dp('gear.module', 3, 'mn = 3', { unit: 'mm' }), dp('gear.helixAngle', 0, 'β = 0°', { unit: 'deg' }),
      dp('gear.qualityClass', 'ISO 1328 class 7', 'Quality: 7 (ISO 1328)'), dp('heatTreat.process', 'Case hardened and tempered 58-62 HRC'),
      dp('heatTreat.caseDepth', { min: 0.7, max: 0.7 }, 'CHD 0.7', { unit: 'mm' }),
    ]);
    // teeth and module agree with the model: folded into the measured rows
    expect(byName(data, 'gear.teeth')).toHaveLength(1);
    expect(data.conflicts).toEqual([]);
    data = confirmNames(data, ['gear.teeth', 'gear.module', 'gear.helixAngle', 'gear.qualityClassIso', 'heatTreat.route', 'heatTreat.caseDepth']);
    const hand = { 'gear.materialClass': 'case_hardening_steel' };           // not a drawing reading this layer maps
    const a = answersFromEngineeringData(data, 'gear', { decisions: openDecisions(g.part, 'gear', hand), answered: hand });
    expect(a.answers).toEqual({ 'gear.helix': '0', 'gear.qualityClass': '7', 'gear.hardeningRoute': 'case_hardening', 'gear.effectiveCaseDepthMm': 0.7 });
    // the tooth-count and module questions are not open (the kernel measured them): nothing is passed for them
    expect(a.dropped.map(d => d.decisionId).sort()).toEqual(['gear.moduleEntry', 'gear.teethEntry']);
    expect(a.dropped[0].why).toMatch(/measured this on the 3D model/);
    const viaAdapter = await cost(g.part, g.geometry, { 'material.family': 'steel', ...hand, ...a.answers });
    const typed = await cost(g.part, g.geometry, { 'material.family': 'steel', ...hand, 'gear.helix': '0', 'gear.qualityClass': '7', 'gear.hardeningRoute': 'case_hardening', 'gear.effectiveCaseDepthMm': 0.7 });
    expect(viaAdapter).toEqual(typed);
    // carburise at the 0.70 mm reference depth is what the recorded answers ("spur", class 7) cost by default
    expect(viaAdapter.total).toBe(g.outcome.total);
  });

  it('gear: tooth count, module and face width ARE passed when the kernel found no gear and the engine asks', () => {
    const g = recorded('test-gear-m3-z38.step');
    const noGear = { ...g.geometry, gear: null } as OCCTGeometry;
    let data = consolidate({ cad: { geo: noGear, filename: g.part }, drawing: drawingOf([
      dp('gear.teeth', 38, 'z = 38'), dp('gear.module', 3, 'mn = 3', { unit: 'mm' }), dp('gear.faceWidth', 30, 'b = 30', { unit: 'mm' }), dp('gear.helixAngle', 0, 'β = 0°', { unit: 'deg' }),
    ]), commodity: 'gear' });
    data = confirmNames(data, ['gear.teeth', 'gear.module', 'gear.faceWidth', 'gear.helixAngle']);
    const open = [...openDecisions(g.part, 'gear', {}, noGear), ...openDecisions(g.part, 'gear', { 'gear.teethEntry': 38, 'gear.helix': '0' }, noGear),
      ...openDecisions(g.part, 'gear', { 'gear.teethEntry': 38, 'gear.helix': '0', 'gear.moduleEntry': 3, 'gear.qualityClass': '7', 'gear.materialClass': 'case_hardening_steel' }, noGear)];
    expect(open.map(d => d.id)).toEqual(expect.arrayContaining(['gear.teethEntry', 'gear.moduleEntry', 'gear.faceWidthEntry']));
    const a = answersFromEngineeringData(data, 'gear', { decisions: open });
    expect(a.answers).toEqual({ 'gear.helix': '0', 'gear.teethEntry': 38, 'gear.moduleEntry': 3, 'gear.faceWidthEntry': 30 });
    // without the open decisions the adapter cannot know the question exists: nothing is passed, and it says why
    const blind = answersFromEngineeringData(data, 'gear');
    expect(blind.answers).toEqual({ 'gear.helix': '0' });
    expect(blind.dropped.every(d => /pass the engine's open decisions/.test(d.why))).toBe(true);
  });

  it('aluminium extrusion: alloy, temper and finish', async () => {
    const c = recorded('AL_Trim_Channel.stp');
    let data = withDrawing(c.part, 'aluminium_extrusion', [dp('material.designation', 'EN AW-6060 T66'), dp('finish.coating', 'Anodised AA10, natural')]);
    expect(answersFromEngineeringData(data).answers).toEqual({});
    data = confirmNames(data, ['material.alloy', 'material.condition', 'finish.coatingRoute']);
    const a = answersFromEngineeringData(data);
    const byHand = { 'material.alAlloy': '6060', 'al.temper': 'T66', 'al.finish': 'anodise' };
    expect(a.answers).toEqual(byHand);
    const viaAdapter = await cost(c.part, c.geometry, { 'commodity.route': 'aluminium_extrusion', ...a.answers });
    expect(viaAdapter).toEqual(await cost(c.part, c.geometry, { 'commodity.route': 'aluminium_extrusion', ...byHand }));
    // T66 is 6060's own default temper, so this is the recorded cost (alloy 6060, anodised)
    expect(viaAdapter.total).toBe(c.outcome.total);
  });

  it('injection moulding: the resin by its ISO 11469 marking', async () => {
    const m = recorded('IM_ECU_Cover.stp');
    let data = withDrawing(m.part, 'injection_moulding', [dp('material.designation', '>PA66-GF30<')]);
    data = confirmNames(data, ['material.grade']);
    const a = answersFromEngineeringData(data);
    expect(a.answers).toEqual({ 'material.resin': 'mat-pa66gf30' });
    const rest = { 'commodity.route': 'injection_moulding', 'commodity.thinWallRoute': 'injection_moulding' };
    const viaAdapter = await cost(m.part, m.geometry, { ...rest, ...a.answers });
    expect(viaAdapter.total).toBe(m.outcome.total);
    expect(viaAdapter).toEqual(await cost(m.part, m.geometry, { ...rest, 'material.resin': 'mat-pa66gf30' }));
  });

  it('rubber and composites: the compound and the laminate system', async () => {
    const r = recorded('RUB_Grommet.stp');
    const rubber = confirmNames(withDrawing(r.part, 'rubber', [dp('material.designation', 'EPDM 70 Shore A')]), ['material.grade']);
    const ra = answersFromEngineeringData(rubber);
    expect(ra.answers).toEqual({ 'material.elastomer': 'mat-epdm' });
    expect((await cost(r.part, r.geometry, { 'commodity.route': 'rubber', ...ra.answers })).total).toBe(r.outcome.total);

    const c = recorded('COMP_Roof_Panel.stp');
    const read = withDrawing(c.part, 'composites', [dp('material.designation', 'CFRP prepreg, autoclave cured')]);
    expect(answersFromEngineeringData(read).leanings).toEqual([expect.objectContaining({ decisionId: 'material.laminate', value: 'prepreg-cf', status: 'needs-validation' })]);
    const ca = answersFromEngineeringData(confirmNames(read, ['material.laminateSystem']));
    expect(ca.answers).toEqual({ 'material.laminate': 'prepreg-cf' });
    expect((await cost(c.part, c.geometry, { 'commodity.route': 'composites', ...ca.answers })).total).toBe(c.outcome.total);
  });

  it('sheet metal: grade and finish; the deposit thickness and masks go to the form fields, inside the existing limits', async () => {
    const s = recorded('BIW_Reinf_Channel.stp');          // three Ø9 holes measured
    const read = withDrawing(s.part, 'sheet_metal', [
      dp('material.designation', 'DC04'), dp('finish.coating', 'Zinc plated Fe//Zn8//A'), dp('finish.maskedFeatures', 2, 'MASK 2 HOLES'),
    ]);
    let data = confirmNames(read, ['material.family', 'material.grade', 'finish.coatingRoute', 'finish.coatingThickness', 'finish.maskedFeatures']);
    const a = answersFromEngineeringData(data);
    const byHand = { 'material.family': 'steel', 'material.grade': 'mat-dc04', 'service.finish': 'zinc_plate' };
    expect(a.answers).toEqual(byHand);
    expect(a.formFields).toEqual([
      expect.objectContaining({ fieldId: 'sm-sf-um', value: 8 }),
      expect.objectContaining({ fieldId: 'sm-sf-mask', value: 2 }),
    ]);
    expect(a.formFields[0].note).toMatch(/inside 5–25 µm/);
    const route = { 'commodity.route': 'sheet_metal' };
    expect(await cost(s.part, s.geometry, { ...route, ...a.answers })).toEqual(await cost(s.part, s.geometry, { ...route, ...byHand }));

    // a thickness outside the route's range, and more masks than the model has holes, are not used — and it says so
    const thick = byName(data, 'finish.coatingThickness')[0];
    data = correct(data, thick.id, { min: 60, max: 60 }, WHO);
    data = correct(data, byName(data, 'finish.maskedFeatures')[0].id, 999, WHO);
    const b = answersFromEngineeringData(data);
    expect(b.formFields).toEqual([]);
    expect(b.formNotes).toEqual([expect.stringMatching(/60 µm is outside 5–25 µm/), expect.stringMatching(/999 masked feature\(s\) not used: more than the 3 holes measured/)]);
    expect(b.answers).toEqual(byHand);                 // form fields never enter the answers
    // a range is not one figure
    data = correct(data, thick.id, { min: 8, max: 12 }, WHO);
    expect(answersFromEngineeringData(data).formNotes[0]).toMatch(/8–12 µm is a range/);
    // with no finish route confirmed, no form field is filled at all
    expect(answersFromEngineeringData(confirmNames(read, ['finish.coatingThickness'])).formFields).toEqual([]);
  });
});

// ─── D. Only values the question accepts ──────────────────────────────────────────────────────────────────────────

describe('D. a value the question does not accept is dropped with a reason', () => {
  const axle = recorded('PRCR002.stp');
  const base = () => withDrawing(axle.part, 'cast_and_machine', [
    dp('material.designation', 'EN-GJS-500-7', undefined, { id: 'd:mat' }), dp('tolerance.general', 'ISO 8062-3 DCTG 9', undefined, { id: 'd:tol' }),
    dp('finish.coating', 'KTL black', undefined, { id: 'd:coat' }), dp('heatTreat.process', 'Heat treat to T6', undefined, { id: 'd:ht' }),
  ]);
  const only = (data: ConsolidatedEngineeringData, id: string) => answersFromEngineeringData(data).dropped.filter(d => d.parameterId === id);

  it('an unknown tolerance class', () => {
    const data = correct(base(), 'd:tol>tolerance.generalClass', 'medium', WHO);
    const a = answersFromEngineeringData(data);
    expect(a.answers['service.toleranceClass']).toBeUndefined();
    expect(only(data, 'd:tol>tolerance.generalClass')[0].why).toMatch(/not a tolerance class the question offers \(loose, standard, tight\)/);
  });

  it('a finish the route and metal do not offer', () => {
    let data = confirmNames(base(), ['material.family']);
    data = correct(data, 'd:coat>finish.coatingRoute', 'anodise', WHO);
    expect(answersFromEngineeringData(data).answers['service.finish']).toBeUndefined();
    expect(only(data, 'd:coat>finish.coatingRoute')[0].why).toMatch(/not a finish the question offers for cast iron/);
    // the same check against the question the engine actually shows for this part
    const shown = openDecisions(axle.part, 'cast_and_machine', { 'material.family': 'cast iron' });
    const withDecisions = answersFromEngineeringData(correct(data, 'd:coat>finish.coatingRoute', 'e_coat', WHO), 'cast_and_machine', { decisions: shown });
    expect(withDecisions.answers['service.finish']).toBe('e_coat');
  });

  it('a made-up finish route, a made-up grade, a made-up family', () => {
    let data = correct(base(), 'd:coat>finish.coatingRoute', 'gold_plate', WHO);
    data = correct(data, 'd:mat>material.grade', 'mat-unobtainium', WHO);
    data = correct(data, 'd:mat>material.family', 'adamantium', WHO);
    const a = answersFromEngineeringData(data);
    expect(a.answers).toEqual({});
    expect(a.dropped.map(d => d.decisionId).sort()).toEqual(['material.family', 'material.grade', 'service.finish']);
    expect(a.dropped.find(d => d.decisionId === 'material.grade')!.why).toMatch(/not a grade in the rate book/);
  });

  it('a grade of another family than the one that is settled, and a grade outside the route\'s scope', () => {
    let data = confirmNames(base(), ['material.family']);
    data = correct(data, 'd:mat>material.grade', 'mat-adc12', WHO);                    // an aluminium die-cast alloy
    expect(only(data, 'd:mat>material.grade')[0].why).toMatch(/is aluminium, and the material is settled as cast iron/);
    expect(answersFromEngineeringData(data).answers).toEqual({ 'material.family': 'cast iron' });
    // a sheet steel is steel — a family a casting can be — but not a grade the casting grade question accepts
    const sheet = correct(base(), 'd:mat>material.grade', 'mat-dc04', WHO);
    expect(only(sheet, 'd:mat>material.grade')[0].why).toMatch(/not a grade the cast and machine grade question accepts/);
    expect(answersFromEngineeringData(sheet).answers).toEqual({});
  });

  it('a temper that is not one of the casting question\'s three options', () => {
    const data = correct(base(), 'd:ht>material.condition', 'T7', WHO);
    expect(answersFromEngineeringData(data).answers['casting.heatTreat']).toBeUndefined();
    expect(only(data, 'd:ht>material.condition')[0].why).toMatch(/not one of the question's options \(T6, T5, F\)/);
    expect(answersFromEngineeringData(confirm(base(), 'd:ht>material.condition', WHO)).answers).toEqual({ 'casting.heatTreat': 'T6' });
  });

  it('a hardening route the gear\'s steel cannot take is refused by the question the engine shows', () => {
    const g = recorded('test-gear-m3-z38.step');
    let data = withDrawing(g.part, 'gear', [dp('heatTreat.process', 'Gas nitrided', undefined, { id: 'd:ht' })]);
    data = confirm(data, 'd:ht>heatTreat.route', WHO);
    const hand = { 'gear.helix': '0', 'gear.qualityClass': '7', 'gear.materialClass': 'case_hardening_steel' };
    const shown = openDecisions(g.part, 'gear', hand);
    const a = answersFromEngineeringData(data, 'gear', { decisions: shown, answered: hand });
    expect(a.answers).toEqual({});
    expect(a.dropped[0].why).toMatch(/"nitriding" is not an option the question "Which hardening route does this gear take\?" offers for this part/);
    // on a through-hardening steel the same route IS offered
    const th = { ...hand, 'gear.materialClass': 'through_hardening_steel' };
    expect(answersFromEngineeringData(data, 'gear', { decisions: openDecisions(g.part, 'gear', th), answered: th }).answers).toEqual({ 'gear.hardeningRoute': 'nitriding' });
  });

  it('a case depth given as a range, a helix of 75°, a quality class of 14', () => {
    const g = recorded('test-gear-m3-z38.step');
    let data = withDrawing(g.part, 'gear', [dp('heatTreat.caseDepth', { min: 0.8, max: 1.2 }, 'CHD 0.8-1.2', { id: 'd:chd', unit: 'mm' }), dp('gear.helixAngle', 75, 'β 75°', { id: 'd:helix', unit: 'deg' })]);
    data = confirmNames(data, ['heatTreat.caseDepth', 'gear.helixAngle']);
    data = supply(data, { name: 'gear.qualityClassIso', value: 14 }, WHO);
    const a = answersFromEngineeringData(data);
    expect(a.answers).toEqual({});
    expect(a.dropped.find(d => d.decisionId === 'gear.effectiveCaseDepthMm')!.why).toMatch(/gives a range \(0.8–1.2 mm\) and the costing takes ONE effective case depth/);
    expect(a.dropped.find(d => d.decisionId === 'gear.helix')!.why).toMatch(/not a helix angle under 60°/);
    expect(a.dropped.find(d => d.decisionId === 'gear.qualityClass')!.why).toMatch(/not an ISO 1328 class 1–11/);
    // corrected to one figure, it passes
    expect(answersFromEngineeringData(correct(data, 'd:chd', 1.0, WHO)).answers).toEqual({ 'gear.effectiveCaseDepthMm': 1 });
  });

  it('a temper the alloy does not take; and a temper with no alloy settled', () => {
    const c = recorded('AL_Crash_Box.stp');
    let data = withDrawing(c.part, 'aluminium_extrusion', [dp('material.designation', 'EN AW-6082 T6', undefined, { id: 'd:mat' })]);
    data = confirm(data, 'd:mat>material.condition', WHO);
    expect(answersFromEngineeringData(data).dropped[0].why).toMatch(/the alloy is not settled/);
    data = confirm(data, 'd:mat>material.alloy', WHO);
    expect(answersFromEngineeringData(data).answers).toEqual({ 'material.alAlloy': '6082', 'al.temper': 'T6' });
    data = correct(data, 'd:mat>material.condition', 'H112', WHO);
    const a = answersFromEngineeringData(data);
    expect(a.answers).toEqual({ 'material.alAlloy': '6082' });
    expect(a.dropped[0].why).toMatch(/not a temper the question offers for 6082/);
  });

  it('every reader refuses a value of the wrong kind — none returns an answer for junk', () => {
    const ctx = { commodity: 'casting', family: null, alloy: null };
    for (const [name, codec] of Object.entries(ANSWER_CODECS)) {
      for (const junk of ['', 'zzz-not-a-value', { a: 1 }, -999]) {
        const r = codec.read(junk as never, ctx);
        expect(r.ok, `${name} accepted ${JSON.stringify(junk)}`).toBe(false);
        if (!r.ok) expect(r.why.length).toBeGreaterThan(5);
      }
    }
  });
});

// ─── The rules of precedence between the engineer and the drawing ─────────────────────────────────────────────────

describe('what never becomes an answer', () => {
  const axle = recorded('PRCR002.stp');
  const read = () => withDrawing(axle.part, 'cast_and_machine', [
    dp('material.designation', 'EN-GJS-500-7', undefined, { id: 'd:mat' }), dp('quality.safetyCritical', true, 'SAFETY CRITICAL', { id: 'd:safety' }),
  ]);

  it('a rejected parameter, even one confirmed before', () => {
    const data = reject(confirm(read(), 'd:safety', WHO), 'd:safety', WHO);
    const a = answersFromEngineeringData(data);
    expect(a.answers).toEqual({});
    expect(a.leanings.map(l => l.decisionId)).not.toContain('service.safetyCritical');
  });

  it('an answer the engineer already gave by hand is never overwritten', () => {
    const data = confirm(read(), 'd:safety', WHO);
    const a = answersFromEngineeringData(data, 'cast_and_machine', { answered: { 'service.safetyCritical': 'no' } });
    expect(a.answers).toEqual({});
    expect(a.dropped).toEqual([expect.objectContaining({ decisionId: 'service.safetyCritical', why: expect.stringMatching(/already answered this question by hand \("no"\)/) })]);
    // the same answer by hand: nothing to add, nothing to report
    const same = answersFromEngineeringData(data, 'cast_and_machine', { answered: { 'service.safetyCritical': 'yes' } });
    expect(same.answers).toEqual({});
    expect(same.dropped).toEqual([]);
  });

  it('two confirmed values that disagree: nothing is passed', () => {
    let data = confirm(read(), 'd:safety', WHO);
    data = supply(data, { name: 'quality.safetyCritical', value: false }, WHO);
    const a = answersFromEngineeringData(data);
    expect(a.answers['service.safetyCritical']).toBeUndefined();
    expect(a.dropped.filter(d => d.decisionId === 'service.safetyCritical')).toHaveLength(2);
    expect(a.dropped[0].why).toMatch(/confirmed values disagree/);
  });

  it('a missing parameter: no 0, no empty string, no default — the key is simply absent', () => {
    const data = confirmNames(read(), ['material.family']);
    const a = answersFromEngineeringData(data);
    expect(Object.keys(a.answers)).toEqual(['material.family']);
    for (const id of ['service.toleranceClass', 'service.pressureTight', 'service.finish', 'casting.heatTreat', 'service.impregnation']) expect(id in a.answers).toBe(false);
    expect(data.missing.map(m => m.name)).toContain('tolerance.general');
  });
});
