import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import pool from '../db/pool';

interface AcrRow {
  id: number;
  part_number: string;
  description: string | null;
  supplier_name: string;
  target_year: number;
  base_price: number | null;
  base_year: number | null;
  target_reduction_pct: number;
  target_price: number | null;
  agreed_price: number | null;
  status: string;
  currency: string;
  notes: string | null;
}

// GET /api/export/acr/:id/commitment.xlsx
export async function exportAcrCommitmentExcel(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const acrRes = await pool.query<AcrRow>(
    `SELECT
       at.id,
       p.part_number,
       p.description,
       s.name AS supplier_name,
       at.target_year,
       at.base_price,
       at.base_year,
       at.target_reduction_pct,
       at.target_price,
       at.agreed_price,
       at.status,
       at.currency,
       at.notes
     FROM acr_target at
     JOIN part_master p ON p.id = at.part_id
     JOIN supplier s ON s.id = at.supplier_id
     WHERE at.id = $1`,
    [id]
  );

  if (!acrRes.rowCount) {
    res.status(404).json({ error: 'ACR target not found' });
    return;
  }

  const acr = acrRes.rows[0];

  const computedTargetPrice =
    acr.base_price != null
      ? Number(acr.base_price) * (1 - Number(acr.target_reduction_pct) / 100)
      : null;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'CostLens';
  wb.created = new Date();

  const ws = wb.addWorksheet('ACR Commitment');
  ws.columns = [
    { width: 30 }, { width: 35 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 },
  ];

  const NAVY = 'FF0E1C2E';
  const WHITE = 'FFFFFFFF';
  const LIGHT = 'FFF4F6FA';

  // ── Title block ───────────────────────────────────────────────────────────
  ws.mergeCells('A1:F1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'Annual Cost Reduction Commitment Letter';
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  titleCell.font = { bold: true, size: 16, color: { argb: WHITE } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 32;

  ws.mergeCells('A2:F2');
  const subTitleCell = ws.getCell('A2');
  subTitleCell.value = `CostLens — Automotive Cost Engineering Platform`;
  subTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
  subTitleCell.font = { size: 11, color: { argb: WHITE }, italic: true };
  subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 20;

  ws.addRow([]);

  // ── Part Details ─────────────────────────────────────────────────────────
  const addHeaderRow = (label: string) => {
    ws.mergeCells(`A${ws.rowCount + 1}:F${ws.rowCount + 1}`);
    const r = ws.getRow(ws.rowCount);
    r.getCell(1).value = label;
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    r.getCell(1).font = { bold: true, color: { argb: WHITE }, size: 11 };
    r.height = 18;
  };

  const addDetailRow = (label: string, value: string | number | null, bold = false) => {
    const r = ws.addRow([label, value ?? '—']);
    r.getCell(1).font = { bold: true, color: { argb: '555555' } };
    r.getCell(2).font = bold ? { bold: true } : {};
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
  };

  addHeaderRow('Part Details');
  addDetailRow('Part Number',   acr.part_number);
  addDetailRow('Description',   acr.description ?? '');
  addDetailRow('Supplier',      acr.supplier_name);
  addDetailRow('Year',          acr.target_year);

  ws.addRow([]);
  addHeaderRow('Cost Reduction Commitment');
  addDetailRow('Base Price',              acr.base_price != null ? Number(acr.base_price) : null);
  addDetailRow('Base Year',               acr.base_year ?? '');
  addDetailRow('Target Reduction (%)',    `${Number(acr.target_reduction_pct).toFixed(2)}%`);
  addDetailRow('Target Price',            computedTargetPrice != null ? Number(computedTargetPrice.toFixed(4)) : null, true);
  addDetailRow('Agreed Price (if set)',   acr.agreed_price != null ? Number(acr.agreed_price) : null);
  addDetailRow('Currency',                acr.currency);
  addDetailRow('Status',                  acr.status);
  if (acr.notes) addDetailRow('Notes', acr.notes);

  ws.addRow([]);

  // ── Commitment Text ───────────────────────────────────────────────────────
  ws.mergeCells(`A${ws.rowCount + 1}:F${ws.rowCount + 1}`);
  const commitRow = ws.getRow(ws.rowCount + 1);
  ws.addRow([]);
  const commitTextRow = ws.addRow([
    'Commitment Statement',
  ]);
  commitTextRow.getCell(1).font = { bold: true, size: 11, color: { argb: NAVY.slice(2) } };

  ws.mergeCells(`A${ws.rowCount + 1}:F${ws.rowCount + 3}`);
  const textStartRow = ws.rowCount + 1;
  ws.getRow(textStartRow).height = 60;
  const commitTextCell = ws.getCell(`A${textStartRow}`);
  commitTextCell.value =
    `The above supplier commits to achieve the stated Annual Cost Reduction (ACR) target for the part and year specified above. ` +
    `The supplier agrees that the target price represents the agreed commercial commitment and will be reflected in updated pricing ` +
    `effective from the start of the stated target year. Any agreed deviations must be documented separately in writing.`;
  commitTextCell.alignment = { wrapText: true, vertical: 'top' };
  commitTextCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
  ws.addRow([]);
  ws.addRow([]);
  ws.addRow([]);
  ws.addRow([]);

  // ── Signature Lines ───────────────────────────────────────────────────────
  addHeaderRow('Signatures');
  ws.addRow([]);

  const sigRow1 = ws.addRow(['Supplier Authorised Signatory', '', '', 'Buyer', '', '']);
  sigRow1.getCell(1).font = { bold: true };
  sigRow1.getCell(4).font = { bold: true };

  ws.addRow(['', '', '', '', '', '']);
  ws.addRow(['_________________________________', '', '', '_________________________________', '', '']);
  ws.addRow(['Name:', '', '', 'Name:', '', '']);
  ws.addRow(['Date:', '', '', 'Date:', '', '']);
  ws.addRow(['Company:', acr.supplier_name, '', 'Company:', 'OEM / Buying Entity', '']);

  // Suppress unused variable warning
  void commitRow;

  // ── Send ──────────────────────────────────────────────────────────────────
  const safePart     = acr.part_number.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeSupplier = acr.supplier_name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename     = `acr_commitment_${safePart}_${safeSupplier}_${acr.target_year}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  await wb.xlsx.write(res);
  res.end();
}
