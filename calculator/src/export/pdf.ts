import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PartCostResult, UniversalStackInput, RateLibrary, CommodityType, Scenario } from '../engine/types.js';
import type { CADAnalysisResult } from '../engine/ai-analysis.js';
import { breakdownPercentages, overheadBaseOf, overheadRateOf } from '../engine/core.js';
import { generateInsights, currencySymbol } from '../engine/insights.js';
import { generateDFMDFA } from '../engine/dfm-dfa.js';
import { rankOpportunities } from '../engine/opportunity-ranking.js';
import { computeCostUncertainty, overallConfidence } from '../engine/uncertainty.js';
import { measureLabel, measureAgainstLimit } from '../engine/dfm-geometry/measure-format.js';
import { runSensitivity } from '../engine/sensitivity.js';
import { computeCarbon } from '../engine/carbon.js';
import { computeRegionalComparison, alBilletMaterialFactors, type ManufacturingRegion, type RegionalComparisonRow } from '../engine/regional-rates.js';
import { computeRegionalComparisonExact } from '../engine/regional-comparison.js';
import { AL_ALLOY_LIST } from '../engine/al-extrusion-data.js';
import type { FeatureMachiningLine } from '../engine/feature-machining.js';
import { exportFilename } from './filename.js';
import { buildPcbaReport, type PcbaAnalysisLike, type PcbaReport } from './pcba-report-data.js';
import { brandRgb } from '../brand/index.js';
import { labourRoleLabel } from '../engine/labour-roles.js';
import { decisionAnswerText, toolingAmortisationBasis } from './decision-text.js';

/**
 * CAD-derived provenance + geometry metadata that rides into the should-cost
 * report so a reviewer can see WHERE each number came from. All optional — when
 * absent the report renders exactly as before (non-CAD flows are unaffected).
 */
/** Background geometric-DFM result, when a job has completed for this part. */
export interface GeometricDFMMeta {
  /**
   * One entry per RULE, not per instance. The knuckle produces 98 instances of
   * 4 rules; printing 98 rows is the wall of identical sentences that made the
   * old engine read as noise. `grouped` is what the report renders.
   */
  grouped: Array<{
    ruleId: string; severity: string; title: string; count: number;
    /** £/part summed across instances. 0 when no cost path is modelled. */
    totalCostGBP?: number;
    /**
     * Why the group carries no £ figure. Mutually exclusive with a non-zero
     * `totalCostGBP` — a finding never shows both a number and a reason there
     * is none. Present on the wire since the engine grouped it; the on-screen
     * panel renders it so an unpriced finding reads as "no model for this yet"
     * rather than as free.
     */
    costNotModelled?: string;
    faceIds: number[];
    worst: {
      detail: string; measured: { field: string; value: number; unit: string };
      /** The arithmetic behind the £ figure, printable end to end. */
      costImpact?: { perPartGBP: number; basis: string; confidence: string; kind?: string };
    };
    range: { min: number; max: number; unit: string };
    threshold: { value: number; unit: string; comparator: string };
    recommendation: string;
    source: { standard: string; clause?: string; note?: string };
  }>;
  /** Per-instance, kept for the viewer — never rendered as rows. */
  findings: Array<{
    ruleId: string; severity: string; title: string; detail: string;
    featureId: string; faceIds: number[];
    measured: { field: string; value: number; unit: string };
    threshold: { value: number; unit: string; comparator: string };
    recommendation: string;
    source: { standard: string; clause?: string; note?: string };
  }>;
  limitations: string[];
  featuresExamined: number;
  rulesEvaluated: number;
  packAvailable: boolean;
  /** Sum of every priced finding, £/part. */
  totalAddressableGBP?: number;
  dfa?: {
    available: boolean; handlingTimeSec?: number; insertionTimeSec?: number;
    totalTimeSec?: number; vsIdealRatio?: number;
    penalties: Array<{ reason: string; addedSec: number; measured: string }>;
    source: { standard: string; clause?: string; note?: string };
    limitations: string[];
  };
}

export interface CADReportMeta {
  /**
   * The uncertainty band the SCREEN shows (with the drivers' measured / rule provenance, or calibrated by actuals). The
   * PDF recomputed it without provenance and printed ±16.6 % beside a screen that said ±6.3 % (uploaded-parts review,
   * Oct 2026). When present the PDF prints this one.
   */
  uncertainty?: ReturnType<typeof computeCostUncertainty> | null;
  /** How that band was computed, in words (driver provenance, or calibrated on n actuals). */
  uncertaintyBasis?: string | null;
  /** The screen's suggestion context: was an annual volume typed, are packaging / logistics estimates. */
  volumeProvided?: boolean;
  pkgLogisticsEstimated?: boolean;
  /** How the geometry was obtained: precise B-rep (occt), mesh (stl_parser), or
   *  the text/heuristic fallback (text_parsing) that only estimates weight. */
  geometrySource?: 'occt' | 'stl_parser' | 'text_parsing' | null;
  measuredVolumeCm3?: number | null;
  measuredWeightKg?: number | null;   // measured mass for the chosen material family
  /** Per-feature secondary-machining breakdown actually used in the cost. */
  featureLines?: FeatureMachiningLine[] | null;
  /** True only when the costing's operations are these feature lines; otherwise §4C is a geometry audit with no £. */
  featureLinesInCost?: boolean;
  featureMachineRatePerHr?: number | null;
  /** Geometric DFM/DFA from the background job, when one has completed. */
  geometricDFM?: GeometricDFMMeta | null;
  /**
   * The £ each finding shows ON SCREEN (main.ts dfmFindingAmounts: re-costed through this costing's own operations, or
   * a cost to add, or "(ref. rate)" before a costing), keyed by rule id. The PDF printed the DFM job's reference-rate
   * line and a total of overlapping upper bounds beside a screen that said otherwise (uploaded-parts review, Oct 2026).
   */
  geometricDFMAmounts?: Record<string, { text: string; basis?: string }> | null;
  geometricDFMRecosted?: boolean;
  /** A DFM job was queued for this part but had not finished when the report was made (casting 360 review X17). */
  geometricDFMPending?: boolean;
  featureStock?: 'near_net' | 'solid_billet' | null;
  /** True when the engineer pinned the grade / process (locks out AI + sanity). */
  userSpecifiedMaterial?: boolean;
  userSpecifiedProcess?: boolean;
  annualVolume?: number | null;
  /**
   * Every photo the costing was built from, in slot order with its label
   * ("Top side", "Bottom side", "Close-up 1" …).
   *
   * `partPhotoDataUrl` carries ONE hero photo. The PCB Image-to-BOM flow accepts
   * eight, and seven of them never reached the report — on a board where the
   * whole BOM is read off package markings, the photos ARE the evidence, and a
   * reviewer could not check a single line against them.
   */
  photos?: ReportPhoto[];
  /** ISO 26262 context — printed for electronics commodities. */
  functionalSafety?: FunctionalSafetyMeta;
  /**
   * The checks that ran on the CAD costing and what the engineer did about
   * them. No guardrail reached the report before this: a supplier reading it
   * could not see that the weight had been clamped to the measured solid, that
   * the machining hours had been capped, or that "pressure-tight: yes" was an
   * answer rather than an assumption.
   */
  checks?: ChecksAppliedMeta | null;
  /**
   * The PCB photo analysis, when the costing IS that analysis (Calculate on the PCB form after
   * Analyze). The report then prints the populated board as the analysis costed it — build
   * country, delivered UK, components / board / assembly / test, its own country table — not the
   * machined-part sections (weight, operations, machine rates, metal indexation).
   */
  pcbAnalysis?: PcbaAnalysisLike | null;
}

export interface ChecksAppliedMeta {
  /** false = a blocking decision is open or a blocking sanity code is unacknowledged. */
  costable: boolean;
  geometryQuality?: 'occt' | 'stl' | 'text' | null;
  sanity: Array<{ code: string; message: string; severity: 'warn' | 'error'; blocking?: boolean; acknowledged?: boolean }>;
  decisions: Array<{ id: string; question: string; severity: 'blocking' | 'advisory'; answer: string | null;
    /** What the costing used for an unanswered advisory question (the grade it costed) — never "engine default". */
    used?: string | null }>;
  /** Rule-owned fields written over the model's value (or set where it said nothing). */
  overrides: Array<{ field: string; ruleId: string; from: unknown; to: unknown; basis: string; contradicted: boolean }>;
  /**
   * Every value the rules set on the costing form, with its basis (casting 360 review X12: NDT, heat treatment, stock,
   * crew and fettling were in the cost with no basis in either report). `value` is what the form held when costed;
   * `edited` when that differs from the rule's. Money in a basis is as recorded, in GBP.
   */
  ruleValues?: Array<{ label: string; value: string; ruleValue: string; basis: string; source: string; edited: boolean }>;
}

/** One labelled source photo carried into the report. */
export interface ReportPhoto {
  dataUrl: string;
  /** Slot name — "Top side", "Bottom side", "Close-up 3". */
  label: string;
}

/**
 * ISO 26262 context for an electronics costing.
 *
 * The safety grade is a genuine cost driver here: it is what sets the quality
 * multiplier on test and inspection, drives 100% X-ray and long ICT, and pushes
 * component selection to AEC-Q grades. The should-cost report charged for all
 * of that and never stated the grade it was charging for — the ASIL section
 * existed only in the separate combined PART A/B/C report.
 *
 * `asil` is only ever REPORTED, never derived by this module. An ASIL is an
 * output of hazard analysis (HARA), not something readable off a board, so when
 * it is absent the section says what the costing assumed and asks for it to be
 * confirmed rather than inventing a rating.
 */
export interface FunctionalSafetyMeta {
  /** "ASIL-D" … "QM". Absent when no hazard analysis has been supplied. */
  asil?: string | null;
  /** Why that ASIL — from the vision analysis or entered by the engineer. */
  rationale?: string | null;
  /** Safety functions the board performs. */
  safetyFunctions?: string[];
  /** The PCBA quality grade actually costed (`auto_grade1`, `aerospace` …). */
  qualityGrade?: string | null;
  /** What that grade multiplied test and inspection cycle times by. */
  qualityMultiplier?: number | null;
}

// ─── Shared constants ─────────────────────────────────────────────────────────
type RGB = [number, number, number];

const W  = 210;
const MG = 14;
const CW = W - MG * 2; // 182 mm

// Brand palette (src/brand/brand.json) — the same colours as the decks and the
// app's light theme (I5). ORANGE is the report's accent; the name is historical
// (~120 call sites) and it now carries the brand blue.
const NAVY:  RGB = brandRgb('navy');
const ORANGE:RGB = brandRgb('blue');
const SLATE: RGB = brandRgb('slate');
const GREY:  RGB = brandRgb('muted');
const LGREY: RGB = [160, 170, 185];
const LIGHT: RGB = [248, 250, 252];
const WHITE: RGB = [255, 255, 255];
const OR_LT: RGB = brandRgb('blueTint');
const HDR:   RGB = [232, 235, 245];
const GN:    RGB = brandRgb('green');
const RD:    RGB = brandRgb('red');
const AM:    RGB = brandRgb('amber');

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Wrap a jsPDF instance so EVERY string written through it is WinAnsi-safe.
 *
 * `winAnsiSafe` existed but was applied at 2 of ~110 text-writing sites, so
 * anything outside those paths reached jsPDF unsanitised. jsPDF then switched
 * those strings to UTF-16BE — and this document embeds NO font files and
 * declares WinAnsiEncoding on all 14 standard fonts, so a UTF-16 string cannot
 * render. Measured on real exports: the gear report's machine names
 * ("CNC Gear Hobber - small (<=m4, <=D200)") and the sheet-metal material note
 * ("CRC EUR 781/t -> GBP 0.67/kg mill") were mojibake in the rate tables.
 *
 * Patching the instance covers `doc.text` and, because jspdf-autotable renders
 * cells through the same instance method, the tables as well.
 */
function hardenPdfText(doc: jsPDF): jsPDF {
  const d = doc as unknown as { text: (...a: unknown[]) => unknown };
  const orig = d.text.bind(doc);
  const clean = (t: unknown): unknown =>
    typeof t === 'string' ? winAnsiSafe(t)
      : Array.isArray(t) ? t.map(x => (typeof x === 'string' ? winAnsiSafe(x) : x))
      : t;
  d.text = (...args: unknown[]) => orig(clean(args[0]), ...args.slice(1));
  return doc;
}

function lastFinalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

function pageCount(doc: jsPDF): number {
  return (doc as unknown as { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages();
}

/** Add a page if fewer than `need` mm remain; reset y to top margin. */
function chk(doc: jsPDF, y: number, need: number): number {
  if (y + need > 276) { doc.addPage(); return 18; }
  return y;
}

/** Draw the full-width navy section header bar and return new y. */
function secBar(doc: jsPDF, y: number, title: string, right?: string): number {
  y = chk(doc, y, 16);
  doc.setFillColor(...NAVY);
  doc.roundedRect(MG, y, CW, 9, 1.5, 1.5, 'F');
  // Orange left accent
  doc.setFillColor(...ORANGE);
  doc.roundedRect(MG, y, 5, 9, 1, 1, 'F');
  doc.setFillColor(...NAVY); // patch rounded right edge of accent
  doc.rect(MG + 3, y, 2, 9, 'F');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...WHITE);
  doc.text(title, MG + 10, y + 6);
  if (right) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 215, 240);
    doc.text(right, W - MG - 2, y + 6, { align: 'right' });
  }
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...SLATE);
  return y + 13;
}

/**
 * Make a string safe for the built-in Helvetica font.
 *
 * jsPDF's standard fonts are WinAnsi-encoded. A character outside that set —
 * an arrow, a tick, a maths glyph, an emoji — does not merely drop: jsPDF
 * emits it as multi-byte garbage and the WHOLE line renders letter-spaced and
 * unreadable ("G e a r   r o u t e : ... !'"). A gear route note printed
 * exactly like that on a live report, so this is a report-wide guard, not a
 * gear one. Characters that ARE in WinAnsi (x, em dash, degree, pound, ±)
 * pass through untouched.
 */
const STROKED: Record<string, string> = { 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D', 'ı': 'i', 'ħ': 'h', 'Ħ': 'H' };
/** Currency signs the PDF font (WinAnsi) cannot draw, printed as their ISO code — the whitelist below used to DELETE
 *  them, so an India report printed "Total Should-Cost 2445.66" with no currency at all (casting 360 review, Oct 2026). */
const CURRENCY_CODES: Record<string, string> = { '₹': 'INR', '฿': 'THB', '₫': 'VND', '₩': 'KRW', '₺': 'TRY', '₱': 'PHP' };
export function winAnsiSafe(s: string): string {
  return s
    .replace(/[₹฿₫₩₺₱]\s?(?=[\d(+-])/g, ch => `${CURRENCY_CODES[ch.trim()]} `)   // "₹2,445" → "INR 2,445"
    .replace(/[₹฿₫₩₺₱]/g, ch => CURRENCY_CODES[ch])                          // "₹/kg" → "INR/kg"
    .replace(/[\u2192\u2794\u27A1]/g, '->')      // arrows
    .replace(/[\u2190]/g, '<-')
    .replace(/[\u2713\u2714]/g, 'OK')             // ticks
    .replace(/[\u2717\u2718\u2716]/g, 'x')       // crosses
    .replace(/[\u2265]/g, '>=').replace(/[\u2264]/g, '<=')
    .replace(/[\u2248]/g, '~').replace(/[\u2260]/g, '!=')
    .replace(/[\u25CF\u25AA]/g, '-')              // block bullets
    // A WHITELIST, not a Latin-1 cut-off. WinAnsi's upper range carries the
    // typographic characters this codebase's prose is full of - em/en dash,
    // curly quotes, bullet, ellipsis, euro, trademark. Cutting at Latin-1
    // would silently mangle every existing report to fix one arrow.
    // A letter outside WinAnsi keeps its base letter (Wrocław → Wroclaw, Łódź → Lodz), not nothing.
    .replace(/[^\u0020-\u00FF\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC]/g,
      ch => STROKED[ch] ?? (/^[A-Za-z]$/.test(ch.normalize('NFD').charAt(0)) ? ch.normalize('NFD').charAt(0) : ''));
}

/** Draw a compact titled call-out box (tint fill + accent left rule + wrapped
 *  body lines). Returns the new y. Used for provenance / assumptions / exclusions
 *  / DFM advisories so they read as first-class report content, not footnotes. */
function calloutBox(
  doc: jsPDF, y: number, title: string, lines: string[],
  accent: RGB = NAVY, fill: RGB = HDR,
): number {
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
  const wrapped: string[] = [];
  for (const ln of lines) {
    const parts = doc.splitTextToSize(winAnsiSafe(ln), CW - 12) as string[];
    for (const p of parts) wrapped.push(p);
  }
  const boxH = 8 + wrapped.length * 3.9 + 2;
  y = chk(doc, y, boxH + 4);
  doc.setFillColor(...fill);
  doc.roundedRect(MG, y, CW, boxH, 1.5, 1.5, 'F');
  doc.setFillColor(...accent);
  doc.rect(MG, y, 1.6, boxH, 'F');
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...accent);
  doc.text(winAnsiSafe(title), MG + 5, y + 5.5);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
  let ty = y + 10.5;
  for (const w of wrapped) { doc.text(w, MG + 5, ty); ty += 3.9; }
  return y + boxH + 5;
}

/** Shared autoTable head styles. */
const TH = {
  headStyles: {
    fillColor: NAVY as RGB, textColor: WHITE as RGB,
    fontStyle: 'bold' as const, fontSize: 7.5,
    cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
  },
  alternateRowStyles: { fillColor: LIGHT as RGB },
  bodyStyles: {
    fontSize: 8, textColor: SLATE as RGB,
    cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
  },
};

/**
 * Draw the CostVision logo as crisp vector — indigo "cv" badge + blue wordmark,
 * matching the brand colours/typeface. Sharp at any size; used in every report
 * footer so branding shows on every page. `x`,`y` = top-left of the badge (mm),
 * `badgeH` = badge height (mm). Returns the total width drawn (mm).
 */
export function drawCostVisionLogo(doc: jsPDF, x: number, y: number, badgeH = 4.2): number {
  const BADGE: RGB = [79, 70, 229];   // indigo "cv" badge
  const WORD:  RGB = [37, 99, 235];   // "CostVision" blue
  const r = badgeH * 0.26;
  doc.setFillColor(...BADGE);
  doc.roundedRect(x, y, badgeH, badgeH, r, r, 'F');
  doc.setTextColor(...WHITE); doc.setFont('helvetica', 'bold'); doc.setFontSize(badgeH * 1.7);
  doc.text('cv', x + badgeH / 2, y + badgeH * 0.73, { align: 'center' });
  const wx = x + badgeH + badgeH * 0.30;
  doc.setTextColor(...WORD); doc.setFont('helvetica', 'bold'); doc.setFontSize(badgeH * 1.95);
  doc.text('CostVision', wx, y + badgeH * 0.78);
  const width = (wx - x) + doc.getTextWidth('CostVision');
  doc.setFont('helvetica', 'normal');
  return width;
}

// ════════════════════════════════════════════════════════════════════════════
//  MAIN SHOULD-COST PDF
// ════════════════════════════════════════════════════════════════════════════

/** Commodity-appropriate material-utilisation benchmark for the §3 note. The old
 *  text hard-coded "casting 65–85 %, machining 60–75 %", which is wrong on a
 *  sheet-metal report (blanking yield is nesting-driven, ~55–75 %). */
function utilisationBenchmarkNote(commodity?: string, lossIsNotScrap = false): string {
  const c = String(commodity ?? '');
  // On a casting whose gating is remelted the utilisation is the metal LOST in melting (dross, burn-off) — not the
  // casting yield; printing a 65–85 % yield band beside a 98 % figure contradicted the line it sat on.
  if (lossIsNotScrap) return 'Melt loss only — runners and risers are remelted (their melt energy is in the cost)';
  const ref = (t: string) => `Reference: ${t} (CostVision engineering estimate)`;
  if (/sheet_metal|stamp/.test(c))      return ref('stamping / blanking 55–75 %, nesting + skeleton');
  if (/forging/.test(c))                return ref('forging 75–90 %, flash + bar drop');
  if (/machining/.test(c))              return ref('machining 60–75 %, stock removal');
  if (/cast/.test(c))                   return ref('casting 65–85 %, runners + risers');
  if (/extrusion/.test(c))              return ref('extrusion 85–95 %, end crop');
  return '';
}

/** Shared should-cost report body — §1 through §16 (breakdown, ops, machine
 *  buildup, traceability, uncertainty, sensitivity, regional 10-country
 *  comparison, carbon, insights, DFM/DFA, optimisation, roadmap, scenarios).
 *  Drawn into any jsPDF doc at cursor `y`; returns the new `y`. Used by both
 *  the standalone Should-Cost report (printPDF) and the Master report Part A. */
/**
 * Every source photograph the costing was built from, slot-labelled, two-up.
 *
 * Lives in the SHARED body rather than in printPDF, because the Master Cost
 * Report renders PART A from here — putting it in printPDF alone meant the
 * master report, which is the one a PCB costing normally produces, showed no
 * photographs at all unless the vision analysis had run and populated its
 * separate C7 section.
 */
function renderSourcePhotographs(doc: jsPDF, y: number, photos: ReportPhoto[], intro?: string): number {
  if (photos.length === 0) return y;
  // Break only if there is not room, rather than unconditionally. An
  // unconditional addPage() here left the Master report's PART A divider page
  // almost empty, because the shared body starts with this section.
  y = chk(doc, y, 100);
  y = secBar(doc, y, 'Source Photographs', `${photos.length} image${photos.length > 1 ? 's' : ''} the costing was built from`);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY);
  const partPhotoOnly = photos.every(p => p.label === 'Part photo');
  for (const ln of doc.splitTextToSize(intro ?? (partPhotoOnly
    ? 'The photograph supplied with this part — for identification only; no figure in this report is read from it.'
    : 'Every component identification in the bill of materials traces to a package marking legible in one of these images. '
      + 'Lines flagged as estimated could not be read from any of them.'), CW) as string[]) {
    doc.text(ln, MG, y); y += 3.6;
  }
  y += 4;

  const colW = (CW - 6) / 2;          // two up, 6 mm gutter
  const maxCellH = 62;
  let col = 0;
  let rowTop = y;
  for (const p of photos) {
    try {
      const props = doc.getImageProperties(p.dataUrl);
      let iw = colW, ih = colW * (props.height / props.width);
      if (ih > maxCellH) { ih = maxCellH; iw = maxCellH * (props.width / props.height); }

      if (col === 0) rowTop = chk(doc, rowTop, maxCellH + 12);
      const x = MG + col * (colW + 6);

      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
      doc.text(p.label, x, rowTop + 3);
      doc.setDrawColor(...NAVY); doc.setLineWidth(0.25);
      doc.roundedRect(x, rowTop + 5, iw + 3, ih + 3, 1.5, 1.5, 'S');
      doc.addImage(p.dataUrl, props.fileType || 'JPEG', x + 1.5, rowTop + 6.5, iw, ih, undefined, 'FAST');

      col++;
      if (col === 2) { col = 0; rowTop += maxCellH + 14; }
    } catch { /* skip an image that fails to embed */ }
  }
  return col === 0 ? rowTop : rowTop + maxCellH + 14;
}

/**
 * Functional Safety (ISO 26262) for an electronics costing.
 *
 * Safety grade is a real cost driver on this report: it sets the quality
 * multiplier on every test and inspection operation, it is why BGA X-ray and a
 * long ICT cycle are in the routing at all, and it pushes component selection
 * to AEC-Q parts. The report charged for all of that and never stated the grade
 * it was charging for - the ASIL section existed only in the master report's
 * PART C, which needs the vision analysis to have run.
 *
 * This NEVER derives an ASIL. An ASIL is an output of hazard analysis (HARA),
 * not something readable off a board photograph, so when none has been supplied
 * the section states what the costing assumed and asks for it to be confirmed.
 */
/**
 * Geometric DFM/DFA — findings measured from the CAD, each naming its faces and
 * citing its source.
 *
 * Printed BEFORE the cost-ratio DFM section, because these are the findings an
 * engineer can act on: they point at a feature and quote what was measured.
 * The limitations block is not optional garnish — it is what stops a short
 * finding list being read as a clean part.
 */
/** "Checks applied" — every guardrail, decision and rule override on one page. */
function renderChecksApplied(doc: jsPDF, y: number, ch: ChecksAppliedMeta | null | undefined): number {
  if (!ch) return y;
  y = chk(doc, y, 30);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text('Checks Applied to This Costing', MG, y); y += 5;

  const fmt = (v: unknown): string => v == null ? '—' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : String(v).slice(0, 40);
  const status = ch.costable
    ? ['COSTABLE — no blocking decision is open and every blocking check has been acknowledged by name.']
    : ['NOT COSTABLE — a blocking decision is open or a blocking check is unacknowledged. This figure must not be quoted.'];
  const q = ch.geometryQuality === 'occt' ? 'Geometry: measured from the CAD solid (OCCT).'
    : ch.geometryQuality === 'stl' ? 'Geometry: measured from a mesh (STL) — features not visible to the kernel were asked for, not assumed.'
    : ch.geometryQuality === 'text' ? 'Geometry: NOT measured.' : '';
  y = calloutBox(doc, y, ch.costable ? 'Status' : 'Status — BLOCKED', [...status, ...(q ? [q] : [])],
    ch.costable ? GN : RD, ch.costable ? [237, 247, 237] : [252, 236, 236]);

  if (ch.sanity.length) {
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG },
      head: [['Check', 'Severity', 'Blocking', 'Acknowledged', 'Finding']],
      body: ch.sanity.map(w => [w.code, w.severity, w.blocking ? 'yes' : 'no', w.blocking ? (w.acknowledged ? 'yes' : 'NO') : '—', w.message]),
      styles: { fontSize: 6.5, cellPadding: 1.2 }, headStyles: { fillColor: NAVY, fontSize: 6.5 },
      columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 14 }, 2: { cellWidth: 14 }, 3: { cellWidth: 20 } },
    });
    y = lastFinalY(doc) + 4;
  } else {
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY);
    doc.text('No consistency check fired.', MG, y); y += 5;
  }

  if (ch.decisions.length) {
    y = chk(doc, y, 20);
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG },
      head: [['Decision', 'Severity', 'Answer']],
      body: ch.decisions.map(d => [d.question, d.severity, decisionAnswerText(d)]),
      styles: { fontSize: 6.5, cellPadding: 1.2 }, headStyles: { fillColor: NAVY, fontSize: 6.5 },
      columnStyles: { 1: { cellWidth: 18 }, 2: { cellWidth: 40 } },
    });
    y = lastFinalY(doc) + 4;
  }

  if (ch.ruleValues?.length) {
    y = chk(doc, y, 20);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY);
    doc.text('Values the rules set on the costing form, and why (money in a basis is as recorded, GBP):', MG, y); y += 4;
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG },
      head: [['Field', 'Costed', 'Source', 'Basis']],
      body: ch.ruleValues.map(r => [r.label, r.edited ? `${r.value} (edited; rule ${r.ruleValue})` : r.value, r.source, r.basis]),
      styles: { fontSize: 6, cellPadding: 1 }, headStyles: { fillColor: NAVY, fontSize: 6 },
      columnStyles: { 0: { cellWidth: 36 }, 1: { cellWidth: 24 }, 2: { cellWidth: 16 } },
    });
    y = lastFinalY(doc) + 4;
  }

  if (ch.overrides.length) {
    y = chk(doc, y, 20);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY);
    doc.text('Rule-owned values (the geometry and rules decide these; a model value that disagreed was overwritten):', MG, y); y += 4;
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG },
      head: [['Field', 'Rule', 'Model said', 'Used', 'Basis']],
      body: ch.overrides.slice(0, 40).map(o => [o.field, o.ruleId, o.contradicted ? fmt(o.from) : (o.from == null ? '—' : fmt(o.from)), fmt(o.to), o.basis.slice(0, 110)]),
      styles: { fontSize: 6, cellPadding: 1 }, headStyles: { fillColor: NAVY, fontSize: 6 },
      columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 30 }, 2: { cellWidth: 20 }, 3: { cellWidth: 20 } },
    });
    y = lastFinalY(doc) + 6;
  }
  return y;
}

function renderGeometricDFM(
  doc: jsPDF, y: number, g: GeometricDFMMeta | null | undefined,
  money: (n: number) => string,
  amounts?: Record<string, { text: string; basis?: string }> | null, recosted?: boolean, pending?: boolean,
  /** The fixturings the costing charges ("Load / clamp / unload — N fixturing(s)"), to set beside the setups finding. */
  costedFixturings?: number | null,
): number {
  if (!g && pending) {
    // The stub axle's report left the section out while its job was still running: a reader took that as "no issues".
    y = chk(doc, y, 14);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
    doc.text('Geometric DFM / DFA - not included', MG, y);
    y += 5;
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
    const msg = doc.splitTextToSize('The geometric DFM check of this part had not finished when this report was exported, so its findings '
      + 'are not in this report. This is not a clean result: export again once the DFM panel shows its findings.', 180);
    doc.text(msg, MG, y);
    return y + msg.length * 3.4 + 4;
  }
  if (!g) return y;

  y = chk(doc, y, 26);
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text('Geometric DFM / DFA - measured from the CAD model', MG, y);
  y += 5;
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
  const groups = g.grouped ?? [];
  const addressable = g.totalAddressableGBP ?? 0;
  doc.text(
    `${groups.length} issue(s) across ${g.findings.length} instance(s), from `
    + `${g.featuresExamined} measured feature(s) (${g.rulesEvaluated} per-feature rule(s), plus the part-level checks). Every issue `
    + 'names the B-rep faces that produced it and the published source of its threshold. '
    + (amounts
      ? (recosted
        ? 'A £ is what the finding moves THIS costing by, re-costed through its own operations (overhead and margin included); '
          + 'levers overlap, so they are not summed. Issues without a figure are quality or yield risks with no modelled cost path.'
        : 'A £ is the finding priced at its reference rate, before a costing of this part; issues without a figure have no modelled cost path.')
      : addressable > 0
        ? `Priced findings total ${money(addressable)}/part at the reference rate; issues shown without a figure are `
          + 'quality or yield risks with no modelled cost path — see each entry.'
        : 'No finding on this part has a modelled cost path; each says why.'),
    MG, y, { maxWidth: CW });
  y += 11;

  if (!g.packAvailable) {
    y = calloutBox(doc, y, 'No geometric rule pack for this commodity',
      ['Geometry-based checks did not run. The commercial cost-ratio observations below still apply.'],
      ORANGE, OR_LT);
  }

  for (const gr of groups) {
    y = chk(doc, y, 26);
    const sev = String(gr.severity).toUpperCase();
    const col: RGB = gr.severity === 'critical' || gr.severity === 'major' ? RD
      : gr.severity === 'minor' ? ORANGE : SLATE;
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...col);
    const cost = gr.totalCostGBP ?? 0;
    doc.text(`[${sev}] ${gr.title}${gr.count > 1 ? `  (${gr.count} instances)` : ''}`, MG, y);
    const shownAmt = amounts ? amounts[gr.ruleId]?.text ?? (cost > 0 ? 'not re-costed' : '') : cost > 0 ? `${money(cost)}/part (ref. rate)` : '';
    if (shownAmt) {
      doc.setTextColor(...NAVY);
      doc.text(shownAmt, MG + CW, y, { align: 'right' });
    }
    y += 3.8;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.3); doc.setTextColor(...SLATE);
    for (const ln of doc.splitTextToSize(`Worst: ${gr.worst.detail}`, CW - 4) as string[]) {
      doc.text(ln, MG + 2, y); y += 3.3;
    }
    doc.setTextColor(...GREY);
    doc.text(
      `${measureLabel(gr.worst.measured.field)} ${measureAgainstLimit(gr.range, gr.count, gr.threshold)}`, MG + 2, y);
    y += 3.3;
    const basisAmt = amounts?.[gr.ruleId]?.basis;
    if (basisAmt) for (const ln of doc.splitTextToSize(`In this costing: ${basisAmt}.`, CW - 4) as string[]) { doc.text(ln, MG + 2, y); y += 3.1; }
    // Face list is capped: a 104-instance issue would otherwise run pages of ids.
    const shown = gr.faceIds.slice(0, 30).join(', ');
    for (const ln of doc.splitTextToSize(
      `Faces: ${shown}${gr.faceIds.length > 30 ? ` ... (${gr.faceIds.length} total)` : ''}`,
      CW - 4) as string[]) { doc.text(ln, MG + 2, y); y += 3.1; }
    for (const ln of doc.splitTextToSize(`Fix: ${gr.recommendation}`, CW - 4) as string[]) {
      doc.text(ln, MG + 2, y); y += 3.3;
    }
    // The header promises each unpriced issue says why — print it.
    const why = (gr as { costNotModelled?: string }).costNotModelled;
    if (why && !(amounts?.[gr.ruleId])) for (const ln of doc.splitTextToSize(`Not priced: ${why}`, CW - 4) as string[]) { doc.text(ln, MG + 2, y); y += 3.1; }
    // Two counts of setups in one report (knuckle 3 v 4, bracket 9 v 4): say which one is in the price and why they differ.
    if (gr.ruleId === 'machining.setup.access-directions' && costedFixturings) {
      const n = (gr as { worst?: { measured?: { value?: number } } }).worst?.measured?.value;
      for (const ln of doc.splitTextToSize(`In this costing: ${costedFixturings} fixturing(s) are charged, from the routing of the machined `
        + `faces. This finding counts ${n ?? 'the'} direction(s) the measured holes face. They are different counts; the costing's `
        + `${costedFixturings} is the one in the price.${n && n > costedFixturings ? ' Check the routing against the holes before quoting.' : ''}`, CW - 4) as string[]) {
        doc.text(ln, MG + 2, y); y += 3.1;
      }
    }
    const src = gr.source.clause ? `${gr.source.standard} - ${gr.source.clause}` : gr.source.standard;
    for (const ln of doc.splitTextToSize(`Source: ${src}`, CW - 4) as string[]) {
      doc.text(ln, MG + 2, y); y += 3.1;
    }
    if (gr.source.note) {
      for (const ln of doc.splitTextToSize(gr.source.note, CW - 6) as string[]) {
        doc.text(ln, MG + 4, y); y += 3.1;
      }
    }
    y += 2;
  }

  if (groups.length === 0 && g.packAvailable) {
    y = calloutBox(doc, y, 'No geometric findings',
      ['No rule in the pack fired on the measured features. Read this alongside the limitations '
       + 'below - it means the checks that RAN found nothing, not that the part is clean.'],
      NAVY, HDR);
  }

  if (g.dfa?.available) {
    y = chk(doc, y, 20);
    const p = (g.dfa.penalties ?? []).map(x => `+${Math.round((x.addedSec ?? 0) * 10) / 10}s ${x.reason ?? ''}${x.measured ? ` (${x.measured})` : ''}`);
    y = calloutBox(doc, y, 'DFA - handling & insertion (Boothroyd method, geometric half)', [
      `Handling ${g.dfa.handlingTimeSec}s + insertion ${g.dfa.insertionTimeSec}s = `
      + `${g.dfa.totalTimeSec}s, ${g.dfa.vsIdealRatio}x the 3s ideal part.`,
      ...p,
      ...g.dfa.limitations,
    ], NAVY, HDR);
  }

  if (g.limitations.length) {
    y = calloutBox(doc, y, 'What was NOT checked', g.limitations, ORANGE, OR_LT);
  }
  return y;
}

function renderFunctionalSafety(
  doc: jsPDF, y: number,
  result: PartCostResult,
  commodityType: CommodityType,
  fs: FunctionalSafetyMeta | undefined,
  money: (n: number) => string,
): number {
  if (!/^(pcba|pcb_fab)$/.test(String(commodityType))) return y;
  if (!fs) return y;

  const asil = fs.asil && !/^(unknown|n\/?a|none)$/i.test(fs.asil) ? fs.asil : null;
  const mult = fs.qualityMultiplier ?? null;

  // What the safety grade actually bought, in money: the test and inspection
  // operations it scaled.
  const RX_TEST = /x-ray|xray|ict|test|inspect|aoi|axi/i;
  const testOps = result.operationDetails.filter(o => RX_TEST.test(o.operationName));
  const testCost = testOps.reduce((a, o) => a + o.processCost + o.labourCost, 0);
  const atUnity = mult && mult > 0 ? testCost / mult : null;

  y = chk(doc, y, 60);
  y = secBar(doc, y, 'Functional Safety (ISO 26262)',
    asil ? `ASIL ${asil}` : 'grade assumed - not yet confirmed');

  if (asil) {
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...RD);
    doc.text(`ASIL ${asil}`, MG, y + 2); y += 6;
    if (fs.rationale) {
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY);
      for (const ln of doc.splitTextToSize(fs.rationale.replace(/\s+/g, ' ').trim(), CW) as string[]) {
        y = chk(doc, y, 6); doc.text(ln, MG, y); y += 3.6;
      }
      y += 2;
    }
    if (fs.safetyFunctions?.length) {
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
      for (const ln of doc.splitTextToSize(`Safety functions: ${fs.safetyFunctions.join('; ')}`, CW) as string[]) {
        y = chk(doc, y, 6); doc.text(ln, MG, y); y += 3.6;
      }
      y += 3;
    }
  }

  // What the costing actually applied — the auditable part.
  const rows: string[][] = [
    ['Quality grade costed', (fs.qualityGrade ?? '-').replace(/_/g, ' '),
     'Sets the multiplier on test and inspection cycle times'],
  ];
  if (mult) {
    rows.push(['Test / inspection multiplier', `x${mult.toFixed(2)}`,
      'Applied to every test and inspection operation in section 4']);
  }
  if (testOps.length) {
    rows.push([`Test & inspection cost (${testOps.length} ops)`, money(testCost),
      testOps.map(o => o.operationName).join(', ')]);
    if (atUnity !== null) {
      rows.push(['Same routing at consumer grade', money(atUnity),
        `The safety grade adds ${money(testCost - atUnity)}/part to verification`]);
    }
  }
  rows.push(['ASIL determination', asil ?? 'NOT SUPPLIED',
    asil ? 'From the PCB image analysis - confirm against the safety concept'
         : 'An ASIL comes from hazard analysis (HARA), not from a board photograph']);

  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    head: [['Parameter', 'Value', 'Basis']],
    body: rows,
    theme: 'plain',
    headStyles: { ...TH.headStyles },
    bodyStyles: { ...TH.bodyStyles },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 52, textColor: GREY },
      1: { cellWidth: 34, halign: 'right', fontStyle: 'bold' },
      2: { cellWidth: 96, textColor: GREY, fontSize: 7 },
    },
    didParseCell: (d) => {
      if (d.section === 'body' && d.row.index === rows.length - 1 && !asil) {
        d.cell.styles.textColor = RD;
        d.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = lastFinalY(doc) + 4;

  if (!asil) {
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY);
    const note = 'No ASIL has been supplied for this costing, so the figures above record the quality grade that '
      + 'was ASSUMED rather than a safety rating this tool determined. Confirm the grade against the item safety '
      + 'requirement before quoting: a step up or down changes the verification cost shown above roughly in '
      + 'proportion to the multiplier, and can change component selection and the X-ray strategy as well.';
    for (const ln of doc.splitTextToSize(note, CW) as string[]) {
      y = chk(doc, y, 6); doc.text(ln, MG, y); y += 3.6;
    }
    y += 4;
  }
  return y;
}

export function renderShouldCostSections(
  doc: jsPDF,
  y: number,
  ctx: {
    result: PartCostResult;
    input: UniversalStackInput;
    library: RateLibrary;
    currency: string;
    fxRate: number;
    commodityType: CommodityType;
    region: ManufacturingRegion;
    scenarios: Scenario[];
    cadMeta: CADReportMeta;
    /** The UK-basis book the country was rebuilt from (§9 re-costs the part in each country). */
    baseLibrary?: RateLibrary;
    /** The screen's comparison rows (the part re-collected and costed in each country) — §9 prints exactly these. */
    regionalRows?: RegionalComparisonRow[];
  },
): number {
  const { result, input, library, currency, fxRate, commodityType, region, scenarios, cadMeta, baseLibrary, regionalRows } = ctx;
  y = renderSourcePhotographs(doc, y, cadMeta.photos ?? []);
  const sym  = currencySymbol(currency);
  // thousands separators and no negative zero (casting 360 X27 / X31: "3846985.50", "-0.00")
  const c    = (n: number) => { const v = n * fxRate; return `${sym}${(Math.abs(v) < 0.005 ? 0 : v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; };
  const pct  = (n: number) => `${n.toFixed(1)}%`;
  const pcts = breakdownPercentages(result);
  const alloyMat = library.materials.find(m => m.id === input.rawMaterial.materialId);

  // ════════════════════════════════════════════════════════════════════════
  // §1 — 8-Bucket Cost Breakdown
  // ════════════════════════════════════════════════════════════════════════
  y = secBar(doc, y, '§1 — 8-Bucket Cost Breakdown');

  const buckets: [string, number, number, string][] = [
    ['1.  Raw Material',         result.breakdown.rawMaterial, pcts.rawMaterial,                          ''],
    ['2.  Process (Machine)',    result.breakdown.process,     pcts.process,                              ''],
    ['3.  Direct Labour',        result.breakdown.labour,      pcts.labour,                               ''],
    ['4.  Tooling (amortised)',  result.breakdown.tooling,     pcts.tooling,                              ''],
    ['5.  Packaging',            result.breakdown.packaging,   pcts.packaging,                            ''],
    ['6.  Logistics',            result.breakdown.logistics,   pcts.logistics,                            ''],
    ['    Factory Cost',         result.factoryCost,           (result.factoryCost / result.total) * 100, 'sub'],
    // What overhead is a percentage of. Beside factory cost alone the rate
    // looked wrong: factory cost adds packaging and logistics, the base doesn't.
    ['      Overhead base (mat + proc + lab + tooling)', overheadBaseOf(result), 0,                 'base'],
    [input.priceBasis === 'market_price' ? '7.  Overhead — not added: bought-in price'
      : `7.  Overhead (SG&A) — ${(overheadRateOf(result) * 100).toFixed(1)}% of base`, result.breakdown.overhead, pcts.overhead, ''],
    ['    Subtotal',             result.subtotal,              (result.subtotal  / result.total) * 100,   'sub'],
    ['8.  Supplier Margin',      result.breakdown.margin,      pcts.margin,                               ''],
    ['TOTAL SHOULD-COST',        result.total,                 100,                                       'total'],
  ];

  // col widths: 66 + 30 + 22 + (182-118) = 66+30+22+64 = 182 ✓
  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    head: [['Cost Bucket', `Amount (${currency})`, '% of Total', 'Cost Mix Bar']],
    body: buckets.map(([lbl, val, p, kind]) => [lbl, c(val), kind === 'base' ? '' : pct(p), '']),
    theme: 'plain',
    headStyles: { ...TH.headStyles },
    bodyStyles: { ...TH.bodyStyles },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 66 },
      1: { cellWidth: 30, halign: 'right' },
      2: { cellWidth: 22, halign: 'right' },
      3: { cellWidth: 64 },
    },
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      const rt = buckets[d.row.index]?.[3];
      if (rt === 'total') {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fontSize = 9;
        d.cell.styles.fillColor = OR_LT;
        d.cell.styles.textColor = NAVY;
      } else if (rt === 'sub') {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = HDR;
        d.cell.styles.textColor = NAVY;
      } else if (rt === 'base') {
        d.cell.styles.fontStyle = 'italic';
        d.cell.styles.fontSize = 7;
        d.cell.styles.textColor = SLATE;
      }
    },
    didDrawCell: (d) => {
      if (d.section !== 'body' || d.column.index !== 3) return;
      const p = buckets[d.row.index]?.[2] ?? 0;
      if (p <= 0) return;
      const rt  = buckets[d.row.index]?.[3];
      const maxW = d.cell.width - 8;
      const fillW = Math.max((p / 100) * maxW, 0.8);
      const barH  = 3.5;
      const bx    = d.cell.x + 4;
      const by    = d.cell.y + (d.cell.height - barH) / 2;
      doc.setFillColor(220, 225, 238);
      doc.roundedRect(bx, by, maxW, barH, 0.8, 0.8, 'F');
      doc.setFillColor(...(rt === 'total' ? NAVY : rt === 'sub' ? SLATE : ORANGE));
      doc.roundedRect(bx, by, fillW, barH, 0.8, 0.8, 'F');
    },
  });
  y = lastFinalY(doc) + 5;

  if ((result.toolingNRE ?? 0) > 0) {
    doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...GREY);
    doc.text(`NRE / Tooling (one-time, excluded from unit cost): ${c(result.toolingNRE!)}`, MG, y);
    y += 6;
  }

  // ── §2 Commercial Parameters ─────────────────────────────────────────────
  y = chk(doc, y, 30);
  y = secBar(doc, y, '§2 — Commercial Parameters');

  // col widths: 44 + 50 + 44 + (182-138) = 44+50+44+44 = 182 ✓
  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    body: [
      ['Overhead Rate', pct(input.overheadPct * 100), 'Supplier Margin', pct(input.marginPct * 100)],
      ['Packaging / part', c(input.packagingPerPart), 'Logistics / part', c(input.logisticsPerPart)],
      ...(input.tooling.mode === 'amortized' ? [[
        'Total Tooling Cost', c(input.tooling.totalToolingCost),
        'Amortisation Volume', `${input.tooling.amortizationVolume.toLocaleString()} parts`,
      ],
      // what the tooling is (casting 360 X13: ₹38.5 lakh was one number) and what the volume is
      ...(input.tooling.items ?? []).map(t => [`  ${t.label}`, c(t.gbp), '', '']),
      ['Amortisation basis', { content: toolingAmortisationBasis(input), colSpan: 3 }],
      ] : []),
    ],
    theme: 'plain',
    bodyStyles: { fontSize: 8, cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 } },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 44, textColor: GREY },
      1: { cellWidth: 50, fontStyle: 'bold', textColor: NAVY },
      2: { cellWidth: 44, textColor: GREY },
      3: { cellWidth: 44, fontStyle: 'bold', textColor: NAVY },
    },
  });
  y = lastFinalY(doc) + 10;

  // ════════════════════════════════════════════════════════════════════════
  // Functional safety sits between the commercial parameters and the cost
  // detail: it is the context that explains why the verification operations in
  // section 4 cost what they do.
  y = renderChecksApplied(doc, y, cadMeta.checks);
  const fixturings = (() => {
    const m = input.operations.map(o => /Load \/ clamp \/ unload\s*[—-]\s*(\d+) fixturing/i.exec(o.operationName)).find(Boolean);
    return m ? Number(m[1]) : null;
  })();
  y = renderGeometricDFM(doc, y, cadMeta.geometricDFM, c, cadMeta.geometricDFMAmounts, cadMeta.geometricDFMRecosted, cadMeta.geometricDFMPending, fixturings);
  y = renderFunctionalSafety(doc, y, result, commodityType, cadMeta.functionalSafety, c);

  // §3 — Material Detail  (new page)
  // ════════════════════════════════════════════════════════════════════════
  doc.addPage(); y = 18;

  const mat     = library.materials.find(m => m.id === input.rawMaterial.materialId);
  const grossWt = input.rawMaterial.directCost === undefined
    ? input.rawMaterial.netWeightKg / input.rawMaterial.materialUtilization : 0;
  const scrapWt    = Math.max(0, grossWt - input.rawMaterial.netWeightKg);

  y = secBar(doc, y, '§3 — Material Detail');

  const matRows: string[][] = [
    ['Material ID',                input.rawMaterial.materialId,                             'ID',           ''],
    ['Grade / Specification',      mat?.grade ?? 'Direct Cost Entry',                        '',             mat?.sourceNote ?? ''],
    ['Region',                     mat?.region ?? '—',                                       '',             ''],
    ['Costed Net Weight',          `${input.rawMaterial.netWeightKg.toFixed(4)} kg`,         'kg',           'The weight the material line is costed on — the finished part, plus the machining stock or reject allowance the module carries (see Key Assumptions)'],
  ];

  // Every item the engine puts in the material line, on BOTH paths, so the rows add up to bucket 1 — the supplied-price
  // path showed only its direct cost (a battery pack's bought-in cells appeared nowhere in §3; uploaded-parts review).
  const tracedV = (f: string) => (result.traceability ?? []).find(t => t.field === f)?.value;
  let metalLine = 0;
  if (input.rawMaterial.directCost !== undefined) {
    metalLine = input.rawMaterial.directCost;
    matRows.push(['Direct Material Cost', c(metalLine), currency, 'Priced by the commodity module (not weight × £/kg)']);
  } else {
    const price = tracedV('material.pricePerKg') ?? mat?.pricePerKg ?? 0;
    const scrapPrice = tracedV('material.scrapRecoveryPricePerKg') ?? mat?.scrapRecoveryPricePerKg ?? 0;
    const lossIsNotScrap = !!(input.rawMaterial as { lossIsNotScrap?: boolean }).lossIsNotScrap;
    const credit = lossIsNotScrap ? 0 : scrapWt * scrapPrice;
    metalLine = grossWt * price - credit;
    matRows.push(
      ['Gross Weight (stock)',        `${grossWt.toFixed(4)} kg`,                              'kg',           'Net ÷ utilisation ratio'],
      // With the melt shop on, gross − net is the metal LOST in melting (runners and risers are remelted) — it was
      // labelled "Scrap / Runner Weight", 0.06 kg on a knuckle whose gating weighs ~2 kg (casting 360 review, Oct 2026).
      [lossIsNotScrap ? 'Melt Loss (metal lost)' : 'Scrap / Runner Weight', `${scrapWt.toFixed(4)} kg`, 'kg',
        lossIsNotScrap ? 'Gross - Net: metal lost in melting; runners, risers and rejects are remelted' : 'Gross - Net'],
      ['Material Utilisation',        pct(input.rawMaterial.materialUtilization * 100),        '%',            utilisationBenchmarkNote(commodityType, lossIsNotScrap)],
      ['Material Price',              c(price),                                               `${currency}/kg`, mat?.sourceNote ?? ''],
      ['Scrap Recovery Price',        c(scrapPrice),                                          `${currency}/kg`, ''],
      ['Gross Material Cost',         c(grossWt * price),                                     currency,       'Gross × price/kg'],
      ['Scrap Credit',                credit > 0 ? `-${c(credit)}` : c(0),                    currency,       lossIsNotScrap ? 'None — melt loss is metal lost, not scrap sold' : 'Scrap × recovery price'],
    );
  }
  {
    const consumables = input.rawMaterial.consumablesCostPerPart ?? 0;
    const energy = (result.traceability ?? []).filter(t => /^rawMaterial\.energyKwh\./.test(t.field)).reduce((sum, t) => sum + (Number(t.value) || 0), 0);
    const boughtIn = input.rawMaterial.boughtIn?.cost ?? 0;
    const items = input.rawMaterial.consumablesItems ?? [];
    if (consumables > 0 && items.length) {
      for (const i of items) matRows.push([`Consumable / service — ${i.label}`, c(i.gbp), currency, 'Per part']);
      const rest = consumables - items.reduce((s2, i) => s2 + i.gbp, 0);
      if (Math.abs(rest) >= 0.00005) matRows.push(['Consumables — not itemised', c(rest), currency, 'Per part']);
    } else if (consumables > 0) matRows.push(['Consumables & services', c(consumables), currency, 'Per part']);
    if (energy > 0) matRows.push(['Process energy', c(energy), currency, 'kWh × the costing country tariff']);
    if (boughtIn > 0) matRows.push(['Bought-in content', c(boughtIn), currency, 'Supplier price, no second overhead / margin']);
    const residual = result.breakdown.rawMaterial - metalLine - consumables - energy - boughtIn;
    if (Math.abs(residual) >= 0.0005) matRows.push(['UNRECONCILED', c(residual), currency, 'The rows above do not add up to the material bucket — report this']);
    matRows.push(['NET RAW MATERIAL COST', c(result.breakdown.rawMaterial), currency, '= bucket 1']);
  }
  // A pass-through placeholder has no price of its own, so its date says nothing
  // about the cost: print the date of the library the commodity module priced from
  // (the radar report showed the placeholder's '2026-06-14' under September rates).
  const passThrough = input.rawMaterial.directCost !== undefined;
  matRows.push(
    ['', '', '', ''],
    ['Data Confidence', mat?.confidence ?? '—', '', ''],
    passThrough
      ? ['Rates dated', String(library.lastModified ?? '—').slice(0, 10), '', `Rate library ${library.version ?? ''} used by the commodity module`]
      : ['Effective Date', mat?.effectiveDate ?? '—', '', ''],
  );

  // col widths: 58 + 34 + 14 + (182-106) = 58+34+14+76 = 182 ✓
  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    head: [['Parameter', 'Value', 'Unit', 'Notes']],
    body: matRows,
    theme: 'plain',
    headStyles: { ...TH.headStyles },
    bodyStyles: { ...TH.bodyStyles },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 58, textColor: GREY },
      1: { cellWidth: 34, halign: 'right', fontStyle: 'bold' },
      2: { cellWidth: 14, textColor: GREY },
      3: { cellWidth: 76, textColor: GREY, fontSize: 7.5 },
    },
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      const t = Array.isArray(d.cell.text) ? d.cell.text[0] : '';
      if (t.startsWith('NET RAW') || t.startsWith('TOTAL')) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = OR_LT;
        d.cell.styles.textColor = NAVY;
      }
    },
  });
  y = lastFinalY(doc) + 8;

  // ── §3B — Itemised material lines ─────────────────────────────────────────
  // For a pass-through material bucket (PCBA BOM, harness schedule, BIW
  // sub-parts) the single `directCost` figure above is the largest number in
  // the report and, on its own, unauditable. Print the lines behind it.
  const matLines = input.rawMaterial.lines ?? [];
  if (matLines.length > 0) {
    const linesTotal = matLines.reduce((a, l) => a + l.qty * l.unitCost, 0);
    const totalQty = matLines.reduce((a, l) => a + l.qty, 0);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
    doc.text(`3B  Bill of Materials  (${matLines.length} lines  ${String.fromCharCode(183)}  ${totalQty} pieces)`, MG, y);
    y += 5;

    // Column set matches the PCB master report's BOM so the two are readable
    // side by side: line number, designator, description, package, value, qty,
    // unit and extended cost. Package and value are what let an engineer check
    // a line against the board without going back to the source photographs.
    const body = matLines.map((l, i) => [
      String(i + 1), l.ref, l.description, l.pkg ?? '', l.value ?? '',
      String(l.qty), c(l.unitCost), c(l.qty * l.unitCost),
    ]);
    body.push(['', '', 'BOM TOTAL', '', '', String(totalQty), '', c(linesTotal)]);

    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG },
      head: [['#', 'RefDes', 'Description', 'Pkg', 'Value', 'Qty', `Unit ${currency}`, `Ext ${currency}`]],
      body,
      theme: 'plain',
      headStyles: { ...TH.headStyles, fontSize: 7 },
      bodyStyles: { ...TH.bodyStyles, fontSize: 6.8 },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: {
        // The shared body padding is 4 mm each side, which on a narrow column
        // leaves no room for the digits and wraps "14" onto two lines. Give the
        // index column its own tight padding.
        0: { cellWidth: 10, textColor: GREY, halign: 'right',
             cellPadding: { top: 2.5, bottom: 2.5, left: 1, right: 1.5 } },
        1: { cellWidth: 20, fontStyle: 'bold' },
        2: { cellWidth: 55 },
        3: { cellWidth: 23, textColor: GREY },
        4: { cellWidth: 16, textColor: GREY },
        5: { cellWidth: 14, halign: 'right' },
        6: { cellWidth: 20, halign: 'right' },
        7: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (d) => {
        if (d.section !== 'body') return;
        if (d.row.index === body.length - 1) {
          d.cell.styles.fontStyle = 'bold';
          d.cell.styles.fillColor = OR_LT;
          d.cell.styles.textColor = NAVY;
        }
      },
    });
    y = lastFinalY(doc) + 4;

    // Provenance is per line and too long for a column, so it goes underneath —
    // dropping it would leave the reader unable to tell a read marking from a
    // class median.
    const sourced = matLines.filter(l => l.note);
    if (sourced.length) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); doc.setTextColor(...NAVY);
      doc.text('Line provenance', MG, y); y += 3.6;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY);
      for (const l of sourced) {
        y = chk(doc, y, 6);
        for (const ln of doc.splitTextToSize(`${l.ref} - ${l.note}`, CW) as string[]) {
          doc.text(ln, MG, y); y += 3.2;
        }
      }
      y += 2;
    }

    // Reconcile the itemisation against the bucket it is meant to explain. A
    // silent gap here would be worse than printing nothing.
    const direct = input.rawMaterial.directCost ?? 0;
    const gap = direct - linesTotal;
    const note = Math.abs(gap) < 0.005
      ? `Lines reconcile exactly to the ${c(direct)} direct material cost.`
      : `Lines total ${c(linesTotal)} against a ${c(direct)} material bucket - the ${c(Math.abs(gap))} `
        + `${gap > 0 ? 'balance' : 'excess'} is carried outside the itemisation${/pcb/.test(commodityType) ? ' (bare board, yield / rework allowance, coating)' : ''} — see the material rows above.`;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GREY);
    for (const ln of doc.splitTextToSize(note, CW) as string[]) { doc.text(ln, MG, y); y += 3.6; }
    y += 5;
  }

  // ── Alloy / specification advisory (casting commodities) ──────────────────
  // A general die-cast alloy on a safety-critical structural part is the exact
  // silent mis-spec the knuckle exposed. Flag it; don't leave it implicit.
  const matId = input.rawMaterial.materialId.toLowerCase();
  const isCasting = /cast/.test(commodityType);
  // Aluminium general die-cast alloys only — the structural alternatives named below are aluminium; a zinc (Zamak) part
  // was told to use Silafont / Aural / Castasil.
  const generalDieCast = /adc12|a380|a383|a413|a319|a360/.test(matId);
  // What the costing carries, as an operation OR a per-part consumable / service line (heat treat, NDT and blast are
  // priced as consumables on the casting routes — the PDF used to say "not in this cost" beside a costing that held
  // £3.18 of heat treat and £5.00 of NDT; uploaded-parts review, Oct 2026).
  const costedLines = [...result.operationDetails.map(op => op.operationName),
    ...(input.rawMaterial.consumablesItems ?? []).filter(i => i.gbp > 0).map(i => i.label)];
  const carries = (re: RegExp) => costedLines.some(n => re.test(n));
  const hasHeatTreat = carries(/heat|\bt6\b|\bt7\b|solution|ageing|aging|temper|anneal|normalis|carburis|nitrid/i);
  const hasNdt = carries(/\bndt\b|x-?ray|\bct\b|radiograph|ultrason|dye pen|magnetic particle|crack test/i);
  const hasHip = carries(/\bhip\b|hot isostatic/i);
  if (isCasting && generalDieCast) {
    const bullets = [
      `Selected grade "${alloyMat?.grade ?? input.rawMaterial.materialId}" is a GENERAL die-cast alloy (good castability, not high-ductility).`,
      'For safety-critical / structural parts (steering, suspension, brake, chassis, sub-frame) a structural HPDC alloy — Silafont-36, Aural-5 or Castasil-37 — with T7 heat treat and 100% NDT / X-ray is the usual specification (CostVision engineering guidance — confirm against the drawing).',
    ];
    if (!hasHeatTreat || !hasNdt) bullets.push(`${[!hasHeatTreat && 'Heat treat', !hasNdt && 'NDT'].filter(Boolean).join(' and ')} ${!hasHeatTreat && !hasNdt ? 'are' : 'is'} not in this cost. If the part is structural, add ${!hasHeatTreat && !hasNdt ? 'them' : 'it'} (it raises the true cost) or confirm the part is non-structural.`);
    y = calloutBox(doc, y, 'Alloy & Specification Check', bullets, AM, OR_LT);
  }

  // ════════════════════════════════════════════════════════════════════════
  // §4 — Operations Detail  (split into two focused tables)
  // ════════════════════════════════════════════════════════════════════════
  y = chk(doc, y, 22);
  y = secBar(doc, y, '§4 — Operations Detail');

  // Sub-label
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text('4A  Machine Operations', MG, y); y += 5;

  // Table 4A: Machine side
  // col widths: 42 + 32 + 22 + 18 + 18 + (182-132) = 42+32+22+18+18+50 = 182 ✓
  const opRowsA = result.operationDetails.map(op => {
    const mObj = library.machines.find(m => m.id === op.machineId);
    // A bench task (fettling, melt shop, deburr) is labour only — no machine, rate or OEE — as the Excel and the screen
    // show it. The PDF printed the placeholder machine, its rate and 100 % OEE (casting 360 review, Oct 2026).
    if (op.benchOperation || op.cycleTimeHr === 0) {
      return [op.operationName, 'bench (no machine time)', '', '', String(op.partsPerCycle ?? 1), '', c(op.processCost)];
    }
    return [
      op.operationName,
      mObj?.machineClass ?? op.machineId,
      c(op.machineRateUsed),
      (op.cycleTimeHr * 60).toFixed(2),
      // Parts per cycle divides BOTH machine and labour time. Without it the
      // reader cannot reconcile a multi-cavity mould or multi-up stamping:
      // "45 s cycle" against a per-part cost four times smaller looks wrong
      // until you know four parts came out of that cycle.
      String(op.partsPerCycle ?? 1),
      pct(op.oee * 100),
      c(op.processCost),
    ];
  });
  opRowsA.push(['TOTAL', '', '', '', '', '', c(result.breakdown.process)]);

  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    head: [['Operation', 'Machine Class', 'Rate / hr', 'Cycle (min)', 'Parts / Cycle', 'OEE %', 'Machine Cost']],
    body: opRowsA,
    theme: 'plain',
    headStyles: { ...TH.headStyles, fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: SLATE, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 } },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 28 },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 18, halign: 'right' },
      5: { cellWidth: 16, halign: 'right' },
      6: { cellWidth: 44, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (d) => {
      if (d.section === 'body' && d.row.index === opRowsA.length - 1) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = OR_LT;
        d.cell.styles.textColor = NAVY;
      }
    },
  });
  y = lastFinalY(doc) + 6;

  y = chk(doc, y, 22);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text('4B  Labour Detail', MG, y); y += 5;

  // Table 4B: Labour side
  // col widths: 42 + 26 + 22 + 14 + 16 + 14 + 24 + (182-158) = 42+26+22+14+16+14+24+24 = 182 ✓
  const opRowsB = result.operationDetails.map(op => {
    const lObj = library.labour.find(l => l.id === op.labourId);
    return [
      op.operationName,
      lObj?.skillLevel ?? op.labourId,
      c(op.labourRateUsed),
      String(op.manning),
      (op.labourTimeHr * 60).toFixed(2),
      pct(op.labourEfficiency * 100),
      c(op.labourCost),
      c(op.processCost + op.labourCost),
    ];
  });
  {
    // The operations' labour is costed before Wright's law and the bucket after it — the rows must still add up.
    const opsLab = result.operationDetails.reduce((s, o) => s + o.labourCost, 0);
    const lcA = result.learningCurveApplied;
    if (lcA && Math.abs(result.breakdown.labour - opsLab) >= 0.00005) {
      opRowsB.push([`Learning-curve adjustment (${lcA.curvePct}% curve)`, '', '', '', '', `×${lcA.adjustmentFactor.toFixed(4)}`, c(result.breakdown.labour - opsLab), c(result.breakdown.labour - opsLab)]);
    }
  }
  opRowsB.push(['TOTAL', '', '', '', '', '', c(result.breakdown.labour), c(result.breakdown.process + result.breakdown.labour)]);

  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    head: [['Operation', 'Labour Grade', 'Rate / hr', 'Manning', 'Lab. min', 'Eff %', 'Labour Cost', 'Op Total']],
    body: opRowsB,
    theme: 'plain',
    headStyles: { ...TH.headStyles, fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: SLATE, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 } },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 26 },
      2: { cellWidth: 22, halign: 'right' },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 16, halign: 'right' },
      5: { cellWidth: 14, halign: 'right' },
      6: { cellWidth: 24, halign: 'right' },
      7: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (d) => {
      if (d.section === 'body' && d.row.index === opRowsB.length - 1) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = OR_LT;
        d.cell.styles.textColor = NAVY;
      }
    },
  });
  y = lastFinalY(doc) + 10;

  // ── 4C  Per-feature machining audit (from measured geometry) ──────────────
  // Every detected feature gets a row with its machining time and whether it was
  // COSTED — so an under-count (features detected but not machined) is visible,
  // not silent. This is the audit surface the knuckle case exposed.
  if (cadMeta.featureLines && cadMeta.featureLines.length > 0) {
    y = chk(doc, y, 26);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
    doc.text('4C  Machined Features — Geometry Audit', MG, y); y += 5;
    if (!cadMeta.featureLinesInCost) {
      // Not the costing: list what was measured, with no £ and no "costed" column.
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
      for (const ln of doc.splitTextToSize('Features measured on the model, for audit. They are NOT priced from this table: the '
        + 'costing\'s own operations (§4A / §4B) carry the machining, built from the measured stock, areas and holes.', CW) as string[]) { doc.text(ln, MG, y); y += 3.3; }
      y += 1;
      autoTable(doc, {
        startY: y, margin: { left: MG, right: MG },
        head: [['Feature', 'Ø×depth / area', 'Qty']],
        body: cadMeta.featureLines.map(l => [
          ({ hole: 'Hole / bore', boss: 'Boss', face: 'Face', pocket: 'Pocket', slot: 'Slot' } as Record<string, string>)[l.kind] ?? l.kind,
          (l.kind === 'hole' || l.kind === 'boss')
            ? `Ø${l.diaMm.toFixed(1)} × ${l.depthMm.toFixed(0)}${l.kind === 'hole' ? (l.through ? ' thru' : l.through === false ? ' blind' : '') : ''}`
            : `${Math.round(l.areaMm2 ?? 0)} mm²${l.depthMm > 0 ? ` × ${l.depthMm.toFixed(0)}` : ''}`,
          String(l.count)]),
        theme: 'plain', headStyles: { ...TH.headStyles, fontSize: 7 },
        bodyStyles: { fontSize: 7, textColor: SLATE, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 } },
        alternateRowStyles: { fillColor: LIGHT },
      });
      y = lastFinalY(doc) + 8;
    } else {

    const rate = cadMeta.featureMachineRatePerHr ?? 0;
    const kindLbl: Record<string, string> = { hole: 'Hole / bore', boss: 'Boss', face: 'Face', pocket: 'Pocket', slot: 'Slot' };
    let costedMin = 0, notMin = 0, costedCnt = 0, notCnt = 0;
    const featRows = cadMeta.featureLines.map(l => {
      const dim = (l.kind === 'hole' || l.kind === 'boss')
        ? `Ø${l.diaMm.toFixed(1)} × ${l.depthMm.toFixed(0)}${l.kind === 'hole' ? (l.through ? ' thru' : ' blind') : ''}`
        : `${Math.round(l.areaMm2 ?? 0)} mm²${l.depthMm > 0 ? ` × ${l.depthMm.toFixed(0)}` : ''}`;
      const lineCost = (l.totalMinutes / 60) * rate;
      if (l.included) { costedMin += l.totalMinutes; costedCnt += l.count; } else { notMin += l.totalMinutes; notCnt += l.count; }
      return [
        kindLbl[l.kind] ?? l.kind,
        dim,
        String(l.count),
        l.operation,
        l.totalMinutes.toFixed(2),
        l.included ? c(lineCost) : '—',
        l.included ? 'Yes' : 'No',
      ];
    });
    featRows.push(['TOTAL costed', '', String(costedCnt), '', costedMin.toFixed(2), c((costedMin / 60) * rate), 'Yes']);

    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG },
      head: [['Feature', 'Ø×depth / area', 'Qty', 'Operation', 'Min', 'Cost', 'Costed?']],
      body: featRows,
      theme: 'plain',
      headStyles: { ...TH.headStyles, fontSize: 7 },
      bodyStyles: { fontSize: 7, textColor: SLATE, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 } },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: {
        0: { cellWidth: 26 }, 1: { cellWidth: 34 }, 2: { cellWidth: 12, halign: 'right' },
        3: { cellWidth: 54, fontSize: 6.5, textColor: GREY }, 4: { cellWidth: 18, halign: 'right' },
        5: { cellWidth: 22, halign: 'right' }, 6: { cellWidth: 16, halign: 'center' },
      },
      didParseCell: (d) => {
        if (d.section !== 'body') return;
        const isTotal = d.row.index === featRows.length - 1;
        if (isTotal) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = OR_LT; d.cell.styles.textColor = NAVY; return; }
        if (d.column.index === 6) {
          const v = Array.isArray(d.cell.text) ? d.cell.text[0] : String(d.cell.text);
          if (v === 'No') { d.cell.styles.textColor = RD; d.cell.styles.fontStyle = 'bold'; }
          else { d.cell.styles.textColor = GN; }
        }
      },
    });
    y = lastFinalY(doc) + 4;
    if (notCnt > 0) {
      y = calloutBox(doc, y, `${notCnt} detected feature(s) NOT costed`, [
        `${notCnt} machinable feature instance(s) (${notMin.toFixed(1)} min) were detected in the geometry but are NOT included in this cost — on a near-net part they may be as-cast. If they are machined, tick them in the Machined-Features panel and re-cost; this could add up to ${c((notMin / 60) * rate)}.`,
      ], AM, OR_LT);
    } else {
      y += 4;
    }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // §5 — Machine Rate Buildup
  // ════════════════════════════════════════════════════════════════════════
  doc.addPage(); y = 18;
  y = secBar(doc, y, '§5 — Machine Rate Buildup');

  const usedIds  = new Set(result.operationDetails.map(op => op.machineId));
  const machRows: (string | { content: string; colSpan?: number; styles?: Record<string, unknown> })[][] = [];

  library.machines.filter(m => usedIds.has(m.id)).forEach(mach => {
    const b   = mach.buildup;
    const eff = b.annualAvailableHours * b.machineUtilization;
    const tot = b.annualDepreciation + b.maintenance + b.energy + b.floorSpace + b.indirectSupport + b.financeCost;
    const rh  = (n: number) => c(n / eff);

    machRows.push([{
      content: `${mach.machineClass}  [${mach.id}]  ·  Confidence: ${mach.confidence}  ·  ${mach.sourceNote}`,
      colSpan: 4,
      styles: { fontStyle: 'bold', fillColor: HDR, textColor: NAVY, fontSize: 7.5, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
    } as unknown as string]);

    const subHead = (t: string, align: string = 'left') =>
      ({ content: t, styles: { fontStyle: 'bold', textColor: GREY, halign: align, fontSize: 7, fillColor: WHITE, cellPadding: { top: 2, bottom: 2, left: 4, right: 4 } } } as unknown as string);
    machRows.push([subHead('Cost Component'), subHead(`Annual Cost (${currency})`, 'right'), subHead(`Rate/hr  @${(b.machineUtilization*100).toFixed(0)}% util`, 'right'), subHead('Notes')]);

    const row = (lbl: string, ann: number, notes = '') =>
      [lbl, c(ann), rh(ann), notes];
    machRows.push(row('Depreciation',    b.annualDepreciation, `${b.annualAvailableHours.toLocaleString()} hr/yr available`));
    machRows.push(row('Maintenance',     b.maintenance));
    machRows.push(row('Energy',          b.energy));
    machRows.push(row('Floor Space',     b.floorSpace));
    machRows.push(row('Indirect Support',b.indirectSupport));
    machRows.push(row('Finance Cost',    b.financeCost));
    machRows.push([`TOTAL — ${mach.machineClass}`, c(tot), c(mach.computedRatePerHr), `Effective hours: ${eff.toFixed(0)}/yr`]);
    machRows.push(['', '', '', '']);
  });

  if (machRows.length > 0) {
    // col widths: 54 + 34 + 34 + (182-122) = 54+34+34+60 = 182 ✓
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG },
      body: machRows as string[][],
      theme: 'plain',
      bodyStyles: { fontSize: 8, textColor: SLATE, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 } },
      columnStyles: {
        0: { cellWidth: 54 },
        1: { cellWidth: 34, halign: 'right' },
        2: { cellWidth: 34, halign: 'right' },
        3: { cellWidth: 60, textColor: GREY, fontSize: 7.5 },
      },
      didParseCell: (d) => {
        if (d.section !== 'body') return;
        const t = Array.isArray(d.cell.text) ? d.cell.text[0] : '';
        if (t.startsWith('TOTAL')) {
          d.cell.styles.fontStyle = 'bold';
          d.cell.styles.fillColor = OR_LT;
          d.cell.styles.textColor = NAVY;
        }
      },
    });
    y = lastFinalY(doc) + 6;
    y = calloutBox(doc, y, 'How to read the machine rate', [
      'Rate/hr = (annual depreciation + maintenance + energy + floor + indirect + finance) ÷ effective hours, where effective hours = available hours × utilisation.',
      'Effective hours encode the shift pattern: a lower hours-base raises £/hr and a higher one lowers it. A challenge from a supplier will target this divisor and whether depreciation is machine-only or the full cell (the machine plus its ancillaries) — state your basis when defending the number.',
    ], NAVY, HDR);
  }

  // ════════════════════════════════════════════════════════════════════════
  // §6 — Rate Traceability
  // ════════════════════════════════════════════════════════════════════════
  y = chk(doc, y, 22);
  y = secBar(doc, y, '§6 — Rate Traceability');

  // col widths: 48 + 20 + 12 + 64 + 24 + 14 = 182 ✓
  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    head: [['Field', 'Value', 'Unit', 'Source / Reference (as recorded, GBP)', 'Rate / role', 'Conf.']],
    // £-denominated values in the report's currency, like every other table (they printed GBP under a £/hr unit).
    body: result.traceability.map(t => t.unit.includes('£')
      ? [t.field, (t.value * fxRate).toFixed(4), t.unit.replace('£', sym), t.rateSource, /^lab-/.test(t.rateId ?? '') ? labourRoleLabel(t.rateId) : t.rateId, t.confidence]
      : [t.field, t.value.toFixed(4), t.unit, t.rateSource, /^lab-/.test(t.rateId ?? '') ? labourRoleLabel(t.rateId) : t.rateId, t.confidence]),
    theme: 'plain',
    headStyles: { ...TH.headStyles, fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: SLATE, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 } },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 48 },
      1: { cellWidth: 20, halign: 'right' },
      2: { cellWidth: 12 },
      3: { cellWidth: 64, textColor: GREY, fontSize: 7 },
      4: { cellWidth: 24, fontSize: 7 },
      5: { cellWidth: 14 },
    },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 5) {
        const v = Array.isArray(d.cell.text) ? d.cell.text[0] : String(d.cell.text);
        if (v === 'High')        { d.cell.styles.textColor = GN;   d.cell.styles.fontStyle = 'bold'; }
        else if (v === 'Low')    { d.cell.styles.textColor = RD;   d.cell.styles.fontStyle = 'bold'; }
        else                     { d.cell.styles.textColor = AM; }
      }
    },
  });
  y = lastFinalY(doc) + 10;

  // ════════════════════════════════════════════════════════════════════════
  // §7 — Should-Cost with Uncertainty (Monte-Carlo)
  // ════════════════════════════════════════════════════════════════════════
  doc.addPage(); y = 18;
  {
    // When geometry was NOT measured (text/heuristic fallback), the volume/weight
    // themselves are guesses — so the band must widen beyond what the rate
    // confidences alone imply. Force a Low-plus base CV in that case.
    const geomEstimated = cadMeta.geometrySource === 'text_parsing';
    const u = !geomEstimated && cadMeta.uncertainty ? cadMeta.uncertainty
      : computeCostUncertainty(result, input, geomEstimated ? { baseCvOverride: 0.28 } : {});
    const confShown = geomEstimated ? 'Low' : u.overallConfidence;
    y = secBar(doc, y, '§7 — Should-Cost with Uncertainty', `Monte-Carlo  ·  ${confShown} confidence`);
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG }, theme: 'grid',
      head: [['Estimate (± band)', 'P10 · optimistic', 'P50 · median', 'P90 · conservative', 'Band', 'CV']],
      body: [[`${c(result.total)}  ± ${u.plusMinusPct}%`, c(u.p10), c(u.p50), c(u.p90), String(u.band), `${u.cvPct}%`]],
      headStyles: { fillColor: NAVY as RGB, textColor: WHITE as RGB, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 8.5, cellPadding: 3, halign: 'center' },
      columnStyles: { 0: { fontStyle: 'bold', textColor: NAVY as RGB } },
    });
    y = lastFinalY(doc) + 3;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GREY);
    const basis = cadMeta.uncertaintyBasis ?? 'Monte-Carlo over the cost buckets, each spread by its rate-data confidence (High / Medium / Low)';
    const note = doc.splitTextToSize(`Basis: ${basis}. P10 / P90 are the 10th / 90th percentile of the simulated totals. `
      + (geomEstimated ? 'Measuring the geometry (a STEP or STL) tightens it most. ' : '')
      + 'Confirming the Low-confidence rates or logging an actual purchase price tightens it.', CW);
    doc.text(note, MG, y + 3); y += note.length * 3.6 + 4;

    // Confidence-driver line — WHY the band is what it is (not just the grade).
    const lowRates = result.traceability.filter(t => t.confidence === 'Low').length;
    const drivers: string[] = [];
    if (geomEstimated) drivers.push('geometry weight/volume estimated (not measured)');
    if (lowRates > 0) drivers.push(`${lowRates} rate(s) at Low confidence`);
    if (result.breakdown.tooling > 0.005) drivers.push('tooling amortisation carries the widest per-bucket spread');
    if (!drivers.length) drivers.push('rate-data confidence alone (no estimated geometry, no Low-confidence rate)');
    if (cadMeta.featureLinesInCost && cadMeta.featureLines?.some(l => !l.included)) drivers.push('some detected features not costed (see §4C)');
    y = calloutBox(doc, y, `Why confidence is ${confShown}`, [
      `Main band drivers: ${drivers.join('; ')}.`,
    ], confShown === 'High' ? GN : confShown === 'Medium' ? AM : RD,
       confShown === 'High' ? [237, 247, 237] : confShown === 'Low' ? [252, 236, 236] : OR_LT);
  }

  // ── What's excluded from this unit cost ───────────────────────────────────
  // One consolidated list, so silence never reads as "included". Some items are
  // conditional — heat-treat/NDT only flagged when no such operation is present.
  {
    // Every line here is checked against the costing it sits under — a statement that the costing contradicts is
    // worse than none (the tooling line said "amortised separately, not in this unit cost" beside a tooling bucket).
    const tl = input.tooling;
    const excl: string[] = [
      tl.totalToolingCost > 0
        ? (tl.mode === 'one_time_nre'
          ? `The tooling investment (${c(tl.totalToolingCost)}) is a one-time NRE charged separately — it is NOT in this unit cost.`
          : `The tooling investment itself (${c(tl.totalToolingCost)}) is paid up front; this unit cost carries it amortised over ${Math.round(tl.amortizationVolume).toLocaleString('en-GB')} parts (bucket 4).`)
        : 'No tooling investment is in this costing.',
      'Import duty and international freight (regional table is Ex-Works).',
      'Formal embodied-carbon reporting (figures are indicative cradle-to-gate — replace with supplier EPDs).',
    ];
    if (isCasting) {
      const missing = [!hasHeatTreat && 'heat treat', !hasNdt && 'NDT / X-ray', !hasHip && 'HIP'].filter(Boolean) as string[];
      if (missing.length) excl.push(`Not in this cost: ${missing.join(', ')} — add ${missing.length > 1 ? 'them' : 'it'} if the part's specification calls for ${missing.length > 1 ? 'them' : 'it'}.`);
      excl.push('Trim / degate, shot blast and impregnation are included only where listed as an operation or a consumable line (§3, §4).');
    }
    if (cadMeta.geometrySource === 'text_parsing') excl.push('A measured geometry — this cost used an ESTIMATED weight/volume (see Geometry Provenance).');
    y = calloutBox(doc, y, "What's excluded from this unit cost", excl, GREY, HDR);
  }

  // ════════════════════════════════════════════════════════════════════════
  // §8 — Sensitivity Analysis
  // ════════════════════════════════════════════════════════════════════════
  {
    const sens = runSensitivity(input, library, 10);
    if (sens.drivers.length) {
      y = chk(doc, y, 46);
      y = secBar(doc, y, '§8 — Sensitivity Analysis', `± ${sens.variationPct}% driver swing  ·  ranked by ${sym} impact`);
      const r1 = (n: number) => Math.round(n * 10) / 10;
      const r2v = (n: number) => Math.round(n * 100) / 100;
      autoTable(doc, {
        startY: y, margin: { left: MG, right: MG }, theme: 'grid',
        head: [['Cost Driver', 'Base', `-${sens.variationPct}% cost`, `+${sens.variationPct}% cost`, `Range ${sym}`]],
        body: sens.drivers.slice(0, 8).map(d => {
          // Monetary drivers carry a '£' in their unit (e.g. "£/kg", "£/hr") and a
          // GBP-denominated baseValue. Convert those to the display currency + symbol;
          // non-money drivers (%, hr, parts) stay as-is. (The header/Range use `sym`.)
          const money = d.unit.includes('£');
          const base = money ? `${c(d.baseValue)}${d.unit.replace('£', '')}` : `${r2v(d.baseValue)}${d.unit}`;
          return [d.driver, base,
            `${d.minusPct > 0 ? '+' : ''}${r1(d.minusPct)}%`, `${d.plusPct > 0 ? '+' : ''}${r1(d.plusPct)}%`, c(d.range)];
        }),
        headStyles: { fillColor: NAVY as RGB, textColor: WHITE as RGB, fontStyle: 'bold', fontSize: 7.5 },
        bodyStyles: { fontSize: 8, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: LIGHT as RGB },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } },
      });
      y = lastFinalY(doc) + 8;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // §9 — Regional Cost Comparison (Ex-Works)
  // ════════════════════════════════════════════════════════════════════════
  {
    // Re-base to the region the part was costed in, so the source-region row
    // equals the headline should-cost (not a UK breakdown scaled the wrong way).
    // Aluminium extrusion: the billet's own regional prices, by the alloy in the material id.
    const alAlloy = commodityType === 'aluminium_extrusion'
      ? AL_ALLOY_LIST.find(a => `mat-al-billet-${a.toLowerCase()}` === input.rawMaterial.materialId) : undefined;
    const rc = regionalRows?.length ? regionalRows
      : baseLibrary
      ? computeRegionalComparisonExact(input, baseLibrary, { landed: false, sourceRegion: region as ManufacturingRegion, sourceResult: result })
      : computeRegionalComparison(result.breakdown, { landed: false, sourceRegion: region as ManufacturingRegion,
        ...(alAlloy ? { materialFactorByRegion: alBilletMaterialFactors(alAlloy) } : {}) });
    const cheapest = Math.min(...rc.map(r => r.total));
    const baseName = rc.find(r => r.isBase)?.name ?? 'base';
    doc.addPage(); y = 18;
    y = secBar(doc, y, '§9 — Regional Cost Comparison', `Ex-Works  ·  per-region should-cost  ·  vs ${baseName}`);
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG }, theme: 'grid',
      // Every column the total is made of, so a row adds up (it hid packaging and margin), and no local-currency tag over
      // figures that are all in the report's currency ("India (INR)" sat over £; uploaded-parts review, Oct 2026).
      head: [['Region', 'Material', 'Process', 'Labour', 'Tooling', 'Overhead', 'Packaging', 'Logistics', 'Margin', 'Total', `vs ${baseName}`]],
      body: rc.map(r => [
        r.name, c(r.material), c(r.process), c(r.labour), c(r.tooling), c(r.overhead), c(r.packaging), c(r.logistics), c(r.margin), c(r.total),
        r.isBase ? 'Base' : `${r.vsBasePct >= 0 ? '-' : '+'}${Math.abs(r.vsBasePct).toFixed(0)}%`,
      ]),
      headStyles: { fillColor: NAVY as RGB, textColor: WHITE as RGB, fontStyle: 'bold', fontSize: 6.5 },
      bodyStyles: { fontSize: 6.9, cellPadding: 1.8 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 24 }, 9: { fontStyle: 'bold' }, 10: { halign: 'center', fontStyle: 'bold' } },
      didParseCell: (d: { section: string; row: { index: number }; column: { index: number }; cell: { styles: { fillColor?: unknown; textColor?: unknown } } }) => {
        if (d.section !== 'body') return;
        const row = rc[d.row.index];
        if (row.isBase) d.cell.styles.fillColor = HDR as RGB;
        if (d.column.index === 9 && Math.abs(row.total - cheapest) < 0.005) { d.cell.styles.fillColor = [220, 252, 231] as RGB; d.cell.styles.textColor = GN as RGB; }
        if (d.column.index === 10 && !row.isBase) d.cell.styles.textColor = (row.vsBasePct >= 0 ? GN : RD) as RGB;
      },
    });
    y = lastFinalY(doc) + 3;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GREY);
    doc.text((regionalRows?.length || baseLibrary
      ? 'Each row is the part re-costed with that country\'s labour, machine, energy and material rates; tooling scaled by its toolroom rate; overhead, packaging and logistics by its shop factors.'
      : 'Each row scales this costing\'s buckets by that country\'s rate factors (no rate book was available to re-cost it).')
      + ' Ex-works — excludes import duty and international freight. Indicative — confirm with an RFQ.', MG, y + 3, { maxWidth: CW });
    y += 12;
  }

  // ════════════════════════════════════════════════════════════════════════
  // §10 — Embodied Carbon
  // ════════════════════════════════════════════════════════════════════════
  {
    const cb = computeCarbon({ result, input, library, commodity: commodityType, region });
    // A part costed with no material weight (a supplied price, bought-in cells, a board) has no mass to put a factor on:
    // "0.00 kgCO2e" read as a result (uploaded-parts review, Oct 2026).
    if (input.rawMaterial.netWeightKg > 0) {
    y = chk(doc, y, 42);
    y = secBar(doc, y, '§10 — Embodied Carbon', `${cb.totalKgCO2e.toFixed(2)} kgCO2e  ·  ${cb.perNetKgCO2e.toFixed(2)} kgCO2e/kg  ·  cradle-to-gate`);
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG }, theme: 'plain',
      body: [
        ['Material', `${cb.materialKgCO2e.toFixed(2)} kgCO2e`, 'Material factor', `${cb.materialFactorKgPerKg.toFixed(2)} kg/kg (${cb.materialClass})`],
        ['Process', `${cb.processKgCO2e.toFixed(2)} kgCO2e`, 'Grid intensity', `${cb.gridKgPerKwh.toFixed(3)} kg/kWh · ${cb.processKwh.toFixed(2)} kWh`],
        ['Logistics', `${cb.logisticsKgCO2e.toFixed(2)} kgCO2e`, 'Total', `${cb.totalKgCO2e.toFixed(2)} kgCO2e`],
      ],
      bodyStyles: { fontSize: 8, cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 } },
      alternateRowStyles: { fillColor: LIGHT as RGB },
      columnStyles: { 0: { cellWidth: 44, textColor: GREY as RGB }, 1: { cellWidth: 50, fontStyle: 'bold', textColor: NAVY as RGB }, 2: { cellWidth: 44, textColor: GREY as RGB }, 3: { cellWidth: 44, fontStyle: 'bold', textColor: NAVY as RGB } },
    });
    y = lastFinalY(doc) + 3;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GREY);
    doc.text('Indicative cradle-to-gate: representative material factors and a per-commodity process energy intensity (kWh per kg) '
      + '— not the costing\'s own energy line, and not sourced per material. Replace with supplier EPDs for formal reporting.', MG, y + 3, { maxWidth: CW });
    y += 12;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // §11 — Cost Intelligence Insights
  // ════════════════════════════════════════════════════════════════════════
  // What the suggestion layer may know about this costing, so it stops
  // critiquing the tool's own region and volume assumptions.
  // The SAME context the screen's tabs use (main.ts uiSuggestionContext): with the library every lever with a driver
  // transform is re-costed through the stack; without it the PDF could never show a re-costed £ and listed levers the
  // screen drops (uploaded-parts review, Oct 2026).
  const suggestionCtx = {
    region: String(region),
    volumeProvided: cadMeta?.volumeProvided ?? !!(cadMeta?.annualVolume ?? (input as { annualVolume?: number }).annualVolume),
    pkgLogisticsEstimated: !!cadMeta?.pkgLogisticsEstimated,
    library,
  };
  const insights = generateInsights(result, input, library, commodityType, suggestionCtx);
  if (insights.length > 0) {
    doc.addPage(); y = 18;
    y = secBar(doc, y, '§11 — Cost Intelligence Insights', `${insights.length} observation${insights.length === 1 ? '' : 's'}  ·  prompts to look, no saving claimed`);

    const impCol = (imp: string): RGB => imp === 'High' ? RD : imp === 'Medium' ? AM : GREY;
    const typeLabel: Record<string, string> = {
      critical: 'CRITICAL', warning: 'WARNING', opportunity: 'OPPORTUNITY',
      benchmark: 'BENCHMARK', info: 'INFO',
    };

    const insRows: (string | object)[][] = [];
    insights.slice(0, 6).forEach(ins => {
      insRows.push([{
        content: `[${typeLabel[ins.type] ?? ins.type.toUpperCase()}]  ${ins.title}`,
        colSpan: 2,
        styles: {
          fontStyle: 'bold', fillColor: HDR as RGB,
          textColor: impCol(ins.impact), fontSize: 8,
          cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
        },
      }]);
      insRows.push(['Finding', ins.finding]);
      insRows.push(['Impact', ins.impact]);
      if (ins.benchmark) {
        insRows.push(['Reference', `${ins.benchmark.label}: yours ${ins.benchmark.yourValue.toFixed(1)}${ins.benchmark.unit} vs reference band ${ins.benchmark.industryLow}–${ins.benchmark.industryHigh}${ins.benchmark.unit} (engineering estimate, not a sourced survey)`]);
      }
      ins.actions.slice(0, 2).forEach((act, i) => insRows.push([`Action ${i + 1}`, act]));
      insRows.push(['', '']);
    });

    // col widths: 26 + (182-26) = 26+156 = 182 ✓
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG },
      body: insRows as string[][],
      theme: 'plain',
      bodyStyles: { fontSize: 7.5, textColor: SLATE, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 } },
      columnStyles: {
        0: { cellWidth: 26, textColor: GREY, fontStyle: 'bold', fontSize: 7 },
        1: { cellWidth: 156 },
      },
    });
    y = lastFinalY(doc) + 8;
  }

  // ════════════════════════════════════════════════════════════════════════
  // §8 + §9 — DFM / DFA, §10 — Optimisation, §11 — Roadmap
  // ════════════════════════════════════════════════════════════════════════
  try {
    const dfm = generateDFMDFA(result, input, commodityType, suggestionCtx);

    // The engine grades findings internally (critical/major/minor, score /10).
    // The REPORT does not: a score reads as a verdict on whoever designed the
    // part, and cost-reduction work that starts with a grade gets defended
    // against rather than actioned. Sections §12–§14 present the identical
    // deterministic findings ranked by money per part, grouped by category.
    const ranked = rankOpportunities(dfm, result.total);

    // §12 — the ranked list
    y = chk(doc, y, 22);
    y = secBar(doc, y, '§12 — Cost-Reduction Opportunities',
      ranked.pricedCount
        ? `${ranked.pricedCount} of ${ranked.all.length} re-costed  ·  largest ${c(ranked.headlineSavingPerPart)}/part`
        : `${ranked.all.length} checks  ·  none re-costed, no £ claimed`);

    doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...GREY);
    {
      const note = 'Only a lever re-costed through the rate library carries a £; the rest are rules of thumb from the cost shares, listed as checks with no figure. Levers overlap, so the column is not summed.';
      const ls = doc.splitTextToSize(note, CW) as string[];
      doc.text(ls, MG, y); y += ls.length * 4.2 + 5;
    }

    if (ranked.all.length > 0) {
      // col widths: 9 + 22 + 34 + 55 + 16 + 11 + 21 + 14 = 182 ✓
      let rankNo = 0;
      const rows = ranked.groups.flatMap(g => g.opportunities.map(o => [
        String(++rankNo), g.label, o.action, o.basis,
        o.priced ? `${c(o.savingPerPart)}` : 'not priced', o.priced ? `${o.savingPct.toFixed(1)}%` : '—', o.timeframe, o.risk,
      ]));
      const flat = ranked.groups.flatMap(g => g.opportunities);
      autoTable(doc, {
        startY: y, margin: { left: MG, right: MG },
        head: [['#', 'Category', 'Action', 'Why it is on the list', `Save/part`, '%', 'Timeframe', 'Risk']],
        body: rows,
        theme: 'plain',
        headStyles: { ...TH.headStyles, fontSize: 7 },
        bodyStyles: { fontSize: 7, textColor: SLATE, cellPadding: 2.5, overflow: 'linebreak' },
        alternateRowStyles: { fillColor: LIGHT },
        columnStyles: {
          0: { cellWidth: 9, halign: 'right', textColor: GREY },
          1: { cellWidth: 22, textColor: GREY },
          2: { cellWidth: 34, fontStyle: 'bold' },
          3: { cellWidth: 55, textColor: GREY },
          4: { cellWidth: 16, halign: 'right', fontStyle: 'bold' },
          5: { cellWidth: 11, halign: 'right' },
          6: { cellWidth: 21 },
          7: { cellWidth: 14 },
        },
        didParseCell: (d) => {
          if (d.section !== 'body') return;
          const o = flat[d.row.index];
          if (!o) return;
          if (d.column.index === 4) d.cell.styles.textColor = GN;
          if (d.column.index === 6) {
            d.cell.styles.textColor = o.timeframe === 'Quick Win' ? GN : o.timeframe === 'Medium Term' ? AM : GREY;
          }
          if (d.column.index === 7) {
            d.cell.styles.textColor = o.risk === 'High' ? RD : o.risk === 'Medium' ? AM : GN;
          }
        },
      });
      y = lastFinalY(doc) + 8;
    } else {
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GN);
      doc.text('No cost-reduction opportunities were triggered by this costing.', MG, y); y += 10;
    }

    // §13 — where the opportunity sits, by category
    if (ranked.groups.length > 0) {
      y = chk(doc, y, 22);
      y = secBar(doc, y, '§13 — Opportunity by Category',
        `${ranked.groups.length} categories with an actionable lever`);

      autoTable(doc, {
        startY: y, margin: { left: MG, right: MG },
        // No category total: levers overlap, and a sum of them is not a saving anyone can bank.
        head: [['Category', 'Opportunities', 'First action', 'Best re-costed save/part', 'Re-costed']],
        body: ranked.groups.map(g => [
          g.label, String(g.opportunities.length), g.opportunities[0].action,
          g.topSavingPerPart > 0 ? c(g.topSavingPerPart) : 'not priced', String(g.opportunities.filter(o => o.priced).length),
        ]),
        theme: 'plain',
        headStyles: { ...TH.headStyles, fontSize: 7 },
        bodyStyles: { fontSize: 7.5, textColor: SLATE, cellPadding: 2.5, overflow: 'linebreak' },
        alternateRowStyles: { fillColor: LIGHT },
        columnStyles: {
          0: { cellWidth: 38, fontStyle: 'bold' },
          1: { cellWidth: 22, halign: 'right' },
          2: { cellWidth: 66, textColor: GREY },
          3: { cellWidth: 26, halign: 'right', fontStyle: 'bold', textColor: GN },
          4: { cellWidth: 30, halign: 'right', textColor: GREY },
        },
      });
      y = lastFinalY(doc) + 8;
    }

    // §14 — inputs to confirm (no saving claimed against any of these)
    if (ranked.verificationChecks.length > 0) {
      y = chk(doc, y, 22);
      y = secBar(doc, y, '§14 — Inputs to Confirm', 'No saving is claimed against these');

      autoTable(doc, {
        startY: y, margin: { left: MG, right: MG },
        head: [['Item', 'What the costing assumed', 'How to close it']],
        body: ranked.verificationChecks.map(v => [v.title, v.detail, v.action]),
        theme: 'plain',
        headStyles: { ...TH.headStyles, fontSize: 7 },
        bodyStyles: { fontSize: 7, textColor: SLATE, cellPadding: 2.5, overflow: 'linebreak' },
        alternateRowStyles: { fillColor: LIGHT },
        columnStyles: {
          0: { cellWidth: 44, fontStyle: 'bold' },
          1: { cellWidth: 74, textColor: GREY },
          2: { cellWidth: 64 },
        },
      });
      y = lastFinalY(doc) + 8;
    } else {
      // keep the numbering whole (casting 360 X32: §13 ran straight into §15)
      y = chk(doc, y, 14);
      y = secBar(doc, y, '§14 — Inputs to Confirm', 'None: every input this costing flags is listed in the checks above');
      y += 2;
    }

    // §15 Roadmap
    if (dfm.quickWins.length > 0 || dfm.longTermChanges.length > 0) {
      y = chk(doc, y, 22);
      y = secBar(doc, y, '§15 — Implementation Roadmap');

      if (dfm.quickWins.length > 0) {
        doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...GN);
        doc.text('Quick Wins — Implement Immediately', MG, y); y += 6;
        dfm.quickWins.forEach(w => {
          y = chk(doc, y, 8);
          const ls = doc.splitTextToSize(`•  ${w}`, CW - 8) as string[];
          doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
          doc.text(ls, MG + 6, y); y += ls.length * 4.5;
        });
        y += 4;
      }
      if (dfm.longTermChanges.length > 0) {
        y = chk(doc, y, 16);
        doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...GREY);
        doc.text('Long-Term Changes — Strategic Investment', MG, y); y += 6;
        dfm.longTermChanges.forEach(w => {
          y = chk(doc, y, 8);
          const ls = doc.splitTextToSize(`•  ${w}`, CW - 8) as string[];
          doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
          doc.text(ls, MG + 6, y); y += ls.length * 4.5;
        });
      }
    }
  } catch {
    // DFM/DFA not available for this commodity — silently skip
  }

  // ════════════════════════════════════════════════════════════════════════
  // §16 — Saved Scenarios (only when the user has saved any)
  // ════════════════════════════════════════════════════════════════════════
  if (scenarios.length > 0) {
    y = chk(doc, y, 40);
    y = secBar(doc, y, '§16 — Saved Scenarios', `${scenarios.length} scenario${scenarios.length === 1 ? '' : 's'}  ·  vs this costing`);
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG }, theme: 'grid',
      head: [['Scenario', 'Country', 'Total', 'vs this costing', 'Saved']],
      body: scenarios.map(s => {
        const delta = result.total > 0 ? ((s.result.total - result.total) / result.total) * 100 : 0;
        return [
          s.name + (s.description ? ` — ${s.description}` : ''), s.region ?? 'UK', c(s.result.total),
          Math.abs(delta) < 0.05 ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`,
          new Date(s.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        ];
      }),
      headStyles: { fillColor: NAVY as RGB, textColor: WHITE as RGB, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 8, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: LIGHT as RGB },
      columnStyles: { 0: { fontStyle: 'bold' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' }, 4: { halign: 'right', textColor: GREY as RGB } },
    });
  }

  return y;
}

/**
 * Report body for a populated board costed from the PCB photo analysis (pcba-report-data.ts).
 * Every figure is the analysis's (server Stage 4); this only lays it out. Sections that mean
 * nothing on a bought-in board — material weight, operations, machine rates, a regional table
 * that rescales a pass-through, embodied carbon at 0 kg, metal indexation — are not printed.
 */
function renderPcbaSections(
  doc: jsPDF, y: number, rep: PcbaReport, c: (n: number) => string, cadMeta: CADReportMeta,
  scenarios: Scenario[], total: number,
): number {
  const pct = (n: number) => `${n.toFixed(1)}%`;
  const para = (text: string, size = 7.5, colour: RGB = GREY) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(...colour);
    for (const ln of doc.splitTextToSize(winAnsiSafe(text), CW) as string[]) { y = chk(doc, y, 4); doc.text(ln, MG, y); y += 3.6; }
  };

  // §1 — Cost breakdown: the analysis's own stack, rows summing to the headline.
  y = chk(doc, y, 90);
  y = secBar(doc, y, '§1 — Cost Breakdown per Board', `${rep.country}  ·  delivered UK, duty paid`);
  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    head: [['Element', `Amount`, '% of total', 'Basis']],
    body: rep.stack.map(s => [s.label, s.amount > 0 && s.amount < 0.005 ? `<${c(0.01)}` : c(s.amount), pct(s.amount / rep.total * 100), s.basis]),
    theme: 'plain',
    headStyles: { ...TH.headStyles },
    bodyStyles: { ...TH.bodyStyles, fontSize: 7.6 },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 52, fontStyle: 'bold', textColor: NAVY },
      1: { cellWidth: 22, halign: 'right' },
      2: { cellWidth: 20, halign: 'right', textColor: GREY },
      3: { cellWidth: 88, textColor: GREY, fontSize: 7 },
    },
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      const k = rep.stack[d.row.index]?.kind;
      if (k === 'total') {
        d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = OR_LT; d.cell.styles.textColor = NAVY; d.cell.styles.fontSize = 8.5;
      } else if (k === 'sub') {
        d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = HDR; d.cell.styles.textColor = NAVY;
      }
    },
  });
  y = lastFinalY(doc) + 4;
  para('Components, bare board and assembly are supplier prices: the fabricator\'s and the EMS\'s overhead and margin are inside them, so no further overhead or margin is added.');
  y += 4;

  // §2 — Basis, confidence and functional safety.
  y = chk(doc, y, 40);
  y = secBar(doc, y, '§2 — Basis & Confidence');
  const basisRows: string[][] = [
    ['Build country', rep.country, 'Annual volume', rep.annualVolume ? `${rep.annualVolume.toLocaleString('en-GB')} boards` : '—'],
    ['Delivery', 'UK, import duty paid', 'Board type', rep.domainLabel],
    ['Parts list from', rep.bomOrigin, 'Lines · parts', `${rep.bom.length} lines · ${rep.bomPieces} parts`],
  ];
  if (rep.confidence) basisRows.push(
    ['Estimate confidence', rep.confidence.label, 'Likely range', `${c(rep.confidence.low)} – ${c(rep.confidence.high)}`],
    ['Lines to verify', `${rep.confidence.verifyCount} (${c(rep.confidence.verifyValue)})`, 'Meaning', `${c(1)}+ lines with no distributor price`],
  );
  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG }, body: basisRows, theme: 'plain',
    bodyStyles: { fontSize: 8, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: { 0: { cellWidth: 40, textColor: GREY }, 1: { cellWidth: 51, fontStyle: 'bold', textColor: NAVY }, 2: { cellWidth: 36, textColor: GREY }, 3: { cellWidth: 55, fontStyle: 'bold', textColor: NAVY } },
  });
  y = lastFinalY(doc) + 6;
  if (rep.safety) {
    const sf = rep.safety;
    const lines = [
      `Costed as ${sf.costed}${sf.claimed ? ` (the photo classifier said ${sf.claimed})` : ''}; quality grade ${sf.qualityGrade}. An ASIL comes from the hazard analysis (HARA), not from a photograph — confirm it against the safety concept.`,
      ...sf.notes,
      ...(sf.rationale ? [`Classifier's reading: ${sf.rationale}`] : []),
      ...(sf.functions.length ? [`Safety functions suggested by the photo classifier (unverified): ${sf.functions.join('; ')}`] : []),
    ];
    y = calloutBox(doc, y, 'Functional Safety (ISO 26262)', lines, NAVY, HDR);
  }

  const big = (n: number) => c(n).replace(/\d{4,}(?=\.\d\d)/, m => Number(m).toLocaleString('en-GB'));
  // §3 — Bill of materials, each line with what priced it.
  y = chk(doc, y, 60);
  y = secBar(doc, y, '§3 — Bill of Materials', `${rep.bom.length} lines  ·  ${rep.bomPieces} parts  ·  ${c(rep.bomTotal)}`);
  // A designator column only when the parts list has designators (a category column is not one).
  const withRef = rep.bom.some(l => l.ref);
  const SRC = withRef ? 7 : 6;
  const body = rep.bom.map((l, i) => [
    String(i + 1), ...(withRef ? [l.ref || '—'] : []), l.description + (l.partNumber ? `\n${l.partNumber}` : ''), l.pkg, String(l.qty), c(l.unit), c(l.ext), l.source + (l.verify ? ' *' : ''),
  ]);
  body.push(['', ...(withRef ? [''] : []), 'COMPONENTS TOTAL', '', String(rep.bomPieces), '', c(rep.bomTotal), '']);
  const cols: Array<{ cellWidth: number; [k: string]: unknown }> = [
    { cellWidth: 8, textColor: GREY, halign: 'right' },
    ...(withRef ? [{ cellWidth: 18, fontStyle: 'bold' }] : []),
    { cellWidth: withRef ? 56 : 74 },
    { cellWidth: 22, textColor: GREY },
    { cellWidth: 12, halign: 'right' },
    { cellWidth: 17, halign: 'right' },
    { cellWidth: 17, halign: 'right', fontStyle: 'bold' },
    { cellWidth: 32, textColor: GREY, fontSize: 6.4 },
  ];
  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    head: [['#', ...(withRef ? ['RefDes'] : []), 'Description / part number', 'Package', 'Qty', 'Unit', 'Ext', 'Priced from']],
    body, theme: 'plain', rowPageBreak: 'avoid',   // a line and its part number stay on one page
    headStyles: { ...TH.headStyles, fontSize: 7, cellPadding: { top: 3, bottom: 3, left: 2, right: 2 } },
    bodyStyles: { ...TH.bodyStyles, fontSize: 6.8, cellPadding: { top: 2.2, bottom: 2.2, left: 2, right: 2 } },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: Object.fromEntries(cols.map((cs, i) => [i, cs])) as never,
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      if (d.row.index === body.length - 1) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = OR_LT; d.cell.styles.textColor = NAVY; }
      else if (d.column.index === SRC && rep.bom[d.row.index]?.verify) d.cell.styles.textColor = AM;
    },
  });
  y = lastFinalY(doc) + 4;
  para(rep.bomReconciliation);
  para(rep.sourceKey, 6.8);
  y += 4;

  // §4 — Bare board & assembly.
  y = chk(doc, y, 50);
  y = secBar(doc, y, '§4 — Board & Assembly');
  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG }, body: rep.boardRows.map(([k, v]) => [k, v]), theme: 'plain',
    bodyStyles: { fontSize: 7.8, cellPadding: { top: 2.6, bottom: 2.6, left: 4, right: 4 } },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: { 0: { cellWidth: 52, textColor: GREY }, 1: { cellWidth: 130, textColor: NAVY } },
  });
  y = lastFinalY(doc) + 8;

  // §5 — Country comparison: the board costed in each country, delivered UK.
  if (rep.countries.length > 1) {
    y = chk(doc, y, 24 + rep.countries.length * 7.6);   // keep the table on one page (a lone row spilled over)
    y = secBar(doc, y, '§5 — Build-Country Comparison', 'each row: this board built there — ex-works, and delivered UK duty paid');
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG },
      head: [['Country', 'Components', 'Bare board', 'Assembly', 'Other', 'Ex-works', 'Freight + duty', 'Delivered', `vs ${rep.country.split(' (')[0]}`, 'Lead']],
      body: rep.countries.map(r => [r.name, c(r.components), c(r.fab), c(r.assembly), c(r.other), c(r.exWorks), r.logistics > 0 && r.logistics < 0.005 ? `<${c(0.01)}` : c(r.logistics), c(r.total),
        r.selected ? 'costed' : `${r.delta >= 0 ? '+' : '-'}${c(Math.abs(r.delta))}`, r.leadWeeks ? `${r.leadWeeks} wk` : '—']),
      theme: 'plain',
      headStyles: { ...TH.headStyles, fontSize: 6.8, cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 } },
      bodyStyles: { ...TH.bodyStyles, fontSize: 7, cellPadding: { top: 2.2, bottom: 2.2, left: 2, right: 2 } },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: {
        0: { cellWidth: 27, fontStyle: 'bold' }, 1: { cellWidth: 20, halign: 'right' }, 2: { cellWidth: 17, halign: 'right' }, 3: { cellWidth: 17, halign: 'right' },
        4: { cellWidth: 13, halign: 'right' }, 5: { cellWidth: 18, halign: 'right', fontStyle: 'bold' }, 6: { cellWidth: 17, halign: 'right' },
        7: { cellWidth: 18, halign: 'right', fontStyle: 'bold' }, 8: { cellWidth: 20, halign: 'right' }, 9: { cellWidth: 15, halign: 'right', textColor: GREY },
      },
      didParseCell: (d) => {
        if (d.section !== 'body') return;
        const row = rep.countries[d.row.index];
        if (row?.selected) { d.cell.styles.fillColor = OR_LT; d.cell.styles.textColor = NAVY; d.cell.styles.fontStyle = 'bold'; }
        else if (d.column.index === 8) d.cell.styles.textColor = (row?.delta ?? 0) < 0 ? GN : RD;
      },
    });
    y = lastFinalY(doc) + 4;
    para('"Other" is energy, ESD packaging and cost of quality (rework and scrap at the country\'s defect rate). Components follow each country\'s sourcing index; labour, energy and duty are each country\'s own.', 6.8);
    y += 4;
  }

  // §6 — One-time costs.
  if (rep.nre.length) {
    y = chk(doc, y, 34);
    y = secBar(doc, y, '§6 — One-Time Automotive NRE', `${big(rep.nreTotal)}  ·  not in the unit cost`);
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG },
      body: [...rep.nre.map(([k, v]) => [k, big(v), annualPer(v)]), ['Total NRE', big(rep.nreTotal), annualPer(rep.nreTotal)]],
      head: [['Item', 'One-time', rep.annualVolume ? `Per board over one year (${rep.annualVolume.toLocaleString('en-GB')})` : 'Per board']],
      theme: 'plain', headStyles: { ...TH.headStyles }, bodyStyles: { ...TH.bodyStyles }, alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 0: { cellWidth: 82 }, 1: { cellWidth: 40, halign: 'right', fontStyle: 'bold' }, 2: { cellWidth: 60, halign: 'right', textColor: GREY } },
      didParseCell: (d) => { if (d.section === 'body' && d.row.index === rep.nre.length) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = OR_LT; d.cell.styles.textColor = NAVY; } },
    });
    y = lastFinalY(doc) + 8;
  }
  function annualPer(v: number): string { return rep.annualVolume ? c(v / rep.annualVolume) : '—'; }

  // §7 — Where the cost sits and what to check.
  y = chk(doc, y, 70);   // the heading never sits alone at the foot of a page
  y = secBar(doc, y, `§${rep.nre.length ? 7 : 6} — Cost Drivers & Next Steps`);
  y = calloutBox(doc, y, 'What drives this board\'s cost', rep.drivers, NAVY, HDR);
  y = calloutBox(doc, y, 'Not in this unit cost', rep.excluded, AM, OR_LT);
  if (rep.warnings.length) y = calloutBox(doc, y, `Analysis checks (${rep.warnings.length})`, rep.warnings, AM, [254, 249, 231]);
  if (rep.limitations.length) y = calloutBox(doc, y, 'Limitations stated by the photo reader', rep.limitations, SLATE, LIGHT);

  // Scenarios the engineer saved (each in its own country book).
  if (scenarios.length > 0) {
    y = chk(doc, y, 40);
    y = secBar(doc, y, 'Saved Scenarios', `${scenarios.length} scenario${scenarios.length === 1 ? '' : 's'}  ·  vs this costing`);
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG }, theme: 'grid',
      head: [['Scenario', 'Country', 'Total', 'vs this costing']],
      body: scenarios.map(s => {
        const delta = total > 0 ? ((s.result.total - total) / total) * 100 : 0;
        return [s.name + (s.description ? ` — ${s.description}` : ''), s.region ?? 'UK', c(s.result.total), Math.abs(delta) < 0.05 ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`];
      }),
      headStyles: { fillColor: NAVY as RGB, textColor: WHITE as RGB, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 8, cellPadding: 2.5 }, alternateRowStyles: { fillColor: LIGHT as RGB },
    });
    y = lastFinalY(doc) + 6;
  }

  // The photographs are the evidence for every line not on a supplied parts list — last, as an appendix.
  if ((cadMeta.photos ?? []).length) {
    doc.addPage(); y = 18;
    y = renderSourcePhotographs(doc, y, cadMeta.photos ?? [], rep.bomOrigin === 'photos'
      ? 'The parts list was read from these photographs: every line identified by a package marking traces to one of them; lines priced from a range could not be identified from any of them.'
      : `The parts list came from the ${rep.bomOrigin} supplied with the analysis; the photographs gave the board's size, layer and assembly reading and any package the list left open.`);
  }
  return y;
}

export function printPDF(
  result: PartCostResult,
  input:  UniversalStackInput,
  library: RateLibrary,
  currency = 'GBP',
  fxRate   = 1,
  commodityType: CommodityType = 'machining',
  partPhotoDataUrl?: string | null,
  region: ManufacturingRegion = 'UK',
  scenarios: Scenario[] = [],
  cadMeta: CADReportMeta = {},
  /** The UK-basis book the country was rebuilt from — the comparison re-costs the part in each country. */
  baseLibrary?: RateLibrary,
  /** The screen's comparison rows — printed as they are, so the report and the screen agree. */
  regionalRows?: RegionalComparisonRow[],
): void {

  const sym  = currencySymbol(currency);
  const pct  = (n: number) => `${n.toFixed(1)}%`;
  const money = (n: number) => `${sym}${(n * fxRate).toFixed(2)}`;
  const pcts = breakdownPercentages(result);
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const doc = hardenPdfText(new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }));
  // A populated board costed from the PCB photo analysis gets its own body (pcba-report-data.ts).
  let pcba: PcbaReport | null = null;
  if (cadMeta.pcbAnalysis) {
    try { pcba = buildPcbaReport(cadMeta.pcbAnalysis, { partName: result.partName, annualVolume: cadMeta.annualVolume, qualityGrade: cadMeta.functionalSafety?.qualityGrade, fmt: money }); }
    catch (err) { console.warn('[pdf] PCBA report body unavailable:', err instanceof Error ? err.message : String(err)); }
  }

  // ── Footer (added last) ──────────────────────────────────────────────────
  const addFooters = () => {
    const total = pageCount(doc);
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(...ORANGE); doc.setLineWidth(0.4);
      doc.line(MG, 285, W - MG, 285);
      const lw = drawCostVisionLogo(doc, MG, 287, 4);
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY);
      doc.text('Should-Cost Analysis Report  ·  CONFIDENTIAL', MG + lw + 3, 291);
      doc.text(`${dateStr}  ${timeStr}`, W / 2, 291, { align: 'center' });
      doc.text(`Page ${i} of ${total}`, W - MG, 291, { align: 'right' });
    }
  };

  // ════════════════════════════════════════════════════════════════════════
  // COVER PAGE
  // ════════════════════════════════════════════════════════════════════════

  // Hero banner
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 68, 'F');
  // Orange left stripe
  doc.setFillColor(...ORANGE);
  doc.rect(0, 0, 7, 68, 'F');

  // Logo box
  doc.setFillColor(...WHITE);
  doc.roundedRect(MG + 5, 10, 24, 15, 2, 2, 'F');
  doc.setTextColor(...NAVY); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('CV', MG + 17, 20, { align: 'center' });

  // Brand name
  doc.setTextColor(...WHITE); doc.setFontSize(20); doc.setFont('helvetica', 'bold');
  doc.text('CostVision', MG + 35, 20);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(185, 200, 230);
  doc.text('Manufacturing Should-Cost Intelligence Platform', MG + 35, 27);

  // Report badge
  doc.setFillColor(...ORANGE);
  doc.roundedRect(MG + 35, 32, 62, 7, 1.5, 1.5, 'F');
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE);
  doc.text('SHOULD-COST ANALYSIS REPORT', MG + 66, 37, { align: 'center' });

  // Date + tag line
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(200, 215, 240);
  doc.text(`Generated: ${dateStr}  ·  ${timeStr}`, MG + 35, 46);
  doc.text('Bottom-Up Manufacturing Cost Model  ·  Fully Traceable Rate Data', MG + 35, 52);

  // ── Part summary card ────────────────────────────────────────────────────
  let y = 76;
  doc.setFillColor(245, 247, 252);
  doc.roundedRect(MG, y, CW, 34, 2.5, 2.5, 'F');
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.25);
  doc.roundedRect(MG, y, CW, 34, 2.5, 2.5, 'S');
  // Top accent line
  doc.setFillColor(...ORANGE);
  doc.roundedRect(MG, y, CW, 2.5, 1, 1, 'F');

  doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  // Shrink-to-fit then ellipsis so long part names never overflow the summary card.
  const nameMaxW = CW - 12;
  let nameSize = 13;
  doc.setFontSize(nameSize);
  while (doc.getTextWidth(pcba?.partName ?? result.partName) > nameMaxW && nameSize > 9) { nameSize -= 0.5; doc.setFontSize(nameSize); }
  let partName = pcba?.partName ?? result.partName;
  if (doc.getTextWidth(partName) > nameMaxW) {
    while (partName.length > 8 && doc.getTextWidth(partName + '...') > nameMaxW) partName = partName.slice(0, -1);
    partName = partName.replace(/\s+$/, '') + '...';
  }
  doc.text(partName, MG + 6, y + 12);

  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY);
  const meta = pcba ? [
    'Populated PCB (PCBA) · from photo analysis',
    `Built in: ${pcba.country}`,
    'Delivered: UK, duty paid',
    `Currency: ${currency}`,
  ].join('   ·   ') : [
    `Commodity: ${commodityType.replace(/_/g, ' ').toUpperCase()}`,
    `Currency: ${currency}`,
    `FX: £1 = ${fxRate.toFixed(4)} ${currency}`,
    `Operations: ${result.operationDetails.length}`,
    `Region: ${(input as { region?: string }).region ?? region}`,
  ].join('   ·   ');
  doc.text(meta, MG + 6, y + 19);

  // Metrics chips row
  const chips: [string, string, RGB][] = pcba ? [
    [`Ex-works / board (${pcba.country.split(' (')[0]})`, money(pcba.exWorks), NAVY],
    ['Delivered UK / board', `${sym}${(result.total * fxRate).toFixed(2)}`, ORANGE],
    ...pcba.shares.slice(0, 3).map(sh => [sh.label, pct(sh.pct), SLATE] as [string, string, RGB]),
  ] : [
    ['Total Should-Cost',   `${sym}${(result.total * fxRate).toFixed(2)}`, ORANGE],
    ['Material',            pct(pcts.rawMaterial), SLATE],
    ['Process',             pct(pcts.process), SLATE],
    ['Labour',              pct(pcts.labour), SLATE],
    ['Margin',              pct(pcts.margin), SLATE],
  ];
  const chipW = CW / chips.length;
  chips.forEach(([lbl, val, col], i) => {
    const cx = MG + i * chipW + 4;
    doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(...LGREY);
    doc.text(lbl, cx, y + 26);
    doc.setFontSize(i === 0 || (pcba && i === 1) ? 10 : 9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...col);
    doc.text(val, cx, y + 32);
  });

  y += 42;

  // ── Uploaded part photo (any commodity) ──────────────────────────────────
  if (partPhotoDataUrl) {
    try {
      const props = doc.getImageProperties(partPhotoDataUrl);
      const maxH = 42, maxW = CW * 0.5;
      let iw = maxH * (props.width / props.height), ih = maxH;
      if (iw > maxW) { iw = maxW; ih = maxW * (props.height / props.width); }
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
      doc.text('Uploaded Part Photo', MG, y + 3);
      doc.setDrawColor(...NAVY); doc.setLineWidth(0.25);
      doc.roundedRect(MG, y + 5, iw + 4, ih + 4, 2, 2, 'S');
      doc.addImage(partPhotoDataUrl, props.fileType || 'JPEG', MG + 2, y + 7, iw, ih, undefined, 'FAST');
      y += ih + 12;
    } catch { /* skip an image that fails to embed */ }
  }

  // ── Confidence & traceability summary ────────────────────────────────────
  const allCount  = result.traceability.length;
  // A PCBA's confidence is the analysis's own (how much of the BOM has a price behind it), not a
  // count of machining operations — "Low · 0 traced operations" said nothing about the board.
  // ONE grade for the cover and §7 (uncertainty.ts overallConfidence) — the cover used its own High-share test and could
  // disagree with §7 on the same report.
  const overallConf = pcba?.confidence ? pcba.confidence.label : overallConfidence(result);
  const confColor: RGB = overallConf === 'High' ? GN : overallConf === 'Medium' ? AM : RD;

  doc.setFillColor(...HDR);
  doc.roundedRect(MG, y, CW, 11, 1.5, 1.5, 'F');
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text(pcba ? 'Estimate Confidence:' : 'Model Confidence:', MG + 5, y + 7);
  doc.setTextColor(...confColor);
  doc.text(overallConf, MG + 44, y + 7);
  doc.setTextColor(...GREY); doc.setFont('helvetica', 'normal');
  doc.text(pcba?.confidence
    ? `·  likely ${money(pcba.confidence.low)} – ${money(pcba.confidence.high)}  ·  ${pcba.bom.length} BOM lines, ${pcba.confidence.verifyCount} to verify with a quote`
    : `·  ${result.operationDetails.length} traced operations  ·  ${allCount} data points auditable`, MG + 62, y + 7);
  y += 17;

  // ── Engine warnings ───────────────────────────────────────────────────────
  // The engine validates every input and raises warnings — low material-rate
  // confidence, sub-30% utilisation, an overhead entered as 12 where 0.12 was
  // meant. They were computed and discarded; a report that hides its own
  // engine's caveats is not defensible.
  // The screen's "Costed from the PCB photo analysis … press Calculate" note is an instruction for the
  // screen; the report states the same basis under Key Assumptions.
  const coverWarnings = (result.warnings ?? []).filter(w => !(pcba && /^Costed from the PCB photo analysis/.test(w)));
  if (coverWarnings.length) {
    y = calloutBox(doc, y, `Engine Warnings (${coverWarnings.length})`,
      coverWarnings, AM, [254, 249, 231]);
  }

  // ── Learning curve ────────────────────────────────────────────────────────
  // A learning curve REDUCES the labour in the headline. Printing the reduced
  // number without saying so is a silent adjustment — exactly what this report
  // exists to prevent.
  const lc = result.learningCurveApplied;
  if (lc) {
    // NB `labourSaving` is signed: negative IS the saving (core.ts documents
    // "negative = saving"). Printing it raw would read "reducing labour cost
    // by £-6.84". Take the direction from the sign and the magnitude from abs.
    const dir = lc.labourSaving <= 0 ? 'reducing' : 'increasing';
    y = calloutBox(doc, y, 'Learning Curve Applied — labour has been adjusted', [
      `Wright's law at ${lc.curvePct}% has been applied to labour: factor ${lc.adjustmentFactor.toFixed(4)}, `
      + `${dir} labour cost by ${money(Math.abs(lc.labourSaving))}/part.`,
      `Basis: cumulative volume ${lc.annualVolume.toLocaleString()} against a reference volume of `
      + `${lc.referenceVolume.toLocaleString()} at which the base labour time was established.`,
      'The labour BUCKET is the adjusted figure; §4B lists each operation at its standard time and shows the adjustment as its own row.',
    ], AM, [254, 249, 231]);
  }

  // ── Geometry provenance (CAD flows) — measured vs estimated ───────────────
  const alloyMat = library.materials.find(m => m.id === input.rawMaterial.materialId);
  if (cadMeta.geometrySource) {
    const src = cadMeta.geometrySource;
    const wt = cadMeta.measuredWeightKg != null ? `${cadMeta.measuredWeightKg.toFixed(3)} kg` : '—';
    const vol = cadMeta.measuredVolumeCm3 != null ? `${cadMeta.measuredVolumeCm3.toFixed(1)} cm³` : '—';
    if (src === 'occt') {
      y = calloutBox(doc, y, 'Geometry Provenance — MEASURED (OCCT B-rep kernel)', [
        `Volume, weight and every feature were measured from the CAD solid by the Open CASCADE kernel. Measured volume ${vol}; finished-part mass at the costed material's density ${wt}.`,
        // The VOLUME is measured; the costed weight adds rule machining stock, and prices / rates carry their own
        // confidence — "not an estimate" overstated it (casting 360 review, Oct 2026).
        'The volume, faces and holes are measured. The costed weight adds the stated machining stock, and the prices and rates carry their own confidence (§6) — those are estimates, not measurements.',
      ], GN, [237, 247, 237]);
    } else if (src === 'stl_parser') {
      y = calloutBox(doc, y, 'Geometry Provenance — MEASURED FROM MESH (STL)', [
        `Volume and weight were measured from the STL mesh (measured volume ${vol}; mass ${wt}). B-rep feature recognition (holes/bores/faces) is limited on mesh data — confirm machined features manually.`,
      ], AM, OR_LT);
    } else {
      y = calloutBox(doc, y, 'Geometry Provenance — NOT MEASURED (text/heuristic estimate)', [
        'The CAD kernel could not read this file in the deployed container, so weight and volume are TEXT/HEURISTIC ESTIMATES, not measured from the solid.',
        'Material cost and any geometry-derived machining are INDICATIVE only and may be materially wrong. To get a measured cost, attach an STL of the same part or re-run in a kernel-enabled environment.',
      ], RD, [252, 236, 236]);
    }
  }

  // ── Key assumptions (always) — the six drivers that move the answer most ──
  const utilPct = (input.rawMaterial.materialUtilization * 100);
  const wtNote = cadMeta.geometrySource === 'text_parsing' ? ' (estimated — see provenance above)'
    : cadMeta.geometrySource ? ' (measured)' : '';
  // The weight the material line is costed on. On a cast or forged part it is the AS-CAST / AS-FORGED weight (the
  // finished part + the stock machining removes), not the measured finished mass — the cover printed both, one of them
  // labelled "measured", with nothing to say why they differ (uploaded-parts review, Oct 2026).
  const costedKg = input.rawMaterial.netWeightKg;
  const finishedKg = cadMeta.measuredWeightKg ?? null;
  const nearNet = /cast|forg/.test(commodityType);
  const costedWeightLine = finishedKg != null && Math.abs(costedKg - finishedKg) > 0.01 * Math.max(finishedKg, 1e-9)
    ? `Costed weight: ${costedKg.toFixed(3)} kg${nearNet ? ` (${/forg/.test(commodityType) ? 'as forged' : 'as cast'}: the finished ${finishedKg.toFixed(3)} kg measured + the stock machining removes)` : costedKg > finishedKg ? ` (the finished ${finishedKg.toFixed(3)} kg measured + the reject / process allowance the module carries)` : ` (finished part measured at ${finishedKg.toFixed(3)} kg)`}`
    : `Net weight: ${costedKg.toFixed(3)} kg${wtNote}`;

  const pinNote = [
    cadMeta.userSpecifiedMaterial ? 'grade user-specified' : '',
    cadMeta.userSpecifiedProcess ? 'process user-specified' : '',
  ].filter(Boolean).join(', ');
  // On a multi-year award the annual rate alone is not the basis — the reader
  // needs the programme life and the lifetime volume to know which of the two
  // numbers priced the parts and which amortised the NRE.
  const annVol = cadMeta.annualVolume ?? (input as { annualVolume?: number }).annualVolume;
  const progYears = (input as { programmeYears?: number }).programmeYears;
  const volLine = progYears && annVol
    ? `Annual volume: ${annVol.toLocaleString()}/yr   ·   Programme: ${progYears} years `
      + `(${(annVol * progYears).toLocaleString()} lifetime)   ·   Region: ${(input as { region?: string }).region ?? region}`
      + `   ·   Commodity: ${commodityType.replace(/_/g, ' ')}`
      // Say so when the tooling is NOT amortised over that lifetime (an amortisation volume typed on the form).
      + (input.tooling.mode === 'amortized' && Math.abs(input.tooling.amortizationVolume - annVol * progYears) > 0.5
        ? `   ·   NOTE: tooling is amortised over ${Math.round(input.tooling.amortizationVolume).toLocaleString()} parts, not the programme lifetime`
        : '')
    : `Annual volume: ${(annVol ?? '—').toLocaleString?.() ?? '—'}   ·   Region: ${(input as { region?: string }).region ?? region}   ·   Commodity: ${commodityType.replace(/_/g, ' ')}`;
  if (pcba) {
    y = calloutBox(doc, y, 'Key Assumptions', [
      pcba.basis + '.',
      `Ex-works ${money(pcba.exWorks)} is the board built, tested and packed at the ${pcba.country.split(' (')[0]} factory gate; delivered ${money(pcba.total)} adds freight to the UK and UK import duty (${money(pcba.total - pcba.exWorks)}).`,
      `Board: ${pcba.domainLabel}${pcba.safety ? ` · costed at ${pcba.safety.costed}` : ''} · parts list from the ${pcba.bomOrigin} (${pcba.bom.length} lines, ${pcba.bomPieces} parts).`,
      'Component prices follow the parts bought (qty per board × boards); fabricator and EMS prices carry their own overhead and margin — none is added on top.',
    ], NAVY, HDR);
    y = renderPcbaSections(doc, y, pcba, money, cadMeta, scenarios, result.total);
    addFooters();
    doc.save(exportFilename('should-cost', result.partName, 'pdf'));
    return;
  }
  y = calloutBox(doc, y, 'Key Assumptions', [
    volLine,
    `Alloy / material: ${alloyMat?.grade ?? input.rawMaterial.materialId}${pinNote ? ` (${pinNote})` : ''}   ·   ${costedWeightLine}`,
    `Material utilisation: ${utilPct.toFixed(0)}%   ·   Overhead: ${(input.overheadPct * 100).toFixed(0)}% of material + process + labour + tooling${(input.rawMaterial.boughtIn?.cost ?? 0) > 0 ? ' (bought-in content excluded — it carries a handling charge only)' : ''}   ·   Margin: ${(input.marginPct * 100).toFixed(0)}% of the subtotal${(input.rawMaterial.boughtIn?.cost ?? 0) > 0 ? ' excl. bought-in' : ''}   ·   Operations: ${result.operationDetails.length}`,
  ], NAVY, HDR);


  y = renderShouldCostSections(doc, y, { result, input, library, currency, fxRate, commodityType, region, scenarios, cadMeta, baseLibrary, regionalRows });

  addFooters();

  const fname = exportFilename('should-cost', result.partName, 'pdf');
  doc.save(fname);
}

// Legacy compat
export { printPDF as openPDF };

// ════════════════════════════════════════════════════════════════════════════
//  AI CAD-to-COST ANALYSIS PDF
// ════════════════════════════════════════════════════════════════════════════
export function printCADAnalysisPDF(r: CADAnalysisResult, partPhotoDataUrl?: string | null, currency = 'GBP', fxRate = 1): void {
  type RGB3 = [number, number, number];
  // AI cost range and tooling figures are GBP-denominated — convert to the
  // chosen display currency so a CNY/EUR report is not littered with £.
  const cadCurSym = currencySymbol(currency);
  const cadMoney = (n: number) => `${cadCurSym}${(n * fxRate).toFixed(2)}`;
  const cadMoney0 = (n: number) => `${cadCurSym}${Math.round(n * fxRate).toLocaleString()}`;

  const TEAL:   RGB3 = [13,  148, 136];
  const DARK:   RGB3 = [15,  23,  42];
  const GREY3:  RGB3 = [100, 116, 139];
  const LGRY3:  RGB3 = [160, 174, 192];
  const LITE3:  RGB3 = [240, 253, 250];
  const HDR3:   RGB3 = [204, 241, 237];
  const RED3:   RGB3 = [185, 28,  28];
  const AMB3:   RGB3 = [180, 83,  9];
  const GRN3:   RGB3 = [22,  163, 74];
  const BLUE3:  RGB3 = [37,  99,  235];
  const NAV3:   RGB3 = [15,  32,  65];

  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const doc = hardenPdfText(new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }));

  let y = 0;

  const lY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  const ck = (need = 20): void => { if (y + need > 276) { doc.addPage(); y = 18; } };

  const section = (title: string, sub?: string): void => {
    ck(14);
    doc.setFillColor(...TEAL);
    doc.roundedRect(MG, y, CW, 9, 1.5, 1.5, 'F');
    doc.setFillColor(255, 255, 255, 0.15);
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text(title, MG + 5, y + 6.2);
    if (sub) {
      doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.text(sub, W - MG - 3, y + 6.2, { align: 'right' });
    }
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK);
    y += 13;
  };

  const bodyText = (text: string, indent = 0, colour: RGB3 = DARK): void => {
    const lines = doc.splitTextToSize(text, CW - indent) as string[];
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...colour);
    doc.text(lines, MG + indent, y);
    y += lines.length * 4.2 + 1;
  };

  const kv = (label: string, value: string, col: RGB3 = DARK): void => {
    doc.setFontSize(7.5); doc.setTextColor(...GREY3); doc.setFont('helvetica', 'normal');
    doc.text(label, MG, y);
    doc.setTextColor(...col); doc.setFont('helvetica', 'bold');
    doc.text(value, MG + 52, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK);
    y += 5;
  };

  const sevCol = (s: string): RGB3 => {
    const sl = s.toLowerCase();
    return (sl === 'high' || sl === 'critical') ? RED3 : sl === 'medium' ? AMB3 : GRN3;
  };

  const addFooters = (): void => {
    const total = pageCount(doc);
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(...TEAL); doc.setLineWidth(0.4);
      doc.line(MG, 285, W - MG, 285);
      const lw = drawCostVisionLogo(doc, MG, 287, 4);
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY3);
      doc.text('AI CAD-to-Cost Analysis Report  ·  CONFIDENTIAL', MG + lw + 3, 291);
      doc.text(`Generated: ${dateStr}`, W / 2, 291, { align: 'center' });
      doc.text(`Page ${i} of ${total}`, W - MG, 291, { align: 'right' });
    }
  };

  // ── Cover Header ─────────────────────────────────────────────────────────
  doc.setFillColor(...NAV3);
  doc.rect(0, 0, W, 58, 'F');
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, 7, 58, 'F');

  // Logo box
  doc.setFillColor(...(WHITE as unknown as RGB3));
  doc.roundedRect(MG + 4, 9, 22, 14, 2, 2, 'F');
  doc.setTextColor(...TEAL); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text('CV', MG + 15, 18.5, { align: 'center' });

  doc.setTextColor(255, 255, 255); doc.setFontSize(17); doc.setFont('helvetica', 'bold');
  doc.text('AI CAD-to-Cost Analysis', MG + 32, 17);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(185, 220, 215);
  doc.text('CostVision  ·  Powered by Claude AI  ·  Manufacturing Intelligence Platform', MG + 32, 24);

  doc.setFillColor(...TEAL);
  doc.roundedRect(MG + 32, 30, 45, 7, 1.5, 1.5, 'F');
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('AI-POWERED CAD ANALYSIS REPORT', MG + 54, 35, { align: 'center' });

  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(185, 220, 215);
  doc.text(`Generated: ${dateStr}`, MG + 32, 44);
  doc.text('Geometry to Process to Cost  ·  Fully AI-reasoned', MG + 32, 50);

  y = 66;

  // Part summary card
  const scoreColor: RGB3 = r.manufacturabilityScore >= 75 ? GRN3 : r.manufacturabilityScore >= 50 ? AMB3 : RED3;

  doc.setFillColor(245, 250, 252);
  doc.roundedRect(MG, y, CW, 30, 2.5, 2.5, 'F');
  doc.setDrawColor(...TEAL); doc.setLineWidth(0.25);
  doc.roundedRect(MG, y, CW, 30, 2.5, 2.5, 'S');
  doc.setFillColor(...TEAL);
  doc.roundedRect(MG, y, CW, 2.5, 1, 1, 'F');

  // Score badge
  doc.setFillColor(...scoreColor);
  doc.circle(MG + 14, y + 17, 10, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text(String(r.manufacturabilityScore), MG + 14, y + 20.5, { align: 'center' });

  doc.setTextColor(...DARK); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text(r.partName, MG + 30, y + 12);

  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY3);
  const g = r.geometry;
  doc.text(
    `${g.boundingBoxMm.x.toFixed(0)} × ${g.boundingBoxMm.y.toFixed(0)} × ${g.boundingBoxMm.z.toFixed(0)} mm  ·  ` +
    `${g.estimatedVolumeCm3.toFixed(1)} cm³  ·  Al ${g.estimatedWeightKg.aluminum.toFixed(3)} kg / Steel ${g.estimatedWeightKg.steel.toFixed(3)} kg`,
    MG + 30, y + 19
  );
  doc.setTextColor(...scoreColor);
  doc.text(`Manufacturability: ${r.manufacturabilityScore}/100  ·  Confidence: ${r.confidenceLevel}`, MG + 30, y + 26);

  y += 38;

  // ── Uploaded part photo ──────────────────────────────────────────────────
  if (partPhotoDataUrl) {
    try {
      const props = doc.getImageProperties(partPhotoDataUrl);
      const maxH = 42, maxW = CW * 0.45;
      let iw = maxH * (props.width / props.height), ih = maxH;
      if (iw > maxW) { iw = maxW; ih = maxW * (props.height / props.width); }
      ck(ih + 14);
      section('Uploaded Part Photo');
      doc.setDrawColor(...GREY3); doc.setLineWidth(0.25);
      doc.roundedRect(MG, y, iw + 4, ih + 4, 2, 2, 'S');
      doc.addImage(partPhotoDataUrl, props.fileType || 'JPEG', MG + 2, y + 2, iw, ih, undefined, 'FAST');
      y += ih + 10;
    } catch { /* skip */ }
  }

  // ── §1 Geometry & Part Summary ───────────────────────────────────────────
  section('§1 — Geometry & Part Summary');

  // col widths: 36 + 52 + 36 + (182-124) = 36+52+36+58 = 182 ✓
  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    body: [
      ['Bounding Box',  `${g.boundingBoxMm.x.toFixed(1)} × ${g.boundingBoxMm.y.toFixed(1)} × ${g.boundingBoxMm.z.toFixed(1)} mm`, 'Surface Area', `${g.estimatedSurfaceAreaCm2.toFixed(1)} cm²`],
      ['Volume',        `${g.estimatedVolumeCm3.toFixed(2)} cm³`,      'Weight (Al)',      `${g.estimatedWeightKg.aluminum.toFixed(3)} kg`],
      ['Weight (Steel)',`${g.estimatedWeightKg.steel.toFixed(3)} kg`,   'Weight (Plastic)', `${g.estimatedWeightKg.plastic.toFixed(3)} kg`],
    ],
    theme: 'plain',
    bodyStyles: { fontSize: 7.5, textColor: DARK, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
    alternateRowStyles: { fillColor: LITE3 },
    columnStyles: {
      0: { cellWidth: 36, textColor: GREY3 },
      1: { cellWidth: 52, fontStyle: 'bold' },
      2: { cellWidth: 36, textColor: GREY3 },
      3: { cellWidth: 58, fontStyle: 'bold' },
    },
  });
  y = lY() + 7;

  // ── §2 Detected Features ─────────────────────────────────────────────────
  section('§2 — Detected Features');

  // col widths: 40 + 14 + 24 + (182-78) = 40+14+24+104 = 182 ✓
  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    head: [['Feature Type', 'Count', 'Significance', 'Description']],
    body: r.detectedFeatures.map(f => [f.type, String(f.count), f.significance, f.description]),
    theme: 'plain',
    headStyles: { fillColor: HDR3, textColor: DARK, fontStyle: 'bold', fontSize: 7.5, cellPadding: 3 },
    bodyStyles: { fontSize: 7.5, textColor: DARK, cellPadding: 3 },
    alternateRowStyles: { fillColor: LITE3 },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: 'bold' },
      1: { cellWidth: 14, halign: 'center' },
      2: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 104 },
    },
    didParseCell: (d) => {
      if (d.column.index === 2 && d.section === 'body') {
        d.cell.styles.textColor = sevCol(String(d.cell.raw));
      }
    },
  });
  y = lY() + 7;

  // ── §3 Material Analysis ─────────────────────────────────────────────────
  section('§3 — Material Analysis', r.materialAnalysis.fromMetadata ? 'From CAD metadata' : 'AI-suggested');

  const ma = r.materialAnalysis;
  kv('Primary Material:', `${ma.primarySuggestion.name}  (${ma.primarySuggestion.confidencePct}% confidence)`, TEAL);
  bodyText(ma.primarySuggestion.reasoning, 4, GREY3);
  if (ma.alternatives.length > 0) {
    doc.setFontSize(7.5); doc.setTextColor(...GREY3); doc.setFont('helvetica', 'normal');
    doc.text('Alternatives:', MG, y);
    doc.setTextColor(...DARK); doc.setFont('helvetica', 'bold');
    doc.text(ma.alternatives.map(a => `${a.name} (${a.confidencePct}%)`).join('  ·  '), MG + 22, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
  }
  y += 2;

  // ── §4 Process Recommendations ───────────────────────────────────────────
  ck(22);
  section('§4 — Process Recommendations');

  // col widths: 42 + 28 + 18 + 22 + (182-110) = 42+28+18+22+72 = 182 ✓
  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    head: [['Process', 'Commodity', 'Confidence', 'Cycle Time (hr)', 'Reasoning']],
    body: r.processRecommendations.map(p => [p.process, p.commodityType, `${p.confidencePct}%`, p.estimatedCycleTimeHr === undefined ? '—' : p.estimatedCycleTimeHr.toFixed(4), p.reasoning]),
    theme: 'plain',
    headStyles: { fillColor: HDR3, textColor: DARK, fontStyle: 'bold', fontSize: 7.5, cellPadding: 3 },
    bodyStyles: { fontSize: 7.5, textColor: DARK, cellPadding: 3 },
    alternateRowStyles: { fillColor: LITE3 },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold' },
      1: { cellWidth: 28 },
      2: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 72, textColor: GREY3 },
    },
    didParseCell: (d) => {
      if (d.column.index === 2 && d.section === 'body') {
        const p = parseInt(String(d.cell.raw));
        d.cell.styles.textColor = p >= 75 ? GRN3 : p >= 50 ? AMB3 : RED3;
      }
      if (d.row.index === 0 && d.section === 'body') {
        d.cell.styles.fillColor = LITE3;
      }
    },
  });
  y = lY() + 7;

  // ── §5 Manufacturability Risks ───────────────────────────────────────────
  if (r.manufacturabilityRisks.length > 0) {
    ck(22);
    section(`§5 — Manufacturability Risks  (Score: ${r.manufacturabilityScore}/100)`);

    // col widths: 20 + 36 + (182-92)*0.52 + (182-92)*0.48 = 20+36+46+44 = 146 → NO
    // 20 + 36 + 66 + 60 = 182 ✓
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG },
      head: [['Severity', 'Feature / Area', 'Description', 'Recommended Action']],
      body: r.manufacturabilityRisks.map(risk => [risk.severity, risk.feature, risk.description, risk.suggestion]),
      theme: 'plain',
      headStyles: { fillColor: HDR3, textColor: DARK, fontStyle: 'bold', fontSize: 7.5, cellPadding: 3 },
      bodyStyles: { fontSize: 7.5, textColor: DARK, cellPadding: 3, overflow: 'linebreak' },
      alternateRowStyles: { fillColor: LITE3 },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 36, fontStyle: 'bold' },
        2: { cellWidth: 66 },
        3: { cellWidth: 60 },
      },
      didParseCell: (d) => {
        if (d.column.index === 0 && d.section === 'body') {
          d.cell.styles.textColor = sevCol(String(d.cell.raw));
        }
      },
    });
    y = lY() + 7;
  }

  // ── §6 DFM Issues ────────────────────────────────────────────────────────
  const dfmIssues = r.costInputSuggestions.dfmIssues ?? [];
  if (dfmIssues.length > 0) {
    ck(22);
    section(`§6 — DFM Issues  (${r.costInputSuggestions.recommendedCommodity})`);

    // col widths: 20 + 32 + 44 + 44 + (182-140) = 20+32+44+44+42 = 182 ✓
    autoTable(doc, {
      startY: y, margin: { left: MG, right: MG },
      head: [['Severity', 'Area', 'Description', 'Impact', 'Fix']],
      body: dfmIssues.map(d => [d.severity, d.area, d.description, d.impact, d.fix]),
      theme: 'plain',
      headStyles: { fillColor: HDR3, textColor: DARK, fontStyle: 'bold', fontSize: 7.5, cellPadding: 3 },
      bodyStyles: { fontSize: 7, textColor: DARK, cellPadding: 3, overflow: 'linebreak' },
      alternateRowStyles: { fillColor: LITE3 },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 32, fontStyle: 'bold' },
        2: { cellWidth: 44 },
        3: { cellWidth: 44 },
        4: { cellWidth: 42 },
      },
      didParseCell: (d) => {
        if (d.column.index === 0 && d.section === 'body') {
          d.cell.styles.textColor = sevCol(String(d.cell.raw));
        }
      },
    });
    y = lY() + 7;
  }

  // ── §7 Cost Range & Suggested Inputs ────────────────────────────────────
  ck(28);
  // The range below is the MODEL'S opinion, not engine arithmetic — the audit
  // found it rendered as headline money indistinguishable from calculated
  // output. The title now says whose number it is; the engine's own uncertainty
  // band lives in the should-cost report (§7 there), not here.
  section('§7 — AI Indicative Cost Range (model opinion — not engine-calculated)');

  const cr = r.costInputSuggestions.costRange;
  if (cr && (cr.low || cr.mid || cr.high)) {
    doc.setFillColor(...LITE3);
    doc.roundedRect(MG, y, CW, 18, 2, 2, 'F');
    doc.setDrawColor(...TEAL); doc.setLineWidth(0.3);
    doc.roundedRect(MG, y, CW, 18, 2, 2, 'S');
    const thirds = CW / 3;

    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...LGRY3);
    doc.text('OPTIMISTIC',    MG + thirds * 0 + 4, y + 6);
    doc.text('MOST LIKELY',   MG + thirds * 1 + 4, y + 6);
    doc.text('CONSERVATIVE',  MG + thirds * 2 + 4, y + 6);

    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.setTextColor(...GRN3);  doc.text(cadMoney(cr.low),  MG + thirds * 0 + 8, y + 14);
    doc.setTextColor(...BLUE3); doc.text(cadMoney(cr.mid),  MG + thirds * 1 + 8, y + 14);
    doc.setTextColor(...RED3);  doc.text(cadMoney(cr.high), MG + thirds * 2 + 8, y + 14);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK);
    y += 24;
  }

  const ci  = r.costInputSuggestions;
  // Live analyses arrive with fields missing (a deterministic run has no AI
  // cycle estimate; ops can be absent) — 4 of 16 audit captures crashed this
  // renderer on `undefined.toFixed`, which in the product means the export
  // button silently does nothing. Render what exists, dash what does not.
  const numOr = (v: unknown, digits: number, unit: string): string =>
    typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(digits)}${unit}` : '—';
  const opsArr = Array.isArray(ci.estimatedOperations) ? ci.estimatedOperations : [];
  const opsText = opsArr.map(o => `${o.name} (${o.machineId}, ${numOr(o.cycleTimeHr, 4, ' hr')})`).join('\n');

  // col widths: 42 + 54 + 32 + (182-128) = 42+54+32+54 = 182 ✓
  autoTable(doc, {
    startY: y, margin: { left: MG, right: MG },
    body: [
      ['Net Weight',          numOr(ci.netWeightKg, 3, ' kg'),                'Material',      ci.materialId ?? '—'],
      ['Recommended Process', ci.recommendedCommodity ?? '—',                  'Cycle Time',   numOr(ci.estimatedCycleTimeHr, 4, ' hr/part')],
      ['Setup Time',          numOr(ci.estimatedSetupTimeHr, 3, ' hr'),       'Operations',   `${opsArr.length} ops`],
      ['Operations Detail',   opsText,                                         '',             ''],
    ],
    theme: 'plain',
    bodyStyles: { fontSize: 7.5, textColor: DARK, cellPadding: 3 },
    alternateRowStyles: { fillColor: LITE3 },
    columnStyles: {
      0: { cellWidth: 42, textColor: GREY3 },
      1: { cellWidth: 54, fontStyle: 'bold' },
      2: { cellWidth: 32, textColor: GREY3 },
      3: { cellWidth: 54, fontStyle: 'bold' },
    },
  });
  y = lY() + 6;

  // Process-specific params. Live analyses carry these sections PARTIALLY
  // filled (the audit's bumper had injectionMoulding with no mouldCost/mouldLife
  // — the rules only decide what geometry can settle), and an undefined here
  // crashed the whole export. Format what exists, dash the rest.
  const int0 = (v: unknown): string =>
    typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString() : '—';
  const money0 = (v: unknown): string =>
    typeof v === 'number' && Number.isFinite(v) ? cadMoney0(v) : '—';
  const numF = (v: unknown, digits: number, unit = ''): string =>
    typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(digits)}${unit}` : '—';
  const pctF = (v: unknown): string =>
    typeof v === 'number' && Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—';
  const specific: string[][] = [];
  if (ci.casting)          { specific.push(['Casting Subtype', ci.casting.subtype ?? '—'], ['Die/Mould Cost', money0(ci.casting.dieMouldCostGBP)], ['Die Life', `${int0(ci.casting.dieMouldLife)} shots`], ['Cavities', String(ci.casting.cavities ?? '—')], ['Yield', pctF(ci.casting.yieldFraction)]); }
  if (ci.forging)          { specific.push(['Flash Weight', numF(ci.forging.flashKg, 3, ' kg')], ['Yield', pctF(ci.forging.yieldFraction)], ['Die Cost', money0(ci.forging.dieCostGBP)], ['Strokes', String(ci.forging.strokes ?? '—')]); }
  if (ci.injectionMoulding){ specific.push(['Cavities', String(ci.injectionMoulding.cavities ?? '—')], ['Wall Thickness', `${ci.injectionMoulding.wallThicknessMm ?? '—'} mm`], ['Mould Cost', money0(ci.injectionMoulding.mouldCostGBP)], ['Mould Life', `${int0(ci.injectionMoulding.mouldLife)} shots`], ['Projected Area', numF(ci.injectionMoulding.projectedAreaCm2, 1, ' cm²')]); }
  if (specific.length > 0) {
    ck(specific.length * 5 + 12);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...GREY3);
    doc.text('Process-Specific Parameters', MG, y); y += 5;
    // col widths: 42 + (182-42) = 182 ✓
    autoTable(doc, {
      startY: y,
      body: specific,
      theme: 'plain',
      bodyStyles: { fontSize: 7.5, textColor: DARK, cellPadding: 3 },
      alternateRowStyles: { fillColor: LITE3 },
      columnStyles: {
        0: { cellWidth: 42, textColor: GREY3 },
        1: { cellWidth: 140, fontStyle: 'bold' },
      },
      margin: { left: MG + 4, right: MG },
    });
    y = lY() + 6;
  }

  // ── §8 AI Explanation ────────────────────────────────────────────────────
  ck(24);
  section('§8 — AI Analysis Explanation');
  bodyText(r.aiExplanation, 0, GREY3);
  y += 3;

  // ── §9 Limitations ───────────────────────────────────────────────────────
  if (r.analysisLimitations.length > 0) {
    ck(16);
    section('§9 — Analysis Limitations & Assumptions');
    r.analysisLimitations.forEach((lim, i) => bodyText(`${i + 1}.  ${lim}`, 4, GREY3));
  }

  if (ci.stage1Selection) {
    ck(10);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...LGRY3);
    const st = ci.stage1Selection;
    doc.text(
      `Stage-1 pre-selection: ${st.primary} (${Math.round((st.conf ?? 0) * 100)}%)  ·  ` +
      // alt may arrive as {type,conf} objects or as bare commodity strings — handle both.
      ((st.alt ?? []) as Array<{ type?: string; conf?: number } | string>)
        .map(a => typeof a === 'string'
          ? a
          : `${a.type ?? '—'}${typeof a.conf === 'number' ? ` (${Math.round(a.conf * 100)}%)` : ''}`)
        .filter(Boolean).join(' · '),
      MG, y
    );
    y += 5;
  }

  addFooters();

  const fname = exportFilename('cad-analysis', r.partName, 'pdf');
  doc.save(fname);
}
