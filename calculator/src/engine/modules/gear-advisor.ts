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
  | 'lpc_carburising'
  | 'carbonitriding'
  | 'quench_temper'
  | 'martempering'
  | 'austempering'
  | 'nitriding'
  | 'fnc'
  | 'induction_hardening'
  | 'wash'
  | 'temper'
  | 'shot_peen'
  | 'straighten'
  | 'press_quench'
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
  lpc_carburising: {
    process: 'lpc_carburising', label: 'Low-pressure (vacuum) carburise + gas quench',
    bestQualityClass: 99, internalCapable: true, externalCapable: true,
    moduleRangeMm: [0.1, 50],
    source: 'Workbook HT-03. Acetylene carburising under vacuum with 10-20 bar N2 quench. No '
      + 'intergranular oxidation and far less distortion than oil quenching, which is why EV '
      + 'e-axle and NVH-critical gears specify it. Roughly 2x the batch-carburising rate.',
  },
  carbonitriding: {
    process: 'carbonitriding', label: 'Carbonitride (gas, N + C)',
    bestQualityClass: 99, internalCapable: true, externalCapable: true,
    moduleRangeMm: [0.1, 50],
    source: 'Workbook HT-04. Lower temperature and shorter cycle than carburising, at ECD under '
      + '0.4 mm — the cheapest case-hardening route, for small gears, sprockets and pump gears.',
  },
  martempering: {
    process: 'martempering', label: 'Martemper (hot-oil quench)',
    bestQualityClass: 99, internalCapable: true, externalCapable: true,
    moduleRangeMm: [0.1, 50],
    source: 'Workbook HT-17. Quenching into 150-200 degC oil halves the thermal gradient, buying '
      + 'back distortion on thin-wall rings and distortion-sensitive gears.',
  },
  austempering: {
    process: 'austempering', label: 'Austemper (isothermal bainitic)',
    bestQualityClass: 99, internalCapable: true, externalCapable: true,
    moduleRangeMm: [0.1, 50],
    source: 'Workbook HT-18. Isothermal hold in salt gives bainite at 40-50 HRC with very low '
      + 'distortion. The defining route for ADI gears.',
  },
  fnc: {
    process: 'fnc', label: 'Ferritic nitrocarburise',
    bestQualityClass: 99, internalCapable: true, externalCapable: true,
    moduleRangeMm: [0.1, 20],
    source: 'Workbook HT-08. 560-580 degC, 500-700 HV in a 10-20 um compound layer, near-zero '
      + 'distortion. An 8 h cycle against nitriding 45 h makes it the low-cost substitute for '
      + 'case hardening wherever a shallow case carries the load.',
  },
  wash: {
    process: 'wash', label: 'Wash / degrease',
    bestQualityClass: 99, internalCapable: true, externalCapable: true,
    moduleRangeMm: [0.1, 50],
    source: 'Workbook HT-31. Mandatory before carburising (atmosphere control) and after oil '
      + 'quench, so it appears twice in a normal route. Routinely omitted from cost models.',
  },
  temper: {
    process: 'temper', label: 'Temper',
    bestQualityClass: 99, internalCapable: true, externalCapable: true,
    moduleRangeMm: [0.1, 50],
    source: 'Workbook HT-24. Mandatory after any martensitic hardening. Usually bundled inside a '
      + 'hardening quote — unbundled here so two suppliers can be compared on the same scope.',
  },
  shot_peen: {
    process: 'shot_peen', label: 'Shot peen (root fillet)',
    bestQualityClass: 99, internalCapable: true, externalCapable: true,
    moduleRangeMm: [0.1, 50],
    source: 'Workbook HT-28. Compressive residual stress of -700 to -1000 MPa in the root fillet '
      + 'buys 20-40% bending fatigue strength. Standard on automotive gears.',
  },
  straighten: {
    process: 'straighten', label: 'Straighten (post-quench press)',
    bestQualityClass: 99, internalCapable: true, externalCapable: true,
    moduleRangeMm: [0.1, 50],
    source: 'Workbook HT-29. Pinion shafts and long gears to a TIR under 0.05 mm. Almost pure '
      + 'labour, and the most commonly omitted line in gear heat-treat should-cost.',
  },
  press_quench: {
    process: 'press_quench', label: 'Press (die) quench',
    bestQualityClass: 99, internalCapable: true, externalCapable: true,
    moduleRangeMm: [0.1, 50],
    source: 'Workbook HT-27. Roundness and flatness held in the die during the quench, for ring '
      + 'gears and thin annular gears. One part per cycle, so it is dear per kg — but it replaces '
      + 'distortion that would otherwise have to be ground out.',
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
  /** Root-fillet shot peening: +20-40% bending fatigue strength. */
  shotPeened?: boolean;
  /** Post-quench straightening to a TIR under ~0.05 mm. */
  straightened?: boolean;
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
  | 'none' | 'case_hardening' | 'lpc_carburising' | 'carbonitriding'
  | 'quench_temper' | 'martempering' | 'austempering'
  | 'nitriding' | 'fnc' | 'induction_hardening';

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
  // RAISED FROM 1 on workbook evidence: it grades oil-quench carburising
  // distortion "High", the worst of the 35 processes surveyed. A gear hobbed to
  // class 7 therefore delivers class 9 as-quenched, not class 8 — which means
  // more gears need post-furnace grinding than the model previously charged for.
  case_hardening: 2,
  lpc_carburising: 1,      // "Low-Med" — the whole reason LPC is specified
  carbonitriding: 1,       // "Medium"
  quench_temper: 1,        // "Medium"
  martempering: 1,         // "Low" — hot oil halves the thermal gradient
  austempering: 0,         // "Very low"
  nitriding: 0,            // "Very low" — sub-critical, no phase change
  fnc: 0,                  // "Very low"
  induction_hardening: 1,  // "Low-Med" spin / "Medium" single-tooth
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
  lpc_carburising: 'Low-pressure carburised with gas quench — no intergranular oxidation and '
    + 'much less distortion than oil, which is why EV and NVH-critical gears specify it.',
  carbonitriding: 'Carbonitrided — a lower-temperature, shorter-cycle case for small gears where '
    + 'a case under 0.4 mm carries the load. The cheapest case-hardening route.',
  martempering: 'Martempered — quenched into hot oil so the thermal gradient, and therefore the '
    + 'distortion, is halved on a thin-wall section.',
  austempering: 'Austempered — isothermal hold to bainite for toughness with very low distortion. '
    + 'The defining route for ADI.',
  fnc: 'Ferritic nitrocarburised — a shallow, very hard compound layer at 560-580 degC with '
    + 'near-zero distortion, in an 8 h cycle rather than nitriding’s 45 h.',
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
  lpc_carburising: {
    plastic: 'a polymer has no metallurgy to harden.',
    bronze: 'a copper alloy has no iron matrix to diffuse carbon into.',
    cast_iron: 'cast iron is already carbon-saturated — carburising it achieves nothing.',
    alloy_steel_prehardened: 'a pre-hardened bar arrives at hardness.',
  },
  carbonitriding: {
    plastic: 'a polymer has no metallurgy to harden.',
    bronze: 'a copper alloy has no iron matrix to diffuse carbon into.',
    cast_iron: 'cast iron is already carbon-saturated — carburising it achieves nothing.',
    alloy_steel_prehardened: 'a pre-hardened bar arrives at hardness.',
  },
  martempering: {
    plastic: 'a polymer has no metallurgy to harden.',
    bronze: 'a copper alloy does not harden by quenching.',
    alloy_steel_prehardened: 'the bar is supplied already quenched and tempered.',
  },
  austempering: {
    plastic: 'a polymer has no metallurgy to harden.',
    bronze: 'a copper alloy does not transform to bainite.',
    alloy_steel_prehardened: 'the bar is supplied already hardened.',
  },
  fnc: {
    // NOTE: unlike nitriding, FNC does NOT need Al/Cr/Mo/V — it builds a compound
    // layer on plain and low-alloy steels too, which is exactly why it is the
    // cheap substitute. So no case_hardening_steel exclusion here.
    plastic: 'a polymer has no metallurgy to harden.',
    bronze: 'nitrocarburising needs an iron matrix to form the compound layer.',
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

/**
 * How each hardening route maps onto the heat-treat process library, and what
 * ELSE the furnace package contains.
 *
 * The workbook's sixth warning is that quotes bundle tempering, washing,
 * straightening and hardness testing into a headline rate, so two suppliers can
 * quote different scopes at the same number. Unbundling them is the only way to
 * benchmark honestly — and it is also the only way the model can show that a
 * carburised gear is washed TWICE (before, for atmosphere control; after, to get
 * the quench oil off) while a low-pressure carburised one is washed not at all.
 *
 * `processKey` indexes `GEAR_HEAT_TREAT_PROCESSES` in `gear-heat-treat-data.ts`.
 */
export interface HardeningRouteSpec {
  processKey: string;
  /** Add a stand-alone temper step. False where the library process already
   *  includes it (HT-15 is "austenitise + oil quench + temper") or where the
   *  route needs none (nitriding and FNC are sub-critical; austempering holds
   *  isothermally to bainite). */
  needsTemper: boolean;
  /** Wash passes. Two for an oil quench, one for a salt bath or a pre-clean,
   *  none for low-pressure carburising — a vacuum process comes out bright. */
  washPasses: number;
}

export const HARDENING_ROUTE_SPEC: Record<Exclude<HardeningRoute, 'none'>, HardeningRouteSpec> = {
  case_hardening:      { processKey: 'gas_carburise',   needsTemper: true,  washPasses: 2 },
  lpc_carburising:     { processKey: 'lpc_carburise',   needsTemper: true,  washPasses: 0 },
  carbonitriding:      { processKey: 'carbonitride',    needsTemper: true,  washPasses: 2 },
  quench_temper:       { processKey: 'quench_temper',   needsTemper: false, washPasses: 2 },
  martempering:        { processKey: 'martemper',       needsTemper: true,  washPasses: 2 },
  austempering:        { processKey: 'austemper',       needsTemper: false, washPasses: 1 },
  nitriding:           { processKey: 'nitride',         needsTemper: false, washPasses: 1 },
  fnc:                 { processKey: 'fnc',             needsTemper: false, washPasses: 1 },
  // Induction is a rated machine with a geometry-driven cycle, not a furnace
  // bought by weight, so `modules/gear.ts` costs it from coil kinematics and
  // this row exists only for completeness.
  induction_hardening: { processKey: 'induction_spin',  needsTemper: false, washPasses: 0 },
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
    const spec = HARDENING_ROUTE_SPEC[hardening];
    const needsHardFinish = i.qualityClass < delivered;

    /**
     * The furnace PACKAGE, unbundled.
     *
     * A heat-treat quote normally states one number covering the furnace, the
     * washes either side of it and the temper. Emitting them as separate steps
     * is what lets two suppliers be compared on the same scope — and it makes
     * visible that an oil-quench route is washed twice while a low-pressure
     * carburised one is not washed at all.
     */
    const furnacePackage = (): GearRouteStep[] => {
      const out: GearRouteStep[] = [];
      if (spec.washPasses > 0) {
        out.push({
          process: 'wash', label: GEAR_PROCESS_REFERENCE.wash.label,
          reason: 'Pre-clean before the furnace — surface contamination upsets atmosphere '
            + 'control and shows up as soft spots.',
        });
      }
      out.push({ process: hardening, label: ref.label, reason: HARDENING_REASON[hardening] });
      if (spec.washPasses > 1) {
        out.push({
          process: 'wash', label: GEAR_PROCESS_REFERENCE.wash.label,
          reason: 'Post-quench wash — the quench oil has to come off before tempering and '
            + 'before anything downstream can touch the part.',
        });
      }
      if (spec.needsTemper) {
        out.push({
          process: 'temper', label: GEAR_PROCESS_REFERENCE.temper.label,
          reason: 'Mandatory after a martensitic quench, to restore toughness. Usually bundled '
            + 'inside the hardening quote; shown separately so scopes can be compared.',
        });
      }
      return out;
    };

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
      steps.push(...furnacePackage());
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
      steps.push(...furnacePackage());
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

  // ── 3. Post-hardening operations that quotes routinely bundle or omit ─────
  const hardened = hardening !== 'none';
  if (i.straightened) {
    steps.push({
      process: 'straighten', label: GEAR_PROCESS_REFERENCE.straighten.label,
      reason: 'Post-quench straightening to bring runout back inside tolerance. Almost pure '
        + 'labour, and the line most often missing from a heat-treat should-cost.',
    });
  } else if (hardened && HARDENING_DISTORTION_CLASSES[hardening] > 0) {
    // Not added — but the omission is stated, because silently leaving it out is
    // precisely how heat-treat cost gets under-stated.
    warnings.push(
      'No straightening allowed for. A quenched gear or shaft normally needs a press '
      + 'straighten to hold runout, and it is the most commonly omitted line in gear '
      + 'heat-treat cost. Confirm it is genuinely not required, or enable it.');
  }
  if (i.shotPeened) {
    steps.push({
      process: 'shot_peen', label: GEAR_PROCESS_REFERENCE.shot_peen.label,
      reason: 'Root-fillet peening puts the surface into compression, buying 20-40% bending '
        + 'fatigue strength — standard on automotive transmission gears.',
    });
  } else if (hardened && i.qualityClass <= 7) {
    warnings.push(
      'No shot peening allowed for. A hardened gear at ISO class 7 or tighter is usually a '
      + 'power-transmission part, where root-fillet peening is standard practice and is often '
      + 'quoted inside the heat-treat package. Confirm whether the supplier includes it.');
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
