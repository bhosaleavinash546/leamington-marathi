import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import pool from '../db/pool';

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
  wb.creator = 'CostIQ';
  wb.created = new Date();

  const ws = wb.addWorksheet('Comparison');

  // Header metadata
  const snap = snapshotRes.rows[0];
  ws.getCell('A1').value = 'CostIQ — Should-Cost vs Supplier Quote';
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
  wb.creator = 'CostIQ';
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
