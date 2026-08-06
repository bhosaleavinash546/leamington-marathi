// ─────────────────────────────────────────────────────────────────────────────
// BrainSpark Innovation Studio — idea report (PDF + Excel).
//
// House style, deliberately: navy/gold cover with the BrainSpark mark, the same
// footer/pagination discipline as export-service.ts and foresight-report.ts,
// WinAnsi-sanitised once up front, measured wrapping and explicit ensure()
// pagination so nothing is ever silently clipped.
//
// The house rule shows up in the layout: every idea prints its ENGINE CHECK
// verdict as a coloured chip, and a contradicted idea says so as loudly as a
// confirmed one. `analysis` is whatever the chosen method's deterministic core
// produced — it is rendered generically (array-of-objects becomes a table,
// scalars become a metric strip) so all eleven methods, and any future one,
// export without a per-method branch to forget to update.
// ─────────────────────────────────────────────────────────────────────────────
import jsPDF from 'jspdf';
import { pdfSafe, deepPdfSafe } from './pdf-safe.mjs';
import { LOGO_PNG } from './brainspark-logo-png';
import { downloadXlsx, type SheetSpec } from './xlsx-write';
import { prettify, verdictOf as verdictCore, tabulate, columnWidths, safeName, sheetName } from './innovation-report-core.mjs';

export interface InnovationIdea {
  lens: string;
  title: string;
  technicalDescription: string;
  costAngle: string;
  riskNotes?: string;
  // The engine stamps { direction, savingPct }; older/other callers may carry
  // a free-text status or note. Read all of them so the report never silently
  // shows "not checked" for an idea the engine actually judged.
  engineCheck?: { direction?: string; savingPct?: number; status?: string; verdict?: string; note?: string } | null;
}
export interface InnovationReportData {
  method: { id: string; name: string };
  analysis: unknown;
  ideas: InnovationIdea[];
  engineChecks?: { checked: number; confirmed: number; contradicted: number } | null;
  subject?: { part?: string; system?: string; material?: string };
}

type RGB = readonly [number, number, number];
const NAVY: RGB = [13, 31, 51];
const GOLD: RGB = [245, 158, 11];
const INK: RGB = [17, 24, 39];
const BODY: RGB = [55, 65, 81];
const MUT: RGB = [107, 114, 128];
const RULE: RGB = [214, 222, 233];
const PANEL: RGB = [244, 247, 251];
const GREEN: RGB = [4, 120, 87];
const RED: RGB = [185, 28, 28];
const TEAL: RGB = [13, 148, 136];

const setFill = (d: jsPDF, c: RGB) => d.setFillColor(c[0], c[1], c[2]);
const setText = (d: jsPDF, c: RGB) => d.setTextColor(c[0], c[1], c[2]);
const setDraw = (d: jsPDF, c: RGB, w = 0.3) => { d.setDrawColor(c[0], c[1], c[2]); d.setLineWidth(w); };

function fit(doc: jsPDF, t: string, max: number): string {
  if (doc.getTextWidth(t) <= max) return t;
  let s = t;
  while (s.length > 1 && doc.getTextWidth(`${s}…`) > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** Engine verdict → label + house colour. Contradiction is shown, never softened. */
const TONE: Record<string, RGB> = { confirmed: GREEN, contradicted: RED, other: TEAL, none: MUT };
function verdictOf(idea: InnovationIdea): { label: string; colour: RGB; detail: string } {
  const v = verdictCore(idea);
  return { label: v.label, colour: TONE[v.tone] ?? MUT, detail: v.detail };
}



export function exportInnovationPdf(dataIn: InnovationReportData): void {
  const data: InnovationReportData = deepPdfSafe(dataIn);
  const subject = pdfSafe([data.subject?.part, data.subject?.system].filter(Boolean).join(' — ') || 'Cost-reduction ideas');
  const today = new Date().toISOString().split('T')[0];

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, ML = 16, MR = 16;
  const CW = PW - ML - MR;
  let page = 1;
  let y = 0;

  const sans = (s = 10, st: 'normal' | 'bold' | 'italic' = 'normal') => { doc.setFont('helvetica', st); doc.setFontSize(s); };
  const mono = (s = 8, b = false) => { doc.setFont('courier', b ? 'bold' : 'normal'); doc.setFontSize(s); };

  function footer() {
    setDraw(doc, RULE, 0.3);
    doc.line(ML, PH - 13, PW - MR, PH - 13);
    doc.addImage(LOGO_PNG, 'PNG', ML, PH - 10.6, 5.5, 5.5);
    mono(7); setText(doc, MUT);
    // Fit against the width actually left between the logo and the page number,
    // or a long part name walks straight off the right margin on every page.
    doc.text(fit(doc, `BrainSpark Innovation Studio  |  ${data.method.name}  |  ${subject}`, CW - 8 - 10), ML + 8, PH - 7);
    doc.text(String(page).padStart(2, '0'), PW - MR, PH - 7, { align: 'right' });
  }
  function newPage() { doc.addPage(); page += 1; y = 22; footer(); }
  function ensure(h: number) { if (y + h > PH - 20) newPage(); }

  function wrapped(text: string, size = 9.2, colour: RGB = BODY, width = CW, lh = 4.2, style: 'normal' | 'bold' | 'italic' = 'normal', x = ML) {
    sans(size, style); setText(doc, colour);
    for (const line of doc.splitTextToSize(text, width)) {
      ensure(lh + 1);
      doc.text(line, x, y);
      y += lh;
    }
  }
  function sectionTitle(kicker: string, title: string) {
    ensure(16);
    mono(7, true); setText(doc, GOLD);
    doc.text(kicker.toUpperCase(), ML, y); y += 4.6;
    sans(14, 'bold'); setText(doc, INK);
    doc.text(title, ML, y); y += 3;
    setDraw(doc, RULE, 0.4); doc.line(ML, y, PW - MR, y); y += 6;
  }

  // ── Cover ──────────────────────────────────────────────────────────────────
  setFill(doc, NAVY); doc.rect(0, 0, PW, 74, 'F');
  setFill(doc, GOLD); doc.rect(0, 74, PW, 1.6, 'F');
  doc.addImage(LOGO_PNG, 'PNG', ML, 16, 16, 16);
  sans(9); setText(doc, [226, 232, 240]);
  doc.text('B R A I N S P A R K', ML + 20, 22.5);
  sans(24, 'bold'); setText(doc, [255, 255, 255]);
  doc.text('Innovation Studio', ML + 20, 32);
  sans(12); doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
  doc.text(`${data.method.name} — idea report`, ML + 20, 40);
  mono(8); setText(doc, [148, 163, 184]);
  doc.text(fit(doc, subject.toUpperCase(), CW - 24), ML + 20, 50);
  doc.text(`GENERATED ${today}  ·  ${data.ideas.length} IDEAS  ·  METHOD ${data.method.id.toUpperCase()}`, ML + 20, 57);
  y = 88;
  // Stamp the cover's own footer before any content: wrapped()/ensure() below
  // may spill onto a new page, and newPage() footers that one itself.
  footer();

  // Metric tiles
  const ec = data.engineChecks;
  const tiles: [string, string, RGB][] = [
    [String(data.ideas.length), 'IDEAS', NAVY],
    [String(ec?.confirmed ?? 0), 'ENGINE-CONFIRMED', GREEN],
    [String(ec?.contradicted ?? 0), 'CONTRADICTED', RED],
    [String(new Set(data.ideas.map(i => i.lens)).size), 'LENSES USED', TEAL],
  ];
  const tw = (CW - 9) / 4;
  tiles.forEach(([v, l, c], i) => {
    const x = ML + i * (tw + 3);
    setFill(doc, c); doc.roundedRect(x, y, tw, 20, 2, 2, 'F');
    sans(15, 'bold'); setText(doc, [255, 255, 255]);
    doc.text(v, x + tw / 2, y + 9.5, { align: 'center' });
    mono(5.6); setText(doc, [226, 232, 240]);
    doc.text(l, x + tw / 2, y + 15.5, { align: 'center' });
  });
  y += 28;

  sans(11, 'bold'); setText(doc, INK);
  doc.text('How to read this report', ML, y); y += 5.5;
  wrapped('Every idea below was generated by a named method against your part, then passed through BrainSpark\'s deterministic cost engines. The ENGINE CHECK chip on each idea says whether the engine could confirm the cost claim, contradicted it, or had nothing to check it against — a contradicted idea is printed in full, in red, because knowing which ideas fail is worth as much as knowing which pass.', 9.2, BODY);
  y += 2;
  wrapped('Method analysis is deterministic output — the numbers come from the engine, not from the AI. The AI writes the idea text and is forbidden from inventing a figure.', 9, MUT, CW, 4.2, 'italic');
  y += 6;

  // Ideas at a glance — a contents block, so the cover carries navigation
  // rather than white space and the reader can see every verdict at once.
  ensure(20);
  sans(11, 'bold'); setText(doc, INK);
  doc.text('Ideas at a glance', ML, y); y += 4;
  setDraw(doc, RULE, 0.4); doc.line(ML, y, PW - MR, y); y += 5;
  const glanceW = { n: 8, lens: 44, verdict: 40 };
  const titleW = CW - glanceW.n - glanceW.lens - glanceW.verdict - 6;
  mono(6, true); setText(doc, MUT);
  doc.text('#', ML, y);
  doc.text('IDEA', ML + glanceW.n, y);
  doc.text('LENS', ML + glanceW.n + titleW + 3, y);
  doc.text('ENGINE CHECK', PW - MR, y, { align: 'right' });
  y += 4;
  data.ideas.forEach((idea, i) => {
    ensure(6);
    const v = verdictOf(idea);
    if (i % 2 === 1) { setFill(doc, PANEL); doc.rect(ML - 1.5, y - 3.4, CW + 3, 5, 'F'); }
    mono(7); setText(doc, MUT);
    doc.text(String(i + 1).padStart(2, '0'), ML, y);
    sans(8.6); setText(doc, INK);
    doc.text(fit(doc, idea.title, titleW), ML + glanceW.n, y);
    sans(7.6); setText(doc, MUT);
    doc.text(fit(doc, idea.lens, glanceW.lens - 3), ML + glanceW.n + titleW + 3, y);
    mono(6, true); setText(doc, v.colour);
    doc.text(v.label, PW - MR, y, { align: 'right' });
    y += 5;
  });

  // ── Method analysis ────────────────────────────────────────────────────────
  const a = data.analysis as Record<string, unknown> | null;
  if (a && typeof a === 'object') {
    newPage();
    sectionTitle('Method analysis', `${data.method.name} — deterministic output`);

    // Short scalars become tiles; a long one is a sentence, not a metric, so it
    // is printed in full below rather than silently truncated in a tile.
    const allScalars = Object.entries(a).filter(([, v]) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean');
    const scalars = allScalars.filter(([, v]) => String(v).length <= 28);
    const notes = allScalars.filter(([, v]) => String(v).length > 28);
    if (scalars.length) {
      const rows = Math.ceil(scalars.length / 3);
      ensure(rows * 9 + 6);
      setFill(doc, PANEL); doc.roundedRect(ML, y - 4.5, CW, rows * 9 + 4, 1.5, 1.5, 'F');
      scalars.forEach(([k, v], i) => {
        const col = i % 3, row = Math.floor(i / 3);
        const x = ML + 4 + col * (CW / 3);
        mono(6.4); setText(doc, MUT);
        doc.text(fit(doc, prettify(k).toUpperCase(), CW / 3 - 8), x, y + row * 9);
        sans(10, 'bold'); setText(doc, INK);
        doc.text(fit(doc, String(v), CW / 3 - 8), x, y + row * 9 + 5);
      });
      y += rows * 9 + 4;
    }
    for (const [k, v] of notes) {
      mono(6.4, true); setText(doc, MUT); ensure(7);
      doc.text(prettify(k).toUpperCase(), ML, y); y += 3.8;
      wrapped(String(v), 9, BODY);
      y += 2;
    }

    for (const [key, val] of Object.entries(a)) {
      const t = tabulate(val, prettify(key));
      if (!t) continue;
      ensure(16);
      mono(7, true); setText(doc, GOLD);
      doc.text(prettify(key).toUpperCase(), ML, y); y += 4.5;
      // A list of plain values is a list, not a one-column table — a table
      // would repeat the heading it already sits under.
      if (t.headers.length === 1) {
        for (const [ri, r] of t.rows.entries()) {
          ensure(5.5);
          if (ri % 2 === 1) { setFill(doc, PANEL); doc.rect(ML, y - 3.2, CW, 4.6, 'F'); }
          setFill(doc, GOLD); doc.circle(ML + 2, y - 1.2, 0.7, 'F');
          sans(8.6); setText(doc, BODY);
          doc.text(fit(doc, r[0], CW - 8), ML + 5, y);
          y += 4.6;
        }
        y += 5;
        continue;
      }
      const widths = columnWidths(t, CW);
      const xs: number[] = [];
      widths.reduce((x, w, i) => { xs[i] = x; return x + w; }, ML);
      const header = () => {
        setFill(doc, NAVY); doc.rect(ML, y - 3.6, CW, 5.4, 'F');
        mono(6.4, true); setText(doc, [255, 255, 255]);
        t.headers.forEach((h, i) => doc.text(fit(doc, h.toUpperCase(), widths[i] - 3), xs[i] + 2, y));
        y += 4;
      };
      header();
      t.rows.forEach((r, ri) => {
        if (y + 5.5 > PH - 20) { newPage(); header(); }
        if (ri % 2 === 1) { setFill(doc, PANEL); doc.rect(ML, y - 3.2, CW, 4.6, 'F'); }
        sans(8); setText(doc, BODY);
        r.forEach((c, i) => doc.text(fit(doc, c, widths[i] - 3), xs[i] + 2, y));
        y += 4.6;
      });
      y += 5;
    }
  }

  // ── Ideas ──────────────────────────────────────────────────────────────────
  // Only break to a fresh page when there is too little room left for a card —
  // otherwise the analysis page ends in half a page of white.
  if (y > PH - 90) newPage(); else y += 6;
  sectionTitle('Ideas', `${data.ideas.length} generated — every one engine-checked or marked unchecked`);

  data.ideas.forEach((idea, i) => {
    const v = verdictOf(idea);

    // Title wraps rather than truncating — it is the one line a reader must be
    // able to read in full — so the header band is measured before it is drawn.
    sans(11.5, 'bold');
    const chipW = doc.getStringUnitWidth(v.label) * 6.6 / doc.internal.scaleFactor + 6;
    const titleLines: string[] = doc.splitTextToSize(`${String(i + 1).padStart(2, '0')}.  ${idea.title}`, CW - chipW - 12);
    const bandH = 6.5 + titleLines.length * 5.4;
    ensure(bandH + 34);
    const top = y - 4;

    setFill(doc, PANEL); doc.rect(ML, top, CW, bandH, 'F');
    setFill(doc, v.colour); doc.rect(ML, top, 1.6, bandH, 'F');
    setFill(doc, v.colour); doc.roundedRect(PW - MR - chipW - 3, top + 2, chipW, 5.4, 1, 1, 'F');
    mono(6.6, true); setText(doc, [255, 255, 255]);
    doc.text(v.label, PW - MR - 3 - chipW / 2, top + 5.8, { align: 'center' });

    sans(11.5, 'bold'); setText(doc, INK);
    y = top + 5.6;
    for (const line of titleLines) { doc.text(line, ML + 4.5, y); y += 5.4; }

    mono(6.8); setText(doc, MUT);
    doc.text(fit(doc, `LENS: ${idea.lens.toUpperCase()}`, CW - 8), ML + 4.5, y);
    y += 5.6;

    if (idea.technicalDescription) {
      mono(6.4, true); setText(doc, MUT); ensure(6);
      doc.text('TECHNICAL DESCRIPTION', ML + 4.5, y); y += 3.8;
      wrapped(idea.technicalDescription, 9.2, BODY, CW - 9, 4.1, 'normal', ML + 4.5);
    }
    if (idea.costAngle) {
      mono(6.4, true); setText(doc, GREEN); ensure(6);
      doc.text('COST ANGLE', ML + 4.5, y); y += 3.8;
      wrapped(idea.costAngle, 9.2, BODY, CW - 9, 4.1, 'normal', ML + 4.5);
    }
    if (idea.riskNotes) {
      mono(6.4, true); setText(doc, [200, 90, 30]); ensure(6);
      doc.text('RISKS & UNKNOWNS', ML + 4.5, y); y += 3.8;
      wrapped(idea.riskNotes, 9.2, BODY, CW - 9, 4.1, 'normal', ML + 4.5);
    }
    if (v.detail) {
      mono(6.4, true); setText(doc, v.colour); ensure(6);
      doc.text('ENGINE CHECK', ML + 4.5, y); y += 3.8;
      wrapped(v.detail, 9, v.colour, CW - 9, 4.1, 'normal', ML + 4.5);
    }

    // Closing bracket in the verdict colour, then a hairline so consecutive
    // cards read as separate objects even when two share a page.
    y += 1.5;
    setDraw(doc, v.colour, 0.45);
    doc.line(PW - MR - 3, y, PW - MR, y); doc.line(PW - MR, y - 3, PW - MR, y);
    setDraw(doc, RULE, 0.2); doc.line(ML, y + 3.5, PW - MR, y + 3.5);
    y += 11;
  });

  // ── Provenance ─────────────────────────────────────────────────────────────
  newPage();
  sectionTitle('Engine check', 'What each verdict on an idea actually means');
  const legend: [string, RGB, string][] = [
    ['ENGINE-CONFIRMED', GREEN, 'The should-cost engine re-costed the change and agreed the claimed saving direction is plausible. The percentage shown is the engine\'s figure, not the AI\'s.'],
    ['ENGINE-CONTRADICTED', RED, 'The engine re-costed the change and disagreed — either the direction is wrong or the magnitude is not supported. These ideas are printed in full so you can judge the disagreement yourself; sometimes the engine\'s assumptions are the thing that is wrong.'],
    ['NOT ENGINE-CHECKED', MUT, 'The engine had no comparable basis to test the claim against — usually a change outside its modelled cost drivers. Treat the saving as an unverified hypothesis, not an estimate.'],
  ];
  for (const [label, colour, text] of legend) {
    ensure(16);
    const w = doc.getStringUnitWidth(label) * 6.6 / doc.internal.scaleFactor + 6;
    setFill(doc, colour); doc.roundedRect(ML, y - 3.6, w, 5.4, 1, 1, 'F');
    mono(6.6, true); setText(doc, [255, 255, 255]);
    doc.text(label, ML + w / 2, y, { align: 'center' });
    y += 5;
    wrapped(text, 9.2, BODY, CW - 4, 4.2, 'normal', ML + 4);
    y += 4;
  }
  y += 4;

  sectionTitle('Provenance', 'Where every number came from');
  for (const line of [
    'Method analysis is produced by BrainSpark\'s deterministic cores (innovation.mjs) — function-cost matrices, DFA counts, spec-relaxation deltas and teardown deltas are computed, not estimated by a language model.',
    'Idea text is written by the AI layer from those computed results. The AI is instructed that it may not introduce a cost figure the engine did not produce.',
    'ENGINE CHECK is a second, independent pass: each idea\'s cost claim is re-costed against the should-cost engine. Confirmed, contradicted and unchecked are all reported — nothing is hidden because it failed.',
    'Savings figures are directional and intended for prioritisation, not for quotation. Validate against a supplier quotation or a detailed should-cost study before commercial commitment.',
  ]) { wrapped(`•  ${line}`, 9.2, BODY); y += 2; }

  y += 6;
  sectionTitle('Next steps', 'Turning this list into booked savings');
  for (const line of [
    'Start with the engine-confirmed ideas: they already have a modelled cost basis, so a business case can be raised against them without further study.',
    'Read the contradicted ideas rather than discarding them. A contradiction tells you the engine and the idea disagree about a cost driver — resolving that disagreement is often where the real saving is found.',
    'For unchecked ideas, identify the missing cost driver and re-run the should-cost study with it modelled; the idea then becomes checkable.',
    'Promote the ideas you intend to pursue into the BrainSpark savings pipeline so they carry a gate, an owner and an audited saving through to implementation.',
  ]) { wrapped(`•  ${line}`, 9.2, BODY); y += 2; }

  doc.save(safeName(`BrainSpark_Innovation_${data.method.name}_${subject}_${today}.pdf`));
}

// ── Excel ────────────────────────────────────────────────────────────────────

export async function exportInnovationXlsx(data: InnovationReportData): Promise<void> {
  const subject = [data.subject?.part, data.subject?.system].filter(Boolean).join(' — ') || 'Cost-reduction ideas';
  const today = new Date().toISOString().split('T')[0];
  const ec = data.engineChecks;
  const sheets: SheetSpec[] = [];

  sheets.push({
    name: 'Summary',
    title: `BrainSpark Innovation Studio — ${data.method.name}`,
    subtitle: `${subject}  ·  generated ${today}  ·  method analysis is deterministic; idea text is AI-written and engine-checked`,
    headerRow: 0,
    zebra: true,
    colWidths: [34, 22, 60],
    wrapCols: [2],
    rows: [
      ['Metric', 'Value', 'What it means'],
      ['Method', data.method.name, 'The idea-generation method applied to this part'],
      ['Subject', subject, 'Part / system the ideas were generated against'],
      ['Ideas generated', data.ideas.length, 'Total ideas after de-duplication'],
      ['Engine-checked', ec?.checked ?? 0, 'Ideas whose cost claim the engine could evaluate'],
      ['Engine-confirmed', ec?.confirmed ?? 0, 'Engine agreed the claimed saving direction is plausible'],
      ['Engine-contradicted', ec?.contradicted ?? 0, 'Engine disagreed — review before pursuing'],
      ['Lenses used', new Set(data.ideas.map(i => i.lens)).size, 'Distinct idea lenses represented'],
      ['Generated', today, 'Report date'],
    ],
  });

  sheets.push({
    name: 'Ideas',
    title: 'Ideas — full detail',
    subtitle: 'Every idea, its lens, cost angle, risks and engine verdict. Contradicted ideas are shown, not filtered.',
    headerRow: 0,
    zebra: true,
    autoFilter: true,
    colWidths: [5, 20, 40, 62, 46, 40, 22, 16, 44],
    wrapCols: [2, 3, 4, 5, 8],
    numFmt: { 7: '0.0"%"' },
    statusColors: [
      { match: 'contradicted', argb: 'FFFDECEC' },
      { match: 'confirmed', argb: 'FFECFBF3' },
    ],
    rows: [
      ['#', 'Lens', 'Title', 'Technical description', 'Cost angle', 'Risks & unknowns', 'Engine check', 'Saving %', 'Engine note'],
      ...data.ideas.map((i, n) => [
        n + 1,
        i.lens,
        i.title,
        i.technicalDescription,
        i.costAngle,
        i.riskNotes ?? '',
        verdictOf(i).label,
        typeof i.engineCheck?.savingPct === 'number' ? i.engineCheck.savingPct : '',
        verdictOf(i).detail,
      ]),
    ],
  });

  // Method analysis: one sheet per tabular block, so a FAST matrix or a
  // characteristic register arrives as a real table, not a JSON blob.
  const a = data.analysis as Record<string, unknown> | null;
  if (a && typeof a === 'object') {
    const scalars = Object.entries(a).filter(([, v]) => typeof v !== 'object' || v === null);
    if (scalars.length) {
      sheets.push({
        name: 'Method analysis',
        title: `${data.method.name} — deterministic analysis`,
        subtitle: 'Computed by the BrainSpark engine. These figures are not AI estimates.',
        headerRow: 0, zebra: true, colWidths: [40, 46],
        rows: [['Measure', 'Value'], ...scalars.map(([k, v]) => [prettify(k), v as string | number])],
      });
    }
    for (const [key, val] of Object.entries(a)) {
      const t = tabulate(val);
      if (!t) continue;
      sheets.push({
        name: sheetName(key),
        title: `${data.method.name} — ${prettify(key)}`,
        subtitle: 'Deterministic engine output.',
        headerRow: 0, zebra: true, autoFilter: true,
        colWidths: t.headers.map(() => 26),
        rows: [t.headers, ...t.rows],
      });
    }
  }

  await downloadXlsx(safeName(`BrainSpark_Innovation_${data.method.name}_${subject}_${today}.xlsx`), sheets);
}
