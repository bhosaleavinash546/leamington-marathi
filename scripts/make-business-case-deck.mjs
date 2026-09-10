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
  'Analyze':            'Costed ideas for any vehicle system in minutes, not a workshop',
  'Innovation Studio':  'Eight structured VA/VE methods run on demand, each idea priced',
  'TRIZ Studio':        'Breaks cost-versus-performance trade-offs instead of accepting them',
  'Idea Studio':        'Ideas from a part photo or CAD file when no data pack exists',
  'CAD Diff':           'Finds the cost added by a design change, revision to revision',
  'Prism':              'One part in: cost breakdown, quote gap and evidence-backed ideas out',
  'Should-Cost':        'Bottom-up piece price from material, cycle, tooling and overhead',
  'CAD → Cost':         'Cost driven by the geometry itself, straight from the 3D model',
  'PCB → BOM → Cost':   'Board image to bill of materials to cost, without a teardown',
  'BOM Batch':          'Prices a whole BOM in one run to find where the money sits',
  'DFM / DFA Studio':   'Flags manufacturing and assembly problems while change is still cheap',
  'Wiring Harness':     'Costs copper, connectors and assembly minutes line by line',
  'Pipeline':           'Tracks every idea from proposal to a saving finance has confirmed',
  'VAVE Tracker':       'Keeps approved ideas moving to implementation, with owners and dates',
  'Idea Marketplace':   'A reusable library of proven ideas, so nothing is invented twice',
  'Horizon':            'Shows where a part is heading technically over the next few years',
  'Trends':             'Commodity cost trends and the levers that actually move them',
};
for (const t of TOOLS) if (!BENEFIT[t.label]) throw new Error(`no benefit line written for tool "${t.label}"`);

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

// ═══ SLIDE 1 — the business case, in the template's layout ═══════════════════
const s1 = pres.addSlide();
s1.background = { color: 'FFFFFF' };

T(s1, 'AI IDEA GENERATION BUSINESS CASE', {
  x: 0.42, y: 0.20, w: 8, h: 0.26, isTextBox: true, fontFace: FONT, fontSize: 9, bold: false,
  color: MUTED, charSpacing: 2.2, margin: 0, valign: 'middle',
});
T(s1, 'BrainSpark  –  AI-Assisted Cost Reduction Idea Generation', {
  x: 0.42, y: 0.48, w: 10.5, h: 0.42, isTextBox: true, fontFace: FONT, fontSize: 19,
  color: INK, charSpacing: 1.6, margin: 0, valign: 'middle',
});

// ── Problem statement ────────────────────────────────────────────────────────
box(s1, { x: 0.25, y: 1.02, w: 6.55, h: 1.98 });
heading(s1, 'Problem Statement', { x: 0.48, y: 1.16, w: 2.6 });
field(s1, 'PII:', { x: 5.45, y: 1.16, w: 0.5, fontSize: 10.5, bold: true });
checkbox(s1, { x: 5.95, y: 1.12 });
bullets(s1, [
  'Cost reduction ideas come from workshops. Output depends on who is in the room that week.',
  'Ideas arrive as one-liners — "change the material", "delete a bracket" — with no process, no part detail and no number.',
  'Savings are estimated from opinion and experience, so Finance discounts them until someone proves them.',
  'Only the parts the attendees happen to know get looked at. Whole commodities are never covered.',
  'Ideas repeat what the team already knows. Nothing systematically brings in benchmark data or what other industries do.',
], { x: 0.48, y: 1.50, w: 6.05, h: 1.42 });

// ── Projected ROI ────────────────────────────────────────────────────────────
box(s1, { x: 6.95, y: 1.02, w: 3.05, h: 1.42, fill: GREEN_FILL, line: GREEN_LINE });
heading(s1, 'Projected ROI', { x: 7.15, y: 1.14, w: 2.6, size: 11.5 });
T(s1, [
  { text: 'Cost: £', options: { breakLine: true } },
  { text: 'Return:', options: { breakLine: true } },
  { text: 'What is the return based on?', options: { breakLine: true } },
  { text: 'Engineering hours released × loaded rate, plus confirmed piece-cost saving × annual volume.', options: { italic: true, fontSize: 7.6, color: MUTED } },
], { x: 7.15, y: 1.44, w: 2.68, h: 0.92, isTextBox: true, fontFace: FONT, fontSize: 10, color: INK, margin: 0, valign: 'top', lineSpacingMultiple: 0.92 });

// ── Time ─────────────────────────────────────────────────────────────────────
box(s1, { x: 6.95, y: 2.53, w: 3.05, h: 0.47, fill: BLUE_FILL, line: BLUE_LINE });
field(s1, 'Time (hrs/week)', { x: 7.15, y: 2.65, w: 2.6, fontSize: 11.5, bold: true });

// ── Key individuals ──────────────────────────────────────────────────────────
box(s1, { x: 10.15, y: 1.02, w: 2.93, h: 1.98 });
heading(s1, 'Key Individuals:', { x: 10.35, y: 1.14, w: 2.5, size: 11.5 });
T(s1, [
  { text: 'Use Case Submitter:', options: { breakLine: true } },
  { text: 'LL4 Sponsor:', options: {} },
], { x: 10.35, y: 1.46, w: 2.55, h: 0.6, isTextBox: true, fontFace: FONT, fontSize: 10, color: INK, margin: 0, valign: 'top' });
field(s1, 'Funding agreed with\nFinance', { x: 10.35, y: 2.24, w: 1.95, h: 0.5, fontSize: 10 });
checkbox(s1, { x: 12.45, y: 2.34 });

// ── Current state ────────────────────────────────────────────────────────────
box(s1, { x: 0.25, y: 3.12, w: 9.75, h: 1.64 });
heading(s1, 'Current State', { x: 0.48, y: 3.24, w: 2.6 });
bullets(s1, [
  'People-dependent and skill-dependent: a handful of experienced engineers carry the ideas. When they are busy or leave, idea flow stops.',
  'Heavy preparation: drawings, BOMs, cost data and benchmark references are pulled together by hand for days before a workshop can run.',
  'Time and resources: 8–15 people off the job for one to two days, plus preparation before and chasing afterwards.',
  'Follow-up burden: single-line ideas go back to their author for a description, a feasibility view and a saving estimate. Many are never completed and quietly drop out.',
  'No memory: ideas already proven — or already rejected — on another programme are not visible, so the same ground is covered again.',
], { x: 0.48, y: 3.56, w: 9.3, h: 1.12, lineGap: 2 });

// ── Proposed solution ────────────────────────────────────────────────────────
box(s1, { x: 0.25, y: 4.88, w: 9.75, h: 2.37 });
heading(s1, 'Proposed Solution / Model', { x: 0.48, y: 5.00, w: 3.4 });
bullets(s1, [
  'Upload the 3D CAD and the 2D drawings. The tool reads geometry, material, tolerances and finishes, and generates ideas at assembly, sub-assembly, part and technology level.',
  'Ideas cover alternative lower-cost design with benchmark references, alternative materials and manufacturing processes, part and fastener consolidation, tolerance and finish relaxation, and genuinely novel concepts.',
  'Every idea is priced by a deterministic should-cost engine and labelled confirmed, contradicted, or not verifiable with the reason. The AI proposes and explains; it never invents a number.',
  'Covers all automotive commodities: BIW, chassis, powertrain, e-drive, battery, thermal, interior, exterior, electrical / electronic and wiring harness.',
  `${TOOLS.length} tools built and working across generate, cost, track and learn — listed with their benefits on the next slide.`,
  'Runs per part in minutes, so volume is limited by parts to review, not by people available.',
], { x: 0.48, y: 5.32, w: 5.55, h: 1.80, size: 8.4, lineGap: 2 });

// ── Expected benefits (nested, as in the template) ───────────────────────────
box(s1, { x: 6.18, y: 5.00, w: 3.68, h: 2.19, fill: GREEN_FILL, line: GREEN_LINE });
heading(s1, 'Expected Benefits:', { x: 6.38, y: 5.11, w: 3.2, size: 11 });
T(s1, [
  { text: 'Capacity: ', options: { bold: true } },
  { text: 'hundreds of parts a programme, not a shortlist.', options: { breakLine: true, paraSpaceAfter: 2 } },
  { text: 'Speed: ', options: { bold: true } },
  { text: 'ideas in minutes, already described and costed — no chase cycle.', options: { breakLine: true, paraSpaceAfter: 2 } },
  { text: 'Depth: ', options: { bold: true } },
  { text: 'process, material, tolerance and a calculated saving on every idea.', options: { breakLine: true, paraSpaceAfter: 2 } },
  { text: 'Consistency: ', options: { bold: true } },
  { text: 'the same method every time, whoever is available.', options: { breakLine: true, paraSpaceAfter: 2 } },
  { text: 'Evidence: ', options: { bold: true } },
  { text: 'savings come from a cost engine Finance can check.', options: { breakLine: true, paraSpaceAfter: 2 } },
  { text: 'Retention: ', options: { bold: true } },
  { text: 'ideas, decisions and confirmed savings are kept and reused.', options: {} },
], { x: 6.38, y: 5.42, w: 3.32, h: 1.72, isTextBox: true, fontFace: FONT, fontSize: 8.2, color: INK, margin: 0, valign: 'top', lineSpacingMultiple: 0.92 });

// ── Technical scoping ────────────────────────────────────────────────────────
box(s1, { x: 10.15, y: 3.12, w: 2.93, h: 4.13 });
heading(s1, 'Technical Scoping:', { x: 10.35, y: 3.24, w: 2.5, size: 11.5 });
T(s1, [
  { text: 'Enabling AI on an existing system?', options: { breakLine: true } },
  { text: 'NO — built and running as a standalone application. Integrates with existing costing systems by export.', options: { fontSize: 8.4, color: MUTED, breakLine: true, paraSpaceAfter: 9 } },
  { text: 'Model used:  ANTHROPIC Claude', options: { breakLine: true, paraSpaceAfter: 9 } },
  { text: 'Technical implementation/support required?', options: { breakLine: true } },
  { text: 'YES — hosting, a deployment volume and an API key. No new hardware.', options: { fontSize: 8.4, color: MUTED, breakLine: true, paraSpaceAfter: 9 } },
  { text: 'Data handling:', options: { breakLine: true } },
  { text: 'CAD, drawings and cost data stay in the deployment. Accounts hold a work email only.', options: { fontSize: 8.4, color: MUTED, breakLine: true, paraSpaceAfter: 9 } },
  { text: 'To start a run:', options: { breakLine: true } },
  { text: '3D CAD (STEP or native), 2D drawings, annual volume, and the current price or quote where there is one.', options: { fontSize: 8.4, color: MUTED, breakLine: true, paraSpaceAfter: 9 } },
  { text: 'Proving it:', options: { breakLine: true } },
  { text: 'Run a set of parts already costed by hand and compare, before anything is relied on.', options: { fontSize: 8.4, color: MUTED } },
], { x: 10.35, y: 3.58, w: 2.55, h: 3.5, isTextBox: true, fontFace: FONT, fontSize: 9.6, color: INK, margin: 0, valign: 'top', lineSpacingMultiple: 0.92 });

// ═══ SLIDE 2 — the tool suite ════════════════════════════════════════════════
SLIDE = 1;
const s2 = pres.addSlide();
s2.background = { color: 'FFFFFF' };
T(s2, 'AI IDEA GENERATION BUSINESS CASE', {
  x: 0.42, y: 0.20, w: 8, h: 0.26, isTextBox: true, fontFace: FONT, fontSize: 9,
  color: MUTED, charSpacing: 2.2, margin: 0, valign: 'middle',
});
T(s2, `The tools built  –  ${TOOLS.length} working today`, {
  x: 0.42, y: 0.48, w: 10.5, h: 0.42, isTextBox: true, fontFace: FONT, fontSize: 19,
  color: INK, charSpacing: 1.6, margin: 0, valign: 'middle',
});

const ordered = ['generate', 'cost', 'track', 'learn'];
const COL_X = [0.25, 6.75], COL_W = 6.3;
let col = 0, y = 1.05;
for (const g of ordered) {
  const list = TOOLS.filter(t => t.category === g);
  const h = 0.42 + list.length * 0.315 + 0.14;
  if (y + h > 7.3) { col = 1; y = 1.05; }
  box(s2, { x: COL_X[col], y, w: COL_W, h });
  heading(s2, GROUP[g], { x: COL_X[col] + 0.22, y: y + 0.13, w: 3.6, size: 11 });
  list.forEach((t, i) => {
    const ry = y + 0.48 + i * 0.315;
    T(s2, [
      { text: t.label, options: { bold: true } },
      { text: '   ' + BENEFIT[t.label], options: { color: MUTED } },
    ], { x: COL_X[col] + 0.22, y: ry, w: COL_W - 0.44, h: 0.26, isTextBox: true, fontFace: FONT, fontSize: 8.8, color: INK, margin: 0, valign: 'middle' });
    if (i < list.length - 1) {
      rec({ kind: 'rule', x: COL_X[col] + 0.22, y: ry + 0.281, w: COL_W - 0.44 });
      s2.addShape(pres.ShapeType.line, { x: COL_X[col] + 0.22, y: ry + 0.281, w: COL_W - 0.44, h: 0, line: { color: RULE, width: 0.5 } });
    }
  });
  y += h + 0.18;
}

// The right column runs out before the left one does. Rather than pad it,
// state the two things a reviewer always asks next.
box(s2, { x: COL_X[1], y: 4.02, w: COL_W, h: 1.62 });
heading(s2, 'What a run needs, and what comes back', { x: COL_X[1] + 0.22, y: 4.15, w: 5.6, size: 11 });
T(s2, [
  { text: 'In:  ', options: { bold: true } },
  { text: '3D CAD (STEP or native) and 2D drawings, annual volume, and the current price or supplier quote where there is one.', options: { breakLine: true, paraSpaceAfter: 4 } },
  { text: 'Out:  ', options: { bold: true } },
  { text: 'ideas at assembly, sub-assembly, part and technology level — each with a described change, a process route, a calculated saving and the engine\'s verdict.', options: { breakLine: true, paraSpaceAfter: 4 } },
  { text: 'Export:  ', options: { bold: true } },
  { text: 'Excel, PowerPoint and PDF, so the output goes straight into the programme review.', options: {} },
], { x: COL_X[1] + 0.22, y: 4.48, w: COL_W - 0.44, h: 1.05, isTextBox: true, fontFace: FONT, fontSize: 8.8, color: INK, margin: 0, valign: 'top', lineSpacingMultiple: 0.95 });

T(s2, 'Every idea any of these tools produces carries the engine\'s verdict — confirmed, contradicted, or not verifiable with the reason stated.', {
  x: 0.25, y: 7.06, w: 12.8, h: 0.26, isTextBox: true, fontFace: FONT, fontSize: 8.6, italic: true, color: MUTED, margin: 0, valign: 'middle',
});

await pres.writeFile({ fileName: OUT });
if (process.argv.includes('--emit-layout')) {
  const { writeFileSync } = await import('node:fs');
  const path = OUT.replace(/\.pptx$/, '.layout.json');
  writeFileSync(path, JSON.stringify({ w: 13.333, h: 7.5, slides: RECORD }, null, 1));
  console.log(`wrote ${path} for visual QA`);
}
console.log(`wrote ${OUT} — 2 slides, ${TOOLS.length} tools from the registry`);
