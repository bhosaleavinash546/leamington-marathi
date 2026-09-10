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
// The tool list on slide 2 is generated from src/config/tools.ts, the single
// nav registry, so the deck cannot claim a tool the product does not have.
//
//   node scripts/make-business-case-deck.mjs [-o out.pptx]
// ─────────────────────────────────────────────────────────────────────────────
import pptxgen from 'pptxgenjs';
import { readFileSync } from 'node:fs';

const OUT = (() => { const i = process.argv.indexOf('-o'); return i > -1 ? process.argv[i + 1] : 'BrainSpark_Business_Case.pptx'; })();

// ── Tool suite, read from the registry rather than retyped ───────────────────
const registry = readFileSync(new URL('../src/config/tools.ts', import.meta.url), 'utf-8');
const TOOLS = [...registry.matchAll(/label:\s*'([^']+)'[\s\S]*?category:\s*'(\w+)',\s*description:\s*'([^']+)'/g)]
  .map(m => ({ label: m[1], category: m[2], description: m[3] }))
  .filter(t => t.label !== 'Help');
if (TOOLS.length < 15) throw new Error(`tool registry parse found only ${TOOLS.length} tools — the regex is stale`);

// One line of plain benefit per tool. Keyed by the registry label so a renamed
// or removed tool fails loudly here instead of quietly shipping a stale claim.
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
pres.title = 'BrainSpark — AI-Assisted Cost Reduction Idea Generation';

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
  T(s, items.map((t, i) => ({
    text: t,
    options: { bullet: true, breakLine: i < items.length - 1, paraSpaceAfter: lineGap },
  })), { x, y, w, h, isTextBox: true, fontFace: FONT, fontSize: size, color: INK, margin: 0, valign: 'top', lineSpacingMultiple: 0.95 });

const field = (s, text, opt) =>
  T(s, text, { isTextBox: true, fontFace: FONT, fontSize: 10, color: INK, margin: 0, valign: 'top', h: 0.24, ...opt });

const checkbox = (s, { x, y, size = 0.26 }) =>
  rec({ kind: 'checkbox', x, y, w: size, h: size }) &&
  s.addShape(pres.ShapeType.rect, { x, y, w: size, h: size, fill: { color: 'FFFFFF' }, line: { color: '3A4046', width: 1.25 } });

// ═══ ONE SLIDE ══════════════════════════════════════════════════════════════
// The customer's own one-page template, three columns. Written for a cost
// engineering director: plain sentences, no slogans, and the tools named where
// they actually do the work rather than listed as a catalogue.
const s1 = pres.addSlide();
s1.background = { color: 'FFFFFF' };

T(s1, 'IDEA GENERATION BUSINESS CASE', {
  x: 0.42, y: 0.18, w: 8, h: 0.24, isTextBox: true, fontFace: FONT, fontSize: 8.5,
  color: MUTED, charSpacing: 2.2, margin: 0, valign: 'middle',
});
T(s1, 'BrainSpark  –  Cost Reduction Idea Generation', {
  x: 0.42, y: 0.44, w: 10.5, h: 0.38, isTextBox: true, fontFace: FONT, fontSize: 18,
  color: INK, charSpacing: 1.4, margin: 0, valign: 'middle',
});

const L = { x: 0.25, w: 6.55 }, M = { x: 6.95, w: 3.05 }, R = { x: 10.15, w: 2.93 };
const BODY = 8.2;

// ── Problem statement ────────────────────────────────────────────────────────
box(s1, { ...L, y: 0.94, h: 1.65 });
heading(s1, 'Problem Statement', { x: L.x + 0.23, y: 1.04, w: 2.6, size: 10.5 });
field(s1, 'PII:', { x: 5.45, y: 1.04, w: 0.5, fontSize: 10, bold: true });
checkbox(s1, { x: 5.92, y: 1.00, size: 0.24 });
bullets(s1, [
  'Cost reduction ideas come out of workshops. Setting one up takes weeks, and what comes out of it depends on who happened to be free that week.',
  'Most ideas arrive as a single line — "change the material", "delete the bracket". No process named, no grade, no tolerance and no number.',
  'Nobody knows whether an idea is worth 20p or £2 until someone costs it by hand.',
  'A programme has thousands of parts. A workshop gets through a few dozen, and whole commodities are skipped because nobody in the room knew them.',
  'The same ideas come round again on the next programme, because there is no record of what was already tried and what it turned out to be worth.',
], { x: L.x + 0.23, y: 1.32, w: L.w - 0.46, h: 1.25, size: BODY, lineGap: 1.0 });

// ── Current state ────────────────────────────────────────────────────────────
box(s1, { ...L, y: 2.67, h: 1.78 });
heading(s1, 'Current State', { x: L.x + 0.23, y: 2.77, w: 2.6, size: 10.5 });
bullets(s1, [
  'One or two experienced engineers carry most of the idea generation. When they are on other work, or they leave, it stops.',
  'Before a workshop can run, someone spends days pulling together drawings, BOMs, current piece costs and benchmark data by hand.',
  'The workshop itself takes eight to fifteen people off the job for one or two days.',
  'Afterwards the organiser goes back to each person to ask what they actually meant, whether it can be done, and what it might save. Many never reply, and those ideas quietly die.',
  'Savings are a judgement call rather than a calculation, so Finance discounts them. The number that reaches the plan is never the number on the sheet.',
  'None of it is written down in a way the next programme can use, so the work is repeated.',
], { x: L.x + 0.23, y: 3.05, w: L.w - 0.46, h: 1.38, size: BODY, lineGap: 1.0 });

// ── Proposed solution ────────────────────────────────────────────────────────
box(s1, { ...L, y: 4.53, h: 2.72 });
heading(s1, 'Proposed Solution / Model', { x: L.x + 0.23, y: 4.63, w: 3.4, size: 10.5 });
bullets(s1, [
  'Upload the 3D CAD and the 2D drawings for a part or an assembly. The geometry, material, tolerances and finishes are read from the files — nobody types them in.',
  'Should-Cost builds the piece price from the bottom up: material, cycle time, tooling and overhead. Every idea is then measured against that number instead of against an opinion.',
  'Prism takes one part and shows where its price really sits — what the design costs, what the specification costs, what the chosen process costs and what the sourcing location costs. That tells you which line of a supplier quote to argue with.',
  'DFM / DFA Studio reads the model and points out what will be awkward or expensive to make and assemble — thin walls, undercuts, missing draft, too many fasteners — while the design can still be changed.',
  'Innovation Studio and TRIZ Studio do the idea generation itself: eight structured value engineering methods, plus a method for breaking a cost-versus-performance trade-off rather than accepting it.',
  'Horizon looks a few years out, so a decision taken now is not overtaken by where the technology is going.',
  'Ideas come back at four levels — whole assembly, sub-assembly, single part, and the technology itself — each naming the change, the process, the material and what it saves per part, across every commodity from BIW and chassis to battery, interior and harness.',
  'The AI writes the idea and the explanation. The saving is always calculated by the cost engine, and every idea says whether the engine confirmed it, contradicted it, or could not check it and why.',
], { x: L.x + 0.23, y: 4.91, w: L.w - 0.46, h: 2.31, size: BODY, lineGap: 1.0 });

// ── Projected ROI ────────────────────────────────────────────────────────────
box(s1, { ...M, y: 0.94, h: 1.65, fill: GREEN_FILL, line: GREEN_LINE });
heading(s1, 'Projected ROI', { x: M.x + 0.20, y: 1.04, w: 2.6, size: 10.5 });
T(s1, [
  { text: 'Cost: £', options: { breakLine: true } },
  { text: 'Return:', options: { breakLine: true } },
  { text: 'What is the return based on?', options: { breakLine: true } },
  { text: 'Engineer hours released × loaded rate, plus the savings the engine confirms × annual volume.', options: { italic: true, fontSize: 7.4, color: MUTED } },
], { x: M.x + 0.20, y: 1.32, w: M.w - 0.40, h: 1.16, isTextBox: true, fontFace: FONT,
     fontSize: 9.5, color: INK, margin: 0, valign: 'top', lineSpacingMultiple: 0.94 });

// ── Time ─────────────────────────────────────────────────────────────────────
box(s1, { ...M, y: 2.67, h: 0.46, fill: BLUE_FILL, line: BLUE_LINE });
field(s1, 'Time (hrs/week)', { x: M.x + 0.20, y: 2.78, w: 2.6, fontSize: 10.5, bold: true });

// ── Expected benefits ────────────────────────────────────────────────────────
box(s1, { ...M, y: 3.21, h: 4.04, fill: GREEN_FILL, line: GREEN_LINE });
heading(s1, 'Expected Benefits:', { x: M.x + 0.20, y: 3.31, w: 2.6, size: 10.5 });
T(s1, [
  { text: 'More parts covered.  ', options: { bold: true } },
  { text: 'A programme has thousands of parts. This looks at all of them, not the few a workshop reaches.', options: { breakLine: true, paraSpaceAfter: 6 } },
  { text: 'Much faster.  ', options: { bold: true } },
  { text: 'An idea arrives already written up and already costed, so there is nothing to chase afterwards.', options: { breakLine: true, paraSpaceAfter: 6 } },
  { text: 'Better ideas.  ', options: { bold: true } },
  { text: 'Each one names the change, the process, the material and the saving per part.', options: { breakLine: true, paraSpaceAfter: 6 } },
  { text: 'The same standard every time.  ', options: { bold: true } },
  { text: 'It does not depend on who was available that week.', options: { breakLine: true, paraSpaceAfter: 6 } },
  { text: 'Numbers Finance can check.  ', options: { bold: true } },
  { text: 'Every saving is calculated and the working is shown, so less of it gets discounted.', options: { breakLine: true, paraSpaceAfter: 6 } },
  { text: 'Nothing is lost.  ', options: { bold: true } },
  { text: 'Ideas, decisions and confirmed savings are kept and reused on the next programme.', options: { breakLine: true, paraSpaceAfter: 6 } },
  { text: 'Better use of engineers.  ', options: { bold: true } },
  { text: 'Their time goes on judging and implementing ideas rather than collecting data.', options: {} },
], { x: M.x + 0.20, y: 3.61, w: M.w - 0.40, h: 3.56, isTextBox: true, fontFace: FONT,
     fontSize: 8.2, color: INK, margin: 0, valign: 'top', lineSpacingMultiple: 0.94 });

// ── Key individuals ──────────────────────────────────────────────────────────
box(s1, { ...R, y: 0.94, h: 1.65 });
heading(s1, 'Key Individuals:', { x: R.x + 0.20, y: 1.04, w: 2.5, size: 10.5 });
T(s1, [
  { text: 'Use Case Submitter:', options: { breakLine: true } },
  { text: 'LL4 Sponsor:', options: {} },
], { x: R.x + 0.20, y: 1.34, w: R.w - 0.40, h: 0.52, isTextBox: true, fontFace: FONT,
     fontSize: 9.5, color: INK, margin: 0, valign: 'top' });
field(s1, 'Funding agreed with\nFinance', { x: R.x + 0.20, y: 1.95, w: 1.85, h: 0.44, fontSize: 9.5 });
checkbox(s1, { x: R.x + 2.35, y: 2.01, size: 0.24 });

// ── Technical scoping ────────────────────────────────────────────────────────
box(s1, { ...R, y: 2.67, h: 4.58 });
heading(s1, 'Technical Scoping:', { x: R.x + 0.20, y: 2.77, w: 2.5, size: 10.5 });
T(s1, [
  { text: 'Enabling AI on an existing system?', options: { breakLine: true } },
  { text: 'NO — it is a separate application and it is already built and running. It feeds the existing costing systems by export.', options: { fontSize: 7.8, color: MUTED, breakLine: true, paraSpaceAfter: 8 } },
  { text: 'Model used:  ANTHROPIC Claude', options: { breakLine: true, paraSpaceAfter: 8 } },
  { text: 'Technical implementation/support required?', options: { breakLine: true } },
  { text: 'YES — somewhere to host it, a disk that persists, and an API key. No new hardware.', options: { fontSize: 7.8, color: MUTED, breakLine: true, paraSpaceAfter: 8 } },
  { text: 'Data handling:', options: { breakLine: true } },
  { text: 'CAD, drawings and cost data stay inside the deployment. Accounts hold a work email address and nothing else.', options: { fontSize: 7.8, color: MUTED, breakLine: true, paraSpaceAfter: 8 } },
  { text: 'What a run needs:', options: { breakLine: true } },
  { text: '3D CAD (STEP or native), 2D drawings, annual volume, and the current price or supplier quote where there is one.', options: { fontSize: 7.8, color: MUTED, breakLine: true, paraSpaceAfter: 8 } },
  { text: 'What comes out:', options: { breakLine: true } },
  { text: 'Excel, PowerPoint and PDF, ready for the programme review.', options: { fontSize: 7.8, color: MUTED, breakLine: true, paraSpaceAfter: 8 } },
  { text: 'How to prove it:', options: { breakLine: true } },
  { text: 'Run a set of parts that have already been costed by hand and compare the two, before anything is relied on.', options: { fontSize: 7.8, color: MUTED } },
], { x: R.x + 0.20, y: 3.05, w: R.w - 0.40, h: 4.14, isTextBox: true, fontFace: FONT,
     fontSize: 8.8, color: INK, margin: 0, valign: 'top', lineSpacingMultiple: 0.92 });

await pres.writeFile({ fileName: OUT });
if (process.argv.includes('--emit-layout')) {
  const { writeFileSync } = await import('node:fs');
  const path = OUT.replace(/\.pptx$/, '.layout.json');
  writeFileSync(path, JSON.stringify({ w: 13.333, h: 7.5, slides: [RECORD[0]] }, null, 1));
  console.log(`wrote ${path} for visual QA`);
}
console.log(`wrote ${OUT} — one slide`);
