import { REGIONAL_DATA, type ManufacturingRegion } from '../../src/engine/regional-rates.js';
import { operationsCost, thtMethodCost, type OperationsInput } from './pcb-operations.js';
import { fabOptionsCost, type FabOptions } from './pcb-fab-options.js';
import { FX_TO_GBP_TABLE } from '../../src/engine/insights.js';
/**
 * PCB Manufacturing Country Rates Database — 2026 Edition
 *
 * Sources: IPC Market Research Report 2025, CBRE Global EMS Labour Benchmarks 2025,
 * Prismark PCB Industry Report Q4-2025, published EMS contracts (Jabil, Flex, Celestica).
 * All prices in GBP, calibrated to Jan 2026 FX mid-rates; re-based to 2026-09-29 FX and wages by scripts/pcb-rate-refresh.ts (fawazahmed0/currency-api daily snapshots 2026-01-15 and 2026-09-29 (npm @fawazahmed0/currency-api)).
 *
 * Covers: PCB fabrication, SMT/THT assembly, logistics to UK, the EMS material burden on components (one global market).
 */

export interface PCBFabRates {
  /** Base bare-board cost £/dm² for a standard 2-layer board at 10+ panel order */
  baseCostPerDm2_2L: number;
  /** Cost added per additional layer above 2, per dm² */
  layerAdderPerDm2: number;
  /** One-off tooling / Gerber setup fee per design revision (GBP) */
  setupCostGBP: number;
  /** Surface finish cost multipliers applied to base+layer cost */
  surfaceFinishMultiplier: {
    hasl: number;
    hasl_lf: number;
    enig: number;
    osp: number;
    enepig: number;
    /** Immersion silver (ImAg). Historically stored under the key 'iteq' — kept
     *  as an alias so saved analyses still resolve. */
    iteq: number;
  };
  /** £ adder per 100 through vias drilled */
  viaAdderPer100Through: number;
  /** £ adder per 10 blind/buried vias */
  viaAdderPer10Blind: number;
  /** £ adder per 10 laser micro vias */
  viaAdderPer10Micro: number;
  /** Percentage uplift on base PCB cost for HDI construction */
  hdiUpliftPct: number;
  /** Percentage uplift for impedance-controlled layers */
  impedanceUpliftPct: number;
  /** Finest achievable trace/space in mm (production capability) */
  minTraceSpaceMm: number;
  /** Standard panel area in dm² used by this fab region */
  panelAreaDm2: number;
}

export interface SMTAssemblyRates {
  /** Fully-loaded SMT machine line rate £/hr (machine + overhead + indirect labour) */
  smtLineRatePerHr: number;
  /** Electronics operator labour £/hr. Overwritten from REGIONAL_DATA[country].labour.electronics at load (one country
   *  source). It IS costed: AOI, X-ray and ICT at volume are station time × 2 × this rate (operator + tester), and it is
   *  the basis the bundled placement / joint prices were built from. (It said "informational" — arith audit, Oct 2026.) */
  labourRatePerHr: number;
  /** Through-hole wave solder cost per joint (£) */
  thRatePerJoint: number;
  /** Manual hand-solder cost per joint (£) */
  manualSolderPerJoint: number;
  /** AOI inspection cost per board pass (£) */
  aoiPerBoard: number;
  /** X-ray inspection cost per board (£) — for BGA verification */
  xrayPerBoard: number;
  /** ICT in-circuit test cost per board (£) — amortises fixture */
  ictPerBoard: number;
  /** Conformal coating cost per cm² covered (£) */
  conformalCoatPerCm2: number;
  /** Batch changeover / setup cost per production run (£) */
  batchSetupGBP: number;
  /** Typical DPPM (defects per million) — quality indicator */
  dppm: number;
}

export interface LogisticsToUK {
  /** UK import duty rate on PCBs/PCBA (HS 8534/8537) as a fraction */
  importDutyFraction: number;
  /** Air freight cost £/kg — for typical PCB/PCBA shipment */
  airFreightPerKgGBP: number;
  /** Minimum air freight cost per shipment (GBP) */
  minAirFreightGBP: number;
  /** Sea freight cost £/kg — for bulk volume orders */
  seaFreightPerKgGBP: number;
  /** Typical transit time in working days (air) */
  airTransitDays: number;
  /** Supply chain risk index 0–1 (1 = most reliable, shortest risk exposure) */
  supplyChainRisk: number;
}

export interface ComponentSourcing {
  /** Availability index 0–1 (1 = full global component availability on doorstep) */
  availabilityIndex: number;
  // (A per-country "component sourcing index" — CN ×0.88 … UK ×1.22 on every component — was removed: it had no
  //  source and alone made about £18 of the £34 UK–China gap on the radar board. Components for an EMS programme are
  //  bought on one global market; what differs by country — freight and duty — is modelled. Pipeline review F13.)
  /** Whether the region has good access to Asian spot market (grey/surplus) */
  hasSpotMarketAccess: boolean;
}

export interface PCBCountryRate {
  id: string;
  name: string;
  shortName: string;
  flag: string;
  region: 'asia_low' | 'asia_mid' | 'asia_premium' | 'europe_low' | 'europe_premium' | 'americas' | 'domestic';
  currency: string;
  /** 2026 FX mid-rate to GBP — INFORMATIONAL/display only. All cost figures in
   *  this database are actual country-specific values already expressed in GBP;
   *  nothing is derived by FX conversion. */
  fxToGBP: number;
  /** Date the £ values were last re-based (scripts/pcb-rate-refresh.ts). */
  ratesAsOf?: string;

  pcbFab: PCBFabRates;
  assembly: SMTAssemblyRates;
  logistics: LogisticsToUK;
  components: ComponentSourcing;

  /** Overall quality/reliability index 0–1 */
  qualityIndex: number;
  /** Relevant certifications common for this region */
  certifications: string[];
  /** Minimum panel order quantity */
  minPanelOrderQty: number;
  /** Lead time range in calendar weeks (prototype / production) */
  leadTimeWeeks: { proto: number; production: number };
  /** Best use-case description */
  bestFor: string;
  dataYear: 2026;
  /** 2025–2026 should-cost trend (Feature 5) */
  priceTrend?: {
    direction: 'rising' | 'stable' | 'falling';
    /** % change over last 6 months, positive = rising */
    pctChange6m: number;
    note: string;
  };
  /** Automotive programme NRE cost layer (Feature 7) */
  automotiveNRE?: AutomotiveNRECosts;
  /** Actual country industrial electricity tariff, £/kWh (2025-26 published
   *  tariffs — country-specific values, NOT derived by conversion). */
  energyCostPerKWh?: number;
  /** ESD bag/tray/box + pack labour per finished board, £ — country-specific. */
  packagingCostPerBoard?: number;
  /** Supply-chain risk dimensions (Feature 6) — each 0..1, 1 = lowest risk */
  riskDimensions?: {
    geopolitical: number;
    logisticsReliability: number;
    qualityConsistency: number;
    leadTimeVariance: number;
  };
}

// ─── Automotive NRE cost layer (Feature 7) ─────────────────────────────────
export interface AutomotiveNRECosts {
  /** PPAP submission package prep */
  ppapGBP: number;
  /** DFMEA/PFMEA documentation */
  fmeaGBP: number;
  /** Design Verification Plan & Report */
  dvprGBP: number;
  /** First Article Inspection (FAIR) */
  firstArticleGBP: number;
  /** IATF 16949 audit amortisation per program */
  iatfAuditGBP: number;
  totalGBP: number;
}

function mkNRE(ppap: number, fmea: number, dvpr: number, fai: number, iatf: number): AutomotiveNRECosts {
  return {
    ppapGBP: ppap, fmeaGBP: fmea, dvprGBP: dvpr, firstArticleGBP: fai, iatfAuditGBP: iatf,
    totalGBP: ppap + fmea + dvpr + fai + iatf,
  };
}

// ─── Country Database ──────────────────────────────────────────────────────

export const PCB_COUNTRY_RATES: Record<string, PCBCountryRate> = {

  cn: {
    id: 'cn', name: 'China (Shenzhen / Suzhou)', shortName: 'China', flag: '🇨🇳',
    region: 'asia_low', currency: 'CNY', fxToGBP: 8.8799,
    pcbFab: {
      baseCostPerDm2_2L: 0.116,
      layerAdderPerDm2: 0.07379,
      setupCostGBP: 12.65,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.04, enig: 1.22, osp: 0.95, enepig: 1.60, iteq: 1.10 },
      viaAdderPer100Through: 0.1897,
      viaAdderPer10Blind: 0.2951,
      viaAdderPer10Micro: 0.506,
      hdiUpliftPct: 35,
      impedanceUpliftPct: 18,
      minTraceSpaceMm: 0.075,
      panelAreaDm2: 6.0,
    },
    assembly: {
      smtLineRatePerHr: 11.6,
      labourRatePerHr: 4.55,
      thRatePerJoint: 0.009487,
      manualSolderPerJoint: 0.01687,
      aoiPerBoard: 0.3689,
      xrayPerBoard: 1.265,
      ictPerBoard: 2.635,
      conformalCoatPerCm2: 0.002635,
      batchSetupGBP: 18.97,
      dppm: 800,
    },
    logistics: {
      importDutyFraction: 0.037,
      airFreightPerKgGBP: 3.20,
      minAirFreightGBP: 25,
      seaFreightPerKgGBP: 0.40,
      airTransitDays: 5,
      supplyChainRisk: 0.82,
    },
    components: { availabilityIndex: 0.98, hasSpotMarketAccess: true },
    qualityIndex: 0.83,
    certifications: ['ISO9001', 'IATF16949', 'UL', 'RoHS', 'IPC-6012'],
    minPanelOrderQty: 5,
    leadTimeWeeks: { proto: 1, production: 3 },
    bestFor: 'High-volume consumer, cost-optimised, standard FR4',
    dataYear: 2026, ratesAsOf: '2026-09-29',
  },

  vn: {
    id: 'vn', name: 'Vietnam (Ho Chi Minh City / Hanoi)', shortName: 'Vietnam', flag: '🇻🇳',
    region: 'asia_low', currency: 'VND', fxToGBP: 34350,
    pcbFab: {
      baseCostPerDm2_2L: 0.1441,
      layerAdderPerDm2: 0.09264,
      setupCostGBP: 16.47,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.05, enig: 1.25, osp: 0.96, enepig: 1.65, iteq: 1.12 },
      viaAdderPer100Through: 0.2264,
      viaAdderPer10Blind: 0.3603,
      viaAdderPer10Micro: 0.597,
      hdiUpliftPct: 42,
      impedanceUpliftPct: 22,
      minTraceSpaceMm: 0.10,
      panelAreaDm2: 6.0,
    },
    assembly: {
      smtLineRatePerHr: 9.264,
      labourRatePerHr: 2.81,
      thRatePerJoint: 0.007205,
      manualSolderPerJoint: 0.01338,
      aoiPerBoard: 0.3088,
      xrayPerBoard: 1.132,
      ictPerBoard: 2.264,
      conformalCoatPerCm2: 0.002264,
      batchSetupGBP: 15.44,
      dppm: 1100,
    },
    logistics: {
      importDutyFraction: 0.055,
      airFreightPerKgGBP: 3.60,
      minAirFreightGBP: 28,
      seaFreightPerKgGBP: 0.38,
      airTransitDays: 6,
      supplyChainRisk: 0.78,
    },
    components: { availabilityIndex: 0.85, hasSpotMarketAccess: true },
    qualityIndex: 0.80,
    certifications: ['ISO9001', 'UL', 'RoHS'],
    minPanelOrderQty: 10,
    leadTimeWeeks: { proto: 2, production: 3 },
    bestFor: 'Labour-intensive assembly, high-volume low-complexity PCBA',
    dataYear: 2026, ratesAsOf: '2026-09-29',
  },

  in: {
    id: 'in', name: 'India (Pune / Bengaluru / Chennai)', shortName: 'India', flag: '🇮🇳',
    region: 'asia_low', currency: 'INR', fxToGBP: 127.2,
    pcbFab: {
      baseCostPerDm2_2L: 0.1716,
      layerAdderPerDm2: 0.1048,
      setupCostGBP: 19.06,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.06, enig: 1.28, osp: 0.97, enepig: 1.70, iteq: 1.15 },
      viaAdderPer100Through: 0.2383,
      viaAdderPer10Blind: 0.3813,
      viaAdderPer10Micro: 0.6195,
      hdiUpliftPct: 45,
      impedanceUpliftPct: 25,
      minTraceSpaceMm: 0.10,
      panelAreaDm2: 4.8,
    },
    assembly: {
      smtLineRatePerHr: 13.34,
      labourRatePerHr: 3.56,
      thRatePerJoint: 0.009531,
      manualSolderPerJoint: 0.01716,
      aoiPerBoard: 0.3813,
      xrayPerBoard: 1.239,
      ictPerBoard: 2.669,
      conformalCoatPerCm2: 0.002669,
      batchSetupGBP: 19.06,
      dppm: 1200,
    },
    logistics: {
      importDutyFraction: 0.055,
      airFreightPerKgGBP: 3.80,
      minAirFreightGBP: 30,
      seaFreightPerKgGBP: 0.42,
      airTransitDays: 5,
      supplyChainRisk: 0.76,
    },
    components: { availabilityIndex: 0.80, hasSpotMarketAccess: false },
    qualityIndex: 0.78,
    certifications: ['ISO9001', 'UL', 'RoHS'],
    minPanelOrderQty: 10,
    leadTimeWeeks: { proto: 2, production: 4 },
    bestFor: 'Growing capacity, English-speaking, government PLI incentives',
    dataYear: 2026, ratesAsOf: '2026-09-29',
  },

  th: {
    id: 'th', name: 'Thailand (Bangkok / Ayutthaya)', shortName: 'Thailand', flag: '🇹🇭',
    region: 'asia_mid', currency: 'THB', fxToGBP: 44.524,
    pcbFab: {
      baseCostPerDm2_2L: 0.19,
      layerAdderPerDm2: 0.1235,
      setupCostGBP: 23.75,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.05, enig: 1.26, osp: 0.97, enepig: 1.62, iteq: 1.12 },
      viaAdderPer100Through: 0.266,
      viaAdderPer10Blind: 0.399,
      viaAdderPer10Micro: 0.665,
      hdiUpliftPct: 40,
      impedanceUpliftPct: 22,
      minTraceSpaceMm: 0.10,
      panelAreaDm2: 5.2,
    },
    assembly: {
      smtLineRatePerHr: 17.1,
      labourRatePerHr: 5.51,
      thRatePerJoint: 0.0114,
      manualSolderPerJoint: 0.0209,
      aoiPerBoard: 0.4275,
      xrayPerBoard: 1.425,
      ictPerBoard: 2.85,
      conformalCoatPerCm2: 0.00304,
      batchSetupGBP: 20.9,
      dppm: 650,
    },
    logistics: {
      importDutyFraction: 0.055,
      airFreightPerKgGBP: 3.80,
      minAirFreightGBP: 30,
      seaFreightPerKgGBP: 0.45,
      airTransitDays: 7,
      supplyChainRisk: 0.82,
    },
    components: { availabilityIndex: 0.88, hasSpotMarketAccess: true },
    qualityIndex: 0.85,
    certifications: ['ISO9001', 'IATF16949', 'UL', 'RoHS'],
    minPanelOrderQty: 8,
    leadTimeWeeks: { proto: 2, production: 3 },
    bestFor: 'Automotive PCBA, HDD/storage, established EMS cluster (Fabrinet)',
    dataYear: 2026, ratesAsOf: '2026-09-29',
  },

  my: {
    id: 'my', name: 'Malaysia (Penang / Johor Bahru)', shortName: 'Malaysia', flag: '🇲🇾',
    region: 'asia_mid', currency: 'MYR', fxToGBP: 5.4055,
    pcbFab: {
      baseCostPerDm2_2L: 0.1912,
      layerAdderPerDm2: 0.1207,
      setupCostGBP: 22.14,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.05, enig: 1.25, osp: 0.96, enepig: 1.62, iteq: 1.12 },
      viaAdderPer100Through: 0.2516,
      viaAdderPer10Blind: 0.4025,
      viaAdderPer10Micro: 0.6541,
      hdiUpliftPct: 38,
      impedanceUpliftPct: 20,
      minTraceSpaceMm: 0.075,
      panelAreaDm2: 5.8,
    },
    assembly: {
      smtLineRatePerHr: 20.12,
      labourRatePerHr: 5.23,
      thRatePerJoint: 0.01107,
      manualSolderPerJoint: 0.02012,
      aoiPerBoard: 0.483,
      xrayPerBoard: 1.61,
      ictPerBoard: 3.22,
      conformalCoatPerCm2: 0.003019,
      batchSetupGBP: 20.12,
      dppm: 580,
    },
    logistics: {
      importDutyFraction: 0.055,
      airFreightPerKgGBP: 3.70,
      minAirFreightGBP: 28,
      seaFreightPerKgGBP: 0.43,
      airTransitDays: 6,
      supplyChainRisk: 0.84,
    },
    components: { availabilityIndex: 0.90, hasSpotMarketAccess: true },
    qualityIndex: 0.86,
    certifications: ['ISO9001', 'IATF16949', 'AS9100', 'UL'],
    minPanelOrderQty: 5,
    leadTimeWeeks: { proto: 2, production: 3 },
    bestFor: 'Semiconductor assembly, aerospace/defence, high-reliability EMS (Jabil, Flex)',
    dataYear: 2026, ratesAsOf: '2026-09-29',
  },

  tw: {
    id: 'tw', name: 'Taiwan (Taoyuan / Hsinchu / Taichung)', shortName: 'Taiwan', flag: '🇹🇼',
    region: 'asia_mid', currency: 'TWD', fxToGBP: 42.167,
    pcbFab: {
      baseCostPerDm2_2L: 0.5227,
      layerAdderPerDm2: 0.3317,
      setupCostGBP: 48.25,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.04, enig: 1.20, osp: 0.95, enepig: 1.55, iteq: 1.08 },
      viaAdderPer100Through: 0.3518,
      viaAdderPer10Blind: 0.5529,
      viaAdderPer10Micro: 0.9047,
      hdiUpliftPct: 28,
      impedanceUpliftPct: 16,
      minTraceSpaceMm: 0.050,
      panelAreaDm2: 5.8,
    },
    assembly: {
      smtLineRatePerHr: 36.19,
      labourRatePerHr: 10.56,
      thRatePerJoint: 0.01809,
      manualSolderPerJoint: 0.03217,
      aoiPerBoard: 0.6534,
      xrayPerBoard: 2.212,
      ictPerBoard: 4.524,
      conformalCoatPerCm2: 0.004222,
      batchSetupGBP: 35.18,
      dppm: 280,
    },
    logistics: {
      importDutyFraction: 0.037,
      airFreightPerKgGBP: 4.00,
      minAirFreightGBP: 35,
      seaFreightPerKgGBP: 0.50,
      airTransitDays: 5,
      supplyChainRisk: 0.88,
    },
    components: { availabilityIndex: 0.96, hasSpotMarketAccess: true },
    qualityIndex: 0.93,
    certifications: ['ISO9001', 'IATF16949', 'AS9100', 'UL', 'IPC-6012 Class 3'],
    minPanelOrderQty: 3,
    leadTimeWeeks: { proto: 1, production: 3 },
    bestFor: 'Advanced HDI, fine-pitch BGA substrate, high-speed digital (Unimicron, ZDT)',
    dataYear: 2026, ratesAsOf: '2026-09-29',
  },

  kr: {
    id: 'kr', name: 'South Korea (Suwon / Busan)', shortName: 'South Korea', flag: '🇰🇷',
    region: 'asia_mid', currency: 'KRW', fxToGBP: 1798,
    pcbFab: {
      baseCostPerDm2_2L: 0.7466,
      layerAdderPerDm2: 0.4611,
      setupCostGBP: 71.36,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.05, enig: 1.22, osp: 0.96, enepig: 1.58, iteq: 1.10 },
      viaAdderPer100Through: 0.4392,
      viaAdderPer10Blind: 0.7136,
      viaAdderPer10Micro: 1.153,
      hdiUpliftPct: 25,
      impedanceUpliftPct: 15,
      minTraceSpaceMm: 0.050,
      panelAreaDm2: 6.0,
    },
    assembly: {
      smtLineRatePerHr: 46.11,
      labourRatePerHr: 17.15,
      thRatePerJoint: 0.02415,
      manualSolderPerJoint: 0.04172,
      aoiPerBoard: 0.8783,
      xrayPerBoard: 2.745,
      ictPerBoard: 5.489,
      conformalCoatPerCm2: 0.00527,
      batchSetupGBP: 49.4,
      dppm: 220,
    },
    logistics: {
      importDutyFraction: 0.0,
      airFreightPerKgGBP: 4.20,
      minAirFreightGBP: 35,
      seaFreightPerKgGBP: 0.52,
      airTransitDays: 5,
      supplyChainRisk: 0.90,
    },
    components: { availabilityIndex: 0.92, hasSpotMarketAccess: true },
    qualityIndex: 0.93,
    certifications: ['ISO9001', 'IATF16949', 'IPC-6012 Class 3'],
    minPanelOrderQty: 3,
    leadTimeWeeks: { proto: 1, production: 3 },
    bestFor: 'Premium HDI, Samsung ecosystem supply chain, display/memory adjacent',
    dataYear: 2026, ratesAsOf: '2026-09-29',
  },

  mx: {
    id: 'mx', name: 'Mexico (Juárez / Monterrey / Guadalajara)', shortName: 'Mexico', flag: '🇲🇽',
    region: 'americas', currency: 'MXN', fxToGBP: 23.836,
    pcbFab: {
      baseCostPerDm2_2L: 0.3811,
      layerAdderPerDm2: 0.2407,
      setupCostGBP: 38.11,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.06, enig: 1.30, osp: 0.97, enepig: 1.70, iteq: 1.14 },
      viaAdderPer100Through: 0.3209,
      viaAdderPer10Blind: 0.5015,
      viaAdderPer10Micro: 0.8224,
      hdiUpliftPct: 45,
      impedanceUpliftPct: 25,
      minTraceSpaceMm: 0.10,
      panelAreaDm2: 5.0,
    },
    assembly: {
      smtLineRatePerHr: 24.07,
      labourRatePerHr: 7.1,
      thRatePerJoint: 0.01404,
      manualSolderPerJoint: 0.02507,
      aoiPerBoard: 0.5516,
      xrayPerBoard: 1.805,
      ictPerBoard: 3.51,
      conformalCoatPerCm2: 0.003811,
      batchSetupGBP: 28.08,
      dppm: 550,
    },
    logistics: {
      importDutyFraction: 0.037,
      airFreightPerKgGBP: 4.80,
      minAirFreightGBP: 40,
      seaFreightPerKgGBP: 0.60,
      airTransitDays: 4,
      supplyChainRisk: 0.80,
    },
    components: { availabilityIndex: 0.86, hasSpotMarketAccess: false },
    qualityIndex: 0.84,
    certifications: ['ISO9001', 'IATF16949', 'UL'],
    minPanelOrderQty: 5,
    leadTimeWeeks: { proto: 2, production: 3 },
    bestFor: 'Nearshore for US OEMs, automotive PCBA, USMCA supply chains',
    dataYear: 2026, ratesAsOf: '2026-09-29',
  },

  cz: {
    id: 'cz', name: 'Czech Republic (Brno / Prague)', shortName: 'Czech Republic', flag: '🇨🇿',
    region: 'europe_low', currency: 'CZK', fxToGBP: 28.426,
    pcbFab: {
      baseCostPerDm2_2L: 0.5711,
      layerAdderPerDm2: 0.3545,
      setupCostGBP: 54.15,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.06, enig: 1.28, osp: 0.97, enepig: 1.68, iteq: 1.12 },
      viaAdderPer100Through: 0.3939,
      viaAdderPer10Blind: 0.64,
      viaAdderPer10Micro: 1.034,
      hdiUpliftPct: 40,
      impedanceUpliftPct: 22,
      minTraceSpaceMm: 0.10,
      panelAreaDm2: 4.8,
    },
    assembly: {
      smtLineRatePerHr: 33.48,
      labourRatePerHr: 12.86,
      thRatePerJoint: 0.02166,
      manualSolderPerJoint: 0.03939,
      aoiPerBoard: 0.6892,
      xrayPerBoard: 2.265,
      ictPerBoard: 4.726,
      conformalCoatPerCm2: 0.004431,
      batchSetupGBP: 37.42,
      dppm: 380,
    },
    logistics: {
      importDutyFraction: 0.0,
      airFreightPerKgGBP: 1.20,
      minAirFreightGBP: 12,
      seaFreightPerKgGBP: 0.0,
      airTransitDays: 2,
      supplyChainRisk: 0.91,
    },
    components: { availabilityIndex: 0.88, hasSpotMarketAccess: false },
    qualityIndex: 0.91,
    certifications: ['ISO9001', 'IATF16949', 'AS9100', 'IPC-6012'],
    minPanelOrderQty: 2,
    leadTimeWeeks: { proto: 1, production: 2 },
    bestFor: 'EU automotive supply chain, Foxconn/Celestica EMS, short lead times to UK',
    dataYear: 2026, ratesAsOf: '2026-09-29',
  },

  pl: {
    id: 'pl', name: 'Poland (Wrocław / Łódź / Poznań)', shortName: 'Poland', flag: '🇵🇱',
    region: 'europe_low', currency: 'PLN', fxToGBP: 5.0958,
    pcbFab: {
      baseCostPerDm2_2L: 0.496,
      layerAdderPerDm2: 0.3052,
      setupCostGBP: 45.78,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.06, enig: 1.27, osp: 0.97, enepig: 1.66, iteq: 1.11 },
      viaAdderPer100Through: 0.3624,
      viaAdderPer10Blind: 0.5723,
      viaAdderPer10Micro: 0.9347,
      hdiUpliftPct: 42,
      impedanceUpliftPct: 23,
      minTraceSpaceMm: 0.10,
      panelAreaDm2: 4.8,
    },
    assembly: {
      smtLineRatePerHr: 28.61,
      labourRatePerHr: 10.43,
      thRatePerJoint: 0.01908,
      manualSolderPerJoint: 0.03434,
      aoiPerBoard: 0.62,
      xrayPerBoard: 2.003,
      ictPerBoard: 4.292,
      conformalCoatPerCm2: 0.004006,
      batchSetupGBP: 33.38,
      dppm: 420,
    },
    logistics: {
      importDutyFraction: 0.0,
      airFreightPerKgGBP: 1.10,
      minAirFreightGBP: 10,
      seaFreightPerKgGBP: 0.0,
      airTransitDays: 2,
      supplyChainRisk: 0.91,
    },
    components: { availabilityIndex: 0.86, hasSpotMarketAccess: false },
    qualityIndex: 0.90,
    certifications: ['ISO9001', 'IATF16949', 'IPC-6012'],
    minPanelOrderQty: 2,
    leadTimeWeeks: { proto: 1, production: 2 },
    bestFor: 'Cost-optimised EU assembly, AT&S/Technipol fab, automotive interior electronics',
    dataYear: 2026, ratesAsOf: '2026-09-29',
  },

  de: {
    id: 'de', name: 'Germany (München / Stuttgart / Hamburg)', shortName: 'Germany', flag: '🇩🇪',
    region: 'europe_premium', currency: 'EUR', fxToGBP: 1.1653,
    pcbFab: {
      baseCostPerDm2_2L: 1.238,
      layerAdderPerDm2: 0.7924,
      setupCostGBP: 163.4,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.05, enig: 1.20, osp: 0.96, enepig: 1.55, iteq: 1.08 },
      viaAdderPer100Through: 0.7924,
      viaAdderPer10Blind: 1.238,
      viaAdderPer10Micro: 1.981,
      hdiUpliftPct: 30,
      impedanceUpliftPct: 18,
      minTraceSpaceMm: 0.075,
      panelAreaDm2: 4.5,
    },
    assembly: {
      smtLineRatePerHr: 71.31,
      labourRatePerHr: 44.84,
      thRatePerJoint: 0.06438,
      manualSolderPerJoint: 0.1139,
      aoiPerBoard: 1.783,
      xrayPerBoard: 5.448,
      ictPerBoard: 11.89,
      conformalCoatPerCm2: 0.00941,
      batchSetupGBP: 118.9,
      dppm: 80,
    },
    logistics: {
      importDutyFraction: 0.0,
      airFreightPerKgGBP: 0.75,
      minAirFreightGBP: 8,
      seaFreightPerKgGBP: 0.0,
      airTransitDays: 1,
      supplyChainRisk: 0.97,
    },
    components: { availabilityIndex: 0.90, hasSpotMarketAccess: false },
    qualityIndex: 0.97,
    certifications: ['ISO9001', 'IATF16949', 'AS9100', 'IPC-6012 Class 3', 'AEC-Q100', 'ECSS'],
    minPanelOrderQty: 1,
    leadTimeWeeks: { proto: 0.5, production: 2 },
    bestFor: 'Automotive OEM, aerospace ECSS, highest quality, shortest EU prototype lead time',
    dataYear: 2026, ratesAsOf: '2026-09-29',
  },

  gb: {
    id: 'gb', name: 'United Kingdom (Birmingham / Coventry / Edinburgh)', shortName: 'UK', flag: '🇬🇧',
    region: 'domestic', currency: 'GBP', fxToGBP: 1,
    pcbFab: {
      baseCostPerDm2_2L: 1.6,
      layerAdderPerDm2: 0.95,
      setupCostGBP: 110,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.05, enig: 1.22, osp: 0.97, enepig: 1.58, iteq: 1.10 },
      viaAdderPer100Through: 0.9,
      viaAdderPer10Blind: 1.4,
      viaAdderPer10Micro: 2.2,
      hdiUpliftPct: 32,
      impedanceUpliftPct: 20,
      minTraceSpaceMm: 0.075,
      panelAreaDm2: 4.2,
    },
    assembly: {
      smtLineRatePerHr: 88,
      labourRatePerHr: 29.59,
      thRatePerJoint: 0.07,
      manualSolderPerJoint: 0.125,
      aoiPerBoard: 2,
      xrayPerBoard: 6,
      ictPerBoard: 14,
      conformalCoatPerCm2: 0.0105,
      batchSetupGBP: 140,
      dppm: 95,
    },
    logistics: {
      importDutyFraction: 0.0,
      airFreightPerKgGBP: 0.0,
      minAirFreightGBP: 0,
      seaFreightPerKgGBP: 0.0,
      airTransitDays: 0,
      supplyChainRisk: 1.0,
    },
    components: { availabilityIndex: 0.85, hasSpotMarketAccess: false },
    qualityIndex: 0.96,
    certifications: ['ISO9001', 'IATF16949', 'AS9100', 'IPC-6012 Class 3', 'UKCA', 'Def Stan'],
    minPanelOrderQty: 1,
    leadTimeWeeks: { proto: 0.3, production: 1.5 },
    bestFor: 'Domestic prototyping, defence/Def Stan, fastest turnaround, zero import risk',
    dataYear: 2026, ratesAsOf: '2026-09-29',
  },

  us: {
    id: 'us', name: 'USA (San Jose / Austin / Milpitas)', shortName: 'USA', flag: '🇺🇸',
    region: 'americas', currency: 'USD', fxToGBP: 1.3238,
    pcbFab: {
      baseCostPerDm2_2L: 1.167,
      layerAdderPerDm2: 0.7306,
      setupCostGBP: 131.9,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.05, enig: 1.22, osp: 0.96, enepig: 1.58, iteq: 1.10 },
      viaAdderPer100Through: 0.761,
      viaAdderPer10Blind: 1.218,
      viaAdderPer10Micro: 1.979,
      hdiUpliftPct: 30,
      impedanceUpliftPct: 18,
      minTraceSpaceMm: 0.075,
      panelAreaDm2: 4.6,
    },
    assembly: {
      smtLineRatePerHr: 79.15,
      labourRatePerHr: 35.3,
      thRatePerJoint: 0.069,
      manualSolderPerJoint: 0.1218,
      aoiPerBoard: 1.928,
      xrayPerBoard: 5.885,
      ictPerBoard: 13.19,
      conformalCoatPerCm2: 0.01015,
      batchSetupGBP: 137,
      dppm: 100,
    },
    logistics: {
      importDutyFraction: 0.037,
      airFreightPerKgGBP: 3.20,
      minAirFreightGBP: 28,
      seaFreightPerKgGBP: 0.55,
      airTransitDays: 2,
      supplyChainRisk: 0.95,
    },
    components: { availabilityIndex: 0.88, hasSpotMarketAccess: false },
    qualityIndex: 0.96,
    certifications: ['ISO9001', 'AS9100', 'ITAR', 'MIL-PRF-55110', 'IPC-6012 Class 3', 'IPC-A-610'],
    minPanelOrderQty: 1,
    leadTimeWeeks: { proto: 0.5, production: 2 },
    bestFor: 'ITAR-controlled, defence/aerospace, DoD programmes, reshoring mandates',
    dataYear: 2026, ratesAsOf: '2026-09-29',
  },

  jp: {
    id: 'jp', name: 'Japan (Nagano / Yokohama / Osaka)', shortName: 'Japan', flag: '🇯🇵',
    region: 'asia_premium', currency: 'JPY', fxToGBP: 208.47,
    pcbFab: {
      baseCostPerDm2_2L: 2.653,
      layerAdderPerDm2: 1.582,
      setupCostGBP: 224.5,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.04, enig: 1.18, osp: 0.94, enepig: 1.52, iteq: 1.08 },
      viaAdderPer100Through: 1.224,
      viaAdderPer10Blind: 1.939,
      viaAdderPer10Micro: 3.061,
      hdiUpliftPct: 22,
      impedanceUpliftPct: 14,
      minTraceSpaceMm: 0.035,
      panelAreaDm2: 5.4,
    },
    assembly: {
      smtLineRatePerHr: 89.79,
      labourRatePerHr: 23.47,
      thRatePerJoint: 0.08163,
      manualSolderPerJoint: 0.1428,
      aoiPerBoard: 2.245,
      xrayPerBoard: 6.632,
      ictPerBoard: 15.31,
      conformalCoatPerCm2: 0.01173,
      batchSetupGBP: 163.3,
      dppm: 40,
    },
    logistics: {
      importDutyFraction: 0.0,
      airFreightPerKgGBP: 4.50,
      minAirFreightGBP: 40,
      seaFreightPerKgGBP: 0.58,
      airTransitDays: 4,
      supplyChainRisk: 0.96,
    },
    components: { availabilityIndex: 0.94, hasSpotMarketAccess: false },
    qualityIndex: 0.99,
    certifications: ['ISO9001', 'IATF16949', 'AS9100', 'JPCA', 'IPC-6012 Class 3'],
    minPanelOrderQty: 1,
    leadTimeWeeks: { proto: 1, production: 3 },
    bestFor: 'Ultra-fine pitch (<35µm), any-layer HDI IC substrate, highest reliability (Ibiden, Nippon Mektron)',
    dataYear: 2026, ratesAsOf: '2026-09-29',
  },
};

// ─── Trend / NRE / Risk augmentation (Features 5, 6, 7) ────────────────────
// Applied after the base database so the country blocks above stay readable.
const TREND_DATA: Record<string, NonNullable<PCBCountryRate['priceTrend']>> = {
  cn: { direction: 'rising',  pctChange6m: 4,  note: 'Copper CCL price increase and CNY appreciation pushing fab cost up' },
  vn: { direction: 'stable',  pctChange6m: 1,  note: 'Strong EMS investment offsetting wage growth' },
  in: { direction: 'rising',  pctChange6m: 3,  note: 'PLI-driven capacity ramp but rising skilled-labour wages' },
  th: { direction: 'stable',  pctChange6m: 1,  note: 'Mature automotive EMS cluster keeps pricing flat' },
  my: { direction: 'rising',  pctChange6m: 3,  note: 'Semiconductor demand and MYR firming lift assembly rates' },
  tw: { direction: 'rising',  pctChange6m: 3,  note: 'High demand for HDI/substrate capacity constrains supply' },
  kr: { direction: 'stable',  pctChange6m: 2,  note: 'Premium HDI stable; KRW softness offsetting wage rises' },
  mx: { direction: 'rising',  pctChange6m: 5,  note: 'Nearshoring surge tightening EMS capacity and labour' },
  cz: { direction: 'stable',  pctChange6m: 1,  note: 'EU automotive demand steady; energy costs normalising' },
  pl: { direction: 'falling', pctChange6m: -2, note: 'EU investment and improved yields lowering effective cost' },
  de: { direction: 'rising',  pctChange6m: 6,  note: 'Energy costs and IG-Metall wage agreements raising rates' },
  gb: { direction: 'stable',  pctChange6m: 2,  note: 'Domestic capacity stable; modest inflation pass-through' },
  us: { direction: 'rising',  pctChange6m: 5,  note: 'Reshoring incentives raising demand faster than capacity' },
  jp: { direction: 'stable',  pctChange6m: 1,  note: 'Weak JPY offsetting premium fab cost inflation' },
};

const NRE_DATA: Record<string, AutomotiveNRECosts> = {
  cn: mkNRE(3689, 2951, 4427, 1897, 2635),
  vn: mkNRE(3911, 3088, 4632, 1956, 2882),
  in: mkNRE(3431, 2764, 4099, 1763, 2573),
  th: mkNRE(3990, 3230, 4750, 1995, 2850),
  my: mkNRE(4427, 3522, 5232, 2214, 3119),
  tw: mkNRE(5026, 4021, 6032, 2513, 3317),
  kr: mkNRE(5709, 4611, 6807, 2855, 3733),
  mx: mkNRE(4614, 3711, 5416, 2307, 3009),
  cz: mkNRE(5415, 4332, 6302, 2658, 3348),
  pl: mkNRE(4769, 3815, 5627, 2385, 3052),
  de: mkNRE(7429, 5943, 8419, 3467, 4457),
  gb: mkNRE(5500, 4500, 6500, 2800, 3500),
  us: mkNRE(7103, 5682, 8118, 3349, 4363),
  jp: mkNRE(7959, 6428, 8979, 3673, 4694),
};

// Energy: industrial electricity tariffs £/kWh (IEA/Eurostat/EIA 2025-26,
// each the country's own published tariff). Packaging: ESD bag/tray/carton +
// pack labour per board, country labour-dependent.
const ENERGY_PACKAGING: Record<string, { kwh: number; pack: number }> = {
  cn: { kwh: 0.079, pack: 0.063 },
  vn: { kwh: 0.064, pack: 0.051 },
  in: { kwh: 0.078, pack: 0.057 },
  th: { kwh: 0.095, pack: 0.076 },
  my: { kwh: 0.089, pack: 0.08 },
  tw: { kwh: 0.086, pack: 0.121 },
  kr: { kwh: 0.103, pack: 0.154 },
  mx: { kwh: 0.105, pack: 0.1 },
  cz: { kwh: 0.172, pack: 0.148 },
  pl: { kwh: 0.148, pack: 0.134 },
  de: { kwh: 0.258, pack: 0.277 },
  gb: { kwh: 0.182, pack: 0.3 },
  us: { kwh: 0.096, pack: 0.284 },
  jp: { kwh: 0.163, pack: 0.306 },
};

// Risk dimensions: each 0..1, 1 = lowest risk / most reliable
const RISK_DATA: Record<string, NonNullable<PCBCountryRate['riskDimensions']>> = {
  cn: { geopolitical: 0.55, logisticsReliability: 0.80, qualityConsistency: 0.78, leadTimeVariance: 0.80 },
  vn: { geopolitical: 0.72, logisticsReliability: 0.76, qualityConsistency: 0.75, leadTimeVariance: 0.74 },
  in: { geopolitical: 0.70, logisticsReliability: 0.70, qualityConsistency: 0.72, leadTimeVariance: 0.68 },
  th: { geopolitical: 0.74, logisticsReliability: 0.82, qualityConsistency: 0.84, leadTimeVariance: 0.80 },
  my: { geopolitical: 0.80, logisticsReliability: 0.84, qualityConsistency: 0.85, leadTimeVariance: 0.82 },
  tw: { geopolitical: 0.48, logisticsReliability: 0.88, qualityConsistency: 0.93, leadTimeVariance: 0.86 },
  kr: { geopolitical: 0.68, logisticsReliability: 0.90, qualityConsistency: 0.93, leadTimeVariance: 0.88 },
  mx: { geopolitical: 0.74, logisticsReliability: 0.78, qualityConsistency: 0.82, leadTimeVariance: 0.76 },
  cz: { geopolitical: 0.92, logisticsReliability: 0.91, qualityConsistency: 0.90, leadTimeVariance: 0.90 },
  pl: { geopolitical: 0.90, logisticsReliability: 0.90, qualityConsistency: 0.89, leadTimeVariance: 0.89 },
  de: { geopolitical: 0.96, logisticsReliability: 0.97, qualityConsistency: 0.97, leadTimeVariance: 0.96 },
  gb: { geopolitical: 0.95, logisticsReliability: 0.97, qualityConsistency: 0.96, leadTimeVariance: 0.97 },
  us: { geopolitical: 0.90, logisticsReliability: 0.93, qualityConsistency: 0.95, leadTimeVariance: 0.92 },
  jp: { geopolitical: 0.88, logisticsReliability: 0.95, qualityConsistency: 0.99, leadTimeVariance: 0.95 },
};

for (const id of Object.keys(PCB_COUNTRY_RATES)) {
  const rate = PCB_COUNTRY_RATES[id];
  if (TREND_DATA[id]) rate.priceTrend = TREND_DATA[id];
  if (NRE_DATA[id]) rate.automotiveNRE = NRE_DATA[id];
  if (RISK_DATA[id]) rate.riskDimensions = RISK_DATA[id];
  if (ENERGY_PACKAGING[id]) {
    rate.energyCostPerKWh = ENERGY_PACKAGING[id].kwh;
    rate.packagingCostPerBoard = ENERGY_PACKAGING[id].pack;
  }
  // ONE country table (country-rates review, Oct 2026). This table's EMS PRICES
  // (fab £/dm², placement, joint and test prices) are its own market data, but
  // the country's electricity tariff, exchange rate and operator labour rate are
  // the same facts the rest of the tool costs on — they come from REGIONAL_DATA.
  // They used to be typed separately and disagreed: UK electronics labour £29.59
  // here against £17.63 there, Taiwan power £0.086 against £0.161.
  const rd = REGIONAL_DATA[(id === 'gb' ? 'UK' : id.toUpperCase()) as ManufacturingRegion];
  if (rd) {
    rate.energyCostPerKWh = rd.energy.electricityPerKwh;
    rate.fxToGBP = rd.fxToGBP;
    rate.assembly.labourRatePerHr = rd.labour.electronics;
  }
}

// ── Admin overrides (Rate-Library-editable country data) ────────────────────
// Pristine snapshot taken AFTER augmentation; applyPCBCountryRateOverrides
// resets to this then deep-merges numeric overrides, so overrides are always
// relative to the shipped baseline (never compounding).
const PRISTINE_RATES: Record<string, PCBCountryRate> = JSON.parse(JSON.stringify(PCB_COUNTRY_RATES));
let _activeOverrides: Record<string, unknown> = {};

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function mergeNumericLeaves(
  target: Record<string, unknown>,
  pristine: Record<string, unknown>,
  patch: Record<string, unknown>,
  path: string,
  applied: string[],
  rejected: string[],
): void {
  for (const key of Object.keys(patch)) {
    const p = path ? `${path}.${key}` : key;
    if (FORBIDDEN_KEYS.has(key) || !Object.prototype.hasOwnProperty.call(pristine, key)) {
      rejected.push(p); continue;
    }
    const pv = (pristine as Record<string, unknown>)[key];
    const nv = (patch as Record<string, unknown>)[key];
    if (typeof pv === 'number') {
      const n = Number(nv);
      if (Number.isFinite(n) && n >= 0) { (target as Record<string, unknown>)[key] = n; applied.push(p); }
      else rejected.push(p);
    } else if (pv !== null && typeof pv === 'object' && !Array.isArray(pv) && nv !== null && typeof nv === 'object') {
      mergeNumericLeaves(
        (target as Record<string, Record<string, unknown>>)[key],
        pv as Record<string, unknown>,
        nv as Record<string, unknown>,
        p, applied, rejected,
      );
    } else {
      rejected.push(p); // strings/arrays/structure are not override-able
    }
  }
}

export interface PCBOverrideResult { appliedPaths: string[]; rejectedPaths: string[] }

/** Reset to the shipped baseline, then apply numeric-leaf overrides per country. */
export function applyPCBCountryRateOverrides(overrides: Record<string, unknown>): PCBOverrideResult {
  // reset in place so existing imports keep working
  for (const id of Object.keys(PCB_COUNTRY_RATES)) {
    (PCB_COUNTRY_RATES as Record<string, unknown>)[id] = JSON.parse(JSON.stringify(PRISTINE_RATES[id]));
  }
  const applied: string[] = []; const rejected: string[] = [];
  for (const id of Object.keys(overrides ?? {})) {
    if (FORBIDDEN_KEYS.has(id) || !Object.prototype.hasOwnProperty.call(PRISTINE_RATES, id)) {
      rejected.push(id); continue;
    }
    const patch = (overrides as Record<string, unknown>)[id];
    if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) { rejected.push(id); continue; }
    mergeNumericLeaves(
      PCB_COUNTRY_RATES[id] as unknown as Record<string, unknown>,
      PRISTINE_RATES[id] as unknown as Record<string, unknown>,
      patch as Record<string, unknown>,
      id, applied, rejected,
    );
  }
  _activeOverrides = applied.length > 0 ? JSON.parse(JSON.stringify(overrides)) : {};
  return { appliedPaths: applied, rejectedPaths: rejected };
}

export function getActivePCBCountryOverrides(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(_activeOverrides));
}

// ─── Ordered list for UI display ──────────────────────────────────────────────

export const COUNTRY_DISPLAY_ORDER: string[] = [
  'cn', 'vn', 'in', 'th', 'my',   // Asia Low/Mid
  'tw', 'kr',                       // Asia Premium
  'mx',                              // Americas
  'cz', 'pl',                       // Europe Low
  'de', 'gb', 'us', 'jp',           // Premium
];

// ─── Cost calculation engine ──────────────────────────────────────────────────

export interface PCBCostInput {
  widthMm: number;
  heightMm: number;
  layers: number;
  surfaceFinish: string;
  throughVias: number;
  blindVias: number;
  microVias: number;
  hdiStructure: string;
  impedanceControlled: boolean;
  smtPlacements: number;
  throughHoleJoints: number;
  manualJoints: number;
  bgaCount: number;
  aoiRequired: boolean;
  ictTimeSec: number;
  conformalCoatAreaCm2: number;
  totalBOMCostGBP: number;
  orderQuantity: number;
  /** Copper per layer in oz (1 oz = 35 µm), top to bottom. Absent = 1 oz everywhere. */
  copperOzByLayer?: number[];
  /** Measured bare/assembled board weight, kg — replaces the area×layers estimate for freight. */
  weightKg?: number;
  /** Boards in one production lot (set-ups, per-lot sampling). Absent = one lot a year (the order quantity). */
  lotSize?: number;
  /** Programme life in years: one-off tooling, fixtures and programmes are spread over orderQuantity × years.
   *  Absent = 1 (the order alone, as before — EDU audit G-08, Nov 2026). */
  programmeYears?: number;
  /** Components the CUSTOMER buys and supplies (directed buy / consignment — EDU v6, Nov 2026), £ a board at their own
   *  price. They stay in the board's cost (the customer pays for them) but the EMS charges no material burden on them,
   *  and the EMS invoice is the board less them. Absent = 0 (the EMS buys every part, as before). */
  customerSuppliedGBP?: number;
  /** Operations beyond placement and inspection (EDU v6 — package B): second reflow side, second coated side, coating
   *  inspection / masking, press-fit, programming, functional + HV test (server/data/pcb-operations.ts). Absent = none. */
  operations?: OperationsInput;
  /** Delivery terms (EDU audit G-10, Nov 2026): 'DAP' = delivered to the UK, import duty paid (the default, as before);
   *  'EXW' = at the factory gate — no freight, no UK duty. */
  deliveryTerms?: 'DAP' | 'EXW';
  /** First-pass yield 0.5–0.999 (EDU audit G-11): the share of boards that pass first time. When given, the boards reworked
   *  are 1 − FPY instead of placements × the country's dppm (an unsourced table figure, capped at 30 %). */
  firstPassYield?: number;
  /** Fab specification options the engineer set (EDU audit G-17): thickness, laminate Tg / CTI, via fill, ENIG gold,
   *  impedance tolerance — priced only with a published adder (server/data/pcb-fab-options.ts), the rest listed. */
  fabOptions?: FabOptions;
}

/** Boards in a production lot, never more than the order. */
export function lotBoards(input: { orderQuantity: number; lotSize?: number }): number {
  const q = Math.max(1, input.orderQuantity || 1);
  const l = Number(input.lotSize);
  return l > 0 ? Math.min(q, Math.round(l)) : q;
}
/** Boards a one-off cost is spread over: the order × the programme years (≥ 1). */
export function programmeBoards(input: { orderQuantity: number; programmeYears?: number }): number {
  const y = Number(input.programmeYears);
  return Math.max(1, input.orderQuantity || 1) * (y >= 1 ? Math.min(30, y) : 1);
}

/**
 * Drilling a fab includes in its per-area price. PCBasic (Shenzhen) prices 4-layer-and-up boards on a base of
 * 100,000 holes per m² and charges only the holes above it; JLCPCB charges extra only above 150,000 holes per m²
 * (pages read 25 Nov 2026, scripts/edu-ctrl-2026-11-25/xcheck/bare-pcb.json). Through vias were charged per 100 on
 * top of the per-area price — counted twice (EDU audit G-05). The lower, PCBasic figure is used.
 */
export const VIA_HOLES_INCLUDED_PER_DM2 = 1000;

/**
 * Heavy-copper surcharge: Chinese fabricators add ~25 CNY/m² per layer for every
 * 0.5 oz above 1 oz (Queen EMS / AIVON 2026 copper-weight guides — 2 oz on all
 * layers lands at the quoted +20–40%). Converted at 29 Sep 2026 CNY 8.88/£ and
 * scaled to other countries by their 2-layer base rate relative to China's.
 */
export const HEAVY_CU_CNY_PER_M2_PER_HALF_OZ = 25;
export const CNY_PER_GBP_2026_09 = 8.88;

export interface PCBCountryCostBreakdown {
  countryId: string;
  countryName: string;
  flag: string;
  pcbFabPerBoard: number;
  assemblyPerBoard: number;
  logisticsPerBoard: number;
  bomCostPerBoard: number;
  totalPerBoard: number;
  /** What the EMS invoices: the board less the parts the customer supplies (EDU v6). Equals totalPerBoard when none. */
  emsInvoicePerBoard?: number;
  /** The delivery terms this breakdown is on (EDU audit G-10). */
  deliveryTerms?: 'DAP' | 'EXW';
  /** The board with the automotive programme NRE spread over annual × years (EDU v6), and that NRE a board. */
  fullEconomicPerBoard?: number;
  nrePerBoard?: number;
  leadTimeWeeks: number;
  qualityIndex: number;
  certifications: string[];
  bestFor: string;
  breakdown: {
    pcbBase: number;
    pcbLayers: number;
    pcbSurface: number;
    pcbVias: number;
    pcbHDI: number;
    pcbSetup: number;
    /** Controlled-impedance uplift (was in the total but missing from this table) */
    pcbImpedance: number;
    /** Heavy-copper surcharge (layers above 1 oz) */
    pcbCopper: number;
    /** Fab options the engineer set (G-17): thickness, laminate, via fill, ENIG gold — the sum of their basis lines. */
    pcbOptions?: number;
    /** Automotive grade folded into the headline (IATF, laminate, class 3, coupons) — automotive boards only */
    automotiveFab?: number;
    /** Automotive grade folded into the headline (IATF line, class 3, serialisation, burn-in) — automotive boards only */
    automotiveAssembly?: number;
    smtAssembly: number;
    thAssembly: number;
    aoi: number;
    /** EMS material burden on the components (inside bomCostPerBoard), and its rate */
    materialBurden?: number;
    materialBurdenPct?: number;
    /** Components the customer supplies (inside bomCostPerBoard, no burden on them) — EDU v6 */
    customerSupplied?: number;
    /** Operations beyond placement and inspection (inside assemblyPerBoard) — EDU v6, pcb-operations.ts */
    operations?: number;
    logistics: number;
    importDuty: number;
    /** Fab + assembly electricity at the country's actual tariff (audit fix) */
    energy: number;
    /** ESD packaging + pack labour per board (audit fix) */
    packaging: number;
    /** Cost of quality from country dppm: rework + scrap expectation (audit fix) */
    yieldLoss: number;
  };
  /** Panelisation result (Feature 3 / panel optimiser) */
  panelInfo: { boardsPerPanel: number; utilisation: number; panelW: number; panelH: number };
  /** Set when the automotive premiums are in this breakdown's totals. */
  automotiveGrade?: { asil: string; fabPremiumGBP: number; assemblyPremiumGBP: number };
  /**
   * The arithmetic behind every £ item, as done, with the class of each figure it uses (arith audit, Oct 2026): the
   * country table (29 Sep 2026 rates, no per-figure citation — header sources and docs/pcb/rate-cross-check-2026-10.md),
   * REGIONAL_DATA (the tool's one country source for labour / power), or a CostVision engineering figure (not sourced).
   * The screen and both reports should print these lines — see docs/review/arith-audit/pcb.md.
   */
  basis?: PCBBasisLine[];
  /** Fab options set but not priced here (G-17): included in the board price, or with no published price. */
  fabOptionNotes?: { included: string[]; notCosted: string[] };
}

/** One line of a PCB cost basis: what, the arithmetic done, the £ it gives, and where each figure in it comes from. */
export interface PCBBasisLine { item: string; formula: string; gbp: number; source: string }

/** Basis labels for the figures the PCB country cost uses. */
export const PCB_BASIS_SOURCE = {
  table: 'PCB country table, rates as of 29 Sep 2026 (no per-figure citation; cross-checked in docs/pcb/rate-cross-check-2026-10.md)',
  regional: 'REGIONAL_DATA (the tool\'s country labour / electricity figures)',
  engineering: 'CostVision engineering figure — not sourced',
  measured: 'the board figures as costed (measured, typed or estimated — see the board spec)',
} as const;

// ─── Panelisation optimiser (Feature 3) ────────────────────────────────────
// Standard panel sizes by region (mm)
// 18 × 24 in (457 × 610 mm) is the most common production panel (Epec, "Controlling PCB costs, part 2", read 25 Nov 2026).
// The list used to stop at 480 × 350 mm, so a 395 × 215 mm board could only run 1-up (EDU audit G-03).
const STANDARD_PANELS: Record<string, { w: number; h: number }[]> = {
  default: [{ w: 480, h: 350 }, { w: 380, h: 280 }, { w: 250, h: 330 }, { w: 457, h: 610 }],
};

export interface PanelFit {
  boardsPerPanel: number;
  utilisation: number;
  panelW: number;
  panelH: number;
}

/** Find the best panel fit: the highest utilisation (laminate is bought by the panel), then the most boards a panel.
 *  "Most boards first" would put every small board on the largest panel whatever its waste. */
export function bestPanelFit(boardW: number, boardH: number, panels = STANDARD_PANELS.default): PanelFit {
  let best: PanelFit = { boardsPerPanel: 1, utilisation: 0, panelW: panels[0].w, panelH: panels[0].h };
  for (const p of panels) {
    const marginW = 10, marginH = 10; // 10 mm panel border each side (CostVision engineering figure)
    const usableW = p.w - marginW * 2;
    const usableH = p.h - marginH * 2;
    const gapX = 3, gapY = 3; // routing gap between boards
    for (const [bw, bh] of [[boardW, boardH], [boardH, boardW]]) {
      if (bw <= 0 || bh <= 0) continue;
      const cols = Math.floor((usableW + gapX) / (bw + gapX));
      const rows = Math.floor((usableH + gapY) / (bh + gapY));
      const n = cols * rows;
      const util = (n * bw * bh) / (p.w * p.h);
      if (n >= 1 && (util > best.utilisation + 1e-9 || (Math.abs(util - best.utilisation) <= 1e-9 && n > best.boardsPerPanel))) {
        best = { boardsPerPanel: Math.max(1, n), utilisation: util, panelW: p.w, panelH: p.h };
      }
    }
  }
  return best;
}


/**
 * One spelling for every finish the model, the UI or a saved analysis may send.
 * Immersion silver was keyed 'iteq' in this table, "ITEQ / ImAg" in the UI, mapped
 * to HASL-LF by the fab form and priced at £1.60 (above ENIG) by pcb-fab.ts; it
 * now resolves to 'iteq' here (the table's ImAg column) wherever it comes from.
 * Unknown strings still fall back to ENIG, as before.
 */
export function normaliseFinish(raw: unknown): string {
  const k = String(raw ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  const ALIAS: Record<string, string> = {
    imag: 'iteq', immersion_silver: 'iteq', silver: 'iteq', iag: 'iteq', iteq: 'iteq',
    immersion_gold: 'enig', enig: 'enig', hasl: 'hasl', hasl_lf: 'hasl_lf', lead_free_hasl: 'hasl_lf',
    osp: 'osp', enepig: 'enepig', hard_gold: 'enepig',
  };
  return ALIAS[k] ?? k;
}

/** One bed-of-nails ICT fixture, GBP — an engineering figure (typical £3k–8k), spread over the order. */
export const ICT_FIXTURE_GBP = 5000;
/** In-line X-ray (AXI) time per board with BGA / CSP parts, seconds — an engineering figure. */
export const XRAY_SECONDS_PER_BOARD = 20;
/** X-ray programme per board design, GBP — an engineering figure, spread over the order. */
export const XRAY_SETUP_GBP = 300;
/** In-line AOI time per board (both sides), seconds, and the AOI programme per design — engineering figures. */
export const AOI_SECONDS_PER_BOARD = 20;
export const AOI_PROGRAM_GBP = 200;
/**
 * EMS material burden (procurement, inventory carrying, attrition and margin on the components it buys),
 * as a fraction of the component cost, by annual volume — an engineering figure, lower on larger programmes.
 */
export function materialBurdenFor(qty: number): number {
  // 10 % at 1k boards, 7 % at 10k, 5 % at 100k, log-linear between and flat outside — the same three figures, without
  // the steps (7 % → 5 % at exactly 100,000 boards was a cliff in the headline, pipeline review F7).
  const q = Math.max(1, qty || 1);
  if (q <= 1_000) return 0.10;
  if (q >= 100_000) return 0.05;
  const t = Math.log10(q);
  const pct = t <= 4 ? 0.10 - 0.03 * (t - 3) : 0.07 - 0.02 * (t - 4);
  return Math.round(pct * 100000) / 100000;
}

export function computePCBCountryCost(input: PCBCostInput, countryId: string): PCBCountryCostBreakdown {
  const rate = PCB_COUNTRY_RATES[countryId];
  if (!rate) throw new Error(`Unknown country: ${countryId}`);

  const r = rate.pcbFab;
  const a = rate.assembly;
  const l = rate.logistics;

  const boardAreaDm2 = (input.widthMm * input.heightMm) / 10000;
  const extraLayers = Math.max(0, input.layers - 2);

  // Panelisation — determines material-waste fraction (Feature 3)
  const panel = bestPanelFit(input.widthMm, input.heightMm);
  // Panel material is paid for in full; waste = (1 - utilisation) is amortised onto each good board.
  const wasteFactor = panel.utilisation > 0 ? 1 / Math.min(1, Math.max(0.4, panel.utilisation)) : 1;

  // PCB Fabrication (base + layer cost carry the panel waste factor)
  const pcbBase = boardAreaDm2 * r.baseCostPerDm2_2L * wasteFactor;
  const pcbLayers = boardAreaDm2 * r.layerAdderPerDm2 * extraLayers * wasteFactor;
  const finishKey = normaliseFinish(input.surfaceFinish) as keyof typeof r.surfaceFinishMultiplier;
  const finishMult = r.surfaceFinishMultiplier[finishKey] ?? r.surfaceFinishMultiplier.enig;
  const pcbSurface = (pcbBase + pcbLayers) * (finishMult - 1);
  const includedHoles = Math.round(VIA_HOLES_INCLUDED_PER_DM2 * boardAreaDm2);
  const chargedThrough = Math.max(0, input.throughVias - includedHoles);
  const pcbVias = (chargedThrough / 100) * r.viaAdderPer100Through
    + (input.blindVias / 10) * r.viaAdderPer10Blind
    + (input.microVias / 10) * r.viaAdderPer10Micro;
  const pcbHDI = (input.hdiStructure !== 'none')
    ? (pcbBase + pcbLayers) * r.hdiUpliftPct / 100 : 0;
  const pcbImpedance = input.impedanceControlled
    ? (pcbBase + pcbLayers) * r.impedanceUpliftPct / 100 : 0;
  // Amortise one-time Gerber/tooling setup across all boards in the order.
  // Panelisation: setup is per panel-design; total boards = panels × boardsPerPanel,
  // but cost is divided by the actual ordered board quantity for per-board figure.
  const progQ = programmeBoards(input), lotQ = lotBoards(input);
  const pcbSetup = r.setupCostGBP / progQ;
  // Heavy copper, per layer. Copper weight used to be read, shown and editable but
  // never costed — a 2 oz outer stack priced the same as 1 oz.
  const halfOzSteps = (input.copperOzByLayer ?? []).reduce((t, oz) => t + Math.max(0, (Number(oz) || 1) - 1) / 0.5, 0);
  const cnBase = PCB_COUNTRY_RATES.cn?.pcbFab.baseCostPerDm2_2L || r.baseCostPerDm2_2L;
  const pcbCopper = halfOzSteps * (HEAVY_CU_CNY_PER_M2_PER_HALF_OZ / CNY_PER_GBP_2026_09)
    * (boardAreaDm2 / 100) * wasteFactor * (r.baseCostPerDm2_2L / cnBase);
  // Fab options the engineer set (EDU audit G-17): % adders act on base + layers (with the panel waste); ¥/m² adders on the
  // board's area with the waste, at the country's price level against China's — as heavy copper.
  const fabOpts = fabOptionsCost(input.fabOptions, { coreGBP: pcbBase + pcbLayers, gbpPerCnyM2: (boardAreaDm2 / 100) * wasteFactor * (r.baseCostPerDm2_2L / cnBase) / CNY_PER_GBP_2026_09,
    layers: input.layers, finish: finishKey, basis: 'table' });
  const pcbOptions = fabOpts.total;
  const pcbFabPerBoard = pcbBase + pcbLayers + pcbSurface + pcbVias + pcbHDI + pcbImpedance + pcbSetup + pcbCopper + pcbOptions;

  // SMT Assembly — rate model: cost/placement = smtLineRatePerHr / 3600 CPH reference
  // Simplified: cost = placements × (rate / placements-per-hr)
  const smtAssembly = (input.smtPlacements / 3600) * a.smtLineRatePerHr +
    (input.smtPlacements > 0 ? a.batchSetupGBP / lotQ : 0);
  // Through-hole joints by the chosen method (EDU audit G-07): selective drag or hand, else the country table's rate.
  const thtM = thtMethodCost(input.operations?.thtMethod, input.throughHoleJoints, a.labourRatePerHr, progQ);
  const thAssembly = thtM ? thtM.gbp : input.throughHoleJoints * a.thRatePerJoint;
  const manualAssembly = input.manualJoints * a.manualSolderPerJoint;
  // AOI on the same basis as ICT / X-ray (Oct 2026): in-line inspection time at volume, the table's
  // small-batch price as the ceiling (a 250k camera board paid the flat £0.37).
  const aoiCost = input.aoiRequired ? Math.min(a.aoiPerBoard, (AOI_SECONDS_PER_BOARD / 3600) * 2 * a.labourRatePerHr + AOI_PROGRAM_GBP / progQ) : 0;
  // X-ray of BGA / CSP joints, same basis as ICT: station time (XRAY_SECONDS_PER_BOARD at 2 × the labour
  // rate) at volume, the table's small-batch cabinet price as the ceiling (Oct 2026: a 250k camera board
  // with one CSP imager was charged £1.27 a board).
  const xrayCost = input.bgaCount > 0 ? Math.min(a.xrayPerBoard, (XRAY_SECONDS_PER_BOARD / 3600) * 2 * a.labourRatePerHr + XRAY_SETUP_GBP / progQ) : 0;
  // ICT at volume (Oct 2026): the table's ictPerBoard is a small-batch price (it carries the bed-of-nails
  // fixture). At volume a board costs its TEST TIME on the station plus the fixture spread over the
  // order: station = operator + tester ≈ 2 × the country's assembly labour rate; fixture
  // ICT_FIXTURE_GBP (an engineering figure, stated). The table price stays the ceiling for small runs.
  // A 250k camera board was charged the flat £2.64 — 15× its £0.17 build-up.
  const ictBuildUp = (input.ictTimeSec / 3600) * 2 * a.labourRatePerHr + ICT_FIXTURE_GBP / progQ;
  const ictCost = input.ictTimeSec > 0 ? Math.min(a.ictPerBoard, ictBuildUp) : 0;
  const confCost = input.conformalCoatAreaCm2 * a.conformalCoatPerCm2;
  // EDU v6 (package B): the operations the costing left out — each line with its arithmetic and sources.
  const opsLines = input.operations ? operationsCost(input.operations, a.labourRatePerHr, progQ, lotQ, a.batchSetupGBP, confCost) : [];
  const opsCost = opsLines.reduce((t, l) => t + l.gbp, 0);
  const assemblyPerBoard = smtAssembly + thAssembly + manualAssembly + aoiCost + xrayCost + ictCost + confCost + opsCost;

  // Components are bought on one global market (no country index since F13). The EMS buys the components and charges for doing so: procurement, inventory carrying, scrap and a
  // margin on material (cost-plus EMS practice — Venture Outsource, EMSNow; the rate falls on larger
  // programmes). It was missing: components passed through at cost, so every board sat below a real
  // quote. MATERIAL_BURDEN is an engineering figure by volume, stated in the breakdown.
  const materialBurdenPct = materialBurdenFor(input.orderQuantity);
  const bomAtCost = input.totalBOMCostGBP;   // components are bought on one global market (no country index, F13)
  // Parts the customer buys and supplies carry no EMS burden (the EMS neither buys nor finances them — EDU v6).
  const customerSupplied = Math.min(bomAtCost, Math.max(0, Number(input.customerSuppliedGBP) || 0));
  const materialBurden = (bomAtCost - customerSupplied) * materialBurdenPct;
  const bomSourced = bomAtCost + materialBurden;

  // Logistics. Sea freight applies at volume (>= 2500 boards/order) where a
  // sea rate exists (audit fix: seaFreightPerKgGBP was defined but never used,
  // so bulk orders were costed at air rates).
  // A measured weight wins (a 0.43 dm² 8-layer board is ~26 g; the old estimate
  // below gave ~96 g).
  const estWeightKg = input.weightKg && input.weightKg > 0 ? input.weightKg : Math.max(0.02, boardAreaDm2 * input.layers * 0.028);
  const useSea = input.orderQuantity >= 2500 && l.seaFreightPerKgGBP > 0;
  const freightRate = useSea ? l.seaFreightPerKgGBP : l.airFreightPerKgGBP;
  const exw = input.deliveryTerms === 'EXW';
  const freight = exw ? 0 : Math.max(l.minAirFreightGBP / Math.max(input.orderQuantity, 1),
    estWeightKg * freightRate);
  // Duty base includes the BOM (audit fix): customs value of a populated
  // assembly = components + fab + assembly, not fab + assembly alone. The UK customs value is CIF — the goods AND the
  // freight to the UK border (arith audit, Oct 2026; 360 review open item: "the base leaves out freight").
  const dutiableValue = pcbFabPerBoard + assemblyPerBoard + bomSourced + freight;
  const importDuty = exw ? 0 : dutiableValue * l.importDutyFraction;
  const logisticsPerBoard = freight + importDuty;

  // Energy (audit fix): explicit element at the country's ACTUAL industrial
  // tariff. Engineering-typical consumption: fab (lamination/drill/plate/etch)
  // ~0.9 kWh/dm² for 2L + 0.15 kWh/dm² per extra layer; assembly ~0.06 kWh
  // per board (reflow/oven share) + 0.0008 kWh per placement.
  const fabKWh = boardAreaDm2 * (0.9 + 0.15 * extraLayers);
  const asmKWh = 0.06 + 0.0008 * input.smtPlacements;
  const energyCost = (fabKWh + asmKWh) * (rate.energyCostPerKWh ?? 0.15);

  // Packaging (audit fix): country-specific ESD bag/tray/carton + pack labour.
  const packagingCost = rate.packagingCostPerBoard ?? 0.12;

  // Yield / cost of quality (audit fix): country dppm (defects per million
  // placements) was stored but never applied. Expected defects per board
  // λ = placements × dppm/1e6 (capped 0.30); 95% of defects are AOI/ICT-caught
  // touch-ups (rework ≈ 20% of assembly + half an ICT retest), 5% true scrap
  // losing fab + assembly + components.
  const fpy = Number(input.firstPassYield);
  const fpyGiven = fpy >= 0.5 && fpy <= 0.999;
  const lambda = fpyGiven ? 1 - fpy : Math.min(0.30, input.smtPlacements * a.dppm / 1_000_000);
  const reworkCost = 0.2 * assemblyPerBoard + 0.5 * ictCost;
  const scrapCost = pcbFabPerBoard + assemblyPerBoard + bomSourced;
  const yieldLossCost = lambda * (0.95 * reworkCost + 0.05 * scrapCost);

  const totalPerBoard = pcbFabPerBoard + assemblyPerBoard + logisticsPerBoard + bomSourced
    + energyCost + packagingCost + yieldLossCost;

  // ── The basis, as done (arith audit, Oct 2026): every £ item with its arithmetic and the class of its figures.
  const f = (v: number, dp = 4) => `£${(Math.round(v * 10 ** dp) / 10 ** dp).toFixed(dp)}`;
  const q = Math.max(input.orderQuantity, 1);
  const T = PCB_BASIS_SOURCE;
  const ictTime = (input.ictTimeSec / 3600) * 2 * a.labourRatePerHr;
  const basis: PCBBasisLine[] = [
    { item: 'Board area and panel', gbp: 0, source: `${T.measured}; panel sizes 480×350 / 380×280 / 250×330 mm (${T.engineering}) and 457×610 mm (18 × 24 in, Epec); 10 mm border, 3 mm gap; the highest utilisation wins`,
      formula: `${input.widthMm} × ${input.heightMm} mm = ${boardAreaDm2.toFixed(4)} dm²; ${panel.boardsPerPanel}-up on ${panel.panelW}×${panel.panelH} mm, utilisation ${(panel.utilisation * 100).toFixed(1)} % → waste factor 1 ÷ max(0.4, ${panel.utilisation.toFixed(3)}) = ${wasteFactor.toFixed(4)}` },
    { item: 'Bare board — 2-layer base', gbp: pcbBase, source: T.table, formula: `${boardAreaDm2.toFixed(4)} dm² × ${f(r.baseCostPerDm2_2L)}/dm² × waste ${wasteFactor.toFixed(4)} = ${f(pcbBase)}` },
    { item: 'Bare board — layers above 2', gbp: pcbLayers, source: T.table, formula: `${boardAreaDm2.toFixed(4)} dm² × ${f(r.layerAdderPerDm2, 5)}/dm²/layer × ${extraLayers} × waste ${wasteFactor.toFixed(4)} = ${f(pcbLayers)}` },
    { item: `Bare board — finish (${finishKey})`, gbp: pcbSurface, source: T.table, formula: `(base + layers) × (${finishMult} − 1) = ${f(pcbSurface)}` },
    { item: 'Bare board — vias', gbp: pcbVias, source: `${T.table}; drilling up to ${VIA_HOLES_INCLUDED_PER_DM2.toLocaleString('en-GB')} holes a dm² is in the per-area price (PCBasic: 100,000 holes/m²)`, formula: `max(0, ${input.throughVias} − ${includedHoles} included)/100 × ${f(r.viaAdderPer100Through)} + ${input.blindVias}/10 × ${f(r.viaAdderPer10Blind)} + ${input.microVias}/10 × ${f(r.viaAdderPer10Micro)} = ${f(pcbVias)}` },
    ...(pcbHDI > 0 ? [{ item: 'Bare board — HDI uplift', gbp: pcbHDI, source: T.table, formula: `(base + layers) × ${r.hdiUpliftPct} % = ${f(pcbHDI)}` }] : []),
    ...(pcbImpedance > 0 ? [{ item: 'Bare board — controlled impedance', gbp: pcbImpedance, source: T.table, formula: `(base + layers) × ${r.impedanceUpliftPct} % = ${f(pcbImpedance)}` }] : []),
    { item: 'Bare board — tooling set-up', gbp: pcbSetup, source: `${T.table}; one-off, spread over the programme (order × years)`, formula: `${f(r.setupCostGBP, 2)} ÷ ${progQ.toLocaleString('en-GB')} boards = ${f(pcbSetup)}` },
    ...(pcbCopper > 0 ? [{ item: 'Bare board — heavy copper', gbp: pcbCopper, source: 'Queen EMS / AIVON 2026 copper-weight guides (25 CNY/m² per layer per ½ oz), CNY 8.88/£, scaled by the country\'s 2-layer base v China\'s',
      formula: `${halfOzSteps} half-oz steps × 25/8.88 £/m² × ${(boardAreaDm2 / 100).toFixed(6)} m² × waste ${wasteFactor.toFixed(4)} × ${(r.baseCostPerDm2_2L / cnBase).toFixed(4)} = ${f(pcbCopper)}` }] : []),
    ...fabOpts.lines,
    { item: 'SMT placement', gbp: smtAssembly, source: `line rate: ${T.table}; 3,600 placements an hour (one a second) per line-hour and one set-up a lot: ${T.engineering}`,
      formula: `${input.smtPlacements} placements ÷ 3,600 /h × ${f(a.smtLineRatePerHr, 2)}/h + ${f(a.batchSetupGBP, 2)} ÷ ${lotQ.toLocaleString('en-GB')} boards a lot = ${f(smtAssembly)}` },
    ...(thtM ? [thtM, ...(manualAssembly > 0 ? [{ item: 'Hand-soldered joints', gbp: manualAssembly, source: T.table, formula: `${input.manualJoints} × ${f(a.manualSolderPerJoint, 5)} = ${f(manualAssembly)}` }] : [])]
      : thAssembly + manualAssembly > 0 ? [{ item: 'Through-hole and hand-soldered joints', gbp: thAssembly + manualAssembly, source: T.table, formula: `${input.throughHoleJoints} × ${f(a.thRatePerJoint, 6)} + ${input.manualJoints} × ${f(a.manualSolderPerJoint, 5)} = ${f(thAssembly + manualAssembly)}` }] : []),
    ...(aoiCost > 0 ? [{ item: 'AOI', gbp: aoiCost, source: `ceiling: ${T.table}; ${AOI_SECONDS_PER_BOARD} s a board, station = 2 × labour (operator + tester), £${AOI_PROGRAM_GBP} programme: ${T.engineering}; labour: ${T.regional}`,
      formula: `min(table ${f(a.aoiPerBoard)}, ${AOI_SECONDS_PER_BOARD}/3600 h × 2 × ${f(a.labourRatePerHr, 2)}/h + £${AOI_PROGRAM_GBP} ÷ ${progQ.toLocaleString('en-GB')}) = ${f(aoiCost)}` }] : []),
    ...(xrayCost > 0 ? [{ item: 'X-ray (BGA / CSP)', gbp: xrayCost, source: `ceiling: ${T.table}; ${XRAY_SECONDS_PER_BOARD} s a board, station = 2 × labour, £${XRAY_SETUP_GBP} programme: ${T.engineering}; labour: ${T.regional}`,
      formula: `min(table ${f(a.xrayPerBoard)}, ${XRAY_SECONDS_PER_BOARD}/3600 h × 2 × ${f(a.labourRatePerHr, 2)}/h + £${XRAY_SETUP_GBP} ÷ ${progQ.toLocaleString('en-GB')}) = ${f(xrayCost)}` }] : []),
    ...(ictCost > 0 ? [{ item: 'In-circuit test', gbp: ictCost, source: `ceiling: ${T.table}; station = 2 × labour, £${ICT_FIXTURE_GBP} fixture: ${T.engineering}; test time: the board spec (estimated unless typed); labour: ${T.regional}`,
      formula: `min(table ${f(a.ictPerBoard)}, ${input.ictTimeSec}/3600 h × 2 × ${f(a.labourRatePerHr, 2)}/h + £${ICT_FIXTURE_GBP} ÷ ${progQ.toLocaleString('en-GB')} = ${f(ictTime + ICT_FIXTURE_GBP / progQ)}) = ${f(ictCost)}` }] : []),
    ...(confCost > 0 ? [{ item: 'Conformal coating', gbp: confCost, source: T.table, formula: `${input.conformalCoatAreaCm2.toFixed(1)} cm² × ${f(a.conformalCoatPerCm2, 6)}/cm² = ${f(confCost)}` }] : []),
    ...opsLines.map(l => ({ item: l.item, gbp: l.gbp, source: `${l.source}; labour: ${T.regional}`, formula: l.formula })),
    // The FX behind catalogue prices is printed (EDU audit G-19): a US$ listing is £ at the catalogue's snapshot, not today's rate.
    { item: 'Components', gbp: bomAtCost, source: `the BOM lines, each priced at its own parts-bought quantity (see each line's price note); catalogue prices in £ at the catalogue's FX snapshot of 29 Sep 2026 (US$1 = £${FX_TO_GBP_TABLE.USD}, €1 = £${FX_TO_GBP_TABLE.EUR}, ¥1 = £${FX_TO_GBP_TABLE.CNY}) — not a contract rate`, formula: `Σ qty × unit price = ${f(bomAtCost)}` },
    { item: 'EMS material burden', gbp: materialBurden, source: `${T.engineering} (cost-plus EMS practice; 10 % ≤ 1k, 7 % at 10k, 5 % ≥ 100k boards, log-linear between)${customerSupplied > 0 ? '; none on the parts the customer supplies' : ''}`,
      formula: customerSupplied > 0
        ? `(${f(bomAtCost)} − customer-supplied ${f(customerSupplied)}) × ${(materialBurdenPct * 100).toFixed(3)} % = ${f(materialBurden)}`
        : `${f(bomAtCost)} × ${(materialBurdenPct * 100).toFixed(3)} % = ${f(materialBurden)}` },

    ...(exw ? [{ item: 'Freight and UK duty', gbp: 0, source: 'ex-works (EXW): the buyer collects at the factory gate — no freight, no UK import duty in this figure', formula: 'EXW = £0.0000' }] : []),
    ...(exw ? [] : [{ item: `Freight (${useSea ? 'sea' : 'air'})`, gbp: freight, source: `freight rates: ${T.table}; ${input.weightKg && input.weightKg > 0 ? 'weight measured' : `weight estimated as area × layers × 28 g/dm² (at least 20 g) — ${T.engineering}; it over-states a bare board, which is about 30 g/dm² at 1.6 mm whatever the layer count`}; sea at ≥ 2,500 boards: ${T.engineering}`,
      formula: `max(${f(l.minAirFreightGBP, 2)} minimum ÷ ${q.toLocaleString('en-GB')}, ${estWeightKg.toFixed(4)} kg × ${f(freightRate, 2)}/kg) = ${f(freight)}` }]),
    ...(exw ? [] : [{ item: 'Not in the freight (delivered terms)', gbp: 0, source: 'line-haul only (EDU audit G-10): inland transport to the port, export clearance, terminal handling at both ends, the UK customs broker and the delivery to site are not costed', formula: 'not costed = £0.0000' }]),
    ...(exw ? [] : [{ item: 'UK import duty', gbp: importDuty, source: `duty rate: ${T.table} — an assumption, the HS line for this assembly is not confirmed; customs value = CIF (goods + freight)`,
      formula: `(fab ${f(pcbFabPerBoard)} + assembly ${f(assemblyPerBoard)} + components ${f(bomSourced)} + freight ${f(freight)}) × ${(l.importDutyFraction * 100).toFixed(1)} % = ${f(importDuty)}` }]),
    { item: 'Energy', gbp: energyCost, source: `tariff: ${T.regional}; 0.9 kWh/dm² (2 layers) + 0.15 kWh/dm² a further layer, 0.06 kWh a board + 0.0008 kWh a placement: ${T.engineering}`,
      formula: `(${boardAreaDm2.toFixed(4)} × (0.9 + 0.15 × ${extraLayers}) + 0.06 + 0.0008 × ${input.smtPlacements}) kWh = ${(fabKWh + asmKWh).toFixed(4)} kWh × ${f(rate.energyCostPerKWh ?? 0.15, 3)}/kWh = ${f(energyCost)}` },
    { item: 'ESD packaging', gbp: packagingCost, source: `${T.engineering} (country figure per board, no citation)`, formula: `${f(packagingCost)} a board` },
    { item: 'Cost of quality', gbp: yieldLossCost, source: `${fpyGiven ? 'first-pass yield: the engineer\'s figure' : `dppm: ${T.table} (no source — type a first-pass yield on the PCB form)`}; λ capped at 0.30, 95 % of defects reworked at 20 % of assembly + half an ICT, 5 % scrapped at fab + assembly + components: ${T.engineering}`,
      formula: `λ = ${fpyGiven ? `1 − FPY ${fpy}` : `min(0.30, ${input.smtPlacements} × ${a.dppm}/10⁶)`} = ${lambda.toFixed(4)}; ${lambda.toFixed(4)} × (0.95 × ${f(reworkCost)} + 0.05 × ${f(scrapCost)}) = ${f(yieldLossCost)}` },
  ];

  return {
    countryId,
    countryName: rate.name,
    flag: rate.flag,
    pcbFabPerBoard: Math.round(pcbFabPerBoard * 100) / 100,
    assemblyPerBoard: Math.round(assemblyPerBoard * 100) / 100,
    logisticsPerBoard: Math.round(logisticsPerBoard * 100) / 100,
    bomCostPerBoard: Math.round(bomSourced * 100) / 100,
    totalPerBoard: Math.round(totalPerBoard * 100) / 100,
    emsInvoicePerBoard: Math.round((totalPerBoard - customerSupplied) * 100) / 100,
    deliveryTerms: exw ? 'EXW' : 'DAP',
    leadTimeWeeks: rate.leadTimeWeeks.production,
    qualityIndex: rate.qualityIndex,
    certifications: rate.certifications,
    bestFor: rate.bestFor,
    breakdown: {
      pcbBase: Math.round(pcbBase * 100) / 100,
      pcbLayers: Math.round(pcbLayers * 100) / 100,
      pcbSurface: Math.round(pcbSurface * 100) / 100,
      pcbVias: Math.round(pcbVias * 100) / 100,
      pcbHDI: Math.round(pcbHDI * 100) / 100,
      pcbSetup: Math.round(pcbSetup * 100) / 100,
      pcbImpedance: Math.round(pcbImpedance * 100) / 100,
      pcbCopper: Math.round(pcbCopper * 100) / 100,
      ...(pcbOptions > 0 ? { pcbOptions: Math.round(pcbOptions * 100) / 100 } : {}),
      smtAssembly: Math.round((smtAssembly + thAssembly + manualAssembly) * 100) / 100,
      thAssembly: Math.round(thAssembly * 100) / 100,
      aoi: Math.round((aoiCost + xrayCost + ictCost + confCost) * 100) / 100,
      logistics: Math.round(freight * 100) / 100,
      importDuty: Math.round(importDuty * 100) / 100,
      materialBurden: Math.round(materialBurden * 100) / 100,
      materialBurdenPct,
      ...(customerSupplied > 0 ? { customerSupplied: Math.round(customerSupplied * 100) / 100 } : {}),
      ...(opsCost > 0 ? { operations: Math.round(opsCost * 100) / 100 } : {}),
      energy: Math.round(energyCost * 100) / 100,
      packaging: Math.round(packagingCost * 100) / 100,
      yieldLoss: Math.round(yieldLossCost * 100) / 100,
    },
    basis,
    ...(fabOpts.included.length || fabOpts.notCosted.length ? { fabOptionNotes: { included: fabOpts.included, notCosted: fabOpts.notCosted } } : {}),
    panelInfo: {
      boardsPerPanel: panel.boardsPerPanel,
      utilisation: Math.round(panel.utilisation * 1000) / 1000,
      panelW: panel.panelW,
      panelH: panel.panelH,
    },
  };
}

export function computeAllCountryCosts(input: PCBCostInput): PCBCountryCostBreakdown[] {
  return COUNTRY_DISPLAY_ORDER.map(id => computePCBCountryCost(input, id));
}

// ─── Volume break pricing curves (Feature / Priority 3) ────────────────────
export interface VolumeCurvePoint {
  qty: number;
  totalPerBoard: number;
  pcbFabPerBoard: number;
  assemblyPerBoard: number;
  logisticsPerBoard: number;
}

export function computeVolumeCurve(
  baseInput: PCBCostInput,
  countryId: string,
  qtys: number[] = [100, 250, 500, 1000, 2500, 5000, 10000, 25000],
  /** The BOM at another order quantity (component price breaks). Without it the BOM
   *  stayed at the analysed quantity's prices at every point of the curve. */
  bomAt?: (qty: number) => number,
): VolumeCurvePoint[] {
  return qtys.map(qty => {
    const result = computePCBCountryCost({ ...baseInput, orderQuantity: qty, ...(bomAt ? { totalBOMCostGBP: bomAt(qty) } : {}) }, countryId);
    return {
      qty,
      totalPerBoard: result.totalPerBoard,
      pcbFabPerBoard: result.pcbFabPerBoard,
      assemblyPerBoard: result.assemblyPerBoard,
      logisticsPerBoard: result.logisticsPerBoard,
    };
  });
}

// ─── Supply chain risk radar (Feature 6) ───────────────────────────────────
export interface PCBRiskProfile {
  /** 0-1 (1 = lowest risk) */
  overall: number;
  geopolitical: number;
  logisticsReliability: number;
  qualityConsistency: number;
  /** derived from BOM analysis (1 = low single-source exposure) */
  singleSourceExposure: number;
  leadTimeVariance: number;
  label: 'Low Risk' | 'Medium Risk' | 'High Risk';
}

export function computeRiskProfile(countryId: string, bomAutomotiveCount = 0): PCBRiskProfile {
  const rate = PCB_COUNTRY_RATES[countryId];
  const dims = rate?.riskDimensions ?? {
    geopolitical: 0.7, logisticsReliability: 0.8, qualityConsistency: 0.8, leadTimeVariance: 0.8,
  };
  // Single-source exposure: more automotive-grade parts → higher exposure (lower score).
  const singleSourceExposure = Math.max(0.3, 1 - Math.min(bomAutomotiveCount, 12) * 0.05);
  const overall = (
    dims.geopolitical * 0.25 +
    dims.logisticsReliability * 0.20 +
    dims.qualityConsistency * 0.25 +
    singleSourceExposure * 0.15 +
    dims.leadTimeVariance * 0.15
  );
  const label: PCBRiskProfile['label'] =
    overall >= 0.85 ? 'Low Risk' : overall >= 0.68 ? 'Medium Risk' : 'High Risk';
  return {
    overall: Math.round(overall * 1000) / 1000,
    geopolitical: dims.geopolitical,
    logisticsReliability: dims.logisticsReliability,
    qualityConsistency: dims.qualityConsistency,
    singleSourceExposure: Math.round(singleSourceExposure * 1000) / 1000,
    leadTimeVariance: dims.leadTimeVariance,
    label,
  };
}

// ─── PCB complexity score (Feature 11) ─────────────────────────────────────
export interface PCBComplexityScore {
  score: number;
  ipcClass: 1 | 2 | 3;
  label: 'Simple' | 'Moderate' | 'Complex' | 'Very Complex' | 'Extreme';
  factors: {
    layers: number;
    viaDensity: number;
    bgaScore: number;
    hdiScore: number;
    traceScore: number;
  };
}

interface ComplexityBoardSpec {
  estimatedLayers?: number;
  widthMm?: number;
  heightMm?: number;
  throughVias?: number;
  blindVias?: number;
  buriedVias?: number;
  microVias?: number;
  hdiStructure?: string;
  minTraceSpaceMm?: number;
}
interface ComplexityAssembly {
  bgaCount?: number;
}

export function computeComplexityScore(
  boardSpec: ComplexityBoardSpec,
  assembly: ComplexityAssembly,
): PCBComplexityScore {
  const layers = boardSpec.estimatedLayers ?? 2;
  // Layers contribution 0-20
  const layerScore =
    layers >= 12 ? 20 : layers >= 10 ? 17 : layers >= 8 ? 14 : layers >= 6 ? 10 : layers >= 4 ? 6 : 0;

  // Via density per dm²
  const totalVias = (boardSpec.throughVias ?? 0) + (boardSpec.blindVias ?? 0) +
    (boardSpec.buriedVias ?? 0) + (boardSpec.microVias ?? 0);
  const areaDm2 = Math.max(0.01, ((boardSpec.widthMm ?? 100) * (boardSpec.heightMm ?? 80)) / 10000);
  const viaPerDm2 = totalVias / areaDm2;
  const viaScore =
    viaPerDm2 >= 500 ? 20 : viaPerDm2 >= 300 ? 15 : viaPerDm2 >= 150 ? 10 : viaPerDm2 >= 50 ? 5 : 0;

  // BGA score
  const bga = assembly.bgaCount ?? 0;
  let bgaScore = bga >= 11 ? 20 : bga >= 6 ? 15 : bga >= 3 ? 10 : bga >= 1 ? 5 : 0;
  // Fine-pitch surcharge handled by HDI/trace; keep BGA cap at 20.
  bgaScore = Math.min(20, bgaScore);

  // HDI structure. Normalise away separators AND the word "plus" so that every
  // format collapses to a canonical form: '2plus_n_plus2' | '2+N+2' | '2 N 2'
  // all become '2n2'. Previously only spaces/underscores were stripped, so
  // '2plus_n_plus2' failed the /2.?n.?2/ test and fell through to 10 instead of 16.
  const hdi = (boardSpec.hdiStructure ?? 'none').toLowerCase().replace(/plus/g, '').replace(/[\s_+\-]/g, '');
  const hdiScore =
    /anylayer/.test(hdi) ? 20 :
    /2.?n.?2/.test(hdi) ? 16 :
    /1.?n.?1/.test(hdi) ? 10 :
    (hdi === 'none' || hdi === '') ? 0 : 10;

  // Min trace/space
  const tr = boardSpec.minTraceSpaceMm ?? 0.2;
  const traceScore =
    tr < 0.05 ? 20 : tr < 0.075 ? 15 : tr < 0.10 ? 10 : tr <= 0.15 ? 5 : 0;

  const score = Math.min(100, Math.round(layerScore + viaScore + bgaScore + hdiScore + traceScore));

  let ipcClass: 1 | 2 | 3;
  let label: PCBComplexityScore['label'];
  if (score <= 30) { ipcClass = 1; label = 'Simple'; }
  else if (score <= 55) { ipcClass = 2; label = 'Moderate'; }
  else if (score <= 75) { ipcClass = 2; label = 'Complex'; }
  else if (score <= 90) { ipcClass = 3; label = 'Very Complex'; }
  else { ipcClass = 3; label = 'Extreme'; }

  return {
    score,
    ipcClass,
    label,
    factors: {
      layers: layerScore,
      viaDensity: viaScore,
      bgaScore,
      hdiScore,
      traceScore,
    },
  };
}
