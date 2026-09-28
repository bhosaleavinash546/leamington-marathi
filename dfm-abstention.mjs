// ─────────────────────────────────────────────────────────────────────────────
// WHY A RULE PRODUCED NO VERDICT — four different answers, not one sentence.
//
// Every rule that could not be judged used to carry the same line: "no
// measurement available for <measure> on this geometry". Across 22 fixture
// parts x 35 process families that sentence covered four unrelated situations
// (DFM review, 28 Sept 2026), and three of them were not about the geometry:
//
//   needs-input     The rule needs something the engineer declares — the alloy,
//                   a tolerance, a flatness, a surface finish, a machining
//                   stock. The report blamed the part for a missing input, and
//                   the limit functions had already written the true reason
//                   (e.g. "No material was given...") where nothing showed it.
//   outside-source  The input was given, and the published source the rule is
//                   built on does not cover it: SFSA's steel-casting rules on a
//                   grey iron. Not a measurement gap, and not a defect of the
//                   part — a limit of the book, stated as one.
//   not-applicable  The recogniser positively found none of the feature the
//                   rule is about: a boss rule on a part with no bosses, a
//                   bend-to-bend rule on a part with one bend. Counted out of
//                   the coverage denominator, because "we checked 7 of the 7
//                   rules that apply" is the true statement and "7 of 12" was
//                   not.
//   not-measured    A genuine measurement gap: the pass that produces the
//                   number did not run or returned nothing.
//
// NOT-APPLICABLE IS ONLY EVER CLAIMED ON POSITIVE EVIDENCE. The feature
// recogniser must have run (it publishes a `method`) and reported zero of the
// feature. When it did not run, the answer stays not-measured — an absent
// recogniser is not a part with no bosses.
// ─────────────────────────────────────────────────────────────────────────────

/** What each declared input is called on screen, and what it unlocks. */
export const INPUTS = {
  material: { label: 'Material / alloy', field: 'material' },
  tolerance: { label: 'Tightest tolerance', field: 'tightestToleranceMm' },
  flatness: { label: 'Flatness requirement', field: 'flatnessMm' },
  roughness: { label: 'Surface finish', field: 'surfaceRoughnessUin' },
  machiningStock: { label: 'Machining stock', field: 'machiningStockMm' },
};

const TOLERANCE = new Set(['tightestToleranceMm', 'nadca402ToleranceMargin', 'sfsaSandToleranceMargin',
  'sfsaInvToleranceMargin', 'iso8062PmToleranceMargin', 'din16742ToleranceMargin', 'din16742RmToleranceMargin']);
const FLATNESS = new Set(['nadca402FlatnessMargin', 'sfsaSandFlatnessMargin', 'sfsaInvFlatnessMargin']);
const ROUGHNESS = new Set(['nadcaRoughnessMargin']);
const STOCK = new Set(['nadcaMachiningStockToSkinMm', 'sfsaMachiningStockMargin']);

/** Measures whose limit comes from a published source keyed on the alloy. */
function sourceBasis(measure, m) {
  if (measure.startsWith('nadca')) return m._nadcaBasis;
  if (measure.startsWith('sfsa')) return m._sfsaBasis;
  if (measure.startsWith('dupont')) return m._dupontBasis;
  if (measure === 'resinFilletMargin') return m._covestroBasis || m._dupontBasis;
  if (measure === 'din16742ToleranceMargin') return m._din16742Basis;
  if (measure === 'iso8062PmToleranceMargin') return m._iso8062Basis;
  if (['springbackOverbendPct', 'bendRadiusMaxRatio', 'blankUtilisationPct', 'drawStagesBeyondTable'].includes(measure)) {
    return m._bookBasis;
  }
  return undefined;
}

/** Measures read off recognised sheet-metal geometry (bends, the sheet thickness). */
const SHEET_DEPENDENT = new Set(['minBendRadiusToThickness', 'springbackOverbendPct', 'bendRadiusMaxRatio',
  'minFlangeToThickness', 'minBendToBendToThickness', 'holeToBendClearanceMm', 'minHoleToHoleToThickness',
  'minHoleToEdgeToThickness', 'minHoleDiaToThickness', 'minApertureToThickness', 'blankUtilisationPct']);

const FEATURE = {
  hole: ['maxHoleDepthToDia', 'maxBlindHoleDepthToDia', 'maxThroughHoleDepthToDia', 'minHoleDiaMm',
    'maxHoleDiaMm', 'minHoleDiaToThickness', 'coredHoleDraftPerSideDeg', 'minHoleToEdgeToThickness'],
  twoHoles: ['minHoleToHoleToThickness'],
  boss: ['maxBossHeightToDia', 'dupontBossOdToHole', 'nadcaBossDiaToHoleDia', 'sfsaBossDiaToWall'],
  rib: ['maxRibThicknessToWall', 'minRibThicknessToWall', 'maxRibHeightToWall', 'sfsaRibNeutralityMargin'],
  pocket: ['maxPocketDepthToWidth'],
  corner: ['minInternalCornerRadiusMm', 'nadcaFilletToWall', 'resinFilletMargin', 'sfsaJunctionFilletMargin'],
  twoBends: ['minBendToBendToThickness'],
  holeAndBend: ['holeToBendClearanceMm'],
};
const FEATURE_OF = Object.fromEntries(Object.entries(FEATURE).flatMap(([k, ms]) => ms.map(m => [m, k])));

const NONE_TEXT = {
  hole: 'The part has no holes, so there is nothing for this rule to judge.',
  twoHoles: 'The part has fewer than two holes, so there is no gap between holes to judge.',
  boss: 'The part has no bosses, so there is nothing for this rule to judge.',
  rib: 'The part has no ribs, so there is nothing for this rule to judge.',
  pocket: 'The part has no pockets or slots, so there is nothing for this rule to judge.',
  corner: 'The part has no internal corners — neither radiused nor sharp — so there is nothing for this rule to judge.',
  twoBends: 'The part has fewer than two bends, so there is no land between bends to judge.',
  holeAndBend: 'The part has no hole near a bend to judge — it needs both a hole and a bend.',
};

/** What the recogniser positively found, or null where it did not run. */
export function featureCensus(geo = {}, opts = {}) {
  const dfm = geo.dfm || {};
  const features = dfm.features || {};
  const ran = typeof features.method === 'string' && Array.isArray(geo.featureTable);
  if (!ran) return null;
  const table = geo.featureTable;
  const sm = dfm.sheetMetal || {};
  // Round holes appear BOTH in the hole table and as apertures (every inner
  // wire is one), so only the non-circular apertures add to the count — the
  // one-hole bracket read as two holes and "hole to hole" claimed a gap to
  // measure.
  const apertures = Number(dfm.apertures?.nonCircularCount) || 0;
  const holes = table.filter(f => f.kind === 'hole').reduce((n, f) => n + (Number(f.count) || 1), 0);
  const sharp = features.sharpInternalEdges || null;
  const cutter = opts.process === 'machining' || opts.process === 'turning';
  const sharpCount = sharp ? (cutter ? Number(sharp.alongCutterAxis) || 0 : Number(sharp.count) || 0) : null;
  return {
    holes: holes + apertures,
    bosses: table.filter(f => f.kind === 'boss').length,
    ribs: Array.isArray(features.ribs) ? features.ribs.length : 0,
    pockets: (Array.isArray(features.prismatic) ? features.prismatic : [])
      .filter(p => p.kind === 'pocket' || p.kind === 'slot').length,
    // Corners are only "none" when both passes spoke: no radiused corner AND a
    // sharp-edge count of zero. A recogniser too old to count sharp edges
    // cannot say the part has none.
    corners: features.minInternalCornerRadiusMm != null ? 1 : sharpCount === null ? null : sharpCount,
    bends: sm.isSheetMetal && Array.isArray(sm.bends) ? sm.bends.length : null,
  };
}

function featureAbsent(kind, c) {
  if (!c) return false;
  switch (kind) {
    case 'hole': return c.holes === 0;
    case 'twoHoles': return c.holes < 2;
    case 'boss': return c.bosses === 0;
    case 'rib': return c.ribs === 0;
    case 'pocket': return c.pockets === 0;
    case 'corner': return c.corners === 0;
    case 'twoBends': return c.bends !== null && c.bends < 2;
    case 'holeAndBend': return c.bends !== null && (c.bends === 0 || c.holes === 0);
    default: return false;
  }
}

/**
 * Classify one rule that produced no verdict.
 * @returns {{ kind: 'needs-input'|'outside-source'|'not-applicable'|'not-measured', input?: string, reason: string }}
 */
export function classifyAbstention(rule, measures = {}, census = null, opts = {}) {
  const m = rule.measure;
  const hasMaterial = typeof opts.material === 'string' && opts.material.trim() !== '';

  // 1. FEATURE ABSENCE FIRST. A boss rule on a part with no bosses cannot be
  // unlocked by declaring a different alloy or a tolerance — saying "needs
  // input" there would send the engineer to fill in a field that changes
  // nothing.
  const kind = FEATURE_OF[m];
  if (kind && featureAbsent(kind, census)) return { kind: 'not-applicable', reason: NONE_TEXT[kind] };

  // 2. The alloy decides the limit and the source could not supply one.
  const basis = sourceBasis(m, measures);
  if (basis) {
    if (!hasMaterial) return { kind: 'needs-input', input: 'material', reason: `${basis} Declare the material to evaluate this rule.` };
    // A basis that complains about a missing DIMENSION or measurement is a
    // geometry gap, not a scope limit; only an alloy the book does not cover
    // is outside the source.
    if (/not (a|an) |covers|only|not in|not tabulated|no .*(alloy|resin|grade)|is a cast iron|not listed|does not name/i.test(basis)) {
      return { kind: 'outside-source', reason: basis };
    }
  }
  // 3. Inputs the engineer declares.
  if (TOLERANCE.has(m) && measures.tightestToleranceMm === undefined) {
    return { kind: 'needs-input', input: 'tolerance',
      reason: 'No tolerance was declared, and none was read from a drawing or model PMI. Enter the tightest tolerance (or attach the drawing) to evaluate this rule.' };
  }
  if (FLATNESS.has(m) && !(Number(opts.flatnessMm) > 0)) {
    return { kind: 'needs-input', input: 'flatness', reason: 'No flatness requirement was declared. Enter it to evaluate this rule.' };
  }
  if (ROUGHNESS.has(m) && !(Number(opts.surfaceRoughnessUin) > 0)) {
    return { kind: 'needs-input', input: 'roughness', reason: 'No surface-finish requirement was declared. Enter it to evaluate this rule.' };
  }
  if (STOCK.has(m) && !(Number(opts.machiningStockMm) > 0)) {
    return { kind: 'needs-input', input: 'machiningStock', reason: 'No machining stock was declared. Enter the stock left for machining to evaluate this rule.' };
  }
  // 4. A genuine measurement gap, with the source's own reason when it wrote one.
  if (basis) return { kind: 'outside-source', reason: basis };
  if (SHEET_DEPENDENT.has(m) && opts.sheetReason) {
    return { kind: 'not-measured', reason: `No sheet-metal geometry was measured: ${opts.sheetReason}` };
  }
  return { kind: 'not-measured', reason: `The geometry pass did not produce "${m}" for this part.` };
}

/** Group needs-input abstentions into "declare X to evaluate N more rules". */
export function unlocksFrom(notEvaluated = []) {
  const by = {};
  for (const r of notEvaluated) {
    if (r.abstention?.kind !== 'needs-input') continue;
    const k = r.abstention.input;
    (by[k] ||= { input: k, label: INPUTS[k]?.label || k, field: INPUTS[k]?.field || k, ruleIds: [] }).ruleIds.push(r.id);
  }
  return Object.values(by).map(u => ({ ...u, count: u.ruleIds.length })).sort((a, b) => b.count - a.count);
}
