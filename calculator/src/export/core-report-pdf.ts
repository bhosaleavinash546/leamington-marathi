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
  const money4 = (gbp: number) => `${o.sym}${(gbp * o.fx).toLocaleString('en-GB', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
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
    ['OF WHICH TOOL REPLACEMENT & WEAR', pr.mode === 'amortized' ? `${money(pr.runningPerPartGbp)} a part` : 'none',
      'replacement sets and perishable tools, with their overhead and margin — inside the piece price'],
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
  if (pr.toolWearInMaterialGbp > 0) para(`Cutting-tool wear ${money(pr.toolWearInMaterialGbp)} a part is costed as a consumable in material (bucket 1), where the costing puts it — it is inside the piece price too.`, 6.6, GREY);

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
    para(`Low inputs: ${c.lowInputs.slice(0, 5).map(l => `${l.label} ${unitValue(l.value, l.unit, money, money4)}${l.operations > 1 ? ` (${l.operations} operations)` : ''}`).join('; ')}${c.lowInputs.length > 5 ? `; ${c.lowInputs.length - 5} more` : ''}.`, 7);
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
    const look: [RGB, RGB] = a.kind === 'route' ? [ACCENT, [233, 240, 252]] : [RD, [252, 236, 236]];
    callout(a.title, a.lines, look[0], look[1]);
  }
  if (m.openQuestions.length) {
    head('Open questions', 'costed as stated until answered');
    bullets(m.openQuestions.slice(0, 5));
  }
  head('Not included until answered', 'not in this price — never costed here');
  {
    const half = Math.ceil(m.notIncluded.length / 2);
    const cols = [m.notIncluded.slice(0, half), m.notIncluded.slice(half)];
    doc.setFontSize(6.9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
    const colW = CW / 2 - 3;
    const wrapped = cols.map(col => col.map(s => doc.splitTextToSize(`•  ${s}`, colW) as string[]));
    const h = Math.max(...wrapped.map(col => col.reduce((s, l) => s + l.length * 3 + 0.6, 0)));
    chk(h + 2);
    wrapped.forEach((col, k) => { let cy = y + 2.5; for (const l of col) { doc.text(l, MG + k * (colW + 6), cy); cy += l.length * 3 + 0.6; } });
    y += h + 2;
  }
  if (m.notModelled.length) {
    head('Not in the cost model', 'a supplier will charge it — not a scope item to exclude');
    bullets(m.notModelled, 6.9, SLATE);
  }

  // ════════ 2. COST BUILD-UP ════════
  section(2, 'Cost build-up', 'the 8 buckets add to the price');
  table(['Bucket', 'A part', 'Share'],
    [...m.buckets.map(b => [b.label, money(b.gbp), pct(b.sharePct)]), ['Should-cost', money(m.total), '100.0%']],
    { 0: { cellWidth: 120 }, 1: { cellWidth: 36, halign: 'right' }, 2: { cellWidth: 26, halign: 'right' } },
    { bold: r => r === m.buckets.length, fill: r => (r === m.buckets.length ? HDR : null) });
  head('Material (bucket 1) split', 'metal follows an index; consumables, services and energy do not');
  const grpName: Record<string, string> = { metal: 'Metal / material', direct: 'Material', consumable: 'Consumables & bought services', energy: 'Energy', boughtIn: 'Bought-in' };
  const mat = m.material;
  table(['Group', 'Line', 'A part'],
    [...mat.lines.map(l => [grpName[l.group], l.label, money(l.gbp)]),
      ['Totals', `metal ${money(mat.metalGbp)} · consumables & services ${money(mat.consumablesGbp)} · energy ${money(mat.energyGbp)}${mat.boughtInGbp > 0 ? ` · bought-in ${money(mat.boughtInGbp)}` : ''}`, money(mat.totalGbp)]],
    { 0: { cellWidth: 40, textColor: GREY }, 1: { cellWidth: 112 }, 2: { cellWidth: 30, halign: 'right' } },
    { fontSize: 6.8, bold: r => r === mat.lines.length, fill: r => (r === mat.lines.length ? HDR : null) });
  const fm = m.formMachine;
  if (fm) {
    para(`${fm.form} ex-${fm.form === 'Casting' ? 'foundry' : 'forge'} ${money(fm.formGbp)} a part — ${money4(fm.formPerKg)}/kg ${fm.kgLabel} (${fm.kg.toFixed(3)} kg) · machining ${money(fm.machiningGbp)} a part · together ${money(m.total)}. `
      + `Each carries its overhead and margin: machining = (${fm.machiningParts.join(' + ')}) ${money(fm.machiningDirectGbp)} × ${(fm.machiningGbp / Math.max(1e-9, fm.machiningDirectGbp)).toFixed(4)} (overhead and margin); the ${fm.form.toLowerCase()} is the rest (metal, melt / heating, forming, finishing, its tooling and packaging).`, 7.1, NAVY, 'bold');
    if (m.perKg) para(`The metal ${money4(m.perKg.metalPerKg)}/kg ${m.perKg.kgLabel} (metal line ÷ kg).`, 6.8, GREY);
  } else if (m.perKg) {
    para(`Per kg (${m.perKg.kgLabel}, ${m.perKg.kg.toFixed(3)} kg): the price ${money4(m.perKg.pricePerKg)}/kg (should-cost ÷ kg); the metal ${money4(m.perKg.metalPerKg)}/kg (metal line ÷ kg).`, 7.1, NAVY, 'bold');
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
      m.sensitivity.map(s => [s.label, unitValue(s.base, s.unit, money, money4), `${signed(s.minusGbp)} (${pct(s.minusGbp / m.total * 100)})`, `${signed(s.plusGbp)} (${pct(s.plusGbp / m.total * 100)})`]),
      { 0: { cellWidth: 90 }, 1: { cellWidth: 32, halign: 'right' }, 2: { cellWidth: 30, halign: 'right' }, 3: { cellWidth: 30, halign: 'right' } });
  }
  head('Volume');
  para(m.volumeLine ? `This route re-costed at each volume (tooling, batches and cavitation follow it): ${m.volumeLine}.` : 'The volume ladder was not run for this costing (no route comparison).', 7);

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
  head('Route Comparison', m.routes ? `reference: ${m.routes.reference} (this costing)` : 'not run on this costing');
  if (m.routes) {
    if (m.routes.rows.length) {
      table(['Route · process', 'A part', 'vs this costing', 'Band (P10–P90)', 'Up-front tooling'],
        m.routes.rows.map(r => [r.name + (r.note ? `\n${r.note}` : ''), money(r.total), `${signed(r.deltaGbp)} (${r.deltaPct > 0 ? '+' : ''}${r.deltaPct.toFixed(0)}%)`,
          r.band ? `${money(r.band.p10)} – ${money(r.band.p90)}` : '—', r.toolingGbp != null ? whole(r.toolingGbp) : '—']),
        { 0: { cellWidth: 74 }, 1: { cellWidth: 22, halign: 'right', fontStyle: 'bold' }, 2: { cellWidth: 30, halign: 'right' }, 3: { cellWidth: 34, halign: 'right' }, 4: { cellWidth: 22, halign: 'right' } },
        { fontSize: 6.4, fill: r => (m.routes!.rows[r].deltaPct <= -20 ? [220, 252, 231] : null) });
    } else para('No other feasible route is cheaper or within 50 % of this costing.', 7);
    para(`Shown: feasible routes cheaper than this costing or within +50 %; up-front tooling is the first set (as page 1), the programme total is in the audit pack. ${m.routes.notShown} other route(s) or process(es) are not feasible, need an answer, or cost more than +50 % — listed in the audit pack.`, 6.4, GREY, 'italic');
  } else para('Run "Compare routes" on the CAD screen to see the other routes that can make this part.', 7, GREY);
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

/** A value with its unit, money converted ("£27.95/hr", "0.62 min", "9.084 kg"). */
function unitValue(v: number, unit: string, money: (n: number) => string, money4: (n: number) => string): string {
  if (unit.includes('£')) return `${Math.abs(v) < 1 ? money4(v) : money(v)}${unit.replace('£', '')}`;
  if (unit === 'hr') return `${(v * 60).toFixed(2)} min`;
  if (unit === '%') return `${+v.toFixed(2)}%`;
  return `${+v.toFixed(4)}${unit ? ` ${unit}` : ''}`;
}
