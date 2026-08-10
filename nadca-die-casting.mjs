// ─────────────────────────────────────────────────────────────────────────────
// NADCA, *Product Design for Die Casting*, 7th edition (2015) — READ FIRST-HAND.
//
// This module is the die-casting counterpart of sheet-metal-forming.mjs. Every
// constant and every formula below was read out of the book itself, and each is
// tagged with the section, figure or table it came from so a reader can go and
// check it. That matters more here than usual: four entries in
// docs/threshold-audit.json carried `blockedBy: "nadca.com and diecasting.org
// unreachable from this environment"` and two of them were graded CONTESTED,
// because the tool's draft numbers rested on secondary summaries of exactly
// this document.
//
// WHAT THIS BOOK DOES AND DOES NOT SETTLE. It is the DESIGN sourcebook, not
// *NADCA Product Specification Standards for Die Castings* (publication #402).
// It carries the draft calculation, the fillet geometry and the alloy
// characteristic tables in full; it explicitly refers the reader to #402 for
// tolerance grades and reproduces none of them. So the tolerance-capability
// rules in this catalogue remain unaudited and must keep saying so.
//
// THE HEADLINE. Draft is not a constant. It falls as the feature gets deeper,
// it changes with the alloy, and an inside surface needs twice what an outside
// surface needs. Every casting rule in this tool compared against one flat
// figure, which is correct at exactly one depth:
//
//        depth        3 mm    6 mm   10 mm   25 mm   50 mm  100 mm
//   Al outside       2.78°   1.96°   1.52°   0.96°   0.68°   0.48°
//   Al inside        5.56°   3.93°   3.04°   1.92°   1.36°   0.96°
//   our old flat     1.00°   1.00°   1.00°   1.00°   1.00°   1.00°
//
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Draft constants C, by alloy group and surface type.
 *
 * Product Design for Die Casting, 7th ed., §3.1 "Draft requirements", the table
 * on p. 46 accompanying Figure 3.11. A LARGER C means LESS draft is required.
 *
 * `holeTotal` is the constant for the INCLUDED angle of a cored hole — the book
 * labels that column "Hole, Total" — so the per-side figure is half of what the
 * formula returns. Getting that wrong would double every cored-hole requirement.
 */
export const DRAFT_CONSTANT = {
  zinc: { inside: 50, outside: 100, holeTotal: 34 },
  magnesium: { inside: 35, outside: 70, holeTotal: 24 },
  aluminium: { inside: 30, outside: 60, holeTotal: 20 },
  copper: { inside: 25, outside: 50, holeTotal: 17 },
};

/** Degrees per radian, as the book writes it in the draft-angle formula. */
const DEG_PER_RAD = 57.2738;
const MM_PER_INCH = 25.4;

/**
 * Which row of the draft table an alloy sits in.
 *
 * The book groups by BASE METAL, not by grade, so ZA alloys share the zinc row —
 * it is titled "Zinc and ZA". Anything outside the four rows abstains rather
 * than borrowing a neighbour's constant: a cast iron judged against the copper
 * row would be a fabricated number wearing a citation.
 */
export function draftGroupFor(material) {
  const m = String(material || '');
  if (!m) return { ok: false, reason: 'No material was chosen, and the NADCA draft constant is per alloy group.' };
  if (/zinc|zamak|\bZA-\d/i.test(m)) return { ok: true, group: 'zinc' };
  if (/magnesium|\bAZ\d|\bAM\d/i.test(m)) return { ok: true, group: 'magnesium' };
  if (/alumini?um|\bA3\d\d|ADC\d|AlSi|Silafont|Castasil|Aural|Magsimal|Mercalloy/i.test(m)) return { ok: true, group: 'aluminium' };
  if (/copper|brass|bronze|CuZn|CuSn/i.test(m)) return { ok: true, group: 'copper' };
  return {
    ok: false,
    reason: `NADCA gives draft constants for zinc/ZA, magnesium, aluminium and copper only. "${m}" is in none of those groups, so the required draft cannot be computed from the standard.`,
  };
}

/**
 * The draft angle NADCA requires, in degrees.
 *
 *   A° = 57.2738 / (C · √L)      L in INCHES
 *
 * §3.1, p. 45. Verified against the book's own worked example for an aluminium
 * inside surface (C = 30) before being used anywhere:
 *
 *   L = 0.1 in → book 6.0°,  this 6.04°
 *   L = 1.0 in → book 1.9°,  this 1.91°
 *   L = 5.0 in → book 0.85°, this 0.85°
 *
 * @param {string} material
 * @param {number} depthMm   how deep the feature is along the draw
 * @param {'inside'|'outside'|'holeTotal'} surface
 */
export function requiredDraftDeg(material, depthMm, surface = 'outside') {
  const g = draftGroupFor(material);
  if (!g.ok) return { ok: false, reason: g.reason };
  const C = DRAFT_CONSTANT[g.group]?.[surface];
  if (!(C > 0)) return { ok: false, reason: `No NADCA draft constant for a ${surface} surface.` };
  const L = Number(depthMm) / MM_PER_INCH;
  if (!(L > 0)) {
    return { ok: false, reason: 'Draft depends on how deep the feature is, and no depth could be measured along the draw direction.' };
  }
  const deg = DEG_PER_RAD / (C * Math.sqrt(L));
  return {
    ok: true,
    group: g.group,
    constant: C,
    depthMm: Math.round(Number(depthMm) * 100) / 100,
    deg: Math.round(deg * 1000) / 1000,
    basis: `NADCA Product Design for Die Casting 7th ed., §3.1 p.45: A = 57.2738 / (C·√L) with C = ${C} for a ${g.group} ${surface === 'holeTotal' ? 'cored hole (total included angle)' : `${surface} surface`}, at a measured depth of ${Math.round(Number(depthMm) * 10) / 10} mm.`,
  };
}

/**
 * Required draft PER SIDE of a cored hole.
 *
 * The book's constant is for the total included angle, so this halves it. The
 * distinction is why our old flat 2°/side was right at about 13 mm of bore
 * depth and wrong everywhere else.
 */
export function requiredCoredHoleDraftPerSideDeg(material, depthMm) {
  const r = requiredDraftDeg(material, depthMm, 'holeTotal');
  if (!r.ok) return r;
  return {
    ...r,
    totalDeg: r.deg,
    deg: Math.round((r.deg / 2) * 1000) / 1000,
    basis: `${r.basis} The table column is the TOTAL included angle, so the per-side requirement is half of ${r.deg}°.`,
  };
}

/**
 * THE GENERAL NOTE. What a drawing would carry for a part of this depth.
 *
 * §3.1, p. 46: "It is not common practice to compute the draft for each
 * feature. Draft is usually specified by a general note with exceptions called
 * out for individual features. The formula is useful for establishing general
 * draft requirements and identifying exceptions." The book then works exactly
 * this example — an aluminium casting with most features at least 1 inch deep
 * gets "2° minimum on inside surfaces and 1° minimum on outside".
 *
 * Taking the part's own draw-direction depth as L reproduces that practice. It
 * is the LEAST draft the part could need, so a shallower feature needs more —
 * which the caller must say on the page rather than leave to be inferred.
 */
export function generalNoteDraft(material, partDepthMm) {
  const outside = requiredDraftDeg(material, partDepthMm, 'outside');
  if (!outside.ok) return outside;
  const inside = requiredDraftDeg(material, partDepthMm, 'inside');
  return {
    ok: true,
    group: outside.group,
    partDepthMm: outside.depthMm,
    outsideDeg: outside.deg,
    insideDeg: inside.deg,
    basis: `NADCA §3.1 pp.45-46, A = 57.2738 / (C·√L) with C = ${outside.constant} outside and ${DRAFT_CONSTANT[outside.group].inside} inside for ${outside.group}. General-note practice, computed at this part's own ${outside.depthMm} mm depth along the draw. Inside surfaces take twice the outside figure because the alloy shrinks ONTO ejector-half features and AWAY FROM cover-half features. Features shallower than the part depth need MORE than this.`,
  };
}

/**
 * Area of wall below a given draft angle, read off the measured histogram.
 *
 * The geometry engine already emits `draftHistogramDegToAreaMm2`, one bucket per
 * whole degree. Interpolating it linearly inside the bucket that contains the
 * requirement turns a fixed 7-point curve into an answer at any angle, which is
 * what a computed requirement needs.
 */
export function areaBelowDraftPct(histogram, requiredDeg) {
  if (!histogram || typeof histogram !== 'object') return undefined;
  const buckets = Object.entries(histogram)
    .map(([deg, area]) => [Number(deg), Number(area)])
    .filter(([d, a]) => Number.isFinite(d) && Number.isFinite(a) && a >= 0)
    .sort((a, b) => a[0] - b[0]);
  if (!buckets.length || !(requiredDeg > 0)) return undefined;
  const total = buckets.reduce((s, [, a]) => s + a, 0);
  if (!(total > 0)) return undefined;
  let below = 0;
  for (const [deg, area] of buckets) {
    if (deg + 1 <= requiredDeg) { below += area; continue; }
    if (deg >= requiredDeg) break;
    // The requirement lands inside this bucket. Faces are assumed spread evenly
    // across the degree, which is the only assumption a histogram supports.
    below += area * (requiredDeg - deg);
  }
  return Math.round((below / total) * 100 * 100) / 100;
}

// ── Fillets and corners, Figure 3.2 (pp. 40–41) ──────────────────────────────
//
// The book gives fillet radius as a RATIO TO WALL, in three bands that map
// exactly onto pass / warn / fail. The tool held a flat 1.6 mm, which passes a
// 1.6 mm radius on a 6 mm wall where the book wants 6 mm.

/** R1 ≥ T at a uniform wall junction; R1 ≥ ⅔(T1+T2) where the walls differ. */
export const FILLET_RATIO = {
  /** Inside radius over the nominal wall, at a junction of two equal walls. */
  uniformJunction: 1.0,
  /** Multiplier on (T1 + T2) where the two walls differ. */
  nonUniformJunction: 2 / 3,
  /** Rib tops and tee junctions: optimal at 0.5·T. */
  ribTop: 0.5,
  /** Below this fraction of the wall the book calls it "not recommended". */
  ribTopFloor: 0.25,
  basis: 'NADCA Product Design for Die Casting 7th ed., Figure 3.2 (pp. 40-41): at a uniform wall junction R1 >= T1 and R2 = R1 + T1; between non-uniform walls R1 >= 2/3(T1 + T2); on rib tops and tee junctions R1 = 0.5·T1 optimal, below 0.25·T1 not recommended.',
};

/** Outside corner radius that pairs with an inside fillet: R2 = R1 + T. */
export function outsideCornerRadiusMm(insideRadiusMm, wallMm) {
  const r = Number(insideRadiusMm); const t = Number(wallMm);
  if (!(r >= 0) || !(t > 0)) return undefined;
  return Math.round((r + t) * 100) / 100;
}

/** R1 = sinΘ·T and R2 = (1/sinΘ)·T at an X or Y junction of included angle Θ. */
export function junctionRadiiMm(includedAngleDeg, wallMm) {
  const t = Number(wallMm); const a = Number(includedAngleDeg);
  if (!(t > 0) || !(a > 0) || a >= 180) return undefined;
  const s = Math.sin((a * Math.PI) / 180);
  if (!(s > 0)) return undefined;
  return {
    insideMm: Math.round(s * t * 100) / 100,
    outsideMm: Math.round((t / s) * 100) / 100,
    basis: 'NADCA Figure 3.2 (p.41): R1 = sinΘ·T1, R2 = (1/sinΘ)·T1 at an X or Y wall junction.',
  };
}

// ── The chilled skin, §4.2 pp. 93–94 ─────────────────────────────────────────
//
// "The skin ... extends inward to a typical thickness of 0.015 to 0.020 in.
// (0.38 to 0.50 mm) ... Skin thickness of a die casting is relatively constant
// and is NOT a function of total wall thickness; therefore, thin-wall sections
// can actually be stronger and more consistent than thick sections. The removal
// of the skin to a depth greater than 0.020 in. (0.50 mm) by secondary
// processes such as machining, increases the chance of exposing porosity in the
// core." — citing Borland and Tsumagari (2006).

export const SKIN = {
  minMm: 0.38,
  maxMm: 0.50,
  basis: 'NADCA Product Design for Die Casting 7th ed., §4.2 pp.93-94 and Figure 4.6, citing Borland and Tsumagari (2006): the dense chilled skin is 0.38-0.50 mm and does not thicken with the wall.',
};

// ── Die-filling capacity by alloy, Table 4.8 (p. 100) ────────────────────────
//
// "Ability of molten alloy to flow readily in die and fill thin sections",
// rated 1 (best) to 5 (worst). The tool applied one minimum wall to every
// aluminium die-casting alloy; the book says 413 fills a thin section far
// better than 518 does.

export const DIE_FILLING_CAPACITY = {
  'Aluminium A413 (die-cast)': 1,
  'Aluminium AlSi9Cu3 / EN AC-46000 (die-cast)': 1,
  'Aluminium ADC10 / A383 (die-cast)': 1,
  'Aluminium A380 / ADC12 (die-cast)': 2,
  'Aluminium A360 (die-cast)': 3,
  // The structural vacuum grades are close to Silafont's parent 360 family in
  // silicon content, so they are rated with it rather than given a number the
  // table does not contain.
  'Aluminium AlSi10MnMg (Silafont-36, structural HPDC)': 2,
  'Aluminium Castasil-37 (AlSi9MnMoZr, structural HPDC)': 2,
  basis: 'NADCA Product Design for Die Casting 7th ed., Table 4.8 p.100, "Die-Filling Capacity": 1 = best. Ratings for 383, 384, 390, 413 and A413 are 1; 380 and A380 are 2; 360 and A360 are 3; C443 is 4; 518 is 5.',
};

/**
 * Minimum wall an alloy will fill, scaled from the process band by its rating.
 *
 * The process figure stays the anchor — the book gives no minimum-wall table and
 * says plainly there are none — so this only STRETCHES it by the one axis NADCA
 * does quantify. A rating of 2 (A380, the most common) reproduces the existing
 * number exactly, so nothing moves for the alloy the old rule was written for.
 */
export function minWallForAlloyMm(material, processMinMm) {
  const rating = DIE_FILLING_CAPACITY[material];
  const base = Number(processMinMm);
  if (!Number.isFinite(rating) || !(base > 0)) return { ok: false };
  const factor = 1 + (rating - 2) * 0.15;
  return {
    ok: true,
    rating,
    minMm: Math.round(base * factor * 100) / 100,
    basis: `${DIE_FILLING_CAPACITY.basis} This alloy rates ${rating}, so the process minimum of ${base} mm is scaled by ${factor.toFixed(2)}.`,
  };
}

// ── Threaded-boss proportion, §3.2 p. 51 ─────────────────────────────────────
//
// "The shear strength and modulus of elasticity of die casting alloys is much
// lower than that of cast iron and steel, making the die cast joint more prone
// to dilation than a ferrous casting. ... Therefore, the boss diameter should
// be at least twice the bolt diameter."

export const BOSS_DIA_TO_HOLE_DIA = {
  min: 2.0,
  basis: 'NADCA Product Design for Die Casting 7th ed., §3.2 "Threaded Fasteners" p.51: the boss diameter should be at least twice the bolt diameter, because a die-cast boss dilates under the wedging action of the threads.',
};

// ── As-cast surface roughness, Table 3.26 (p. 68) ────────────────────────────

export const AS_CAST_ROUGHNESS_UIN = {
  aluminium: { newDie: 63, overDieLife: 125 },
  magnesium: { newDie: 63, overDieLife: 63 },
  zinc: { newDie: 32, overDieLife: 63 },
  basis: 'NADCA Product Design for Die Casting 7th ed., Table 3.26 p.68: aluminium, ZA-12 and ZA-27 hold 63 microinch or better in a new die and 100-125 over its life; magnesium 63 and 63; zinc and ZA-8 32 and 63.',
};

/** The roughness this alloy can hold over the life of a die, not just when new. */
export function asCastRoughnessUin(material) {
  const g = draftGroupFor(material);
  if (!g.ok || !AS_CAST_ROUGHNESS_UIN[g.group]) return { ok: false };
  const r = AS_CAST_ROUGHNESS_UIN[g.group];
  return { ok: true, group: g.group, ...r, basis: AS_CAST_ROUGHNESS_UIN.basis };
}

// ── Trim tooling, §2.3 p. 30 ─────────────────────────────────────────────────
//
// "Tooling costs also include trim dies, which can be estimated at an
// additional 15 to 20% of the die casting die cost."
export const TRIM_DIE_PCT_OF_DIE = { low: 0.15, high: 0.20,
  basis: 'NADCA Product Design for Die Casting 7th ed., §2.3 p.30: trim dies can be estimated at an additional 15 to 20% of the die casting die cost.' };
