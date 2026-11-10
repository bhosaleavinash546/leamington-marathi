/**
 * The "Drawing specification" block of a CAD costing's reports — ONE model, drawn by the core PDF, the audit pack and
 * the workbook (offline 2D drawing intelligence, integration — Nov 2026).
 *
 * It prints what the costing HOLDS: the readings of the attached drawing as the server consolidated them, the
 * engineer's decisions as they were applied to the costing on screen, which of them answered a costing question, the
 * conflicts and how each was settled, what the route expected and the drawing does not state, and what the drawing
 * states that no cost rule prices yet. No arithmetic and no £: a drawing reading is never a cost. With no drawing the
 * model is null and every report is exactly what it was.
 */
import type { ConsolidatedEngineeringData, StatusWord } from '../engine/engineering-data/index.js';
import { buildReviewPanel, type DrawingCostingView, type DrawingInfoView } from '../ui/drawing-review.js';

export interface DrawingSpecRow {
  group: string;
  parameter: string;
  value: string;
  /** "Drawing — bracket.pdf · Sheet 1 · zone D1 · title block · exact text". */
  source: string;
  status: StatusWord;
  /** True when the value reached the costing (an answer to a question, or a finish field of the form). */
  used: boolean;
  /** "Yes — answers "…" with …" / "No — not confirmed" / "No — cross-check of the 3D model". */
  usedText: string;
}

export interface DrawingSpecConflict { parameter: string; sides: string; suggested: string; resolution: string; open: boolean }

export interface DrawingSpecReport {
  file: string;
  hashShort: string;
  readerVersion: string;
  sheets: number;
  ocrReadings: number;
  /** One line under the heading. */
  summary: string;
  /** Readings that answer a question on this route, or cross-check the model. */
  rows: DrawingSpecRow[];
  usedCount: number;
  conflicts: DrawingSpecConflict[];
  missing: Array<{ parameter: string; why: string }>;
  /** Specified on the drawing, priced by no rule. */
  notCosted: Array<{ parameter: string; value: string; source: string; status: StatusWord; why: string }>;
  /** Decisions of an earlier review that did not apply to this reading. */
  skipped: string[];
  warnings: string[];
  /** What a reader must know about how far to trust the table. */
  notes: string[];
}

export interface DrawingSpecInput {
  info: DrawingInfoView;
  data: ConsolidatedEngineeringData;
  costing: DrawingCostingView;
  commodity: string;
  questionText?: (decisionId: string) => string | undefined;
}

const SOURCE_NAME: Record<string, string> = { CAD: '3D model', Drawing: 'Drawing', Derived: 'Interpreted', Typed: 'Typed by the engineer' };

/** The report's model of the attached drawing, or null when the costing has none. */
export function buildDrawingSpecReport(i: DrawingSpecInput | null | undefined): DrawingSpecReport | null {
  if (!i || i.info.status !== 'ready') return null;
  const m = buildReviewPanel({ drawing: i.info, data: i.data, costing: i.costing, commodity: i.commodity, pending: false, questionText: i.questionText });
  const src = (source: string, where: string): string =>
    [`${SOURCE_NAME[source] ?? source}${source === 'Drawing' || source === 'Derived' ? ` — ${i.info.file}` : ''}`, where].filter(Boolean).join(' · ');
  const rows: DrawingSpecRow[] = m.groups.flatMap(g => g.rows.map((r): DrawingSpecRow => {
    const used = r.effect.kind === 'answers' || r.effect.kind === 'form-field';
    const usedText = r.rawStatus === 'rejected' ? 'No — rejected by the engineer'
      : used ? `Yes — ${r.effect.text}`
      : r.effect.kind === 'not-used' ? `No — ${r.effect.text}`
      : r.effect.kind === 'would-answer' ? `No — not confirmed. ${r.effect.text.replace(/\s*Not used until you confirm it\.$/, '')}`
      : r.effect.kind === 'cross-check' ? `No — ${r.effect.text.replace(/^A cross-check/, 'a cross-check').replace(/\.$/, '')}`
      : r.rawStatus === 'confirmed' || r.rawStatus === 'corrected' ? 'No — confirmed; no question on this route takes it directly'
      : 'No — not confirmed';
    return { group: g.title, parameter: r.label, value: r.value, source: src(r.source, r.where), status: r.status, used, usedText };
  }));
  const conflicts: DrawingSpecConflict[] = [
    ...m.conflicts.map(c => ({
      parameter: c.label,
      sides: c.sides.map(s => `${SOURCE_NAME[s.source] ?? s.source}: ${s.value}`).join('  v  '),
      suggested: c.sides.find(s => s.suggested) ? `${SOURCE_NAME[c.sides.find(s => s.suggested)!.source]} (${c.sides.find(s => s.suggested)!.value})` : '',
      resolution: c.open ? 'OPEN — not settled; neither value was used' : c.resolution,
      open: c.open,
    })),
    ...m.overridden.map(o => ({
      parameter: o.question, sides: `Engineer's answer: ${o.hand}  v  Drawing (confirmed): ${o.drawing}`, suggested: '',
      resolution: 'The engineer\'s own answer was used; the drawing value was not', open: false,
    })),
  ];
  const usedCount = rows.filter(r => r.used).length;
  return {
    file: i.info.file, hashShort: i.info.hash.slice(0, 8), readerVersion: i.info.readerVersion, sheets: i.info.sheets.length, ocrReadings: i.info.ocrReadings,
    summary: `${i.info.file} (${i.info.sheets.length} sheet${i.info.sheets.length === 1 ? '' : 's'}), read offline by drawing reader v${i.info.readerVersion} — no AI. `
      + `${rows.length + m.notCosted.length} readings; ${usedCount} confirmed by the engineer and used in this costing; `
      + `${conflicts.filter(c => c.open).length} conflict(s) open; ${m.notCosted.length} specified but not in the cost model.`,
    rows, usedCount, conflicts,
    missing: m.missing.map(x => ({ parameter: x.label, why: x.why })),
    notCosted: m.notCosted.map(n => ({ parameter: n.label, value: n.value, source: src('Drawing', n.where), status: n.status, why: n.why })),
    skipped: m.skipped, warnings: m.warnings,
    notes: [
      'Only a reading the engineer confirmed or corrected is used in the costing; every other reading is listed and changes nothing.',
      'A value marked OCR was read off pixels and needs checking against the sheet. Geometric-tolerance, roughness and weld SYMBOLS drawn as geometry are not read.',
      ...(m.missing.length ? ['A value the route expects and the drawing does not state is listed as missing: nothing was assumed in its place.'] : []),
    ],
  };
}
