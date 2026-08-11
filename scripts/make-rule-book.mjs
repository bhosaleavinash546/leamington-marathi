// ─────────────────────────────────────────────────────────────────────────────
// THE DFM RULE BOOK — every rule this tool judges a part against, in one PDF.
//
// This is generated, never typed. The catalogue in `dfm-rule-catalogue.mjs` is
// the only source of truth for what the engine tests, and a rule book written
// by hand goes stale the first time somebody adds a threshold. So every number,
// citation, comparison and per-material override on these pages is read out of
// the catalogue at build time; if the engine's behaviour changes, re-run this
// and the book changes with it.
//
//   node scripts/make-rule-book.mjs [-o out.pdf]
//
// Two things this book is careful about, because they are the two ways a rule
// book normally lies:
//
//   1. IT PRINTS THE TEST, NOT A PARAPHRASE. Each entry shows the measure name,
//      the comparison and the threshold exactly as the engine holds them, so a
//      reader can check the tool against the book rather than trusting a prose
//      summary of it.
//
//   2. IT PRINTS HOW GOOD EACH THRESHOLD IS. The catalogue grades its sources
//      and `docs/threshold-audit.json` records which ones anybody actually
//      checked. Both travel with the rule. A number nobody audited says so on
//      the page next to it.
//
// "Best rules first" is a ranking, and a ranking with a hidden formula is an
// opinion wearing a lab coat — so the composite is printed in full on the
// "How to read this book" page and recomputed here from catalogue data.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { DFM_RULES, PROCESS_FAMILIES, UNWRITTEN_RULES } from '../dfm-rule-catalogue.mjs';
import { pdfSafe } from '../src/services/pdf-safe.mjs';

const require = createRequire(import.meta.url);
const { jsPDF } = require('jspdf');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = (() => {
  const i = process.argv.indexOf('-o');
  return i > 0 ? process.argv[i + 1] : join(ROOT, 'BrainSpark_DFM_Rule_Book.pdf');
})();

// The logo lives in a TS module as a data URI. Importing it would mean a build
// step for a 12 kB string, so it is read straight out of the source.
const LOGO_PNG = (() => {
  const src = readFileSync(join(ROOT, 'src/services/brainspark-logo-png.ts'), 'utf-8');
  return src.match(/'(data:image\/png;base64,[A-Za-z0-9+/=]+)'/)[1];
})();

const AUDIT = (() => {
  const p = join(ROOT, 'docs/threshold-audit.json');
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf-8')).thresholds || {}) : {};
})();

// Which findings the cost engine can put a number on. Read from the source
// rather than re-listed, so a new pricer appears in the book automatically.
const PRICED = (() => {
  const src = readFileSync(join(ROOT, 'dfm-cost-impact.mjs'), 'utf-8');
  const block = src.slice(src.indexOf('const PRICERS'), src.indexOf('};', src.indexOf('const PRICERS')));
  return new Set([...block.matchAll(/'([a-z0-9-]+)':\s*price/g)].map((m) => m[1]));
})();

// ── Commodity grouping ───────────────────────────────────────────────────────
//
// The catalogue keys rules by PROCESS. A cost engineer thinks in COMMODITIES —
// "the castings", "the stampings" — and buys them from different supply bases,
// so that is how the book is ordered. Every family in PROCESS_FAMILIES must
// appear in exactly one group; the check below fails the build if one is
// added upstream and forgotten here, rather than silently dropping its rules.
const COMMODITIES = [
  {
    key: 'castings',
    name: 'Castings',
    blurb: 'Metal poured or injected into a mould. The shared enemies are draft, wall uniformity, section transitions and anything that traps the pattern or the core.',
    families: ['hpdc', 'hpdc-zinc', 'lpdc', 'gravity-die', 'squeeze-casting', 'semi-solid', 'sand-casting', 'shell-mould', 'investment-casting', 'centrifugal'],
  },
  {
    key: 'sheet',
    name: 'Sheet metal and forming',
    blurb: 'Flat stock cut and bent. Nearly every limit here is a ratio to material thickness, and most are material-dependent because the alloy decides how far it will stretch before it splits.',
    families: ['sheet-metal', 'deep-drawing', 'fine-blanking', 'hot-stamping', 'roll-forming', 'hydroforming', 'metal-spinning'],
  },
  {
    key: 'bulk',
    name: 'Forging and bulk forming',
    blurb: 'Solid metal moved under load. Draft is far heavier than in casting, webs and ribs have hard minimums, and the die closes in one direction only.',
    families: ['forging-hot', 'forging-cold', 'open-die-forging', 'cold-heading', 'extrusion'],
  },
  {
    key: 'machining',
    name: 'Machining and material removal',
    blurb: 'Material taken away by a tool. Cost follows access, setups and slenderness — how many directions the features are approached from, and how deep a tool has to reach.',
    families: ['machining', 'turning', 'deep-hole-drilling', 'broaching', 'wire-edm'],
  },
  {
    key: 'polymer',
    name: 'Polymers, rubber and composites',
    blurb: 'Melt or resin into a tool. Wall thickness governs both fill and cycle time, so it drives piece price twice over.',
    families: ['injection-moulding', 'rubber-moulding', 'thermoforming', 'rotational-moulding', 'composite-rtm'],
  },
  {
    key: 'powder',
    name: 'Powder and additive',
    blurb: 'Built up rather than cut down. Density, aspect ratio and — for additive — build orientation replace the usual mould-opening constraints.',
    families: ['powder-metallurgy', 'mim', 'lpbf'],
  },
];

{
  const placed = new Set(COMMODITIES.flatMap((c) => c.families));
  const missing = Object.keys(PROCESS_FAMILIES).filter((f) => !placed.has(f));
  const unknown = [...placed].filter((f) => !PROCESS_FAMILIES[f]);
  if (missing.length || unknown.length) {
    console.error(`Commodity map is out of date. Unplaced families: ${missing.join(', ') || 'none'}. Unknown keys: ${unknown.join(', ') || 'none'}.`);
    process.exit(1);
  }
}

// ── The ranking ──────────────────────────────────────────────────────────────
//
// Printed verbatim on the "How to read" page. Every term is something a reader
// can verify from the entry itself, which is the only way a ranking earns the
// word "best" rather than "the order I felt like".
const SEV_POINTS = { high: 3, medium: 2, low: 1 };
const GRADE_POINTS = { 'standard-named': 3, 'industry-consensus': 2, 'engine-derived': 1 };

function auditOf(id) { return AUDIT[id]?.status || 'unaudited'; }

function scoreOf(rule) {
  const spec = (rule.byMaterial ? 2 : 0) + (rule.byMaterialFamily ? 1 : 0);
  return 3 * (SEV_POINTS[rule.severity] || 1)
    + 2 * (GRADE_POINTS[rule.sourceStatus] || 1)
    + spec
    + (PRICED.has(rule.id) ? 2 : 0)
    + (rule.blocking ? 2 : 0)
    - (auditOf(rule.id) === 'contested' ? 3 : 0);
}

const RANKED = [...DFM_RULES].sort((a, b) => scoreOf(b) - scoreOf(a) || a.id.localeCompare(b.id));

// ── Formatting the test itself ───────────────────────────────────────────────
const numText = (n) => (typeof n === 'number' ? String(Math.round(n * 1000) / 1000) : String(n));

function testText(rule, threshold = rule.threshold) {
  const u = rule.unit ? ` ${rule.unit}` : '';
  if (rule.compare === 'between' && Array.isArray(threshold)) {
    return `${rule.measure}  in  ${numText(threshold[0])} to ${numText(threshold[1])}${u}`;
  }
  const op = rule.compare === 'gte' ? '>=' : rule.compare === 'lte' ? '<=' : rule.compare;
  return `${rule.measure}  ${op}  ${numText(threshold)}${u}`;
}

function shortThreshold(rule, threshold) {
  if (rule.compare === 'between' && Array.isArray(threshold)) return `${numText(threshold[0])}-${numText(threshold[1])}`;
  const op = rule.compare === 'gte' ? '>=' : '<=';
  return `${op} ${numText(threshold)}`;
}

// ── The same test, in plain words ───────────────────────────────────────────
//
// One sentence per rule, GENERATED from the rule itself so 247 of them can
// never drift from the catalogue. Two parts: a friendly name for the
// measurement (falling back to a de-camelled measure id, which stays honest
// for measures nobody has named yet), and a comparator template. Margin-type
// measures — unit starting "x" — get the computed-limit phrasing instead,
// because their threshold of 1.0 is not a number at all: it is "whatever the
// named table promises for YOUR part".
const MEASURE_PLAIN = {
  wallP5Mm: 'the thinnest wall on the part',
  wallP50Mm: 'the typical wall thickness',
  wallP95Mm: 'the thickest wall on the part',
  wallSpreadRatio: 'how uneven the walls are (spread against the typical wall)',
  wallAreaBelowDraftPct: 'how much wall area has less taper than the process needs',
  undercutFaceCount: 'how many regions the mould halves cannot release',
  maxRibThicknessToWall: 'the fattest rib, compared with the wall it stands on',
  minRibThicknessToWall: 'the thinnest rib, compared with the wall it stands on',
  maxRibHeightToWall: 'the tallest rib, compared with the wall it stands on',
  maxBossHeightToDia: 'the tallest boss, compared with its own diameter',
  maxHoleDepthToDia: 'the deepest hole, compared with its diameter',
  maxBlindHoleDepthToDia: 'the deepest BLIND hole, compared with its diameter',
  tightestToleranceMm: 'the tightest tolerance band asked for on the drawing',
  minInternalCornerRadiusMm: 'the sharpest internal corner',
  maxPocketDepthToWidth: 'the deepest pocket, compared with its width',
  unreachableAreaPct: 'how much of the surface a cutting tool cannot reach',
  bendRadiusToThickness: 'the tightest bend, compared with the sheet thickness',
  minHoleDiaToThickness: 'the smallest hole, compared with the sheet thickness',
  overhangAreaBelowDeg: 'how much surface overhangs beyond the printable angle',
};
const deCamel = (m) => m.replace(/Mm$/, ' (mm)').replace(/Pct$/, ' (%)')
  .replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

function plainWords(rule) {
  const isMargin = typeof rule.unit === 'string' && rule.unit.startsWith('x ');
  if (isMargin) {
    const what = rule.unit.slice(2);
    return `In plain words: the limit here is not a fixed number - the engine works out ${what} for YOUR part (its own size, alloy or resin, and declared inputs) from the source below, and 1.0 means exactly what that table promises. Above 1.0 the part is inside the standard's capability; below it, the drawing is asking for more than the process can hold.`;
  }
  const what = MEASURE_PLAIN[rule.measure] || deCamel(rule.measure);
  const u = rule.unit ? ` ${rule.unit}` : '';
  if (rule.compare === 'between' && Array.isArray(rule.threshold)) {
    return `In plain words: the engine measures ${what}; the part passes when it is between ${numText(rule.threshold[0])} and ${numText(rule.threshold[1])}${u}.`;
  }
  const dir = rule.compare === 'gte' || rule.compare === 'gt' ? 'at least' : 'no more than';
  return `In plain words: the engine measures ${what}; the part passes when it is ${dir} ${numText(rule.threshold)}${u}.`;
}

const GRADE_LABEL = {
  'standard-named': 'Named standard, not read first-hand',
  'industry-consensus': 'Industry consensus, no primary source audited',
  'engine-derived': "This tool's own cost model",
};
const AUDIT_LABEL = {
  'primary-read': 'PRIMARY SOURCE READ',
  'search-corroborated': 'CORROBORATED BY SEARCH',
  contested: 'CONTESTED - SEE APPENDIX B',
  unaudited: 'NOT YET AUDITED',
};

// ── Document ─────────────────────────────────────────────────────────────────
const NAVY = [13, 31, 51];
const GOLD = [245, 158, 11];
const INK = [17, 24, 39];
const BODY = [55, 65, 81];
const MUT = [107, 114, 128];
const RULE_C = [214, 222, 233];
const PANEL = [244, 247, 251];
const GREEN = [4, 120, 87];
const AMBER = [180, 83, 9];
const RED = [185, 28, 28];
const TEAL = [13, 148, 136];
const SEV_COLOUR = { high: RED, medium: AMBER, low: TEAL };

const TODAY = new Date().toISOString().split('T')[0];

/**
 * Draw the whole book.
 *
 * `index` maps a commodity or family key to the page it starts on. The first
 * pass runs with an empty index so the contents page prints dashes; the second
 * runs with the collected numbers. The contents page holds the same number of
 * rows either way, so pagination is identical between passes — which is the
 * only reason this two-pass trick is safe.
 */
function build(index) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, ML = 16, MR = 16;
  const CW = PW - ML - MR;
  // Rule entries are indented past their rank number, so the body column is
  // narrower than the page column.
  const IX = ML + 9;
  const IW = CW - 9;
  const collected = new Map();
  let page = 1;
  let y = 0;

  const sans = (s = 10, st = 'normal') => { doc.setFont('helvetica', st); doc.setFontSize(s); };
  const mono = (s = 8, b = false) => { doc.setFont('courier', b ? 'bold' : 'normal'); doc.setFontSize(s); };
  const setFill = (c) => doc.setFillColor(c[0], c[1], c[2]);
  const setText = (c) => doc.setTextColor(c[0], c[1], c[2]);
  const setDraw = (c, w = 0.3) => { doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(w); };

  function fit(text, max) {
    // Sanitise at the DRAW boundary. Strings composed in this file never pass
    // through the caller's sanitiser, and one non-WinAnsi character makes jsPDF
    // fall back to UTF-16 and render the whole line as spaced garbage.
    let t = pdfSafe(String(text));
    if (doc.getTextWidth(t) <= max) return t;
    while (t.length > 1 && doc.getTextWidth(`${t}...`) > max) t = t.slice(0, -1);
    return `${t.trimEnd()}...`;
  }

  function footer() {
    setDraw(RULE_C, 0.3);
    doc.line(ML, PH - 13, PW - MR, PH - 13);
    doc.addImage(LOGO_PNG, 'PNG', ML, PH - 10.6, 5.5, 5.5);
    mono(7); setText(MUT);
    doc.text(fit(`BrainSpark DFM Rule Book  |  ${DFM_RULES.length} rules  |  generated ${TODAY}`, CW - 18), ML + 8, PH - 7);
    doc.text(String(page).padStart(2, '0'), PW - MR, PH - 7, { align: 'right' });
  }
  function newPage() { doc.addPage(); page += 1; y = 22; footer(); }
  function ensure(h) { if (y + h > PH - 20) newPage(); }

  function measure(text, size, width, lh, style = 'normal') {
    sans(size, style);
    return doc.splitTextToSize(pdfSafe(String(text)), width).length * lh;
  }
  function wrapped(text, size = 8.6, colour = BODY, width = CW, lh = 4, style = 'normal', x = ML) {
    const lines = (sans(size, style), doc.splitTextToSize(pdfSafe(String(text)), width));
    for (const line of lines) {
      ensure(lh + 1);
      // Re-assert on every line: ensure() may have broken to a new page, and
      // footer() leaves the graphics state in Courier on its way out.
      sans(size, style); setText(colour);
      doc.text(line, x, y);
      y += lh;
    }
  }
  /**
   * A bold inline label followed by wrapped body text.
   *
   * The indent MUST be measured in the bold font the label is drawn in.
   * Measuring it in the regular weight — which is what happens if the font is
   * switched before getTextWidth — leaves the body text starting a millimetre
   * inside the label, and it reads as one run-on word.
   */
  function labelledPara(label, labelColour, text, x, width, size = 8.8, lh = 4.2, gap = 2.5) {
    sans(size, 'bold');
    const off = doc.getTextWidth(pdfSafe(label)) + gap;
    ensure(lh + 2);
    sans(size, 'bold'); setText(labelColour);
    doc.text(pdfSafe(label), x, y);
    sans(size);
    const lines = doc.splitTextToSize(pdfSafe(String(text)), width - off);
    for (let i = 0; i < lines.length; i++) {
      if (i) ensure(lh + 1);
      sans(size); setText(BODY);
      doc.text(lines[i], x + off, y);
      y += lh;
    }
  }
  function sectionTitle(kicker, title) {
    ensure(20);
    mono(7, true); setText(GOLD);
    doc.text(pdfSafe(kicker.toUpperCase()), ML, y); y += 4.6;
    sans(14, 'bold'); setText(INK);
    doc.text(fit(title, CW), ML, y); y += 3;
    setDraw(RULE_C, 0.4); doc.line(ML, y, PW - MR, y); y += 6;
  }

  // ── Cover ──────────────────────────────────────────────────────────────────
  setFill(NAVY); doc.rect(0, 0, PW, 62, 'F');
  setFill(GOLD); doc.rect(0, 62, PW, 1.4, 'F');
  doc.addImage(LOGO_PNG, 'PNG', ML, 14, 13, 13);
  sans(9); setText([226, 232, 240]);
  doc.text('B R A I N S P A R K', ML + 17, 18.5);
  sans(25, 'bold'); setText([255, 255, 255]);
  doc.text('DFM Rule Book', ML + 17, 28.5);
  sans(11.5); setText(GOLD);
  doc.text('Every rule the engine judges a part against, by commodity', ML + 17, 37);
  mono(8); setText([148, 163, 184]);
  doc.text(`${DFM_RULES.length} RULES  ·  ${Object.keys(PROCESS_FAMILIES).length} PROCESS FAMILIES  ·  ${COMMODITIES.length} COMMODITY GROUPS`, ML + 17, 45.5);
  doc.text(`GENERATED ${TODAY}  ·  READ DIRECTLY FROM dfm-rule-catalogue.mjs`, ML + 17, 51.5);
  y = 74;
  footer();

  wrapped('This book is generated from the catalogue the engine actually runs. Nothing on these pages was typed by hand, which means it cannot disagree with the tool: every threshold, comparison, citation and per-material override below is the value the analysis will use on your part.', 9.6, BODY, CW, 4.6);
  y += 4;
  wrapped('Two figures travel with each rule that a checklist would leave out. The first is what the threshold rests on - a named standard, an industry consensus, or this tool\'s own cost model. The second is whether anyone has since gone and checked it. Where the answer is "not yet", the page says so.', 9.6, BODY, CW, 4.6);
  y += 10;

  // Composition of the catalogue, so the reader knows the shape of the book.
  {
    const gradeCount = {};
    const sevCount = {};
    for (const r of DFM_RULES) {
      gradeCount[r.sourceStatus] = (gradeCount[r.sourceStatus] || 0) + 1;
      sevCount[r.severity] = (sevCount[r.severity] || 0) + 1;
    }
    const overrides = DFM_RULES.reduce((s, r) => s + Object.keys(r.byMaterial || {}).length + Object.keys(r.byMaterialFamily || {}).length, 0);
    const tiles = [
      [String(sevCount.high || 0), 'HIGH SEVERITY', RED],
      [String(sevCount.medium || 0), 'MEDIUM', AMBER],
      [String(sevCount.low || 0), 'LOW', TEAL],
      [String(overrides), 'MATERIAL-SPECIFIC THRESHOLDS', INK],
      [String(Object.values(AUDIT).filter((a) => a.status === 'primary-read').length), 'AUDITED TO A PRIMARY SOURCE', GREEN],
    ];
    const bw = CW / tiles.length;
    setDraw(RULE_C, 0.4); doc.line(ML, y - 5, PW - MR, y - 5);
    for (let i = 0; i < tiles.length; i++) {
      const x = ML + i * bw;
      sans(19, 'bold'); setText(tiles[i][2]);
      doc.text(tiles[i][0], x, y + 4);
      mono(5.9); setText(MUT);
      for (const [k, line] of doc.splitTextToSize(tiles[i][1], bw - 4).entries()) {
        doc.text(line, x, y + 9.4 + k * 3.1);
      }
    }
    y += 22;
    setDraw(RULE_C, 0.4); doc.line(ML, y, PW - MR, y); y += 9;
  }

  wrapped('WHAT THIS BOOK IS NOT', 8, GOLD, CW, 4.6, 'bold');
  y += 1;
  wrapped(`It is not a design standard - but it now leans on several. ${Object.values(AUDIT).filter((a) => a.status === 'primary-read').length} thresholds have been verified against a primary document read cover to cover (the eight documents below), each formula tested against that book's own printed worked examples before it was wired in. The rest are widely-published practice that nobody here has yet checked against an original clause, and ${Object.values(AUDIT).filter((a) => a.status === 'contested').length} are actively contested - all named in Appendix B. Where your plant has its own number, it outranks everything in this book, and the tool lets you set it. It is also not a complete list of what matters: Appendix A sets out ${UNWRITTEN_RULES.length} things the engine deliberately does not claim to check.`, 9, BODY, CW, 4.4);
  y += 9;

  // The primary documents, named on the cover. STATIC by design - extend this
  // list when the next document is read; the per-rule SOURCE lines remain the
  // live truth about which rule rests on which page.
  wrapped('READ FIRST-HAND - THE PRIMARY DOCUMENTS BEHIND THE STRONGEST RULES', 8, GOLD, CW, 4.6, 'bold');
  y += 2.5;
  for (const [name, scope] of [
    ['NADCA Product Design for Die Casting, 7th ed. (2015)', 'die-casting draft formula, fillets, bosses, cored holes'],
    ['NADCA #402 Product Specification Standards (2021)', 'die-casting tolerance capability, computed per dimension and grade'],
    ['SFSA Steel Castings Handbook, Supplement 1', 'steel casting design - rib neutrality, junction fillets, minimum section'],
    ['SFSA Supplement 3 - Dimensional Capabilities of Steel Castings', 'steel casting tolerances (SFSA 2000 CT grades), machining allowance'],
    ['DuPont Engineering Polymers, General Design Principles, Module I', 'moulding draft per resin, fillets, bosses, blind cores'],
    ['Covestro (Bayer) Part and Mold Design', 'PC-family ribs, draft, fillets, undercut stripping limits'],
    ['Boljanovic, Sheet Metal Forming Processes and Die Design', 'press force, strip utilisation, bend allowance, draw operations'],
    ['ISO 8062-4:2017 - General tolerances for castings', 'non-ferrous casting tolerances per metal group, draft tables, machining allowance'],
  ]) {
    ensure(8);
    sans(8.6, 'bold'); setText(INK);
    doc.text(fit(name, CW), ML, y);
    y += 3.9;
    sans(8); setText(MUT);
    doc.text(fit(scope, CW), ML, y);
    y += 4.6;
  }
  y += 3;

  // The six commodity groups, so a reader can find their own parts on the cover
  // rather than working it out from the contents page. The heading must carry
  // at least its first group with it — an orphan heading at a page foot reads
  // as an empty section.
  ensure(24);
  wrapped('THE SIX COMMODITY GROUPS', 8, GOLD, CW, 4.6, 'bold');
  y += 2.5;
  for (const c of COMMODITIES) {
    const rules = DFM_RULES.filter((r) => c.families.includes(r.process));
    ensure(13);
    sans(10, 'bold'); setText(INK);
    doc.text(fit(c.name, CW - 46), ML, y);
    mono(7.2); setText(MUT);
    doc.text(`${String(rules.length).padStart(3, ' ')} RULES  ${String(c.families.length).padStart(2, ' ')} PROCESSES`, PW - MR, y, { align: 'right' });
    y += 4.4;
    sans(8.2); setText(MUT);
    // Wrapped rather than truncated: an ellipsis here hides exactly the
    // processes a reader is scanning the page to find.
    for (const line of doc.splitTextToSize(pdfSafe(c.families.map((f) => PROCESS_FAMILIES[f]).join(' - ')), CW)) {
      sans(8.2); setText(MUT);
      doc.text(line, ML, y);
      y += 4;
    }
    y += 2.4;
    setDraw([234, 239, 245], 0.25); doc.line(ML, y - 3, PW - MR, y - 3);
  }

  // ── How to read ────────────────────────────────────────────────────────────
  newPage();
  sectionTitle('Chapter 0', 'How to read this book');

  wrapped('A rule has three outcomes, not two', 10, INK, CW, 4.8, 'bold');
  y += 1.5;
  for (const [label, colour, text] of [
    ['PASS', GREEN, 'the measurement was taken and it is inside the limit.'],
    ['FAIL', RED, 'the measurement was taken and it is outside the limit. This is a finding.'],
    ['NOT EVALUATED', MUT, 'the geometry needed for the measurement was not present or could not be read. The rule is reported with the reason, and it is NOT counted as a pass. A report that lists only failures invites you to assume everything else was checked.'],
  ]) {
    ensure(9);
    mono(7.6, true); setText(colour);
    doc.text(label, ML, y);
    const w = 32;
    const lines = (sans(8.8), doc.splitTextToSize(pdfSafe(text), CW - w));
    for (const line of lines) { sans(8.8); setText(BODY); doc.text(line, ML + w, y); y += 4.1; }
    y += 1.6;
  }
  y += 4;

  wrapped('Some limits are computed, not constant', 10, INK, CW, 4.8, 'bold');
  y += 1.5;
  wrapped('Where a rule\'s unit begins with "x" - "x SFSA 2000 capability", "x S-4A-1 capability", "x required fillet" - the number 1.0 is not the limit itself. The engine works out the real limit for YOUR part from the named table: the tolerance band the standard promises at that feature\'s own dimension and your declared production series, the draft angle the resin maker prints for your resin at the part\'s own draw depth, the fillet radius that suits the wall\'s own thickness. The finding then prints both the computed requirement and the table it came from. Read 1.0 as "exactly what the standard promises" - above it you are inside the process\'s capability, below it the drawing is asking for more than the book says the process can hold.', 8.8, BODY, CW, 4.2);
  y += 3;
  wrapped('This is also why the same part can pass as one material and fail as another: the drawing did not change, but the table the limit comes from did.', 8.8, BODY, CW, 4.2);
  y += 6;

  wrapped('Anatomy of an entry', 10, INK, CW, 4.8, 'bold');
  y += 2;
  {
    const sample = RANKED.find((r) => r.byMaterial) || RANKED[0];
    setFill(PANEL); doc.rect(ML, y - 3.4, CW, 15, 'F');
    mono(8.2); setText(INK);
    doc.text(fit(testText(sample), CW - 8), ML + 4, y + 1.6);
    mono(6.6); setText(MUT);
    doc.text(fit(sample.id, CW - 8), ML + 4, y + 7.2);
    y += 17;
  }
  wrapped('The grey line is the test itself, in the engine\'s own terms: the name of the measurement taken from your CAD, the comparison, the threshold and its unit. Below it is the rule id, which is what appears in the analysis output and in the Excel export - quote it if you want to challenge a result. Everything after that is prose: why the limit exists, what to do about it, and where the number came from.', 8.8, BODY, CW, 4.2);
  y += 6;

  wrapped('Which threshold applies to your part', 10, INK, CW, 4.8, 'bold');
  y += 1.5;
  wrapped('The number printed at the head of an entry is the process-generic one. Many rules carry a stricter or looser value for a specific alloy or material family, and those are listed underneath. The engine resolves them in this order, and stops at the first match:', 8.8, BODY, CW, 4.2);
  y += 2;
  for (const [n, label, text] of [
    ['1', 'Your company standard', 'a value set in your workspace. It outranks every published guideline, and the report credits it to you rather than to a handbook.'],
    ['2', 'The exact material grade', 'e.g. the row for DP980 rather than for steel generally.'],
    ['3', 'The material family', 'e.g. aluminium, titanium, thermoplastic.'],
    ['4', 'The process-generic value', 'the headline number in this book.'],
  ]) {
    ensure(9);
    mono(9, true); setText(GOLD);
    doc.text(n, ML, y);
    labelledPara(label, INK, text, ML + 6, CW - 6);
    y += 1.4;
  }
  y += 5;

  wrapped('How "best first" was decided', 10, INK, CW, 4.8, 'bold');
  y += 1.5;
  wrapped('Rules are ordered within every commodity by the composite below, and the leaderboard in Chapter 1 uses the same figure across the whole catalogue. It is printed here in full because a ranking with a hidden formula is an opinion in a lab coat - every term is something you can check from the entry itself.', 8.8, BODY, CW, 4.2);
  y += 2.5;
  {
    setFill(PANEL); doc.rect(ML, y - 3.4, CW, 33, 'F');
    let ly = y + 1.4;
    for (const line of [
      '3 x severity            high 3   medium 2   low 1',
      '2 x source strength     named standard 3   industry consensus 2   own cost model 1',
      '+ 2                     carries per-GRADE thresholds (a number tuned to your alloy)',
      '+ 1                     carries per-FAMILY thresholds',
      '+ 2                     the cost engine can put a currency figure on the finding',
      '+ 2                     blocking (the part cannot be made by this route at all)',
      '- 3                     the threshold is contested in the audit register',
    ]) {
      mono(7.2); setText(INK);
      doc.text(pdfSafe(line), ML + 4, ly); ly += 4.3;
    }
    y += 36;
  }
  wrapped('A high score means the rule is severe, well-sourced, tuned to your material and priced. It does not mean it will fire on your part - that depends on whether the geometry carries the feature it measures.', 8.8, MUT, CW, 4.2, 'italic');

  // ── Contents ───────────────────────────────────────────────────────────────
  newPage();
  sectionTitle('Contents', 'By commodity');
  {
    ensure(10);
    sans(10.5, 'bold'); setText(INK);
    doc.text('Chapter 1 - The highest-ranked rules across the whole catalogue', ML, y);
    mono(8, true); setText(GOLD);
    doc.text(index.get('ch1') != null ? String(index.get('ch1')).padStart(2, '0') : '--', PW - MR, y, { align: 'right' });
    y += 9;
  }
  for (const c of COMMODITIES) {
    const n = DFM_RULES.filter((r) => c.families.includes(r.process)).length;
    ensure(7.5);
    sans(10.5, 'bold'); setText(INK);
    doc.text(pdfSafe(c.name), ML, y);
    mono(8); setText(MUT);
    doc.text(`${n} rules`, ML + 96, y);
    mono(8, true); setText(GOLD);
    doc.text(index.get(c.key) != null ? String(index.get(c.key)).padStart(2, '0') : '--', PW - MR, y, { align: 'right' });
    y += 5;
    for (const f of c.families) {
      const fn = DFM_RULES.filter((r) => r.process === f).length;
      ensure(5);
      sans(8.6); setText(BODY);
      doc.text(fit(PROCESS_FAMILIES[f], 92), ML + 6, y);
      mono(7.4); setText(MUT);
      doc.text(String(fn).padStart(2, ' '), ML + 100, y);
      doc.text(index.get(f) != null ? String(index.get(f)).padStart(2, '0') : '--', PW - MR, y, { align: 'right' });
      y += 4.3;
    }
    y += 4;
  }
  y += 2;
  setDraw(RULE_C, 0.4); doc.line(ML, y, PW - MR, y); y += 6;
  for (const [label, key] of [['Appendix A - What this book does not check', 'appA'], ['Appendix B - Threshold audit register', 'appB']]) {
    ensure(6);
    sans(9.5, 'bold'); setText(INK);
    doc.text(pdfSafe(label), ML, y);
    mono(8, true); setText(GOLD);
    doc.text(index.get(key) != null ? String(index.get(key)).padStart(2, '0') : '--', PW - MR, y, { align: 'right' });
    y += 5.6;
  }

  // ── Chapter 1: the leaderboard ─────────────────────────────────────────────
  newPage();
  collected.set('ch1', page);
  const LEADERBOARD = 40;
  sectionTitle('Chapter 1', `The ${LEADERBOARD} highest-ranked rules`);
  wrapped(`Across all ${Object.keys(PROCESS_FAMILIES).length} process families, by the composite on the previous page. If you read nothing else, read these: they are the severe, well-sourced, material-aware checks. Each is repeated in full in its own commodity chapter.`, 9, BODY, CW, 4.3);
  y += 5;

  {
    const COLS = [
      ['#', 8, 'right'],
      ['RULE', 70, 'left'],
      ['COMMODITY / PROCESS', 44, 'left'],
      ['TEST', 42, 'left'],
      ['SCORE', 14, 'right'],
    ];
    const header = () => {
      mono(6.6, true); setText(MUT);
      let x = ML;
      for (const [label, w, align] of COLS) {
        doc.text(label, align === 'right' ? x + w - 2 : x, y, { align });
        x += w;
      }
      y += 2.4;
      setDraw(RULE_C, 0.4); doc.line(ML, y, PW - MR, y); y += 4.4;
    };
    header();
    const top = RANKED.slice(0, LEADERBOARD);
    for (let i = 0; i < top.length; i++) {
      const r = top[i];
      if (y > PH - 26) { newPage(); header(); }
      const sev = SEV_COLOUR[r.severity] || MUT;
      let x = ML;
      mono(7.4, true); setText(sev);
      doc.text(String(i + 1).padStart(2, '0'), x + COLS[0][1] - 2, y, { align: 'right' });
      x += COLS[0][1];
      sans(8.4); setText(INK);
      doc.text(fit(r.title, COLS[1][1] - 3), x, y);
      x += COLS[1][1];
      sans(7.6); setText(MUT);
      doc.text(fit(PROCESS_FAMILIES[r.process], COLS[2][1] - 3), x, y);
      x += COLS[2][1];
      mono(6.8); setText(BODY);
      doc.text(fit(`${shortThreshold(r, r.threshold)} ${r.unit || ''}`.trim(), COLS[3][1] - 3), x, y);
      x += COLS[3][1];
      mono(7.4, true); setText(INK);
      doc.text(String(scoreOf(r)), x + COLS[4][1] - 2, y, { align: 'right' });
      y += 5.2;
      setDraw([234, 239, 245], 0.2); doc.line(ML, y - 1.9, PW - MR, y - 1.9);
    }
  }

  // ── The commodity chapters ─────────────────────────────────────────────────
  let chapter = 1;
  for (const c of COMMODITIES) {
    chapter += 1;
    newPage();
    collected.set(c.key, page);
    const rules = DFM_RULES.filter((r) => c.families.includes(r.process));
    sectionTitle(`Chapter ${chapter}`, c.name);
    wrapped(c.blurb, 9.4, BODY, CW, 4.5);
    y += 3;
    {
      const sev = { high: 0, medium: 0, low: 0 };
      for (const r of rules) sev[r.severity] = (sev[r.severity] || 0) + 1;
      const withMat = rules.filter((r) => r.byMaterial || r.byMaterialFamily).length;
      mono(7.2); setText(MUT);
      doc.text(fit(`${rules.length} RULES  ·  ${c.families.length} PROCESSES  ·  ${sev.high} HIGH / ${sev.medium} MEDIUM / ${sev.low} LOW  ·  ${withMat} CARRY MATERIAL-SPECIFIC THRESHOLDS`, CW), ML, y);
      y += 7;
    }

    for (const family of c.families) {
      const fam = DFM_RULES.filter((r) => r.process === family).sort((a, b) => scoreOf(b) - scoreOf(a) || a.id.localeCompare(b.id));
      if (!fam.length) continue;

      // A family heading and its first rule must not be separated by a page
      // break — a heading alone at the foot of a page reads as an empty section.
      ensure(46);
      collected.set(family, page);
      setFill(NAVY); doc.rect(ML, y - 4.6, CW, 9.4, 'F');
      sans(9.6, 'bold'); setText([255, 255, 255]);
      doc.text(fit(PROCESS_FAMILIES[family], CW - 34), ML + 3, y + 1.4);
      mono(7); setText(GOLD);
      doc.text(`${fam.length} RULES`, PW - MR - 3, y + 1.4, { align: 'right' });
      y += 12;

      for (let i = 0; i < fam.length; i++) entry(fam[i], i + 1);
      y += 4;
    }
  }

  /**
   * How tall a whole entry will be.
   *
   * Mirrors entry() line for line, so that a rule which WOULD fit on a fresh
   * page is moved there whole rather than split across the fold. A reader
   * meeting a threshold on one page and its citation on the next has to hold
   * both in their head to judge either — and the citation is the half people
   * skip. Entries taller than a page still flow; nothing can be done for those.
   */
  function entryHeight(r) {
    let h = 4.6 + 13.4;                                            // title + test panel
    h += measure(plainWords(r), 7.8, IW, 3.7) + 1.8;               // the plain-words line
    h += measure(r.rationale, 8.5, IW, 4.05) + 1.6;
    sans(8.5, 'bold');
    h += Math.max(1, doc.splitTextToSize(pdfSafe(r.fix), IW - 12).length) * 4.05 + 1.6;
    mono(6.8);
    h += doc.splitTextToSize(pdfSafe(r.source), IW - 12).length * 3.5 + 1 + 4.6;
    for (const table of [r.byMaterial, r.byMaterialFamily]) {
      const keys = Object.keys(table || {});
      if (keys.length) h += 4 + Math.ceil(keys.length / 3) * 4.1 + 1.4;
    }
    return h + 3.6;
  }

  /** One rule, as the engine holds it. */
  function entry(r, n) {
    const sev = SEV_COLOUR[r.severity] || MUT;
    const h = entryHeight(r);
    // A full page holds PH - 22 - 20 of body. Anything that fits gets a page of
    // its own rather than a fold through it; anything longer flows as normal.
    ensure(Math.min(h, PH - 42));

    mono(8.4, true); setText(GOLD);
    doc.text(String(n).padStart(2, '0'), ML, y);
    const sevW = 22;
    sans(10, 'bold'); setText(INK);
    doc.text(fit(r.title, CW - 11 - sevW), ML + 9, y);
    mono(6.4, true); setText(sev);
    doc.text(r.severity.toUpperCase(), PW - MR, y, { align: 'right' });
    y += 4.6;

    // THE TEST. This is the part a reader can check the tool against.
    setFill(PANEL); doc.rect(ML + 9, y - 3, CW - 9, 11.4, 'F');
    mono(7.8); setText(INK);
    doc.text(fit(testText(r), CW - 15), ML + 12, y + 0.8);
    mono(6.3); setText(MUT);
    const flags = [
      r.id,
      r.blocking ? 'BLOCKING' : null,
      PRICED.has(r.id) ? 'PRICED BY THE COST ENGINE' : null,
      r.measuredAt?.minDraftDeg != null ? `measured only on faces below ${r.measuredAt.minDraftDeg} deg` : null,
      r.draftCutoffDeg != null && !r.measuredAt ? `cutoff ${r.draftCutoffDeg} deg` : null,
    ].filter(Boolean).join('   ·   ');
    doc.text(fit(flags, CW - 15), ML + 12, y + 5.6);
    y += 13.4;

    // THE SAME TEST IN PLAIN WORDS — generated from the rule, so it cannot
    // disagree with the grey line above it.
    wrapped(plainWords(r), 7.8, TEAL, IW, 3.7, 'italic', IX);
    y += 1.8;

    wrapped(r.rationale, 8.5, BODY, IW, 4.05, 'normal', IX);
    y += 1.6;

    // FIX
    {
      ensure(6);
      sans(8.5, 'bold'); setText(GREEN);
      doc.text('FIX', IX, y);
      const off = 12;
      const lines = (sans(8.5), doc.splitTextToSize(pdfSafe(r.fix), IW - off));
      for (let k = 0; k < lines.length; k++) {
        ensure(5);
        sans(8.5); setText(INK);
        doc.text(lines[k], IX + off, y);
        y += 4.05;
      }
      y += 1.6;
    }

    // SOURCE and how much it is worth.
    {
      ensure(6);
      mono(6.6, true); setText(MUT);
      doc.text('SOURCE', IX, y);
      const off = 12;
      mono(6.8);
      const lines = doc.splitTextToSize(pdfSafe(r.source), IW - off);
      for (const line of lines) {
        ensure(4.4);
        mono(6.8); setText(MUT);
        doc.text(line, IX + off, y);
        y += 3.5;
      }
      y += 1;
      const status = auditOf(r.id);
      const colour = status === 'primary-read' ? GREEN : status === 'contested' ? RED : status === 'search-corroborated' ? TEAL : MUT;
      ensure(5);
      mono(6.4, true); setText(colour);
      doc.text(fit(`${GRADE_LABEL[r.sourceStatus] || r.sourceStatus}  ·  ${AUDIT_LABEL[status]}`.toUpperCase(), IW), IX, y);
      y += 4.6;
    }

    // Per-material overrides: the values, in a compact grid. Every one of these
    // carries its own citation in the catalogue, which the ANALYSIS prints for
    // the material you actually chose — reproducing 81 of them here would bury
    // the numbers a rule book exists to give you.
    for (const [label, table] of [['BY MATERIAL GRADE', r.byMaterial], ['BY MATERIAL FAMILY', r.byMaterialFamily]]) {
      const keys = Object.keys(table || {});
      if (!keys.length) continue;
      ensure(8 + Math.ceil(keys.length / 3) * 4.2);
      mono(6.4, true); setText(GOLD);
      doc.text(label, IX, y); y += 4;
      const cols = 3;
      const colW = IW / cols;
      for (let k = 0; k < keys.length; k += cols) {
        ensure(4.6);
        for (let j = 0; j < cols && k + j < keys.length; j++) {
          const key = keys[k + j];
          const x = IX + j * colW;
          const val = shortThreshold(r, table[key].threshold);
          mono(6.6, true); setText(INK);
          doc.text(val, x, y);
          const vw = doc.getTextWidth(val) + 2;
          sans(6.9); setText(BODY);
          doc.text(fit(key, colW - vw - 3), x + vw, y);
        }
        y += 4.1;
      }
      y += 1.4;
    }

    y += 3.6;
    setDraw([230, 236, 243], 0.25);
    doc.line(ML, y - 2.4, PW - MR, y - 2.4);
  }

  // ── Appendix A ─────────────────────────────────────────────────────────────
  newPage();
  collected.set('appA', page);
  sectionTitle('Appendix A', 'What this book does not check');
  wrapped('Every entry above is something the engine measures. This appendix is the other half of the truth: limits that matter to a manufacturing engineer and that this tool cannot currently evaluate honestly. Each one names what would be needed to close it and what the tool does instead in the meantime. It is here because a rule book that lists only what it can do teaches the reader to assume the rest was covered.', 9, BODY, CW, 4.4);
  y += 6;
  for (let i = 0; i < UNWRITTEN_RULES.length; i++) {
    const u = UNWRITTEN_RULES[i];
    ensure(24);
    mono(8, true); setText(GOLD);
    doc.text(String(i + 1).padStart(2, '0'), ML, y);
    sans(9.6, 'bold'); setText(INK);
    const tl = doc.splitTextToSize(pdfSafe(u.topic), CW - 11);
    for (const line of tl) { sans(9.6, 'bold'); setText(INK); doc.text(line, ML + 9, y); y += 4.6; }
    y += 0.6;
    wrapped(u.needs, 8.4, BODY, CW - 9, 4, 'normal', ML + 9);
    y += 1;
    // A bare "MEANWHILE" with nothing after it would read as a lost line rather
    // than as "there is no proxy" — which is what an empty one actually means.
    if (u.proxy && u.proxy.trim()) {
      labelledPara('MEANWHILE', AMBER, u.proxy, ML + 9, CW - 9, 8.2, 4, 3);
    } else {
      mono(6.4, true); setText(RED);
      doc.text('NO PROXY - THE ENGINE REPORTS NOTHING IN THIS AREA', ML + 9, y);
      y += 4;
    }
    y += 5;
    setDraw([230, 236, 243], 0.25); doc.line(ML, y - 2.6, PW - MR, y - 2.6);
  }

  // ── Appendix B ─────────────────────────────────────────────────────────────
  newPage();
  collected.set('appB', page);
  sectionTitle('Appendix B', 'Threshold audit register');
  wrapped(`The catalogue grades its citations, but a grade is a claim about a source rather than a record that anybody opened it. This is that record. ${Object.keys(AUDIT).length} of ${DFM_RULES.length} thresholds have been through it so far; the rest are marked NOT YET AUDITED on their own entries, and that is the honest state of them. Run "node scripts/threshold-audit.mjs" for the live work list.`, 9, BODY, CW, 4.4);
  y += 6;

  const order = { contested: 0, 'primary-read': 1, 'search-corroborated': 2, unaudited: 3 };
  const audited = Object.entries(AUDIT).sort((a, b) => (order[a[1].status] ?? 9) - (order[b[1].status] ?? 9));
  for (const [id, a] of audited) {
    const rule = DFM_RULES.find((r) => r.id === id);
    ensure(26);
    const colour = a.status === 'primary-read' ? GREEN : a.status === 'contested' ? RED : a.status === 'search-corroborated' ? TEAL : MUT;
    mono(6.6, true); setText(colour);
    doc.text((AUDIT_LABEL[a.status] || a.status).replace(' - SEE APPENDIX B', ''), ML, y);
    y += 4.2;
    sans(9.4, 'bold'); setText(INK);
    doc.text(fit(rule ? rule.title : id, CW), ML, y); y += 4;
    mono(6.4); setText(MUT);
    doc.text(fit(`${id}   ·   ${rule ? PROCESS_FAMILIES[rule.process] : 'rule no longer in the catalogue'}`, CW), ML, y);
    y += 5;
    if (a.finding) { wrapped(a.finding, 8.3, BODY, CW, 4); y += 1; }
    if (a.recommendation) {
      ensure(6);
      mono(6.4, true); setText(GOLD);
      doc.text('RECOMMENDATION', ML, y);
      const off = 30;
      const lines = (sans(8.3), doc.splitTextToSize(pdfSafe(a.recommendation), CW - off));
      for (const line of lines) { ensure(5); sans(8.3); setText(BODY); doc.text(line, ML + off, y); y += 4; }
    }
    if (a.blockedBy) {
      ensure(5);
      mono(6.4); setText(AMBER);
      doc.text(fit(`BLOCKED BY: ${a.blockedBy}`.toUpperCase(), CW), ML, y);
      y += 4.4;
    }
    y += 4;
    setDraw([230, 236, 243], 0.25); doc.line(ML, y - 2.6, PW - MR, y - 2.6);
  }

  return { doc, collected, pages: page };
}

// Two passes: the first collects the page each chapter starts on, the second
// prints them into the contents. The contents page is a fixed number of rows,
// so nothing shifts between the two.
const first = build(new Map());
const second = build(first.collected);
if (second.pages !== first.pages) {
  console.error(`Pagination moved between passes (${first.pages} -> ${second.pages}); contents page numbers would be wrong.`);
  process.exit(1);
}
writeFileSync(OUT, Buffer.from(second.doc.output('arraybuffer')));
console.log(`${OUT}\n${DFM_RULES.length} rules · ${Object.keys(PROCESS_FAMILIES).length} families · ${COMMODITIES.length} commodities · ${second.pages} pages`);
