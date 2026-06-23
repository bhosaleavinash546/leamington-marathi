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
  type RGB = [number, number, number];

  const sym = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;
  const c   = (n: number) => `${sym}${(n * fxRate).toFixed(2)}`;
  const pct = (n: number) => `${n.toFixed(1)}%`;
  const pcts = breakdownPercentages(result);

  // ── Document ──────────────────────────────────────────────────────────────────
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W    = 210;
  const MG   = 14;
  const CW   = W - MG * 2;   // 182 mm usable width
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  // ── Palette ───────────────────────────────────────────────────────────────────
  const NAVY:  RGB = [15,  32,  65];
  const ORANGE:RGB = [230, 81,  0];
  const SLATE: RGB = [30,  41,  59];
  const GREY:  RGB = [100, 116, 139];
  const LIGHT: RGB = [248, 250, 252];
  const WHITE: RGB = [255, 255, 255];
  const OR_LT: RGB = [255, 237, 213];
  const GN:    RGB = [22,  163, 74];
  const RD:    RGB = [198, 40,  40];
  const AM:    RGB = [180, 83,  9];
  const HDR:   RGB = [232, 235, 245];

  let y = 0;

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const lastY = () =>
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  const chk = (need: number) => {
    if (y + need > 275) { doc.addPage(); y = 18; }
  };

  const secBar = (title: string, right?: string) => {
    chk(16);
    doc.setFillColor(...NAVY);
    doc.roundedRect(MG, y, CW, 8.5, 1.5, 1.5, 'F');
    doc.setFillColor(...ORANGE);
    doc.roundedRect(MG, y, 4.5, 8.5, 1, 1, 'F');
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE);
    doc.text(title, MG + 9, y + 5.8);
    if (right) {
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
      doc.text(right, W - MG - 2, y + 5.8, { align: 'right' });
    }
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
    y += 13;
  };

  const tableHead: Partial<Parameters<typeof autoTable>[1]> = {
    headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: LIGHT },
  };

  // ── Footer ────────────────────────────────────────────────────────────────────
  const addFooters = () => {
    const total = (doc as unknown as { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(...ORANGE); doc.setLineWidth(0.5);
      doc.line(MG, 285, W - MG, 285);
      doc.setFontSize(6.5); doc.setTextColor(...GREY); doc.setFont('helvetica', 'normal');
      doc.text('CostVision  ·  Should-Cost Analysis Report  ·  CONFIDENTIAL', MG, 291);
      doc.text(`${dateStr}  ${timeStr}`, W / 2, 291, { align: 'center' });
      doc.text(`Page ${i} of ${total}`, W - MG, 291, { align: 'right' });
    }
  };

  // ════════════════════════════════════════════════════════════════════════════
  // COVER PAGE
  // ════════════════════════════════════════════════════════════════════════════
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 62, 'F');
  doc.setFillColor(...ORANGE);
  doc.rect(0, 0, 6, 62, 'F');

  // Logo mark
  doc.setFillColor(...WHITE);
  doc.roundedRect(MG + 4, 10, 22, 14, 2, 2, 'F');
  doc.setTextColor(...NAVY); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('CV', MG + 15, 19.5, { align: 'center' });

  // Brand + report type
  doc.setTextColor(...WHITE); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('CostVision', MG + 32, 18);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
  doc.text('Manufacturing Should-Cost Intelligence Platform', MG + 32, 25);

  doc.setFillColor(...ORANGE);
  doc.roundedRect(MG + 32, 30, 50, 7, 1, 1, 'F');
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE);
  doc.text('SHOULD-COST ANALYSIS REPORT', MG + 57, 35, { align: 'center' });

  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(200, 215, 240);
  doc.text(`Generated: ${dateStr}  ·  ${timeStr}`, MG + 32, 44);
  doc.text('Bottom-Up Manufacturing Cost Model', MG + 32, 51);

  y = 72;

  // Part card
  doc.setFillColor(245, 247, 251);
  doc.roundedRect(MG, y, CW, 30, 2.5, 2.5, 'F');
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.25);
  doc.roundedRect(MG, y, CW, 30, 2.5, 2.5, 'S');
  doc.setFillColor(...ORANGE);
  doc.roundedRect(MG, y, CW, 2, 1, 1, 'F');

  doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text(result.partName, MG + 6, y + 11);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY);
  doc.text(
    `Currency: ${currency}  ·  FX Rate: ${fxRate.toFixed(4)} to GBP  ·  Operations: ${result.operationDetails.length}`,
    MG + 6, y + 18
  );

  // Cost chips
  const chips: [string, string, RGB][] = [
    ['Total Should-Cost', `${sym}${(result.total * fxRate).toFixed(2)}`, ORANGE],
    ['Material',  pct(pcts.rawMaterial), SLATE],
    ['Process',   pct(pcts.process),     SLATE],
    ['Labour',    pct(pcts.labour),      SLATE],
    ['Margin',    pct(pcts.margin),      SLATE],
  ];
  const chipW = CW / chips.length;
  chips.forEach(([lbl, val, col], i) => {
    const cx = MG + i * chipW + 6;
    doc.setFontSize(6); doc.setTextColor(...GREY);
    doc.text(lbl, cx, y + 24);
    doc.setFontSize(i === 0 ? 9.5 : 8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...col);
    doc.text(val, cx, y + 29.5);
    doc.setFont('helvetica', 'normal');
  });

  y += 36;

  // ════════════════════════════════════════════════════════════════════════════
  // §1 — 8-Bucket Cost Breakdown
  // ════════════════════════════════════════════════════════════════════════════
  secBar('§1 — 8-Bucket Cost Breakdown');

  const buckets: [string, number, number, string][] = [
    ['1.  Raw Material',         result.breakdown.rawMaterial, pcts.rawMaterial,                               ''],
    ['2.  Process (Machine)',    result.breakdown.process,     pcts.process,                                   ''],
    ['3.  Direct Labour',        result.breakdown.labour,      pcts.labour,                                    ''],
    ['4.  Tooling (amortised)',  result.breakdown.tooling,     pcts.tooling,                                   ''],
    ['5.  Packaging',            result.breakdown.packaging,   pcts.packaging,                                 ''],
    ['6.  Logistics',            result.breakdown.logistics,   pcts.logistics,                                 ''],
    ['    Factory Cost',         result.factoryCost,           (result.factoryCost / result.total) * 100,      'sub'],
    ['7.  Overhead (SG&A)',      result.breakdown.overhead,    pcts.overhead,                                  ''],
    ['    Subtotal',             result.subtotal,              (result.subtotal / result.total) * 100,         'sub'],
    ['8.  Supplier Margin',      result.breakdown.margin,      pcts.margin,                                    ''],
    ['TOTAL SHOULD COST',        result.total,                 100,                                            'total'],
  ];

  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    head: [['Cost Bucket', `Amount (${currency})`, '% of Total', 'Cost Mix']],
    body: buckets.map(([label, value, p]) => [label, c(value), pct(p), '']),
    ...tableHead,
    theme: 'plain',
    bodyStyles: { fontSize: 8.5, textColor: SLATE, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
    columnStyles: {
      0: { cellWidth: 66 },
      1: { cellWidth: 30, halign: 'right' },
      2: { cellWidth: 22, halign: 'right' },
      3: { cellWidth: CW - 121 },
    },
    didParseCell: (d) => {
      const rt = buckets[d.row.index]?.[3];
      if (d.section !== 'body') return;
      if (rt === 'total') {
        d.cell.styles.fontStyle = 'bold'; d.cell.styles.fontSize = 9.5;
        d.cell.styles.fillColor = OR_LT; d.cell.styles.textColor = NAVY;
      } else if (rt === 'sub') {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = HDR; d.cell.styles.textColor = NAVY;
      } else if (d.row.index % 2 === 1) {
        d.cell.styles.fillColor = LIGHT;
      }
    },
    didDrawCell: (d) => {
      if (d.section !== 'body' || d.column.index !== 3) return;
      const p = buckets[d.row.index]?.[2] ?? 0;
      if (p <= 0) return;
      const maxW = d.cell.width - 6;
      const fillW = Math.max((p / 100) * maxW, 0.5);
      const barH  = 3.5;
      const bx    = d.cell.x + 3;
      const by    = d.cell.y + (d.cell.height - barH) / 2;
      // track
      doc.setFillColor(220, 224, 235);
      doc.roundedRect(bx, by, maxW, barH, 0.8, 0.8, 'F');
      // fill
      const rt = buckets[d.row.index]?.[3];
      doc.setFillColor(...(rt === 'total' || rt === 'sub' ? NAVY : ORANGE));
      doc.roundedRect(bx, by, fillW, barH, 0.8, 0.8, 'F');
    },
  });
  y = lastY() + 6;

  if (result.toolingNRE !== undefined) {
    doc.setFontSize(7.5); doc.setTextColor(...GREY);
    doc.text(`NRE / Tooling (one-time, not in unit cost): ${c(result.toolingNRE)}`, MG, y);
    y += 6;
  }

  // ── §2 Commercial Parameters ─────────────────────────────────────────────────
  chk(28);
  secBar('§2 — Commercial Parameters');
  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    body: [
      ['Overhead Rate', pct(input.overheadPct * 100), 'Supplier Margin', pct(input.marginPct * 100)],
      ['Packaging / part', c(input.packagingPerPart), 'Logistics / part', c(input.logisticsPerPart)],
      ...(input.tooling.mode === 'amortized' ? [[
        'Total Tooling Cost', c(input.tooling.totalToolingCost),
        'Amortisation Volume', `${input.tooling.amortizationVolume.toLocaleString()} parts`,
      ]] : []),
    ],
    theme: 'plain',
    bodyStyles: { fontSize: 8.5, cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 } },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 42, textColor: GREY },
      1: { cellWidth: 50, fontStyle: 'bold', textColor: NAVY },
      2: { cellWidth: 42, textColor: GREY },
      3: { cellWidth: CW - 137, fontStyle: 'bold', textColor: NAVY },
    },
  });
  y = lastY() + 8;

  // ════════════════════════════════════════════════════════════════════════════
  // §3 — Material Detail  (new page)
  // ════════════════════════════════════════════════════════════════════════════
  doc.addPage(); y = 18;

  const mat        = library.materials.find(m => m.id === input.rawMaterial.materialId);
  const grossWt    = input.rawMaterial.directCost === undefined
    ? input.rawMaterial.netWeightKg / input.rawMaterial.materialUtilization : 0;
  const scrapWt    = Math.max(0, grossWt - input.rawMaterial.netWeightKg);
  const scrapValue = scrapWt * (mat?.scrapRecoveryPricePerKg ?? 0);

  secBar('§3 — Material Detail');

  const matRows: string[][] = [
    ['Material ID',              input.rawMaterial.materialId,                   '',          ''],
    ['Grade / Description',      mat?.grade ?? 'Direct Cost',                   '',          mat?.sourceNote ?? ''],
    ['Region',                   mat?.region ?? '-',                             '',          ''],
    ['Net (Finished) Weight',    `${input.rawMaterial.netWeightKg.toFixed(4)} kg`, 'kg',     'Weight in finished part'],
  ];

  if (input.rawMaterial.directCost !== undefined) {
    matRows.push(['Direct Material Cost', c(input.rawMaterial.directCost), currency, 'Bypasses weight-based calculation']);
  } else {
    matRows.push(
      ['Gross Weight (stock/casting)', `${grossWt.toFixed(4)} kg`,  'kg',         'net / utilisation'],
      ['Scrap / Runner Weight',        `${scrapWt.toFixed(4)} kg`,  'kg',         'gross - net'],
      ['Material Utilisation',         pct(input.rawMaterial.materialUtilization * 100), '', 'Benchmark: casting 65-85%, machining 60-75%'],
      ['Material Price',               c(mat?.pricePerKg ?? 0),     `${currency}/kg`, mat?.sourceNote ?? ''],
      ['Scrap Recovery Price',         c(mat?.scrapRecoveryPricePerKg ?? 0), `${currency}/kg`, ''],
      ['Gross Material Cost',          c(grossWt * (mat?.pricePerKg ?? 0)), currency,  'gross x price/kg'],
      ['Scrap Credit',                 `-${c(scrapValue)}`,          currency,     'scrap x recovery price'],
    );
    if ((input.rawMaterial.consumablesCostPerPart ?? 0) > 0) {
      matRows.push(['Consumables (core/wax/shell)', c(input.rawMaterial.consumablesCostPerPart!), currency, 'Per-part recurring consumable cost']);
    }
    matRows.push(['NET RAW MATERIAL COST', c(result.breakdown.rawMaterial), currency, 'gross - scrap credit + consumables']);
  }
  matRows.push(['', '', '', ''], ['Data Confidence', mat?.confidence ?? '-', '', ''], ['Effective Date', mat?.effectiveDate ?? '-', '', '']);

  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    head: [['Parameter', 'Value', 'Unit', 'Notes']],
    body: matRows,
    ...tableHead,
    theme: 'plain',
    bodyStyles: { fontSize: 8, textColor: SLATE, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 } },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 56, textColor: GREY },
      1: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      2: { cellWidth: 14, textColor: GREY },
      3: { cellWidth: CW - 105, textColor: GREY, fontSize: 7.5 },
    },
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      const t = Array.isArray(d.cell.text) ? d.cell.text[0] : '';
      if (t.startsWith('NET RAW') || t.startsWith('TOTAL')) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = OR_LT;
        d.cell.styles.textColor = NAVY;
      }
    },
  });
  y = lastY() + 8;

  // ════════════════════════════════════════════════════════════════════════════
  // §4 — Operations Detail
  // ════════════════════════════════════════════════════════════════════════════
  chk(22);
  secBar('§4 — Operations Detail');

  const opRows = result.operationDetails.map(op => {
    const mObj = library.machines.find(m => m.id === op.machineId);
    const lObj = library.labour.find(l => l.id === op.labourId);
    return [
      op.operationName,
      mObj?.machineClass ?? op.machineId,
      c(op.machineRateUsed),
      (op.cycleTimeHr * 60).toFixed(2),
      pct(op.oee * 100),
      c(op.processCost),
      lObj?.skillLevel ?? op.labourId,
      c(op.labourRateUsed),
      String(op.manning),
      (op.labourTimeHr * 60).toFixed(2),
      pct(op.labourEfficiency * 100),
      c(op.labourCost),
      c(op.processCost + op.labourCost),
    ];
  });
  opRows.push([
    'TOTAL', '', '', '', '', c(result.breakdown.process),
    '', '', '', '', '', c(result.breakdown.labour),
    c(result.breakdown.process + result.breakdown.labour),
  ]);

  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    head: [['Operation', 'Machine', 'Rate/hr', 'Cyc.m', 'OEE', 'Process', 'Grade', 'Rate/hr', 'Man.', 'Lab.m', 'Eff%', 'Labour', 'Total']],
    body: opRows,
    ...tableHead,
    headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 6.5 },
    theme: 'striped',
    styles: { fontSize: 7, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 } },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0:  { cellWidth: 26 },
      1:  { cellWidth: 20 },
      2:  { cellWidth: 13, halign: 'right' },
      3:  { cellWidth: 11, halign: 'right' },
      4:  { cellWidth: 11, halign: 'right' },
      5:  { cellWidth: 14, halign: 'right' },
      6:  { cellWidth: 16 },
      7:  { cellWidth: 13, halign: 'right' },
      8:  { cellWidth: 9,  halign: 'center' },
      9:  { cellWidth: 11, halign: 'right' },
      10: { cellWidth: 10, halign: 'right' },
      11: { cellWidth: 14, halign: 'right' },
      12: { cellWidth: CW - 168, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (d) => {
      if (d.section === 'body' && d.row.index === opRows.length - 1) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = OR_LT;
        d.cell.styles.textColor = NAVY;
      }
    },
  });
  y = lastY() + 8;

  // ════════════════════════════════════════════════════════════════════════════
  // §5 — Machine Rate Buildup
  // ════════════════════════════════════════════════════════════════════════════
  chk(22);
  secBar('§5 — Machine Rate Buildup');

  const usedIds = new Set(result.operationDetails.map(op => op.machineId));
  const machRows: (string | { content: string; colSpan?: number; styles?: Record<string, unknown> })[][] = [];

  library.machines.filter(m => usedIds.has(m.id)).forEach(mach => {
    const b   = mach.buildup;
    const eff = b.annualAvailableHours * b.machineUtilization;
    const tot = b.annualDepreciation + b.maintenance + b.energy + b.floorSpace + b.indirectSupport + b.financeCost;
    const rh  = (n: number) => c(n / eff);
    machRows.push([
      { content: `${mach.machineClass}  [${mach.id}]  ·  Confidence: ${mach.confidence}  ·  ${mach.sourceNote}`,
        colSpan: 4, styles: { fontStyle: 'bold', fillColor: HDR, textColor: NAVY, fontSize: 7.5 } } as unknown as string,
    ]);
    machRows.push([
      { content: 'Cost Component', styles: { fontStyle: 'bold', textColor: GREY, fontSize: 7 } } as unknown as string,
      { content: `Annual Cost (${currency})`, styles: { fontStyle: 'bold', textColor: GREY, halign: 'right', fontSize: 7 } } as unknown as string,
      { content: `Rate/hr at ${(b.machineUtilization * 100).toFixed(0)}% util`, styles: { fontStyle: 'bold', textColor: GREY, halign: 'right', fontSize: 7 } } as unknown as string,
      { content: 'Notes', styles: { fontStyle: 'bold', textColor: GREY, fontSize: 7 } } as unknown as string,
    ]);
    machRows.push(['Depreciation',     c(b.annualDepreciation), rh(b.annualDepreciation), `${b.annualAvailableHours.toLocaleString()} hr/yr avail`]);
    machRows.push(['Maintenance',       c(b.maintenance),       rh(b.maintenance),       '']);
    machRows.push(['Energy',            c(b.energy),            rh(b.energy),            '']);
    machRows.push(['Floor Space',       c(b.floorSpace),        rh(b.floorSpace),        '']);
    machRows.push(['Indirect Support',  c(b.indirectSupport),   rh(b.indirectSupport),   '']);
    machRows.push(['Finance Cost',      c(b.financeCost),       rh(b.financeCost),       '']);
    machRows.push([`TOTAL — ${mach.machineClass}`, c(tot), c(mach.computedRatePerHr), `Eff. hrs: ${eff.toFixed(0)}/yr`]);
  });

  if (machRows.length > 0) {
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG },
      body: machRows as string[][],
      theme: 'plain',
      styles: { fontSize: 8, textColor: SLATE, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 } },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: {
        0: { cellWidth: 52 },
        1: { cellWidth: 30, halign: 'right' },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: CW - 115, textColor: GREY, fontSize: 7.5 },
      },
      didParseCell: (d) => {
        if (d.section !== 'body') return;
        const t = Array.isArray(d.cell.text) ? d.cell.text[0] : '';
        if (t.startsWith('TOTAL')) {
          d.cell.styles.fontStyle = 'bold';
          d.cell.styles.fillColor = OR_LT;
          d.cell.styles.textColor = NAVY;
        }
      },
    });
    y = lastY() + 8;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // §6 — Rate Traceability
  // ════════════════════════════════════════════════════════════════════════════
  chk(22);
  secBar('§6 — Rate Traceability');

  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    head: [['Field', 'Value', 'Unit', 'Source / Reference', 'Rate ID', 'Conf.']],
    body: result.traceability.map(t => [t.field, t.value.toFixed(4), t.unit, t.rateSource, t.rateId, t.confidence]),
    ...tableHead,
    theme: 'striped',
    styles: { fontSize: 7, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 } },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 18, halign: 'right' },
      2: { cellWidth: 12 },
      3: { cellWidth: 66, textColor: GREY, fontSize: 6.8 },
      4: { cellWidth: 22, fontSize: 6.8 },
      5: { cellWidth: 14 },
    },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 5) {
        const v = Array.isArray(d.cell.text) ? d.cell.text[0] : d.cell.text;
        if (v === 'High')   { d.cell.styles.textColor = GN; d.cell.styles.fontStyle = 'bold'; }
        else if (v === 'Low') { d.cell.styles.textColor = RD; d.cell.styles.fontStyle = 'bold'; }
        else                { d.cell.styles.textColor = AM; }
      }
    },
  });
  y = lastY() + 8; // ← critical: was missing, caused §7 to overlap this table

  // ════════════════════════════════════════════════════════════════════════════
  // §7 — Cost Intelligence Insights
  // ════════════════════════════════════════════════════════════════════════════
  const insights = generateInsights(result, input, library, commodityType);
  if (insights.length > 0) {
    chk(22);
    secBar('§7 — Cost Intelligence Insights');

    const impCol = (imp: string): RGB => imp === 'High' ? RD : imp === 'Medium' ? AM : GREY;
    const typeLabel: Record<string, string> = {
      critical: 'CRITICAL', warning: 'WARNING', opportunity: 'OPPORTUNITY',
      benchmark: 'BENCHMARK', info: 'INFO',
    };

    const insRows: (string | object)[][] = [];
    insights.slice(0, 6).forEach(ins => {
      insRows.push([{
        content: `[${typeLabel[ins.type] ?? ins.type.toUpperCase()}]  ${ins.title}`,
        colSpan: 2,
        styles: { fontStyle: 'bold', fillColor: [245, 245, 252] as RGB, textColor: impCol(ins.impact), fontSize: 8 },
      }]);
      insRows.push(['Finding', ins.finding]);
      insRows.push(['Impact', `${ins.impact}${ins.potentialSavingPct > 0 ? `  -  up to ${ins.potentialSavingPct.toFixed(0)}% potential saving` : ''}`]);
      if (ins.benchmark) {
        insRows.push(['Benchmark', `${ins.benchmark.label}: yours ${ins.benchmark.yourValue.toFixed(1)}${ins.benchmark.unit} vs industry ${ins.benchmark.industryLow}-${ins.benchmark.industryHigh}${ins.benchmark.unit}`]);
      }
      ins.actions.slice(0, 2).forEach((act, i) => insRows.push([`Action ${i + 1}`, act]));
      insRows.push(['', '']);
    });

    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG },
      body: insRows as string[][],
      theme: 'plain',
      styles: { fontSize: 7.5, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 } },
      columnStyles: {
        0: { cellWidth: 24, textColor: GREY, fontStyle: 'bold', fontSize: 7 },
        1: { cellWidth: CW - 27 },
      },
    });
    y = lastY() + 8;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // §8, §9, §10, §11 — DFM / DFA / Optimisation / Roadmap
  // ════════════════════════════════════════════════════════════════════════════
  try {
    const dfm = generateDFMDFA(result, input, commodityType);

    // §8 DFM
    chk(22);
    secBar('§8 — DFM Analysis', `Score: ${dfm.dfm.score.toFixed(1)}/10  ·  Saving Potential: ${dfm.dfm.totalSavingPct.toFixed(0)}%`);

    if (dfm.dfm.summary) {
      const ls = doc.splitTextToSize(dfm.dfm.summary, CW) as string[];
      doc.setFontSize(7.5); doc.setTextColor(...GREY);
      doc.text(ls, MG, y); y += ls.length * 4.2 + 4;
    }

    if (dfm.dfm.issues.length > 0) {
      autoTable(doc, {
        startY: y, margin: { left: MG, right: MG },
        head: [['Severity', 'Category', 'Issue', 'Description', 'Save%', 'Risk', 'Recommendation']],
        body: dfm.dfm.issues.map(i => [i.severity.toUpperCase(), i.category, i.title, i.description, `${i.savingPct.toFixed(0)}%`, i.risk, i.recommendation]),
        ...tableHead,
        headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 6.5 },
        theme: 'striped',
        styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
        alternateRowStyles: { fillColor: LIGHT },
        columnStyles: {
          0: { cellWidth: 16, fontStyle: 'bold' },
          1: { cellWidth: 18 }, 2: { cellWidth: 26 }, 3: { cellWidth: 44 },
          4: { cellWidth: 12, halign: 'right' }, 5: { cellWidth: 12 },
          6: { cellWidth: CW - 131 },
        },
        didParseCell: (d) => {
          if (d.section === 'body' && d.column.index === 0) {
            const sev = dfm.dfm.issues[d.row.index]?.severity;
            d.cell.styles.textColor = sev === 'critical' ? RD : sev === 'major' ? AM : sev === 'opportunity' ? GN : GREY;
          }
        },
      });
      y = lastY() + 8;
    } else {
      doc.setFontSize(8); doc.setTextColor(...GN);
      doc.text('No DFM issues detected for this part and process combination.', MG, y);
      y += 8;
    }

    // §9 DFA
    chk(22);
    secBar('§9 — DFA Analysis', `Score: ${dfm.dfa.score.toFixed(1)}/10  ·  Saving Potential: ${dfm.dfa.totalSavingPct.toFixed(0)}%`);

    if (dfm.dfa.summary) {
      const ls = doc.splitTextToSize(dfm.dfa.summary, CW) as string[];
      doc.setFontSize(7.5); doc.setTextColor(...GREY);
      doc.text(ls, MG, y); y += ls.length * 4.2 + 4;
    }

    if (dfm.dfa.issues.length > 0) {
      autoTable(doc, {
        startY: y, margin: { left: MG, right: MG },
        head: [['Severity', 'Category', 'Issue', 'Description', 'Save%', 'Risk', 'Recommendation']],
        body: dfm.dfa.issues.map(i => [i.severity.toUpperCase(), i.category, i.title, i.description, `${i.savingPct.toFixed(0)}%`, i.risk, i.recommendation]),
        ...tableHead,
        headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 6.5 },
        theme: 'striped',
        styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
        alternateRowStyles: { fillColor: LIGHT },
        columnStyles: {
          0: { cellWidth: 16, fontStyle: 'bold' },
          1: { cellWidth: 18 }, 2: { cellWidth: 26 }, 3: { cellWidth: 44 },
          4: { cellWidth: 12, halign: 'right' }, 5: { cellWidth: 12 },
          6: { cellWidth: CW - 131 },
        },
        didParseCell: (d) => {
          if (d.section === 'body' && d.column.index === 0) {
            const sev = dfm.dfa.issues[d.row.index]?.severity;
            d.cell.styles.textColor = sev === 'critical' ? RD : sev === 'major' ? AM : sev === 'opportunity' ? GN : GREY;
          }
        },
      });
      y = lastY() + 8;
    } else {
      doc.setFontSize(8); doc.setTextColor(...GN);
      doc.text('No DFA issues detected for this part and process combination.', MG, y);
      y += 8;
    }

    // §10 Cost Optimisation
    if (dfm.costOptimisations.length > 0) {
      chk(22);
      secBar(
        '§10 — Cost Optimisation Opportunities',
        `${dfm.costOptimisations.length} actions  ·  Total Potential: ${dfm.totalPotentialSavingPct.toFixed(0)}%`
      );
      autoTable(doc, {
        startY: y, margin: { left: MG, right: MG },
        head: [['Action', 'Description', 'Save%', 'Timeframe', 'Risk', 'Technical Justification']],
        body: dfm.costOptimisations.map(o => [o.title, o.description, `${o.expectedSavingPct.toFixed(0)}%`, o.timeframe, o.risk, o.technicalJustification]),
        ...tableHead,
        headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 6.5 },
        theme: 'striped',
        styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
        alternateRowStyles: { fillColor: LIGHT },
        columnStyles: {
          0: { cellWidth: 28, fontStyle: 'bold' }, 1: { cellWidth: 34 },
          2: { cellWidth: 12, halign: 'right' },   3: { cellWidth: 22 },
          4: { cellWidth: 11 }, 5: { cellWidth: CW - 110 },
        },
        didParseCell: (d) => {
          if (d.section !== 'body') return;
          const o = dfm.costOptimisations[d.row.index];
          if (d.column.index === 3 && o) {
            d.cell.styles.textColor = o.timeframe === 'Quick Win' ? GN : o.timeframe === 'Medium Term' ? AM : GREY;
          }
          if (d.column.index === 2 && o && o.expectedSavingPct >= 10) {
            d.cell.styles.fontStyle = 'bold'; d.cell.styles.textColor = GN;
          }
        },
      });
      y = lastY() + 8;
    }

    // §11 Roadmap
    if (dfm.quickWins.length > 0 || dfm.longTermChanges.length > 0) {
      chk(22);
      secBar('§11 — Implementation Roadmap');

      if (dfm.quickWins.length > 0) {
        doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...GN);
        doc.text('Quick Wins (implement immediately):', MG, y); y += 5;
        dfm.quickWins.forEach(w => {
          chk(8);
          const ls = doc.splitTextToSize(`•  ${w}`, CW - 8) as string[];
          doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
          doc.text(ls, MG + 6, y); y += ls.length * 4.5;
        });
        y += 4;
      }
      if (dfm.longTermChanges.length > 0) {
        chk(16);
        doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...GREY);
        doc.text('Long-Term Changes (strategic):', MG, y); y += 5;
        dfm.longTermChanges.forEach(w => {
          chk(8);
          const ls = doc.splitTextToSize(`•  ${w}`, CW - 8) as string[];
          doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
          doc.text(ls, MG + 6, y); y += ls.length * 4.5;
        });
      }
    }
  } catch {
    // DFM/DFA not available for this commodity
  }

  addFooters();

  const fname = `should-cost-${result.partName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fname);
}

// Legacy compat
export { printPDF as openPDF };

// ════════════════════════════════════════════════════════════════════════════
// AI CAD-to-Cost Analysis — PDF Export
// ════════════════════════════════════════════════════════════════════════════
export function printCADAnalysisPDF(r: CADAnalysisResult): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const margin = 14;
  const cW = W - margin * 2;

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
      doc.setDrawColor(...GREEN);
      doc.setLineWidth(0.4);
      doc.line(margin, 288, W - margin, 288);
    }
  }

  // COVER HEADER
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, 30, 'F');
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

  const scoreColor: [number,number,number] = r.manufacturabilityScore >= 75 ? GREEN : r.manufacturabilityScore >= 50 ? AMBER_COL : RED_COL;
  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(margin, y, cW, 22, 3, 3, 'F');
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, cW, 22, 3, 3, 'S');
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
    `${g.boundingBoxMm.x.toFixed(0)}x${g.boundingBoxMm.y.toFixed(0)}x${g.boundingBoxMm.z.toFixed(0)} mm  ·  ${g.estimatedVolumeCm3.toFixed(1)} cm3  ·  Al ${g.estimatedWeightKg.aluminum.toFixed(3)} kg / Steel ${g.estimatedWeightKg.steel.toFixed(3)} kg`,
    margin + 26, y + 15
  );
  doc.setTextColor(...scoreColor);
  doc.text(`Manufacturability: ${r.manufacturabilityScore}/100  ·  AI Confidence: ${r.confidenceLevel}`, margin + 26, y + 20);
  y += 28;

  section('§1 — Geometry & Part Summary');
  autoTable(doc, {
    startY: y, body: [
      ['Bounding Box', `${g.boundingBoxMm.x.toFixed(1)} x ${g.boundingBoxMm.y.toFixed(1)} x ${g.boundingBoxMm.z.toFixed(1)} mm`, 'Surface Area', `${g.estimatedSurfaceAreaCm2.toFixed(1)} cm2`],
      ['Volume', `${g.estimatedVolumeCm3.toFixed(2)} cm3`, 'Weight (Al)', `${g.estimatedWeightKg.aluminum.toFixed(3)} kg`],
      ['Weight (Steel)', `${g.estimatedWeightKg.steel.toFixed(3)} kg`, 'Weight (Plastic)', `${g.estimatedWeightKg.plastic.toFixed(3)} kg`],
    ],
    theme: 'plain', bodyStyles: { fontSize: 7.5, textColor: DARK },
    columnStyles: { 0: { textColor: GREY, cellWidth: 38 }, 1: { cellWidth: 50, fontStyle: 'bold' }, 2: { textColor: GREY, cellWidth: 38 }, 3: { fontStyle: 'bold' } },
    margin: { left: margin, right: margin },
  });
  y = lastAutoTable() + 6;

  section('§2 — Detected Features');
  autoTable(doc, {
    startY: y,
    head: [['Feature Type', 'Count', 'Significance', 'Description']],
    body: r.detectedFeatures.map(f => [f.type, String(f.count), f.significance, f.description]),
    theme: 'plain',
    headStyles: { fillColor: HDR_BG, textColor: DARK, fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: DARK },
    columnStyles: { 0: { cellWidth: 38, fontStyle: 'bold' }, 1: { cellWidth: 14, halign: 'center' }, 2: { cellWidth: 24, halign: 'center' }, 3: { cellWidth: cW - 80 } },
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

  section('§3 — Material Analysis', r.materialAnalysis.fromMetadata ? 'From CAD metadata' : 'AI-suggested');
  const ma = r.materialAnalysis;
  kv2('Primary Material:', `${ma.primarySuggestion.name}  (${ma.primarySuggestion.confidencePct}% confidence)`);
  bodyText(ma.primarySuggestion.reasoning, 4, GREY);
  if (ma.alternatives.length > 0) {
    doc.setFontSize(7.5); doc.setTextColor(...GREY);
    doc.text('Alternatives:', margin, y);
    doc.setTextColor(...DARK);
    doc.text(ma.alternatives.map(a => `${a.name} (${a.confidencePct}%)`).join('  ·  '), margin + 22, y);
    y += 5;
  }
  y += 2;

  section('§4 — Process Recommendations');
  autoTable(doc, {
    startY: y,
    head: [['Process', 'Commodity', 'Confidence', 'Est. Cycle (hr)', 'Reasoning']],
    body: r.processRecommendations.map(p => [p.process, p.commodityType, `${p.confidencePct}%`, p.estimatedCycleTimeHr.toFixed(4), p.reasoning]),
    theme: 'plain',
    headStyles: { fillColor: HDR_BG, textColor: DARK, fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { fontSize: 7, textColor: DARK },
    columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold' }, 1: { cellWidth: 28 }, 2: { cellWidth: 20, halign: 'center' }, 3: { cellWidth: 22, halign: 'right' }, 4: { cellWidth: cW - 115 } },
    didParseCell: (data) => {
      if (data.column.index === 2 && data.section === 'body') {
        const p = parseInt(String(data.cell.raw));
        data.cell.styles.textColor = p >= 75 ? GREEN : p >= 50 ? AMBER_COL : RED_COL;
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.row.index === 0 && data.section === 'body') {
        data.cell.styles.fillColor = [240, 252, 247] as [number,number,number];
      }
    },
    margin: { left: margin, right: margin },
  });
  y = lastAutoTable() + 6;

  if (r.manufacturabilityRisks.length > 0) {
    section(`§5 — Manufacturability Risks  (Score: ${r.manufacturabilityScore}/100)`);
    autoTable(doc, {
      startY: y,
      head: [['Severity', 'Feature / Area', 'Description', 'Recommended Action']],
      body: r.manufacturabilityRisks.map(risk => [risk.severity, risk.feature, risk.description, risk.suggestion]),
      theme: 'plain',
      headStyles: { fillColor: HDR_BG, textColor: DARK, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7, textColor: DARK },
      columnStyles: { 0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' }, 1: { cellWidth: 38, fontStyle: 'bold' }, 2: { cellWidth: (cW - 84) * 0.52 }, 3: { cellWidth: (cW - 84) * 0.48 } },
      didParseCell: (data) => {
        if (data.column.index === 0 && data.section === 'body') {
          data.cell.styles.textColor = severityColour(String(data.cell.raw));
        }
      },
      margin: { left: margin, right: margin },
    });
    y = lastAutoTable() + 6;
  }

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
      columnStyles: { 0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' }, 1: { cellWidth: 34, fontStyle: 'bold' }, 2: { cellWidth: (cW - 90) / 3 }, 3: { cellWidth: (cW - 90) / 3 }, 4: { cellWidth: (cW - 90) / 3 } },
      didParseCell: (data) => {
        if (data.column.index === 0 && data.section === 'body') {
          data.cell.styles.textColor = severityColour(String(data.cell.raw));
        }
      },
      margin: { left: margin, right: margin },
    });
    y = lastAutoTable() + 6;
  }

  const cr = r.costInputSuggestions.costRange;
  const ci = r.costInputSuggestions;
  section('§7 — Cost Range & Suggested Inputs');

  if (cr) {
    doc.setFillColor(...LIGHT_BG);
    doc.roundedRect(margin, y, cW, 16, 2, 2, 'F');
    const thirds = cW / 3;
    doc.setFontSize(7); doc.setTextColor(...GREY);
    doc.text('OPTIMISTIC', margin + thirds * 0 + 2, y + 5);
    doc.text('MOST LIKELY', margin + thirds * 1 + 2, y + 5);
    doc.text('CONSERVATIVE', margin + thirds * 2 + 2, y + 5);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.setTextColor(...GREEN);  doc.text(`£${cr.low.toFixed(2)}`,  margin + thirds * 0 + 6, y + 13);
    doc.setTextColor(...BLUE_COL); doc.text(`£${cr.mid.toFixed(2)}`, margin + thirds * 1 + 6, y + 13);
    doc.setTextColor(...RED_COL);  doc.text(`£${cr.high.toFixed(2)}`, margin + thirds * 2 + 6, y + 13);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK);
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
    theme: 'plain', bodyStyles: { fontSize: 7.5, textColor: DARK },
    columnStyles: { 0: { textColor: GREY, cellWidth: 42 }, 1: { fontStyle: 'bold', cellWidth: 55 }, 2: { textColor: GREY, cellWidth: 32 }, 3: { fontStyle: 'bold' } },
    margin: { left: margin, right: margin },
  });
  y = lastAutoTable() + 6;

  const specific: string[][] = [];
  if (ci.casting) { specific.push(['Casting Subtype', ci.casting.subtype], ['Die/Mould Cost', `£${ci.casting.dieMouldCostGBP.toLocaleString('en-GB')}`], ['Die Life', `${ci.casting.dieMouldLife.toLocaleString()} shots`], ['Cavities', String(ci.casting.cavities)], ['Yield', `${(ci.casting.yieldFraction * 100).toFixed(1)}%`]); }
  if (ci.forging)  { specific.push(['Flash Weight', `${ci.forging.flashKg.toFixed(3)} kg`], ['Yield', `${(ci.forging.yieldFraction * 100).toFixed(1)}%`], ['Die Cost', `£${ci.forging.dieCostGBP.toLocaleString('en-GB')}`], ['Strokes', String(ci.forging.strokes)]); }
  if (ci.injectionMoulding) { specific.push(['Cavities', String(ci.injectionMoulding.cavities)], ['Wall Thickness', `${ci.injectionMoulding.wallThicknessMm} mm`], ['Mould Cost', `£${ci.injectionMoulding.mouldCostGBP.toLocaleString('en-GB')}`], ['Mould Life', `${ci.injectionMoulding.mouldLife.toLocaleString()} shots`], ['Projected Area', `${ci.injectionMoulding.projectedAreaCm2.toFixed(1)} cm2`]); }
  if (specific.length > 0) {
    checkPage(specific.length * 5 + 10);
    doc.setFontSize(7.5); doc.setTextColor(...GREY); doc.text('Process-Specific Parameters', margin, y); y += 4;
    autoTable(doc, { startY: y, body: specific, theme: 'plain', bodyStyles: { fontSize: 7.5, textColor: DARK }, columnStyles: { 0: { textColor: GREY, cellWidth: 42 }, 1: { fontStyle: 'bold' } }, margin: { left: margin + 4, right: margin } });
    y = lastAutoTable() + 6;
  }

  checkPage(24);
  section('§8 — AI Analysis Explanation');
  bodyText(r.aiExplanation, 0, GREY);
  y += 2;

  if (r.analysisLimitations.length > 0) {
    checkPage(12);
    section('§9 — Analysis Limitations & Assumptions');
    r.analysisLimitations.forEach((lim, i) => bodyText(`${i + 1}. ${lim}`, 4, GREY));
  }

  if (ci.stage1Selection) {
    checkPage(10);
    doc.setFontSize(7); doc.setTextColor(...GREY);
    doc.text(
      `Stage-1 pre-selection: ${ci.stage1Selection.primary} (${Math.round((ci.stage1Selection.conf ?? 0) * 100)}%)  ·  ` +
      (ci.stage1Selection.alt ?? []).map((a: { type: string; conf: number }) => `${a.type} (${Math.round(a.conf * 100)}%)`).join(' · '),
      margin, y
    );
    y += 5;
  }

  addFooters();
  const fname = `cad-analysis-${r.partName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fname);
}
