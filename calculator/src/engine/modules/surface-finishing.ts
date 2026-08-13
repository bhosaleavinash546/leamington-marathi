/**
 * Surface finishing as a step inside a commodity, not a separate study.
 *
 * ## Why this exists
 *
 * Sheet metal, casting and forging carried NO surface treatment. Forging had a
 * flat `descaleCostPerKg`, casting had nothing, sheet metal had a generic
 * `extraConsumablesPerPart`. Coating was reachable only as the standalone
 * `painting` commodity, so a coated bracket was costed as a bare bracket and the
 * coating was either added by hand in a second study or — much more often —
 * forgotten. On a thin stamping that is a large fraction of the part.
 *
 * ## The one thing to get right: what the cost is charged against
 *
 * Coating is priced per SQUARE METRE. These commodities are driven by MASS. The
 * conversion between them is not a constant — it is set by wall thickness, and
 * it varies about 8x between a 1.5 mm stamping and a 12 mm forging. That is why
 * `surface-geometry-bridge.ts` exists and why a "£/kg coating" factor with no
 * stated product form is meaningless. Measured CAD area is preferred over the
 * bridge every time.
 *
 * ## Stages run on different machines, and this splits them
 *
 * A casting route is shot blast -> impregnate -> pre-treat -> e-coat -> cure.
 * The blast wheel, the vacuum vessel and the paint line are three different
 * pieces of equipment with three different hourly rates, and emitting one
 * operation for all of them would cost blasting at paint-line rates. So stages
 * are grouped by the machine they actually run on and one operation is emitted
 * per group.
 *
 * This is also how we avoid the source workbook's own known defect. It costs
 * every process as a standalone line with its own overhead, capital and permit,
 * then subtracts a 25-35% "integrated-line credit" to undo the double-count.
 * Grouping stages onto the line that really runs them means there is nothing to
 * credit back — and no correction factor to get wrong.
 */
import type { OperationInput } from '../types.js';
import {
  computeSurfaceTreatment, type SurfaceTreatmentBreakdown,
} from '../surface-treatment-rate.js';
import {
  findSurfaceStage, surfaceDataWarning, DEFAULT_SURFACE_LINE, type SurfaceStage,
} from '../surface-treatment-data.js';
import { coatedArea, type CoatedAreaResult } from '../surface-geometry-bridge.js';

/** Machine groups a finishing route can span. */
export type SurfaceLineGroup = 'blast' | 'mass_finish' | 'impregnation' | 'galvanise' | 'coating';

/** Which physical line each stage runs on. */
export function lineGroupFor(stage: SurfaceStage): SurfaceLineGroup {
  switch (stage.id) {
    case 'SF-08': return 'blast';           // shot blast
    case 'SF-09': return 'mass_finish';     // vibratory bowl
    case 'SF-24': return 'impregnation';    // vacuum resin
    case 'SF-21': return 'galvanise';       // hot dip kettle
    default: return 'coating';              // the wet / paint / plating line
  }
}

/** The machine each group runs on, and what to call the operation. */
const GROUP_MACHINE: Record<SurfaceLineGroup, { machineId: string; name: string }> = {
  blast: { machineId: 'blast-machine', name: 'Shot Blast' },
  mass_finish: { machineId: 'mass-finish-bowl', name: 'Mass Finishing' },
  impregnation: { machineId: 'impregnation-plant', name: 'Resin Impregnation' },
  galvanise: { machineId: 'galvanising-kettle', name: 'Hot Dip Galvanise' },
  coating: { machineId: 'paint-line-std', name: 'Coating Line' },
};

/**
 * The coating-line machine a route implies.
 *
 * Same rule the rest of the tool follows — pick the machine the PROCESS needs
 * rather than leaving whatever the form defaulted to. A zinc route on a paint
 * line's build-up (gas ovens, booths, RTO) over-states it about 2x.
 */
export function coatingMachineFor(stages: SurfaceStage[]): { machineId: string; name: string } {
  const coating = stages.filter(s => lineGroupFor(s) === 'coating');
  const plating = coating.find(s => s.kind === 'plating');
  if (!plating) return { machineId: 'paint-line-std', name: 'Paint Line' };
  if (/anodis/i.test(plating.label)) {
    return { machineId: 'plating-line-rack', name: 'Anodising Line' };
  }
  // Barrel is the high-volume default; rack work is jigged individually and is
  // selected explicitly by the caller when that is what the shop does.
  return { machineId: 'plating-line-barrel', name: 'Plating Line' };
}

export interface SurfaceFinishingInputs {
  /** Stage keys in process order. */
  stages: string[];
  /** Wetted area measured from CAD, m². Preferred over the bridge. */
  measuredAreaM2?: number;
  /** Reference product form for the bridge, e.g. 'sheet_standard'. */
  productForm?: string;
  /** Part mass, kg. Needed for the bridge and for every mass-basis stage. */
  massKg?: number;
  /** The part's own wall/section thickness, mm — overrides the form default. */
  thicknessMm?: number;

  labourId: string;
  /** Override the coating-line machine the route would otherwise imply. */
  coatingMachineId?: string;
  partsPerRack?: number;
  racksPerHour?: number;
  oee?: number;
  manning?: number;
  labourEfficiency?: number;
  depositThicknessUm?: number;
  /** Masked features per part. Masking is charged per feature, and twice. */
  maskedFeatures?: number;
  colourChangeCostGBP?: number;
  partsPerColourRun?: number;
  region?: string;

  /** Annual coated volume, for the e-coat viability threshold. */
  annualVolume?: number;
  /**
   * Substrate tensile strength, MPa. Above ~1000 an electroplated steel part
   * MUST have a de-embrittlement bake — this is a specification requirement,
   * not a cost option.
   */
  tensileStrengthMPa?: number;
  /** First-pass plating reject fraction, for the strip-and-re-plate uplift. */
  platingRejectPct?: number;
  /**
   * A legacy flat cost the commodity already charges that this route may now
   * duplicate — forging's `descaleCostPerKg` against a real shot-blast stage.
   *
   * The duplicate is REPORTED, not silently removed: the user set both fields
   * deliberately as far as the tool can tell, and quietly zeroing one would
   * change the number with nothing on the record to say why.
   */
  supersededFlatCost?: { label: string; perPart: number; supersededByStageId: string };
}

export interface SurfaceFinishingResult {
  operations: OperationInput[];
  /** Chemistry, effluent, deposited metal and colour change — material bucket. */
  consumablesPerPart: number;
  areaM2: number;
  area: CoatedAreaResult;
  surface: SurfaceTreatmentBreakdown;
  warnings: string[];
  basis: string;
}

/** Roughly what a rejected plated part costs against a first-pass one. */
export const PLATING_REWORK_MULTIPLE = 4.5;

export function computeSurfaceFinishing(
  inputs: SurfaceFinishingInputs,
): SurfaceFinishingResult {
  const warnings: string[] = [];
  const dataWarning = surfaceDataWarning();
  if (dataWarning) warnings.push(dataWarning);

  const stages = inputs.stages.map(key => {
    const s = findSurfaceStage(key);
    if (!s) {
      throw new Error(
        `No surface-treatment stage "${key}" in the library. Add it to `
        + 'surface-treatment-data.ts rather than dropping it from the route.');
    }
    return s;
  });
  if (stages.length === 0) {
    throw new Error('A surface-finishing route needs at least one stage.');
  }

  // ── Area: measured beats bridged, and the report says which ──────────────
  const area = coatedArea({
    ...(inputs.measuredAreaM2 !== undefined ? { measuredAreaM2: inputs.measuredAreaM2 } : {}),
    ...(inputs.massKg !== undefined ? { massKg: inputs.massKg } : {}),
    ...(inputs.productForm !== undefined ? { form: inputs.productForm } : {}),
    ...(inputs.thicknessMm !== undefined ? { thicknessMm: inputs.thicknessMm } : {}),
  });
  if (area.warning) warnings.push(area.warning);

  const surface = computeSurfaceTreatment({
    stages: inputs.stages,
    surfaceAreaM2: area.areaM2,
    ...(inputs.massKg !== undefined ? { massKg: inputs.massKg } : {}),
    ...(inputs.partsPerRack !== undefined ? { partsPerRack: inputs.partsPerRack } : {}),
    ...(inputs.racksPerHour !== undefined ? { racksPerHour: inputs.racksPerHour } : {}),
    ...(inputs.depositThicknessUm !== undefined
      ? { depositThicknessUm: inputs.depositThicknessUm } : {}),
    ...(inputs.maskedFeatures !== undefined ? { maskedFeatures: inputs.maskedFeatures } : {}),
    ...(inputs.colourChangeCostGBP !== undefined
      ? { colourChangeCostGBP: inputs.colourChangeCostGBP } : {}),
    ...(inputs.partsPerColourRun !== undefined
      ? { partsPerColourRun: inputs.partsPerColourRun } : {}),
    ...(inputs.region !== undefined ? { region: inputs.region } : {}),
  });
  if (surface.throughputCappedBy) {
    warnings.push(
      `Line throughput is limited by the process, not the conveyor: ${surface.throughputCappedBy}. `
      + 'A thicker deposit occupies the tank for longer, so it costs more in line time as well '
      + 'as in chemistry.');
  }
  if ((inputs.partsPerRack ?? 1) === 1) {
    warnings.push(
      'Parts per rack defaults to 1, which is deliberately pessimistic — every time-based cost '
      + 'is being carried by a single part. Racking is usually the cheapest saving available on '
      + 'a surface-treatment line, so confirm the real figure before quoting.');
  }

  // ── One operation per physical line ──────────────────────────────────────
  // The cycle time is split across groups in proportion to dwell, because that
  // is what each machine is actually occupied for. Lumping it onto one machine
  // would charge blast time at coating-line rates or the reverse.
  const coatingMachine = inputs.coatingMachineId
    ? { machineId: inputs.coatingMachineId, name: 'Coating Line' }
    : coatingMachineFor(stages);

  const groups = new Map<SurfaceLineGroup, SurfaceStage[]>();
  for (const s of stages) {
    const g = lineGroupFor(s);
    groups.set(g, [...(groups.get(g) ?? []), s]);
  }

  const dwellOf = (list: SurfaceStage[]): number =>
    list.reduce((sum, s) => sum + (surface.perStage.find(x => x.id === s.id)?.dwellMinutes ?? 0), 0);
  const totalDwell = dwellOf(stages);

  const operations: OperationInput[] = [];
  for (const [group, list] of groups) {
    const share = totalDwell > 0 ? dwellOf(list) / totalDwell : 1 / groups.size;
    const cycleHr = surface.cycleTimeHr * share;
    if (!(cycleHr > 0)) continue;
    const m = group === 'coating' ? coatingMachine : GROUP_MACHINE[group];
    operations.push({
      operationName: m.name,
      machineId: m.machineId,
      labourId: inputs.labourId,
      cycleTimeHr: cycleHr,
      partsPerCycle: 1,
      oee: inputs.oee ?? 0.85,
      manning: inputs.manning ?? DEFAULT_SURFACE_LINE.lineManning.value,
      labourTimeHr: cycleHr,
      labourEfficiency: inputs.labourEfficiency ?? 0.95,
    });
  }

  // Masking is per-part MANUAL work at a bench, not line time. It carries no
  // machine cycle, which is why it is flagged as a bench operation — the
  // validator otherwise rejects a zero cycle time and the whole costing fails.
  if (surface.maskingSeconds > 0) {
    operations.push({
      operationName: 'Masking / de-masking',
      machineId: coatingMachine.machineId,
      labourId: inputs.labourId,
      cycleTimeHr: 0,
      partsPerCycle: 1,
      oee: 1,
      manning: 1,
      labourTimeHr: surface.maskingSeconds / 3600,
      labourEfficiency: inputs.labourEfficiency ?? 0.95,
      benchOperation: true,
    });
  }

  // Masking labour is an OPERATION, so it must not also be a consumable.
  const consumablesPerPart = surface.chemistryPerPart + surface.effluentPerPart
    + surface.depositedMetalPerPart + surface.colourChangePerPart;

  warnings.push(...routeWarnings(stages, inputs, surface, area));

  const basis =
    `${area.basis}. ${surface.basis} Lines: `
    + [...groups.keys()].map(g => (g === 'coating' ? coatingMachine.name : GROUP_MACHINE[g].name))
      .join(' + ') + '.';

  return { operations, consumablesPerPart, areaM2: area.areaM2, area, surface, warnings, basis };
}

/**
 * Map a drawing's finish callout onto a route the engine can cost.
 *
 * The AI reads the note off the drawing; THIS decides what it means. Keeping
 * the mapping deterministic is the golden rule in miniature — a model that
 * returned "zinc plate" as free text must not be able to select a price, and a
 * callout nobody has taught this function returns null rather than guessing at
 * a route that might be 5x out.
 *
 * Order matters: the more specific patterns are tested first, because
 * "zinc-nickel" contains "zinc" and "hot dip galvanise" contains neither.
 */
const CALLOUT_PATTERNS: Array<[RegExp, string]> = [
  [/zinc[\s-]*nickel|zn[\s-]*ni\b/i, 'zinc_nickel'],
  [/zinc[\s-]*flake|geomet|delta[\s-]*tone|dacromet/i, 'zinc_flake'],
  [/hot[\s-]*dip|galvani[sz]|iso\s*1461/i, 'galvanise'],
  [/anodi[sz]/i, 'anodise'],
  [/e[\s-]*coat|electrocoat|\bktl\b|\bced\b|cathodic/i, 'e_coat'],
  [/powder[\s-]*coat/i, 'powder_coat'],
  [/zinc[\s-]*plate|electro[\s-]*zinc|\bzn\b|passivat/i, 'zinc_plate'],
  [/shot[\s-]*blast|grit[\s-]*blast|descal|sa\s*2\.5/i, 'blast_only'],
  [/vibratory|mass[\s-]*finish|deburr|tumbl/i, 'mass_finish'],
];

/**
 * The route a drawing callout implies, or null when nothing matches.
 *
 * Null is a real answer: it means "the drawing says something this tool does
 * not recognise", and the honest response is to ask the engineer rather than to
 * cost the nearest-looking process.
 */
export function surfaceRouteFromCallout(callout: string | null | undefined): string | null {
  if (!callout || typeof callout !== 'string') return null;
  for (const [re, route] of CALLOUT_PATTERNS) {
    if (re.test(callout)) return route;
  }
  return null;
}

/**
 * What a commodity form accepts — everything except the facts the commodity
 * already knows about the part (its mass, its labour grade, its region).
 */
export type CommodityFinishingInput =
  Omit<SurfaceFinishingInputs, 'labourId' | 'massKg' | 'region'>
  & { labourId?: string; massKg?: number; region?: string };

/**
 * Adapter for the commodity modules: fills in what the commodity already knows,
 * so `sheet-metal.ts`, `casting.ts` and `forging.ts` each need two lines rather
 * than twenty. Returns null when no finishing was requested, which is the case
 * for every existing caller — that is what keeps their costs bit-identical.
 */
export function finishingForCommodity(
  spec: CommodityFinishingInput | undefined,
  defaults: { massKg: number; labourId: string; region?: string; productForm?: string },
): SurfaceFinishingResult | null {
  if (!spec) return null;
  return computeSurfaceFinishing({
    ...spec,
    labourId: spec.labourId ?? defaults.labourId,
    massKg: spec.massKg ?? defaults.massKg,
    ...(spec.region ?? defaults.region ? { region: spec.region ?? defaults.region } : {}),
    ...(spec.productForm ?? defaults.productForm
      ? { productForm: spec.productForm ?? defaults.productForm } : {}),
  });
}

/**
 * The rules a coating engineer would apply to a route, as warnings.
 *
 * Every one of these is a real specification or commercial consequence rather
 * than a modelling nicety, and each is a thing the model previously had no way
 * to say at all.
 */
function routeWarnings(
  stages: SurfaceStage[],
  inputs: SurfaceFinishingInputs,
  surface: SurfaceTreatmentBreakdown,
  area: CoatedAreaResult,
): string[] {
  const out: string[] = [];
  const has = (id: string): boolean => stages.some(s => s.id === id);
  const electroplated = stages.some(s => s.kind === 'plating' && s.deposit);

  // 1. Hydrogen embrittlement — a specification requirement, not an option.
  const tensile = inputs.tensileStrengthMPa ?? 0;
  if (electroplated && tensile >= 1000 && !has('SF-25')) {
    out.push(
      `Substrate at ${tensile} MPa is electroplated with no de-embrittlement bake in the route. `
      + 'ASTM B850 / ISO 4042 make the bake MANDATORY above roughly 1000 MPa or 31 HRC, and it '
      + 'must start within 4 hours of plating. Add it, or move to zinc flake (SF-20), which '
      + 'passes no current and needs no bake — that trade is why zinc flake wins on grade '
      + '10.9/12.9 fasteners and springs despite a higher headline rate.');
  }
  if (has('SF-25') && !electroplated) {
    out.push(
      'A de-embrittlement bake is in the route but nothing electroplates the part. The bake '
      + 'exists to drive off hydrogen charged in during plating; without plating it is cost and '
      + 'lead time for nothing.');
  }

  // 2. Masking applied once. The workbook calls this the most consistently
  //    omitted line in coating quotations, and it is applied TWICE.
  if (has('SF-13') && !has('SF-14')) {
    out.push(
      'Masking is in the route but de-masking is not. Masking is applied TWICE — mask before '
      + 'coating and de-mask after — so costing it once understates it by roughly a third. It is '
      + 'the most consistently omitted line in coating quotations.');
  }

  // 3. Coating-only stages need a pre-treatment, or you are comparing a
  //    five-stage tunnel against a wipe-down.
  const coatingOnly = ['SF-22', 'SF-23'].filter(has);
  const hasPretreat = ['SF-04', 'SF-05', 'SF-06'].some(has);
  if (coatingOnly.length > 0 && !hasPretreat) {
    out.push(
      'An organic coating (e-coat or powder) is in the route with no conversion pre-treatment. '
      + 'Both are costed COATING ONLY here. A powder-coating quote normally includes '
      + 'pre-treatment and a plating quote may not, so without it you are comparing a five-stage '
      + 'tunnel against a wipe-down — add zinc phosphate, iron phosphate or zirconium.');
  }

  // 4. E-coat below the volume where its capital is recoverable.
  const threshold = DEFAULT_SURFACE_LINE.eCoatViableAreaM2PerYear.value;
  if (has('SF-22') && inputs.annualVolume && inputs.annualVolume > 0) {
    const annualAreaM2 = area.areaM2 * inputs.annualVolume;
    if (annualAreaM2 < threshold) {
      out.push(
        `E-coat at ${Math.round(annualAreaM2).toLocaleString()} m²/yr is below the `
        + `~${threshold.toLocaleString()} m²/yr where its capital is recoverable. Powder coating `
        + 'beats it on cost at this volume despite worse corrosion performance — the line costs '
        + 'the same whether or not your parts are on it.');
    }
  }

  // 5. A plating reject is not a 1x loss.
  const reject = inputs.platingRejectPct ?? 0;
  if (electroplated && reject > 0) {
    const uplift = reject * PLATING_REWORK_MULTIPLE;
    out.push(
      `A ${(reject * 100).toFixed(1)}% plating reject is nearer a ${(uplift * 100).toFixed(1)}% `
      + 'cost adder, not 1x: a rejected part must be chemically stripped and re-plated, which '
      + `costs roughly ${PLATING_REWORK_MULTIPLE}x a first-pass part (strip cycle plus the full `
      + 'original plating again). Budget it as rework, not as scrap.');
  }

  // 6. A legacy flat cost the route now does properly — counted twice.
  const sup = inputs.supersededFlatCost;
  if (sup && sup.perPart > 0 && has(sup.supersededByStageId)) {
    const stage = stages.find(s => s.id === sup.supersededByStageId)!;
    out.push(
      `DOUBLE COUNT: "${sup.label}" is charging £${sup.perPart.toFixed(4)}/part for the same work `
      + `as ${stage.label}, which is now in the route as a real mass-basis operation on its own `
      + 'machine. Both are in the cost. Clear the flat figure — it was a stand-in for exactly '
      + 'this stage.');
  }

  // 7. Deposited metal is a live pass-through, so say so.
  if (surface.depositedMetalPerPart > 0) {
    out.push(
      `Deposited metal is £${surface.depositedMetalPerPart.toFixed(4)}/part and is a PASS-THROUGH, `
      + 'not conversion cost — galvanisers publish an explicit monthly zinc surcharge set from '
      + 'the prior month\'s LME price, recently 33-37%. It is held static here so the should-cost '
      + 'is reproducible; refresh it knowingly, and note no supplier can quote below it.');
  }

  return out;
}
