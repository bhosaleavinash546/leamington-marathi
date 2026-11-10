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
  'OKUMA-MA4000H': { name: 'Okuma MA-4000H brochure (Jul 2025)', rows: '#15, #17, #63, #64, #65, #66' },
  'MMC-MC6100': { name: 'Mitsubishi Materials TOOL NEWS B266A, MC6100 steel turning grades (F and M ranges)', rows: '#44, #46' },
  'TUNGALOY-T515-RANGE': { name: 'Tungaloy T515 cast-iron turning brochure, CM breaker range (2017)', rows: '#54' },
  'DMG-NHX4000': { name: 'DMG MORI NHX 4000 2nd generation press release (2016)', rows: '#69' },
  'SANDVIK-MILLING': { name: 'Sandvik Coromant Metalcutting Technical Guide (D) Milling, worked examples (2006)', rows: '#5' },
  'GARANT-DIN338': { name: 'Hoffmann Group GARANT DIN 338 jobber drill product page', rows: '#43' },
  // scripts/research/2026-11-slitting/data.json (Part1 review phase 3, Nov 2026)
  'ZPS-SAW': { name: 'ZPS-FN HSS metal slitting saws DIN 1837 (type H) / DIN 1838 (type W), cutting conditions and bodies (product pages, read 5 Nov 2026)', rows: '#0–31 (scripts/research/2026-11-slitting/data.json)' },
} as const;
export type CuttingSourceId = keyof typeof CUTTING_SOURCES;
/**
 * "Mitsubishi Materials MVE solid carbide drill, recommended cutting conditions (2023)" — what a basis line prints for a
 * rate's source: the maker and the catalogue. The research file's row ids (`rows`) stay in the code for the tests; they
 * are never printed (a report read "…(2002–04), data.json #47–53", live run 3 Nov 2026).
 */
export const sourceName = (id: CuttingSourceId): string => CUTTING_SOURCES[id].name;

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
  /**
   * The finishing allowance — the most a FINISHING pass takes, mm, where the catalogue gives finishing data distinct from
   * roughing (PKG-2, CF-06). Face milling: the finish row's ap; null where the catalogue does not distinguish (every pass
   * is then taken at the face data, ap ≤ `rough.apMm`).
   */
  faceFinish: { apMm: number | null; src: CuttingSourceId | null; note: string };
  /**
   * Boring a cored / pierced bore (PKG-2, CF-06): the roughing passes take the turning ROUGH row (vc, fn) at up to
   * `roughApMm` a side — the catalogue's maximum depth of cut for the metal — and the last pass the finish-boring row at
   * up to `finishApMm`.
   */
  boreRough: { roughApMm: number; roughSrc: CuttingSourceId; finishApMm: number; finishSrc: CuttingSourceId; note: string };
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
  /** Slitting saw: the maker's vc and fz RANGES for the material group, and the saw type for its chips. */
  slit: { group: string; vc: [number, number]; fz: [number, number]; type: 'W' | 'H'; src: CuttingSourceId };
}

const WSX_BODIES: CutterBody[] = [{ dc: 63, z: 5 }, { dc: 80, z: 6 }, { dc: 100, z: 7 }, { dc: 125, z: 8 }];
const WSX_NOTE = 'cutter Ø chosen from the face width; teeth Ø63 z5 / Ø80 z6 / Ø100 z7 / Ø125 z8 ASSUMED (the WSX445 page '
  + 'has no body / teeth table; the Okuma and Sandvik worked-example cutters, have these counts)';

/** The catalogue rows each costed family reads. */
export const CATALOGUE: Record<'steel' | 'cast iron' | 'aluminium', CatalogueRow> = {
  steel: {
    material: 'carbon / alloy steel 180–280 HB (C45 / 42CrMo4 class)',
    face: { vc: 220, fz: 0.15, src: 'MMC-WSX445' },
    bodies: { list: WSX_BODIES, assumed: true, note: WSX_NOTE },
    rough: { fz: 0.2, apMm: 3.0, src: 'MMC-WSX445' },
    faceFinish: { apMm: 1.0, src: 'MMC-WSX445', note: 'the WSX445 finish row: fz 0.15, ap < 1.0 mm' },
    boreRough: { roughApMm: 4.0, roughSrc: 'MMC-MC6100', finishApMm: 1.0, finishSrc: 'MMC-MC6100',
      note: 'rough ap ≤ 4.0 mm (MC6125 M range .012–.157 in), finish ap ≤ 1.0 mm (MC6115 F range .004–.039 in)' },
    shoulder: { vc: 160, fz: 0.25, body: { dc: 50, z: 4 }, bodyAssumed: true, apLimitMm: 20, src: 'MMC-APX4000' },
    drill: { pts: [{ d: 12, n: 2300, f: 0.31 }, { d: 16, n: 1700, f: 0.33 }], src: 'MMC-MVE' },
    bore: { vc: 350, f: 0.2, src: 'SANDVIK-TURN',
      note: 'no boring row read for steel: the GC4015 turning vc at fn 0.4 (the conservative neighbour of f 0.2), f 0.2 as the Tungaloy T515 boring example' },
    turnFinish: { vc: 485, fn: 0.1, src: 'SANDVIK-TURN' },
    turnRough: { vc: 350, fn: 0.4, src: 'SANDVIK-TURN' },
    tap: { vc: 15, src: 'OSG-ATAP', note: 'the low end of the S45C advisable band 15–50 m/min' },
    k: 5.1,
    slit: { group: 'P.4 heat treatable steels ≤ 900 N/mm²', vc: [10, 20], fz: [0.02, 0.03], type: 'W', src: 'ZPS-SAW' },
  },
  'cast iron': {
    material: 'ductile iron GJS (the MVE < 450 MPa / WSX445 < 800 MPa / Sandvik 09.2 pearlitic rows)',
    face: { vc: 200, fz: 0.15, src: 'MMC-WSX445' },
    bodies: { list: WSX_BODIES, assumed: true, note: WSX_NOTE },
    rough: { fz: 0.2, apMm: 3.0, src: 'MMC-WSX445' },
    faceFinish: { apMm: 1.0, src: 'MMC-WSX445', note: 'the WSX445 finish row: fz 0.15, ap < 1.0 mm' },
    boreRough: { roughApMm: 5.0, roughSrc: 'TUNGALOY-T515-RANGE', finishApMm: 1.0, finishSrc: 'MMC-MC6100',
      note: 'rough ap ≤ 5.0 mm (T515 CM breaker .004–.197 in); finish ap ≤ 1.0 mm — the steel F-range figure, no cast-iron finish ap read' },
    shoulder: { vc: 190, fz: 0.25, body: { dc: 50, z: 4 }, bodyAssumed: true, apLimitMm: 20, src: 'MMC-APX4000' },
    drill: { pts: [{ d: 12, n: 1900, f: 0.31 }, { d: 16, n: 1400, f: 0.33 }], src: 'MMC-MVE',
      note: 'the MVE ductile row is < 450 MPa; Sandvik R840 pearlitic 09.2 (vc 70–100, fn 0.30–0.55 at Ø10–14) brackets it for GJS-500' },
    bore: { vc: 201, f: 0.2, src: 'TUNGALOY-T515' },
    turnFinish: { vc: 260, fn: 0.1, src: 'SANDVIK-TURN' },
    turnRough: { vc: 215, fn: 0.3, src: 'SANDVIK-TURN' },
    tap: { vc: 15, src: 'OSG-ATAP', note: 'FCD has no advisable band, only "possible" 5–50 m/min — 15 m/min taken inside it' },
    k: 4.6,
    slit: { group: 'K.1 cast iron ≤ 240 HB', vc: [15, 25], fz: [0.04, 0.05], type: 'H', src: 'ZPS-SAW' },
  },
  aluminium: {
    material: 'aluminium alloy (wrought 6xxx / cast Al-Si rows)',
    face: { vc: 1000, fz: 0.2, src: 'TUNGALOY-TUNGALU' },
    bodies: { list: [{ dc: 50, z: 4 }, { dc: 63, z: 5 }, { dc: 100, z: 6 }], assumed: false,
      note: 'cutter Ø chosen from the face width; teeth Ø50 z4 / Ø63 z5 / Ø100 z6 from the TungAlu-Mill worked table' },
    rough: { fz: 0.2, apMm: 2.0, src: 'TUNGALOY-TUNGALU' },
    faceFinish: { apMm: null, src: null, note: 'the TungAlu-Mill row gives one set of data (fz 0.2, max ap 2.0 mm) — no separate finishing pass' },
    boreRough: { roughApMm: 3.0, roughSrc: 'MMC-SVJD', finishApMm: 1.0, finishSrc: 'MMC-MC6100',
      note: 'rough ap ≤ 3.0 mm (SVJD HTi10 ap 0.2–3.0); finish ap ≤ 1.0 mm — the steel F-range figure, no aluminium finish ap read' },
    shoulder: { vc: 1000, fz: 0.2, body: { dc: 50, z: 4 }, bodyAssumed: false, apLimitMm: 2.0, src: 'TUNGALOY-TUNGALU' },
    drill: { pts: [{ d: 12, n: 2600, f: 0.31 }, { d: 16, n: 1900, f: 0.33 }], src: 'MMC-MVE' },
    bore: { vc: 400, f: 0.2, src: 'MMC-SVJD',
      note: 'no boring row read for aluminium: the SVJD turning vc, f 0.2 as the Tungaloy T515 boring example' },
    turnFinish: { vc: 400, fn: 0.15, src: 'MMC-SVJD',
      note: 'SVJD 400 m/min with Sandvik\'s lowest aluminium fn 0.15; Sandvik\'s 2,000 m/min is not used — few lathes reach that spindle speed at these diameters' },
    turnRough: { vc: 400, fn: 0.3, src: 'MMC-SVJD' },
    tap: { vc: 15, src: 'OSG-ATAP', note: 'AC / ADC has no advisable band, only "possible" 5–50 m/min — 15 m/min taken inside it' },
    k: 2.1,
    slit: { group: 'N.1 aluminium, cast Al-Si ≤ 6 % Si', vc: [100, 150], fz: [0.03, 0.07], type: 'W', src: 'ZPS-SAW' },
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
 * The passes a face takes from its per-side stock (PKG-2, CF-06 — 10 Nov 2026): with no stock stated (a part cut from
 * solid, a feature's own minutes) one finish pass, as before. With the route's stock: where the catalogue gives finishing
 * data distinct from roughing (steel, cast iron — WSX445) the last pass is a finish pass of up to `faceFinish.apMm` and the
 * rest is roughed at up to `rough.apMm` a pass, n_rough = ⌈(stock − finish ap) ÷ rough ap⌉; where it does not
 * (aluminium — one TungAlu-Mill row) ⌈stock ÷ max ap⌉ passes at the face data.
 */
export function facePassPlan(family: MaterialFamily | null | undefined, stockMm?: number): { rough: number; finish: number; text: string } {
  const { row } = catalogueFor(family);
  if (stockMm === undefined || !(stockMm > 0)) return { rough: 0, finish: 1, text: 'one finish pass' };
  const fin = row.faceFinish.apMm;
  if (fin === null) {
    const n = Math.max(1, Math.ceil(stockMm / row.rough.apMm - 1e-9));
    return { rough: 0, finish: n, text: `${stockMm} mm stock ÷ ap ≤ ${row.rough.apMm} mm = ${n} pass(es) at the face data (${row.faceFinish.note})` };
  }
  if (stockMm <= fin + 1e-9) return { rough: 0, finish: 1, text: `${stockMm} mm stock ≤ the ${fin} mm finishing ap — one finish pass (${row.faceFinish.note})` };
  const n = Math.max(1, Math.ceil((stockMm - fin) / row.rough.apMm - 1e-9));
  return { rough: n, finish: 1,
    text: `⌈(${stockMm} mm stock − ${fin} mm finish) ÷ ${row.rough.apMm} mm rough ap⌉ = ${n} rough pass(es) at fz ${row.rough.fz} + 1 finish pass at fz ${row.face.fz} (${row.faceFinish.note}; rough ap the WSX445 medium row)` };
}

/**
 * Face milling over a face of area A (the feature table gives area, not length and width — the face is taken as √A × √A,
 * stated): each pass cuts (√A + Dc) at its table feed vf = n·z·fz; the 2 × clearance at each end of a pass is fed but not
 * cut (non-cutting, PKG-2 CF-19 / CF-20 — it used to count as cutting); a further pass returns over the face at rapid.
 * Passes from the stock (`facePassPlan`); no stock → one finish pass. `min` is cutting only (× the family's scale).
 */
export function faceMillCutMinutes(family: MaterialFamily | null | undefined, areaMm2: number, stockMm?: number): {
  min: number; clearMin: number; returnMm: number; passes: number; text: string;
} {
  const { scale, row } = catalogueFor(family);
  const side = Math.sqrt(Math.max(areaMm2, 1));
  const c = faceCutter(family, side);
  const plan = facePassPlan(family, stockMm);
  const vfF = c.vf;                                                     // finish: face.vc, face.fz
  const vfR = rpm(row.face.vc, c.body.dc) * c.body.z * row.rough.fz;    // rough: face.vc, rough.fz
  const cutLen = c.passes * (side + c.body.dc);
  const clear = c.passes * 2 * FACE_CLEARANCE_MM;
  const min = (plan.rough * cutLen / vfR + plan.finish * cutLen / vfF) * scale;
  const clearMin = (plan.rough * clear / vfR + plan.finish * clear / vfF) * scale;
  const passes = plan.rough + plan.finish;
  const returnMm = (passes - 1) * c.passes * (side + c.body.dc + 2 * FACE_CLEARANCE_MM);
  const sc = scale !== 1 ? ` × ${+scale.toFixed(3)}` : '';
  const text = (plan.rough ? `${plan.rough} rough × ${c.passes} × (${side.toFixed(0)} + Ø${c.body.dc}) mm ÷ ${vfR.toFixed(0)} mm/min + ` : '')
    + `${plan.finish} × ${c.passes} × (${side.toFixed(0)} + Ø${c.body.dc}) mm ÷ ${vfF.toFixed(0)} mm/min (z${c.body.z})${sc} = ${min.toFixed(3)} min cutting `
    + `[${plan.text}]; + ${passes} × ${c.passes} × 2 × ${FACE_CLEARANCE_MM} mm clearance at feed = ${clearMin.toFixed(3)} min non-cutting`;
  return { min, clearMin, returnMm, passes, text };
}

/**
 * The passes that open a cored / pierced bore of Ø d, length L, with `stockMm` a side (PKG-2, CF-06): above the finishing
 * allowance it is rough-bored at the turning rough row (vc, fn) in ⌈(stock − finish ap) ÷ rough ap⌉ passes, then
 * finish-bored once at the boring row; no stock stated → one finish pass (as before). Cutting minutes per pass (× scale).
 */
export function borePasses(family: MaterialFamily | null | undefined, d: number, L: number, stockMm?: number): {
  passes: Array<{ kind: 'rough' | 'finish'; vf: number; cutMin: number }>; text: string;
} {
  const { row, scale } = catalogueFor(family);
  const D = Math.max(d, 1);
  const fin = boreFeed(family, D);
  const br = row.boreRough;
  const nR = stockMm !== undefined && stockMm > br.finishApMm + 1e-9 ? Math.max(1, Math.ceil((stockMm - br.finishApMm) / br.roughApMm - 1e-9)) : 0;
  const vfR = rpm(row.turnRough.vc, D) * row.turnRough.fn;
  const passes: Array<{ kind: 'rough' | 'finish'; vf: number; cutMin: number }> = [
    ...Array.from({ length: nR }, () => ({ kind: 'rough' as const, vf: vfR, cutMin: L / vfR * scale })),
    { kind: 'finish', vf: fin.vf, cutMin: L / fin.vf * scale },
  ];
  const sc = scale !== 1 ? ` × ${+scale.toFixed(3)}` : '';
  const text = (nR
    ? `${nR} rough pass(es) ${L.toFixed(0)} ÷ ${vfR.toFixed(0)} mm/min (vc ${row.turnRough.vc}, fn ${row.turnRough.fn}) + `
    : '')
    + `finish ${L.toFixed(0)} ÷ ${fin.vf.toFixed(0)} mm/min (n ${fin.n.toFixed(0)} × f ${row.bore.f})${sc}`
    + (stockMm !== undefined ? ` [${stockMm} mm a side: ${nR ? `⌈(${stockMm} − ${br.finishApMm}) ÷ ${br.roughApMm}⌉ = ${nR} rough + 1 finish` : `≤ ${br.finishApMm} mm — one finish pass`}; ${br.note}]` : '');
  return { passes, text };
}

/** Side-milling finish rate, cm²/min: ap (`SIDE_PASS_AP_MM`, capped at the row's limit) × vf of the shoulder row. */
export function sidePassCm2PerMin(family: MaterialFamily | null | undefined): number {
  const { row, scale } = catalogueFor(family);
  const s = row.shoulder;
  const vf = rpm(s.vc, s.body.dc) * s.body.z * s.fz;
  return Math.min(SIDE_PASS_AP_MM, s.apLimitMm) * vf / 100 / scale;
}

/** The shoulder (side-milling) table feed vf = n·z·fz on the row's body, mm/min — the end mill's feed. */
export function shoulderVf(family: MaterialFamily | null | undefined): number {
  const s = catalogueFor(family).row.shoulder;
  return rpm(s.vc, s.body.dc) * s.body.z * s.fz;
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

// ── Slitting saw (Part1 review phase 3, Nov 2026) ───────────────────────────────────────────────────────────────────
/**
 * The listed HSS slitting-saw bodies, by type, Ø and width: [Ø, bore, teeth] (ZPS-FN DIN 1837 type H / DIN 1838 type W,
 * `scripts/research/2026-11-slitting/data.json` #12–29).
 */
export const SLIT_SAW_BODIES: Record<'W' | 'H', ReadonlyArray<{ dc: number; bore: number; z: Record<'2' | '2.5' | '3', number> }>> = {
  W: [{ dc: 63, bore: 16, z: { '2': 40, '2.5': 32, '3': 32 } }, { dc: 80, bore: 22, z: { '2': 40, '2.5': 40, '3': 40 } }, { dc: 100, bore: 22, z: { '2': 48, '2.5': 48, '3': 40 } }],
  H: [{ dc: 63, bore: 16, z: { '2': 80, '2.5': 64, '3': 64 } }, { dc: 80, bore: 22, z: { '2': 80, '2.5': 80, '3': 80 } }, { dc: 100, bore: 22, z: { '2': 100, '2.5': 100, '3': 80 } }],
};
/** Arbor collar Ø as a multiple of the saw's bore — what limits how deep a saw reaches. ASSUMED (engineering-typical, not sourced). */
export const SAW_COLLAR_X_BORE = 2;

/** A slit the kernel measured (`slits` in the geometry): width, the depth the saw passes through, its length in from the edge. */
export interface SlitGeometry { widthMm: number; depthMm: number; lengthMm: number | null }

/**
 * One slit cut by a slitting saw, minutes: the saw is fed along the slit's root through the depth it crosses, at full
 * radial depth = the slit's length; travel = depth + the entry chord √(ae·(D − ae)) + 2 × the face clearance; ÷ vf, vf =
 * n·Z·fz, n = 1000·vc / (π·D). vc and fz are the MIDDLE of the maker's range (the point is engineering-typical); the saw
 * type is the maker's by chip form; Ø the smallest listed whose radius less the collar reaches the length. Cutting only —
 * the tool change is the caller's (one a slitting operation).
 */
export function slitMinutes(family: MaterialFamily | null | undefined, s: SlitGeometry): {
  min: number; text: string; dc: number; z: number; vc: number; fz: number; vf: number; type: 'W' | 'H'; widthRow: string; reachShort: boolean;
} {
  const { row, scale } = catalogueFor(family);
  const sl = row.slit;
  const vc = (sl.vc[0] + sl.vc[1]) / 2, fz = Math.round((sl.fz[0] + sl.fz[1]) / 2 * 10_000) / 10_000;
  const widthRow: '2' | '2.5' | '3' = s.widthMm > 2.75 ? '3' : s.widthMm > 2.25 ? '2.5' : '2';
  const bodies = SLIT_SAW_BODIES[sl.type];
  const reach = (b: { dc: number; bore: number }) => (b.dc - SAW_COLLAR_X_BORE * b.bore) / 2;
  const L = s.lengthMm != null && s.lengthMm > 0 ? s.lengthMm : null;
  const body = (L != null ? bodies.find(b => reach(b) >= L) : null) ?? bodies[bodies.length - 1];
  const z = body.z[widthRow];
  const n = rpm(vc, body.dc);
  const vf = n * z * fz;
  const ae = L != null ? Math.min(L, body.dc / 2) : body.dc / 2;
  const chord = Math.sqrt(ae * (body.dc - ae));
  const travel = Math.max(s.depthMm, 0) + chord + 2 * FACE_CLEARANCE_MM;
  const min = travel / vf * scale;
  const text = `(${f1(s.depthMm)} deep + √(${f1(ae)} × (${body.dc} − ${f1(ae)})) = ${f1(chord)} entry + 2 × ${FACE_CLEARANCE_MM} clearance) = ${f1(travel)} mm `
    + `÷ ${vf.toFixed(1)} mm/min (Ø${body.dc} × ${widthRow} type ${sl.type} Z${z}, vc ${vc} m/min → n ${n.toFixed(1)}, fz ${fz})`
    + (scale !== 1 ? ` × ${+scale.toFixed(3)}` : '') + ` = ${min.toFixed(3)} min`;
  return { min, text, dc: body.dc, z, vc, fz, vf, type: sl.type, widthRow, reachShort: L != null && reach(body) < L };
}
const f1 = (n: number) => (Math.round(n * 10) / 10).toString();

/** The sources a basis names for the operations it used. */
export function sourcesLine(family: MaterialFamily | null | undefined, ops: Array<'face' | 'face-rough' | 'rough' | 'side' | 'drill' | 'bore' | 'bore-rough' | 'tap' | 'turn' | 'slit'>): string {
  const { row, note } = catalogueFor(family);
  const parts: string[] = [];
  const add = (label: string, id: CuttingSourceId, extra?: string) => parts.push(`${label} ${sourceName(id)}${extra ? ` (${extra})` : ''}`);
  for (const op of ops) {
    if (op === 'face') add(`face milling vc ${row.face.vc} m/min, fz ${row.face.fz} —`, row.face.src, row.bodies.note);
    if (op === 'rough') add(`roughing fz ${row.rough.fz}, ap ${row.rough.apMm} mm on the Ø100 body —`, row.rough.src);
    if (op === 'side') add(`side passes vc ${row.shoulder.vc} m/min, fz ${row.shoulder.fz} on Ø${row.shoulder.body.dc} z${row.shoulder.body.z}${row.shoulder.bodyAssumed ? ' (body and teeth ASSUMED)' : ''} —`, row.shoulder.src);
    if (op === 'drill') add(`drilling n·f at Ø${row.drill.pts[0].d} (n ${row.drill.pts[0].n}, f ${row.drill.pts[0].f}) and Ø${row.drill.pts[1].d} (n ${row.drill.pts[1].n}, f ${row.drill.pts[1].f}) —`, row.drill.src, row.drill.note);
    if (op === 'bore') add(`boring vc ${row.bore.vc} m/min, f ${row.bore.f} mm/rev —`, row.bore.src, row.bore.note);
    if (op === 'bore-rough') add(`rough boring at the turning rough row (vc ${row.turnRough.vc} @ fn ${row.turnRough.fn}), ap ≤ ${row.boreRough.roughApMm} mm —`, row.boreRough.roughSrc, row.boreRough.note);
    if (op === 'face-rough' && row.faceFinish.apMm !== null) add(`face roughing fz ${row.rough.fz}, ap ≤ ${row.rough.apMm} mm, finishing ap ≤ ${row.faceFinish.apMm} mm —`, row.faceFinish.src!, row.faceFinish.note);
    if (op === 'tap') add(`tapping ${row.tap.vc} m/min —`, row.tap.src, `${row.tap.note}; pitch ISO 261 coarse`);
    if (op === 'slit') add(`slitting saw ${row.slit.group}: vc ${row.slit.vc[0]}–${row.slit.vc[1]} m/min, fz ${row.slit.fz[0]}–${row.slit.fz[1]} mm (the middle taken — ${ASSUMED}), HSS type ${row.slit.type} bodies —`, row.slit.src, `arbor collar ${SAW_COLLAR_X_BORE} × bore ${ASSUMED}`);
    if (op === 'turn') add(`turning finish vc ${row.turnFinish.vc} @ fn ${row.turnFinish.fn}, rough vc ${row.turnRough.vc} @ fn ${row.turnRough.fn} —`, row.turnFinish.src, row.turnFinish.note);
  }
  return `${row.material}: ${parts.join('; ')}${note ? `; ${note}` : ''}`;
}
