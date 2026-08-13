/**
 * Gear-cutting cost inputs, derived from the measured B-rep.
 *
 * The geometry kernel counts teeth from tip-circle cylinder patches and derives
 * the module as OD/(z+2) — see `_gear_metrics` in `cad-geometry-engine.py`.
 * Those are the two numbers a gear costing lives or dies on, and both are
 * MEASURED here, not guessed. What geometry genuinely cannot settle stays a
 * question:
 *
 *   - **Helix angle.** A STEP file's flank surfaces are whatever the designer's
 *     CAD kernel lofted; deriving β from them silently mistakes a spur for a
 *     helical and shifts the true module. It comes off the drawing, always.
 *   - **ISO 1328 quality class.** Tolerance is on the drawing, not in the solid.
 *     Class decides the whole finishing route (a ground class-6 flank costs
 *     ~2× a shaved class-8), so it blocks.
 *   - **Material class.** The same blank is 20MnCr5 carburised or 42CrMo4
 *     through-hardened; the solid weighs the same either way. Blocks — the
 *     material trap is the documented dominant failure mode of this tool.
 *
 * The blank is priced by rule (bar-stock cylinder × library £/kg + turning
 * prep), stated in full and overridable in the form — `modules/gear.ts`
 * deliberately takes `blankCostPerPart` as an input rather than owning a second
 * material model.
 */
import { DEFAULT_RATE_LIBRARY } from '../../rate-library.js';
import { analyseGear } from '../../modules/gear.js';
import { HARDENING_ROUTE_UNSUITABLE, type HardeningRoute } from '../../modules/gear-advisor.js';
import type { GearMaterialClass } from '../../gear-shop-data.js';
import {
  decided, ask, fmt,
  type CommodityRuleSpec, type Decision, type DecisionOption, type RuleContext, type RuleOutcome,
} from '../types.js';

/** Decision ids — the browser panel and `decisionAnswers` key off these. */
export const GEAR_HELIX_DECISION_ID = 'gear.helix';
export const GEAR_QUALITY_DECISION_ID = 'gear.qualityClass';
export const GEAR_MATERIAL_DECISION_ID = 'gear.materialClass';
export const GEAR_TEETH_DECISION_ID = 'gear.teethEntry';
export const GEAR_MODULE_DECISION_ID = 'gear.moduleEntry';
export const GEAR_FACE_DECISION_ID = 'gear.faceWidthEntry';
export const GEAR_HARDENING_DECISION_ID = 'gear.hardeningRoute';
export const GEAR_CASE_DEPTH_DECISION_ID = 'gear.effectiveCaseDepthMm';

/** Representative library grade per cutting class — same move as the casting
 *  family → grade resolution. Every id verified against `DEFAULT_RATE_LIBRARY`. */
const GRADE_BY_CLASS: Record<GearMaterialClass, { id: string; note: string }> = {
  case_hardening_steel: { id: 'mat-steel-20mncr5', note: '20MnCr5 — the European transmission default' },
  through_hardening_steel: { id: 'mat-steel4140', note: '42CrMo4/EN19 quench-and-temper' },
  alloy_steel_prehardened: { id: 'mat-steel4140', note: '42CrMo4 supplied pre-hardened ~30 HRC' },
  stainless: { id: 'mat-ss303', note: '303 free-machining stainless bar' },
  cast_iron: { id: 'mat-adi', note: 'EN-GJS-800 ADI — austempered gear iron' },
  bronze: { id: 'mat-bronze-pb1', note: 'PB1 phosphor bronze — worm wheels' },
  plastic: { id: 'mat-pom-c', note: 'POM-C acetal — precision plastic gears' },
};

interface GearGeo {
  teeth: number;
  tipDiameterMm: number;
  faceWidthMm: number;
  boreDiameterMm: number;
  derivedNormalModuleMm: number;
  moduleBasis: string;
  teethBasis: string;
  internal: boolean;
}

/** The measured gear metrics, when the kernel found a gear-like shape. */
function gearGeo(ctx: RuleContext): GearGeo | null {
  const g = ctx.geo.gear;
  return g && g.likelyGear && g.teeth >= 7 ? g : null;
}

// ── engineer answers ─────────────────────────────────────────────────────────

function answeredHelix(ctx: RuleContext): number | null {
  const raw = ctx.answers[GEAR_HELIX_DECISION_ID];
  if (raw !== undefined && raw !== null && raw !== '') {
    const s = String(raw).trim().toLowerCase();
    if (s === 'spur' || s === '0') return 0;
    const n = Number(s);
    if (Number.isFinite(n) && Math.abs(n) < 60) return n;
  }
  // The AI path may assume the leaning (spur) — stated, never silent.
  return ctx.assumeLeanings ? 0 : null;
}

function answeredQuality(ctx: RuleContext): number | null {
  const raw = ctx.answers[GEAR_QUALITY_DECISION_ID];
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= 11) return n;
  return ctx.assumeLeanings ? 7 : null;
}

function answeredMaterialClass(ctx: RuleContext): GearMaterialClass | null {
  const raw = String(ctx.answers[GEAR_MATERIAL_DECISION_ID] ?? '');
  if (raw in GRADE_BY_CLASS) return raw as GearMaterialClass;
  // NEVER assumed, even on the AI path (`assumeLeanings`). The material is the
  // documented dominant failure mode of this tool: the same blank is 20MnCr5
  // carburised or 42CrMo4 through-hardened and the solid cannot tell you which.
  // A person answers this, or a drawing does — via the confirm-gated leaning.
  return null;
}

/**
 * The hardening route, when the engineer has named one.
 *
 * Unanswered means "use the material class's own default" — carburise a
 * case-hardening steel, quench-and-temper a through-hardening one. That default
 * is derivable, so this decision is ADVISORY, not blocking: the costing runs
 * either way. It is raised because nitriding and induction hardening are chosen
 * against a load case the CAD cannot see, and a route that halves the finishing
 * operations should be an explicit choice rather than an invisible default.
 */
function answeredHardening(ctx: RuleContext): HardeningRoute | null {
  const raw = String(ctx.answers[GEAR_HARDENING_DECISION_ID] ?? '');
  const valid: HardeningRoute[] = [
    'none', 'case_hardening', 'lpc_carburising', 'carbonitriding',
    'quench_temper', 'martempering', 'austempering',
    'nitriding', 'fnc', 'induction_hardening',
  ];
  return (valid as string[]).includes(raw) ? raw as HardeningRoute : null;
}

/** The route the material class implies when nobody has chosen one. */
function defaultHardening(mc: GearMaterialClass): HardeningRoute {
  if (mc === 'case_hardening_steel') return 'case_hardening';
  if (mc === 'through_hardening_steel') return 'quench_temper';
  return 'none';
}

function hardeningDecision(mc: GearMaterialClass): Decision {
  const unsuitable = (r: Exclude<HardeningRoute, 'none'>): string | undefined =>
    HARDENING_ROUTE_UNSUITABLE[r][mc];
  const opt = (
    value: HardeningRoute, label: string, consequence: string,
  ): DecisionOption | null => {
    if (value === 'none') return { value, label, consequence };
    const why = unsuitable(value as Exclude<HardeningRoute, 'none'>);
    // A route this grade metallurgically cannot take is not offered at all.
    return why ? null : { value, label, consequence, leaning: value === defaultHardening(mc) };
  };
  const options = [
    opt('case_hardening', 'Carburise, quench and temper',
      'deep case; distorts 2 ISO classes, so anything tighter than class 9 buys grinding after'),
    opt('lpc_carburising', 'Low-pressure (vacuum) carburise',
      'EV/NVH route — half the distortion of oil quenching and no post-wash, at ~2x the rate'),
    opt('carbonitriding', 'Carbonitride',
      'the cheapest case route, for small gears at case depths under 0.4 mm'),
    opt('quench_temper', 'Harden and temper (through)',
      'core strength; distorts 1 ISO class, grinding after for a tight class'),
    opt('martempering', 'Martemper (hot-oil quench)',
      'buys back distortion on thin sections at a small premium over plain Q&T'),
    opt('austempering', 'Austemper (bainitic)',
      'toughness with very low distortion — the ADI route'),
    opt('nitriding', 'Nitride',
      'no distortion — often skips hard finishing entirely, but dear per kg and a thin case'),
    opt('fnc', 'Ferritic nitrocarburise',
      'the low-cost nitride substitute: 8 h rather than 45 h, near-zero distortion'),
    opt('induction_hardening', 'Induction harden',
      'seconds on a coil rather than furnace hours; geometry-specific coil as NRE'),
    opt('none', 'Leave soft — no hardening',
      'no furnace pass; a tight class is met by shaving rather than grinding'),
  ].filter((o): o is DecisionOption => o !== null);

  return {
    id: GEAR_HARDENING_DECISION_ID, kind: 'tolerance_class',
    question: 'Which hardening route does this gear take?',
    why: 'The grade permits several, and the choice is made against a load case the CAD cannot '
      + 'see. It changes the operation list, not just the price: nitriding adds no distortion so '
      + 'the gear can ship straight off the hobber, while carburising forces a grinding pass. '
      + `Unanswered, the ${mc.replace(/_/g, ' ')} default is used and stated.`,
    options,
    blockedFieldIds: [], blockedRuleIds: [], severity: 'advisory',
  };
}

function answeredEntry(ctx: RuleContext, id: string): number | null {
  const n = Number(ctx.answers[id]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function assumed(ctx: RuleContext, id: string): string {
  return ctx.assumeLeanings && ctx.answers[id] === undefined
    ? ' (assumed — confirm before quoting)' : '';
}

/** True when this answer was folded in from the model's drawing read, not typed
 *  by a person — the provenance must say so (`material.familySource` lesson). */
function aiSourced(ctx: RuleContext, id: string): boolean {
  return ctx.answers[`${id}Source`] === 'ai';
}

/** Source + note + confidence for an answered decision, honestly attributed. */
function answerProvenance(ctx: RuleContext, id: string): {
  source: 'engineer' | 'ai'; note: string; conf: number;
} {
  if (aiSourced(ctx, id)) {
    return { source: 'ai', note: ' (from the model’s drawing read — not engineer-confirmed)', conf: 0.7 };
  }
  if (ctx.answers[id] !== undefined) return { source: 'engineer', note: '', conf: 1 };
  return { source: 'engineer', note: '', conf: 0.6 };   // assumed leaning
}

// ── decisions ────────────────────────────────────────────────────────────────

function helixDecision(): Decision {
  return {
    id: GEAR_HELIX_DECISION_ID, kind: 'tolerance_class',
    question: 'Spur or helical — what is the helix angle?',
    why: 'A STEP file cannot be trusted to settle the helix: the flank surfaces are '
      + 'whatever the design kernel lofted, and the derived module shifts with cos β. '
      + 'It is one number on the drawing.',
    options: [
      { value: '0', label: 'Spur — 0°', leaning: true,
        consequence: 'module = tip Ø ÷ (z + 2) exactly as measured' },
      { value: 'enter', label: 'Helical — enter β off the drawing',
        consequence: 'normal module re-derived with cos β; axial overtravel lengthens the cut' },
    ],
    entry: { kind: 'number', unit: '°', placeholder: 'e.g. 20' },
    blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
  };
}

function qualityDecision(): Decision {
  return {
    id: GEAR_QUALITY_DECISION_ID, kind: 'tolerance_class',
    question: 'ISO 1328 flank tolerance class?',
    why: 'Quality is written on the drawing, not in the solid — and it decides the '
      + 'whole finishing route. A ground class-6 flank costs roughly twice a '
      + 'hobbed-and-shaved class-8.',
    options: [
      { value: '6', label: 'Class 6 — ground, EV/NVH-critical',
        consequence: 'adds a grinding operation after heat treat' },
      { value: '7', label: 'Class 7 — finished automotive transmission', leaning: true,
        consequence: 'hard-finish (skive/shave) after heat treat' },
      { value: '8', label: 'Class 8 — commercial automotive / industrial',
        consequence: 'cut-and-harden, light finish' },
      { value: '9', label: 'Class 9–10 — agricultural / low-speed industrial',
        consequence: 'as-hobbed flanks, no finishing pass' },
    ],
    entry: { kind: 'number', placeholder: '1–11, lower is tighter' },
    blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
  };
}

function materialClassDecision(): Decision {
  return {
    id: GEAR_MATERIAL_DECISION_ID, kind: 'material_grade',
    question: 'What is the gear cut from?',
    why: 'The solid weighs the same in 20MnCr5 and 42CrMo4, so the CAD cannot tell a '
      + 'carburised gear from a through-hardened one — and the choice changes the '
      + 'heat-treat route, the finishing route and the feeds the teeth are cut at.',
    options: [
      { value: 'case_hardening_steel', label: 'Case-hardening steel (20MnCr5 / 8620)', leaning: true,
        consequence: 'carburise + quench after cutting; hard finishing needed above class 8' },
      { value: 'through_hardening_steel', label: 'Through-hardening steel (42CrMo4 / EN19)',
        consequence: 'quench + temper; distortion lower than carburising' },
      { value: 'alloy_steel_prehardened', label: 'Pre-hardened alloy steel (~30 HRC)',
        consequence: 'no post-cut heat treat; slower cutting feeds' },
      { value: 'cast_iron', label: 'Cast iron / ADI',
        consequence: 'cast blank, austempered; no carburise' },
      { value: 'stainless', label: 'Stainless steel',
        consequence: 'slower feeds, no case hardening' },
      { value: 'bronze', label: 'Bronze (worm wheels)',
        consequence: 'free cutting, no heat treat' },
      { value: 'plastic', label: 'Engineering plastic (POM / PA)',
        consequence: 'cut soft or moulded; no heat treat' },
    ],
    blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
  };
}

function entryDecision(id: string, what: string, unit: string, why: string): Decision {
  return {
    id, kind: 'geometry_gap',
    question: `What is the ${what}?`,
    why,
    options: [{ value: 'enter', label: `Enter the ${what} off the drawing` }],
    entry: { kind: 'number', unit },
    blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
  };
}

// ── shared derivations ───────────────────────────────────────────────────────

/** Tooth count: measured off the B-rep, or typed off the drawing. */
function teethOf(ctx: RuleContext): { z: number; basis: string; source: 'geometry' | 'engineer'; conf: number } | null {
  const g = gearGeo(ctx);
  if (g) return { z: g.teeth, basis: g.teethBasis, source: 'geometry', conf: 0.95 };
  const typed = answeredEntry(ctx, GEAR_TEETH_DECISION_ID);
  if (typed && Number.isInteger(typed)) return { z: typed, basis: 'tooth count from the drawing (engineer)', source: 'engineer', conf: 1 };
  return null;
}

/** Tip OD: measured, or back-derived from a typed module + teeth. */
function tipOdOf(ctx: RuleContext): { od: number; basis: string } | null {
  const g = gearGeo(ctx);
  if (g) return { od: g.tipDiameterMm, basis: `measured tip Ø ${fmt(g.tipDiameterMm, 1)} mm` };
  const t = teethOf(ctx);
  const m = answeredEntry(ctx, GEAR_MODULE_DECISION_ID);
  const beta = answeredHelix(ctx);
  if (t && m && beta !== null) {
    const od = (m * t.z) / Math.cos(beta * Math.PI / 180) + 2 * m;
    return { od, basis: `tip Ø = mn·z/cos β + 2·mn = ${fmt(od, 1)} mm (from drawing figures)` };
  }
  return null;
}

/**
 * Normal module — the size figure everything scales from.
 *
 * With measured geometry: mn = tip Ø · derived from OD and z, corrected by the
 * answered helix (mn = da / (z/cos β + 2); spur reduces to OD/(z+2)). The
 * cross-check mn·(z/cos β + 2) ≈ measured OD is stated in the basis so a
 * non-standard addendum shows itself rather than hiding.
 */
function moduleOf(ctx: RuleContext): RuleOutcome<number> {
  const t = teethOf(ctx);
  if (!t) {
    return ask(entryDecision(GEAR_TEETH_DECISION_ID, 'tooth count', 'teeth',
      'No gear-like tip-circle pattern was measurable on this shape, so the tooth '
      + 'count cannot be counted off the B-rep.'));
  }
  const beta = answeredHelix(ctx);
  if (beta === null) return ask(helixDecision());

  const g = gearGeo(ctx);
  if (g) {
    const mn = g.tipDiameterMm / (t.z / Math.cos(beta * Math.PI / 180) + 2);
    const mnR = Math.round(mn * 100) / 100;
    const recon = mnR * (t.z / Math.cos(beta * Math.PI / 180) + 2);
    return decided('gear.normalModuleMm', mnR, 'geometry',
      `mn = tip Ø ${fmt(g.tipDiameterMm, 1)} / (z ${t.z}${beta ? `/cos ${fmt(beta, 1)}°` : ''} + 2) `
      + `= ${fmt(mnR)} mm — standard addendum; recon ${fmt(recon, 1)} mm vs measured OD `
      + `${fmt(g.tipDiameterMm, 1)} mm${assumed(ctx, GEAR_HELIX_DECISION_ID)}`,
      0.85, [GEAR_HELIX_DECISION_ID]);
  }
  const typed = answeredEntry(ctx, GEAR_MODULE_DECISION_ID);
  if (typed) {
    return decided('gear.normalModuleMm', typed, 'engineer',
      'normal module from the drawing (engineer)', 1, [GEAR_MODULE_DECISION_ID]);
  }
  return ask(entryDecision(GEAR_MODULE_DECISION_ID, 'normal module', 'mm',
    'No tip circle was measurable, so the module cannot be derived from OD/(z+2).'));
}

// ── the blank: bar stock + turning prep, stated in full ─────────────────────

interface BlankDerivation {
  /** Blank MATERIAL only, £ — bar slice net of chip recovery. */
  materialCost: number;
  materialBasis: string;
  /** Turning seconds to face/turn/bore the blank — a process OPERATION. */
  prepCycleSec: number;
  prepBasis: string;
  stockKg: number;
  netKg: number;
}

/**
 * The blank, split the way a cost engineer reads a breakdown:
 *
 *   - MATERIAL: sawn bar slice × library £/kg − chip recovery. This, and only
 *     this, belongs in the Raw Material bucket.
 *   - CONVERSION: face/turn/bore time at a stated removal rate. This is a
 *     lathe OPERATION and lands in the process/labour buckets.
 *
 * The first version summed both into one `blankCostPerPart`, which pushed
 * ~30% of the gear's cost into "Raw Material" and left the process bucket
 * implausibly small — a plant head caught it on the live report.
 *
 * Stock envelope: (tip Ø + 4 mm) × (face + 6 mm) — saw kerf, facing stock and
 * OD clean-up. Every figure appears in the basis; both lines are overridable
 * in the form, which is where a forged-blank quote would go (price in the
 * material line, prep cycle 0).
 */
function deriveBlank(ctx: RuleContext, matClass: GearMaterialClass): BlankDerivation | null {
  const od = tipOdOf(ctx);
  if (!od) return null;
  const g = gearGeo(ctx);
  const face = g?.faceWidthMm ?? answeredEntry(ctx, GEAR_FACE_DECISION_ID);
  if (!face) return null;
  const bore = g?.boreDiameterMm ?? 0;

  const grade = GRADE_BY_CLASS[matClass];
  const mat = DEFAULT_RATE_LIBRARY.materials.find(m => m.id === grade.id);
  if (!mat) return null;
  const rho = mat.densityKgPerM3; // kg/m³

  const stockOd = od.od + 4, stockLen = face + 6;
  const stockCm3 = Math.PI / 4 * stockOd * stockOd * stockLen / 1000;
  const stockKg = stockCm3 * rho / 1e6;
  const partCm3 = ctx.geo.volume?.cm3 ?? 0;
  const netKg = partCm3 * rho / 1e6;
  // Blank profile the lathe leaves: full cylinder at tip Ø, bored.
  const blankCm3 = Math.PI / 4 * (od.od * od.od - bore * bore) * face / 1000;
  const removalCm3 = Math.max(stockCm3 - blankCm3, 0);

  const materialCost = Math.round((stockKg * mat.pricePerKg
    - Math.max(stockKg - netKg, 0) * (mat.scrapRecoveryPricePerKg ?? 0)) * 100) / 100;

  const MRR = matClass === 'plastic' ? 80 : matClass === 'bronze' ? 60 : 40; // cm³/min turning
  const prepMin = 1.5 + removalCm3 / MRR;
  const prepCycleSec = Math.round(prepMin * 60);

  return {
    materialCost,
    prepCycleSec,
    stockKg: Math.round(stockKg * 1000) / 1000,
    netKg: Math.round(netKg * 1000) / 1000,
    materialBasis: `bar slice Ø${fmt(stockOd, 0)}×${fmt(stockLen, 0)} mm = ${fmt(stockKg, 2)} kg `
      + `${mat.grade} × £${fmt(mat.pricePerKg)}/kg − chips × £${fmt(mat.scrapRecoveryPricePerKg ?? 0)}/kg. `
      + 'MATERIAL only — turning is costed as an operation. '
      + 'Replace with the forged-blank quote (and zero the turning cycle) when one exists.',
    prepBasis: `face/turn/bore: ${fmt(removalCm3, 0)} cm³ off the bar @ ${MRR} cm³/min `
      + `+ 1.5 min load/datum = ${fmt(prepMin, 1)} min on the CNC lathe — costed as a process `
      + 'operation with machine rate, labour and OEE, not folded into material.',
  };
}

// ── the rules ────────────────────────────────────────────────────────────────

export const GEAR_RULES: CommodityRuleSpec = {
  commodity: 'gear',
  header: 'GEAR CUTTING COST INPUT RULES:',
  rules: [
    {
      id: 'gear.teeth',
      path: 'gear.teeth',
      fieldId: 'gear-teeth',
      label: 'teeth',
      evaluate: (ctx) => {
        const t = teethOf(ctx);
        if (!t) return ask(entryDecision(GEAR_TEETH_DECISION_ID, 'tooth count', 'teeth',
          'No gear-like tip-circle pattern was measurable on this shape, so the tooth '
          + 'count cannot be counted off the B-rep.'));
        return decided('gear.teeth', t.z, t.source, t.basis, t.conf);
      },
    },
    {
      id: 'gear.helixAngleDeg',
      path: 'gear.helixAngleDeg',
      fieldId: 'gear-helix',
      label: 'helixAngleDeg',
      evaluate: (ctx) => {
        const beta = answeredHelix(ctx);
        if (beta === null) return ask(helixDecision());
        const p = answerProvenance(ctx, GEAR_HELIX_DECISION_ID);
        return decided('gear.helixAngleDeg', beta, p.source,
          (beta === 0 ? 'spur — 0° helix' : `${fmt(beta, 1)}° helix, from the drawing`)
          + p.note + assumed(ctx, GEAR_HELIX_DECISION_ID),
          p.conf, [GEAR_HELIX_DECISION_ID]);
      },
    },
    {
      id: 'gear.normalModuleMm',
      path: 'gear.normalModuleMm',
      fieldId: 'gear-module',
      label: 'normalModuleMm',
      evaluate: moduleOf,
    },
    {
      id: 'gear.faceWidthMm',
      path: 'gear.faceWidthMm',
      fieldId: 'gear-face',
      label: 'faceWidthMm',
      evaluate: (ctx) => {
        const g = gearGeo(ctx);
        if (g) return decided('gear.faceWidthMm', g.faceWidthMm, 'geometry',
          `axial span of the tip-land patches = ${fmt(g.faceWidthMm, 1)} mm`, 0.9);
        const typed = answeredEntry(ctx, GEAR_FACE_DECISION_ID);
        if (typed) return decided('gear.faceWidthMm', typed, 'engineer',
          'face width from the drawing (engineer)', 1, [GEAR_FACE_DECISION_ID]);
        return ask(entryDecision(GEAR_FACE_DECISION_ID, 'face width', 'mm',
          'No gear-like tip pattern was measured, so the toothed face width cannot '
          + 'be read off the B-rep.'));
      },
    },
    {
      id: 'gear.internal',
      path: 'gear.internal',
      fieldId: 'gear-internal',
      label: 'internal',
      evaluate: (ctx) => {
        const g = gearGeo(ctx);
        return decided('gear.internal', g?.internal ?? false,
          g ? 'geometry' : 'rule',
          g ? 'tip patches face outward — external gear'
            : 'assumed external — override in the form for a ring gear', g ? 0.9 : 0.6);
      },
    },
    {
      id: 'gear.qualityClass',
      path: 'gear.qualityClass',
      fieldId: 'gear-quality',
      label: 'qualityClass (ISO 1328)',
      evaluate: (ctx) => {
        const q = answeredQuality(ctx);
        if (q === null) return ask(qualityDecision());
        const p = answerProvenance(ctx, GEAR_QUALITY_DECISION_ID);
        return decided('gear.qualityClass', q, p.source,
          `ISO 1328 class ${q}${p.note}${assumed(ctx, GEAR_QUALITY_DECISION_ID)}`,
          p.conf, [GEAR_QUALITY_DECISION_ID]);
      },
    },
    {
      id: 'gear.materialClass',
      path: 'gear.materialClass',
      fieldId: 'gear-matclass',
      label: 'materialClass',
      evaluate: (ctx) => {
        const mc = answeredMaterialClass(ctx);
        if (mc === null) return ask(materialClassDecision());
        const p = answerProvenance(ctx, GEAR_MATERIAL_DECISION_ID);
        return decided('gear.materialClass', mc, p.source,
          `${mc.replace(/_/g, ' ')}${p.note}`,
          p.conf, [GEAR_MATERIAL_DECISION_ID]);
      },
    },
    {
      id: 'gear.hardeningRoute',
      path: 'gear.hardeningRoute',
      fieldId: 'gear-hardening',
      label: 'hardeningRoute',
      evaluate: (ctx) => {
        const mc = answeredMaterialClass(ctx);
        if (mc === null) return ask(materialClassDecision());
        const chosen = answeredHardening(ctx);
        if (chosen) {
          // An answer folded in from the model's drawing read is NOT an
          // engineer's answer, and must not be printed as one — the same
          // provenance lie the material family already taught us.
          const prov = answerProvenance(ctx, GEAR_HARDENING_DECISION_ID);
          return decided('gear.hardeningRoute', chosen, prov.source,
            `${chosen.replace(/_/g, ' ')}${prov.note || ' — chosen by the engineer'}`,
            prov.conf, [GEAR_HARDENING_DECISION_ID]);
        }
        // Unanswered: ADVISORY, not blocking. Leaving the value unset is not a
        // gap — `effectiveHardeningRoute` falls back to the material class's own
        // route, so the costing runs and states what it assumed. The question is
        // raised because nitriding and induction hardening are chosen against a
        // load case the CAD cannot see, and either would change the operation
        // list rather than merely the rate.
        return ask(hardeningDecision(mc));
      },
    },
    {
      /**
       * Effective case depth — a DRAWING figure, and a costly one.
       *
       * Carburising time goes as ECD^2, so 0.6 -> 1.2 mm roughly quadruples the
       * carburising segment. Published rate cards famously do not price this
       * (the source workbook's Indian card rises 11% for a 50% deeper case),
       * which is why benchmarking against them under-costs a deep-case gear.
       *
       * Advisory, not blocking: 0.70 mm is the library reference and a defensible
       * default, and the basis says so. It only matters on carburising routes.
       */
      id: 'gear.effectiveCaseDepthMm',
      path: 'gear.effectiveCaseDepthMm',
      fieldId: 'gear-ecd',
      label: 'effectiveCaseDepthMm',
      evaluate: (ctx) => {
        const answered = answeredEntry(ctx, GEAR_CASE_DEPTH_DECISION_ID);
        if (answered && answered > 0 && answered < 5) {
          const prov = answerProvenance(ctx, GEAR_CASE_DEPTH_DECISION_ID);
          return decided('gear.effectiveCaseDepthMm', answered, prov.source,
            `${answered} mm effective case depth${prov.note || ' — from the drawing'}`,
            prov.conf, [GEAR_CASE_DEPTH_DECISION_ID]);
        }
        return decided('gear.effectiveCaseDepthMm', 0.70, 'library',
          'no case depth stated — using the 0.70 mm reference the cycle times are built around. '
          + 'Carburising time scales as ECD², so a drawing calling 1.2 mm costs roughly 3x the '
          + 'furnace time of one calling 0.7 mm; take it off the drawing before quoting.', 0.5);
      },
    },
    {
      id: 'gear.caseHardened',
      path: 'gear.caseHardened',
      fieldId: 'gear-caseh',
      label: 'caseHardened',
      evaluate: (ctx) => {
        const mc = answeredMaterialClass(ctx);
        if (mc === null) return ask(materialClassDecision());
        const route = answeredHardening(ctx) ?? defaultHardening(mc);
        const ch = route === 'case_hardening';
        return decided('gear.caseHardened', ch, 'rule',
          ch ? 'carburise + quench after cutting'
             : `route is ${route.replace(/_/g, ' ')}, not carburising`, 0.85,
          [GEAR_MATERIAL_DECISION_ID, GEAR_HARDENING_DECISION_ID]);
      },
    },
    {
      id: 'gear.materialId',
      path: 'gear.materialId',
      fieldId: 'gear-mat',
      label: 'materialId',
      evaluate: (ctx) => {
        const mc = answeredMaterialClass(ctx);
        if (mc === null) return ask(materialClassDecision());
        const g = GRADE_BY_CLASS[mc];
        return decided('gear.materialId', g.id, 'library',
          `${g.note} — representative grade for ${mc.replace(/_/g, ' ')}`
          + assumed(ctx, GEAR_MATERIAL_DECISION_ID), 0.85,
          [GEAR_MATERIAL_DECISION_ID]);
      },
    },
    {
      id: 'gear.netWeightKg',
      path: 'gear.netWeightKg',
      fieldId: 'gear-net-wt',
      label: 'netWeightKg',
      evaluate: (ctx) => {
        const mc = answeredMaterialClass(ctx);
        if (mc === null) return ask(materialClassDecision());
        const vol = ctx.geo.volume?.cm3;
        if (!vol) return ask(entryDecision('gear.netWeight', 'net gear weight', 'kg',
          'No volume was measured, so the weight cannot be derived.'));
        const mat = DEFAULT_RATE_LIBRARY.materials.find(m => m.id === GRADE_BY_CLASS[mc].id);
        const kg = Math.round(vol * (mat?.densityKgPerM3 ?? 7850) / 1e6 * 1000) / 1000;
        return decided('gear.netWeightKg', kg, 'geometry',
          `${fmt(vol, 0)} cm³ × ${((mat?.densityKgPerM3 ?? 7850) / 1000).toFixed(2)} g/cm³ `
          + `(${mat?.grade ?? mc})`, 0.9, [GEAR_MATERIAL_DECISION_ID]);
      },
    },
    {
      id: 'gear.blankCostPerPart',
      path: 'gear.blankCostPerPart',
      fieldId: 'gear-blank-cost',
      label: 'blankMaterialCostPerPart',
      evaluate: (ctx) => {
        const mc = answeredMaterialClass(ctx);
        if (mc === null) return ask(materialClassDecision());
        const b = deriveBlank(ctx, mc);
        if (!b) return ask(entryDecision('gear.blankCost', 'blank material cost per part', '£',
          'The blank envelope could not be derived from the measured geometry.'));
        return decided('gear.blankCostPerPart', b.materialCost, 'rule', b.materialBasis, 0.6,
          [GEAR_MATERIAL_DECISION_ID, GEAR_HELIX_DECISION_ID]);
      },
    },
    {
      // Conversion, not material: the lathe minutes to make the blank. Costed
      // downstream as an operation so it lands in the process/labour buckets.
      id: 'gear.blankPrepCycleSec',
      path: 'gear.blankPrepCycleSec',
      fieldId: 'gear-prep-ct',
      label: 'blankPrepCycleSec',
      evaluate: (ctx) => {
        const mc = answeredMaterialClass(ctx);
        if (mc === null) return ask(materialClassDecision());
        const b = deriveBlank(ctx, mc);
        if (!b) return ask(entryDecision('gear.blankPrep', 'blank turning cycle', 's',
          'The blank envelope could not be derived from the measured geometry.'));
        return decided('gear.blankPrepCycleSec', b.prepCycleSec, 'rule', b.prepBasis, 0.55,
          [GEAR_MATERIAL_DECISION_ID, GEAR_HELIX_DECISION_ID]);
      },
    },
    {
      // The cutting cycle, from the SAME generating kinematics the costing
      // runs (`analyseGear`) — so the analysis shell and the money can never
      // disagree, and the sanity layer sees a real number instead of 0.
      id: 'gear.cycleTimeHr',
      path: 'gear.cycleTimeHr',
      label: 'cycleTimeHr',
      evaluate: (ctx) => {
        const t = teethOf(ctx);
        if (!t) return ask(entryDecision(GEAR_TEETH_DECISION_ID, 'tooth count', 'teeth',
          'No gear-like tip-circle pattern was measurable on this shape.'));
        const beta = answeredHelix(ctx);
        if (beta === null) return ask(helixDecision());
        const q = answeredQuality(ctx);
        if (q === null) return ask(qualityDecision());
        const mc = answeredMaterialClass(ctx);
        if (mc === null) return ask(materialClassDecision());
        const m = moduleOf(ctx);
        if (!m.ok) return m;
        const g = gearGeo(ctx);
        const face = g?.faceWidthMm ?? answeredEntry(ctx, GEAR_FACE_DECISION_ID);
        if (!face) return ask(entryDecision(GEAR_FACE_DECISION_ID, 'face width', 'mm',
          'No gear-like tip pattern was measured, so the toothed face width is unknown.'));
        const a = analyseGear({
          normalModuleMm: m.decided.value, teeth: t.z, helixAngleDeg: beta, faceWidthMm: face,
          internal: g?.internal ?? false, qualityClass: q, materialClass: mc,
          caseHardened: mc === 'case_hardening_steel',
          blankCostPerPart: 0, netWeightKg: 1,           // cycle only — no money read here
          materialId: GRADE_BY_CLASS[mc].id,
          annualVolume: ctx.annualVolume,
          amortizationVolume: Math.max(ctx.annualVolume, 1),
          batchSize: Math.max(50, Math.round(ctx.annualVolume / 12)),
        });
        // A blocked route (outside machine envelope / module bands) must not be
        // silently costed — the throw is caught by the engine and recorded.
        if (a.blocked) throw new Error(a.blocked);
        const hr = Math.round(a.totalCycleSec / 3600 * 10000) / 10000;
        return decided('gear.cycleTimeHr', hr, 'rule',
          `${a.operations.map(o => `${o.label} ${o.cycleSec.toFixed(0)}s`).join(' + ')} `
          + `= ${a.totalCycleSec.toFixed(0)} s — generating kinematics, same arithmetic as the costing`,
          0.7, [GEAR_HELIX_DECISION_ID, GEAR_QUALITY_DECISION_ID, GEAR_MATERIAL_DECISION_ID]);
      },
    },
    {
      id: 'gear.batchSize',
      path: 'gear.batchSize',
      fieldId: 'gear-batch',
      label: 'batchSize',
      evaluate: (ctx) => {
        const batch = Math.max(50, Math.round(ctx.annualVolume / 12 / 10) * 10);
        return decided('gear.batchSize', batch, 'rule',
          `monthly delivery batches: ${ctx.annualVolume.toLocaleString()}/yr ÷ 12`, 0.6);
      },
    },
  ],
};
