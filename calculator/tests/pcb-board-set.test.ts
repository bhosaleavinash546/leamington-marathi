/**
 * The PCB board set (EDU v6, Nov 2026): every board file runs through Stage 4 on its stored analysis and is graded against
 * its price paid; a manual should-cost is a reference and never counts; fewer than five prices paid is "insufficient".
 */
import { describe, it, expect } from 'vitest';
import { loadBoards, gradeBoard, summarise } from '../scripts/pcb-board-accuracy.js';

describe('PCB board set', () => {
  const boards = loadBoards();
  it('holds the camera board (one price paid) and the EDU board (a reference, no price paid)', () => {
    const ids = boards.map(b => b.id);
    expect(ids).toEqual(expect.arrayContaining(['camera-360', 'edu-ctrl']));
    for (const { b } of boards) {
      expect(['replies', 'analysis']).toContain(b.analysis.kind);
      if (b.pricePaid) { expect(b.pricePaid.gbp).toBeGreaterThan(0); expect(['delivered-uk', 'ex-works']).toContain(b.pricePaid.basis); expect(b.pricePaid.source.length).toBeGreaterThan(10); }
    }
  });
  it('grades every board on its own basis; a reference never counts as accuracy', async () => {
    const rs = [];
    for (const { id, b } of boards) rs.push(await gradeBoard(id, b));
    const cam = rs.find(r => r.id === 'camera-360')!;
    expect(cam.toolOnBasis).toBe(cam.toolDelivered);
    expect(cam.errorPct).toBeCloseTo((cam.toolDelivered / 17 - 1) * 100, 6);
    const edu = rs.find(r => r.id === 'edu-ctrl')!;
    expect(edu.errorPct).toBeNull();
    expect(edu.referenceGapPct).toBeCloseTo((edu.toolExWorks / 150.56 - 1) * 100, 6);
    const s = summarise(rs);
    expect(s.n).toBe(rs.filter(r => r.pricePaid).length);
    expect(s.verdict).toMatch(/insufficient|UNMEASURED/);
  }, 120_000);
  it('five prices paid make it measured; none is UNMEASURED', () => {
    const r = (e: number) => ({ errorPct: e } as never);
    expect(summarise([r(5), r(-5), r(10), r(-10), r(0)])).toMatchObject({ n: 5, mapePct: 6, biasPct: 0, verdict: 'measured' });
    expect(summarise([]).verdict).toMatch(/UNMEASURED/);
  });
});
