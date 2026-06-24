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

// ─────────────────────────────────────────────────────────────────────────────
// Should-Cost Excel Export  — GET /api/export/should-cost/:id.xlsx
// ─────────────────────────────────────────────────────────────────────────────
export async function exportShouldCostExcel(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const headerRes = await pool.query(
    `SELECT sch.*, p.part_number, p.description AS part_description
     FROM should_cost_header sch
     JOIN part_master p ON p.id = sch.part_id
     WHERE sch.id = $1`,
    [id]
  );
  if (!headerRes.rowCount) { res.status(404).json({ error: 'Should-cost not found' }); return; }

  const header = headerRes.rows[0] as Record<string, unknown>;

  const breakdownRes = await pool.query(
    `SELECT scb.*, COALESCE(
       json_agg(json_build_object('name', ssi.name, 'value', ssi.value, 'basis', ssi.basis, 'sort_order', ssi.sort_order)
         ORDER BY ssi.sort_order) FILTER (WHERE ssi.id IS NOT NULL),
       '[]'::json
     ) AS subitems
     FROM should_cost_breakdown scb
     LEFT JOIN should_cost_subitem ssi ON ssi.breakdown_id = scb.id
     WHERE scb.should_cost_header_id = $1
     GROUP BY scb.id
     ORDER BY scb.sort_order, scb.id`,
    [id]
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = 'CostLens';
  wb.created = new Date();

  // ── Sheet 1: Summary ──────────────────────────────────────────────────────
  const wsSummary = wb.addWorksheet('Summary');
  wsSummary.columns = [
    { width: 30 }, { width: 30 }, { width: 20 }, { width: 15 }, { width: 12 }, { width: 10 },
  ];

  const NAVY_BG = 'FF1E3A5F';
  const WHITE_FONT = 'FFFFFFFF';

  const titleRow = wsSummary.addRow(['CostLens — Should-Cost Estimate']);
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: NAVY_BG } };
  wsSummary.addRow([]);

  const addSummaryRow = (label: string, value: unknown) => {
    const r = wsSummary.addRow([label, value]);
    r.getCell(1).font = { bold: true };
  };

  addSummaryRow('Part Number',    String(header.part_number ?? ''));
  addSummaryRow('Description',    String(header.part_description ?? ''));
  addSummaryRow('Version',        Number(header.version ?? 1));
  addSummaryRow('Status',         String(header.status ?? ''));
  addSummaryRow('Total Cost',     Number(header.total_cost ?? 0));
  addSummaryRow('Currency',       String(header.currency ?? 'USD'));
  addSummaryRow('Annual Volume',  Number(header.annual_volume ?? 0));
  wsSummary.addRow([]);

  // Process parameters
  const procParams: Array<[string, unknown]> = [
    ['Part Weight (kg)',    header.part_weight_kg],
    ['Material Code',      header.material_code],
    ['Manufacturing Country', header.manufacturing_country],
    ['Machine Type',       header.machine_type],
    ['Cycle Time (sec)',   header.cycle_time_sec],
    ['Labour Rate ($/hr)', header.labour_rate_hr],
    ['Machine Rate ($/hr)',header.machine_rate_hr],
    ['Scrap Rate (%)',     header.scrap_rate_pct],
    ['Tooling Cost Total', header.tooling_cost_total],
    ['Tooling Life Units', header.tooling_life_units],
  ];

  const procHdrRow = wsSummary.addRow(['Process Parameters', '']);
  procHdrRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BG } };
  procHdrRow.getCell(1).font = { bold: true, color: { argb: WHITE_FONT } };
  procHdrRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BG } };

  for (const [label, value] of procParams) {
    if (value != null) {
      addSummaryRow(label, value);
    }
  }

  wsSummary.getRow(1).height = 20;

  // ── Sheet 2: Breakdown ────────────────────────────────────────────────────
  const wsBd = wb.addWorksheet('Breakdown');
  wsBd.columns = [
    { width: 25 }, { width: 25 }, { width: 20 }, { width: 15 }, { width: 12 }, { width: 10 },
  ];

  const bdHdrRow = wsBd.addRow(['Cost Block', 'Cost Element', 'Cost Driver', 'Basis', 'Value', '% of Total']);
  bdHdrRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BG } };
    cell.font = { color: { argb: WHITE_FONT }, bold: true };
  });
  wsBd.getRow(1).height = 18;
  wsBd.views = [{ state: 'frozen', ySplit: 1 }];

  const grandTotal = Number(header.total_cost ?? 0) || 1; // avoid div-by-zero

  // Group by category
  const categoryOrder = ['material', 'labor', 'labour', 'overhead', 'logistics', 'tooling', 'profit', 'other'];
  const rows = breakdownRes.rows as Array<Record<string, unknown>>;

  // Build a map of category → rows
  const catMap = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const cat = String(row.category ?? 'other').toLowerCase();
    if (!catMap.has(cat)) catMap.set(cat, []);
    catMap.get(cat)!.push(row);
  }

  // Output in order, then any remaining categories not in the order list
  const orderedCats = [
    ...categoryOrder.filter((c) => catMap.has(c)),
    ...[...catMap.keys()].filter((c) => !categoryOrder.includes(c)),
  ];

  for (const cat of orderedCats) {
    const catRows = catMap.get(cat) ?? [];
    let catTotal = 0;

    for (const bdRow of catRows) {
      const value = Number(bdRow.value ?? 0);
      catTotal += value;

      const dataRow = wsBd.addRow([
        String(bdRow.category ?? '').toUpperCase(),
        String(bdRow.cost_element ?? ''),
        '', // cost_driver — not in current schema
        String(bdRow.basis ?? ''),
        value,
        grandTotal > 0 ? value / grandTotal : 0,
      ]);
      dataRow.getCell(5).numFmt = '#,##0.0000';
      dataRow.getCell(6).numFmt = '0.00%';
    }

    // Subtotal row per category
    const subRow = wsBd.addRow([
      `${String(cat).toUpperCase()} SUBTOTAL`, '', '', '', catTotal, grandTotal > 0 ? catTotal / grandTotal : 0,
    ]);
    subRow.eachCell((cell) => { cell.font = { bold: true }; });
    subRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    subRow.getCell(5).numFmt = '#,##0.0000';
    subRow.getCell(6).numFmt = '0.00%';
    wsBd.addRow([]);
  }

  // Grand total
  const grandRow = wsBd.addRow(['GRAND TOTAL', '', '', '', grandTotal, 1]);
  grandRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: NAVY_BG } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1D5DB' } };
  });
  grandRow.getCell(5).numFmt = '#,##0.0000';
  grandRow.getCell(6).numFmt = '0.00%';

  const partNumber = String(header.part_number ?? id).replace(/[^a-zA-Z0-9_-]/g, '_');
  const version = String(header.version ?? '1');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=should_cost_${partNumber}_v${version}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
}

// ─────────────────────────────────────────────────────────────────────────────
// Should-Cost HTML Report (print-to-PDF) — GET /api/export/should-cost/:id/report.html
// ─────────────────────────────────────────────────────────────────────────────
export async function exportShouldCostHtml(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const headerRes = await pool.query(
    `SELECT sch.*, p.part_number, p.description AS part_description
     FROM should_cost_header sch
     JOIN part_master p ON p.id = sch.part_id
     WHERE sch.id = $1`,
    [id]
  );
  if (!headerRes.rowCount) { res.status(404).json({ error: 'Should-cost not found' }); return; }

  const header = headerRes.rows[0] as Record<string, unknown>;

  const breakdownRes = await pool.query(
    `SELECT scb.*
     FROM should_cost_breakdown scb
     WHERE scb.should_cost_header_id = $1
     ORDER BY scb.sort_order, scb.id`,
    [id]
  );

  const bd = breakdownRes.rows as Array<Record<string, unknown>>;
  const grandTotal = Number(header.total_cost ?? 0) || bd.reduce((s, r) => s + Number(r.value ?? 0), 0) || 1;

  // Group breakdown by category
  const catGroups = new Map<string, Array<Record<string, unknown>>>();
  for (const row of bd) {
    const cat = String(row.category ?? 'Other');
    if (!catGroups.has(cat)) catGroups.set(cat, []);
    catGroups.get(cat)!.push(row);
  }

  const bdRowsHtml = [...catGroups.entries()].map(([cat, items]) => {
    const catTotal = items.reduce((s, r) => s + Number(r.value ?? 0), 0);
    const rowsHtml = items.map((r) => {
      const val = Number(r.value ?? 0);
      const pct = grandTotal > 0 ? ((val / grandTotal) * 100).toFixed(1) : '0.0';
      return `<tr>
        <td>${escapeHtml(cat)}</td>
        <td>${escapeHtml(String(r.cost_element ?? ''))}</td>
        <td>${escapeHtml(String(r.basis ?? ''))}</td>
        <td style="text-align:right">${val.toFixed(4)}</td>
        <td style="text-align:right">${pct}%</td>
      </tr>`;
    }).join('');
    const catPct = grandTotal > 0 ? ((catTotal / grandTotal) * 100).toFixed(1) : '0.0';
    const subtotalRow = `<tr class="subtotal">
      <td colspan="3"><strong>${escapeHtml(cat)} Subtotal</strong></td>
      <td style="text-align:right"><strong>${catTotal.toFixed(4)}</strong></td>
      <td style="text-align:right"><strong>${catPct}%</strong></td>
    </tr>`;
    return rowsHtml + subtotalRow;
  }).join('');

  const procParams: Array<[string, unknown]> = [
    ['Part Weight (kg)',    header.part_weight_kg],
    ['Material Code',      header.material_code],
    ['Manufacturing Country', header.manufacturing_country],
    ['Machine Type',       header.machine_type],
    ['Cycle Time (sec)',   header.cycle_time_sec],
    ['Labour Rate ($/hr)', header.labour_rate_hr],
    ['Machine Rate ($/hr)',header.machine_rate_hr],
    ['Scrap Rate (%)',     header.scrap_rate_pct],
    ['Tooling Cost Total', header.tooling_cost_total],
    ['Tooling Life Units', header.tooling_life_units],
  ].filter(([, v]) => v != null) as Array<[string, unknown]>;

  const procParamsHtml = procParams.length > 0 ? `
    <h2>Process Parameters</h2>
    <table>
      <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
      <tbody>
        ${procParams.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(String(value))}</td></tr>`).join('')}
      </tbody>
    </table>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Should-Cost Report — ${escapeHtml(String(header.part_number ?? id))}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1a1a2e; background: #fff; }
    .page { padding: 24px 32px; max-width: 960px; margin: 0 auto; }
    header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e3a5f; padding-bottom: 12px; margin-bottom: 20px; }
    header .logo { font-size: 22pt; font-weight: bold; color: #1e3a5f; letter-spacing: 2px; }
    header .meta { text-align: right; font-size: 9pt; color: #666; }
    h2 { font-size: 12pt; color: #1e3a5f; margin: 20px 0 8px; border-left: 4px solid #1e3a5f; padding-left: 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10pt; }
    th { background: #1e3a5f; color: #fff; padding: 7px 10px; text-align: left; }
    td { padding: 5px 10px; border-bottom: 1px solid #e2e8f0; }
    tr:nth-child(even) { background: #f8fafc; }
    tr.subtotal { background: #e2e8f0 !important; }
    .grand-total { background: #1e3a5f !important; color: #fff; font-weight: bold; }
    .grand-total td { color: #fff; }
    footer { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 10px; font-size: 8pt; color: #999; text-align: center; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    @page { size: A4; margin: 20mm; }
    @media print {
      .page { padding: 0; max-width: 100%; }
      footer { position: fixed; bottom: 0; width: 100%; }
    }
  </style>
</head>
<body>
  <div class="page">
    <header>
      <div class="logo">COSTLENS</div>
      <div class="meta">
        <div><strong>Part:</strong> ${escapeHtml(String(header.part_number ?? ''))}</div>
        <div><strong>Version:</strong> ${escapeHtml(String(header.version ?? '1'))}</div>
        <div><strong>Date:</strong> ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
      </div>
    </header>

    <h2>Summary</h2>
    <table>
      <tbody>
        <tr><td><strong>Status</strong></td><td>${escapeHtml(String(header.status ?? ''))}</td></tr>
        <tr><td><strong>Total Cost</strong></td><td>${Number(header.total_cost ?? grandTotal).toFixed(4)} ${escapeHtml(String(header.currency ?? 'USD'))}</td></tr>
        <tr><td><strong>Currency</strong></td><td>${escapeHtml(String(header.currency ?? 'USD'))}</td></tr>
        <tr><td><strong>Annual Volume</strong></td><td>${Number(header.annual_volume ?? 0).toLocaleString()}</td></tr>
        ${header.notes ? `<tr><td><strong>Notes</strong></td><td>${escapeHtml(String(header.notes))}</td></tr>` : ''}
      </tbody>
    </table>

    ${procParamsHtml}

    <h2>Cost Breakdown</h2>
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th>Cost Element</th>
          <th>Basis</th>
          <th style="text-align:right">Value (${escapeHtml(String(header.currency ?? 'USD'))})</th>
          <th style="text-align:right">% of Total</th>
        </tr>
      </thead>
      <tbody>
        ${bdRowsHtml}
        <tr class="grand-total">
          <td colspan="3"><strong>GRAND TOTAL</strong></td>
          <td style="text-align:right"><strong>${grandTotal.toFixed(4)}</strong></td>
          <td style="text-align:right"><strong>100.0%</strong></td>
        </tr>
      </tbody>
    </table>

    <footer>Confidential — CostLens &nbsp;|&nbsp; ${escapeHtml(String(header.part_number ?? ''))} v${escapeHtml(String(header.version ?? '1'))} &nbsp;|&nbsp; Generated ${new Date().toLocaleString('en-GB')}</footer>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic CSV helper
// ─────────────────────────────────────────────────────────────────────────────
function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined): string => {
    if (v == null) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV — Negotiations  GET /api/export/negotiations.csv
// ─────────────────────────────────────────────────────────────────────────────
export async function exportNegotiationsCsv(req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query(
    `SELECT nt.id, p.part_number, p.description AS part_description,
            s.name AS supplier_name, nt.status, nt.currency,
            nt.should_cost, nt.current_price, nt.target_price, nt.agreed_price,
            ROUND((nt.current_price - nt.target_price)::numeric, 4) AS gap,
            nt.target_date, nt.agreed_at, nt.notes
     FROM negotiation_target nt
     JOIN part_master p ON p.id = nt.part_id
     JOIN supplier    s ON s.id = nt.supplier_id
     ORDER BY nt.status, nt.target_date NULLS LAST`
  );
  const headers = [
    'ID','Part Number','Description','Supplier','Status','Currency',
    'Should Cost','Current Price','Target Price','Agreed Price','Gap',
    'Target Date','Agreed Date','Notes',
  ];
  const data = rows.map((r) => [
    r.id, r.part_number, r.part_description, r.supplier_name, r.status, r.currency,
    r.should_cost, r.current_price, r.target_price, r.agreed_price, r.gap,
    r.target_date, r.agreed_at, r.notes,
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=negotiations-${new Date().toISOString().slice(0,10)}.csv`);
  res.send(toCsv(headers, data));
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV — ACR Targets  GET /api/export/acr.csv
// ─────────────────────────────────────────────────────────────────────────────
export async function exportAcrCsv(req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query(
    `SELECT at.id, p.part_number, p.description AS part_description,
            s.name AS supplier_name, at.target_year, at.currency,
            at.base_price, at.base_year, at.target_reduction_pct, at.target_price,
            at.agreed_price, at.actual_reduction_pct, at.status, at.notes
     FROM acr_target at
     LEFT JOIN part_master p ON p.id = at.part_id
     LEFT JOIN supplier    s ON s.id = at.supplier_id
     ORDER BY at.target_year DESC, p.part_number`
  );
  const headers = [
    'ID','Part Number','Description','Supplier','Target Year','Currency',
    'Base Price','Base Year','Target Reduction %','Target Price',
    'Agreed Price','Actual Reduction %','Status','Notes',
  ];
  const data = rows.map((r) => [
    r.id, r.part_number, r.part_description, r.supplier_name, r.target_year, r.currency,
    r.base_price, r.base_year, r.target_reduction_pct, r.target_price,
    r.agreed_price, r.actual_reduction_pct, r.status, r.notes,
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=acr-targets-${new Date().toISOString().slice(0,10)}.csv`);
  res.send(toCsv(headers, data));
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV — Commodity Prices  GET /api/export/commodity-prices.csv
// ─────────────────────────────────────────────────────────────────────────────
export async function exportCommodityPricesCsv(req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query(
    `SELECT id, material_name, material_code, price_per_unit, unit, currency,
            price_date, source, notes, created_at
     FROM commodity_price
     ORDER BY material_code, price_date DESC`
  );
  const headers = [
    'ID','Material Name','Material Code','Price Per Unit','Unit','Currency',
    'Price Date','Source','Notes','Created At',
  ];
  const data = rows.map((r) => [
    r.id, r.material_name, r.material_code, r.price_per_unit, r.unit, r.currency,
    r.price_date, r.source, r.notes, r.created_at,
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=commodity-prices-${new Date().toISOString().slice(0,10)}.csv`);
  res.send(toCsv(headers, data));
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV — Should-Cost List  GET /api/export/should-costs.csv
// ─────────────────────────────────────────────────────────────────────────────
export async function exportShouldCostListCsv(req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query(
    `SELECT sch.id, p.part_number, p.description AS part_description,
            sch.version, sch.status, sch.total_cost, sch.currency,
            sch.annual_volume, sch.valid_until, sch.created_at
     FROM should_cost_header sch
     JOIN part_master p ON p.id = sch.part_id
     ORDER BY p.part_number, sch.version DESC`
  );
  const headers = [
    'ID','Part Number','Description','Version','Status',
    'Total Cost','Currency','Annual Volume','Valid Until','Created At',
  ];
  const data = rows.map((r) => [
    r.id, r.part_number, r.part_description, r.version, r.status,
    r.total_cost, r.currency, r.annual_volume, r.valid_until, r.created_at,
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=should-costs-${new Date().toISOString().slice(0,10)}.csv`);
  res.send(toCsv(headers, data));
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV — Quotes List  GET /api/export/quotes.csv
// ─────────────────────────────────────────────────────────────────────────────
export async function exportQuotesCsv(req: Request, res: Response): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT sqh.id, p.part_number, p.description AS part_description,
              s.name AS supplier_name, sqh.status, sqh.currency,
              sqh.total_price, sqh.notes, sqh.created_at
       FROM supplier_quote_header sqh
       JOIN part_master p ON p.id = sqh.part_id
       JOIN supplier    s ON s.id = sqh.supplier_id
       ORDER BY sqh.created_at DESC`
    );
    const headers = [
      'ID','Part Number','Description','Supplier','Status','Currency',
      'Total Price','Notes','Created At',
    ];
    const data = rows.map((r) => [
      r.id, r.part_number, r.part_description, r.supplier_name, r.status,
      r.currency, r.total_price, r.notes, r.created_at,
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=quotes-${new Date().toISOString().slice(0,10)}.csv`);
    res.send(toCsv(headers, data));
  } catch (err) {
    const pg = err as { code?: string };
    if (pg.code === '42P01') { res.send(toCsv(['ID'], [])); return; }
    throw err;
  }
}
