import * as XLSX from 'xlsx';
import type { PartCostResult } from '../engine/types.js';
import { breakdownPercentages } from '../engine/core.js';

const CURRENCY = '£';
const fmt2 = (n: number) => `${CURRENCY}${n.toFixed(2)}`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export function exportToExcel(result: PartCostResult, filename = 'should-cost.xlsx'): void {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary ──────────────────────────────────────────────────────
  const pcts = breakdownPercentages(result);
  const summaryRows: (string | number)[][] = [
    ['Should-Cost Summary', result.partName, '', ''],
    ['', '', '', ''],
    ['Cost Bucket', 'Amount (£)', '% of Total', ''],
    ['1. Raw Material', result.breakdown.rawMaterial, pcts.rawMaterial / 100, ''],
    ['2. Process (Machine)', result.breakdown.process, pcts.process / 100, ''],
    ['3. Direct Labour', result.breakdown.labour, pcts.labour / 100, ''],
    ['4. Tooling', result.breakdown.tooling, pcts.tooling / 100, ''],
    ['5. Packaging', result.breakdown.packaging, pcts.packaging / 100, ''],
    ['6. Logistics', result.breakdown.logistics, pcts.logistics / 100, ''],
    ['─ Factory Cost', result.factoryCost, result.factoryCost / result.total, ''],
    ['7. Overhead (SG&A)', result.breakdown.overhead, pcts.overhead / 100, ''],
    ['─ Subtotal', result.subtotal, result.subtotal / result.total, ''],
    ['8. Supplier Margin', result.breakdown.margin, pcts.margin / 100, ''],
    ['TOTAL SHOULD COST', result.total, 1.0, ''],
  ];
  if (result.toolingNRE !== undefined) {
    summaryRows.push(['NRE / Tooling (one-time)', result.toolingNRE, '', 'Not in unit cost']);
  }

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // ── Sheet 2: Operations ───────────────────────────────────────────────────
  const opRows: (string | number)[][] = [
    ['Operation', 'Machine Rate (£/hr)', 'Cycle Time (hr)', 'Parts/Cycle', 'OEE', 'Process Cost (£)', 'Labour Rate (£/hr)', 'Labour Cost (£)', 'Total Op Cost (£)'],
  ];
  for (const op of result.operationDetails) {
    opRows.push([
      op.operationName,
      op.machineRateUsed,
      '',
      '',
      '',
      op.processCost,
      op.labourRateUsed,
      op.labourCost,
      op.processCost + op.labourCost,
    ]);
  }
  opRows.push(['TOTAL', '', '', '', '', result.breakdown.process, '', result.breakdown.labour, result.breakdown.process + result.breakdown.labour]);
  const wsOps = XLSX.utils.aoa_to_sheet(opRows);
  wsOps['!cols'] = [{ wch: 28 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsOps, 'Operations');

  // ── Sheet 3: Rate Traceability ────────────────────────────────────────────
  const traceRows: (string | number)[][] = [
    ['Field', 'Value', 'Unit', 'Rate Source', 'Rate ID', 'Confidence'],
  ];
  for (const t of result.traceability) {
    traceRows.push([t.field, t.value, t.unit, t.rateSource, t.rateId, t.confidence]);
  }
  const wsTrace = XLSX.utils.aoa_to_sheet(traceRows);
  wsTrace['!cols'] = [{ wch: 36 }, { wch: 12 }, { wch: 10 }, { wch: 50 }, { wch: 20 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsTrace, 'Rate Traceability');

  XLSX.writeFile(wb, filename);
}

export function exportToExcelBlob(result: PartCostResult): Blob {
  const wb = XLSX.utils.book_new();

  const pcts = breakdownPercentages(result);
  const summaryRows: (string | number)[][] = [
    ['Should-Cost Summary', result.partName],
    [],
    ['Cost Bucket', 'Amount', '% of Total'],
    ['1. Raw Material', result.breakdown.rawMaterial, fmtPct(pcts.rawMaterial)],
    ['2. Process (Machine)', result.breakdown.process, fmtPct(pcts.process)],
    ['3. Direct Labour', result.breakdown.labour, fmtPct(pcts.labour)],
    ['4. Tooling', result.breakdown.tooling, fmtPct(pcts.tooling)],
    ['5. Packaging', result.breakdown.packaging, fmtPct(pcts.packaging)],
    ['6. Logistics', result.breakdown.logistics, fmtPct(pcts.logistics)],
    ['Factory Cost', result.factoryCost, fmtPct((result.factoryCost / result.total) * 100)],
    ['7. Overhead (SG&A)', result.breakdown.overhead, fmtPct(pcts.overhead)],
    ['Subtotal', result.subtotal, fmtPct((result.subtotal / result.total) * 100)],
    ['8. Supplier Margin', result.breakdown.margin, fmtPct(pcts.margin)],
    ['TOTAL', fmt2(result.total), '100.0%'],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  const opRows: (string | number)[][] = [
    ['Operation', 'Process Cost', 'Labour Cost', 'Total'],
  ];
  for (const op of result.operationDetails) {
    opRows.push([op.operationName, fmt2(op.processCost), fmt2(op.labourCost), fmt2(op.processCost + op.labourCost)]);
  }
  const wsOps = XLSX.utils.aoa_to_sheet(opRows);
  XLSX.utils.book_append_sheet(wb, wsOps, 'Operations');

  const traceRows: (string | number)[][] = [['Field', 'Value', 'Unit', 'Source', 'ID', 'Confidence']];
  for (const t of result.traceability) {
    traceRows.push([t.field, t.value, t.unit, t.rateSource, t.rateId, t.confidence]);
  }
  const wsTrace = XLSX.utils.aoa_to_sheet(traceRows);
  XLSX.utils.book_append_sheet(wb, wsTrace, 'Rate Traceability');

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
