/**
 * "From the drawing" — the review panel's model and HTML, the question-card notes, the Get cost flow, and the
 * "Drawing specification" block of the reports (offline 2D drawing intelligence, integration — Nov 2026).
 *
 * The drawings are read by the real reader (vector PDFs, in process) and consolidated with geometry recorded from the
 * real parts, so the rows asserted here are what an engineer sees for those files.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsPDF } from 'jspdf';
import ExcelJS from 'exceljs';
import { readDrawing } from '../server/drawing/index.js';
import { runCostInputRules, specForCommodity, type RuleContext } from '../src/engine/cost-input-rules/index.js';
import {
  consolidate, answersFromEngineeringData, replayReview, statusWord, sourceWord, valueText, whereText, exactlyRead, reviewGroupOf, REVIEW_GROUPS,
  type ConsolidatedEngineeringData, type DrawingExtraction, type EngineeringParameter, type ReviewOp,
} from '../src/engine/engineering-data/index.js';
import { buildReviewPanel, reviewPanelHtml, drawingChipsHtml, leaningNoteHtml, questionNoteHtml, DRAWING_OFFLINE_LINE, type DrawingCostingView, type DrawingInfoView } from '../src/ui/drawing-review.js';
import { typedValue, reviewProjectId } from '../src/ui/drawing-review-ui.js';
import { nextCostStep } from '../src/ui/cad-flow.js';
import { cadStamp } from '../src/ui/cad-workspace.js';
import { inlineHandlers } from '../src/ui/page-actions.js';
import { buildDrawingSpecReport } from '../src/export/drawing-spec-report.js';
import { buildCoreReport } from '../src/export/executive-summary.js';
import { printPDF, printAuditPackPDF, type CADReportMeta } from '../src/export/pdf.js';
import { exportToExcelBlob } from '../src/export/excel.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { computeUniversalStack } from '../src/engine/core.js';
import type { UniversalStackInput } from '../src/engine/types.js';
import { recorded } from './engineering-data-helpers.js';

const ROOT = join(__dirname, '..');
const FIX = join(ROOT, 'tests', 'fixtures', 'drawings');
const PARTS = join(ROOT, '..', 'cad-audit', 'parts');
const AT = '2026-11-10T10:00:00.000Z';
const confirmOp = (id: string): ReviewOp => ({ op: 'confirm', id, by: 'A. Engineer', at: AT });

interface Loaded { ex: DrawingExtraction; fresh: ConsolidatedEngineeringData; info: DrawingInfoView; commodity: string; decisions: ReturnType<typeof runCostInputRules>['decisions'] }
async function load(part: string, drawing: string, commodity: string, name = drawing.split('/').pop()!): Promise<Loaded> {
  const b = recorded(part);
  const ex = await readDrawing(readFileSync(drawing), name);
  const fresh = consolidate({ cad: { geo: b.geometry, filename: b.part }, drawing: ex, commodity });
  const decisions = runCostInputRules(specForCommodity(commodity)!, { geo: b.geometry, geometryQuality: 'occt', commodity, commoditySource: 'engineer', annualVolume: 50_000, filename: part, answers: {} } as RuleContext).decisions;
  const info: DrawingInfoView = { file: name, hash: 'ab12cd34'.padEnd(64, '0'), sizeBytes: 1000, fileKind: ex.fileKind, readerVersion: ex.readerVersion, status: 'ready', sheets: ex.sheets, warnings: ex.warnings,
    readings: ex.parameters.length, ocrReadings: ex.parameters.filter(p => p.method === 'ocr').length };
  return { ex, fresh, info, commodity, decisions };
}
function view(l: Loaded, ops: ReviewOp[] = [], hand: Record<string, unknown> = {}, pending = false) {
  const { data, skipped } = replayReview(l.fresh, { schemaVersion: 1, ops });
  const c = answersFromEngineeringData(data, l.commodity, { decisions: l.decisions, answered: hand });
  const costing: DrawingCostingView = { ...c, skipped,
    overridden: c.dropped.filter(d => hand[d.decisionId] !== undefined && /already answered this question by hand/.test(d.why)).map(d => ({ decisionId: d.decisionId, parameterId: d.parameterId, drawingValue: d.value, handValue: hand[d.decisionId], why: d.why })),
    questions: l.decisions.map(d => ({ id: d.id, question: d.question, why: d.why, severity: d.severity, options: d.options.map(o => ({ value: String(o.value), label: o.label, ...(o.consequence ? { consequence: o.consequence } : {}) })), ...(d.entry ? { entry: d.entry } : {}) })) };
  const model = buildReviewPanel({ drawing: l.info, data, costing, commodity: l.commodity, pending, decisions: ops.length });
  return { data, costing, model, html: reviewPanelHtml(model) };
}
const rowsOf = (m: ReturnType<typeof buildReviewPanel>) => m.groups.flatMap(g => g.rows);

let casting: Loaded, wrongGear: Loaded, gear: Loaded;
beforeAll(async () => {
  casting = await load('Casting_Braket.stp', join(FIX, 'real-casting-bracket.pdf'), 'cast_and_machine');
  wrongGear = await load('test-gear-m3-z38.step', join(PARTS, 'gear-drawing-WRONG-z40.pdf'), 'gear');
  gear = await load('test-gear-m3-z38.step', join(PARTS, 'gear-drawing-m3-z38.pdf'), 'gear');
}, 60_000);

describe('the words', () => {
  const p = (o: Partial<EngineeringParameter>): EngineeringParameter => ({ id: 'x', name: 'material.designation', value: 'S355', source: 'drawing', method: 'pdf-text', kind: 'extracted', status: 'extracted', ...o });
  it('every status is a word', () => {
    expect((['extracted', 'needs-validation', 'missing', 'conflict', 'confirmed', 'corrected', 'rejected'] as const).map(s => statusWord({ status: s, kind: 'extracted' })))
      .toEqual(['Read', 'Needs checking', 'Missing', 'Conflict', 'Confirmed', 'Corrected', 'Rejected']);
    expect(statusWord({ status: 'extracted', kind: 'inferred' })).toBe('Inferred');
    expect(statusWord({ status: 'needs-validation', kind: 'inferred' })).toBe('Inferred');
    expect(statusWord({ status: 'confirmed', kind: 'inferred' })).toBe('Confirmed');   // a decision outranks how it was obtained
  });
  it('every source is a word', () => {
    expect((['cad', 'drawing', 'derived', 'manual'] as const).map(s => sourceWord({ source: s }))).toEqual(['CAD', 'Drawing', 'Derived', 'Typed']);
  });
  it('a value prints as it is read; a place prints as sheet, zone, block and how it was read', () => {
    expect(valueText(p({ value: true }))).toBe('Yes');
    expect(valueText(p({ value: 4.85, unit: 'kg' }))).toBe('4.85 kg');
    expect(valueText(p({ value: { min: 58, max: 62, scale: 'HRC' } }))).toBe('58–62 HRC');
    expect(valueText(p({ value: { min: 12, max: 12 }, unit: 'µm' }))).toBe('12 µm');
    expect(valueText(p({ name: 'thread', value: { designation: 'M10x1.5-6H', count: 4 }, rawText: '4x M10x1.5-6H ↧ 20' }))).toBe('4x M10x1.5-6H ↧ 20');
    expect(whereText(p({ location: { sheet: 1, zone: 'D1', bbox: [0, 0, 1, 1], region: 'title-block' } }))).toBe('Sheet 1 · zone D1 · title block · exact text');
    expect(whereText(p({ method: 'ocr', reliability: 0.87, location: { sheet: 2, bbox: [0, 0, 1, 1], region: 'notes' } }))).toBe('Sheet 2 · notes · OCR 87 %');
  });
  it('every parameter has a group of the panel', () => {
    expect(REVIEW_GROUPS.map(g => g.title)).toEqual(['Identity', 'Material', 'Tolerances', 'Finish', 'Heat treatment', 'Threads & holes', 'Quality', 'Gear', 'Notes']);
    expect(['title.partName', 'material.grade', 'tolerance.generalClass', 'dimension', 'finish.coatingRoute', 'heatTreat.route', 'thread', 'quality.pressureTight', 'gear.teeth', 'note.general', 'weld.note']
      .map(reviewGroupOf)).toEqual(['identity', 'material', 'tolerances', 'tolerances', 'finish', 'heat-treatment', 'features', 'quality', 'gear', 'notes', 'notes']);
  });
  it('"read exactly" needs every reading behind a value to be exact text with nothing to doubt', () => {
    const raw = p({ id: 'r' }), ocr = p({ id: 'o', method: 'ocr', status: 'needs-validation' });
    const d1 = p({ id: 'd1', source: 'derived', method: 'rule', derivedFrom: ['r'] }), d2 = p({ id: 'd2', source: 'derived', method: 'rule', derivedFrom: ['o'] });
    const byId = new Map([raw, ocr, d1, d2].map(x => [x.id, x]));
    expect(exactlyRead(raw, byId)).toBe(true);
    expect(exactlyRead(d1, byId)).toBe(true);
    expect(exactlyRead(ocr, byId)).toBe(false);
    expect(exactlyRead(d2, byId)).toBe(false);                                   // interpreted from an OCR reading
    expect(exactlyRead(p({ status: 'needs-validation' }), byId)).toBe(false);
    expect(exactlyRead(p({ status: 'confirmed' }), byId)).toBe(false);           // already decided
  });
});

describe('the panel on a real part with its drawing (the casting bracket)', () => {
  it('groups the readings, names where each was read, and says which question each would answer — nothing is used yet', () => {
    const { model, html } = view(casting);
    expect(model.groups.map(g => g.title)).toEqual(expect.arrayContaining(['Identity', 'Material', 'Tolerances', 'Finish', 'Quality']));
    const fam = rowsOf(model).find(r => r.name === 'material.family')!;
    expect(fam).toMatchObject({ value: 'aluminium', source: 'Derived', status: 'Read', canConfirm: true, canCorrect: true, canReject: true, canUndo: false });
    expect(fam.where).toMatch(/Sheet 1 · zone \w+ · title block · interpreted from "A356-T6" \(exact text\)/);
    expect(fam.effect.kind).toBe('would-answer');
    expect(fam.effect.text).toMatch(/^Would answer ".*\?" with .*\. Not used until you confirm it\.$/);   // the open question, in its own words
    // a question the route asks only after the material is settled is named by its short name, never its id
    expect(rowsOf(model).find(r => r.name === 'quality.pressureTight')!.effect.text).toBe('Would answer the "Leak-tight" question with yes. Not used until you confirm it.');
    expect(fam.parentId).toBe('drawing:material.designation:1');                  // drawn under the reading it came from
    // the tolerance class is an interpretation that needs checking — a word, not a colour
    expect(rowsOf(model).find(r => r.name === 'tolerance.generalClass')).toMatchObject({ value: 'tight', status: 'Needs checking' });
    expect(model.summary).toMatch(/\d+ readings · \d+ answers? a costing question \(0 confirmed and used\)/);
    expect(model.pending).toBe(false);
    expect(html).toContain('From the drawing');
    expect(html).toContain(DRAWING_OFFLINE_LINE);
    expect(html).toMatch(/<span class="dr-badge dr-status" data-k="check">Needs checking<\/span>/);
    expect(html).toMatch(/<span class="dr-badge dr-src">Derived<\/span>/);
  });

  it('"Confirm all read exactly" offers only exact readings that answer a question — never one that needs checking', () => {
    const { model, data } = view(casting);
    const names = model.exactIds.map(id => data.parameters.find(p => p.id === id)!.name);
    expect(names).toEqual(expect.arrayContaining(['material.family', 'material.grade', 'quality.pressureTight', 'quality.safetyCritical', 'material.condition']));
    expect(names).not.toContain('tolerance.generalClass');                        // needs-validation
    for (const id of model.exactIds) expect(data.parameters.find(p => p.id === id)!.status).toBe('extracted');
    expect(reviewPanelHtml(model)).toMatch(new RegExp(`Confirm all read exactly \\(${model.exactIds.length}\\)`));
  });

  it('confirming a grade offers its family with it', () => {
    const { model } = view(casting);
    const grade = rowsOf(model).find(r => r.name === 'material.grade')!;
    expect(grade.confirmLabel).toBe('Confirm grade and family');
    expect(grade.companions).toEqual([rowsOf(model).find(r => r.name === 'material.family')!.id]);
    expect(reviewPanelHtml(model)).toContain(`data-dr-with="${grade.companions[0].replace(/>/g, '&gt;')}"`);
    // a rate-book grade is shown by its name — never by its library id
    expect(grade.value).toBe('LM25 / A356');
    expect(grade.effect.text).toMatch(/^Would answer the "Grade" question with LM25 \/ A356\. Not used until you confirm it\.$/);
    expect(reviewPanelHtml(model)).not.toMatch(/>mat-lm25</);
    // once the family is confirmed the grade is confirmed alone
    const after = view(casting, [confirmOp(grade.companions[0])]).model;
    expect(rowsOf(after).find(r => r.name === 'material.grade')).toMatchObject({ confirmLabel: 'Confirm', companions: [] });
  });

  it('a confirmed row says what it answers, shows Undo, and the pending review is said until the rules are re-run', () => {
    const fam = rowsOf(view(casting).model).find(r => r.name === 'material.family')!;
    const { model, html, costing } = view(casting, [confirmOp(fam.id)], {}, true);
    const row = rowsOf(model).find(r => r.id === fam.id)!;
    expect(row).toMatchObject({ status: 'Confirmed', canConfirm: false, canUndo: true });
    expect(row.effect).toMatchObject({ kind: 'answers', decisionId: 'material.family' });
    expect(row.effect.text).toMatch(/\(applied at the next Get cost\)$/);
    expect(costing.answers).toEqual({ 'material.family': 'aluminium' });
    expect(model.pending).toBe(true);
    expect(html).toMatch(/Review changed — it is applied when you press Get cost/);
    expect(html).toContain('data-dr-act="apply"');
    expect(html).toContain('data-dr-act="start-again"');
  });

  it('what no rule prices sits in a collapsed list, with the reason — shown, never costed', () => {
    const { model, html } = view(casting);
    expect(model.notCosted.length).toBeGreaterThan(8);
    expect(model.notCosted.map(n => n.label)).toEqual(expect.arrayContaining(['Dimension', 'Surface roughness', 'General surface roughness']));
    expect(html).toMatch(new RegExp(`<details class="dr-notcosted"><summary>Specified on the drawing — not in the cost model yet \\(${model.notCosted.length}\\)</summary>`));
    expect(html).not.toMatch(/<details class="dr-notcosted" open/);
    for (const n of model.notCosted) expect(n.why).toMatch(/^specified on the drawing — /);
    // a not-costed row is not among the rows that offer Confirm
    const ids = new Set(rowsOf(model).map(r => r.id));
    for (const n of model.notCosted) expect(ids.has(n.id)).toBe(false);
  });

  it('a reading the form takes as a field (masked features) says so, and the finish thickness that cannot be used says why', () => {
    const all = view(casting).data.parameters;
    const fam = all.find(p => p.name === 'material.family')!, route = all.find(p => p.name === 'finish.coatingRoute')!;
    const masks = all.find(p => p.name === 'finish.maskedFeatures')!, thick = all.find(p => p.name === 'finish.coatingThickness')!;
    const { model } = view(casting, [fam.id, route.id, masks.id, thick.id].map(confirmOp));
    expect(rowsOf(model).find(r => r.id === masks.id)!.effect).toMatchObject({ kind: 'form-field' });
    expect(rowsOf(model).find(r => r.id === masks.id)!.effect.text).toMatch(/Fills the finish block of the costing form: 3 masked feature\(s\), confirmed from the drawing/);
    expect(model.groups.find(g => g.key === 'finish')!.notes.join(' ')).toMatch(/20–35 µm is a range and the form takes one figure/);
  });

  it('the engineer\'s own answer over a confirmed reading is drawn as a conflict with both values', () => {
    const tol = view(casting).data.parameters.find(p => p.name === 'tolerance.generalClass')!;
    const { model, html } = view(casting, [confirmOp(tol.id)], { 'service.toleranceClass': 'standard' });
    expect(model.overridden).toHaveLength(1);
    expect(model.overridden[0]).toMatchObject({ decisionId: 'service.toleranceClass', drawing: 'tight' });
    expect(html).toMatch(/Your answer differs from the confirmed drawing/);
    expect(html).toMatch(/You answered <strong>[^<]+<\/strong>; the drawing value you confirmed reads <strong>tight<\/strong>\. Your answer is used\./);
    expect(html).toContain('data-dr-act="use-drawing" data-dr-decision="service.toleranceClass"');
  });
});

describe('a conflict requires a choice', () => {
  it('both sides are shown, the suggestion is marked "suggested", and neither side can be confirmed by itself', () => {
    const { model, html } = view(wrongGear);
    const c = model.conflicts.find(x => x.name === 'gear.teeth')!;
    expect(c).toMatchObject({ open: true, label: 'Number of teeth' });
    expect(c.sides.map(s => [s.source, s.value, s.suggested])).toEqual([['CAD', '38', true], ['Drawing', '40', false]]);
    expect(html).toMatch(/Conflicts — choose a value \(nothing is chosen for you\)/);
    expect(html).toMatch(/<span class="dr-suggested">suggested<\/span>/);
    expect((html.match(/data-dr-act="resolve"/g) ?? []).length).toBe(2);
    expect(html).toContain('data-dr-form="resolve"');                               // or type the value
    // the drawing's row is in conflict: no Confirm button on it
    const row = rowsOf(model).find(r => r.id === 'drawing:gear.teeth:1')!;
    expect(row).toMatchObject({ status: 'Conflict', canConfirm: false, canCorrect: false, canReject: false });
    expect(model.exactIds).not.toContain('drawing:gear.teeth:1');
    expect(model.summary).toMatch(/1 conflict to settle/);
  });

  it('settled, it says who chose what and offers Reopen; choosing the drawing\'s count where the model measured one is said, not used', () => {
    const forDrawing: ReviewOp[] = [{ op: 'resolve', name: 'gear.teeth', choose: 'drawing:gear.teeth:1', by: 'A. Engineer', at: AT }];
    const { model, html, costing } = view(wrongGear, forDrawing);
    const c = model.conflicts.find(x => x.name === 'gear.teeth')!;
    expect(c.open).toBe(false);
    expect(c.resolution).toBe('Settled by A. Engineer: 40 (the drawing)');
    expect(html).toMatch(/Conflicts settled/);
    expect(html).toContain('aria-label="Reopen the conflict on Number of teeth"');
    expect(costing.answers).toEqual({});
    const row = rowsOf(model).find(r => r.id === 'drawing:gear.teeth:1')!;
    expect(row.effect.kind).toBe('not-used');
    expect(row.effect.text).toMatch(/measured this on the 3D model — its question is not open, so the measured figure stands/);
  });
});

describe('what the panel never does', () => {
  it('escapes every string that came from a drawing, a file name or a person', () => {
    const evil = '<img src=x onerror=alert(1)>"\'&';
    const l: Loaded = { ...casting, info: { ...casting.info, file: evil, warnings: [evil] },
      fresh: { ...casting.fresh, parameters: casting.fresh.parameters.map(p => (p.name === 'title.partName' ? { ...p, value: evil, rawText: evil, note: evil } : p)),
        missing: [{ name: 'material.designation', why: evil }] } };
    const { html } = view(l, [{ op: 'correct', id: 'drawing:title.partNumber:1', value: evil, by: evil, at: AT, reason: evil }]);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toMatch(/onerror=alert\(1\)>/);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;');
    expect(inlineHandlers(html)).toEqual([]);                                      // and carries no inline handler (the CSP blocks them)
    expect(drawingChipsHtml([{ id: 'x', name: evil, value: evil, parameterId: evil }])).not.toContain('<img');
    expect(leaningNoteHtml({ label: evil, where: evil, sourceText: evil, parameterId: evil })).not.toContain('<img');
  });

  it('a question card\'s note never ticks anything: it is text and a link to the panel', () => {
    const note = leaningNoteHtml({ label: 'tight', where: 'Sheet 1 · zone F5 · title block', sourceText: 'ISO 8062-3 DCTG 6', parameterId: 'p1' });
    expect(note).toMatch(/The drawing reads <strong>tight<\/strong> \(“ISO 8062-3 DCTG 6”\) — Sheet 1 · zone F5 · title block\. Not confirmed, so it is not used:/);
    expect(note).not.toMatch(/checked|<input|type="radio"/);
    expect(note).toContain('data-dr-open="p1"');
    expect(leaningNoteHtml(null)).toBe('');
    const pending = questionNoteHtml({ label: 'tight', where: 'Sheet 1', sourceText: '', parameterId: 'p1' }, null);
    expect(pending).toMatch(/Answered from the drawing: <strong>tight<\/strong> \(Sheet 1\) — confirmed by you; it is applied when you press Get cost\./);
    expect(pending).not.toMatch(/checked|<input/);
    expect(questionNoteHtml(null, null)).toBe('');
  });

  it('chips for drawing answers are tagged and reopen the panel — they are not "change" buttons that re-ask the question', () => {
    const html = drawingChipsHtml([{ id: 'material.family', name: 'Material', value: 'Aluminium', parameterId: 'drawing:x' }]);
    expect(html).toMatch(/<span class="dr-chip-tag">from drawing<\/span>/);
    expect(html).toContain('data-dr-open="drawing:x"');
    expect(html).not.toContain('data-change-answer');
    expect(drawingChipsHtml([])).toBe('');
  });

  it('while a drawing is being read, or when it could not be, the panel says so and offers no reading', () => {
    const reading = reviewPanelHtml(buildReviewPanel({ drawing: { ...casting.info, status: 'reading', jobId: 'j1', sheets: [], readings: 0 }, data: null, costing: null, commodity: 'casting', pending: false }));
    expect(reading).toMatch(/Reading the drawing — its sheets have no selectable text, so they are read by OCR on this server, one drawing at a time\./);
    expect(reading).toMatch(/The costing below does not wait for it/);
    expect(reading).not.toContain('data-dr-act="confirm"');
    const failed = reviewPanelHtml(buildReviewPanel({ drawing: { ...casting.info, status: 'failed', error: 'This PDF is password-protected.' }, data: null, costing: null, commodity: 'casting', pending: false }));
    expect(failed).toMatch(/role="alert"><strong>The drawing could not be read\.<\/strong> This PDF is password-protected\. The costing is unaffected/);
  });

  it('a typed correction is a number for a figure, yes / no for a flag, text otherwise — and nothing for an empty box', () => {
    expect(typedValue('gear.teeth', ' 38 ')).toBe(38);
    expect(typedValue('finish.coatingThickness', '12')).toBe(12);
    expect(typedValue('finish.coatingThickness', '8,5')).toBe(8.5);
    expect(typedValue('quality.pressureTight', 'no')).toBe(false);
    expect(typedValue('quality.pressureTight', 'maybe')).toBeNull();
    expect(typedValue('material.designation', ' EN-GJS-500-7 ')).toBe('EN-GJS-500-7');
    expect(typedValue('gear.teeth', 'forty')).toBeNull();
    expect(typedValue('material.designation', '   ')).toBeNull();
    expect(reviewProjectId('ab'.repeat(32), 'cd'.repeat(32), 'u1')).toBe(`dr-${'ab'.repeat(10)}-${'cd'.repeat(10)}-u1`);
  });
});

describe('Get cost follows the review (cad-flow)', () => {
  const blocking = [{ id: 'material.family', severity: 'blocking' as const, question: 'What is it made of?' }];
  it('a changed review is re-run before anything is applied, and before a question it may answer is asked again', () => {
    const base = { hasFile: true, hasAnalysis: true, answers: {}, appliedAnswers: {} };
    expect(nextCostStep({ ...base, decisions: [] })).toEqual({ kind: 'apply' });
    expect(nextCostStep({ ...base, decisions: [], reviewChanged: true })).toEqual({ kind: 'reanalyse' });
    expect(nextCostStep({ ...base, decisions: blocking })).toEqual({ kind: 'answer', missing: blocking });
    expect(nextCostStep({ ...base, decisions: blocking, reviewChanged: true })).toEqual({ kind: 'reanalyse' });
    expect(nextCostStep({ ...base, decisions: blocking, reviewChanged: false })).toEqual({ kind: 'answer', missing: blocking });
  });
});

describe('the reproducibility stamp', () => {
  it('gains the reader version and the drawing\'s name and short hash — and is unchanged without a drawing', () => {
    const date = new Date(Date.UTC(2026, 10, 10));
    const base = { rateBook: 'United Kingdom rate book v2.2.0', rules: 8, kernel: '374f8cebdccb', date };
    const plain = cadStamp(base);
    expect(plain).toBe('United Kingdom rate book v2.2.0 · rules v8 · kernel 374f8cebdccb · 10 Nov 2026');
    expect(cadStamp({ ...base, drawing: null })).toBe(plain);
    expect(cadStamp({ ...base, drawing: '' })).toBe(plain);
    expect(cadStamp({ ...base, drawing: 'drawing reader v1.0.0 · bracket.pdf 3fa2c1d9' }))
      .toBe('United Kingdom rate book v2.2.0 · rules v8 · kernel 374f8cebdccb · drawing reader v1.0.0 · bracket.pdf 3fa2c1d9 · 10 Nov 2026');
  });
});

// ─── Reports ────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('the "Drawing specification" block of the reports', () => {
  const lib = DEFAULT_RATE_LIBRARY;
  const input: UniversalStackInput = {
    partName: 'Casting bracket (test)',
    rawMaterial: { materialId: 'mat-lm25', netWeightKg: 0.86, materialUtilization: 0.6 },
    operations: [{ operationName: 'Gravity die casting', machineId: lib.machines[0].id, labourId: lib.labour[0].id, cycleTimeHr: 0.02, partsPerCycle: 1, oee: 0.8, manning: 1, labourTimeHr: 0.02, labourEfficiency: 0.9 }],
    tooling: { totalToolingCost: 40_000, amortizationVolume: 250_000, mode: 'amortized' },
    packagingPerPart: 0.1, logisticsPerPart: 0.2, overheadPct: 0.12, marginPct: 0.08, annualVolume: 50_000, programmeYears: 5,
  } as UniversalStackInput;
  const result = computeUniversalStack(input, lib);
  const STAMP = cadStamp({ rateBook: 'United Kingdom rate book v2.2.0', rules: 8, kernel: '374f8cebdccb', date: new Date(Date.UTC(2026, 10, 10)), drawing: 'drawing reader v1.0.0 · real-casting-bracket.pdf ab12cd34' });

  function specFor(l: Loaded, ops: ReviewOp[], hand: Record<string, unknown> = {}) {
    const v = view(l, ops, hand);
    return buildDrawingSpecReport({ info: l.info, data: v.data, costing: v.costing, commodity: l.commodity })!;
  }
  /** The engineer confirms what answers a question, round by round (the finish opens once the family is settled). */
  function confirmOffered(l: Loaded, also: string[] = []): ReviewOp[] {
    const ops: ReviewOp[] = [];
    for (let i = 0; i < 5; i++) {
      const ids = [...new Set(view(l, ops).costing.leanings.map(x => x.parameterId))].filter(id => !ops.some(o => 'id' in o && o.id === id));
      if (!ids.length) break;
      ops.push(...ids.map(confirmOp));
    }
    ops.push(...view(l, ops).data.parameters.filter(p => also.includes(p.name) && p.status === 'extracted').map(p => confirmOp(p.id)));
    return ops;
  }
  function pagesOf(draw: () => void): string {
    const api = (jsPDF as unknown as { API: Record<string, unknown> }).API;
    const origSave = api.save;
    const pages: string[] = [];
    api.save = function (this: jsPDF) {
      const d = this as unknown as { internal: { pages: string[][] } };
      for (const pg of d.internal.pages.slice(1)) pages.push((pg ?? []).join('\n').replace(/\\([()\\])/g, '$1').replace(/\u0097/g, '—').replace(/\u0096/g, '–'));
      return this;
    };
    try { draw(); } finally { api.save = origSave; }
    return pages.join('\n');
  }

  it('the model: every reading with its source and status, what was used and how, the conflicts, the missing, the not-costed', () => {
    const d = specFor(casting, confirmOffered(casting, ['finish.maskedFeatures']));
    expect(d).toMatchObject({ file: 'real-casting-bracket.pdf', hashShort: 'ab12cd34', readerVersion: casting.ex.readerVersion, sheets: 1, ocrReadings: 0 });
    const fam = d.rows.find(r => r.parameter === 'Material family')!;
    expect(fam).toMatchObject({ group: 'Material', value: 'aluminium', status: 'Confirmed', used: true });
    expect(fam.source).toMatch(/^Interpreted — real-casting-bracket\.pdf · Sheet 1 · zone \w+ · title block · interpreted from "A356-T6" \(exact text\)$/);
    expect(fam.usedText).toMatch(/^Yes — Answers ".*" with /);
    expect(d.rows.find(r => r.parameter === 'Masked features')).toMatchObject({ used: true, status: 'Confirmed' });
    // the reading behind the family was not itself confirmed: listed, not used
    expect(d.rows.find(r => r.parameter === 'Material as written')).toMatchObject({ used: false, status: 'Read' });
    expect(d.rows.find(r => r.parameter === 'Part number')!.usedText).toMatch(/^No — a cross-check/);
    expect(d.usedCount).toBe(d.rows.filter(r => r.used).length);
    expect(d.usedCount).toBe(8);                                                  // 7 answers + the masked features
    expect(d.notCosted.length).toBeGreaterThan(8);
    expect(d.summary).toMatch(/read offline by drawing reader v[\d.]+ — no AI\. \d+ readings; 8 confirmed by the engineer and used in this costing; 0 conflict\(s\) open; \d+ specified but not in the cost model\./);
    // the wrong gear drawing: the open conflict is on the report as OPEN, with both sides
    const g = specFor(wrongGear, []);
    expect(g.conflicts).toEqual([expect.objectContaining({ parameter: 'Number of teeth', sides: '3D model: 38  v  Drawing: 40', suggested: '3D model (38)', open: true })]);
    expect(g.conflicts[0].resolution).toBe('OPEN — not settled; neither value was used');
    expect(g.usedCount).toBe(0);
    // the engineer's own answer over a confirmed reading is reported with both values
    const tol = view(casting).data.parameters.find(p => p.name === 'tolerance.generalClass')!;
    const o = specFor(casting, [confirmOp(tol.id)], { 'service.toleranceClass': 'standard' });
    expect(o.conflicts.find(c => /Drawing \(confirmed\): tight/.test(c.sides))!.resolution).toMatch(/engineer's own answer was used/);
    // no drawing, or one still being read: no block at all
    expect(buildDrawingSpecReport(null)).toBeNull();
    expect(buildDrawingSpecReport({ info: { ...casting.info, status: 'reading' }, data: casting.fresh, costing: view(casting).costing, commodity: 'casting' })).toBeNull();
  });

  it('core PDF and audit pack print it; with no drawing neither mentions one', () => {
    const d = specFor(casting, confirmOffered(casting, ['finish.maskedFeatures']));
    const meta: CADReportMeta = { stamp: STAMP, geometrySource: 'occt', drawingSpec: d };
    const core = pagesOf(() => printPDF(result, input, lib, 'GBP', 1, 'cast_and_machine', null, 'UK', [], meta));
    expect(core).toContain('Drawing specification');
    expect(core).toContain('8 used in this costing');
    expect(core).toMatch(/Material family/);
    expect(core).toMatch(/Specified on the drawing — not in the cost model yet \(\d+\)/);
    expect(core).toContain('drawing reader v1.0.0 · real-casting-bracket.pdf ab12cd34');   // the stamp
    const audit = pagesOf(() => printAuditPackPDF(result, input, lib, 'GBP', 1, 'cast_and_machine', null, 'UK', [], meta));
    expect(audit).toMatch(/§9c — Drawing specification/);
    expect(audit).toMatch(/Readings that answer a costing question, or cross-check the 3D model/);
    expect(audit).toMatch(/Specified on the drawing — not in the cost model yet/);
    // the conflict table on the wrong gear drawing
    const g = pagesOf(() => printAuditPackPDF(result, input, lib, 'GBP', 1, 'gear', null, 'UK', [], { stamp: STAMP, drawingSpec: specFor(wrongGear, []) }));
    expect(g).toMatch(/Conflicts between sources, and how each was settled/);
    expect(g).toMatch(/OPEN — not settled; neither value was used/);
    // no drawing: identical reports to a costing that never had one
    const plainMeta: CADReportMeta = { stamp: STAMP.replace(' · drawing reader v1.0.0 · real-casting-bracket.pdf ab12cd34', ''), geometrySource: 'occt' };
    const noCore = pagesOf(() => printPDF(result, input, lib, 'GBP', 1, 'cast_and_machine', null, 'UK', [], plainMeta));
    const nullCore = pagesOf(() => printPDF(result, input, lib, 'GBP', 1, 'cast_and_machine', null, 'UK', [], { ...plainMeta, drawingSpec: null }));
    expect(noCore).not.toMatch(/Drawing specification|drawing reader/);
    expect(nullCore).toBe(noCore);
    const noAudit = pagesOf(() => printAuditPackPDF(result, input, lib, 'GBP', 1, 'cast_and_machine', null, 'UK', [], plainMeta));
    expect(noAudit).not.toMatch(/§9c|Drawing specification/);
    expect(buildCoreReport({ result, input, library: lib, commodity: 'cast_and_machine', region: 'UK', cadMeta: plainMeta }).drawing).toBeNull();
  }, 60_000);

  it('the workbook gains sheet 10-Drawing with every table — and no such sheet without a drawing', async () => {
    const d = specFor(casting, confirmOffered(casting, ['finish.maskedFeatures']));
    const open = async (cadMeta: Partial<CADReportMeta>, stamp: string) => {
      const blob = await exportToExcelBlob(result, input, lib, 'GBP', 1, null, null, stamp, null, null, 'cast_and_machine', { cadMeta });
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(await blob.arrayBuffer()) as never);
      return wb;
    };
    const wb = await open({ stamp: STAMP, drawingSpec: d }, STAMP);
    const ws = wb.getWorksheet('10-Drawing')!;
    expect(ws).toBeTruthy();
    const rows: string[][] = [];
    ws.eachRow(r => rows.push((r.values as unknown[]).slice(1).map(c => String(c ?? ''))));
    const flat = rows.map(r => r.join(' | '));
    expect(flat.some(f => /^DRAWING SPECIFICATION — the attached drawing, read offline \(no AI\)/.test(f))).toBe(true);
    expect(flat).toEqual(expect.arrayContaining(['Drawing | real-casting-bracket.pdf', 'Short hash | ab12cd34']));
    const head = rows.findIndex(r => r[0] === 'Group' && r[5] === 'Used in the costing');
    expect(head).toBeGreaterThan(0);
    const fam = rows.find(r => r[1] === 'Material family')!;
    expect(fam.slice(0, 6)).toEqual(['Material', 'Material family', 'aluminium', expect.stringMatching(/^Interpreted — real-casting-bracket\.pdf · Sheet 1/), 'Confirmed', 'Yes']);
    expect(rows.filter(r => r[5] === 'Yes')).toHaveLength(d.usedCount);
    expect(flat.some(f => /^SPECIFIED ON THE DRAWING — NOT IN THE COST MODEL YET \(\d+; none is priced\)/.test(f))).toBe(true);
    expect(flat.some(f => /^CONFLICTS BETWEEN SOURCES/.test(f))).toBe(true);
    // the stamp on the summary names the reader and the drawing
    const sum: string[] = [];
    wb.getWorksheet('1-Summary')!.eachRow(r => sum.push((r.values as unknown[]).slice(1).map(c => String(c ?? '')).join(' | ')));
    expect(sum).toContain(`Reproducibility | ${STAMP}`);
    // without a drawing: the same sheets as ever
    const plain = await open({ stamp: 'x' }, 'x');
    expect(plain.getWorksheet('10-Drawing')).toBeUndefined();
    expect(plain.worksheets.map(w => w.name)).toEqual(wb.worksheets.map(w => w.name).filter(n => n !== '10-Drawing'));
  }, 60_000);
});

describe('the gear with its own drawing — nothing to settle', () => {
  it('no conflict, the three gear readings offer answers, and the tooth count is a cross-check both sources agree on', () => {
    const { model } = view(gear);
    expect(model.conflicts).toEqual([]);
    expect(rowsOf(model).filter(r => r.effect.kind === 'would-answer').map(r => r.effect.decisionId).sort()).toEqual(['gear.hardeningRoute', 'gear.helix', 'gear.qualityClass']);
    const teeth = rowsOf(model).find(r => r.name === 'gear.teeth')!;
    // the model's count and the drawing's agree: ONE row, measured, with the drawing named beside it — nothing to confirm
    expect(teeth).toMatchObject({ value: '38', status: 'Read', source: 'CAD', alsoFrom: 'the drawing', canConfirm: false, canCorrect: false, canReject: false });
    expect(teeth.effect.text).toBe('A cross-check of the 3D model: both state the same value.');
  });
});
