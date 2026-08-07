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
  status: 'fail' | 'pass' | 'not-evaluated';
  reason?: string;
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

export interface DfmReportData {
  partName?: string;
  analysisLimits?: AnalysisLimit[];
  processFamily?: string | null;
  processFamilyBasis?: string;
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

export function exportDfmPdf(dataIn: DfmReportData): void {
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

  // ── Cover ──────────────────────────────────────────────────────────────────
  setFill(doc, NAVY); doc.rect(0, 0, PW, 74, 'F');
  setFill(doc, GOLD); doc.rect(0, 74, PW, 1.6, 'F');
  doc.addImage(LOGO_PNG, 'PNG', ML, 16, 16, 16);
  sans(9); setText(doc, [226, 232, 240]);
  doc.text('B R A I N S P A R K', ML + 20, 22.5);
  sans(24, 'bold'); setText(doc, [255, 255, 255]);
  doc.text('DFM / DFA Analysis', ML + 20, 32);
  sans(12); doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
  doc.text(fit(doc, subject, CW - 24), ML + 20, 40);
  mono(8); setText(doc, [148, 163, 184]);
  const sub = [data.subject?.system, data.subject?.material, data.subject?.process].filter(Boolean).join('  ·  ');
  if (sub) doc.text(fit(doc, sub.toUpperCase(), CW - 24), ML + 20, 50);
  doc.text(`GENERATED ${today}  ·  ${totalEvaluated}/${totalRules} RULES EVALUATED`, ML + 20, 57);
  y = 88;
  footer();

  const tiles: [string, string, RGB][] = [
    [String(allFindings.length), 'FINDINGS', allFindings.length ? RED : GREEN],
    [String(allFindings.filter(f => f.severity === 'high').length), 'HIGH SEVERITY', RED],
    [String(totalUnevaluated), 'NOT EVALUATED', MUT],
    [pricedTotal ? eur(pricedTotal).replace('EUR ', '€') : '—', 'PRICED / YEAR', GREEN],
  ];
  const tw = (CW - 9) / 4;
  tiles.forEach(([v, l, c], i) => {
    const x = ML + i * (tw + 3);
    setFill(doc, c); doc.roundedRect(x, y, tw, 20, 2, 2, 'F');
    sans(v.length > 8 ? 10 : 15, 'bold'); setText(doc, [255, 255, 255]);
    doc.text(fit(doc, v, tw - 4), x + tw / 2, y + 9.5, { align: 'center' });
    mono(5.4); setText(doc, [226, 232, 240]);
    doc.text(l, x + tw / 2, y + 15.5, { align: 'center' });
  });
  y += 28;

  sans(11, 'bold'); setText(doc, INK);
  doc.text('How to read this report', ML, y); y += 5.5;
  wrapped('Every geometric figure here was measured from your CAD file by an OpenCascade kernel — draft angles and wall thickness on the tessellation, holes and features from the B-rep topology. Every cost figure was computed by the same deterministic engines the rest of BrainSpark uses. The AI wrote none of the numbers.', 9.2, BODY);
  y += 2;
  wrapped('Rules report in three states, not two: failed, passed, and NOT EVALUATED. A rule whose measurement this part does not provide is listed as unevaluated with the reason, never as a pass — so the coverage figure beside each score tells you how much of the catalogue actually ran.', 9.2, BODY);
  y += 2;
  wrapped('Thresholds are industry design guidelines with their source cited, not laws of physics. A capable supplier will beat several of them. Treat a finding as the start of a conversation, not a verdict.', 9, MUT, CW, 4.2, 'italic');
  y += 2;
  if (!data.processFamily) {
    // Without this, a speculative sweep is indistinguishable from a targeted
    // analysis and the reader has no way to know some findings are for a process
    // the part will never see.
    wrapped('No manufacturing process was specified, so EVERY rule family below was run speculatively. Some findings will be for processes this part will never see, and their cost figures should not be added together.', 9, AMBER, CW, 4.2, 'bold');
    y += 2;
  }
  y += 4;

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
    doc.text('PRICED IMPACT / YEAR', ML + 122, y);
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
      } else {
        wrapped(costText, 9.1, MUT, CW - 9, 4.1, 'normal', ML + 4.5);
        if (f.cost?.externalGuideline) {
          wrapped(f.cost.externalGuideline, 8.8, AMBER, CW - 9, 4.0, 'italic', ML + 4.5);
        }
      }
      mono(6); setText(doc, MUT); ensure(5);
      doc.text(fit(doc, `SOURCE: ${f.source}`, CW - 9), ML + 4.5, y); y += 4;
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

  // ── Provenance ─────────────────────────────────────────────────────────────
  newPage();
  sectionTitle('Provenance', 'Where every number came from');
  for (const line of [
    'Geometry is measured by an OpenCascade kernel. Draft angles, undercut classification and wall thickness are measured on the tessellation — which works on freeform surfaces, where a plane-and-cylinder analysis measures almost nothing on a real cast or moulded part. Holes and features come from the B-rep topology.',
    'Draw direction is chosen by sweeping candidate axes and scoring undercut area, not assumed. Alternatives and their penalties are available in the analysis output.',
    'Undercuts are separated from zero-draft drag faces. A zero-draft wall is fixable with a degree of taper; an undercut buys a slide or a lifter. Reporting them as one number would overstate the tooling problem.',
    'Cost deltas are computed by re-running the same deterministic engines used elsewhere in BrainSpark, once with the geometry as drawn and once with the rule satisfied. Findings the engines cannot price say so, with the reason.',
    'DFA handling times use the BrainSpark time model, which follows the published Boothroyd-Dewhurst METHOD. Their tables are copyrighted and are not reproduced; the coefficients here are ours and are meant to be calibrated against your own line data before being used for a labour commitment.',
    'Part symmetry is measured by rotating each solid and intersecting it with itself, not inferred from inertia — equal principal moments are necessary but not sufficient for symmetry.',
    'The three DFA questions concern function and intent, which a static solid model cannot answer. Geometry proposes; a human confirms. Until every part is answered the theoretical minimum and the DFA index are withheld rather than estimated.',
  ]) { wrapped(`·  ${line}`, 9.1, BODY); y += 2; }

  y += 4;
  sectionTitle('Limits', 'What this analysis does not cover');
  // The RECOGNISER'S OWN limits come first, straight from the engine. A
  // hand-maintained list drifts the moment the engine gains a capability, and
  // this one had: it still told every reader that "sheet-metal rules require
  // bend recognition, which is not yet implemented" for the whole life of the
  // wave that implemented it. The engine knows what it cannot do; print that.
  for (const line of (feats.knownLimits || []) as string[]) {
    wrapped(`·  ${line}`, 9.1, BODY); y += 2;
  }
  for (const line of [
    'Surface finish and material specification come from your input, not from the model.',
    'Thresholds are design guidelines from published industry sources. Validate against your supplier before committing a design change.',
  ]) { wrapped(`·  ${line}`, 9.1, BODY); y += 2; }

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

  sheets.push({
    name: 'Summary',
    title: `BrainSpark DFM / DFA — ${subject}`,
    subtitle: `Generated ${today}. Geometry measured by an OpenCascade kernel; cost by BrainSpark's deterministic engines. No figure here was written by an AI.`,
    headerRow: 0, zebra: true, colWidths: [38, 26, 68], wrapCols: [2],
    rows: [
      ['Measure', 'Value', 'Note'],
      ['Bounding box', g.boundingBox ? `${g.boundingBox.xMm} x ${g.boundingBox.yMm} x ${g.boundingBox.zMm} mm` : '—', 'From the CAD model'],
      ['Volume', g.volume?.cm3 ?? '—', 'cm3, exact from the kernel'],
      ['Wall thickness p50', wall.p50Mm ?? 'not measured', 'Area-weighted median, ray-cast on the tessellation'],
      ['Wall thickness p5', wall.p5Mm ?? 'not measured', 'The thin tail — where cold shuts and short shots start'],
      ['Wall uniformity', wall.uniformity ?? '—', 'Robust spread ratio, not standard deviation'],
      ['Draw direction', draft.drawDirectionXYZ ? draft.drawDirectionXYZ.join(', ') : '—', 'Chosen by sweeping candidate axes, not assumed'],
      ['Undercut regions', draft.undercutFaceCount ?? '—', 'Occluded in both tool halves — needs a slide or lifter'],
      ['Wall area below min draft', draft.wallAreaBelowMinDraftPct ?? '—', '% of wall area; drag faces, distinct from undercuts'],
      ['Unclassified surface area', feats.unclassifiedAreaPct ?? '—', '% the feature recogniser could not name'],
      ['Rules evaluated', data.results.reduce((s, r) => s + r.evaluatedCount, 0), `of ${data.results.reduce((s, r) => s + r.ruleCount, 0)} in the catalogue`],
    ],
  });

  const findingRows = data.results.flatMap(r => r.findings.map(f => [
    r.processName, f.severity, f.title, f.measured ?? '', f.unit, f.thresholdText,
    f.cost?.priced ? 'priced' : 'not priced',
    f.cost?.priced ? (f.cost.deltaEur ?? '') : '',
    f.cost?.priced ? (f.cost.annualDeltaEur ?? '') : '',
    f.cost?.priced ? f.cost.basis ?? '' : (f.cost?.reason ?? ''),
    f.fix, f.source,
  ]));
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
    colWidths: [24, 10, 44, 12, 12, 18, 12, 14, 16, 52, 52, 44],
    wrapCols: [2, 9, 10, 11],
    numFmt: { 7: '#,##0.00', 8: '#,##0' },
    statusColors: [{ match: 'high', argb: 'FFFDECEC' }, { match: 'medium', argb: 'FFFFF7E8' }],
    rows: [[
      'Process', 'Severity', 'Finding', 'Measured', 'Unit', 'Guideline',
      'Cost status', 'Saving EUR/part', 'Saving EUR/year', 'Basis or reason', 'What to do', 'Source',
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
