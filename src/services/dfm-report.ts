// ─────────────────────────────────────────────────────────────────────────────
// BrainSpark DFM / DFA report — PDF + Excel.
//
// Same house discipline as innovation-report.ts: navy/gold, BrainSpark mark on
// the cover and every footer, WinAnsi-sanitised once up front, measured wrapping
// and explicit ensure() pagination so nothing is silently clipped.
//
// What makes this report different from a checklist is that it prints THREE
// states for every rule — failed, passed, and NOT EVALUATED — and prints the
// coverage percentage next to the score. A DFM report that lists only failures
// invites the reader to assume everything else was checked and was fine. Several
// rules could not be checked at all, and saying so is the difference between a
// tool a cost engineer trusts twice and one they trust once.
//
// Likewise every finding carries either an engine-computed cost delta or an
// explicit "not priced" with the reason. A currency figure in this document was
// produced by costing-engine.mjs or machining-feature-cost.mjs; the AI does not
// contribute a single number to it.
// ─────────────────────────────────────────────────────────────────────────────
import jsPDF from 'jspdf';
import { pdfSafe, deepPdfSafe } from './pdf-safe.mjs';
import { LOGO_PNG } from './brainspark-logo-png';
import { buildActions } from './dfm-actions.mjs';
import { downloadXlsx, type SheetSpec } from './xlsx-write';

export interface DfmFinding {
  id: string;
  title: string;
  severity: 'high' | 'medium' | 'low';
  measure: string;
  measured?: number;
  unit: string;
  thresholdText: string;
  rationale: string;
  fix: string;
  source: string;
  sourceStatus?: string;
  status: 'fail' | 'pass' | 'not-evaluated';
  reason?: string;
  /** Whether this threshold was resolved for the chosen alloy, its family, or
   *  not at all. A generic band must not read like a material-specific one. */
  thresholdBasis?: 'material' | 'material-family' | 'process-generic' | 'customer-standard';
  thresholdMatchedOn?: string | null;
  /** The material that WAS in play when the threshold was resolved, whether or
   *  not the rule had a band for it. Without this a generic band cannot tell
   *  "you gave no alloy" apart from "this rule is alloy-independent". */
  thresholdMaterial?: string | null;
  /** Where the MEASURED side came from — set only on rules that read the PMI
   *  tolerance, so no other finding carries a stray provenance claim. */
  measuredBasis?: string;
  /** The features that break this rule, worst first. A finding that says
   *  "max depth/dia is 8.2" sends a supplier hunting; one that names the hole
   *  and its coordinates is a review document. */
  instances?: Array<{
    ratio?: number; diaMm?: number; depthMm?: number; count?: number;
    thicknessMm?: number; heightMm?: number;
    atXYZ?: number[] | null;
  }>;
  instanceCount?: number;
  instanceTotal?: number;
  cost?: {
    priced: boolean;
    basis?: string;
    changeDescription?: string;
    asDrawnEur?: number;
    improvedEur?: number;
    deltaEur?: number;
    annualDeltaEur?: number;
    reason?: string;
    externalGuideline?: string;
    upperBound?: boolean;
    caveat?: string;
  };
}

export interface DfmProcessResult {
  process: string;
  processName: string;
  findings: DfmFinding[];
  passed: DfmFinding[];
  notEvaluated: DfmFinding[];
  ruleCount: number;
  evaluatedCount: number;
  coveragePct: number;
  score: number | null;
  impact?: { pricedCount: number; unpricedCount: number; perPartEur: number; annualEur: number; caveat: string | null };
}

export interface AnalysisLimit { kind: string; severity: 'blocking' | 'warning'; message: string }

/**
 * A rendered view of the part with its findings located on it.
 *
 * `callouts` carry NORMALISED 0..1 coordinates measured against the same camera
 * that produced `dataUri`, so the marker lands on the face that caused the
 * finding. They are drawn as VECTOR over the raster, which keeps callout text
 * sharp at print resolution instead of upscaling screen pixels — and is forced
 * anyway, because the viewer's own labels are DOM and never appear in a WebGL
 * capture.
 */
export interface DfmFigure {
  id: string;
  view: string;
  /**
   * `hero` is the reference picture of the part — printed LARGE on page one and
   * deliberately UNMARKED, so a reader sees the part before any judgement is
   * laid over it. `evidence` is the same render with the findings marked on it.
   * The ISO capture serves as both: the markers are vector, so the one raster is
   * drawn twice with and without them rather than captured twice.
   */
  role?: 'hero' | 'evidence' | 'section';
  /** For a section figure: the finding the cut was made for. */
  sectionOf?: string;
  /** JPEG/PNG data URI straight from the viewer. */
  dataUri: string;
  width: number;
  height: number;
  callouts: Array<{
    n: number;
    /** 0..1 from the left / top of the image. */
    x: number;
    y: number;
    label: string;
    value?: string;
    severity?: string;
    /** Which instance the ring sits on — "worst of 34", "largest of 3 pockets". */
    note?: string;
  }>;
}

export interface DfmReportData {
  partName?: string;
  analysisLimits?: AnalysisLimit[];
  processFamily?: string | null;
  processFamilyBasis?: string;
  /** What the geometry itself says the process is — published whether or not it
   *  was the family the rules ran against. */
  measuredProcess?: {
    family?: string | null;
    confidence?: 'measured' | 'indicative' | null;
    evidence?: string[];
    notes?: string[];
  } | null;
  /** Which features actually break a rule — diameter, depth, count, where. */
  // (declared on DfmFinding below)
  /** Set when a NAMED process contradicts the measured geometry. */
  processConflict?: {
    chosenName: string;
    measuredName: string;
    evidence: string[];
  } | null;
  /** Impossible material/process pair, caught server-side. */
  materialProcessConflict?: { material: string; process: string; message: string } | null;
  /** Set when the chosen process shapes nothing, so there are no findings. */
  noDfmRulesReason?: string | null;
  /** Company standards in force for this analysis, keyed by rule id. */
  ruleOverrides?: Record<string, { enabled: boolean; threshold?: number | number[]; note?: string }> | null;
  /**
   * Where the chosen route's money goes — computeShouldCost's breakdown,
   * largest driver first, with the physical levers behind the rows.
   */
  costDrivers?: {
    process: string; totalEur: number;
    rows: Array<{ driver: string; eur: number; pct: number }>;
    dominant: { driver: string; eur: number; pct: number } | null;
    inputMassKg: number | null; cycleSecPerPart: number | null;
    scrapPct: number | null; toolingTotalEur: number | null;
    basis: string;
  } | null;
  /** Every viable route for this material, judged and priced from one measurement. */
  routes?: {
    routes: Array<{
      process: string; dfmFamilyName: string | null;
      score: number | null; coveragePct: number; evaluatedCount: number; ruleCount: number;
      findingCount: number; highSeverityCount: number; scoreCaveat?: string | null;
      piecePriceEur: number | null; toolingEur: number | null; inputMassKg: number | null;
      kgCo2e: number | null; cbamEur: number | null; costReason?: string; carbonReason?: string;
      /** True on the ONE row the user actually selected. */
      isChosen?: boolean;
      /** False when a FEASIBILITY rule failed: the route cannot make this part at all. */
      viable?: boolean; blockedReason?: string | null;
      /**
       * False when the process FINISHES a part rather than producing one —
       * broaching, wire EDM, gun drilling. Still priced and judged, never
       * recommended as an alternative way to make the part.
       */
      netShape?: boolean; secondaryReason?: string | null;
      /** Piece-price and tooling difference against the chosen route, when there is one. */
      deltaPieceEur?: number | null; deltaToolingEur?: number | null;
    }>;
    skipped: Array<{ process: string; reason: string }>;
    basis: string;
    /** The route the user chose, so the table can mark it rather than reading as a survey. */
    chosenProcess?: string | null;
  } | null;
  material?: string | null;
  /** Rule-catalogue provenance, counted server-side. */
  catalogue?: { total: number; byGrade: Record<string, number> } | null;
  /** Apertures read from the topology — holes that are not cylinders. */
  fileName?: string;
  geometry?: Record<string, unknown>;
  dfm?: Record<string, unknown>;
  results: DfmProcessResult[];
  dfa?: Record<string, unknown> | null;
  subject?: { part?: string; system?: string; material?: string; process?: string };
  /** The 2D drawing extraction (AI-read, engineer-reviewed), when one was uploaded. */
  drawing?: {
    ok: boolean; units: string; readability: string; conversions: string[];
    dimensions: Array<{ nominalMm: number; bandMm?: number; type: string; toleranced: boolean; sheet?: number; zone?: string; sourceText: string }>;
    gdt: Array<{ symbol: string; toleranceMm?: number; datums: string[]; sourceText: string }>;
    roughness: Array<{ raUm?: number; raUin?: number; scope?: string; sourceText: string }>;
    titleBlock: { material?: string; generalToleranceNote?: string; drawingNumber?: string; revision?: string; title?: string };
    overall?: { widthMm?: number; heightMm?: number; thicknessMm?: number };
    notes: string[]; pageCount?: number;
  } | null;
  /** Deterministic reconciliation of the drawing against the 3D model. */
  drawingCheck?: {
    rows: Array<{ nominalMm: number; bandMm?: number; type: string; sourceText: string; status: string; candidate: { kind: string; valueMm: number; deltaMm: number } | null; note: string }>;
    counts: { confirmed: number; conflict: number; notFound: number };
    unitsSuspect: boolean; basis: string;
  } | null;
  /** Which rule inputs the drawing supplied instead of the engineer. */
  drawingApplied?: string[] | null;
  /** The model's own AP242 PMI block, when the drawing displaced it. */
  modelPmi?: Record<string, unknown> | null;
}

type RGB = readonly [number, number, number];
const NAVY: RGB = [13, 31, 51];
const GOLD: RGB = [245, 158, 11];
const INK: RGB = [17, 24, 39];
const BODY: RGB = [55, 65, 81];
const MUT: RGB = [107, 114, 128];
const RULE: RGB = [214, 222, 233];
const PANEL: RGB = [244, 247, 251];
const GREEN: RGB = [4, 120, 87];
const AMBER: RGB = [180, 83, 9];
const RED: RGB = [185, 28, 28];
const TEAL: RGB = [13, 148, 136];

const SEV: Record<string, RGB> = { high: RED, medium: AMBER, low: TEAL };

/** A unit short enough for the summary table. Dropping the unit entirely made
 *  the table read "30" and "41.2", which is a figure nobody can use; keeping it
 *  in full made "41.2 % of wall area" truncate to "41.2 % of wal...". The head
 *  of each unit is the part that carries the meaning. */
function shortUnit(unit?: string): string {
  if (!unit) return '';
  const u = unit.trim();
  if (u.startsWith('%')) return '%';
  if (u.includes('L/D')) return 'L/D';
  if (u.startsWith('mm')) return 'mm';
  if (u === 'regions') return 'reg';
  if (u.includes('/')) return u.split(' ')[0];          // r/t, gap/t, depth/width
  return u.length <= 6 ? u : u.split(' ')[0];
}

/** A threshold short enough for the summary table: the comparison, the number
 *  and an abbreviated unit. The detail page prints it in full. */
function shortThreshold(f: { thresholdText?: string; unit?: string }): string {
  const t = f.thresholdText ?? '';
  if (!t) return '—';
  const bare = (f.unit && t.endsWith(f.unit) ? t.slice(0, -f.unit.length) : t).trim();
  return bare ? `${bare} ${shortUnit(f.unit)}`.trim() : t;
}

// How much a threshold is actually worth. Printing "SOURCE:" beside a number
// nobody audited is a claim this tool has not earned — the same failure it calls
// out everywhere else — so the grade travels with the citation. 24 of the 26
// rules are industry consensus: widely published, mutually consistent, and not
// checked against a primary standard or any measured scrap data.
const VIEW_LABEL: Record<string, string> = {
  iso: 'Isometric', front: 'Front', back: 'Back', top: 'Top',
  bottom: 'Bottom', right: 'Right', left: 'Left',
};

const FAMILY_LABEL: Record<string, string> = {
  machining: 'machined (CNC mill/turn)',
  'injection-moulding': 'injection moulded',
  hpdc: 'high-pressure die cast',
  'sheet-metal': 'sheet metal / stamped',
};

const SOURCE_GRADE: Record<string, string> = {
  'standard-named': 'NAMED STANDARD, not read first-hand',
  'industry-consensus': 'INDUSTRY CONSENSUS, no primary source audited',
  'engine-derived': "THIS TOOL'S OWN COST MODEL",
  // A company standard outranks a published guideline AND is a stronger claim,
  // because someone accountable put their name to it. Printing it under the
  // original citation would credit a handbook for a number it never gave.
  'customer-standard': 'YOUR COMPANY STANDARD, set in this workspace',
};

const setFill = (d: jsPDF, c: RGB) => d.setFillColor(c[0], c[1], c[2]);
const setText = (d: jsPDF, c: RGB) => d.setTextColor(c[0], c[1], c[2]);
const setDraw = (d: jsPDF, c: RGB, w = 0.3) => { d.setDrawColor(c[0], c[1], c[2]); d.setLineWidth(w); };
const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-');
const eur = (n: number | undefined) => (Number.isFinite(n as number) ? `EUR ${(n as number).toLocaleString('en-GB', { maximumFractionDigits: 2 })}` : '—');

function fit(doc: jsPDF, text: string, max: number): string {
  // Sanitise at the DRAW boundary, not just on the input data. deepPdfSafe
  // cleans what the caller passed in, but every label and template literal in
  // this file is composed here — an arrow or a Greek letter typed into one of
  // them never sees pdfSafe and jsPDF silently falls back to UTF-16, which
  // renders as letter-spaced garbage running off the right margin. That is
  // exactly what a "→" in the cost line did.
  const t = pdfSafe(text);
  if (doc.getTextWidth(t) <= max) return t;
  let s = t;
  while (s.length > 1 && doc.getTextWidth(`${s}...`) > max) s = s.slice(0, -1);
  return `${s.trimEnd()}...`;
}

/**
 * What the marker selection could NOT do, so the report can say it.
 *
 * A picture with six rings on it looks complete. If four more findings existed
 * and simply had nowhere to point, the reader has no way to know unless the
 * report tells them — which is the difference between a limit that was declared
 * and a limit that was hidden.
 */
/** A revision comparison, produced by dfm-diff.mjs. Absent on a first analysis. */
export interface DfmDiff {
  headline: string;
  counts: { closed: number; created: number; persisting: number; nowVisible: number; nowBlind: number };
  score: { before: number | null; after: number | null };
  money: { closedAnnualEur: number; createdAnnualEur: number };
  closed: Array<{ title: string; severity: string; was: number | null; now: number | null; unit?: string; how: string; annualFreed: number }>;
  created: Array<{ title: string; severity: string; measured: number | null; unit?: string; thresholdText?: string; annual: number; wasPassing: boolean }>;
  persisting: Array<{ title: string; severity: string; was: number | null; now: number | null; unit?: string; delta: number | null }>;
  nowVisible: Array<{ title: string; severity: string; reason: string }>;
  nowBlind: Array<{ title: string; reason: string }>;
  warnings?: string[];
  baselineLabel?: string;
}

export interface DfmFigureNotes {
  /** Findings with no place on the model, each with the reason. */
  notLocated?: Array<{ id: string; title: string; severity: string; reason: string }>;
  /** Findings that WERE locatable but fell past the marker cap. */
  droppedByCap?: number;
  /** How many markers the selection produced. */
  markable?: number;
  /** Why there is no picture at all, when there is none. */
  captureError?: string;
}

export function exportDfmPdf(
  dataIn: DfmReportData,
  figures: DfmFigure[] = [],
  figureNotes: DfmFigureNotes = {},
  diff: DfmDiff | null = null,
): void {
  // Provenance counted by the SERVER that ran the rules and sent with the
  // analysis, so the sentence describing the catalogue cannot fall out of date
  // the way "24 of the 26 rules" did — it said that on every report long after
  // the catalogue reached 111. Counting here would mean bundling the whole
  // catalogue into the browser for one sentence.
  const gradeCounts: Record<string, number> = dataIn.catalogue?.byGrade ?? {};
  const totalCatalogueRules = dataIn.catalogue?.total
    ?? Object.values(gradeCounts).reduce((a, b) => a + b, 0);
  // ABSENT IS NOT ZERO.
  //
  // The appendix paragraph read each grade as `?? 0`, so an analysis that
  // arrived without the server's catalogue counts printed "0 of 216 rest on
  // industry consensus; 0 name a published standard" — three confident zeros
  // that are the opposite of the truth, in the one paragraph whose subject is
  // how far a reader should trust these numbers. It is the same
  // `Number(null) === 0` trap this codebase has a rule against, and it survived
  // because the QA fixture never carried a catalogue block either.
  const haveGrades = Object.keys(gradeCounts).length > 0 && totalCatalogueRules > 0;
  // FIGURES ARE A SEPARATE ARGUMENT ON PURPOSE. deepPdfSafe walks every string
  // in `dataIn` character by character with rope concatenation; a megabyte of
  // base64 through that loop would visibly jank the export, and any non-string
  // image payload would be silently rebuilt as a plain object and destroyed.
  // Image data never enters the sanitiser — only its short labels do.
  const data: DfmReportData = deepPdfSafe(dataIn);
  const subject = pdfSafe(data.partName || data.fileName || 'Part');
  const today = new Date().toISOString().split('T')[0];

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, ML = 16, MR = 16;
  const CW = PW - ML - MR;
  let page = 1;
  let y = 0;

  const sans = (s = 10, st: 'normal' | 'bold' | 'italic' = 'normal') => { doc.setFont('helvetica', st); doc.setFontSize(s); };
  const mono = (s = 8, b = false) => { doc.setFont('courier', b ? 'bold' : 'normal'); doc.setFontSize(s); };

  function footer() {
    setDraw(doc, RULE, 0.3);
    doc.line(ML, PH - 13, PW - MR, PH - 13);
    doc.addImage(LOGO_PNG, 'PNG', ML, PH - 10.6, 5.5, 5.5);
    mono(7); setText(doc, MUT);
    doc.text(fit(doc, `BrainSpark DFM / DFA  |  ${subject}`, CW - 18), ML + 8, PH - 7);
    doc.text(String(page).padStart(2, '0'), PW - MR, PH - 7, { align: 'right' });
  }
  function newPage() { doc.addPage(); page += 1; y = 22; footer(); }
  function ensure(h: number) { if (y + h > PH - 20) newPage(); }

  function wrapped(text: string, size = 9.2, colour: RGB = BODY, width = CW, lh = 4.2, style: 'normal' | 'bold' | 'italic' = 'normal', x = ML) {
    sans(size, style); setText(doc, colour);
    // Sanitised here too — see fit(). Composed strings in this file bypass the
    // deepPdfSafe applied to the caller's data.
    const lines: string[] = doc.splitTextToSize(pdfSafe(text), width);
    for (const line of lines) {
      ensure(lh + 1);
      // Re-assert the font on EVERY line. ensure() can break to a new page, and
      // footer() switches to Courier on its way out — so without this the rest of
      // a paragraph draws in a wider font than it was measured in and runs off
      // the right margin. Cheap, and it makes wrapping immune to anything
      // pagination does to the graphics state.
      sans(size, style); setText(doc, colour);
      doc.text(line, x, y);
      y += lh;
    }
  }
  /** Height a wrapped block will occupy, without drawing it. */
  function measure(text: string, size: number, width: number, lh: number, style: 'normal' | 'bold' | 'italic' = 'normal') {
    sans(size, style);
    return (doc.splitTextToSize(pdfSafe(text), width) as string[]).length * lh;
  }
  function sectionTitle(kicker: string, title: string) {
    ensure(18);
    mono(7, true); setText(doc, GOLD);
    doc.text(kicker.toUpperCase(), ML, y); y += 4.6;
    sans(14, 'bold'); setText(doc, INK);
    doc.text(fit(doc, title, CW), ML, y); y += 3;
    setDraw(doc, RULE, 0.4); doc.line(ML, y, PW - MR, y); y += 6;
  }

  const allFindings = data.results.flatMap(r => r.findings);
  const totalUnevaluated = data.results.reduce((s, r) => s + r.notEvaluated.length, 0);
  const totalRules = data.results.reduce((s, r) => s + r.ruleCount, 0);
  const totalEvaluated = data.results.reduce((s, r) => s + r.evaluatedCount, 0);
  const pricedTotal = data.results.reduce((s, r) => s + (r.impact?.annualEur || 0), 0);
  // Is that headline figure a CEILING? A tile reading a clean six-figure number
  // is what a reader carries out of the room, and the caveat explaining that it
  // assumes the most aggressive redesign available sits three pages away. Where
  // an upper-bound finding contributes, the label says so at the top.
  const hasUpperBound = data.results.some(r => r.findings.some(f => f.cost?.upperBound));

  // ── Cover ──────────────────────────────────────────────────────────────────
  setFill(doc, NAVY); doc.rect(0, 0, PW, 56, 'F');
  setFill(doc, GOLD); doc.rect(0, 56, PW, 1.4, 'F');
  doc.addImage(LOGO_PNG, 'PNG', ML, 13, 13, 13);
  sans(9); setText(doc, [226, 232, 240]);
  doc.text('B R A I N S P A R K', ML + 17, 17.5);
  sans(24, 'bold'); setText(doc, [255, 255, 255]);
  doc.text('DFM / DFA Analysis', ML + 17, 26.5);
  sans(12); doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
  doc.text(fit(doc, subject, CW - 20), ML + 17, 34.5);
  mono(8); setText(doc, [148, 163, 184]);
  const sub = [data.subject?.system, data.subject?.material, data.subject?.process].filter(Boolean).join('  ·  ');
  if (sub) doc.text(fit(doc, sub.toUpperCase(), CW - 20), ML + 17, 43);
  doc.text(`GENERATED ${today}  ·  ${totalEvaluated}/${totalRules} RULES EVALUATED`, ML + 17, 49);
  y = 68;
  footer();

  // The coloured tile row that used to sit here has gone. The executive summary
  // below states the same four figures, and a reader met them TWICE on one page
  // in two different visual languages — which is how a report starts to look
  // like a dashboard someone decorated rather than a result someone computed.


  // ── EXECUTIVE SUMMARY ─────────────────────────────────────────────────────
  //
  // WHAT A MANUFACTURING HEAD OPENS THE REPORT FOR. Page one used to carry
  // three paragraphs of methodology, a provenance essay and a ten-row geometry
  // table before a single finding — a reader told us plainly "I am not
  // understanding the report", and that ordering is why. Method belongs at the
  // back of an engineering report, not in front of the answer.
  //
  // The order here is the order the questions get asked: which route is this,
  // how did it score, what is wrong with it, what does it cost, and how much of
  // the catalogue actually ran.
  {
    const ran = data.results.filter(r => r.ruleCount > 0);
    const one = ran.length === 1 ? ran[0] : null;

    mono(7, true); setText(doc, GOLD);
    doc.text('EXECUTIVE SUMMARY', ML, y); y += 5.4;

    // The route, in one line, with the material and the ruleset that judged it.
    sans(11, 'bold'); setText(doc, INK);
    doc.text(fit(doc, one
      ? `${data.subject?.process ?? one.processName}${data.material ? ` · ${data.material}` : ''}`
      : `${ran.length} rule families run speculatively`, CW), ML, y);
    y += 5;
    sans(9); setText(doc, MUT);
    doc.text(fit(doc, one
      ? `Judged against the ${one.processName} ruleset — ${one.evaluatedCount} of ${one.ruleCount} rules could be evaluated on this geometry.`
      : 'No single process was settled, so some findings below are for a route this part will never take.', CW), ML, y);
    y += 8;

    // ── THE VERDICT TABLE ───────────────────────────────────────────────────
    // Four figures on one rule, in tabular numerals. The coloured blocks that
    // used to sit here read as a dashboard widget rather than as a result.
    const score = one ? one.score : null;
    const cells: [string, string, RGB][] = [
      [score == null ? 'not scored' : `${score}`, 'MANUFACTURABILITY', score == null ? MUT : score >= 80 ? GREEN : score >= 50 ? AMBER : RED],
      [`${allFindings.length}`, 'FINDINGS', allFindings.length ? INK : GREEN],
      [`${allFindings.filter(f => f.severity === 'high').length}`, 'HIGH SEVERITY', allFindings.some(f => f.severity === 'high') ? RED : GREEN],
      [pricedTotal ? eur(pricedTotal).replace('EUR ', '€') : 'none priced',
        hasUpperBound ? 'PRICED / YR (CEILING)' : 'PRICED / YEAR', pricedTotal ? GREEN : MUT],
    ];
    setFill(doc, PANEL); doc.roundedRect(ML, y - 5, CW, 20, 1.5, 1.5, 'F');
    const cw4 = CW / 4;
    cells.forEach(([v, l, c], i) => {
      const x = ML + 5 + i * cw4;
      if (i > 0) { setDraw(doc, RULE, 0.3); doc.line(ML + i * cw4, y - 3, ML + i * cw4, y + 12); }
      sans(v.length > 9 ? 11 : 15, 'bold'); setText(doc, c);
      doc.text(fit(doc, v, cw4 - 8), x, y + 3);
      mono(5.6); setText(doc, MUT);
      doc.text(fit(doc, l, cw4 - 8), x, y + 9.5);
    });
    y += 22;

    // ── THE PART ITSELF ─────────────────────────────────────────────────────
    //
    // A DFM report that never shows the part is asking a reader to hold a shape
    // in their head while being told what is wrong with it. Every commercial
    // tool in this space puts the model on the summary page and this one did
    // not — the only renders were three pages of marked-up views near the back,
    // which a reader reaches after forming their opinion, if at all.
    //
    // DELIBERATELY UNMARKED. This is the reference view: what the part IS,
    // before any judgement is drawn on top of it. The marked copy comes later,
    // under 'Located evidence', where the reader is ready to read rings.
    {
      const hero = figures.find(f => f.role === 'hero') ?? figures.find(f => f.view === 'iso') ?? figures[0];
      // 92 x up-to-130 mm — about a third of the text column. Sized by eye on a
      // rasterised page rather than picked as a round number: at 76 mm the part
      // read as a thumbnail beside the numbers rather than as the subject of the
      // page, which is the whole reason it is here.
      const heroH = 92;
      const heroW = hero && hero.height > 0
        ? Math.min(130, heroH * (hero.width / hero.height))
        : 130;
      const heroX = ML;
      // The envelope beside the picture, not under it — the page is 182 mm wide
      // and a 118 mm image leaves a column that would otherwise be white space.
      // Five lines of reference data, the numbers a reader checks against their
      // own drawing before trusting anything else in the document.
      const asideX = heroX + heroW + 8;
      const asideW = CW - heroW - 8;

      mono(7, true); setText(doc, GOLD);
      doc.text('THE PART', ML, y); y += 4.6;

      if (hero?.dataUri) {
        try {
          doc.addImage(hero.dataUri, hero.dataUri.includes('image/png') ? 'PNG' : 'JPEG',
            heroX, y, heroW, heroH);
        } catch {
          setFill(doc, PANEL); doc.rect(heroX, y, heroW, heroH, 'F');
          sans(8.6); setText(doc, MUT);
          doc.text('The 3D view could not be embedded.', heroX + 5, y + heroH / 2);
        }
      } else {
        // NO PICTURE IS ITSELF A RESULT. This used to be silent: the figure
        // section simply did not render and the reader could not tell "nothing
        // to show" from "the capture broke". A labelled box, with the reason.
        setFill(doc, PANEL); doc.rect(heroX, y, heroW, heroH, 'F');
        setDraw(doc, RULE, 0.3); doc.rect(heroX, y, heroW, heroH);
        sans(9, 'bold'); setText(doc, AMBER);
        doc.text('No 3D view was captured', heroX + 6, y + heroH / 2 - 3);
        sans(8); setText(doc, MUT);
        const why = figureNotes.captureError
          || 'The report was generated without an open 3D view.';
        doc.text(doc.splitTextToSize(pdfSafe(`${why} The analysis below is unaffected — it is measured from the solid, not from the picture.`), heroW - 12),
          heroX + 6, y + heroH / 2 + 2);
      }
      setDraw(doc, RULE, 0.3); doc.rect(heroX, y, heroW, heroH);

      const gh = (data.geometry || {}) as Record<string, any>;
      const aside: Array<[string, string]> = [
        ['ENVELOPE', gh.boundingBox ? `${gh.boundingBox.xMm} x ${gh.boundingBox.yMm} x ${gh.boundingBox.zMm} mm` : '—'],
        ['VOLUME', gh.volume?.cm3 != null ? `${gh.volume.cm3} cm3` : '—'],
        ['SURFACE', gh.surfaceArea?.cm2 != null ? `${gh.surfaceArea.cm2} cm2` : '—'],
        ['FACES', gh.faces?.total != null ? `${gh.faces.total}` : '—'],
        ['VIEW', hero ? `${VIEW_LABEL[hero.view] ?? hero.view}, part axes` : '—'],
      ];
      // Spread down the full height of the picture rather than stacked at its
      // top, so the two halves of the band end together instead of leaving a
      // third of the column blank.
      const step = (heroH - 6) / aside.length;
      aside.forEach(([k, v], i) => {
        const ay = y + 4 + i * step;
        mono(5.6); setText(doc, MUT);
        doc.text(k, asideX, ay);
        sans(8.6); setText(doc, INK);
        doc.text(fit(doc, v, asideW), asideX, ay + 4.4);
      });
      y += heroH + 6;
    }

    // ── PRIORITISED FINDINGS TABLE ──────────────────────────────────────────
    // The thing the report exists to deliver, on page one, sorted worst first.
    // Everything below this page is the evidence for these rows.
    if (allFindings.length) {
      mono(7, true); setText(doc, GOLD);
      doc.text('WHAT IS WRONG, WORST FIRST', ML, y); y += 5;

      // Widths sum to the full measure. The first version summed to 166 of 182
      // and truncated four of five columns on the very first render.
      const cols = [
        { w: 17, label: '', align: 'left' as const },
        { w: 75, label: 'Finding', align: 'left' as const },
        { w: 30, label: 'Measured', align: 'right' as const },
        { w: 32, label: 'Guideline', align: 'right' as const },
        { w: CW - 17 - 75 - 30 - 32, label: 'Impact / yr', align: 'right' as const },
      ];
      mono(5.8); setText(doc, MUT);
      let hx = ML;
      for (const c of cols) {
        doc.text(c.label.toUpperCase(), c.align === 'right' ? hx + c.w - 2 : hx, y, { align: c.align });
        hx += c.w;
      }
      y += 2;
      setDraw(doc, RULE, 0.4); doc.line(ML, y, PW - MR, y); y += 4.5;

      const ordered = [...allFindings].sort((a, b) => {
        const rank = (f: DfmFinding) => (f.severity === 'high' ? 0 : f.severity === 'medium' ? 1 : 2);
        return rank(a) - rank(b) || (b.cost?.annualDeltaEur ?? 0) - (a.cost?.annualDeltaEur ?? 0);
      });
      for (const f of ordered.slice(0, 8)) {
        ensure(8);
        const sc = SEV[f.severity] ?? MUT;
        // The severity as a filled chip, so the eye sorts the table before
        // reading a word of it.
        setFill(doc, sc); doc.roundedRect(ML, y - 3.2, 13, 4.4, 0.8, 0.8, 'F');
        mono(5); setText(doc, [255, 255, 255]);
        doc.text(f.severity.toUpperCase(), ML + 6.5, y, { align: 'center' });

        let x = ML + cols[0].w;
        sans(8.4); setText(doc, INK);
        doc.text(fit(doc, f.title, cols[1].w - 3), x, y); x += cols[1].w;
        mono(7.6); setText(doc, sc);
        // The NUMBER, not the number plus a unit that will not fit. "41.2 % of
        // wall area" truncated to "41.2 % of wal..." on the first render, which
        // is a figure a reader cannot use. The unit is on the detail page.
        doc.text(fit(doc, `${f.measured ?? '—'} ${shortUnit(f.unit)}`.trim(), cols[2].w - 3), x + cols[2].w - 2, y, { align: 'right' }); x += cols[2].w;
        mono(7.6); setText(doc, MUT);
        doc.text(fit(doc, shortThreshold(f), cols[3].w - 3), x + cols[3].w - 2, y, { align: 'right' }); x += cols[3].w;
        mono(7.6); setText(doc, f.cost?.annualDeltaEur ? GREEN : MUT);
        doc.text(f.cost?.annualDeltaEur ? eur(f.cost.annualDeltaEur).replace('EUR ', '€') : 'not priced',
          x + cols[4].w - 2, y, { align: 'right' });
        y += 5.6;
        setDraw(doc, RULE, 0.15); doc.line(ML, y - 2, PW - MR, y - 2);
      }
      if (ordered.length > 8) {
        mono(6.4); setText(doc, MUT);
        doc.text(`+ ${ordered.length - 8} more, in full from page 3`, ML, y + 1);
        y += 4;
      }
      y += 4;
    } else {
      setFill(doc, [236, 253, 245]); doc.roundedRect(ML, y - 4, CW, 13, 1.5, 1.5, 'F');
      sans(9.5, 'bold'); setText(doc, GREEN);
      doc.text(one && one.evaluatedCount > 0
        ? `No rule breached across the ${one.evaluatedCount} checks that could be evaluated.`
        : 'No finding — and no rule could be evaluated either, so this is not a clean sheet.',
        ML + 4, y + 3.5);
      y += 16;
    }

    // COVERAGE, immediately under the verdict rather than buried. A score over
    // four of nine rules is not the same claim as a score over nine of nine.
    if (one) {
      const pct = one.coveragePct;
      mono(6.4); setText(doc, pct >= 80 ? MUT : AMBER);
      doc.text(fit(doc, `RULE COVERAGE ${pct}%  —  ${one.evaluatedCount} of ${one.ruleCount} evaluated, `
        + `${one.notEvaluated.length} could not be measured on this geometry and are NOT passes.`, CW), ML, y);
      y += 6;
    }
  }

  // Analysis limits — before the numbers, not after. A reader who sees a wall
  // figure first has already formed a view by the time a caveat arrives.
  if (data.analysisLimits?.length) {
    ensure(14 + data.analysisLimits.length * 8);
    mono(7, true); setText(doc, AMBER);
    doc.text('ANALYSIS LIMITS', ML, y); y += 4.5;
    setFill(doc, [254, 243, 224]); doc.roundedRect(ML, y - 4, CW, data.analysisLimits.length * 8 + 3, 1.5, 1.5, 'F');
    for (const l of data.analysisLimits) {
      wrapped(`${l.severity === 'blocking' ? 'BLOCKING: ' : ''}${l.message}`,
        8.8, l.severity === 'blocking' ? RED : AMBER, CW - 6, 4.0, 'normal', ML + 3);
      y += 1.5;
    }
    y += 4;
  }

  // ── THE WORKFLOW, DRAWN ───────────────────────────────────────────────────
  //
  // A reader who has never used this tool has no idea what produced the numbers
  // on page one, and a paragraph saying "an OpenCascade kernel tessellates the
  // solid" is not an answer to that. Four stages with the REAL counts under
  // each: what was read, what was measured, what was judged, what was priced.
  newPage();
  sectionTitle('Analysis basis', 'How this report was produced, and from what');

  {
    const g0 = (data.geometry || {}) as Record<string, any>;
    const d0 = (data.dfm || {}) as Record<string, any>;
    const stages: [string, string, string][] = [
      ['READ', 'B-rep from your STEP',
        `${g0.faces?.total ?? '—'} faces`],
      // ONE fact per stage. Two facts and a separator overran the box on the
      // first render and truncated to "— triangles · wall p...".
      ['MEASURE', 'kernel + tessellation',
        d0.wallThickness?.p50Mm != null ? `wall p50 ${d0.wallThickness.p50Mm} mm`
          : `${d0.tessellation?.triangles ?? '—'} triangles`],
      ['JUDGE', 'rule catalogue',
        `${totalEvaluated} of ${totalRules} rules evaluated`],
      ['PRICE', 'should-cost engine',
        pricedTotal ? `${eur(pricedTotal).replace('EUR ', '€')} / yr` : 'nothing priced'],
    ];
    const bw = (CW - 3 * 8) / 4;
    stages.forEach(([k, what, figure], i) => {
      const x = ML + i * (bw + 8);
      setFill(doc, PANEL); doc.roundedRect(x, y, bw, 22, 1.5, 1.5, 'F');
      setFill(doc, GOLD); doc.rect(x, y, bw, 1.2, 'F');
      mono(6, true); setText(doc, GOLD);
      doc.text(k, x + 3, y + 6);
      sans(7.4); setText(doc, MUT);
      doc.text(fit(doc, what, bw - 6), x + 3, y + 11.5);
      mono(6.6); setText(doc, INK);
      doc.text(fit(doc, figure, bw - 6), x + 3, y + 17.5);
      // The arrow between stages, so it reads as a pipeline and not as four tiles.
      if (i < 3) {
        setDraw(doc, RULE, 0.6);
        doc.line(x + bw + 1.5, y + 11, x + bw + 6.5, y + 11);
        setFill(doc, RULE);
        doc.triangle(x + bw + 6.5, y + 9.4, x + bw + 6.5, y + 12.6, x + bw + 8, y + 11, 'F');
      }
    });
    y += 28;
  }

  // Measured-geometry strip — the evidence the findings rest on.
  const dfm = (data.dfm || {}) as Record<string, any>;
  const wall = dfm.wallThickness || {};
  const draft = dfm.draft || {};
  const feats = dfm.features || {};
  const g = (data.geometry || {}) as Record<string, any>;
  const measured: [string, string][] = [
    ['BOUNDING BOX', g.boundingBox ? `${g.boundingBox.xMm} x ${g.boundingBox.yMm} x ${g.boundingBox.zMm} mm` : '—'],
    ['VOLUME', g.volume ? `${g.volume.cm3} cm3` : '—'],
    ['WALL p5 / p50 / p95', wall.p50Mm ? `${wall.p5Mm} / ${wall.p50Mm} / ${wall.p95Mm} mm` : 'not measured'],
    ['WALL UNIFORMITY', wall.uniformity || '—'],
    ['DRAW DIRECTION', draft.drawDirectionXYZ ? `[${draft.drawDirectionXYZ.join(', ')}]` : '—'],
    ['UNDERCUT REGIONS', draft.undercutFaceCount != null ? String(draft.undercutFaceCount) : '—'],
    ['WALL AREA BELOW MIN DRAFT', draft.wallAreaBelowMinDraftPct != null ? `${draft.wallAreaBelowMinDraftPct} %` : '—'],
    ['UNCLASSIFIED AREA', feats.unclassifiedAreaPct != null ? `${feats.unclassifiedAreaPct} %` : '—'],
    // APERTURES. The hole table only ever showed round holes, so a stamping with
    // twenty-six slots and shaped cut-outs read as a part with no holes at all.
    ['HOLES & CUT-OUTS', (dfm.apertures?.count ?? 0) > 0
      ? `${dfm.apertures.count} (${dfm.apertures.circularCount} round, ${dfm.apertures.nonCircularCount} shaped)`
      : 'none'],
    ['INTERNAL CUT LENGTH', dfm.apertures?.totalCutLengthMm
      ? `${dfm.apertures.totalCutLengthMm} mm` : '—'],
  ];
  ensure(Math.ceil(measured.length / 2) * 9 + 8);
  mono(7, true); setText(doc, GOLD);
  doc.text('MEASURED GEOMETRY', ML, y); y += 4.5;
  const rows = Math.ceil(measured.length / 2);
  setFill(doc, PANEL); doc.roundedRect(ML, y - 4.5, CW, rows * 9 + 4, 1.5, 1.5, 'F');
  measured.forEach(([k, v], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = ML + 4 + col * (CW / 2);
    mono(6.2); setText(doc, MUT);
    doc.text(fit(doc, k, CW / 2 - 8), x, y + row * 9);
    sans(9.5, 'bold'); setText(doc, INK);
    doc.text(fit(doc, v, CW / 2 - 8), x, y + row * 9 + 5);
  });
  y += rows * 9 + 4;

  // HOW MUCH THE WALL FIGURE IS WORTH, immediately under it. The percentiles
  // were printed as bare facts. On a real part they came back three times the
  // 2V/A reference on rays covering half the surface, and the reader had no way
  // to know either — so the one number that drives the wall, uniformity and
  // rib rules looked exactly as solid as a bounding box.
  if (wall.referenceWallMm != null) {
    y += 2;
    wrapped(`Cross-check: 2V/A gives ${wall.referenceWallMm} mm against the ray-cast median of `
      + `${wall.p50Mm} mm, from rays covering ${wall.measuredAreaPct}% of the surface. `
      + `${wall.referenceBasis ?? ''}`, 8.6, MUT, CW, 4.0, 'italic');
  }
  if (wall.confidenceNote) {
    wrapped(String(wall.confidenceNote), 8.8, AMBER, CW, 4.0, 'bold');
    y += 2;
  }

  // ── Ribs ───────────────────────────────────────────────────────────────────
  // The rib rules compare ratios, so the ratios are what the report has to show.
  // A count of ribs tells a reader nothing about whether any of them is right.
  const ribs: any[] = Array.isArray(feats.ribs) ? feats.ribs : [];
  if (ribs.length) {
    const nominal = Number(wall.p50Mm);
    y += 6;
    ensure(20 + ribs.length * 5.5);
    mono(7, true); setText(doc, GOLD);
    doc.text('RECOGNISED RIBS', ML, y); y += 4.5;
    wrapped(nominal > 0
      ? `Thickness is measured at the base, where the 40-60%-of-wall guideline applies; a drafted rib is opened out by the draft term rather than reported at its thinner mid-height. Ratios are against the measured ${nominal} mm nominal wall.`
      : 'Thickness is measured at the base of each rib. Wall thickness could not be measured on this part, so no ratio is shown and the rib rules abstained rather than guessing a nominal wall.',
      7.4, MUT);
    y += 1;
    mono(6.2); setText(doc, MUT);
    const cols = [ML, ML + 12, ML + 40, ML + 66, ML + 92, ML + 118, ML + 144];
    ['#', 'THICKNESS', 'HEIGHT', 'LENGTH', 'DRAFT/SIDE', 'T / WALL', 'H / WALL']
      .forEach((h, i) => doc.text(h, cols[i], y));
    y += 4;
    ribs.forEach((r, i) => {
      ensure(5.5);
      sans(8.4); setText(doc, INK);
      const ratio = (v: number) => (nominal > 0 ? (v / nominal).toFixed(2) : '—');
      [String(i + 1), `${r.thicknessMm} mm`, `${r.heightMm} mm`,
        r.lengthMm != null ? `${r.lengthMm} mm` : '—',
        `${r.draftPerSideDeg} deg`, ratio(Number(r.thicknessMm)), ratio(Number(r.heightMm))]
        .forEach((v, c) => doc.text(fit(doc, v, 24), cols[c], y));
      y += 5;
    });
    y += 2;
  }

  // ── Located evidence ───────────────────────────────────────────────────────
  // The part, with the findings marked ON it. This is the difference between a
  // report that asserts "34 undercut regions" and one a supplier can act on
  // without opening CAD.
  //
  // NUMBERED MARKERS WITH A LEGEND, not floating labels. Labels placed at their
  // anchors overlap the moment two findings are near each other, and the usual
  // fixes (nudging, leader elbows) fail on a dense casting. A numbered ring on
  // the geometry and a numbered list beneath is what an engineering drawing has
  // always done, and it never collides.
  //
  // WHAT IS MARKED CHANGED. These pages used to carry every geometry
  // observation the recogniser produced — each undercut region, each rib, each
  // pocket, tagged 'info' and numbered — so a casting arrived with forty rings,
  // most on features that broke no rule, while a rule that FAILED often had
  // none. The markers now come from the rule results (dfm-annotations.mjs):
  // failed rules only, worst first, one ring per finding on its worst instance.
  if (figures.length) {
    for (const fig of figures) {
      if (!fig.dataUri) continue;
      // A VIEW WITH NOTHING MARKED ON IT IS NOT EVIDENCE. The hero is already
      // on page one unmarked, and a second view is only ever captured because
      // it was measured to reveal a finding the ISO could not show — so either
      // way, no callouts means no page. This used to print the picture anyway
      // with a line of prose explaining that nothing was visible, which is a
      // full page spent saying "never mind".
      if (!fig.callouts.length) continue;
      newPage();
      sectionTitle(
        fig.role === 'section' ? 'Section through the finding' : 'Located evidence',
        fig.role === 'section'
          ? `Cut through ${fig.sectionOf ?? 'the measured point'}`
          : `${VIEW_LABEL[fig.view] ?? fig.view} view`,
      );
      if (fig.role === 'section') {
        // WHY there is a cut at all. A reader who does not know the plane was
        // put through the measured point will read it as a decorative render.
        wrapped('A thin wall is invisible from outside, so a ring drawn on the skin above it proves '
          + 'nothing. This plane is cut THROUGH the point the engine measured — not wherever a '
          + 'section slider was last left — so what you are looking at is the section the number '
          + 'came from.', 8.4, MUT, CW, 4, 'italic');
        y += 1;
      }

      const imgW = CW;
      const imgH = Math.min(imgW * (fig.height / fig.width), 150);
      ensure(imgH + 12);
      const imgY = y;
      try {
        // JPEG, matching what the viewer produces. Format is passed explicitly
        // because jsPDF sniffs otherwise and gets it wrong on some data URIs.
        doc.addImage(fig.dataUri, fig.dataUri.includes('image/png') ? 'PNG' : 'JPEG',
          ML, imgY, imgW, imgH);
      } catch {
        // A bad capture must not lose the report. Say so where the image was.
        setFill(doc, PANEL); doc.rect(ML, imgY, imgW, imgH, 'F');
        sans(9); setText(doc, MUT);
        doc.text('This view could not be captured.', ML + 6, imgY + 10);
      }
      setDraw(doc, RULE, 0.3); doc.rect(ML, imgY, imgW, imgH);

      // Markers, drawn as vector over the raster so they stay sharp in print.
      //
      // TWO FINDINGS ON THE SAME FEATURE PROJECT TO THE SAME PIXEL — an undercut
      // and a zero-draft wall are frequently the same wall — and two rings drawn
      // on top of each other read as one. So overlapping rings are relaxed
      // apart, and any ring that MOVED gets a leader line back to the point it
      // was measured at. Nudging without the leader would quietly relocate the
      // finding; the leader is what keeps the picture honest.
      const R = 2.6;
      const anchors = fig.callouts.map(c => ({ x: ML + c.x * imgW, y: imgY + c.y * imgH }));
      const at = anchors.map(a => ({ ...a }));
      for (let pass = 0; pass < 12; pass++) {
        let moved = false;
        for (let i = 0; i < at.length; i++) {
          for (let j = i + 1; j < at.length; j++) {
            const dx = at[j].x - at[i].x, dy = at[j].y - at[i].y;
            const d = Math.hypot(dx, dy);
            const need = R * 2.3;
            if (d >= need) continue;
            moved = true;
            // Coincident points get a deterministic direction rather than a
            // random one, so the same report renders the same way twice.
            const ux = d > 0.001 ? dx / d : Math.cos(i), uy = d > 0.001 ? dy / d : Math.sin(i);
            const push = (need - d) / 2;
            at[i].x -= ux * push; at[i].y -= uy * push;
            at[j].x += ux * push; at[j].y += uy * push;
          }
        }
        if (!moved) break;
      }
      fig.callouts.forEach((c, i) => {
        const col = SEV[c.severity ?? ''] ?? TEAL;
        const a = anchors[i], m = at[i];
        if (Math.hypot(m.x - a.x, m.y - a.y) > 0.8) {
          setDraw(doc, col, 0.25);
          doc.line(a.x, a.y, m.x, m.y);
          setFill(doc, col); doc.circle(a.x, a.y, 0.7, 'F');
        }
        setDraw(doc, col, 0.5); setFill(doc, [255, 255, 255]);
        doc.circle(m.x, m.y, R, 'FD');
        setText(doc, col); mono(6.4, true);
        doc.text(String(c.n), m.x, m.y + 1.05, { align: 'center' });
      });
      y = imgY + imgH + 5;

      {
        mono(6.2); setText(doc, MUT);
    // Say what the colours MEAN, or the tinted faces read as decoration. The
    // paint is the finding itself — the B-rep faces the engine measured —
    // tinted by severity; the numbered ring marks the worst instance.
    mono(6.6); setText(doc, MUT);
    doc.text(fit(doc, 'TINTED FACES ARE THE MEASURED FEATURE ITSELF — RED HIGH, AMBER MEDIUM, TEAL LOW. THE RING MARKS THE WORST INSTANCE.', CW), ML, y);
    y += 4.5;
        doc.text('WHAT IS MARKED', ML + 7, y);
        doc.text('MEASURED AGAINST ITS LIMIT', ML + 75, y);
        doc.text('WHICH INSTANCE', ML + 139, y);
        y += 2;
        setDraw(doc, RULE, 0.3); doc.line(ML, y, PW - MR, y); y += 4.6;
        for (const c of fig.callouts) {
          ensure(5.2);
          const col = SEV[c.severity ?? ''] ?? TEAL;
          setDraw(doc, col, 0.4); setFill(doc, [255, 255, 255]);
          doc.circle(ML + 2, y - 1.1, 2.4, 'FD');
          setText(doc, col); mono(6.2, true);
          doc.text(String(c.n), ML + 2, y - 0.25, { align: 'center' });
          sans(8.6); setText(doc, INK);
          doc.text(fit(doc, c.label, 66), ML + 7, y);
          mono(7.2); setText(doc, col);
          doc.text(fit(doc, c.value ?? '', 62), ML + 75, y);
          // WHICH of the thirty-four this ring is. One marker per finding keeps
          // the picture readable; without this column it also hides that there
          // were thirty-three others.
          sans(7.6); setText(doc, MUT);
          doc.text(fit(doc, c.note ?? '', CW - 139 - 2), ML + 139, y);
          y += 5;
        }
      }
    }
  }

  // ── WHAT CHANGED SINCE THE LAST REVISION ──────────────────────────────────
  //
  // The second question a programme asks is never "what is wrong with rev B" —
  // it is "did the changes we agreed last month work?". Every report this tool
  // produced was a snapshot and could not answer it, so a reviewer diffed two
  // PDFs by eye, which is how a closed finding gets missed and a regression
  // ships.
  //
  // The distinction that earns this page its space is CLOSED versus NO LONGER
  // MEASURABLE. A rule that stopped failing because rev B lost its wall
  // measurement has not been fixed, and a report that counts it as a win is
  // worse than one that says nothing at all.
  if (diff) {
    newPage();
    sectionTitle('What changed', diff.baselineLabel
      ? `This revision against ${diff.baselineLabel}`
      : 'This revision against the previous analysis');

    sans(12, 'bold'); setText(doc, INK);
    doc.text(fit(doc, diff.headline, CW), ML, y); y += 7;

    if (diff.warnings?.length) {
      // A diff across two different processes or two different alloys is
      // arithmetic that means nothing. It is printed WITH the caveat rather
      // than withheld, because the reader may have meant to do exactly that.
      for (const w of diff.warnings) {
        ensure(12);
        setFill(doc, [254, 243, 199]); doc.roundedRect(ML, y - 4, CW, 11, 1.2, 1.2, 'F');
        sans(8.2); setText(doc, [146, 64, 14]);
        const lines = doc.splitTextToSize(pdfSafe(w), CW - 8);
        doc.text(lines.slice(0, 2), ML + 4, y);
        y += 13;
      }
      y += 1;
    }

    // FIXED, not "closed". Two of these rows stopped failing because the rule
    // stopped being measurable, and a tile reading "2 CLOSED" beside a headline
    // reading "0 findings closed" is the report arguing with itself — with the
    // flattering number in the bigger typeface.
    const genuinelyFixed = diff.closed.filter(c => c.how === 'now passes').length;
    const cells: [string, string, RGB][] = [
      [`${genuinelyFixed}`, 'FIXED', genuinelyFixed ? GREEN : MUT],
      [`${diff.counts.created}`, 'NEW', diff.counts.created ? RED : GREEN],
      [`${diff.counts.persisting}`, 'STILL OPEN', diff.counts.persisting ? AMBER : GREEN],
      [diff.score.before == null || diff.score.after == null
        ? 'not scored' : `${diff.score.before} -> ${diff.score.after}`,
      'SCORE', (diff.score.after ?? 0) >= (diff.score.before ?? 0) ? GREEN : RED],
    ];
    setFill(doc, PANEL); doc.roundedRect(ML, y - 5, CW, 20, 1.5, 1.5, 'F');
    const dcw = CW / 4;
    cells.forEach(([v, l, c], i) => {
      const x = ML + 5 + i * dcw;
      if (i > 0) { setDraw(doc, RULE, 0.3); doc.line(ML + i * dcw, y - 3, ML + i * dcw, y + 12); }
      sans(v.length > 9 ? 10 : 15, 'bold'); setText(doc, c);
      doc.text(fit(doc, v, dcw - 8), x, y + 3);
      mono(5.6); setText(doc, MUT);
      doc.text(fit(doc, l, dcw - 8), x, y + 9.5);
    });
    y += 24;

    // Each row carries its OWN colour. A green dot beside "NOT FIXED" is the
    // same visual contradiction the tile had — the eye reads the colour before
    // the words, and the colour was saying the opposite thing.
    const rowsOf = (title: string, colour: RGB, items: Array<[string, string, string, RGB?]>) => {
      if (!items.length) return;
      ensure(14);
      mono(6.4, true); setText(doc, colour);
      doc.text(title, ML, y); y += 5;
      for (const [a, b, c, own] of items) {
        ensure(5.4);
        const dot = own ?? colour;
        setFill(doc, dot); doc.circle(ML + 1.4, y - 1.1, 1.4, 'F');
        sans(8.6); setText(doc, INK);
        doc.text(fit(doc, a, 68), ML + 5, y);
        mono(7.2); setText(doc, dot);
        doc.text(fit(doc, b, 36), ML + 76, y);
        sans(7.8); setText(doc, MUT);
        doc.text(fit(doc, c, CW - 116), ML + 116, y);
        y += 5.2;
      }
      y += 3;
    };

    const nOf = (v: number | null, unit?: string) => (v == null ? '—' : `${v}${unit ? ` ${shortUnit(unit)}` : ''}`);

    // "NO LONGER FAILING" covers both, and every row says which it is. Calling
    // the group CLOSED put a green heading over rows that fixed nothing.
    rowsOf('NO LONGER FAILING', GREEN, diff.closed.map(c => [
      c.title,
      `${nOf(c.was, c.unit)} -> ${nOf(c.now, c.unit)}`,
      // The distinction that matters, said on every row rather than in a
      // footnote nobody reaches.
      c.how === 'now passes'
        ? (c.annualFreed ? `fixed · frees ${eur(c.annualFreed).replace('EUR ', 'EUR ')}/yr` : 'fixed')
        : `NOT FIXED — ${c.how}`,
      c.how === 'now passes' ? GREEN : MUT,
    ]));
    rowsOf('NEW', RED, diff.created.map(c => [
      c.title,
      `${nOf(c.measured, c.unit)} vs ${c.thresholdText ?? '—'}`,
      c.wasPassing ? 'was passing on the previous revision' : 'first appearance',
    ]));
    rowsOf('STILL OPEN', AMBER, diff.persisting.map(c => [
      c.title,
      `${nOf(c.was, c.unit)} -> ${nOf(c.now, c.unit)}`,
      c.delta == null ? 'movement not measurable'
        : c.delta === 0 ? 'unchanged'
          : `${c.delta > 0 ? '+' : ''}${c.delta}${c.unit ? ` ${shortUnit(c.unit)}` : ''}`,
    ]));
    rowsOf('NEWLY VISIBLE', TEAL, diff.nowVisible.map(c => [
      c.title, 'not a regression', c.reason,
    ]));
    rowsOf('NO LONGER MEASURABLE', MUT, diff.nowBlind.map(c => [
      c.title, 'lost visibility', c.reason,
    ]));
  }

  // ── PRESS, STRIP AND FORMING ──────────────────────────────────────────────
  //
  // The figures a stamping engineer asks for before anything else: what press
  // does this need, and how much of the coil ends up in the part. The second is
  // the one the report has never carried, and on a stamping it is usually the
  // largest cost lever there is — Boljanovic opens his material-economy chapter
  // saying so outright.
  {
    const sf = (data as Record<string, any>).sheetForming;
    if (sf && !sf.unavailable && (sf.press || sf.stripLayout)) {
      ensure(46);
      y += 2;
      mono(7, true); setText(doc, GOLD);
      doc.text('PRESS, STRIP AND FORMING', ML, y); y += 5.4;

      const tiles: Array<[string, string, RGB]> = [];
      if (sf.press) {
        tiles.push([sf.press.beyondLadder ? 'transfer line' : `${sf.press.pressTonnes} t`,
          'PRESS CLASS', sf.press.beyondLadder ? AMBER : INK]);
        tiles.push([`${Math.round(sf.press.totalKN)} kN`, 'FORCE + MARGIN', INK]);
      }
      if (sf.stripLayout) {
        tiles.push([`${sf.stripLayout.utilisationPct} %`, 'STRIP UTILISATION',
          sf.stripLayout.meetsBookTarget ? GREEN : RED]);
      }
      if (sf.drawStages) tiles.push([`${sf.drawStages.stages}`, 'DRAW OPERATIONS', sf.drawStages.beyondTable ? RED : INK]);
      if (sf.bendAllowance) tiles.push([`${sf.bendAllowance.totalMm} mm`, 'BEND ALLOWANCE', INK]);

      if (tiles.length) {
        setFill(doc, PANEL); doc.roundedRect(ML, y - 5, CW, 20, 1.5, 1.5, 'F');
        const cwN = CW / tiles.length;
        tiles.forEach(([v, l, c], i) => {
          const x = ML + 5 + i * cwN;
          if (i > 0) { setDraw(doc, RULE, 0.3); doc.line(ML + i * cwN, y - 3, ML + i * cwN, y + 12); }
          sans(v.length > 8 ? 10 : 13, 'bold'); setText(doc, c);
          doc.text(fit(doc, v, cwN - 8), x, y + 3);
          mono(5.4); setText(doc, MUT);
          doc.text(fit(doc, l, cwN - 8), x, y + 9.5);
        });
        y += 23;
      }
      // The provenance, once, rather than on every tile.
      wrapped("Every figure here comes from Boljanovic, 'Sheet Metal Forming Processes and Die Design', "
        + 'read first-hand: blanking force from Eq. 4.3 with the 30% press margin of Eq. 4.4, bend force '
        + 'from Eq. 5.7, webs and utilisation from Sec. 4.4, draw operations from Table 6.2. The '
        + 'utilisation is a LOWER bound — it assumes a rectangular blank envelope in a single-pass '
        + 'layout, and real nesting does better.', 7.8, MUT, CW, 3.6, 'italic');
      y += 3;
    }
  }

  // ── WHAT NADCA #402 PROMISES FOR THIS PART ────────────────────────────────
  //
  // The capability figures a die-casting drawing should be checked against,
  // printed whether or not a rule fired: a purchasing conversation starts from
  // "the standard promises ±0.38 mm at this size", not from a finding. Every
  // number is computed from the 2021 tables at this part's own dimensions.
  {
    const sf = (data as Record<string, any>).sheetForming;
    const s402 = sf?.nadca402Summary;
    if (s402) {
      ensure(46);
      y += 2;
      mono(7, true); setText(doc, GOLD);
      doc.text('WHAT NADCA #402 PROMISES FOR THIS PART', ML, y); y += 5.4;

      const tiles: Array<[string, string, RGB]> = [
        [`±${s402.linearPlusMinusMm} mm`,
          `LINEAR AT ${s402.largestDimensionMm} MM · ${String(s402.grade).toUpperCase()}`, INK],
      ];
      if (s402.partingLinePlusMm != null) {
        tiles.push([`+${s402.partingLinePlusMm} mm`, `PARTING-LINE ADDER (${s402.projectedAreaCm2} CM²)`, INK]);
      }
      const f402 = sf.nadca402Flatness;
      if (f402?.capabilityMm != null) {
        tiles.push([`${f402.capabilityMm} mm`, `FLATNESS AT ${f402.diagonalMm} MM DIAG`, INK]);
      }
      const t402 = sf.nadca402Tolerance;
      if (t402?.margin != null) {
        tiles.push([`${t402.margin}×`,
          t402.from === 'declared' ? 'DECLARED BAND VS CAPABILITY' : `WORST PMI BAND (${t402.dimensionMm} MM)`,
          t402.margin >= 1 ? GREEN : RED]);
      }

      setFill(doc, PANEL); doc.roundedRect(ML, y - 5, CW, 20, 1.5, 1.5, 'F');
      const cwN = CW / tiles.length;
      tiles.forEach(([v, l, c], i) => {
        const x = ML + 5 + i * cwN;
        if (i > 0) { setDraw(doc, RULE, 0.3); doc.line(ML + i * cwN, y - 3, ML + i * cwN, y + 12); }
        sans(v.length > 8 ? 10 : 13, 'bold'); setText(doc, c);
        doc.text(fit(doc, v, cwN - 8), x, y + 3);
        mono(5.4); setText(doc, MUT);
        doc.text(fit(doc, l, cwN - 8), x, y + 9.5);
      });
      y += 23;

      wrapped('From NADCA Product Specification Standards for Die Castings (2021, 11th ed.), read '
        + 'first-hand: linear capability from Tables S/P-4A-1 at this part’s largest dimension, the '
        + 'PLUS-ONLY parting-line adder from S/P-4A-2 at the bounding footprint perpendicular to the '
        + 'draw (an upper bound on true projected area, so the adder is an upper bound too), flatness '
        + 'from S/P-4A-8 at the bounding diagonal. A drawing tighter than these numbers is not '
        + 'impossible — it is a conversation with the die caster, and a cost.', 7.8, MUT, CW, 3.6, 'italic');
      y += 3;
    }
  }

  // ── WHAT SFSA 2000 PROMISES FOR THIS PART ─────────────────────────────────
  //
  // The steel-casting counterpart of the NADCA band above; a part is one or
  // the other by material, so the two never render together.
  {
    const sf = (data as Record<string, any>).sheetForming;
    const ct = sf?.sfsaCtSummary;
    if (ct) {
      ensure(46);
      y += 2;
      mono(7, true); setText(doc, GOLD);
      doc.text('WHAT SFSA 2000 PROMISES FOR THIS STEEL CASTING', ML, y); y += 5.4;

      const tiles: Array<[string, string, RGB]> = [
        [`${ct.totalBandMm} mm`, `${ct.grade} BAND AT ${ct.largestDimensionMm} MM · ${String(ct.series).toUpperCase()} SERIES`, INK],
      ];
      if (sf.sfsaRma?.requiredMm != null) {
        tiles.push([`${sf.sfsaRma.requiredMm} mm`, `MACHINING ALLOWANCE (GRADE ${sf.sfsaRma.grade})`, INK]);
      }
      if (sf.sfsaSandFlatness?.capabilityMm != null) {
        tiles.push([`${sf.sfsaSandFlatness.capabilityMm} mm`, `FLATNESS AT ${sf.sfsaSandFlatness.diagonalMm} MM DIAG (${sf.sfsaSandFlatness.ctg})`, INK]);
      }
      const tol = sf.sfsaSandTolerance;
      if (tol?.margin != null) {
        tiles.push([`${Math.round(tol.margin * 1000) / 1000}×`,
          tol.from === 'declared' ? 'DECLARED BAND VS CAPABILITY' : `WORST PMI BAND (${tol.dimensionMm} MM)`,
          tol.margin >= 1 ? GREEN : RED]);
      }

      setFill(doc, PANEL); doc.roundedRect(ML, y - 5, CW, 20, 1.5, 1.5, 'F');
      const cwN = CW / tiles.length;
      tiles.forEach(([v, l, c], i) => {
        const x = ML + 5 + i * cwN;
        if (i > 0) { setDraw(doc, RULE, 0.3); doc.line(ML + i * cwN, y - 3, ML + i * cwN, y + 12); }
        sans(v.length > 8 ? 10 : 13, 'bold'); setText(doc, c);
        doc.text(fit(doc, v, cwN - 8), x, y + 3);
        mono(5.4); setText(doc, MUT);
        doc.text(fit(doc, l, cwN - 8), x, y + 9.5);
      });
      y += 23;

      wrapped('From SFSA Supplement 3 "Dimensional Capabilities of Steel Castings", read first-hand: '
        + 'the ISO 8062-1994 CT table adopted as SFSA 2000, judged at the loosest grade of the typical '
        + 'band for the declared production series (a statistical basis of 140,000+ production features); '
        + 'machining allowance from Table 2.2 at the casting’s largest dimension; flatness from the '
        + 'ISO 8062-2 CTG tables at the bounding diagonal. Tighter numbers are a negotiation with the '
        + 'foundry — pattern re-engineering, or machining the one surface that needs it.', 7.8, MUT, CW, 3.6, 'italic');
      y += 3;
    }
  }

  // ── WHAT ISO 8062-4 PROMISES FOR THIS CASTING ─────────────────────────────
  //
  // The non-ferrous counterpart: the permanent-mould tolerance verdict at
  // this part's own dimension and metal group. Absent for steel (the
  // standard prints '-' there) and for die castings (NADCA #402 renders
  // above instead), so no part shows two capability bands for one claim.
  {
    const sf = (data as Record<string, any>).sheetForming;
    const pm = sf?.iso8062PmTolerance;
    if (pm?.margin != null) {
      ensure(46);
      y += 2;
      mono(7, true); setText(doc, GOLD);
      doc.text('WHAT ISO 8062-4 PROMISES FOR THIS CASTING', ML, y); y += 5.4;

      const tiles: Array<[string, string, RGB]> = [
        [`${pm.capabilityBandMm} mm`, `${pm.grade} TOTAL BAND · PERMANENT MOULD`, INK],
        [`${Math.round(pm.margin * 1000) / 1000}×`,
          pm.from === 'declared' ? 'DECLARED BAND VS CAPABILITY' : `WORST PMI BAND (${pm.dimensionMm} MM)`,
          pm.margin >= 1 ? GREEN : RED],
      ];
      const gdcDraft = sf?.iso8062Draft?.['gravity-die'];
      if (gdcDraft?.requiredDeg != null) {
        tiles.push([`${gdcDraft.requiredDeg}°`, `DRAFT, TABLE 6 AT ${gdcDraft.drawDepthMm} MM DRAW`, INK]);
      }

      setFill(doc, PANEL); doc.roundedRect(ML, y - 5, CW, 20, 1.5, 1.5, 'F');
      const cwN = CW / tiles.length;
      tiles.forEach(([v, l, c], i) => {
        const x = ML + 5 + i * cwN;
        if (i > 0) { setDraw(doc, RULE, 0.3); doc.line(ML + i * cwN, y - 3, ML + i * cwN, y + 12); }
        sans(v.length > 8 ? 10 : 13, 'bold'); setText(doc, c);
        doc.text(fit(doc, v, cwN - 8), x, y + 3);
        mono(5.4); setText(doc, MUT);
        doc.text(fit(doc, l, cwN - 8), x, y + 9.5);
      });
      y += 23;

      wrapped('From ISO 8062-4:2017, read first-hand: dimensional capability from Table 2 at the '
        + 'grade Annex B.1 selects for this metal group by metallic permanent mould, judged at the '
        + 'loosest of the printed band; draft from Table 6 at the part’s own draw extent, Grade A '
        + '(fine) external — the least demanding printed column, so internal walls need more. Steel, '
        + 'nickel and cobalt print no permanent-mould column, and this panel abstains for them.', 7.8, MUT, CW, 3.6, 'italic');
      y += 3;
    }
  }

  // ── WHAT DIN 16742 PROMISES FOR THIS MOULDING ─────────────────────────────
  //
  // The moulded-part counterpart: the tolerance group Annex C assigns to the
  // declared resin and the Table 2 band at this part's own size. Absent for
  // metals, so no part shows two capability bands for one claim.
  {
    const sf = (data as Record<string, any>).sheetForming;
    const din = sf?.din16742Summary;
    if (din?.totalBandMm != null) {
      ensure(46);
      y += 2;
      mono(7, true); setText(doc, GOLD);
      doc.text('WHAT DIN 16742 PROMISES FOR THIS MOULDING', ML, y); y += 5.4;

      const tiles: Array<[string, string, RGB]> = [
        [din.tg, `ANNEX C COLUMN ${din.letter} · SERIES ${din.series}`, INK],
        [`±${din.plusMinusMm} mm`, `${din.tg} BAND AT ${din.largestDimensionMm} MM`, INK],
      ];
      const tol = sf.din16742Tolerance;
      if (tol?.margin != null) {
        tiles.push([`${tol.margin}×`,
          tol.from === 'declared' ? 'DECLARED BAND VS CAPABILITY' : `WORST PMI BAND (${tol.dimensionMm} MM)`,
          tol.margin >= 1 ? GREEN : RED]);
      }

      setFill(doc, PANEL); doc.roundedRect(ML, y - 5, CW, 20, 1.5, 1.5, 'F');
      const cwN = CW / tiles.length;
      tiles.forEach(([v, l, c], i) => {
        const x = ML + 5 + i * cwN;
        if (i > 0) { setDraw(doc, RULE, 0.3); doc.line(ML + i * cwN, y - 3, ML + i * cwN, y + 12); }
        sans(v.length > 8 ? 10 : 13, 'bold'); setText(doc, c);
        doc.text(fit(doc, v, cwN - 8), x, y + 3);
        mono(5.4); setText(doc, MUT);
        doc.text(fit(doc, l, cwN - 8), x, y + 9.5);
      });
      y += 23;

      wrapped('From DIN 16742:2013-10, read first-hand: the tolerance group the standard’s own '
        + 'Annex C assigns to this resin (at the loosest printed branch where shrinkage knowledge is '
        + 'not an input), priced by Table 2 at each dimension’s own size in the non-tool-specific '
        + 'column — the looser one, and the column the standard prints for general tolerances. '
        + 'Declaring precision tooling moves the judgment one series tighter; series 3 and 4 are a '
        + 'mandatory agreement with the moulder, not a drawing note.', 7.8, MUT, CW, 3.6, 'italic');
      y += 3;
    }
  }

  // ── THE 2D DRAWING, AND HOW THE MODEL ANSWERS IT ──────────────────────────
  //
  // A summary panel, not the full table — the Excel export carries every row
  // with its verbatim callout. What a reviewer needs on paper is the counts,
  // the conflicts by name, and the provenance sentence.
  if (data.drawing?.ok) {
    const dw = data.drawing;
    const chk = data.drawingCheck;
    ensure(40);
    y += 2;
    mono(7, true); setText(doc, GOLD);
    doc.text('WHAT THE AI READ OFF THE 2D DRAWING', ML, y); y += 5.4;
    const tb = dw.titleBlock;
    const tolCount = dw.dimensions.filter(d => d.toleranced).length;
    const tiles: Array<[string, string, RGB]> = [
      [`${dw.dimensions.length}`, `DIMENSIONS (${tolCount} TOLERANCED)`, INK],
      [`${dw.gdt.length}`, 'GD&T FRAMES', INK],
    ];
    if (chk) {
      tiles.push([`${chk.counts.confirmed}✓ ${chk.counts.conflict}✗`,
        'CONFIRMED / CONFLICTS VS 3D',
        chk.counts.conflict ? RED : GREEN]);
    }
    setFill(doc, PANEL); doc.roundedRect(ML, y - 5, CW, 20, 1.5, 1.5, 'F');
    const cwD = CW / tiles.length;
    tiles.forEach(([v, l, c], i) => {
      const x = ML + 5 + i * cwD;
      if (i > 0) { setDraw(doc, RULE, 0.3); doc.line(ML + i * cwD, y - 3, ML + i * cwD, y + 12); }
      sans(v.length > 8 ? 10 : 13, 'bold'); setText(doc, c);
      doc.text(fit(doc, v, cwD - 8), x, y + 3);
      mono(5.4); setText(doc, MUT);
      doc.text(fit(doc, l, cwD - 8), x, y + 9.5);
    });
    y += 23;
    if (chk) {
      for (const row of chk.rows.filter(r2 => r2.status === 'conflict').slice(0, 6)) {
        ensure(8);
        wrapped(`CONFLICT — "${row.sourceText}": the model's ${row.candidate?.kind} measures ${row.candidate?.valueMm} mm, ${row.candidate?.deltaMm} mm from the drawing. One of the two documents is wrong; this tool cannot say which.`,
          7.8, RED, CW, 3.6);
        y += 1.5;
      }
    }
    wrapped(`${tb.drawingNumber ? `Drawing ${tb.drawingNumber}${tb.revision ? ` rev ${tb.revision}` : ''} · ` : ''}`
      + `units ${dw.units} · readability ${dw.readability}`
      + `${tb.generalToleranceNote ? ` · general tolerance note "${tb.generalToleranceNote}"` : ''}. `
      + 'Extracted by AI vision and reviewed before judging; every extracted value was then judged by the '
      + 'same deterministic engines as a typed input, and each finding built on one is labelled '
      + 'drawing-read. The full row-by-row extraction with verbatim callouts is in the Excel export.',
    7.8, MUT, CW, 3.6, 'italic');
    y += 3;
  }

  // ── WHAT HAPPENS NEXT, AND WHO DOES IT ────────────────────────────────────
  //
  // The report said what is wrong and what it costs, and stopped. Nobody leaves
  // a design review with "41.2% of the wall area is under-drafted"; they leave
  // with an owner and a decision. The action text is the ENGINE's own fix
  // wording — nothing here is authored — the owner is a ROLE derived from what
  // has to change, and the due date is deliberately BLANK because a date this
  // tool invented would be the least credible column in the document.
  {
    const { rows: actions, omitted, byOwner } = buildActions(data as never, { max: 12 });
    if (actions.length) {
      newPage();
      sectionTitle('Actions', `${actions.length} decisions, worst first`);

      mono(6.2); setText(doc, MUT);
      // TWO COLUMNS, TWO LINES EACH — not five narrow ones.
      //
      // The first version put action, owner, decision and due in five columns
      // and dropped the FINDING to make them fit. Rendered, it was four rows of
      // identical instruction text with nothing to say which finding each
      // answered — two rules that share a fix sentence produced two identical
      // rows. The finding is what makes a row addressable, so it leads.
      const AX = ML + 6;          // the action block
      const AW = 108;
      const RX = ML + 120;        // owner, decision and the box somebody signs
      const RW = CW - 120;
      doc.text('FINDING, AND THE CHANGE THAT CLEARS IT', AX, y);
      doc.text('OWNER (ROLE) / DECISION NEEDED', RX, y);
      y += 2;
      setDraw(doc, RULE, 0.4); doc.line(ML, y, PW - MR, y); y += 5;

      for (const a of actions) {
        // SET THE FONT BEFORE MEASURING. splitTextToSize wraps against whatever
        // font is current, and this ran with the 6.2 pt mono still selected from
        // the header row — so the 8.4 pt sans text it produced was wider than
        // the column and ran straight through the one beside it. Invisible until
        // the page was rasterised, as ever.
        sans(8.4);
        const act = doc.splitTextToSize(pdfSafe(a.action), AW).slice(0, 3);
        sans(7.8);
        const dec = doc.splitTextToSize(pdfSafe(a.decision), RW).slice(0, 3);
        const h = Math.max(act.length, dec.length) * 3.9 + 11;
        ensure(h + 3);
        const top = y;
        const col = SEV[a.severity] ?? MUT;

        mono(6.6, true); setText(doc, col);
        doc.text(String(a.n), ML, y + 0.5);
        sans(8.8, 'bold'); setText(doc, INK);
        doc.text(fit(doc, a.finding, AW), AX, y);
        sans(8.4); setText(doc, BODY);
        doc.text(act, AX, y + 4.6);
        if (a.change) {
          mono(6.8); setText(doc, col);
          doc.text(fit(doc, a.change, AW), AX, y + 4.6 + act.length * 3.9 + 1.2);
        }

        sans(8.4, 'bold'); setText(doc, INK);
        doc.text(fit(doc, a.owner, RW), RX, y);
        sans(7.8); setText(doc, MUT);
        doc.text(dec, RX, y + 4.6);
        // The empty rule is the point: somebody has to write on it.
        const dueY = y + 4.6 + dec.length * 3.9 + 3;
        mono(5.6); setText(doc, MUT);
        doc.text('DUE', RX, dueY);
        setDraw(doc, RULE, 0.3); doc.line(RX + 9, dueY, PW - MR, dueY);

        y = top + h;
        setDraw(doc, RULE, 0.15); doc.line(ML, y - 2.4, PW - MR, y - 2.4);
      }
      y += 3;

      if (omitted) {
        wrapped(`${omitted} further finding(s) are in the findings table but not in this list. `
          + 'The list is capped so it stays a set of decisions rather than a second copy of the '
          + 'findings table.', 8, MUT, CW, 4, 'italic');
        y += 2;
      }

      if (byOwner.length > 1) {
        ensure(10 + byOwner.length * 5);
        mono(6.4, true); setText(doc, GOLD);
        doc.text('BY OWNER', ML, y); y += 5;
        for (const o of byOwner) {
          ensure(5);
          sans(8.6); setText(doc, INK);
          doc.text(fit(doc, o.owner, 70), ML, y);
          sans(8.4); setText(doc, o.high ? RED : BODY);
          doc.text(`${o.actions} action${o.actions === 1 ? '' : 's'}`
            + (o.high ? `, ${o.high} high severity` : ''), ML + 74, y);
          mono(7.4); setText(doc, o.annualEur ? GREEN : MUT);
          doc.text(o.annualEur ? `${eur(o.annualEur).replace('EUR ', 'EUR ')}/yr` : 'not priced',
            PW - MR, y, { align: 'right' });
          y += 5;
        }
        y += 2;
      }
    }
  }

  // ── What the picture does NOT show ────────────────────────────────────────
  //
  // A view with six rings on it looks complete. If four more findings existed
  // and had nowhere to point — a tolerance that is a property of the whole part,
  // a rule whose offending feature the kernel could not place — the reader has
  // no way to know unless it is written down. The old report drew the rings it
  // could and said nothing about the rest, which reads as "that is all of them".
  if ((figureNotes.notLocated?.length ?? 0) > 0 || (figureNotes.droppedByCap ?? 0) > 0) {
    ensure(26);
    y += 3;
    mono(6.4, true); setText(doc, GOLD);
    doc.text('FINDINGS NOT MARKED ON THE MODEL', ML, y); y += 5;
    if (figureNotes.droppedByCap) {
      wrapped(`${figureNotes.droppedByCap} further finding(s) are locatable but fall past the `
        + `${figureNotes.markable ?? 0}-marker limit for one view. They are in the findings table `
        + 'in full — the limit exists because a render with thirty rings on it stops being evidence.',
      8.4, BODY, CW, 4);
      y += 1;
    }
    for (const n of figureNotes.notLocated ?? []) {
      ensure(5);
      const col = SEV[n.severity] ?? MUT;
      setFill(doc, col); doc.circle(ML + 1.4, y - 1.1, 1.4, 'F');
      sans(8.4); setText(doc, INK);
      doc.text(fit(doc, n.title, 78), ML + 5, y);
      sans(8); setText(doc, MUT);
      doc.text(fit(doc, n.reason, CW - 88), ML + 88, y);
      y += 5;
    }
    y += 2;
  }

  // ── What the file did and did not tell us about tolerances ────────────────
  //
  // THE ABSENCE IS THE POINT. Without this block a part whose tolerances were
  // never exported shows its tolerance rules under NOT EVALUATED with the
  // generic reason "no measurement available", which is true and useless. The
  // sentence a reader needs — "your file carries no PMI; the tolerances are on
  // a drawing this tool has never seen" — existed in the engine and was never
  // printed.
  {
    const pmi = (data.dfm as Record<string, any> | undefined)?.pmi as Record<string, any> | undefined;
    if (pmi) {
      ensure(30);
      sectionTitle('Tolerances', pmi.present ? 'Read from the model' : 'Not in this file');
      if (pmi.present) {
        wrapped(`${pmi.dimensionCount ?? 0} dimension${pmi.dimensionCount === 1 ? '' : 's'}, `
          + `${pmi.geometricToleranceCount ?? 0} geometric tolerance${pmi.geometricToleranceCount === 1 ? '' : 's'} and `
          + `${pmi.datumCount ?? 0} datum${pmi.datumCount === 1 ? '' : 's'} were read from the model's semantic PMI. `
          + `The tightest total band called out is ${pmi.tightestToleranceMm} mm, and that is what the `
          + 'process-capability rules below are measured against.', 9.2, BODY);
        const gts = (pmi.geometricTolerances ?? []) as Array<Record<string, any>>;
        if (gts.length) {
          y += 1;
          mono(7); setText(doc, MUT);
          for (const g of gts.slice(0, 8)) {
            ensure(4.4);
            doc.text(fit(doc, `  ${g.typeName ?? 'tolerance'}  ${g.valueMm ?? '—'} mm`, CW), ML, y);
            y += 4;
          }
        }
      } else {
        wrapped(String(pmi.reason ?? 'No semantic PMI was found in this file.'), 9.2, AMBER, CW, 4.2, 'bold');
      }
      y += 5;
    }
  }

  // ── Tool reach ────────────────────────────────────────────────────────────
  //
  // ONLY WHERE A CUTTER IS INVOLVED. This printed on every report, so a sand
  // casting carried half a page about what a Ø10 end mill can reach — a
  // measurement with no bearing on a process that has no cutter. Noise in a
  // report is not free: it is the reason a reader stops trusting the pages that
  // do matter.
  {
    const CUTTER_FAMILIES = new Set(['machining', 'turning', 'deep-hole-drilling', 'broaching', 'wire-edm']);
    const usesCutter = data.results.some(r => r.ruleCount > 0 && CUTTER_FAMILIES.has(r.process));
    const ta = (data.dfm as Record<string, any> | undefined)?.toolAccess as Record<string, any> | undefined;
    if (usesCutter && ta && Number.isFinite(ta.reachableAreaPct)) {
      ensure(28);
      sectionTitle('Tool reach', `${ta.reachableAreaPct}% of the surface a Ø${ta.toolDiaMm} mm cutter can reach`);
      wrapped(String(ta.method ?? ''), 9.2, BODY);
      y += 1;
      // The limits travel with the number. A face this calls reachable can still
      // be unreachable once the holder is on the tool, and a reader who is not
      // told that will take the figure for more than it is.
      if (ta.knownLimits) wrapped(String(ta.knownLimits), 8.8, AMBER, CW, 4.0, 'italic');
      if (ta.excludedBecause) wrapped(String(ta.excludedBecause), 8.8, MUT, CW, 4.0, 'italic');
      y += 5;
    }
  }


  // ── Per-process results ────────────────────────────────────────────────────
  for (const r of data.results) {
    if (!r.ruleCount) continue;
    newPage();
    sectionTitle(r.processName, `${r.findings.length} finding${r.findings.length === 1 ? '' : 's'} · ${r.evaluatedCount}/${r.ruleCount} rules evaluated`);

    // Score + coverage, always together. A score without its coverage invites
    // the reader to assume the whole catalogue ran.
    ensure(16);
    setFill(doc, PANEL); doc.roundedRect(ML, y - 4.5, CW, 13, 1.5, 1.5, 'F');
    mono(6.2); setText(doc, MUT);
    doc.text('MANUFACTURABILITY SCORE', ML + 4, y);
    doc.text('RULE COVERAGE', ML + 70, y);
    doc.text(r.findings.some(f => f.cost?.upperBound)
      ? 'PRICED IMPACT / YR (CEILING)' : 'PRICED IMPACT / YEAR', ML + 122, y);
    sans(11, 'bold'); setText(doc, r.score == null ? MUT : r.score >= 80 ? GREEN : r.score >= 50 ? AMBER : RED);
    doc.text(r.score == null ? 'not scored' : `${r.score} / 100`, ML + 4, y + 5.5);
    setText(doc, INK);
    doc.text(`${r.coveragePct}%`, ML + 70, y + 5.5);
    setText(doc, r.impact?.annualEur ? GREEN : MUT);
    doc.text(r.impact?.annualEur ? eur(r.impact.annualEur) : 'none priced', ML + 122, y + 5.5);
    y += 14;

    if (r.score == null) {
      wrapped('No rule in this family could be evaluated on this geometry, so no score is given. A score of 100 over zero checks would be meaningless.', 9, MUT, CW, 4.2, 'italic');
      y += 3;
    }

    for (const f of r.findings) {
      const colour = SEV[f.severity] || TEAL;
      sans(11, 'bold');
      const titleLines: string[] = doc.splitTextToSize(pdfSafe(f.title), CW - 34);
      const bandH = 6.5 + titleLines.length * 5.2;

      // Pre-measure the WHOLE card so it either fits or starts on a fresh page.
      // Reserving a fixed guess instead let a long finding begin near the bottom
      // and strand its tail on an otherwise empty page.
      const costText = f.cost?.priced
        ? `${f.cost.changeDescription}: ${eur(f.cost.asDrawnEur)} to ${eur(f.cost.improvedEur)} per part, a saving of ${eur(f.cost.deltaEur)} per part${f.cost.annualDeltaEur ? ` (${eur(f.cost.annualDeltaEur)} per year)` : ''}. Basis: ${f.cost.basis}.`
        : `Not priced. ${f.cost?.reason || ''}`;
      const cardH = bandH + 1.5 + 5                       // band + measured line
        + measure(f.rationale, 9.1, CW - 9, 4.1) + 1
        + 3.8 + measure(f.fix, 9.1, CW - 9, 4.1) + 1      // "WHAT TO DO" + body
        + 3.8 + measure(costText, 9.1, CW - 9, 4.1)      // "COST IMPACT" + body
        + (f.cost?.externalGuideline ? measure(f.cost.externalGuideline, 8.8, CW - 9, 4.0, 'italic') : 0)
        + (f.cost?.caveat ? measure(f.cost.caveat, 8.8, CW - 9, 4.0, 'italic') + 1 : 0)
        + 4 + 8;                                          // source line + rule
      ensure(cardH);
      const top = y - 4;
      setFill(doc, PANEL); doc.rect(ML, top, CW, bandH, 'F');
      setFill(doc, colour); doc.rect(ML, top, 1.6, bandH, 'F');
      setFill(doc, colour); doc.roundedRect(PW - MR - 24, top + 2, 21, 5.4, 1, 1, 'F');
      mono(6.4, true); setText(doc, [255, 255, 255]);
      doc.text(f.severity.toUpperCase(), PW - MR - 13.5, top + 5.8, { align: 'center' });
      sans(11, 'bold'); setText(doc, INK);
      y = top + 5.6;
      for (const line of titleLines) { doc.text(line, ML + 4.5, y); y += 5.2; }
      y += 1.5;

      mono(6.8); setText(doc, colour); ensure(6);
      doc.text(fit(doc, `MEASURED ${f.measured ?? '—'} ${f.unit}   ·   GUIDELINE ${f.thresholdText}`, CW - 9), ML + 4.5, y);
      y += 5;
      wrapped(f.rationale, 9.1, BODY, CW - 9, 4.1, 'normal', ML + 4.5);
      y += 1;
      mono(6.2, true); setText(doc, GREEN); ensure(6);
      doc.text('WHAT TO DO', ML + 4.5, y); y += 3.8;
      wrapped(f.fix, 9.1, BODY, CW - 9, 4.1, 'normal', ML + 4.5);

      // Cost — engine result or an explicit refusal to guess.
      y += 1;
      mono(6.2, true); setText(doc, f.cost?.priced ? GREEN : MUT); ensure(6);
      doc.text('COST IMPACT', ML + 4.5, y); y += 3.8;
      if (f.cost?.priced) {
        wrapped(costText, 9.1, GREEN, CW - 9, 4.1, 'normal', ML + 4.5);
        // An upper bound printed in the same green as an achievable saving is
        // how a ceiling becomes a commitment in somebody's memory.
        if (f.cost.caveat) wrapped(f.cost.caveat, 8.8, AMBER, CW - 9, 4.0, 'italic', ML + 4.5);
      } else {
        wrapped(costText, 9.1, MUT, CW - 9, 4.1, 'normal', ML + 4.5);
        if (f.cost?.externalGuideline) {
          wrapped(f.cost.externalGuideline, 8.8, AMBER, CW - 9, 4.0, 'italic', ML + 4.5);
        }
      }
      // WHICH FEATURES BREAK IT. "max hole depth/diameter is 8.2" sends a
      // supplier hunting through the model; naming the hole, how many there are
      // and where the first one sits is a review document. Only the offenders
      // are listed — putting all twenty holes under a "hole too deep" finding
      // buries the two that are wrong.
      if (f.instances?.length) {
        mono(6.4, true); setText(doc, INK); ensure(5);
        doc.text(fit(doc, `${f.instanceCount ?? f.instances.length} of ${f.instanceTotal ?? '?'} checked features break this:`, CW - 9), ML + 4.5, y);
        y += 4;
        mono(6.2); setText(doc, BODY);
        for (const inst of f.instances.slice(0, 6)) {
          ensure(4.2);
          const dims = [
            inst.diaMm != null ? `\u00d8${inst.diaMm}` : null,
            inst.depthMm != null ? `x${inst.depthMm}` : null,
            inst.thicknessMm != null ? `t${inst.thicknessMm}` : null,
            inst.heightMm != null ? `h${inst.heightMm}` : null,
          ].filter(Boolean).join(' ');
          const at = inst.atXYZ?.length === 3 ? `at (${inst.atXYZ.map(v => Math.round(v)).join(', ')})` : '';
          const n = inst.count && inst.count > 1 ? `${inst.count}x ` : '';
          // The instance value carries the rule's OWN unit. It was hardcoded as
          // "ratio", which was true while every instance measure was
          // dimensionless and became a lie the moment the as-cast feature rules
          // started measuring a diameter in millimetres.
          doc.text(fit(doc, `    ${n}${dims}  ${inst.ratio ?? '—'} ${f.unit ?? ''}  ${at}`.replace(/\s+/g, ' '), CW - 12), ML + 4.5, y);
          y += 4;
        }
        if (f.instances.length > 6) {
          doc.text(fit(doc, `    ... and ${f.instances.length - 6} more`, CW - 12), ML + 4.5, y);
          y += 4;
        }
        y += 1;
      }
      mono(6); setText(doc, MUT); ensure(5);
      doc.text(fit(doc, `SOURCE [${SOURCE_GRADE[f.sourceStatus || 'industry-consensus']}]: ${f.source}`, CW - 9), ML + 4.5, y); y += 4;
      // WHICH MATERIAL THIS NUMBER IS FOR. A 3 r/t bend radius for 6061-T6 and a
      // generic 1 r/t band look identical on the page unless the report says
      // which it is, and the difference decides whether the part cracks.
      //
      // "process-generic" had ONE sentence for TWO different situations, and it
      // asserted the wrong one on every report where a material WAS chosen: the
      // cover read STEEL (MILD) and the finding beneath it read "no material was
      // given". The alloy had been passed and used; this rule simply has no
      // alloy-specific band, which is a different — and defensible — statement.
      if (f.thresholdBasis) {
        mono(6); setText(doc, f.thresholdBasis === 'process-generic' ? AMBER : GREEN); ensure(5);
        const line = f.thresholdBasis !== 'process-generic'
          ? `THRESHOLD: resolved for ${f.thresholdMatchedOn}`
          : f.thresholdMaterial
            ? `THRESHOLD: process-generic — ${f.thresholdMaterial} was applied, but this rule carries no alloy-specific band, so the process-wide value stands`
            : 'THRESHOLD: process-generic — no material was given, so this is the band for the process as a whole, not for your alloy';
        doc.text(fit(doc, line, CW - 9), ML + 4.5, y);
        y += 4;
      }
      setDraw(doc, RULE, 0.2); doc.line(ML, y + 1, PW - MR, y + 1);
      y += 8;
    }

    // "Nothing breached" is only true if something was actually checked. With
    // zero evaluated rules this line would be a green all-clear on a family
    // nobody looked at — the precise false reassurance this report exists to
    // avoid. The not-evaluated block below carries the real message instead.
    if (!r.findings.length && r.evaluatedCount > 0) {
      wrapped(`No rule in this family was breached by the measured geometry (${r.evaluatedCount} of ${r.ruleCount} checked).`, 9.2, GREEN);
      y += 3;
    }

    // Passed and unevaluated, compactly — the reader must be able to see what
    // was checked and what was not.
    if (r.passed.length) {
      ensure(12);
      mono(6.8, true); setText(doc, GREEN);
      doc.text(`PASSED (${r.passed.length})`, ML, y); y += 4.2;
      for (const p of r.passed) {
        ensure(5);
        sans(8.6); setText(doc, BODY);
        doc.text(fit(doc, `·  ${p.title} — measured ${p.measured ?? '—'} ${p.unit} against ${p.thresholdText}`, CW - 4), ML + 2, y);
        y += 4.2;
      }
      y += 3;
    }
    if (r.notEvaluated.length) {
      ensure(12);
      mono(6.8, true); setText(doc, MUT);
      doc.text(`NOT EVALUATED (${r.notEvaluated.length}) — these were NOT checked and are NOT passes`, ML, y); y += 4.2;
      for (const n of r.notEvaluated) {
        ensure(5);
        sans(8.6); setText(doc, MUT);
        doc.text(fit(doc, `·  ${n.title} — ${n.reason || 'no measurement available'}`, CW - 4), ML + 2, y);
        y += 4.2;
      }
      y += 3;
    }
  }

  // ── Where the money goes ──────────────────────────────────────────────────
  //
  // The first question a cost engineer asks of any part, and until this band
  // existed the report priced findings and priced alternatives without ever
  // showing the cost structure of the route in hand. Names the dominant driver
  // in a sentence, then the full stack — because "material is 35% of this part"
  // is the context every priced finding below it is read against.
  if (data.costDrivers?.rows?.length) {
    const cd = data.costDrivers;
    ensure(46);
    sectionTitle('Cost drivers', `Where the money goes at ${pdfSafe(cd.process)}`);
    if (cd.dominant) {
      const DRIVER_WORDS: Record<string, string> = {
        material: 'material — the metal bought, including scrap and yield', machine: 'machine time',
        labour: 'direct labour', setup: 'setup and changeover', finishing: 'finishing operations',
        tooling: 'tooling amortisation', overhead: 'plant overhead', commercial: 'logistics and packaging',
        sgaProfit: 'supplier SG&A and profit',
      };
      wrapped(`The largest single driver is ${DRIVER_WORDS[cd.dominant.driver] ?? cd.dominant.driver} at `
        + `EUR ${cd.dominant.eur.toFixed(2)} per part — ${cd.dominant.pct.toFixed(0)}% of the `
        + `EUR ${cd.totalEur.toFixed(2)} piece price. That is the lever the findings below should be read against.`,
        10, INK, CW, 4.4, 'bold');
      y += 3;
    }
    // A horizontal bar per driver, drawn to a common scale, largest first.
    const maxEur = Math.max(...cd.rows.map(r => r.eur), 0.01);
    const BAR_W = 96;
    for (const r of cd.rows) {
      ensure(6.4);
      sans(8.6); setText(doc, INK);
      doc.text(fit(doc, r.driver === 'sgaProfit' ? 'SG&A + profit' : r.driver, 34), ML, y);
      setFill(doc, PANEL); doc.rect(ML + 36, y - 3, BAR_W, 4, 'F');
      setFill(doc, r === cd.rows[0] ? GOLD : NAVY);
      doc.rect(ML + 36, y - 3, Math.max(0.8, BAR_W * (r.eur / maxEur)), 4, 'F');
      mono(7.6); setText(doc, BODY);
      doc.text(`EUR ${r.eur.toFixed(2)}`, ML + 36 + BAR_W + 4, y, { align: 'left' });
      doc.text(`${r.pct.toFixed(1)}%`, PW - MR, y, { align: 'right' });
      y += 6;
    }
    y += 2;
    const levers = [
      cd.inputMassKg != null ? `buy-to-fly ${cd.inputMassKg.toFixed(2)} kg in` : null,
      cd.cycleSecPerPart != null ? `${Math.round(cd.cycleSecPerPart)} s cycle` : null,
      cd.scrapPct != null ? `${cd.scrapPct}% scrap` : null,
      cd.toolingTotalEur != null ? `EUR ${Math.round(cd.toolingTotalEur).toLocaleString('en-GB')} tooling investment` : null,
    ].filter(Boolean).join('  ·  ');
    if (levers) { mono(7.2); setText(doc, MUT); doc.text(fit(doc, `THE LEVERS BEHIND THE ROWS:  ${levers}`, CW), ML, y); y += 5; }
    wrapped(cd.basis, 8, MUT, CW, 3.8, 'italic');
    y += 4;
  }

  // ── Alternative routes ────────────────────────────────────────────────────
  //
  // This section USED TO COME FIRST, and a reader opening the report met nine
  // processes before meeting the one they had chosen. The complaint was exact:
  // "it's giving all the different manufacturing process details". The rules
  // were never generic — only one family ever ran — but the running order said
  // otherwise, so the chosen process now leads and this is explicitly the
  // ALTERNATIVES to it, named as such, with the chosen row marked in place.
  if (data.routes?.routes?.length) {
    newPage();
    const chosenRow = data.routes.routes.find(r => r.isChosen) ?? null;
    sectionTitle('Alternative routes',
      chosenRow
        ? `Your route is ${chosenRow.process}, against the other ${data.routes.routes.length - 1}`
        : `${data.routes.routes.length} viable processes for ${data.material ?? 'this material'}`);
    wrapped(chosenRow
      ? 'The findings above are YOUR route and nobody else\'s. This page exists only to answer the next '
        + 'question — would another process make the same geometry for less. Each row is the same measured '
        + 'geometry run through THAT process\'s own rule family, priced by computeShouldCost and carbon-scored '
        + 'by computeCarbon on the cost engine\'s own input mass. Nothing is blended into a single ranking.'
      : String(data.routes.basis), 8.8, MUT, CW, 4.0, 'italic');
    y += 3;

    const cols = [
      { w: 52, label: 'Process', align: 'left' as const },
      { w: 20, label: 'Score', align: 'right' as const },
      { w: 18, label: 'Rules', align: 'right' as const },
      { w: 26, label: 'EUR/part', align: 'right' as const },
      { w: 28, label: 'Tooling', align: 'right' as const },
      { w: 22, label: 'kg CO2e', align: 'right' as const },
    ];
    const drawRow = (cells: string[], bold: boolean, colour: RGB) => {
      ensure(6);
      let x = ML;
      sans(8.2, bold ? 'bold' : 'normal'); setText(doc, colour);
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        const t = fit(doc, cells[i] ?? '', c.w - 2);
        doc.text(t, c.align === 'right' ? x + c.w - 2 : x, y, { align: c.align });
        x += c.w;
      }
      y += 5;
    };
    drawRow(cols.map(c => c.label), true, MUT);
    setDraw(doc, RULE, 0.3); doc.line(ML, y - 3.4, PW - MR, y - 3.4);

    // Cheapest first. A route with no price sorts LAST rather than being read as
    // zero, which would put every unpriceable option at the top.
    const sorted = [...data.routes.routes].sort((a, b) => {
      const av = a.piecePriceEur, bv = b.piecePriceEur;
      if (!Number.isFinite(av as number) && !Number.isFinite(bv as number)) return 0;
      if (!Number.isFinite(av as number)) return 1;
      if (!Number.isFinite(bv as number)) return -1;
      return (av as number) - (bv as number);
    });
    for (const r of sorted) {
      const colour = r.viable === false ? RED
        : r.netShape === false ? MUT
          : r.score === null ? MUT : r.score >= 70 ? GREEN : r.score >= 40 ? AMBER : RED;
      // The chosen route is drawn in place, on a band, rather than lifted to the
      // top: its position in a cheapest-first list IS the answer to "should I
      // have picked something else", and moving it would destroy that.
      if (r.isChosen) {
        setFill(doc, PANEL); doc.rect(ML - 2, y - 3.6, CW + 4, 5.6, 'F');
      }
      drawRow([
        r.process,
        // A score without its coverage invites comparison between a 9-of-9 check
        // and a 1-of-9 one, so the two are never more than a column apart.
        // A route the geometry rules out does not get a score. A number here
        // invites a comparison that has already been settled.
        r.viable === false ? 'NOT VIABLE'
          : r.netShape === false ? 'SECONDARY'
            : r.score === null ? '—' : String(r.score),
        `${r.evaluatedCount}/${r.ruleCount}`,
        r.piecePriceEur === null ? 'not priced' : `EUR ${r.piecePriceEur.toFixed(2)}`,
        r.toolingEur === null ? '—' : `EUR ${Math.round(r.toolingEur).toLocaleString('en-GB')}`,
        r.kgCo2e === null ? '—' : r.kgCo2e.toFixed(2),
      ], !!r.isChosen, colour);
      // A delta is only meaningful against the route you are actually on, so it
      // is printed on the alternatives and never on the chosen row itself.
      const delta = !r.isChosen && Number.isFinite(r.deltaPieceEur as number)
        ? `${(r.deltaPieceEur as number) < 0 ? '−' : '+'}EUR ${Math.abs(r.deltaPieceEur as number).toFixed(2)}/part vs your route`
          + (Number.isFinite(r.deltaToolingEur as number)
            ? `, ${(r.deltaToolingEur as number) < 0 ? '−' : '+'}EUR ${Math.abs(Math.round(r.deltaToolingEur as number)).toLocaleString('en-GB')} tooling`
            : '')
        : '';
      const note = [
        r.isChosen ? 'YOUR ROUTE — the findings above are this one' : '',
        r.viable === false ? `CANNOT MAKE THIS PART: ${r.blockedReason ?? 'a feasibility rule failed'}` : '',
        // Priced per part like a route, but it is not one — and a reader
        // comparing EUR 4.74 of broaching against EUR 6.55 of die casting is
        // comparing one operation with the whole part.
        r.viable !== false && r.netShape === false
          ? `NOT A ROUTE: ${r.secondaryReason ?? 'this process finishes a part rather than producing one'}` : '',
        r.viable === false || r.netShape === false ? '' : delta,
        r.highSeverityCount ? `${r.highSeverityCount} high-severity` : '',
        r.scoreCaveat ?? '',
      ].filter(Boolean).join(' · ');
      if (note) {
        mono(6.4); setText(doc, r.isChosen ? GOLD : MUT); ensure(4);
        doc.text(fit(doc, `    ${note}`, CW - 4), ML, y); y += 4;
      }
    }
    y += 2;
    setDraw(doc, RULE, 0.3); doc.line(ML, y, PW - MR, y); y += 5;

    // THE ONE SENTENCE A COST ENGINEER READS. A table of nine rows without it
    // leaves the reader to do the arithmetic that produced the table.
    if (chosenRow && Number.isFinite(chosenRow.piecePriceEur as number)) {
      // A route the geometry rules out is not a cheaper alternative, whatever
      // the cost engine says it would have cost.
      // WHAT MAY BE RECOMMENDED. Three gates, each added because the sentence
      // below landed somewhere it should not have: a blocked route (already
      // handled), a SECONDARY OPERATION offered as a way to make the part, and a
      // route on which NO RULE COULD BE EVALUATED. The last is the worst of the
      // three — Fine Blanking was ranked and priced for a die-cast bracket over
      // 0 of 6 rules, which is not a clean sheet, it is an unknown.
      const cheaper = sorted.filter(r => !r.isChosen
        && r.viable !== false
        && r.netShape !== false
        && (r.evaluatedCount ?? 0) > 0
        && Number.isFinite(r.piecePriceEur as number)
        && (r.piecePriceEur as number) < (chosenRow.piecePriceEur as number));
      if (!cheaper.length) {
        wrapped(`No viable route prices below ${chosenRow.process} on this geometry, so the piece price is not `
          + 'the lever here — the findings above are.', 9, GREEN, CW, 4.2, 'bold');
      } else {
        const best = cheaper[0];
        // Cheaper is not automatically better, and a report that says "switch"
        // without naming what the switch costs is a sales pitch.
        wrapped(`${best.process} prices ${((chosenRow.piecePriceEur as number) - (best.piecePriceEur as number)).toFixed(2)} EUR/part `
          + `below ${chosenRow.process}`
          + (Number.isFinite(best.toolingEur as number) && Number.isFinite(chosenRow.toolingEur as number)
            ? ` on ${(best.toolingEur as number) < (chosenRow.toolingEur as number) ? 'lower' : 'higher'} tooling `
              + `(EUR ${Math.round(best.toolingEur as number).toLocaleString('en-GB')} against `
              + `EUR ${Math.round(chosenRow.toolingEur as number).toLocaleString('en-GB')})`
            : '')
          + `, and scores ${best.score === null ? 'nothing — no rule in its family could be evaluated' : best.score} `
          + `over ${best.evaluatedCount} of ${best.ruleCount} rules`
          + (best.highSeverityCount ? ` with ${best.highSeverityCount} high-severity finding${best.highSeverityCount === 1 ? '' : 's'}` : '')
          + '. That is a quotation to ask for, not a decision this tool has taken for you.',
          9, BODY, CW, 4.2);
      }
      y += 3;
    }
    if (data.routes.skipped.length) {
      // Named, not hidden: the absence of a process from this list looks like an
      // oversight unless the list says why.
      wrapped(`Not applicable to ${data.material}: ${data.routes.skipped.map(s => s.process).join(', ')}.`,
        8.6, MUT, CW, 4.0, 'italic');
    }
    y += 4;
  }

  // ── DFA ────────────────────────────────────────────────────────────────────
  const dfa = data.dfa as Record<string, any> | null | undefined;
  if (dfa) {
    newPage();
    sectionTitle('Design for Assembly', `${dfa.totalParts} parts · ${dfa.distinctPartTypes} distinct types`);
    const tilesA: [string, string, RGB][] = [
      [String(dfa.totalParts ?? '—'), 'PARTS', NAVY],
      [`${dfa.totalAssemblyTimeSec ?? '—'} s`, 'ASSEMBLY TIME', TEAL],
      [dfa.theoreticalMinParts == null ? 'withheld' : String(dfa.theoreticalMinParts), 'THEORETICAL MIN', dfa.theoreticalMinParts == null ? MUT : GREEN],
      [dfa.designEfficiencyPct == null ? 'withheld' : `${dfa.designEfficiencyPct}%`, 'DFA INDEX', dfa.designEfficiencyPct == null ? MUT : GOLD],
    ];
    ensure(26);
    // Its own width. This used to borrow `tw` from the cover's tile row, so
    // deleting that row broke the DFA page — a coupling nothing declared.
    const tw = (CW - 9) / 4;
    tilesA.forEach(([v, l, c], i) => {
      const x = ML + i * (tw + 3);
      setFill(doc, c); doc.roundedRect(x, y, tw, 20, 2, 2, 'F');
      sans(v.length > 8 ? 9 : 14, 'bold'); setText(doc, [255, 255, 255]);
      doc.text(fit(doc, v, tw - 4), x + tw / 2, y + 9.5, { align: 'center' });
      mono(5.4); setText(doc, [226, 232, 240]);
      doc.text(l, x + tw / 2, y + 15.5, { align: 'center' });
    });
    y += 28;

    if (dfa.completeness?.note) {
      wrapped(String(dfa.completeness.note), 9.1, dfa.completeness.indexAvailable ? BODY : AMBER);
      y += 3;
    }
    wrapped(`Handling and insertion times come from the ${dfa.timeModel?.version} model. ${dfa.timeModel?.basis}`, 8.8, MUT, CW, 4.0, 'italic');
    y += 5;

    // Part table
    ensure(14);
    const cols = [10, 46, 20, 22, 22, 22, 26];
    const heads = ['#', 'PART', 'OFF', 'a+b', 'HANDLE s', 'INSERT s', 'TOTAL s'];
    setFill(doc, NAVY); doc.rect(ML, y - 3.6, CW, 5.4, 'F');
    mono(6.2, true); setText(doc, [255, 255, 255]);
    let cx = ML + 2;
    heads.forEach((h, i) => { doc.text(h, cx, y); cx += cols[i]; });
    y += 4;
    (dfa.rows || []).forEach((row: any, i: number) => {
      if (row.skipped) return;
      ensure(5.5);
      if (i % 2 === 1) { setFill(doc, PANEL); doc.rect(ML, y - 3.2, CW, 4.6, 'F'); }
      sans(8); setText(doc, BODY);
      const cells = [
        String(row.index),
        fit(doc, String(row.name ?? ''), cols[1] - 3),
        String(row.groupSize ?? 1),
        row.symmetry?.totalDeg != null ? `${row.symmetry.totalDeg}` : '—',
        String(row.time?.handlingSec ?? '—'),
        String(row.time?.insertionSec ?? '—'),
        String(row.time?.totalSec ?? '—'),
      ];
      cx = ML + 2;
      cells.forEach((c, ci) => { doc.text(c, cx, y); cx += cols[ci]; });
      y += 4.6;
    });
    y += 6;

    if ((dfa.consolidationCandidates || []).length) {
      ensure(12);
      mono(6.8, true); setText(doc, GOLD);
      doc.text('CONSOLIDATION CANDIDATES', ML, y); y += 4.2;
      for (const c of dfa.consolidationCandidates) {
        ensure(5);
        sans(9); setText(doc, BODY);
        doc.text(fit(doc, `·  ${c.name} — ${c.timeSec} s of assembly time, and answers "no" to all three DFA questions`, CW - 4), ML + 2, y);
        y += 4.4;
      }
      y += 3;
    }
    if ((dfa.suspectedFasteners || []).length) {
      wrapped(`Suspected fasteners (geometric signature only, confirm against the BOM): ${dfa.suspectedFasteners.map((f: any) => `${f.name} (${f.confidence})`).join(', ')}.`, 8.9, MUT, CW, 4.1, 'italic');
      y += 3;
    }
  }

  // ── Appendix: method, provenance and limits ───────────────────────────────
  //
  // ALL OF IT AT THE BACK, ON ONE PAGE. This used to be two full pages of
  // bullets at the end PLUS three paragraphs on the cover, and between them
  // they said the same things twice. Method belongs behind the answer in an
  // engineering report; a reader who wants to audit the numbers will turn to
  // it, and a reader who wants the answer should never have to scroll past it.
  newPage();
  sectionTitle('Appendix', 'Where every number came from');

  const appendix: [string, string][] = [
    ['Geometry',
      'Measured by an OpenCascade kernel. Draft angles, undercut classification and wall thickness on the '
      + 'tessellation — which works on freeform surfaces, where a plane-and-cylinder analysis measures almost '
      + 'nothing on a real cast or moulded part. Holes, apertures and features from the B-rep topology. '
      + 'The AI wrote none of the numbers in this report.'],
    ['Draw direction',
      'Chosen by sweeping candidate axes and scoring undercut area, not assumed. Undercuts are separated from '
      + 'zero-draft drag faces: a zero-draft wall is fixable with a degree of taper, an undercut buys a slide '
      + 'or a lifter, and reporting them as one number would overstate the tooling problem.'],
    ['Cost',
      'Re-run through the same deterministic engines used elsewhere in BrainSpark, once with the geometry as '
      + 'drawn and once with the rule satisfied. Findings the engines cannot price say so, with the reason.'],
    ['Thresholds',
      `Every DIMENSION here was measured from your file and is reproducible. The GUIDELINES they are compared `
      + `against are not of the same standing. `
      + (haveGrades
        ? `${gradeCounts['industry-consensus'] ?? 0} of ${totalCatalogueRules} rest on industry consensus — `
          + `widely published and mutually consistent, but not audited against a primary standard and not `
          + `validated against measured scrap data. ${gradeCounts['standard-named'] ?? 0} name a published `
          + `standard that has not been read first-hand; ${gradeCounts['engine-derived'] ?? 0} come from this `
          + `tool's own model. `
        // Said plainly rather than as three zeros. A reader who is told the
        // counts are missing can go and get them; one who is shown "0 of 216"
        // has been misinformed by a number that looks measured.
        : 'The catalogue-wide counts were not sent with this analysis, so they are not stated here — '
          + 'each finding still carries its own grade beside its source, which is where the claim that '
          + 'matters for that finding lives. ')
      + `Every finding carries its grade. Treat a finding as a screening result that opens a `
      + `conversation with your supplier — not as a specification.`],
    ['Three outcomes, not two',
      'Failed, passed, and NOT EVALUATED. A rule whose measurement this part does not provide is listed as '
      + 'unevaluated with the reason, never as a pass — so the coverage figure beside the score tells you how '
      + 'much of the catalogue actually ran.'],
    ['DFA',
      'Handling times follow the published Boothroyd-Dewhurst METHOD. Their tables are copyrighted and are not '
      + 'reproduced; the coefficients here are ours and should be calibrated against your own line data before '
      + 'a labour commitment. Part symmetry is MEASURED by rotating each solid and intersecting it with itself, '
      + 'not inferred from inertia. The three DFA questions concern function and intent, which a static solid '
      + 'cannot answer — until every part is answered, the theoretical minimum and the index are withheld.'],
    ['What this does not cover',
      'Threads are not recognised. GD&T is read only where the file carries semantic AP242 PMI. Ribs are found '
      + 'from opposed planar side faces on a planar base, so a rib with curved sides is not checked. Surface '
      + 'finish and material come from your input, not from the model. The tool-reach sweep does not model the '
      + 'holder, the spindle nose or the machine envelope, so a face it calls reachable may still not be.'],
  ];
  for (const [k, v] of appendix) {
    ensure(measure(v, 8.6, CW - 32, 3.9) + 6);
    mono(6.4, true); setText(doc, GOLD);
    doc.text(k.toUpperCase(), ML, y);
    const top = y;
    wrapped(v, 8.6, BODY, CW - 32, 3.9, 'normal', ML + 32);
    y = Math.max(y, top + 4) + 3;
  }

  doc.save(safeName(`BrainSpark_DFM_${subject}_${today}.pdf`));
}

// ── Excel ────────────────────────────────────────────────────────────────────

export async function exportDfmXlsx(data: DfmReportData, diff: DfmDiff | null = null): Promise<void> {
  const subject = data.partName || data.fileName || 'Part';
  const today = new Date().toISOString().split('T')[0];
  const sheets: SheetSpec[] = [];
  const dfm = (data.dfm || {}) as Record<string, any>;
  const wall = dfm.wallThickness || {};
  const draft = dfm.draft || {};
  const feats = dfm.features || {};
  const g = (data.geometry || {}) as Record<string, any>;

  const evaluatedAll = data.results.reduce((s2, r) => s2 + r.evaluatedCount, 0);
  const ruleAll = data.results.reduce((s2, r) => s2 + r.ruleCount, 0);
  const findingsAll = data.results.flatMap(r => r.findings);
  const pricedAll = data.results.reduce((s2, r) => s2 + (r.impact?.annualEur || 0), 0);
  const ran = data.results.filter(r => r.ruleCount > 0);
  const one = ran.length === 1 ? ran[0] : null;
  // Its own, not the PDF's: the two exporters are separate functions and the
  // caveat must not depend on which one ran first.
  const hasUpperBound = data.results.some(r => r.findings.some(f => f.cost?.upperBound));

  // ── Sheet 1: THE ANSWER ─────────────────────────────────────────────────
  //
  // This sheet used to open with a bounding box and close with a rule count —
  // a geometry dump, the same fault page one of the PDF had. Whoever opens the
  // workbook wants the verdict, and the geometry is evidence for it, so the
  // verdict goes first and the evidence goes underneath.
  sheets.push({
    name: 'Summary',
    title: `BrainSpark DFM / DFA — ${subject}`,
    subtitle: `Generated ${today}. Geometry measured by an OpenCascade kernel; cost by BrainSpark's deterministic engines. No figure in this workbook was written by an AI.`,
    headerRow: 0, zebra: true, colWidths: [34, 30, 74], wrapCols: [2],
    statusColors: [{ match: 'HIGH SEVERITY', argb: 'FFFDECEC' }],
    rows: [
      ['Item', 'Value', 'Note'],

      ['— VERDICT —', '', ''],
      ['Process route', data.subject?.process ?? one?.processName ?? 'not specified',
        one ? `Judged against the ${one.processName} ruleset and nothing else.`
          : `${ran.length} rule families were run speculatively — some findings will be for a route this part will never take.`],
      ['Material', data.material ?? data.subject?.material ?? 'not specified',
        'Sets the threshold wherever the alloy changes it, and the mass the cost is computed on.'],
      ['Manufacturability score', one?.score ?? 'not scored',
        one?.score == null ? 'No rule could be evaluated, so there is no score — this is not a clean sheet.'
          : `Out of 100, over the ${one.evaluatedCount} rules that could be evaluated.`],
      ['Rule coverage', one ? `${one.coveragePct}%` : `${evaluatedAll} of ${ruleAll}`,
        `${evaluatedAll} of ${ruleAll} evaluated. The remainder could not be measured on this geometry and are NOT passes — see the "Not evaluated" sheet.`],
      ['Findings', findingsAll.length, 'Rules the geometry breached.'],
      ['HIGH SEVERITY', findingsAll.filter(f => f.severity === 'high').length,
        'Findings that change the tool, the process or the part — not a finish note.'],
      ['Priced impact EUR/year', pricedAll || 'none priced',
        hasUpperBound
          ? 'CEILING, not an estimate: at least one finding assumes the most aggressive redesign available.'
          : 'Re-run through the same cost engine, once as drawn and once with the rule satisfied.'],

      ['— MEASURED GEOMETRY —', '', ''],
      ['Bounding box', g.boundingBox ? `${g.boundingBox.xMm} x ${g.boundingBox.yMm} x ${g.boundingBox.zMm} mm` : '—', 'From the CAD model'],
      ['Volume cm3', g.volume?.cm3 ?? '—', 'Exact from the kernel'],
      ['Wall thickness p50 mm', wall.p50Mm ?? 'not measured', 'Area-weighted median, ray-cast on the tessellation'],
      ['Wall thickness p5 mm', wall.p5Mm ?? 'not measured', 'The thin tail — where cold shuts and short shots start'],
      ['Wall uniformity', wall.uniformity ?? '—', 'Robust spread ratio, not standard deviation'],
      ['Wall cross-check 2V/A mm', wall.referenceWallMm ?? '—',
        wall.confidenceNote ? String(wall.confidenceNote) : 'Independent check on the ray cast: exact for a thin uniform shell, indicative otherwise.'],
      ['Wall measured over', wall.measuredAreaPct != null ? `${wall.measuredAreaPct}% of surface` : '—',
        'The share of the surface the rays returned a valid opposed-face hit on.'],
      ['Draw direction', draft.drawDirectionXYZ ? draft.drawDirectionXYZ.join(', ') : '—', 'Chosen by sweeping candidate axes, not assumed'],
      ['Undercut regions', draft.undercutFaceCount ?? '—', 'Occluded in both tool halves — needs a slide or lifter'],
      ['Wall area below min draft %', draft.wallAreaBelowMinDraftPct ?? '—', 'Drag faces, distinct from undercuts'],
      ['Holes & cut-outs', (dfm.apertures?.count ?? 0) || 'none',
        (dfm.apertures?.count ?? 0) ? `${dfm.apertures.circularCount} round, ${dfm.apertures.nonCircularCount} shaped` : 'No inner wire found in any face.'],
      ['Unclassified surface area %', feats.unclassifiedAreaPct ?? '—', 'What the feature recogniser could not name'],
    ],
  });

  // ── Sheet 2: EVERY VIABLE ROUTE ─────────────────────────────────────────
  //
  // Missing from this workbook entirely, and it is the sheet a cost engineer
  // would reach for first — a table you can sort by price is exactly what a
  // spreadsheet is for, and it existed only in the PDF where you cannot.
  const routes = data.routes?.routes ?? [];
  if (routes.length) {
    sheets.push({
      name: 'Cost drivers',
      title: data.costDrivers
        ? `Where the money goes — ${data.costDrivers.process} at EUR ${data.costDrivers.totalEur.toFixed(2)}/part`
        : 'Cost drivers',
      subtitle: data.costDrivers?.basis ?? 'Not available: the cost engine needs a material, a process and a computable mass.',
      headerRow: 0,
      zebra: true,
      colWidths: [24, 14, 18, 8],
      numFmt: { 1: '#,##0.00', 2: '0.0"%"' },
      rows: [
        ['Driver', 'EUR / part', '% of piece price', 'Rank'],
        ...(data.costDrivers?.rows ?? []).map((r, i) => [
          r.driver === 'sgaProfit' ? 'SG&A + profit' : r.driver,
          Number(r.eur.toFixed(2)), Number(r.pct.toFixed(1)), i + 1,
        ]),
      ],
    },
    {
      name: 'Routes',
      title: `Alternative routes — ${routes.length} viable for ${data.material ?? 'this material'}`,
      subtitle: (data.routes?.chosenProcess
        ? `Your route is ${data.routes.chosenProcess}. Every other row is the SAME measured geometry run through THAT process's own rule family. `
        : '')
        + 'Nothing is blended into a single ranking: cost, manufacturability and CO2e are three different questions. A route marked NOT VIABLE cannot make this part at all — its price is shown only so the exclusion is auditable.',
      headerRow: 0, zebra: true, autoFilter: true,
      colWidths: [30, 14, 12, 10, 14, 14, 14, 12, 14, 14, 60],
      numFmt: { 4: '#,##0.00', 5: '#,##0', 6: '#,##0.00', 7: '#,##0.00', 8: '#,##0.00', 9: '#,##0' },
      statusColors: [
        { match: 'NOT VIABLE', argb: 'FFFDECEC' },
        { match: 'YOUR ROUTE', argb: 'FFFFF7E8' },
      ],
      rows: [[
        'Process', 'Status', 'Score', 'Rules', 'EUR/part', 'Tooling EUR', 'Buy-to-fly kg',
        'kg CO2e', 'Δ EUR/part', 'Δ tooling EUR', 'Caveat or reason',
      ], ...routes.map(r => [
        r.process,
        r.viable === false ? 'NOT VIABLE' : r.isChosen ? 'YOUR ROUTE' : 'alternative',
        r.score ?? '', `${r.evaluatedCount}/${r.ruleCount}`,
        r.piecePriceEur ?? '', r.toolingEur ?? '', r.inputMassKg ?? '', r.kgCo2e ?? '',
        r.isChosen ? '' : (r.deltaPieceEur ?? ''), r.isChosen ? '' : (r.deltaToolingEur ?? ''),
        [r.viable === false ? `CANNOT MAKE THIS PART: ${r.blockedReason ?? ''}` : '',
          r.highSeverityCount ? `${r.highSeverityCount} high-severity` : '',
          r.scoreCaveat ?? '', r.costReason ?? '', r.carbonReason ?? ''].filter(Boolean).join(' · '),
      ])],
    });
    if (data.routes?.skipped?.length) {
      sheets.push({
        name: 'Routes not applicable',
        title: `Processes ${data.material ?? 'this material'} cannot take`,
        subtitle: 'Named, not hidden: the absence of a process from the route table looks like an oversight unless the table says why.',
        headerRow: 0, zebra: true, colWidths: [36, 96], wrapCols: [1],
        rows: [['Process', 'Why it is not offered'],
          ...data.routes.skipped.map(x => [x.process, x.reason])],
      });
    }
  }

  // ── Sheet-metal forming ────────────────────────────────────────────────────
  // Press class, strip utilisation, bend allowance and draw stages. These are
  // FIGURES rather than verdicts — a tonnage is not a pass or a fail — and they
  // are the numbers a stamping engineer reaches for first. Every one of them
  // carries the equation it came from.
  {
    const sf = (data as Record<string, any>).sheetForming;
    if (sf && !sf.unavailable) {
      const rows: Array<Array<string | number>> = [['Figure', 'Value', 'How it was computed']];
      if (sf.press) {
        rows.push(['Blanking force', `${sf.press.blankingKN} kN`, sf.press.basis]);
        rows.push(['Bending force', `${sf.press.bendingKN} kN`, 'Eq. 5.7, summed over recognised bends']);
        rows.push(['Total with press margin', `${sf.press.totalKN} kN`, 'Eq. 4.4 adds 30% for dull edges, friction and thickness variation']);
        rows.push(['Press required', sf.press.beyondLadder ? 'beyond the standard ladder — this is a transfer-line part'
          : `${sf.press.pressTonnes} t (needs ${sf.press.requiredTonnes} t)`, sf.press.basis]);
      }
      if (sf.stripLayout) {
        rows.push(['Strip utilisation', `${sf.stripLayout.utilisationPct} %`, sf.stripLayout.basis]);
        rows.push(['Strip width', `${sf.stripLayout.stripWidthMm} mm`, `edge web ${sf.stripLayout.edgeWebMm} mm (Eq. 4.7)`]);
        rows.push(['Feed pitch', `${sf.stripLayout.pitchMm} mm`, `blank-to-blank web ${sf.stripLayout.blankWebMm} mm (Table 4.3)`]);
      }
      if (sf.bendAllowance) {
        rows.push(['Bend allowance, total', `${sf.bendAllowance.totalMm} mm`, sf.bendAllowance.basis]);
      }
      if (sf.springback) {
        rows.push(['Worst springback', `${sf.springback.overbendPct} % overbend`,
          `${sf.springback.basis} on the R${sf.springback.insideRadiusMm} bend`]);
      }
      if (sf.drawStages) {
        rows.push(['Draw operations', `${sf.drawStages.stages}${sf.drawStages.beyondTable ? ' (beyond the table)' : ''}`,
          `${sf.drawStages.basis}. Blank ${sf.drawStages.blankDiaMm} mm by ${sf.drawStages.blankBasis}`]);
      }
      if (rows.length > 1) {
        sheets.push({
          name: 'Sheet forming',
          title: 'Press, strip and forming figures',
          subtitle: "From Boljanovic, 'Sheet Metal Forming Processes and Die Design' — read first-hand, "
            + 'equation numbers in the last column. These are figures, not verdicts.',
          headerRow: 0, zebra: true, colWidths: [28, 26, 96], wrapCols: [2],
          rows,
        });
      }
    }
  }

  // ── Die-casting capability (NADCA) ────────────────────────────────────────
  // The figures a die-casting engineer checks a drawing against, whether or
  // not a rule fired. Each row carries the table it came from, in the same
  // figure-not-verdict discipline as the sheet-forming block above.
  {
    const sf = (data as Record<string, any>).sheetForming;
    if (sf) {
      const rows: Array<Array<string | number>> = [['Figure', 'Value', 'Where it comes from']];
      const s402 = sf.nadca402Summary;
      if (s402) {
        rows.push([`Linear capability at ${s402.largestDimensionMm} mm (${s402.grade})`,
          `±${s402.linearPlusMinusMm} mm`,
          'NADCA #402 (2021) Tables S/P-4A-1, computed at this part’s largest dimension']);
        if (s402.partingLinePlusMm != null) {
          rows.push([`Parting-line adder (${s402.projectedAreaCm2} cm² projected)`,
            `+${s402.partingLinePlusMm} mm`,
            `Tables S/P-4A-2 — PLUS-ONLY, across the parting line. ${s402.projectedAreaBasis}`]);
        } else if (s402.partingLineNote) {
          rows.push(['Parting-line adder', 'consult the die caster', s402.partingLineNote]);
        }
      }
      if (sf.nadca402Tolerance) {
        const t = sf.nadca402Tolerance;
        rows.push([t.from === 'declared' ? 'Declared band vs capability' : `Worst PMI band (on ${t.dimensionMm} mm)`,
          `${t.bandMm} mm vs ${t.capabilityBandMm} mm → ${t.margin}×`, t.basis]);
      }
      if (sf.nadca402Flatness) {
        const f = sf.nadca402Flatness;
        rows.push([`Flatness capability at ${f.diagonalMm} mm diagonal (${f.grade})`,
          `${f.capabilityMm} mm (declared ${f.declaredMm} mm)`, f.basis]);
      }
      if (sf.nadcaDraft) {
        rows.push(['General-note draft the drawing should carry',
          `${sf.nadcaDraft.outsideDeg}° outside / ${sf.nadcaDraft.insideDeg ?? sf.nadcaDraft.outsideDeg * 2}° inside`,
          sf.nadcaDraft.basis ?? 'NADCA draft formula at this part’s own depth']);
      }
      if (sf.nadcaFillet) {
        rows.push(['Fillet the wall wants', `${sf.nadcaFillet.requiredMm} mm (measured ${sf.nadcaFillet.measuredMm} mm)`,
          sf.nadcaFillet.basis]);
      }
      if (sf.nadcaCoredHole) {
        rows.push([`Worst cored hole (Ø${sf.nadcaCoredHole.diaMm} mm)`,
          `${sf.nadcaCoredHole.measuredDeg}° vs ${sf.nadcaCoredHole.requiredDeg}° needed`,
          sf.nadcaCoredHole.basis]);
      }
      if (sf.nadcaSkin) {
        rows.push(['Machining stock vs chilled skin', `${sf.nadcaSkin.stockMm} mm declared, skin ${sf.nadcaSkin.skinMinMm}–${sf.nadcaSkin.skinMaxMm} mm`,
          sf.nadcaSkin.basis]);
      }
      if (sf.nadcaRoughness) {
        rows.push(['As-cast roughness vs asked', `${sf.nadcaRoughness.askedUin} µin asked, ${sf.nadcaRoughness.overDieLifeUin} µin over die life`,
          sf.nadcaRoughness.basis]);
      }
      if (rows.length > 1) {
        sheets.push({
          name: 'Die casting',
          title: 'What NADCA promises for this part',
          subtitle: 'NADCA #402 (2021, 11th ed.) capability computed at this part’s own dimensions, plus the '
            + 'design-book figures. Figures, not verdicts — a drawing tighter than these is a conversation '
            + 'with the die caster, and a cost.',
          headerRow: 0, zebra: true, colWidths: [42, 32, 76], wrapCols: [2],
          rows,
        });
      }

      // ── Steel casting (SFSA Supplement 1) — same contract, own sheet ─────
      // Mutually exclusive with the NADCA rows by material, so a workbook
      // carries one or the other, never a mislabeled mixture.
      const steelRows: Array<Array<string | number>> = [['Figure', 'Value', 'Where it comes from']];
      if (sf.sfsaMinSection) {
        const s = sf.sfsaMinSection;
        steelRows.push([`Minimum section at a ${s.runLengthMm} mm run`,
          `${s.requiredMm} mm${s.digitized ? ' (from the Fig. 1 curve)' : ''}`, s.basis]);
      }
      if (sf.sfsaJunctionFillet) {
        const s = sf.sfsaJunctionFillet;
        steelRows.push(['Junction fillet the steel wants',
          `${s.requiredMm} mm${s.measuredMm != null ? ` (smallest measured ${s.measuredMm} mm)` : ''}`, s.basis]);
      }
      if (sf.sfsaRibNeutrality) {
        const s = sf.sfsaRibNeutrality;
        steelRows.push([`Worst rib vs thermal neutrality (${s.thicknessMm} mm on the wall)`,
          `${s.heightMm} mm tall vs ${s.neutralHeightMm} mm neutral`, s.basis]);
      }
      if (sf.sfsaBoss) {
        steelRows.push(['Largest boss vs parent wall',
          `${sf.sfsaBoss.diaMm} mm dia on ${sf.sfsaBoss.wallMm} mm → ${sf.sfsaBoss.ratio}x`, sf.sfsaBoss.basis]);
      }
      if (sf.sfsaCoreDia) {
        const s = sf.sfsaCoreDia;
        steelRows.push([`Worst core (Ø${s.diaMm} mm, ${s.depthMm} mm deep)`,
          `recommended minimum Ø${s.recommendedMinDiaMm} mm`, s.basis]);
      }
      // Supplement 3: what SFSA 2000 promises dimensionally, at this part's size.
      if (sf.sfsaCtSummary) {
        const s = sf.sfsaCtSummary;
        steelRows.push([`Dimensional capability at ${s.largestDimensionMm} mm (${s.grade}, ${s.series} series)`,
          `${s.totalBandMm} mm total band`, s.basis]);
      }
      if (sf.sfsaSandTolerance) {
        const s = sf.sfsaSandTolerance;
        steelRows.push([s.from === 'declared' ? `Declared band vs ${s.grade}` : `Worst PMI band (on ${s.dimensionMm} mm) vs ${s.grade}`,
          `${s.bandMm} mm vs ${s.capabilityBandMm} mm → ${Math.round(s.margin * 1000) / 1000}×`, s.basis]);
      }
      if (sf.sfsaCapabilityModel) {
        const s = sf.sfsaCapabilityModel;
        const route = (k: string, label: string) => {
          const r = s[k];
          if (!r || r.unavailable) return `${label}: ${r?.unavailable ?? 'n/a'}`;
          return `${label} ${r.p50Mm}-${r.p90Mm} mm`;
        };
        steelRows.push([`Expected 6σ spread per molding route (${s.lengthMm} mm, ${s.weightKg} kg)`,
          [route('greenSand', 'green sand'), route('noBake', 'no-bake'), route('shell', 'shell')].join(' · '),
          s.basis]);
      }
      if (sf.sfsaSandFlatness) {
        const s = sf.sfsaSandFlatness;
        steelRows.push([`Flatness capability at ${s.diagonalMm} mm diagonal (${s.ctg})`,
          `${s.capabilityMm} mm (declared ${s.declaredMm} mm)`, s.basis]);
      }
      if (sf.sfsaRma) {
        const s = sf.sfsaRma;
        steelRows.push([`Required machining allowance (grade ${s.grade}, ${s.largestDimensionMm} mm casting)`,
          `${s.requiredMm} mm per surface${s.declaredMm != null ? ` (declared ${s.declaredMm} mm)` : ''}`, s.basis]);
      }
      if (sf.sfsaWeightTolerance) {
        const s = sf.sfsaWeightTolerance;
        steelRows.push(['Weight tolerance (ISO 4990)',
          `±${s.machineMoldedPct}% machine molded / ±${s.handMoldedPct}% hand molded on ${s.weightKg} kg`, s.basis]);
      }
      if (steelRows.length > 1) {
        sheets.push({
          name: 'Steel casting',
          title: 'What the SFSA handbook asks of this part',
          subtitle: 'SFSA Steel Castings Handbook Supplement 1 "Design Rules and Data", read first-hand and '
            + 'computed at this part’s own dimensions. Figures, not verdicts; curve-derived values say so.',
          headerRow: 0, zebra: true, colWidths: [42, 32, 76], wrapCols: [2],
          rows: steelRows,
        });
      }

      // ── Injection moulding (DuPont Module I) — same contract, own sheet ──
      const dpRows: Array<Array<string | number>> = [['Figure', 'Value', 'Where it comes from']];
      if (sf.resinDraft) {
        const s = sf.resinDraft;
        dpRows.push([`Required draft (${s.group}, ${s.band} draw of ${s.drawDepthMm} mm)`,
          `${s.requiredDeg}° per side${s.wallAreaBelowRequiredPct != null ? ` (${s.wallAreaBelowRequiredPct}% of wall below it)` : ''}`,
          s.basis]);
      }
      if (sf.resinFillet) {
        const s = sf.resinFillet;
        dpRows.push(['Internal corner radius the resin wants',
          `${s.requiredMm} mm${s.measuredMm != null ? ` (smallest measured ${s.measuredMm} mm)` : ''}`, s.basis]);
      }
      if (sf.dupontBoss) {
        const s = sf.dupontBoss;
        dpRows.push([`Worst boss vs its hole (Ø${s.bossDiaMm} on Ø${s.holeDiaMm} mm)`,
          `${Math.round(s.ratio * 100) / 100}× (band ${s.minRatio}–${s.maxRatio}×)`, s.basis]);
      }
      if (dpRows.length > 1) {
        sheets.push({
          name: 'Injection moulding',
          title: 'What DuPont Module I asks of this part',
          subtitle: 'DuPont General Design Principles for Engineering Polymers, Module I — read first-hand and '
            + 'computed at this part’s own dimensions and resin. Figures, not verdicts.',
          headerRow: 0, zebra: true, colWidths: [42, 32, 76], wrapCols: [2],
          rows: dpRows,
        });
      }

      // ── ISO 8062-4 (non-ferrous castings) — same contract, own sheet ─────
      const isoRows: Array<Array<string | number>> = [['Figure', 'Value', 'Where it comes from']];
      if (sf.iso8062PmTolerance) {
        const s = sf.iso8062PmTolerance;
        isoRows.push([s.from === 'declared'
          ? `Permanent-mould capability: declared band vs ${s.grade}`
          : `Permanent-mould capability: worst PMI band (on ${s.dimensionMm} mm) vs ${s.grade}`,
        `${s.bandMm} mm vs ${s.capabilityBandMm} mm → ${Math.round(s.margin * 1000) / 1000}×`, s.basis]);
      }
      if (sf.iso8062Draft) {
        const label: Record<string, string> = {
          'sand-casting': 'sand (hand moulding)', 'shell-mould': 'shell (machine moulding table)',
          'gravity-die': 'gravity die', 'lpdc': 'low-pressure die', 'investment-casting': 'investment',
        };
        for (const [fam, d] of Object.entries(sf.iso8062Draft as Record<string, any>)) {
          if (!d || d.requiredDeg == null) continue;
          isoRows.push([`Draft the standard asks by ${label[fam] ?? fam} (${d.drawDepthMm} mm draw)`,
            `${d.requiredDeg}° per side${d.wallAreaBelowRequiredPct != null ? ` (${d.wallAreaBelowRequiredPct}% of wall below it)` : ''}`,
            d.basis]);
        }
      }
      if (isoRows.length > 1) {
        sheets.push({
          name: 'ISO 8062-4',
          title: 'What ISO 8062-4 promises for this casting',
          subtitle: 'ISO 8062-4:2017 general tolerances for castings, read first-hand and computed at this '
            + 'part’s own dimensions and metal group. Figures, not verdicts — draft is judged at Grade A '
            + '(fine) external, the least demanding printed column, so internal walls need more.',
          headerRow: 0, zebra: true, colWidths: [42, 32, 76], wrapCols: [2],
          rows: isoRows,
        });
      }

      // ── DIN 16742 (moulded parts) — same contract, own sheet ─────────────
      const dinRows: Array<Array<string | number>> = [['Figure', 'Value', 'Where it comes from']];
      if (sf.din16742Summary) {
        const s = sf.din16742Summary;
        dinRows.push([`Tolerance group for this resin (Annex C column ${s.letter}, series ${s.series})`,
          s.tg, s.basis]);
        if (s.totalBandMm != null) {
          dinRows.push([`Dimensional capability at ${s.largestDimensionMm} mm (${s.tg})`,
            `±${s.plusMinusMm} mm (${s.totalBandMm} mm total band)`,
            'DIN 16742 Table 2, non-tool-specific column, at the part’s largest dimension.']);
        }
        if (s.profileToleranceMm != null) {
          dinRows.push([`General profile-form tolerance at the ${s.profileDiagonalMm} mm diagonal`,
            `${s.profileToleranceMm} mm`,
            'DIN 16742 Table 10: the general tolerance for freeform and profile surfaces, keyed on the DP dimension — the bounding diagonal is its upper bound here.']);
        }
      }
      if (sf.din16742Tolerance) {
        const s = sf.din16742Tolerance;
        dinRows.push([s.from === 'declared' ? `Declared band vs ${s.tg}` : `Worst PMI band (on ${s.dimensionMm} mm) vs ${s.tg}`,
          `${s.bandMm} mm vs ${s.capabilityBandMm} mm → ${s.margin}×`, s.basis]);
      }
      if (sf.din16742RmTolerance) {
        const s = sf.din16742RmTolerance;
        dinRows.push([s.from === 'declared' ? 'Rotomoulding: declared band vs TG9' : `Rotomoulding: worst PMI band (on ${s.dimensionMm} mm) vs TG9`,
          `${s.bandMm} mm vs ${s.capabilityBandMm} mm → ${s.margin}×`, s.basis]);
      }
      if (dinRows.length > 1) {
        sheets.push({
          name: 'DIN 16742',
          title: 'What DIN 16742 promises for this moulding',
          subtitle: 'DIN 16742:2013-10 plastics moulded part tolerances, read first-hand: the tolerance group '
            + 'the standard’s own Annex C assigns to this resin, and the Table 2 band at this part’s '
            + 'dimensions. Figures, not verdicts — judged at the non-tool-specific column, the looser one.',
          headerRow: 0, zebra: true, colWidths: [42, 32, 76], wrapCols: [2],
          rows: dinRows,
        });
      }
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  // The one sheet somebody actually works from. Filterable by owner, because the
  // first thing a programme does with this is send each role their rows — and a
  // due-date column left EMPTY on purpose, for a human to fill in.
  {
    const { rows: actions, byOwner, omitted } = buildActions(data as never, { max: 40 });
    if (actions.length) {
      sheets.push({
        name: 'Actions',
        title: `What happens next — ${actions.length} decisions${omitted ? `, ${omitted} findings not listed` : ''}`,
        subtitle: 'The action text is the rule\'s own fix wording; nothing here is authored by the tool. '
          + 'The owner is a ROLE derived from what has to change — the tool does not know who works here — '
          + 'and Due is blank on purpose.',
        headerRow: 0, zebra: true, autoFilter: true,
        colWidths: [4, 10, 40, 52, 30, 20, 44, 14, 12],
        wrapCols: [2, 3, 6],
        rows: [
          ['#', 'Severity', 'Finding', 'Action', 'Change', 'Owner (role)', 'Decision needed', 'EUR/year', 'Due'],
          ...actions.map(a => [a.n, a.severity, a.finding, a.action, a.change, a.owner, a.decision,
            a.annualEur ?? '', '']),
        ],
        // Matched on the row's text, which is how xlsx-write tints a row. The
        // severity word is the first distinctive token in each action row.
        statusColors: [
          { match: 'high', argb: 'FFFDECEC' },
          { match: 'medium', argb: 'FFFEF6E7' },
        ],
      });
      if (byOwner.length > 1) {
        sheets.push({
          name: 'Actions by owner',
          title: 'Who is holding what',
          subtitle: 'Sorted by high-severity load. Roles, not names.',
          headerRow: 0, zebra: true, colWidths: [30, 12, 16, 16],
          rows: [['Owner (role)', 'Actions', 'High severity', 'EUR/year'],
            ...byOwner.map(o => [o.owner, o.actions, o.high, o.annualEur || ''])],
        });
      }
    }
  }

  // ── Changes since the baseline revision ────────────────────────────────────
  // CLOSED and NO LONGER MEASURABLE are kept in separate columns on purpose: a
  // rule that stopped failing because the measurement disappeared has not been
  // fixed, and a sheet that totals them together is a spreadsheet that lies.
  if (diff) {
    const rows: Array<Array<string | number>> = [
      ['State', 'Severity', 'Finding', 'Was', 'Now', 'Unit', 'EUR/year', 'Note'],
      ...diff.closed.map(c => ['CLOSED', c.severity, c.title, c.was ?? '', c.now ?? '', c.unit ?? '',
        c.how === 'now passes' ? c.annualFreed : '',
        c.how === 'now passes' ? 'fixed' : `NOT FIXED — ${c.how}`]),
      ...diff.created.map(c => ['NEW', c.severity, c.title, '', c.measured ?? '', c.unit ?? '', c.annual || '',
        c.wasPassing ? 'was passing on the baseline' : 'first appearance']),
      ...diff.persisting.map(c => ['STILL OPEN', c.severity, c.title, c.was ?? '', c.now ?? '', c.unit ?? '', '',
        c.delta == null ? 'movement not measurable' : c.delta === 0 ? 'unchanged' : `moved ${c.delta}`]),
      ...diff.nowVisible.map(c => ['NEWLY VISIBLE', c.severity, c.title, '', '', '', '', c.reason]),
      ...diff.nowBlind.map(c => ['LOST VISIBILITY', '', c.title, '', '', '', '', c.reason]),
    ];
    sheets.push({
      name: 'Changes',
      title: diff.headline,
      subtitle: `Against ${diff.baselineLabel ?? 'the previous analysis'}. `
        + (diff.warnings?.length ? diff.warnings.join(' ') : 'Matched by rule id.'),
      headerRow: 0, zebra: true, autoFilter: true,
      colWidths: [18, 10, 52, 12, 12, 14, 14, 60], wrapCols: [2, 7],
      rows,
      // Tinted by STATE, so the eye separates a genuine fix from a rule that
      // merely stopped being measurable before reading a word.
      statusColors: [
        { match: 'not fixed', argb: 'FFF1F5F9' },
        { match: 'closed', argb: 'FFECFDF5' },
        { match: 'new', argb: 'FFFDECEC' },
        { match: 'still open', argb: 'FFFEF6E7' },
        { match: 'newly visible', argb: 'FFEFFCFB' },
        { match: 'lost visibility', argb: 'FFF1F5F9' },
      ],
    });
  }

  // The same test in plain words — mirrors the rule book's generator: one
  // sentence derived from the rule itself, so 247 of them can never drift
  // from the catalogue. Margin-type rules (unit starting "x") explain that
  // the limit was computed for THIS part rather than looked up.
  const MEASURE_PLAIN: Record<string, string> = {
    wallP5Mm: 'the thinnest wall on the part',
    wallP50Mm: 'the typical wall thickness',
    wallP95Mm: 'the thickest wall on the part',
    wallSpreadRatio: 'how uneven the walls are',
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
  };
  const deCamel = (m: string) => m.replace(/Mm$/, ' (mm)').replace(/Pct$/, ' (%)')
    .replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  const plainWordsFor = (f: { measure: string; unit?: string; thresholdText?: string }) => {
    if (typeof f.unit === 'string' && f.unit.startsWith('x ')) {
      return `The limit is not a fixed number: the engine worked out ${f.unit.slice(2)} for THIS part from the source cited, and 1.0 means exactly what that table promises. Below 1.0 the drawing asks for more than the process can hold.`;
    }
    const what = MEASURE_PLAIN[f.measure] || deCamel(f.measure);
    return `The engine measured ${what}; the guideline is ${f.thresholdText ?? 'in the Guideline column'}.`;
  };

  // Sorted worst first, like the PDF's summary table. A findings sheet in
  // catalogue order makes the reader do the triage the tool already did.
  const SEV_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const findingRows = data.results
    .flatMap(r => r.findings.map(f => ({ r, f })))
    .sort((a, b) => (SEV_RANK[a.f.severity] ?? 3) - (SEV_RANK[b.f.severity] ?? 3)
      || (b.f.cost?.annualDeltaEur ?? 0) - (a.f.cost?.annualDeltaEur ?? 0))
    .map(({ r, f }) => [
      r.processName, f.severity, f.title, plainWordsFor(f), f.measured ?? '', f.unit, f.thresholdText,
      f.cost?.priced ? 'priced' : 'not priced',
      f.cost?.priced ? (f.cost.deltaEur ?? '') : '',
      f.cost?.priced ? (f.cost.annualDeltaEur ?? '') : '',
      f.cost?.priced ? f.cost.basis ?? '' : (f.cost?.reason ?? ''),
      // WHERE THE COMPARISON CAME FROM, on both sides. A threshold tuned to the
      // alloy and a process-wide band look identical in a spreadsheet unless the
      // sheet says which; so does a tolerance read from the model against one an
      // engineer typed. Both distinctions were added to the engine this cycle
      // and neither reached the workbook.
      f.thresholdBasis === 'material' || f.thresholdBasis === 'material-family'
        ? `tuned to ${f.thresholdMatchedOn}`
        : f.thresholdBasis === 'customer-standard' ? 'company standard'
          : f.thresholdMaterial ? `process-wide (${f.thresholdMaterial} has no specific band)`
            : 'process-wide (no material given)',
      f.measuredBasis ?? '',
      f.instances?.length ? `${f.instanceCount ?? f.instances.length} of ${f.instanceTotal ?? '?'} features` : '',
      f.fix, f.source,
    ]);
  // An empty findings sheet is the most dangerous page in the whole export: a
  // header row over blank space reads as "we checked everything and it is
  // clean". Which of the two possible reasons applies has to be stated, because
  // "nothing was breached" and "nothing could be checked" look identical here.
  const evaluatedTotal = data.results.reduce((s, r) => s + r.evaluatedCount, 0);
  const ruleTotal = data.results.reduce((s, r) => s + r.ruleCount, 0);
  sheets.push({
    name: 'Findings',
    title: 'DFM findings',
    subtitle: findingRows.length
      ? 'Sorted by severity. A finding with no cost figure is one the engines could not price — the reason is given, and it is not the same as zero.'
      : evaluatedTotal
        ? `No rule was breached. ${evaluatedTotal} of ${ruleTotal} rules could be evaluated on this geometry — see the "Not evaluated" sheet for the remaining ${ruleTotal - evaluatedTotal}.`
        : `NOT A CLEAN RESULT. None of the ${ruleTotal} rules could be evaluated on this geometry, so this sheet is empty because nothing was checked — not because nothing was wrong. Every rule and its reason is on the "Not evaluated" sheet.`,
    headerRow: 0, zebra: true, autoFilter: true,
    colWidths: [24, 10, 44, 48, 12, 12, 18, 12, 14, 16, 52, 34, 40, 20, 52, 44],
    wrapCols: [2, 3, 10, 12, 14, 15],
    numFmt: { 8: '#,##0.00', 9: '#,##0' },
    statusColors: [{ match: 'high', argb: 'FFFDECEC' }, { match: 'medium', argb: 'FFFFF7E8' }],
    rows: [[
      'Process', 'Severity', 'Finding', 'In plain words', 'Measured', 'Unit', 'Guideline',
      'Cost status', 'Saving EUR/part', 'Saving EUR/year', 'Basis or reason',
      'Threshold basis', 'Measured basis', 'Offending features', 'What to do', 'Source',
    ], ...findingRows],
  });

  // Not-evaluated is its own sheet on purpose. Buried at the bottom of the
  // findings sheet it would read as a footnote; it is the coverage statement.
  const unevaluated = data.results.flatMap(r => r.notEvaluated.map(n => [
    r.processName, n.title,
    MEASURE_PLAIN[n.measure] || deCamel(n.measure),
    n.reason ?? 'no measurement available', n.source,
  ]));
  if (unevaluated.length) {
    sheets.push({
      name: 'Not evaluated',
      title: 'Rules that could NOT be checked',
      subtitle: 'These are not passes. The measurement each rule needs was not available on this geometry, and the reason is given for every one.',
      headerRow: 0, zebra: true, autoFilter: true,
      colWidths: [24, 46, 38, 66, 44], wrapCols: [2, 3, 4],
      rows: [['Process', 'Rule', 'What it would have measured', 'Why it could not run', 'Source'], ...unevaluated],
    });
  }

  const passed = data.results.flatMap(r => r.passed.map(p => [
    r.processName, p.title, p.measured ?? '', p.unit, p.thresholdText, p.source,
  ]));
  if (passed.length) {
    sheets.push({
      name: 'Passed',
      title: 'Rules the geometry satisfied',
      subtitle: 'Checked and within guideline.',
      headerRow: 0, zebra: true, autoFilter: true,
      colWidths: [24, 46, 14, 12, 20, 44], wrapCols: [5],
      rows: [['Process', 'Rule', 'Measured', 'Unit', 'Guideline', 'Source'], ...passed],
    });
  }

  // ── The 2D drawing — what the AI read, and how the model answers it ───────
  // Every row carries the callout VERBATIM as printed, so a reader can check
  // the extraction against the drawing without the tool in the loop. The
  // reconciliation column is deterministic; "not found" is the normal state
  // for most dimensions and is not a conflict.
  if (data.drawing?.ok) {
    const dw = data.drawing;
    const checkFor = (d: { sourceText: string; nominalMm: number }) =>
      data.drawingCheck?.rows.find(r2 => r2.sourceText === d.sourceText && r2.nominalMm === d.nominalMm);
    const dwRows: Array<Array<string | number>> = [['As printed', 'Nominal (mm)', 'Band (mm)', 'Type', 'Toleranced', 'Sheet', 'Check vs 3D model']];
    for (const d of dw.dimensions) {
      const chk = checkFor(d);
      dwRows.push([
        d.sourceText, d.nominalMm, d.bandMm ?? '', d.type, d.toleranced ? 'yes' : 'no (general tol.)', d.sheet ?? '',
        chk ? (chk.status === 'confirmed' ? `confirmed — ${chk.note}` : chk.status === 'conflict' ? `CONFLICT — ${chk.note}` : 'not found in 3D (not a conflict)') : 'no 3D model to check against',
      ]);
    }
    for (const g of dw.gdt) {
      dwRows.push([g.sourceText, '', g.toleranceMm ?? '', `GD&T ${g.symbol}`, g.datums.length ? `datums ${g.datums.join(', ')}` : '', '',
        g.symbol === 'flatness' ? 'feeds the flatness capability rules' : 'no deterministic rule consumes this yet — recorded, not judged']);
    }
    for (const r2 of dw.roughness) {
      dwRows.push([r2.sourceText, '', '', 'roughness', r2.scope ?? '', '', r2.raUin ? `${r2.raUin} µin — feeds the roughness rules` : '']);
    }
    const tb = dw.titleBlock;
    const subtitleBits = [
      tb.drawingNumber ? `Drawing ${tb.drawingNumber}${tb.revision ? ` rev ${tb.revision}` : ''}` : null,
      tb.material ? `title-block material: ${tb.material}` : null,
      tb.generalToleranceNote ? `general tolerance note: ${tb.generalToleranceNote}` : null,
      `units: ${dw.units}`,
      ...dw.conversions,
      ...(data.drawingApplied?.length ? [`Supplied to the rules by this drawing: ${data.drawingApplied.join(', ')}.`] : []),
      data.drawingCheck ? `Reconciliation: ${data.drawingCheck.counts.confirmed} confirmed, ${data.drawingCheck.counts.conflict} in conflict, ${data.drawingCheck.counts.notFound} with no measured counterpart. ${data.drawingCheck.basis}` : null,
    ].filter(Boolean);
    sheets.push({
      name: '2D drawing',
      title: 'What the AI read off the 2D drawing',
      subtitle: `Extracted by AI vision, reviewed by the engineer, judged by the deterministic rules — every finding built on these rows says so. ${subtitleBits.join(' · ')}`,
      headerRow: 0, zebra: true, autoFilter: true,
      colWidths: [22, 14, 12, 16, 22, 8, 70], wrapCols: [6],
      rows: dwRows,
    });
  }

  // ── Where the rules come from ─────────────────────────────────────────────
  // The provenance summary a supplier conversation reaches for: the catalogue's
  // grade split (counted server-side, same figures as the appendix sentence)
  // and the primary documents read cover to cover. The book list is static by
  // design — extend it when the next document is read; each finding's own
  // Source cell remains the live truth about which rule rests on which page.
  if (data.catalogue?.total) {
    const g = data.catalogue.byGrade ?? {};
    sheets.push({
      name: 'Rule sources',
      title: 'Where the rule book comes from',
      subtitle: `Of ${data.catalogue.total} rules in the catalogue: `
        + `${g['standard-named'] ?? 0} cite a named standard or document read first-hand, `
        + `${g['engine-derived'] ?? 0} derive from this tool's own cost model, `
        + `${g['customer-standard'] ?? 0} are company standards set in this workspace, `
        + `and the rest are industry consensus. The threshold-audit register ships with the product and names every unaudited number.`,
      headerRow: 0, zebra: true, colWidths: [58, 76], wrapCols: [1],
      rows: [
        ['Primary document, read cover to cover', 'What it governs in this tool'],
        ['NADCA Product Design for Die Casting, 7th ed. (2015)', 'Die-casting draft (computed from the book\'s formula at each feature\'s depth), fillets, bosses, cored holes'],
        ['NADCA #402 Product Specification Standards (2021)', 'Die-casting tolerance capability, computed per dimension and grade (Standard vs Precision is a report input)'],
        ['SFSA Steel Castings Handbook, Supplement 1', 'Steel casting design: minimum section vs run length, rib thermal neutrality, junction fillets, boss cap'],
        ['SFSA Supplement 3 — Dimensional Capabilities of Steel Castings', 'Steel casting tolerances (SFSA 2000 CT grades), required machining allowance, flatness, production series'],
        ['DuPont Engineering Polymers, General Design Principles, Module I', 'Moulding draft per resin and draw depth, fillet knee, boss OD band, blind-core depth, undercut stripping'],
        ['Covestro (Bayer) Part and Mold Design', 'PC-family rib percentages, draft minimums, fillet ratio, tall-boss limit, undercut stripping'],
        ['Boljanovic, Sheet Metal Forming Processes and Die Design', 'Press force, strip utilisation, bend allowance, springback, draw operations — equation by equation'],
        ['ISO 8062-4:2017 — General tolerances for castings', 'Non-ferrous casting tolerance capability per metal group (permanent mould, sand, investment), draft tables 4-8, machining allowance'],
        ['DIN 16742:2013 — Plastics moulded parts, tolerances and acceptance conditions', 'Injection-moulding tolerance groups per resin (Annex C) and dimension (Table 2), profile-form general tolerances, rotomoulding at TG9'],
      ],
    });
  }

  const featureRows: (string | number)[][] = [];
  for (const f of g.featureTable || []) {
    featureRows.push([f.kind, f.diaMm ?? '', f.depthMm ?? '', f.through === null ? 'n/a' : String(f.through), f.count ?? '', (f.axisXYZ || []).join(', ')]);
  }
  for (const c of feats.compoundHoles || []) {
    featureRows.push([c.kind, c.boreDiaMm, c.boreDepthMm, String(c.through), c.count ?? 1, (c.axisXYZ || []).join(', ')]);
  }
  // Pockets, slots and steps were recognised, counted on screen, and then left
  // out of every export — so the one place an engineer could check WHICH faces a
  // pocket was built from did not exist.
  for (const p of feats.prismatic || []) {
    featureRows.push([p.kind, '', '', '', 1,
      `${p.faceCount} faces, ${p.wallCount} walls, ${p.areaMm2} mm2, confidence ${p.confidence}`]);
  }
  // Only write the sheet when it has content: a header row on its own reads as
  // "we looked and found nothing", which is not the same as "nothing ran".
  if (featureRows.length) {
    sheets.push({
      name: 'Features',
      title: 'Recognised features',
      subtitle: 'Cylindrical features from the exact analytic pass; pockets and slots from topology decomposition.',
      headerRow: 0, zebra: true, autoFilter: true,
      colWidths: [24, 14, 14, 12, 10, 46], wrapCols: [5],
      rows: [['Kind', 'Diameter mm', 'Depth mm', 'Through', 'Count', 'Axis / detail'], ...featureRows],
    });
  }

  // The recogniser's own limits, as data rather than prose. Someone reading the
  // workbook without the PDF still needs to know what was never looked for.
  if (Array.isArray(feats.knownLimits) && feats.knownLimits.length) {
    sheets.push({
      name: 'Recogniser limits',
      title: 'What the feature recogniser cannot see',
      subtitle: 'Reported by the engine itself, so this list cannot drift out of date with what the code actually does. An absent feature here means "not looked for", which is not the same as "not present".',
      headerRow: 0, zebra: true,
      colWidths: [6, 110], wrapCols: [1],
      rows: [['#', 'Limit'], ...feats.knownLimits.map((l: string, i: number) => [i + 1, l])],
    });
  }

  if (Array.isArray(feats.ribs) && feats.ribs.length) {
    const nominal = Number(wall.p50Mm);
    sheets.push({
      name: 'Ribs',
      title: `Recognised ribs — ${feats.ribs.length}`,
      subtitle: nominal > 0
        ? `Thickness measured at the base, where the 40-60%-of-wall guideline applies. Ratios are against the measured ${nominal} mm nominal wall.`
        : 'Thickness measured at the base of each rib. Wall thickness could not be measured on this part, so no ratio is given and the rib rules abstained.',
      headerRow: 0, zebra: true, autoFilter: true,
      colWidths: [8, 16, 14, 14, 14, 12, 12, 14],
      numFmt: { 1: '0.00', 2: '0.00', 3: '0.00', 4: '0.00', 5: '0.00', 6: '0.00' },
      rows: [
        ['#', 'Thickness mm', 'Height mm', 'Length mm', 'Draft/side deg', 't / wall', 'h / wall', 'Confidence'],
        ...feats.ribs.map((r: any, i: number) => [
          i + 1, r.thicknessMm, r.heightMm, r.lengthMm ?? '', r.draftPerSideDeg,
          nominal > 0 ? Number((r.thicknessMm / nominal).toFixed(3)) : '',
          nominal > 0 ? Number((r.heightMm / nominal).toFixed(3)) : '',
          r.confidence,
        ]),
      ],
    });
  }

  const dfa = data.dfa as Record<string, any> | null | undefined;
  if (dfa && Array.isArray(dfa.rows)) {
    sheets.push({
      name: 'DFA parts',
      title: `Design for Assembly — ${dfa.totalParts} parts`,
      subtitle: dfa.completeness?.note || '',
      headerRow: 0, zebra: true, autoFilter: true,
      colWidths: [8, 34, 8, 14, 14, 14, 14, 14, 16, 20],
      numFmt: { 4: '0.00', 5: '0.00', 6: '0.00', 7: '0.00' },
      rows: [[
        '#', 'Part', 'Off', 'alpha+beta deg', 'Mass kg', 'Handling s', 'Insertion s', 'Total s',
        'Contacts', 'Necessary?',
      ], ...dfa.rows.filter((r: any) => !r.skipped).map((r: any) => [
        r.index, r.name, r.groupSize, r.symmetry?.totalDeg ?? '', r.massKg ?? '',
        r.time?.handlingSec ?? '', r.time?.insertionSec ?? '', r.time?.totalSec ?? '',
        r.contacts ?? 0,
        r.necessary === null ? 'UNANSWERED' : r.necessary ? 'yes' : 'no — candidate',
      ])],
    });
  }

  await downloadXlsx(safeName(`BrainSpark_DFM_${subject}_${today}.xlsx`), sheets);
}
