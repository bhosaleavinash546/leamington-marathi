import * as XLSX from 'xlsx';
import PptxGenJS from 'pptxgenjs';
import { AnalysisResult, CostReductionIdea } from '../types';

const DIFFICULTY_COLOR: Record<string, string> = {
  Low: 'FF92D050',
  Medium: 'FFFFB366',
  High: 'FFFF6B6B',
};

export function exportToExcel(result: AnalysisResult, systemName: string, subName: string): void {
  const wb = XLSX.utils.book_new();

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
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary['!cols'] = [{ wch: 35 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

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
  ]);

  const wsIdeas = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  wsIdeas['!cols'] = [
    { wch: 5 }, { wch: 35 }, { wch: 15 }, { wch: 60 }, { wch: 50 },
    { wch: 30 }, { wch: 20 }, { wch: 25 }, { wch: 25 }, { wch: 12 },
    { wch: 22 }, { wch: 40 }, { wch: 50 }, { wch: 30 },
  ];

  // Color difficulty cells
  rows.forEach((_, i) => {
    const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: 9 });
    const diff = result.ideas[i].implementationDifficulty;
    if (wsIdeas[cellRef]) {
      wsIdeas[cellRef].s = {
        fill: { fgColor: { rgb: DIFFICULTY_COLOR[diff]?.slice(2) || 'FFFFFF' } },
        font: { bold: true },
      };
    }
  });

  XLSX.utils.book_append_sheet(wb, wsIdeas, 'Cost Reduction Ideas');

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

  const wsRoadmap = XLSX.utils.aoa_to_sheet([roadmapHeaders, ...roadmapRows]);
  wsRoadmap['!cols'] = [
    { wch: 8 }, { wch: 35 }, { wch: 12 }, { wch: 22 }, { wch: 28 },
    { wch: 25 }, { wch: 28 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsRoadmap, 'Implementation Roadmap');

  const filename = `BrainSpark_${systemName}_${subName}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, filename);
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
    const metrics2 = [
      { label: 'System Level', value: idea.systemLevel, color: '6366f1' },
      { label: 'Cost Saving Types', value: idea.costSavingTypes.join(', '), color: '0891b2' },
      { label: 'Saving Potential', value: idea.costSavingPotential.percentage || idea.costSavingPotential.qualitative.split('\n')[0], color: '16a34a' },
      { label: 'Annual Value', value: idea.costSavingPotential.annualValue || 'TBD', color: '9333ea' },
      { label: 'Time to Implement', value: idea.timeToImplement, color: 'ea580c' },
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
