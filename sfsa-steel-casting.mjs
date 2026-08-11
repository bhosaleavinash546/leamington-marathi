// ─────────────────────────────────────────────────────────────────────────────
// SFSA STEEL CASTINGS HANDBOOK, SUPPLEMENT 1 "DESIGN RULES AND DATA" — PINNED.
//
// Steel Founders' Society of America, read FIRST-HAND from the user's copy
// (25 pages). Every constant carries the figure or page it came from. Two
// kinds of value live here and the distinction is preserved everywhere:
//
//   * PRINTED numbers (0.25 in minimum section, the Fig. 8 rib-neutrality
//     triple, the 13-25 mm junction-fillet clamp) — exact, rule-grade.
//   * DIGITIZED curves (Fig. 1 length-dependent minimum section, Fig. 30
//     core diameters) — read off a scanned graph, so they carry a stated
//     uncertainty and are used to SHARPEN or to REPORT, never to invent a
//     precision the scan cannot support.
//
// Scope: STEEL castings (carbon, low-alloy and high-alloy/stainless). NOT
// cast iron — grey iron's graphite expansion gives it a castability this
// document never claims to describe — and not the die-cast alloys, which
// have NADCA. `castSteelGroupFor` is the gate, and everything here abstains
// with a reason rather than borrowing a column.
//
// Tolerances are deliberately ABSENT: they are Supplement 3, a separate
// booklet not supplied. The register keeps naming that blocker honestly.
// ─────────────────────────────────────────────────────────────────────────────

const MM_PER_INCH = 25.4;
const round2 = (v) => Math.round(v * 100) / 100;

/** Is this material a cast steel this supplement speaks for? */
export function castSteelGroupFor(material) {
  if (!material || typeof material !== 'string') {
    return { ok: false, reason: 'No material was given, and the SFSA design rules are written for steel castings specifically.' };
  }
  const m = material.toLowerCase();
  if (/cast iron|gjs|gjv|adi|simo/.test(m)) {
    return { ok: false, reason: `${material} is a cast iron. Graphite expansion during solidification gives iron a castability the SFSA steel rules never claim to describe — its thresholds stay on their own sources.` };
  }
  if (/steel|stainless/.test(m)) return { ok: true, group: /stainless/.test(m) ? 'high-alloy steel' : 'carbon/low-alloy steel' };
  return { ok: false, reason: `${material} is not a steel; SFSA Supplement 1 covers steel castings only.` };
}

/**
 * Minimum section thickness, p.2 + Fig. 1.
 *
 * The PRINTED floor is 0.25 in (6 mm) for conventional steel sand casting.
 * Beyond a 12 in (305 mm) run from the gate, Fig. 1 raises it — the curve is
 * the "best design condition" with metal entering at one position, digitized
 * here at ±1.5 mm from the scan. Investment casting is printed separately:
 * 0.060 in (1.5 mm) walls are common, tapering to 0.030 in (0.76 mm).
 */
const FIG1_MIN_SECTION_MM = [
  // [run length mm, minimum section mm] — first point is the printed 6 mm floor.
  [305, 6], [1270, 12], [2540, 19], [5080, 25], [7620, 28],
];

export const MIN_SECTION = {
  sandMm: 6,
  investmentCommonMm: 1.5,
  investmentMinMm: 0.76,
  basis: 'SFSA Steel Castings Handbook Supplement 1, p.2: "A minimum thickness of 0.25 in. (6 mm) is suggested for design use when conventional steel casting techniques are employed." Investment: "wall thicknesses of 0.060 in. (1.5 mm) are common ... sections tapering down to 0.030 in. (0.76 mm) can readily be achieved."',
};

export function minSectionMm(runLengthMm) {
  const L = Number(runLengthMm);
  if (!(L > 0)) return { ok: false, reason: 'Minimum section needs the length the metal must run.' };
  const pts = FIG1_MIN_SECTION_MM;
  let mm;
  if (L <= pts[0][0]) mm = pts[0][1];
  else if (L >= pts[pts.length - 1][0]) mm = pts[pts.length - 1][1];
  else {
    for (let i = 1; i < pts.length; i++) {
      if (L <= pts[i][0]) {
        const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i];
        mm = y0 + ((L - x0) / (x1 - x0)) * (y1 - y0);
        break;
      }
    }
  }
  return {
    ok: true,
    requiredMm: round2(mm),
    runLengthMm: Math.round(L),
    digitized: L > pts[0][0],
    basis: L <= pts[0][0]
      ? MIN_SECTION.basis
      : `SFSA Supplement 1, Fig. 1 (p.2): minimum section grows with the length the molten steel must run — digitized from the printed curve (±1.5 mm), best-design condition with metal entering at one position. At ${Math.round(L)} mm of run the curve asks ${round2(mm)} mm.`,
  };
}

/**
 * T-junction fillet, Fig. 11 (p.6).
 *
 * r = T1 (the thinner joining section), but NEVER below 1/2 in (13 mm) nor
 * above 1 in (25 mm) — the cap is not a typo: a bigger radius grows the
 * inscribed circle at the joint, and the increase in mass goes as (D/d)^2
 * (Fig. 7). When T2 > 1.5·T1 the radius keeps r = T1 and a 15-degree slope
 * of length at least T2−T1 bridges the difference.
 */
export const JUNCTION_FILLET = {
  minMm: 12.7,
  maxMm: 25.4,
  basis: 'SFSA Supplement 1, Fig. 11 (p.6), read first-hand: "r = T1, but never less than 1/2 in. (13 mm) or greater than 1 in. (25 mm)." T2 >= T1 always; past T2 = 1.5 T1 the fillet keeps r = T1 with a 15 deg slope of length at least T2 - T1.',
};

export function junctionFilletMm(thinnerWallMm) {
  const t = Number(thinnerWallMm);
  if (!(t > 0)) return { ok: false, reason: 'The junction fillet is sized from the thinner joining wall, which was not measured.' };
  return {
    ok: true,
    requiredMm: round2(Math.min(JUNCTION_FILLET.maxMm, Math.max(JUNCTION_FILLET.minMm, t))),
    basis: JUNCTION_FILLET.basis,
  };
}

/**
 * Rib thermal neutrality, Fig. 8 (p.5).
 *
 * The printed triple: a rib T1 = 1/4·T2 is thermally neutral until its height
 * reaches 4·T2; T1 = 1/2·T2 until 1.5·T2; T1 = 3/4·T2 until 0.5·T2. Thicker
 * ribs concentrate heat sooner, which is why the generic "height <= 4 walls"
 * band is only true for the THINNEST printed rib. Interpolated linearly
 * between the printed points; beyond 3/4 the figure prints nothing and this
 * refuses rather than extrapolating. Rib spacing: at least 7·T1 (same figure).
 */
const RIB_NEUTRALITY = [
  // [T1/T2, max h/T2]
  [0.25, 4], [0.5, 1.5], [0.75, 0.5],
];

export const RIB_SPACING_MIN_T1 = 7;   // Fig. 8: "7·T1 min" between staggered ribs

export function ribNeutralHeightLimit(ribToWallRatio) {
  const r = Number(ribToWallRatio);
  if (!(r > 0)) return { ok: false, reason: 'Rib neutrality needs the rib thickness-to-wall ratio.' };
  const pts = RIB_NEUTRALITY;
  if (r > pts[pts.length - 1][0] + 1e-9) {
    return { ok: false, reason: `Fig. 8 stops at a rib of 3/4 the wall; at ${r} the figure prints nothing and no neutral height is claimed. The rib-thickness rule itself fails first.` };
  }
  let limit;
  if (r <= pts[0][0]) limit = pts[0][1];   // thinner than 1/4: the 4·T2 bound is the loosest printed
  else {
    for (let i = 1; i < pts.length; i++) {
      if (r <= pts[i][0]) {
        const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i];
        limit = y0 + ((r - x0) / (x1 - x0)) * (y1 - y0);
        break;
      }
    }
  }
  return {
    ok: true,
    maxHeightToWall: round2(limit),
    basis: `SFSA Supplement 1, Fig. 8 (p.5), read first-hand: a rib of 1/4 the parent wall is thermally neutral until h = 4 walls, 1/2 until 1.5, 3/4 until 0.5 — interpolated at this rib's own ${round2(r)} ratio to a limit of ${round2(limit)} walls. Spacing between ribs: at least 7 rib thicknesses.`,
  };
}

/**
 * Boss proportions, Fig. 16 (p.7) + Table 1.
 *
 * The printed neutrality bands stop at D = 2.0·T (neutral only to h = 0.25·T
 * unfilleted, 0.10·T with an r = D/2 fillet). Beyond twice the parent wall the
 * figure prints no neutral height at all — the boss is a hot spot whatever its
 * height, which is the checkable claim. Boss spacing: 3·T minimum.
 */
export const BOSS = {
  maxDiaToWall: 2.0,
  spacingMinWalls: 3,
  // Table 1 (p.7): minimum recommended boss height by casting length, for
  // machinability when the parent section is light.
  minHeightByCastingLength: [
    { maxLengthMm: 457, heightMm: 6 },
    { maxLengthMm: 1830, heightMm: 19 },
    { maxLengthMm: Infinity, heightMm: 25 },
  ],
  basis: 'SFSA Supplement 1, Fig. 16 (p.7), read first-hand: boss neutrality bands stop at D = 2.0 T (neutral only to h = 0.25 T; 0.10 T with an r = D/2 fillet). Beyond 2 T no neutral height is printed. Spacing 3 T minimum; Table 1 gives minimum boss heights of 6 / 19 / 25 mm by casting length (<=457 / <=1830 / >1830 mm).',
};

/**
 * Section-change rules, Figs. 19-20 (pp.8-9).
 *
 * Adjacent sections on a common centre line join by a 15-degree taper or a
 * radius of at least 1 in (25.4 mm). Cylindrical sections: T2/T1 up to 1.625
 * joins with the taper, up to 2 with a 13-38 mm fillet, and the printed
 * worked case T1 = 13 / T2 = 41 mm (ratio 3.15) is "do not join".
 */
export const SECTION_CHANGE = {
  taperDeg: 15,
  minJoinRadiusMm: 25.4,
  cylindricalTaperMaxRatio: 1.625,
  cylindricalFilletMaxRatio: 2.0,
  doNotJoinRatio: 3.15,
  basis: 'SFSA Supplement 1, pp.8-9 + Figs. 19-20, read first-hand: join sections with a 15 deg taper or r >= 1 in (25.4 mm); cylindrical sections T2/T1 <= 1.625 by taper, <= 2 by a 1/2-1.5 in fillet; the printed 13/41 mm case (ratio ~3.15) is "do not join".',
};

/** External corners, p.9: r between 0.1·T and 0.2·T avoids the thermal gradient that starts corner cracks. */
export const EXTERNAL_CORNER = {
  minRatio: 0.1,
  maxRatio: 0.2,
  basis: 'SFSA Supplement 1, p.9, read first-hand: "an external corner radius of between 0.1 and 0.2 T ... is necessary to avoid high thermal gradients", particularly for hardenable steel.',
};

/** X-junctions, Figs. 13/15: avoid; if kept, fillet r = 1 in max and a cored opening of 38 mm min; offset legs by L > 3T instead. */
export const X_JUNCTION = {
  filletMaxMm: 25.4,
  coredOpeningMinMm: 38.1,
  offsetMinWalls: 3,
  basis: 'SFSA Supplement 1, Figs. 13 & 15 (pp.6-7), read first-hand: eliminate X-junctions where possible; fillets r = 1 in (25.4 mm) max; a cored opening of at least 1.5 in (38 mm) relieves the junction; the best design offsets the legs into two T-junctions with L > 3T.',
};

/**
 * Recommended taper toward risers, p.3 — the soundness equation.
 * Taper = -0.0164·W + 0.0648·T (per unit length, W and T in consistent units;
 * plates take W = 2T). Reported, never gated: it presumes riser positions
 * this tool does not know.
 */
export function recommendedTaper(widthMm, thicknessMm) {
  const W = Number(widthMm); const T = Number(thicknessMm);
  if (!(W > 0) || !(T > 0)) return { ok: false, reason: 'The taper equation needs section width and thickness.' };
  const taper = -0.0164 * W + 0.0648 * T;
  return {
    ok: true,
    taperPerUnit: Math.round(taper * 10000) / 10000,
    basis: 'SFSA Supplement 1, p.3, read first-hand: Taper = -0.0164 W + 0.0648 T (in./in. or cm/cm); for plates W = 2T. Recommended for members that must be radiographically sound; a negative result means no taper is asked for.',
  };
}

/**
 * Minimum core diameter, Fig. 30 (p.12) — DIGITIZED, report-grade only.
 *
 * Horizontal cores supported at both ends, minimum diameter as a function of
 * the surrounding metal thickness, banded by core length. Read off a scanned
 * graph at roughly ±8 mm, which is why this REPORTS a recommendation and
 * gates nothing. Vertical cores may be 25% smaller (printed note).
 */
const FIG30A_IN = {
  // section thickness (in) → min core dia (in), per core-length band
  x: [1, 2, 4, 6, 8, 10, 12],
  'up to 152 mm': [1.0, 1.6, 3.2, 3.7, 4.0, 4.2, 4.35],
  '152-457 mm': [1.7, 2.3, 3.6, 4.1, 4.5, 4.8, 5.0],
  '457-914 mm': [2.5, 3.3, 4.2, 4.6, 5.0, 5.3, 5.6],
};

export function minCoreDiaMm(sectionThicknessMm, coreLengthMm, { vertical = false } = {}) {
  const t = Number(sectionThicknessMm); const L = Number(coreLengthMm);
  if (!(t > 0) || !(L > 0)) return { ok: false, reason: 'The core-diameter curves need the surrounding section thickness and the core length.' };
  if (L > 914) return { ok: false, reason: 'Fig. 30 stops at 36 in (914 mm) of core length; beyond it the figure prints nothing.' };
  const band = L <= 152 ? 'up to 152 mm' : L <= 457 ? '152-457 mm' : '457-914 mm';
  const xs = FIG30A_IN.x; const ys = FIG30A_IN[band];
  const tIn = Math.min(Math.max(t / MM_PER_INCH, xs[0]), xs[xs.length - 1]);
  let dIn = ys[ys.length - 1];
  for (let i = 1; i < xs.length; i++) {
    if (tIn <= xs[i]) {
      dIn = ys[i - 1] + ((tIn - xs[i - 1]) / (xs[i] - xs[i - 1])) * (ys[i] - ys[i - 1]);
      break;
    }
  }
  if (vertical) dIn *= 0.75;
  return {
    ok: true,
    minDiaMm: Math.round(dIn * MM_PER_INCH),
    band,
    vertical,
    basis: `SFSA Supplement 1, Fig. 30A (p.12), DIGITIZED from the printed curves (about +/-8 mm): minimum diameter for a horizontal core supported at both ends, ${band} core-length band, at ${Math.round(t)} mm of surrounding metal.${vertical ? ' Reduced 25% for a vertical core, as the figure permits.' : ''} Smaller cores are possible with special practice - "discuss with the producing foundry".`,
  };
}

/** Pattern draft for jobbing work, p.10 — the book's own average, foundry's choice. */
export const JOBBING_DRAFT = {
  avgDeg: 0.5,
  basis: 'SFSA Supplement 1, p.10, read first-hand: "an average draft equals 1/16 in. per foot (about .5 deg). ... The selection of the draft should therefore be left to the foundry producing the part."',
};
