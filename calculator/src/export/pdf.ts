import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PartCostResult, UniversalStackInput, RateLibrary, CommodityType } from '../engine/types.js';
import type { CADAnalysisResult } from '../engine/ai-analysis.js';
import { breakdownPercentages } from '../engine/core.js';
import { generateInsights } from '../engine/insights.js';
import { generateDFMDFA } from '../engine/dfm-dfa.js';

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

  // ══════════════════════════════════════════════════════════════════════════════
  // DFM / DFA / COST OPTIMISATION — §8, §9, §10, §11
  // ══════════════════════════════════════════════════════════════════════════════
  try {
    const dfmResult = generateDFMDFA(result, input, commodityType);
    const lastAutoTableY = () =>
      (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

    // ── §8 DFM Analysis ────────────────────────────────────────────────────────
    if (y > 200) { doc.addPage(); y = 16; }
    newSection(
      `§8 — DFM Analysis  (Score: ${dfmResult.dfm.score.toFixed(1)}/10  ·  Combined Saving Potential: ${dfmResult.dfm.totalSavingPct.toFixed(0)}%)`
    );

    if (dfmResult.dfm.summary) {
      const lines = doc.splitTextToSize(dfmResult.dfm.summary, contentW) as string[];
      doc.setFontSize(8); doc.setTextColor(...GREY);
      doc.text(lines, margin, y);
      y += lines.length * 4.5 + 3;
    }

    if (dfmResult.dfm.issues.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [['Severity', 'Category', 'Issue', 'Description', 'Save %', 'Risk', 'Recommendation']],
        body: dfmResult.dfm.issues.map(i => [
          i.severity.toUpperCase(),
          i.category,
          i.title,
          i.description,
          `${i.savingPct.toFixed(0)}%`,
          i.risk,
          i.recommendation,
        ]),
        styles: { fontSize: 7, cellPadding: 1.8, overflow: 'linebreak' },
        headStyles: { fillColor: HEADER_BG, textColor: DARK, fontStyle: 'bold', fontSize: 7.5 },
        alternateRowStyles: { fillColor: [252, 252, 252] },
        columnStyles: {
          0: { cellWidth: 18, fontStyle: 'bold' },
          1: { cellWidth: 18 },
          2: { cellWidth: 28 },
          3: { cellWidth: 42 },
          4: { cellWidth: 13, halign: 'right' },
          5: { cellWidth: 12 },
          6: { cellWidth: contentW - 134 },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 0) {
            const sev = dfmResult.dfm.issues[data.row.index]?.severity;
            if (sev === 'critical')    data.cell.styles.textColor = [198, 40, 40];
            else if (sev === 'major')  data.cell.styles.textColor = [230, 81, 0];
            else if (sev === 'minor')  data.cell.styles.textColor = [69, 90, 100];
            else                       data.cell.styles.textColor = [46, 125, 50];
          }
        },
        margin: { left: margin, right: margin },
      });
      y = lastAutoTableY() + 8;
    } else {
      doc.setFontSize(8); doc.setTextColor(46, 125, 50);
      doc.text('✓ No DFM issues detected for this part and process combination.', margin, y);
      y += 8;
    }

    // ── §9 DFA Analysis ────────────────────────────────────────────────────────
    if (y > 200) { doc.addPage(); y = 16; }
    newSection(
      `§9 — DFA Analysis  (Score: ${dfmResult.dfa.score.toFixed(1)}/10  ·  Saving Potential: ${dfmResult.dfa.totalSavingPct.toFixed(0)}%)`
    );

    if (dfmResult.dfa.summary) {
      const lines = doc.splitTextToSize(dfmResult.dfa.summary, contentW) as string[];
      doc.setFontSize(8); doc.setTextColor(...GREY);
      doc.text(lines, margin, y);
      y += lines.length * 4.5 + 3;
    }

    if (dfmResult.dfa.issues.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [['Severity', 'Category', 'Issue', 'Description', 'Save %', 'Risk', 'Recommendation']],
        body: dfmResult.dfa.issues.map(i => [
          i.severity.toUpperCase(),
          i.category,
          i.title,
          i.description,
          `${i.savingPct.toFixed(0)}%`,
          i.risk,
          i.recommendation,
        ]),
        styles: { fontSize: 7, cellPadding: 1.8, overflow: 'linebreak' },
        headStyles: { fillColor: HEADER_BG, textColor: DARK, fontStyle: 'bold', fontSize: 7.5 },
        alternateRowStyles: { fillColor: [252, 252, 252] },
        columnStyles: {
          0: { cellWidth: 18, fontStyle: 'bold' },
          1: { cellWidth: 18 },
          2: { cellWidth: 28 },
          3: { cellWidth: 42 },
          4: { cellWidth: 13, halign: 'right' },
          5: { cellWidth: 12 },
          6: { cellWidth: contentW - 134 },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 0) {
            const sev = dfmResult.dfa.issues[data.row.index]?.severity;
            if (sev === 'critical')    data.cell.styles.textColor = [198, 40, 40];
            else if (sev === 'major')  data.cell.styles.textColor = [230, 81, 0];
            else if (sev === 'minor')  data.cell.styles.textColor = [69, 90, 100];
            else                       data.cell.styles.textColor = [46, 125, 50];
          }
        },
        margin: { left: margin, right: margin },
      });
      y = lastAutoTableY() + 8;
    } else {
      doc.setFontSize(8); doc.setTextColor(46, 125, 50);
      doc.text('✓ No DFA issues detected for this part and process combination.', margin, y);
      y += 8;
    }

    // ── §10 Cost Optimisation Opportunities ────────────────────────────────────
    if (dfmResult.costOptimisations.length > 0) {
      if (y > 200) { doc.addPage(); y = 16; }
      newSection(
        `§10 — Cost Optimisation Opportunities  (${dfmResult.costOptimisations.length} actions · Total Potential: ${dfmResult.totalPotentialSavingPct.toFixed(0)}%)`
      );
      autoTable(doc, {
        startY: y,
        head: [['Action', 'Description', 'Save %', 'Timeframe', 'Risk', 'Technical Justification']],
        body: dfmResult.costOptimisations.map(o => [
          o.title,
          o.description,
          `${o.expectedSavingPct.toFixed(0)}%`,
          o.timeframe,
          o.risk,
          o.technicalJustification,
        ]),
        styles: { fontSize: 7, cellPadding: 1.8, overflow: 'linebreak' },
        headStyles: { fillColor: HEADER_BG, textColor: DARK, fontStyle: 'bold', fontSize: 7.5 },
        alternateRowStyles: { fillColor: [252, 252, 252] },
        columnStyles: {
          0: { cellWidth: 30, fontStyle: 'bold' },
          1: { cellWidth: 36 },
          2: { cellWidth: 14, halign: 'right' },
          3: { cellWidth: 22 },
          4: { cellWidth: 12 },
          5: { cellWidth: contentW - 117 },
        },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const opt = dfmResult.costOptimisations[data.row.index];
            if (data.column.index === 3 && opt) {
              if (opt.timeframe === 'Quick Win') data.cell.styles.textColor = [46, 125, 50];
              else if (opt.timeframe === 'Medium Term') data.cell.styles.textColor = [230, 81, 0];
              else data.cell.styles.textColor = [69, 90, 100];
            }
            if (data.column.index === 2 && opt && opt.expectedSavingPct >= 10) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.textColor = [46, 125, 50];
            }
          }
        },
        margin: { left: margin, right: margin },
      });
      y = lastAutoTableY() + 8;
    }

    // ── §11 Quick Wins & Long-Term Changes ──────────────────────────────────────
    if (dfmResult.quickWins.length > 0 || dfmResult.longTermChanges.length > 0) {
      if (y > 230) { doc.addPage(); y = 16; }
      newSection('§11 — Implementation Roadmap');

      if (dfmResult.quickWins.length > 0) {
        doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(46, 125, 50);
        doc.text('Quick Wins (implement immediately):', margin, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        dfmResult.quickWins.forEach(w => {
          if (y > 270) { doc.addPage(); y = 16; }
          doc.setFontSize(7.5); doc.setTextColor(...DARK);
          const lines = doc.splitTextToSize(`• ${w}`, contentW - 6) as string[];
          doc.text(lines, margin + 4, y);
          y += lines.length * 4.5;
        });
        y += 4;
      }

      if (dfmResult.longTermChanges.length > 0) {
        if (y > 250) { doc.addPage(); y = 16; }
        doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(69, 90, 100);
        doc.text('Long-Term Changes (strategic):', margin, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        dfmResult.longTermChanges.forEach(w => {
          if (y > 270) { doc.addPage(); y = 16; }
          doc.setFontSize(7.5); doc.setTextColor(...DARK);
          const lines = doc.splitTextToSize(`• ${w}`, contentW - 6) as string[];
          doc.text(lines, margin + 4, y);
          y += lines.length * 4.5;
        });
      }
    }
  } catch {
    // DFM/DFA not available for this commodity — skip silently
  }

  // ── Page footers ────────────────────────────────────────────────────────────
  addPageFooter();

  // ── Save / download ─────────────────────────────────────────────────────────
  const filename = `should-cost-${result.partName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

// Legacy compat
export { printPDF as openPDF };

// ══════════════════════════════════════════════════════════════════════════════
// AI CAD-to-Cost Analysis — PDF Export
// ══════════════════════════════════════════════════════════════════════════════
export function printCADAnalysisPDF(r: CADAnalysisResult): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const margin = 14;
  const cW = W - margin * 2;

  // ── Colour palette ──────────────────────────────────────────────────────────
  const GREEN:    [number,number,number] = [16, 185, 129];
  const DARK:     [number,number,number] = [20,  20,  20];
  const GREY:     [number,number,number] = [100,100,100];
  const LIGHT_BG: [number,number,number] = [245,250,248];
  const HDR_BG:   [number,number,number] = [232,248,243];
  const RED_COL:  [number,number,number] = [220, 50, 50];
  const AMBER_COL:[number,number,number] = [200,130,  0];
  const BLUE_COL: [number,number,number] = [ 37,100,200];

  let y = 0;

  const lastAutoTable = () =>
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  function checkPage(need = 20): void {
    if (y + need > 274) { doc.addPage(); y = 16; }
  }

  function section(title: string, sub?: string): void {
    checkPage(14);
    doc.setFillColor(...GREEN);
    doc.rect(margin, y, cW, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(title.toUpperCase(), margin + 3, y + 5);
    if (sub) {
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(sub, margin + cW - 3, y + 5, { align: 'right' });
    }
    doc.setTextColor(...DARK);
    doc.setFont('helvetica', 'normal');
    y += 10;
  }

  function wrap(text: string, maxW: number): string[] {
    return doc.splitTextToSize(text, maxW) as string[];
  }

  function bodyText(text: string, indent = 0, colour: [number,number,number] = DARK): void {
    const lines = wrap(text, cW - indent);
    doc.setFontSize(8);
    doc.setTextColor(...colour);
    doc.text(lines, margin + indent, y);
    y += lines.length * 4.2 + 1;
  }

  function kv2(label: string, value: string): void {
    const half = cW / 2;
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY);
    doc.text(label, margin, y);
    doc.setTextColor(...DARK);
    doc.setFont('helvetica', 'bold');
    doc.text(value, margin + half * 0.55, y);
    doc.setFont('helvetica', 'normal');
    y += 5;
  }

  function severityColour(s: string): [number,number,number] {
    if (s === 'High' || s === 'Critical') return RED_COL;
    if (s === 'Medium')                   return AMBER_COL;
    return GREEN;
  }

  function addFooters(): void {
    const total = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFontSize(6.5);
      doc.setTextColor(...GREY);
      doc.text('CostVision AI CAD-to-Cost Report  ·  CONFIDENTIAL', margin, 291);
      doc.text(`Page ${i} of ${total}`, W - margin - 16, 291);
      doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, W / 2 - 18, 291);
      // Green bottom rule
      doc.setDrawColor(...GREEN);
      doc.setLineWidth(0.4);
      doc.line(margin, 288, W - margin, 288);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // COVER HEADER
  // ════════════════════════════════════════════════════════════════════════════
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, 30, 'F');

  // White logo area
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, 6, 28, 18, 2, 2, 'F');
  doc.setTextColor(...GREEN);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('CV', margin + 8, 18);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('AI CAD-to-Cost Analysis', margin + 34, 13);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text('CostVision  ·  Powered by Claude AI  ·  Manufacturing Intelligence Platform', margin + 34, 21);
  doc.text(new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }), W - margin - 2, 21, { align: 'right' });

  y = 38;

  // Part name + score banner
  const scoreColor: [number,number,number] = r.manufacturabilityScore >= 75 ? GREEN : r.manufacturabilityScore >= 50 ? AMBER_COL : RED_COL;
  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(margin, y, cW, 22, 3, 3, 'F');
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, cW, 22, 3, 3, 'S');

  // Manufacturability score circle (text only in PDF)
  doc.setFillColor(...scoreColor);
  doc.circle(margin + 12, y + 11, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(String(r.manufacturabilityScore), margin + 12, y + 14, { align: 'center' });

  doc.setTextColor(...DARK);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(r.partName, margin + 26, y + 9);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GREY);
  const g = r.geometry;
  doc.text(
    `${g.boundingBoxMm.x.toFixed(0)}×${g.boundingBoxMm.y.toFixed(0)}×${g.boundingBoxMm.z.toFixed(0)} mm  ·  ${g.estimatedVolumeCm3.toFixed(1)} cm³  ·  Al ${g.estimatedWeightKg.aluminum.toFixed(3)} kg  /  Steel ${g.estimatedWeightKg.steel.toFixed(3)} kg`,
    margin + 26, y + 15
  );
  doc.setTextColor(...scoreColor);
  doc.text(`Manufacturability: ${r.manufacturabilityScore}/100  ·  AI Confidence: ${r.confidenceLevel}`, margin + 26, y + 20);
  y += 28;

  // ════════════════════════════════════════════════════════════════════════════
  // §1 GEOMETRY SUMMARY
  // ════════════════════════════════════════════════════════════════════════════
  section('§1 — Geometry & Part Summary');

  autoTable(doc, {
    startY: y,
    body: [
      ['Bounding Box', `${g.boundingBoxMm.x.toFixed(1)} × ${g.boundingBoxMm.y.toFixed(1)} × ${g.boundingBoxMm.z.toFixed(1)} mm`, 'Surface Area', `${g.estimatedSurfaceAreaCm2.toFixed(1)} cm²`],
      ['Volume', `${g.estimatedVolumeCm3.toFixed(2)} cm³`, 'Weight (Al)', `${g.estimatedWeightKg.aluminum.toFixed(3)} kg`],
      ['Weight (Steel)', `${g.estimatedWeightKg.steel.toFixed(3)} kg`, 'Weight (Plastic)', `${g.estimatedWeightKg.plastic.toFixed(3)} kg`],
    ],
    theme: 'plain',
    bodyStyles: { fontSize: 7.5, textColor: DARK },
    columnStyles: { 0: { textColor: GREY, cellWidth: 38 }, 1: { cellWidth: 50, fontStyle: 'bold' }, 2: { textColor: GREY, cellWidth: 38 }, 3: { fontStyle: 'bold' } },
    margin: { left: margin, right: margin },
  });
  y = lastAutoTable() + 6;

  // ════════════════════════════════════════════════════════════════════════════
  // §2 DETECTED FEATURES
  // ════════════════════════════════════════════════════════════════════════════
  section('§2 — Detected Features');

  autoTable(doc, {
    startY: y,
    head: [['Feature Type', 'Count', 'Significance', 'Description']],
    body: r.detectedFeatures.map(f => [f.type, String(f.count), f.significance, f.description]),
    theme: 'plain',
    headStyles: { fillColor: HDR_BG, textColor: DARK, fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: DARK },
    columnStyles: {
      0: { cellWidth: 38, fontStyle: 'bold' },
      1: { cellWidth: 14, halign: 'center' },
      2: { cellWidth: 24, halign: 'center' },
      3: { cellWidth: cW - 80 },
    },
    didParseCell: (data) => {
      if (data.column.index === 2 && data.section === 'body') {
        const s = String(data.cell.raw);
        data.cell.styles.textColor = s === 'High' ? RED_COL : s === 'Medium' ? AMBER_COL : GREEN;
        data.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: margin, right: margin },
  });
  y = lastAutoTable() + 6;

  // ════════════════════════════════════════════════════════════════════════════
  // §3 MATERIAL ANALYSIS
  // ════════════════════════════════════════════════════════════════════════════
  section('§3 — Material Analysis', r.materialAnalysis.fromMetadata ? '✓ From CAD metadata' : 'AI-suggested');

  const ma = r.materialAnalysis;
  kv2('Primary Material:', `${ma.primarySuggestion.name}  (${ma.primarySuggestion.confidencePct}% confidence)`);
  bodyText(ma.primarySuggestion.reasoning, 4, GREY);

  if (ma.alternatives.length > 0) {
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY);
    doc.text('Alternatives:', margin, y);
    doc.setTextColor(...DARK);
    doc.text(ma.alternatives.map(a => `${a.name} (${a.confidencePct}%)`).join('  ·  '), margin + 22, y);
    y += 5;
  }
  y += 2;

  // ════════════════════════════════════════════════════════════════════════════
  // §4 PROCESS RECOMMENDATIONS
  // ════════════════════════════════════════════════════════════════════════════
  section('§4 — Process Recommendations');

  autoTable(doc, {
    startY: y,
    head: [['Process', 'Commodity', 'Confidence', 'Est. Cycle (hr)', 'Reasoning']],
    body: r.processRecommendations.map(p => [
      p.process,
      p.commodityType,
      `${p.confidencePct}%`,
      p.estimatedCycleTimeHr.toFixed(4),
      p.reasoning,
    ]),
    theme: 'plain',
    headStyles: { fillColor: HDR_BG, textColor: DARK, fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { fontSize: 7, textColor: DARK },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold' },
      1: { cellWidth: 28 },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: cW - 115 },
    },
    didParseCell: (data) => {
      if (data.column.index === 2 && data.section === 'body') {
        const pct = parseInt(String(data.cell.raw));
        data.cell.styles.textColor = pct >= 75 ? GREEN : pct >= 50 ? AMBER_COL : RED_COL;
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.row.index === 0 && data.section === 'body') {
        data.cell.styles.fillColor = [240, 252, 247] as [number,number,number];
      }
    },
    margin: { left: margin, right: margin },
  });
  y = lastAutoTable() + 6;

  // ════════════════════════════════════════════════════════════════════════════
  // §5 MANUFACTURABILITY RISKS
  // ════════════════════════════════════════════════════════════════════════════
  if (r.manufacturabilityRisks.length > 0) {
    section(`§5 — Manufacturability Risks  (Score: ${r.manufacturabilityScore}/100)`);

    autoTable(doc, {
      startY: y,
      head: [['Severity', 'Feature / Area', 'Description', 'Recommended Action']],
      body: r.manufacturabilityRisks.map(risk => [
        risk.severity, risk.feature, risk.description, risk.suggestion,
      ]),
      theme: 'plain',
      headStyles: { fillColor: HDR_BG, textColor: DARK, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7, textColor: DARK },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 38, fontStyle: 'bold' },
        2: { cellWidth: (cW - 84) * 0.52 },
        3: { cellWidth: (cW - 84) * 0.48 },
      },
      didParseCell: (data) => {
        if (data.column.index === 0 && data.section === 'body') {
          data.cell.styles.textColor = severityColour(String(data.cell.raw));
        }
      },
      margin: { left: margin, right: margin },
    });
    y = lastAutoTable() + 6;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // §6 DFM ISSUES (specialist AI)
  // ════════════════════════════════════════════════════════════════════════════
  const dfm = r.costInputSuggestions.dfmIssues ?? [];
  if (dfm.length > 0) {
    section(`§6 — DFM Issues (${r.costInputSuggestions.recommendedCommodity} specialist)`);

    autoTable(doc, {
      startY: y,
      head: [['Severity', 'Area', 'Description', 'Impact', 'Fix']],
      body: dfm.map(d => [d.severity, d.area, d.description, d.impact, d.fix]),
      theme: 'plain',
      headStyles: { fillColor: HDR_BG, textColor: DARK, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 6.8, textColor: DARK },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 34, fontStyle: 'bold' },
        2: { cellWidth: (cW - 90) / 3 },
        3: { cellWidth: (cW - 90) / 3 },
        4: { cellWidth: (cW - 90) / 3 },
      },
      didParseCell: (data) => {
        if (data.column.index === 0 && data.section === 'body') {
          data.cell.styles.textColor = severityColour(String(data.cell.raw));
        }
      },
      margin: { left: margin, right: margin },
    });
    y = lastAutoTable() + 6;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // §7 COST RANGE + SUGGESTED INPUTS
  // ════════════════════════════════════════════════════════════════════════════
  const cr = r.costInputSuggestions.costRange;
  const ci = r.costInputSuggestions;

  section('§7 — Cost Range & Suggested Inputs');

  if (cr) {
    // Visual cost range band
    doc.setFillColor(...LIGHT_BG);
    doc.roundedRect(margin, y, cW, 16, 2, 2, 'F');
    const thirds = cW / 3;
    doc.setFontSize(7);
    doc.setTextColor(...GREY);
    doc.text('OPTIMISTIC', margin + thirds * 0 + 2, y + 5);
    doc.text('MOST LIKELY', margin + thirds * 1 + 2, y + 5);
    doc.text('CONSERVATIVE', margin + thirds * 2 + 2, y + 5);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...GREEN);
    doc.text(`£${cr.low.toFixed(2)}`, margin + thirds * 0 + 6, y + 13);
    doc.setTextColor(...BLUE_COL);
    doc.text(`£${cr.mid.toFixed(2)}`, margin + thirds * 1 + 6, y + 13);
    doc.setTextColor(...RED_COL);
    doc.text(`£${cr.high.toFixed(2)}`, margin + thirds * 2 + 6, y + 13);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DARK);
    y += 20;
  }

  const opsText = ci.estimatedOperations.map(o => `${o.name} (${o.machineId}, ${o.cycleTimeHr.toFixed(4)} hr)`).join('\n');

  autoTable(doc, {
    startY: y,
    body: [
      ['Net Weight', `${ci.netWeightKg.toFixed(3)} kg`, 'Material', ci.materialId],
      ['Recommended Process', ci.recommendedCommodity, 'Cycle Time', `${ci.estimatedCycleTimeHr.toFixed(4)} hr/part`],
      ['Setup Time', `${ci.estimatedSetupTimeHr.toFixed(3)} hr`, 'Operations', `${ci.estimatedOperations.length} ops`],
      ['Operations Detail', opsText, '', ''],
    ],
    theme: 'plain',
    bodyStyles: { fontSize: 7.5, textColor: DARK },
    columnStyles: {
      0: { textColor: GREY, cellWidth: 42 },
      1: { fontStyle: 'bold', cellWidth: 55 },
      2: { textColor: GREY, cellWidth: 32 },
      3: { fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin },
  });
  y = lastAutoTable() + 6;

  // Process-specific parameters (casting/forging/IMM/etc.)
  const specific: string[][] = [];
  if (ci.casting) {
    specific.push(
      ['Casting Subtype', ci.casting.subtype],
      ['Die/Mould Cost', `£${ci.casting.dieMouldCostGBP.toLocaleString('en-GB')}`],
      ['Die Life', `${ci.casting.dieMouldLife.toLocaleString()} shots`],
      ['Cavities', String(ci.casting.cavities)],
      ['Yield', `${(ci.casting.yieldFraction * 100).toFixed(1)}%`],
    );
    if (ci.casting.cycleTimeHpdcSec) specific.push(['HPDC Cycle Time', `${ci.casting.cycleTimeHpdcSec} s`]);
  }
  if (ci.forging) {
    specific.push(
      ['Flash Weight', `${ci.forging.flashKg.toFixed(3)} kg`],
      ['Yield', `${(ci.forging.yieldFraction * 100).toFixed(1)}%`],
      ['Die Cost', `£${ci.forging.dieCostGBP.toLocaleString('en-GB')}`],
      ['Strokes', String(ci.forging.strokes)],
    );
  }
  if (ci.injectionMoulding) {
    specific.push(
      ['Cavities', String(ci.injectionMoulding.cavities)],
      ['Wall Thickness', `${ci.injectionMoulding.wallThicknessMm} mm`],
      ['Mould Cost', `£${ci.injectionMoulding.mouldCostGBP.toLocaleString('en-GB')}`],
      ['Mould Life', `${ci.injectionMoulding.mouldLife.toLocaleString()} shots`],
      ['Projected Area', `${ci.injectionMoulding.projectedAreaCm2.toFixed(1)} cm²`],
    );
  }
  if (ci.blowMoulding) {
    specific.push(
      ['Subtype', ci.blowMoulding.subtype],
      ['Wall Thickness', `${ci.blowMoulding.wallThicknessMm} mm`],
      ['Mould Cost', `£${ci.blowMoulding.mouldCostGBP.toLocaleString('en-GB')}`],
      ['Cavities', String(ci.blowMoulding.cavities)],
      ['Blow Time', `${ci.blowMoulding.blowTimeSec} s`],
    );
  }
  if (ci.composites) {
    specific.push(
      ['Process', ci.composites.process],
      ['Plies', String(ci.composites.plies)],
      ['Fibre Fraction', `${(ci.composites.fibreFraction * 100).toFixed(0)}%`],
      ['Tool Cost', `£${ci.composites.toolCostGBP.toLocaleString('en-GB')}`],
      ['Cure Time', `${(ci.composites.cureTimeSec / 60).toFixed(0)} min`],
    );
  }
  if (ci.rubber) {
    specific.push(
      ['Process', ci.rubber.process],
      ['Cavities', String(ci.rubber.cavities)],
      ['Mould Cost', `£${ci.rubber.mouldCostGBP.toLocaleString('en-GB')}`],
      ['Cycle Time', `${ci.rubber.cycleTimeSec} s`],
    );
  }
  if (ci.rotationalMoulding) {
    specific.push(
      ['Arms', String(ci.rotationalMoulding.numArms)],
      ['Heat Time', `${(ci.rotationalMoulding.heatTimeSec / 60).toFixed(0)} min`],
      ['Cool Time', `${(ci.rotationalMoulding.coolTimeSec / 60).toFixed(0)} min`],
      ['Mould Cost', `£${ci.rotationalMoulding.mouldCostGBP.toLocaleString('en-GB')}`],
    );
  }
  if (specific.length > 0) {
    checkPage(specific.length * 5 + 10);
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY);
    doc.text('Process-Specific Parameters', margin, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      body: specific,
      theme: 'plain',
      bodyStyles: { fontSize: 7.5, textColor: DARK },
      columnStyles: { 0: { textColor: GREY, cellWidth: 42 }, 1: { fontStyle: 'bold' } },
      margin: { left: margin + 4, right: margin },
    });
    y = lastAutoTable() + 6;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // §8 AI EXPLANATION
  // ════════════════════════════════════════════════════════════════════════════
  checkPage(24);
  section('§8 — AI Analysis Explanation');
  bodyText(r.aiExplanation, 0, GREY);
  y += 2;

  // ════════════════════════════════════════════════════════════════════════════
  // §9 ANALYSIS LIMITATIONS
  // ════════════════════════════════════════════════════════════════════════════
  if (r.analysisLimitations.length > 0) {
    checkPage(12);
    section('§9 — Analysis Limitations & Assumptions');
    r.analysisLimitations.forEach((lim, i) => {
      bodyText(`${i + 1}. ${lim}`, 4, GREY);
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STAGE-1 SELECTION NOTE
  // ════════════════════════════════════════════════════════════════════════════
  if (ci.stage1Selection) {
    checkPage(10);
    doc.setFontSize(7);
    doc.setTextColor(...GREY);
    doc.text(
      `⚡ Stage-1 Haiku pre-selection: ${ci.stage1Selection.primary} (${Math.round((ci.stage1Selection.conf ?? 0) * 100)}%)  ·  ` +
      (ci.stage1Selection.alt ?? []).map(a => `${a.type} (${Math.round(a.conf * 100)}%)`).join(' · '),
      margin, y
    );
    y += 5;
  }

  addFooters();

  const fname = `cad-analysis-${r.partName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fname);
}
