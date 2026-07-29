/**
 * Rules of Origin — does the part actually QUALIFY for the FTA preference?
 *
 * Why this module exists: a trade agreement does not make a part duty-free.
 * It makes a part duty-free *if the part originates*. For automotive, that
 * test is where the money is — a bracket "made in Germany" from Chinese
 * steel can fail origin and pay the full MFN rate. Quoting 0% because the
 * supplier has an EU address is the single most expensive assumption in
 * landed-cost work.
 *
 * CostVision can actually TEST this rather than caveat it, because the
 * deterministic 8-bucket breakdown already knows the material cost and the
 * ex-works price — which is exactly the MaxNOM (maximum non-originating
 * material) calculation the agreements use:
 *
 *      non-originating material value ÷ ex-works price  ≤  threshold
 *
 * The module returns qualification, headroom, and the £/part cost of getting
 * it wrong — so a sourcing decision can see how close to the line it is.
 *
 * TIME-CRITICAL: the UK-EU EV/battery rules tighten sharply on 1 January
 * 2027 and are then locked until 2032. A part that qualifies today can fail
 * in the next model year. That transition is modelled explicitly.
 */

import type { VerificationStatus } from './landed-cost-data.js';

export type OriginProductType = 'part' | 'vehicle' | 'battery_pack' | 'battery_cell';

/**
 * Alternative qualifying route. Agreements usually let a product originate by
 * EITHER a value test OR a tariff-classification change — so failing the value
 * test does not necessarily mean the part fails origin.
 */
export interface AlternativeRoute {
  kind: 'CTC' | 'QVC' | 'PROCESS';
  label: string;
  /** For QVC variants expressed against a different value basis. */
  maxNonOriginatingPct?: number;
  note: string;
}

export interface OriginRule {
  agreement: string;
  productType: OriginProductType;
  /** Maximum non-originating material as % of ex-works price. */
  maxNonOriginatingPct: number;
  /** Equivalent minimum local (originating) content. */
  minLocalContentPct: number;
  /** Rule applies from this date (inclusive). */
  from: string;
  /** Rule stops applying on this date, if superseded. */
  until?: string;
  description: string;
  status: VerificationStatus;
  source: string;
  /**
   * Other ways the same product can qualify. When the value test fails, the
   * engine reports these rather than declaring origin lost outright.
   */
  alternativeRoutes?: AlternativeRoute[];
}

/**
 * UK-EU TCA product-specific rules.
 *
 * The EV/battery rules were due to tighten on 1 Jan 2024; the Partnership
 * Council extended the softer thresholds to 31 December 2026. From
 * 1 January 2027 the stricter thresholds apply and — per the same decision —
 * no further change is possible before 2032.
 */
export const ORIGIN_RULES: OriginRule[] = [
  // ── General automotive parts (heading 8708) ──
  {
    agreement: 'UK-EU TCA', productType: 'part',
    maxNonOriginatingPct: 50, minLocalContentPct: 50,
    from: '2021-01-01',
    description: 'Parts of heading 8708: MaxNOM 50% of ex-works price (or change of tariff heading).',
    status: 'estimate',
    source: 'TCA Annex ORIG-2 product-specific rules — confirm the exact PSR for the specific commodity code.',
  },

  // ── EVs: softer regime to end-2026 ──
  {
    agreement: 'UK-EU TCA', productType: 'vehicle',
    maxNonOriginatingPct: 60, minLocalContentPct: 40,
    from: '2021-01-01', until: '2026-12-31',
    description: 'Electric vehicles: 40% UK/EU content required (MaxNOM 60%) — extended regime, expires 31 Dec 2026.',
    status: 'corroborated',
    source: 'EU-UK Partnership Council decision extending the original EV rules of origin to 31 December 2026.',
  },
  {
    agreement: 'UK-EU TCA', productType: 'vehicle',
    maxNonOriginatingPct: 45, minLocalContentPct: 55,
    from: '2027-01-01',
    description: 'Electric vehicles from 1 Jan 2027: 55% UK/EU content required (MaxNOM 45%). Locked until 2032.',
    status: 'corroborated',
    source: 'Stricter EV thresholds apply from 1 January 2027; no further change possible before 2032.',
  },

  // ── Battery packs ──
  {
    agreement: 'UK-EU TCA', productType: 'battery_pack',
    maxNonOriginatingPct: 70, minLocalContentPct: 30,
    from: '2021-01-01', until: '2026-12-31',
    description: 'Battery packs: 30% UK/EU content required (MaxNOM 70%) — expires 31 Dec 2026.',
    status: 'corroborated',
    source: 'EU-UK Partnership Council extension decision.',
  },
  {
    agreement: 'UK-EU TCA', productType: 'battery_pack',
    maxNonOriginatingPct: 30, minLocalContentPct: 70,
    from: '2027-01-01',
    description: 'Battery packs from 1 Jan 2027: 70% UK/EU content required (MaxNOM 30%). A step change.',
    status: 'corroborated',
    source: 'Stricter battery thresholds from 1 January 2027.',
  },

  // ── Battery cells ──
  {
    agreement: 'UK-EU TCA', productType: 'battery_cell',
    maxNonOriginatingPct: 70, minLocalContentPct: 30,
    from: '2021-01-01', until: '2026-12-31',
    description: 'Battery cells: 30% UK/EU content required — expires 31 Dec 2026.',
    status: 'estimate',
    source: 'EU-UK Partnership Council extension decision.',
  },
  {
    agreement: 'UK-EU TCA', productType: 'battery_cell',
    maxNonOriginatingPct: 35, minLocalContentPct: 65,
    from: '2027-01-01',
    description: 'Battery cells from 1 Jan 2027: 65% UK/EU content required (MaxNOM 35%).',
    status: 'corroborated',
    source: 'Stricter battery-cell thresholds from 1 January 2027.',
  },

  // ── UK-India CETA — IN FORCE from 15 July 2026 ──
  //
  // CETA expresses Qualifying Value Content three ways, and the threshold
  // DIFFERS by method. CostVision computes non-originating value against the
  // ex-works price, which is the BUILD-DOWN (ex-works) method → QVC 40%,
  // i.e. MaxNOM 60%. The build-up (35%) and FOB build-down (45%) variants are
  // carried as alternatives because a part that fails one may pass another.
  {
    agreement: 'UK-India CETA', productType: 'part',
    maxNonOriginatingPct: 60, minLocalContentPct: 40,
    from: '2026-07-15',
    description: 'UK-India CETA: Qualifying Value Content 40% on the build-down (ex-works) basis — i.e. non-originating material ≤ 60% of ex-works price.',
    status: 'corroborated',
    source: 'CETA in force 15 July 2026. Standard QVC: 35% build-up; build-down 40% (ex-works) or 45% (FOB). Product-specific rules in Annex 3A govern per line.',
    alternativeRoutes: [
      {
        kind: 'QVC', label: 'Build-up method (35% QVC)',
        note: 'Measures the value of ORIGINATING materials ≥ 35% of ex-works — a different calculation, not simply 100 minus the build-down figure. Can qualify a part that fails build-down.',
      },
      {
        kind: 'QVC', label: 'Build-down on FOB (45% QVC)', maxNonOriginatingPct: 55,
        note: 'Stricter than the ex-works basis because FOB includes inland freight to the port.',
      },
      {
        kind: 'CTC', label: 'Change of Tariff Classification',
        note: 'Where the Annex 3A product-specific rule allows CTC, a part failing the value test may STILL originate if the non-originating inputs change tariff heading/subheading through manufacture. Check the PSR for the exact commodity code.',
      },
    ],
  },

  // ── CPTPP ──
  {
    agreement: 'CPTPP', productType: 'part',
    maxNonOriginatingPct: 55, minLocalContentPct: 45,
    from: '2024-12-15',
    description: 'CPTPP: regional value content, commonly 45-55% depending on the method and the specific rule.',
    status: 'estimate',
    source: 'UK acceded to CPTPP; product-specific rules and RVC method must be confirmed per line.',
  },
];

/** Find the rule in force for an agreement + product type at a given date. */
export function findOriginRule(
  agreement: string, productType: OriginProductType, asOfDate: string,
): OriginRule | null {
  const hits = ORIGIN_RULES.filter(r =>
    r.agreement === agreement && r.productType === productType &&
    r.from <= asOfDate && (!r.until || asOfDate <= r.until),
  );
  return hits[0] ?? null;
}

/** The next rule that will supersede the current one, if any. */
export function findNextOriginRule(
  agreement: string, productType: OriginProductType, asOfDate: string,
): OriginRule | null {
  const future = ORIGIN_RULES
    .filter(r => r.agreement === agreement && r.productType === productType && r.from > asOfDate)
    .sort((a, b) => a.from.localeCompare(b.from));
  return future[0] ?? null;
}

export interface OriginAssessmentInputs {
  agreement: string;
  productType?: OriginProductType;
  /** Ex-works price of the part (the 8-bucket total). */
  exWorksPrice: number;
  /**
   * Value of NON-ORIGINATING material — material sourced outside the FTA
   * area. Take from the material bucket when the input metal/resin is
   * imported from outside the agreement.
   */
  nonOriginatingMaterialCost: number;
  /** MFN duty that applies if origin FAILS. */
  mfnDutyPct: number;
  /** Preferential duty if origin is met (usually 0). */
  preferentialDutyPct?: number;
  /** Customs value the duty would be charged on. */
  customsValueCif?: number;
  asOfDate?: string;
  /**
   * Material sourced from a CUMULATION PARTNER counts as ORIGINATING even
   * though it wasn't made in the exporting country. Under the TCA, UK steel
   * sent to a German supplier is originating — omitting this produces a
   * false FAIL. Supply as {origin: value} pairs.
   */
  materialByOrigin?: Record<string, number>;
  /**
   * Operations actually performed in the exporting country. If ALL of them
   * are "insufficient" (packing, simple painting, simple assembly...), origin
   * fails regardless of the value test.
   */
  operationsPerformed?: string[];
}

export interface OriginAssessment {
  agreement: string;
  productType: OriginProductType;
  rule: OriginRule | null;
  /** Non-originating material as % of ex-works price. */
  nonOriginatingPct: number;
  /** Threshold it must not exceed. */
  thresholdPct: number;
  qualifies: boolean | 'unknown';
  /** Percentage points of headroom before the part fails (negative = failing). */
  headroomPct: number;
  /** £/part cost if the preference is lost. */
  costOfFailureGbp: number;
  /** Assessment under the NEXT rule, when one is scheduled. */
  future?: {
    rule: OriginRule;
    qualifies: boolean;
    headroomPct: number;
    daysUntil: number;
  };
  warnings: string[];
  notes: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

/**
 * Assess whether a part qualifies for preferential origin — and what it costs
 * if it doesn't.
 */
export function assessOrigin(inputs: OriginAssessmentInputs): OriginAssessment {
  const {
    agreement, productType = 'part', exWorksPrice, nonOriginatingMaterialCost,
    mfnDutyPct, preferentialDutyPct = 0,
    asOfDate = new Date().toISOString().slice(0, 10),
  } = inputs;
  const customsValue = inputs.customsValueCif ?? exWorksPrice;

  const warnings: string[] = [];
  const notes: string[] = [];

  // ── Bilateral cumulation: reclassify partner-country material as originating
  let effectiveNonOriginating = nonOriginatingMaterialCost;
  if (inputs.materialByOrigin) {
    let cumulated = 0;
    let nonOrig = 0;
    for (const [origin, value] of Object.entries(inputs.materialByOrigin)) {
      if (countsAsOriginating(agreement, origin)) { cumulated += value; }
      else { nonOrig += value; }
    }
    effectiveNonOriginating = nonOrig;
    if (cumulated > 0) {
      notes.push(
        `Cumulation: £${cumulated.toFixed(2)} of material from ${agreement} partner territories counts as ORIGINATING, ` +
        `so only £${nonOrig.toFixed(2)} is non-originating.`,
      );
    }
  }

  const nonOriginatingPct = exWorksPrice > 0
    ? r2((effectiveNonOriginating / exWorksPrice) * 100)
    : 0;

  const rule = findOriginRule(agreement, productType, asOfDate);
  const costOfFailureGbp = r2(customsValue * ((mfnDutyPct - preferentialDutyPct) / 100));

  if (!rule) {
    warnings.push(
      `No rule of origin is recorded for ${agreement} / ${productType} at ${asOfDate}. ` +
      `Origin CANNOT be assumed — treat the part as non-preferential (${mfnDutyPct}% duty) until confirmed.`,
    );
    return {
      agreement, productType, rule: null,
      nonOriginatingPct, thresholdPct: NaN, qualifies: 'unknown',
      headroomPct: NaN, costOfFailureGbp, warnings, notes,
    };
  }

  const thresholdPct = rule.maxNonOriginatingPct;
  const passesValueTest = nonOriginatingPct <= thresholdPct;
  const headroomPct = r2(thresholdPct - nonOriginatingPct);

  // ── Insufficient processing OVERRIDES the value test ──
  // A part can pass MaxNOM comfortably and still fail origin if nothing
  // substantive was done in the exporting country. This is the false-PASS trap.
  const insufficient = isInsufficientProcessing(inputs.operationsPerformed);
  const qualifies = passesValueTest && !insufficient;

  if (insufficient) {
    warnings.push(
      `ORIGIN FAILS on INSUFFICIENT PROCESSING: every declared operation ` +
      `(${(inputs.operationsPerformed ?? []).join(', ')}) is a minimal operation that never confers origin, ` +
      `regardless of the value test${passesValueTest ? ' — which this part PASSES' : ''}. ` +
      `Preference is not available; duty ${mfnDutyPct}% applies (£${costOfFailureGbp.toFixed(2)}/part). ` +
      `A single substantive operation (machining, casting, stamping, welding) would change this.`,
    );
  } else if (!inputs.operationsPerformed?.length) {
    notes.push(
      'Insufficient-processing test NOT run — declare the operations performed in the exporting country to check it. ' +
      'Passing the value test alone does not establish origin.',
    );
  }

  notes.push(`${rule.agreement} rule in force at ${asOfDate}: ${rule.description}`);
  notes.push(
    `Non-originating material £${nonOriginatingMaterialCost.toFixed(2)} ÷ ex-works £${exWorksPrice.toFixed(2)} ` +
    `= ${nonOriginatingPct.toFixed(1)}% vs MaxNOM ${thresholdPct}% → ${qualifies ? 'QUALIFIES' : 'FAILS'}.`,
  );

  if (!passesValueTest) {
    const routes = rule.alternativeRoutes ?? [];
    warnings.push(
      `ORIGIN FAILS the value test: ${nonOriginatingPct.toFixed(1)}% non-originating content exceeds the ${thresholdPct}% limit. ` +
      `On this basis the ${agreement} preference is NOT available — duty of ${mfnDutyPct}% applies, costing £${costOfFailureGbp.toFixed(2)}/part.` +
      (routes.length
        ? ` HOWEVER ${routes.length} alternative qualifying route(s) exist — failing the value test does not automatically mean the part fails origin.`
        : ''),
    );
    for (const rt of routes) {
      // A stricter alternative can't rescue a part that already failed the
      // looser test, so only surface routes that could actually help.
      if (rt.maxNonOriginatingPct !== undefined && rt.maxNonOriginatingPct <= thresholdPct) continue;
      notes.push(`Alternative route — ${rt.label} (${rt.kind}): ${rt.note}`);
    }
    const ctc = routes.find(r => r.kind === 'CTC');
    if (ctc) {
      notes.push(
        `ACTION: check the Annex/PSR for this commodity code. If a change-of-tariff-classification rule is available, ` +
        `the part may still qualify despite the value test — worth £${costOfFailureGbp.toFixed(2)}/part.`,
      );
    }
  } else if (headroomPct < 10 && !insufficient) {
    warnings.push(
      `Origin qualifies but with only ${headroomPct.toFixed(1)} percentage points of headroom. ` +
      `A material price rise or a switch to a non-FTA supplier could break qualification — exposure £${costOfFailureGbp.toFixed(2)}/part.`,
    );
  }

  if (rule.status !== 'verified') {
    warnings.push(
      `The applied rule is ${rule.status.toUpperCase()}. Product-specific rules of origin vary by commodity code — ` +
      `confirm the exact PSR before claiming preference. A wrong claim is recoverable duty plus penalties.`,
    );
  }

  // ── De minimis tolerance (rescues a failed CTC, NOT a failed value test) ──
  const tol = DE_MINIMIS_TOLERANCE_PCT[agreement];
  if (tol !== undefined && !passesValueTest) {
    notes.push(
      `De minimis tolerance under ${agreement} is ~${tol}% of ex-works — note it rescues a failed ` +
      `CHANGE-OF-CLASSIFICATION rule, NOT a failed value test. It cannot lift this part over the ` +
      `${thresholdPct}% MaxNOM ceiling.`,
    );
  }

  // ── Scheduled tightening ──
  const next = findNextOriginRule(agreement, productType, asOfDate);
  let future: OriginAssessment['future'];
  if (next) {
    const futureQualifies = nonOriginatingPct <= next.maxNonOriginatingPct;
    future = {
      rule: next,
      qualifies: futureQualifies,
      headroomPct: r2(next.maxNonOriginatingPct - nonOriginatingPct),
      daysUntil: daysBetween(asOfDate, next.from),
    };
    if (qualifies && !futureQualifies) {
      warnings.push(
        `CLIFF EDGE: this part qualifies today but FAILS from ${next.from} (${future.daysUntil} days), when the ` +
        `limit tightens to ${next.maxNonOriginatingPct}% non-originating. ` +
        `Unmitigated, that adds £${costOfFailureGbp.toFixed(2)}/part. ${next.description}`,
      );
    }
  }

  return {
    agreement, productType, rule,
    nonOriginatingPct, thresholdPct, qualifies, headroomPct,
    costOfFailureGbp, future, warnings, notes,
  };
}

/** One-line summary for reports. */
export function originSummary(a: OriginAssessment): string {
  if (a.qualifies === 'unknown') return `${a.agreement}: origin UNKNOWN — no rule recorded`;
  const verdict = a.qualifies ? 'QUALIFIES' : 'FAILS';
  const cliff = a.future && a.qualifies && !a.future.qualifies
    ? ` · FAILS from ${a.future.rule.from}`
    : '';
  return `${a.agreement} ${verdict}: ${a.nonOriginatingPct.toFixed(1)}% non-originating vs ${a.thresholdPct}% limit ` +
    `(headroom ${a.headroomPct.toFixed(1)} pts)${cliff}`;
}

/* ─── Insufficient processing ("minimal operations") ──────────────────────── */

/**
 * Operations that NEVER confer origin, however much value they add.
 *
 * This is the trap the value test alone cannot catch: a part can comfortably
 * pass MaxNOM and still fail origin because the only thing done in the
 * exporting country was, say, painting and packing. Getting this wrong
 * produces a FALSE PASS — the dangerous direction, because the preference is
 * claimed, the goods clear, and the duty is recovered later with penalties.
 *
 * List reflects the standard FTA formulation (TCA Art. ORIG.7 and equivalents);
 * confirm against the specific agreement text for a binding view.
 */
export const INSUFFICIENT_OPERATIONS = [
  'preserving_for_transport',
  'breaking_up_or_assembly_of_packages',
  'washing_cleaning_removal_of_dust_oxide_oil_paint',
  'simple_painting_or_polishing',
  'simple_cutting_slitting_or_sawing',
  'sifting_screening_sorting_grading_or_matching',
  'simple_placing_in_bottles_cans_bags_or_boxes',
  'affixing_marks_labels_logos',
  'simple_mixing',
  'simple_assembly_of_parts',
  'disassembly',
  'testing_or_calibration_only',
] as const;

export type InsufficientOperation = typeof INSUFFICIENT_OPERATIONS[number];

/**
 * True when EVERY declared operation is on the insufficient list — i.e. nothing
 * substantive was done in the exporting country, so origin fails regardless of
 * the value calculation. A single substantive operation (machining, casting,
 * stamping, welding) rescues it.
 */
export function isInsufficientProcessing(operations: string[] | undefined): boolean {
  if (!operations || operations.length === 0) return false;   // not declared → cannot judge
  return operations.every(op => (INSUFFICIENT_OPERATIONS as readonly string[]).includes(op));
}

/* ─── Bilateral cumulation ────────────────────────────────────────────────── */

/**
 * Partner territories whose materials count as ORIGINATING under each
 * agreement (bilateral cumulation).
 *
 * This matters enormously for a UK OEM: send UK steel to a German presser and
 * that steel is ORIGINATING for the TCA test. Counting it as non-originating
 * produces a FALSE FAIL and books duty on a part that is genuinely duty-free.
 */
export const CUMULATION_PARTNERS: Record<string, string[]> = {
  'UK-EU TCA': ['UK', 'GB', 'EU', 'DE', 'PL', 'CZ', 'SK', 'ES', 'IT', 'FR', 'RO', 'HU', 'PT'],
  'UK-India CETA': ['UK', 'GB', 'IN'],
  'CPTPP': ['UK', 'GB', 'MX', 'VN', 'JP', 'MY', 'SG', 'AU', 'NZ', 'CA', 'CL', 'PE', 'BN'],
  'UK-Türkiye FTA': ['UK', 'GB', 'TR'],
};

/** Does material from `materialOrigin` count as originating under `agreement`? */
export function countsAsOriginating(agreement: string, materialOrigin: string): boolean {
  return (CUMULATION_PARTNERS[agreement] ?? []).includes(materialOrigin.toUpperCase());
}

/* ─── De minimis tolerance ────────────────────────────────────────────────── */

/**
 * Tolerance for non-originating materials that fail the classification rule,
 * as a percentage of ex-works price. Commonly ~10%.
 *
 * NOTE: the tolerance rescues a failed CTC test, not a failed VALUE test —
 * you cannot use it to exceed a MaxNOM ceiling. Modelled here so the engine
 * can say so rather than implying a value-test rescue that does not exist.
 */
export const DE_MINIMIS_TOLERANCE_PCT: Record<string, number> = {
  'UK-EU TCA': 10,
  'UK-India CETA': 10,
  'CPTPP': 10,
};
