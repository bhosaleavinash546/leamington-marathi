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
 * | Roughing | metal removed (stock − part) ÷ the metal's practical removal rate |
 * | Finishing | measured area per surface type ÷ a pass rate: flats, walls, fillets and chamfers at the wall rate; free-form at a ball-nose surfacing rate |
 * | Holes | diameter × depth per hole (`featureMinutesEach`), × the metal's cutting-time factor |
 * | Non-cutting | load / clamp / unload per fixturing, tool changes |
 * | Cutting tools | tool wear per minute of cutting, by metal |
 *
 * Every rate is in `CUTTING_DATA` and printed on the basis. They are
 * engineering-typical values for a mid-size (15–20 kW) machining centre and a
 * CNC lathe with carbide tooling — stated, not measured, and the first thing a
 * supplier's actual cycle should replace. AI never sets any of them.
 */
import type { MaterialFamily } from './material-family.js';
import type { FeatureRow } from './feature-ops.js';
import { featureMinutesEach, nearNetHoleMinutes } from './feature-machining.js';
export { nearNetHoleMinutes, BORE_FINISH_MM_PER_MIN } from './feature-machining.js';

export interface CuttingData {
  /** Cutting-time multiplier against aluminium for finishing passes and holes. */
  timeFactor: number;
  /** Practical average roughing removal rate on a machining centre, cm³/min. */
  millRoughCm3PerMin: number;
  /** Practical average roughing removal rate turning, cm³/min. */
  turnRoughCm3PerMin: number;
  /** Perishable cutting tools (inserts, end mills, drills) per minute of cutting, £. */
  toolCostPerCutMin: number;
}

/**
 * Cutting data by metal family.
 *
 * `timeFactor` follows relative machinability (aluminium alloys cut ~2× faster
 * than carbon steel and ~4× faster than titanium at like tool life); the
 * removal rates are practical shop averages — power, rigidity and tool life
 * limited, including step-downs and air moves — not the catalogue peak. Steel
 * is carbon / low-alloy; a stainless or hardened grade is slower and should be
 * entered on the form.
 */
export const CUTTING_DATA: Record<MaterialFamily, CuttingData> = {
  aluminium:      { timeFactor: 1.0, millRoughCm3PerMin: 120, turnRoughCm3PerMin: 250, toolCostPerCutMin: 0.04 },
  magnesium:      { timeFactor: 0.8, millRoughCm3PerMin: 150, turnRoughCm3PerMin: 300, toolCostPerCutMin: 0.04 },
  plastic:        { timeFactor: 0.8, millRoughCm3PerMin: 80,  turnRoughCm3PerMin: 150, toolCostPerCutMin: 0.02 },
  'copper alloy': { timeFactor: 1.2, millRoughCm3PerMin: 60,  turnRoughCm3PerMin: 150, toolCostPerCutMin: 0.06 },
  'cast iron':    { timeFactor: 1.6, millRoughCm3PerMin: 50,  turnRoughCm3PerMin: 100, toolCostPerCutMin: 0.10 },
  steel:          { timeFactor: 2.0, millRoughCm3PerMin: 35,  turnRoughCm3PerMin: 80,  toolCostPerCutMin: 0.12 },
  titanium:       { timeFactor: 4.0, millRoughCm3PerMin: 10,  turnRoughCm3PerMin: 20,  toolCostPerCutMin: 0.35 },
};

/**
 * Finishing pass rates in aluminium, cm²/min (÷ `timeFactor` for other metals).
 * Wall: an end-mill side pass or a face-mill pass — flats, walls, external
 * cylinders, fillets and chamfers cut by the profile tool. Surfacing: a ball
 * nose on a step-over (Ø10, 0.5 mm step, 3 m/min). Turning: a finishing
 * insert (0.15 mm/rev at ~250 m/min), slowed for approach and retract.
 */
export const FINISH_RATE_CM2_PER_MIN = { wall: 40, surfacing: 10, turning: 120 } as const;

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
/** Chip-to-chip tool change on a machining centre or turret, seconds. */
export const TOOL_CHANGE_SEC = 6;
/** Fixture change-over, tool offsets and first-off inspection per fixturing, minutes a batch. */
export const SETUP_MIN_PER_FIXTURING = 45;

/** Surface types finished at the wall rate (the rest are free-form and surfaced). */
const WALL_TYPES = new Set(['PLANE', 'CYLINDER', 'CONE', 'TORUS']);

export function cuttingDataFor(family: MaterialFamily): CuttingData {
  return CUTTING_DATA[family] ?? CUTTING_DATA.steel;
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
  const removed = Math.max(0, p.stockCm3 - p.partCm3);
  const roughMin = removed / cd.millRoughCm3PerMin;
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
  const finishMin = wallCm2 / FINISH_RATE_CM2_PER_MIN.wall * cd.timeFactor;
  const surfacingMin = freeCm2 / FINISH_RATE_CM2_PER_MIN.surfacing * cd.timeFactor;
  const holeMin = holeMinutes(p.rows, p.family);
  const tools = toolCount(p.rows, freeCm2 > 0.5);
  const toolChangeMin = tools * TOOL_CHANGE_SEC / 60;
  const totalMin = roughMin + finishMin + surfacingMin + holeMin + toolChangeMin;
  return {
    roughMin: r2(roughMin), finishMin: r2(finishMin), surfacingMin: r2(surfacingMin), holeMin: r2(holeMin),
    tools, toolChangeMin: r2(toolChangeMin), totalMin: r2(totalMin),
    basis: `rough ${removed.toFixed(0)} cm³ ÷ ${cd.millRoughCm3PerMin} cm³/min = ${roughMin.toFixed(1)} min; `
      + `finish ${wallCm2.toFixed(0)} cm² of flats/walls/fillets ÷ ${(FINISH_RATE_CM2_PER_MIN.wall / cd.timeFactor).toFixed(0)} cm²/min = ${finishMin.toFixed(1)} min; `
      + `surface ${freeCm2.toFixed(0)} cm² free-form ÷ ${(FINISH_RATE_CM2_PER_MIN.surfacing / cd.timeFactor).toFixed(1)} cm²/min = ${surfacingMin.toFixed(1)} min; `
      + `holes ${holeMin.toFixed(1)} min; ${tools} tools × ${TOOL_CHANGE_SEC} s = ${toolChangeMin.toFixed(1)} min (${p.family}, ×${cd.timeFactor} on aluminium)`,
  };
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
  const cd = cuttingDataFor(p.family);
  const removed = Math.max(0, p.stockCm3 - p.partCm3);
  const turnedCm2 = p.totalAreaCm2 * p.turnedFraction;
  const roughMin = removed / cd.turnRoughCm3PerMin;
  const finishMin = turnedCm2 / FINISH_RATE_CM2_PER_MIN.turning * cd.timeFactor;
  const latheTools = 3;   // rough, finish, groove / part-off
  const lathe: CuttingTime = {
    roughMin: r2(roughMin), finishMin: r2(finishMin), surfacingMin: 0, holeMin: 0,
    tools: latheTools, toolChangeMin: r2(latheTools * TOOL_CHANGE_SEC / 60),
    totalMin: r2(roughMin + finishMin + latheTools * TOOL_CHANGE_SEC / 60),
    basis: `turn ${removed.toFixed(0)} cm³ ÷ ${cd.turnRoughCm3PerMin} cm³/min = ${roughMin.toFixed(1)} min; `
      + `finish-turn ${turnedCm2.toFixed(0)} cm² ÷ ${(FINISH_RATE_CM2_PER_MIN.turning / cd.timeFactor).toFixed(0)} cm²/min = ${finishMin.toFixed(1)} min`,
  };
  const otherCm2 = Math.max(0, p.totalAreaCm2 - turnedCm2 - holeWallCm2(p.rows));
  const millFinish = otherCm2 / FINISH_RATE_CM2_PER_MIN.wall * cd.timeFactor;
  const holeMin = holeMinutes(p.rows, p.family);
  const hasMill = otherCm2 > 0.5 || holeMin > 0;
  const millTools = hasMill ? 1 + new Set(p.rows.filter(r => r.kind === 'hole').map(r => Math.round(r.diaMm * 2) / 2)).size : 0;
  const mill: CuttingTime = {
    roughMin: 0, finishMin: r2(millFinish), surfacingMin: 0, holeMin: r2(holeMin),
    tools: millTools, toolChangeMin: r2(millTools * TOOL_CHANGE_SEC / 60),
    totalMin: r2(millFinish + holeMin + millTools * TOOL_CHANGE_SEC / 60),
    basis: `mill ${otherCm2.toFixed(0)} cm² not turned (keyways, flats) = ${millFinish.toFixed(1)} min; holes ${holeMin.toFixed(1)} min`,
  };
  return { lathe, mill };
}

/** Hole minutes (aluminium baseline per hole × the metal's factor). */
export function holeMinutes(rows: FeatureRow[], family: MaterialFamily, coredAboveMm?: number): number {
  const f = cuttingDataFor(family).timeFactor;
  return rows.filter(r => r.kind === 'hole')
    .reduce((s, r) => s + nearNetHoleMinutes(r, coredAboveMm) * r.count, 0) * f;
}

// ── Near-net (casting / forging) finish machining ───────────────────────────

/**
 * Per-side machining stock a casting carries on a machined face, mm — the
 * required machining allowance of ISO 8062-3, at the RMA grade typical of each
 * process for a 100–250 mm casting. The drawing's RMA callout replaces it.
 */
export const CAST_MACHINING_STOCK_MM: Record<string, number> = {
  sand_ferrous: 3.0, sand: 2.0, gravity: 1.5, investment: 1.0, hpdc: 0.5,
};

/** Holes above this are cored in a sand / gravity / investment casting; HPDC cores almost everything. */
export const CORED_ABOVE_MM: Record<string, number> = { sand: 20, gravity: 20, investment: 20, hpdc: 6 };

export function castMachiningStockMm(subtype: string | null, family: MaterialFamily | null): number {
  if (subtype === 'sand' && (family === 'steel' || family === 'cast iron')) return CAST_MACHINING_STOCK_MM.sand_ferrous;
  return CAST_MACHINING_STOCK_MM[subtype ?? ''] ?? CAST_MACHINING_STOCK_MM.gravity;
}

/**
 * The finish machining a near-net part needs: its machined faces (the kernel's
 * `face` rows — the flats a casting has no draft on) faced once, its holes
 * drilled or finish-bored. Pockets and bosses are cast in.
 */
export function nearNetMachiningTime(rows: FeatureRow[], family: MaterialFamily, subtype: string | null): CuttingTime {
  const cd = cuttingDataFor(family);
  const cored = CORED_ABOVE_MM[subtype ?? ''] ?? 20;
  const faces = rows.filter(r => r.kind === 'face');
  const faceMin = faces.reduce((s, r) => s + featureMinutesEach(r) * r.count, 0) * cd.timeFactor;
  const holeMin = holeMinutes(rows, family, cored);
  // A face mill if any face is machined, a chamfer tool, one tool per hole size.
  const tools = (faces.length ? 1 : 0) + 1 + new Set(rows.filter(r => r.kind === 'hole').map(r => Math.round(r.diaMm * 2) / 2)).size;
  const toolChangeMin = tools * TOOL_CHANGE_SEC / 60;
  const facedCm2 = faces.reduce((s, r) => s + (r.areaMm2 ?? 0) * r.count, 0) / 100;
  return {
    roughMin: 0, finishMin: r2(faceMin), surfacingMin: 0, holeMin: r2(holeMin),
    tools, toolChangeMin: r2(toolChangeMin), totalMin: r2(faceMin + holeMin + toolChangeMin),
    basis: `face ${faces.reduce((s, r) => s + r.count, 0)} machined face(s), ${facedCm2.toFixed(0)} cm² = ${faceMin.toFixed(1)} min; `
      + `holes ${holeMin.toFixed(1)} min (≤ Ø${cored} drilled from solid, larger cored and finish-bored); `
      + `${tools} tools × ${TOOL_CHANGE_SEC} s (${family}, ×${cd.timeFactor} on aluminium)`,
  };
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

// ── The cell's other costs ──────────────────────────────────────────────────

/** Cutting tools worn per part, £. */
export function toolWearPerPart(cuttingMin: number, family: MaterialFamily): number {
  return Math.round(cuttingMin * cuttingDataFor(family).toolCostPerCutMin * 10_000) / 10_000;
}

/** Fixture cost per fixturing, £ — modular / soft-jaw work holding for a short programme, a dedicated fixture otherwise. */
export const FIXTURE_GBP = { modular: 500, dedicated: 2_500, softJaws: 300, threshold5yParts: 10_000 } as const;

export function fixtureCostGBP(millFixturings: number, latheChuckings: number, annualVolume: number): { gbp: number; basis: string } {
  const dedicated = annualVolume * 5 > FIXTURE_GBP.threshold5yParts;
  const each = dedicated ? FIXTURE_GBP.dedicated : FIXTURE_GBP.modular;
  const gbp = millFixturings * each + latheChuckings * FIXTURE_GBP.softJaws;
  return {
    gbp,
    basis: `${millFixturings} ${dedicated ? 'dedicated' : 'modular'} fixture(s) × £${each.toLocaleString('en-GB')}`
      + (latheChuckings ? ` + ${latheChuckings} set(s) of soft jaws × £${FIXTURE_GBP.softJaws}` : '')
      + ` (${dedicated ? 'dedicated above' : 'modular up to'} ${FIXTURE_GBP.threshold5yParts.toLocaleString('en-GB')} parts over 5 years)`,
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
