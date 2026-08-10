// SHEET-METAL FORMING PHYSICS, FROM A BOOK SOMEBODY ACTUALLY READ.
//
// Every number in this file is traceable to:
//
//   Boljanovic, V. — "Sheet Metal Forming Processes and Die Design",
//   Industrial Press. Chapter/section/table/equation numbers are cited on each
//   constant and each function.
//
// That matters beyond tidiness. The threshold register (docs/threshold-audit.json)
// records 0% `primary-read` across the whole catalogue: every guideline the tool
// judges a part against was taken from a secondary summary. These are the first
// thresholds in the product that come from a named reference that was opened,
// read end to end, and quoted with a page reference — so they are the first
// entitled to that status.
//
// WHAT THIS DOES AND DOES NOT REPLACE.
//
// It replaces nothing by default, and that is deliberate. The catalogue already
// carries per-material bend-radius and hole-size tables (DP600 at 2.5 r/t,
// DP980 at 4 r/t, 6061-T6 at 3 r/t) which are better for OUR alloys than this
// book, written before dual-phase steel and covering no 6000-series aluminium
// at all. Compared row by row, our existing values sit INSIDE the book's bands
// nearly everywhere — which is corroboration, not a correction, and the audit
// register now says so.
//
// What the book adds is what we did not have:
//
//   * a MAXIMUM bend radius (Eq. 5.15) — a bend too gentle never yields and the
//     part springs back flat. Nothing in the catalogue tested for it.
//   * SPRINGBACK from the material's own YS/E (Eq. 5.22), the biggest quality
//     issue in sheet metal and previously absent entirely.
//   * the neutral-axis shift as a CURVE (Table 5.3) rather than folklore, which
//     is what makes a developed blank length correct.
//   * strip layout, web sizes and UTILISATION against the book's own 70-80%
//     target (Sec. 4.4) — material being, in its words, "the major portion of
//     the cost of producing a stamped component".
//   * press force and therefore press class (Eq. 4.3/4.4/5.7).
//   * the number of DRAW OPERATIONS from the drawing-ratio table (Table 6.2),
//     which a single depth ratio cannot express.
//
// Where it genuinely CONTRADICTS us — the punch-compression limit gives DP980 a
// 2.8 d/t minimum hole against the 1.5 d/t the catalogue holds — the conflict is
// recorded in docs/threshold-audit.json as contested and BOTH numbers are
// reported. Silently taking the book's side would be replacing an unaudited
// number with a first-principles one, which is progress, but doing it without
// telling anyone is not.

// ─── Material behaviour ──────────────────────────────────────────────────────

/**
 * Table 5.2 — coefficient c in `R_i(min) = c * T`, by material group and temper.
 *
 * Read verbatim from the book. The SOFT column is the annealed condition, HARD
 * is fully work-hardened; a part in an intermediate temper sits between them,
 * which is why an unknown temper is answered with the band rather than a number.
 */
export const BEND_COEFFICIENT_C = {
  'low-carbon-steel': { soft: 0.5, hard: 3.0 },
  'low-alloy-steel': { soft: 0.5, hard: 4.0 },
  'austenitic-stainless': { soft: 0.5, hard: 4.0 },
  aluminium: { soft: 0.0, hard: 1.2 },
  'aluminium-2000': { soft: 1.5, hard: 6.0 },
  'aluminium-3000': { soft: 0.8, hard: 3.0 },
  'aluminium-4000': { soft: 0.8, hard: 3.0 },
  'aluminium-5000': { soft: 1.0, hard: 5.0 },
  copper: { soft: 0.25, hard: 4.0 },
  bronze: { soft: 0.4, hard: 2.0 },
  titanium: { soft: 0.7, hard: 3.0 },
  'titanium-alloy': { soft: 2.5, hard: 4.0 },
};

/**
 * Our material names mapped onto the book's groups, with the properties the
 * formulas need.
 *
 * TWO DIFFERENT KINDS OF CLAIM LIVE HERE and they are graded separately.
 * `bendGroup` is a mapping decision — putting DP600 in "low-alloy-steel" is my
 * judgement about which of the book's twelve groups it belongs to, and it is
 * marked `mapping`. `utsMPa`/`ysMPa`/`eMPa` are NOT in this book for these
 * grades; they are ordinary published mill values and are marked `unaudited`.
 * A material absent from this table makes every rule below ABSTAIN with that
 * reason, rather than being judged against a guess.
 */
export const SHEET_PROPERTIES = {
  'Steel (mild)': { bendGroup: 'low-carbon-steel', utsMPa: 370, ysMPa: 250, eMPa: 210000, propertyStatus: 'unaudited' },
  'Steel (high-strength)': { bendGroup: 'low-alloy-steel', utsMPa: 600, ysMPa: 450, eMPa: 210000, propertyStatus: 'unaudited' },
  'Steel DP600 (dual-phase)': { bendGroup: 'low-alloy-steel', utsMPa: 600, ysMPa: 350, eMPa: 210000, propertyStatus: 'unaudited' },
  'Steel DP980 (dual-phase)': { bendGroup: 'low-alloy-steel', utsMPa: 980, ysMPa: 700, eMPa: 210000, propertyStatus: 'unaudited' },
  // 22MnB5 is quoted in the AS-DELIVERED (ferritic-pearlitic) condition, which
  // is what gets blanked and pierced. After press-hardening it is ~1500 MPa and
  // is not cold-formed at all — the hot-stamping family exists for that, and
  // this book predates press-hardened boron steel entirely.
  'Steel 22MnB5 (press-hardened)': { bendGroup: 'low-alloy-steel', utsMPa: 600, ysMPa: 400, eMPa: 210000, propertyStatus: 'unaudited', note: 'as-delivered condition; the book does not cover press-hardened boron steel' },
  'Stainless Steel 304': { bendGroup: 'austenitic-stainless', utsMPa: 620, ysMPa: 240, eMPa: 193000, propertyStatus: 'unaudited' },
  'Stainless Steel 316L': { bendGroup: 'austenitic-stainless', utsMPa: 580, ysMPa: 220, eMPa: 193000, propertyStatus: 'unaudited' },
  'Stainless Steel 430': { bendGroup: 'low-alloy-steel', utsMPa: 480, ysMPa: 280, eMPa: 200000, propertyStatus: 'unaudited' },
  'Aluminium 5052 (sheet)': { bendGroup: 'aluminium-5000', utsMPa: 230, ysMPa: 195, eMPa: 70000, propertyStatus: 'unaudited' },
  // NO BEND GROUP. Table 5.2 has rows for 2000, 3000, 4000 and 5000 series and
  // for pure aluminium — it has NO 6000-series row, and 6000-series is a
  // heat-treatable structural alloy that behaves nothing like pure aluminium.
  // Mapping it to the "Aluminium" row gave a 0-1.2 r/t band against the 3.0 r/t
  // the catalogue already carries for 6061-T6, which would have looked like the
  // book contradicting a good value when in fact the book is silent. Silence is
  // reported as silence: the bend rule abstains and the catalogue's own
  // per-material figure stands.
  'Aluminium 6061': { bendGroup: null, utsMPa: 310, ysMPa: 275, eMPa: 69000, propertyStatus: 'unaudited', bendGroupNote: 'Table 5.2 has no 6000-series row' },
  'Aluminium 6082': { bendGroup: null, utsMPa: 340, ysMPa: 290, eMPa: 70000, propertyStatus: 'unaudited', bendGroupNote: 'Table 5.2 has no 6000-series row' },
  'Aluminium 7075': { bendGroup: 'aluminium-2000', utsMPa: 570, ysMPa: 500, eMPa: 72000, propertyStatus: 'unaudited', note: '7000-series is not in Table 5.2; grouped with 2000-series, the closest high-strength heat-treatable aluminium the table lists' },
  'Copper (Cu-ETP)': { bendGroup: 'copper', utsMPa: 220, ysMPa: 70, eMPa: 117000, propertyStatus: 'unaudited' },
  'Brass (CuZn39)': { bendGroup: 'bronze', utsMPa: 400, ysMPa: 200, eMPa: 100000, propertyStatus: 'unaudited' },
  'Titanium Ti-6Al-4V': { bendGroup: 'titanium-alloy', utsMPa: 950, ysMPa: 880, eMPa: 114000, propertyStatus: 'unaudited' },
  'Electrical Steel (M250-35A)': { bendGroup: 'low-carbon-steel', utsMPa: 450, ysMPa: 330, eMPa: 200000, propertyStatus: 'unaudited' },
};

/** Every property the formulas need, or null with the reason they cannot run. */
export function sheetPropertiesFor(material) {
  const p = SHEET_PROPERTIES[material];
  if (!p) {
    return {
      known: false,
      reason: material
        ? `no sheet-metal properties on file for "${material}" — the bend, springback and punch rules need UTS, yield and a bend group`
        : 'no material was specified, and every sheet-forming limit is a function of the material',
    };
  }
  return { known: true, ...p, coefficients: p.bendGroup ? BEND_COEFFICIENT_C[p.bendGroup] : null };
}

// ─── Bending ─────────────────────────────────────────────────────────────────

/**
 * Minimum inside bend radius — Sec. 5.5.1, Eq. 5.14a: `R_i(min) = c * T`.
 *
 * WHEN THE TEMPER IS UNKNOWN, the SOFT figure is used and the answer says so.
 * That choice is deliberate and it is the conservative one in the direction that
 * matters: a part failing the annealed limit fails in every condition, so a
 * FINDING is certain. A pass is only a pass for the annealed material, and the
 * band is published beside it so a reader can see what a hardened temper would
 * demand.
 */
export function minBendRadiusMm(material, thicknessMm, temper) {
  const p = sheetPropertiesFor(material);
  if (!p.known) return { ok: false, reason: p.reason };
  const c = p.coefficients;
  if (!c) {
    return {
      ok: false,
      reason: p.bendGroupNote
        ? `${p.bendGroupNote} — this alloy is outside the book's bend table, so its own catalogue figure stands`
        : `no bend coefficient for group "${p.bendGroup}"`,
    };
  }
  const t = Number(thicknessMm);
  if (!(t > 0)) return { ok: false, reason: 'no sheet thickness was measured' };

  const known = temper === 'soft' || temper === 'hard';
  const used = known ? c[temper] : c.soft;
  return {
    ok: true,
    coefficient: used,
    minRadiusMm: Math.round(used * t * 1000) / 1000,
    bandMm: [Math.round(c.soft * t * 1000) / 1000, Math.round(c.hard * t * 1000) / 1000],
    temper: known ? temper : 'assumed annealed',
    basis: known
      ? `Table 5.2, ${p.bendGroup}, ${temper} condition: c = ${used}`
      : `Table 5.2, ${p.bendGroup}: c = ${c.soft} annealed to ${c.hard} fully hard. `
        + 'No temper was given, so the ANNEALED figure is applied — a part that fails this fails in '
        + 'any condition, while a pass holds only for annealed material.',
  };
}

/**
 * Maximum inside bend radius — Eq. 5.15: `R_i(max) <= T * E / (2 * YS)`.
 *
 * The check nobody makes. A bend gentler than this never takes the outer fibre
 * past yield, so on unloading the part springs back to flat and the "bend" is
 * not a bend at all. It is a real and expensive surprise on thin high-yield
 * material, and no DFM tool I know of tests for it.
 */
export function maxBendRadiusMm(material, thicknessMm) {
  const p = sheetPropertiesFor(material);
  if (!p.known) return { ok: false, reason: p.reason };
  const t = Number(thicknessMm);
  if (!(t > 0)) return { ok: false, reason: 'no sheet thickness was measured' };
  return {
    ok: true,
    maxRadiusMm: Math.round((t * p.eMPa) / (2 * p.ysMPa) * 100) / 100,
    basis: `Eq. 5.15, R_max = T*E/(2*YS) with E = ${p.eMPa} MPa and YS = ${p.ysMPa} MPa`,
  };
}

/**
 * Table 5.3 — the neutral-axis shift coefficient (the K-factor), by R_i/T.
 *
 * Cited in the book to Sprovochnik Metallist Vol. 4. Note the shape: it is NOT
 * a constant 0.33 or 0.5 the way flat-pattern folklore has it — it runs 0.23 at
 * R/T = 0.1 up to 0.50 at R/T = 10, and using one value across that range is
 * worth several millimetres of blank on a tightly-bent part.
 */
export const K_FACTOR_TABLE = [
  [0.1, 0.23], [0.2, 0.29], [0.3, 0.32], [0.4, 0.35], [0.5, 0.37], [0.8, 0.40],
  [1.0, 0.41], [1.5, 0.44], [2.0, 0.45], [3.0, 0.46], [4.0, 0.47], [5.0, 0.48],
  [10.0, 0.50],
];

/** Linear interpolation on Table 5.3; clamped at both ends, never extrapolated. */
export function kFactor(radiusOverThickness) {
  const x = Number(radiusOverThickness);
  if (!Number.isFinite(x) || x <= 0) return null;
  const t = K_FACTOR_TABLE;
  if (x <= t[0][0]) return t[0][1];
  if (x >= t[t.length - 1][0]) return t[t.length - 1][1];
  for (let i = 1; i < t.length; i++) {
    if (x <= t[i][0]) {
      const [x0, y0] = t[i - 1]; const [x1, y1] = t[i];
      return Math.round((y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)) * 10000) / 10000;
    }
  }
  return null;
}

/**
 * Bend allowance — Eq. 5.19: `L = 0.017453 * angle * (K*T + R_i)`.
 *
 * The arc length of the neutral line through one bend. Sum these with the flat
 * segments and you have the developed blank; without them a flat pattern is
 * wrong by roughly (angle/90) * T per bend, which on a six-bend bracket is
 * several millimetres of material on every part made.
 */
export function bendAllowanceMm(insideRadiusMm, thicknessMm, angleDeg) {
  const r = Number(insideRadiusMm); const t = Number(thicknessMm); const a = Number(angleDeg);
  if (!(t > 0) || !Number.isFinite(r) || r < 0 || !Number.isFinite(a) || a <= 0) return null;
  const k = kFactor(r / t);
  if (k == null) return null;
  return Math.round(0.017453 * a * (k * t + r) * 1000) / 1000;
}

/**
 * Table 5.4 — springback factor K_s by alloy and final R_f/T.
 *
 * `K_s = 1` is no springback, `K_s = 0` is complete elastic recovery. Note
 * 2024-T: 0.92 at R/T = 1 collapsing to 0.35 at R/T = 25. A large-radius bend in
 * a hard aluminium barely holds its shape at all, and that is invisible to every
 * geometric rule in the catalogue.
 */
export const SPRINGBACK_TABLE = {
  ratios: [1.0, 1.6, 2.5, 4.0, 6.3, 10.0, 25.0],
  alloys: {
    '2024-T': [0.92, 0.905, 0.88, 0.85, 0.80, 0.70, 0.35],
    '7075-O/2024-O': [0.98, 0.98, 0.98, 0.98, 0.975, 0.97, 0.945],
    '7075-T': [0.935, 0.93, 0.925, 0.915, 0.88, 0.85, 0.748],
    '1100-O': [0.99, 0.99, 0.99, 0.99, 0.98, 0.97, 0.943],
  },
};

/**
 * Springback factor from the material's own elastic behaviour — Eq. 5.22.
 *
 *   R_i/R_f = 4*(R_i*YS/(E*T))^3 - 3*(R_i*YS/(E*T)) + 1
 *
 * Preferred over the table because it covers every material rather than four
 * aerospace aluminiums, and because it is a function of YS/E — which is exactly
 * why high-strength steel springs back so much more than mild steel at the same
 * geometry. `overbendDeg` is what a die designer actually asks for: how much
 * further to bend so the part relaxes to the drawing.
 */
export function springback(material, insideRadiusMm, thicknessMm, bendAngleDeg) {
  const p = sheetPropertiesFor(material);
  if (!p.known) return { ok: false, reason: p.reason };
  const r = Number(insideRadiusMm); const t = Number(thicknessMm); const a = Number(bendAngleDeg);
  if (!(t > 0) || !(r >= 0)) return { ok: false, reason: 'bend radius and sheet thickness are both needed' };

  const x = (r * p.ysMPa) / (p.eMPa * t);
  const ratio = 4 * x ** 3 - 3 * x + 1;          // R_i / R_f
  if (!(ratio > 0)) return { ok: false, reason: 'the springback relation did not converge for this geometry' };
  const finalRadiusMm = r / ratio;

  // Eq. 5.21 in its angle form: the bend allowance of the neutral line is the
  // same before and after, so the angles scale with the radii.
  const ks = (2 * (r / t) + 1) / (2 * (finalRadiusMm / t) + 1);
  const out = {
    ok: true,
    springbackFactor: Math.round(ks * 10000) / 10000,
    finalRadiusMm: Math.round(finalRadiusMm * 1000) / 1000,
    basis: `Eq. 5.22 with YS = ${p.ysMPa} MPa, E = ${p.eMPa} MPa`,
  };
  if (Number.isFinite(a) && a > 0) {
    const finalAngle = a * ks;
    out.finalAngleDeg = Math.round(finalAngle * 100) / 100;
    out.overbendDeg = Math.round((a - finalAngle) * 100) / 100;
    // Sec. 5.7: "a 2% to 8% addition to the angle of bend is sufficient
    // allowance for springback" in practice. Where the computed overbend leaves
    // that band, the tooling answer is not overbend alone.
    out.overbendPct = Math.round(((a - finalAngle) / a) * 1000) / 10;
    out.beyondPracticalOverbend = out.overbendPct > 8;
  }
  return out;
}

/** Table 5.4 lookup, kept because a reader may want to check the formula. */
export function springbackFromTable(alloy, finalRadiusOverT) {
  const row = SPRINGBACK_TABLE.alloys[alloy];
  const x = Number(finalRadiusOverT);
  if (!row || !Number.isFinite(x)) return null;
  const r = SPRINGBACK_TABLE.ratios;
  if (x <= r[0]) return row[0];
  if (x >= r[r.length - 1]) return row[row.length - 1];
  for (let i = 1; i < r.length; i++) {
    if (x <= r[i]) {
      return Math.round((row[i - 1] + ((row[i] - row[i - 1]) * (x - r[i - 1])) / (r[i] - r[i - 1])) * 10000) / 10000;
    }
  }
  return null;
}

// ─── Punching ────────────────────────────────────────────────────────────────

/**
 * Permissible compressive stress for a hardened tool-steel punch — Sec. 9.3.3.
 *
 * The book gives 980 to 1560 MPa. The LOWER bound is used: it is the one that
 * yields the larger minimum hole, and a punch sized on the optimistic end is a
 * punch that upsets in production. Published as a constant so a workspace with
 * better punch material can override it.
 */
export const PUNCH_PERMISSIBLE_STRESS_MPA = 980;

/**
 * Smallest punchable hole — Sec. 9.3.3(a) combined with Eq. 4.3.
 *
 *   F = 0.7 * L * T * UTS          (Eq. 4.3, L = pi*d for a round hole)
 *   sigma = F / A <= sigma_pd      (Eq. 9.6, A = pi*d^2/4)
 *   =>  d_min = 2.8 * T * UTS / sigma_pd
 *
 * The ratio d/T therefore depends only on the SHEET's strength against the
 * PUNCH's — which is why the flat "d/t >= 1" folklore is safe on mild steel and
 * dangerous on advanced high-strength steel, where it passes holes that will
 * upset the punch on the first shift.
 */
export function minPunchedHoleMm(material, thicknessMm, punchStressMPa = PUNCH_PERMISSIBLE_STRESS_MPA) {
  const p = sheetPropertiesFor(material);
  if (!p.known) return { ok: false, reason: p.reason };
  const t = Number(thicknessMm);
  if (!(t > 0)) return { ok: false, reason: 'no sheet thickness was measured' };
  const ratio = (2.8 * p.utsMPa) / punchStressMPa;
  return {
    ok: true,
    minDiaMm: Math.round(ratio * t * 1000) / 1000,
    minDiaOverT: Math.round(ratio * 1000) / 1000,
    basis: `Sec. 9.3.3 with Eq. 4.3: d/T = 2.8*UTS/sigma_pd = 2.8*${p.utsMPa}/${punchStressMPa}`,
  };
}

// ─── Forces and press selection ──────────────────────────────────────────────

/**
 * Punch/blanking force — Eq. 4.3, and the press requirement Eq. 4.4.
 *
 * `F = 0.7 * L * T * UTS` over the sheared perimeter, and the book is explicit
 * that unequal thickness, friction and dull edges can add up to 30%, so the
 * PRESS must be sized at `F_p = 1.3 * F`. Reporting the theoretical force and
 * letting somebody buy a press to it is how a job ends up on the wrong machine.
 */
export function blankingForceKN(material, thicknessMm, shearedLengthMm) {
  const p = sheetPropertiesFor(material);
  if (!p.known) return { ok: false, reason: p.reason };
  const t = Number(thicknessMm); const l = Number(shearedLengthMm);
  if (!(t > 0) || !(l > 0)) return { ok: false, reason: 'sheet thickness and sheared length are both needed' };
  const f = (0.7 * l * t * p.utsMPa) / 1000;         // N/mm2 * mm2 -> N, then kN
  return {
    ok: true,
    forceKN: Math.round(f * 10) / 10,
    pressForceKN: Math.round(f * 1.3 * 10) / 10,
    basis: `Eq. 4.3 F = 0.7*L*T*UTS over ${Math.round(l)} mm of cut, +30% press margin (Eq. 4.4)`,
  };
}

/**
 * Bending force for a U-die — Eq. 5.7: `F = 0.67 * UTS * w * T^2 / l`,
 * with the die opening `l = R_i + R_k + T`.
 *
 * Added to the blanking force only when the operations share a press stroke;
 * the caller decides, because a progressive die coins and bends on the same
 * stroke and a standalone brake does not.
 */
export function bendingForceKN(material, thicknessMm, bendLengthMm, insideRadiusMm, dieRadiusMm) {
  const p = sheetPropertiesFor(material);
  if (!p.known) return { ok: false, reason: p.reason };
  const t = Number(thicknessMm); const w = Number(bendLengthMm); const ri = Number(insideRadiusMm);
  if (!(t > 0) || !(w > 0) || !(ri >= 0)) return { ok: false, reason: 'thickness, bend length and radius are all needed' };
  const rk = Number.isFinite(Number(dieRadiusMm)) ? Number(dieRadiusMm) : ri;
  const opening = ri + rk + t;
  const f = (0.67 * p.utsMPa * w * t * t) / opening / 1000;
  return {
    ok: true,
    forceKN: Math.round(f * 10) / 10,
    basis: `Eq. 5.7 F = 0.67*UTS*w*T^2/l with die opening l = ${Math.round(opening * 100) / 100} mm`,
  };
}

/**
 * Standard mechanical press capacities, tonnes.
 *
 * Sizing to the next standard press rather than to a bare number is what makes
 * the figure usable: nobody buys a 437 kN press. The ladder is the ordinary
 * commercial one, and it is the one place in this module NOT taken from the
 * book — marked as such rather than dressed up.
 */
export const PRESS_LADDER_TONNES = [25, 40, 63, 80, 100, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500];

export function pressClass(forceKN) {
  const f = Number(forceKN);
  if (!(f > 0)) return null;
  const tonnes = f / 9.80665;
  const fit = PRESS_LADDER_TONNES.find((c) => c >= tonnes);
  return {
    requiredTonnes: Math.round(tonnes * 10) / 10,
    pressTonnes: fit ?? null,
    // A part that needs more than the largest press on the ladder is not
    // "2500 tonnes"; it is a part that needs a transfer line, and saying so is
    // more useful than rounding it into the table.
    beyondLadder: fit == null,
    basis: 'commercial mechanical-press capacity ladder — NOT from the book',
  };
}

// ─── Deep drawing ────────────────────────────────────────────────────────────

/**
 * Table 6.2 — optimal drawing ratio m per operation, by relative thickness
 * `T_r = 100*T/D`.
 *
 * The rows are the successive draws. This is the table that answers the question
 * a single depth/width ratio cannot: not "is this drawable" but "how many draws,
 * and therefore how many dies". Bands are stored as [min, max] exactly as
 * printed; the conservative (larger) m is used, because a larger m is a smaller
 * reduction per draw and therefore MORE operations — the answer that does not
 * quietly under-quote the tooling.
 */
export const DRAW_RATIO_TABLE = {
  // Relative-thickness bands, high to low, as printed.
  bands: [
    { min: 1.5, max: 2.0, m: [[0.48, 0.50], [0.73, 0.75], [0.76, 0.78], [0.78, 0.80], [0.80, 0.82]] },
    { min: 1.0, max: 1.5, m: [[0.50, 0.53], [0.75, 0.76], [0.78, 0.79], [0.80, 0.81], [0.82, 0.84]] },
    { min: 0.6, max: 1.0, m: [[0.53, 0.55], [0.76, 0.78], [0.79, 0.80], [0.81, 0.82], [0.84, 0.85]] },
    { min: 0.3, max: 0.6, m: [[0.55, 0.58], [0.78, 0.79], [0.81, 0.82], [0.80, 0.83], [0.85, 0.86]] },
    { min: 0.15, max: 0.3, m: [[0.58, 0.60], [0.79, 0.80], [0.81, 0.82], [0.83, 0.85], [0.86, 0.87]] },
    { min: 0.08, max: 0.15, m: [[0.60, 0.63], [0.80, 0.82], [0.80, 0.84], [0.85, 0.86], [0.87, 0.88]] },
  ],
};

/**
 * How many draw operations a cup needs — Sec. 6.2.1 with Table 6.2.
 *
 * Each draw can only reduce the diameter to `m * d_previous`; the sequence runs
 * until the target is reached. Five is the last row the table gives, so a part
 * still short after five draws is reported as beyond the table rather than
 * extrapolated — the honest answer for a part that needs interstage annealing
 * the table never contemplated.
 */
export function drawStages(blankDiaMm, cupDiaMm, thicknessMm) {
  const D = Number(blankDiaMm); const d = Number(cupDiaMm); const T = Number(thicknessMm);
  if (!(D > 0) || !(d > 0) || !(T > 0)) {
    return { ok: false, reason: 'blank diameter, cup diameter and thickness are all needed' };
  }
  if (d >= D) return { ok: true, stages: 0, note: 'the cup is no smaller than the blank — nothing to draw' };

  const tr = (100 * T) / D;
  const band = DRAW_RATIO_TABLE.bands.find((b) => tr > b.min && tr <= b.max)
    ?? (tr > 2.0 ? DRAW_RATIO_TABLE.bands[0] : null);
  if (!band) {
    return {
      ok: false,
      reason: `relative thickness ${Math.round(tr * 1000) / 1000}% is below the 0.08% floor of Table 6.2 — `
        + 'material this thin against its blank is outside the table, not merely at its edge',
    };
  }

  let current = D;
  const sequence = [];
  for (let i = 0; i < band.m.length; i++) {
    const m = band.m[i][1];                 // the conservative end of the band
    current *= m;
    sequence.push({ stage: i + 1, m, diameterMm: Math.round(current * 100) / 100 });
    if (current <= d) {
      return {
        ok: true, stages: i + 1, sequence,
        relativeThicknessPct: Math.round(tr * 1000) / 1000,
        basis: `Table 6.2, relative thickness band ${band.min}-${band.max}%`,
      };
    }
  }
  return {
    ok: true, stages: band.m.length, sequence, beyondTable: true,
    relativeThicknessPct: Math.round(tr * 1000) / 1000,
    basis: `Table 6.2 runs to ${band.m.length} draws and this cup is still larger than the target after all of them`,
  };
}

// ─── Blank layout and material utilisation ───────────────────────────────────

/**
 * Table 4.3 — absolute web values m (blank to strip edge) and n (blank to
 * blank), and Eq. 4.7 for thicker material.
 */
export const WEB_TABLE = {
  thinStrip: [                             // T <= 0.6 mm, by strip width
    { maxWidthMm: 75, mn: 2.0 }, { maxWidthMm: 100, mn: 3.0 },
    { maxWidthMm: 150, mn: 3.5 }, { maxWidthMm: 300, mn: 4.0 },
  ],
  thickN: [                                // T > 0.6 mm, n only
    { maxT: 0.8, n: 3.5 }, { maxT: 1.25, n: 4.3 }, { maxT: 2.5, n: 5.5 },
    { maxT: 4.0, n: 6.0 }, { maxT: 6.0, n: 7.0 },
  ],
};

/**
 * Strip layout and material utilisation — Sec. 4.4.
 *
 * The book opens the chapter with "the major portion of the cost of producing a
 * stamped component is the material" and sets the target at 70-80% of the strip.
 * The report prices a stamping today and never shows utilisation at all, which
 * means the biggest cost lever on the part is invisible.
 *
 * A RECTANGULAR ENVELOPE, stated as such. Real nesting rotates and interlocks
 * blanks and does better than this; taking the part's flat bounding box gives a
 * LOWER BOUND on utilisation, which is the same discipline the hole-to-edge
 * measure already follows. A lower bound that is honest beats a nesting figure
 * that is invented.
 */
export function stripLayout(blankWidthMm, blankLengthMm, thicknessMm) {
  const D = Number(blankWidthMm); const L = Number(blankLengthMm); const T = Number(thicknessMm);
  if (!(D > 0) || !(L > 0) || !(T > 0)) {
    return { ok: false, reason: 'blank envelope and sheet thickness are needed' };
  }
  let m; let n; let basis;
  if (T <= 0.6) {
    const stripGuess = D + 4;
    const row = WEB_TABLE.thinStrip.find((r) => stripGuess <= r.maxWidthMm) ?? WEB_TABLE.thinStrip[WEB_TABLE.thinStrip.length - 1];
    m = row.mn; n = row.mn;
    basis = `Table 4.3, T <= 0.6 mm: m = n = ${m} mm`;
  } else {
    m = T + 0.015 * D;                                     // Eq. 4.7
    const row = WEB_TABLE.thickN.find((r) => T <= r.maxT) ?? WEB_TABLE.thickN[WEB_TABLE.thickN.length - 1];
    n = row.n;
    basis = `Eq. 4.7 m = T + 0.015*D = ${Math.round(m * 100) / 100} mm; Table 4.3 n = ${n} mm`;
  }
  const stripWidth = D + 2 * m;
  const pitch = L + n;
  const utilisation = (D * L) / (stripWidth * pitch);
  return {
    ok: true,
    edgeWebMm: Math.round(m * 100) / 100,
    blankWebMm: n,
    stripWidthMm: Math.round(stripWidth * 100) / 100,
    pitchMm: Math.round(pitch * 100) / 100,
    utilisationPct: Math.round(utilisation * 1000) / 10,
    // Sec. 4.4: "lay out blanks in such a way as to utilize at least 70 to 80%
    // of the strip or sheet area."
    meetsBookTarget: utilisation >= 0.70,
    basis: `${basis}. Rectangular envelope, single-pass layout (Fig. 4.7a) — a LOWER bound on what real nesting achieves.`,
  };
}
