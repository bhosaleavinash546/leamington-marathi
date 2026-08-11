// ─────────────────────────────────────────────────────────────────────────────
// DFM rule evaluator — pure, deterministic, no LLM, no network.
//
// Takes the measured geometry produced by cad-engine (draft, wall-thickness
// percentiles, feature recognition, setups) and the catalogue in
// dfm-rule-catalogue.mjs, and returns findings.
//
// The design decision that matters here is that a rule has THREE outcomes, not
// two: pass, fail, and NOT EVALUATED. A rule whose measurement is missing from
// this part is reported as unevaluated with the reason. Treating it as a pass
// would let a report claim a clean bill of health it never checked — which is
// exactly the failure mode the whole feature exists to avoid. `coveragePct`
// makes the size of that gap impossible to miss.
// ─────────────────────────────────────────────────────────────────────────────
import { DFM_RULES, PROCESS_FAMILIES, SEVERITIES, resolveThreshold } from './dfm-rule-catalogue.mjs';
import {
  draftGroupFor, generalNoteDraft, areaBelowDraftPct, requiredCoredHoleDraftPerSideDeg,
  outsideCornerRadiusMm, FILLET_RATIO, BOSS_DIA_TO_HOLE_DIA, SKIN, asCastRoughnessUin,
  minWallForAlloyMm,
} from './nadca-die-casting.mjs';
import { linearToleranceMm, partingLineToleranceMm, flatnessToleranceMm } from './nadca-402.mjs';
import {
  castSteelGroupFor, minSectionMm, junctionFilletMm, ribNeutralHeightLimit,
  BOSS, minCoreDiaMm,
} from './sfsa-steel-casting.mjs';
import {
  ctToleranceMm, ctTightestPromiseMm, ctGradeFor, ctgFlatnessMm, CTG_SELECTION,
  rmaMm, RMA_GRADE_SELECTION, capabilityModelMm, WEIGHT_TOLERANCE,
} from './sfsa-supplement-3.mjs';
import {
  resinGroupFor, requiredDraftDeg as dupontRequiredDraftDeg,
  filletRequirementMm as dupontFilletRequirementMm,
  BOSS_OD_TO_HOLE, BLIND_CORE,
} from './dupont-polymers.mjs';
import {
  covestroResinFor, requiredDraftDeg as covestroRequiredDraftDeg,
  filletRequirementMm as covestroFilletRequirementMm,
} from './covestro-polymers.mjs';
import {
  isoMetalGroupFor, isoGradeFor, sToleranceMm, sTightestPromiseMm,
  isoDraftDeg,
} from './iso-8062-4.mjs';
import {
  dinTgFor, tgToleranceMm, tgTightestPromiseMm, dinProfileToleranceMm,
  ROTOMOULDING_TG, ROTOMOULDING_BASIS,
} from './din-16742.mjs';

/**
 * The worst (smallest-ratio) coaxial boss/hole pair in a feature table.
 *
 * Shared by the NADCA boss rule (§3.2 p.51: boss >= 2x the bolt hole) and
 * the DuPont boss rule (p.8: boss OD 2-2.5x the hole) — one piece of
 * geometry, two standards reading it. A boss with no coaxial hole is not a
 * fastener boss and is not judged.
 */
/**
 * Where the pmi dimension rows CAME FROM — the model's own AP242 data, or a
 * 2D drawing read by AI vision. One label, read by every tolerance judge, so
 * six provenance stamps can never disagree about one block of evidence.
 * `prefix` is prepended to each worst-row basis when the source is a drawing;
 * for real PMI it is empty and every existing basis string stays byte-identical.
 */
function pmiSource(geo) {
  const pmi = geo?.dfm?.pmi || {};
  if (pmi.source === 'drawing') {
    const note = pmi.sourceNote
      || 'read from the uploaded 2D drawing by AI vision — judged deterministically; not verified against a 3D model';
    return { from: 'drawing', prefix: `The dimensions were ${note}. ` };
  }
  return { from: 'PMI', prefix: '' };
}

function worstCoaxialBossPair(table) {
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const holes = table.filter((f) => f.kind === 'hole' && num(f.diaMm) > 0);
  let worst = null;
  for (const boss of table.filter((f) => f.kind === 'boss' && num(f.diaMm) > 0)) {
    const bAxis = boss.axisXYZ; const bPt = boss.axisPointXYZ;
    if (!Array.isArray(bAxis) || !Array.isArray(bPt)) continue;
    for (const h of holes) {
      const hAxis = h.axisXYZ; const hPt = h.axisPointXYZ;
      if (!Array.isArray(hAxis) || !Array.isArray(hPt)) continue;
      const parallel = Math.abs(bAxis[0] * hAxis[0] + bAxis[1] * hAxis[1] + bAxis[2] * hAxis[2]) > 0.999;
      if (!parallel) continue;
      // Coaxial when the two axis points differ only ALONG the shared axis.
      const d = [hPt[0] - bPt[0], hPt[1] - bPt[1], hPt[2] - bPt[2]];
      const along = d[0] * bAxis[0] + d[1] * bAxis[1] + d[2] * bAxis[2];
      const perp = Math.hypot(d[0] - along * bAxis[0], d[1] - along * bAxis[1], d[2] - along * bAxis[2]);
      if (perp > 0.5) continue;
      if (num(h.diaMm) >= num(boss.diaMm)) continue;      // not a hole IN this boss
      const ratio = num(boss.diaMm) / num(h.diaMm);
      if (!worst || ratio < worst.ratio) {
        worst = { ratio, bossDiaMm: num(boss.diaMm), holeDiaMm: num(h.diaMm), atXYZ: bPt };
      }
    }
  }
  return worst;
}
import { MATERIALS } from './costing-engine.mjs';
import {
  minBendRadiusMm, maxBendRadiusMm, springback, minPunchedHoleMm,
  blankingForceKN, bendingForceKN, pressClass, drawStages, stripLayout,
  bendAllowanceMm, sheetPropertiesFor,
} from './sheet-metal-forming.mjs';

/**
 * Pull the values rules are written against out of a measured-geometry blob.
 * Every entry returns `undefined` when the underlying measurement is absent —
 * that `undefined` is what becomes "not evaluated" downstream, so no measure may
 * ever substitute a default. A guessed default here would be indistinguishable
 * from a real measurement in the report.
 */
/**
 * The sheet-forming limits from Boljanovic, expressed as MARGINS.
 *
 * Each entry is `measured / required`, so a rule can be written against a flat
 * 1.0 while the requirement itself moves with the alloy, the temper and the
 * gauge. Everything is absent rather than zero when it cannot be computed — a
 * part whose material has no properties on file must abstain, not score 0 and
 * fail every bend rule in the catalogue.
 *
 * The underscored entries are for the REPORT, not for rules: a press tonnage
 * and a strip utilisation are figures a reader wants even when no threshold
 * applies to them.
 */
function bookLimits(sm, geo, opts) {
  // Its own `num`, not the one inside extractMeasures: that one is a closure and
  // borrowing it from here would have thrown at call time on every sheet part
  // while the module still imported cleanly.
  const num = (v) => {
    if (v === null || v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const out = {};
  const T = Number(sm.thicknessMm);
  const material = opts.material;
  const props = sheetPropertiesFor(material);
  if (!(T > 0)) return out;

  // Why every book rule below abstains, said once, so each finding can carry it.
  if (!props.known) { out._bookBasis = props.reason; return out; }

  const bends = Array.isArray(sm.bends) ? sm.bends : [];
  const radii = bends.map((b) => Number(b.insideRadiusMm)).filter((r) => Number.isFinite(r) && r >= 0);

  // ── Bend radius, Table 5.2 ───────────────────────────────────────────────
  const need = minBendRadiusMm(material, T, opts.temper);
  if (need.ok && radii.length) {
    const tightest = Math.min(...radii);
    // A required radius of ZERO (annealed pure aluminium) makes the ratio
    // meaningless — everything divided by nothing is infinite. The rule cannot
    // fail in that case and says so rather than producing Infinity.
    out.bendRadiusMarginRatio = need.minRadiusMm > 0
      ? Math.round((tightest / need.minRadiusMm) * 1000) / 1000
      : undefined;
    out._bendLimit = {
      tightestMeasuredMm: Math.round(tightest * 1000) / 1000,
      requiredMinMm: need.minRadiusMm,
      bandMm: need.bandMm,
      temper: need.temper,
      basis: need.basis,
    };
  }

  const max = maxBendRadiusMm(material, T);
  if (max.ok && radii.length) {
    const gentlest = Math.max(...radii);
    out.bendRadiusMaxRatio = Math.round((gentlest / max.maxRadiusMm) * 1000) / 1000;
    out._bendMaxLimit = { gentlestMeasuredMm: Math.round(gentlest * 1000) / 1000, maxAllowedMm: max.maxRadiusMm, basis: max.basis };
  }

  // ── Springback, Eq. 5.22 ─────────────────────────────────────────────────
  // The WORST bend on the part: the one that needs the most overbend is the one
  // that decides whether overbend alone will do.
  let worst = null;
  for (const b of bends) {
    const s = springback(material, Number(b.insideRadiusMm), T, Number(b.angleDeg));
    if (s.ok && Number.isFinite(s.overbendPct) && (!worst || s.overbendPct > worst.overbendPct)) {
      worst = { ...s, insideRadiusMm: Number(b.insideRadiusMm), angleDeg: Number(b.angleDeg) };
    }
  }
  if (worst) {
    out.springbackOverbendPct = worst.overbendPct;
    out._springback = worst;
  }

  // ── Bend allowance, Table 5.3 / Eq. 5.19 ─────────────────────────────────
  const allowances = bends
    .map((b) => bendAllowanceMm(Number(b.insideRadiusMm), T, Number(b.angleDeg)))
    .filter((v) => Number.isFinite(v));
  if (allowances.length) {
    out._bendAllowance = {
      perBendMm: allowances.map((v) => Math.round(v * 100) / 100),
      totalMm: Math.round(allowances.reduce((a, b) => a + b, 0) * 100) / 100,
      basis: 'Eq. 5.19 with the Table 5.3 neutral-axis shift, per recognised bend',
    };
  }

  // ── Smallest punchable hole, Sec. 9.3.3 ──────────────────────────────────
  const punch = minPunchedHoleMm(material, T);
  const smallest = num(sm.minHoleDiaMm) ?? num((geo.dfm || {}).apertures?.smallestApertureMm);
  if (punch.ok && smallest > 0) {
    out.punchedHoleMarginRatio = Math.round((smallest / punch.minDiaMm) * 1000) / 1000;
    out._punchLimit = { smallestMeasuredMm: smallest, requiredMinMm: punch.minDiaMm, basis: punch.basis };
  }

  // ── Strip layout and utilisation, Sec. 4.4 ───────────────────────────────
  // The flat envelope: the two LARGEST bounding-box axes, because the third is
  // the formed depth and a blank is laid out flat.
  const bb = (geo.geometry || {}).boundingBox || geo.boundingBox;
  if (bb) {
    const dims = [Number(bb.xMm), Number(bb.yMm), Number(bb.zMm)].filter((v) => v > 0).sort((a, b) => b - a);
    if (dims.length >= 2) {
      const strip = stripLayout(dims[1], dims[0], T);
      if (strip.ok) {
        out.blankUtilisationPct = strip.utilisationPct;
        out._stripLayout = { ...strip, envelopeMm: [dims[0], dims[1]] };
      }
    }
  }

  // ── Press force, Eq. 4.3/4.4 and 5.7 ─────────────────────────────────────
  // Internal cut length is exact; the OUTER profile is not measured by the
  // recogniser, so the blanking perimeter is taken as the flat envelope's
  // perimeter and the whole figure is published as a LOWER bound. A tonnage
  // that silently omits the blanking cut would send somebody to the wrong press.
  const cut = num((geo.dfm || {}).apertures?.totalCutLengthMm) ?? 0;
  const outer = out._stripLayout ? 2 * (out._stripLayout.envelopeMm[0] + out._stripLayout.envelopeMm[1]) : 0;
  if (cut + outer > 0) {
    const bf = blankingForceKN(material, T, cut + outer);
    if (bf.ok) {
      const bendF = bends.reduce((sum, b) => {
        const f = bendingForceKN(material, T, Number(b.bendLengthMm), Number(b.insideRadiusMm));
        return sum + (f.ok ? f.forceKN : 0);
      }, 0);
      const total = bf.pressForceKN + bendF;
      out._press = {
        blankingKN: bf.forceKN,
        withMarginKN: bf.pressForceKN,
        bendingKN: Math.round(bendF * 10) / 10,
        totalKN: Math.round(total * 10) / 10,
        ...pressClass(total),
        cutLengthMm: Math.round(cut + outer),
        basis: `${bf.basis}. Outer profile taken as the flat envelope perimeter — the recogniser measures internal cut length only, so this is a LOWER bound.`,
      };
    }
  }

  // ── Draw stages, Table 6.2 ───────────────────────────────────────────────
  // Blank diameter by AREA EQUIVALENCE: a drawn shell's blank has the same
  // surface as the developed shell, and for a thin shell the mid-surface is
  // half the total. Stated as an estimate, because the book's own analytic
  // method (Sec. 6.4.2, Guldinus) needs the meridian profile we do not extract.
  //
  // THE CUP DIAMETER comes from the footprint, with a ROUNDNESS TEST. Table 6.2
  // is written for "a cylindrical cup without flange", so a rectangular pan is
  // outside it and must abstain rather than be handed a diameter that does not
  // describe it. The first version of this reached for a
  // `circumscribingCircleMm` that lives in none of the three places it looked —
  // so the rule abstained on all ten corpus cups while reporting nothing wrong,
  // which is precisely the failure mode this project treats as worse than a
  // missing rule.
  const areaCm2 = Number((geo.geometry || {}).surfaceArea?.cm2 ?? geo.surfaceArea?.cm2);
  const bbc = (geo.geometry || {}).boundingBox || geo.boundingBox || {};
  const plan = [Number(bbc.xMm), Number(bbc.yMm), Number(bbc.zMm)]
    .filter((v) => v > 0).sort((a, b) => b - a).slice(0, 2);
  const round = plan.length === 2 && Math.abs(plan[0] - plan[1]) / plan[0] <= 0.05;
  const cupDia = round ? plan[0] : undefined;
  if (areaCm2 > 0 && cupDia > 0) {
    const blankDia = Math.sqrt((2 * areaCm2 * 100) / Math.PI);
    const d = drawStages(blankDia, cupDia, T);
    if (d.ok) {
      out.drawStagesBeyondTable = d.beyondTable ? 1 : 0;
      out._drawStages = { ...d, blankDiaMm: Math.round(blankDia * 10) / 10, cupDiaMm: cupDia, blankBasis: 'area equivalence: D = sqrt(2*A_total/pi), an ESTIMATE — the book\'s analytic method needs the meridian profile' };
    }
  }
  return out;
}

export function extractMeasures(geo = {}, opts = {}) {
  const dfm = geo.dfm || {};
  const wall = dfm.wallThickness || geo.wallThickness || {};
  const draft = dfm.draft || geo.draftAnalysis || {};
  const features = dfm.features || {};
  const setups = dfm.setups || geo.setupAnalysis || {};
  // Sheet-metal measures come from real bend recognition (paired coaxial
  // cylinders) — and, when there is no bend to recognise, from the ray-cast wall.
  //
  // THE GATE USED TO BE `isSheetMetal`, AND IT BLACKED OUT THE COMMONEST
  // AUTOMOTIVE COMMODITY. Measured over ten stamped brackets: the engine read
  // the wall at 1.60 mm and the holes at Ø8 — everything four of the nine sheet
  // rules need — and abstained on all nine, scoring `null`, because it could not
  // find a bend radius. A concept model drawn with sharp corners, or a STEP
  // export that dropped them, produced a completely blank sheet-metal report.
  //
  // The recogniser now returns the thickness-derived subset with its PROVENANCE,
  // and the bend-dependent keys are simply absent from that object — so those
  // rules still abstain without a special case here. `isSheetMetal` is untouched
  // and still means "a bend was measured"; it is not a licence to run rules.
  const smRaw = dfm.sheetMetal || {};
  const sm = (smRaw.isSheetMetal || smRaw.thicknessMm > 0) ? smRaw : {};
  // NULL IS NOT ZERO. `Number(null)` is 0 and passes `Number.isFinite`, so a
  // measurement the recogniser explicitly reported as absent arrived at the rule
  // engine as a hard zero — and a zero fails every "must be at least" rule. A
  // bracket with ONE hole failed "holes too close together" at a measured gap of
  // 0 mm, and the same trap sat under minFlangeToThickness and every other
  // measure the recogniser returns as null when it has nothing to report. An
  // absent measurement must reach the rules as undefined so the rule ABSTAINS,
  // which is the whole three-state discipline this file is built on.
  const num = (v) => {
    if (v === null || v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  // Rib proportions are RATIOS against the nominal wall, and the wall is the
  // measured p50 — so the ratio is computed here, at the one place both numbers
  // exist, rather than in the recogniser which has never seen a wall thickness.
  // When either half is missing the ratio stays undefined and the rib rules
  // abstain, which is the correct answer for a part whose wall could not be
  // measured. A rib thickness divided by a guessed wall would look exactly like
  // a measurement in the report.
  // The analytic cylinder pass, which reports diameter and depth exactly from
  // the kernel. Worst case across the part, so one bad hole is not averaged away
  // by twenty good ones.
  const table = Array.isArray(geo.featureTable) ? geo.featureTable : [];
  // WHICH feature, not just the worst number. A finding that says "max hole
  // depth/diameter is 8.2" sends a supplier hunting through the model; a finding
  // that says "Ø6 x 49, four of them, first at (12, -30, 4)" is a review
  // document. The rows already carry diameter, depth, count and per-instance
  // positions, so the offenders are collected here alongside the ratio rather
  // than being thrown away and re-derived nowhere.
  const instancesOf = (kind, overKey, byKey) => table
    .filter(f => f.kind === kind)
    .map(f => ({
      ratio: Math.round((Number(f[overKey]) / Number(f[byKey])) * 100) / 100,
      diaMm: f.diaMm, depthMm: f.depthMm, through: f.through, count: f.count,
      atXYZ: f.axisPointXYZ ?? null,
      instancesXYZ: Array.isArray(f.instancesXYZ) ? f.instancesXYZ.slice(0, 8) : null,
    }))
    .filter(r => Number.isFinite(r.ratio) && r.ratio > 0)
    .sort((a, b) => b.ratio - a.ratio);

  const ratioOverTable = (kind, overKey, byKey) => {
    const vals = instancesOf(kind, overKey, byKey).map(r => r.ratio);
    return vals.length ? Math.max(...vals) : undefined;
  };

  // ── AS-CAST FEATURE SIZE, in millimetres rather than as a ratio ────────────
  //
  // Every casting family had a core SLENDERNESS rule (how deep a pin can go) and
  // not one had a core DIAMETER rule (how thin a pin can be at all). They are
  // different failure modes: a slender pin deflects and the hole goes off
  // position; a pin below the family's floor snaps or cannot be made. A Ø2 hole
  // in a permanent-mould part is not cast at all — it is drilled afterwards, and
  // the report should say so before the tool is cut.
  //
  // The value carried is the DIAMETER, not a ratio. The `ratio` key is the
  // evaluator's generic value slot; the finding's own `unit` says what it means,
  // and the report prints that unit rather than assuming every instance is
  // dimensionless.
  const sizeInstances = (kind, key, ascending = true) => table
    .filter(f => f.kind === kind)
    .map(f => ({
      ratio: Number(f[key]),
      diaMm: f.diaMm, depthMm: f.depthMm, through: f.through, count: f.count,
      atXYZ: f.axisPointXYZ ?? null,
      instancesXYZ: Array.isArray(f.instancesXYZ) ? f.instancesXYZ.slice(0, 8) : null,
    }))
    .filter(r => Number.isFinite(r.ratio) && r.ratio > 0)
    .sort((a, b) => (ascending ? a.ratio - b.ratio : b.ratio - a.ratio));

  const smallestOf = (kind, key) => {
    const vals = sizeInstances(kind, key).map(r => r.ratio);
    return vals.length ? Math.round(Math.min(...vals) * 100) / 100 : undefined;
  };

  // A BLIND hole and a THROUGH hole of the same slenderness are not the same
  // risk — a through core pin can be supported at both ends, a blind one is a
  // cantilever. Investment casting writes the two limits separately (blind < 2,
  // through < 5) and a single combined figure cannot express either. The kernel
  // already classifies through vs blind with a solid classifier, so the split is
  // free; what it is not is optional, because the combined measure silently
  // judged a supported through core by the cantilever limit.
  const depthRatioWhere = (pred) => {
    const vals = table
      .filter(f => f.kind === 'hole' && pred(f))
      .map(f => Number(f.depthMm) / Number(f.diaMm))
      .filter(v => Number.isFinite(v) && v > 0);
    return vals.length ? Math.round(Math.max(...vals) * 100) / 100 : undefined;
  };

  const wall5 = () => wall.p5Mm;
  const ribs = Array.isArray(features.ribs) ? features.ribs : [];
  const nominalWall = num(wall.p50Mm);
  const ribInstances = (key, ascending = false) => {
    if (!ribs.length || !(nominalWall > 0)) return [];
    return ribs
      .map(r => ({
        ratio: Math.round((Number(r[key]) / nominalWall) * 1000) / 1000,
        thicknessMm: r.thicknessMm, heightMm: r.heightMm, lengthMm: r.lengthMm,
        atXYZ: r.centroidXYZ ?? null,
      }))
      .filter(r => Number.isFinite(r.ratio) && r.ratio > 0)
      .sort((a, b) => (ascending ? a.ratio - b.ratio : b.ratio - a.ratio));
  };

  const ribRatio = (pick, key) => {
    if (!ribs.length || !(nominalWall > 0)) return undefined;
    const vals = ribs.map(r => Number(r[key])).filter(v => Number.isFinite(v) && v > 0);
    if (!vals.length) return undefined;
    return Math.round((pick(...vals) / nominalWall) * 1000) / 1000;
  };

  // Only measures a RULE is written against belong here. `pocketCount` and
  // `slotCount` used to be computed for the reader's benefit and were read by
  // nothing — the UI and both reports take their counts from the recogniser
  // directly. A measure that no rule consumes is a value nobody validates.
  return {
    wallP5Mm: num(wall.p5Mm),
    wallP50Mm: num(wall.p50Mm),
    wallP95Mm: num(wall.p95Mm),
    wallSpreadRatio: num(wall.spreadRatio),
    wallAreaBelowMinDraftPct: num(draft.wallAreaBelowMinDraftPct),
    // Tool reach, from the shank-clearance sweep. Absent when the time budget
    // spent before it ran, which is a "not evaluated", not a clean sheet.
    unreachableAreaPct: num((dfm.toolAccess || {}).unreachableAreaPct),
    // The tightest TOTAL tolerance band called out on the part, from the STEP's
    // own semantic PMI. Absent on any file without AP242 PMI — which is most of
    // them — so every tolerance rule abstains rather than passing a part whose
    // tolerances are on a drawing this tool has never seen.
    // ── THE TIGHTEST BAND ON THE PART ────────────────────────────────────
    //
    // Read from the STEP's own AP242 semantic PMI when it is there. It almost
    // never is: over a 93-part sweep this measure abstained 93 TIMES — every
    // tolerance-capability rule in the catalogue, one per family, had never
    // fired on a single part. Fourteen rules that cannot ever speak are not a
    // conservative tool, they are a hole in it.
    //
    // So the engineer may DECLARE it. They know the number; it is on the
    // drawing in front of them. What must never happen is the two being
    // confused, so the basis travels with the value and the report prints it:
    // a figure read from the model and a figure typed by a person are not the
    // same kind of evidence, and PMI always wins when both exist.
    tightestToleranceMm: num((dfm.pmi || {}).tightestToleranceMm) ?? num(opts.declaredToleranceMm),
    // Three evidence states, never confused: measured from the model's own
    // AP242 PMI, read off an uploaded 2D drawing by AI vision, or typed by
    // the engineer. The report prints whichever one it was.
    _toleranceBasis: num((dfm.pmi || {}).tightestToleranceMm) != null
      ? ((dfm.pmi || {}).source === 'drawing'
        ? ((dfm.pmi || {}).sourceNote
          || 'read from the uploaded 2D drawing by AI vision — judged deterministically; not verified against a 3D model')
        : 'read from the model\'s AP242 semantic PMI')
      : num(opts.declaredToleranceMm) != null
        ? 'DECLARED by the engineer — not read from the model, and not verified against it'
        : undefined,
    // APERTURES, read from the topology rather than the wall geometry. The
    // cylinder pass finds round holes exactly and is blind to everything else,
    // and on a stamped bracket that blindness reported zero holes on a part
    // with twenty-six cut-outs. As a ratio of the sheet, because that is how
    // the punch-strength guideline is written.
    minApertureToThickness: (() => {
      const a = dfm.apertures || {};
      const t = num(sm.thicknessMm);
      const min = num(a.smallestApertureMm);
      return t > 0 && min > 0 ? Math.round((min / t) * 100) / 100 : undefined;
    })(),
    apertureCount: num((dfm.apertures || {}).count),
    // SHAPE, not size. Centrifugal casting spins the mould, so the part must be
    // a body of revolution before any dimension matters. Absent when the kernel
    // could not measure it — never defaulted, because 0 would fail every part
    // and 100 would pass every part.
    axisymmetricAreaPct: num((dfm.revolution || {}).axisymmetricAreaPct),
    // How much of the surface faces DOWN at all, against the build direction.
    // The curve below is what the rules actually read; this is the headline.
    downFacingAreaPct: num((dfm.overhang || {}).downFacingAreaPct),
    shallowestOverhangDeg: num((dfm.overhang || {}).shallowestOverhangDeg),

    // ── HOW DEEP THE DRAW IS, as a proxy for the draw ratio ──────────────────
    //
    // The real deep-drawing limit is the LIMITING DRAW RATIO — blank diameter
    // over punch diameter — and neither of those exists in a finished solid: the
    // blank is not in the model and the punch is not either. What IS in the
    // model is how deep the cup is against how wide it is, which is the ratio
    // every design guide quotes alongside the LDR (0.5-0.75 in one operation,
    // approaching 1.0 in a very ductile alloy).
    //
    // It is a PROXY and the rule says so. It is also only honest when the draw
    // direction is an axis of the bounding box: measured along a skewed axis the
    // box extents stop describing the cup, so the measure ABSTAINS rather than
    // returning a number computed against the wrong span.
    drawDepthToWidth: (() => {
      const bb = geo.boundingBox || {};
      const ext = [num(bb.xMm), num(bb.yMm), num(bb.zMm)];
      if (ext.some(v => !(v > 0))) return undefined;
      const dir = draft.drawDirectionXYZ;
      if (!Array.isArray(dir) || dir.length !== 3) return undefined;
      const mag = Math.hypot(...dir.map(Number));
      if (!(mag > 0)) return undefined;
      const unit = dir.map(v => Number(v) / mag);
      let axis = -1;
      for (let i = 0; i < 3; i++) if (Math.abs(unit[i]) > 0.999) axis = i;
      if (axis < 0) return undefined;             // skewed draw — the box no longer describes the cup
      const depth = ext[axis];
      const width = Math.min(...ext.filter((_, i) => i !== axis));
      return width > 0 ? Math.round((depth / width) * 100) / 100 : undefined;
    })(),
    internalCutLengthMm: num((dfm.apertures || {}).totalCutLengthMm),
    pmiDimensionCount: num((dfm.pmi || {}).dimensionCount),
    pmiGeomToleranceCount: num((dfm.pmi || {}).geometricToleranceCount),
    reachableAreaPct: num((dfm.toolAccess || {}).reachableAreaPct),
    minWallDraftDeg: num(draft.minWallDraftDeg),
    undercutFaceCount: num(draft.undercutFaceCount),
    setupCount: num(setups.estimatedSetupCount),

    // ── Slenderness, from the analytic cylinder pass ──
    // A hole is a drill on a machined part and a CORE PIN on a cast one, so the
    // same measured depth/diameter answers two different questions and each
    // family sets its own limit against it.
    maxHoleDepthToDia: ratioOverTable('hole', 'depthMm', 'diaMm'),
    maxBossHeightToDia: ratioOverTable('boss', 'depthMm', 'diaMm'),
    // Blind and through split out, because a cantilevered core pin and a
    // double-supported one fail at different slendernesses.
    maxBlindHoleDepthToDia: depthRatioWhere(f => f.through === false),
    maxThroughHoleDepthToDia: depthRatioWhere(f => f.through === true),

    // ── As-cast feature SIZE, in mm ──
    // The smallest bore and the smallest boss on the part. Every casting family
    // has a floor below which the feature is not cast at all, and until now the
    // catalogue could not ask about it.
    minHoleDiaMm: smallestOf('hole', 'diaMm'),
    minBossDiaMm: smallestOf('boss', 'diaMm'),
    // The LARGEST bore too, because some processes have a ceiling as well as a
    // floor: broaching runs 10-100 mm and a gun drill 1-30, above which the job
    // moves to BTA. A rule that can only warn about small features cannot route
    // a large one.
    maxHoleDiaMm: (() => {
      const vals = sizeInstances('hole', 'diaMm').map(r => r.ratio);
      return vals.length ? Math.round(Math.max(...vals) * 100) / 100 : undefined;
    })(),
    // HOW MANY blind features there are, not how deep the worst one is. Wire
    // EDM threads a wire through the part and broaching pulls a tool straight
    // through it: neither can make a blind feature AT ALL, and "the worst blind
    // hole is 2.5 L/D" cannot express "there is one".
    blindHoleCount: (() => {
      const n = table.filter(f => f.kind === 'hole' && f.through === false)
        .reduce((a, f) => a + (Number(f.count) || 1), 0);
      // Absent, not zero, when the through/blind flag was never resolved — a
      // hard 0 would clear the wire-EDM and broaching rules on a part whose
      // holes were never classified.
      return table.some(f => f.kind === 'hole' && typeof f.through === 'boolean') ? n : undefined;
    })(),

    // ── CIRCUMSCRIBING CIRCLE, the number that sizes an extrusion press ──
    //
    // The smallest circle that encloses the PROFILE — the section perpendicular
    // to the extrusion axis, which on a profile is the longest box extent. It
    // decides which press the job can run on and therefore whether it can be
    // quoted at all, and no measure in the engine expressed it.
    circumscribingCircleMm: (() => {
      const bb = geo.boundingBox || {};
      const ext = [num(bb.xMm), num(bb.yMm), num(bb.zMm)];
      if (ext.some(v => !(v > 0))) return undefined;
      const sorted = [...ext].sort((a, b) => a - b);      // section = the two smaller
      return Math.round(Math.hypot(sorted[0], sorted[1]) * 10) / 10;
    })(),

    // ── HOW MUCH METAL THE PART IS ──────────────────────────────────────────
    //
    // The envelope alone was not enough. A 133 mm die-cast bracket sits under a
    // 150 mm cold-heading gate and still cannot be headed, because a header
    // works from a slug cut off wire: the largest production machines run about
    // 25 mm stock, so the biggest slug they can cut is tens of cubic
    // centimetres. Volume is what actually bounds the process, and it bounds
    // MIM the same way through sintering mass.
    partVolumeCm3: num((geo.geometry || {}).volume?.cm3 ?? geo.volume?.cm3),

    // ── THE PART'S LARGEST DIMENSION ────────────────────────────────────────
    //
    // Trivial to compute and it was missing, which is why nothing stopped the
    // route table offering cold heading — a wire-slug process — for a 133 mm
    // die-cast bracket and then RECOMMENDING it as the cheapest quotation to
    // ask for. Some processes are ruled out by size before any other question
    // about the geometry is worth asking.
    maxEnvelopeMm: (() => {
      const bb = geo.boundingBox || {};
      const ext = [num(bb.xMm), num(bb.yMm), num(bb.zMm)];
      if (ext.some(v => !(v > 0))) return undefined;
      return Math.round(Math.max(...ext) * 10) / 10;
    })(),

    // ── PRESS DEPTH over wall, the density-gradient number for powder metal ──
    //
    // Powder does not flow. It is compacted along ONE axis and the density falls
    // away from the punch, so what matters is how DEEP the powder column is
    // against the wall it has to fill — not how long the part is. Taking the
    // largest box extent instead would false-alarm on every flat part, which is
    // most of them: a 200 mm long, 5 mm thick plate is pressed through 5 mm of
    // powder, not 200.
    //
    // The press axis is the direction the part's own features are approached
    // from — the same measurement the setup count is built on. With no features
    // there is no press axis to infer and the measure ABSTAINS.
    pressDepthToWallRatio: (() => {
      const dir = (setups.accessDirections || [])[0]?.directionXYZ;
      const bb = geo.boundingBox || {};
      const ext = [num(bb.xMm), num(bb.yMm), num(bb.zMm)];
      const wall = num(wall5());
      if (!Array.isArray(dir) || ext.some(v => !(v > 0)) || !(wall > 0)) return undefined;
      let k = -1;
      for (let i = 0; i < 3; i++) if (Math.abs(Number(dir[i])) > 0.999) k = i;
      if (k < 0) return undefined;
      return Math.round((ext[k] / wall) * 100) / 100;
    })(),

    // ── SLENDERNESS of a turned part, along its own axis of revolution ──
    // A shaft is held in a chuck at one end. Past about three diameters
    // unsupported it whips; a tailstock takes it further and a steady rest
    // further still. The axis comes from the revolution measure written for
    // centrifugal casting, so this abstains on a part with no clear axis rather
    // than measuring the longest box side of a bracket and calling it a shaft.
    slendernessLtoD: (() => {
      const rev = dfm.revolution || {};
      const axis = rev.axisXYZ;
      const bb = geo.boundingBox || {};
      const ext = [num(bb.xMm), num(bb.yMm), num(bb.zMm)];
      if (!Array.isArray(axis) || ext.some(v => !(v > 0))) return undefined;
      // Only meaningful on a part that IS a body of revolution, and the bar is
      // the SAME 90% the catalogue's two body-of-revolution rules use. A first
      // draft gated at 60% and the benchmark caught it immediately: a flat
      // 60x40x10 plate scores 69.7% axisymmetric — its two large faces are
      // perpendicular to Z and count toward the figure — so the measure took the
      // 10 mm thickness over the 60 mm width and reported a 0.17 L/D shaft.
      // Three uses of the same geometric judgement must share one threshold.
      if (!(num(rev.axisymmetricAreaPct) >= 90)) return undefined;
      let k = -1;
      for (let i = 0; i < 3; i++) if (Math.abs(Number(axis[i])) > 0.999) k = i;
      if (k < 0) return undefined;
      const dia = Math.max(...ext.filter((_, i) => i !== k));
      return dia > 0 ? Math.round((ext[k] / dia) * 100) / 100 : undefined;
    })(),

    // ── Ribs, as proportions of the nominal wall ──
    maxRibThicknessToWall: ribRatio(Math.max, 'thicknessMm'),
    minRibThicknessToWall: ribRatio(Math.min, 'thicknessMm'),
    maxRibHeightToWall: ribRatio(Math.max, 'heightMm'),

    // ── Sheet metal, measured from recognised bends ──
    sheetThicknessMm: num(sm.thicknessMm),
    // Whether that thickness was measured between two bend radii or derived
    // from the wall. The report prints it beside every sheet finding — a
    // derived thickness is exact on a uniform sheet and wrong on anything else.
    _sheetThicknessBasis: smRaw.thicknessBasis ?? (smRaw.isSheetMetal ? 'measured between the inner and outer bend radius' : undefined),
    bendCount: num(sm.bendCount),
    minBendRadiusToThickness: num(sm.minBendRadiusToThickness),
    minHoleDiaToThickness: num(sm.minHoleDiaToThickness),
    minFlangeToThickness: num(sm.minFlangeToThickness),
    // Reported as CLEARANCE against the 2t+r guideline so the rule is
    // arithmetic. A raw distance would need a per-part formula the evaluator
    // cannot express, and the rule would abstain forever.
    holeToBendClearanceMm: num(sm.holeToBendClearanceMm),
    // As RATIOS of the measured sheet thickness, because that is how every
    // sheet-metal guideline is written and it makes the rule a flat number
    // instead of a per-part formula the evaluator cannot express.
    minHoleToHoleToThickness: num(sm.minHoleToHoleToThickness),
    minHoleToEdgeToThickness: num(sm.minHoleToEdgeToThickness),

    // ── THE BOOK'S PHYSICS, AS RATIOS ────────────────────────────────────────
    //
    // Boljanovic's limits are functions of the material AND the thickness —
    // `R_min = c*T` with c from 0.0 to 6.0 by alloy and temper, `d_min/T =
    // 2.8*UTS/sigma_pd` by sheet strength. A static per-family threshold cannot
    // express that, and the old rules pretended otherwise with a flat 1.0 r/t
    // and 1.0 d/t.
    //
    // So the ENGINE computes the requirement from the book and the MEASURE is
    // the margin against it: at or above 1.0 the part clears its own material's
    // limit. The rule's threshold stays a clean 1.0 and the finding carries the
    // real numbers in `measuredBasis`, which is where a reader can check the
    // arithmetic.
    ...bookLimits(sm, geo, opts),
    minBendToBendToThickness: num(sm.minBendToBendToThickness),

    // The offenders behind the ratio measures, in worst-first order. Consumed by
    // runDfmRules to attach `instances` to a finding; stripped from the measure
    // map itself so a rule can never accidentally be written against a list.
    // Absent, not empty, when there is nothing to list — the same discipline
    // every measure above follows. An empty object here would still read as
    // "measured, and the answer was nothing".
    _instances: nonEmpty({
      maxHoleDepthToDia: instancesOf('hole', 'depthMm', 'diaMm'),
      maxBossHeightToDia: instancesOf('boss', 'depthMm', 'diaMm'),
      maxRibThicknessToWall: ribInstances('thicknessMm'),
      minRibThicknessToWall: ribInstances('thicknessMm', true),
      maxRibHeightToWall: ribInstances('heightMm'),
      // Smallest first: the offenders under a minimum-size rule are the SMALL
      // features, so the same worst-first promise needs the opposite sort.
      minHoleDiaMm: sizeInstances('hole', 'diaMm'),
      minBossDiaMm: sizeInstances('boss', 'diaMm'),
    }),

    // THE DRAFT CURVE, not one point on it. `wallAreaBelowMinDraftPct` above is
    // measured against a hardcoded 1 degree, which is the right question for
    // aluminium die casting and the wrong one for zinc (0.5), sand (1.5-3) and
    // hot forging (5-7). Each rule names the angle it actually means in
    // `draftCutoffDeg` and the evaluator reads that point off this curve.
    _draftCurve: draft.wallAreaBelowDraftPct || undefined,
    // THE SMALLEST CORED-HOLE DRAFT, in degrees per side, read from the cone
    // surface itself rather than from the tessellation. An area percentage
    // derived from facets spread either side of the true angle and reported 12%
    // of a clean 3-degree bore as "below 2 degrees" — a false finding produced
    // by the measurement, not by the part. Absent, not zero, when the part has
    // no recognised bore: a part with no cored holes has not passed a
    // cored-hole rule.
    coredHoleDraftPerSideDeg: num((draft.coredHoles || {}).minDraftPerSideDeg),
    coredHoleCount: num((draft.coredHoles || {}).count),

    // THE OVERHANG CURVE, same shape and same discipline as the draft curve.
    // 45 degrees is a rule of thumb, not a constant: some alloys and parameter
    // sets self-support to 30, and lattice struts want better than 25. Each
    // rule names the angle it means in `overhangCutoffDeg` and the evaluator
    // reads that point off this curve — so a family cannot silently be judged
    // at an angle its source never quoted.
    _overhangCurve: (dfm.overhang || {}).overhangAreaBelowDeg || undefined,

    // ── The two measures that were absent for the whole life of the rules ──
    //
    // `mach-pocket-depth-ratio` and `mach-internal-corner-radius` were written
    // against measurements nothing produced, so both reported NOT EVALUATED on
    // every part ever analysed — on the filleted-pocket fixture the entire
    // machining family evaluated 0 of 7 rules. The recogniser had the data and
    // was discarding it: a fillet's radius came off the kernel and was dropped,
    // and a pocket carried an area and a centroid but no extents.
    //
    // Both stay UNDEFINED when the recogniser has nothing, which is the whole
    // three-state discipline: a part with no concave fillet has not been
    // measured as having a small corner, it has been measured as having none.
    minInternalCornerRadiusMm: num(features.minInternalCornerRadiusMm),
    maxPocketDepthToWidth: num(features.maxPocketDepthToWidth),

    // ── NADCA, READ FIRST-HAND ────────────────────────────────────────────
    //
    // Everything from here down is computed in nadcaLimits() from the die
    // casting design book rather than from a remembered constant. It is
    // spread in last so that a NADCA-derived measure of the same name wins
    // over the flat one above — which is the point of the exercise.
    ...nadcaLimits(draft, features, wall, geo, opts),
    // SFSA Supplement 1, the same discipline for STEEL castings: margins where
    // a rule reads them, report figures where the engineer wants the number,
    // absence everywhere the document does not speak.
    ...sfsaLimits(draft, features, wall, geo, opts),
    // DuPont Module I, the same discipline for ENGINEERING THERMOPLASTICS.
    ...dupontLimits(draft, features, wall, geo, opts),
    // Covestro "Part and Mold Design" for the PC/PC-ABS/TPU families the
    // DuPont table does not name. The two resin gates are DISJOINT, so the
    // shared resin* measure keys can never collide.
    ...covestroLimits(draft, features, wall, geo, opts),
    // ISO 8062-4: tolerance capability for the permanent-mould families and
    // the draft tables every casting family can sharpen against.
    ...iso8062Limits(draft, features, wall, geo, opts),
    // DIN 16742: the moulded-part tolerance tables — injection moulding per
    // Annex C compound assignment, rotational moulding at the standard's own
    // TG9.
    ...din16742Limits(draft, features, wall, geo, opts),
  };
}

/**
 * The limits ISO 8062-4 prints — permanent-mould (gravity / low-pressure)
 * tolerance capability, and the Table 4-8 draft requirements per casting
 * family, computed at the part's own extent along the draw. Sand and
 * investment TOLERANCES are handled inside sfsaLimits' judge() so steel and
 * non-steel flow through one path; this function carries what no other
 * module covers.
 */
function iso8062Limits(draft, features, wall, geo, opts = {}) {
  const num = (v) => {
    if (v === null || v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const out = {};
  // A pmi block is part evidence too — the same clause nadcaLimits carries:
  // a tolerance judge needs only a band, so a drawing-only analysis with no
  // measured walls or draft must still have its callouts judged.
  const hasPart = !!(draft && (draft.drawDirectionXYZ || draft.draftHistogramDegToAreaMm2 || draft.coredHoles))
    || num(wall?.p50Mm) !== undefined
    || !!(geo.dfm?.pmi?.present);
  if (!hasPart) return out;

  // ── PERMANENT-MOULD TOLERANCE CAPABILITY (gravity die / LPDC) ───────────
  // Table B.1 has no short-series column for permanent moulds — the tooling
  // is always iterated — so the series input does not move this one.
  {
    const sel = isoGradeFor('permanentMould', opts.material, 'long');
    if (sel.ok) {
      const pmiSrc = pmiSource(geo);
      const pmiRows = (Array.isArray(geo.dfm?.pmi?.dimensions) ? geo.dfm.pmi.dimensions : [])
        .filter((r) => Number(r?.span) > 0 && Number(r?.value) > 0);
      const declared = num(opts.declaredToleranceMm);
      let worst = null;
      for (const r of pmiRows) {
        const cap = sToleranceMm(Number(r.value), sel.grade);
        if (!cap.ok) continue;
        const margin = Number(r.span) / cap.totalBandMm;
        if (!worst || margin < worst.margin) {
          worst = { margin, dimensionMm: Number(r.value), bandMm: Number(r.span),
            capabilityBandMm: cap.totalBandMm, grade: `S${sel.grade}`, from: pmiSrc.from,
            basis: `${pmiSrc.prefix}${sel.basis} ${cap.basis}` };
        }
      }
      if (!worst && declared !== undefined && declared > 0) {
        const cap = sTightestPromiseMm(sel.grade);
        if (cap.ok) {
          worst = { margin: declared / cap.totalBandMm, dimensionMm: null, bandMm: declared,
            capabilityBandMm: cap.totalBandMm, grade: `S${sel.grade}`, from: 'declared',
            basis: `The band was DECLARED by the engineer, without its dimension. ${sel.basis} ${cap.basis}` };
        }
      }
      if (worst) {
        out.iso8062PmToleranceMargin = Math.round(worst.margin * 1000) / 1000;
        out._iso8062PmTolerance = worst;
      }
    }
  }

  // ── DRAFT, Tables 4-8: per casting family, at the part's draw extent ────
  // The tables ask LESS of taller features, and the part's extent along the
  // draw is an upper bound on any feature's height — so the angle computed
  // here is the LEAST the standard could ask, and the run loop combines it
  // sharpen-only with each rule's published cutoff, exactly like NADCA.
  {
    const bb = (geo.geometry || {}).boundingBox || geo.boundingBox || {};
    const ext = [num(bb.xMm), num(bb.yMm), num(bb.zMm)];
    const dir = draft.drawDirectionXYZ;
    let depthMm;
    if (Array.isArray(dir) && ext.every((v) => v > 0)) {
      let k = -1;
      for (let i = 0; i < 3; i++) if (Math.abs(Number(dir[i])) > 0.999) k = i;
      depthMm = k >= 0 ? ext[k] : Math.max(...ext.filter((v) => v > 0));
    } else if (ext.some((v) => v > 0)) {
      depthMm = Math.max(...ext.filter((v) => v > 0));
    }
    if (depthMm > 0 && draft.draftHistogramDegToAreaMm2) {
      const FAMILY_TABLE = {
        'sand-casting': 'hand', 'shell-mould': 'machine',
        'gravity-die': 'permanentMould', 'lpdc': 'permanentMould',
        'investment-casting': 'investment',
      };
      const map = {};
      for (const [family, table] of Object.entries(FAMILY_TABLE)) {
        const req = isoDraftDeg(table, depthMm);
        if (!req.ok) continue;
        const pct = areaBelowDraftPct(draft.draftHistogramDegToAreaMm2, req.deg);
        map[family] = {
          requiredDeg: req.deg, drawDepthMm: Math.round(depthMm),
          wallAreaBelowRequiredPct: pct,
          basis: `${req.basis} Judged at the part's own ${Math.round(depthMm)} mm extent along the draw - an upper bound on any feature's height, and the table asks LESS of taller features, so this is the least the standard could ask; the published rule angle stays the floor.`,
        };
      }
      if (Object.keys(map).length) out._iso8062Draft = map;
    }
  }

  return out;
}

/**
 * The limits DIN 16742 prints — moulded-part tolerance capability for
 * injection moulding (Annex C compound assignment → Table C.1 tolerance
 * group → Table 2 band at the feature's own dimension) and for rotational
 * moulding at the standard's own TG9. Same dual evidence paths as every
 * other capability measure: a worst PMI row judged at its own dimension, or
 * a declared band judged against the group's tightest promise.
 */
function din16742Limits(draft, features, wall, geo, opts = {}) {
  const num = (v) => {
    if (v === null || v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const out = {};
  // A pmi block is part evidence too — the same clause nadcaLimits carries:
  // a tolerance judge needs only a band, so a drawing-only analysis with no
  // measured walls or draft must still have its callouts judged.
  const hasPart = !!(draft && (draft.drawDirectionXYZ || draft.draftHistogramDegToAreaMm2 || draft.coredHoles))
    || num(wall?.p50Mm) !== undefined
    || !!(geo.dfm?.pmi?.present);
  if (!hasPart) return out;

  // 'standard' → series 1 (normal production — the only series §5.2 allows
  // for general tolerances); 'precision' → series 2 (accurate production).
  // Series 3/4 are printed as "always subject to mandatory agreement" and
  // the module refuses them, so this input can never assume a negotiation.
  const series = opts.toleranceGrade === 'precision' ? 2 : 1;
  const sel = dinTgFor(opts.material, { series });
  if (!sel.ok) return out;

  const pmiSrc = pmiSource(geo);
  const pmiRows = (Array.isArray(geo.dfm?.pmi?.dimensions) ? geo.dfm.pmi.dimensions : [])
    .filter((r) => Number(r?.span) > 0 && Number(r?.value) > 0);
  const declared = num(opts.declaredToleranceMm);

  const judge = (tg, tgBasis) => {
    let worst = null;
    for (const r of pmiRows) {
      const cap = tgToleranceMm(Number(r.value), tg);
      if (!cap.ok) continue;                       // <1 mm, >1000 mm, or '-'
      const margin = Number(r.span) / cap.totalBandMm;
      if (!worst || margin < worst.margin) {
        worst = { margin: Math.round(margin * 1000) / 1000, dimensionMm: Number(r.value), bandMm: Number(r.span),
          capabilityBandMm: cap.totalBandMm, tg: `TG${tg}`, series,
          from: pmiSrc.from, basis: `${pmiSrc.prefix}${tgBasis} ${cap.basis}` };
      }
    }
    if (!worst && declared !== undefined && declared > 0) {
      const cap = tgTightestPromiseMm(tg);
      if (cap.ok) {
        worst = { margin: Math.round((declared / cap.totalBandMm) * 1000) / 1000, dimensionMm: null, bandMm: declared,
          capabilityBandMm: cap.totalBandMm, tg: `TG${tg}`, series,
          from: 'declared', basis: `The band was DECLARED by the engineer, without its dimension. ${tgBasis} ${cap.basis}` };
      }
    }
    return worst;
  };

  const im = judge(sel.tg, sel.basis);
  if (im) {
    out.din16742ToleranceMargin = im.margin;
    out._din16742Tolerance = im;
  }
  const rm = judge(ROTOMOULDING_TG, ROTOMOULDING_BASIS);
  if (rm) {
    out.din16742RmToleranceMargin = rm.margin;
    out._din16742RmTolerance = rm;
  }

  // ── The report figure: what the standard promises at this part's size ───
  // Printed whether or not a rule fires, like the CT and NADCA summaries.
  {
    const bb = (geo.geometry || {}).boundingBox || geo.boundingBox || {};
    const ext = [num(bb.xMm), num(bb.yMm), num(bb.zMm)].filter((v) => v > 0);
    if (ext.length) {
      const largest = Math.max(...ext);
      const cap = tgToleranceMm(largest, sel.tg);
      const diag = Math.sqrt(ext.reduce((s, v) => s + v * v, 0));
      const prof = dinProfileToleranceMm(diag);
      out._din16742Summary = {
        tg: `TG${sel.tg}`, letter: sel.letter, series,
        largestDimensionMm: Math.round(largest),
        totalBandMm: cap.ok ? cap.totalBandMm : null,
        plusMinusMm: cap.ok ? cap.plusMinusMm : null,
        profileToleranceMm: prof.ok ? prof.toleranceMm : null,
        profileDiagonalMm: prof.ok ? prof.dpMm : null,
        basis: cap.ok ? `${sel.basis} ${cap.basis}` : `${sel.basis} ${cap.reason}`,
      };
    }
  }

  return out;
}

/**
 * The limits the Covestro guide prints for ITS resin families — Makrolon PC,
 * Bayblend PC/ABS, Texin/Desmopan TPU. Emits the same neutral resin* keys
 * as dupontLimits (draft area at the resin's own angle, fillet margin), and
 * the gates are disjoint by construction: a resin is judged by the book that
 * names it, never by a borrowed column.
 */
function covestroLimits(draft, features, wall, geo, opts = {}) {
  const num = (v) => {
    if (v === null || v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const out = {};
  const hasPart = !!(draft && (draft.drawDirectionXYZ || draft.draftHistogramDegToAreaMm2))
    || num(wall?.p50Mm) !== undefined;
  if (!hasPart) return out;
  const group = covestroResinFor(opts.material);
  if (!group.ok) {
    // The DuPont gate already wrote its reason for non-DuPont resins; only
    // add one here when neither book names the material and nothing spoke.
    return out;
  }
  const nominalWall = num(wall.p50Mm);

  // ── DRAFT, p.32: flat per-resin minimum (no printed depth dependence) ───
  {
    const req = covestroRequiredDraftDeg(opts.material);
    if (req.ok) {
      const pct = areaBelowDraftPct(draft.draftHistogramDegToAreaMm2, req.deg);
      out._resinDraft = {
        requiredDeg: req.deg, band: null, group: req.group, drawDepthMm: null,
        wallAreaBelowRequiredPct: pct,
        basis: req.basis,
      };
      if (pct !== undefined) out.resinDraftAreaPct = pct;
    }
  }

  // ── FILLETS, Fig 2-22: the r/t = 0.15 compromise ────────────────────────
  const corner = num(features.minInternalCornerRadiusMm);
  if (nominalWall > 0) {
    const req = covestroFilletRequirementMm(nominalWall);
    if (req.ok) {
      out._resinFillet = { requiredMm: req.requiredMm, wallMm: nominalWall,
        measuredMm: corner ?? null, basis: req.basis };
      if (corner !== undefined && req.requiredMm > 0) {
        out.resinFilletMargin = Math.round((corner / req.requiredMm) * 1000) / 1000;
      }
    }
  }

  return out;
}

/**
 * The limits DuPont Module I actually prints for its resin families — same
 * discipline as nadcaLimits(): resin-specific requirements as margins,
 * report figures underscored, absence with a reason wherever Table 3.01
 * does not name the material. ABS, PC, PP and friends keep the generic
 * moulding thresholds; metals get nothing here.
 */
function dupontLimits(draft, features, wall, geo, opts = {}) {
  const num = (v) => {
    if (v === null || v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const out = {};
  const hasPart = !!(draft && (draft.drawDirectionXYZ || draft.draftHistogramDegToAreaMm2))
    || num(wall?.p50Mm) !== undefined;
  if (!hasPart) return out;
  const group = resinGroupFor(opts.material);
  if (!group.ok) { out._dupontBasis = group.reason; return out; }
  const nominalWall = num(wall.p50Mm);

  // ── DRAFT, Table 3.01: resin- and depth-specific requirement ────────────
  //
  // The table asks MORE draft of a deeper draw, so judging at the part's own
  // extent along the draw — an upper bound on any feature's depth — returns
  // the most demanding band the part could fall in. Conservative in the
  // right direction, unlike the NADCA formula where depth loosens the ask.
  {
    const bb = (geo.geometry || {}).boundingBox || geo.boundingBox || {};
    const ext = [num(bb.xMm), num(bb.yMm), num(bb.zMm)];
    const dir = draft.drawDirectionXYZ;
    let depthMm;
    if (Array.isArray(dir) && ext.every((v) => v > 0)) {
      let k = -1;
      for (let i = 0; i < 3; i++) if (Math.abs(Number(dir[i])) > 0.999) k = i;
      depthMm = k >= 0 ? ext[k] : Math.max(...ext);
    } else if (ext.some((v) => v > 0)) {
      depthMm = Math.max(...ext.filter((v) => v > 0));
    }
    if (depthMm > 0) {
      const req = dupontRequiredDraftDeg(opts.material, depthMm);
      if (req.ok) {
        const pct = areaBelowDraftPct(draft.draftHistogramDegToAreaMm2, req.deg);
        out._resinDraft = {
          requiredDeg: req.deg, band: req.band, group: req.group,
          drawDepthMm: Math.round(depthMm),
          wallAreaBelowRequiredPct: pct,
          basis: `${req.basis} Judged at the part's own ${Math.round(depthMm)} mm extent along the draw - an upper bound on any feature's depth, and the table asks MORE of deeper draws, so this is the most demanding band the part could fall in.`,
        };
        if (pct !== undefined) out.resinDraftAreaPct = pct;
      }
    }
  }

  // ── FILLETS, Fig 3.07: the R/T = 0.5 knee with the printed 0.508 floor ──
  const corner = num(features.minInternalCornerRadiusMm);
  if (nominalWall > 0) {
    const req = dupontFilletRequirementMm(nominalWall);
    if (req.ok) {
      out._resinFillet = { requiredMm: req.requiredMm, wallMm: nominalWall,
        measuredMm: corner ?? null, basis: req.basis };
      if (corner !== undefined) {
        out.resinFilletMargin = Math.round((corner / req.requiredMm) * 1000) / 1000;
      }
    }
  }

  // ── BOSS OD vs ITS HOLE, p.8: the 2-2.5x band, worst pair named ─────────
  const table = Array.isArray((geo.geometry || {}).featureTable || geo.featureTable)
    ? ((geo.geometry || {}).featureTable || geo.featureTable) : [];
  const pair = worstCoaxialBossPair(table);
  if (pair) {
    out.dupontBossOdToHole = Math.round(pair.ratio * 1000) / 1000;
    out._dupontBoss = { ...pair, minRatio: BOSS_OD_TO_HOLE.min, maxRatio: BOSS_OD_TO_HOLE.max, basis: BOSS_OD_TO_HOLE.basis };
  }

  // ── BLIND HOLES: the p.8 limit is a REPORT figure beside the rule ───────
  // (the rule itself reads the global maxBlindHoleDepthToDia measure)
  out._dupontBlindHole = { maxDepthToDia: BLIND_CORE.maxDepthToDia, basis: BLIND_CORE.basis };

  return out;
}

/**
 * The limits NADCA actually specifies, expressed as MARGINS.
 *
 * Same shape as bookLimits() for sheet metal: each entry is `measured /
 * required`, so a rule can be written against a flat 1.0 while the requirement
 * itself moves with the alloy and the feature depth. Everything is absent
 * rather than zero when it cannot be computed — a part whose alloy is not in
 * NADCA's four groups must abstain, not score 0 and fail every draft rule in
 * the catalogue.
 *
 * Underscored entries are for the REPORT rather than for rules: an engineer
 * wants to see the general-note draft their drawing should carry, whether or
 * not a threshold applies to it.
 */
function nadcaLimits(draft, features, wall, geo, opts = {}) {
  const num = (v) => {
    if (v === null || v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const out = {};
  // NOTHING TO SAY ABOUT NOTHING. On an empty geometry there is no part to
  // judge, so there is no reason to explain either — a measure map that carries
  // a sentence when it carries no measurements is still a map with a value in
  // it, and every measure in this engine must be absent until something is
  // measured. The reason is only interesting once there IS a part.
  // A measured wall or PMI is part evidence too: the #402 tolerance check
  // needs only an alloy and a band, so a part whose draft pass produced
  // nothing must still have its declared callouts judged.
  const hasPart = !!(draft && (draft.drawDirectionXYZ || draft.draftHistogramDegToAreaMm2 || draft.coredHoles))
    || num(wall?.p50Mm) !== undefined
    || !!(geo.dfm?.pmi?.present);
  if (!hasPart) return out;
  const material = opts.material;
  const group = draftGroupFor(material);
  if (!group.ok) { out._nadcaBasis = group.reason; return out; }

  // ── How deep the part is ALONG THE DRAW. This is L in NADCA's formula, and
  // taking the part's own extent reproduces the general-note practice the book
  // describes on p.46. Without a draw direction there is no depth and every
  // draft margin below abstains.
  const bb = (geo.geometry || {}).boundingBox || geo.boundingBox || {};
  const dir = draft.drawDirectionXYZ;
  const partDepthMm = (() => {
    const ext = [num(bb.xMm), num(bb.yMm), num(bb.zMm)];
    if (!Array.isArray(dir) || ext.some((v) => !(v > 0))) return undefined;
    // The draw is an axis in this engine, so the depth is the extent along it.
    for (let i = 0; i < 3; i++) if (Math.abs(Number(dir[i])) > 0.999) return ext[i];
    return undefined;
  })();

  const note = generalNoteDraft(material, partDepthMm);
  if (note.ok) {
    out._nadcaDraft = note;
    // AREA BELOW THE COMPUTED REQUIREMENT, off the measured histogram. The old
    // rules read a fixed point on a 7-value curve; this reads the angle NADCA
    // actually asks for, which is rarely one of those seven.
    const pct = areaBelowDraftPct(draft.draftHistogramDegToAreaMm2, note.outsideDeg);
    if (pct !== undefined) {
      out.nadcaWallAreaBelowDraftPct = pct;
      out._nadcaDraft = { ...note, wallAreaBelowRequiredPct: pct };
    }
  }

  // ── CORED HOLES, per bore, at each bore's own depth ─────────────────────
  //
  // A cylinder's wall area is 2·pi·r·depth, so the depth the formula needs is
  // already implied by two numbers the bore pass reports. The margin is the
  // WORST bore on the part, and the bore that produced it is named.
  const bores = Array.isArray(draft.coredHoles?.bores) ? draft.coredHoles.bores : [];
  let worstBore = null;
  for (const b of bores) {
    const r = num(b.radiusMm); const a = num(b.areaMm2); const measured = num(b.draftPerSideDeg);
    if (!(r > 0) || !(a > 0) || measured === undefined) continue;
    const depthMm = a / (2 * Math.PI * r);
    const req = requiredCoredHoleDraftPerSideDeg(material, depthMm);
    if (!req.ok) continue;
    const ratio = req.deg > 0 ? measured / req.deg : undefined;
    if (ratio === undefined) continue;
    if (!worstBore || ratio < worstBore.ratio) {
      worstBore = { ratio, measuredDeg: measured, requiredDeg: req.deg, depthMm: Math.round(depthMm * 100) / 100,
        diaMm: Math.round(r * 200) / 100, faceId: b.faceId, atXYZ: b.atXYZ, basis: req.basis };
    }
  }
  if (worstBore) {
    out.nadcaCoredHoleDraftMargin = Math.round(worstBore.ratio * 1000) / 1000;
    out._nadcaCoredHole = worstBore;
  }

  // ── FILLETS AS A RATIO TO WALL, Figure 3.2 ─────────────────────────────
  //
  // The flat 1.6 mm this replaces passes a 1.6 mm radius on a 6 mm wall, where
  // the book wants 6 mm — so the rule was silent on exactly the chunky castings
  // it should have been loudest about.
  const nominalWall = num(wall.p50Mm);
  const corner = num(features.minInternalCornerRadiusMm);
  if (nominalWall > 0 && corner !== undefined) {
    out.nadcaFilletToWall = Math.round((corner / nominalWall) * 1000) / 1000;
    out._nadcaFillet = {
      measuredMm: corner,
      wallMm: nominalWall,
      requiredMm: Math.round(nominalWall * 100) / 100,
      outsideCornerMm: outsideCornerRadiusMm(corner, nominalWall),
      basis: FILLET_RATIO.basis,
    };
  }

  // ── BOSS WALL AROUND A FASTENER HOLE, §3.2 p.51 ────────────────────────
  //
  // Pairs each recognised boss with the hole running COAXIALLY through it —
  // shared geometry with the DuPont boss rule, so the pairing logic exists
  // once in worstCoaxialBossPair().
  const table = Array.isArray((geo.geometry || {}).featureTable || geo.featureTable)
    ? ((geo.geometry || {}).featureTable || geo.featureTable) : [];
  const worstBoss = worstCoaxialBossPair(table);
  if (worstBoss) {
    out.nadcaBossDiaToHoleDia = Math.round(worstBoss.ratio * 1000) / 1000;
    out._nadcaBoss = { ...worstBoss, basis: BOSS_DIA_TO_HOLE_DIA.basis };
  }

  // ── MACHINING STOCK vs THE CHILLED SKIN, §4.2 ──────────────────────────
  //
  // Declared, never measured — one STEP file cannot show what will be cut off
  // it. Absent when the engineer has not typed one, which keeps the rule
  // honestly unevaluated rather than passing on a default.
  const stock = num(opts.machiningStockMm);
  if (stock !== undefined && stock >= 0) {
    out.nadcaMachiningStockToSkinMm = stock;
    out._nadcaSkin = { stockMm: stock, skinMinMm: SKIN.minMm, skinMaxMm: SKIN.maxMm, basis: SKIN.basis };
  }

  // ── MINIMUM WALL SCALED BY THE ALLOY'S DIE-FILLING RATING, Table 4.8 ───
  //
  // Reported rather than compared: it is the FLOOR the wall-range rule should
  // use for this alloy, and the rule's own band stays the anchor because the
  // book gives no minimum-wall table. A rating of 2 — A380, the alloy the old
  // flat number was written for — reproduces that number exactly, so nothing
  // moves for the common case.
  const fill = minWallForAlloyMm(material, 1.0);
  if (fill.ok) out._nadcaMinWall = fill;

  // ── TOLERANCE CAPABILITY FROM NADCA #402 (2021), Tables S/P-4A-1 ────────
  //
  // The document every casting tolerance rule was blocked on, now read
  // first-hand. Capability is a function of the DIMENSION the band sits on —
  // ±0.25 mm covers the first 25.4 mm and grows 0.025 mm per inch after — so
  // a band that is comfortable on a 200 mm dimension is impossible on a 10 mm
  // one, and one screening value can never say both.
  //
  // Two paths, honestly distinguished:
  //   * PMI: every dimension row carries its own value and band, so the margin
  //     is the WORST of band/capability over the rows, and the worst row is
  //     named in the finding.
  //   * A declared single band has no dimension, so it is compared against the
  //     FIRST-INCH base — the tightest the standard ever promises — and the
  //     basis says so. Conservative in the only defensible direction.
  const grade402 = opts.toleranceGrade === 'precision' ? 'precision' : 'standard';
  {
    // The rows need no draft data — a tolerance judge needs only a band. The
    // old `draft ?` guard here silently emptied the rows on a part with pmi
    // evidence but no draft pass (exactly the drawing-only case).
    const pmiSrc = pmiSource(geo);
    const pmiRows = (Array.isArray(geo.dfm?.pmi?.dimensions) ? geo.dfm.pmi.dimensions : [])
      .filter((r) => Number(r?.span) > 0 && Number(r?.value) > 0);
    let worst = null;
    for (const r of pmiRows) {
      const cap = linearToleranceMm(material, Number(r.value), grade402);
      if (!cap.ok) continue;
      const margin = Number(r.span) / cap.totalBandMm;
      if (!worst || margin < worst.margin) {
        worst = { margin, dimensionMm: Number(r.value), bandMm: Number(r.span),
          capabilityBandMm: cap.totalBandMm, grade: grade402,
          basis: `${pmiSrc.prefix}${cap.basis}`, from: pmiSrc.from };
      }
    }
    if (!worst) {
      const declared = num(opts.declaredToleranceMm);
      if (declared !== undefined && declared > 0) {
        const cap = linearToleranceMm(material, 25.4, grade402);
        if (cap.ok) {
          worst = { margin: declared / cap.totalBandMm, dimensionMm: null, bandMm: declared,
            capabilityBandMm: cap.totalBandMm, grade: grade402,
            basis: `${cap.basis} The band was DECLARED without its dimension, so it is judged against the first-25.4 mm base - the tightest the standard ever promises - rather than against a dimension nobody stated.`,
            from: 'declared' };
        }
      }
    }
    if (worst) {
      out.nadca402ToleranceMargin = Math.round(worst.margin * 1000) / 1000;
      out._nadca402Tolerance = worst;
    }
  }

  // ── FLATNESS CAPABILITY, Tables S/P-4A-8 ────────────────────────────────
  //
  // Keyed on the largest dimension of the surface; the bounding diagonal of
  // the part's two largest extents is the largest any face could carry, so it
  // is the honest upper bound when no face was named. Declared-only: a STEP
  // file does not say which surface must be flat, or how flat.
  {
    const flat = num(opts.flatnessMm);
    const bbF = (geo.geometry || {}).boundingBox || geo.boundingBox || {};
    const dims = [num(bbF.xMm), num(bbF.yMm), num(bbF.zMm)].filter((v) => v > 0).sort((a, b) => b - a);
    if (flat !== undefined && flat > 0 && dims.length >= 2) {
      const diag = Math.hypot(dims[0], dims[1]);
      const cap = flatnessToleranceMm(diag, grade402);
      if (cap.ok) {
        out.nadca402FlatnessMargin = Math.round((flat / cap.toleranceMm) * 1000) / 1000;
        out._nadca402Flatness = { declaredMm: flat, capabilityMm: cap.toleranceMm,
          diagonalMm: Math.round(diag), grade: grade402,
          basis: `${cap.basis} Judged at the part's own ${Math.round(diag)} mm bounding diagonal - the largest dimension any single face could carry.` };
      }
    }
  }

  // ── The #402 capability summary the REPORT prints whether or not a rule
  // fires: what the standard promises for this part at this grade. Projected
  // area for the parting-line adder is approximated by the bounding footprint
  // perpendicular to the draw — an UPPER bound on the true projected area,
  // which makes the quoted adder an upper bound too, and the basis says so.
  {
    const bbS = (geo.geometry || {}).boundingBox || geo.boundingBox || {};
    const ext = [num(bbS.xMm), num(bbS.yMm), num(bbS.zMm)];
    const dir = draft.drawDirectionXYZ;
    if (Array.isArray(dir) && ext.every((v) => v > 0)) {
      let k = -1;
      for (let i = 0; i < 3; i++) if (Math.abs(Number(dir[i])) > 0.999) k = i;
      if (k >= 0) {
        const perp = ext.filter((_, i) => i !== k);
        const areaCm2 = (perp[0] * perp[1]) / 100;
        const maxDim = Math.max(...ext);
        const lin = linearToleranceMm(material, maxDim, grade402);
        const pl = partingLineToleranceMm(material, areaCm2, grade402);
        if (lin.ok) {
          out._nadca402Summary = {
            grade: grade402,
            largestDimensionMm: Math.round(maxDim),
            linearPlusMinusMm: lin.plusMinusMm,
            projectedAreaCm2: Math.round(areaCm2),
            projectedAreaBasis: 'bounding footprint perpendicular to the draw - an UPPER bound on the true projected area',
            partingLinePlusMm: pl.ok ? pl.plusMm : null,
            partingLineNote: pl.ok ? null : pl.reason,
          };
        }
      }
    }
  }

  // ── AS-CAST SURFACE FINISH vs PROCESS CAPABILITY, Table 3.26 ───────────
  const asked = num(opts.surfaceRoughnessUin);
  const cap = asCastRoughnessUin(material);
  if (asked !== undefined && asked > 0 && cap.ok) {
    out.nadcaRoughnessMargin = Math.round((asked / cap.overDieLife) * 1000) / 1000;
    out._nadcaRoughness = { askedUin: asked, newDieUin: cap.newDie, overDieLifeUin: cap.overDieLife, basis: cap.basis };
  }

  return out;
}

/**
 * The limits SFSA Supplement 1 actually prints for STEEL castings — same
 * discipline as nadcaLimits(): margins where a rule reads them, underscored
 * report figures where an engineer wants the number whether or not a rule
 * fires, absence (with the reason on the report key) everywhere the document
 * does not speak. Cast iron deliberately gets nothing here.
 */
function sfsaLimits(draft, features, wall, geo, opts = {}) {
  const num = (v) => {
    if (v === null || v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const out = {};
  // A pmi block is part evidence too — the same clause nadcaLimits carries:
  // a tolerance judge needs only a band, so a drawing-only analysis with no
  // measured walls or draft must still have its callouts judged.
  const hasPart = !!(draft && (draft.drawDirectionXYZ || draft.draftHistogramDegToAreaMm2 || draft.coredHoles))
    || num(wall?.p50Mm) !== undefined
    || !!(geo.dfm?.pmi?.present);
  if (!hasPart) return out;
  const group = castSteelGroupFor(opts.material);

  // ── TOLERANCE CAPABILITY, SFSA Supplement 3 (SFSA 2000 / ISO 8062) ──────
  //
  // Computed for EVERY material, with the honesty carried in the path taken:
  // steel is judged against the CT tables the supplement adopts; every other
  // alloy keeps the tool's screening value with a basis that says the
  // supplement tabulates steel only. Same two evidence paths as NADCA #402 —
  // worst PMI dimension row, else the declared band judged against the
  // tightest value the grade ever tabulates.
  const series = opts.productionSeries === 'long' ? 'long' : 'short';
  {
    const pmiRows = (Array.isArray(geo.dfm?.pmi?.dimensions) ? geo.dfm.pmi.dimensions : [])
      .filter((r) => Number(r?.span) > 0 && Number(r?.value) > 0);
    const declared = num(opts.declaredToleranceMm);
    // The screening bands the catalogue carried before the supplement was
    // read. They stay for the alloys the supplement does not speak for.
    const SCREEN = { sand: 1.2, sandCastIron: 1.0, investment: 0.3 };
    const isIron = /cast iron/i.test(String(opts.material || ''));

    const pmiSrc = pmiSource(geo);
    const judge = (process) => {
      if (group.ok) {
        const sel = ctGradeFor(process, series);
        if (!sel.ok) return undefined;
        let worst = null;
        for (const r of pmiRows) {
          const cap = ctToleranceMm(Number(r.value), sel.grade);
          if (!cap.ok) continue;                      // the grade prints '-' there
          const margin = Number(r.span) / cap.totalBandMm;
          if (!worst || margin < worst.margin) {
            worst = { margin, dimensionMm: Number(r.value), bandMm: Number(r.span),
              capabilityBandMm: cap.totalBandMm, grade: `CT${sel.grade}`, series: sel.series,
              from: pmiSrc.from, basis: `${pmiSrc.prefix}${sel.basis} ${cap.basis}` };
          }
        }
        if (!worst && declared !== undefined && declared > 0) {
          const cap = ctTightestPromiseMm(sel.grade);
          if (cap.ok) {
            worst = { margin: declared / cap.totalBandMm, dimensionMm: null, bandMm: declared,
              capabilityBandMm: cap.totalBandMm, grade: `CT${sel.grade}`, series: sel.series,
              from: 'declared', basis: `The band was DECLARED by the engineer, without its dimension. ${sel.basis} ${cap.basis}` };
          }
        }
        return worst ?? undefined;
      }
      // Non-steel: ISO 8062-4 now speaks for every metal group its Annex B
      // tabulates — the same two evidence paths as the steel branch, with
      // the grade picked per metal and process. The old screening value
      // survives ONLY for materials the standard's metal grouping refuses.
      const isoSel = isoGradeFor(process, opts.material, series);
      if (isoSel.ok) {
        let worst = null;
        for (const r of pmiRows) {
          const cap = sToleranceMm(Number(r.value), isoSel.grade);
          if (!cap.ok) continue;                    // beyond Table 2's 300 mm, or '-'
          const margin = Number(r.span) / cap.totalBandMm;
          if (!worst || margin < worst.margin) {
            worst = { margin, dimensionMm: Number(r.value), bandMm: Number(r.span),
              capabilityBandMm: cap.totalBandMm, grade: `S${isoSel.grade}`, series: isoSel.series,
              from: pmiSrc.from, basis: `${pmiSrc.prefix}${isoSel.basis} ${cap.basis}` };
          }
        }
        if (!worst && declared !== undefined && declared > 0) {
          const cap = sTightestPromiseMm(isoSel.grade);
          if (cap.ok) {
            worst = { margin: declared / cap.totalBandMm, dimensionMm: null, bandMm: declared,
              capabilityBandMm: cap.totalBandMm, grade: `S${isoSel.grade}`, series: isoSel.series,
              from: 'declared', basis: `The band was DECLARED by the engineer, without its dimension. ${isoSel.basis} ${cap.basis}` };
          }
        }
        if (worst) return worst;
        if (pmiRows.length || (declared !== undefined && declared > 0)) return undefined;
        return undefined;
      }
      // The screening value, labelled as exactly that, for materials neither
      // standard tabulates.
      const screen = process === 'investment' ? SCREEN.investment : (isIron ? SCREEN.sandCastIron : SCREEN.sand);
      const band = pmiRows.length
        ? Math.min(...pmiRows.map((r) => Number(r.span)))
        : (declared !== undefined && declared > 0 ? declared : undefined);
      if (band === undefined) return undefined;
      return { margin: band / screen, dimensionMm: null, bandMm: band, capabilityBandMm: screen,
        grade: null, series: null, from: pmiRows.length ? pmiSrc.from : 'declared',
        basis: `${pmiRows.length ? pmiSrc.prefix : ''}Process screening value (${screen} mm total band${isIron ? ', cast iron' : ''}) - neither SFSA Supplement 3 (steel) nor ISO 8062-4's metal groups tabulate this material, so the tool's screening threshold stays in force.` };
    };

    const sand = judge('sand');
    if (sand) {
      out.sfsaSandToleranceMargin = Math.round(sand.margin * 1000) / 1000;
      out._sfsaSandTolerance = sand;
    }
    const inv = judge('investment');
    if (inv) {
      out.sfsaInvToleranceMargin = Math.round(inv.margin * 1000) / 1000;
      out._sfsaInvTolerance = inv;
    }
  }

  // ── FLATNESS vs ISO 8062-2 CTG, Table 4.2a + 4.5 — steel only ───────────
  // Declared callout judged at the bounding diagonal (the largest dimension
  // any single face could carry), CTG7 for machine-molded sand and CTG6 for
  // investment — the loosest of each printed band; hand molding runs to CTG8.
  const flatDecl = num(opts.flatnessMm);
  if (group.ok && flatDecl !== undefined && flatDecl > 0) {
    const bbF = (geo.geometry || {}).boundingBox || geo.boundingBox || {};
    const dims = [num(bbF.xMm), num(bbF.yMm), num(bbF.zMm)].filter((v) => v > 0).sort((a, b) => b - a);
    if (dims.length >= 2) {
      const diag = Math.hypot(dims[0], dims[1]);
      const sandCap = ctgFlatnessMm(diag, 7);
      if (sandCap.ok) {
        out.sfsaSandFlatnessMargin = Math.round((flatDecl / sandCap.toleranceMm) * 1000) / 1000;
        out._sfsaSandFlatness = { declaredMm: flatDecl, capabilityMm: sandCap.toleranceMm, ctg: 'CTG7',
          diagonalMm: Math.round(diag),
          basis: `${sandCap.basis} ${CTG_SELECTION.basis} Judged at CTG7, the loosest of the machine-molded band; hand molding extends to CTG8. At the part's own ${Math.round(diag)} mm bounding diagonal.` };
      }
      const invCap = ctgFlatnessMm(diag, 6);
      if (invCap.ok) {
        out.sfsaInvFlatnessMargin = Math.round((flatDecl / invCap.toleranceMm) * 1000) / 1000;
        out._sfsaInvFlatness = { declaredMm: flatDecl, capabilityMm: invCap.toleranceMm, ctg: 'CTG6',
          diagonalMm: Math.round(diag), basis: `${invCap.basis} Investment band CTG4-6; judged at CTG6.` };
      }
    }
  }

  // ── REQUIRED MACHINING ALLOWANCE, Table 2.2 — steel only ────────────────
  // The declared stock must at least cover the RMA at the part's largest
  // dimension, judged at grade F — the machine-molded band's minimum, the
  // least the standard ever requires. Absent when no stock was declared.
  const stockDecl = num(opts.machiningStockMm);
  {
    const bbR = (geo.geometry || {}).boundingBox || geo.boundingBox || {};
    const maxDim = Math.max(num(bbR.xMm) ?? 0, num(bbR.yMm) ?? 0, num(bbR.zMm) ?? 0);
    if (group.ok && maxDim > 0) {
      const rma = rmaMm(maxDim, 'F');
      if (rma.ok) {
        out._sfsaRma = { requiredMm: rma.rmaMm, grade: 'F', largestDimensionMm: rma.largestDimensionMm,
          declaredMm: stockDecl ?? null, basis: `${rma.basis} ${RMA_GRADE_SELECTION.basis}` };
        if (stockDecl !== undefined && stockDecl >= 0) {
          out.sfsaMachiningStockMargin = Math.round((stockDecl / rma.rmaMm) * 1000) / 1000;
        }
      }
    }
  }

  if (!group.ok) { out._sfsaBasis = group.reason; return out; }
  const nominalWall = num(wall.p50Mm);

  // ── MINIMUM SECTION vs THE RUN THE STEEL MUST MAKE, p.2 + Fig. 1 ────────
  // The run length is bounded above by the part's longest bounding-box edge —
  // the gate position is the foundry's choice, so the true run may be shorter,
  // and the basis says which way that cuts.
  const bb = (geo.geometry || {}).boundingBox || geo.boundingBox || {};
  const runMm = Math.max(num(bb.xMm) ?? 0, num(bb.yMm) ?? 0, num(bb.zMm) ?? 0);
  if (runMm > 0) {
    const req = minSectionMm(runMm);
    if (req.ok) {
      out._sfsaMinSection = {
        requiredMm: req.requiredMm, runLengthMm: req.runLengthMm, digitized: req.digitized,
        basis: `${req.basis} The run is taken as the longest bounding-box edge - an UPPER bound, since the gate may sit closer.`,
      };
    }
  }

  // ── JUNCTION FILLET, Fig. 11: r = thinner wall, clamped 13-25 mm ────────
  const corner = num(features.minInternalCornerRadiusMm);
  if (nominalWall > 0) {
    const fil = junctionFilletMm(nominalWall);
    if (fil.ok) {
      out._sfsaJunctionFillet = { requiredMm: fil.requiredMm, wallMm: nominalWall, measuredMm: corner ?? null, basis: fil.basis };
      if (corner !== undefined) {
        out.sfsaJunctionFilletMargin = Math.round((corner / fil.requiredMm) * 1000) / 1000;
      }
    }
  }

  // ── RIB THERMAL NEUTRALITY, Fig. 8: height limit moves with thickness ───
  // The generic "height <= 4 walls" is only printed for the THINNEST rib
  // (1/4 wall); a 3/4-wall rib is neutral to just half a wall of height. The
  // margin is the worst rib's limit/actual, and that rib is named.
  const ribList = Array.isArray(features.ribs) ? features.ribs : [];
  if (nominalWall > 0 && ribList.length) {
    let worstRib = null;
    for (const r of ribList) {
      const t = num(r.thicknessMm); const h = num(r.heightMm);
      if (!(t > 0) || !(h > 0)) continue;
      const lim = ribNeutralHeightLimit(t / nominalWall);
      if (!lim.ok) continue;      // beyond 3/4 wall the thickness rule itself fails
      const margin = (lim.maxHeightToWall * nominalWall) / h;
      if (!worstRib || margin < worstRib.margin) {
        worstRib = { margin, thicknessMm: t, heightMm: h,
          ratioToWall: Math.round((t / nominalWall) * 1000) / 1000,
          neutralHeightMm: Math.round(lim.maxHeightToWall * nominalWall * 10) / 10,
          atXYZ: r.centroidXYZ ?? null, basis: lim.basis };
      }
    }
    if (worstRib) {
      out.sfsaRibNeutralityMargin = Math.round(worstRib.margin * 1000) / 1000;
      out._sfsaRibNeutrality = worstRib;
    }
  }

  // ── BOSS DIAMETER vs PARENT WALL, Fig. 16: the bands stop at 2.0 T ──────
  const table = Array.isArray((geo.geometry || {}).featureTable || geo.featureTable)
    ? ((geo.geometry || {}).featureTable || geo.featureTable) : [];
  if (nominalWall > 0) {
    let worstBoss = null;
    for (const b of table.filter((f) => f.kind === 'boss' && num(f.diaMm) > 0)) {
      const ratio = num(b.diaMm) / nominalWall;
      if (!worstBoss || ratio > worstBoss.ratio) {
        worstBoss = { ratio: Math.round(ratio * 1000) / 1000, diaMm: num(b.diaMm), wallMm: nominalWall, atXYZ: b.axisPointXYZ ?? null };
      }
    }
    if (worstBoss) {
      out.sfsaBossDiaToWall = worstBoss.ratio;
      out._sfsaBoss = { ...worstBoss, basis: BOSS.basis };
    }
  }

  // ── MINIMUM CORE DIAMETER, Fig. 30 — digitized, so REPORTED not gated ───
  const bores = Array.isArray(draft.coredHoles?.bores) ? draft.coredHoles.bores : [];
  let worstCore = null;
  for (const b of bores) {
    const r = num(b.radiusMm); const a = num(b.areaMm2);
    if (!(r > 0) || !(a > 0)) continue;
    const depthMm = a / (2 * Math.PI * r);
    const rec = minCoreDiaMm(nominalWall, depthMm);
    if (!rec.ok) continue;
    const margin = (2 * r) / rec.minDiaMm;
    if (!worstCore || margin < worstCore.margin) {
      worstCore = { margin: Math.round(margin * 1000) / 1000, diaMm: Math.round(r * 200) / 100,
        depthMm: Math.round(depthMm * 10) / 10, recommendedMinDiaMm: rec.minDiaMm,
        faceId: b.faceId, atXYZ: b.atXYZ, basis: rec.basis };
    }
  }
  if (worstCore) out._sfsaCoreDia = worstCore;

  // ── THE SUPPLEMENT 3 SUMMARY the report prints whether or not a rule
  // fires: what SFSA 2000 promises at this part's own size, and what the
  // industry capability models expect each sand molding route to hold.
  {
    const bbS = (geo.geometry || {}).boundingBox || geo.boundingBox || {};
    const maxDim = Math.max(num(bbS.xMm) ?? 0, num(bbS.yMm) ?? 0, num(bbS.zMm) ?? 0);
    if (maxDim > 0) {
      const sel = ctGradeFor('sand', series);
      const cap = sel.ok ? ctToleranceMm(maxDim, sel.grade) : { ok: false };
      if (cap.ok) {
        out._sfsaCtSummary = {
          grade: `CT${sel.grade}`, band: sel.band, series: sel.series,
          largestDimensionMm: Math.round(maxDim), totalBandMm: cap.totalBandMm,
          basis: `${sel.basis} ${cap.basis}`,
        };
      }
      const weightKg = num(opts.weightKg);
      if (weightKg !== undefined && weightKg > 0) {
        const routes = {};
        for (const molding of ['greenSand', 'noBake', 'shell']) {
          const model = capabilityModelMm(molding, { lengthMm: maxDim, weightKg, series });
          routes[molding] = model.ok
            ? { p50Mm: model.p50Mm, p90Mm: model.p90Mm }
            : { unavailable: model.reason };
        }
        out._sfsaCapabilityModel = {
          lengthMm: Math.round(maxDim), weightKg: Math.round(weightKg * 100) / 100, series,
          ...routes,
          basis: 'SFSA Supplement 3, Table 3.8: 6-sigma capability regressions per sand molding route, at this part\'s own largest dimension and weight (parting-line crossing not assumed). r^2 0.4-0.7 - expected industry spread, not a promise.',
        };
        out._sfsaWeightTolerance = {
          machineMoldedPct: WEIGHT_TOLERANCE.machineMoldedPct,
          handMoldedPct: WEIGHT_TOLERANCE.handMoldedPct,
          weightKg: Math.round(weightKg * 100) / 100,
          basis: WEIGHT_TOLERANCE.basis,
        };
      }
    }
  }

  return out;
}

function evaluate(rule, value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return { status: 'not-evaluated' };
  }
  const t = rule.threshold;
  if (typeof t === 'string') return { status: 'not-evaluated', reason: 'threshold is a formula' };
  switch (rule.compare) {
    case 'lte': return { status: value <= t ? 'pass' : 'fail' };
    case 'gte': return { status: value >= t ? 'pass' : 'fail' };
    case 'lt': return { status: value < t ? 'pass' : 'fail' };
    case 'gt': return { status: value > t ? 'pass' : 'fail' };
    case 'between':
      return { status: value >= t[0] && value <= t[1] ? 'pass' : 'fail' };
    default: return { status: 'not-evaluated', reason: `unknown comparator ${rule.compare}` };
  }
}

function thresholdText(rule) {
  const t = rule.threshold;
  if (Array.isArray(t)) return `${t[0]}–${t[1]} ${rule.unit}`;
  if (typeof t === 'string') return t.replace('formula:', '');
  const op = { lte: '≤', gte: '≥', lt: '<', gt: '>' }[rule.compare] || '';
  return `${op} ${t} ${rule.unit}`;
}

/**
 * Run the catalogue for one process family against measured geometry.
 *
 * @param {object} geo   measured geometry (the engine's analyze() output)
 * @param {string} process  key of PROCESS_FAMILIES
 * @returns {{process, processName, findings, passed, notEvaluated, coveragePct, score}}
 */
export function runDfmRules(geo, process, opts = {}) {
  const { material, overrides } = opts;
  if (!PROCESS_FAMILIES[process]) {
    throw new Error(`Unknown process family: ${process}`);
  }
  // MATERIAL REACHES THE MEASUREMENT, not only the threshold.
  //
  // Until the Boljanovic limits arrived, the alloy was needed only to pick a
  // threshold, so it was never handed to extractMeasures. The forming rules
  // invert that: the requirement itself is a function of the material — R_min =
  // c*T, d_min/T = 2.8*UTS/sigma_pd — so the MEASURE cannot be computed without
  // it, and every one of them abstained silently while the measure map held the
  // right answer.
  // EVERY option, forwarded. This call used to name its arguments one by one,
  // and twice now a new option has been added to the signature and silently
  // dropped here: first `material`, which left every alloy-specific measure
  // abstaining while the table held the answer, and then the two NADCA declared
  // inputs. Spreading the object means a new option cannot be forgotten.
  const measures = extractMeasures(geo, opts);
  // A workspace can DISABLE a rule as well as retune it. A disabled rule is
  // removed from the denominator too — leaving it in as "not evaluated" would
  // drag the coverage figure down for a check the plant deliberately does not
  // run, and coverage is supposed to mean "what could not be measured".
  const rules = DFM_RULES.filter(
    r => r.process === process && overrides?.[r.id]?.enabled !== false);
  // The alloy decides the threshold on the rules where it matters. When it is
  // not known the process-generic band is used and every finding says so —
  // "1.0-3.5 mm for die casting generally" is a different claim from
  // "1.5-4.0 mm for this aluminium", and presenting them identically is how a
  // generic report passes itself off as a specific one.
  const materialFamily = material ? MATERIALS[material]?.family : undefined;

  const findings = [];
  const passed = [];
  const notEvaluated = [];

  for (const rule of rules) {
    // A draft rule names the angle it means; everything else reads a flat measure.
    // A draft rule names the angle it means and reads that point off the curve.
    // When the curve is absent — an analysis stored before it existed — the
    // legacy `wallAreaBelowMinDraftPct` IS the 1-degree point and nothing else,
    // so it substitutes for exactly that angle and for no other. Using it for a
    // rule that asked about 5 degrees would be the original bug wearing a
    // fallback, so the rule abstains instead.
    // NAME THE CUTOFF IN THE UNIT. "Wall area below the minimum draft" is not
    // one quantity — it is a curve, and each process reads it at its own angle.
    // A forging report printed 64.07% from the rule (5 deg) on page 1 and 56.39%
    // from the geometry panel (1 deg) on page 2 under the SAME words, eight
    // points apart with nothing on either page to reconcile them. The angle is
    // the difference, so the angle travels with the number everywhere it goes.
    // ── THE CUTOFF NADCA COMPUTES, WHERE IT CAN COMPUTE ONE ────────────────
    //
    // The published flat angle stays the fallback, and this is deliberate. An
    // earlier draft of this change moved the rule onto a NADCA-only measure and
    // every part analysed WITHOUT an alloy lost its draft finding entirely —
    // trading a slightly wrong answer for no answer at all. So the rule keeps
    // its own figure and NADCA sharpens it: the formula needs a material and a
    // depth, and where both are present the requirement it returns replaces the
    // constant. Where either is missing the rule runs exactly as it always did.
    // NADCA MAY ONLY SHARPEN THE RULE, NEVER SOFTEN IT.
    //
    // The formula takes L as the depth of the FEATURE, and the deepest thing we
    // can measure without per-feature depths is the part's own extent along the
    // draw. That is an upper bound on any feature's depth, and the required
    // angle FALLS as depth rises — so computing at the part depth returns the
    // LEAST draft the part could possibly need. On a 133 mm bracket it returned
    // 0.42 degrees against the 1 degree we published, which would have made the
    // rule quietly more permissive in the name of being more accurate.
    //
    // So the two are combined by taking whichever is more demanding. Where the
    // part is shallow the formula wins and the rule tightens, which is the
    // whole point — a 6 mm pocket needs 1.96 degrees. Where the part is deep the
    // published figure holds the line until per-feature depths exist to compute
    // against. Either way the check is at least as strict as it was.
    const nadca = measures._nadcaDraft;
    const nadcaCut = nadca?.outsideDeg != null ? Math.round(nadca.outsideDeg * 100) / 100 : null;
    // ONLY on the families NADCA speaks for. The formula is die casting's —
    // metal injected against an ejector die — and until ISO 8062-4 arrived it
    // quietly sharpened sand and investment rules too, putting a die-casting
    // citation on a rammed mould. Squeeze and semi-solid stay: they fill a
    // die-casting die and eject from it, which is what the constants model.
    const NADCA_DRAFT_FAMILIES = new Set(['hpdc', 'hpdc-zinc', 'squeeze-casting', 'semi-solid']);
    const cutoffFromNadca = rule.measure === 'wallAreaBelowDraftPct'
      && NADCA_DRAFT_FAMILIES.has(rule.process)
      && nadcaCut != null && nadcaCut > (rule.draftCutoffDeg ?? 0);
    // DuPont Table 3.01 REPLACES the moulding draft angle for the resins it
    // names — not sharpen-only, because the table is depth-banded the safe
    // way round (deeper draw asks MORE, and the part extent is an upper
    // bound on feature depth) and the printed ranges are already judged at
    // their conservative top. Zytel genuinely needs less than the generic
    // angle, and the primary source saying so is the point of holding it.
    const dupontDraft = measures._resinDraft;
    const cutoffFromResin = rule.process === 'injection-moulding'
      && rule.measure === 'wallAreaBelowDraftPct'
      && dupontDraft?.requiredDeg != null;
    // ISO 8062-4 Tables 4-8 SHARPEN the casting families' draft cutoffs the
    // same way NADCA sharpens die casting: the table angle at the part's own
    // draw extent replaces the published constant only where it is STRICTER.
    const isoDraft = measures._iso8062Draft?.[rule.process];
    const cutoffFromIso = rule.measure === 'wallAreaBelowDraftPct'
      && isoDraft?.requiredDeg != null
      && isoDraft.requiredDeg > (rule.draftCutoffDeg ?? 0);
    const cutoff = rule.measure === 'wallAreaBelowDraftPct'
      ? (cutoffFromResin ? dupontDraft.requiredDeg
        : cutoffFromIso ? isoDraft.requiredDeg
          : cutoffFromNadca ? nadcaCut : rule.draftCutoffDeg)
      : rule.measure === 'overhangAreaBelowDeg' ? rule.overhangCutoffDeg
        : null;
    const unit = cutoff != null && rule.unit?.startsWith('%')
      ? `% of wall under ${cutoff}°`
      : rule.unit;

    let value;
    if (rule.measure === 'overhangAreaBelowDeg') {
      value = numberOr(measures._overhangCurve?.[String(rule.overhangCutoffDeg)]);
    } else if (rule.measure === 'wallAreaBelowDraftPct') {
      // A computed cutoff is rarely one of the seven angles the curve carries,
      // so it is read off the per-degree histogram instead. The curve remains
      // the path for the published constants, which ARE curve points.
      value = cutoffFromResin
        ? numberOr(measures.resinDraftAreaPct)
        : cutoffFromIso
          ? numberOr(isoDraft.wallAreaBelowRequiredPct)
          : cutoffFromNadca
            ? numberOr(measures.nadcaWallAreaBelowDraftPct)
            : numberOr(measures._draftCurve?.[String(rule.draftCutoffDeg)]);
      // The generic-angle fallbacks must not run under a computed DuPont
      // cutoff: the unit names the angle, and an area measured at the
      // generic angle under a resin-specific label would be the two-numbers-
      // one-caption bug again. Under DuPont, no histogram means abstain.
      if (value === undefined && !cutoffFromResin) value = numberOr(measures._draftCurve?.[String(rule.draftCutoffDeg)]);
      if (value === undefined && !cutoffFromResin && rule.draftCutoffDeg === 1.0) {
        value = measures.wallAreaBelowMinDraftPct;
      }
    } else {
      value = measures[rule.measure];
    }

    const picked = resolveThreshold(rule, material, materialFamily, overrides?.[rule.id]);

    // For a cored hole the threshold IS the angle, so the NADCA requirement
    // replaces it rather than the cutoff. The requirement is computed at the
    // worst bore's OWN depth, which is why a flat figure could only ever be
    // right at one bore size. A company override still wins: `picked.basis`
    // says so, and a plant that has set its own number has out-ranked both.
    // Same rule for a cored hole, and here the depth IS per-feature — it comes
    // from the bore's own measured wall area and radius — so the formula is on
    // firmer ground. It still may only tighten: a published figure that is
    // stricter than the computed one is a plant's accumulated experience, and
    // this is not the place to overrule it.
    const bore = measures._nadcaCoredHole;
    const nadcaThreshold = rule.measure === 'coredHoleDraftPerSideDeg'
      && bore?.requiredDeg > 0 && picked.basis !== 'customer-standard'
      && bore.requiredDeg > picked.threshold
      ? bore.requiredDeg : null;

    // Same sharpen-only contract for the SFSA Fig. 1 curve: on a long steel
    // sand casting the minimum section grows with the run the metal must make,
    // and the computed requirement may only TIGHTEN the published floor.
    const sfsaSection = measures._sfsaMinSection;
    const sfsaThreshold = rule.id === 'sand-min-section'
      && sfsaSection?.requiredMm > 0 && picked.basis !== 'customer-standard'
      && sfsaSection.requiredMm > picked.threshold
      ? sfsaSection.requiredMm : null;

    const effective = {
      ...rule,
      threshold: sfsaThreshold ?? nadcaThreshold ?? picked.threshold,
      unit,
    };
    const { status, reason } = evaluate(effective, value);
    const row = {
      id: rule.id,
      title: rule.title,
      severity: rule.severity,
      measure: rule.measure,
      measured: value,
      unit,
      /** The angle this rule read the draft curve at, when it read one. */
      measuredAtDeg: cutoff ?? undefined,
      threshold: effective.threshold,
      thresholdText: thresholdText(effective),
      // WHERE A COMPUTED LIMIT REPLACED A PUBLISHED ONE. Without this the
      // report prints the NADCA figure under the flat rule's citation, which
      // is the same class of fault as a title quoting a threshold the rule did
      // not use.
      computedThreshold: (nadcaThreshold != null || cutoffFromNadca)
        ? (nadcaThreshold != null ? bore.basis : nadca.basis)
        : undefined,
      rationale: rule.rationale,
      fix: rule.fix,
      source: picked.source,
      sourceStatus: picked.sourceStatus ?? rule.sourceStatus,
      // WHICH material this threshold was tuned to, or that it was not tuned at
      // all. The report prints this beside the finding.
      thresholdBasis: picked.basis,
      thresholdMatchedOn: picked.matchedOn,
      // A FEASIBILITY GATE, not a quality finding. Most rules answer "how good
      // is this part for the process"; a few answer "can the process make this
      // part at all". Centrifugal casting spins the mould, so a part that is not
      // a body of revolution is not a low score — it is not a route. Without
      // this flag the impossible option sat in a cheapest-first table at EUR
      // 7.77, below the route the user had actually chosen.
      blocking: rule.blocking === true,
      // The alloy that WAS in play, independently of whether this rule had a
      // band for it. Without it the report cannot tell "no material was given"
      // apart from "this rule is alloy-independent", and it used to assert the
      // first on reports whose cover named the second.
      thresholdMaterial: material ?? null,
      // Where the MEASURED side of a tolerance comparison came from. Only set on
      // the rules that read it, so no other finding carries a stray claim.
      measuredBasis: rule.measure === 'tightestToleranceMm' ? measures._toleranceBasis
        : rule.measure === 'nadca402ToleranceMargin' ? measures._nadca402Tolerance?.basis
          : rule.measure === 'nadca402FlatnessMargin' ? measures._nadca402Flatness?.basis
            : rule.measure === 'sfsaSandToleranceMargin' ? measures._sfsaSandTolerance?.basis
              : rule.measure === 'sfsaInvToleranceMargin' ? measures._sfsaInvTolerance?.basis
                : rule.measure === 'sfsaSandFlatnessMargin' ? measures._sfsaSandFlatness?.basis
                  : rule.measure === 'sfsaInvFlatnessMargin' ? measures._sfsaInvFlatness?.basis
                    : rule.measure === 'sfsaMachiningStockMargin' ? measures._sfsaRma?.basis
                      : rule.measure === 'resinFilletMargin' ? measures._resinFillet?.basis
                        : rule.measure === 'dupontBossOdToHole' ? measures._dupontBoss?.basis
                          : rule.measure === 'iso8062PmToleranceMargin' ? measures._iso8062PmTolerance?.basis
                            : rule.measure === 'din16742ToleranceMargin' ? measures._din16742Tolerance?.basis
                              : rule.measure === 'din16742RmToleranceMargin' ? measures._din16742RmTolerance?.basis
                                : cutoffFromResin ? measures._resinDraft?.basis
                                  : cutoffFromIso ? isoDraft?.basis
                                    : undefined,
      status,
    };
    // The specific features that break this rule, worst first. Only the ones
    // that actually fail — listing every hole under a "hole too deep" finding
    // would bury the two that are wrong among the twenty that are fine.
    const all = measures._instances?.[rule.measure];
    if (Array.isArray(all) && all.length) {
      const offenders = all.filter(inst => evaluate(effective, inst.ratio).status === 'fail');
      if (offenders.length) row.instances = offenders.slice(0, 12);
      row.instanceCount = offenders.length;
      row.instanceTotal = all.length;
    }
    if (status === 'fail') findings.push(row);
    else if (status === 'pass') passed.push(row);
    // fallthrough below adds the not-evaluated row
    else {
      notEvaluated.push({
        ...row,
        reason: reason || `no measurement available for "${rule.measure}" on this geometry`,
      });
    }
  }

  findings.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));

  // A blocked route must not be presented as a route. It keeps its findings and
  // its score — hiding them would leave the reader wondering what was wrong —
  // but everything downstream can now say NOT VIABLE instead of a number that
  // invites a comparison the geometry has already settled.
  const blockers = findings.filter(f => f.blocking);

  const evaluated = findings.length + passed.length;
  const coveragePct = rules.length ? Math.round((evaluated / rules.length) * 1000) / 10 : 0;

  return {
    process,
    processName: PROCESS_FAMILIES[process],
    findings,
    passed,
    notEvaluated,
    ruleCount: rules.length,
    // Named, because a report that silently runs 60 of 69 rules looks identical
    // to one that ran them all and found nothing.
    disabledRuleIds: DFM_RULES
      .filter(r => r.process === process && overrides?.[r.id]?.enabled === false)
      .map(r => r.id),
    evaluatedCount: evaluated,
    coveragePct,
    blockers,
    blockedReason: blockers.length
      ? `${blockers[0].title} — ${blockers[0].fix}`
      : null,
    // A score over rules nobody could evaluate would be meaningless, so it is
    // computed over the EVALUATED rules only and carries its own coverage.
    score: scoreOf(findings, evaluated, [...findings, ...passed]),
  };
}

/**
 * Deterministic manufacturability score, 0-100, over evaluated rules only.
 *
 * This supersedes the LLM's 1-10 `dfmaScore` guess on the CAD → Cost page. It is
 * arithmetic: each failed rule costs weight by severity. `null` when nothing
 * could be evaluated — a score of 100 on zero checks would be a lie.
 *
 * NORMALISED BY WHAT THE EVALUATED RULES COULD HAVE COST, which the flat
 * `100 - Σpenalty` form was not. That form has no denominator, so how badly a
 * route can score depends on how many rules its family happens to contain: a
 * 12-rule family can shed 99 points while a 3-rule family can shed at most 75,
 * and a family with one evaluated rule at most 25. The routes table ranks on
 * this number, and on a real bracket it printed the chosen die-casting route at
 * 1/100 over 8 of 12 rules beside Turning at 100/100 over 3 of 5 — inviting a
 * reader to compare a thorough check against a shallow one as though they were
 * the same measurement. Dividing by the penalty the evaluated rules COULD have
 * inflicted makes the number a fraction of what was actually checked, so no
 * family wins by owning fewer rules.
 *
 * @param {object[]} findings   the failed rules
 * @param {number} evaluatedCount  how many rules produced a verdict
 * @param {object[]} [evaluatedRules]  every rule that produced a verdict, failed
 *   or passed. Omitted, the function falls back to the un-normalised form so an
 *   older caller keeps working rather than dividing by zero.
 */
export function scoreOf(findings, evaluatedCount, evaluatedRules = null) {
  if (!evaluatedCount) return null;
  const WEIGHT = { high: 25, medium: 12, low: 5 };
  const weigh = list => list.reduce((s, f) => s + (WEIGHT[f.severity] || 5), 0);
  const penalty = weigh(findings);
  const worstCase = Array.isArray(evaluatedRules) && evaluatedRules.length
    ? weigh(evaluatedRules)
    : 100;
  if (!(worstCase > 0)) return null;
  return Math.max(0, Math.min(100, Math.round(100 * (1 - penalty / worstCase))));
}

/** Run every process family — used when the process is not yet decided. */
export function runAllDfmRules(geo, opts) {
  return Object.keys(PROCESS_FAMILIES).map(p => runDfmRules(geo, p, opts));
}

const numberOr = v => (Number.isFinite(Number(v)) ? Number(v) : undefined);

/** The object, or undefined when every list in it is empty. */
function nonEmpty(obj) {
  const kept = Object.fromEntries(Object.entries(obj).filter(([, v]) => v?.length));
  return Object.keys(kept).length ? kept : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// What the GEOMETRY says the process is.
//
// This exists because a live report got it exactly backwards. A 1.6 mm seat
// cross member was measured as folded sheet — 38 recognised bends, wall p50
// 1.60 mm, uniform — and the report still opened with "no manufacturing process
// was specified, so EVERY rule family was run speculatively" and then listed
// machining findings against it. The tool knew better than the report it wrote.
//
// This is an INFERENCE from measurements, not a substitute for the user telling
// us. It never overrides an explicit or cost-derived family; it corroborates one
// and it CONTRADICTS one, loudly, when the geometry disagrees. Where the
// evidence is thin it says `null` rather than picking the likeliest — the same
// three-state discipline the rules themselves follow.
// ─────────────────────────────────────────────────────────────────────────────

/** Uniform wall at or below this reads as sheet, not as a cast section. */
const SHEET_MAX_WALL_MM = 6.0;
/** Wall spread (p95/p50 - 1) below this is a constant-section part. */
const UNIFORM_SPREAD_MAX = 0.35;
/**
 * Tapered wall area that says the part was designed to leave a tool. Draft costs
 * a designer nothing but tool release, so a quarter of the wall being tapered is
 * a deliberate act; a machined block has no reason for any. Both this and the
 * undercut ceiling are judgement, not a standard — which is why the measured
 * percentages are published in `evidence` for the reader to weigh.
 */
const TOOLED_RELEASING_MIN_PCT = 25;
// The same bar the centrifugal and metal-spinning rules use for "is this a body
// of revolution". Three uses of one geometric judgement, one number.
const BODY_OF_REVOLUTION_MIN_PCT = 90;
// Which tooled family a material implies, once the DRAFT has already said the
// part leaves a tool. Wall thickness separates the die from the sand where the
// material alone cannot: aluminium at 2 mm is a die casting and at 12 mm is a
// gravity or sand one. Entirely derived from the cost model's own family tags —
// nothing here re-declares a material.
const TOOLED_BY_MATERIAL = {
  plastic: 'injection-moulding',
  elastomer: 'rubber-moulding',
  zinc: 'hpdc-zinc',
  magnesium: 'hpdc',
  composite: 'composite-rtm',
  aluminium: p50 => (p50 <= 4 ? 'hpdc' : p50 <= 8 ? 'gravity-die' : 'sand-casting'),
  // Iron and steel are not die cast. The wall separates a permanent-mould-class
  // route from a sand one, and below the sand minimum it is investment.
  castiron: p50 => (p50 >= 5 ? 'sand-casting' : 'investment-casting'),
  ferrous: p50 => (p50 >= 5 ? 'sand-casting' : 'investment-casting'),
  copper: p50 => (p50 <= 8 ? 'gravity-die' : 'sand-casting'),
  titanium: 'investment-casting',
};
const TOOLED_UNDERCUT_MAX_PCT = 15;

/**
 * @returns {{family: string|null, confidence: 'measured'|'indicative'|null,
 *            evidence: string[], notes: string[]}}
 */
export function inferProcessFamily(geo = {}, { material } = {}) {
  const dfm = geo.dfm || {};
  const wall = dfm.wallThickness || geo.wallThickness || {};
  const sm = dfm.sheetMetal || {};
  const draft = dfm.draft || geo.draftAnalysis || {};
  const evidence = [], notes = [];
  const p50 = Number(wall.p50Mm);
  const p95 = Number(wall.p95Mm);
  const spread = Number.isFinite(p50) && p50 > 0 && Number.isFinite(p95)
    ? p95 / p50 - 1 : undefined;

  // 1. Folded sheet. Bend recognition pairs coaxial cylinders and derives the
  //    thickness as (outer radius - inner radius); it is only trusted when that
  //    derived thickness AGREES with the independently ray-cast wall, so
  //    isSheetMetal is already a two-measurement result.
  if (sm.isSheetMetal && sm.bendCount > 0) {
    evidence.push(`${sm.bendCount} bends recognised, sheet thickness ${sm.thicknessMm} mm`);
    if (Number.isFinite(p50)) evidence.push(`wall p50 ${p50} mm, ${wall.uniformity ?? 'uniformity unknown'}`);
    return { family: 'sheet-metal', confidence: 'measured', evidence, notes };
  }
  if (sm.reason) notes.push(sm.reason);

  // 2. A BODY OF REVOLUTION is turned. Measured, not guessed: the axisymmetry
  //    pass scores the share of surface compatible with revolution about the
  //    best available axis, and the bar is the same 90% the centrifugal and
  //    spinning rules use. This alone took the inference from 0 of 10 to 10 of
  //    10 on turned shafts, which it had previously been silent on.
  const axi = Number((dfm.revolution || {}).axisymmetricAreaPct);
  if (Number.isFinite(axi) && axi >= BODY_OF_REVOLUTION_MIN_PCT) {
    evidence.push(`${axi}% of the surface is a body of revolution about [${((dfm.revolution || {}).axisXYZ || []).join(', ')}]`);
    notes.push('A round part can also be spun, centrifugally cast or cold-formed; turning is the most common route and the one assumed here.');
    return { family: 'turning', confidence: 'measured', evidence, notes };
  }

  // 3. Cast or moulded. The discriminator is DRAFT: a part built to leave a
  //    tool has it and a machined part does not. Which of casting and moulding
  //    is not a geometric question — aluminium and polypropylene make the same
  //    shape — so this stops at "tooled" and says so.
  const releasing = Number(draft.areaPct?.releasing);
  const undercut = Number(draft.areaPct?.undercut);
  const drafted = Number.isFinite(releasing) && releasing >= TOOLED_RELEASING_MIN_PCT
    && Number.isFinite(undercut) && undercut <= TOOLED_UNDERCUT_MAX_PCT;
  // THE WALL TEST USED TO BE PART OF THIS, AND IT EXCLUDED THE THIN-WALL
  // CASTINGS AND MOULDINGS ENTIRELY. Requiring p50 > 6 mm to call a part
  // "tooled" meant a 2.5 mm die casting — which is what most die castings are —
  // could never be inferred, and that is a large share of why this scored 0 of
  // 10 on every casting and moulding in the commodity sweep. The wall was doing
  // a job the sheet-metal branch above already does: a folded sheet returns
  // before reaching here, so anything still in play with releasing draft and no
  // undercut is tooled whatever its wall. The wall now only chooses WHICH
  // tooled family, which is the question it can actually answer.
  if (drafted) {
    evidence.push(`${releasing}% of wall area is tapered and releases along the best draw direction; ${undercut}% is undercut`);
    evidence.push(`wall p50 ${p50} mm`);
    // GEOMETRY SAYS TOOLED; THE MATERIAL SAYS WHICH TOOL. This used to stop at
    // "tooled" and return null, which is why the inference scored 0 of 10 on
    // every casting and moulding in the commodity sweep — it had the harder
    // half of the answer and threw it away for want of the easy half. The
    // caller knows the material; aluminium and polypropylene do not make the
    // same part by the same route, and the wall then separates the die from the
    // sand.
    const fam = material ? MATERIALS[material]?.family : undefined;
    const tooled = TOOLED_BY_MATERIAL[fam];
    if (tooled) {
      const family = typeof tooled === 'function' ? tooled(p50) : tooled;
      evidence.push(`${material} is ${fam}, and at a ${p50} mm wall that is ${PROCESS_FAMILIES[family] ?? family}`);
      return { family, confidence: 'indicative', evidence, notes };
    }
    notes.push(material
      ? `Draft says the part leaves a tool, but ${material} does not map to one tooled family on wall thickness alone. Pick the family.`
      : 'Draft says the part leaves a tool, but geometry cannot tell a die casting from an injection moulding — the material does. Choose a material, or pick the family.');
    return { family: null, confidence: 'indicative', evidence, notes };
  }

  // 4. Machined. Asserted only from POSITIVE evidence — a constant section with
  //    prismatic features and no draft — never as the leftover bucket. "Nothing
  //    else matched" is not a measurement.
  const feats = dfm.features?.counts || {};
  const prismatic = (feats.pocket || 0) + (feats.slot || 0) + (feats.step || 0);
  const bores = (feats['through-hole'] || 0) + (feats['blind-hole'] || 0)
    + (feats['counterbored-hole'] || 0) + (feats['countersunk-hole'] || 0);
  if (Number.isFinite(spread) && spread <= UNIFORM_SPREAD_MAX
      && !drafted && (prismatic + bores) > 0) {
    evidence.push(`wall spread p95/p50 = ${(spread + 1).toFixed(2)}, no releasing draft`);
    evidence.push(`${prismatic} prismatic feature${prismatic === 1 ? '' : 's'}, ${bores} bore${bores === 1 ? '' : 's'}`);
    return { family: 'machining', confidence: 'indicative', evidence, notes };
  }

  notes.push('The measured geometry does not point clearly at one process family.');
  return { family: null, confidence: null, evidence, notes };
}

/**
 * Compare what the user (or the costing process) said against what the geometry
 * measures. Returns null when they agree or when there is nothing to compare.
 */
export function processFamilyConflict(chosen, inferred) {
  if (!chosen || !inferred?.family || chosen === inferred.family) return null;
  if (inferred.confidence !== 'measured') return null;   // only contradict on measurement
  return {
    chosen,
    measured: inferred.family,
    chosenName: PROCESS_FAMILIES[chosen] || chosen,
    measuredName: PROCESS_FAMILIES[inferred.family] || inferred.family,
    evidence: inferred.evidence,
  };
}
