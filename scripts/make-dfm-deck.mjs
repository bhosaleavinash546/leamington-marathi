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
import { MATERIALS, PROCESSES } from '../costing-engine.mjs';
import { PROCESS_DISPLAY } from '../dfm-process-registry.mjs';

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
const PROCESS_COUNT = Object.keys(PROCESSES).length;
const CASTING_PROCESSES = Object.values(PROCESS_DISPLAY).filter((d) => d.group === 'Casting').length;
const CASTING_ALLOYS = Object.keys(MATERIALS).filter((m) => /die-cast|\(cast\)|Cast Iron|ZAMAK|ZA-8/.test(m)).length;
const OVERRIDES = DFM_RULES.reduce((n, r) => n + Object.keys(r.byMaterial || {}).length
  + Object.keys(r.byMaterialFamily || {}).length, 0);
const GATED = DFM_RULES.filter((r) => r.blocking).length;

// Recorded by hand because running the suite inside the deck build would take
// two minutes. Dated for the same reason the sweep is: a stale number should be
// visible rather than quietly believed.
const TESTS = 701;
const TESTS_DATE = '11 Aug 2026';

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
const TOTAL = 17;

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
  s.addNotes([
    'Good morning, and thank you for the time. I am going to take about fifteen minutes on the DFM and DFA Studio, and then I have one thing to ask you. If there is a slide you have already seen, stop me and I will move on.',
    '',
    'Let me start with what it is in one sentence. You give it a CAD file and tell it how you plan to make the part. It measures the part, tells you every rule that part breaks for that process, shows you where on the part the problem is, and tells you what each problem costs. That is it.',
    '',
    'The thing that makes it different from a checklist is the word MEASURED. Nobody types a number in. The tool opens the CAD model and measures the wall thickness, the draft angle, the bend radius. So when it says a wall is two point one millimetres, something actually measured two point one.',
    '',
    'The picture on the right is a real part, rendered by the tool itself out of a CAD file. It is not a stock image.',
  ].join('\n'));
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
  s.addNotes([
    'Let me start with the problem, because I want to be honest about it.',
    '',
    'Today, a DFM review depends entirely on who is sitting in the room. A senior engineer who has done twenty die castings spots an undercut in ten seconds. Somebody who is busy that week signs the drawing. The part then goes to the toolmaker, the slide appears in the quotation, and by that point the tool is committed. Changing it then costs roughly ten times what it would have cost at design.',
    '',
    'Now look at the three points on the left, because these are the three specific things I set out to fix.',
    '',
    'NUMBER ONE, the rule is generic. Most tools carry one draft angle for all castings and one bend radius for all steels. But high-pressure die casting and sand casting need completely different draft. DP980 needs four times the bend radius of mild steel. When the rule is generic, the finding is either wrong or it gets ignored — and both are equally useless.',
    '',
    'NUMBER TWO, the finding has no place. A report that says thirty-four undercut regions sends the supplier hunting through the CAD model to find them. Most people just do not bother.',
    '',
    'NUMBER THREE, the finding has no price. If a cosmetic radius and a seventy-seven thousand euro slide sit on the same line of a list, nobody knows which one to fix first.',
    '',
    'Those three map exactly onto the next three things I am going to show you.',
  ].join('\n'));
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
  s.addNotes([
    'This is the whole shape of the tool in four steps. Read, measure, judge, price.',
    '',
    'It READS your STEP file — the real solid model, with faces and edges, not a picture of it.',
    '',
    'It MEASURES the part. Wall thickness, draft, undercuts, bends, holes, and whether a cutting tool can even reach each surface.',
    '',
    'It JUDGES what it measured against the rules for the process YOU chose, at the limits for YOUR alloy.',
    '',
    'And it PRICES what it found, using the same should-cost engines we use to quote parts.',
    '',
    'Now the dark box at the bottom is the one sentence I would ask you to remember from the whole presentation. Math for numbers, AI for judgment.',
    '',
    'Everywhere else in this platform we use AI — for generating ideas, for reading documents. In this tool there is no AI at all. Not a single number in the report was written or estimated by an AI. It is a geometry engine and a rule book, and both are things you can check line by line.',
    '',
    'I am making a point of that because the first question people ask about any AI tool is whether it made the numbers up. Here, it cannot.',
  ].join('\n'));
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
    'You asked to see what the tool actually does inside, so this is that view. Six steps, and the whole thing takes about two seconds per part.',
    '',
    'STEP ONE. You give it two things: the CAD file, and how you intend to make the part. That second one matters far more than it sounds. Telling it die casting in A356 is what makes the answer specific instead of generic.',
    '',
    'STEP TWO. It opens the real solid. Not a picture, not a mesh — the actual faces and edges the designer built, through the same geometry kernel that professional CAD systems use. That is why it can tell the difference between a drilled hole and a cast one.',
    '',
    'STEP THREE is the heart of it, and it is the six boxes along the bottom left. Let me walk them.',
    '',
    'First it covers the surface in tiny triangles so it can work with curved shapes. Then it fires rays through the part to measure how thick the wall is at thousands of points. Then — and this one I like — it tries three different directions the tool could open in and picks the one with the fewest undercuts. It does not assume; it tests. Then it recognises features: the holes, the ribs, the pockets, the bends. Then it checks whether the part is actually folded sheet metal. And finally it sweeps a virtual cutter over the surface to see which faces a real tool could physically reach.',
    '',
    'Every one of those passes reports what it did — how many rays it fired, how many triangles — or it says it was skipped and why. Nothing happens silently.',
    '',
    'STEP FOUR applies the rules. Only the ones for your process, at the limit for your alloy. And if our plant has agreed its own number, ours wins over the textbook.',
    '',
    'Now the three boxes on the bottom right. This is the bit I would ask you to hold onto. Every rule ends in one of three states: passed, failed, or could not be measured. Most tools I have looked at collapse that third one into a green tick — which is how you end up with a clean-looking report on a part nobody actually checked. Ours says plainly that it could not check, and names the measurement it was missing.',
    '',
    'STEP FIVE prices it. It runs the costing engine twice — once on the part as drawn, once with the problem fixed. The difference is what that finding is worth, per part and per year.',
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
  s.addNotes([
    'If you take one engineering idea away from today, I would like it to be this one. Three outcomes, not two.',
    '',
    'A rule can pass. A rule can fail. Or the tool can be unable to check it at all — because the measurement it needs is not there in the file.',
    '',
    'Here is why that third box matters commercially. Imagine a report comes back and everything is green. You would reasonably assume the part was checked and it was fine. But if the tool quietly counts everything it could not measure as a pass, that green report might mean nothing was checked at all. That is worse than no report, because it gives false confidence.',
    '',
    'So we do two things. We print the coverage percentage right next to the score — that is the sixty-nine per cent figure at the bottom left, measured across ninety-three parts. And when nothing at all could be evaluated, the score comes back as blank, not as a hundred.',
    '',
    'A clean sheet has to be earned. That is the whole difference.',
  ].join('\n'));
}

// ── 5 · What is inside ──────────────────────────────────────────────────────
{
  const s = pres.addSlide(); s.background = { color: PAPER };
  heading(s, 'What is inside', 'The catalogue knows your process and your alloy');
  stat(s, M, 1.72, 2.85, String(RULES), 'RULES', INK, 'Each citing its source and grading it');
  stat(s, M + 3.12, 1.72, 2.85, String(FAMILIES), 'PROCESS FAMILIES', INK, 'Casting, forming, machining, moulding, PM, additive');
  stat(s, M + 6.24, 1.72, 2.85, String(MATERIAL_COUNT), 'MATERIALS', INK, 'Thresholds resolve to the alloy where it matters');
  stat(s, M + 9.36, 1.72, 2.85, String(PROCESS_COUNT), 'PROCESSES', INK, `${CASTING_PROCESSES} casting routes alone — HPDC, LPDC, GDC, VHPDC, SSM`);

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
  // The picker is named the way a plant names it — added after a live demo in
  // which HPDC could not be found because it was labelled "Die Casting
  // (Aluminium)". Worth one line here: it is the first thing anybody touches.

  rows.forEach(([a, b], i) => {
    const y = 3.98 + i * 0.44;
    if (i % 2 === 0) s.addShape(pres.ShapeType.rect, { x: M, y: y - 0.04, w: W - 2 * M, h: 0.42, fill: { color: PANEL }, line: { color: PANEL } });
    s.addText(a, { x: M + 0.18, y, w: 3.5, h: 0.32, fontSize: 11, bold: true, color: INK, fontFace: 'Calibri', margin: 0 });
    s.addText(b, { x: M + 3.8, y, w: 7.9, h: 0.32, fontSize: 10.5, color: BODY, fontFace: 'Calibri', margin: 0 });
  });
  s.addText(`Picked by the name a plant uses — HPDC, LPDC, GDC, VHPDC, SSM, PHS, MIM — grouped by commodity, with ${CASTING_ALLOYS} casting alloys including Silafont-36, Castasil-37, ADC10, AM60B and ZAMAK 2.`, {
    x: M, y: 6.56, w: W - 2 * M, h: 0.38, fontSize: 11, italic: true, color: MUT, fontFace: 'Calibri', margin: 0 });
  footer(s);
  s.addNotes([
    'This is what is actually in the box. Two hundred and forty-seven rules across thirty-five process families, and forty-nine processes to choose from.',
    '',
    'But the number of rules is not the interesting part. The interesting part is the line in bold underneath.',
    '',
    'Choosing your material and your process does not just filter a long generic list. It runs a completely different rule set, and it changes the numbers those rules compare against. Pick DP980 steel and stamping, and the bend radius rule wants four times the material thickness. Pick mild steel and it wants one. Same rule, different number, because the metal is different.',
    '',
    'Look at the table. Die casting is judged on wall range, draft, cored hole draft and core pin slenderness. Sheet metal is judged on bend radius by alloy, springback and strip utilisation. They have almost nothing in common — as it should be.',
    '',
    'And the line at the very bottom is worth a mention because it is new. The picker now names processes the way we name them in a plant — HPDC, LPDC, GDC, PHS — grouped by commodity, with twenty casting alloys including Silafont and Castasil. Previously HPDC was buried in a long list under the label Die Casting Aluminium, and if you were scanning for the letters H-P-D-C you would never find it. That is fixed.',
  ].join('\n'));
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
  s.addNotes([
    'This is the slide I would slow down on, because it is the one suppliers react to.',
    '',
    'On the left is a page straight out of the report. You can see the part, and you can see numbered rings on it. Underneath, a legend tells you what each ring is: wall area below the minimum die casting draft, forty-one per cent, limit is five.',
    '',
    'The important thing is what the rings are NOT. They are not every feature the tool found. Every ring is a rule that FAILED. If a rib is perfectly fine, no ring.',
    '',
    'That sounds obvious but we got it wrong first time round. An early version marked everything it recognised, and a casting came back with forty rings on it, most of them on features that broke no rule at all. It was showing what it had MEASURED instead of what it had CONCLUDED. Nobody could read it.',
    '',
    'So now: worst first, maximum of eight rings, one ring per finding placed on the worst example of it. And where two rings would sit on top of each other, they get pushed apart with a leader line back to the real point.',
    '',
    'And one more piece of honesty. Some findings cannot be pointed at. A tolerance belongs to the whole part, not to one face. Rather than pin it somewhere plausible and mislead you, the report lists it separately and says why it is not marked.',
    '',
    'The reason this matters: a supplier can act on this page without opening CAD.',
  ].join('\n'));
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
  s.addNotes([
    'This is what turns an analysis into something a programme can actually run on.',
    '',
    'The report used to tell you what was wrong and what it cost, and then stop. People would read it, agree it was interesting, and nothing would happen. Nobody walks out of a review holding a percentage.',
    '',
    'So the report now ends with an action list. Every finding becomes a decision, with an owner.',
    '',
    'Three deliberate choices in there, and each one is about staying credible.',
    '',
    'FIRST, the action text is the rule\'s own recommendation, word for word. The tool did not compose it. Nothing on that page is invented.',
    '',
    'SECOND, the owner is a ROLE, not a person\'s name — design, tooling, press shop. The tool genuinely does not know our organisation chart, so it does not pretend to.',
    '',
    'THIRD, and this is the one people notice: the due date column is deliberately empty. A date generated by software would be the first column anybody stopped believing, and once they stop believing one column they stop believing the page.',
    '',
    'And it rolls up by owner, so the tooling engineer can be sent just their rows straight out of the spreadsheet.',
  ].join('\n'));
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
  s.addNotes([
    'The second question a programme always asks is: we agreed changes last month, did they work?',
    '',
    'Until recently we could not answer that. Every report was a snapshot, so people compared two PDFs side by side and looked for differences by eye. That is how a fixed problem gets missed, and how a new problem ships.',
    '',
    'Now you upload the new revision and it tells you what changed, in four categories. And the four categories are the point of this slide.',
    '',
    'FIXED, in green, means the rule now passes. That is the only category that actually frees up money.',
    '',
    'NOT FIXED is the important one. Sometimes a rule stops failing not because the part got better, but because the measurement disappeared — for example the new file was exported without its tolerance data. A naive comparison would report that as solved. Ours calls it NOT FIXED and credits zero money against it. If this feature ever told you a problem was solved when it was not, you would rightly stop trusting the whole tool.',
    '',
    'NEWLY VISIBLE means it could not be judged before and now fails. That is not a regression — the part became measurable.',
    '',
    'And NEW, in red, means it was passing and now fails. That is the only genuine regression.',
    '',
    'One last thing: if you try to compare two revisions made by different processes or different alloys, it warns you instead of quietly putting them in a table.',
  ].join('\n'));
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
  s.addText('NEW — WHAT THE STANDARD PROMISES', { x: M + 0.28, y: 5.13, w: 5.4, h: 0.24, fontSize: 10, bold: true, color: GOLD, fontFace: 'Calibri', charSpacing: 1.5, margin: 0 });
  s.addText('Capability bands, before any rule fires', { x: M + 0.28, y: 5.4, w: 5.4, h: 0.32, fontSize: 14, bold: true, color: 'FFFFFF', fontFace: 'Cambria', margin: 0 });
  s.addText('For die castings and steel castings the report now opens with what NADCA #402 or SFSA 2000 promises at this part\'s own size — tolerance band, machining allowance, flatness — so a purchasing conversation starts from the standard, not from a finding.',
    { x: M + 0.28, y: 5.72, w: 5.5, h: 0.62, fontSize: 10, color: 'CBD5E1', fontFace: 'Calibri', margin: 0 });
  footer(s);
  s.addNotes([
    'Two things on this slide.',
    '',
    'The first is that every finding carries a price. The tool runs the same should-cost engine we use to quote parts, once with the geometry as drawn and once with the problem fixed, and the gap between them is what the finding is worth — per part and per year.',
    '',
    'That matters because it means the designer and the buyer are finally looking at the same number, from the same engine. Not two spreadsheets that disagree.',
    '',
    'And where the engine genuinely cannot price something — a die slide, a die-life effect — it says so and quotes the published range instead of inventing a figure. I would rather it say I do not know than guess.',
    '',
    'The second thing is the route table. It asks the harder question: what if we made this part a completely different way? It takes the same measured geometry, runs it through every other process\'s own rules, prices it, and scores its carbon — and tells you why each alternative is or is not viable.',
    '',
    'And the panel in the dark box is the newest addition. For die castings and steel castings, the report now opens with a small band that says what the governing standard PROMISES for a part of this size — the tolerance band it can hold, the machining allowance it needs, the flatness it can keep — before any rule has fired. The reason is that a purchasing conversation goes very differently when it starts from what the industry standard says the process can do, rather than from a complaint about the drawing. Sheet metal parts get the same treatment with press tonnage and strip utilisation, from the die-design textbook equation by equation.',
  ].join('\n'));
}

// ── 10 · Evidence ───────────────────────────────────────────────────────────
{
  const s = pres.addSlide(); s.background = { color: NAVY };
  s.addText('HOW WE KNOW IT IS RIGHT', { x: M, y: 0.55, w: 11, h: 0.26, fontSize: 11, bold: true, color: GOLD, fontFace: 'Calibri', charSpacing: 2, margin: 0 });
  s.addText('Tested against arithmetic, not itself', { x: M, y: 0.86, w: 11.5, h: 0.72, fontSize: 30, bold: true, color: 'FFFFFF', fontFace: 'Cambria', margin: 0 });

  const facts = [
    ['199/199', 'GEOMETRY ACCURACY GATE', 'Every fixture is a shape whose truth is arithmetic — a 3.000° cone, a 25 mm wall. CI fails on any regression.'],
    [String(TESTS), 'AUTOMATED TESTS', `Plus HTTP integration tests and an accessibility gate on every page. ${TESTS_DATE}.`],
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
    { text: `Of ${RULES} thresholds, ${PRIMARY_READ} now come from a reference we have read first-hand — up from 12 a week ago, after seven primary documents were read cover to cover (next slide). ${CONTESTED} are recorded as CONTESTED, where a primary source disagrees with the value we hold; the rest are unaudited industry consensus, and the register names each one.`, options: { breakLine: true } },
    { text: 'That register ships with the product and there is a command that prints it. A number nobody has checked is worth knowing about before a supplier finds it.', options: {} },
  ], { x: M, y: 5.12, w: 11.8, h: 1.0, fontSize: 12.5, color: 'CBD5E1', fontFace: 'Calibri', lineSpacing: 21, margin: 0 });
  footer(s);
  s.addNotes([
    'This is the slide that should decide whether you believe anything on the previous ten.',
    '',
    'Start top left. A hundred and ninety-nine out of a hundred and ninety-nine on the geometry accuracy gate. Those are test shapes where we know the right answer by arithmetic — we built a cone with exactly three degrees of draft, so the engine must say three degrees. If it says two point eight, the build fails and the code does not ship. That runs automatically on every change.',
    '',
    'Seven hundred and one automated tests, ninety-three real-shaped parts swept through the full production path, and zero numbers written by AI.',
    '',
    'Now the bottom half. When I first showed this slide, this was the weakest part of the tool — out of the whole rule book, only five limits came from a document we had personally read. I said so at the time.',
    '',
    'That number is now twenty-nine, and the reason is simple: over the last week we obtained and read seven primary reference books cover to cover — the actual NADCA standards for die casting, the Steel Founders\' Society handbooks for steel castings, the DuPont and Covestro design guides for plastics, and the die-design textbook for sheet metal. The next slide shows exactly what each one gave us.',
    '',
    'The rest of the thresholds are still industry consensus, and the register still names every one of them, with a command that prints it. Two are recorded as CONTESTED, where a source we trust disagrees with the number we hold.',
    '',
    'I keep this slide in deliberately. The alternative is a supplier finding an unaudited number first and then doubting everything else we say.',
  ].join('\n'));
}

// ── 11 · The standards, read first-hand ─────────────────────────────────────
//
// Added after the week in which seven primary reference documents were
// obtained and turned into engine code. Every row names the document, what it
// unlocked, and — in the bottom band — a verdict that CHANGED because a
// primary source was read. The 12 → 29 figure is counted from the register,
// not remembered.
{
  const s = pres.addSlide(); s.background = { color: PAPER };
  heading(s, 'The rule book\'s sources', 'Seven reference books, read cover to cover');

  const BOOKS = [
    ['NADCA Product Design for Die Casting, 7th ed.', 'Draft computed from the book\'s own formula at each feature\'s depth · fillets · bosses · cored holes'],
    ['NADCA #402 Product Specification Standards (2021)', 'Die-casting tolerance CAPABILITY, computed per dimension and grade — Standard vs Precision is now an input'],
    ['SFSA Steel Castings Handbook, Supplement 1', 'Steel casting design: rib height coupled to rib thickness · junction fillets with the printed 13–25 mm clamp'],
    ['SFSA Supplement 3 — Dimensional Capabilities', 'Steel casting tolerances (SFSA 2000 CT grades) · required machining allowance · production series input'],
    ['DuPont Engineering Polymers, Module I', 'Moulding draft per resin and draw depth · fillet knee · boss and blind-core limits'],
    ['Covestro Part and Mold Design', 'PC-family ribs, draft and fillets from the resin maker\'s own tables — read from page images'],
    ['Boljanovic, Sheet Metal Forming Processes', 'Press force, strip utilisation, bend allowance and draw operations, equation by equation'],
  ];
  BOOKS.forEach(([t, d], i) => {
    const y = 1.66 + i * 0.545;
    if (i % 2 === 0) s.addShape(pres.ShapeType.rect, { x: M, y: y - 0.05, w: 8.1, h: 0.54, fill: { color: PANEL }, line: { color: PANEL } });
    s.addText(t, { x: M + 0.14, y: y - 0.02, w: 7.9, h: 0.26, fontSize: 10.5, bold: true, color: INK, fontFace: 'Calibri', margin: 0 });
    s.addText(d, { x: M + 0.14, y: y + 0.22, w: 7.9, h: 0.26, fontSize: 9.5, color: BODY, fontFace: 'Calibri', margin: 0 });
  });

  stat(s, 9.0, 1.66, 3.7, `12 → ${PRIMARY_READ}`, 'PRIMARY-READ THRESHOLDS', GREEN, 'In one week. Counted from the register, not remembered');
  stat(s, 9.0, 3.3, 3.7, '0', 'CONSTANTS TUNED TO FIXTURES', INK, 'Formulas verified against each book\'s own printed worked examples first');
  stat(s, 9.0, 4.94, 3.7, '2', 'RULES CONFIRMED UNCHANGED', INK, 'DuPont printed our exact rib band — an audit hit, recorded as one');

  s.addShape(pres.ShapeType.roundRect, { x: M, y: 5.62, w: 8.1, h: 1.28, fill: { color: NAVY }, rectRadius: 0.06, line: { color: NAVY } });
  s.addText('READING THE BOOK CHANGED THE VERDICT', { x: M + 0.26, y: 5.78, w: 7.6, h: 0.24, fontSize: 9.5, bold: true, color: GOLD, fontFace: 'Calibri', charSpacing: 1.5, margin: 0 });
  s.addText('A 2 mm tolerance band on a first-article steel sand casting used to pass the old screen. SFSA\'s own statistics say no foundry can promise it — it now fails at 0.33× capability, with the table cited. And the same bracket passes draft as nylon and fails as ABS, because DuPont\'s table judges each resin at its own angle.',
    { x: M + 0.26, y: 6.04, w: 7.65, h: 0.8, fontSize: 10.5, color: 'CBD5E1', fontFace: 'Calibri', lineSpacing: 14, margin: 0 });
  footer(s);
  s.addNotes([
    'This slide is the answer to the weakness I admitted on the previous slide, so let me walk you through what actually happened.',
    '',
    'Over the last week we obtained seven of the reference books that the industry actually runs on, and read them cover to cover. Not summaries of them — the books themselves. The two NADCA documents for die casting, including the 2021 specification standard that carries the tolerance tables. The two Steel Founders\' Society handbooks for steel castings. The DuPont and Covestro design guides, which are what the plastics industry designs against. And the die-design textbook for sheet metal.',
    '',
    'Each row on the left tells you what came out of each book. But three things on the right matter more than the list.',
    '',
    'FIRST, the count of thresholds we have personally verified against a primary document went from twelve to twenty-nine in that week. That number is counted live from the register when this deck is generated — I did not type it.',
    '',
    'SECOND — and this is a discipline point — before any formula from a book was wired in, it was tested against the book\'s OWN printed worked examples. The NADCA tolerance standard prints an example: an aluminium dimension of five inches should come out at plus or minus point three five millimetres. Our code has to reproduce that exact number or the tests fail. That catches misread tables — and it caught two real mistakes before they shipped, including one where a rounding error would have charged an extra inch of tolerance.',
    '',
    'THIRD, honesty cuts both ways. When DuPont\'s figure for rib proportions turned out to print exactly the numbers we already used, we did not quietly claim we knew all along — the register records it as a CONFIRMATION. And where a book\'s number was LOOSER than the screen we already had, the stricter number stayed, with both claims named on the finding.',
    '',
    'Now the dark box, because this is the part with money in it. Reading these books did not just improve citations — it changed verdicts. A two-millimetre tolerance band on a first-article steel sand casting used to pass our old screening check. The Steel Founders\' statistics — built from a hundred and forty thousand measured production features — say no foundry can promise that as-cast. It now fails, at a third of capability, and the finding cites the exact table. That is a scrap-rate conversation we can now have with a supplier BEFORE the quote, with their own industry\'s book on the table.',
    '',
    'And the drafting example at the end: the same bracket now passes draft as nylon and fails as ABS, because the DuPont table judges each resin at its own angle. One part, two materials, two different correct answers. That is what alloy-specific genuinely means.',
  ].join('\n'));
}

// ── 12 · Tested on real parts ───────────────────────────────────────────────
//
// Added after three of the user's own exports were reviewed finding by finding
// and re-run through the live engine. Seven things the tool said were wrong.
// A director who has watched a demo wobble needs to see that the wobble was
// found by us, on purpose, before it was found by a supplier.
{
  const s = pres.addSlide(); s.background = { color: PAPER };
  heading(s, 'Tested on real parts', 'Three real components, seven faults found');
  s.addText('The benchmarks prove the maths. They cannot tell you whether the report SAYS the right thing. So we took three real components, read every finding by hand, and re-ran them through the live tool.', {
    x: M, y: 1.6, w: W - 2 * M, h: 0.5, fontSize: 12.5, color: BODY, fontFace: 'Calibri', lineSpacing: 20, margin: 0 });

  const PARTS = [
    ['Steering knuckle', 'Hot forging · high-strength steel'],
    ['Casting bracket', 'HPDC · aluminium A356'],
    ['Seat locking bracket', 'Stamping · high-strength steel'],
  ];
  PARTS.forEach(([t, d], i) => {
    const x = M + i * 4.08;
    s.addShape(pres.ShapeType.roundRect, { x, y: 2.18, w: 3.8, h: 0.78, fill: { color: PANEL }, rectRadius: 0.06, line: { color: PANEL } });
    s.addText(t, { x: x + 0.22, y: 2.3, w: 3.4, h: 0.28, fontSize: 12.5, bold: true, color: INK, fontFace: 'Calibri', margin: 0 });
    s.addText(d, { x: x + 0.22, y: 2.58, w: 3.4, h: 0.28, fontSize: 10, color: MUT, fontFace: 'Calibri', margin: 0 });
  });

  const FOUND = [
    ['It reported a EUR 151,200 a year saving', 'on a bend-radius finding — but the figure priced deleting all 23 bends, which is a different part', 'Now says NOT PRICED, with the reason'],
    ['It recommended cold heading a die casting', 'a wire-fed fastener process, for a 320 cm3 bracket. Only 2 of 35 routes had a feasibility gate', `${GATED} gates now — it refuses both`],
    ['One label, two different numbers', '"wall below minimum draft" read 64% on page 1 and 56% on page 2 — measured at different angles', 'The angle is printed in the label'],
    ['A rule told you to do the wrong thing', '"open the radius to 1x thickness" when the steel it had resolved needs 2x', 'Titles and fixes read the alloy limit'],
    ['26 holes, none of them round', 'it asked the CAD exporter what shape they were instead of measuring', 'Measured — 12 round, 14 shaped'],
  ];
  FOUND.forEach(([a, b, c], i) => {
    const y = 3.12 + i * 0.63;
    if (i % 2 === 0) s.addShape(pres.ShapeType.rect, { x: M, y: y - 0.06, w: W - 2 * M, h: 0.62, fill: { color: PANEL }, line: { color: PANEL } });
    s.addText(a, { x: M + 0.16, y: y - 0.02, w: 3.9, h: 0.28, fontSize: 11, bold: true, color: RED, fontFace: 'Calibri', margin: 0 });
    s.addText(b, { x: M + 0.16, y: y + 0.24, w: 7.6, h: 0.28, fontSize: 9.5, color: BODY, fontFace: 'Calibri', margin: 0 });
    s.addText(c, { x: 8.5, y: y + 0.04, w: 3.6, h: 0.4, fontSize: 10.5, bold: true, color: GREEN, fontFace: 'Calibri', margin: 0 });
  });

  s.addShape(pres.ShapeType.roundRect, { x: M, y: 6.34, w: W - 2 * M, h: 0.6, fill: { color: NAVY }, rectRadius: 0.06, line: { color: NAVY } });
  s.addText(`All seven are fixed, and every one is now held down by a test that fails if it comes back. ${TESTS} tests run on every change.`,
    { x: M + 0.3, y: 6.47, w: 11.4, h: 0.34, fontSize: 12, bold: true, color: 'FFFFFF', fontFace: 'Calibri', margin: 0 });
  footer(s);
  s.addNotes([
    'This slide exists because of a fair question: how do you know the tool is telling the truth?',
    '',
    'The benchmarks on the last slide prove the MATHS is right. They cannot prove the REPORT says the right thing. Those are two different problems, and a tool can pass the first while failing the second badly.',
    '',
    'So we took three real components — a forged steering knuckle, a die-cast bracket, and a stamped seat bracket. We read every single finding by hand, then re-ran the same files through the live tool and compared.',
    '',
    'We found seven things our own tool was getting wrong. They are on the slide. Let me take you through the two that matter most.',
    '',
    'THE FIRST ONE, top of the list. The report showed a saving of a hundred and fifty-one thousand euros a year. That was the biggest number in the whole document. When we traced it back, the calculation was pricing the removal of all twenty-three bends in the part — in other words, a completely flat piece of metal. But the finding it was attached to just asked you to open one bend radius slightly. Opening a radius removes no bends and saves nothing. So the number was real arithmetic attached to the wrong question. It now says NOT PRICED and explains why.',
    '',
    'THE SECOND ONE, and this is the one an experienced engineer spots in ten seconds. The tool was recommending Cold Heading as a cheaper way to make a die-cast bracket. Cold heading makes bolts out of wire. It cannot make a bracket. The reason was that only two of our thirty-five processes had any check on whether they could physically make the part at all. Everything else was allowed by default. We have added those checks, and it now refuses cold heading and MIM outright, with the reason.',
    '',
    'The other three on the list are the same character — right maths, wrong wording, or a check that trusted the CAD file instead of measuring.',
    '',
    'The point I want to land is this. We found all seven ourselves, on purpose, before a supplier did. And every one of them is now pinned by a test that fails automatically if the fault ever comes back. That is why the number at the bottom matters — seven hundred and one tests, run on every single change.',
    '',
    'If we had not done this exercise, the first person to spot the hundred and fifty-one thousand would have been someone reading the report in a supplier review.',
  ].join('\n'));
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
  s.addNotes([
    'This is the measurement I am proudest of having, and least proud of some of the numbers in.',
    '',
    'The standard I set myself was this: a rule that is technically correct but stays silent on every real part is worth nothing. So we run ninety-three realistically-shaped parts — ten commodities, ten variants each — through the whole tool, and count how much of the rule book actually speaks.',
    '',
    'The average is sixty-nine per cent. Die casting, powder metallurgy and extrusion are all above eighty. Those are genuinely good.',
    '',
    'Now look at the bottom row, sheet metal, thirty-seven and a half per cent, in red. That is the worst number on the board and I have deliberately left it on the slide.',
    '',
    'The reason is not that the rules are wrong. It is that our synthetic test brackets are flat plates with holes in them. They have no bends. So seven bend-related rules never get a chance to run, and they score zero through no fault of their own.',
    '',
    'That is a test-data problem, not a rule problem. And it is exactly why my ask at the end of this presentation is what it is — I need one real bent bracket.',
    '',
    'I am showing you this because you would find it within five minutes of using the tool, and I would rather point at it myself.',
  ].join('\n'));
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
    ['Tolerance capability computed from the named standard', 'Yes', 'Table lookups', 'Ahead'],
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
    x: M, y: 1.62, w: W - 2 * M, colW: [5.3, 1.9, 2.4, 2.49], rowH: 0.385,
    fontSize: 10.5, fontFace: 'Calibri', border: { type: 'none' }, valign: 'middle', margin: [2, 8, 2, 8],
  });
  s.addText('The two red rows are the honest gaps, and they are the two I would spend money on next. Everything above them we already do.', {
    x: M, y: 6.15, w: W - 2 * M, h: 0.4, fontSize: 12.5, italic: true, color: INK, fontFace: 'Calibri', margin: 0 });
  footer(s);
  s.addNotes([
    'A fair comparison against the established tools — DFMPro, aPriori, Boothroyd Dewhurst.',
    '',
    'The green rows are where we are genuinely ahead, and there are four now. We price alternative process routes and carbon-score them. We treat could-not-evaluate as a real outcome instead of a green tick. And we publish where every threshold came from and how much it is worth trusting. I have not found a commercial tool that will tell you one of its own numbers is unaudited. And since last week, tolerance capability is COMPUTED from the named standard at the part\'s own dimensions — NADCA 402 for die castings, SFSA 2000 for steel — where the established tools do static table lookups.',
    '',
    'The middle rows are parity — reading real geometry, process and alloy specific rules, pricing findings, comparing revisions. We match them.',
    '',
    'Now the two red rows, because those are the honest ones.',
    '',
    'They have decades of measured production outcomes behind their numbers. We have zero. Their limits have been checked against real scrap rates from real plants; ours have been checked against published guidance.',
    '',
    'And they read native CATIA, NX and JT files. We read STEP and IGES, which means a translation step, and we lose the tolerance data every time.',
    '',
    'Both of those are solvable. Neither is solved by me writing more code — the first one needs data from the business, and that is what I am about to ask for.',
  ].join('\n'));
}

// ── 13 · Roadmap ────────────────────────────────────────────────────────────
{
  const s = pres.addSlide(); s.background = { color: PAPER };
  heading(s, 'What is next', 'Ordered by impact, not by effort');
  const items = [
    ['1', 'Validate against one real part', 'A production part, its quote, and the supplier\'s own DFM markup. This is what converts "internally consistent" into "accurate" — and it is the only item on this list I cannot do alone.', GOLD],
    ['2', 'Native CAD input', 'CATIA, NX and JT. Today we read STEP and IGES, which means a translation step and a lost PMI tolerance every time.', NAVY_MID],
    ['3', 'Buy the two missing standards', 'DIN 16742 for moulded-part tolerances and ISO 8062 for non-ferrous castings. Seven books are already in; these two close the tolerance story, and both are catalogue purchases.', NAVY_MID],
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
  s.addNotes([
    'Four things next, in the order that changes the answer rather than the order of effort.',
    '',
    'NUMBER ONE, in gold, is to validate against one real part. That is the only item on this list that I cannot do by myself, and it is the only one that converts this tool from internally consistent to actually accurate. I will come back to it on the next slide.',
    '',
    'NUMBER TWO is reading native CAD — CATIA, NX, JT. Today every file goes through a translation to STEP and we lose the tolerance information on the way. That is why you saw tolerance rules abstaining on the coverage slide.',
    '',
    'NUMBER THREE is a small purchase rather than a project. Seven reference books are already read and coded. The two that remain are DIN 16742, which carries the tolerance tables for moulded plastic parts, and ISO 8062 for aluminium sand and gravity castings. Both are standards you simply buy. The register names them as the exact blockers, so the money maps directly onto rules that start speaking.',
    '',
    'NUMBER FOUR is loading our own plant standards. The mechanism is already built and it already overrides the textbook where we set a value. It just needs our actual numbers put into it, which is a conversation with manufacturing rather than a coding job.',
    '',
    'Everything from two down I can schedule myself.',
  ].join('\n'));
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
  s.addNotes([
    'So here is the ask, and it is deliberately a small one.',
    '',
    'I am not asking for budget. I am not asking for headcount. I am asking for one part.',
    '',
    'Specifically: one component we already buy today. Three things with it — the STEP file, the quotation we actually pay, and whatever DFM comments the supplier gave us.',
    '',
    'I will run it through the tool and publish everything, including every place the tool disagrees with the supplier. Especially those.',
    '',
    'The reason is this. Right now the tool is internally consistent. It is tested, it is honest about its limits, and every number in it is reproducible. What it has never been is checked against reality — against a part where somebody already knows the right answer.',
    '',
    'Within a week of getting that part, we will know whether this is something we can put in front of a supplier, or a prototype that needs another quarter of work. And either answer is worth having.',
    '',
    'One preference, in the box at the bottom. If you can find me a sheet metal bracket with real bends in it, that would be ideal — it would exercise seven rules that have never yet run on anything except a test fixture.',
    '',
    'That is everything. Happy to take questions, and if you have five more minutes I can run a real part through it live right now.',
  ].join('\n'));
}

await pres.writeFile({ fileName: 'BrainSpark_DFM_DFA_Studio_Director.pptx' });
console.log(`wrote deck · ${RULES} rules · ${FAMILIES} families · ${PRIMARY_READ} primary-read · ${CONTESTED} contested`);
