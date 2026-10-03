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

const NAME_ALLOY: Array<[RegExp, AlAlloy]> = [
  [/\b7075\b/, '7075'], [/\b2024\b/, '2024'], [/\b7003\b/, '7003'], [/\b7108\b/, '7108'], [/\b7020\b/, '7020'],
  [/\b6082\b/, '6082'], [/\b6061\b/, '6061'], [/\b6005a?\b/, '6005A'], [/\b6101\b/, '6101'], [/\b6060\b/, '6060'],
  [/\b6063\b/, '6063'], [/\b5083\b/, '5083'], [/\b3003\b/, '3003'], [/\b1050a?\b/, '1050'],
  [/bumper|crash ?(management|beam)|side ?impact/, '7003'], [/busbar|bus ?bar|conductor/, '6101'],
  [/crash ?box|chassis|subframe|longitudinal|rocker|sill/, '6082'], [/battery|tray|enclosure|cross ?member/, '6005A'],
  [/heat ?sink|trim|rail|frame|cover|channel/, '6063'],
];

function alloyHint(ctx: RuleContext): AlAlloy | null {
  const text = ` ${partNames(ctx.filename, ctx.geo).map(n => n.text).join(' ')} `.toLowerCase();
  for (const [re, a] of NAME_ALLOY) if (re.test(text)) return a;
  return null;
}

function alloyDecision(ctx: RuleContext): Decision {
  const hint = alloyHint(ctx);
  return {
    id: AL_ALLOY_DECISION_ID, kind: 'material_grade',
    question: 'Which aluminium alloy?',
    why: 'The alloy sets the billet price, how fast the press can run (6063 ~50 m/min, 6082 ~12, 7075 ~2), '
      + 'the force, the quench and the ageing — none of which the shape shows.',
    options: AL_ALLOY_LIST.map(a => ({
      value: a, label: AL_ALLOYS[a].label,
      consequence: `${AL_ALLOYS[a].baseExitSpeedMPerMin} m/min, ${AL_ALLOYS[a].defaultTemper}; ${AL_ALLOYS[a].uses}`,
      leaning: hint === a,
    })),
    blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
  };
}

/** The measured section, from the kernel's cross-section probe (or a fallback). */
export interface MeasuredSection {
  areaMm2: number; perimeterMm: number; ccdMm: number; voids: number | null; minWallMm: number;
  lengthMm: number; volumeShare: number; source: 'kernel-section' | 'silhouette'; basis: string;
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
      basis: `cut across the ${ps.axis} axis at mid-length: ${fmt(area, 1)} mm² section, ${fmt(ps.perimeterMm as number, 0)} mm outline, `
        + `${ps.voids} void${ps.voids === 1 ? '' : 's'}, ${fmt(ps.ccdMm as number, 1)} mm circumscribing circle, ${fmt(minWall, 2)} mm thinnest wall`,
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
    minWallMm: 2 * v / s, lengthMm: d[0], volumeShare: 1, source: 'silhouette',
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
    return { blocked: ask({
      id: 'al.notProfile', kind: 'commodity',
      question: 'This part is not a long constant section — how is it made?',
      why: 'An extrusion is a section at least four times longer than it is wide. This part is not, and it is '
        + 'not a round cup either, so neither a press nor impact extrusion fits the shape as measured.',
      options: [
        { value: 'impact', label: 'Impact extruded (cup / can / housing)' },
        { value: 'machining', label: 'Re-route to machining' },
        { value: 'casting', label: 'Re-route to casting' },
      ],
      blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
    }) };
  }
  const a = AL_ALLOYS[alloy];
  const route: AlExtrusionRoute = routeAns ?? (sec ? (a.prefersIndirect ? 'indirect' : 'direct') : 'impact');
  const routeBasis = routeAns ? `${route}, stated by the engineer`
    : sec ? (a.prefersIndirect ? `indirect — ${alloy} is extruded without container friction, seamless in hollows` : 'direct (forward) extrusion — the mainstream route')
    : 'impact extrusion — a short round cup';

  const section = sec ?? { areaMm2: 0, perimeterMm: 0, ccdMm: cup!.od, voids: 0, minWallMm: 2 * (ctx.geo.volume?.mm3 ?? 0) / (ctx.geo.surfaceArea?.mm2 ?? 1), lengthMm: 0, volumeShare: 1, source: 'silhouette' as const, basis: 'a cup' };
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

  const temper = (ctx.answers[AL_TEMPER_DECISION_ID] as AlTemper | undefined) ?? (a.defaultTemper as AlTemper);
  const finish = (ctx.answers[AL_FINISH_DECISION_ID] as AlFinish | undefined) ?? 'mill';
  const bends = Math.max(0, Math.round(Number(ctx.answers[AL_BENDS_DECISION_ID] ?? 0)) || 0);
  const fab = sec ? fabrication(ctx, sec) : { minutes: 0, rows: 0, fixturings: 0, basis: 'impact: trimmed in the press' };
  const partKg = (ctx.geo.volume?.mm3 ?? 0) * 1e-9 * a.densityKgPerM3;
  const spec: AlExtrusionSpec = {
    alloy, route,
    section: { areaMm2: section.areaMm2, perimeterMm: section.perimeterMm, ccdMm: section.ccdMm, voids: voids ?? 0,
      minWallMm: section.minWallMm, partLengthMm: section.lengthMm },
    partWeightKg: Math.round(partKg * 10_000) / 10_000,
    annualVolume: ctx.annualVolume, temper, finish,
    finishAreaM2: Math.round((ctx.geo.surfaceArea?.mm2 ?? 0) / 1e6 * 10_000) / 10_000,
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
  const routeLabels: Record<AlExtrusionRoute, string> = {
    direct: 'Direct (forward) hot extrusion', indirect: 'Indirect (backward) hot extrusion',
    hydrostatic: 'Hydrostatic extrusion', conform: 'Conform continuous extrusion (from rod)', impact: 'Cold impact extrusion (cup / can)',
  };
  const tempers: AlTemper[] = a.heatTreatable ? ['T4', 'T5', 'T6', 'T64', 'T66', 'T73', 'F', 'O'] : ['H112', 'F', 'O'];
  return [
    { id: AL_ROUTE_DECISION_ID, kind: 'process_choice', question: 'Which extrusion process?',
      why: 'Direct extrusion is the default; indirect for 2xxx / 7xxx and seamless hollows; Conform for small 1xxx / 6xxx '
        + 'sections at high volume (no butt, no billet heat); hydrostatic for very high ratios; impact for cups and cans.',
      options: (Object.keys(routeLabels) as AlExtrusionRoute[]).map(r => ({ value: r, label: routeLabels[r], leaning: r === autoRoute })),
      blockedFieldIds: [], blockedRuleIds: [], severity: 'advisory' },
    { id: AL_TEMPER_DECISION_ID, kind: 'process_choice', question: 'Which temper?',
      why: 'T5 / T6 add an ageing-oven cycle; a 2xxx / 7xxx T6 also needs off-line solution treatment; T4, F and O need neither.',
      options: tempers.map(t => ({ value: t, label: t, leaning: t === a.defaultTemper })),
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
    rule('alExtrusion.finishAreaM2', 'alx-finish-area', 'finishAreaM2', a => ({ value: a.spec.finishAreaM2, source: 'geometry', confidence: 0.9, basis: 'the measured surface' })),
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
