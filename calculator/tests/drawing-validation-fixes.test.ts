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
