/**
 * Layer 3 — the engineer's decisions. confirm / correct / reject / resolveConflict / reopen (and supply) return a new
 * dataset with a history entry on every parameter they change; the dataset they were given is never altered.
 */
import { describe, it, expect } from 'vitest';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import { consolidate } from '../src/engine/engineering-data/reconcile.js';
import { confirm, correct, reject, resolveConflict, reopen, supply, OverrideError } from '../src/engine/engineering-data/overrides.js';
import { answersFromEngineeringData } from '../src/engine/engineering-data/to-costing.js';
import type { ConsolidatedEngineeringData } from '../src/engine/engineering-data/model.js';
import { dp, drawingOf, byName, WHO, recorded } from './engineering-data-helpers.js';

const LATER = { by: 'chief.engineer', at: '2026-11-10T11:30:00.000Z', reason: 'checked against issue C of the drawing' };

function castingData(): ConsolidatedEngineeringData {
  const axle = recorded('PRCR002.stp');
  return consolidate({
    cad: { geo: axle.geometry, filename: axle.part },
    drawing: drawingOf([
      dp('material.designation', 'EN-GJS-500-7', 'MATERIAL: EN-GJS-500-7', { id: 'd:mat' }),
      dp('tolerance.general', 'ISO 8062-3 DCTG 9', undefined, { id: 'd:tol' }),
      dp('quality.safetyCritical', true, 'SAFETY CRITICAL PART', { id: 'd:safety' }),
    ]),
    commodity: 'cast_and_machine',
  });
}
const GRADE = 'd:mat>material.grade';
const FAMILY = 'd:mat>material.family';
const get = (d: ConsolidatedEngineeringData, id: string) => d.parameters.find(p => p.id === id)!;

describe('confirm', () => {
  it('records who, when, from and to — and leaves the dataset it was given untouched', () => {
    const before = castingData();
    const frozen = JSON.stringify(before);
    const after = confirm(before, GRADE, LATER);
    expect(JSON.stringify(before)).toBe(frozen);
    const p = get(after, GRADE);
    expect(p.status).toBe('confirmed');
    expect(p.value).toBe('mat-gjs500');
    expect(p.history).toEqual([{
      by: 'chief.engineer', at: '2026-11-10T11:30:00.000Z', action: 'confirm', reason: 'checked against issue C of the drawing',
      from: { status: 'extracted', value: 'mat-gjs500' }, to: { status: 'confirmed', value: 'mat-gjs500' },
    }]);
  });

  it('only what is confirmed reaches the adapter — confirming a reading does not confirm what was interpreted from it', () => {
    const data = castingData();
    expect(answersFromEngineeringData(data).answers).toEqual({});
    const reading = confirm(data, 'd:mat', WHO);
    expect(get(reading, GRADE).status).toBe('extracted');
    expect(answersFromEngineeringData(reading).answers).toEqual({});
    const grade = confirm(reading, GRADE, WHO);
    expect(answersFromEngineeringData(grade).answers).toEqual({ 'material.grade': 'mat-gjs500' });
  });

  it('refuses one side of an open conflict, a rejected reading and an unknown id', () => {
    const geo = { ...recorded('PRCR002.stp').geometry, cadMetadata: { productNames: [], materialDesignations: ['EN-GJS-400-15'] } } as OCCTGeometry;
    const conflicted = consolidate({ cad: { geo, filename: 'PRCR002.stp' }, drawing: drawingOf([dp('material.designation', 'EN-GJS-500-7', undefined, { id: 'd:mat' })]), commodity: 'casting' });
    expect(() => confirm(conflicted, 'd:mat', WHO)).toThrow(/resolve the conflict/);
    expect(() => confirm(reject(castingData(), 'd:tol', WHO), 'd:tol', WHO)).toThrow(/reopen it first/);
    expect(() => confirm(castingData(), 'nope', WHO)).toThrow(OverrideError);
  });
});

describe('correct', () => {
  it('the typed value replaces the reading; what was read stays in rawText and the history', () => {
    const after = correct(castingData(), 'd:tol', 'ISO 8062-3 DCTG 12', LATER);
    const p = get(after, 'd:tol');
    expect(p).toMatchObject({ status: 'corrected', value: 'ISO 8062-3 DCTG 12', rawText: 'ISO 8062-3 DCTG 9' });
    expect(p.history![0]).toMatchObject({ action: 'correct', by: 'chief.engineer', from: { status: 'extracted', value: 'ISO 8062-3 DCTG 9' }, to: { status: 'corrected', value: 'ISO 8062-3 DCTG 12' } });
  });

  it('what was interpreted from the old value is replaced by an interpretation of the new one', () => {
    const before = castingData();
    expect(byName(before, 'tolerance.generalClass')[0].value).toBe('standard');
    const after = correct(before, 'd:tol', 'ISO 8062-3 DCTG 12', WHO);
    const cls = byName(after, 'tolerance.generalClass');
    expect(cls).toHaveLength(1);
    expect(cls[0]).toMatchObject({ value: 'loose', derivedFrom: ['d:tol'], status: 'needs-validation' });
    // a corrected reading is the engineer's, but its interpretation still has to be confirmed
    expect(answersFromEngineeringData(after).answers).toEqual({});
  });

  it('an interpreted value the engineer had confirmed is reopened when its source is corrected — never silently kept', () => {
    const confirmed = confirm(castingData(), GRADE, WHO);
    expect(answersFromEngineeringData(confirmed).answers['material.grade']).toBe('mat-gjs500');
    const after = correct(confirmed, 'd:mat', 'EN-GJS-400-15', LATER);
    const g = get(after, GRADE);
    expect(g).toMatchObject({ value: 'mat-gjs400', status: 'needs-validation' });
    expect(g.note).toMatch(/earlier confirmation no longer applies/);
    expect(g.history!.map(h => h.action)).toEqual(['confirm', 'reopen']);
    expect(answersFromEngineeringData(after).answers).toEqual({});
  });

  it('a correction that no longer resolves leaves the question open and says why', () => {
    const after = correct(confirm(castingData(), GRADE, WHO), 'd:mat', 'Werkstoff 4711', WHO);
    expect(after.parameters.find(p => p.id === GRADE)).toBeUndefined();
    expect(after.missing.find(m => m.name === 'material.grade')!.why).toMatch(/"Werkstoff 4711" names no grade/);
    expect(answersFromEngineeringData(after).answers).toEqual({});
  });

  it('correcting an interpreted value directly makes it the engineer\'s own figure', () => {
    const after = correct(castingData(), 'd:tol>tolerance.generalClass', 'tight', WHO);
    expect(get(after, 'd:tol>tolerance.generalClass')).toMatchObject({ value: 'tight', status: 'corrected' });
    expect(answersFromEngineeringData(after).answers).toEqual({ 'service.toleranceClass': 'tight' });
  });

  it('a typed value is put in the dictionary unit', () => {
    const seat = recorded('Seat_Locking_Bracket.stp');
    const data = consolidate({ cad: { geo: seat.geometry, filename: seat.part }, commodity: 'sheet_metal' });
    const after = correct(data, 'cad:material.stockThickness', 0.063, WHO, { unit: 'in' });
    expect(get(after, 'cad:material.stockThickness')).toMatchObject({ unit: 'mm', status: 'corrected' });
    expect(get(after, 'cad:material.stockThickness').value).toBeCloseTo(1.6002, 10);
  });

  it('needs a value', () => {
    expect(() => correct(castingData(), 'd:tol', '  ', WHO)).toThrow(/reject it/);
  });
});

describe('reject', () => {
  it('a rejected parameter never reaches the adapter — nor does anything derived from it', () => {
    let data = castingData();
    for (const id of [GRADE, FAMILY]) data = confirm(data, id, WHO);
    expect(answersFromEngineeringData(data).answers).toEqual({ 'material.family': 'cast iron', 'material.grade': 'mat-gjs500' });
    const after = reject(data, 'd:mat', LATER);
    expect(get(after, 'd:mat').status).toBe('rejected');
    expect(get(after, GRADE).status).toBe('rejected');
    expect(get(after, FAMILY).status).toBe('rejected');
    expect(get(after, GRADE).history!.map(h => h.action)).toEqual(['confirm', 'reject']);
    expect(get(after, GRADE).history![1].reason).toMatch(/its source reading "d:mat" was rejected — checked against issue C/);
    const a = answersFromEngineeringData(after);
    expect(a.answers).toEqual({});
    expect(a.leanings.filter(l => l.decisionId.startsWith('material.'))).toEqual([]);
    // the reading is still in the dataset, and the material is missing again
    expect(after.parameters.map(p => p.id)).toContain('d:mat');
    expect(after.missing.map(m => m.name)).toContain('material.designation');
  });

  it('rejecting a confirmed flag withdraws its answer', () => {
    const yes = confirm(castingData(), 'd:safety', WHO);
    expect(answersFromEngineeringData(yes).answers).toEqual({ 'service.safetyCritical': 'yes' });
    expect(answersFromEngineeringData(reject(yes, 'd:safety', WHO)).answers).toEqual({});
  });
});

describe('resolveConflict', () => {
  function conflicted(): ConsolidatedEngineeringData {
    const geo = { ...recorded('PRCR002.stp').geometry, cadMetadata: { productNames: [], materialDesignations: ['EN-GJS-400-15'] } } as OCCTGeometry;
    return consolidate({ cad: { geo, filename: 'PRCR002.stp' }, drawing: drawingOf([dp('material.designation', 'EN-GJS-500-7', undefined, { id: 'd:mat' })]), commodity: 'cast_and_machine' });
  }
  const CAD = 'cad:material.designation:0';

  it('choosing a side confirms it, rejects the other, and records the resolution', () => {
    const before = conflicted();
    const i = before.conflicts.findIndex(c => c.name === 'material.designation');
    const after = resolveConflict(before, { name: 'material.designation' }, { parameterId: 'd:mat' }, LATER);
    expect(get(after, 'd:mat').status).toBe('confirmed');
    expect(get(after, CAD).status).toBe('rejected');
    expect(after.conflicts[i].resolution).toEqual({ parameterId: 'd:mat', by: 'chief.engineer', at: LATER.at, reason: LATER.reason });
    expect(get(after, 'd:mat').history![0]).toMatchObject({ action: 'resolve-conflict', from: { status: 'conflict' }, to: { status: 'confirmed' } });
    expect(get(after, CAD).history![0]).toMatchObject({ action: 'resolve-conflict', to: { status: 'rejected' } });
    // what was interpreted from the losing side goes with it
    expect(get(after, `${CAD}>material.grade`).status).toBe('rejected');
    // the dataset it was given still shows the open conflict
    expect(before.conflicts[i].resolution).toBeUndefined();
    expect(get(before, 'd:mat').status).toBe('conflict');
  });

  it('typing a value settles it against every side', () => {
    const after = resolveConflict(conflicted(), { name: 'material.designation' }, { value: 'EN-GJS-600-3' }, WHO);
    expect(get(after, 'd:mat').status).toBe('rejected');
    expect(get(after, CAD).status).toBe('rejected');
    const typed = byName(after, 'material.designation').find(p => p.source === 'manual')!;
    expect(typed).toMatchObject({ value: 'EN-GJS-600-3', status: 'corrected', method: 'typed' });
    expect(after.conflicts.find(c => c.name === 'material.designation')!.resolution!.parameterId).toBe(typed.id);
  });

  it('the precedence suggestion is never applied by itself', () => {
    const data = conflicted();
    const c = data.conflicts.find(x => x.name === 'material.designation')!;
    expect(c.suggested).toBe('d:mat');
    expect(get(data, 'd:mat').status).toBe('conflict');
    expect(answersFromEngineeringData(data).answers).toEqual({});
  });

  it('refuses a side that is not in the conflict, and a conflict that is already resolved', () => {
    expect(() => resolveConflict(conflicted(), { name: 'material.designation' }, { parameterId: 'cad:part.volume' }, WHO)).toThrow(/not a side/);
    const once = resolveConflict(conflicted(), 0, { parameterId: conflicted().conflicts[0].sides[0].parameterId }, WHO);
    expect(() => resolveConflict(once, 0, { parameterId: once.conflicts[0].sides[0].parameterId }, WHO)).toThrow(/already resolved/);
    expect(() => resolveConflict(conflicted(), { name: 'part.volume' }, { value: 1 }, WHO)).toThrow(/no such open conflict/);
  });

  it('reopening a side opens the conflict again — every side back in conflict, nothing chosen', () => {
    const resolved = resolveConflict(conflicted(), { name: 'material.designation' }, { parameterId: 'd:mat' }, WHO);
    const again = reopen(resolved, 'd:mat', LATER);
    expect(get(again, 'd:mat').status).toBe('conflict');
    expect(get(again, CAD).status).toBe('conflict');
    expect(again.conflicts.find(c => c.name === 'material.designation')!.resolution).toBeUndefined();
    expect(get(again, `${CAD}>material.grade`).status).not.toBe('rejected');
    expect(get(again, 'd:mat').history!.map(h => h.action)).toEqual(['resolve-conflict', 'reopen']);
    expect(get(again, CAD).history!.map(h => h.action)).toEqual(['resolve-conflict', 'reopen']);
    // and it can be resolved the other way
    const other = resolveConflict(again, { name: 'material.designation' }, { parameterId: CAD }, WHO);
    expect(get(other, CAD).status).toBe('confirmed');
    expect(get(other, 'd:mat').status).toBe('rejected');
  });
});

describe('reopen', () => {
  it('a confirmed value goes back to unconfirmed and leaves the answers', () => {
    const confirmed = confirm(castingData(), 'd:safety', WHO);
    const again = reopen(confirmed, 'd:safety', LATER);
    expect(get(again, 'd:safety').status).toBe('extracted');
    expect(get(again, 'd:safety').history!.map(h => h.action)).toEqual(['confirm', 'reopen']);
    expect(get(again, 'd:safety').history![1]).toMatchObject({ by: 'chief.engineer', from: { status: 'confirmed' }, to: { status: 'extracted' } });
    expect(answersFromEngineeringData(again).answers).toEqual({});
    expect(answersFromEngineeringData(again).leanings.map(l => l.decisionId)).toContain('service.safetyCritical');
  });

  it('a corrected value goes back to what was read', () => {
    const corrected = correct(castingData(), 'd:tol>tolerance.generalClass', 'tight', WHO);
    const again = reopen(corrected, 'd:tol>tolerance.generalClass', WHO);
    expect(get(again, 'd:tol>tolerance.generalClass')).toMatchObject({ value: 'standard', status: 'needs-validation' });
  });

  it('a rejected reading comes back, with what was derived from it', () => {
    const rejected = reject(castingData(), 'd:mat', WHO);
    const again = reopen(rejected, 'd:mat', WHO);
    expect(get(again, 'd:mat').status).toBe('extracted');
    expect(get(again, GRADE).status).toBe('extracted');
    expect(get(again, FAMILY).status).toBe('extracted');
    expect(again.missing.map(m => m.name)).not.toContain('material.designation');
  });

  it('can be decided again after reopening, and the whole trail is kept', () => {
    let d = confirm(castingData(), 'd:safety', WHO);
    d = reopen(d, 'd:safety', WHO);
    d = reject(d, 'd:safety', LATER);
    d = reopen(d, 'd:safety', LATER);
    d = confirm(d, 'd:safety', LATER);
    expect(get(d, 'd:safety').status).toBe('confirmed');
    expect(get(d, 'd:safety').history!.map(h => h.action)).toEqual(['confirm', 'reopen', 'reject', 'reopen', 'confirm']);
  });

  it('a parameter nobody decided is unchanged', () => {
    const data = castingData();
    expect(get(reopen(data, 'd:tol', WHO), 'd:tol')).toEqual(get(data, 'd:tol'));
  });
});

describe('supply — a value no source states', () => {
  it('"not leak-tight" is the engineer\'s to state: a typed parameter the adapter can use', () => {
    const after = supply(castingData(), { name: 'quality.pressureTight', value: false }, LATER);
    const p = byName(after, 'quality.pressureTight')[0];
    expect(p).toMatchObject({ source: 'manual', method: 'typed', status: 'corrected', value: false });
    expect(p.history![0]).toMatchObject({ action: 'correct', by: 'chief.engineer', from: undefined, to: { status: 'corrected', value: false } });
    expect(answersFromEngineeringData(after).answers).toEqual({ 'service.pressureTight': 'no' });
  });

  it('a supplied value takes the name off the missing list; withdrawing it puts it back', () => {
    const g = recorded('test-gear-m3-z38.step');
    const data = consolidate({ cad: { geo: g.geometry, filename: g.part }, commodity: 'gear' });
    expect(data.missing.map(m => m.name)).toContain('gear.helixAngle');
    const after = supply(data, { name: 'gear.helixAngle', value: 20 }, WHO);
    expect(after.missing.map(m => m.name)).not.toContain('gear.helixAngle');
    expect(answersFromEngineeringData(after).answers).toEqual({ 'gear.helix': '20' });
    const id = byName(after, 'gear.helixAngle')[0].id;
    const withdrawn = reopen(after, id, WHO);
    expect(get(withdrawn, id).status).toBe('rejected');
    expect(withdrawn.missing.map(m => m.name)).toContain('gear.helixAngle');
    expect(answersFromEngineeringData(withdrawn).answers).toEqual({});
  });
});

describe('a dataset with its overrides is plain data', () => {
  it('survives JSON, and further decisions work on what was stored', () => {
    let d = castingData();
    d = confirm(d, FAMILY, WHO);
    d = correct(d, 'd:tol>tolerance.generalClass', 'tight', LATER);
    d = reject(d, 'd:safety', LATER);
    d = supply(d, { name: 'quality.pressureTight', value: false }, WHO);
    const stored = JSON.parse(JSON.stringify(d)) as ConsolidatedEngineeringData;
    expect(stored).toEqual(d);
    expect(answersFromEngineeringData(stored)).toEqual(answersFromEngineeringData(d));
    const next = confirm(reopen(stored, 'd:safety', LATER), 'd:safety', LATER);
    expect(answersFromEngineeringData(next).answers).toEqual({
      'material.family': 'cast iron', 'service.toleranceClass': 'tight', 'service.pressureTight': 'no', 'service.safetyCritical': 'yes',
    });
  });
});
