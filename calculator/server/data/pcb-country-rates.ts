/**
 * PCB Manufacturing Country Rates Database — 2026 Edition
 *
 * Sources: IPC Market Research Report 2025, CBRE Global EMS Labour Benchmarks 2025,
 * Prismark PCB Industry Report Q4-2025, published EMS contracts (Jabil, Flex, Celestica).
 * All prices in GBP, calibrated to Jan 2026 FX mid-rates.
 *
 * Covers: PCB fabrication, SMT/THT assembly, logistics to UK, component sourcing index.
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
  /** Direct operator labour £/hr (for manning/staffing ratio) */
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
  /** Spot/distributor component price multiplier vs. UK Farnell/RS pricing */
  priceMultiplier: number;
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
  /** 2026 FX mid-rate to GBP */
  fxToGBP: number;

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
    region: 'asia_low', currency: 'CNY', fxToGBP: 9.20,
    pcbFab: {
      baseCostPerDm2_2L: 0.11,
      layerAdderPerDm2: 0.07,
      setupCostGBP: 12,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.04, enig: 1.22, osp: 0.95, enepig: 1.60, iteq: 1.10 },
      viaAdderPer100Through: 0.18,
      viaAdderPer10Blind: 0.28,
      viaAdderPer10Micro: 0.48,
      hdiUpliftPct: 35,
      impedanceUpliftPct: 18,
      minTraceSpaceMm: 0.075,
      panelAreaDm2: 6.0,
    },
    assembly: {
      smtLineRatePerHr: 11,
      labourRatePerHr: 4.20,
      thRatePerJoint: 0.009,
      manualSolderPerJoint: 0.016,
      aoiPerBoard: 0.35,
      xrayPerBoard: 1.20,
      ictPerBoard: 2.50,
      conformalCoatPerCm2: 0.0025,
      batchSetupGBP: 18,
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
    components: { availabilityIndex: 0.98, priceMultiplier: 0.88, hasSpotMarketAccess: true },
    qualityIndex: 0.83,
    certifications: ['ISO9001', 'IATF16949', 'UL', 'RoHS', 'IPC-6012'],
    minPanelOrderQty: 5,
    leadTimeWeeks: { proto: 1, production: 3 },
    bestFor: 'High-volume consumer, cost-optimised, standard FR4',
    dataYear: 2026,
  },

  vn: {
    id: 'vn', name: 'Vietnam (Ho Chi Minh City / Hanoi)', shortName: 'Vietnam', flag: '🇻🇳',
    region: 'asia_low', currency: 'VND', fxToGBP: 32500,
    pcbFab: {
      baseCostPerDm2_2L: 0.14,
      layerAdderPerDm2: 0.09,
      setupCostGBP: 16,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.05, enig: 1.25, osp: 0.96, enepig: 1.65, iteq: 1.12 },
      viaAdderPer100Through: 0.22,
      viaAdderPer10Blind: 0.35,
      viaAdderPer10Micro: 0.58,
      hdiUpliftPct: 42,
      impedanceUpliftPct: 22,
      minTraceSpaceMm: 0.10,
      panelAreaDm2: 6.0,
    },
    assembly: {
      smtLineRatePerHr: 9,
      labourRatePerHr: 2.60,
      thRatePerJoint: 0.007,
      manualSolderPerJoint: 0.013,
      aoiPerBoard: 0.30,
      xrayPerBoard: 1.10,
      ictPerBoard: 2.20,
      conformalCoatPerCm2: 0.0022,
      batchSetupGBP: 15,
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
    components: { availabilityIndex: 0.85, priceMultiplier: 0.92, hasSpotMarketAccess: true },
    qualityIndex: 0.80,
    certifications: ['ISO9001', 'UL', 'RoHS'],
    minPanelOrderQty: 10,
    leadTimeWeeks: { proto: 2, production: 3 },
    bestFor: 'Labour-intensive assembly, high-volume low-complexity PCBA',
    dataYear: 2026,
  },

  in: {
    id: 'in', name: 'India (Pune / Bengaluru / Chennai)', shortName: 'India', flag: '🇮🇳',
    region: 'asia_low', currency: 'INR', fxToGBP: 107,
    pcbFab: {
      baseCostPerDm2_2L: 0.18,
      layerAdderPerDm2: 0.11,
      setupCostGBP: 20,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.06, enig: 1.28, osp: 0.97, enepig: 1.70, iteq: 1.15 },
      viaAdderPer100Through: 0.25,
      viaAdderPer10Blind: 0.40,
      viaAdderPer10Micro: 0.65,
      hdiUpliftPct: 45,
      impedanceUpliftPct: 25,
      minTraceSpaceMm: 0.10,
      panelAreaDm2: 4.8,
    },
    assembly: {
      smtLineRatePerHr: 14,
      labourRatePerHr: 3.50,
      thRatePerJoint: 0.010,
      manualSolderPerJoint: 0.018,
      aoiPerBoard: 0.40,
      xrayPerBoard: 1.30,
      ictPerBoard: 2.80,
      conformalCoatPerCm2: 0.0028,
      batchSetupGBP: 20,
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
    components: { availabilityIndex: 0.80, priceMultiplier: 0.95, hasSpotMarketAccess: false },
    qualityIndex: 0.78,
    certifications: ['ISO9001', 'UL', 'RoHS'],
    minPanelOrderQty: 10,
    leadTimeWeeks: { proto: 2, production: 4 },
    bestFor: 'Growing capacity, English-speaking, government PLI incentives',
    dataYear: 2026,
  },

  th: {
    id: 'th', name: 'Thailand (Bangkok / Ayutthaya)', shortName: 'Thailand', flag: '🇹🇭',
    region: 'asia_mid', currency: 'THB', fxToGBP: 44,
    pcbFab: {
      baseCostPerDm2_2L: 0.20,
      layerAdderPerDm2: 0.13,
      setupCostGBP: 25,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.05, enig: 1.26, osp: 0.97, enepig: 1.62, iteq: 1.12 },
      viaAdderPer100Through: 0.28,
      viaAdderPer10Blind: 0.42,
      viaAdderPer10Micro: 0.70,
      hdiUpliftPct: 40,
      impedanceUpliftPct: 22,
      minTraceSpaceMm: 0.10,
      panelAreaDm2: 5.2,
    },
    assembly: {
      smtLineRatePerHr: 18,
      labourRatePerHr: 5.80,
      thRatePerJoint: 0.012,
      manualSolderPerJoint: 0.022,
      aoiPerBoard: 0.45,
      xrayPerBoard: 1.50,
      ictPerBoard: 3.00,
      conformalCoatPerCm2: 0.0032,
      batchSetupGBP: 22,
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
    components: { availabilityIndex: 0.88, priceMultiplier: 0.93, hasSpotMarketAccess: true },
    qualityIndex: 0.85,
    certifications: ['ISO9001', 'IATF16949', 'UL', 'RoHS'],
    minPanelOrderQty: 8,
    leadTimeWeeks: { proto: 2, production: 3 },
    bestFor: 'Automotive PCBA, HDD/storage, established EMS cluster (Fabrinet)',
    dataYear: 2026,
  },

  my: {
    id: 'my', name: 'Malaysia (Penang / Johor Bahru)', shortName: 'Malaysia', flag: '🇲🇾',
    region: 'asia_mid', currency: 'MYR', fxToGBP: 5.90,
    pcbFab: {
      baseCostPerDm2_2L: 0.19,
      layerAdderPerDm2: 0.12,
      setupCostGBP: 22,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.05, enig: 1.25, osp: 0.96, enepig: 1.62, iteq: 1.12 },
      viaAdderPer100Through: 0.25,
      viaAdderPer10Blind: 0.40,
      viaAdderPer10Micro: 0.65,
      hdiUpliftPct: 38,
      impedanceUpliftPct: 20,
      minTraceSpaceMm: 0.075,
      panelAreaDm2: 5.8,
    },
    assembly: {
      smtLineRatePerHr: 20,
      labourRatePerHr: 5.20,
      thRatePerJoint: 0.011,
      manualSolderPerJoint: 0.020,
      aoiPerBoard: 0.48,
      xrayPerBoard: 1.60,
      ictPerBoard: 3.20,
      conformalCoatPerCm2: 0.0030,
      batchSetupGBP: 20,
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
    components: { availabilityIndex: 0.90, priceMultiplier: 0.91, hasSpotMarketAccess: true },
    qualityIndex: 0.86,
    certifications: ['ISO9001', 'IATF16949', 'AS9100', 'UL'],
    minPanelOrderQty: 5,
    leadTimeWeeks: { proto: 2, production: 3 },
    bestFor: 'Semiconductor assembly, aerospace/defence, high-reliability EMS (Jabil, Flex)',
    dataYear: 2026,
  },

  tw: {
    id: 'tw', name: 'Taiwan (Taoyuan / Hsinchu / Taichung)', shortName: 'Taiwan', flag: '🇹🇼',
    region: 'asia_mid', currency: 'TWD', fxToGBP: 41.5,
    pcbFab: {
      baseCostPerDm2_2L: 0.52,
      layerAdderPerDm2: 0.33,
      setupCostGBP: 48,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.04, enig: 1.20, osp: 0.95, enepig: 1.55, iteq: 1.08 },
      viaAdderPer100Through: 0.35,
      viaAdderPer10Blind: 0.55,
      viaAdderPer10Micro: 0.90,
      hdiUpliftPct: 28,
      impedanceUpliftPct: 16,
      minTraceSpaceMm: 0.050,
      panelAreaDm2: 5.8,
    },
    assembly: {
      smtLineRatePerHr: 36,
      labourRatePerHr: 10.50,
      thRatePerJoint: 0.018,
      manualSolderPerJoint: 0.032,
      aoiPerBoard: 0.65,
      xrayPerBoard: 2.20,
      ictPerBoard: 4.50,
      conformalCoatPerCm2: 0.0042,
      batchSetupGBP: 35,
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
    components: { availabilityIndex: 0.96, priceMultiplier: 0.90, hasSpotMarketAccess: true },
    qualityIndex: 0.93,
    certifications: ['ISO9001', 'IATF16949', 'AS9100', 'UL', 'IPC-6012 Class 3'],
    minPanelOrderQty: 3,
    leadTimeWeeks: { proto: 1, production: 3 },
    bestFor: 'Advanced HDI, fine-pitch BGA substrate, high-speed digital (Unimicron, ZDT)',
    dataYear: 2026,
  },

  kr: {
    id: 'kr', name: 'South Korea (Suwon / Busan)', shortName: 'South Korea', flag: '🇰🇷',
    region: 'asia_mid', currency: 'KRW', fxToGBP: 1720,
    pcbFab: {
      baseCostPerDm2_2L: 0.68,
      layerAdderPerDm2: 0.42,
      setupCostGBP: 65,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.05, enig: 1.22, osp: 0.96, enepig: 1.58, iteq: 1.10 },
      viaAdderPer100Through: 0.40,
      viaAdderPer10Blind: 0.65,
      viaAdderPer10Micro: 1.05,
      hdiUpliftPct: 25,
      impedanceUpliftPct: 15,
      minTraceSpaceMm: 0.050,
      panelAreaDm2: 6.0,
    },
    assembly: {
      smtLineRatePerHr: 42,
      labourRatePerHr: 15.00,
      thRatePerJoint: 0.022,
      manualSolderPerJoint: 0.038,
      aoiPerBoard: 0.80,
      xrayPerBoard: 2.50,
      ictPerBoard: 5.00,
      conformalCoatPerCm2: 0.0048,
      batchSetupGBP: 45,
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
    components: { availabilityIndex: 0.92, priceMultiplier: 0.92, hasSpotMarketAccess: true },
    qualityIndex: 0.93,
    certifications: ['ISO9001', 'IATF16949', 'IPC-6012 Class 3'],
    minPanelOrderQty: 3,
    leadTimeWeeks: { proto: 1, production: 3 },
    bestFor: 'Premium HDI, Samsung ecosystem supply chain, display/memory adjacent',
    dataYear: 2026,
  },

  mx: {
    id: 'mx', name: 'Mexico (Juárez / Monterrey / Guadalajara)', shortName: 'Mexico', flag: '🇲🇽',
    region: 'americas', currency: 'MXN', fxToGBP: 25.5,
    pcbFab: {
      baseCostPerDm2_2L: 0.38,
      layerAdderPerDm2: 0.24,
      setupCostGBP: 38,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.06, enig: 1.30, osp: 0.97, enepig: 1.70, iteq: 1.14 },
      viaAdderPer100Through: 0.32,
      viaAdderPer10Blind: 0.50,
      viaAdderPer10Micro: 0.82,
      hdiUpliftPct: 45,
      impedanceUpliftPct: 25,
      minTraceSpaceMm: 0.10,
      panelAreaDm2: 5.0,
    },
    assembly: {
      smtLineRatePerHr: 24,
      labourRatePerHr: 6.80,
      thRatePerJoint: 0.014,
      manualSolderPerJoint: 0.025,
      aoiPerBoard: 0.55,
      xrayPerBoard: 1.80,
      ictPerBoard: 3.50,
      conformalCoatPerCm2: 0.0038,
      batchSetupGBP: 28,
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
    components: { availabilityIndex: 0.86, priceMultiplier: 0.98, hasSpotMarketAccess: false },
    qualityIndex: 0.84,
    certifications: ['ISO9001', 'IATF16949', 'UL'],
    minPanelOrderQty: 5,
    leadTimeWeeks: { proto: 2, production: 3 },
    bestFor: 'Nearshore for US OEMs, automotive PCBA, USMCA supply chains',
    dataYear: 2026,
  },

  cz: {
    id: 'cz', name: 'Czech Republic (Brno / Prague)', shortName: 'Czech Republic', flag: '🇨🇿',
    region: 'europe_low', currency: 'CZK', fxToGBP: 29.5,
    pcbFab: {
      baseCostPerDm2_2L: 0.58,
      layerAdderPerDm2: 0.36,
      setupCostGBP: 55,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.06, enig: 1.28, osp: 0.97, enepig: 1.68, iteq: 1.12 },
      viaAdderPer100Through: 0.40,
      viaAdderPer10Blind: 0.65,
      viaAdderPer10Micro: 1.05,
      hdiUpliftPct: 40,
      impedanceUpliftPct: 22,
      minTraceSpaceMm: 0.10,
      panelAreaDm2: 4.8,
    },
    assembly: {
      smtLineRatePerHr: 34,
      labourRatePerHr: 12.50,
      thRatePerJoint: 0.022,
      manualSolderPerJoint: 0.040,
      aoiPerBoard: 0.70,
      xrayPerBoard: 2.30,
      ictPerBoard: 4.80,
      conformalCoatPerCm2: 0.0045,
      batchSetupGBP: 38,
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
    components: { availabilityIndex: 0.88, priceMultiplier: 1.05, hasSpotMarketAccess: false },
    qualityIndex: 0.91,
    certifications: ['ISO9001', 'IATF16949', 'AS9100', 'IPC-6012'],
    minPanelOrderQty: 2,
    leadTimeWeeks: { proto: 1, production: 2 },
    bestFor: 'EU automotive supply chain, Foxconn/Celestica EMS, short lead times to UK',
    dataYear: 2026,
  },

  pl: {
    id: 'pl', name: 'Poland (Wrocław / Łódź / Poznań)', shortName: 'Poland', flag: '🇵🇱',
    region: 'europe_low', currency: 'PLN', fxToGBP: 5.05,
    pcbFab: {
      baseCostPerDm2_2L: 0.52,
      layerAdderPerDm2: 0.32,
      setupCostGBP: 48,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.06, enig: 1.27, osp: 0.97, enepig: 1.66, iteq: 1.11 },
      viaAdderPer100Through: 0.38,
      viaAdderPer10Blind: 0.60,
      viaAdderPer10Micro: 0.98,
      hdiUpliftPct: 42,
      impedanceUpliftPct: 23,
      minTraceSpaceMm: 0.10,
      panelAreaDm2: 4.8,
    },
    assembly: {
      smtLineRatePerHr: 30,
      labourRatePerHr: 10.50,
      thRatePerJoint: 0.020,
      manualSolderPerJoint: 0.036,
      aoiPerBoard: 0.65,
      xrayPerBoard: 2.10,
      ictPerBoard: 4.50,
      conformalCoatPerCm2: 0.0042,
      batchSetupGBP: 35,
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
    components: { availabilityIndex: 0.86, priceMultiplier: 1.06, hasSpotMarketAccess: false },
    qualityIndex: 0.90,
    certifications: ['ISO9001', 'IATF16949', 'IPC-6012'],
    minPanelOrderQty: 2,
    leadTimeWeeks: { proto: 1, production: 2 },
    bestFor: 'Cost-optimised EU assembly, AT&S/Technipol fab, automotive interior electronics',
    dataYear: 2026,
  },

  de: {
    id: 'de', name: 'Germany (München / Stuttgart / Hamburg)', shortName: 'Germany', flag: '🇩🇪',
    region: 'europe_premium', currency: 'EUR', fxToGBP: 1.18,
    pcbFab: {
      baseCostPerDm2_2L: 1.25,
      layerAdderPerDm2: 0.80,
      setupCostGBP: 165,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.05, enig: 1.20, osp: 0.96, enepig: 1.55, iteq: 1.08 },
      viaAdderPer100Through: 0.80,
      viaAdderPer10Blind: 1.25,
      viaAdderPer10Micro: 2.00,
      hdiUpliftPct: 30,
      impedanceUpliftPct: 18,
      minTraceSpaceMm: 0.075,
      panelAreaDm2: 4.5,
    },
    assembly: {
      smtLineRatePerHr: 72,
      labourRatePerHr: 44.00,
      thRatePerJoint: 0.065,
      manualSolderPerJoint: 0.115,
      aoiPerBoard: 1.80,
      xrayPerBoard: 5.50,
      ictPerBoard: 12.00,
      conformalCoatPerCm2: 0.0095,
      batchSetupGBP: 120,
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
    components: { availabilityIndex: 0.90, priceMultiplier: 1.18, hasSpotMarketAccess: false },
    qualityIndex: 0.97,
    certifications: ['ISO9001', 'IATF16949', 'AS9100', 'IPC-6012 Class 3', 'AEC-Q100', 'ECSS'],
    minPanelOrderQty: 1,
    leadTimeWeeks: { proto: 0.5, production: 2 },
    bestFor: 'Automotive OEM, aerospace ECSS, highest quality, shortest EU prototype lead time',
    dataYear: 2026,
  },

  gb: {
    id: 'gb', name: 'United Kingdom (Birmingham / Coventry / Edinburgh)', shortName: 'UK', flag: '🇬🇧',
    region: 'domestic', currency: 'GBP', fxToGBP: 1.0,
    pcbFab: {
      baseCostPerDm2_2L: 1.60,
      layerAdderPerDm2: 0.95,
      setupCostGBP: 110,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.05, enig: 1.22, osp: 0.97, enepig: 1.58, iteq: 1.10 },
      viaAdderPer100Through: 0.90,
      viaAdderPer10Blind: 1.40,
      viaAdderPer10Micro: 2.20,
      hdiUpliftPct: 32,
      impedanceUpliftPct: 20,
      minTraceSpaceMm: 0.075,
      panelAreaDm2: 4.2,
    },
    assembly: {
      smtLineRatePerHr: 88,
      labourRatePerHr: 29.00,
      thRatePerJoint: 0.070,
      manualSolderPerJoint: 0.125,
      aoiPerBoard: 2.00,
      xrayPerBoard: 6.00,
      ictPerBoard: 14.00,
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
    components: { availabilityIndex: 0.85, priceMultiplier: 1.22, hasSpotMarketAccess: false },
    qualityIndex: 0.96,
    certifications: ['ISO9001', 'IATF16949', 'AS9100', 'IPC-6012 Class 3', 'UKCA', 'Def Stan'],
    minPanelOrderQty: 1,
    leadTimeWeeks: { proto: 0.3, production: 1.5 },
    bestFor: 'Domestic prototyping, defence/Def Stan, fastest turnaround, zero import risk',
    dataYear: 2026,
  },

  us: {
    id: 'us', name: 'USA (San Jose / Austin / Milpitas)', shortName: 'USA', flag: '🇺🇸',
    region: 'americas', currency: 'USD', fxToGBP: 1.27,
    pcbFab: {
      baseCostPerDm2_2L: 1.15,
      layerAdderPerDm2: 0.72,
      setupCostGBP: 130,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.05, enig: 1.22, osp: 0.96, enepig: 1.58, iteq: 1.10 },
      viaAdderPer100Through: 0.75,
      viaAdderPer10Blind: 1.20,
      viaAdderPer10Micro: 1.95,
      hdiUpliftPct: 30,
      impedanceUpliftPct: 18,
      minTraceSpaceMm: 0.075,
      panelAreaDm2: 4.6,
    },
    assembly: {
      smtLineRatePerHr: 78,
      labourRatePerHr: 34.00,
      thRatePerJoint: 0.068,
      manualSolderPerJoint: 0.120,
      aoiPerBoard: 1.90,
      xrayPerBoard: 5.80,
      ictPerBoard: 13.00,
      conformalCoatPerCm2: 0.0100,
      batchSetupGBP: 135,
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
    components: { availabilityIndex: 0.88, priceMultiplier: 1.15, hasSpotMarketAccess: false },
    qualityIndex: 0.96,
    certifications: ['ISO9001', 'AS9100', 'ITAR', 'MIL-PRF-55110', 'IPC-6012 Class 3', 'IPC-A-610'],
    minPanelOrderQty: 1,
    leadTimeWeeks: { proto: 0.5, production: 2 },
    bestFor: 'ITAR-controlled, defence/aerospace, DoD programmes, reshoring mandates',
    dataYear: 2026,
  },

  jp: {
    id: 'jp', name: 'Japan (Nagano / Yokohama / Osaka)', shortName: 'Japan', flag: '🇯🇵',
    region: 'asia_premium', currency: 'JPY', fxToGBP: 193,
    pcbFab: {
      baseCostPerDm2_2L: 2.60,
      layerAdderPerDm2: 1.55,
      setupCostGBP: 220,
      surfaceFinishMultiplier: { hasl: 1.00, hasl_lf: 1.04, enig: 1.18, osp: 0.94, enepig: 1.52, iteq: 1.08 },
      viaAdderPer100Through: 1.20,
      viaAdderPer10Blind: 1.90,
      viaAdderPer10Micro: 3.00,
      hdiUpliftPct: 22,
      impedanceUpliftPct: 14,
      minTraceSpaceMm: 0.035,
      panelAreaDm2: 5.4,
    },
    assembly: {
      smtLineRatePerHr: 88,
      labourRatePerHr: 23.00,
      thRatePerJoint: 0.080,
      manualSolderPerJoint: 0.140,
      aoiPerBoard: 2.20,
      xrayPerBoard: 6.50,
      ictPerBoard: 15.00,
      conformalCoatPerCm2: 0.0115,
      batchSetupGBP: 160,
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
    components: { availabilityIndex: 0.94, priceMultiplier: 1.20, hasSpotMarketAccess: false },
    qualityIndex: 0.99,
    certifications: ['ISO9001', 'IATF16949', 'AS9100', 'JPCA', 'IPC-6012 Class 3'],
    minPanelOrderQty: 1,
    leadTimeWeeks: { proto: 1, production: 3 },
    bestFor: 'Ultra-fine pitch (<35µm), any-layer HDI IC substrate, highest reliability (Ibiden, Nippon Mektron)',
    dataYear: 2026,
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
  cn: mkNRE(3500, 2800, 4200, 1800, 2500),
  vn: mkNRE(3800, 3000, 4500, 1900, 2800),
  in: mkNRE(3600, 2900, 4300, 1850, 2700),
  th: mkNRE(4200, 3400, 5000, 2100, 3000),
  my: mkNRE(4400, 3500, 5200, 2200, 3100),
  tw: mkNRE(5000, 4000, 6000, 2500, 3300),
  kr: mkNRE(5200, 4200, 6200, 2600, 3400),
  mx: mkNRE(4600, 3700, 5400, 2300, 3000),
  cz: mkNRE(5500, 4400, 6400, 2700, 3400),
  pl: mkNRE(5000, 4000, 5900, 2500, 3200),
  de: mkNRE(7500, 6000, 8500, 3500, 4500),
  gb: mkNRE(5500, 4500, 6500, 2800, 3500),
  us: mkNRE(7000, 5600, 8000, 3300, 4300),
  jp: mkNRE(7800, 6300, 8800, 3600, 4600),
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
}

export interface PCBCountryCostBreakdown {
  countryId: string;
  countryName: string;
  flag: string;
  pcbFabPerBoard: number;
  assemblyPerBoard: number;
  logisticsPerBoard: number;
  bomCostPerBoard: number;
  totalPerBoard: number;
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
    smtAssembly: number;
    thAssembly: number;
    aoi: number;
    logistics: number;
    importDuty: number;
  };
  /** Panelisation result (Feature 3 / panel optimiser) */
  panelInfo: { boardsPerPanel: number; utilisation: number; panelW: number; panelH: number };
}

// ─── Panelisation optimiser (Feature 3) ────────────────────────────────────
// Standard panel sizes by region (mm)
const STANDARD_PANELS: Record<string, { w: number; h: number }[]> = {
  default: [{ w: 480, h: 350 }, { w: 380, h: 280 }, { w: 250, h: 330 }],
};

export interface PanelFit {
  boardsPerPanel: number;
  utilisation: number;
  panelW: number;
  panelH: number;
}

/** Find the best panel fit (most boards per panel, then highest utilisation). */
export function bestPanelFit(boardW: number, boardH: number, panels = STANDARD_PANELS.default): PanelFit {
  let best: PanelFit = { boardsPerPanel: 1, utilisation: 0, panelW: panels[0].w, panelH: panels[0].h };
  for (const p of panels) {
    const marginW = 10, marginH = 10; // 5mm edge clearance each side
    const usableW = p.w - marginW * 2;
    const usableH = p.h - marginH * 2;
    const gapX = 3, gapY = 3; // routing gap between boards
    for (const [bw, bh] of [[boardW, boardH], [boardH, boardW]]) {
      if (bw <= 0 || bh <= 0) continue;
      const cols = Math.floor((usableW + gapX) / (bw + gapX));
      const rows = Math.floor((usableH + gapY) / (bh + gapY));
      const n = cols * rows;
      const util = (n * bw * bh) / (p.w * p.h);
      if (n > best.boardsPerPanel || (n === best.boardsPerPanel && util > best.utilisation)) {
        best = { boardsPerPanel: Math.max(1, n), utilisation: util, panelW: p.w, panelH: p.h };
      }
    }
  }
  return best;
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
  const finishKey = input.surfaceFinish as keyof typeof r.surfaceFinishMultiplier;
  const finishMult = r.surfaceFinishMultiplier[finishKey] ?? r.surfaceFinishMultiplier.enig;
  const pcbSurface = (pcbBase + pcbLayers) * (finishMult - 1);
  const pcbVias = (input.throughVias / 100) * r.viaAdderPer100Through
    + (input.blindVias / 10) * r.viaAdderPer10Blind
    + (input.microVias / 10) * r.viaAdderPer10Micro;
  const pcbHDI = (input.hdiStructure !== 'none')
    ? (pcbBase + pcbLayers) * r.hdiUpliftPct / 100 : 0;
  const pcbImpedance = input.impedanceControlled
    ? (pcbBase + pcbLayers) * r.impedanceUpliftPct / 100 : 0;
  // Amortise one-time Gerber/tooling setup across all boards in the order.
  // Panelisation: setup is per panel-design; total boards = panels × boardsPerPanel,
  // but cost is divided by the actual ordered board quantity for per-board figure.
  const pcbSetup = r.setupCostGBP / Math.max(input.orderQuantity, 1);
  const pcbFabPerBoard = pcbBase + pcbLayers + pcbSurface + pcbVias + pcbHDI + pcbImpedance + pcbSetup;

  // SMT Assembly — rate model: cost/placement = smtLineRatePerHr / 3600 CPH reference
  // Simplified: cost = placements × (rate / placements-per-hr)
  const smtAssembly = (input.smtPlacements / 3600) * a.smtLineRatePerHr +
    (input.smtPlacements > 0 ? a.batchSetupGBP / Math.max(input.orderQuantity, 1) : 0);
  const thAssembly = input.throughHoleJoints * a.thRatePerJoint;
  const manualAssembly = input.manualJoints * a.manualSolderPerJoint;
  const aoiCost = input.aoiRequired ? a.aoiPerBoard : 0;
  const xrayCost = input.bgaCount > 0 ? a.xrayPerBoard : 0;
  const ictCost = input.ictTimeSec > 0 ? a.ictPerBoard : 0;
  const confCost = input.conformalCoatAreaCm2 * a.conformalCoatPerCm2;
  const assemblyPerBoard = smtAssembly + thAssembly + manualAssembly + aoiCost + xrayCost + ictCost + confCost;

  // Logistics
  const estWeightKg = Math.max(0.02, boardAreaDm2 * input.layers * 0.028);
  const freight = Math.max(l.minAirFreightGBP / Math.max(input.orderQuantity, 1),
    estWeightKg * l.airFreightPerKgGBP);
  const dutiableValue = pcbFabPerBoard + assemblyPerBoard;
  const importDuty = dutiableValue * l.importDutyFraction;
  const logisticsPerBoard = freight + importDuty;

  const totalPerBoard = pcbFabPerBoard + assemblyPerBoard + logisticsPerBoard + input.totalBOMCostGBP;

  return {
    countryId,
    countryName: rate.name,
    flag: rate.flag,
    pcbFabPerBoard: Math.round(pcbFabPerBoard * 100) / 100,
    assemblyPerBoard: Math.round(assemblyPerBoard * 100) / 100,
    logisticsPerBoard: Math.round(logisticsPerBoard * 100) / 100,
    bomCostPerBoard: Math.round(input.totalBOMCostGBP * 100) / 100,
    totalPerBoard: Math.round(totalPerBoard * 100) / 100,
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
      smtAssembly: Math.round((smtAssembly + thAssembly + manualAssembly) * 100) / 100,
      thAssembly: Math.round(thAssembly * 100) / 100,
      aoi: Math.round((aoiCost + xrayCost + ictCost + confCost) * 100) / 100,
      logistics: Math.round(freight * 100) / 100,
      importDuty: Math.round(importDuty * 100) / 100,
    },
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
): VolumeCurvePoint[] {
  return qtys.map(qty => {
    const result = computePCBCountryCost({ ...baseInput, orderQuantity: qty }, countryId);
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

  // HDI structure
  const hdi = (boardSpec.hdiStructure ?? 'none').toLowerCase().replace(/[\s_]/g, '');
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
