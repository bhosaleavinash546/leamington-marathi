#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// BrainSpark — AI-assisted idea generation: business case slide.
//
// Reproduces the customer's own one-page business-case template exactly: same
// boxes in the same places, same field prompts, same pale-green ROI/benefits
// and pale-blue time panels. This is deliberately NOT in BrainSpark's brand —
// the ask was to keep the attached format, and a business case that arrives in
// the reviewer's own layout gets read instead of reformatted.
//
// Two slides:
//   1. The case for change — Problem Statement, Current State, ROI, Time,
//      Technical Scoping. Deliberately airy; the director's note was that the
//      one-pager had become too busy.
//   2. The proposal and its benefits, on the customer's own second template
//      (Proposal box left, Expected Benefits right).
//
//   node scripts/make-business-case-deck.mjs [-o out.pptx]
// ─────────────────────────────────────────────────────────────────────────────
import pptxgen from 'pptxgenjs';

const OUT = (() => { const i = process.argv.indexOf('-o'); return i > -1 ? process.argv[i + 1] : 'BrainSpark_Business_Case.pptx'; })();

// ── Template palette, sampled from the attached slide ────────────────────────
const INK = '1F2328', MUTED = '5B6570', RULE = 'C8CFD6';
const BOX_FILL = 'FBFCFD', BOX_LINE = 'C9D1D9';
const GREEN_FILL = 'DCE7DC', GREEN_LINE = 'B9CDB9';
const BLUE_FILL = 'DEE5F0', BLUE_LINE = 'BCC8DC';
const FONT = 'Arial';   // safe list, and metric-compatible with the font available for QA

const RECORD = [[], []];   // one array of drawn elements per slide, for QA
let SLIDE = 0;
const rec = e => RECORD[SLIDE].push(e);

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';                 // 13.333 x 7.5 — set BEFORE any slide
pres.author = 'BrainSpark';
pres.title = 'BrainSpark — AI Idea Generation Tool';

// ── helpers ──────────────────────────────────────────────────────────────────
const box = (s, { x, y, w, h, fill = BOX_FILL, line = BOX_LINE }) => {
  rec({ kind: 'box', x, y, w, h, fill, line });
  return s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.09,
    fill: { color: fill }, line: { color: line, width: 0.75 },
  });
};

/** addText, recorded. Everything textual on the slide goes through this. */
const T = (s, content, opts) => {
  rec({ kind: 'text', content, opts });
  return s.addText(content, opts);
};

const heading = (s, text, { x, y, w = 3, size = 11 }) =>
  T(s, text, { x, y, w, h: 0.24, isTextBox: true, fontFace: FONT, fontSize: size, bold: true, color: INK, margin: 0, valign: 'top' });

const bullets = (s, items, { x, y, w, h, size = 8.6, lineGap = 3 }) =>
  T(s, items.flatMap((t, i) => {
    const last = i === items.length - 1;
    // ['Lead phrase', 'the rest'] renders the lead in bold on the same line.
    if (Array.isArray(t)) return [
      { text: t[0] + ' ', options: { bullet: true, bold: true } },
      { text: t[1], options: { breakLine: !last, paraSpaceAfter: lineGap } },
    ];
    return [{ text: t, options: { bullet: true, breakLine: !last, paraSpaceAfter: lineGap } }];
  }), { x, y, w, h, isTextBox: true, fontFace: FONT, fontSize: size, color: INK, margin: 0, valign: 'top', lineSpacingMultiple: 0.93 });

const field = (s, text, opt) =>
  T(s, text, { isTextBox: true, fontFace: FONT, fontSize: 10, color: INK, margin: 0, valign: 'top', h: 0.24, ...opt });

const checkbox = (s, { x, y, size = 0.26 }) =>
  rec({ kind: 'checkbox', x, y, w: size, h: size }) &&
  s.addShape(pres.ShapeType.rect, { x, y, w: size, h: size, fill: { color: 'FFFFFF' }, line: { color: '3A4046', width: 1.25 } });

// ── shared masthead ─────────────────────────────────────────────────────────
const masthead = (s, eyebrow) => {
  if (eyebrow) T(s, eyebrow, {
    x: 0.5, y: 0.22, w: 8, h: 0.24, isTextBox: true, fontFace: FONT, fontSize: 9,
    color: MUTED, charSpacing: 2.2, margin: 0, valign: 'middle',
  });
  T(s, 'BrainSpark  –  AI Idea Generation Tool', {
    x: 0.5, y: eyebrow ? 0.48 : 0.38, w: 10.5, h: 0.42, isTextBox: true, fontFace: FONT,
    fontSize: 20, color: INK, charSpacing: 1.8, margin: 0, valign: 'middle',
  });
};

// ═══ SLIDE 1 — the case for change ══════════════════════════════════════════
// Two columns, not three. The content that was crowding this page has moved to
// slide 2, so everything here can sit at a size a director reads rather than
// squints at.
const s1 = pres.addSlide();
s1.background = { color: 'FFFFFF' };
masthead(s1, 'IDEA GENERATION BUSINESS CASE');

const A = { x: 0.5, w: 7.45 }, B = { x: 8.20, w: 4.63 };
const BODY = 10.5;

// ── Problem statement ────────────────────────────────────────────────────────
box(s1, { ...A, y: 1.05, h: 2.90 });
heading(s1, 'Problem Statement', { x: A.x + 0.26, y: 1.18, w: 3.0, size: 12 });
field(s1, 'PII:', { x: 6.55, y: 1.18, w: 0.5, fontSize: 11, bold: true });
checkbox(s1, { x: 7.05, y: 1.14, size: 0.26 });
bullets(s1, [
  'Cost reduction ideas are usually generated through workshops. Setting these up can take weeks, and the quality of the output depends on which cross-functional team members attend.',
  'Most ideas are captured as a single line, such as "change the material" or "remove the bracket", with little detail on the process, material grade, tolerances or quantities involved.',
  'Nobody knows whether an idea is worth 20p or £2 until someone manually evaluates and costs it.',
  'A programme can contain thousands of parts, but workshops typically review only a small number, so many commodities and opportunities are never explored.',
  'Opportunities often depend on individual expertise. If the right knowledge is not in the room at the time, valuable ideas are overlooked.',
], { x: A.x + 0.26, y: 1.54, w: A.w - 0.52, h: 2.22, size: BODY, lineGap: 10 });

// ── Current state ────────────────────────────────────────────────────────────
box(s1, { ...A, y: 4.07, h: 3.18 });
heading(s1, 'Current State', { x: A.x + 0.26, y: 4.20, w: 3.0, size: 12 });
bullets(s1, [
  'Opportunities are identified mainly through workshops, which take time to organise and depend heavily on the knowledge of those who attend.',
  'Ideas are often high level, with limited detail on materials, processes, specifications or technical constraints.',
  'Savings can only be confirmed after manual analysis, costing and data review.',
  'Technical review, costing and prioritisation are carried out separately, which slows decision making.',
  'The quality of ideas varies with individual experience, and only a small portion of parts can be reviewed.',
  'Engineers spend significant time collecting and interpreting data instead of implementing improvements.',
  'The process is resource-intensive, time-consuming and difficult to scale across programmes and teams.',
], { x: A.x + 0.26, y: 4.56, w: A.w - 0.52, h: 2.55, size: BODY, lineGap: 10 });

// ── Projected ROI ────────────────────────────────────────────────────────────
box(s1, { ...B, y: 1.05, h: 1.65, fill: GREEN_FILL, line: GREEN_LINE });
heading(s1, 'Projected ROI', { x: B.x + 0.26, y: 1.18, w: 3.0, size: 12 });
T(s1, [
  { text: 'Cost: ', options: { bold: true } },
  { text: 'Hosting and API usage. No new hardware and no licences.', options: { breakLine: true, paraSpaceAfter: 6 } },
  { text: 'Return: ', options: { bold: true } },
  { text: '', options: { breakLine: true, paraSpaceAfter: 6 } },
  { text: 'What is the return based on?', options: { bold: true } },
], { x: B.x + 0.26, y: 1.54, w: B.w - 0.52, h: 1.20, isTextBox: true, fontFace: FONT,
     fontSize: 10, color: INK, margin: 0, valign: 'top', lineSpacingMultiple: 0.95 });

// ── Time demand ──────────────────────────────────────────────────────────────
box(s1, { ...B, y: 2.82, h: 0.60, fill: BLUE_FILL, line: BLUE_LINE });
field(s1, 'Time demand (hrs/week)', { x: B.x + 0.26, y: 2.99, w: 3.4, fontSize: 12, bold: true });

// ── Technical scoping ────────────────────────────────────────────────────────
box(s1, { ...B, y: 3.54, h: 3.71 });
heading(s1, 'Technical Scoping', { x: B.x + 0.26, y: 3.67, w: 3.0, size: 12 });
T(s1, [
  { text: 'Enabling AI on an existing system?', options: { bold: true, breakLine: true } },
  { text: 'YES / NO', options: { breakLine: true, paraSpaceAfter: 11 } },
  { text: 'Model used', options: { bold: true, breakLine: true } },
  { text: 'Anthropic Claude', options: { breakLine: true, paraSpaceAfter: 11 } },
  { text: 'Technical implementation / support required?', options: { bold: true, breakLine: true } },
  { text: 'YES. Basic setup is needed, including hosting, local storage and an API key. No new hardware required.', options: { breakLine: true, paraSpaceAfter: 11 } },
  { text: 'Data handling', options: { bold: true, breakLine: true } },
  { text: 'CAD and drawing files are processed on the server and are not sent out. Text taken from them — part name, dimensions, material, cost figures — goes to the Anthropic API so the ideas can be written.', options: { breakLine: true, paraSpaceAfter: 11 } },
  { text: 'How this is proven', options: { bold: true, breakLine: true } },
  { text: 'Run a set of parts that have already been costed by hand and compare the two, before anything is relied on.', options: {} },
], { x: B.x + 0.26, y: 4.06, w: B.w - 0.52, h: 3.04, isTextBox: true, fontFace: FONT,
     fontSize: 10, color: INK, margin: 0, valign: 'top', lineSpacingMultiple: 0.95 });

// ═══ SLIDE 2 — the proposal, on the customer's second template ══════════════
// Layout copied from the attached example: a Proposal box on the left and an
// Expected Benefits box on the right, sitting slightly lower. Content is
// BrainSpark's; none of the example's subject matter is carried across.
SLIDE = 1;
const s2 = pres.addSlide();
s2.background = { color: 'FFFFFF' };
masthead(s2, null);

box(s2, { x: 0.5, y: 1.15, w: 6.05, h: 5.95 });
heading(s2, 'Proposal', { x: 0.78, y: 1.32, w: 3.0, size: 13 });
bullets(s2, [
  'Upload CAD models, drawings, BOMs and cost data into the tool.',
  'The design, materials, manufacturing processes and costs are reviewed automatically.',
  'It generates detailed cost reduction ideas rather than high level suggestions.',
  'Each idea includes the recommended change, the estimated saving and the supporting rationale.',
  'Thousands of parts and assemblies can be assessed, not just the few reviewed in a workshop.',
  'Opportunities are identified consistently, using the same approach every time.',
  'Savings are estimated automatically, which reduces manual costing effort.',
  'Engineers focus on evaluating and implementing the best ideas rather than collecting and analysing data.',
  'Tools built inside BrainSpark: Prism (CAD to idea), Innovation Studio (text to idea), TRIZ Studio (problem solving), DFM / DFA (design optimisation).',
], { x: 0.78, y: 1.76, w: 5.49, h: 5.16, size: 12.5, lineGap: 13 });

box(s2, { x: 6.90, y: 1.42, w: 5.93, h: 5.68, fill: GREEN_FILL, line: GREEN_LINE });
heading(s2, 'Expected Benefits', { x: 7.18, y: 1.59, w: 3.0, size: 13 });
bullets(s2, [
  'Identify cost reduction opportunities much faster than traditional workshop-based approaches.',
  'Increase programme coverage by assessing hundreds of parts rather than a limited sample.',
  'Improve consistency by applying the same analysis across all commodities and programmes.',
  'Provide early visibility of savings potential, helping teams prioritise high value opportunities.',
  'Reduce manual effort spent on data collection, costing and initial analysis.',
  'Improve engineering productivity by allowing teams to focus on validation and implementation.',
  'Support better decision making through quantified savings estimates.',
  'Accelerate delivery of cost reduction targets and increase realised savings.',
], { x: 7.18, y: 2.03, w: 5.37, h: 4.86, size: 12.5, lineGap: 13 });

await pres.writeFile({ fileName: OUT });
if (process.argv.includes('--emit-layout')) {
  const { writeFileSync } = await import('node:fs');
  const path = OUT.replace(/\.pptx$/, '.layout.json');
  writeFileSync(path, JSON.stringify({ w: 13.333, h: 7.5, slides: RECORD }, null, 1));
  console.log(`wrote ${path} for visual QA`);
}
console.log(`wrote ${OUT} — two slides`);
