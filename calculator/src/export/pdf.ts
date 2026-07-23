import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PartCostResult, UniversalStackInput, RateLibrary, CommodityType, Scenario } from '../engine/types.js';
import type { CADAnalysisResult } from '../engine/ai-analysis.js';
import { breakdownPercentages } from '../engine/core.js';
import { generateInsights, totalPotentialSaving, currencySymbol } from '../engine/insights.js';
import { generateDFMDFA } from '../engine/dfm-dfa.js';
import { computeCostUncertainty } from '../engine/uncertainty.js';
import { runSensitivity } from '../engine/sensitivity.js';
import { computeCarbon } from '../engine/carbon.js';
import { computeRegionalComparison, type ManufacturingRegion } from '../engine/regional-rates.js';
import type { FeatureMachiningLine } from '../engine/feature-machining.js';

/**
 * CAD-derived provenance + geometry metadata that rides into the should-cost
 * report so a reviewer can see WHERE each number came from. All optional — when
 * absent the report renders exactly as before (non-CAD flows are unaffected).
 */
export interface CADReportMeta {
  /** How the geometry was obtained: precise B-rep (occt), mesh (stl_parser), or
   *  the text/heuristic fallback (text_parsing) that only estimates weight. */
  geometrySource?: 'occt' | 'stl_parser' | 'text_parsing' | null;
  measuredVolumeCm3?: number | null;
  measuredWeightKg?: number | null;   // measured mass for the chosen material family
  /** Per-feature secondary-machining breakdown actually used in the cost. */
  featureLines?: FeatureMachiningLine[] | null;
  featureMachineRatePerHr?: number | null;
  featureStock?: 'near_net' | 'solid_billet' | null;
  /** True when the engineer pinned the grade / process (locks out AI + sanity). */
  userSpecifiedMaterial?: boolean;
  userSpecifiedProcess?: boolean;
  annualVolume?: number | null;
}

// ─── Shared constants ─────────────────────────────────────────────────────────
type RGB = [number, number, number];

const W  = 210;
const MG = 14;
const CW = W - MG * 2; // 182 mm

// Corporate palette
const NAVY:  RGB = [15,  32,  65];
const ORANGE:RGB = [230, 81,  0];
const SLATE: RGB = [30,  41,  59];
const GREY:  RGB = [100, 116, 139];
const LGREY: RGB = [160, 170, 185];
const LIGHT: RGB = [248, 250, 252];
const WHITE: RGB = [255, 255, 255];
const OR_LT: RGB = [255, 237, 213];
const HDR:   RGB = [232, 235, 245];
const GN:    RGB = [22,  163, 74];
const RD:    RGB = [198, 40,  40];
const AM:    RGB = [180, 83,  9];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function lastFinalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

function pageCount(doc: jsPDF): number {
  return (doc as unknown as { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages();
}

/** Add a page if fewer than `need` mm remain; reset y to top margin. */
function chk(doc: jsPDF, y: number, need: number): number {
  if (y + need > 276) { doc.addPage(); return 18; }
  return y;
}

/** Draw the full-width navy section header bar and return new y. */
function secBar(doc: jsPDF, y: number, title: string, right?: string): number {
  y = chk(doc, y, 16);
  doc.setFillColor(...NAVY);
  doc.roundedRect(MG, y, CW, 9, 1.5, 1.5, 'F');
  // Orange left accent
  doc.setFillColor(...ORANGE);
  doc.roundedRect(MG, y, 5, 9, 1, 1, 'F');
  doc.setFillColor(...NAVY); // patch rounded right edge of accent
  doc.rect(MG + 3, y, 2, 9, 'F');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...WHITE);
  doc.text(title, MG + 10, y + 6);
  if (right) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 215, 240);
    doc.text(right, W - MG - 2, y + 6, { align: 'right' });
  }
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...SLATE);
  return y + 13;
}

/** Draw a compact titled call-out box (tint fill + accent left rule + wrapped
 *  body lines). Returns the new y. Used for provenance / assumptions / exclusions
 *  / DFM advisories so they read as first-class report content, not footnotes. */
function calloutBox(
  doc: jsPDF, y: number, title: string, lines: string[],
  accent: RGB = NAVY, fill: RGB = HDR,
): number {
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
  const wrapped: string[] = [];
  for (const ln of lines) {
    const parts = doc.splitTextToSize(ln, CW - 12) as string[];
    for (const p of parts) wrapped.push(p);
  }
  const boxH = 8 + wrapped.length * 3.9 + 2;
  y = chk(doc, y, boxH + 4);
  doc.setFillColor(...fill);
  doc.roundedRect(MG, y, CW, boxH, 1.5, 1.5, 'F');
  doc.setFillColor(...accent);
  doc.rect(MG, y, 1.6, boxH, 'F');
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...accent);
  doc.text(title, MG + 5, y + 5.5);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
  let ty = y + 10.5;
  for (const w of wrapped) { doc.text(w, MG + 5, ty); ty += 3.9; }
  return y + boxH + 5;
}

/** Shared autoTable head styles. */
const TH = {
  headStyles: {
    fillColor: NAVY as RGB, textColor: WHITE as RGB,
    fontStyle: 'bold' as const, fontSize: 7.5,
    cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
  },
  alternateRowStyles: { fillColor: LIGHT as RGB },
  bodyStyles: {
    fontSize: 8, textColor: SLATE as RGB,
    cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
  },
};

/**
 * Draw the CostVision logo as crisp vector — indigo "cv" badge + blue wordmark,
 * matching the brand colours/typeface. Sharp at any size; used in every report
 * footer so branding shows on every page. `x`,`y` = top-left of the badge (mm),
 * `badgeH` = badge height (mm). Returns the total width drawn (mm).
 */
export function drawCostVisionLogo(doc: jsPDF, x: number, y: number, badgeH = 4.2): number {
  const BADGE: RGB = [79, 70, 229];   // indigo "cv" badge
  const WORD:  RGB = [37, 99, 235];   // "CostVision" blue
  const r = badgeH * 0.26;
  doc.setFillColor(...BADGE);
  doc.roundedRect(x, y, badgeH, badgeH, r, r, 'F');
  doc.setTextColor(...WHITE); doc.setFont('helvetica', 'bold'); doc.setFontSize(badgeH * 1.7);
  doc.text('cv', x + badgeH / 2, y + badgeH * 0.73, { align: 'center' });
  const wx = x + badgeH + badgeH * 0.30;
  doc.setTextColor(...WORD); doc.setFont('helvetica', 'bold'); doc.setFontSize(badgeH * 1.95);
  doc.text('CostVision', wx, y + badgeH * 0.78);
  const width = (wx - x) + doc.getTextWidth('CostVision');
  doc.setFont('helvetica', 'normal');
  return width;
}

// ════════════════════════════════════════════════════════════════════════════
//  MAIN SHOULD-COST PDF
// ════════════════════════════════════════════════════════════════════════════

/** Shared should-cost report body — §1 through §16 (breakdown, ops, machine
 *  buildup, traceability, uncertainty, sensitivity, regional 10-country
 *  comparison, carbon, insights, DFM/DFA, optimisation, roadmap, scenarios).
 *  Drawn into any jsPDF doc at cursor `y`; returns the new `y`. Used by both
 *  the standalone Should-Cost report (printPDF) and the Master report Part A. */
export function renderShouldCostSections(
  doc: jsPDF,
  y: number,
  ctx: {
    result: PartCostResult;
    input: UniversalStackInput;
    library: RateLibrary;
    currency: string;
    fxRate: number;
    commodityType: CommodityType;
    region: ManufacturingRegion;
    scenarios: Scenario[];
    cadMeta: CADReportMeta;
  },
): number {
  const { result, input, library, currency, fxRate, commodityType, region, scenarios, cadMeta } = ctx;
  const sym  = currencySymbol(currency);
  const c    = (n: number) => `${sym}${(n * fxRate).toFixed(2)}`;
  const pct  = (n: number) => `${n.toFixed(1)}%`;
  const pcts = breakdownPercentages(result);
  const alloyMat = library.materials.find(m => m.id === input.rawMaterial.materialId);

  // ════════════════════════════════════════════════════════════════════════
  // §1 — 8-Bucket Cost Breakdown
  // ════════════════════════════════════════════════════════════════════════
  y = secBar(doc, y, '§1 — 8-Bucket Cost Breakdown');

  const buckets: [string, number, number, string][] = [
    ['1.  Raw Material',         result.breakdown.rawMaterial, pcts.rawMaterial,                          ''],
    ['2.  Process (Machine)',    result.breakdown.process,     pcts.process,                              ''],
    ['3.  Direct Labour',        result.breakdown.labour,      pcts.labour,                               ''],
    ['4.  Tooling (amortised)',  result.breakdown.tooling,     pcts.tooling,                              ''],
    ['5.  Packaging',            result.breakdown.packaging,   pcts.packaging,                            ''],
    ['6.  Logistics',            result.breakdown.logistics,   pcts.logistics,                            ''],
    ['    Factory Cost',         result.factoryCost,           (result.factoryCost / result.total) * 100, 'sub'],
    ['7.  Overhead (SG&A)',      result.breakdown.overhead,    pcts.overhead,                             ''],
    ['    Subtotal',             result.subtotal,              (result.subtotal  / result.total) * 100,   'sub'],
    ['8.  Supplier Margin',      result.breakdown.margin,      pcts.margin,                               ''],
    ['TOTAL SHOULD-COST',        result.total,                 100,                                       'total'],
  ];

  // col widths: 66 + 30 + 22 + (182-118) = 66+30+22+64 = 182 ✓
  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    head: [['Cost Bucket', `Amount (${currency})`, '% of Total', 'Cost Mix Bar']],
    body: buckets.map(([lbl, val, p]) => [lbl, c(val), pct(p), '']),
    theme: 'plain',
    headStyles: { ...TH.headStyles },
    bodyStyles: { ...TH.bodyStyles },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 66 },
      1: { cellWidth: 30, halign: 'right' },
      2: { cellWidth: 22, halign: 'right' },
      3: { cellWidth: 64 },
    },
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      const rt = buckets[d.row.index]?.[3];
      if (rt === 'total') {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fontSize = 9;
        d.cell.styles.fillColor = OR_LT;
        d.cell.styles.textColor = NAVY;
      } else if (rt === 'sub') {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = HDR;
        d.cell.styles.textColor = NAVY;
      }
    },
    didDrawCell: (d) => {
      if (d.section !== 'body' || d.column.index !== 3) return;
      const p = buckets[d.row.index]?.[2] ?? 0;
      if (p <= 0) return;
      const rt  = buckets[d.row.index]?.[3];
      const maxW = d.cell.width - 8;
      const fillW = Math.max((p / 100) * maxW, 0.8);
      const barH  = 3.5;
      const bx    = d.cell.x + 4;
      const by    = d.cell.y + (d.cell.height - barH) / 2;
      doc.setFillColor(220, 225, 238);
      doc.roundedRect(bx, by, maxW, barH, 0.8, 0.8, 'F');
      doc.setFillColor(...(rt === 'total' ? NAVY : rt === 'sub' ? SLATE : ORANGE));
      doc.roundedRect(bx, by, fillW, barH, 0.8, 0.8, 'F');
    },
  });
  y = lastFinalY(doc) + 5;

  if ((result.toolingNRE ?? 0) > 0) {
    doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...GREY);
    doc.text(`NRE / Tooling (one-time, excluded from unit cost): ${c(result.toolingNRE!)}`, MG, y);
    y += 6;
  }

  // ── §2 Commercial Parameters ─────────────────────────────────────────────
  y = chk(doc, y, 30);
  y = secBar(doc, y, '§2 — Commercial Parameters');

  // col widths: 44 + 50 + 44 + (182-138) = 44+50+44+44 = 182 ✓
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
    bodyStyles: { fontSize: 8, cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 } },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 44, textColor: GREY },
      1: { cellWidth: 50, fontStyle: 'bold', textColor: NAVY },
      2: { cellWidth: 44, textColor: GREY },
      3: { cellWidth: 44, fontStyle: 'bold', textColor: NAVY },
    },
  });
  y = lastFinalY(doc) + 10;

  // ════════════════════════════════════════════════════════════════════════
  // §3 — Material Detail  (new page)
  // ════════════════════════════════════════════════════════════════════════
  doc.addPage(); y = 18;

  const mat     = library.materials.find(m => m.id === input.rawMaterial.materialId);
  const grossWt = input.rawMaterial.directCost === undefined
    ? input.rawMaterial.netWeightKg / input.rawMaterial.materialUtilization : 0;
  const scrapWt    = Math.max(0, grossWt - input.rawMaterial.netWeightKg);
  const scrapValue = scrapWt * (mat?.scrapRecoveryPricePerKg ?? 0);

  y = secBar(doc, y, '§3 — Material Detail');

  const matRows: string[][] = [
    ['Material ID',                input.rawMaterial.materialId,                             'ID',           ''],
    ['Grade / Specification',      mat?.grade ?? 'Direct Cost Entry',                        '',             mat?.sourceNote ?? ''],
    ['Region',                     mat?.region ?? '—',                                       '',             ''],
    ['Net Finished Weight',        `${input.rawMaterial.netWeightKg.toFixed(4)} kg`,         'kg',           'Weight in finished part'],
  ];

  if (input.rawMaterial.directCost !== undefined) {
    matRows.push(['Direct Material Cost', c(input.rawMaterial.directCost), currency, 'Bypasses weight-based model']);
  } else {
    matRows.push(
      ['Gross Weight (stock)',        `${grossWt.toFixed(4)} kg`,                              'kg',           'Net ÷ utilisation ratio'],
      ['Scrap / Runner Weight',       `${scrapWt.toFixed(4)} kg`,                             'kg',           'Gross - Net'],
      ['Material Utilisation',        pct(input.rawMaterial.materialUtilization * 100),        '%',            'Benchmark: casting 65–85 %, machining 60–75 %'],
      ['Material Price',              c(mat?.pricePerKg ?? 0),                                `${currency}/kg`, mat?.sourceNote ?? ''],
      ['Scrap Recovery Price',        c(mat?.scrapRecoveryPricePerKg ?? 0),                   `${currency}/kg`, ''],
      ['Gross Material Cost',         c(grossWt * (mat?.pricePerKg ?? 0)),                    currency,       'Gross × price/kg'],
      ['Scrap Credit',                `-${c(scrapValue)}`,                                    currency,       'Scrap × recovery price'],
    );
    if ((input.rawMaterial.consumablesCostPerPart ?? 0) > 0) {
      matRows.push(['Consumables (core / wax / shell)', c(input.rawMaterial.consumablesCostPerPart!), currency, 'Per-part recurring']);
    }
    matRows.push(['NET RAW MATERIAL COST', c(result.breakdown.rawMaterial), currency, 'Gross - scrap credit + consumables']);
  }
  matRows.push(
    ['', '', '', ''],
    ['Data Confidence', mat?.confidence ?? '—', '', ''],
    ['Effective Date',  mat?.effectiveDate ?? '—', '', ''],
  );

  // col widths: 58 + 34 + 14 + (182-106) = 58+34+14+76 = 182 ✓
  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    head: [['Parameter', 'Value', 'Unit', 'Notes']],
    body: matRows,
    theme: 'plain',
    headStyles: { ...TH.headStyles },
    bodyStyles: { ...TH.bodyStyles },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 58, textColor: GREY },
      1: { cellWidth: 34, halign: 'right', fontStyle: 'bold' },
      2: { cellWidth: 14, textColor: GREY },
      3: { cellWidth: 76, textColor: GREY, fontSize: 7.5 },
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
  y = lastFinalY(doc) + 8;

  // ── Alloy / specification advisory (casting commodities) ──────────────────
  // A general die-cast alloy on a safety-critical structural part is the exact
  // silent mis-spec the knuckle exposed. Flag it; don't leave it implicit.
  const matId = input.rawMaterial.materialId.toLowerCase();
  const isCasting = /cast/.test(commodityType);
  const generalDieCast = /adc12|a380|a383|a413|a319|a360|zamak/.test(matId);
  const hasHeatTreatOp = result.operationDetails.some(op => /heat|t6|t7|solution|age|temper|ndt|x-?ray/i.test(op.operationName));
  if (isCasting && generalDieCast) {
    const bullets = [
      `Selected grade "${alloyMat?.grade ?? input.rawMaterial.materialId}" is a GENERAL die-cast alloy (good castability, not high-ductility).`,
      'For safety-critical / structural parts (steering, suspension, brake, chassis, sub-frame) a structural HPDC alloy — Silafont-36, Aural-5 or Castasil-37 — plus T7 heat-treat and 100% NDT/X-ray is typically mandated.',
    ];
    if (!hasHeatTreatOp) bullets.push('No heat-treat or NDT operation is present in this cost. If the part is structural, add them (they raise the true cost) or confirm the part is non-structural.');
    y = calloutBox(doc, y, 'Alloy & Specification Check', bullets, AM, OR_LT);
  }

  // ════════════════════════════════════════════════════════════════════════
  // §4 — Operations Detail  (split into two focused tables)
  // ════════════════════════════════════════════════════════════════════════
  y = chk(doc, y, 22);
  y = secBar(doc, y, '§4 — Operations Detail');

  // Sub-label
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text('4A  Machine Operations', MG, y); y += 5;

  // Table 4A: Machine side
  // col widths: 42 + 32 + 22 + 18 + 18 + (182-132) = 42+32+22+18+18+50 = 182 ✓
  const opRowsA = result.operationDetails.map(op => {
    const mObj = library.machines.find(m => m.id === op.machineId);
    return [
      op.operationName,
      mObj?.machineClass ?? op.machineId,
      c(op.machineRateUsed),
      (op.cycleTimeHr * 60).toFixed(2),
      pct(op.oee * 100),
      c(op.processCost),
    ];
  });
  opRowsA.push(['TOTAL', '', '', '', '', c(result.breakdown.process)]);

  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    head: [['Operation', 'Machine Class', 'Rate / hr', 'Cycle (min)', 'OEE %', 'Machine Cost']],
    body: opRowsA,
    theme: 'plain',
    headStyles: { ...TH.headStyles, fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: SLATE, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 } },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 32 },
      2: { cellWidth: 22, halign: 'right' },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 18, halign: 'right' },
      5: { cellWidth: 50, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (d) => {
      if (d.section === 'body' && d.row.index === opRowsA.length - 1) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = OR_LT;
        d.cell.styles.textColor = NAVY;
      }
    },
  });
  y = lastFinalY(doc) + 6;

  y = chk(doc, y, 22);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text('4B  Labour Detail', MG, y); y += 5;

  // Table 4B: Labour side
  // col widths: 42 + 26 + 22 + 14 + 16 + 14 + 24 + (182-158) = 42+26+22+14+16+14+24+24 = 182 ✓
  const opRowsB = result.operationDetails.map(op => {
    const lObj = library.labour.find(l => l.id === op.labourId);
    return [
      op.operationName,
      lObj?.skillLevel ?? op.labourId,
      c(op.labourRateUsed),
      String(op.manning),
      (op.labourTimeHr * 60).toFixed(2),
      pct(op.labourEfficiency * 100),
      c(op.labourCost),
      c(op.processCost + op.labourCost),
    ];
  });
  opRowsB.push(['TOTAL', '', '', '', '', '', c(result.breakdown.labour), c(result.breakdown.process + result.breakdown.labour)]);

  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    head: [['Operation', 'Labour Grade', 'Rate / hr', 'Manning', 'Lab. min', 'Eff %', 'Labour Cost', 'Op Total']],
    body: opRowsB,
    theme: 'plain',
    headStyles: { ...TH.headStyles, fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: SLATE, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 } },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 26 },
      2: { cellWidth: 22, halign: 'right' },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 16, halign: 'right' },
      5: { cellWidth: 14, halign: 'right' },
      6: { cellWidth: 24, halign: 'right' },
      7: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (d) => {
      if (d.section === 'body' && d.row.index === opRowsB.length - 1) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = OR_LT;
        d.cell.styles.textColor = NAVY;
      }
    },
  });
  y = lastFinalY(doc) + 10;

  // ── 4C  Per-feature machining audit (from measured geometry) ──────────────
  // Every detected feature gets a row with its machining time and whether it was
  // COSTED — so an under-count (features detected but not machined) is visible,
  // not silent. This is the audit surface the knuckle case exposed.
  if (cadMeta.featureLines && cadMeta.featureLines.length > 0) {
    y = chk(doc, y, 26);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
    doc.text('4C  Machined Features — Geometry Audit', MG, y); y += 5;

    const rate = cadMeta.featureMachineRatePerHr ?? 0;
    const kindLbl: Record<string, string> = { hole: 'Hole / bore', boss: 'Boss', face: 'Face', pocket: 'Pocket', slot: 'Slot' };
    let costedMin = 0, notMin = 0, costedCnt = 0, notCnt = 0;
    const featRows = cadMeta.featureLines.map(l => {
      const dim = (l.kind === 'hole' || l.kind === 'boss')
        ? `Ø${l.diaMm.toFixed(1)} × ${l.depthMm.toFixed(0)}${l.kind === 'hole' ? (l.through ? ' thru' : ' blind') : ''}`
        : `${Math.round(l.areaMm2 ?? 0)} mm²${l.depthMm > 0 ? ` × ${l.depthMm.toFixed(0)}` : ''}`;
      const lineCost = (l.totalMinutes / 60) * rate;
      if (l.included) { costedMin += l.totalMinutes; costedCnt += l.count; } else { notMin += l.totalMinutes; notCnt += l.count; }
      return [
        kindLbl[l.kind] ?? l.kind,
        dim,
        String(l.count),
        l.operation,
        l.totalMinutes.toFixed(2),
        l.included ? c(lineCost) : '—',
        l.included ? 'Yes' : 'No',
      ];
    });
    featRows.push(['TOTAL costed', '', String(costedCnt), '', costedMin.toFixed(2), c((costedMin / 60) * rate), 'Yes']);

    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG },
      head: [['Feature', 'Ø×depth / area', 'Qty', 'Operation', 'Min', 'Cost', 'Costed?']],
      body: featRows,
      theme: 'plain',
      headStyles: { ...TH.headStyles, fontSize: 7 },
      bodyStyles: { fontSize: 7, textColor: SLATE, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 } },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: {
        0: { cellWidth: 26 }, 1: { cellWidth: 34 }, 2: { cellWidth: 12, halign: 'right' },
        3: { cellWidth: 54, fontSize: 6.5, textColor: GREY }, 4: { cellWidth: 18, halign: 'right' },
        5: { cellWidth: 22, halign: 'right' }, 6: { cellWidth: 16, halign: 'center' },
      },
      didParseCell: (d) => {
        if (d.section !== 'body') return;
        const isTotal = d.row.index === featRows.length - 1;
        if (isTotal) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = OR_LT; d.cell.styles.textColor = NAVY; return; }
        if (d.column.index === 6) {
          const v = Array.isArray(d.cell.text) ? d.cell.text[0] : String(d.cell.text);
          if (v === 'No') { d.cell.styles.textColor = RD; d.cell.styles.fontStyle = 'bold'; }
          else { d.cell.styles.textColor = GN; }
        }
      },
    });
    y = lastFinalY(doc) + 4;
    if (notCnt > 0) {
      y = calloutBox(doc, y, `${notCnt} detected feature(s) NOT costed`, [
        `${notCnt} machinable feature instance(s) (${notMin.toFixed(1)} min) were detected in the geometry but are NOT included in this cost — on a near-net part they may be as-cast. If they are machined, tick them in the Machined-Features panel and re-cost; this could add up to ${c((notMin / 60) * rate)}.`,
      ], AM, OR_LT);
    } else {
      y += 4;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // §5 — Machine Rate Buildup
  // ════════════════════════════════════════════════════════════════════════
  doc.addPage(); y = 18;
  y = secBar(doc, y, '§5 — Machine Rate Buildup');

  const usedIds  = new Set(result.operationDetails.map(op => op.machineId));
  const machRows: (string | { content: string; colSpan?: number; styles?: Record<string, unknown> })[][] = [];

  library.machines.filter(m => usedIds.has(m.id)).forEach(mach => {
    const b   = mach.buildup;
    const eff = b.annualAvailableHours * b.machineUtilization;
    const tot = b.annualDepreciation + b.maintenance + b.energy + b.floorSpace + b.indirectSupport + b.financeCost;
    const rh  = (n: number) => c(n / eff);

    machRows.push([{
      content: `${mach.machineClass}  [${mach.id}]  ·  Confidence: ${mach.confidence}  ·  ${mach.sourceNote}`,
      colSpan: 4,
      styles: { fontStyle: 'bold', fillColor: HDR, textColor: NAVY, fontSize: 7.5, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
    } as unknown as string]);

    const subHead = (t: string, align: string = 'left') =>
      ({ content: t, styles: { fontStyle: 'bold', textColor: GREY, halign: align, fontSize: 7, fillColor: WHITE, cellPadding: { top: 2, bottom: 2, left: 4, right: 4 } } } as unknown as string);
    machRows.push([subHead('Cost Component'), subHead(`Annual Cost (${currency})`, 'right'), subHead(`Rate/hr  @${(b.machineUtilization*100).toFixed(0)}% util`, 'right'), subHead('Notes')]);

    const row = (lbl: string, ann: number, notes = '') =>
      [lbl, c(ann), rh(ann), notes];
    machRows.push(row('Depreciation',    b.annualDepreciation, `${b.annualAvailableHours.toLocaleString()} hr/yr available`));
    machRows.push(row('Maintenance',     b.maintenance));
    machRows.push(row('Energy',          b.energy));
    machRows.push(row('Floor Space',     b.floorSpace));
    machRows.push(row('Indirect Support',b.indirectSupport));
    machRows.push(row('Finance Cost',    b.financeCost));
    machRows.push([`TOTAL — ${mach.machineClass}`, c(tot), c(mach.computedRatePerHr), `Effective hours: ${eff.toFixed(0)}/yr`]);
    machRows.push(['', '', '', '']);
  });

  if (machRows.length > 0) {
    // col widths: 54 + 34 + 34 + (182-122) = 54+34+34+60 = 182 ✓
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG },
      body: machRows as string[][],
      theme: 'plain',
      bodyStyles: { fontSize: 8, textColor: SLATE, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 } },
      columnStyles: {
        0: { cellWidth: 54 },
        1: { cellWidth: 34, halign: 'right' },
        2: { cellWidth: 34, halign: 'right' },
        3: { cellWidth: 60, textColor: GREY, fontSize: 7.5 },
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
    y = lastFinalY(doc) + 6;
    y = calloutBox(doc, y, 'How to read the machine rate', [
      'Rate/hr = (annual depreciation + maintenance + energy + floor + indirect + finance) ÷ effective hours, where effective hours = available hours × utilisation.',
      'Effective hours encode the shift pattern: a lower hours-base raises £/hr and a higher one lowers it. A challenge from a supplier will target this divisor and whether depreciation is machine-only or full-cell (machine + dosing furnace + trim + robots/extraction) — state your basis when defending the number.',
    ], NAVY, HDR);
  }

  // ════════════════════════════════════════════════════════════════════════
  // §6 — Rate Traceability
  // ════════════════════════════════════════════════════════════════════════
  y = chk(doc, y, 22);
  y = secBar(doc, y, '§6 — Rate Traceability');

  // col widths: 48 + 20 + 12 + 64 + 24 + 14 = 182 ✓
  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    head: [['Field', 'Value', 'Unit', 'Source / Reference', 'Rate ID', 'Conf.']],
    body: result.traceability.map(t => [t.field, t.value.toFixed(4), t.unit, t.rateSource, t.rateId, t.confidence]),
    theme: 'plain',
    headStyles: { ...TH.headStyles, fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: SLATE, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 } },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 48 },
      1: { cellWidth: 20, halign: 'right' },
      2: { cellWidth: 12 },
      3: { cellWidth: 64, textColor: GREY, fontSize: 7 },
      4: { cellWidth: 24, fontSize: 7 },
      5: { cellWidth: 14 },
    },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 5) {
        const v = Array.isArray(d.cell.text) ? d.cell.text[0] : String(d.cell.text);
        if (v === 'High')        { d.cell.styles.textColor = GN;   d.cell.styles.fontStyle = 'bold'; }
        else if (v === 'Low')    { d.cell.styles.textColor = RD;   d.cell.styles.fontStyle = 'bold'; }
        else                     { d.cell.styles.textColor = AM; }
      }
    },
  });
  y = lastFinalY(doc) + 10;

  // ════════════════════════════════════════════════════════════════════════
  // §7 — Should-Cost with Uncertainty (Monte-Carlo)
  // ════════════════════════════════════════════════════════════════════════
  doc.addPage(); y = 18;
  {
    // When geometry was NOT measured (text/heuristic fallback), the volume/weight
    // themselves are guesses — so the band must widen beyond what the rate
    // confidences alone imply. Force a Low-plus base CV in that case.
    const geomEstimated = cadMeta.geometrySource === 'text_parsing';
    const u = computeCostUncertainty(result, input, geomEstimated ? { baseCvOverride: 0.28 } : {});
    const confShown = geomEstimated ? 'Low' : u.overallConfidence;
    y = secBar(doc, y, '§7 — Should-Cost with Uncertainty', `Monte-Carlo  ·  ${confShown} confidence`);
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG }, theme: 'grid',
      head: [['Estimate (± band)', 'P10 · optimistic', 'P50 · median', 'P90 · conservative', 'Band', 'CV']],
      body: [[`${c(result.total)}  ± ${u.plusMinusPct}%`, c(u.p10), c(u.p50), c(u.p90), String(u.band), `${u.cvPct}%`]],
      headStyles: { fillColor: NAVY as RGB, textColor: WHITE as RGB, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 8.5, cellPadding: 3, halign: 'center' },
      columnStyles: { 0: { fontStyle: 'bold', textColor: NAVY as RGB } },
    });
    y = lastFinalY(doc) + 3;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GREY);
    const note = doc.splitTextToSize('Range reflects how well each cost driver is known (High / Medium / Low confidence). Tighten it by attaching CAD, a BOM, or logging an actual quote.', CW);
    doc.text(note, MG, y + 3); y += note.length * 3.6 + 4;

    // Confidence-driver line — WHY the band is what it is (not just the grade).
    const lowRates = result.traceability.filter(t => t.confidence === 'Low').length;
    const drivers: string[] = [];
    if (geomEstimated) drivers.push('geometry weight/volume estimated (not measured)');
    if (lowRates > 0) drivers.push(`${lowRates} rate(s) at Low confidence`);
    drivers.push('tooling amortisation carries the widest per-bucket spread');
    if (cadMeta.featureLines?.some(l => !l.included)) drivers.push('some detected features not costed (see §4C)');
    y = calloutBox(doc, y, `Why confidence is ${confShown}`, [
      `Main band drivers: ${drivers.join('; ')}.`,
    ], confShown === 'High' ? GN : confShown === 'Medium' ? AM : RD,
       confShown === 'High' ? [237, 247, 237] : confShown === 'Low' ? [252, 236, 236] : OR_LT);
  }

  // ── What's excluded from this unit cost ───────────────────────────────────
  // One consolidated list, so silence never reads as "included". Some items are
  // conditional — heat-treat/NDT only flagged when no such operation is present.
  {
    const excl: string[] = [
      'One-time NRE — tooling / die, fixtures and CNC programming — is amortised separately, not in this unit cost.',
      'Import duty and international freight (regional table is Ex-Works).',
      'Formal embodied-carbon reporting (figures are indicative cradle-to-gate — replace with supplier EPDs).',
    ];
    if (isCasting && !hasHeatTreatOp) excl.push('Heat-treat (T6/T7), HIP and 100% NDT/X-ray are NOT in this cost — add them for structural / safety-critical parts.');
    if (isCasting) excl.push('Trim/degate, shot-blast/deflash and impregnation are only included where shown as operations.');
    if (cadMeta.geometrySource === 'text_parsing') excl.push('A measured geometry — this cost used an ESTIMATED weight/volume (see Geometry Provenance).');
    y = calloutBox(doc, y, "What's excluded from this unit cost", excl, GREY, HDR);
  }

  // ════════════════════════════════════════════════════════════════════════
  // §8 — Sensitivity Analysis
  // ════════════════════════════════════════════════════════════════════════
  {
    const sens = runSensitivity(input, library, 10);
    if (sens.drivers.length) {
      y = chk(doc, y, 46);
      y = secBar(doc, y, '§8 — Sensitivity Analysis', `± ${sens.variationPct}% driver swing  ·  ranked by ${sym} impact`);
      const r1 = (n: number) => Math.round(n * 10) / 10;
      const r2v = (n: number) => Math.round(n * 100) / 100;
      autoTable(doc, {
        startY: y, margin: { left: MG, right: MG }, theme: 'grid',
        head: [['Cost Driver', 'Base', `-${sens.variationPct}% cost`, `+${sens.variationPct}% cost`, `Range ${sym}`]],
        body: sens.drivers.slice(0, 8).map(d => {
          // Monetary drivers carry a '£' in their unit (e.g. "£/kg", "£/hr") and a
          // GBP-denominated baseValue. Convert those to the display currency + symbol;
          // non-money drivers (%, hr, parts) stay as-is. (The header/Range use `sym`.)
          const money = d.unit.includes('£');
          const base = money ? `${c(d.baseValue)}${d.unit.replace('£', '')}` : `${r2v(d.baseValue)}${d.unit}`;
          return [d.driver, base,
            `${d.minusPct > 0 ? '+' : ''}${r1(d.minusPct)}%`, `${d.plusPct > 0 ? '+' : ''}${r1(d.plusPct)}%`, c(d.range)];
        }),
        headStyles: { fillColor: NAVY as RGB, textColor: WHITE as RGB, fontStyle: 'bold', fontSize: 7.5 },
        bodyStyles: { fontSize: 8, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: LIGHT as RGB },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } },
      });
      y = lastFinalY(doc) + 8;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // §9 — Regional Cost Comparison (Ex-Works)
  // ════════════════════════════════════════════════════════════════════════
  {
    // Re-base to the region the part was costed in, so the source-region row
    // equals the headline should-cost (not a UK breakdown scaled the wrong way).
    const rc = computeRegionalComparison(result.breakdown, { landed: false, sourceRegion: region as ManufacturingRegion });
    const cheapest = Math.min(...rc.map(r => r.total));
    const baseName = rc.find(r => r.isBase)?.name ?? 'base';
    doc.addPage(); y = 18;
    y = secBar(doc, y, '§9 — Regional Cost Comparison', `Ex-Works  ·  per-region should-cost  ·  vs ${baseName}`);
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG }, theme: 'grid',
      head: [['Region', 'Material', 'Process', 'Labour', 'Tooling', 'Overhead', 'Ex-Works', 'Logistics', 'Total', `vs ${baseName}`]],
      body: rc.map(r => [
        `${r.name} (${r.currency})`, c(r.material), c(r.process), c(r.labour), c(r.tooling), c(r.overhead), c(r.exWorks), c(r.logistics), c(r.total),
        r.isBase ? 'Base' : `${r.vsBasePct >= 0 ? '-' : '+'}${Math.abs(r.vsBasePct).toFixed(0)}%`,
      ]),
      headStyles: { fillColor: NAVY as RGB, textColor: WHITE as RGB, fontStyle: 'bold', fontSize: 6.5 },
      bodyStyles: { fontSize: 6.9, cellPadding: 1.8 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 26 }, 6: { fontStyle: 'bold' }, 8: { fontStyle: 'bold' }, 9: { halign: 'center', fontStyle: 'bold' } },
      didParseCell: (d: { section: string; row: { index: number }; column: { index: number }; cell: { styles: { fillColor?: unknown; textColor?: unknown } } }) => {
        if (d.section !== 'body') return;
        const row = rc[d.row.index];
        if (row.isBase) d.cell.styles.fillColor = HDR as RGB;
        if (d.column.index === 8 && Math.abs(row.total - cheapest) < 0.005) { d.cell.styles.fillColor = [220, 252, 231] as RGB; d.cell.styles.textColor = GN as RGB; }
        if (d.column.index === 9 && !row.isBase) d.cell.styles.textColor = (row.vsBasePct >= 0 ? GN : RD) as RGB;
      },
    });
    y = lastFinalY(doc) + 3;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GREY);
    doc.text('Per-region should-cost using regional labour, energy and rate benchmarks. Tooling held fixed. Ex-Works — excludes import duty + international freight. Indicative — confirm with RFQ.', MG, y + 3, { maxWidth: CW });
    y += 12;
  }

  // ════════════════════════════════════════════════════════════════════════
  // §10 — Embodied Carbon
  // ════════════════════════════════════════════════════════════════════════
  {
    const cb = computeCarbon({ result, input, library, commodity: commodityType, region });
    y = chk(doc, y, 42);
    y = secBar(doc, y, '§10 — Embodied Carbon', `${cb.totalKgCO2e.toFixed(2)} kgCO2e  ·  ${cb.perNetKgCO2e.toFixed(2)} /kg  ·  cradle-to-gate`);
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG }, theme: 'plain',
      body: [
        ['Material', `${cb.materialKgCO2e.toFixed(2)} kgCO2e`, 'Material factor', `${cb.materialFactorKgPerKg.toFixed(2)} kg/kg (${cb.materialClass})`],
        ['Process', `${cb.processKgCO2e.toFixed(2)} kgCO2e`, 'Grid intensity', `${cb.gridKgPerKwh.toFixed(3)} kg/kWh · ${cb.processKwh.toFixed(2)} kWh`],
        ['Logistics', `${cb.logisticsKgCO2e.toFixed(2)} kgCO2e`, 'Total', `${cb.totalKgCO2e.toFixed(2)} kgCO2e`],
      ],
      bodyStyles: { fontSize: 8, cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 } },
      alternateRowStyles: { fillColor: LIGHT as RGB },
      columnStyles: { 0: { cellWidth: 44, textColor: GREY as RGB }, 1: { cellWidth: 50, fontStyle: 'bold', textColor: NAVY as RGB }, 2: { cellWidth: 44, textColor: GREY as RGB }, 3: { cellWidth: 44, fontStyle: 'bold', textColor: NAVY as RGB } },
    });
    y = lastFinalY(doc) + 3;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GREY);
    doc.text('Indicative cradle-to-gate factors — replace with supplier EPDs for formal reporting.', MG, y + 3, { maxWidth: CW });
    y += 10;
  }

  // ════════════════════════════════════════════════════════════════════════
  // §11 — Cost Intelligence Insights
  // ════════════════════════════════════════════════════════════════════════
  const insights = generateInsights(result, input, library, commodityType);
  if (insights.length > 0) {
    doc.addPage(); y = 18;
    y = secBar(doc, y, '§11 — Cost Intelligence Insights', `${insights.length} findings  ·  ~${totalPotentialSaving(insights).toFixed(0)}% combined saving`);

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
        styles: {
          fontStyle: 'bold', fillColor: HDR as RGB,
          textColor: impCol(ins.impact), fontSize: 8,
          cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
        },
      }]);
      insRows.push(['Finding', ins.finding]);
      insRows.push(['Impact', `${ins.impact}${ins.potentialSavingPct > 0 ? `  ·  up to ${ins.potentialSavingPct.toFixed(0)}% potential saving` : ''}`]);
      if (ins.benchmark) {
        insRows.push(['Benchmark', `${ins.benchmark.label}: yours ${ins.benchmark.yourValue.toFixed(1)}${ins.benchmark.unit} vs industry ${ins.benchmark.industryLow}–${ins.benchmark.industryHigh}${ins.benchmark.unit}`]);
      }
      ins.actions.slice(0, 2).forEach((act, i) => insRows.push([`Action ${i + 1}`, act]));
      insRows.push(['', '']);
    });

    // col widths: 26 + (182-26) = 26+156 = 182 ✓
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG },
      body: insRows as string[][],
      theme: 'plain',
      bodyStyles: { fontSize: 7.5, textColor: SLATE, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 } },
      columnStyles: {
        0: { cellWidth: 26, textColor: GREY, fontStyle: 'bold', fontSize: 7 },
        1: { cellWidth: 156 },
      },
    });
    y = lastFinalY(doc) + 8;
  }

  // ════════════════════════════════════════════════════════════════════════
  // §8 + §9 — DFM / DFA, §10 — Optimisation, §11 — Roadmap
  // ════════════════════════════════════════════════════════════════════════
  try {
    const dfm = generateDFMDFA(result, input, commodityType);

    // §8 DFM
    y = chk(doc, y, 22);
    y = secBar(doc, y, '§12 — Design for Manufacture (DFM)', `Score: ${dfm.dfm.score.toFixed(1)}/10  ·  Saving Potential: ${dfm.dfm.totalSavingPct.toFixed(0)}%`);

    if (dfm.dfm.summary) {
      const ls = doc.splitTextToSize(dfm.dfm.summary, CW) as string[];
      doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...GREY);
      doc.text(ls, MG, y); y += ls.length * 4.2 + 5;
    }

    if (dfm.dfm.issues.length > 0) {
      // col widths: 18 + 20 + 28 + 44 + 12 + 14 + (182-136) = 136+46 = 182 ✓
      autoTable(doc, {
        startY: y, margin: { left: MG, right: MG },
        head: [['Sev.', 'Category', 'Issue', 'Description', 'Save%', 'Risk', 'Recommendation']],
        body: dfm.dfm.issues.map(i => [i.severity.toUpperCase(), i.category, i.title, i.description, `${i.savingPct.toFixed(0)}%`, i.risk, i.recommendation]),
        theme: 'plain',
        headStyles: { ...TH.headStyles, fontSize: 7 },
        bodyStyles: { fontSize: 7, textColor: SLATE, cellPadding: 2.5, overflow: 'linebreak' },
        alternateRowStyles: { fillColor: LIGHT },
        columnStyles: {
          0: { cellWidth: 18, fontStyle: 'bold' },
          1: { cellWidth: 20 },
          2: { cellWidth: 28, fontStyle: 'bold' },
          3: { cellWidth: 44, textColor: GREY },
          4: { cellWidth: 12, halign: 'right' },
          5: { cellWidth: 14 },
          6: { cellWidth: 46 },
        },
        didParseCell: (d) => {
          if (d.section === 'body' && d.column.index === 0) {
            const sev = dfm.dfm.issues[d.row.index]?.severity;
            d.cell.styles.textColor = sev === 'critical' ? RD : sev === 'major' ? AM : sev === 'opportunity' ? GN : GREY;
          }
        },
      });
      y = lastFinalY(doc) + 8;
    } else {
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GN);
      doc.text('No DFM issues detected for this part and process combination.', MG, y); y += 10;
    }

    // §9 DFA
    y = chk(doc, y, 22);
    y = secBar(doc, y, '§13 — Design for Assembly (DFA)', `Score: ${dfm.dfa.score.toFixed(1)}/10  ·  Saving Potential: ${dfm.dfa.totalSavingPct.toFixed(0)}%`);

    if (dfm.dfa.summary) {
      const ls = doc.splitTextToSize(dfm.dfa.summary, CW) as string[];
      doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...GREY);
      doc.text(ls, MG, y); y += ls.length * 4.2 + 5;
    }

    if (dfm.dfa.issues.length > 0) {
      autoTable(doc, {
        startY: y, margin: { left: MG, right: MG },
        head: [['Sev.', 'Category', 'Issue', 'Description', 'Save%', 'Risk', 'Recommendation']],
        body: dfm.dfa.issues.map(i => [i.severity.toUpperCase(), i.category, i.title, i.description, `${i.savingPct.toFixed(0)}%`, i.risk, i.recommendation]),
        theme: 'plain',
        headStyles: { ...TH.headStyles, fontSize: 7 },
        bodyStyles: { fontSize: 7, textColor: SLATE, cellPadding: 2.5, overflow: 'linebreak' },
        alternateRowStyles: { fillColor: LIGHT },
        columnStyles: {
          0: { cellWidth: 18, fontStyle: 'bold' },
          1: { cellWidth: 20 },
          2: { cellWidth: 28, fontStyle: 'bold' },
          3: { cellWidth: 44, textColor: GREY },
          4: { cellWidth: 12, halign: 'right' },
          5: { cellWidth: 14 },
          6: { cellWidth: 46 },
        },
        didParseCell: (d) => {
          if (d.section === 'body' && d.column.index === 0) {
            const sev = dfm.dfa.issues[d.row.index]?.severity;
            d.cell.styles.textColor = sev === 'critical' ? RD : sev === 'major' ? AM : sev === 'opportunity' ? GN : GREY;
          }
        },
      });
      y = lastFinalY(doc) + 8;
    } else {
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GN);
      doc.text('No DFA issues detected for this part and process combination.', MG, y); y += 10;
    }

    // §10 Cost Optimisation
    if (dfm.costOptimisations.length > 0) {
      y = chk(doc, y, 22);
      y = secBar(doc, y, '§14 — Cost Optimisation Opportunities',
        `${dfm.costOptimisations.length} actions  ·  Total Potential: ${dfm.totalPotentialSavingPct.toFixed(0)}%`);

      // col widths: 30 + 36 + 12 + 22 + 12 + (182-112) = 112+70 = 182 ✓
      autoTable(doc, {
        startY: y, margin: { left: MG, right: MG },
        head: [['Action', 'Description', 'Save%', 'Timeframe', 'Risk', 'Technical Justification']],
        body: dfm.costOptimisations.map(o => [o.title, o.description, `${o.expectedSavingPct.toFixed(0)}%`, o.timeframe, o.risk, o.technicalJustification]),
        theme: 'plain',
        headStyles: { ...TH.headStyles, fontSize: 7 },
        bodyStyles: { fontSize: 7, textColor: SLATE, cellPadding: 2.5, overflow: 'linebreak' },
        alternateRowStyles: { fillColor: LIGHT },
        columnStyles: {
          0: { cellWidth: 30, fontStyle: 'bold' },
          1: { cellWidth: 36 },
          2: { cellWidth: 12, halign: 'right' },
          3: { cellWidth: 22 },
          4: { cellWidth: 12 },
          5: { cellWidth: 70, textColor: GREY },
        },
        didParseCell: (d) => {
          if (d.section !== 'body') return;
          const o = dfm.costOptimisations[d.row.index];
          if (!o) return;
          if (d.column.index === 3) {
            d.cell.styles.textColor = o.timeframe === 'Quick Win' ? GN : o.timeframe === 'Medium Term' ? AM : GREY;
          }
          if (d.column.index === 2 && o.expectedSavingPct >= 10) {
            d.cell.styles.fontStyle = 'bold'; d.cell.styles.textColor = GN;
          }
        },
      });
      y = lastFinalY(doc) + 8;
    }

    // §11 Roadmap
    if (dfm.quickWins.length > 0 || dfm.longTermChanges.length > 0) {
      y = chk(doc, y, 22);
      y = secBar(doc, y, '§15 — Implementation Roadmap');

      if (dfm.quickWins.length > 0) {
        doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...GN);
        doc.text('Quick Wins — Implement Immediately', MG, y); y += 6;
        dfm.quickWins.forEach(w => {
          y = chk(doc, y, 8);
          const ls = doc.splitTextToSize(`•  ${w}`, CW - 8) as string[];
          doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
          doc.text(ls, MG + 6, y); y += ls.length * 4.5;
        });
        y += 4;
      }
      if (dfm.longTermChanges.length > 0) {
        y = chk(doc, y, 16);
        doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...GREY);
        doc.text('Long-Term Changes — Strategic Investment', MG, y); y += 6;
        dfm.longTermChanges.forEach(w => {
          y = chk(doc, y, 8);
          const ls = doc.splitTextToSize(`•  ${w}`, CW - 8) as string[];
          doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
          doc.text(ls, MG + 6, y); y += ls.length * 4.5;
        });
      }
    }
  } catch {
    // DFM/DFA not available for this commodity — silently skip
  }

  // ════════════════════════════════════════════════════════════════════════
  // §16 — Saved Scenarios (only when the user has saved any)
  // ════════════════════════════════════════════════════════════════════════
  if (scenarios.length > 0) {
    y = chk(doc, y, 40);
    y = secBar(doc, y, '§16 — Saved Scenarios', `${scenarios.length} scenario${scenarios.length === 1 ? '' : 's'}  ·  vs this costing`);
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG }, theme: 'grid',
      head: [['Scenario', 'Total', 'vs this costing', 'Saved']],
      body: scenarios.map(s => {
        const delta = result.total > 0 ? ((s.result.total - result.total) / result.total) * 100 : 0;
        return [
          s.name + (s.description ? ` — ${s.description}` : ''), c(s.result.total),
          Math.abs(delta) < 0.05 ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`,
          new Date(s.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        ];
      }),
      headStyles: { fillColor: NAVY as RGB, textColor: WHITE as RGB, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 8, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: LIGHT as RGB },
      columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' }, 2: { halign: 'right', fontStyle: 'bold' }, 3: { halign: 'right', textColor: GREY as RGB } },
    });
  }

  return y;
}

export function printPDF(
  result: PartCostResult,
  input:  UniversalStackInput,
  library: RateLibrary,
  currency = 'GBP',
  fxRate   = 1,
  commodityType: CommodityType = 'machining',
  partPhotoDataUrl?: string | null,
  region: ManufacturingRegion = 'UK',
  scenarios: Scenario[] = [],
  cadMeta: CADReportMeta = {}
): void {

  const sym  = currencySymbol(currency);
  const pct  = (n: number) => `${n.toFixed(1)}%`;
  const pcts = breakdownPercentages(result);
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Footer (added last) ──────────────────────────────────────────────────
  const addFooters = () => {
    const total = pageCount(doc);
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(...ORANGE); doc.setLineWidth(0.4);
      doc.line(MG, 285, W - MG, 285);
      const lw = drawCostVisionLogo(doc, MG, 287, 4);
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY);
      doc.text('Should-Cost Analysis Report  ·  CONFIDENTIAL', MG + lw + 3, 291);
      doc.text(`${dateStr}  ${timeStr}`, W / 2, 291, { align: 'center' });
      doc.text(`Page ${i} of ${total}`, W - MG, 291, { align: 'right' });
    }
  };

  // ════════════════════════════════════════════════════════════════════════
  // COVER PAGE
  // ════════════════════════════════════════════════════════════════════════

  // Hero banner
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 68, 'F');
  // Orange left stripe
  doc.setFillColor(...ORANGE);
  doc.rect(0, 0, 7, 68, 'F');

  // Logo box
  doc.setFillColor(...WHITE);
  doc.roundedRect(MG + 5, 10, 24, 15, 2, 2, 'F');
  doc.setTextColor(...NAVY); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('CV', MG + 17, 20, { align: 'center' });

  // Brand name
  doc.setTextColor(...WHITE); doc.setFontSize(20); doc.setFont('helvetica', 'bold');
  doc.text('CostVision', MG + 35, 20);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(185, 200, 230);
  doc.text('Manufacturing Should-Cost Intelligence Platform', MG + 35, 27);

  // Report badge
  doc.setFillColor(...ORANGE);
  doc.roundedRect(MG + 35, 32, 62, 7, 1.5, 1.5, 'F');
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE);
  doc.text('SHOULD-COST ANALYSIS REPORT', MG + 66, 37, { align: 'center' });

  // Date + tag line
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(200, 215, 240);
  doc.text(`Generated: ${dateStr}  ·  ${timeStr}`, MG + 35, 46);
  doc.text('Bottom-Up Manufacturing Cost Model  ·  Fully Traceable Rate Data', MG + 35, 52);

  // ── Part summary card ────────────────────────────────────────────────────
  let y = 76;
  doc.setFillColor(245, 247, 252);
  doc.roundedRect(MG, y, CW, 34, 2.5, 2.5, 'F');
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.25);
  doc.roundedRect(MG, y, CW, 34, 2.5, 2.5, 'S');
  // Top accent line
  doc.setFillColor(...ORANGE);
  doc.roundedRect(MG, y, CW, 2.5, 1, 1, 'F');

  doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  // Shrink-to-fit then ellipsis so long part names never overflow the summary card.
  const nameMaxW = CW - 12;
  let nameSize = 13;
  doc.setFontSize(nameSize);
  while (doc.getTextWidth(result.partName) > nameMaxW && nameSize > 9) { nameSize -= 0.5; doc.setFontSize(nameSize); }
  let partName = result.partName;
  if (doc.getTextWidth(partName) > nameMaxW) {
    while (partName.length > 8 && doc.getTextWidth(partName + '...') > nameMaxW) partName = partName.slice(0, -1);
    partName = partName.replace(/\s+$/, '') + '...';
  }
  doc.text(partName, MG + 6, y + 12);

  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY);
  const meta = [
    `Commodity: ${commodityType.replace(/_/g, ' ').toUpperCase()}`,
    `Currency: ${currency}`,
    `FX Rate: ${fxRate.toFixed(4)} to GBP`,
    `Operations: ${result.operationDetails.length}`,
    `Region: ${(input as { region?: string }).region ?? 'UK'}`,
  ].join('   ·   ');
  doc.text(meta, MG + 6, y + 19);

  // Metrics chips row
  const chips: [string, string, RGB][] = [
    ['Total Should-Cost',   `${sym}${(result.total * fxRate).toFixed(2)}`, ORANGE],
    ['Material',            pct(pcts.rawMaterial), SLATE],
    ['Process',             pct(pcts.process), SLATE],
    ['Labour',              pct(pcts.labour), SLATE],
    ['Margin',              pct(pcts.margin), SLATE],
  ];
  const chipW = CW / chips.length;
  chips.forEach(([lbl, val, col], i) => {
    const cx = MG + i * chipW + 4;
    doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(...LGREY);
    doc.text(lbl, cx, y + 26);
    doc.setFontSize(i === 0 ? 10 : 9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...col);
    doc.text(val, cx, y + 32);
  });

  y += 42;

  // ── Uploaded part photo (any commodity) ──────────────────────────────────
  if (partPhotoDataUrl) {
    try {
      const props = doc.getImageProperties(partPhotoDataUrl);
      const maxH = 42, maxW = CW * 0.5;
      let iw = maxH * (props.width / props.height), ih = maxH;
      if (iw > maxW) { iw = maxW; ih = maxW * (props.height / props.width); }
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
      doc.text('Uploaded Part Photo', MG, y + 3);
      doc.setDrawColor(...NAVY); doc.setLineWidth(0.25);
      doc.roundedRect(MG, y + 5, iw + 4, ih + 4, 2, 2, 'S');
      doc.addImage(partPhotoDataUrl, props.fileType || 'JPEG', MG + 2, y + 7, iw, ih, undefined, 'FAST');
      y += ih + 12;
    } catch { /* skip an image that fails to embed */ }
  }

  // ── Confidence & traceability summary ────────────────────────────────────
  const highCount = result.traceability.filter(t => t.confidence === 'High').length;
  const allCount  = result.traceability.length;
  const overallConf = allCount === 0 ? 'Medium'
    : highCount / allCount >= 0.7 ? 'High'
    : highCount / allCount >= 0.4 ? 'Medium' : 'Low';
  const confColor: RGB = overallConf === 'High' ? GN : overallConf === 'Medium' ? AM : RD;

  doc.setFillColor(...HDR);
  doc.roundedRect(MG, y, CW, 11, 1.5, 1.5, 'F');
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text('Model Confidence:', MG + 5, y + 7);
  doc.setTextColor(...confColor);
  doc.text(overallConf, MG + 44, y + 7);
  doc.setTextColor(...GREY); doc.setFont('helvetica', 'normal');
  doc.text(`·  ${result.operationDetails.length} traced operations  ·  ${allCount} data points auditable`, MG + 62, y + 7);
  y += 17;

  // ── Geometry provenance (CAD flows) — measured vs estimated ───────────────
  const alloyMat = library.materials.find(m => m.id === input.rawMaterial.materialId);
  if (cadMeta.geometrySource) {
    const src = cadMeta.geometrySource;
    const wt = cadMeta.measuredWeightKg != null ? `${cadMeta.measuredWeightKg.toFixed(3)} kg` : '—';
    const vol = cadMeta.measuredVolumeCm3 != null ? `${cadMeta.measuredVolumeCm3.toFixed(1)} cm³` : '—';
    if (src === 'occt') {
      y = calloutBox(doc, y, 'Geometry Provenance — MEASURED (OCCT B-rep kernel)', [
        `Volume, weight and every feature were measured from the CAD solid by the Open CASCADE kernel. Measured volume ${vol}; mass for the selected material family ${wt}.`,
        'Material cost and geometry-derived machining are grounded in the actual solid — not an estimate.',
      ], GN, [237, 247, 237]);
    } else if (src === 'stl_parser') {
      y = calloutBox(doc, y, 'Geometry Provenance — MEASURED FROM MESH (STL)', [
        `Volume and weight were measured from the STL mesh (measured volume ${vol}; mass ${wt}). B-rep feature recognition (holes/bores/faces) is limited on mesh data — confirm machined features manually.`,
      ], AM, OR_LT);
    } else {
      y = calloutBox(doc, y, 'Geometry Provenance — NOT MEASURED (text/heuristic estimate)', [
        'The CAD kernel could not read this file in the deployed container, so weight and volume are TEXT/HEURISTIC ESTIMATES, not measured from the solid.',
        'Material cost and any geometry-derived machining are INDICATIVE only and may be materially wrong. To get a measured cost, attach an STL of the same part or re-run in a kernel-enabled environment.',
      ], RD, [252, 236, 236]);
    }
  }

  // ── Key assumptions (always) — the six drivers that move the answer most ──
  const utilPct = (input.rawMaterial.materialUtilization * 100);
  const wtNote = cadMeta.geometrySource === 'text_parsing' ? ' (estimated — see provenance above)'
    : cadMeta.geometrySource ? ' (measured)' : '';
  const pinNote = [
    cadMeta.userSpecifiedMaterial ? 'grade user-specified' : '',
    cadMeta.userSpecifiedProcess ? 'process user-specified' : '',
  ].filter(Boolean).join(', ');
  y = calloutBox(doc, y, 'Key Assumptions', [
    `Annual volume: ${(cadMeta.annualVolume ?? (input as { annualVolume?: number }).annualVolume ?? '—').toLocaleString?.() ?? '—'}   ·   Region: ${(input as { region?: string }).region ?? region}   ·   Commodity: ${commodityType.replace(/_/g, ' ')}`,
    `Alloy / material: ${alloyMat?.grade ?? input.rawMaterial.materialId}${pinNote ? ` (${pinNote})` : ''}   ·   Net weight: ${input.rawMaterial.netWeightKg.toFixed(3)} kg${wtNote}`,
    `Material utilisation: ${utilPct.toFixed(0)}%   ·   Overhead: ${(input.overheadPct * 100).toFixed(0)}% of factory base   ·   Margin: ${(input.marginPct * 100).toFixed(0)}% of subtotal   ·   Operations: ${result.operationDetails.length}`,
  ], NAVY, HDR);


  y = renderShouldCostSections(doc, y, { result, input, library, currency, fxRate, commodityType, region, scenarios, cadMeta });

  addFooters();

  const fname = `should-cost-${result.partName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fname);
}

// Legacy compat
export { printPDF as openPDF };

// ════════════════════════════════════════════════════════════════════════════
//  AI CAD-to-COST ANALYSIS PDF
// ════════════════════════════════════════════════════════════════════════════
export function printCADAnalysisPDF(r: CADAnalysisResult, partPhotoDataUrl?: string | null, currency = 'GBP', fxRate = 1): void {
  type RGB3 = [number, number, number];
  // AI cost range and tooling figures are GBP-denominated — convert to the
  // chosen display currency so a CNY/EUR report is not littered with £.
  const cadCurSym = currencySymbol(currency);
  const cadMoney = (n: number) => `${cadCurSym}${(n * fxRate).toFixed(2)}`;
  const cadMoney0 = (n: number) => `${cadCurSym}${Math.round(n * fxRate).toLocaleString()}`;

  const TEAL:   RGB3 = [13,  148, 136];
  const DARK:   RGB3 = [15,  23,  42];
  const GREY3:  RGB3 = [100, 116, 139];
  const LGRY3:  RGB3 = [160, 174, 192];
  const LITE3:  RGB3 = [240, 253, 250];
  const HDR3:   RGB3 = [204, 241, 237];
  const RED3:   RGB3 = [185, 28,  28];
  const AMB3:   RGB3 = [180, 83,  9];
  const GRN3:   RGB3 = [22,  163, 74];
  const BLUE3:  RGB3 = [37,  99,  235];
  const NAV3:   RGB3 = [15,  32,  65];

  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  let y = 0;

  const lY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  const ck = (need = 20): void => { if (y + need > 276) { doc.addPage(); y = 18; } };

  const section = (title: string, sub?: string): void => {
    ck(14);
    doc.setFillColor(...TEAL);
    doc.roundedRect(MG, y, CW, 9, 1.5, 1.5, 'F');
    doc.setFillColor(255, 255, 255, 0.15);
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text(title, MG + 5, y + 6.2);
    if (sub) {
      doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.text(sub, W - MG - 3, y + 6.2, { align: 'right' });
    }
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK);
    y += 13;
  };

  const bodyText = (text: string, indent = 0, colour: RGB3 = DARK): void => {
    const lines = doc.splitTextToSize(text, CW - indent) as string[];
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...colour);
    doc.text(lines, MG + indent, y);
    y += lines.length * 4.2 + 1;
  };

  const kv = (label: string, value: string, col: RGB3 = DARK): void => {
    doc.setFontSize(7.5); doc.setTextColor(...GREY3); doc.setFont('helvetica', 'normal');
    doc.text(label, MG, y);
    doc.setTextColor(...col); doc.setFont('helvetica', 'bold');
    doc.text(value, MG + 52, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK);
    y += 5;
  };

  const sevCol = (s: string): RGB3 => {
    const sl = s.toLowerCase();
    return (sl === 'high' || sl === 'critical') ? RED3 : sl === 'medium' ? AMB3 : GRN3;
  };

  const addFooters = (): void => {
    const total = pageCount(doc);
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(...TEAL); doc.setLineWidth(0.4);
      doc.line(MG, 285, W - MG, 285);
      const lw = drawCostVisionLogo(doc, MG, 287, 4);
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY3);
      doc.text('AI CAD-to-Cost Analysis Report  ·  CONFIDENTIAL', MG + lw + 3, 291);
      doc.text(`Generated: ${dateStr}`, W / 2, 291, { align: 'center' });
      doc.text(`Page ${i} of ${total}`, W - MG, 291, { align: 'right' });
    }
  };

  // ── Cover Header ─────────────────────────────────────────────────────────
  doc.setFillColor(...NAV3);
  doc.rect(0, 0, W, 58, 'F');
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, 7, 58, 'F');

  // Logo box
  doc.setFillColor(...(WHITE as unknown as RGB3));
  doc.roundedRect(MG + 4, 9, 22, 14, 2, 2, 'F');
  doc.setTextColor(...TEAL); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text('CV', MG + 15, 18.5, { align: 'center' });

  doc.setTextColor(255, 255, 255); doc.setFontSize(17); doc.setFont('helvetica', 'bold');
  doc.text('AI CAD-to-Cost Analysis', MG + 32, 17);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(185, 220, 215);
  doc.text('CostVision  ·  Powered by Claude AI  ·  Manufacturing Intelligence Platform', MG + 32, 24);

  doc.setFillColor(...TEAL);
  doc.roundedRect(MG + 32, 30, 45, 7, 1.5, 1.5, 'F');
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('AI-POWERED CAD ANALYSIS REPORT', MG + 54, 35, { align: 'center' });

  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(185, 220, 215);
  doc.text(`Generated: ${dateStr}`, MG + 32, 44);
  doc.text('Geometry to Process to Cost  ·  Fully AI-reasoned', MG + 32, 50);

  y = 66;

  // Part summary card
  const scoreColor: RGB3 = r.manufacturabilityScore >= 75 ? GRN3 : r.manufacturabilityScore >= 50 ? AMB3 : RED3;

  doc.setFillColor(245, 250, 252);
  doc.roundedRect(MG, y, CW, 30, 2.5, 2.5, 'F');
  doc.setDrawColor(...TEAL); doc.setLineWidth(0.25);
  doc.roundedRect(MG, y, CW, 30, 2.5, 2.5, 'S');
  doc.setFillColor(...TEAL);
  doc.roundedRect(MG, y, CW, 2.5, 1, 1, 'F');

  // Score badge
  doc.setFillColor(...scoreColor);
  doc.circle(MG + 14, y + 17, 10, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text(String(r.manufacturabilityScore), MG + 14, y + 20.5, { align: 'center' });

  doc.setTextColor(...DARK); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text(r.partName, MG + 30, y + 12);

  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY3);
  const g = r.geometry;
  doc.text(
    `${g.boundingBoxMm.x.toFixed(0)} × ${g.boundingBoxMm.y.toFixed(0)} × ${g.boundingBoxMm.z.toFixed(0)} mm  ·  ` +
    `${g.estimatedVolumeCm3.toFixed(1)} cm³  ·  Al ${g.estimatedWeightKg.aluminum.toFixed(3)} kg / Steel ${g.estimatedWeightKg.steel.toFixed(3)} kg`,
    MG + 30, y + 19
  );
  doc.setTextColor(...scoreColor);
  doc.text(`Manufacturability: ${r.manufacturabilityScore}/100  ·  Confidence: ${r.confidenceLevel}`, MG + 30, y + 26);

  y += 38;

  // ── Uploaded part photo ──────────────────────────────────────────────────
  if (partPhotoDataUrl) {
    try {
      const props = doc.getImageProperties(partPhotoDataUrl);
      const maxH = 42, maxW = CW * 0.45;
      let iw = maxH * (props.width / props.height), ih = maxH;
      if (iw > maxW) { iw = maxW; ih = maxW * (props.height / props.width); }
      ck(ih + 14);
      section('Uploaded Part Photo');
      doc.setDrawColor(...GREY3); doc.setLineWidth(0.25);
      doc.roundedRect(MG, y, iw + 4, ih + 4, 2, 2, 'S');
      doc.addImage(partPhotoDataUrl, props.fileType || 'JPEG', MG + 2, y + 2, iw, ih, undefined, 'FAST');
      y += ih + 10;
    } catch { /* skip */ }
  }

  // ── §1 Geometry & Part Summary ───────────────────────────────────────────
  section('§1 — Geometry & Part Summary');

  // col widths: 36 + 52 + 36 + (182-124) = 36+52+36+58 = 182 ✓
  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    body: [
      ['Bounding Box',  `${g.boundingBoxMm.x.toFixed(1)} × ${g.boundingBoxMm.y.toFixed(1)} × ${g.boundingBoxMm.z.toFixed(1)} mm`, 'Surface Area', `${g.estimatedSurfaceAreaCm2.toFixed(1)} cm²`],
      ['Volume',        `${g.estimatedVolumeCm3.toFixed(2)} cm³`,      'Weight (Al)',      `${g.estimatedWeightKg.aluminum.toFixed(3)} kg`],
      ['Weight (Steel)',`${g.estimatedWeightKg.steel.toFixed(3)} kg`,   'Weight (Plastic)', `${g.estimatedWeightKg.plastic.toFixed(3)} kg`],
    ],
    theme: 'plain',
    bodyStyles: { fontSize: 7.5, textColor: DARK, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
    alternateRowStyles: { fillColor: LITE3 },
    columnStyles: {
      0: { cellWidth: 36, textColor: GREY3 },
      1: { cellWidth: 52, fontStyle: 'bold' },
      2: { cellWidth: 36, textColor: GREY3 },
      3: { cellWidth: 58, fontStyle: 'bold' },
    },
  });
  y = lY() + 7;

  // ── §2 Detected Features ─────────────────────────────────────────────────
  section('§2 — Detected Features');

  // col widths: 40 + 14 + 24 + (182-78) = 40+14+24+104 = 182 ✓
  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    head: [['Feature Type', 'Count', 'Significance', 'Description']],
    body: r.detectedFeatures.map(f => [f.type, String(f.count), f.significance, f.description]),
    theme: 'plain',
    headStyles: { fillColor: HDR3, textColor: DARK, fontStyle: 'bold', fontSize: 7.5, cellPadding: 3 },
    bodyStyles: { fontSize: 7.5, textColor: DARK, cellPadding: 3 },
    alternateRowStyles: { fillColor: LITE3 },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: 'bold' },
      1: { cellWidth: 14, halign: 'center' },
      2: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 104 },
    },
    didParseCell: (d) => {
      if (d.column.index === 2 && d.section === 'body') {
        d.cell.styles.textColor = sevCol(String(d.cell.raw));
      }
    },
  });
  y = lY() + 7;

  // ── §3 Material Analysis ─────────────────────────────────────────────────
  section('§3 — Material Analysis', r.materialAnalysis.fromMetadata ? 'From CAD metadata' : 'AI-suggested');

  const ma = r.materialAnalysis;
  kv('Primary Material:', `${ma.primarySuggestion.name}  (${ma.primarySuggestion.confidencePct}% confidence)`, TEAL);
  bodyText(ma.primarySuggestion.reasoning, 4, GREY3);
  if (ma.alternatives.length > 0) {
    doc.setFontSize(7.5); doc.setTextColor(...GREY3); doc.setFont('helvetica', 'normal');
    doc.text('Alternatives:', MG, y);
    doc.setTextColor(...DARK); doc.setFont('helvetica', 'bold');
    doc.text(ma.alternatives.map(a => `${a.name} (${a.confidencePct}%)`).join('  ·  '), MG + 22, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
  }
  y += 2;

  // ── §4 Process Recommendations ───────────────────────────────────────────
  ck(22);
  section('§4 — Process Recommendations');

  // col widths: 42 + 28 + 18 + 22 + (182-110) = 42+28+18+22+72 = 182 ✓
  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    head: [['Process', 'Commodity', 'Confidence', 'Cycle Time (hr)', 'Reasoning']],
    body: r.processRecommendations.map(p => [p.process, p.commodityType, `${p.confidencePct}%`, p.estimatedCycleTimeHr.toFixed(4), p.reasoning]),
    theme: 'plain',
    headStyles: { fillColor: HDR3, textColor: DARK, fontStyle: 'bold', fontSize: 7.5, cellPadding: 3 },
    bodyStyles: { fontSize: 7.5, textColor: DARK, cellPadding: 3 },
    alternateRowStyles: { fillColor: LITE3 },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold' },
      1: { cellWidth: 28 },
      2: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 72, textColor: GREY3 },
    },
    didParseCell: (d) => {
      if (d.column.index === 2 && d.section === 'body') {
        const p = parseInt(String(d.cell.raw));
        d.cell.styles.textColor = p >= 75 ? GRN3 : p >= 50 ? AMB3 : RED3;
      }
      if (d.row.index === 0 && d.section === 'body') {
        d.cell.styles.fillColor = LITE3;
      }
    },
  });
  y = lY() + 7;

  // ── §5 Manufacturability Risks ───────────────────────────────────────────
  if (r.manufacturabilityRisks.length > 0) {
    ck(22);
    section(`§5 — Manufacturability Risks  (Score: ${r.manufacturabilityScore}/100)`);

    // col widths: 20 + 36 + (182-92)*0.52 + (182-92)*0.48 = 20+36+46+44 = 146 → NO
    // 20 + 36 + 66 + 60 = 182 ✓
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG },
      head: [['Severity', 'Feature / Area', 'Description', 'Recommended Action']],
      body: r.manufacturabilityRisks.map(risk => [risk.severity, risk.feature, risk.description, risk.suggestion]),
      theme: 'plain',
      headStyles: { fillColor: HDR3, textColor: DARK, fontStyle: 'bold', fontSize: 7.5, cellPadding: 3 },
      bodyStyles: { fontSize: 7.5, textColor: DARK, cellPadding: 3, overflow: 'linebreak' },
      alternateRowStyles: { fillColor: LITE3 },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 36, fontStyle: 'bold' },
        2: { cellWidth: 66 },
        3: { cellWidth: 60 },
      },
      didParseCell: (d) => {
        if (d.column.index === 0 && d.section === 'body') {
          d.cell.styles.textColor = sevCol(String(d.cell.raw));
        }
      },
    });
    y = lY() + 7;
  }

  // ── §6 DFM Issues ────────────────────────────────────────────────────────
  const dfmIssues = r.costInputSuggestions.dfmIssues ?? [];
  if (dfmIssues.length > 0) {
    ck(22);
    section(`§6 — DFM Issues  (${r.costInputSuggestions.recommendedCommodity})`);

    // col widths: 20 + 32 + 44 + 44 + (182-140) = 20+32+44+44+42 = 182 ✓
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG },
      head: [['Severity', 'Area', 'Description', 'Impact', 'Fix']],
      body: dfmIssues.map(d => [d.severity, d.area, d.description, d.impact, d.fix]),
      theme: 'plain',
      headStyles: { fillColor: HDR3, textColor: DARK, fontStyle: 'bold', fontSize: 7.5, cellPadding: 3 },
      bodyStyles: { fontSize: 7, textColor: DARK, cellPadding: 3, overflow: 'linebreak' },
      alternateRowStyles: { fillColor: LITE3 },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 32, fontStyle: 'bold' },
        2: { cellWidth: 44 },
        3: { cellWidth: 44 },
        4: { cellWidth: 42 },
      },
      didParseCell: (d) => {
        if (d.column.index === 0 && d.section === 'body') {
          d.cell.styles.textColor = sevCol(String(d.cell.raw));
        }
      },
    });
    y = lY() + 7;
  }

  // ── §7 Cost Range & Suggested Inputs ────────────────────────────────────
  ck(28);
  section('§7 — Cost Range & Suggested Inputs');

  const cr = r.costInputSuggestions.costRange;
  if (cr) {
    doc.setFillColor(...LITE3);
    doc.roundedRect(MG, y, CW, 18, 2, 2, 'F');
    doc.setDrawColor(...TEAL); doc.setLineWidth(0.3);
    doc.roundedRect(MG, y, CW, 18, 2, 2, 'S');
    const thirds = CW / 3;

    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...LGRY3);
    doc.text('OPTIMISTIC',    MG + thirds * 0 + 4, y + 6);
    doc.text('MOST LIKELY',   MG + thirds * 1 + 4, y + 6);
    doc.text('CONSERVATIVE',  MG + thirds * 2 + 4, y + 6);

    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.setTextColor(...GRN3);  doc.text(cadMoney(cr.low),  MG + thirds * 0 + 8, y + 14);
    doc.setTextColor(...BLUE3); doc.text(cadMoney(cr.mid),  MG + thirds * 1 + 8, y + 14);
    doc.setTextColor(...RED3);  doc.text(cadMoney(cr.high), MG + thirds * 2 + 8, y + 14);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK);
    y += 24;
  }

  const ci  = r.costInputSuggestions;
  const opsText = ci.estimatedOperations.map(o => `${o.name} (${o.machineId}, ${o.cycleTimeHr.toFixed(4)} hr)`).join('\n');

  // col widths: 42 + 54 + 32 + (182-128) = 42+54+32+54 = 182 ✓
  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    body: [
      ['Net Weight',          `${ci.netWeightKg.toFixed(3)} kg`,              'Material',      ci.materialId],
      ['Recommended Process', ci.recommendedCommodity,                         'Cycle Time',   `${ci.estimatedCycleTimeHr.toFixed(4)} hr/part`],
      ['Setup Time',          `${ci.estimatedSetupTimeHr.toFixed(3)} hr`,     'Operations',   `${ci.estimatedOperations.length} ops`],
      ['Operations Detail',   opsText,                                         '',             ''],
    ],
    theme: 'plain',
    bodyStyles: { fontSize: 7.5, textColor: DARK, cellPadding: 3 },
    alternateRowStyles: { fillColor: LITE3 },
    columnStyles: {
      0: { cellWidth: 42, textColor: GREY3 },
      1: { cellWidth: 54, fontStyle: 'bold' },
      2: { cellWidth: 32, textColor: GREY3 },
      3: { cellWidth: 54, fontStyle: 'bold' },
    },
  });
  y = lY() + 6;

  // Process-specific params
  const specific: string[][] = [];
  if (ci.casting)          { specific.push(['Casting Subtype', ci.casting.subtype], ['Die/Mould Cost', cadMoney0(ci.casting.dieMouldCostGBP)], ['Die Life', `${ci.casting.dieMouldLife.toLocaleString()} shots`], ['Cavities', String(ci.casting.cavities)], ['Yield', `${(ci.casting.yieldFraction * 100).toFixed(1)}%`]); }
  if (ci.forging)          { specific.push(['Flash Weight', `${ci.forging.flashKg.toFixed(3)} kg`], ['Yield', `${(ci.forging.yieldFraction * 100).toFixed(1)}%`], ['Die Cost', cadMoney0(ci.forging.dieCostGBP)], ['Strokes', String(ci.forging.strokes)]); }
  if (ci.injectionMoulding){ specific.push(['Cavities', String(ci.injectionMoulding.cavities)], ['Wall Thickness', `${ci.injectionMoulding.wallThicknessMm} mm`], ['Mould Cost', cadMoney0(ci.injectionMoulding.mouldCostGBP)], ['Mould Life', `${ci.injectionMoulding.mouldLife.toLocaleString()} shots`], ['Projected Area', `${ci.injectionMoulding.projectedAreaCm2.toFixed(1)} cm²`]); }
  if (specific.length > 0) {
    ck(specific.length * 5 + 12);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...GREY3);
    doc.text('Process-Specific Parameters', MG, y); y += 5;
    // col widths: 42 + (182-42) = 182 ✓
    autoTable(doc, {
      startY: y,
      body: specific,
      theme: 'plain',
      bodyStyles: { fontSize: 7.5, textColor: DARK, cellPadding: 3 },
      alternateRowStyles: { fillColor: LITE3 },
      columnStyles: {
        0: { cellWidth: 42, textColor: GREY3 },
        1: { cellWidth: 140, fontStyle: 'bold' },
      },
      margin: { left: MG + 4, right: MG },
    });
    y = lY() + 6;
  }

  // ── §8 AI Explanation ────────────────────────────────────────────────────
  ck(24);
  section('§8 — AI Analysis Explanation');
  bodyText(r.aiExplanation, 0, GREY3);
  y += 3;

  // ── §9 Limitations ───────────────────────────────────────────────────────
  if (r.analysisLimitations.length > 0) {
    ck(16);
    section('§9 — Analysis Limitations & Assumptions');
    r.analysisLimitations.forEach((lim, i) => bodyText(`${i + 1}.  ${lim}`, 4, GREY3));
  }

  if (ci.stage1Selection) {
    ck(10);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...LGRY3);
    const st = ci.stage1Selection;
    doc.text(
      `Stage-1 pre-selection: ${st.primary} (${Math.round((st.conf ?? 0) * 100)}%)  ·  ` +
      // alt may arrive as {type,conf} objects or as bare commodity strings — handle both.
      ((st.alt ?? []) as Array<{ type?: string; conf?: number } | string>)
        .map(a => typeof a === 'string'
          ? a
          : `${a.type ?? '—'}${typeof a.conf === 'number' ? ` (${Math.round(a.conf * 100)}%)` : ''}`)
        .filter(Boolean).join(' · '),
      MG, y
    );
    y += 5;
  }

  addFooters();

  const fname = `cad-analysis-${r.partName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fname);
}
