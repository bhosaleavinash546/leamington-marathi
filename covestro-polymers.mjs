// ─────────────────────────────────────────────────────────────────────────────
// COVESTRO (BAYER) "ENGINEERING POLYMERS: PART AND MOLD DESIGN —
// THERMOPLASTICS, A DESIGN GUIDE" — PINNED. Read FIRST-HAND from the
// user's copy (172 pages). The text layer's digit font does not extract, so
// EVERY number below was read from the rendered page images: Table 2-1
// (p.25), Fig 2-10 (p.25), pp.28, 31, 32, 34.
//
// Scope: the resin families the guide itself covers — Makrolon PC, Bayblend
// PC/ABS, Makroblend PC/PET, Texin/Desmopan TPU. Everything else refuses
// with the reason so the generic (or DuPont) thresholds keep serving it.
// The guide complements DuPont Module I: the two gates are DISJOINT by
// resin family, so a part is judged by the book that actually names its
// material, never by a borrowed column.
// ─────────────────────────────────────────────────────────────────────────────

const round2 = (v) => Math.round(v * 100) / 100;

/** Map picker material names onto the resin families the guide names. */
export function covestroResinFor(material) {
  if (!material || typeof material !== 'string') {
    return { ok: false, reason: 'No material was given, and the Covestro guide is written per resin family.' };
  }
  const m = material.toLowerCase();
  if (/steel|iron|alumin|magnesium|zinc|copper|brass|titanium|zamak/.test(m)) {
    return { ok: false, reason: `${material} is a metal; the Covestro design guide covers engineering thermoplastics.` };
  }
  if (/pc\/abs|pc-abs|bayblend/.test(m)) return { ok: true, group: 'pc-abs', tableName: 'Bayblend PC/ABS' };
  if (/polycarbonate|\bpc\b|makrolon|apec/.test(m)) return { ok: true, group: 'pc', tableName: 'Makrolon PC' };
  if (/\btpu\b|polyurethane|texin|desmopan/.test(m)) return { ok: true, group: 'tpu', tableName: 'Texin & Desmopan TPU' };
  return { ok: false, reason: `${material} is not a resin family the Covestro guide names (Makrolon PC, Bayblend PC/ABS, Makroblend PC/PET, Texin/Desmopan TPU).` };
}

// ── TABLE 2-1 (p.25): rib thickness as a percentage of wall thickness ──────
//
// Two printed columns: "Minimal Sink" and "Slight Sink". The minimal-sink
// figure is the conservative one and is what gates; the slight-sink figure
// travels in the basis so the trade is visible. PC drops to 40% on
// high-gloss surfaces (printed in the same cell).
export const RIB_TABLE = {
  pc: { minimalSink: 0.5, highGloss: 0.4, slightSink: 0.66 },
  'pc-abs': { minimalSink: 0.5, slightSink: 0.66 },
  tpu: { minimalSink: 0.5, slightSink: 0.66 },
  filledNote: 'Filled grades tolerate fuller ribs (60% minimal / 75% slight sink for filled PC and PC/ABS; 55/70 for filled PC/PET).',
  basis: 'Covestro "Part and Mold Design", Table 2-1 (p.25), READ FIRST-HAND from the page image: rib thickness as a percentage of wall - Makrolon PC 50% minimal sink (40% if high gloss) / 66% slight sink; Bayblend PC/ABS 50/66; Texin & Desmopan TPU 50/66. On walls of 1.0 mm or less the rib may equal the wall.',
};

export const RIB_GEOMETRY = {
  baseRadiusToThickness: 0.125,
  minDraftPerSideDeg: 0.5,
  thinWallEqualMm: 1.0,
  basis: 'Covestro "Part and Mold Design", Fig 2-10 (p.25): rib base radius = 0.125 T, rib thickness 0.5 T at the base, minimum 0.5 deg draft per side; text (p.25): walls of 1.0 mm or less may carry ribs equal to the wall.',
};

// ── FILLETS, Fig 2-22 + p.31 ───────────────────────────────────────────────
export const FILLET = {
  ratioToWall: 0.15,
  basis: 'Covestro "Part and Mold Design", p.31 + Fig 2-22, READ FIRST-HAND: "a radius-to-thickness ratio of approximately 0.15 provides a good compromise between performance and appearance for most applications subjected to light to moderate impact loads." Critical areas should carry a radius RANGE on the drawing, not a maximum.',
};

export function filletRequirementMm(wallMm) {
  const w = Number(wallMm);
  if (!(w > 0)) return { ok: false, reason: 'The fillet requirement is sized from the wall thickness, which was not measured.' };
  return { ok: true, requiredMm: round2(FILLET.ratioToWall * w), basis: FILLET.basis };
}

// ── DRAFT, p.32 ────────────────────────────────────────────────────────────
//
// "Use at least one-half degree of draft for most PC-based materials"
// (one degree preferred); "Apec high heat PC and Texin/Desmopan TPU resins
// typically prefer 3 to 5 degrees." Judged at the printed MINIMUM for the
// PC families and at the bottom of the printed preference for TPU. Texture
// adds the same rule of thumb DuPont prints: 1 deg per 0.001 in of depth.
const DRAFT_MIN_DEG = { pc: 0.5, 'pc-abs': 0.5, tpu: 3.0 };

export function requiredDraftDeg(material) {
  const g = covestroResinFor(material);
  if (!g.ok) return { ok: false, reason: g.reason };
  const deg = DRAFT_MIN_DEG[g.group];
  return {
    ok: true,
    deg,
    group: g.tableName,
    basis: g.group === 'tpu'
      ? 'Covestro "Part and Mold Design", p.32, READ FIRST-HAND: "Texin/Desmopan TPU resins typically prefer 3 to 5 degrees of draft" - judged at the bottom of the printed preference. TPU ejects easier from frosted mold surfaces (p.32).'
      : 'Covestro "Part and Mold Design", p.32 + Fig 2-24, READ FIRST-HAND: "use at least one-half degree of draft for most PC-based materials; design permitting, use one degree" - judged at the printed 0.5 deg minimum. Texture adds roughly 1 deg per 0.001 in of depth.',
  };
}

// ── BOSSES, p.28 ───────────────────────────────────────────────────────────
export const BOSS = {
  maxHeightToOd: 5,
  baseBlendMinMm: 0.38,          // the printed 0.015 in blend radius
  basis: 'Covestro "Part and Mold Design", p.28, READ FIRST-HAND: boss-wall to nominal-wall follows the rib guidelines of Table 2-1; a 0.015 in (0.38 mm) blend radius at the base is the printed compromise; "tall bosses - those greater than five times their outside diameter - can create a filling problem at their top or a thick section at their base." The boss hole should extend to base-wall level.',
};

// ── UNDERCUTS, p.34 ────────────────────────────────────────────────────────
export const STRIP_UNDERCUT_PCT = {
  stiffMaxPct: 2,                // Makrolon PC, Bayblend PC/ABS, Apec, filled grades
  tpuTypicalPct: 5,
  tpuIdealPct: 10,
  leadAngleDeg: [30, 45],
  basis: 'Covestro "Part and Mold Design", p.34 + Fig 2-28, READ FIRST-HAND: % undercut = (D - d) x 100 / D. Stiff resins (Makrolon PC, Bayblend PC/ABS, Apec, filled grades): up to 2% with flexible walls and rounded/angled leading edges. Texin/Desmopan TPU: 5% typically, up to 10% under ideal conditions. Lead angle 30-45 deg.',
};
