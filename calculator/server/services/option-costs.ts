/**
 * The £ beside each option of a step-2 question (CAD to COST Phase C, approved 5 Nov 2026 — the independent review's top
 * recommendation: "show the price consequence on every step-2 option").
 *
 * Every figure is a REAL re-cost of this part through `costMeasuredPart`, the headless chain the compare-routes rows, the
 * bulk runs and the real-parts baseline use, proven equal to the screen to the penny — with the answers Get cost would
 * send and that ONE answer changed. Nothing here is estimated:
 *   - a route option the feasibility screen refuses (route-feasibility.ts, the same screen compare routes uses) is
 *     "not costed: not feasible" with the check it failed;
 *   - an option that opens a question with no suggested answer is "not costed: needs an answer" with the question;
 *   - a question it opens WITH a suggested answer is costed on that suggestion and the option says so (`assumed`) — the
 *     figure is then what Get cost gives once the engineer accepts it, as on a compare-routes row (`costRoute`).
 * A casting or forging route option also carries each feasible PROCESS of that route (`processVariants`, the advisor's
 * own material and shape rules), each costed with the process answered — what "Cost this route" on that compare row
 * gives.
 */
import type { OCCTGeometry } from '../utils/geometry-bridge.js';
import type { ManufacturingRegion } from '../../src/engine/regional-rates.js';
import type { RateLibrary } from '../../src/engine/types.js';
import { costRoute, exactTotal, processVariants, screenCandidates, type CompareRoutesInput } from './route-compare.js';
import { CASTING_PROCESS_CHOICE_ID } from '../../src/engine/cost-input-rules/commodities/casting.js';
import { FORGING_PROCESS_CHOICE_ID } from '../../src/engine/cost-input-rules/commodities/forging.js';
import { COMPOSITES_PROCESS_CHOICE_ID } from '../../src/engine/cost-input-rules/commodities/composites.js';
// The ids are the screen's list (pure data, no runtime imports) — the server prices exactly what the panel can show.
import { PRICED_QUESTION_IDS, ROUTE_QUESTION_IDS } from '../../src/ui/cad-workspace.js';

export { PRICED_QUESTION_IDS, ROUTE_QUESTION_IDS };

/** At most this many options a question are re-costed (a long grade list is a drop-down: only what it shows is sent). */
export const MAX_OPTIONS_A_QUESTION = 12;
/** At most this many questions a request. */
export const MAX_QUESTIONS = 8;

export interface OptionCostQuestion {
  id: string;
  /** The option values to re-cost — the ones the panel shows. */
  values: string[];
  /** The value Get cost would send for this question now (an answer, a ticked suggestion or the costed default). */
  selected: string | null;
}

export interface OptionCostRequest {
  geo: OCCTGeometry;
  filename: string;
  /** The commodity the screen's analysis is on (the leaning route while the process question is open). */
  current: string;
  /** The answers Get cost would send now. */
  answers: Record<string, unknown>;
  region: ManufacturingRegion;
  annualVolume: number;
  programmeYears?: number;
  deliveryTerms?: 'DAP' | 'EXW';
  acknowledge?: string[];
  baseBook: RateLibrary;
  questions: OptionCostQuestion[];
}

export interface ProcessCost { process: string; label: string; total: number | null; reason: string | null; chosen: boolean }

export interface OptionCost {
  value: string;
  /** 'costed' — `total` is the re-cost; otherwise `reason` says why there is no figure. */
  status: 'costed' | 'needs_answer' | 'not_feasible' | 'refused';
  /** £ a part, the engine's own unrounded stack total (rounded once, at display). */
  total: number | null;
  /** total − the selected option's total; null when either is not costed. */
  delta: number | null;
  reason: string | null;
  /** Suggested answers the re-cost took for questions this option opens, as "question → answer". */
  assumed: string[];
  /** The route the option was costed on (a stamping the rules price as laser + brake comes back as sheet_metal_fab). */
  commodity: string | null;
  /** A casting / forging route option: each feasible process of the route, costed with that process answered. */
  processes?: ProcessCost[];
}

export interface QuestionCosts { id: string; selected: string | null; selectedTotal: number | null; options: OptionCost[] }

/** One re-cost: the answers, the route and the result — the unit the route's cache holds. */
export interface OneCost { status: OptionCost['status']; total: number | null; reason: string | null; assumed: string[]; commodity: string | null }

const PROCESS_ID: Record<string, string> = {
  casting: CASTING_PROCESS_CHOICE_ID, cast_and_machine: CASTING_PROCESS_CHOICE_ID, forging: FORGING_PROCESS_CHOICE_ID,
  composites: COMPOSITES_PROCESS_CHOICE_ID,
};

/** The route Get cost costs on with these answers: the answered process question, else the screen's analysis. */
export function routeOf(answers: Record<string, unknown>, current: string): string {
  const r = answers['commodity.route'];
  return typeof r === 'string' && r.trim() ? r.trim() : current;
}

/** Cost the part once with these answers on this route (leanings taken and stated, as a compare row does). */
async function costOnce(req: OptionCostRequest, route: string, answers: Record<string, unknown>,
  cache?: Map<string, OneCost>, cacheKey?: (route: string, answers: Record<string, unknown>) => string): Promise<OneCost> {
  const key = cacheKey?.(route, answers);
  if (key && cache?.has(key)) return cache.get(key)!;
  const i: CompareRoutesInput = {
    geo: req.geo, filename: req.filename, current: route, answers, region: req.region, annualVolume: req.annualVolume,
    ...(req.programmeYears ? { programmeYears: req.programmeYears } : {}),
    ...(req.deliveryTerms ? { deliveryTerms: req.deliveryTerms } : {}),
    acknowledge: req.acknowledge ?? [], baseBook: req.baseBook,
  };
  const assumed: string[] = [];
  const a = { ...answers };
  let out: OneCost;
  try {
    const { r, open } = await costRoute(i, route, a, req.annualVolume, assumed);
    const total = r?.status === 'costed' ? exactTotal(r) : null;
    if (r?.status === 'costed' && total != null) out = { status: 'costed', total, reason: null, assumed, commodity: r.commodity ?? route };
    else if (r?.status === 'needs_answer') {
      out = { status: 'needs_answer', total: null, assumed, commodity: r.commodity ?? route,
        reason: `needs an answer — ${(open.length ? open : (r.questions ?? []).map(q => q.question)).join('; ') || 'a question with no suggested answer'}` };
    } else {
      out = { status: 'refused', total: null, assumed, commodity: r?.commodity ?? route,
        reason: `the costing refused it — ${String(r?.error ?? r?.code ?? 'not costed').slice(0, 240)}` };
    }
  } catch (err) {
    out = { status: 'refused', total: null, assumed, commodity: route, reason: `the costing failed — ${(err as Error).message.slice(0, 200)}` };
  }
  if (key && cache) cache.set(key, out);
  return out;
}

/** The checks a route option failed on the feasibility screen, or null when it passed (or is not screened). */
function notFeasible(req: OptionCostRequest, route: string, answers: Record<string, unknown>): string | null {
  try {
    const screens = screenCandidates({ geo: req.geo, filename: req.filename, current: routeOf(answers, req.current), answers, annualVolume: req.annualVolume, baseBook: req.baseBook });
    const s = screens.find(x => x.route === route);
    if (!s || s.feasible) return null;
    const failed = s.checks.filter(c => !c.pass);
    return `not feasible — ${failed.map(c => `${c.label}: ${c.measured} (limit ${c.limit})`).join('; ') || 'refused by the route screen'}`;
  } catch {
    return null;
  }
}

/**
 * Re-cost the part with each option of each question. The caller bounds the work (the options shown, the questions whose
 * blocking predecessors are answered); `cache` holds single re-costs by (route, answers) across requests.
 */
export async function costOptions(req: OptionCostRequest, cache?: Map<string, OneCost>,
  cacheKey?: (route: string, answers: Record<string, unknown>) => string): Promise<QuestionCosts[]> {
  const out: QuestionCosts[] = [];
  for (const q of req.questions.filter(x => PRICED_QUESTION_IDS.includes(x.id)).slice(0, MAX_QUESTIONS)) {
    const values = [...new Set(q.values.map(String))].slice(0, MAX_OPTIONS_A_QUESTION);
    if (q.selected && !values.includes(q.selected)) values.unshift(q.selected);
    const isRoute = ROUTE_QUESTION_IDS.includes(q.id);
    const options: OptionCost[] = [];
    for (const value of values) {
      // The option Get cost would cost now, on a question nobody has answered (an advisory default): costed with the answer
      // left out, exactly as Get cost sends it — never with the default written in as if it had been answered.
      const answers: Record<string, unknown> = value === q.selected && req.answers[q.id] === undefined
        ? { ...req.answers } : { ...req.answers, [q.id]: value };
      const route = q.id === 'commodity.route' ? value : routeOf(answers, req.current);
      const nf = q.id === 'commodity.route' && value !== q.selected ? notFeasible(req, value, { ...req.answers }) : null;
      if (nf) { options.push({ value, status: 'not_feasible', total: null, delta: null, reason: nf, assumed: [], commodity: value }); continue; }
      const one = await costOnce(req, route, answers, cache, cacheKey);
      const opt: OptionCost = { value, ...one, delta: null };
      // Each feasible process of a casting / forging route, costed with the process answered.
      if (isRoute && PROCESS_ID[route] && one.status === 'costed') {
        const variants = processVariants(route, { geo: req.geo, filename: req.filename, current: route, answers, annualVolume: req.annualVolume, baseBook: req.baseBook });
        if (variants.length > 1) {
          opt.processes = [];
          for (const v of variants) {
            if (v.refusal) { opt.processes.push({ process: v.process, label: v.label, total: null, reason: `not feasible — ${v.refusal}`, chosen: false }); continue; }
            const pc = await costOnce(req, route, { ...answers, [PROCESS_ID[route]]: v.process }, cache, cacheKey);
            opt.processes.push({ process: v.process, label: v.label, total: pc.total, reason: pc.status === 'costed' ? null : pc.reason, chosen: false });
          }
          // The process the rules chose with no process answered is the one whose figure IS the option's.
          const forced = answers[PROCESS_ID[route]];
          for (const p of opt.processes) {
            p.chosen = typeof forced === 'string' ? p.process === forced : p.total != null && one.total != null && Math.abs(p.total - one.total) < 1e-9;
          }
        }
      }
      options.push(opt);
    }
    const sel = options.find(o => o.value === q.selected) ?? null;
    const selTotal = sel?.status === 'costed' ? sel.total : null;
    for (const o of options) o.delta = o.total != null && selTotal != null ? o.total - selTotal : null;
    out.push({ id: q.id, selected: q.selected, selectedTotal: selTotal, options });
  }
  return out;
}
