/**
 * Landed-cost reference data — tariffs, trade measures and CBAM schemes.
 *
 * GOVERNING RULE (same as the rest of the engine): this file states what it
 * knows and how well it knows it. Every rate carries a `status`, a `source`
 * and a `verifyUrl` pointing at the authoritative commodity-code page, so a
 * customs specialist can confirm a line in one click. The engine NEVER
 * presents an unverified duty rate as fact — `status: 'estimate'` lines
 * surface a warning on the result and widen the disclosed uncertainty.
 *
 * Nothing here is a substitute for a binding tariff classification. HS
 * classification is a legal determination; the codes below are the
 * *candidates* an automotive part of each type normally falls under.
 */

/** How well a rate is known. Drives warnings and band-widening. */
export type VerificationStatus =
  | 'verified'      // read from the official tariff service and dated
  | 'corroborated'  // consistent across independent secondary sources
  | 'estimate';     // engineering judgement — MUST be confirmed before use

export interface TariffLine {
  /** UK commodity code (10-digit) or HS6 where the sub-line is part-specific. */
  hsCode: string;
  description: string;
  /** Third-country / MFN duty, percent of customs value. */
  mfnDutyPct: number;
  status: VerificationStatus;
  source: string;
  /** Official page for this exact code — one-click confirmation. */
  verifyUrl: string;
  /** ISO date the rate was last reviewed in this file. */
  reviewed: string;
  notes?: string;
}

const UK_TARIFF = 'https://www.trade-tariff.service.gov.uk/commodities/';

/**
 * Candidate commodity codes by CostVision commodity, in an AUTOMOTIVE context.
 *
 * Classification note: parts "solely or principally" for motor vehicles
 * generally classify in heading 8708 rather than by constituent material
 * (Section XVII note 3). A generic bracket sold as hardware would instead sit
 * in 7326 (steel) / 7616 (aluminium) / 3926 (plastic) — which usually carries
 * a DIFFERENT duty rate, so the automotive-vs-generic call is a real money
 * decision, not a formality. Both candidates are listed where they diverge.
 */
export const HS_CANDIDATES: Record<string, TariffLine[]> = {
  sheet_metal: [
    {
      hsCode: '8708299000',
      description: 'Parts & accessories of motor vehicle bodies — other (stamped bracket, panel, reinforcement)',
      mfnDutyPct: 4.5,
      status: 'corroborated',
      source: 'EU CCT car-parts rate 4.5% widely cited; UKGT retains 4.5% band for 8708 body parts',
      verifyUrl: `${UK_TARIFF}8708299000`,
      reviewed: '2026-07-29',
      notes: 'Applies when the pressing is solely/principally for a motor vehicle body.',
    },
    {
      hsCode: '7326909890',
      description: 'Other articles of iron or steel (non-automotive bracket)',
      mfnDutyPct: 2.0,
      status: 'estimate',
      source: 'EU CCT 2.7% for 7326.90; UKGT rounds down — band unconfirmed',
      verifyUrl: `${UK_TARIFF}7326909890`,
      reviewed: '2026-07-29',
      notes: 'Fallback classification if the part is NOT vehicle-specific.',
    },
  ],

  sheet_metal_fab: [
    {
      hsCode: '8708299000',
      description: 'Parts & accessories of motor vehicle bodies — other (fabricated bracket)',
      mfnDutyPct: 4.5,
      status: 'corroborated',
      source: 'As sheet_metal — heading 8708 for vehicle-specific fabrications',
      verifyUrl: `${UK_TARIFF}8708299000`,
      reviewed: '2026-07-29',
    },
  ],

  machining: [
    {
      hsCode: '8708809900',
      description: 'Suspension systems & parts thereof — other (machined structural bracket)',
      mfnDutyPct: 4.5,
      status: 'estimate',
      source: 'EU CCT 8708.80 suspension parts ~4.5%; UK band unconfirmed',
      verifyUrl: `${UK_TARIFF}8708809900`,
      reviewed: '2026-07-29',
      notes: 'Use 8708.99 if the part is not a suspension component.',
    },
    {
      hsCode: '8708999790',
      description: 'Other parts & accessories of motor vehicles',
      mfnDutyPct: 4.5,
      status: 'corroborated',
      source: 'Car-parts MFN commonly 4.5% (EU CCT); UKGT retains the 4.5% band',
      verifyUrl: `${UK_TARIFF}8708999790`,
      reviewed: '2026-07-29',
    },
  ],

  cast_and_machine: [
    {
      hsCode: '8708999790',
      description: 'Other parts & accessories of motor vehicles (die-cast machined housing)',
      mfnDutyPct: 4.5,
      status: 'corroborated',
      source: 'Car-parts MFN commonly 4.5%',
      verifyUrl: `${UK_TARIFF}8708999790`,
      reviewed: '2026-07-29',
    },
    {
      hsCode: '7616999090',
      description: 'Other articles of aluminium (non-automotive casting)',
      mfnDutyPct: 6.0,
      status: 'estimate',
      source: 'EU CCT 6% for 7616.99.90; UK band unconfirmed',
      verifyUrl: `${UK_TARIFF}7616999090`,
      reviewed: '2026-07-29',
      notes: 'Materially higher than the 8708 route — classification matters.',
    },
  ],

  casting: [
    {
      hsCode: '8708999790',
      description: 'Other parts & accessories of motor vehicles (cast housing)',
      mfnDutyPct: 4.5,
      status: 'corroborated',
      source: 'Car-parts MFN commonly 4.5%',
      verifyUrl: `${UK_TARIFF}8708999790`,
      reviewed: '2026-07-29',
    },
  ],

  forging: [
    {
      hsCode: '8708999790',
      description: 'Other parts & accessories of motor vehicles (forged component)',
      mfnDutyPct: 4.5,
      status: 'corroborated',
      source: 'Car-parts MFN commonly 4.5%',
      verifyUrl: `${UK_TARIFF}8708999790`,
      reviewed: '2026-07-29',
    },
  ],

  injection_moulding: [
    {
      hsCode: '8708299000',
      description: 'Parts & accessories of motor vehicle bodies — other (moulded trim / body panel)',
      mfnDutyPct: 4.5,
      status: 'corroborated',
      source: 'Vehicle-specific mouldings classify in 8708, not chapter 39',
      verifyUrl: `${UK_TARIFF}8708299000`,
      reviewed: '2026-07-29',
      notes: 'Correct for TRIM and body mouldings. A housing enclosing electrical apparatus may instead follow the apparatus (see 8708.99 / chapter 85).',
    },
    {
      hsCode: '3926909790',
      description: 'Other articles of plastics (non-automotive moulding)',
      mfnDutyPct: 6.5,
      status: 'estimate',
      source: 'EU CCT 6.5% for 3926.90.97; UK band unconfirmed',
      verifyUrl: `${UK_TARIFF}3926909790`,
      reviewed: '2026-07-29',
    },
  ],

  pcb_fab: [
    {
      hsCode: '8534001900',
      description: 'Printed circuits — bare PCB, multilayer',
      mfnDutyPct: 0,
      status: 'corroborated',
      source: 'Bare PCBs duty-free in most regimes under the WTO Information Technology Agreement (ITA)',
      verifyUrl: `${UK_TARIFF}8534001900`,
      reviewed: '2026-07-29',
      notes: 'ITA coverage makes 0% the expected rate, but confirm the exact sub-line.',
    },
  ],

  pcba: [
    {
      hsCode: '8537109890',
      description: 'Boards/panels with electrical apparatus — populated assembly',
      mfnDutyPct: 0,
      status: 'estimate',
      source: 'EU CCT 2.1% for 8537.10; UKGT removed sub-2% "nuisance" tariffs — expected 0% but UNCONFIRMED',
      verifyUrl: `${UK_TARIFF}8537109890`,
      reviewed: '2026-07-29',
      notes: 'A radar front-end module may instead classify as radar apparatus (8526.10) — different rate.',
    },
    {
      hsCode: '8526100090',
      description: 'Radar apparatus (automotive radar module)',
      mfnDutyPct: 0,
      status: 'estimate',
      source: 'Radar apparatus commonly duty-free / low; UK line UNCONFIRMED',
      verifyUrl: `${UK_TARIFF}8526100090`,
      reviewed: '2026-07-29',
    },
  ],

  wiring_harness: [
    {
      hsCode: '8544302000',
      description: 'Ignition/other wiring sets for vehicles',
      mfnDutyPct: 3.0,
      status: 'estimate',
      source: 'EU CCT ~3-3.7% for 8544.30; UK band unconfirmed',
      verifyUrl: `${UK_TARIFF}8544302000`,
      reviewed: '2026-07-29',
    },
  ],
};

/* ─── Origin preferences ──────────────────────────────────────────────────── */

export interface OriginPreference {
  /** Region code as used by REGIONAL_DATA. */
  region: string;
  country: string;
  /** Trade agreement giving preferential access to the UK, if any. */
  agreement?: string;
  /** Preferential duty (percent) when rules of origin ARE met. */
  preferentialDutyPct?: number;
  status: VerificationStatus;
  note: string;
}

/**
 * UK import preferences by origin. `preferentialDutyPct: 0` means duty-free
 * ONLY IF the product-specific rules of origin are satisfied AND a valid
 * origin declaration is held — the engine always states this condition
 * rather than silently assuming it.
 */
export const ORIGIN_PREFERENCES: OriginPreference[] = [
  {
    region: 'CN', country: 'China',
    status: 'verified',
    note: 'No UK-China FTA. Full UK Global Tariff (MFN) rates apply — no preferential route exists.',
  },
  {
    region: 'DE', country: 'Germany',
    agreement: 'UK-EU TCA', preferentialDutyPct: 0,
    status: 'corroborated',
    note: 'Duty-free under the TCA if UK-EU rules of origin are met and a statement on origin is held; otherwise MFN applies.',
  },
  {
    region: 'PL', country: 'Poland',
    agreement: 'UK-EU TCA', preferentialDutyPct: 0,
    status: 'corroborated',
    note: 'As Germany — TCA preference conditional on rules of origin.',
  },
  {
    region: 'TR', country: 'Türkiye',
    agreement: 'UK-Türkiye FTA', preferentialDutyPct: 0,
    status: 'estimate',
    note: 'UK-Türkiye agreement provides preference for industrial goods subject to origin rules — confirm product coverage.',
  },
  {
    region: 'IN', country: 'India',
    agreement: 'UK-India CETA', preferentialDutyPct: 0,
    status: 'corroborated',
    note: 'UK-India CETA IN FORCE 15 July 2026. The UK eliminates tariffs on ~99% of tariff lines for Indian goods, and AUTO COMPONENTS are a named beneficiary sector — duty-free from day one (not staged on the UK side). Conditional on CETA rules of origin (QVC 40% build-down on ex-works, or an Annex 3A product-specific rule) and a valid origin declaration.',
  },
  {
    region: 'MX', country: 'Mexico',
    agreement: 'CPTPP', preferentialDutyPct: 0,
    status: 'estimate',
    note: 'UK acceded to CPTPP; Mexico is a party. Preference subject to CPTPP rules of origin and staging — confirm the specific line.',
  },
  {
    region: 'VN', country: 'Vietnam',
    agreement: 'UK-Vietnam FTA / CPTPP', preferentialDutyPct: 0,
    status: 'estimate',
    note: 'Preference available subject to origin rules and staging — confirm the specific line.',
  },
  {
    region: 'US', country: 'United States',
    status: 'estimate',
    note: 'No comprehensive UK-US FTA. MFN applies; sector-specific arrangements change frequently.',
  },
];

/* ─── CBAM ────────────────────────────────────────────────────────────────── */

export type CbamScheme = 'UK' | 'EU' | 'none';

export interface CbamConfig {
  scheme: CbamScheme;
  /** Date the financial obligation begins. */
  liveFrom: string;
  /** Sectors in scope of the definitive regime. */
  sectorsInScope: string[];
  /** Indicative certificate price, GBP per tonne CO2e. */
  certificatePriceGbpPerTonne: number;
  status: VerificationStatus;
  source: string;
  note: string;
}

/**
 * CBAM schemes. The two regimes have DIFFERENT start dates — conflating them
 * is the most common CBAM costing error.
 *
 * UK CBAM: financial obligation from 1 January 2027. Covers aluminium,
 * cement, fertilisers, hydrogen and iron & steel. Glass and ceramics were
 * dropped from the final scope. Importers under a £50,000 annual threshold
 * of in-scope goods are exempt.
 *
 * EU CBAM: definitive (paying) regime from 1 January 2026, following the
 * 2023-2025 reporting-only transition.
 */
export const CBAM_SCHEMES: Record<Exclude<CbamScheme, 'none'>, CbamConfig> = {
  UK: {
    scheme: 'UK',
    liveFrom: '2027-01-01',
    sectorsInScope: ['aluminium', 'iron_steel', 'cement', 'fertiliser', 'hydrogen'],
    certificatePriceGbpPerTonne: 40,
    status: 'corroborated',
    source: 'UK CBAM introduced from 1 Jan 2027 (HM Treasury / HMRC policy); price set by reference to the UK ETS',
    note: 'Rate is an indicative UK ETS-linked price — the statutory CBAM rate is set quarterly and must be confirmed.',
  },
  EU: {
    scheme: 'EU',
    liveFrom: '2026-01-01',
    sectorsInScope: ['aluminium', 'iron_steel', 'cement', 'fertiliser', 'hydrogen', 'electricity'],
    certificatePriceGbpPerTonne: 60,
    status: 'estimate',
    source: 'EU CBAM definitive regime from 1 Jan 2026; certificates priced on EU ETS',
    note: 'EU ETS price is volatile — treat as indicative and refresh before use.',
  },
};

/**
 * Map a material class to a CBAM sector, or null when out of scope.
 * `commodity` is accepted for call-site symmetry and future sector rules
 * (e.g. cement) but scope today is determined by the material, not the process.
 */
export function cbamSector(_commodity: string, materialClass: string): string | null {
  const m = materialClass.toLowerCase();
  // CBAM bites on the METAL content of aluminium and iron/steel goods.
  if (m.includes('alumin')) return 'aluminium';
  if (m.includes('steel') || m.includes('iron') || m.includes('ferrous')) return 'iron_steel';
  // Plastics, composites, rubber and electronics are OUT of scope in both regimes.
  return null;
}

/* ─── UK steel trade measure (replaced the safeguard on 2026-07-01) ───────── */

export interface SteelMeasure {
  liveFrom: string;
  overQuotaDutyPct: number;
  status: VerificationStatus;
  source: string;
  note: string;
}

/**
 * The steel safeguard (25% over-quota) ceased after 30 June 2026. From
 * 1 July 2026 a new UK steel trade measure applies: quota volumes cut ~51%
 * versus the safeguard, with a 50% tariff on imports above quota.
 *
 * IMPORTANT SCOPE POINT: this measure applies to STEEL MILL PRODUCTS (the
 * ~20 steel product categories — coil, sheet, sections, rebar), not to
 * finished automotive components classified in 8708. It therefore bites on
 * imported blanks/coil, not on a finished imported bracket. The engine
 * flags the exposure rather than silently applying it.
 */
export const UK_STEEL_MEASURE: SteelMeasure = {
  liveFrom: '2026-07-01',
  overQuotaDutyPct: 50,
  status: 'corroborated',
  source: 'UK steel trade measure effective 1 July 2026 replacing the expired safeguard; ~51% quota reduction, 50% over-quota tariff',
  note: 'Applies to steel mill product categories, NOT to finished parts in heading 8708. Relevant when importing coil/blanks.',
};

/* ─── UK import VAT ───────────────────────────────────────────────────────── */

/**
 * UK import VAT standard rate. Deliberately NOT a cost line: a VAT-registered
 * manufacturer reclaims import VAT as input tax, so including it in a
 * should-cost overstates the part by 20%. It is reported separately as a
 * cash-flow item only.
 */
export const UK_IMPORT_VAT_PCT = 20;
