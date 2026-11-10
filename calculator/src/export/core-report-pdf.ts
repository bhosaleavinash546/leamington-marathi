/**
 * The CORE should-cost report (report standard, Nov 2026 — docs/review/report-standard-2026-11/README.md §3): seven
 * pages a decision-maker reads, drawn from ONE model (`buildCoreReport`, executive-summary.ts). The full report is the
 * audit pack (pdf.ts, `printAuditPackPDF`).
 *
 *   1 Decision · 2 Cost build-up · 3 Process · 4 What moves the price · 5 Supplier negotiation · 6 Alternatives ·
 *   7 Design to cost (+ the reproducibility stamp and the sign-off block)
 *
 * This file only lays the model out: every figure is the model's, every money figure goes through the report's money
 * formatter, and the document it draws into is the hardened one (pdf.ts `hardenPdfText`: WinAnsi-safe, and £ in text
 * converted to the report currency).
 */
import type { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { brandRgb } from '../brand/index.js';
import type { CoreReport } from './executive-summary.js';
import { bridgePrintRows, bridgeReAddText } from './cost-bridge.js';
import { balancePrintRows } from './material-balance.js';

type RGB = [number, number, number];
const W = 210, MG = 14, CW = W - MG * 2, BOTTOM = 276;
const NAVY: RGB = brandRgb('navy');
const ACCENT: RGB = brandRgb('blue');
const SLATE: RGB = brandRgb('slate');
const GREY: RGB = brandRgb('muted');
const GN: RGB = brandRgb('green');
const RD: RGB = brandRgb('red');
const AM: RGB = brandRgb('amber');
const HDR: RGB = [232, 235, 245];
const LIGHT: RGB = [248, 250, 252];
const WHITE: RGB = [255, 255, 255];

export interface CoreRenderOptions {
  /** £ to the report currency, 2 dp, with its symbol. */
  money: (gbp: number) => string;
  fx: number;
  sym: string;
  currency: string;
  dateStr: string;
  /** One isometric render of the CAD model for page 1 (optional). */
  cadView?: { dataUrl: string; label: string } | null;
}

/** The number of numbered sections — the page count the standard targets. */
export const CORE_SECTIONS = 7;

export function renderCoreReport(doc: jsPDF, m: CoreReport, o: CoreRenderOptions): void {
  const money = o.money;
  const whole = (gbp: number) => `${o.sym}${Math.round(gbp * o.fx).toLocaleString('en-GB')}`;
  const signed = (gbp: number) => `${gbp < 0 ? '-' : '+'}${money(Math.abs(gbp))}`;
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  let y = 16;

  const chk = (need: number) => { if (y + need > BOTTOM) { doc.addPage(); y = 18; } };
  /** A numbered section starts a page — unless `flowIfRoom` mm are left on this one (a short section, no page hole). */
  const section = (n: number, title: string, sub?: string, flowIfRoom?: number) => {
    if (n > 1) { if (flowIfRoom != null && y + flowIfRoom <= BOTTOM) y += 4; else { doc.addPage(); y = 16; } }
    doc.setFillColor(...NAVY); doc.roundedRect(MG, y, CW, 10, 1.5, 1.5, 'F');
    doc.setFillColor(...ACCENT); doc.rect(MG, y, 3, 10, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...WHITE);
    doc.text(`${n}. ${title}`, MG + 7, y + 6.7);
    if (sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(200, 215, 240); doc.text(sub, W - MG - 3, y + 6.7, { align: 'right' }); }
    y += 14;
  };
  const head = (title: string, right?: string) => {
    chk(14);
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); doc.text(title, MG, y + 3);
    if (right) { doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY); doc.text(right, W - MG, y + 3, { align: 'right' }); }
    doc.setDrawColor(...ACCENT); doc.setLineWidth(0.3); doc.line(MG, y + 4.6, W - MG, y + 4.6);
    y += 6.5;
  };
  const para = (text: string, size = 7.3, colour: RGB = SLATE, style: 'normal' | 'italic' | 'bold' = 'normal', indent = 0) => {
    doc.setFontSize(size); doc.setFont('helvetica', style); doc.setTextColor(...colour);
    const lines = doc.splitTextToSize(text, CW - indent) as string[];
    const lh = size * 0.43;
    chk(lines.length * lh + 1);
    doc.text(lines, MG + indent, y + lh * 0.8);
    y += lines.length * lh + 1.2;
  };
  const bullets = (items: string[], size = 7.1, colour: RGB = SLATE) => { for (const t of items) para(`•  ${t}`, size, colour, 'normal', 1); };
  const table = (headRow: string[], body: (string | number)[][], columnStyles: Record<number, Record<string, unknown>>, opts: { fontSize?: number; bold?: (row: number) => boolean; fill?: (row: number) => RGB | null } = {}) => {
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG, bottom: 20 }, theme: 'plain',
      head: [headRow], body: body.map(r => r.map(c => String(c))),
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 6.5, cellPadding: 1.4 },
      bodyStyles: { fontSize: opts.fontSize ?? 7, textColor: SLATE, cellPadding: 1.05, overflow: 'linebreak' },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles,
      didParseCell: (d) => {
        if (d.section === 'head') { const cs = columnStyles[d.column.index] as { halign?: string } | undefined; if (cs?.halign) d.cell.styles.halign = cs.halign as 'right'; }
        if (d.section !== 'body') return;
        if (opts.bold?.(d.row.index)) { d.cell.styles.fontStyle = 'bold'; }
        const f = opts.fill?.(d.row.index); if (f) d.cell.styles.fillColor = f;
      },
    });
    y = lastY() + 3;
  };
  const callout = (title: string, lines: string[], accent: RGB, fill: RGB) => {
    doc.setFontSize(7.2); doc.setFont('helvetica', 'normal');
    const wrapped = lines.flatMap(l => doc.splitTextToSize(l, CW - 10) as string[]);
    const h = 7.5 + wrapped.length * 3.3 + 1.5;
    chk(h + 2);
    doc.setFillColor(...fill); doc.roundedRect(MG, y, CW, h, 1.2, 1.2, 'F');
    doc.setFillColor(...accent); doc.rect(MG, y, 1.4, h, 'F');
    doc.setFontSize(7.8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...accent); doc.text(title, MG + 4.5, y + 5);
    doc.setFontSize(7.2); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
    let ty = y + 9;
    for (const w of wrapped) { doc.text(w, MG + 4.5, ty); ty += 3.3; }
    y += h + 2.5;
  };

  const pct = (n: number) => `${n.toFixed(1)}%`;

  // ════════ 1. DECISION ════════
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...NAVY);
  doc.text('Should-Cost Report', MG, y + 4);
  doc.setFontSize(10.5);
  const titleLines = doc.splitTextToSize(m.part, o.cadView ? CW - 50 : CW) as string[];
  doc.text(titleLines, MG, y + 10.5);
  const titleExtra = (titleLines.length - 1) * 4.5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GREY);
  doc.text(`${m.commodity ?? 'Costing'}  ·  ${m.country}  ·  ${o.dateStr}${o.currency !== 'GBP' ? `  ·  ${o.currency} (1 GBP = ${o.fx.toFixed(4)} ${o.currency})` : ''}`, MG, y + 15.5 + titleExtra);
  let imgBottom = 0;
  if (o.cadView) {
    try {
      const props = doc.getImageProperties(o.cadView.dataUrl);
      const iw = 44, ih = Math.min(33, iw * (props.height / props.width));
      doc.setDrawColor(...NAVY); doc.setLineWidth(0.2); doc.roundedRect(W - MG - iw, y - 2, iw, ih, 1.2, 1.2, 'S');
      doc.addImage(o.cadView.dataUrl, props.fileType || 'JPEG', W - MG - iw + 0.6, y - 1.4, iw - 1.2, ih - 1.2, undefined, 'FAST');
      imgBottom = y - 2 + ih;
    } catch { /* the costing is unaffected */ }
  }
  y = Math.max(y + 19 + titleExtra, imgBottom + 3);
  doc.setFillColor(...ACCENT); doc.rect(MG, y, CW, 0.5, 'F'); y += 3;
  section(1, 'Decision', 'what it costs, what it rests on, what is not in it');
  // The verdict: one line a President reads first (fresh review §5).
  para(m.verdict, 8, NAVY, 'bold');
  y += 1;

  // Headline
  const boxH = 26;
  chk(boxH + 3);
  doc.setFillColor(...HDR); doc.roundedRect(MG, y, CW, boxH, 2, 2, 'F');
  doc.setFontSize(6.8); doc.setTextColor(...GREY); doc.setFont('helvetica', 'normal'); doc.text('SHOULD-COST A PART', MG + 4, y + 5.5);
  doc.setFontSize(19); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); doc.text(money(m.total), MG + 4, y + 13.5);
  doc.setFontSize(6.8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
  if (m.band) {
    doc.text(`P10 ${money(m.band.p10)} – P90 ${money(m.band.p90)}  (± ${m.band.plusMinusPct}%)`, MG + 4, y + 18.5);
    doc.setTextColor(...GREY);
    doc.text(doc.splitTextToSize(`The band is ${m.bandNote}.`, 96) as string[], MG + 4, y + 21.8);
  }
  const rx = MG + 104;
  doc.setFontSize(6.8); doc.setTextColor(...GREY); doc.text('A YEAR AT THIS VOLUME', rx, y + 5.5);
  doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text(m.annualSpend != null ? whole(m.annualSpend) : 'no volume entered', rx, y + 11.5);
  doc.setFontSize(6.8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
  if (m.annualVolume) doc.text(`${m.annualVolume.toLocaleString('en-GB')} a year${m.programmeYears ? ` · ${m.programmeYears}-year programme (${(m.annualVolume * m.programmeYears).toLocaleString('en-GB')} parts)` : ''}`, rx, y + 16);
  doc.text(doc.splitTextToSize(m.terms, CW - 108) as string[], rx, y + 20);
  y += boxH + 3;

  // The price as a supplier quotes it: piece price (running tooling inside) + the up-front tooling as a lump sum.
  const t = m.tooling;
  const pr = m.price;
  const tiles: Array<[string, string, string]> = [
    ['PIECE PRICE AS QUOTED', money(pr.pieceAsQuotedGbp), pr.mode === 'amortized'
      ? 'replacement sets and tool wear inside it; the up-front tooling out (the stack re-run)'
      : pr.mode === 'one_time_nre' ? 'the headline: tooling is charged once, outside it' : 'the headline: no tooling in this costing'],
    ['UP-FRONT TOOLING (LUMP SUM)', pr.upfrontGbp > 0.5 ? whole(pr.upfrontGbp) : 'none',
      pr.upfrontGbp <= 0.5 ? 'no up-front tooling in this costing' : pr.unsplitCountedUpfront ? `first sets, fixtures, programming — incl. ${whole(t.unsplitGbp)} not split into sets` : 'first sets, fixtures, programming and masters'],
    // Two different "wear" figures were printed side by side (fresh review, 4 Nov 2026): this tile is the TOOLING bucket's
    // running share — replacement die / pattern / tool sets and perishable tooling items; cutting-tool wear (inserts,
    // drills) is a consumable in material and is said below under its own name.
    ['OF WHICH TOOL REPLACEMENT SETS', pr.mode === 'amortized' ? `${money(pr.runningPerPartGbp)} a part` : 'none',
      'replacement tool sets, with overhead and margin — inside the piece price (not cutting-tool wear)'],
  ];
  const tw = (CW - 4) / 3;
  chk(20);
  tiles.forEach(([lbl, val, note], i) => {
    const x = MG + i * (tw + 2);
    doc.setDrawColor(...HDR); doc.setLineWidth(0.4); doc.roundedRect(x, y, tw, 17, 1.2, 1.2, 'S');
    doc.setFontSize(6); doc.setTextColor(...GREY); doc.text(lbl, x + 2.5, y + 4.2);
    doc.setFontSize(10.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); doc.text(val, x + 2.5, y + 9.5);
    doc.setFontSize(5.8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY); doc.text(doc.splitTextToSize(note, tw - 5) as string[], x + 2.5, y + 12.6);
  });
  y += 20;
  if (pr.mode === 'amortized' && pr.upfrontFactor != null) {
    para(`Re-add: piece price ${money(pr.pieceAsQuotedGbp)} + up-front tooling ${whole(pr.upfrontGbp)} ÷ ${Math.round(pr.amortisationVolume).toLocaleString('en-GB')} parts × ${pr.upfrontFactor.toFixed(4)} (its overhead and margin) = ${money(m.total)} a part.`, 7, NAVY, 'bold');
  } else if (pr.mode === 'amortized') para(`Re-add: piece price ${money(pr.pieceAsQuotedGbp)} = ${money(m.total)} a part (all tooling is replacement or wear).`, 7, NAVY, 'bold');
  else if (pr.mode === 'one_time_nre') para(`Tooling ${whole(pr.upfrontGbp)} is charged once, outside the piece price; the piece price is the headline.`, 7, NAVY, 'bold');
  if (t.totalGbp > 0 && t.mode === 'amortized') {
    para(`Tooling over the programme ${whole(t.totalGbp)} = first sets and NRE ${whole(t.initialGbp)} + replacements ${whole(t.replacementGbp)} + perishables ${whole(t.perishableGbp)}`
      + `${t.unsplitGbp > 0.5 ? ` + not split ${whole(t.unsplitGbp)}` : ''}, ÷ ${Math.round(t.amortisationVolume).toLocaleString('en-GB')} parts = ${money(t.bucketPerPartGbp)} a part (bucket 4, before overhead and margin).`, 6.6, GREY);
  }
  if (pr.toolWearInMaterialGbp > 0) para(`Cutting-tool wear (inserts, drills and end mills worn in machining — a consumable, not a tool replacement set) ${money(pr.toolWearInMaterialGbp)} a part is costed in material (bucket 1), before overhead and margin — it is inside the piece price too.`, 6.6, GREY);

  // Page 1's visual summary (Part1 review phase 3): the part in brief beside the 8 buckets as a waterfall to the price.
  // Static vector shapes, every bar at its final value; every figure is the model's (`partSummary`, `waterfall`).
  {
    const gap = 6, leftW = 78, rightW = CW - leftW - gap;
    const rowH = 3.55, labW = 27;
    doc.setFontSize(6.3); doc.setFont('helvetica', 'normal');
    const sumRows = m.partSummary.rows.map(r => ({ ...r, lines: doc.splitTextToSize(r.value, leftW - labW) as string[] }));
    const sumH = 5 + sumRows.reduce((h, r) => h + Math.max(1, r.lines.length) * 2.9 + 0.75, 0);
    const wfH = 5 + m.waterfall.length * rowH + 1;
    const h = Math.max(sumH, wfH);
    chk(h + 3);
    const top = y;
    // left: the part
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.2); doc.setTextColor(...NAVY); doc.text('The part', MG, top + 3);
    doc.setDrawColor(...ACCENT); doc.setLineWidth(0.25); doc.line(MG, top + 4.2, MG + leftW, top + 4.2);
    let ry = top + 7.2;
    for (const r of sumRows) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...GREY); doc.text(r.label, MG, ry);
      doc.setFontSize(6.3); doc.setTextColor(...SLATE); doc.text(r.lines, MG + labW, ry);
      ry += Math.max(1, r.lines.length) * 2.9 + 0.75;
    }
    // right: the waterfall — each bar starts where the previous bucket ended; the last bar is the should-cost
    const x0 = MG + leftW + gap;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.2); doc.setTextColor(...NAVY); doc.text('Cost build-up to the price', x0, top + 3);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.6); doc.setTextColor(...GREY); doc.text('a part, the 8 buckets in order', x0 + rightW, top + 3, { align: 'right' });
    doc.setDrawColor(...ACCENT); doc.line(x0, top + 4.2, x0 + rightW, top + 4.2);
    const lab = 19, valW = 17, zx = x0 + lab, zw = rightW - lab - valW - 1;
    const scale = m.total > 0 ? zw / m.total : 0;
    let by = top + 6;
    let prevEnd: number | null = null;
    for (const b of m.waterfall) {
      doc.setFontSize(5.9); doc.setFont('helvetica', b.total ? 'bold' : 'normal'); doc.setTextColor(...(b.total ? NAVY : SLATE));
      doc.text(b.label, x0, by + rowH * 0.68);
      const bx = zx + b.startGbp * scale, bw = Math.max(b.gbp * scale, 0);
      if (prevEnd != null) { doc.setDrawColor(...GREY); doc.setLineWidth(0.12); doc.line(zx + prevEnd * scale, by - 0.4, zx + prevEnd * scale, by + 0.5); }
      if (bw >= 0.25) { doc.setFillColor(...(b.total ? NAVY : ACCENT)); doc.rect(bx, by + 0.5, bw, rowH - 1.1, 'F'); }
      else { doc.setDrawColor(...GREY); doc.setLineWidth(0.2); doc.line(bx, by + 0.5, bx, by + rowH - 0.6); }
      doc.setFont('helvetica', b.total ? 'bold' : 'normal'); doc.setTextColor(...(b.total ? NAVY : SLATE));
      doc.text(money(b.gbp), x0 + rightW, by + rowH * 0.68, { align: 'right' });
      prevEnd = b.total ? null : b.endGbp;
      by += rowH;
    }
    y = top + h + 2;
  }

  // Confidence and the unsourced share
  const c = m.confidence;
  const confCol: RGB = c.grade === 'High' ? GN : c.grade === 'Medium' ? AM : RD;
  head('Confidence', `grade ${c.grade}`);
  doc.setFontSize(7.3); doc.setFont('helvetica', 'bold'); doc.setTextColor(...confCol); doc.text(c.grade, MG, y + 2.5);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
  const cl = doc.splitTextToSize(`${c.sentence}.`, CW - 16) as string[];
  doc.text(cl, MG + 14, y + 2.5); y += 2.5 + cl.length * 3.1;
  if (c.gradeNote) para(c.gradeNote, 6.6, GREY, 'italic');
  if (c.lowInputs.length) {
    para(`Low inputs: ${c.lowInputs.slice(0, 5).map(l => `${l.label} ${unitValue(l.value, l.unit, money)}${l.operations > 1 ? ` (${l.operations} operations)` : ''}`).join('; ')}${c.lowInputs.length > 5 ? `; ${c.lowInputs.length - 5} more` : ''}.`, 7);
  }
  const u = m.unsourced;
  if (!u.ruleBasis) para('Not graded: this costing carries no rule values (it was not made from CAD), so the inputs typed or defaulted on the form are not labelled sourced or unsourced — confirm them against the audit pack\'s rate sources.', 7, AM, 'bold');
  else {
    para(`${money(u.totalGbp)} a part (${pct(u.sharePct)} of the price) rests on figures labelled "not sourced", "engineering-typical", "held" or ESTIMATE`
      + `${u.items.filter(i => i.gbp == null).length ? `, plus ${u.items.filter(i => i.gbp == null).length} such figure(s) that move the whole cost` : ''} — the largest are listed in section 4.`, 7.3, SLATE, 'bold');
    para(u.defaultsNote, 6.8, SLATE);
  }

  // Alerts
  for (const a of m.alerts) {
    const look: [RGB, RGB] = a.kind === 'route' || a.kind === 'costed' ? [ACCENT, [233, 240, 252]] : [RD, [252, 236, 236]];
    callout(a.title, a.lines, look[0], look[1]);
  }
  if (m.openQuestions.length) {
    head('Open questions', 'costed as stated until answered');
    bullets(m.openQuestions.slice(0, 5));
  }
  // The heading goes with its list (live run, 4 Nov 2026): it was drawn at the foot of page 1 and the list, checked only
  // after it, went to page 2 alone — the UK knuckle's core report ran to 8 pages. The heading and the list's first row
  // are checked together; a list that does not fit whole runs on, row by row, and section 2 then follows it on that page.
  let sec1RanOn = false;
  {
    const half = Math.ceil(m.notIncluded.length / 2);
    const cols = [m.notIncluded.slice(0, half), m.notIncluded.slice(half)];
    doc.setFontSize(6.9); doc.setFont('helvetica', 'normal');
    const colW = CW / 2 - 3;
    const wrapped = cols.map(col => col.map(s => doc.splitTextToSize(`•  ${s}`, colW) as string[]));
    const itemH = (l: string[]) => l.length * 3 + 0.6;
    const h = Math.max(...wrapped.map(col => col.reduce((s, l) => s + itemH(l), 0)));
    const rowsH = wrapped[0].map((l, k) => Math.max(itemH(l), wrapped[1][k] ? itemH(wrapped[1][k]) : 0));
    const startPage = doc.getNumberOfPages();
    chk(6.5 + Math.min(h, rowsH[0] ?? 0) + 2);   // the heading never sits at a page foot without its first row
    head('Not included until answered', 'not in this price — never costed here');
    doc.setFontSize(6.9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
    if (y + h + 2 <= BOTTOM) {
      wrapped.forEach((col, k) => { let cy = y + 2.5; for (const l of col) { doc.text(l, MG + k * (colW + 6), cy); cy += itemH(l); } });
      y += h + 2;
    } else {
      // row by row (the two columns side by side), running on to the next page where a row does not fit
      rowsH.forEach((rh, k) => {
        chk(rh + 2);
        doc.setFontSize(6.9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
        doc.text(wrapped[0][k], MG, y + 2.5);
        if (wrapped[1][k]) doc.text(wrapped[1][k], MG + colW + 6, y + 2.5);
        y += rh;
      });
      y += 2;
    }
    sec1RanOn = doc.getNumberOfPages() > startPage;
  }
  // Not in the cost model: its own block when it fits on this page; otherwise one compact paragraph under the list;
  // and when not even that fits, at the head of section 2 — never a page of its own (the China knuckle's page 2 held
  // only this block, making the core report 8 pages; live run, 3 Nov 2026).
  let notModelledDeferred: string | null = null;
  if (m.notModelled.length) {
    const lh = 6.9 * 0.43;
    doc.setFontSize(6.9); doc.setFont('helvetica', 'normal');
    const blockH = 6.5 + m.notModelled.reduce((s2, t2) => s2 + (doc.splitTextToSize(`•  ${t2}`, CW - 1) as string[]).length * lh + 1.2, 0);
    const compact = `Not in the cost model (a supplier will charge it — not a scope item to exclude): ${m.notModelled.join(' · ')}`;
    const compactH = (doc.splitTextToSize(compact, CW) as string[]).length * lh + 1.2;
    if (y + Math.max(blockH, 14) <= BOTTOM) {   // head() keeps 14 mm for itself and a first line
      head('Not in the cost model', 'a supplier will charge it — not a scope item to exclude');
      bullets(m.notModelled, 6.9, SLATE);
    } else if (y + compactH <= BOTTOM) para(compact, 6.9, SLATE);
    else notModelledDeferred = compact;
  }

  // ════════ 2. COST BUILD-UP ════════
  // Section 1 ran on to a new page: section 2 follows on that page rather than leaving it nearly empty.
  section(2, 'Cost build-up', 'the 8 buckets add to the price', sec1RanOn ? 60 : undefined);
  if (notModelledDeferred) para(`From section 1 — ${notModelledDeferred}`, 6.9, SLATE);
  table(['Bucket', 'A part', 'Share'],
    [...m.buckets.map(b => [b.metalGbp != null ? `${b.label} — of which ${b.metalWord ?? 'metal'} ${money(b.metalGbp)} (${pct(b.metalSharePct ?? 0)} of the price); the rest consumables, services and energy` : b.label,
      money(b.gbp), pct(b.sharePct)]), ['Should-cost', money(m.total), '100.0%']],
    { 0: { cellWidth: 120 }, 1: { cellWidth: 36, halign: 'right' }, 2: { cellWidth: 26, halign: 'right' } },
    { bold: r => r === m.buckets.length, fill: r => (r === m.buckets.length ? HDR : null) });
  head('Material (bucket 1) split', 'metal follows an index; consumables, services and energy do not');
  const grpName: Record<string, string> = { metal: 'Metal / material', direct: 'Material', consumable: 'Consumables & bought services', energy: 'Energy', boughtIn: 'Bought-in' };
  const mat = m.material;
  table(['Group', 'Line', 'A part'],
    [...mat.lines.map(l => [grpName[l.group], l.short ?? l.label, money(l.gbp)]),
      ['Totals', `metal ${money(mat.metalGbp)} · consumables & services ${money(mat.consumablesGbp)} · energy ${money(mat.energyGbp)}${mat.boughtInGbp > 0 ? ` · bought-in ${money(mat.boughtInGbp)}` : ''}`, money(mat.totalGbp)]],
    { 0: { cellWidth: 40, textColor: GREY }, 1: { cellWidth: 112 }, 2: { cellWidth: 30, halign: 'right' } },
    { fontSize: 6.8, bold: r => r === mat.lines.length, fill: r => (r === mat.lines.length ? HDR : null) });
  if (m.weights) para(m.weights.line, 6.8, GREY);
  const fm = m.formMachine;
  // ONE £/kg on this page (Part1 review phase 3): the price a kg as cast / as forged. The metal a kg and the metal price
  // a kg bought are in the audit pack (§3) and the workbook; the metal price is also section 5's first driver.
  if (fm) {
    const omf = fm.machiningGbp / Math.max(1e-9, fm.machiningDirectGbp);
    const closes = Math.abs(Math.round(fm.machiningDirectGbp * o.fx * 100) / 100 * Math.round(omf * 10_000) / 10_000 - Math.round(fm.machiningGbp * o.fx * 100) / 100) <= 0.005 * 1.0001;
    para(`${fm.form} ex-${fm.form === 'Casting' ? 'foundry' : 'forge'} ${money(fm.formGbp)} a part — ${money(fm.formPerKg)}/kg ${fm.kgLabel} (${fm.kg.toFixed(3)} kg) · machining ${money(fm.machiningGbp)} a part · together ${money(m.total)}. `
      + (closes
        ? `Each carries its overhead and margin: machining = its direct cost ${money(fm.machiningDirectGbp)} × ${omf.toFixed(4)} (overhead and margin) = ${money(fm.machiningGbp)}; `
        : `Each carries its overhead and margin: machining ${money(fm.machiningGbp)} is its direct cost ${money(fm.machiningDirectGbp)} with overhead and margin; `)
      + `the direct cost is ${fm.machiningParts.join(', ')}; the ${fm.form.toLowerCase()} is the rest (metal, melt / heating, forming, finishing, its tooling and packaging).`, 7.1, NAVY, 'bold');
  } else if (m.perKg) {
    para(`Per kg (${m.perKg.kgLabel}, ${m.perKg.kg.toFixed(3)} kg): the price ${money(m.perKg.pricePerKg)}/kg (should-cost ÷ kg).`, 7.1, NAVY, 'bold');
  }
  // The cost bridge (PKG-6): the buckets regrouped by what they pay for, raw material in to finished part out — the model's
  // rows (cost-bridge.ts), the same on the cost card, in the audit pack and in the workbook. The running total ends at the price.
  // money in text is 2 dp on the core (coreMoneyText): the metal line states its kg, its price a kg is in the audit pack
  const br = bridgePrintRows(m.bridge, money, 4, null);
  chk(30);   // the heading never sits alone at the foot of a page
  head('Cost bridge — raw material to finished part', 'the same figures as the buckets, by what they pay for');
  table(['Line', 'What it is', 'A part', 'Running total'],
    [...br.map(r => [r.label, r.detail || r.basis, money(r.gbp), money(r.cumulativeGbp)]), ['Should-cost', 'the rows re-added', money(m.bridge.reAddGbp), money(m.total)]],
    { 0: { cellWidth: 46 }, 1: { cellWidth: 92, textColor: GREY }, 2: { cellWidth: 21, halign: 'right' }, 3: { cellWidth: 23, halign: 'right' } },
    { fontSize: 6.3, bold: r => r === br.length, fill: r => (r === br.length ? HDR : null) });
  para(m.bridge.reconciles ? 'The rows re-add to the should-cost and, by bucket, to the eight buckets above (each row rounded to the penny; the running total is exact).'
    : bridgeReAddText(m.bridge, money), 6.4, m.bridge.reconciles ? GREY : RD);
  if (m.balance) {
    const bl = m.balance;
    chk(14 + bl.lines.length * 4.6);   // the balance on one page, its heading with it
    head(`Material balance — a good part (${bl.form === 'forged' ? 'forging' : 'casting'})`, 'input = finished + removed by machining + losses');
    const rows = balancePrintRows(bl);
    table(['Stage', 'Stream', 'kg', 'Treatment'], rows.map(l => [l.stage, l.label, l.kg, l.recovery]),
      { 0: { cellWidth: 24, textColor: GREY }, 1: { cellWidth: 84 }, 2: { cellWidth: 26, halign: 'right' }, 3: { cellWidth: 48, textColor: GREY } }, { fontSize: 6.3 });
    if (bl.stock) para(`${bl.stock.text} — ${bl.stock.partsNote}.`, 6.6, NAVY);
    para((bl.summary.creditedKg > 0.0005 ? `Credited ${bl.summary.creditedKg.toFixed(3)} kg, sold back at the scrap price a kg: ${money(bl.creditGbp)} (the bridge's scrap / return credit)`
      : 'No scrap credit: the costing sells nothing back (the melt loss is metal lost; gating, feeders and rejects are remelted)')
      + `${bl.closes != null ? `; the balance closes to ${(Math.abs(bl.closureKg ?? 0) * 1000).toFixed(1)} g` : ''}.`
      + `${bl.notItemised.length ? ` Not itemised by this costing: ${bl.notItemised.join('; ')}.` : ''}`, 6.4, GREY);
  }
  if (t.totalGbp > 0) {
    head('Tooling', t.mode === 'amortized' ? `over ${Math.round(t.amortisationVolume).toLocaleString('en-GB')} parts` : 'charged once, outside the piece price');
    table(['Item', 'Over the programme', 'First set / NRE', 'Replacements', 'Perishable', 'Split read from'],
      t.rows.map(r => [r.label, whole(r.gbp), r.unsplitGbp > 0 ? '—' : whole(r.initialGbp), r.unsplitGbp > 0 ? '—' : whole(r.replacementGbp), r.unsplitGbp > 0 ? '—' : whole(r.perishableGbp),
        r.basis === 'structured' ? 'the costing' : r.basis === 'as labelled' ? 'as labelled' : 'not itemised — not split']),
      { 0: { cellWidth: 70 }, 1: { cellWidth: 24, halign: 'right' }, 2: { cellWidth: 20, halign: 'right' }, 3: { cellWidth: 22, halign: 'right' }, 4: { cellWidth: 20, halign: 'right' }, 5: { cellWidth: 26, textColor: GREY } },
      { fontSize: 6.4 });
  }
  head('Commercial basis');
  table(['Item', 'Value', 'Source'], m.commercial.map(cm => [cm.label, cm.value, cm.source]),
    { 0: { cellWidth: 24, fontStyle: 'bold' }, 1: { cellWidth: 86 }, 2: { cellWidth: 72, textColor: GREY } }, { fontSize: 6.7 });

  // ════════ 3. PROCESS ════════
  section(3, 'Process', 'what was costed, on what, and what it needs');
  if (m.spec.length) {
    head('Specification costed to');
    table(['Question', 'Answer'], m.spec.map(s => [s.question, s.answer]), { 0: { cellWidth: 100 }, 1: { cellWidth: 82, fontStyle: 'bold' } }, { fontSize: 6.6 });
  }
  if (m.drawing) {
    // The attached drawing: what the engineer confirmed and the costing used, the conflicts, and what is specified but
    // not priced. The full table (every reading, with its place on the sheet) is in the audit pack and the workbook.
    const d = m.drawing;
    head('Drawing specification', `${d.usedCount} used in this costing`);
    para(d.summary, 6.6, GREY);
    const shown = d.rows.filter(r => r.used || r.status === 'Confirmed' || r.status === 'Corrected');
    if (shown.length) {
      table(['Parameter', 'Value', 'Read from', 'Status', 'Used in this costing'],
        shown.map(r => [r.parameter, r.value, r.source, r.status, r.decision ? `${r.decision}. ${r.usedText}` : r.usedText]),
        { 0: { cellWidth: 30, fontStyle: 'bold' }, 1: { cellWidth: 30 }, 2: { cellWidth: 44, textColor: GREY }, 3: { cellWidth: 17 }, 4: { cellWidth: 61 } }, { fontSize: 6.1 });
    } else para('No reading of the drawing was confirmed: the costing uses none of it (the 3D model and the answers given).', 6.8);
    if (d.conflicts.length) {
      table(['Conflict', 'Sources', 'Outcome'], d.conflicts.map(c => [c.parameter, c.sides, c.resolution]),
        { 0: { cellWidth: 36, fontStyle: 'bold' }, 1: { cellWidth: 76 }, 2: { cellWidth: 70 } }, { fontSize: 6.1, fill: r => (d.conflicts[r].open ? [254, 243, 199] : null) });
    }
    const rest = d.rows.length - shown.length;
    para([
      rest > 0 ? `${rest} other reading${rest === 1 ? ' was' : 's were'} not confirmed and not used.` : '',
      d.missing.length ? `Expected on the drawing and not found (nothing assumed): ${d.missing.map(x => x.parameter).join(', ')}.` : '',
      d.notCosted.length ? `Specified on the drawing — not in the cost model yet (${d.notCosted.length}): ${[...new Set(d.notCosted.map(n => n.parameter))].slice(0, 8).join(', ')}${new Set(d.notCosted.map(n => n.parameter)).size > 8 ? ' …' : ''}. None of these is priced.` : '',
    ].filter(Boolean).join(' '), 6.4, GREY, 'italic');
  }
  head('Operations', 'before overhead and margin');
  table(['Operation', 'Machine class', 'Cycle min', 'Parts / cycle', 'OEE', 'Crew charged', 'Machine / h', 'Labour / h', 'A part'],
    m.operations.map(op => [op.name, machineClassShort(op.machine), `${op.cycleMin.toFixed(2)}${op.bench ? ' (labour)' : ''}`,
      String(+op.partsPerCycle.toFixed(2)), op.oee == null ? '—' : `${+(op.oee * 100).toFixed(1)}%`, String(+op.crewCharged.toFixed(2)),
      op.machinePerHr == null ? '—' : money(op.machinePerHr), money(op.labourPerHr), money(op.gbp)]),
    { 0: { cellWidth: 44 }, 1: { cellWidth: 34, textColor: GREY }, 2: { cellWidth: 14, halign: 'right' }, 3: { cellWidth: 12, halign: 'right' }, 4: { cellWidth: 11, halign: 'right' },
      5: { cellWidth: 13, halign: 'right' }, 6: { cellWidth: 18, halign: 'right' }, 7: { cellWidth: 18, halign: 'right' }, 8: { cellWidth: 18, halign: 'right', fontStyle: 'bold' } }, { fontSize: 6.2 });
  {
    const effs = [...new Set(m.operations.map(op => +op.labourEfficiency.toFixed(3)))];
    para(`A part = cycle ÷ 60 ÷ parts a cycle × (machine £/h ÷ OEE + labour £/h). Labour £/h = the labour rate × the crew charged ÷ labour efficiency `
      + `(${effs.length === 1 ? `${+(effs[0] * 100).toFixed(1)} %` : 'per operation, in the audit pack'}); the crew charged is the crew × labour time ÷ cycle (an untended station charges none).`, 6.3, GREY, 'italic');
  }
  if (m.capacity && m.capacity.rows.length) {
    head('Capacity implied at this volume');
    table(['Machine', 'Operations', 'Hours a year', 'Available h / machine', 'Machines'],
      m.capacity.rows.map(r => [r.machine, String(r.operations), Math.round(r.hoursPerYear).toLocaleString('en-GB'), r.availableHours.toLocaleString('en-GB'), r.machines.toFixed(1)]),
      { 0: { cellWidth: 80 }, 1: { cellWidth: 20, halign: 'right' }, 2: { cellWidth: 28, halign: 'right' }, 3: { cellWidth: 32, halign: 'right' }, 4: { cellWidth: 22, halign: 'right', fontStyle: 'bold' } },
      { fontSize: 6.6, fill: r => (m.capacity!.rows[r].machines > 5 || (m.capacity!.rows[r].line && m.capacity!.rows[r].machines > 1) ? [254, 243, 199] : null) });
    para(`Formula: ${m.capacity.formula}.`, 6.4, GREY, 'italic');
    for (const w of m.capacity.warnings) para(`Warning — ${w}`, 6.8, AM, 'bold');
  }
  // The key process parameters are the rows of the negotiation table (section 5), each with our value and the question
  // to ask — printed once (fresh review §5: the two tables repeated the same rows).
  if (m.keyParams.length) para('The key process parameters — the values the rules set — are in section 5 with the question to put to the supplier; their bases are in section 4 and the audit pack.', 6.4, GREY, 'italic');

  // ════════ 4. WHAT MOVES THE PRICE ════════
  section(4, 'What moves the price', 'unsourced figures, sensitivity, volume');
  head('Figures labelled "not sourced", "engineering-typical", "held" or ESTIMATE', u.ruleBasis ? `${money(u.totalGbp)} a part counted once (${pct(u.sharePct)} of the price)` : 'not graded: no rule values on this costing');
  const TOP_UNSOURCED = 8;
  if (u.items.length) {
    const shown = u.items.slice(0, TOP_UNSOURCED);
    table(['Figure', 'Costed', 'A part', 'Basis — how to close it'],
      [...shown.map(i => [i.label, i.value, i.gbp == null ? 'moves the whole cost' : money(i.gbp), i.basis]),
        ['Total, each cost line counted once', '', money(u.totalGbp), `${pct(u.sharePct)} of the price, before overhead and margin${u.items.length > TOP_UNSOURCED ? ` — ${u.items.length - TOP_UNSOURCED} smaller or whole-cost figure(s) are in the audit pack` : ''}`]],
      { 0: { cellWidth: 36, fontStyle: 'bold' }, 1: { cellWidth: 24 }, 2: { cellWidth: 20, halign: 'right' }, 3: { cellWidth: 102, textColor: GREY } },
      { fontSize: 5.9, bold: r => r === shown.length, fill: r => (r === shown.length ? HDR : null) });
  } else para('No value in this costing is labelled "not sourced" or "engineering-typical" (or the costing carries no rule values).', 7, GREY);
  if (u.ruleBasis) para(u.defaultsNote, 6.4, SLATE);
  para(`Method: ${u.method}`, 6, GREY, 'italic');
  if (m.sensitivity.length) {
    head('Top movers', `each input ± ${m.sensitivityPct}% and the cost re-run${m.sensitivityDropped ? ' — inputs moving < 0.5 % or with a zero base left out' : ''}`);
    table(['Input', 'Base', `-${m.sensitivityPct}%`, `+${m.sensitivityPct}%`],
      m.sensitivity.map(s => [s.label, unitValue(s.base, s.unit, money), `${signed(s.minusGbp)} (${pct(s.minusGbp / m.total * 100)})`, `${signed(s.plusGbp)} (${pct(s.plusGbp / m.total * 100)})`]),
      { 0: { cellWidth: 90 }, 1: { cellWidth: 32, halign: 'right' }, 2: { cellWidth: 30, halign: 'right' }, 3: { cellWidth: 30, halign: 'right' } });
  }
  if (m.volumeLine) {
    head('Volume');
    para(`This route re-costed at each volume (tooling, batches and cavitation follow it): ${m.volumeLine}.`, 7);
  } else if (m.routesNote) para(m.routesNote, 6.8, GREY, 'italic');

  // ════════ 5. SUPPLIER NEGOTIATION ════════
  section(5, 'Supplier negotiation', 'our value and the question to ask');
  table(['Driver', 'Our value', 'Question to ask'], m.negotiation.map(n => [n.driver, n.ours, n.question]),
    { 0: { cellWidth: 44, fontStyle: 'bold' }, 1: { cellWidth: 70 }, 2: { cellWidth: 68 } }, { fontSize: 6.5 });
  head('Ask the supplier to break the quotation down into');
  bullets(m.quoteBreakdown, 7);
  head('Re-costed levers', m.levers.length ? 'each one a stack re-run; levers overlap, so they are not added' : 'none could be re-costed');
  if (m.levers.length) {
    table(['Lever', 'Re-costed on', 'Saves a part'], m.levers.map(l => [l.action, l.basis, `${money(l.savingGbp)} (${l.savingPct.toFixed(1)}%)`]),
      { 0: { cellWidth: 60, fontStyle: 'bold' }, 1: { cellWidth: 88, textColor: GREY }, 2: { cellWidth: 34, halign: 'right', textColor: GN, fontStyle: 'bold' } }, { fontSize: 6.6 });
  } else para('No physically-defined lever could be re-costed for this part.', 7, GREY);

  // ════════ 6. ALTERNATIVES ════════
  section(6, 'Alternatives', 'other routes in the same material, and other countries');
  if (m.routes) head('Route Comparison', `reference: ${m.routes.reference} (this costing)`);
  if (m.routes) {
    if (m.routes.rows.length) {
      table(['Route · process', 'A part', 'vs this costing', 'Band (P10–P90)', 'Up-front tooling'],
        m.routes.rows.map(r => [r.name + (r.note ? `\n${r.note}` : ''), money(r.total), `${signed(r.deltaGbp)} (${r.deltaPct > 0 ? '+' : ''}${r.deltaPct.toFixed(0)}%)`,
          r.band ? `${money(r.band.p10)} – ${money(r.band.p90)}` : '—', r.toolingGbp != null ? whole(r.toolingGbp) : '—']),
        { 0: { cellWidth: 74 }, 1: { cellWidth: 22, halign: 'right', fontStyle: 'bold' }, 2: { cellWidth: 30, halign: 'right' }, 3: { cellWidth: 34, halign: 'right' }, 4: { cellWidth: 22, halign: 'right' } },
        { fontSize: 6.4, fill: r => (m.routes!.rows[r].deltaPct <= -20 ? [220, 252, 231] : null) });
    } else para('No other feasible route is cheaper or within 50 % of this costing.', 7);
    para(`Shown: feasible routes cheaper than this costing or within +50 %; up-front tooling is the first set (as page 1), the programme total is in the audit pack. ${m.routes.notShown} other route(s) or process(es) are not feasible, need an answer, or cost more than +50 % — listed in the audit pack.`, 6.4, GREY, 'italic');
  } else if (m.routesNote) para(m.routesNote, 7, GREY, 'italic');
  if (m.countries.rows.length) {
    head('Countries', 'the part costed in each country');
    const base = m.countries.rows.find(r => r.isBase)?.name ?? 'base';
    table(['Country', 'A part', `vs ${base}`], m.countries.rows.map(r => [`${r.name}${r.approx ? ' †' : ''}`, money(r.total), r.isBase ? 'base' : `${r.vsBasePct >= 0 ? '-' : '+'}${Math.abs(r.vsBasePct).toFixed(0)}%`]),
      { 0: { cellWidth: 100 }, 1: { cellWidth: 42, halign: 'right' }, 2: { cellWidth: 40, halign: 'right' } },
      { fontSize: 6.6, fill: r => (m.countries.rows[r].isBase ? HDR : null) });
    para(`${m.countries.basis} ${m.countries.note}${m.countries.rows.some(r => r.approx) ? ' † re-prices this costing\'s operations in that country\'s book (an approximation; the audit pack says what is carried).' : ''}`, 6.4, GREY, 'italic');
  }

  // ════════ 7. DESIGN TO COST ════════
  // With nothing to list (the check pending or not run), section 7 follows on the same page — no page-7 hole.
  section(7, 'Design to cost', 'findings that apply to the costed process; sign-off', m.dfm.findings.length === 0 ? 110 : undefined);
  head('Geometric DFM', m.dfm.status === 'ran' ? `${m.dfm.findings.length} shown of ${m.dfm.considered} rule group(s)` : m.dfm.status === 'pending' ? 'DFM pending' : m.dfm.status);
  if (m.dfm.findings.length) {
    table(['Finding', 'Severity', 'In this costing', 'Fix'],
      m.dfm.findings.map(f => [`${f.title}${f.count > 1 ? ` (${f.count})` : ''}`, f.severity, f.amount ?? 'not re-costed', f.fix]),
      { 0: { cellWidth: 52, fontStyle: 'bold' }, 1: { cellWidth: 18 }, 2: { cellWidth: 30 }, 3: { cellWidth: 82, textColor: GREY } }, { fontSize: 6.2,
        fill: r => (m.dfm.findings[r].severity === 'BLOCKING' ? [252, 236, 236] : null) });
  } else if (m.dfm.status === 'ran') para('No finding that applies to the costed process is blocking, priced or a risk (informational findings are in the audit pack).', 7);
  para(m.dfm.notChecked, 6.8, GREY);
  head('Reproducibility');
  para(m.stamp ? `Reproducibility: ${m.stamp}` : 'Reproducibility: not a CAD costing — the rate book and the inputs on the costing form', 7.3, NAVY, 'bold');
  para('Every figure in this report is in the audit pack and the workbook: rule bases, rate build-ups, traceability, the full DFM with faces and sources, the independent re-adds and the uncertainty method.', 6.6, GREY);
  head('Sign-off');
  chk(30);
  const roles = ['Prepared by', 'Reviewed by', 'Approved by'];
  const bw = (CW - 8) / 3;
  roles.forEach((r, i) => {
    const x = MG + i * (bw + 4);
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); doc.text(r, x, y + 3);
    doc.setDrawColor(...GREY); doc.setLineWidth(0.2);
    doc.line(x, y + 12, x + bw, y + 12); doc.line(x, y + 21, x + bw, y + 21);
    doc.setFontSize(5.8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY);
    doc.text('Name and signature', x, y + 14.5); doc.text('Date', x, y + 23.5);
  });
  y += 27;
}

/** A machine class as the operations table prints it: the class, without the size / configuration detail after " — ". */
function machineClassShort(name: string): string {
  return name.split(' — ')[0].replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/** A value with its unit, money converted ("£27.95/hr", "0.62 min", "9.084 kg") — money to 2 dp in the core (phase 3). */
function unitValue(v: number, unit: string, money: (n: number) => string): string {
  if (unit.includes('£')) return `${money(v)}${unit.replace('£', '')}`;
  if (unit === 'hr') return `${(v * 60).toFixed(2)} min`;
  if (unit === '%') return `${+v.toFixed(2)}%`;
  return `${+v.toFixed(4)}${unit ? ` ${unit}` : ''}`;
}
