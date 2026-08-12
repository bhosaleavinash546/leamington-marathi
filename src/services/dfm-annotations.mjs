// WHICH FINDINGS GET A MARKER ON THE 3D VIEW.
//
// The old callout list was built from the GEOMETRY block — every undercut
// region, six zero-draft regions, four thinnest walls, every rib, every pocket —
// and nothing in it ever read the rule results. So a rib that passed every rule
// in the catalogue got a numbered ring on the picture, and a rule that actually
// FAILED got none, because nothing joined a finding to the faces that broke it.
// The report was annotating what the engine MEASURED instead of what it
// CONCLUDED, which is the same fault page one had before it was reordered.
//
// This module is the join. It is pure so it can be unit-tested without a
// browser, a WebGL context or a PDF: given the analysis, it returns the markers
// the report should carry and — just as important — the findings it could NOT
// place, with the reason. A finding that cannot be located is named in the
// report rather than pinned somewhere plausible.
//
// Three rules govern what comes out:
//   1. ONLY FAILED RULES. Passes, not-evaluated rules and bare geometry
//      observations never produce a marker.
//   2. WORST FIRST, then capped. The cap does the decluttering, not a severity
//      cut-off — so the picture can never contradict the findings table by
//      silently omitting a row the table shows.
//   3. ONE MARKER PER FINDING, on its worst instance. Thirty-four undercut
//      regions is one finding, not thirty-four rings.

/** How many markers a single view can carry before it stops being readable. */
export const ANNOTATION_CAP = 8;

/**
 * Measures that are properties of the WHOLE PART, not of a face.
 *
 * "Three setups" and "0.02 mm tightest tolerance" are true of the part; there is
 * no point on the model where either lives. Pinning them to a face would be an
 * invented location, so they are reported as unlocatable WITH THIS REASON rather
 * than dropped — the difference between "we chose not to mark this" and "we
 * forgot" is the whole of a reader's trust.
 */
const WHOLE_PART_MEASURES = new Set([
  // The NOMINAL wall is a distribution statistic over the whole part — there is
  // no face where "the p50 wall is 30 mm" is true. The p5 wall is different: it
  // IS a place, and it has one (`wallP5Mm` resolves to the thinnest region).
  'wallP50Mm',
  'setupCount', 'axisymmetricAreaPct', 'wallSpreadRatio',
  'tightestToleranceMm', 'slendernessLtoD', 'circumscribingCircleMm',
  'drawDepthToWidth', 'pressDepthToWallRatio',
  'blindHoleCount',
]);
// `unreachableAreaPct` and `overhangAreaBelowDeg` were listed here AND carried a
// region source below, which is a contradiction: whichever way it resolved, one
// of the two was lying. Both are percentages of area, but the area is made of
// FACES the kernel can name — it just wasn't emitting the ids. It is now, so
// they are placed rather than excused, and the excuse is gone with them.
// TEN measures used to sit in that list and should never have. A hole-to-hole
// gap, a short flange, a tight bend and an unreachable pocket all HAPPEN AT A
// PLACE; calling them properties of the whole part was a filing decision, not
// physics. In every case the kernel knew the face and was discarding it at the
// moment it took the minimum — bends already carried `axisPointXYZ`, and the
// tool-reach sweep knew exactly which triangles it failed on. They are kept
// now, and placed below.
//
// What remains above is genuinely whole-part: a setup count, a tolerance band,
// a slenderness ratio, a percentage of surface area. There is no face on the
// model where "three setups" is true.

/**
 * Where to look for coordinates when the finding carries none of its own.
 *
 * Hole and boss rules arrive with per-instance positions already — the rule
 * engine collects them from the feature table. The area and region rules do not,
 * because their measure is a percentage, so the offending PLACES have to be read
 * back out of the geometry block the percentage was computed from.
 *
 * `pick` returns the worst region, using whatever "worst" means for that rule:
 * the largest undercut, the flattest wall, the thinnest section.
 *
 * Two entries take more than the region: `at(geo, finding)` because an overhang
 * rule names the angle it means and the face set differs per angle, and
 * `faces(region, geo)` because a couple of measures are area percentages whose
 * faces are listed once on the block rather than per region. Both extra
 * arguments are optional — every source that does not need them ignores them.
 */
const REGION_SOURCE = {
  undercutFaceCount: {
    at: (g) => g?.dfm?.draft?.undercutRegions,
    xyz: (r) => r.centroidXYZ,
    faces: (r) => (r.faceId == null ? [] : [r.faceId]),
    worst: (a, b) => (Number(b.areaMm2) || 0) - (Number(a.areaMm2) || 0),
    note: (r, n) => (n > 1 ? `largest of ${n} undercut regions` : 'the undercut region'),
  },
  wallAreaBelowDraftPct: {
    at: (g) => g?.dfm?.draft?.zeroDraftRegions,
    xyz: (r) => r.centroidXYZ,
    faces: (r) => (r.faceId == null ? [] : [r.faceId]),
    worst: (a, b) => (Number(a.draftDeg) || 0) - (Number(b.draftDeg) || 0),
    note: (r, n) => (n > 1 ? `flattest of ${n} under-drafted walls` : 'the under-drafted wall'),
  },
  wallP5Mm: {
    at: (g) => g?.dfm?.wallThickness?.thinnestRegions,
    xyz: (r) => r.atXYZ,
    faces: (r) => (r.faceId == null ? [] : [r.faceId]),
    worst: (a, b) => (Number(a.thicknessMm) || 0) - (Number(b.thicknessMm) || 0),
    note: (r) => (r.thicknessMm != null ? `thinnest section, ${r.thicknessMm} mm` : 'the thinnest section'),
  },
  coredHoleDraftPerSideDeg: {
    at: (g) => g?.dfm?.draft?.coredHoles?.bores,
    xyz: (r) => r.atXYZ,
    faces: (r) => (r.faceId == null ? [] : [r.faceId]),
    // Least draft first, then largest wall — the bore that binds hardest on the
    // core pin is the one worth drawing a leader to.
    worst: (a, b) => (Number(a.draftPerSideDeg) || 0) - (Number(b.draftPerSideDeg) || 0)
      || (Number(b.areaMm2) || 0) - (Number(a.areaMm2) || 0),
    note: (r, n) => (n > 1
      ? `least-drafted of ${n} cored holes${r.radiusMm ? `, Ø${(r.radiusMm * 2).toFixed(1)} mm` : ''}`
      : 'the cored hole'),
  },
  maxPocketDepthToWidth: {
    at: (g) => (g?.dfm?.features?.prismatic || []).filter((p) => /pocket|slot/i.test(String(p.kind || ''))),
    xyz: (r) => r.centroidXYZ,
    faces: (r) => (Array.isArray(r.faceIds) ? r.faceIds : []),
    worst: (a, b) => (Number(b.areaMm2) || 0) - (Number(a.areaMm2) || 0),
    note: (r, n) => (n > 1 ? `largest of ${n} pockets` : 'the pocket'),
  },
};
// The rib rules all read the same table and differ only in which end of it is
// worst, so they are registered from one shape rather than copied four times.
for (const [measure, worst] of [
  ['maxRibThicknessToWall', (a, b) => (Number(b.thicknessMm) || 0) - (Number(a.thicknessMm) || 0)],
  ['minRibThicknessToWall', (a, b) => (Number(a.thicknessMm) || 0) - (Number(b.thicknessMm) || 0)],
  ['maxRibHeightToWall', (a, b) => (Number(b.heightMm) || 0) - (Number(a.heightMm) || 0)],
]) {
  REGION_SOURCE[measure] = {
    at: (g) => g?.dfm?.features?.ribs,
    xyz: (r) => r.centroidXYZ,
    faces: (r) => (Array.isArray(r.faceIds) ? r.faceIds : []),
    worst,
    note: (r, n) => (n > 1 ? `worst of ${n} ribs — ${r.thicknessMm} x ${r.heightMm} mm` : 'the rib'),
  };
}

// ── The five that used to have nowhere to point ────────────────────────────
REGION_SOURCE.minInternalCornerRadiusMm = {
  at: (g) => g?.dfm?.features?.internalCorners,
  xyz: (r) => r.centroidXYZ,
  faces: (r) => (r.faceId == null ? [] : [r.faceId]),
  worst: (a, b) => (Number(a.radiusMm) || 0) - (Number(b.radiusMm) || 0),
  note: (r, n) => (n > 1 ? `tightest of ${n} corners, R${r.radiusMm}` : `the R${r.radiusMm} corner`),
};
// A single measured POINT rather than a list — the kernel reports one worst web
// and one worst edge distance, so there is exactly one place to mark.
const singlePoint = (get, label) => ({
  at: (g) => { const p = get(g); return isXYZ(p) ? [{ atXYZ: p }] : []; },
  xyz: (r) => r.atXYZ,
  faces: () => [],
  worst: () => 0,
  note: () => label,
});
REGION_SOURCE.minHoleToHoleToThickness =
  singlePoint((g) => g?.dfm?.sheetMetal?.minHoleToHoleAtXYZ, 'the narrowest web between two openings');
REGION_SOURCE.minHoleToEdgeToThickness =
  singlePoint((g) => g?.dfm?.sheetMetal?.minHoleToEdgeAtXYZ, 'the opening closest to an edge');
REGION_SOURCE.minApertureToThickness = {
  // Already sorted smallest-first by the recogniser; sorted again here so the
  // choice does not depend on somebody else's ordering staying that way.
  at: (g) => g?.dfm?.apertures?.apertures,
  xyz: (r) => r.centroidXYZ,
  // AN APERTURE IS A WIRE, NOT A FACE. The recogniser finds an opening as a
  // paired inner wire on two planar faces, and the face it sits on is the face
  // the opening goes THROUGH — painting it would light up the whole top of the
  // plate to show a Ø6 hole. The wall of the opening is a different face, and
  // the bore pass already knows it by diameter, so a CIRCULAR aperture is
  // joined to its hole row and gets the bore wall. A slot has no such row and
  // gets no faces rather than the wrong ones; it still carries its centroid, so
  // the marker lands on the opening either way.
  faces: (r, g) => {
    if (!r.circular) return [];
    const d = Number(r.circleDiaMm ?? r.equivalentDiaMm);
    if (!Number.isFinite(d) || d <= 0) return [];
    const row = (g?.geometry?.featureTable || [])
      .filter((f) => f.kind === 'hole' && Math.abs(Number(f.diaMm) - d) <= 0.05)
      .sort((a, b) => Math.abs(Number(a.diaMm) - d) - Math.abs(Number(b.diaMm) - d))[0];
    return Array.isArray(row?.faceIds) ? row.faceIds : [];
  },
  worst: (a, b) => (Number(a.equivalentDiaMm) || 0) - (Number(b.equivalentDiaMm) || 0),
  note: (r, n) => (n > 1 ? `smallest of ${n} openings` : 'the opening'),
};
REGION_SOURCE.minBendRadiusToThickness =
  singlePoint((g) => g?.dfm?.sheetMetal?.minBendRadiusAtXYZ, 'the tightest bend');
REGION_SOURCE.minBendToBendToThickness =
  singlePoint((g) => g?.dfm?.sheetMetal?.minBendToBendAtXYZ, 'the land between the two fold lines');
REGION_SOURCE.minFlangeToThickness =
  singlePoint((g) => g?.dfm?.sheetMetal?.minFlangeAtXYZ, 'the bend the short flange stands on');
REGION_SOURCE.holeToBendClearanceMm =
  singlePoint((g) => g?.dfm?.sheetMetal?.holeToBendAtXYZ, 'the opening nearest a fold line');
REGION_SOURCE.unreachableAreaPct = {
  at: (g) => g?.dfm?.toolAccess?.unreachableRegions,
  xyz: (r) => r.atXYZ,
  // The percentage is a union over triangles, so the faces belong to the
  // MEASURE and not to any one patch — read from the block, area-ranked, not
  // from the region the marker happens to sit on.
  faces: (_r, g) => (Array.isArray(g?.dfm?.toolAccess?.unreachableFaceIds)
    ? g.dfm.toolAccess.unreachableFaceIds : []),
  worst: (a, b) => (Number(b.areaMm2) || 0) - (Number(a.areaMm2) || 0),
  note: (r, n) => (n > 1 ? `largest of ${n} unreachable patches` : 'the unreachable surface'),
};
REGION_SOURCE.minHoleDiaToThickness = {
  at: (g) => (g?.geometry?.featureTable || []).filter((f) => f.kind === 'hole'),
  xyz: (r) => r.axisPointXYZ || (Array.isArray(r.instancesXYZ) ? r.instancesXYZ[0] : null),
  faces: (r) => (Array.isArray(r.faceIds) ? r.faceIds : []),
  worst: (a, b) => (Number(a.diaMm) || 0) - (Number(b.diaMm) || 0),
  note: (r, n) => (n > 1 ? `smallest of ${n} hole sizes, D${r.diaMm}` : `the D${r.diaMm} hole`),
};

// ── OVERHANG: the faces of the angle the rule actually read ────────────────
//
// The rule names its cutoff (`overhangCutoffDeg`) and the finding carries it as
// `measuredAtDeg`, so the face set is chosen by that angle rather than by a
// house default. It matters: the analytic wedge is 30° from the plate, which is
// 34% of the surface below 40° and nothing at all below 20°. A single set would
// have painted no faces for a rule that had just failed the part.
REGION_SOURCE.overhangAreaBelowDeg = {
  at: (g, f) => {
    const key = overhangKeyFor(f);
    const ids = key && g?.dfm?.overhang?.overhangFaceIdsByDeg?.[key];
    if (!Array.isArray(ids) || !ids.length) return [];
    const at = g?.dfm?.overhang?.overhangWorstAtXYZByDeg?.[key];
    return isXYZ(at) ? [{ atXYZ: at, faceIds: ids }] : [];
  },
  xyz: (r) => r.atXYZ,
  faces: (r) => (Array.isArray(r.faceIds) ? r.faceIds : []),
  worst: () => 0,
  note: (r) => `${r.faceIds.length} down-facing ${r.faceIds.length === 1 ? 'face' : 'faces'}`,
};

/**
 * The key into the overhang maps for the angle THIS finding was measured at.
 * Null when the finding does not carry one, so the source abstains rather than
 * guessing an angle and painting the wrong faces.
 */
function overhangKeyFor(f) {
  const cut = f?.measuredAtDeg;
  if (cut == null || !Number.isFinite(Number(cut))) return null;
  // The kernel keys whole angles as "45", not "45.0".
  return String(Number(cut)).replace(/\.0+$/, '');
}

// ── FILLET MARGINS: the corner the margin was measured at ──────────────────
//
// Three families each compute "is the internal fillet big enough for the wall"
// as a margin against a book requirement, and all three had nowhere to point —
// yet the margin is derived from `minInternalCornerRadiusMm`, whose corner the
// recogniser locates exactly. The finding is about that corner; it now says so.
for (const measure of ['resinFilletMargin', 'sfsaJunctionFilletMargin', 'nadcaFilletToWall']) {
  REGION_SOURCE[measure] = {
    at: (g) => g?.dfm?.features?.internalCorners,
    xyz: (r) => r.centroidXYZ,
    faces: (r) => (r.faceId == null ? [] : [r.faceId]),
    worst: (a, b) => (Number(a.radiusMm) || 0) - (Number(b.radiusMm) || 0),
    note: (r, n) => (n > 1 ? `tightest of ${n} corners, R${r.radiusMm}` : `the R${r.radiusMm} corner`),
  };
}

const isXYZ = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(Number(n)));

const SEV_RANK = { high: 0, medium: 1, low: 2 };

/** Worst first: severity, then the money, then the biggest overshoot. */
function bySeverityThenImpact(a, b) {
  return (SEV_RANK[a.severity] ?? 3) - (SEV_RANK[b.severity] ?? 3)
    || (Number(b.cost?.annualDeltaEur) || 0) - (Number(a.cost?.annualDeltaEur) || 0)
    || String(a.id).localeCompare(String(b.id));
}

/**
 * The markers for one analysis.
 *
 * @param {object} analysis  the /api/dfm result: { results: [...], dfm: {...} }
 * @param {object} [opts]    { max } — the marker cap, for tests and for callers
 *                           who know their view is small.
 * @returns {{ annotations: Array, notLocated: Array, droppedByCap: number, totalFailing: number }}
 */
export function selectFindingAnnotations(analysis, opts = {}) {
  const max = Number.isFinite(opts.max) ? opts.max : ANNOTATION_CAP;
  // The WHOLE analysis, not just its `dfm` block: the feature table and the
  // aperture list live one level up, and two of the anchors below need them.
  const geo = analysis ?? {};
  const results = Array.isArray(analysis?.results) ? analysis.results : [];

  // FAILED rules only. `findings` already excludes passes and abstentions, but
  // the status is asserted rather than assumed: a future caller passing the full
  // rule list must not silently start annotating clean geometry.
  const failing = results
    .flatMap((r) => (Array.isArray(r.findings) ? r.findings : []))
    .filter((f) => f && f.status !== 'pass' && f.status !== 'not-evaluated')
    .sort(bySeverityThenImpact);

  const annotations = [];
  const notLocated = [];
  let droppedByCap = 0;

  for (const f of failing) {
    if (annotations.length >= max) { droppedByCap++; continue; }

    const placed = locate(f, geo);
    if (!placed) {
      notLocated.push({
        id: f.id,
        title: f.title,
        severity: f.severity,
        reason: unlocatableReason(f),
      });
      continue;
    }

    annotations.push({
      id: `finding-${f.id}`,
      ruleId: f.id,
      // Carried so a caller can ask what KIND of measurement this is without
      // re-deriving it from the title — which is how the two would drift apart.
      measure: f.measure,
      anchorXYZ: placed.xyz.map(Number),
      faceIds: placed.faceIds,
      label: f.title,
      // The measured value against its own limit. A marker that says only
      // "Undercut" tells a supplier nothing they cannot see; one that says
      // "3 faces, limit 0" is the finding itself, on the part.
      value: measuredAgainstLimit(f),
      severity: f.severity ?? 'medium',
      note: placed.note,
    });
  }

  return { annotations, notLocated, droppedByCap, totalFailing: failing.length };
}

/**
 * `41.2 % of wall area  ·  limit <= 5` — the unit said ONCE.
 *
 * Written the obvious way this reads "41.2 % of wall area · limit <= 5 % of wall
 * area", which is 48 characters of monospace and truncated to "...limit <= 5 %
 * of..." in the report's legend column — losing the number that mattered. The
 * unit belongs to the measurement; repeating it on the limit costs the reader
 * the limit.
 */
function measuredAgainstLimit(f) {
  const unit = String(f.unit ?? '').trim();
  const left = [f.measured ?? null, unit].filter((v) => v !== null && v !== undefined && v !== '').join(' ');
  let limit = String(f.thresholdText ?? '').trim();
  if (unit && limit.toLowerCase().endsWith(unit.toLowerCase())) {
    limit = limit.slice(0, -unit.length).trim();
  }
  return [left, limit ? `limit ${limit}` : ''].filter(Boolean).join('  ·  ');
}

/**
 * Coordinates for one finding: its own instance first, the geometry block
 * second, nothing third.
 *
 * The instance is preferred because it is the SAME feature the number came
 * from. Falling back to the region list first would occasionally mark a
 * different hole than the one that failed — right kind of feature, wrong place,
 * which is worse than no marker at all because it looks authoritative.
 */
function locate(f, geo) {
  const instances = Array.isArray(f.instances) ? f.instances : [];
  for (const inst of instances) {
    const xyz = isXYZ(inst.atXYZ) ? inst.atXYZ
      : (Array.isArray(inst.instancesXYZ) && isXYZ(inst.instancesXYZ[0]) ? inst.instancesXYZ[0] : null);
    if (!xyz) continue;
    const n = Number(f.instanceTotal ?? f.instanceCount ?? instances.length);
    return {
      xyz,
      // THE FACES OF THE OFFENDING FEATURE, not an empty list.
      //
      // This branch hardcoded `[]` — so every finding anchored on an instance
      // (all three rib measures, hole and boss slenderness, minimum feature
      // size) got a callout floating at a coordinate and NOTHING painted. It
      // was the single reason "which rib is 1.4x the wall?" had no answer on a
      // part carrying nine ribs. The ids were already on the instance by the
      // time they arrived here; the branch just never looked.
      faceIds: Array.isArray(inst.faceIds) ? inst.faceIds : [],
      note: n > 1 ? `worst of ${n}` : 'the offending feature',
    };
  }

  const src = REGION_SOURCE[f.measure];
  if (!src) return null;
  const regions = (src.at(geo, f) || []).filter((r) => isXYZ(src.xyz(r)));
  if (!regions.length) return null;
  const sorted = [...regions].sort(src.worst);
  const worst = sorted[0];
  return {
    xyz: src.xyz(worst),
    faceIds: src.faces(worst, geo, f) || [],
    note: src.note(worst, regions.length),
  };
}

/**
 * WHERE ONE FINDING IS, resolved on demand and without a cap.
 *
 * `selectFindingAnnotations` above answers a different question — which handful
 * of markers fit on a printed figure — and its `ANNOTATION_CAP` exists for that
 * page's ink budget. Interactive highlighting must not inherit it: a reader who
 * clicks the ninth finding is asking about the ninth finding, and "the figure
 * only had room for eight" is not an answer to that.
 *
 * Always returns an object. Either it locates the finding, or it says WHY it
 * could not — the same three-state honesty the rules themselves keep, so the UI
 * can print the reason instead of rendering a button that does nothing.
 *
 * @param {object} analysis  the /api/dfm result: { results, dfm, geometry }
 * @param {object} finding   one finding row from `results[].findings`
 * @returns {{located: true, xyz: number[], faceIds: number[], note: string}
 *          |{located: false, reason: string}}
 */
export function locateFinding(analysis, finding) {
  if (!finding) return { located: false, reason: 'no finding was given' };
  const placed = locate(finding, analysis ?? {});
  if (placed) {
    return {
      located: true,
      xyz: placed.xyz.map(Number),
      faceIds: Array.isArray(placed.faceIds) ? placed.faceIds : [],
      note: placed.note,
    };
  }
  return { located: false, reason: unlocatableReason(finding) };
}

/**
 * Why a finding has no place on the model — in the reader's words, not the
 * engine's. Three genuinely different situations, and collapsing them into one
 * message ("could not be located") would hide the only one that is a gap rather
 * than a fact about the measurement.
 */
export function unlocatableReason(f) {
  if (WHOLE_PART_MEASURES.has(f?.measure)) {
    return 'measured across the whole part, so there is no single face to mark';
  }
  if (!REGION_SOURCE[f?.measure]) {
    return 'this measure has no geometry source yet — the number is sound, the location is not mapped';
  }
  return 'the geometry engine returned no coordinates for the offending feature';
}

/**
 * Which extra view, if any, is worth a second page.
 *
 * A finding on a face pointing away from the ISO camera is invisible in the ISO
 * render, and drawing its ring on the silhouette anyway would point at geometry
 * the reader cannot see. So the second view is CHOSEN BY MEASUREMENT — the
 * candidate that reveals the most anchors the ISO missed — and when no candidate
 * reveals any, there is no second page. A report that always prints front and
 * top prints two pages that usually restate the first.
 *
 * @param {string[]} missing  anchor ids not visible in the ISO capture
 * @param {Record<string, string[]>} byView  candidate view -> anchor ids visible in it
 * @returns {{ view: string, reveals: string[] } | null}
 */
export function chooseSecondView(missing, byView) {
  const want = new Set(missing || []);
  if (!want.size) return null;
  let best = null;
  for (const [view, visible] of Object.entries(byView || {})) {
    const reveals = (visible || []).filter((id) => want.has(id));
    if (!reveals.length) continue;
    // Ties break on view name so the choice is deterministic — a report that
    // renders a different second view on each run cannot be diffed.
    if (!best || reveals.length > best.reveals.length
      || (reveals.length === best.reveals.length && view < best.view)) {
      best = { view, reveals };
    }
  }
  return best;
}

/**
 * Findings whose evidence is UNDER the surface.
 *
 * A thin wall is invisible from outside. Drawing a ring on the skin above it
 * asks a supplier to take the tool's word for what is underneath — and that is
 * the one finding type where an external view proves nothing at all. Same for a
 * deep bore: the slenderness that matters is the part of it you cannot see.
 *
 * A section is expensive in pages, so this is deliberately SHORT. Everything
 * else is legible from outside and does not earn a cut.
 */
const SECTION_MEASURES = new Set([
  'wallP5Mm', 'maxHoleDepthToDia', 'maxBlindHoleDepthToDia', 'maxThroughHoleDepthToDia',
]);

/** The one finding worth cutting the part open for, or null. */
export function sectionCandidate(annotations = []) {
  return annotations.find((a) => SECTION_MEASURES.has(a.measure)) || null;
}
