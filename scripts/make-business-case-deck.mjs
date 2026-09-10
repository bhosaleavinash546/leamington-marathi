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
const BENEFIT = {
  'Analyze':            'Costed ideas for any vehicle system',
  'Innovation Studio':  'Eight VA/VE methods, every idea priced',
  'TRIZ Studio':        'Breaks cost-versus-performance trade-offs',
  'Idea Studio':        'Ideas from a part photo or CAD file',
  'CAD Diff':           'The cost a design change added',
  'Prism':              'Cost breakdown, quote gap, evidenced ideas',
  'Should-Cost':        'Bottom-up piece price from first principles',
  'CAD \u2192 Cost':        'Cost driven by the geometry itself',
  'PCB \u2192 BOM \u2192 Cost':  'Board image to BOM to cost',
  'BOM Batch':          'Prices a whole BOM in one run',
  'DFM / DFA Studio':   'Catches build problems early',
  'Wiring Harness':     'Copper, connectors and assembly minutes',
  'Pipeline':           'Idea to confirmed saving, tracked',
  'VAVE Tracker':       'Approved ideas driven to implementation',
  'Idea Marketplace':   'Reusable library of proven ideas',
  'Horizon':            'Where the part is heading technically',
  'Trends':             'Commodity trends and the real levers',
};
for (const t of TOOLS) if (!BENEFIT[t.label]) throw new Error(`no benefit line written for tool "${t.label}"`);
// The grid gives each tool ONE line. At 7.4pt Arial in a 3.02in column that is
// about 70 characters including the bold label; past it the row wraps into the
// one below. Caught here rather than in a screenshot.
for (const t of TOOLS) {
  const chars = t.label.length + 2 + BENEFIT[t.label].length;
  if (chars > 68) throw new Error(`"${t.label}" + benefit is ${chars} chars — it will wrap into the next row (max 68)`);
}

const GROUP = {
  generate: 'Generate ideas',
  cost:     'Cost and analyse',
  track:    'Track and decide',
  learn:    'Learn and look ahead',
};

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

// ═══ ONE SLIDE — the business case, in the template's layout ═════════════════
// Three columns, every box the template names, and the tool suite folded into
// the Proposed Solution rather than spilling onto a second slide.
const s1 = pres.addSlide();
s1.background = { color: 'FFFFFF' };

T(s1, 'AI IDEA GENERATION BUSINESS CASE', {
  x: 0.42, y: 0.18, w: 8, h: 0.24, isTextBox: true, fontFace: FONT, fontSize: 8.5,
  color: MUTED, charSpacing: 2.2, margin: 0, valign: 'middle',
});
T(s1, 'BrainSpark  –  AI-Assisted Cost Reduction Idea Generation', {
  x: 0.42, y: 0.44, w: 10.5, h: 0.38, isTextBox: true, fontFace: FONT, fontSize: 18,
  color: INK, charSpacing: 1.4, margin: 0, valign: 'middle',
});

const L = { x: 0.25, w: 6.55 }, M = { x: 6.95, w: 3.05 }, R = { x: 10.15, w: 2.93 };

// ── Problem statement ────────────────────────────────────────────────────────
box(s1, { ...L, y: 0.94, h: 1.26 });
heading(s1, 'Problem Statement', { x: L.x + 0.23, y: 1.04, w: 2.6, size: 10.5 });
field(s1, 'PII:', { x: 5.45, y: 1.04, w: 0.5, fontSize: 10, bold: true });
checkbox(s1, { x: 5.92, y: 1.00, size: 0.24 });
bullets(s1, [
  'Cost reduction ideas come from workshops, so the output depends on who is in the room that week.',
  'Ideas arrive as one-liners — no process, no part detail, no number attached.',
  'Savings are estimated from opinion, so Finance discounts them until someone proves them.',
  'Only the parts the attendees know get looked at, and nothing brings in benchmark or cross-industry data.',
], { x: L.x + 0.23, y: 1.34, w: L.w - 0.46, h: 0.96, size: 8.2, lineGap: 1 });

// ── Current state ────────────────────────────────────────────────────────────
box(s1, { ...L, y: 2.30, h: 1.30 });
heading(s1, 'Current State', { x: L.x + 0.23, y: 2.40, w: 2.6, size: 10.5 });
bullets(s1, [
  'People-dependent and skill-dependent: a few experienced engineers carry it. When they are busy, idea flow stops.',
  'Days of manual preparation — drawings, BOMs, cost data, benchmarks — before a workshop can even run.',
  '8–15 people off the job for one to two days, then weeks of chasing authors for enough detail to cost an idea.',
  'Many ideas are never completed and quietly drop out; what was proven or rejected elsewhere is invisible.',
], { x: L.x + 0.23, y: 2.70, w: L.w - 0.46, h: 0.96, size: 8.2, lineGap: 1 });

// ── Proposed solution, with the tool suite inside it ─────────────────────────
box(s1, { ...L, y: 3.70, h: 3.55 });
heading(s1, 'Proposed Solution / Model', { x: L.x + 0.23, y: 3.80, w: 3.4, size: 10.5 });
bullets(s1, [
  'Upload the 3D CAD and the 2D drawings. Geometry, material, tolerances and finishes are read automatically, and ideas come back at assembly, sub-assembly, part and technology level.',
  'Ideas cover lower-cost design with benchmark references, alternative materials and manufacturing processes, part and fastener consolidation, tolerance and finish relaxation, and genuinely novel concepts.',
  'Every idea is priced by a deterministic cost engine and labelled confirmed, contradicted, or not verifiable with the reason. The AI proposes and explains; it never invents a number.',
  'All automotive commodities: BIW, chassis, powertrain, e-drive, battery, thermal, interior, exterior, electrical / electronic, harness.',
], { x: L.x + 0.23, y: 4.10, w: L.w - 0.46, h: 1.10, size: 8.2, lineGap: 1 });

T(s1, `${TOOLS.length} tools built and working`, {
  x: L.x + 0.23, y: 5.28, w: 3.0, h: 0.2, isTextBox: true, fontFace: FONT, fontSize: 8.5,
  bold: true, color: INK, margin: 0, valign: 'middle',
});
const GRID_X = [L.x + 0.23, L.x + 3.42], GRID_W = 3.02;
TOOLS.forEach((t, i) => {
  const c = i < 9 ? 0 : 1, r = i < 9 ? i : i - 9;
  T(s1, [
    { text: t.label, options: { bold: true } },
    { text: '  ' + BENEFIT[t.label], options: { color: MUTED } },
  ], { x: GRID_X[c], y: 5.54 + r * 0.185, w: GRID_W, h: 0.18, isTextBox: true,
       fontFace: FONT, fontSize: 7.4, color: INK, margin: 0, valign: 'middle' });
});

// ── Projected ROI ────────────────────────────────────────────────────────────
box(s1, { ...M, y: 0.94, h: 1.26, fill: GREEN_FILL, line: GREEN_LINE });
heading(s1, 'Projected ROI', { x: M.x + 0.20, y: 1.04, w: 2.6, size: 10.5 });
T(s1, [
  { text: 'Cost: £', options: { breakLine: true } },
  { text: 'Return:', options: { breakLine: true } },
  { text: 'What is the return based on?', options: { breakLine: true } },
  { text: 'Engineering hours released × loaded rate, plus confirmed piece-cost saving × annual volume.', options: { italic: true, fontSize: 7.2, color: MUTED } },
], { x: M.x + 0.20, y: 1.32, w: M.w - 0.40, h: 0.94, isTextBox: true, fontFace: FONT,
     fontSize: 9.5, color: INK, margin: 0, valign: 'top', lineSpacingMultiple: 0.92 });

// ── Time ─────────────────────────────────────────────────────────────────────
box(s1, { ...M, y: 2.30, h: 0.46, fill: BLUE_FILL, line: BLUE_LINE });
field(s1, 'Time (hrs/week)', { x: M.x + 0.20, y: 2.41, w: 2.6, fontSize: 10.5, bold: true });

// ── Expected benefits ────────────────────────────────────────────────────────
box(s1, { ...M, y: 2.86, h: 4.39, fill: GREEN_FILL, line: GREEN_LINE });
heading(s1, 'Expected Benefits:', { x: M.x + 0.20, y: 2.96, w: 2.6, size: 10.5 });
T(s1, [
  { text: 'Capacity  ', options: { bold: true } },
  { text: 'Hundreds of parts a programme, not a workshop shortlist.', options: { breakLine: true, paraSpaceAfter: 6 } },
  { text: 'Speed  ', options: { bold: true } },
  { text: 'Ideas in minutes, already described and costed. No chase cycle.', options: { breakLine: true, paraSpaceAfter: 6 } },
  { text: 'Depth  ', options: { bold: true } },
  { text: 'Process, material, tolerance and a calculated saving on every idea.', options: { breakLine: true, paraSpaceAfter: 6 } },
  { text: 'Consistency  ', options: { bold: true } },
  { text: 'The same method every time, whoever is available that week.', options: { breakLine: true, paraSpaceAfter: 6 } },
  { text: 'Coverage  ', options: { bold: true } },
  { text: 'Every commodity, including the ones a workshop never reaches.', options: { breakLine: true, paraSpaceAfter: 6 } },
  { text: 'Evidence  ', options: { bold: true } },
  { text: 'Savings come from a cost engine Finance can check, not an opinion.', options: { breakLine: true, paraSpaceAfter: 6 } },
  { text: 'Retention  ', options: { bold: true } },
  { text: 'Ideas, decisions and confirmed savings are kept and reused.', options: { breakLine: true, paraSpaceAfter: 6 } },
  { text: 'Engineers  ', options: { bold: true } },
  { text: 'Freed from data entry to judge and implement the ideas.', options: {} },
], { x: M.x + 0.20, y: 3.26, w: M.w - 0.40, h: 3.86, isTextBox: true, fontFace: FONT,
     fontSize: 8.2, color: INK, margin: 0, valign: 'top', lineSpacingMultiple: 0.94 });

// ── Key individuals ──────────────────────────────────────────────────────────
box(s1, { ...R, y: 0.94, h: 1.26 });
heading(s1, 'Key Individuals:', { x: R.x + 0.20, y: 1.04, w: 2.5, size: 10.5 });
T(s1, [
  { text: 'Use Case Submitter:', options: { breakLine: true } },
  { text: 'LL4 Sponsor:', options: {} },
], { x: R.x + 0.20, y: 1.34, w: R.w - 0.40, h: 0.52, isTextBox: true, fontFace: FONT,
     fontSize: 9.5, color: INK, margin: 0, valign: 'top' });
field(s1, 'Funding agreed with\nFinance', { x: R.x + 0.20, y: 1.76, w: 1.85, h: 0.44, fontSize: 9.5 });
checkbox(s1, { x: R.x + 2.35, y: 1.82, size: 0.24 });

// ── Technical scoping ────────────────────────────────────────────────────────
box(s1, { ...R, y: 2.30, h: 4.95 });
heading(s1, 'Technical Scoping:', { x: R.x + 0.20, y: 2.40, w: 2.5, size: 10.5 });
T(s1, [
  { text: 'Enabling AI on an existing system?', options: { breakLine: true } },
  { text: 'NO — standalone application, already built. Feeds existing costing systems by export.', options: { fontSize: 7.8, color: MUTED, breakLine: true, paraSpaceAfter: 8 } },
  { text: 'Model used:  ANTHROPIC Claude', options: { breakLine: true, paraSpaceAfter: 8 } },
  { text: 'Technical implementation/support required?', options: { breakLine: true } },
  { text: 'YES — hosting, a persistent volume and an API key. No new hardware.', options: { fontSize: 7.8, color: MUTED, breakLine: true, paraSpaceAfter: 8 } },
  { text: 'Data handling:', options: { breakLine: true } },
  { text: 'CAD, drawings and cost data stay inside the deployment. Accounts hold a work email only.', options: { fontSize: 7.8, color: MUTED, breakLine: true, paraSpaceAfter: 8 } },
  { text: 'To start a run:', options: { breakLine: true } },
  { text: '3D CAD (STEP or native), 2D drawings, annual volume, and the current price or quote where there is one.', options: { fontSize: 7.8, color: MUTED, breakLine: true, paraSpaceAfter: 8 } },
  { text: 'Output:', options: { breakLine: true } },
  { text: 'Excel, PowerPoint and PDF, straight into the programme review.', options: { fontSize: 7.8, color: MUTED, breakLine: true, paraSpaceAfter: 8 } },
  { text: 'Proving it:', options: { breakLine: true } },
  { text: 'Run parts already costed by hand and compare, before anything is relied on.', options: { fontSize: 7.8, color: MUTED } },
], { x: R.x + 0.20, y: 2.70, w: R.w - 0.40, h: 4.44, isTextBox: true, fontFace: FONT,
     fontSize: 8.8, color: INK, margin: 0, valign: 'top', lineSpacingMultiple: 0.92 });

await pres.writeFile({ fileName: OUT });
if (process.argv.includes('--emit-layout')) {
  const { writeFileSync } = await import('node:fs');
  const path = OUT.replace(/\.pptx$/, '.layout.json');
  writeFileSync(path, JSON.stringify({ w: 13.333, h: 7.5, slides: [RECORD[0]] }, null, 1));
  console.log(`wrote ${path} for visual QA`);
}
console.log(`wrote ${OUT} — one slide, ${TOOLS.length} tools from the registry`);
