/**
 * Compare routes — D5 of CAD to COST v2 (decided 28 Oct 2026; docs/ui/cad-to-cost-redesign-2026-10.md).
 *
 * A cost engineer's first challenge to a forging quote is "what if it were cast?". This costs the SAME measured part on
 * every candidate route through `costMeasuredPart` — the headless chain the bulk runs and the real-parts baseline use,
 * proven equal to the screen to the penny — with the engineer's answers carried over. Nothing is estimated here: a
 * route that needs an answer nobody has given is assumed only when its question shows a leaning (and the row says
 * so), otherwise the row stops and names the question. A route the sanity checks refuse says which check.
 */
import type { OCCTGeometry } from '../utils/geometry-bridge.js';
import type { ManufacturingRegion } from '../../src/engine/regional-rates.js';
import type { RateLibrary } from '../../src/engine/types.js';
import { costMeasuredPart, type BulkPartResult } from './bulk-run.js';
import { specForCommodity } from '../../src/engine/cost-input-rules/index.js';
import { inferCommodity } from '../../src/engine/cost-input-rules/derive/commodity.js';
import { COMMODITY_FAMILIES, MATERIAL_FAMILY_DECISION_ID } from '../../src/engine/cost-input-rules/derive/material.js';
import { inMaterialScope } from '../../src/engine/material-scope.js';
import { FINISH_PREFIX_BY_COMMODITY } from '../../src/engine/surface-finish-routes.js';
import type { RuleContext } from '../../src/engine/cost-input-rules/types.js';

/** Routes a cost engineer weighs against each other for the same metal part. */
const ALTERNATIVES: Record<string, string[]> = {
  forging: ['casting', 'cast_and_machine', 'machining'],
  casting: ['cast_and_machine', 'forging', 'machining'],
  cast_and_machine: ['casting', 'forging', 'machining'],
  machining: ['cast_and_machine', 'forging', 'casting'],
  sheet_metal: ['sheet_metal_fab'],
  sheet_metal_fab: ['sheet_metal'],
};

/** Answers that pick the route itself — each row forces its own. */
const ROUTE_ANSWER_IDS = ['commodity.route', 'commodity.thinWallRoute'];

export interface RouteRow {
  /** The route asked for. */
  route: string;
  /** The route costed — a stamping the rules price cheaper as laser + brake comes back as sheet_metal_fab. */
  commodity: string | null;
  status: BulkPartResult['status'];
  total: number | null;
  toolingPerPart: number | null;
  /** Answers this row assumed from a question's visible leaning, as "question → option". */
  assumed: string[];
  /** Questions this route asks that nobody has answered and that have no leaning. */
  openQuestions: string[];
  /** Answers carried from the costing that this route cannot use, and what it did instead. */
  notes: string[];
  /** Why a route was refused (a sanity check or no rules). */
  refusal: string | null;
}

export interface CompareRoutesInput {
  geo: OCCTGeometry;
  filename: string;
  /** The costing's commodity — its row is the reference. */
  current: string;
  answers: Record<string, unknown>;
  region: ManufacturingRegion;
  annualVolume: number;
  programmeYears?: number;
  acknowledge?: string[];
  baseBook: RateLibrary;
}

/** The routes worth comparing: the process question's own options (when the shape left it open), else the table. */
export function candidateRoutes(i: Pick<CompareRoutesInput, 'geo' | 'filename' | 'current' | 'answers' | 'annualVolume' | 'baseBook'>): string[] {
  const answers = { ...i.answers };
  for (const id of ROUTE_ANSWER_IDS) delete answers[id];
  const verdict = inferCommodity({
    geo: i.geo, geometryQuality: 'occt', commodity: 'machining', commoditySource: 'inferred',
    annualVolume: i.annualVolume, filename: i.filename, answers, rates: i.baseBook,
  } as RuleContext);
  const fromQuestion = verdict.decision ? verdict.decision.options.map(o => String(o.value)) : [];
  // A route that cannot be made from the metal the engineer named is not an alternative (a steel shaft was offered
  // rubber and polymer extrusion from the shape question's fill ladder).
  const family = typeof i.answers[MATERIAL_FAMILY_DECISION_ID] === 'string' ? i.answers[MATERIAL_FAMILY_DECISION_ID] as string : null;
  // Rubber and composites buy a compound or a laminate, not one of these families; a gear is cut from metal.
  const makesFamily = (r: string) => !family
    || (COMMODITY_FAMILIES[r] ? (COMMODITY_FAMILIES[r] as string[]).includes(family) : r === 'gear' && family !== 'plastic');
  const out = [i.current, ...fromQuestion, ...(ALTERNATIVES[i.current] ?? [])]
    .filter((r, k, a) => a.indexOf(r) === k && !!specForCommodity(r) && (r === i.current || makesFamily(r)));
  return out.slice(0, 5);
}

export async function compareRoutes(i: CompareRoutesInput, routes = candidateRoutes(i)): Promise<RouteRow[]> {
  const rows: RouteRow[] = [];
  for (const route of routes) {
    const answers: Record<string, unknown> = { ...i.answers };
    for (const id of ROUTE_ANSWER_IDS) delete answers[id];
    const notes: string[] = [];
    // A grade is bought on one route's scope: a ductile-iron casting grade is not a forging billet.
    const grade = typeof answers['material.grade'] === 'string' ? answers['material.grade'] as string : null;
    if (grade && route !== i.current) {
      const cat = i.baseBook.materials.find(m => m.id === grade)?.category ?? '';
      if (!inMaterialScope(route, cat)) {
        delete answers['material.grade'];
        notes.push(`grade ${grade} is not bought on this route — its representative grade for the same metal is costed`);
      }
    }
    const finish = answers['service.finish'];
    if (finish !== undefined && finish !== 'none' && !FINISH_PREFIX_BY_COMMODITY[route]) {
      notes.push('the finish answered is not modelled on this route — costed bare');
    }
    const assumed: string[] = [];
    let open: string[] = [];
    let r: BulkPartResult | null = null;
    for (let pass = 0; pass < 5; pass++) {
      r = await costMeasuredPart(
        i.geo, i.filename,
        { partNumber: i.filename, file: i.filename, commodity: route, annualVolume: i.annualVolume },
        answers, i.region,
        { annualVolume: i.annualVolume, ...(i.programmeYears ? { programmeYears: i.programmeYears } : {}),
          acknowledge: i.acknowledge ?? [] },
        i.baseBook,
        { partNumber: i.filename, file: i.filename, status: 'error' },
      );
      if (r.status !== 'needs_answer') break;
      open = [];
      let progressed = false;
      for (const q of r.questions ?? []) {
        const lean = q.options.find(o => o.leaning);
        if (lean && answers[q.id] === undefined) {
          answers[q.id] = lean.value;
          assumed.push(`${q.question} → ${lean.label}`);
          progressed = true;
        } else {
          open.push(q.question);
        }
      }
      if (!progressed) break;
    }
    const costed = r?.status === 'costed';
    rows.push({
      route,
      commodity: r?.commodity ?? null,
      status: r?.status ?? 'error',
      total: costed && r?.total != null ? r.total : null,
      toolingPerPart: costed && r?.breakdown?.tooling != null ? Number(r.breakdown.tooling) : null,
      assumed,
      openQuestions: r?.status === 'needs_answer' ? open : [],
      notes,
      refusal: r && (r.status === 'refused' || r.status === 'error') ? (r.error ?? r.code ?? 'refused') : null,
    });
  }
  // A route the rules re-price as another one already on the table is the same costing — say so on that row.
  return rows.filter(row => {
    if (!row.commodity || row.commodity === row.route) return true;
    const twin = rows.find(o => o.route === row.commodity);
    if (!twin) return true;
    twin.notes.push(`${row.route.replace(/_/g, ' ')} was also priced: the rules choose this route at this volume`);
    return false;
  });
}
