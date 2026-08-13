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
  | 'nitriding'
  | 'induction_hardening'
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
  nitriding: {
    process: 'nitriding', label: 'Nitride (gas/plasma)',
    bestQualityClass: 99, internalCapable: true, externalCapable: true,
    // Beyond ~m8 the Hertzian contact stress runs deeper than a nitrided case
    // can reach and the flank collapses under it. The window is a load limit,
    // not a machine envelope.
    moduleRangeMm: [0.5, 8],
    source: 'Diffusion of nitrogen at ~500-570 C, below the transformation temperature. No phase '
      + 'change, so distortion is minimal and the cut geometry survives the furnace. Case is thin '
      + '(0.2-0.6 mm) and very hard; cycles run 10-90 h, so it is dear per kg and slow.',
    note: 'Specified to AVOID hard finishing. Grinding after nitriding removes the case.',
  },
  induction_hardening: {
    process: 'induction_hardening', label: 'Induction harden and temper',
    bestQualityClass: 99, internalCapable: true, externalCapable: true,
    moduleRangeMm: [1, 25],
    source: 'Localised RF heating of the flanks and roots followed by an immediate quench. '
      + 'Seconds per part rather than furnace hours, run on a rated machine rather than bought by '
      + 'weight, and it hardens only the teeth - the bore and web stay as machined.',
    note: 'Needs ~0.35% C or more to form martensite. The inductor coil is geometry-specific NRE.',
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
  /**
   * The hardening route, explicitly.
   *
   * Wins over the two legacy booleans when set. It exists because nitriding and
   * induction hardening are CHOICES an engineer makes against a load case, not
   * properties derivable from the material grade: 42CrMo4 is routinely
   * through-hardened, nitrided or induction hardened, and the three produce
   * different routes, different distortion and different money.
   */
  hardeningRoute?: HardeningRoute;
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

/** The furnace/coil pass a gear takes after cutting. `none` = left soft. */
export type HardeningRoute =
  | 'none' | 'case_hardening' | 'quench_temper' | 'nitriding' | 'induction_hardening';

/**
 * ISO classes lost to hardening distortion, minimum, by route.
 *
 * The figures are OPTIMISTIC bounds, which is the right default for deciding
 * whether hard finishing is needed: a route that needs grinding at the
 * optimistic bound certainly needs it in the real furnace. Press quenching and
 * good fixturing hold carburising to one class; free quenching loses two.
 *
 * Nitriding's ZERO is the entry that earns this table. It runs at ~500-570 °C,
 * below the transformation temperature, so the part does not go through a phase
 * change and barely moves — which is precisely why the route gets specified,
 * and why a nitrided gear can ship straight off the hobber.
 */
export const HARDENING_DISTORTION_CLASSES: Record<HardeningRoute, number> = {
  none: 0,
  case_hardening: 1,
  quench_temper: 1,
  nitriding: 0,
  induction_hardening: 1,
};

/** Back-compat alias for the carburising figure this table generalised. */
export const CASE_HARDENING_DISTORTION_CLASSES =
  HARDENING_DISTORTION_CLASSES.case_hardening;

/**
 * Routes whose hardening step comes LAST, after any grinding.
 *
 * For every other route the furnace distorts the flanks and grinding follows to
 * correct it. Nitriding inverts that: it adds no distortion to correct, and its
 * 0.2-0.6 mm case would be ground straight off. So the gear is finished to size
 * first and nitrided last.
 */
export const NITRIDES_LAST = new Set<HardeningRoute>(['nitriding']);

/** Why each hardening route is on the routing, in the engineer's words. */
const HARDENING_REASON: Record<Exclude<HardeningRoute, 'none'>, string> = {
  case_hardening: 'Case-hardening steel — carburise, quench and temper for a deep, hard case '
    + 'over a tough core.',
  quench_temper: 'Through-hardening steel — harden and temper after cutting for core strength.',
  nitriding: 'Nitrided for surface hardness without distortion — no phase change, so the cut '
    + 'geometry survives the furnace and hard finishing can often be skipped entirely.',
  induction_hardening: 'Induction hardened — the flanks and roots are heated and quenched '
    + 'locally in seconds, so only the teeth are hardened and the bore and web stay machinable.',
};

/**
 * Which material classes each hardening route can actually treat.
 *
 * Metallurgy, not preference. Carburising needs a low-carbon steel to diffuse
 * carbon INTO; induction hardening needs enough carbon already present (~0.35%+)
 * to form martensite, which is why a 0.20% C case-hardening grade cannot be
 * induction hardened to any useful hardness; nitriding needs nitride-forming
 * alloying (Al, Cr, Mo, V). The value is the refusal reason, shown to the
 * engineer — a route that cannot work must not be silently priced.
 */
export const HARDENING_ROUTE_UNSUITABLE: Record<
  Exclude<HardeningRoute, 'none'>, Partial<Record<string, string>>
> = {
  case_hardening: {
    plastic: 'a polymer has no metallurgy to harden.',
    bronze: 'a copper alloy has no iron matrix to diffuse carbon into.',
    cast_iron: 'cast iron is already carbon-saturated — its hardening routes are flame, induction '
      + 'or austempering, and austempering is priced inside the ADI material.',
    alloy_steel_prehardened: 'a pre-hardened bar arrives at hardness; the whole point of the grade '
      + 'is that no post-cut furnace pass is needed.',
  },
  quench_temper: {
    plastic: 'a polymer has no metallurgy to harden.',
    bronze: 'a copper alloy does not harden by quenching.',
    alloy_steel_prehardened: 'the bar is supplied already quenched and tempered.',
  },
  nitriding: {
    plastic: 'a polymer has no metallurgy to harden.',
    bronze: 'nitriding needs nitride-forming alloying (Al, Cr, Mo, V) in an iron matrix.',
    case_hardening_steel: '20MnCr5/8620 carry too little nitride-forming alloy to build a useful '
      + 'nitrided case — they are specified to be carburised. Nitride 31CrMoV9 or 42CrMo4 instead.',
  },
  induction_hardening: {
    plastic: 'a polymer has no metallurgy to harden.',
    bronze: 'a copper alloy does not form martensite.',
    case_hardening_steel: 'a 0.20% carbon case-hardening grade cannot form martensite on induction '
      + 'heating — there is no carbon in solution to quench. Induction hardening needs ~0.35% C '
      + 'or more, so use 42CrMo4/1045, or carburise this grade instead.',
    alloy_steel_prehardened: 'the bar is already at hardness through the section.',
  },
};

/** Resolve the explicit route, falling back to the legacy boolean flags. */
export function resolveHardeningRoute(
  i: Pick<GearRouteInputs, 'hardeningRoute' | 'caseHardened' | 'throughHardened'>,
): HardeningRoute {
  if (i.hardeningRoute) return i.hardeningRoute;
  if (i.caseHardened) return 'case_hardening';
  if (i.throughHardened) return 'quench_temper';
  return 'none';
}
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

  const hardening = resolveHardeningRoute(i);
  if (hardening !== 'none') {
    // Hardening distorts, and the distortion costs ISO classes. A gear hobbed
    // to class 7 comes out of a carburising furnace at 8 or worse, so the class
    // the customer actually receives is `asCut + distortion`, and any requested
    // class tighter than that MUST buy a hard-finishing operation. Comparing
    // against `asCut` alone let a "class 7" carburised gear ship the as-hobbed
    // route with only a warning — the cheap-confident-wrong shape this module
    // exists to refuse (a plant head caught it on a live cost report).
    //
    // Nitriding is the exception that makes the rule worth modelling: it runs
    // below the transformation temperature and barely moves the part, so it
    // costs ZERO classes. That is why it is specified — and it changes the
    // ORDER of the route, not just the price. See `NITRIDES_LAST`.
    const distortion = HARDENING_DISTORTION_CLASSES[hardening];
    const delivered = asCut + distortion;
    const ref = GEAR_PROCESS_REFERENCE[hardening];
    const furnace = { process: hardening, label: ref.label, reason: HARDENING_REASON[hardening] };
    const needsHardFinish = i.qualityClass < delivered;

    if (NITRIDES_LAST.has(hardening)) {
      // Grind BEFORE the furnace. Two independent reasons, either sufficient:
      // the nitrided case is 0.2–0.6 mm and grinding it afterwards would cut
      // straight through the hardness that was just bought; and nitriding does
      // not distort, so there is nothing after the furnace left to correct.
      if (needsHardFinish) {
        steps.push({
          process: 'grinding', label: GEAR_PROCESS_REFERENCE.grinding.label,
          reason: `ISO class ${i.qualityClass} is tighter than ${GEAR_PROCESS_REFERENCE[cutting].label} `
            + `holds as-cut (class ${asCut}), so the flanks are ground to size FIRST. Nitriding `
            + 'adds no distortion to correct afterwards, and grinding a nitrided flank would '
            + 'remove the thin case — so on this route grinding precedes the furnace.',
        });
      }
      steps.push(furnace);
      if (!needsHardFinish) {
        warnings.push(
          `Nitriding holds the as-cut geometry (class ${asCut}), so no hard finishing was added — `
          + 'this is the reason the route is specified. Confirm the flank load case suits a thin '
          + 'nitrided case rather than a deep carburised one.');
      }
      // The nitrided case is shallow. On a coarse-module gear the contact
      // stress runs deeper than the case and the flank collapses beneath it —
      // a failure a cost model must not price away silently.
      const [, nitrideMaxModule] = ref.moduleRangeMm;
      if (i.normalModuleMm > nitrideMaxModule) {
        warnings.push(
          `Module ${i.normalModuleMm} mm is beyond the ${nitrideMaxModule} mm the nitrided case `
          + 'depth practically supports — contact stress reaches below the case and risks flank '
          + 'crushing. Confirm with the gear engineer, or carburise instead.');
      }
    } else {
      steps.push(furnace);
      if (needsHardFinish) {
        steps.push({
          process: 'grinding', label: GEAR_PROCESS_REFERENCE.grinding.label,
          reason: `${GEAR_PROCESS_REFERENCE[cutting].label} holds class ${asCut} as-cut, and `
            + `${ref.label.toLowerCase()} distorts at least ${distortion} class — as-hardened this `
            + `gear delivers class ${delivered} at best. ISO class ${i.qualityClass} therefore `
            + 'requires grinding after heat treat: the only operation that corrects both the cut '
            + 'and the distortion.',
        });
      } else {
        warnings.push(
          `Class ${i.qualityClass} survives ${ref.label.toLowerCase()} distortion on the as-cut `
          + `${GEAR_PROCESS_REFERENCE[cutting].label} geometry (class ${asCut} + ${distortion} `
          + 'distortion allowance), so no hard finishing was added. Confirm with the plant '
          + 'whether this part runs as-hardened.');
      }
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
