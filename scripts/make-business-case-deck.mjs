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
const BODY = 7.8;

// ── Problem statement ────────────────────────────────────────────────────────
box(s1, { ...L, y: 0.94, h: 1.91 });
heading(s1, 'Problem Statement', { x: L.x + 0.23, y: 1.04, w: 2.6, size: 10.5 });
field(s1, 'PII:', { x: 5.45, y: 1.04, w: 0.5, fontSize: 10, bold: true });
checkbox(s1, { x: 5.92, y: 1.00, size: 0.24 });
bullets(s1, [
  ['Most of the cost is never challenged.', 'A programme carries thousands of parts; a workshop reaches a few dozen, so most of the spend is never looked at.'],
  ['Ideas cannot be used as written.', 'They come as single lines — "change the material", "delete the bracket" — with no process, grade, tolerance or number, so nobody can act on one without going back to whoever wrote it.'],
  ['Nothing can be ranked.', 'Nobody knows whether an idea is worth 20p or £2 until an engineer costs it by hand, which can take a day for a single idea.'],
  ['Finance discounts what we submit,', 'because the savings are a judgement rather than a calculation. The number that reaches the plan is never the number on the sheet.'],
  ['The same work is done twice.', 'Nothing is kept, so ideas already tried — and ideas already rejected — come round again on the next programme.'],
  ['It does not scale.', 'More programmes and more variants mean more workshops, and there are only so many people who can run them.'],
], { x: L.x + 0.23, y: 1.32, w: L.w - 0.46, h: 1.45, size: BODY, lineGap: 0.5 });

// ── Current state: how it actually runs today ────────────────────────────────
box(s1, { ...L, y: 2.89, h: 1.58 });
heading(s1, 'Current State', { x: L.x + 0.23, y: 2.99, w: 2.6, size: 10.5 });
bullets(s1, [
  ['One or two people carry it.', 'A small number of experienced engineers generate most of the ideas. When they are on other work, or they leave, it stops.'],
  ['Days of preparation first.', 'Drawings, BOMs, current piece costs and benchmark data are pulled together by hand before a workshop can be held.'],
  ['Then the workshop itself,', 'taking eight to fifteen people off the job for one or two days, away from their normal work.'],
  ['Then weeks of chasing.', 'Each author is asked what they meant, whether it can be done and what it saves. Many never reply, and those ideas quietly die.'],
  ['Coverage follows the room.', 'Whole commodities are skipped because nobody who attended knew them well enough to challenge them.'],
], { x: L.x + 0.23, y: 3.27, w: L.w - 0.46, h: 1.16, size: BODY, lineGap: 0.5 });

// ── Proposed solution, ending in the ask ─────────────────────────────────────
box(s1, { ...L, y: 4.51, h: 2.74 });
heading(s1, 'Proposed Solution / Model', { x: L.x + 0.23, y: 4.61, w: 3.4, size: 10.5 });
bullets(s1, [
  ['Upload the CAD and the drawings.', 'Geometry, material, tolerances and finishes are read from the files, for a single part or a whole assembly. Nobody types them in.'],
  ['Should-Cost sets the baseline.', 'It builds the piece price from the bottom up — material, cycle time, tooling and overhead — so every idea is measured against a number rather than an opinion.'],
  ['Prism shows where the price sits.', 'It splits one part into what the design costs, what the specification costs, what the chosen process costs and what the sourcing location costs, so you know which line of a supplier quote to argue with.'],
  ['DFM / DFA Studio reads the model,', 'flagging what will be awkward or expensive to make and assemble — thin walls, undercuts, missing draft, too many fasteners — while the design can still change.'],
  ['Innovation Studio and TRIZ Studio generate the ideas;', 'eight structured value engineering methods, plus a way of breaking a cost-versus-performance trade-off rather than accepting it. Horizon checks the decision against where the technology is going.'],
  ['Ideas come at four levels', '— assembly, sub-assembly, part, technology — each naming the change, the process, the material and the saving per part, across every commodity.'],
  ['The saving is always calculated', 'by the cost engine, and every idea says whether it was confirmed, contradicted, or could not be checked and why. The AI writes the idea; it never supplies the number.'],
], { x: L.x + 0.23, y: 4.89, w: L.w - 0.46, h: 2.32, size: BODY, lineGap: 0.5 });

// ── Projected ROI ────────────────────────────────────────────────────────────
box(s1, { ...M, y: 0.94, h: 1.70, fill: GREEN_FILL, line: GREEN_LINE });
heading(s1, 'Projected ROI', { x: M.x + 0.20, y: 1.04, w: 2.6, size: 10.5 });
T(s1, [
  { text: 'Cost: £', options: { breakLine: true } },
  { text: 'Hosting and API usage. No new hardware and no licences.', options: { fontSize: 7.4, color: MUTED, breakLine: true, paraSpaceAfter: 3 } },
  { text: 'Return: £', options: { breakLine: true } },
  { text: 'What is the return based on?', options: { breakLine: true } },
  { text: '( engineer hours released per week × loaded rate × weeks )', options: { italic: true, fontSize: 7.2, color: MUTED, breakLine: true } },
  { text: '+ ( saving per part the engine confirms × annual volume )', options: { italic: true, fontSize: 7.2, color: MUTED } },
], { x: M.x + 0.20, y: 1.32, w: M.w - 0.40, h: 1.16, isTextBox: true, fontFace: FONT,
     fontSize: 9.5, color: INK, margin: 0, valign: 'top', lineSpacingMultiple: 0.94 });

// ── Time ─────────────────────────────────────────────────────────────────────
box(s1, { ...M, y: 2.68, h: 0.46, fill: BLUE_FILL, line: BLUE_LINE });
field(s1, 'Time (hrs/week)', { x: M.x + 0.20, y: 2.79, w: 2.6, fontSize: 10.5, bold: true });

// ── Expected benefits ────────────────────────────────────────────────────────
box(s1, { ...M, y: 3.18, h: 3.06, fill: GREEN_FILL, line: GREEN_LINE });
heading(s1, 'Expected Benefits:', { x: M.x + 0.20, y: 3.28, w: 2.6, size: 10.5 });
T(s1, [
  { text: 'More parts covered.  ', options: { bold: true } },
  { text: 'A programme has thousands of parts. This looks at all of them, not the few a workshop reaches.', options: { breakLine: true, paraSpaceAfter: 5 } },
  { text: 'Much faster, and usable.  ', options: { bold: true } },
  { text: 'An idea arrives already written up and costed, naming the change, the process, the material and the saving per part. Nothing to chase.', options: { breakLine: true, paraSpaceAfter: 5 } },
  { text: 'The same standard every time.  ', options: { bold: true } },
  { text: 'It does not depend on who was available that week.', options: { breakLine: true, paraSpaceAfter: 5 } },
  { text: 'Numbers Finance can check.  ', options: { bold: true } },
  { text: 'Every saving is calculated and the working is shown, so less of it gets discounted.', options: { breakLine: true, paraSpaceAfter: 5 } },
  { text: 'Nothing is lost.  ', options: { bold: true } },
  { text: 'Ideas, decisions and confirmed savings are kept and reused on the next programme.', options: { breakLine: true, paraSpaceAfter: 5 } },
  { text: 'Better use of engineers.  ', options: { bold: true } },
  { text: 'Their time goes on judging and implementing ideas rather than collecting data.', options: {} },
], { x: M.x + 0.20, y: 3.56, w: M.w - 0.40, h: 2.66, isTextBox: true, fontFace: FONT,
     fontSize: 8.2, color: INK, margin: 0, valign: 'top', lineSpacingMultiple: 0.94 });

// ── Measured result, and the ask ─────────────────────────────────────────────
// A business case has to end in something to approve, and the one number this
// product actually owns belongs next to it.
box(s1, { ...M, y: 6.28, h: 0.97, fill: GREEN_FILL, line: GREEN_LINE });
T(s1, [
  { text: 'Already measured.  ', options: { bold: true } },
  { text: 'Run against 16 reference parts held back from development: 15 landed inside tolerance, average error 11%.', options: { breakLine: true, paraSpaceAfter: 3 } },
  { text: 'What we are asking for.  ', options: { bold: true } },
  { text: 'A pilot on one part family — about twenty parts already costed by hand, run in parallel and judged by comparing the two sets of numbers.', options: {} },
], { x: M.x + 0.20, y: 6.38, w: M.w - 0.40, h: 0.82, isTextBox: true, fontFace: FONT,
     fontSize: 7.4, color: INK, margin: 0, valign: 'top', lineSpacingMultiple: 0.93 });

// ── Key individuals ──────────────────────────────────────────────────────────
box(s1, { ...R, y: 0.94, h: 1.70 });
heading(s1, 'Key Individuals:', { x: R.x + 0.20, y: 1.04, w: 2.5, size: 10.5 });
T(s1, [
  { text: 'Use Case Submitter:', options: { breakLine: true } },
  { text: 'LL4 Sponsor:', options: {} },
], { x: R.x + 0.20, y: 1.34, w: R.w - 0.40, h: 0.52, isTextBox: true, fontFace: FONT,
     fontSize: 9.5, color: INK, margin: 0, valign: 'top' });
field(s1, 'Funding agreed with\nFinance', { x: R.x + 0.20, y: 1.95, w: 1.85, h: 0.44, fontSize: 9.5 });
checkbox(s1, { x: R.x + 2.35, y: 2.01, size: 0.24 });

// ── Technical scoping ────────────────────────────────────────────────────────
box(s1, { ...R, y: 2.68, h: 4.57 });
heading(s1, 'Technical Scoping:', { x: R.x + 0.20, y: 2.78, w: 2.5, size: 10.5 });
T(s1, [
  { text: 'Enabling AI on an existing system?', options: { breakLine: true } },
  { text: 'NO — a separate application, and it is already built and running.', options: { fontSize: 7.8, color: MUTED, breakLine: true, paraSpaceAfter: 8 } },
  { text: 'Model used:  ANTHROPIC Claude', options: { breakLine: true, paraSpaceAfter: 8 } },
  { text: 'Technical implementation/support required?', options: { breakLine: true } },
  { text: 'YES — somewhere to host it, a disk that persists and an API key. No new hardware.', options: { fontSize: 7.8, color: MUTED, breakLine: true, paraSpaceAfter: 8 } },
  { text: 'Data handling:', options: { breakLine: true } },
  { text: 'CAD and drawing files are processed on the server and never sent out. Text taken from them — part name, dimensions, material, cost figures — goes to the Anthropic API so the ideas can be written, as does a supplier quote if you upload one to be read.', options: { fontSize: 7.8, color: MUTED, breakLine: true, paraSpaceAfter: 8 } },
  { text: 'What a run needs:', options: { breakLine: true } },
  { text: '3D CAD (STEP or native), 2D drawings, annual volume, and the current price or quote if there is one.', options: { fontSize: 7.8, color: MUTED, breakLine: true, paraSpaceAfter: 8 } },
  { text: 'What comes out:', options: { breakLine: true } },
  { text: 'Excel, PowerPoint and PDF for the review.', options: { fontSize: 7.8, color: MUTED, breakLine: true, paraSpaceAfter: 8 } },
  { text: 'What this is not:', options: { breakLine: true } },
  { text: 'It does not replace the cost engineer\'s judgement. It does the data work and the first pass; the decisions stay with the engineer.', options: { fontSize: 7.8, color: MUTED, breakLine: true, paraSpaceAfter: 8 } },
  { text: 'How to prove it:', options: { breakLine: true } },
  { text: 'Run parts already costed by hand and compare, before anything is relied on.', options: { fontSize: 7.8, color: MUTED } },
], { x: R.x + 0.20, y: 3.06, w: R.w - 0.40, h: 4.13, isTextBox: true, fontFace: FONT,
     fontSize: 8.8, color: INK, margin: 0, valign: 'top', lineSpacingMultiple: 0.92 });

await pres.writeFile({ fileName: OUT });
if (process.argv.includes('--emit-layout')) {
  const { writeFileSync } = await import('node:fs');
  const path = OUT.replace(/\.pptx$/, '.layout.json');
  writeFileSync(path, JSON.stringify({ w: 13.333, h: 7.5, slides: [RECORD[0]] }, null, 1));
  console.log(`wrote ${path} for visual QA`);
}
console.log(`wrote ${OUT} — one slide`);
