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
  CBAM_SCHEMES, HS_CANDIDATES, ORIGIN_PREFERENCES, UK_IMPORT_VAT_PCT,
  UK_STEEL_MEASURE, cbamSector,
} from './landed-cost-data.js';
import type { CbamScheme, TariffLine, VerificationStatus } from './landed-cost-data.js';

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

  warnings: string[];
  provenance: string[];
  /** True when any applied rate is unverified — headline must be caveated. */
  needsVerification: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

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
  const freight = inputs.freightPerPartGbp ?? r2(Math.max(0.03, chargeableKg * freightPerKg(originRegion)));
  adders.push({
    key: 'freight', label: `International freight (${originRegion} → UK)`,
    amountGbp: freight,
    basis: inputs.freightPerPartGbp !== undefined
      ? 'user-supplied'
      : `${chargeableKg.toFixed(2)} kg chargeable × £${freightPerKg(originRegion).toFixed(2)}/kg sea-freight`,
    status: 'estimate',
    source: 'Indicative lane rates — replace with contracted freight for a quotable figure.',
  });

  // ── 2. Insurance ─────────────────────────────────────────────────────────
  const insurance = r2((exWorksCost + freight) * insuranceRate);
  adders.push({
    key: 'insurance', label: 'Marine / transit insurance', amountGbp: insurance,
    basis: `${(insuranceRate * 100).toFixed(2)}% of (ex-works + freight)`, status: 'estimate',
  });

  // ── 3. Customs value (CIF) — the base duty is charged on ─────────────────
  const customsValueCif = r2(exWorksCost + freight + insurance);
  provenance.push(
    `Customs value (CIF) £${customsValueCif.toFixed(2)} = ex-works £${exWorksCost.toFixed(2)} ` +
    `+ freight £${freight.toFixed(2)} + insurance £${insurance.toFixed(2)}. Duty is charged on this value, not on ex-works.`,
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

    // Preferential origin
    const pref = ORIGIN_PREFERENCES.find(p => p.region === originRegion);
    if (pref) {
      provenance.push(`Origin ${pref.country}: ${pref.note}`);
      if (pref.preferentialDutyPct !== undefined && pref.preferentialDutyPct < dutyPct) {
        dutyPct = pref.preferentialDutyPct;
        preferenceApplied = pref.agreement;
        warnings.push(
          `Preferential rate applied under ${pref.agreement} (${pref.preferentialDutyPct}%). ` +
          `This is ONLY valid if the product-specific rules of origin are met and a valid origin declaration is held. ` +
          `Without proof of origin the MFN rate of ${line.mfnDutyPct}% applies.`,
        );
        if (pref.status !== 'verified') dutyStatus = 'estimate';
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

  // ── 5. CBAM ──────────────────────────────────────────────────────────────
  const scheme = cbamScheme === 'none' ? null : CBAM_SCHEMES[cbamScheme];
  if (scheme && inputs.carbon) {
    const sector = cbamSector(commodity, inputs.carbon.materialClass);
    if (sector && scheme.sectorsInScope.includes(sector)) {
      // CBAM bites on the EMBEDDED emissions of the metal, i.e. material
      // production — not the whole part's cradle-to-gate footprint.
      const embeddedTonnes = inputs.carbon.materialKgCO2e / 1000;
      const cbamCost = r2(embeddedTonnes * scheme.certificatePriceGbpPerTonne);
      const inForce = asOfDate >= scheme.liveFrom;
      const adder: LandedAdder = {
        key: 'cbam',
        label: `${scheme.scheme} CBAM — ${sector.replace('_', '/')} (from ${scheme.liveFrom})`,
        amountGbp: cbamCost,
        basis: `${inputs.carbon.materialKgCO2e.toFixed(2)} kg CO2e embedded × £${scheme.certificatePriceGbpPerTonne}/t`,
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
    warnings, provenance, needsVerification,
  };
}

/** One-line summary for reports. */
export function landedCostSummary(r: LandedCostResult): string {
  return `Ex-works £${r.exWorksCost.toFixed(2)} + landed adders £${r.addersTotal.toFixed(2)} ` +
    `= £${r.totalLandedCost.toFixed(2)} landed UK (+${r.upliftPct.toFixed(1)}%) · ` +
    `HS ${r.hsCode} @ ${r.dutyRatePctApplied}%${r.needsVerification ? ' · RATE UNVERIFIED' : ''}`;
}
