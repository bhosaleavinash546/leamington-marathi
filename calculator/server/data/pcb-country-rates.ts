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
}

export function computePCBCountryCost(input: PCBCostInput, countryId: string): PCBCountryCostBreakdown {
  const rate = PCB_COUNTRY_RATES[countryId];
  if (!rate) throw new Error(`Unknown country: ${countryId}`);

  const r = rate.pcbFab;
  const a = rate.assembly;
  const l = rate.logistics;

  const boardAreaDm2 = (input.widthMm * input.heightMm) / 10000;
  const extraLayers = Math.max(0, input.layers - 2);

  // PCB Fabrication
  const pcbBase = boardAreaDm2 * r.baseCostPerDm2_2L;
  const pcbLayers = boardAreaDm2 * r.layerAdderPerDm2 * extraLayers;
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
  // Amortise setup over order qty (assume ~8 boards per panel)
  const boardsPerPanel = Math.max(1, Math.floor(r.panelAreaDm2 / boardAreaDm2));
  const panelsOrdered = Math.max(1, Math.ceil(input.orderQuantity / boardsPerPanel));
  const pcbSetup = r.setupCostGBP / Math.max(panelsOrdered, 1);
  const pcbFabPerBoard = pcbBase + pcbLayers + pcbSurface + pcbVias + pcbHDI + pcbImpedance + pcbSetup;

  // SMT Assembly
  const smtCycleHr = input.smtPlacements / (a.smtLineRatePerHr * 3600 / 3600); // hr
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
  };
}

export function computeAllCountryCosts(input: PCBCostInput): PCBCountryCostBreakdown[] {
  return COUNTRY_DISPLAY_ORDER.map(id => computePCBCountryCost(input, id));
}
