// ─────────────────────────────────────────────────────────────────────────────
// DUPONT "GENERAL DESIGN PRINCIPLES FOR DUPONT ENGINEERING POLYMERS",
// MODULE I (2000 ed.) — PINNED. Read FIRST-HAND from the user's copy
// (136 pages; §3 "Molding Considerations" pp.6-14 and §4 rib design p.26
// carry every rule-grade number below; §§5-12 are structural/assembly/
// machining engineering and print no DFM thresholds — read and said so).
//
// The one graphical source (Fig 4.07 rib proportions) was read from the
// page image, not the text layer. Everything here quotes the printed page.
//
// Scope: the resins Table 3.01 actually names — Zytel (nylon), reinforced
// nylons, Delrin (acetal), Rynite (PET). Other thermoplastics (ABS, PC,
// PP, PBT, PPS, TPU) are NOT in the table and refuse with the reason, so
// the injection-moulding family's generic thresholds keep serving them
// rather than borrowing a DuPont column.
// ─────────────────────────────────────────────────────────────────────────────

const round2 = (v) => Math.round(v * 100) / 100;

/** Map picker material names onto the resin families Table 3.01 prints. */
export function resinGroupFor(material) {
  if (!material || typeof material !== 'string') {
    return { ok: false, reason: 'No material was given, and DuPont Table 3.01 is written per resin family.' };
  }
  const m = material.toLowerCase();
  if (/steel|iron|alumin|magnesium|zinc|copper|brass|titanium|zamak/.test(m)) {
    return { ok: false, reason: `${material} is a metal; the DuPont design principles cover engineering thermoplastics.` };
  }
  if (/pa66-gf|pa6-gf|gf.*(pa|nylon)|(pa|nylon).*gf|glass-filled/.test(m) && /pa|nylon/.test(m)) {
    return { ok: true, group: 'reinforced nylon', tableName: 'Reinforced nylons' };
  }
  if (/\bpa\d|nylon/.test(m)) return { ok: true, group: 'nylon', tableName: 'Zytel®' };
  if (/pom|acetal|delrin/.test(m)) return { ok: true, group: 'acetal', tableName: 'Delrin®' };
  if (/\bpet\b|rynite/.test(m)) return { ok: true, group: 'pet', tableName: 'Rynite® PET resins' };
  return { ok: false, reason: `${material} is not a resin family Table 3.01 names (Delrin, Zytel, reinforced nylons, Rynite PET) - the generic moulding thresholds stay in force for it.` };
}

// ── TABLE 3.01 (p.7): draft angle per resin family and draw depth ──────────
//
// Printed as RANGES for a smooth luster finish; judged at the TOP of each
// range — the conservative end, since the engine cannot see mold polish
// quality. Shallow means less than 1 in (25.4 mm) of draw. Texture adds a
// printed 1 degree per 0.001 in (0.0254 mm) of texture depth.
const DRAFT_TABLE_DEG = {
  // [shallow max, deep max] per side
  acetal: { shallow: 0.25, deep: 0.5 },
  nylon: { shallow: 0.125, deep: 0.5 },
  'reinforced nylon': { shallow: 0.5, deep: 1.0 },
  pet: { shallow: 0.5, deep: 1.0 },
};

export const SHALLOW_DRAW_MAX_MM = 25.4;
export const TEXTURE_DRAFT_DEG_PER_MM = 1 / 0.0254;   // 1 deg per 0.001 in of texture

export function requiredDraftDeg(material, drawDepthMm, { textureDepthMm = 0 } = {}) {
  const g = resinGroupFor(material);
  if (!g.ok) return { ok: false, reason: g.reason };
  const d = Number(drawDepthMm);
  if (!(d > 0)) return { ok: false, reason: 'The draft requirement needs the draw depth.' };
  const row = DRAFT_TABLE_DEG[g.group];
  const band = d <= SHALLOW_DRAW_MAX_MM ? 'shallow' : 'deep';
  const textureAdd = Math.max(0, Number(textureDepthMm) || 0) * TEXTURE_DRAFT_DEG_PER_MM;
  const deg = row[band] + textureAdd;
  return {
    ok: true,
    deg: round2(deg),
    band,
    group: g.tableName,
    basis: `DuPont General Design Principles Module I, Table 3.01 (p.7), READ FIRST-HAND: ${g.tableName}, ${band === 'shallow' ? 'shallow draw (under 1 in / 25.4 mm)' : 'deep draw (over 1 in / 25.4 mm)'} - judged at the top of the printed range (${row[band]} deg per side, smooth luster finish; good draw polish is what earns the bottom of the range).${textureAdd > 0 ? ` A textured surface adds the printed 1 deg per 0.001 in of texture depth: +${round2(textureAdd)} deg.` : ''}`,
  };
}

// ── FILLETS, Fig 3.07 + p.7: the R/T = 0.5 knee and the 0.508 mm floor ─────
export const FILLET = {
  ratioToWall: 0.5,
  minMm: 0.508,
  basis: 'DuPont Module I, Fig 3.07 + p.7, READ FIRST-HAND: the stress-concentration curve flattens at R/T = 0.5 - "fillet radius should equal one-half the wall thickness" - and "the minimum recommended radius for corners is 0.020 in (0.508 mm) and is usually permissible even where a sharp edge is required."',
};

export function filletRequirementMm(wallMm) {
  const w = Number(wallMm);
  if (!(w > 0)) return { ok: false, reason: 'The fillet requirement is sized from the wall thickness, which was not measured.' };
  return { ok: true, requiredMm: round2(Math.max(FILLET.minMm, FILLET.ratioToWall * w)), basis: FILLET.basis };
}

// ── BOSSES, p.8 + Fig 3.27 (p.14) ──────────────────────────────────────────
export const BOSS_OD_TO_HOLE = {
  min: 2.0,
  max: 2.5,
  basis: 'DuPont Module I, p.8, READ FIRST-HAND: "the outside diameter of a boss should be 2 to 2-1/2 times the hole diameter to ensure adequate strength"; Fig 3.27 (p.14) repeats the same 2-2.5 D band around molded-in inserts. Below the band the boss is weak; above it the mass sinks and voids.',
};

// ── CORED HOLES, p.8 ───────────────────────────────────────────────────────
export const BLIND_CORE = {
  maxDepthToDia: 2,
  bottomMinDiaRatio: 1 / 6,
  basis: 'DuPont Module I, p.8, READ FIRST-HAND: a blind hole is formed by a core pin supported at one end only, so "the depth of a blind hole is generally limited to twice the diameter of the core pin" - deeper needs a stepped pin or a counterbored wall (Fig 3.12). The bottom of a blind hole should be at least 1/6 of the diameter to eliminate bulging (Fig 3.16).',
};

// ── STRIPPED UNDERCUTS, pp.12-13 ───────────────────────────────────────────
export const STRIP_UNDERCUT_PCT = {
  acetal: { maxPct: 5, note: 'beveled, circular shapes only - corners of rectangular undercuts concentrate stress and prevent stripping' },
  nylon: { maxPct: 10, minPct: 6, note: 'beveled; 6-10% usually strips (Fig 3.26 refines by thickness and diameter)' },
  reinforced: { coldMoldPct: 1, hotMoldPct: 2, note: '1% from a 38 degC (100 degF) mold, 2% from a 93 degC (200 degF) mold; rounded, and a collapsible core or split cavity is the recommended route' },
  basis: 'DuPont Module I, pp.12-13, READ FIRST-HAND. % undercut = (A - B) x 100 / B per Fig 3.26.',
};

// ── RIBS, Fig 4.07 (p.26) — read from the page image ───────────────────────
export const RIB = {
  thicknessToWallAppearance: 0.4,
  thicknessToWallStructure: 0.6,
  thicknessToWallFoam: 1.0,
  baseFilletToRibThickness: 0.5,
  draftPerSideDeg: [0.25, 0.5],
  basis: 'DuPont Module I, Fig 4.07 (p.26), READ FIRST-HAND from the page image: rib thickness T = 0.4 W for appearance parts, 0.6 W for structural parts, 1.0 W only for foam molding; 1/4-1/2 deg draft per side; "fillet radius at base of rib should be 1/2 the rib thickness." Height is set by structural design, not by a printed cap.',
};

// ── THREADS AND INSERTS, pp.8-14 — recorded; no measures read them yet ─────
export const THREADS = {
  endClearanceMm: 0.8,
  avoidFinerThanPitch: 32,
  strippableMinDiaToWall: 20,
  basis: 'DuPont Module I, pp.10-11, READ FIRST-HAND: threads terminate at least 1/32 in (0.8 mm) from the end; threads finer than 32 pitch are difficult to mold; stripped threads need a diameter-to-wall ratio greater than 20:1 and a roll/round form (R = 0.288 x pitch).',
};

export const INSERTS = {
  seatMinDiaRatio: 1 / 6,
  protrusionMinMm: 0.41,
  preheatAcetalC: 93,
  preheatNylonC: 121,
  bossOdToInsertDia: [2, 2.5],
  basis: 'DuPont Module I, pp.13-14, READ FIRST-HAND: material beneath an insert at least 1/6 of the insert diameter; the insert protrudes at least 0.016 in (0.41 mm) into the cavity; preheat 93 degC acetal / 121 degC nylon; boss 2-2.5 x insert diameter (Fig 3.27).',
};

/** Weld lines in heavily loaded glass/mineral-reinforced resins carry ~60% of base strength (p.14). */
export const REINFORCED_WELD_LINE_STRENGTH_PCT = 60;
