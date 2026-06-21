import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import pool from '../db/pool';

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

// GET /api/export/rfq/:id.xlsx — generate RFQ document from a should-cost
export async function generateRfqExcel(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const headerRes = await pool.query(
      `SELECT sch.*, p.part_number, p.description AS part_description
       FROM should_cost_header sch
       JOIN part_master p ON p.id = sch.part_id
       WHERE sch.id = $1`,
      [id]
    );

    if (!headerRes.rowCount) {
      res.status(404).json({ error: 'Should-cost not found' });
      return;
    }

    const header = headerRes.rows[0] as Record<string, unknown>;

    const breakdownRes = await pool.query(
      `SELECT * FROM should_cost_breakdown WHERE should_cost_header_id = $1 ORDER BY sort_order, id`,
      [id]
    );
    const breakdown = breakdownRes.rows as Array<Record<string, unknown>>;

    const today = new Date();
    const todayStr = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const todayFormatted = formatDate(today);
    const validityDate = addDays(today, 30);
    const validityStr = validityDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    const rfqNumber = `RFQ-${id}-${todayFormatted}`;
    const partNumber = String(header.part_number ?? id);
    const currency = String(header.currency ?? 'USD');
    const annualVolume = Number(header.annual_volume ?? 0);
    const totalCost = Number(header.total_cost ?? 0);

    const grandTotal = totalCost || breakdown.reduce((s, r) => s + Number(r.value ?? 0), 0) || 1;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'CostLens';
    wb.created = today;

    const NAVY  = 'FF1E3A5F';
    const AMBER = 'FFF59E0B';
    const WHITE = 'FFFFFFFF';
    const GRAY  = 'FFF4F6FA';

    // ── Sheet 1: RFQ Header ──────────────────────────────────────────────────
    const wsHeader = wb.addWorksheet('RFQ Header');
    wsHeader.columns = [{ width: 30 }, { width: 50 }];

    const titleRow = wsHeader.addRow(['REQUEST FOR QUOTATION']);
    titleRow.getCell(1).font = { bold: true, size: 18, color: { argb: NAVY } };
    titleRow.height = 28;
    wsHeader.addRow([]);

    const addHeaderRow = (label: string, value: string | number) => {
      const r = wsHeader.addRow([label, value]);
      r.getCell(1).font = { bold: true };
      r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } };
    };

    addHeaderRow('RFQ Number',        rfqNumber);
    addHeaderRow('Date',              todayStr);
    addHeaderRow('Part Number',       partNumber);
    addHeaderRow('Description',       String(header.part_description ?? ''));
    addHeaderRow('Annual Volume',     annualVolume);
    addHeaderRow('Currency',          currency);
    addHeaderRow('Validity Requested', validityStr);
    addHeaderRow('Delivery Terms',    'DDP');
    wsHeader.addRow([]);
    wsHeader.addRow(['Please submit your quotation using the "Supplier Response Template" sheet.']);

    // ── Sheet 2: Should-Cost Breakdown (internal, hidden) ────────────────────
    const wsInternal = wb.addWorksheet('Should-Cost Breakdown');
    (wsInternal as ExcelJS.Worksheet & { state?: string }).state = 'hidden';
    wsInternal.columns = [{ width: 30 }, { width: 16 }, { width: 16 }, { width: 10 }, { width: 40 }];

    wsInternal.addRow(['NOTE: This is an internal reference — do not share sheet name with supplier'])
      .getCell(1).font = { italic: true, color: { argb: 'FFDC2626' } };
    wsInternal.addRow([]);

    const bdHdrRow = wsInternal.addRow(['Cost Element', 'Category', 'Value', '% Total', 'Basis']);
    bdHdrRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      cell.font = { bold: true, color: { argb: WHITE } };
    });

    for (const row of breakdown) {
      const val = Number(row.value ?? 0);
      const pct = grandTotal > 0 ? val / grandTotal : 0;
      const dr = wsInternal.addRow([
        String(row.cost_element ?? ''),
        String(row.category ?? ''),
        val,
        pct,
        String(row.basis ?? ''),
      ]);
      dr.getCell(3).numFmt = '#,##0.0000';
      dr.getCell(4).numFmt = '0.00%';
    }

    const internalTotalRow = wsInternal.addRow(['TOTAL', '', grandTotal, 1, '']);
    internalTotalRow.eachCell((cell) => { cell.font = { bold: true }; });
    internalTotalRow.getCell(3).numFmt = '#,##0.0000';
    internalTotalRow.getCell(4).numFmt = '0.00%';

    // ── Sheet 3: Supplier Response Template ──────────────────────────────────
    const wsSupplier = wb.addWorksheet('Supplier Response Template');
    wsSupplier.columns = [{ width: 30 }, { width: 20 }, { width: 40 }];

    const instrRow = wsSupplier.addRow([
      `Please fill in your quoted value per cost element. Add comments where your process differs from our assumption.`,
    ]);
    instrRow.getCell(1).font = { italic: true };
    instrRow.height = 20;
    wsSupplier.addRow([]);

    const supplierHdrRow = wsSupplier.addRow([
      'Cost Element',
      `Supplier Value (${currency})`,
      'Comments',
    ]);
    supplierHdrRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER } };
      cell.font = { bold: true };
    });

    for (const row of breakdown) {
      wsSupplier.addRow([String(row.cost_element ?? ''), '', '']);
    }

    wsSupplier.addRow([]);
    const supplierTotalRow = wsSupplier.addRow(['TOTAL', '', '']);
    supplierTotalRow.eachCell((cell) => { cell.font = { bold: true }; });

    // ── Sheet 4: Supplier Info ────────────────────────────────────────────────
    const wsInfo = wb.addWorksheet('Supplier Info');
    wsInfo.columns = [{ width: 28 }, { width: 50 }];

    const infoFields = [
      'Supplier Name',
      'Contact',
      'Address',
      'Manufacturing Site',
      'ISO Certification',
      'Lead Time',
      'Payment Terms',
      'Signature',
      'Date',
    ];

    for (const field of infoFields) {
      const r = wsInfo.addRow([field, '']);
      r.getCell(1).font = { bold: true };
      r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } };
    }

    const safePartNumber = partNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `RFQ_${safePartNumber}_${todayFormatted}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[rfqController] generateRfqExcel error:', err);
    res.status(500).json({ error: 'Failed to generate RFQ document' });
  }
}
