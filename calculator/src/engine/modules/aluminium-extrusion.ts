import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';
import {
  AL_ALLOYS, AL_CONFORM, AL_IMPACT, AL_DOWNSTREAM, AL_LINE, AL_DIE_NITRIDE, AL_MARKET, AL_DIES,
  alBilletId, type AlAlloy, type AlExtrusionRoute, type AlFinish, type AlDieType,
} from '../al-extrusion-data.js';
import { planAlExtrusion, planImpact, planConform, type AlSection, type AlPressPlan } from './aluminium-extrusion-advisor.js';
import { REGIONAL_DATA } from '../regional-rates.js';
import { secondaryMachiningCell } from '../machining-time.js';

/**
 * Aluminium extrusion should-cost — drivers (built Oct 2026).
 *
 * The chain, in the order the metal moves:
 *
 *   billet (LME + regional premium + alloy) → log heating (gas or induction)
 *   → press: direct / indirect / hydrostatic, or Conform from rod, or impact from a slug
 *   → press quench (air / mist / water) → stretch → finish saw (all in the line rate)
 *   → off-line solution heat treatment (2xxx / 7xxx) → ageing oven (T5 / T6)
 *   → fabrication (CNC, stretch bending) → finishing (anodise / powder / e-coat)
 *   → inspect and pack
 *
 * The process plan (press, openings, speed, billet, yield, die) comes from
 * `aluminium-extrusion-advisor.ts`; this module only multiplies it by the rate
 * library. Butt, strand ends, saw kerf and machining chips are all process
 * scrap, bought as billet and credited at the alloy's scrap value.
 */
export interface AluminiumExtrusionInputs {
  materialId: string;
  alloy?: AlAlloy;
  route: AlExtrusionRoute;
  /** Finished part, kg (after fabrication). */
  partWeightKg: number;
  /** As extruded and cut, kg. */
  extrudedKgPerPart: number;
  /** Billet (or rod / slug) bought per part, kg — from the plan. */
  billetKgPerPart: number;

  pressId: string;
  labourId: string;
  crew: number;
  /** Direct / indirect / hydrostatic: one push. Conform / impact: one part. */
  cycleSecPerPush: number;
  partsPerPush: number;
  runsPerYear: number;
  dieChangeHr: number;
  oee: number;
  labourEfficiency: number;
  rejectRate?: number;

  /** Billet heating energy, kWh per kg of billet, and its price (gas or electricity) £/kWh. */
  billetHeatKwhPerKg: number;
  billetHeatPricePerKwh: number;
  /** Rod (Conform) or slug-prep (impact) adder, £ per kg of feed. */
  feedAdderGbpPerKg?: number;

  // ── heat treatment ──
  shtFurnaceId?: string;
  shtCycleHr?: number;
  shtLoadKg?: number;
  ageOvenId?: string;
  ageHours?: number;
  ageLoadKg?: number;
  ageHandlingHr?: number;
  /** Furnace gas, kWh per kg treated, and the gas price. */
  heatTreatKwhPerKg?: number;
  gasPricePerKwh?: number;

  // ── fabrication ──
  bends?: number;
  benderId?: string;
  secPerBend?: number;
  /** Rule-built fabrication operations (CNC holes, slots, end machining). */
  fabOps?: OperationInput[];

  // ── finishing ──
  finish?: AlFinish;
  finishLineId?: string;
  finishAreaM2?: number;
  finishM2PerHr?: number;
  finishCrew?: number;

  /** Inspect and pack, s a part (bench). */
  packSecPerPart?: number;
  inspectLabourId?: string;

  // ── tooling ──
  dieCostGbp: number;
  dieLifeKg: number;
  nitrideGbp?: number;
  nitrideEveryKg?: number;
  /** Fabrication fixtures and programming, £ (one-off). */
  fabToolingGbp?: number;
  /** Fabrication tool wear, £ a part. */
  fabConsumablesGbp?: number;
  amortizationVolume: number;
}

export function computeAluminiumExtrusionDrivers(i: AluminiumExtrusionInputs): CommodityDrivers {
  const reject = i.rejectRate && i.rejectRate > 0 ? Math.min(0.5, i.rejectRate) : 0;
  const up = 1 / (1 - reject);
  const billetKg = Math.max(i.billetKgPerPart, i.partWeightKg);

  // ── Material: the billet bought; every kg not in the part is scrap credit ──
  const heat = i.billetHeatKwhPerKg * billetKg * i.billetHeatPricePerKwh;
  const feedAdder = (i.feedAdderGbpPerKg ?? 0) * billetKg;
  const nitride = i.nitrideGbp && i.nitrideEveryKg ? i.nitrideGbp / i.nitrideEveryKg * i.extrudedKgPerPart : 0;
  const consumables = (heat + feedAdder + nitride + (i.fabConsumablesGbp ?? 0)) * up;
  const rawMaterial: RawMaterialInput = {
    materialId: i.materialId,
    netWeightKg: i.partWeightKg * up,
    materialUtilization: Math.min(1, i.partWeightKg / billetKg),
    ...(consumables > 0 ? { consumablesCostPerPart: consumables } : {}),
  };

  const ops: OperationInput[] = [];
  const pressName = i.route === 'conform' ? 'Conform continuous extrusion'
    : i.route === 'impact' ? 'Impact extrusion'
    : `${i.route === 'indirect' ? 'Indirect' : i.route === 'hydrostatic' ? 'Hydrostatic' : 'Direct'} extrusion — press, quench, stretch, saw`;
  const pushHr = i.cycleSecPerPush / 3600 * up;
  ops.push({
    operationName: pressName, machineId: i.pressId, labourId: i.labourId,
    cycleTimeHr: pushHr, partsPerCycle: Math.max(1, i.partsPerPush), oee: i.oee,
    manning: i.crew, labourTimeHr: pushHr, labourEfficiency: i.labourEfficiency,
  });
  // Die change and heat-up, once a run, shared by the year's parts.
  if (i.runsPerYear > 0 && i.dieChangeHr > 0 && i.amortizationVolume > 0) {
    const setupHr = i.runsPerYear * i.dieChangeHr / i.amortizationVolume;
    ops.push({
      operationName: 'Die change and press set-up (per run)', machineId: i.pressId, labourId: i.labourId,
      cycleTimeHr: setupHr, partsPerCycle: 1, oee: 1, manning: i.crew, labourTimeHr: setupHr, labourEfficiency: i.labourEfficiency,
    });
  }

  const gas = i.gasPricePerKwh ?? 0;
  let htEnergy = 0;
  if (i.shtFurnaceId && i.shtCycleHr && i.shtLoadKg) {
    const n = Math.max(1, Math.floor(i.shtLoadKg / i.extrudedKgPerPart));
    ops.push({
      operationName: 'Solution heat treatment and quench (off-line)', machineId: i.shtFurnaceId, labourId: i.inspectLabourId ?? i.labourId,
      cycleTimeHr: i.shtCycleHr * up, partsPerCycle: n, oee: i.oee, manning: 1, labourTimeHr: 0.5 * up, labourEfficiency: i.labourEfficiency,
    });
    htEnergy += (i.heatTreatKwhPerKg ?? 0) * 2.5 * i.extrudedKgPerPart * gas;
  }
  if (i.ageOvenId && i.ageHours && i.ageHours > 0 && i.ageLoadKg) {
    const n = Math.max(1, Math.floor(i.ageLoadKg / i.extrudedKgPerPart));
    const handling = i.ageHandlingHr ?? 0.75;
    ops.push({
      operationName: `Artificial ageing (${i.ageHours} h a load)`, machineId: i.ageOvenId, labourId: i.labourId,
      cycleTimeHr: (i.ageHours + handling) * up, partsPerCycle: n, oee: 1, manning: 1, labourTimeHr: handling * up, labourEfficiency: i.labourEfficiency,
    });
    htEnergy += (i.heatTreatKwhPerKg ?? 0) * i.extrudedKgPerPart * gas;
  }
  if (htEnergy > 0) rawMaterial.consumablesCostPerPart = (rawMaterial.consumablesCostPerPart ?? 0) + htEnergy * up;

  if (i.bends && i.bends > 0 && i.benderId) {
    const hr = (30 + i.bends * (i.secPerBend ?? 45)) / 3600 * up;
    ops.push({
      operationName: `Stretch bending (${i.bends} bend${i.bends === 1 ? '' : 's'})`, machineId: i.benderId, labourId: i.labourId,
      cycleTimeHr: hr, partsPerCycle: 1, oee: i.oee, manning: 1, labourTimeHr: hr, labourEfficiency: i.labourEfficiency,
    });
  }
  for (const op of i.fabOps ?? []) ops.push({ ...op, cycleTimeHr: op.cycleTimeHr * up, labourTimeHr: op.labourTimeHr * up });

  if (i.finish && i.finish !== 'mill' && i.finishLineId && i.finishAreaM2 && i.finishM2PerHr) {
    const hr = i.finishAreaM2 / i.finishM2PerHr * up;
    ops.push({
      operationName: i.finish === 'anodise' ? 'Anodise and seal' : i.finish === 'powder' ? 'Pretreat and powder coat' : 'E-coat / conversion coat',
      machineId: i.finishLineId, labourId: i.labourId, cycleTimeHr: hr, partsPerCycle: 1, oee: i.oee,
      manning: i.finishCrew ?? 3, labourTimeHr: hr, labourEfficiency: i.labourEfficiency,
    });
  }

  if (i.packSecPerPart && i.packSecPerPart > 0) {
    const hr = i.packSecPerPart / 3600 * up;
    ops.push({
      operationName: 'Inspect, interleave and pack', machineId: 'bench-assembly', labourId: i.inspectLabourId ?? i.labourId,
      cycleTimeHr: 0, partsPerCycle: 1, oee: 1, manning: 1, labourTimeHr: hr, labourEfficiency: i.labourEfficiency, benchOperation: true,
    });
  }

  // ── Tooling: dies wear by the tonne — fractional sets, never fewer than one ──
  const annualKg = i.amortizationVolume * i.extrudedKgPerPart;
  const sets = i.dieLifeKg > 0 ? Math.max(1, annualKg / i.dieLifeKg) : 1;
  const tooling: ToolingInput = {
    totalToolingCost: i.dieCostGbp * sets + (i.fabToolingGbp ?? 0),
    amortizationVolume: i.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations: ops, tooling };
}

// ─── One builder for the screen and headless ──────────────────────────────────

export type AlTemper = 'F' | 'O' | 'H112' | 'T4' | 'T5' | 'T6' | 'T64' | 'T66' | 'T73' | 'T3511';

/** What the CAD rules (or the engineer, on the form) state; the builder plans the rest. */
export interface AlExtrusionSpec {
  alloy: AlAlloy;
  route: AlExtrusionRoute;
  dieType?: AlDieType;
  section: AlSection;
  /** Finished part, kg — less than the extruded length when it is machined. */
  partWeightKg: number;
  annualVolume: number;
  temper: AlTemper;
  finish: AlFinish;
  /** Area finished, m² (the part's surface). */
  finishAreaM2: number;
  bends: number;
  /** Fabrication, measured from the CAD: cutting minutes, fixturings and feature rows. */
  cncMinutes: number;
  cncFixturings: number;
  fabFeatureRows: number;
  /** Impact extrusion: outer Ø of the cup, mm. */
  impactOuterDiaMm?: number;
  gasPricePerKwh?: number;
  electricityPricePerKwh?: number;
  oee?: number;
  labourEfficiency?: number;
  rejectRate?: number;
}

export interface AlExtrusionBuild {
  inputs: AluminiumExtrusionInputs;
  plan: AlPressPlan | null;
  notes: string[];
  warnings: string[];
}

/** Does this temper need artificial ageing / off-line solution heat treatment? */
export function temperNeeds(alloy: AlAlloy, temper: AlTemper): { age: boolean; sht: boolean } {
  const a = AL_ALLOYS[alloy];
  if (!a.heatTreatable || temper === 'F' || temper === 'O' || temper === 'H112') return { age: false, sht: false };
  const age = ['T5', 'T6', 'T64', 'T66', 'T73'].includes(temper);
  // Off-line SHT where the alloy cannot be press-quenched, or a T6 is asked of an
  // alloy whose press quench gives only T5-level properties is NOT modelled — a
  // press-quenchable alloy is solutionised on the press.
  const sht = a.quench === 'offline-sht' && temper !== 'T5';
  return { age, sht };
}

export function buildAlExtrusionInputs(spec: AlExtrusionSpec): AlExtrusionBuild {
  const a = AL_ALLOYS[spec.alloy];
  const gas = spec.gasPricePerKwh ?? REGIONAL_DATA.UK.energy.gasPerKwh;
  const oee = spec.oee ?? AL_LINE.oee;
  const eff = spec.labourEfficiency ?? 0.92;
  const notes: string[] = [];
  const warnings: string[] = [];
  const s = spec.section;
  const extrudedKg = s.areaMm2 * s.partLengthMm * 1e-9 * a.densityKgPerM3;
  let plan: AlPressPlan | null = null;
  let pressId: string; let crew: number; let cycleSec: number; let perPush: number;
  let billetKgPerPart: number; let dieGbp: number; let dieLifeKg: number; let runs: number;
  let heatKwh = AL_DOWNSTREAM.billetHeatGasKwhPerKg; const heatPrice = gas; let feedAdder = 0; let dieChangeHr = AL_LINE.dieChangeHr;

  if (spec.route === 'impact') {
    const ip = planImpact(spec.partWeightKg, spec.impactOuterDiaMm ?? s.ccdMm);
    pressId = AL_IMPACT.id; crew = AL_IMPACT.crew; cycleSec = ip.secPerPart; perPush = 1;
    billetKgPerPart = ip.slugKg; dieGbp = ip.toolGbp; dieLifeKg = ip.toolLifeHits * extrudedKg;
    heatKwh = 0; feedAdder = AL_IMPACT.slugPrepGbpPerKg; runs = 12; dieChangeHr = 1;
    notes.push(`impact: ${ip.basis}; slug prep (saw / punch, anneal, lubricate) £${AL_IMPACT.slugPrepGbpPerKg}/kg; tool £${ip.toolGbp} for ${ip.toolLifeHits.toLocaleString('en-GB')} hits`);
  } else if (spec.route === 'conform') {
    const cp = planConform(s, spec.alloy);
    if (!cp.feasible) warnings.push(cp.basis);
    pressId = AL_CONFORM.id; crew = AL_CONFORM.crew; perPush = 1;
    cycleSec = extrudedKg / cp.kgPerHr * 3600;
    billetKgPerPart = extrudedKg * 1.03;
    heatKwh = 0; feedAdder = AL_CONFORM.rodAdderUsdPerT / AL_MARKET.usdPerGbp / 1000;
    const d = AL_DIES[s.voids > 0 ? 'hollow-porthole' : 'solid'];
    dieGbp = Math.round((d.baseGbp + d.perMmGbp * s.ccdMm) * 0.6); dieLifeKg = 30_000; runs = 12;
    notes.push(`${cp.basis}; 3% start and cut-off scrap; rod premium $${AL_CONFORM.rodAdderUsdPerT}/t over billet`);
  } else {
    plan = planAlExtrusion({ ...s, alloy: spec.alloy, annualVolume: spec.annualVolume, route: spec.route, dieType: spec.dieType });
    warnings.push(...plan.warnings); notes.push(...plan.basis);
    pressId = plan.pressId; crew = plan.crew; cycleSec = plan.cycleSecPerPush; perPush = plan.partsPerPush;
    billetKgPerPart = plan.billetKgPerPart; dieGbp = plan.dieCostGbp; dieLifeKg = plan.dieLifeKg; runs = plan.runsPerYear;
    notes.push(`die: ${plan.dieBasis}`);
  }
  // The finished part can only weigh less than the extruded length (machining).
  const partKg = Math.min(spec.partWeightKg, spec.route === 'impact' ? spec.partWeightKg : extrudedKg);

  const need = temperNeeds(spec.alloy, spec.temper);
  if (need.sht) notes.push(`${spec.alloy} cannot be press-quenched to ${spec.temper}: off-line solution heat treatment and drop quench`);
  if (need.age) notes.push(`ageing to ${spec.temper}: ${a.ageHours} h a load`);

  // Fabrication: the machining review's cell (fixtures, programming, tool wear).
  let fabOps: OperationInput[] = [];
  let fabTooling = 0; let fabWear = 0;
  if (spec.cncMinutes > 0) {
    const cell = secondaryMachiningCell({
      fixturings: spec.cncFixturings, weightKg: partKg, annualVolume: spec.annualVolume, family: 'aluminium',
      featureRows: spec.fabFeatureRows, cuttingMin: spec.cncMinutes, engineerRatePerHr: REGIONAL_DATA.UK.labour.engineer,
    });
    fabTooling = cell.toolingGBP; fabWear = cell.toolWearPerPart;
    const cut = spec.cncMinutes / 60;
    const handle = (cell.cell.handlingMin * cell.cell.fixturings + cell.cell.setupMinPerFixturing * cell.cell.fixturings / cell.cell.batchSize) / 60;
    fabOps = [
      { operationName: `CNC fabrication — holes, slots, end machining (${spec.cncMinutes.toFixed(1)} min)`, machineId: AL_DOWNSTREAM.cnc.id,
        labourId: 'lab-uk-skilled', cycleTimeHr: cut, partsPerCycle: 1, oee: 0.80, manning: 0.5, labourTimeHr: cut, labourEfficiency: eff },
      { operationName: 'CNC load / unload and change-over', machineId: AL_DOWNSTREAM.cnc.id, labourId: 'lab-uk-skilled',
        cycleTimeHr: handle, partsPerCycle: 1, oee: 0.80, manning: 1, labourTimeHr: handle, labourEfficiency: eff },
    ];
    notes.push(`fabrication: ${spec.cncMinutes.toFixed(1)} min cutting; ${cell.basis}`);
  }

  const finishLine = spec.finish === 'anodise' ? AL_DOWNSTREAM.anodise : spec.finish === 'powder' ? AL_DOWNSTREAM.powder
    : spec.finish === 'ecoat' ? AL_DOWNSTREAM.ecoat : null;

  const inputs: AluminiumExtrusionInputs = {
    materialId: alBilletId(spec.alloy), alloy: spec.alloy, route: spec.route,
    partWeightKg: partKg, extrudedKgPerPart: spec.route === 'impact' ? partKg : extrudedKg, billetKgPerPart,
    pressId, labourId: 'lab-uk-semiskilled', crew, cycleSecPerPush: cycleSec, partsPerPush: perPush,
    runsPerYear: runs, dieChangeHr, oee, labourEfficiency: eff, rejectRate: spec.rejectRate ?? AL_LINE.rejectRate,
    billetHeatKwhPerKg: heatKwh, billetHeatPricePerKwh: heatPrice, feedAdderGbpPerKg: feedAdder,
    ...(need.sht ? { shtFurnaceId: AL_DOWNSTREAM.sht.id, shtCycleHr: AL_DOWNSTREAM.sht.cycleHr, shtLoadKg: AL_DOWNSTREAM.sht.loadKg } : {}),
    ...(need.age ? { ageOvenId: AL_DOWNSTREAM.ageOven.id, ageHours: a.ageHours, ageLoadKg: AL_DOWNSTREAM.ageOven.loadKg, ageHandlingHr: AL_DOWNSTREAM.ageOven.handlingHr } : {}),
    heatTreatKwhPerKg: AL_DOWNSTREAM.ageOven.gasKwhPerKg, gasPricePerKwh: gas,
    ...(spec.bends > 0 ? { bends: spec.bends, benderId: AL_DOWNSTREAM.bender.id, secPerBend: AL_DOWNSTREAM.bender.secPerBend } : {}),
    fabOps, fabToolingGbp: fabTooling, fabConsumablesGbp: fabWear,
    finish: spec.finish,
    ...(finishLine ? { finishLineId: finishLine.id, finishAreaM2: spec.finishAreaM2, finishM2PerHr: finishLine.m2PerHr, finishCrew: finishLine.crew } : {}),
    packSecPerPart: Math.round((6 + 4 * s.partLengthMm / 1000) * 10) / 10, inspectLabourId: 'lab-uk-semiskilled',
    dieCostGbp: dieGbp, dieLifeKg, nitrideGbp: spec.route === 'impact' ? 0 : AL_DIE_NITRIDE.gbp, nitrideEveryKg: AL_DIE_NITRIDE.everyT * 1000,
    amortizationVolume: spec.annualVolume,
  };
  return { inputs, plan, notes, warnings };
}
