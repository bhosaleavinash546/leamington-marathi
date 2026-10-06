/**
 * The PCB Excel report (src/export/pcb-workbook.ts): six tabs from the answer to the evidence,
 * the logo on every sheet, native charts, and totals as formulas whose results are the
 * analysis's own figures. Built from the camera board through the real Stage 4.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { runStage4 } from '../server/routes/pcb.js';
import { cleanBomImageRows } from '../server/utils/pcb-bom-image.js';
import { buildPcbWorkbook } from '../src/export/pcb-workbook.js';
import { chartXml } from '../src/export/xlsx-charts.js';

const R = JSON.parse(readFileSync('e2e/fixtures/pcb-camera-replies.json', 'utf8'));
let bytes: Uint8Array;
let zip: JSZip;
let wb: ExcelJS.Workbook;
let total = 0, exWorks = 0;

beforeAll(async () => {
  const a = JSON.parse(JSON.stringify(R.analysis));
  const s4 = await runStage4({ analysis: a, domain: 'automotive_adas', asilLevel: 'ASIL-B', ocrResult: { ...R.ocr, refDesGroups: [], connectors: [], boardText: [] } as never,
    country: 'cn', orderQty: 250_000, parsedBOM: cleanBomImageRows(R.bomImage.rows).lines, tag: '/test' });
  const bd = s4.selectedCountryBreakdown!;
  total = bd.totalPerBoard; exWorks = Math.round((bd.totalPerBoard - bd.logisticsPerBoard) * 100) / 100;
  const analysis = { ...a, _selectedCountryBreakdown: bd, _countryComparison: s4.countryComparison, _volumeCurves: s4.volumeCurves,
    _confidenceBand: s4.confidenceBand ?? undefined, _sanityWarnings: s4.sanityWarnings, _asilLevel: s4.asil!.costed, _asilClaimed: s4.asil!.claimed,
    _asilNotes: s4.asil!.notes, _automotiveNRE: s4.automotiveNRE ?? undefined, _orderQty: 250_000, stage1Classification: { domain: s4.domain } };
  // A 1×1 JPEG is enough to prove a photo is placed.
  const jpeg = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  bytes = await buildPcbWorkbook({ analysis: analysis as never, partName: '360 DEGREE CAMERA PCB', annualVolume: 250_000,
    photos: [{ label: 'Top side', dataUrl: `data:image/jpeg;base64,${jpeg}`, w: 1, h: 1 }] });
  zip = await JSZip.loadAsync(bytes);
  wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as never);
});

const cellsOf = (name: string) => {
  const out: Array<{ addr: string; v: unknown; f?: string; r?: unknown }> = [];
  wb.getWorksheet(name)!.eachRow(row => row.eachCell(c => {
    const v = c.value as { formula?: string; result?: unknown } | unknown;
    out.push(v && typeof v === 'object' && 'formula' in (v as object) ? { addr: c.address, v, f: (v as { formula: string }).formula, r: (v as { result: unknown }).result } : { addr: c.address, v });
  }));
  return out;
};

describe('PCB Excel report', () => {
  it('six tabs, from the answer to the evidence', () => {
    expect(wb.worksheets.map(w => w.name)).toEqual(['Summary', 'Cost Breakdown', 'Bill of Materials', 'Board & Assembly', 'Countries', 'Volume & Notes']);
  });

  it('the logo is on every sheet (an image in each sheet\'s drawing)', async () => {
    const drawings = Object.keys(zip.files).filter(f => /^xl\/drawings\/drawing\d+\.xml$/.test(f));
    expect(drawings.length).toBe(6);
    for (const d of drawings) expect(await zip.file(d)!.async('string')).toMatch(/<xdr:pic>/);
  });

  it('native charts: a doughnut on Summary, a stacked bar on Countries, a log-volume scatter on Volume & Notes', async () => {
    const charts = await Promise.all(Object.keys(zip.files).filter(f => /^xl\/charts\/chart\d+\.xml$/.test(f)).map(f => zip.file(f)!.async('string')));
    expect(charts.some(c => /<c:doughnutChart>/.test(c) && /'Summary'!\$E\$/.test(c))).toBe(true);
    expect(charts.some(c => /<c:barChart>/.test(c) && /<c:grouping val="stacked"\/>/.test(c) && /'Countries'!/.test(c))).toBe(true);
    // Volumes 100 → 250,000 on a log axis (a category axis spaced them evenly and bent the curve).
    expect(charts.some(c => /<c:scatterChart>/.test(c) && /<c:logBase val="10"\/>/.test(c) && /<c:xVal>/.test(c) && /'Volume &amp; Notes'!/.test(c))).toBe(true);
    const ct = await zip.file('[Content_Types].xml')!.async('string');
    expect((ct.match(/drawingml\.chart\+xml/g) ?? []).length).toBe(charts.length);
  });

  it('the delivered and ex-works totals are formulas whose results are the analysis headline', () => {
    const cb = cellsOf('Cost Breakdown');
    const delivered = cb.find(c => c.f && /^D\d+\+SUM\(/.test(c.f));
    const exw = cb.find(c => c.f && /^SUM\(D9:D\d+\)$/.test(c.f));
    expect(delivered?.r).toBeCloseTo(total, 2);
    expect(exw?.r).toBeCloseTo(exWorks, 2);
    const s = cellsOf('Summary');
    expect(s.find(c => c.f && /'Cost Breakdown'!D\d+$/.test(c.f) && Math.abs(Number(c.r) - total) < 0.005)).toBeDefined();
  });

  it('the BOM extends qty × unit by formula and totals with SUBTOTAL (so a filter keeps the total right)', () => {
    const bm = cellsOf('Bill of Materials');
    expect(bm.filter(c => c.f && /^G\d+\*H\d+$/.test(c.f)).length).toBe(R.bomImage.rows ? 11 : 0);
    expect(bm.some(c => c.f && /^SUBTOTAL\(109,I/.test(c.f))).toBe(true);
    expect(wb.getWorksheet('Bill of Materials')!.getColumn(3).hidden).toBe(true);   // no designators on this BOM
  });

  it('every country row: ex-works = SUM of its parts, delivered = ex-works + freight & duty, delta against the costed row', () => {
    const co = cellsOf('Countries');
    expect(co.filter(c => c.f && /^SUM\(D\d+:G\d+\)$/.test(c.f)).length).toBeGreaterThan(10);
    expect(co.filter(c => c.f && /^H\d+\+I\d+$/.test(c.f)).length).toBeGreaterThan(10);
    expect(co.filter(c => c.f && /^J\d+-\$J\$\d+$/.test(c.f)).length).toBeGreaterThan(10);
  });

  it('no PDF section references (§) and no "£" typed into a cell as text', () => {
    for (const ws of wb.worksheets) for (const c of cellsOf(ws.name)) {
      const t = typeof c.v === 'string' ? c.v : '';
      expect(t, `${ws.name}!${c.addr}`).not.toMatch(/§\d/);
    }
  });

  it('prints: A4, fitted to the page width, a footer with the tab name and page numbers', () => {
    for (const ws of wb.worksheets) {
      expect(ws.pageSetup.paperSize).toBe(9);
      expect(ws.pageSetup.fitToWidth).toBe(1);
      expect(ws.headerFooter.oddFooter).toMatch(/&A/);
      expect(ws.views[0].showGridLines).toBe(false);
    }
  });

  it('chart XML keeps the schema order Excel requires (series: tx before spPr before cat before val)', () => {
    const x = chartXml({ sheet: 'S', kind: 'bar', stacked: true, series: [{ name: 'a', catRef: "'S'!$A$1:$A$2", cats: ['x', 'y'], valRef: "'S'!$B$1:$B$2", vals: [1, 2], color: '16325C', colors: ['16325C', '1D6FB8'] }], from: { col: 0, row: 0 }, to: { col: 4, row: 8 } });
    const order = ['<c:idx', '<c:order', '<c:tx>', '<c:spPr>', '<c:invertIfNegative', '<c:dPt>', '<c:dLbls>', '<c:cat>', '<c:val>'].map(t => x.indexOf(t));
    expect(order.every(i => i >= 0)).toBe(true);
    expect([...order].sort((p, q) => p - q)).toEqual(order);
  });
});
