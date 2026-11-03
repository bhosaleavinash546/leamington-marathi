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
import { localiseRuleValue } from './money-text.js';

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
  const section = (n: number, title: string, sub?: string) => {
    if (n > 1) { doc.addPage(); y = 16; }
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
  const rv = (label: string, value: string) => localiseRuleValue(label, value, o.fx, o.sym);

  const pct = (n: number) => `${n.toFixed(1)}%`;

  // ════════ 1. DECISION ════════
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...NAVY);
  doc.text('Should-Cost Report', MG, y + 4);
  doc.setFontSize(10.5); doc.text(m.part.length > 70 ? `${m.part.slice(0, 68)}…` : m.part, MG, y + 10.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GREY);
  doc.text(`${m.commodity ?? 'Costing'}  ·  ${m.country}  ·  ${o.dateStr}${o.currency !== 'GBP' ? `  ·  ${o.currency} (1 GBP = ${o.fx.toFixed(4)} ${o.currency})` : ''}`, MG, y + 15.5);
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
  y = Math.max(y + 19, imgBottom + 3);
  doc.setFillColor(...ACCENT); doc.rect(MG, y, CW, 0.5, 'F'); y += 3;
  section(1, 'Decision', 'what it costs, what it rests on, what is not in it');

  // Headline
  const boxH = 26;
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

  // Price structure: piece excl. tooling · initial tooling · replacement a part
  const t = m.tooling;
  const tiles: Array<[string, string, string]> = [
    ['PIECE PRICE EXCLUDING TOOLING', money(m.pieceExToolingGbp), 'the costing re-run with no tooling (its overhead and margin out too)'],
    ['INITIAL TOOLING INVESTMENT', t.totalGbp <= 0 ? 'none' : t.initialGbp > 0.5 ? whole(t.initialGbp) : 'not split',
      t.totalGbp <= 0 ? 'no tooling in this costing' : t.unsplitGbp > 0.5 ? `${whole(t.unsplitGbp)} of tooling is one figure, not split into sets` : 'the first set of each tool (a lump sum)'],
    t.mode === 'amortized' && t.unsplitGbp > 0.5 && t.replacementGbp + t.perishableGbp <= 0.5
      ? ['REPLACEMENT & PERISHABLE TOOLING', 'not split', `the whole tooling bucket is ${money(t.bucketPerPartGbp)} a part`]
      : ['REPLACEMENT & PERISHABLE TOOLING', t.mode === 'amortized' ? `${money(t.replacementPerPartGbp)} a part` : 'none', 'the rest of the tooling bucket, before overhead and margin'],
  ];
  const tw = (CW - 4) / 3;
  tiles.forEach(([lbl, val, note], i) => {
    const x = MG + i * (tw + 2);
    doc.setDrawColor(...HDR); doc.setLineWidth(0.4); doc.roundedRect(x, y, tw, 17, 1.2, 1.2, 'S');
    doc.setFontSize(6); doc.setTextColor(...GREY); doc.text(lbl, x + 2.5, y + 4.2);
    doc.setFontSize(10.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); doc.text(val, x + 2.5, y + 9.5);
    doc.setFontSize(5.8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY); doc.text(doc.splitTextToSize(note, tw - 5) as string[], x + 2.5, y + 12.6);
  });
  y += 20;
  if (t.totalGbp > 0 && t.mode === 'amortized') {
    para(`Tooling over the programme ${whole(t.totalGbp)} = first sets ${whole(t.initialGbp)} + replacements ${whole(t.replacementGbp)} + perishables ${whole(t.perishableGbp)}`
      + `${t.unsplitGbp > 0.5 ? ` + not split ${whole(t.unsplitGbp)}` : ''}, ÷ ${Math.round(t.amortisationVolume).toLocaleString('en-GB')} parts = ${money(t.bucketPerPartGbp)} a part (bucket 4).`, 6.8, GREY);
  }

  // Confidence and the unsourced share
  const c = m.confidence;
  const confCol: RGB = c.grade === 'High' ? GN : c.grade === 'Medium' ? AM : RD;
  head('Confidence', `grade ${c.grade}`);
  doc.setFontSize(7.3); doc.setFont('helvetica', 'bold'); doc.setTextColor(...confCol); doc.text(c.grade, MG, y + 2.5);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
  doc.text(doc.splitTextToSize(`${c.sentence}.`, CW - 16) as string[], MG + 14, y + 2.5); y += 5.5;
  if (c.lowInputs.length) {
    para(`Low inputs: ${c.lowInputs.slice(0, 5).map(l => `${l.label} ${unitValue(l.value, l.unit, money, money4)}${l.operations > 1 ? ` (${l.operations} operations)` : ''}`).join('; ')}${c.lowInputs.length > 5 ? `; ${c.lowInputs.length - 5} more` : ''}.`, 7);
  }
  const u = m.unsourced;
  if (!u.ruleBasis) para('Not graded: this costing carries no rule values (it was not made from CAD), so the inputs typed or defaulted on the form are not labelled sourced or unsourced — confirm them against the audit pack\'s rate sources.', 7, AM, 'bold');
  else para(`${money(u.totalGbp)} a part (${pct(u.sharePct)} of the price) rests on figures labelled "not sourced" or "engineering-typical"`
    + `${u.items.filter(i => i.gbp == null).length ? `, plus ${u.items.filter(i => i.gbp == null).length} such figure(s) whose cost cannot be attributed` : ''} — each is listed with its cost a part in section 4.`, 7.3, SLATE, 'bold');
  if (u.ruleBasis) para(`Method: ${u.method}`, 6.4, GREY, 'italic');

  // Alerts
  for (const a of m.alerts) callout(a.title, a.lines, a.kind === 'route' ? ACCENT : RD, a.kind === 'route' ? [233, 240, 252] : [252, 236, 236]);
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
  if (m.perKg) {
    para(`Per kg (${m.perKg.kgLabel}, ${m.perKg.kg.toFixed(3)} kg): the price ${money4(m.perKg.pricePerKg)}/kg (should-cost ÷ kg); the metal ${money4(m.perKg.metalPerKg)}/kg (metal line ÷ kg).`
      + `${m.commodityId === 'cast_and_machine' ? ' The price per kg includes the machining.' : ''}`, 7.1, NAVY, 'bold');
  }
  if (t.totalGbp > 0) {
    head('Tooling', t.mode === 'amortized' ? `over ${Math.round(t.amortisationVolume).toLocaleString('en-GB')} parts` : 'charged once, outside the piece price');
    table(['Item', 'Over the programme', 'First set', 'Replacements', 'Perishable', 'Split read from'],
      t.rows.map(r => [r.label, whole(r.gbp), r.unsplitGbp > 0 ? '—' : whole(r.initialGbp), r.unsplitGbp > 0 ? '—' : whole(r.replacementGbp), r.unsplitGbp > 0 ? '—' : whole(r.perishableGbp),
        r.basis === 'structured' ? 'the costing' : r.basis === 'as labelled' ? 'as labelled' : 'not itemised — not split']),
      { 0: { cellWidth: 70 }, 1: { cellWidth: 24, halign: 'right' }, 2: { cellWidth: 20, halign: 'right' }, 3: { cellWidth: 22, halign: 'right' }, 4: { cellWidth: 20, halign: 'right' }, 5: { cellWidth: 26, textColor: GREY } },
      { fontSize: 6.6 });
  }
  head('Commercial basis');
  table(['Item', 'Value', 'Source'], m.commercial.map(cm => [cm.label, cm.value, cm.source]),
    { 0: { cellWidth: 24, fontStyle: 'bold' }, 1: { cellWidth: 86 }, 2: { cellWidth: 72, textColor: GREY } }, { fontSize: 6.7 });

  // ════════ 3. PROCESS ════════
  section(3, 'Process', 'what was costed, on what, and what it needs');
  if (m.spec.length) {
    head('Specification costed to');
    table(['Question', 'Answer'], m.spec.map(s => [s.question, s.answer]), { 0: { cellWidth: 110 }, 1: { cellWidth: 72, fontStyle: 'bold' } }, { fontSize: 6.6 });
  }
  head('Operations', 'machine + crew £/h = machine rate + labour rate × crew (before overhead and margin)');
  table(['Operation', 'Machine class', 'Cycle min', 'Parts / cycle', 'Crew', 'Machine + crew / h', 'A part'],
    m.operations.map(op => [op.name.length > 60 ? `${op.name.slice(0, 58)}…` : op.name, machineClassShort(op.machine), `${op.cycleMin.toFixed(2)}${op.bench ? ' (labour)' : ''}`,
      String(+op.partsPerCycle.toFixed(2)), String(+op.crew.toFixed(2)), money(op.ratePerHr), money(op.gbp)]),
    { 0: { cellWidth: 52 }, 1: { cellWidth: 46, textColor: GREY }, 2: { cellWidth: 16, halign: 'right' }, 3: { cellWidth: 14, halign: 'right' }, 4: { cellWidth: 12, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' }, 6: { cellWidth: 20, halign: 'right', fontStyle: 'bold' } }, { fontSize: 6.4 });
  if (m.capacity && m.capacity.rows.length) {
    head('Capacity implied at this volume');
    table(['Machine', 'Operations', 'Hours a year', 'Available h / machine', 'Machines'],
      m.capacity.rows.map(r => [r.machine, String(r.operations), Math.round(r.hoursPerYear).toLocaleString('en-GB'), r.availableHours.toLocaleString('en-GB'), r.machines.toFixed(1)]),
      { 0: { cellWidth: 80 }, 1: { cellWidth: 20, halign: 'right' }, 2: { cellWidth: 28, halign: 'right' }, 3: { cellWidth: 32, halign: 'right' }, 4: { cellWidth: 22, halign: 'right', fontStyle: 'bold' } }, { fontSize: 6.6 });
    para(`Formula: ${m.capacity.formula}.`, 6.4, GREY, 'italic');
  }
  if (m.keyParams.length) {
    // Two parameters a row (name, the value with its form label) — the bases are in section 4 (the unsourced ones) and the
    // audit pack's rule bases; the questions are in section 5.
    head('Key process parameters', 'the values the rules set — bases in section 4 and the audit pack');
    const cell = (p: CoreReport['keyParams'][number] | undefined) => { if (!p) return ['', '']; const v = rv(p.label, p.value); return [p.name, `${v.value}  (${v.label})`]; };
    const pairs: string[][] = [];
    for (let i = 0; i < m.keyParams.length; i += 2) pairs.push([...cell(m.keyParams[i]), ...cell(m.keyParams[i + 1])]);
    table(['Parameter', 'Costed', 'Parameter', 'Costed'], pairs,
      { 0: { cellWidth: 38, fontStyle: 'bold' }, 1: { cellWidth: 53 }, 2: { cellWidth: 38, fontStyle: 'bold' }, 3: { cellWidth: 53 } }, { fontSize: 6.2 });
  }

  // ════════ 4. WHAT MOVES THE PRICE ════════
  section(4, 'What moves the price', 'unsourced figures, sensitivity, volume');
  head('Figures labelled "not sourced" or "engineering-typical"', u.ruleBasis ? `${money(u.totalGbp)} a part counted once (${pct(u.sharePct)} of the price)` : 'not graded: no rule values on this costing');
  if (u.items.length) {
    table(['Figure', 'Costed', 'A part', 'Basis — how to close it'],
      u.items.slice(0, 18).map(i => { const v = rv(i.label, i.value); return [i.label, v.value, i.gbp == null ? 'not attributable' : money(i.gbp), i.basis]; }),
      { 0: { cellWidth: 40, fontStyle: 'bold' }, 1: { cellWidth: 22 }, 2: { cellWidth: 22, halign: 'right' }, 3: { cellWidth: 98, textColor: GREY } }, { fontSize: 6.2 });
    if (u.items.length > 18) para(`${u.items.length - 18} more are listed in the audit pack.`, 6.4, GREY, 'italic');
  } else para('No value in this costing is labelled "not sourced" or "engineering-typical" (or the costing carries no rule values).', 7, GREY);
  para(`Method: ${u.method}`, 6.2, GREY, 'italic');
  if (m.sensitivity.length) {
    head('Top five movers', `each input ± ${m.sensitivityPct}% and the cost re-run`);
    table(['Input', 'Base', `-${m.sensitivityPct}%`, `+${m.sensitivityPct}%`],
      m.sensitivity.map(s => [s.label, unitValue(s.base, s.unit, money, money4), signed(s.minusGbp), signed(s.plusGbp)]),
      { 0: { cellWidth: 100 }, 1: { cellWidth: 34, halign: 'right' }, 2: { cellWidth: 24, halign: 'right' }, 3: { cellWidth: 24, halign: 'right' } });
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
      table(['Route · process', 'A part', 'vs this costing', 'Band (P10–P90)', 'Tooling invest.'],
        m.routes.rows.map(r => [r.name + (r.note ? `\n${r.note}` : ''), money(r.total), `${signed(r.deltaGbp)} (${r.deltaPct > 0 ? '+' : ''}${r.deltaPct.toFixed(0)}%)`,
          r.band ? `${money(r.band.p10)} – ${money(r.band.p90)}` : '—', r.toolingGbp != null ? whole(r.toolingGbp) : '—']),
        { 0: { cellWidth: 74 }, 1: { cellWidth: 22, halign: 'right', fontStyle: 'bold' }, 2: { cellWidth: 30, halign: 'right' }, 3: { cellWidth: 34, halign: 'right' }, 4: { cellWidth: 22, halign: 'right' } },
        { fontSize: 6.4, fill: r => (m.routes!.rows[r].deltaPct <= -20 ? [220, 252, 231] : null) });
    } else para('No other feasible route is cheaper or within 50 % of this costing.', 7);
    para(`Shown: feasible routes cheaper than this costing or within +50 %. ${m.routes.notShown} other route(s) or process(es) are not feasible, need an answer, or cost more than +50 % — listed in the audit pack.`, 6.4, GREY, 'italic');
  } else para('Run "Compare routes" on the CAD screen to see the other routes that can make this part.', 7, GREY);
  if (m.countries.rows.length) {
    head('Countries', 'the part costed in each country');
    const base = m.countries.rows.find(r => r.isBase)?.name ?? 'base';
    table(['Country', 'A part', `vs ${base}`], m.countries.rows.map(r => [`${r.name}${r.approx ? ' †' : ''}`, money(r.total), r.isBase ? 'base' : `${r.vsBasePct >= 0 ? '-' : '+'}${Math.abs(r.vsBasePct).toFixed(0)}%`]),
      { 0: { cellWidth: 100 }, 1: { cellWidth: 42, halign: 'right' }, 2: { cellWidth: 40, halign: 'right' } },
      { fontSize: 6.6, fill: r => (m.countries.rows[r].isBase ? HDR : null) });
    para(`${m.countries.note}${m.countries.rows.some(r => r.approx) ? ' † re-prices this costing\'s operations in that country\'s book (an approximation; the audit pack says what is carried).' : ''}`, 6.4, GREY, 'italic');
  }

  // ════════ 7. DESIGN TO COST ════════
  section(7, 'Design to cost', 'findings that apply to the costed process; sign-off');
  head('Geometric DFM', m.dfm.status === 'ran' ? `${m.dfm.findings.length} shown of ${m.dfm.considered} rule group(s)` : m.dfm.status);
  if (m.dfm.findings.length) {
    table(['Finding', 'Severity', 'In this costing', 'Fix'],
      m.dfm.findings.map(f => [`${f.title}${f.count > 1 ? ` (${f.count})` : ''}`, f.severity, f.amount ?? 'not re-costed', f.fix]),
      { 0: { cellWidth: 52, fontStyle: 'bold' }, 1: { cellWidth: 18 }, 2: { cellWidth: 30 }, 3: { cellWidth: 82, textColor: GREY } }, { fontSize: 6.4 });
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
  const cut = name.split(' — ')[0].replace(/\s*\([^)]*\)\s*$/, '').trim();
  return cut.length > 34 ? `${cut.slice(0, 32)}…` : cut;
}

/** A value with its unit, money converted ("£27.95/hr", "0.62 min", "9.084 kg"). */
function unitValue(v: number, unit: string, money: (n: number) => string, money4: (n: number) => string): string {
  if (unit.includes('£')) return `${Math.abs(v) < 1 ? money4(v) : money(v)}${unit.replace('£', '')}`;
  if (unit === 'hr') return `${(v * 60).toFixed(2)} min`;
  if (unit === '%') return `${+v.toFixed(2)}%`;
  return `${+v.toFixed(4)}${unit ? ` ${unit}` : ''}`;
}
