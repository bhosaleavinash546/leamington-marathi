import type { PartCostResult } from '../engine/types.js';
import { breakdownPercentages } from '../engine/core.js';

const CURRENCY = '£';
const fmt = (n: number) => `${CURRENCY}${n.toFixed(2)}`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export function printPDF(result: PartCostResult): void {
  const pcts = breakdownPercentages(result);

  const buckets: [string, number, number][] = [
    ['1. Raw Material', result.breakdown.rawMaterial, pcts.rawMaterial],
    ['2. Process (Machine)', result.breakdown.process, pcts.process],
    ['3. Direct Labour', result.breakdown.labour, pcts.labour],
    ['4. Tooling', result.breakdown.tooling, pcts.tooling],
    ['5. Packaging', result.breakdown.packaging, pcts.packaging],
    ['6. Logistics', result.breakdown.logistics, pcts.logistics],
    ['7. Overhead (SG&A)', result.breakdown.overhead, pcts.overhead],
    ['8. Supplier Margin', result.breakdown.margin, pcts.margin],
  ];

  const rowsHTML = buckets
    .map(([label, value, pct]) => `
      <tr>
        <td>${label}</td>
        <td style="text-align:right">${fmt(value)}</td>
        <td style="text-align:right">${fmtPct(pct)}</td>
        <td>
          <div style="height:8px;border-radius:4px;background:#e65100;width:${Math.max(2, pct * 2)}px"></div>
        </td>
      </tr>`)
    .join('');

  const opsRowsHTML = result.operationDetails
    .map(op => `
      <tr>
        <td>${op.operationName}</td>
        <td style="text-align:right">£${op.machineRateUsed.toFixed(2)}/hr</td>
        <td style="text-align:right">${fmt(op.processCost)}</td>
        <td style="text-align:right">£${op.labourRateUsed.toFixed(2)}/hr</td>
        <td style="text-align:right">${fmt(op.labourCost)}</td>
      </tr>`)
    .join('');

  const traceRowsHTML = result.traceability
    .slice(0, 20)
    .map(t => `
      <tr>
        <td style="font-size:10px">${t.field}</td>
        <td style="text-align:right;font-size:10px">${t.value}</td>
        <td style="font-size:10px">${t.unit}</td>
        <td style="font-size:9px;color:#666">${t.rateSource.slice(0, 50)}</td>
        <td style="font-size:10px">
          <span style="background:${t.confidence === 'High' ? '#e8f5e9' : t.confidence === 'Medium' ? '#fff8e1' : '#ffebee'};
                       color:${t.confidence === 'High' ? '#2e7d32' : t.confidence === 'Medium' ? '#e65100' : '#c62828'};
                       padding:1px 5px;border-radius:8px;font-weight:700">${t.confidence}</span>
        </td>
      </tr>`)
    .join('');

  const nreRow = result.toolingNRE !== undefined
    ? `<tr style="color:#888">
        <td colspan="3">NRE / Tooling (one-time, not in unit cost)</td>
        <td style="text-align:right">${fmt(result.toolingNRE)}</td>
      </tr>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Should-Cost: ${result.partName}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #333; margin: 20px 40px; }
  h1 { font-size: 18px; color: #bf360c; margin-bottom: 4px; }
  .subtitle { font-size: 11px; color: #888; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #fff3e0; color: #bf360c; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
  td { padding: 5px 8px; border-top: 1px solid #f0f0f0; }
  .total-row td { font-weight: 700; font-size: 14px; background: #fff3e0; color: #bf360c; }
  .sub-row td { font-weight: 600; background: #fafafa; }
  .hero { display: flex; gap: 30px; margin-bottom: 20px; }
  .hero-card { border: 2px solid #e65100; border-radius: 6px; padding: 10px 16px; }
  .hero-card .label { font-size: 10px; color: #888; }
  .hero-card .value { font-size: 24px; font-weight: 700; color: #bf360c; }
  h2 { font-size: 13px; color: #333; margin-top: 20px; margin-bottom: 6px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
  @media print {
    body { margin: 10px 20px; }
    @page { margin: 10mm; }
  }
</style>
</head>
<body>
<h1>Should-Cost Analysis</h1>
<div class="subtitle">Part: <strong>${result.partName}</strong> &nbsp;|&nbsp; Generated ${new Date().toLocaleDateString('en-GB')}</div>

<div class="hero">
  <div class="hero-card">
    <div class="label">Total Should Cost</div>
    <div class="value">${fmt(result.total)}</div>
  </div>
  <div class="hero-card">
    <div class="label">Factory Cost</div>
    <div class="value">${fmt(result.factoryCost)}</div>
  </div>
  <div class="hero-card">
    <div class="label">Subtotal (before margin)</div>
    <div class="value">${fmt(result.subtotal)}</div>
  </div>
</div>

<h2>8-Bucket Cost Breakdown</h2>
<table>
  <thead><tr><th>Bucket</th><th style="text-align:right">Amount</th><th style="text-align:right">% of Total</th><th style="width:160px">Bar</th></tr></thead>
  <tbody>
    ${rowsHTML}
    <tr class="sub-row"><td>Factory Cost</td><td style="text-align:right">${fmt(result.factoryCost)}</td><td style="text-align:right">${fmtPct((result.factoryCost / result.total) * 100)}</td><td></td></tr>
    <tr class="sub-row"><td>Subtotal</td><td style="text-align:right">${fmt(result.subtotal)}</td><td style="text-align:right">${fmtPct((result.subtotal / result.total) * 100)}</td><td></td></tr>
    <tr class="total-row"><td>TOTAL SHOULD COST</td><td style="text-align:right" colspan="3">${fmt(result.total)}</td></tr>
    ${nreRow}
  </tbody>
</table>

<h2>Operations Detail</h2>
<table>
  <thead><tr><th>Operation</th><th style="text-align:right">Machine Rate</th><th style="text-align:right">Process Cost</th><th style="text-align:right">Labour Rate</th><th style="text-align:right">Labour Cost</th></tr></thead>
  <tbody>${opsRowsHTML}</tbody>
</table>

<h2>Rate Traceability &amp; Assumptions (top 20)</h2>
<table>
  <thead><tr><th>Field</th><th style="text-align:right">Value</th><th>Unit</th><th>Source</th><th>Confidence</th></tr></thead>
  <tbody>${traceRowsHTML}</tbody>
</table>

<div style="margin-top:20px;font-size:9px;color:#aaa;border-top:1px solid #eee;padding-top:8px">
  Generated by Should-Cost Calculator | All rates sourced from editable Rate Library | This document is a cost estimate, not a quotation.
</div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    alert('Pop-up blocked — please allow pop-ups and try again.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 500);
}
