/**
 * Gear process routing — which operations this gear needs, and why.
 *
 * ## The thing this file exists to get right
 *
 * Quality grade is not a multiplier. A tool that costs ISO class 5 as
 * "class 8 x 1.4" is wrong in kind, not in degree: the class-5 gear is not a
 * class-8 gear made more carefully, it is a class-8 gear that has then been heat
 * treated and ground, on two more machines, with two more setups and another
 * tool to buy. `adviseGearRoute` therefore returns an ORDERED LIST OF
 * OPERATIONS, and a tighter grade appends to it.
 *
 * The same holds for internal vs external. An internal ring gear is not a
 * harder external gear — a hob physically cannot reach into a bore, so the
 * routing changes to shaping, skiving or broaching. Geometry decides, not a
 * difficulty factor.
 *
 * ## Sources for the routing logic
 *
 * The achievable-quality bands and the route sequence follow published industry
 * practice, cited per entry in `GEAR_PROCESS_REFERENCE`. The classic sequence
 * for a precision gear is hob → shave → harden → grind, with honing after
 * grinding where noise matters. What is NOT sourced — and is marked as such —
 * is every number the cycle model consumes; those live in `gear-shop-data.ts`.
 */

/** ISO 1328 flank tolerance class. Lower is tighter. Automotive lands 5–8. */
export type GearQualityClass = number;

export type GearProcess =
  | 'hobbing'
  | 'shaping'
  | 'skiving'
  | 'broaching'
  | 'milling_5ax'
  | 'shaving'
  | 'grinding'
  | 'honing'
  | 'case_hardening'
  | 'quench_temper'
  | 'deburr'
  | 'inspection';

export interface GearProcessReference {
  process: GearProcess;
  label: string;
  /** Best ISO 1328 flank class the process holds unaided. Lower is tighter. */
  bestQualityClass: GearQualityClass;
  /** Can it cut an internal gear at all? */
  internalCapable: boolean;
  externalCapable: boolean;
  /** Practical normal-module window, mm. */
  moduleRangeMm: [number, number];
  /** Where the band comes from. Every entry carries one. */
  source: string;
  note?: string;
}

/**
 * Achievable quality by process.
 *
 * ISO 1328 classes here, converted from the AGMA figures in the cited sources:
 * AGMA quality Q roughly maps to ISO class 17 − Q, so AGMA 8–10 is ISO 9–7 and
 * AGMA 12–13 is ISO 5–4. The mapping is approximate and stated as such — it is
 * used only to pick a route, never to certify a gear.
 */
export const GEAR_PROCESS_REFERENCE: Record<GearProcess, GearProcessReference> = {
  hobbing: {
    process: 'hobbing', label: 'Gear hobbing',
    bestQualityClass: 7, internalCapable: false, externalCapable: true,
    moduleRangeMm: [0.5, 25],
    source: 'Industry practice: modern hobbing holds AGMA 8–10 (ISO 7–9) in production. '
      + 'A hob cannot run out inside a bore, so external only.',
    note: 'The productivity default for external gears at volume.',
  },
  shaping: {
    process: 'shaping', label: 'Gear shaping (Fellows)',
    bestQualityClass: 7, internalCapable: true, externalCapable: true,
    moduleRangeMm: [0.5, 12],
    source: 'Industry practice: shaping is the classic route for internal gears, cluster gears '
      + 'and shouldered forms where a hob has no run-out. Comparable accuracy to hobbing.',
    note: 'Loses to skiving on productivity — the cutter is idle on every return stroke.',
  },
  skiving: {
    process: 'skiving', label: 'Power skiving',
    bestQualityClass: 6, internalCapable: true, externalCapable: true,
    moduleRangeMm: [0.5, 8],
    source: 'Power skiving gives 2–3x the productivity and tool life of shaping and reaches '
      + 'ISO class 6 on internal automotive gears; displacing shaping and broaching on EV '
      + 'transmissions.',
    note: 'Rough and finish in one clamping, which removes a re-clamp error source.',
  },
  broaching: {
    process: 'broaching', label: 'Internal gear / spline broaching',
    bestQualityClass: 7, internalCapable: true, externalCapable: false,
    moduleRangeMm: [0.5, 6],
    source: 'Industry practice: single-stroke broaching is the highest-volume internal spline '
      + 'route; tool cost is high and the tool is geometry-specific, so it needs volume.',
    note: 'Fastest per part, least flexible — one broach cuts one geometry.',
  },
  milling_5ax: {
    process: 'milling_5ax', label: '5-axis gear milling',
    bestQualityClass: 9, internalCapable: true, externalCapable: true,
    moduleRangeMm: [0.5, 40],
    source: 'Industry practice: universal milling is the prototype and one-off route — greatest '
      + 'flexibility, lowest productivity, no dedicated tooling.',
    note: 'Use when volume cannot justify a hob or cutter.',
  },
  shaving: {
    process: 'shaving', label: 'Gear shaving',
    bestQualityClass: 6, internalCapable: false, externalCapable: true,
    moduleRangeMm: [0.5, 8],
    source: 'Industry practice: shaving is the SOFT finishing step in hob → shave → harden → '
      + 'grind. Improves the cut gear before heat treat; cannot correct distortion after it.',
  },
  grinding: {
    process: 'grinding', label: 'Gear grinding',
    bestQualityClass: 4, internalCapable: true, externalCapable: true,
    moduleRangeMm: [0.5, 12],
    source: 'CNC gear grinding reaches AGMA 12–13+ (ISO 4–5, DIN 3–4). The only route that '
      + 'corrects heat-treat distortion, so it is the finishing step for hardened gears.',
    note: 'The most expensive operation in the route. Adding it is why a tight class costs.',
  },
  honing: {
    process: 'honing', label: 'Gear honing',
    bestQualityClass: 5, internalCapable: false, externalCapable: true,
    moduleRangeMm: [0.5, 6],
    source: 'Industry practice: honing follows grinding where surface finish drives noise — '
      + 'typically quiet-running automotive transmission gears.',
    note: 'Bought for NVH, not for geometry.',
  },
  case_hardening: {
    process: 'case_hardening', label: 'Carburise, quench and temper',
    bestQualityClass: 99, internalCapable: true, externalCapable: true,
    moduleRangeMm: [0.1, 50],
    source: 'Standard treatment for case-hardening gear steels (20MnCr5, 8620). Distorts the '
      + 'cut geometry, which is what makes a hard finishing operation necessary.',
  },
  quench_temper: {
    process: 'quench_temper', label: 'Harden and temper (through-hardening)',
    bestQualityClass: 99, internalCapable: true, externalCapable: true,
    moduleRangeMm: [0.1, 50],
    source: 'Standard treatment for through-hardening gear steels (42CrMo4/EN19): austenitise, '
      + 'oil quench, temper to ~30–45 HRC through the section. No carbon case, but it still '
      + 'distorts the cut geometry — the same reason a tight class must grind afterwards.',
  },
  deburr: {
    process: 'deburr', label: 'Chamfer and deburr',
    bestQualityClass: 99, internalCapable: true, externalCapable: true,
    moduleRangeMm: [0.1, 50],
    source: 'Every cut gear needs its tooth-end burrs removed before heat treat.',
  },
  inspection: {
    process: 'inspection', label: 'Gear inspection',
    bestQualityClass: 99, internalCapable: true, externalCapable: true,
    moduleRangeMm: [0.1, 50],
    source: 'Profile, lead, pitch and runout on a gear checker. Sampling rate rises as the '
      + 'class tightens.',
  },
};

export interface GearRouteInputs {
  normalModuleMm: number;
  teeth: number;
  helixAngleDeg: number;
  faceWidthMm: number;
  internal: boolean;
  /** ISO 1328 flank class. Lower is tighter. */
  qualityClass: GearQualityClass;
  /** Case-hardening steels must be hardened, and hardening forces hard finishing. */
  caseHardened: boolean;
  /**
   * Through-hardening steel (42CrMo4/EN19), hardened AFTER cutting.
   *
   * A quench-and-temper is a real furnace cost and a real distortion source,
   * and the route used to ignore it entirely: a through-hardened gear carried
   * £0 of heat treat, silently (caught in the plant head's heat-treat audit).
   * Mutually exclusive with `caseHardened` — the caller derives both from the
   * material class.
   */
  throughHardened?: boolean;
  /** Noise-critical — buys a honing pass that geometry alone would not. */
  nvhCritical?: boolean;
  annualVolume: number;
  /** Force the cutting process, bypassing selection. The engineer's override. */
  forcedCuttingProcess?: GearProcess;
}

export interface GearRouteStep {
  process: GearProcess;
  label: string;
  /** Why this step is in the route. Printed in the report next to the cost. */
  reason: string;
}

export interface GearRouteRecommendation {
  /** The tooth-generating operation. Everything else hangs off this choice. */
  cuttingProcess: GearProcess;
  /** Ordered, as the gear would travel the shop. */
  steps: GearRouteStep[];
  /** Class the route can hold, from its tightest step. */
  achievableQualityClass: GearQualityClass;
  /** Set when nothing in the catalogue can make this gear. Blocks the costing. */
  blocked?: string;
  /** Non-fatal cautions — an unusual choice that is still costable. */
  warnings: string[];
}

/**
 * ISO classes lost to carburise-and-quench distortion, minimum.
 *
 * Press quenching and good fixturing hold it to one class; free quenching
 * loses two or more. One is the OPTIMISTIC bound, which is the right default
 * for deciding whether hard finishing is needed: a route that needs grinding
 * at the optimistic bound certainly needs it in the real furnace.
 */
export const CASE_HARDENING_DISTORTION_CLASSES = 1;
/** Volume above which a dedicated broach can pay for itself. Empirical, stated. */
export const BROACHING_VOLUME_THRESHOLD = 250_000;
/** Below this, dedicated gear tooling rarely pays and milling wins. */
export const PROTOTYPE_VOLUME_THRESHOLD = 250;

/**
 * Pick the route.
 *
 * Order matters: geometry first (can the process physically reach?), then volume
 * (does the tooling pay?), then quality (what must be added to hold the class?).
 * Reversing that order is how a tool ends up recommending a hob for an internal
 * ring gear because the quality band happened to match.
 */
export function adviseGearRoute(i: GearRouteInputs): GearRouteRecommendation {
  const warnings: string[] = [];
  const steps: GearRouteStep[] = [];

  const fits = (p: GearProcess): boolean => {
    const r = GEAR_PROCESS_REFERENCE[p];
    const [lo, hi] = r.moduleRangeMm;
    return (i.internal ? r.internalCapable : r.externalCapable)
      && i.normalModuleMm >= lo && i.normalModuleMm <= hi;
  };

  // ── 1. The tooth-generating operation ──────────────────────────────────────
  let cutting: GearProcess;
  let cuttingReason: string;

  if (i.forcedCuttingProcess) {
    cutting = i.forcedCuttingProcess;
    cuttingReason = 'Process pinned by the engineer.';
    if (!fits(cutting)) {
      warnings.push(
        `${GEAR_PROCESS_REFERENCE[cutting].label} was pinned but is outside its envelope for a `
        + `${i.internal ? 'internal' : 'external'} module ${i.normalModuleMm} gear `
        + `(${GEAR_PROCESS_REFERENCE[cutting].moduleRangeMm.join('–')} mm, `
        + `${GEAR_PROCESS_REFERENCE[cutting].internalCapable ? 'internal ok' : 'external only'}). `
        + 'Costed as instructed.');
    }
  } else if (i.annualVolume < PROTOTYPE_VOLUME_THRESHOLD && fits('milling_5ax')) {
    cutting = 'milling_5ax';
    cuttingReason = `At ${i.annualVolume.toLocaleString()}/yr a dedicated hob or cutter cannot `
      + `amortise; 5-axis milling needs no gear-specific tooling.`;
  } else if (i.internal) {
    if (i.annualVolume >= BROACHING_VOLUME_THRESHOLD && fits('broaching')) {
      cutting = 'broaching';
      cuttingReason = `Internal teeth at ${i.annualVolume.toLocaleString()}/yr — a dedicated `
        + `broach is the fastest per part and the volume carries the tool cost.`;
    } else if (fits('skiving')) {
      cutting = 'skiving';
      cuttingReason = 'Internal teeth — a hob cannot reach into a bore. Power skiving gives '
        + '2–3x the productivity and tool life of shaping and roughs and finishes in one clamping.';
    } else if (fits('shaping')) {
      cutting = 'shaping';
      cuttingReason = `Internal teeth at module ${i.normalModuleMm} is outside the skiving `
        + `envelope, so shaping is the route.`;
    } else {
      return {
        cuttingProcess: 'shaping', steps: [], achievableQualityClass: 99, warnings,
        blocked: `No catalogued process cuts an internal module ${i.normalModuleMm} gear. `
          + `Skiving covers ${GEAR_PROCESS_REFERENCE.skiving.moduleRangeMm.join('–')} mm and `
          + `shaping ${GEAR_PROCESS_REFERENCE.shaping.moduleRangeMm.join('–')} mm.`,
      };
    }
  } else if (fits('hobbing')) {
    cutting = 'hobbing';
    cuttingReason = 'External teeth at volume — hobbing is the productivity default.';
  } else if (fits('milling_5ax')) {
    cutting = 'milling_5ax';
    cuttingReason = `Module ${i.normalModuleMm} is outside the hobbing envelope `
      + `(${GEAR_PROCESS_REFERENCE.hobbing.moduleRangeMm.join('–')} mm); milled instead.`;
  } else {
    return {
      cuttingProcess: 'hobbing', steps: [], achievableQualityClass: 99, warnings,
      blocked: `No catalogued process cuts an external module ${i.normalModuleMm} gear.`,
    };
  }

  steps.push({ process: cutting, label: GEAR_PROCESS_REFERENCE[cutting].label, reason: cuttingReason });
  steps.push({
    process: 'deburr', label: GEAR_PROCESS_REFERENCE.deburr.label,
    reason: 'Tooth-end burrs from cutting must come off before heat treat.',
  });

  // ── 2. Quality: what must be ADDED to hold the class ───────────────────────
  const asCut = GEAR_PROCESS_REFERENCE[cutting].bestQualityClass;
  const needsFinishing = i.qualityClass < asCut;

  if (i.caseHardened) {
    // Hardening distorts, and the distortion costs AT LEAST one ISO class: a
    // gear hobbed to class 7 comes out of the carburising furnace at 8 or
    // worse. So on a hardened gear the class the customer receives is
    // `asCut + CASE_HARDENING_DISTORTION_CLASSES`, and any requested class
    // tighter than that MUST buy a hard-finishing operation after the furnace.
    // The old rule compared against `asCut` alone, which let a "class 7"
    // carburised gear ship the as-hobbed route with only a warning — the exact
    // cheap-confident-wrong shape this module exists to refuse (a plant head
    // caught it in the live cost report: process bucket implausibly small).
    const deliveredAsHardened = asCut + CASE_HARDENING_DISTORTION_CLASSES;
    if (i.qualityClass < deliveredAsHardened) {
      steps.push({
        process: 'case_hardening', label: GEAR_PROCESS_REFERENCE.case_hardening.label,
        reason: 'Case-hardening steel — carburise, quench and temper for surface durability.',
      });
      steps.push({
        process: 'grinding', label: GEAR_PROCESS_REFERENCE.grinding.label,
        reason: `${GEAR_PROCESS_REFERENCE[cutting].label} holds class ${asCut} as-cut, and `
          + `carburising distorts at least ${CASE_HARDENING_DISTORTION_CLASSES} class — as-hardened `
          + `this gear delivers class ${deliveredAsHardened} at best, tighter than nothing. `
          + `ISO class ${i.qualityClass} therefore requires grinding after heat treat: the only `
          + `operation that corrects both the cut and the distortion.`,
      });
    } else {
      steps.push({
        process: 'case_hardening', label: GEAR_PROCESS_REFERENCE.case_hardening.label,
        reason: 'Case-hardening steel — carburise, quench and temper for surface durability.',
      });
      warnings.push(
        `Class ${i.qualityClass} survives heat-treat distortion on the as-cut `
        + `${GEAR_PROCESS_REFERENCE[cutting].label} geometry (class ${asCut} + `
        + `${CASE_HARDENING_DISTORTION_CLASSES} distortion allowance), so no hard finishing was `
        + `added. Confirm with the plant whether this part runs as-hardened.`);
    }
  } else if (i.throughHardened) {
    // Quench-and-temper after cutting: same furnace-distorts-the-flanks logic
    // as carburising, and the same rule — a class the distorted geometry cannot
    // deliver must buy grinding AFTER the furnace. (At ~30–45 HRC through the
    // section, soft finishing after Q&T is not an option.)
    const deliveredAsHardened = asCut + CASE_HARDENING_DISTORTION_CLASSES;
    steps.push({
      process: 'quench_temper', label: GEAR_PROCESS_REFERENCE.quench_temper.label,
      reason: 'Through-hardening steel — harden and temper after cutting for core strength.',
    });
    if (i.qualityClass < deliveredAsHardened) {
      steps.push({
        process: 'grinding', label: GEAR_PROCESS_REFERENCE.grinding.label,
        reason: `${GEAR_PROCESS_REFERENCE[cutting].label} holds class ${asCut} as-cut and `
          + `quench-and-temper distorts at least ${CASE_HARDENING_DISTORTION_CLASSES} class — `
          + `ISO class ${i.qualityClass} requires grinding after the furnace.`,
      });
    } else {
      warnings.push(
        `Class ${i.qualityClass} survives quench-and-temper distortion on the as-cut `
        + `${GEAR_PROCESS_REFERENCE[cutting].label} geometry, so no hard finishing was added. `
        + 'Confirm with the plant whether this part runs as-hardened.');
    }
  } else if (needsFinishing) {
    // Not hardened, so a soft finishing pass is enough and far cheaper.
    if (fits('shaving') && i.qualityClass >= GEAR_PROCESS_REFERENCE.shaving.bestQualityClass) {
      steps.push({
        process: 'shaving', label: GEAR_PROCESS_REFERENCE.shaving.label,
        reason: `ISO class ${i.qualityClass} is tighter than ${GEAR_PROCESS_REFERENCE[cutting].label} `
          + `holds as-cut (class ${asCut}). The gear is not hardened, so shaving is enough and is `
          + `much cheaper than grinding.`,
      });
    } else {
      steps.push({
        process: 'grinding', label: GEAR_PROCESS_REFERENCE.grinding.label,
        reason: `ISO class ${i.qualityClass} is beyond what cutting or shaving holds; grinding is `
          + `the only route to it.`,
      });
    }
  }

  if (i.nvhCritical) {
    steps.push({
      process: 'honing', label: GEAR_PROCESS_REFERENCE.honing.label,
      reason: 'Noise-critical — honing improves flank finish beyond what grinding leaves.',
    });
  }

  steps.push({
    process: 'inspection', label: GEAR_PROCESS_REFERENCE.inspection.label,
    reason: `Profile, lead, pitch and runout verified against ISO 1328 class ${i.qualityClass}.`,
  });

  const achievable = Math.min(
    ...steps.map(s => GEAR_PROCESS_REFERENCE[s.process].bestQualityClass));
  if (achievable > i.qualityClass) {
    warnings.push(
      `The selected route holds ISO class ${achievable} at best, but class ${i.qualityClass} was `
      + `asked for. The cost below is for the route shown and does NOT buy the requested class.`);
  }

  return { cuttingProcess: cutting, steps, achievableQualityClass: achievable, warnings };
}
