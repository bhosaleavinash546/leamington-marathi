import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';
import {
  AL_ALLOYS, AL_CONFORM, AL_IMPACT, AL_DOWNSTREAM, AL_LINE, AL_DIE_NITRIDE, AL_MARKET, AL_DIES,
  alBilletId, type AlAlloy, type AlExtrusionRoute, type AlFinish, type AlDieType, type AlTemper,
} from '../al-extrusion-data.js';
export type { AlTemper } from '../al-extrusion-data.js';
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
 *   → mill lengths → off-line solution heat treatment (2xxx / 7075) → ageing oven (T5 / T6 / T7)
 *   → precision cut-to-length (cold saw, end trims) → fabrication (CNC, stretch bending)
 *   → finishing (anodise / powder / e-coat) → inspect and pack
 *
 * Energy (billet heating, solution treatment, ageing) is passed as kWh and priced
 * by the core at the rate library's own tariff, so a regional library prices it
 * at that region's gas and power.
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

  /** Billet heating energy, kWh per kg of billet (gas log furnace). */
  billetHeatKwhPerKg: number;
  /** @deprecated ignored — energy is priced at the rate library's tariff. */
  billetHeatPricePerKwh?: number;
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
  /** Furnace gas, kWh per kg: ageing, and solution treatment. */
  heatTreatKwhPerKg?: number;
  shtKwhPerKg?: number;
  /** @deprecated ignored — energy is priced at the rate library's tariff. */
  gasPricePerKwh?: number;

  // ── precision cut-to-length (cold saw) ──
  ctlSawId?: string;
  /** Saw time per part, s (cuts per part ÷ bundle + handling). */
  ctlSecPerPart?: number;

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
  /** Coating consumables, £ per m² (powder, chemicals, paint). */
  finishConsumablesGbpPerM2?: number;

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
  /** Stretch-bend form tooling, £ (one-off). */
  bendToolingGbp?: number;
  /** Fabrication tool wear, £ a part. */
  fabConsumablesGbp?: number;
  amortizationVolume: number;
}

export function computeAluminiumExtrusionDrivers(i: AluminiumExtrusionInputs): CommodityDrivers {
  const reject = i.rejectRate && i.rejectRate > 0 ? Math.min(0.5, i.rejectRate) : 0;
  const up = 1 / (1 - reject);
  const billetKg = Math.max(i.billetKgPerPart, i.partWeightKg);

  // ── Material: the billet bought; every kg not in the part is scrap credit ──
  const feedAdder = (i.feedAdderGbpPerKg ?? 0) * billetKg;
  const nitride = i.nitrideGbp && i.nitrideEveryKg ? i.nitrideGbp / i.nitrideEveryKg * i.extrudedKgPerPart : 0;
  const finishCons = i.finish && i.finish !== 'mill' && i.finishAreaM2 ? (i.finishConsumablesGbpPerM2 ?? 0) * i.finishAreaM2 : 0;
  const consumables = (feedAdder + nitride + finishCons + (i.fabConsumablesGbp ?? 0)) * up;
  // Gas: billet heating on the billet bought, solution treatment and ageing on the profile.
  const gasKwh = (i.billetHeatKwhPerKg * billetKg
    + (i.shtFurnaceId ? (i.shtKwhPerKg ?? 0) * i.extrudedKgPerPart : 0)
    + (i.ageOvenId && i.ageHours ? (i.heatTreatKwhPerKg ?? 0) * i.extrudedKgPerPart : 0)) * up;
  const rawMaterial: RawMaterialInput = {
    materialId: i.materialId,
    netWeightKg: i.partWeightKg * up,
    materialUtilization: Math.min(1, i.partWeightKg / billetKg),
    ...(consumables > 0 ? { consumablesCostPerPart: consumables } : {}),
    ...(gasKwh > 0 ? { energyKwh: { gas: gasKwh, basis: 'billet log heating, solution treatment and ageing furnaces' } } : {}),
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

  if (i.shtFurnaceId && i.shtCycleHr && i.shtLoadKg) {
    const n = Math.max(1, Math.floor(i.shtLoadKg / i.extrudedKgPerPart));
    ops.push({
      operationName: 'Solution heat treatment and quench (off-line)', machineId: i.shtFurnaceId, labourId: i.inspectLabourId ?? i.labourId,
      cycleTimeHr: i.shtCycleHr * up, partsPerCycle: n, oee: i.oee, manning: 1, labourTimeHr: 0.5 * up, labourEfficiency: i.labourEfficiency,
    });
  }
  if (i.ageOvenId && i.ageHours && i.ageHours > 0 && i.ageLoadKg) {
    const n = Math.max(1, Math.floor(i.ageLoadKg / i.extrudedKgPerPart));
    const handling = i.ageHandlingHr ?? 0.75;
    ops.push({
      operationName: `Artificial ageing (${i.ageHours} h a load)`, machineId: i.ageOvenId, labourId: i.labourId,
      cycleTimeHr: (i.ageHours + handling) * up, partsPerCycle: n, oee: 1, manning: 1, labourTimeHr: handling * up, labourEfficiency: i.labourEfficiency,
    });
  }
  if (i.ctlSawId && i.ctlSecPerPart && i.ctlSecPerPart > 0) {
    const hr = i.ctlSecPerPart / 3600 * up;
    ops.push({
      operationName: 'Precision cut-to-length and deburr (cold saw, end trims)', machineId: i.ctlSawId, labourId: i.labourId,
      cycleTimeHr: hr, partsPerCycle: 1, oee: i.oee, manning: 1, labourTimeHr: hr, labourEfficiency: i.labourEfficiency,
    });
  }

  if (i.bends && i.bends > 0 && i.benderId) {
    const hr = (AL_DOWNSTREAM.bender.loadSec + i.bends * (i.secPerBend ?? AL_DOWNSTREAM.bender.secPerBend)) / 3600 * up;
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
    totalToolingCost: i.dieCostGbp * sets + (i.fabToolingGbp ?? 0) + (i.bendToolingGbp ?? 0),
    amortizationVolume: i.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations: ops, tooling };
}

// ─── One builder for the screen and headless ──────────────────────────────────

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
  /** Area finished, m² (the part's whole surface — anodise and e-coat coat every face). */
  finishAreaM2: number;
  /** The outside surface only, m² (outer outline × length) — what powder coats. */
  finishOutsideAreaM2?: number;
  bends: number;
  /** Fabrication, measured from the CAD: cutting minutes, fixturings and feature rows. */
  cncMinutes: number;
  cncFixturings: number;
  fabFeatureRows: number;
  /** Impact extrusion: outer Ø of the cup, mm. */
  impactOuterDiaMm?: number;
  /** Engineer rate for CNC programming, £/h (the region's; UK when not given). */
  engineerRatePerHr?: number;
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
  // EN 515: T5 / T6 / T64 / T66 / T7x / T8 are artificially aged; T3x and T4 age naturally.
  const age = ['T5', 'T6', 'T64', 'T66', 'T7', 'T73', 'T76', 'T8'].includes(temper);
  // Solution treatment is off-line where the alloy cannot be press-quenched
  // (2xxx, 7075) and the temper is a solution-treated one (all but T5). A
  // press-quenchable alloy is solutionised on the press.
  const sht = a.quench === 'offline-sht' && temper !== 'T5';
  return { age, sht };
}

/** Cold-saw time per part, s: (parts + 1) cuts a mill length, a bundle cut at once, plus handling. */
export function ctlSecPerPart(ccdMm: number, partsPerMill: number): { sec: number; bundle: number; basis: string } {
  const c = AL_DOWNSTREAM.ctlSaw;
  const secPerCut = c.secPerCutBase + c.secPerCutPerMmCcd * ccdMm;
  const bundle = Math.max(1, Math.min(c.bundleMaxPieces, Math.floor(c.bundleWidthMm / Math.max(ccdMm, 1))));
  const sec = (partsPerMill + 1) / partsPerMill * secPerCut / bundle + c.handlingSecPerPart;
  return { sec: Math.round(sec * 100) / 100, bundle,
    basis: `${secPerCut.toFixed(1)} s a cut × ${partsPerMill + 1} cuts per ${partsPerMill} part${partsPerMill === 1 ? '' : 's'} ÷ ${bundle} in the bundle + ${c.handlingSecPerPart} s handling` };
}

export function buildAlExtrusionInputs(spec: AlExtrusionSpec): AlExtrusionBuild {
  const a = AL_ALLOYS[spec.alloy];
  const oee = spec.oee ?? AL_LINE.oee;
  const eff = spec.labourEfficiency ?? 0.92;
  const notes: string[] = [];
  const warnings: string[] = [];
  const s = spec.section;
  const extrudedKg = s.areaMm2 * s.partLengthMm * 1e-9 * a.densityKgPerM3;
  let plan: AlPressPlan | null = null;
  let pressId: string; let crew: number; let cycleSec: number; let perPush: number;
  let billetKgPerPart: number; let dieGbp: number; let dieLifeKg: number; let runs: number;
  let heatKwh = AL_DOWNSTREAM.billetHeatGasKwhPerKg; let feedAdder = 0; let dieChangeHr = AL_LINE.dieChangeHr;

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
      featureRows: spec.fabFeatureRows, cuttingMin: spec.cncMinutes, engineerRatePerHr: spec.engineerRatePerHr ?? REGIONAL_DATA.UK.labour.engineer,
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
  const finishArea = finishLine?.outsideOnly && spec.finishOutsideAreaM2 ? spec.finishOutsideAreaM2 : spec.finishAreaM2;
  if (finishLine) {
    notes.push(`finish: ${spec.finish} over ${finishArea.toFixed(3)} m² (${finishLine.outsideOnly ? (spec.finishOutsideAreaM2 ? 'outside only' : 'whole surface — outside not measured') : 'every surface, chambers included'}) `
      + `at ${finishLine.m2PerHr} m²/h + £${finishLine.consumablesGbpPerM2}/m² consumables`);
  }
  // Cold cut-to-length: every profile route but Conform (cut in line) and impact.
  const ctl = plan ? ctlSecPerPart(s.ccdMm, plan.partsPerMillLength) : null;
  if (ctl) notes.push(`cut to length: ${ctl.basis}`);
  const bendTool = spec.bends > 0 ? AL_DOWNSTREAM.bender.toolFirstGbp + (spec.bends - 1) * AL_DOWNSTREAM.bender.toolPerExtraBendGbp : 0;
  if (bendTool) notes.push(`stretch-bend form tooling £${bendTool.toLocaleString('en-GB')} for ${spec.bends} bend${spec.bends === 1 ? '' : 's'}`);

  const inputs: AluminiumExtrusionInputs = {
    materialId: alBilletId(spec.alloy), alloy: spec.alloy, route: spec.route,
    partWeightKg: partKg, extrudedKgPerPart: spec.route === 'impact' ? partKg : extrudedKg, billetKgPerPart,
    pressId, labourId: 'lab-uk-semiskilled', crew, cycleSecPerPush: cycleSec, partsPerPush: perPush,
    runsPerYear: runs, dieChangeHr, oee, labourEfficiency: eff, rejectRate: spec.rejectRate ?? AL_LINE.rejectRate,
    billetHeatKwhPerKg: heatKwh, feedAdderGbpPerKg: feedAdder,
    ...(need.sht ? { shtFurnaceId: AL_DOWNSTREAM.sht.id, shtCycleHr: AL_DOWNSTREAM.sht.cycleHr, shtLoadKg: AL_DOWNSTREAM.sht.loadKg } : {}),
    ...(need.age ? { ageOvenId: AL_DOWNSTREAM.ageOven.id, ageHours: a.ageHours, ageLoadKg: AL_DOWNSTREAM.ageOven.loadKg, ageHandlingHr: AL_DOWNSTREAM.ageOven.handlingHr } : {}),
    heatTreatKwhPerKg: AL_DOWNSTREAM.ageOven.gasKwhPerKg, shtKwhPerKg: AL_DOWNSTREAM.sht.gasKwhPerKg,
    ...(ctl ? { ctlSawId: AL_DOWNSTREAM.ctlSaw.id, ctlSecPerPart: ctl.sec } : {}),
    ...(spec.bends > 0 ? { bends: spec.bends, benderId: AL_DOWNSTREAM.bender.id, secPerBend: AL_DOWNSTREAM.bender.secPerBend, bendToolingGbp: bendTool } : {}),
    fabOps, fabToolingGbp: fabTooling, fabConsumablesGbp: fabWear,
    finish: spec.finish,
    ...(finishLine ? { finishLineId: finishLine.id, finishAreaM2: finishArea, finishM2PerHr: finishLine.m2PerHr, finishCrew: finishLine.crew,
      finishConsumablesGbpPerM2: finishLine.consumablesGbpPerM2 } : {}),
    packSecPerPart: Math.round((6 + 4 * s.partLengthMm / 1000) * 10) / 10, inspectLabourId: 'lab-uk-semiskilled',
    dieCostGbp: dieGbp, dieLifeKg, nitrideGbp: spec.route === 'impact' ? 0 : AL_DIE_NITRIDE.gbp, nitrideEveryKg: AL_DIE_NITRIDE.everyT * 1000,
    amortizationVolume: spec.annualVolume,
  };
  return { inputs, plan, notes, warnings };
}
