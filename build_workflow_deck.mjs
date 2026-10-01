/**
 * "How CostVision Actually Works" — the 58-slide workflow explainer (app V4.2).
 *
 * Every claim must agree with docs/decks/tool-facts.md or be checked in code.
 * At JLR the AI is switched off (AIR_GAPPED=1); slides say so wherever AI appears.
 *
 * Slides 5–8 are the PCBA market landscape (who else automates PCBA costing,
 * at what automation level, software vs service, and what they charge). Every
 * claim there is sourced; the URL list lives in slide 6's speaker notes. No
 * price is stated unless the vendor publishes it.
 *
 * Slides 48–56 are the DFM/DFA & idea-generation rule-library appendix,
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
import { readFileSync as __brandRead } from 'node:fs';
// Brand colours — calculator/src/brand/brand.json, shared with the app (I5).
const B = JSON.parse(__brandRead(new URL('./calculator/src/brand/brand.json', import.meta.url), 'utf8')).onLight;

// Palette continuous with the CostVision workbook the audience has already seen
const NAVY = B.navy, SLATE = B.slate, MUTED = B.muted, PAGE = B.page, CARD = 'FFFFFF';
const BLUE = B.blue, BLUE_T = B.blueTint;       // measure
const PURPLE = B.violet, PURPLE_T = B.violetTint;   // AI
const AMBER = B.amber, AMBER_T = B.amberTint;     // guardrails
const TEAL = B.teal, TEAL_T = B.tealTint;       // costing engine
const GREEN = B.green, GREEN_T = B.greenTint;     // output / human
const RED = B.red, LINE = B.line;

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
  s.addText(t, { x: 0.5, y: 0.24, w: 12.3, h: 0.5, fontFace: 'Cambria', fontSize: 25.0, bold: true, color: NAVY, margin: 0, valign: 'middle' });
  if (sub) s.addText(sub, { x: 0.5, y: 0.78, w: 12.3, h: 0.3, fontFace: 'Calibri', fontSize: 12.0, italic: true, color: MUTED, margin: 0 });
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
  s.addText('CostVision', { x: 1.78, y: 1.42, w: 6, h: 0.4, fontFace: 'Calibri', fontSize: 19.0, bold: true, color: 'FFFFFF', margin: 0, valign: 'middle' });
  s.addText('Should-Cost Intelligence', { x: 1.78, y: 1.78, w: 6, h: 0.3, fontFace: 'Calibri', fontSize: 11.5, color: '8FA3CC', margin: 0, valign: 'middle' });
  s.addText('How CostVision Actually Works', { x: 0.8, y: 2.25, w: 11.7, h: 0.8, fontFace: 'Cambria', fontSize: 42.0, bold: true, color: 'FFFFFF', margin: 0 });
  s.addText('Who does what — followed end to end on one real part', { x: 0.8, y: 3.15, w: 11.7, h: 0.45, fontFace: 'Calibri', fontSize: 20.0, color: 'CADCFC', margin: 0 });
  s.addShape('roundRect', { x: 0.8, y: 3.95, w: 11.7, h: 0.75, fill: { color: '24406E' }, rectRadius: 0.1 });
  s.addText([
    { text: 'The one line to remember:  ', options: { color: '9FB6DF', bold: true } },
    { text: 'the tool measures the part, the engineer answers what geometry cannot, the engine does the arithmetic, and a person signs it off. AI is switched off at JLR.', options: { color: 'FFFFFF', bold: true } },
  ], { x: 1.1, y: 3.95, w: 11.1, h: 0.75, fontFace: 'Calibri', fontSize: 15.0, margin: 0, valign: 'middle' });
  s.addText('Worked example: die-cast aluminium housing · 2.8 kg · 60,000 per year · made in China',
    { x: 0.8, y: 5.1, w: 11.7, h: 0.3, fontFace: 'Calibri', fontSize: 13.0, color: '8FA3CC', margin: 0 });
  s.addNotes(
    'Thank you for coming back. Last time I showed you what CostVision produces. The fair feedback was that the workflow was still a black box. People could not see who does what, or where the AI sits. So today I want to open the box. ' +
    'I will take one worked example, a die-cast aluminium housing, and walk it through the tool step by step: from the CAD file to a number a buyer can take into a supplier meeting. Then I will do the same on a very different part, a moulded bumper, to show the method holds. ' +
    'I will colour-code who owns each step, because that was the confusing bit. Blue is measuring. Purple is the optional AI. Amber is the safety checks. Teal is the cost engine doing the arithmetic. Green is the engineer. ' +
    'One thing to say up front. In the build we ship to JLR, the AI is switched off. JLR has no AI approval yet. The AI code is still in the product, turned off by a setting, so it could be switched on later without a rebuild. Even when it is on, it never sets a price. ' +
    'So the line on the screen is the one to remember. The tool measures, the engineer answers what geometry cannot decide, the engine does the sums, and a person signs it off. Everything else today is detail behind that sentence.'
  );
}

/** Section divider — dark, three seconds on screen, tells the room where it is. */
function divider(kicker, name, sub, col, items, mins, notes) {
  const s = pres.addSlide(); s.background = { color: NAVY };
  s.addShape('rect', { x: 0, y: 0, w: W, h: 0.09, fill: { color: col } });
  logoMark(s, 0.8, 0.6, 0.55);
  s.addText(kicker, { x: 0.8, y: 2.0, w: 8, h: 0.32, fontFace: 'Calibri', fontSize: 13.0, bold: true, color: col, charSpacing: 1.6, margin: 0 });
  s.addText(name, { x: 0.8, y: 2.42, w: 9.6, h: 0.75, fontFace: 'Cambria', fontSize: 34.0, bold: true, color: 'FFFFFF', margin: 0, valign: 'middle' });
  s.addText(sub, { x: 0.8, y: 3.26, w: 9.6, h: 0.34, fontFace: 'Calibri', fontSize: 15.0, color: '8FA3CC', margin: 0 });
  items.forEach((t, i) => {
    const y = 3.98 + i * 0.36;
    s.addShape('ellipse', { x: 0.86, y: y + 0.1, w: 0.11, h: 0.11, fill: { color: col } });
    s.addText(t, { x: 1.18, y, w: 8.6, h: 0.32, fontFace: 'Calibri', fontSize: 12.0, color: 'CADCFC', margin: 0, valign: 'middle' });
  });
  if (mins) {
    s.addShape('roundRect', { x: 10.6, y: 2.42, w: 2.23, h: 1.0, fill: { color: '24406E' }, rectRadius: 0.1 });
    s.addText(mins, { x: 10.6, y: 2.52, w: 2.23, h: 0.5, fontFace: 'Cambria', fontSize: 26.0, bold: true, color: 'FFFFFF', align: 'center', margin: 0, valign: 'middle' });
    s.addText('minutes', { x: 10.6, y: 3.0, w: 2.23, h: 0.3, fontFace: 'Calibri', fontSize: 11.0, color: '8FA3CC', align: 'center', margin: 0 });
  }
  footer(s, ++PG);
  s.addNotes(notes);
}

// ══════════ 1c · AGENDA ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  logoMark(s, 0.5, 0.22, 0.6);
  s.addText('What We Are Going to Cover', { x: 1.25, y: 0.2, w: 8.6, h: 0.44, fontFace: 'Cambria', fontSize: 24.0, bold: true, color: NAVY, margin: 0, valign: 'middle' });
  s.addText('Four sections, about an hour — or five slides if that is all the time there is', { x: 1.25, y: 0.66, w: 9, h: 0.28, fontFace: 'Calibri', fontSize: 12.0, italic: true, color: MUTED, margin: 0 });

  const secs = [
    ['1', 'Orientation & the business case', 'Slides 3–13', 'How it connects, the PCB flow (an AI feature, off at JLR), who else does this, and the business case ending in one decision', '24 min', BLUE, true],
    ['2', 'Worked example one — die-cast aluminium housing', 'Slides 14–32', 'Twelve stages end to end: measure, ask, check, calculate, approve — with the calculation and the confidence band shown in full.', '22 min', TEAL, false],
    ['3', 'Worked example two — injection-moulded bumper fascia', 'Slides 33–45', 'The same method on a very different part, plus paint, two findings — and the new gear model', '18 min', PURPLE, false],
    ['4', 'The honest limits', 'Slide 46', 'Six things this tool cannot do, from us rather than from a sceptic in the room', '5 min', RED, true],
  ];
  secs.forEach(([n, name, range, desc, mins, col, exec], i) => {
    const y = 1.22 + i * 1.16;
    s.addShape('roundRect', { x: 0.5, y, w: 12.33, h: 1.04, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
    s.addShape('ellipse', { x: 0.78, y: y + 0.28, w: 0.48, h: 0.48, fill: { color: col } });
    s.addText(String(n), { x: 0.78, y: y + 0.28, w: 0.48, h: 0.48, fontFace: 'Cambria', fontSize: 19.0, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    s.addText(String(name), { x: 1.42, y: y + 0.14, w: 7.4, h: 0.32, fontFace: 'Calibri', fontSize: 13.0, bold: true, color: col, margin: 0, valign: 'middle' });
    s.addText(String(desc), { x: 1.42, y: y + 0.48, w: 8.6, h: 0.46, fontFace: 'Calibri', fontSize: 10.2, color: SLATE, margin: 0, valign: 'top' });
    s.addText(String(range), { x: 10.2, y: y + 0.16, w: 1.5, h: 0.28, fontFace: 'Calibri', fontSize: 9.6, color: MUTED, align: 'right', margin: 0, valign: 'middle' });
    s.addText(String(mins), { x: 11.85, y: y + 0.16, w: 0.85, h: 0.28, fontFace: 'Calibri', fontSize: 11.0, bold: true, color: NAVY, align: 'right', margin: 0, valign: 'middle' });
    if (exec) {
      s.addShape('roundRect', { x: 10.2, y: y + 0.52, w: 2.5, h: 0.3, fill: { color: GREEN_T }, line: { color: GREEN, width: 1 }, rectRadius: 0.15 });
      s.addText('On the 10-minute path', { x: 10.2, y: y + 0.52, w: 2.5, h: 0.3, fontFace: 'Calibri', fontSize: 8.4, bold: true, color: GREEN, align: 'center', valign: 'middle', margin: 0 });
    }
  });

  s.addShape('roundRect', { x: 0.5, y: 5.92, w: 12.33, h: 0.9, fill: { color: NAVY }, rectRadius: 0.1 });
  s.addText([
    { text: 'Appendix (slides 47–58): ', options: { bold: true, color: '9FB6E0' } },
    { text: 'the complete DFM/DFA rule library and the technical architecture — reference material, not part of the hour.\n', options: { color: 'CADCFC' } },
    { text: 'If you only have ten minutes:  ', options: { bold: true, color: '9FB6E0' } },
    { text: 'slide 3 (how it connects) · slides 9–13 (the business case) · slide 32 (the housing on one page) · slide 42 (the two findings) · slide 46 (the limits).', options: { color: 'FFFFFF' } },
  ], { x: 0.85, y: 6.02, w: 11.65, h: 0.72, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'A quick map, because there is more here than an hour needs, and I would rather you chose than sat through all of it. ' +
    'Section one sets the scene. How the pieces connect, the PCB photo flow, who else sells this kind of tool, and the business case. That section ends with one decision I am asking for. The PCB photo flow uses AI, so it is switched off in the JLR build. I show it so you know what exists, not because you can use it today. ' +
    'Section two is the heart of the pack. One worked example, a die-cast aluminium housing, taken through all twelve stages. I show the calculation in full so you can check it with a calculator. ' +
    'Section three runs the same method on a bumper fascia. It is a very different part, and the money turns out to sit somewhere else. I finish that section with the new gear model. ' +
    'Section four is five minutes on what the tool cannot do. I would rather you heard that from me. ' +
    'The appendix is reference only: the full DFM and DFA rule book and the technical architecture. ' +
    'If we only get ten minutes, take the network picture on slide three, the business case, the one-page summary on slide thirty-two, the two findings on slide forty-two and the limits on slide forty-six. Everything else is the evidence behind those.'
  );
}

// ══════════ 1b · THE NETWORK MAP (bird's-eye — deterministic-by-default) ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  logoMark(s, 0.5, 0.22, 0.6);
  s.addText('How It All Connects — One Picture', { x: 1.25, y: 0.2, w: 8.6, h: 0.44, fontFace: 'Cambria', fontSize: 24.0, bold: true, color: NAVY, margin: 0, valign: 'middle' });
  s.addText('Everything badged AUTO runs unattended — the rules pick the machine and tonnage, the engine writes the DFM/DFA and saving ideas; the engineer is the only manual step.', { x: 1.25, y: 0.66, w: 8.9, h: 0.28, fontFace: 'Calibri', fontSize: 11.5, italic: true, color: MUTED, margin: 0 });
  // ── legend (top right) ──
  const legend = [['Measure', BLUE], ['Rules', '4F46E5'], ['AI (optional)', PURPLE], ['Guardrail', AMBER], ['Engine', TEAL], ['Human / output', GREEN]];
  legend.forEach(([t, c], i) => {
    const x = 10.35 + (i % 2) * 1.35, y = 0.16 + Math.floor(i / 2) * 0.24;
    s.addShape('ellipse', { x, y: y + 0.05, w: 0.11, h: 0.11, fill: { color: c } });
    s.addText(t, { x: x + 0.16, y, w: 1.25, h: 0.22, fontFace: 'Calibri', fontSize: 7.8, color: SLATE, margin: 0, valign: 'middle' });
  });
  // ── why believe the picture: four measured facts ──
  s.addShape('roundRect', { x: 0.45, y: 1.18, w: 2.0, h: 0.83, fill: { color: B.greenTint }, line: { color: GREEN, width: 1 }, rectRadius: 0.08 });
  s.addText('WHY TRUST THIS PICTURE', { x: 0.56, y: 1.23, w: 1.85, h: 0.15, fontFace: 'Calibri', fontSize: 7.5, bold: true, color: GREEN, charSpacing: 0.4, margin: 0 });
  s.addText('Same file + answers = same price\n13 of 19 processes from CAD\n2,438 automated tests\n6 real parts pinned in a baseline',
    { x: 0.56, y: 1.39, w: 1.85, h: 0.6, fontFace: 'Calibri', fontSize: 7.5, color: SLATE, margin: 0, valign: 'top' });
  // ── OUTSIDE the tool: the OPTIONAL AI ──
  s.addShape('roundRect', { x: 2.55, y: 1.02, w: 5.2, h: 1.12, fill: { color: PURPLE_T }, line: { color: PURPLE, width: 1.5, dashType: 'dash' }, rectRadius: 0.09 });
  s.addShape('ellipse', { x: 2.70, y: 1.28, w: 0.44, h: 0.44, fill: { color: PURPLE } });
  s.addImage({ data: I.eye, x: 2.81, y: 1.39, w: 0.22, h: 0.22 });
  s.addText('OPTIONAL AI — SWITCHED OFF AT JLR (AIR_GAPPED=1)', { x: 3.28, y: 1.08, w: 4.35, h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: PURPLE, charSpacing: 0.4, margin: 0 });
  s.addText([
    { text: 'When on: ', options: { color: SLATE } },
    { text: 'Rules only (default) · Compare · AI-led. ', options: { bold: true, color: NAVY } },
    { text: 'Words back, never money. Rate-limited per user. ', options: { color: SLATE } },
    { text: 'The PCB PHOTO flow needs it ', options: { bold: true, color: PURPLE } },
    { text: '— so at JLR that screen is hidden.', options: { color: SLATE } },
  ], { x: 3.28, y: 1.27, w: 4.35, h: 0.46, fontFace: 'Calibri', fontSize: 7.8, margin: 0, valign: 'top' });
  s.addText('The code is kept and can be switched on by a setting, no rebuild. With it off, CAD and manual costing work in full.', { x: 3.28, y: 1.77, w: 4.35, h: 0.32, fontFace: 'Calibri', fontSize: 7.5, italic: true, color: PURPLE, margin: 0, valign: 'top' });
  s.addShape('roundRect', { x: 8.0, y: 1.02, w: 4.83, h: 0.99, fill: { color: CARD }, line: { color: LINE, width: 1, dashType: 'dash' }, rectRadius: 0.09 });
  s.addText('OPTIONAL FEEDS — none of them price a part', { x: 8.2, y: 1.12, w: 4.5, h: 0.22, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: MUTED, charSpacing: 0.4, margin: 0 });
  s.addText('Live component pricing (PCB, off) · news (needs internet) · price ticker (indicative, simulated, display only)',
    { x: 8.2, y: 1.38, w: 4.5, h: 0.5, fontFace: 'Calibri', fontSize: 9.0, color: SLATE, margin: 0, valign: 'top' });
  // ── the boundary ──
  s.addShape('roundRect', { x: 0.45, y: 2.18, w: 12.4, h: 4.4, fill: { color: 'FFFFFF' }, line: { color: TEAL, width: 1.75, dashType: 'dash' }, rectRadius: 0.12 });
  s.addShape('roundRect', { x: 0.75, y: 2.05, w: 3.5, h: 0.28, fill: { color: TEAL }, rectRadius: 0.14 });
  s.addText('INSIDE — RUNS ON YOUR OWN MACHINE', { x: 0.75, y: 2.05, w: 3.5, h: 0.28, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, charSpacing: 0.5 });
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
    s.addText(ttl, { x: x + (ico ? 0.56 : 0.16), y: y + 0.11, w: w - (ico ? 0.70 : 0.32), h: 0.30, fontFace: 'Calibri', fontSize: 10.0, bold: true, color: col, margin: 0, valign: 'middle' });
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
  col(0.65, 2.0, 'WHAT GOES IN', BLUE, ['3D CAD model\n(STEP / IGES / STL)', 'Photo of a PCB', 'Typed inputs on the\ncommodity form', 'Volume + region\n(the engineer types)'], 2.74);
  // The PCB photo is the one input that MUST leave the network to be read.
  // Everything else can be costed with the cable unplugged, so say so here
  // rather than leaving it to a footnote on the AI box.
  s.addShape('roundRect', { x: 0.65, y: 3.54, w: 2.0, h: 0.68, fill: { color: 'FFFFFF' }, line: { color: PURPLE, width: 1.5 }, rectRadius: 0.07 });
  s.addText('Photo of a PCB', { x: 0.78, y: 3.56, w: 1.74, h: 0.26, fontFace: 'Calibri', fontSize: 8.6, color: SLATE, margin: 0, valign: 'middle' });
  s.addShape('roundRect', { x: 0.78, y: 3.86, w: 1.15, h: 0.19, fill: { color: PURPLE }, rectRadius: 0.095 });
  s.addText('AI · OFF AT JLR', { x: 0.78, y: 3.86, w: 1.15, h: 0.19, fontFace: 'Calibri', fontSize: 7.5, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, charSpacing: 0.4 });
  s.addShape('line', { x: 0.55, y: 1.98, w: 0, h: 1.90, line: { color: PURPLE, width: 1.4, dashType: 'dash', beginArrowType: 'triangle', endArrowType: 'triangle' } });
  s.addShape('line', { x: 0.55, y: 1.98, w: 2.0, h: 0, line: { color: PURPLE, width: 1.4, dashType: 'dash', endArrowType: 'triangle' } });
  col(11.05, 1.8, 'WHAT COMES OUT', GREEN, ['8-bucket cost — every\nfigure shows its basis', 'Operation list —\nwhat takes the time', 'Confidence band +\n20-country comparison', 'DFM/DFA + savings\nranked in £/part\n(engine, not AI)', 'PDF · Excel · PowerPoint\nnegotiation pack'], 2.74, 0.76);
  // inside nodes — the deterministic spine
  node(2.85, 2.68, 2.1, 1.22, BLUE, BLUE_T, 'Geometry kernel', 'OCCT measures the part: volume, walls, holes, faces, topology. Never guessed.', I.ruler);
  node(2.85, 4.06, 2.1, 1.22, '4F46E5', 'EEF2FF', 'Rules + optimisers', 'Derive every input AND pick the machine: press/die tonnage by physics; routing & cavitation cost-ranked.', I.cog);
  node(2.85, 5.44, 2.1, 1.02, GREEN, GREEN_T, 'The engineer', 'Answers only what geometry cannot know: material, duty, volume, region. Hard stop — no silent guess.', I.person);
  node(5.35, 2.68, 2.15, 1.22, AMBER, AMBER_T, 'Guardrails', 'Sanity checks + physics caps; a self-audit challenges every estimate (machine sizing flagged in £/part). Measurements always win.', I.shield);
  node(8.5, 2.68, 2.1, 1.22, TEAL, TEAL_T, 'Rate library', 'Materials, machines, labour, 20 regions. The only source of money in the tool.', I.coins);
  node(8.5, 4.06, 2.1, 1.22, TEAL, TEAL_T, 'Local database', 'Parts, quotes, real actuals — the learning loop that calibrates the estimates.', I.clip);
  node(8.5, 5.44, 2.1, 1.02, GREEN, GREEN_T, 'Uncertainty', 'Monte-Carlo band (P10–P90), corrected by real actuals once 3 are logged.', null);
  // the hub
  s.addShape('roundRect', { x: 5.35, y: 4.06, w: 2.15, h: 1.58, fill: { color: '0E5A5A' }, rectRadius: 0.1 });
  s.addShape('ellipse', { x: 6.16, y: 4.20, w: 0.5, h: 0.5, fill: { color: '17A398' } });
  s.addImage({ data: I.calc, x: 6.29, y: 4.33, w: 0.24, h: 0.24 });
  s.addText('COST ENGINE', { x: 5.45, y: 4.76, w: 1.95, h: 0.3, fontFace: 'Calibri', fontSize: 12.0, bold: true, color: 'FFFFFF', align: 'center', margin: 0, valign: 'middle' });
  s.addText('Fixed arithmetic. 8 buckets.\nNo AI, no judgement.', { x: 5.45, y: 5.08, w: 1.95, h: 0.44, fontFace: 'Calibri', fontSize: 8.2, color: '9FD9CF', align: 'center', margin: 0, valign: 'top' });
  // who runs unattended, and where the person is — the automation map
  const chip = (x, y, label, bg) => {
    s.addShape('roundRect', { x, y, w: 0.6, h: 0.17, fill: { color: bg }, rectRadius: 0.085 });
    s.addText(label, { x, y, w: 0.6, h: 0.17, fontFace: 'Calibri', fontSize: 7.5, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, charSpacing: 0.5 });
  };
  chip(4.27, 2.59, 'AUTO', BLUE);       // kernel
  chip(4.27, 3.97, 'AUTO', '4F46E5');   // rules + optimisers
  chip(6.82, 2.59, 'AUTO', AMBER);      // guardrails
  chip(9.92, 2.59, 'AUTO', TEAL);       // rate library
  chip(9.92, 3.97, 'AUTO', TEAL);       // local db
  chip(9.92, 5.35, 'AUTO', GREEN);      // uncertainty
  chip(6.82, 3.97, 'AUTO', B.teal);   // cost engine
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
  s.addText('actuals\nfeed back', { x: 10.56, y: 4.50, w: 0.55, h: 0.38, fontFace: 'Calibri', fontSize: 7.5, italic: true, color: GREEN, align: 'center', margin: 0, valign: 'top' });
  link(10.60, 3.29, 11.05, 3.29, GREEN);
  // read-in-one-line
  s.addShape('roundRect', { x: 0.45, y: 6.70, w: 12.4, h: 0.42, fill: { color: B.greenTint }, line: { color: GREEN, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Read it in one line:  ', options: { bold: true, color: GREEN } },
    { text: 'everything badged AUTO is unattended — measure, derive, pick the machine, check, calculate, write the DFM/DFA and saving ideas. The engineer answers and approves. The AI is off at JLR, and even when on it can reach none of the money.', options: { color: SLATE } },
  ], { x: 0.65, y: 6.70, w: 12.0, h: 0.42, fontFace: 'Calibri', fontSize: 10.5, margin: 0, valign: 'middle' });
  footer(s, ++PG);
  s.addNotes(
    'Before the twelve stages, here is the whole thing on one picture. ' +
    'Start in the middle left. The blue box is the geometry kernel. It measures the CAD file: volume, weight, walls, holes and features. Nothing is guessed. Under it, the indigo box is the rules. They turn those measurements into cost inputs: cycle times, tooling, press size, yield. Thirteen commodities can be costed from CAD this way. ' +
    'Where geometry cannot decide something, such as the material family or the process route, the tool does not guess. It asks the engineer, the green box, and it will not cost the part until someone answers. ' +
    'The purple box at the top is the AI. In the JLR build it is switched off. The code is still there, and a setting could turn it on later without a rebuild. When it is on, it hands back words, never money, and every AI route is rate-limited per user. The PCB photo flow needs it, so at JLR that screen is hidden. ' +
    'On the right, the rate library is the only source of money. The engine does fixed eight-bucket arithmetic, and the uncertainty layer turns the number into a range. The dashed arrow is learning from actuals: after three real prices for a commodity, the band is corrected. ' +
    'The green card top left is why you can trust the picture. Same file and same answers give the same price. There are 2,438 automated tests, and six real parts are pinned in a regression baseline. What I cannot claim yet is accuracy against a price JLR actually paid.'
  );
}

// ══════════ 1b2 · THE PCB WORKFLOW — ONE PICTURE ══════════
// Updated 1 Oct 2026: files beat photos; the model is not asked for a cost;
// every price carries a source; automotive grade in the headline.
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  logoMark(s, 0.5, 0.22, 0.6);
  s.addText('The PCB Photo → Should-Cost — One Picture', { x: 1.25, y: 0.2, w: 9.6, h: 0.44, fontFace: 'Cambria', fontSize: 24.0, bold: true, color: NAVY, margin: 0, valign: 'middle' });
  s.addText('Photos and files go in. The model reads the board. The tool prices every line from its own tables and costs the board from its rate tables. The engineer checks the lines marked "to verify".', { x: 1.25, y: 0.66, w: 11.4, h: 0.28, fontFace: 'Calibri', fontSize: 10.5, italic: true, color: MUTED, margin: 0 });

  // ── OUTSIDE: the model reads — three steps, words and counts only ──
  s.addShape('roundRect', { x: 2.55, y: 1.02, w: 7.6, h: 0.99, fill: { color: PURPLE_T }, line: { color: PURPLE, width: 1.5 }, rectRadius: 0.09 });
  s.addShape('ellipse', { x: 2.70, y: 1.28, w: 0.44, h: 0.44, fill: { color: PURPLE } });
  s.addImage({ data: I.eye, x: 2.81, y: 1.39, w: 0.22, h: 0.22 });
  s.addText('THE MODEL READS THE PHOTOS — needs an API key; without one this screen is hidden', { x: 3.28, y: 1.08, w: 6.8, h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: PURPLE, charSpacing: 0.4, margin: 0 });
  s.addText([
    { text: '1 ', options: { bold: true, color: NAVY } }, { text: 'Classifies the board (automotive, consumer, industrial) and its safety level. ', options: { color: SLATE } },
    { text: '2 ', options: { bold: true, color: NAVY } }, { text: 'Reads the markings printed on the chips. ', options: { color: SLATE } },
    { text: '3 ', options: { bold: true, color: NAVY } }, { text: 'Writes the parts list — reference, package, quantity, part number — and its guess at size, layers and finish. ', options: { color: SLATE } },
    { text: 'It is not asked for a cost. The reply must match a fixed form.', options: { bold: true, color: PURPLE } },
  ], { x: 3.28, y: 1.29, w: 6.75, h: 0.5, fontFace: 'Calibri', fontSize: 8.2, margin: 0, valign: 'top' });
  s.addText('Sonnet 5.5 reads the chips and writes the list · Opus 5.5 for "deep analysis" · rate-limited per user', { x: 3.28, y: 1.79, w: 6.75, h: 0.2, fontFace: 'Calibri', fontSize: 7.6, italic: true, color: PURPLE, margin: 0 });

  // ── boundary ──
  s.addShape('roundRect', { x: 0.45, y: 2.18, w: 12.4, h: 4.4, fill: { color: 'FFFFFF' }, line: { color: TEAL, width: 1.75, dashType: 'dash' }, rectRadius: 0.12 });
  s.addShape('roundRect', { x: 0.75, y: 2.05, w: 3.5, h: 0.28, fill: { color: TEAL }, rectRadius: 0.14 });
  s.addText('INSIDE — RUNS ON YOUR OWN MACHINE', { x: 0.75, y: 2.05, w: 3.5, h: 0.28, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, charSpacing: 0.5 });
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
    s.addText(body, { x: x + 0.16, y: y + 0.45, w: w - 0.32, h: h - 0.58, fontFace: 'Calibri', fontSize: 7.8, color: SLATE, margin: 0, valign: 'top' });
  };
  const chip2 = (x, y, label, bg) => {
    s.addShape('roundRect', { x, y, w: 0.6, h: 0.17, fill: { color: bg }, rectRadius: 0.085 });
    s.addText(label, { x, y, w: 0.6, h: 0.17, fontFace: 'Calibri', fontSize: 7.5, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, charSpacing: 0.5 });
  };

  // inputs / outputs
  const col2 = (x, w, label, c, items, y0, pitch = 0.80, h = 0.68) => {
    s.addText(label, { x, y: y0 - 0.3, w, h: 0.24, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: c, charSpacing: 0.6, margin: 0 });
    items.forEach((t, i) => {
      const y = y0 + i * pitch;
      s.addShape('roundRect', { x, y, w, h, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.07 });
      s.addText(t, { x: x + 0.12, y, w: w - 0.24, h, fontFace: 'Calibri', fontSize: 8.0, color: SLATE, margin: 0, valign: 'middle' });
    });
  };
  col2(0.65, 2.0, 'WHAT GOES IN', BLUE, [
    'Photos of the board\n(top, bottom, close-ups)',
    'Annual quantity + country\n(the engineer types)',
    'BOM file — optional\nbecomes the parts list',
    'Drill + Gerber files — optional\nsize, layers, vias measured',
  ], 2.74, 0.92, 0.80);
  col2(11.05, 1.8, 'WHAT COMES OUT', GREEN, [
    'Priced parts list —\na source on every line',
    'Board cost by country,\nautomotive grade included',
    '"Priced" and "to verify"\ntotals',
    'PDF, master report, library —\nall the same number',
  ], 2.74, 0.92, 0.80);

  // pipeline nodes
  node2(2.85, 2.68, 2.35, 1.22, '4F46E5', 'EEF2FF', 'Files beat photos', 'A BOM file replaces the read list. Drill and Gerber files replace the guessed size, layer and via counts. Chip markings read are matched to the list.', I.upload);
  node2(2.85, 4.06, 2.35, 1.22, '4F46E5', 'EEF2FF', 'Board spec held steady', 'Guessed size, layers and vias held to plausible values; measured values kept exactly. Parts are counted from the list. Same photos, same board.', I.ruler);
  node2(5.45, 2.68, 2.3, 1.35, AMBER, AMBER_T, 'Price every line', 'Catalogue (458 parts, source and date on each) → range for a named part → class table. The model’s figure only picks a point inside the range. Each line shows its basis.', I.shield);
  node2(5.45, 5.30, 2.3, 1.16, GREEN, GREEN_T, 'The engineer', 'Checks the lines marked "to verify" (£1+ with no quote behind them). Can edit any line; an edit or a real quote wins.', I.person);
  s.addShape('roundRect', { x: 8.2, y: 2.68, w: 2.5, h: 1.86, fill: { color: '0E5A5A' }, rectRadius: 0.1 });
  s.addShape('ellipse', { x: 9.2, y: 2.84, w: 0.5, h: 0.5, fill: { color: '17A398' } });
  s.addImage({ data: I.calc, x: 9.33, y: 2.97, w: 0.24, h: 0.24 });
  s.addText('COST ENGINE', { x: 8.3, y: 3.42, w: 2.3, h: 0.3, fontFace: 'Calibri', fontSize: 11.5, bold: true, color: 'FFFFFF', align: 'center', margin: 0, valign: 'middle' });
  s.addText('Bare board: area, layers, finish, vias, impedance, copper.\nAssembly: placements, AOI, X-ray, ICT.\nAutomotive grade (IATF, class 3, burn-in) in the headline.', { x: 8.3, y: 3.74, w: 2.3, h: 0.78, fontFace: 'Calibri', fontSize: 7.4, color: '9FD9CF', align: 'center', margin: 0, valign: 'top' });
  node2(8.2, 4.76, 2.5, 0.92, TEAL, TEAL_T, 'Country rate tables', '14 countries; FX and wages re-based 29 Sep 2026; checked against 2026 published fab and assembly figures.', null);

  s.addShape('roundRect', { x: 2.85, y: 5.42, w: 2.35, h: 1.04, fill: { color: AMBER_T }, line: { color: AMBER, width: 1.25 }, rectRadius: 0.09 });
  s.addText('WITHOUT AN API KEY', { x: 3.00, y: 5.48, w: 2.05, h: 0.18, fontFace: 'Calibri', fontSize: 7.5, bold: true, color: AMBER, charSpacing: 0.4, margin: 0 });
  s.addText('This screen is hidden; the PCB fab and PCBA forms still cost a board from typed inputs.\nDistributor API pricing is built but needs its own key; the offline catalogue prices every line meanwhile.',
    { x: 3.00, y: 5.66, w: 2.05, h: 0.74, fontFace: 'Calibri', fontSize: 7.3, color: SLATE, margin: 0, valign: 'top' });
  // flows
  link2(2.65, 3.29, 2.85, 3.29, BLUE);                       // inputs → files/photos
  link2(3.95, 3.90, 3.95, 4.06, '4F46E5');                   // ↓ board spec
  link2(5.20, 3.29, 5.45, 3.29, '4F46E5');                   // → pricing
  link2(5.20, 4.67, 5.45, 3.85, '4F46E5', 1.4);              // board spec → pricing
  link2(7.75, 3.35, 8.2, 3.35, AMBER);                       // pricing → engine
  link2(8.2, 5.22, 7.75, 5.60, TEAL, 1.4);                   // rates ↔ engineer sees them
  link2(6.6, 5.30, 6.6, 4.03, GREEN, 1.4);                   // engineer ↑ pricing (edits win)
  link2(10.70, 3.55, 11.05, 3.55, GREEN);                    // engine → outputs
  link2(10.70, 5.20, 11.05, 5.95, GREEN, 1.4);
  // AUTO/HUMAN chips
  chip2(4.59, 2.59, 'AUTO', '4F46E5');
  chip2(4.59, 3.97, 'AUTO', '4F46E5');
  chip2(7.14, 2.59, 'AUTO', AMBER);
  chip2(10.09, 2.59, 'AUTO', B.teal);
  chip2(10.09, 4.67, 'AUTO', TEAL);
  chip2(7.14, 5.21, 'HUMAN', GREEN);

  s.addShape('roundRect', { x: 0.45, y: 6.70, w: 12.4, h: 0.42, fill: { color: B.greenTint }, line: { color: GREEN, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Read it in one line:  ', options: { bold: true, color: GREEN } },
    { text: 'the model reads the board and names the parts; files beat photos; the catalogue and class table price every line with a source; the rate tables cost the board; the engineer owns the lines marked to verify.', options: { color: SLATE } },
  ], { x: 0.65, y: 6.70, w: 12.0, h: 0.42, fontFace: 'Calibri', fontSize: 9.6, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'This is the PCB photo flow as it stands on 1 October. It needs an API key; without one the screen is hidden and a board is costed through the PCB fabrication and PCBA forms from typed inputs. ' +
    'The engineer uploads photos, types the annual quantity and country, and can attach two files: the BOM, and the drill and Gerber files. ' +
    'The model does three things. It classifies the board, it reads the markings printed on the chips, and it writes the parts list with its guess at the board build. It is not asked for a cost, and its reply has to match a fixed form. ' +
    'Everything after that is plain code on your own machine. If a BOM file was attached, that is the parts list; the photo reading only fills gaps. If drill and Gerber files were attached, the size, layer count and via count are measured from them. Chip markings the model read are matched to the lines they belong to. ' +
    'Then every line is priced from the tool’s own tables: first the catalogue of 458 parts, each with a source and date, 77 of them read from distributor pages; then the price range for a part the tool can name; then the class table for the rest. The model’s own figure only picks a point inside the range. Every line shows where its price came from. ' +
    'The cost engine prices the bare board from area, layers, finish, vias, impedance and copper, and the assembly from the placements it counted in the list plus inspection and test, at the country’s rates. On an automotive board the IATF, class 3 and burn-in costs are in the headline, not in a side panel. ' +
    'The engineer checks the lines marked to verify: anything worth a pound or more with no quote behind it. An edit or a real quote wins over the catalogue. The screen, the PDF, the master report and the parts library all show the same number.'
  );
}

// ══════════ 1c · WHO ELSE DOES AUTOMATED PCBA COSTING (four market slides) ══════════
//
// Asked directly: who is doing this in the market, how automated is it really,
// is it software or a service, and what does it cost. Every claim below is from
// a named public source, listed in the speaker notes of the "who does what"
// slide with its URL. Two rules held throughout:
//
//   1. No price is invented, interpolated or "estimated". Where a vendor does
//      not publish, the cell says so — the absence is itself the finding.
//   2. Nothing claims CostVision wins on an axis we have not measured.
//
// Research constraint, stated on the sources slide because it affects how much
// weight these claims carry: this session's network policy blocks direct
// fetches to vendor domains (403 at the egress proxy), so vendor pages were
// read through the search index rather than opened. Good enough to cite; not
// good enough to quote verbatim, and the slides do not pretend otherwise.

const FOOT_MAIN = FOOT;
FOOT = 'CostVision · who else automates PCBA costing · market landscape, sourced August 2026';

// ── 1c1 · The landscape — three camps and the data layer under them ──
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Who Else Automates PCBA Costing', 'Three different markets get the same name — and only one of them is what we built', NAVY);

  const camps = [
    ['A · EMS QUOTING', BLUE, BLUE_T,
     'Supplier-side. Cost-to-quote.',
     'Luminovo · CalcuQuote',
     'You already HAVE the BOM — the customer sent it. The job is a fast, competitive quote back.',
     'BOM file in  →  price out'],
    ['B · ENTERPRISE SHOULD-COST', TEAL, TEAL_T,
     'Buyer-side. What SHOULD it cost.',
     'aPriori · Siemens · FACTON · Tset · Boothroyd Dewhurst',
     'OEM cost engineering and purchasing. aPriori ships a full PCBA module — this is a mature, direct competitor.',
     'BOM + board spec in  →  should-cost out'],
    ['C · REVERSE COSTING', PURPLE, PURPLE_T,
     'Physical board in. A service, not software.',
     'Yole SystemPlus · TechInsights',
     'Engineers decap, X-ray and cross-section a real board. Closest to what we do — done by hand, at consultancy price and pace.',
     'The board itself  →  BOM + cost'],
  ];
  camps.forEach(([hd, col, tint, dir, who, body, flow], i) => {
    const x = 0.5 + i * 4.19;
    s.addShape('roundRect', { x, y: 1.28, w: 3.94, h: 3.42, fill: { color: CARD }, line: { color: col, width: 1.4 }, rectRadius: 0.09 });
    s.addShape('rect', { x, y: 1.28, w: 3.94, h: 0.34, fill: { color: col } });
    s.addText(hd, { x: x + 0.14, y: 1.28, w: 3.66, h: 0.34, fontFace: 'Calibri', fontSize: 9.2, bold: true, color: 'FFFFFF', charSpacing: 0.5, margin: 0, valign: 'middle' });
    s.addText(dir, { x: x + 0.14, y: 1.70, w: 3.66, h: 0.26, fontFace: 'Calibri', fontSize: 9.0, bold: true, italic: true, color: col, margin: 0, valign: 'middle' });
    s.addText(who, { x: x + 0.14, y: 2.00, w: 3.66, h: 0.52, fontFace: 'Calibri', fontSize: 9.4, bold: true, color: NAVY, margin: 0, valign: 'top' });
    s.addText(body, { x: x + 0.14, y: 2.58, w: 3.66, h: 1.24, fontFace: 'Calibri', fontSize: 8.6, color: SLATE, margin: 0, valign: 'top' });
    s.addShape('roundRect', { x: x + 0.14, y: 3.94, w: 3.66, h: 0.62, fill: { color: tint }, line: { color: col, width: 0.75 }, rectRadius: 0.07 });
    s.addText(flow, { x: x + 0.20, y: 3.94, w: 3.54, h: 0.62, fontFace: 'Consolas', fontSize: 8.4, bold: true, color: col, align: 'center', margin: 0, valign: 'middle' });
  });

  // The data layer everyone above rents
  s.addShape('roundRect', { x: 0.5, y: 4.86, w: 12.33, h: 0.66, fill: { color: 'EEF1F6' }, line: { color: MUTED, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Underneath all three — the component price layer they rent:  ', options: { bold: true, color: NAVY } },
    { text: 'SiliconExpert · Z2Data · Octopart / Nexar (Altium) · Supplyframe (Siemens).  Nobody in this market builds their own component price book — they subscribe to one.', options: { color: SLATE } },
  ], { x: 0.68, y: 4.86, w: 12.0, h: 0.66, fontFace: 'Calibri', fontSize: 9.4, margin: 0, valign: 'middle' });

  // And the fourth thing people confuse with should-cost
  s.addShape('roundRect', { x: 0.5, y: 5.64, w: 12.33, h: 0.6, fill: { color: B.amberTint }, line: { color: AMBER, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Not the same thing:  ', options: { bold: true, color: AMBER } },
    { text: 'JLCPCB / PCBWay / Eurocircuits instant quoting is fully automated and fully public — but it returns THEIR price, which is a quotation, not a should-cost. Useful as a floor reference; useless as a negotiation position.', options: { color: SLATE } },
  ], { x: 0.68, y: 5.64, w: 12.0, h: 0.6, fontFace: 'Calibri', fontSize: 9.4, margin: 0, valign: 'middle' });

  s.addShape('roundRect', { x: 0.5, y: 6.36, w: 12.33, h: 0.6, fill: { color: B.blueTint }, line: { color: BLUE, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Where we sit:  ', options: { bold: true, color: BLUE } },
    { text: 'camp B by purpose — a buyer-side should-cost — reached by camp C’s route, from the physical board, automatically. The photo route needs AI, so it is off at JLR.', options: { color: SLATE } },
  ], { x: 0.68, y: 6.36, w: 12.0, h: 0.6, fontFace: 'Calibri', fontSize: 9.8, margin: 0, valign: 'middle' });

  footer(s, ++PG);
  s.addNotes(
    'I was asked who else does this, so I looked properly rather than answering from memory. The first finding is that three different markets all get called automated PCBA costing. They answer different questions for different people. ' +
    'Camp A is EMS quoting: Luminovo and CalcuQuote. A contract manufacturer gets a BOM from a customer and needs a quick, competitive quote. It is the most automated part of the market. But they already have the BOM. They answer what shall I charge, not what should this cost. ' +
    'Camp B is enterprise should-cost: aPriori, Siemens, FACTON, Tset, Boothroyd Dewhurst. Buyer-side, used by cost engineering and purchasing. aPriori ships a full PCBA costing module, so treat it as a mature, direct competitor. ' +
    'Camp C is reverse costing: Yole SystemPlus and TechInsights. They take a real board apart by hand and sell a report. ' +
    'Underneath all three, everyone rents their component prices from someone like SiliconExpert or Octopart. And the amber strip: JLCPCB will give you an instant price, but it is their selling price. You cannot negotiate with another supplier\u2019s quotation. ' +
    'Where do we sit? Camp B by purpose, reached from the physical board like camp C. One honest caveat for JLR: the photo route needs AI, and AI is switched off in the JLR build. So at JLR today, a board is costed from typed inputs.'
  );
}

// ── 1c2 · Who does what — automation, delivery model, price, source ──
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Who Does What — Automation, Delivery Model and Price', 'Every row from a named public source. Where a vendor does not publish a price, the cell says so — nothing here is estimated', NAVY);

  // The automation scale, defined so it is not a matter of opinion
  s.addShape('roundRect', { x: 0.5, y: 1.18, w: 12.33, h: 0.44, fill: { color: 'EEF1F6' }, line: { color: MUTED, width: 0.9 }, rectRadius: 0.07 });
  s.addText([
    { text: 'Automation scale:   ', options: { bold: true, color: NAVY } },
    { text: 'L0 ', options: { bold: true, color: PURPLE } }, { text: 'manual service (people take the board apart)   ', options: { color: SLATE } },
    { text: 'L1 ', options: { bold: true, color: AMBER } }, { text: 'software, human keys the BOM   ', options: { color: SLATE } },
    { text: 'L2 ', options: { bold: true, color: BLUE } }, { text: 'BOM file in → cost out   ', options: { color: SLATE } },
    { text: 'L3 ', options: { bold: true, color: GREEN } }, { text: 'photo / unstructured in → BOM + cost out', options: { color: SLATE } },
  ], { x: 0.68, y: 1.18, w: 12.0, h: 0.44, fontFace: 'Calibri', fontSize: 9.0, margin: 0, valign: 'middle' });

  const cw = [2.0, 1.0, 2.05, 0.52, 3.6, 3.16];
  const ch = ['Who', 'Model', 'What goes in', 'Auto', 'Price (published only)', 'Source'];
  let hx = 0.5;
  ch.forEach((h, i) => {
    s.addText(h, { x: hx, y: 1.70, w: cw[i], h: 0.3, fontFace: 'Calibri', fontSize: 9.0, bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: i === 3 ? 'center' : 'left', valign: 'middle', margin: 0.05 });
    hx += cw[i];
  });

  const rows = [
    ['Luminovo', 'Software\nSaaS', 'BOM file + PCB spec\n(LLM BOM importer, auto MPN match)', 'L2',
     'NOT PUBLISHED. Pricing page names 4 tiers (Starter / Advanced / Professional / Enterprise), scaled by spend or assemblies per year — no figures.',
     'luminovo.com/pricing · /platform/quoting-intelligence · own FAQ "Are prices listed online?"'],
    ['CalcuQuote (Elisa IndustrIQ)', 'Software\nSaaS', 'BOM file + sourcing rules', 'L2',
     'NOT PUBLISHED. Monthly, 3 tiers, unlimited users, scaled by annual quoting volume. "Request Pricing" pages.',
     'calcuquote.com/quotecq · /request-pricing-quote · elisaindustriq.com/calcuquote/pricing'],
    ['aPriori', 'Software\non-prem or SaaS', 'BOM + board spec (CAD for mechanical)', 'L1–L2',
     'NOT PUBLISHED. Named-user annual subscription; Foundation module sized by deployment, cost models priced separately.',
     'apriori.com PCBA module + Electronics process-model PDF · G2 / TrustRadius pricing pages'],
    ['Siemens Teamcenter X PCM', 'Software\nhybrid cloud', 'BOM + board spec', 'L1–L2',
     'NOT PUBLISHED. Named end-user licences plus modules; custom quotation.',
     'siemens.com/.../teamcenter/solutions/product-cost-management'],
    ['Tset', 'Software\ncloud', 'Board layout, part count, process parameters', 'L1–L2',
     'NOT PUBLISHED.',
     'tset.com/industries/electronics-and-high-tech-manufacturing · /videos/pcba-pcb'],
    ['Boothroyd Dewhurst DFMA', 'Software\nlicence', 'Part / assembly definition keyed in', 'L1',
     'NOT PUBLISHED. Contact sales.',
     'dfma.com/software/cost.asp · /resources/pcb-cost-estimating.asp'],
    ['Yole SystemPlus', 'SERVICE\nper report', 'The physical board', 'L0',
     'PER-REPORT LIST PRICE — the only figures I could verify are 2017–18 flyers (EUR 2,490 / 3,490 / 4,990). Order of magnitude only.',
     'systemplus.fr/services/reverse-costing · reverse-costing.com · yolegroup.com'],
    ['TechInsights', 'SERVICE\n+ subscription', 'The physical board', 'L0',
     'NOT PUBLISHED. Channel subscriptions incl. a Component Price Landscape feed.',
     'techinsights.com/.../teardown-costing · /reverse-engineering-subscriptions'],
    ['JLCPCB (instant quote)', 'Supplier\nself-serve', 'BOM + Gerber upload', 'L2',
     'FULLY PUBLISHED: SMT USD 0.0017/joint; setup USD 25 one side / 50 two; hand solder USD 3.50 + 0.0173/joint. Their SELLING price, prototype scope.',
     'jlcpcb.com/help/article/pcb-assembly-price · jlcpcb.com/parts/bom-tool'],
    ['PCB Tracer', 'Software\nbrowser', 'Photos of the board (top + bottom)', 'L3',
     'PUBLISHED: built-in features free; AI features ≈ USD 0.50 per schematic. Extracts BOM and netlist — does NOT cost the board.',
     'pcbtracer.com · github.com/rpelorosso/pcb-tracer'],
  ];
  rows.forEach((r, ri) => {
    const y = 2.06 + ri * 0.452;
    let x = 0.5;
    const auto = r[3];
    const acol = auto === 'L0' ? PURPLE : auto === 'L1' ? AMBER : auto === 'L3' ? GREEN : BLUE;
    r.forEach((v, i) => {
      const isSvc = i === 1 && String(v).startsWith('SERVICE');
      s.addText(v, {
        x, y, w: cw[i], h: 0.452, fontFace: i === 3 ? 'Calibri' : 'Calibri',
        fontSize: i === 0 ? 8.1 : i === 3 ? 9.0 : 7.5,
        bold: i === 0 || i === 3 || isSvc,
        color: i === 0 ? NAVY : i === 3 ? acol : i === 5 ? MUTED : (isSvc ? PURPLE : SLATE),
        italic: i === 5,
        fill: { color: ri % 2 ? 'F0F4F9' : 'FFFFFF' },
        align: i === 3 ? 'center' : 'left', valign: 'middle', margin: 0.05,
      });
      x += cw[i];
    });
  });

  s.addShape('roundRect', { x: 0.5, y: 6.62, w: 12.33, h: 0.5, fill: { color: B.amberTint }, line: { color: AMBER, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'The pricing finding:  ', options: { bold: true, color: AMBER } },
    { text: 'every should-cost and quoting platform in this market sells on quotation — not one publishes a figure. Only the per-report services and the instant-quote suppliers put a number in public. Any "typical licence cost" you are offered for these tools is somebody’s guess.', options: { color: SLATE } },
  ], { x: 0.68, y: 6.62, w: 12.0, h: 0.5, fontFace: 'Calibri', fontSize: 9.4, margin: 0, valign: 'middle' });

  footer(s, ++PG);
  s.addNotes(
    'This is the evidence slide, and I want to be clear how much weight it carries before anyone quotes it. ' +
    'The scale across the top makes automation a definition, not an opinion. L0 is a manual service. L1 is software where a person keys the BOM. L2 is a BOM file in and a cost out. L3 is a photo in and a BOM and cost out. ' +
    'The price column is what I was asked for, and the honest answer is that almost nobody publishes. Luminovo, CalcuQuote, aPriori, Siemens, Tset and Boothroyd all sell on quotation. So the amber box is the finding, not a gap in my research. If someone shows you a typical licence cost for these tools, it is a guess. I have left those cells saying not published, and I would like to keep it that way. ' +
    'Two rows have real figures. Yole sells reports at list price, but the only prices I could verify are from 2017 and 2018, so treat them as order of magnitude. JLCPCB publishes everything, but it is a prototype and consumer selling price. ' +
    'PCB Tracer is the row that changed my view. It reads board photos into a BOM, free or nearly free. It does not cost the board, but photo to BOM is not uncontested. ' +
    'One caveat: vendor sites were read through a search index, not opened directly. Good enough to cite, not to quote word for word.' +
    '\n\n───────────── SOURCES (accessed 7 August 2026, via search index — direct fetch blocked by network policy) ─────────────\n' +
    'Luminovo — luminovo.com/pricing · luminovo.com/platform/quoting-intelligence · luminovo.com/platform/pcb-pricing · luminovo.com/faq/how-does-luminovo-pricing-work-are-prices-listed-online · luminovo.com/faq/how-much-does-luminovo-cost\n' +
    'CalcuQuote / Elisa IndustrIQ — calcuquote.com/quotecq · calcuquote.com/request-pricing-quote · elisaindustriq.com/calcuquote/pricing · elisaindustriq.com/resources/blog/6-bom-management-and-quoting-software-platforms-for-ems-providers-in-2026\n' +
    'aPriori — apriori.com/wp-content/uploads/2023/03/Manufacturing-Process-Models-for-Electronics.pdf · apriori.com/resources/video/demo-pcb-pcba/ · resources.apriori.com/vidyard-all-players/introducing-aprioris-printed-circuit-board-assembly-costing-module · g2.com/products/apriori-manufacturing-intelligence-platform/pricing · trustradius.com/products/apriori-technologies/pricing\n' +
    'Siemens — siemens.com/en-us/products/teamcenter/solutions/product-cost-management/ · resources.sw.siemens.com/en-US/fact-sheet-reduce-costs-and-carbon-footprint-with-teamcenter-x-product-cost-management/\n' +
    'Tset — tset.com/industries/electronics-and-high-tech-manufacturing · tset.com/blog/how-to-calculate-pcba-and-pcb-costs-in-product-costing-software · tset.com/videos/pcba-pcb\n' +
    'FACTON / costdata — costdata.de/en/blog/best-cost-engineering-software\n' +
    'Boothroyd Dewhurst — dfma.com/software/cost.asp · dfma.com/software/cost-modeling-software-for-manufacturing.html · dfma.com/resources/pcb-cost-estimating.asp\n' +
    'Yole SystemPlus — systemplus.fr/services/reverse-costing/ · yolegroup.com/about-us/reverse-costing/ · reverse-costing.com  (EUR figures: 2017–18 Yole flyers via slideshare.net/Yole_Developpement — STALE, order-of-magnitude only)\n' +
    'TechInsights — techinsights.com/technical-capabilities/overview/scope-of-analysis/teardown-costing · techinsights.com/reverse-engineering-subscriptions · .../component-pricing-landscape-and-analysis-subscriptions · .../automotive-teardown-subscriptions\n' +
    'JLCPCB — jlcpcb.com/help/article/pcb-assembly-price · jlcpcb.com/pcb-assembly · jlcpcb.com/parts/bom-tool/\n' +
    'PCB Tracer — pcbtracer.com · pcbtracer.com/PCB_Tracer.html · github.com/rpelorosso/pcb-tracer · hackaday.com/2026/02/23/x-ray-a-pcb-virtually/\n' +
    'Academic (photo→BOM is a researched problem, not only a product): arxiv.org/pdf/2307.13105 (PCB marking detection for hardware assurance) · arxiv.org/pdf/2202.08452 · arxiv.org/pdf/2301.09268 (PCBDet)\n' +
    'CostVision figures on the following two slides are read from our own source, not from memory: server/routes/pcb.ts (grounding block ~L1408–1432), server/utils/pcb-live-pricing.ts, server/utils/pcb-bom-grounding.ts (groundingCandidates cap = 20), server/utils/pcb-price-catalogue.ts, src/engine/modules/pcba.ts.'
  );
}

// ── 1c3 · CostVision on the same axes — including where we lose ──
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'CostVision Measured on the Same Axes', 'Green only where we genuinely lead. Red where we do not — including one thing we cannot yet claim at all', NAVY);

  const cw2 = [2.42, 2.62, 2.62, 2.62, 2.05];
  const ch2 = ['', 'Camp A · EMS quoting', 'Camp B · Enterprise should-cost', 'Camp C · Reverse costing', 'CostVision'];
  let hx2 = 0.5;
  ch2.forEach((h, i) => {
    s.addText(h, { x: hx2, y: 1.22, w: cw2[i], h: 0.34, fontFace: 'Calibri', fontSize: 8.8, bold: true,
      color: 'FFFFFF', fill: { color: i === 4 ? '4F46E5' : NAVY }, align: i ? 'center' : 'left', valign: 'middle', margin: 0.05 });
    hx2 += cw2[i];
  });

  // verdict: 'w' = we lead, 'l' = we lose, 'n' = neutral/equal
  const rows2 = [
    ['Starts from', 'A BOM file', 'A BOM + board spec', 'The physical board', 'A photograph\n(AI — off at JLR)', 'w'],
    ['Automation', 'L2', 'L1–L2', 'L0 — people', 'L3', 'w'],
    ['Turnaround', 'Minutes', 'Hours (after data entry)', 'Weeks', 'Minutes', 'w'],
    ['Cost engine', 'Supplier price build-up', 'Deterministic should-cost', 'Bottom-up from teardown', 'Deterministic, 8-bucket,\n2,438 automated tests', 'n'],
    ['Component prices', 'Live distributor APIs', 'Licensed price libraries', 'Own price database', 'Live API built + wired\n— but UNCONFIGURED,\nso offline catalogue in practice', 'l'],
    ['Runs air-gapped', 'No — cloud SaaS', 'On-prem possible', 'n/a — a service', 'Yes, AIR_GAPPED=1 —\nbut the photo read\nneeds AI', 'w'],
    ['Per-line evidence', 'Distributor quote ref', 'Model + library ref', 'Physical inspection', 'Evidence tag per line\n(legible / partial / inferred)', 'w'],
    ['PCBA accuracy\nvs actuals', 'Won/lost quote feedback', 'Vendor-claimed ROI cases', 'The reference standard', 'NOT VALIDATED — no PCBA\nactuals recorded yet', 'l'],
    ['Maturity', '300+ EMS customers claimed', 'Decades, thousands of seats', '250+ automotive teardowns', 'One board, internally', 'l'],
  ];
  rows2.forEach((r, ri) => {
    const y = 1.62 + ri * 0.53;
    let x = 0.5;
    const verdict = r[5];
    const vfill = verdict === 'w' ? B.greenTint : verdict === 'l' ? 'F9E8E5' : 'EEF1F6';
    const vcol = verdict === 'w' ? GREEN : verdict === 'l' ? RED : SLATE;
    r.slice(0, 5).forEach((v, i) => {
      const isUs = i === 4;
      s.addText(v, {
        x, y, w: cw2[i], h: 0.53, fontFace: 'Calibri', fontSize: i === 0 ? 8.2 : 7.5,
        bold: i === 0 || isUs, color: i === 0 ? NAVY : isUs ? vcol : SLATE,
        fill: { color: isUs ? vfill : (ri % 2 ? 'F0F4F9' : 'FFFFFF') },
        align: i ? 'center' : 'left', valign: 'middle', margin: 0.05,
      });
      x += cw2[i];
    });
  });

  s.addShape('roundRect', { x: 0.5, y: 6.44, w: 12.33, h: 0.66, fill: { color: 'F9E8E5' }, line: { color: RED, width: 1.2 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Read the two red rows first.  ', options: { bold: true, color: RED } },
    { text: 'We have never checked a PCBA estimate against a real invoice — and no estimate of any kind has yet been compared with a price JLR paid. The brake-ECU study rested on a fitted price curve with 18% of the BOM inferred and roughly £20 of Bosch captive silicon that has no market price. Both are fixable. Neither is fixed.', options: { color: SLATE } },
  ], { x: 0.68, y: 6.44, w: 12.0, h: 0.66, fontFace: 'Calibri', fontSize: 9.4, margin: 0, valign: 'middle' });

  footer(s, ++PG);
  s.addNotes(
    'Same axes as the last slide, with us in the indigo column. I have coloured our cell green only where I can defend it, and red where I cannot. ' +
    'The green rows first. We start from a photo rather than a BOM. We return an answer in minutes rather than weeks. We can run air-gapped. And every BOM line carries an evidence tag: legible, partly legible or inferred. I have not seen anyone else print that. ' +
    'But notice the caveat I have added. The photo read needs AI, and AI is off in the JLR build. So at JLR today, the photo route is not available. The board is costed from typed inputs on the PCB forms. ' +
    'The component price row. Live distributor pricing is built and wired in, but it needs an API key and internet, and we do not have one. So in practice every price comes from the offline catalogue. It exists, and it is switched off. ' +
    'Now the red rows, which I would read first. We have never checked a PCBA estimate against a real invoice. More broadly, no estimate of any commodity has yet been compared with a price JLR paid. We measure accuracy as actuals are logged; we do not claim it up front. ' +
    'And maturity. Others have hundreds of customers or teardowns. We have done one board, internally. That is where we are.'
  );
}

// ── 1c4 · The gap, and the one thing that closes it ──
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'The Gap — and the One Thing That Closes It', 'What we can defend today, what we cannot, and the smallest change that moves us from “defensible estimate” to “priced”', GREEN);

  // What is genuinely ours
  s.addShape('roundRect', { x: 0.5, y: 1.24, w: 6.05, h: 2.28, fill: { color: CARD }, line: { color: GREEN, width: 1.4 }, rectRadius: 0.09 });
  s.addShape('rect', { x: 0.5, y: 1.24, w: 6.05, h: 0.34, fill: { color: GREEN } });
  s.addText('WHAT IS ACTUALLY OURS', { x: 0.64, y: 1.24, w: 5.77, h: 0.34, fontFace: 'Calibri', fontSize: 9.2, bold: true, color: 'FFFFFF', charSpacing: 0.5, margin: 0, valign: 'middle' });
  s.addText([
    { text: 'Photograph → BOM → deterministic should-cost, in one pass (AI mode).\n', options: { bold: true, color: NAVY } },
    { text: 'Each half exists elsewhere. PCB Tracer reads a board photo into a BOM for free. aPriori costs a PCBA properly from a BOM. ', options: { color: SLATE } },
    { text: 'Nobody joins them', options: { bold: true, color: GREEN } },
    { text: ' — and the join is what lets a buyer cost a competitor’s board, or their own board when the supplier will not open the BOM.\n\n', options: { color: SLATE } },
    { text: 'Plus: works with or without an API key, a price basis on every line, and the same eight-bucket engine as every other commodity — so a PCBA sits in the same portfolio as a casting.', options: { color: SLATE } },
  ], { x: 0.68, y: 1.66, w: 5.69, h: 1.78, fontFace: 'Calibri', fontSize: 9.0, margin: 0, valign: 'top' });

  // What is not
  s.addShape('roundRect', { x: 6.78, y: 1.24, w: 6.05, h: 2.28, fill: { color: CARD }, line: { color: RED, width: 1.4 }, rectRadius: 0.09 });
  s.addShape('rect', { x: 6.78, y: 1.24, w: 6.05, h: 0.34, fill: { color: RED } });
  s.addText('WHAT IS NOT — SAY IT FIRST', { x: 6.92, y: 1.24, w: 5.77, h: 0.34, fontFace: 'Calibri', fontSize: 9.2, bold: true, color: 'FFFFFF', charSpacing: 0.5, margin: 0, valign: 'middle' });
  s.addText([
    { text: '1 · No validated PCBA accuracy. ', options: { bold: true, color: RED } },
    { text: 'Zero boards checked against an invoice.\n', options: { color: SLATE } },
    { text: '2 · Distributor pricing needs a key. ', options: { bold: true, color: RED } },
    { text: 'Built and wired; meanwhile a 458-part catalogue prices every line — 77 from distributor pages, the rest labelled estimates.\n', options: { color: SLATE } },
    { text: '3 · Captive silicon is unpriceable. ', options: { bold: true, color: RED } },
    { text: 'On the brake ECU, ~£20 of Bosch in-house parts have no market price — no feed fixes that.\n', options: { color: SLATE } },
    { text: '4 · Placement rate unvalidated. ', options: { bold: true, color: RED } },
    { text: 'The library CPH drives £14.21 of process cost; at 2–3× it becomes £4.74–£7.10. Worth more than the whole 200k→350k volume step.', options: { color: SLATE } },
  ], { x: 6.96, y: 1.66, w: 5.69, h: 1.78, fontFace: 'Calibri', fontSize: 9.0, margin: 0, valign: 'top' });

  // The three moves, in order of value per effort
  const moves = [
    ['1 · TURN THE PRICE FEED ON', BLUE, BLUE_T,
     'A Nexar (Octopart) or RS API key. The integration already exists in server/utils/pcb-live-pricing.ts and already grounds the BOM before totals — it is key-gated and unset.',
     'Also lift the 20-part grounding cap: the ECU BOM has 20 lines, so it is already at the limit.'],
    ['2 · VALIDATE ON A KNOWN BOARD', GREEN, GREEN_T,
     'Cost one board we already hold a purchase-order price for, and record the actual. That converts the red "not validated" row into a number.',
     'The calibration and drift machinery to learn from it is already built — it has never been fed a PCBA.'],
    ['3 · CHALLENGE THE PLACEMENT RATE', AMBER, AMBER_T,
     'Ask one EMS supplier for a real CPH on a comparable board and reconcile it against CPH_BY_TYPE.',
     'One conversation. Larger effect on the answer than any volume or region change we have modelled.'],
  ];
  moves.forEach(([hd, col, tint, body, note], i) => {
    const x = 0.5 + i * 4.19;
    s.addShape('roundRect', { x, y: 3.68, w: 3.94, h: 2.24, fill: { color: CARD }, line: { color: col, width: 1.25 }, rectRadius: 0.09 });
    s.addShape('rect', { x, y: 3.68, w: 0.06, h: 2.24, fill: { color: col } });
    s.addText(hd, { x: x + 0.18, y: 3.76, w: 3.62, h: 0.26, fontFace: 'Calibri', fontSize: 8.4, bold: true, color: col, charSpacing: 0.4, margin: 0, valign: 'middle' });
    s.addText(body, { x: x + 0.18, y: 4.06, w: 3.62, h: 1.14, fontFace: 'Calibri', fontSize: 8.2, color: SLATE, margin: 0, valign: 'top' });
    s.addShape('roundRect', { x: x + 0.18, y: 5.24, w: 3.62, h: 0.6, fill: { color: tint }, line: null, rectRadius: 0.06 });
    s.addText(note, { x: x + 0.28, y: 5.24, w: 3.42, h: 0.6, fontFace: 'Calibri', fontSize: 7.5, italic: true, color: col, margin: 0, valign: 'middle' });
  });

  s.addShape('roundRect', { x: 0.5, y: 6.06, w: 12.33, h: 0.9, fill: { color: B.greenTint }, line: { color: GREEN, width: 1.2 }, rectRadius: 0.08 });
  s.addText([
    { text: 'The ask:  ', options: { bold: true, color: GREEN } },
    { text: 'one distributor API key and one board with a known purchase price. The integration and the learning-from-actuals machinery are already built. The key needs internet; without it the catalogue prices the board. Until then the honest headline stays: ', options: { color: SLATE } },
    { text: 'a defensible, fully traceable estimate — not a priced quotation.', options: { bold: true, color: NAVY } },
  ], { x: 0.68, y: 6.06, w: 12.0, h: 0.9, fontFace: 'Calibri', fontSize: 10.0, margin: 0, valign: 'middle' });

  footer(s, ++PG);
  s.addNotes(
    'Last one on the market, and it is the decision slide for the PCB side. ' +
    'Top left is what is genuinely ours, and I have kept the claim narrow. Photo to BOM exists elsewhere. Costing a PCBA from a BOM exists elsewhere. What I could not find is the two joined in one pass. That join lets a buyer cost a board when nobody will hand over the BOM. It depends on AI, which is off at JLR. ' +
    'Top right, four things we should say before anyone else does. PCBA accuracy is not validated against a single invoice. Distributor pricing is built and waits for a key; the catalogue prices the board meanwhile. About twenty pounds of the brake ECU is Bosch captive silicon with no market price, and no data feed fixes that. And the placement rate: the process cost on that board rests on our library\u2019s placements per hour, and if a real line runs two or three times faster the number falls a lot. ' +
    'The three cards are what to do, in order of value for effort. Turn the price feed on where the network allows it. Cost one board where we already know the purchase price, and log it as an actual. And ask one EMS supplier for a real placement rate. ' +
    'Until then the headline stays what it is: a defensible, traceable estimate, not a priced quotation.'
  );
}

FOOT = FOOT_MAIN;

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
      'Example: on a machined bracket the tool lists £5.38/part of ideas to test; the biggest is a £4.38 sourcing study. Ideas, not savings achieved.'],
    [I.cube, 'B · Design-stage avoidance', TEAL,
      'Cost known while the design can still move. Quick enough to run at concept stage rather than after the quote lands, while wall thickness, cavitation and routing are all still open.',
      'Worked example: on the bumper, tooling is 43% of piece cost — more than resin, press and labour combined.'],
    [I.person, 'C · Engineering capacity', BLUE,
      'The hours are the enabler, not the prize. You cannot hold 40 floor-price negotiations a year if each should-cost costs half a day to prepare — capacity is what makes stream A reachable at all.',
      'Not yet measured. The pilot times real runs; until then the hours are a planning estimate.'],
  ];
  streams.forEach(([ico, t, col, body, ev], i) => {
    const x = 0.5 + i * 4.19;
    s.addShape('roundRect', { x, y: 1.14, w: 3.94, h: 1.9, fill: { color: CARD }, line: { color: col, width: 1.5 }, rectRadius: 0.1 });
    s.addShape('ellipse', { x: x + 0.16, y: 1.26, w: 0.34, h: 0.34, fill: { color: col } });
    s.addImage({ data: ico, x: x + 0.24, y: 1.34, w: 0.18, h: 0.18 });
    s.addText(t, { x: x + 0.58, y: 1.24, w: 3.2, h: 0.3, fontFace: 'Calibri', fontSize: 11.0, bold: true, color: col, margin: 0, valign: 'middle' });
    s.addText(body, { x: x + 0.16, y: 1.64, w: 3.62, h: 0.8, fontFace: 'Calibri', fontSize: 8.3, color: SLATE, margin: 0, valign: 'top' });
    s.addShape('roundRect', { x: x + 0.16, y: 2.48, w: 3.62, h: 0.46, fill: { color: 'F0F4F9' }, rectRadius: 0.05 });
    s.addText(ev, { x: x + 0.26, y: 2.48, w: 3.42, h: 0.46, fontFace: 'Calibri', fontSize: 7.5, italic: true, color: NAVY, margin: 0, valign: 'middle' });
  });

  // The calculation as a chain, so each term can be attacked separately.
  s.addText('THE CALCULATION — ATTACK ANY OF THE THREE TERMS', { x: 0.5, y: 3.14, w: 8, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: NAVY, charSpacing: 0.6, margin: 0 });
  const chain = [
    ['Addressed spend', '£20 m', 'annual purchased value of the\nparts we put through it', MUTED, false],
    ['× Identified', '8%', 'planning assumption —\nthe pilot measures\nthe real figure', MUTED, false],
    ['× Captured', '20%', 'the share we actually\nimplement — the honest\nunknown', AMBER, false],
    ['= Saving', '£320k/yr', 'recurring, against a one-off\npilot cost of ≈ £25k', GREEN, true],
  ];
  chain.forEach(([label, val, note, col, last], i) => {
    const x = 0.5 + i * 3.13;
    s.addShape('roundRect', { x, y: 3.40, w: 2.78, h: 1.28, fill: { color: last ? GREEN_T : CARD }, line: { color: last ? GREEN : LINE, width: last ? 1.5 : 1 }, rectRadius: 0.09 });
    s.addText(label, { x: x + 0.14, y: 3.48, w: 2.5, h: 0.24, fontFace: 'Calibri', fontSize: 8.6, bold: true, color: last ? GREEN : NAVY, margin: 0 });
    s.addText(val, { x: x + 0.14, y: 3.72, w: 2.5, h: 0.42, fontFace: 'Cambria', fontSize: 21.0, bold: true, color: last ? GREEN : NAVY, margin: 0, valign: 'middle' });
    s.addText(note, { x: x + 0.14, y: 4.14, w: 2.5, h: 0.5, fontFace: 'Calibri', fontSize: 7.5, color: col, margin: 0, valign: 'top' });
    if (!last) s.addText(i === 2 ? '=' : '×', { x: x + 2.80, y: 3.84, w: 0.31, h: 0.4, fontFace: 'Cambria', fontSize: 15.0, bold: true, color: MUTED, align: 'center', margin: 0, valign: 'middle' });
  });

  // Assumptions, visible — so the room argues with the model, not with the idea.
  s.addShape('roundRect', { x: 0.5, y: 4.78, w: 7.55, h: 1.2, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
  s.addText('WHAT WE ASSUMED — SWAP ANY OF THESE FOR OUR REAL NUMBERS', { x: 0.68, y: 4.85, w: 7.2, h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: MUTED, charSpacing: 0.4, margin: 0 });
  s.addText([
    { text: '40 parts in the pilot basket · £500k average annual purchased value each · 8% identified · 20% captured.\n', options: { color: SLATE } },
    { text: 'All four are planning assumptions, not tool results. ', options: { bold: true, color: NAVY } },
    { text: 'A 20% capture assumes four of every five ideas are never acted on. Nothing here needs the tool to be right about one part — only roughly right across a basket.', options: { color: SLATE } },
  ], { x: 0.68, y: 5.07, w: 7.2, h: 0.86, fontFace: 'Calibri', fontSize: 8.4, margin: 0, valign: 'top' });

  // Cost of doing nothing.
  s.addShape('roundRect', { x: 8.28, y: 4.78, w: 4.55, h: 1.2, fill: { color: 'FBEAE8' }, line: { color: RED, width: 1 }, rectRadius: 0.09 });
  s.addText('IF WE DO NOTHING', { x: 8.46, y: 4.85, w: 4.2, h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: RED, charSpacing: 0.4, margin: 0 });
  s.addText('Quotes keep being accepted without a floor price · cost keeps being discovered after the design is locked, when the cheap levers have closed · findings like 43%-tooling keep arriving too late to act on · a should-cost stays half a day of an engineer, so only the biggest parts ever get one.',
    { x: 8.46, y: 5.07, w: 4.2, h: 0.86, fontFace: 'Calibri', fontSize: 8.1, color: SLATE, margin: 0, valign: 'top' });

  // The number that makes the pilot decision easy.
  s.addShape('roundRect', { x: 0.5, y: 6.10, w: 12.33, h: 0.86, fill: { color: NAVY }, rectRadius: 0.1 });
  s.addText([
    { text: 'Break-even: ', options: { bold: true, color: '9FB6E0', fontSize: 12.0 } },
    { text: 'the pilot pays for itself if we capture ', options: { color: 'FFFFFF', fontSize: 12.0 } },
    { text: '1.6% ', options: { bold: true, color: '6EE7B7', fontSize: 15.0 } },
    { text: 'of what it identifies — one pound in sixty. Every point of capture above that is ≈£16k a year.   ', options: { color: 'FFFFFF', fontSize: 12.0 } },
    { text: 'We are not asking you to believe 20%. We are asking whether 1.6% is plausible.', options: { bold: true, color: 'FFFFFF', fontSize: 12.0 } },
  ], { x: 0.85, y: 6.16, w: 11.65, h: 0.74, fontFace: 'Calibri', margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'This is where the money comes from. Hours are not money, so I lead with the money and put the hours where they belong. ' +
    'Three streams. A, the negotiation floor. A should-cost turns a quote into a conversation with a number under it. Every line shows how it was worked out, so the challenge survives the meeting. As an example, on a machined bracket the tool lists about five pounds forty a part of ideas to test. Those are ideas, not savings anyone has banked. ' +
    'B, design-stage avoidance. The tool is quick enough to use while the design can still change. On the bumper, tooling turns out to be forty-three percent of the piece cost. You want to know that before the tool is ordered. ' +
    'C, capacity. I have put it third on purpose. We have not timed the tool against the manual method yet. The pilot will do that. ' +
    'Then the calculation, laid out as a chain so you can attack any one term. Twenty million of spend, eight percent identified, twenty percent captured, gives three hundred and twenty thousand a year. Every one of those is a planning assumption, not a tool result. Swap in our real numbers. ' +
    'The line to leave with is the navy strip. At a pilot cost of about twenty-five thousand, break-even is capturing one point six percent of what is identified. I am not asking you to believe twenty percent. I am asking whether one point six is plausible.'
  );
}
{
  // ── Business case I — minutes, not hours ──
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Business Case II — Where the Time Goes', 'Expected time per should-cost, by commodity, against the CAPEE-by-hand baseline — planning figures until the pilot times them', GREEN);
  // What the CostVision minutes actually contain (the tool truth)
  const steps = [
    [I.upload, 'Upload CAD', '~1 min'],
    [I.ruler, 'Measure + derive', '1–2 min\nautomatic'],
    [I.person, 'Answer questions', '2–5 min\nmaterial · route'],
    [I.check, 'Review + approve', '5–8 min'],
  ];
  s.addText('WHAT THE COSTVISION MINUTES WOULD CONTAIN', { x: 0.5, y: 1.16, w: 5.9, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: TEAL, charSpacing: 0.6, margin: 0 });
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
    { text: 'Expected: 10–15 minutes ', options: { bold: true, color: TEAL, fontSize: 12.0 } },
    { text: 'for a CAD part, engineer at the screen. Not yet timed.', options: { color: SLATE, fontSize: 9.5 } },
    { text: ' CAPEE keys these inputs by hand; here the tool measures them.', options: { color: NAVY, fontSize: 8.2, bold: true } },
  ], { x: 0.5, y: 2.64, w: 5.9, h: 0.42, fontFace: 'Calibri', margin: 0, valign: 'top' });
  // Per-commodity time table
  const rows = [
    ['Casting + machining (CAD)', '10–15 min', '4–5 h', 'confirmed baseline'],
    ['Machining from billet (CAD)', '10–15 min', '3–4 h', 'team-reported'],
    ['Injection moulding (CAD)', '10–15 min', '3–4 h', 'team-reported'],
    ['Forging + machining (CAD)', '10–15 min', '3–4 h', 'team-reported'],
    ['Sheet-metal pressing (CAD)', '10–15 min', '2–3 h', 'team-reported'],
    ['Blow-moulded tank (CAD)', '10–15 min', '3–4 h', 'team-reported'],
    ['Manual form (any of 19)', '15–30 min', '2–4 h', 'team-reported'],
  ];
  const ty = 3.34;
  s.addText('TIME PER SHOULD-COST, BY COMMODITY', { x: 0.5, y: ty - 0.22, w: 5.9, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: NAVY, charSpacing: 0.6, margin: 0 });
  const th = ['Commodity', 'CostVision*', 'CAPEE by hand', 'Baseline'];
  const tw = [2.5, 1.0, 1.2, 1.35];
  let tx = 0.5;
  th.forEach((h, i) => { s.addText(h, { x: tx, y: ty, w: tw[i], h: 0.24, fontFace: 'Calibri', fontSize: 8.3, bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: i ? 'center' : 'left', valign: 'middle', margin: 0.04 }); tx += tw[i]; });
  rows.forEach(([c, cv, cap, note], r) => {
    const y = ty + 0.24 + r * 0.335;
    let x = 0.5;
    const cells = [c, cv, cap, note];
    cells.forEach((v, i) => {
      s.addText(v, { x, y, w: tw[i], h: 0.335, fontFace: 'Calibri', fontSize: 8.4,
        bold: i === 1, color: i === 1 ? TEAL : (i === 3 && v.startsWith('confirmed') ? GREEN : SLATE),
        fill: { color: r % 2 ? 'F0F4F9' : 'FFFFFF' }, align: i ? 'center' : 'left', valign: 'middle', margin: 0.04 });
      x += tw[i];
    });
  });
  // Bar chart: the same rows as minutes
  s.addText('THE SAME TABLE AS A PICTURE — PLANNING MINUTES', { x: 6.85, y: 1.16, w: 6.0, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: NAVY, charSpacing: 0.6, margin: 0 });
  s.addChart('bar', [
    { name: 'CostVision (expected midpoint)', labels: ['Cast+mach', 'Machining', 'Inj. mould', 'Forging', 'Sheet metal', 'Blow mould'], values: [12.5, 12.5, 12.5, 12.5, 12.5, 12.5] },
    { name: 'CAPEE by hand (midpoint)', labels: ['Cast+mach', 'Machining', 'Inj. mould', 'Forging', 'Sheet metal', 'Blow mould'], values: [270, 210, 210, 210, 150, 210] },
  ], {
    x: 6.85, y: 1.42, w: 6.0, h: 4.6, barDir: 'bar', barGrouping: 'clustered',
    chartColors: [B.teal, B.amber], showLegend: true, legendPos: 'b', legendFontSize: 9,
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 8, dataLabelColor: B.slate,
    valAxisTitle: 'minutes', showValAxisTitle: true, valAxisTitleFontSize: 9,
    catAxisLabelColor: B.slate, valAxisLabelColor: B.muted, catAxisLabelFontSize: 9, valAxisLabelFontSize: 8,
    valGridLine: { color: B.line, size: 0.5 }, catGridLine: { style: 'none' },
  });
  s.addText('* Expected, not yet measured. CAPEE rows marked "team-reported" are working figures. The pilot replaces both with timed runs — confirm before circulating.',
    { x: 6.85, y: 6.10, w: 6.0, h: 0.5, fontFace: 'Calibri', fontSize: 8.6, italic: true, color: MUTED, margin: 0, valign: 'top' });
  s.addShape('roundRect', { x: 0.5, y: 6.32, w: 5.9, h: 0.72, fill: { color: B.greenTint }, line: { color: GREEN, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Man-hours saved = Σ (CAPEE hrs − CostVision hrs) × annual parts. ', options: { bold: true, color: GREEN, fontSize: 8.6 } },
    { text: 'Illustrative 500-part/yr mix over these planning midpoints: ', options: { color: SLATE, fontSize: 8.3 } },
    { text: '≈ 1,650 h/yr', options: { bold: true, color: NAVY, fontSize: 9.0 } },
    { text: ' — an estimate, not a result. Replace with our real volumes and the pilot\u2019s timed runs.', options: { color: SLATE, fontSize: 8.3 } },
  ], { x: 0.68, y: 6.38, w: 5.6, h: 0.62, fontFace: 'Calibri', margin: 0, valign: 'top' });
  footer(s, ++PG);
  s.addNotes(
    'This slide is about time, and I want to be careful with it, because we have not timed the tool properly yet. ' +
    'On the left is what a CAD should-cost would involve. Upload the file. The tool measures the part and derives the inputs. The engineer answers the handful of questions geometry cannot settle, such as the material or the process route. Then they review the range and approve it. We expect ten to fifteen minutes for a CAD part, with an engineer at the screen the whole time. That is an expectation, not a measurement. ' +
    'The table compares those expected times with doing the job by hand in CAPEE. One CAPEE row, casting plus machining at four to five hours, is a baseline we confirmed. The other CAPEE rows are working figures from the team, and the slide says so. ' +
    'The main difference is input feeding. In CAPEE every measurement is read off the CAD and typed in. Here the kernel measures the file. ' +
    'The green box shows how you would total the hours: the difference per part, times parts a year, summed by commodity. On an illustrative mix that comes to about sixteen hundred and fifty hours. Treat that as planning arithmetic. The pilot replaces every figure on this slide with timed runs.'
  );
}
{
  // ── Business case II — CostVision vs CAPEE, category by category ──
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Business Case III — CostVision vs CAPEE, by Category', 'The seven saving categories from our internal review — what CAPEE does today, and what changes', GREEN);

  const cw = [2.35, 2.55, 5.55, 1.85];
  const ch = ['Saving category', 'CAPEE today', 'CostVision', 'Shown at'];
  let hx = 0.5;
  ch.forEach((h, i) => {
    s.addText(h, { x: hx, y: 1.28, w: cw[i], h: 0.3, fontFace: 'Calibri', fontSize: 9.5, bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: i ? 'left' : 'left', valign: 'middle', margin: 0.06 });
    hx += cw[i];
  });
  const rows = [
    ['1 · Input data feeding', 'Every measurement and cycle input read off the CAD and keyed by hand', 'The geometry kernel measures the CAD file and feeds the inputs; the engineer answers only what geometry cannot decide', 'Measure + kernel slides'],
    ['2 · Machine, tonnage & process selection', 'Partially automated', 'Automatic AND cost-ranked: presses sized by clamp/force physics; machining routing and mould cavitation chosen by price, with the losing alternatives printed in the trace', 'Process-selection + routing slides'],
    ['3 · Coverage & early programme support', 'Few parts, usually after the quote lands', 'More parts costed per engineer (the pilot measures how many) — directional cost early, while wall thickness and process can still change', 'Business Case II'],
    ['4 · Total man-hours saved', '—', 'Σ (CAPEE hrs − CostVision hrs) × annual parts, per commodity — a planning estimate until the pilot times real runs', 'Business Case II strip'],
    ['5 · DFM / DFA insights', 'Not available', 'Generated by the deterministic COST ENGINE — 52 threshold rules + 10 geometry advisors, scores by fixed arithmetic. Not by AI: the AI cannot write a score, severity or saving', 'DFM/DFA slide'],
    ['6 · Cost-saving ideas', 'Engineer\u2019s own analysis', 'Generated by the cost engine\u2019s rule layer and the optimisers — each idea priced in £/part with its lever owner (design / supplier / sourcing); the AI adds display-only commentary at most', 'DFM + routing slides'],
    ['7 · Beyond a conventional tool', '—', '20-region pricing on every run · confidence band · negotiation pack · every cost line carries its printed derivation · self-audit · learns from actuals · landed cost incl. duty/CBAM · carbon · Windows package, no install', 'Throughout the deck'],
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

  s.addShape('roundRect', { x: 0.5, y: 6.35, w: 12.33, h: 0.6, fill: { color: B.greenTint }, line: { color: GREEN, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'The honest one-liner:  ', options: { bold: true, color: GREEN } },
    { text: 'CAPEE is a costing calculator that a person feeds; CostVision measures, asks and explains, with the same deterministic arithmetic at its core. At JLR the AI is off; when on, it may classify and comment, and never touches a number.', options: { color: SLATE } },
  ], { x: 0.68, y: 6.35, w: 12.0, h: 0.6, fontFace: 'Calibri', fontSize: 9.8, margin: 0, valign: 'middle' });
  footer(s, ++PG);
  s.addNotes(
    'This is our internal review with the manager, made presentable. Seven categories, taken in order. ' +
    'One, input feeding. In CAPEE a person reads every measurement off the CAD and types it in. Here the kernel measures the file, and the engineer only answers what geometry cannot decide. ' +
    'Two, machine and tonnage. CAPEE partly automates this. Here the press is sized by physics, and the machining routing and mould cavitation are chosen by cost, with the losing options printed so the choice defends itself. ' +
    'Three, coverage. If a should-cost takes minutes rather than hours, we can cost more parts, earlier. How many more is for the pilot to measure. ' +
    'Four, total hours. The formula is on the slide. Until the pilot times real runs, the answer is a planning estimate. ' +
    'Five, DFM and DFA. I checked this in the code: the findings come from the deterministic engine, fifty-two threshold rules and the geometry advisors. Not from AI. ' +
    'Six, cost-saving ideas. Same answer. The engine\u2019s rules and optimisers produce them, each priced in pounds per part with an owner. ' +
    'Seven, the extras: twenty regions on every run, the confidence band, the negotiation pack, the self-audit, learning from actuals, landed cost with duty, carbon, and a Windows package that runs with no install. ' +
    'The honest one-liner is at the bottom. The arithmetic at the core is the same kind CAPEE does. The difference is that this tool measures, asks and explains.'
  );
}
{
  // ── Business case III — evidence, coverage, cost to run ──
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Business Case IV — Evidence, Coverage, Cost to Run', 'What is proven, what is covered, what it costs to run — and what is not proven yet', GREEN);
  // KPI band
  const kpis = [
    ['2,438', 'automated tests, plus\nbrowser tests on every run', TEAL],
    ['£0', 'marginal cost per estimate\n— AI off, no call to pay for', GREEN],
    ['20', 'manufacturing regions\npriced on every run', BLUE],
    ['Every', 'cost line carries its\nown printed derivation', NAVY],
  ];
  kpis.forEach(([n, d, c], i) => {
    const x = 0.5 + i * 3.16;
    s.addShape('roundRect', { x, y: 1.18, w: 2.96, h: 1.12, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
    s.addText(n, { x: x + 0.15, y: 1.26, w: 2.65, h: 0.52, fontFace: 'Cambria', fontSize: 30.0, bold: true, color: c, margin: 0 });
    s.addText(d, { x: x + 0.15, y: 1.80, w: 2.65, h: 0.44, fontFace: 'Calibri', fontSize: 8.6, color: MUTED, margin: 0, valign: 'top' });
  });
  // What is proven — and what is not (docs/decks/tool-facts.md)
  s.addText('WHAT IS PROVEN — AND WHAT IS NOT', { x: 0.5, y: 2.56, w: 7.6, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: NAVY, charSpacing: 0.5, margin: 0 });
  const proof = [
    ['Arithmetic vs a hand calculation', 'Matches to under 0.01%', GREEN],
    ['6 real production parts', 'Pinned; a change fails the build', GREEN],
    ['Automated tests', '2,438 + browser tests every run', GREEN],
    ['Same file, same answers', 'Same price, every time', GREEN],
    ['Estimate vs a price JLR paid', 'Not yet compared', AMBER],
    ['An accuracy percentage', 'Not claimed — measured as actuals are logged', AMBER],
  ];
  const pw = [2.45, 3.25];
  let px = 0.5;
  ['Check', 'Status today'].forEach((h, i) => { s.addText(h, { x: px, y: 2.82, w: pw[i], h: 0.24, fontFace: 'Calibri', fontSize: 8.2, bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'left', valign: 'middle', margin: 0.04 }); px += pw[i]; });
  proof.forEach(([k, v, c], r) => {
    const y = 3.06 + r * 0.315;
    s.addText(k, { x: 0.5, y, w: pw[0], h: 0.315, fontFace: 'Calibri', fontSize: 8.3, color: SLATE, fill: { color: r % 2 ? 'F0F4F9' : 'FFFFFF' }, align: 'left', valign: 'middle', margin: 0.04 });
    s.addText(v, { x: 0.5 + pw[0], y, w: pw[1], h: 0.315, fontFace: 'Calibri', fontSize: 8.3, bold: true, color: c, fill: { color: r % 2 ? 'F0F4F9' : 'FFFFFF' }, align: 'left', valign: 'middle', margin: 0.04 });
  });
  s.addText([
    { text: 'Pinned means the answer cannot move without us noticing — not that it is proven right. ', options: { bold: true, color: NAVY } },
    { text: 'Accuracy is measured as real quotes and PO prices are logged; after 3 for a commodity the band is corrected by real data.', options: { color: SLATE } },
  ], { x: 0.5, y: 5.02, w: 5.9, h: 0.8, fontFace: 'Calibri', fontSize: 9.0, margin: 0, valign: 'top' });
  // Coverage donut + rate library card
  s.addChart('doughnut', [
    { name: 'Coverage', labels: ['Costed from CAD on rules (13)', 'Form inputs only (6)'], values: [13, 6] },
  ], {
    x: 6.6, y: 2.66, w: 3.1, h: 2.5, holeSize: 60,
    chartColors: [B.teal, B.amber], showLegend: true, legendPos: 'b', legendFontSize: 8.5,
    showValue: false, showTitle: true, title: '19 manufacturing processes', titleFontSize: 10, titleColor: B.navy,
  });
  s.addShape('roundRect', { x: 9.95, y: 2.72, w: 2.88, h: 2.38, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
  s.addText('RATE LIBRARY 2.1.0 · 16 JUNE 2026', { x: 10.1, y: 2.8, w: 2.6, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: NAVY, charSpacing: 0.3, margin: 0 });
  [['328', 'materials'], ['178', 'machines'], ['42', 'labour grades'], ['20', 'regions']].forEach(([n, l], i) => {
    const y = 3.1 + i * 0.47;
    s.addText(n, { x: 10.1, y, w: 0.9, h: 0.42, fontFace: 'Cambria', fontSize: 18.0, bold: true, color: TEAL, margin: 0, valign: 'middle' });
    s.addText(l, { x: 11.05, y, w: 1.7, h: 0.42, fontFace: 'Calibri', fontSize: 10.0, color: SLATE, margin: 0, valign: 'middle' });
  });
  // what it is NOT — the trust strip
  s.addShape('roundRect', { x: 0.5, y: 5.95, w: 12.33, h: 1.02, fill: { color: B.amberTint }, line: { color: AMBER, width: 1 }, rectRadius: 0.09 });
  s.addImage({ data: I.warn, x: 0.68, y: 6.12, w: 0.26, h: 0.26 });
  s.addText([
    { text: 'What we are NOT claiming — ', options: { bold: true, color: AMBER } },
    { text: 'the tool does not read drawings or tolerances; it asks the engineer rather than guessing; and no estimate has yet been compared with a price JLR paid, so we quote no accuracy figure. Every number above can be reproduced from the tool and the code today.', options: { color: SLATE } },
  ], { x: 1.05, y: 6.02, w: 11.6, h: 0.9, fontFace: 'Calibri', fontSize: 9.0, margin: 0, valign: 'middle' });
  footer(s, ++PG);
  s.addNotes(
    'Second half of the business case: what is proven, what is covered, and what it costs to run. ' +
    'The four figures across the top. 2,438 automated tests, plus browser tests that cost every commodity, export Excel and PDF, upload an STL and check accessibility on every run. Zero marginal cost per estimate, because with AI off there is no call to pay for; it is arithmetic on your own machine. Twenty regions priced on every run. And every cost line shows how it was worked out. ' +
    'The table is the honest part. The engine matches a hand calculation to under 0.01 percent on a reference machined bracket. Six real production parts, a steering knuckle, two castings, a pressed seat bracket, a machined part and a gear, are pinned in a regression baseline, so a change that moves any of them fails the build. ' +
    'But pinned is not the same as right. No estimate has yet been compared with a price JLR actually paid. So I quote no accuracy percentage. We measure accuracy as actuals are logged, and after three for a commodity the band is corrected by real data. ' +
    'The donut shows coverage: nineteen manufacturing processes, thirteen of them costed straight from CAD on rules, the rest from the form. The card shows the rate library behind it: version 2.1.0, dated sixteenth of June 2026. ' +
    'The amber strip is what we are not claiming. I would rather say it now than have it found later.'
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
    { text: 'Approve a 90-day pilot on 40 parts.\n', options: { bold: true, color: NAVY, fontSize: 15.0 } },
    { text: 'One named owner · 0.3 FTE · one laptop or VM · ≈£25k one-off · no licence, no per-seat and no per-estimate cost. Nothing recurring is committed until the day-90 review.', options: { color: SLATE, fontSize: 9.5 } },
  ], { x: 0.72, y: 1.48, w: 5.2, h: 1.08, fontFace: 'Calibri', margin: 0, valign: 'top' });

  // Scope.
  s.addShape('roundRect', { x: 0.5, y: 2.76, w: 5.6, h: 1.42, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
  s.addText('PILOT SCOPE — AGREED UP FRONT', { x: 0.72, y: 2.84, w: 5.2, h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: MUTED, charSpacing: 0.4, margin: 0 });
  [
    ['In', '40 live parts across 4–5 commodities we already buy, chosen with purchasing — a mix of quoted parts and parts still in design.'],
    ['Out', 'No supplier is told a price comes from a tool. Every number is reviewed and owned by an engineer before it leaves the building.'],
  ].forEach(([k, v], i) => {
    const y = 3.06 + i * 0.52;
    s.addText(k, { x: 0.72, y, w: 0.42, h: 0.48, fontFace: 'Calibri', fontSize: 8.4, bold: true, color: i ? RED : GREEN, margin: 0, valign: 'top' });
    s.addText(v, { x: 1.16, y, w: 4.76, h: 0.48, fontFace: 'Calibri', fontSize: 8.2, color: SLATE, margin: 0, valign: 'top' });
  });

  // Timeline.
  s.addText('90 DAYS, THREE PHASES', { x: 0.5, y: 4.32, w: 5.6, h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: NAVY, charSpacing: 0.4, margin: 0 });
  [
    ['Days 1–30', 'Set up + calibrate', 'Package installed, our rates loaded (Rate Converter), the 6 baseline parts re-run, two engineers trained.', TEAL],
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
    ['Speed', 'Median ≤ 20 min per CAD part, engineer-attended — timed during the pilot, not estimated'],
    ['Value', '≥ £800k of annualised opportunity identified across the basket — half what Business Case I assumes — and ≥ 3 levers taken to a supplier with the outcome recorded either way'],
    ['Adoption', '2+ engineers running it unaided after one day of training, without the person who built it in the room'],
  ].forEach(([k, v], i) => {
    const y = 1.76 + i * 0.45;
    s.addShape('roundRect', { x: 6.5, y, w: 0.95, h: 0.4, fill: { color: 'E8EDF6' }, rectRadius: 0.05 });
    s.addText(k, { x: 6.5, y, w: 0.95, h: 0.4, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: NAVY, align: 'center', valign: 'middle', margin: 0 });
    s.addText(v, { x: 7.55, y, w: 5.1, h: 0.4, fontFace: 'Calibri', fontSize: 8.0, color: SLATE, margin: 0, valign: 'middle' });
  });

  // Risks, each with the mitigation already built.
  s.addShape('roundRect', { x: 6.3, y: 3.76, w: 6.53, h: 2.22, fill: { color: B.amberTint }, line: { color: AMBER, width: 1 }, rectRadius: 0.09 });
  s.addImage({ data: I.warn, x: 6.5, y: 3.85, w: 0.2, h: 0.2 });
  s.addText('THE FOUR OBJECTIONS — AND WHAT IS ALREADY BUILT FOR THEM', { x: 6.78, y: 3.84, w: 5.9, h: 0.22, fontFace: 'Calibri', fontSize: 8.2, bold: true, color: AMBER, charSpacing: 0.4, margin: 0 });
  [
    ['“It will be wrong on parts it has not seen.”', 'Every actual is logged; after 3 per commodity the band is corrected. 6 real parts pinned so far — none yet checked against a JLR price.'],
    ['“The AI is inventing numbers.”', 'AI is switched off at JLR, and even when on it never sets a price. Every cost line prints its own derivation.'],
    ['“Rates go stale and nobody notices.”', 'The engine blocks a duty rate that is unverified or over 90 days old rather than quietly using it. The refresh gets a named owner in the pilot.'],
    ['“Engineering will read it as criticism.”', 'Already changed: the output is savings ranked by category, with no score and no severity anywhere an engineer sees.'],
  ].forEach(([q, a], i) => {
    const y = 4.10 + i * 0.46;
    s.addText(q, { x: 6.5, y, w: 2.55, h: 0.44, fontFace: 'Calibri', fontSize: 7.6, bold: true, italic: true, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(a, { x: 9.15, y, w: 3.5, h: 0.44, fontFace: 'Calibri', fontSize: 7.5, color: SLATE, margin: 0, valign: 'middle' });
  });

  // The close.
  s.addShape('roundRect', { x: 0.5, y: 6.10, w: 12.33, h: 0.86, fill: { color: NAVY }, rectRadius: 0.1 });
  s.addText([
    { text: 'The decision on the table:  ', options: { bold: true, color: '9FB6E0', fontSize: 12.0 } },
    { text: '≈£25k and 90 days to find out whether a tool that is already built, with six real parts pinned, holds up on forty of ours. If it misses the criteria we stop and nothing recurring has been committed. If it meets them, the £25k is covered at a 1.6% capture rate.', options: { color: 'FFFFFF', fontSize: 11.5 } },
  ], { x: 0.85, y: 6.14, w: 11.65, h: 0.78, fontFace: 'Calibri', margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'This is the ask. One specific, small, time-boxed decision. ' +
    'Approve a ninety-day pilot on forty parts. One named owner, about a third of an engineer, one laptop or virtual machine, roughly twenty-five thousand pounds one-off. No licence, no per-seat cost, and no per-estimate cost, because with AI off there is nothing to pay for per run. Nothing recurring is committed until day ninety. ' +
    'Scope. Forty live parts across four or five commodities we already buy, chosen with purchasing. A mix of parts already quoted and parts still in design, so we test both value streams. Out of scope: no supplier is told a number came from a tool, and an engineer owns every figure before it leaves the building. ' +
    'Three phases. Set up: install the Windows package, load our own rates through the Rate Converter workbook, re-run the six baseline parts, train two engineers. Run the basket, logging every quote or PO price as an actual. Then measure and decide. ' +
    'The criteria on the right are the part I would most like you to hold me to, and I want them agreed today. If we miss them, stopping is the right answer. ' +
    'The amber box lists the objections I expect, with what is already built for each. The honest one: six real parts are pinned, but none has yet been checked against a price JLR paid. The pilot is how we find out.'
  );
}

/** Full-bleed part illustration + spec column. */
function partSlide(img, kicker, name, sub, tint, specs, note, notes) {
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, kicker, sub, tint);
  s.addImage({ path: img, x: 0.45, y: 1.24, w: 7.9, h: 4.42 });
  s.addShape('roundRect', { x: 8.55, y: 1.24, w: 4.28, h: 4.42, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText(name, { x: 8.8, y: 1.36, w: 3.8, h: 0.5, fontFace: 'Calibri', fontSize: 13.0, bold: true, color: tint, margin: 0, valign: 'middle' });
  s.addText('THE WORKED-EXAMPLE INPUTS', { x: 8.8, y: 1.92, w: 3.8, h: 0.22, fontFace: 'Calibri', fontSize: 8.6, bold: true, color: MUTED, charSpacing: 0.6, margin: 0 });
  specs.forEach(([k, v], i) => {
    const y = 2.2 + i * 0.30;
    if (i % 2 === 0) s.addShape('rect', { x: 8.7, y: y - 0.02, w: 3.98, h: 0.28, fill: { color: PAGE } });
    s.addText(k, { x: 8.8, y, w: 2.35, h: 0.32, fontFace: 'Calibri', fontSize: 9.6, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(v, { x: 11.15, y, w: 1.45, h: 0.32, fontFace: 'Calibri', fontSize: 10.0, bold: true, color: NAVY, align: 'right', margin: 0, valign: 'middle' });
  });
  s.addText(note, { x: 8.8, y: 2.2 + specs.length * 0.30 + 0.2, w: 3.8, h: 0.55, fontFace: 'Calibri', fontSize: 9.5, italic: true, color: SLATE, margin: 0, valign: 'top' });
  s.addText('Illustration of the worked-example part. The costs that follow are engine output from these inputs.',
    { x: 0.5, y: 5.76, w: 7.8, h: 0.24, fontFace: 'Calibri', fontSize: 8.4, italic: true, color: MUTED, margin: 0 });
  footer(s, ++PG);
  s.addNotes(notes);
}

divider('SECTION TWO', 'A Die-Cast Aluminium Housing', 'One worked example, followed through all twelve stages', TEAL,
  ['What the geometry kernel measures, and what it asks the engineer',
   'Four automatic guards, and the autocorrect when an input disagrees with geometry',
   'The press chosen by physics; every cutting minute derived from a feature',
   'Eight buckets, twenty countries, an honest range — and a person signing it off'], '22',
  'That is the orientation done. Now I want to slow right down and take one part through all twelve stages. The only fair way to judge a costing tool is to watch it work on something concrete. ' +
  'This is a die-cast aluminium housing. It is a worked example: the inputs are the kind the kernel measures from a STEP file, and every pound you will see is real engine output from those inputs. I re-ran it against today\u2019s engine and rate library before this session, and the figures still match. ' +
  'Over the next slides you will see what the kernel measures, and what the tool asks the engineer because geometry cannot decide it. Then the four automatic guards, and what happens when an input disagrees with the geometry. Then how the press is chosen by physics, where every cutting minute comes from, and the eight buckets, the country comparison, the confidence band and the sign-off. ' +
  'In the JLR build the AI is switched off, so wherever I mention it, I am describing an optional mode, not what you will see on your laptop. ' +
  'If you take one slide from this section, take the calculation slide. You can check it with a calculator while I talk.');

partSlide('assets/workflow-deck/part-housing.png',
  'The Part We Are Costing', 'Die-cast aluminium housing',
  'One worked-example component, followed from CAD file to defensible price', BLUE,
  [['Finished weight', '2.8 kg'], ['Poured weight', '4.83 kg'], ['Wall thickness', '≈ 3.0 mm'],
   ['Projected shadow', '1,650 cm²'], ['Precision bores', '2 × Ø40'], ['Tapped holes', '16 × M8'],
   ['Machined faces', '2'], ['Annual volume', '60,000'], ['Made in', 'China']],
  'Size, walls and features are what the kernel measures on a STEP file. Volume and region are typed.',
  'This is the part. A die-cast aluminium housing, the sort of thing that sits on an engine or a gearbox, and that we buy in tens of thousands a year. ' +
  'Two point eight kilos finished. Walls about three millimetres. Two precision bores that need reaming. Sixteen holes to drill and tap. Two faces machined flat, because something bolts to them. And a projected shadow of sixteen hundred and fifty square centimetres, which will decide the press size. ' +
  'I want to be precise about where these numbers come from. This is a worked example. On a real STEP file, the size, the walls, the holes and the faces are what the kernel measures. The annual volume and the country are typed by the engineer, because no drawing can tell you those. The poured weight is derived from the finished weight and a casting yield. ' +
  'Every cost on the following slides is what the engine produces from these inputs today. We keep a script that re-runs this example and fails loudly if a rate or a module moves, so the deck cannot quietly drift away from the tool. ' +
  'The picture is an illustration of the part, not a photograph or a screenshot.');

// ══════════ 3 · THE PART + THE JOURNEY ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'The Part, and the Journey It Takes', 'One housing, twelve stages, five owners');

  s.addShape('roundRect', { x: 0.5, y: 1.28, w: 12.33, h: 1.15, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addShape('ellipse', { x: 0.72, y: 1.5, w: 0.7, h: 0.7, fill: { color: NAVY } });
  s.addImage({ data: I.cube, x: 0.9, y: 1.68, w: 0.34, h: 0.34 });
  s.addText('Die-cast aluminium housing — cast in a steel mould, then machine-finished', {
    x: 1.6, y: 1.42, w: 11, h: 0.34, fontFace: 'Calibri', fontSize: 16.0, bold: true, color: NAVY, margin: 0 });
  const chips = ['2.8 kg finished', '~3 mm walls', '2 precision bores', '16 holes to thread', '2 machined faces', '60,000 a year', 'Made in China'];
  chips.forEach((c, i) => {
    const x = 1.6 + (i % 7) * 1.58;
    s.addShape('roundRect', { x, y: 1.85, w: 1.5, h: 0.32, fill: { color: BLUE_T }, line: { color: LINE, width: 0.75 }, rectRadius: 0.16 });
    s.addText(c, { x, y: 1.85, w: 1.5, h: 0.32, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: NAVY, align: 'center', valign: 'middle', margin: 0 });
  });

  const phases = [
    [BLUE, BLUE_T, 'MEASURE', 'Ruler', ['1 · Upload the file', '2 · Measure the geometry', '3 · Sense-check the shape'], 'Facts, not opinions'],
    [PURPLE, PURPLE_T, 'ASK', 'Engineer · AI off at JLR', ['4 · The tool asks what', '   geometry cannot decide', '   material · route · volume'], 'Asked, never guessed'],
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
    s.addText(tag, { x: x + 0.14, y: y + h - 0.42, w: pw - 0.28, h: 0.32, fontFace: 'Calibri', fontSize: 9.0, bold: true, italic: true, color: col, align: 'center', margin: 0 });
  });

  s.addShape('roundRect', { x: 0.5, y: 5.45, w: 12.33, h: 1.15, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('Notice the proportions', { x: 0.8, y: 5.58, w: 5, h: 0.28, fontFace: 'Calibri', fontSize: 12.0, bold: true, color: NAVY, margin: 0 });
  s.addText([
    { text: 'Only one of the twelve stages could ever involve AI — and at JLR it is off. ', options: { bold: true, color: PURPLE } },
    { text: 'Three stages measure, one asks the engineer, two are automatic checks, four are arithmetic, two are review and sign-off. Even when AI is on, it is the smallest part of the tool.', options: { color: SLATE } },
  ], { x: 0.8, y: 5.86, w: 11.75, h: 0.7, fontFace: 'Calibri', fontSize: 12.0, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'Here is the part, and the map of where we are going. Two point eight kilos finished, walls about three millimetres, two precision bores, sixteen holes to drill and tap, two faces to machine flat. Sixty thousand a year, and we are looking at making it in China. ' +
    'Underneath are the five phases. Blue, the tool measures the part. Purple, it asks the engineer what geometry cannot decide: the material family, the process route where there is a real choice, the volume and the region. In the JLR build this is always the engineer, because AI is switched off. Amber, four automatic safety checks. Teal, the engine calculates. Green, a person checks the range and signs it off. ' +
    'Look at the box at the bottom, because it answers the question I was asked most last time: how much of this is AI? At most one stage of twelve could ever involve it, and at JLR it is off. Three stages measure, one asks, two check, four calculate and two are review. ' +
    'That is deliberate. We did not build an AI tool and bolt costing onto it. We built a costing engine. The AI, when it is switched on, is a small, bounded helper that can read and classify. It never sets a price. Everything else is engineering you can audit.'
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
  s.addText('• How many per year — 60,000\n• Where we plan to make it — China', { x: 0.85, y: 2.68, w: 3, h: 0.6, fontFace: 'Calibri', fontSize: 11.0, bold: true, color: NAVY, margin: 0, valign: 'top' });
  s.addText('These drive tooling spread and labour rates.', { x: 0.75, y: 3.32, w: 3, h: 0.4, fontFace: 'Calibri', fontSize: 9.5, italic: true, color: MUTED, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 4.2, y: 1.32, w: 5.0, h: 2.5, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addShape('ellipse', { x: 4.45, y: 1.52, w: 0.5, h: 0.5, fill: { color: BLUE } });
  s.addImage({ data: I.ruler, x: 4.57, y: 1.64, w: 0.26, h: 0.26 });
  s.addText('2 · The kernel measures it', { x: 5.1, y: 1.55, w: 3.8, h: 0.3, fontFace: 'Calibri', fontSize: 12.5, bold: true, color: BLUE, margin: 0, valign: 'middle' });
  const meas = [['Solid volume (exact)', '1,037 cm³'], ['Weight if aluminium', '2.80 kg'], ['Wall thickness', '≈ 3 mm'], ['Precision bores / holes', '2 / 16'], ['Faces to machine flat', '2']];
  meas.forEach(([k, v], i) => {
    const y = 2.06 + i * 0.33;
    s.addText(k, { x: 4.45, y, w: 3.2, h: 0.3, fontFace: 'Calibri', fontSize: 11.0, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(v, { x: 7.6, y, w: 1.4, h: 0.3, fontFace: 'Calibri', fontSize: 11.5, bold: true, color: NAVY, align: 'right', margin: 0, valign: 'middle' });
  });

  s.addShape('roundRect', { x: 9.4, y: 1.32, w: 3.43, h: 2.5, fill: { color: BLUE_T }, line: { color: BLUE, width: 1.25 }, rectRadius: 0.1 });
  s.addText('WHY THIS MATTERS', { x: 9.65, y: 1.5, w: 3, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: BLUE, charSpacing: 1, margin: 0 });
  s.addText('On a STEP file nobody types these numbers, and nobody estimates them.\n\nThe kernel measures VOLUME. It cannot know the weight until the material is named — so it gives a weight for each candidate density and waits.', {
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
    { text: 'Where is the AI?  Nowhere. ', options: { bold: true, color: PURPLE } },
    { text: 'At JLR it is switched off. Even when it is on, the measurements come first, so anything it says can be checked against an independent set of facts.', options: { color: SLATE } },
  ], { x: 0.8, y: 5.83, w: 11.75, h: 0.7, fontFace: 'Calibri', fontSize: 12.0, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'Stage one. The engineer uploads the CAD file: STEP, IGES or STL. They also type two things no drawing can tell us: how many a year, and where we plan to make it. Those matter a lot. Volume decides how thinly the tooling is spread. Location decides which labour and machine rates apply. ' +
    'Stage two is measuring. The geometry kernel opens the model and measures it like a very precise digital ruler. On this part, the solid volume is about a thousand and thirty-seven cubic centimetres. It does not give one weight, because weight needs a density. So it gives a weight for each candidate material. On aluminium, that is two point eight kilos. It finds the walls, the bores, the holes and the faces to machine. ' +
    'One limit to know. An STL file is only a mesh of triangles. It has no feature table, so a machined STL arrives with no cycle time. The tool will not cost it until the engineer types one in. ' +
    'Stage three is a small check with a big effect: is the part hollow or solid? Thin walls around an enclosed space mean a casting, so the machines only finish surfaces. If the tool thought it was a solid block, it would price carving the whole shape from metal, and the answer would be roughly double. ' +
    'And the AI? It is not involved. At JLR it is off. The facts exist first, from measurement.'
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
  ], { x: 0.75, y: 1.76, w: 5.6, h: 1.0, fontFace: 'Calibri', fontSize: 11.0, margin: 0, valign: 'top' });
  s.addText('CostVision uses Open CASCADE (OCCT), driven from Python through the OCP bindings.',
    { x: 0.75, y: 2.82, w: 5.6, h: 0.34, fontFace: 'Calibri', fontSize: 11.0, bold: true, color: BLUE, margin: 0, valign: 'top' });
  s.addText('Reads STEP and IGES — the neutral formats every OEM and supplier already exchanges. STL meshes take a separate, simpler path.',
    { x: 0.75, y: 3.2, w: 5.6, h: 0.55, fontFace: 'Calibri', fontSize: 10.0, italic: true, color: MUTED, margin: 0, valign: 'top' });

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
    s.addText(l, { x: 9.6, y, w: 1.85, h: 0.3, fontFace: 'Calibri', fontSize: 10.0, color: BLUE, bold: true, margin: 0, valign: 'middle' });
    s.addText(w, { x: 11.45, y, w: 1.3, h: 0.3, fontFace: 'Calibri', fontSize: 9.0, italic: true, color: MUTED, margin: 0, valign: 'middle' });
  });
  s.addText([
    { text: 'No per-seat CAD licence, no vendor lock-in, and no third party ever sees the model. ', options: { bold: true, color: NAVY } },
    { text: 'The kernel runs as a local process on the laptop or your own server — the CAD file is measured where it sits.', options: { color: SLATE } },
  ], { x: 7.1, y: 3.15, w: 5.5, h: 0.65, fontFace: 'Calibri', fontSize: 10.5, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 4.12, w: 12.33, h: 1.62, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('HOW IT ACTUALLY MEASURES — four things, no estimation anywhere', { x: 0.8, y: 4.24, w: 11, h: 0.28, fontFace: 'Calibri', fontSize: 12.0, bold: true, color: NAVY, margin: 0 });
  const how = [
    ['Volume & mass', 'Integrates the solid exactly, then publishes a weight for every candidate density — aluminium, steel, plastic, iron, copper, titanium.'],
    ['Holes & bosses', 'Walks every cylindrical face: diameter from the exact radius, depth from the surface parameter span, through-vs-blind by comparing depth to the bounding box.'],
    ['Wall thickness', 'Ray-casts inside the solid to find how thick each wall really is — this is what tells casting from machining.'],
    ['Faces & pockets', 'Classifies every face by surface type, so flats to be milled are counted, not guessed.'],
  ];
  how.forEach(([h, t], i) => {
    const x = 0.8 + (i % 4) * 3.05;
    s.addText(h, { x, y: 4.6, w: 2.85, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: BLUE, margin: 0 });
    s.addText(t, { x, y: 4.86, w: 2.85, h: 0.8, fontFace: 'Calibri', fontSize: 9.0, color: SLATE, margin: 0, valign: 'top' });
  });

  s.addShape('roundRect', { x: 0.5, y: 5.92, w: 12.33, h: 0.95, fill: { color: BLUE_T }, line: { color: BLUE, width: 1 }, rectRadius: 0.1 });
  s.addText([
    { text: 'The honest limitation: ', options: { bold: true, color: NAVY } },
    { text: 'the kernel is exact about what IS in the model, and silent about what is not. It cannot read a tolerance, a surface finish or a material callout unless the CAD file carries it — those still come from the drawing or from our engineer. It measures; it does not interpret.', options: { color: SLATE } },
  ], { x: 0.8, y: 6.04, w: 11.75, h: 0.75, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'I was asked what the geometry kernel actually is, so here is a proper answer. ' +
    'A geometry kernel is the maths engine that understands solid shapes. It is the same kind of software that sits under CATIA, SolidWorks and NX. Ours is Open CASCADE, usually called OCCT. We drive it from Python through its bindings, called OCP. ' +
    'The key point is that it reads real geometry, not a picture of it. A STEP file describes a cylinder as a true cylinder with a radius and an axis. A mesh file only has triangles that look round. That is why an STL gets a simpler path, with no feature table. ' +
    'Is it open source? Yes. OCCT is LGPL 2.1 with an exception that allows commercial use. OCP is Apache 2.0. The 3D viewer is three.js, which is MIT. ' +
    'In practice that means no per-seat CAD licence and no vendor who can change the terms. And no third party sees the model, because the kernel runs on the laptop or your own server. In the Windows package it ships inside the folder, with its own embedded Python. ' +
    'How does it measure? It integrates the solid for an exact volume. It walks every cylindrical face to build the hole table. It casts rays inside the solid to find true wall thickness. And it classifies every face, so the flats to be milled are counted. ' +
    'The limit: it is exact about what is in the model and silent about what is not. It cannot read a tolerance, a surface finish or a material callout unless the file carries it.'
  );
}

// ══════════ 5 · AI READS ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Stage 4 · The Tool Asks, the Engineer Answers', 'Where geometry cannot decide, the tool asks rather than guesses — AI is switched off at JLR', PURPLE);
  owner(s, 10.3, 0.74, 'OWNER: THE ENGINEER', PURPLE, PURPLE_T);

  s.addShape('roundRect', { x: 0.5, y: 1.3, w: 6.0, h: 2.75, fill: { color: PURPLE_T }, line: { color: PURPLE, width: 1.25 }, rectRadius: 0.1 });
  s.addText('WHAT THE ENGINEER IS ASKED', { x: 0.75, y: 1.45, w: 5, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: PURPLE, charSpacing: 1, margin: 0 });
  s.addText('Only what the geometry cannot settle. The tool will not cost the part until each question is answered — no silent guess. Typical questions on a part like this, with the engineer\u2019s answers:',
    { x: 0.75, y: 1.76, w: 5.5, h: 0.7, fontFace: 'Calibri', fontSize: 11.0, color: SLATE, margin: 0, valign: 'top' });
  s.addText('THE ANSWERS', { x: 0.75, y: 2.48, w: 5, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: PURPLE, charSpacing: 1, margin: 0 });
  const says = [['Material family', 'Aluminium die-casting alloy'], ['Process route', 'High-pressure die cast'], ['Then what', 'Machine-finished on a cutting machine'], ['Volume · region', '60,000 a year · China']];
  says.forEach(([k, v], i) => {
    const y = 2.8 + i * 0.3;
    s.addText(k, { x: 0.85, y, w: 1.8, h: 0.28, fontFace: 'Calibri', fontSize: 10.0, color: MUTED, margin: 0, valign: 'middle' });
    s.addText(v, { x: 2.7, y, w: 3.6, h: 0.28, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, margin: 0, valign: 'middle' });
  });

  s.addShape('roundRect', { x: 6.75, y: 1.3, w: 6.08, h: 2.92, fill: { color: CARD }, line: { color: RED, width: 1.5 }, rectRadius: 0.1 });
  s.addText('IF AI IS EVER SWITCHED ON, IT CANNOT', { x: 7.0, y: 1.45, w: 5, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: RED, charSpacing: 1, margin: 0 });
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
  s.addText('If AI is switched on later, it reads — it never prices', {
    x: 0.8, y: 4.42, w: 11, h: 0.3, fontFace: 'Calibri', fontSize: 12.5, bold: true, color: NAVY, margin: 0 });
  s.addText([
    { text: 'It could offer a first answer to these questions, with a confidence score. Below 50% a flag stays on the result until a person clears it. Every AI route is rate-limited per user. ', options: { color: SLATE } },
    { text: 'Its answers arrive as editable pre-fills, and an engineer\u2019s entry always wins.', options: { bold: true, color: NAVY } },
  ], { x: 0.8, y: 4.75, w: 11.75, h: 0.72, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 5.7, w: 12.33, h: 0.9, fill: { color: GREEN_T }, line: { color: GREEN, width: 1 }, rectRadius: 0.1 });
  s.addText([
    { text: 'In plain terms: ', options: { bold: true, color: GREEN } },
    { text: 'at JLR this stage is the engineer answering a few questions. It takes a minute, and it means nothing is guessed. If AI is ever switched on, it would only offer a first answer for the engineer to accept or change.', options: { color: SLATE } },
  ], { x: 0.8, y: 5.83, w: 11.75, h: 0.7, fontFace: 'Calibri', fontSize: 12.0, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'Stage four. This used to be the AI slide. At JLR it is the engineer\u2019s slide, because the AI is switched off. ' +
    'Here is what happens. The kernel has measured the part and the rules have derived what they can. Some things geometry cannot settle. What material family is it? Where more than one process could make it, which route? How many a year, and where? The tool asks those questions instead of guessing, and it will not cost the part until each one is answered. ' +
    'There is one routing rule worth knowing. A part with thick, sparse walls, over about six millimetres, is only offered casting, forging, cast plus machine or machining. Never sheet metal or moulding. So the question itself is already sensible. ' +
    'For this housing, the engineer answers: aluminium die-casting alloy, high-pressure die cast, then machined, sixty thousand a year, China. ' +
    'On the right is what the AI cannot do, even if it is switched on one day. It cannot set a price, change a measurement, choose the machine or cycle time, touch the rate library, override a safety check, or overrule the engineer. These are enforced in code. ' +
    'If it were on, it could offer a first answer to the questions, with a confidence score, as an editable pre-fill. The engineer\u2019s entry always wins. That is all.'
  );
}

// ══════════ 6 · GUARDRAILS / AUTOCORRECT ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Stages 5–6 · The Safety Checks — and Autocorrect', 'Four checks ran on this part before a single pound was calculated', AMBER);
  owner(s, 10.3, 0.74, 'OWNER: THE ENGINE', AMBER, AMBER_T);

  const guards = [
    ['1 · Buy the metal you actually pour',
      'Naive view: buy 2.8 kg — the part weight.',
      'Corrected to 4.83 kg. To sell a 2.8 kg casting the supplier pours 4.83 kg; the rest runs down the feed channels and is recycled at scrap value.',
      'The single most common casting cost error.'],
    ['2 · Machining is finishing, not carving',
      'Naive view: machine the shape out of metal.',
      'Capped to a finish envelope: 0.10 hr setup + 0.07 hr/kg. For 2.8 kg that is a 0.30 hr ceiling; this part\'s 0.27 hr of cutting sits just inside it.',
      'Prevents roughly doubling the cost.'],
    ['3 · Use a real die-casting alloy',
      'Naive view: a generic or wrought aluminium grade.',
      'Redirected to a genuine die-casting alloy. A machined face can tempt a quick read toward "machined from solid billet" — the guard keeps casting as the primary process.',
      'Wrong alloy = wrong price per kilo.'],
    ['4 · Size the machine to the part',
      'Naive view: use a default press.',
      'Sized to 1,600 t off the ladder 160 / 500 / 800 / 1,600 / 6,100 / 9,000 t — the smallest press that clamps the part, at £137.55/hr.',
      'Explained in full on the next slide.'],
  ];
  guards.forEach(([h, before, after, why], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.5 + col * 6.33, y = 1.3 + row * 1.72, w = 6.0, hh = 1.55;
    s.addShape('roundRect', { x, y, w, h: hh, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
    s.addText(h, { x: x + 0.22, y: y + 0.09, w: w - 0.4, h: 0.28, fontFace: 'Calibri', fontSize: 12.0, bold: true, color: AMBER, margin: 0 });
    s.addText([{ text: '×  ', options: { color: RED, bold: true } }, { text: before, options: { color: MUTED, italic: true } }],
      { x: x + 0.22, y: y + 0.4, w: w - 0.4, h: 0.24, fontFace: 'Calibri', fontSize: 9.8, margin: 0, valign: 'middle' });
    s.addText([{ text: '→  ', options: { color: GREEN, bold: true } }, { text: after, options: { color: SLATE } }],
      { x: x + 0.22, y: y + 0.65, w: w - 0.42, h: 0.62, fontFace: 'Calibri', fontSize: 9.8, margin: 0, valign: 'top' });
    s.addText(why, { x: x + 0.22, y: y + hh - 0.32, w: w - 0.4, h: 0.26, fontFace: 'Calibri', fontSize: 9.0, bold: true, italic: true, color: AMBER, margin: 0 });
  });

  s.addShape('roundRect', { x: 0.5, y: 4.82, w: 12.33, h: 1.05, fill: { color: AMBER_T }, line: { color: AMBER, width: 1.25 }, rectRadius: 0.1 });
  s.addImage({ data: I.warn, x: 0.78, y: 5.09, w: 0.3, h: 0.3 });
  s.addText([
    { text: 'This is the autocorrect. ', options: { bold: true, color: NAVY } },
    { text: 'When an input and the measurements disagree, ', options: { color: SLATE } },
    { text: 'the measurements win — automatically, every time. ', options: { bold: true, color: NAVY } },
    { text: 'The tool corrects the input, records what it changed and why, and shows the engineer. It never proceeds silently.', options: { color: SLATE } },
  ], { x: 1.2, y: 4.95, w: 11.4, h: 0.85, fontFace: 'Calibri', fontSize: 12.0, margin: 0, valign: 'middle' });

  s.addShape('roundRect', { x: 0.5, y: 6.02, w: 12.33, h: 0.85, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText([
    { text: 'Why four checks and not one?  ', options: { bold: true, color: NAVY } },
    { text: 'Because a cast-and-machined part has four distinct ways of going wrong. Each guard is written for one specific, known failure — they are not a generic "sanity check", they are four separate lessons from real costing mistakes.', options: { color: SLATE } },
  ], { x: 0.8, y: 6.14, w: 11.75, h: 0.65, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'This slide answers the question: what if an input is wrong? The tool assumes it might be, and checks. Four checks ran on this part before a single pound was calculated. ' +
    'Check one. To sell us a two point eight kilo casting, the supplier pours four point eight three kilos. The rest runs down the feed channels and is recycled at scrap value. If you cost only the part weight, you understate the metal badly. It is the most common casting cost error, and the tool cannot make it. ' +
    'Check two. On a casting, the bores and holes are already cast in. The cutter takes a thin skim. So the guard caps machining time to a finishing envelope: a tenth of an hour plus nought point nought seven hours per kilo. For this part that ceiling is about eighteen minutes. ' +
    'Check three. A machined face can tempt a quick read towards machined from solid. The guard keeps casting as the main process, with a real die-casting alloy, because alloys have different prices per kilo. ' +
    'Check four is machine sizing, which gets its own slide next. ' +
    'The amber box is the autocorrect. When an input disagrees with the measurements, the measurements win. The tool corrects it, records what changed and why, and shows the engineer. It never carries on silently. ' +
    'Each guard exists because of a specific costing mistake. They are lessons, not decoration.'
  );
}

// ══════════ 7 · PROCESS & MACHINE SELECTION ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Stage 7 · Choosing the Process and the Machine', 'Why die casting, why a 1,600-tonne press — and what happens if the engineer disagrees', TEAL);
  owner(s, 10.3, 0.74, 'OWNER: THE ENGINE', TEAL, TEAL_T);

  s.addShape('roundRect', { x: 0.5, y: 1.3, w: 6.0, h: 2.5, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('A · Why this process, not another', { x: 0.75, y: 1.44, w: 5.5, h: 0.3, fontFace: 'Calibri', fontSize: 13.0, bold: true, color: TEAL, margin: 0 });
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
    s.addText(tag, { x: 0.75, y, w: 0.72, h: 0.3, fontFace: 'Calibri', fontSize: 7.5, bold: true, color: col, align: 'center', valign: 'middle', margin: 0 });
    s.addText(name, { x: 1.58, y, w: 2.3, h: 0.3, fontFace: 'Calibri', fontSize: 10.0, bold: tag === 'CHOSEN', color: tag === 'CHOSEN' ? NAVY : MUTED, margin: 0, valign: 'middle' });
    s.addText(why, { x: 3.9, y, w: 2.5, h: 0.3, fontFace: 'Calibri', fontSize: 8.8, italic: true, color: MUTED, margin: 0, valign: 'middle' });
  });

  s.addShape('roundRect', { x: 6.75, y: 1.3, w: 6.08, h: 2.5, fill: { color: TEAL_T }, line: { color: TEAL, width: 1.25 }, rectRadius: 0.1 });
  s.addText('B · Why a 1,600-tonne press', { x: 7.0, y: 1.44, w: 5.5, h: 0.3, fontFace: 'Calibri', fontSize: 13.0, bold: true, color: TEAL, margin: 0 });
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
    s.addText(t, { x: 7.05, y, w: 4.1, h: 0.3, fontFace: 'Calibri', fontSize: 10.0, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(v, { x: 11.2, y, w: 1.45, h: 0.3, fontFace: 'Calibri', fontSize: 9.5, bold: true, color: i === 3 ? NAVY : MUTED, align: 'right', margin: 0, valign: 'middle' });
  });

  s.addShape('roundRect', { x: 0.5, y: 4.02, w: 12.33, h: 1.35, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('Why the machine choice is a money decision, not a technicality', { x: 0.8, y: 4.15, w: 11, h: 0.3, fontFace: 'Calibri', fontSize: 12.5, bold: true, color: NAVY, margin: 0 });
  s.addText([
    { text: 'Every machine in the library carries its own hourly rate — a bigger press costs more per hour to own and run. ', options: { color: SLATE } },
    { text: 'Pick a press that is too big and you overstate the cost; too small and the part physically cannot be made. ', options: { bold: true, color: NAVY } },
    { text: 'So the engine sizes the machine rather than accepting a default. Enter a process or machine yourself and it is respected: the engine prices its own choice alongside as a lever, and the self-audit flags a wrong-sized machine with the £/part difference.', options: { color: SLATE } },
  ], { x: 0.8, y: 4.48, w: 11.75, h: 0.82, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 5.58, w: 12.33, h: 1.05, fill: { color: PURPLE_T }, line: { color: PURPLE, width: 1 }, rectRadius: 0.1 });
  s.addText([
    { text: 'Who decided all this?  ', options: { bold: true, color: PURPLE } },
    { text: 'The rules engine, with no AI call: ', options: { bold: true, color: TEAL } },
    { text: 'it tested the shape against each process\u2019s physics, rejected the alternatives, and sized the press by calculation. ', options: { color: SLATE } },
    { text: 'The engineer confirmed the route. ', options: { bold: true, color: PURPLE } },
    { text: 'A pinned engineer choice always wins. ', options: { bold: true, color: NAVY } },
    { text: 'And if anyone had said "sand casting", the 3 mm walls would have argued back with the physics.', options: { color: SLATE } },
  ], { x: 0.8, y: 5.7, w: 11.75, h: 0.85, fontFace: 'Calibri', fontSize: 11.0, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'Now we are into the engine. Two questions get answered here: which process, and which machine. Hold on to one idea: every answer on this slide is a default, and the engineer can override it. ' +
    'First, the process. The rules test the measured shape against what each process can physically do. Three millimetre walls, a hollow shape, sixty thousand a year: that points firmly at high-pressure die casting. Sand casting cannot hold three millimetre walls at that speed. Machining from solid would cut away about eighty percent of the metal. Gravity die casting struggles to fill walls that thin. The engineer confirmed the route when asked. ' +
    'Second, the press. Molten aluminium under pressure tries to push the die halves apart. So the engine takes the measured shadow area, multiplies by the cavity pressure, adds a safety margin, and picks the smallest press in the library that can clamp it: sixteen hundred tonnes. The smallest press that works is also the cheapest per hour, so sizing it correctly is the cost optimisation. ' +
    'Third, the engineer outranks the tool wherever they have entered something. Pin the process and it stays pinned. Pick a different machine and the tool keeps it, prices its own choice alongside as a negotiation lever, and the self-audit flags a machine that is too big or too small, with the pounds per part. Enter a toolmaker quote and it overrides every tooling estimate. ' +
    'No AI was involved in any of this.'
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
  s.addText('Then the ladder — smallest machine that covers it', { x: x + 0.25, y: ly, w: w - 0.5, h: 0.24, fontFace: 'Calibri', fontSize: 9.0, bold: true, italic: true, color: MUTED, margin: 0 });
  rows.forEach(([t, r, v], i) => {
    const yy = ly + 0.26 + i * 0.31;
    const on = v === 'CHOSEN';
    if (on) s.addShape('roundRect', { x: x + 0.2, y: yy - 0.03, w: w - 0.42, h: 0.33, fill: { color: 'FFFFFF' }, line: { color: TEAL, width: 1.25 }, rectRadius: 0.06 });
    s.addText(t, { x: x + 0.38, y: yy, w: 1.2, h: 0.28, fontFace: 'Calibri', fontSize: 10.0, bold: on, color: on ? NAVY : SLATE, margin: 0, valign: 'middle' });
    s.addText(r, { x: x + 1.6, y: yy, w: 1.4, h: 0.28, fontFace: 'Calibri', fontSize: 10.0, bold: on, color: on ? NAVY : SLATE, align: 'right', margin: 0, valign: 'middle' });
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
    'The CAD rules path sizes by mass instead; the self-audit flags a wrong size.');

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
    'I was asked to show the calculation rather than assert it. So this is the arithmetic behind the two numbers that matter most on a casting: which press, and how many minutes of cutting. ' +
    'Left side, the press. The projected shadow is sixteen hundred and fifty square centimetres. Aluminium high-pressure die casting runs at about seventy megapascals in the cavity. Multiply them and you get about eleven hundred and seventy-eight tonnes trying to open the die. The engine adds a twenty percent safety factor, so we need about fourteen hundred tonnes. It walks the ladder and takes the smallest press that covers it: sixteen hundred tonnes, at a hundred and thirty-seven pounds fifty-five an hour. ' +
    'One honest detail. That is how the form sizes the press. On the CAD rules path, where no shadow area is passed in yet, the rules size the press from part mass, which can pick a smaller machine. The self-audit flags a machine that is the wrong size, so check the press the trace shows. ' +
    'Right side, the cutting minutes. Each feature gets its own time from a shop formula: the two faces, the two bores, the sixteen blind holes. Add a thirty percent uplift for the reamed bores, and the geometry proposes about twenty-eight minutes. ' +
    'Then the guard. A two point eight kilo casting should not need more than about seventeen point eight minutes of finishing, so the guard caps it. The routing we costed is fifteen point nine minutes, inside both. ' +
    'Three numbers bounding each other. When they agree, the number stands. When they disagree badly, you find out before the meeting.'
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
  s.addText('Machine £ = £/hr x charged time.  Labour £ = cycle ÷ 0.9 labour efficiency x 0.5 operators x grade rate.',
    { x: 0.75, y: 4.4, w: 8.3, h: 0.3, fontFace: 'Calibri', fontSize: 9.2, italic: true, color: MUTED, margin: 0 });

  s.addShape('roundRect', { x: 9.45, y: 1.28, w: 3.38, h: 3.5, fill: { color: TEAL_T }, line: { color: TEAL, width: 1.25 }, rectRadius: 0.1 });
  s.addText('HOW A CYCLE TIME IS BUILT', { x: 9.68, y: 1.4, w: 3, h: 0.26, fontFace: 'Calibri', fontSize: 10.0, bold: true, color: TEAL, charSpacing: 0.8, margin: 0 });
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
    'This is the detail people usually want and rarely get. I laid the table out so you can check any row with a calculator. ' +
    'Take the milling row. The five-axis machine costs eighty-five pounds an hour. The cut takes nought point one one of an hour. A machine is never available a hundred percent of the time, so the engine divides by the equipment effectiveness, eighty-five percent. That gives nought point one two nine four of an hour. Eighty-five pounds times that is eleven pounds. Labour is half an operator at twenty-six pounds an hour, allowing for ninety percent labour efficiency: one pound fifty-nine. Twelve fifty-nine for the operation. ' +
    'The casting shot is fifty-five seconds on the sixteen hundred tonne press, with a two percent reject allowance: two pounds sixty-eight. Boring and reaming, nine seventy-three. Drilling and tapping on a cheaper machine, three twenty-four. Leak test, deburr and wash, four pounds. Plus a small amortised setup. In total, thirty-two pounds fifty-seven at UK rates. ' +
    'Now the chart, which for me is the most useful output on this part. The casting shot, the thing everyone pictures, is two pounds sixty-eight, about eight percent of the making cost. Everything after it is ninety-two percent. ' +
    'So if you argue about the aluminium price, you are arguing about the wrong thing. The money is in cycle time. The productive conversation with this supplier is about fixturing, tool paths and seconds per operation.'
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
  s.addText('SHOULD-COST — MADE IN CHINA', { x: 8.0, y: 1.42, w: 4.6, h: 0.26, fontFace: 'Calibri', fontSize: 10.0, bold: true, color: '9FD9CF', charSpacing: 1, margin: 0 });
  s.addText('£38.55', { x: 8.0, y: 1.7, w: 4.6, h: 0.75, fontFace: 'Cambria', fontSize: 44.0, bold: true, color: 'FFFFFF', margin: 0 });
  s.addText('per part, at 60,000 a year', { x: 8.0, y: 2.5, w: 4.6, h: 0.28, fontFace: 'Calibri', fontSize: 11.0, color: 'CDEDE7', margin: 0 });

  s.addShape('roundRect', { x: 7.75, y: 3.2, w: 5.08, h: 1.68, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('THE SAME PART, PRICED ELSEWHERE', { x: 8.0, y: 3.32, w: 4.6, h: 0.26, fontFace: 'Calibri', fontSize: 10.0, bold: true, color: NAVY, charSpacing: 0.8, margin: 0 });
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
    { text: 'A stamped bracket, a moulded housing and this casting are all built the same way, so any two parts compare honestly. Overhead is a % of material + process + labour + tooling. Margin is a % of the subtotal. Each once.\n', options: { color: SLATE } },
    { text: '2.  Every figure traces back to a driver. ', options: { bold: true, color: TEAL } },
    { text: 'Material = measured weight x a published metal price. Process = calculated time x a machine rate. Change any input and you can point at exactly why the answer moved — there is no black box in the money.', options: { color: SLATE } },
  ], { x: 0.8, y: 5.52, w: 11.75, h: 1.25, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'top' });
  footer(s, ++PG);

  s.addNotes(
    'Now the money comes together. Every part the tool costs is built into the same eight buckets: material, process, labour, tooling, packaging, logistics, overhead and margin. ' +
    'For this housing made in China. Metal, costed at the poured weight and net of the scrap credit: twelve pounds eighteen. Process, the casting shot plus all the machining: fourteen thirty-four. Labour: one thirty-six. The die, spread over the volume: two seventeen. Packaging and transport: one pound seventy between them. ' +
    'Then overhead at twelve percent. It is a percentage of material, process, labour and tooling only, not of packaging and logistics. That gives three sixty-one. Margin at nine percent of the subtotal gives three eighteen. Total, thirty-eight pounds fifty-five. The tool shows the overhead base on screen, in the PDF and in the workbook, so nobody has to guess. ' +
    'Bottom right, the same part priced elsewhere. Each is a recalculation on that country\u2019s own rates. India thirty-seven seventeen, China thirty-eight fifty-five, Mexico forty forty-four, UK fifty-nine sixty. The tool prices twenty regions on every run; I have shown four. ' +
    'Notice the metal barely moves between countries. Aluminium is a world commodity. What changes is labour, machine and overhead rates, and on a machining-heavy part that is the whole gap. ' +
    'Every figure traces back to a driver and a rate. Change an input and you can point at exactly why the answer moved.'
  );
}

// ══════════ 10 · OUTPUT & HUMAN ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Stages 11–12 · Honesty, Then a Human Decides', 'The tool tells you how confident it is — and never signs its own work', GREEN);
  owner(s, 10.3, 0.74, 'OWNER: THE ENGINEER', GREEN, GREEN_T);

  s.addShape('roundRect', { x: 0.5, y: 1.3, w: 6.0, h: 2.35, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('11 · A range, not false precision', { x: 0.75, y: 1.44, w: 5.5, h: 0.3, fontFace: 'Calibri', fontSize: 13.0, bold: true, color: GREEN, margin: 0 });
  s.addText('4,000 simulated runs, varying the inputs the tool is least sure about. Tooling is varied most; overhead and margin are policy, so they follow.',
    { x: 0.75, y: 1.78, w: 5.5, h: 0.55, fontFace: 'Calibri', fontSize: 10.5, color: SLATE, margin: 0, valign: 'top' });
  // Scale: £28 .. £50 across the track, so the band and the marker sit where the numbers say.
  const TX = 0.75, TW = 5.5, LO = 28, HI = 50;
  const px = (v) => TX + ((v - LO) / (HI - LO)) * TW;
  s.addShape('roundRect', { x: TX, y: 2.46, w: TW, h: 0.34, fill: { color: B.line }, rectRadius: 0.17 });
  s.addShape('roundRect', { x: px(32.31), y: 2.46, w: px(45.38) - px(32.31), h: 0.34, fill: { color: TEAL }, rectRadius: 0.17 });
  s.addShape('rect', { x: px(38.55) - 0.028, y: 2.38, w: 0.056, h: 0.5, fill: { color: NAVY } });
  s.addText('P10  £32.31', { x: px(32.31) - 0.55, y: 2.9, w: 1.1, h: 0.24, fontFace: 'Calibri', fontSize: 9.0, color: MUTED, align: 'center', margin: 0 });
  s.addText('£38.55', { x: px(38.55) - 0.6, y: 2.9, w: 1.2, h: 0.24, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, align: 'center', margin: 0 });
  s.addText('P90  £45.38', { x: px(45.38) - 0.55, y: 2.9, w: 1.1, h: 0.24, fontFace: 'Calibri', fontSize: 9.0, color: MUTED, align: 'center', margin: 0 });
  s.addText('±17% on this part. The band widens when the tool is less certain — a machining-heavy casting carries more cycle-time risk than a simple pressing.',
    { x: 0.75, y: 3.2, w: 5.5, h: 0.42, fontFace: 'Calibri', fontSize: 9.6, italic: true, color: MUTED, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 6.75, y: 1.3, w: 6.08, h: 2.35, fill: { color: GREEN_T }, line: { color: GREEN, width: 1.25 }, rectRadius: 0.1 });
  s.addText('12 · What the engineer actually gets', { x: 7.0, y: 1.44, w: 5.5, h: 0.3, fontFace: 'Calibri', fontSize: 13.0, bold: true, color: GREEN, margin: 0 });
  const outs = [
    'The 8-bucket breakdown, with every figure traceable',
    'The operation list — what takes the time and why',
    'Every question asked, and the answer given',
    'Every autocorrection and self-audit flag, with why',
    '20-country table · Excel and PDF exports',
  ];
  outs.forEach((t, i) => {
    s.addImage({ data: I.check, x: 7.05, y: 1.86 + i * 0.34, w: 0.16, h: 0.16 });
    s.addText(t, { x: 7.32, y: 1.79 + i * 0.34, w: 5.3, h: 0.3, fontFace: 'Calibri', fontSize: 10.8, color: SLATE, margin: 0, valign: 'middle' });
  });

  s.addShape('roundRect', { x: 0.5, y: 3.88, w: 12.33, h: 1.4, fill: { color: CARD }, line: { color: GREEN, width: 1.5 }, rectRadius: 0.1 });
  s.addShape('ellipse', { x: 0.78, y: 4.22, w: 0.6, h: 0.6, fill: { color: GREEN } });
  s.addImage({ data: I.person, x: 0.94, y: 4.38, w: 0.28, h: 0.28 });
  s.addText('Nothing leaves the tool unapproved', { x: 1.6, y: 4.0, w: 11, h: 0.3, fontFace: 'Calibri', fontSize: 13.0, bold: true, color: GREEN, margin: 0 });
  s.addText([
    { text: 'Every derived input arrives as an editable pre-fill — highlighted, never silently applied. ', options: { color: SLATE } },
    { text: 'Our engineer can change the material, the process, the machine, the cycle time or the rates, and the whole cost recalculates instantly. ', options: { bold: true, color: NAVY } },
    { text: 'The tool proposes. The engineer disposes. That is the last line of defence, and it is a person.', options: { color: SLATE } },
  ], { x: 1.6, y: 4.34, w: 11.0, h: 0.85, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 5.48, w: 12.33, h: 1.38, fill: { color: NAVY }, rectRadius: 0.1 });
  s.addText([
    { text: 'And if a supplier quotes £52 for this part?  ', options: { bold: true, color: '9FB6E0' } },
    { text: 'That is above the P90. Our buyer no longer has to feel it is high — they can see it, line by line, and ask the right question:  ', options: { color: 'FFFFFF' } },
    { text: '"your machining time looks about 30% above what this geometry needs — walk me through your fixturing."', options: { bold: true, italic: true, color: 'FFFFFF' } },
  ], { x: 0.85, y: 5.6, w: 11.65, h: 1.15, fontFace: 'Calibri', fontSize: 13.0, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'Two stages left, and they make this usable in a real negotiation. ' +
    'Stage eleven. The tool does not give one number pretending to be exact. It runs the calculation four thousand times, varying the inputs it is least sure of, and by different amounts. Tooling varies most, because tooling estimates are the least certain. Overhead and margin are policy percentages, so they are recalculated, not varied. ' +
    'The result is a range. On this part, ten percent of runs came in below thirty-two thirty-one, ten percent above forty-five thirty-eight, and the middle is our thirty-eight fifty-five. About plus or minus seventeen percent. The width is information: a machining-heavy casting carries more cycle-time risk than a simple pressing. ' +
    'Stage twelve is the one I care most about. Every derived input arrives as an editable pre-fill, highlighted, never silently applied. The engineer can change the material, the process, the machine, the cycle time or the rates, and the cost recalculates. The self-audit sits alongside, flagging things like a wrong machine size, tooling spread over the wrong volume, a material-only costing, or an implausible cycle time. ' +
    'Then the exports: an Excel workbook with six sheets including a traceability sheet, a PDF report, and the negotiation pack. All carry the on-screen total to the penny. ' +
    'And here is what it is for. If a supplier quotes fifty-two pounds, that is above our P90. The buyer can open the operation list and ask about the machining time, line by line. That is a different conversation.'
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
    ['3 · 4,000 trials', 'Where the tool knows each input\u2019s source, a trial varies every driver — weight, cycle times, rates, even flat material prices — and re-runs the real engine. Otherwise it scales each base bucket by a lognormal factor (always positive, mean 1). Overhead and margin are recomposed exactly as the engine does. 4,000 totals.'],
    ['4 · Read the distribution', 'Sort the 4,000 totals: the 10th percentile is the optimistic case, the median is the estimate, the 90th is the conservative case. The half-width becomes the ± figure on the result card, and the band is labelled tight, moderate or wide.'],
  ];
  steps.forEach(([t, d], i) => {
    const y = 1.18 + i * 1.28;
    s.addShape('roundRect', { x: 0.5, y, w: 7.1, h: 1.16, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
    s.addShape('ellipse', { x: 0.66, y: y + 0.14, w: 0.4, h: 0.4, fill: { color: GREEN } });
    s.addText(String(i + 1), { x: 0.66, y: y + 0.14, w: 0.4, h: 0.4, fontFace: 'Cambria', fontSize: 15.0, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    s.addText(t.slice(4), { x: 1.2, y: y + 0.1, w: 6.3, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, margin: 0 });
    s.addText(d, { x: 1.2, y: y + 0.38, w: 6.25, h: 0.74, fontFace: 'Calibri', fontSize: 8.6, color: SLATE, margin: 0, valign: 'top' });
  });
  // Right: the band drawn, plus the two guarantees
  s.addText('WHAT THE BUYER SEES', { x: 7.95, y: 1.16, w: 4.9, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: GREEN, charSpacing: 0.6, margin: 0 });
  s.addShape('roundRect', { x: 7.95, y: 1.42, w: 4.88, h: 1.9, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
  // mini histogram (illustrative shape only — labelled as such)
  const bars = [0.10, 0.22, 0.44, 0.72, 0.95, 1.0, 0.88, 0.62, 0.38, 0.18, 0.08];
  bars.forEach((h, i) => {
    s.addShape('rect', { x: 8.35 + i * 0.38, y: 2.62 - h * 0.95, w: 0.3, h: h * 0.95, fill: { color: i >= 1 && i <= 9 ? '9FD9CF' : B.line } });
  });
  s.addShape('line', { x: 8.73, y: 2.72, w: 3.04, h: 0, line: { color: TEAL, width: 2 } });
  s.addText('P10', { x: 8.55, y: 2.78, w: 0.5, h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: TEAL, margin: 0 });
  s.addText('P50 — the estimate', { x: 9.65, y: 2.78, w: 1.5, h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: NAVY, margin: 0 });
  s.addText('P90', { x: 11.55, y: 2.78, w: 0.5, h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: TEAL, margin: 0 });
  s.addText('4,000 simulated totals for one part (illustrative shape) — the quoted band is the middle 80%',
    { x: 8.15, y: 3.02, w: 4.5, h: 0.24, fontFace: 'Calibri', fontSize: 7.8, italic: true, color: MUTED, margin: 0 });
  const promises = [
    ['Reproducible, on purpose', 'The random draws are seeded: the same part, volume and region gives the same band every single time, and the band is unit-tested. No "run it again and hope".', I.check, TEAL],
    ['Corrected by real actuals', 'Log a real quote or PO price ("Log Actual £"). After 3 actuals for a commodity, the band is corrected by real data. Until then the Monte-Carlo band stands, and says so.', I.clip, GREEN],
    ['Honest by construction', 'Assumptions widen the band automatically — a part costed from an unanswered question cannot show a tight range. The band is the tool admitting exactly how much it does not know.', I.shield, AMBER],
  ];
  promises.forEach(([t, d, ico, c], i) => {
    const y = 3.46 + i * 0.99;
    s.addShape('roundRect', { x: 7.95, y, w: 4.88, h: 0.9, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
    s.addShape('ellipse', { x: 8.09, y: y + 0.11, w: 0.34, h: 0.34, fill: { color: c } });
    s.addImage({ data: ico, x: 8.17, y: y + 0.19, w: 0.18, h: 0.18 });
    s.addText(t, { x: 8.52, y: y + 0.09, w: 4.2, h: 0.22, fontFace: 'Calibri', fontSize: 9.5, bold: true, color: c, margin: 0 });
    s.addText(d, { x: 8.52, y: y + 0.33, w: 4.22, h: 0.52, fontFace: 'Calibri', fontSize: 8.0, color: SLATE, margin: 0, valign: 'top' });
  });
  s.addShape('roundRect', { x: 0.5, y: 6.42, w: 12.33, h: 0.55, fill: { color: B.greenTint }, line: { color: GREEN, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Why it matters:  ', options: { bold: true, color: GREEN } },
    { text: 'a single number pretends to a precision the inputs never had. The band is the same arithmetic run 4,000 times with each input as uncertain as its provenance says it is — so “£38.55 ± 17%” is a statement of evidence, not of confidence.', options: { color: SLATE } },
  ], { x: 0.68, y: 6.42, w: 12.0, h: 0.55, fontFace: 'Calibri', fontSize: 10.0, margin: 0, valign: 'middle' });
  footer(s, ++PG);
  s.addNotes(
    'A question I get every time is where the plus or minus comes from. Here is the mechanism, as the code does it. ' +
    'Step one. Every cost line already carries a confidence grade from where it came from. Measured geometry and library rates grade high. Derived values grade medium. Assumptions grade low. ' +
    'Step two. Those grades become spreads: five, twelve and twenty-two percent. Tooling gets one point eight times the spread, because it is the least certain thing we estimate. Packaging and logistics get less, because they are usually contracted. Overhead and margin are never varied; they are percentages, recalculated inside each trial. ' +
    'Step three, four thousand trials. Where the tool knows the source of each input, as on the CAD path, it varies every driver, including flat material prices, and re-runs the real engine. Otherwise it scales each bucket. ' +
    'Step four. Sort the totals and read the tenth, fiftieth and ninetieth percentiles. That is the band on the result card. ' +
    'Three properties. It is seeded, so the same part gives the same band every time, and that is tested. It learns: log real quotes or PO prices, and after three for a commodity the band is corrected by real data. And it is honest by construction: assumptions widen the band, so a part costed on guesses cannot look precise. ' +
    'In one line: the same arithmetic, run four thousand times, with each input as uncertain as its source.'
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
    s.addText(String(i + 1), { x: 0.66, y: y + 0.14, w: 0.4, h: 0.4, fontFace: 'Cambria', fontSize: 15.0, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
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
    ['The AI cannot touch it', 'AI is off at JLR. If switched on, it may add display-only commentary to the CAD panel. It writes no score, severity, saving or recommendation in this report.', I.shield, AMBER],
  ];
  promises.forEach(([t, d, ico, c], i) => {
    const y = 3.46 + i * 0.99;
    s.addShape('roundRect', { x: 7.95, y, w: 4.88, h: 0.9, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
    s.addShape('ellipse', { x: 8.09, y: y + 0.11, w: 0.34, h: 0.34, fill: { color: c } });
    s.addImage({ data: ico, x: 8.17, y: y + 0.19, w: 0.18, h: 0.18 });
    s.addText(t, { x: 8.52, y: y + 0.09, w: 4.2, h: 0.22, fontFace: 'Calibri', fontSize: 9.5, bold: true, color: c, margin: 0 });
    s.addText(d, { x: 8.52, y: y + 0.33, w: 4.22, h: 0.52, fontFace: 'Calibri', fontSize: 8.0, color: SLATE, margin: 0, valign: 'top' });
  });
  s.addShape('roundRect', { x: 0.5, y: 6.42, w: 12.33, h: 0.55, fill: { color: 'E7F4F2' }, line: { color: TEAL, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Read it in one line:  ', options: { bold: true, color: TEAL } },
    { text: 'the same measured geometry and the same costed numbers are pushed through fixed engineering thresholds — the DFM/DFA report is arithmetic you can audit, not opinion you have to trust. The appendix prints every rule, parameter, advisor and lever in full.', options: { color: SLATE } },
  ], { x: 0.68, y: 6.42, w: 12.0, h: 0.55, fontFace: 'Calibri', fontSize: 10.0, margin: 0, valign: 'middle' });
  footer(s, ++PG);
  s.addNotes(
    'Sections twelve to fifteen of every report, the DFM, DFA, cost optimisation and roadmap, come from one deterministic rule engine. The honest answer to is this AI opinion is no. ' +
    'Step one. The engine runs after the costing and reads the finished result: the eight buckets and the same inputs the estimate used. So it critiques the numbers that were actually costed. ' +
    'Step two. Fifty-two fixed thresholds fire. For example, material utilisation below sixty percent, or equipment effectiveness below seventy, or a bucket far outside its commodity benchmark. Each one carries a saving percentage and a recommendation, written as constants in code. ' +
    'Step three. Ten process advisors add findings from the measured solid: heavy sections that will draw porosity, sharp corners, missing draft, too much machining stock. ' +
    'Step four. Every finding is turned into pounds per part and ranked, biggest first. The engine grades findings internally to put them in order, but no score and no severity is ever shown. Engineers see what to do and what it is worth, not a mark against their design. ' +
    'Two properties to underline. The headline saving is the root-sum-square of the top three, capped at forty percent, so overlapping ideas are not double-counted. And the AI cannot touch any of it. At JLR it is off anyway. ' +
    'One function feeds both the screen and the PDF, so the two cannot disagree.'
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
    ['4 · The Re-quote suggestion — a real case', 'On the stub-axle routing, the old §14 claimed "multi-axis consolidation, 11% saving". The optimiser ranked it: consolidation LOSES on that part. The new action: "Re-quote machining on the cost-optimal routing — £28.58 as costed vs £21.63 optimal, £6.95/part" (figures from that report at the time) — a Quick Win negotiation, not a capex project.'],
  ];
  steps.forEach(([t, d], i) => {
    const y = 1.18 + i * 1.28;
    s.addShape('roundRect', { x: 0.5, y, w: 7.1, h: 1.16, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
    s.addShape('ellipse', { x: 0.66, y: y + 0.14, w: 0.4, h: 0.4, fill: { color: '4F46E5' } });
    s.addText(String(i + 1), { x: 0.66, y: y + 0.14, w: 0.4, h: 0.4, fontFace: 'Cambria', fontSize: 15.0, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    s.addText(t.slice(4), { x: 1.2, y: y + 0.1, w: 6.3, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, margin: 0 });
    s.addText(d, { x: 1.2, y: y + 0.36, w: 6.25, h: 0.78, fontFace: 'Calibri', fontSize: 8.2, color: SLATE, margin: 0, valign: 'top' });
  });
  // Right: before/after on the real part + the three rules of engagement
  s.addText('BEFORE vs AFTER — THE STUB-AXLE REPORT', { x: 7.95, y: 1.16, w: 4.9, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: '4F46E5', charSpacing: 0.6, margin: 0 });
  s.addShape('roundRect', { x: 7.95, y: 1.42, w: 4.88, h: 0.92, fill: { color: 'FDF2F2' }, line: { color: RED, width: 1 }, rectRadius: 0.09 });
  s.addText('BEFORE — generic claim', { x: 8.13, y: 1.52, w: 4.5, h: 0.2, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: RED, margin: 0 });
  s.addText('"Multi-Axis Machining to Consolidate Operations — 11% saving · Long Term." Fired on operation count alone; on this part the arithmetic says consolidation loses money.',
    { x: 8.13, y: 1.74, w: 4.55, h: 0.56, fontFace: 'Calibri', fontSize: 8.2, color: SLATE, margin: 0, valign: 'top' });
  s.addShape('roundRect', { x: 7.95, y: 2.44, w: 4.88, h: 0.92, fill: { color: B.greenTint }, line: { color: GREEN, width: 1 }, rectRadius: 0.09 });
  s.addText('AFTER — the optimiser’s delta', { x: 8.13, y: 2.54, w: 4.5, h: 0.2, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: GREEN, margin: 0 });
  s.addText('"Re-quote machining on the cost-optimal routing: £6.95/part · Quick Win. 5-axis consolidation was ranked and does NOT win on this part."',
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
    s.addText(d, { x: 8.52, y: y + 0.32, w: 4.22, h: 0.52, fontFace: 'Calibri', fontSize: 8.0, color: SLATE, margin: 0, valign: 'top' });
  });
  s.addShape('roundRect', { x: 0.5, y: 6.42, w: 12.33, h: 0.55, fill: { color: 'EEF2FF' }, line: { color: '4F46E5', width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Read it in one line:  ', options: { bold: true, color: '4F46E5' } },
    { text: 'the should-cost models the most efficient plausible supplier — so the tool takes the optimal machine itself, and its suggestions are reserved for levers only you can pull, each one priced by the same arithmetic that built the estimate.', options: { color: SLATE } },
  ], { x: 0.68, y: 6.42, w: 12.0, h: 0.55, fontFace: 'Calibri', fontSize: 10.0, margin: 0, valign: 'middle' });
  footer(s, ++PG);
  s.addNotes(
    'A buyer asked exactly the right question. The tool costed a five-machine routing and then recommended consolidating it on a multi-axis machine. Why not pick the right machine in the first place? So now it does. ' +
    'Step one. Before any pound is booked, the routing optimiser prices the options: split across cheap three-axis stations, one five-axis setup, or a turning-led route for round parts. It includes batch setup and the handling every extra fixturing costs. The cheapest capable routing wins. ' +
    'Step two. The losing options are printed next to the chosen machine, so the process line comes with its own defence. ' +
    'Step three. The suggestions read the same arithmetic. They no longer criticise the tool\u2019s own choice. If the lever is already taken, the report says routing verified optimal. Every finding is tagged with who owns the lever. ' +
    'Step four is the honest case. On the stub-axle report that prompted the question, the old advice said consolidate. The optimiser ranked it, and consolidation loses on that part. The new advice was a quick-win re-quote on the cheapest capable machines. Those figures are from that report at the time; they move with rates. ' +
    'Three rules. The AI never picks the machine. An engineer\u2019s choice is respected, with the cheaper option shown beside it. And if there is no verifiable difference, there is no claim.'
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
    s.addText(String(i + 1), { x: 0.64, y: y + 0.1, w: 0.36, h: 0.36, fontFace: 'Cambria', fontSize: 13.0, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    s.addText(t.slice(4), { x: 1.12, y: y + 0.07, w: 5.9, h: 0.22, fontFace: 'Calibri', fontSize: 10.0, bold: true, color: NAVY, margin: 0 });
    s.addText(d, { x: 1.12, y: y + 0.3, w: 5.95, h: 0.64, fontFace: 'Calibri', fontSize: 7.7, color: SLATE, margin: 0, valign: 'top' });
  });
  // Right: the bumper mould as the ACTUAL quotation the engine prints
  s.addText('THE CHECK — THE BUMPER MOULD, AS FIRST CALIBRATED', { x: 7.35, y: 1.16, w: 5.5, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: TEAL, charSpacing: 0.6, margin: 0 });
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
    s.addText(how, { x: 10.3, y, w: 1.35, h: 0.3, fontFace: 'Courier New', fontSize: 7.5, color: MUTED, margin: 0, valign: 'middle' });
    s.addText(cost, { x: 11.6, y, w: 1.05, h: 0.3, fontFace: 'Courier New', fontSize: 7.8, bold: false, color: SLATE, align: 'right', margin: 0, valign: 'middle' });
  });
  s.addShape('line', { x: 7.55, y: 4.96, w: 5.1, h: 0, line: { color: TEAL, width: 1 } });
  s.addText([
    { text: 'Engine total ≈£424k', options: { bold: true, color: TEAL, fontSize: 10.5 } },
    { text: '  vs a real toolmaker quotation of ', options: { color: SLATE, fontSize: 9.0 } },
    { text: '£420k', options: { bold: true, color: NAVY, fontSize: 10.5 } },
    { text: '. One tool, one quotation — not a general accuracy claim. Line values move with inputs and rates; every line is one a toolmaker can argue with.', options: { color: SLATE, fontSize: 8.4 } },
  ], { x: 7.55, y: 5.06, w: 5.1, h: 1.1, fontFace: 'Calibri', margin: 0, valign: 'top' });
  s.addShape('roundRect', { x: 0.5, y: 6.42, w: 12.33, h: 0.55, fill: { color: 'E7F4F2' }, line: { color: TEAL, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Read it in one line:  ', options: { bold: true, color: TEAL } },
    { text: 'tooling is a toolmaker’s quotation the engine writes itself — hours × rate, steel by the kilogram, bought-outs each, overhead stated — checked against one real quotation, and a real quotation still beats it every time.', options: { color: SLATE } },
  ], { x: 0.68, y: 6.42, w: 12.0, h: 0.55, fontFace: 'Calibri', fontSize: 9.8, margin: 0, valign: 'middle' });
  footer(s, ++PG);
  s.addNotes(
    'This slide answers one question: how does the tool price a die or a mould? Not as a percentage of the part price, and not from a lookup table. It writes the toolmaker\u2019s quotation itself. ' +
    'One toolmaking shop model prices every commodity. Design at fifty-eight pounds an hour, CNC at fifty-two, EDM at fifty-eight, bench fitting at forty-eight, polishing at forty-five, press tryout at eighty-five. Tool steel by the kilogram. Hot-runner drops and core-pull cylinders at catalogue prices. And the shop\u2019s twenty-two percent overhead and profit as its own visible line. ' +
    'The hours come from one law: twelve plus three point four times the area to the power nought point seven two, per cavity, corrected for depth. EDM, polishing and fitting follow as fractions driven by complexity and finish. ' +
    'Then tool life. The steel class follows the programme volume and sets the life, which decides how many tools you need and the tooling per part. ' +
    'The right side is the check we calibrated against: the bumper mould, the one tool we hold a real quotation for. The engine came to about four hundred and twenty-four thousand against a quotation of four hundred and twenty. That is one tool and one quotation. It is not a general accuracy claim, and the line values move with the inputs and rates. ' +
    'The rule that beats everything: a real toolmaker quotation overrides every estimate. That is what the bumper example later in the deck uses.'
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
     'Die life = 1M strokes × (300 ÷ shear MPa)^1.3 × thickness factor (× 0.6 fine-blanking), clamped 50k–3M — harder, thicker steel wears the tool faster and the law says by how much. The shop model is cross-checked against the kernel’s independent B-rep estimate.'],
    ['BLOW MOULD  ·  shop build-up',
     'cavity halves: 14 × litres^0.75 kg (Al 7075 or P20/H13)\nCNC: (30 + 9.5 × litres) h × material · cooling drilling 8–20%\n+ frame + pinch-off inserts + IBM/SBM core-rod tooling + tryout',
     'A container’s cavity is its whole inner surface, so hours scale with the litres it holds — not with a projected shadow. Life follows the mould material: aluminium 500,000 · P20 1M · H13 2M shots.'],
    ['CASTING · MACHINING · INVESTMENT',
     'HPDC/gravity/sand: the kernel B-rep parametric is PRIMARY on the\nCAD path; the same shop model prices STL and manual paths\n(H13 die + shot sleeve + cooling drilling + stress-relief HT).\nMachining: fixtures + £15,000 CNC-programming NRE, amortised.',
     'INVESTMENT tooling is priced as what it physically is: a wax-injection tool is an aluminium/P20 mould run at low pressure — the mould shop model × 0.8, plus £1,200 per soluble-core box. And the one rule above everything on both slides: a toolmaker quotation overrides every estimate, always.'],
  ];
  cards.forEach(([h, f, d], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.5 + col * 6.28, y = 1.2 + row * 2.56, w = 6.05, hh = 2.42;
    s.addShape('roundRect', { x, y, w, h: hh, fill: { color: CARD }, line: { color: TEAL, width: 1.25 }, rectRadius: 0.09 });
    s.addText(h, { x: x + 0.2, y: y + 0.1, w: w - 0.4, h: 0.22, fontFace: 'Courier New', fontSize: 8.4, bold: true, color: NAVY, margin: 0 });
    s.addText(f, { x: x + 0.2, y: y + 0.36, w: w - 0.4, h: 0.88, fontFace: 'Courier New', fontSize: 7.5, color: SLATE, margin: 0, valign: 'top' });
    s.addText(d, { x: x + 0.2, y: y + 1.28, w: w - 0.4, h: 1.08, fontFace: 'Calibri', fontSize: 7.8, color: SLATE, margin: 0, valign: 'top' });
  });
  s.addShape('roundRect', { x: 0.5, y: 6.42, w: 12.33, h: 0.55, fill: { color: 'E7F4F2' }, line: { color: TEAL, width: 1 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Why you can trust these numbers:  ', options: { bold: true, color: TEAL } },
    { text: 'every tool is priced the way a toolmaker quotes it — hours × toolroom rates, steel by the kilogram, bought-outs each, the shop’s 22% overhead as its own line — in unit-tested source, checked against a real quotation and cross-checked by the kernel’s independent B-rep estimates. A tooling model, not a percentage on the part price.', options: { color: SLATE } },
  ], { x: 0.68, y: 6.42, w: 12.0, h: 0.55, fontFace: 'Calibri', fontSize: 9.4, margin: 0, valign: 'middle' });
  footer(s, ++PG);
  s.addNotes(
    'Same shop, three more commodities. Each card reads like the quotation a die shop would send. ' +
    'The forging die. Die blocks sized from the impression, in real die steels priced by the kilogram. Sinking hours per impression, scaled by complexity and by how hard the steel is to cut. Then EDM, hardening, polishing and tryout. Die life depends on the metal being forged. Aluminium is gentle on a die; a superalloy wears one out very quickly. ' +
    'The stamping die. A die set, strip-design engineering, and per-station steel and hours split across wire EDM, CNC and bench fitting. Die life falls as the sheet gets harder and thicker, and the law says by how much. The shop model is cross-checked against the kernel\u2019s independent estimate from the solid. ' +
    'The blow mould. The cavity is the container\u2019s whole inner surface, so the hours scale with the litres it holds, not with a shadow area. Life follows the mould material. ' +
    'The last card: for castings, the kernel\u2019s estimate from the solid leads on the CAD path, and the same shop model prices STL and manual entries. Investment casting tooling is priced as the wax-injection mould it really is. ' +
    'One rule survives everything on both slides. A real toolmaker quotation beats every estimate, every time.'
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
    ['Tooling', 'die cost ÷ (annual volume × programme life)'],
    ['Packaging, Logistics', 'entered directly by the engineer'],
    ['Overhead, Margin', '% of material+process+labour+tooling; % of subtotal'],
  ];
  prov.forEach(([k, v], i) => {
    const y = 1.76 + i * 0.32;
    s.addText(k, { x: 0.78, y, w: 1.95, h: 0.3, fontFace: 'Calibri', fontSize: 10.0, bold: true, color: TEAL, margin: 0, valign: 'middle' });
    s.addText(v, { x: 2.78, y, w: 3.7, h: 0.3, fontFace: 'Calibri', fontSize: 9.6, color: SLATE, margin: 0, valign: 'middle' });
  });
  s.addText('Not one of those six lines contains an AI-generated number.',
    { x: 0.78, y: 3.76, w: 5.6, h: 0.32, fontFace: 'Calibri', fontSize: 10.5, bold: true, italic: true, color: NAVY, margin: 0 });

  s.addShape('roundRect', { x: 6.85, y: 1.3, w: 5.98, h: 2.9, fill: { color: AMBER_T }, line: { color: AMBER, width: 1.25 }, rectRadius: 0.1 });
  s.addText('THE CHECKS THAT RUN AUTOMATICALLY', { x: 7.1, y: 1.42, w: 5.5, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: AMBER, charSpacing: 0.6, margin: 0 });
  const checks = [
    'A stated volume vs the measured one — >25% apart warns',
    'Weight must equal volume x density to within 20%',
    'Self-audit: tooling over the wrong volume, material-only costing',
    'Any cycle time outside 1.8 seconds to 24 hours is rejected',
    'Near-net machining capped to 0.10 hr + 0.07 hr/kg',
    'Machine must be big enough for the part, or it is flagged',
  ];
  checks.forEach((t, i) => s.addText('•  ' + t, { x: 7.12, y: 1.76 + i * 0.32, w: 5.5, h: 0.3, fontFace: 'Calibri', fontSize: 9.6, color: SLATE, margin: 0, valign: 'middle' }));
  s.addText('Each one is code, not a prompt.',
    { x: 7.12, y: 3.76, w: 5.5, h: 0.32, fontFace: 'Calibri', fontSize: 10.5, bold: true, italic: true, color: NAVY, margin: 0 });

  s.addShape('roundRect', { x: 0.5, y: 4.35, w: 12.33, h: 1.25, fill: { color: CARD }, line: { color: GREEN, width: 1.5 }, rectRadius: 0.1 });
  s.addText('The claim we make — and the claim we do not', { x: 0.8, y: 4.47, w: 11, h: 0.3, fontFace: 'Calibri', fontSize: 12.5, bold: true, color: GREEN, margin: 0 });
  s.addText([
    { text: 'We do say: no AI number ever becomes money — and at JLR the AI is off. ', options: { bold: true, color: NAVY } },
    { text: 'Every figure comes from a measurement, a rule, an engineer\u2019s answer or a library rate.  ', options: { color: SLATE } },
    { text: 'We do not say every input is right. ', options: { bold: true, color: RED } },
    { text: 'An answer can be mistyped or a rate can be out of date. That is why the checks above run automatically, and why a person signs the result.', options: { color: SLATE } },
  ], { x: 0.8, y: 4.79, w: 11.75, h: 0.74, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 5.75, w: 12.33, h: 1.05, fill: { color: TEAL_T }, line: { color: TEAL, width: 1 }, rectRadius: 0.1 });
  s.addText([
    { text: 'Reproducibility test: ', options: { bold: true, color: TEAL } },
    { text: 'run the same file with the same inputs a hundred times and you get £38.55 a hundred times. The arithmetic is fixed code, so the answer cannot drift between runs, between engineers, or between one supplier meeting and the next.', options: { color: SLATE } },
  ], { x: 0.8, y: 5.87, w: 11.75, h: 0.85, fontFace: 'Calibri', fontSize: 12.0, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'I have been asked, fairly, whether this thing makes numbers up. Let me answer precisely rather than reassuringly. ' +
    'On the left is what each bucket is made of. Material is measured volume times density times a price per kilo. Process is cycle time divided by machine availability, times a machine rate from the library. Labour is the same time times the manning and a wage rate. Tooling is the tool cost spread over annual volume times programme life. Packaging and logistics are typed in. Overhead is a percentage of material, process, labour and tooling. Margin is a percentage of the subtotal. Each applied once. ' +
    'Not one of those lines contains an AI number. At JLR the AI is off, and even when on it never sees the rate library or touches the arithmetic. ' +
    'On the right are checks that run automatically. A stated volume far from the measured one is flagged. Weight must match volume times density. Cycle times outside one point eight seconds to twenty-four hours are rejected. Near-net machining is capped. The self-audit flags a machine of the wrong size, tooling spread over the wrong volume, or a costing with material only. These are code, not prompts. ' +
    'The honest half: we do not claim every input is right. An answer can be mistyped, or a rate can go stale. That is why the checks run and a person signs. ' +
    'Run the same file with the same answers a hundred times, and you get thirty-eight fifty-five a hundred times.'
  );
}

// ══════════ 11 · SUMMARY ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'The Whole Thing on One Page', 'Who does what — the answer to the question you asked me');

  const lanes = [
    [BLUE, BLUE_T, 'THE RULER', 'Measures the CAD file', ['Volume, weight, walls', 'Bores, holes, faces', 'Hollow-vs-solid check'], 'Same answer every time'],
    [PURPLE, PURPLE_T, 'THE AI', 'Off at JLR · optional', ['Could suggest the alloy', 'Could suggest the route', 'Never sets a price'], 'Words only. Never money.'],
    [AMBER, AMBER_T, 'THE GUARDS', 'Check and autocorrect', ['Pour weight, not part weight', 'Machining = finishing', 'Right alloy, right press'], 'Measurements always win'],
    [TEAL, TEAL_T, 'THE ENGINE', 'Does every calculation', ['Sizes the machine', 'Builds each cycle time', '8 buckets, 20 countries'], 'Fixed formulas, traceable'],
    [GREEN, GREEN_T, 'THE ENGINEER', 'Answers and approves', ['Sets volume and region', 'Answers what geometry can\u2019t — their entry always wins', 'Signs off the number'], 'The final decision'],
  ];
  const lw = 2.36, lg = 0.11;
  lanes.forEach(([col, tint, who, does, items, rule], i) => {
    const x = 0.5 + i * (lw + lg), y = 1.32, h = 3.55;
    s.addShape('roundRect', { x, y, w: lw, h, fill: { color: tint }, line: { color: col, width: 1.25 }, rectRadius: 0.09 });
    s.addShape('rect', { x, y, w: lw, h: 0.44, fill: { color: col } });
    s.addText(who, { x, y, w: lw, h: 0.44, fontFace: 'Calibri', fontSize: 11.0, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, charSpacing: 0.8 });
    s.addText(does, { x: x + 0.1, y: y + 0.52, w: lw - 0.2, h: 0.28, fontFace: 'Calibri', fontSize: 10.0, bold: true, italic: true, color: col, align: 'center', margin: 0 });
    items.forEach((t, j) => s.addText('• ' + t, { x: x + 0.14, y: y + 0.88 + j * 0.44, w: lw - 0.28, h: 0.42, fontFace: 'Calibri', fontSize: 9.5, color: SLATE, margin: 0, valign: 'top' }));
    s.addShape('roundRect', { x: x + 0.12, y: y + h - 0.55, w: lw - 0.24, h: 0.44, fill: { color: CARD }, line: { color: col, width: 0.75 }, rectRadius: 0.08 });
    s.addText(rule, { x: x + 0.14, y: y + h - 0.55, w: lw - 0.28, h: 0.44, fontFace: 'Calibri', fontSize: 8.8, bold: true, color: col, align: 'center', valign: 'middle', margin: 0 });
  });

  s.addShape('roundRect', { x: 0.5, y: 5.1, w: 12.33, h: 0.85, fill: { color: NAVY }, rectRadius: 0.1 });
  s.addText('The tool measures.  The engineer answers.  The engine calculates.  A person approves.', {
    x: 0.5, y: 5.1, w: 12.33, h: 0.85, fontFace: 'Cambria', fontSize: 17.0, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });

  s.addShape('roundRect', { x: 0.5, y: 6.1, w: 12.33, h: 0.78, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText([
    { text: 'Result on this part:  ', options: { bold: true, color: NAVY } },
    { text: 'a defensible £38.55, with a £32–£45 confidence band — and every penny of it traceable to a measurement, an answer or a library rate.', options: { color: SLATE } },
  ], { x: 0.8, y: 6.2, w: 11.75, h: 0.6, fontFace: 'Calibri', fontSize: 12.5, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'Here is the whole thing on one page. It is the answer to the question you asked after the last session: who does what? ' +
    'Five players, left to right, in the order they act. The ruler, the geometry kernel, measures the CAD file and gives the same answer every time. The AI is switched off at JLR. If it were ever switched on, it could suggest the alloy and the route, as words, never money. The guards check every input against the measurements and correct it where they disagree. The engine does every calculation: it sizes the machine, builds the cycle times, fills the eight buckets and reprices across twenty countries, with fixed formulas you can trace. And the engineer sets the volume and region, answers what geometry cannot decide, can override any choice, and signs off the number. ' +
    'The line in the middle is the tool in one sentence. The tool measures. The engineer answers. The engine calculates. A person approves. ' +
    'The result on this housing is thirty-eight pounds fifty-five, with a band of roughly thirty-two to forty-five pounds. Every penny traces back to a measurement, an answer or a library rate. ' +
    'That is the workflow. If it would help, I can run it live on a part you choose, so you can watch each stage happen.'
  );
}


FOOT = 'CostVision · how the tool works, step by step · injection-moulded bumper fascia worked example';

divider('SECTION THREE', 'A Moulded Bumper Fascia', 'The same method, a part that could hardly be more different', PURPLE,
  ['Same kernel, same questions, same rate library, same eight buckets',
   'Cooling calculated from wall thickness — and what half a millimetre is worth',
   'The paint line, costed from film thickness rather than a percentage uplift',
   'Two findings that nobody in the room would have predicted'], '18',
  'Second worked example. It is here to answer a fair question: is this a tool, or a demo that only works on one part? ' +
  'So we do it all again on something as different as I could find: an injection-moulded bumper fascia. Same kernel, same questions, same rate library, same eight buckets, same person signing it off. What changes is which bucket holds the money, and the answer surprised me. ' +
  'Along the way you will see cooling time calculated from wall thickness, and what half a millimetre of wall is worth. You will see the paint line costed from film thickness, not as a percentage uplift. And the section ends with two findings I would not have predicted before we ran it. ' +
  'As with the housing, the costs are real engine output from the worked-example inputs, re-checked against today\u2019s engine and rates. ' +
  'I finish the section with the new gear model, because it came straight from a request in this room.');

// ══════════ PART 2 · A · SAME METHOD, DIFFERENT PART ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Part Two · The Same Method on a Moulded Part', 'Front bumper fascia — injection moulded, followed end to end', PURPLE);

  s.addShape('roundRect', { x: 0.5, y: 1.28, w: 12.33, h: 1.22, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addShape('ellipse', { x: 0.75, y: 1.5, w: 0.72, h: 0.72, fill: { color: NAVY } });
  s.addImage({ data: I.cube, x: 0.95, y: 1.7, w: 0.32, h: 0.32 });
  s.addText('Front bumper fascia — talc-filled polypropylene, moulded in one shot, then painted', { x: 1.68, y: 1.42, w: 11, h: 0.34, fontFace: 'Calibri', fontSize: 15.0, bold: true, color: NAVY, margin: 0, valign: 'middle' });
  const chips = ['4.2 kg', '3.0 mm walls', '1,800 × 550 mm', '6 undercut slides', 'Class-A painted', '60,000 a year', 'Made in China'];
  chips.forEach((c, i) => {
    const x = 1.68 + i * 1.58;
    s.addShape('roundRect', { x, y: 1.86, w: 1.48, h: 0.36, fill: { color: PURPLE_T }, rectRadius: 0.17 });
    s.addText(c, { x, y: 1.86, w: 1.48, h: 0.36, fontFace: 'Calibri', fontSize: 9.0, bold: true, color: NAVY, align: 'center', valign: 'middle', margin: 0 });
  });

  const phases = [
    [BLUE, BLUE_T, 'MEASURE', 'Ruler', ['1 · Upload the file', '2 · Measure the geometry', '3 · Draft & undercut check'], 'Same kernel, same facts'],
    [PURPLE, PURPLE_T, 'ASK', 'Engineer · AI off at JLR', ['4 · The tool asks what', 'geometry cannot decide', 'resin · route · finish'], 'Asked, never guessed'],
    [AMBER, AMBER_T, 'SAFETY CHECKS', 'Engine', ['5 · Four automatic guards', '6 · Autocorrect wrong calls', 'before any money is counted'], 'Measurements always win'],
    [TEAL, TEAL_T, 'CALCULATE', 'Engine', ['7 · Pick press & cycle', '8 · Cost every second', '9-10 · Build & regionalise'], 'The same eight buckets'],
    [GREEN, GREEN_T, 'CHECK & USE', 'Engineer', ['11 · Confidence band', '12 · Report & approval'], 'A person signs it off'],
  ];
  const pw = 2.33, gap = 0.16;
  phases.forEach(([col, tint, name, who, steps, tag], i) => {
    const x = 0.5 + i * (pw + gap), y = 2.72, h = 2.28;
    s.addShape('roundRect', { x, y, w: pw, h, fill: { color: tint }, line: { color: col, width: 1.25 }, rectRadius: 0.09 });
    s.addShape('rect', { x, y, w: pw, h: 0.4, fill: { color: col } });
    s.addText(name, { x, y, w: pw, h: 0.4, fontFace: 'Calibri', fontSize: 10.0, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, charSpacing: 0.8 });
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
    'Second worked example, and I chose a part that could hardly be more different from the casting: a front bumper fascia. ' +
    'Talc-filled polypropylene, four point two kilos, three millimetre walls, about one point eight metres by half a metre. It has six undercut features that need sliding sections in the tool, for the lamp and sensor openings. And it is painted to a Class-A finish. Sixty thousand a year, made in China: deliberately the same volume and country as the casting, so we compare like with like. ' +
    'Look at the five phases and compare them with the casting. They are identical. Same twelve stages, same owners, same colours. The kernel is the same kernel. The questions to the engineer are the same kind. The rate library is the same library. The engine builds the same eight buckets. ' +
    'That is the point of a second example. We have not built nineteen different tools. We have built one method that covers nineteen manufacturing processes. When someone brings a part we have never costed, nothing new has to be invented. ' +
    'What does change is where the money ends up. On the casting it was machining. On this part it is somewhere else entirely.'
  );
}

partSlide('assets/workflow-deck/part-bumper.png',
  'The Second Part We Are Costing', 'Front bumper fascia',
  'Same method, a part that could hardly be more different', PURPLE,
  [['Part weight', '4.2 kg'], ['Wall thickness', '3.0 mm'], ['Projected shadow', '9,900 cm²'],
   ['Overall width', '1,800 mm'], ['Undercut features', '6 slides'], ['Painted area', '1.6 m²'],
   ['Resin', 'PP-T20'], ['Annual volume', '60,000'], ['Made in', 'China']],
  'Same volume and country as the casting, so the two compare like for like.',
  'Here is the second part. It is a worked example again: the inputs are the kind the kernel measures, and the costs are engine output. ' +
  'A front bumper fascia. Four point two kilos of talc-filled polypropylene, three millimetre walls, one point eight metres across. The grille opening, the fog-lamp openings and the parking-sensor holes all face back against the direction the mould opens. So the tool needs six sliding sections to release the part, and each slide is real money in the mould. ' +
  'The projected shadow is nine thousand nine hundred square centimetres, six times the casting. That one number drives the biggest process decision on this part: the size of the press. ' +
  'The painted area is one point six square metres, which we need later for the paint line. ' +
  'And note the last two rows: sixty thousand a year, made in China. The same volume and country as the casting, so when we compare the two at the end, we compare like with like rather than two sourcing scenarios.');

// ══════════ PART 2 · B · MEASURE + AI ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Stages 1–4 · Measured First, Then Asked', 'Same kernel, same order — the facts exist before anyone answers a question', BLUE);

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
    s.addText(k, { x: 0.78, y, w: 3.6, h: 0.34, fontFace: 'Calibri', fontSize: 10.0, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(v, { x: 4.35, y, w: 1.3, h: 0.34, fontFace: 'Calibri', fontSize: 11.0, bold: true, color: NAVY, align: 'right', margin: 0, valign: 'middle' });
  });

  s.addShape('roundRect', { x: 6.15, y: 1.3, w: 3.35, h: 2.9, fill: { color: PURPLE_T }, line: { color: PURPLE, width: 1.25 }, rectRadius: 0.1 });
  s.addText('WHAT THE ENGINEER IS ASKED', { x: 6.4, y: 1.44, w: 3.4, h: 0.26, fontFace: 'Calibri', fontSize: 10.0, bold: true, color: PURPLE, charSpacing: 0.8, margin: 0 });
  const says = [['Material family', 'Talc-filled polypropylene'], ['How it is made', 'Injection moulded, one shot'], ['Then what', 'Painted, Class-A finish'], ['Volume · region', '60,000 a year · China']];
  says.forEach(([k, v], i) => {
    const y = 1.78 + i * 0.52;
    s.addText(k, { x: 6.4, y, w: 2.9, h: 0.22, fontFace: 'Calibri', fontSize: 9.0, color: MUTED, margin: 0 });
    s.addText(v, { x: 6.4, y: y + 0.21, w: 2.9, h: 0.3, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, margin: 0, valign: 'top' });
  });
  s.addText('Answered, not guessed.', { x: 6.4, y: 3.88, w: 2.9, h: 0.26, fontFace: 'Calibri', fontSize: 9.5, bold: true, italic: true, color: PURPLE, margin: 0 });

  s.addShape('roundRect', { x: 9.75, y: 1.3, w: 3.08, h: 2.9, fill: { color: BLUE_T }, line: { color: BLUE, width: 1.25 }, rectRadius: 0.1 });
  s.addText('THE UNDERCUT COUNT', { x: 10.0, y: 1.44, w: 2.6, h: 0.26, fontFace: 'Calibri', fontSize: 10.0, bold: true, color: BLUE, charSpacing: 0.8, margin: 0 });
  s.addText([
    { text: 'The kernel classifies every face by its angle to the mould-opening direction. ', options: { color: SLATE } },
    { text: 'Six faces point back against the draw. ', options: { bold: true, color: NAVY } },
    { text: 'Each one needs a sliding section in the tool — and each slide is real money in the mould.', options: { color: SLATE } },
  ], { x: 10.0, y: 1.8, w: 2.6, h: 1.6, fontFace: 'Calibri', fontSize: 10.0, margin: 0, valign: 'top' });
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
    { text: 'stages 1 to 3 measure first; stage 4 is the engineer answering what geometry cannot decide. AI is off at JLR — and even when on, it never sees a price, a rate or a machine.', options: { color: SLATE } },
  ], { x: 0.8, y: 5.86, w: 11.75, h: 0.66, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'Stages one to four. I will go quickly, because you have seen the method. ' +
    'The kernel measures. Volume, which on polypropylene is four point two kilos. Wall thickness, three millimetres: hold on to that, it matters more than you would think. The projected shadow in the direction the mould opens, nine thousand nine hundred square centimetres. And the painted area, one point six square metres. ' +
    'Then a clever measurement. The kernel classifies every face by its angle to the mould-opening direction, and counts the faces that point back against it. Six of them. Each needs a sliding section in the tool, and each slide costs real money. Nobody counted those by eye. ' +
    'Stage four is the engineer answering what geometry cannot decide: the material family, the process, the finish, the volume and the region. Here: talc-filled polypropylene, injection moulded in one shot, painted to Class-A, sixty thousand a year in China. At JLR it is always the engineer, because the AI is off. ' +
    'The box at the bottom is the one I would underline. The shadow area decides the biggest process number on this part. Molten plastic pushing out across that area tries to force the mould open, so it sets the press size, and the press rate sets the moulding cost. A part this size cannot be moulded on a small machine, however cheap that machine is.'
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
    s.addText(t, { x: 0.9, y, w: 1.3, h: 0.32, fontFace: 'Calibri', fontSize: 11.0, bold: true, color: on ? NAVY : SLATE, margin: 0, valign: 'middle' });
    s.addText(r, { x: 2.3, y, w: 1.6, h: 0.32, fontFace: 'Calibri', fontSize: 11.0, bold: on, color: on ? NAVY : SLATE, align: 'right', margin: 0, valign: 'middle' });
    s.addText(v, { x: 4.2, y, w: 1.6, h: 0.32, fontFace: 'Calibri', fontSize: 9.5, italic: !on, bold: on, color: on ? TEAL : MUTED, margin: 0, valign: 'middle' });
    if (on) s.addText('2,902 t needed → smallest press that covers it', { x: 5.7, y, w: 2.0, h: 0.32, fontFace: 'Calibri', fontSize: 8.4, italic: true, color: TEAL, margin: 0, valign: 'middle' });
  });

  s.addShape('roundRect', { x: 8.25, y: 4.2, w: 4.58, h: 2.35, fill: { color: CARD }, line: { color: RED, width: 1.5 }, rectRadius: 0.1 });
  s.addText('WHY THIS ONE CHECK IS WORTH THE TOOL', { x: 8.5, y: 4.32, w: 4.1, h: 0.28, fontFace: 'Calibri', fontSize: 10.0, bold: true, color: RED, charSpacing: 0.4, margin: 0 });
  s.addText([
    { text: 'Accept a 2,000 t default and you cost the moulding at £178.54/hr instead of £306.12 — ', options: { color: SLATE } },
    { text: '42% too cheap.\n\n', options: { bold: true, color: RED } },
    { text: 'And the part would never mould: the press could not hold the tool shut, so you would be negotiating hard against a price that is physically impossible to deliver.', options: { color: SLATE } },
  ], { x: 8.5, y: 4.68, w: 4.1, h: 1.7, fontFace: 'Calibri', fontSize: 10.5, margin: 0, valign: 'top' });
  footer(s, ++PG);

  s.addNotes(
    'Stages five to seven. Four guards run on this part, and they are different from the casting guards, because a moulded part goes wrong in different ways. ' +
    'Guard one, the runner. A cold-runner tool makes a sprue and runner with every shot, six to nine hundred grams of plastic that is not the part. This tool has a hot runner, so the shot weight is the part weight. The guard makes sure we neither charge for plastic that does not exist nor forget it on a cold-runner tool. ' +
    'Guard two, cooling. This is the number people guess and should not. Cooling time is three point one six times the wall thickness squared. At three millimetres that is twenty-eight point four seconds, more than half the cycle. The wall is squared, so it is the strongest lever in moulding, and it is a design decision. ' +
    'Guard three, the press. Same physics as the casting. Nine thousand nine hundred square centimetres, times twenty-five megapascals, times a fifteen percent safety factor, is about two thousand nine hundred tonnes. The smallest press that covers it is thirty-five hundred tonnes, at three hundred and six pounds an hour. ' +
    'Guard four, the tool cost. A four hundred and twenty thousand pound mould is a toolmaker\u2019s quotation. The tool takes it as an input and applies the Class-A finish uplift. ' +
    'The red box is why the press guard matters. A default two thousand tonne press would cost the moulding about forty-two percent too cheap, and the part could not even be made on it.'
  );
}

// ══════════ PART 2 · C1b · COOLING TIME FROM FIRST PRINCIPLES ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Cooling Time from First Principles', 'The Fourier slab solution, calibrated to industry data — every input printable, nothing guessed', PURPLE);
  const steps = [
    ['1 · The physical law, not a fitted curve', 'Cooling a moulded wall between two mould faces is textbook transient conduction, and its exact solution is:  t_cool = wall² ÷ (π²·α) × ln[ (4/π) × (T_melt − T_mould) ÷ (T_eject − T_mould) ].  The wall enters SQUARED because heat must diffuse out through half the thickness — that is why wall is the most powerful lever in moulding.'],
    ['2 · Every resin carries its real temperatures', '20 resin families each carry typical melt / mould / eject temperatures. PP (the bumper): melt 230 °C, mould 40 °C, eject 85 °C → log term ln(1.273 × 190/45) = 1.682. ABS runs 240/60/95; PA6 280/80/125; PC 300/90/130. Change the resin and the physics changes with it.'],
    ['3 · Calibrated ONCE against industry cycle data', 'The effective diffusivity α_eff is derived from the curated industry factor at those reference temperatures — for PP: α_eff = 1.682 ÷ (π² × 3.16) = 0.054 mm²/s. α_eff deliberately absorbs what the ideal slab ignores: latent heat of crystallisation and mould-interface resistance. At reference temperatures the formula reproduces the curated factor EXACTLY — adopting the physics changed provenance, not price.'],
    ['4 · The governing wall, and a sanity clamp', 'Cooling is evaluated at the 95th-percentile measured wall (capped at 2× the mean): the part ejects when its THICKEST section is stiff, so the mean systematically under-times ribs and bosses. And the computed factor is clamped to [0.5×, 2×] of the curated value — physics may move the cycle; a pathological temperature pair may not run away with the cost.'],
  ];
  steps.forEach(([t, d], i) => {
    const y = 1.18 + i * 1.28;
    s.addShape('roundRect', { x: 0.5, y, w: 7.1, h: 1.16, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.09 });
    s.addShape('ellipse', { x: 0.66, y: y + 0.14, w: 0.4, h: 0.4, fill: { color: PURPLE } });
    s.addText(String(i + 1), { x: 0.66, y: y + 0.14, w: 0.4, h: 0.4, fontFace: 'Cambria', fontSize: 15.0, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
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
    'Cooling is the biggest single number in a moulding cycle, and the one people used to guess. Here is how the tool calculates it, from first principles. ' +
    'Step one, the law. A plastic wall cooling between two mould faces is textbook heat conduction. The exact solution says cooling time equals wall squared, divided by pi squared times the thermal diffusivity, times the log of a temperature ratio. The wall is squared because heat has to travel out through half the thickness. ' +
    'Step two. Each of twenty resin families carries its typical temperatures. Polypropylene, this bumper, goes in at two hundred and thirty degrees, the mould runs at forty, and the part ejects at eighty-five. ' +
    'Step three is the honest part. The diffusivity is calibrated once, so that at those standard temperatures the formula gives exactly the industry factor we used before: three point one six seconds per millimetre squared. So adopting the physics did not move a single estimate. It changed the source from a constant we assert to a law you can check. ' +
    'Step four. It uses the thickest sections, the ninety-fifth percentile wall, because the part ejects when its thickest section is stiff. And the result is clamped, so a bad temperature input cannot run away with the cost. ' +
    'The payoff is on the right. Chill the mould to twenty degrees and about four and a half seconds come off each shot. Thin the wall by half a millimetre and nearly nine seconds come off, one pound eleven a part at UK rates. Those are the two conversations this slide should start.'
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
    ['÷ 0.98 (2% reject allowance)', 'engine rule', '55.04 s', false],
  ];
  cyc.forEach(([k, src, v, hi], i) => {
    const y = 1.78 + i * 0.32;
    if (hi) s.addShape('roundRect', { x: 6.95, y: y - 0.03, w: 5.72, h: 0.33, fill: { color: TEAL_T }, rectRadius: 0.05 });
    s.addText(String(k), { x: 7.03, y, w: 3.2, h: 0.3, fontFace: 'Calibri', fontSize: 9.6, bold: Boolean(hi) || i === 4, color: hi ? TEAL : SLATE, margin: 0, valign: 'middle' });
    s.addText(String(src), { x: 10.25, y, w: 1.35, h: 0.3, fontFace: 'Calibri', fontSize: 8.0, italic: true, color: hi ? TEAL : MUTED, align: 'right', margin: 0, valign: 'middle' });
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
    ['Total cycle', '55.04 s', '46.17 s', '−8.87 s'],
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
    'Same treatment for the bumper: show the calculation, do not assert it. ' +
    'Left side, the press. It is the same slide as the casting with different numbers. Shadow area, nine thousand nine hundred square centimetres. Cavity pressure for a large thin-wall polypropylene part, twenty-five megapascals. That is about two thousand five hundred tonnes trying to open the mould. Add fifteen percent and you need about two thousand nine hundred. Walk the ladder and take the smallest press that covers it: thirty-five hundred tonnes, at three hundred and six pounds twelve an hour. ' +
    'Right side, the cycle. I want to be clear which numbers are calculated and which are entered. Fill, pack and eject are process inputs: four and a half, twelve and nine seconds. They come from the moulder or our process engineer. Cooling is calculated: three point one six times three squared, twenty-eight point four four seconds. The engine then allows for two percent rejects and you get about fifty-five seconds. ' +
    'The box at the bottom is the useful part. Take half a millimetre out of the wall. Cooling drops to about nineteen point eight seconds. The cycle falls by nearly nine seconds. The press cost per part drops eighty-nine pence, and the UK part cost drops one pound eleven. I re-ran that on today\u2019s engine. ' +
    'That is a design conversation, not a purchasing one, and it has to happen before the design is frozen. The tool lets you put a number on it while there is still time.'
  );
}

// ══════════ PART 2 · D · CYCLE + MONEY ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Stages 8–10 · 55 Seconds, Then the Eight Buckets', 'Every second priced at the press rate, then repriced by country', TEAL);

  s.addShape('roundRect', { x: 0.5, y: 1.3, w: 5.5, h: 2.65, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('HOW THE 55-SECOND CYCLE IS BUILT', { x: 0.75, y: 1.42, w: 5, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, charSpacing: 0.5, margin: 0 });
  const cyc = [['Fill the cavity', '4.5 s'], ['Pack and hold', '12.0 s'], ['Cool  =  3.16 × 3.0²', '28.4 s'], ['Open and eject', '9.0 s'], ['+ 2% reject allowance', '1.1 s']];
  cyc.forEach(([k, v], i) => {
    const y = 1.78 + i * 0.33;
    const big = i === 2;
    s.addText(k, { x: 0.78, y, w: 3.6, h: 0.3, fontFace: 'Calibri', fontSize: 10.5, bold: big, color: big ? TEAL : SLATE, margin: 0, valign: 'middle' });
    s.addText(v, { x: 4.4, y, w: 1.4, h: 0.3, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: big ? TEAL : NAVY, align: 'right', margin: 0, valign: 'middle' });
  });
  s.addShape('line', { x: 0.78, y: 3.46, w: 5.02, h: 0, line: { color: LINE, width: 1 } });
  s.addText('Total cycle', { x: 0.78, y: 3.52, w: 3.6, h: 0.3, fontFace: 'Calibri', fontSize: 11.0, bold: true, color: NAVY, margin: 0, valign: 'middle' });
  s.addText('55.0 s', { x: 4.4, y: 3.52, w: 1.4, h: 0.3, fontFace: 'Calibri', fontSize: 11.0, bold: true, color: NAVY, align: 'right', margin: 0, valign: 'middle' });

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
  s.addText('Moulding one bumper:  £5.67  —  and that is the whole making cost', { x: 6.5, y: 3.3, w: 6.1, h: 0.4, fontFace: 'Calibri', fontSize: 11.0, bold: true, color: NAVY, align: 'center', valign: 'middle', margin: 0 });
  s.addText('£5.5063 + £0.1682 = £5.6745 — the two lines above are rounded to the penny.', { x: 6.5, y: 3.73, w: 6.1, h: 0.2, fontFace: 'Calibri', fontSize: 8.0, italic: true, color: MUTED, align: 'center', margin: 0 });

  s.addShape('roundRect', { x: 0.5, y: 4.15, w: 7.5, h: 2.4, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('THE EIGHT BUCKETS — bumper fascia, made in China', { x: 0.75, y: 4.26, w: 6.9, h: 0.26, fontFace: 'Calibri', fontSize: 11.0, bold: true, color: NAVY, margin: 0 });
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
  s.addText('SHOULD-COST — MADE IN CHINA', { x: 8.5, y: 4.25, w: 4.1, h: 0.24, fontFace: 'Calibri', fontSize: 9.0, bold: true, color: '9FD9CF', charSpacing: 0.8, margin: 0 });
  s.addText('£26.08', { x: 8.5, y: 4.46, w: 2.3, h: 0.6, fontFace: 'Cambria', fontSize: 33.0, bold: true, color: 'FFFFFF', margin: 0, valign: 'middle' });
  s.addText('unpainted, ex-works,\nat 60,000 a year', { x: 10.85, y: 4.5, w: 1.85, h: 0.55, fontFace: 'Calibri', fontSize: 9.0, color: 'CDEDE7', margin: 0, valign: 'middle' });

  s.addShape('roundRect', { x: 8.25, y: 5.42, w: 4.58, h: 1.13, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('THE SAME PART, PRICED ELSEWHERE', { x: 8.45, y: 5.5, w: 4.2, h: 0.24, fontFace: 'Calibri', fontSize: 9.0, bold: true, color: NAVY, charSpacing: 0.6, margin: 0 });
  const geo = [['China', '£26.08'], ['India', '£26.13'], ['Mexico', '£27.04'], ['UK', '£31.06']];
  geo.forEach(([c, v], i) => {
    const x = 8.45 + (i % 4) * 1.06;
    s.addText(c, { x, y: 5.76, w: 1.0, h: 0.22, fontFace: 'Calibri', fontSize: 9.0, color: MUTED, align: 'center', margin: 0 });
    s.addText(v, { x, y: 5.96, w: 1.0, h: 0.26, fontFace: 'Calibri', fontSize: 11.0, bold: true, color: i === 0 ? TEAL : NAVY, align: 'center', margin: 0 });
  });
  s.addText('Only 19% between China and the UK — on the casting it was 55%.', { x: 8.45, y: 6.24, w: 4.2, h: 0.24, fontFace: 'Calibri', fontSize: 8.4, italic: true, color: MUTED, align: 'center', margin: 0 });
  footer(s, ++PG);

  s.addNotes(
    'Stages eight to ten. On the left, how the fifty-five second cycle is built. Fill, four and a half seconds. Pack and hold, twelve. Cooling, twenty-eight point four. Open and eject, nine. Plus a two percent reject allowance. ' +
    'On the right, the arithmetic you can check. Fifty-five seconds is nought point nought one five three of an hour. Divide by eighty-five percent availability and the press is busy for nought point nought one eight of an hour. Times three hundred and six pounds twelve gives five pounds fifty-one of machine. Half an operator gives seventeen pence of labour. Five pounds sixty-seven in total. If you add the two rounded figures you get sixty-eight; the engine keeps full precision. ' +
    'Stop and look at that. Five pounds sixty-seven is the whole making cost of a car bumper. On the casting, making the part was thirty-two fifty-seven. ' +
    'So where did the money go? Look at the chart. Tooling, eleven pounds twenty, is the biggest bucket by far, bigger than resin, press and labour together. On this part, the tool is the cost. ' +
    'Twenty-six pounds oh eight in China, unpainted and ex-works. Paint is next. ' +
    'And the country row. China twenty-six oh eight, UK thirty-one oh six, only about nineteen percent apart. On the casting it was fifty-five percent. The tool, packaging and logistics do not get cheaper when the factory moves, and resin is a world price. Offshoring saves a lot on a labour-heavy part and little on a tooling-heavy one.'
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
    ['Paint line (UK rate), 55 parts/hr ÷ 0.85 OEE × £102.13/hr', '£2.32'],
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
    s.addText(k, { x: 8.6, y, w: 2.6, h: 0.32, fontFace: 'Calibri', fontSize: 10.0, color: 'CDEDE7', margin: 0, valign: 'middle' });
    s.addText(v, { x: 11.2, y, w: 1.4, h: 0.32, fontFace: 'Calibri', fontSize: 11.0, bold: true, color: 'FFFFFF', align: 'right', margin: 0, valign: 'middle' });
  });
  s.addShape('line', { x: 8.6, y: 2.7, w: 4, h: 0, line: { color: '9FD9CF', width: 1 } });
  s.addText('£39.22', { x: 8.6, y: 2.82, w: 4, h: 0.7, fontFace: 'Cambria', fontSize: 34.0, bold: true, color: 'FFFFFF', align: 'center', margin: 0, valign: 'middle' });
  s.addText('painted, ex-works, per part', { x: 8.6, y: 3.56, w: 4, h: 0.26, fontFace: 'Calibri', fontSize: 10.0, color: 'CDEDE7', align: 'center', margin: 0 });
  s.addText('Paint is a third of the delivered cost — and about 40% of that is the basecoat.',
    { x: 8.6, y: 3.9, w: 4, h: 0.56, fontFace: 'Calibri', fontSize: 9.2, italic: true, color: '9FD9CF', align: 'center', margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 4.74, w: 12.33, h: 1.26, fill: { color: CARD }, line: { color: GREEN, width: 1.5 }, rectRadius: 0.1 });
  s.addText('Why this is worth costing separately rather than as a percentage uplift', { x: 0.8, y: 4.85, w: 11.5, h: 0.28, fontFace: 'Calibri', fontSize: 12.5, bold: true, color: GREEN, margin: 0 });
  s.addText([
    { text: 'Transfer efficiency is the number nobody argues about and everybody should. ', options: { bold: true, color: NAVY } },
    { text: 'At 60% transfer, four of every ten pounds of basecoat lands in the booth filters rather than on the car. Move that one line to 70% with better electrostatics and the basecoat drops from £5.55 to £4.75 — on 60,000 parts a year that is about £47,000. A percentage uplift on the moulded cost would have hidden that completely.', options: { color: SLATE } },
  ], { x: 0.8, y: 5.16, w: 11.75, h: 0.76, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 0.5, y: 6.12, w: 12.33, h: 0.76, fill: { color: AMBER_T }, line: { color: AMBER, width: 1 }, rectRadius: 0.1 });
  s.addText([
    { text: 'Honest note:  ', options: { bold: true, color: AMBER } },
    { text: 'the paint line is a separate costing, not a bucket inside the moulding one — in the real world it is usually a separate supplier. The £13.14 is the line\u2019s cost before the painter\u2019s own overhead and margin; the £39.22 simply adds it to the moulded ex-works cost.', options: { color: SLATE } },
  ], { x: 0.8, y: 6.2, w: 11.75, h: 0.6, fontFace: 'Calibri', fontSize: 11.0, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'A bumper is not finished when it comes off the press. It gets painted, and paint is not a rounding error. ' +
    'The formula at the top is the standard paint-shop calculation. Wet litres equals the area, times the dry film thickness you need, divided by the paint\u2019s solids content times the booth\u2019s transfer efficiency. ' +
    'Take the basecoat, because that is where the money is. One point six square metres at twenty microns is thirty-two millilitres of dry paint on the part. But basecoat is only twenty-five percent solids, and only sixty percent of what the gun sprays lands on the part. So you buy about two hundred and thirteen millilitres of wet paint. At twenty-six pounds a litre, five pounds fifty-five. ' +
    'Add primer, clearcoat and six percent for rework, and paint material alone is eleven pounds. Then the line time, two operators and the masking fixtures. At China rates the paint line comes to thirteen fourteen. That is before the painter\u2019s own overhead and margin, and the honest note at the bottom says so. ' +
    'Add it to the moulded part and the painted bumper is thirty-nine pounds twenty-two. Paint is about a third of it. ' +
    'Now the box for purchasing. At sixty percent transfer efficiency, four pounds in every ten of basecoat ends up in the booth filters. Move to seventy percent and the basecoat drops to four seventy-five a part. On sixty thousand parts that is about forty-seven thousand pounds a year. A percentage uplift would have hidden that completely.'
  );
}


// ══════════ PART 2 · D2 · THE TWO FINDINGS ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Two Findings From the Moulded Part', 'Neither of these was predictable in advance — the method surfaced both', PURPLE);

  s.addShape('roundRect', { x: 0.5, y: 1.3, w: 6.05, h: 2.62, fill: { color: CARD }, line: { color: TEAL, width: 1.75 }, rectRadius: 0.1 });
  s.addShape('ellipse', { x: 0.75, y: 1.5, w: 0.5, h: 0.5, fill: { color: TEAL } });
  s.addText('1', { x: 0.75, y: 1.5, w: 0.5, h: 0.5, fontFace: 'Cambria', fontSize: 20.0, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
  s.addText('The tool is the product', { x: 1.4, y: 1.5, w: 4.9, h: 0.5, fontFace: 'Calibri', fontSize: 15.0, bold: true, color: TEAL, margin: 0, valign: 'middle' });
  s.addText([
    { text: 'Tooling is £11.20 of the £26.08 part — 43%, the biggest single bucket. ', options: { bold: true, color: NAVY } },
    { text: 'It is larger than the resin, the press and the labour ', options: { color: SLATE } },
    { text: 'added together ', options: { bold: true, color: NAVY } },
    { text: '(£4.46 + £2.45 + £0.05 = £6.96).\n\nOn the casting, tooling was £2.17 — six percent. Same method, same engine, and the money has moved to a completely different bucket.', options: { color: SLATE } },
  ], { x: 0.78, y: 2.12, w: 5.5, h: 1.7, fontFace: 'Calibri', fontSize: 11.0, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 6.78, y: 1.3, w: 6.05, h: 2.62, fill: { color: CARD }, line: { color: GREEN, width: 1.75 }, rectRadius: 0.1 });
  s.addShape('ellipse', { x: 7.03, y: 1.5, w: 0.5, h: 0.5, fill: { color: GREEN } });
  s.addText('2', { x: 7.03, y: 1.5, w: 0.5, h: 0.5, fontFace: 'Cambria', fontSize: 20.0, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
  s.addText('Offshoring barely pays here', { x: 7.68, y: 1.5, w: 4.9, h: 0.5, fontFace: 'Calibri', fontSize: 15.0, bold: true, color: GREEN, margin: 0, valign: 'middle' });
  s.addText([
    { text: 'China £26.08 against a UK £31.06 — a 19% gap. On the casting the same comparison was 55%.\n\n', options: { bold: true, color: NAVY } },
    { text: 'The tool, the packaging and the logistics do not get cheaper by moving the factory, and the resin is a world price. Only press hours and labour move — and this part has barely any labour in it.', options: { color: SLATE } },
  ], { x: 7.06, y: 2.12, w: 5.5, h: 1.7, fontFace: 'Calibri', fontSize: 11.0, margin: 0, valign: 'top' });

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
  ], { x: 0.85, y: 5.78, w: 11.65, h: 0.7, fontFace: 'Calibri', fontSize: 12.0, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'I want to stop on these two, because they are the return on doing any of this. ' +
    'Finding one. Tooling is eleven pounds twenty of a twenty-six pound part. Forty-three percent, the biggest single bucket, and larger than the resin, the press and the labour added together, which come to six ninety-six. On the casting, tooling was two seventeen, about six percent. Same method, same engine, and the money has moved to a different place. ' +
    'Finding two. China twenty-six oh eight against the UK at thirty-one oh six, a gap of about nineteen percent. On the casting it was fifty-five. The tool, the packaging and the logistics do not get cheaper when the factory moves, and polypropylene is a world price. Only press hours and labour move, and this part has almost no labour. ' +
    'Now, what each finding changes on Monday morning. ' +
    'Finding one says: stop haggling over the piece price and negotiate the tooling deal. Who owns the tool, how many parts it is spread over, and what happens at the end of the programme. Spread over five years instead of one, this part is fifteen fourteen rather than twenty-six oh eight. ' +
    'Finding two says: do not move a tooling-heavy part offshore expecting casting-sized savings. Nineteen percent, set against freight, lead time, quality risk and moving the tool, may not clear the bar. ' +
    'Before we ran this, would anyone have said the tool was forty-three percent of a bumper? I would not have. That is what the method is for.'
  );
}
// ══════════ PART 2 · E · BAND, HUMAN, AND THE CONTRAST ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Stages 11–12 · The Band, and What the Two Parts Teach', 'Same tool, same method — two completely different answers about where the money is', GREEN);

  s.addShape('roundRect', { x: 0.5, y: 1.3, w: 6.05, h: 1.88, fill: { color: CARD }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('11 · The honest range on this part', { x: 0.75, y: 1.42, w: 5.5, h: 0.28, fontFace: 'Calibri', fontSize: 12.0, bold: true, color: GREEN, margin: 0 });
  const TX = 0.78, TW = 5.5, LO = 16, HI = 37, px = v => TX + ((v - LO) / (HI - LO)) * TW;
  s.addShape('roundRect', { x: TX, y: 1.86, w: TW, h: 0.3, fill: { color: B.line }, rectRadius: 0.15 });
  s.addShape('roundRect', { x: px(19.83), y: 1.86, w: px(33.16) - px(19.83), h: 0.3, fill: { color: TEAL }, rectRadius: 0.15 });
  s.addShape('rect', { x: px(26.08) - 0.026, y: 1.79, w: 0.052, h: 0.44, fill: { color: NAVY } });
  s.addText('P10  £19.83', { x: px(19.83) - 0.6, y: 2.24, w: 1.2, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, color: MUTED, align: 'center', margin: 0 });
  s.addText('£26.08', { x: px(26.08) - 0.6, y: 2.24, w: 1.2, h: 0.22, fontFace: 'Calibri', fontSize: 10.0, bold: true, color: NAVY, align: 'center', margin: 0 });
  s.addText('P90  £33.16', { x: px(33.16) - 0.6, y: 2.24, w: 1.2, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, color: MUTED, align: 'center', margin: 0 });
  s.addText('±26% — wider than the casting, because so much of the answer rides on one tooling quotation.',
    { x: 0.78, y: 2.56, w: 5.5, h: 0.56, fontFace: 'Calibri', fontSize: 9.4, italic: true, color: MUTED, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 6.78, y: 1.3, w: 6.05, h: 1.88, fill: { color: GREEN_T }, line: { color: GREEN, width: 1.25 }, rectRadius: 0.1 });
  s.addText('12 · The lever the engineer actually has', { x: 7.03, y: 1.42, w: 5.5, h: 0.28, fontFace: 'Calibri', fontSize: 12.0, bold: true, color: GREEN, margin: 0 });
  const amort = [['1 year — 60,000 parts', '£11.20', '£26.08'], ['3 years — 180,000', '£3.73', '£16.97'], ['5 years — 300,000', '£2.24', '£15.14']];
  s.addText('Amortise the tool over', { x: 7.03, y: 1.74, w: 2.5, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: MUTED, margin: 0 });
  s.addText('Tooling/part', { x: 9.6, y: 1.74, w: 1.3, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: MUTED, align: 'right', margin: 0 });
  s.addText('Part cost', { x: 11.0, y: 1.74, w: 1.5, h: 0.22, fontFace: 'Calibri', fontSize: 8.5, bold: true, color: MUTED, align: 'right', margin: 0 });
  amort.forEach(([k, t, v], i) => {
    const y = 1.99 + i * 0.29;
    s.addText(k, { x: 7.03, y, w: 2.5, h: 0.26, fontFace: 'Calibri', fontSize: 10.0, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(t, { x: 9.6, y, w: 1.3, h: 0.26, fontFace: 'Calibri', fontSize: 10.0, color: SLATE, align: 'right', margin: 0, valign: 'middle' });
    s.addText(v, { x: 11.0, y, w: 1.5, h: 0.26, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: i === 2 ? GREEN : NAVY, align: 'right', margin: 0, valign: 'middle' });
  });
  s.addText('Same part, same supplier — a commercial decision worth £10.94.', { x: 7.03, y: 2.88, w: 5.5, h: 0.26, fontFace: 'Calibri', fontSize: 9.0, bold: true, italic: true, color: GREEN, margin: 0 });

  // ── the contrast ──
  s.addShape('roundRect', { x: 0.5, y: 3.34, w: 12.33, h: 2.42, fill: { color: CARD }, line: { color: NAVY, width: 1.5 }, rectRadius: 0.1 });
  s.addText('TWO PARTS, ONE METHOD — and the money is in a completely different place', { x: 0.8, y: 3.45, w: 11.5, h: 0.28, fontFace: 'Calibri', fontSize: 12.0, bold: true, color: NAVY, charSpacing: 0.3, margin: 0 });
  const hdr = ['', 'Die-cast housing', 'Bumper fascia', 'What it means'];
  const cx = [0.8, 3.7, 6.1, 8.5];
  const cw = [2.8, 2.3, 2.3, 4.3];
  hdr.forEach((h, i) => s.addText(h, { x: cx[i], y: 3.78, w: cw[i], h: 0.24, fontFace: 'Calibri', fontSize: 9.0, bold: true, color: MUTED, margin: 0 }));
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
  ], { x: 0.85, y: 6.0, w: 11.65, h: 0.62, fontFace: 'Calibri', fontSize: 12.0, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'Last two stages, and then the payoff. ' +
    'Stage eleven, the range. Nineteen eighty-three to thirty-three sixteen, about plus or minus twenty-six percent. That is wider than the casting, because so much of this answer rides on one tooling number, and tooling is the input the tool trusts least. The band shows you where the risk sits. ' +
    'Stage twelve, and here the engineer has a lever the casting did not offer: how long is the tool spread over? The tool spreads tooling over annual volume times programme life. Over one year, tooling is eleven twenty and the part is twenty-six oh eight. Over three years, three seventy-three and just under seventeen pounds. Over five, two twenty-four and fifteen fourteen. Same part, same supplier, same tool, nearly eleven pounds apart. If a supplier quotes twenty-six pounds on a one-year spread, they are carrying tooling risk, and now you can talk about it properly. ' +
    'Remember this is unpainted. At UK rates the paint line adds about fifteen pounds before the painter\u2019s overhead and margin. ' +
    'The table in the middle is, for me, the most valuable slide in the pack. Making the casting cost thirty-two fifty-seven; moulding the bumper, five sixty-seven. Tooling flips from two seventeen to eleven twenty. The biggest bucket flips from process to tooling. The China to UK gap drops from fifty-five percent to nineteen. And the lever to push changes completely. ' +
    'Nobody could have told you that in advance with numbers you could defend. The method finds it.'
  );
}


// ══════════ 23a1 · NEW COMMODITY · GEAR CUTTING ══════════
// Added 12 Aug 2026. Every figure below comes from scripts/gear-worked-example.ts
// run against the shipped engine — not typed in by hand.
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'New: Gear Cutting Has Its Own Cost Model', 'Asked for by cost engineering and the plant — a gear is not a milled part with teeth drawn on', TEAL);
  owner(s, 10.33, 0.28, 'OWNER: THE ENGINE', TEAL, TEAL_T);

  // ── the problem, stated plainly ──
  s.addShape('roundRect', { x: 0.5, y: 1.22, w: 12.33, h: 0.62, fill: { color: AMBER_T }, line: { color: AMBER, width: 1.25 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Before: ', options: { bold: true, color: AMBER, fontSize: 11.0 } },
    { text: 'a transmission gear went through the machining model as a generic milled part. That model cannot see teeth, module or quality grade — and those three things are what a gear actually costs.', options: { color: SLATE, fontSize: 10.5 } },
  ], { x: 0.72, y: 1.22, w: 11.9, h: 0.62, fontFace: 'Calibri', margin: 0, valign: 'middle' });

  // ── the central idea: quality grade ADDS operations ──
  s.addText('The idea that makes it work: a tighter quality grade adds OPERATIONS, it is not a multiplier',
    { x: 0.5, y: 2.02, w: 12.33, h: 0.28, fontFace: 'Calibri', fontSize: 12.5, bold: true, color: NAVY, margin: 0 });

  // Drawn as a ROUTE, not a sentence. The whole claim of the slide is that a
  // tighter class adds stations, and an arrow chain shows that at a glance in a
  // way an arrow typed inside a text string never can — the third row is
  // visibly a different line, and the second is visibly two stations longer.
  // Sized so the LONGEST route (5 stations) still clears the price column at
  // 10.90": 3.95 + 4x(1.18+0.22) + 1.18 = 10.73".
  const STEP_W = 1.18, STEP_H = 0.40, STEP_GAP = 0.22, ROUTE_X = 3.95;
  const rows = [
    ['ISO class 9 — as cut',            ['Hob', 'Deburr', 'Inspect'],                        '£8.26',  '95 s',  GREEN, []],
    ['ISO class 6 — hardened + ground', ['Hob', 'Deburr', 'Carburise', 'Grind', 'Inspect'],  '£13.47', '141 s', AMBER, [2, 3]],
    ['Internal ring gear, class 7',     ['Power skive', 'Deburr', 'Carburise', 'Grind', 'Inspect'], '£17.02', '172 s', BLUE,  [2, 3]],
  ];
  rows.forEach(([what, steps, cost, cyc, col, added], i) => {
    const y = 2.42 + i * 0.66;
    s.addShape('roundRect', { x: 0.5, y, w: 12.33, h: 0.58, fill: { color: CARD }, line: { color: LINE, width: 0.75 }, rectRadius: 0.06 });
    s.addShape('rect', { x: 0.5, y, w: 0.055, h: 0.58, fill: { color: col } });
    s.addText(what, { x: 0.72, y, w: 3.1, h: 0.58, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: NAVY, margin: 0, valign: 'middle' });

    steps.forEach((st, k) => {
      const sx = ROUTE_X + k * (STEP_W + STEP_GAP);
      const isNew = added.includes(k);          // the stations the class bought
      s.addShape('roundRect', {
        x: sx, y: y + 0.09, w: STEP_W, h: STEP_H, rectRadius: 0.05,
        fill: { color: isNew ? col : 'FFFFFF' },
        line: { color: isNew ? col : MUTED, width: isNew ? 1.25 : 0.75 },
      });
      s.addText(st, {
        x: sx, y: y + 0.09, w: STEP_W, h: STEP_H, fontFace: 'Calibri', fontSize: 8.2,
        bold: isNew, color: isNew ? 'FFFFFF' : SLATE, align: 'center', margin: 0, valign: 'middle',
      });
      if (k < steps.length - 1) {
        s.addShape('line', {
          x: sx + STEP_W + 0.045, y: y + 0.09 + STEP_H / 2, w: STEP_GAP - 0.09, h: 0,
          line: { color: MUTED, width: 1.5, endArrowType: 'triangle' },
        });
      }
    });

    s.addText(cost, { x: 10.9, y, w: 1.0, h: 0.58, fontFace: 'Cambria', fontSize: 15.0, bold: true, color: col, align: 'right', margin: 0, valign: 'middle' });
    s.addText(cyc,  { x: 11.95, y, w: 0.85, h: 0.58, fontFace: 'Calibri', fontSize: 9.5, color: MUTED, align: 'right', margin: 0, valign: 'middle' });
  });
  // Legend for the highlight, so the colour is read as meaning rather than decoration.
  s.addShape('roundRect', { x: ROUTE_X, y: 4.44, w: 0.22, h: 0.13, fill: { color: AMBER }, rectRadius: 0.03 });
  s.addText('= the station the tighter class ADDED — not the same work costing more',
    { x: ROUTE_X + 0.3, y: 4.38, w: 8.0, h: 0.24, fontFace: 'Calibri', fontSize: 9.0, italic: true, color: MUTED, margin: 0, valign: 'middle' });

  s.addShape('roundRect', { x: 0.5, y: 4.72, w: 6.05, h: 1.36, fill: { color: TEAL_T }, line: { color: TEAL, width: 1 }, rectRadius: 0.08 });
  s.addText('THE CYCLE TIME IS ARITHMETIC, NOT A GUESS', { x: 0.7, y: 4.80, w: 5.7, h: 0.22, fontFace: 'Calibri', fontSize: 9.0, bold: true, color: TEAL, charSpacing: 0.5, margin: 0 });
  s.addText('A hob with Ns starts at n rpm drives a z-tooth gear at n×Ns/z. That is a gear train, not an estimate — so the tool prints the sum:',
    { x: 0.7, y: 5.03, w: 5.7, h: 0.42, fontFace: 'Calibri', fontSize: 9.5, color: SLATE, margin: 0 });
  s.addText('travel 45.3 mm at 2.2 mm/rev × 1 cut = 32 s cutting + 18 s handling',
    { x: 0.7, y: 5.46, w: 5.7, h: 0.55, fontFace: 'Consolas', fontSize: 8.6, color: NAVY, margin: 0, valign: 'top' });

  s.addShape('roundRect', { x: 6.78, y: 4.72, w: 6.05, h: 1.36, fill: { color: BLUE_T }, line: { color: BLUE, width: 1 }, rectRadius: 0.08 });
  s.addText('IT PICKS THE MACHINE, AND REFUSES WHEN IT CANNOT', { x: 6.98, y: 4.80, w: 5.7, h: 0.22, fontFace: 'Calibri', fontSize: 9.0, bold: true, color: BLUE, charSpacing: 0.5, margin: 0 });
  [['15 gear machines in the library — hob, shape, skive, grind, broach, hone', 0],
   ['Sized on module × diameter × face width, not diameter alone', 1],
   ['A gear beyond every machine is BLOCKED, never costed on the biggest one', 2]]
    .forEach(([t, i]) => {
      const y = 5.06 + i * 0.33;
      s.addShape('ellipse', { x: 7.02, y: y + 0.09, w: 0.09, h: 0.09, fill: { color: BLUE } });
      s.addText(t, { x: 7.22, y, w: 5.45, h: 0.34, fontFace: 'Calibri', fontSize: 9.0, color: SLATE, margin: 0, valign: 'middle' });
    });

  s.addShape('roundRect', { x: 0.5, y: 6.20, w: 12.33, h: 0.5, fill: { color: 'FDEEEC' }, line: { color: RED, width: 1 }, rectRadius: 0.07 });
  s.addText([
    { text: 'Said plainly: ', options: { bold: true, color: RED, fontSize: 10.0 } },
    { text: 'all 88 shop numbers — feeds, speeds, tool life, heat-treat rates — are representative, not from your plant. The tool prints that warning on every gear estimate. It shows the right structure; it is not yet a quotable number.', options: { color: SLATE, fontSize: 10.0 } },
  ], { x: 0.72, y: 6.20, w: 11.9, h: 0.5, fontFace: 'Calibri', margin: 0, valign: 'middle' });

  footer(s, ++PG);
  s.addNotes(
    'This one is new, and it came straight from you. Cost engineering and the plant asked why gears went through the tool as if they were milled parts. Fair question: that is what was happening, and the machining model cannot see a tooth. ' +
    'So gear cutting now has its own model, and it is one of the thirteen commodities that can be costed from CAD. Look at the three rows. The first two are the same gear, same size, same programme. Only the accuracy we ask for changes. ' +
    'Top row, ISO class nine, as cut: hob it, deburr it, inspect it. Eight pounds twenty-six. Middle row, class six. Now it must be carburised, and because hardening distorts it, it must then be ground. Two extra operations. Thirteen forty-seven. ' +
    'That is the key idea. A tighter gear does not make the same operations cost more. It adds operations. A tool that just multiplies by one point four is wrong, in the direction that loses you money. ' +
    'Bottom row, an internal ring gear. A hob cannot get inside a bore, so the tool uses power skiving. Skiving holds class six as cut, but hardening distorts it, so class seven after heat treat needs grinding too. Seventeen pounds oh two. Geometry decides the route, not preference. ' +
    'The cycle time is gear-train arithmetic, printed so your plant can argue with it. ' +
    'The red bar is me being straight. The structure is right, but all eighty-eight shop numbers are representative, not yours. The tool prints that warning on every gear estimate. Give us your feeds and speeds and it becomes a real should-cost.'
  );
}

// ══════════ 23a2 · WHAT THE GEAR AUDIT FOUND ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'We Then Attacked Our Own Gear Model', 'Seven faults found — every one of them returned a confident, sensible-looking number', RED);
  owner(s, 10.33, 0.28, 'OWNER: US', RED, 'FDEEEC');

  const faults = [
    ['Volume did nothing', 'The same gear cost £13.05 at 1,000 a year and £13.05 at a million a year. Identical to the penny.', 'Fixture, programming, first-article and broach capital now amortise, so a low-volume gear correctly costs more than a high-volume one.'],
    ['A gear with zero teeth got a price', '£11.12. So did negative teeth and zero face width. A zero amortisation volume returned "not a number".', 'Impossible definitions are now refused, each naming the field that is wrong.'],
    ['Internal gear, wrong grinder', 'A generating grinder works from outside and cannot enter a bore. Not a smaller machine — the wrong machine.', 'Grinder choice is now internal-aware; honing and shaving are refused on internal gears.'],
    ['Grade stopped mattering once ground', 'Class 6, 5 and 4 all ground for exactly 39.3 seconds — contradicting the whole point of the model.', 'Tighter classes now buy spark-out passes, and the tool shows them in the sum.'],
  ];
  faults.forEach(([t, was, now], i) => {
    const y = 1.3 + i * 1.16;
    s.addShape('roundRect', { x: 0.5, y, w: 12.33, h: 1.06, fill: { color: CARD }, line: { color: LINE, width: 0.75 }, rectRadius: 0.07 });
    s.addShape('rect', { x: 0.5, y, w: 0.055, h: 1.06, fill: { color: RED } });
    s.addText(t, { x: 0.74, y: y + 0.08, w: 3.5, h: 0.3, fontFace: 'Calibri', fontSize: 11.0, bold: true, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(was, { x: 0.74, y: y + 0.4, w: 3.5, h: 0.58, fontFace: 'Calibri', fontSize: 8.6, color: MUTED, margin: 0, valign: 'top' });
    s.addShape('roundRect', { x: 4.4, y: y + 0.14, w: 8.28, h: 0.78, fill: { color: GREEN_T }, rectRadius: 0.06 });
    s.addText(now, { x: 4.6, y: y + 0.14, w: 7.9, h: 0.78, fontFace: 'Calibri', fontSize: 9.8, color: SLATE, margin: 0, valign: 'middle' });
  });

  s.addShape('roundRect', { x: 0.5, y: 6.02, w: 12.33, h: 0.5, fill: { color: TEAL_T }, line: { color: TEAL, width: 1 }, rectRadius: 0.07 });
  s.addText('All seven are now locked down by automated tests, so they cannot quietly come back. Total suite today: 2,438 tests.',
    { x: 0.72, y: 6.02, w: 11.9, h: 0.5, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: TEAL, margin: 0, valign: 'middle' });

  footer(s, ++PG);
  s.addNotes(
    'This slide is a list of our own mistakes, and I think it should give you more confidence, not less. ' +
    'After building the gear model, we did not just test that it worked. We attacked it. We fed it nonsense on purpose and looked for answers that were wrong but looked right. That is the dangerous kind of wrong. You can argue with a number that looks silly. You cannot argue with one that looks fine. ' +
    'We found seven faults. Four are on the slide. ' +
    'First, volume did nothing. The same gear cost the same to the penny at a thousand a year and at a million. We had not modelled the one-off costs: the fixture, the programming, the first-article approval, the broach. Now they are in, and a low-volume gear correctly costs more. ' +
    'Second, a gear with zero teeth got a price. It should have been refused. Now impossible definitions are refused, and the tool says which field is wrong. ' +
    'Third, internal ring gears were sent to a grinder that cannot reach inside a bore. Your plant would have spotted that in a second. ' +
    'Fourth, once a gear was being ground, asking for tighter accuracy changed nothing. Now tighter classes buy extra finishing passes, shown in the sum. ' +
    'All seven are fixed and locked down by tests. The whole suite today is 2,438 tests. I would rather show you this than have your plant find it in a meeting.'
  );
}

// ══════════ 23b · WHAT IT CANNOT DO ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'What This Tool Cannot Do', 'The limits, from us rather than from a sceptic in the room', RED);

  const lims = [
    ['Cost an assembly from one CAD file', 'It rolls up an assembly from parts you have already costed. It cannot open one assembly model, work out which parts are in it, how they join, or what the assembly labour is. Multi-part programmes still need a person to define the structure.'],
    ['Read a tolerance or a surface finish', 'The kernel measures shape, exactly. It cannot see a ±0.02 callout, a Ra value or a material spec unless the CAD file carries it — most do not. And an STL has no feature table, so a machined STL needs a typed cycle time.'],
    ['Prove its accuracy yet', 'No estimate has yet been compared with a price JLR paid. Six pinned parts prove the answer is stable, not that it is right. Accuracy is measured as actuals are logged; after 3 for a commodity the band is corrected.'],
    ['Replace a quotation', 'This is a should-cost: what the part ought to cost on stated assumptions. It is a negotiating instrument and a design-feedback loop, not a price, and not a substitute for an RFQ.'],
    ['Keep duty and tariff data fresh by itself', 'Rates decay. The engine blocks any rate that is unverified or older than 90 days rather than quietly using it — but somebody has to run the refresh against the official tariff service.'],
    ['Cost a process it has never met', '19 manufacturing processes are modelled, plus an assembly roll-up and a software cost model. A genuinely new process needs a new module — days of work, and a process engineer to specify it.'],
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
  ], { x: 0.85, y: 6.2, w: 11.65, h: 0.62, fontFace: 'Calibri', fontSize: 12.0, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'I would rather you heard the limits from me than found them yourselves in three months. Six of them. ' +
    'One. It cannot cost an assembly from a single CAD file. It rolls up an assembly from parts you have already costed. It cannot open one assembly model and work out the parts, the joins and the assembly labour. A person defines the structure. ' +
    'Two. It cannot read a tolerance or a surface finish unless the CAD file carries it, and most do not. Those come from the drawing or the engineer. And an STL is only a mesh, with no feature table, so a machined STL is blocked until the engineer types a cycle time. ' +
    'Three, and the most important. It cannot prove its accuracy yet. No estimate has been compared with a price JLR actually paid. The six pinned parts prove the answer is stable, not that it is right. We will measure accuracy as actuals are logged. ' +
    'Four. It does not replace a quotation. It is a should-cost: what the part ought to cost on stated assumptions. A negotiating tool and a design-feedback loop, not a price. ' +
    'Five. It cannot keep duty and tariff data fresh by itself. It blocks a rate that is unverified or over ninety days old, but someone has to run the refresh. ' +
    'Six. It cannot cost a process it has never met. Nineteen are modelled. A new one needs a new module and a process engineer. ' +
    'A tool that claims no limits should not be trusted in a supplier negotiation.'
  );
}


FOOT = 'CostVision · appendix — reference material';
divider('APPENDIX', 'Reference Material', 'Everything behind the numbers — kept out of the main hour, here when it is asked for', AMBER,
  ['The complete DFM/DFA rule library — 52 threshold rules, 10 geometry advisors, 36 idea levers',
   'What engineering actually sees: opportunities ranked by money, never a score',
   'Technical architecture — languages, code size, licences and what calls out',
   'Backup: the data contracts, field by field'],
  null,
  'That is the end of the hour. Everything from here is reference material. I do not plan to present it. It is here so that when someone asks how the DFM rules work, what the tool is built from, or whether anything calls out to the internet, the answer is in the pack and not only in my head. ' +
  'There are two groups. First, the complete DFM and DFA rule library: every threshold rule, every geometry advisor and every idea lever, with the exact numbers they fire on. It was transcribed from the engine\u2019s source code, so if the engine changes, these slides must change too. ' +
  'Second, the technical architecture for engineers: what each box is built from, what data passes between them, the licences, and a straight answer on what talks to the outside world. In the JLR build, with AI off, the answer is nothing on the costing path. ' +
  'Jump to whichever gets asked about.');

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
    s.addText(n, { x: x + 0.16, y: 1.4, w: 1.0, h: 0.6, fontFace: 'Cambria', fontSize: 32.0, bold: true, color: col, margin: 0, valign: 'middle' });
    s.addText(unit, { x: x + 1.14, y: 1.46, w: 1.75, h: 0.5, fontFace: 'Calibri', fontSize: 12.0, bold: true, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(body, { x: x + 0.16, y: 2.12, w: 2.63, h: 1.16, fontFace: 'Calibri', fontSize: 8.8, color: SLATE, margin: 0, valign: 'top' });
  });

  s.addShape('roundRect', { x: 0.5, y: 3.56, w: 12.33, h: 1.56, fill: { color: TEAL_T }, line: { color: TEAL, width: 1.25 }, rectRadius: 0.1 });
  s.addText('HOW IT WORKS — FIVE STEPS, ALL ARITHMETIC', { x: 0.8, y: 3.66, w: 11.5, h: 0.24, fontFace: 'Calibri', fontSize: 9.0, bold: true, color: TEAL, charSpacing: 0.5, margin: 0 });
  const steps = [
    ['1 · Read', 'The finished costing is reduced to 10 core parameters and 9 extended signals — buckets, operations, tooling basis, pack rates.'],
    ['2 · Check', 'All 52 threshold rules run — each a plain test like "tooling above 20% of part cost" — and the geometry advisors read the solid.'],
    ['3 · Rank', 'Each finding is priced in £/part against this costing and ranked biggest-first inside its category. No score is published, and no severity label.'],
    ['4 · Size', 'The three biggest savings are combined (root-sum-square, capped at 40%) — so overlapping fixes are never double-counted.'],
    ['5 · Suggest', 'The 36-lever catalogue produces a ranked action list — categorised, priced from the part’s own numbers, biggest saving first.'],
  ];
  steps.forEach(([h, t], i) => {
    const x = 0.72 + i * 2.4;
    s.addText(h, { x, y: 3.94, w: 2.25, h: 0.24, fontFace: 'Calibri', fontSize: 10.0, bold: true, color: NAVY, margin: 0 });
    s.addText(t, { x, y: 4.2, w: 2.25, h: 0.86, fontFace: 'Calibri', fontSize: 8.2, color: SLATE, margin: 0, valign: 'top' });
  });

  s.addShape('roundRect', { x: 0.5, y: 5.28, w: 12.33, h: 0.7, fill: { color: PURPLE_T }, line: { color: PURPLE, width: 1, dashType: 'dash' }, rectRadius: 0.1 });
  s.addText([
    { text: 'Where the AI sits:  ', options: { bold: true, color: PURPLE } },
    { text: 'nowhere in the rules. Every check and saving on the next seven slides is deterministic engine code. The optional "AI deep analysis" (off at JLR) only writes commentary on findings the rules made — it cannot add, remove or re-rank one.', options: { color: SLATE } },
  ], { x: 0.8, y: 5.33, w: 11.75, h: 0.6, fontFace: 'Calibri', fontSize: 10.5, margin: 0, valign: 'middle' });

  s.addShape('roundRect', { x: 0.5, y: 6.14, w: 12.33, h: 0.76, fill: { color: NAVY }, rectRadius: 0.1 });
  s.addText([
    { text: 'What the next seven slides are:  ', options: { bold: true, color: '9FB6E0' } },
    { text: 'the complete rule book, transcribed from the tool’s source code — the 19 parameters, all 52 rules with exact thresholds, the 10 geometry advisors, and all 36 idea levers.', options: { color: 'FFFFFF' } },
  ], { x: 0.85, y: 6.22, w: 11.65, h: 0.6, fontFace: 'Calibri', fontSize: 12.0, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'This appendix exists because of a fair question: when the tool lists a dozen cost-reduction ideas, where do they actually come from? ' +
    'The answer is a written rule book, small enough to show in full. Fifty-two threshold rules reading nineteen parameters and signals. Ten geometry advisors reading the measured solid. And a thirty-six lever idea catalogue across eight categories: material, design, process, tooling, logistics, commercial, quality and sustainability. That is the whole analysis. There is no hidden model behind it. ' +
    'The first version of this layer was thinner, about ten levers, mostly on cost structure. We took the challenge that it read like a checklist rather than what a good value engineer would produce, and rebuilt it. ' +
    'The flow is five steps, all arithmetic. Reduce the costing to its parameters. Run the fifty-two checks, while the advisors check the shape. Price each finding in pounds per part and rank it. Combine the top three by root-sum-square, capped at forty percent, so overlapping ideas are not double-counted. Then turn what fired into a ranked, categorised action list. ' +
    'And the AI is nowhere in this. Same part in, same findings out, with the network cable unplugged. At JLR the AI is off anyway. If it were on, it could comment on findings, but not add, remove or re-rank one.'
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
    s.addText(r[0], { x: cx[0], y: y + 0.07, w: 0.26, h: 0.26, fontFace: 'Calibri', fontSize: 9.0, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    s.addText(r[1], { x: cx[1], y, w: cw[1], h: 0.4, fontFace: 'Calibri', fontSize: 10.0, bold: true, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(r[2], { x: cx[2], y, w: cw[2], h: 0.4, fontFace: 'Calibri', fontSize: 8.8, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(r[3], { x: cx[3], y, w: cw[3], h: 0.4, fontFace: 'Calibri', fontSize: 8.4, italic: true, color: MUTED, margin: 0, valign: 'middle' });
  });
  s.addText('Teal — read straight off the finished costing.   Blue — entered with the part (a stated assumption is used when left blank).',
    { x: 0.5, y: 5.86, w: 9.75, h: 0.22, fontFace: 'Calibri', fontSize: 8.2, italic: true, color: MUTED, margin: 0 });

  // extended signals
  s.addShape('roundRect', { x: 0.5, y: 6.14, w: 9.75, h: 0.86, fill: { color: 'EDF3FB' }, line: { color: BLUE, width: 1 }, rectRadius: 0.08 });
  s.addText('+ 9 EXTENDED SIGNALS (added with the 360° upgrade)', { x: 0.68, y: 6.2, w: 9.4, h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: BLUE, charSpacing: 0.5, margin: 0 });
  s.addText('11 packaging share · 12 logistics share · 13 labour efficiency · 14 per-operation cost split (which op carries the money) · 15 consumables cost (cores, patterns, shell) · 16 tooling investment (NRE) and its amortisation basis vs the annual volume · 17 manning and parts-per-cycle · 18 labour-vs-machine cycle time · 19 operation names (welding, inspection, rework, heat-treat signals)',
    { x: 0.68, y: 6.4, w: 9.4, h: 0.56, fontFace: 'Calibri', fontSize: 8.2, color: SLATE, margin: 0, valign: 'top' });

  // ranking card — deliberately NOT a scoring card
  s.addShape('roundRect', { x: 10.45, y: 1.48, w: 2.38, h: 5.52, fill: { color: CARD }, line: { color: GREEN, width: 1.5 }, rectRadius: 0.1 });
  s.addText('HOW THE RANKING\nWORKS', { x: 10.62, y: 1.62, w: 2.05, h: 0.55, fontFace: 'Calibri', fontSize: 10.0, bold: true, color: GREEN, charSpacing: 0.4, margin: 0 });
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
    'These are the numbers the analysis is allowed to read, and nothing else goes in. Ten core parameters, and nine extended signals. ' +
    'The ten core ones are the total, the six bucket shares, the operation count, equipment effectiveness and material utilisation. The teal ones are read straight from the costing. The blue ones are entered with the part, and a stated assumption is used when they are left blank. ' +
    'The nine extended signals are what let the rules behave like an experienced cost engineer rather than a checklist. Packaging and logistics shares. Labour efficiency. Which single operation carries the money. Consumables like cores and patterns. The tooling investment and whether it is spread over the stated annual volume. Manning and parts per cycle. Labour time against machine time. And the operation names themselves, because words like rework or inspection in a routing are signals. ' +
    'The card on the right changed after feedback from this room. It used to be a score out of ten. Now it is a ranking. Every finding is priced against this part and ranked biggest first. No score and no severity label is shown to an engineer. A previous exercise that scored designs was read as a report card, and nothing got implemented. ' +
    'Finally, the context gates. If the volume was assumed, or pack rates were estimated, a lever downgrades itself to a confirm-first note. The tool does not instruct on facts nobody gave it.'
  );
}

// ══════════ A3 · RULE LIBRARY 1/3 — 14 UNIVERSAL DFM CHECKS ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Rule Library 1 of 3 — 14 Checks on Every Part', 'Universal manufacturability rules, any commodity · thresholds exactly as coded', TEAL);
  owner(s, 10.33, 0.28, 'OWNER: THE ENGINE', TEAL, TEAL_T);

  const rcx = [0.72, 4.1, 9.85, 12.0], rcw = [3.3, 5.6, 2.0, 0.65];
  s.addText('RULE', { x: rcx[0], y: 1.26, w: rcw[0], h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('FIRES WHEN', { x: rcx[1], y: 1.26, w: rcw[1], h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('SEVERITY', { x: rcx[2], y: 1.26, w: rcw[2], h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('SAVE', { x: rcx[3], y: 1.26, w: rcw[3], h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: MUTED, align: 'right', charSpacing: 0.5, margin: 0 });

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
    s.addText(r[1], { x: rcx[1], y, w: rcw[1], h: 0.3, fontFace: 'Calibri', fontSize: 9.0, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(r[2], { x: rcx[2], y, w: rcw[2], h: 0.3, fontFace: 'Calibri', fontSize: 9.0, bold: true, color: SEV[r[2]], margin: 0, valign: 'middle' });
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
  s.addText('COMMODITY', { x: ccx[0], y: 1.2, w: ccw[0], h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('CHECK', { x: ccx[1], y: 1.2, w: ccw[1], h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('FIRES WHEN', { x: ccx[2], y: 1.2, w: ccw[2], h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('SEVERITY', { x: ccx[3], y: 1.2, w: ccw[3], h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('SAVE', { x: ccx[4], y: 1.2, w: ccw[4], h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: MUTED, align: 'right', charSpacing: 0.4, margin: 0 });

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
    'The second third: twenty-seven checks that switch on for the specific process being costed. A casting is never judged by sheet-metal rules. ' +
    'What changed in the upgrade. Extrusion and rotational moulding now have their own rules: conversion cost and offcut scrap for extrusion, oven cycle and secondary operations for rotomoulding. Painting gains a rule this deck argued for earlier: paint material above forty percent of cost points straight at transfer efficiency. And cast-and-machine parts now run both the machining rules and the casting rules, where before they fell between the two. ' +
    'The machining rules are smarter than a count. The split-routing rule knows the difference between seven operations across five machines and seven operations on one five-axis machine. When the routing is already consolidated, it says so as a verified note instead of recommending what has already been done. ' +
    'Note where the biggest savings sit: wiring harness and composites, where labour passes half the cost or hand lay-up dominates. Where the money is people, the rules say so plainly. ' +
    'One reminder for the whole appendix. The severity column orders the rules inside the engine. It is never shown to an engineer.'
  );
}

// ══════════ A5 · RULE LIBRARY 3/3 — 11 DFA CHECKS ══════════
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Rule Library 3 of 3 — The 11 Assembly Checks', 'DFA — setups, manual content, pacing, and what the operation list itself reveals', TEAL);
  owner(s, 10.33, 0.28, 'OWNER: THE ENGINE', TEAL, TEAL_T);

  const rcx = [0.72, 4.1, 9.85, 12.0], rcw = [3.3, 5.6, 2.0, 0.65];
  s.addText('RULE', { x: rcx[0], y: 1.26, w: rcw[0], h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('FIRES WHEN', { x: rcx[1], y: 1.26, w: rcw[1], h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('SEVERITY', { x: rcx[2], y: 1.26, w: rcw[2], h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('SAVE', { x: rcx[3], y: 1.26, w: rcw[3], h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: MUTED, align: 'right', charSpacing: 0.5, margin: 0 });

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
    s.addText(r[1], { x: rcx[1], y, w: rcw[1], h: 0.3, fontFace: 'Calibri', fontSize: 9.0, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(r[2], { x: rcx[2], y, w: rcw[2], h: 0.3, fontFace: 'Calibri', fontSize: 9.0, bold: true, color: SEV[r[2]], margin: 0, valign: 'middle' });
    s.addText(r[3], { x: rcx[3], y, w: rcw[3], h: 0.3, fontFace: 'Calibri', fontSize: 9.2, bold: true, color: TEAL, align: 'right', margin: 0, valign: 'middle' });
  });

  s.addText('Rules 8–11 are new — Boothroyd-style checks read from the operation list itself: inspection and finishing as separate steps, manning levels, and labour running past the machine cycle. With the two previous slides: 52 threshold checks in total (41 DFM + 11 DFA).',
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
  s.addText('ADVISOR', { x: acx[0], y: 1.26, w: acw[0], h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('WHAT IT READS FROM THE MEASURED SOLID', { x: acx[1], y: 1.26, w: acw[1], h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('EXAMPLE FINDING', { x: acx[2], y: 1.26, w: acw[2], h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: MUTED, charSpacing: 0.5, margin: 0 });
  s.addText('CHECKS', { x: acx[3], y: 1.26, w: acw[3], h: 0.2, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: MUTED, align: 'right', charSpacing: 0.4, margin: 0 });

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

  s.addText('75 geometry checks in total. They run alongside the 52 cost-structure rules and feed the same DFM/DFA sections of the report — deterministic, and never written by AI.',
    { x: 0.5, y: 6.62, w: 12.33, h: 0.4, fontFace: 'Calibri', fontSize: 8.5, italic: true, color: MUTED, margin: 0 });
  footer(s, ++PG);

  s.addNotes(
    'The fifty-two rules you have just seen read the cost structure. This slide is the other half of the DFM story: the ten geometry advisors, which read the measured solid itself — the walls, the draft, the radii, the spans — one advisor module per manufacturing process, seventy-five checks between them. ' +
    'Each row is one advisor. The casting advisor looks for the things a foundry would: heavy isolated sections that solidify last and draw porosity, missing draft, too little machining stock. The forging advisor checks webs, fillets and grain flow. Sheet metal checks bend radii against the material gauge and holes too close to an edge. Injection moulding is the busiest — ten checks covering ribs, bosses, draft, undercuts, flow length and weld lines. Blow moulding and thermoforming watch thinning — blow-up ratios and deep draws. Extrusion checks wall balance across the profile, rubber checks where the flash line lands — on a sealing face that is a leak path — lamination checks tooth and bridge widths on electrical steels, and rotomoulding checks venting and kiss-offs. ' +
    'The important sentence is the footnote. These seventy-five checks run alongside the fifty-two cost-structure rules and feed the same sections of the report. All of it is deterministic, all of it from the measured geometry. At JLR the AI is off; even when on, it could comment on these findings but never write one.'
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
    s.addText(t, { x: lcx[0], y, w: lcw[0], h: 0.21, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: NAVY, margin: 0, valign: 'middle' });
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
    'The second half of the catalogue: tooling, packaging and logistics, commercial, quality and sustainability. This is the 360 degree part. The old layer stopped at the factory gate. This one follows the part to the loading dock and into the contract. ' +
    'Tooling: spread the tool over more volume, soft tooling below twenty-five thousand parts, a tooling-ownership clause, and a tool-life programme on die processes. ' +
    'Packaging and logistics were not looked at before. Now there are returnable packaging, pack density, freight mode, and a near-shore check. If a part is already in a low-cost country and logistics is past nine percent of its cost, the tool asks the opposite of the usual question: would a nearer supplier win on landed cost? ' +
    'Commercial: regional sourcing, open-book overhead, a competitive RFQ with the should-cost as the floor, make versus buy, a raw-material index clause, a learning-curve price-down where a real volume was confirmed, and payment terms. ' +
    'Quality reads the routing and challenges standalone inspection and manual finishing at the source. Sustainability covers recycled resin and process energy. ' +
    'Two honest notes. Every lever is gated on what a person actually told the tool. And the two backstop levers exist so no part leaves with an empty list; they are labelled as backstops.'
  );
}

// ══════════ A9 · WHAT ENGINEERING ACTUALLY SEES ══════════
// Real output: the reference machined bracket's inputs (tests/reference-part.test.ts),
// run through generateDFMDFA + rankOpportunities on the current rate library.
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'What Engineering Actually Sees', 'The output for one part — ranked by money, grouped by category, nothing graded', GREEN);
  owner(s, 10.33, 0.28, 'OWNER: THE ENGINE', TEAL, TEAL_T);

  // headline strip
  s.addShape('roundRect', { x: 0.5, y: 1.18, w: 12.33, h: 0.72, fill: { color: GREEN_T }, line: { color: GREEN, width: 1.25 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Combined opportunity £5.38/part ', options: { bold: true, color: GREEN, fontSize: 13.0 } },
    { text: '(top three, root-sum-square)  ·  machined Al bracket, £24.34 at UK rates  ·  9 ideas in 4 categories — to test, not savings achieved', options: { color: SLATE, fontSize: 10.0 } },
  ], { x: 0.78, y: 1.18, w: 11.8, h: 0.72, fontFace: 'Calibri', margin: 0, valign: 'middle' });

  const ccx = [0.72, 1.25, 4.9, 10.15, 11.25, 12.15], ccw = [0.4, 3.6, 5.2, 1.0, 0.85, 1.1];
  const header = y => {
    ['#', 'ACTION', 'WHY IT IS ON THE LIST', 'SAVE/PART', 'RISK', 'TIMEFRAME'].forEach((h, i) =>
      s.addText(h, { x: ccx[i], y, w: ccw[i], h: 0.18, fontFace: 'Calibri', fontSize: 7.5, bold: true, color: MUTED, charSpacing: 0.4, margin: 0 }));
  };
  const band = (y, label, best, col, tint) => {
    s.addShape('roundRect', { x: 0.5, y, w: 12.33, h: 0.22, fill: { color: tint }, rectRadius: 0.05 });
    s.addText(label, { x: 0.72, y, w: 8, h: 0.22, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: col, charSpacing: 0.5, margin: 0, valign: 'middle' });
    s.addText(`best ${best}/part`, { x: 10.0, y, w: 2.6, h: 0.22, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: col, align: 'right', margin: 0, valign: 'middle' });
  };
  const row = (y, [n, action, why, save, risk, tf], zebra) => {
    if (zebra) s.addShape('rect', { x: 0.5, y: y - 0.005, w: 12.33, h: 0.245, fill: { color: CARD } });
    s.addText(n, { x: ccx[0], y, w: ccw[0], h: 0.24, fontFace: 'Calibri', fontSize: 8.4, bold: true, color: MUTED, margin: 0, valign: 'middle' });
    s.addText(action, { x: ccx[1], y, w: ccw[1], h: 0.24, fontFace: 'Calibri', fontSize: 8.4, bold: true, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(why, { x: ccx[2], y, w: ccw[2], h: 0.24, fontFace: 'Calibri', fontSize: 8.0, color: SLATE, margin: 0, valign: 'middle' });
    s.addText(save, { x: ccx[3], y, w: ccw[3], h: 0.24, fontFace: 'Calibri', fontSize: 9.0, bold: true, color: GREEN, align: 'right', margin: 0, valign: 'middle' });
    s.addText(risk, { x: ccx[4], y, w: ccw[4], h: 0.24, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: RISKC[risk], margin: 0, valign: 'middle' });
    s.addText(tf, { x: ccx[5], y, w: ccw[5], h: 0.24, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: TIMEC[tf], margin: 0, valign: 'middle' });
  };

  let y = 2.02;
  header(y); y += 0.2;
  band(y, 'COMMERCIAL & SOURCING · 1 opportunity', '£4.38', NAVY, 'E8EDF6'); y += 0.26;
  [
    ['1', 'Regional sourcing study (LCC)', 'Conversion cost at 69.1% of the part — real regional arbitrage', '£4.38', 'High', 'Long term'],
  ].forEach((r, i) => { row(y, r, i % 2 === 0); y += 0.25; });

  y += 0.06; band(y, 'MATERIAL · 2 opportunities', '£2.43', TEAL, TEAL_T); y += 0.26;
  [
    ['2', 'Near-net-shape / better nesting', 'Utilisation 65% against the 80–90% target', '£2.43', 'Med', 'Medium term'],
    ['3', 'Scrap revenue at index prices', '35% of bought metal leaves as chips — claim the credit', '£0.79', 'Low', 'Quick win'],
  ].forEach((r, i) => { row(y, r, i % 2 === 0); y += 0.25; });

  y += 0.06; band(y, 'PROCESS & AUTOMATION · 4 opportunities', '£1.95', BLUE, BLUE_T); y += 0.26;
  [
    ['4', 'Attack the bottleneck: "CNC Milling"', 'One operation carries 66% of the conversion cost', '£1.95', 'Med', 'Medium term'],
    ['5', 'Near-net-shape pre-form (cast/forge)', 'Machining is 45.9% of the part cost', '£1.95', 'Med', 'Medium term'],
    ['6', 'Unmanned / lights-out running', 'Machine-paced, labour 23.2%, OEE 85% — the classic profile', '£1.46', 'Med', 'Medium term'],
    ['7', 'Multi-machine manning', 'One operator per machine while the machine paces the cycle', '£1.22', 'Low', 'Quick win'],
  ].forEach((r, i) => { row(y, r, i % 2 === 0); y += 0.25; });

  y += 0.06; band(y, 'DESIGN & GEOMETRY · 2 opportunities', '£1.22', PURPLE, PURPLE_T); y += 0.26;
  [
    ['8', 'Pallet / tombstone fixturing', '3 operations across 3 stations imply repeated re-fixturing', '£1.22', 'Low', 'Quick win'],
    ['9', 'Tolerance & surface-finish relaxation', 'The tightest callouts set the machine, cycle and inspection', '£0.97', 'Low', 'Quick win'],
  ].forEach((r, i) => { row(y, r, i % 2 === 0); y += 0.25; });

  s.addShape('roundRect', { x: 0.5, y: 6.14, w: 12.33, h: 0.76, fill: { color: NAVY }, rectRadius: 0.1 });
  s.addText([
    { text: 'Read the whole slide and notice what is missing:  ', options: { bold: true, color: '9FB6E0' } },
    { text: 'no score, no “critical”, nothing that grades the design. Nine things to do, what each is worth, the risk and how long it takes — deterministic findings, presented as work rather than as a verdict.', options: { color: 'FFFFFF' } },
  ], { x: 0.85, y: 6.22, w: 11.65, h: 0.6, fontFace: 'Calibri', fontSize: 11.5, margin: 0, valign: 'middle' });
  footer(s, ++PG);

  s.addNotes(
    'This is the output for one part: a machined aluminium bracket, the same inputs as our reference part, run through today\u2019s engine and rate library. Not a mock-up. ' +
    'The part costs twenty-four thirty-four at UK rates. The tool lists nine ideas across four categories. The top three combined, by root-sum-square, come to about five pounds thirty-eight a part. Please read that as a list of ideas to test, not savings anyone has achieved. ' +
    'Commercial and sourcing comes first because it holds the biggest single idea: a regional sourcing study worth about four pounds thirty-eight a part. The tool marks it high risk and long term, rather than pretending it is free. ' +
    'Material second: near-net shape or better nesting, and a scrap-credit clause that costs nothing but a conversation. ' +
    'Process third, led by the bottleneck lever that names the operation. CNC milling carries sixty-six percent of the conversion cost here, so that is where cycle-time work pays. ' +
    'Design last on this part: pallet fixturing and relaxing tolerances. ' +
    'Now notice what is missing. No score, no critical, nothing that grades the part or the person who designed it. The same deterministic arithmetic, shown as a work list instead of a verdict. That was the feedback, and I think it is right.'
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
    s.addText(job, { x: x + 0.06, y: y + 0.58, w: w - 0.12, h: 0.42, fontFace: 'Calibri', fontSize: 7.5, color: SLATE, align: 'center', margin: 0, valign: 'top' });
    // the hand-off
    s.addShape('roundRect', { x: x + 0.06, y: y + 1.02, w: w - 0.12, h: 0.54, fill: { color: 'F0F4F9' }, line: { color: LINE, width: 0.75 }, rectRadius: 0.05 });
    s.addText('HANDS ON', { x: x + 0.06, y: y + 1.04, w: w - 0.12, h: 0.12, fontFace: 'Calibri', fontSize: 7.5, bold: true, color: MUTED, align: 'center', charSpacing: 0.3, margin: 0 });
    s.addText(obj, { x: x + 0.03, y: y + 1.16, w: w - 0.06, h: 0.14, fontFace: 'Calibri', fontSize: 7.5, bold: true, color: NAVY, align: 'center', margin: 0 });
    s.addText(objPlain, { x: x + 0.06, y: y + 1.30, w: w - 0.12, h: 0.24, fontFace: 'Calibri', fontSize: 7.5, color: SLATE, align: 'center', margin: 0, valign: 'top' });
  };

  step(0.50, 1, 'Upload', 'A CAD file, or a typed commodity form', 'the file', 'STEP · IGES · STL · DXF', BLUE);
  step(1.78, 2, 'Measure', 'The Python kernel measures the solid', 'OCCTGeometry', 'size, walls, holes, draft', AMBER);
  step(3.06, 3, 'Derive', 'Rules turn measurements into cost inputs', 'cost inputs', 'material, operations, tooling', TEAL);

  s.addShape('line', { x: 4.28, y: 1.87, w: 0.22, h: 0, line: { color: TEAL, width: 2.5, endArrowType: 'triangle' } });

  // ── the cost engine, in the middle ──
  s.addShape('roundRect', { x: 4.54, y: 1.06, w: 4.26, h: 1.62, fill: { color: TEAL_T }, line: { color: TEAL, width: 2 }, rectRadius: 0.1 });
  s.addText('THE COST ENGINE  ·  src/engine/', { x: 4.68, y: 1.11, w: 4.0, h: 0.22, fontFace: 'Calibri', fontSize: 10.5, bold: true, color: TEAL, margin: 0, valign: 'middle' });
  s.addText('TypeScript · ~30,500 lines · 2,438 tests · runs in browser and server',
    { x: 4.68, y: 1.32, w: 4.0, h: 0.18, fontFace: 'Calibri', fontSize: 7.5, italic: true, color: NAVY, margin: 0 });
  [['core.ts: the 8 cost buckets', 0], ['19 commodity modules', 1], ['Optimisers pick the machine', 2], ['Guardrails check every number', 3]]
    .forEach(([t, i]) => {
      const cx = 4.68 + (i % 2) * 2.02, cy = 1.53 + Math.floor(i / 2) * 0.185;
      s.addShape('ellipse', { x: cx, y: cy + 0.05, w: 0.07, h: 0.07, fill: { color: TEAL } });
      s.addText(t, { x: cx + 0.12, y: cy, w: 1.9, h: 0.18, fontFace: 'Calibri', fontSize: 7.5, color: SLATE, margin: 0, valign: 'middle' });
    });
  s.addShape('roundRect', { x: 4.68, y: 1.92, w: 3.98, h: 0.3, fill: { color: CARD }, line: { color: TEAL, width: 0.75 }, rectRadius: 0.05 });
  s.addText([
    { text: 'HANDS ON  ', options: { fontSize: 7.5, bold: true, color: MUTED } },
    { text: 'PartCostResult', options: { fontFace: MONO, fontSize: 7.5, bold: true, color: NAVY } },
    { text: '  — 8 buckets + where each number came from', options: { fontSize: 7.5, color: SLATE } },
  ], { x: 4.76, y: 1.92, w: 3.82, h: 0.3, fontFace: 'Calibri', margin: 0, valign: 'middle' });
  s.addShape('roundRect', { x: 4.68, y: 2.28, w: 3.98, h: 0.3, fill: { color: NAVY }, rectRadius: 0.05 });
  s.addText('Numbers in, numbers out. No database, no network, no file access.',
    { x: 4.78, y: 2.28, w: 3.78, h: 0.3, fontFace: 'Calibri', fontSize: 7.5, bold: true, color: 'FFFFFF', margin: 0, valign: 'middle' });

  s.addShape('line', { x: 8.84, y: 1.87, w: 0.22, h: 0, line: { color: TEAL, width: 2.5, endArrowType: 'triangle' } });

  step(9.08, 4, 'Check', 'Guardrails, self-audit and the confidence band', 'a checked cost', 'plus any warnings', AMBER);
  step(10.36, 5, 'Rank', 'Findings become savings, ranked by money', 'ranked ideas', 'what to do, what it is worth', GREEN);
  step(11.64, 6, 'Keep', 'Saved locally; reports made in the browser', 'SQLite', '14 tables · PDF · Excel', PURPLE);

  // ── what is actually inside those parcels ────────────────────────────────
  s.addShape('roundRect', { x: 0.5, y: 2.78, w: 12.33, h: 0.66, fill: { color: 'F0F4F9' }, line: { color: LINE, width: 1 }, rectRadius: 0.07 });
  s.addText('WHAT IS INSIDE EACH PARCEL', { x: 0.68, y: 2.82, w: 3, h: 0.16, fontFace: 'Calibri', fontSize: 7.5, bold: true, color: MUTED, charSpacing: 0.4, margin: 0 });
  const parcels = [
    ['OCCTGeometry', 'bounding box · volume · wall thickness · draft angles · setup count · hole and boss table'],
    ['UniversalStackInput', 'material and utilisation · per-operation cycle time, OEE, manning · tooling · overhead · margin'],
    ['PartCostResult', 'the 8 buckets · cost per operation · total · a traceability row per figure (value, unit, rate)'],
    ['RankedOpportunities', 'each idea with its saving in £/part, risk, timeframe and owner — grouped by category, biggest first'],
  ];
  parcels.forEach(([k, v], i) => {
    const y = 2.99 + (i % 2) * 0.20, x = 0.68 + Math.floor(i / 2) * 6.15;
    s.addText(k, { x, y, w: 1.32, h: 0.18, fontFace: MONO, fontSize: 7.5, bold: true, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(v, { x: x + 1.34, y, w: 4.7, h: 0.18, fontFace: 'Calibri', fontSize: 7.5, color: SLATE, margin: 0, valign: 'middle' });
  });

  // ── the facts table ───────────────────────────────────────────────────────
  const cx = [0.5, 3.05, 6.10, 7.22, 9.72], cw = [2.55, 2.95, 0.80, 2.40, 3.11];
  const th = ['Component', 'Built with', 'Lines', 'Free to use?', 'Calls out to the internet?'];
  th.forEach((h, i) => s.addText(h, { x: cx[i], y: 3.54, w: cw[i], h: 0.24, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: i === 2 ? 'right' : 'left', valign: 'middle', margin: 0.06 }));

  const rows = [
    ['Geometry kernel', 'Python 3 + Open CASCADE (via OCP)', '~2,500', 'Yes — LGPL-2.1 + exc. / Apache-2.0', 'No', GREEN],
    ['3D viewer', 'TypeScript + three.js (WebGL)', '~2,200', 'Yes — MIT', 'No', GREEN],
    ['Cost engine (core + 19 modules)', 'TypeScript, no framework', '~30,500', 'Yes — our own code', 'No', GREEN],
    ['Cost-input rules (13 commodities)', 'TypeScript, inside the engine', '~8,900', 'Yes — our own code', 'No', GREEN],
    ['Optimisers + DFM / idea levers', 'TypeScript, inside the engine', 'in engine', 'Yes — our own code', 'No', GREEN],
    ['Guardrails + self-audit', 'TypeScript (engine + server)', 'in engine', 'Yes — our own code', 'No', GREEN],
    ['Rate library — 20 regions', 'TypeScript data files, in git', 'in engine', 'Yes — our own data', 'No', GREEN],
    ['Server + database', 'TypeScript · Express + SQLite', '~17,300', 'Yes — MIT', 'Localhost only', GREEN],
    ['AI — OFF AT JLR (optional)', 'TypeScript · Anthropic SDK', '—', 'SDK free · API paid per token', 'Only if switched on', PURPLE],
    ['Automated tests', 'TypeScript · Vitest', '~28,300', 'Yes — MIT', 'No', GREEN],
  ];
  rows.forEach((r, ri) => {
    const y = 3.78 + ri * 0.196;
    const ai = ri === 8;
    [0, 1, 2, 3, 4].forEach(i => {
      s.addText(String(r[i]), {
        x: cx[i], y, w: cw[i], h: 0.196, fontFace: 'Calibri', fontSize: 7.5,
        bold: i === 0 || i === 4, italic: i === 2,
        color: i === 4 ? r[5] : (i === 0 ? (ai ? PURPLE : NAVY) : SLATE),
        fill: { color: ai ? B.violetTint : (ri % 2 ? 'F0F4F9' : 'FFFFFF') },
        align: i === 2 ? 'right' : 'left', valign: 'middle', margin: 0.06,
      });
    });
  });
  s.addText('Approximate line counts, measured from the repository on 28 Sep 2026. Licences as published by each project — worth a formal review before distribution outside the company.',
    { x: 0.5, y: 5.76, w: 12.33, h: 0.18, fontFace: 'Calibri', fontSize: 7.5, italic: true, color: MUTED, margin: 0 });

  // ── the network answer ────────────────────────────────────────────────────
  s.addShape('roundRect', { x: 0.5, y: 6.00, w: 12.33, h: 0.94, fill: { color: CARD }, line: { color: NAVY, width: 1.5 }, rectRadius: 0.08 });
  s.addText('DOES IT CALL ANYTHING? — API, KPI AND TELEMETRY, IN FULL', { x: 0.68, y: 6.04, w: 6, h: 0.18, fontFace: 'Calibri', fontSize: 7.8, bold: true, color: NAVY, charSpacing: 0.5, margin: 0 });
  const net = [
    ['API calls', 'None at JLR', 'The optional AI is off (AIR_GAPPED=1). The costing path never calls out.', PURPLE],
    ['KPI calls', 'None. Not one.', 'No KPIs measured, no usage tracked, no per-seat licence check phoning home. No analytics call of any kind.', GREEN],
    ['Error telemetry', 'Yes — stays in-house', 'Uncaught errors go to YOUR server\u2019s log. No Sentry, no analytics, no third party.', AMBER],
    ['Optional feeds', 'None price a part', 'PCB live prices (off) · news (needs internet) · dashboard ticker (indicative, simulated).', MUTED],
  ];
  net.forEach(([k, v, d, col], i) => {
    const y = 6.24 + (i % 2) * 0.32, x = 0.68 + Math.floor(i / 2) * 6.15;
    s.addShape('ellipse', { x, y: y + 0.05, w: 0.08, h: 0.08, fill: { color: col } });
    s.addText(k, { x: x + 0.15, y, w: 1.0, h: 0.16, fontFace: 'Calibri', fontSize: 7.5, bold: true, color: col, margin: 0, valign: 'middle' });
    s.addText(v, { x: x + 1.17, y, w: 1.5, h: 0.16, fontFace: 'Calibri', fontSize: 7.5, bold: true, color: NAVY, margin: 0, valign: 'middle' });
    s.addText(d, { x: x + 0.15, y: y + 0.15, w: 5.7, h: 0.15, fontFace: 'Calibri', fontSize: 7.5, color: SLATE, margin: 0, valign: 'middle' });
  });

  footer(s, ++PG);
  s.addNotes(
    'This is slide three with the lid off. It shows what each box is built from and what it hands to the next. ' +
    'Left to right. Upload a CAD file, STEP, IGES or STL, with an optional DXF flat pattern for sheet metal; or fill in a commodity form. The Python kernel measures the solid and hands on the geometry: size, walls, holes, draft. The rules turn that into cost inputs, and the engineer answers what a shape cannot tell you. ' +
    'The cost engine sits in the middle. It works out the eight buckets, with one module per commodity, optimisers that pick the cheapest capable machine, and guardrails that check every number. It hands on the result: the eight buckets plus where every number came from. ' +
    'The key design choice is at the bottom of that box: numbers in, numbers out, no database, no network, no file access. That is why it can be tested so heavily, 2,438 tests today, and why the same code runs in the browser and on the server. ' +
    'Then checks and the confidence band, the findings ranked by money, and storage in a local SQLite file with fourteen tables. Reports are built in the browser. ' +
    'The table answers language, size and licence. Line counts are approximate and measured today. Every library is MIT, Apache or LGPL. ' +
    'The bottom box: in the JLR build, nothing on the costing path calls out. The AI is off. There is no usage tracking. Errors go to your own server\u2019s log, not to a third party.'
  );
}

// ══════════ BACKUP · THE DATA CONTRACTS, FIELD BY FIELD ══════════
// Not part of the running order. This is the slide to jump to when an engineer
// asks for the exact schema behind the plain-English parcels on the previous
// slide. Every type, field and column is copied from the source.
// The deep-dive for an engineer from a data background: what OBJECT moves
// between each box, what is in it, and where every field comes from. All type
// names and fields below are copied from the source, not paraphrased.
{
  const s = pres.addSlide(); s.background = { color: PAGE };
  title(s, 'Backup — Data Contracts, Field by Field', 'The exact objects behind the four parcels on the previous slide. Type and field names copied from the source', NAVY);
  // backup marker — this slide is not in the running order
  s.addShape('roundRect', { x: 10.62, y: 0.26, w: 2.21, h: 0.3, fill: { color: AMBER_T }, line: { color: AMBER, width: 1 }, rectRadius: 0.15 });
  s.addText('BACKUP — ONLY IF ASKED', { x: 10.62, y: 0.26, w: 2.21, h: 0.3, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: AMBER, align: 'center', valign: 'middle', margin: 0 });

  const MONO = 'Consolas';

  /** One hand-off: a typed object, its fields, and where the values come from. */
  const contract = (x, y, w, h, n, name, where, col, fields, note) => {
    s.addShape('roundRect', { x, y, w, h, fill: { color: CARD }, line: { color: col, width: 1.4 }, rectRadius: 0.09 });
    s.addShape('roundRect', { x, y, w, h: 0.42, fill: { color: col }, rectRadius: 0.09 });
    s.addShape('rect', { x, y: y + 0.26, w, h: 0.16, fill: { color: col } });
    s.addShape('ellipse', { x: x + 0.11, y: y + 0.09, w: 0.24, h: 0.24, fill: { color: 'FFFFFF' } });
    s.addText(String(n), { x: x + 0.11, y: y + 0.09, w: 0.24, h: 0.24, fontFace: 'Calibri', fontSize: 8.0, bold: true, color: col, align: 'center', valign: 'middle', margin: 0 });
    s.addText(name, { x: x + 0.42, y: y + 0.04, w: w - 0.52, h: 0.20, fontFace: MONO, fontSize: 8.4, bold: true, color: 'FFFFFF', margin: 0, valign: 'middle' });
    s.addText(where, { x: x + 0.42, y: y + 0.22, w: w - 0.52, h: 0.16, fontFace: 'Calibri', fontSize: 7.5, color: 'FFFFFF', margin: 0, valign: 'middle' });
    s.addText(fields, { x: x + 0.12, y: y + 0.48, w: w - 0.24, h: h - 0.48 - 0.24, fontFace: MONO, fontSize: 7.5, color: SLATE, margin: 0, valign: 'top', lineSpacingMultiple: 0.98 });
    s.addText(note, { x: x + 0.12, y: y + h - 0.24, w: w - 0.24, h: 0.2, fontFace: 'Calibri', fontSize: 7.5, italic: true, color: col, margin: 0, valign: 'middle' });
  };

  const CW = 2.34, GAP = 0.155, Y = 1.14, H = 3.42;
  const xs = [0.5, 0.5 + CW + GAP, 0.5 + 2 * (CW + GAP), 0.5 + 3 * (CW + GAP), 0.5 + 4 * (CW + GAP)];

  contract(xs[0], Y, CW, H, 1, 'OCCTGeometry', 'Python kernel → JSON on stdout', AMBER,
    'status: success|error\nboundingBox: {xMm,yMm,zMm}\nvolume: {mm3, cm3}\nsurfaceArea: {mm2, cm2}\nfillRatio: number\ntopology: {solidCount,\n  shellCount, voidCount,\n  enclosesSealedVoid,\n  openShell}\nwallThickness: {minMm,\n  maxMm, meanMm, p95Mm,\n  method, uniformity}\ndraftAnalysis: {undercut-\n  FaceCount, minPositive-\n  DraftDeg, ...}\nsetupAnalysis: {estimated-\n  SetupCount, principal-\n  Directions[]}\ncncCycleTimeEstimate: {...}\nweights: {aluminiumKg, ...}\nfeatureTable, bendCount, ...',
    'Measured. Never guessed.');

  contract(xs[1], Y, CW, H, 2, 'UniversalStackInput', 'rules + engineer answers', TEAL,
    'partName: string\nrawMaterial: {\n  materialId: string\n  netWeightKg: number\n  materialUtilization: number\n  directCost?: number\n  consumablesCostPerPart?\n}\noperations: [{\n  operationName: string\n  machineId · labourId: string\n  cycleTimeHr: number\n  partsPerCycle: number\n  oee · manning: number\n  labourTimeHr, labourEff...\n}]\ntooling: {totalToolingCost,\n  amortizationVolume, mode}\npackagingPerPart,\nlogisticsPerPart, overheadPct,\nmarginPct, annualVolume?',
    'Geometry wins; engineer fills gaps.');

  contract(xs[2], Y, CW, H, 3, 'PartCostResult', 'core.ts :: computeUniversalStack()', BLUE,
    'partName: string\nbreakdown: Breakdown8Bucket {\n  rawMaterial · process\n  labour · tooling\n  packaging · logistics\n  overhead · margin\n}\noperationDetails: [{\n  operationName, machineId\n  processCost, labourCost\n  machineRateUsed\n  labourRateUsed\n  cycleTimeHr, oee, manning\n}]\nfactoryCost · subtotal · total\ntoolingNRE?\ntraceability: [{\n  field, value, unit,\n  rateSource, rateId,\n  confidence\n}]\nwarnings?: string[]',
    'traceability[] = the printed derivation.');

  contract(xs[3], Y, CW, H, 4, 'RankedOpportunities', 'dfm-dfa → opportunity-ranking', GREEN,
    'groups: [{\n  category: LeverCategory\n  label: string\n  opportunities: [{\n    action: string\n    basis: string\n    detail?: string\n    savingPct: number\n    savingPerPart: number\n    risk · timeframe\n    owner?: design|supplier|\n      sourcing|assumption\n    signal: string\n  }]\n  groupSavingPerPart\n  topSavingPerPart\n}]\nall: RankedOpportunity[]\nverificationChecks: [...]\nheadlineSavingPct\nheadlineSavingPerPart · partTotal',
    'Ranked by money, never scored.');

  contract(xs[4], Y, CW, H, 5, 'SQLite  ·  14 tables', 'better-sqlite3 — one file, your server', PURPLE,
    'projects (id, user_id, kind,\n  name, data, created_at,\n  updated_at)\nscenarios (id, name,\n  description, data,\n  created_by, created_at)\nsupplier_quotes (id,\n  scenario_id, supplier_name,\n  unit_price, currency, ...)\nbom_items (id,\n  parent_scenario_id,\n  child_scenario_id, quantity,\n  unit_cost_override)\nrate_library (id, data,\n  updated_at, updated_by)\nrate_overrides (id, tbl,\n  row_id, field, value)\nusers · shared_costings ·\nmaterial_price_overrides ·\nprice_fetch_log · app_settings\n+ otp_tokens · dfm_jobs ·\nrate_library_versions',
    'data columns hold the JSON above.');

  // arrows between the five contracts
  [0, 1, 2, 3].forEach(i => {
    s.addShape('line', { x: xs[i] + CW + 0.012, y: Y + 1.7, w: GAP - 0.024, h: 0, line: { color: MUTED, width: 2, endArrowType: 'triangle' } });
  });

  // ── the one idea a data engineer should leave with ──
  s.addShape('roundRect', { x: 0.5, y: 4.68, w: 12.33, h: 0.62, fill: { color: TEAL_T }, line: { color: TEAL, width: 1.25 }, rectRadius: 0.08 });
  s.addText([
    { text: 'Same sentence as the previous slide:  ', options: { bold: true, color: TEAL, fontSize: 10.5 } },
    { text: 'computeUniversalStack(UniversalStackInput, RateLibrary) → PartCostResult', options: { bold: true, color: NAVY, fontSize: 10.5, fontFace: MONO } },
    { text: '   — a pure transform between two typed structures. Same input, same output, forever. That is what makes 2,438 tests practical, and why the identical code runs in the browser and on the server.', options: { color: SLATE, fontSize: 9.5 } },
  ], { x: 0.72, y: 4.68, w: 11.9, h: 0.62, fontFace: 'Calibri', margin: 0, valign: 'middle' });

  // ── where fields come from, and the rules a data person will ask about ──
  const panels = [
    ['PROVENANCE — EVERY NUMBER KNOWS ITS SOURCE', TEAL,
      'Each cost line emits a TraceabilityRecord: field, value, unit, rateSource, rateId, confidence. That is what prints under every figure in the report, and what a supplier is shown in the meeting. Nothing is a bare number.'],
    ['UNITS — WHERE BUGS ACTUALLY COME FROM', AMBER,
      'Fields carry units in their names (cycleTimeHr, netWeightKg, boundingBoxMm, savingPerPart). The recurring bug class in this domain is sec/hr and mm/cm/kg conversions, so the convention is enforced by naming and pinned by tests.'],
    ['STORAGE — TYPED IN CODE, JSON AT REST', PURPLE,
      'SQLite holds the JSON blobs above in `data` columns rather than a shredded relational model: the engine owns the schema, and a costing round-trips byte-identical. rate_overrides is the audit trail of who changed which rate.'],
  ];
  panels.forEach(([t, col, body], i) => {
    const x = 0.5 + i * 4.19;
    s.addShape('roundRect', { x, y: 5.44, w: 3.94, h: 1.5, fill: { color: CARD }, line: { color: col, width: 1.25 }, rectRadius: 0.09 });
    s.addShape('rect', { x, y: 5.44, w: 0.06, h: 1.5, fill: { color: col } });
    s.addText(t, { x: x + 0.18, y: 5.52, w: 3.64, h: 0.24, fontFace: 'Calibri', fontSize: 7.8, bold: true, color: col, charSpacing: 0.4, margin: 0, valign: 'middle' });
    s.addText(body, { x: x + 0.18, y: 5.78, w: 3.64, h: 1.08, fontFace: 'Calibri', fontSize: 7.9, color: SLATE, margin: 0, valign: 'top' });
  });

  footer(s, ++PG);
  s.addNotes(
    'This is the deep-dive slide, pitched at someone who thinks in schemas rather than castings. Five typed hand-offs from CAD file to database. Every type name and field is copied from the source. ' +
    'One. The kernel writes a geometry document as JSON: bounding box, volume, surface area, fill ratio, a topology block that tells a sealed tank from an open shell, wall thickness including a ninety-fifth percentile, draft, setup count, a CNC cycle estimate, and weights in three candidate materials. All measured. ' +
    'Two. The rules plus the engineer\u2019s answers produce the input the engine eats: a material with its utilisation, a list of operations with cycle time, equipment effectiveness, manning and labour efficiency, a tooling block, and the per-part costs. Where geometry can decide a field, geometry wins. Where it cannot, the engineer answers, and the tool waits until they do. ' +
    'Three. The engine turns that into the result: eight buckets, per-operation detail, and a traceability array. Every cost line records its value, unit, rate source and confidence. That is what prints under every number in the report. ' +
    'Four. The DFM layer produces the ranked opportunities, in pounds per part, with no score shown. ' +
    'Five. SQLite, fourteen tables in one file. The JSON is stored whole, so a costing round-trips exactly, and rate overrides keep an audit trail. ' +
    'The teal strip is the one idea to leave with: one pure transform, input and rate library in, result out. Same input, same output.'
  );
}

await pres.writeFile({ fileName: 'CostVision-Workflow-Explained.pptx' });
console.log('WRITTEN');
