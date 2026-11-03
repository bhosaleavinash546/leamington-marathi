/**
 * Secondary machining on the CASTING and FORGING routes — the near-net plan of the cast + machine route, called as one
 * function by headless (`toCostParams`) and by the casting / forging forms (main.ts `collectSecondaryMachining`).
 *
 * Why one function (secondary-machining parity, 3 Nov 2026): the casting route priced its secondary machining with the
 * feature table (`computeFeatureMachining` + `secondaryMachiningCell`), cast + machine with the machining rules on a
 * near-net cut (`nearNetCut` → routing → `buildOperationPlan`). The two priced the SAME 18 features of a bracket on the
 * same HMC cell £1.85 apart (£7.33 v £9.18 at 200k / 5 yr, UK, EXW): no deburr and gauge check, no tool changes, an
 * untended pallet change and a 0.92 change-over efficiency on one side; every B-rep face deburred and every feature row
 * programmed on the other. Now both routes cost the near-net plan — the cut, the routing, the operations, the change-over
 * (`machiningOperationInputs`, the cast + machine module's own), the fixtures, the programming and the tool wear — so the
 * same scope costs the same on either route; the form's ticks, finish factor and typed machine / operator are inputs to
 * that plan, not a second model.
 */
import type { OCCTGeometry } from '../ai-analysis.js';
import type { FeatureRow } from '../feature-ops.js';
import type { MaterialFamily } from '../material-family.js';
import type { OperationInput } from '../types.js';
import { computeFeatureMachining, featureLabel, type FeatureMachiningResult } from '../feature-machining.js';
import { costedNearNetRows, toolWearPerPart, SETUP_MIN_PER_FIXTURING } from '../machining-time.js';
import { standardBatchSize } from '../routing-optimiser.js';
import { machiningOperationInputs } from '../modules/cast-and-machine.js';
import {
  nearNetCut, routingFor, buildOperationPlan, machiningNRE, cuttingMinutesOf, MACHINE_LABOUR_EFFICIENCY,
  type NearNetCutOptions, type OperationPlan, type MachiningCut,
} from './commodities/machining.js';
import type { RuleContext } from './types.js';

export interface NearNetSecondaryOptions extends NearNetCutOptions {
  /** The metal cut. */
  family: MaterialFamily;
  /** The casting process ('sand', 'gravity', 'investment', 'hpdc') or 'forging' — sets the cored / pierced size. */
  subtype: string | null;
  annualVolume: number;
  /** The shop's labour efficiency the operations carry (default `MACHINE_LABOUR_EFFICIENCY` = SHOP_DEFAULTS', as cast +
   *  machine maps its plan). */
  labourEfficiency?: number;
  /** A machine the engineer picked on the form: it replaces the routing's machining centre and drill (never the lathe). */
  machineId?: string;
  /** An operator grade the engineer picked on the form: it runs the cutting operations (the bench deburr stays semi-skilled). */
  labourId?: string;
  geometryQuality?: RuleContext['geometryQuality'];
}

export interface NearNetSecondary {
  /** The operations the stack costs — the change-over first, then the plan — exactly as cast + machine's module builds them. */
  operations: OperationInput[];
  plan: OperationPlan[];
  cut: MachiningCut;
  /** Fixturings charged (the routing's + a lathe fixture when a turned axis is turned). */
  setups: number;
  machineId: string;
  routingBasis: string;
  fixtureGBP: number;
  programmingGBP: number;
  /** Fixtures + programming, £ (the casting / forging modules carry one NRE item). */
  toolingGBP: number;
  toolingBasis: string;
  toolWearPerPart: number;
  /** Minutes of cutting tool wear is paid on (machine operations, not handling or bench). */
  cuttingMin: number;
  /** The rows the plan machines. */
  rows: FeatureRow[];
  /** The feature table as the form and the report's feature section show it, with THIS plan's operations. */
  result: FeatureMachiningResult;
}

/** The cutting operator the plan states (as cast + machine's rules) — a form's pick replaces it on the cutting operations. */
const PLAN_CUTTING_LABOUR = 'lab-uk-skilled';

/**
 * The near-net secondary machining of a casting or forging, or null when the table has no feature to machine (or none
 * is ticked). Pure: the geometry and the options in, the operations, NRE and tool wear out — screen and headless alike.
 */
export function nearNetSecondaryMachining(
  geo: OCCTGeometry | null | undefined, o: NearNetSecondaryOptions,
): NearNetSecondary | null {
  const table = (geo?.featureTable ?? []) as FeatureRow[];
  if (!geo || !table.length) return null;
  const rows = costedNearNetRows(table, o.includeFlags);
  if (!rows.length) return null;
  const ctx: RuleContext = {
    geo, geometryQuality: o.geometryQuality ?? (geo.status === 'success' ? 'occt' : 'text'),
    commodity: 'cast_and_machine', annualVolume: o.annualVolume, filename: '', answers: {},
  };
  const cut = nearNetCut(ctx, o.family, o.subtype, o);
  const routing = routingFor(ctx, cut);
  const { primaryMachineId, drillMachineId } = routing.chosen;
  const plan = buildOperationPlan(ctx, cut, routing).map(p => ({
    ...p,
    ...(o.machineId && (p.machineId === primaryMachineId || p.machineId === drillMachineId) ? { machineId: o.machineId } : {}),
    ...(o.labourId && !p.benchOperation && (p.labourId ?? PLAN_CUTTING_LABOUR) === PLAN_CUTTING_LABOUR ? { labourId: o.labourId } : {}),
  }));
  const setups = routing.chosen.setups + (cut.spindle ? 1 : 0);
  const machineId = o.machineId ?? primaryMachineId;
  const nre = machiningNRE(ctx, cut, routing);
  const cuttingMin = cuttingMinutesOf(plan);
  const wear = toolWearPerPart(cuttingMin, o.family);
  // The rules' setup time (`machining.setupTimeHr`, 3 dp) and batch (`machining.batchSize`) — as cast + machine reads them.
  const setupTimeHr = Math.round(setups * SETUP_MIN_PER_FIXTURING / 60 * 1000) / 1000;
  const operations = machiningOperationInputs(
    { setupTimeHr, batchSize: standardBatchSize(o.annualVolume), machineId, labourId: o.labourId ?? PLAN_CUTTING_LABOUR },
    // As toCostParams maps cast + machine's plan: every op one part a cycle, labour time = cycle, the shop's efficiency.
    plan.map(p => ({
      name: p.name, type: p.type, machineId: p.machineId, labourId: p.labourId ?? o.labourId ?? PLAN_CUTTING_LABOUR,
      cycleTimeHr: p.cycleTimeHr, partsPerCycle: 1, oee: p.oee ?? 0.8, manning: p.manning ?? 1,
      labourTimeHr: p.cycleTimeHr, labourEfficiency: o.labourEfficiency ?? MACHINE_LABOUR_EFFICIENCY,
      ...(p.benchOperation ? { benchOperation: true } : {}),
    })),
  );

  // The feature table for display (the form's panel, the report's feature section, the viewer's £ per face): the same
  // rows and minutes, with this plan's operations.
  const cored = Number.isFinite(cut.coredAboveMm ?? NaN) ? cut.coredAboveMm : undefined;
  const display = computeFeatureMachining(table, {
    machineId, labourId: o.labourId ?? PLAN_CUTTING_LABOUR, stockCondition: 'near_net', family: o.family,
    includeFlags: o.includeFlags, finishFactor: o.finishFactor,
    ...(cored !== undefined ? { coredAboveMm: cored } : {}),
    ...(cut.turnedPart && cut.spindle ? { turned: { latheMachineId: 'mach-lathe-cnc', latheMin: cut.spindle.totalMin, basis: cut.spindle.basis } } : {}),
  });
  const active = display.lines.filter(l => l.included);
  const result: FeatureMachiningResult = {
    ...display,
    operations,
    featureCount: active.reduce((s, l) => s + l.count, 0),
    totalCycleHr: cuttingMin / 60,
    materialRemovedKg: 0,
    summary: active.map(featureLabel).join(', '),
  };
  return {
    operations, plan, cut, setups, machineId, routingBasis: routing.basis,
    fixtureGBP: nre.fixtureGBP, programmingGBP: nre.programmingGBP, toolingGBP: nre.fixtureGBP + nre.programmingGBP,
    toolingBasis: `${nre.fixtureBasis}; ${nre.programmingBasis}`,
    toolWearPerPart: wear, cuttingMin, rows, result,
  };
}
