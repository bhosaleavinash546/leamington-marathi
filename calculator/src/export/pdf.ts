import type { PartCostResult, UniversalStackInput, RateLibrary } from '../engine/types.js';
import { breakdownPercentages } from '../engine/core.js';

export function printPDF(
  result: PartCostResult,
  input: UniversalStackInput,
  library: RateLibrary,
  currency = 'GBP',
  fxRate = 1
): void {
  const sym = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;
  const c = (n: number) => `${sym}${(n * fxRate).toFixed(2)}`;
  const pctFmt = (n: number) => `${n.toFixed(1)}%`;
  const pcts = breakdownPercentages(result);

  const mat = library.materials.find(m => m.id === input.rawMaterial.materialId);
  const grossWeight = input.rawMaterial.directCost === undefined
    ? input.rawMaterial.netWeightKg / input.rawMaterial.materialUtilization : 0;
  const scrapWeight = Math.max(0, grossWeight - input.rawMaterial.netWeightKg);

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

  const breakdownRows = buckets.map(([label, value, pct]) => `
    <tr>
      <td>${label}</td>
      <td class="num">${c(value)}</td>
      <td class="num">${pctFmt(pct)}</td>
      <td><div class="bar" style="width:${Math.max(2, pct * 2.8)}px"></div></td>
    </tr>`).join('');

  // Operations table
  const opRows = result.operationDetails.map(op => {
    const machObj = library.machines.find(m => m.id === op.machineId);
    const labObj = library.labour.find(l => l.id === op.labourId);
    return `
    <tr>
      <td><strong>${op.operationName}</strong></td>
      <td>${machObj?.machineClass ?? op.machineId}</td>
      <td class="num">${c(op.machineRateUsed)}/hr</td>
      <td class="num">${(op.cycleTimeHr * 60).toFixed(2)} min</td>
      <td class="num">${(op.oee * 100).toFixed(0)}%</td>
      <td class="num">${c(op.processCost)}</td>
      <td>${labObj?.skillLevel ?? op.labourId}</td>
      <td class="num">${c(op.labourRateUsed)}/hr</td>
      <td class="num">${op.manning}×</td>
      <td class="num">${(op.labourTimeHr * 60).toFixed(2)} min</td>
      <td class="num">${(op.labourEfficiency * 100).toFixed(0)}%</td>
      <td class="num">${c(op.labourCost)}</td>
      <td class="num bold">${c(op.processCost + op.labourCost)}</td>
    </tr>`;
  }).join('');

  // Machine rate buildup
  const usedMachIds = new Set(result.operationDetails.map(op => op.machineId));
  const machBuildup = library.machines.filter(m => usedMachIds.has(m.id)).map(mach => {
    const b = mach.buildup;
    const eff = b.annualAvailableHours * b.machineUtilization;
    const _compRateCheck = (b.annualDepreciation + b.maintenance + b.energy + b.floorSpace + b.indirectSupport + b.financeCost) / eff; void _compRateCheck;
    return `
    <div class="buildup-block">
      <div class="buildup-title">${mach.machineClass} <span class="conf ${mach.confidence}">${mach.confidence}</span></div>
      <table class="detail-table">
        <tbody>
          <tr><td>Depreciation</td><td class="num">${c(b.annualDepreciation / eff)}/hr</td><td class="src">Annual: ${c(b.annualDepreciation)}</td></tr>
          <tr><td>Maintenance</td><td class="num">${c(b.maintenance / eff)}/hr</td><td class="src">Annual: ${c(b.maintenance)}</td></tr>
          <tr><td>Energy</td><td class="num">${c(b.energy / eff)}/hr</td><td class="src">Annual: ${c(b.energy)}</td></tr>
          <tr><td>Floor Space</td><td class="num">${c(b.floorSpace / eff)}/hr</td><td class="src">Annual: ${c(b.floorSpace)}</td></tr>
          <tr><td>Indirect Support</td><td class="num">${c(b.indirectSupport / eff)}/hr</td><td class="src">Annual: ${c(b.indirectSupport)}</td></tr>
          <tr><td>Finance Cost</td><td class="num">${c(b.financeCost / eff)}/hr</td><td class="src">Annual: ${c(b.financeCost)}</td></tr>
          <tr class="subtotal-row"><td>Annual Available Hours</td><td class="num">${b.annualAvailableHours.toLocaleString()} hr</td><td></td></tr>
          <tr class="subtotal-row"><td>Machine Utilisation</td><td class="num">${(b.machineUtilization * 100).toFixed(0)}%</td><td class="src">Effective: ${eff.toFixed(0)} hr/yr</td></tr>
          <tr class="total-row"><td>Computed Rate</td><td class="num">${c(mach.computedRatePerHr)}/hr</td><td class="src">Source: ${mach.sourceNote.slice(0, 45)}</td></tr>
        </tbody>
      </table>
    </div>`;
  }).join('');

  // Traceability
  const traceRows = result.traceability.map(t => `
    <tr>
      <td class="mono">${t.field}</td>
      <td class="num">${t.value}</td>
      <td>${t.unit}</td>
      <td class="src">${t.rateSource.slice(0, 55)}</td>
      <td><span class="conf ${t.confidence}">${t.confidence}</span></td>
    </tr>`).join('');

  const nreBlock = result.toolingNRE !== undefined ? `
    <p style="color:#888;font-size:10px;margin-top:4px">
      NRE / Tooling one-time cost: <strong>${c(result.toolingNRE)}</strong> — not included in unit cost above.
    </p>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Should-Cost: ${result.partName}</title>
<style>
  :root { --orange:#e65100; --orange-dark:#bf360c; --orange-light:#fff3e0; --border:#ddd; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:Arial,sans-serif; font-size:11px; color:#333; margin:18px 32px; }
  h1 { font-size:20px; color:var(--orange-dark); font-weight:700; }
  h2 { font-size:12px; color:#555; font-weight:700; margin:18px 0 5px; border-bottom:2px solid var(--orange); padding-bottom:3px; text-transform:uppercase; letter-spacing:0.06em; }
  .subtitle { font-size:10px; color:#888; margin-bottom:14px; }
  .hero { display:flex; gap:16px; margin-bottom:16px; flex-wrap:wrap; }
  .hero-card { border:2px solid var(--orange); border-radius:5px; padding:8px 14px; min-width:160px; }
  .hero-card .lbl { font-size:9px; color:#888; text-transform:uppercase; letter-spacing:0.05em; }
  .hero-card .val { font-size:22px; font-weight:700; color:var(--orange-dark); }
  .hero-card .sub { font-size:9px; color:#aaa; }
  table { width:100%; border-collapse:collapse; margin-bottom:12px; font-size:10px; }
  th { background:var(--orange-light); color:var(--orange-dark); text-align:left; padding:5px 7px; font-size:9px; text-transform:uppercase; letter-spacing:0.04em; white-space:nowrap; }
  td { padding:4px 7px; border-top:1px solid #f0f0f0; vertical-align:top; }
  .num { text-align:right; font-family:monospace; white-space:nowrap; }
  .src { font-size:9px; color:#888; }
  .mono { font-family:monospace; font-size:9px; }
  .bold { font-weight:700; }
  .bar { height:7px; border-radius:3px; background:var(--orange); }
  .total-row td { font-weight:700; font-size:12px; background:var(--orange-light); color:var(--orange-dark); }
  .subtotal-row td { font-weight:600; background:#fafafa; }
  .conf.High { background:#e8f5e9; color:#2e7d32; padding:1px 5px; border-radius:8px; font-size:8px; font-weight:700; }
  .conf.Medium { background:#fff8e1; color:#e65100; padding:1px 5px; border-radius:8px; font-size:8px; font-weight:700; }
  .conf.Low { background:#ffebee; color:#c62828; padding:1px 5px; border-radius:8px; font-size:8px; font-weight:700; }
  .buildup-block { margin-bottom:12px; }
  .buildup-title { font-weight:700; margin-bottom:4px; font-size:11px; }
  .detail-table td { padding:3px 7px; }
  .page-break { page-break-before:always; }
  .footer { margin-top:16px; font-size:8px; color:#bbb; border-top:1px solid #eee; padding-top:6px; }
  @page { margin:12mm; }
  @media print {
    body { margin:0; }
    .no-print { display:none; }
  }
</style>
</head>
<body>

<h1>Should-Cost Analysis Report</h1>
<div class="subtitle">
  Part: <strong>${result.partName}</strong> &nbsp;|&nbsp;
  Date: ${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })} &nbsp;|&nbsp;
  Currency: ${currency} (rate: ${fxRate.toFixed(4)} to GBP)
</div>

<div class="hero">
  <div class="hero-card">
    <div class="lbl">Total Should Cost</div>
    <div class="val">${c(result.total)}</div>
  </div>
  <div class="hero-card">
    <div class="lbl">Factory Cost</div>
    <div class="val">${c(result.factoryCost)}</div>
    <div class="sub">${pctFmt((result.factoryCost / result.total) * 100)} of total</div>
  </div>
  <div class="hero-card">
    <div class="lbl">Conversion (Process+Labour)</div>
    <div class="val">${c(result.breakdown.process + result.breakdown.labour)}</div>
    <div class="sub">${pctFmt(((result.breakdown.process + result.breakdown.labour) / result.total) * 100)} of total</div>
  </div>
  <div class="hero-card">
    <div class="lbl">OH + Margin</div>
    <div class="val">${c(result.breakdown.overhead + result.breakdown.margin)}</div>
    <div class="sub">${pctFmt(((result.breakdown.overhead + result.breakdown.margin) / result.total) * 100)} of total</div>
  </div>
</div>

<h2>1 · 8-Bucket Cost Breakdown</h2>
<table>
  <thead><tr><th>Bucket</th><th>Amount</th><th>% Total</th><th style="width:200px">Relative Bar</th></tr></thead>
  <tbody>
    ${breakdownRows}
    <tr class="subtotal-row"><td>Factory Cost</td><td class="num">${c(result.factoryCost)}</td><td class="num">${pctFmt((result.factoryCost / result.total) * 100)}</td><td></td></tr>
    <tr class="subtotal-row"><td>Subtotal</td><td class="num">${c(result.subtotal)}</td><td class="num">${pctFmt((result.subtotal / result.total) * 100)}</td><td></td></tr>
    <tr class="total-row"><td>TOTAL SHOULD COST</td><td class="num" colspan="3">${c(result.total)}</td></tr>
  </tbody>
</table>
${nreBlock}

<h2>2 · Material Detail</h2>
<table>
  <thead><tr><th>Parameter</th><th>Value</th><th>Unit</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td>Material Grade</td><td>${mat?.grade ?? 'Direct cost'}</td><td></td><td>${mat?.sourceNote?.slice(0,50) ?? ''}</td></tr>
    <tr><td>Region</td><td>${mat?.region ?? '—'}</td><td></td><td></td></tr>
    ${input.rawMaterial.directCost !== undefined ? `
    <tr><td>Direct Material Cost</td><td class="num">${c(input.rawMaterial.directCost)}</td><td>${currency}</td><td>Pre-computed — bypasses weight calc</td></tr>
    ` : `
    <tr><td>Net (finished) Weight</td><td class="num">${input.rawMaterial.netWeightKg.toFixed(4)}</td><td>kg</td><td></td></tr>
    <tr><td>Gross (stock/cast) Weight</td><td class="num">${grossWeight.toFixed(4)}</td><td>kg</td><td>= net ÷ utilisation</td></tr>
    <tr><td>Scrap Weight</td><td class="num">${scrapWeight.toFixed(4)}</td><td>kg</td><td></td></tr>
    <tr><td>Material Utilisation</td><td class="num">${pctFmt(input.rawMaterial.materialUtilization * 100)}</td><td></td><td>Benchmark: 72–85%</td></tr>
    <tr><td>Material Price</td><td class="num">${c(mat?.pricePerKg ?? 0)}</td><td>${currency}/kg</td><td></td></tr>
    <tr><td>Scrap Recovery Price</td><td class="num">${c(mat?.scrapRecoveryPricePerKg ?? 0)}</td><td>${currency}/kg</td><td></td></tr>
    <tr><td>Gross Material Cost</td><td class="num">${c(grossWeight * (mat?.pricePerKg ?? 0))}</td><td>${currency}</td><td>= gross wt × price</td></tr>
    <tr><td>Scrap Credit</td><td class="num">(${c(scrapWeight * (mat?.scrapRecoveryPricePerKg ?? 0))})</td><td>${currency}</td><td></td></tr>
    <tr class="total-row"><td>NET MATERIAL COST</td><td class="num">${c(result.breakdown.rawMaterial)}</td><td>${currency}</td><td></td></tr>
    `}
  </tbody>
</table>

<h2>3 · Operations Detail — Full Calculation</h2>
<table>
  <thead>
    <tr>
      <th>Operation</th><th>Machine</th><th>Rate/hr</th>
      <th>Cycle (min)</th><th>OEE</th><th>Proc Cost</th>
      <th>Labour Grade</th><th>Rate/hr</th><th>Manning</th>
      <th>Lab Time</th><th>Eff%</th><th>Lab Cost</th><th>Op Total</th>
    </tr>
  </thead>
  <tbody>
    ${opRows}
    <tr class="subtotal-row">
      <td colspan="5"><strong>TOTAL</strong></td>
      <td class="num bold">${c(result.breakdown.process)}</td>
      <td colspan="5"></td>
      <td class="num bold">${c(result.breakdown.labour)}</td>
      <td class="num bold">${c(result.breakdown.process + result.breakdown.labour)}</td>
    </tr>
  </tbody>
</table>

<div class="page-break"></div>

<h2>4 · Machine Rate Buildup (aPriori-style)</h2>
${machBuildup}

<h2>5 · Tooling &amp; NRE</h2>
<table>
  <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
  <tbody>
    <tr><td>Tooling Mode</td><td>${input.tooling.mode === 'amortized' ? 'Amortised into piece price' : 'One-time NRE (not in unit cost)'}</td></tr>
    <tr><td>Total Tooling Cost</td><td class="num">${c(input.tooling.totalToolingCost)}</td></tr>
    ${input.tooling.mode === 'amortized' ? `
    <tr><td>Amortisation Volume</td><td class="num">${input.tooling.amortizationVolume.toLocaleString()} parts</td></tr>
    <tr><td>Tooling Per Part</td><td class="num">${c(result.breakdown.tooling)}</td></tr>
    ` : `<tr><td>NRE (one-time)</td><td class="num">${c(result.toolingNRE ?? 0)}</td></tr>`}
  </tbody>
</table>

<h2>6 · Commercial Stack</h2>
<table>
  <thead><tr><th>Parameter</th><th>Rate / Amount</th><th>Basis</th></tr></thead>
  <tbody>
    <tr><td>Packaging per Part</td><td class="num">${c(input.packagingPerPart)}</td><td>Per-part fixed cost</td></tr>
    <tr><td>Logistics per Part</td><td class="num">${c(input.logisticsPerPart)}</td><td>Per-part fixed cost</td></tr>
    <tr class="subtotal-row"><td>Factory Cost</td><td class="num">${c(result.factoryCost)}</td><td>Sum of buckets 1–6</td></tr>
    <tr><td>Overhead Rate</td><td class="num">${pctFmt(input.overheadPct * 100)}</td><td>Applied to factory cost</td></tr>
    <tr><td>Overhead Amount</td><td class="num">${c(result.breakdown.overhead)}</td><td></td></tr>
    <tr class="subtotal-row"><td>Subtotal</td><td class="num">${c(result.subtotal)}</td><td>Factory cost + overhead</td></tr>
    <tr><td>Supplier Margin Rate</td><td class="num">${pctFmt(input.marginPct * 100)}</td><td>Applied to subtotal</td></tr>
    <tr><td>Supplier Margin Amount</td><td class="num">${c(result.breakdown.margin)}</td><td></td></tr>
    <tr class="total-row"><td>TOTAL SHOULD COST</td><td class="num">${c(result.total)}</td><td></td></tr>
  </tbody>
</table>

<h2>7 · Rate Traceability &amp; Assumptions</h2>
<table>
  <thead><tr><th>Field</th><th>Value</th><th>Unit</th><th>Source</th><th>Confidence</th></tr></thead>
  <tbody>${traceRows}</tbody>
</table>

<div class="footer">
  Generated by Should-Cost Calculator &nbsp;|&nbsp; All rates from editable Rate Library &nbsp;|&nbsp;
  This is a cost estimate — not a supplier quotation. &nbsp;|&nbsp; ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC
</div>

</body>
</html>`;

  const win = window.open('', '_blank', 'width=1050,height=800');
  if (!win) {
    alert('Pop-up blocked — please allow pop-ups for this site and try again.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
}
