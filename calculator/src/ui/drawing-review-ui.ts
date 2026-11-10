/**
 * "From the drawing" — state and wiring of the review panel (offline 2D drawing intelligence, Nov 2026).
 *
 * What lives here: the engineer's review DECISIONS for the drawing attached to the current part (a list that is sent
 * to the server with every costing request and replayed there — the server never takes a dataset from this page), the
 * last reading the server returned, and the panel's clicks. A click is applied locally with the very functions the
 * server replays (engineering-data/review-state.ts), so the row changes at once; the COSTING changes only when the
 * rules are re-run with the decisions, which goes through the screen's one path to a cost (cad-flow.ts).
 *
 * main.ts supplies the hooks (who is signed in, how to re-run, the engineer's own answers). No inline handlers:
 * one delegated listener on the panel reads `data-dr-act`.
 */
import type { ConsolidatedEngineeringData, ReviewOp, ParameterValue } from '../engine/engineering-data/index.js';
import { applyReviewOp, answersFromEngineeringData, reviewStateKey, parameterDef, valueText, locationText, methodText } from '../engine/engineering-data/index.js';
import { OverrideError } from '../engine/engineering-data/overrides.js';
import type { Decision } from '../engine/cost-input-rules/types.js';
import { buildReviewPanel, reviewPanelHtml, answerLabel, type DrawingCostingView, type DrawingInfoView, type ReviewPanelModel } from './drawing-review.js';
import { projectStore } from './project-store.js';
import { fmtDuration } from './long-task-progress.js';
import { showToast } from './toast.js';

export interface DrawingReviewHooks {
  /** The signed-in engineer's name, written on every decision. */
  who(): string;
  /** Headers for an authenticated request. */
  authHeaders(): Record<string, string>;
  /** The engineer's own answers (clicked, typed or pinned) — a drawing value never overrides them. */
  handAnswers(): Record<string, unknown>;
  /** The label of a question (for answers already applied, which the open list no longer holds). */
  questionText(id: string): string | undefined;
  /** Holes and bosses the kernel measured (the bound on masked features), when known. */
  measuredMaskable(): number | undefined;
  /** The review changed: redraw what shows drawing answers and schedule the rules re-run. */
  onChange(): void;
  /** Re-run the rules now with the current review (resolves true when the analysis was replaced). */
  rerun(): Promise<boolean>;
  /** The engineer chose the drawing's value over their own answer to this question. */
  dropHandAnswer(decisionId: string): void;
}

interface State {
  info: DrawingInfoView | null;
  commodity: string;
  /** The dataset as the last response returned it (the applied decisions replayed by the server). */
  serverData: ConsolidatedEngineeringData | null;
  serverCosting: DrawingCostingView | null;
  /** serverData with the decisions taken since, applied locally. */
  data: ConsolidatedEngineeringData | null;
  ops: ReviewOp[];
  /** `reviewStateKey` of the decisions the last response was computed with. */
  appliedKey: string;
  appliedCount: number;
  restored: string;
  /** The part this review belongs to (geometry hash, or name + size for a mesh). */
  partKey: string;
  partFile: string;
  restoreTried: boolean;
}

const fresh = (): State => ({ info: null, commodity: '', serverData: null, serverCosting: null, data: null, ops: [], appliedKey: '', appliedCount: 0,
  restored: '', partKey: '', partFile: '', restoreTried: false });

let S: State = fresh();
let hooks: DrawingReviewHooks | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let pollStarted = 0;
let elapsedTimer: ReturnType<typeof setInterval> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let sheetShown = 0;
const sheetUrls = new Map<string, string>();

export function setDrawingReviewHooks(h: DrawingReviewHooks): void { hooks = h; }

/** A new part, a new drawing, or Clear: nothing of the last review is kept on the page. */
export function resetDrawingReview(): void {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  for (const u of sheetUrls.values()) URL.revokeObjectURL(u);
  sheetUrls.clear();
  sheetShown = 0;
  lastRowId = '';
  S = fresh();
}

export const hasDrawing = (): boolean => !!S.info;
export const drawingInfo = (): DrawingInfoView | null => S.info;

/** The decisions as the request carries them. */
export function reviewForRequest(): { ops: ReviewOp[] } { return { ops: [...S.ops] }; }

/** The fields a JSON costing request gains when a drawing is attached (none without one). */
export function drawingRequestFields(): Record<string, unknown> {
  if (!S.info) return {};
  return { drawingHash: S.info.hash, drawingFile: S.info.file, ...(S.ops.length ? { drawingReview: reviewForRequest() } : {}) };
}

/** True when the engineer has taken review decisions the costing has not been re-run with. */
export function reviewChanged(): boolean {
  return !!S.info && reviewStateKey({ schemaVersion: 1, ops: S.ops }) !== S.appliedKey;
}

/** Answers the applied costing took from the drawing (decision id → value) — what the chips show. */
export function appliedDrawingAnswers(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(S.serverCosting?.answers ?? {})) out[k] = String(v);
  return out;
}

/** What the applied costing holds of the drawing, for the reports (never the unapplied local preview). */
export function appliedDrawingState(): { info: DrawingInfoView; data: ConsolidatedEngineeringData; costing: DrawingCostingView; commodity: string } | null {
  return S.info && S.serverData && S.serverCosting ? { info: S.info, data: S.serverData, costing: S.serverCosting, commodity: S.commodity } : null;
}

/** The adapter run on the page's dataset with the questions the server showed it — an exact preview of the next run. */
function localCosting(): DrawingCostingView | null {
  if (!S.data || !S.serverCosting) return S.serverCosting;
  if (!reviewChanged()) return S.serverCosting;
  const cap = hooks?.measuredMaskable();
  const c = answersFromEngineeringData(S.data, S.commodity, {
    decisions: (S.serverCosting.questions ?? []) as unknown as Decision[],
    answered: hooks?.handAnswers() ?? {},
    ...(cap !== undefined ? { measuredMaskableFeatures: cap } : {}),
  });
  const hand = hooks?.handAnswers() ?? {};
  return { ...c, questions: S.serverCosting.questions ?? [], skipped: S.serverCosting.skipped ?? [],
    overridden: c.dropped.filter(d => hand[d.decisionId] !== undefined && /already answered this question by hand/.test(d.why))
      .map(d => ({ decisionId: d.decisionId, parameterId: d.parameterId, drawingValue: d.value, handValue: hand[d.decisionId], why: d.why })) };
}

/** Questions the review as it stands NOW will answer at the next run (confirmed readings, applied or not yet). */
export function pendingDrawingAnswerIds(): Set<string> {
  return new Set(Object.keys(localCosting()?.answers ?? {}));
}

/** A reading the engineer confirmed that will answer this question at the next run (not yet applied by the rules). */
export function pendingDrawingAnswer(decisionId: string): { label: string; where: string; sourceText: string; parameterId: string } | null {
  if (!reviewChanged()) return null;
  const c = localCosting();
  if (!c || !S.data || c.answers[decisionId] === undefined) return null;
  const ev = c.evidence[decisionId];
  const p = S.data.parameters.find(x => x.id === ev?.parameterId);
  const q = c.questions?.find(x => x.id === decisionId);
  const label = answerLabel(q, c.answers[decisionId]).label;
  return { label, where: [locationText(ev?.location ?? p?.location), p ? methodText(p) : ''].filter(Boolean).join(' · '), sourceText: (ev?.sourceText ?? '').slice(0, 80), parameterId: ev?.parameterId ?? '' };
}

/** An unconfirmed reading that fits a question — the note on that question's card. */
export function drawingLeaning(decisionId: string): { label: string; where: string; sourceText: string; parameterId: string } | null {
  const c = localCosting();
  if (!c || !S.data || c.answers[decisionId] !== undefined) return null;
  const l = c.leanings.find(x => x.decisionId === decisionId);
  if (!l) return null;
  const p = S.data.parameters.find(x => x.id === l.parameterId);
  const q = c.questions?.find(x => x.id === decisionId);
  const label = answerLabel(q, l.value).label;
  return { label, where: [locationText(l.location ?? p?.location), p ? methodText(p) : ''].filter(Boolean).join(' · '),
    sourceText: (l.sourceText ?? '').slice(0, 80), parameterId: l.parameterId };
}

/** Chips for the answers the drawing gave to the applied costing. */
export function drawingChips(nameOf: (id: string) => string): Array<{ id: string; name: string; value: string; parameterId: string }> {
  const c = S.serverCosting;
  if (!c) return [];
  return Object.entries(c.answers).map(([id, v]) => {
    const q = c.questions?.find(x => x.id === id);
    return { id, name: nameOf(id), value: answerLabel(q, v).label, parameterId: c.evidence[id]?.parameterId ?? '' };
  });
}

/** The finish figures confirmed off the drawing that the form's finish block takes, with their notes. */
export function drawingFormFields(): { fields: Array<{ fieldId: string; value: number; note: string }>; notes: string[] } {
  return { fields: (S.serverCosting?.formFields ?? []).map(f => ({ fieldId: f.fieldId, value: f.value, note: f.note })), notes: S.serverCosting?.formNotes ?? [] };
}

// ─── Responses ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface DrawingResponseBlock { drawing?: DrawingInfoView; engineeringData?: ConsolidatedEngineeringData | null; drawingCosting?: DrawingCostingView | null }

/**
 * Take the drawing part of an /analyze or /reanalyze response. `sent` is the decision list the request carried; any
 * decision taken while the request was in flight is kept and re-applied on top.
 */
export function onDrawingResponse(resp: DrawingResponseBlock, sent: ReviewOp[], ctx: { commodity: string; partKey: string; partFile: string }): void {
  if (!resp.drawing) { if (S.info) resetDrawingReview(); return; }
  const samePart = S.info?.hash === resp.drawing.hash && S.partKey === ctx.partKey;
  if (!samePart) { const keepTried = false; resetDrawingReview(); S.restoreTried = keepTried; }
  S.info = resp.drawing;
  S.commodity = ctx.commodity;
  S.partKey = ctx.partKey; S.partFile = ctx.partFile;
  S.serverData = resp.engineeringData ?? null;
  S.serverCosting = resp.drawingCosting ?? null;
  S.appliedKey = reviewStateKey({ schemaVersion: 1, ops: sent });
  S.appliedCount = sent.length;
  // Decisions taken after the request left: replay them on the server's dataset.
  const later = samePart ? S.ops.slice(sent.length) : [];
  S.ops = [...sent];
  S.data = S.serverData;
  for (const op of later) {
    try { if (S.data) { S.data = applyReviewOp(S.data, op); S.ops.push(op); } }
    catch (e) { if (!(e instanceof OverrideError)) throw e; }
  }
  if (S.info.status === 'reading') startPolling(); else stopPolling();
  if (S.info.status === 'ready' && !S.restoreTried) { S.restoreTried = true; void restoreSavedReview(); }
}

// ─── Reading in the background (a drawing that needs OCR) ────────────────────────────────────────────────────────────

function stopPolling(): void {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
}

function startPolling(): void {
  if (pollTimer || !S.info?.jobId) return;
  pollStarted = performance.now();
  const jobId = S.info.jobId;
  const tick = async (): Promise<void> => {
    pollTimer = null;
    if (S.info?.jobId !== jobId || S.info.status !== 'reading') return;
    try {
      const res = await fetch(`/api/drawing/jobs/${encodeURIComponent(jobId)}?wait=1`, { headers: hooks?.authHeaders() ?? {} });
      const j = await res.json() as { status?: string; error?: string | null; ahead?: number };
      if (S.info?.jobId !== jobId) return;
      if (res.status === 404 || j.status === 'failed') {
        S.info = { ...S.info, status: 'failed', error: j.error ?? 'The drawing is no longer being read on this server — attach it again.' };
        stopPolling(); hooks?.onChange(); return;
      }
      if (j.status === 'done') {
        stopPolling();
        // The reading is complete: the rules are re-run with it (nothing is confirmed, so the cost does not move).
        const ok = await hooks?.rerun();
        if (!ok && S.info?.jobId === jobId) { S.info = { ...S.info, status: 'failed', error: 'The drawing was read, but the part could not be re-run with it — press Measure part again.' }; hooks?.onChange(); }
        return;
      }
      const label = document.getElementById('dr-reading-label');
      if (label && j.status === 'queued' && (j.ahead ?? 0) > 0) label.textContent = `Waiting to read the drawing — ${j.ahead} scanned drawing${j.ahead === 1 ? ' is' : 's are'} ahead of it (OCR runs one at a time on this server).`;
    } catch { /* the next poll tries again */ }
    pollTimer = setTimeout(() => { void tick(); }, 1500);
  };
  pollTimer = setTimeout(() => { void tick(); }, 600);
  elapsedTimer = setInterval(() => {
    const el = document.getElementById('dr-reading-elapsed');
    if (el) el.textContent = fmtDuration(performance.now() - pollStarted);
  }, 1000);
}

// ─── The review saved with the part (projects table) ───────────────────────────────────────────────────────────────

function userTag(): string {
  let h = 5381;
  for (const ch of hooks?.who() ?? '') h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

/** One saved review a part + drawing + engineer. */
export function reviewProjectId(drawingHash: string, partKey: string, tag: string): string {
  return `dr-${drawingHash.slice(0, 20)}-${partKey.replace(/[^a-z0-9]/gi, '').slice(0, 20) || 'part'}-${tag}`;
}

export const DRAWING_REVIEW_KIND = 'cad_drawing_review';

function saveSoon(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!S.info) return;
    void projectStore.save({
      id: reviewProjectId(S.info.hash, S.partKey, userTag()), kind: DRAWING_REVIEW_KIND,
      name: `${S.partFile || 'part'} + ${S.info.file}`,
      data: { schemaVersion: 1, drawingHash: S.info.hash, drawingFile: S.info.file, cadFile: S.partFile, partKey: S.partKey, readerVersion: S.info.readerVersion,
        commodity: S.commodity, review: reviewForRequest(), savedAt: new Date().toISOString() },
    }).catch(() => { /* the review stays on this page; the next change tries again */ });
  }, 700);
}

/** The same part and drawing opened again: the earlier decisions come back, said in words, and the rules re-run with them. */
async function restoreSavedReview(): Promise<void> {
  if (!S.info || S.ops.length) return;
  const hash = S.info.hash;
  try {
    const id = reviewProjectId(hash, S.partKey, userTag());
    const saved = (await projectStore.list(DRAWING_REVIEW_KIND)).find(p => p.id === id);
    const d = saved?.data as { review?: { ops?: ReviewOp[] }; savedAt?: string; drawingHash?: string } | undefined;
    const ops = Array.isArray(d?.review?.ops) ? d!.review!.ops! : [];
    if (!ops.length || d?.drawingHash !== hash || S.info?.hash !== hash || S.ops.length) return;
    S.ops = [...ops];
    S.restored = `Your earlier review of this drawing was restored: ${ops.length} decision${ops.length === 1 ? '' : 's'}`
      + `${d?.savedAt ? `, saved ${new Date(d.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}. “Start the review again” clears them.`;
    hooks?.onChange();
    await hooks?.rerun();
  } catch { /* no saved review, or the store is unreachable: the review starts empty */ }
}

// ─── The panel ──────────────────────────────────────────────────────────────────────────────────────────────────────

function model(): ReviewPanelModel | null {
  if (!S.info) return null;
  return buildReviewPanel({
    drawing: S.info, data: S.data, costing: localCosting(), commodity: S.commodity, pending: reviewChanged(), restored: S.restored,
    decisions: S.ops.length, questionText: id => hooks?.questionText(id),
  });
}

/** The panel's HTML, or '' when no drawing is attached. */
export function drawingPanelHtml(): string {
  const m = model();
  return m ? reviewPanelHtml(m) : '';
}

/** The row the engineer last acted on: focus returns to it when a re-run redraws the results. */
let lastRowId = '';

function apply(ops: ReviewOp[]): boolean {
  if (!S.data) return false;
  lastRowId = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-dr-row]')?.dataset.drRow ?? lastRowId;
  let data = S.data;
  const done: ReviewOp[] = [];
  for (const op of ops) {
    try { data = applyReviewOp(data, op); done.push(op); }
    catch (e) {
      if (!(e instanceof OverrideError)) throw e;
      showToast(`Not applied: ${e.message}`, 'warning');
    }
  }
  if (!done.length) return false;
  S.data = data;
  S.ops.push(...done);
  S.restored = '';
  saveSoon();
  hooks?.onChange();
  return true;
}

const stamp = (reason?: string): { by: string; at: string; reason?: string } =>
  ({ by: hooks?.who() || 'engineer', at: new Date().toISOString(), ...(reason ? { reason } : {}) });

/** A typed correction as the value the layer takes: a number for a figure, yes / no for a flag, else the text. */
export function typedValue(name: string, text: string): ParameterValue | null {
  const t = text.trim();
  if (!t) return null;
  const def = parameterDef(name);
  if (def?.valueType === 'flag') return /^(yes|true|y)$/i.test(t) ? true : /^(no|false|n)$/i.test(t) ? false : null;
  if (def?.valueType === 'number' || def?.valueType === 'object') {
    const n = Number(t.replace(',', '.'));
    if (Number.isFinite(n)) return n;
    return def.valueType === 'number' ? null : t;
  }
  return t;
}

function focusRow(id: string): void {
  const row = document.querySelector<HTMLElement>(`#cad-drawing-panel [data-dr-row="${CSS.escape(id)}"]`);
  if (!row) return;
  const details = row.closest('details');
  if (details && !details.open) details.open = true;
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row.focus({ preventScroll: true });
}

/** Open the panel on a reading (a chip's "review", a question card's link). */
export function openDrawingRow(parameterId: string): void {
  if (parameterId) focusRow(parameterId);
  else document.getElementById('cad-drawing-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// The sheet picture: fetched with the session (an <img> cannot send it), one object URL a sheet.
async function showSheet(n: number): Promise<void> {
  const img = document.getElementById('dr-sheet-img') as HTMLImageElement | null;
  const wait = document.getElementById('dr-sheet-wait');
  if (!img || !S.info) return;
  const key = `${S.info.hash}:${n}`;
  sheetShown = n;
  let url = sheetUrls.get(key);
  if (!url) {
    try {
      const res = await fetch(`/api/drawing/${S.info.hash}/sheet/${n}`, { headers: hooks?.authHeaders() ?? {} });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
      url = URL.createObjectURL(await res.blob());
      sheetUrls.set(key, url);
    } catch (e) {
      if (wait) wait.textContent = `The sheet cannot be shown: ${e instanceof Error ? e.message : String(e)}`;
      return;
    }
  }
  if (sheetShown !== n) return;
  const now = document.getElementById('dr-sheet-img') as HTMLImageElement | null;
  if (!now) return;
  now.src = url; now.alt = `Sheet ${n} of ${S.info.file}`; now.hidden = false;
  const si = S.info.sheets.find(x => x.sheet === n);
  if (si && si.heightPt > 0) document.getElementById('dr-sheet-frame')?.style.setProperty('--dr-ar', String(+(si.widthPt / si.heightPt).toFixed(4)));
  const w = document.getElementById('dr-sheet-wait'); if (w) w.hidden = true;
  const cap = document.getElementById('dr-sheet-cap'); if (cap) cap.textContent = `Sheet ${n} — focus a row to see where it was read.`;
}

function highlight(row: HTMLElement): void {
  const hi = document.getElementById('dr-hi');
  if (!hi || !S.info) return;
  const sheet = Number(row.dataset.drSheet), box = (row.dataset.drBbox ?? '').split(',').map(Number);
  const info = S.info.sheets.find(s => s.sheet === sheet);
  if (!info || box.length !== 4 || box.some(n => !Number.isFinite(n)) || !(info.widthPt > 0) || !(info.heightPt > 0)) { hi.hidden = true; return; }
  const place = (): void => {
    const pad = 3;
    hi.style.left = `${Math.max(0, (box[0] - pad) / info.widthPt * 100)}%`;
    hi.style.top = `${Math.max(0, (box[1] - pad) / info.heightPt * 100)}%`;
    hi.style.width = `${Math.min(100, (box[2] - box[0] + 2 * pad) / info.widthPt * 100)}%`;
    hi.style.height = `${Math.min(100, (box[3] - box[1] + 2 * pad) / info.heightPt * 100)}%`;
    hi.hidden = false;
    const cap = document.getElementById('dr-sheet-cap');
    const label = row.querySelector('.dr-label')?.textContent ?? '';
    if (cap) cap.textContent = `Sheet ${sheet} — ${label}`;
  };
  if (sheetShown !== sheet) { hi.hidden = true; void showSheet(sheet).then(() => { if (sheetShown === sheet) place(); }); } else place();
}

/** Wire the panel just drawn. Call after every render of the CAD results. */
export function wireDrawingPanel(): void {
  const panel = document.getElementById('cad-drawing-panel');
  if (!panel) return;
  if (S.info?.status === 'reading') { startPolling(); return; }
  const m = model();
  if (m?.hasSheetPicture && m.sheets.length) void showSheet(sheetShown || m.sheets[0].sheet);
  // A re-run redrew the results and focus fell to the page: put it back on the row the engineer was working on.
  if (lastRowId && (!document.activeElement || document.activeElement === document.body)) {
    panel.querySelector<HTMLElement>(`[data-dr-row="${CSS.escape(lastRowId)}"]`)?.focus({ preventScroll: true });
  }

  panel.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-dr-act]');
    if (!btn || !panel.contains(btn)) return;
    const act = btn.dataset.drAct ?? '';
    const id = btn.dataset.drId ?? '';
    switch (act) {
      case 'confirm': {
        const also = (btn.dataset.drWith ?? '').split('|').filter(Boolean);
        apply([...also, id].map(x => ({ op: 'confirm' as const, id: x, ...stamp() })));
        break;
      }
      case 'reject': apply([{ op: 'reject', id, ...stamp() }]); break;
      case 'reopen': apply([{ op: 'reopen', id, ...stamp() }]); break;
      case 'correct': {
        const form = panel.querySelector<HTMLElement>(`form[data-dr-form="correct"][data-dr-id="${CSS.escape(id)}"]`);
        if (form) { form.hidden = false; form.querySelector<HTMLElement>('[data-dr-field="value"]')?.focus(); }
        break;
      }
      case 'cancel-correct': {
        const form = btn.closest<HTMLElement>('form');
        if (form) form.hidden = true;
        panel.querySelector<HTMLElement>(`[data-dr-act="correct"][data-dr-id="${CSS.escape(id)}"]`)?.focus();
        break;
      }
      case 'resolve':
        apply([{ op: 'resolve', name: btn.dataset.drConflict ?? '', ...(btn.dataset.drFeature ? { featureId: btn.dataset.drFeature } : {}), choose: btn.dataset.drChoose ?? '', ...stamp() }]);
        break;
      case 'confirm-exact': {
        const ids = model()?.exactIds ?? [];
        if (ids.length) apply(ids.map(x => ({ op: 'confirm' as const, id: x, ...stamp('read exactly — confirmed together') })));
        break;
      }
      case 'apply':
        void hooks?.rerun();
        break;
      case 'start-again':
        S.ops = []; S.restored = ''; saveSoon();
        hooks?.onChange();
        void hooks?.rerun();
        break;
      case 'use-drawing':
        hooks?.dropHandAnswer(btn.dataset.drDecision ?? '');
        break;
      case 'sheet': { const hi = document.getElementById('dr-hi'); if (hi) hi.hidden = true; void showSheet(Number(btn.dataset.drSheet)); break; }
      default: break;
    }
  });

  panel.addEventListener('submit', e => {
    const form = (e.target as HTMLElement).closest<HTMLFormElement>('form[data-dr-form]');
    if (!form) return;
    e.preventDefault();
    const text = (form.querySelector<HTMLInputElement | HTMLSelectElement>('[data-dr-field="value"]')?.value ?? '').trim();
    const reason = (form.querySelector<HTMLInputElement>('[data-dr-field="reason"]')?.value ?? '').trim();
    if (form.dataset.drForm === 'correct') {
      const id = form.dataset.drId ?? '';
      const p = S.data?.parameters.find(x => x.id === id);
      const value = p ? typedValue(p.name, text) : null;
      if (value === null) { showToast('Type the corrected value — or use Reject to say the reading is wrong without giving one.', 'warning'); return; }
      apply([{ op: 'correct', id, value, ...stamp(reason || undefined) }]);
    } else {
      const name = form.dataset.drConflict ?? '';
      const value = typedValue(name, text);
      if (value === null) { showToast('Type the value to use, or choose one of the two sides.', 'warning'); return; }
      apply([{ op: 'resolve', name, ...(form.dataset.drFeature ? { featureId: form.dataset.drFeature } : {}), value, ...stamp() }]);
    }
  });

  const onRow = (e: Event): void => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-dr-row][data-dr-bbox]');
    if (row) highlight(row);
  };
  panel.addEventListener('focusin', onRow);
  panel.addEventListener('mouseover', onRow);
}

/** Redraw the panel in place (after a decision), keeping the row the engineer was on. */
export function redrawDrawingPanel(): void {
  const panel = document.getElementById('cad-drawing-panel');
  if (!panel) return;
  const active = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-dr-row]')?.dataset.drRow
    ?? (document.activeElement as HTMLElement | null)?.dataset?.drId ?? '';
  const openDetails = !!panel.querySelector<HTMLDetailsElement>('details.dr-notcosted')?.open;
  const html = drawingPanelHtml();
  if (!html) { panel.remove(); return; }
  panel.outerHTML = html;
  const nd = document.querySelector<HTMLDetailsElement>('#cad-drawing-panel details.dr-notcosted');
  if (nd && openDetails) nd.open = true;
  wireDrawingPanel();
  if (active) document.querySelector<HTMLElement>(`#cad-drawing-panel [data-dr-row="${CSS.escape(active)}"]`)?.focus({ preventScroll: true });
}

/** For the reports' reproducibility stamp: "drawing reader v1.0.0 · bracket.pdf 3fa2c1d9". */
export function drawingStampPart(): string {
  return S.info ? `drawing reader v${S.info.readerVersion} · ${S.info.file} ${S.info.hash.slice(0, 8)}` : '';
}

/** A value as the panel prints it — exported for the answer chips. */
export { valueText };
