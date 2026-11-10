/**
 * Report reliability fixes (validation run, 10 Nov 2026 — defects D03, D04, D05, D06, D13, D14):
 *  - D06 ONE confidence grade: core page 1, the cost card (it prints the core's grade), the audit pack's cover, executive
 *    page and §7, and the workbook's 0-Executive and 1-Summary all print `costingConfidence` — the audit pack and
 *    1-Summary graded every traced row (`overallConfidence`) and said Low beside a core page 1 that said Medium.
 *  - D03 the DFM "not checked" line says whether a drawing was read; it said "(no drawing is read)" under the drawing's table.
 *  - D13 the threads line says what the drawing states; it said "the CAD model shows no thread" beside M6x1-6H ↧ 12.
 *  - D04 the audit pack's reproducibility stamp wraps; with a drawing suffix it ran off the page.
 *  - D05 drawing symbols are named in the PDF ("depth"), not deleted.
 *  - D14 a section bar's subtitle never overprints its title.
 */
import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { overallConfidence } from '../src/engine/uncertainty.js';
import { buildCoreReport, buildExecutiveSummary, costingConfidence, type CoreReportMeta } from '../src/export/executive-summary.js';
import { printAuditPackPDF, winAnsiSafe, secBar, DRAWING_SYMBOL_WORDS } from '../src/export/pdf.js';
import { exportToExcelBlob } from '../src/export/excel.js';
import type { DrawingSpecReport } from '../src/export/drawing-spec-report.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const lib = DEFAULT_RATE_LIBRARY;

// A machined part whose machinist rate (Low) is shared by eight operations on eight Medium machines: graded on every
// traced ROW it is Low (8 of 18 rows Low), graded on DISTINCT inputs it is Medium (1 of 11) — the shape of D06.
const MACHINES = ['mach-lathe-cnc', 'mach-vmc3', 'mach-vmc5', 'mach-drill', 'mach-grind', 'mach-haas-vf2', 'mach-hmc-400', 'mach-dmg-dmu50'];
const cast: UniversalStackInput = {
  partName: 'Bracket (report reliability)',
  rawMaterial: { materialId: 'mat-al6061', netWeightKg: 0.86, materialUtilization: 0.6, consumablesCostPerPart: 0 },
  operations: MACHINES.map((machineId, i) => ({ operationName: `Machining — operation ${i + 1}`, machineId, labourId: 'lab-uk-skilled',
    cycleTimeHr: 0.03, partsPerCycle: 1, oee: 0.8, manning: 0.5, labourTimeHr: 0.03, labourEfficiency: 0.92 })),
  tooling: { totalToolingCost: 20_000, amortizationVolume: 500_000, mode: 'amortized' },
  packagingPerPart: 0.2, logisticsPerPart: 0, overheadPct: 0.12, marginPct: 0.08,
  annualVolume: 100_000, programmeYears: 5, deliveryTerms: 'EXW',
} as UniversalStackInput;
const res = computeUniversalStack(cast, lib);

const drawing: DrawingSpecReport = {
  file: 'real-casting-bracket.pdf', hashShort: '6f1a98cf', readerVersion: '1.0.0', sheets: 1, ocrReadings: 0,
  summary: 'real-casting-bracket.pdf (1 sheet), read offline', usedCount: 5, conflicts: [], missing: [], skipped: [], warnings: [], notes: [],
  rows: [
    { group: 'Material', parameter: 'Material designation', value: 'A356-T6', source: 'Drawing — real-casting-bracket.pdf · Sheet 1 · zone F7', status: 'Confirmed', used: true, usedText: 'Yes' },
  ],
  notCosted: [
    { parameter: 'Thread', value: 'M6x1-6H ↧ 12', source: 'Drawing — real-casting-bracket.pdf · Sheet 1 · zone C4 · exact text', status: 'Read', why: 'specified on the drawing — not in the cost model yet' },
  ],
};
const longStamp = 'United Kingdom rate book v2.2.0 · built-in · book 9b7aee68 · rules v9 · kernel 67caebef99ba · drawing reader v1.0.0 · real-casting-bracket.pdf 6f1a98cf · 10 Nov 2026';
const meta: CoreReportMeta = { stamp: longStamp, geometrySource: 'occt', uncertainty: { p10: res.total * 0.92, p90: res.total * 1.08, plusMinusPct: 8 } };
/** With a geometric DFM run (no findings, one limit) — the core's §7 "not checked" line is written only then. */
const metaDfm: CoreReportMeta = { ...meta, geometricDFM: { grouped: [], limitations: ['a limit'] } };

/** Every text call the PDF makes: the string(s), position, font size and alignment, with each line's drawn width. */
type TextCall = { s: string; x: number; y: number; size: number; align?: string; width: number; bold: boolean };
function recordText(draw: () => void): TextCall[] {
  // jsPDF builds `text` per document: wrap it as each document is initialised (before pdf.ts hardens it).
  const api = (jsPDF as unknown as { API: { events: Array<[string, (this: jsPDF) => void]>; save: unknown } }).API;
  const origSave = api.save;
  const calls: TextCall[] = [];
  const hook: [string, (this: jsPDF) => void] = ['initialized', function (this: jsPDF) {
    const doc = this as unknown as { text: (...a: unknown[]) => unknown };
    const origText = doc.text.bind(this);
    doc.text = (...args: unknown[]) => {
      const [t, x, y, opt] = args as [unknown, number, number, { align?: string } | undefined];
      const lines = Array.isArray(t) ? t.filter((l): l is string => typeof l === 'string') : typeof t === 'string' ? [t] : [];
      const font = this.getFont();
      lines.forEach((s, k) => calls.push({ s, x, y: y + k * this.getLineHeight() / this.internal.scaleFactor, size: this.getFontSize(), align: opt?.align,
        width: this.getStringUnitWidth(s) * this.getFontSize() / this.internal.scaleFactor, bold: /bold/i.test(font.fontStyle) }));
      return origText(...args);
    };
  }];
  api.events.push(hook);
  api.save = function (this: jsPDF) { return this; };
  try { draw(); } finally { api.events.splice(api.events.indexOf(hook), 1); api.save = origSave; }
  return calls;
}

describe('D06 — one costing, ONE confidence grade in every report', () => {
  const conf = costingConfidence({ result: res, library: lib, commodity: 'machining', cadMeta: meta });
  it('the fixture separates the two definitions (otherwise the test proves nothing)', () => {
    expect(overallConfidence(res)).not.toBe(conf.grade);
  });
  it('core page 1 and the executive summary print it', () => {
    const core = buildCoreReport({ result: res, input: cast, library: lib, commodity: 'machining', region: 'UK', cadMeta: meta });
    expect(core.confidence.grade).toBe(conf.grade);
    expect(core.verdict).toContain(`${conf.grade} confidence`);
    const ex = buildExecutiveSummary({ result: res, input: cast, library: lib, commodity: 'machining', region: 'UK', cadMeta: meta });
    expect(ex.confidence.grade).toBe(conf.grade);
    expect(ex.confidence.reason).toMatch(/distinct inputs/);
  });
  it('the audit pack prints it on the cover, the executive page and §7 — and no other grade', () => {
    const calls = recordText(() => printAuditPackPDF(res, cast, lib, 'GBP', 1, 'machining', null, 'UK', [], meta as never));
    const after = (label: string) => calls[calls.findIndex(c => c.s === label) + 1]?.s;
    expect(after('Model Confidence:')).toBe(conf.grade);
    expect(after('CONFIDENCE')).toBe(conf.grade);
    const all = calls.map(c => c.s).join('\n');
    expect(all).toContain(`Why confidence is ${conf.grade}`);
    expect(all).toContain(`${conf.grade} confidence`);
    const other = (['High', 'Medium', 'Low'] as const).filter(g => g !== conf.grade);
    for (const g of other) expect(all).not.toMatch(new RegExp(`Why confidence is ${g}|Monte-Carlo\\s+·\\s+${g} confidence`));
  });
  it('the workbook prints it on 0-Executive and 1-Summary', async () => {
    const blob = await exportToExcelBlob(res, cast, lib, 'GBP', 1, null, { plusMinusPct: 8, p10: res.total * 0.92, p90: res.total * 1.08, overallConfidence: overallConfidence(res) },
      longStamp, null, null, 'machining', { cadMeta: meta as never });
    const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()));
    const sum = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['1-Summary'], { header: 1 });
    expect(sum.find(r => r[0] === 'Model confidence')?.[1]).toBe(conf.grade);
    const ex = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['0-Executive'], { header: 1 });
    expect(ex.find(r => r[0] === 'Confidence')?.[1]).toBe(conf.grade);
  });
  it('a BLOCKING DFM finding and estimated geometry cap it at Low, with the reason', () => {
    const blocked = costingConfidence({ result: res, library: lib, commodity: 'machining',
      cadMeta: { geometricDFM: { grouped: [{ ruleId: 'machining.access.unreachable', severity: 'blocking', title: 'Undercut', count: 1, recommendation: '' }], limitations: [] } } });
    expect(blocked.grade).toBe('Low');
    expect(blocked.gradeNote).toMatch(/BLOCKING DFM finding \(Undercut/);
    const est = costingConfidence({ result: res, library: lib, cadMeta: { geometrySource: 'text_parsing' } });
    expect(est.grade).toBe('Low');
  });
});

describe('D03 — the DFM "not checked" line says whether a drawing was read', () => {
  it('with a drawing: names it and says the DFM rules do not check its call-outs', () => {
    const core = buildCoreReport({ result: res, input: cast, library: lib, commodity: 'machining', region: 'UK', cadMeta: { ...metaDfm, drawingSpec: drawing } });
    expect(core.dfm.notChecked).not.toMatch(/no drawing is read/);
    expect(core.dfm.notChecked).toMatch(/the drawing real-casting-bracket\.pdf was read \(5 readings confirmed and used/);
    expect(core.dfm.notChecked).toMatch(/1 other limit of the DFM check is listed in the audit pack\.$/);
  });
  it('without a drawing: says none is attached', () => {
    const core = buildCoreReport({ result: res, input: cast, library: lib, commodity: 'machining', region: 'UK', cadMeta: metaDfm });
    expect(core.dfm.notChecked).toMatch(/^Not checked: tolerances, datums and finish call-outs \(no drawing is attached/);
  });
});

describe('D13 — the threads line says what the drawing states', () => {
  it('with a drawing that states a thread', () => {
    const core = buildCoreReport({ result: res, input: cast, library: lib, commodity: 'machining', region: 'UK', cadMeta: { ...meta, drawingSpec: drawing } });
    const ni = core.notIncluded.join('\n');
    expect(ni).not.toMatch(/the CAD model shows no thread/);
    expect(ni).toMatch(/Threads — the drawing states M6x1-6H ↧ 12 \(read off the drawing, not confirmed\); no thread is priced from the drawing/);
  });
  it('a rejected thread, or none, keeps the standing line', () => {
    const rejected = { ...drawing, notCosted: drawing.notCosted.map(n => ({ ...n, status: 'Rejected' as const })) };
    for (const d of [rejected, null]) {
      const core = buildCoreReport({ result: res, input: cast, library: lib, commodity: 'machining', region: 'UK', cadMeta: { ...meta, drawingSpec: d } });
      expect(core.notIncluded.join('\n')).toMatch(/Threads not detected — confirm: the CAD model shows no thread/);
    }
  });
});

describe('D04 — the reproducibility stamp is printed in full inside the page', () => {
  it('every line of it ends inside the right margin', () => {
    const calls = recordText(() => printAuditPackPDF(res, cast, lib, 'GBP', 1, 'machining', null, 'UK', [], { ...meta, drawingSpec: drawing } as never));
    const i = calls.findIndex(c => c.s.startsWith('Reproducibility: '));
    expect(i).toBeGreaterThanOrEqual(0);
    const stampLines = calls.slice(i, i + 3).filter(c => c.x === calls[i].x && c.size === calls[i].size);
    expect(stampLines.map(c => c.s).join(' ')).toContain('10 Nov 2026');
    for (const c of stampLines.filter(c => longStamp.split(' ').some(w => c.s.includes(w)))) expect(c.x + c.width).toBeLessThanOrEqual(210 - 14 + 0.01);
  });
});

describe('D05 — drawing symbols are named in the PDF, kept in the workbook', () => {
  it('depth, counterbore, countersink', () => {
    expect(winAnsiSafe('M6x1-6H ↧ 12')).toBe('M6x1-6H depth 12');
    expect(winAnsiSafe('⌴Ø10 ↧5')).toBe('cbore Ø10 depth 5');
    expect(winAnsiSafe('⌵ Ø12 x 90°')).toBe('csk Ø12 x 90°');
  });
  it('GD&T characteristics and modifiers', () => {
    expect(winAnsiSafe('⌖ Ø0.2 Ⓜ A B')).toBe('position Ø0.2 (MMC) A B');
    expect(winAnsiSafe('⟂ 0.05 A')).toBe('perpendicularity 0.05 A');
    expect(winAnsiSafe('∥ 0.1 B')).toBe('parallelism 0.1 B');
    expect(winAnsiSafe('⌓ 0.3')).toBe('profile of a surface 0.3');
    expect(winAnsiSafe('⏥ 0.02')).toBe('flatness 0.02');
    expect(winAnsiSafe('◎ Ø0.05 A')).toBe('concentricity Ø0.05 A');
    expect(winAnsiSafe('⌯ 0.1 A')).toBe('symmetry 0.1 A');
    expect(winAnsiSafe('0.1Ⓛ')).toBe('0.1 (LMC)');
    expect(winAnsiSafe('⌀12 H7')).toBe('Ø12 H7');
  });
  it('every symbol the drawing reader produces has a word and survives as WinAnsi', () => {
    // the GD&T symbol-font letters the reader maps (server/drawing/symbol-fonts.ts GDT_FONT_MAP)
    for (const ch of '∠⟂⏥⌓○∥⌭↗⌯⌖⌒ⓁⓂØ□Ⓟ℄◎Ⓢ⌰⏤⌴⌵↧⌲⌳') {
      const out = winAnsiSafe(`x ${ch} 1`);
      expect(out, ch).not.toBe('x  1');
      expect(out, ch).toMatch(/^[ -ÿ]+$/);
      if (ch !== 'Ø') expect(DRAWING_SYMBOL_WORDS[ch], ch).toBeTruthy();
    }
  });
});

describe('D14 — a section bar subtitle never overprints its title', () => {
  const draw = (right: string) => recordText(() => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    secBar(doc, 20, '§9b — Route Comparison', right);
  });
  const overlaps = (calls: TextCall[]) => {
    const t = calls.find(c => c.s === '§9b — Route Comparison')!;
    return calls.filter(c => c !== t).some(c => {
      const x0 = c.align === 'right' ? c.x - c.width : c.x;
      return Math.abs(c.y - t.y) < 2 && x0 < t.x + t.width && x0 + c.width > t.x;
    });
  };
  it('the §9b subtitle of the casting audit pack', () => {
    const calls = draw('the same part on every route and process that can make it in its material  ·  reference: Cast and machine — gravity die casting');
    expect(overlaps(calls)).toBe(false);
    expect(calls.map(c => c.s).join(' ')).toContain('gravity die casting');
  });
  it('a short subtitle stays on the bar, right-aligned', () => {
    const calls = draw('Monte-Carlo');
    expect(calls.find(c => c.s === 'Monte-Carlo')?.align).toBe('right');
    expect(overlaps(calls)).toBe(false);
  });
});
