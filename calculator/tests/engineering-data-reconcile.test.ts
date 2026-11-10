/**
 * Layer 3 — reconciliation. One dataset from the 3D model, the drawing and the engineer's own entries:
 * duplicates merge, conflicts are flagged with both sides and nothing chosen, missing is listed and never given a
 * value, inferred values are marked inferred, and what the drawing states that nothing consumes is listed.
 */
import { describe, it, expect } from 'vitest';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import { consolidate, NOT_COSTED_REASON, NOT_COSTED_UNREAD, notCostedOnRoute } from '../src/engine/engineering-data/reconcile.js';
import { cadToParameters } from '../src/engine/engineering-data/from-cad.js';
import { DEFAULT_PRECEDENCE, precedenceFor } from '../src/engine/engineering-data/precedence.js';
import { answersFromEngineeringData } from '../src/engine/engineering-data/to-costing.js';
import type { EngineeringParameter } from '../src/engine/engineering-data/model.js';
import { RECORDED, recorded, dp, drawingOf, byName } from './engineering-data-helpers.js';

/** A small measured part: one Ø25 through bore and four Ø8.5 holes, a declared material when asked. */
function block(extra: Partial<OCCTGeometry> = {}): OCCTGeometry {
  return {
    status: 'success', volume: { mm3: 250_000, cm3: 250 }, surfaceArea: { mm2: 40_000, cm2: 400 },
    boundingBox: { xMm: 120, yMm: 80, zMm: 40 },
    featureTable: [
      { kind: 'hole', diaMm: 25, depthMm: 40, through: true, count: 1, faceIds: [7] },
      { kind: 'hole', diaMm: 8.5, depthMm: 20, through: false, count: 4, faceIds: [11, 12, 13, 14] },
    ],
    ...extra,
  } as OCCTGeometry;
}
const cad = (geo: OCCTGeometry = block()) => ({ geo, filename: 'block.stp' });

describe('the CAD measurement alone', () => {
  it.each(RECORDED.map(b => ({ part: b.part, b })))('$part: no conflict, nothing "not costed", and the dataset is the mapper\'s parameters', ({ b }) => {
    const commodity = b.outcome.commodity!;
    const data = consolidate({ cad: { geo: b.geometry, filename: b.part }, commodity });
    expect(data.conflicts).toEqual([]);
    expect(data.notCosted).toEqual([]);
    expect(data.parameters.map(p => p.id)).toEqual(cadToParameters(b.geometry, b.part).map(p => p.id));
    expect(data.sources).toEqual([{ source: 'cad', file: b.part }]);
    // nothing in a CAD-only dataset has been confirmed by anyone
    expect(data.parameters.every(p => p.status === 'extracted')).toBe(true);
  });
});

describe('conflict — CAD Ø25 v drawing Ø24', () => {
  const drawing = drawingOf([dp('hole.diameter', { diameterMm: 24, count: 1 }, 'Ø24 H7')]);
  const data = consolidate({ cad: cad(), drawing, commodity: 'machining' });

  it('is flagged with both sides, and nothing is chosen', () => {
    expect(data.conflicts).toHaveLength(1);
    const c = data.conflicts[0];
    expect(c.name).toBe('hole.diameter');
    expect(c.sides.map(s => s.source).sort()).toEqual(['cad', 'drawing']);
    expect(c.sides.find(s => s.source === 'cad')!.value).toMatchObject({ diameterMm: 25 });
    expect(c.sides.find(s => s.source === 'drawing')!.value).toMatchObject({ diameterMm: 24 });
    expect(c.difference!.abs).toBe(1);
    expect(c.difference!.rel).toBeCloseTo(0.04, 10);
    expect(c.resolution).toBeUndefined();
    expect(c.why).toMatch(/Ø24/);
    expect(c.why).toMatch(/Ø25/);
    expect(c.why).toMatch(/Nothing is applied until the engineer chooses/);
    // both sides are still in the dataset, both in conflict, neither confirmed, neither changed
    const sides = data.parameters.filter(p => c.sides.some(s => s.parameterId === p.id));
    expect(sides).toHaveLength(2);
    expect(sides.map(p => p.status)).toEqual(['conflict', 'conflict']);
    expect(sides.find(p => p.source === 'cad')!.value).toMatchObject({ diameterMm: 25 });
    expect(sides.find(p => p.source === 'drawing')!.value).toMatchObject({ diameterMm: 24 });
  });

  it('the suggestion follows the precedence table — the 3D model for a feature size by default — and is only a suggestion', () => {
    const c = data.conflicts[0];
    expect(c.suggested).toBe(c.sides.find(s => s.source === 'cad')!.parameterId);
    expect(precedenceFor('hole.diameter')!.order[0]).toBe('cad');
    const flipped = consolidate({ cad: cad(), drawing, commodity: 'machining',
      precedence: [{ match: 'hole.diameter', order: ['drawing', 'cad'], why: 'this programme releases on the drawing' }, ...DEFAULT_PRECEDENCE] });
    expect(flipped.conflicts[0].suggested).toBe(flipped.conflicts[0].sides.find(s => s.source === 'drawing')!.parameterId);
    expect(flipped.conflicts[0].why).toMatch(/this programme releases on the drawing/);
    // either way the conflict is open and both sides are untouched
    expect(flipped.parameters.filter(p => p.status === 'conflict')).toHaveLength(2);
  });

  it('a conflict gives the cost engine nothing', () => {
    expect(answersFromEngineeringData(data).answers).toEqual({});
  });

  it('the inputs are not changed', () => {
    expect(drawing.parameters[0].status).toBe('extracted');
    expect(drawing.parameters[0].appliesTo).toBeUndefined();
  });
});

describe('conflicts on whole-part values', () => {
  it('a number outside the tolerance: gauge 1.6 mm measured v 1.5 mm on the drawing', () => {
    const seat = recorded('Seat_Locking_Bracket.stp');
    const data = consolidate({ cad: { geo: seat.geometry, filename: seat.part }, drawing: drawingOf([dp('material.stockThickness', 1.5, 't = 1,5', { unit: 'mm' })]), commodity: 'sheet_metal' });
    const c = data.conflicts.find(x => x.name === 'material.stockThickness')!;
    expect(c.sides.map(s => s.value).sort()).toEqual([1.5, 1.6]);
    expect(c.difference!.abs).toBeCloseTo(0.1, 10);
    expect(byName(data, 'material.stockThickness').map(p => p.status)).toEqual(['conflict', 'conflict']);
  });

  it('the tolerance is per parameter and configurable', () => {
    const seat = recorded('Seat_Locking_Bracket.stp');
    const input = { cad: { geo: seat.geometry, filename: seat.part }, drawing: drawingOf([dp('material.stockThickness', 1.5, 't = 1,5', { unit: 'mm' })]), commodity: 'sheet_metal' };
    expect(consolidate({ ...input, tolerances: { 'material.stockThickness': { rel: 0.1, abs: 0 } } }).conflicts).toEqual([]);
    expect(consolidate({ ...input, tolerances: { 'material.stockThickness': { rel: 0, abs: 0.2 } } }).conflicts).toEqual([]);
    expect(consolidate(input).conflicts).toHaveLength(1);
  });

  it('a text that differs after normalisation: the material the file declares v the material on the drawing', () => {
    const geo = block({ cadMetadata: { productNames: [], materialDesignations: ['EN-GJS-400-15'] } });
    const data = consolidate({ cad: cad(geo), drawing: drawingOf([dp('material.designation', 'EN-GJS-500-7')]), commodity: 'casting' });
    const c = data.conflicts.find(x => x.name === 'material.designation')!;
    expect(c.sides.map(s => s.value).sort()).toEqual(['EN-GJS-400-15', 'EN-GJS-500-7']);
    // material: the drawing is suggested over the CAD file's own declaration
    expect(c.suggested).toBe(c.sides.find(s => s.source === 'drawing')!.parameterId);
    // the two readings resolve to two grades — that difference is flagged too, and no grade is chosen
    const g = data.conflicts.find(x => x.name === 'material.grade')!;
    expect(g.sides.map(s => s.value).sort()).toEqual(['mat-gjs400', 'mat-gjs500']);
    expect(answersFromEngineeringData(data).answers).toEqual({});
    // both readings agree it is cast iron: ONE family parameter, not a conflict
    expect(byName(data, 'material.family')).toHaveLength(1);
  });

  it('two different values on the drawing itself are a conflict too', () => {
    const data = consolidate({ drawing: drawingOf([
      dp('material.designation', '42CrMo4', 'MATERIAL 42CrMo4', { id: 'd:title' }),
      dp('material.designation', 'C45', 'MAT.: C45', { id: 'd:notes' }),
    ]), commodity: 'forging' });
    expect(data.conflicts.find(c => c.name === 'material.designation')!.sides.map(s => s.parameterId).sort()).toEqual(['d:notes', 'd:title']);
    expect(data.conflicts.find(c => c.name === 'material.designation')!.suggested).toBeUndefined();   // same rank: no suggestion
  });

  it('a value the engineer set stands: no conflict is raised against it, and the other reading stays visible', () => {
    const manual: EngineeringParameter = { id: 'manual:material.designation:1', name: 'material.designation', value: '42CrMo4', source: 'manual', method: 'typed', kind: 'extracted', status: 'corrected' };
    const data = consolidate({ drawing: drawingOf([dp('material.designation', 'C45')]), manual: [manual], commodity: 'forging' });
    expect(data.conflicts.filter(c => c.name === 'material.designation')).toEqual([]);
    const read = byName(data, 'material.designation').find(p => p.source === 'drawing')!;
    expect(read.status).toBe('extracted');
    expect(read.note).toMatch(/differs from the value the engineer set/);
  });
});

describe('duplicates — the same value from two sources is one parameter', () => {
  it('the same designation in the CAD file and on the drawing', () => {
    const geo = block({ cadMetadata: { productNames: [], materialDesignations: ['GJS 500-7'] } });
    const data = consolidate({ cad: cad(geo), drawing: drawingOf([dp('material.designation', 'EN-GJS-500-7')]), commodity: 'casting' });
    expect(data.conflicts).toEqual([]);
    const d = byName(data, 'material.designation');
    expect(d).toHaveLength(1);
    expect(d[0].source).toBe('drawing');                       // the drawing leads on material
    expect(d[0].value).toBe('EN-GJS-500-7');
    expect(d[0].alsoFrom).toEqual([expect.objectContaining({ source: 'cad', method: 'cad-metadata', rawText: 'GJS 500-7', sourceFile: 'block.stp' })]);
    expect(d[0].note).toMatch(/also stated by the CAD file's own declaration/);
    // what was interpreted from each is one parameter too, hanging off the reading that was kept
    for (const name of ['material.family', 'material.grade']) {
      const x = byName(data, name);
      expect(x, name).toHaveLength(1);
      expect(x[0].derivedFrom).toEqual([d[0].id]);
    }
  });

  it('a number within 0.5 % or 0.05 mm, after unit conversion', () => {
    const seat = recorded('Seat_Locking_Bracket.stp');
    const data = consolidate({ cad: { geo: seat.geometry, filename: seat.part }, drawing: drawingOf([dp('material.stockThickness', 0.063, '.063 THK', { unit: 'in' })]), commodity: 'sheet_metal' });
    expect(data.conflicts).toEqual([]);
    const t = byName(data, 'material.stockThickness');
    expect(t).toHaveLength(1);
    expect(t[0].source).toBe('cad');                           // measured gauge leads
    expect(t[0].value).toBe(1.6);
    expect(t[0].alsoFrom![0]).toMatchObject({ source: 'drawing', rawText: '.063 THK' });
  });

  it('a hole callout that says no more than the model does: one row, both provenances', () => {
    const data = consolidate({ cad: cad(), drawing: drawingOf([dp('hole.diameter', { diameterMm: 8.5, count: 4 }, '4x Ø8.5')]), commodity: 'machining' });
    expect(data.conflicts).toEqual([]);
    const holes = byName(data, 'hole.diameter');
    expect(holes).toHaveLength(2);                              // the two CAD rows; the callout was folded in
    const row = holes.find(h => (h.value as { diameterMm: number }).diameterMm === 8.5)!;
    expect(row.source).toBe('cad');
    expect(row.alsoFrom).toEqual([expect.objectContaining({ source: 'drawing', rawText: '4x Ø8.5' })]);
    expect(data.notCosted).toEqual([]);
  });

  it('an identical note read twice is one note; two different notes are two notes, never a conflict', () => {
    const data = consolidate({ drawing: drawingOf([
      dp('note.general', 'Deburr all edges', undefined, { id: 'n1' }), dp('note.general', 'DEBURR ALL EDGES', undefined, { id: 'n2' }),
      dp('note.general', 'Part to be free of oil', undefined, { id: 'n3' }),
    ]) });
    expect(data.conflicts).toEqual([]);
    expect(byName(data, 'note.general').map(p => p.id)).toEqual(['n1', 'n3']);
    expect(byName(data, 'note.general')[0].alsoFrom![0].parameterId).toBe('n2');
  });
});

describe('feature matching — drawing callouts against the CAD hole table', () => {
  const manifold = recorded('MACH_Hydraulic_Manifold.stp');   // 4 × Ø5 blind (M6 tapping), 2 × Ø8, 4 × Ø11 through, 3 × Ø18
  const withDrawing = (ps: EngineeringParameter[]) => consolidate({ cad: { geo: manifold.geometry, filename: manifold.part }, drawing: drawingOf(ps), commodity: 'machining' });
  const rowIndex = (dia: number) => manifold.geometry.featureTable!.findIndex(r => r.kind === 'hole' && r.diaMm === dia);

  it('"4x Ø11 H13" matches the group of four Ø11 holes by diameter AND count, and links its faces', () => {
    const data = withDrawing([dp('hole.diameter', { diameterMm: 11, count: 4, fit: 'H13' }, '4x Ø11 H13', { id: 'd:h11' })]);
    const p = data.parameters.find(x => x.id === 'd:h11')!;
    expect(p.appliesTo!.featureId).toBe(`cad-hole-${rowIndex(11)}`);
    expect(p.appliesTo!.faceIds).toEqual(manifold.geometry.featureTable![rowIndex(11)].faceIds);
    expect(p.status).toBe('extracted');
    expect(p.note).toMatch(/matched to the 3D model/);
    expect(data.conflicts).toEqual([]);
    // it carries a fit the model does not: kept as its own row, and listed as not costed
    expect(data.notCosted).toEqual([{ parameterId: 'd:h11', why: NOT_COSTED_REASON }]);
  });

  it('a tapped-hole callout matches at the tapping-drill Ø (M6 → Ø5.0, ISO 261 coarse) and agrees with the inferred thread', () => {
    const data = withDrawing([dp('thread', 'M6', '4x M6 - 6H', { id: 'd:m6' })]);
    const p = data.parameters.find(x => x.id === 'd:m6')!;
    expect(p.appliesTo!.featureId).toBe(`cad-hole-${rowIndex(5)}`);
    expect(p.note).toMatch(/tapping-drill Ø5/);
    expect(p.note).toMatch(/ISO 261 coarse pitch 1 mm/);
    expect(p.status).toBe('extracted');
    // the model's inferred M6 and the drawing's explicit M6 are one row
    expect(byName(data, 'thread')).toHaveLength(1);
    expect(p.alsoFrom![0]).toMatchObject({ parameterId: `cad:thread:${rowIndex(5)}`, source: 'derived', method: 'rule' });
    expect(data.conflicts).toEqual([]);
    expect(data.notCosted).toEqual([{ parameterId: 'd:m6', why: NOT_COSTED_REASON }]);
  });

  it('a thread modelled at its nominal Ø is matched there', () => {
    const geo = block({ featureTable: [{ kind: 'hole', diaMm: 8, depthMm: 16, through: false, count: 2, faceIds: [3, 4] }] } as Partial<OCCTGeometry>);
    const data = consolidate({ cad: cad(geo), drawing: drawingOf([dp('thread', 'M8', '2x M8', { id: 'd:m8' })]), commodity: 'machining' });
    const p = data.parameters.find(x => x.id === 'd:m8')!;
    expect(p.appliesTo!.featureId).toBe('cad-hole-0');
    expect(p.note).toMatch(/at the nominal Ø8/);
  });

  it('a fine thread is matched at nominal − pitch, stated as a judgement', () => {
    const geo = block({ featureTable: [{ kind: 'hole', diaMm: 9, depthMm: 20, through: true, count: 2, faceIds: [3, 4] }] } as Partial<OCCTGeometry>);
    const data = consolidate({ cad: cad(geo), drawing: drawingOf([dp('thread', 'M10x1', '2x M10x1', { id: 'd:m10' })]), commodity: 'machining' });
    const p = data.parameters.find(x => x.id === 'd:m10')!;
    expect(p.appliesTo!.featureId).toBe('cad-hole-0');
    expect(p.note).toMatch(/nominal − the stated pitch 1 mm \(engineering judgement\)/);
  });

  it('a thread the hole size contradicts is a conflict with the inferred thread', () => {
    const data = withDrawing([dp('thread', { designation: 'M6x0.75', count: 4 }, '4x M6x0.75', { id: 'd:m6f' })]);
    // Ø5.25 would be the M6×0.75 drill; the model has Ø5.0 → no hole at that size: the engineer is asked
    const p = data.parameters.find(x => x.id === 'd:m6f')!;
    expect(p.status).toBe('needs-validation');
    expect(p.candidates!.length).toBeGreaterThan(0);
  });

  it('an ambiguous callout needs validation, with the candidate groups named', () => {
    const axle = recorded('PRCR002.stp');                       // three rows of 2 × Ø14 at different depths
    const data = consolidate({ cad: { geo: axle.geometry, filename: axle.part }, drawing: drawingOf([dp('hole.diameter', { diameterMm: 14, count: 2 }, '2x Ø14', { id: 'd:h14' })]), commodity: 'cast_and_machine' });
    const p = data.parameters.find(x => x.id === 'd:h14')!;
    expect(p.status).toBe('needs-validation');
    expect(p.candidates).toHaveLength(3);
    expect(p.candidates!.every(c => c.featureId?.startsWith('cad-hole-'))).toBe(true);
    expect(p.note).toMatch(/fits more than one group of holes/);
    expect(p.appliesTo?.featureId).toBeUndefined();
    // six holes called together is the three rows together: a unique match
    const all = consolidate({ cad: { geo: axle.geometry, filename: axle.part }, drawing: drawingOf([dp('hole.diameter', { diameterMm: 14, count: 6, tolerance: '+0.1/0' }, '6x Ø14 +0.1/0', { id: 'd:h14x6' })]), commodity: 'cast_and_machine' });
    expect(all.parameters.find(x => x.id === 'd:h14x6')!.appliesTo!.featureId!.split('+')).toHaveLength(3);
  });

  it('a callout with no hole near its size needs validation and names the nearest', () => {
    const data = withDrawing([dp('hole.diameter', { diameterMm: 60, count: 1 }, 'Ø60', { id: 'd:h60' })]);
    const p = data.parameters.find(x => x.id === 'd:h60')!;
    expect(p.status).toBe('needs-validation');
    expect(p.note).toMatch(/no hole of Ø60/);
    expect(p.candidates!.length).toBeGreaterThan(0);
    expect(data.conflicts).toEqual([]);
  });

  it('the right size at the wrong count is a conflict on the count', () => {
    const data = withDrawing([dp('hole.diameter', { diameterMm: 11, count: 3 }, '3x Ø11', { id: 'd:h11x3' })]);
    expect(data.conflicts).toHaveLength(1);
    expect(data.conflicts[0].why).toMatch(/3 × Ø11 and the 3D model has 4 × Ø11/);
    expect(data.parameters.find(x => x.id === 'd:h11x3')!.status).toBe('conflict');
  });

  it('a diameter DIMENSION links only on a unique hole; otherwise it is left exactly as read (it may be a shaft)', () => {
    const data = withDrawing([
      dp('dimension', { nominal: 18, kind: 'diameter', upper: 0.018, lower: 0, count: 3 }, '3x Ø18 H7', { id: 'd:dim18' }),
      dp('dimension', { nominal: 75, kind: 'diameter' }, 'Ø75 h6', { id: 'd:dim75' }),
      dp('dimension', { nominal: 120 }, '120 ±0.1', { id: 'd:len' }),
    ]);
    expect(data.parameters.find(x => x.id === 'd:dim18')!.appliesTo!.featureId).toBe(`cad-hole-${rowIndex(18)}`);
    const shaft = data.parameters.find(x => x.id === 'd:dim75')!;
    expect(shaft.status).toBe('extracted');
    expect(shaft.appliesTo).toBeUndefined();
    expect(shaft.note).toBeUndefined();
    expect(data.conflicts).toEqual([]);
    expect(data.notCosted.map(n => n.parameterId).sort()).toEqual(['d:dim18', 'd:dim75', 'd:len']);
  });

  it('with no 3D feature table nothing is matched and nothing is flagged', () => {
    const data = consolidate({ drawing: drawingOf([dp('hole.diameter', { diameterMm: 24, count: 1 }, 'Ø24', { id: 'd:h' }), dp('thread', 'M8', 'M8', { id: 'd:t' })]) });
    expect(data.parameters.map(p => p.status)).toEqual(['extracted', 'extracted']);
    expect(data.conflicts).toEqual([]);
  });
});

describe('missing — listed, never given a value', () => {
  it('a gear with no gear data table: the helix, the quality and the hardening are missing; no parameter is invented', () => {
    const g = recorded('test-gear-m3-z38.step');
    const data = consolidate({ cad: { geo: g.geometry, filename: g.part }, commodity: 'gear' });
    expect(data.missing.map(m => m.name).sort()).toEqual(['gear.helixAngle', 'gear.qualityClass', 'heatTreat.process', 'material.designation']);
    for (const m of data.missing) {
      expect(m.why.length).toBeGreaterThan(20);
      expect(data.parameters.some(p => p.name === m.name), `${m.name} has no parameter`).toBe(false);
    }
    // teeth and module ARE stated (by the model), so they are not missing
    expect(data.missing.map(m => m.name)).not.toContain('gear.teeth');
    // and nothing missing reaches the cost engine as 0, '' or a default
    const a = answersFromEngineeringData(data);
    expect(a.answers).toEqual({});
    expect(a.leanings).toEqual([]);
  });

  it('a casting drawing with no tolerance note: the tolerance is missing; a casting grade counts as one', () => {
    const axle = recorded('PRCR002.stp');
    const none = consolidate({ cad: { geo: axle.geometry, filename: axle.part }, drawing: drawingOf([dp('material.designation', 'EN-GJS-500-7')]), commodity: 'cast_and_machine' });
    expect(none.missing.map(m => m.name)).toEqual(['tolerance.general']);
    const withGrade = consolidate({ cad: { geo: axle.geometry, filename: axle.part }, drawing: drawingOf([dp('material.designation', 'EN-GJS-500-7'), dp('tolerance.castingGrade', 'DCTG 9')]), commodity: 'cast_and_machine' });
    expect(withGrade.missing).toEqual([]);
  });

  it('a reading that could not be interpreted is listed with the reason, and the value is not guessed', () => {
    const data = consolidate({ drawing: drawingOf([dp('material.designation', 'Werkstoff nach Norm 4711'), dp('tolerance.general', 'see company standard')]), commodity: 'casting' });
    expect(data.missing.map(m => m.name).sort()).toEqual(['material.family', 'material.grade', 'part.volume', 'tolerance.generalClass']);
    expect(data.parameters.map(p => p.name).sort()).toEqual(['material.designation', 'tolerance.general']);
  });

  it('without a commodity nothing is expected', () => {
    expect(consolidate({ cad: cad() }).missing).toEqual([]);
  });
});

describe('inferred values are marked inferred', () => {
  it('a thread inferred from a tapping-drill size, and a safety flag inferred from a marking', () => {
    const m = recorded('MACH_Hydraulic_Manifold.stp');
    const data = consolidate({ cad: { geo: m.geometry, filename: m.part }, drawing: drawingOf([dp('note.general', 'SAFETY CRITICAL CHARACTERISTIC <SC>')]), commodity: 'machining' });
    const thread = byName(data, 'thread')[0];
    expect(thread).toMatchObject({ kind: 'inferred', source: 'derived', method: 'rule' });
    const safety = byName(data, 'quality.safetyCritical')[0];
    expect(safety).toMatchObject({ kind: 'inferred', status: 'needs-validation', value: true });
    // an inferred value is a leaning at most — never an answer
    const a = answersFromEngineeringData(data);
    expect(a.answers).toEqual({});
    expect(a.leanings).toEqual([expect.objectContaining({ decisionId: 'service.safetyCritical', value: 'yes', kind: 'inferred', status: 'needs-validation' })]);
  });
});

describe('not costed — what the drawing states and no question takes', () => {
  const stated = [
    dp('dimension', { nominal: 50, upper: 0.02, lower: -0.02 }, '50 ±0.02', { id: 'nc:dim' }),
    dp('gdt.frame', { characteristic: 'position', toleranceMm: 0.1, datums: ['A', 'B'] }, '⌖ Ø0.1 A B', { id: 'nc:gdt' }),
    dp('gdt.datum', 'A', 'A', { id: 'nc:datum' }),
    dp('finish.roughness', { parameter: 'Ra', value: 1.6 }, 'Ra 1.6', { id: 'nc:ra', unit: 'µm' }),
    dp('finish.roughnessGeneral', { parameter: 'Rz', value: 25 }, 'Rz 25', { id: 'nc:rz', unit: 'µm' }),
    dp('weld.symbol', { type: 'fillet', sizeMm: 4 }, 'a4', { id: 'nc:weld' }),
    dp('weld.standard', 'ISO 5817-C', undefined, { id: 'nc:weldstd' }),
    dp('quality.inspection', '100 % CMM on datum features', undefined, { id: 'nc:insp' }),
    dp('quality.ndt', 'MPI to ISO 9934', undefined, { id: 'nc:ndt' }),
    dp('quality.cleanliness', 'VDA 19 CCC = A(B20/C16/D18)', undefined, { id: 'nc:clean' }),
    dp('heatTreat.hardness', { min: 28, max: 32, scale: 'HRC' }, '28-32 HRC', { id: 'nc:hrc' }),
    dp('thread', 'M12', 'M12', { id: 'nc:thread' }),
    dp('tolerance.tightest', { nominal: 25, it: 6 }, 'Ø25 H6', { id: 'nc:tight' }),
  ];

  it('every one is listed with the stated reason — none is dropped', () => {
    const data = consolidate({ drawing: drawingOf(stated), commodity: 'forging' });
    expect(data.notCosted.map(n => n.parameterId).sort()).toEqual(stated.map(p => p.id).sort());
    for (const n of data.notCosted) expect(n.why).toBe(NOT_COSTED_REASON);
    expect(data.parameters.filter(p => p.source === 'drawing')).toHaveLength(stated.length);
  });

  it('a reading another route would take says which route does not', () => {
    const ps = [dp('tolerance.general', 'ISO 8062-3 DCTG 9', undefined, { id: 't' }), dp('finish.coating', 'KTL black', undefined, { id: 'f' }), dp('heatTreat.process', 'Case harden', undefined, { id: 'h' })];
    const machining = consolidate({ drawing: drawingOf(ps), commodity: 'machining' });
    expect(machining.notCosted).toEqual(ps.map(p => ({ parameterId: p.id, why: notCostedOnRoute('machining') })));
    // on a casting the tolerance and the coating are consumed; "case harden" is not one of the casting heat-treat options
    const casting = consolidate({ drawing: drawingOf(ps), commodity: 'casting' });
    expect(casting.notCosted).toEqual([{ parameterId: 'h', why: NOT_COSTED_UNREAD }]);
    expect(casting.missing.find(m => m.name === 'material.condition')!.why).toMatch(/states no aluminium casting temper/);
    // on a gear it IS the hardening question's answer
    expect(consolidate({ drawing: drawingOf(ps), commodity: 'gear' }).notCosted.map(n => n.parameterId)).toEqual(['t', 'f']);
  });

  it('identity and figures the 3D model also measures are not "requirements" — they are not listed', () => {
    const data = consolidate({ cad: cad(), drawing: drawingOf([
      dp('title.partNumber', 'AB12-3456-AA'), dp('title.revision', 'C'), dp('part.volume', 250, '250 cm³', { unit: 'cm3' }), dp('part.mass', 1.96, '1.96 kg', { unit: 'kg' }),
    ]), commodity: 'machining' });
    expect(data.notCosted).toEqual([]);
    expect(byName(data, 'part.volume')).toHaveLength(1);       // merged with the measured volume
  });
});

describe('robustness', () => {
  it('a name that is not in the dictionary is shown, flagged, and never used', () => {
    const data = consolidate({ drawing: drawingOf([dp('made.up.name', 'x', 'x', { id: 'odd' })]), commodity: 'casting' });
    const p = data.parameters.find(x => x.id === 'odd')!;
    expect(p.status).toBe('needs-validation');
    expect(p.note).toMatch(/not a name in the parameter dictionary/);
    expect(answersFromEngineeringData(data).answers).toEqual({});
  });
  it('colliding ids are made unique; several drawings are all taken', () => {
    const a = drawingOf([dp('note.general', 'Note A', undefined, { id: 'same' })], 'sheet1.pdf');
    const b = drawingOf([dp('note.general', 'Note B', undefined, { id: 'same' })], 'sheet2.pdf');
    const data = consolidate({ drawing: [a, b] });
    expect(data.parameters.map(p => p.id)).toEqual(['same', 'same#2']);
    expect(data.parameters.map(p => p.sourceFile)).toEqual(['sheet1.pdf', 'sheet2.pdf']);
    expect(data.sources.map(s => s.file)).toEqual(['sheet1.pdf', 'sheet2.pdf']);
    expect(data.sources[0].readerVersion).toBe('hand-written-test-1');
  });
  it('the result is plain data — it survives JSON', () => {
    const data = consolidate({ cad: cad(), drawing: drawingOf([dp('material.designation', '42CrMo4'), dp('hole.diameter', { diameterMm: 24 }, 'Ø24')]), commodity: 'forging' });
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });
});
