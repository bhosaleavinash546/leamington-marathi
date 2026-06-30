import { describe, it, expect } from 'vitest';
import { boardSignature, isSameBoard, repeatabilityDrift } from '../server/utils/pcb-board-signature.js';

const board = {
  manufacturer: 'Acme', title: 'Motor Controller', revision: 'C',
  widthMm: 80, heightMm: 60,
  bom: [{ refDes: 'U1' }, { refDes: 'U2' }, { refDes: 'C1' }],
};

describe('boardSignature', () => {
  it('is stable for the same identity regardless of refDes order / case / whitespace', () => {
    const reordered = { ...board, bom: [{ refDes: 'c1' }, { refDes: ' U2 ' }, { refDes: 'U1' }], title: 'Motor  Controller' };
    expect(boardSignature(reordered)).toBe(boardSignature(board));
  });

  it('tolerates small dimension jitter (±2mm) via bucketing', () => {
    expect(boardSignature({ ...board, widthMm: 81, heightMm: 59 })).toBe(boardSignature(board));
  });

  it('changes when a component is added or removed', () => {
    const extra = { ...board, bom: [...board.bom, { refDes: 'R1' }] };
    expect(boardSignature(extra)).not.toBe(boardSignature(board));
  });

  it('changes for a different revision', () => {
    expect(boardSignature({ ...board, revision: 'D' })).not.toBe(boardSignature(board));
  });

  it('isSameBoard reflects signature equality', () => {
    expect(isSameBoard(board, { ...board, widthMm: 80.4 })).toBe(true);
    expect(isSameBoard(board, { ...board, title: 'Other' })).toBe(false);
  });
});

describe('repeatabilityDrift', () => {
  const a = { bom: [{ refDes: 'U1', qty: 1, unitPriceGBP: 5 }, { refDes: 'C1', qty: 4, unitPriceGBP: 0.02 }] };

  it('reports stable when count and cost match', () => {
    const d = repeatabilityDrift(a, a);
    expect(d.stable).toBe(true);
    expect(d.countDrift).toBe(0);
    expect(d.costDrift).toBe(0);
  });

  it('flags a component-count change as non-repeatable', () => {
    const b = { bom: [...a.bom, { refDes: 'R1', qty: 1, unitPriceGBP: 0.01 }] };
    const d = repeatabilityDrift(a, b);
    expect(d.stable).toBe(false);
    expect(d.countDrift).toBeGreaterThan(0.05);
  });

  it('flags a large cost swing as non-repeatable', () => {
    const b = { bom: [{ refDes: 'U1', qty: 1, unitPriceGBP: 9 }, { refDes: 'C1', qty: 4, unitPriceGBP: 0.02 }] };
    const d = repeatabilityDrift(a, b);
    expect(d.stable).toBe(false);
    expect(d.costDrift).toBeGreaterThan(0.05);
  });
});
