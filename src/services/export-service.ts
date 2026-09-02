import { downloadXlsx, type SheetSpec } from './xlsx-write';
import PptxGenJS from 'pptxgenjs';
import jsPDF from 'jspdf';
import { pdfSafe, deepPdfSafe } from './pdf-safe.mjs';
import { LOGO_PNG } from './brainspark-logo-png';
import {
  OUTBOUND_DISCLAIMER, engineVerdict, evidenceLine, verificationCell, verificationTally,
} from './idea-provenance.mjs';
import { parseMoney, colPositions, safeFilename } from './report-core.mjs';
import { AnalysisResult, CostReductionIdea } from '../types';

const DIFFICULTY_COLOR: Record<string, string> = {
  Low: 'FF92D050',
  Medium: 'FFFFB366',
  High: 'FFFF6B6B',
};

export async function exportToExcel(result: AnalysisResult, systemName: string, subName: string): Promise<void> {
  const sheets: SheetSpec[] = [];

  // --- Sheet 1: Summary ---
  const summaryData = [
    ['BrainSpark — Cost Reduction Analysis Report'],
    [''],
    ['Analysis Date', result.generatedAt],
    ['Vehicle Type', result.config.vehicleType],
    ['System', systemName],
    ['Subassembly', subName],
    ['Part/Component', result.config.partId || 'All Parts'],
    [''],
    ['SUMMARY METRICS'],
    ['Total Ideas Generated', result.summary.totalIdeas],
    ['Quick Wins (Low Difficulty)', result.summary.quickWins],
    ['Strategic Items (Medium/High)', result.summary.strategicItems],
    ['Web Searches Performed', result.summary.searchesPerformed],
  ];
  // How much of this workbook is actually verified. Without it a reader takes
  // every row as equally solid; typically only a minority are engine-checked.
  const tally = verificationTally(result.ideas);
  summaryData.push(
    [''],
    ['VERIFICATION'],
    ['Engine-confirmed', tally.confirmed],
    ['Engine-contradicted', tally.contradicted],
    ['Not engine-checked', tally.unchecked],
    ['Evidence independently verified', tally.evidenceVerified],
    ['', OUTBOUND_DISCLAIMER],
  );
  sheets.push({ name: 'Summary', rows: summaryData, colWidths: [35, 50] });

  // --- Sheet 2: Ideas Detail ---
  const headers = [
    'No.',
    'Title',
    'System Level',
    'Technical Description',
    'Manufacturing Impact',
    'Cost Saving Types',
    'Cost Saving % Range',
    'Annual Value Potential',
    'Qualitative Potential',
    'Difficulty',
    'Time to Implement',
    'DFMA Principles',
    'Risk Notes',
    'Benchmark Reference',
    // Provenance travels with the numbers. A saving the engine contradicted
    // must not sit in a spreadsheet looking like one it confirmed.
    'Engine Check',
    'Confidence & Evidence',
  ];

  const rows = result.ideas.map((idea, i) => [
    i + 1,
    idea.title,
    idea.systemLevel,
    idea.technicalDescription,
    idea.manufacturingImpact,
    idea.costSavingTypes.join(', '),
    idea.costSavingPotential.percentage || '',
    idea.costSavingPotential.annualValue || '',
    idea.costSavingPotential.qualitative,
    idea.implementationDifficulty,
    idea.timeToImplement,
    idea.dfmaPrinciples.join('; '),
    idea.riskNotes,
    idea.benchmarkReference || '',
    verificationCell(idea),
    evidenceLine(idea),
  ]);

  sheets.push({
    name: 'Cost Reduction Ideas',
    rows: [headers, ...rows],
    colWidths: [5, 35, 15, 60, 50, 30, 20, 25, 25, 12, 22, 40, 50, 30, 30, 55],
    // Colour the Difficulty column (0-based col 9; +1 row for the header)
    fills: rows.map((_, i) => ({
      row: i + 1, col: 9,
      argb: DIFFICULTY_COLOR[result.ideas[i].implementationDifficulty] || 'FFFFFFFF',
      bold: true,
    })),
  });

  // --- Sheet 3: Implementation Roadmap ---
  const roadmapHeaders = ['Priority', 'Idea Title', 'Difficulty', 'Time to Implement', 'Cost Saving Type', 'Potential Saving', 'Owner / Dept', 'Status'];
  const sorted = [...result.ideas].sort((a, b) => {
    const order = { Low: 0, Medium: 1, High: 2 };
    return order[a.implementationDifficulty] - order[b.implementationDifficulty];
  });
  const roadmapRows = sorted.map((idea, i) => [
    i + 1,
    idea.title,
    idea.implementationDifficulty,
    idea.timeToImplement,
    idea.costSavingTypes.join(', '),
    idea.costSavingPotential.percentage || idea.costSavingPotential.qualitative,
    'Engineering / Procurement',
    'To Be Assessed',
  ]);

  sheets.push({
    name: 'Implementation Roadmap',
    rows: [roadmapHeaders, ...roadmapRows],
    colWidths: [8, 35, 12, 22, 28, 25, 28, 20],
  });

  const filename = `BrainSpark_${systemName}_${subName}_${new Date().toISOString().split('T')[0]}.xlsx`;
  await downloadXlsx(filename, sheets);
}

export async function exportToPowerPoint(
  result: AnalysisResult,
  systemName: string,
  subName: string
): Promise<void> {
  const pptx = new PptxGenJS();

  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = 'BrainSpark Cost Reduction Report';
  pptx.subject = `${systemName} – ${subName}`;
  pptx.author = 'BrainSpark Platform';

  const NAVY = '0d1f33';
  const GOLD = 'f59e0b';
  const WHITE = 'FFFFFF';
  const LIGHT_GRAY = 'f8fafc';
  const DARK_GRAY = '374151';

  // Helper for slide background
  const addBg = (slide: ReturnType<typeof pptx.addSlide>, dark = true) => {
    slide.background = { color: dark ? NAVY : LIGHT_GRAY };
  };

  // --- Slide 1: Title ---
  {
    const slide = pptx.addSlide();
    addBg(slide, true);

    slide.addShape('rect', {
      x: 0, y: 0, w: '100%', h: '100%',
      fill: { color: NAVY },
    });

    // Gold accent bar
    slide.addShape('rect', {
      x: 0, y: 3.5, w: '100%', h: 0.06,
      fill: { color: GOLD },
      line: { color: GOLD },
    });

    slide.addText('BrainSpark', {
      x: 0.8, y: 0.6, w: 11, h: 0.8,
      fontSize: 14, bold: true, color: GOLD, fontFace: 'Calibri',
    });

    slide.addText('Cost Reduction Intelligence Report', {
      x: 0.8, y: 1.4, w: 11, h: 1.2,
      fontSize: 36, bold: true, color: WHITE, fontFace: 'Calibri',
    });

    slide.addText(`${systemName} — ${subName}`, {
      x: 0.8, y: 2.8, w: 11, h: 0.6,
      fontSize: 20, color: '94a3b8', fontFace: 'Calibri',
    });

    slide.addText(`Vehicle Type: ${result.config.vehicleType}`, {
      x: 0.8, y: 3.7, w: 5, h: 0.4,
      fontSize: 12, color: 'cbd5e1', fontFace: 'Calibri',
    });

    slide.addText(`Generated: ${result.generatedAt}`, {
      x: 0.8, y: 4.1, w: 5, h: 0.4,
      fontSize: 12, color: 'cbd5e1', fontFace: 'Calibri',
    });

    slide.addText(`${result.summary.totalIdeas} ideas generated | ${result.summary.quickWins} Quick Wins | ${result.summary.searchesPerformed} live web searches`, {
      x: 0.8, y: 4.8, w: 11, h: 0.5,
      fontSize: 13, color: GOLD, bold: true, fontFace: 'Calibri',
    });
  }

  // --- Slide 2: Executive Summary ---
  {
    const slide = pptx.addSlide();
    addBg(slide, false);

    slide.addShape('rect', {
      x: 0, y: 0, w: '100%', h: 0.7,
      fill: { color: NAVY },
    });
    slide.addText('Executive Summary', {
      x: 0.5, y: 0.1, w: 12, h: 0.5,
      fontSize: 18, bold: true, color: WHITE, fontFace: 'Calibri',
    });

    const metrics = [
      { label: 'Total Ideas', value: String(result.summary.totalIdeas), color: '3b82f6' },
      { label: 'Quick Wins', value: String(result.summary.quickWins), color: '22c55e' },
      { label: 'Strategic Items', value: String(result.summary.strategicItems), color: 'f59e0b' },
      { label: 'Web Searches', value: String(result.summary.searchesPerformed), color: '8b5cf6' },
    ];

    metrics.forEach((m, i) => {
      const x = 0.5 + i * 3.1;
      slide.addShape('rect', {
        x, y: 0.9, w: 2.8, h: 1.4,
        fill: { color: 'ffffff' },
        line: { color: 'e2e8f0', pt: 1 },
      });
      slide.addShape('rect', {
        x, y: 0.9, w: 2.8, h: 0.1,
        fill: { color: m.color },
      });
      slide.addText(m.value, {
        x, y: 1.1, w: 2.8, h: 0.6,
        fontSize: 28, bold: true, color: m.color, align: 'center', fontFace: 'Calibri',
      });
      slide.addText(m.label, {
        x, y: 1.7, w: 2.8, h: 0.4,
        fontSize: 11, color: DARK_GRAY, align: 'center', fontFace: 'Calibri',
      });
    });

    // Summary table headers
    const tableY = 2.5;
    const colWidths = [0.5, 3.5, 1.5, 2.5, 2.5, 1.5];
    const headers = ['No.', 'Idea Title', 'Level', 'Saving Type', 'Potential', 'Difficulty'];
    headers.forEach((h, i) => {
      const x = colWidths.slice(0, i).reduce((a, b) => a + b, 0.3);
      slide.addShape('rect', { x, y: tableY, w: colWidths[i], h: 0.35, fill: { color: NAVY } });
      slide.addText(h, { x, y: tableY, w: colWidths[i], h: 0.35, fontSize: 9, bold: true, color: WHITE, align: 'center', fontFace: 'Calibri' });
    });

    result.ideas.slice(0, 7).forEach((idea, idx) => {
      const rowY = tableY + 0.35 + idx * 0.32;
      const bg = idx % 2 === 0 ? 'f8fafc' : 'ffffff';
      const rowData = [
        String(idx + 1),
        idea.title.length > 38 ? idea.title.slice(0, 35) + '…' : idea.title,
        idea.systemLevel,
        idea.costSavingTypes.slice(0, 2).join(', '),
        idea.costSavingPotential.percentage || idea.costSavingPotential.qualitative.split(' ')[0],
        idea.implementationDifficulty,
      ];
      rowData.forEach((d, i) => {
        const x = colWidths.slice(0, i).reduce((a, b) => a + b, 0.3);
        const diffColor = idea.implementationDifficulty === 'Low' ? '22c55e' : idea.implementationDifficulty === 'Medium' ? 'f59e0b' : 'ef4444';
        const cellColor = i === 5 ? (idea.implementationDifficulty === 'Low' ? 'dcfce7' : idea.implementationDifficulty === 'Medium' ? 'fef3c7' : 'fee2e2') : bg;
        const textColor = i === 5 ? diffColor : DARK_GRAY;
        slide.addShape('rect', { x, y: rowY, w: colWidths[i], h: 0.32, fill: { color: cellColor }, line: { color: 'e2e8f0', pt: 0.5 } });
        slide.addText(d, { x, y: rowY, w: colWidths[i], h: 0.32, fontSize: 8, color: textColor, align: 'center', fontFace: 'Calibri', bold: i === 5 });
      });
    });
  }

  // --- Slides 3–9: One per idea ---
  result.ideas.forEach((idea, idx) => {
    const slide = pptx.addSlide();
    addBg(slide, false);

    // Header bar
    slide.addShape('rect', { x: 0, y: 0, w: '100%', h: 0.75, fill: { color: NAVY } });
    slide.addText(`Idea ${idx + 1} of ${result.ideas.length}`, {
      x: 0.3, y: 0.08, w: 2, h: 0.3, fontSize: 9, color: '94a3b8', fontFace: 'Calibri',
    });
    slide.addText(idea.title, {
      x: 0.3, y: 0.3, w: 10, h: 0.4, fontSize: 15, bold: true, color: WHITE, fontFace: 'Calibri',
    });

    const diffColors: Record<string, string> = { Low: '22c55e', Medium: 'f59e0b', High: 'ef4444' };
    const tagColor = diffColors[idea.implementationDifficulty] || GOLD;
    slide.addShape('rect', { x: 11.2, y: 0.15, w: 1.5, h: 0.45, fill: { color: tagColor }, rectRadius: 0.1 });
    slide.addText(idea.implementationDifficulty, {
      x: 11.2, y: 0.15, w: 1.5, h: 0.45, fontSize: 11, bold: true, color: WHITE, align: 'center', fontFace: 'Calibri',
    });

    // Left column: Technical description
    slide.addText('Technical Description', {
      x: 0.3, y: 0.9, w: 7, h: 0.3, fontSize: 10, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    slide.addShape('rect', { x: 0.3, y: 1.2, w: 7, h: 1.8, fill: { color: 'f1f5f9' }, line: { color: 'e2e8f0' } });
    slide.addText(idea.technicalDescription, {
      x: 0.4, y: 1.25, w: 6.8, h: 1.7, fontSize: 8, color: DARK_GRAY, fontFace: 'Calibri', wrap: true, valign: 'top',
    });

    slide.addText('Manufacturing & Assembly Impact', {
      x: 0.3, y: 3.1, w: 7, h: 0.3, fontSize: 10, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    slide.addShape('rect', { x: 0.3, y: 3.4, w: 7, h: 1.0, fill: { color: 'f0fdf4' }, line: { color: 'd1fae5' } });
    slide.addText(idea.manufacturingImpact, {
      x: 0.4, y: 3.45, w: 6.8, h: 0.9, fontSize: 8, color: DARK_GRAY, fontFace: 'Calibri', wrap: true, valign: 'top',
    });

    // Right column: Metrics
    const rx = 7.7;
    // The verification tile sits with the money tiles deliberately: a reader
    // who takes "Annual Value" from this slide must see, in the same glance,
    // whether an engine ever tested it.
    const pv = engineVerdict(idea);
    const TONE_HEX: Record<string, string> = {
      confirmed: '16a34a', contradicted: 'dc2626', none: '64748b',
    };
    const metrics2 = [
      { label: 'System Level', value: idea.systemLevel, color: '6366f1' },
      { label: 'Cost Saving Types', value: idea.costSavingTypes.join(', '), color: '0891b2' },
      { label: 'Saving Potential', value: idea.costSavingPotential.percentage || idea.costSavingPotential.qualitative.split('\n')[0], color: '16a34a' },
      { label: 'Annual Value', value: idea.costSavingPotential.annualValue || 'TBD', color: '9333ea' },
      { label: 'Time to Implement', value: idea.timeToImplement, color: 'ea580c' },
      { label: 'Verification', value: verificationCell(idea), color: TONE_HEX[pv.tone] },
    ];

    metrics2.forEach((m, i) => {
      const y = 0.9 + i * 0.65;
      slide.addShape('rect', { x: rx, y, w: 4.8, h: 0.55, fill: { color: 'ffffff' }, line: { color: 'e2e8f0' } });
      slide.addShape('rect', { x: rx, y, w: 0.08, h: 0.55, fill: { color: m.color } });
      slide.addText(m.label, { x: rx + 0.15, y: y + 0.02, w: 4.5, h: 0.22, fontSize: 8, color: '6b7280', fontFace: 'Calibri' });
      slide.addText(m.value, { x: rx + 0.15, y: y + 0.24, w: 4.5, h: 0.26, fontSize: 10, bold: true, color: DARK_GRAY, fontFace: 'Calibri' });
    });

    // DFMA Principles
    slide.addText('DFMA Principles', {
      x: 0.3, y: 4.5, w: 7, h: 0.3, fontSize: 10, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    const principles = idea.dfmaPrinciples.slice(0, 4).join('  ·  ');
    slide.addText(principles, {
      x: 0.3, y: 4.8, w: 7, h: 0.3, fontSize: 9, color: '4f46e5', fontFace: 'Calibri',
    });

    // Risk notes
    slide.addText('⚠  Risk & Impact Notes', {
      x: 7.7, y: 4.3, w: 4.8, h: 0.3, fontSize: 10, bold: true, color: 'b45309', fontFace: 'Calibri',
    });
    slide.addShape('rect', { x: 7.7, y: 4.6, w: 4.8, h: 0.8, fill: { color: 'fffbeb' }, line: { color: 'fde68a' } });
    slide.addText(idea.riskNotes, {
      x: 7.85, y: 4.65, w: 4.6, h: 0.7, fontSize: 8, color: '78350f', fontFace: 'Calibri', wrap: true, valign: 'top',
    });
  });

  // --- Final Slide: Roadmap ---
  {
    const slide = pptx.addSlide();
    addBg(slide, true);

    slide.addShape('rect', { x: 0, y: 0, w: '100%', h: 0.75, fill: { color: '0f172a' } });
    slide.addText('Implementation Roadmap', {
      x: 0.5, y: 0.15, w: 11, h: 0.5, fontSize: 20, bold: true, color: WHITE, fontFace: 'Calibri',
    });

    const sorted = [...result.ideas].sort((a, b) => {
      const order = { Low: 0, Medium: 1, High: 2 };
      return order[a.implementationDifficulty] - order[b.implementationDifficulty];
    });

    const phases = [
      { label: 'Quick Wins\n(0–6 months)', items: sorted.filter(i => i.implementationDifficulty === 'Low'), color: '22c55e', x: 0.3 },
      { label: 'Medium Term\n(6–18 months)', items: sorted.filter(i => i.implementationDifficulty === 'Medium'), color: 'f59e0b', x: 4.6 },
      { label: 'Strategic\n(18–36 months)', items: sorted.filter(i => i.implementationDifficulty === 'High'), color: 'ef4444', x: 8.9 },
    ];

    phases.forEach(phase => {
      slide.addShape('rect', { x: phase.x, y: 0.85, w: 4.0, h: 0.55, fill: { color: phase.color }, rectRadius: 0.08 });
      slide.addText(phase.label, {
        x: phase.x, y: 0.85, w: 4.0, h: 0.55, fontSize: 10, bold: true, color: WHITE, align: 'center', fontFace: 'Calibri',
      });

      phase.items.slice(0, 4).forEach((item, i) => {
        const y = 1.55 + i * 0.7;
        slide.addShape('rect', { x: phase.x, y, w: 4.0, h: 0.6, fill: { color: '1e293b' }, line: { color: phase.color, pt: 1 }, rectRadius: 0.06 });
        slide.addShape('rect', { x: phase.x, y, w: 0.06, h: 0.6, fill: { color: phase.color } });
        const title = item.title.length > 35 ? item.title.slice(0, 32) + '…' : item.title;
        slide.addText(title, {
          x: phase.x + 0.1, y: y + 0.05, w: 3.85, h: 0.28, fontSize: 8.5, bold: true, color: WHITE, fontFace: 'Calibri',
        });
        slide.addText(`${item.costSavingPotential.percentage || item.costSavingPotential.qualitative.split(' ')[0]}  |  ${item.timeToImplement}`, {
          x: phase.x + 0.1, y: y + 0.32, w: 3.85, h: 0.22, fontSize: 7.5, color: phase.color, fontFace: 'Calibri',
        });
      });
    });

    slide.addText('BrainSpark Platform  |  Confidential — Internal Use Only', {
      x: 0.3, y: 5.2, w: 12, h: 0.3, fontSize: 8, color: '64748b', align: 'center', fontFace: 'Calibri',
    });
  }

  const filename = `BrainSpark_${systemName}_${subName}_${new Date().toISOString().split('T')[0]}.pptx`;
  pptx.writeFile({ fileName: filename });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NAVY_RGB  = [13, 31, 51] as const;
const GOLD_RGB  = [245, 158, 11] as const;
const WHITE_RGB = [255, 255, 255] as const;
const GRAY_RGB  = [100, 116, 139] as const;
const LIGHT_RGB = [248, 250, 252] as const;

function setFill(doc: jsPDF, rgb: readonly [number, number, number]) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}
function setColor(doc: jsPDF, rgb: readonly [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}
function setDraw(doc: jsPDF, rgb: readonly [number, number, number]) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

function diffRgb(diff: string): readonly [number, number, number] {
  if (diff === 'Low')    return [34, 197, 94];
  if (diff === 'Medium') return [245, 158, 11];
  return [239, 68, 68];
}

function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth);
}

/** Truncate to a measured width (current font) with an ellipsis — table cells
 *  must never bleed into the neighbouring column, whatever the LLM wrote. */
function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(t + '…') > maxWidth) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}


// ─── PDF Export ───────────────────────────────────────────────────────────────

export function exportToPdf(result: AnalysisResult, systemName: string, subName: string, evidenceLegend?: string | null): void {
  // jsPDF's WinAnsi fonts garble any Unicode outside cp1252 (arrows etc. that
  // LLM text uses freely) — sanitize ALL report data once, up front.
  result = deepPdfSafe(result);
  systemName = pdfSafe(systemName);
  subName = pdfSafe(subName);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210;  // page width mm
  const PH = 297;  // page height mm
  const ML = 14;   // left margin
  const MR = 14;   // right margin
  const CW = PW - ML - MR;  // content width
  const today = new Date().toISOString().split('T')[0];

  let page = 1;

  function addPageNumber() {
    doc.addImage(LOGO_PNG, 'PNG', ML, PH - 10.2, 5.5, 5.5);   // brand mark, left footer
    setColor(doc, GRAY_RGB);
    doc.setFontSize(8);
    doc.text(`BrainSpark  |  ${systemName} — ${subName}  |  Page ${page}`, PW / 2, PH - 6, { align: 'center' });
  }

  function newPage() {
    doc.addPage();
    page++;
    addPageNumber();
  }

  // ── Page 1: Cover ──────────────────────────────────────────────────────────

  // Navy background top half
  setFill(doc, NAVY_RGB);
  doc.rect(0, 0, PW, 120, 'F');

  // Gold accent bar
  setFill(doc, GOLD_RGB);
  doc.rect(0, 120, PW, 1.2, 'F');

  // Brand: logo beside the name
  doc.addImage(LOGO_PNG, 'PNG', ML, 20, 13, 13);
  setColor(doc, GOLD_RGB);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('BrainSpark', ML + 16, 30);

  setColor(doc, WHITE_RGB);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Cost Reduction Intelligence Report', ML, 42);

  setColor(doc, [148, 163, 184]);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.text(`${systemName} — ${subName}`, ML, 54);

  setColor(doc, [203, 213, 225]);
  doc.setFontSize(10);
  doc.text(`Vehicle Type: ${result.config.vehicleType}`, ML, 66);
  doc.text(`Generated: ${result.generatedAt}`, ML, 73);

  // Summary metrics row
  const metrics = [
    { label: 'Total Ideas',     value: String(result.summary.totalIdeas),       rgb: [59, 130, 246] as const },
    { label: 'Quick Wins',      value: String(result.summary.quickWins),         rgb: [34, 197, 94] as const },
    { label: 'Strategic Items', value: String(result.summary.strategicItems),    rgb: [245, 158, 11] as const },
    { label: 'Web Searches',    value: String(result.summary.searchesPerformed ?? result.sources?.length ?? 0), rgb: [139, 92, 246] as const },
  ];

  const boxW = (CW - 9) / 4;
  metrics.forEach((m, i) => {
    const bx = ML + i * (boxW + 3);
    const by = 84;
    setFill(doc, [30, 41, 59]);
    doc.roundedRect(bx, by, boxW, 22, 2, 2, 'F');
    setFill(doc, m.rgb);
    doc.rect(bx, by, boxW, 1.5, 'F');
    setColor(doc, m.rgb);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(m.value, bx + boxW / 2, by + 13, { align: 'center' });
    setColor(doc, [148, 163, 184]);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(m.label, bx + boxW / 2, by + 19, { align: 'center' });
  });

  // Coverage and review lines (Prism): which evidence lenses ran and which
  // were not explored, and whether a critique pass reviewed the batch. A
  // two-lens run must never read like a full study — on the cover, in words.
  {
    const v = result.validation;
    const lines: string[] = [];
    if (v?.lenses) {
      const l = v.lenses;
      const total = l.run.length + l.skipped.length;
      lines.push(`LENS COVERAGE: ${l.run.length} of ${total || l.run.length} evidence lenses run (${l.run.join(', ') || 'none'})${l.skipped.length ? ` — not explored: ${l.skipped.join(', ')}` : ''}${l.empty.length ? ` — returned nothing: ${l.empty.join(', ')}` : ''}.`);
    }
    if (v?.deep) lines.push(`REVIEW: ${v.deep.level === 'full' ? 'deep mode' : 'critique pass'} — ${v.deep.critiqued} ideas critiqued, ${v.deep.challenges} challenges, ${v.deep.refined} repaired.`);
    if (v?.engineChecks) lines.push(`ENGINE: ${v.engineChecks.checked} checked (${v.engineChecks.confirmed} confirmed, ${v.engineChecks.contradicted} contradicted), ${v.engineChecks.unexpressible} not expressible${v.arithmetic ? ` · ARITHMETIC: ${v.arithmetic.consistent} consistent, ${v.arithmetic.mismatch} mismatch, ${v.arithmetic.unparsed} unparsed` : ''}.`);
    setColor(doc, [203, 213, 225]);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    lines.slice(0, 3).forEach((t, i) => doc.text(fitText(doc, pdfSafe(t), CW), ML, 111 + i * 3.6));
  }

  // Light section — summary table
  setColor(doc, NAVY_RGB);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Executive Summary', ML, 136);

  // Table header
  const cols = [8, 74, 20, 34, 28, 18];   // sums to CW=182 — no right-margin bleed
  const colX = colPositions(cols, ML);
  const headers = ['No.', 'Idea Title', 'Difficulty', 'Cost Saving Types', 'Potential', 'Level'];
  setFill(doc, NAVY_RGB);
  doc.rect(ML, 140, CW, 7, 'F');
  setColor(doc, WHITE_RGB);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  headers.forEach((h, i) => doc.text(h, colX[i] + 1, 145.5));

  // Table rows — stop above the footer and say how many rows were left out
  // rather than silently colliding with it.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const maxExecRows = Math.floor((PH - 26 - 147) / 8);
  if (result.ideas.length > maxExecRows) {
    setColor(doc, GRAY_RGB);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.text(`+ ${result.ideas.length - maxExecRows} more ideas — see the detail pages`, ML, 147 + maxExecRows * 8 + 4);
    doc.setFont('helvetica', 'normal');
  }
  result.ideas.forEach((idea, idx) => {
    const ry = 147 + idx * 8;
    if (idx >= maxExecRows) return; // clip to first page (counted above)
    const bg: readonly [number, number, number] = idx % 2 === 0 ? LIGHT_RGB : WHITE_RGB;
    setFill(doc, bg);
    doc.rect(ML, ry, CW, 8, 'F');
    setDraw(doc, [226, 232, 240]);
    doc.setLineWidth(0.2);
    doc.rect(ML, ry, CW, 8, 'S');

    setColor(doc, [55, 65, 81]);
    const rowData = [
      String(idx + 1),
      fitText(doc, idea.title, cols[1] - 2),
      idea.implementationDifficulty,
      fitText(doc, idea.costSavingTypes.slice(0, 2).join(', '), cols[3] - 2),
      fitText(doc, idea.costSavingPotential.percentage || idea.costSavingPotential.qualitative.split(' ')[0], cols[4] - 2),
      idea.systemLevel,
    ];
    rowData.forEach((d, i) => {
      if (i === 2) setColor(doc, diffRgb(idea.implementationDifficulty));
      else setColor(doc, [55, 65, 81]);
      doc.text(d, colX[i] + 1, ry + 5);
    });
  });

  // Confidential footer
  setColor(doc, GRAY_RGB);
  doc.setFontSize(7.5);
  doc.text('BrainSpark Platform  |  Confidential — Internal Use Only', PW / 2, PH - 14, { align: 'center' });
  addPageNumber();

  // ── Page 2: Business Case Summary (ROI waterfall) ─────────────────────────

  newPage();

  // parseVal used to live here with its own regex, and it read the LOW END of
  // a range where the server and the UI take the midpoint — so this page could
  // ROI-rank the ideas differently from the screen the reader had just seen.
  // One parser now, in report-core.mjs, with a test asserting the two agree.
  const parseVal = parseMoney;

  setFill(doc, NAVY_RGB);
  doc.rect(0, 0, PW, 18, 'F');
  setColor(doc, WHITE_RGB);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Business Case Summary', ML, 12);
  setColor(doc, GOLD_RGB);
  doc.setFontSize(9);
  doc.text('ROI-ranked ideas  |  Annual savings potential', PW - MR, 12, { align: 'right' });

  // Phase summary boxes
  const phaseData = [
    { label: 'Phase 1 — Quick Wins', sub: '0–6 months', ideas: result.ideas.filter(i => i.implementationDifficulty === 'Low'), rgb: [34, 197, 94] as const },
    { label: 'Phase 2 — Programme', sub: '6–18 months', ideas: result.ideas.filter(i => i.implementationDifficulty === 'Medium'), rgb: [245, 158, 11] as const },
    { label: 'Phase 3 — Strategic', sub: '18+ months', ideas: result.ideas.filter(i => i.implementationDifficulty === 'High'), rgb: [139, 92, 246] as const },
  ];
  const bW = (CW - 6) / 3;
  phaseData.forEach((ph, pi) => {
    const bx = ML + pi * (bW + 3);
    const by = 22;
    setFill(doc, [30, 41, 59]);
    doc.roundedRect(bx, by, bW, 28, 2, 2, 'F');
    setFill(doc, ph.rgb);
    doc.rect(bx, by, bW, 1.8, 'F');
    setColor(doc, ph.rgb);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(String(ph.ideas.length), bx + bW / 2, by + 14, { align: 'center' });
    setColor(doc, [148, 163, 184]);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text(ph.label, bx + bW / 2, by + 20, { align: 'center' });
    doc.text(ph.sub, bx + bW / 2, by + 25, { align: 'center' });
  });

  // Top ideas by ROI
  setColor(doc, NAVY_RGB);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Top Ideas by ROI (Savings ÷ Effort)', ML, 60);

  const diffMult: Record<string, number> = { Low: 1, Medium: 3, High: 9 };
  const byRoi = [...result.ideas]
    .map(i => ({ ...i, _roi: parseVal(i.costSavingPotential.annualValue) / diffMult[i.implementationDifficulty] }))
    .sort((a, b) => b._roi - a._roi)
    .slice(0, 10);

  const rCols = [6, 72, 22, 36, 26, 20];   // sums to CW=182
  const rColX = colPositions(rCols, ML);
  const rHeaders = ['#', 'Idea', 'Difficulty', 'Annual Value', 'Saving %', 'Timeline'];
  setFill(doc, NAVY_RGB);
  doc.rect(ML, 64, CW, 7, 'F');
  setColor(doc, WHITE_RGB);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  rHeaders.forEach((h, i) => doc.text(h, rColX[i] + 1, 68.5));

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  byRoi.forEach((idea, idx) => {
    const ry2 = 71 + idx * 8;
    const bg2: readonly [number, number, number] = idx % 2 === 0 ? LIGHT_RGB : WHITE_RGB;
    setFill(doc, bg2);
    doc.rect(ML, ry2, CW, 8, 'F');
    setDraw(doc, [226, 232, 240]);
    doc.setLineWidth(0.2);
    doc.rect(ML, ry2, CW, 8, 'S');
    const rowD = [
      String(idx + 1),
      fitText(doc, idea.title, rCols[1] - 2),
      idea.implementationDifficulty,
      fitText(doc, idea.costSavingPotential.annualValue || '—', rCols[3] - 2),
      fitText(doc, idea.costSavingPotential.percentage || '—', rCols[4] - 2),
      fitText(doc, idea.timeToImplement, rCols[5] - 2),
    ];
    rowD.forEach((d, i) => {
      if (i === 2) setColor(doc, diffRgb(idea.implementationDifficulty));
      else setColor(doc, [55, 65, 81]);
      doc.text(d, rColX[i] + 1, ry2 + 5);
    });
  });

  setColor(doc, GRAY_RGB);
  doc.setFontSize(7.5);
  doc.text('BrainSpark Platform  |  Confidential — Internal Use Only', PW / 2, PH - 14, { align: 'center' });

  // ── Pages 3+: One page per idea ───────────────────────────────────────────

  result.ideas.forEach((idea, idx) => {
    newPage();

    // Header bar
    setFill(doc, NAVY_RGB);
    doc.rect(0, 0, PW, 22, 'F');

    // Idea counter badge
    setColor(doc, [148, 163, 184]);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Idea ${idx + 1} of ${result.ideas.length}`, ML, 8);

    // Difficulty pill
    const dRgb = diffRgb(idea.implementationDifficulty);
    setFill(doc, dRgb);
    doc.roundedRect(PW - MR - 28, 4, 28, 8, 2, 2, 'F');
    setColor(doc, WHITE_RGB);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(idea.implementationDifficulty, PW - MR - 14, 9.5, { align: 'center' });

    // Title
    setColor(doc, WHITE_RGB);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    const titleLines = wrapText(doc, idea.title, CW - 35);
    doc.text(titleLines.slice(0, 2), ML, 14);

    let y = 28;

    // Continuation support: long ideas flow onto extra pages instead of being
    // silently cut — the old fixed boxes lost the tail of every long section.
    const LH = 3.6;                       // body line height (mm) at 8pt
    const LHF = LH / (8 * 0.3528);        // jsPDF lineHeightFactor for that
    const BOTTOM = PH - 16;
    function continuation() {
      newPage();
      setFill(doc, NAVY_RGB);
      doc.rect(0, 0, PW, 12, 'F');
      setColor(doc, WHITE_RGB);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(fitText(doc, `Idea ${idx + 1} (continued) — ${idea.title}`, CW), ML, 8);
      y = 20;
    }
    function flowSection(title: string, body: string, fill: readonly [number, number, number], textCol: readonly [number, number, number], titleCol: readonly [number, number, number] = NAVY_RGB) {
      if (!body.trim()) return;
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      let lines: string[] = wrapText(doc, body, CW - 4);
      let first = true;
      while (lines.length) {
        if (y > BOTTOM - 22) continuation();
        const avail = Math.max(3, Math.floor((BOTTOM - (y + 9)) / LH));
        const chunk = lines.slice(0, avail);
        lines = lines.slice(chunk.length);
        setColor(doc, titleCol); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.text(first ? title : `${title} (continued)`, ML, y);
        y += 4;
        const h = chunk.length * LH + 4.5;
        setFill(doc, fill);
        doc.roundedRect(ML, y, CW, h, 1.5, 1.5, 'F');
        setColor(doc, textCol); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        doc.text(chunk, ML + 2, y + 4.2, { lineHeightFactor: LHF });
        y += h + 5;
        first = false;
      }
    }

    // Metrics strip
    const mLabels = ['System Level', 'Cost Saving', 'Potential', 'Time to Implement'];
    const mVals = [
      idea.systemLevel,
      idea.costSavingTypes.slice(0, 2).join(', '),
      idea.costSavingPotential.percentage || idea.costSavingPotential.qualitative.split('\n')[0],
      idea.timeToImplement,
    ];
    const mW = CW / 4;
    mLabels.forEach((lbl, i) => {
      const mx = ML + i * mW;
      setFill(doc, LIGHT_RGB);
      doc.rect(mx, y, mW - 1, 14, 'F');
      setColor(doc, GRAY_RGB);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(lbl, mx + 2, y + 5);
      setColor(doc, NAVY_RGB);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.text(fitText(doc, mVals[i], mW - 5), mx + 2, y + 11);
    });
    y += 18;

    flowSection('Technical Description', idea.technicalDescription, LIGHT_RGB, [55, 65, 81]);
    flowSection('Manufacturing & Assembly Impact', idea.manufacturingImpact, [240, 253, 244], [55, 65, 81]);

    // The engineering brief — the five sections the prompt demands, printed
    // only where the model wrote them (no heading over empty space).
    if (idea.engineering) {
      const eng = idea.engineering;
      const parts: Array<[keyof typeof eng, string]> = [
        ['mechanism', 'Mechanism'], ['specDeltas', 'Spec deltas'], ['validationPlan', 'Validation plan'],
        ['dfmImplications', 'DFM implications'], ['costBridge', 'Cost bridge'],
      ];
      for (const [k, label] of parts) {
        if (eng[k]) flowSection(`Engineering brief — ${label}`, String(eng[k]), [236, 254, 255], [19, 78, 74]);
      }
    }
    // The model's own sums, recomputed — unparsed says unparsed.
    if (idea.arithmetic) {
      const a = idea.arithmetic;
      const tone: readonly [number, number, number] = a.status === 'consistent' ? [236, 253, 245] : a.status === 'mismatch' ? [254, 242, 242] : [241, 245, 249];
      const ink: readonly [number, number, number] = a.status === 'consistent' ? [6, 95, 70] : a.status === 'mismatch' ? [153, 27, 27] : [71, 85, 105];
      flowSection(`Arithmetic check — ${a.status.toUpperCase()}`, `${a.note}.${a.basis ? ` Read as: ${a.basis}.` : ''}`, tone, ink);
    }
    // Technical depth: the checkable ingredients that are missing, by name.
    if (idea.depth && idea.depth.missing.length > 0) {
      flowSection(`Technical depth ${idea.depth.score}/100 — missing`, idea.depth.missing.map(m => `${m}: ${idea.depth!.criteria[m]?.detail ?? ''}`).join('; '), [255, 251, 235], [120, 53, 15]);
    }

    // DFMA principles (single line, width-fitted)
    if (idea.dfmaPrinciples.length > 0) {
      if (y > BOTTOM - 14) continuation();
      setColor(doc, NAVY_RGB);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('DFMA Principles', ML, y);
      y += 5;
      setColor(doc, [79, 70, 229]);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(fitText(doc, idea.dfmaPrinciples.slice(0, 4).join('  ·  '), CW), ML, y);
      y += 6;
    }

    flowSection('Risk & Impact Notes', idea.riskNotes, [255, 251, 235], [120, 53, 15], [180, 83, 9]);
    if (idea.benchmarkReference) {
      flowSection('Benchmark Reference', idea.benchmarkReference, [240, 253, 244], [21, 94, 55]);
    }

    // Verification & evidence — the provenance the platform stamps on every
    // idea belongs in the report (it IS the trust story).
    const verdict = engineVerdict(idea);
    if (y > BOTTOM - 30) continuation();
    setColor(doc, NAVY_RGB);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Verification & Evidence', ML, y);
    y += 4;
    // Verdict and wording come from idea-provenance.mjs so all four exporters
    // say the same thing; only the colour is chosen here.
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    const ecLines = wrapText(doc, pdfSafe(`${verdict.label} — ${verdict.text}`), CW - 4);
    const TONE_FILL: Record<string, readonly [number, number, number]> = {
      confirmed: [236, 253, 245], contradicted: [254, 242, 242], none: [241, 245, 249],
    };
    const TONE_INK: Record<string, readonly [number, number, number]> = {
      confirmed: [6, 95, 70], contradicted: [153, 27, 27], none: [71, 85, 105],
    };
    const ecH = ecLines.length * LH + 4.5;
    setFill(doc, TONE_FILL[verdict.tone]);
    doc.roundedRect(ML, y, CW, ecH, 1.5, 1.5, 'F');
    setColor(doc, TONE_INK[verdict.tone]);
    doc.text(ecLines, ML + 2, y + 4.2, { lineHeightFactor: LHF });
    y += ecH + 3;
    setColor(doc, GRAY_RGB);
    doc.setFontSize(7.5);
    doc.text(wrapText(doc, fitText(doc, evidenceLine(idea), CW * 2), CW), ML, y);
  });

  // ── Final page: Implementation Roadmap ────────────────────────────────────

  newPage();

  setFill(doc, NAVY_RGB);
  doc.rect(0, 0, PW, 18, 'F');
  setColor(doc, WHITE_RGB);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Implementation Roadmap', ML, 12);

  const sorted = [...result.ideas].sort((a, b) => {
    const order: Record<string, number> = { Low: 0, Medium: 1, High: 2 };
    return order[a.implementationDifficulty] - order[b.implementationDifficulty];
  });

  const phases = [
    { label: 'Quick Wins (0–6 months)',    items: sorted.filter(i => i.implementationDifficulty === 'Low'),    rgb: [34, 197, 94] as const },
    { label: 'Medium Term (6–18 months)',  items: sorted.filter(i => i.implementationDifficulty === 'Medium'),  rgb: [245, 158, 11] as const },
    { label: 'Strategic (18–36 months)',   items: sorted.filter(i => i.implementationDifficulty === 'High'),    rgb: [239, 68, 68] as const },
  ];

  let ry = 24;
  // Roadmap flows onto extra pages instead of silently dropping ideas or
  // colliding with the footer (both happened beyond ~15 ideas).
  function roadmapEnsure(needed: number) {
    if (ry + needed <= PH - 22) return;
    newPage();
    setFill(doc, NAVY_RGB);
    doc.rect(0, 0, PW, 12, 'F');
    setColor(doc, WHITE_RGB);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Implementation Roadmap (continued)', ML, 8);
    ry = 20;
  }
  phases.forEach(phase => {
    roadmapEnsure(24);   // header + at least one item together
    setFill(doc, phase.rgb);
    doc.roundedRect(ML, ry, CW, 8, 2, 2, 'F');
    setColor(doc, WHITE_RGB);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(phase.label, ML + 3, ry + 5.5);
    ry += 10;

    if (phase.items.length === 0) {
      setColor(doc, GRAY_RGB);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text('None in this phase', ML + 3, ry + 4);
      ry += 10;
      return;
    }

    phase.items.forEach(item => {
      roadmapEnsure(15);
      setFill(doc, [30, 41, 59]);
      doc.roundedRect(ML, ry, CW, 13, 1.5, 1.5, 'F');
      setFill(doc, phase.rgb);
      doc.rect(ML, ry, 2.5, 13, 'F');
      setColor(doc, WHITE_RGB);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.text(fitText(doc, item.title, CW - 10), ML + 5, ry + 5.5);
      setColor(doc, phase.rgb);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      const saving = item.costSavingPotential.percentage || item.costSavingPotential.qualitative.split(' ')[0];
      doc.text(fitText(doc, `${saving}  |  ${item.timeToImplement}`, CW - 10), ML + 5, ry + 10.5);
      ry += 15;
    });
    ry += 4;
  });

  // ── Appendix: the measured evidence dossier (Prism runs) ──────────────────
  // Ideas cite [E#]/[W#] lines; a reader of the PDF must be able to RESOLVE
  // them, or the citations are decoration. Renders only the evidence lines
  // and section headers — the prompt preamble is for the model, not a reader.
  if (evidenceLegend && evidenceLegend.trim()) {
    const appendixPage = () => {
      doc.addPage();
      page++;
      setFill(doc, [15, 23, 42]);
      doc.rect(0, 0, PW, PH, 'F');
      addPageNumber();
    };
    appendixPage();
    let ey = 20;
    setColor(doc, WHITE_RGB);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text('Appendix — Measured Evidence Dossier', ML, ey);
    ey += 6;
    setColor(doc, GRAY_RGB);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text('Every [E#]/[W#] reference cited by the ideas resolves to one of these engine-computed lines.', ML, ey);
    ey += 7;
    const legendLines = pdfSafe(evidenceLegend).split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('[E') || l.startsWith('[W') || l.startsWith('##') || l.startsWith('(not available:'));
    for (const raw of legendLines) {
      const isHeader = raw.startsWith('##');
      const text = isHeader ? raw.replace(/^#+\s*/, '') : raw;
      const wrapped = doc.splitTextToSize(text, CW - (isHeader ? 0 : 4)) as string[];
      const need = wrapped.length * 3.6 + (isHeader ? 6 : 1.5);
      if (ey + need > PH - 18) { appendixPage(); ey = 20; }
      if (isHeader) {
        ey += 3;
        setColor(doc, GOLD_RGB);
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
      } else {
        setColor(doc, [203, 213, 225]);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
      }
      doc.text(wrapped, ML + (isHeader ? 0 : 4), ey);
      ey += wrapped.length * 3.6 + (isHeader ? 3 : 1.5);
    }
  }

  setColor(doc, GRAY_RGB);
  doc.setFontSize(8);
  doc.text('BrainSpark Platform  |  Confidential — Internal Use Only', PW / 2, PH - 14, { align: 'center' });

  const filename = safeFilename(`BrainSpark_${systemName}_${subName}_${today}.pdf`);
  doc.save(filename);
}

export function exportRfqPdf(
  result: AnalysisResult,
  systemName: string,
  subName: string,
  approvedIdeas: CostReductionIdea[]
): void {
  // Same WinAnsi discipline as exportToPdf — sanitize every string up front.
  result = deepPdfSafe(result);
  systemName = pdfSafe(systemName);
  subName = pdfSafe(subName);
  approvedIdeas = deepPdfSafe(approvedIdeas);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const PW = 210;
  const PH = 297;
  const ML = 18;
  const MR = 18;
  const CW = PW - ML - MR;

  const NAVY_RGB: [number, number, number] = [13, 31, 51];
  const GOLD_RGB: [number, number, number] = [245, 158, 11];
  const WHITE_RGB: [number, number, number] = [255, 255, 255];
  const GRAY_RGB: [number, number, number] = [100, 116, 139];
  const LIGHT_RGB: [number, number, number] = [241, 245, 249];

  function setColor(d: typeof doc, rgb: [number, number, number]) { d.setTextColor(rgb[0], rgb[1], rgb[2]); }
  function setFill(d: typeof doc, rgb: [number, number, number]) { d.setFillColor(rgb[0], rgb[1], rgb[2]); }

  // Page 1: Cover
  setFill(doc, NAVY_RGB);
  doc.rect(0, 0, PW, PH, 'F');
  setFill(doc, GOLD_RGB);
  doc.rect(0, PH * 0.4, PW, 1.5, 'F');

  doc.addImage(LOGO_PNG, 'PNG', ML, 28, 16, 16);
  setColor(doc, GOLD_RGB);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('BrainSpark', ML + 19, 38.5);

  setColor(doc, GOLD_RGB);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('REQUEST FOR QUOTATION', ML, 80);

  setColor(doc, WHITE_RGB);
  doc.setFontSize(26);
  doc.text('Supplier RFQ Package', ML, 95);

  setColor(doc, [200, 210, 220]);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`${systemName} — ${subName}`, ML, 108);
  doc.text(result.config.vehicleType, ML, 118);

  const rfqMeta = [
    ['Programme', `${systemName}`],
    ['Vehicle Type', result.config.vehicleType],
    ['Plant Region', result.config.plantRegion || 'TBC'],
    ['Annual Volume', result.config.annualVolume ? `${result.config.annualVolume.toLocaleString()} units/yr` : 'TBC'],
    ['Date Issued', today],
    ['RFQ Items', `${approvedIdeas.length} cost reduction opportunities`],
  ];

  let ry = 150;
  rfqMeta.forEach(([label, value]) => {
    setColor(doc, GRAY_RGB);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(label, ML, ry);
    setColor(doc, WHITE_RGB);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(value, ML + 50, ry);
    ry += 10;
  });

  // Basis of estimate, stated once on the cover. A supplier who skims straight
  // to the line items still meets it here, and the per-item BASIS OF ESTIMATE
  // section repeats the verdict for the specific line they are quoting.
  const rfqTally = verificationTally(approvedIdeas);
  setColor(doc, [200, 210, 220]);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  // Built after deepPdfSafe, so it sanitizes itself — see BASIS OF ESTIMATE.
  const discLines = doc.splitTextToSize(
    pdfSafe(
      `${OUTBOUND_DISCLAIMER}  In this pack: ${rfqTally.confirmed} engine-confirmed, `
      + `${rfqTally.contradicted} engine-contradicted, ${rfqTally.unchecked} not engine-checked.`,
    ),
    CW,
  );
  doc.text(discLines, ML, ry + 6);

  setColor(doc, GRAY_RGB);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('BrainSpark AI Cost Engineering Platform  |  CONFIDENTIAL', PW / 2, PH - 15, { align: 'center' });

  // Pages 2+: One RFQ item per idea
  approvedIdeas.forEach((idea, idx) => {
    doc.addPage();
    // Header bar
    setFill(doc, NAVY_RGB);
    doc.rect(0, 0, PW, 28, 'F');
    setFill(doc, GOLD_RGB);
    doc.rect(0, 28, PW, 1, 'F');

    setColor(doc, GOLD_RGB);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`RFQ ITEM ${idx + 1} OF ${approvedIdeas.length}`, ML, 11);

    setColor(doc, WHITE_RGB);
    doc.setFontSize(13);
    // Header bar is 28mm — cap the title at 2 lines so it can never spill
    // (invisibly, in white) onto the page body below the bar.
    const titleLines: string[] = doc.splitTextToSize(idea.title, CW - 30);
    if (titleLines.length > 2) {
      titleLines.length = 2;
      titleLines[1] = fitText(doc, titleLines[1] + '…', CW - 30);
    }
    doc.text(titleLines, ML, titleLines.length > 1 ? 17 : 21);

    let cy = 40;
    // Long specs flow onto continuation pages — the old layout ran straight
    // off the sheet with today's 200-word descriptions.
    function rfqEnsure(needed: number) {
      if (cy + needed <= PH - 22) return;
      doc.addPage();
      setFill(doc, NAVY_RGB);
      doc.rect(0, 0, PW, 12, 'F');
      setColor(doc, GOLD_RGB);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(`RFQ ITEM ${idx + 1} OF ${approvedIdeas.length} (CONTINUED)`, ML, 8);
      cy = 20;
    }
    function rfqSection(title: string, body: string) {
      setColor(doc, NAVY_RGB);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      let lines: string[] = doc.splitTextToSize(body, CW - 8);
      let first = true;
      while (lines.length) {
        rfqEnsure(28);
        const avail = Math.max(3, Math.floor((PH - 22 - (cy + 11)) / 4.2));
        const chunk = lines.slice(0, avail);
        lines = lines.slice(chunk.length);
        setColor(doc, NAVY_RGB); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.text(first ? title : `${title} (CONTINUED)`, ML, cy);
        cy += 5;
        const h = chunk.length * 4.2 + 6;
        setFill(doc, LIGHT_RGB);
        doc.rect(ML, cy, CW, h, 'F');
        setColor(doc, [30, 50, 70]);
        doc.setFontSize(9); doc.setFont('helvetica', 'normal');
        doc.text(chunk, ML + 4, cy + 5.2, { lineHeightFactor: 4.2 / (9 * 0.3528) });
        cy += h + 6;
        first = false;
      }
    }

    // Meta grid: 2×2 with width-fitted values — four unbounded values on one
    // row previously collided and ran off the page edge.
    const halfW = CW / 2;
    const meta: Array<[string, string]> = [
      ['DIFFICULTY', idea.implementationDifficulty],
      ['TARGET TIMELINE', idea.timeToImplement],
      ['SAVING TYPES', idea.costSavingTypes.join(', ')],
      ['ANNUAL SAVING', idea.costSavingPotential.annualValue || 'TBC'],
    ];
    setFill(doc, LIGHT_RGB);
    doc.rect(ML, cy, CW, 26, 'F');
    meta.forEach(([label, value], i) => {
      const mx = ML + (i % 2) * halfW + 4;
      const my = cy + Math.floor(i / 2) * 13;
      setColor(doc, [30, 50, 70]);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.text(label, mx, my + 5.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text(fitText(doc, value, halfW - 10), mx, my + 10.5);
    });
    cy += 34;

    rfqSection('TECHNICAL SPECIFICATION', idea.technicalDescription);
    rfqSection('MANUFACTURING & ASSEMBLY IMPACT', idea.manufacturingImpact);
    // A supplier is being asked to quote against this line. They are entitled
    // to know whether the saving behind it was ever tested by the cost engine
    // or is an AI estimate — the distinction changes how they read the target.
    //
    // pdfSafe is required here even though the idea was deep-sanitized on entry:
    // this string is BUILT after that pass and carries → and − from the
    // provenance module. jsPDF has no WinAnsi metrics for those, so
    // splitTextToSize mis-measures the line and the text runs off the page —
    // caught by scripts/pdf-qa, which is now in CI for exactly this reason.
    rfqSection('BASIS OF ESTIMATE', pdfSafe(`${engineVerdict(idea).text} ${evidenceLine(idea)}`));

    // RFQ Requirements
    rfqEnsure(50);
    setColor(doc, NAVY_RGB);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('SUPPLIER RESPONSE REQUIREMENTS', ML, cy);
    cy += 6;
    const riskBrief = idea.riskNotes.length > 110
      ? idea.riskNotes.slice(0, 110).replace(/\s+\S*$/, '') + '…'   // cut at a word, not mid-word
      : idea.riskNotes;
    const reqs = [
      `1. Confirm technical feasibility for: ${idea.title}`,
      `2. Provide unit cost breakdown (material / process / overhead)`,
      `3. State target cost to achieve ${idea.costSavingPotential.percentage || 'stated saving'}`,
      `4. Detail tooling investment (NRE) required`,
      `5. Confirm implementation timeline: ${idea.timeToImplement}`,
      `6. State PPAP level and qualification plan`,
      `7. Identify risk items: ${riskBrief}`,
    ];
    setColor(doc, [50, 70, 90]);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    reqs.forEach(req => {
      const reqLines: string[] = doc.splitTextToSize(req, CW - 4);
      rfqEnsure(reqLines.length * 4.5 + 3);
      setColor(doc, [50, 70, 90]);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.text(reqLines, ML + 2, cy);
      cy += reqLines.length * 4.5 + 2.5;
    });

    // Benchmark reference
    if (idea.benchmarkReference) {
      const bmkLines: string[] = doc.splitTextToSize(idea.benchmarkReference, CW - 35);
      rfqEnsure(bmkLines.length * 4 + 8);
      cy += 4;
      setColor(doc, [100, 60, 0]);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('INDUSTRY BENCHMARK:', ML, cy);
      setColor(doc, GRAY_RGB);
      doc.setFont('helvetica', 'normal');
      doc.text(bmkLines, ML + 38, cy);
    }

    // Footer (brand mark left, meta centered)
    doc.addImage(LOGO_PNG, 'PNG', ML, PH - 14, 5.5, 5.5);
    setColor(doc, GRAY_RGB);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`BrainSpark RFQ  |  ${systemName} – ${subName}  |  ${today}  |  Page ${idx + 2}`, PW / 2, PH - 10, { align: 'center' });
  });

  const filename = safeFilename(`BrainSpark_RFQ_${systemName}_${today.replace(/ /g, '_')}.pdf`);
  doc.save(filename);
}

// ─── Marketplace PDF exports ─────────────────────────────────────────────────
//
// Two scopes: one idea as a detail sheet, or the currently filtered selection
// as a catalogue. The judgements (provenance wording, which sections exist,
// how the cover describes the filter) live in marketplace-report.mjs where
// tests pin them; this file only draws.

import {
  parseIdeaData, provenanceLabel, ideaSections, filterLine as mkFilterLine,
  verifiedSplit, type MarketplaceIdeaRow, type FilterState,
} from './marketplace-report.mjs';

const today = () => new Date().toISOString().split('T')[0];

/** Shared page geometry for the marketplace exports. */
const MPW = 210, MPH = 297, MML = 14, MCW = MPW - MML - 14;

function mpFooter(doc: jsPDF, label: string, page: number) {
  doc.addImage(LOGO_PNG, 'PNG', MML, MPH - 10.2, 5.5, 5.5);
  setColor(doc, GRAY_RGB);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`BrainSpark Marketplace  |  ${label}  |  Page ${page}`, MPW / 2, MPH - 6, { align: 'center' });
}

/** Header chips row: saving / difficulty / time / level. Returns next y. */
function mpChips(doc: jsPDF, idea: MarketplaceIdeaRow, y: number): number {
  const chips: Array<{ label: string; value: string; rgb: readonly [number, number, number] }> = [
    { label: 'Annual saving (est.)', value: idea.annualSaving || '—', rgb: [34, 197, 94] },
    { label: 'Difficulty', value: idea.difficulty || '—', rgb: diffRgb(idea.difficulty) },
    { label: 'Time to implement', value: idea.timeToImplement || '—', rgb: [59, 130, 246] },
    { label: 'Level', value: idea.level ? idea.level.charAt(0).toUpperCase() + idea.level.slice(1) : '—', rgb: [139, 92, 246] },
  ];
  const boxW = (MCW - 9) / 4;
  chips.forEach((c, i) => {
    const bx = MML + i * (boxW + 3);
    setFill(doc, [30, 41, 59]);
    doc.roundedRect(bx, y, boxW, 18, 2, 2, 'F');
    setFill(doc, c.rgb);
    doc.rect(bx, y, boxW, 1.2, 'F');
    setColor(doc, c.rgb);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.text(fitText(doc, c.value, boxW - 4), bx + boxW / 2, y + 9, { align: 'center' });
    setColor(doc, [148, 163, 184]);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(c.label, bx + boxW / 2, y + 14.5, { align: 'center' });
  });
  return y + 24;
}

/** Export ONE marketplace idea as a detail sheet. */
export function exportMarketplaceIdeaPdf(ideaIn: MarketplaceIdeaRow): void {
  const idea = deepPdfSafe(ideaIn) as MarketplaceIdeaRow;
  const parsed = parseIdeaData(idea.ideaData ?? null);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let page = 1;

  // Header band
  setFill(doc, NAVY_RGB);
  doc.rect(0, 0, MPW, 56, 'F');
  setFill(doc, GOLD_RGB);
  doc.rect(0, 56, MPW, 1.2, 'F');
  doc.addImage(LOGO_PNG, 'PNG', MML, 8, 9, 9);
  setColor(doc, GOLD_RGB);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('BrainSpark  ·  Marketplace Idea', MML + 12, 14.5);
  setColor(doc, WHITE_RGB);
  doc.setFontSize(13);
  const titleLines = wrapText(doc, idea.title, MCW).slice(0, 3);
  doc.text(titleLines, MML, 26);
  setColor(doc, [148, 163, 184]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${idea.system}${idea.costSavingType ? '  ·  ' + idea.costSavingType : ''}  ·  Exported ${today()}`, MML, 26 + titleLines.length * 6 + 3);

  // Provenance — the honesty line, printed before any content.
  const prov = pdfSafe(provenanceLabel(idea, parsed));
  setColor(doc, idea.verified ? ([96, 165, 250] as const) : GOLD_RGB);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(wrapText(doc, prov, MCW), MML, 50);

  mpFooter(doc, fitText(doc, idea.title, 90), page);
  let cy = mpChips(doc, idea, 63);

  const ensure = (need: number) => {
    if (cy + need <= MPH - 16) return;
    doc.addPage();
    page++;
    mpFooter(doc, fitText(doc, idea.title, 90), page);
    cy = 18;
  };

  for (const [heading, text] of ideaSections(idea, parsed)) {
    ensure(14);
    setColor(doc, NAVY_RGB);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(heading, MML, cy);
    cy += 5;
    setColor(doc, [50, 70, 90]);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    // Paragraph-flow the section, breaking pages mid-section when needed.
    for (const para of text.split('\n')) {
      const lines: string[] = wrapText(doc, para, MCW);
      for (const line of lines) {
        ensure(5);
        doc.text(line, MML, cy);
        cy += 4.6;
      }
      cy += 1;
    }
    cy += 4;
  }

  ensure(10);
  setColor(doc, GRAY_RGB);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'italic');
  doc.text(wrapText(doc, pdfSafe(OUTBOUND_DISCLAIMER), MCW), MML, cy);

  doc.save(safeFilename(`BrainSpark_Marketplace_${idea.title.slice(0, 60)}_${today()}.pdf`));
}

/** Export the CURRENT FILTERED selection as a catalogue PDF. The cover states
 *  the filter, the count and the verified/unverified split — the export never
 *  hides what produced it. */
export function exportMarketplaceCataloguePdf(ideasIn: MarketplaceIdeaRow[], filters: FilterState): void {
  const ideas = ideasIn.map(i => deepPdfSafe(i) as MarketplaceIdeaRow);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const split = verifiedSplit(ideas);
  const filterDesc = pdfSafe(mkFilterLine(filters));
  let page = 1;

  // ── Cover ──
  setFill(doc, NAVY_RGB);
  doc.rect(0, 0, MPW, 120, 'F');
  setFill(doc, GOLD_RGB);
  doc.rect(0, 120, MPW, 1.2, 'F');
  doc.addImage(LOGO_PNG, 'PNG', MML, 20, 13, 13);
  setColor(doc, GOLD_RGB);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('BrainSpark', MML + 16, 30);
  setColor(doc, WHITE_RGB);
  doc.setFontSize(18);
  doc.text('Marketplace Idea Catalogue', MML, 46);
  setColor(doc, [203, 213, 225]);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(wrapText(doc, `Selection: ${filterDesc}`, MCW), MML, 58);
  doc.text(`Exported: ${today()}`, MML, 72);

  const metrics = [
    { label: 'Ideas in selection', value: String(split.total), rgb: [59, 130, 246] as const },
    { label: 'Review-verified', value: String(split.verified), rgb: [34, 197, 94] as const },
    { label: 'Unverified (AI/curated)', value: String(split.unverified), rgb: [245, 158, 11] as const },
  ];
  const boxW = (MCW - 6) / 3;
  metrics.forEach((m, i) => {
    const bx = MML + i * (boxW + 3);
    setFill(doc, [30, 41, 59]);
    doc.roundedRect(bx, 84, boxW, 22, 2, 2, 'F');
    setFill(doc, m.rgb);
    doc.rect(bx, 84, boxW, 1.5, 'F');
    setColor(doc, m.rgb);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(m.value, bx + boxW / 2, 97, { align: 'center' });
    setColor(doc, [148, 163, 184]);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(m.label, bx + boxW / 2, 103, { align: 'center' });
  });

  setColor(doc, [50, 70, 90]);
  doc.setFontSize(9);
  doc.text(wrapText(doc,
    'Unverified entries are AI-generated or curated library content: savings are estimates with their arithmetic ' +
    'stated per idea, and no library entry has been engine-checked against a measured part. ' + OUTBOUND_DISCLAIMER,
    MCW), MML, 132);
  mpFooter(doc, filterDesc.slice(0, 60), page);

  // ── Entries ──
  let cy = 160;
  const ensure = (need: number) => {
    if (cy + need <= MPH - 16) return;
    doc.addPage();
    page++;
    mpFooter(doc, filterDesc.slice(0, 60), page);
    cy = 18;
  };

  ideas.forEach((idea, idx) => {
    const parsed = parseIdeaData(idea.ideaData ?? null);
    ensure(30);

    // Entry header: number + title + provenance dot
    setFill(doc, LIGHT_RGB);
    doc.rect(MML, cy - 4, MCW, 6.5, 'F');
    setColor(doc, NAVY_RGB);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.text(fitText(doc, `${idx + 1}.  ${idea.title}`, MCW - 24), MML + 1, cy);
    setColor(doc, idea.verified ? ([34, 197, 94] as const) : GOLD_RGB);
    doc.setFontSize(7);
    doc.text(idea.verified ? 'VERIFIED' : 'UNVERIFIED', MML + MCW - 1, cy, { align: 'right' });
    cy += 6;

    setColor(doc, GRAY_RGB);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text(fitText(doc,
      `${idea.system}  ·  ${idea.annualSaving || '—'}/yr (est.)  ·  ${idea.difficulty}  ·  ${idea.timeToImplement}` +
      (idea.level ? `  ·  ${idea.level}` : ''), MCW), MML + 1, cy);
    cy += 5;

    const body = parsed?.technicalDescription || idea.description || '';
    const bodyLines: string[] = wrapText(doc, body, MCW - 2).slice(0, 6);
    setColor(doc, [50, 70, 90]);
    doc.setFontSize(8);
    for (const line of bodyLines) {
      ensure(4.5);
      doc.text(line, MML + 1, cy);
      cy += 4.2;
    }
    const bm = parsed ? (parsed.benchmarkAnchor?.platform
      ? `Benchmark: ${parsed.benchmarkAnchor.platform}`
      : (parsed.benchmarkReference ? `Benchmark: ${String(parsed.benchmarkReference).split('.')[0]}` : null)) : null;
    if (bm) {
      ensure(4.5);
      setColor(doc, [100, 60, 0]);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.text(fitText(doc, bm, MCW - 2), MML + 1, cy);
      doc.setFont('helvetica', 'normal');
      cy += 4.2;
    }
    cy += 5;
  });

  doc.save(safeFilename(`BrainSpark_Marketplace_Catalogue_${split.total}ideas_${today()}.pdf`));
}
