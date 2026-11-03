/**
 * Published production cutting data (report standard round, 3 Nov 2026).
 *
 * The machining time base used to be a set of aluminium rates (400 mm/min drilling, 40 cm²/min finishing, 8,000 mm²/min
 * facing …) multiplied by a "time factor" for the metal (cast iron 1.6, steel 2.0) — on the cutting AND the fixed
 * approach allowances — none of it sourced. Reviewers judged it 2–3× slow on a production cell. This table replaces the
 * cutting terms with the makers' own recommended cutting data, by material row and operation, every value carrying the
 * row of `scripts/research/2026-11-report-standard/machining/data.json` it was read from (the 91 rows were re-read
 * independently: `../verify.md`; the three CORRECTED rows are used as corrected — APX4000 ductile fz 0.25, Okuma pallet
 * change 7.1 s ISO 10791-9, boring f 0.2 mm/rev only; ductile < 800 MPa face milling is the first-recommended MC5020
 * grade's 200 m/min).
 *
 * Times are computed from the geometry the costing measures with the makers' formulas (Sandvik's own:
 * n = 1000·vc / (π·D), vf = n·z·fz or n·f, turning area rate = fn·vc, tapping feed = n × pitch). What the catalogues do NOT
 * give — cutter body Ø and teeth for the steel / iron face mill, the side-pass depth, the face clearance, the roughing
 * air-move share, the rough-turning depth of cut — is a NAMED assumption below, printed as one wherever it is used.
 *
 * Metals with no catalogue row read (titanium, nickel alloy, copper alloy, zinc, magnesium, plastic) take the nearest
 * catalogue row × CostVision's machinability ratio (engineering-typical, not sourced) and say so.
 */
import type { MaterialFamily } from './material-family.js';

/** Where every figure came from. `rows` index `scripts/research/2026-11-report-standard/machining/data.json`. */
export const CUTTING_SOURCES = {
  'MMC-WSX445': { name: 'Mitsubishi Materials WSX445 face mill, recommended cutting conditions (2023)', rows: '#0–4' },
  'MMC-APX4000': { name: 'Mitsubishi Materials APX4000 shoulder mill, recommended cutting conditions (2023)', rows: '#7–9' },
  'TUNGALOY-TUNGALU': { name: 'Tungaloy TungAlu-Mill standard cutting conditions (2020)', rows: '#13–14' },
  'MMC-MVE': { name: 'Mitsubishi Materials MVE solid carbide drill, recommended cutting conditions (2023)', rows: '#19–26' },
  'SANDVIK-R840': { name: 'Sandvik Coromant Small Part Machining catalogue, CoroDrill Delta-C R840 (2002–04)', rows: '#35–41' },
  'SANDVIK-TURN': { name: 'Sandvik Coromant Small Part Machining catalogue, turning cutting data (2002–04)', rows: '#47–53' },
  'MMC-SVJD': { name: 'Mitsubishi Materials SVJD external turning tool, recommended cutting conditions (2023)', rows: '#57' },
  'TUNGALOY-T515': { name: 'Tungaloy T515 cast-iron turning brochure, internal (boring) application example (2017)', rows: '#55' },
  'OSG-ATAP': { name: 'OSG A-Tap flier n_102, tapping speed chart (2026)', rows: '#58–62' },
  'SANDVIK-K': { name: 'Sandvik Coromant Metalcutting Technical Guide (D) Milling, power constant K (2006)', rows: '#72–80' },
  'OKUMA-MA4000H': { name: 'Okuma MA-4000H brochure (Jul 2025)', rows: '#15, #17, #63, #64' },
  'DMG-NHX4000': { name: 'DMG MORI NHX 4000 2nd generation press release (2016)', rows: '#69' },
  'SANDVIK-MILLING': { name: 'Sandvik Coromant Metalcutting Technical Guide (D) Milling, worked examples (2006)', rows: '#5' },
  'GARANT-DIN338': { name: 'Hoffmann Group GARANT DIN 338 jobber drill product page', rows: '#43' },
} as const;
export type CuttingSourceId = keyof typeof CUTTING_SOURCES;
/** "Mitsubishi Materials MVE … (data.json #19–26)" — what a basis line prints for a rate's source. */
export const sourceName = (id: CuttingSourceId): string => `${CUTTING_SOURCES[id].name}, data.json ${CUTTING_SOURCES[id].rows}`;

// ── Labelled assumptions (no catalogue gives these) ─────────────────────────────────────────────────────────────────
/** Face-mill step-over ae / Dc — as the Okuma and Sandvik worked examples cut (data.json #5, #15, #17: 0.68–0.70). */
export const FACE_STEP_OVER = 0.7;
/** Approach + exit clearance at each end of a face pass, mm — engineering-typical, not sourced. */
export const FACE_CLEARANCE_MM = 5;
/** Wall height one side-milling finish pass covers, mm (capped at the catalogue row's ap limit) — engineering-typical, not sourced. */
export const SIDE_PASS_AP_MM = 10;
/** Air moves and step-downs added to the in-cut roughing time — engineering-typical, not sourced. */
export const ROUGH_AIR_SHARE = 0.25;
/** Depth of cut a roughing turning pass takes, mm — engineering-typical, not sourced (the aluminium row's range tops at 3.0). */
export const TURN_ROUGH_AP_MM = 3;
/** What every basis prints after the assumptions it used. */
export const ASSUMED = 'engineering-typical, not sourced';

/** ISO 261 metric coarse pitches, mm — the thread standard (tapping feed = n × pitch). */
export const ISO_COARSE_PITCH_MM: Readonly<Record<string, number>> = {
  M3: 0.5, M4: 0.7, M5: 0.8, M6: 1.0, M8: 1.25, M10: 1.5, M12: 1.75,
};

/** A face-mill body: Ø and teeth. */
export interface CutterBody { dc: number; z: number }

export interface CatalogueRow {
  /** The catalogue's material row the family is costed on. */
  material: string;
  /** Finish face milling: vc m/min, fz mm/tooth. */
  face: { vc: number; fz: number; src: CuttingSourceId };
  /** Face-mill bodies by Ø with teeth — `assumed` when the catalogue page gives no teeth table. */
  bodies: { list: CutterBody[]; assumed: boolean; note: string };
  /** Roughing (medium-duty face milling on the Ø100 body): fz, ap. vc as `face`. */
  rough: { fz: number; apMm: number; src: CuttingSourceId };
  /** Side-milling finish pass: vc, fz, the body, the row's ap limit. */
  shoulder: { vc: number; fz: number; body: CutterBody; bodyAssumed: boolean; apLimitMm: number; src: CuttingSourceId };
  /** Drilling: the catalogue's n (rev/min) and f (mm/rev) at two diameters. */
  drill: { pts: [{ d: number; n: number; f: number }, { d: number; n: number; f: number }]; src: CuttingSourceId; note?: string };
  /** Finish boring: vc, f. */
  bore: { vc: number; f: number; src: CuttingSourceId; note?: string };
  /** Finish turning: vc at fn. */
  turnFinish: { vc: number; fn: number; src: CuttingSourceId; note?: string };
  /** Rough turning: vc at fn (depth of cut `TURN_ROUGH_AP_MM`). */
  turnRough: { vc: number; fn: number; src: CuttingSourceId };
  /** Rigid tapping speed, m/min. */
  tap: { vc: number; src: CuttingSourceId; note: string };
  /** Sandvik power constant K (Pc = Q·K / 100 kW, Q in cm³/min) — printed with the roughing, no machine cap applied. */
  k: number;
}

const WSX_BODIES: CutterBody[] = [{ dc: 63, z: 5 }, { dc: 80, z: 6 }, { dc: 100, z: 7 }, { dc: 125, z: 8 }];
const WSX_NOTE = 'cutter Ø chosen from the face width; teeth Ø63 z5 / Ø80 z6 / Ø100 z7 / Ø125 z8 ASSUMED (the WSX445 page '
  + 'has no body / teeth table; the Okuma and Sandvik worked-example cutters, data.json #5 #15 #17 #18, have these counts)';

/** The catalogue rows each costed family reads. */
export const CATALOGUE: Record<'steel' | 'cast iron' | 'aluminium', CatalogueRow> = {
  steel: {
    material: 'carbon / alloy steel 180–280 HB (C45 / 42CrMo4 class)',
    face: { vc: 220, fz: 0.15, src: 'MMC-WSX445' },
    bodies: { list: WSX_BODIES, assumed: true, note: WSX_NOTE },
    rough: { fz: 0.2, apMm: 3.0, src: 'MMC-WSX445' },
    shoulder: { vc: 160, fz: 0.25, body: { dc: 50, z: 4 }, bodyAssumed: true, apLimitMm: 20, src: 'MMC-APX4000' },
    drill: { pts: [{ d: 12, n: 2300, f: 0.31 }, { d: 16, n: 1700, f: 0.33 }], src: 'MMC-MVE' },
    bore: { vc: 350, f: 0.2, src: 'SANDVIK-TURN',
      note: 'no boring row read for steel: the GC4015 turning vc at fn 0.4 (the conservative neighbour of f 0.2), f 0.2 as the Tungaloy T515 boring example (data.json #55)' },
    turnFinish: { vc: 485, fn: 0.1, src: 'SANDVIK-TURN' },
    turnRough: { vc: 350, fn: 0.4, src: 'SANDVIK-TURN' },
    tap: { vc: 15, src: 'OSG-ATAP', note: 'the low end of the S45C advisable band 15–50 m/min' },
    k: 5.1,
  },
  'cast iron': {
    material: 'ductile iron GJS (the MVE < 450 MPa / WSX445 < 800 MPa / Sandvik 09.2 pearlitic rows)',
    face: { vc: 200, fz: 0.15, src: 'MMC-WSX445' },
    bodies: { list: WSX_BODIES, assumed: true, note: WSX_NOTE },
    rough: { fz: 0.2, apMm: 3.0, src: 'MMC-WSX445' },
    shoulder: { vc: 190, fz: 0.25, body: { dc: 50, z: 4 }, bodyAssumed: true, apLimitMm: 20, src: 'MMC-APX4000' },
    drill: { pts: [{ d: 12, n: 1900, f: 0.31 }, { d: 16, n: 1400, f: 0.33 }], src: 'MMC-MVE',
      note: 'the MVE ductile row is < 450 MPa; Sandvik R840 pearlitic 09.2 (vc 70–100, fn 0.30–0.55 at Ø10–14, data.json #40) brackets it for GJS-500' },
    bore: { vc: 201, f: 0.2, src: 'TUNGALOY-T515' },
    turnFinish: { vc: 260, fn: 0.1, src: 'SANDVIK-TURN' },
    turnRough: { vc: 215, fn: 0.3, src: 'SANDVIK-TURN' },
    tap: { vc: 15, src: 'OSG-ATAP', note: 'FCD has no advisable band, only "possible" 5–50 m/min — 15 m/min taken inside it' },
    k: 4.6,
  },
  aluminium: {
    material: 'aluminium alloy (wrought 6xxx / cast Al-Si rows)',
    face: { vc: 1000, fz: 0.2, src: 'TUNGALOY-TUNGALU' },
    bodies: { list: [{ dc: 50, z: 4 }, { dc: 63, z: 5 }, { dc: 100, z: 6 }], assumed: false,
      note: 'cutter Ø chosen from the face width; teeth Ø50 z4 / Ø63 z5 / Ø100 z6 from the TungAlu-Mill worked table (data.json #13)' },
    rough: { fz: 0.2, apMm: 2.0, src: 'TUNGALOY-TUNGALU' },
    shoulder: { vc: 1000, fz: 0.2, body: { dc: 50, z: 4 }, bodyAssumed: false, apLimitMm: 2.0, src: 'TUNGALOY-TUNGALU' },
    drill: { pts: [{ d: 12, n: 2600, f: 0.31 }, { d: 16, n: 1900, f: 0.33 }], src: 'MMC-MVE' },
    bore: { vc: 400, f: 0.2, src: 'MMC-SVJD',
      note: 'no boring row read for aluminium: the SVJD turning vc, f 0.2 as the Tungaloy T515 boring example (data.json #55)' },
    turnFinish: { vc: 400, fn: 0.15, src: 'MMC-SVJD',
      note: 'SVJD 400 m/min with Sandvik\'s lowest aluminium fn 0.15 (data.json #53); Sandvik\'s 2,000 m/min is not used — few lathes reach that spindle speed at these diameters' },
    turnRough: { vc: 400, fn: 0.3, src: 'MMC-SVJD' },
    tap: { vc: 15, src: 'OSG-ATAP', note: 'AC / ADC has no advisable band, only "possible" 5–50 m/min — 15 m/min taken inside it' },
    k: 2.1,
  },
};

/**
 * CostVision's machinability ratio against aluminium — the old `timeFactor`. Used ONLY where no catalogue row was read:
 * metals outside the table, and the operations no catalogue gives (ball-nose surfacing, helical milling). Engineering-
 * typical, not sourced.
 */
export const MACHINABILITY_RATIO: Record<MaterialFamily, number> = {
  aluminium: 1.0, magnesium: 0.8, plastic: 0.8, 'copper alloy': 1.2, 'cast iron': 1.6, steel: 2.0, titanium: 4.0,
  zinc: 1.0, 'nickel alloy': 6.0,
};

export type CatalogueFamily = keyof typeof CATALOGUE;

/** The row a family is costed on, and the factor on its cutting minutes (1 for a catalogue family). */
export function catalogueFor(family: MaterialFamily | null | undefined): { fam: CatalogueFamily; row: CatalogueRow; scale: number; note: string } {
  const f: MaterialFamily = family && family in MACHINABILITY_RATIO ? family : 'steel';
  if (f in CATALOGUE) return { fam: f as CatalogueFamily, row: CATALOGUE[f as CatalogueFamily], scale: 1, note: '' };
  const anchor: CatalogueFamily = f === 'titanium' || f === 'nickel alloy' ? 'steel' : 'aluminium';
  const scale = MACHINABILITY_RATIO[f] / MACHINABILITY_RATIO[anchor];
  return { fam: anchor, row: CATALOGUE[anchor], scale,
    note: `no catalogue row read for ${f}: the ${anchor} row's cutting time × ${+scale.toFixed(3)} (CostVision machinability ratio, ${ASSUMED})` };
}

/**
 * The family a legacy `materialFactor` (the old time factor) stands for — callers that still pass the factor get the
 * same catalogue times as callers that pass the family (families sharing a factor share an anchor and a scale).
 */
export function familyForTimeFactor(tf: number): MaterialFamily {
  const order: MaterialFamily[] = ['aluminium', 'steel', 'cast iron', 'titanium', 'nickel alloy', 'copper alloy', 'magnesium', 'zinc', 'plastic'];
  const hit = order.find(f => Math.abs(MACHINABILITY_RATIO[f] - tf) < 1e-9);
  if (hit) return hit;
  return tf >= 1.8 ? 'steel' : tf >= 1.4 ? 'cast iron' : 'aluminium';
}

const rpm = (vc: number, d: number) => 1000 * vc / (Math.PI * d);
const r1 = (n: number) => Math.round(n * 10) / 10;

// ── Feeds at a diameter ─────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Drilling feed along the hole at the hole's own Ø: vc and f read at the catalogue's two diameters (Ø12, Ø16) and
 * interpolated between them; below Ø12 the feed per rev is scaled with Ø (a smaller drill feeds less a rev), above Ø16
 * it is held — both extrapolations engineering-typical, not sourced. vf = n·f, n = 1000·vc / (π·D).
 */
export function drillFeed(family: MaterialFamily | null | undefined, d: number): { vf: number; n: number; f: number; vc: number } {
  const { row } = catalogueFor(family);
  const [a, b] = row.drill.pts;
  const vcA = Math.PI * a.d * a.n / 1000, vcB = Math.PI * b.d * b.n / 1000;
  const D = Math.max(d, 0.5);
  let vc: number; let f: number;
  if (D <= a.d) { vc = vcA; f = a.f * D / a.d; }
  else if (D >= b.d) { vc = vcB; f = b.f; }
  else { const t = (D - a.d) / (b.d - a.d); vc = vcA + t * (vcB - vcA); f = a.f + t * (b.f - a.f); }
  const n = rpm(vc, D);
  return { vf: n * f, n, f, vc };
}

/** Finish-boring feed along a bore at its own Ø: n·f at the row's vc and f 0.2 mm/rev. */
export function boreFeed(family: MaterialFamily | null | undefined, d: number): { vf: number; n: number } {
  const { row } = catalogueFor(family);
  const n = rpm(row.bore.vc, Math.max(d, 1));
  return { vf: n * row.bore.f, n };
}

/** Rigid-tapping feed: n × pitch at the row's tapping speed and the thread's nominal Ø (ISO 261 coarse pitch). */
export function tapFeed(family: MaterialFamily | null | undefined, thread: string): { vf: number; n: number; pitch: number } {
  const { row } = catalogueFor(family);
  const pitch = ISO_COARSE_PITCH_MM[thread] ?? 1;
  const d = Number(thread.replace(/^M/, '')) || 6;
  const n = rpm(row.tap.vc, d);
  return { vf: n * pitch, n, pitch };
}

/** The face-mill body for a face of width W: the smallest whose step-over covers it, else the largest in passes. */
export function faceCutter(family: MaterialFamily | null | undefined, widthMm: number): { body: CutterBody; passes: number; vf: number } {
  const { row } = catalogueFor(family);
  const list = row.bodies.list;
  const body = list.find(b => FACE_STEP_OVER * b.dc >= widthMm) ?? list[list.length - 1];
  const passes = Math.max(1, Math.ceil(widthMm / (FACE_STEP_OVER * body.dc) - 1e-9));
  const vf = rpm(row.face.vc, body.dc) * body.z * row.face.fz;
  return { body, passes, vf };
}

/**
 * One finish face-milling pass over a face of area A (the feature table gives area, not length and width — the face is
 * taken as √A × √A, stated): passes × (L + Dc + 2 × clearance) ÷ vf, vf = n·z·fz. Cutting minutes only (× the
 * family's scale); the positioning allowance is the caller's.
 */
export function faceMillCutMinutes(family: MaterialFamily | null | undefined, areaMm2: number): { min: number; text: string } {
  const { scale } = catalogueFor(family);
  const side = Math.sqrt(Math.max(areaMm2, 1));
  const c = faceCutter(family, side);
  const path = c.passes * (side + c.body.dc + 2 * FACE_CLEARANCE_MM);
  const min = path / c.vf * scale;
  return { min, text: `${c.passes} pass(es) × (${side.toFixed(0)} + Ø${c.body.dc} + 2 × ${FACE_CLEARANCE_MM}) mm ÷ ${c.vf.toFixed(0)} mm/min (z${c.body.z})`
    + (scale !== 1 ? ` × ${+scale.toFixed(3)}` : '') + ` = ${min.toFixed(2)} min` };
}

/** Side-milling finish rate, cm²/min: ap (`SIDE_PASS_AP_MM`, capped at the row's limit) × vf of the shoulder row. */
export function sidePassCm2PerMin(family: MaterialFamily | null | undefined): number {
  const { row, scale } = catalogueFor(family);
  const s = row.shoulder;
  const vf = rpm(s.vc, s.body.dc) * s.body.z * s.fz;
  return Math.min(SIDE_PASS_AP_MM, s.apLimitMm) * vf / 100 / scale;
}

/** Finish-turning area rate, cm²/min = fn × vc × 10. */
export function turnFinishCm2PerMin(family: MaterialFamily | null | undefined): number {
  const { row, scale } = catalogueFor(family);
  return row.turnFinish.fn * row.turnFinish.vc * 10 / scale;
}

/** Milling roughing, in-cut cm³/min: medium duty on the Ø100 body, Q = ae × ap × vf. */
export function millRoughInCut(family: MaterialFamily | null | undefined): { q: number; kw: number; vf: number; body: CutterBody } {
  const { row, scale } = catalogueFor(family);
  const body = row.bodies.list.find(b => b.dc === 100) ?? row.bodies.list[row.bodies.list.length - 1];
  const vf = rpm(row.face.vc, body.dc) * body.z * row.rough.fz;
  const q = FACE_STEP_OVER * body.dc * row.rough.apMm * vf / 1000;
  return { q: q / scale, kw: q * row.k / 100, vf, body };
}

/** Turning roughing, in-cut cm³/min: Q = vc × fn × ap. */
export function turnRoughInCut(family: MaterialFamily | null | undefined): number {
  const { row, scale } = catalogueFor(family);
  return row.turnRough.vc * row.turnRough.fn * TURN_ROUGH_AP_MM / scale;
}

/** Effective roughing rates the time model divides by: in-cut ÷ (1 + the air-move share), cm³/min, 0.1 resolution. */
export const millRoughEffective = (family: MaterialFamily | null | undefined) => r1(millRoughInCut(family).q / (1 + ROUGH_AIR_SHARE));
export const turnRoughEffective = (family: MaterialFamily | null | undefined) => r1(turnRoughInCut(family) / (1 + ROUGH_AIR_SHARE));

/** The sources a basis names for the operations it used. */
export function sourcesLine(family: MaterialFamily | null | undefined, ops: Array<'face' | 'rough' | 'side' | 'drill' | 'bore' | 'tap' | 'turn'>): string {
  const { row, note } = catalogueFor(family);
  const parts: string[] = [];
  const add = (label: string, id: CuttingSourceId, extra?: string) => parts.push(`${label} ${sourceName(id)}${extra ? ` (${extra})` : ''}`);
  for (const op of ops) {
    if (op === 'face') add(`face milling vc ${row.face.vc} m/min, fz ${row.face.fz} —`, row.face.src, row.bodies.note);
    if (op === 'rough') add(`roughing fz ${row.rough.fz}, ap ${row.rough.apMm} mm on the Ø100 body —`, row.rough.src);
    if (op === 'side') add(`side passes vc ${row.shoulder.vc} m/min, fz ${row.shoulder.fz} on Ø${row.shoulder.body.dc} z${row.shoulder.body.z}${row.shoulder.bodyAssumed ? ' (body and teeth ASSUMED)' : ''} —`, row.shoulder.src);
    if (op === 'drill') add(`drilling n·f at Ø${row.drill.pts[0].d} (n ${row.drill.pts[0].n}, f ${row.drill.pts[0].f}) and Ø${row.drill.pts[1].d} (n ${row.drill.pts[1].n}, f ${row.drill.pts[1].f}) —`, row.drill.src, row.drill.note);
    if (op === 'bore') add(`boring vc ${row.bore.vc} m/min, f ${row.bore.f} mm/rev —`, row.bore.src, row.bore.note);
    if (op === 'tap') add(`tapping ${row.tap.vc} m/min —`, row.tap.src, `${row.tap.note}; pitch ISO 261 coarse`);
    if (op === 'turn') add(`turning finish vc ${row.turnFinish.vc} @ fn ${row.turnFinish.fn}, rough vc ${row.turnRough.vc} @ fn ${row.turnRough.fn} —`, row.turnFinish.src, row.turnFinish.note);
  }
  return `${row.material}: ${parts.join('; ')}${note ? `; ${note}` : ''}`;
}
