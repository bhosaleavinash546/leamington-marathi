/**
 * Aluminium extrusion cost inputs, from the measured section (built Oct 2026).
 *
 * The kernel cuts a long part across its axis (`profileSection`): section area,
 * outline, enclosed voids, circumscribing circle and thinnest wall, at three
 * stations so a machined extrusion shows as a section that varies and a volume
 * short of section × length. From those and the engineer's alloy, the shared
 * builder `buildAlExtrusionInputs` plans the press, the openings, the speed, the
 * billet, the yield and the die — the SAME function the screen form calls, so
 * the two paths cannot drift.
 *
 * Questions, only where the shape cannot answer:
 *   alloy (blocking)           — 6063 and 7075 are the same shape
 *   route (advisory)           — direct / indirect by alloy; Conform, hydrostatic, impact on request
 *   temper (advisory)          — the alloy's usual temper
 *   finish (advisory)          — mill finish unless stated
 *   bends (advisory)           — a swept bumper beam is straight in its extruded state
 *
 * Fabrication is measured: holes across the profile (not along it — a tube's bore
 * is not drilled) at the drilling feed, and any volume machined away (section ×
 * length − volume) at aluminium's removal rate, in the machining review's cell.
 */
import { AL_ALLOYS, AL_ALLOY_LIST, AL_DOWNSTREAM, type AlAlloy, type AlExtrusionRoute, type AlFinish } from '../../al-extrusion-data.js';
import { COMMODITY_DECISION_ID } from '../derive/commodity.js';
import { buildAlExtrusionInputs, temperNeeds, type AlExtrusionSpec, type AlTemper, type AlExtrusionBuild } from '../../modules/aluminium-extrusion.js';
import { featureMinutesEach } from '../../feature-machining.js';
import { CUTTING_DATA } from '../../machining-time.js';
import { decided, ask, fmt, type CommodityRuleSpec, type Decision, type RuleContext, type RuleOutcome } from '../types.js';
import { partNames } from '../derive/part-evidence.js';

export const AL_ALLOY_DECISION_ID = 'material.alAlloy';
export const AL_ROUTE_DECISION_ID = 'al.route';
export const AL_TEMPER_DECISION_ID = 'al.temper';
export const AL_FINISH_DECISION_ID = 'al.finish';
export const AL_BENDS_DECISION_ID = 'al.bends';

/**
 * An alloy written in a name or a material designation: "6082", "EN AW-6082",
 * "AlSi1MgMn" is not parsed (rare in files). Suffixed grades first, so "6063A"
 * is not read as 6063 and "1070A" not as nothing.
 */
const DESIGNATED: Array<[RegExp, AlAlloy]> = [...AL_ALLOY_LIST]
  .sort((a, b) => b.length - a.length)
  .map(a => [new RegExp(`(?<![0-9])${a.toLowerCase()}${/[a-z]$/i.test(a) ? '' : '(?![0-9a-z])'}`), a] as [RegExp, AlAlloy]);
/** Part-name associations — a leaning only, weaker than a designation. */
const NAME_APPLICATION: Array<[RegExp, AlAlloy]> = [
  [/bumper|crash ?(management|beam)|side ?impact/, '7003'], [/busbar|bus ?bar|conductor/, '6101'],
  [/crash ?box|chassis|subframe|longitudinal|rocker|sill/, '6082'], [/battery|tray|enclosure|cross ?member/, '6005A'],
  [/heat ?sink|trim|rail|frame|cover|channel/, '6063'],
];
const TEMPER_RE = /(?<![a-z0-9])(t3511|t3510|t73|t76|t64|t66|t3|t4|t5|t6|t7|t8|h112)(?![0-9])/;

/**
 * What the file says the alloy (and temper) is, strongest evidence first: a
 * declared material designation (the designer's own property), then the AI's
 * read of the drawing or photo (tagged by `withAIMaterial` — a leaning, never
 * an answer), then the part names, then an application word.
 */
export function alloyEvidence(ctx: RuleContext): { alloy: AlAlloy | null; temper: string | null; source: string } {
  const designations = (ctx.geo.cadMetadata?.materialDesignations ?? []).map(t => ` ${t.toLowerCase()} `);
  const aiGrade = typeof ctx.answers['material.gradeText'] === 'string' ? ` ${String(ctx.answers['material.gradeText']).toLowerCase()} ` : '';
  const names = ` ${partNames(ctx.filename, ctx.geo).map(n => n.text).join(' ')} `.toLowerCase();
  const sources: Array<[string, string]> = [
    ...designations.map(d => [d, 'the material designation declared in the CAD file'] as [string, string]),
    ...(aiGrade ? [[aiGrade, 'the grade read off the drawing / photo by the identification step (to confirm)'] as [string, string]] : []),
    [names, 'the part name'],
  ];
  for (const [text, where] of sources) {
    const hit = DESIGNATED.find(([re]) => re.test(text));
    if (hit) return { alloy: hit[1], temper: text.match(TEMPER_RE)?.[1]?.toUpperCase() ?? null, source: where };
  }
  for (const [re, a] of NAME_APPLICATION) if (re.test(names)) return { alloy: a, temper: null, source: 'an application word in the part name' };
  return { alloy: null, temper: null, source: '' };
}

function alloyHint(ctx: RuleContext): AlAlloy | null {
  return alloyEvidence(ctx).alloy;
}

function alloyDecision(ctx: RuleContext): Decision {
  const hint = alloyHint(ctx);
  const ev = alloyEvidence(ctx);
  return {
    id: AL_ALLOY_DECISION_ID, kind: 'material_grade',
    question: 'Which aluminium alloy?',
    why: 'The alloy sets the billet price, how fast the press can run (6063 ~50 m/min, 6082 ~20, 7075 ~1.4), '
      + 'the force, the quench and the ageing — none of which the shape shows.'
      + (ev.alloy ? ` ${ev.alloy} is suggested from ${ev.source}.` : ''),
    options: AL_ALLOY_LIST.map(a => ({
      value: a, label: AL_ALLOYS[a].label,
      consequence: `${AL_ALLOYS[a].series}, ${AL_ALLOYS[a].baseExitSpeedMPerMin} m/min, ${AL_ALLOYS[a].defaultTemper}; ${AL_ALLOYS[a].uses}`,
      leaning: hint === a,
    })),
    blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
  };
}

/** The measured section, from the kernel's cross-section probe (or a fallback). */
export interface MeasuredSection {
  areaMm2: number; perimeterMm: number; ccdMm: number; voids: number | null; minWallMm: number;
  lengthMm: number; volumeShare: number; source: 'kernel-section' | 'silhouette'; basis: string;
  /** Outer outline only, mm — null on geometry measured before the review added it. */
  outerPerimeterMm: number | null;
  tongueRatio: number | null;
  tongueGapMm: number | null;
}

export function measuredSection(ctx: RuleContext): MeasuredSection | null {
  const ps = ctx.geo.profileSection as Record<string, unknown> | null | undefined;
  const v = ctx.geo.volume?.mm3 ?? 0;
  if (ps && typeof ps.areaMm2 === 'number' && ps.areaMm2 > 0) {
    const area = ps.areaMm2 as number; const L = ps.lengthMm as number;
    const minWall = (ps.minWallMm as number | null) ?? (ps.meanWallMm as number);
    return {
      areaMm2: area, perimeterMm: ps.perimeterMm as number, ccdMm: ps.ccdMm as number, voids: ps.voids as number,
      minWallMm: minWall, lengthMm: L, volumeShare: v > 0 ? v / (area * L) : 1, source: 'kernel-section',
      outerPerimeterMm: typeof ps.outerPerimeterMm === 'number' ? ps.outerPerimeterMm : null,
      tongueRatio: typeof ps.tongueRatio === 'number' ? ps.tongueRatio : null,
      tongueGapMm: typeof ps.tongueGapMm === 'number' ? ps.tongueGapMm : null,
      basis: `cut across the ${ps.axis} axis at mid-length: ${fmt(area, 1)} mm² section, ${fmt(ps.perimeterMm as number, 0)} mm outline, `
        + `${ps.voids} void${ps.voids === 1 ? '' : 's'}, ${fmt(ps.ccdMm as number, 1)} mm circumscribing circle, ${fmt(minWall, 2)} mm thinnest wall`
        + (typeof ps.tongueRatio === 'number' && ps.tongueRatio > 0 ? `, tongue ${fmt(ps.tongueRatio as number, 1)}:1 at a ${fmt(ps.tongueGapMm as number, 1)} mm gap` : ''),
    };
  }
  // Fallback for geometry measured before the probe: a constant section only.
  const bb = ctx.geo.boundingBox; const s = ctx.geo.surfaceArea?.mm2 ?? 0;
  if (!bb || !v || !s) return null;
  const d = [bb.xMm, bb.yMm, bb.zMm].sort((a, b) => b - a);
  if (d[0] < 4 * d[1]) return null;
  const area = v / d[0];
  return {
    areaMm2: area, perimeterMm: (s - 2 * area) / d[0], ccdMm: Math.hypot(d[1], d[2]), voids: null,
    minWallMm: 2 * v / s, lengthMm: d[0], volumeShare: 1, source: 'silhouette', outerPerimeterMm: null, tongueRatio: null, tongueGapMm: null,
    basis: `no section probe on this geometry: area = volume ÷ length, outline = (surface − 2 × area) ÷ length, circle = the section box diagonal, wall = 2·V/S`,
  };
}

/** Holes across the profile and volume machined away, minutes — aluminium. */
export function fabrication(ctx: RuleContext, sec: MeasuredSection): { minutes: number; rows: number; fixturings: number; basis: string } {
  let minutes = 0; let rows = 0; let holeMm3 = 0;
  const notes: string[] = [];
  for (const r of ctx.geo.featureTable ?? []) {
    // A feature as deep as the part is long runs ALONG the extrusion — a bore or
    // a chamber, made by the die, not drilled.
    if (r.depthMm >= 0.9 * sec.lengthMm) continue;
    // Holes only. The kernel reads a hollow profile's chamber walls as
    // "pockets" (the crash box carried 2 × 58.5 mm pockets = 585 min of CNC);
    // a pocket really milled across the profile removes metal, and that is
    // costed below from the measured volume, not from the feature table.
    if (r.kind !== 'hole') continue;
    const each = featureMinutesEach(r) * CUTTING_DATA.aluminium.timeFactor;
    if (r.kind === 'hole') holeMm3 += Math.PI / 4 * r.diaMm ** 2 * r.depthMm * (r.count ?? 1);
    minutes += each * (r.count ?? 1); rows += 1;
    notes.push(`${r.count ?? 1} × ${r.kind} Ø${fmt(r.diaMm, 1)} × ${fmt(r.depthMm, 1)} mm`);
  }
  // Volume machined away beyond the holes already drilled above.
  const removedCm3 = Math.max(0, ((1 - sec.volumeShare) * sec.areaMm2 * sec.lengthMm - holeMm3) / 1000);
  if (sec.volumeShare < 0.98 && removedCm3 > 0.5) {
    const m = removedCm3 / CUTTING_DATA.aluminium.millRoughCm3PerMin;
    minutes += m + 0.5; rows += 1;
    notes.push(`${fmt(removedCm3, 1)} cm³ machined away (volume ${(sec.volumeShare * 100).toFixed(1)}% of section × length) at ${CUTTING_DATA.aluminium.millRoughCm3PerMin} cm³/min`);
  }
  return { minutes: Math.round(minutes * 100) / 100, rows, fixturings: minutes > 0 ? 1 : 0,
    basis: notes.length ? notes.join('; ') : 'nothing machined across the profile — cut to length on the press saw' };
}

function isCup(ctx: RuleContext): { od: number } | null {
  const bb = ctx.geo.boundingBox; if (!bb) return null;
  const d = [bb.xMm, bb.yMm, bb.zMm].sort((a, b) => b - a);
  // Short, round across: a can, a cup, a housing — the impact-extrusion shapes.
  return d[0] <= 4 * d[1] && Math.abs(d[1] - d[2]) <= 0.05 * d[1] ? { od: d[1] } : null;
}

interface AlAdvice { spec: AlExtrusionSpec; build: AlExtrusionBuild; sec: MeasuredSection; fabBasis: string; routeBasis: string }

function advise(ctx: RuleContext): { advice: AlAdvice } | { blocked: RuleOutcome<never> } {
  const alloyAns = ctx.answers[AL_ALLOY_DECISION_ID];
  if (typeof alloyAns !== 'string' || !(alloyAns in AL_ALLOYS)) return { blocked: ask(alloyDecision(ctx)) };
  const alloy = alloyAns as AlAlloy;

  const routeAns = ctx.answers[AL_ROUTE_DECISION_ID] as AlExtrusionRoute | undefined;
  const sec = measuredSection(ctx);
  const cup = isCup(ctx);
  if (!sec && !(routeAns === 'impact' || cup)) {
    // Asked AS the process question, so the answer re-routes the part — an
    // 'al.notProfile' id was a dead end: nothing read its answer (review, Oct 2026).
    return { blocked: ask({
      id: COMMODITY_DECISION_ID, kind: 'commodity',
      question: 'This part is not a long constant section — which process makes it?',
      why: 'An extrusion is a constant section, cut to length; this part is not, and it is not a round cup either, '
        + 'so neither a press nor impact extrusion fits the shape as measured. If it IS impact extruded, answer '
        + '"Which extrusion process?" with cold impact extrusion instead.',
      options: [
        { value: 'machining', label: 'Machined from solid' },
        { value: 'casting', label: 'Cast' },
        { value: 'forging', label: 'Forged' },
        { value: 'cast_and_machine', label: 'Cast then machined' },
      ],
      blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
    }) };
  }
  const a = AL_ALLOYS[alloy];
  const route: AlExtrusionRoute = routeAns ?? (sec ? (a.prefersIndirect ? 'indirect' : 'direct') : 'impact');
  const routeBasis = routeAns ? `${route}, stated by the engineer`
    : sec ? (a.prefersIndirect ? `indirect — ${alloy} is extruded without container friction, seamless in hollows` : 'direct (forward) extrusion — the mainstream route')
    : 'impact extrusion — a short round cup';

  const section: MeasuredSection = sec ?? { areaMm2: 0, perimeterMm: 0, ccdMm: cup!.od, voids: 0, minWallMm: 2 * (ctx.geo.volume?.mm3 ?? 0) / (ctx.geo.surfaceArea?.mm2 ?? 1), lengthMm: 0, volumeShare: 1, source: 'silhouette', basis: 'a cup', outerPerimeterMm: null, tongueRatio: null, tongueGapMm: null };
  const voidsAns = Number(ctx.answers['al.voids']);
  const voids = section.voids ?? (Number.isFinite(voidsAns) && ctx.answers['al.voids'] !== undefined ? voidsAns : null);
  if (voids === null && route !== 'impact') {
    return { blocked: ask({
      id: 'al.voids', kind: 'geometry_gap', question: 'How many enclosed voids (chambers) does the section have?',
      why: 'This geometry was measured before the section probe existed, so the chambers are not known — and a hollow '
        + 'needs a porthole die at three to five times a solid die, and runs slower.',
      options: [{ value: 'enter', label: 'Voids' }], entry: { kind: 'number', placeholder: '0 for a solid section' },
      blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
    }) };
  }

  // The temper a declared designation states ("6082-T6") is the default; else the alloy's usual one.
  const ev = alloyEvidence(ctx);
  const declaredTemper = ev.alloy === alloy && ev.temper && a.tempers.includes(ev.temper as AlTemper)
    && ev.source.startsWith('the material designation') ? ev.temper as AlTemper : null;
  const temper = (ctx.answers[AL_TEMPER_DECISION_ID] as AlTemper | undefined) ?? declaredTemper ?? a.defaultTemper;
  const finish = (ctx.answers[AL_FINISH_DECISION_ID] as AlFinish | undefined) ?? 'mill';
  const bends = Math.max(0, Math.round(Number(ctx.answers[AL_BENDS_DECISION_ID] ?? 0)) || 0);
  const fab = sec ? fabrication(ctx, sec) : { minutes: 0, rows: 0, fixturings: 0, basis: 'impact: trimmed in the press' };
  const partKg = (ctx.geo.volume?.mm3 ?? 0) * 1e-9 * a.densityKgPerM3;
  const spec: AlExtrusionSpec = {
    alloy, route,
    section: { areaMm2: section.areaMm2, perimeterMm: section.perimeterMm, ccdMm: section.ccdMm, voids: voids ?? 0,
      minWallMm: section.minWallMm, partLengthMm: section.lengthMm,
      ...(section.tongueRatio != null ? { tongueRatio: section.tongueRatio } : {}) },
    partWeightKg: Math.round(partKg * 10_000) / 10_000,
    annualVolume: ctx.annualVolume, temper, finish,
    finishAreaM2: Math.round((ctx.geo.surfaceArea?.mm2 ?? 0) / 1e6 * 10_000) / 10_000,
    ...(section.outerPerimeterMm ? { finishOutsideAreaM2: Math.round(section.outerPerimeterMm * section.lengthMm / 1e6 * 10_000) / 10_000 } : {}),
    bends, cncMinutes: fab.minutes, cncFixturings: fab.fixturings, fabFeatureRows: fab.rows,
    ...(route === 'impact' ? { impactOuterDiaMm: cup?.od ?? section.ccdMm } : {}),
  };
  return { advice: { spec, build: buildAlExtrusionInputs(spec), sec: section, fabBasis: fab.basis, routeBasis } };
}

type Src = 'geometry' | 'rule' | 'library' | 'advisor' | 'engineer';
function rule<T extends string | number | boolean>(
  id: string, fieldId: string | undefined, label: string,
  pick: (a: AlAdvice, ctx: RuleContext) => { value: T; source: Src; basis: string; confidence: number },
) {
  return {
    id, path: id, ...(fieldId ? { fieldId } : {}), label,
    evaluate: (ctx: RuleContext) => {
      const r = advise(ctx);
      if ('blocked' in r) return r.blocked;
      const v = pick(r.advice, ctx);
      return decided(id, v.value, v.source, v.basis, v.confidence);
    },
  };
}

/** The advisory questions — asked with their default chosen, never blocking. */
export function alAdvisoryDecisions(ctx: RuleContext): Decision[] {
  const alloyAns = ctx.answers[AL_ALLOY_DECISION_ID] as AlAlloy | undefined;
  if (!alloyAns || !(alloyAns in AL_ALLOYS)) return [];
  const a = AL_ALLOYS[alloyAns];
  const sec = measuredSection(ctx);
  const autoRoute = sec ? (a.prefersIndirect ? 'indirect' : 'direct') : 'impact';
  const ev = alloyEvidence(ctx);
  const declaredTemper = ev.alloy === alloyAns && ev.temper && ev.source.startsWith('the material designation') ? ev.temper : null;
  const routeLabels: Record<AlExtrusionRoute, string> = {
    direct: 'Direct (forward) hot extrusion', indirect: 'Indirect (backward) hot extrusion',
    hydrostatic: 'Hydrostatic extrusion', conform: 'Conform continuous extrusion (from rod)', impact: 'Cold impact extrusion (cup / can)',
  };
  const tempers: AlTemper[] = a.tempers;
  const temperLean = declaredTemper && tempers.includes(declaredTemper as AlTemper) ? declaredTemper : a.defaultTemper;
  return [
    { id: AL_ROUTE_DECISION_ID, kind: 'process_choice', question: 'Which extrusion process?',
      why: 'Direct extrusion is the default; indirect for 2xxx / 7xxx and seamless hollows; Conform for small 1xxx / 6xxx '
        + 'sections at high volume (no butt, no billet heat); hydrostatic for very high ratios; impact for cups and cans.',
      options: (Object.keys(routeLabels) as AlExtrusionRoute[]).map(r => ({ value: r, label: routeLabels[r], leaning: r === autoRoute })),
      blockedFieldIds: [], blockedRuleIds: [], severity: 'advisory' },
    { id: AL_TEMPER_DECISION_ID, kind: 'process_choice', question: 'Which temper?',
      why: 'T5 / T6 / T7 add an ageing-oven cycle; a 2xxx or 7075 solution-treated temper also needs off-line solution treatment; T3, T4, F and O are not artificially aged.'
        + (declaredTemper ? ` The file declares ${declaredTemper}.` : ''),
      options: tempers.map(t => ({ value: t, label: t, leaning: t === temperLean })),
      blockedFieldIds: [], blockedRuleIds: [], severity: 'advisory' },
    { id: AL_FINISH_DECISION_ID, kind: 'process_choice', question: 'Which finish?',
      why: 'Mill finish unless the drawing calls a coating; anodise, powder and e-coat are charged per m² of the measured surface.',
      options: [
        { value: 'mill', label: 'Mill finish', leaning: true }, { value: 'anodise', label: 'Anodised (10–25 µm)' },
        { value: 'powder', label: 'Powder coated' }, { value: 'ecoat', label: 'E-coat / conversion coat (for bonding)' },
      ],
      blockedFieldIds: [], blockedRuleIds: [], severity: 'advisory' },
    { id: AL_BENDS_DECISION_ID, kind: 'process_choice', question: 'Is the profile stretch-bent after extrusion?',
      why: 'A swept bumper beam or roof rail is extruded straight and bent after; the CAD of a straight profile cannot say.',
      options: [{ value: '0', label: 'Straight', leaning: true }, { value: '1', label: '1 sweep' }, { value: '2', label: '2 bends' }, { value: '3', label: '3 bends' }],
      blockedFieldIds: [], blockedRuleIds: [], severity: 'advisory' },
  ];
}

export const ALUMINIUM_EXTRUSION_RULES: CommodityRuleSpec = {
  commodity: 'aluminium_extrusion',
  header: 'ALUMINIUM EXTRUSION COST INPUT RULES:',
  rules: [
    rule('alExtrusion.alloy', 'alx-alloy', 'alloy', a => ({ value: a.spec.alloy, source: 'engineer', confidence: 1, basis: AL_ALLOYS[a.spec.alloy].label })),
    rule('alExtrusion.materialId', undefined, 'materialId', a => ({ value: a.build.inputs.materialId, source: 'library', confidence: 1, basis: 'billet grade for the alloy (LME + regional premium + alloy adder)' })),
    rule('alExtrusion.route', 'alx-route', 'route', a => ({ value: a.spec.route, source: 'rule', confidence: 0.8, basis: a.routeBasis })),
    rule('alExtrusion.areaMm2', 'alx-area', 'areaMm2', a => ({ value: Math.round(a.spec.section.areaMm2 * 100) / 100, source: 'geometry', confidence: 0.95, basis: a.sec.basis })),
    rule('alExtrusion.perimeterMm', 'alx-perim', 'perimeterMm', a => ({ value: Math.round(a.spec.section.perimeterMm * 10) / 10, source: 'geometry', confidence: 0.9, basis: 'outline of the section, outer and inner loops' })),
    rule('alExtrusion.ccdMm', 'alx-ccd', 'ccdMm', a => ({ value: Math.round(a.spec.section.ccdMm * 10) / 10, source: 'geometry', confidence: 0.9, basis: 'smallest circle enclosing the section — sizes the die and the press' })),
    rule('alExtrusion.tongueRatio', 'alx-tongue', 'tongueRatio', a => ({ value: a.sec.tongueRatio ?? 0, source: 'geometry', confidence: 0.8,
      basis: a.sec.tongueRatio != null ? `largest space the outline nearly encloses ÷ gap²${a.sec.tongueGapMm ? ` (${fmt(a.sec.tongueGapMm, 1)} mm gap)` : ''} — 3:1 or more is a semi-hollow die` : 'not measured on this geometry' })),
    rule('alExtrusion.voids', 'alx-voids', 'voids', a => ({ value: a.spec.section.voids, source: a.sec.source === 'kernel-section' ? 'geometry' : 'engineer', confidence: 0.9, basis: 'enclosed chambers: 0 solid, ≥ 1 hollow (porthole / bridge / seamless die)' })),
    rule('alExtrusion.minWallMm', 'alx-wall', 'minWallMm', a => ({ value: Math.round(a.spec.section.minWallMm * 100) / 100, source: 'geometry', confidence: 0.8, basis: '10th-percentile chord across the section (thin walls slow the press)' })),
    rule('alExtrusion.partLengthMm', 'alx-length', 'partLengthMm', a => ({ value: Math.round(a.spec.section.partLengthMm * 10) / 10, source: 'geometry', confidence: 0.95, basis: 'cut length — the long axis' })),
    rule('alExtrusion.partWeightKg', 'alx-part-wt', 'partWeightKg', a => ({ value: a.spec.partWeightKg, source: 'geometry', confidence: 0.95, basis: `measured volume × ${AL_ALLOYS[a.spec.alloy].densityKgPerM3} kg/m³ (the finished part)` })),
    rule('alExtrusion.temper', 'alx-temper', 'temper', a => {
      const n = temperNeeds(a.spec.alloy, a.spec.temper);
      return { value: a.spec.temper, source: 'rule', confidence: 0.7,
        basis: `${a.spec.temper}: ${n.sht ? 'off-line solution treatment + ' : ''}${n.age ? `ageing ${AL_ALLOYS[a.spec.alloy].ageHours} h a load` : 'no ageing'}` };
    }),
    rule('alExtrusion.finish', 'alx-finish', 'finish', a => ({ value: a.spec.finish, source: 'rule', confidence: 0.6,
      basis: a.spec.finish === 'mill' ? 'mill finish — no coating stated' : `${a.spec.finish} over ${fmt(a.spec.finishAreaM2, 3)} m²` })),
    rule('alExtrusion.finishAreaM2', 'alx-finish-area', 'finishAreaM2', a => ({ value: a.spec.finishAreaM2, source: 'geometry', confidence: 0.9, basis: 'the measured surface, chambers included (anodise, e-coat)' })),
    rule('alExtrusion.finishOutsideAreaM2', 'alx-finish-out', 'finishOutsideAreaM2', a => ({ value: a.spec.finishOutsideAreaM2 ?? 0, source: 'geometry', confidence: 0.9,
      basis: a.spec.finishOutsideAreaM2 ? `outer outline ${fmt(a.sec.outerPerimeterMm ?? 0, 0)} mm × ${fmt(a.sec.lengthMm, 0)} mm — what powder coats` : 'not measured on this geometry — powder is charged on the whole surface' })),
    rule('alExtrusion.bends', 'alx-bends', 'bends', a => ({ value: a.spec.bends, source: 'rule', confidence: 0.6, basis: a.spec.bends ? `${a.spec.bends} stretch bend(s), stated` : 'straight' })),
    rule('alExtrusion.cncMinutes', 'alx-cnc-min', 'cncMinutes', a => ({ value: a.spec.cncMinutes, source: 'geometry', confidence: 0.7, basis: a.fabBasis })),
    rule('alExtrusion.cncFixturings', 'alx-cnc-fix', 'cncFixturings', a => ({ value: a.spec.cncFixturings, source: 'rule', confidence: 0.6, basis: a.spec.cncFixturings ? 'one set-up on the long-bed centre' : 'no fabrication' })),
    rule('alExtrusion.fabFeatureRows', 'alx-fab-rows', 'fabFeatureRows', a => ({ value: a.spec.fabFeatureRows, source: 'geometry', confidence: 0.7, basis: 'feature rows to programme' })),
    rule('alExtrusion.impactOuterDiaMm', 'alx-impact-dia', 'impactOuterDiaMm', a => ({ value: a.spec.impactOuterDiaMm ?? 0, source: 'geometry', confidence: 0.8, basis: a.spec.route === 'impact' ? 'outer Ø of the cup' : 'not an impact part' })),
    // ── advisory questions: asked with the default applied, never blocking ──
    ...([AL_ROUTE_DECISION_ID, AL_TEMPER_DECISION_ID, AL_FINISH_DECISION_ID, AL_BENDS_DECISION_ID] as const).map(qid => ({
      id: `alExtrusion.q.${qid}`, path: `alExtrusion.q.${qid}`, label: qid,
      evaluate: (ctx: RuleContext) => {
        if (ctx.answers[qid] !== undefined) return decided(`alExtrusion.q.${qid}`, String(ctx.answers[qid]), 'engineer', 'answered', 1);
        const d = alAdvisoryDecisions(ctx).find(x => x.id === qid);
        return d ? ask(d) : decided(`alExtrusion.q.${qid}`, '', 'rule', 'alloy not yet chosen', 0.5);
      },
    })),
    // ── the plan, for the report (the cost re-plans from the inputs above) ──
    rule('alExtrusion.press', undefined, 'press', a => ({ value: a.build.inputs.pressId, source: 'advisor', confidence: 0.75, basis: [...a.build.notes, ...a.build.warnings].join(' | ') })),
    rule('alExtrusion.recovery', undefined, 'recovery', a => ({ value: a.build.plan ? a.build.plan.recovery : Math.round(a.build.inputs.partWeightKg / a.build.inputs.billetKgPerPart * 1000) / 1000, source: 'advisor', confidence: 0.7,
      basis: a.build.plan ? `billet ${a.build.plan.billetMm} mm → ${a.build.plan.partsPerPush} parts a push` : 'feed per part' })),
    rule('alExtrusion.labour', undefined, 'labour', () => ({ value: 'lab-uk-semiskilled', source: 'library', confidence: 0.7, basis: 'press crew (operator, puller, stretcher / saw)' })),
    rule('alExtrusion.ageOven', undefined, 'ageOven', a => ({ value: a.build.inputs.ageOvenId ?? '', source: 'rule', confidence: 0.6, basis: a.build.inputs.ageOvenId ? `${AL_DOWNSTREAM.ageOven.label}, ${AL_DOWNSTREAM.ageOven.loadKg} kg a load` : 'no ageing' })),
  ],
};
