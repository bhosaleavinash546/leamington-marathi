/**
 * Compare routes — D5 of CAD to COST v2 (decided 28 Oct 2026), rebuilt in the compare-routes review (Oct 2026,
 * docs/cad/compare-routes-review-2026-10.md).
 *
 * A cost engineer's first challenge to a forging quote is "what if it were cast?". This costs the SAME measured part on
 * every route that can make it — in its own material family, to the same finished scope — through `costMeasuredPart`,
 * the headless chain the bulk runs and the real-parts baseline use, proven equal to the screen to the penny, with the
 * engineer's answers carried over.
 *
 * What a row carries, so the arithmetic can be checked line by line:
 *   - the 8 buckets and whether they add to the total (`reconciles`);
 *   - the material: net kg, kg bought, utilisation, the grade costed;
 *   - the tooling: the one-off investment, what it is spread over, and the £ a part;
 *   - every operation: machine class, cycle, £ process and £ labour;
 *   - the feasibility checks the route passed, with their sources, and any caveat;
 *   - the same route re-costed on a volume ladder, from which the crossover with the costing's route is read.
 *
 * Nothing is estimated here: a route that needs an answer nobody has given is assumed only when its question shows a
 * leaning (and the row says so), otherwise the row stops and names the question. A route the screen refuses is listed
 * with the check it failed and its source, and is not costed. The crossover volume is interpolated between two real
 * re-costs, never from a straight-line formula — tooling, batch sizes and cavitation all move with volume.
 */
import type { OCCTGeometry } from '../utils/geometry-bridge.js';
import type { ManufacturingRegion } from '../../src/engine/regional-rates.js';
import type { RateLibrary } from '../../src/engine/types.js';
import { costMeasuredPart, type BulkPartResult } from './bulk-run.js';
import { specForCommodity } from '../../src/engine/cost-input-rules/index.js';
import { inMaterialScope } from '../../src/engine/material-scope.js';
import { POLYMER_TAXONOMIES } from '../../src/engine/polymer-material-taxonomy.js';
import { FINISH_PREFIX_BY_COMMODITY } from '../../src/engine/surface-finish-routes.js';
import {
  screenRoutes, materialFamilyOf, familyOfCategory, COMPARISON_PRINCIPLE, type FeasibilityCheck, type RouteScreen,
} from '../../src/engine/route-feasibility.js';

/** Material answers that name a grade on ONE route's scope (an alloy code is only meaningful to aluminium extrusion). */
const MATERIAL_ANSWER_IDS = ['material.grade', 'material.resin', 'material.elastomer', 'material.laminate'];

/** Answers that pick the route itself — each row forces its own. */
const ROUTE_ANSWER_IDS = ['commodity.route', 'commodity.thinWallRoute'];

/** The most routes costed in one comparison (the costing's own included). */
export const MAX_COSTED_ROUTES = 6;

/** The volumes every costed route is re-costed at, parts a year. The costing's own volume is added when not on it. */
export const VOLUME_LADDER = [5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000] as const;

export interface RouteMaterial {
  materialId: string | null;
  /** The grade's name in the book. */
  label: string;
  netKg: number | null;
  boughtKg: number | null;
  utilisation: number | null;
}

export interface RouteTooling {
  /** The one-off investment, £. */
  investment: number;
  /** Parts it is spread over (annual × programme years, or the life the rules set). */
  amortisedOver: number;
  items: Array<{ label: string; gbp: number }>;
}

export interface RouteOperation {
  name: string;
  /** The machine CLASS (never a library id). */
  machine: string;
  cycleMin: number;
  processCost: number;
  labourCost: number;
  bench: boolean;
}

export interface RouteRow {
  /** The route asked for. */
  route: string;
  /** The route costed — a stamping the rules price cheaper as laser + brake comes back as sheet_metal_fab. */
  commodity: string | null;
  status: BulkPartResult['status'];
  total: number | null;
  toolingPerPart: number | null;
  /** The 8 buckets, £ a part. */
  breakdown: Record<string, number> | null;
  /** The buckets add to the total within half a penny. */
  reconciles: boolean | null;
  material: RouteMaterial | null;
  tooling: RouteTooling | null;
  operations: RouteOperation[] | null;
  /** The feasibility checks this route passed (and, on the costing's own route, failed) with their sources. */
  checks: FeasibilityCheck[];
  caveats: string[];
  /** Answers this row assumed from a question's visible leaning, as "question → option". */
  assumed: string[];
  /** Questions this route asks that nobody has answered and that have no leaning. */
  openQuestions: string[];
  /** Answers carried from the costing that this route cannot use, and what it did instead. */
  notes: string[];
  /** Why a route was refused by the costing chain (a sanity check or no rules). */
  refusal: string | null;
  /** The same route at each ladder volume (null where it needed an answer or was refused there). */
  byVolume: Array<{ volume: number; total: number | null; note: string | null }>;
}

export interface RouteCrossover {
  route: string;
  /** The volume at which the route's cost equals the costing's own, interpolated between two re-costs; null when it never crosses on the ladder. */
  atVolume: number | null;
  /** True when the route is the cheaper one ABOVE the crossover. */
  cheaperAbove: boolean | null;
  text: string;
}

export interface RouteComparison {
  principle: string;
  rows: RouteRow[];
  /** Routes the screen refused, each with the checks it failed. */
  excluded: Array<{ route: string; reasons: FeasibilityCheck[] }>;
  ladder: number[];
  crossovers: RouteCrossover[];
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
  /** Re-cost every route on the volume ladder (default true). */
  ladder?: boolean;
}

type ScreenArgs = Pick<CompareRoutesInput, 'geo' | 'filename' | 'current' | 'answers' | 'annualVolume' | 'baseBook'>;

/** The feasibility screen of every comparable route for this part, the costing's own first. */
export function screenCandidates(i: ScreenArgs): RouteScreen[] {
  const fam = materialFamilyOf(i.answers, i.baseBook);
  return screenRoutes(i.current, { geo: i.geo, filename: i.filename, family: fam.family, annualVolume: i.annualVolume })
    .filter(s => !!specForCommodity(s.route));
}

/** The routes worth costing: the costing's own, then every route the screen passes, at most MAX_COSTED_ROUTES. */
export function candidateRoutes(i: ScreenArgs): string[] {
  return screenCandidates(i).filter(s => s.feasible).map(s => s.route).slice(0, MAX_COSTED_ROUTES);
}

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

/**
 * The same POLYMER on another plastics route: an ABS thermoforming sheet compared as a moulding is costed in the
 * moulding's ABS grade, not left at "which resin?" — the assumption is stated on the row. Null when the route has no
 * grade of that polymer.
 */
export function samePolymerGrade(fromId: string, toRoute: string, book: RateLibrary): { id: string; label: string; polymer: string } | null {
  const polymer = Object.values(POLYMER_TAXONOMIES).map(t => t.facts(fromId)?.polymer).find(Boolean);
  const tax = POLYMER_TAXONOMIES[toRoute];
  if (!polymer || !tax) return null;
  for (const m of book.materials) {
    if (!inMaterialScope(toRoute, m.category)) continue;
    const f = tax.facts(m.id);
    if (f?.polymer === polymer) return { id: m.id, label: m.grade, polymer };
  }
  return null;
}

function materialOf(r: BulkPartResult, book: RateLibrary): RouteMaterial | null {
  const rm = r.trace?.drivers?.rawMaterial;
  if (!rm) return null;
  const net = Number.isFinite(rm.netWeightKg) ? rm.netWeightKg : null;
  const util = Number.isFinite(rm.materialUtilization) && rm.materialUtilization > 0 ? rm.materialUtilization : null;
  const m = book.materials.find(x => x.id === rm.materialId);
  return {
    materialId: rm.materialId ?? null,
    label: m?.grade ?? rm.materialId ?? 'material',
    netKg: net != null ? round(net, 3) : null,
    boughtKg: net != null && util != null ? round(net / util, 3) : null,
    utilisation: util != null ? round(util, 3) : null,
  };
}

function toolingOf(r: BulkPartResult): RouteTooling | null {
  const t = r.trace?.drivers?.tooling;
  if (!t) return null;
  return {
    investment: round(t.totalToolingCost ?? 0, 2),
    amortisedOver: Math.round(t.amortizationVolume ?? 0),
    items: (t.items ?? []).map(x => ({ label: x.label, gbp: round(x.gbp, 2) })),
  };
}

function operationsOf(r: BulkPartResult, book: RateLibrary): RouteOperation[] | null {
  const ops = r.trace?.operations;
  if (!ops) return null;
  return ops.map(op => ({
    name: op.operationName,
    machine: op.benchOperation ? 'bench' : (book.machines.find(m => m.id === op.machineId)?.machineClass ?? 'machine'),
    cycleMin: round((op.cycleTimeHr ?? 0) * 60 / Math.max(1, op.partsPerCycle ?? 1), 3),
    processCost: round(op.processCost ?? 0),
    labourCost: round(op.labourCost ?? 0),
    bench: !!op.benchOperation,
  }));
}

function reconciles(r: BulkPartResult): boolean | null {
  if (r.total == null || !r.breakdown) return null;
  const sum = Object.values(r.breakdown).reduce((s, v) => s + (Number(v) || 0), 0);
  return Math.abs(sum - r.total) < 0.005;
}

/** Cost one route once, resolving leanings on its own questions (each one recorded). */
async function costRoute(
  i: CompareRoutesInput, route: string, answers: Record<string, unknown>, annualVolume: number,
  assumed: string[] | null,
): Promise<{ r: BulkPartResult | null; open: string[] }> {
  let open: string[] = [];
  let r: BulkPartResult | null = null;
  for (let pass = 0; pass < 5; pass++) {
    r = await costMeasuredPart(
      i.geo, i.filename,
      { partNumber: i.filename, file: i.filename, commodity: route, annualVolume },
      answers, i.region,
      { annualVolume, ...(i.programmeYears ? { programmeYears: i.programmeYears } : {}), acknowledge: i.acknowledge ?? [] },
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
        assumed?.push(`${q.question} → ${lean.label}`);
        progressed = true;
      } else {
        open.push(q.question);
      }
    }
    if (!progressed) break;
  }
  return { r, open: r?.status === 'needs_answer' ? open : [] };
}

export async function compareRoutes(i: CompareRoutesInput, routes?: string[]): Promise<RouteComparison> {
  const screens = screenCandidates(i);
  const chosen = routes ?? screens.filter(s => s.feasible).map(s => s.route).slice(0, MAX_COSTED_ROUTES);
  const excluded = screens.filter(s => !s.feasible && !chosen.includes(s.route))
    .map(s => ({ route: s.route, reasons: s.checks.filter(c => !c.pass) }));
  const ladder = i.ladder === false ? [] : [...new Set([...VOLUME_LADDER, i.annualVolume])].sort((a, b) => a - b);

  const fam = materialFamilyOf(i.answers, i.baseBook);
  const rows: RouteRow[] = [];
  for (const route of chosen) {
    const screen = screens.find(s => s.route === route);
    const answers: Record<string, unknown> = { ...i.answers };
    for (const id of ROUTE_ANSWER_IDS) delete answers[id];
    const notes: string[] = [];
    if (route !== i.current) {
      // The family travels to every route (a rail answered "6063" asked machining "what is this part made of?");
      // a grade, resin, compound or laminate is bought on ONE route's scope — a ductile-iron casting grade is not a
      // forging billet, a moulding resin is not a thermoforming sheet — so off its scope it is dropped and the row
      // says the route's representative grade for the same family is costed.
      if (answers['material.family'] === undefined && fam.family && fam.family !== 'rubber' && fam.family !== 'composite') {
        answers['material.family'] = fam.family;
      }
      delete answers['material.alAlloy'];
      for (const id of MATERIAL_ANSWER_IDS) {
        const v = typeof answers[id] === 'string' ? answers[id] as string : null;
        if (!v) continue;
        const cat = i.baseBook.materials.find(m => m.id === v)?.category ?? '';
        if (!cat || !inMaterialScope(route, cat)) {
          delete answers[id];
          const same = id === 'material.resin' ? samePolymerGrade(v, route, i.baseBook) : null;
          if (same) {
            answers['material.resin'] = same.id;
            notes.push(`resin assumed: ${same.label} — the same polymer (${same.polymer}) as ${v}, in the grade this route buys`);
          } else {
            notes.push(`${v} is not bought on this route — its representative ${familyOfCategory(cat) ?? fam.family ?? ''} grade is costed`.replace(/\s+grade/, ' grade'));
          }
        }
      }
    }
    const finish = answers['service.finish'];
    if (finish !== undefined && finish !== 'none' && !FINISH_PREFIX_BY_COMMODITY[route]) {
      notes.push('the finish answered is not modelled on this route — costed bare');
    }
    const assumed: string[] = [];
    const { r, open } = await costRoute(i, route, answers, i.annualVolume, assumed);
    const costed = r?.status === 'costed';
    const byVolume: RouteRow['byVolume'] = [];
    if (costed) {
      for (const v of ladder) {
        if (v === i.annualVolume) { byVolume.push({ volume: v, total: round(r!.total!), note: null }); continue; }
        const at = await costRoute(i, route, { ...answers }, v, null);
        const ok = at.r?.status === 'costed' && at.r.total != null;
        byVolume.push({
          volume: v, total: ok ? round(at.r!.total!) : null,
          note: ok ? null : at.open.length ? `needs an answer at this volume: ${at.open.join('; ')}` : (at.r?.error ?? at.r?.code ?? 'not costed'),
        });
      }
    }
    rows.push({
      route,
      commodity: r?.commodity ?? null,
      status: r?.status ?? 'error',
      total: costed && r?.total != null ? round(r.total) : null,
      toolingPerPart: costed && r?.breakdown?.tooling != null ? round(Number(r.breakdown.tooling)) : null,
      breakdown: costed && r?.breakdown ? Object.fromEntries(Object.entries(r.breakdown).map(([k, v]) => [k, round(Number(v))])) : null,
      reconciles: costed && r ? reconciles(r) : null,
      material: costed && r ? materialOf(r, i.baseBook) : null,
      tooling: costed && r ? toolingOf(r) : null,
      operations: costed && r ? operationsOf(r, i.baseBook) : null,
      checks: screen?.checks ?? [],
      caveats: screen?.caveats ?? [],
      assumed,
      openQuestions: open,
      notes,
      refusal: r && (r.status === 'refused' || r.status === 'error') ? (r.error ?? r.code ?? 'refused') : null,
      byVolume,
    });
  }
  // A route the rules re-price as another one already on the table is the same costing — say so on that row.
  const kept = rows.filter(row => {
    if (!row.commodity || row.commodity === row.route) return true;
    const twin = rows.find(o => o.route === row.commodity);
    if (!twin) return true;
    twin.notes.push(`${row.route.replace(/_/g, ' ')} was also priced: the rules choose this route at this volume`);
    return false;
  });
  return { principle: COMPARISON_PRINCIPLE, rows: kept, excluded, ladder, crossovers: crossovers(kept, i.current, ladder) };
}

/**
 * Where each alternative's cost meets the costing's own on the ladder: the volume is interpolated linearly between the
 * two re-costs either side of the sign change, and the text says so. No crossing on the ladder is reported as such —
 * never extrapolated.
 */
export function crossovers(rows: RouteRow[], current: string, ladder: number[]): RouteCrossover[] {
  const ref = rows.find(r => r.route === current);
  if (!ref || !ladder.length) return [];
  const out: RouteCrossover[] = [];
  const fmtV = (v: number) => Math.round(v).toLocaleString('en-GB');
  for (const row of rows) {
    if (row.route === current || row.total == null) continue;
    const pts = ladder.map(v => {
      const a = row.byVolume.find(p => p.volume === v)?.total ?? null;
      const b = ref.byVolume.find(p => p.volume === v)?.total ?? null;
      return a != null && b != null ? { v, d: a - b } : null;
    }).filter((p): p is { v: number; d: number } => !!p);
    if (pts.length < 2) {
      out.push({ route: row.route, atVolume: null, cheaperAbove: null, text: 'not re-costed across the ladder' });
      continue;
    }
    let found: RouteCrossover | null = null;
    for (let k = 1; k < pts.length; k++) {
      const p0 = pts[k - 1], p1 = pts[k];
      if ((p0.d < 0 && p1.d > 0) || (p0.d > 0 && p1.d < 0) || p1.d === 0) {
        const v = p1.d === 0 ? p1.v : p0.v + (p1.v - p0.v) * (-p0.d) / (p1.d - p0.d);
        const cheaperAbove = p1.d < 0 || (p1.d === 0 && p0.d > 0);
        found = {
          route: row.route, atVolume: Math.round(v), cheaperAbove,
          text: `${cheaperAbove ? 'cheaper' : 'dearer'} than the costed route above ~${fmtV(v)} a year `
            + `(interpolated between re-costs at ${fmtV(p0.v)} and ${fmtV(p1.v)})`,
        };
        break;
      }
    }
    if (!found) {
      const allCheaper = pts.every(p => p.d < 0);
      found = {
        route: row.route, atVolume: null, cheaperAbove: null,
        text: `${allCheaper ? 'cheaper' : 'dearer'} than the costed route at every volume from ${fmtV(pts[0].v)} to ${fmtV(pts[pts.length - 1].v)} a year`,
      };
    }
    out.push(found);
  }
  return out;
}
