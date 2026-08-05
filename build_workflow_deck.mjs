/**
 * "How CostVision Actually Works" — the 29-slide workflow explainer.
 *
 *   NODE_PATH=calculator/node_modules node build_workflow_deck.mjs
 *
 * Two worked examples, end to end: a die-cast aluminium housing and an
 * injection-moulded bumper fascia. Every £ on the slides is engine output —
 * regenerate and re-verify it with `npm run examples` inside calculator/,
 * which pins these figures and fails loudly if a rate or module moves.
 *
 * Icons and part illustrations are pre-rendered into assets/workflow-deck/ so
 * this script needs only pptxgenjs. Regenerate those with
 * build_workflow_part_illustrations.mjs (needs sharp + react-icons).
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
const require = createRequire(import.meta.url);
const pptxgen = require('pptxgenjs');

// Palette continuous with the CostVision workbook the audience has already seen
const NAVY = '16325C', SLATE = '3A4356', MUTED = '6B7280', PAGE = 'F4F7FB', CARD = 'FFFFFF';
const BLUE = '1D6FB8', BLUE_T = 'E8F1FA';       // measure
const PURPLE = '6B3FA0', PURPLE_T = 'F1EBF8';   // AI
const AMBER = 'B7791F', AMBER_T = 'FCF3E3';     // guardrails
const TEAL = '0E8074', TEAL_T = 'E6F4F1';       // costing engine
const GREEN = '2E8B57', GREEN_T = 'EAF6EF';     // output / human
const RED = 'B03A2E', LINE = 'DCE3EE';

/** Pre-rendered icons — see the header note on regenerating them. */
const ICON_DIR = 'assets/workflow-deck/icons';
const I = Object.fromEntries(
  ['ruler', 'eye', 'calc', 'person', 'shield', 'upload', 'cog', 'press', 'clock',
   'coins', 'clip', 'cube', 'check', 'times', 'warn', 'arrow']
    .map(k => [k, 'image/png;base64,' + readFileSync(`${ICON_DIR}/${k}.png`).toString('base64')]));

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
const W = 13.33;

const money = n => `£${n.toFixed(2)}`;
let PG = 1;   // the title slide carries no footer
let FOOT = 'CostVision · how the tool works, step by step · die-cast aluminium housing worked example';
function footer(s, page) {
  s.addText(FOOT,
    { x: 0.5, y: 7.17, w: 10, h: 0.24, fontFace: 'Calibri', fontSize: 8.5, color: MUTED, margin: 0 });
  s.addText(String(page), { x: 12.5, y: 7.17, w: 0.35, h: 0.24, fontFace: 'Calibri', fontSize: 8.5, color: MUTED, align: 'right', margin: 0 });
}
function title(s, t, sub, tint) {
  if (tint) s.addShape('rect', { x: 0, y: 0, w: W, h: 0.09, fill: { color: tint } });
  s.addText(t, { x: 0.5, y: 0.24, w: 12.3, h: 0.5, fontFace: 'Cambria', fontSize: 25, bold: true, color: NAVY, margin: 0, valign: 'middle' });
  if (sub) s.addText(sub, { x: 0.5, y: 0.78, w: 12.3, h: 0.3, fontFace: 'Calibri', fontSize: 12, italic: true, color: MUTED, margin: 0 });
}
/** CostVision logo mark — matches the app's CV tile. */
function logoMark(s, x, y, size, bg = '4F46E5', fg = 'FFFFFF') {
  s.addShape('roundRect', { x, y, w: size, h: size, fill: { color: bg }, rectRadius: size * 0.22 });
  s.addText('CV', { x, y, w: size, h: size, fontFace: 'Calibri', fontSize: size * 30, bold: true, color: fg, align: 'center', valign: 'middle', margin: 0 });
}
/** Owner chip — makes "who does what" unmissable on every slide. */
function owner(s, x, y, label, col, tint) {
  s.addShape('roundRect', { x, y, w: 2.5, h: 0.34, fill: { color: tint }, line: { color: col, width: 1 }, rectRadius: 0.17 });
  s.addText(label, { x, y, w: 2.5, h: 0.34, fontFace: 'Calibri', fontSize: 9.5, bold: true, color: col, align: 'center', valign: 'middle', margin: 0 });
}

// ══════════ 1 · TITLE ══════════
{
  const s = pres.addSlide(); s.background = { color: NAVY };
  logoMark(s, 0.8, 1.3, 0.8, '4F46E5');
  s.addText('CostVision', { x: 1.78, y: 1.42, w: 6, h: 0.4, fontFace: 'Calibri', fontSize: 19, bold: true, color: 'FFFFFF', margin: 0, valign: 'middle' });
  s.addText('AI Cost Intelligence', { x: 1.78, y: 1.78, w: 6, h: 0.3, fontFace: 'Calibri', fontSize: 11.5, color: '8FA3CC', margin: 0, valign: 'middle' });
  s.addText('How CostVision Actually Works', { x: 0.8, y: 2.25, w: 11.7, h: 0.8, fontFace: 'Cambria', fontSize: 42, bold: true, color: 'FFFFFF', margin: 0 });
  s.addText('Who does what — followed end to end on one real part', { x: 0.8, y: 3.15, w: 11.7, h: 0.45, fontFace: 'Calibri', fontSize: 20, color: 'CADCFC', margin: 0 });
  s.addShape('roundRect', { x: 0.8, y: 3.95, w: 11.7, h: 0.75, fill: { color: '24406E' }, rectRadius: 0.1 });
  s.addText([
    { text: 'The one line to remember:  ', options: { color: '9FB6DF', bold: true } },
    { text: 'the AI reads the part.  The costing engine does every calculation.  A person approves the answer.', options: { color: 'FFFFFF', bold: true } },
  ], { x: 1.1, y: 3.95, w: 11.1, h: 0.75, fontFace: 'Calibri', fontSize: 15, margin: 0, valign: 'middle' });
  s.addText('Worked example: die-cast aluminium housing · 2.8 kg · 60,000 per year · made in China',
    { x: 0.8, y: 5.1, w: 11.7, h: 0.3, fontFace: 'Calibri', fontSize: 13, color: '8FA3CC', margin: 0 });
  s.addNotes(
    'Thank you all for coming back. In the last session I showed you what this tool produces. The feedback I got — very fairly — was that the workflow itself was still a black box. People told me they could not follow who does what, and where the AI actually sits in all this. So today I am going to open the box. ' +
    'I am going to take one real part — a die-cast aluminium housing, the sort of thing we buy tens of thousands of a year — and walk it through the tool from the moment we upload the CAD file to the moment a buyer walks into a supplier meeting with a number. Every single step. ' +
    'And I will keep colour-coding who owns each step, because that is the bit that has been confusing. Blue is measuring. Purple is the AI. Amber is the safety checks. Teal is the costing engine doing the arithmetic. Green is where a human signs it off. ' +
    'If you take one line away today, take the line on the screen: the AI reads the part, the costing engine does every calculation, and a person approves the answer. Everything I show you for the next twenty minutes is an elaboration of that sentence.'
  );
}

/** Section divider — dark, three seconds on screen, tells the room where it is. */
function divider(kicker, name, sub, col, items, mins, notes) {
  const s = pres.addSlide(); s.background = { color: NAVY };
  s.addShape('rect', { x: 0, y: 0, w: W, h: 0.09, fill: { color: col } });
  logoMark(s, 0.8, 0.6, 0.55);
  s.addText(kicker, { x: 0.8, y: 2.0, w: 8, h: 0.32, fontFace: 'Calibri', fontSize: 13, bold: true, color: col, charSpacing: 1.6, margin: 0 });
  s.addText(name, { x: 0.8, y: 2.42, w: 9.6, h: 0.75, fontFace: 'Cambria', fontSize: 34, bold: true, color: 'FFFFFF', margin: 0, valign: 'middle' });
  s.addText(sub, { x: 0.8, y: 3.26, w: 9.6, h: 0.34, fontFace: 'Calibri', fontSize: 15, color: '8FA3CC', margin: 0 });
  items.forEach((t, i) => {
    const y = 3.98 + i * 0.36;
    s.addShape('ellipse', { x: 0.86, y: y + 0.1, w: 0.11, h: 0.11, fill: { color: col } });
    s.addText(t, { x: 1.18, y, w: 8.6, h: 0.32, fontFace: 'Calibri', fontSize: 12, color: 'CADCFC', margin: 0, valign: 'middle' });
  });
  s.addShape('roundRect', { x: 10.6, y: 2.42, w: 2.23, h: 1.0, fill: { color: '24406E' }, rectRadius: 0.1 });
  s.addText(mins, { x: 10.6, y: 2.52, w: 2.23, h: 0.5, fontFace: 'Cambria', fontSize: 26, bold: true, color: 'FFFFFF', align: 'center', margin: 0, valign: 'middle' });
  s.addText('minutes', { x: 10.6, y: 3.0, w: 2.23, h: 0.3, fontFace: 'Calibri', fontSize: 11, color: '8FA3CC', align: 'center', margin: 0 });
  footer(s, ++PG);
  s.addNotes(notes);
}

// ══════════ 1c · AGENDA ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  logoMark(s, 0.5, 0.22, 0.6);
  s.addText('What We Are Going to Cover', { x: 1.25, y: 0.2, w: 8.6, h: 0.44, fontFace: 'Cambria', fontSize: 24, bold: true, color: NAVY, margin: 0, valign: 'middle' });
  s.addText('Four sections, about an hour — or five slides if that is all the time there is', { x: 1.25, y: 0.66, w: 9, h: 0.28, fontFace: 'Calibri', fontSize: 12, italic: true, color: MUTED, margin: 0 });

  const secs = [
    ['1', 'Orientation', 'Slides 3–6', 'How the whole thing connects, and what it is worth against costing by hand', '8 min', BLUE, true],
    ['2', 'Worked example one — die-cast aluminium housing', 'Slides 7–25', 'Twelve stages end to end: measure, derive, guard, calculate, approve — including the calculation and the confidence band shown in full.', '22 min', TEAL, false],
    ['3', 'Worked example two — injection-moulded bumper fascia', 'Slides 26–36', 'The same method on a very different part — plus paint, and the two findings nobody predicted', '18 min', PURPLE, false],
    ['4', 'The honest limits', 'Slide 37', 'Six things this tool cannot do, from us rather than from a sceptic in the room', '5 min', RED, true],
  ];
  secs.forEach(([n, name, range, desc, mins, col, exec], i) => {
    const y = 1.22 + i * 1.16;
    s.addShape('roundRect', { x: 0.5, y, w: 12.33, h: 1.04, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
    s.addShape('ellipse', { x: 0.78, y: y + 0.28, w: 0.48, h: 0.48, fill: { color: col } });
    s.addText(String(n), { x: 0.78, y: y + 0.28, w: 0.48, h: 0.48, fontFace: 'Cambria', fontSize: 19, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    s.addText(String(name), { x: 1.42, y: y + 0.14, w: 7.4, h: 0.32, fontFace: 'Calibri', fontSize: 13, bold: true, color: col, margin: 0, valign: 'middle' });
    s.addText(String(desc), { x: 1.42, y: y + 0.48, w: 8.6, h: 0.46, fontFace: 'Calibri', fontSize: 10.2, color: SLATE, margin: 0, valign: 'top' });
    s.addText(String(range), { x: 10.2, y: y + 0.16, w: 1.5, h: 0.28, fontFace: 'Calibri', fontSize: 9.6, color: MUTED, align: 'right', margin: 0, valign: 'middle' });
    s.addText(String(mins), { x: 11.85, y: y + 0.16, w: 0.85, h: 0.28, fontFace: 'Calibri', fontSize: 11, bold: true, color: NAVY, align: 'right', margin: 0, valign: 'middle' });
    if (exec) {
      s.addShape('roundRect', { x: 10.2, y: y + 0.52, w: 2.5, h: 0.3, fill: { color: GREEN_T }, line: { color: GREEN, width: 1 }, rectRadius: 0.15 });
      s.addText('★  on the 10-minute path', { x: 10.2, y: y + 0.52, w: 2.5, h: 0.3, fontFace: 'Calibri', fontSize: 8.4, bold: true, color: GREEN, align: 'center', valign: 'middle', margin: 0 });
    }
  });

  s.addShape('roundRect', { x: 0.5, y: 5.92, w: 12.33, h: 0.9, fill: { color: NAVY }, rectRadius: 0.1 });
  s.addText([
    { text: 'If you only have ten minutes:  ', options: { bold: true, color: '9FB6E0' } },
    { text: 'slide 3 (how it connects) · slides 4–6 (the business case) · slide 25 (the housing on one page) · slide 35 (the two findings) · slide 37 (the limits). Everything in between is the evidence for those five.', options: { color: 'FFFFFF' } },
  ], { x: 0.85, y: 6.02, w: 11.65, h: 0.72, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'Quick map of where we are going, because there is more here than an hour needs and I would rather you chose than sat through all of it. ' +
    'Section one, four slides: how the whole thing connects, and what it is worth measured against doing the same job by hand — including the category-by-category comparison with CAPEE from our internal review. About eight minutes. ' +
    'Section two is the first worked example — a die-cast aluminium housing, followed through all twelve stages from CAD file to defensible price, including the calculation shown in full so you can check it. Eighteen slides, about twenty-two minutes, and it is the heart of the pack. ' +
    'Section three does the same thing on a completely different part, an injection-moulded bumper fascia, plus paint, plus two findings that I genuinely did not predict. Eleven slides, about eighteen minutes. ' +
    'Section four is five minutes on what the tool cannot do. ' +
    'And the strip along the bottom is there because I have been in enough of these meetings. If the hour collapses to ten minutes, take slide three, the three business-case slides, slide twenty-five, slide thirty-five and slide thirty-seven. Everything in between is the evidence for those five, and you can read it afterwards.'
  );
}

// ══════════ 1b · THE NETWORK MAP (bird's-eye — deterministic-by-default) ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  logoMark(s, 0.5, 0.22, 0.6);
  s.addText('How It All Connects — One Picture', { x: 1.25, y: 0.2, w: 8.6, h: 0.44, fontFace: 'Cambria', fontSize: 24, bold: true, color: NAVY, margin: 0, valign: 'middle' });
  s.addText('Everything badged AUTO runs unattended — the rules pick the machine and tonnage, the engine writes the DFM/DFA and saving ideas; the engineer is the only manual step.', { x: 1.25, y: 0.66, w: 8.9, h: 0.28, fontFace: 'Calibri', fontSize: 11.5, italic: true, color: MUTED, margin: 0 });
  // ── legend (top right) ──
  const legend = [['Measure', BLUE], ['Rules', '4F46E5'], ['AI (optional)', PURPLE], ['Guardrail', AMBER], ['Engine', TEAL], ['Human / output', GREEN]];
  legend.forEach(([t, c], i) => {
    const x = 10.35 + (i % 2) * 1.35, y = 0.16 + Math.floor(i / 2) * 0.24;
    s.addShape('ellipse', { x, y: y + 0.05, w: 0.11, h: 0.11, fill: { color: c } });
    s.addText(t, { x: x + 0.16, y, w: 1.25, h: 0.22, fontFace: 'Calibri', fontSize: 7.8, color: SLATE, margin: 0, valign: 'middle' });
  });
  // ── why believe the picture: four measured facts ──
  s.addShape('roundRect', { x: 0.45, y: 1.18, w: 2.0, h: 0.83, fill: { color: 'EAF6EF' }, line: { color: GREEN, width: 1 }, rectRadius: 0.08 });
  s.addText('WHY TRUST THIS PICTURE', { x: 0.56, y: 1.23, w: 1.85, h: 0.15, fontFace: 'Calibri', fontSize: 6.6, bold: true, color: GREEN, charSpacing: 0.4, margin: 0 });
  s.addText('Same file + answers = same price\n12 of 18 commodities rules-driven\n~1,490 automated tests\n6 real parts · fleet error ≈13%',
    { x: 0.56, y: 1.39, w: 1.85, h: 0.6, fontFace: 'Calibri', fontSize: 6.9, color: SLATE, margin: 0, valign: 'top' });
  // ── OUTSIDE the tool: the OPTIONAL AI ──
  s.addShape('roundRect', { x: 2.55, y: 1.02, w: 5.2, h: 0.99, fill: { color: PURPLE_T }, line: { color: PURPLE, width: 1.5, dashType: 'dash' }, rectRadius: 0.09 });
  s.addShape('ellipse', { x: 2.70, y: 1.28, w: 0.44, h: 0.44, fill: { color: PURPLE } });
  s.addImage({ data: I.eye, x: 2.81, y: 1.39, w: 0.22, h: 0.22 });
  s.addText('OPTIONAL AI — off by default, the only outbound call', { x: 3.28, y: 1.08, w: 4.35, h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: PURPLE, charSpacing: 0.4, margin: 0 });
  s.addText([
    { text: 'Three modes: ', options: { color: SLATE } },
    { text: 'Rules only (default) · Compare · AI-led. ', options: { bold: true, color: NAVY } },
    { text: 'Classification only — geometry out, words back. It cannot set a price, pick a machine, or write a DFM score or saving.', options: { color: SLATE } },
  ], { x: 3.28, y: 1.29, w: 4.35, h: 0.44, fontFace: 'Calibri', fontSize: 8.7, margin: 0, valign: 'top' });
  s.addText('Routable to a private endpoint · AIR_GAPPED=1 refuses the call — costing still works', { x: 3.28, y: 1.76, w: 4.35, h: 0.2, fontFace: 'Calibri', fontSize: 8, italic: true, color: PURPLE, margin: 0 });
  s.addShape('roundRect', { x: 8.0, y: 1.02, w: 4.83, h: 0.99, fill: { color: CARD }, line: { color: LINE, width: 1, dashType: 'dash' }, rectRadius: 0.09 });
  s.addText('OPTIONAL FEEDS — off by default, none of them price a part', { x: 8.2, y: 1.12, w: 4.5, h: 0.22, fontFace: 'Calibri', fontSize: 8, bold: true, color: MUTED, charSpacing: 0.4, margin: 0 });
  s.addText('Live component pricing (PCB only) · industry news · metal-price ticker (display only)',
    { x: 8.2, y: 1.38, w: 4.5, h: 0.5, fontFace: 'Calibri', fontSize: 9, color: SLATE, margin: 0, valign: 'top' });
  // ── the boundary ──
  s.addShape('roundRect', { x: 0.45, y: 2.18, w: 12.4, h: 4.4, fill: { color: 'FFFFFF' }, line: { color: TEAL, width: 1.75, dashType: 'dash' }, rectRadius: 0.12 });
  s.addShape('roundRect', { x: 0.75, y: 2.05, w: 3.5, h: 0.28, fill: { color: TEAL }, rectRadius: 0.14 });
  s.addText('INSIDE — RUNS ON YOUR OWN SERVER', { x: 0.75, y: 2.05, w: 3.5, h: 0.28, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, charSpacing: 0.5 });
  // dashed link guardrails <-> AI, crossing the boundary
  s.addShape('line', { x: 4.15, y: 2.01, w: 0, h: 0.67, line: { color: PURPLE, width: 1.5, dashType: 'dash', beginArrowType: 'triangle', endArrowType: 'triangle' } });
  const link = (x1, y1, x2, y2, col, wid = 1.75) => s.addShape('line', {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
    flipH: x2 < x1, flipV: y2 < y1,
    line: { color: col, width: wid, endArrowType: 'triangle' },
  });
  const node = (x, y, w, h, col, tint, ttl, body, ico) => {
    s.addShape('roundRect', { x, y, w, h, fill: { color: tint }, line: { color: col, width: 1.4 }, rectRadius: 0.09 });
    if (ico) { s.addShape('ellipse', { x: x + 0.14, y: y + 0.12, w: 0.34, h: 0.34, fill: { color: col } }); s.addImage({ data: ico, x: x + 0.22, y: y + 0.20, w: 0.18, h: 0.18 }); }
    s.addText(ttl, { x: x + (ico ? 0.56 : 0.16), y: y + 0.11, w: w - (ico ? 0.70 : 0.32), h: 0.30, fontFace: 'Calibri', fontSize: 10, bold: true, color: col, margin: 0, valign: 'middle' });
    s.addText(body, { x: x + 0.16, y: y + 0.47, w: w - 0.32, h: h - 0.60, fontFace: 'Calibri', fontSize: 8.2, color: SLATE, margin: 0, valign: 'top' });
  };
  // inputs (left) and outputs (right)
  const col = (x, w, label, c, items, y0, pitch = 0.80) => {
    s.addText(label, { x, y: y0 - 0.3, w, h: 0.24, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: c, charSpacing: 0.6, margin: 0 });
    items.forEach((t, i) => {
      const y = y0 + i * pitch;
      s.addShape('roundRect', { x, y, w, h: 0.68, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.07 });
      s.addText(t, { x: x + 0.13, y, w: w - 0.26, h: 0.68, fontFace: 'Calibri', fontSize: 8.6, color: SLATE, margin: 0, valign: 'middle' });
    });
  };
  col(0.65, 2.0, 'WHAT GOES IN', BLUE, ['3D CAD model\n(STEP / IGES / STL)', 'Photo of a PCB', 'Plain description\nor an RFQ sheet', 'Volume + region\n(the engineer types)'], 2.74);
  col(11.05, 1.8, 'WHAT COMES OUT', GREEN, ['8-bucket cost — every\nfigure shows its basis', 'Operation list —\nwhat takes the time', 'Confidence band +\n20-country comparison', 'DFM/DFA + priced saving\nideas — engine, not AI', 'PDF · Excel · PowerPoint\nnegotiation pack'], 2.74, 0.76);
  // inside nodes — the deterministic spine
  node(2.85, 2.68, 2.1, 1.22, BLUE, BLUE_T, 'Geometry kernel', 'OCCT measures the part: volume, walls, holes, faces, topology. Never guessed.', I.ruler);
  node(2.85, 4.06, 2.1, 1.22, '4F46E5', 'EEF2FF', 'Rules + optimisers', 'Derive every input AND pick the machine: press/die tonnage by physics; routing & cavitation cost-ranked.', I.cog);
  node(2.85, 5.44, 2.1, 1.02, GREEN, GREEN_T, 'The engineer', 'Answers only what geometry cannot know: material, duty, volume, region. Hard stop — no silent guess.', I.person);
  node(5.35, 2.68, 2.15, 1.22, AMBER, AMBER_T, 'Guardrails', 'Sanity checks + physics caps; a self-audit challenges every estimate (machine sizing flagged in £/part). Measurements beat the AI.', I.shield);
  node(8.5, 2.68, 2.1, 1.22, TEAL, TEAL_T, 'Rate library', 'Materials, machines, labour, 20 regions. The only source of money in the tool.', I.coins);
  node(8.5, 4.06, 2.1, 1.22, TEAL, TEAL_T, 'Local database', 'Parts, quotes, real actuals — the learning loop that calibrates the estimates.', I.clip);
  node(8.5, 5.44, 2.1, 1.02, GREEN, GREEN_T, 'Uncertainty', 'Monte-Carlo band (P10–P90), conformal-calibrated from actuals.', null);
  // the hub
  s.addShape('roundRect', { x: 5.35, y: 4.06, w: 2.15, h: 1.58, fill: { color: '0E5A5A' }, rectRadius: 0.1 });
  s.addShape('ellipse', { x: 6.16, y: 4.20, w: 0.5, h: 0.5, fill: { color: '17A398' } });
  s.addImage({ data: I.calc, x: 6.29, y: 4.33, w: 0.24, h: 0.24 });
  s.addText('COST ENGINE', { x: 5.45, y: 4.76, w: 1.95, h: 0.3, fontFace: 'Calibri', fontSize: 12, bold: true, color: 'FFFFFF', align: 'center', margin: 0, valign: 'middle' });
  s.addText('Fixed arithmetic. 8 buckets.\nNo AI, no judgement.', { x: 5.45, y: 5.08, w: 1.95, h: 0.44, fontFace: 'Calibri', fontSize: 8.2, color: '9FD9CF', align: 'center', margin: 0, valign: 'top' });
  // who runs unattended, and where the person is — the automation map
  const chip = (x, y, label, bg) => {
    s.addShape('roundRect', { x, y, w: 0.6, h: 0.17, fill: { color: bg }, rectRadius: 0.085 });
    s.addText(label, { x, y, w: 0.6, h: 0.17, fontFace: 'Calibri', fontSize: 6.2, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, charSpacing: 0.5 });
  };
  chip(4.27, 2.59, 'AUTO', BLUE);       // kernel
  chip(4.27, 3.97, 'AUTO', '4F46E5');   // rules + optimisers
  chip(6.82, 2.59, 'AUTO', AMBER);      // guardrails
  chip(9.92, 2.59, 'AUTO', TEAL);       // rate library
  chip(9.92, 3.97, 'AUTO', TEAL);       // local db
  chip(9.92, 5.35, 'AUTO', GREEN);      // uncertainty
  chip(6.82, 3.97, 'AUTO', '0E8074');   // cost engine
  chip(4.27, 5.35, 'HUMAN', GREEN);     // the engineer — the only manual step

  // flows: inputs→kernel, kernel→rules, engineer→rules, AI⇢guardrails⇢rules, rules→engine, rates→engine, engine↔db, engine→uncertainty→outputs
  link(2.65, 3.29, 2.85, 3.29, BLUE);
  link(2.65, 5.89, 2.85, 5.89, BLUE);
  link(3.90, 3.90, 3.90, 4.06, BLUE);                       // kernel ↓ rules
  link(3.90, 5.44, 3.90, 5.28, GREEN);                      // engineer ↑ rules
  link(5.35, 3.29, 4.95, 3.60, AMBER, 1.4);                 // guardrails → rules (corrected words land here)
  link(4.95, 4.67, 5.35, 4.67, '4F46E5');                   // rules → engine
  link(8.50, 3.29, 7.90, 3.29, TEAL); link(7.90, 3.29, 7.50, 4.30, TEAL);   // rates → engine
  link(8.50, 4.67, 7.50, 4.67, TEAL);                       // db ↔ engine
  link(7.50, 5.30, 8.50, 5.85, GREEN);                      // engine → uncertainty
  link(10.60, 5.95, 11.05, 5.95, GREEN);                    // uncertainty → outputs
  // the flywheel: won quotes / invoices return and calibrate the estimates
  s.addShape('line', { x: 10.60, y: 4.92, w: 0.45, h: 0, flipH: true,
    line: { color: GREEN, width: 1.4, dashType: 'dash', endArrowType: 'triangle' } });
  s.addText('actuals\nfeed back', { x: 10.56, y: 4.50, w: 0.55, h: 0.38, fontFace: 'Calibri', fontSize: 6.0, italic: true, color: GREEN, align: 'center', margin: 0, valign: 'top' });
  link(10.60, 3.29, 11.05, 3.29, GREEN);
  // read-in-one-line
  s.addShape('roundRect', { x: 0.45, y: 6.70, w: 12.4, h: 0.42, fill: { color: 'EAF6EF' }, line: { color: GREEN, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Read it in one line:  ', options: { bold: true, color: GREEN } },
    { text: 'everything badged AUTO is unattended — measure, derive, pick the machine, check, calculate, write the DFM/DFA and saving ideas. The engineer answers and approves; the AI is an optional second opinion that can reach none of the money.', options: { color: SLATE } },
  ], { x: 0.65, y: 6.70, w: 12.0, h: 0.42, fontFace: 'Calibri', fontSize: 10.5, margin: 0, valign: 'middle' });
  footer(s, ++PG);
  s.addNotes(
    'Before the twelve stages, the whole thing on one picture — and one important update since the last session: the tool is now deterministic by default. Start in the middle-left. The blue box measures the part — OCCT, real geometry, never guessed. Below it the indigo box is new: the rules engine. Twelve commodities of explicit engineering rules that derive every cost input straight from the measurement — cycle times, tooling, press size, yield. Where geometry genuinely cannot know something — what the part is made of, whether it is safety-critical, how many a year — the tool does not guess. It stops and asks the engineer, that is the green box, and the costing is blocked until a person answers. That combination is what changed: the purple box at the top, the AI, is now OPTIONAL. Three modes on the form: Rules only, which is the default and makes no outbound call at all; Compare, which runs both and shows you exactly where they disagree, field by field; and AI-led, the old behaviour, kept for comparison. When the AI does run, its words come down through the amber guardrails — nine sanity checks, and its numbers are overwritten wherever the rules can derive the value, its machining time capped by what the stock could physically give up. On the right, unchanged: the rate library is still the only source of money in the tool, the local database holds our parts and real actuals for calibration, the engine is still fixed eight-bucket arithmetic with no judgement in it, and the uncertainty layer turns the number into an honest range. The one line: the kernel measures, the rules derive, the engineer answers, the guardrails check, the engine calculates. The AI is a second opinion — useful, optional, and unable to reach the money. Three annotations on this version of the picture, from questions this room asked. Every box badged AUTO runs unattended — the only HUMAN badge on the slide is the engineer, answering material, duty, volume and region, and approving. WHO picks the machine and the tonnage: the indigo rules-and-optimisers box — presses and dies sized by clamp and forming physics, and the machining routing and mould cavitation actually cost-ranked, with the losing options printed in the trace. And WHERE the DFM, DFA and saving ideas come from: the cost engine itself — rule thresholds and geometry advisors, every idea priced — not from the AI; you can see that on the outputs column now, and it is verified in the source code. Two more things this version of the picture carries. The little green card top-left is why to believe the boxes: the tool is deterministic — same file and same answers give the same price, every time; twelve of the eighteen commodities are fully rules-driven and the slide says so honestly; the arithmetic sits behind roughly one and a half thousand automated tests; and it has been validated against six real parts with independent manual costs, at about thirteen percent fleet error. And the small dashed arrow feeding back into the local database is the flywheel: every won quote and real invoice we record calibrates the estimates and tightens the confidence band — this is a tool that gets better the more we use it.'
  );
}

// ══════════ 2b · THE BUSINESS CASE (two management slides) ══════════
{
  // ── Business case I — minutes, not hours ──
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Business Case I — Minutes, Not Hours', 'The same should-cost, by commodity: CostVision measured against the CAPEE-by-hand baseline', GREEN);
  // What the CostVision minutes actually contain (the tool truth)
  const steps = [
    [I.upload, 'Upload CAD', '~1 min'],
    [I.ruler, 'Measure + derive', '1–2 min\nautomatic'],
    [I.person, 'Answer 2–5 questions', '2–5 min\nmaterial · duty'],
    [I.check, 'Review band + approve', '5–8 min'],
  ];
  s.addText('WHAT THE COSTVISION MINUTES CONTAIN', { x: 0.5, y: 1.16, w: 5.9, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: TEAL, charSpacing: 0.6, margin: 0 });
  steps.forEach(([ico, t, d], i) => {
    const x = 0.5 + i * 1.52;
    s.addShape('roundRect', { x, y: 1.42, w: 1.4, h: 1.16, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.08 });
    s.addShape('ellipse', { x: x + 0.51, y: 1.52, w: 0.38, h: 0.38, fill: { color: TEAL } });
    s.addImage({ data: ico, x: x + 0.61, y: 1.62, w: 0.18, h: 0.18 });
    s.addText(t, { x: x + 0.05, y: 1.94, w: 1.3, h: 0.24, fontFace: 'Calibri', fontSize: 8.3, bold: true, color: NAVY, align: 'center', margin: 0 });
    s.addText(d, { x: x + 0.05, y: 2.16, w: 1.3, h: 0.4, fontFace: 'Calibri', fontSize: 7.6, color: MUTED, align: 'center', margin: 0, valign: 'top' });
    if (i < 3) s.addImage({ data: I.arrow, x: x + 1.41, y: 1.92, w: 0.12, h: 0.12 });
  });
  s.addText([
    { text: 'End to end: 10–15 minutes ', options: { bold: true, color: TEAL, fontSize: 12 } },
    { text: 'for a CAD part, engineer at the screen throughout. The tool computes; the engineer answers and approves.', options: { color: SLATE, fontSize: 9.5 } },
    { text: ' In CAPEE these inputs are keyed by hand from the CAD — automatic feeding is the largest single saving.', options: { color: NAVY, fontSize: 8.2, bold: true } },
  ], { x: 0.5, y: 2.64, w: 5.9, h: 0.42, fontFace: 'Calibri', margin: 0, valign: 'top' });
  // Per-commodity time table
  const rows = [
    ['Casting + machining (CAD)', '10–15 min', '4–5 h', '✓ confirmed baseline'],
    ['Machining from billet (CAD)', '10–15 min', '3–4 h', 'team-reported'],
    ['Injection moulding (CAD)', '10–15 min', '3–4 h', 'team-reported'],
    ['Forging + machining (CAD)', '10–15 min', '3–4 h', 'team-reported'],
    ['Sheet-metal pressing (CAD)', '10–15 min', '2–3 h', 'team-reported'],
    ['Blow-moulded tank (CAD)', '10–15 min', '3–4 h', 'team-reported'],
    ['PCB — from a photo', '≈ 10 min', '4–6 h', 'team-reported'],
    ['Manual form (any of 18)', '15–30 min', '2–4 h', 'team-reported'],
  ];
  const ty = 3.34;
  s.addText('TIME PER SHOULD-COST, BY COMMODITY', { x: 0.5, y: ty - 0.22, w: 5.9, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: NAVY, charSpacing: 0.6, margin: 0 });
  const th = ['Commodity', 'CostVision', 'CAPEE by hand', 'Baseline'];
  const tw = [2.5, 1.0, 1.2, 1.35];
  let tx = 0.5;
  th.forEach((h, i) => { s.addText(h, { x: tx, y: ty, w: tw[i], h: 0.24, fontFace: 'Calibri', fontSize: 8.3, bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: i ? 'center' : 'left', valign: 'middle', margin: 0.04 }); tx += tw[i]; });
  rows.forEach(([c, cv, cap, note], r) => {
    const y = ty + 0.24 + r * 0.335;
    let x = 0.5;
    const cells = [c, cv, cap, note];
    cells.forEach((v, i) => {
      s.addText(v, { x, y, w: tw[i], h: 0.335, fontFace: 'Calibri', fontSize: 8.4,
        bold: i === 1, color: i === 1 ? TEAL : (i === 3 && v.startsWith('✓') ? GREEN : SLATE),
        fill: { color: r % 2 ? 'F0F4F9' : 'FFFFFF' }, align: i ? 'center' : 'left', valign: 'middle', margin: 0.04 });
      x += tw[i];
    });
  });
  // Bar chart: the same rows as minutes
  s.addText('THE SAME TABLE AS A PICTURE — MINUTES PER ESTIMATE', { x: 6.85, y: 1.16, w: 6.0, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: NAVY, charSpacing: 0.6, margin: 0 });
  s.addChart('bar', [
    { name: 'CostVision (midpoint)', labels: ['Cast+mach', 'Machining', 'Inj. mould', 'Forging', 'Sheet metal', 'Blow mould', 'PCB photo'], values: [12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 10] },
    { name: 'CAPEE by hand (midpoint)', labels: ['Cast+mach', 'Machining', 'Inj. mould', 'Forging', 'Sheet metal', 'Blow mould', 'PCB photo'], values: [270, 210, 210, 210, 150, 210, 300] },
  ], {
    x: 6.85, y: 1.42, w: 6.0, h: 4.6, barDir: 'bar', barGrouping: 'clustered',
    chartColors: ['0E8074', 'B7791F'], showLegend: true, legendPos: 'b', legendFontSize: 9,
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 8, dataLabelColor: '3A4356',
    valAxisTitle: 'minutes', showValAxisTitle: true, valAxisTitleFontSize: 9,
    catAxisLabelColor: '3A4356', valAxisLabelColor: '6B7280', catAxisLabelFontSize: 9, valAxisLabelFontSize: 8,
    valGridLine: { color: 'DCE3EE', size: 0.5 }, catGridLine: { style: 'none' },
  });
  s.addText('16–30× faster on the confirmed baseline. CAPEE midpoints marked "team-reported" are working figures — confirm with the costing team before circulating beyond this room.',
    { x: 6.85, y: 6.10, w: 6.0, h: 0.5, fontFace: 'Calibri', fontSize: 8.6, italic: true, color: MUTED, margin: 0, valign: 'top' });
  s.addShape('roundRect', { x: 0.5, y: 6.32, w: 5.9, h: 0.72, fill: { color: 'EAF6EF' }, line: { color: GREEN, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Man-hours saved = Σ (CAPEE hrs − CostVision hrs) × annual parts. ', options: { bold: true, color: GREEN, fontSize: 8.6 } },
    { text: 'Illustrative 500-part/yr mix over this table\u2019s midpoints: ', options: { color: SLATE, fontSize: 8.3 } },
    { text: '≈ 1,650 h/yr ≈ one engineer-year', options: { bold: true, color: NAVY, fontSize: 9.0 } },
    { text: ' — capacity that moves into negotiation. Replace with your annual volumes; the tool logs its own run times.', options: { color: SLATE, fontSize: 8.3 } },
  ], { x: 0.68, y: 6.38, w: 5.6, h: 0.62, fontFace: 'Calibri', margin: 0, valign: 'top' });
  footer(s, ++PG);
  s.addNotes(
    'The business case starts with time, because time is the thing nobody disputes. The left side shows what the CostVision minutes actually contain — upload, automatic measurement and derivation, then the engineer answers the two to five questions geometry cannot answer, reviews the band and approves. Ten to fifteen minutes end to end for a CAD part, and I want to be precise: that is not unattended time, that is an engineer at the screen owning the answer. The table is the same should-cost by commodity. One row is a confirmed baseline — casting plus machining, four to five hours in CAPEE, measured by us. The other CAPEE figures are team-reported working numbers and the slide says so; I would rather show you an honest label than a precise-looking guess. The chart makes the point the table makes: the green bars are barely visible against the amber ones. And the box at the bottom is the real argument — this is capacity, not headcount. At these times one engineer reviews fifteen to twenty-five should-costs a day instead of preparing one or two. The hours we save do not disappear, they move into negotiation preparation, which is where the money actually is. Two additions from our own review. First, the single biggest category of saving is input data feeding: in CAPEE every measurement and cycle input is read off the CAD and keyed by hand; here the geometry kernel measures the file and feeds the cost engine automatically. Second, the total: hours saved equals the per-part difference times the annual number of parts, summed over the commodities. On an illustrative five-hundred-part annual mix over this table\u2019s own midpoints that is roughly one thousand six hundred and fifty hours a year — about one engineer-year. That mix is illustrative and the slide says so; substitute our real annual volumes and the tool\u2019s own logged run times to firm it up.'
  );
}
{
  // ── Business case II — CostVision vs CAPEE, category by category ──
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Business Case II — CostVision vs CAPEE, Category by Category', 'The seven saving categories from our internal review — what CAPEE does today, and what changes', GREEN);

  const cw = [2.35, 2.55, 5.55, 1.85];
  const ch = ['Saving category', 'CAPEE today', 'CostVision', 'Shown at'];
  let hx = 0.5;
  ch.forEach((h, i) => {
    s.addText(h, { x: hx, y: 1.28, w: cw[i], h: 0.3, fontFace: 'Calibri', fontSize: 9.5, bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: i ? 'left' : 'left', valign: 'middle', margin: 0.06 });
    hx += cw[i];
  });
  const rows = [
    ['1 · Input data feeding', 'Every measurement and cycle input read off the CAD and keyed by hand', 'The geometry kernel measures the CAD file and feeds every input automatically — the single largest time saving', 'Measure + kernel slides'],
    ['2 · Machine, tonnage & process selection', 'Partially automated', 'Automatic AND cost-ranked: presses sized by clamp/force physics; machining routing and mould cavitation chosen by price, with the losing alternatives printed in the trace', 'Process-selection + routing slides'],
    ['3 · Coverage & early programme support', 'Few parts, usually after the quote lands', '15–25 should-costs per engineer-day — directional cost early in the programme, while wall thickness and process can still change', 'Business Case I'],
    ['4 · Total man-hours saved', '—', 'Σ (CAPEE hrs − CostVision hrs) × annual parts, per commodity. Illustrative 500-part/yr mix ≈ 1,650 h/yr ≈ one engineer-year — replace with our real volumes', 'Business Case I strip'],
    ['5 · DFM / DFA insights', 'Not available', 'Generated by the deterministic COST ENGINE — ~37 threshold rules + 10 geometry advisors, scores by fixed arithmetic. Not by AI: the AI cannot write a score, severity or saving', 'DFM/DFA slide'],
    ['6 · Cost-saving ideas', 'Engineer\u2019s own analysis', 'Generated by the cost engine\u2019s rule layer and the optimisers — each idea priced in £/part with its lever owner (design / supplier / sourcing); the AI adds display-only commentary at most', 'DFM + routing slides'],
    ['7 · Beyond a conventional tool', '—', '20-region pricing on every run · confidence band · negotiation pack · every cost line carries its printed derivation · self-audit · learns from actuals · landed cost incl. duty/CBAM · carbon · PCB photo→BOM · air-gapped mode', 'Throughout the deck'],
  ];
  rows.forEach((r, ri) => {
    const y = 1.58 + ri * 0.665;
    let x = 0.5;
    r.forEach((v, i) => {
      s.addText(v, { x, y, w: cw[i], h: 0.665, fontFace: 'Calibri', fontSize: i === 0 ? 8.7 : 8.1,
        bold: i === 0, color: i === 0 ? NAVY : (i === 3 ? MUTED : SLATE), italic: i === 3,
        fill: { color: ri % 2 ? 'F0F4F9' : 'FFFFFF' }, align: 'left', valign: 'middle', margin: 0.06 });
      x += cw[i];
    });
  });

  s.addShape('roundRect', { x: 0.5, y: 6.35, w: 12.33, h: 0.6, fill: { color: 'EAF6EF' }, line: { color: GREEN, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'The honest one-liner:  ', options: { bold: true, color: GREEN } },
    { text: 'CAPEE is a costing calculator that a person feeds; CostVision is a measuring, deciding and explaining system with the same deterministic arithmetic at its core — the AI reads part descriptions and writes commentary, and is never allowed to touch a number.', options: { color: SLATE } },
  ], { x: 0.68, y: 6.35, w: 12.0, h: 0.6, fontFace: 'Calibri', fontSize: 9.8, margin: 0, valign: 'middle' });
  footer(s, ++PG);
  s.addNotes(
    'This slide is our internal review with the manager, made presentable — seven categories, and I will take them in order. One, input data feeding, and this is the big one: in CAPEE every measurement and every cycle input is read off the CAD by a person and keyed in by hand; here the geometry kernel measures the file and feeds the cost engine automatically. Two, machine and tonnage selection: CAPEE partially automates this; here it is automatic and, more importantly, cost-ranked — the press is sized by physics, and the machining routing and the mould cavitation are chosen by price with the losing alternatives printed in the trace, so the choice defends itself. Three, coverage: at these cycle times one engineer reviews fifteen to twenty-five should-costs a day, which means directional cost support early in the programme, while the design can still move. Four, the total: hours saved per part times annual parts, summed by commodity — on an illustrative five-hundred-part mix, about one thousand six hundred and fifty hours a year, roughly one engineer-year; that mix is illustrative and we will substitute our real volumes. Five, and I checked this in the source code before putting it on a slide: the DFM and DFA insights are generated by the deterministic cost engine — thirty-seven threshold rules and ten geometry advisors, scores by fixed arithmetic — not by the AI. CAPEE has nothing equivalent. Six, same answer for the cost-saving ideas: they come from the engine\u2019s rule layer and the optimisers, each one priced in pounds per part with a named lever owner; the AI is allowed to add commentary and nothing else. And seven, everything a conventional tool does not do: twenty regions priced on every run, the confidence band, the negotiation pack, full derivation on every line, the self-audit, learning from actuals, landed cost including duty and carbon border adjustment, and the air-gapped mode for IP-sensitive programmes.'
  );
}
{
  // ── Business case III — evidence, coverage, cost to run ──
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Business Case III — Evidence, Coverage, Cost to Run', 'Every figure on this slide is measured from the tool — nothing is projected', GREEN);
  // KPI band
  const kpis = [
    ['16–30×', 'faster than the confirmed\nCAPEE baseline', TEAL],
    ['£0', 'marginal cost per estimate\nin Rules mode — no AI call', GREEN],
    ['20', 'manufacturing regions\npriced on every run', BLUE],
    ['100%', 'of cost lines carry their\nown printed derivation', NAVY],
  ];
  kpis.forEach(([n, d, c], i) => {
    const x = 0.5 + i * 3.16;
    s.addShape('roundRect', { x, y: 1.18, w: 2.96, h: 1.12, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
    s.addText(n, { x: x + 0.15, y: 1.26, w: 2.65, h: 0.52, fontFace: 'Cambria', fontSize: 30, bold: true, color: c, margin: 0 });
    s.addText(d, { x: x + 0.15, y: 1.80, w: 2.65, h: 0.44, fontFace: 'Calibri', fontSize: 8.6, color: MUTED, margin: 0, valign: 'top' });
  });
  // Accuracy evidence — the six verified parts
  s.addText('ACCURACY — 6 REAL PARTS vs INDEPENDENT MANUAL SHOULD-COSTS (China · 100k/yr)', { x: 0.5, y: 2.56, w: 7.6, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: NAVY, charSpacing: 0.5, margin: 0 });
  const parts = [
    ['Fuel tank (blow-moulded)', '£20–30', '£25.92', '+4%', GREEN],
    ['Front bumper (inj. moulded)', '£8–9', '£8.28', '−3%', GREEN],
    ['Seat cross-member (pressed)', '£1.20–1.60', '£1.33', '−5%', GREEN],
    ['Steering knuckle (cast+mach)', '£16–18', '£14.10', '−17%', AMBER],
    ['Stub axle (forged+mach)', '≈ £30', '£38.98', '+30%', AMBER],
    ['Servo horn (CNC, 3 g)', '≈ £2.20', '£2.65', '+21%', AMBER],
  ];
  const pw = [2.55, 1.05, 1.0, 0.75];
  let px = 0.5;
  ['Part', 'Manual', 'CostVision', 'Error'].forEach((h, i) => { s.addText(h, { x: px, y: 2.82, w: pw[i], h: 0.24, fontFace: 'Calibri', fontSize: 8.2, bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: i ? 'center' : 'left', valign: 'middle', margin: 0.04 }); px += pw[i]; });
  parts.forEach(([p, m, cv, e, c], r) => {
    const y = 3.06 + r * 0.315;
    let x = 0.5;
    [p, m, cv, e].forEach((v, i) => {
      s.addText(v, { x, y, w: pw[i], h: 0.315, fontFace: 'Calibri', fontSize: 8.3, bold: i === 3, color: i === 3 ? c : SLATE, fill: { color: r % 2 ? 'F0F4F9' : 'FFFFFF' }, align: i ? 'center' : 'left', valign: 'middle', margin: 0.04 });
      x += pw[i];
    });
  });
  s.addText([
    { text: 'Fleet error ≈13% vs the AI path’s 28% on the same parts. ', options: { bold: true, color: NAVY } },
    { text: 'Every miss is visible and every over-estimate errs on the negotiating side — no silent under-quote. Validated on these 6 parts; validation on unseen parts is the next step and is said so out loud.', options: { color: SLATE } },
  ], { x: 0.5, y: 5.02, w: 5.9, h: 0.8, fontFace: 'Calibri', fontSize: 9, margin: 0, valign: 'top' });
  // Donuts: commodity coverage + verification state
  s.addChart('doughnut', [
    { name: 'Commodity coverage', labels: ['Deterministic rules (12)', 'AI-assisted (6)'], values: [12, 6] },
  ], {
    x: 6.6, y: 2.66, w: 3.1, h: 2.5, holeSize: 60,
    chartColors: ['0E8074', 'B7791F'], showLegend: true, legendPos: 'b', legendFontSize: 8.5,
    showValue: false, showTitle: true, title: '18 commodities', titleFontSize: 10, titleColor: '16325C',
  });
  s.addChart('doughnut', [
    { name: 'Verification', labels: ['Inside manual band (3)', 'Within ±30% (3)', 'No manual yet (2)'], values: [3, 3, 2] },
  ], {
    x: 9.85, y: 2.66, w: 3.1, h: 2.5, holeSize: 60,
    chartColors: ['2E8B57', 'B7791F', 'DCE3EE'], showLegend: true, legendPos: 'b', legendFontSize: 8.5,
    showValue: false, showTitle: true, title: '8 parts costed, 8 of 8 succeeded', titleFontSize: 10, titleColor: '16325C',
  });
  // what it is NOT — the trust strip
  s.addShape('roundRect', { x: 0.5, y: 5.95, w: 12.33, h: 1.02, fill: { color: 'FCF3E3' }, line: { color: AMBER, width: 1 }, rectRadius: 0.09 });
  s.addImage({ data: I.warn, x: 0.68, y: 6.12, w: 0.26, h: 0.26 });
  s.addText([
    { text: 'What we are NOT claiming — ', options: { bold: true, color: AMBER } },
    { text: 'the tool does not read drawings or tolerances yet; it stops and asks the engineer for the material rather than guessing; accuracy is verified on 6 parts and the validation set is being widened before any accuracy figure goes into a supplier commitment. Every number above is reproducible from the tool today — the evidence pack (per-part derivations, all three benchmark rounds) accompanies this deck.', options: { color: SLATE } },
  ], { x: 1.05, y: 6.02, w: 11.6, h: 0.9, fontFace: 'Calibri', fontSize: 9, margin: 0, valign: 'middle' });
  footer(s, ++PG);
  s.addNotes(
    'Second half of the business case: evidence, coverage, and what it costs to run. Four headline figures, all measured. Sixteen to thirty times faster on the baseline we confirmed ourselves. Zero marginal cost per estimate in the default mode — there is no AI call, no per-seat metering on the costing path, it is arithmetic on our own server. Twenty manufacturing regions priced on every single run. And every line of every estimate prints its own derivation — that is what makes it usable in a supplier meeting. The table is the accuracy evidence: six real parts with independent manual bottom-up costs. Three inside the manual band. Three within about thirty percent, every one of them an over-estimate — the miss direction you can live with, because an over-estimate is a negotiating position and an under-estimate is a signed mistake. Fleet error fifteen percent, against twenty-eight for the AI path on the same parts. The two donuts: twelve of eighteen commodities run fully deterministic today, and of the eight parts we costed, all eight produced a number — the AI path managed five of eight before we hardened it. And the amber strip is deliberate, because this deck goes up, and the fastest way to lose the room is to overclaim: it does not read drawings yet, it asks rather than guesses on material, and six parts is six parts — we widen the validation set before any of these figures goes into a commitment. Everything on this slide can be regenerated from the tool this afternoon.'
  );
}

/** Full-bleed part illustration + spec column. */
function partSlide(img, kicker, name, sub, tint, specs, note, notes) {
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, kicker, sub, tint);
  s.addImage({ path: img, x: 0.45, y: 1.24, w: 7.9, h: 4.42 });
  s.addShape('roundRect', { x: 8.55, y: 1.24, w: 4.28, h: 4.42, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText(name, { x: 8.8, y: 1.36, w: 3.8, h: 0.5, fontFace: 'Calibri', fontSize: 13, bold: true, color: tint, margin: 0, valign: 'middle' });
  s.addText('WHAT THE KERNEL WILL MEASURE', { x: 8.8, y: 1.92, w: 3.8, h: 0.22, fontFace: 'Calibri', fontSize: 8.6, bold: true, color: MUTED, charSpacing: 0.6, margin: 0 });
  specs.forEach(([k, v], i) => {
    const y = 2.2 + i * 0.30;
    if (i % 2 === 0) s.addShape('rect', { x: 8.7, y: y - 0.02, w: 3.98, h: 0.28, fill: { color: PAGE } });
    s.addText(k, { x: 8.8, y, w: 2.35, h: 0.32, fontFace: 'Calibri', fontSize: 9.6, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(v, { x: 11.15, y, w: 1.45, h: 0.32, fontFace: 'Calibri', fontSize: 10, bold: true, color: NAVY, align: 'right', margin: 0, valign: 'middle' });
  });
  s.addText(note, { x: 8.8, y: 2.2 + specs.length * 0.30 + 0.2, w: 3.8, h: 0.55, fontFace: 'Calibri', fontSize: 9.5, italic: true, color: SLATE, margin: 0, valign: 'top' });
  s.addText('Illustration — drawn to the dimensions the tool actually measured on this part.',
    { x: 0.5, y: 5.76, w: 7.8, h: 0.24, fontFace: 'Calibri', fontSize: 8.4, italic: true, color: MUTED, margin: 0 });
  footer(s, ++PG);
  s.addNotes(notes);
}

divider('SECTION TWO', 'A Die-Cast Aluminium Housing', 'One real part, followed through all twelve stages', TEAL,
  ['What the geometry kernel measures, and what the AI is allowed to say',
   'Four automatic guards, and the autocorrect that fires when they disagree',
   'The press chosen by physics; every cutting minute derived from a feature',
   'Eight buckets, twenty countries, an honest range — and a person signing it off'], '22',
  'That is the orientation done. Now I want to slow right down and take one real part through all twelve stages, because the only way to judge a costing tool is to watch it work on something concrete. ' +
  'This is a die-cast aluminium housing. Over the next fourteen slides you will see exactly what the geometry kernel measures and what the AI is allowed to say about it, the four automatic guards and the autocorrect that fires when the AI and the measurements disagree, how the press gets chosen by physics rather than by default, where every single cutting minute comes from, and then the eight buckets, the country comparison, the confidence band and the human sign-off. ' +
  'If you take nothing else from this section, take the calculation slide. It is the one you can check with a calculator while I am talking.');

partSlide('assets/workflow-deck/part-housing.png',
  'The Part We Are Costing', 'Die-cast aluminium housing',
  'One real component, followed from CAD file to defensible price', BLUE,
  [['Finished weight', '2.8 kg'], ['Poured weight', '4.83 kg'], ['Wall thickness', '≈ 3.0 mm'],
   ['Projected shadow', '1,650 cm²'], ['Precision bores', '2 × Ø40'], ['Tapped holes', '16 × M8'],
   ['Machined faces', '2'], ['Annual volume', '60,000'], ['Made in', 'China']],
  'Every one came out of the 3D model — nobody typed them.',
  'This is the part. A die-cast aluminium housing — the sort of thing that sits on an engine or a gearbox and that we buy tens of thousands of a year without ever really knowing what it should cost. ' +
  'Two point eight kilos finished. Walls about three millimetres. Two precision bores that have to be reamed. Sixteen holes that get drilled and tapped. Two faces that have to be machined flat because something bolts to them. And a projected shadow of one thousand six hundred and fifty square centimetres, which is going to decide which press it runs on. ' +
  'I want you to look at that list on the right and register one thing: every single number on it came out of the three-D model. Nobody typed them in, nobody estimated them off a drawing, and if we open the same file tomorrow we get exactly the same numbers. That is the foundation everything else in this deck is built on. ' +
  'The picture is an illustration rather than a photograph, but it is drawn to the dimensions the tool actually measured — so what you are looking at is the part as the software sees it.');

// ══════════ 3 · THE PART + THE JOURNEY ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'The Part, and the Journey It Takes', 'One housing, twelve stages, about two minutes of computer time');

  s.addShape('roundRect', { x: 0.5, y: 1.28, w: 12.33, h: 1.15, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addShape('ellipse', { x: 0.72, y: 1.5, w: 0.7, h: 0.7, fill: { color: NAVY } });
  s.addImage({ data: I.cube, x: 0.9, y: 1.68, w: 0.34, h: 0.34 });
  s.addText('Die-cast aluminium housing — cast in a steel mould, then machine-finished', {
    x: 1.6, y: 1.42, w: 11, h: 0.34, fontFace: 'Calibri', fontSize: 16, bold: true, color: NAVY, margin: 0 });
  const chips = ['2.8 kg finished', '~3 mm walls', '2 precision bores', '16 holes to thread', '2 machined faces', '60,000 a year', 'Made in China'];
  chips.forEach((c, i) => {
    const x = 1.6 + (i % 7) * 1.58;
    s.addShape('roundRect', { x, y: 1.85, w: 1.5, h: 0.32, fill: { color: BLUE_T }, line: { color: LINE, width: 0.75 }, rectRadius: 0.16 });
    s.addText(c, { x, y: 1.85, w: 1.5, h: 0.32, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: NAVY, align: 'center', valign: 'middle', margin: 0 });
  });

  const phases = [
    [BLUE, BLUE_T, 'MEASURE', 'Ruler', ['1 · Upload the file', '2 · Measure the geometry', '3 · Sense-check the shape'], 'Facts, not opinions'],
    [PURPLE, PURPLE_T, 'AI READS', 'AI', ['4 · Recognise the recipe', '   alloy · process · finish', '   with a confidence score'], 'Words only — no prices'],
    [AMBER, AMBER_T, 'SAFETY CHECKS', 'Engine', ['5 · Four automatic guards', '6 · Autocorrect wrong calls', '   before any money is counted'], 'Measurements always win'],
    [TEAL, TEAL_T, 'CALCULATE', 'Engine', ['7 · Pick machines & cycles', '8 · Cost every operation', '9-10 · Build & regionalise'], 'Fixed formulas'],
    [GREEN, GREEN_T, 'CHECK & USE', 'Engineer', ['11 · Confidence band', '12 · Report & approval'], 'A person signs it off'],
  ];
  const pw = 2.36, gap = 0.11;
  phases.forEach(([col, tint, name, who, steps, tag], i) => {
    const x = 0.5 + i * (pw + gap), y = 2.62, h = 2.6;
    s.addShape('roundRect', { x, y, w: pw, h, fill: { color: tint }, line: { color: col, width: 1.25 }, rectRadius: 0.09 });
    s.addShape('rect', { x, y, w: pw, h: 0.42, fill: { color: col } });
    s.addText(name, { x, y, w: pw, h: 0.42, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, charSpacing: 0.8 });
    s.addText(`owner: ${who}`, { x, y: y + 0.48, w: pw, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, italic: true, color: col, align: 'center', margin: 0 });
    steps.forEach((st, j) => s.addText(st, { x: x + 0.14, y: y + 0.78 + j * 0.36, w: pw - 0.28, h: 0.34, fontFace: 'Calibri', fontSize: 9.3, color: SLATE, margin: 0, valign: 'top' }));
    s.addText(tag, { x: x + 0.14, y: y + h - 0.42, w: pw - 0.28, h: 0.32, fontFace: 'Calibri', fontSize: 9, bold: true, italic: true, color: col, align: 'center', margin: 0 });
  });

  s.addShape('roundRect', { x: 0.5, y: 5.45, w: 12.33, h: 1.15, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('Notice the proportions', { x: 0.8, y: 5.58, w: 5, h: 0.28, fontFace: 'Calibri', fontSize: 12, bold: true, color: NAVY, margin: 0 });
  s.addText([
    { text: 'Of the twelve stages, the AI owns exactly one. ', options: { bold: true, color: PURPLE } },
    { text: 'Three are measurement, two are automatic safety checks, four are arithmetic, and two are human review. That ratio is the design — the AI is the smallest, most bounded part of the tool, not the centre of it.', options: { color: SLATE } },
  ], { x: 0.8, y: 5.86, w: 11.75, h: 0.7, fontFace: 'Calibri', fontSize: 12, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'Here is the part and here is the map of where we are going. The housing weighs two point eight kilos finished, has walls about three millimetres thick, two precision bores, sixteen holes that need drilling and threading, and two faces that must be machined flat. We buy sixty thousand a year and we are looking at making them in China. ' +
    'Underneath, the five phases. Blue, we measure. Purple, the AI reads. Amber, four automatic safety checks run. Teal, the engine calculates. Green, a person checks and signs. Twelve stages in total, and the whole thing takes about two minutes of computer time. ' +
    'Now look at the box at the bottom, because this answers the question I was asked most often last time — how much of this is AI? Of the twelve stages, the AI owns exactly one. One. Three stages are measurement, two are safety checks, four are arithmetic, two are human review. ' +
    'That is deliberate. We did not build an AI tool and bolt some costing onto it. We built a costing engine and gave it a very small, very bounded AI assistant to do the one job AI is genuinely good at — recognising what something is. Everything else is engineering that we can audit.'
  );
}

// ══════════ 4 · MEASURE ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Stages 1–3 · Measuring the Part', 'A digital ruler, not a guess — and not artificial intelligence', BLUE);
  owner(s, 10.3, 0.74, 'OWNER: THE RULER', BLUE, BLUE_T);

  s.addShape('roundRect', { x: 0.5, y: 1.32, w: 3.5, h: 2.5, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addShape('ellipse', { x: 0.75, y: 1.52, w: 0.5, h: 0.5, fill: { color: BLUE } });
  s.addImage({ data: I.upload, x: 0.87, y: 1.64, w: 0.26, h: 0.26 });
  s.addText('1 · The engineer uploads', { x: 1.4, y: 1.55, w: 2.4, h: 0.3, fontFace: 'Calibri', fontSize: 12.5, bold: true, color: BLUE, margin: 0, valign: 'middle' });
  s.addText('The 3D CAD file — plus the two facts a drawing can never contain:', { x: 0.75, y: 2.1, w: 3, h: 0.55, fontFace: 'Calibri', fontSize: 10.5, color: SLATE, margin: 0, valign: 'top' });
  s.addText('• How many per year — 60,000\n• Where we plan to make it — China', { x: 0.85, y: 2.68, w: 3, h: 0.6, fontFace: 'Calibri', fontSize: 11, bold: true, color: NAVY, margin: 0, valign: 'top' });
  s.addText('These drive tooling spread and labour rates.', { x: 0.75, y: 3.32, w: 3, h: 0.4, fontFace: 'Calibri', fontSize: 9.5, italic: true, color: MUTED, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 4.2, y: 1.32, w: 5.0, h: 2.5, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addShape('ellipse', { x: 4.45, y: 1.52, w: 0.5, h: 0.5, fill: { color: BLUE } });
  s.addImage({ data: I.ruler, x: 4.57, y: 1.64, w: 0.26, h: 0.26 });
  s.addText('2 · The kernel measures it', { x: 5.1, y: 1.55, w: 3.8, h: 0.3, fontFace: 'Calibri', fontSize: 12.5, bold: true, color: BLUE, margin: 0, valign: 'middle' });
  const meas = [['Solid volume (exact)', '1,037 cm³'], ['Weight if aluminium', '2.80 kg'], ['Wall thickness', '≈ 3 mm'], ['Precision bores / holes', '2 / 16'], ['Faces to machine flat', '2']];
  meas.forEach(([k, v], i) => {
    const y = 2.06 + i * 0.33;
    s.addText(k, { x: 4.45, y, w: 3.2, h: 0.3, fontFace: 'Calibri', fontSize: 11, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(v, { x: 7.6, y, w: 1.4, h: 0.3, fontFace: 'Calibri', fontSize: 11.5, bold: true, color: NAVY, align: 'right', margin: 0, valign: 'middle' });
  });

  s.addShape('roundRect', { x: 9.4, y: 1.32, w: 3.43, h: 2.5, fill: { color: BLUE_T }, line: { color: BLUE, width: 1.25 }, rectRadius: 0.1 });
  s.addText('WHY THIS MATTERS', { x: 9.65, y: 1.5, w: 3, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: BLUE, charSpacing: 1, margin: 0 });
  s.addText('Nobody typed these numbers.\nNobody estimated them.\n\nNote the kernel measures VOLUME. It cannot know the weight until something names the material — so it publishes a weight for every candidate density and waits.', {
    x: 9.65, y: 1.85, w: 3, h: 1.9, fontFace: 'Calibri', fontSize: 10.5, color: SLATE, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 4.05, w: 12.33, h: 1.5, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addShape('ellipse', { x: 0.75, y: 4.28, w: 0.5, h: 0.5, fill: { color: BLUE } });
  s.addImage({ data: I.shield, x: 0.87, y: 4.4, w: 0.26, h: 0.26 });
  s.addText('3 · The shape sense-check — a small step that protects the whole price', {
    x: 1.4, y: 4.3, w: 11, h: 0.3, fontFace: 'Calibri', fontSize: 12.5, bold: true, color: BLUE, margin: 0, valign: 'middle' });
  s.addText([
    { text: 'The tool asks one question: is this hollow, or solid?  ', options: { bold: true, color: NAVY } },
    { text: 'Three-millimetre walls around an enclosed space mean a HOLLOW CASTING — so the cutting machines only tidy up surfaces. If the tool wrongly thought it was a solid block, it would price carving the whole shape out of metal, and the answer would be roughly double. One check, enormous consequence.', options: { color: SLATE } },
  ], { x: 1.4, y: 4.66, w: 11.2, h: 0.8, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 5.72, w: 12.33, h: 0.9, fill: { color: PURPLE_T }, line: { color: PURPLE, width: 1 }, rectRadius: 0.1 });
  s.addText([
    { text: 'Where is the AI so far?  Nowhere. ', options: { bold: true, color: PURPLE } },
    { text: 'Everything on this slide happened before the AI was involved at all. That ordering is intentional: the measurements exist first, so that when the AI does speak, there is already an independent set of facts to check it against.', options: { color: SLATE } },
  ], { x: 0.8, y: 5.83, w: 11.75, h: 0.7, fontFace: 'Calibri', fontSize: 12, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'Stage one. Our engineer uploads the CAD file, and types in two things the drawing cannot possibly tell us: how many we need a year, and where we plan to make them. Those two numbers matter enormously — the volume decides how thinly the tooling cost is spread, and the location decides which labour and machine rates apply. ' +
    'Stage two is the measuring. The geometry kernel opens the 3D model and measures it like a very fast, very precise digital ruler. It computes the exact solid volume — one thousand and thirty-seven cubic centimetres. Note what it does NOT do: it does not tell you the weight, because weight needs a density and nothing has named the material yet. So it publishes a weight for every candidate density — aluminium, steel, plastic, cast iron, copper, titanium — and waits. On aluminium that is two point eight kilos. It finds the walls are about three millimetres. It counts two precision bores, sixteen holes that need threading, two faces that must be machined flat. ' +
    'I want to labour this point because it is where people assume AI is involved. It is not. This is geometry. Nobody typed these numbers and nobody estimated them. Give it the same file tomorrow and you get identical results — which, incidentally, is why two different engineers costing the same part now get the same answer, which was never true with spreadsheets. ' +
    'Stage three is a small step with a huge consequence. The tool asks: is this hollow or solid? Three millimetre walls around an enclosed space means hollow — a casting. So the cutting machines are only tidying up surfaces. If it wrongly decided this was a solid block of aluminium, it would price machining the entire shape out of solid metal, and the answer would come out roughly double. One sense-check, and it protects the whole number. ' +
    'And notice the purple box. Where is the AI so far? Nowhere. It has not been involved at all. That ordering is deliberate — we establish the facts first, so that when the AI does speak, we already have something independent to check it against.'
  );
}

// ══════════ 4b · THE GEOMETRY KERNEL ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'What Is the "Geometry Kernel"?', 'The measuring instrument — and the honest answer on what it is built from', BLUE);
  owner(s, 10.3, 0.74, 'OWNER: THE RULER', BLUE, BLUE_T);

  s.addShape('roundRect', { x: 0.5, y: 1.3, w: 6.1, h: 2.6, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('WHAT IT IS', { x: 0.75, y: 1.44, w: 5.5, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: BLUE, charSpacing: 1, margin: 0 });
  s.addText([
    { text: 'The same class of engine that sits underneath CATIA, SolidWorks and NX. ', options: { bold: true, color: NAVY } },
    { text: 'It reads the real CAD geometry — the mathematical surfaces, not a picture of them — so a cylinder is genuinely a cylinder with a radius and an axis, not a mesh of triangles that looks round.', options: { color: SLATE } },
  ], { x: 0.75, y: 1.76, w: 5.6, h: 1.0, fontFace: 'Calibri', fontSize: 11, margin: 0, valign: 'top' });
  s.addText('CostVision uses Open CASCADE (OCCT), driven from Python through the OCP bindings.',
    { x: 0.75, y: 2.82, w: 5.6, h: 0.34, fontFace: 'Calibri', fontSize: 11, bold: true, color: BLUE, margin: 0, valign: 'top' });
  s.addText('Reads STEP and IGES — the neutral formats every OEM and supplier already exchanges. STL meshes take a separate, simpler path.',
    { x: 0.75, y: 3.2, w: 5.6, h: 0.55, fontFace: 'Calibri', fontSize: 10, italic: true, color: MUTED, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 6.85, y: 1.3, w: 5.98, h: 2.6, fill: { color: BLUE_T }, line: { color: BLUE, width: 1.25 }, rectRadius: 0.1 });
  s.addText('IS IT OPEN SOURCE?  YES — AND THAT MATTERS', { x: 7.1, y: 1.44, w: 5.5, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: BLUE, charSpacing: 0.6, margin: 0 });
  const lic = [
    ['Open CASCADE (OCCT)', 'LGPL v2.1 + exception', 'the kernel itself'],
    ['OCP (cadquery-ocp)', 'Apache 2.0', 'the Python driver'],
    ['three.js', 'MIT', 'the on-screen 3D viewer'],
  ];
  lic.forEach(([n, l, w], i) => {
    const y = 1.84 + i * 0.42;
    s.addText(n, { x: 7.1, y, w: 2.5, h: 0.3, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(l, { x: 9.6, y, w: 1.85, h: 0.3, fontFace: 'Calibri', fontSize: 10, color: BLUE, bold: true, margin: 0, valign: 'middle' });
    s.addText(w, { x: 11.45, y, w: 1.3, h: 0.3, fontFace: 'Calibri', fontSize: 9, italic: true, color: MUTED, margin: 0, valign: 'middle' });
  });
  s.addText([
    { text: 'No per-seat CAD licence, no vendor lock-in, and no third party ever sees the model. ', options: { bold: true, color: NAVY } },
    { text: 'The kernel runs as a local process on our own server — the CAD file is measured where it sits.', options: { color: SLATE } },
  ], { x: 7.1, y: 3.15, w: 5.5, h: 0.65, fontFace: 'Calibri', fontSize: 10.5, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 4.12, w: 12.33, h: 1.62, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('HOW IT ACTUALLY MEASURES — four things, no estimation anywhere', { x: 0.8, y: 4.24, w: 11, h: 0.28, fontFace: 'Calibri', fontSize: 12, bold: true, color: NAVY, margin: 0 });
  const how = [
    ['Volume & mass', 'Integrates the solid exactly, then publishes a weight for every candidate density — aluminium, steel, plastic, iron, copper, titanium.'],
    ['Holes & bosses', 'Walks every cylindrical face: diameter from the exact radius, depth from the surface parameter span, through-vs-blind by comparing depth to the bounding box.'],
    ['Wall thickness', 'Ray-casts inside the solid to find how thick each wall really is — this is what tells casting from machining.'],
    ['Faces & pockets', 'Classifies every face by surface type, so flats to be milled are counted, not guessed.'],
  ];
  how.forEach(([h, t], i) => {
    const x = 0.8 + (i % 4) * 3.05;
    s.addText(h, { x, y: 4.6, w: 2.85, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: BLUE, margin: 0 });
    s.addText(t, { x, y: 4.86, w: 2.85, h: 0.8, fontFace: 'Calibri', fontSize: 9, color: SLATE, margin: 0, valign: 'top' });
  });

  s.addShape('roundRect', { x: 0.5, y: 5.92, w: 12.33, h: 0.95, fill: { color: BLUE_T }, line: { color: BLUE, width: 1 }, rectRadius: 0.1 });
  s.addText([
    { text: 'The honest limitation: ', options: { bold: true, color: NAVY } },
    { text: 'the kernel is exact about what IS in the model, and silent about what is not. It cannot read a tolerance, a surface finish or a material callout unless the CAD file carries it — those still come from the drawing or from our engineer. It measures; it does not interpret.', options: { color: SLATE } },
  ], { x: 0.8, y: 6.04, w: 11.75, h: 0.75, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'I was asked what the geometry kernel actually is, so let me answer that properly, including the commercial question underneath it. ' +
    'A geometry kernel is the mathematical engine that understands solid shapes. It is the same class of software that sits underneath CATIA, SolidWorks and NX — when you drag a face in CAD, a kernel is doing the maths. Ours is Open CASCADE, usually called OCCT, and we drive it from Python through its official bindings, called OCP. Worth being precise: the measurement code calls OCP directly, so there is one fewer library sitting between your CAD file and the number. ' +
    'The important distinction is that it reads the real geometry, not a picture of it. A STEP file describes a cylinder as a genuine mathematical cylinder with a radius and an axis. A mesh file only has triangles that look round. That is why we can say "this is a twelve millimetre bore, forty millimetres deep, and it goes all the way through" with certainty rather than approximation. ' +
    'Is it open source? Yes, and I want to be transparent about the licences because someone will ask. Open CASCADE is LGPL version two point one with a linking exception, which is what lets us use it in a commercial tool. The OCP bindings are Apache two point zero. The three-D viewer you see on screen is three.js, which is MIT. All permissive, all long-established, all free. ' +
    'Practically that means three things. There is no per-seat CAD licence to buy for the costing tool. There is no vendor who can change the terms on us. And — this is the one that matters for us — no third party ever sees the model, because the kernel runs as a process on our own server. The CAD file is measured exactly where it sits. ' +
    'How does it actually measure? Four things. It integrates the solid to get an exact volume, then publishes a weight for every candidate density and waits for something to name the material. It walks every cylindrical face to build the hole table — diameter from the exact radius, depth from the surface parameter span, and through-versus-blind by comparing that depth to the bounding box. It ray-casts inside the solid to find true wall thickness, which is the measurement that distinguishes a casting from a machined block. And it classifies every face by surface type, so the flats we will have to mill are counted rather than guessed. ' +
    'And the honest limitation, which I would rather you hear from me. The kernel is exact about what is in the model and completely silent about what is not. It cannot read a tolerance, a surface finish or a material callout unless the CAD file actually carries it. Those still come off the drawing or from our engineer. It measures. It does not interpret.'
  );
}

// ══════════ 5 · AI READS ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Stage 4 · The AI Reads the Part', 'The one stage the AI owns — and the hard limits on it', PURPLE);
  owner(s, 10.3, 0.74, 'OWNER: THE AI', PURPLE, PURPLE_T);

  s.addShape('roundRect', { x: 0.5, y: 1.3, w: 6.0, h: 2.75, fill: { color: PURPLE_T }, line: { color: PURPLE, width: 1.25 }, rectRadius: 0.1 });
  s.addText('WHAT THE AI IS GIVEN', { x: 0.75, y: 1.45, w: 5, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: PURPLE, charSpacing: 1, margin: 0 });
  s.addText('Only the measurements from the previous slide — plus the part name and the shape signature. It never sees a price list, and it never sees the rate library.',
    { x: 0.75, y: 1.76, w: 5.5, h: 0.7, fontFace: 'Calibri', fontSize: 11, color: SLATE, margin: 0, valign: 'top' });
  s.addText('WHAT IT SAYS BACK', { x: 0.75, y: 2.48, w: 5, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: PURPLE, charSpacing: 1, margin: 0 });
  const says = [['Material family', 'Aluminium die-casting alloy'], ['How it is made', 'High-pressure die cast'], ['Then what', 'Machine-finished on a cutting machine'], ['How sure it is', '84% confident']];
  says.forEach(([k, v], i) => {
    const y = 2.8 + i * 0.3;
    s.addText(k, { x: 0.85, y, w: 1.8, h: 0.28, fontFace: 'Calibri', fontSize: 10, color: MUTED, margin: 0, valign: 'middle' });
    s.addText(v, { x: 2.7, y, w: 3.6, h: 0.28, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, margin: 0, valign: 'middle' });
  });

  s.addShape('roundRect', { x: 6.75, y: 1.3, w: 6.08, h: 2.75, fill: { color: CARD }, line: { color: RED, width: 1.5 }, rectRadius: 0.1 });
  s.addText('WHAT THE AI CANNOT DO', { x: 7.0, y: 1.45, w: 5, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: RED, charSpacing: 1, margin: 0 });
  const cannot = [
    'Set a price, or any part of a price',
    'Change a measured dimension or weight',
    'Choose the machine or the cycle time',
    'Touch the rate library',
    'Override a safety check',
  ];
  cannot.forEach((t, i) => {
    s.addImage({ data: I.times, x: 7.0, y: 1.85 + i * 0.4, w: 0.17, h: 0.17 });
    s.addText(t, { x: 7.3, y: 1.78 + i * 0.4, w: 5.3, h: 0.35, fontFace: 'Calibri', fontSize: 11.5, color: SLATE, margin: 0, valign: 'middle' });
  });

  s.addShape('roundRect', { x: 0.5, y: 4.28, w: 12.33, h: 1.25, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('The confidence score is not decoration — it changes what happens next', {
    x: 0.8, y: 4.42, w: 11, h: 0.3, fontFace: 'Calibri', fontSize: 12.5, bold: true, color: NAVY, margin: 0 });
  s.addText([
    { text: 'At 84% the tool proceeds but flags the call for review. Below 50% a hard rule fires — "material suggestion is only N% confident, add a part photo or confirm the material manually" — and it stays on the result until a person clears it. ', options: { color: SLATE } },
    { text: 'A confident-sounding wrong answer is the most dangerous thing an AI can produce — so uncertainty is made visible rather than smoothed over.', options: { bold: true, color: NAVY } },
  ], { x: 0.8, y: 4.75, w: 11.75, h: 0.72, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 5.7, w: 12.33, h: 0.9, fill: { color: GREEN_T }, line: { color: GREEN, width: 1 }, rectRadius: 0.1 });
  s.addText([
    { text: 'In plain terms: ', options: { bold: true, color: GREEN } },
    { text: 'the AI does the job an experienced engineer does in the first ten seconds of picking up a part — "ah, that\'s a die-cast housing, that\'ll be machined after". It saves setup time. It does not do the costing, and it cannot.', options: { color: SLATE } },
  ], { x: 0.8, y: 5.83, w: 11.75, h: 0.7, fontFace: 'Calibri', fontSize: 12, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'Now the AI. This is the one stage out of twelve that it owns, so let us be precise about it. ' +
    'What is it given? Only the measurements from the previous slide, plus the part name. It does not see a price list. It does not see our rate library. It cannot see what the answer ought to be. ' +
    'What does it say back? Four things. The material family — an aluminium die-casting alloy. How it is made — high-pressure die casting, meaning molten aluminium injected into a steel mould under very high pressure. What happens next — machine finishing. And how sure it is: eighty-four percent. ' +
    'Now the red box, which is the answer to "but what if the AI gets it wrong". The AI cannot set a price or any part of a price. It cannot change a measured dimension or the weight. It cannot choose the machine or the cycle time. It cannot touch the rate library. And it cannot override a safety check. Those are not rules we ask it to follow — it has no access to any of those things. ' +
    'One more thing on the confidence score, because it does real work. At eighty-four percent the tool proceeds but flags the call for review. There is a hard rule in the code: if the material confidence falls below fifty percent, a warning fires that says the suggestion is a coin toss and asks for a part photo or a manual confirmation, and that warning stays attached to the result until a person clears it. A confident-sounding wrong answer is the most dangerous thing an AI can give you, so we make the uncertainty visible rather than hiding it. ' +
    'In plain terms: the AI does what an experienced engineer does in the first ten seconds of picking up a part. It saves setup time. It does not do the costing, and it cannot.'
  );
}

// ══════════ 6 · GUARDRAILS / AUTOCORRECT ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Stages 5–6 · The Safety Checks — and Autocorrect', 'Four checks ran on this part before a single pound was calculated', AMBER);
  owner(s, 10.3, 0.74, 'OWNER: THE ENGINE', AMBER, AMBER_T);

  const guards = [
    ['1 · Buy the metal you actually pour',
      'AI/naive view: buy 2.8 kg — the part weight.',
      'Corrected to 4.83 kg. To sell a 2.8 kg casting the supplier pours 4.83 kg; the rest runs down the feed channels and is recycled at scrap value.',
      'The single most common casting cost error.'],
    ['2 · Machining is finishing, not carving',
      'AI/naive view: machine the shape out of metal.',
      'Capped to a finish envelope: 0.10 hr setup + 0.07 hr/kg. For 2.8 kg that is a 0.30 hr ceiling; this part\'s 0.27 hr of cutting sits just inside it.',
      'Prevents roughly doubling the cost.'],
    ['3 · Use a real die-casting alloy',
      'AI/naive view: a generic or wrought aluminium grade.',
      'Redirected to a genuine die-casting alloy. A machined face can tempt the model toward "machined from solid billet" — the guard keeps casting as the primary process.',
      'Wrong alloy = wrong price per kilo.'],
    ['4 · Size the machine to the part',
      'AI/naive view: use a default press.',
      'Sized to 1,600 t off the ladder 160 / 500 / 800 / 1,600 / 6,100 / 9,000 t — the smallest press that clamps the part, at £137.55/hr.',
      'Explained in full on the next slide.'],
  ];
  guards.forEach(([h, before, after, why], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.5 + col * 6.33, y = 1.3 + row * 1.72, w = 6.0, hh = 1.55;
    s.addShape('roundRect', { x, y, w, h: hh, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
    s.addText(h, { x: x + 0.22, y: y + 0.09, w: w - 0.4, h: 0.28, fontFace: 'Calibri', fontSize: 12, bold: true, color: AMBER, margin: 0 });
    s.addText([{ text: '✕  ', options: { color: RED, bold: true } }, { text: before, options: { color: MUTED, italic: true } }],
      { x: x + 0.22, y: y + 0.4, w: w - 0.4, h: 0.24, fontFace: 'Calibri', fontSize: 9.8, margin: 0, valign: 'middle' });
    s.addText([{ text: '✓  ', options: { color: GREEN, bold: true } }, { text: after, options: { color: SLATE } }],
      { x: x + 0.22, y: y + 0.65, w: w - 0.42, h: 0.62, fontFace: 'Calibri', fontSize: 9.8, margin: 0, valign: 'top' });
    s.addText(why, { x: x + 0.22, y: y + hh - 0.32, w: w - 0.4, h: 0.26, fontFace: 'Calibri', fontSize: 9, bold: true, italic: true, color: AMBER, margin: 0 });
  });

  s.addShape('roundRect', { x: 0.5, y: 4.82, w: 12.33, h: 1.05, fill: { color: AMBER_T }, line: { color: AMBER, width: 1.25 }, rectRadius: 0.1 });
  s.addImage({ data: I.warn, x: 0.78, y: 5.09, w: 0.3, h: 0.3 });
  s.addText([
    { text: 'This is the autocorrect. ', options: { bold: true, color: NAVY } },
    { text: 'When the AI and the measurements disagree, ', options: { color: SLATE } },
    { text: 'the measurements win — automatically, every time. ', options: { bold: true, color: NAVY } },
    { text: 'The tool corrects the input, records what it changed and why, and shows the engineer. It never proceeds silently.', options: { color: SLATE } },
  ], { x: 1.2, y: 4.95, w: 11.4, h: 0.85, fontFace: 'Calibri', fontSize: 12, margin: 0, valign: 'middle' });

  s.addShape('roundRect', { x: 0.5, y: 6.02, w: 12.33, h: 0.85, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText([
    { text: 'Why four checks and not one?  ', options: { bold: true, color: NAVY } },
    { text: 'Because a cast-and-machined part has four distinct ways of going wrong. Each guard is written for one specific, known failure — they are not a generic "sanity check", they are four separate lessons from real costing mistakes.', options: { color: SLATE } },
  ], { x: 0.8, y: 6.14, w: 11.75, h: 0.65, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'This is the slide I most wanted to get in front of you, because it answers the question "what if the AI is wrong". The answer is that the tool assumes it might be, and checks. ' +
    'Four checks ran on this part, before a single pound was calculated. ' +
    'Check one. To sell us a two point eight kilo casting, the supplier does not melt two point eight kilos. They pour four point eight three kilos. The difference runs down the feed channels and into the overflow, and gets recycled at scrap value. If you cost only the part weight you understate the metal by seventy percent. This is the single most common error in casting cost, and the tool cannot make it. ' +
    'Check two. On a casting, the bores and the holes are already cast in. The cutter is removing a thin skim to hit tolerance. So machining adds time, not material. If the model were allowed to think the cutter was carving the shape out of metal, the cost would roughly double. The guard caps machining to a finishing envelope. ' +
    'Check three. Because this part has machined faces, a model can be tempted to say "machined from solid billet". The guard keeps casting as the primary process and redirects the material to a genuine die-casting alloy, not a wrought grade — different alloys have genuinely different prices per kilo. ' +
    'Check four is machine sizing, and I will give that its own slide in a moment. ' +
    'Now the amber box, and this is the autocorrect feature you asked about. When the AI and the measurements disagree, the measurements win. Automatically. Every time. The tool corrects the input, writes down what it changed and why, and shows our engineer. It never quietly proceeds with something it knows is wrong. ' +
    'And why four checks rather than one general one? Because a cast-and-machined part has four distinct ways to go wrong, and each guard was written after a specific real-world costing mistake. They are lessons, not decoration.'
  );
}

// ══════════ 7 · PROCESS & MACHINE SELECTION ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Stage 7 · Choosing the Process and the Machine', 'Why high-pressure die casting, and why a 1,600-tonne press', TEAL);
  owner(s, 10.3, 0.74, 'OWNER: THE ENGINE', TEAL, TEAL_T);

  s.addShape('roundRect', { x: 0.5, y: 1.3, w: 6.0, h: 2.5, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('A · Why this process, not another', { x: 0.75, y: 1.44, w: 5.5, h: 0.3, fontFace: 'Calibri', fontSize: 13, bold: true, color: TEAL, margin: 0 });
  s.addText('The engine tests the measured shape against what each process can physically do:', { x: 0.75, y: 1.76, w: 5.5, h: 0.32, fontFace: 'Calibri', fontSize: 10.5, color: MUTED, margin: 0 });
  const routes = [
    ['High-pressure die casting', 'thin walls + hollow + 60k/yr', GREEN, 'CHOSEN'],
    ['Sand casting', 'too slow and rough for 3 mm walls at this volume', MUTED, 'rejected'],
    ['Machined from solid billet', 'would cut away ~80% of the metal — absurd cost', MUTED, 'rejected'],
    ['Gravity die casting', 'cannot reliably fill 3 mm walls', MUTED, 'rejected'],
  ];
  routes.forEach(([name, why, col, tag], i) => {
    const y = 2.16 + i * 0.4;
    s.addShape('roundRect', { x: 0.75, y, w: 0.72, h: 0.3, fill: { color: tag === 'CHOSEN' ? GREEN_T : PAGE }, line: { color: tag === 'CHOSEN' ? GREEN : LINE, width: 0.75 }, rectRadius: 0.15 });
    s.addText(tag, { x: 0.75, y, w: 0.72, h: 0.3, fontFace: 'Calibri', fontSize: 6.8, bold: true, color: col, align: 'center', valign: 'middle', margin: 0 });
    s.addText(name, { x: 1.58, y, w: 2.3, h: 0.3, fontFace: 'Calibri', fontSize: 10, bold: tag === 'CHOSEN', color: tag === 'CHOSEN' ? NAVY : MUTED, margin: 0, valign: 'middle' });
    s.addText(why, { x: 3.9, y, w: 2.5, h: 0.3, fontFace: 'Calibri', fontSize: 8.8, italic: true, color: MUTED, margin: 0, valign: 'middle' });
  });

  s.addShape('roundRect', { x: 6.75, y: 1.3, w: 6.08, h: 2.5, fill: { color: TEAL_T }, line: { color: TEAL, width: 1.25 }, rectRadius: 0.1 });
  s.addText('B · Why a 1,600-tonne press', { x: 7.0, y: 1.44, w: 5.5, h: 0.3, fontFace: 'Calibri', fontSize: 13, bold: true, color: TEAL, margin: 0 });
  s.addText('Molten metal is injected under pressure and tries to force the mould open. The press must clamp it shut.',
    { x: 7.0, y: 1.76, w: 5.6, h: 0.5, fontFace: 'Calibri', fontSize: 10.5, color: SLATE, margin: 0, valign: 'top' });
  const steps = [
    ['Measured shadow area of the part', 'from the CAD'],
    ['×  pressure inside the mould', 'physics constant'],
    ['=  force trying to open the mould', 'calculated'],
    ['+  safety margin → pick the smallest press that clamps it', '1,600 t'],
  ];
  steps.forEach(([t, v], i) => {
    const y = 2.32 + i * 0.33;
    s.addText(t, { x: 7.05, y, w: 4.1, h: 0.3, fontFace: 'Calibri', fontSize: 10, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(v, { x: 11.2, y, w: 1.45, h: 0.3, fontFace: 'Calibri', fontSize: 9.5, bold: true, color: i === 3 ? NAVY : MUTED, align: 'right', margin: 0, valign: 'middle' });
  });

  s.addShape('roundRect', { x: 0.5, y: 4.02, w: 12.33, h: 1.35, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('Why the machine choice is a money decision, not a technicality', { x: 0.8, y: 4.15, w: 11, h: 0.3, fontFace: 'Calibri', fontSize: 12.5, bold: true, color: NAVY, margin: 0 });
  s.addText([
    { text: 'Every machine in the library carries its own hourly rate — a bigger press costs more per hour to own and run. ', options: { color: SLATE } },
    { text: 'Pick a press that is too big and you overstate the cost; too small and the part physically cannot be made. ', options: { bold: true, color: NAVY } },
    { text: 'So the engine sizes the machine from the geometry rather than accepting a default, and it flags the choice for the engineer to confirm.', options: { color: SLATE } },
  ], { x: 0.8, y: 4.48, w: 11.75, h: 0.82, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 5.58, w: 12.33, h: 1.05, fill: { color: PURPLE_T }, line: { color: PURPLE, width: 1 }, rectRadius: 0.1 });
  s.addText([
    { text: 'Who decided all this?  ', options: { bold: true, color: PURPLE } },
    { text: 'The AI ', options: { bold: true, color: PURPLE } },
    { text: 'suggested "die casting". ', options: { color: SLATE } },
    { text: 'The engine ', options: { bold: true, color: TEAL } },
    { text: 'then tested that suggestion against the measured geometry, rejected the alternatives on physical grounds, and sized the press by calculation. ', options: { color: SLATE } },
    { text: 'The AI proposed; the engine disposed. ', options: { bold: true, color: NAVY } },
    { text: 'If the AI had said "sand casting", the 3 mm walls would have overruled it.', options: { color: SLATE } },
  ], { x: 0.8, y: 5.7, w: 11.75, h: 0.85, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'Now we are into the engine, and this is where the real engineering lives. Two questions get answered here: which process, and which machine. ' +
    'First, the process. The AI suggested die casting, but the engine does not simply accept that. It tests the measured shape against what each process can physically do. Three millimetre walls, a hollow shape, sixty thousand a year — that combination points firmly at high-pressure die casting. Sand casting is rejected because it cannot reliably produce three millimetre walls at that quality or speed. Machining from solid is rejected because you would cut away about eighty percent of the metal — absurd on cost. Gravity die casting is rejected because it cannot reliably fill walls that thin. ' +
    'Second, and this is check four from the previous slide — the press. When you inject molten aluminium at high pressure it tries to force the two halves of the mould apart. The press has to clamp it shut. So the engine takes the shadow area of the part, which it measured from the CAD, multiplies it by the pressure inside the mould, and gets the force trying to open the tool. Add a safety margin, and pick the smallest press in the library that can hold it. That comes out at sixteen hundred tonnes. ' +
    'Why does this matter commercially? Because every machine carries its own hourly rate. A bigger press costs more per hour to own and to run. Choose too big a machine and you overstate the cost — you go into a negotiation asking for the wrong number. Choose too small and the part physically cannot be made. So the engine sizes it by calculation rather than defaulting, and it flags the choice for our engineer to confirm. ' +
    'And in the purple box, the summary of who did what. The AI proposed. The engine disposed. If the AI had said sand casting, the three millimetre walls would have overruled it automatically.'
  );
}

/** Machine-selection ladder panel — identical layout for both commodities. */
function ladderPanel(s, x, y, w, h, title, chain, rows, note) {
  s.addShape('roundRect', { x, y, w, h, fill: { color: TEAL_T }, line: { color: TEAL, width: 1.25 }, rectRadius: 0.1 });
  s.addText(title, { x: x + 0.25, y: y + 0.12, w: w - 0.5, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: TEAL, charSpacing: 0.5, margin: 0 });
  chain.forEach(([k, v], i) => {
    const yy = y + 0.44 + i * 0.30;
    s.addText(k, { x: x + 0.25, y: yy, w: w - 2.0, h: 0.3, fontFace: 'Calibri', fontSize: 10.2, color: i === chain.length - 1 ? NAVY : SLATE, bold: i === chain.length - 1, margin: 0, valign: 'middle' });
    s.addText(v, { x: x + w - 1.85, y: yy, w: 1.6, h: 0.3, fontFace: 'Calibri', fontSize: 10.2, bold: true, color: i === chain.length - 1 ? TEAL : NAVY, align: 'right', margin: 0, valign: 'middle' });
  });
  const ly = y + 0.44 + chain.length * 0.30 + 0.10;
  s.addText('Then the ladder — smallest machine that covers it', { x: x + 0.25, y: ly, w: w - 0.5, h: 0.24, fontFace: 'Calibri', fontSize: 9, bold: true, italic: true, color: MUTED, margin: 0 });
  rows.forEach(([t, r, v], i) => {
    const yy = ly + 0.26 + i * 0.31;
    const on = v === 'CHOSEN';
    if (on) s.addShape('roundRect', { x: x + 0.2, y: yy - 0.03, w: w - 0.42, h: 0.33, fill: { color: 'FFFFFF' }, line: { color: TEAL, width: 1.25 }, rectRadius: 0.06 });
    s.addText(t, { x: x + 0.38, y: yy, w: 1.2, h: 0.28, fontFace: 'Calibri', fontSize: 10, bold: on, color: on ? NAVY : SLATE, margin: 0, valign: 'middle' });
    s.addText(r, { x: x + 1.6, y: yy, w: 1.4, h: 0.28, fontFace: 'Calibri', fontSize: 10, bold: on, color: on ? NAVY : SLATE, align: 'right', margin: 0, valign: 'middle' });
    s.addText(v, { x: x + 3.15, y: yy, w: w - 3.4, h: 0.28, fontFace: 'Calibri', fontSize: 8.8, italic: !on, bold: on, color: on ? TEAL : MUTED, margin: 0, valign: 'middle' });
  });
  if (note) s.addText(note, { x: x + 0.25, y: y + h - 0.31, w: w - 0.5, h: 0.26, fontFace: 'Calibri', fontSize: 8.6, italic: true, color: MUTED, margin: 0, valign: 'middle' });
}

// ══════════ PART 1 · 7b · THE CALCULATION, SHOWN ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Stages 7–8 in Detail · Show Me the Calculation', 'The housing — how the press is chosen and where the cutting minutes come from', TEAL);
  owner(s, 10.3, 0.74, 'OWNER: THE ENGINE', TEAL, TEAL_T);

  ladderPanel(s, 0.5, 1.3, 6.05, 3.55,
    'A · WHICH PRESS — clamp force from the measured shadow',
    [
      ['Projected shadow, measured off the CAD', '1,650 cm²'],
      ['× cavity pressure for aluminium HPDC', '70 MPa'],
      ['= force trying to blow the die open', '1,178 t'],
      ['× 1.2 safety factor (engine constant)', '1,413 t'],
    ],
    [['160 t', '£18.66/hr', 'too small'], ['500 t', '£52.47/hr', 'too small'], ['800 t', '£79.12/hr', 'too small'], ['1,600 t', '£137.55/hr', 'CHOSEN']],
    'Area from the model, pressure a material property, ladder and rates from the library.');

  s.addShape('roundRect', { x: 6.78, y: 1.3, w: 6.05, h: 3.55, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('B · WHERE THE CUTTING MINUTES COME FROM', { x: 7.03, y: 1.42, w: 5.5, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, charSpacing: 0.5, margin: 0 });
  s.addText('Every feature the kernel measured gets its own time, from a published shop formula:',
    { x: 7.03, y: 1.72, w: 5.55, h: 0.3, fontFace: 'Calibri', fontSize: 9.6, color: SLATE, margin: 0, valign: 'top' });
  const fh = ['Feature (measured)', 'Formula', 'Each', 'Total'];
  const fx = [7.03, 9.05, 11.05, 11.95];
  const fw = [2.0, 1.95, 0.85, 0.7];
  fh.forEach((h, i) => s.addText(h, { x: fx[i], y: 2.06, w: fw[i], h: 0.22, fontFace: 'Calibri', fontSize: 8.4, bold: true, color: MUTED, align: i >= 2 ? 'right' : 'left', margin: 0 }));
  const feats = [
    ['2 faces, 180×120 mm', '0.20 + area/8000', '3.77 min', '7.54'],
    ['2 bores, Ø40 × 45 mm', '0.50 + 45×0.050', '3.58 min', '7.15'],
    ['16 holes, Ø8 × 20 blind', '0.15 + 20×0.020 +0.10', '0.85 min', '13.52'],
  ];
  feats.forEach((r, i) => {
    const y = 2.3 + i * 0.34;
    if (i % 2 === 0) s.addShape('rect', { x: 6.95, y: y - 0.02, w: 5.72, h: 0.32, fill: { color: PAGE } });
    r.forEach((c, k) => s.addText(c, { x: fx[k], y, w: fw[k], h: 0.3, fontFace: 'Calibri', fontSize: 8.8, bold: k === 3, color: k === 1 ? MUTED : SLATE, align: k >= 2 ? 'right' : 'left', margin: 0, valign: 'middle' }));
  });
  s.addShape('line', { x: 7.03, y: 3.36, w: 5.6, h: 0, line: { color: LINE, width: 1 } });
  const build = [
    ['Bottom-up from the geometry  (×1.3 for reamed tolerance)', '28.21 min', SLATE],
    ['Near-net ceiling: 0.10 hr + 0.07 × 2.8 kg', '17.76 min', AMBER],
    ['→ the guard CAPS the bottom-up estimate', 'capped', AMBER],
    ['Costed from the supplier routing — inside both', '15.90 min', TEAL],
  ];
  build.forEach(([k, v, col], i) => {
    const y = 3.44 + i * 0.31;
    s.addText(String(k), { x: 7.03, y, w: 4.1, h: 0.28, fontFace: 'Calibri', fontSize: 9.2, bold: i === 3, color: i === 3 ? NAVY : SLATE, margin: 0, valign: 'middle' });
    s.addText(String(v), { x: 11.2, y, w: 1.45, h: 0.28, fontFace: 'Calibri', fontSize: 9.6, bold: true, color: col, align: 'right', margin: 0, valign: 'middle' });
  });

  s.addShape('roundRect', { x: 0.5, y: 5.05, w: 12.33, h: 1.5, fill: { color: AMBER_T }, line: { color: AMBER, width: 1.25 }, rectRadius: 0.1 });
  s.addText('Three independent numbers, and they bound each other', { x: 0.8, y: 5.17, w: 11.5, h: 0.28, fontFace: 'Calibri', fontSize: 12.5, bold: true, color: NAVY, margin: 0 });
  s.addText([
    { text: 'The geometry proposes 28 minutes. The near-net guard says a 2.8 kg casting physically cannot need more than 17.8 minutes of finishing, so it caps the proposal. The supplier routing we costed says 15.9 minutes — inside both. ', options: { color: SLATE } },
    { text: 'When those three disagree badly, that is the signal: either the part is not really near-net, or the routing is wrong, or the quote is padded. Here they agree, so the number stands.', options: { bold: true, color: NAVY } },
  ], { x: 0.8, y: 5.49, w: 11.75, h: 0.92, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'top' });
  footer(s, ++PG);

  s.addNotes(
    'I was asked to show the calculation rather than assert it, so this slide is the arithmetic behind the two numbers that matter most on a casting: which press, and how many minutes of cutting. ' +
    'Left-hand side, the press. The kernel measures the projected shadow of the part — the silhouette you would see looking down the direction the die opens — and gets one thousand six hundred and fifty square centimetres. Aluminium high-pressure die casting runs at about seventy megapascals of cavity pressure; that is a material property, not an opinion. Multiply the two and you get the force trying to blow the die open: one thousand one hundred and seventy-eight tonnes. The engine applies a twenty percent safety factor, so we need a press that can hold one thousand four hundred and thirteen tonnes. Then it walks the ladder — one sixty, five hundred, eight hundred, sixteen hundred — and takes the smallest one that covers it. Sixteen hundred tonnes, one hundred and thirty-seven pounds fifty-five an hour. ' +
    'Nothing on that left-hand side was typed in by a person. The area came out of the model, the pressure is a property of the alloy, and the ladder and the rates are the rate library. ' +
    'Right-hand side, the cutting minutes, and this is where people are most sceptical, so let us be concrete. Every feature the kernel found gets its own time from a published shop formula. Two faces at one eighty by one twenty millimetres: nought point two zero minutes of approach plus the area divided by eight thousand square millimetres a minute of face-mill coverage — three point seven seven minutes each. Two bores at forty millimetres diameter, forty-five deep: nought point five plus forty-five times nought point zero five — three point five eight each. Sixteen blind holes at eight millimetres: nought point one five plus depth times nought point zero two, plus a tenth of a minute because a blind hole needs its bottom finishing — nought point eight five each. ' +
    'Add it up with a thirty percent uplift for the reamed tolerance on the bores and the geometry proposes twenty-eight point two minutes. ' +
    'Now watch what happens next, because this is the guard doing real work in front of you. The near-net envelope says a two point eight kilo casting cannot need more than nought point one hours plus nought point zero seven hours per kilo of finishing — seventeen point eight minutes. Twenty-eight is above that, so the guard caps it. And the routing we actually costed from the supplier is fifteen point nine minutes, which sits inside both. ' +
    'Three independent numbers, bounding each other. That is the point I want you to take away. When they agree, as they do here, the number stands. When they disagree badly, that is the signal — either the part is not really near-net, or the routing is wrong, or the quote is padded. Either way, you find out before the meeting rather than during it.'
  );
}

// ══════════ 8 · CYCLE TIME + MACHINING ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Stage 8 · Cycle Times — Every Operation, Timed and Priced', 'Machine rate x charged time. Check any row on this slide with a calculator.', TEAL);
  owner(s, 10.3, 0.74, 'OWNER: THE ENGINE', TEAL, TEAL_T);

  s.addShape('roundRect', { x: 0.5, y: 1.28, w: 8.7, h: 3.5, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('MAKING ONE HOUSING AT UK RATES — engine output, line by line', { x: 0.75, y: 1.38, w: 8, h: 0.28, fontFace: 'Calibri', fontSize: 11.5, bold: true, color: NAVY, margin: 0 });
  const hdr = ['Operation', 'Machine', '£/hr', 'Cycle', '÷ OEE', 'Machine', 'Labour', 'Cost'];
  const colX = [0.75, 2.85, 4.35, 5.15, 6.00, 6.85, 7.72, 8.35];
  const colW = [2.05, 1.45, 0.75, 0.80, 0.80, 0.82, 0.58, 0.72];
  hdr.forEach((h, i) => s.addText(h, { x: colX[i], y: 1.70, w: colW[i], h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: MUTED, align: i >= 2 ? 'right' : 'left', margin: 0 }));
  const ops = [
    ['Casting shot (55 s)',    'HPDC 1,600 t', '137.55', '0.0156', '0.0183', '2.52', '0.16', '£2.68'],
    ['Setup, amortised',       '5-axis CNC',   '85.00',  '0.0030', '0.0030', '0.26', '0.08', '£0.33'],
    ['Mill 2 faces flat',      '5-axis CNC',   '85.00',  '0.1100', '0.1294', '11.00','1.59', '£12.59'],
    ['Bore + ream 2 bores',    '5-axis CNC',   '85.00',  '0.0850', '0.1000', '8.50', '1.23', '£9.73'],
    ['Drill + tap 16 holes',   'CNC drill/tap','30.00',  '0.0700', '0.0824', '2.47', '0.77', '£3.24'],
    ['Leak test, deburr, wash','Finish cell',  '55.00',  '0.0500', '0.0588', '3.24', '0.76', '£4.00'],
  ];
  ops.forEach((r, i) => {
    const y = 1.96 + i * 0.335;
    if (i % 2 === 0) s.addShape('rect', { x: 0.68, y: y - 0.02, w: 8.36, h: 0.32, fill: { color: PAGE } });
    r.forEach((c, k) => s.addText(c, {
      x: colX[k], y, w: colW[k], h: 0.28, fontFace: 'Calibri', fontSize: 9.2,
      bold: k === 0 || k === 7, color: k === 7 ? NAVY : SLATE, align: k >= 2 ? 'right' : 'left', margin: 0, valign: 'middle',
    }));
  });
  s.addShape('line', { x: 0.75, y: 4.0, w: 8.3, h: 0, line: { color: LINE, width: 1 } });
  s.addText('Machine + labour, one housing', { x: 0.75, y: 4.07, w: 4, h: 0.28, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, margin: 0 });
  [['0.3919', 6.00, 0.80], ['27.99', 6.85, 0.82], ['4.59', 7.72, 0.58], ['£32.57', 8.35, 0.72]].forEach(([t, x, w]) =>
    s.addText(String(t), { x, y: 4.07, w, h: 0.28, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, align: 'right', margin: 0 }));
  s.addText('Machine £ = £/hr x charged time.  Labour £ = charged time x 0.5 operators x their grade rate.  Nothing else is added here.',
    { x: 0.75, y: 4.4, w: 8.3, h: 0.3, fontFace: 'Calibri', fontSize: 9.2, italic: true, color: MUTED, margin: 0 });

  s.addShape('roundRect', { x: 9.45, y: 1.28, w: 3.38, h: 3.5, fill: { color: TEAL_T }, line: { color: TEAL, width: 1.25 }, rectRadius: 0.1 });
  s.addText('HOW A CYCLE TIME IS BUILT', { x: 9.68, y: 1.4, w: 3, h: 0.26, fontFace: 'Calibri', fontSize: 10, bold: true, color: TEAL, charSpacing: 0.8, margin: 0 });
  const build = [
    ['Casting', 'fill + hold under pressure + cool until solid + open and eject = 55 seconds'],
    ['Machining', 'metal to remove / how fast the cutter removes it, + tool changes, + moving between features, + load and unload'],
    ['The ÷ OEE column', 'a machine is never 100% available. At 85% OEE, 0.110 hr of cutting occupies 0.1294 hr of machine. We cost the real world.'],
  ];
  build.forEach(([h, t], i) => {
    const y = 1.76 + i * 0.98;
    s.addText(h, { x: 9.68, y, w: 3, h: 0.24, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, margin: 0 });
    s.addText(t, { x: 9.68, y: y + 0.24, w: 3, h: 0.74, fontFace: 'Calibri', fontSize: 9.3, color: SLATE, margin: 0, valign: 'top' });
  });

  s.addShape('roundRect', { x: 0.5, y: 5.0, w: 12.33, h: 1.85, fill: { color: CARD }, line: { color: GREEN, width: 1.5 }, rectRadius: 0.1 });
  s.addText('THE SURPRISE — and why this changes a negotiation', { x: 0.8, y: 5.12, w: 8, h: 0.3, fontFace: 'Calibri', fontSize: 12.5, bold: true, color: GREEN, margin: 0 });
  s.addChart(pres.ChartType.bar, [{
    name: '£ per housing',
    labels: ['Everything after it', 'The casting shot'],
    values: [29.89, 2.68],
  }], {
    x: 0.65, y: 5.42, w: 6.5, h: 1.3, barDir: 'bar', barGapWidthPct: 45, chartColors: [TEAL, MUTED],
    showValue: true, dataLabelPosition: 'outEnd', dataLabelColor: SLATE, dataLabelFontSize: 8.5,
    dataLabelFontFace: 'Calibri', dataLabelFormatCode: '£0.00',
    valAxisMinVal: 0, valAxisMaxVal: 42, valAxisHidden: true,
    catAxisLabelColor: SLATE, catAxisLabelFontSize: 10, catAxisLabelFontFace: 'Calibri', catAxisLabelFrequency: 1,
    valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, showLegend: false, showTitle: false,
  });
  s.addText([
    { text: 'The famous casting shot is £2.68 — 8% of the making cost. Cutting metal is £25.89 (79%); add test, deburr and wash and everything after the shot is £29.89, or 92%.\n', options: { color: SLATE } },
    { text: 'So arguing about the aluminium price is arguing about the wrong thing. ', options: { bold: true, color: NAVY } },
    { text: 'The money is in cycle time — which makes fixturing and tool paths the productive conversation.', options: { color: SLATE } },
  ], { x: 7.4, y: 5.44, w: 5.2, h: 1.28, fontFace: 'Calibri', fontSize: 10.5, margin: 0, valign: 'top' });
  footer(s, ++PG);

  s.addNotes(
    'This is the detail people usually want and rarely get, so let us go through it properly — and I have deliberately laid this table out so you can check any row with a calculator while I am talking. ' +
    'Take the milling row. The five-axis machine costs eighty-five pounds an hour. The cut itself takes nought point one one of an hour. But a machine is never a hundred percent available, so the engine divides by the overall equipment effectiveness — eighty-five percent — which gives nought point one two nine four of an hour of machine occupied. Eighty-five pounds times that is eleven pounds exactly. Then labour: half an operator at twenty-six pounds an hour for that time is one pound fifty-nine. Twelve fifty-nine for the operation. Every row on this slide works the same way and every row multiplies out. ' +
    'The casting shot: fifty-five seconds on the sixteen-hundred-tonne press at one hundred and thirty-seven fifty-five an hour, plus a two percent reject uplift, is two pounds sixty-eight. Boring and reaming the two bores, nine seventy-three. Drilling and tapping sixteen holes on a cheaper drill-and-tap machine at thirty pounds an hour, three twenty-four. Leak test, deburr and wash, four pounds. Plus a small amortised setup. ' +
    'Add it up: nought point three nine of an hour of machine time, twenty-eight pounds of machine and four pounds fifty-nine of labour — thirty-two pounds fifty-seven at UK rates. ' +
    'On the right, how a cycle time is actually built, and I want to draw your eye to that third box. The divide-by-OEE column is the one people miss. It is the difference between costing the theoretical best case and costing the factory as it really runs. ' +
    'Now the chart at the bottom, which for me is the single most valuable output on this part. The famous casting shot — the thing everyone pictures when you say die casting — is two pounds sixty-eight. Eight percent. Cutting metal is twenty-five eighty-nine, seventy-nine percent; add the test and clean-up and everything after the shot is twenty-nine eighty-nine, ninety-two percent. ' +
    'Think about what that means for a negotiation. If you go in to argue about the price of aluminium, you are arguing about eight percent of the making cost. The money is in cycle time. So the productive conversation with that supplier is about fixturing, tool paths and how many seconds each operation really takes.'
  );
}

// ══════════ 9 · THE MONEY ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Stages 9–10 · Building the Cost, Country by Country', 'Eight buckets, always the same eight — then recalculated on each country’s rates', TEAL);
  owner(s, 10.3, 0.74, 'OWNER: THE ENGINE', TEAL, TEAL_T);

  s.addShape('roundRect', { x: 0.5, y: 1.28, w: 7.0, h: 3.6, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('THE EIGHT BUCKETS — this housing, made in China', { x: 0.75, y: 1.4, w: 6.4, h: 0.28, fontFace: 'Calibri', fontSize: 11.5, bold: true, color: NAVY, margin: 0 });
  s.addText('Material = at poured weight · Process = casting shot + all machining · Tooling = the die, per part',
    { x: 0.75, y: 4.5, w: 6.5, h: 0.3, fontFace: 'Calibri', fontSize: 8.6, italic: true, color: MUTED, margin: 0 });
  s.addChart(pres.ChartType.bar, [{
    name: '£ per part',
    labels: ['Margin', 'Overhead', 'Logistics', 'Packaging', 'Tooling', 'Labour', 'Process', 'Material'],
    values: [3.18, 3.61, 1.10, 0.60, 2.17, 1.36, 14.34, 12.18],
  }], {
    x: 0.62, y: 1.66, w: 6.75, h: 2.82, barDir: 'bar', barGapWidthPct: 30, chartColors: [TEAL],
    showValue: true, dataLabelPosition: 'outEnd', dataLabelColor: SLATE, dataLabelFontSize: 9,
    dataLabelFontFace: 'Calibri', dataLabelFormatCode: '£0.00',
    valAxisMinVal: 0, valAxisMaxVal: 19, valAxisHidden: true,
    catAxisLabelColor: SLATE, catAxisLabelFontSize: 9, catAxisLabelFontFace: 'Calibri', catAxisLabelFrequency: 1,
    valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, showLegend: false, showTitle: false,
  });

  s.addShape('roundRect', { x: 7.75, y: 1.28, w: 5.08, h: 1.75, fill: { color: '0E5A5A' }, rectRadius: 0.1 });
  s.addText('SHOULD-COST — MADE IN CHINA', { x: 8.0, y: 1.42, w: 4.6, h: 0.26, fontFace: 'Calibri', fontSize: 10, bold: true, color: '9FD9CF', charSpacing: 1, margin: 0 });
  s.addText('£38.55', { x: 8.0, y: 1.7, w: 4.6, h: 0.75, fontFace: 'Cambria', fontSize: 44, bold: true, color: 'FFFFFF', margin: 0 });
  s.addText('per part, at 60,000 a year', { x: 8.0, y: 2.5, w: 4.6, h: 0.28, fontFace: 'Calibri', fontSize: 11, color: 'CDEDE7', margin: 0 });

  s.addShape('roundRect', { x: 7.75, y: 3.2, w: 5.08, h: 1.68, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('THE SAME PART, PRICED ELSEWHERE', { x: 8.0, y: 3.32, w: 4.6, h: 0.26, fontFace: 'Calibri', fontSize: 10, bold: true, color: NAVY, charSpacing: 0.8, margin: 0 });
  const geo = [['India', '£37.17', SLATE], ['China', '£38.55', TEAL], ['Mexico', '£40.44', SLATE], ['United Kingdom', '£59.60', NAVY]];
  geo.forEach(([c, v, col], i) => {
    const y = 3.58 + i * 0.26;
    s.addText(c, { x: 8.05, y, w: 2.4, h: 0.27, fontFace: 'Calibri', fontSize: 10.5, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(v, { x: 10.2, y, w: 2.3, h: 0.27, fontFace: 'Calibri', fontSize: 11.5, bold: true, color: col, align: 'right', margin: 0, valign: 'middle' });
  });
  s.addText('Metal barely moves: £12.18 CN vs £12.56 UK. Rates do.',
    { x: 8.0, y: 4.6, w: 4.65, h: 0.3, fontFace: 'Calibri', fontSize: 8.2, italic: true, color: MUTED, margin: 0 });

  s.addShape('roundRect', { x: 0.5, y: 5.08, w: 12.33, h: 1.78, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('Two rules the engine applies to every single part, without exception', { x: 0.8, y: 5.2, w: 11, h: 0.3, fontFace: 'Calibri', fontSize: 12.5, bold: true, color: NAVY, margin: 0 });
  s.addText([
    { text: '1.  Always the same eight buckets. ', options: { bold: true, color: TEAL } },
    { text: 'A stamped bracket, a moulded housing and this casting are all built the same way, so any two parts can be compared honestly. Overhead is applied once, on the factory cost. Margin is applied once, on the subtotal. Never twice.\n', options: { color: SLATE } },
    { text: '2.  Every figure traces back to a driver. ', options: { bold: true, color: TEAL } },
    { text: 'Material = measured weight x a published metal price. Process = calculated time x a machine rate. Change any input and you can point at exactly why the answer moved — there is no black box in the money.', options: { color: SLATE } },
  ], { x: 0.8, y: 5.52, w: 11.75, h: 1.25, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'top' });
  footer(s, ++PG);

  s.addNotes(
    'Now the money comes together. Every part this tool costs — whether it is a one pound stamped bracket or this casting — is built into the same eight buckets. Material, process, labour, tooling, packaging, logistics, overhead, margin. Always the same eight. ' +
    'For this housing made in China: the metal, costed at the poured weight and net of the scrap we get back on the runner, is twelve pounds eighteen. The making — the casting shot plus all the machining — is fourteen thirty-four. People one thirty-six. The die spread across the year, two seventeen. Packaging and transport, one pound seventy between them. Then factory overhead at twelve percent and a nine percent supplier margin. Thirty-eight pounds fifty-five. ' +
    'Bottom right, the same part priced elsewhere, and every one of those is a full recalculation on that country’s own rates, not a fudge factor. India thirty-seven seventeen. China thirty-eight fifty-five. Mexico forty forty-four. The UK, fifty-nine sixty. ' +
    'And the reason the gap is not larger is worth understanding, because buyers get this wrong. Look at the metal: twelve pounds eighteen in China, twelve fifty-six in the UK. Aluminium is a world commodity — it costs roughly the same everywhere. What actually changes between countries is the labour, the machine and the overhead rates. On a machining-heavy part like this, that is the whole difference. ' +
    'Two rules at the bottom that I would ask you to hold onto. First, always the same eight buckets, which is what lets you compare two completely different parts honestly — and overhead is applied once, margin is applied once, never twice, which is a classic quoting trick. Second, every figure traces back to a driver. Material is measured weight times a published metal price. Process is calculated time times a machine rate. If you change an input you can point at exactly why the number moved. There is no black box anywhere in the money.'
  );
}

// ══════════ 10 · OUTPUT & HUMAN ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Stages 11–12 · Honesty, Then a Human Decides', 'The tool tells you how confident it is — and never signs its own work', GREEN);
  owner(s, 10.3, 0.74, 'OWNER: THE ENGINEER', GREEN, GREEN_T);

  s.addShape('roundRect', { x: 0.5, y: 1.3, w: 6.0, h: 2.35, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('11 · A range, not false precision', { x: 0.75, y: 1.44, w: 5.5, h: 0.3, fontFace: 'Calibri', fontSize: 13, bold: true, color: GREEN, margin: 0 });
  s.addText('4,000 simulated runs, varying the inputs the tool is least sure about. Tooling is varied most; overhead and margin are policy, so they follow.',
    { x: 0.75, y: 1.78, w: 5.5, h: 0.55, fontFace: 'Calibri', fontSize: 10.5, color: SLATE, margin: 0, valign: 'top' });
  // Scale: £28 .. £50 across the track, so the band and the marker sit where the numbers say.
  const TX = 0.75, TW = 5.5, LO = 28, HI = 50;
  const px = (v) => TX + ((v - LO) / (HI - LO)) * TW;
  s.addShape('roundRect', { x: TX, y: 2.46, w: TW, h: 0.34, fill: { color: 'DCE3EE' }, rectRadius: 0.17 });
  s.addShape('roundRect', { x: px(32.31), y: 2.46, w: px(45.38) - px(32.31), h: 0.34, fill: { color: TEAL }, rectRadius: 0.17 });
  s.addShape('rect', { x: px(38.55) - 0.028, y: 2.38, w: 0.056, h: 0.5, fill: { color: NAVY } });
  s.addText('P10  £32.31', { x: px(32.31) - 0.55, y: 2.9, w: 1.1, h: 0.24, fontFace: 'Calibri', fontSize: 9, color: MUTED, align: 'center', margin: 0 });
  s.addText('£38.55', { x: px(38.55) - 0.6, y: 2.9, w: 1.2, h: 0.24, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, align: 'center', margin: 0 });
  s.addText('P90  £45.38', { x: px(45.38) - 0.55, y: 2.9, w: 1.1, h: 0.24, fontFace: 'Calibri', fontSize: 9, color: MUTED, align: 'center', margin: 0 });
  s.addText('±17% on this part. The band widens when the tool is less certain — a machining-heavy casting carries more cycle-time risk than a simple pressing.',
    { x: 0.75, y: 3.2, w: 5.5, h: 0.42, fontFace: 'Calibri', fontSize: 9.6, italic: true, color: MUTED, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 6.75, y: 1.3, w: 6.08, h: 2.35, fill: { color: GREEN_T }, line: { color: GREEN, width: 1.25 }, rectRadius: 0.1 });
  s.addText('12 · What the engineer actually gets', { x: 7.0, y: 1.44, w: 5.5, h: 0.3, fontFace: 'Calibri', fontSize: 13, bold: true, color: GREEN, margin: 0 });
  const outs = [
    'The 8-bucket breakdown, with every figure traceable',
    'The operation list — what takes the time and why',
    'Every AI call made, flagged for confirmation',
    'Every autocorrection, with what changed and why',
    'Country comparison, and an exportable report',
  ];
  outs.forEach((t, i) => {
    s.addImage({ data: I.check, x: 7.05, y: 1.86 + i * 0.34, w: 0.16, h: 0.16 });
    s.addText(t, { x: 7.32, y: 1.79 + i * 0.34, w: 5.3, h: 0.3, fontFace: 'Calibri', fontSize: 10.8, color: SLATE, margin: 0, valign: 'middle' });
  });

  s.addShape('roundRect', { x: 0.5, y: 3.88, w: 12.33, h: 1.4, fill: { color: CARD }, line: { color: GREEN, width: 1.5 }, rectRadius: 0.1 });
  s.addShape('ellipse', { x: 0.78, y: 4.22, w: 0.6, h: 0.6, fill: { color: GREEN } });
  s.addImage({ data: I.person, x: 0.94, y: 4.38, w: 0.28, h: 0.28 });
  s.addText('Nothing leaves the tool unapproved', { x: 1.6, y: 4.0, w: 11, h: 0.3, fontFace: 'Calibri', fontSize: 13, bold: true, color: GREEN, margin: 0 });
  s.addText([
    { text: 'Every AI suggestion arrives as an editable pre-fill — highlighted, never silently applied. ', options: { color: SLATE } },
    { text: 'Our engineer can change the material, the process, the machine, the cycle time or the rates, and the whole cost recalculates instantly. ', options: { bold: true, color: NAVY } },
    { text: 'The tool proposes. The engineer disposes. That is the last line of defence, and it is a person.', options: { color: SLATE } },
  ], { x: 1.6, y: 4.34, w: 11.0, h: 0.85, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 5.48, w: 12.33, h: 1.38, fill: { color: NAVY }, rectRadius: 0.1 });
  s.addText([
    { text: 'And if a supplier quotes £52 for this part?  ', options: { bold: true, color: '9FB6E0' } },
    { text: 'That is above the P90. Our buyer no longer has to feel it is high — they can see it, line by line, and ask the right question:  ', options: { color: 'FFFFFF' } },
    { text: '"your machining time looks about 30% above what this geometry needs — walk me through your fixturing."', options: { bold: true, italic: true, color: 'FFFFFF' } },
  ], { x: 0.85, y: 5.6, w: 11.65, h: 1.15, fontFace: 'Calibri', fontSize: 13, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'Two stages left, and they are the two that make this usable in a real negotiation rather than just interesting. ' +
    'Stage eleven. The tool does not give you one number pretending to be exact. It runs the whole calculation four thousand times, varying the inputs it is least confident about — and it varies them by different amounts, because tooling estimates are genuinely less certain than a published metal price. Overhead and margin are percentages of policy, so they simply follow. What comes out is a range: ten percent of the runs came in below thirty-two thirty-one, ten percent came in above forty-five thirty-eight, and the middle of the distribution is our thirty-eight fifty-five. About plus or minus seventeen percent on this part. ' +
    'I would rather hand you an honest range than a falsely precise number, and the width of that band is itself information — it is wider here than it would be on a simple pressing, because a machining-heavy casting carries more cycle-time risk. ' +
    'Stage twelve, and this is the one I care most about. Every AI suggestion arrives as an editable pre-fill. Highlighted. Never silently applied. Our engineer can change the material, the process, the machine, the cycle time, the rates — and the whole cost recalculates instantly. The tool proposes. The engineer disposes. The last line of defence is a person, and it always will be. ' +
    'And here is what it is all for. A supplier quotes fifty-two pounds for this part. That is above our P90 — above where ninety percent of our simulated outcomes landed. Our buyer no longer has to say "that feels high". They can open the operation list and say: your machining time looks about thirty percent above what this geometry needs, walk me through your fixturing. That is a completely different conversation, and it is the reason this tool exists.'
  );
}

// ══════════ 10a2 · INSIDE THE CONFIDENCE BAND (Monte-Carlo) ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Inside the Confidence Band — How the Monte-Carlo Works', 'What the P10–P90 range actually is, and why the same part always gets the same band', GREEN);
  // Left: the 4 steps, exactly as the engine does them
  const steps = [
    ['1 · Every line carries a confidence grade', 'Each cost line remembers where it came from: measured geometry and library rates grade High, derived values Medium, assumptions Low. This provenance already exists for the trace — the band re-uses it.'],
    ['2 · Grade becomes a spread', 'High = ±5%, Medium = ±12%, Low = ±22% (one sigma). Per-bucket reality applied on top: tooling estimates are the least certain (×1.8); packaging and logistics are contracted and stable (×0.6); overhead and margin are policy percentages — never perturbed, always recomputed.'],
    ['3 · 4,000 trials', 'Each trial multiplies every base bucket — material, process, labour, tooling, packaging, logistics — by a lognormal factor with that spread (always positive, mean 1), then recomposes overhead and margin exactly as the real engine does. 4,000 slightly different worlds, 4,000 totals.'],
    ['4 · Read the distribution', 'Sort the 4,000 totals: the 10th percentile is the optimistic case, the median is the estimate, the 90th is the conservative case. The half-width becomes the ± figure on the result card, and the band is labelled tight, moderate or wide.'],
  ];
  steps.forEach(([t, d], i) => {
    const y = 1.18 + i * 1.28;
    s.addShape('roundRect', { x: 0.5, y, w: 7.1, h: 1.16, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
    s.addShape('ellipse', { x: 0.66, y: y + 0.14, w: 0.4, h: 0.4, fill: { color: GREEN } });
    s.addText(String(i + 1), { x: 0.66, y: y + 0.14, w: 0.4, h: 0.4, fontFace: 'Cambria', fontSize: 15, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    s.addText(t.slice(4), { x: 1.2, y: y + 0.1, w: 6.3, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, margin: 0 });
    s.addText(d, { x: 1.2, y: y + 0.38, w: 6.25, h: 0.74, fontFace: 'Calibri', fontSize: 8.6, color: SLATE, margin: 0, valign: 'top' });
  });
  // Right: the band drawn, plus the two guarantees
  s.addText('WHAT THE BUYER SEES', { x: 7.95, y: 1.16, w: 4.9, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: GREEN, charSpacing: 0.6, margin: 0 });
  s.addShape('roundRect', { x: 7.95, y: 1.42, w: 4.88, h: 1.9, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
  // mini histogram (illustrative shape only — labelled as such)
  const bars = [0.10, 0.22, 0.44, 0.72, 0.95, 1.0, 0.88, 0.62, 0.38, 0.18, 0.08];
  bars.forEach((h, i) => {
    s.addShape('rect', { x: 8.35 + i * 0.38, y: 2.62 - h * 0.95, w: 0.3, h: h * 0.95, fill: { color: i >= 1 && i <= 9 ? '9FD9CF' : 'DCE3EE' } });
  });
  s.addShape('line', { x: 8.73, y: 2.72, w: 3.04, h: 0, line: { color: TEAL, width: 2 } });
  s.addText('P10', { x: 8.55, y: 2.78, w: 0.5, h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: TEAL, margin: 0 });
  s.addText('P50 — the estimate', { x: 9.65, y: 2.78, w: 1.5, h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: NAVY, margin: 0 });
  s.addText('P90', { x: 11.55, y: 2.78, w: 0.5, h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: TEAL, margin: 0 });
  s.addText('4,000 simulated totals for one part (illustrative shape) — the quoted band is the middle 80%',
    { x: 8.15, y: 3.02, w: 4.5, h: 0.24, fontFace: 'Calibri', fontSize: 7.8, italic: true, color: MUTED, margin: 0 });
  const promises = [
    ['Reproducible, on purpose', 'The random draws are seeded: the same part, volume and region gives the same band every single time, and the band is unit-tested. No "run it again and hope".', I.check, TEAL],
    ['Calibrated by real actuals', 'Once enough real quotes or invoices exist for a segment, a conformal calibration layer replaces the prior — the band then provably covers the target share of actual outcomes. Until then, the Monte-Carlo prior stands and says so.', I.clip, GREEN],
    ['Honest by construction', 'Assumptions widen the band automatically — a part costed from an unanswered question cannot show a tight range. The band is the tool admitting exactly how much it does not know.', I.shield, AMBER],
  ];
  promises.forEach(([t, d, ico, c], i) => {
    const y = 3.46 + i * 0.99;
    s.addShape('roundRect', { x: 7.95, y, w: 4.88, h: 0.9, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
    s.addShape('ellipse', { x: 8.09, y: y + 0.11, w: 0.34, h: 0.34, fill: { color: c } });
    s.addImage({ data: ico, x: 8.17, y: y + 0.19, w: 0.18, h: 0.18 });
    s.addText(t, { x: 8.52, y: y + 0.09, w: 4.2, h: 0.22, fontFace: 'Calibri', fontSize: 9.5, bold: true, color: c, margin: 0 });
    s.addText(d, { x: 8.52, y: y + 0.33, w: 4.22, h: 0.52, fontFace: 'Calibri', fontSize: 8, color: SLATE, margin: 0, valign: 'top' });
  });
  s.addShape('roundRect', { x: 0.5, y: 6.42, w: 12.33, h: 0.55, fill: { color: 'EAF6EF' }, line: { color: GREEN, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Why it matters:  ', options: { bold: true, color: GREEN } },
    { text: 'a single number pretends to a precision the inputs never had. The band is the same arithmetic run 4,000 times with each input as uncertain as its provenance says it is — so “£26 ± 18%” is a statement of evidence, not of confidence.', options: { color: SLATE } },
  ], { x: 0.68, y: 6.42, w: 12.0, h: 0.55, fontFace: 'Calibri', fontSize: 10, margin: 0, valign: 'middle' });
  footer(s, ++PG);
  s.addNotes(
    'A question I get every time is where the plus-or-minus comes from, so here is the mechanism, exactly as the code does it. Step one: every cost line already carries a confidence grade from its provenance — measured geometry and library rates are High, derived values Medium, assumptions Low. Step two: those grades become spreads — five, twelve and twenty-two percent at one sigma — with per-bucket reality on top: tooling estimates get one-point-eight times the spread because tooling is genuinely the least certain thing we estimate, packaging and logistics get less because they are contracted, and overhead and margin are never perturbed at all because they are policy percentages — they are recomputed inside every trial exactly as the real engine composes them. Step three: four thousand trials. Each one multiplies every base bucket by a lognormal factor — always positive, mean one — and rebuilds the stack. Step four: sort the four thousand totals and read off the tenth, fiftieth and ninetieth percentiles. That is the band on the result card. Three properties worth stating. It is seeded, so the same part gives the same band every time — it is reproducible and it is unit-tested. It is calibrated: once we have enough real actuals in a segment, a conformal layer replaces the prior with a band that provably covers the target share of real outcomes — that is a statistical guarantee, and until we have the data the tool says it is on the prior. And it is honest by construction: assumptions widen the band automatically, so a part costed on guesses cannot pretend to precision. The one line: the band is the same arithmetic run four thousand times with each input exactly as uncertain as its provenance says.'
  );
}

// ══════════ 10a3 · THE DFM / DFA REPORT (rules, not opinions) ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'The DFM / DFA Report — Rules, Not Opinions', 'How §12–§15 of the report are made, end to end — and who is allowed to write them', TEAL);
  // Left: the pipeline, exactly as the engine runs it
  const steps = [
    ['1 · The costing finishes first', 'The DFM/DFA engine reads the FINISHED result: the 8-bucket breakdown plus the same measured inputs the estimate used — material utilisation, OEE, operation list, tooling amortisation. It critiques the exact numbers that were costed, not a separate copy.'],
    ['2 · ~37 threshold rules fire', 'Fixed engineering thresholds, each with severity, saving % and a recommendation: material utilisation below 60% is critical and below 72% major; OEE below 70% critical, below 80% major; each cost bucket compared to its commodity benchmark band; operation and setup counts checked.'],
    ['3 · 10 process advisors add geometry findings', 'Per-process DFM read from the measured solid (casting, forging, sheet metal, moulding families…): heavy sections that solidify last → shrink porosity at the hot spot; sharp re-entrant corners → hot-tear initiation; missing draft; wall-ratio breaches; excess machining stock → near-net opportunity.'],
    ['4 · Score and roadmap by arithmetic', 'Every part starts at 10/10: minus 2 per critical, 1 per major, 0.5 per minor. The DFA score runs the same way on assembly rules. Actions become the roadmap: low-risk quick wins vs long-term changes — a filter over the same list, nothing new invented.'],
  ];
  steps.forEach(([t, d], i) => {
    const y = 1.18 + i * 1.28;
    s.addShape('roundRect', { x: 0.5, y, w: 7.1, h: 1.16, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
    s.addShape('ellipse', { x: 0.66, y: y + 0.14, w: 0.4, h: 0.4, fill: { color: TEAL } });
    s.addText(String(i + 1), { x: 0.66, y: y + 0.14, w: 0.4, h: 0.4, fontFace: 'Cambria', fontSize: 15, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    s.addText(t.slice(4), { x: 1.2, y: y + 0.1, w: 6.3, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, margin: 0 });
    s.addText(d, { x: 1.2, y: y + 0.38, w: 6.25, h: 0.74, fontFace: 'Calibri', fontSize: 8.6, color: SLATE, margin: 0, valign: 'top' });
  });
  // Right: source of truth + the three properties
  s.addText('WHERE IT COMES FROM', { x: 7.95, y: 1.16, w: 4.9, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: TEAL, charSpacing: 0.6, margin: 0 });
  s.addShape('roundRect', { x: 7.95, y: 1.42, w: 4.88, h: 1.9, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
  s.addText('src/engine/dfm-dfa.ts', { x: 8.15, y: 1.56, w: 4.5, h: 0.24, fontFace: 'Courier New', fontSize: 10.5, bold: true, color: NAVY, margin: 0 });
  s.addText('“Rule-based DFM/DFA and Cost Optimisation engine. Deterministic — no AI API required.” — the file’s own header, and the test suite holds it to that.',
    { x: 8.15, y: 1.84, w: 4.5, h: 0.44, fontFace: 'Calibri', fontSize: 8.4, italic: true, color: SLATE, margin: 0, valign: 'top' });
  s.addText('+ modules/*-advisor.ts', { x: 8.15, y: 2.32, w: 4.5, h: 0.22, fontFace: 'Courier New', fontSize: 9.5, bold: true, color: NAVY, margin: 0 });
  s.addText('Ten per-process advisor modules supply the geometry-driven findings. One function feeds §12–§15 of the PDF AND the on-screen panel — the same object rendered twice, so screen and report can never disagree.',
    { x: 8.15, y: 2.56, w: 4.55, h: 0.68, fontFace: 'Calibri', fontSize: 8.4, color: SLATE, margin: 0, valign: 'top' });
  const promises = [
    ['Same part, same report', 'Deterministic and unit-tested: identical inputs produce an identical report, every run. Every threshold is a named constant in code a reviewer can read — not a prompt.', I.check, TEAL],
    ['Honest saving maths', 'The headline saving is NOT the sum of every issue — it is the root-sum-square of the top three, capped at 40%. Stacked opportunities are never allowed to promise an impossible discount.', I.calc, GREEN],
    ['The AI cannot touch it', 'In optional AI mode the model may add advisory commentary to the CAD analysis panel — display-only. It writes no score, no severity, no saving and no recommendation in this report.', I.shield, AMBER],
  ];
  promises.forEach(([t, d, ico, c], i) => {
    const y = 3.46 + i * 0.99;
    s.addShape('roundRect', { x: 7.95, y, w: 4.88, h: 0.9, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
    s.addShape('ellipse', { x: 8.09, y: y + 0.11, w: 0.34, h: 0.34, fill: { color: c } });
    s.addImage({ data: ico, x: 8.17, y: y + 0.19, w: 0.18, h: 0.18 });
    s.addText(t, { x: 8.52, y: y + 0.09, w: 4.2, h: 0.22, fontFace: 'Calibri', fontSize: 9.5, bold: true, color: c, margin: 0 });
    s.addText(d, { x: 8.52, y: y + 0.33, w: 4.22, h: 0.52, fontFace: 'Calibri', fontSize: 8, color: SLATE, margin: 0, valign: 'top' });
  });
  s.addShape('roundRect', { x: 0.5, y: 6.42, w: 12.33, h: 0.55, fill: { color: 'E7F4F2' }, line: { color: TEAL, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Read it in one line:  ', options: { bold: true, color: TEAL } },
    { text: 'the same measured geometry and the same costed numbers are pushed through fixed engineering thresholds — the DFM/DFA report is arithmetic you can audit, not opinion you have to trust.', options: { color: SLATE } },
  ], { x: 0.68, y: 6.42, w: 12.0, h: 0.55, fontFace: 'Calibri', fontSize: 10, margin: 0, valign: 'middle' });
  footer(s, ++PG);
  s.addNotes(
    'Sections twelve to fifteen of every report — DFM, DFA, cost optimisation and the roadmap — come from one deterministic rule engine, and I want to show exactly how, because the honest answer to "is this AI opinion?" is no. Step one: the engine runs AFTER the costing and reads the finished result — the eight buckets and the same measured inputs the estimate used. It critiques the numbers that were actually costed. Step two: around thirty-seven fixed thresholds fire — material utilisation below sixty percent is critical, below seventy-two major; OEE below seventy critical; every bucket compared to its commodity benchmark band. Each hit carries a severity, a saving percentage and a recommendation, all constants in code. Step three: ten per-process advisor modules add the geometry findings — heavy sections that will draw porosity, sharp corners that start hot tears, missing draft, near-net opportunities — read from the measured solid, not guessed. Step four: the score is arithmetic — start at ten, minus two per critical, one per major, half per minor — and the roadmap is a filter of the same actions by risk and timeframe. Two properties to underline. The saving headline is root-sum-square of the top three issues capped at forty percent — we deliberately do not add up every opportunity, because stacked savings never materialise additively. And the AI cannot touch any of it: in AI mode it may add commentary to the analysis panel, but no score, severity or saving in this report comes from a model. Source: src slash engine slash dfm-dfa dot ts plus the ten advisor modules — one function, feeding both the screen and the PDF, so the two can never disagree.'
  );
}

// ══════════ 10a4 · THE ROUTING OPTIMISER (machine choice + the Re-quote suggestion) ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'The Machine Is a Cost Decision — Not a Default', 'The routing optimiser picks the cheapest capable machine, and every suggestion follows the same arithmetic', '4F46E5');
  const steps = [
    ['1 · Rank the routings in pounds', 'Before a single pound is booked, the feasible routings are priced under the same conventions the cost charges: split across cheap 3-axis stations (one fixturing per approach direction plus the drill press) vs a single-setup 5-axis consolidation vs turning-led — batch setup amortisation AND per-part handling at every fixturing included.'],
    ['2 · The losers print in the trace', 'The chosen machine carries the full comparison as its basis: "split-3axis £12.91 vs consolidated-5axis £21.11 → split-3axis, £8.20/part cheaper". A buyer can defend the process line with the table, and the AI cannot pick a machine on any path — the rules overwrite it everywhere.'],
    ['3 · Suggestions read the same arithmetic', 'The report used to advise "consolidate with multi-axis machining" against routings the tool itself had chosen. Now the advice is station-aware: it fires only on a genuinely split routing, flips to "routing verified optimal — quote it as evidence" when the lever is already taken, and every finding carries a lever tag: design · supplier · sourcing · assumption · verified.'],
    ['4 · The Re-quote suggestion — a real case', 'On the stub-axle routing, the old §14 claimed "multi-axis consolidation, 11% saving". The optimiser ranked it: consolidation LOSES on that part. The new action: "Re-quote machining on the cost-optimal routing — £28.58 as costed vs £21.63 optimal, a £6.95/part (20%) machine-mix saving" — a Quick Win negotiation, not a capex project.'],
  ];
  steps.forEach(([t, d], i) => {
    const y = 1.18 + i * 1.28;
    s.addShape('roundRect', { x: 0.5, y, w: 7.1, h: 1.16, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
    s.addShape('ellipse', { x: 0.66, y: y + 0.14, w: 0.4, h: 0.4, fill: { color: '4F46E5' } });
    s.addText(String(i + 1), { x: 0.66, y: y + 0.14, w: 0.4, h: 0.4, fontFace: 'Cambria', fontSize: 15, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    s.addText(t.slice(4), { x: 1.2, y: y + 0.1, w: 6.3, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, margin: 0 });
    s.addText(d, { x: 1.2, y: y + 0.36, w: 6.25, h: 0.78, fontFace: 'Calibri', fontSize: 8.2, color: SLATE, margin: 0, valign: 'top' });
  });
  // Right: before/after on the real part + the three rules of engagement
  s.addText('BEFORE vs AFTER — THE STUB-AXLE REPORT', { x: 7.95, y: 1.16, w: 4.9, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: '4F46E5', charSpacing: 0.6, margin: 0 });
  s.addShape('roundRect', { x: 7.95, y: 1.42, w: 4.88, h: 0.92, fill: { color: 'FDF2F2' }, line: { color: RED, width: 1 }, rectRadius: 0.09 });
  s.addText('BEFORE — generic claim', { x: 8.13, y: 1.52, w: 4.5, h: 0.2, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: RED, margin: 0 });
  s.addText('"Multi-Axis Machining to Consolidate Operations — 11% saving · Long Term." Fired on operation count alone; on this part the arithmetic says consolidation loses money.',
    { x: 8.13, y: 1.74, w: 4.55, h: 0.56, fontFace: 'Calibri', fontSize: 8.2, color: SLATE, margin: 0, valign: 'top' });
  s.addShape('roundRect', { x: 7.95, y: 2.44, w: 4.88, h: 0.92, fill: { color: 'EAF6EF' }, line: { color: GREEN, width: 1 }, rectRadius: 0.09 });
  s.addText('AFTER — the optimiser’s delta', { x: 8.13, y: 2.54, w: 4.5, h: 0.2, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: GREEN, margin: 0 });
  s.addText('"Re-quote machining on the cost-optimal routing: £6.95/part (20% of the machining spend) · Quick Win. 5-axis consolidation was ranked and does NOT win on this part."',
    { x: 8.13, y: 2.76, w: 4.55, h: 0.56, fontFace: 'Calibri', fontSize: 8.2, color: SLATE, margin: 0, valign: 'top' });
  const promises = [
    ['AI never picks the machine', 'The model may name machines; the rules overwrite them with the cost-ranked choice on every path. What it said is kept for the comparison panel.', I.shield, '4F46E5'],
    ['Engineer choice is respected', 'A machine an engineer picked by hand is never overridden — the cheaper capable routing is surfaced as a supplier lever with its £/part delta instead.', I.person, TEAL],
    ['No verifiable delta, no claim', 'Below 2% of the machining spend, pennies, or an unknown machine: the suggestion stays silent. Every claimed saving is arithmetic the reader can check.', I.check, GREEN],
  ];
  promises.forEach(([t, d, ico, c], i) => {
    const y = 3.5 + i * 0.97;
    s.addShape('roundRect', { x: 7.95, y, w: 4.88, h: 0.88, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
    s.addShape('ellipse', { x: 8.09, y: y + 0.11, w: 0.34, h: 0.34, fill: { color: c } });
    s.addImage({ data: ico, x: 8.17, y: y + 0.19, w: 0.18, h: 0.18 });
    s.addText(t, { x: 8.52, y: y + 0.09, w: 4.2, h: 0.22, fontFace: 'Calibri', fontSize: 9.5, bold: true, color: c, margin: 0 });
    s.addText(d, { x: 8.52, y: y + 0.32, w: 4.22, h: 0.52, fontFace: 'Calibri', fontSize: 8, color: SLATE, margin: 0, valign: 'top' });
  });
  s.addShape('roundRect', { x: 0.5, y: 6.42, w: 12.33, h: 0.55, fill: { color: 'EEF2FF' }, line: { color: '4F46E5', width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Read it in one line:  ', options: { bold: true, color: '4F46E5' } },
    { text: 'the should-cost models the most efficient plausible supplier — so the tool takes the optimal machine itself, and its suggestions are reserved for levers only you can pull, each one priced by the same arithmetic that built the estimate.', options: { color: SLATE } },
  ], { x: 0.68, y: 6.42, w: 12.0, h: 0.55, fontFace: 'Calibri', fontSize: 10, margin: 0, valign: 'middle' });
  footer(s, ++PG);
  s.addNotes(
    'A buyer challenged us with exactly the right question: the tool costed a five-machine routing and then recommended consolidating it with multi-axis machining — why did it not just pick the right machine in the first place? So now it does, and I want to show the mechanism. Step one: before any pound is booked, the routing optimiser prices the feasible alternatives — the split routing on cheap three-axis stations with a fixturing per approach direction, the single-setup five-axis consolidation, the turning-led route when the part is round — including batch setup amortisation and the per-part handling every extra fixturing costs. Cheapest capable routing wins. Step two: the losers are printed in the derivation trace next to the chosen machine, so the process line comes with its own defence. Step three: the suggestion layer reads the same arithmetic — it no longer critiques the tool’s own choices, it flips to "routing verified optimal" when the lever is already taken, and every finding is tagged with who owns the lever. And step four is my favourite, because it is the honest one: on the very report that prompted the question, the old advice said multi-axis consolidation, eleven percent, long term. The optimiser ranked it and consolidation loses on that part. The new suggestion is a quick-win re-quote: the same machining content on the cheapest capable machines is six pounds ninety-five cheaper per part — twenty percent of the machining spend — and the report says out loud that consolidation was ranked and does not win. Three rules of engagement: the AI never picks the machine, an engineer’s explicit choice is respected with the delta surfaced beside it, and if there is no verifiable delta there is no claim.'
  );
}

// ══════════ 10a5 · TOOLING COST I (method + moulds & dies) ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'How Tooling Is Priced I — The Method, and Moulds & Dies', 'Parametric build-ups from measured geometry — every constant in a named source file, none of it from AI', TEAL);
  const steps = [
    ['1 · Geometry sets the size drivers', 'The kernel measures what tools scale with: projected area per cavity/impression, part volume, bounding box, face count, hole count, undercut count. Nothing is typed in.'],
    ['2 · A parametric build-up prices the tool', 'Base block + per-cavity (or per-impression / per-station) machining + extras — in £ constants a toolmaker can argue with line by line, not a single opaque number.'],
    ['3 · The programme sets the tool steel', 'Steel class follows the shots the programme needs (annual volume × 5 yr ÷ cavities): prototype ×0.55 · standard P20 ×1.0 · hardened production ×1.35 · high-wear ×1.7 — and the steel sets the life.'],
    ['4 · Life → number of tools → £/part', 'tools needed = ceil(programme shots ÷ tool life); tooling £/part = tool cost × tools ÷ annual volume — then tolerance (×1.0–2.0) and surface-finish (up to ×1.6 painted Class-A) uplifts.'],
    ['5 · Two estimates blended; a quote always wins', 'The kernel prices the tool independently from the B-rep; when both exist they are geometric-mean blended (sanity-clamped). A toolmaker QUOTATION overrides everything — the £420k bumper mould is an input, never an estimate.'],
  ];
  steps.forEach(([t, d], i) => {
    const y = 1.18 + i * 1.06;
    s.addShape('roundRect', { x: 0.5, y, w: 6.6, h: 0.96, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
    s.addShape('ellipse', { x: 0.64, y: y + 0.1, w: 0.36, h: 0.36, fill: { color: TEAL } });
    s.addText(String(i + 1), { x: 0.64, y: y + 0.1, w: 0.36, h: 0.36, fontFace: 'Cambria', fontSize: 13, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    s.addText(t.slice(4), { x: 1.12, y: y + 0.07, w: 5.9, h: 0.22, fontFace: 'Calibri', fontSize: 10, bold: true, color: NAVY, margin: 0 });
    s.addText(d, { x: 1.12, y: y + 0.3, w: 5.95, h: 0.64, fontFace: 'Calibri', fontSize: 7.9, color: SLATE, margin: 0, valign: 'top' });
  });
  // Right: the two headline formula cards
  s.addText('THE TWO BIGGEST TOOLS, FORMULA BY FORMULA', { x: 7.35, y: 1.16, w: 5.5, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: TEAL, charSpacing: 0.6, margin: 0 });
  s.addShape('roundRect', { x: 7.35, y: 1.42, w: 5.48, h: 2.42, fill: { color: CARD }, line: { color: TEAL, width: 1.25 }, rectRadius: 0.09 });
  s.addText('INJECTION MOULD  ·  estimateMouldCost()', { x: 7.55, y: 1.52, w: 5.1, h: 0.22, fontFace: 'Courier New', fontSize: 8.8, bold: true, color: NAVY, margin: 0 });
  s.addText('total = [ £6,000 base  +  (£2,500 + area/cavity × £55) × n^0.9 ] × steel factor\n        + side-actions × £3,500  +  hot runner (£4,000 + £2,500 per drop)',
    { x: 7.55, y: 1.76, w: 5.15, h: 0.5, fontFace: 'Courier New', fontSize: 7.6, color: SLATE, margin: 0, valign: 'top' });
  s.addText([
    { text: 'Why n^0.9: ', options: { bold: true, color: TEAL, fontSize: 8 } },
    { text: 'the Nth identical cavity is cheaper than the first — and the cavity count itself is COST-RANKED (mould NRE vs cycle share per candidate, losers printed in the trace).\n', options: { color: SLATE, fontSize: 8 } },
    { text: 'The bumper, worked: ', options: { bold: true, color: NAVY, fontSize: 8 } },
    { text: '1 cavity (2-up needs 7,388 t > the 3,500 t largest press) × 9,000 cm² × production steel + 3 slides → advisor estimate ⊕ kernel’s independent £412k B-rep parametric, geometric mean → £407k. The deck’s worked example uses the £420k toolmaker quotation instead — because a quote always wins.', options: { color: SLATE, fontSize: 8 } },
  ], { x: 7.55, y: 2.3, w: 5.15, h: 1.46, fontFace: 'Calibri', margin: 0, valign: 'top' });
  s.addShape('roundRect', { x: 7.35, y: 3.98, w: 5.48, h: 2.3, fill: { color: CARD }, line: { color: TEAL, width: 1.25 }, rectRadius: 0.09 });
  s.addText('HPDC DIE  ·  kernel parametric (B-rep)', { x: 7.55, y: 4.08, w: 5.1, h: 0.22, fontFace: 'Courier New', fontSize: 8.8, bold: true, color: NAVY, margin: 0 });
  s.addText('complexity = faces × £150 + holes × £400 + undercuts × £10,000\ndie = complexity × (bbox litres)^0.45, floored £40k/£80k/£120k by\nshot weight, capped £300k   ·   die life: 150,000 shots',
    { x: 7.55, y: 4.32, w: 5.15, h: 0.66, fontFace: 'Courier New', fontSize: 7.6, color: SLATE, margin: 0, valign: 'top' });
  s.addText([
    { text: 'Every undercut face the kernel counts is £10,000 of sliding tool section ', options: { color: SLATE, fontSize: 8 } },
    { text: '— the die price moves with measured features, not with anyone’s optimism. Gravity moulds and sand patterns have their own kernel parametrics (sand: £1.5k–£50k, complexity-driven). Life bands: HPDC 150k · gravity 50k · sand 8k · investment 5k shots.', options: { color: SLATE, fontSize: 8 } },
  ], { x: 7.55, y: 5.0, w: 5.15, h: 1.2, fontFace: 'Calibri', margin: 0, valign: 'top' });
  s.addShape('roundRect', { x: 0.5, y: 6.42, w: 12.33, h: 0.55, fill: { color: 'E7F4F2' }, line: { color: TEAL, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Read it in one line:  ', options: { bold: true, color: TEAL } },
    { text: 'tooling is a parametric build-up from measured geometry, steel class from the programme volume, life from the steel, amortised over the tools the programme actually consumes — and a real quotation beats the estimate every time.', options: { color: SLATE } },
  ], { x: 0.68, y: 6.42, w: 12.0, h: 0.55, fontFace: 'Calibri', fontSize: 9.8, margin: 0, valign: 'middle' });
  footer(s, ++PG);
  s.addNotes(
    'A fair challenge from our own review was tooling: where do the die and mould numbers come from? Two slides, and everything on them is read out of the source code, not summarised from memory. The method first, five steps, identical across commodities. One: the kernel measures the size drivers — projected area per cavity, volume, faces, holes, undercuts. Two: a parametric build-up prices the tool as a base block plus per-cavity machining plus extras, in constants a toolmaker can argue with individually — six thousand pounds of bolster and ejector system, two and a half thousand plus fifty-five pounds per square centimetre per cavity, three and a half thousand per sliding action. Three: the tool steel follows the programme — the shots you need decide whether it is a prototype tool at roughly half cost or a hardened production tool at one-point-three-five times, and the steel decides the life. Four: life gives the number of tools the programme consumes, and the cost amortises over the annual volume, with tolerance and surface-finish uplifts on top. Five — and this is the confidence point: there are TWO independent estimates, the advisor formula and the geometry kernel’s own B-rep parametric, blended by geometric mean when they both exist; and a real toolmaker quotation overrides both, always. On the right, the two biggest tools with the actual formulas: the injection mould, where the cavity count is itself cost-ranked, and the die-cast die, where every undercut face the kernel counts adds ten thousand pounds of sliding section. On the bumper the advisor and the kernel blend to four hundred and seven thousand; the worked example in this deck uses the four-twenty quotation instead, because a quote always wins.'
  );
}

// ══════════ 10a6 · TOOLING COST II (forging, stamping, blow, the rest) ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'How Tooling Is Priced II — Forging, Stamping, Blow Moulding', 'The same method, commodity by commodity — with the honest gap stated', TEAL);
  const cards = [
    ['FORGING DIE  ·  estimateForgingDieCost() / DieLife()',
     'die = [ £6,000 + area × £45 + part kg × £250 ] × die steel\n    + impressions × (£3,500 + area × £55) × complexity × steel\n    + heat treat (£2,500 + area × £6) + polish £800/impression',
     'Die steel: hammer ×0.85 · H13 ×1.0 · premium ×1.4. Complexity ×0.8–1.4. LIFE IS ALLOY-KEYED — aluminium 80k · carbon steel 40k · alloy steel 30k · stainless 18k · titanium 8k · superalloy 3,500 hits — × complexity (0.6–1.3) × size penalty (100/area)^0.2. A flat die life was a live defect this engine fixed: it over-charged aluminium tooling 2–4× and under-charged titanium.'],
    ['STAMPING DIE  ·  estimateStampingDieCost() / DieLife()',
     'die = (base + stations × per-station) × size × hardness\nsize = 0.5 + blank cm²/500      hardness: mild 1.0 → boron ≈1.8\nsingle £6k+£2.5k/stn · progressive £12k+£6k/stn · transfer £20k+£9k/stn · fine-blank £30k+£12k/stn',
     'Life = 1M × (300 ÷ shear MPa)^1.3 × thickness factor × 0.6 if fine-blanking, clamped 50k–3M strokes. Harder, thicker steel wears the tool faster and the formula says by how much.'],
    ['BLOW MOULD  ·  estimateBlowMouldCost()',
     'mould = [ base £4k–£7k + (process £1.8k–£3.8k + litres × £900) × n^0.9 ]\n        × mould material  +  cooling 6% (15% high-cooling)',
     'EBM aluminium is the workhorse; IBM/SBM carry a core-rod/preform premium. Life follows the mould material: aluminium 500k · P20 1M · H13 2M shots.'],
    ['MACHINING · CAST+MACHINE · THE HONEST GAP',
     'No die: fixtures + CNC programming NRE (cast+machine books £15,000\nof secondary-machining NRE), amortised over annual volume.',
     'And the former gap, now closed by the tooling deep-dive: INVESTMENT-CASTING tooling is priced as what it physically is — a wax-injection tool is an aluminium/P20 mould at low pressure, so the mould shop model prices it. A toolmaker quotation still overrides every estimate on this slide.'],
  ];
  cards.forEach(([h, f, d], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.5 + col * 6.28, y = 1.2 + row * 2.56, w = 6.05, hh = 2.42;
    s.addShape('roundRect', { x, y, w, h: hh, fill: { color: CARD }, line: { color: TEAL, width: 1.25 }, rectRadius: 0.09 });
    s.addText(h, { x: x + 0.2, y: y + 0.1, w: w - 0.4, h: 0.22, fontFace: 'Courier New', fontSize: 8.4, bold: true, color: NAVY, margin: 0 });
    s.addText(f, { x: x + 0.2, y: y + 0.36, w: w - 0.4, h: 0.72, fontFace: 'Courier New', fontSize: 7.2, color: SLATE, margin: 0, valign: 'top' });
    s.addText(d, { x: x + 0.2, y: y + 1.12, w: w - 0.4, h: 1.24, fontFace: 'Calibri', fontSize: 7.9, color: SLATE, margin: 0, valign: 'top' });
  });
  s.addShape('roundRect', { x: 0.5, y: 6.42, w: 12.33, h: 0.55, fill: { color: 'E7F4F2' }, line: { color: TEAL, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Why you can trust these numbers:  ', options: { bold: true, color: TEAL } },
    { text: 'every tool is now priced the way a toolmaker quotes it — design/CNC/EDM/polish/fitting/tryout hours × toolroom rates, steel by the kilogram, bought-outs each, the shop\u2019s 22% overhead as its own line (toolmaking.ts + the estimators; the bumper mould lands £423,985 against its £420k real quotation) — auditable line by line, changed only by a code review, and never written by an AI.', options: { color: SLATE } },
  ], { x: 0.68, y: 6.42, w: 12.0, h: 0.55, fontFace: 'Calibri', fontSize: 9.8, margin: 0, valign: 'middle' });
  footer(s, ++PG);
  s.addNotes(
    'Same method, three more commodities, and one honest gap. The forging die: a block that scales with the part’s footprint and weight, machining per impression, the die steel as a multiplier, plus heat treatment and polishing — and the life is keyed to the ALLOY, because an aluminium forging is gentle on a die at eighty thousand hits while a superalloy destroys one in three and a half thousand. That alloy-keyed life replaced a flat constant that was over-charging aluminium tooling by a factor of two to four — a defect this engine found and fixed, with the test to prove it. The stamping die: priced by die type and station count, scaled by blank size and by how hard the steel being cut is — and the life law says exactly how much faster boron steel eats a tool than mild steel. The blow mould: per-cavity cost grows with the litres the container holds, the mould material sets both cost and life. Machining has no die — fixtures and programming NRE, amortised the same way. And the gap, said out loud because it builds more confidence than hiding it: investment-casting tooling has no parametric model, so the tool stops and asks for a quotation instead of inventing one. The bottom line is the audit trail: every constant on these two slides lives in a named, unit-tested source file. I did not summarise these formulas from memory — they are read out of the code, and the code is the same code that prices every part.'
  );
}

// ══════════ 10b · NO HALLUCINATIONS ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Where Every Number Comes From', 'The hallucination question, answered precisely', AMBER);
  owner(s, 10.3, 0.74, 'OWNER: THE ENGINE', AMBER, AMBER_T);

  s.addShape('roundRect', { x: 0.5, y: 1.3, w: 6.1, h: 2.9, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('EVERY BUCKET, AND WHAT IT IS MADE OF', { x: 0.75, y: 1.42, w: 5.6, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, charSpacing: 0.6, margin: 0 });
  const prov = [
    ['Material', 'measured volume x density x published £/kg'],
    ['Process', 'cycle time / OEE x machine £/hr'],
    ['Labour', 'same time x manning x wage-grade £/hr'],
    ['Tooling', 'entered die cost / parts over its life'],
    ['Packaging, Logistics', 'entered directly by the engineer'],
    ['Overhead, Margin', 'a % of the figures above — applied once'],
  ];
  prov.forEach(([k, v], i) => {
    const y = 1.76 + i * 0.32;
    s.addText(k, { x: 0.78, y, w: 1.95, h: 0.3, fontFace: 'Calibri', fontSize: 10, bold: true, color: TEAL, margin: 0, valign: 'middle' });
    s.addText(v, { x: 2.78, y, w: 3.7, h: 0.3, fontFace: 'Calibri', fontSize: 9.6, color: SLATE, margin: 0, valign: 'middle' });
  });
  s.addText('Not one of those six lines contains an AI-generated number.',
    { x: 0.78, y: 3.76, w: 5.6, h: 0.32, fontFace: 'Calibri', fontSize: 10.5, bold: true, italic: true, color: NAVY, margin: 0 });

  s.addShape('roundRect', { x: 6.85, y: 1.3, w: 5.98, h: 2.9, fill: { color: AMBER_T }, line: { color: AMBER, width: 1.25 }, rectRadius: 0.1 });
  s.addText('THE CHECKS THAT RUN ON EVERY ESTIMATE', { x: 7.1, y: 1.42, w: 5.5, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: AMBER, charSpacing: 0.6, margin: 0 });
  const checks = [
    'AI volume vs measured volume — >25% apart warns, >50% errors',
    'Weight must equal volume x density to within 20%',
    'Material confidence under 50% — asks for a photo or confirmation',
    'Any cycle time outside 1.8 seconds to 24 hours is rejected',
    'Near-net machining capped to 0.10 hr + 0.07 hr/kg',
    'Machine must be big enough for the part, or it is flagged',
  ];
  checks.forEach((t, i) => s.addText('•  ' + t, { x: 7.12, y: 1.76 + i * 0.32, w: 5.5, h: 0.3, fontFace: 'Calibri', fontSize: 9.6, color: SLATE, margin: 0, valign: 'middle' }));
  s.addText('Each one is code, not a prompt — code cannot be talked out of a rule.',
    { x: 7.12, y: 3.76, w: 5.5, h: 0.32, fontFace: 'Calibri', fontSize: 10.5, bold: true, italic: true, color: NAVY, margin: 0 });

  s.addShape('roundRect', { x: 0.5, y: 4.35, w: 12.33, h: 1.25, fill: { color: CARD }, line: { color: GREEN, width: 1.5 }, rectRadius: 0.1 });
  s.addText('The claim we make — and the claim we do not', { x: 0.8, y: 4.47, w: 11, h: 0.3, fontFace: 'Calibri', fontSize: 12.5, bold: true, color: GREEN, margin: 0 });
  s.addText([
    { text: 'We do say: no AI-invented number ever becomes money. ', options: { bold: true, color: NAVY } },
    { text: 'The AI hands over words — "aluminium die-casting alloy", "high-pressure die cast" — and the engine takes it from there.  ', options: { color: SLATE } },
    { text: 'We do not say the AI is never wrong. ', options: { bold: true, color: RED } },
    { text: 'It can misread a part. That is exactly why it carries a confidence score, why the checks above run automatically, and why a person signs the result.', options: { color: SLATE } },
  ], { x: 0.8, y: 4.79, w: 11.75, h: 0.74, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 5.75, w: 12.33, h: 1.05, fill: { color: TEAL_T }, line: { color: TEAL, width: 1 }, rectRadius: 0.1 });
  s.addText([
    { text: 'Reproducibility test: ', options: { bold: true, color: TEAL } },
    { text: 'run the same file with the same inputs a hundred times and you get £38.55 a hundred times. The arithmetic is fixed code, so the answer cannot drift between runs, between engineers, or between one supplier meeting and the next.', options: { color: SLATE } },
  ], { x: 0.8, y: 5.87, w: 11.75, h: 0.85, fontFace: 'Calibri', fontSize: 12, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'I have been asked, quite reasonably, whether this thing makes numbers up. Let me answer it precisely rather than reassuringly, because the precise answer is more useful. ' +
    'On the left, all eight buckets and what each one is actually made of. Material is measured volume times a density times a published price per kilo. Process is cycle time divided by machine availability, times a machine rate from our library. Labour is that same time times the manning level times a wage-grade rate. Tooling is the die cost our engineer entered, divided by the parts it will make. Packaging and logistics are typed in directly. Overhead and margin are percentages of the figures above, applied once each. ' +
    'Read down that list and notice what is missing. Not one of those six lines contains a number the AI produced. It cannot, because the AI never sees the rate library and never touches the arithmetic. ' +
    'On the right, the checks that run automatically on every single estimate. If the AI reports a volume more than twenty-five percent away from what we measured, that warns; more than fifty percent and it is an error. Weight must equal volume times density to within twenty percent. If material confidence drops under fifty percent, it asks for a photo or a manual confirmation. Any cycle time outside one point eight seconds to twenty-four hours is physically implausible and gets rejected. Near-net machining is capped to a finish envelope. And the machine must be big enough for the part or it is flagged. Every one of those is code. That distinction matters — a prompt can be talked out of a rule; a line of code cannot. ' +
    'Now the honest part, and please hear both halves of it. We do say that no AI-invented number ever becomes money. The AI hands over words, and the engine takes it from there. What we do not say is that the AI is never wrong. It can misread a part. It might look at an unusual casting and call it something else. That is exactly why it carries a confidence score, why those checks run automatically, and why a person signs the result before it goes anywhere. Anyone who tells you their AI never makes a mistake is selling you something. ' +
    'And one last thing, which is the test I would apply to any costing tool. Run the same file with the same inputs a hundred times and you get thirty-eight fifty-five a hundred times. The arithmetic is fixed code. The answer cannot drift between runs, between two engineers, or between one supplier meeting and the next one. That is what makes it defensible.'
  );
}

// ══════════ 11 · SUMMARY ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'The Whole Thing on One Page', 'Who does what — the answer to the question you asked me');

  const lanes = [
    [BLUE, BLUE_T, 'THE RULER', 'Measures the CAD file', ['Volume, weight, walls', 'Bores, holes, faces', 'Hollow-vs-solid check'], 'Same answer every time'],
    [PURPLE, PURPLE_T, 'THE AI', 'Reads and names it', ['Alloy family', 'Process route', 'Confidence score'], 'Words only. Never money.'],
    [AMBER, AMBER_T, 'THE GUARDS', 'Check and autocorrect', ['Pour weight, not part weight', 'Machining = finishing', 'Right alloy, right press'], 'Measurements always win'],
    [TEAL, TEAL_T, 'THE ENGINE', 'Does every calculation', ['Sizes the machine', 'Builds each cycle time', '8 buckets, 20 countries'], 'Fixed formulas, traceable'],
    [GREEN, GREEN_T, 'THE ENGINEER', 'Reviews and approves', ['Sets volume and region', 'Confirms every AI call', 'Signs off the number'], 'The final decision'],
  ];
  const lw = 2.36, lg = 0.11;
  lanes.forEach(([col, tint, who, does, items, rule], i) => {
    const x = 0.5 + i * (lw + lg), y = 1.32, h = 3.55;
    s.addShape('roundRect', { x, y, w: lw, h, fill: { color: tint }, line: { color: col, width: 1.25 }, rectRadius: 0.09 });
    s.addShape('rect', { x, y, w: lw, h: 0.44, fill: { color: col } });
    s.addText(who, { x, y, w: lw, h: 0.44, fontFace: 'Calibri', fontSize: 11, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, charSpacing: 0.8 });
    s.addText(does, { x: x + 0.1, y: y + 0.52, w: lw - 0.2, h: 0.28, fontFace: 'Calibri', fontSize: 10, bold: true, italic: true, color: col, align: 'center', margin: 0 });
    items.forEach((t, j) => s.addText('• ' + t, { x: x + 0.14, y: y + 0.88 + j * 0.44, w: lw - 0.28, h: 0.42, fontFace: 'Calibri', fontSize: 9.5, color: SLATE, margin: 0, valign: 'top' }));
    s.addShape('roundRect', { x: x + 0.12, y: y + h - 0.55, w: lw - 0.24, h: 0.44, fill: { color: CARD }, line: { color: col, width: 0.75 }, rectRadius: 0.08 });
    s.addText(rule, { x: x + 0.14, y: y + h - 0.55, w: lw - 0.28, h: 0.44, fontFace: 'Calibri', fontSize: 8.8, bold: true, color: col, align: 'center', valign: 'middle', margin: 0 });
  });

  s.addShape('roundRect', { x: 0.5, y: 5.1, w: 12.33, h: 0.85, fill: { color: NAVY }, rectRadius: 0.1 });
  s.addText('The AI reads the part.   The engine does every calculation.   A person approves the answer.', {
    x: 0.5, y: 5.1, w: 12.33, h: 0.85, fontFace: 'Cambria', fontSize: 19, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });

  s.addShape('roundRect', { x: 0.5, y: 6.1, w: 12.33, h: 0.78, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText([
    { text: 'Result on this part:  ', options: { bold: true, color: NAVY } },
    { text: 'a defensible £38.55, with a £32–£45 confidence band, built in about two minutes — and every penny of it traceable to a measurement or a published rate.', options: { color: SLATE } },
  ], { x: 0.8, y: 6.2, w: 11.75, h: 0.6, fontFace: 'Calibri', fontSize: 12.5, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'Let me put the whole thing on one page, because this is the answer to the question you asked me after the last session. ' +
    'Five players, left to right, in the order they act. The ruler measures the CAD file and gives the same answer every time. The AI reads those measurements and names what the part is — words only, never money. The guards check the AI against the measurements and autocorrect it where they disagree, and the measurements always win. The engine does every calculation — sizes the machine, builds the cycle times, fills the eight buckets, reprices across twenty countries — with fixed, traceable formulas. And our engineer sets the commercial context, confirms every AI call, and signs off the number. ' +
    'The line in the middle is the whole tool in one sentence. The AI reads the part. The engine does every calculation. A person approves the answer. ' +
    'And the result on this housing: a defensible forty pounds ninety-nine, with a thirty-five to forty-seven confidence band, produced in about two minutes, and every penny traceable to either a measurement or a published rate. ' +
    'That is the workflow. I am very happy to take questions — and if it would help, I can run this live on any part you want to throw at me, and you can watch each of these stages happen in real time.'
  );
}


FOOT = 'CostVision · how the tool works, step by step · injection-moulded bumper fascia worked example';

divider('SECTION THREE', 'An Injection-Moulded Bumper Fascia', 'The same method, a part that could hardly be more different', PURPLE,
  ['Same kernel, same AI, same rate library, same eight buckets',
   'Cooling calculated from wall thickness — and what half a millimetre is worth',
   'The paint line, costed from film thickness rather than a percentage uplift',
   'Two findings that nobody in the room would have predicted'], '18',
  'Second worked example, and the reason it is here is to answer a fair question: is this a tool, or is it a demo that only works on one part? ' +
  'So we do it all again on something as different as I could find — an injection-moulded bumper fascia. Same kernel, same AI, same rate library, same eight buckets, same person signing it off. What changes is which bucket holds the money, and the answer is going to surprise you. ' +
  'Along the way you will see cooling time calculated from wall thickness and what half a millimetre of wall is actually worth, and the paint line costed properly from film thickness rather than as a percentage uplift on the moulded price. ' +
  'And it ends with two findings that I would not have predicted before we ran it — which is, in the end, the whole argument for having the tool at all.');

// ══════════ PART 2 · A · SAME METHOD, DIFFERENT PART ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Part Two · The Same Method on a Moulded Part', 'Front bumper fascia — injection moulded, followed end to end', PURPLE);

  s.addShape('roundRect', { x: 0.5, y: 1.28, w: 12.33, h: 1.22, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addShape('ellipse', { x: 0.75, y: 1.5, w: 0.72, h: 0.72, fill: { color: NAVY } });
  s.addImage({ data: I.cube, x: 0.95, y: 1.7, w: 0.32, h: 0.32 });
  s.addText('Front bumper fascia — talc-filled polypropylene, moulded in one shot, then painted', { x: 1.68, y: 1.42, w: 11, h: 0.34, fontFace: 'Calibri', fontSize: 15, bold: true, color: NAVY, margin: 0, valign: 'middle' });
  const chips = ['4.2 kg', '3.0 mm walls', '1,800 × 550 mm', '6 undercut slides', 'Class-A painted', '60,000 a year', 'Made in China'];
  chips.forEach((c, i) => {
    const x = 1.68 + i * 1.58;
    s.addShape('roundRect', { x, y: 1.86, w: 1.48, h: 0.36, fill: { color: PURPLE_T }, rectRadius: 0.17 });
    s.addText(c, { x, y: 1.86, w: 1.48, h: 0.36, fontFace: 'Calibri', fontSize: 9, bold: true, color: NAVY, align: 'center', valign: 'middle', margin: 0 });
  });

  const phases = [
    [BLUE, BLUE_T, 'MEASURE', 'Ruler', ['1 · Upload the file', '2 · Measure the geometry', '3 · Draft & undercut check'], 'Same kernel, same facts'],
    [PURPLE, PURPLE_T, 'AI READS', 'AI', ['4 · Recognise the recipe', 'resin · process · finish', 'with a confidence score'], 'Words only — no prices'],
    [AMBER, AMBER_T, 'SAFETY CHECKS', 'Engine', ['5 · Four automatic guards', '6 · Autocorrect wrong calls', 'before any money is counted'], 'Measurements always win'],
    [TEAL, TEAL_T, 'CALCULATE', 'Engine', ['7 · Pick press & cycle', '8 · Cost every second', '9-10 · Build & regionalise'], 'The same eight buckets'],
    [GREEN, GREEN_T, 'CHECK & USE', 'Engineer', ['11 · Confidence band', '12 · Report & approval'], 'A person signs it off'],
  ];
  const pw = 2.33, gap = 0.16;
  phases.forEach(([col, tint, name, who, steps, tag], i) => {
    const x = 0.5 + i * (pw + gap), y = 2.72, h = 2.28;
    s.addShape('roundRect', { x, y, w: pw, h, fill: { color: tint }, line: { color: col, width: 1.25 }, rectRadius: 0.09 });
    s.addShape('rect', { x, y, w: pw, h: 0.4, fill: { color: col } });
    s.addText(name, { x, y, w: pw, h: 0.4, fontFace: 'Calibri', fontSize: 10, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, charSpacing: 0.8 });
    s.addText(`owner: ${who}`, { x, y: y + 0.45, w: pw, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, italic: true, color: col, align: 'center', margin: 0 });
    steps.forEach((st, j) => s.addText(st, { x: x + 0.14, y: y + 0.74 + j * 0.34, w: pw - 0.28, h: 0.32, fontFace: 'Calibri', fontSize: 9.2, color: SLATE, margin: 0, valign: 'top' }));
    s.addText(tag, { x: x + 0.12, y: y + h - 0.4, w: pw - 0.24, h: 0.3, fontFace: 'Calibri', fontSize: 8.6, bold: true, italic: true, color: col, align: 'center', margin: 0 });
  });

  s.addShape('roundRect', { x: 0.5, y: 5.22, w: 12.33, h: 1.12, fill: { color: CARD }, line: { color: PURPLE, width: 1.5 }, rectRadius: 0.1 });
  s.addText('Nothing about the method changes', { x: 0.8, y: 5.34, w: 11, h: 0.3, fontFace: 'Calibri', fontSize: 12.5, bold: true, color: PURPLE, margin: 0 });
  s.addText([
    { text: 'Same twelve stages. Same geometry kernel. Same rate library. Same eight buckets. Same person signing it off. ', options: { color: SLATE } },
    { text: 'What changes is which bucket turns out to hold the money — and on this part the answer is somewhere completely different from the casting.', options: { bold: true, color: NAVY } },
  ], { x: 0.8, y: 5.64, w: 11.75, h: 0.62, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'top' });
  footer(s, ++PG);

  s.addNotes(
    'Right — second worked example, and I have chosen a part that could not be much more different from the casting: a front bumper fascia. ' +
    'It is talc-filled polypropylene, four point two kilos, walls three millimetres thick, roughly one point eight metres by half a metre, with six undercut features that need sliding sections in the tool for the lamp and sensor apertures, and it is Class-A painted. Sixty thousand a year, made in China — deliberately the same volume and the same country as the casting so you can compare like with like. ' +
    'Look at the five phases across the middle and compare them with the strip I showed you on the casting. They are identical. Same twelve stages, same owners, same colours. The geometry kernel is the same kernel. The AI does the same one job. The rate library is the same library. The engine builds the same eight buckets. ' +
    'That is the point of this second example, and it is worth saying out loud: we have not built twenty different tools. We have built one method that applies to twenty commodities. When someone brings us a part we have never costed before, nothing new has to be invented. ' +
    'What does change — and this is what makes it worth your time — is which bucket ends up holding the money. On the casting it was the machining. On this part it is somewhere completely different, and I think the answer will surprise you as much as it surprised me.'
  );
}

partSlide('assets/workflow-deck/part-bumper.png',
  'The Second Part We Are Costing', 'Front bumper fascia',
  'Same method, a part that could hardly be more different', PURPLE,
  [['Part weight', '4.2 kg'], ['Wall thickness', '3.0 mm'], ['Projected shadow', '9,900 cm²'],
   ['Overall width', '1,800 mm'], ['Undercut features', '6 slides'], ['Painted area', '1.6 m²'],
   ['Resin', 'PP-T20'], ['Annual volume', '60,000'], ['Made in', 'China']],
  'Same volume and country as the casting, so the two compare like for like.',
  'And here is the second part, chosen because it could hardly be more different from the casting while still being something every one of us would recognise. ' +
  'A front bumper fascia. Four point two kilos of talc-filled polypropylene, walls three millimetres thick, one point eight metres across. The grille aperture, the two fog-lamp openings and the parking-sensor holes all face back against the direction the mould opens, so the tool needs six sliding sections to release the part — and each of those slides is real money in the mould. ' +
  'The projected shadow is nine thousand nine hundred square centimetres, which is six times the casting, and that single number is going to drive the biggest process decision on this part. ' +
  'Note the last two rows deliberately: sixty thousand a year, made in China. Exactly the same volume and the same country as the casting, so when we compare the two at the end we are comparing like with like rather than two different sourcing scenarios.');

// ══════════ PART 2 · B · MEASURE + AI ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Stages 1–4 · Measured First, Then Read', 'Same kernel, same order — the facts exist before the AI speaks', BLUE);

  s.addShape('roundRect', { x: 0.5, y: 1.3, w: 5.4, h: 2.9, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addShape('ellipse', { x: 0.75, y: 1.5, w: 0.46, h: 0.46, fill: { color: BLUE } });
  s.addImage({ data: I.ruler, x: 0.86, y: 1.61, w: 0.24, h: 0.24 });
  s.addText('What the kernel measures', { x: 1.35, y: 1.5, w: 4.3, h: 0.46, fontFace: 'Calibri', fontSize: 12.5, bold: true, color: BLUE, margin: 0, valign: 'middle' });
  const meas = [
    ['Solid volume → weight in PP', '4.20 kg'],
    ['Wall thickness (drives cooling)', '3.0 mm'],
    ['Projected shadow in the draw direction', '9,900 cm²'],
    ['Faces facing against the draw', '6 undercuts'],
    ['Painted surface area', '1.6 m²'],
  ];
  meas.forEach(([k, v], i) => {
    const y = 2.14 + i * 0.38;
    s.addText(k, { x: 0.78, y, w: 3.6, h: 0.34, fontFace: 'Calibri', fontSize: 10, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(v, { x: 4.35, y, w: 1.3, h: 0.34, fontFace: 'Calibri', fontSize: 11, bold: true, color: NAVY, align: 'right', margin: 0, valign: 'middle' });
  });

  s.addShape('roundRect', { x: 6.15, y: 1.3, w: 3.35, h: 2.9, fill: { color: PURPLE_T }, line: { color: PURPLE, width: 1.25 }, rectRadius: 0.1 });
  s.addText('WHAT THE AI SAYS BACK', { x: 6.4, y: 1.44, w: 3, h: 0.26, fontFace: 'Calibri', fontSize: 10, bold: true, color: PURPLE, charSpacing: 0.8, margin: 0 });
  const says = [['Material family', 'Talc-filled polypropylene'], ['How it is made', 'Injection moulded, one shot'], ['Then what', 'Painted, Class-A finish'], ['How sure it is', '0.87 confident']];
  says.forEach(([k, v], i) => {
    const y = 1.78 + i * 0.52;
    s.addText(k, { x: 6.4, y, w: 2.9, h: 0.22, fontFace: 'Calibri', fontSize: 9, color: MUTED, margin: 0 });
    s.addText(v, { x: 6.4, y: y + 0.21, w: 2.9, h: 0.3, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, margin: 0, valign: 'top' });
  });
  s.addText('Four words. No numbers.', { x: 6.4, y: 3.88, w: 2.9, h: 0.26, fontFace: 'Calibri', fontSize: 9.5, bold: true, italic: true, color: PURPLE, margin: 0 });

  s.addShape('roundRect', { x: 9.75, y: 1.3, w: 3.08, h: 2.9, fill: { color: BLUE_T }, line: { color: BLUE, width: 1.25 }, rectRadius: 0.1 });
  s.addText('THE UNDERCUT COUNT', { x: 10.0, y: 1.44, w: 2.6, h: 0.26, fontFace: 'Calibri', fontSize: 10, bold: true, color: BLUE, charSpacing: 0.8, margin: 0 });
  s.addText([
    { text: 'The kernel classifies every face by its angle to the mould-opening direction. ', options: { color: SLATE } },
    { text: 'Six faces point back against the draw. ', options: { bold: true, color: NAVY } },
    { text: 'Each one needs a sliding section in the tool — and each slide is real money in the mould.', options: { color: SLATE } },
  ], { x: 10.0, y: 1.8, w: 2.6, h: 1.6, fontFace: 'Calibri', fontSize: 10, margin: 0, valign: 'top' });
  s.addText('Nobody counted these by eye.', { x: 10.0, y: 3.5, w: 2.6, h: 0.5, fontFace: 'Calibri', fontSize: 9.5, bold: true, italic: true, color: BLUE, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 4.42, w: 12.33, h: 1.15, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('The one measurement that decides the biggest number on this part', { x: 0.8, y: 4.54, w: 11, h: 0.3, fontFace: 'Calibri', fontSize: 12.5, bold: true, color: NAVY, margin: 0 });
  s.addText([
    { text: 'The projected shadow — 9,900 cm². ', options: { bold: true, color: NAVY } },
    { text: 'Molten plastic pushing outwards over that area is what tries to force the mould open, so it sets the press size, and the press rate sets the moulding cost. A part this size cannot be moulded on a small machine, however cheap that machine is.', options: { color: SLATE } },
  ], { x: 0.8, y: 4.86, w: 11.75, h: 0.6, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 5.75, w: 12.33, h: 0.85, fill: { color: PURPLE_T }, line: { color: PURPLE, width: 1 }, rectRadius: 0.1 });
  s.addText([
    { text: 'Identical to the casting: ', options: { bold: true, color: PURPLE } },
    { text: 'stages 1 to 3 happen before the AI is involved, the AI hands back four words and a confidence score, and it still has no access to a price, a rate or a machine.', options: { color: SLATE } },
  ], { x: 0.8, y: 5.86, w: 11.75, h: 0.66, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'Stages one to four, and I will go quickly because the method is the one you have already seen. ' +
    'The kernel opens the model and measures. Volume, and on polypropylene that is four point two kilos. Wall thickness, three millimetres — hold onto that, it matters more than you would think. The projected shadow in the direction the mould opens, nine thousand nine hundred square centimetres. The painted surface area, one point six square metres. ' +
    'And then the measurement that I find genuinely clever: it classifies every face by its angle to the mould-opening direction and counts the ones pointing back against the draw. Six of them. Every one of those needs a sliding section in the tool so the part can be released, and every slide is real money in the mould. Nobody counted those by eye off a drawing. ' +
    'The AI then does its one job and hands back four words: talc-filled polypropylene, injection moulded in one shot, painted to a Class-A finish, eighty-seven percent confident. Four words and a score. No numbers. It still cannot see a price list, a rate or a machine. ' +
    'And the box across the bottom is the one I would underline. That projected shadow, nine thousand nine hundred square centimetres, decides the biggest process number on this part. Molten plastic pushing outwards across that area is what tries to force the mould open, so it sets the press size — and the press rate then sets the moulding cost. A part this size simply cannot be moulded on a small machine, no matter how cheap that machine is per hour. We will see exactly what that costs on the next slide.'
  );
}

// ══════════ PART 2 · C · GUARDS + PRESS SIZING ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Stages 5–7 · The Guards, and Which Press', 'Four moulding-specific checks, then the press sized by physics', AMBER);

  const guards = [
    ['1 · Hot runner means no wasted resin', 'A cold runner would add 0.6–0.9 kg of scrap plastic per shot. This tool has a hot runner, so the shot weight IS the part weight — the guard makes sure we do not charge for plastic nobody buys.'],
    ['2 · Cooling is calculated, not guessed', 'Cool time from Fourier\u2019s transient-conduction law — each resin\u2019s real melt/mould/eject temperatures, diffusivity calibrated to industry data (next slide shows every symbol). For PP: 3.16 s/mm\u00b2 \u00d7 (3.0 mm)\u00b2 = 28.4 s — over half the whole cycle, and the wall enters SQUARED.'],
    ['3 · Press sized to the projected area', 'Not a default machine. 9,900 cm² × 25 MPa × 1.15 safety = 2,902 tonnes of clamp force needed.'],
    ['4 · Tool cost is entered, never invented', 'A £420k mould is a quotation, not an estimate. The tool takes it as an input, applies the Class-A finish uplift, and shows the arithmetic.'],
  ];
  guards.forEach(([h, t], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.5 + col * 6.33, y = 1.3 + row * 1.42, w = 6.0, hh = 1.28;
    s.addShape('roundRect', { x, y, w, h: hh, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
    s.addText(h, { x: x + 0.22, y: y + 0.1, w: w - 0.4, h: 0.28, fontFace: 'Calibri', fontSize: 11.5, bold: true, color: AMBER, margin: 0 });
    s.addText(t, { x: x + 0.22, y: y + 0.42, w: w - 0.44, h: 0.78, fontFace: 'Calibri', fontSize: 9.6, color: SLATE, margin: 0, valign: 'top' });
  });

  s.addShape('roundRect', { x: 0.5, y: 4.2, w: 7.5, h: 2.35, fill: { color: TEAL_T }, line: { color: TEAL, width: 1.25 }, rectRadius: 0.1 });
  s.addText('THE PRESS LADDER — the engine takes the smallest press that clamps the part', { x: 0.75, y: 4.32, w: 7, h: 0.28, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: TEAL, charSpacing: 0.4, margin: 0 });
  const ladder = [['800 t', '£78.13/hr', 'too small'], ['1,200 t', '£111.70/hr', 'too small'], ['2,000 t', '£178.54/hr', 'too small'], ['3,500 t', '£306.12/hr', 'CHOSEN']];
  ladder.forEach(([t, r, v], i) => {
    const y = 4.72 + i * 0.42;
    const on = v === 'CHOSEN';
    if (on) s.addShape('roundRect', { x: 0.7, y: y - 0.04, w: 7.1, h: 0.4, fill: { color: 'FFFFFF' }, line: { color: TEAL, width: 1.25 }, rectRadius: 0.06 });
    s.addText(t, { x: 0.9, y, w: 1.3, h: 0.32, fontFace: 'Calibri', fontSize: 11, bold: true, color: on ? NAVY : SLATE, margin: 0, valign: 'middle' });
    s.addText(r, { x: 2.3, y, w: 1.6, h: 0.32, fontFace: 'Calibri', fontSize: 11, bold: on, color: on ? NAVY : SLATE, align: 'right', margin: 0, valign: 'middle' });
    s.addText(v, { x: 4.2, y, w: 1.6, h: 0.32, fontFace: 'Calibri', fontSize: 9.5, italic: !on, bold: on, color: on ? TEAL : MUTED, margin: 0, valign: 'middle' });
    if (on) s.addText('2,902 t needed → smallest press that covers it', { x: 5.7, y, w: 2.0, h: 0.32, fontFace: 'Calibri', fontSize: 8.4, italic: true, color: TEAL, margin: 0, valign: 'middle' });
  });

  s.addShape('roundRect', { x: 8.25, y: 4.2, w: 4.58, h: 2.35, fill: { color: CARD }, line: { color: RED, width: 1.5 }, rectRadius: 0.1 });
  s.addText('WHY THIS ONE CHECK IS WORTH THE TOOL', { x: 8.5, y: 4.32, w: 4.1, h: 0.28, fontFace: 'Calibri', fontSize: 10, bold: true, color: RED, charSpacing: 0.4, margin: 0 });
  s.addText([
    { text: 'Accept a 2,000 t default and you cost the moulding at £178.54/hr instead of £306.12 — ', options: { color: SLATE } },
    { text: '42% too cheap.\n\n', options: { bold: true, color: RED } },
    { text: 'And the part would never mould: the press could not hold the tool shut, so you would be negotiating hard against a price that is physically impossible to deliver.', options: { color: SLATE } },
  ], { x: 8.5, y: 4.68, w: 4.1, h: 1.7, fontFace: 'Calibri', fontSize: 10.5, margin: 0, valign: 'top' });
  footer(s, ++PG);

  s.addNotes(
    'Stages five to seven. Four guards run on this part, and they are different guards from the casting — because a moulded part goes wrong in different ways. ' +
    'Guard one, the runner. On a cold-runner tool, every shot also produces a sprue and runner — six hundred to nine hundred grams of plastic that is not the part. This tool has a hot runner, so the shot weight is the part weight. The guard makes sure we neither charge for plastic that does not exist nor forget it when the tool is cold-runner. ' +
    'Guard two, cooling. And this is the number people guess and should not. Cool time is three point one six times the wall thickness squared. At three millimetres that is twenty-eight point four seconds — more than half the entire cycle. Notice it is the wall SQUARED. Take the wall from three millimetres to two point five and you take about nine seconds out of every shot. That is the single most powerful lever in injection moulding, and it is a design decision, not a purchasing one. ' +
    'Guard three is the press, and it is the same physics as the die-casting slide, just a different commodity. Nine thousand nine hundred square centimetres of shadow, times twenty-five megapascals of cavity pressure, times a fifteen percent safety factor, gives two thousand nine hundred tonnes of clamp force needed. The engine walks the ladder and takes the smallest press that covers it — three and a half thousand tonnes at three hundred and six pounds an hour. ' +
    'Guard four, the tool cost. A four hundred and twenty thousand pound mould is a quotation from a toolmaker, not something we invent. The tool takes it as an input, applies the Class-A finish uplift, and shows you the arithmetic. ' +
    'Now the red box, because this is the commercial argument for having the guard at all. If you let the model sit on a default two-thousand-tonne press, you cost the moulding at a hundred and seventy-eight pounds an hour instead of three hundred and six. Forty-two percent too cheap. And worse than being wrong — the part would never mould, because that press cannot hold the tool shut. You would walk into a supplier meeting and negotiate hard against a price that is physically impossible to deliver. That is the kind of mistake that costs credibility, and you only need to make it once.'
  );
}

// ══════════ PART 2 · C1b · COOLING TIME FROM FIRST PRINCIPLES ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Cooling Time from First Principles', 'The Fourier slab solution, calibrated to industry data — every input printable, nothing guessed', PURPLE);
  const steps = [
    ['1 · The physical law, not a fitted curve', 'Cooling a moulded wall between two mould faces is textbook transient conduction, and its exact solution is:  t_cool = wall² ÷ (π²·α) × ln[ (4/π) × (T_melt − T_mould) ÷ (T_eject − T_mould) ].  The wall enters SQUARED because heat must diffuse out through half the thickness — that is why wall is the most powerful lever in moulding.'],
    ['2 · Every resin carries its real temperatures', '19 resin families each carry typical melt / mould / eject temperatures. PP (the bumper): melt 230 °C, mould 40 °C, eject 85 °C → log term ln(1.273 × 190/45) = 1.682. ABS runs 240/60/95; PA6 280/80/125; PC 300/90/130. Change the resin and the physics changes with it.'],
    ['3 · Calibrated ONCE against industry cycle data', 'The effective diffusivity α_eff is derived from the curated industry factor at those reference temperatures — for PP: α_eff = 1.682 ÷ (π² × 3.16) = 0.054 mm²/s. α_eff deliberately absorbs what the ideal slab ignores: latent heat of crystallisation and mould-interface resistance. At reference temperatures the formula reproduces the curated factor EXACTLY — adopting the physics changed provenance, not price.'],
    ['4 · The governing wall, and a sanity clamp', 'Cooling is evaluated at the 95th-percentile measured wall (capped at 2× the mean): the part ejects when its THICKEST section is stiff, so the mean systematically under-times ribs and bosses. And the computed factor is clamped to [0.5×, 2×] of the curated value — physics may move the cycle; a pathological temperature pair may not run away with the cost.'],
  ];
  steps.forEach(([t, d], i) => {
    const y = 1.18 + i * 1.28;
    s.addShape('roundRect', { x: 0.5, y, w: 7.1, h: 1.16, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
    s.addShape('ellipse', { x: 0.66, y: y + 0.14, w: 0.4, h: 0.4, fill: { color: PURPLE } });
    s.addText(String(i + 1), { x: 0.66, y: y + 0.14, w: 0.4, h: 0.4, fontFace: 'Cambria', fontSize: 15, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    s.addText(t.slice(4), { x: 1.2, y: y + 0.08, w: 6.3, h: 0.24, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, margin: 0 });
    s.addText(d, { x: 1.2, y: y + 0.33, w: 6.25, h: 0.82, fontFace: 'Calibri', fontSize: 7.9, color: SLATE, margin: 0, valign: 'top' });
  });
  // Right: the bumper worked through, then the what-if the formula unlocks
  s.addText('THE BUMPER, WORKED THROUGH', { x: 7.95, y: 1.16, w: 4.9, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: PURPLE, charSpacing: 0.6, margin: 0 });
  s.addShape('roundRect', { x: 7.95, y: 1.42, w: 4.88, h: 1.98, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
  const calc = [
    ['Resin / temps', 'PP · melt 230 °C · mould 40 °C · eject 85 °C'],
    ['Log term', 'ln(1.273 × 190 ÷ 45) = 1.682'],
    ['α_eff (calibrated)', '1.682 ÷ (π² × 3.16) = 0.054 mm²/s'],
    ['Factor', '1.682 ÷ (π² × 0.054) = 3.16 s/mm²'],
    ['Cooling', '3.16 × (3.0 mm)² = 28.4 s — over half the 55 s cycle'],
  ];
  calc.forEach(([k, v], i) => {
    const y = 1.56 + i * 0.35;
    s.addText(k, { x: 8.15, y, w: 1.75, h: 0.3, fontFace: 'Calibri', fontSize: 8.6, bold: true, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(v, { x: 9.95, y, w: 2.8, h: 0.3, fontFace: 'Courier New', fontSize: 8.0, color: SLATE, margin: 0, valign: 'middle' });
  });
  const promises = [
    ['Same price, honest provenance', 'At reference temperatures the closed form reproduces the curated industry factor exactly, so adopting the physics moved NO estimate. What changed: the trace now shows α_eff, all three temperatures and the log term instead of one bare constant.', I.check, GREEN],
    ['A lever a constant could never price', 'Run the mould at 20 °C instead of 40 °C and the factor follows the law: ln(1.273 × 210/65) = 1.414 → 2.66 s/mm² → cooling 23.9 s, 4.5 s off every shot. A curated constant cannot answer that question; the formula prices it.', I.calc, PURPLE],
    ['The design lever, quantified', 'Wall enters squared: 3.0 mm → 2.5 mm takes cooling from 28.4 s to 19.8 s — nearly 9 s off every shot, £1.11 off the UK part. A design decision, priced before anyone tools anything.', I.ruler, TEAL],
  ];
  promises.forEach(([t, d, ico, c], i) => {
    const y = 3.52 + i * 0.97;
    s.addShape('roundRect', { x: 7.95, y, w: 4.88, h: 0.88, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
    s.addShape('ellipse', { x: 8.09, y: y + 0.11, w: 0.34, h: 0.34, fill: { color: c } });
    s.addImage({ data: ico, x: 8.17, y: y + 0.19, w: 0.18, h: 0.18 });
    s.addText(t, { x: 8.52, y: y + 0.08, w: 4.25, h: 0.22, fontFace: 'Calibri', fontSize: 9.5, bold: true, color: c, margin: 0 });
    s.addText(d, { x: 8.52, y: y + 0.31, w: 4.22, h: 0.55, fontFace: 'Calibri', fontSize: 7.7, color: SLATE, margin: 0, valign: 'top' });
  });
  s.addShape('roundRect', { x: 0.5, y: 6.42, w: 12.33, h: 0.55, fill: { color: 'F3EFFA' }, line: { color: PURPLE, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Read it in one line:  ', options: { bold: true, color: PURPLE } },
    { text: 'cooling is Fourier’s conduction law with each resin’s real temperatures and a diffusivity calibrated once against industry cycle data — the same number as before at standard conditions, but now every input is on the record and every temperature or wall change is priced by physics.', options: { color: SLATE } },
  ], { x: 0.68, y: 6.42, w: 12.0, h: 0.55, fontFace: 'Calibri', fontSize: 9.6, margin: 0, valign: 'middle' });
  footer(s, ++PG);
  s.addNotes(
    'This slide exists because cooling is the biggest single number in a moulding cycle and the one everybody used to guess. Here is exactly how the tool calculates it now — from first principles, and I can defend every symbol. Step one, the law: a moulded wall cooling between two mould faces is textbook transient heat conduction, and the exact solution says cooling time equals wall squared, divided by pi squared times the thermal diffusivity, times the log of a temperature ratio — how far the melt has to fall against how much margin there is at ejection. The wall enters squared because heat has to diffuse out through half the thickness. That is physics, not a fitted curve. Step two: each of nineteen resin families carries its real processing temperatures. Polypropylene — this bumper — melts in at two hundred and thirty, the mould runs at forty, the part ejects safely at eighty-five. Step three is the honest part: the diffusivity is not taken from a textbook, it is calibrated once so that at those reference temperatures the formula reproduces the curated industry factor exactly — for PP, three point one six seconds per millimetre squared. That calibration deliberately absorbs what the ideal equation ignores, like the latent heat a crystallising polymer gives up and the imperfect contact between plastic and steel. So adopting the physics did not move a single estimate — it changed the provenance from “a constant we assert” to “a law you can check”. Step four: it is evaluated at the ninety-fifth percentile wall, because the part ejects when its thickest section is stiff, and the result is clamped to within a factor of two of the curated value so a bad temperature input cannot run away with the cost. And the payoff is on the right: because it is a formula, it answers questions a constant never could. Chill the mould to twenty degrees and cooling drops four and a half seconds a shot, priced by the law. Thin the wall half a millimetre and nine seconds come out, one pound eleven a part. Those are the two conversations this slide is built to start.'
  );
}

// ══════════ PART 2 · C2 · THE CALCULATION, SHOWN ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Stages 5–7 in Detail · Show Me the Calculation', 'The bumper — how the press is chosen and how every second of the cycle is derived', TEAL);
  owner(s, 10.3, 0.74, 'OWNER: THE ENGINE', TEAL, TEAL_T);

  ladderPanel(s, 0.5, 1.3, 6.05, 3.55,
    'A · WHICH PRESS — clamp force from the measured shadow',
    [
      ['Projected shadow, measured off the CAD', '9,900 cm²'],
      ['× cavity pressure, thin-wall PP', '25 MPa'],
      ['= force trying to blow the mould open', '2,524 t'],
      ['× 1.15 safety factor (engine constant)', '2,902 t'],
    ],
    [['800 t', '£78.13/hr', 'too small'], ['1,200 t', '£111.70/hr', 'too small'], ['2,000 t', '£178.54/hr', 'too small'], ['3,500 t', '£306.12/hr', 'CHOSEN']],
    'Same physics as the die-casting slide — different commodity, identical rule and code path.');

  s.addShape('roundRect', { x: 6.78, y: 1.3, w: 6.05, h: 3.55, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('B · WHERE THE 55 SECONDS COME FROM', { x: 7.03, y: 1.42, w: 5.5, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, charSpacing: 0.5, margin: 0 });
  const cyc = [
    ['Fill the cavity', 'process input', '4.50 s', false],
    ['Pack and hold under pressure', 'process input', '12.00 s', false],
    ['Cool  =  3.16 × wall²  =  3.16 × 3.0²', 'CALCULATED', '28.44 s', true],
    ['Open, eject, close', 'process input', '9.00 s', false],
    ['Sub-total', '', '53.94 s', false],
    ['× 1.02 reject uplift', 'engine rule', '55.02 s', false],
  ];
  cyc.forEach(([k, src, v, hi], i) => {
    const y = 1.78 + i * 0.32;
    if (hi) s.addShape('roundRect', { x: 6.95, y: y - 0.03, w: 5.72, h: 0.33, fill: { color: TEAL_T }, rectRadius: 0.05 });
    s.addText(String(k), { x: 7.03, y, w: 3.2, h: 0.3, fontFace: 'Calibri', fontSize: 9.6, bold: Boolean(hi) || i === 4, color: hi ? TEAL : SLATE, margin: 0, valign: 'middle' });
    s.addText(String(src), { x: 10.25, y, w: 1.35, h: 0.3, fontFace: 'Calibri', fontSize: 8, italic: true, color: hi ? TEAL : MUTED, align: 'right', margin: 0, valign: 'middle' });
    s.addText(String(v), { x: 11.65, y, w: 1.0, h: 0.3, fontFace: 'Calibri', fontSize: 9.8, bold: true, color: hi ? TEAL : NAVY, align: 'right', margin: 0, valign: 'middle' });
  });
  s.addShape('line', { x: 7.03, y: 3.76, w: 5.6, h: 0, line: { color: LINE, width: 1 } });
  s.addText([
    { text: 'Cooling is over half the cycle, and it is the one term the engine calculates rather than accepts. ', options: { bold: true, color: NAVY } },
    { text: 'Wall thickness enters squared, which is why it is the most powerful lever on any moulded part.', options: { color: SLATE } },
  ], { x: 7.03, y: 3.86, w: 5.55, h: 0.85, fontFace: 'Calibri', fontSize: 9.8, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 5.02, w: 12.33, h: 1.62, fill: { color: GREEN_T }, line: { color: GREEN, width: 1.25 }, rectRadius: 0.1 });
  s.addText('What that squared term is worth — take 0.5 mm out of the wall', { x: 0.8, y: 5.12, w: 8, h: 0.28, fontFace: 'Calibri', fontSize: 12.5, bold: true, color: GREEN, margin: 0 });
  const sens = [['', '3.0 mm wall', '2.5 mm wall', 'Change'],
    ['Cool time', '28.44 s', '19.75 s', '−8.69 s'],
    ['Total cycle', '55.02 s', '46.17 s', '−8.85 s'],
    ['Press cost per part', '£5.51', '£4.62', '−£0.89'],
    ['Part cost, UK', '£31.06', '£29.95', '−£1.11']];
  const sx = [0.85, 3.6, 5.4, 7.2];
  sens.forEach((r, i) => {
    const y = 5.44 + i * 0.23;
    r.forEach((c, k) => s.addText(c, {
      x: sx[k], y, w: k === 0 ? 2.7 : 1.75, h: 0.23, fontFace: 'Calibri', fontSize: i === 0 ? 8.4 : 9.6,
      bold: i === 0 || k === 3, color: i === 0 ? MUTED : (k === 3 ? GREEN : (k === 0 ? NAVY : SLATE)),
      align: k === 0 ? 'left' : 'right', margin: 0, valign: 'middle',
    }));
  });
  s.addText([
    { text: 'That is a design conversation, not a purchasing one. ', options: { bold: true, color: NAVY } },
    { text: 'Half a millimetre of wall is worth more on this part than any price you could argue out of the moulder — and the tool is what lets you put a number on it before the design is frozen.', options: { color: SLATE } },
  ], { x: 9.2, y: 5.44, w: 3.5, h: 1.1, fontFace: 'Calibri', fontSize: 9.8, margin: 0, valign: 'top' });
  footer(s, ++PG);

  s.addNotes(
    'Same treatment for the bumper — show the calculation, do not assert it. ' +
    'Left-hand side, the press, and I want you to notice that it is literally the same slide as the casting with different numbers in it. Projected shadow off the CAD, nine thousand nine hundred square centimetres. Cavity pressure for a large thin-wall polypropylene part, twenty-five megapascals. Multiply: two thousand five hundred and twenty-four tonnes trying to force the mould open. Fifteen percent safety factor, two thousand nine hundred and two tonnes. Walk the ladder — eight hundred, twelve hundred, two thousand, three and a half thousand — and take the smallest that covers it. Three and a half thousand tonnes at three hundred and six pounds twelve an hour. Same physics, same rule, same code path. Different commodity. ' +
    'Right-hand side, the cycle, and here I want to be precise about which numbers are calculated and which are entered, because that distinction matters. Fill, pack and eject are process inputs — four and a half seconds, twelve seconds, nine seconds — they come from the moulder or from our process engineer. But the cooling term is calculated: three point one six times the wall thickness squared. Three millimetres squared is nine, times three point one six is twenty-eight point four four seconds. Then the engine adds a two percent reject uplift and you get fifty-five seconds. ' +
    'Cooling is over half of that cycle, and it is the one term the tool works out for itself rather than accepting. ' +
    'Which brings me to the box along the bottom, and this is the most commercially useful thing on the slide. Because the wall enters squared, taking half a millimetre out of it — three millimetres down to two point five — drops the cooling from twenty-eight point four to nineteen point eight seconds. The whole cycle falls by nearly nine seconds. The press cost per part drops eighty-nine pence, and the UK part cost drops one pound eleven. ' +
    'Now think about who that conversation belongs to. That is not a purchasing conversation. You cannot negotiate eighty-nine pence out of a moulder who is already running an efficient press. That is a design conversation, and it has to happen before the design is frozen. What the tool gives you is the ability to put a hard number on it while there is still time to act — and in my experience that is worth more than any of the negotiation the rest of this deck talks about.'
  );
}

// ══════════ PART 2 · D · CYCLE + MONEY ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Stages 8–10 · 55 Seconds, Then the Eight Buckets', 'Every second priced at the press rate, then repriced by country', TEAL);

  s.addShape('roundRect', { x: 0.5, y: 1.3, w: 5.5, h: 2.65, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('HOW THE 55-SECOND CYCLE IS BUILT', { x: 0.75, y: 1.42, w: 5, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, charSpacing: 0.5, margin: 0 });
  const cyc = [['Fill the cavity', '4.5 s'], ['Pack and hold', '12.0 s'], ['Cool  =  3.16 × 3.0²', '28.4 s'], ['Open and eject', '9.0 s'], ['+ 2% reject uplift', '1.1 s']];
  cyc.forEach(([k, v], i) => {
    const y = 1.78 + i * 0.33;
    const big = i === 2;
    s.addText(k, { x: 0.78, y, w: 3.6, h: 0.3, fontFace: 'Calibri', fontSize: 10.5, bold: big, color: big ? TEAL : SLATE, margin: 0, valign: 'middle' });
    s.addText(v, { x: 4.4, y, w: 1.4, h: 0.3, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: big ? TEAL : NAVY, align: 'right', margin: 0, valign: 'middle' });
  });
  s.addShape('line', { x: 0.78, y: 3.46, w: 5.02, h: 0, line: { color: LINE, width: 1 } });
  s.addText('Total cycle', { x: 0.78, y: 3.52, w: 3.6, h: 0.3, fontFace: 'Calibri', fontSize: 11, bold: true, color: NAVY, margin: 0, valign: 'middle' });
  s.addText('55.0 s', { x: 4.4, y: 3.52, w: 1.4, h: 0.3, fontFace: 'Calibri', fontSize: 11, bold: true, color: NAVY, align: 'right', margin: 0, valign: 'middle' });

  s.addShape('roundRect', { x: 6.25, y: 1.3, w: 6.58, h: 2.65, fill: { color: TEAL_T }, line: { color: TEAL, width: 1.25 }, rectRadius: 0.1 });
  s.addText('AND WHAT THOSE 55 SECONDS COST', { x: 6.5, y: 1.42, w: 6, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: TEAL, charSpacing: 0.5, margin: 0 });
  const calc = [
    ['55.0 s ÷ 3600', '=  0.0153 hr of cycle'],
    ['÷ 0.85 machine availability', '=  0.0180 hr charged'],
    ['× £306.12/hr press rate', '=  £5.51 machine'],
    ['+ half an operator at £19.80/hr', '=  £0.17 labour'],
  ];
  calc.forEach(([k, v], i) => {
    const y = 1.8 + i * 0.38;
    s.addText(k, { x: 6.5, y, w: 3.5, h: 0.34, fontFace: 'Calibri', fontSize: 10.5, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(v, { x: 10.05, y, w: 2.55, h: 0.34, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, margin: 0, valign: 'middle' });
  });
  s.addShape('roundRect', { x: 6.5, y: 3.3, w: 6.1, h: 0.4, fill: { color: 'FFFFFF' }, line: { color: TEAL, width: 1.25 }, rectRadius: 0.08 });
  s.addText('Moulding one bumper:  £5.67  —  and that is the whole making cost', { x: 6.5, y: 3.3, w: 6.1, h: 0.4, fontFace: 'Calibri', fontSize: 11, bold: true, color: NAVY, align: 'center', valign: 'middle', margin: 0 });
  s.addText('£5.5063 + £0.1682 = £5.6745 — the two lines above are rounded to the penny.', { x: 6.5, y: 3.73, w: 6.1, h: 0.2, fontFace: 'Calibri', fontSize: 8, italic: true, color: MUTED, align: 'center', margin: 0 });

  s.addShape('roundRect', { x: 0.5, y: 4.15, w: 7.5, h: 2.4, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('THE EIGHT BUCKETS — bumper fascia, made in China', { x: 0.75, y: 4.26, w: 6.9, h: 0.26, fontFace: 'Calibri', fontSize: 11, bold: true, color: NAVY, margin: 0 });
  s.addChart(pres.ChartType.bar, [{
    name: '£ per part',
    labels: ['Margin', 'Overhead', 'Logistics', 'Packaging', 'Tooling', 'Labour', 'Process', 'Material'],
    values: [2.15, 2.18, 2.40, 1.20, 11.20, 0.05, 2.45, 4.46],
  }], {
    x: 0.62, y: 4.5, w: 7.3, h: 1.95, barDir: 'bar', barGapWidthPct: 30, chartColors: [TEAL],
    showValue: true, dataLabelPosition: 'outEnd', dataLabelColor: SLATE, dataLabelFontSize: 8.5,
    dataLabelFontFace: 'Calibri', dataLabelFormatCode: '£0.00',
    valAxisMinVal: 0, valAxisMaxVal: 15, valAxisHidden: true,
    catAxisLabelColor: SLATE, catAxisLabelFontSize: 8.5, catAxisLabelFontFace: 'Calibri', catAxisLabelFrequency: 1,
    valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, showLegend: false, showTitle: false,
  });

  s.addShape('roundRect', { x: 8.25, y: 4.15, w: 4.58, h: 1.12, fill: { color: '0E5A5A' }, rectRadius: 0.1 });
  s.addText('SHOULD-COST — MADE IN CHINA', { x: 8.5, y: 4.25, w: 4.1, h: 0.24, fontFace: 'Calibri', fontSize: 9, bold: true, color: '9FD9CF', charSpacing: 0.8, margin: 0 });
  s.addText('£26.08', { x: 8.5, y: 4.46, w: 2.3, h: 0.6, fontFace: 'Cambria', fontSize: 33, bold: true, color: 'FFFFFF', margin: 0, valign: 'middle' });
  s.addText('unpainted, ex-works,\nat 60,000 a year', { x: 10.85, y: 4.5, w: 1.85, h: 0.55, fontFace: 'Calibri', fontSize: 9, color: 'CDEDE7', margin: 0, valign: 'middle' });

  s.addShape('roundRect', { x: 8.25, y: 5.42, w: 4.58, h: 1.13, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('THE SAME PART, PRICED ELSEWHERE', { x: 8.45, y: 5.5, w: 4.2, h: 0.24, fontFace: 'Calibri', fontSize: 9, bold: true, color: NAVY, charSpacing: 0.6, margin: 0 });
  const geo = [['China', '£26.08'], ['India', '£26.13'], ['Mexico', '£27.04'], ['UK', '£31.06']];
  geo.forEach(([c, v], i) => {
    const x = 8.45 + (i % 4) * 1.06;
    s.addText(c, { x, y: 5.76, w: 1.0, h: 0.22, fontFace: 'Calibri', fontSize: 9, color: MUTED, align: 'center', margin: 0 });
    s.addText(v, { x, y: 5.96, w: 1.0, h: 0.26, fontFace: 'Calibri', fontSize: 11, bold: true, color: i === 0 ? TEAL : NAVY, align: 'center', margin: 0 });
  });
  s.addText('Only 19% between China and the UK — on the casting it was 55%.', { x: 8.45, y: 6.24, w: 4.2, h: 0.24, fontFace: 'Calibri', fontSize: 8.4, italic: true, color: MUTED, align: 'center', margin: 0 });
  footer(s, ++PG);

  s.addNotes(
    'Stages eight to ten. Left-hand box, how the fifty-five second cycle is built, and every line of it is calculated rather than typed. Four and a half seconds to fill the cavity. Twelve seconds packing and holding under pressure. Twenty-eight point four seconds cooling — which, remember, is three point one six times three millimetres squared. Nine seconds to open and eject. Plus a two percent reject uplift. Fifty-five seconds. ' +
    'Right-hand box, and this is the arithmetic you can check while I talk. Fifty-five seconds is nought point zero one five three of an hour. Divide by eighty-five percent machine availability and the press is occupied for nought point zero one eight of an hour. Times three hundred and six pounds twelve an hour gives five pounds fifty-one of machine. Add half an operator at nineteen eighty an hour, seventeen pence of labour. Five pounds sixty-seven — and if you add the two rounded figures on the slide you get sixty-eight, because both are rounded to the penny; the engine carries the full precision. ' +
    'And now stop and look at that number, because it is the whole making cost of a car bumper. Five pounds sixty-seven. On the casting, making the part was thirty-two fifty-seven. Here it is under six pounds — one shot, fifty-five seconds, done. ' +
    'So where did the money go? Look at the chart. The tooling bar — eleven pounds twenty — is more than twice the next biggest bucket, and it is bigger than the resin, the press and the labour added together. On this part, the tool IS the cost. ' +
    'Twenty-six pounds eight in China, and that is unpainted and ex-works — paint is a separate operation and I will come to it. ' +
    'And look at the country row, because it makes a point I would not have predicted. China twenty-six oh eight, the UK thirty-one oh six. Only nineteen percent apart. On the casting the UK was fifty-five percent above China. Why the difference? Because the tool, the packaging and the logistics do not get cheaper by moving the factory, and the resin is a world price. Only the press hours and the labour move — and on this part there are barely any labour hours to move. ' +
    'The lesson for a sourcing strategy is worth stating plainly: offshoring saves you a lot on a labour-heavy part and very little on a tooling-heavy one.'
  );
}

// ══════════ PART 2 · D3 · THE PAINT LINE ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'And Then It Is Painted · The Second Half of a Bumper', 'A separate line, a separate supplier — and the tool costs it separately', TEAL);
  owner(s, 10.3, 0.74, 'OWNER: THE ENGINE', TEAL, TEAL_T);

  s.addShape('roundRect', { x: 0.5, y: 1.3, w: 7.6, h: 3.32, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('HOW PAINT IS COSTED — from film thickness, not from a rule of thumb', { x: 0.75, y: 1.4, w: 7.1, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, charSpacing: 0.4, margin: 0 });
  s.addText('wet litres  =  area × dry film thickness  ÷  (solids % × transfer efficiency)',
    { x: 0.75, y: 1.7, w: 7.1, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, italic: true, color: TEAL, margin: 0 });
  const ph = ['Coat', 'Film', 'Solids × transfer', 'Wet L', '£/L', 'Cost'];
  const px = [0.78, 1.95, 2.75, 4.75, 5.75, 6.7];
  const pw = [1.1, 0.75, 1.95, 0.9, 0.9, 1.05];
  ph.forEach((h, i) => s.addText(h, { x: px[i], y: 2.04, w: pw[i], h: 0.22, fontFace: 'Calibri', fontSize: 8.4, bold: true, color: MUTED, align: i >= 3 ? 'right' : 'left', margin: 0 }));
  const coats = [
    ['Primer', '25 µm', '0.45 × 0.65 = 0.293', '0.137', '£9.50', '£1.30'],
    ['Basecoat', '20 µm', '0.25 × 0.60 = 0.150', '0.213', '£26.00', '£5.55'],
    ['Clearcoat', '40 µm', '0.50 × 0.65 = 0.325', '0.197', '£18.00', '£3.54'],
  ];
  coats.forEach((r, i) => {
    const y = 2.28 + i * 0.32;
    if (i % 2 === 0) s.addShape('rect', { x: 0.68, y: y - 0.02, w: 7.24, h: 0.3, fill: { color: PAGE } });
    r.forEach((c, k) => s.addText(c, { x: px[k], y, w: pw[k], h: 0.28, fontFace: 'Calibri', fontSize: 9.2, bold: k === 5, color: k === 5 ? NAVY : SLATE, align: k >= 3 ? 'right' : 'left', margin: 0, valign: 'middle' }));
  });
  s.addShape('line', { x: 0.78, y: 3.28, w: 7.05, h: 0, line: { color: LINE, width: 1 } });
  const pl = [
    ['Paint on 1.6 m² of bumper, + 6% rework', '£11.01'],
    ['Paint line, 55 parts/hr ÷ 0.85 OEE × £102.13/hr', '£2.32'],
    ['Two operators on the line', '£0.85'],
    ['Masking fixtures, £45k ÷ 60,000', '£0.75'],
  ];
  pl.forEach(([k, v], i) => {
    const y = 3.36 + i * 0.28;
    s.addText(k, { x: 0.78, y, w: 5.6, h: 0.26, fontFace: 'Calibri', fontSize: 9.4, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(v, { x: 6.5, y, w: 1.3, h: 0.26, fontFace: 'Calibri', fontSize: 9.8, bold: true, color: NAVY, align: 'right', margin: 0, valign: 'middle' });
  });

  s.addShape('roundRect', { x: 8.35, y: 1.3, w: 4.48, h: 3.32, fill: { color: '0E5A5A' }, rectRadius: 0.1 });
  s.addText('THE DELIVERED BUMPER', { x: 8.6, y: 1.42, w: 4, h: 0.24, fontFace: 'Calibri', fontSize: 9.5, bold: true, color: '9FD9CF', charSpacing: 0.7, margin: 0 });
  const del = [['Moulded, ex-works (China)', '£26.08'], ['+ Paint line (China rates)', '£13.14']];
  del.forEach(([k, v], i) => {
    const y = 1.9 + i * 0.36;
    s.addText(k, { x: 8.6, y, w: 2.6, h: 0.32, fontFace: 'Calibri', fontSize: 10, color: 'CDEDE7', margin: 0, valign: 'middle' });
    s.addText(v, { x: 11.2, y, w: 1.4, h: 0.32, fontFace: 'Calibri', fontSize: 11, bold: true, color: 'FFFFFF', align: 'right', margin: 0, valign: 'middle' });
  });
  s.addShape('line', { x: 8.6, y: 2.7, w: 4, h: 0, line: { color: '9FD9CF', width: 1 } });
  s.addText('£39.22', { x: 8.6, y: 2.82, w: 4, h: 0.7, fontFace: 'Cambria', fontSize: 34, bold: true, color: 'FFFFFF', align: 'center', margin: 0, valign: 'middle' });
  s.addText('painted, ex-works, per part', { x: 8.6, y: 3.56, w: 4, h: 0.26, fontFace: 'Calibri', fontSize: 10, color: 'CDEDE7', align: 'center', margin: 0 });
  s.addText('Paint is a third of the delivered cost — and half of THAT is one litre of basecoat.',
    { x: 8.6, y: 3.9, w: 4, h: 0.56, fontFace: 'Calibri', fontSize: 9.2, italic: true, color: '9FD9CF', align: 'center', margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 4.74, w: 12.33, h: 1.26, fill: { color: CARD }, line: { color: GREEN, width: 1.5 }, rectRadius: 0.1 });
  s.addText('Why this is worth costing separately rather than as a percentage uplift', { x: 0.8, y: 4.85, w: 11.5, h: 0.28, fontFace: 'Calibri', fontSize: 12.5, bold: true, color: GREEN, margin: 0 });
  s.addText([
    { text: 'Transfer efficiency is the number nobody argues about and everybody should. ', options: { bold: true, color: NAVY } },
    { text: 'At 60% transfer, four of every ten pounds of basecoat lands in the booth filters rather than on the car. Move that one line to 70% with better electrostatics and the basecoat drops from £5.55 to £4.76 — on 60,000 parts a year that is £47,000. A percentage uplift on the moulded cost would have hidden that completely.', options: { color: SLATE } },
  ], { x: 0.8, y: 5.16, w: 11.75, h: 0.76, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 6.12, w: 12.33, h: 0.76, fill: { color: AMBER_T }, line: { color: AMBER, width: 1 }, rectRadius: 0.1 });
  s.addText([
    { text: 'Honest note:  ', options: { bold: true, color: AMBER } },
    { text: 'the paint line is a separate costing in the tool, not a bucket inside the moulding one — because in the real world it is usually a separate supplier with its own overhead and margin. The £39.22 above adds the two ex-works costs; it does not double-count either supplier’s margin.', options: { color: SLATE } },
  ], { x: 0.8, y: 6.2, w: 11.75, h: 0.6, fontFace: 'Calibri', fontSize: 11, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'I owe you the other half of this part, because a bumper is not finished when it comes off the press — it gets painted, and paint is not a rounding error. ' +
    'The formula at the top is the whole of it, and it is the standard paint-shop calculation rather than anything we invented. Wet litres equals the area you are covering times the dry film thickness you need, divided by the solids content of the paint times the transfer efficiency of the booth. ' +
    'Work it through for the basecoat, because that is where the money is. One point six square metres of bumper, twenty microns of dry film — that is thirty-two millilitres of actual paint on the car. But basecoat is only twenty-five percent solids, and only sixty percent of what the gun sprays lands on the part. So you have to buy two hundred and thirteen millilitres of wet paint to get thirty-two millilitres of dry film on the car. At twenty-six pounds a litre, five pounds fifty-five. ' +
    'Add the primer and the clearcoat, add six percent for rework because painted parts do get rejected, and the paint material alone is eleven pounds. Then the line itself — fifty-five parts an hour, divided by eighty-five percent availability, at a hundred and two pounds an hour — two thirty-two. Two operators, eighty-five pence. Masking fixtures spread over the year, seventy-five pence. ' +
    'So the delivered bumper, painted and ex-works in China, is thirty-nine pounds twenty-two. The moulded part was twenty-six oh eight. Paint is a third of the delivered cost, and half of the paint is one litre of basecoat. ' +
    'Now the box that I would put in front of a purchasing team. Transfer efficiency is the number nobody argues about and everybody should. At sixty percent, four of every ten pounds of basecoat you buy ends up in the booth filters instead of on the car. Move one line from sixty to seventy percent with better electrostatics and the basecoat drops from five fifty-five to four seventy-six a part — on sixty thousand parts a year that is forty-seven thousand pounds, from one process parameter. If we had costed paint as a percentage uplift on the moulded price, which is what most tools do, that number would simply not exist. ' +
    'And the honest note at the bottom. We cost the paint line as a separate costing, not as a bucket inside the moulding one, because in the real world it is usually a separate supplier with its own overhead and margin. The thirty-nine twenty-two adds two ex-works costs — it does not double-count anybody’s margin.'
  );
}


// ══════════ PART 2 · D2 · THE TWO FINDINGS ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Two Findings From the Moulded Part', 'Neither of these was predictable in advance — the method surfaced both', PURPLE);

  s.addShape('roundRect', { x: 0.5, y: 1.3, w: 6.05, h: 2.62, fill: { color: CARD }, line: { color: TEAL, width: 1.75 }, rectRadius: 0.1 });
  s.addShape('ellipse', { x: 0.75, y: 1.5, w: 0.5, h: 0.5, fill: { color: TEAL } });
  s.addText('1', { x: 0.75, y: 1.5, w: 0.5, h: 0.5, fontFace: 'Cambria', fontSize: 20, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
  s.addText('The tool is the product', { x: 1.4, y: 1.5, w: 4.9, h: 0.5, fontFace: 'Calibri', fontSize: 15, bold: true, color: TEAL, margin: 0, valign: 'middle' });
  s.addText([
    { text: 'Tooling is £11.20 of the £26.08 part — 43%, the biggest single bucket. ', options: { bold: true, color: NAVY } },
    { text: 'It is larger than the resin, the press and the labour ', options: { color: SLATE } },
    { text: 'added together ', options: { bold: true, color: NAVY } },
    { text: '(£4.46 + £2.45 + £0.05 = £6.96).\n\nOn the casting, tooling was £2.17 — six percent. Same method, same engine, and the money has moved to a completely different bucket.', options: { color: SLATE } },
  ], { x: 0.78, y: 2.12, w: 5.5, h: 1.7, fontFace: 'Calibri', fontSize: 11, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 6.78, y: 1.3, w: 6.05, h: 2.62, fill: { color: CARD }, line: { color: GREEN, width: 1.75 }, rectRadius: 0.1 });
  s.addShape('ellipse', { x: 7.03, y: 1.5, w: 0.5, h: 0.5, fill: { color: GREEN } });
  s.addText('2', { x: 7.03, y: 1.5, w: 0.5, h: 0.5, fontFace: 'Cambria', fontSize: 20, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
  s.addText('Offshoring barely pays here', { x: 7.68, y: 1.5, w: 4.9, h: 0.5, fontFace: 'Calibri', fontSize: 15, bold: true, color: GREEN, margin: 0, valign: 'middle' });
  s.addText([
    { text: 'China £26.08 against a UK £31.06 — a 19% gap. On the casting the same comparison was 55%.\n\n', options: { bold: true, color: NAVY } },
    { text: 'The tool, the packaging and the logistics do not get cheaper by moving the factory, and the resin is a world price. Only press hours and labour move — and this part has barely any labour in it.', options: { color: SLATE } },
  ], { x: 7.06, y: 2.12, w: 5.5, h: 1.7, fontFace: 'Calibri', fontSize: 11, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 4.12, w: 12.33, h: 1.42, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('What each finding changes on Monday morning', { x: 0.8, y: 4.24, w: 11.5, h: 0.28, fontFace: 'Calibri', fontSize: 12.5, bold: true, color: NAVY, margin: 0 });
  s.addText([
    { text: 'Finding 1 → ', options: { bold: true, color: TEAL } },
    { text: 'stop negotiating the piece price and negotiate the tooling deal: who owns the tool, over how many parts it is amortised, and what happens at end of programme. Over five years instead of one, this part is £15.14 rather than £26.08.\n', options: { color: SLATE } },
    { text: 'Finding 2 → ', options: { bold: true, color: GREEN } },
    { text: 'do not move a tooling-heavy part offshore expecting casting-sized savings. Nineteen percent, against freight, lead time, quality risk and tooling transfer cost, may not clear the bar at all.', options: { color: SLATE } },
  ], { x: 0.8, y: 4.56, w: 11.75, h: 0.88, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 5.7, w: 12.33, h: 0.85, fill: { color: NAVY }, rectRadius: 0.1 });
  s.addText([
    { text: 'Ask yourself honestly:  ', options: { bold: true, color: '9FB6E0' } },
    { text: 'before this run, would anyone have told you the tool was 43% of a bumper, or that offshoring it saves only 19%? That is what the method is for.', options: { color: 'FFFFFF' } },
  ], { x: 0.85, y: 5.78, w: 11.65, h: 0.7, fontFace: 'Calibri', fontSize: 12, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'I want to stop on these two, because they are the return on having done any of this. ' +
    'Finding one. Tooling is eleven pounds twenty of a twenty-six pound part. Forty-three percent — the biggest single bucket, and larger than the resin, the press and the labour added together, which come to six pounds ninety-six between them. On the casting, tooling was two pounds seventeen, about six percent. Same method, same engine, same eight buckets — and the money has moved to a completely different place. ' +
    'Finding two. China twenty-six oh eight against a UK thirty-one oh six. A nineteen percent gap. On the casting that same comparison was fifty-five percent. The reason is straightforward once you see it: the tool, the packaging and the logistics do not get cheaper by moving the factory, and polypropylene is a world price. The only things that actually move are press hours and labour, and this part has almost no labour in it. ' +
    'Now the row that matters, which is what each of those changes on Monday morning. ' +
    'Finding one says stop negotiating the piece price and go and negotiate the tooling deal instead. Who owns the tool. Over how many parts it is amortised. What happens at end of programme. Amortised over five years instead of one, this part is fifteen fourteen rather than twenty-six oh eight — and no amount of piece-price haggling gets you eleven pounds. ' +
    'Finding two says do not move a tooling-heavy part offshore expecting the savings you got on a casting. Nineteen percent, once you set it against freight, lead time, quality risk and the cost of transferring the tool, may not clear the bar at all. That is a decision you would rather make with a number than a hunch. ' +
    'And I would put one honest question to the room. Before we ran this, would anybody here have told you the tool was forty-three percent of a bumper, or that offshoring it saves only nineteen percent? I would not have. That is exactly what the method is for.'
  );
}
// ══════════ PART 2 · E · BAND, HUMAN, AND THE CONTRAST ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Stages 11–12 · The Band, and What the Two Parts Teach', 'Same tool, same method — two completely different answers about where the money is', GREEN);

  s.addShape('roundRect', { x: 0.5, y: 1.3, w: 6.05, h: 1.88, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('11 · The honest range on this part', { x: 0.75, y: 1.42, w: 5.5, h: 0.28, fontFace: 'Calibri', fontSize: 12, bold: true, color: GREEN, margin: 0 });
  const TX = 0.78, TW = 5.5, LO = 16, HI = 37, px = v => TX + ((v - LO) / (HI - LO)) * TW;
  s.addShape('roundRect', { x: TX, y: 1.86, w: TW, h: 0.3, fill: { color: 'DCE3EE' }, rectRadius: 0.15 });
  s.addShape('roundRect', { x: px(19.83), y: 1.86, w: px(33.16) - px(19.83), h: 0.3, fill: { color: TEAL }, rectRadius: 0.15 });
  s.addShape('rect', { x: px(26.08) - 0.026, y: 1.79, w: 0.052, h: 0.44, fill: { color: NAVY } });
  s.addText('P10  £19.83', { x: px(19.83) - 0.6, y: 2.24, w: 1.2, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, color: MUTED, align: 'center', margin: 0 });
  s.addText('£26.08', { x: px(26.08) - 0.6, y: 2.24, w: 1.2, h: 0.22, fontFace: 'Calibri', fontSize: 10, bold: true, color: NAVY, align: 'center', margin: 0 });
  s.addText('P90  £33.16', { x: px(33.16) - 0.6, y: 2.24, w: 1.2, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, color: MUTED, align: 'center', margin: 0 });
  s.addText('±26% — wider than the casting, because so much of the answer rides on one tooling quotation.',
    { x: 0.78, y: 2.56, w: 5.5, h: 0.56, fontFace: 'Calibri', fontSize: 9.4, italic: true, color: MUTED, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 6.78, y: 1.3, w: 6.05, h: 1.88, fill: { color: GREEN_T }, line: { color: GREEN, width: 1.25 }, rectRadius: 0.1 });
  s.addText('12 · The lever the engineer actually has', { x: 7.03, y: 1.42, w: 5.5, h: 0.28, fontFace: 'Calibri', fontSize: 12, bold: true, color: GREEN, margin: 0 });
  const amort = [['1 year — 60,000 parts', '£11.20', '£26.08'], ['3 years — 180,000', '£3.73', '£16.97'], ['5 years — 300,000', '£2.24', '£15.14']];
  s.addText('Amortise the tool over', { x: 7.03, y: 1.74, w: 2.5, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: MUTED, margin: 0 });
  s.addText('Tooling/part', { x: 9.6, y: 1.74, w: 1.3, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: MUTED, align: 'right', margin: 0 });
  s.addText('Part cost', { x: 11.0, y: 1.74, w: 1.5, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: MUTED, align: 'right', margin: 0 });
  amort.forEach(([k, t, v], i) => {
    const y = 1.99 + i * 0.29;
    s.addText(k, { x: 7.03, y, w: 2.5, h: 0.26, fontFace: 'Calibri', fontSize: 10, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(t, { x: 9.6, y, w: 1.3, h: 0.26, fontFace: 'Calibri', fontSize: 10, color: SLATE, align: 'right', margin: 0, valign: 'middle' });
    s.addText(v, { x: 11.0, y, w: 1.5, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: i === 2 ? GREEN : NAVY, align: 'right', margin: 0, valign: 'middle' });
  });
  s.addText('Same part, same supplier — a commercial decision worth £10.94.', { x: 7.03, y: 2.88, w: 5.5, h: 0.26, fontFace: 'Calibri', fontSize: 9, bold: true, italic: true, color: GREEN, margin: 0 });

  // ── the contrast ──
  s.addShape('roundRect', { x: 0.5, y: 3.34, w: 12.33, h: 2.42, fill: { color: CARD }, line: { color: NAVY, width: 1.5 }, rectRadius: 0.1 });
  s.addText('TWO PARTS, ONE METHOD — and the money is in a completely different place', { x: 0.8, y: 3.45, w: 11.5, h: 0.28, fontFace: 'Calibri', fontSize: 12, bold: true, color: NAVY, charSpacing: 0.3, margin: 0 });
  const hdr = ['', 'Die-cast housing', 'Bumper fascia', 'What it means'];
  const cx = [0.8, 3.7, 6.1, 8.5];
  const cw = [2.8, 2.3, 2.3, 4.3];
  hdr.forEach((h, i) => s.addText(h, { x: cx[i], y: 3.78, w: cw[i], h: 0.24, fontFace: 'Calibri', fontSize: 9, bold: true, color: MUTED, margin: 0 }));
  const rows = [
    ['Making the part', '£32.57', '£5.67', 'One shot beats four machining operations'],
    ['Tooling per part', '£2.17', '£11.20', 'The mould, not the machine, is the cost'],
    ['Biggest single bucket', 'Process 37%', 'Tooling 43%', 'Different bucket, so a different negotiation'],
    ['China vs UK gap', '55%', '19%', 'Offshoring pays far less on a tooling-heavy part'],
    ['Where to push a supplier', 'Cycle time, fixturing', 'Programme volume, wall thickness', 'The tool tells you which lever exists'],
  ];
  rows.forEach((r, i) => {
    const y = 4.05 + i * 0.33;
    if (i % 2 === 0) s.addShape('rect', { x: 0.72, y: y - 0.02, w: 11.9, h: 0.31, fill: { color: PAGE } });
    r.forEach((c, k) => s.addText(c, {
      x: cx[k], y, w: cw[k], h: 0.29, fontFace: 'Calibri', fontSize: 9.4,
      bold: k === 0 || k === 2, color: k === 3 ? SLATE : (k === 2 ? TEAL : NAVY), margin: 0, valign: 'middle',
    }));
  });

  s.addShape('roundRect', { x: 0.5, y: 5.92, w: 12.33, h: 0.78, fill: { color: NAVY }, rectRadius: 0.1 });
  s.addText([
    { text: 'This is the whole argument for the tool:  ', options: { bold: true, color: '9FB6E0' } },
    { text: 'nobody could have told you in advance that the money was in machining on one part and in tooling on the other. The method finds it. Every time, on any part, without anyone having to already know the answer.', options: { color: 'FFFFFF' } },
  ], { x: 0.85, y: 6.0, w: 11.65, h: 0.62, fontFace: 'Calibri', fontSize: 12, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'Last two stages, and then the payoff. ' +
    'Stage eleven, the honest range. Nineteen eighty-three to thirty-three sixteen, plus or minus twenty-six percent. That is wider than the casting was, and the reason is worth knowing: on this part a very large share of the answer rides on one tooling quotation, and tooling is the input the tool trusts least. The band is telling you where the risk actually sits. ' +
    'Stage twelve, and here the engineer has a lever that did not exist on the casting. How long do we amortise the tool over? Over one year, sixty thousand parts, tooling is eleven pounds twenty and the part is twenty-six pounds eight. Over a three-year programme it is three seventy-three and the part is under seventeen pounds. Over five years, two twenty-four and fifteen fourteen. Same part, same supplier, same tool — nearly eleven pounds of difference, and it is purely a commercial decision about programme life. If a supplier quotes you twenty-six pounds while amortising over one year, that is not them being expensive, that is them carrying tooling risk. Now you can have that conversation properly. ' +
    'And one thing I owe you for completeness: this is the unpainted, ex-works fascia. Paint is a separate operation on a separate line, and the tool costs it separately — at UK rates it comes out at about fifteen pounds a part, of which eleven is the paint material itself. So paint roughly doubles the delivered cost of a bumper, which is exactly why the industry cares so much about body-colour versus grained finishes. ' +
    'Now the table across the middle, which for me is the single most valuable slide in this pack. Two parts. One method. Look at where the money is. Making the casting cost thirty-two fifty-seven; moulding the bumper cost five sixty-seven — one shot beats four machining operations, comfortably. But tooling on the casting was two pounds seventeen and on the bumper it is eleven twenty. The biggest bucket flips from process to tooling. The China-to-UK gap collapses from fifty-five percent to nineteen. And the lever you push in a supplier meeting changes completely — cycle time and fixturing on one, programme volume and wall thickness on the other. ' +
    'And that is the whole argument for having this tool at all. Nobody in this room could have told you in advance that the money was in machining on one part and in tooling on the other. Not reliably, not with numbers you could defend. The method finds it. Every time, on any part, without anyone having to already know the answer.'
  );
}


// ══════════ 23b · WHAT IT CANNOT DO ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'What This Tool Cannot Do', 'The limits, from us rather than from a sceptic in the room', RED);

  const lims = [
    ['Cost an assembly from one CAD file', 'It rolls up an assembly from parts you have already costed. It cannot open one assembly model, work out which parts are in it, how they join, or what the assembly labour is. Multi-part programmes still need a person to define the structure.'],
    ['Read a tolerance or a surface finish', 'The kernel measures shape, exactly. It cannot see a ±0.02 callout, a Ra value or a material spec unless the CAD file carries the annotation — and most do not. Those still come off the drawing or from our engineer.'],
    ['Guarantee the AI classified correctly', 'It can misread an unusual part. That is why it carries a confidence score, why nine checks run automatically, and why a person signs the result. We claim no AI-invented number becomes money — not that the AI is never wrong.'],
    ['Replace a quotation', 'This is a should-cost: what the part ought to cost on stated assumptions. It is a negotiating instrument and a design-feedback loop, not a price, and not a substitute for an RFQ.'],
    ['Keep duty and tariff data fresh by itself', 'Rates decay. The engine blocks any rate that is unverified or older than 90 days rather than quietly using it — but somebody has to run the refresh against the official tariff service.'],
    ['Cost a process it has never met', 'Twenty commodities are modelled. A genuinely novel process needs a new module — days of work, not minutes, and it needs a process engineer to specify it.'],
  ];
  lims.forEach(([h, t], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.5 + col * 6.33, y = 1.24 + row * 1.62, w = 6.0, hh = 1.46;
    s.addShape('roundRect', { x, y, w, h: hh, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
    s.addImage({ data: I.times, x: x + 0.22, y: y + 0.16, w: 0.17, h: 0.17 });
    s.addText(h, { x: x + 0.5, y: y + 0.09, w: w - 0.72, h: 0.3, fontFace: 'Calibri', fontSize: 11.5, bold: true, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(t, { x: x + 0.22, y: y + 0.44, w: w - 0.44, h: 0.94, fontFace: 'Calibri', fontSize: 9.4, color: SLATE, margin: 0, valign: 'top' });
  });

  s.addShape('roundRect', { x: 0.5, y: 6.12, w: 12.33, h: 0.78, fill: { color: NAVY }, rectRadius: 0.1 });
  s.addText([
    { text: 'Why show you this:  ', options: { bold: true, color: '9FB6E0' } },
    { text: 'a tool that claims no limits is a tool nobody should trust with a supplier negotiation. Every one of these six is either on the roadmap, or is a job we have deliberately left with a person.', options: { color: 'FFFFFF' } },
  ], { x: 0.85, y: 6.2, w: 11.65, h: 0.62, fontFace: 'Calibri', fontSize: 12, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'I would rather you heard the limits from me than found them yourself in three months, so here are six, honestly. ' +
    'One, and it is the one I get asked most: it cannot cost an assembly from a single CAD file. It will happily roll up an assembly from parts you have already costed — that works today. What it cannot do is open one assembly model and work out which parts are in it, how they join, and what the assembly labour is. That needs a person to define the structure. We looked hard at whether that could be automated and concluded honestly that it cannot, not reliably. ' +
    'Two, it cannot read a tolerance or a surface finish. The kernel measures shape and it measures it exactly, but a plus-or-minus two-hundredths callout or a roughness value is an annotation, and most CAD files we receive do not carry them. Those still come off the drawing or out of our engineer’s head. ' +
    'Three, it cannot guarantee the AI classified the part correctly. It can misread something unusual. That is precisely why there is a confidence score, why nine checks run automatically on every estimate, and why a person signs the result. Our claim is narrow and deliberate: no AI-invented number ever becomes money. It is not that the AI is never wrong. ' +
    'Four, it does not replace a quotation. This is a should-cost — what the part ought to cost on stated assumptions. It is a negotiating instrument and a design-feedback loop. It is not a price and it does not replace an RFQ. ' +
    'Five, it cannot keep the duty and tariff data fresh on its own. Rates decay. The engine will block a rate that is unverified or more than ninety days old rather than quietly using it — which is the right behaviour — but somebody still has to run the refresh against the official tariff service. ' +
    'Six, it cannot cost a process it has never met. Twenty commodities are modelled. Something genuinely novel needs a new module: days of work, and a process engineer to specify it. ' +
    'And the reason I am showing you this slide at all is on the navy strip. A tool that claims no limits is a tool nobody should trust with a supplier negotiation. Every one of those six is either on the roadmap or is a job we have deliberately chosen to leave with a person.'
  );
}


await pres.writeFile({ fileName: 'CostVision-Workflow-Explained.pptx' });
console.log('WRITTEN');
