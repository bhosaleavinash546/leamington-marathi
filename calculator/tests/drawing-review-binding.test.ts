/**
 * A review is bound to the drawing and the readings it was taken on (offline drawing review, Nov 2026 — review F04 / D02,
 * F05, D16).
 *
 *  - F04 / D02: reading ids are positional (`drawing:<name>:<n>`). A decision carries the drawing's hash and the value it
 *    was taken on (`seen`); replayed onto another drawing, or onto a reading that now holds another value, it is SKIPPED
 *    with the reason — never applied to whatever reading holds that id now (the bracket was costed as steel from the
 *    gear drawing's 20MnCr5). A decision that names no drawing replays only where the review states the hash.
 *  - F05: who decided and when are stamped by the server (`parseReviewState(raw, stamp)` / `reviewFromRequest`).
 *  - D16: the key holds the decisions only — the same decisions at another time, by another name, give the same key.
 *  - The screen binds what it sends (`bindOp`): the drawing's hash and the value of the reading at that moment.
 */
import { describe, it, expect } from 'vitest';
import { consolidate } from '../src/engine/engineering-data/reconcile.js';
import {
  parseReviewState, replayReview, reviewStateKey, seenKey, type ReviewOp, type DrawingReviewState,
} from '../src/engine/engineering-data/review-state.js';
import type { ConsolidatedEngineeringData } from '../src/engine/engineering-data/model.js';
import { recorded, dp, drawingOf } from './engineering-data-helpers.js';

const BRACKET = 'b'.repeat(64), GEAR = 'a'.repeat(64);
const AT = '2026-11-10T09:00:00.000Z', LATER = '2026-11-10T09:05:00.000Z';
const who = { by: 'cost.engineer', at: AT };
const part = recorded('test-gear-m3-z38.step');

/** Two drawings whose first material reading has the SAME positional id and different values. */
const fromDrawing = (designation: string): ConsolidatedEngineeringData => consolidate({
  cad: { geo: part.geometry, filename: part.part }, commodity: 'machining',
  drawing: drawingOf([
    dp('material.designation', designation, `MATERIAL ${designation}`, { id: 'drawing:material.designation:1' }),
    dp('title.partNumber', 'P-1', 'PART P-1', { id: 'drawing:title.partNumber:1' }),
  ]),
});
const bracket = () => fromDrawing('EN AC-42100');
const gearDrawing = () => fromDrawing('20MnCr5');
const statusOf = (d: ConsolidatedEngineeringData, id: string) => d.parameters.find(p => p.id === id)?.status;
const MAT = 'drawing:material.designation:1';

describe('F04 / D02 — a decision applies only to the drawing and the value it was taken on', () => {
  const onBracket: ReviewOp = { op: 'confirm', id: MAT, drawingHash: BRACKET, seen: seenKey('EN AC-42100'), ...who };

  it('on the drawing it was taken on, the decision applies', () => {
    const r = replayReview(bracket(), { schemaVersion: 1, ops: [onBracket] }, { drawingHash: BRACKET });
    expect(r.skipped).toEqual([]);
    expect(statusOf(r.data, MAT)).toBe('confirmed');
  });

  it('replayed onto ANOTHER drawing (same positional id, another value), it is skipped and says why', () => {
    const r = replayReview(gearDrawing(), { schemaVersion: 1, ops: [onBracket] }, { drawingHash: GEAR });
    expect(statusOf(r.data, MAT)).not.toBe('confirmed');
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].why).toMatch(/taken on another drawing \(bbbbbbbb\), not this one \(aaaaaaaa\)/);
  });

  it('a decision whose reading now holds another value is skipped, even with the right hash (a re-read by a newer reader)', () => {
    const r = replayReview(gearDrawing(), { schemaVersion: 1, ops: [{ ...onBracket, drawingHash: GEAR }] }, { drawingHash: GEAR });
    expect(statusOf(r.data, MAT)).not.toBe('confirmed');
    expect(r.skipped[0].why).toMatch(/now holds "20MnCr5"; the decision was taken when it held "EN AC-42100"/);
  });

  it('correct, reject, reopen and the chosen side of a resolve are checked the same way', () => {
    const seenWrong = seenKey('something else');
    for (const op of [
      { op: 'correct', id: MAT, value: 'EN AC-43000', drawingHash: BRACKET, seen: seenWrong, ...who },
      { op: 'reject', id: MAT, drawingHash: BRACKET, seen: seenWrong, ...who },
      { op: 'reopen', id: MAT, drawingHash: BRACKET, seen: seenWrong, ...who },
    ] as ReviewOp[]) {
      const r = replayReview(bracket(), { schemaVersion: 1, ops: [op] }, { drawingHash: BRACKET });
      expect(r.skipped.map(s => s.why)).toEqual([expect.stringMatching(/now holds "EN AC-42100"/)]);
    }
  });

  it('an old decision (no hash, no value) is skipped when nothing states its drawing — and replays when the review states it', () => {
    const old: ReviewOp = { op: 'confirm', id: MAT, ...who };
    const none = replayReview(bracket(), { schemaVersion: 1, ops: [old] }, { drawingHash: BRACKET });
    expect(none.skipped[0].why).toMatch(/does not say which drawing it was taken on/);
    expect(statusOf(none.data, MAT)).not.toBe('confirmed');
    const stated: DrawingReviewState = { schemaVersion: 1, drawingHash: BRACKET, ops: [old] };
    expect(statusOf(replayReview(bracket(), stated, { drawingHash: BRACKET }).data, MAT)).toBe('confirmed');
    // the review states another drawing: skipped
    expect(replayReview(gearDrawing(), stated, { drawingHash: GEAR }).skipped).toHaveLength(1);
  });

  it('a review parsed from a request keeps the hashes and the seen values (nothing else is taken on trust)', () => {
    const s = parseReviewState({ drawingHash: BRACKET, ops: [
      { op: 'confirm', id: MAT, drawingHash: GEAR, seen: '"x"', by: 'a', at: AT },
      { op: 'confirm', id: MAT, drawingHash: 'not-a-hash', by: 'a', at: AT },
    ] });
    expect(s.drawingHash).toBe(BRACKET);
    expect(s.ops[0]).toMatchObject({ drawingHash: GEAR, seen: '"x"' });
    expect(s.ops[1].drawingHash).toBeUndefined();
  });

  it('seenKey: the same value gives the same text whatever its key order; a long value is a fingerprint', () => {
    expect(seenKey({ a: 1, b: [2, 3] })).toBe(seenKey({ b: [2, 3], a: 1 }));
    expect(seenKey('A356-T6')).toBe('"A356-T6"');
    const long = 'x'.repeat(1000);
    expect(seenKey(long)).toMatch(/^#[0-9a-f]{16}$/);
    expect(seenKey(long)).not.toBe(seenKey(`${long}y`));
  });
});

describe('F05 — who decided and when are the server\'s, not the client\'s', () => {
  it('a stamp replaces the by and at the client sent; ops with no time are kept when stamped', () => {
    const s = parseReviewState({ ops: [
      { op: 'confirm', id: MAT, by: 'Somebody Else', at: '1999-01-01T00:00:00.000Z' },
      { op: 'reject', id: 'x' },
    ] }, { by: 'alice@test', at: LATER });
    expect(s.ops.map(o => [o.by, o.at])).toEqual([['alice@test', LATER], ['alice@test', LATER]]);
  });

  it('the stamped name is what the history records', () => {
    const s = parseReviewState({ ops: [{ op: 'confirm', id: MAT, drawingHash: BRACKET, by: 'forged', at: AT }] }, { by: 'alice@test', at: LATER });
    const r = replayReview(bracket(), s, { drawingHash: BRACKET });
    const h = r.data.parameters.find(p => p.id === MAT)!.history!;
    expect(h[h.length - 1]).toMatchObject({ by: 'alice@test', at: LATER, action: 'confirm' });
  });
});

describe('D16 — the key is the decisions, not who took them or when', () => {
  it('the same decisions at another time, under another name: the same key', () => {
    const a: ReviewOp = { op: 'confirm', id: MAT, drawingHash: BRACKET, seen: '"EN AC-42100"', by: 'a', at: AT };
    const k = reviewStateKey({ schemaVersion: 1, ops: [a] });
    expect(reviewStateKey({ schemaVersion: 1, ops: [{ ...a, by: 'b', at: LATER }] })).toBe(k);
    // what the server stamps (F05) never moves the key: two requests with the same decisions
    const raw = { ops: [{ op: 'confirm', id: MAT, drawingHash: BRACKET, seen: '"EN AC-42100"' }] };
    expect(reviewStateKey(parseReviewState(raw, { by: 'alice@test', at: AT }))).toBe(reviewStateKey(parseReviewState(raw, { by: 'alice@test', at: LATER })));
  });

  it('any change to what is decided gives another key', () => {
    const a: ReviewOp = { op: 'confirm', id: MAT, drawingHash: BRACKET, seen: '"EN AC-42100"', by: 'a', at: AT };
    const k = reviewStateKey({ schemaVersion: 1, ops: [a] });
    expect(reviewStateKey({ schemaVersion: 1, ops: [{ ...a, drawingHash: GEAR }] })).not.toBe(k);
    expect(reviewStateKey({ schemaVersion: 1, ops: [{ ...a, seen: '"x"' }] })).not.toBe(k);
    expect(reviewStateKey({ schemaVersion: 1, ops: [{ ...a, op: 'reject' }] })).not.toBe(k);
    expect(reviewStateKey({ schemaVersion: 1, ops: [{ ...a, id: 'drawing:title.partNumber:1' }] })).not.toBe(k);
    expect(reviewStateKey({ schemaVersion: 1, ops: [{ op: 'correct', id: MAT, value: 'X', ...who }] }))
      .not.toBe(reviewStateKey({ schemaVersion: 1, ops: [{ op: 'correct', id: MAT, value: 'Y', ...who }] }));
    // the hash stated once for the review is the same decision as the hash on each op
    const { drawingHash: _h, ...bare } = a;
    expect(reviewStateKey({ schemaVersion: 1, drawingHash: BRACKET, ops: [bare as ReviewOp] })).toBe(k);
  });
});

describe('the screen sends bound decisions', () => {
  it('bindOp writes the drawing hash and the value the reading holds now', async () => {
    const { bindOp } = await import('../src/ui/drawing-review-ui.js');
    const op = bindOp(bracket(), { op: 'confirm', id: MAT, ...who }, BRACKET);
    expect(op).toMatchObject({ drawingHash: BRACKET, seen: seenKey('EN AC-42100') });
    // and the server, replaying it, applies it to that drawing and refuses it on the other
    expect(replayReview(bracket(), { schemaVersion: 1, ops: [op] }, { drawingHash: BRACKET }).skipped).toEqual([]);
    expect(replayReview(gearDrawing(), { schemaVersion: 1, ops: [op] }, { drawingHash: GEAR }).skipped).toHaveLength(1);
    // a resolve binds the side it chose
    const res = bindOp(bracket(), { op: 'resolve', name: 'material.designation', choose: MAT, ...who }, BRACKET);
    expect(res).toMatchObject({ seen: seenKey('EN AC-42100') });
  });
});
