import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PartCostResult, UniversalStackInput, RateLibrary, CommodityType } from '../engine/types.js';
import { breakdownPercentages } from '../engine/core.js';
import { generateInsights } from '../engine/insights.js';

export function printPDF(
  result: PartCostResult,
  input: UniversalStackInput,
  library: RateLibrary,
  currency = 'GBP',
  fxRate = 1,
  commodityType: CommodityType = 'machining'
): void {
  const sym = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;
  const c = (n: number) => `${sym}${(n * fxRate).toFixed(2)}`;
  const pct = (n: number) => `${n.toFixed(1)}%`;
  const pcts = breakdownPercentages(result);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const margin = 14;
  const contentW = W - margin * 2;

  // ── Colour palette ──────────────────────────────────────────────────────────
  const ORANGE: [number, number, number] = [230, 81, 0];
  const DARK: [number, number, number] = [30, 30, 30];
  const GREY: [number, number, number] = [100, 100, 100];
  const LIGHT_BG: [number, number, number] = [248, 248, 248];
  const HEADER_BG: [number, number, number] = [245, 245, 245];

  let y = 0;

  function newSection(title: string): void {
    if (y > 240) { doc.addPage(); y = 16; }
    doc.setFillColor(...ORANGE);
    doc.rect(margin, y, contentW, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(title.toUpperCase(), margin + 3, y + 5);
    doc.setTextColor(...DARK);
    doc.setFont('helvetica', 'normal');
    y += 10;
  }

  function kv(label: string, value: string, col = 0): void {
    const colW = contentW / 2;
    const x = margin + col * colW;
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(label, x, y);
    doc.setTextColor(...DARK);
    doc.setFont('helvetica', 'bold');
    doc.text(value, x + colW * 0.55, y);
    doc.setFont('helvetica', 'normal');
  }

  function addPageFooter(): void {
    const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(...GREY);
      doc.text('Leamington Marathi Should-Cost Calculator — CONFIDENTIAL', margin, 290);
      doc.text(`Page ${i} of ${pageCount}`, W - margin - 20, 290);
      doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, W / 2 - 20, 290);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // PAGE 1 — Cover + Cost Summary
  // ══════════════════════════════════════════════════════════════════════════════

  // Header bar
  doc.setFillColor(...ORANGE);
  doc.rect(0, 0, W, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('SHOULD-COST ANALYSIS REPORT', margin, 12);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Bottom-Up Manufacturing Cost Model  ·  aPriori-calibrated Benchmarks', margin, 20);
  doc.text(`${new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}`, W - margin - 45, 20);

  y = 34;

  // Part info KV row
  doc.setFillColor(...LIGHT_BG);
  doc.rect(margin, y, contentW, 18, 'F');
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...ORANGE);
  doc.text(result.partName, margin + 4, y + 8);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...DARK);
  doc.text(`Currency: ${currency}  ·  FX Rate: ${fxRate.toFixed(4)} to GBP  ·  Operations: ${result.operationDetails.length}`, margin + 4, y + 14);
  y += 22;

  // ── 8-Bucket Breakdown Table ────────────────────────────────────────────────
  newSection('§1 — 8-Bucket Cost Breakdown');

  const buckets: [string, number, number, string][] = [
    ['1. Raw Material', result.breakdown.rawMaterial, pcts.rawMaterial, ''],
    ['2. Process (Machine)', result.breakdown.process, pcts.process, ''],
    ['3. Direct Labour', result.breakdown.labour, pcts.labour, ''],
    ['4. Tooling (amortised)', result.breakdown.tooling, pcts.tooling, ''],
    ['5. Packaging', result.breakdown.packaging, pcts.packaging, ''],
    ['6. Logistics', result.breakdown.logistics, pcts.logistics, ''],
    ['— Factory Cost', result.factoryCost, (result.factoryCost / result.total) * 100, 'subtotal'],
    ['7. Overhead (SG&A)', result.breakdown.overhead, pcts.overhead, ''],
    ['— Subtotal', result.subtotal, (result.subtotal / result.total) * 100, 'subtotal'],
    ['8. Supplier Margin', result.breakdown.margin, pcts.margin, ''],
    ['TOTAL SHOULD COST', result.total, 100, 'total'],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Cost Bucket', `Amount (${currency})`, '% of Total', 'Cost Bar']],
    body: buckets.map(([label, value, p, _rowType]) => {
      const bar = '█'.repeat(Math.round(Math.max(0, Math.min(p, 50)) / 2));
      return [label, c(value), pct(p), bar];
    }),
    theme: 'plain',
    headStyles: { fillColor: HEADER_BG, textColor: DARK, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: DARK },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 30, halign: 'right' },
      2: { cellWidth: 22, halign: 'right' },
      3: { cellWidth: contentW - 125, font: 'courier', fontSize: 6, textColor: ORANGE as [number,number,number] },
    },
    didParseCell: (data) => {
      const rowType = buckets[data.row.index]?.[3];
      if (rowType === 'total') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [255, 243, 230] as [number,number,number];
        data.cell.styles.fontSize = 9;
      } else if (rowType === 'subtotal') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = HEADER_BG as [number,number,number];
      }
    },
    margin: { left: margin, right: margin },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  if (result.toolingNRE !== undefined) {
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(`NRE / Tooling (one-time, not in unit cost): ${c(result.toolingNRE)}`, margin, y);
    y += 6;
  }

  // Commercial parameters
  newSection('§2 — Commercial Parameters');
  kv('Overhead Rate:', pct(input.overheadPct * 100), 0);
  kv('Supplier Margin:', pct(input.marginPct * 100), 1);
  y += 6;
  kv('Packaging / part:', c(input.packagingPerPart), 0);
  kv('Logistics / part:', c(input.logisticsPerPart), 1);
  y += 6;
  if (input.tooling.mode === 'amortized') {
    kv('Total Tooling Cost:', c(input.tooling.totalToolingCost), 0);
    kv('Amortisation Volume:', `${input.tooling.amortizationVolume.toLocaleString()} parts`, 1);
    y += 6;
  }
  y += 4;

  // ══════════════════════════════════════════════════════════════════════════════
  // PAGE 2 — Material Detail
  // ══════════════════════════════════════════════════════════════════════════════
  doc.addPage();
  y = 16;

  const mat = library.materials.find(m => m.id === input.rawMaterial.materialId);
  const grossWeight = input.rawMaterial.directCost === undefined
    ? input.rawMaterial.netWeightKg / input.rawMaterial.materialUtilization : 0;
  const scrapWeight = Math.max(0, grossWeight - input.rawMaterial.netWeightKg);

  newSection('§3 — Material Detail');

  const matRows: string[][] = [
    ['Material ID', input.rawMaterial.materialId, '', ''],
    ['Grade / Description', mat?.grade ?? 'Direct Cost', '', mat?.sourceNote ?? ''],
    ['Region', mat?.region ?? '—', '', ''],
    ['Net (Finished) Weight', `${input.rawMaterial.netWeightKg.toFixed(4)} kg`, '', 'Weight in finished part'],
  ];

  if (input.rawMaterial.directCost !== undefined) {
    matRows.push(['Direct Material Cost', c(input.rawMaterial.directCost), currency, 'Bypasses weight-based calculation']);
  } else {
    matRows.push(
      ['Gross Weight (stock/casting)', `${grossWeight.toFixed(4)} kg`, '', `= net ÷ utilisation`],
      ['Scrap / Runner Weight', `${scrapWeight.toFixed(4)} kg`, '', `= gross − net`],
      ['Material Utilisation', pct(input.rawMaterial.materialUtilization * 100), '', `Benchmark: casting 65–85%, machining 60–75%`],
      ['Material Price', c(mat?.pricePerKg ?? 0), `${currency}/kg`, mat?.sourceNote ?? ''],
      ['Scrap Recovery Price', c(mat?.scrapRecoveryPricePerKg ?? 0), `${currency}/kg`, ''],
      ['Gross Material Cost', c(grossWeight * (mat?.pricePerKg ?? 0)), currency, `= gross × price/kg`],
      ['Scrap Credit', `−${c(scrapWeight * (mat?.scrapRecoveryPricePerKg ?? 0))}`, currency, `= scrap × recovery price`],
    );
    if (input.rawMaterial.consumablesCostPerPart && input.rawMaterial.consumablesCostPerPart > 0) {
      matRows.push(['Consumables (core/wax/shell)', c(input.rawMaterial.consumablesCostPerPart), currency, 'Per-part recurring consumable cost']);
    }
    matRows.push(['NET RAW MATERIAL COST', c(result.breakdown.rawMaterial), currency, '= gross − scrap credit + consumables']);
  }
  matRows.push(
    ['', '', '', ''],
    ['Data Confidence', mat?.confidence ?? '—', '', ''],
    ['Effective Date', mat?.effectiveDate ?? '—', '', ''],
  );

  autoTable(doc, {
    startY: y,
    head: [['Parameter', 'Value', 'Unit', 'Notes']],
    body: matRows,
    theme: 'plain',
    headStyles: { fillColor: HEADER_BG, textColor: DARK, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: DARK },
    columnStyles: {
      0: { cellWidth: 58 },
      1: { cellWidth: 32, halign: 'right' },
      2: { cellWidth: 16 },
      3: { cellWidth: contentW - 109, textColor: GREY as [number,number,number] },
    },
    didParseCell: (data) => {
      if (data.row.index === matRows.length - 1 - 2 || (data.cell.text[0] && data.cell.text[0].startsWith('NET RAW'))) {
        data.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: margin, right: margin },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ══════════════════════════════════════════════════════════════════════════════
  // PAGE 3 — Operations Detail
  // ══════════════════════════════════════════════════════════════════════════════
  if (y > 200) { doc.addPage(); y = 16; }

  newSection('§4 — Operations Detail (Full Calculation)');

  const opHead = [['Operation', 'Machine', 'Rate/hr', 'Cycle min', 'OEE', 'Process £', 'Labour Grade', 'Rate/hr', 'Manning', 'Lab min', 'Eff%', 'Labour £', 'Op Total', '%']];
  const opBody = result.operationDetails.map(op => {
    const machObj = library.machines.find(m => m.id === op.machineId);
    const labObj = library.labour.find(l => l.id === op.labourId);
    return [
      op.operationName,
      machObj?.machineClass ?? op.machineId,
      c(op.machineRateUsed),
      (op.cycleTimeHr * 60).toFixed(2),
      pct(op.oee * 100),
      c(op.processCost),
      labObj?.skillLevel ?? op.labourId,
      c(op.labourRateUsed),
      op.manning.toString(),
      (op.labourTimeHr * 60).toFixed(2),
      pct(op.labourEfficiency * 100),
      c(op.labourCost),
      c(op.processCost + op.labourCost),
      pct(((op.processCost + op.labourCost) / result.total) * 100),
    ];
  });
  opBody.push([
    'TOTAL', '', '', '', '', c(result.breakdown.process),
    '', '', '', '', '', c(result.breakdown.labour),
    c(result.breakdown.process + result.breakdown.labour),
    pct(((result.breakdown.process + result.breakdown.labour) / result.total) * 100),
  ]);

  autoTable(doc, {
    startY: y,
    head: opHead,
    body: opBody,
    theme: 'striped',
    headStyles: { fillColor: HEADER_BG, textColor: DARK, fontStyle: 'bold', fontSize: 7 },
    bodyStyles: { fontSize: 7, textColor: DARK },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 22 },
      2: { cellWidth: 14, halign: 'right' },
      3: { cellWidth: 13, halign: 'right' },
      4: { cellWidth: 11, halign: 'right' },
      5: { cellWidth: 13, halign: 'right' },
      6: { cellWidth: 20 },
      7: { cellWidth: 14, halign: 'right' },
      8: { cellWidth: 11, halign: 'right' },
      9: { cellWidth: 12, halign: 'right' },
      10: { cellWidth: 11, halign: 'right' },
      11: { cellWidth: 13, halign: 'right' },
      12: { cellWidth: 14, halign: 'right', fontStyle: 'bold' },
      13: { cellWidth: 12, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.row.index === opBody.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [255, 243, 230] as [number,number,number];
      }
    },
    margin: { left: margin, right: margin },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ══════════════════════════════════════════════════════════════════════════════
  // PAGE 4 — Machine Rate Buildup
  // ══════════════════════════════════════════════════════════════════════════════
  if (y > 200) { doc.addPage(); y = 16; }

  newSection('§5 — Machine Rate Buildup (aPriori-Style Transparency)');

  const usedMachIds = new Set(result.operationDetails.map(op => op.machineId));
  const machBuildupRows: string[][] = [];

  library.machines.filter(m => usedMachIds.has(m.id)).forEach(mach => {
    const b = mach.buildup;
    const eff = b.annualAvailableHours * b.machineUtilization;
    const totalAnnual = b.annualDepreciation + b.maintenance + b.energy + b.floorSpace + b.indirectSupport + b.financeCost;
    machBuildupRows.push(
      [{ content: `${mach.machineClass}  [${mach.id}]  Confidence: ${mach.confidence}  ·  Source: ${mach.sourceNote}`, colSpan: 5, styles: { fontStyle: 'bold' as const, fillColor: [240, 240, 240] as [number,number,number] } } as unknown as string],
      ['Cost Component', `Annual Cost (${currency})`, `Rate/hr at ${(b.machineUtilization*100).toFixed(0)}% util`, '', ''],
      ['Depreciation', c(b.annualDepreciation), c(b.annualDepreciation / eff), '', `${b.annualAvailableHours.toLocaleString()} hr/yr avail`],
      ['Maintenance', c(b.maintenance), c(b.maintenance / eff), '', ''],
      ['Energy', c(b.energy), c(b.energy / eff), '', ''],
      ['Floor Space', c(b.floorSpace), c(b.floorSpace / eff), '', ''],
      ['Indirect Support', c(b.indirectSupport), c(b.indirectSupport / eff), '', ''],
      ['Finance Cost', c(b.financeCost), c(b.financeCost / eff), '', ''],
      [`TOTAL — ${mach.machineClass}`, c(totalAnnual), c(mach.computedRatePerHr), '', `Eff. hrs: ${eff.toFixed(0)}/yr`],
    );
  });

  if (machBuildupRows.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Component', `Annual (${currency})`, `Rate/hr`, '', 'Notes']],
      body: machBuildupRows,
      theme: 'plain',
      headStyles: { fillColor: HEADER_BG, textColor: DARK, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 7.5, textColor: DARK },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 28, halign: 'right' },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 10 },
        4: { cellWidth: contentW - 114, textColor: GREY as [number,number,number] },
      },
      didParseCell: (data) => {
        const text = Array.isArray(data.cell.text) ? data.cell.text[0] : '';
        if (text && text.startsWith('TOTAL')) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [255, 243, 230] as [number,number,number];
        }
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // PAGE 5 — Rate Traceability
  // ══════════════════════════════════════════════════════════════════════════════
  if (y > 200) { doc.addPage(); y = 16; }

  newSection('§6 — Rate Traceability');

  autoTable(doc, {
    startY: y,
    head: [['Field', 'Value', 'Unit', 'Rate Source / Reference', 'Rate ID', 'Conf.']],
    body: result.traceability.map(t => [
      t.field, t.value.toFixed(4), t.unit, t.rateSource, t.rateId, t.confidence,
    ]),
    theme: 'striped',
    headStyles: { fillColor: HEADER_BG, textColor: DARK, fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { fontSize: 7, textColor: DARK },
    columnStyles: {
      0: { cellWidth: 48 },
      1: { cellWidth: 18, halign: 'right' },
      2: { cellWidth: 12 },
      3: { cellWidth: 72, textColor: GREY as [number,number,number] },
      4: { cellWidth: 22 },
      5: { cellWidth: 12 },
    },
    didParseCell: (data) => {
      const conf = data.cell.text[0];
      if (data.column.index === 5) {
        if (conf === 'High') data.cell.styles.textColor = [46, 125, 50] as [number,number,number];
        else if (conf === 'Low') data.cell.styles.textColor = [198, 40, 40] as [number,number,number];
      }
    },
    margin: { left: margin, right: margin },
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // PAGE — Cost Intelligence Insights
  // ══════════════════════════════════════════════════════════════════════════════
  const insights = generateInsights(result, input, library, commodityType);
  if (insights.length > 0) {
    if (y > 220) { doc.addPage(); y = 16; }
    newSection('§7 — Cost Intelligence Insights');

    const impactColor = (imp: string): [number, number, number] =>
      imp === 'High' ? [198, 40, 40] : imp === 'Medium' ? [230, 81, 0] : [69, 90, 100];

    const typeLabel: Record<string, string> = {
      critical: 'CRITICAL', warning: 'WARNING', opportunity: 'OPPORTUNITY',
      benchmark: 'BENCHMARK', info: 'INFO',
    };

    const topInsights = insights.slice(0, 6);
    const insightRows: (string | object)[][] = [];

    topInsights.forEach((ins) => {
      insightRows.push([
        { content: `[${typeLabel[ins.type] ?? ins.type.toUpperCase()}] ${ins.title}`, colSpan: 2, styles: { fontStyle: 'bold' as const, fillColor: [248, 248, 248] as [number,number,number], textColor: impactColor(ins.impact) } },
      ]);
      insightRows.push(['Finding', ins.finding]);
      insightRows.push(['Impact', `${ins.impact}${ins.potentialSavingPct > 0 ? ` — up to ${ins.potentialSavingPct.toFixed(0)}% potential saving` : ''}`]);
      if (ins.benchmark) {
        insightRows.push(['Benchmark', `${ins.benchmark.label}: yours ${ins.benchmark.yourValue.toFixed(1)}${ins.benchmark.unit} vs industry ${ins.benchmark.industryLow}–${ins.benchmark.industryHigh}${ins.benchmark.unit}`]);
      }
      ins.actions.slice(0, 2).forEach((act, i) => {
        insightRows.push([`Action ${i + 1}`, act]);
      });
      insightRows.push(['', '']);
    });

    autoTable(doc, {
      startY: y,
      head: [['', 'Detail']],
      body: insightRows as string[][],
      theme: 'plain',
      headStyles: { fillColor: HEADER_BG, textColor: DARK, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 7.5, textColor: DARK, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 28, textColor: GREY as [number,number,number], fontStyle: 'bold' },
        1: { cellWidth: contentW - 31 },
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── Page footers ────────────────────────────────────────────────────────────
  addPageFooter();

  // ── Save / download ─────────────────────────────────────────────────────────
  const filename = `should-cost-${result.partName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

// Legacy compat
export { printPDF as openPDF };
