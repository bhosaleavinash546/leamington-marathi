/**
 * Layer 3 — the CAD measurement as parameters. A read-only mapping of what the kernel measured: every value is the
 * kernel's own figure, an unmeasured field yields no parameter, and nothing is re-measured.
 */
import { describe, it, expect } from 'vitest';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import { cadToParameters } from '../src/engine/engineering-data/from-cad.js';
import { isKnownParameter, parameterDef } from '../src/engine/engineering-data/dictionary.js';
import { tappedThread, type FeatureRow } from '../src/engine/feature-ops.js';
import { RECORDED, recorded } from './engineering-data-helpers.js';

const one = (ps: ReturnType<typeof cadToParameters>, name: string) => ps.find(p => p.name === name);

describe('every real part maps onto the dictionary', () => {
  it.each(RECORDED.map(b => ({ part: b.part, b })))('$part', ({ b }) => {
    const ps = cadToParameters(b.geometry, b.part);
    expect(ps.length).toBeGreaterThan(3);
    expect(new Set(ps.map(p => p.id)).size, 'ids are unique').toBe(ps.length);
    for (const p of ps) {
      expect(isKnownParameter(p.name), `${p.name} is a dictionary name`).toBe(true);
      const def = parameterDef(p.name)!;
      if (def.unit) expect(p.unit, `${p.name} is held in the dictionary unit`).toBe(def.unit);
      expect(p.sourceFile).toBe(b.part);
      expect(p.status).toBe('extracted');
      // The mapper states only what was measured or declared — never a confirmed value, never a cost.
      expect(['cad', 'derived']).toContain(p.source);
    }
    // The kernel's own figures, unchanged.
    expect(one(ps, 'part.volume')!.value).toBe(b.geometry.volume!.cm3);
    expect(one(ps, 'part.surfaceArea')!.value).toBe(b.geometry.surfaceArea!.cm2);
    const env = one(ps, 'part.envelope')!.value as Record<string, number>;
    expect([env.lengthMm, env.widthMm, env.heightMm].sort((x, y) => x - y))
      .toEqual([b.geometry.boundingBox!.xMm, b.geometry.boundingBox!.yMm, b.geometry.boundingBox!.zMm].sort((x, y) => x - y));
    expect(env.lengthMm).toBeGreaterThanOrEqual(env.widthMm);
    expect(env.widthMm).toBeGreaterThanOrEqual(env.heightMm);
    // No mass: the kernel measures a volume, and `weights` is that volume at six assumed densities.
    expect(one(ps, 'part.mass')).toBeUndefined();
  });
});

describe('the hole table', () => {
  const b = recorded('MACH_Hydraulic_Manifold.stp');
  const ps = cadToParameters(b.geometry, b.part);
  const rows = (b.geometry.featureTable ?? []).map((r, i) => ({ r, i })).filter(x => x.r.kind === 'hole');

  it('one parameter per hole row, with the row\'s diameter, count, depth, through flag and faces', () => {
    const holes = ps.filter(p => p.name === 'hole.diameter');
    expect(holes).toHaveLength(rows.length);
    for (const { r, i } of rows) {
      const p = holes.find(h => h.appliesTo?.featureId === `cad-hole-${i}`)!;
      expect(p.value).toEqual({ diameterMm: r.diaMm, count: r.count, through: r.through, depthMm: r.depthMm });
      expect(p.appliesTo!.faceIds).toEqual(r.faceIds);
      expect(p.method).toBe('kernel');
      expect(p.kind).toBe('extracted');
    }
    expect(one(ps, 'feature.count.holes')!.value).toBe(rows.reduce((s, x) => s + x.r.count, 0));
  });

  it('a tapped hole is INFERRED by the costing\'s own rule, linked to its hole, and said to be inferred', () => {
    const tapped = rows.filter(x => tappedThread(x.r as FeatureRow));
    expect(tapped.length, 'the manifold has M6 tapping holes (4 × Ø5 × 12)').toBeGreaterThan(0);
    const threads = ps.filter(p => p.name === 'thread');
    expect(threads).toHaveLength(tapped.length);
    for (const { r, i } of tapped) {
      const t = threads.find(x => x.appliesTo?.featureId === `cad-hole-${i}`)!;
      expect((t.value as { designation: string }).designation).toBe(tappedThread(r as FeatureRow));
      expect(t.kind).toBe('inferred');
      expect(t.source).toBe('derived');
      expect(t.method).toBe('rule');
      expect(t.derivedFrom).toEqual([`cad:hole.diameter:${i}`]);
      expect(t.note).toMatch(/inferred, not modelled/);
    }
    expect(one(ps, 'feature.count.threads')!.kind).toBe('inferred');
  });
});

describe('what the kernel did not measure yields no parameter', () => {
  it('a failed measurement maps to nothing', () => {
    expect(cadToParameters({ status: 'error', error: 'unreadable' } as OCCTGeometry, 'x.stp')).toEqual([]);
  });
  it('no feature table → no hole count (never 0); no wall → no wall; no gear → no gear rows', () => {
    const ps = cadToParameters({ status: 'success', volume: { mm3: 1000, cm3: 1 } } as OCCTGeometry, 'x.stl');
    expect(ps.map(p => p.name)).toEqual(['part.volume']);
  });
  it('a 2·V/S "thickness" on a solid is not a stock thickness; a bend-measured gauge is', () => {
    expect(one(cadToParameters(recorded('PRCR002.stp').geometry, 'PRCR002.stp'), 'material.stockThickness')).toBeUndefined();
    const seat = recorded('Seat_Locking_Bracket.stp');
    expect(one(cadToParameters(seat.geometry, seat.part), 'material.stockThickness')!.value).toBe(seat.geometry.sheetMetal!.thicknessMm);
  });
});

describe('gear metrology and what the file declares', () => {
  it('teeth, module and face width from the kernel; the helix never', () => {
    const g = recorded('test-gear-m3-z38.step');
    const ps = cadToParameters(g.geometry, g.part);
    expect(one(ps, 'gear.teeth')!.value).toBe(38);
    expect(one(ps, 'gear.module')).toMatchObject({ value: 3, unit: 'mm', kind: 'interpreted' });
    expect(one(ps, 'gear.faceWidth')!.value).toBe(30);
    expect(one(ps, 'gear.helixAngle')).toBeUndefined();
  });
  it('a declared material is a designation from the CAD metadata; the product name is the part name', () => {
    const geo = { ...recorded('Casting_Braket.stp').geometry, cadMetadata: { productNames: ['Casting Bracket', 'Body'], materialDesignations: ['EN-GJS-500-7'] } } as OCCTGeometry;
    const ps = cadToParameters(geo, 'Casting_Braket.stp');
    expect(one(ps, 'material.designation')).toMatchObject({ value: 'EN-GJS-500-7', rawText: 'EN-GJS-500-7', method: 'cad-metadata', source: 'cad', kind: 'extracted' });
    expect(one(ps, 'title.partName')).toMatchObject({ value: 'Casting Bracket', method: 'cad-metadata' });
    expect(one(ps, 'title.partName')!.note).toMatch(/Body/);
  });
  it('none of the recorded real parts declares a material — so none gets a material parameter', () => {
    for (const b of RECORDED) expect(one(cadToParameters(b.geometry, b.part), 'material.designation'), b.part).toBeUndefined();
  });
});
