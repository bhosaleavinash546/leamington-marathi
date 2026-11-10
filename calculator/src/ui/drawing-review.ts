/**
 * "From the drawing" — the review panel of the CAD to COST Confirm step (offline 2D drawing intelligence, Nov 2026).
 *
 * Pure (data) → view model → HTML. The state, the clicks and the requests live in drawing-review-ui.ts; nothing here
 * touches the DOM, and nothing here computes a cost. Every string that came from a drawing, a file name or a person is
 * escaped. A status is always a WORD (Read, Needs checking, Missing, Conflict, Confirmed, Corrected, Rejected,
 * Inferred) — never colour alone. No inline event handlers: buttons carry `data-dr-act` and the controller listens.
 */
import type {
  ConsolidatedEngineeringData, EngineeringParameter, ParameterConflict, CostingAnswers, SkippedOp, StatusWord, SourceWord, ReviewGroupKey,
} from '../engine/engineering-data/index.js';
import {
  packFor, parameterDef, parameterLabel, statusWord, sourceWord, valueText, codeLabel, whereText, locationText, methodText, rootOf, exactlyRead,
  reviewGroupOf, REVIEW_GROUPS,
} from '../engine/engineering-data/index.js';
import { answerName } from './cad-workspace.js';

const esc = (s: unknown): string => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** A history time as a person reads it ("10 Nov 2026 14:05 UTC"); '' when absent or unreadable. */
export function dayOf(at: string | undefined): string {
  const d = at ? new Date(at) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return `${d.getUTCDate()} ${mon} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

/** The one line the upload control and the panel both say. */
export const DRAWING_OFFLINE_LINE = 'Read on this server — no AI, nothing leaves it';

/** What the server says about the drawing file (services/drawing-service.ts `DrawingInfo`). */
export type DrawingInfoView = import('../../server/services/drawing-service.js').DrawingInfo;
/** A question the engine asks on this route, as the adapter was shown it (services/drawing-context.ts). */
export type DrawingQuestionView = import('../../server/services/drawing-context.js').DrawingQuestion;
export type OverriddenView = import('../../server/services/drawing-context.js').OverriddenByHand;

/** The adapter's output plus what the server adds to it. */
export interface DrawingCostingView extends CostingAnswers {
  skipped?: SkippedOp[];
  overridden?: OverriddenView[];
  questions?: DrawingQuestionView[];
}

/** What a row does to the costing, in a sentence. */
export interface RowEffect {
  kind: 'answers' | 'would-answer' | 'not-used' | 'form-field' | 'cross-check' | 'none';
  decisionId?: string;
  text: string;
}

export interface ReviewRow {
  id: string;
  name: string;
  label: string;
  value: string;
  source: SourceWord;
  /** A second source that states the same value ("also the 3D model"). */
  alsoFrom: string;
  where: string;
  /** True when any reading behind the value came from OCR. */
  ocr: boolean;
  status: StatusWord;
  rawStatus: EngineeringParameter['status'];
  note: string;
  effect: RowEffect;
  sheet: number | null;
  bbox: [number, number, number, number] | null;
  /** Buttons the row offers. */
  canConfirm: boolean;
  canCorrect: boolean;
  canReject: boolean;
  canUndo: boolean;
  /** Parameters confirmed together with this one (a grade with its family). */
  companions: string[];
  confirmLabel: string;
  /** How a correction is typed. */
  input: { kind: 'text' | 'number' | 'flag' | 'choice'; unit: string; choices: Array<{ value: string; label: string }>; current: string };
  /** A derived value sits under the reading it was worked out from. */
  parentId: string | null;
}

export interface ConflictView {
  index: number;
  name: string;
  featureId: string;
  label: string;
  why: string;
  open: boolean;
  sides: Array<{ parameterId: string; source: SourceWord; value: string; where: string; suggested: boolean; chosen: boolean }>;
  resolution: string;
  /** The parameter whose decision is undone to reopen the conflict. */
  undoId: string;
  unit: string;
}

export interface NotCostedView { id: string; label: string; value: string; where: string; why: string; status: StatusWord; sheet: number | null; bbox: [number, number, number, number] | null }

export interface ReviewPanelModel {
  file: string;
  status: DrawingInfoView['status'];
  error: string;
  sheets: Array<{ sheet: number; widthPt: number; heightPt: number }>;
  /** A drawing kind that has a page picture (a DXF has none). */
  hasSheetPicture: boolean;
  hash: string;
  readerVersion: string;
  ocrReadings: number;
  warnings: string[];
  summary: string;
  groups: Array<{ key: ReviewGroupKey; title: string; rows: ReviewRow[]; notes: string[] }>;
  conflicts: ConflictView[];
  overridden: Array<{ decisionId: string; question: string; hand: string; drawing: string; parameterId: string }>;
  missing: Array<{ label: string; why: string }>;
  notCosted: NotCostedView[];
  skipped: string[];
  /** Ids "Confirm all read exactly" would confirm. */
  exactIds: string[];
  /** The review holds decisions the costing has not been re-run with. */
  pending: boolean;
  restored: string;
  decisions: number;
}

export interface ReviewPanelInput {
  drawing: DrawingInfoView;
  data: ConsolidatedEngineeringData | null;
  costing: DrawingCostingView | null;
  commodity: string;
  pending: boolean;
  restored?: string | null;
  decisions?: number;
  /** Extra labels for questions the adapter list does not hold (answers already applied). */
  questionText?: (decisionId: string) => string | undefined;
}

const SOURCE_PLACE: Record<SourceWord, string> = { CAD: 'the 3D model', Drawing: 'the drawing', Derived: 'interpreted', Typed: 'typed by the engineer' };

/** An answer as the question words it: its option's label, else the code as a person names it (never a library id). */
export function answerLabel(q: Pick<DrawingQuestionView, 'options'> | undefined, value: unknown): { label: string; consequence: string } {
  const o = q?.options.find(x => String(x.value) === String(value));
  return { label: o ? o.label.split(' — ')[0] : codeLabel(value), consequence: o?.consequence ?? '' };
}
const optionLabel = answerLabel;

/** The review panel's model: rows by group, conflicts, what is missing, what is not costed. */
export function buildReviewPanel(i: ReviewPanelInput): ReviewPanelModel {
  const { drawing, data, costing } = i;
  const base: ReviewPanelModel = {
    file: drawing.file, status: drawing.status, error: drawing.error ?? '', hash: drawing.hash, readerVersion: drawing.readerVersion,
    sheets: drawing.sheets.map(s => ({ sheet: s.sheet, widthPt: s.widthPt, heightPt: s.heightPt })),
    hasSheetPicture: drawing.fileKind === 'pdf' || drawing.fileKind === 'image',
    ocrReadings: drawing.ocrReadings, warnings: drawing.warnings, summary: '', groups: [], conflicts: [], overridden: [], missing: [], notCosted: [],
    skipped: [], exactIds: [], pending: i.pending, restored: i.restored ?? '', decisions: i.decisions ?? 0,
  };
  if (!data) return base;

  const byId = new Map(data.parameters.map(p => [p.id, p]));
  const questions = new Map((costing?.questions ?? []).map(q => [q.id, q]));
  // A question this route asks only once an earlier one is answered is not in the open list yet: it is named by its
  // short name ("Leak-tight", "Finish") — never by its internal id.
  const qText = (id: string): string => questions.get(id)?.question ?? i.questionText?.(id) ?? answerName(id);
  /** The question as a sentence names it: its own wording in quotes, or `the "Leak-tight" question`. */
  const qRef = (id: string): string => {
    const full = questions.get(id)?.question ?? i.questionText?.(id);
    return full ? `"${full}"` : `the "${answerName(id)}" question`;
  };
  const pack = packFor(i.commodity);
  const notCostedIds = new Set(data.notCosted.map(n => n.parameterId));
  const conflictIds = new Set(data.conflicts.filter(c => !c.resolution).flatMap(c => c.sides.map(s => s.parameterId)));
  const decided = (p: EngineeringParameter) => p.status === 'confirmed' || p.status === 'corrected' || p.status === 'rejected';

  const effectOf = (p: EngineeringParameter): RowEffect => {
    const answered = Object.entries(costing?.evidence ?? {}).find(([, e]) => e.parameterId === p.id);
    if (answered) {
      const q = questions.get(answered[0]);
      const o = optionLabel(q, costing!.answers[answered[0]]);
      return { kind: 'answers', decisionId: answered[0],
        text: `Answers ${qRef(answered[0])} with ${o.label}${o.consequence ? ` — ${o.consequence}` : ''}${i.pending ? ' (applied at the next Get cost)' : ''}` };
    }
    const field = costing?.formFields.find(f => f.parameterId === p.id);
    if (field) return { kind: 'form-field', text: `Fills the finish block of the costing form: ${field.note}` };
    const dropped = costing?.dropped.find(d => d.parameterId === p.id);
    if (dropped) return { kind: 'not-used', decisionId: dropped.decisionId, text: `Confirmed, but not used for ${qRef(dropped.decisionId)}: ${dropped.why}` };
    const lean = costing?.leanings.find(l => l.parameterId === p.id);
    if (lean) {
      const q = questions.get(lean.decisionId);
      const o = optionLabel(q, lean.value);
      return { kind: 'would-answer', decisionId: lean.decisionId,
        text: `Would answer ${qRef(lean.decisionId)} with ${o.label}${o.consequence ? ` — ${o.consequence}` : ''}. Not used until you confirm it.` };
    }
    if (pack?.formFields?.some(f => f.parameter === p.name)) {
      return { kind: 'none', text: 'Goes into the finish block of the costing form once it and the finish itself are confirmed.' };
    }
    const def = parameterDef(p.name);
    if (def?.group === 'identity' || def?.group === 'geometry' || p.name.startsWith('feature.count.') || p.name === 'hole.diameter' || /^gear\.(teeth|module|faceWidth)$/.test(p.name)) {
      const both = p.alsoFrom?.some(a => a.source === 'cad') || (p.source === 'cad' && p.alsoFrom?.some(a => a.source === 'drawing'));
      return { kind: 'cross-check', text: both ? 'A cross-check of the 3D model: both state the same value.' : 'A cross-check, not a cost input.' };
    }
    return { kind: 'none', text: '' };
  };

  const inputOf = (p: EngineeringParameter): ReviewRow['input'] => {
    const def = parameterDef(p.name);
    const current = typeof p.value === 'object' ? '' : typeof p.value === 'boolean' ? (p.value ? 'yes' : 'no') : String(p.value);
    if (p.candidates?.length) {
      return { kind: 'choice', unit: '', current, choices: p.candidates.map(c => ({ value: String(c.value), label: c.label ?? String(c.value) })) };
    }
    if (def?.valueType === 'flag') return { kind: 'flag', unit: '', current, choices: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] };
    if (def?.valueType === 'number' || def?.valueType === 'object') return { kind: def.valueType === 'number' ? 'number' : 'text', unit: def.unit ?? p.unit ?? '', current, choices: [] };
    return { kind: 'text', unit: '', current, choices: [] };
  };

  const rowOf = (p: EngineeringParameter): ReviewRow => {
    const root = rootOf(p, byId);
    const effect = effectOf(p);
    const inConflict = conflictIds.has(p.id);
    // Confirming a grade without its family leaves the family question open: offer both together.
    const companions = p.name === 'material.grade'
      ? data.parameters.filter(f => f.name === 'material.family' && (f.status === 'extracted' || f.status === 'needs-validation') && rootOf(f, byId).id === root.id).map(f => f.id)
      : [];
    // A value the kernel measured is not the engineer's to confirm or correct here: it is shown as the cross-check it is.
    const open = (p.status === 'extracted' || p.status === 'needs-validation') && p.source !== 'cad';
    const measured = p.source === 'cad';
    return {
      id: p.id, name: p.name, label: parameterLabel(p.name), value: valueText(p), source: sourceWord(p),
      alsoFrom: (p.alsoFrom ?? []).map(a => SOURCE_PLACE[sourceWord(a)]).filter((x, k, arr) => arr.indexOf(x) === k).join(', '),
      where: whereText(p, p.source === 'derived' ? root : undefined),
      ocr: p.method === 'ocr' || root.method === 'ocr',
      status: statusWord(p), rawStatus: p.status, note: p.note ?? '', effect,
      sheet: (p.location ?? root.location)?.sheet ?? null, bbox: (p.location ?? root.location)?.bbox ?? null,
      canConfirm: open && !inConflict, canCorrect: !measured && !inConflict && p.status !== 'rejected',
      canReject: !measured && (open || p.status === 'confirmed' || p.status === 'corrected') && !inConflict,
      canUndo: decided(p) && !!p.history?.length,
      companions, confirmLabel: companions.length ? 'Confirm grade and family' : 'Confirm',
      input: inputOf(p),
      parentId: p.source === 'derived' && p.derivedFrom?.length && byId.has(p.derivedFrom[0]) ? p.derivedFrom[0] : null,
    };
  };

  // Rows: everything a source other than the 3D model states, that has a consumer or is a cross-check. A CAD value
  // appears only as a side of a conflict (or as "also the 3D model" on the drawing's row).
  // …and as a cross-check row when the drawing states the SAME value (the two were merged into one parameter).
  const fromDrawingToo = (p: EngineeringParameter) => !!p.alsoFrom?.some(a => a.source === 'drawing');
  const shown = data.parameters.filter(p => (p.source !== 'cad' || fromDrawingToo(p)) && !notCostedIds.has(p.id));
  const rows = shown.map(rowOf);
  const order = new Map(shown.map((p, k) => [p.id, k]));
  // A derived row directly after the reading it came from.
  const sorted = [...rows].sort((a, b) => {
    const ka = order.get(a.parentId && order.has(a.parentId) ? a.parentId : a.id)!; const kb = order.get(b.parentId && order.has(b.parentId) ? b.parentId : b.id)!;
    return ka !== kb ? ka - kb : (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0) || order.get(a.id)! - order.get(b.id)!;
  });
  base.groups = REVIEW_GROUPS.map(g => ({
    key: g.key, title: g.title, rows: sorted.filter(r => reviewGroupOf(byId.get(r.parentId ?? r.id)?.name ?? r.name) === g.key),
    notes: g.key === 'finish' ? (costing?.formNotes ?? []) : [],
  })).filter(g => g.rows.length || g.notes.length);

  base.conflicts = data.conflicts.map((c: ParameterConflict, index): ConflictView => {
    const first = byId.get(c.sides[0]?.parameterId ?? '');
    const chosen = c.resolution ? byId.get(c.resolution.parameterId) : undefined;
    return {
      index, name: c.name, featureId: c.appliesTo?.featureId ?? '', label: parameterLabel(c.name), why: c.why, open: !c.resolution,
      unit: parameterDef(c.name)?.unit ?? first?.unit ?? '',
      sides: c.sides.map(s => {
        const p = byId.get(s.parameterId);
        return { parameterId: s.parameterId, source: sourceWord(s), value: valueText({ ...s, name: c.name }), where: p ? whereText(p) : '', suggested: c.suggested === s.parameterId, chosen: c.resolution?.parameterId === s.parameterId };
      }),
      resolution: c.resolution
        ? `Settled by ${c.resolution.by}${dayOf(c.resolution.at) ? ` on ${dayOf(c.resolution.at)}` : ''}: ${chosen ? `${valueText(chosen)} (${SOURCE_PLACE[sourceWord(chosen)]})` : 'a typed value'}${c.resolution.reason ? ` — ${c.resolution.reason}` : ''}`
        : '',
      undoId: c.resolution?.parameterId ?? '',
    };
  });

  base.overridden = (costing?.overridden ?? []).map(o => {
    const q = questions.get(o.decisionId);
    return { decisionId: o.decisionId, question: qText(o.decisionId), hand: optionLabel(q, o.handValue).label, parameterId: o.parameterId,
      drawing: byId.has(o.parameterId) ? valueText(byId.get(o.parameterId)!) : String(o.drawingValue) };
  });
  base.missing = data.missing.map(m => ({ label: parameterLabel(m.name), why: m.why }));
  base.notCosted = data.notCosted.flatMap(n => {
    const p = byId.get(n.parameterId);
    return p ? [{ id: p.id, label: parameterLabel(p.name), value: valueText(p), where: [locationText(p.location), methodText(p)].filter(Boolean).join(' · '), why: n.why, status: statusWord(p),
      sheet: p.location?.sheet ?? null, bbox: p.location?.bbox ?? null }] : [];
  });
  base.skipped = (costing?.skipped ?? []).map(s => `${s.op.op} ${'id' in s.op ? s.op.id : s.op.name}: ${s.why}`);
  base.exactIds = [...new Set((costing?.leanings ?? []).map(l => l.parameterId))].filter(id => { const p = byId.get(id); return !!p && exactlyRead(p, byId) && !conflictIds.has(id); });

  const answering = new Set([...(costing?.leanings ?? []).map(l => l.parameterId), ...Object.values(costing?.evidence ?? {}).map(e => e.parameterId)]);
  const used = Object.keys(costing?.answers ?? {}).length + (costing?.formFields.length ?? 0);
  const openConflicts = base.conflicts.filter(c => c.open).length;
  const needs = rows.filter(r => r.rawStatus === 'needs-validation').length;
  base.summary = [
    `${rows.length + base.notCosted.length} reading${rows.length + base.notCosted.length === 1 ? '' : 's'}`,
    `${answering.size} answer${answering.size === 1 ? 's' : ''} a costing question (${used} confirmed${i.pending ? ' — applied at Get cost' : ' and used'})`,
    openConflicts ? `${openConflicts} conflict${openConflicts === 1 ? '' : 's'} to settle` : '',
    needs ? `${needs} need${needs === 1 ? 's' : ''} checking` : '',
    base.missing.length ? `${base.missing.length} expected and not found` : '',
    base.notCosted.length ? `${base.notCosted.length} specified but not in the cost model` : '',
  ].filter(Boolean).join(' · ');
  return base;
}

// ─── HTML ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const STATUS_KEY: Record<StatusWord, string> = {
  Read: 'read', 'Needs checking': 'check', Missing: 'missing', Conflict: 'conflict', Confirmed: 'confirmed', Corrected: 'corrected', Rejected: 'rejected', Inferred: 'inferred',
};

const badge = (cls: string, text: string, key = ''): string => `<span class="dr-badge ${cls}"${key ? ` data-k="${esc(key)}"` : ''}>${esc(text)}</span>`;

function locAttrs(sheet: number | null, bbox: readonly number[] | null): string {
  return sheet != null && bbox ? ` data-dr-sheet="${sheet}" data-dr-bbox="${bbox.map(n => +Number(n).toFixed(1)).join(',')}"` : '';
}

function correctFormHtml(r: ReviewRow): string {
  const name = `${r.label}: ${r.value}`;
  const field = r.input.kind === 'choice' || r.input.kind === 'flag'
    ? `<select class="dr-input" data-dr-field="value" aria-label="Correct value for ${esc(name)}">
         ${r.input.kind === 'choice' ? '<option value="">— choose —</option>' : ''}
         ${r.input.choices.map(c => `<option value="${esc(c.value)}"${c.value === r.input.current ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}
       </select>`
    : `<input class="dr-input" data-dr-field="value" type="${r.input.kind === 'number' ? 'number' : 'text'}"${r.input.kind === 'number' ? ' step="any"' : ''} value="${esc(r.input.current)}" aria-label="Correct value for ${esc(name)}"/>`
      + (r.input.unit ? `<span class="dr-unit">${esc(r.input.unit)}</span>` : '');
  return `<form class="dr-correct" data-dr-form="correct" data-dr-id="${esc(r.id)}" hidden>
      <label class="dr-field"><span>Correct value</span>${field}</label>
      <label class="dr-field"><span>Reason (optional)</span><input class="dr-input dr-input--wide" data-dr-field="reason" type="text" maxlength="200" aria-label="Reason for correcting ${esc(name)}"/></label>
      <button type="submit" class="btn btn-primary btn-sm">Save correction</button>
      <button type="button" class="btn btn-ghost btn-sm" data-dr-act="cancel-correct" data-dr-id="${esc(r.id)}">Cancel</button>
    </form>`;
}

/** Why a reading has its value and status. A long basis (an interpretation rule with its source) folds away. */
function noteHtml(note: string): string {
  if (!note) return '';
  return note.length <= 110 ? `<div class="dr-note">${esc(note)}</div>`
    : `<details class="dr-why"><summary>How it was read</summary><div class="dr-note">${esc(note)}</div></details>`;
}

function rowHtml(r: ReviewRow): string {
  const name = `${r.label}: ${r.value}`;
  const btn = (act: string, text: string, label: string, extra = '') =>
    `<button type="button" class="btn btn-ghost btn-sm dr-btn" data-dr-act="${act}" data-dr-id="${esc(r.id)}"${extra} aria-label="${esc(label)}">${esc(text)}</button>`;
  const actions = [
    r.canConfirm ? btn('confirm', r.confirmLabel, `${r.confirmLabel} — ${name}`, r.companions.length ? ` data-dr-with="${esc(r.companions.join('|'))}"` : '') : '',
    r.canCorrect ? btn('correct', 'Correct', `Correct ${name}`) : '',
    r.canReject && r.rawStatus !== 'rejected' ? btn('reject', 'Reject', `Reject ${name}`) : '',
    r.canUndo ? btn('reopen', 'Undo', `Undo the decision on ${name}`) : '',
  ].join('');
  return `<li class="dr-row${r.parentId ? ' dr-row--derived' : ''}" data-dr-row="${esc(r.id)}" data-status="${STATUS_KEY[r.status]}" tabindex="-1"${locAttrs(r.sheet, r.bbox)}>
    <div class="dr-row-main">
      <span class="dr-label">${esc(r.label)}</span>
      <span class="dr-value">${esc(r.value)}</span>
      ${badge('dr-src', r.source)}${r.alsoFrom ? `<span class="dr-also">also ${esc(r.alsoFrom)}</span>` : ''}
      ${badge('dr-status', r.status, STATUS_KEY[r.status])}
    </div>
    <div class="dr-where">${esc(r.where)}${r.ocr && !/OCR/.test(r.where) ? ' · OCR' : ''}</div>
    ${r.effect.text ? `<div class="dr-effect" data-effect="${r.effect.kind}">${esc(r.effect.text)}</div>` : ''}
    ${noteHtml(r.note)}
    ${actions ? `<div class="dr-row-actions">${actions}</div>` : ''}
    ${r.canCorrect ? correctFormHtml(r) : ''}
  </li>`;
}

function conflictHtml(c: ConflictView): string {
  if (!c.open) {
    return `<li class="dr-conflict dr-conflict--settled">
      <div class="dr-row-main"><span class="dr-label">${esc(c.label)}</span>${badge('dr-status', 'Confirmed', 'confirmed')}</div>
      <div class="dr-where">${esc(c.resolution)}</div>
      ${c.undoId ? `<div class="dr-row-actions"><button type="button" class="btn btn-ghost btn-sm dr-btn" data-dr-act="reopen" data-dr-id="${esc(c.undoId)}" aria-label="Reopen the conflict on ${esc(c.label)}">Reopen</button></div>` : ''}
    </li>`;
  }
  const attrs = `data-dr-conflict="${esc(c.name)}"${c.featureId ? ` data-dr-feature="${esc(c.featureId)}"` : ''}`;
  return `<li class="dr-conflict" ${attrs}>
    <div class="dr-row-main"><span class="dr-label">${esc(c.label)}</span>${badge('dr-status', 'Conflict', 'conflict')}</div>
    <div class="dr-note">${esc(c.why)}</div>
    <ul class="dr-sides">
      ${c.sides.map(s => `<li class="dr-side">
        ${badge('dr-src', s.source)} <span class="dr-value">${esc(s.value)}</span>
        ${s.suggested ? '<span class="dr-suggested">suggested</span>' : ''}
        <span class="dr-where">${esc(s.where)}</span>
        <button type="button" class="btn btn-ghost btn-sm dr-btn" data-dr-act="resolve" ${attrs} data-dr-choose="${esc(s.parameterId)}" aria-label="Use ${esc(s.value)} from ${esc(SOURCE_PLACE[s.source])} for ${esc(c.label)}">Use this value</button>
      </li>`).join('')}
    </ul>
    <form class="dr-correct dr-correct--inline" data-dr-form="resolve" ${attrs}>
      <label class="dr-field"><span>Or type the value</span><input class="dr-input" data-dr-field="value" type="text" aria-label="Type the value for ${esc(c.label)}"/>${c.unit ? `<span class="dr-unit">${esc(c.unit)}</span>` : ''}</label>
      <button type="submit" class="btn btn-ghost btn-sm">Use the typed value</button>
    </form>
  </li>`;
}

/** The panel while the drawing is still being read, or when it could not be. */
function statusOnlyHtml(m: ReviewPanelModel): string {
  if (m.status === 'reading') {
    return `<div class="dr-reading" id="dr-reading" role="status">
      <div class="dr-reading-head"><span id="dr-reading-label">Reading the drawing — its sheets have no selectable text, so they are read by OCR on this server, one drawing at a time.</span>
        <span class="dr-reading-elapsed" id="dr-reading-elapsed" aria-hidden="true"></span></div>
      <div class="cad-progress-bar"><div class="cad-progress-fill is-indeterminate" id="dr-reading-fill"></div></div>
      <div class="dr-where">The costing below does not wait for it: nothing from a drawing is used until you confirm it.</div>
    </div>`;
  }
  return `<div class="dr-failed" role="alert"><strong>The drawing could not be read.</strong> ${esc(m.error)} The costing is unaffected — it uses the 3D model and your answers.</div>`;
}

/** The whole panel. `sheetUrl` is absent in tests; the controller loads the picture. */
export function reviewPanelHtml(m: ReviewPanelModel): string {
  const head = `<div class="dr-head">
      <h3 class="dr-title" id="dr-title">From the drawing</h3>
      <p class="dr-file"><strong>${esc(m.file)}</strong> · ${m.sheets.length} sheet${m.sheets.length === 1 ? '' : 's'} · ${esc(DRAWING_OFFLINE_LINE)} · reader v${esc(m.readerVersion)}${m.ocrReadings ? ` · ${m.ocrReadings} reading${m.ocrReadings === 1 ? '' : 's'} by OCR` : ''}</p>
    </div>`;
  if (m.status !== 'ready') return `<section class="dr-panel" id="cad-drawing-panel" aria-labelledby="dr-title">${head}${statusOnlyHtml(m)}</section>`;

  const openConflicts = m.conflicts.filter(c => c.open);
  const settled = m.conflicts.filter(c => !c.open);
  const ar = m.sheets[0] && m.sheets[0].heightPt > 0 ? +(m.sheets[0].widthPt / m.sheets[0].heightPt).toFixed(4) : 1.414;
  const sheetFig = m.hasSheetPicture && m.sheets.length ? `<figure class="dr-sheet" id="dr-sheet" data-dr-hash="${esc(m.hash)}">
      <div class="dr-sheet-frame" id="dr-sheet-frame" style="--dr-ar:${ar}"><img id="dr-sheet-img" alt="Sheet 1 of ${esc(m.file)}" hidden/><div class="dr-hi" id="dr-hi" hidden></div>
        <p class="dr-sheet-wait" id="dr-sheet-wait">Loading the sheet…</p></div>
      <figcaption class="dr-sheet-cap"><span id="dr-sheet-cap">Sheet 1 — focus a row to see where it was read.</span>
        ${m.sheets.length > 1 ? `<span class="dr-sheet-nav" role="group" aria-label="Sheet">${m.sheets.map(s => `<button type="button" class="btn btn-ghost btn-sm dr-btn" data-dr-act="sheet" data-dr-sheet="${s.sheet}" aria-label="Show sheet ${s.sheet}">${s.sheet}</button>`).join('')}</span>` : ''}
      </figcaption>
    </figure>` : '';

  return `<section class="dr-panel" id="cad-drawing-panel" aria-labelledby="dr-title">
    ${head}
    <p class="dr-summary" id="dr-summary">${esc(m.summary)}</p>
    <div class="dr-top-actions">
      <button type="button" class="btn btn-secondary btn-sm" data-dr-act="confirm-exact"${m.exactIds.length ? '' : ' disabled'} title="Confirms only readings that are exact text, need no checking and answer a costing question — never an OCR reading, never a conflict">Confirm all read exactly (${m.exactIds.length})</button>
      ${m.decisions ? '<button type="button" class="btn btn-ghost btn-sm" data-dr-act="start-again">Start the review again</button>' : ''}
      ${m.pending ? '<button type="button" class="btn btn-secondary btn-sm" data-dr-act="apply" title="Re-run the rules with the review as it stands, without costing">Apply the review</button>' : ''}
      <span class="dr-pending" id="dr-pending" role="status">${m.pending ? 'Review changed — it is applied when you press Get cost (or Apply the review).' : ''}</span>
    </div>
    ${m.restored ? `<p class="dr-restored" role="status">${esc(m.restored)}</p>` : ''}
    ${m.skipped.length ? `<div class="dr-skipped" role="status"><strong>${m.skipped.length} earlier decision${m.skipped.length === 1 ? ' does' : 's do'} not apply to this reading on this route and ${m.skipped.length === 1 ? 'was' : 'were'} not used:</strong><ul>${m.skipped.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
    ${m.warnings.length ? `<details class="dr-warnings"><summary>${m.warnings.length} note${m.warnings.length === 1 ? '' : 's'} from the reader</summary><ul>${m.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
    ${openConflicts.length ? `<div class="dr-block dr-block--conflicts"><h4 class="dr-group-title">Conflicts — choose a value (nothing is chosen for you)</h4><ul class="dr-rows">${openConflicts.map(conflictHtml).join('')}</ul></div>` : ''}
    ${m.overridden.length ? `<div class="dr-block dr-block--conflicts"><h4 class="dr-group-title">Your answer differs from the confirmed drawing</h4><ul class="dr-rows">${m.overridden.map(o => `<li class="dr-conflict">
        <div class="dr-row-main"><span class="dr-label">${esc(o.question)}</span>${badge('dr-status', 'Conflict', 'conflict')}</div>
        <div class="dr-note">You answered <strong>${esc(o.hand)}</strong>; the drawing value you confirmed reads <strong>${esc(o.drawing)}</strong>. Your answer is used.</div>
        <div class="dr-row-actions">
          <button type="button" class="btn btn-ghost btn-sm dr-btn" data-dr-act="use-drawing" data-dr-decision="${esc(o.decisionId)}" aria-label="Use the drawing value for ${esc(o.question)}">Use the drawing's value</button>
          <button type="button" class="btn btn-ghost btn-sm dr-btn" data-dr-act="reject" data-dr-id="${esc(o.parameterId)}" aria-label="Keep my answer and reject the drawing value for ${esc(o.question)}">Keep my answer — reject the reading</button>
        </div></li>`).join('')}</ul></div>` : ''}
    <div class="dr-body">
      ${sheetFig}
      <div class="dr-groups">
        ${m.groups.map(g => `<div class="dr-block"><h4 class="dr-group-title">${esc(g.title)}</h4>
          <ul class="dr-rows">${g.rows.map(rowHtml).join('')}</ul>
          ${g.notes.map(n => `<p class="dr-note">${esc(n)}</p>`).join('')}</div>`).join('')}
        ${!m.groups.length ? '<p class="dr-note">Nothing on this drawing answers a question on this route.</p>' : ''}
        ${m.missing.length ? `<div class="dr-block"><h4 class="dr-group-title">Expected on a drawing for this route — not found</h4>
          <ul class="dr-rows">${m.missing.map(x => `<li class="dr-row" data-status="missing"><div class="dr-row-main"><span class="dr-label">${esc(x.label)}</span>${badge('dr-status', 'Missing', 'missing')}</div>
            <div class="dr-note">${esc(x.why)}. No value is assumed: the question stays open exactly as without a drawing.</div></li>`).join('')}</ul></div>` : ''}
        ${settled.length ? `<div class="dr-block"><h4 class="dr-group-title">Conflicts settled</h4><ul class="dr-rows">${settled.map(conflictHtml).join('')}</ul></div>` : ''}
      </div>
    </div>
    ${m.notCosted.length ? `<details class="dr-notcosted"><summary>Specified on the drawing — not in the cost model yet (${m.notCosted.length})</summary>
      <p class="dr-note">Shown and printed on the report. None of these changes the cost: no rule prices them yet.</p>
      <ul class="dr-rows">${m.notCosted.map(n => `<li class="dr-row dr-row--plain" data-dr-row="${esc(n.id)}" tabindex="-1"${locAttrs(n.sheet, n.bbox)}>
        <div class="dr-row-main"><span class="dr-label">${esc(n.label)}</span><span class="dr-value">${esc(n.value)}</span>${badge('dr-status', n.status, STATUS_KEY[n.status])}</div>
        <div class="dr-where">${esc(n.where)} — ${esc(n.why)}</div></li>`).join('')}</ul></details>` : ''}
  </section>`;
}

/** A chip for an answer the drawing gave (tagged, and it reopens the panel — never a "change" that re-asks the question). */
export function drawingChipsHtml(chips: ReadonlyArray<{ id: string; name: string; value: string; parameterId: string }>): string {
  if (!chips.length) return '';
  return `<div class="cad-answer-chips" role="list" aria-label="Answers confirmed from the drawing">${chips.map(c =>
    `<span class="cad-answer-chip" role="listitem"><span class="cad-answer-k">${esc(c.name)}</span> <strong>${esc(c.value)}</strong> <span class="dr-chip-tag">from drawing</span>`
    + ` <button type="button" class="cad-answer-change" data-dr-open="${esc(c.parameterId)}" aria-label="Review ${esc(c.name)} in the drawing panel">review</button></span>`).join('')}</div>`;
}

export interface QuestionReading { label: string; where: string; sourceText: string; parameterId: string }

/** The line a question card carries when the drawing has an UNCONFIRMED reading for it. Never a tick. */
export function leaningNoteHtml(l: QuestionReading | null): string {
  if (!l) return '';
  return `<div class="dr-leaning">The drawing reads <strong>${esc(l.label)}</strong>${l.sourceText ? ` (“${esc(l.sourceText)}”)` : ''}${l.where ? ` — ${esc(l.where)}` : ''}. Not confirmed, so it is not used: `
    + `<button type="button" class="cad-other-link dr-leaning-link" data-dr-open="${esc(l.parameterId)}">review it in “From the drawing”</button>.</div>`;
}

/**
 * What a question card says about the drawing: a reading the engineer CONFIRMED on the panel that the rules have not
 * been re-run with yet (it answers this question at the next Get cost), else an unconfirmed reading. Neither ticks an
 * option: an option the engineer chooses here is their own answer, and it wins.
 */
export function questionNoteHtml(pending: QuestionReading | null, leaning: QuestionReading | null): string {
  if (pending) {
    return `<div class="dr-leaning dr-leaning--confirmed">Answered from the drawing: <strong>${esc(pending.label)}</strong>${pending.where ? ` (${esc(pending.where)})` : ''} — confirmed by you; `
      + 'it is applied when you press Get cost. Choose an option here only to use a different answer. '
      + `<button type="button" class="cad-other-link dr-leaning-link" data-dr-open="${esc(pending.parameterId)}">Show the reading</button></div>`;
  }
  return leaningNoteHtml(leaning);
}
