/**
 * Machining time and the machining cell's other costs, from measured geometry.
 *
 * One model for every path that machines: a part cut from bar or plate
 * (`machining`), the finish machining of a casting (`cast_and_machine`), and the
 * secondary machining of a casting or forging. It replaces two numbers the
 * machining review (2 Oct 2026) found could not be defended:
 *
 * - the kernel's `cncCycleTimeEstimate`: planar face area ÷ a flat 5,000 mm²/min
 *   plus 0.5 min a bore — the same for aluminium and steel, and blind to the
 *   metal actually removed. A 274 mm bracket hollowed out of a 2.2 dm³ block was
 *   given 2.7 minutes of milling;
 * - the near-net ceiling `0.10 h + 0.07 h/kg`, a cap that became the value.
 *
 * What a standard machining should-cost does instead, and this does:
 *
 * | Element | How |
 * |---|---|
 * | Stock | plate or bar bought in standard sizes, with facing allowance and saw kerf |
 * | Roughing | metal removed (stock − part) ÷ the catalogue's medium-duty removal rate, + a stated air-move share |
 * | Finishing | measured area per surface type: flats, walls, fillets and chamfers by side-milling passes at the catalogue's shoulder-mill feed; free-form at a ball-nose surfacing rate (no catalogue row — labelled) |
 * | Facing (near-net) | passes × (face length + cutter Ø + clearances) ÷ the catalogue table feed n·z·fz |
 * | Turning | area ÷ (fn × vc), stock ÷ (vc × fn × ap) |
 * | Holes | drilled, bored and tapped at each hole's own Ø (n·f; tapping n × pitch) — `featureTime` |
 * | Non-cutting | fixed approach allowances (not scaled by the metal), load / clamp / unload per fixturing, 2.2 s tool changes |
 * | Cutting tools | tool wear per minute of cutting, by metal |
 *
 * Since the report standard round (3 Nov 2026) every cutting speed and feed is a maker's published recommendation for
 * the metal and operation (cutting-catalogue.ts — each basis names the catalogue and its data.json row); the cutter
 * bodies, side-pass depth, clearances, allowances and air-move share no catalogue gives are labelled assumptions. Still
 * not a measured cycle: a supplier's cycle sheet replaces it. AI never sets any of them.
 */
import { activeToolroomFactor } from './rate-context.js';
import { VOLUME_CELL_MIN_ANNUAL, PALLET_CHANGE_SEC, HMC_SIDES_PER_CLAMPING, HMC_MACHINE_ID } from './routing-optimiser.js';
import type { MaterialFamily } from './material-family.js';
import type { FeatureRow } from './feature-ops.js';
import { featureTime, defaultInclude, holeWork, isLandRow, ALLOWANCE_STATUS } from './feature-machining.js';
import {
  millRoughEffective, turnRoughEffective, millRoughInCut, turnRoughInCut, sidePassCm2PerMin, turnFinishCm2PerMin,
  sourcesLine, sourceName, MACHINABILITY_RATIO, ROUGH_AIR_SHARE, TURN_ROUGH_AP_MM, SIDE_PASS_AP_MM, ASSUMED,
} from './cutting-catalogue.js';
export { nearNetHoleMinutes } from './feature-machining.js';

export interface CuttingData {
  /** CostVision's machinability ratio against aluminium — used ONLY where no catalogue row was read (ball-nose surfacing,
   *  helical milling, and metals outside the catalogue). Engineering-typical, not sourced. */
  timeFactor: number;
  /** Roughing removal rate on a machining centre, cm³/min: the catalogue's in-cut rate ÷ (1 + the air-move share). */
  millRoughCm3PerMin: number;
  /** Roughing removal rate turning, cm³/min: vc × fn × ap ÷ (1 + the air-move share). */
  turnRoughCm3PerMin: number;
  /** Perishable cutting tools (inserts, end mills, drills) per minute of cutting, £. */
  toolCostPerCutMin: number;
}

/**
 * Cutting data by metal family. The removal rates are derived from the catalogue (cutting-catalogue.ts) — never typed
 * here; tool wear £/min is engineering-typical, not sourced.
 */
const TOOL_COST_PER_CUT_MIN: Record<MaterialFamily, number> = {
  aluminium: 0.04, magnesium: 0.04, plastic: 0.02, 'copper alloy': 0.06, 'cast iron': 0.10, steel: 0.12, titanium: 0.35,
  zinc: 0.04, 'nickel alloy': 0.50,
};
export const CUTTING_DATA: Record<MaterialFamily, CuttingData> = Object.fromEntries(
  (Object.keys(MACHINABILITY_RATIO) as MaterialFamily[]).map(f => [f, {
    timeFactor: MACHINABILITY_RATIO[f],
    millRoughCm3PerMin: millRoughEffective(f),
    turnRoughCm3PerMin: turnRoughEffective(f),
    toolCostPerCutMin: TOOL_COST_PER_CUT_MIN[f],
  }]),
) as Record<MaterialFamily, CuttingData>;

/**
 * Ball-nose surfacing of free-form area in aluminium, cm²/min (Ø10, 0.5 mm step, 3 m/min) — no catalogue row was read,
 * so it alone keeps the machinability ratio. `wall` and `turning` are kept for older callers only; the costing reads the
 * catalogue's side-pass and fn × vc rates.
 */
export const FINISH_RATE_CM2_PER_MIN = { wall: 40, surfacing: 10, turning: 120 } as const;

/** The status every cutting basis prints (arith audit, Oct 2026: rates were printed without one). */
export const CUTTING_DATA_STATUS = 'cutting speeds and feeds from the makers\' published recommendations (sources named); cutter bodies, '
  + 'side-pass depth, clearances, allowances and the air-move share are labelled assumptions — not a measured cycle';
/** What the turning basis prints for the finish-turning rate (the old 3× derate is gone; approach is its own allowance). */
export const TURN_FINISH_STATUS = 'finish-turning area ÷ (fn × vc) from the catalogue; approach / retract a stated allowance per tool, '
  + `${ASSUMED}`;
/** Approach / retract a lathe tool pays, minutes — engineering-typical, not sourced, not scaled by the metal. */
export const TURN_TOOL_ALLOWANCE_MIN = 0.10;

/** Load, clamp, unclamp and unload — every part, every fixturing, minutes (the default). */
export const HANDLING_MIN_PER_FIXTURING = 0.8;

/**
 * Load / clamp / unload minutes per fixturing by the weight handled — a 50 g
 * blank drops into a vice in seconds, a 25 kg one needs a hoist. Engineering
 * typical (MTM-style handling standards).
 */
export const HANDLING_BY_WEIGHT: ReadonlyArray<{ upToKg: number; min: number }> = [
  { upToKg: 0.5, min: 0.3 },
  { upToKg: 5, min: 0.6 },
  { upToKg: 20, min: 1.2 },
  { upToKg: Infinity, min: 2.5 },
];
export function handlingMinPerFixturing(kg: number): number {
  return (HANDLING_BY_WEIGHT.find(h => kg <= h.upToKg) ?? HANDLING_BY_WEIGHT[HANDLING_BY_WEIGHT.length - 1]).min;
}
/** What the bases print for the handling, change-over, programming, tool-wear and deburr constants (arith audit, Oct 2026). */
export const HOURS_STATUS = 'handling, change-over, programming hours and tool £/min engineering-typical, not sourced';
/**
 * Chip-to-chip tool change, seconds: Okuma MA-4000H 2.15 s (ISO 10791-9, tool ≤ 4 kg; data.json #63), DMG MORI NHX 4000
 * 2.2 s (#69), Okuma MB-5000HII 2.1 s (#67); GROB G350 2.7 s to VDI 2852 (#68). No VMC or lathe figure was read — the
 * HMC figure is used for every machine and says so.
 */
export const TOOL_CHANGE_SEC = 2.2;
export const TOOL_CHANGE_STATUS = `${TOOL_CHANGE_SEC} s chip-to-chip (Okuma MA-4000H 2.15 s ISO 10791-9 / DMG MORI NHX 4000 2.2 s — ${sourceName('OKUMA-MA4000H')}; ${sourceName('DMG-NHX4000')}; an HMC figure, no VMC / lathe figure read)`;
/** Fixture change-over, tool offsets and first-off inspection per fixturing, minutes a batch. */
export const SETUP_MIN_PER_FIXTURING = 45;

/** Surface types finished at the wall rate (the rest are free-form and surfaced). */
const WALL_TYPES = new Set(['PLANE', 'CYLINDER', 'CONE', 'TORUS']);

export function cuttingDataFor(family: MaterialFamily): CuttingData {
  return CUTTING_DATA[family] ?? CUTTING_DATA.steel;
}

/** A shallow "hole" (depth < ¼ Ø, any Ø) is a land skimmed by one pass, not a drilled hole (feature-machining.ts). */
const isLand = (r: FeatureRow) => isLandRow(r);

/**
 * Metal inside the drilled, reamed and bored holes, cm³. The hole time (`holeMinutes`) removes it, so the roughing
 * (stock − part ÷ the removal rate) must not remove it again — it did, and every from-solid part paid twice for the
 * metal in its holes (arith audit, Oct 2026: 209 cm³ on Part1, 1.7 min). A land's metal is roughed (its time is a skim).
 */
export function holeVolumeCm3(rows: FeatureRow[]): number {
  return rows.filter(r => r.kind === 'hole' && !isLand(r))
    .reduce((s, r) => s + Math.PI * r.diaMm * r.diaMm / 4 * Math.max(r.depthMm, 0) * r.count, 0) / 1000;
}

/** Hole wall area, cm² — finished by the hole time, so not finished again as a wall. */
export function holeWallCm2(rows: FeatureRow[]): number {
  return rows.filter(r => r.kind === 'hole')
    .reduce((s, r) => s + Math.PI * r.diaMm * Math.max(r.depthMm, 0) * r.count, 0) / 100;
}

// ── Stock ───────────────────────────────────────────────────────────────────

/** Standard plate thicknesses, mm (UK aluminium / steel plate stockists). */
export const PLATE_MM = [3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90,
  100, 110, 120, 130, 140, 150, 160, 180, 200, 225, 250, 275, 300];
/** Standard round bar diameters, mm. */
export const BAR_MM = [6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 30, 32, 35, 38, 40, 45, 50, 55, 60, 65, 70,
  75, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200, 220, 250, 280, 300];
/** Allowance per side, mm: a skim on a plate's mill-finished faces, squaring on its sawn edges; saw kerf, mm. */
export const STOCK_ALLOWANCE = { facePerSideMm: 2.5, skimPerSideMm: 1, sawKerfMm: 3 } as const;

const nextSize = (sizes: number[], mm: number) => sizes.find(s => s >= mm - 1e-6) ?? Math.ceil(mm / 25) * 25;

export interface StockSize {
  form: 'plate' | 'bar';
  /** Bought size, mm: plate L × W × T, or bar Ø × L. */
  dimsMm: number[];
  cm3: number;
  basis: string;
}

/**
 * The stock a from-solid part is cut from.
 *
 * Plate: the part's thickness plus facing on both sides, rounded UP to a
 * stocked plate; length and width plus facing, the length plus a saw cut.
 * Bar (a turned part): the largest diameter plus facing, rounded up to a
 * stocked bar; the axial length plus facing at both ends and a parting cut.
 * The bounding box alone is not stock — nobody buys a block the exact size of
 * the finished part.
 */
export function stockSize(
  bboxSortedMm: readonly [number, number, number],
  turned: { maxDiaMm: number; lengthMm: number } | null,
): StockSize {
  const a = STOCK_ALLOWANCE;
  if (turned) {
    const dia = nextSize(BAR_MM, turned.maxDiaMm + 2 * a.facePerSideMm * 0.6);
    const len = turned.lengthMm + 2 * a.facePerSideMm + a.sawKerfMm;
    const cm3 = Math.PI * dia * dia / 4 * len / 1000;
    return {
      form: 'bar', dimsMm: [dia, Math.round(len * 10) / 10], cm3: Math.round(cm3 * 10) / 10,
      basis: `Ø${dia} mm bar (Ø${turned.maxDiaMm.toFixed(0)} + 3 mm turning allowance, next stocked size) × `
        + `${len.toFixed(0)} mm (${turned.lengthMm.toFixed(0)} + ${2 * a.facePerSideMm} facing + ${a.sawKerfMm} parting)`,
    };
  }
  const [L, W, T] = bboxSortedMm;
  const t = nextSize(PLATE_MM, T + 2 * a.skimPerSideMm);
  const w = W + 2 * a.facePerSideMm;
  const l = L + 2 * a.facePerSideMm + a.sawKerfMm;
  const cm3 = l * w * t / 1000;
  return {
    form: 'plate', dimsMm: [Math.round(l * 10) / 10, Math.round(w * 10) / 10, t], cm3: Math.round(cm3 * 10) / 10,
    basis: `${l.toFixed(0)} × ${w.toFixed(0)} mm cut from ${t} mm plate (part ${L.toFixed(0)} × ${W.toFixed(0)} × `
      + `${T.toFixed(0)}: ${a.facePerSideMm} mm a side to square the sawn edges + ${a.sawKerfMm} mm saw cut, `
      + `${a.skimPerSideMm} mm skim a face then the next stocked thickness)`,
  };
}

// ── Cutting time ────────────────────────────────────────────────────────────

export interface CuttingTime {
  roughMin: number;
  /** Wall-rate finishing (flats, walls, fillets, chamfers) — or finish turning on a lathe. */
  finishMin: number;
  /** Ball-nose surfacing of free-form area. */
  surfacingMin: number;
  holeMin: number;
  /** Distinct cutting tools the part calls for. */
  tools: number;
  toolChangeMin: number;
  /** Everything above. */
  totalMin: number;
  basis: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Distinct tools: roughing, finishing and chamfer cutters, a ball nose if surfaced, one per hole size. */
function toolCount(rows: FeatureRow[], surfaced: boolean): number {
  const holeSizes = new Set(rows.filter(r => r.kind === 'hole').map(r => Math.round(r.diaMm * 2) / 2));
  return 3 + (surfaced ? 1 : 0) + holeSizes.size;
}

/** Rough-milling minutes for a volume, and its basis: in-cut at the catalogue rate, + the air-move share. */
function roughMilling(family: MaterialFamily, cm3: number): { min: number; text: string } {
  const rc = millRoughInCut(family);
  const inCut = cm3 / rc.q;
  const min = inCut * (1 + ROUGH_AIR_SHARE);
  return { min, text: `rough ${cm3.toFixed(0)} cm³ ÷ ${rc.q.toFixed(0)} cm³/min in-cut (0.7 × Ø${rc.body.dc} × ap × ${rc.vf.toFixed(0)} mm/min; `
    + `Pc ≈ ${rc.kw.toFixed(1)} kW by Sandvik's K — ${sourceName('SANDVIK-K')}; no spindle rating in the rate book, so no power cap) = ${inCut.toFixed(2)} min `
    + `+ ${ROUGH_AIR_SHARE * 100}% air moves and step-downs (${ASSUMED}) = ${min.toFixed(2)} min` };
}

/** Holes, with each piece of work's arithmetic — coaxial steps of one bore timed as ONE stepped bore (`holeWork`). */
export function holeTimes(rows: FeatureRow[], family: MaterialFamily, coredAboveMm?: number): { min: number; text: string } {
  const work = holeWork(rows, family, coredAboveMm);
  const min = work.reduce((s, w) => s + w.minEach * w.count, 0);
  return { min, text: work.map(w => `${w.count}× ${w.label} ${w.calc}`).join('; ') };
}

/**
 * From-solid cutting time on a machining centre.
 *
 * `areaByTypeCm2` is the kernel's measured area per surface type; without it
 * every non-planar, non-hole area is surfaced (slower — the conservative side).
 */
export function fromSolidMillingTime(p: {
  family: MaterialFamily;
  partCm3: number;
  stockCm3: number;
  totalAreaCm2: number;
  planarAreaCm2: number;
  areaByTypeCm2: Record<string, number> | null;
  /** Free-form faces ÷ all faces — splits the area when no area per type was measured. */
  freeFormFaceShare?: number;
  rows: FeatureRow[];
}): CuttingTime {
  const cd = cuttingDataFor(p.family);
  const inHoles = Math.min(holeVolumeCm3(p.rows), Math.max(0, p.stockCm3 - p.partCm3));
  const removed = Math.max(0, p.stockCm3 - p.partCm3 - inHoles);
  const rough = roughMilling(p.family, removed);
  const roughMin = rough.min;
  const holeWall = holeWallCm2(p.rows);
  let wallCm2: number; let freeCm2: number;
  if (p.areaByTypeCm2) {
    wallCm2 = Object.entries(p.areaByTypeCm2).filter(([t]) => WALL_TYPES.has(t)).reduce((s, [, a]) => s + a, 0);
    freeCm2 = Object.entries(p.areaByTypeCm2).filter(([t]) => !WALL_TYPES.has(t)).reduce((s, [, a]) => s + a, 0);
    // Hole walls are finished by the hole time, not again as walls.
    wallCm2 = Math.max(0, wallCm2 - holeWall);
  } else {
    // An older measurement with no area per type: split the area that is not a
    // hole wall by the share of faces that are free-form.
    const rest = Math.max(0, p.totalAreaCm2 - holeWall);
    const share = p.freeFormFaceShare ?? 0.5;
    freeCm2 = Math.min(rest - Math.min(rest, p.planarAreaCm2), rest * share);
    wallCm2 = rest - freeCm2;
  }
  const side = sidePassCm2PerMin(p.family);
  const finishMin = wallCm2 / side;
  const surfRate = FINISH_RATE_CM2_PER_MIN.surfacing / cd.timeFactor;
  const surfacingMin = freeCm2 / surfRate;
  const holes = holeTimes(p.rows, p.family);
  const holeMin = holes.min;
  const tools = toolCount(p.rows, freeCm2 > 0.5);
  const toolChangeMin = tools * TOOL_CHANGE_SEC / 60;
  const totalMin = roughMin + finishMin + surfacingMin + holeMin + toolChangeMin;
  return {
    roughMin: r2(roughMin), finishMin: r2(finishMin), surfacingMin: r2(surfacingMin), holeMin: r2(holeMin),
    tools, toolChangeMin: r2(toolChangeMin), totalMin: r2(totalMin),
    basis: `stock − part ${(p.stockCm3 - p.partCm3).toFixed(0)} cm³`
      + (inHoles > 0.05 ? ` − ${inHoles.toFixed(0)} cm³ in the holes (cut by the hole time)` : '')
      + `: ${rough.text}; `
      + `finish ${wallCm2.toFixed(0)} cm² of flats/walls/fillets by side passes ÷ ${side.toFixed(0)} cm²/min `
      + `(${SIDE_PASS_AP_MM} mm a pass, ${ASSUMED}) = ${finishMin.toFixed(1)} min; `
      + `surface ${freeCm2.toFixed(0)} cm² free-form ÷ ${surfRate.toFixed(1)} cm²/min (ball nose ${FINISH_RATE_CM2_PER_MIN.surfacing} cm²/min in aluminium ÷ machinability ratio ${cd.timeFactor} — no catalogue row read, ${ASSUMED}) = ${surfacingMin.toFixed(1)} min; `
      + `holes ${holeMin.toFixed(1)} min${holes.text ? ` (${holes.text})` : ''}; ${tools} tools × ${TOOL_CHANGE_SEC} s = ${toolChangeMin.toFixed(2)} min `
      + `(${TOOL_CHANGE_STATUS}; ${ALLOWANCE_STATUS}; sources — ${sourcesLine(p.family, ['rough', 'side', 'drill', 'tap'])}; ${CUTTING_DATA_STATUS})`,
  };
}

/** Lathe finishing: area ÷ (fn × vc), stated. */
function turnFinish(family: MaterialFamily, cm2: number): { min: number; rate: number } {
  const rate = turnFinishCm2PerMin(family);
  return { min: cm2 / rate, rate };
}

/**
 * From-bar cutting time on a lathe, plus what the lathe cannot do.
 *
 * The coaxial revolved surfaces and the shoulders square to them are turned;
 * the rest of the area (a keyway, flats) is milled; holes are drilled.
 */
export function fromBarTurningTime(p: {
  family: MaterialFamily;
  partCm3: number;
  stockCm3: number;
  totalAreaCm2: number;
  turnedFraction: number;
  rows: FeatureRow[];
}): { lathe: CuttingTime; mill: CuttingTime } {
  // the holes' metal is cut by the hole time on the mill / drill, not turned away (arith audit, Oct 2026)
  const inHoles = Math.min(holeVolumeCm3(p.rows), Math.max(0, p.stockCm3 - p.partCm3));
  const removed = Math.max(0, p.stockCm3 - p.partCm3 - inHoles);
  const turnedCm2 = p.totalAreaCm2 * p.turnedFraction;
  const qTurn = turnRoughEffective(p.family);
  const roughMin = removed / qTurn;
  const fin = turnFinish(p.family, turnedCm2);
  const finishMin = fin.min;
  const latheTools = 3;   // rough, finish, groove / part-off
  const allowMin = latheTools * TURN_TOOL_ALLOWANCE_MIN;
  const lathe: CuttingTime = {
    roughMin: r2(roughMin), finishMin: r2(finishMin), surfacingMin: 0, holeMin: 0,
    tools: latheTools, toolChangeMin: r2(latheTools * TOOL_CHANGE_SEC / 60),
    totalMin: r2(roughMin + finishMin + allowMin + latheTools * TOOL_CHANGE_SEC / 60),
    basis: `turn ${removed.toFixed(0)} cm³ ÷ ${qTurn} cm³/min (vc × fn × ${TURN_ROUGH_AP_MM} mm ap = ${turnRoughInCut(p.family).toFixed(0)} in-cut `
      + `÷ (1 + ${ROUGH_AIR_SHARE} air moves); ap and air share ${ASSUMED}) = ${roughMin.toFixed(1)} min`
      + (inHoles > 0.05 ? ` (stock − part − ${inHoles.toFixed(1)} cm³ in the holes)` : '') + '; '
      + `finish-turn ${turnedCm2.toFixed(0)} cm² ÷ ${fin.rate.toFixed(0)} cm²/min (fn × vc) = ${finishMin.toFixed(1)} min; `
      + `${latheTools} tools × (${TURN_TOOL_ALLOWANCE_MIN} min approach / retract + ${TOOL_CHANGE_SEC} s change) `
      + `(${p.family}; sources — ${sourcesLine(p.family, ['turn'])}; ${TURN_FINISH_STATUS})`,
  };
  const otherCm2 = Math.max(0, p.totalAreaCm2 - turnedCm2 - holeWallCm2(p.rows));
  const side = sidePassCm2PerMin(p.family);
  const millFinish = otherCm2 / side;
  const holes = holeTimes(p.rows, p.family);
  const holeMin = holes.min;
  const hasMill = otherCm2 > 0.5 || holeMin > 0;
  const millTools = hasMill ? 1 + new Set(p.rows.filter(r => r.kind === 'hole').map(r => Math.round(r.diaMm * 2) / 2)).size : 0;
  const mill: CuttingTime = {
    roughMin: 0, finishMin: r2(millFinish), surfacingMin: 0, holeMin: r2(holeMin),
    tools: millTools, toolChangeMin: r2(millTools * TOOL_CHANGE_SEC / 60),
    totalMin: r2(millFinish + holeMin + millTools * TOOL_CHANGE_SEC / 60),
    basis: `mill ${otherCm2.toFixed(0)} cm² not turned (keyways, flats) by side passes ÷ ${side.toFixed(0)} cm²/min = ${millFinish.toFixed(1)} min; `
      + `holes ${holeMin.toFixed(1)} min${holes.text ? ` (${holes.text})` : ''}; ${millTools} tools × ${TOOL_CHANGE_SEC} s `
      + `(${ALLOWANCE_STATUS}; sources — ${sourcesLine(p.family, ['side', 'drill', 'tap'])}; ${CUTTING_DATA_STATUS})`,
  };
  return { lathe, mill };
}

/** Hole minutes at the metal's own catalogue rows (cored bores above `coredAboveMm` finish-bored). */
export function holeMinutes(rows: FeatureRow[], family: MaterialFamily, coredAboveMm?: number): number {
  return holeTimes(rows, family, coredAboveMm).min;
}

// ── Near-net (casting / forging) finish machining ───────────────────────────

/**
 * Per-side machining stock a casting carries on a machined face, mm — the
 * required machining allowance of ISO 8062-3, at the RMA grade typical of each
 * process for a 100–250 mm casting. An assumption: no drawing input reaches it (the as-cast weight field overrides
 * the weight it builds).
 */
export const CAST_MACHINING_STOCK_MM: Record<string, number> = {
  sand_ferrous: 3.0, sand: 2.0, gravity: 1.5, investment: 1.0, hpdc: 0.5,
};

/** Holes above this are cored in a sand / gravity / investment casting; HPDC cores almost everything;
 *  an impression forging pierces (punches out the wad of) bores above ~25 mm. */
export const CORED_ABOVE_MM: Record<string, number> = { sand: 20, gravity: 20, investment: 20, hpdc: 6, forging: 25 };

export function castMachiningStockMm(subtype: string | null, family: MaterialFamily | null): number {
  if (subtype === 'sand' && (family === 'steel' || family === 'cast iron')) return CAST_MACHINING_STOCK_MM.sand_ferrous;
  return CAST_MACHINING_STOCK_MM[subtype ?? ''] ?? CAST_MACHINING_STOCK_MM.gravity;
}

/**
 * The finish machining a near-net part needs: its machined faces (the kernel's
 * `face` rows — the flats a casting has no draft on) faced once, its holes
 * drilled or finish-bored. Pockets and bosses are cast in.
 */
export function nearNetMachiningTime(
  rows: FeatureRow[], family: MaterialFamily, subtype: string | null,
  opts: { coredAboveMm?: number; finishFactor?: number } = {},
): CuttingTime & { otherMin: number; otherTools: number } {
  const cored = opts.coredAboveMm ?? CORED_ABOVE_MM[subtype ?? ''] ?? 20;
  const ff = opts.finishFactor && opts.finishFactor > 0 ? opts.finishFactor : 1;
  const faces = rows.filter(r => r.kind === 'face');
  const faceTimes = faces.map(r => featureTime(r, family));
  const faceMin = faces.reduce((s, r, i) => s + faceTimes[i].min * r.count, 0) * ff;
  // A pocket, slot or boss the engineer ticked on the form is milled / turned on the machining centre at its own feature
  // time (featureTime) — the same minutes the feature table prints. None is in the default set (they are cast / forged in).
  const others = rows.filter(r => r.kind !== 'face' && r.kind !== 'hole');
  const otherMin = others.reduce((s, r) => s + featureTime(r, family).min * r.count, 0) * ff;
  const holes = holeTimes(rows, family, cored);
  const holeMin = holes.min * ff;
  // A face mill if any face is machined, an end mill if a pocket / slot / boss is, a chamfer tool, one tool per hole size.
  const otherTools = others.length ? 1 : 0;
  const tools = (faces.length ? 1 : 0) + otherTools + 1 + new Set(rows.filter(r => r.kind === 'hole').map(r => Math.round(r.diaMm * 2) / 2)).size;
  const toolChangeMin = tools * TOOL_CHANGE_SEC / 60;
  const facedCm2 = faces.reduce((s, r) => s + (r.areaMm2 ?? 0) * r.count, 0) / 100;
  const ops: Array<'face' | 'drill' | 'bore' | 'tap'> = ['face', 'drill', 'bore', 'tap'];
  const finishNote = ff !== 1 ? ` × ${ff} tolerance / finish factor (as entered)` : '';
  return {
    roughMin: 0, finishMin: r2(faceMin + otherMin), surfacingMin: 0, holeMin: r2(holeMin),
    tools, toolChangeMin: r2(toolChangeMin), totalMin: r2(faceMin + otherMin + holeMin + toolChangeMin),
    otherMin: r2(otherMin), otherTools,
    basis: `face ${faces.reduce((s, r) => s + r.count, 0)} machined face(s), ${facedCm2.toFixed(0)} cm² = ${faceMin.toFixed(1)} min `
      + `(each: 0.2 min positioning + passes × (√area + cutter Ø + 2 × 5 mm clearance) ÷ the table feed n·z·fz — the face taken as √area square, `
      + `clearance ${ASSUMED}${faceTimes.length ? `; e.g. ${faceTimes[0].text}` : ''}${finishNote}); `
      + (others.length ? `${others.reduce((s, r) => s + r.count, 0)} pocket / slot / boss feature(s) ticked to machine, ${otherMin.toFixed(1)} min `
        + `(${others.map(r => `${r.count}× ${featureTime(r, family).text}`).join('; ')}${finishNote}); ` : '')
      + `holes ${holeMin.toFixed(1)} min (${cored === Infinity ? 'every hole drilled from solid' : `≤ Ø${cored} drilled from solid, larger cored and finish-bored`}${finishNote}); `
      + `${tools} tools × ${TOOL_CHANGE_SEC} s (${TOOL_CHANGE_STATUS}; ${ALLOWANCE_STATUS}; sources — ${sourcesLine(family, ops)}; `
      + `${CUTTING_DATA_STATUS})`,
  };
}

/**
 * The feature rows a near-net costing machines: the engineer's ticks when the form gives them, else the default set —
 * holes and the measured faces (`defaultInclude`; pockets and bosses are cast / forged in). ONE reading for the cast +
 * machine route and the casting / forging routes' secondary machining (secondary-machining parity, Nov 2026).
 */
export function costedNearNetRows(rows: FeatureRow[], includeFlags?: boolean[]): FeatureRow[] {
  return rows.filter((r, i) => (includeFlags ? !!includeFlags[i] : defaultInclude(r, 'near_net')));
}

/**
 * Faces a near-net part has MACHINED — the B-rep faces behind its costed feature rows (each hole's walls, each faced
 * flat), counted once. A row without face ids counts one face an instance. The deburr reads this: a casting's as-cast
 * faces carry no machined edge (it read all 230 B-rep faces of a bracket that machines 28; secondary-machining parity,
 * Nov 2026).
 */
export function machinedFaceCount(rows: FeatureRow[]): number {
  const ids = new Set<number>();
  let unnamed = 0;
  for (const r of rows) {
    if (r.faceIds?.length) r.faceIds.forEach(id => ids.add(id));
    else unnamed += Math.max(1, r.count);
  }
  return ids.size + unnamed;
}

/**
 * The machined features of a costing, counted as pieces of work (report page 1's part summary, Part1 review phase 3):
 * holes and bores (a stepped bore — coaxial touching steps — is ONE), faced flats (one an instance), other ticked rows
 * (pockets, slots, bosses — one an instance) and narrow slits (kernel `slits`). `rows` are the rows the costing machines
 * (`costedNearNetRows` on a near-net part; every machinable row from solid). Pure arithmetic on the feature table.
 */
export function machinedFeatureCount(rows: FeatureRow[], slits: number): {
  total: number; holes: number; stepped: number; faces: number; other: number; slits: number; text: string;
} {
  const work = holeWork(rows, 'aluminium');
  const holes = work.reduce((s, w) => s + w.count, 0);
  const stepped = work.filter(w => w.kind === 'stepped').reduce((s, w) => s + w.count, 0);
  const faces = rows.filter(r => r.kind === 'face').reduce((s, r) => s + r.count, 0);
  const other = rows.filter(r => r.kind !== 'face' && r.kind !== 'hole').reduce((s, r) => s + r.count, 0);
  const total = holes + faces + other + slits;
  const parts = [
    ...(holes ? [`${holes} hole${holes === 1 ? '' : 's'} and bore${holes === 1 ? '' : 's'}${stepped ? ` (${stepped} stepped)` : ''}`] : []),
    ...(faces ? [`${faces} faced flat${faces === 1 ? '' : 's'}`] : []),
    ...(other ? [`${other} pocket / slot / boss feature${other === 1 ? '' : 's'}`] : []),
    ...(slits ? [`${slits} narrow slit${slits === 1 ? '' : 's'}`] : []),
  ];
  return { total, holes, stepped, faces, other, slits, text: parts.join(', ') };
}

/** Below this outside area on the turned axis there is nothing a lathe operation is worth setting up for. */
export const MIN_NEAR_NET_TURNED_CM2 = 20;
/**
 * …and below this share of the part's surface the "turned axis" is a cast boss's outside, which is
 * cast to size, not a spindle (engineering threshold: the stub axle's spindle is 16.5% of its surface,
 * a steering knuckle's 9%; the Casting Bracket's one Ø40 boss is 4.8% and is not turned).
 */
export const MIN_NEAR_NET_TURNED_SHARE = 0.08;

/**
 * Turning the OUTSIDE of a near-net part's revolved axis on a CNC lathe — a stub axle's
 * spindle: its bearing journals, taper, shoulders' fillets and register. A casting or
 * forging cannot hold a bearing seat as-made, so these are always turned (stub axle
 * live run, Oct 2026: the near-net path machined only flats and holes, and the
 * 226 cm² spindle was not costed at all). The kernel's turning signature gives the
 * family's external area (FORWARD cylinders / cones / tori — its bores are holes and
 * are finish-bored separately). Rough: the cast / forged-on stock at the metal's turning
 * rate; finish: the area at the finishing-insert rate. Ground bearing seats, where a
 * drawing calls them, are not included — that is stated, not assumed away.
 */
export function nearNetTurningTime(externalAreaCm2: number, family: MaterialFamily, stockMm: number, maxDiaMm: number): CuttingTime {
  const stockCm3 = externalAreaCm2 * stockMm / 10;
  const qTurn = turnRoughEffective(family);
  const roughMin = stockCm3 / qTurn;
  const fin = turnFinish(family, externalAreaCm2);
  const finishMin = fin.min;
  const tools = 3;   // rough, finish, groove / thread
  const allowMin = tools * TURN_TOOL_ALLOWANCE_MIN;
  const toolChangeMin = tools * TOOL_CHANGE_SEC / 60;
  return {
    roughMin: r2(roughMin), finishMin: r2(finishMin), surfacingMin: 0, holeMin: 0,
    tools, toolChangeMin: r2(toolChangeMin), totalMin: r2(roughMin + finishMin + allowMin + toolChangeMin),
    basis: `outside of the turned axis ${externalAreaCm2.toFixed(0)} cm² (journals, taper, fillets; up to Ø${maxDiaMm.toFixed(0)} mm): `
      + `rough ${stockCm3.toFixed(0)} cm³ of ${stockMm} mm-a-side stock ÷ ${qTurn} cm³/min (vc × fn × ${TURN_ROUGH_AP_MM} mm ap = `
      + `${turnRoughInCut(family).toFixed(0)} in-cut ÷ (1 + ${ROUGH_AIR_SHARE} air moves); ap and air share ${ASSUMED}) = ${roughMin.toFixed(2)} min; `
      + `finish ${externalAreaCm2.toFixed(0)} cm² ÷ ${fin.rate.toFixed(0)} cm²/min (fn × vc) = ${finishMin.toFixed(2)} min; `
      + `${tools} tools × (${TURN_TOOL_ALLOWANCE_MIN} min approach / retract + ${TOOL_CHANGE_SEC} s change) = ${(allowMin + toolChangeMin).toFixed(2)} min `
      + `(${family}; ground bearing seats, if the drawing calls them, are extra; sources — ${sourcesLine(family, ['turn'])}; ${TURN_FINISH_STATUS})`,
  };
}

/** Outside turned area of a near-net part, cm² — 0 below the threshold or with no measurement. */
export function nearNetTurnedAreaCm2(turning: { externalAreaMm2?: number } | null | undefined, totalAreaCm2: number): number {
  const a = (turning?.externalAreaMm2 ?? 0) / 100;
  return a >= MIN_NEAR_NET_TURNED_CM2 && totalAreaCm2 > 0 && a / totalAreaCm2 >= MIN_NEAR_NET_TURNED_SHARE ? a : 0;
}

/** Metal a near-net part carries for machining, cm³: machined faces and cored bores × the per-side stock. */
export function nearNetStockCm3(rows: FeatureRow[], stockMm: number, coredAboveMm: number): number {
  let mm3 = 0;
  for (const r of rows) {
    if (r.kind === 'face') mm3 += (r.areaMm2 ?? 0) * r.count * stockMm;
    else if (r.kind === 'hole' && r.diaMm > coredAboveMm) mm3 += Math.PI * r.diaMm * Math.max(r.depthMm, 0) * r.count * stockMm;
  }
  return Math.round(mm3 / 100) / 10;
}

/**
 * Holes up to this Ø in a sand, gravity or investment casting are drilled from solid, so their volume was poured and
 * then cut away (HPDC cores its holes).
 */
export const DRILLED_FROM_SOLID_MM = 20;

/**
 * The AS-CAST weight of a casting that is machined: the finished part + the metal of its holes drilled from solid + the
 * per-side machining stock on its machined faces and cored bores + the turning stock on a turned axis. ONE function for
 * the cast + machine rule, the casting route's secondary machining (headless) and the casting form (the screen, on the
 * rows ticked to machine) — the casting route used to pour, heat-treat and blast the finished weight for the same scope
 * (secondary-machining parity, Nov 2026). `rows` are the rows the costing machines (`costedNearNetRows`).
 */
export function asCastWeight(p: {
  finishedKg: number; volumeCm3: number; rows: FeatureRow[]; subtype: string | null; family: MaterialFamily | null;
  turning?: { externalAreaMm2?: number } | null; surfaceAreaCm2?: number;
}): { kg: number; drilledCm3: number; drilledHoles: number; faceCm3: number; turnCm3: number; turnedCm2: number; stockMm: number; density: number } {
  const sub = p.subtype;
  const density = p.finishedKg / Math.max(1e-9, p.volumeCm3);   // kg / cm³, from the costed metal
  let mm3 = 0; let holes = 0;
  if (sub !== 'hpdc' && sub !== null) {
    for (const r of p.rows) {
      if (r.kind !== 'hole' || !r.diaMm || !r.depthMm || r.diaMm > DRILLED_FROM_SOLID_MM) continue;
      const n = r.count ?? 1;
      mm3 += Math.PI * r.diaMm ** 2 / 4 * r.depthMm * n;
      holes += n;
    }
  }
  const drilledCm3 = Math.round(mm3 / 10) / 100;
  const stockMm = castMachiningStockMm(sub, p.family);
  const faceCm3 = nearNetStockCm3(p.rows, stockMm, sub === 'hpdc' ? CORED_ABOVE_MM.hpdc : DRILLED_FROM_SOLID_MM);
  // The turned axis (a spindle) is cast with the same stock on its outside: it is poured and paid for.
  const turnedCm2 = nearNetTurnedAreaCm2(p.turning, p.surfaceAreaCm2 ?? 0);
  const turnCm3 = Math.round(turnedCm2 * stockMm / 10 * 10) / 10;
  const kg = Math.round((p.finishedKg + (drilledCm3 + faceCm3 + turnCm3) * density) * 1000) / 1000;
  return { kg, drilledCm3, drilledHoles: holes, faceCm3, turnCm3, turnedCm2, stockMm, density };
}

// ── The cell's other costs ──────────────────────────────────────────────────

/** Cutting tools worn per part, £. */
export function toolWearPerPart(cuttingMin: number, family: MaterialFamily): number {
  return Math.round(cuttingMin * cuttingDataFor(family).toolCostPerCutMin * 10_000) / 10_000;
}

/** Fixture cost per fixturing, £ — modular / soft-jaw work holding for a short programme, a dedicated fixture otherwise. */
export const FIXTURE_GBP = { modular: 500, dedicated: 2_500, softJaws: 300, threshold5yParts: 10_000,
  /** A dedicated hydraulic fixture on a 4th-axis tombstone (the volume cell): engineering-typical toolroom build. */
  hydraulic: 12_000 } as const;

export function fixtureCostGBP(millFixturings: number, latheChuckings: number, annualVolume: number,
  kind: 'auto' | 'hydraulic' = 'auto'): { gbp: number; basis: string } {
  const dedicated = kind === 'hydraulic' || annualVolume * 5 > FIXTURE_GBP.threshold5yParts;
  const each = kind === 'hydraulic' ? FIXTURE_GBP.hydraulic : dedicated ? FIXTURE_GBP.dedicated : FIXTURE_GBP.modular;
  // Fixtures are toolroom-built where the part is made (× the country's toolroom factor, 1 in the UK).
  const tf = activeToolroomFactor();
  const gbp = Math.round((millFixturings * each + latheChuckings * FIXTURE_GBP.softJaws) * tf);
  return {
    gbp,
    basis: `${millFixturings} ${kind === 'hydraulic' ? 'dedicated hydraulic (tombstone)' : dedicated ? 'dedicated' : 'modular'} fixture(s) × £${each.toLocaleString('en-GB')}`
      + (latheChuckings ? ` + ${latheChuckings} set(s) of soft jaws × £${FIXTURE_GBP.softJaws}` : '')
      + (kind === 'hydraulic'
        ? ' (the volume cell\'s dedicated fixture'
        : ` (${dedicated ? 'dedicated above' : 'modular up to'} ${FIXTURE_GBP.threshold5yParts.toLocaleString('en-GB')} parts over 5 years`)
      + '; fixture prices engineering-typical toolroom builds, not sourced)'
      + (tf !== 1 ? ` × toolroom factor ${tf}` : ''),
  };
}

/** CAM programming and prove-out hours: per fixturing, per feature group, and a surfacing strategy if free-form. */
export const PROGRAMMING_HR = { perFixturing: 1.5, perFeatureRow: 0.25, surfacing: 2 } as const;

export function programmingHours(fixturings: number, featureRows: number, surfaced: boolean): number {
  return Math.round((PROGRAMMING_HR.perFixturing * fixturings + PROGRAMMING_HR.perFeatureRow * featureRows
    + (surfaced ? PROGRAMMING_HR.surfacing : 0)) * 100) / 100;
}

/** Deburr (machined edges) and gauge-check minutes a part — a bench task. */
export function deburrInspectMinutes(faceCount: number): number {
  return Math.round((0.5 + 0.004 * faceCount + 0.5) * 100) / 100;
}

// ── Secondary machining on a casting or forging: the cell around the cut ────

/**
 * What a near-net part's secondary machining costs beyond its cutting minutes,
 * on the casting and forging routes (the cast + machine route carries the same
 * through the machining rules): load / unload and change-over per fixturing,
 * fixtures, CAM programming and cutting-tool wear. One function, so the screen
 * and headless price the same cell from the same inputs (forging review,
 * Oct 2026 — they used to cost the cutting alone).
 */
export function secondaryMachiningCell(p: {
  fixturings: number;
  weightKg: number;
  annualVolume: number;
  family: MaterialFamily;
  featureRows: number;
  cuttingMin: number;
  engineerRatePerHr: number;
  /** The cut mills faces / pockets (a VMC job) rather than holes only — at volume that is the twin-pallet HMC cell. */
  milled?: boolean;
  /** A turned part (lathe chuckings + a drill fixturing): never the HMC cell. */
  turned?: boolean;
}): {
  cell: { fixturings: number; handlingMin: number; setupMinPerFixturing: number; batchSize: number; masked?: boolean; palletChangeSec?: number };
  /** The machine the cell runs on when it is the volume cell; else the caller's choice stands. */
  machineId: string | null;
  volumeCell: boolean;
  toolingGBP: number; toolWearPerPart: number; basis: string;
} {
  // Volume cell (pilot rule pack, 30 Oct 2026): a milled near-net part at production volume runs on a twin-pallet
  // HMC with a dedicated hydraulic fixture — up to four sides in one clamping, load / unload masked by the cut.
  const volumeCell = !!p.milled && !p.turned && p.annualVolume >= VOLUME_CELL_MIN_ANNUAL;
  const asked = Math.max(1, Math.round(p.fixturings));
  const fixturings = volumeCell ? (asked <= HMC_SIDES_PER_CLAMPING ? 1 : 2) : asked;
  const batchSize = Math.round(Math.min(5000, Math.max(50, (p.annualVolume || 10_000) / 20)));
  // A turned part's two lathe chuckings are soft jaws, as on the from-solid route — they were priced as two dedicated
  // £2,500 mill fixtures (arith audit, Oct 2026: the hub flange carried 3 × £2,500 for 2 chuckings + 1 drill fixture).
  const chuckings = p.turned && fixturings > 1 ? 2 : 0;
  const fx = fixtureCostGBP(fixturings - chuckings, chuckings, p.annualVolume, volumeCell ? 'hydraulic' : 'auto');
  const hrs = programmingHours(fixturings, p.featureRows, false);
  const programming = Math.round(hrs * p.engineerRatePerHr);
  const wear = toolWearPerPart(p.cuttingMin, p.family);
  return {
    cell: { fixturings, handlingMin: handlingMinPerFixturing(p.weightKg), setupMinPerFixturing: SETUP_MIN_PER_FIXTURING, batchSize,
      ...(volumeCell ? { masked: true, palletChangeSec: PALLET_CHANGE_SEC } : {}) },
    machineId: volumeCell ? HMC_MACHINE_ID : null,
    volumeCell,
    toolingGBP: fx.gbp + programming,
    toolWearPerPart: wear,
    basis: (volumeCell ? `twin-pallet HMC cell at ${p.annualVolume.toLocaleString('en-GB')}/yr (≥ ${VOLUME_CELL_MIN_ANNUAL.toLocaleString('en-GB')}): `
      + `${asked} approach direction(s) in ${fixturings} clamping(s) on a 4th-axis tombstone, load / unload masked by the cut; ` : '')
      + `${fx.basis}; programming ${hrs} h (${PROGRAMMING_HR.perFixturing} h × ${fixturings} fixturing(s) + ${PROGRAMMING_HR.perFeatureRow} h × ${p.featureRows} feature group(s)) `
      + `× £${p.engineerRatePerHr.toFixed(2)}/h = £${programming}; `
      + `tool wear ${p.cuttingMin.toFixed(1)} min × £${cuttingDataFor(p.family).toolCostPerCutMin.toFixed(4)}/min = £${wear.toFixed(3)}; `
      + `handling ${handlingMinPerFixturing(p.weightKg)} min a fixturing by weight, ${SETUP_MIN_PER_FIXTURING} min change-over a fixturing a batch of ${batchSize} `
      + `(${HOURS_STATUS})`
      + (volumeCell ? `; pallet change ${PALLET_CHANGE_SEC} s (Okuma MA-4000H, ISO 10791-9 — Okuma MA-4000H brochure, Jul 2025)` : '')
      + `; cutting minutes on the published cutting data — ${sourcesLine(p.family, p.turned ? ['turn', 'drill', 'tap'] : ['face', 'drill', 'bore', 'tap'])}; `
      + `${TOOL_CHANGE_STATUS}; ${ALLOWANCE_STATUS}`,
  };
}

/**
 * A turned near-net part (pilot rule pack, 30 Oct 2026): most of its surface is one coaxial family of revolved
 * faces and the shoulders square to it, and that family's largest OUTSIDE diameter fills the part's cross-section —
 * a hub flange, a pulley, a wheel hub. Such a part is turned, faces included, on the CNC lathe (op 10 / op 20) and
 * only its holes go to a drill centre; it was face-milled on a VMC because the feature table has no lathe. The
 * stub axle (fraction 0.35) keeps its spindle-only turning; a control-arm yoke (Ø50 boss on a 250 mm part) is not
 * turned. Same reading the from-solid route makes (`turnedFacts`), applied to the near-net paths.
 */
export const TURNED_PART_FRACTION = 0.6;
/** Per-side stock a forged / cast turned surface carries when the route does not say (engineering-typical). */
export const NEAR_NET_TURN_STOCK_MM = 2;

/** The lathe operation of a turned near-net part: its outside plus the measured faces, faced on the lathe. */
export function nearNetTurnedPlan(
  rows: FeatureRow[], facts: { externalCm2: number; maxDiaMm: number; fraction: number }, family: MaterialFamily,
  stockMm = NEAR_NET_TURN_STOCK_MM, includeFlags?: boolean[],
): { latheMachineId: string; latheMin: number; basis: string; facedCm2: number } {
  const faces = rows.filter((r, i) => r.kind === 'face' && (includeFlags ? includeFlags[i] : true));
  const facedCm2 = faces.reduce((s, r) => s + (r.areaMm2 ?? 0) * r.count, 0) / 100;
  const t = nearNetTurningTime(facts.externalCm2 + facedCm2, family, stockMm, facts.maxDiaMm);
  return {
    latheMachineId: 'mach-lathe-cnc', latheMin: t.totalMin, facedCm2,
    basis: `turned part (${(facts.fraction * 100).toFixed(0)}% of its surface is one coaxial family, Ø${facts.maxDiaMm.toFixed(0)} fills the section): `
      + `outside ${facts.externalCm2.toFixed(0)} cm² + ${faces.reduce((s, r) => s + r.count, 0)} face(s) ${facedCm2.toFixed(0)} cm² faced on the lathe — ${t.basis}`,
  };
}
export function turnedPartFacts(geo: {
  turning?: { fraction: number; externalAreaMm2?: number; externalMaxDiaMm?: number; maxDiaMm?: number; axis: number[] | null } | null;
  boundingBox?: { xMm: number; yMm: number; zMm: number } | null;
} | null | undefined): { externalCm2: number; maxDiaMm: number; fraction: number } | null {
  const t = geo?.turning;
  const bb = geo?.boundingBox;
  if (!t || !t.axis || !bb || t.fraction < TURNED_PART_FRACTION) return null;
  const dims = [bb.xMm, bb.yMm, bb.zMm];
  const ax = t.axis.map(Math.abs);
  const i = ax.indexOf(Math.max(...ax));
  const perp = dims.filter((_, k) => k !== i);
  const dia = t.externalMaxDiaMm ?? t.maxDiaMm ?? 0;
  const externalCm2 = (t.externalAreaMm2 ?? 0) / 100;
  if (dia < 0.9 * Math.max(...perp) || externalCm2 < MIN_NEAR_NET_TURNED_CM2) return null;
  return { externalCm2, maxDiaMm: dia, fraction: t.fraction };
}
