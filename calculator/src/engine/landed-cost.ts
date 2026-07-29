/**
 * Landed-cost engine — ex-works → customs value → duty/CBAM → total landed.
 *
 * Produces the three figures a sourcing decision actually needs:
 *   (a) EX-WORKS       — what the part costs to make at the supplier's gate
 *                        (the existing deterministic 8-bucket total)
 *   (b) LANDED ADDERS  — itemised cost of getting it into the UK
 *   (c) TOTAL LANDED   — (a) + (b), the number to compare across regions
 *
 * Three correctness rules that most landed-cost models get wrong:
 *
 * 1. DUTY IS CHARGED ON THE CUSTOMS VALUE (CIF), NOT ON EX-WORKS.
 *    Customs value = ex-works + international freight + insurance to the
 *    border. Applying duty to ex-works alone understates it.
 *
 * 2. IMPORT VAT IS NOT A COST. A VAT-registered manufacturer reclaims it as
 *    input tax. Including it would overstate every imported part by 20%. It
 *    is computed and reported as a cash-flow line, explicitly outside cost.
 *
 * 3. DOMESTIC SUPPLY HAS NO DUTY. A UK-origin part has zero duty, zero CBAM
 *    and no customs clearance — so the ex-works comparison that flatters
 *    offshore sourcing reverses once these are added.
 *
 * As everywhere in this engine, money is deterministic arithmetic. The AI is
 * not involved. Rates that are not verified are declared as such and raise a
 * warning rather than being quietly presented as fact.
 */

import type { CarbonEstimate } from './carbon.js';
import {
  CBAM_SCHEMES, HIGH_REMEDY_ORIGINS, HS_CANDIDATES, ORIGIN_CARBON_PRICE_GBP_PER_TONNE,
  ORIGIN_PREFERENCES, UK_IMPORT_VAT_PCT, UK_STEEL_MEASURE, cbamSector,
  findTradeRemedies, freeAllocationFactor,
  INCOTERM_PROFILES, ORIGIN_INLAND_GBP_PER_KG, DUTY_RELIEF_REGIMES,
} from './landed-cost-data.js';
import type { CbamScheme, TariffLine, VerificationStatus } from './landed-cost-data.js';
import { assessOrigin } from './rules-of-origin.js';
import type { OriginAssessment, OriginProductType } from './rules-of-origin.js';

export type Incoterm = 'EXW' | 'FOB' | 'CIF' | 'DAP' | 'DDP';

export interface LandedCostInputs {
  /** Deterministic ex-works should-cost per part (8-bucket total). */
  exWorksCost: number;
  commodity: string;
  /** Origin region code (e.g. 'CN'); 'UK' means domestic — no import at all. */
  originRegion: string;
  /** Destination — currently UK-only logic. */
  destinationRegion?: 'UK';
  incoterm?: Incoterm;
  partWeightKg: number;
  annualVolume: number;

  /** Override the auto-selected commodity code. */
  hsCodeOverride?: string;
  /** Treat the part as non-automotive (uses the material-based HS candidate). */
  nonAutomotive?: boolean;

  /** International freight £/part. Omit to derive from weight & lane. */
  freightPerPartGbp?: number;
  /**
   * Volumetric (dimensional) weight kg/part. Sea and air freight charge on
   * CHARGEABLE weight = max(actual, volumetric). A light bulky part — a trim
   * panel, a duct, a foam moulding — is billed on the space it occupies, not
   * its mass, so omitting this UNDERSTATES freight, sometimes by several times.
   * Supply it for any part whose density is well below ~200 kg/m³.
   */
  volumetricWeightKg?: number;
  /** Marine insurance as a fraction of (exW + freight). Default 0.003. */
  insuranceRate?: number;
  /** Customs clearance / broker fee per shipment £. Default 65. */
  clearancePerShipmentGbp?: number;
  /** Parts per shipment for clearance amortisation. Derived if omitted. */
  partsPerShipment?: number;
  /** Inland haulage port→plant £/part. Omit to derive from weight. */
  inlandHaulagePerPartGbp?: number;

  /** Carbon estimate — supplies embedded CO2 for CBAM. */
  carbon?: CarbonEstimate;
  /** Costing date (ISO). Governs whether CBAM is yet in force. Default today. */
  asOfDate?: string;
  /** Which CBAM regime applies at the destination. Default 'UK'. */
  cbamScheme?: CbamScheme;
  /** Importing a steel MILL product (coil/blank) rather than a finished part. */
  steelMillProduct?: boolean;
  /** Existing logistics £/part already inside the ex-works stack (double-count guard). */
  exWorksLogisticsPerPart?: number;

  /**
   * Value of NON-ORIGINATING material in the part (£/part) — material sourced
   * outside the FTA area. Supplying this switches the preference from an
   * assumption to a TESTED rules-of-origin qualification.
   */
  nonOriginatingMaterialCost?: number;
  /** Product type for the origin test (EV/battery rules differ sharply from parts). */
  originProductType?: OriginProductType;
  /**
   * Material split by origin territory, e.g. {UK: 5, CN: 12}. Enables BILATERAL
   * CUMULATION: under the TCA, UK material sent to an EU supplier is
   * ORIGINATING. Counting it as non-originating causes a false FAIL.
   */
  materialByOrigin?: Record<string, number>;
  /**
   * Operations performed in the exporting country. If ALL are "insufficient"
   * (packing, simple painting, simple assembly), origin fails regardless of
   * the value test — the false-PASS trap.
   */
  operationsPerformed?: string[];

  /**
   * ASSISTS — WTO Valuation Agreement Art.8 additions to the customs value.
   * Goods, tooling or services supplied by the BUYER to the producer free of
   * charge or below cost are DUTIABLE and must be declared. For an OEM that
   * owns its tooling this is routine — and omitting it is both an
   * understatement of duty and an under-declaration offence.
   */
  assists?: {
    /** Total value of buyer-supplied tooling / dies / moulds. */
    toolingValueGbp?: number;
    /** Units to apportion the tooling across. Defaults to annualVolume. */
    toolingApportionVolume?: number;
    /** Free-issue material supplied by the buyer, £/part. */
    freeIssueMaterialPerPartGbp?: number;
    /** Royalties or licence fees related to the goods, £/part. */
    royaltiesPerPartGbp?: number;
  };

  /**
   * Carbon price already paid in the country of origin, £/tonne CO2e. UK CBAM
   * is levied on the GAP to the UK price, not the full price. Omit to use the
   * indicative per-country table.
   */
  originCarbonPriceGbpPerTonne?: number;
}

export interface LandedAdder {
  key: string;
  label: string;
  amountGbp: number;
  basis: string;
  status: VerificationStatus;
  source?: string;
  verifyUrl?: string;
}

export interface LandedCostResult {
  /** (a) */
  exWorksCost: number;
  /** (b) */
  adders: LandedAdder[];
  addersTotal: number;
  /** (c) */
  totalLandedCost: number;

  /** Customs value duty was charged on. */
  customsValueCif: number;
  dutyRatePctApplied: number;
  hsCode: string;
  hsDescription: string;
  originRegion: string;
  preferenceApplied?: string;

  /** Percentage uplift from ex-works to landed. */
  upliftPct: number;

  /** Reported, NOT counted as cost — recoverable by a VAT-registered importer. */
  recoverable: {
    importVatGbp: number;
    ratePct: number;
    note: string;
  };

  /** Forward-looking lines not yet in force at asOfDate. */
  futureLines: LandedAdder[];

  /**
   * Rules-of-origin verdict when an FTA preference was available AND
   * non-originating material cost was supplied. Absent means the preference
   * was assumed, not tested.
   */
  origin?: OriginAssessment;

  warnings: string[];
  provenance: string[];
  /** True when any applied rate is unverified — headline must be caveated. */
  needsVerification: boolean;

  /**
   * What this number IS and IS NOT. Duty is legally charged on the price
   * actually paid or payable for the goods; CostVision models what the part
   * SHOULD cost. The two differ, and this figure must not be used to budget
   * duty payable on a real supplier invoice.
   */
  valuationBasis: {
    basis: 'modelled-should-cost';
    statement: string;
    declaredValueWouldBe: string;
  };

  /**
   * Legitimate duty reliefs worth investigating for this flow. Never applied
   * automatically — each needs an HMRC authorisation — but their absence
   * from a model causes systematic OVERSTATEMENT of landed cost.
   */
  reliefOpportunities: Array<{
    code: string; name: string; whenApplicable: string;
    benefit: string; verifyUrl: string;
  }>;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The valuation health-warning attached to every result.
 *
 * Customs duty is legally charged on the "price actually paid or payable" for
 * the goods (transaction value), plus the statutory additions. CostVision
 * models what the part SHOULD cost to make. Those are different numbers: if a
 * supplier invoices GBP 50 for a part we should-cost at GBP 41, the real duty
 * is on 50. This figure is a SOURCING comparator, not a duty budget.
 */
const VALUATION_BASIS: LandedCostResult['valuationBasis'] = {
  basis: 'modelled-should-cost',
  statement:
    'Duty here is modelled on CostVision\'s should-cost, NOT on a supplier invoice. ' +
    'Customs duty is legally charged on the price actually paid or payable (transaction value) ' +
    'plus statutory additions. Use this for SOURCING COMPARISON, not for duty budgeting or ' +
    'customs declarations.',
  declaredValueWouldBe:
    'The declared customs value would be the agreed purchase price + freight/insurance to the ' +
    'UK border + dutiable assists (buyer-supplied tooling, free-issue material, royalties).',
};

/** Indicative sea-freight £/kg by lane (door-to-port, FCL basis). */
const FREIGHT_GBP_PER_KG: Record<string, number> = {
  CN: 0.22, VN: 0.24, IN: 0.20, TH: 0.23, MY: 0.23, ID: 0.24, JP: 0.26, KR: 0.25,
  MX: 0.28, BR: 0.30, US: 0.26,
  DE: 0.09, PL: 0.10, CZ: 0.10, SK: 0.10, RO: 0.11, HU: 0.10, ES: 0.11, IT: 0.11,
  FR: 0.08, TR: 0.13, MA: 0.14, PT: 0.12,
  UK: 0,
};

function freightPerKg(region: string): number {
  return FREIGHT_GBP_PER_KG[region] ?? 0.22;
}

/** Pick the commodity code for this part. */
export function selectTariffLine(
  commodity: string,
  opts: { hsCodeOverride?: string; nonAutomotive?: boolean } = {},
): TariffLine | null {
  const candidates = HS_CANDIDATES[commodity];
  if (!candidates || candidates.length === 0) return null;
  if (opts.hsCodeOverride) {
    const hit = candidates.find(c => c.hsCode === opts.hsCodeOverride);
    if (hit) return hit;
    // The user's classification outranks our candidate list — they may be
    // costing a part type we don't carry (road wheels, brake discs...).
    // SILENTLY DISCARDING the override was a real bug: it also defeated
    // trade-remedy matching, which is keyed on the commodity code, so an
    // anti-dumping measure could never fire. Honour the code, and be explicit
    // that the RATE is inherited and unconfirmed.
    return {
      hsCode: opts.hsCodeOverride,
      description: `User-supplied commodity code (not in CostVision's candidate list for ${commodity})`,
      mfnDutyPct: candidates[0].mfnDutyPct,
      status: 'estimate',
      source: `Duty rate INHERITED from ${candidates[0].hsCode} — it is NOT the published rate for ${opts.hsCodeOverride}.`,
      verifyUrl: `https://www.trade-tariff.service.gov.uk/commodities/${opts.hsCodeOverride}`,
      reviewed: candidates[0].reviewed,
      notes: 'Rate must be confirmed against the official tariff for this specific code before use.',
    };
  }
  // Non-automotive parts fall back to the material-based classification, which
  // is the SECOND candidate where the two routes diverge.
  if (opts.nonAutomotive && candidates.length > 1) return candidates[1];
  return candidates[0];
}

/**
 * Compute landed cost. Pure arithmetic — deterministic and reproducible.
 */
export function computeLandedCost(inputs: LandedCostInputs): LandedCostResult {
  const {
    exWorksCost, commodity, originRegion,
    incoterm = 'FOB',
    partWeightKg, annualVolume,
    insuranceRate = 0.003,
    clearancePerShipmentGbp = 65,
    asOfDate = new Date().toISOString().slice(0, 10),
    cbamScheme = 'UK',
    steelMillProduct = false,
  } = inputs;

  const warnings: string[] = [];
  const provenance: string[] = [];
  const adders: LandedAdder[] = [];
  const futureLines: LandedAdder[] = [];

  // ── Domestic supply: no import, no duty, no clearance ────────────────────
  const isDomestic = originRegion === 'UK' || originRegion === 'GB';
  if (isDomestic) {
    const inland = inputs.inlandHaulagePerPartGbp ?? r2(Math.max(0.02, partWeightKg * 0.05));
    adders.push({
      key: 'inland', label: 'Inland haulage (domestic)', amountGbp: inland,
      basis: `${partWeightKg.toFixed(2)} kg × £0.05/kg (min £0.02)`, status: 'estimate',
    });
    const addersTotal = r2(inland);
    return {
      exWorksCost: r2(exWorksCost), adders, addersTotal,
      totalLandedCost: r2(exWorksCost + addersTotal),
      customsValueCif: r2(exWorksCost),
      dutyRatePctApplied: 0, hsCode: '—', hsDescription: 'Domestic supply — no import entry',
      originRegion,
      upliftPct: exWorksCost > 0 ? r2((addersTotal / exWorksCost) * 100) : 0,
      recoverable: { importVatGbp: 0, ratePct: 0, note: 'No import VAT on domestic supply.' },
      futureLines: [],
      warnings: ['Domestic UK supply: no customs duty, CBAM or clearance applies.'],
      provenance: ['Domestic route — landed cost differs from ex-works only by inland haulage.'],
      needsVerification: false,
      valuationBasis: VALUATION_BASIS,
      reliefOpportunities: [],
    };
  }

  // ── Double-count guard against the ex-works logistics bucket ─────────────
  if ((inputs.exWorksLogisticsPerPart ?? 0) > 0) {
    warnings.push(
      `Ex-works stack already carries £${(inputs.exWorksLogisticsPerPart as number).toFixed(2)}/part of logistics. ` +
      `Confirm that figure is INBOUND/packaging only — if it already includes international freight to the UK, ` +
      `freight is double-counted here.`,
    );
  }

  // ── 1. International freight (on CHARGEABLE weight) ──────────────────────
  const volumetricKg = inputs.volumetricWeightKg ?? 0;
  const chargeableKg = Math.max(partWeightKg, volumetricKg);
  if (volumetricKg > partWeightKg) {
    provenance.push(
      `Freight charged on volumetric weight ${volumetricKg.toFixed(2)} kg (exceeds actual ${partWeightKg.toFixed(2)} kg) — the part is bulk-limited, not weight-limited.`,
    );
  } else if (volumetricKg === 0) {
    warnings.push(
      `Freight is derived from actual weight only. For a light, bulky part (trim, duct, foam) carriers bill on ` +
      `volumetric weight and the real freight can be several times this figure — supply volumetricWeightKg.`,
    );
  }
  // Incoterm decides WHO pays what — and therefore what we may add.
  const profile = INCOTERM_PROFILES[incoterm] ?? INCOTERM_PROFILES.FOB;
  provenance.push(`Incoterm ${incoterm}: ${profile.note}`);

  // EXW — buyer collects at the seller's gate, so origin-country inland
  // haulage to the port is a BUYER cost and is part of the customs value.
  if (profile.buyerBearsOriginInland) {
    const originInland = r2(Math.max(0.02, chargeableKg * (ORIGIN_INLAND_GBP_PER_KG[originRegion] ?? 0.045)));
    adders.push({
      key: 'origin-inland',
      label: `Origin inland haulage to port (${originRegion}) — EXW`,
      amountGbp: originInland,
      basis: `${chargeableKg.toFixed(2)} kg × £${(ORIGIN_INLAND_GBP_PER_KG[originRegion] ?? 0.045).toFixed(3)}/kg`,
      status: 'estimate',
      source: 'Under EXW the buyer bears this, and because it is incurred before export it is DUTIABLE.',
    });
  }

  // CIF / DAP / DDP — the seller already paid the main freight, so adding our
  // own freight line would double-count it.
  let freight: number;
  if (profile.sellerIncludesMainFreight && inputs.freightPerPartGbp === undefined) {
    freight = 0;
    adders.push({
      key: 'freight', label: `International freight — already in the ${incoterm} price`,
      amountGbp: 0,
      basis: `${incoterm}: seller pays main carriage, so it is inside the quoted ex-works figure`,
      status: 'estimate',
      source: profile.note,
    });
    warnings.push(
      `Incoterm ${incoterm}: freight is ALREADY inside the supplier's price, so no separate freight is added. ` +
      `Ensure the ex-works figure you supplied is the ${incoterm} price, not a true ex-works cost — mixing the two ` +
      `either double-counts or omits the carriage.`,
    );
  } else {
    freight = inputs.freightPerPartGbp ?? r2(Math.max(0.03, chargeableKg * freightPerKg(originRegion)));
    adders.push({
      key: 'freight', label: `International freight (${originRegion} → UK)`,
      amountGbp: freight,
      basis: inputs.freightPerPartGbp !== undefined
        ? 'user-supplied'
        : `${chargeableKg.toFixed(2)} kg chargeable × £${freightPerKg(originRegion).toFixed(2)}/kg sea-freight`,
      status: 'estimate',
      source: 'Indicative lane rates — replace with contracted freight for a quotable figure.',
    });
  }

  // ── 2. Insurance ─────────────────────────────────────────────────────────
  const insurance = r2((exWorksCost + freight) * insuranceRate);
  adders.push({
    key: 'insurance', label: 'Marine / transit insurance', amountGbp: insurance,
    basis: `${(insuranceRate * 100).toFixed(2)}% of (ex-works + freight)`, status: 'estimate',
  });

  // ── 3. ASSISTS — WTO Valuation Art.8 additions ───────────────────────────
  const a = inputs.assists;
  const toolingPerPart = a?.toolingValueGbp
    ? r2(a.toolingValueGbp / Math.max(1, a.toolingApportionVolume ?? annualVolume))
    : 0;
  const assistsPerPart = r2(
    toolingPerPart + (a?.freeIssueMaterialPerPartGbp ?? 0) + (a?.royaltiesPerPartGbp ?? 0),
  );
  if (assistsPerPart > 0) {
    provenance.push(
      `Assists £${assistsPerPart.toFixed(2)}/part added to customs value` +
      (toolingPerPart > 0
        ? ` (tooling £${(a!.toolingValueGbp as number).toLocaleString()} ÷ ${(a?.toolingApportionVolume ?? annualVolume).toLocaleString()} units = £${toolingPerPart.toFixed(2)})`
        : '') + '.',
    );
    warnings.push(
      `Buyer-supplied assists of £${assistsPerPart.toFixed(2)}/part are DUTIABLE under the customs valuation rules ` +
      `and must be declared on the import entry. Omitting them understates duty and is an under-declaration offence.`,
    );
  } else if ((inputs.exWorksLogisticsPerPart ?? 0) >= 0) {
    provenance.push(
      'No assists declared. If the buyer supplies tooling, dies, moulds or free-issue material to this supplier, ' +
      'their apportioned value is dutiable and MUST be added — a common automotive under-declaration.',
    );
  }

  // ── 4. Customs value — the base duty is charged on ───────────────────────
  const originInlandInCustomsValue = adders.find(x => x.key === 'origin-inland')?.amountGbp ?? 0;
  const customsValueCif = r2(exWorksCost + freight + insurance + assistsPerPart + originInlandInCustomsValue);
  provenance.push(
    `Customs value £${customsValueCif.toFixed(2)} = ex-works £${exWorksCost.toFixed(2)} ` +
    `+ freight £${freight.toFixed(2)} + insurance £${insurance.toFixed(2)}` +
    (originInlandInCustomsValue > 0 ? ` + origin inland £${originInlandInCustomsValue.toFixed(2)}` : '') +
    (assistsPerPart > 0 ? ` + assists £${assistsPerPart.toFixed(2)}` : '') +
    `. Duty is charged on this value, not on ex-works.`,
  );

  // ── 4. Import duty ───────────────────────────────────────────────────────
  const line = selectTariffLine(commodity, {
    hsCodeOverride: inputs.hsCodeOverride, nonAutomotive: inputs.nonAutomotive,
  });
  let dutyPct = 0;
  let hsCode = '—';
  let hsDescription = 'No commodity code mapped for this commodity';
  let dutyStatus: VerificationStatus = 'estimate';
  let preferenceApplied: string | undefined;
  let originAssessment: OriginAssessment | undefined;

  if (!line) {
    warnings.push(
      `No commodity code is mapped for "${commodity}". Duty assumed 0% — this is almost certainly wrong ` +
      `for a physical import. Add an HS candidate before relying on the landed figure.`,
    );
  } else {
    hsCode = line.hsCode;
    hsDescription = line.description;
    dutyPct = line.mfnDutyPct;
    dutyStatus = line.status;

    // Preferential origin — TESTED where we have the data, assumed otherwise
    const pref = ORIGIN_PREFERENCES.find(p => p.region === originRegion);
    if (pref) {
      provenance.push(`Origin ${pref.country}: ${pref.note}`);
      if (pref.preferentialDutyPct !== undefined && pref.preferentialDutyPct < dutyPct) {
        const mfnPct = line.mfnDutyPct;

        if (inputs.nonOriginatingMaterialCost !== undefined && pref.agreement) {
          // Run the actual rules-of-origin test rather than assuming preference.
          originAssessment = assessOrigin({
            agreement: pref.agreement,
            productType: inputs.originProductType ?? 'part',
            exWorksPrice: exWorksCost,
            nonOriginatingMaterialCost: inputs.nonOriginatingMaterialCost,
            mfnDutyPct: mfnPct,
            preferentialDutyPct: pref.preferentialDutyPct,
            customsValueCif,
            asOfDate,
            materialByOrigin: inputs.materialByOrigin,
            operationsPerformed: inputs.operationsPerformed,
          });
          warnings.push(...originAssessment.warnings);
          provenance.push(...originAssessment.notes);

          if (originAssessment.qualifies === true) {
            dutyPct = pref.preferentialDutyPct;
            preferenceApplied = pref.agreement;
          } else {
            // Fails or unknown → no preference. This is the safe direction:
            // over-claiming preference is recoverable duty plus penalties.
            dutyPct = mfnPct;
            provenance.push(
              `Preference NOT applied — origin ${originAssessment.qualifies === false ? 'test failed' : 'could not be established'}. MFN ${mfnPct}% used.`,
            );
          }
          dutyStatus = 'estimate';
        } else {
          dutyPct = pref.preferentialDutyPct;
          preferenceApplied = pref.agreement;
          warnings.push(
            `Preferential rate applied under ${pref.agreement} (${pref.preferentialDutyPct}%) — but origin was ASSUMED, not tested. ` +
            `Supply nonOriginatingMaterialCost to run the rules-of-origin check. ` +
            `Without proof of origin the MFN rate of ${mfnPct}% applies, a swing of ` +
            `£${(customsValueCif * ((mfnPct - pref.preferentialDutyPct) / 100)).toFixed(2)}/part.`,
          );
          if (pref.status !== 'verified') dutyStatus = 'estimate';
        }
      }
    } else {
      provenance.push(`No preference record for origin "${originRegion}" — MFN (UK Global Tariff) applied.`);
    }

    if (line.status !== 'verified') {
      warnings.push(
        `Duty rate ${dutyPct}% for ${hsCode} is ${line.status.toUpperCase()}, not verified against the official tariff. ` +
        `Confirm at ${line.verifyUrl} before using this number commercially.`,
      );
    }
  }

  const duty = r2(customsValueCif * (dutyPct / 100));
  adders.push({
    key: 'duty',
    label: `Import duty${preferenceApplied ? ` (${preferenceApplied} preference)` : ' (UK Global Tariff)'}`,
    amountGbp: duty,
    basis: `${dutyPct}% × CIF £${customsValueCif.toFixed(2)}`,
    status: dutyStatus,
    source: line?.source,
    verifyUrl: line?.verifyUrl,
  });

  // ── Trade remedies (ADD/CVD) — levied ON TOP of MFN ──────────────────────
  // These routinely dwarf the MFN rate (22.3% vs 4.5% on Chinese forged
  // aluminium road wheels), so a missed measure is the most expensive error
  // in landed cost.
  const remedies = hsCode !== '—' ? findTradeRemedies(hsCode, originRegion, asOfDate) : [];
  for (const rem of remedies) {
    const remedyDuty = r2(customsValueCif * (rem.dutyPct / 100));
    adders.push({
      key: `remedy-${rem.measureType}`,
      label: `${rem.measureType === 'anti-dumping' ? 'Anti-dumping' : 'Countervailing'} duty — ${rem.productDescription}`,
      amountGbp: remedyDuty,
      basis: `${rem.dutyPct}% × customs value £${customsValueCif.toFixed(2)}`,
      status: rem.status,
      source: rem.source,
      verifyUrl: rem.verifyUrl,
    });
    warnings.push(
      `TRADE REMEDY APPLIES: ${rem.dutyPct}% ${rem.measureType} duty on ${rem.productDescription} from ${originRegion} ` +
      `— £${remedyDuty.toFixed(2)}/part, ON TOP of the ${dutyPct}% MFN rate. ${rem.note}` +
      (rem.expires ? ` Measure expires ${rem.expires} — check for an expiry review.` : ''),
    );
  }

  // Screening warning — our register is a small subset of the live TRA list,
  // so "no match" must never be read as "no measure".
  if (HIGH_REMEDY_ORIGINS.includes(originRegion)) {
    if (remedies.length === 0) {
      warnings.push(
        `TRADE REMEDY NOT CHECKED: imports from ${originRegion} frequently attract anti-dumping or countervailing ` +
        `duties, which are charged ON TOP of MFN and are often 20-70%. CostVision holds only a small subset of the ` +
        `UK Trade Remedies Authority register — no match here means NOT CHECKED, not "no duty". ` +
        `Search the live register before committing: https://www.trade-remedies.service.gov.uk/public/cases/`,
      );
    }
  }

  // ── 5. CBAM ──────────────────────────────────────────────────────────────
  const scheme = cbamScheme === 'none' ? null : CBAM_SCHEMES[cbamScheme];
  if (scheme && inputs.carbon) {
    const sector = cbamSector(commodity, inputs.carbon.materialClass);
    if (sector && scheme.sectorsInScope.includes(sector)) {
      // CBAM bites on the EMBEDDED emissions of the metal, i.e. material
      // production — not the whole part's cradle-to-gate footprint.
      const embeddedTonnes = inputs.carbon.materialKgCO2e / 1000;
      // UK CBAM is levied on the GAP between the carbon price already paid in
      // the country of origin and the UK price — not on the full UK price.
      const originCarbon = inputs.originCarbonPriceGbpPerTonne
        ?? ORIGIN_CARBON_PRICE_GBP_PER_TONNE[originRegion] ?? 0;
      const gapPrice = Math.max(0, scheme.certificatePriceGbpPerTonne - originCarbon);
      // Free allocation still given to UK producers reduces the charge, and
      // phases out over ~9 years from 2027 — so the effective rate RISES yearly.
      // For a scheme not yet in force the projection must use the year it
      // STARTS, otherwise the forward-looking line reads £0.00 and is useless.
      const inForceNow = asOfDate >= scheme.liveFrom;
      const year = parseInt((inForceNow ? asOfDate : scheme.liveFrom).slice(0, 4), 10);
      const freeAlloc = freeAllocationFactor(year);
      const cbamCost = r2(embeddedTonnes * gapPrice * (1 - freeAlloc));
      const inForce = inForceNow;
      provenance.push(
        `CBAM: ${embeddedTonnes.toFixed(4)} t CO2e × (UK £${scheme.certificatePriceGbpPerTonne} − origin £${originCarbon}) ` +
        `× (1 − free allocation ${(freeAlloc * 100).toFixed(0)}%) = £${cbamCost.toFixed(2)}.`,
      );
      if (originCarbon > 0) {
        provenance.push(
          `Origin carbon price £${originCarbon}/t deducted — ${originRegion} operates carbon pricing, so only the gap is chargeable.`,
        );
      }
      if (gapPrice === 0) {
        provenance.push(`No CBAM liability: the origin carbon price meets or exceeds the UK price.`);
      }
      const adder: LandedAdder = {
        key: 'cbam',
        label: `${scheme.scheme} CBAM — ${sector.replace('_', '/')} (from ${scheme.liveFrom})`,
        amountGbp: cbamCost,
        basis: `${inputs.carbon.materialKgCO2e.toFixed(2)} kg CO2e × £${gapPrice}/t gap (UK £${scheme.certificatePriceGbpPerTonne} − origin £${originCarbon}) × ${((1 - freeAlloc) * 100).toFixed(0)}% chargeable`,
        status: scheme.status,
        source: scheme.source,
      };
      if (inForce) {
        adders.push(adder);
        provenance.push(`${scheme.scheme} CBAM in force since ${scheme.liveFrom} — applied.`);
      } else {
        futureLines.push(adder);
        warnings.push(
          `${scheme.scheme} CBAM begins ${scheme.liveFrom} and is NOT yet in force at ${asOfDate}. ` +
          `A projected £${cbamCost.toFixed(2)}/part is shown as a future line, excluded from today's landed cost.`,
        );
      }
      warnings.push(
        `CBAM cost uses CostVision's estimated embedded carbon. The statutory calculation uses verified installation ` +
        `emissions or published default values — obtain supplier emissions data before relying on this figure.`,
      );
    } else if (sector === null) {
      provenance.push(`CBAM: not applicable — ${inputs.carbon.materialClass} is outside the ${cbamScheme} CBAM sector scope.`);
    }
  }

  // ── 6. Steel trade measure exposure ──────────────────────────────────────
  if (steelMillProduct && asOfDate >= UK_STEEL_MEASURE.liveFrom) {
    warnings.push(
      `UK steel trade measure (from ${UK_STEEL_MEASURE.liveFrom}): imports above quota attract ` +
      `${UK_STEEL_MEASURE.overQuotaDutyPct}% duty. ${UK_STEEL_MEASURE.note} Quota position is importer-specific ` +
      `and is NOT modelled — check quota availability before committing.`,
    );
  }

  // ── 7. Customs clearance ─────────────────────────────────────────────────
  const partsPerShipment = inputs.partsPerShipment ?? Math.max(1, Math.min(
    annualVolume > 0 ? annualVolume / 12 : 1000,     // ~monthly shipment
    partWeightKg > 0 ? 20000 / partWeightKg : 5000,  // or a 20 t container
  ));
  const clearance = r2(clearancePerShipmentGbp / partsPerShipment);
  adders.push({
    key: 'clearance', label: 'Customs clearance / broker fee', amountGbp: clearance,
    basis: `£${clearancePerShipmentGbp}/shipment ÷ ${Math.round(partsPerShipment).toLocaleString()} parts`,
    status: 'estimate',
  });

  // ── 8. Inland haulage ────────────────────────────────────────────────────
  const inland = inputs.inlandHaulagePerPartGbp ?? r2(Math.max(0.02, partWeightKg * 0.05));
  adders.push({
    key: 'inland', label: 'Inland haulage (UK port → plant)', amountGbp: inland,
    basis: `${partWeightKg.toFixed(2)} kg × £0.05/kg (min £0.02)`, status: 'estimate',
  });

  // ── Totals ───────────────────────────────────────────────────────────────
  const addersTotal = r2(adders.reduce((s, a) => s + a.amountGbp, 0));
  const totalLandedCost = r2(exWorksCost + addersTotal);

  // ── Import VAT — reported, never counted ─────────────────────────────────
  const importVat = r2((customsValueCif + duty) * (UK_IMPORT_VAT_PCT / 100));

  if (incoterm === 'DDP') {
    warnings.push(
      `Incoterm DDP: the supplier bears freight, duty and clearance, so those costs are already inside their ` +
      `quoted price. Adding them here double-counts — compare the DDP quote against TOTAL LANDED, not ex-works.`,
    );
  }

  const needsVerification = adders.some(a => a.key === 'duty' && a.status !== 'verified');

  return {
    exWorksCost: r2(exWorksCost),
    adders, addersTotal, totalLandedCost,
    customsValueCif,
    dutyRatePctApplied: dutyPct,
    hsCode, hsDescription, originRegion, preferenceApplied,
    upliftPct: exWorksCost > 0 ? r2((addersTotal / exWorksCost) * 100) : 0,
    recoverable: {
      importVatGbp: importVat,
      ratePct: UK_IMPORT_VAT_PCT,
      note: 'Import VAT is reclaimable as input tax by a VAT-registered importer. Reported for cash-flow only — deliberately EXCLUDED from should-cost.',
    },
    futureLines,
    origin: originAssessment,
    warnings, provenance, needsVerification,
    valuationBasis: VALUATION_BASIS,
    reliefOpportunities: dutyPct > 0 || remedies.length > 0 ? DUTY_RELIEF_REGIMES : [],
  };
}

/** One-line summary for reports. */
export function landedCostSummary(r: LandedCostResult): string {
  return `Ex-works £${r.exWorksCost.toFixed(2)} + landed adders £${r.addersTotal.toFixed(2)} ` +
    `= £${r.totalLandedCost.toFixed(2)} landed UK (+${r.upliftPct.toFixed(1)}%) · ` +
    `HS ${r.hsCode} @ ${r.dutyRatePctApplied}%${r.needsVerification ? ' · RATE UNVERIFIED' : ''}`;
}
