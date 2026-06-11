import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import pool from '../db/pool';
import { fetchThreeWayData } from './threeWayController';

// GET /api/export/comparison/:id.xlsx
export async function exportComparisonExcel(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const snapshotRes = await pool.query(
    `SELECT cs.*, p.part_number, s.name AS supplier_name
     FROM comparison_snapshot cs
     JOIN part_master p ON p.id = cs.part_id
     JOIN supplier_quote_header sqh ON sqh.id = cs.supplier_quote_header_id
     JOIN supplier s ON s.id = sqh.supplier_id
     WHERE cs.id = $1`,
    [id]
  );
  if (!snapshotRes.rowCount) { res.status(404).json({ error: 'Not found' }); return; }

  const details = await pool.query(
    `SELECT * FROM comparison_detail WHERE comparison_snapshot_id = $1 ORDER BY sort_order`, [id]
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = 'CostLens';
  wb.created = new Date();

  const ws = wb.addWorksheet('Comparison');

  // Header metadata
  const snap = snapshotRes.rows[0];
  ws.getCell('A1').value = 'CostLens — Should-Cost vs Supplier Quote';
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF4F46E5' } };
  ws.getCell('A2').value = `Part: ${snap.part_number}`;
  ws.getCell('A3').value = `Supplier: ${snap.supplier_name}`;
  ws.getCell('A4').value = `Snapshot: ${snap.snapshot_name ?? '#' + snap.id}`;
  ws.getCell('A5').value = `Generated: ${new Date().toLocaleString()}`;
  ws.addRow([]);

  // Column headers
  const headerRow = ws.addRow([
    'Cost Element', 'Category', 'Should-Cost', 'Quote Price', 'Variance', 'Var %', 'Flag',
  ]);
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
  });

  // Data rows
  for (const d of details.rows) {
    const row = ws.addRow([
      d.cost_element,
      d.category ?? '',
      Number(d.should_cost_value),
      Number(d.quote_value),
      Number(d.variance),
      d.variance_pct ? Number(d.variance_pct) / 100 : 0,
      d.flag ?? '',
    ]);
    const varPct = d.variance_pct ? Number(d.variance_pct) : 0;
    const color = varPct > 10 ? 'FFFEE2E2' : varPct < -10 ? 'FFD1FAE5' : 'FFFFFFFF';
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    });
    // Format numbers
    ['C', 'D', 'E'].forEach((col) => {
      ws.getCell(`${col}${row.number}`).numFmt = '#,##0.0000';
    });
    ws.getCell(`F${row.number}`).numFmt = '0.00%';
  }

  // Totals row
  const totalRow = ws.addRow([
    'TOTAL', '', snap.total_should_cost, snap.total_quote_price, snap.total_variance,
    snap.variance_pct ? snap.variance_pct / 100 : 0, '',
  ]);
  totalRow.eachCell((cell) => { cell.font = { bold: true }; });
  ws.getCell(`F${totalRow.number}`).numFmt = '0.00%';

  // Column widths
  ws.columns = [
    { width: 30 }, { width: 14 }, { width: 14 }, { width: 14 },
    { width: 14 }, { width: 10 }, { width: 12 },
  ];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=comparison-${id}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
}

// GET /api/export/multi-comparison/:id.xlsx
export async function exportMultiComparisonExcel(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const mcRes = await pool.query(
    `SELECT mc.*, p.part_number FROM multi_comparison mc JOIN part_master p ON p.id = mc.part_id WHERE mc.id = $1`, [id]
  );
  if (!mcRes.rowCount) { res.status(404).json({ error: 'Not found' }); return; }

  const entriesRes = await pool.query(
    `SELECT mce.supplier_quote_header_id, s.name AS supplier_name, sqh.total_price, sqh.version
     FROM multi_comparison_entry mce
     JOIN supplier_quote_header sqh ON sqh.id = mce.supplier_quote_header_id
     JOIN supplier s ON s.id = sqh.supplier_id
     WHERE mce.multi_comparison_id = $1 ORDER BY mce.rank NULLS LAST`,
    [id]
  );

  const scBd = await pool.query(
    `SELECT cost_element, value FROM should_cost_breakdown
     WHERE should_cost_header_id=$1 ORDER BY sort_order`,
    [mcRes.rows[0].should_cost_header_id]
  );

  const quoteIds = entriesRes.rows.map((e) => e.supplier_quote_header_id);
  const qbRes = quoteIds.length
    ? await pool.query(
        `SELECT supplier_quote_header_id, cost_element, value FROM supplier_quote_breakdown
         WHERE supplier_quote_header_id = ANY($1)`,
        [quoteIds]
      )
    : { rows: [] };

  const qMap = new Map<number, Map<string, number>>();
  for (const r of qbRes.rows) {
    if (!qMap.has(r.supplier_quote_header_id)) qMap.set(r.supplier_quote_header_id, new Map());
    qMap.get(r.supplier_quote_header_id)!.set(r.cost_element, Number(r.value));
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'CostLens';
  const ws = wb.addWorksheet('Multi-Supplier');

  const supplierNames = entriesRes.rows.map((e) => `${e.supplier_name} v${e.version}`);
  const headerRow = ws.addRow(['Cost Element', 'Should-Cost', ...supplierNames]);
  headerRow.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    c.font = { color: { argb: 'FFFFFFFF' }, bold: true };
  });

  for (const scRow of scBd.rows) {
    const scVal = Number(scRow.value);
    const quoteVals = entriesRes.rows.map((e) =>
      qMap.get(e.supplier_quote_header_id)?.get(scRow.cost_element) ?? 0
    );
    const row = ws.addRow([scRow.cost_element, scVal, ...quoteVals]);
    row.eachCell((cell, col) => {
      if (col > 2) {
        const qv = quoteVals[col - 3];
        const pct = scVal !== 0 ? ((qv - scVal) / scVal) * 100 : 0;
        const color = pct > 10 ? 'FFFEE2E2' : pct < -5 ? 'FFD1FAE5' : 'FFFFFFFF';
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
        cell.numFmt = '#,##0.0000';
      }
    });
  }

  ws.columns = [{ width: 30 }, { width: 14 }, ...entriesRes.rows.map(() => ({ width: 18 }))];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=multi-comparison-${id}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
}

// ─────────────────────────────────────────────────────────────────────────────
// Three-Way Excel export  — GET /api/export/three-way/:partId.xlsx
// ─────────────────────────────────────────────────────────────────────────────
const ACCENT   = 'FF1D4ED8';  // deep blue
const ACCENT2  = 'FF0891B2';  // cyan
const DANGER   = 'FFDC2626';
const SUCCESS  = 'FF16A34A';
const WARN_CLR = 'FFD97706';
const WHITE    = 'FFFFFFFF';
const LIGHT_BG = 'FFF4F6FA';
const HEAD_BG  = 'FF0E1C2E';

function headerStyle(cell: ExcelJS.Cell) {
  cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_BG } };
  cell.font   = { bold: true, color: { argb: WHITE }, size: 10 };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
}

export async function exportThreeWayExcel(req: Request, res: Response): Promise<void> {
  const partId = Number(req.params.partId);
  if (isNaN(partId)) { res.status(400).json({ error: 'Invalid partId' }); return; }

  const d = await fetchThreeWayData(partId);
  if (!d) { res.status(404).json({ error: 'Part not found' }); return; }

  const sym = ({ GBP: '£', USD: '$', EUR: '€', INR: '₹' } as Record<string, string>)[d.currency ?? 'GBP'] ?? '£';
  const an  = d.analysis;
  const suppliers = d.supplierQuotes ?? [];

  const wb = new ExcelJS.Workbook();
  wb.creator = 'CostLens';
  wb.created = new Date();

  // ── Sheet 1: Summary ──────────────────────────────────────────────────────
  const ws1 = wb.addWorksheet('Summary');
  ws1.getCell('A1').value = 'CostLens — Three-Way Cost Analysis';
  ws1.getCell('A1').font  = { bold: true, size: 16, color: { argb: ACCENT } };
  ws1.getCell('A2').value = `Part: ${d.part.part_number}  |  ${d.part.description}`;
  ws1.getCell('A3').value = `Program: ${d.part.program?.code ?? '—'}  |  System: ${d.part.system_name ?? '—'}  |  Commodity: ${d.part.commodity ?? '—'}`;
  ws1.getCell('A4').value = `Exported: ${new Date().toLocaleString('en-GB')}`;
  ws1.addRow([]);

  const kpis = [
    ['KPI', 'Value', 'vs Should-Cost'],
    ['Should-Cost (published)',       `${sym}${an.totals.sc.toFixed(2)}`,   '—'],
    ['Current Live Price',            `${sym}${an.totals.cp.toFixed(2)}`,   `+${an.totals.cp_vs_sc.delta.toFixed(2)} (${an.totals.cp_vs_sc.pct > 0 ? '+' : ''}${an.totals.cp_vs_sc.pct.toFixed(1)}%)`],
    ['Best New Supplier Quote',       an.totals.best_quote > 0 ? `${sym}${an.totals.best_quote.toFixed(2)}` : '—', an.totals.best_vs_sc.delta !== 0 ? `${an.totals.best_vs_sc.delta > 0 ? '+' : ''}${an.totals.best_vs_sc.delta.toFixed(2)} (${an.totals.best_vs_sc.pct.toFixed(1)}%)` : '—'],
    ['Potential Saving vs Current',   an.totals.best_vs_cp.delta < 0 ? `${sym}${Math.abs(an.totals.best_vs_cp.delta).toFixed(2)}` : '—', ''],
    ['Annual Volume (units)',         d.annualVolume > 0 ? d.annualVolume.toLocaleString('en-GB') : '—', ''],
    ['Total Annual Opportunity',      an.negotiationSummary.total_annual_opportunity != null ? `${sym}${an.negotiationSummary.total_annual_opportunity.toLocaleString('en-GB')}` : '—', ''],
  ];
  for (const [i, row] of kpis.entries()) {
    const r = ws1.addRow(row);
    if (i === 0) r.eachCell(headerStyle);
    else {
      r.getCell(1).font = { bold: true };
      r.getCell(2).font = { bold: true, color: { argb: ACCENT } };
      r.getCell(3).font = { color: { argb: WARN_CLR } };
    }
  }
  ws1.columns = [{ width: 32 }, { width: 24 }, { width: 28 }];
  ws1.addRow([]);
  ws1.getCell(`A${ws1.rowCount + 1}`).value = an.negotiationSummary.headline;
  ws1.getCell(`A${ws1.rowCount}`).font = { bold: true, italic: true, color: { argb: DANGER } };

  // ── Sheet 2: Cost Breakup ─────────────────────────────────────────────────
  const ws2 = wb.addWorksheet('Cost Breakup');
  const colHeaders = ['Category', 'Cost Element', `SC ${sym}`, `Current ${sym}`, 'Δ CP vs SC', 'Δ %',
    ...suppliers.map(s => `${s.supplier_name} ${sym}`), `Best Quote ${sym}`, 'Best Supplier'];
  const hRow = ws2.addRow(colHeaders);
  hRow.eachCell(headerStyle);

  const CAT_ORDER = ['RAW_MATERIAL','BOP','MANUFACTURING','OVERHEAD','LOGISTICS','TOOLING','PROFIT','UNCATEGORIZED'];
  const CAT_LABEL: Record<string,string> = { RAW_MATERIAL:'Raw Material', BOP:'Bought-Out Parts', MANUFACTURING:'Manufacturing', OVERHEAD:'Overhead & SGA', LOGISTICS:'Logistics', TOOLING:'Tooling', PROFIT:'Profit & Margin', UNCATEGORIZED:'Other' };

  for (const cat of CAT_ORDER) {
    const elems = d.rows.filter(r => r.category === cat);
    if (elems.length === 0) continue;

    // Category summary row
    const scSum  = elems.reduce((s, r) => s + r.sc_value, 0);
    const cpSum  = elems.reduce((s, r) => s + r.cp_value, 0);
    const delta  = cpSum - scSum;
    const deltaPct = scSum > 0 ? (delta / scSum) * 100 : 0;
    const supSums  = suppliers.map(s => elems.reduce((acc, r) => acc + (r.quotes.find(q => q.supplier_name === s.supplier_name)?.value ?? 0), 0));
    const bestSum  = elems.reduce((s, r) => s + r.best_quote_value, 0);
    const catBg: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BG } };

    const sumRow = ws2.addRow([CAT_LABEL[cat] ?? cat, `(${elems.length} elements)`, scSum, cpSum, delta, deltaPct / 100, ...supSums, bestSum, '']);
    sumRow.eachCell(c => { c.fill = catBg; c.font = { bold: true }; });
    [3,4,5,...Array.from({length: suppliers.length + 1}, (_,i) => 7 + i)].forEach(col => {
      ws2.getCell(`${String.fromCharCode(64+col)}${sumRow.number}`).numFmt = `"${sym}"#,##0.00`;
    });
    ws2.getCell(`F${sumRow.number}`).numFmt = '0.0%';
    if (deltaPct > 15) sumRow.getCell(5).font = { bold: true, color: { argb: DANGER } };

    // Detail element rows
    for (const el of elems) {
      const elDelta = el.cp_value - el.sc_value;
      const elPct   = el.sc_value > 0 ? (elDelta / el.sc_value) * 100 : 0;
      const qVals   = suppliers.map(s => el.quotes.find(q => q.supplier_name === s.supplier_name)?.value ?? 0);
      const row = ws2.addRow(['', el.cost_element, el.sc_value, el.cp_value, elDelta, elPct / 100, ...qVals, el.best_quote_value, el.best_supplier]);
      [3,4,5,...Array.from({length: suppliers.length + 1}, (_,i) => 7 + i)].forEach(col => {
        ws2.getCell(`${String.fromCharCode(64+col)}${row.number}`).numFmt = `"${sym}"#,##0.0000`;
      });
      ws2.getCell(`F${row.number}`).numFmt = '0.0%';
      if (elPct > 15) row.getCell(5).font = { color: { argb: DANGER } };
    }
  }

  // Totals row
  const totRow = ws2.addRow(['TOTAL / UNIT', '', an.totals.sc, an.totals.cp,
    an.totals.cp_vs_sc.delta, an.totals.cp_vs_sc.pct / 100,
    ...suppliers.map(s => s.total_price), an.totals.best_quote > 0 ? an.totals.best_quote : '', '']);
  totRow.eachCell(c => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }; });
  ws2.getCell(`F${totRow.number}`).numFmt = '0.0%';
  ws2.columns = [{ width: 20 }, { width: 32 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 10 },
    ...suppliers.map(() => ({ width: 20 })), { width: 14 }, { width: 22 }];
  ws2.getRow(1).height = 20;

  // ── Sheet 3: AI Negotiation Brief ─────────────────────────────────────────
  const ws3 = wb.addWorksheet('AI Negotiation Brief');
  ws3.getCell('A1').value = 'AI Negotiation Brief — ' + d.part.part_number;
  ws3.getCell('A1').font  = { bold: true, size: 14, color: { argb: ACCENT } };
  ws3.getCell('A2').value = an.negotiationSummary.headline;
  ws3.getCell('A2').font  = { bold: true, italic: true, color: { argb: DANGER } };
  ws3.addRow([]);

  const briefHdr = ws3.addRow(['Priority', 'Category', `Gap/Unit ${sym}`, 'Gap %', `Annual Opp ${sym}`, 'Action / Guidance', 'Element', `SC ${sym}`, `Current ${sym}`, `Gap ${sym}`, 'Talking Point']);
  briefHdr.eachCell(headerStyle);

  for (const topic of an.negotiationBrief) {
    const topRow = ws3.addRow([
      topic.priority.toUpperCase(), topic.label,
      topic.gap, topic.gap_pct / 100,
      topic.annual_impact ?? '',
      topic.action, '', '', '', '', '',
    ]);
    topRow.eachCell(c => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: topic.priority === 'high' ? 'FFFEE2E2' : topic.priority === 'medium' ? 'FFFEF3C7' : 'FFF0FDF4' } }; });
    ws3.getCell(`D${topRow.number}`).numFmt = '0.0%';
    ws3.getCell(`C${topRow.number}`).numFmt = `"${sym}"#,##0.00`;
    ws3.getCell(`E${topRow.number}`).numFmt = `"${sym}"#,##0`;

    for (const dp of topic.detail_points) {
      const dpRow = ws3.addRow(['', '', '', '', '', '', dp.cost_element, dp.sc, dp.cp, dp.gap, dp.talking_point]);
      ws3.getCell(`H${dpRow.number}`).numFmt = `"${sym}"#,##0.0000`;
      ws3.getCell(`I${dpRow.number}`).numFmt = `"${sym}"#,##0.0000`;
      ws3.getCell(`J${dpRow.number}`).numFmt = `"${sym}"#,##0.0000`;
      dpRow.getCell(7).font = { italic: true, color: { argb: '555555' } } as ExcelJS.Font;
    }
  }
  ws3.columns = [{ width: 10 }, { width: 22 }, { width: 14 }, { width: 10 }, { width: 16 }, { width: 50 }, { width: 30 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 60 }];

  // ── Sheet 4: AI Insights ──────────────────────────────────────────────────
  const ws4 = wb.addWorksheet('AI Insights');
  ws4.getCell('A1').value = 'AI Cost Driver Analysis — ' + d.part.part_number;
  ws4.getCell('A1').font  = { bold: true, size: 14, color: { argb: ACCENT } };
  ws4.addRow([]);

  ws4.getCell('A3').value = 'Top Cost Drivers'; ws4.getCell('A3').font = { bold: true, size: 12 };
  ws4.addRow(['Element', 'Category', `SC Value ${sym}`, '% of Total']);
  ws4.getRow(4).eachCell(headerStyle);
  for (const d2 of an.topCostDrivers) {
    ws4.addRow([d2.cost_element, d2.category, d2.sc_value, d2.pct_of_total / 100]);
    ws4.getCell(`C${ws4.rowCount}`).numFmt = `"${sym}"#,##0.0000`;
    ws4.getCell(`D${ws4.rowCount}`).numFmt = '0.0%';
  }
  ws4.addRow([]);

  ws4.getCell(`A${ws4.rowCount + 1}`).value = 'Biggest Overpayments'; ws4.getCell(`A${ws4.rowCount}`).font = { bold: true, size: 12 };
  ws4.addRow(['Element', 'Category', `Current ${sym}`, `SC ${sym}`, `Overpay ${sym}`, 'Overpay %']);
  ws4.getRow(ws4.rowCount).eachCell(headerStyle);
  for (const d2 of an.biggestOverpayments) {
    ws4.addRow([d2.cost_element, d2.category, d2.cp_value, d2.sc_value, d2.delta, d2.pct / 100]);
    ws4.getCell(`C${ws4.rowCount}`).numFmt = `"${sym}"#,##0.0000`;
    ws4.getCell(`D${ws4.rowCount}`).numFmt = `"${sym}"#,##0.0000`;
    ws4.getCell(`E${ws4.rowCount}`).numFmt = `"${sym}"#,##0.0000`;
    ws4.getCell(`F${ws4.rowCount}`).numFmt = '0.0%';
  }
  ws4.addRow([]);

  ws4.getCell(`A${ws4.rowCount + 1}`).value = 'AI Recommendations'; ws4.getCell(`A${ws4.rowCount}`).font = { bold: true, size: 12 };
  for (const [i, rec] of an.recommendations.entries()) {
    ws4.addRow([`${i + 1}.`, rec]);
    ws4.getCell(`B${ws4.rowCount}`).alignment = { wrapText: true };
  }
  ws4.columns = [{ width: 4 }, { width: 80 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 12 }];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=three-way-${d.part.part_number}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
}

// ─────────────────────────────────────────────────────────────────────────────
// Three-Way PowerPoint export  — GET /api/export/three-way/:partId.pptx
// ─────────────────────────────────────────────────────────────────────────────
export async function exportThreeWayPptx(req: Request, res: Response): Promise<void> {
  const partId = Number(req.params.partId);
  if (isNaN(partId)) { res.status(400).json({ error: 'Invalid partId' }); return; }

  const d = await fetchThreeWayData(partId);
  if (!d) { res.status(404).json({ error: 'Part not found' }); return; }

  const sym = ({ GBP: '£', USD: '$', EUR: '€', INR: '₹' } as Record<string, string>)[d.currency ?? 'GBP'] ?? '£';
  const an  = d.analysis;
  const suppliers = d.supplierQuotes ?? [];

  const pptx = new PptxGenJS();
  pptx.layout  = 'LAYOUT_WIDE';
  pptx.author  = 'CostLens';
  pptx.company = 'CostLens — Automotive Cost Engineering Platform';
  pptx.subject = `Three-Way Analysis: ${d.part.part_number}`;
  pptx.title   = `CostLens | ${d.part.part_number} Three-Way Cost Analysis`;

  const NAVY  = '0E1C2E';
  const BLUE  = '1D4ED8';
  const CYAN  = '0891B2';
  const RED   = 'DC2626';
  const GREEN = '16A34A';
  const AMBER = 'D97706';
  const LGRAY = 'F4F6FA';
  const MID   = '64748B';

  // ── Slide 1: Title ────────────────────────────────────────────────────────
  const s1 = pptx.addSlide();
  s1.background = { color: NAVY };
  s1.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.08, fill: { color: BLUE } });
  s1.addText('COSTLENS', { x: 0.5, y: 0.3, w: 4, h: 0.4, color: CYAN, fontSize: 12, bold: true, charSpacing: 4 });
  s1.addText('Three-Way Cost Analysis', { x: 0.5, y: 1.0, w: 12, h: 1.0, color: 'FFFFFF', fontSize: 36, bold: true });
  s1.addText(d.part.part_number, { x: 0.5, y: 2.1, w: 12, h: 0.6, color: CYAN, fontSize: 26, bold: true });
  s1.addText(d.part.description, { x: 0.5, y: 2.75, w: 12, h: 0.5, color: 'CBD5E1', fontSize: 15 });
  const meta = [d.part.program ? `Program: ${d.part.program.code} – ${d.part.program.name}` : '', d.part.system_name ? `System: ${d.part.system_name}` : '', d.part.commodity ? `Commodity: ${d.part.commodity}` : ''].filter(Boolean).join('   ·   ');
  s1.addText(meta, { x: 0.5, y: 3.35, w: 12, h: 0.4, color: '94A3B8', fontSize: 11 });
  s1.addText(`Generated ${new Date().toLocaleDateString('en-GB')}`, { x: 0.5, y: 6.8, w: 12, h: 0.3, color: '475569', fontSize: 10 });

  // ── Slide 2: KPI Summary ──────────────────────────────────────────────────
  const s2 = pptx.addSlide();
  s2.background = { color: LGRAY };
  s2.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.55, fill: { color: NAVY } });
  s2.addText('Cost Summary', { x: 0.4, y: 0.1, w: 10, h: 0.35, color: 'FFFFFF', fontSize: 16, bold: true });
  s2.addText(d.part.part_number, { x: 11, y: 0.1, w: 2.5, h: 0.35, color: CYAN, fontSize: 14, bold: true, align: 'right' });

  const kpis = [
    { label: 'SHOULD COST',       val: `${sym}${an.totals.sc.toFixed(2)}`,           sub: 'Published model',              color: BLUE  },
    { label: 'CURRENT LIVE PRICE',val: `${sym}${an.totals.cp.toFixed(2)}`,           sub: `+${an.totals.cp_vs_sc.pct.toFixed(1)}% vs SC`, color: an.totals.cp_vs_sc.pct > 15 ? RED : AMBER },
    { label: 'BEST NEW QUOTE',    val: an.totals.best_quote > 0 ? `${sym}${an.totals.best_quote.toFixed(2)}` : '—', sub: `${an.totals.best_vs_cp.pct.toFixed(1)}% vs current`, color: an.totals.best_vs_cp.pct < -5 ? GREEN : MID },
    { label: 'ANNUAL OPPORTUNITY',val: an.negotiationSummary.total_annual_opportunity != null ? `${sym}${Math.round(an.negotiationSummary.total_annual_opportunity).toLocaleString('en-GB')}` : '—', sub: `at ${d.annualVolume.toLocaleString('en-GB')} units/yr`, color: RED },
  ];
  kpis.forEach((k, i) => {
    const x = 0.3 + i * 3.3;
    s2.addShape(pptx.ShapeType.rect, { x, y: 0.75, w: 3.1, h: 1.8, fill: { color: 'FFFFFF' }, line: { color: 'E2E8F0', width: 1 } });
    s2.addText(k.label, { x, y: 0.85, w: 3.1, h: 0.3, color: MID, fontSize: 8, bold: true, charSpacing: 1, align: 'center' });
    s2.addText(k.val,   { x, y: 1.15, w: 3.1, h: 0.9, color: k.color, fontSize: 26, bold: true, align: 'center' });
    s2.addText(k.sub,   { x, y: 2.1,  w: 3.1, h: 0.35, color: MID, fontSize: 10, align: 'center' });
  });

  s2.addShape(pptx.ShapeType.rect, { x: 0.3, y: 2.75, w: 13.1, h: 0.55, fill: { color: BLUE } });
  s2.addText(an.negotiationSummary.headline, { x: 0.5, y: 2.8, w: 12.7, h: 0.45, color: 'FFFFFF', fontSize: 11, bold: true, align: 'center' });

  // Category breakdown table
  s2.addText('Category Breakdown', { x: 0.3, y: 3.5, w: 6, h: 0.35, color: NAVY, fontSize: 12, bold: true });
  const catRows: PptxGenJS.TableRow[] = [
    [
      { text: 'Category',      options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
      { text: `SC ${sym}`,     options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'right' } },
      { text: `Current ${sym}`,options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'right' } },
      { text: 'Gap %',         options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'right' } },
      { text: `Best ${sym}`,   options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'right' } },
    ],
    ...an.categoryBreakdown.map(c => {
      const gapPct = c.sc > 0 ? ((c.cp - c.sc) / c.sc) * 100 : 0;
      const gColor = gapPct > 15 ? RED : gapPct > 5 ? AMBER : NAVY;
      return [
        { text: c.label,   options: { bold: true } },
        { text: `${sym}${c.sc.toFixed(2)}`,   options: { align: 'right' as const } },
        { text: `${sym}${c.cp.toFixed(2)}`,   options: { align: 'right' as const, color: gColor } },
        { text: `${gapPct > 0 ? '+' : ''}${gapPct.toFixed(1)}%`, options: { align: 'right' as const, color: gColor } },
        { text: c.best_quote > 0 ? `${sym}${c.best_quote.toFixed(2)}` : '—', options: { align: 'right' as const, color: GREEN } },
      ];
    }),
    [
      { text: 'TOTAL',  options: { bold: true } },
      { text: `${sym}${an.totals.sc.toFixed(2)}`,  options: { bold: true, align: 'right' as const, color: BLUE } },
      { text: `${sym}${an.totals.cp.toFixed(2)}`,  options: { bold: true, align: 'right' as const, color: an.totals.cp_vs_sc.pct > 10 ? RED : NAVY } },
      { text: `+${an.totals.cp_vs_sc.pct.toFixed(1)}%`, options: { bold: true, align: 'right' as const, color: RED } },
      { text: an.totals.best_quote > 0 ? `${sym}${an.totals.best_quote.toFixed(2)}` : '—', options: { bold: true, align: 'right' as const, color: GREEN } },
    ],
  ];
  s2.addTable(catRows, { x: 0.3, y: 3.9, w: 13.1, colW: [3.5, 2.2, 2.2, 2, 2.2], fontSize: 10, border: { type: 'solid', color: 'E2E8F0', pt: 0.5 }, rowH: 0.3 });

  // ── Slide 3: Detailed Cost Breakup ────────────────────────────────────────
  const s3 = pptx.addSlide();
  s3.background = { color: LGRAY };
  s3.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.55, fill: { color: NAVY } });
  s3.addText('Detailed Cost Breakup — All Elements', { x: 0.4, y: 0.1, w: 10, h: 0.35, color: 'FFFFFF', fontSize: 16, bold: true });
  s3.addText(d.part.part_number, { x: 11, y: 0.1, w: 2.5, h: 0.35, color: CYAN, fontSize: 14, bold: true, align: 'right' });

  const supHeaders = suppliers.map(s => ({ text: s.supplier_name.length > 14 ? s.supplier_name.slice(0, 14) + '…' : s.supplier_name, options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'center' as const } }));
  const detailColW = [2.8, 1.6, 1.6, 1.4, ...suppliers.map(() => 1.4), 1.5];
  const totalW = detailColW.reduce((a, b) => a + b, 0);
  const scaleW = 13.1 / totalW;
  const scaledColW = detailColW.map(w => +(w * scaleW).toFixed(2));

  const detailRows: PptxGenJS.TableRow[] = [[
    { text: 'Cost Element', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
    { text: `SC ${sym}`,    options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'right' } },
    { text: `Current ${sym}`, options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'right' } },
    { text: 'Δ %', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'right' } },
    ...supHeaders,
    { text: `Best ${sym}`, options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'right' } },
  ]];

  const CAT_ORDER2 = ['RAW_MATERIAL','BOP','MANUFACTURING','OVERHEAD','LOGISTICS','TOOLING','PROFIT','UNCATEGORIZED'];
  const CAT_LABEL2: Record<string,string> = { RAW_MATERIAL:'Raw Material', BOP:'Bought-Out Parts', MANUFACTURING:'Manufacturing', OVERHEAD:'Overhead & SGA', LOGISTICS:'Logistics', TOOLING:'Tooling', PROFIT:'Profit & Margin', UNCATEGORIZED:'Other' };

  for (const cat of CAT_ORDER2) {
    const elems = d.rows.filter(r => r.category === cat);
    if (elems.length === 0) continue;
    const scSum = elems.reduce((s, r) => s + r.sc_value, 0);
    const cpSum = elems.reduce((s, r) => s + r.cp_value, 0);
    const pct   = scSum > 0 ? ((cpSum - scSum) / scSum) * 100 : 0;
    const supSums = suppliers.map(s => elems.reduce((acc, r) => acc + (r.quotes.find(q => q.supplier_name === s.supplier_name)?.value ?? 0), 0));
    const bestSum = elems.reduce((s, r) => s + r.best_quote_value, 0);

    detailRows.push([
      { text: CAT_LABEL2[cat] ?? cat, options: { bold: true, fill: { color: 'E2E8F0' } } },
      { text: `${sym}${scSum.toFixed(2)}`,  options: { bold: true, fill: { color: 'E2E8F0' }, align: 'right' } },
      { text: `${sym}${cpSum.toFixed(2)}`,  options: { bold: true, fill: { color: 'E2E8F0' }, color: pct > 15 ? RED : NAVY, align: 'right' } },
      { text: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`, options: { bold: true, fill: { color: 'E2E8F0' }, color: pct > 15 ? RED : pct > 5 ? AMBER : NAVY, align: 'right' } },
      ...supSums.map(v => ({ text: `${sym}${v.toFixed(2)}`, options: { bold: true, fill: { color: 'E2E8F0' }, align: 'right' as const } })),
      { text: bestSum > 0 ? `${sym}${bestSum.toFixed(2)}` : '—', options: { bold: true, fill: { color: 'E2E8F0' }, color: GREEN, align: 'right' } },
    ]);

    for (const el of elems.slice(0, 6)) {
      const elPct = el.sc_value > 0 ? ((el.cp_value - el.sc_value) / el.sc_value) * 100 : 0;
      const qVals = suppliers.map(s => el.quotes.find(q => q.supplier_name === s.supplier_name));
      detailRows.push([
        { text: `  ${el.cost_element}`, options: {} },
        { text: el.sc_value > 0 ? `${sym}${el.sc_value.toFixed(2)}` : '—', options: { align: 'right' } },
        { text: el.cp_value > 0 ? `${sym}${el.cp_value.toFixed(2)}` : '—', options: { align: 'right', color: elPct > 15 ? RED : NAVY } },
        { text: elPct !== 0 ? `${elPct > 0 ? '+' : ''}${elPct.toFixed(1)}%` : '—', options: { align: 'right', color: elPct > 15 ? RED : elPct > 5 ? AMBER : NAVY } },
        ...qVals.map(q => ({ text: q ? `${sym}${q.value.toFixed(2)}` : '—', options: { align: 'right' as const, color: q && el.best_supplier === q.supplier_name ? GREEN : NAVY } })),
        { text: el.best_quote_value > 0 ? `${sym}${el.best_quote_value.toFixed(2)}` : '—', options: { align: 'right', color: GREEN } },
      ]);
    }
  }

  detailRows.push([
    { text: 'TOTAL / UNIT', options: { bold: true, fill: { color: 'CBD5E1' } } },
    { text: `${sym}${an.totals.sc.toFixed(2)}`, options: { bold: true, fill: { color: 'CBD5E1' }, align: 'right', color: BLUE } },
    { text: `${sym}${an.totals.cp.toFixed(2)}`, options: { bold: true, fill: { color: 'CBD5E1' }, align: 'right', color: an.totals.cp_vs_sc.pct > 10 ? RED : NAVY } },
    { text: `+${an.totals.cp_vs_sc.pct.toFixed(1)}%`, options: { bold: true, fill: { color: 'CBD5E1' }, align: 'right', color: RED } },
    ...suppliers.map(s => ({ text: `${sym}${s.total_price.toFixed(2)}`, options: { bold: true, fill: { color: 'CBD5E1' }, align: 'right' as const } })),
    { text: an.totals.best_quote > 0 ? `${sym}${an.totals.best_quote.toFixed(2)}` : '—', options: { bold: true, fill: { color: 'CBD5E1' }, align: 'right', color: GREEN } },
  ]);

  s3.addTable(detailRows, { x: 0.3, y: 0.65, w: 13.1, colW: scaledColW, fontSize: 8.5, border: { type: 'solid', color: 'E2E8F0', pt: 0.3 }, rowH: 0.27 });

  // ── Slide 4+: AI Negotiation Brief (one slide per topic) ─────────────────
  for (const [ti, topic] of an.negotiationBrief.slice(0, 7).entries()) {
    const sN = pptx.addSlide();
    sN.background = { color: LGRAY };
    const topColor = topic.priority === 'high' ? RED : topic.priority === 'medium' ? AMBER : GREEN;
    sN.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.55, fill: { color: NAVY } });
    sN.addText(`AI Negotiation Brief — ${ti + 1}/${an.negotiationBrief.length}`, { x: 0.4, y: 0.08, w: 7, h: 0.38, color: 'FFFFFF', fontSize: 13, bold: true });
    sN.addText(d.part.part_number, { x: 11, y: 0.08, w: 2.5, h: 0.38, color: CYAN, fontSize: 13, bold: true, align: 'right' });

    // Category title bar
    sN.addShape(pptx.ShapeType.rect, { x: 0.3, y: 0.65, w: 13.1, h: 0.55, fill: { color: topColor } });
    sN.addText(`${topic.priority.toUpperCase()} PRIORITY  ·  ${topic.label}`, { x: 0.5, y: 0.68, w: 7, h: 0.48, color: 'FFFFFF', fontSize: 14, bold: true });
    sN.addText(`+${sym}${topic.gap.toFixed(2)}/unit  (${topic.gap_pct > 0 ? '+' : ''}${topic.gap_pct.toFixed(0)}%)`, { x: 8.5, y: 0.68, w: 4.5, h: 0.48, color: 'FFFFFF', fontSize: 14, bold: true, align: 'right' });

    // Stats row
    const stats = [
      { label: 'Should Cost',  val: `${sym}${topic.sc.toFixed(2)}`,  color: BLUE },
      { label: 'Current Price', val: `${sym}${topic.cp.toFixed(2)}`, color: topColor },
      { label: 'Gap / Unit',   val: `${sym}${topic.gap.toFixed(2)}`, color: RED },
      { label: 'Annual Opp.',  val: topic.annual_impact != null ? `${sym}${Math.round(topic.annual_impact).toLocaleString('en-GB')}` : '—', color: RED },
    ];
    stats.forEach((st, si) => {
      const x = 0.3 + si * 3.35;
      sN.addShape(pptx.ShapeType.rect, { x, y: 1.3, w: 3.1, h: 0.9, fill: { color: 'FFFFFF' }, line: { color: 'E2E8F0', pt: 1 } });
      sN.addText(st.label, { x, y: 1.35, w: 3.1, h: 0.25, color: MID, fontSize: 8.5, bold: true, align: 'center', charSpacing: 0.5 });
      sN.addText(st.val,   { x, y: 1.6,  w: 3.1, h: 0.55, color: st.color, fontSize: 20, bold: true, align: 'center' });
    });

    // Action guidance
    sN.addShape(pptx.ShapeType.rect, { x: 0.3, y: 2.3, w: 13.1, h: 0.55, fill: { color: 'EFF6FF' }, line: { color: BLUE, pt: 1 } });
    sN.addText(`ACTION:  ${topic.action}`, { x: 0.5, y: 2.33, w: 12.7, h: 0.48, color: BLUE, fontSize: 9.5, bold: false });

    // Talking point cards
    
    sN.addText('Negotiation Talking Points:', { x: 0.3, y: 2.95, w: 8, h: 0.3, color: NAVY, fontSize: 11, bold: true });
    const tpTableRows: PptxGenJS.TableRow[] = [
      [
        { text: 'Cost Element', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
        { text: `SC ${sym}`,    options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'right' } },
        { text: `Current ${sym}`, options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'right' } },
        { text: `Gap ${sym}`,   options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'right' } },
        { text: 'Annual Impact', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'right' } },
        { text: 'Talking Point', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
      ],
      ...topic.detail_points.map(dp => ([
        { text: dp.cost_element, options: { bold: true } },
        { text: `${sym}${dp.sc.toFixed(2)}`,  options: { align: 'right' as const } },
        { text: `${sym}${dp.cp.toFixed(2)}`,  options: { align: 'right' as const, color: RED } },
        { text: `+${sym}${dp.gap.toFixed(2)}`, options: { align: 'right' as const, color: RED, bold: true } },
        { text: dp.annual_impact != null ? `${sym}${Math.round(dp.annual_impact).toLocaleString('en-GB')}` : '—', options: { align: 'right' as const, color: RED } },
        { text: dp.talking_point, options: { fontSize: 8 } },
      ])),
    ];
    sN.addTable(tpTableRows, { x: 0.3, y: 3.3, w: 13.1, colW: [2, 1.2, 1.2, 1.2, 1.5, 6.0], fontSize: 9, border: { type: 'solid', color: 'E2E8F0', pt: 0.3 }, rowH: 0.32 });
  }

  // ── Final slide: Recommendations ─────────────────────────────────────────
  const sLast = pptx.addSlide();
  sLast.background = { color: NAVY };
  sLast.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.55, fill: { color: BLUE } });
  sLast.addText('AI Recommendations', { x: 0.4, y: 0.1, w: 10, h: 0.35, color: 'FFFFFF', fontSize: 16, bold: true });
  an.recommendations.slice(0, 6).forEach((rec, i) => {
    sLast.addShape(pptx.ShapeType.rect, { x: 0.4, y: 0.7 + i * 1.0, w: 12.8, h: 0.85, fill: { color: '1E3A5F' } });
    sLast.addText(`${i + 1}`, { x: 0.55, y: 0.78 + i * 1.0, w: 0.45, h: 0.68, color: CYAN, fontSize: 18, bold: true, align: 'center' });
    sLast.addText(rec, { x: 1.1, y: 0.78 + i * 1.0, w: 11.9, h: 0.68, color: 'CBD5E1', fontSize: 10.5, valign: 'middle' });
  });
  sLast.addText(`CostLens · ${d.part.part_number} · Generated ${new Date().toLocaleDateString('en-GB')}`, { x: 0.4, y: 7.0, w: 12.8, h: 0.3, color: '475569', fontSize: 9, align: 'center' });

  const buf = await pptx.write({ outputType: 'arraybuffer' }) as ArrayBuffer;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  res.setHeader('Content-Disposition', `attachment; filename=three-way-${d.part.part_number}.pptx`);
  res.end(Buffer.from(buf));
}
