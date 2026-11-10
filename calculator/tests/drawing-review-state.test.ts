/**
 * The engineer's review of a drawing as a list of decisions that is stored, sent and REPLAYED by the server (offline
 * 2D drawing intelligence, integration — Nov 2026).
 *
 *  - a decision list from a client or a saved project is sanitised: nothing that is not a well-formed decision survives;
 *  - replaying it on a fresh consolidation gives exactly what applying each decision by hand gives;
 *  - a decision that no longer applies (the reading is gone, the conflict is not open) is SKIPPED and reported — the
 *    rest still apply, nothing is guessed;
 *  - the same decisions give the same key (cache keys, change detection); any change gives another.
 */
import { describe, it, expect } from 'vitest';
import { consolidate } from '../src/engine/engineering-data/reconcile.js';
import { confirm, correct, reject, resolveConflict, reopen } from '../src/engine/engineering-data/overrides.js';
import { parseReviewState, replayReview, reviewStateKey, applyReviewOp, MAX_REVIEW_OPS, type ReviewOp } from '../src/engine/engineering-data/review-state.js';
import { recorded, dp, drawingOf, byName } from './engineering-data-helpers.js';

const AT = '2026-11-10T09:00:00.000Z';
const who = { by: 'cost.engineer', at: AT };
const gear = recorded('test-gear-m3-z38.step');
const data0 = () => consolidate({
  cad: { geo: gear.geometry, filename: gear.part }, commodity: 'gear',
  drawing: drawingOf([
    dp('gear.teeth', 40, 'NUMBER OF TEETH z 40', { id: 'd:z' }),
    dp('gear.helixAngle', 0, 'HELIX ANGLE 0', { id: 'd:helix', unit: 'deg' }),
    dp('gear.qualityClass', 'ISO 1328 CLASS 7', 'QUALITY ISO 1328 CLASS 7', { id: 'd:q' }),
    dp('material.designation', '20MnCr5', 'MATERIAL 20MnCr5', { id: 'd:mat' }),
  ]),
});

describe('parseReviewState — nothing is taken on trust', () => {
  it('keeps well-formed decisions and drops everything else', () => {
    const s = parseReviewState({ ops: [
      { op: 'confirm', id: 'd:helix', by: 'a', at: AT },
      { op: 'correct', id: 'd:mat', value: '16MnCr5', by: 'a', at: AT, reason: 'typo on the sheet' },
      { op: 'reject', id: 'd:q', by: 'a', at: AT },
      { op: 'resolve', name: 'gear.teeth', choose: 'cad:gear.teeth', by: 'a', at: AT },
      { op: 'resolve', name: 'gear.teeth', value: 38, by: 'a', at: AT },
      { op: 'reopen', id: 'd:q', by: 'a', at: AT },
      { op: 'supply', name: 'quality.pressureTight', value: false, by: 'a', at: AT },
      // dropped: unknown action, no id, no value, no time, a bad time, a name outside the dictionary, an oversized value, a function-like object
      { op: 'delete-everything', id: 'd:q', by: 'a', at: AT },
      { op: 'confirm', by: 'a', at: AT },
      { op: 'correct', id: 'd:mat', by: 'a', at: AT },
      { op: 'confirm', id: 'd:helix', by: 'a' },
      { op: 'confirm', id: 'd:helix', by: 'a', at: 'yesterday' },
      { op: 'supply', name: 'cost.total', value: 1, by: 'a', at: AT },
      { op: 'correct', id: 'd:mat', value: 'x'.repeat(500), by: 'a', at: AT },
      { op: 'correct', id: 'd:mat', value: { nested: { deep: 1 } }, by: 'a', at: AT },
      null, 7, 'confirm',
    ] });
    expect(s.ops.map(o => o.op)).toEqual(['confirm', 'correct', 'reject', 'resolve', 'resolve', 'reopen', 'supply']);
    expect(s.ops[1]).toEqual({ op: 'correct', id: 'd:mat', value: '16MnCr5', by: 'a', at: AT, reason: 'typo on the sheet' });
    expect(s.ops[3]).toEqual({ op: 'resolve', name: 'gear.teeth', choose: 'cad:gear.teeth', by: 'a', at: AT });
    expect(s.ops[4]).toEqual({ op: 'resolve', name: 'gear.teeth', value: 38, by: 'a', at: AT });
  });

  it('reads a JSON string (a multipart field) and returns an empty review for anything else', () => {
    expect(parseReviewState(JSON.stringify({ ops: [{ op: 'confirm', id: 'x', by: 'a', at: AT }] })).ops).toHaveLength(1);
    for (const bad of [undefined, null, '', 'not json', 42, [], { ops: 'no' }, { review: [] }]) expect(parseReviewState(bad)).toEqual({ schemaVersion: 1, ops: [] });
  });

  it('bounds the list', () => {
    const ops = Array.from({ length: MAX_REVIEW_OPS + 50 }, (_, i) => ({ op: 'confirm', id: `p${i}`, by: 'a', at: AT }));
    expect(parseReviewState({ ops }).ops).toHaveLength(MAX_REVIEW_OPS);
  });
});

describe('replayReview — the server applies the decisions to its own consolidation', () => {
  it('replaying equals applying each decision by hand, in order', () => {
    const ops: ReviewOp[] = [
      { op: 'confirm', id: 'd:helix', ...who },
      { op: 'resolve', name: 'gear.teeth', choose: 'cad:gear.teeth', ...who },
      { op: 'correct', id: 'd:mat', value: '16MnCr5', ...who, reason: 'sheet rev C' },
      { op: 'reject', id: 'd:q', ...who },
      { op: 'reopen', id: 'd:q', ...who },
    ];
    let byHand = data0();
    byHand = confirm(byHand, 'd:helix', who);
    byHand = resolveConflict(byHand, { name: 'gear.teeth' }, { parameterId: 'cad:gear.teeth' }, who);
    byHand = correct(byHand, 'd:mat', '16MnCr5', { ...who, reason: 'sheet rev C' });
    byHand = reject(byHand, 'd:q', who);
    byHand = reopen(byHand, 'd:q', who);
    const r = replayReview(data0(), { schemaVersion: 1, ops });
    expect(r.skipped).toEqual([]);
    expect(r.data).toEqual(byHand);
    // the input dataset is untouched (pure)
    const before = data0();
    replayReview(before, { schemaVersion: 1, ops });
    expect(before).toEqual(data0());
  });

  it('a decision that no longer applies is skipped with its reason; the others still apply', () => {
    const r = replayReview(data0(), { schemaVersion: 1, ops: [
      { op: 'confirm', id: 'd:gone', ...who },                      // a reading this consolidation does not hold
      { op: 'confirm', id: 'd:z', ...who },                         // one side of an open conflict: never confirmed by itself
      { op: 'resolve', name: 'gear.module', choose: 'x', ...who },  // no such conflict
      { op: 'confirm', id: 'd:helix', ...who },
    ] });
    expect(r.skipped.map(s => [s.index, s.op.op])).toEqual([[0, 'confirm'], [1, 'confirm'], [2, 'resolve']]);
    expect(r.skipped[0].why).toMatch(/no parameter "d:gone"/);
    expect(r.skipped[1].why).toMatch(/one side of a conflict/);
    expect(r.skipped[2].why).toMatch(/no such open conflict/);
    expect(byName(r.data, 'gear.helixAngle')[0].status).toBe('confirmed');
    // the conflict is still open and nothing was chosen
    expect(r.data.conflicts.find(c => c.name === 'gear.teeth')?.resolution).toBeUndefined();
    expect(byName(r.data, 'gear.teeth').every(p => p.status === 'conflict')).toBe(true);
  });

  it('no decisions: the dataset is the fresh consolidation', () => {
    expect(replayReview(data0(), null).data).toEqual(data0());
    expect(replayReview(data0(), { schemaVersion: 1, ops: [] }).data).toEqual(data0());
  });

  it('applyReviewOp is one step of the same replay (what the screen does on a click)', () => {
    const op: ReviewOp = { op: 'confirm', id: 'd:helix', ...who };
    expect(applyReviewOp(data0(), op)).toEqual(replayReview(data0(), { schemaVersion: 1, ops: [op] }).data);
  });
});

describe('reviewStateKey — change detection and cache keys', () => {
  const a: ReviewOp = { op: 'confirm', id: 'd:helix', ...who };
  const b: ReviewOp = { op: 'reject', id: 'd:q', ...who };
  it('is empty for no decisions, stable for the same decisions, and different for any change', () => {
    expect(reviewStateKey(null)).toBe('');
    expect(reviewStateKey({ schemaVersion: 1, ops: [] })).toBe('');
    const k = reviewStateKey({ schemaVersion: 1, ops: [a, b] });
    expect(reviewStateKey({ schemaVersion: 1, ops: [{ ...who, id: 'd:helix', op: 'confirm' }, b] })).toBe(k);   // key order does not matter
    expect(reviewStateKey({ schemaVersion: 1, ops: [b, a] })).not.toBe(k);                                      // order of decisions does
    expect(reviewStateKey({ schemaVersion: 1, ops: [a] })).not.toBe(k);
    expect(reviewStateKey({ schemaVersion: 1, ops: [a, { ...b, reason: 'wrong sheet' }] })).not.toBe(k);
  });
});
