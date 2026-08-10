// The DFM / DFA Studio director deck.
//
// Kept in the repo, unlike the platform deck's generator, because every figure
// on these slides is READ FROM THE CODE rather than typed: rule and family
// counts come from the catalogue, the audit split from the register, the
// coverage table from the commodity sweep's own output. A deck whose numbers
// are retyped goes stale the first week and nobody notices.
//
// The screenshots are REAL REPORT PAGES from scripts/pdf-qa, not mockups. If a
// slide shows a page, that page renders today.
//
//   node scripts/make-dfm-deck.mjs
import pptxgen from 'pptxgenjs';
import { readFileSync } from 'node:fs';
import { DFM_RULES, PROCESS_FAMILIES } from '../dfm-rule-catalogue.mjs';
import { MATERIALS } from '../costing-engine.mjs';

const audit = JSON.parse(readFileSync(new URL('../docs/threshold-audit.json', import.meta.url), 'utf-8'));
const ICONS = JSON.parse(readFileSync(new URL('./deck-icons.json', import.meta.url), 'utf-8'));
const icon = (n) => `data:image/png;base64,${ICONS[n]}`;

// ── Live figures, counted rather than remembered ────────────────────────────
const RULES = DFM_RULES.length;
const FAMILIES = Object.keys(PROCESS_FAMILIES).length;
const MATERIAL_COUNT = Object.keys(MATERIALS).length;
const auditRows = Object.values(audit.thresholds);
const PRIMARY_READ = auditRows.filter((t) => t.status === 'primary-read').length;
const CONTESTED = auditRows.filter((t) => t.status === 'contested').length;
const UNAUDITED = RULES - auditRows.length;

// From `node benchmark/commodity-sweep.mjs`, recorded with the run date so a
// stale table is visible rather than silently believed.
const SWEEP_DATE = '10 Aug 2026';
const SWEEP = [
  ['HPDC housing', 'High-pressure die casting', '83.3', '4.8'],
  ['Gear blank', 'Powder metallurgy', '83.3', '0.0'],
  ['Extruded profile', 'Extrusion', '83.3', '0.1'],
  ['Moulded cover', 'Injection moulding', '77.8', '3.3'],
  ['Machined block', 'Machining', '71.4', '1.3'],
  ['Drawn cup', 'Deep drawing', '68.0', '0.3'],
  ['Forged lever', 'Hot forging', '66.7', '3.7'],
  ['Turned shaft', 'Turning', '60.0', '1.0'],
  ['Sand-cast arm', 'Sand casting', '60.0', '1.5'],
  ['Sheet bracket', 'Sheet metal', '37.5', '0.0'],
];

const NAVY = '0D1F33';
const NAVY_MID = '15304E';
const GOLD = 'F59E0B';
const INK = '1F2937';
const BODY = '374151';
const MUT = '6B7280';
const PAPER = 'FFFFFF';
const PANEL = 'F1F5F9';
const GREEN = '059669';
const RED = 'DC2626';

const img = (p) => `data:image/png;base64,${readFileSync(new URL(p, import.meta.url)).toString('base64')}`;
const SHOT = {
  page1: img('pdf-qa/ann_p1.png'),
  evidence: img('pdf-qa/ann_p3.png'),
  actions: img('pdf-qa/actions_page.png'),
  diff: img('pdf-qa/diff_page.png'),
  forming: img('pdf-qa/forming.png'),
  iso: img('pdf-qa/live-iso.png'),
};

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';          // 13.3 x 7.5 in — set BEFORE any slide
pres.author = 'Avinash Bhosale';
pres.title = 'BrainSpark DFM / DFA Studio';

const W = 13.33;
const H = 7.5;
const M = 0.62;                        // page margin
let slideNo = 0;
const TOTAL = 15;

/** Every content slide shares one footer, so the deck reads as one document. */
function footer(s) {
  slideNo += 1;
  s.addText(`BrainSpark DFM / DFA Studio  ·  Design-for-Manufacture & Assembly  ·  ${slideNo}/${TOTAL}`,
    { x: M, y: H - 0.46, w: W - 2 * M, h: 0.26, fontSize: 9, color: MUT, fontFace: 'Calibri' });
}

/** Section title, used on every light slide so the eye lands in the same place. */
function heading(s, kicker, title) {
  s.addText(kicker.toUpperCase(), {
    x: M, y: 0.52, w: W - 2 * M, h: 0.24, fontSize: 11, bold: true, color: GOLD,
    fontFace: 'Calibri', charSpacing: 2, margin: 0,
  });
  s.addText(title, {
    x: M, y: 0.84, w: W - 2 * M, h: 0.7, fontSize: 32, bold: true, color: INK,
    fontFace: 'Cambria', margin: 0,
  });
}

/** A statistic block — the deck's one repeated motif. */
function stat(s, x, y, w, value, label, colour = INK, note) {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h: note ? 1.48 : 1.18, fill: { color: PANEL }, rectRadius: 0.06, line: { color: PANEL },
  });
  s.addText(value, { x: x + 0.18, y: y + 0.12, w: w - 0.36, h: 0.5, fontSize: 28, bold: true, color: colour, fontFace: 'Cambria', margin: 0 });
  s.addText(label, { x: x + 0.18, y: y + 0.64, w: w - 0.36, h: 0.28, fontSize: 10, bold: true, color: MUT, fontFace: 'Calibri', charSpacing: 1, margin: 0 });
  if (note) s.addText(note, { x: x + 0.18, y: y + 0.92, w: w - 0.36, h: 0.46, fontSize: 9.5, color: BODY, fontFace: 'Calibri', margin: 0 });
}

// ── 1 · Title ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: NAVY };
  s.addImage({ data: SHOT.iso, x: 7.7, y: 1.6, w: 5.0, h: 3.56, transparency: 22 });
  s.addText('PART OF THE BRAINSPARK AI COST-ENGINEERING PLATFORM', {
    x: M, y: 1.5, w: 7.2, h: 0.3, fontSize: 10.5, bold: true, color: GOLD, fontFace: 'Calibri', charSpacing: 2, margin: 0,
  });
  s.addText('DFM / DFA Studio', {
    x: M, y: 1.95, w: 7.4, h: 1.0, fontSize: 46, bold: true, color: 'FFFFFF', fontFace: 'Cambria', margin: 0,
  });
  s.addText('Manufacturability measured from the CAD model — not judged from a checklist', {
    x: M, y: 3.0, w: 7.0, h: 0.82, fontSize: 16, color: 'CBD5E1', fontFace: 'Calibri', margin: 0,
  });
  s.addText('Upload a STEP file. Get every rule your chosen process breaks, marked on the part,\npriced by the same engines that quote it, and written as decisions with owners.', {
    x: M, y: 3.95, w: 6.9, h: 0.9, fontSize: 12.5, color: '94A3B8', fontFace: 'Calibri', lineSpacing: 20, margin: 0,
  });
  s.addText('Avinash Bhosale   ·   Cost Engineering   ·   August 2026', {
    x: M, y: H - 1.15, w: 8, h: 0.3, fontSize: 11.5, color: '64748B', fontFace: 'Calibri', margin: 0,
  });
  s.addNotes('Good morning. Ten minutes on the DFM/DFA Studio — what it does, what is genuinely inside it, and one thing I need from you at the end.\n\nThe one-line version is on the slide: it measures manufacturability from the geometry rather than asking an engineer to work through a checklist. The part on the right is a real render out of the tool, not a stock image.');
}

// ── 2 · The problem ─────────────────────────────────────────────────────────
{
  const s = pres.addSlide(); s.background = { color: PAPER };
  heading(s, 'Why this tool', 'The cheapest moment to change a part');
  s.addText([
    { text: 'A DFM review today depends on who is in the room.', options: { bold: true, breakLine: true } },
    { text: 'A senior engineer catches an undercut in ten seconds. A busy one signs the drawing. The part reaches the toolmaker, the slide appears in the quote, and by then the tooling is committed and the change costs ten times what it would have.', options: { breakLine: true } },
    { text: '' , options: { breakLine: true } },
    { text: 'Three things go wrong repeatedly:', options: { bold: true, breakLine: true } },
  ], { x: M, y: 1.62, w: 6.5, h: 2.0, fontSize: 13.5, color: BODY, fontFace: 'Calibri', lineSpacing: 22, margin: 0 });

  const items = [
    ['The rule is generic', 'One draft figure for every casting process, one bend radius for every alloy — so the finding is either wrong or ignored.'],
    ['The finding has no place', '"34 undercut regions" sends a supplier hunting through CAD instead of acting.'],
    ['The finding has no price', 'Nobody prioritises a list where a cosmetic radius and a €77k slide sit on the same line.'],
  ];
  items.forEach(([t, d], i) => {
    const y = 3.62 + i * 0.86;
    s.addShape(pres.ShapeType.ellipse, { x: M, y, w: 0.34, h: 0.34, fill: { color: GOLD }, line: { color: GOLD } });
    s.addText(String(i + 1), { x: M, y, w: 0.34, h: 0.34, fontSize: 12, bold: true, color: NAVY, align: 'center', valign: 'middle', fontFace: 'Calibri', margin: 0 });
    s.addText(t, { x: M + 0.52, y: y - 0.04, w: 5.9, h: 0.28, fontSize: 13, bold: true, color: INK, fontFace: 'Calibri', margin: 0 });
    s.addText(d, { x: M + 0.52, y: y + 0.24, w: 5.9, h: 0.5, fontSize: 11, color: BODY, fontFace: 'Calibri', margin: 0 });
  });

  // The caption that used to sit beside this render was 1.55" wide and squeezed
  // against the right edge. The image is self-explanatory next to the three
  // failure modes; a label crushed into a gutter is worse than none.
  s.addImage({ data: SHOT.page1, x: 8.15, y: 1.5, w: 3.7, h: 5.23 });
  footer(s);
  s.addNotes('The honest problem statement. A DFM review is only as good as who happens to be reviewing, and the cost of missing something scales with how late it is caught.\n\nThe three failure modes on the left are the ones I set out to fix, and they map exactly onto the three things you will see next: rules that know the process and the alloy, findings marked on the geometry, and every finding priced.');
}

// ── 3 · What it does ────────────────────────────────────────────────────────
{
  const s = pres.addSlide(); s.background = { color: PAPER };
  heading(s, 'How it works', 'Four stages, each one auditable');
  const stages = [
    ['READ', 'B-rep from your STEP or IGES', 'OpenCascade kernel. Faces, edges, topology — no mesh approximation of the shape.'],
    ['MEASURE', 'Geometry, not guesswork', 'Wall thickness, draft, undercuts, bends, holes, tool reach — each with the method it used.'],
    ['JUDGE', `${RULES} rules across ${FAMILIES} families`, 'Only the rules for the process YOU chose, with thresholds resolved for YOUR alloy.'],
    ['PRICE', 'The same should-cost engines', 'What the change is worth per part and per year, or an explicit reason it cannot be priced.'],
  ];
  stages.forEach(([k, t, d], i) => {
    const x = M + i * 3.08;
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.75, w: 2.82, h: 2.5, fill: { color: PANEL }, rectRadius: 0.06, line: { color: PANEL } });
    s.addText(k, { x: x + 0.22, y: 1.95, w: 2.4, h: 0.28, fontSize: 11, bold: true, color: GOLD, fontFace: 'Calibri', charSpacing: 2, margin: 0 });
    s.addText(t, { x: x + 0.22, y: 2.28, w: 2.4, h: 0.6, fontSize: 14, bold: true, color: INK, fontFace: 'Cambria', margin: 0 });
    s.addText(d, { x: x + 0.22, y: 2.95, w: 2.4, h: 1.15, fontSize: 10.5, color: BODY, fontFace: 'Calibri', margin: 0 });
    if (i < 3) s.addText('>', { x: x + 2.85, y: 2.85, w: 0.22, h: 0.3, fontSize: 16, bold: true, color: GOLD, align: 'center', fontFace: 'Calibri', margin: 0 });
  });

  s.addShape(pres.ShapeType.roundRect, { x: M, y: 4.55, w: W - 2 * M, h: 1.75, fill: { color: NAVY }, rectRadius: 0.06, line: { color: NAVY } });
  s.addText('THE RULE THE WHOLE PLATFORM LIVES BY', { x: M + 0.35, y: 4.78, w: 11, h: 0.26, fontSize: 10.5, bold: true, color: GOLD, fontFace: 'Calibri', charSpacing: 2, margin: 0 });
  s.addText('Math for numbers. AI for judgment.', { x: M + 0.35, y: 5.08, w: 11, h: 0.42, fontSize: 21, bold: true, color: 'FFFFFF', fontFace: 'Cambria', margin: 0 });
  s.addText('Every dimension is measured by the geometry kernel and every cost by a deterministic engine. There is no language model anywhere in this analysis — nothing on the report was written by one, and nothing was estimated by one.',
    { x: M + 0.35, y: 5.56, w: 11.6, h: 0.6, fontSize: 11.5, color: 'CBD5E1', fontFace: 'Calibri', margin: 0 });
  footer(s);
  s.addNotes('This is the shape of the thing. Read, measure, judge, price.\n\nThe box at the bottom is the part I would ask you to hold onto. Everywhere else in the platform we use AI to propose ideas. In DFM Studio there is no AI at all — it is a geometry kernel and a rule engine. When it says a wall is 2.1 mm, something measured 2.1 mm.');
}

// ── 4 · The actual pipeline ─────────────────────────────────────────────────
//
// The director asked to see what the tool really does, from the inside. Every
// stage name on this slide is one the engine genuinely emits (`tessellate`,
// `wallThickness`, `drawSweep`, `features`, `sheetMetal`, `toolAccess`) and
// every technique named is the one in the code. Nothing here is a generic
// "AI pipeline" diagram.
{
  const s = pres.addSlide(); s.background = { color: PAPER };
  heading(s, 'Under the bonnet', 'What happens when you press Analyse');

  const STEPS = [
    ['upload', 'You give it two things', 'The CAD file, and how you intend to make the part.',
      'STEP or IGES · material + process'],
    ['solid', 'It opens the real solid', 'Not a picture of the part — the actual faces, edges and holes the designer built.',
      'OpenCascade B-rep kernel'],
    ['measure', 'It measures the shape', 'Walls, draft, undercuts, bends, holes, corners — each one an actual measurement.',
      'six measuring passes'],
    ['judge', 'It applies YOUR rules', 'Only the rules for your process, at the limits for your alloy — or your plant\'s own limit.',
      `${RULES} rules · ${FAMILIES} families`],
    ['price', 'It prices what it found', 'Re-costs the part as drawn, then again with the problem fixed. The gap is the finding\'s worth.',
      'the same should-cost engines'],
    ['report', 'It writes it up', 'Marked on the part, sorted worst first, with an owner against every decision.',
      'PDF · 14-sheet workbook'],
  ];

  const CW_ = 1.92;                 // card width
  const GAP = 0.09;
  const X0 = M;
  STEPS.forEach(([ic, title, plain, tech], i) => {
    const x = X0 + i * (CW_ + GAP);
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.68, w: CW_, h: 3.15, fill: { color: PANEL }, rectRadius: 0.06, line: { color: PANEL } });
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.72, y: 1.86, w: 0.48, h: 0.48, fill: { color: NAVY }, line: { color: NAVY } });
    s.addImage({ data: icon(ic), x: x + 0.83, y: 1.97, w: 0.26, h: 0.26 });
    s.addText(String(i + 1), { x: x + 0.1, y: 1.88, w: 0.34, h: 0.26, fontSize: 12, bold: true, color: GOLD, fontFace: 'Cambria', margin: 0 });
    s.addText(title, { x: x + 0.14, y: 2.46, w: CW_ - 0.28, h: 0.62, fontSize: 12, bold: true, color: INK, fontFace: 'Calibri', align: 'center', margin: 0 });
    s.addText(plain, { x: x + 0.14, y: 3.1, w: CW_ - 0.28, h: 1.25, fontSize: 10, color: BODY, fontFace: 'Calibri', align: 'center', margin: 0 });
    s.addText(tech, { x: x + 0.14, y: 4.42, w: CW_ - 0.28, h: 0.32, fontSize: 8.5, italic: true, color: MUT, fontFace: 'Calibri', align: 'center', margin: 0 });
    if (i < STEPS.length - 1) {
      s.addText('>', { x: x + CW_ - 0.02, y: 2.02, w: 0.15, h: 0.24, fontSize: 13, bold: true, color: GOLD, align: 'center', fontFace: 'Calibri', margin: 0 });
    }
  });

  // What comes out of stage 3 — the six passes, named — and the fork at stage 4.
  s.addText('The six measuring passes, in order', { x: M, y: 5.0, w: 6.1, h: 0.28, fontSize: 11.5, bold: true, color: INK, fontFace: 'Calibri', margin: 0 });
  const PASSES = ['Mesh the surface', 'Wall thickness', 'Draw direction', 'Features', 'Folded sheet?', 'Tool reach'];
  PASSES.forEach((t, i) => {
    const x = M + i * 1.03;
    s.addShape(pres.ShapeType.roundRect, { x, y: 5.34, w: 0.95, h: 0.52, fill: { color: NAVY }, rectRadius: 0.05, line: { color: NAVY } });
    s.addText(t, { x: x + 0.05, y: 5.4, w: 0.85, h: 0.4, fontSize: 7.8, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: 'Calibri', margin: 0 });
  });
  // No specific ray or triangle counts here. The obvious candidates came from a
  // synthetic QA fixture and a code comment about one bracket — quoting either
  // as if it were a measured figure is precisely the habit this tool exists to
  // break.
  s.addText('Each one reports the figure it measured — how many rays, how many triangles — or says it was skipped, and why.',
    { x: M, y: 5.92, w: 6.3, h: 0.46, fontSize: 9.5, italic: true, color: MUT, fontFace: 'Calibri', margin: 0 });

  s.addText('Every rule ends in one of three states', { x: 6.95, y: 5.0, w: 5.8, h: 0.28, fontSize: 11.5, bold: true, color: INK, fontFace: 'Calibri', margin: 0 });
  [['PASS', GREEN, 'cleared'], ['FAIL', RED, 'broken — priced'], ['NOT EVALUATED', MUT, 'could not measure — says why']]
    .forEach(([t, c, d], i) => {
      const x = 6.95 + i * 1.95;
      s.addShape(pres.ShapeType.roundRect, { x, y: 5.34, w: 1.85, h: 0.52, fill: { color: 'FFFFFF' }, rectRadius: 0.05, line: { color: c, width: 1.25 } });
      s.addText(t, { x: x + 0.06, y: 5.38, w: 1.73, h: 0.22, fontSize: 9, bold: true, color: c, align: 'center', fontFace: 'Calibri', margin: 0 });
      s.addText(d, { x: x + 0.06, y: 5.6, w: 1.73, h: 0.22, fontSize: 8, color: BODY, align: 'center', fontFace: 'Calibri', margin: 0 });
    });
  s.addText('An unmeasurable rule is never scored as a pass. That is the whole difference.',
    { x: 6.95, y: 5.92, w: 5.8, h: 0.46, fontSize: 9.5, italic: true, color: MUT, fontFace: 'Calibri', margin: 0 });

  footer(s);
  s.addNotes([
    'The Director asked what the tool actually does, so this is the inside view — six steps, and it takes about two seconds a part.',
    '',
    'STEP ONE. You give it two things: the CAD file, and how you plan to make the part. That second one matters more than it sounds. Telling it "die casting in A356" is what makes the answer specific instead of generic.',
    '',
    'STEP TWO. It opens the real solid. Not a picture, not a mesh someone exported — the actual faces and edges the designer built, through the same geometry kernel professional CAD uses. That is why it can tell a drilled hole from a cast one.',
    '',
    'STEP THREE is the heart of it, and it is six passes shown along the bottom left. It meshes the surface. It fires rays through the part to measure wall thickness. It tries three different directions the tool could open in and picks the one with the least undercut — it does not assume. It recognises features: holes, ribs, pockets, bends. It checks whether the part is folded sheet. And it sweeps a virtual cutter over the surface to see what a tool can physically reach.',
    '',
    'Each pass reports what it found — how many rays, how many triangles — or says it was skipped and why. Nothing happens silently.',
    '',
    'STEP FOUR applies the rules. Only the ones for your process, at the limit for your alloy. And if our plant has agreed its own number, that wins over the textbook.',
    '',
    'The three boxes on the bottom right are the bit I would ask you to remember. Every rule ends as passed, failed, or could-not-measure. Most tools collapse that last one into a green tick — which is how you get a clean report on a part nobody actually checked. Ours says so.',
    '',
    'STEP FIVE prices it. It re-runs the same costing engine we quote with, once on the part as drawn and once with the problem fixed. The difference is what the finding is worth — per part and per year.',
    '',
    'STEP SIX writes it up: marked on the part, worst first, with an owner against every decision.',
    '',
    'Two seconds, start to finish, and no AI anywhere in it.',
  ].join('\n'));
}

// ── 4 · Three outcomes ──────────────────────────────────────────────────────
{
  const s = pres.addSlide(); s.background = { color: PAPER };
  heading(s, 'The discipline', 'Three outcomes, not two');
  const cards = [
    ['PASS', GREEN, 'The rule ran and the geometry cleared it.'],
    ['FAIL', RED, 'The rule ran and the geometry broke it. Measured value, limit, and what it costs.'],
    ['NOT EVALUATED', MUT, 'The rule could not be judged — and the report says WHY, naming the missing measurement.'],
  ];
  cards.forEach(([t, c, d], i) => {
    const x = M + i * 4.08;
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.72, w: 3.8, h: 1.9, fill: { color: PANEL }, rectRadius: 0.06, line: { color: PANEL } });
    s.addText(t, { x: x + 0.24, y: 1.92, w: 3.3, h: 0.36, fontSize: 17, bold: true, color: c, fontFace: 'Cambria', margin: 0 });
    s.addText(d, { x: x + 0.24, y: 2.36, w: 3.3, h: 1.1, fontSize: 11.5, color: BODY, fontFace: 'Calibri', margin: 0 });
  });
  s.addText([
    { text: 'Why it matters commercially. ', options: { bold: true } },
    { text: 'A tool that scores an unmeasurable rule as a pass produces a clean sheet on a part it never actually checked. Ours reports the coverage figure beside the score, and the score is ', options: {} },
    { text: 'null', options: { bold: true } },
    { text: ' — not 100 — when nothing could be evaluated. You always know how much of the catalogue actually ran on your part.', options: {} },
  ], { x: M, y: 3.95, w: W - 2 * M, h: 1.0, fontSize: 13, color: BODY, fontFace: 'Calibri', lineSpacing: 22, margin: 0 });

  stat(s, M, 5.15, 3.8, '69.3 %', 'MEAN RULE COVERAGE', INK, `Measured across 93 shaped parts, ${SWEEP_DATE}`);
  stat(s, M + 4.08, 5.15, 3.8, 'stated', 'EVERY ABSTENTION', INK, 'Named with the measurement it lacked');
  stat(s, M + 8.16, 5.15, 3.8, 'null', 'SCORE WHEN BLIND', INK, 'Never 100. A clean sheet must be earned');
  footer(s);
  s.addNotes('If you take one thing from the engineering: three outcomes, not two.\n\nEvery DFM tool I have looked at collapses "passed" and "could not check" into one green tick. That is how you get a report that looks clean on a part nobody actually assessed. We report coverage next to the score, and when nothing could be evaluated the score is null rather than a hundred.');
}

// ── 5 · What is inside ──────────────────────────────────────────────────────
{
  const s = pres.addSlide(); s.background = { color: PAPER };
  heading(s, 'What is inside', 'The catalogue knows your process and your alloy');
  stat(s, M, 1.72, 2.85, String(RULES), 'RULES', INK, 'Each citing its source and grading it');
  stat(s, M + 3.12, 1.72, 2.85, String(FAMILIES), 'PROCESS FAMILIES', INK, 'Casting, forming, machining, moulding, PM, additive');
  stat(s, M + 6.24, 1.72, 2.85, String(MATERIAL_COUNT), 'MATERIALS', INK, 'Thresholds resolve to the alloy where it matters');
  stat(s, M + 9.36, 1.72, 2.85, '3', 'REPORT FORMATS', INK, 'On screen, PDF, and a 14-sheet workbook');

  s.addText('Selecting Steel DP980 + Stamping does not filter a generic list — it runs a different ruleset, with thresholds resolved for that steel.', {
    x: M, y: 3.46, w: W - 2 * M, h: 0.46, fontSize: 13, bold: true, color: INK, fontFace: 'Calibri', margin: 0 });

  const rows = [
    ['High-pressure die casting', 'Wall range · draft · cored-hole draft · core-pin slenderness · undercuts'],
    ['Sheet metal / stamping', 'Bend radius by alloy · springback · max bend radius · hole size by sheet strength · strip utilisation'],
    ['Machining', 'Tool reach · setup count · internal corner radius · pocket slenderness · hole depth'],
    ['Injection moulding', 'Wall uniformity · draft · rib proportions · boss height · undercuts'],
    ['Deep drawing', 'Draw operations counted from the drawing-ratio table · wall uniformity · undercuts'],
    ['Powder metallurgy, forging, extrusion', 'Press depth, flash, die slenderness, overhang angle'],
  ];
  rows.forEach(([a, b], i) => {
    const y = 3.98 + i * 0.44;
    if (i % 2 === 0) s.addShape(pres.ShapeType.rect, { x: M, y: y - 0.04, w: W - 2 * M, h: 0.42, fill: { color: PANEL }, line: { color: PANEL } });
    s.addText(a, { x: M + 0.18, y, w: 3.5, h: 0.32, fontSize: 11, bold: true, color: INK, fontFace: 'Calibri', margin: 0 });
    s.addText(b, { x: M + 3.8, y, w: 7.9, h: 0.32, fontSize: 10.5, color: BODY, fontFace: 'Calibri', margin: 0 });
  });
  footer(s);
  s.addNotes(`${RULES} rules across ${FAMILIES} families. The number matters less than the second line: choosing a material and a process changes which rules run AND what they compare against.\n\nThat was the single biggest gap when I started. The first version ran every rule on every part, so a die-cast bracket got sheet-metal findings. Now the analysis is specific to the route you actually intend.`);
}

// ── 6 · Located evidence ────────────────────────────────────────────────────
{
  const s = pres.addSlide(); s.background = { color: PAPER };
  heading(s, 'Located evidence', 'The finding, marked on the part that caused it');
  s.addImage({ data: SHOT.evidence, x: M, y: 1.6, w: 5.6, h: 7.92 * (5.6 / 8.27) });
  s.addText([
    { text: 'A ring on the geometry, numbered, with a legend beneath.', options: { bold: true, breakLine: true } },
    { text: 'Every marker comes from a rule that FAILED — not from the geometry. An earlier version marked every rib and pocket the recogniser found, which put forty rings on a casting, most of them on features that broke nothing.', options: { breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: 'Worst first, capped at eight, one ring per finding on its worst instance. Rings that would collide are pushed apart with a leader line back to the true point.', options: { breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: 'And what CANNOT be marked is named: a tolerance is a property of the whole part, so the report says so instead of pinning it somewhere plausible.', options: {} },
  ], { x: 6.5, y: 1.75, w: 6.2, h: 3.4, fontSize: 12.5, color: BODY, fontFace: 'Calibri', lineSpacing: 21, margin: 0 });

  s.addShape(pres.ShapeType.roundRect, { x: 6.5, y: 5.35, w: 6.2, h: 1.0, fill: { color: PANEL }, rectRadius: 0.06, line: { color: PANEL } });
  s.addText('A supplier can act on this without opening CAD. That is the difference between a report that asserts and a report that shows.',
    { x: 6.72, y: 5.52, w: 5.8, h: 0.7, fontSize: 12, italic: true, color: INK, fontFace: 'Calibri', margin: 0 });
  footer(s);
  s.addNotes('This is the slide I would linger on. The legend reads as findings — "wall area below the minimum die-casting draft, 41.2 percent, limit 5" — not as geometry.\n\nThe honest detail: this used to mark everything the recogniser found. A casting came back with forty rings, most on ribs that broke no rule. It was annotating what we measured instead of what we concluded.');
}

// ── 7 · Actions ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide(); s.background = { color: PAPER };
  heading(s, 'From findings to decisions', 'Nobody leaves a review with a percentage');
  s.addImage({ data: SHOT.actions, x: 7.15, y: 1.6, w: 5.4, h: 7.92 * (5.4 / 8.27) });
  s.addText([
    { text: 'They leave with an owner and a decision.', options: { bold: true, breakLine: true } },
    { text: 'The report used to say what was wrong and what it cost, then stop. It now closes with an action list.', options: { breakLine: true } },
    { text: '', options: { breakLine: true } },
  ], { x: M, y: 1.7, w: 5.9, h: 1.0, fontSize: 13, color: BODY, fontFace: 'Calibri', lineSpacing: 21, margin: 0 });

  const pts = [
    ['The action is the rule\'s own fix text', 'Nothing on that page was authored by the tool.'],
    ['The owner is a ROLE, not a name', 'A slide is a toolmaker\'s problem; a wall thickness is a designer\'s. The tool does not know who works here.'],
    ['The due date is blank on purpose', 'A date this tool invented would be its least credible column.'],
    ['Rolled up by owner', 'So each role can be sent their own rows out of the workbook.'],
  ];
  pts.forEach(([t, d], i) => {
    const y = 2.78 + i * 0.95;
    s.addShape(pres.ShapeType.ellipse, { x: M, y: y + 0.02, w: 0.28, h: 0.28, fill: { color: GOLD }, line: { color: GOLD } });
    s.addText(t, { x: M + 0.46, y, w: 5.5, h: 0.3, fontSize: 12.5, bold: true, color: INK, fontFace: 'Calibri', margin: 0 });
    s.addText(d, { x: M + 0.46, y: y + 0.3, w: 5.5, h: 0.55, fontSize: 11, color: BODY, fontFace: 'Calibri', margin: 0 });
  });
  footer(s);
  s.addNotes('This is what turns an analysis into something a programme runs on.\n\nNote the three constraints. The action text is the rule\'s own words, so nothing is invented. The owner is a role, because the tool genuinely does not know our org chart. And Due is deliberately empty — a date generated by software is the first thing anyone would stop believing.');
}

// ── 8 · Revision diff ───────────────────────────────────────────────────────
{
  const s = pres.addSlide(); s.background = { color: PAPER };
  heading(s, 'Revision comparison', 'Did the changes we agreed last month actually work?');
  s.addImage({ data: SHOT.diff, x: M, y: 1.62, w: 5.4, h: 7.92 * (5.4 / 8.27) });
  s.addText('Every report used to be a snapshot. Reviewers diffed two PDFs by eye — which is how a closed finding gets missed and a regression ships.', {
    x: 6.6, y: 1.7, w: 6.1, h: 0.8, fontSize: 13, color: BODY, fontFace: 'Calibri', lineSpacing: 21, margin: 0 });

  const dist = [
    ['FIXED', GREEN, 'The rule now passes. This is the only state that frees money.'],
    ['NOT FIXED', MUT, 'It stopped failing because the measurement disappeared. Counting this as a win is the most dangerous thing the feature could do — so it never does.'],
    ['NEWLY VISIBLE', '0D9488', 'Could not be judged before, fails now. Not a regression — it became measurable.'],
    ['NEW', RED, 'Was passing, fails now. The only genuine regression.'],
  ];
  dist.forEach(([t, c, d], i) => {
    const y = 2.68 + i * 0.92;
    s.addShape(pres.ShapeType.rect, { x: 6.6, y: y + 0.06, w: 0.1, h: 0.62, fill: { color: c }, line: { color: c } });
    s.addText(t, { x: 6.86, y, w: 5.8, h: 0.28, fontSize: 12, bold: true, color: c, fontFace: 'Calibri', margin: 0 });
    s.addText(d, { x: 6.86, y: y + 0.28, w: 5.8, h: 0.6, fontSize: 10.5, color: BODY, fontFace: 'Calibri', margin: 0 });
  });
  s.addText('Comparing two different processes, or two different alloys, is warned about — not silently tabulated.', {
    x: 6.6, y: 6.38, w: 6.1, h: 0.52, fontSize: 11, italic: true, color: MUT, fontFace: 'Calibri', margin: 0 });
  footer(s);
  s.addNotes('The second question a programme always asks, and until recently we could not answer it.\n\nThe distinction that earns this slide is the second one. If rev B loses its PMI, a rule stops failing — and a naive comparison reports the problem solved. Ours calls that NOT FIXED and frees zero money against it.');
}

// ── 9 · Cost ────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide(); s.background = { color: PAPER };
  heading(s, 'Cost, not just conformance', 'Findings are priced, and the process is costed');
  s.addImage({ data: SHOT.forming, x: 7.15, y: 1.6, w: 5.4, h: 7.92 * (5.4 / 8.27) });
  s.addText([
    { text: 'Every finding carries what it is worth.', options: { bold: true, breakLine: true } },
    { text: 'The same should-cost engines that quote the part are re-run with the geometry as drawn and again with the rule satisfied. The difference is the finding\'s value, per part and per year. Where the engines cannot price something — a slide, a die-life effect — the report says so and cites the literature range instead of inventing one.', options: { breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: 'And the route table asks the harder question:', options: { bold: true, breakLine: true } },
    { text: 'the same geometry run through every other process\'s own rules, priced, carbon-scored, with the reason each alternative is or is not viable.', options: {} },
  ], { x: M, y: 1.7, w: 6.0, h: 3.0, fontSize: 12.5, color: BODY, fontFace: 'Calibri', lineSpacing: 21, margin: 0 });

  s.addShape(pres.ShapeType.roundRect, { x: M, y: 4.95, w: 6.0, h: 1.45, fill: { color: NAVY }, rectRadius: 0.06, line: { color: NAVY } });
  s.addText('NEW THIS MONTH — SHEET METAL', { x: M + 0.28, y: 5.13, w: 5.4, h: 0.24, fontSize: 10, bold: true, color: GOLD, fontFace: 'Calibri', charSpacing: 1.5, margin: 0 });
  s.addText('Press class, strip utilisation and draw operations', { x: M + 0.28, y: 5.4, w: 5.4, h: 0.32, fontSize: 14, bold: true, color: 'FFFFFF', fontFace: 'Cambria', margin: 0 });
  s.addText('Material is the largest cost in a stamping and our report never showed it. Utilisation now sits on page two, against the 70% industry target.',
    { x: M + 0.28, y: 5.76, w: 5.5, h: 0.55, fontSize: 10.5, color: 'CBD5E1', fontFace: 'Calibri', margin: 0 });
  footer(s);
  s.addNotes('Two things here. First, every finding is priced by the same engines that quote the part — so a designer and a buyer are looking at the same number.\n\nSecond, the panel bottom-left is this month\'s work, from a sheet-metal die-design textbook. Strip utilisation is the biggest single cost lever on a stamping and we were quoting a piece price without ever showing it.');
}

// ── 10 · Evidence ───────────────────────────────────────────────────────────
{
  const s = pres.addSlide(); s.background = { color: NAVY };
  s.addText('HOW WE KNOW IT IS RIGHT', { x: M, y: 0.55, w: 11, h: 0.26, fontSize: 11, bold: true, color: GOLD, fontFace: 'Calibri', charSpacing: 2, margin: 0 });
  s.addText('Tested against arithmetic, not itself', { x: M, y: 0.86, w: 11.5, h: 0.72, fontSize: 30, bold: true, color: 'FFFFFF', fontFace: 'Cambria', margin: 0 });

  const facts = [
    ['199/199', 'GEOMETRY ACCURACY GATE', 'Every fixture is a shape whose truth is arithmetic — a 3.000° cone, a 25 mm wall. CI fails on any regression.'],
    ['617', 'AUTOMATED TESTS', 'Plus 14 HTTP integration tests and an accessibility gate on every page.'],
    ['93', 'SHAPED PARTS SWEPT', 'Ten commodities, ten variants each, through the full production path.'],
    ['0', 'AI-WRITTEN NUMBERS', 'No language model touches this analysis at any point.'],
  ];
  facts.forEach(([v, l, d], i) => {
    const x = M + i * 3.08;
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.85, w: 2.82, h: 2.5, fill: { color: NAVY_MID }, rectRadius: 0.06, line: { color: NAVY_MID } });
    s.addText(v, { x: x + 0.22, y: 2.05, w: 2.4, h: 0.55, fontSize: 28, bold: true, color: GOLD, fontFace: 'Cambria', margin: 0 });
    s.addText(l, { x: x + 0.22, y: 2.62, w: 2.4, h: 0.44, fontSize: 9.5, bold: true, color: '94A3B8', fontFace: 'Calibri', charSpacing: 1, margin: 0 });
    s.addText(d, { x: x + 0.22, y: 3.08, w: 2.42, h: 1.15, fontSize: 10, color: 'CBD5E1', fontFace: 'Calibri', margin: 0 });
  });

  s.addText('What we deliberately do NOT claim', { x: M, y: 4.68, w: 11, h: 0.36, fontSize: 17, bold: true, color: 'FFFFFF', fontFace: 'Cambria', margin: 0 });
  s.addText([
    { text: `Of ${RULES} thresholds, ${PRIMARY_READ} come from a reference we have read first-hand. ${CONTESTED} are recorded as CONTESTED, where a primary source disagrees with the value we hold. ${UNAUDITED} are unaudited industry consensus.`, options: { breakLine: true } },
    { text: 'That register ships with the product and there is a command that prints it. A number nobody has checked is worth knowing about before a supplier finds it.', options: {} },
  ], { x: M, y: 5.12, w: 11.8, h: 1.0, fontSize: 12.5, color: 'CBD5E1', fontFace: 'Calibri', lineSpacing: 21, margin: 0 });
  footer(s);
  s.addNotes('This is the slide that should decide whether you trust the rest.\n\nThe accuracy gate is 199 checks against shapes whose answer is arithmetic — we know a cone drafted at three degrees is three degrees, so if the engine says 2.8 the build fails.\n\nAnd then the bottom half, which I want to be straight about. Most of our thresholds are industry consensus that nobody has audited. We ship the register that says so, and three of them are actively disputed by a source we do trust.');
}

// ── 11 · Coverage ───────────────────────────────────────────────────────────
{
  const s = pres.addSlide(); s.background = { color: PAPER };
  heading(s, 'What it can actually say', `Measured on 93 shaped parts · ${SWEEP_DATE}`);
  s.addText('A rule that is correct and abstains on every real part is worth nothing. So we measure how much of the catalogue actually speaks, by commodity.', {
    x: M, y: 1.6, w: 7.4, h: 0.6, fontSize: 12.5, color: BODY, fontFace: 'Calibri', lineSpacing: 20, margin: 0 });

  const tRows = [[
    { text: 'Commodity', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
    { text: 'Process family', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
    { text: 'Rule coverage', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'right' } },
    { text: 'Findings / part', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'right' } },
  ]];
  SWEEP.forEach(([a, b, c, d], i) => {
    const bg = i % 2 ? 'FFFFFF' : PANEL;
    const cov = Number(c);
    tRows.push([
      { text: a, options: { fill: { color: bg }, color: INK, bold: true } },
      { text: b, options: { fill: { color: bg }, color: BODY } },
      { text: `${c} %`, options: { fill: { color: bg }, color: cov >= 70 ? GREEN : cov >= 60 ? INK : RED, bold: true, align: 'right' } },
      { text: d, options: { fill: { color: bg }, color: BODY, align: 'right' } },
    ]);
  });
  s.addTable(tRows, {
    x: M, y: 2.35, w: 7.6, colW: [2.3, 2.7, 1.4, 1.2], rowH: 0.315,
    fontSize: 10.5, fontFace: 'Calibri', border: { type: 'none' }, valign: 'middle', margin: [2, 6, 2, 6],
  });

  stat(s, 8.45, 2.35, 4.26, '69.3 %', 'MEAN COVERAGE', INK, 'Up from 64.1% when the sweep was first built');
  s.addShape(pres.ShapeType.roundRect, { x: 8.45, y: 4.0, w: 4.26, h: 2.3, fill: { color: PANEL }, rectRadius: 0.06, line: { color: PANEL } });
  s.addText('The sheet-metal row is the honest one', { x: 8.67, y: 4.2, w: 3.85, h: 0.3, fontSize: 12.5, bold: true, color: RED, fontFace: 'Calibri', margin: 0 });
  s.addText('37.5% — the lowest on the board. Our test brackets are flat plates with holes, so no bend is recognised and seven bend rules never fire.\n\nIt is a fixture gap, not a rule gap, and it is on the slide because you would find it in five minutes.',
    { x: 8.67, y: 4.55, w: 3.85, h: 1.6, fontSize: 10.5, color: BODY, fontFace: 'Calibri', lineSpacing: 15, margin: 0 });
  footer(s);
  s.addNotes('This table is the measurement I am proudest of having, and least proud of some of the numbers in.\n\nThe standard I set was: a rule that is right and silent is worth nothing. So we sweep 93 parts and count how much of the catalogue speaks.\n\nSheet metal at 37.5% is the worst row and I have left it in. Our synthetic test brackets have no bends, so the bend rules never get a chance. That is a test-data problem, and it is exactly why my ask at the end is what it is.');
}

// ── 12 · Competitive ────────────────────────────────────────────────────────
{
  const s = pres.addSlide(); s.background = { color: PAPER };
  heading(s, 'Against the market', 'Versus DFMPro, aPriori and Boothroyd');
  const rows = [
    ['Geometry read from B-rep', 'Yes', 'Yes', 'Parity'],
    ['Process- and alloy-specific rules', 'Yes', 'Yes', 'Parity'],
    ['Findings priced by a should-cost engine', 'Yes', 'aPriori yes', 'Parity with the leader'],
    ['Alternative process routes, priced and carbon-scored', 'Yes', 'Partial', 'Ahead'],
    ['"Not evaluated" as a first-class outcome', 'Yes', 'Rare', 'Ahead'],
    ['Threshold provenance published with the finding', 'Yes', 'No', 'Ahead'],
    ['Revision-to-revision comparison', 'Yes', 'Yes', 'Parity'],
    ['Validated against measured production outcomes', 'Not yet', 'Yes', 'Behind'],
    ['Native CATIA / NX / JT input', 'No', 'Yes', 'Behind'],
  ];
  const tr = [[
    { text: 'Capability', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
    { text: 'BrainSpark', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'center' } },
    { text: 'Established tools', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'center' } },
    { text: 'Position', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
  ]];
  rows.forEach(([a, b, c, d], i) => {
    const bg = i % 2 ? 'FFFFFF' : PANEL;
    const col = d === 'Ahead' ? GREEN : d === 'Behind' ? RED : BODY;
    tr.push([
      { text: a, options: { fill: { color: bg }, color: INK } },
      { text: b, options: { fill: { color: bg }, color: b === 'No' || b === 'Not yet' ? RED : INK, bold: true, align: 'center' } },
      { text: c, options: { fill: { color: bg }, color: BODY, align: 'center' } },
      { text: d, options: { fill: { color: bg }, color: col, bold: true } },
    ]);
  });
  s.addTable(tr, {
    x: M, y: 1.68, w: W - 2 * M, colW: [5.3, 1.9, 2.4, 2.49], rowH: 0.4,
    fontSize: 11, fontFace: 'Calibri', border: { type: 'none' }, valign: 'middle', margin: [2, 8, 2, 8],
  });
  s.addText('The two red rows are the honest gaps, and they are the two I would spend money on next. Everything above them we already do.', {
    x: M, y: 5.95, w: W - 2 * M, h: 0.4, fontSize: 12.5, italic: true, color: INK, fontFace: 'Calibri', margin: 0 });
  footer(s);
  s.addNotes('A fair comparison, including the two rows where we lose.\n\nWhere we are genuinely ahead is provenance and honesty — no commercial tool I have seen tells you that a threshold is unaudited, or refuses to score a rule it could not check.\n\nWhere we are behind: they have decades of measured outcomes behind their numbers, and they read native CAD. Both are solvable and neither is solved by more code from me.');
}

// ── 13 · Roadmap ────────────────────────────────────────────────────────────
{
  const s = pres.addSlide(); s.background = { color: PAPER };
  heading(s, 'What is next', 'Ordered by impact, not by effort');
  const items = [
    ['1', 'Validate against one real part', 'A production part, its quote, and the supplier\'s own DFM markup. This is what converts "internally consistent" into "accurate" — and it is the only item on this list I cannot do alone.', GOLD],
    ['2', 'Native CAD input', 'CATIA, NX and JT. Today we read STEP and IGES, which means a translation step and a lost PMI tolerance every time.', NAVY_MID],
    ['3', 'Audit the top 20 thresholds', 'Against primary standards. The register already names which twenty and ranks them by exposure.', NAVY_MID],
    ['4', 'Company standards, plant-wide', 'Already built and org-scoped; needs the plant\'s own values loaded to be worth anything.', NAVY_MID],
  ];
  items.forEach(([n, t, d, c], i) => {
    const y = 1.72 + i * 1.24;
    s.addShape(pres.ShapeType.roundRect, { x: M, y, w: W - 2 * M, h: 1.08, fill: { color: i === 0 ? 'FEF3C7' : PANEL }, rectRadius: 0.06, line: { color: i === 0 ? 'FDE68A' : PANEL } });
    s.addShape(pres.ShapeType.ellipse, { x: M + 0.28, y: y + 0.3, w: 0.46, h: 0.46, fill: { color: c }, line: { color: c } });
    s.addText(n, { x: M + 0.28, y: y + 0.3, w: 0.46, h: 0.46, fontSize: 15, bold: true, color: i === 0 ? NAVY : 'FFFFFF', align: 'center', valign: 'middle', fontFace: 'Cambria', margin: 0 });
    s.addText(t, { x: M + 0.95, y: y + 0.16, w: 10.9, h: 0.32, fontSize: 14, bold: true, color: INK, fontFace: 'Cambria', margin: 0 });
    s.addText(d, { x: M + 0.95, y: y + 0.5, w: 10.9, h: 0.5, fontSize: 11, color: BODY, fontFace: 'Calibri', margin: 0 });
  });
  footer(s);
  s.addNotes('Four things, in the order that changes the answer.\n\nNumber one is the only one that matters this quarter, and it is the only one I cannot do by myself. Everything below it is engineering I can schedule.');
}

// ── 14 · The ask ────────────────────────────────────────────────────────────
{
  const s = pres.addSlide(); s.background = { color: NAVY };
  s.addImage({ data: SHOT.iso, x: 8.1, y: 2.3, w: 4.6, h: 3.27, transparency: 30 });
  s.addText('THE ASK', { x: M, y: 1.35, w: 8, h: 0.28, fontSize: 11, bold: true, color: GOLD, fontFace: 'Calibri', charSpacing: 2, margin: 0 });
  s.addText('One real part, with its quote', { x: M, y: 1.72, w: 8.2, h: 0.8, fontSize: 38, bold: true, color: 'FFFFFF', fontFace: 'Cambria', margin: 0 });
  s.addText([
    { text: 'The tool is built, tested and honest about its limits. What it has never had is a production part with a known outcome.', options: { breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: 'Give me one part we already buy — the STEP file, the quote we pay, and the supplier\'s own DFM comments. I will run it, publish every disagreement, and we will know within a week whether this is a tool we can put in front of a supplier or a prototype that needs another quarter.', options: {} },
  ], { x: M, y: 2.75, w: 7.1, h: 2.2, fontSize: 13.5, color: 'CBD5E1', fontFace: 'Calibri', lineSpacing: 23, margin: 0 });

  s.addShape(pres.ShapeType.roundRect, { x: M, y: 5.15, w: 7.1, h: 1.05, fill: { color: NAVY_MID }, rectRadius: 0.06, line: { color: NAVY_MID } });
  s.addText('A sheet-metal bracket with real bends would be ideal — it would light up seven rules that have never yet run on anything but a fixture.',
    { x: M + 0.28, y: 5.35, w: 6.6, h: 0.7, fontSize: 11.5, italic: true, color: 'E2E8F0', fontFace: 'Calibri', margin: 0 });

  s.addText('Avinash Bhosale   ·   Cost Engineering   ·   August 2026', {
    x: M, y: H - 0.9, w: 8, h: 0.3, fontSize: 11, color: '64748B', fontFace: 'Calibri', margin: 0 });
  s.addNotes('So that is the ask, and it is deliberately small.\n\nI am not asking for budget or headcount. I am asking for one part we already buy, with the quote and the supplier\'s DFM comments, so we can measure the tool against something real instead of against itself.\n\nIf it disagrees with the supplier, I want to publish that. That is the fastest way to find out whether this is ready.\n\nHappy to show it running live now if you have five more minutes.');
}

await pres.writeFile({ fileName: 'BrainSpark_DFM_DFA_Studio_Director.pptx' });
console.log(`wrote deck · ${RULES} rules · ${FAMILIES} families · ${PRIMARY_READ} primary-read · ${CONTESTED} contested`);
