/**
 * Defects found by the independent validation of the offline drawing feature (10 Nov 2026). Each test failed before
 * its fix.
 */
import { describe, it, expect } from 'vitest';
import { extractCoating } from '../server/drawing/extract/coating';
import { coatingRouteOf } from '../src/engine/engineering-data/interpret';
import { stripModelDrawingReads } from '../server/routes/cad';
import { ctxOf } from './drawing-helpers';

const readerRoute = (t: string) => extractCoating(ctxOf([{ text: t, x: 40, y: 500, region: 'other' }]))
  .filter(p => p.name === 'finish.coatingRoute' || p.name === 'finish.coating').map(p => String(p.value));
const engineRoute = (t: string) => { const r = coatingRouteOf(t); return r && 'route' in r ? r.route : null; };

describe('D01 — a word that starts with a coating trade name is not that coating', () => {
  for (const t of ['GEOMETRIC TOLERANCES TO ISO 1101.', 'ALL GEOMETRIC TOLERANCES APPLY IN THE FREE STATE',
    'GEOMETRY PER CAD MODEL', 'DACROMETRY', 'ZINTEKNOLOGY']) {
    it(`"${t}" reads no coating`, () => {
      expect(readerRoute(t)).toEqual([]);
      expect(engineRoute(t)).toBeNull();
    });
  }
  for (const t of ['GEOMET 500 GRADE A', 'COATING: GEOMET', 'DACROMET 320', 'ZINC FLAKE TO ISO 10683']) {
    it(`"${t}" is still zinc flake`, () => {
      expect(engineRoute(t)).toBe('zinc_flake');
      expect(readerRoute(t).join(' ')).toMatch(/flake/i);
    });
  }
  it('"EPS" alone (electric power steering on an automotive drawing) is not a powder coat', () => {
    expect(engineRoute('EPS MOUNTING BRACKET')).toBeNull();
    expect(engineRoute('POWDER COAT RAL 9005')).toBe('powder_coat');
  });
});

describe('F01 / F02 — a model reply carries nothing about a drawing', () => {
  it('drops the finish callout and the gear drawing fields, keeps the measured gear figures', () => {
    const a: Record<string, unknown> = { costInputSuggestions: {
      surfaceTreatment: { callout: 'zinc plate', thicknessUm: 12, maskedFeatureCount: 3 },
      gear: { teeth: 38, normalModuleMm: 3, faceWidthMm: 30, drawingTeeth: 40, helixAngleDeg: 20, qualityClass: 7,
        effectiveCaseDepthMm: 0.8, hardeningRoute: 'case_hardening', materialClass: 'case_hardening_steel' },
      casting: { process: 'hpdc' },
    } };
    const dropped = stripModelDrawingReads(a);
    expect(dropped.sort()).toEqual(['gear.drawingTeeth', 'gear.effectiveCaseDepthMm', 'gear.hardeningRoute', 'gear.helixAngleDeg',
      'gear.materialClass', 'gear.qualityClass', 'surfaceTreatment']);
    expect(a.costInputSuggestions).toEqual({ gear: { teeth: 38, normalModuleMm: 3, faceWidthMm: 30 }, casting: { process: 'hpdc' } });
  });
  it('never attaches a drawing to a model request (no drawing document in the CAD route source)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../server/routes/cad.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/drawingForModel/);
    expect(src).not.toMatch(/media_type: 'application\/pdf'/);
    expect(src).toMatch(/renderViews, null, '\[CAD\]'\)/);
  });
});

describe('F03 — a value worked out from an OCR reading needs checking like the reading', () => {
  it('a grade and family interpreted from an OCR material reading are needs-validation, the same text read exactly is not', async () => {
    const { interpretParameters } = await import('../src/engine/engineering-data/interpret');
    const reading = (method: 'ocr' | 'pdf-text', status: 'needs-validation' | 'extracted') => ({
      id: `drawing:material.designation:1`, name: 'material.designation', value: 'EN-GJS-500-7', rawText: 'EN-GJS-500-7',
      source: 'drawing' as const, method, kind: 'extracted' as const, status, ...(method === 'ocr' ? { reliability: 0.41 } : {}),
    });
    const fromOcr = interpretParameters([reading('ocr', 'needs-validation')], { commodity: 'casting' }).parameters
      .filter(p => p.source === 'derived');
    expect(fromOcr.length).toBeGreaterThan(0);
    for (const p of fromOcr) expect(p.status, p.name).not.toBe('extracted');
    const exact = interpretParameters([reading('pdf-text', 'extracted')], { commodity: 'casting' }).parameters
      .filter(p => p.source === 'derived');
    expect(exact.some(p => p.status === 'extracted')).toBe(true);
  });
});

describe('F09 — EN 1706 cast aluminium designations name the rate-book grade with the same alloy limits', () => {
  it('AlSi7Mg0.3 / EN AC-42100 is LM25 / A356, AlSi7Mg0.6 / EN AC-42200 is A357; EN AC-42000 stays open', async () => {
    const { interpretParameters } = await import('../src/engine/engineering-data/interpret');
    const grade = (t: string) => interpretParameters([{ id: 'd:1', name: 'material.designation', value: t, rawText: t, source: 'drawing',
      method: 'pdf-text', kind: 'extracted', status: 'extracted' }], { commodity: 'casting' }).parameters.find(p => p.name === 'material.grade');
    for (const t of ['AlSi7Mg0.3', 'EN AC-AlSi7Mg0.3 T6', 'EN AC-42100', 'AlSi7Mg0,3']) expect(grade(t), t).toMatchObject({ value: 'mat-lm25', status: 'extracted' });
    for (const t of ['AlSi7Mg0.6', 'EN AC-42200']) expect(grade(t), t).toMatchObject({ value: 'mat-a357', status: 'extracted' });
    expect(grade('EN AC-42000')).toBeUndefined();
    expect(grade('PART 42100-A')).toBeUndefined();   // a bare number is not a designation
  });
});

describe('F10 — on a route with no grade question the drawing grade is listed as not costed', () => {
  it('machining: 42CrMo4 gives the family and is listed; casting: the grade is a question, nothing listed for it', async () => {
    const { consolidate } = await import('../src/engine/engineering-data/index');
    const drawing = { schemaVersion: 1 as const, readerVersion: 't', sourceFile: 'd.pdf', fileKind: 'pdf' as const, sheets: [], text: [], warnings: [],
      parameters: [{ id: 'drawing:material.designation:1', name: 'material.designation', value: '42CrMo4', rawText: '42CrMo4 +QT',
        source: 'drawing' as const, method: 'pdf-text' as const, kind: 'extracted' as const, status: 'extracted' as const }] };
    const mach = consolidate({ drawing, commodity: 'machining' });
    expect(mach.parameters.some(p => p.name === 'material.family' && p.value === 'steel')).toBe(true);
    expect(mach.notCosted).toEqual([expect.objectContaining({ parameterId: 'drawing:material.designation:1', why: expect.stringMatching(/grade it names is not costed/) })]);
    const forge = consolidate({ drawing, commodity: 'forging' });
    expect(forge.notCosted.filter(n => n.parameterId === 'drawing:material.designation:1')).toEqual([]);
  });
});

describe('D08 (validation) — a "PP-" / "PC-" part-number prefix is not polypropylene / polycarbonate', () => {
  it('reads the prefix as a part number, keeps real polymer names', async () => {
    const { familyFromFilename } = await import('../src/engine/material-family');
    expect(familyFromFilename('PP-MP0108-bed-plate.step')).toBeNull();
    expect(familyFromFilename('PP-MP0110_electronics_chassis.STEP')).toBeNull();
    expect(familyFromFilename('PC_A12_bracket_6061.step')).toBe('aluminium');
    expect(familyFromFilename('PP-GF30_cover.step')).toBe('plastic');
    expect(familyFromFilename('housing_PP_T20.step')).toBe('plastic');
    expect(familyFromFilename('PP_cover.stp')).toBe('plastic');
    expect(familyFromFilename('clip-PC.stp')).toBe('plastic');
  });
});

describe('D04 (validation) — correcting a designation withdraws the reader\'s own family read from the old text', () => {
  it('"30W9" (an OCR misread) corrected to "5052": the reader\'s "steel" is superseded, nothing stale is offered', async () => {
    const { consolidate, correct, answersFromEngineeringData } = await import('../src/engine/engineering-data/index');
    const loc = { sheet: 1, bbox: [500, 700, 560, 712] as [number, number, number, number], region: 'title-block' as const };
    const base = { source: 'drawing' as const, sourceFile: 'cover.pdf', location: loc, method: 'ocr' as const };
    const drawing = { schemaVersion: 1 as const, readerVersion: 't', sourceFile: 'cover.pdf', fileKind: 'pdf' as const, sheets: [], text: [], warnings: [],
      parameters: [
        { ...base, id: 'drawing:material.designation:1', name: 'material.designation', value: '30W9', rawText: '30W9', kind: 'extracted' as const, status: 'needs-validation' as const },
        { ...base, id: 'drawing:material.family:1', name: 'material.family', value: 'steel', rawText: '30W9', kind: 'interpreted' as const, status: 'needs-validation' as const },
      ] };
    const data = consolidate({ drawing, commodity: 'machining' });
    expect(answersFromEngineeringData(data).leanings.some(l => l.decisionId === 'material.family' && l.value === 'steel')).toBe(true);
    const after = correct(data, 'drawing:material.designation:1', '5052', { by: 'qa', at: '2026-11-10T00:00:00Z' });
    const live = after.parameters.filter(p => p.name === 'material.family' && p.status !== 'rejected');
    expect(live.map(p => p.value)).not.toContain('steel');
    const old = after.parameters.find(p => p.id === 'drawing:material.family:1')!;
    expect(old).toMatchObject({ status: 'rejected' });
    expect(old.note).toMatch(/superseded/);
    expect(answersFromEngineeringData(after).leanings.filter(l => l.decisionId === 'material.family').map(l => l.value)).not.toContain('steel');
  });
});

describe('validation — a material reading names its family by its standard\'s numbering', () => {
  it('AA / EN / GB / JIS designations give the family; a bare 4-digit number needs checking; never a grade by itself', async () => {
    const { interpretParameters } = await import('../src/engine/engineering-data/interpret');
    const fam = (t: string) => interpretParameters([{ id: 'd:1', name: 'material.designation', value: t, rawText: t, source: 'drawing',
      method: 'pdf-text', kind: 'extracted', status: 'extracted' }], { commodity: 'machining' }).parameters.find(p => p.name === 'material.family');
    for (const t of ['5052-H32', 'AL 5052-H32', '6063-T5', 'EN AW 5754 H22', '6061铝']) expect(fam(t), t).toMatchObject({ value: 'aluminium', status: 'extracted' });
    for (const t of ['S235JR', 'S355J2+N', 'DC04', 'Q235', 'Q345B', '45#', '45钢', '40Cr', 'SS400', 'S45C', 'SPCC']) expect(fam(t)?.value, t).toBe('steel');
    expect(fam('5052')).toMatchObject({ value: 'aluminium', status: 'needs-validation' });
    expect(fam('ACME-SPEC-12')).toBeUndefined();
    expect(fam('9999')).toBeUndefined();
  });
});

describe('D11 (validation) — split hole callouts are summed before they are compared with the model', () => {
  const cadHole = (id: string, dia: number, count: number) => ({ id, name: 'hole.diameter', value: { diameter: dia, count }, unit: 'mm',
    source: 'cad' as const, method: 'kernel' as const, kind: 'extracted' as const, status: 'extracted' as const, appliesTo: { featureId: id } });
  const callout = (n: number, dia: number, count?: number) => ({ id: `drawing:hole.diameter:${n}`, name: 'hole.diameter',
    value: { diameter: dia, ...(count ? { count } : {}) }, unit: 'mm', rawText: `${count ? `${count}X ` : ''}Ø${dia}`,
    source: 'drawing' as const, method: 'pdf-text' as const, kind: 'extracted' as const, status: 'extracted' as const });
  const cadTable = { id: 'cad:feature.count.holes', name: 'feature.count.holes', value: 2, source: 'cad' as const, method: 'kernel' as const, kind: 'extracted' as const, status: 'extracted' as const };
  const run = async (calls: ReturnType<typeof callout>[]) => {
    const { consolidate } = await import('../src/engine/engineering-data/index');
    return consolidate({ cad: [cadHole('f1', 6.35, 8), cadHole('f2', 15.0876, 4), cadTable],
      drawing: { schemaVersion: 1, readerVersion: 't', sourceFile: 'd.pdf', fileKind: 'pdf', sheets: [], text: [], warnings: [], parameters: calls } });
  };
  it('1 + 2X + 4X + 1 = the model\'s 8: no conflict', async () => {
    const d = await run([callout(1, 6.35), callout(2, 6.35, 2), callout(3, 6.35, 4), callout(4, 6.35)]);
    expect(d.conflicts).toEqual([]);
  });
  it('callouts that sum to MORE than the model are a conflict, stated as the sum, with a rounded diameter', async () => {
    const d = await run([callout(1, 15.0876, 4), callout(2, 15.0876, 2)]);
    // the 4X callout matches the model's 4 exactly; the extra 2X is the conflict, stated as the sum
    expect(d.conflicts).toHaveLength(1);
    expect(d.conflicts[0].why).toMatch(/calls 6 \(over 2 callouts\) × Ø15\.0876 and the 3D model has 4/);
  });
  it('callouts that sum to fewer than the model need checking, not a conflict', async () => {
    const d = await run([callout(1, 6.35, 2), callout(2, 6.35, 4)]);
    expect(d.conflicts).toEqual([]);
    expect(d.parameters.find(p => p.id === 'drawing:hole.diameter:1')!.status).toBe('needs-validation');
  });
});

describe('D05 (validation) — the reports say who decided, when and why', () => {
  it('a corrected reading carries "Corrected by … on … (was …) — reason"; a confirmed one "Confirmed by …"', async () => {
    const { decisionText } = await import('../src/export/drawing-spec-report');
    expect(decisionText([
      { by: 'reader@x', at: '2026-11-10T09:00:00Z', from: {}, to: {}, action: 'confirm' },
      { by: 'qa@jlr', at: '2026-11-10T14:05:00Z', from: '30W9', to: '5052', action: 'correct', reason: 'OCR misread of the title block' },
    ])).toBe('Corrected by qa@jlr on 10 Nov 2026 14:05 UTC (was "30W9") — OCR misread of the title block');
    expect(decisionText([{ by: 'qa@jlr', at: '2026-11-10T14:05:00Z', from: {}, to: {}, action: 'confirm' }])).toBe('Confirmed by qa@jlr on 10 Nov 2026 14:05 UTC');
    expect(decisionText(undefined)).toBe('');
  });
});

describe('validation — US spelling, stainless abbreviations and GB material words name the family', () => {
  it('Aluminum, SST, CRES, 303, Q235, 钢 / 铝 / 黄铜 / 铸铁', async () => {
    const { familyFromFilename } = await import('../src/engine/material-family');
    expect(familyFromFilename('5052 H-32 Aluminum')).toBe('aluminium');
    expect(familyFromFilename('bracket_aluminum.step')).toBe('aluminium');
    for (const t of ['303 SST', 'CRES 304', 'Q235B', '45钢']) expect(familyFromFilename(t), t).toBe('steel');
    expect(familyFromFilename('6061铝')).toBe('aluminium');
    expect(familyFromFilename('H62黄铜')).toBe('copper alloy');
    expect(familyFromFilename('HT250铸铁')).toBe('cast iron');
  });
});
