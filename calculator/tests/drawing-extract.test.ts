/**
 * The offline drawing reader's extractors, each on targeted text (Layer 2, server/drawing/extract).
 * Every expected value here was worked out by hand from the standard named beside it — not copied from the code.
 */
import { describe, it, expect } from 'vitest';
import { findDesignations, conditionOf, extractMaterial } from '../server/drawing/extract/material';
import { findGeneralTolerances, findBlockTolerances, extractGeneralTolerance } from '../server/drawing/extract/general-tolerance';
import { findRoughness, extractRoughness, N_GRADE_RA } from '../server/drawing/extract/roughness';
import { findThickness, extractCoating } from '../server/drawing/extract/coating';
import { findHardness, findCaseDepth, extractHeatTreatment } from '../server/drawing/extract/heat-treatment';
import { findThreads, extractThreads } from '../server/drawing/extract/threads';
import { parseDimension, extractDimensions, drawingUnit } from '../server/drawing/extract/dimensions';
import { readFrame, extractGdt } from '../server/drawing/extract/gdt';
import { extractWelds } from '../server/drawing/extract/welds';
import { extractQuality } from '../server/drawing/extract/quality';
import { extractGear } from '../server/drawing/extract/gear';
import { extractNotes } from '../server/drawing/extract/notes';
import { extractTitleBlock } from '../server/drawing/extract/title-block';
import { fitLimits } from '../server/drawing/data/iso286';
import { labelKey, labelPrefix, cellAt } from '../server/drawing/layout';
import { assembleLines } from '../server/drawing/text-lines';
import { GDT_FONT_MAP, GDT_FONT_NAME } from '../server/drawing/symbol-fonts';
import { normText } from '../server/drawing/extract/common';
import { isKnownParameter } from '../src/engine/engineering-data/dictionary';
import type { RawTextItem } from '../server/drawing/types';
import { ctxOf, box } from './drawing-helpers';

const des = (t: string, weak = false) => findDesignations(t, weak).map(h => `${h.designation}|${h.family}`);

describe('material designations — by grammar, not by a grade list', () => {
  it('cast irons (EN 1560, DIN, ASTM A536)', () => {
    expect(des('EN-GJS-500-7')).toEqual(['EN-GJS-500-7|ductile iron']);
    expect(des('EN-GJS-400-18-LT')).toEqual(['EN-GJS-400-18-LT|ductile iron']);
    expect(des('EN-GJL-250')).toEqual(['EN-GJL-250|grey iron']);
    expect(des('EN-GJV-450')).toEqual(['EN-GJV-450|compacted graphite iron']);
    expect(des('GGG-40')).toEqual(['GGG-40|ductile iron']);
    expect(des('ASTM A536 65-45-12')[0]).toBe('ASTM A536 65-45-12|ductile iron');
  });
  it('steels (EN 10027, VDA 239-100, SAE, JIS, BS 970)', () => {
    expect(des('42CrMo4+QT')).toEqual(['42CrMo4+QT|steel']);
    expect(des('16MnCr5')).toEqual(['16MnCr5|steel']);
    expect(des('18CrNiMo7-6')).toEqual(['18CrNiMo7-6|steel']);
    expect(des('X5CrNi18-10')).toEqual(['X5CrNi18-10|steel']);
    expect(des('S355J2+N')).toEqual(['S355J2+N|steel']);
    expect(des('DC04+ZE25/25 EN 10152')).toEqual(['DC04+ZE25/25|steel']);
    expect(des('HC340LA')).toEqual(['HC340LA|steel']);
    expect(des('CR330Y590T-DP')).toEqual(['CR330Y590T-DP|steel']);
    expect(des('SAE 4140')).toEqual(['SAE 4140|steel']);
    expect(des('SCM440')).toEqual(['SCM440|steel']);
    expect(des('817M40')).toEqual(['817M40|steel']);
  });
  it('aluminium wrought and cast, with temper', () => {
    expect(des('EN AW-6082-T6')).toEqual(['EN AW-6082-T6|aluminium (wrought)']);
    expect(des('EN AW-6063 T66')).toEqual(['EN AW-6063 T66|aluminium (wrought)']);
    expect(des('6061-T6')).toEqual(['6061-T6|aluminium (wrought)']);
    expect(des('EN AC-46000')).toEqual(['EN AC-46000|aluminium (cast)']);
    expect(des('AlSi9Cu3(Fe)')).toEqual(['AlSi9Cu3(Fe)|aluminium (cast)']);
    expect(des('A356-T6')).toEqual(['A356-T6|aluminium (cast)']);
    expect(des('LM25-TF')).toEqual(['LM25-TF|aluminium (cast)']);
    expect(conditionOf('EN AW-6082-T6')).toBe('T6');
    expect(conditionOf('42CrMo4+QT')).toBe('+QT');
    expect(conditionOf('EN-GJS-500-7')).toBeUndefined();
  });
  it('magnesium, zinc, copper, titanium', () => {
    expect(des('AZ91D')).toEqual(['AZ91D|magnesium']);
    expect(des('ZAMAK 5')).toEqual(['ZAMAK 5|zinc']);
    expect(des('CuZn39Pb3')).toEqual(['CuZn39Pb3|copper alloy']);
    expect(des('CW614N')).toEqual(['CW614N|copper alloy']);
    expect(des('Ti-6Al-4V')).toEqual(['Ti-6Al-4V|titanium']);
  });
  it('plastics (ISO 1043) with fillers, and the ISO 11469 marking', () => {
    expect(des('PA66-GF30')).toEqual(['PA66-GF30|thermoplastic']);
    expect(des('PP-T20')).toEqual(['PP-T20|thermoplastic']);
    expect(des('PA6 GF30')).toEqual(['PA6 GF30|thermoplastic']);
    expect(des('>PA66-GF30<')).toEqual(['>PA66-GF30<|thermoplastic']);
    expect(des('POM')).toEqual([]);                              // a bare polymer proves nothing outside a material cell
    expect(des('POM', true)).toEqual(['POM|thermoplastic']);
  });
  it('elastomers (ISO 1629) with hardness', () => {
    expect(des('EPDM 70 Shore A')).toEqual(['EPDM 70 Shore A|elastomer']);
    expect(des('NBR 70±5 ShA')[0]).toMatch(/^NBR 70±5 ShA\|elastomer$/);
    expect(des('CR')).toEqual([]);
  });
  it('weak forms need a material context: "C45", "S355" and a material number are not read out of a note', () => {
    expect(des('SEE DETAIL C45 AND VIEW S355')).toEqual([]);
    expect(des('C45E', true)).toEqual(['C45E|steel']);
    expect(des('1.4301')).toEqual([]);
    expect(des('W.-Nr. 1.4301')).toEqual(['W.-Nr. 1.4301|steel']);
  });
  it('the material comes from the title-block cell; a spec code is read and never interpreted', () => {
    const b = box(600, 700, 900, 730);
    const ctx = ctxOf([
      { text: 'MATERIAL', x: 603, y: 708, size: 5 }, { text: 'EN-GJS-500-7 EN 1563', x: 604, y: 724 },
      { text: 'SCALE', x: 603, y: 738, size: 5 }, { text: '1:2', x: 604, y: 754 }, { text: 'DRAWN', x: 753, y: 738, size: 5 }, { text: 'A. N. OTHER', x: 754, y: 754 },
      { text: 'NOTES', x: 40, y: 400 }, { text: '1. MATERIAL TO STJLR.50.5021.', x: 40, y: 420 }, { text: '2. ALTERNATIVE EN-GJS-600-3 BY AGREEMENT.', x: 40, y: 438 },
    ], { h: [...b.h, { x0: 600, y0: 760, x1: 900, y1: 760 }], v: [...b.v, { x0: 600, y0: 730, x1: 600, y1: 760 }, { x0: 750, y0: 730, x1: 750, y1: 760 }, { x0: 900, y0: 730, x1: 900, y1: 760 }], layout: true });
    const out = extractMaterial(ctx);
    const get = (n: string) => out.filter(p => p.name === n);
    expect(get('material.designation')[0].value).toBe('EN-GJS-500-7');
    expect(get('material.designation')[0].location?.region).toBe('title-block');
    expect(get('material.designation')[0].note).toContain('EN-GJS-600-3');
    expect(get('material.standard')[0].value).toBe('EN 1563');
    expect(get('material.family')[0]).toMatchObject({ value: 'ductile iron', kind: 'interpreted' });
    expect(get('material.specCode')[0].value).toBe('STJLR.50.5021');
    expect(get('material.specCode')[0].note).toContain('never');
  });
  it('a material cell that matches no grammar is reported as written, for validation', () => {
    const ctx = ctxOf([{ text: 'MATERIAL', x: 603, y: 708, size: 5 }, { text: 'SUPERALLOY X', x: 604, y: 724 }, { text: 'SCALE', x: 603, y: 740, size: 5 }, { text: 'DATE', x: 660, y: 740, size: 5 }], { layout: true });
    const d = extractMaterial(ctx).find(p => p.name === 'material.designation');
    expect(d).toMatchObject({ value: 'SUPERALLOY X', status: 'needs-validation' });
  });
});

describe('general tolerances', () => {
  it('ISO 2768 class letters', () => {
    expect(findGeneralTolerances('ISO 2768-mK')[0]).toMatchObject({ linearClass: 'medium', geometricClass: 'K' });
    expect(findGeneralTolerances('DIN ISO 2768-1 f')[0]).toMatchObject({ linearClass: 'fine' });
    expect(findGeneralTolerances('ISO 2768 - cL')[0]).toMatchObject({ linearClass: 'coarse', geometricClass: 'L' });
    expect(findGeneralTolerances('ISO 2768-vL')[0].linearClass).toBe('very coarse');
  });
  it('casting, plastics, rubber, welded, extrusion standards', () => {
    expect(findGeneralTolerances('ISO 8062-3 DCTG 9 - GCTG 5')[0]).toMatchObject({ standard: 'ISO 8062', castingGrade: 'DCTG 9' });
    expect(findGeneralTolerances('DIN 16742 TG6')[0].written).toBe('DIN 16742 TG6');
    expect(findGeneralTolerances('ISO 3302-1 M2')[0].standard).toBe('ISO 3302');
    expect(findGeneralTolerances('ISO 13920-BF')[0].standard).toBe('ISO 13920');
    expect(findGeneralTolerances('DIN EN 755-9')[0].written).toBe('DIN EN 755-9');
    expect(findGeneralTolerances('ISO 22081')[0].standard).toBe('ISO 22081');
    expect(findGeneralTolerances('DIN 7168-m')[0].standard).toBe('DIN 7168');
  });
  it('ASME block tolerances by decimal places', () => {
    expect(findBlockTolerances('X.X ±0.1  X.XX ±0.05  ANGLES ±0.5°')).toEqual(['X.X ±0.1', 'X.XX ±0.05', 'ANGLES ±0.5°']);
    const out = extractGeneralTolerance(ctxOf([{ text: 'UNLESS OTHERWISE SPECIFIED: .XX ±.01 .XXX ±.005 ANGLES ±1°', x: 40, y: 700, region: 'other' }]));
    expect(out[0]).toMatchObject({ name: 'tolerance.general' });
    expect(String(out[0].value)).toContain('.XXX ±.005');
  });
  it('a class is interpreted, the statement is extracted', () => {
    const out = extractGeneralTolerance(ctxOf([{ text: 'GENERAL TOLERANCES ISO 2768-mK', x: 40, y: 700, region: 'other' }]));
    expect(out.find(p => p.name === 'tolerance.general')).toMatchObject({ value: 'ISO 2768-mK', kind: 'extracted' });
    expect(out.find(p => p.name === 'tolerance.generalClass')).toMatchObject({ value: 'medium', kind: 'interpreted' });
  });
});

describe('surface roughness', () => {
  it('Ra / Rz values, limits, N-grades and micro-inches', () => {
    expect(findRoughness('Ra 3.2')[0]).toMatchObject({ parameter: 'Ra', value: 3.2 });
    expect(findRoughness('Rz 16')[0]).toMatchObject({ parameter: 'Rz', value: 16 });
    expect(findRoughness('Ra max 1,6 µm')[0]).toMatchObject({ value: 1.6, limit: 'max' });
    expect(N_GRADE_RA.N7).toBe(1.6);
    expect(findRoughness('SURFACE FINISH N8')[0]).toMatchObject({ parameter: 'Ra', value: 3.2 });
    expect(findRoughness('ZONE N8')).toEqual([]);
    expect(findRoughness('FINISH 125 µin')[0].value).toBeCloseTo(3.175, 3);      // 125 × 0.0254
  });
  it('general in the notes, per-surface beside a view (flagged: the surface is not identified)', () => {
    const out = extractRoughness(ctxOf([
      { text: 'NOTES', x: 40, y: 500, region: 'other' }, { text: '1. SURFACE ROUGHNESS Ra 6.3 UNLESS OTHERWISE STATED.', x: 40, y: 520, region: 'other' },
      { text: 'Ra 0.8', x: 400, y: 200, region: 'view' },
    ], { layout: false }));
    expect(out.find(p => p.name === 'finish.roughnessGeneral')?.value).toEqual({ parameter: 'Ra', value: 6.3 });
    expect(out.find(p => p.name === 'finish.roughness')).toMatchObject({ value: { parameter: 'Ra', value: 0.8 }, status: 'needs-validation' });
  });
  it('a value read by OCR that is not a preferred roughness value is dropped, not reported', () => {
    expect(extractRoughness(ctxOf([{ text: 'Ra32', x: 400, y: 200, method: 'ocr', reliability: 0.9 }]))).toEqual([]);
    expect(extractRoughness(ctxOf([{ text: 'Ra 3.2', x: 400, y: 200, method: 'ocr', reliability: 0.9 }]))[0]).toMatchObject({ status: 'needs-validation', reliability: 0.9, method: 'ocr' });
  });
});

describe('coating, plating, paint', () => {
  const routes = (t: string) => extractCoating(ctxOf([{ text: t, x: 40, y: 500, region: 'other' }])).find(p => p.name === 'finish.coatingRoute')?.value;
  it('process words, English and German', () => {
    expect(routes('ZINC PLATE Fe/Zn8/A')).toBe('zinc-plate');
    expect(routes('ZnNi 8 µm')).toBe('zinc-nickel');
    expect(routes('KTL-beschichtet schwarz')).toBe('e-coat');
    expect(routes('CATHODIC DIP PAINT')).toBe('e-coat');
    expect(routes('POWDER COAT RAL 9005')).toBe('powder-coat');
    expect(routes('HARD ANODISE 50 µm')).toBe('hard-anodise');
    expect(routes('eloxiert E6/EV1')).toBe('anodise');
    expect(routes('ZINC PHOSPHATE AND OIL')).toBe('phosphate');
    expect(routes('PASSIVATE TO ASTM A967')).toBe('passivate');
    expect(routes('HARD CHROME PLATE 20 µm')).toBe('chrome');
    expect(routes('ELECTROLESS NICKEL PLATE')).toBe('electroless-nickel');
    expect(routes('GEOMET 321')).toBe('zinc-flake');
    expect(routes('feuerverzinkt nach ISO 1461')).toBe('hot-dip-galvanise');
  });
  it('thickness forms', () => {
    expect(findThickness('8-12 µm')).toMatchObject({ min: 8, max: 12 });
    expect(findThickness('min. 8 µm')).toMatchObject({ min: 8 });
    expect(findThickness('ZINC 8 µm')).toMatchObject({ nominal: 8 });
    expect(findThickness('Fe/Zn8/A')).toMatchObject({ min: 8 });
    expect(findThickness('Fe//ZnNi8//Cn//T2')).toMatchObject({ min: 8 });
  });
  it('a masking note is a masking note, not a coating; "no paint" is not paint; a colour is not a coating', () => {
    const out = extractCoating(ctxOf([{ text: 'MASK 4x M8 THREADS. NO PAINT ON SEALING FACE.', x: 40, y: 500, region: 'other' }]));
    expect(out.filter(p => p.name === 'finish.masking').map(p => p.value)).toEqual(['MASK 4x M8 THREADS.', 'NO PAINT ON SEALING FACE.']);
    expect(out.find(p => p.name === 'finish.maskedFeatures')?.value).toBe(4);
    expect(out.some(p => p.name === 'finish.coating')).toBe(false);
    expect(routes('COLOUR BLACK RAL 9005')).toBeUndefined();
  });
});

describe('heat treatment, hardness, case depth', () => {
  it('hardness forms (ISO 6508 / 6506 / 6507)', () => {
    expect(findHardness('58-62 HRC')[0]).toMatchObject({ min: 58, max: 62, scale: 'HRC' });
    expect(findHardness('HRC 58–62'.replace('–', '-'))[0]).toMatchObject({ min: 58, max: 62, scale: 'HRC' });
    expect(findHardness('180-220 HBW')[0]).toMatchObject({ min: 180, max: 220, scale: 'HBW' });
    expect(findHardness('≥ 550 HV10')[0]).toMatchObject({ min: 550, scale: 'HV10' });
    expect(findHardness('min. 58 HRC')[0]).toMatchObject({ min: 58 });
    expect(findHardness('60 ±2 HRC')[0]).toMatchObject({ min: 58, max: 62 });
    expect(findHardness('58+4 HRC')[0]).toMatchObject({ min: 58, max: 62 });
    expect(findHardness('229 HBW MAX')[0]).toMatchObject({ max: 229 });
  });
  it('case depth forms (ISO 18203)', () => {
    expect(findCaseDepth('CHD 0.6-0.9')[0]).toMatchObject({ type: 'CHD', min: 0.6, max: 0.9 });
    expect(findCaseDepth('CHD 550 HV1 0,6-0,9 mm')[0]).toMatchObject({ type: 'CHD', min: 0.6, max: 0.9, limitHardness: '550 HV' });
    expect(findCaseDepth('Eht 0,8+0,4')[0]).toMatchObject({ type: 'CHD', min: 0.8, max: 1.2 });
    expect(findCaseDepth('NHD 0.3 MIN')[0]).toMatchObject({ type: 'NHD', min: 0.3 });
    expect(findCaseDepth('SHD 2,0+1,0 mm')[0]).toMatchObject({ type: 'SHD', min: 2, max: 3 });
  });
  it('processes; the limit hardness of a case depth is not a hardness; "case hardened and tempered" is not quench-and-temper', () => {
    const out = extractHeatTreatment(ctxOf([{ text: 'CASE HARDENED AND TEMPERED. CHD 550 HV1 0.6-0.9 mm. SURFACE 58-62 HRC, CORE 30-42 HRC.', x: 40, y: 500, region: 'other' }]));
    expect(out.filter(p => p.name === 'heatTreat.process').map(p => p.value)).toEqual(['case-harden', 'temper']);
    expect(out.filter(p => p.name === 'heatTreat.hardness').map(p => p.value)).toEqual([{ scale: 'HRC', min: 58, max: 62 }, { scale: 'HRC', min: 30, max: 42 }]);
    expect(out.find(p => p.name === 'heatTreat.caseDepth')?.value).toMatchObject({ type: 'CHD', min: 0.6, max: 0.9 });
    const de = extractHeatTreatment(ctxOf([{ text: 'Vergütet 28-34 HRC, induktiv gehärtet, spannungsarmgeglüht', x: 40, y: 500, region: 'other' }]));
    expect(de.filter(p => p.name === 'heatTreat.process').map(p => p.value).sort()).toEqual(['induction-harden', 'quench-and-temper', 'stress-relieve']);
    const more = extractHeatTreatment(ctxOf([{ text: 'GAS NITRIDED. NORMALISED. AUSTEMPERED. SOLUTION TREATED AND ARTIFICIALLY AGED. HEAT TREAT TO T6.', x: 40, y: 500, region: 'other' }]));
    expect(more.filter(p => p.name === 'heatTreat.process').map(p => p.value).sort()).toEqual(['T6', 'age-harden', 'austemper', 'nitride', 'normalise', 'solution-treat']);
  });
});

describe('threads', () => {
  it('ISO metric: pitch written or the ISO 261 coarse pitch, class, count, depth', () => {
    expect(findThreads('4x M10x1.25-6H ↧ 16')[0]).toMatchObject({ designation: 'M10x1.25-6H', nominal: 10, pitch: 1.25, pitchSource: 'written', toleranceClass: '6H', count: 4, depth: 16 });
    expect(findThreads('M8')[0]).toMatchObject({ designation: 'M8', pitch: 1.25, pitchSource: 'ISO 261 coarse series' });
    expect(findThreads('M6 DEEP 12')[0]).toMatchObject({ depth: 12 });
    expect(findThreads('M8 x 16 tief')[0]).toMatchObject({ designation: 'M8', depth: 16 });
    expect(findThreads('2x M12x1.5 THRU')[0]).toMatchObject({ count: 2, through: true, pitch: 1.5 });
    expect(findThreads('M20x1.5-6g LH')[0]).toMatchObject({ hand: 'LH', toleranceClass: '6g' });
    expect(findThreads('M8x40')[0].note).toContain('not a standard pitch');
    expect(findThreads('M9999')).toEqual([]);
    expect(findThreads('ISO 3302-1 M2')).toEqual([]);
    expect(findThreads('ALUMINIUM')).toEqual([]);
  });
  it('unified, pipe, trapezoidal, inserts', () => {
    expect(findThreads('1/4-20 UNC-2B')[0]).toMatchObject({ system: 'unified', designation: '1/4-20UNC-2B', toleranceClass: '2B' });
    expect(findThreads('#10-32 UNF')[0]).toMatchObject({ system: 'unified' });
    expect(findThreads('G1/4')[0]).toMatchObject({ system: 'pipe', designation: 'G1/4' });
    expect(findThreads('Rp 1/2')[0]).toMatchObject({ system: 'pipe' });
    expect(findThreads('1/4-18 NPT')[0]).toMatchObject({ system: 'pipe' });
    expect(findThreads('Tr 20x4')[0]).toMatchObject({ system: 'trapezoidal', nominal: 20, pitch: 4 });
    expect(findThreads('M6 HELICOIL INSERT')[0].insert).toBe('HELICOIL INSERT');
  });
  it('a thread named in a masking note is not a callout; the count is flagged', () => {
    const out = extractThreads(ctxOf([{ text: '4x M10x1.5-6H', x: 100, y: 100 }, { text: 'MASK 4x M10 THREADS', x: 40, y: 500, region: 'other' }]));
    expect(out.filter(p => p.name === 'thread')).toHaveLength(1);
    expect(out.find(p => p.name === 'feature.count.threads')).toMatchObject({ value: 4, status: 'needs-validation', kind: 'interpreted' });
  });
});

describe('ISO 286 limits — against the published ISO 286-2 values', () => {
  // [nominal, class, upper µm, lower µm]
  const cases: Array<[number, string, number, number]> = [
    [25, 'H7', 21, 0], [50, 'H8', 39, 0], [10, 'H6', 9, 0], [100, 'H11', 220, 0],
    [20, 'g6', -7, -20], [30, 'h6', 0, -13], [10, 'f7', -13, -28], [12, 'e8', -32, -59], [80, 'd9', -100, -174],
    [8, 'js6', 4.5, -4.5], [30, 'k6', 15, 2], [40, 'm6', 25, 9], [16, 'n6', 23, 12], [60, 'p6', 51, 32], [40, 'r6', 50, 34], [30, 's6', 48, 35],
    [10, 'F8', 35, 13], [25, 'G7', 28, 7], [6, 'E9', 50, 20], [30, 'D10', 149, 65], [20, 'JS9', 26, -26],
    [25, 'K7', 6, -15], [50, 'M7', 0, -25], [50, 'N7', -8, -33], [8, 'N9', 0, -36], [18, 'P7', -11, -29], [8, 'P9', -15, -51],
    [30, 'R7', -20, -41], [30, 'S7', -27, -48], [3, 'H7', 10, 0], [3, 'K7', 0, -10], [300, 'M6', -9, -41], [64.52, 'h9', 0, -74],
  ];
  it.each(cases)('Ø%s %s → %s / %s µm', (nom, cls, up, lo) => {
    const m = /^([A-Za-z]+)(\d+)$/.exec(cls)!;
    const r = fitLimits(nom, m[1], Number(m[2]))!;
    expect(r).toBeDefined();
    expect(r.upper).toBeCloseTo(up / 1000, 6);
    expect(r.lower).toBeCloseTo(lo / 1000, 6);
  });
  it('outside the transcribed table: no limits rather than a guess', () => {
    expect(fitLimits(25, 'zc', 7)).toBeUndefined();
    expect(fitLimits(25, 'H', 4)).toBeUndefined();
    expect(fitLimits(600, 'H', 7)).toBeUndefined();
    expect(fitLimits(25, 'K', 9)).toBeUndefined();
  });
});

describe('dimensions and tolerances', () => {
  it('forms', () => {
    expect(parseDimension('125')?.read).toMatchObject({ type: 'linear', nominal: 125 });
    expect(parseDimension('12,5 ±0,1')?.read).toMatchObject({ nominal: 12.5, upper: 0.1, lower: -0.1 });
    expect(parseDimension('Ø25 H7')).toMatchObject({ read: { type: 'diameter', nominal: 25 }, fit: { letter: 'H', grade: 7 } });
    expect(parseDimension('4x Ø8.5 THRU')?.read).toMatchObject({ type: 'diameter', nominal: 8.5, count: 4, through: true });
    expect(parseDimension('R5')?.read).toMatchObject({ type: 'radius', nominal: 5 });
    expect(parseDimension('2x R5')?.read).toMatchObject({ type: 'radius', count: 2 });
    expect(parseDimension('45°')?.read).toMatchObject({ type: 'angle', nominal: 45 });
    expect(parseDimension('2 x 45°')?.read).toMatchObject({ type: 'chamfer', nominal: 2, chamferAngle: 45 });
    expect(parseDimension('25 +0.05/-0.02')?.read).toMatchObject({ upper: 0.05, lower: -0.02 });
    expect(parseDimension('(46.75)')?.read).toMatchObject({ nominal: 46.75, reference: true });
    expect(parseDimension('25.021/25.000')?.read).toMatchObject({ max: 25.021, min: 25 });
    expect(parseDimension('Ø.250')?.read).toMatchObject({ type: 'diameter', nominal: 0.25 });
  });
  it('what is not a dimension', () => {
    for (const t of ['2026-03-14', '1:2', '1/2', 'Ra 3.2', '3 PLACES', 'SECTION A-A', 'M8', '12 TEETH', 'CV-100-2231', '150 +0.2'])
      expect(parseDimension(t), t).toBeUndefined();
  });
  it('a stacked tolerance is re-assembled by position, and its two strings are not dimensions themselves', () => {
    const out = extractDimensions(ctxOf([{ text: '50', x: 100, y: 100, size: 10 }, { text: '+0.10', x: 114, y: 95, size: 7 }, { text: '-0.05', x: 114, y: 102.5, size: 7 }]));
    const dims = out.filter(p => p.name === 'dimension');
    expect(dims).toHaveLength(1);
    expect(dims[0].value).toMatchObject({ nominal: 50, upper: 0.1, lower: -0.05 });
    expect(out.find(p => p.name === 'tolerance.tightest')?.value).toMatchObject({ band: 0.15, nominal: 50 });
  });
  it('vertical text (reads bottom to top) stacks the same way', () => {
    const out = extractDimensions(ctxOf([{ text: '93.5', x: 100, y: 300, rotation: 90 }, { text: '+0.05', x: 95, y: 276, size: 7, rotation: 90 }, { text: '0', x: 102.5, y: 276, size: 7, rotation: 90 }]));
    expect(out.find(p => p.name === 'dimension')?.value).toMatchObject({ nominal: 93.5, upper: 0.05, lower: 0 });
  });
  it('stacked limits, a fit with computed limits, a boxed basic dimension', () => {
    const lim = extractDimensions(ctxOf([{ text: '25.02', x: 100, y: 100 }, { text: '24.98', x: 100, y: 112.5 }]));
    expect(lim.find(p => p.name === 'dimension')?.value).toMatchObject({ max: 25.02, min: 24.98 });
    const fit = extractDimensions(ctxOf([{ text: 'Ø20 g6', x: 100, y: 100 }])).find(p => p.name === 'dimension')!;
    expect(fit.value).toMatchObject({ nominal: 20, fit: 'g6', upper: -0.007, lower: -0.02 });
    expect(fit.kind).toBe('interpreted');
    expect(fit.note).toContain('ISO 286-1');
    const b = box(97, 88, 126, 104);
    const basic = extractDimensions(ctxOf([{ text: '62.5', x: 100, y: 100 }], b)).find(p => p.name === 'dimension')!;
    expect(basic.value).toMatchObject({ nominal: 62.5, basic: true });
  });
  it('an upper-case fit or a THRU makes a diameter a hole; a bare Ø stays a dimension', () => {
    const out = extractDimensions(ctxOf([{ text: 'Ø25 H7', x: 100, y: 100 }, { text: '2x Ø8.5 THRU', x: 100, y: 200 }, { text: 'Ø64 ±0.5', x: 100, y: 300 }]));
    expect(out.filter(p => p.name === 'hole.diameter').map(p => (p.value as { diameter: number }).diameter)).toEqual([25, 8.5]);
    expect(out.filter(p => p.name === 'dimension')).toHaveLength(1);
    expect(out.find(p => p.name === 'feature.count.holes')).toMatchObject({ value: 3, status: 'needs-validation' });
  });
  it('inch drawings are recognised: stated, or by decimals without a leading zero', () => {
    expect(drawingUnit(ctxOf([{ text: 'UNITS: INCHES', x: 40, y: 500, region: 'other' }]))).toMatchObject({ unit: 'in', stated: true });
    expect(drawingUnit(ctxOf(['.250', '.375', '1.500', '.125', '.062', '.500'].map((t, i) => ({ text: t, x: 100, y: 100 + 30 * i })))).unit).toBe('in');
    expect(drawingUnit(ctxOf([{ text: '25', x: 100, y: 100 }]))).toMatchObject({ unit: 'mm', stated: false });
  });
  it('read by OCR: only a clean, confident dimension string is taken', () => {
    const ocr = (text: string, reliability: number) => extractDimensions(ctxOf([{ text, x: 100, y: 100, method: 'ocr', reliability }])).filter(p => p.name === 'dimension' || p.name === 'hole.diameter');
    expect(ocr('150 ±0.2', 0.93)[0]).toMatchObject({ status: 'needs-validation', method: 'ocr', reliability: 0.93 });
    expect(ocr('150 ±0.2', 0.6)).toEqual([]);
    expect(ocr('Ø30 hé', 0.9)).toEqual([]);
    expect(ocr('4', 0.85)).toEqual([]);
  });
});

describe('GD&T feature-control frames', () => {
  it('cells → characteristic, tolerance, modifiers, datums', () => {
    expect(readFrame(['⌖', 'Ø0.2 Ⓜ', 'A', 'B'])).toMatchObject({ characteristic: 'position', tolerance: 0.2, diameterZone: true, modifiers: ['M'], datums: ['A', 'B'] });
    expect(readFrame(['⏥', '0.05'])).toMatchObject({ characteristic: 'flatness', tolerance: 0.05, datums: [] });
    expect(readFrame(['⟂', '0.02', 'A'])).toMatchObject({ characteristic: 'perpendicularity' });
    expect(readFrame(['↗', '0.03', 'A-B'])).toMatchObject({ characteristic: 'circular run-out', datums: ['A-B'] });
    expect(readFrame(['Ø.020P .425', 'A', 'B'])).toMatchObject({ characteristic: null, tolerance: 0.02, modifiers: ['P'], projected: 0.425, datums: ['A', 'B'] });
    expect(readFrame(['.030 A', 'B', 'C'])).toMatchObject({ tolerance: 0.03, datums: ['A', 'B', 'C'] });
    expect(readFrame(['62.5'])).toBeUndefined();
    expect(readFrame(['GEAR', 'DATA'])).toBeUndefined();
  });
  it('the ASME Y14.5 symbol-font letters, by font name only', () => {
    expect(GDT_FONT_MAP.j).toBe('⌖'); expect(GDT_FONT_MAP.x).toBe('↧'); expect(GDT_FONT_MAP.n).toBe('Ø'); expect(GDT_FONT_MAP.m).toBe('Ⓜ');
    for (const n of ['AIGDT', 'AMGDT', 'GDT', 'SWGDT', 'Y14.5M-2009', 'ABCDEF+AIGDT']) expect(GDT_FONT_NAME.test(n), n).toBe(true);
    for (const n of ['ArialMT', 'Helvetica', 'ISOCPEUR', 'Gadget']) expect(GDT_FONT_NAME.test(n), n).toBe(false);
  });
  it('a frame is found from the dividers between its cells; a symbol drawn as geometry is flagged, not guessed', () => {
    const v = [140, 160, 195, 215].map(x => ({ x0: x, y0: 88, x1: x, y1: 108 }));
    const known = extractGdt(ctxOf([{ text: '⌖', x: 145, y: 102 }, { text: 'Ø0.1', x: 165, y: 102 }, { text: 'A', x: 202, y: 102 }], { v }));
    expect(known.parameters.find(p => p.name === 'gdt.frame')).toMatchObject({ status: 'extracted', value: { characteristic: 'position', tolerance: 0.1, datums: ['A'] } });
    expect(known.parameters.find(p => p.name === 'gdt.datum')?.value).toBe('A');
    expect(known.frameLineIds.size).toBe(3);
    const geo = extractGdt(ctxOf([{ text: '0.1', x: 165, y: 102 }, { text: 'A', x: 202, y: 102 }], { v }));
    const f = geo.parameters.find(p => p.name === 'gdt.frame')!;
    expect(f).toMatchObject({ status: 'needs-validation', value: { characteristic: null, tolerance: 0.1, datums: ['A'] } });
    expect(f.rawText).toContain('[symbol not text]');
    // and its figures are not dimensions
    const ctx = ctxOf([{ text: '0.1', x: 165, y: 102 }, { text: 'A', x: 202, y: 102 }], { v });
    expect(extractDimensions(ctx, { skipLineIds: extractGdt(ctx).frameLineIds })).toEqual([]);
  });
});

describe('welds, quality, gear, notes, title block', () => {
  it('weld notes and standard; a weld size beside a view is a candidate, never a weld', () => {
    const out = extractWelds(ctxOf([{ text: 'WELDING TO ISO 5817-C, PROCESS 135. WELD ALL ROUND.', x: 40, y: 500, region: 'other' }, { text: 'a4', x: 300, y: 200, region: 'view' }]));
    expect(out.find(p => p.name === 'weld.standard')?.value).toBe('ISO 5817-C');
    expect(out.filter(p => p.name === 'weld.note')).toHaveLength(2);
    expect(out.find(p => p.name === 'weld.note')?.note).toContain('135');
    expect(out.find(p => p.name === 'weld.symbol')).toMatchObject({ status: 'needs-validation' });
  });
  it('leak test, NDT, cleanliness, impregnation, safety marking, part marking, edges', () => {
    const out = extractQuality(ctxOf([
      { text: 'LEAK TEST AT 2.5 bar AIR, MAX 5 cm³/min.', x: 40, y: 500, region: 'other' }, { text: 'VACUUM IMPREGNATION PERMITTED.', x: 40, y: 520, region: 'other' },
      { text: '100% MAGNETIC PARTICLE INSPECTION TO ISO 9934-1.', x: 40, y: 540, region: 'other' }, { text: 'CLEANLINESS VDA 19.1 CCC A(B40/C20).', x: 40, y: 560, region: 'other' },
      { text: 'SICHERHEITSRELEVANTES BAUTEIL', x: 40, y: 580, region: 'other' }, { text: 'PART MARKING: DATE CLOCK AND PART NUMBER', x: 40, y: 600, region: 'other' },
      { text: 'BREAK ALL SHARP EDGES ISO 13715', x: 40, y: 620, region: 'other' },
    ]));
    const v = (n: string) => out.find(p => p.name === n);
    expect(v('quality.pressureTight')).toMatchObject({ value: true, kind: 'interpreted' });
    expect(v('quality.leakTestSpec')?.note).toContain('2.5 bar');
    expect(v('quality.leakTestSpec')?.note).toContain('air');
    expect(String(v('quality.impregnation')?.value)).toContain('IMPREGNATION');
    expect(v('quality.ndt')?.note).toContain('magnetic particle');
    expect(String(v('quality.cleanliness')?.value)).toContain('VDA 19.1');
    expect(v('quality.safetyCritical')?.value).toBe(true);
    expect(String(v('quality.marking')?.value)).toContain('DATE CLOCK');
    expect(String(v('finish.edges')?.value)).toContain('ISO 13715');
  });
  it('a bare CC / SC marking is flagged for validation: its meaning is the drawing owner\'s convention', () => {
    const out = extractQuality(ctxOf([{ text: 'CC', x: 300, y: 200, region: 'view' }, { text: '<S>', x: 400, y: 220, region: 'view' }]));
    expect(out.find(p => p.name === 'quality.safetyCritical')).toMatchObject({ status: 'needs-validation', value: true });
  });
  it('gear data table rows by their labels (English and German)', () => {
    const rows = [['NUMBER OF TEETH', 'z', '23'], ['NORMAL MODULE', 'mn', '2.5'], ['PRESSURE ANGLE', 'α', '20°'], ['HELIX ANGLE', 'β', '15° RH'], ['FACE WIDTH', 'b', '20'], ['PROFILE SHIFT COEFFICIENT', 'x', '+0.25'], ['GEAR QUALITY', '', 'ISO 1328 CLASS 6']];
    const lines = rows.flatMap(([a, b, c], i) => [{ text: a, x: 700, y: 100 + 17 * i, size: 8 }, ...(b ? [{ text: b, x: 900, y: 100 + 17 * i, size: 8 }] : []), { text: c, x: 935, y: 100 + 17 * i, size: 8 }]);
    const out = extractGear(ctxOf(lines, { layout: true }));
    const v = (n: string) => out.find(p => p.name === n)?.value;
    expect([v('gear.teeth'), v('gear.module'), v('gear.pressureAngle'), v('gear.helixAngle'), v('gear.helixHand'), v('gear.faceWidth'), v('gear.profileShift')]).toEqual([23, 2.5, 20, 15, 'right', 20, 0.25]);
    expect(String(v('gear.qualityClass'))).toContain('ISO 1328 CLASS 6');
    const de = extractGear(ctxOf([['Zähnezahl', '31'], ['Modul', '3'], ['Eingriffswinkel', '20°'], ['Schrägungswinkel', '0°'], ['Zahnbreite', '18']].flatMap(([a, c], i) => [{ text: a, x: 700, y: 100 + 17 * i, size: 8 }, { text: c, x: 900, y: 100 + 17 * i, size: 8 }]), { layout: true }));
    expect(de.find(p => p.name === 'gear.teeth')?.value).toBe(31);
    expect(de.find(p => p.name === 'gear.module')?.value).toBe(3);
  });
  it('every numbered note is kept verbatim, wrapped lines joined, the number kept', () => {
    const ctx = ctxOf([
      { text: 'NOTES', x: 40, y: 500 }, { text: '1.', x: 40, y: 520 }, { text: 'ALL DIMENSIONS IN MILLIMETRES.', x: 62, y: 520 },
      { text: '2.', x: 40, y: 538 }, { text: 'PRESSURE TEST AT 6 bar AIR FOR 30 s,', x: 62, y: 538 }, { text: 'NO LEAKAGE ALLOWED.', x: 62, y: 551.5 },
      { text: '3.', x: 40, y: 570 }, { text: 'SUPPLIER TO AGREE PACKAGING.', x: 62, y: 570 },
    ], { layout: true });
    const out = extractNotes(ctx);
    expect(out.map(p => p.rawText)).toEqual(['1. ALL DIMENSIONS IN MILLIMETRES.', '2. PRESSURE TEST AT 6 bar AIR FOR 30 s, NO LEAKAGE ALLOWED.', '3. SUPPLIER TO AGREE PACKAGING.']);
    expect(out.map(p => p.name)).toEqual(['note.general', 'note.manufacturing', 'note.general']);
    expect(out[1].appliesTo?.description).toBe('note 2');
    expect(out[1].location?.region).toBe('notes');
  });
  it('title-block labels in English and German; label → value by cell', () => {
    expect(labelKey('DRAWING NO.')).toBe('drawingNumber'); expect(labelKey('Zeichnungs-Nr.')).toBe('drawingNumber'); expect(labelKey('DWG NUMBER')).toBe('drawingNumber');
    expect(labelKey('Werkstoff')).toBe('material'); expect(labelKey('Maßstab')).toBe('scale'); expect(labelKey('Benennung / Title')).toBe('partName');
    expect(labelKey('Allgemeintoleranz')).toBe('generalTolerance'); expect(labelKey('Oberfläche')).toBe('finish'); expect(labelKey('THE QUICK BROWN FOX')).toBeUndefined();
    expect(labelPrefix('MATERIAL: EN-GJS-500-7')).toEqual({ key: 'material', value: 'EN-GJS-500-7' });
    // three cells on one row: label small at the top of each cell, value below it
    const h = [{ x0: 600, y0: 700, x1: 900, y1: 700 }, { x0: 600, y0: 734, x1: 900, y1: 734 }];
    const v = [600, 700, 800, 900].map(x => ({ x0: x, y0: 700, x1: x, y1: 734 }));
    const ctx = ctxOf([
      { text: 'SCALE', x: 603, y: 708, size: 5 }, { text: '1:2', x: 604, y: 726 },
      { text: 'SHEET', x: 703, y: 708, size: 5 }, { text: '1 OF 3', x: 704, y: 726 },
      { text: 'MASS', x: 803, y: 708, size: 5 }, { text: '850 g', x: 804, y: 726 },
    ], { h, v, layout: true });
    expect(cellAt(650, 715, { hSegs: h, vSegs: v, width: 1190, height: 842 })).toEqual({ bbox: [600, 700, 700, 734], closed: true });
    const out = extractTitleBlock(ctx);
    expect(out.find(p => p.name === 'title.scale')).toMatchObject({ value: '1:2', status: 'extracted', location: { region: 'title-block' } });
    expect(out.find(p => p.name === 'title.sheet')?.value).toBe('1/3');
    expect(out.find(p => p.name === 'part.mass')).toMatchObject({ value: 0.85, unit: 'kg', kind: 'interpreted' });
  });
});

describe('reading order', () => {
  const item = (text: string, ox: number, oy: number, size = 10, rotation = 0): RawTextItem => ({ text, sheet: 1, ox, oy, width: text.length * size * 0.55, size, rotation, method: 'pdf-text', reliability: 1 });
  it('one glyph per run is merged into words and lines by baseline and gap', () => {
    const glyphs = [...'M10x1.5'].map((c, i) => item(c, 100 + i * 5.5, 200));
    const word2 = [...'DEEP'].map((c, i) => item(c, 100 + 7 * 5.5 + 3 + i * 5.5, 200));
    const lines = assembleLines([...glyphs, ...word2, item('NEXT LINE', 100, 215)], { h: [], v: [], o: [] });
    expect(lines.map(l => l.text)).toEqual(['M10x1.5 DEEP', 'NEXT LINE']);
  });
  it('a divider between two runs keeps them apart (table cells), a wide gap too', () => {
    const lines = assembleLines([item('SCALE', 100, 200), item('1:2', 132, 200), item('FAR', 400, 200)], { h: [], v: [{ x0: 130, y0: 185, x1: 130, y1: 205 }], o: [] });
    expect(lines.map(l => l.text)).toEqual(['SCALE', '1:2', 'FAR']);
  });
  it('text turned 90° and 270° is assembled in its own frame', () => {
    const up = [...'125'].map((c, i) => item(c, 300, 400 - i * 5.5, 10, 90));
    const down = [...'ABC'].map((c, i) => item(c, 500, 100 + i * 5.5, 10, 270));
    const lines = assembleLines([...up, ...down], { h: [], v: [], o: [] });
    expect(lines.map(l => `${l.rotation}:${l.text}`).sort()).toEqual(['270:ABC', '90:125']);
    const l = lines.find(x => x.rotation === 90)!;
    expect(l.bbox[3] - l.bbox[1]).toBeGreaterThan(l.bbox[2] - l.bbox[0]);     // taller than wide on the sheet
  });
  it('symbols are brought to one spelling; OCR look-alikes only on OCR text', () => {
    expect(normText('⌀25 − 0,1 × 2')).toBe('Ø25 - 0,1 x 2');
    expect(normText('@62 H7', 'ocr')).toBe('Ø62 H7');
    expect(normText('150 £0.2', 'ocr')).toBe('150 ±0.2');
    expect(normText('20-35 pm', 'ocr')).toBe('20-35 µm');
    expect(normText('10F1', 'ocr')).toBe('1 OF 1');
    expect(normText('@62 £0.2')).toBe('@62 £0.2');
  });
});

describe('every name the extractors emit is in the dictionary', () => {
  it('on a sheet that exercises all of them', () => {
    const ctx = ctxOf([
      { text: 'MATERIAL: 42CrMo4+QT TO EN ISO 683-2, t = 3 mm', x: 40, y: 400, region: 'other' }, { text: 'ISO 2768-mK. ISO 8062-3 DCTG 8.', x: 40, y: 420, region: 'other' },
      { text: 'Ra 3.2 ALL OVER. ZINC PLATE 8-12 µm. MASK 2x M6.', x: 40, y: 440, region: 'other' }, { text: 'CASE HARDEN 58-62 HRC CHD 0.6-0.9', x: 40, y: 460, region: 'other' },
      { text: 'WELD TO ISO 5817-B. LEAK TEST 3 bar. X-RAY ASTM E155. VDA 19. SAFETY CRITICAL. IMPREGNATE. PART MARKING TO VDA 260. 100% INSPECTION. DEBURR.', x: 40, y: 480, region: 'other' },
      { text: '4x M8x1.25-6H', x: 300, y: 100 }, { text: 'Ø25 H7', x: 300, y: 130 }, { text: '2x Ø6 THRU', x: 300, y: 160 }, { text: '80 ±0.1', x: 300, y: 190 }, { text: 'a4', x: 300, y: 220 },
    ]);
    const names = new Set([...extractMaterial(ctx), ...extractGeneralTolerance(ctx), ...extractRoughness(ctx), ...extractCoating(ctx), ...extractHeatTreatment(ctx), ...extractThreads(ctx),
      ...extractDimensions(ctx), ...extractWelds(ctx), ...extractQuality(ctx)].map(p => p.name));
    expect(names.size).toBeGreaterThan(25);
    for (const n of names) expect(isKnownParameter(n), n).toBe(true);
  });
});
