/**
 * The route comparison and the volume ladder in every CAD report (Part1 review phase 3, Nov 2026).
 *
 * The core report's section 6a (other routes) and section 4's volume line print the comparison the screen's "Compare
 * routes" draws — and printed "not run on this costing" whenever nobody had pressed it. At export, a CAD costing with no
 * comparison for its current inputs now runs the SAME request the screen runs (`/api/cad/compare-routes` with the
 * costing's answers, region, volume, programme life and terms), waits for it under the long-task progress (indeterminate
 * bar, elapsed time, Cancel — never a percentage the server did not report), and the caller stores the result where the
 * screen, the PDF and the workbook all read it. When it cannot run — blocking questions open, no measured geometry on the
 * server, a server error, a timeout, Cancel — the report gets ONE line saying why instead (`routeComparisonNote`).
 *
 * No AI and no arithmetic here: the server costs every route (route-compare.ts); this module only asks and waits.
 */
import { startLongTask, fmtAllowance } from './long-task-progress.js';
import { routeComparisonExport, type RouteComparisonExport } from './cad-workspace.js';

/** What the screen's Compare routes sends (main.ts `loadRouteComparison`) — the costing's own inputs. */
export interface RouteCompareState {
  geometryHash: string | null;
  filename: string;
  current: string;
  decisionAnswers: Record<string, string>;
  acknowledged: string[];
  /** As the screen sends it (the CAD field's text; the server reads it with parseFloat). */
  annualVolume: number | string;
  region: string;
  programmeYears: number | null;
  deliveryTerms: 'DAP' | 'EXW';
  /** The engineer's pinned grade, when the material is locked. */
  material: string | null;
  blankHash: string | null;
  /** The band the cost card shows — the reference row prints it. */
  referenceBand: { p10: number; p50: number; p90: number; plusMinusPct: number; confidence: string } | null;
}

/** The request body, field for field as the screen's Compare routes builds it. */
export function routeCompareBody(s: RouteCompareState): Record<string, unknown> {
  const body: Record<string, unknown> = {
    geometryHash: s.geometryHash, filename: s.filename, current: s.current, decisionAnswers: s.decisionAnswers,
    acknowledged: s.acknowledged, annualVolume: s.annualVolume, region: s.region,
  };
  if (s.programmeYears) body['programmeYears'] = s.programmeYears;
  if (s.deliveryTerms === 'EXW') body['deliveryTerms'] = 'EXW';
  if (s.material) body['material'] = s.material;
  if (s.blankHash) body['blankHash'] = s.blankHash;
  if (s.referenceBand) body['referenceBand'] = s.referenceBand;
  return body;
}

/** What makes two comparisons the same: every input the server costs on (the band only labels the reference row). */
export function routeCompareKey(body: Record<string, unknown>): string {
  const { referenceBand: _band, ...rest } = body;
  const answers = rest['decisionAnswers'] as Record<string, string> | undefined;
  return JSON.stringify({ ...rest, decisionAnswers: answers ? Object.fromEntries(Object.entries(answers).sort(([a], [b]) => a.localeCompare(b))) : answers,
    acknowledged: [...((rest['acknowledged'] as string[] | undefined) ?? [])].sort() });
}

/** How long an export waits for the comparison: 7 volumes × the feasible routes, each a full headless costing. */
export const REPORT_ROUTES_TIMEOUT_MS = 180_000;

const LEAD = 'Other routes and the volume ladder are not in this report';
/** The one line a report prints in place of section 6a and the volume line, by why the comparison is missing. */
export const ROUTES_NOTE = {
  blocking: (n: number, first: string) => `${LEAD}: ${n} blocking question${n === 1 ? '' : 's'} open (${first}) — answer ${n === 1 ? 'it' : 'them'} and export again.`,
  noGeometry: `${LEAD}: the measured part is no longer on the server — measure the part again and export again.`,
  error: (msg: string) => `${LEAD}: the server could not cost the routes (${msg}).`,
  timeout: (ms: number) => `${LEAD}: the comparison did not finish within ${fmtAllowance(ms)}.`,
  cancelled: `${LEAD}: the comparison was cancelled at export.`,
} as const;

export interface ReportRoutes { comparison: RouteComparisonExport | null; key: string | null; note: string | null }

export interface EnsureReportRoutesArgs {
  /** A CAD costing (the comparison is costed on its measured part) — anything else returns nothing to add. */
  costedFromCad: boolean;
  /** What the caller holds: the comparison the screen or an earlier export drew, and the inputs it was run on. A
   *  comparison with no key was drawn by the screen's Compare routes for the current costing and is used as it is. */
  have: { comparison: RouteComparisonExport | null; key: string | null };
  state: RouteCompareState;
  /** Open blocking questions (their wording), when any. */
  blockingOpen: string[];
  /** The headline the reference row must equal, and the commodity labels the rows print. */
  headline: number | null;
  labels: Record<string, string>;
  authHeader: Record<string, string>;
  fetchImpl?: typeof fetch;
  doc?: Document;
  timeoutMs?: number;
}

/**
 * The comparison a report prints: the one held when it matches the costing's inputs, else a fresh run (with the progress
 * shown), else a note saying why there is none. Never throws.
 */
export async function ensureReportRouteComparison(a: EnsureReportRoutesArgs): Promise<ReportRoutes> {
  if (!a.costedFromCad) return { comparison: null, key: null, note: null };
  const body = routeCompareBody(a.state);
  const key = routeCompareKey(body);
  // the comparison held is this costing's: drawn for these inputs (or by the screen, no key), its reference at the headline
  const sameHeadline = a.have.comparison?.headline == null || a.headline == null || Math.abs(a.have.comparison.headline - a.headline) <= 1e-9;
  if (a.have.comparison && (a.have.key === null || a.have.key === key) && sameHeadline) return { comparison: a.have.comparison, key: a.have.key, note: null };
  if (a.blockingOpen.length) return { comparison: null, key: null, note: ROUTES_NOTE.blocking(a.blockingOpen.length, a.blockingOpen[0]) };
  if (!a.state.geometryHash) return { comparison: null, key: null, note: ROUTES_NOTE.noGeometry };
  const doFetch = a.fetchImpl ?? fetch;
  const timeoutMs = a.timeoutMs ?? REPORT_ROUTES_TIMEOUT_MS;
  const ctl = new AbortController();
  let why: 'timeout' | 'cancelled' | null = null;
  const timer = setTimeout(() => { why = 'timeout'; ctl.abort(); }, timeoutMs);
  const progress = showRoutesProgress(a.doc, timeoutMs, () => { why = 'cancelled'; ctl.abort(); });
  try {
    const res = await doFetch('/api/cad/compare-routes', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...a.authHeader }, body: JSON.stringify(body), signal: ctl.signal,
    });
    const data = await res.json() as { comparison?: Parameters<typeof routeComparisonExport>[0]; error?: string };
    if (!res.ok || !data.comparison) {
      if (res.status === 400 && /geometry/i.test(data.error ?? '')) return { comparison: null, key: null, note: ROUTES_NOTE.noGeometry };
      return { comparison: null, key: null, note: ROUTES_NOTE.error(data.error ?? `HTTP ${res.status}`) };
    }
    return { comparison: routeComparisonExport(data.comparison, { current: a.state.current, headline: a.headline, labels: a.labels }), key, note: null };
  } catch (err) {
    if (why === 'timeout') return { comparison: null, key: null, note: ROUTES_NOTE.timeout(timeoutMs) };
    if (why === 'cancelled') return { comparison: null, key: null, note: ROUTES_NOTE.cancelled };
    return { comparison: null, key: null, note: ROUTES_NOTE.error(err instanceof Error ? err.message : String(err)) };
  } finally {
    clearTimeout(timer);
    progress?.done();
  }
}

const ID = 'cv-report-routes';

/** The progress strip at the top of the result while the export waits (the re-cost placeholder's look). */
function showRoutesProgress(doc: Document | undefined, timeoutMs: number, onCancel: () => void): { done(): void } | null {
  const d = doc ?? (typeof document !== 'undefined' ? document : undefined);
  if (!d) return null;
  const panel = d.querySelector<HTMLElement>('.results-panel') ?? d.body;
  if (!panel) return null;
  d.getElementById(ID)?.remove();
  const box = d.createElement('div');
  box.id = ID;
  box.className = 'cv-recost';
  box.setAttribute('role', 'status');
  box.innerHTML = `<div class="cv-recost-h"><span id="${ID}-label">Costing the other routes for the report…</span>`
    + `<span class="cv-recost-elapsed" id="${ID}-elapsed"></span></div>`
    + `<div class="cv-recost-bar" id="${ID}-bar"><div class="cad-progress-fill cv-recost-fill is-indeterminate" id="${ID}-fill"></div></div>`
    + `<p class="cv-recost-note">The report prints the routes the screen's Compare routes shows: the part costed on each feasible route `
    + `and at 5,000–500,000 a year. The server allows ${fmtAllowance(timeoutMs)}.</p>`
    + `<button type="button" class="btn btn-ghost btn-sm" id="${ID}-cancel">Cancel — export without the routes</button>`;
  panel.insertBefore(box, panel.firstChild);
  const wrap = d.getElementById(`${ID}-bar`), fill = d.getElementById(`${ID}-fill`), label = d.getElementById(`${ID}-label`);
  const task = wrap && fill && label
    ? startLongTask({ wrap, fill, label, elapsed: d.getElementById(`${ID}-elapsed`), cancel: d.getElementById(`${ID}-cancel`) as HTMLButtonElement | null }, onCancel)
    : null;
  task?.waiting(label?.textContent ?? '');
  return { done() { task?.end(); box.remove(); } };
}
