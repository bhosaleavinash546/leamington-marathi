/**
 * "How CostVision Actually Works" — the 46-slide workflow explainer.
 *
 * Slides 39–46 are the DFM/DFA & idea-generation rule-library appendix,
 * transcribed from calculator/src/engine/dfm-dfa.ts + idea-levers.ts +
 * modules/*-advisor.ts (52 rules · 19 parameters/signals · 10 advisors ·
 * 36 levers) — keep them in sync if those engines' thresholds change.
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
    { text: 'the rules derive every input, the engine does every calculation, a person approves the answer — and the AI is an optional second opinion.', options: { color: 'FFFFFF', bold: true } },
  ], { x: 1.1, y: 3.95, w: 11.1, h: 0.75, fontFace: 'Calibri', fontSize: 15, margin: 0, valign: 'middle' });
  s.addText('Worked example: die-cast aluminium housing · 2.8 kg · 60,000 per year · made in China',
    { x: 0.8, y: 5.1, w: 11.7, h: 0.3, fontFace: 'Calibri', fontSize: 13, color: '8FA3CC', margin: 0 });
  s.addNotes(
    'Thank you all for coming back. In the last session I showed you what this tool produces. The feedback I got — very fairly — was that the workflow itself was still a black box. People told me they could not follow who does what, and where the AI actually sits in all this. So today I am going to open the box. ' +
    'I am going to take one real part — a die-cast aluminium housing, the sort of thing we buy tens of thousands of a year — and walk it through the tool from the moment we upload the CAD file to the moment a buyer walks into a supplier meeting with a number. Every single step. ' +
    'And I will keep colour-coding who owns each step, because that is the bit that has been confusing. Blue is measuring. Purple is the AI. Amber is the safety checks. Teal is the costing engine doing the arithmetic. Green is where a human signs it off. ' +
    'If you take one line away today, take the line on the screen: the rules derive every input, the engine does every calculation, a person approves the answer — and the AI is an optional second opinion, off by default. Everything I show you for the next twenty minutes is an elaboration of that sentence.'
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
    ['1', 'Orientation', 'Slides 3–7', 'How the whole thing connects, and what it is worth against costing by hand', '8 min', BLUE, true],
    ['2', 'Worked example one — die-cast aluminium housing', 'Slides 8–26', 'Twelve stages end to end: measure, derive, guard, calculate, approve — including the calculation and the confidence band shown in full.', '22 min', TEAL, false],
    ['3', 'Worked example two — injection-moulded bumper fascia', 'Slides 27–37', 'The same method on a very different part — plus paint, and the two findings nobody predicted', '18 min', PURPLE, false],
    ['4', 'The honest limits', 'Slide 38', 'Six things this tool cannot do, from us rather than from a sceptic in the room', '5 min', RED, true],
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
    { text: 'slides 3–4 (how it connects, incl. the PCB flow) · slides 5–9 (the business case) · slide 26 (the housing on one page) · slide 36 (the two findings) · slide 38 (the limits). Everything in between is the evidence for those five.', options: { color: 'FFFFFF' } },
  ], { x: 0.85, y: 6.02, w: 11.65, h: 0.72, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'Quick map of where we are going, because there is more here than an hour needs and I would rather you chose than sat through all of it. ' +
    'Section one, five slides: how the whole thing connects, and what it is worth measured against doing the same job by hand — including the category-by-category comparison with CAPEE from our internal review. About eight minutes. ' +
    'Section two is the first worked example — a die-cast aluminium housing, followed through all twelve stages from CAD file to defensible price, including the calculation shown in full so you can check it. Eighteen slides, about twenty-two minutes, and it is the heart of the pack. ' +
    'Section three does the same thing on a completely different part, an injection-moulded bumper fascia, plus paint, plus two findings that I genuinely did not predict. Eleven slides, about eighteen minutes. ' +
    'Section four is five minutes on what the tool cannot do. ' +
    'And the strip along the bottom is there because I have been in enough of these meetings. If the hour collapses to ten minutes, take slides three and four, the three business-case slides, slide twenty-six, slide thirty-six and slide thirty-eight. Everything in between is the evidence for those five, and you can read it afterwards.'
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
    { text: 'Words back, never money — no price, no machine, no DFM score. ', options: { color: SLATE } },
    { text: 'One required use: a PCB PHOTO ', options: { bold: true, color: PURPLE } },
    { text: '— vision reads the board; prices still come from the offline catalogue.', options: { color: SLATE } },
  ], { x: 3.28, y: 1.27, w: 4.35, h: 0.46, fontFace: 'Calibri', fontSize: 7.8, margin: 0, valign: 'top' });
  s.addText('Routable to a private endpoint · AIR_GAPPED=1 refuses the call — CAD costing still works', { x: 3.28, y: 1.79, w: 4.35, h: 0.2, fontFace: 'Calibri', fontSize: 7.6, italic: true, color: PURPLE, margin: 0 });
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
  col(0.65, 2.0, 'WHAT GOES IN', BLUE, ['3D CAD model\n(STEP / IGES / STL)', 'Photo of a PCB —\nAI vision reads it (↑)', 'Plain description\nor an RFQ sheet', 'Volume + region\n(the engineer types)'], 2.74);
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
    'Before the twelve stages, the whole thing on one picture — and one important update since the last session: the tool is now deterministic by default. Start in the middle-left. The blue box measures the part — OCCT, real geometry, never guessed. Below it the indigo box is new: the rules engine. Twelve commodities of explicit engineering rules that derive every cost input straight from the measurement — cycle times, tooling, press size, yield. Where geometry genuinely cannot know something — what the part is made of, whether it is safety-critical, how many a year — the tool does not guess. It stops and asks the engineer, that is the green box, and the costing is blocked until a person answers. That combination is what changed: the purple box at the top, the AI, is now OPTIONAL. Three modes on the form: Rules only, which is the default and makes no outbound call at all; Compare, which runs both and shows you exactly where they disagree, field by field; and AI-led, the old behaviour, kept for comparison. When the AI does run, its words come down through the amber guardrails — nine sanity checks, and its numbers are overwritten wherever the rules can derive the value, its machining time capped by what the stock could physically give up. On the right, unchanged: the rate library is still the only source of money in the tool, the local database holds our parts and real actuals for calibration, the engine is still fixed eight-bucket arithmetic with no judgement in it, and the uncertainty layer turns the number into an honest range. The one line: the kernel measures, the rules derive, the engineer answers, the guardrails check, the engine calculates. The AI is a second opinion — useful, optional, and unable to reach the money. Three annotations on this version of the picture, from questions this room asked. Every box badged AUTO runs unattended — the only HUMAN badge on the slide is the engineer, answering material, duty, volume and region, and approving. WHO picks the machine and the tonnage: the indigo rules-and-optimisers box — presses and dies sized by clamp and forming physics, and the machining routing and mould cavitation actually cost-ranked, with the losing options printed in the trace. And WHERE the DFM, DFA and saving ideas come from: the cost engine itself — rule thresholds and geometry advisors, every idea priced — not from the AI; you can see that on the outputs column now, and it is verified in the source code. Two more things this version of the picture carries. The little green card top-left is why to believe the boxes: the tool is deterministic — same file and same answers give the same price, every time; twelve of the eighteen commodities are fully rules-driven and the slide says so honestly; the arithmetic sits behind roughly one and a half thousand automated tests; and it has been validated against six real parts with independent manual costs, at about thirteen percent fleet error. And the small dashed arrow feeding back into the local database is the flywheel: every won quote and real invoice we record calibrates the estimates and tightens the confidence band — this is a tool that gets better the more we use it. One flow deserves its own sentence because it is the exception to the rules-first rule: the PCB photo. A photograph has no geometry for the kernel to measure, so this is the one input where the AI is REQUIRED — its vision reads the board and names the components and the fab spec. But naming is all it does: the board spec is then stabilised deterministically, every component price is snapped to our OFFLINE price catalogue with class-median caps — the model never prices a component — and the deterministic PCB fabrication and assembly models cost the board from the rate library like any other part. The live distributor pricing you see top-right is optional and off by default. So even on the one path that needs the AI\u2019s eyes, the money never comes from the AI.'
  );
}

// ══════════ 1b2 · THE PCB WORKFLOW — ONE PICTURE ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  logoMark(s, 0.5, 0.22, 0.6);
  s.addText('The PCB Photo → Should-Cost — One Picture', { x: 1.25, y: 0.2, w: 9.6, h: 0.44, fontFace: 'Cambria', fontSize: 24, bold: true, color: NAVY, margin: 0, valign: 'middle' });
  s.addText('The one flow where the AI is required — its eyes read the board; the catalogue prices it, the engine costs it, the engineer owns the doubtful lines.', { x: 1.25, y: 0.66, w: 11.0, h: 0.28, fontFace: 'Calibri', fontSize: 11, italic: true, color: MUTED, margin: 0 });

  // ── OUTSIDE: AI VISION — required for this input ──
  s.addShape('roundRect', { x: 2.55, y: 1.02, w: 7.6, h: 0.99, fill: { color: PURPLE_T }, line: { color: PURPLE, width: 1.5 }, rectRadius: 0.09 });
  s.addShape('ellipse', { x: 2.70, y: 1.28, w: 0.44, h: 0.44, fill: { color: PURPLE } });
  s.addImage({ data: I.eye, x: 2.81, y: 1.39, w: 0.22, h: 0.22 });
  s.addText('AI VISION — REQUIRED here (a photo has no geometry to measure) · the only outbound call', { x: 3.28, y: 1.08, w: 6.8, h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: PURPLE, charSpacing: 0.4, margin: 0 });
  s.addText([
    { text: 'Pass 1: ', options: { bold: true, color: NAVY } },
    { text: 'names the board (dims, layers, finish) and EVERY component — reference, package, part number where legible — with a confidence per line. ', options: { color: SLATE } },
    { text: 'Pass 2: ', options: { bold: true, color: NAVY } },
    { text: 're-inspects the markings of every unconfirmed part. ', options: { color: SLATE } },
    { text: 'Words only — it prices nothing.', options: { bold: true, color: PURPLE } },
  ], { x: 3.28, y: 1.29, w: 6.75, h: 0.5, fontFace: 'Calibri', fontSize: 8.4, margin: 0, valign: 'top' });
  s.addText('Photo fingerprint cached (SHA-256) — the same photos never pay for a second read', { x: 3.28, y: 1.79, w: 6.75, h: 0.2, fontFace: 'Calibri', fontSize: 7.6, italic: true, color: PURPLE, margin: 0 });

  // ── boundary ──
  s.addShape('roundRect', { x: 0.45, y: 2.18, w: 12.4, h: 4.4, fill: { color: 'FFFFFF' }, line: { color: TEAL, width: 1.75, dashType: 'dash' }, rectRadius: 0.12 });
  s.addShape('roundRect', { x: 0.75, y: 2.05, w: 3.5, h: 0.28, fill: { color: TEAL }, rectRadius: 0.14 });
  s.addText('INSIDE — RUNS ON YOUR OWN SERVER', { x: 0.75, y: 2.05, w: 3.5, h: 0.28, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, charSpacing: 0.5 });
  s.addShape('line', { x: 6.35, y: 2.01, w: 0, h: 0.67, line: { color: PURPLE, width: 1.5, beginArrowType: 'triangle', endArrowType: 'triangle' } });

  const link2 = (x1, y1, x2, y2, col, wid = 1.75) => s.addShape('line', {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
    flipH: x2 < x1, flipV: y2 < y1,
    line: { color: col, width: wid, endArrowType: 'triangle' },
  });
  const node2 = (x, y, w, h, col, tint, ttl, body, ico) => {
    s.addShape('roundRect', { x, y, w, h, fill: { color: tint }, line: { color: col, width: 1.4 }, rectRadius: 0.09 });
    if (ico) { s.addShape('ellipse', { x: x + 0.14, y: y + 0.12, w: 0.34, h: 0.34, fill: { color: col } }); s.addImage({ data: ico, x: x + 0.22, y: y + 0.20, w: 0.18, h: 0.18 }); }
    s.addText(ttl, { x: x + (ico ? 0.56 : 0.16), y: y + 0.11, w: w - (ico ? 0.70 : 0.32), h: 0.30, fontFace: 'Calibri', fontSize: 9.6, bold: true, color: col, margin: 0, valign: 'middle' });
    s.addText(body, { x: x + 0.16, y: y + 0.45, w: w - 0.32, h: h - 0.58, fontFace: 'Calibri', fontSize: 8.0, color: SLATE, margin: 0, valign: 'top' });
  };
  const chip2 = (x, y, label, bg) => {
    s.addShape('roundRect', { x, y, w: 0.6, h: 0.17, fill: { color: bg }, rectRadius: 0.085 });
    s.addText(label, { x, y, w: 0.6, h: 0.17, fontFace: 'Calibri', fontSize: 6.2, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, charSpacing: 0.5 });
  };

  // inputs / outputs
  const col2 = (x, w, label, c, items, y0, pitch = 0.80) => {
    s.addText(label, { x, y: y0 - 0.3, w, h: 0.24, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: c, charSpacing: 0.6, margin: 0 });
    items.forEach((t, i) => {
      const y = y0 + i * pitch;
      s.addShape('roundRect', { x, y, w, h: 0.68, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.07 });
      s.addText(t, { x: x + 0.13, y, w: w - 0.26, h: 0.68, fontFace: 'Calibri', fontSize: 8.4, color: SLATE, margin: 0, valign: 'middle' });
    });
  };
  col2(0.65, 2.0, 'WHAT GOES IN', BLUE, ['Photo(s) of the board\n(top / bottom)', 'Annual qty + region\n(the engineer types)', 'Known dims / layers\n(optional overrides)'], 2.74);
  col2(11.05, 1.8, 'WHAT COMES OUT', GREEN, ['Priced BOM — every line\nconfirmed or capped', 'Fab spec + 8-bucket\nboard cost', 'Confirmed vs needs-\nverification headline', 'PDF report + country\ncomparison'], 2.74, 0.76);

  // pipeline nodes
  node2(2.85, 2.68, 2.35, 1.22, '4F46E5', 'EEF2FF', 'BOM parser + salvage', 'Parses the model’s list; SALVAGES truncated replies line by line; automotive keywords force the conservative class.', I.cog);
  node2(2.85, 4.06, 2.35, 1.22, '4F46E5', 'EEF2FF', 'Board-spec stabiliser', 'Dims, layers and finish snapped to stable values — re-running the same photos gives the same board.', I.ruler);
  node2(5.45, 2.68, 2.3, 1.35, AMBER, AMBER_T, 'Price grounding', 'Confirmed lines SNAP to the offline catalogue; unreadable lines get the class-median CAP; volume scaling from the 10k base. The model never prices.', I.shield);
  node2(5.45, 5.30, 2.3, 1.16, GREEN, GREEN_T, 'The engineer', 'Reviews every flagged line, edits any BOM line — a real quote overrides the catalogue.', I.person);
  s.addShape('roundRect', { x: 8.2, y: 2.68, w: 2.5, h: 1.86, fill: { color: '0E5A5A' }, rectRadius: 0.1 });
  s.addShape('ellipse', { x: 9.2, y: 2.84, w: 0.5, h: 0.5, fill: { color: '17A398' } });
  s.addImage({ data: I.calc, x: 9.33, y: 2.97, w: 0.24, h: 0.24 });
  s.addText('COST ENGINE', { x: 8.3, y: 3.42, w: 2.3, h: 0.3, fontFace: 'Calibri', fontSize: 11.5, bold: true, color: 'FFFFFF', align: 'center', margin: 0, valign: 'middle' });
  s.addText('PCB fab model: layers × area × finish, panelisation.\nAssembly: placements, AOI, test — at country rates.', { x: 8.3, y: 3.74, w: 2.3, h: 0.72, fontFace: 'Calibri', fontSize: 7.6, color: '9FD9CF', align: 'center', margin: 0, valign: 'top' });
  node2(8.2, 4.76, 2.5, 0.92, TEAL, TEAL_T, 'Country rates', 'Real per-country labour £/hr and electricity £/kWh (IPC/CBRE published figures) — not scaled guesses.', null);

  // flows
  link2(2.65, 3.29, 2.85, 3.29, BLUE);                       // photos → (up via AI) parser
  link2(3.95, 3.90, 3.95, 4.06, '4F46E5');                   // parser ↓ stabiliser
  link2(5.20, 3.29, 5.45, 3.29, '4F46E5');                   // parser → grounding
  link2(5.20, 4.67, 5.45, 3.85, '4F46E5', 1.4);              // stabiliser → grounding
  link2(7.75, 3.35, 8.2, 3.35, AMBER);                       // grounding → engine
  link2(8.2, 5.22, 7.75, 5.60, TEAL, 1.4);                   // rates ← ... engine↔rates adjacency
  link2(6.6, 5.30, 6.6, 4.03, GREEN, 1.4);                   // engineer ↑ grounding (overrides)
  link2(10.70, 3.55, 11.05, 3.55, GREEN);                    // engine → outputs
  link2(10.70, 5.20, 11.05, 5.95, GREEN, 1.4);
  // AUTO/HUMAN chips
  chip2(4.59, 2.59, 'AUTO', '4F46E5');
  chip2(4.59, 3.97, 'AUTO', '4F46E5');
  chip2(7.14, 2.59, 'AUTO', AMBER);
  chip2(10.09, 2.59, 'AUTO', '0E8074');
  chip2(10.09, 4.67, 'AUTO', TEAL);
  chip2(7.14, 5.21, 'HUMAN', GREEN);

  s.addShape('roundRect', { x: 0.45, y: 6.70, w: 12.4, h: 0.42, fill: { color: 'EAF6EF' }, line: { color: GREEN, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Read it in one line:  ', options: { bold: true, color: GREEN } },
    { text: 'the AI’s eyes read the board and name every part — then the offline catalogue prices it, the deterministic fab + assembly models cost it, and the engineer owns every doubtful line. The model never prices a component.', options: { color: SLATE } },
  ], { x: 0.65, y: 6.70, w: 12.0, h: 0.42, fontFace: 'Calibri', fontSize: 10, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'The previous slide had one exception on it, and it deserves its own picture: the PCB photo, the one flow in the tool where the AI is genuinely required. Here is exactly what happens, stage by stage, straight from the code. ' +
    'What goes in: one or more photographs of the board — top and bottom if we have them — the annual quantity and region our engineer types, and any dimensions or layer counts we already know as optional overrides. ' +
    'The photo goes up to the AI’s vision, and this is the only outbound call on the path. It makes two passes. Pass one names the board — dimensions, layer count, surface finish — and every component it can see: reference designator, package, and the part number where the marking is legible, each line carrying its own confidence. Pass two goes back and re-inspects the markings of every part it could not confirm the first time. And that is the entirety of its job: words. It prices nothing. The photos are fingerprinted, so the same board never pays for a second reading. ' +
    'Everything after that line is deterministic and runs on our own server. The BOM parser normalises the model’s list and — a real lesson from a real failure — salvages line by line when a long automotive board truncates the reply, so a two-hundred-line BOM cannot silently come back empty. Automotive keywords force the conservative component class. The board-spec stabiliser snaps dimensions and layers to stable values, so re-running the same photos gives the same board and the same price. ' +
    'Then the money, and this is the slide’s most important box: price grounding. Every line the vision CONFIRMED snaps to our offline price catalogue — curated market prices, no distributor API, volume-scaled from the ten-thousand base. Every line it could NOT confirm gets the class-median cap, so one unreadable chip cannot balloon the BOM, and it is flagged for a person. The model never prices a component — not one. ' +
    'The cost engine then does what it does for every commodity: the fabrication model prices the bare board from layers, area, finish and panelisation — how many boards actually fit a panel — and the assembly model prices placement, inspection and test, at real per-country labour and electricity rates from published figures, not scaled guesses. ' +
    'And the human: our engineer reviews every flagged line, can edit any line of the BOM, and a real quotation overrides the catalogue — same rule as everywhere else in the tool. What comes out: a priced BOM where every line says whether it is confirmed or capped, the fab spec and the eight-bucket board cost, the honest headline split between confirmed cost and cost that still needs verification, and the PDF report with the country comparison. ' +
    'One line to keep: the AI’s eyes read the board — the catalogue prices it, the engine costs it, the engineer owns the doubt.'
  );
}

// ══════════ 2b · THE BUSINESS CASE (five management slides) ══════════
{
  // ── Business case I — where the money comes from ──
  // Time savings do not convince a budget holder. The previous version of this
  // section proved "one engineer-year" and then said "capacity, not headcount",
  // which to a finance ear reads as "nothing comes out". The money in a
  // should-cost tool is the negotiation floor and design-stage avoidance. Every
  // figure below is either measured by the tool or a labelled planning
  // assumption printed on the slide for the room to attack.
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Business Case I — Where the Money Comes From', 'Three value streams, one transparent calculation — every assumption is on the slide and open to challenge', GREEN);

  const streams = [
    [I.coins, 'A · Negotiation floor', GREEN,
      'A defensible should-cost turns a quote into a conversation with a floor price under it. Supplier margin and overhead are priced as separate lines, and every line prints its own derivation — so the challenge survives the meeting.',
      'Measured: £3.22/part of ranked opportunity on the £25.14 reference part — 12.8%, of which the commercial levers alone are £5.28.'],
    [I.cube, 'B · Design-stage avoidance', TEAL,
      'Cost known while the design can still move. At 10–15 minutes a part this runs at concept stage rather than after the quote lands, while wall thickness, cavitation and routing are all still open.',
      'Measured: on the bumper, tooling was 43% of piece cost — more than resin, press and labour combined. Nobody predicted that before the run.'],
    [I.person, 'C · Engineering capacity', BLUE,
      'The hours are the enabler, not the prize. You cannot hold 40 floor-price negotiations a year if each should-cost costs half a day to prepare — capacity is what makes stream A reachable at all.',
      'Measured: 16–30× faster than the confirmed CAPEE baseline · ≈1,650 h/yr on an illustrative 500-part mix.'],
  ];
  streams.forEach(([ico, t, col, body, ev], i) => {
    const x = 0.5 + i * 4.19;
    s.addShape('roundRect', { x, y: 1.14, w: 3.94, h: 1.9, fill: { color: CARD }, line: { color: col, width: 1.5 }, rectRadius: 0.1 });
    s.addShape('ellipse', { x: x + 0.16, y: 1.26, w: 0.34, h: 0.34, fill: { color: col } });
    s.addImage({ data: ico, x: x + 0.24, y: 1.34, w: 0.18, h: 0.18 });
    s.addText(t, { x: x + 0.58, y: 1.24, w: 3.2, h: 0.3, fontFace: 'Calibri', fontSize: 11, bold: true, color: col, margin: 0, valign: 'middle' });
    s.addText(body, { x: x + 0.16, y: 1.64, w: 3.62, h: 0.8, fontFace: 'Calibri', fontSize: 8.3, color: SLATE, margin: 0, valign: 'top' });
    s.addShape('roundRect', { x: x + 0.16, y: 2.48, w: 3.62, h: 0.46, fill: { color: 'F0F4F9' }, rectRadius: 0.05 });
    s.addText(ev, { x: x + 0.26, y: 2.48, w: 3.42, h: 0.46, fontFace: 'Calibri', fontSize: 7.4, italic: true, color: NAVY, margin: 0, valign: 'middle' });
  });

  // The calculation as a chain, so each term can be attacked separately.
  s.addText('THE CALCULATION — ATTACK ANY OF THE THREE TERMS', { x: 0.5, y: 3.14, w: 8, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: NAVY, charSpacing: 0.6, margin: 0 });
  const chain = [
    ['Addressed spend', '£20 m', 'annual purchased value of the\nparts we put through it', MUTED, false],
    ['× Identified', '8%', 'planning figure — the tool\nmeasured 12.8% on the\nreference part', MUTED, false],
    ['× Captured', '20%', 'the share we actually\nimplement — the honest\nunknown', AMBER, false],
    ['= Saving', '£320k/yr', 'recurring, against a one-off\npilot cost of ≈ £25k', GREEN, true],
  ];
  chain.forEach(([label, val, note, col, last], i) => {
    const x = 0.5 + i * 3.13;
    s.addShape('roundRect', { x, y: 3.40, w: 2.78, h: 1.28, fill: { color: last ? GREEN_T : CARD }, line: { color: last ? GREEN : LINE, width: last ? 1.5 : 1 }, rectRadius: 0.09 });
    s.addText(label, { x: x + 0.14, y: 3.48, w: 2.5, h: 0.24, fontFace: 'Calibri', fontSize: 8.6, bold: true, color: last ? GREEN : NAVY, margin: 0 });
    s.addText(val, { x: x + 0.14, y: 3.72, w: 2.5, h: 0.42, fontFace: 'Cambria', fontSize: 21, bold: true, color: last ? GREEN : NAVY, margin: 0, valign: 'middle' });
    s.addText(note, { x: x + 0.14, y: 4.14, w: 2.5, h: 0.5, fontFace: 'Calibri', fontSize: 7.4, color: col, margin: 0, valign: 'top' });
    if (!last) s.addText(i === 2 ? '=' : '×', { x: x + 2.80, y: 3.84, w: 0.31, h: 0.4, fontFace: 'Cambria', fontSize: 15, bold: true, color: MUTED, align: 'center', margin: 0, valign: 'middle' });
  });

  // Assumptions, visible — so the room argues with the model, not with the idea.
  s.addShape('roundRect', { x: 0.5, y: 4.78, w: 7.55, h: 1.2, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
  s.addText('WHAT WE ASSUMED — SWAP ANY OF THESE FOR OUR REAL NUMBERS', { x: 0.68, y: 4.85, w: 7.2, h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: MUTED, charSpacing: 0.4, margin: 0 });
  s.addText([
    { text: '40 parts in the pilot basket · £500k average annual purchased value each · 8% identified · 20% captured.\n', options: { color: SLATE } },
    { text: 'Deliberately conservative: ', options: { bold: true, color: NAVY } },
    { text: 'the 8% sits below the 12.8% the tool actually measured, and a 20% capture assumes four of every five ideas are never acted on. Nothing here needs the tool to be right about one part — only roughly right across a basket.', options: { color: SLATE } },
  ], { x: 0.68, y: 5.07, w: 7.2, h: 0.86, fontFace: 'Calibri', fontSize: 8.4, margin: 0, valign: 'top' });

  // Cost of doing nothing.
  s.addShape('roundRect', { x: 8.28, y: 4.78, w: 4.55, h: 1.2, fill: { color: 'FBEAE8' }, line: { color: RED, width: 1 }, rectRadius: 0.09 });
  s.addText('IF WE DO NOTHING', { x: 8.46, y: 4.85, w: 4.2, h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: RED, charSpacing: 0.4, margin: 0 });
  s.addText('Quotes keep being accepted without a floor price · cost keeps being discovered after the design is locked, when the cheap levers have closed · findings like 43%-tooling keep arriving too late to act on · a should-cost stays half a day of an engineer, so only the biggest parts ever get one.',
    { x: 8.46, y: 5.07, w: 4.2, h: 0.86, fontFace: 'Calibri', fontSize: 8.1, color: SLATE, margin: 0, valign: 'top' });

  // The number that makes the pilot decision easy.
  s.addShape('roundRect', { x: 0.5, y: 6.10, w: 12.33, h: 0.86, fill: { color: NAVY }, rectRadius: 0.1 });
  s.addText([
    { text: 'Break-even: ', options: { bold: true, color: '9FB6E0', fontSize: 12 } },
    { text: 'the pilot pays for itself if we capture ', options: { color: 'FFFFFF', fontSize: 12 } },
    { text: '1.6% ', options: { bold: true, color: '6EE7B7', fontSize: 15 } },
    { text: 'of what it identifies — one pound in sixty. Every point of capture above that is ≈£16k a year.   ', options: { color: 'FFFFFF', fontSize: 12 } },
    { text: 'We are not asking you to believe 20%. We are asking whether 1.6% is plausible.', options: { bold: true, color: 'FFFFFF', fontSize: 12 } },
  ], { x: 0.85, y: 6.16, w: 11.65, h: 0.74, fontFace: 'Calibri', margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'This is the slide the business case was missing, and I want to be honest about why. The previous version led with engineer-hours — and hours are not money. Worse, we then said "capacity, not headcount", which to a budget holder reads as "nothing actually comes out". So this version leads with the money and puts the hours where they belong. ' +
    'Three streams. A, the negotiation floor: a defensible should-cost turns a quote into a conversation with a number underneath it, and because every line prints its own derivation the challenge survives the meeting rather than collapsing the first time a supplier pushes back. On our reference part the tool identified three pounds twenty-two of opportunity against a twenty-five pound piece cost. B, design-stage avoidance: at ten to fifteen minutes a part this can run at concept stage, while wall thickness and cavitation are still open — and the bumper is the proof, where tooling turned out to be forty-three percent of piece cost, more than the resin, the press and the labour added together. Nobody in this room predicted that in advance. C, capacity — and note that I have put it third. The hours are the enabler, not the prize. You cannot hold forty floor-price negotiations a year if every should-cost costs half a day to prepare. ' +
    'Then the calculation, laid out as a chain deliberately, so you can attack any single term instead of the whole idea. Addressed spend, times what the tool identifies, times what we actually capture. Twenty million of purchased value, eight percent identified, twenty percent captured: three hundred and twenty thousand a year, recurring, against a one-off pilot cost of about twenty-five thousand. ' +
    'The assumptions are printed on the slide because I would rather you argued with the model than with me — and they are deliberately pessimistic. Eight percent is below the twelve point eight the tool actually measured. A twenty percent capture assumes four out of every five ideas never get acted on. ' +
    'But the line to leave with is the navy strip. At this pilot cost the break-even capture rate is one point six percent. One pound in sixty. I am not asking you to believe twenty percent — I am asking whether one point six is plausible. If it is, the pilot is very nearly free, and the only remaining question is whether the tool works, which is precisely what a pilot is for.'
  );
}
{
  // ── Business case I — minutes, not hours ──
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Business Case II — Minutes, Not Hours', 'Why the capacity in stream C exists — the same should-cost, by commodity, against the CAPEE-by-hand baseline', GREEN);
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
    'The business case starts with time, because time is the thing nobody disputes. The left side shows what the CostVision minutes actually contain — upload, automatic measurement and derivation, then the engineer answers the two to five questions geometry cannot answer, reviews the band and approves. Ten to fifteen minutes end to end for a CAD part, and I want to be precise: that is not unattended time, that is an engineer at the screen owning the answer. The table is the same should-cost by commodity. One row is a confirmed baseline — casting plus machining, four to five hours in CAPEE, measured by us. The other CAPEE figures are team-reported working numbers and the slide says so; I would rather show you an honest label than a precise-looking guess. The chart makes the point the table makes: the green bars are barely visible against the amber ones. And the box at the bottom links straight back to the money slide — this capacity is stream C, and stream C is what makes stream A reachable. At these times one engineer reviews fifteen to twenty-five should-costs a day instead of preparing one or two. The hours we save do not disappear, they move into negotiation preparation, which is where the money actually is. Two additions from our own review. First, the single biggest category of saving is input data feeding: in CAPEE every measurement and cycle input is read off the CAD and keyed by hand; here the geometry kernel measures the file and feeds the cost engine automatically. Second, the total: hours saved equals the per-part difference times the annual number of parts, summed over the commodities. On an illustrative five-hundred-part annual mix over this table\u2019s own midpoints that is roughly one thousand six hundred and fifty hours a year — about one engineer-year. That mix is illustrative and the slide says so; substitute our real annual volumes and the tool\u2019s own logged run times to firm it up.'
  );
}
{
  // ── Business case II — CostVision vs CAPEE, category by category ──
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Business Case III — CostVision vs CAPEE, Category by Category', 'The seven saving categories from our internal review — what CAPEE does today, and what changes', GREEN);

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
    ['3 · Coverage & early programme support', 'Few parts, usually after the quote lands', '15–25 should-costs per engineer-day — directional cost early in the programme, while wall thickness and process can still change', 'Business Case II'],
    ['4 · Total man-hours saved', '—', 'Σ (CAPEE hrs − CostVision hrs) × annual parts, per commodity. Illustrative 500-part/yr mix ≈ 1,650 h/yr ≈ one engineer-year — replace with our real volumes', 'Business Case II strip'],
    ['5 · DFM / DFA insights', 'Not available', 'Generated by the deterministic COST ENGINE — 52 threshold rules + 10 geometry advisors, scores by fixed arithmetic. Not by AI: the AI cannot write a score, severity or saving', 'DFM/DFA slide'],
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
    'This slide is our internal review with the manager, made presentable — seven categories, and I will take them in order. One, input data feeding, and this is the big one: in CAPEE every measurement and every cycle input is read off the CAD by a person and keyed in by hand; here the geometry kernel measures the file and feeds the cost engine automatically. Two, machine and tonnage selection: CAPEE partially automates this; here it is automatic and, more importantly, cost-ranked — the press is sized by physics, and the machining routing and the mould cavitation are chosen by price with the losing alternatives printed in the trace, so the choice defends itself. Three, coverage: at these cycle times one engineer reviews fifteen to twenty-five should-costs a day, which means directional cost support early in the programme, while the design can still move. Four, the total: hours saved per part times annual parts, summed by commodity — on an illustrative five-hundred-part mix, about one thousand six hundred and fifty hours a year, roughly one engineer-year; that mix is illustrative and we will substitute our real volumes. Five, and I checked this in the source code before putting it on a slide: the DFM and DFA insights are generated by the deterministic cost engine — fifty-two threshold rules and ten geometry advisors, scores by fixed arithmetic — not by the AI. CAPEE has nothing equivalent. Six, same answer for the cost-saving ideas: they come from the engine\u2019s rule layer and the optimisers, each one priced in pounds per part with a named lever owner; the AI is allowed to add commentary and nothing else. And seven, everything a conventional tool does not do: twenty regions priced on every run, the confidence band, the negotiation pack, full derivation on every line, the self-audit, learning from actuals, landed cost including duty and carbon border adjustment, and the air-gapped mode for IP-sensitive programmes.'
  );
}
{
  // ── Business case III — evidence, coverage, cost to run ──
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Business Case IV — Evidence, Coverage, Cost to Run', 'Every figure on this slide is measured from the tool — nothing is projected', GREEN);
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
{
  // ── Business case V — the ask ──
  // A business case that ends on "what it cannot do" leaves the room with no
  // decision to make. This slide is the one thing the previous version had no
  // equivalent of: a specific, small, time-boxed, reversible ask.
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Business Case V — The Ask: a 90-Day Pilot', 'One decision, a fixed scope, criteria agreed before we start, and a go/no-go date', GREEN);

  // THE ASK — the single most important box on the slide.
  s.addShape('roundRect', { x: 0.5, y: 1.14, w: 5.6, h: 1.5, fill: { color: GREEN_T }, line: { color: GREEN, width: 2 }, rectRadius: 0.1 });
  s.addText('WHAT WE ARE ASKING FOR', { x: 0.72, y: 1.22, w: 5.2, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: GREEN, charSpacing: 0.6, margin: 0 });
  s.addText([
    { text: 'Approve a 90-day pilot on 40 parts.\n', options: { bold: true, color: NAVY, fontSize: 15 } },
    { text: 'One named owner · 0.3 FTE · one VM · ≈£25k one-off · no licence, no per-seat and no per-estimate cost. Nothing recurring is committed until the day-90 review.', options: { color: SLATE, fontSize: 9.5 } },
  ], { x: 0.72, y: 1.48, w: 5.2, h: 1.08, fontFace: 'Calibri', margin: 0, valign: 'top' });

  // Scope.
  s.addShape('roundRect', { x: 0.5, y: 2.76, w: 5.6, h: 1.42, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
  s.addText('PILOT SCOPE — AGREED UP FRONT', { x: 0.72, y: 2.84, w: 5.2, h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: MUTED, charSpacing: 0.4, margin: 0 });
  [
    ['In', '40 live parts across 4–5 commodities we already buy, chosen with purchasing — a mix of quoted parts and parts still in design.'],
    ['Out', 'No supplier is told a price comes from a tool. Every number is reviewed and owned by an engineer before it leaves the building.'],
  ].forEach(([k, v], i) => {
    const y = 3.06 + i * 0.52;
    s.addText(k, { x: 0.72, y, w: 0.42, h: 0.48, fontFace: 'Calibri', fontSize: 8.4, bold: true, color: i ? RED : GREEN, margin: 0, valign: 'top' });
    s.addText(v, { x: 1.16, y, w: 4.76, h: 0.48, fontFace: 'Calibri', fontSize: 8.2, color: SLATE, margin: 0, valign: 'top' });
  });

  // Timeline.
  s.addText('90 DAYS, THREE PHASES', { x: 0.5, y: 4.32, w: 5.6, h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: NAVY, charSpacing: 0.4, margin: 0 });
  [
    ['Days 1–30', 'Set up + calibrate', 'One VM, our own rates loaded, the 6 validated parts re-run to confirm the baseline, two engineers trained.', TEAL],
    ['Days 31–60', 'Run the basket', 'The 40 parts costed. Every estimate logged against the quote or the actual PO. Top levers taken to suppliers.', BLUE],
    ['Days 61–90', 'Measure + decide', 'Scored against the four criteria opposite. Captured saving written up. Go / no-go presented here.', GREEN],
  ].forEach(([d, t, body, col], i) => {
    const y = 4.54 + i * 0.5;
    s.addShape('roundRect', { x: 0.5, y, w: 1.0, h: 0.46, fill: { color: col }, rectRadius: 0.05 });
    s.addText(d, { x: 0.5, y, w: 1.0, h: 0.46, fontFace: 'Calibri', fontSize: 7.8, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    s.addText(t, { x: 1.6, y: y + 0.02, w: 1.5, h: 0.2, fontFace: 'Calibri', fontSize: 8.4, bold: true, color: NAVY, margin: 0 });
    s.addText(body, { x: 1.6, y: y + 0.20, w: 4.5, h: 0.28, fontFace: 'Calibri', fontSize: 7.6, color: SLATE, margin: 0, valign: 'top' });
  });

  // Success criteria — pre-agreed and measurable, so the decision is not a debate.
  s.addShape('roundRect', { x: 6.3, y: 1.14, w: 6.53, h: 2.5, fill: { color: CARD }, line: { color: NAVY, width: 1.5 }, rectRadius: 0.1 });
  s.addText('SUCCESS CRITERIA — SET NOW, SCORED AT DAY 90', { x: 6.5, y: 1.22, w: 6.1, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: NAVY, charSpacing: 0.5, margin: 0 });
  s.addText('Agreeing these before we start is the point: at day 90 the decision is arithmetic, not opinion — and a miss is a legitimate stop.',
    { x: 6.5, y: 1.44, w: 6.1, h: 0.26, fontFace: 'Calibri', fontSize: 7.6, italic: true, color: MUTED, margin: 0 });
  [
    ['Accuracy', '≥ 70% of pilot parts within ±20% of an independent manual should-cost or the actual PO price'],
    ['Speed', 'Median ≤ 20 min per CAD part, engineer-attended — read from the tool’s own run logs, not estimated'],
    ['Value', '≥ £150k of opportunity identified across the basket, and ≥ 3 levers taken to a supplier with the outcome recorded either way'],
    ['Adoption', '2+ engineers running it unaided after one day of training, without the person who built it in the room'],
  ].forEach(([k, v], i) => {
    const y = 1.76 + i * 0.45;
    s.addShape('roundRect', { x: 6.5, y, w: 0.95, h: 0.4, fill: { color: 'E8EDF6' }, rectRadius: 0.05 });
    s.addText(k, { x: 6.5, y, w: 0.95, h: 0.4, fontFace: 'Calibri', fontSize: 8, bold: true, color: NAVY, align: 'center', valign: 'middle', margin: 0 });
    s.addText(v, { x: 7.55, y, w: 5.1, h: 0.4, fontFace: 'Calibri', fontSize: 8, color: SLATE, margin: 0, valign: 'middle' });
  });

  // Risks, each with the mitigation already built.
  s.addShape('roundRect', { x: 6.3, y: 3.76, w: 6.53, h: 2.22, fill: { color: 'FCF3E3' }, line: { color: AMBER, width: 1 }, rectRadius: 0.09 });
  s.addImage({ data: I.warn, x: 6.5, y: 3.85, w: 0.2, h: 0.2 });
  s.addText('THE FOUR OBJECTIONS — AND WHAT IS ALREADY BUILT FOR THEM', { x: 6.78, y: 3.84, w: 5.9, h: 0.22, fontFace: 'Calibri', fontSize: 8.2, bold: true, color: AMBER, charSpacing: 0.4, margin: 0 });
  [
    ['“It will be wrong on parts it has not seen.”', 'The band is agreed before we start, every actual is logged, and the calibration layer learns from them. 6 parts validated so far and the deck says so.'],
    ['“The AI is inventing numbers.”', 'Deterministic by default — no outbound call at all. Every cost line prints its own derivation, and there is an air-gapped mode.'],
    ['“Rates go stale and nobody notices.”', 'The engine blocks a duty rate that is unverified or over 90 days old rather than quietly using it. The refresh gets a named owner in the pilot.'],
    ['“Engineering will read it as criticism.”', 'Already changed: the output is savings ranked by category, with no score and no severity anywhere an engineer sees.'],
  ].forEach(([q, a], i) => {
    const y = 4.10 + i * 0.46;
    s.addText(q, { x: 6.5, y, w: 2.55, h: 0.44, fontFace: 'Calibri', fontSize: 7.6, bold: true, italic: true, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(a, { x: 9.15, y, w: 3.5, h: 0.44, fontFace: 'Calibri', fontSize: 7.4, color: SLATE, margin: 0, valign: 'middle' });
  });

  // The close.
  s.addShape('roundRect', { x: 0.5, y: 6.10, w: 12.33, h: 0.86, fill: { color: NAVY }, rectRadius: 0.1 });
  s.addText([
    { text: 'The decision on the table:  ', options: { bold: true, color: '9FB6E0', fontSize: 12 } },
    { text: '≈£25k and 90 days to find out whether a tool that is already built and already validated on six parts holds up on forty of ours. If it misses the criteria we stop and nothing recurring has been committed. If it meets them, the same £25k has already bought its way out at a 1.6% capture rate.', options: { color: 'FFFFFF', fontSize: 11.5 } },
  ], { x: 0.85, y: 6.14, w: 11.65, h: 0.78, fontFace: 'Calibri', margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'And this is the slide the old deck did not have at all — it ended on what the tool cannot do, which left you with nothing to decide. So here is one specific ask. ' +
    'Approve a ninety-day pilot on forty parts. One named owner, three tenths of an engineer, one virtual machine, about twenty-five thousand pounds one-off. No licence, no per-seat cost, no per-estimate cost — in the default mode there is no AI call to pay for. And nothing recurring is committed until we come back at day ninety. ' +
    'Scope is deliberately bounded. Forty live parts across four or five commodities we already buy, picked with purchasing, deliberately mixing parts already quoted with parts still in design so we can test both value streams. And explicitly out of scope: no supplier is ever told a number came from a tool, and every figure is reviewed and owned by an engineer before it leaves the building. ' +
    'Ninety days in three phases: set up and calibrate, run the basket, then measure and decide. ' +
    'The criteria on the right are the part I would most like you to hold me to, and I want them agreed today rather than at day ninety. Seventy percent of parts within twenty percent of an independent manual cost or the actual PO price. Median twenty minutes a part, read from the tool’s own logs rather than estimated by me. A hundred and fifty thousand of opportunity identified and at least three levers actually taken to a supplier with the outcome recorded — including when the answer is no. And two engineers running it unaided without the person who built it in the room. If we miss those, stopping is the correct decision and I will say so. ' +
    'The amber box is the four objections I expect, with what is already built for each. And the close is the arithmetic from the money slide: twenty-five thousand pounds and ninety days to find out whether something already built and already validated on six parts holds up on forty of ours. If it fails we stop, having committed nothing ongoing. If it works, it has already paid for itself at a one point six percent capture rate.'
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
    [PURPLE, PURPLE_T, 'AI READS (OPT.)', 'AI — optional', ['4 · Second-opinion read', '   alloy · process · finish', '   skipped in Rules mode'], 'Words only — no prices'],
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
    'Underneath, the five phases. Blue, we measure. Purple, the optional AI reads — and in the default Rules mode this phase is skipped entirely, the rules and the engineer answer instead. Amber, four automatic safety checks run. Teal, the engine calculates. Green, a person checks and signs. Twelve stages in total, and the whole thing takes about two minutes of computer time. ' +
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
  title(s, 'Stage 4 · The AI Reads the Part (Optional)', 'Off by default — and skipped entirely when the engineer enters the answers', PURPLE);
  owner(s, 10.05, 0.74, 'OWNER: AI — OPTIONAL', PURPLE, PURPLE_T);

  s.addShape('roundRect', { x: 0.5, y: 1.3, w: 6.0, h: 2.75, fill: { color: PURPLE_T }, line: { color: PURPLE, width: 1.25 }, rectRadius: 0.1 });
  s.addText('WHAT THE AI IS GIVEN', { x: 0.75, y: 1.45, w: 5, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: PURPLE, charSpacing: 1, margin: 0 });
  s.addText('Runs only in the Compare and AI-led modes — the default Rules-only path makes no AI call: the rules derive the inputs and the ENGINEER answers the material and duty questions. When it does run, it is given only the measurements — never a price list, never the rate library.',
    { x: 0.75, y: 1.76, w: 5.5, h: 0.7, fontFace: 'Calibri', fontSize: 11, color: SLATE, margin: 0, valign: 'top' });
  s.addText('WHAT IT SAYS BACK', { x: 0.75, y: 2.48, w: 5, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: PURPLE, charSpacing: 1, margin: 0 });
  const says = [['Material family', 'Aluminium die-casting alloy'], ['How it is made', 'High-pressure die cast'], ['Then what', 'Machine-finished on a cutting machine'], ['How sure it is', '84% confident']];
  says.forEach(([k, v], i) => {
    const y = 2.8 + i * 0.3;
    s.addText(k, { x: 0.85, y, w: 1.8, h: 0.28, fontFace: 'Calibri', fontSize: 10, color: MUTED, margin: 0, valign: 'middle' });
    s.addText(v, { x: 2.7, y, w: 3.6, h: 0.28, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, margin: 0, valign: 'middle' });
  });

  s.addShape('roundRect', { x: 6.75, y: 1.3, w: 6.08, h: 2.92, fill: { color: CARD }, line: { color: RED, width: 1.5 }, rectRadius: 0.1 });
  s.addText('WHAT THE AI CANNOT DO', { x: 7.0, y: 1.45, w: 5, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: RED, charSpacing: 1, margin: 0 });
  const cannot = [
    'Set a price, or any part of a price',
    'Change a measured dimension or weight',
    'Choose the machine or the cycle time',
    'Touch the rate library',
    'Override a safety check', 'Overrule anything the engineer entered',
  ];
  cannot.forEach((t, i) => {
    s.addImage({ data: I.times, x: 7.0, y: 1.85 + i * 0.4, w: 0.17, h: 0.17 });
    s.addText(t, { x: 7.3, y: 1.78 + i * 0.4, w: 5.3, h: 0.35, fontFace: 'Calibri', fontSize: 11.5, color: SLATE, margin: 0, valign: 'middle' });
  });

  s.addShape('roundRect', { x: 0.5, y: 4.28, w: 12.33, h: 1.25, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('The confidence score is not decoration — it changes what happens next', {
    x: 0.8, y: 4.42, w: 11, h: 0.3, fontFace: 'Calibri', fontSize: 12.5, bold: true, color: NAVY, margin: 0 });
  s.addText([
    { text: 'In the AI modes: at 84% the tool proceeds but flags the call for review. Below 50% a hard rule fires — "material suggestion is only N% confident, add a part photo or confirm the material manually" — and it stays on the result until a person clears it. ', options: { color: SLATE } },
    { text: 'A confident-sounding wrong answer is the most dangerous thing an AI can produce — so uncertainty is made visible rather than smoothed over.', options: { bold: true, color: NAVY } },
  ], { x: 0.8, y: 4.75, w: 11.75, h: 0.72, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 5.7, w: 12.33, h: 0.9, fill: { color: GREEN_T }, line: { color: GREEN, width: 1 }, rectRadius: 0.1 });
  s.addText([
    { text: 'In plain terms: ', options: { bold: true, color: GREEN } },
    { text: 'the AI does the job an experienced engineer does in the first ten seconds of picking up a part — "ah, that\'s a die-cast housing, that\'ll be machined after". It saves setup time. It does not do the costing, it cannot — and on the default Rules-only path this whole stage is skipped: the engineer\u2019s answers replace the AI\u2019s reading.', options: { color: SLATE } },
  ], { x: 0.8, y: 5.83, w: 11.75, h: 0.7, fontFace: 'Calibri', fontSize: 12, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'Stage four, the AI — and the first thing to say has changed since this deck was first written: this stage is OPTIONAL, and by default it does not run at all. The default mode is Rules only — the geometry kernel measures, the rules derive every cost input, and the two or three things geometry cannot know, the material and the duty questions, are answered by our engineer on the form. No outbound call, nothing leaves the network, and the costing is complete. ' +
    'The AI exists for the other two modes. In Compare it reads the part alongside the rules and we see field by field where the two disagree. In AI-led — kept mainly for comparison — it does the classification job you see on the left: it is handed the measurements and the shape signature, never a price list, never the rate library, and it hands back words — aluminium die-casting alloy, high-pressure die cast, machine-finished — with a confidence score. ' +
    'The red box is unchanged and worth reading slowly, because every line is enforced in code, not requested in a prompt: the AI cannot set a price or any part of one, cannot change a measured dimension, cannot choose the machine or the cycle time, cannot touch the rate library, cannot override a safety check — and cannot overrule anything the engineer entered. An engineer\u2019s entry outranks the model everywhere, always. ' +
    'When the AI does run, the confidence score is not decoration. At eighty-four percent the tool proceeds but flags the call for review. Below fifty percent a hard rule fires and stays on the result until a person clears it — because a confident-sounding wrong answer is the most dangerous thing an AI can produce, so uncertainty is made visible rather than smoothed over. ' +
    'In plain terms: the AI does the job an experienced engineer does in the first ten seconds of picking up a part. It saves setup time when we want a second opinion. It does not do the costing, it cannot — and on the default path it is not even in the room: the engineer\u2019s answers replace its reading entirely.'
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
  title(s, 'Stage 7 · Choosing the Process and the Machine', 'Why high-pressure die casting, why a 1,600-tonne press — and what happens when the engineer chooses differently', TEAL);
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
    { text: 'So the engine sizes the machine from the geometry rather than accepting a default — and every choice on this slide is optional: enter a process or a machine yourself and that entry is respected. The engine keeps it, prices its own alternative alongside it as a negotiation lever, and the self-audit flags an over- or undersized machine with the £/part difference.', options: { color: SLATE } },
  ], { x: 0.8, y: 4.48, w: 11.75, h: 0.82, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 5.58, w: 12.33, h: 1.05, fill: { color: PURPLE_T }, line: { color: PURPLE, width: 1 }, rectRadius: 0.1 });
  s.addText([
    { text: 'Who decided all this?  ', options: { bold: true, color: PURPLE } },
    { text: 'The rules engine — by default, with no AI call: ', options: { bold: true, color: TEAL } },
    { text: 'it tested the shape against each process\u2019s physics, rejected the alternatives, and sized the press by calculation. ', options: { color: SLATE } },
    { text: 'The optional AI ', options: { bold: true, color: PURPLE } },
    { text: 'offered a second opinion ("die casting" — it agreed). ', options: { color: SLATE } },
    { text: 'A pinned engineer choice overrides both. ', options: { bold: true, color: NAVY } },
    { text: 'And if anyone — AI or person — had said "sand casting", the 3 mm walls would have argued back with the physics.', options: { color: SLATE } },
  ], { x: 0.8, y: 5.7, w: 11.75, h: 0.85, fontFace: 'Calibri', fontSize: 11, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'Now we are into the engine, and this is where the real engineering lives. Two questions get answered here: which process, and which machine — and one thing to hold onto throughout: every answer on this slide is a DEFAULT, not a decree. ' +
    'First, the process, and note who decides: the rules engine, by default with no AI call at all. It tests the measured shape against what each process can physically do. Three millimetre walls, a hollow shape, sixty thousand a year — that combination points firmly at high-pressure die casting. Sand casting is rejected because it cannot reliably produce three millimetre walls at that quality or speed. Machining from solid would cut away about eighty percent of the metal — absurd on cost. Gravity die casting cannot reliably fill walls that thin. In the optional AI modes the model offers its own reading — here it agreed, die casting — and where it disagrees, the physics wins. ' +
    'Second, the press. Molten aluminium injected under pressure tries to force the two mould halves apart, so the engine takes the shadow area it measured from the CAD, multiplies by the cavity pressure, adds a safety margin, and picks the smallest press in the library that clamps it: sixteen hundred tonnes. Smallest-that-covers is also cheapest-per-hour on the ladder, so the sizing IS the cost optimisation. ' +
    'Third — and this is the point our own review sharpened — all of it is optional the moment our engineer enters data. Pin the process on the form and the pin is honoured everywhere, including on re-analysis. Pick a different machine by hand and the tool respects the choice: it keeps your machine, prices its own alternative alongside as a negotiation lever, and the self-audit challenges the selection in both directions — a machine bigger than the physics needs is flagged with the pounds-per-part it wastes, a smaller one with the reason it cannot work. Enter a toolmaker quotation and it overrides every tooling estimate. The tool decides where the engineer has not; the engineer outranks the tool everywhere they have. ' +
    'And the purple box is the one line to remember: the rules engine decided, the optional AI seconded, a pinned engineer choice overrides both — and physics argues back at anyone, human or machine, who picks a process the walls cannot survive.'
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
    ['2 · 52 threshold rules fire', 'Fixed engineering thresholds, each with severity, saving % and a recommendation: material utilisation below 60% is critical and below 72% major; OEE below 70% critical, below 80% major; each cost bucket compared to its commodity benchmark band; operation and setup counts checked.'],
    ['3 · 10 process advisors add geometry findings', 'Per-process DFM read from the measured solid (casting, forging, sheet metal, moulding families…): heavy sections that solidify last → shrink porosity at the hot spot; sharp re-entrant corners → hot-tear initiation; missing draft; wall-ratio breaches; excess machining stock → near-net opportunity.'],
    ['4 · Ranked by money, not marked out of ten', 'Every finding is converted to £/part against this costing and ranked biggest first, grouped by category. The engine still grades findings internally to order them, but no score and no severity is ever published — the report shows what to do and what it is worth, never a mark against the design.'],
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
    { text: 'the same measured geometry and the same costed numbers are pushed through fixed engineering thresholds — the DFM/DFA report is arithmetic you can audit, not opinion you have to trust. The appendix prints every rule, parameter, advisor and lever in full.', options: { color: SLATE } },
  ], { x: 0.68, y: 6.42, w: 12.0, h: 0.55, fontFace: 'Calibri', fontSize: 10, margin: 0, valign: 'middle' });
  footer(s, ++PG);
  s.addNotes(
    'Sections twelve to fifteen of every report — DFM, DFA, cost optimisation and the roadmap — come from one deterministic rule engine, and I want to show exactly how, because the honest answer to "is this AI opinion?" is no. Step one: the engine runs AFTER the costing and reads the finished result — the eight buckets and the same measured inputs the estimate used. It critiques the numbers that were actually costed. Step two: fifty-two fixed thresholds fire — material utilisation below sixty percent is critical, below seventy-two major; OEE below seventy critical; every bucket compared to its commodity benchmark band. Each hit carries a severity, a saving percentage and a recommendation, all constants in code. Step three: ten per-process advisor modules add the geometry findings — heavy sections that will draw porosity, sharp corners that start hot tears, missing draft, near-net opportunities — read from the measured solid, not guessed. Step four: the score is arithmetic — start at ten, minus two per critical, one per major, half per minor — and the roadmap is a filter of the same actions by risk and timeframe. Two properties to underline. The saving headline is root-sum-square of the top three issues capped at forty percent — we deliberately do not add up every opportunity, because stacked savings never materialise additively. And the AI cannot touch any of it: in AI mode it may add commentary to the analysis panel, but no score, severity or saving in this report comes from a model. Source: src slash engine slash dfm-dfa dot ts plus the ten advisor modules — one function, feeding both the screen and the PDF, so the two can never disagree.'
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

// ══════════ 10a5 · TOOLING COST I (the shop model + the quotation proof) ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'How Tooling Is Priced I — The Toolmaking Shop Model', 'Every tool built up the way a toolmaker quotes it: hours × rate, steel by the kilogram, bought-outs each', TEAL);
  const steps = [
    ['1 · Geometry sets the size drivers', 'The kernel measures what tools scale with: projected area per cavity/impression, depth, part volume, faces, holes, undercuts. Nothing is typed in.'],
    ['2 · One shop prices every commodity', 'UK toolroom rates: design £58 · CNC £52 · EDM £58 · fitting £48 · polishing £45 · tryout £85 /hr. Tool steels by the kilogram: P20 £6.8 → H13 £9.5 → PM £14; 7075 Al £7.5. Bought-outs each: hot runner £3,800/drop, core-pull cylinder £1,450. The shop’s 22% overhead + profit is its own stated line.'],
    ['3 · The cavity law drives the hours and the steel', 'CNC hours = 12 + 3.4 × area^0.72 per cavity set, depth-corrected (deep draws carry more wall than their shadow shows). Steel mass = area × (depth + 10 cm) × 2 halves × 1.25 × 7.85 g/cm³. EDM, polishing, bench fitting follow as complexity- and finish-driven fractions (5–30% · 8–30% · 25%); design = 30 h + 20% of the programme. Steel class is a real material AND a cutting speed: prototype = 7075 Al ×0.55 h → high-volume = H13 ×1.2 + wear coating.'],
    ['4 · Life → number of tools → £/part', 'Steel class follows the programme shots and sets the life; tools consumed = ceil(shots ÷ life); tooling £/part = tool cost × tools ÷ annual volume, with tolerance (×1.0–2.0) and finish (up to ×1.6 Class-A) uplifts.'],
    ['5 · Two estimates, then the quote wins', 'The geometry kernel prices the tool independently from the B-rep; the shop model and the kernel are geometric-mean blended, sanity-clamped, so no single estimator can run away alone. A toolmaker QUOTATION overrides every estimate. Slides = £1,450 cylinder + (28 h + footprint-scaled) bench work each; hot runner = £3,800/drop + £5,500 controller; tryout = (2 + cavities/2) trials × 8 h on the press.'],
  ];
  steps.forEach(([t, d], i) => {
    const y = 1.18 + i * 1.06;
    s.addShape('roundRect', { x: 0.5, y, w: 6.6, h: 0.96, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
    s.addShape('ellipse', { x: 0.64, y: y + 0.1, w: 0.36, h: 0.36, fill: { color: TEAL } });
    s.addText(String(i + 1), { x: 0.64, y: y + 0.1, w: 0.36, h: 0.36, fontFace: 'Cambria', fontSize: 13, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    s.addText(t.slice(4), { x: 1.12, y: y + 0.07, w: 5.9, h: 0.22, fontFace: 'Calibri', fontSize: 10, bold: true, color: NAVY, margin: 0 });
    s.addText(d, { x: 1.12, y: y + 0.3, w: 5.95, h: 0.64, fontFace: 'Calibri', fontSize: 7.7, color: SLATE, margin: 0, valign: 'top' });
  });
  // Right: the bumper mould as the ACTUAL quotation the engine prints
  s.addText('THE PROOF — THE BUMPER MOULD, LINE BY LINE', { x: 7.35, y: 1.16, w: 5.5, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: TEAL, charSpacing: 0.6, margin: 0 });
  s.addShape('roundRect', { x: 7.35, y: 1.42, w: 5.48, h: 4.86, fill: { color: CARD }, line: { color: TEAL, width: 1.25 }, rectRadius: 0.09 });
  const q = [
    ['Tool design & CAM', '568 h × £58', '£32,956'],
    ['Mould base, guides & ejection', 'footprint-scaled', '£23,019'],
    ['Cavity + core steel (P20-hard)', '8,469 kg × £8.2', '£69,443'],
    ['CNC cavity/core machining', '2,691 h × £52', '£139,936'],
    ['EDM (ribs, slots, corners)', '336 h × £58', '£19,510'],
    ['Polishing', '269 h × £45', '£12,110'],
    ['Bench fitting & spotting', '673 h × £48', '£32,293'],
    ['Mould tryout — 5 trials', '40 h × £85', '£3,400'],
    ['Core-pull cylinders × 3 + fitting', 'bought-out + bench', '£14,862'],
    ['Toolmaker overhead + profit', '22%', '£76,456'],
  ];
  q.forEach(([item, how, cost], i) => {
    const y = 1.56 + i * 0.335;
    s.addText(item, { x: 7.55, y, w: 2.9, h: 0.3, fontFace: 'Calibri', fontSize: 8.2, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(how, { x: 10.3, y, w: 1.35, h: 0.3, fontFace: 'Courier New', fontSize: 7.0, color: MUTED, margin: 0, valign: 'middle' });
    s.addText(cost, { x: 11.6, y, w: 1.05, h: 0.3, fontFace: 'Courier New', fontSize: 7.8, bold: false, color: SLATE, align: 'right', margin: 0, valign: 'middle' });
  });
  s.addShape('line', { x: 7.55, y: 4.96, w: 5.1, h: 0, line: { color: TEAL, width: 1 } });
  s.addText([
    { text: 'Engine total £423,985', options: { bold: true, color: TEAL, fontSize: 10.5 } },
    { text: '  vs the toolmaker’s real quotation ', options: { color: SLATE, fontSize: 9 } },
    { text: '£420,000', options: { bold: true, color: NAVY, fontSize: 10.5 } },
    { text: '  — within 1%. 4,797 toolroom hours; every line is a number a toolmaker can argue with, and that is the point.', options: { color: SLATE, fontSize: 8.4 } },
  ], { x: 7.55, y: 5.06, w: 5.1, h: 1.1, fontFace: 'Calibri', margin: 0, valign: 'top' });
  s.addShape('roundRect', { x: 0.5, y: 6.42, w: 12.33, h: 0.55, fill: { color: 'E7F4F2' }, line: { color: TEAL, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Read it in one line:  ', options: { bold: true, color: TEAL } },
    { text: 'tooling is a toolmaker’s quotation the engine writes itself — hours × rate, steel by the kilogram, bought-outs each, overhead stated — validated against a real quotation, and a real quotation still beats it every time.', options: { color: SLATE } },
  ], { x: 0.68, y: 6.42, w: 12.0, h: 0.55, fontFace: 'Calibri', fontSize: 9.8, margin: 0, valign: 'middle' });
  footer(s, ++PG);
  s.addNotes(
    'This slide answers one question precisely: how does the tool price a die or a mould? Not as a percentage of the part price, and not from a lookup table — it writes the toolmaker\u2019s quotation itself. The method first. One toolmaking shop model prices every commodity: design at fifty-eight pounds an hour, CNC at fifty-two, EDM at fifty-eight, bench fitting at forty-eight, polishing at forty-five, press tryout at eighty-five; tool steels by the kilogram from P20 at six-eighty to powder-metallurgy grades at fourteen; hot-runner drops and core-pull cylinders at catalogue prices; and the shop’s twenty-two percent overhead and profit as its own visible line. The hours come from one law — twelve plus three-point-four times area to the nought-point-seven-two per cavity, depth-corrected — with EDM, polishing and fitting as fractions driven by complexity and finish grade. And the right-hand side is why you can believe it: the bumper fascia mould, the one tool we hold a real toolmaker’s quotation for, printed line by line exactly as the engine builds it. Five hundred and sixty-eight hours of design. Eight and a half tonnes of steel. Two thousand seven hundred hours of CNC. Every line ends in a number a toolmaker can argue with — and the total lands at four hundred and twenty-four thousand against a real quotation of four hundred and twenty. Within one percent. The old single-formula parametric said six hundred and ninety. That is the confidence claim: the engine does not estimate a tooling number, it composes a quotation you can take to a die shop and argue line by line.'
  );
}

// ══════════ 10a6 · TOOLING COST II (forging, stamping, blow, the rest) ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'How Tooling Is Priced II — Forging, Stamping, Blow Moulding', 'The same shop, commodity by commodity — every formula stated, every constant in unit-tested source', TEAL);
  const cards = [
    ['FORGING DIE  ·  shop build-up',
     'die blocks: face 4× silhouette × 2 halves, steel by kg\n  (hammer 1.2714 £5.8 · H13 £9.5 · PM £14)\nsinking: (40 + 0.9×area^0.85) h/impression × complexity × steel\n+ block prep + EDM 25% + harden £2,500+£2.2/kg + polish + tryout',
     'Die life is ALLOY-KEYED: base hits by alloy (aluminium 80,000 · carbon steel 40,000 · alloy steel 30,000 · stainless 18,000 · titanium 8,000 · superalloy 3,500) × complexity (0.6–1.3) × size penalty (100/area)^0.2 — the forged metal, not the die, decides how long the die lives.'],
    ['STAMPING DIE  ·  shop build-up',
     'die set £2,900 + £3.20/cm² + strip-design NRE by die type\nper station: H13 sections by kg + (70 + 0.11×blank cm²) h\n  × hardness × type — split wire-EDM 35% / CNC 45% / fitting 20%\n+ die-set machining + 4 tryout strip runs',
     'Die life = 1M strokes × (300 ÷ shear MPa)^1.3 × thickness factor (× 0.6 fine-blanking), clamped 50k–3M — harder, thicker steel wears the tool faster and the law says by how much. Validation: the shop model and the kernel’s independent B-rep estimate agree within 1.5% on the reference die.'],
    ['BLOW MOULD  ·  shop build-up',
     'cavity halves: 14 × litres^0.75 kg (Al 7075 or P20/H13)\nCNC: (30 + 9.5 × litres) h × material · cooling drilling 8–20%\n+ frame + pinch-off inserts + IBM/SBM core-rod tooling + tryout',
     'A container’s cavity is its whole inner surface, so hours scale with the litres it holds — not with a projected shadow. Life follows the mould material: aluminium 500,000 · P20 1M · H13 2M shots. Sanity: a 60 L tank tool prices £73k, inside the £60–75k industry band.'],
    ['CASTING · MACHINING · INVESTMENT',
     'HPDC/gravity/sand: the kernel B-rep parametric is PRIMARY on the\nCAD path; the same shop model prices STL and manual paths\n(H13 die + shot sleeve + cooling drilling + stress-relief HT).\nMachining: fixtures + £15,000 CNC-programming NRE, amortised.',
     'INVESTMENT tooling is priced as what it physically is: a wax-injection tool is an aluminium/P20 mould run at low pressure — the mould shop model × 0.8, plus £1,200 per soluble-core box. And the one rule above everything on both slides: a toolmaker quotation overrides every estimate, always.'],
  ];
  cards.forEach(([h, f, d], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.5 + col * 6.28, y = 1.2 + row * 2.56, w = 6.05, hh = 2.42;
    s.addShape('roundRect', { x, y, w, h: hh, fill: { color: CARD }, line: { color: TEAL, width: 1.25 }, rectRadius: 0.09 });
    s.addText(h, { x: x + 0.2, y: y + 0.1, w: w - 0.4, h: 0.22, fontFace: 'Courier New', fontSize: 8.4, bold: true, color: NAVY, margin: 0 });
    s.addText(f, { x: x + 0.2, y: y + 0.36, w: w - 0.4, h: 0.88, fontFace: 'Courier New', fontSize: 6.9, color: SLATE, margin: 0, valign: 'top' });
    s.addText(d, { x: x + 0.2, y: y + 1.28, w: w - 0.4, h: 1.08, fontFace: 'Calibri', fontSize: 7.8, color: SLATE, margin: 0, valign: 'top' });
  });
  s.addShape('roundRect', { x: 0.5, y: 6.42, w: 12.33, h: 0.55, fill: { color: 'E7F4F2' }, line: { color: TEAL, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Why you can trust these numbers:  ', options: { bold: true, color: TEAL } },
    { text: 'every tool is priced the way a toolmaker quotes it — hours × toolroom rates, steel by the kilogram, bought-outs each, the shop’s 22% overhead as its own line — in unit-tested source, validated against a real quotation and cross-checked by the geometry kernel’s independent B-rep estimates. This is a tooling model, not a percentage on the part price.', options: { color: SLATE } },
  ], { x: 0.68, y: 6.42, w: 12.0, h: 0.55, fontFace: 'Calibri', fontSize: 9.4, margin: 0, valign: 'middle' });
  footer(s, ++PG);
  s.addNotes(
    'Same shop, three more commodities — and every card reads like the quotation a die shop would send. The forging die: blocks at four times the impression silhouette in real die steels priced by the kilogram, sinking hours per impression scaled by complexity and by how hard the chosen steel is to cut, EDM, hardening priced per kilogram of block, polishing per impression, tryout strokes. The die life is keyed to the alloy being forged — aluminium is gentle on a die at eighty thousand hits, a superalloy destroys one in three and a half thousand — times complexity and a size penalty. The stamping die: die set plus strip-design engineering plus per-station steel and hours split across wire EDM, CNC and bench fitting — and as validation, the shop model and the geometry kernel\u2019s independent estimate agree within one and a half percent on the reference die. The blow mould scales with the litres the container holds, in aluminium or steel, with the life following the mould material. And the bottom-right card closes the loop: the kernel stays primary where it has a B-rep; the shop model answers the STL and manual paths that used to have to ask; and investment tooling is priced as the wax-injection mould it physically is. One rule survives everything on both slides: a real toolmaker quotation beats every estimate, every time.'
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
    [PURPLE, PURPLE_T, 'THE AI', 'Optional second opinion', ['Alloy family', 'Process route', 'Confidence score'], 'Words only. Never money.'],
    [AMBER, AMBER_T, 'THE GUARDS', 'Check and autocorrect', ['Pour weight, not part weight', 'Machining = finishing', 'Right alloy, right press'], 'Measurements always win'],
    [TEAL, TEAL_T, 'THE ENGINE', 'Does every calculation', ['Sizes the machine', 'Builds each cycle time', '8 buckets, 20 countries'], 'Fixed formulas, traceable'],
    [GREEN, GREEN_T, 'THE ENGINEER', 'Answers and approves', ['Sets volume and region', 'Answers what geometry can\u2019t — their entry always wins', 'Signs off the number'], 'The final decision'],
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
  s.addText('The rules derive.  The engine calculates.  A person approves.  The AI is an optional second opinion.', {
    x: 0.5, y: 5.1, w: 12.33, h: 0.85, fontFace: 'Cambria', fontSize: 19, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });

  s.addShape('roundRect', { x: 0.5, y: 6.1, w: 12.33, h: 0.78, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText([
    { text: 'Result on this part:  ', options: { bold: true, color: NAVY } },
    { text: 'a defensible £38.55, with a £32–£45 confidence band, built in about two minutes — and every penny of it traceable to a measurement or a published rate.', options: { color: SLATE } },
  ], { x: 0.8, y: 6.2, w: 11.75, h: 0.6, fontFace: 'Calibri', fontSize: 12.5, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'Let me put the whole thing on one page, because this is the answer to the question you asked me after the last session. ' +
    'Five players, left to right, in the order they act. The ruler measures the CAD file and gives the same answer every time. The AI is the optional player: off by default, and when it does run it names what the part is — words only, never money. The guards check it against the measurements and autocorrect where they disagree, and the measurements always win. The engine does every calculation — sizes the machine, builds the cycle times, fills the eight buckets, reprices across twenty countries — with fixed, traceable formulas. And our engineer answers what geometry cannot know, overrides any choice they disagree with — their entry always wins — and signs off the number. ' +
    'The line in the middle is the whole tool in one sentence. The rules derive. The engine calculates. A person approves. The AI is an optional second opinion. ' +
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
    [PURPLE, PURPLE_T, 'AI READS (OPT.)', 'AI — optional', ['4 · Second-opinion read', 'resin · process · finish', 'skipped in Rules mode'], 'Words only — no prices'],
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
  s.addText('WHAT THE OPTIONAL AI SAYS BACK', { x: 6.4, y: 1.44, w: 3.4, h: 0.26, fontFace: 'Calibri', fontSize: 10, bold: true, color: PURPLE, charSpacing: 0.8, margin: 0 });
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
    { text: 'stages 1 to 3 happen before any AI is involved; in the AI modes it hands back four words and a confidence score with no access to a price, a rate or a machine — and in the default Rules mode it is skipped entirely.', options: { color: SLATE } },
  ], { x: 0.8, y: 5.86, w: 11.75, h: 0.66, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'Stages one to four, and I will go quickly because the method is the one you have already seen. ' +
    'The kernel opens the model and measures. Volume, and on polypropylene that is four point two kilos. Wall thickness, three millimetres — hold onto that, it matters more than you would think. The projected shadow in the direction the mould opens, nine thousand nine hundred square centimetres. The painted surface area, one point six square metres. ' +
    'And then the measurement that I find genuinely clever: it classifies every face by its angle to the mould-opening direction and counts the ones pointing back against the draw. Six of them. Every one of those needs a sliding section in the tool so the part can be released, and every slide is real money in the mould. Nobody counted those by eye off a drawing. ' +
    'In the optional AI modes the model then does its one job and hands back four words: talc-filled polypropylene, injection moulded in one shot, painted to a Class-A finish, eighty-seven percent confident. Four words and a score. No numbers. It still cannot see a price list, a rate or a machine — and in the default Rules mode this step is skipped: the filename, the geometry and the engineer\u2019s answer supply the same facts. ' +
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


// ═══════════════════════════════════════════════════════════════════════════════
// APPENDIX · DFM / DFA & IDEA GENERATION — THE COMPLETE RULE LIBRARY
// Every rule, parameter, advisor and lever below is transcribed from the engine
// source (calculator/src/engine/dfm-dfa.ts + idea-levers.ts + modules/*-advisor.ts)
// — same thresholds, same savings, same order. Keep in sync if the engine changes.
// Current counts: 52 threshold checks (41 DFM + 11 DFA) · 10 core parameters + 9
// extended signals · 10 geometry advisors (75 checks) · 36 idea levers, 8 categories.
// ═══════════════════════════════════════════════════════════════════════════════
FOOT = 'CostVision · DFM, DFA & idea generation — the complete rule library';

const SEV = { Critical: RED, Major: AMBER, Minor: MUTED, Opportunity: GREEN, Verified: GREEN };
const RISKC = { Low: GREEN, Med: AMBER, High: RED };
const TIMEC = { 'Quick win': GREEN, 'Medium term': AMBER, 'Long term': SLATE, 'Quick/Long': SLATE };

// ══════════ A1 · OVERVIEW — WHAT RUNS AFTER THE PRICE ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'After the Price · DFM, DFA & Idea Generation', 'The same numbers the engine just calculated, re-read by a written rule book — no AI required', TEAL);
  owner(s, 10.33, 0.28, 'OWNER: THE ENGINE', TEAL, TEAL_T);

  const stats = [
    ['52', 'threshold rules', '41 manufacturability (DFM) checks — 14 on every part, 27 per commodity — plus 11 assembly (DFA) checks on the cost structure.', TEAL],
    ['19', 'parameters', '10 core numbers plus 9 extended signals — all read from the costing itself: buckets, operations, tooling basis, pack rates.', BLUE],
    ['10', 'geometry advisors', 'Per-process advisor modules — 75 further checks read from the measured solid: walls, draft, radii, undercuts, spans.', AMBER],
    ['36', 'idea levers', 'A 360° catalogue in 8 categories — material, design, process, tooling, logistics, commercial, quality, sustainability.', GREEN],
  ];
  stats.forEach(([n, unit, body, col], i) => {
    const x = 0.5 + i * 3.13;
    s.addShape('roundRect', { x, y: 1.3, w: 2.95, h: 2.06, fill: { color: CARD }, line: { color: col, width: 1.5 }, rectRadius: 0.1 });
    s.addText(n, { x: x + 0.16, y: 1.4, w: 1.0, h: 0.6, fontFace: 'Cambria', fontSize: 32, bold: true, color: col, margin: 0, valign: 'middle' });
    s.addText(unit, { x: x + 1.14, y: 1.46, w: 1.75, h: 0.5, fontFace: 'Calibri', fontSize: 12, bold: true, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(body, { x: x + 0.16, y: 2.12, w: 2.63, h: 1.16, fontFace: 'Calibri', fontSize: 8.8, color: SLATE, margin: 0, valign: 'top' });
  });

  s.addShape('roundRect', { x: 0.5, y: 3.56, w: 12.33, h: 1.56, fill: { color: TEAL_T }, line: { color: TEAL, width: 1.25 }, rectRadius: 0.1 });
  s.addText('HOW IT WORKS — FIVE STEPS, ALL ARITHMETIC', { x: 0.8, y: 3.66, w: 11.5, h: 0.24, fontFace: 'Calibri', fontSize: 9, bold: true, color: TEAL, charSpacing: 0.5, margin: 0 });
  const steps = [
    ['1 · Read', 'The finished costing is reduced to 10 core parameters and 9 extended signals — buckets, operations, tooling basis, pack rates.'],
    ['2 · Check', 'All 52 threshold rules run — each a plain test like "tooling above 20% of part cost" — and the geometry advisors read the solid.'],
    ['3 · Rank', 'Each finding is priced in £/part against this costing and ranked biggest-first inside its category. No score is published, and no severity label.'],
    ['4 · Size', 'The three biggest savings are combined (root-sum-square, capped at 40%) — so overlapping fixes are never double-counted.'],
    ['5 · Suggest', 'The 36-lever catalogue produces a ranked action list — categorised, priced from the part’s own numbers, biggest saving first.'],
  ];
  steps.forEach(([h, t], i) => {
    const x = 0.72 + i * 2.4;
    s.addText(h, { x, y: 3.94, w: 2.25, h: 0.24, fontFace: 'Calibri', fontSize: 10, bold: true, color: NAVY, margin: 0 });
    s.addText(t, { x, y: 4.2, w: 2.25, h: 0.86, fontFace: 'Calibri', fontSize: 8.2, color: SLATE, margin: 0, valign: 'top' });
  });

  s.addShape('roundRect', { x: 0.5, y: 5.28, w: 12.33, h: 0.7, fill: { color: PURPLE_T }, line: { color: PURPLE, width: 1, dashType: 'dash' }, rectRadius: 0.1 });
  s.addText([
    { text: 'Where the AI sits:  ', options: { bold: true, color: PURPLE } },
    { text: 'nowhere in the rules. Every check, score and saving on the next seven slides is deterministic engine code. The optional "AI deep analysis" only writes commentary on findings the rules have already made — it cannot add, remove or re-score one.', options: { color: SLATE } },
  ], { x: 0.8, y: 5.33, w: 11.75, h: 0.6, fontFace: 'Calibri', fontSize: 10.5, margin: 0, valign: 'middle' });

  s.addShape('roundRect', { x: 0.5, y: 6.14, w: 12.33, h: 0.76, fill: { color: NAVY }, rectRadius: 0.1 });
  s.addText([
    { text: 'What the next seven slides are:  ', options: { bold: true, color: '9FB6E0' } },
    { text: 'the complete rule book, transcribed from the tool’s source code — the 19 parameters, all 52 rules with exact thresholds, the 10 geometry advisors, and all 36 idea levers.', options: { color: 'FFFFFF' } },
  ], { x: 0.85, y: 6.22, w: 11.65, h: 0.6, fontFace: 'Calibri', fontSize: 12, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'This appendix exists because of a fair question: when the tool scores a part eight and a half out of ten for manufacturability and offers a dozen cost-reduction ideas — where do those actually come from? ' +
    'The answer is a written rule book, and it is small enough to show you in full. Fifty-two threshold rules reading nineteen parameters and signals, ten geometry advisors reading the measured solid, and a thirty-six-lever idea catalogue spanning eight categories — material, design, process, tooling, logistics, commercial, quality and sustainability. That is the entire analysis. There is no hidden model behind it. ' +
    'And I want to be upfront: the first version of this layer was thinner — ten levers, mostly cost-structure ones. We took the challenge that it read like a basic checklist rather than what a good VAVE engineer would produce, went back to the engine, and rebuilt it as a full 360-degree catalogue. Everything you are about to see ships in the tool today. ' +
    'The flow is five steps and all of them are arithmetic. The costing is reduced to its parameters. Fifty-two written checks run, each one a plain threshold that fires or passes, while the geometry advisors do the same job on the measured shape. Findings knock points off two scores that start at ten. The three biggest savings combine root-sum-square so overlapping fixes are never double-counted. And the lever catalogue turns what fired into a ranked, categorised action list priced from the part’s own numbers. ' +
    'One thing to be precise about, because it is the theme of this whole pack: the AI is nowhere in this. Every rule is deterministic engine code — same part in, same findings out, with the network cable unplugged. The optional AI button writes commentary around the findings; it cannot add one, remove one, or change a score.'
  );
}

// ══════════ A2 · THE PARAMETERS — 10 CORE + 9 EXTENDED SIGNALS ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'The Parameters — 10 Core + 9 Extended Signals', 'Everything the threshold rules are allowed to read, and nothing else — all of it from the costing itself', TEAL);
  owner(s, 10.33, 0.28, 'OWNER: THE ENGINE', TEAL, TEAL_T);

  const params = [
    ['1', 'Total part cost', 'The engine’s finished ex-works cost — the reference for every percentage below.', '—'],
    ['2', 'Material share of cost', 'What fraction of the part price is spent buying raw material.', 'floor 35% (castings)'],
    ['3', 'Process share of cost', 'The fraction spent on machine time — presses, mills, ovens, lines.', 'flag at 35–60% by commodity'],
    ['4', 'Labour share of cost', 'The fraction spent on people’s time.', 'flag at 30–50% by commodity'],
    ['5', 'Tooling share of cost', 'The die, mould or fixture investment spread over the parts it makes.', 'benchmark 12%'],
    ['6', 'Overhead share of cost', 'The supplier’s factory burden — buildings, energy, management.', 'benchmark 18%'],
    ['7', 'Margin share of cost', 'The supplier’s profit on the part.', 'competitive 10–12%'],
    ['8', 'Operation count', 'How many separate process steps the part goes through.', 'flag at 4–8 by commodity'],
    ['9', 'Average OEE', 'How much of planned machine time actually makes good parts.', 'target 85% (assumed if not entered)'],
    ['10', 'Material utilisation', 'How much of the bought material ends up in the finished part.', 'benchmark 72% (assumed if not entered)'],
  ];
  const cx = [0.72, 1.3, 3.9, 8.05], cw = [0.5, 2.5, 4.05, 2.1];
  s.addText('CORE PARAMETER', { x: cx[1], y: 1.24, w: cw[1] + 1, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('IN PLAIN WORDS', { x: cx[2], y: 1.24, w: cw[2], h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('BENCHMARK', { x: cx[3], y: 1.24, w: cw[3], h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  params.forEach((r, i) => {
    const y = 1.48 + i * 0.435;
    s.addShape('roundRect', { x: 0.5, y, w: 9.75, h: 0.4, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.07 });
    s.addShape('ellipse', { x: cx[0], y: y + 0.07, w: 0.26, h: 0.26, fill: { color: i < 7 ? TEAL : BLUE } });
    s.addText(r[0], { x: cx[0], y: y + 0.07, w: 0.26, h: 0.26, fontFace: 'Calibri', fontSize: 9, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    s.addText(r[1], { x: cx[1], y, w: cw[1], h: 0.4, fontFace: 'Calibri', fontSize: 10, bold: true, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(r[2], { x: cx[2], y, w: cw[2], h: 0.4, fontFace: 'Calibri', fontSize: 8.8, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(r[3], { x: cx[3], y, w: cw[3], h: 0.4, fontFace: 'Calibri', fontSize: 8.4, italic: true, color: MUTED, margin: 0, valign: 'middle' });
  });
  s.addText('Teal — read straight off the finished costing.   Blue — entered with the part (a stated assumption is used when left blank).',
    { x: 0.5, y: 5.86, w: 9.75, h: 0.22, fontFace: 'Calibri', fontSize: 8.2, italic: true, color: MUTED, margin: 0 });

  // extended signals
  s.addShape('roundRect', { x: 0.5, y: 6.14, w: 9.75, h: 0.86, fill: { color: 'EDF3FB' }, line: { color: BLUE, width: 1 }, rectRadius: 0.08 });
  s.addText('+ 9 EXTENDED SIGNALS (added with the 360° upgrade)', { x: 0.68, y: 6.2, w: 9.4, h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: BLUE, charSpacing: 0.5, margin: 0 });
  s.addText('11 packaging share · 12 logistics share · 13 labour efficiency · 14 per-operation cost split (which op carries the money) · 15 consumables cost (cores, patterns, shell) · 16 tooling investment (NRE) and its amortisation basis vs the annual volume · 17 manning and parts-per-cycle · 18 labour-vs-machine cycle time · 19 operation names (welding, inspection, rework, heat-treat signals)',
    { x: 0.68, y: 6.4, w: 9.4, h: 0.56, fontFace: 'Calibri', fontSize: 8.2, color: SLATE, margin: 0, valign: 'top' });

  // ranking card — deliberately NOT a scoring card
  s.addShape('roundRect', { x: 10.45, y: 1.48, w: 2.38, h: 5.52, fill: { color: CARD }, line: { color: GREEN, width: 1.5 }, rectRadius: 0.1 });
  s.addText('HOW THE RANKING\nWORKS', { x: 10.62, y: 1.62, w: 2.05, h: 0.55, fontFace: 'Calibri', fontSize: 10, bold: true, color: GREEN, charSpacing: 0.4, margin: 0 });
  s.addText([
    { text: 'Every finding is priced:\n', options: { bold: true, color: NAVY } },
    { text: 'saving % × this part’s cost = ', options: { color: SLATE } },
    { text: '£/part.\n\n', options: { bold: true, color: GREEN } },
    { text: 'Ranked biggest-first inside its category; categories ordered by their best single action.\n\n', options: { color: SLATE } },
    { text: 'No score is published ', options: { bold: true, color: NAVY } },
    { text: 'and no severity label. The engine still grades findings internally to order them — that grading never leaves the engine.\n\n', options: { color: SLATE } },
    { text: 'Headline: ', options: { bold: true, color: NAVY } },
    { text: 'the three biggest combined root-sum-square — not added — capped at 40%, so overlapping actions are not double-counted.\n\n', options: { color: SLATE } },
    { text: 'Context gates: ', options: { bold: true, color: NAVY } },
    { text: 'assumed volumes, quoted regions and estimated pack rates downgrade a lever to a confirm-first note.', options: { color: SLATE } },
  ], { x: 10.62, y: 2.24, w: 2.05, h: 4.66, fontFace: 'Calibri', fontSize: 8.6, margin: 0, valign: 'top' });

  footer(s, ++PG);
  s.addNotes(
    'These are the numbers the analysis is allowed to read — the ten core parameters from before, and nine extended signals we added with the 360-degree upgrade. Nothing else goes in. ' +
    'The ten core ones you know: the total, six bucket shares, the operation count, OEE and material utilisation — teal read straight from the costing, blue entered with the part, with stated assumptions when left blank. ' +
    'The nine extended signals are what let the new rules and levers behave like an experienced cost engineer instead of a checklist. Packaging and logistics shares — two buckets the old rules ignored entirely. Labour efficiency per operation. The per-operation cost split, so the tool knows WHICH operation carries the money, not just how many there are. Consumables — cores, patterns, shell. The tooling investment and, importantly, its amortisation basis against the stated annual volume — a mismatch there is a commercial finding on its own. Manning and parts-per-cycle. Labour time against machine cycle time. And the operation names themselves — welding, inspection, rework and heat-treat words in the routing are signals, and the rules read them. ' +
    'And the card on the right is the one that changed most recently, on direct feedback from this room. It used to be a scoring card — manufacturability out of ten, assembly out of ten. It is now a ranking card. Every finding is priced against this part: saving percentage times the part cost equals pounds per part, ranked biggest first inside its category. No score is published and no severity label appears anywhere an engineer sees. The engine still grades findings internally, because it needs an order — but that grading never leaves the engine. ' +
    'The reason is worth saying out loud: a previous exercise like this scored designs, and the engineering team quite reasonably read it as a report card on their work. Nothing gets implemented after that. A ranked list of actions with money against each one is the same arithmetic and a completely different conversation. ' +
    'The headline is unchanged: the three biggest combined root-sum-square, capped at forty percent. And the context gates at the bottom — if the volume was assumed rather than entered, if the part is already costed in the region a lever would recommend, or if pack rates are tool estimates, the lever downgrades itself to a confirm-first note. The tool does not instruct on facts nobody gave it.'
  );
}

// ══════════ A3 · RULE LIBRARY 1/3 — 14 UNIVERSAL DFM CHECKS ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Rule Library 1 of 3 — 14 Checks on Every Part', 'Universal manufacturability rules, any commodity · thresholds exactly as coded', TEAL);
  owner(s, 10.33, 0.28, 'OWNER: THE ENGINE', TEAL, TEAL_T);

  const rcx = [0.72, 4.1, 9.85, 12.0], rcw = [3.3, 5.6, 2.0, 0.65];
  s.addText('RULE', { x: rcx[0], y: 1.26, w: rcw[0], h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('FIRES WHEN', { x: rcx[1], y: 1.26, w: rcw[1], h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('SEVERITY', { x: rcx[2], y: 1.26, w: rcw[2], h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('SAVE', { x: rcx[3], y: 1.26, w: rcw[3], h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: MUTED, align: 'right', charSpacing: 0.5, margin: 0 });

  const rules = [
    ['Low material utilisation', 'Under 60% of the bought material ends up in the part — over 40% is waste', 'Critical', '12%'],
    ['Below-benchmark utilisation', 'Utilisation between 60% and the 72% benchmark — nesting or billet size can improve', 'Major', '6%'],
    ['Low OEE', 'Machines productive under 70% of planned time — serious capacity and cost loss', 'Critical', '15%'],
    ['Below-target OEE', 'OEE between 70% and the 80% target — a solvable improvement gap', 'Major', '7%'],
    ['High tooling amortisation', 'Tooling above 20% of part cost, against a 12% benchmark — volume-sensitive', 'Major', '8%'],
    ['Elevated tooling amortisation', 'Tooling between 12% and 20% of part cost', 'Minor', '4%'],
    ['Overhead burden', 'Factory overhead above 18% of part cost — burden rate may be inflated', 'Major', '6%'],
    ['Supplier margin', 'Margin above 18%, versus a 10–12% competitive range — a negotiation lever', 'Major', '5%'],
    ['Packaging cost heavy', 'Packaging above 5% of part cost — returnable loop / dunnage redesign', 'Major', '4%'],
    ['Logistics cost heavy', 'Logistics above 8% of part cost — mode, consolidation and incoterm review', 'Major', '5%'],
    ['One operation dominates', 'A single named operation carries over 60% of the conversion cost', 'Major', '8%'],
    ['Low labour efficiency', 'Average labour efficiency under 80% — a fifth of paid minutes add no value', 'Minor', '4%'],
    ['Consumables dominate material', 'Cores/patterns/shell above 25% of the material line', 'Major', '6%'],
    ['Amortisation below annual volume', 'Tool amortised over fewer parts than the stated annual volume — confirm the basis', 'Minor', '—'],
  ];
  rules.forEach((r, i) => {
    const y = 1.52 + i * 0.335;
    if (i % 2 === 0) s.addShape('rect', { x: 0.5, y: y - 0.015, w: 12.33, h: 0.325, fill: { color: CARD } });
    s.addText(r[0], { x: rcx[0], y, w: rcw[0], h: 0.3, fontFace: 'Calibri', fontSize: 9.2, bold: true, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(r[1], { x: rcx[1], y, w: rcw[1], h: 0.3, fontFace: 'Calibri', fontSize: 9, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(r[2], { x: rcx[2], y, w: rcw[2], h: 0.3, fontFace: 'Calibri', fontSize: 9, bold: true, color: SEV[r[2]], margin: 0, valign: 'middle' });
    s.addText(r[3], { x: rcx[3], y, w: rcw[3], h: 0.3, fontFace: 'Calibri', fontSize: 9.2, bold: true, color: TEAL, align: 'right', margin: 0, valign: 'middle' });
  });

  s.addText('Rules 9–14 are new with the 360° upgrade — packaging, logistics, the operation Pareto, labour efficiency, consumables and the amortisation-basis check were previously unread.  ·  SEVERITY IS INTERNAL: it orders the rule list inside the engine and never appears in the app or the report — engineering sees the ranked £/part list on the last slide.',
    { x: 0.5, y: 6.42, w: 12.33, h: 0.4, fontFace: 'Calibri', fontSize: 8.5, italic: true, color: MUTED, margin: 0 });
  footer(s, ++PG);

  s.addNotes(
    'The first third of the rule book — fourteen checks that run on every part, whatever it is made of. ' +
    'The top eight you have seen before: material waste at two severities, machine productivity at two, tooling burden at two, and the two commercial ones — overhead and margin against their benchmarks. ' +
    'The bottom six are new with the 360-degree upgrade, and they close real blind spots. Packaging and logistics get their own thresholds — five and eight percent — because those buckets were previously calculated and then never looked at again. The operation-Pareto rule is the one I would call out: it does not just count operations, it finds the single named operation carrying more than sixty percent of the conversion cost and points at it. Labour efficiency below eighty percent is flagged separately from OEE, because they fail for different reasons. Consumables above a quarter of the material line — cores, patterns, shell — get flagged for rationalisation. And the last one is a pure honesty check: if the tool is amortised over fewer parts than the stated annual volume, the piece price is carrying too much tooling and the finding says confirm the basis, not "we found a saving".'
  );
}

// ══════════ A4 · RULE LIBRARY 2/3 — 27 COMMODITY CHECKS ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Rule Library 2 of 3 — The 27 Commodity Checks', 'The rules that switch on for the process actually being costed · thresholds exactly as coded', TEAL);
  owner(s, 10.33, 0.28, 'OWNER: THE ENGINE', TEAL, TEAL_T);

  const ccx = [0.72, 2.42, 5.5, 11.0, 12.35], ccw = [1.65, 3.0, 5.4, 1.3, 0.35];
  s.addText('COMMODITY', { x: ccx[0], y: 1.2, w: ccw[0], h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('CHECK', { x: ccx[1], y: 1.2, w: ccw[1], h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('FIRES WHEN', { x: ccx[2], y: 1.2, w: ccw[2], h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('SEVERITY', { x: ccx[3], y: 1.2, w: ccw[3], h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('SAVE', { x: ccx[4], y: 1.2, w: ccw[4], h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: MUTED, align: 'right', charSpacing: 0.4, margin: 0 });

  const rules = [
    ['Machining ±cast', 'Split routing across stations', 'Over 4 real ops on over 2 stations, not consolidated — quote a consolidation', 'Major', '10%'],
    ['', 'Process cost dominates', 'Machining over 40% of part cost — consider a near-net cast or forged blank', 'Major', '8%'],
    ['Casting ±machine', 'Die cost very high', 'Die over 18% of part cost — volume too low to carry the die investment', 'Critical', '12%'],
    ['', 'Material content oddly low', 'Material under 35% of cost — recheck alloy grade and net weight inputs', 'Minor', '—'],
    ['Forging', 'Low material utilisation', 'Under 75% — flash and scale loss beyond the forging benchmark', 'Major', '8%'],
    ['', 'Die cost high', 'Die over 15% of part cost — high tool investment for the volume', 'Major', '7%'],
    ['Sheet metal', 'Poor blank nesting', 'Utilisation under 65% — over a third of the sheet becomes offcut scrap', 'Critical', '15%'],
    ['', 'Too many forming stages', 'More than 6 operations — cycle time and die investment climb together', 'Major', '8%'],
    ['', 'Seam-welding distortion risk', 'Continuous MIG/TIG on thin sheet — heat distortion and straightening cost', 'Major', '6%'],
    ['', 'Tooling-dominated cost', 'Tooling over 40% of piece cost — volume too low for hard tooling', 'Major', '10%'],
    ['Moulding family', 'Mould cost very high', 'Mould over 30% of part cost — volume does not justify the tool', 'Critical', '12%'],
    ['', 'Runner and sprue waste', 'Utilisation under 75% — a hot-runner system could remove the waste', 'Major', '6%'],
    ['Extrusion', 'Conversion cost high', 'Process over 40% — die design, puller speed or billet temperature limiting', 'Major', '8%'],
    ['', 'Start-up and offcut scrap', 'Utilisation under 80% — butt ends and cut-to-length offcuts excessive', 'Major', '5%'],
    ['Rotomoulding', 'Oven cycle dominates', 'Process over 50% — arm loading, cook control and wall thickness are the levers', 'Major', '8%'],
    ['', 'Many secondary operations', 'Over 4 operations — mould-in features to delete downstream work', 'Minor', '4%'],
    ['PCB fabrication', 'Complexity-driven process cost', 'Fab process over 60% of cost — layers, fine pitch or tight tolerance driving it', 'Major', '10%'],
    ['', 'NRE heavy per board', 'Set-up over 10% of board cost — panelise or raise the batch', 'Major', '8%'],
    ['PCB assembly', 'High labour content', 'Labour over 35% — through-hole or manual rework; convert to SMT', 'Major', '12%'],
    ['', 'Many assembly stages', 'More than 6 operations — cycle time and defect risk grow together', 'Major', '7%'],
    ['Rubber', 'Cure cycle dominant', 'Process over 45% of cost — cure recipe and cavity count are the levers', 'Major', '8%'],
    ['Composites', 'Labour-intensive layup', 'Labour over 40% — manual layup dominates; automated placement pays', 'Major', '15%'],
    ['', 'Long cure cycle', 'Process over 35% — autoclave time; out-of-autoclave routes exist', 'Major', '10%'],
    ['Wiring harness', 'Labour beyond half the cost', 'Labour over 50% — automate cut, strip and crimp as a priority', 'Critical', '20%'],
    ['', 'High-complexity harness', 'More than 8 operations — branching drives time and defects', 'Major', '8%'],
    ['Painting', 'Paint material heavy', 'Material over 40% — transfer efficiency and film-build are the levers', 'Major', '8%'],
    ['Paint & BIW', 'High facility overhead', 'Overhead over 20% — paint-shop or BIW burden rate elevated', 'Major', '6%'],
  ];
  rules.forEach((r, i) => {
    const y = 1.44 + i * 0.192;
    if (r[0]) s.addShape('rect', { x: 0.5, y: y - 0.008, w: 12.33, h: 0.016, fill: { color: LINE } });
    else if (i % 2 === 1) s.addShape('rect', { x: 0.5, y: y - 0.004, w: 12.33, h: 0.184, fill: { color: CARD } });
    s.addText(r[0], { x: ccx[0], y, w: ccw[0], h: 0.18, fontFace: 'Calibri', fontSize: 7.9, bold: true, color: TEAL, margin: 0, valign: 'middle' });
    s.addText(r[1], { x: ccx[1], y, w: ccw[1], h: 0.18, fontFace: 'Calibri', fontSize: 7.9, bold: true, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(r[2], { x: ccx[2], y, w: ccw[2], h: 0.18, fontFace: 'Calibri', fontSize: 7.7, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(r[3], { x: ccx[3], y, w: ccw[3], h: 0.18, fontFace: 'Calibri', fontSize: 7.7, bold: true, color: SEV[r[3]], margin: 0, valign: 'middle' });
    s.addText(r[4], { x: ccx[4], y, w: ccw[4], h: 0.18, fontFace: 'Calibri', fontSize: 7.7, bold: true, color: TEAL, align: 'right', margin: 0, valign: 'middle' });
  });

  s.addText('"Moulding family" covers injection, blow moulding and thermoforming; "±cast/±machine" means the rule also runs for cast-and-machine parts. Extrusion, rotomoulding and the painting material rule are new with the 360° upgrade.',
    { x: 0.5, y: 6.68, w: 12.33, h: 0.38, fontFace: 'Calibri', fontSize: 8.2, italic: true, color: MUTED, margin: 0 });
  footer(s, ++PG);

  s.addNotes(
    'The second third — twenty-seven checks that switch on for the specific process being costed. A casting is never judged by sheet-metal rules. ' +
    'Most of these you saw in the previous version. What changed with the upgrade: extrusion and rotational moulding now have their own rule blocks — conversion cost and offcut scrap for extrusion, oven cycle and secondary operations for rotomoulding — where before those commodities only got the universal checks. Painting gains the rule this deck itself argues for two sections earlier: paint material above forty percent of cost points straight at transfer efficiency, because at sixty percent transfer efficiency four litres in ten end up in the booth filters. And cast-and-machine parts now run BOTH the machining rules and the casting rules — the split-routing check on their machining content, the die-cost check on their casting content — where before they fell between the two. ' +
    'The machining rules are also smarter than a count: the split-routing rule is station-aware. It knows the difference between seven operations across five machines and seven operations on one five-axis — and when the routing is already consolidated it says so as a verified note instead of recommending what has already been done. ' +
    'And notice again the two biggest numbers sit with wiring harness and composites — labour past half the cost, hand layup past forty percent. Where the money is people, the rules say so bluntly.'
  );
}

// ══════════ A5 · RULE LIBRARY 3/3 — 11 DFA CHECKS ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Rule Library 3 of 3 — The 11 Assembly Checks', 'DFA — setups, manual content, pacing, and what the operation list itself reveals', TEAL);
  owner(s, 10.33, 0.28, 'OWNER: THE ENGINE', TEAL, TEAL_T);

  const rcx = [0.72, 4.1, 9.85, 12.0], rcw = [3.3, 5.6, 2.0, 0.65];
  s.addText('RULE', { x: rcx[0], y: 1.26, w: rcw[0], h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('FIRES WHEN', { x: rcx[1], y: 1.26, w: rcw[1], h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('SEVERITY', { x: rcx[2], y: 1.26, w: rcw[2], h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('SAVE', { x: rcx[3], y: 1.26, w: rcw[3], h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: MUTED, align: 'right', charSpacing: 0.5, margin: 0 });

  const rules = [
    ['Split routing — setups/transfers', 'Over 4 real operations across over 2 stations — each transfer adds handling and variation', 'Major', '8%'],
    ['Routing already consolidated', 'Same trigger, but the routing IS consolidated — a verified note, no saving claimed', 'Verified', '—'],
    ['High manual content', 'More than 3 operations and labour above 30% of cost — automation study warranted', 'Major', '12%'],
    ['Manual pacing', 'OEE under 75% — points to hand-paced work, micro-stops or slow changeovers', 'Major', '8%'],
    ['Labour-dominated assembly', 'Harness or PCB assembly with labour above 45% of cost — fixture or automate first', 'Critical', '18%'],
    ['Repeated re-fixturing', 'Machined or forged part across more than 2 stations — pallet systems cut handling', 'Minor', '5%'],
    ['Fastener standardisation', 'More than 4 operations with labour above 20% — check fastener variety', 'Opportunity', '4%'],
    ['Inspection as a separate step', 'Standalone inspection/test ops carrying over 5% of part cost — go in-line', 'Minor', '3%'],
    ['Manual finishing after process', 'Deburr/fettle/rework appears as its own operation — fix the cause upstream', 'Minor', '3%'],
    ['High manning', 'Two or more operators on a single operation — the first automation candidate', 'Major', '6%'],
    ['Labour beyond the machine cycle', 'Charged labour minutes exceed the machine cycle by 20%+ — move work offline', 'Minor', '4%'],
  ];
  rules.forEach((r, i) => {
    const y = 1.52 + i * 0.335;
    if (i % 2 === 0) s.addShape('rect', { x: 0.5, y: y - 0.015, w: 12.33, h: 0.325, fill: { color: CARD } });
    s.addText(r[0], { x: rcx[0], y, w: rcw[0], h: 0.3, fontFace: 'Calibri', fontSize: 9.2, bold: true, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(r[1], { x: rcx[1], y, w: rcw[1], h: 0.3, fontFace: 'Calibri', fontSize: 9, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(r[2], { x: rcx[2], y, w: rcw[2], h: 0.3, fontFace: 'Calibri', fontSize: 9, bold: true, color: SEV[r[2]], margin: 0, valign: 'middle' });
    s.addText(r[3], { x: rcx[3], y, w: rcw[3], h: 0.3, fontFace: 'Calibri', fontSize: 9.2, bold: true, color: TEAL, align: 'right', margin: 0, valign: 'middle' });
  });

  s.addText('Rules 8–11 are new — Boothroyd-style checks read from the operation list itself: inspection and finishing as separate steps, manning levels, and labour running past the machine cycle. With slides 1–2: 52 threshold checks in total (41 DFM + 11 DFA).',
    { x: 0.5, y: 5.5, w: 12.33, h: 0.4, fontFace: 'Calibri', fontSize: 8.5, italic: true, color: MUTED, margin: 0 });

  s.addShape('roundRect', { x: 0.5, y: 6.02, w: 12.33, h: 0.82, fill: { color: NAVY }, rectRadius: 0.1 });
  s.addText([
    { text: 'The Boothroyd point:  ', options: { bold: true, color: '9FB6E0' } },
    { text: 'classic DFA asks whether each part and each handling step needs to exist. These checks ask the same question of the operation list the costing actually used. Severity here is internal ordering only — what reaches an engineer is the ranked £/part list, never a grade.', options: { color: 'FFFFFF' } },
  ], { x: 0.85, y: 6.1, w: 11.65, h: 0.66, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'The last third of the threshold rules — eleven assembly checks, and this is where the Boothroyd challenge from the review landed. ' +
    'The first seven are structural: setups and transfers when a routing is genuinely split — with the honest twin that fires as a VERIFIED note when the routing is already consolidated, claiming no saving; high manual content; manual pacing; the labour-dominated critical for harnesses and boards; re-fixturing; and fastener variety. ' +
    'The four new ones read the operation list the way a DFA practitioner reads an assembly: every step must justify its existence. Inspection appearing as its own operation, carrying real cost, gets challenged — capable processes verify in-line. Manual finishing — deburr, fettle, rework — as a standing operation is a symptom of an upstream cause being paid for by hand on every part. Two operators on one station is the strongest automation candidate on any routing. And labour minutes running past the machine cycle means someone is working while the machine waits, or waiting while it runs — either way the work belongs offline or in parallel. ' +
    'Add them up across the three slides: forty-one DFM plus eleven DFA — fifty-two written checks, every threshold printed, every one auditable in the source file.'
  );
}

// ══════════ A6 · THE 10 GEOMETRY ADVISORS ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'The 10 Geometry Advisors — Reading the Solid', 'Per-process advisor modules: 75 further DFM checks on the measured shape, feeding the same report', TEAL);
  owner(s, 10.33, 0.28, 'OWNER: THE ENGINE', TEAL, TEAL_T);

  const acx = [0.72, 2.6, 7.35, 12.0], acw = [1.8, 4.6, 4.55, 0.65];
  s.addText('ADVISOR', { x: acx[0], y: 1.26, w: acw[0], h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('WHAT IT READS FROM THE MEASURED SOLID', { x: acx[1], y: 1.26, w: acw[1], h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('EXAMPLE FINDING', { x: acx[2], y: 1.26, w: acw[2], h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('CHECKS', { x: acx[3], y: 1.26, w: acw[3], h: 0.2, fontFace: 'Calibri', fontSize: 8, bold: true, color: MUTED, align: 'right', charSpacing: 0.4, margin: 0 });

  const advisors = [
    ['Casting', 'Wall thickness range, draft angle, section ratio, machining stock, sharp corners, isolated heavy sections', 'Heavy section solidifies last — shrink porosity at the hot spot', '7'],
    ['Forging', 'Web thickness, draft, fillet radius, rib height ratio, grain-flow alignment, parting-line position', 'Fillet radius too tight — die wear and forging defect risk', '7'],
    ['Sheet metal', 'Gauge, bend radius, hole diameter, hole-to-edge distance, bend count, weld length, nesting', 'Bend radius below the material minimum — cracking on the outer fibre', '7'],
    ['Injection moulding', 'Wall range, rib and boss ratios, draft, texture, undercuts, flow length, gates, weld lines, tolerance', 'Rib thicker than the wall allows — sink marks on the show face', '10'],
    ['Blow moulding', 'Wall thickness, blow-up ratio, parison length-to-diameter, corner radii, handle weld line', 'Blow-up ratio too high — corners thin beyond the functional wall', '6'],
    ['Thermoforming', 'Sheet thickness, draw depth, openings, unsupported spans, radii, draft, undercuts, plug assist', 'Deep draw without plug assist — excessive thinning at the base', '10'],
    ['Extrusion', 'Wall range, internal radii, hollow chambers, layers, unsupported projections, tolerance', 'Unbalanced walls across the profile — die flow imbalance and warp', '8'],
    ['Rubber moulding', 'Section thickness, draft, flash-line position, undercuts, metal inserts, tolerance', 'Flash line lands on the sealing face — a leak path; move the parting line', '8'],
    ['Lamination', 'Tooth width, bridge width, air-gap tolerance, stack method, anneal, thin gauge handling', 'Bridge below minimum for the gauge — stamping distortion risk', '6'],
    ['Rotomoulding', 'Wall thickness, internal radii, draft, flat unsupported spans, venting, kiss-off design', 'Enclosed volume without a vent — blow-out risk at demould', '6'],
  ];
  advisors.forEach((r, i) => {
    const y = 1.52 + i * 0.5;
    s.addShape('roundRect', { x: 0.5, y, w: 12.33, h: 0.45, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.07 });
    s.addText(r[0], { x: acx[0], y, w: acw[0], h: 0.45, fontFace: 'Calibri', fontSize: 9.6, bold: true, color: TEAL, margin: 0, valign: 'middle' });
    s.addText(r[1], { x: acx[1], y, w: acw[1], h: 0.45, fontFace: 'Calibri', fontSize: 8.4, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(r[2], { x: acx[2], y, w: acw[2], h: 0.45, fontFace: 'Calibri', fontSize: 8.4, italic: true, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(r[3], { x: acx[3], y, w: acw[3], h: 0.45, fontFace: 'Calibri', fontSize: 9.6, bold: true, color: TEAL, align: 'right', margin: 0, valign: 'middle' });
  });

  s.addText('75 geometry checks in total. They run alongside the 52 cost-structure rules and feed the same DFM/DFA sections of the report — findings the AI can comment on but never write.',
    { x: 0.5, y: 6.62, w: 12.33, h: 0.4, fontFace: 'Calibri', fontSize: 8.5, italic: true, color: MUTED, margin: 0 });
  footer(s, ++PG);

  s.addNotes(
    'The fifty-two rules you have just seen read the cost structure. This slide is the other half of the DFM story: the ten geometry advisors, which read the measured solid itself — the walls, the draft, the radii, the spans — one advisor module per manufacturing process, seventy-five checks between them. ' +
    'Each row is one advisor. The casting advisor looks for the things a foundry would: heavy isolated sections that solidify last and draw porosity, missing draft, too little machining stock. The forging advisor checks webs, fillets and grain flow. Sheet metal checks bend radii against the material gauge and holes too close to an edge. Injection moulding is the busiest — ten checks covering ribs, bosses, draft, undercuts, flow length and weld lines. Blow moulding and thermoforming watch thinning — blow-up ratios and deep draws. Extrusion checks wall balance across the profile, rubber checks where the flash line lands — on a sealing face that is a leak path — lamination checks tooth and bridge widths on electrical steels, and rotomoulding checks venting and kiss-offs. ' +
    'The important sentence is the footnote: these seventy-five checks run alongside the fifty-two cost-structure rules and feed the same sections of the report. All of it deterministic, all of it from the measured geometry — and the AI can add commentary to these findings, but it cannot write one.'
  );
}

// ══════════ A7 · IDEA GENERATION 1/2 — MATERIAL · DESIGN · PROCESS ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Idea Generation 1 of 2 — The 360° Catalogue', '36 levers in 8 categories, every one priced from the part’s own numbers · this slide: material, design, process', GREEN);
  owner(s, 10.33, 0.28, 'OWNER: THE ENGINE', TEAL, TEAL_T);

  const lcx = [0.72, 4.2, 9.4, 10.45, 11.5], lcw = [3.4, 5.1, 0.95, 0.95, 1.35];
  const header = y => {
    s.addText('LEVER', { x: lcx[0], y, w: lcw[0], h: 0.18, fontFace: 'Calibri', fontSize: 7.6, bold: true, color: MUTED, charSpacing: 0.4, margin: 0 });
    s.addText('SUGGESTED WHEN', { x: lcx[1], y, w: lcw[1], h: 0.18, fontFace: 'Calibri', fontSize: 7.6, bold: true, color: MUTED, charSpacing: 0.4, margin: 0 });
    s.addText('UP TO', { x: lcx[2], y, w: lcw[2], h: 0.18, fontFace: 'Calibri', fontSize: 7.6, bold: true, color: MUTED, charSpacing: 0.4, margin: 0 });
    s.addText('RISK', { x: lcx[3], y, w: lcw[3], h: 0.18, fontFace: 'Calibri', fontSize: 7.6, bold: true, color: MUTED, charSpacing: 0.4, margin: 0 });
    s.addText('TIMEFRAME', { x: lcx[4], y, w: lcw[4], h: 0.18, fontFace: 'Calibri', fontSize: 7.6, bold: true, color: MUTED, charSpacing: 0.4, margin: 0 });
  };
  const banner = (y, label, col, tint) => {
    s.addShape('roundRect', { x: 0.5, y, w: 12.33, h: 0.24, fill: { color: tint }, rectRadius: 0.05 });
    s.addText(label, { x: 0.72, y, w: 11.9, h: 0.24, fontFace: 'Calibri', fontSize: 8.2, bold: true, color: col, charSpacing: 0.5, margin: 0, valign: 'middle' });
  };
  const row = (y, [t, w, sv, rk, tf], zebra) => {
    if (zebra) s.addShape('rect', { x: 0.5, y: y - 0.005, w: 12.33, h: 0.245, fill: { color: CARD } });
    s.addText(t, { x: lcx[0], y, w: lcw[0], h: 0.24, fontFace: 'Calibri', fontSize: 8.3, bold: true, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(w, { x: lcx[1], y, w: lcw[1], h: 0.24, fontFace: 'Calibri', fontSize: 8.1, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(sv, { x: lcx[2], y, w: lcw[2], h: 0.24, fontFace: 'Calibri', fontSize: 8.6, bold: true, color: TEAL, margin: 0, valign: 'middle' });
    s.addText(rk, { x: lcx[3], y, w: lcw[3], h: 0.24, fontFace: 'Calibri', fontSize: 8.1, bold: true, color: RISKC[rk], margin: 0, valign: 'middle' });
    s.addText(tf, { x: lcx[4], y, w: lcw[4], h: 0.24, fontFace: 'Calibri', fontSize: 8.1, bold: true, color: TIMEC[tf], margin: 0, valign: 'middle' });
  };

  const MATERIAL = [
    ['Near-net-shape / better nesting', 'Material utilisation under 75% — pre-forms or CAD-optimised nesting toward 80–90%', '15%', 'Med', 'Medium term'],
    ['Alternate material grade study', 'Metal part with material above 40% of cost — equivalent lower-cost or secondary grade', '8%', 'Med', 'Medium term'],
    ['Closed-loop regrind of runners', 'Moulding below 92% utilisation — reprocess runners/trim as a controlled blend', '5%', 'Low', 'Quick win'],
    ['Scrap revenue at index prices', 'Metal cutting below 80% utilisation — claim the scrap credit at LME-linked prices', '4%', 'Low', 'Quick win'],
    ['Consumables rationalisation', 'Cores/patterns/shell above 20% of the material line — count, life and reclaim', '6%', 'Med', 'Medium term'],
  ];
  const DESIGN = [
    ['Tolerance & finish relaxation', 'Grinding/honing content, or machining above 35% of cost — challenge the callouts', '6%', 'Low', 'Quick win'],
    ['Part-count integration (Boothroyd)', '5+ operations on discrete/assembled parts — minimum-part-count test on each', '6%', 'Med', 'Long term'],
    ['Lightweighting / wall optimisation', 'Wall-driven process with material above 42% — topology vs the measured geometry', '6%', 'Med', 'Long term'],
    ['DFM design review (backstop)', 'Guaranteed whenever fewer than 5 levers have fired', '5%', 'Low', 'Quick win'],
  ];
  const PROCESS = [
    ['Automate high-labour operations', 'Labour above 30% of part cost — cobots or hard automation on repetitive tasks', '20%', 'Med', 'Medium term'],
    ['Multi-axis consolidation OR re-quote', 'Split routing — the optimiser prices both directions and recommends the winner', '20%', 'Med', 'Quick/Long'],
    ['Multi-cavity / multi-up tooling', 'Single-cavity moulding or die casting — cavitation halves machine minutes per part', '12%', 'Med', 'Medium term'],
    ['OEE improvement programme (TPM)', 'OEE under 82% — maintenance and changeover toward the 85% mark', '12%', 'Low', 'Medium term'],
    ['Attack the bottleneck (named op)', 'One operation carries over 50% of conversion cost — it is named in the finding', '8%', 'Med', 'Medium term'],
    ['Unmanned / lights-out running', 'Machine-paced machining, labour above 12%, OEE healthy — run a ghost shift', '6%', 'Med', 'Medium term'],
    ['Multi-machine manning', 'Machine paces the cycle but each machine carries an operator — go 1:2', '5%', 'Low', 'Quick win'],
  ];

  let y = 1.2;
  banner(y, 'MATERIAL · 5 LEVERS', TEAL, TEAL_T); y += 0.28; header(y); y += 0.2;
  MATERIAL.forEach((r, i) => { row(y, r, i % 2 === 0); y += 0.25; });
  y += 0.1; banner(y, 'DESIGN · 4 LEVERS', PURPLE, PURPLE_T); y += 0.28; header(y); y += 0.2;
  DESIGN.forEach((r, i) => { row(y, r, i % 2 === 0); y += 0.25; });
  y += 0.1; banner(y, 'PROCESS · 7 LEVERS', BLUE, BLUE_T); y += 0.28; header(y); y += 0.2;
  PROCESS.forEach((r, i) => { row(y, r, i % 2 === 0); y += 0.25; });

  s.addText('"Up to" is each lever’s cap — the actual figure is computed from the part’s own numbers, and the list is returned ranked, biggest saving first.',
    { x: 0.5, y: 6.85, w: 12.33, h: 0.24, fontFace: 'Calibri', fontSize: 8.2, italic: true, color: MUTED, margin: 0 });
  footer(s, ++PG);

  s.addNotes(
    'And now the part of the engine that answers the challenge directly — the idea-generation catalogue, rebuilt from ten levers to thirty-six, in eight categories. This slide carries the first three: material, design and process. ' +
    'Material: near-net-shape and nesting as before, and four new ones. An alternate-grade study when the metal is the biggest line. Closed-loop regrind of runners on mouldings. A scrap-revenue clause — because thirty percent of the bought material leaving as chips has an index price, and that credit belongs to us, not inside the supplier’s margin. And consumables rationalisation for foundry parts. ' +
    'Design: tolerance and finish relaxation — the cheapest lever in engineering; the Boothroyd part-count test, formalised; lightweighting against the measured geometry the kernel already holds; and the review backstop. ' +
    'Process is where the deepest engine work sits. The consolidation lever is no longer generic advice — the routing optimiser prices consolidation against the split routing and recommends whichever direction the arithmetic supports, as a pounds-per-part delta. The bottleneck lever names the operation that carries the money. Multi-cavity fires only on genuinely single-cavity tools. Lights-out fires only on the profile that can actually run unmanned — machine-paced, real labour content, healthy OEE. And multi-machine manning fires when the machine paces the cycle but every machine still carries a full operator. ' +
    'Note the cap column: those are ceilings, not promises. Each lever computes its actual figure from this part’s own numbers, and the list comes back ranked.'
  );
}

// ══════════ A8 · IDEA GENERATION 2/2 — TOOLING · LOGISTICS · COMMERCIAL · QUALITY · SUSTAINABILITY ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Idea Generation 2 of 2 — Completing the 360°', 'This slide: tooling, packaging & logistics, commercial, quality, sustainability', GREEN);
  owner(s, 10.33, 0.28, 'OWNER: THE ENGINE', TEAL, TEAL_T);

  const lcx = [0.72, 4.2, 9.4, 10.45, 11.5], lcw = [3.4, 5.1, 0.95, 0.95, 1.35];
  const banner = (y, label, col, tint) => {
    s.addShape('roundRect', { x: 0.5, y, w: 12.33, h: 0.2, fill: { color: tint }, rectRadius: 0.05 });
    s.addText(label, { x: 0.72, y, w: 11.9, h: 0.2, fontFace: 'Calibri', fontSize: 7.8, bold: true, color: col, charSpacing: 0.5, margin: 0, valign: 'middle' });
  };
  const row = (y, [t, w, sv, rk, tf], zebra) => {
    if (zebra) s.addShape('rect', { x: 0.5, y: y - 0.005, w: 12.33, h: 0.215, fill: { color: CARD } });
    s.addText(t, { x: lcx[0], y, w: lcw[0], h: 0.21, fontFace: 'Calibri', fontSize: 8, bold: true, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(w, { x: lcx[1], y, w: lcw[1], h: 0.21, fontFace: 'Calibri', fontSize: 7.9, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(sv, { x: lcx[2], y, w: lcw[2], h: 0.21, fontFace: 'Calibri', fontSize: 8.3, bold: true, color: TEAL, margin: 0, valign: 'middle' });
    s.addText(rk, { x: lcx[3], y, w: lcw[3], h: 0.21, fontFace: 'Calibri', fontSize: 7.9, bold: true, color: RISKC[rk], margin: 0, valign: 'middle' });
    s.addText(tf, { x: lcx[4], y, w: lcw[4], h: 0.21, fontFace: 'Calibri', fontSize: 7.9, bold: true, color: TIMEC[tf], margin: 0, valign: 'middle' });
  };

  const TOOLING = [
    ['Volume increase to dilute NRE', 'Tooling above 12% of part cost — doubling volume halves tooling per part', '10%', 'Low', 'Quick win'],
    ['Soft / bridge tooling', 'Under 25k parts with tooling above 25% — aluminium tools and printed inserts win', '8%', 'Med', 'Medium term'],
    ['Tooling ownership & end-of-life terms', 'Any part with real NRE — separate tooling PO, customer ownership, maintenance terms', '4%', 'Low', 'Quick win'],
    ['Tool-life extension programme', 'Die processes with tooling above 15% — coatings and maintenance stretch die life', '4%', 'Low', 'Medium term'],
  ];
  const LOGISTICS = [
    ['Returnable packaging loop', 'Packaging above 4% of part cost — totes and dunnage pay back inside a year', '4%', 'Low', 'Quick win'],
    ['Pack density / cube utilisation', 'Packaging plus freight above 8% — nest, stack, redesign the dunnage', '4%', 'Low', 'Quick win'],
    ['Freight mode & consolidation', 'Logistics above 6% — sea vs air, milk runs, full containers, incoterm', '5%', 'Low', 'Quick win'],
    ['Near-shore landed-cost check', 'Already in a low-cost region with logistics above 9% — rerun on landed cost', '6%', 'Med', 'Long term'],
  ];
  const COMMERCIAL = [
    ['Regional sourcing study (LCC)', 'Conversion above 30% and not already low-cost — regional arbitrage is real', '18%', 'High', 'Long term'],
    ['Overhead negotiation, open-book', 'Overhead above 15% — benchmark against typical 10–15% tier-1 burden', '6%', 'Low', 'Quick win'],
    ['Make-vs-buy assessment', 'Overhead above 18% on heavy conversion — should this part be inside?', '6%', 'High', 'Long term'],
    ['Competitive RFQ on margin', 'Margin above 12% — three-way RFQ with this should-cost as the floor', '5%', 'Low', 'Quick win'],
    ['Raw-material indexation clause', 'Material above 40% — remove the supplier’s volatility hedge from the price', '3%', 'Low', 'Quick win'],
    ['Learning-curve price-down', 'Labour above 20% with a confirmed volume, none priced in — share the curve', '3%', 'Low', 'Quick win'],
    ['Payment terms / early settlement', 'Any priced margin — 1–2% for cash is standard dynamic discounting', '2%', 'Low', 'Quick win'],
    ['Annual volume re-commitment (backstop)', 'Guaranteed whenever fewer than 6 levers have fired', '3%', 'Low', 'Quick win'],
  ];
  const QUALITY = [
    ['Right-size inspection & test', 'Standalone inspection above 5% of cost — SPC skip-lot, in-line gauging', '4%', 'Low', 'Medium term'],
    ['Eliminate manual finishing at source', 'Deburr/fettle/rework operations present — fix the upstream cause', '4%', 'Low', 'Medium term'],
  ];
  const SUSTAIN = [
    ['Recycled-content (PCR) resin blend', 'Resin above 35% of cost — 10–30% PCR where colour and mechanicals allow', '4%', 'Med', 'Medium term'],
    ['Energy productivity programme', 'Melt, cure, oven or heat-treat content — energy is inside the machine rate', '3%', 'Low', 'Medium term'],
  ];

  let y = 1.12;
  banner(y, 'TOOLING · 4 LEVERS', AMBER, AMBER_T); y += 0.24;
  TOOLING.forEach((r, i) => { row(y, r, i % 2 === 0); y += 0.22; });
  y += 0.06; banner(y, 'PACKAGING & LOGISTICS · 4 LEVERS', BLUE, BLUE_T); y += 0.24;
  LOGISTICS.forEach((r, i) => { row(y, r, i % 2 === 0); y += 0.22; });
  y += 0.06; banner(y, 'COMMERCIAL · 8 LEVERS', NAVY, 'E8EDF6'); y += 0.24;
  COMMERCIAL.forEach((r, i) => { row(y, r, i % 2 === 0); y += 0.22; });
  y += 0.06; banner(y, 'QUALITY · 2 LEVERS', RED, 'FBEAE8'); y += 0.24;
  QUALITY.forEach((r, i) => { row(y, r, i % 2 === 0); y += 0.22; });
  y += 0.06; banner(y, 'SUSTAINABILITY · 2 LEVERS', GREEN, GREEN_T); y += 0.24;
  SUSTAIN.forEach((r, i) => { row(y, r, i % 2 === 0); y += 0.22; });

  footer(s, ++PG);

  s.addNotes(
    'The second half of the catalogue — tooling, packaging and logistics, commercial, quality and sustainability. This is the "360 degrees" part of the claim: the old layer stopped at the factory gate; this one follows the part all the way to the loading dock and the contract. ' +
    'Tooling: the volume lever as before, plus soft tooling below twenty-five thousand parts, a tooling-ownership clause — who owns the tool, who maintains it, what happens at end of programme — and a tool-life programme on die processes. ' +
    'Packaging and logistics were completely dark before: returnable packaging above four percent, pack density above eight, freight mode above six, and my favourite of the new set — the near-shore check. If the part is already in China and logistics is past nine percent of its cost, the tool now asks the opposite question to the usual one: would a nearer supplier win on LANDED cost? The same arithmetic that used to only push parts offshore can now push back. ' +
    'Commercial: the three from before — regional sourcing, open-book overhead, competitive RFQ — plus make-vs-buy, a raw-material indexation clause, a learning-curve price-down where a real volume was confirmed, and payment terms. ' +
    'Quality reads the routing: standalone inspection and manual finishing both get challenged at source. And sustainability carries real money as well as carbon: recycled resin content and process energy. ' +
    'Two honest notes to close. Every lever is gated on what a person actually told the tool — assumed volumes, quoted regions and estimated pack rates downgrade the lever to a confirm-first note. And the two backstops still exist so no part ever leaves with an empty list — they are labelled as what they are.'
  );
}

// ══════════ A9 · WHAT ENGINEERING ACTUALLY SEES ══════════
// Real output: the £23.27 reference bracket, run through the shipped engine.
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'What Engineering Actually Sees', 'The output for one real part — ranked by money, grouped by category, nothing graded', GREEN);
  owner(s, 10.33, 0.28, 'OWNER: THE ENGINE', TEAL, TEAL_T);

  // headline strip
  s.addShape('roundRect', { x: 0.5, y: 1.18, w: 12.33, h: 0.72, fill: { color: GREEN_T }, line: { color: GREEN, width: 1.25 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Combined opportunity £3.22/part ', options: { bold: true, color: GREEN, fontSize: 13 } },
    { text: '(~12.8% of the £25.14 piece cost)  ·  10 ranked opportunities across 4 categories  ·  machining', options: { color: SLATE, fontSize: 11 } },
  ], { x: 0.78, y: 1.18, w: 11.8, h: 0.72, fontFace: 'Calibri', margin: 0, valign: 'middle' });

  const ccx = [0.72, 1.25, 4.9, 10.15, 11.25, 12.15], ccw = [0.4, 3.6, 5.2, 1.0, 0.85, 1.1];
  const header = y => {
    ['#', 'ACTION', 'WHY IT IS ON THE LIST', 'SAVE/PART', 'RISK', 'TIMEFRAME'].forEach((h, i) =>
      s.addText(h, { x: ccx[i], y, w: ccw[i], h: 0.18, fontFace: 'Calibri', fontSize: 7.4, bold: true, color: MUTED, charSpacing: 0.4, margin: 0 }));
  };
  const band = (y, label, best, col, tint) => {
    s.addShape('roundRect', { x: 0.5, y, w: 12.33, h: 0.22, fill: { color: tint }, rectRadius: 0.05 });
    s.addText(label, { x: 0.72, y, w: 8, h: 0.22, fontFace: 'Calibri', fontSize: 8, bold: true, color: col, charSpacing: 0.5, margin: 0, valign: 'middle' });
    s.addText(`best ${best}/part`, { x: 10.0, y, w: 2.6, h: 0.22, fontFace: 'Calibri', fontSize: 8, bold: true, color: col, align: 'right', margin: 0, valign: 'middle' });
  };
  const row = (y, [n, action, why, save, risk, tf], zebra) => {
    if (zebra) s.addShape('rect', { x: 0.5, y: y - 0.005, w: 12.33, h: 0.245, fill: { color: CARD } });
    s.addText(n, { x: ccx[0], y, w: ccw[0], h: 0.24, fontFace: 'Calibri', fontSize: 8.4, bold: true, color: MUTED, margin: 0, valign: 'middle' });
    s.addText(action, { x: ccx[1], y, w: ccw[1], h: 0.24, fontFace: 'Calibri', fontSize: 8.4, bold: true, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(why, { x: ccx[2], y, w: ccw[2], h: 0.24, fontFace: 'Calibri', fontSize: 8, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(save, { x: ccx[3], y, w: ccw[3], h: 0.24, fontFace: 'Calibri', fontSize: 9, bold: true, color: GREEN, align: 'right', margin: 0, valign: 'middle' });
    s.addText(risk, { x: ccx[4], y, w: ccw[4], h: 0.24, fontFace: 'Calibri', fontSize: 8, bold: true, color: RISKC[risk], margin: 0, valign: 'middle' });
    s.addText(tf, { x: ccx[5], y, w: ccw[5], h: 0.24, fontFace: 'Calibri', fontSize: 8, bold: true, color: TIMEC[tf], margin: 0, valign: 'middle' });
  };

  let y = 2.02;
  header(y); y += 0.2;
  band(y, 'COMMERCIAL & SOURCING · 2 opportunities', '£4.53', NAVY, 'E8EDF6'); y += 0.26;
  [
    ['1', 'Regional sourcing study (LCC)', 'Conversion cost at 69.6% of the part — real regional arbitrage', '£4.53', 'High', 'Long term'],
    ['2', 'Learning-curve price-down', 'Labour 23.5% with a confirmed volume and no curve priced in', '£0.75', 'Low', 'Quick win'],
  ].forEach((r, i) => { row(y, r, i % 2 === 0); y += 0.25; });

  y += 0.06; band(y, 'MATERIAL · 2 opportunities', '£2.52', TEAL, TEAL_T); y += 0.26;
  [
    ['3', 'Near-net-shape / better nesting', 'Utilisation 65% against the 80–90% target', '£2.52', 'Med', 'Medium term'],
    ['4', 'Scrap revenue at index prices', '35% of bought metal leaves as chips — claim the credit', '£0.82', 'Low', 'Quick win'],
  ].forEach((r, i) => { row(y, r, i % 2 === 0); y += 0.25; });

  y += 0.06; band(y, 'PROCESS & AUTOMATION · 4 opportunities', '£2.01', BLUE, BLUE_T); y += 0.26;
  [
    ['5', 'Attack the bottleneck: "CNC Milling"', 'One operation carries 64% of the conversion cost', '£2.01', 'Med', 'Medium term'],
    ['6', 'Near-net-shape pre-form (cast/forge)', 'Machining is 46.0% of the part cost', '£2.01', 'Med', 'Medium term'],
    ['7', 'Unmanned / lights-out running', 'Machine-paced, labour 23.5%, OEE 89% — the classic profile', '£1.51', 'Med', 'Medium term'],
    ['8', 'Multi-machine manning', 'One operator per machine while the machine paces the cycle', '£1.26', 'Low', 'Quick win'],
  ].forEach((r, i) => { row(y, r, i % 2 === 0); y += 0.25; });

  y += 0.06; band(y, 'DESIGN & GEOMETRY · 2 opportunities', '£1.26', PURPLE, PURPLE_T); y += 0.26;
  [
    ['9', 'Pallet / tombstone fixturing', '3 operations across 3 stations imply repeated re-fixturing', '£1.26', 'Low', 'Quick win'],
    ['10', 'Tolerance & surface-finish relaxation', 'The tightest callouts set the machine, cycle and inspection', '£1.01', 'Low', 'Quick win'],
  ].forEach((r, i) => { row(y, r, i % 2 === 0); y += 0.25; });

  s.addShape('roundRect', { x: 0.5, y: 6.14, w: 12.33, h: 0.76, fill: { color: NAVY }, rectRadius: 0.1 });
  s.addText([
    { text: 'Read the whole slide and notice what is missing:  ', options: { bold: true, color: '9FB6E0' } },
    { text: 'no score, no “critical”, nothing that grades the design. Ten things to do, what each is worth, who owns it and how long it takes — the identical deterministic findings, presented as work rather than as a verdict.', options: { color: 'FFFFFF' } },
  ], { x: 0.85, y: 6.22, w: 11.65, h: 0.6, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'This is the output, for a real part — the reference machined bracket, run through the shipped engine. Not a mock-up; these are the numbers the tool produced. ' +
    'Top line: three pounds twenty-two per part of combined opportunity, about thirteen percent of a twenty-five pound piece cost, ten ranked opportunities across four categories. ' +
    'Then the list, and this is the whole point of the change. Commercial and sourcing first, because it holds the single biggest action — a regional sourcing study worth four pounds fifty-three a part, and the tool flags it high risk and long term rather than pretending it is free. Material second: near-net-shape at two fifty-two, and a scrap-credit clause at eighty-two pence that costs nothing but a conversation. Process third, led by the bottleneck lever that names the operation — CNC milling carries sixty-four percent of the conversion cost on this part, so that is where cycle-time work pays. Design last on this part, at a pound twenty-six. ' +
    'Every row says what to do, why it is on the list, what it is worth in pounds, who can pull it and how long it takes. ' +
    'And now the thing I would ask you to notice, which is what is NOT on the slide. There is no score. There is no "critical". There is nothing that grades the part or the person who designed it. This is exactly the same deterministic arithmetic we had before — fifty-two rules, ten advisors, thirty-six levers — presented as a work list instead of a verdict. That was the feedback, and I think it is right: the last time an exercise like this scored designs, engineering read it as criticism and nothing got implemented. A ranked list with money against it is a conversation people want to have.'
  );
}

// ══════════ TECHNICAL APPENDIX · THE STACK AND WHAT FLOWS THROUGH IT ══════════
// The flow-and-boxes layout, with the data hand-offs folded into it: each box
// says what it is built from AND what it hands to the next box. Plain language
// on the slide; the exact type names are there so an engineer can grep for them.
// Every line count and field name is taken from the repo, not estimated.
FOOT = 'CostVision · technical architecture — what each box is made of, and what flows between them';
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Technical Architecture — Boxes, Code and Data Flow', 'Six steps with the cost engine in the middle. Each box: what it is built from, and what it hands on', NAVY);

  const MONO = 'Consolas';

  /** One step: number, plain-English job, and the parcel of data it hands on. */
  const step = (x, n, ttl, job, obj, objPlain, col) => {
    const y = 1.06, w = 1.18, h = 1.62;
    s.addShape('roundRect', { x, y, w, h, fill: { color: CARD }, line: { color: col, width: 1.25 }, rectRadius: 0.08 });
    s.addShape('ellipse', { x: x + 0.45, y: y + 0.07, w: 0.28, h: 0.28, fill: { color: col } });
    s.addText(String(n), { x: x + 0.45, y: y + 0.07, w: 0.28, h: 0.28, fontFace: 'Calibri', fontSize: 8.6, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    s.addText(ttl, { x: x + 0.05, y: y + 0.38, w: w - 0.1, h: 0.2, fontFace: 'Calibri', fontSize: 8.8, bold: true, color: col, align: 'center', margin: 0 });
    s.addText(job, { x: x + 0.06, y: y + 0.58, w: w - 0.12, h: 0.42, fontFace: 'Calibri', fontSize: 7.0, color: SLATE, align: 'center', margin: 0, valign: 'top' });
    // the hand-off
    s.addShape('roundRect', { x: x + 0.06, y: y + 1.02, w: w - 0.12, h: 0.54, fill: { color: 'F0F4F9' }, line: { color: LINE, width: 0.75 }, rectRadius: 0.05 });
    s.addText('HANDS ON', { x: x + 0.06, y: y + 1.04, w: w - 0.12, h: 0.12, fontFace: 'Calibri', fontSize: 5.4, bold: true, color: MUTED, align: 'center', charSpacing: 0.3, margin: 0 });
    s.addText(obj, { x: x + 0.03, y: y + 1.16, w: w - 0.06, h: 0.14, fontFace: MONO, fontSize: 6.2, bold: true, color: NAVY, align: 'center', margin: 0 });
    s.addText(objPlain, { x: x + 0.06, y: y + 1.30, w: w - 0.12, h: 0.24, fontFace: 'Calibri', fontSize: 6.2, color: SLATE, align: 'center', margin: 0, valign: 'top' });
  };

  step(0.50, 1, 'Upload', 'A CAD file, a PCB photo, or a typed form', 'the file', 'STEP · IGES · STL · JPG', BLUE);
  step(1.78, 2, 'Measure', 'The Python kernel measures the solid', 'OCCTGeometry', 'size, walls, holes, draft', AMBER);
  step(3.06, 3, 'Derive', '162 rules turn measurements into cost inputs', 'UniversalStackInput', 'material, operations, tooling', TEAL);

  s.addShape('line', { x: 4.28, y: 1.87, w: 0.22, h: 0, line: { color: TEAL, width: 2.5, endArrowType: 'triangle' } });

  // ── the cost engine, in the middle ──
  s.addShape('roundRect', { x: 4.54, y: 1.06, w: 4.26, h: 1.62, fill: { color: TEAL_T }, line: { color: TEAL, width: 2 }, rectRadius: 0.1 });
  s.addText('THE COST ENGINE  ·  src/engine/', { x: 4.68, y: 1.11, w: 4.0, h: 0.22, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: TEAL, margin: 0, valign: 'middle' });
  s.addText('TypeScript · 29,229 lines · 1,530 tests · same code runs in the browser and on the server',
    { x: 4.68, y: 1.32, w: 4.0, h: 0.18, fontFace: 'Calibri', fontSize: 6.9, italic: true, color: NAVY, margin: 0 });
  [['core.ts works out the 8 cost buckets', 0], ['18 commodity modules', 1], ['Optimisers pick the cheapest capable machine', 2], ['Guardrails check every number', 3]]
    .forEach(([t, i]) => {
      const cx = 4.68 + (i % 2) * 2.02, cy = 1.53 + Math.floor(i / 2) * 0.185;
      s.addShape('ellipse', { x: cx, y: cy + 0.05, w: 0.07, h: 0.07, fill: { color: TEAL } });
      s.addText(t, { x: cx + 0.12, y: cy, w: 1.9, h: 0.18, fontFace: 'Calibri', fontSize: 6.5, color: SLATE, margin: 0, valign: 'middle' });
    });
  s.addShape('roundRect', { x: 4.68, y: 1.92, w: 3.98, h: 0.3, fill: { color: CARD }, line: { color: TEAL, width: 0.75 }, rectRadius: 0.05 });
  s.addText([
    { text: 'HANDS ON  ', options: { fontSize: 5.6, bold: true, color: MUTED } },
    { text: 'PartCostResult', options: { fontFace: MONO, fontSize: 7.4, bold: true, color: NAVY } },
    { text: '  — the 8 buckets, plus where every number came from', options: { fontSize: 6.6, color: SLATE } },
  ], { x: 4.76, y: 1.92, w: 3.82, h: 0.3, fontFace: 'Calibri', margin: 0, valign: 'middle' });
  s.addShape('roundRect', { x: 4.68, y: 2.28, w: 3.98, h: 0.3, fill: { color: NAVY }, rectRadius: 0.05 });
  s.addText('Numbers in, numbers out. No database, no network, no file access.',
    { x: 4.78, y: 2.28, w: 3.78, h: 0.3, fontFace: 'Calibri', fontSize: 6.9, bold: true, color: 'FFFFFF', margin: 0, valign: 'middle' });

  s.addShape('line', { x: 8.84, y: 1.87, w: 0.22, h: 0, line: { color: TEAL, width: 2.5, endArrowType: 'triangle' } });

  step(9.08, 4, 'Check', 'Guardrails, self-audit and the confidence band', 'a checked cost', 'plus any warnings', AMBER);
  step(10.36, 5, 'Rank', 'Findings become savings, ranked by money', 'RankedOpportunities', 'what to do, what it is worth', GREEN);
  step(11.64, 6, 'Keep', 'Saved on your server; reports made in the browser', 'SQLite · 12 tables', 'PDF · Excel · PowerPoint', PURPLE);

  // ── what is actually inside those parcels ────────────────────────────────
  s.addShape('roundRect', { x: 0.5, y: 2.78, w: 12.33, h: 0.66, fill: { color: 'F0F4F9' }, line: { color: LINE, width: 1 }, rectRadius: 0.07 });
  s.addText('WHAT IS INSIDE EACH PARCEL', { x: 0.68, y: 2.82, w: 3, h: 0.16, fontFace: 'Calibri', fontSize: 7, bold: true, color: MUTED, charSpacing: 0.4, margin: 0 });
  const parcels = [
    ['OCCTGeometry', 'bounding box · volume · wall thickness · draft angles · setup count · hole and boss table'],
    ['UniversalStackInput', 'material and utilisation · per-operation cycle time, OEE, manning · tooling · overhead · margin'],
    ['PartCostResult', 'the 8 buckets · cost per operation · total · a traceability row per figure (value, unit, rate)'],
    ['RankedOpportunities', 'each idea with its saving in £/part, risk, timeframe and owner — grouped by category, biggest first'],
  ];
  parcels.forEach(([k, v], i) => {
    const y = 2.99 + (i % 2) * 0.20, x = 0.68 + Math.floor(i / 2) * 6.15;
    s.addText(k, { x, y, w: 1.32, h: 0.18, fontFace: MONO, fontSize: 6.4, bold: true, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(v, { x: x + 1.34, y, w: 4.7, h: 0.18, fontFace: 'Calibri', fontSize: 6.4, color: SLATE, margin: 0, valign: 'middle' });
  });

  // ── the facts table ───────────────────────────────────────────────────────
  const cx = [0.5, 3.05, 6.10, 7.22, 9.72], cw = [2.55, 2.95, 0.80, 2.40, 3.11];
  const th = ['Component', 'Built with', 'Lines', 'Free to use?', 'Calls out to the internet?'];
  th.forEach((h, i) => s.addText(h, { x: cx[i], y: 3.54, w: cw[i], h: 0.24, fontFace: 'Calibri', fontSize: 8, bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: i === 2 ? 'right' : 'left', valign: 'middle', margin: 0.06 }));

  const rows = [
    ['Geometry kernel', 'Python 3 + Open CASCADE (via OCP)', '1,587', 'Yes — LGPL-2.1 + exc. / Apache-2.0', 'No', GREEN],
    ['3D viewer', 'TypeScript + three.js (WebGL)', '2,334', 'Yes — MIT', 'No', GREEN],
    ['Cost engine (core + 18 modules)', 'TypeScript, no framework', '29,229', 'Yes — our own code', 'No', GREEN],
    ['Cost-input rules (162 of them)', 'TypeScript, inside the engine', '7,525', 'Yes — our own code', 'No', GREEN],
    ['Optimisers + DFM / idea levers', 'TypeScript, inside the engine', '1,973', 'Yes — our own code', 'No', GREEN],
    ['Guardrails + self-audit', 'TypeScript (engine + server)', '780', 'Yes — our own code', 'No', GREEN],
    ['Rate library — 20 regions', 'TypeScript data files, in git', '2,501', 'Yes — our own data', 'No', GREEN],
    ['Server + database', 'TypeScript · Express + SQLite', '14,215', 'Yes — MIT', 'Localhost only', GREEN],
    ['AI classifier — OPTIONAL', 'TypeScript · Anthropic SDK', '~900', 'SDK free · API paid per token', 'YES — the only one', PURPLE],
    ['Automated tests', 'TypeScript · Vitest', '17,507', 'Yes — MIT', 'No', GREEN],
  ];
  rows.forEach((r, ri) => {
    const y = 3.78 + ri * 0.196;
    const ai = ri === 8;
    [0, 1, 2, 3, 4].forEach(i => {
      s.addText(String(r[i]), {
        x: cx[i], y, w: cw[i], h: 0.196, fontFace: 'Calibri', fontSize: 7.4,
        bold: i === 0 || i === 4, italic: i === 2,
        color: i === 4 ? r[5] : (i === 0 ? (ai ? PURPLE : NAVY) : SLATE),
        fill: { color: ai ? 'F1EBF8' : (ri % 2 ? 'F0F4F9' : 'FFFFFF') },
        align: i === 2 ? 'right' : 'left', valign: 'middle', margin: 0.06,
      });
    });
  });
  s.addText('Line counts measured from the repository. Licences as published by each project — worth a formal review before anything is distributed outside the company.',
    { x: 0.5, y: 5.76, w: 12.33, h: 0.18, fontFace: 'Calibri', fontSize: 6.9, italic: true, color: MUTED, margin: 0 });

  // ── the network answer ────────────────────────────────────────────────────
  s.addShape('roundRect', { x: 0.5, y: 6.00, w: 12.33, h: 0.94, fill: { color: CARD }, line: { color: NAVY, width: 1.5 }, rectRadius: 0.08 });
  s.addText('DOES IT CALL ANYTHING? — API, KPI AND TELEMETRY, IN FULL', { x: 0.68, y: 6.04, w: 6, h: 0.18, fontFace: 'Calibri', fontSize: 7.8, bold: true, color: NAVY, charSpacing: 0.5, margin: 0 });
  const net = [
    ['API calls', 'One — and optional', 'The AI classifier → api.anthropic.com, or your own endpoint. AIR_GAPPED=1 switches it off. The costing path never calls out.', PURPLE],
    ['KPI calls', 'None. Not one.', 'No KPIs measured, no usage tracked, no per-seat licence check phoning home. No analytics call of any kind.', GREEN],
    ['Error telemetry', 'Yes — stays in-house', 'Uncaught errors go to /api/telemetry/error on YOUR server, into YOUR log. No Sentry, no Analytics, no third party.', AMBER],
    ['Optional feeds', 'Off by default', 'PCB component prices, metal ticker, industry news. Display-only — none of them can price a part.', MUTED],
  ];
  net.forEach(([k, v, d, col], i) => {
    const y = 6.24 + (i % 2) * 0.32, x = 0.68 + Math.floor(i / 2) * 6.15;
    s.addShape('ellipse', { x, y: y + 0.05, w: 0.08, h: 0.08, fill: { color: col } });
    s.addText(k, { x: x + 0.15, y, w: 1.0, h: 0.16, fontFace: 'Calibri', fontSize: 7.2, bold: true, color: col, margin: 0, valign: 'middle' });
    s.addText(v, { x: x + 1.17, y, w: 1.5, h: 0.16, fontFace: 'Calibri', fontSize: 7.2, bold: true, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(d, { x: x + 0.15, y: y + 0.15, w: 5.7, h: 0.15, fontFace: 'Calibri', fontSize: 6.5, color: SLATE, margin: 0, valign: 'middle' });
  });

  footer(s, ++PG);
  s.addNotes(
    'This is slide three with the lid off, and it answers two questions at once: what each box is built from, and what it hands to the next box. Follow it left to right. ' +
    'Upload a CAD file, a PCB photo or a typed form. The Python kernel measures the solid and hands on a parcel we call OCCTGeometry — sizes, wall thickness, holes, draft angles. All measured; none of it guessed. The rules layer turns those measurements into cost inputs and the engineer answers the two or three things a shape cannot tell you, such as what it is made of and how many a year; that parcel is the UniversalStackInput — a material, a list of operations, and a tooling block. ' +
    'The cost engine sits in the middle because everything either feeds it or renders what it produced. It works out the eight buckets, it has a module per commodity, its optimisers pick the cheapest capable machine, and its guardrails check every number. What it hands on is the PartCostResult: the eight buckets, plus where every single number came from. ' +
    'The line at the bottom of that box is the design decision that matters most — numbers in, numbers out, no database, no network, no file access. That is exactly why fifteen hundred tests can cover it and why the identical code runs in the browser and on the server. ' +
    'Then out to the right: the guardrails and self-audit check the answer and attach a confidence band, the findings become savings ranked by money — which is the change we made after the last review — and finally it is saved to SQLite on our own server, with the reports built in the browser. ' +
    'The grey strip underneath opens those four parcels up, because somebody always asks what is actually in them. The geometry parcel carries bounding box, volume, wall thickness including a ninety-fifth percentile because the thickest section governs cooling, draft, setup count and a hole table. The input parcel carries one row per operation with cycle time, OEE, manning and efficiency. The result parcel carries the eight buckets and a traceability row for every figure — value, unit, which rate it used and how confident that rate is; that is what prints under every number in the report. And the opportunities parcel carries each idea with its saving in pounds per part, its risk, its timeframe and its owner. ' +
    'The table answers the language, size and licence questions row by row. Only one component is Python — the geometry kernel, driving Open CASCADE, the same kernel FreeCAD is built on. Everything else is TypeScript. Is it free? Yes, with exactly one exception: every library is MIT, Apache-2.0 or LGPL, there is no licence fee and no per-seat cost, and the single paid item anywhere in the stack is the optional Anthropic API call, metered per token only when somebody chooses to use it. I would still get that list formally reviewed before we distribute anything outside the company. ' +
    'And the box along the bottom is the question I was asked, answered completely rather than reassuringly. API calls: one, and it is optional, through a single point in the code so it can be pointed at a private endpoint or switched off with an environment variable. KPI calls: none — no KPIs measured, no usage tracked, nothing phoning home. Error telemetry: yes, and I want to be precise because an earlier draft of this slide said "no telemetry" and that was too absolute. When the app hits an uncaught error it posts it to our own Express server and it lands in our own log. No Sentry, no Google Analytics, no third party, nothing leaving the network. And the optional feeds are off by default and display-only; none of them can price a part.'
  );
}

await pres.writeFile({ fileName: 'CostVision-Workflow-Explained.pptx' });
console.log('WRITTEN');
