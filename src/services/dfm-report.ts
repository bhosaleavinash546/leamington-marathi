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

export function exportDfmPdf(dataIn: DfmReportData, figures: DfmFigure[] = []): void {
  // Provenance counted by the SERVER that ran the rules and sent with the
  // analysis, so the sentence describing the catalogue cannot fall out of date
  // the way "24 of the 26 rules" did — it said that on every report long after
  // the catalogue reached 111. Counting here would mean bundling the whole
  // catalogue into the browser for one sentence.
  const gradeCounts: Record<string, number> = dataIn.catalogue?.byGrade ?? {};
  const totalCatalogueRules = dataIn.catalogue?.total
    ?? Object.values(gradeCounts).reduce((a, b) => a + b, 0);
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
  if (figures.length) {
    for (const fig of figures) {
      if (!fig.dataUri) continue;
      newPage();
      sectionTitle('Located evidence', `${VIEW_LABEL[fig.view] ?? fig.view} view`);

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
      for (const c of fig.callouts) {
        const cx = ML + c.x * imgW;
        const cy = imgY + c.y * imgH;
        const col = SEV[c.severity ?? ''] ?? TEAL;
        setDraw(doc, col, 0.5); setFill(doc, [255, 255, 255]);
        doc.circle(cx, cy, 2.6, 'FD');
        setText(doc, col); mono(6.4, true);
        doc.text(String(c.n), cx, cy + 1.05, { align: 'center' });
      }
      y = imgY + imgH + 5;

      if (fig.callouts.length) {
        mono(6.2); setText(doc, MUT);
        doc.text('WHAT IS MARKED, AND WHAT IT MEASURES', ML, y); y += 4.5;
        for (const c of fig.callouts) {
          ensure(5.2);
          const col = SEV[c.severity ?? ''] ?? TEAL;
          setDraw(doc, col, 0.4); setFill(doc, [255, 255, 255]);
          doc.circle(ML + 2, y - 1.1, 2.4, 'FD');
          setText(doc, col); mono(6.2, true);
          doc.text(String(c.n), ML + 2, y - 0.25, { align: 'center' });
          sans(9); setText(doc, INK);
          doc.text(fit(doc, c.label, 60), ML + 7, y);
          setText(doc, BODY);
          doc.text(fit(doc, c.value ?? '', CW - 75), ML + 70, y);
          y += 5;
        }
      } else {
        wrapped('No located finding is visible from this angle. The markers are '
          + 'dropped rather than pushed to the edge of the frame, because a leader '
          + 'line pointing off the picture is worse than none.', 8.6, MUT, CW, 4, 'italic');
      }
    }
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
        r.viable === false ? 'NOT VIABLE' : r.score === null ? '—' : String(r.score),
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
        r.viable === false ? '' : delta,
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
      const cheaper = sorted.filter(r => !r.isChosen
        && r.viable !== false
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
      + `against are not of the same standing: ${gradeCounts['industry-consensus'] ?? 0} of ${totalCatalogueRules} `
      + `rest on industry consensus — widely published and mutually consistent, but not audited against a primary `
      + `standard and not validated against measured scrap data. ${gradeCounts['standard-named'] ?? 0} name a `
      + `published standard that has not been read first-hand; ${gradeCounts['engine-derived'] ?? 0} come from this `
      + `tool's own model. Every finding carries its grade. Treat a finding as a screening result that opens a `
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

export async function exportDfmXlsx(data: DfmReportData): Promise<void> {
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

  // Sorted worst first, like the PDF's summary table. A findings sheet in
  // catalogue order makes the reader do the triage the tool already did.
  const SEV_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const findingRows = data.results
    .flatMap(r => r.findings.map(f => ({ r, f })))
    .sort((a, b) => (SEV_RANK[a.f.severity] ?? 3) - (SEV_RANK[b.f.severity] ?? 3)
      || (b.f.cost?.annualDeltaEur ?? 0) - (a.f.cost?.annualDeltaEur ?? 0))
    .map(({ r, f }) => [
      r.processName, f.severity, f.title, f.measured ?? '', f.unit, f.thresholdText,
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
    colWidths: [24, 10, 44, 12, 12, 18, 12, 14, 16, 52, 34, 40, 20, 52, 44],
    wrapCols: [2, 9, 11, 13, 14],
    numFmt: { 7: '#,##0.00', 8: '#,##0' },
    statusColors: [{ match: 'high', argb: 'FFFDECEC' }, { match: 'medium', argb: 'FFFFF7E8' }],
    rows: [[
      'Process', 'Severity', 'Finding', 'Measured', 'Unit', 'Guideline',
      'Cost status', 'Saving EUR/part', 'Saving EUR/year', 'Basis or reason',
      'Threshold basis', 'Measured basis', 'Offending features', 'What to do', 'Source',
    ], ...findingRows],
  });

  // Not-evaluated is its own sheet on purpose. Buried at the bottom of the
  // findings sheet it would read as a footnote; it is the coverage statement.
  const unevaluated = data.results.flatMap(r => r.notEvaluated.map(n => [
    r.processName, n.title, n.measure, n.reason ?? 'no measurement available', n.source,
  ]));
  if (unevaluated.length) {
    sheets.push({
      name: 'Not evaluated',
      title: 'Rules that could NOT be checked',
      subtitle: 'These are not passes. The measurement each rule needs was not available on this geometry, and the reason is given for every one.',
      headerRow: 0, zebra: true, autoFilter: true,
      colWidths: [24, 46, 30, 66, 44], wrapCols: [3, 4],
      rows: [['Process', 'Rule', 'Needs measure', 'Why it could not run', 'Source'], ...unevaluated],
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
