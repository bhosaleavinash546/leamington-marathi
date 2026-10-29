/**
 * Route feasibility — which manufacturing routes can make THIS measured part in ITS material (compare-routes review,
 * Oct 2026, docs/cad/compare-routes-review-2026-10.md).
 *
 * Before this screen the comparison offered a static list: an aluminium battery rail was priced as a polymer extrusion
 * and as rubber, a CFRP roof panel as an ABS thermoforming at £11, a cast-iron stub axle "as cast" against its own
 * machined cost. A comparison is only worth reading when every row is a route that could actually make the part, in the
 * same material, to the same finished scope. So:
 *
 *   1. SAME MATERIAL FAMILY. A route must process the family the part is costed in (the engine's own table,
 *      `COMMODITY_FAMILIES` + rubber / composite). A change of material is a design change, not a route — it is not
 *      compared here, and the screen says so.
 *   2. THE SHAPE. A closed container cannot come out of a one-piece open tool (machined, forged, moulded, pressed); a
 *      blow or rotational moulding is hollow by construction; an extrusion is a constant section; a pressing is one
 *      sheet gauge; a forging has a minimum web; machining from solid buys a stocked plate or bar.
 *   3. THE EQUIPMENT IN THE RATE BOOK. A forging whose die-fill force exceeds the largest press in the library is not
 *      costed on that press as if it fitted.
 *   4. LIKE FOR LIKE. An as-cast part with machined bores is not the finished part — it is compared as cast + machine.
 *
 * Every limit states its source. Where the source is a design guide or a handbook rather than a measurement it is
 * labelled engineering-typical: a limit a cost engineer can argue with, never a hidden one.
 */
import type { OCCTGeometry } from '../../server/utils/geometry-bridge.js';
import type { RateLibrary } from './types.js';
import type { MaterialFamily } from './material-family.js';
import type { RuleContext } from './cost-input-rules/types.js';
import { COMMODITY_FAMILIES, DENSITY_KG_PER_CM3, representativeMaterialId } from './cost-input-rules/derive/material.js';
import { enclosedShell, cavityShell } from './cost-input-rules/derive/hollow.js';
import { extrusionProfile } from './cost-input-rules/derive/profile.js';
import { looksLikeGear } from './cost-input-rules/derive/commodity.js';
import { forgingAlloyForGrade } from './cost-input-rules/derive/grade.js';
import { flashGeometry } from './cost-input-rules/commodities/forging.js';
import { MIN_UTILISATION } from './cost-input-rules/commodities/machining.js';
import { estimateForgingTonnage } from './modules/forging-advisor.js';
import { FORGE_PRESS_TIERS } from './machine-sizing.js';
import { stockSize } from './machining-time.js';

/** The material families a route is compared within. Rubber and composites buy a compound or a laminate, not a metal. */
export type RouteFamily = MaterialFamily | 'rubber' | 'composite';

export const ROUTE_FAMILIES: Record<string, RouteFamily[]> = {
  ...(COMMODITY_FAMILIES as Record<string, RouteFamily[]>),
  rubber: ['rubber'],
  composites: ['composite'],
  // A gear is cut from bar or a blank: the grades the gear form offers (material-scope.ts).
  gear: ['steel', 'cast iron', 'copper alloy', 'plastic'],
};

/** Every route with a deterministic rule pack, in the order the comparison lists them (metals, plastics, the rest). */
export const COMPARABLE_ROUTES = [
  'forging', 'casting', 'cast_and_machine', 'machining', 'sheet_metal', 'sheet_metal_fab', 'aluminium_extrusion', 'gear',
  'injection_moulding', 'thermoforming', 'blow_moulding', 'rotational_moulding', 'extrusion',
  'rubber', 'composites',
] as const;

export interface FeasibilityCheck {
  id: string;
  /** What was checked, e.g. "Material family". */
  label: string;
  /** What the part measures, as text. */
  measured: string;
  /** The limit it was held to, as text. */
  limit: string;
  pass: boolean;
  /** Where the limit comes from. */
  source: string;
}

export interface RouteScreen {
  route: string;
  /** The costing's own route is never refused (the engineer chose it); its failing checks become caveats. */
  feasible: boolean;
  checks: FeasibilityCheck[];
  /** Passing-with-a-warning notes the row should carry (e.g. undercuts machined after forging). */
  caveats: string[];
}

// ─── Sources ────────────────────────────────────────────────────────────────────────────────────────────────────────

const SRC = {
  families: 'CostVision material scope — the grades each route buys (src/engine/material-scope.ts, COMMODITY_FAMILIES)',
  closedTool: 'a one-piece tool or die cannot form a closed cavity; a cored casting needs a core print through an opening '
    + '(Boothroyd, Dewhurst & Knight, Product Design for Manufacture and Assembly, shape-capability tables)',
  hollow: 'blow and rotational moulding form a hollow body by construction (CostVision route table, derive/commodity.ts)',
  profile: 'CostVision constant-section test: volume = silhouette × length within 10%, length ≥ 8 × the section '
    + '(derive/profile.ts, shared with the extrusion and rubber routes)',
  gauge: 'cold pressings are made from sheet up to ~6 mm; one gauge throughout, the mean wall within 2× the gauge '
    + '(CostVision routing rule, derive/commodity.ts GAUGE_WALL_TOLERANCE; 6 mm engineering-typical)',
  forgeWeb: 'closed-die forging minimum section ~3 mm (Roymech manufacturing process comparison table; engineering-typical)',
  forgePress: 'die-fill force = shape factor × hot flow stress × (plan + flash land) × 1.2 safety, against the largest '
    + 'forge press in the rate book (forging-advisor.ts estimateForgingTonnage, machine-sizing.ts FORGE_PRESS_TIERS)',
  castWall: 'minimum castable wall ~1.5 mm (aluminium HPDC design guides: thin walls 1.5–2.5 mm; sand and gravity need '
    + '3 mm or more — the lowest floor across the processes the casting rules choose from; engineering-typical)',
  asCast: 'an as-cast part with holes or bores is not the finished part; the finished scope is cast + machine '
    + '(CostVision like-for-like rule)',
  stock: `machining from solid buys the next stocked plate or bar; below ${(MIN_UTILISATION * 100).toFixed(0)}% utilisation `
    + 'the rules clamp the stock and the cost would be understated (machining.ts MIN_UTILISATION, machining-time.ts stockSize)',
  mouldWall: 'injection moulding wall 0.5–6 mm (design guides: typical 1–5 mm, thin-wall to 0.5 mm; above ~6 mm sink '
    + 'marks and a cooling time that grows with the square of the wall; engineering-typical)',
  tfSheet: 'thermoforming sheet 0.25–12 mm (thin-gauge roll stock to ~2.5 mm, heavy-gauge cut sheet to ~12 mm; '
    + 'engineering-typical)',
  tfDraw: 'depth of draw up to ~1× the smaller plan dimension with plug assist (engineering-typical)',
  bmWall: 'extrusion blow moulding wall 0.3–6 mm (engineering-typical)',
  rotoWall: 'rotational moulding wall 2–20 mm (engineering-typical; a thinner wall does not sinter evenly, a thicker '
    + 'one cycles for hours)',
  gear: 'a gear route needs measured teeth (kernel tip-circle metrology) or a gear named in the file',
  impactCup: 'a revolved cup up to Ø200 mm may be impact-extruded (CostVision route table, aluminium-extrusion build)',
  drawnCup: 'a revolved cup is deep-drawn from sheet (CostVision route table: pressed sheet metal is offered on a closed shell)',
  constantSection: 'a constant section many times longer than it is wide is extruded or cut from bar; a die, mould or '
    + 'pattern the length of the part is not how it is made (CostVision constant-section test, derive/profile.ts)',
  gearScope: 'teeth are cut on the gear route only; a forged, cast or machined blank costs no gear cutting '
    + '(CostVision like-for-like rule)',
  tfBosses: 'a formed sheet has no bosses, ribs or local thickness — a feature that stands off the wall needs a mould '
    + '(thermoforming design limits; engineering-typical)',
  thinShell: 'a thin shell (wall ≤ 4 mm at < 25% fill, ≥ 200 mm across) misruns as a sand or gravity casting and is '
    + 'not machined from solid; a near-solid part (> 60% fill) is not a sheet or moulded process (CostVision sanity '
    + 'checks 7 and 9, server/utils/cad-sanity.ts — the costing chain would refuse the route)',
  castWallFerrous: 'minimum castable wall ~3 mm for iron, steel, copper and nickel alloys (investment and shell '
    + 'castings reach ~3 mm; sand 5 mm or more; engineering-typical)',
};

// ─── Measured facts the checks read ─────────────────────────────────────────────────────────────────────────────────

interface Facts {
  volCm3: number; surfCm2: number; shellWallMm: number | null;
  bboxSorted: [number, number, number] | null;
  fill: number | null;
  gaugeMm: number | null; gaugeSource: string;
  meanWallMm: number | null;
  holes: number;
  sealed: boolean; closedContainer: boolean; hollowBody: boolean;
  planCm2: number | null;
  profile: ReturnType<typeof extrusionProfile>;
  turning: { fraction: number; maxDiaMm: number } | null;
  undercutRegions: number;
  bosses: number;
  /** The kernel's enclosure probe alone (a deep cup reads enclosed too). */
  enclosed: boolean;
  isGear: boolean;
}

function factsOf(geo: OCCTGeometry): Facts {
  const volCm3 = geo.volume?.cm3 ?? 0;
  const surfCm2 = geo.surfaceArea?.cm2 ?? 0;
  const shellWallMm = volCm3 > 0 && surfCm2 > 0 ? Math.round((2 * volCm3 / surfCm2) * 10 * 100) / 100 : null;
  const bb = geo.boundingBox;
  const bboxSorted = bb ? ([bb.xMm, bb.yMm, bb.zMm].sort((a, b) => b - a) as [number, number, number]) : null;
  const sm = geo.sheetMetal as { thicknessMm?: number; thicknessSource?: string; bendCount?: number } | undefined;
  const gaugeMm = sm?.thicknessMm && sm.thicknessMm > 0 ? sm.thicknessMm : shellWallMm;
  const gaugeSource = sm?.thicknessMm && sm.thicknessMm > 0
    ? (sm.thicknessSource === 'bend-pairs' ? 'bend-pair gauge' : '2·V/S') : '2·V/S';
  const holes = ((geo.featureTable ?? []) as Array<{ kind: string; count: number }>)
    .filter(r => r.kind === 'hole').reduce((s, r) => s + (r.count ?? 0), 0);
  const sealed = geo.topology?.enclosesSealedVoid === true;
  const cavity = cavityShell(geo);
  const p = geo.projectedArea;
  const sils = [p?.xMm2, p?.yMm2, p?.zMm2].filter((v): v is number => typeof v === 'number' && v > 0);
  const t = geo.turning as { fraction?: number; maxDiaMm?: number } | undefined;
  const d = geo.draftAnalysis as { undercutRegions?: unknown[] } | undefined;
  const enclosed = enclosedShell(geo);
  // The centre-ray probe alone also reads a deep cup, a finned heat sink and a tube as "closed" (≥ 90% of rays meet a
  // wall); a container the tool cannot leave also has faces whose release line runs into the part (cavity faces).
  const cavityFaces = (geo.draftAnalysis as { cavityFaceCount?: number } | undefined)?.cavityFaceCount ?? 0;
  return {
    volCm3, surfCm2, shellWallMm, bboxSorted,
    fill: geo.fillRatio ?? null,
    gaugeMm: gaugeMm ?? null, gaugeSource,
    meanWallMm: geo.wallThickness?.meanMm ?? null,
    holes, sealed,
    // A one-piece open tool cannot form any of these: a sealed void, faces into an enclosed cavity, or a shell the
    // kernel's centre-ray probe finds closed (≥ 90% of rays meet a wall).
    closedContainer: sealed || cavity || (enclosed && cavityFaces > 0),
    hollowBody: enclosed || cavity,
    planCm2: sils.length ? Math.max(...sils) / 100 : null,
    profile: extrusionProfile({ geo } as RuleContext),
    turning: t?.fraction != null && t.maxDiaMm != null ? { fraction: t.fraction, maxDiaMm: t.maxDiaMm } : null,
    undercutRegions: Array.isArray(d?.undercutRegions) ? d!.undercutRegions!.length : 0,
    bosses: (geo.features as { bossShaftCount?: number } | undefined)?.bossShaftCount ?? 0,
    enclosed,
    isGear: false,
  };
}

const mm = (v: number | null) => (v == null ? 'not measured' : `${v.toFixed(2)} mm`);

// ─── The material family of the costing ─────────────────────────────────────────────────────────────────────────────

/** The family a library category belongs to. */
export function familyOfCategory(category: string): RouteFamily | null {
  const c = category.toLowerCase();
  if (/rubber|elastomer/.test(c)) return 'rubber';
  if (/composite/.test(c)) return 'composite';
  if (/alumin/.test(c)) return 'aluminium';
  if (/magnes/.test(c)) return 'magnesium';
  if (/titan/.test(c)) return 'titanium';
  if (/zinc/.test(c)) return 'zinc';
  if (/nickel/.test(c)) return 'nickel alloy';
  if (/copper|brass|bronze/.test(c)) return 'copper alloy';
  if (/cast iron|graphite iron|ni-resist/.test(c)) return 'cast iron';
  if (/steel/.test(c)) return 'steel';
  if (/plastic|polymer|moulding|thermoform|^extrusion$|^paint$/.test(c)) return 'plastic';
  return null;
}

/**
 * The family the part is costed in, from whichever material answer the costed route took: the family question, an
 * aluminium alloy, a resin, a rubber compound, a laminate, or a grade (looked up in the book). Before this the
 * comparison read `material.family` only, so every route whose material question is not that one (aluminium
 * extrusion, every moulding, rubber, composites) had no family and was offered routes in other materials.
 */
export function materialFamilyOf(answers: Record<string, unknown>, book: Pick<RateLibrary, 'materials'>): { family: RouteFamily | null; basis: string } {
  const s = (k: string) => (typeof answers[k] === 'string' && (answers[k] as string).length ? answers[k] as string : null);
  const fam = s('material.family');
  if (fam) return { family: fam as RouteFamily, basis: `material family answered: ${fam}` };
  if (s('material.alAlloy')) return { family: 'aluminium', basis: `aluminium alloy answered: ${s('material.alAlloy')}` };
  if (s('material.elastomer')) return { family: 'rubber', basis: `rubber compound answered: ${s('material.elastomer')}` };
  if (s('material.laminate')) return { family: 'composite', basis: `laminate answered: ${s('material.laminate')}` };
  if (s('material.resin')) return { family: 'plastic', basis: `resin answered: ${s('material.resin')}` };
  const grade = s('material.grade');
  if (grade) {
    const cat = book.materials.find(m => m.id === grade)?.category ?? '';
    const f = familyOfCategory(cat);
    if (f) return { family: f, basis: `grade ${grade} (${cat})` };
  }
  return { family: null, basis: 'no material answered' };
}

// ─── The screen ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ScreenInput {
  geo: OCCTGeometry;
  filename: string;
  family: RouteFamily | null;
  annualVolume: number;
}

function check(id: string, label: string, measured: string, limit: string, pass: boolean, source: string): FeasibilityCheck {
  return { id, label, measured, limit, pass, source };
}

/** The largest forge press in the rate book, tonnes. */
export function largestForgePressTonnes(): number {
  return Math.max(...FORGE_PRESS_TIERS.map(([t]) => t));
}

/** Screen one route against the measured part. */
export function screenRoute(route: string, i: ScreenInput): RouteScreen {
  const f = factsOf(i.geo);
  const checks: FeasibilityCheck[] = [];
  const caveats: string[] = [];

  // 1. Same material family.
  const fams = ROUTE_FAMILIES[route];
  if (fams) {
    checks.push(check('material', 'Material family', i.family ?? 'not answered', fams.join(' / '),
      i.family == null || fams.includes(i.family), SRC.families));
  }

  // 2. A gear is a gear: no other route cuts its teeth.
  const gear = looksLikeGear(i.geo as { gear?: { likelyGear?: boolean; teeth?: number } }, i.filename);
  if (gear.gear && route !== 'gear') {
    checks.push(check('gear_scope', 'Finished scope', gear.basis, 'the gear route (teeth cut)', false, SRC.gearScope));
  }

  // 3. The shape.
  const oneTool = ['machining', 'forging', 'injection_moulding', 'thermoforming', 'sheet_metal', 'sheet_metal_fab',
    'extrusion', 'aluminium_extrusion', 'rubber', 'composites', 'gear'];
  const drawnCup = !!f.turning && f.turning.fraction >= 0.9 && f.enclosed && !f.sealed && !cavityShell(i.geo);
  if (oneTool.includes(route)) {
    const closedText = f.sealed ? 'a sealed internal void'
      : cavityShell(i.geo) ? 'faces open into an enclosed cavity (kernel draft pass)'
      : f.closedContainer ? 'a closed shell (kernel enclosure probe, faces into the cavity)' : 'an open shape';
    if (route === 'sheet_metal' && drawnCup) {
      checks.push(check('closed_container', 'Closed container', 'a revolved cup (closed shell, one turned axis)',
        'a drawn cup, or no closed cavity', true, SRC.drawnCup));
    } else {
      checks.push(check('closed_container', 'Closed container', closedText,
        'no closed cavity: the tool must come out', !f.closedContainer, SRC.closedTool));
    }
  }
  // The costing chain's own plausibility checks, applied here so the route is refused with its reason rather than
  // costed and then blocked.
  const maxDim = f.bboxSorted ? f.bboxSorted[0] : null;
  const bulkWall = f.meanWallMm ?? f.shellWallMm;
  if (['casting', 'cast_and_machine', 'forging', 'machining'].includes(route)) {
    const thin = bulkWall != null && bulkWall > 0 && bulkWall <= 4 && f.fill != null && f.fill < 0.25 && (maxDim == null || maxDim >= 200);
    checks.push(check('thin_shell', 'Thin shell', `${mm(bulkWall)} wall at ${f.fill == null ? '?' : (f.fill * 100).toFixed(0)}% fill, ${maxDim == null ? '?' : maxDim.toFixed(0)} mm across`,
      'not a thin shell (wall ≤ 4 mm, < 25% fill, ≥ 200 mm)', !thin, SRC.thinShell));
  }
  if (['sheet_metal', 'sheet_metal_fab', 'injection_moulding', 'thermoforming', 'blow_moulding', 'rotational_moulding'].includes(route)) {
    checks.push(check('near_solid', 'Near-solid part', `${f.fill == null ? '?' : (f.fill * 100).toFixed(0)}% fill`, '≤ 60% fill',
      f.fill == null || f.fill <= 0.6, SRC.thinShell));
  }
  const diesAndMoulds = ['casting', 'cast_and_machine', 'forging', 'injection_moulding', 'thermoforming', 'blow_moulding', 'rotational_moulding'];
  if (diesAndMoulds.includes(route) && f.profile) {
    checks.push(check('constant_section', 'Constant section', f.profile.basis, 'not a long constant section', false, SRC.constantSection));
  }
  if (route === 'casting' || route === 'cast_and_machine') {
    checks.push(check('sealed_void', 'Sealed void', f.sealed ? 'a sealed internal void' : 'no sealed void',
      'a core needs a print through an opening', !f.sealed, SRC.closedTool));
    const ferrous = i.family == null || !['aluminium', 'magnesium', 'zinc'].includes(i.family);
    const floor = ferrous ? 3 : 1.5;
    checks.push(check('cast_wall', 'Minimum wall', `${mm(f.shellWallMm)} (2·V/S)`, `≥ ${floor} mm (${ferrous ? 'iron / steel / copper / nickel' : 'light alloy, HPDC'})`,
      f.shellWallMm == null || f.shellWallMm >= floor, ferrous ? SRC.castWallFerrous : SRC.castWall));
  }
  if (route === 'casting') {
    checks.push(check('as_cast_scope', 'Finished scope', `${f.holes} hole(s) / bore(s) measured`,
      'as-cast only: no machined features', f.holes === 0, SRC.asCast));
  }
  if (route === 'forging') {
    checks.push(check('forge_web', 'Minimum section', `${mm(f.shellWallMm)} (2·V/S)`, '≥ 3 mm',
      f.shellWallMm == null || f.shellWallMm >= 3, SRC.forgeWeb));
    const repId = i.family && i.family !== 'rubber' && i.family !== 'composite'
      ? representativeMaterialId('forging', i.family as MaterialFamily) : null;
    const alloy = forgingAlloyForGrade(repId ?? null) ?? 'carbon-steel';
    if (f.planCm2 != null) {
      const tonnes = estimateForgingTonnage({
        projectedAreaCm2: f.planCm2 + flashGeometry(f.planCm2).landAreaCm2, alloyFamily: alloy, shapeComplexity: 'moderate',
      });
      const need = Math.round(tonnes * 1.2);
      const max = largestForgePressTonnes();
      checks.push(check('forge_press', 'Forge press', `${need.toLocaleString('en-GB')} t needed (${f.planCm2.toFixed(0)} cm² plan, ${alloy})`,
        `≤ ${max.toLocaleString('en-GB')} t, the largest press in the rate book`, need <= max, SRC.forgePress));
    }
    if (f.undercutRegions > 0) {
      caveats.push(`${f.undercutRegions} undercut region(s) on the best pull: a forging die has no slides, so they are machined after forging`);
    }
  }
  if (route === 'machining') {
    if (f.bboxSorted && f.bboxSorted[2] > 0 && i.family && DENSITY_KG_PER_CM3[i.family as MaterialFamily]) {
      const turned = f.turning && f.turning.fraction >= 0.6 && f.bboxSorted
        ? { maxDiaMm: f.turning.maxDiaMm, lengthMm: f.bboxSorted[0] } : null;
      const st = stockSize(f.bboxSorted, turned);
      const util = st.cm3 > 0 ? f.volCm3 / st.cm3 : 0;
      const density = DENSITY_KG_PER_CM3[i.family as MaterialFamily];
      checks.push(check('stock', 'Stock utilisation',
        `${(util * 100).toFixed(1)}%: ${(st.cm3 * density).toFixed(2)} kg of ${st.form} for a ${(f.volCm3 * density).toFixed(3)} kg part (${st.basis})`,
        `≥ ${(MIN_UTILISATION * 100).toFixed(0)}%`, util >= MIN_UTILISATION, SRC.stock));
      if (util >= MIN_UTILISATION && util < 0.15) {
        caveats.push(`${(util * 100).toFixed(0)}% of the ${st.form} becomes the part — ${(1 / util).toFixed(1)} : 1 buy-to-fly`);
      }
    }
  }
  if (route === 'sheet_metal_fab' && drawnCup) {
    checks.push(check('drawn_form', 'Drawn form', 'a revolved cup (closed shell, one turned axis)',
      'laser-cut and bent only — no drawn form', false, SRC.drawnCup));
  }
  if (route === 'sheet_metal' || route === 'sheet_metal_fab') {
    checks.push(check('gauge', 'Sheet gauge', `${mm(f.gaugeMm)} (${f.gaugeSource})`, '0.4–6 mm',
      f.gaugeMm != null && f.gaugeMm >= 0.4 && f.gaugeMm <= 6, SRC.gauge));
    if (f.gaugeMm != null && f.meanWallMm != null && f.meanWallMm > 0) {
      checks.push(check('one_wall', 'One wall throughout', `mean wall ${mm(f.meanWallMm)} against a ${mm(f.gaugeMm)} gauge`,
        '≤ 2× the gauge', f.meanWallMm <= 2 * f.gaugeMm, SRC.gauge));
    }
  }
  if (route === 'injection_moulding') {
    checks.push(check('mould_wall', 'Wall', `${mm(f.gaugeMm)} (${f.gaugeSource})`, '0.5–6 mm',
      f.gaugeMm != null && f.gaugeMm >= 0.5 && f.gaugeMm <= 6, SRC.mouldWall));
  }
  if (route === 'thermoforming') {
    checks.push(check('tf_sheet', 'Sheet', `${mm(f.gaugeMm)} (${f.gaugeSource})`, '0.25–12 mm',
      f.gaugeMm != null && f.gaugeMm >= 0.25 && f.gaugeMm <= 12, SRC.tfSheet));
    checks.push(check('tf_bosses', 'Bosses and ribs', `${f.bosses} boss(es) measured`, 'none: a formed sheet has no stand-off features',
      f.bosses === 0, SRC.tfBosses));
    if (f.bboxSorted) {
      const ratio = f.bboxSorted[2] / f.bboxSorted[1];
      checks.push(check('tf_draw', 'Depth of draw', `${f.bboxSorted[2].toFixed(0)} mm deep on a ${f.bboxSorted[1].toFixed(0)} mm plan (${ratio.toFixed(2)}×)`,
        '≤ 1× the smaller plan dimension', ratio <= 1, SRC.tfDraw));
    }
  }
  if (route === 'blow_moulding' || route === 'rotational_moulding') {
    checks.push(check('hollow', 'Hollow body', f.hollowBody ? 'an enclosed shell (kernel enclosure probe)' : 'an open shape',
      'a hollow body', f.hollowBody, SRC.hollow));
    const [lo, hi] = route === 'blow_moulding' ? [0.3, 6] : [2, 20];
    checks.push(check('wall', 'Wall', `${mm(f.shellWallMm)} (2·V/S)`, `${lo}–${hi} mm`,
      f.shellWallMm != null && f.shellWallMm >= lo && f.shellWallMm <= hi, route === 'blow_moulding' ? SRC.bmWall : SRC.rotoWall));
  }
  if (route === 'extrusion') {
    checks.push(check('profile', 'Constant section', f.profile ? f.profile.basis : 'not a constant section',
      'volume = section × length', !!f.profile, SRC.profile));
  }
  if (route === 'aluminium_extrusion') {
    const cup = !!f.turning && f.turning.fraction >= 0.9 && f.turning.maxDiaMm > 0 && f.turning.maxDiaMm <= 200 && enclosedShell(i.geo);
    checks.push(check('profile', 'Constant section or cup', f.profile ? f.profile.basis : cup ? 'a revolved cup (impact extrusion)' : 'not a constant section',
      'volume = section × length, or a cup ≤ Ø200', !!f.profile || cup, f.profile || !cup ? SRC.profile : SRC.impactCup));
  }
  if (route === 'gear') {
    const g = looksLikeGear(i.geo as { gear?: { likelyGear?: boolean; teeth?: number } }, i.filename);
    checks.push(check('teeth', 'Teeth', g.gear ? g.basis : 'no teeth measured', 'measured teeth or a gear named', g.gear, SRC.gear));
  }

  return { route, feasible: checks.every(c => c.pass), checks, caveats };
}

/**
 * Screen every comparable route. The costing's own route is kept whatever the screen says — the engineer chose it —
 * and its failing checks are reported as caveats on its row.
 */
export function screenRoutes(current: string, i: ScreenInput): RouteScreen[] {
  const out: RouteScreen[] = [];
  for (const route of [current, ...COMPARABLE_ROUTES.filter(r => r !== current)]) {
    const s = screenRoute(route, i);
    if (route === current && !s.feasible) {
      s.caveats.unshift(...s.checks.filter(c => !c.pass).map(c => route === 'aluminium_extrusion' && c.id === 'profile'
        ? 'the measured shape is not a constant section: the rules cost an extrusion machined to shape'
        : `costed as the engineer chose it, although ${c.label.toLowerCase()} reads ${c.measured} against ${c.limit}`));
      s.feasible = true;
    }
    out.push(s);
  }
  return out;
}

/** The principle the comparison states on screen and in the reports. */
export const COMPARISON_PRINCIPLE = 'Routes are compared in the same material family and to the same finished scope; '
  + 'a route that cannot make this shape, or that the rate book has no press for, is listed with its reason and not costed. '
  + 'A change of material is a design change, not a route, and is not compared here.';
