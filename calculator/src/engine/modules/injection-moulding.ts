import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';

export type RunnerSystem = 'cold' | 'hot';

/** Tool steel / SPI durability class — drives mould-cost multiplier and expected life. */
export type MouldSteelClass = 'prototype' | 'standard' | 'production' | 'high_volume';

export interface InjectionMouldingInputs {
  materialId: string;
  partWeightKg: number;
  runnerWeightKg: number;
  regrindFraction: number;   // 0–1, fraction of runner recovered (ignored for hot runners)
  runnerSystem?: RunnerSystem; // 'hot' → no runner waste; include hot-runner cost in mouldCost
  cavities: number;
  projectedAreaCm2: number;  // total projected area of all cavities
  cavityPressureMPa: number; // default 30 for standard resins
  wallThicknessMm: number;
  coolTimeFactorSPerMm2: number; // s/mm² — 3.16 for PP, varies by resin
  fillTimeSec: number;
  packTimeSec: number;
  ejectTimeSec: number;
  machineId: string;
  labourId: string;
  oee: number;
  manning: number;
  labourEfficiency: number;
  /** Total mould cost £. If omitted/≤0 it is estimated parametrically (see estimateMouldCost). */
  mouldCost?: number;
  mouldLife: number;         // shots per mould life
  amortizationVolume: number;
  toleranceMm?: number;            // tightest tolerance on part mm. Affects mould complexity cost.
  surfaceFinishGrade?: 'standard' | 'textured' | 'high_gloss' | 'painted';
  rejectRate?: number;             // moulding scrap fraction 0–1
  // ── Parametric tooling inputs (used only when mouldCost is omitted/≤0) ──
  steelClass?: MouldSteelClass;    // tool durability class → cost multiplier
  sideActionsLifters?: number;     // count of slides + lifters for undercuts
  hotRunnerDrops?: number;         // hot-runner gates (default = cavities when runnerSystem='hot')
}

// ─── Parametric mould-cost estimator (H3) ─────────────────────────────────────

export interface MouldCostInputs {
  cavities: number;
  projectedAreaCm2: number;        // total projected area across all cavities
  steelClass?: MouldSteelClass;
  sideActionsLifters?: number;     // number of side-action slides + lifters
  runnerSystem?: RunnerSystem;
  hotRunnerDrops?: number;         // default = cavities
}

export interface MouldCostBreakdown {
  base: number;         // bolster / plates / ejector / guides
  cavityBlock: number;  // cavity + core steel & machining (all cavities, steel-class scaled)
  sideActions: number;  // slides + lifters
  hotRunner: number;    // manifold + controller + drops
  total: number;
}

/** Steel-class cost multiplier applied to the machined-steel portion of the tool. */
export function mouldSteelClassFactor(cls: MouldSteelClass | undefined): number {
  switch (cls) {
    case 'prototype':   return 0.55;  // soft aluminium / P20 soft — ~10–50k shots
    case 'production':  return 1.35;  // hardened H13 — ~1M+ shots
    case 'high_volume': return 1.70;  // fully hardened, high-wear inserts — 5M+ shots
    default:            return 1.00;  // 'standard' P20 pre-hardened — ~500k shots
  }
}

/**
 * Estimate mould tooling cost (£) from engineering parameters instead of taking a
 * raw manual figure. Captures the real cost drivers: cavitation (with mild
 * multi-cavity economy of scale), part size, tool-steel/SPI durability class,
 * undercut mechanisms (slides/lifters) and hot- vs cold-runner. Returns a rounded
 * total plus a breakdown. Tolerance and surface-finish uplifts are applied
 * downstream (see computeInjectionMouldingDrivers) so they compose with a manual
 * mouldCost override too.
 */
export function estimateMouldCost(inputs: MouldCostInputs): MouldCostBreakdown {
  const cavities = Math.max(1, Math.floor(inputs.cavities || 1));
  const perCavityAreaCm2 = Math.max(0, inputs.projectedAreaCm2) / cavities;

  const base = 6000;                                   // bolster, plates, ejector system, guides
  const perCavityCost = 2500 + perCavityAreaCm2 * 55;  // cavity + core steel & machining
  // Mild economy of scale — the Nth identical cavity is cheaper than the first.
  const cavityBlockRaw = perCavityCost * Math.pow(cavities, 0.9);

  const steelFactor = mouldSteelClassFactor(inputs.steelClass);
  // Steel class scales the machined steel (base frame + cavities), not the bolt-ons.
  const scaledBase = base * steelFactor;
  const cavityBlock = cavityBlockRaw * steelFactor;

  const sideActions = Math.max(0, Math.floor(inputs.sideActionsLifters ?? 0)) * 3500;

  const hotRunner = inputs.runnerSystem === 'hot'
    ? 4000 + Math.max(1, Math.floor(inputs.hotRunnerDrops ?? cavities)) * 2500  // controller base + per-drop
    : 0;

  const total = Math.round(scaledBase + cavityBlock + sideActions + hotRunner);
  return { base: Math.round(scaledBase), cavityBlock: Math.round(cavityBlock), sideActions, hotRunner, total };
}

// ─── Per-resin cooling (M7) ───────────────────────────────────────────────────

/**
 * Auto cooling-time factor (s/mm²) for a resin, so `coolTime = coolFactor × wall²`
 * needn't be guessed by hand. Values follow the curated reference figures that
 * accompany each resin grade (semi-crystalline PP/PE cool slowest; amorphous
 * PS/ABS/PC fastest; thin-wall LCP fastest of all). Falls back to a mid-range
 * 2.5 for unrecognised resins. The physical basis is transient conduction:
 * t_cool ∝ wall² / thermal-diffusivity × ln[(4/π)(T_melt−T_mould)/(T_eject−T_mould)].
 */
export function autoCoolFactorForMaterial(materialId: string): number {
  const id = (materialId || '').toLowerCase();
  const rules: Array<[RegExp, number]> = [
    [/lcp/, 1.8],
    [/pc-abs/, 2.2],
    [/pc-pbt/, 2.3],
    [/pom|acetal|delrin/, 2.8],
    [/pps|ppa/, 2.4],
    [/peek|pei|ultem/, 2.5],
    [/pbt/, 2.5],
    [/pa12/, 2.2],
    [/pa6|pa66|nylon/, 2.0],
    [/san|asa/, 2.0],
    [/hips|gpps|\bps\b/, 2.0],
    [/mppe|ppe|ppo|noryl/, 2.2],
    [/abs/, 2.0],
    [/pc|lexan|glazing/, 2.5],
    [/pet/, id.includes('gf') ? 2.5 : 3.0],
    [/tpo/, 3.2],
    [/pp-(gf|lgf|t20|t30)/, 3.0],
    [/hdpe|ldpe|lldpe/, 3.5],
    [/fpvc/, 3.0],
    [/upvc|pvc/, 2.5],
    [/pp/, 3.16],   // all polypropylene incl copoly / impact / bm / pcr
  ];
  for (const [re, f] of rules) if (re.test(id)) return f;
  return 2.5;
}

export function getInjectionMouldingInputSchema(): Record<string, string> {
  return {
    materialId: 'string — resin material ID in rate library',
    partWeightKg: 'number — finished part weight kg (one cavity)',
    runnerWeightKg: 'number — total runner/sprue weight per shot kg',
    regrindFraction: 'number 0–1 — fraction of runner weight recovered as regrind',
    cavities: 'number — number of cavities in tool',
    projectedAreaCm2: 'number — total projected area of all cavities cm²',
    cavityPressureMPa: 'number — cavity pressure MPa (default 30)',
    wallThicknessMm: 'number — nominal wall thickness mm (drives cool time)',
    coolTimeFactorSPerMm2: 'number — cooling constant s/mm² (3.16 for PP; ~2.0 for ABS)',
    fillTimeSec: 'number — injection fill time s',
    packTimeSec: 'number — packing/holding time s',
    ejectTimeSec: 'number — mould open + eject + close time s',
    machineId: 'string — IMM machine ID from rate library',
    labourId: 'string — labour rate ID',
    oee: 'number 0–1',
    manning: 'number — operators per machine',
    labourEfficiency: 'number 0–1',
    mouldCost: 'number? — total mould cost £. Omit/≤0 to estimate parametrically from cavities, area, steel class, side-actions and runner type',
    steelClass: 'prototype|standard|production|high_volume — tool durability class (mould-cost estimator only)',
    sideActionsLifters: 'number? — count of slides + lifters for undercuts (mould-cost estimator only)',
    hotRunnerDrops: 'number? — hot-runner gate count (mould-cost estimator only; default = cavities)',
    mouldLife: 'number — shots per mould life. numMoulds = ceil(amortVol / (mouldLife × cavities)); drives total tooling cost',
    amortizationVolume: 'number — parts over which to amortize mould cost',
    toleranceMm: 'number? — tightest part tolerance mm. Multiplier applied to mould cost: >=0.2→×1.0, >=0.1→×1.2, >=0.05→×1.5, <0.05→×2.0',
    surfaceFinishGrade: 'standard|textured|high_gloss|painted — mould surface finish. Multiplier on mould cost: standard×1.0, textured×1.1, high_gloss×1.4, painted×1.6 (cosmetic mould only)',
    rejectRate: 'number 0–1 (optional) — moulding scrap fraction; uplifts effective cycle time and material',
  };
}

/**
 * Estimate required clamping force (tonnes) from projected area and cavity pressure.
 * Use to validate machine selection. Safety factor = 1.15 standard.
 */
export function estimateClampingTonnage(inputs: Pick<InjectionMouldingInputs, 'projectedAreaCm2' | 'cavityPressureMPa'> & { safetyfactor?: number }): number {
  const sf = inputs.safetyfactor ?? 1.15;
  // Force (N) = area_m2 × pressure_Pa = area_cm2 × 1e-4 m2 × pressure_MPa × 1e6 Pa
  const forceN = inputs.projectedAreaCm2 * 1e-4 * inputs.cavityPressureMPa * 1e6 * sf;
  return forceN / 9806.65; // convert N to tonnes-force
}

export function computeInjectionMouldingDrivers(inputs: InjectionMouldingInputs): CommodityDrivers {
  const rejectUplift = (inputs.rejectRate && inputs.rejectRate > 0)
    ? 1 / (1 - inputs.rejectRate)
    : 1;

  // Tolerance → mould cost multiplier
  const toleranceFactor =
    inputs.toleranceMm === undefined ? 1.0 :
    inputs.toleranceMm >= 0.20 ? 1.0 :
    inputs.toleranceMm >= 0.10 ? 1.2 :
    inputs.toleranceMm >= 0.05 ? 1.5 :
    2.0;

  // Surface finish → mould cost multiplier (also slows cooling for high-gloss)
  const finishFactors: Record<string, { tooling: number; coolTime: number }> = {
    standard:   { tooling: 1.00, coolTime: 1.00 },
    textured:   { tooling: 1.10, coolTime: 1.00 },
    high_gloss: { tooling: 1.40, coolTime: 1.15 },
    painted:    { tooling: 1.60, coolTime: 1.00 },
  };
  const finishFactor = finishFactors[inputs.surfaceFinishGrade ?? 'standard'] ?? finishFactors.standard;

  // Cooling time
  const coolTimeSec = inputs.coolTimeFactorSPerMm2 * inputs.wallThicknessMm ** 2 * finishFactor.coolTime;
  const totalCycleTimeSec = inputs.fillTimeSec + inputs.packTimeSec + coolTimeSec + inputs.ejectTimeSec;
  const cycleTimeHr = totalCycleTimeSec / 3600;

  // Effective material: for hot runners there is no runner waste (plastic stays in manifold)
  const effectiveRunnerWeightKg = inputs.runnerSystem === 'hot' ? 0 : inputs.runnerWeightKg;
  const runnerWastePerCavity = (effectiveRunnerWeightKg / inputs.cavities) * (1 - inputs.regrindFraction);
  const grossPerPart = inputs.partWeightKg + runnerWastePerCavity;
  const materialUtilization = inputs.partWeightKg / grossPerPart;

  const rawMaterial: RawMaterialInput = {
    materialId: inputs.materialId,
    netWeightKg: inputs.partWeightKg * rejectUplift,
    materialUtilization,
  };

  const effectiveCycleTimeHr = cycleTimeHr * rejectUplift;

  const operations: OperationInput[] = [
    {
      operationName: 'Injection Moulding',
      machineId: inputs.machineId,
      labourId: inputs.labourId,
      cycleTimeHr: effectiveCycleTimeHr,
      partsPerCycle: inputs.cavities,
      oee: inputs.oee,
      manning: inputs.manning,
      labourTimeHr: effectiveCycleTimeHr,
      labourEfficiency: inputs.labourEfficiency,
    },
  ];

  // Base mould cost: use the manual figure if provided, else estimate it parametrically.
  const baseMouldCost = (inputs.mouldCost && inputs.mouldCost > 0)
    ? inputs.mouldCost
    : estimateMouldCost({
        cavities: inputs.cavities,
        projectedAreaCm2: inputs.projectedAreaCm2,
        steelClass: inputs.steelClass,
        sideActionsLifters: inputs.sideActionsLifters,
        runnerSystem: inputs.runnerSystem,
        hotRunnerDrops: inputs.hotRunnerDrops,
      }).total;

  // mouldLife is in shots; one shot produces `cavities` parts
  const shotsNeeded = inputs.amortizationVolume / inputs.cavities;
  const numMoulds = inputs.mouldLife > 0 ? Math.ceil(shotsNeeded / inputs.mouldLife) : 1;
  const tooling: ToolingInput = {
    totalToolingCost: baseMouldCost * numMoulds * toleranceFactor * finishFactor.tooling,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}
