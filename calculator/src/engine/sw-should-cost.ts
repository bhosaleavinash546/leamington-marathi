/**
 * Automotive Software Should-Cost Engine
 * Senior Chief Automotive Software Should-Cost Engineer model
 * Premium Luxury SUV — Full Software Stack (2024-2026)
 *
 * Covers 49 software modules across 7 categories (43 core + 6 premium-trim
 * options that default to off):
 *  A. EV Powertrain & Battery   B. ADAS L2/L2+
 *  C. Infotainment & UX         D. Vehicle Domain Controllers
 *  E. Middleware & Platform      F. Cybersecurity
 *  G. OTA & Cloud Backend
 */

import {
  DEFAULT_SW_RATE_LIBRARY,
  resolveRateLibrary,
  rateValues,
} from './sw-rate-library.js';
import type { SWRateLibrary } from './sw-rate-library.js';

export type { SWRateLibrary, SWRateEntry, RateConfidence } from './sw-rate-library.js';
export { DEFAULT_SW_RATE_LIBRARY } from './sw-rate-library.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ASILLevel       = 'QM' | 'A' | 'B' | 'C' | 'D';
export type SWComplexity    = 'Low' | 'Medium' | 'High' | 'Very High';
export type SWReuse         = 'Fresh' | 'Light' | 'Medium' | 'Heavy' | 'Platform';
export type SWCategory      = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
export type SWRegion        = 'UK' | 'EU' | 'USA_Detroit' | 'USA_SV' | 'China' | 'India' | 'Mexico' | 'Eastern_Europe' | 'Japan';
export type DevSource       = 'OEM_Internal' | 'Tier1_Supplier' | 'Startup_OSS';

export interface SWModuleDef {
  id:                        string;
  name:                      string;
  shortName:                 string;
  category:                  SWCategory;
  categoryLabel:             string;
  description:               string;
  defaultAsil:               ASILLevel;
  defaultComplexity:         SWComplexity;
  basePersonMonths:          number;   // UK senior FTE, fresh dev, at listed ASIL/complexity
  hasMLContent:              boolean;
  hasCloudDependency:        boolean;
  hasCybersecRequirement:    boolean;
  testingFractionBase:       number;   // testing cost ÷ dev cost at QM baseline
  integrationFractionBase:   number;   // integration cost ÷ dev cost
  maintenancePctPerYear:     number;   // % of dev cost per year (lifecycle)
  annualToolLicenceGBP:      number;   // development toolchain only (Vector, MATLAB, LDRA, etc.) per year
  annualIPLicenceGBP:        number;   // embedded IP/SW licences (RTOS royalty, map data, ASR engine, etc.) per year
  annualCloudCostGBP:        number;   // cloud infra, per year operational
  calibrationFractionBase:   number;   // physical/model calibration effort ÷ dev cost
  /** Premium/optional feature modules default to false — they are itemised scope
   *  present on premium trims but folded into the generic domain buckets on base
   *  vehicles, so leaving them off preserves the validated baseline. Undefined ⇒ on. */
  defaultEnabled?:           boolean;
  notes:                     string;
}

export interface SWModuleInput {
  moduleId:           string;
  enabled:            boolean;
  asil:               ASILLevel;
  complexity:         SWComplexity;
  reuse:              SWReuse;
  customPersonMonths: number | null;   // null = auto
}

export interface SWProgramInputs {
  modules:                  SWModuleInput[];
  region:                   SWRegion;
  devSource:                DevSource;
  programLifeYears:         number;   // 10-15 typical
  annualProductionVolume:   number;   // vehicles/yr to amortize SW cost
  teamSeniorFraction:       number;   // 0-1 fraction that's senior (affects blended rate)
  overheadMultiplier:       number;   // fully loaded: 1.5 typical (benefits 35%, facilities 15%)
  includeMaintenanceCost:   boolean;
  includeCloudCost:         boolean;
  /** UK senior-blended bare rate (£/PM) before overhead. Defaults to UK_PM_RATE_GBP
   *  when unset — lets a costing engineer override the rate library per engagement. */
  baseRateGBP?:             number;
  /** Optional rate-library override (partial). Any group omitted falls back to
   *  DEFAULT_SW_RATE_LIBRARY. Lets an engagement supply its own sourced rates. */
  rateLibrary?:             Partial<SWRateLibrary>;
  // ── Optional accuracy levers (all default-neutral: omitting them reproduces
  //    the validated baseline exactly) ──
  /** Schedule compression: 1.0 = nominal; <1 compresses the timeline and inflates
   *  effort (Brooks/COCOMO SCED). e.g. 0.7 = deliver in 70% of nominal time. */
  scheduleCompression?:     number;
  /** Discount rate % for NPV of multi-year lifecycle costs. 0 = nominal (default). */
  discountRatePct?:         number;
  /** NRE cost-recovery window (years) for the per-vehicle figure. Defaults to
   *  programLifeYears; set ~2 to reflect the industry's short recovery window. */
  costRecoveryYears?:       number;
  /** Include ML dataset acquisition/annotation/retraining cost for ML modules. */
  includeMLDataCost?:       boolean;
  /** Include programme-level homologation/compliance (UNECE R155 CSMS + R156
   *  SUMS audits + external ISO 26262 functional-safety assessment). */
  includeHomologation?:     boolean;
}

export interface SWDevBreakdown {
  requirements:       number;
  architecture:       number;
  algorithmDev:       number;
  implementation:     number;
  safetyCompliance:   number;
  total:              number;
}

export interface SWTestingBreakdown {
  sil:            number;   // Software-in-Loop
  mil:            number;   // Model-in-Loop
  hil:            number;   // Hardware-in-Loop
  regression:     number;
  penTest:        number;   // Cybersec penetration test
  scenarios:      number;   // ADAS scenario simulation (where applicable)
  total:          number;
}

export interface SWModuleCostResult {
  moduleId:           string;
  moduleName:         string;
  category:           SWCategory;
  categoryLabel:      string;
  asilUsed:           ASILLevel;
  complexityUsed:     SWComplexity;
  reuseUsed:          SWReuse;
  personMonths:       number;
  development:        SWDevBreakdown;
  testing:            SWTestingBreakdown;
  integrationCost:    number;
  licensingCost:      number;
  cloudCost:          number;
  cybersecCost:       number;
  maintenanceCost:    number;
  toolchainCost:      number;
  calibrationCost:    number;
  mlDataCost:         number;  // ML dataset / annotation / retraining (0 unless includeMLDataCost + hasMLContent)
  totalNonRecurring:  number;  // NRE (dev + test + integration + tool + cyber + calibration + ML data)
  totalLifecycle:     number;  // maintenance + cloud + IP licensing over program life
  grandTotal:         number;
  perVehicle:         number;
}

export interface SWSummary {
  totalDevelopment:   number;
  totalTesting:       number;
  totalIntegration:   number;
  totalLicensing:     number;
  totalCloud:         number;
  totalCybersecurity: number;
  totalMaintenance:   number;
  totalToolchain:     number;
  totalCalibration:   number;
  totalMLData:        number;  // ML dataset/annotation/retraining across modules
  totalHomologation:  number;  // programme-level R155/R156 + ISO 26262 assessment
  nreTotal:           number;  // dev + test + integration + toolchain + cybersec + calibration + ML data + homologation
  grandTotal:         number;
  totalPersonMonths:  number;
  perVehicle:         number;
  byCategory:         Record<SWCategory, number>;
}

export interface SWSensitivityRow {
  parameter:   string;
  low:         number;
  base:        number;
  high:        number;
  unit:        string;
}

export interface SWPhase {
  name:       string;
  months:     string;
  fraction:   number;   // of NRE total
  nreCost:    number;   // £ from NRE budget
}

export interface SWMonteCarlo {
  p10:            number;   // £ total programme cost
  p50:            number;
  p90:            number;
  mean:           number;
  p10PerVehicle:  number;
  p50PerVehicle:  number;
  p90PerVehicle:  number;
  iterations:     number;
}

export interface SWBenchmark {
  vehicle:     string;
  totalM:      number;   // £M
  perVehicle:  number;   // £
  source:      string;
}

export interface SWProgramResult {
  modules:     SWModuleCostResult[];
  summary:     SWSummary;
  sensitivity: SWSensitivityRow[];
  benchmarks:  SWBenchmark[];
  phases:      SWPhase[];
  monteCarlo:  SWMonteCarlo;
  inputs:      SWProgramInputs;
}

// ─── Multiplier Tables ────────────────────────────────────────────────────────
//
// These are derived from the versioned, sourced rate library (sw-rate-library.ts)
// — the single source of truth. They remain exported as plain numeric maps for
// display and back-compat; a programme can override any of them per engagement
// via SWProgramInputs.rateLibrary (see resolveRates / computeModuleCost).

/** ASIL development overhead multiplier (applied to dev cost) */
export const ASIL_DEV_MULT: Record<ASILLevel, number> = rateValues(DEFAULT_SW_RATE_LIBRARY.asilDevMultipliers);

/** ASIL testing multiplier (testing cost as fraction of adjusted dev cost) */
export const ASIL_TEST_MULT: Record<ASILLevel, number> = rateValues(DEFAULT_SW_RATE_LIBRARY.asilTestMultipliers);

/** Complexity multiplier for algorithm & implementation buckets */
export const COMPLEXITY_MULT: Record<SWComplexity, number> = rateValues(DEFAULT_SW_RATE_LIBRARY.complexityMultipliers);

/** Reuse factor (1.0 = fresh, 0.0 = zero effort) */
export const REUSE_FACTOR: Record<SWReuse, number> = rateValues(DEFAULT_SW_RATE_LIBRARY.reuseFactors);

/** Regional labour rate relative to the UK senior blended base, before overhead. */
export const REGION_MULT: Record<SWRegion, number> = rateValues(DEFAULT_SW_RATE_LIBRARY.regionMultipliers);

/** DevSource quality/overhead multiplier */
export const DEV_SOURCE_MULT: Record<DevSource, number> = rateValues(DEFAULT_SW_RATE_LIBRARY.devSourceMultipliers);

/** Numeric rate bundle resolved once per programme (default library + any override). */
interface ResolvedRates {
  baseRate:       number;
  region:         Record<SWRegion, number>;
  devSource:      Record<DevSource, number>;
  asilDev:        Record<ASILLevel, number>;
  asilTest:       Record<ASILLevel, number>;
  complexity:     Record<SWComplexity, number>;
  reuse:          Record<SWReuse, number>;
}

function resolveRates(prog: SWProgramInputs): ResolvedRates {
  const lib = resolveRateLibrary(prog.rateLibrary);
  // Explicit baseRateGBP (the quick UI override) wins over the library's base.
  const baseRate = prog.baseRateGBP && prog.baseRateGBP > 0 ? prog.baseRateGBP : lib.ukBaseRatePerPM.value;
  return {
    baseRate,
    region:     rateValues(lib.regionMultipliers),
    devSource:  rateValues(lib.devSourceMultipliers),
    asilDev:    rateValues(lib.asilDevMultipliers),
    asilTest:   rateValues(lib.asilTestMultipliers),
    complexity: rateValues(lib.complexityMultipliers),
    reuse:      rateValues(lib.reuseFactors),
  };
}

// ─── Module Database (43 core + 6 premium-optional) ──────────────────────────

export const SW_MODULES: SWModuleDef[] = [
  // ── CATEGORY A: EV Powertrain & Battery ──────────────────────────────────
  {
    id: 'bms_core', name: 'BMS Core Software', shortName: 'BMS Core',
    category: 'A', categoryLabel: 'EV Powertrain & Battery',
    description: 'Battery pack monitoring, protection logic, cell voltage/temp acquisition, state machine management, ASIL-D safety logic.',
    defaultAsil: 'D', defaultComplexity: 'Very High', basePersonMonths: 90,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: true,
    testingFractionBase: 0.40, integrationFractionBase: 0.18, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 52_000, annualIPLicenceGBP: 18_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.08,
    notes: 'ASIL-D per ISO 26262. Vector DaVinci, MATLAB/Simulink TargetLink. Safety-critical gateway. 2–3 yr development cycle.',
  },
  {
    id: 'cell_balancing', name: 'Cell Balancing Algorithms', shortName: 'Cell Balancing',
    category: 'A', categoryLabel: 'EV Powertrain & Battery',
    description: 'Active/passive balancing algorithms, balancing current control, energy routing optimisation.',
    defaultAsil: 'C', defaultComplexity: 'High', basePersonMonths: 20,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.38, integrationFractionBase: 0.12, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 13_000, annualIPLicenceGBP: 6_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.10,
    notes: 'ASIL-C. Tightly coupled to cell chemistry model. Requires HIL bench with actual cells.',
  },
  {
    id: 'soc_soh_soe', name: 'SOC/SOH/SOE Estimation Models', shortName: 'SOC/SOH/SOE',
    category: 'A', categoryLabel: 'EV Powertrain & Battery',
    description: 'Electrochemical & data-driven (ML) State of Charge, Health, Energy estimation. Kalman, EKF, neural network approaches.',
    defaultAsil: 'C', defaultComplexity: 'Very High', basePersonMonths: 42,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: false,
    testingFractionBase: 0.42, integrationFractionBase: 0.14, maintenancePctPerYear: 14,
    annualToolLicenceGBP: 27_000, annualIPLicenceGBP: 22_000, annualCloudCostGBP: 120_000,
    calibrationFractionBase: 0.12,
    notes: 'Proprietary ML models. Cloud training infrastructure. Critical for range display accuracy. Ongoing cloud retraining.',
  },
  {
    id: 'thermal_mgmt', name: 'Battery Thermal Management Software', shortName: 'Thermal Mgmt',
    category: 'A', categoryLabel: 'EV Powertrain & Battery',
    description: 'Thermal control loops, coolant pump/valve actuation, fast-charge thermal preconditioning, cabin integration.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 30,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.35, integrationFractionBase: 0.15, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 18_000, annualIPLicenceGBP: 6_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.10,
    notes: 'ASIL-B. Coupled to HVAC system. Climate chamber HIL essential.',
  },
  {
    id: 'fast_charge', name: 'Fast-Charging Control Software', shortName: 'Fast Charge',
    category: 'A', categoryLabel: 'EV Powertrain & Battery',
    description: 'CCS/CHAdeMO/OCPP protocol stacks, dynamic power curve management, thermal derating during charge.',
    defaultAsil: 'C', defaultComplexity: 'High', basePersonMonths: 25,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.38, integrationFractionBase: 0.14, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 11_000, annualIPLicenceGBP: 14_000, annualCloudCostGBP: 30_000,
    calibrationFractionBase: 0.08,
    notes: 'ASIL-C. ISO 15118 protocol licensing. OCPP backend integration. Charging network API security.',
  },
  {
    id: 'edu_control', name: 'EDU (Electric Drive Unit) Control Software', shortName: 'EDU Control',
    category: 'A', categoryLabel: 'EV Powertrain & Battery',
    description: 'Integrated electric drive unit control, dual-motor torque vectoring, multi-speed gearbox integration, creep & one-pedal drive.',
    defaultAsil: 'D', defaultComplexity: 'Very High', basePersonMonths: 65,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: true,
    testingFractionBase: 0.42, integrationFractionBase: 0.20, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 57_000, annualIPLicenceGBP: 22_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.12,
    notes: 'ASIL-D. Tightly coupled to VCU. Real-time control at <250µs cycle. TargetLink/ASCET required.',
  },
  {
    id: 'inverter_ctrl', name: 'Inverter Control Algorithms', shortName: 'Inverter Ctrl',
    category: 'A', categoryLabel: 'EV Powertrain & Battery',
    description: 'Space Vector PWM, switching frequency optimisation, dead-time compensation, EMI management, demagnetisation protection.',
    defaultAsil: 'D', defaultComplexity: 'Very High', basePersonMonths: 45,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.42, integrationFractionBase: 0.18, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 45_000, annualIPLicenceGBP: 14_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.10,
    notes: 'ASIL-D. FPGA-accelerated control loop. Simulation-first (PLECS/MATLAB Power Systems).',
  },
  {
    id: 'motor_ctrl', name: 'Motor Control (FOC/DTC/SVPWM)', shortName: 'Motor Control',
    category: 'A', categoryLabel: 'EV Powertrain & Battery',
    description: 'Field-oriented control, direct torque control, sensorless rotor position estimation, flux linkage tables, temperature derating.',
    defaultAsil: 'D', defaultComplexity: 'Very High', basePersonMonths: 42,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.42, integrationFractionBase: 0.18, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 42_000, annualIPLicenceGBP: 12_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.12,
    notes: 'ASIL-D. Motor characterisation dyno testing mandatory. Coupled to inverter firmware.',
  },
  {
    id: 'regen_braking', name: 'Regenerative Braking Software', shortName: 'Regen Braking',
    category: 'A', categoryLabel: 'EV Powertrain & Battery',
    description: 'Brake blending control, hydraulic-electric transition, ABS/ESC coordination, one-pedal tuning, driver feel calibration.',
    defaultAsil: 'C', defaultComplexity: 'High', basePersonMonths: 20,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.38, integrationFractionBase: 0.16, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 15_000, annualIPLicenceGBP: 6_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.10,
    notes: 'ASIL-C. Brake blending complexity is high. Requires cold-weather/low-mu testing.',
  },

  // ── CATEGORY B: ADAS L2/L2+ ──────────────────────────────────────────────
  {
    id: 'camera_perception', name: 'Camera Perception Stack', shortName: 'Camera Perception',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'Object detection/classification (DNN), lane detection, traffic sign recognition, free-space estimation, parking vision. Mono + stereo cameras.',
    defaultAsil: 'B', defaultComplexity: 'Very High', basePersonMonths: 130,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.50, integrationFractionBase: 0.20, maintenancePctPerYear: 16,
    annualToolLicenceGBP: 108_000, annualIPLicenceGBP: 160_000, annualCloudCostGBP: 850_000,
    calibrationFractionBase: 0.06,
    notes: 'Largest ADAS component. DNN training on GPU clusters. ASIL-B decomposition. NCAP scenario coverage critical.',
  },
  {
    id: 'radar_processing', name: 'Radar Processing Stack', shortName: 'Radar Proc.',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'FMCW radar DSP, CFAR detection, Doppler processing, angle estimation, object tracking and classification.',
    defaultAsil: 'B', defaultComplexity: 'Very High', basePersonMonths: 60,
    hasMLContent: true, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.45, integrationFractionBase: 0.16, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 54_000, annualIPLicenceGBP: 40_000, annualCloudCostGBP: 80_000,
    calibrationFractionBase: 0.08,
    notes: 'ASIL-B. Requires anechoic chamber + track testing. Multi-target tracking Kalman filter.',
  },
  {
    id: 'ultrasonic', name: 'Ultrasonic Processing Software', shortName: 'Ultrasonic',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'Short-range object detection, parking guidance, cross-traffic alert, time-of-flight processing for 12-16 sensors.',
    defaultAsil: 'B', defaultComplexity: 'Medium', basePersonMonths: 15,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.35, integrationFractionBase: 0.12, maintenancePctPerYear: 8,
    annualToolLicenceGBP: 7_000, annualIPLicenceGBP: 8_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.06,
    notes: 'ASIL-B for AEB trigger path. Relatively mature technology — significant IP available.',
  },
  {
    id: 'sensor_fusion', name: 'Sensor Fusion Engine', shortName: 'Sensor Fusion',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'Multi-modal object fusion (camera + radar + lidar if fitted), probabilistic world model, occupancy grid, track management.',
    defaultAsil: 'C', defaultComplexity: 'Very High', basePersonMonths: 95,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: false,
    testingFractionBase: 0.50, integrationFractionBase: 0.22, maintenancePctPerYear: 16,
    annualToolLicenceGBP: 72_000, annualIPLicenceGBP: 55_000, annualCloudCostGBP: 200_000,
    calibrationFractionBase: 0.08,
    notes: 'ASIL-C. The architectural heart of ADAS. EKF + deep learning hybrid.',
  },
  {
    id: 'path_planning', name: 'Path Planning Algorithms', shortName: 'Path Planning',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'Behaviour prediction, trajectory generation, cost-function optimisation, comfort/safety trade-off. HD map integration where applicable.',
    defaultAsil: 'C', defaultComplexity: 'Very High', basePersonMonths: 80,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: false,
    testingFractionBase: 0.50, integrationFractionBase: 0.20, maintenancePctPerYear: 16,
    annualToolLicenceGBP: 57_000, annualIPLicenceGBP: 50_000, annualCloudCostGBP: 150_000,
    calibrationFractionBase: 0.06,
    notes: 'ASIL-C. Novel research area — simulation-first (CARLA/LGSVL). Scenario coverage >500M virtual km.',
  },
  {
    id: 'control_algos', name: 'Control Algorithms (ACC / LKA / AEB)', shortName: 'ACC/LKA/AEB',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'Longitudinal ACC, lateral LKA, emergency AEB, FCW, emergency steering. Control law design, tuning, gain scheduling.',
    defaultAsil: 'D', defaultComplexity: 'High', basePersonMonths: 65,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.48, integrationFractionBase: 0.18, maintenancePctPerYear: 14,
    annualToolLicenceGBP: 48_000, annualIPLicenceGBP: 22_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.14,
    notes: 'AEB is ASIL-D (brake actuation). LKA/ACC ASIL-C. Regulation: UN-ECE R152/R151/R130.',
  },
  {
    id: 'driver_monitor', name: 'Driver Monitoring Software (DMS)', shortName: 'Driver Monitor',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'Gaze tracking, drowsiness detection, attention estimation, hands-on-wheel detection. IR camera + CNN inference.',
    defaultAsil: 'B', defaultComplexity: 'Very High', basePersonMonths: 55,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.45, integrationFractionBase: 0.16, maintenancePctPerYear: 14,
    annualToolLicenceGBP: 51_000, annualIPLicenceGBP: 90_000, annualCloudCostGBP: 180_000,
    calibrationFractionBase: 0.06,
    notes: 'ASIL-B (alert pathway). GDPR/biometric data handling critical. SmartEye/Seeing Machines IP.',
  },
  {
    id: 'highway_assist', name: 'Highway Assist / Traffic Jam Assist', shortName: 'Highway Assist',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'Combined longitudinal + lateral control for highway driving, hands-off monitoring, lane change assist, automated speed adaptation.',
    defaultAsil: 'C', defaultComplexity: 'Very High', basePersonMonths: 75,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: false,
    testingFractionBase: 0.50, integrationFractionBase: 0.22, maintenancePctPerYear: 16,
    annualToolLicenceGBP: 60_000, annualIPLicenceGBP: 65_000, annualCloudCostGBP: 220_000,
    calibrationFractionBase: 0.10,
    notes: 'ASIL-C. Integrates all ADAS features into L2+ use case. Euro NCAP 2026 mandatory.',
  },

  // ── CATEGORY C: Infotainment, Connectivity & UX ──────────────────────────
  {
    id: 'ivi_os', name: 'IVI Operating System (Android Automotive / QNX)', shortName: 'IVI OS',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: 'Android Automotive OS or QNX BSP integration, platform services, GPU driver optimisation, boot time optimisation, security hardening.',
    defaultAsil: 'QM', defaultComplexity: 'Very High', basePersonMonths: 160,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.35, integrationFractionBase: 0.22, maintenancePctPerYear: 18,
    annualToolLicenceGBP: 168_000, annualIPLicenceGBP: 220_000, annualCloudCostGBP: 120_000,
    calibrationFractionBase: 0.02,
    notes: 'Google AAOS licence fee (~$25/vehicle) or QNX royalty. Boot < 4s target.',
  },
  {
    id: 'navigation', name: 'Navigation Stack', shortName: 'Navigation',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: 'Routing engine, map rendering, offline capability, real-time traffic (HERE/TomTom), EV routing with charge planning.',
    defaultAsil: 'QM', defaultComplexity: 'High', basePersonMonths: 42,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: false,
    testingFractionBase: 0.30, integrationFractionBase: 0.14, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 33_000, annualIPLicenceGBP: 200_000, annualCloudCostGBP: 380_000,
    calibrationFractionBase: 0.02,
    notes: 'Map data licence: HERE ~£8-15/vehicle/yr OR TomTom similar. Real-time traffic API cloud cost significant.',
  },
  {
    id: 'voice_assistant', name: 'Vehicle Voice Assistant', shortName: 'Voice Assistant',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: 'Wake word detection, ASR (on-device + cloud), NLU, TTS, vehicle function control, 3rd-party assistant integration (Alexa/Google).',
    defaultAsil: 'QM', defaultComplexity: 'Very High', basePersonMonths: 65,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.35, integrationFractionBase: 0.18, maintenancePctPerYear: 16,
    annualToolLicenceGBP: 57_000, annualIPLicenceGBP: 220_000, annualCloudCostGBP: 450_000,
    calibrationFractionBase: 0.04,
    notes: 'On-device ASR engines (Cerence, SoundHound) licence ~£15/vehicle. Cloud NLU significant.',
  },
  {
    id: 'tcu_software', name: 'Telematics Control Unit (TCU) Software', shortName: 'TCU Software',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: '5G/LTE modem management, emergency call (eCall), remote diagnostics, remote access, V2X readiness, OBD-II data relay.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 30,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.38, integrationFractionBase: 0.15, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 21_000, annualIPLicenceGBP: 18_000, annualCloudCostGBP: 90_000,
    calibrationFractionBase: 0.04,
    notes: 'eCall path ASIL-B per EU regulation. 3GPP modem certification adds cost.',
  },
  {
    id: 'connectivity_stack', name: 'Bluetooth / WiFi / 5G Connectivity Stack', shortName: 'Connectivity',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: 'BT5.x stack (audio, phone), WiFi 6/6E AP+client, 5G SA/NSA modem driver integration, hotspot management.',
    defaultAsil: 'QM', defaultComplexity: 'High', basePersonMonths: 30,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: true,
    testingFractionBase: 0.30, integrationFractionBase: 0.12, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 24_000, annualIPLicenceGBP: 35_000, annualCloudCostGBP: 20_000,
    calibrationFractionBase: 0.03,
    notes: 'Qualcomm/NXP modem IP licensing. PTCRB/GCF certification. BT SIG licence fees.',
  },
  {
    id: 'hmi_framework', name: 'App Framework & HMI Layer', shortName: 'HMI Framework',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: 'UI framework (Qt/Flutter/React Native Automotive), instrument cluster rendering, haptics, multi-screen management, UX design system.',
    defaultAsil: 'QM', defaultComplexity: 'Very High', basePersonMonths: 85,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.30, integrationFractionBase: 0.15, maintenancePctPerYear: 14,
    annualToolLicenceGBP: 39_000, annualIPLicenceGBP: 90_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.02,
    notes: 'Qt licence ~£90k/yr for automotive. 60fps rendering on large displays.',
  },

  // ── CATEGORY D: Vehicle Domain Controllers ────────────────────────────────
  {
    id: 'body_control', name: 'Body Control Software', shortName: 'Body Control',
    category: 'D', categoryLabel: 'Vehicle Domain Controllers',
    description: 'Lighting control, power windows/mirrors/sunroof, door locks, wiper logic, ambient lighting, comfort features state machines.',
    defaultAsil: 'B', defaultComplexity: 'Medium', basePersonMonths: 45,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.32, integrationFractionBase: 0.14, maintenancePctPerYear: 8,
    annualToolLicenceGBP: 17_000, annualIPLicenceGBP: 10_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.06,
    notes: 'Partially ASIL-B (exterior lighting). High breadth of features. AUTOSAR Classic.',
  },
  {
    id: 'chassis_control', name: 'Chassis Control Software', shortName: 'Chassis Control',
    category: 'D', categoryLabel: 'Vehicle Domain Controllers',
    description: 'Air suspension, CDC (Continuous Damping Control), active anti-roll bars, 4WS (rear steering), hill-hold, terrain modes.',
    defaultAsil: 'C', defaultComplexity: 'High', basePersonMonths: 60,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.40, integrationFractionBase: 0.18, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 33_000, annualIPLicenceGBP: 18_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.14,
    notes: 'ASIL-C (active suspension failure modes). Extensive proving ground calibration.',
  },
  {
    id: 'gateway_ecu', name: 'Gateway ECU Software', shortName: 'Gateway ECU',
    category: 'D', categoryLabel: 'Vehicle Domain Controllers',
    description: 'CAN/LIN/FlexRay/Ethernet routing, signal translation, diagnostic gateway, firewall, network management master.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 28,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: true,
    testingFractionBase: 0.35, integrationFractionBase: 0.16, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 21_000, annualIPLicenceGBP: 12_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.04,
    notes: 'ASIL-B. Security gateway per UN-ECE R155. Vector CANdb++ and autosar tool suite required.',
  },
  {
    id: 'zonal_arch', name: 'Zonal Architecture Software', shortName: 'Zonal Arch.',
    category: 'D', categoryLabel: 'Vehicle Domain Controllers',
    description: 'Zone controller software, power distribution management, ECU consolidation logic, 100BASE-T1 Ethernet backbone management.',
    defaultAsil: 'B', defaultComplexity: 'Very High', basePersonMonths: 65,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: true,
    testingFractionBase: 0.38, integrationFractionBase: 0.20, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 45_000, annualIPLicenceGBP: 22_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.05,
    notes: 'Cutting-edge architecture (BMW NCA, Mercedes MBOSx). AUTOSAR Adaptive.',
  },
  {
    id: 'vehicle_motion', name: 'Vehicle Motion Management (VMM)', shortName: 'VMM',
    category: 'D', categoryLabel: 'Vehicle Domain Controllers',
    description: 'Unified torque arbitration, coordinated chassis & propulsion control, stability control, oversteer/understeer management, tyre model.',
    defaultAsil: 'C', defaultComplexity: 'Very High', basePersonMonths: 80,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.45, integrationFractionBase: 0.22, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 54_000, annualIPLicenceGBP: 28_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.16,
    notes: 'ASIL-C. The "software chassis". MBD mandatory. Pacejka/MF-Tyre model IP.',
  },

  // ── CATEGORY E: Middleware & Platform ────────────────────────────────────
  {
    id: 'autosar_classic', name: 'AUTOSAR Classic BSW & Integration', shortName: 'AUTOSAR Classic',
    category: 'E', categoryLabel: 'Middleware & Platform',
    description: 'AUTOSAR Classic BSW configuration (Vector DaVinci, ETAS ISOLAR), OS (OSEK/VDX), COM stack, run-time environment (RTE) integration.',
    defaultAsil: 'C', defaultComplexity: 'High', basePersonMonths: 45,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.35, integrationFractionBase: 0.20, maintenancePctPerYear: 8,
    annualToolLicenceGBP: 132_000, annualIPLicenceGBP: 130_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.04,
    notes: 'Vector DaVinci + EB tresos stack royalty. Mainly integration work. High toolchain cost dominates.',
  },
  {
    id: 'autosar_adaptive', name: 'AUTOSAR Adaptive Platform', shortName: 'AUTOSAR Adaptive',
    category: 'E', categoryLabel: 'Middleware & Platform',
    description: 'ara::com service-oriented communication, execution management, update management (UCM), PHM, crypto API, DDS integration.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 60,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.38, integrationFractionBase: 0.22, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 108_000, annualIPLicenceGBP: 110_000, annualCloudCostGBP: 30_000,
    calibrationFractionBase: 0.04,
    notes: 'Vector MICROSAR Adaptive or EB corbos. Growing importance with zonal E/E.',
  },
  {
    id: 'rtos', name: 'RTOS & OS Porting', shortName: 'RTOS',
    category: 'E', categoryLabel: 'Middleware & Platform',
    description: 'OSEK/VDX, FreeRTOS, or commercial RTOS BSP integration, task scheduling optimisation, interrupt management, memory protection.',
    defaultAsil: 'C', defaultComplexity: 'Medium', basePersonMonths: 12,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.35, integrationFractionBase: 0.14, maintenancePctPerYear: 6,
    annualToolLicenceGBP: 27_000, annualIPLicenceGBP: 35_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.03,
    notes: 'Mostly licensed (ETAS, QNX, Green Hills). Internal effort mainly BSP porting and configuration.',
  },
  {
    id: 'diagnostics', name: 'Diagnostics (UDS / OBD-II)', shortName: 'Diagnostics',
    category: 'E', categoryLabel: 'Middleware & Platform',
    description: 'UDS (ISO 14229), OBD-II (SAE J1979), DTC definition, diagnostic service implementation, DEXT generation, coding routines.',
    defaultAsil: 'A', defaultComplexity: 'Medium', basePersonMonths: 25,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: false,
    testingFractionBase: 0.30, integrationFractionBase: 0.14, maintenancePctPerYear: 8,
    annualToolLicenceGBP: 18_000, annualIPLicenceGBP: 16_000, annualCloudCostGBP: 25_000,
    calibrationFractionBase: 0.05,
    notes: 'ISO 14229 mandatory. CANoe (Vector) for all diagnostic testing. ODX/PDXF toolchain.',
  },
  {
    id: 'comm_stacks', name: 'CAN / LIN / FlexRay / Ethernet Communication Stacks', shortName: 'Comm. Stacks',
    category: 'E', categoryLabel: 'Middleware & Platform',
    description: 'AUTOSAR ComStack configuration, CAN-XL support, Automotive Ethernet (10/100BASE-T1), signal routing, PDU mapping, SOME/IP.',
    defaultAsil: 'B', defaultComplexity: 'Medium', basePersonMonths: 20,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.30, integrationFractionBase: 0.14, maintenancePctPerYear: 8,
    annualToolLicenceGBP: 30_000, annualIPLicenceGBP: 22_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.03,
    notes: 'Mainly AUTOSAR configuration (Vector DaVinci NetworkDesigner). SOME/IP middleware growing.',
  },
  {
    id: 'time_sync', name: 'Time Synchronisation & Network Management', shortName: 'Time Sync / NM',
    category: 'E', categoryLabel: 'Middleware & Platform',
    description: 'gPTP (IEEE 802.1AS) for Ethernet time sync, CAN NM master, sleep/wake management, partial networking.',
    defaultAsil: 'A', defaultComplexity: 'Low', basePersonMonths: 14,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.28, integrationFractionBase: 0.12, maintenancePctPerYear: 6,
    annualToolLicenceGBP: 11_000, annualIPLicenceGBP: 6_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.03,
    notes: 'Critical for sensor fusion temporal alignment. AUTOSAR NM fully handled by BSW.',
  },

  // ── CATEGORY F: Cybersecurity ─────────────────────────────────────────────
  {
    id: 'secure_boot', name: 'Secure Boot & Root of Trust', shortName: 'Secure Boot',
    category: 'F', categoryLabel: 'Cybersecurity (ISO 21434)',
    description: 'Hardware Security Module (HSM) integration, key provisioning, boot chain verification, anti-rollback, attestation.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 20,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.45, integrationFractionBase: 0.20, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 24_000, annualIPLicenceGBP: 22_000, annualCloudCostGBP: 45_000,
    calibrationFractionBase: 0.04,
    notes: 'UN-ECE R155 mandatory. NXP/Infineon HSM IP. Key injection in production.',
  },
  {
    id: 'encryption', name: 'Encryption Modules & Crypto Stack', shortName: 'Encryption',
    category: 'F', categoryLabel: 'Cybersecurity (ISO 21434)',
    description: 'AES-256, RSA-2048, ECC, TLS 1.3 for V2X/cloud, AUTOSAR Crypto Stack, hardware crypto acceleration.',
    defaultAsil: 'B', defaultComplexity: 'Medium', basePersonMonths: 15,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: true,
    testingFractionBase: 0.40, integrationFractionBase: 0.14, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 15_000, annualIPLicenceGBP: 16_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.03,
    notes: 'Wolfssl/mbedTLS licence. AUTOSAR CSM configuration. Quantum-safe migration roadmap.',
  },
  {
    id: 'ids', name: 'Intrusion Detection System (IDS)', shortName: 'IDS / IDPS',
    category: 'F', categoryLabel: 'Cybersecurity (ISO 21434)',
    description: 'In-vehicle network anomaly detection, CAN message monitoring, rate-limiting, VSOC integration, event reporting to cloud.',
    defaultAsil: 'QM', defaultComplexity: 'High', basePersonMonths: 28,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.42, integrationFractionBase: 0.18, maintenancePctPerYear: 16,
    annualToolLicenceGBP: 33_000, annualIPLicenceGBP: 45_000, annualCloudCostGBP: 90_000,
    calibrationFractionBase: 0.05,
    notes: 'UN-ECE R155 triage requirement. ARGUS/Upstream/GuardKnox IP options.',
  },
  {
    id: 'secure_ota', name: 'Secure OTA Software Update Framework', shortName: 'Secure OTA',
    category: 'F', categoryLabel: 'Cybersecurity (ISO 21434)',
    description: 'Delta update generation, signature verification, rollback protection, update orchestration, bandwidth management.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 20,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.40, integrationFractionBase: 0.18, maintenancePctPerYear: 14,
    annualToolLicenceGBP: 30_000, annualIPLicenceGBP: 35_000, annualCloudCostGBP: 120_000,
    calibrationFractionBase: 0.04,
    notes: 'Integrated with AUTOSAR UCM. Excelfore/Airbiquity delta compression IP.',
  },
  {
    id: 'key_mgmt', name: 'Key Management System', shortName: 'Key Management',
    category: 'F', categoryLabel: 'Cybersecurity (ISO 21434)',
    description: 'Certificate lifecycle management, PKI integration, key derivation, secure key storage, provisioning infrastructure.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 15,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.40, integrationFractionBase: 0.14, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 21_000, annualIPLicenceGBP: 28_000, annualCloudCostGBP: 80_000,
    calibrationFractionBase: 0.04,
    notes: 'PKI infrastructure cloud-hosted. Certificate provisioning at end-of-line (EoL).',
  },

  // ── CATEGORY G: OTA & Cloud Backend ──────────────────────────────────────
  {
    id: 'ota_manager', name: 'OTA Update Manager (Vehicle-side)', shortName: 'OTA Manager',
    category: 'G', categoryLabel: 'OTA & Cloud Backend',
    description: 'Vehicle-side update campaign execution, ECU coordination, rollback, consent management, network condition handling.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 30,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.38, integrationFractionBase: 0.18, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 24_000, annualIPLicenceGBP: 55_000, annualCloudCostGBP: 180_000,
    calibrationFractionBase: 0.04,
    notes: 'AUTOSAR UCM Adapter. Must handle fleet-wide rollout with A/B validation.',
  },
  {
    id: 'cloud_backend', name: 'Cloud Backend Services', shortName: 'Cloud Backend',
    category: 'G', categoryLabel: 'OTA & Cloud Backend',
    description: 'Vehicle connectivity backend, API gateway, device shadow, remote command, data lake, microservices architecture (AWS/Azure/GCP).',
    defaultAsil: 'QM', defaultComplexity: 'Very High', basePersonMonths: 65,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.32, integrationFractionBase: 0.16, maintenancePctPerYear: 20,
    annualToolLicenceGBP: 48_000, annualIPLicenceGBP: 130_000, annualCloudCostGBP: 1_200_000,
    calibrationFractionBase: 0.03,
    notes: 'Largest cloud cost. Scales with fleet size. AWS IoT Core / Azure IoT Hub.',
  },
  {
    id: 'data_pipeline', name: 'Data Pipeline & Telemetry', shortName: 'Data Pipeline',
    category: 'G', categoryLabel: 'OTA & Cloud Backend',
    description: 'In-vehicle data collection agent, edge pre-processing, telemetry streaming, data lake ingestion, GDPR/data governance.',
    defaultAsil: 'QM', defaultComplexity: 'High', basePersonMonths: 30,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.30, integrationFractionBase: 0.14, maintenancePctPerYear: 14,
    annualToolLicenceGBP: 27_000, annualIPLicenceGBP: 65_000, annualCloudCostGBP: 320_000,
    calibrationFractionBase: 0.04,
    notes: 'GDPR consent management. Apache Kafka / Kinesis streaming.',
  },
  {
    id: 'fleet_mgmt', name: 'Fleet Management & Analytics Software', shortName: 'Fleet Mgmt',
    category: 'G', categoryLabel: 'OTA & Cloud Backend',
    description: 'Fleet health dashboard, predictive maintenance, usage analytics, dealer portal, subscription management, over-the-air campaign tools.',
    defaultAsil: 'QM', defaultComplexity: 'Medium', basePersonMonths: 20,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: false,
    testingFractionBase: 0.28, integrationFractionBase: 0.12, maintenancePctPerYear: 16,
    annualToolLicenceGBP: 18_000, annualIPLicenceGBP: 45_000, annualCloudCostGBP: 200_000,
    calibrationFractionBase: 0.03,
    notes: 'SaaS platform option (Bright Box, Verizon Connect) vs in-house. Dealer portal API licensing.',
  },

  // ── PREMIUM / FLAGSHIP-TRIM OPTIONS ───────────────────────────────────────
  // Itemised software that flagship trims fund as distinct workstreams but that
  // base vehicles fold into the generic domain buckets (chassis/body/HMI). These
  // default to OFF so the validated 43-module baseline is unchanged; the vehicle
  // demos and any premium programme switch them on. Categories reuse B/C/D so the
  // UI groups them under the existing domain headers.
  {
    id: 'active_suspension', name: 'Predictive Active Suspension & Body Control', shortName: 'Active Body Ctrl',
    category: 'D', categoryLabel: 'Vehicle Domain Controllers',
    description: 'Camera-fed road-surface preview, 48V active anti-roll / active body control (e.g. Mercedes E-Active Body Control, BMW Executive Drive Pro, JLR Dynamic Response Pro), coordinated air-spring + adaptive-damper + rear-axle-steer control on top of baseline chassis control.',
    defaultAsil: 'C', defaultComplexity: 'Very High', basePersonMonths: 42,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.44, integrationFractionBase: 0.20, maintenancePctPerYear: 11,
    annualToolLicenceGBP: 34_000, annualIPLicenceGBP: 16_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.16,
    defaultEnabled: false,
    notes: 'Premium-trim increment over chassis_control. Heavy proving-ground ride/handling calibration. ASIL-C.',
  },
  {
    id: 'premium_audio', name: 'Premium Audio DSP & Active Noise Control', shortName: 'Premium Audio/ANC',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: 'Branded 3D surround tuning (Meridian / Bowers & Wilkins / Bang & Olufsen / Burmester), active road/engine noise cancellation (ANC/RNC), active sound design, per-cabin acoustic calibration.',
    defaultAsil: 'QM', defaultComplexity: 'High', basePersonMonths: 28,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.28, integrationFractionBase: 0.12, maintenancePctPerYear: 7,
    annualToolLicenceGBP: 20_000, annualIPLicenceGBP: 42_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.12,
    defaultEnabled: false,
    notes: 'Branded-audio DSP royalty (Dirac/Klippel toolchain). Per-model cabin acoustic tuning dominates effort.',
  },
  {
    id: 'park_assist', name: 'Automated Parking & Surround-View', shortName: 'Auto Park/360',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'Automated parking assist (APA), remote/summon parking (RPA), 360° surround-view stitching, parking-slot detection, low-speed manoeuvre planning fusing ultrasonic + cameras.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 48,
    hasMLContent: true, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.40, integrationFractionBase: 0.18, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 30_000, annualIPLicenceGBP: 12_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.10,
    defaultEnabled: false,
    notes: 'Slot-detection CNN (ML). Extensive parking-scenario validation. ASIL-B (low-speed manoeuvring).',
  },
  {
    id: 'climate_control', name: 'Climate & Thermal Comfort Control', shortName: 'Climate/HVAC',
    category: 'D', categoryLabel: 'Vehicle Domain Controllers',
    description: 'Multi-zone HVAC control, heat-pump coordination, cabin air purification/ionisation, pre-conditioning, humidity & fogging management, seat/steering-wheel comfort thermal loops.',
    defaultAsil: 'A', defaultComplexity: 'Medium', basePersonMonths: 26,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.30, integrationFractionBase: 0.12, maintenancePctPerYear: 8,
    annualToolLicenceGBP: 15_000, annualIPLicenceGBP: 6_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.08,
    defaultEnabled: false,
    notes: 'Cabin-comfort software split out of body_control on premium multizone systems. Thermal calibration effort.',
  },
  {
    id: 'digital_key', name: 'Digital Key (UWB/BLE) & Secure Access', shortName: 'Digital Key',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: 'CCC Digital Key 3.0 phone-as-key, UWB ranging & relay-attack protection, BLE fallback, secure-element / HSM integration, key sharing & cloud provisioning backend.',
    defaultAsil: 'QM', defaultComplexity: 'High', basePersonMonths: 22,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.32, integrationFractionBase: 0.14, maintenancePctPerYear: 9,
    annualToolLicenceGBP: 15_000, annualIPLicenceGBP: 20_000, annualCloudCostGBP: 30_000,
    calibrationFractionBase: 0.03,
    defaultEnabled: false,
    notes: 'CCC consortium membership + UWB IP. Cybersecurity-critical (relay attacks). Cloud key provisioning.',
  },
  {
    id: 'ar_hud', name: 'AR Head-Up Display & AR Navigation', shortName: 'AR-HUD',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: 'Augmented-reality head-up display compositor, sensor-registered navigation/ADAS overlays, optical distortion correction, graphics rendering pipeline for the AR-HUD projector.',
    defaultAsil: 'A', defaultComplexity: 'High', basePersonMonths: 30,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.32, integrationFractionBase: 0.14, maintenancePctPerYear: 9,
    annualToolLicenceGBP: 22_000, annualIPLicenceGBP: 18_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.10,
    defaultEnabled: false,
    notes: 'AR engine licence (e.g. WayRay/Envisics). Optical registration & distortion calibration. ASIL-A (driver-facing overlay).',
  },
];

// ─── Cost Calculation Engine ──────────────────────────────────────────────────

// ─── Model-tuning constants (calibrated against the sw-validation back-test) ──
/** Mean per-module testingFractionBase — re-bases the ASIL test scale so reviving
 *  the per-module fraction (SW1) is neutral on the average module. */
const TEST_INTENSITY_REF = 0.38;
/** Fraction of the complexity delta also carried by the implementation bucket
 *  (SW2). 0 = old algorithm-only behaviour; Medium (complexity=1) is always neutral. */
const IMPL_COMPLEXITY_WEIGHT = 0.15;
/** Safety/verification effort resists reuse: the reuse factor applied to the
 *  safety bucket cannot fall below this floor by ASIL (SW3) — reused ASIL-C/D
 *  code still needs re-verification/qualification. QM/A unaffected. */
const SAFETY_REUSE_FLOOR: Record<ASILLevel, number> = { QM: 0, A: 0, B: 0.40, C: 0.50, D: 0.60 };
/** ML dataset acquisition/annotation/retraining as a fraction of dev, per ML
 *  module, over the programme (only when includeMLDataCost). */
const ML_DATA_FRACTION = 0.15;
/** Schedule-compression effort penalty slope (Brooks/COCOMO SCED). */
const SCHEDULE_COMPRESSION_K = 1.5;

function computeModuleCost(
  def:    SWModuleDef,
  input:  SWModuleInput,
  prog:   SWProgramInputs,
  rates:  ResolvedRates
): SWModuleCostResult {
  const seniorMult  = prog.teamSeniorFraction * 1.20 + (1 - prog.teamSeniorFraction) * 0.75;
  const regionRate  = rates.baseRate * rates.region[prog.region] * rates.devSource[prog.devSource]
                      * seniorMult * prog.overheadMultiplier;

  const asilDev    = rates.asilDev[input.asil];
  const complexity = rates.complexity[input.complexity];
  const reuse      = rates.reuse[input.reuse];
  // SW1: per-module test intensity honoured, scaled by ASIL and re-based so the
  // mean module (testingFractionBase = TEST_INTENSITY_REF) reproduces the old value.
  const testFrac   = def.testingFractionBase * (rates.asilTest[input.asil] / TEST_INTENSITY_REF);

  // SW3: safety bucket resists reuse — floor the reuse it sees, then scale the
  // 0.15 safety slice up relative to the dev reuse (neutral when reuse ≥ floor,
  // e.g. Medium reuse 0.60 at ASIL-D floor 0.60 → scale 1.0).
  const safetyReuse   = Math.max(reuse, SAFETY_REUSE_FLOOR[input.asil]);
  const safetyScale   = reuse > 0 ? safetyReuse / reuse : 1;

  // SW-schedule: compressing the timeline below nominal inflates effort.
  const sched         = prog.scheduleCompression && prog.scheduleCompression > 0 ? prog.scheduleCompression : 1;
  const schedPenalty  = sched >= 1 ? 1 : 1 + (1 - sched) * SCHEDULE_COMPRESSION_K;

  const effectivePM = (input.customPersonMonths ?? def.basePersonMonths) * reuse;

  // Development sub-buckets. Complexity on the algorithm bucket in full, and a
  // weighted share on implementation (SW2). Safety bucket carries the reuse floor.
  const devPM    = effectivePM * asilDev;
  const implComplexity = 1 + (complexity - 1) * IMPL_COMPLEXITY_WEIGHT;
  const reqsPM   = devPM * 0.12;
  const archPM   = devPM * 0.14;
  const algoPM   = devPM * 0.22 * complexity;
  const implPM   = devPM * 0.37 * implComplexity;
  const safetyPM = devPM * 0.15 * safetyScale;

  const effortRate = regionRate * schedPenalty;
  const reqs   = reqsPM   * effortRate;
  const arch   = archPM   * effortRate;
  const algo   = algoPM   * effortRate;
  const impl   = implPM   * effortRate;
  const safety = safetyPM * effortRate;
  const devTotal = reqs + arch + algo + impl + safety;

  // Testing breakdown — HIL absorbs residual to ensure fractions sum exactly.
  const testTotal  = devTotal * testFrac;
  let   silFrac    = 0.30;
  let   milFrac    = def.hasMLContent ? 0.18 : 0.08;
  let   regFrac    = 0.10;
  let   penFrac    = def.hasCybersecRequirement ? 0.08 : 0;
  let   scenFrac   = def.category === 'B' ? 0.09 : 0;
  const fixedSum   = silFrac + milFrac + regFrac + penFrac + scenFrac;
  // If the fixed sub-buckets ever exceed the whole, normalise them down so the
  // breakdown still sums to testTotal (HIL = 0) instead of silently overshooting.
  if (fixedSum > 1) {
    silFrac /= fixedSum; milFrac /= fixedSum; regFrac /= fixedSum;
    penFrac /= fixedSum; scenFrac /= fixedSum;
  }
  const hilFrac = Math.max(0, 1 - silFrac - milFrac - regFrac - penFrac - scenFrac);

  const silCost  = testTotal * silFrac;
  const milCost  = testTotal * milFrac;
  const regCost  = testTotal * regFrac;
  const penCost  = testTotal * penFrac;
  const scenCost = testTotal * scenFrac;
  const hilCost  = testTotal * hilFrac;

  const integration = devTotal * def.integrationFractionBase;

  const cybersecPct = def.hasCybersecRequirement
    ? (input.asil === 'D' ? 0.14 : input.asil === 'C' ? 0.10 : 0.08) : 0;
  const cybersec    = devTotal * cybersecPct;

  // Physical/model calibration effort (dyno runs, proving ground, model fitting)
  const calibration = devTotal * def.calibrationFractionBase;

  // ML dataset acquisition / annotation / continuous retraining (opt-in).
  const mlDataCost = (prog.includeMLDataCost && def.hasMLContent)
    ? devTotal * ML_DATA_FRACTION : 0;

  // Multi-year cost pools. NPV factor Σ 1/(1+r)^t discounts spread costs; r=0
  // reproduces the flat "annual × years" baseline exactly.
  const years    = prog.programLifeYears;
  const r        = (prog.discountRatePct ?? 0) / 100;
  let   pvFactor = years;
  if (r > 0) { pvFactor = 0; for (let t = 1; t <= years; t++) pvFactor += 1 / Math.pow(1 + r, t); }

  const toolchain   = def.annualToolLicenceGBP * pvFactor;
  const licensing   = def.annualIPLicenceGBP   * pvFactor;
  const cloudCost   = prog.includeCloudCost
    ? def.annualCloudCostGBP * pvFactor : 0;
  const maintenance = prog.includeMaintenanceCost
    ? devTotal * (def.maintenancePctPerYear / 100) * pvFactor : 0;

  const totalNRE      = devTotal + testTotal + integration + toolchain + cybersec + calibration + mlDataCost;
  const totalLifecycle = maintenance + cloudCost + licensing;
  const grandTotal     = totalNRE + totalLifecycle;

  // Per-vehicle: NRE recovered over the (short) recovery window, ongoing lifecycle
  // spread over full life. Default recoveryYears = life reproduces the old figure.
  const recoveryYears = Math.max(1, prog.costRecoveryYears ?? years);
  const nreVehicles   = prog.annualProductionVolume * recoveryYears;
  const lifeVehicles  = prog.annualProductionVolume * years;
  const perVehicle    = (nreVehicles > 0 ? totalNRE / nreVehicles : 0)
                      + (lifeVehicles > 0 ? totalLifecycle / lifeVehicles : 0);

  return {
    moduleId:       def.id,
    moduleName:     def.name,
    category:       def.category,
    categoryLabel:  def.categoryLabel,
    asilUsed:       input.asil,
    complexityUsed: input.complexity,
    reuseUsed:      input.reuse,
    personMonths:   Math.round(devPM * 10) / 10,
    development:    { requirements: reqs, architecture: arch, algorithmDev: algo, implementation: impl, safetyCompliance: safety, total: devTotal },
    testing:        { sil: silCost, mil: milCost, hil: hilCost, regression: regCost, penTest: penCost, scenarios: scenCost, total: testTotal },
    integrationCost:  integration,
    licensingCost:    licensing,
    cloudCost,
    cybersecCost:     cybersec,
    maintenanceCost:  maintenance,
    toolchainCost:    toolchain,
    calibrationCost:  calibration,
    mlDataCost,
    totalNonRecurring: totalNRE,
    totalLifecycle,
    grandTotal,
    perVehicle,
  };
}

// ─── Monte Carlo simulation ───────────────────────────────────────────────────

/**
 * Fraction of each bucket's uncertainty that is systemic (programme-wide) rather
 * than idiosyncratic. Real overruns are correlated — a programme that slips
 * schedule inflates development, testing AND integration together — so a pure
 * independent-sum model understates the tail. We blend a single shared draw
 * across all buckets with per-bucket draws at this weight.
 */
const MC_CORRELATION = 0.55;

function runMonteCarlo(prog: SWProgramInputs, s: SWSummary, iterations = 1000): SWMonteCarlo {
  // Triangular distribution sampler
  function tri(a: number, m: number, b: number): number {
    const u = Math.random();
    const Fc = (m - a) / (b - a);
    if (u < Fc) return a + Math.sqrt(u * (b - a) * (m - a));
    return b - Math.sqrt((1 - u) * (b - a) * (b - m));
  }

  const rho = MC_CORRELATION;
  // Each bucket's effective multiplier = rho·(shared programme swing) +
  // (1-rho)·(bucket-specific swing). The shared draw is mapped onto each
  // bucket's own min/max so correlation widens the tail without distorting
  // any single bucket's range.
  const lerp = (lo: number, hi: number, t: number) => lo + (hi - lo) * t;
  const buckets: Array<[number, number, number, number]> = [
    // [value, low, mode, high]
    [s.totalDevelopment,   0.70, 1.00, 1.40],
    [s.totalTesting,       0.75, 1.00, 1.35],
    [s.totalIntegration,   0.70, 1.00, 1.40],
    [s.totalToolchain,     0.85, 1.00, 1.25],
    [s.totalCybersecurity, 0.65, 1.00, 1.50],
    [s.totalCalibration,   0.70, 1.00, 1.50],
    [s.totalMaintenance,   0.75, 1.00, 1.35],
    [s.totalCloud,         0.50, 1.00, 1.60],
    [s.totalLicensing,     0.80, 1.00, 1.30],
  ];

  const totals: number[] = [];
  for (let i = 0; i < iterations; i++) {
    // One shared programme-wide percentile draw (0..1) reused across buckets.
    const sharedQ = Math.random();
    let total = 0;
    for (const [val, lo, mode, hi] of buckets) {
      // Map the shared quantile onto this bucket's triangular range.
      const Fc = (mode - lo) / (hi - lo);
      const shared = sharedQ < Fc
        ? lo + Math.sqrt(sharedQ * (hi - lo) * (mode - lo))
        : hi - Math.sqrt((1 - sharedQ) * (hi - lo) * (hi - mode));
      const idio = tri(lo, mode, hi);
      total += val * lerp(idio, shared, rho);
    }
    totals.push(total);
  }
  totals.sort((a, b) => a - b);

  const n = totals.length;
  const vehicles = prog.annualProductionVolume * prog.programLifeYears;
  const pv = (t: number) => vehicles > 0 ? t / vehicles : 0;

  return {
    p10:           totals[Math.floor(n * 0.10)],
    p50:           totals[Math.floor(n * 0.50)],
    p90:           totals[Math.floor(n * 0.90)],
    mean:          totals.reduce((a, b) => a + b, 0) / n,
    p10PerVehicle: pv(totals[Math.floor(n * 0.10)]),
    p50PerVehicle: pv(totals[Math.floor(n * 0.50)]),
    p90PerVehicle: pv(totals[Math.floor(n * 0.90)]),
    iterations:    n,
  };
}

// ─── Programme Phases ─────────────────────────────────────────────────────────

function buildPhases(nreTotal: number): SWPhase[] {
  return [
    { name: 'Feasibility',            months: 'M1–M6',    fraction: 0.05, nreCost: nreTotal * 0.05 },
    { name: 'Concept / Architecture', months: 'M7–M18',   fraction: 0.15, nreCost: nreTotal * 0.15 },
    { name: 'Series Development',     months: 'M19–M54',  fraction: 0.50, nreCost: nreTotal * 0.50 },
    { name: 'Validation & V&V',       months: 'M55–M78',  fraction: 0.20, nreCost: nreTotal * 0.20 },
    { name: 'Ramp / SOP',             months: 'M79–M90',  fraction: 0.10, nreCost: nreTotal * 0.10 },
  ];
}

// ─── Main Programme Calculator ────────────────────────────────────────────────

const EMPTY_MC: SWMonteCarlo = {
  p10: 0, p50: 0, p90: 0, mean: 0,
  p10PerVehicle: 0, p50PerVehicle: 0, p90PerVehicle: 0, iterations: 0,
};

export function computeSWProgram(
  prog: SWProgramInputs,
  opts: { summaryOnly?: boolean } = {},
): SWProgramResult {
  const rates = resolveRates(prog);
  const enabledModules = prog.modules.filter(m => m.enabled);
  const modules: SWModuleCostResult[] = enabledModules.map(m => {
    const def = SW_MODULES.find(d => d.id === m.moduleId)!;
    return computeModuleCost(def, m, prog, rates);
  });

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

  // Programme-level homologation / compliance (opt-in): UNECE R155 CSMS audit +
  // R156 SUMS audit + external ISO 26262 functional-safety assessment. Scaled up
  // when the programme carries ASIL-D content. Default off → 0 (baseline neutral).
  const hasASILD = modules.some(m => m.asilUsed === 'D');
  const homologation = prog.includeHomologation
    ? (1_500_000 /* R155 CSMS */ + 800_000 /* R156 SUMS */ + (hasASILD ? 600_000 : 250_000) /* ISO26262 assessor */)
    : 0;

  const summary: SWSummary = {
    totalDevelopment:   sum(modules.map(m => m.development.total)),
    totalTesting:       sum(modules.map(m => m.testing.total)),
    totalIntegration:   sum(modules.map(m => m.integrationCost)),
    totalLicensing:     sum(modules.map(m => m.licensingCost)),
    totalCloud:         sum(modules.map(m => m.cloudCost)),
    totalCybersecurity: sum(modules.map(m => m.cybersecCost)),
    totalMaintenance:   sum(modules.map(m => m.maintenanceCost)),
    totalToolchain:     sum(modules.map(m => m.toolchainCost)),
    totalCalibration:   sum(modules.map(m => m.calibrationCost)),
    totalMLData:        sum(modules.map(m => m.mlDataCost)),
    totalHomologation:  homologation,
    nreTotal:           0,
    grandTotal:         sum(modules.map(m => m.grandTotal)) + homologation,
    totalPersonMonths:  sum(modules.map(m => m.personMonths)),
    perVehicle:         0,
    byCategory:         {} as Record<SWCategory, number>,
  };
  summary.nreTotal = summary.totalDevelopment + summary.totalTesting + summary.totalIntegration
                   + summary.totalToolchain + summary.totalCybersecurity + summary.totalCalibration
                   + summary.totalMLData + summary.totalHomologation;
  // Per-vehicle: NRE over the recovery window, lifecycle over full life (mirrors
  // the per-module split). Default costRecoveryYears = life reproduces the old figure.
  const totalLifecycle = summary.totalMaintenance + summary.totalCloud + summary.totalLicensing;
  const recoveryYears  = Math.max(1, prog.costRecoveryYears ?? prog.programLifeYears);
  const nreVehicles    = prog.annualProductionVolume * recoveryYears;
  const lifeVehicles   = prog.annualProductionVolume * prog.programLifeYears;
  summary.perVehicle = (nreVehicles > 0 ? summary.nreTotal / nreVehicles : 0)
                     + (lifeVehicles > 0 ? totalLifecycle / lifeVehicles : 0);

  for (const cat of ['A','B','C','D','E','F','G'] as SWCategory[]) {
    summary.byCategory[cat] = sum(modules.filter(m => m.category === cat).map(m => m.grandTotal));
  }

  // When invoked for a sensitivity recompute we only need the summary totals.
  // Skip the (expensive, and otherwise infinitely-recursive) sensitivity /
  // Monte Carlo / phase / benchmark build-out.
  if (opts.summaryOnly) {
    return { modules, summary, sensitivity: [], benchmarks: [], phases: [], monteCarlo: EMPTY_MC, inputs: prog };
  }

  // Sensitivity analysis
  const sensitivity: SWSensitivityRow[] = [
    {
      parameter: 'ASIL Level (all modules: D vs B)',
      low:  _recomputeTotal(prog, { asilOverride: 'B' }),
      base: summary.grandTotal,
      high: _recomputeTotal(prog, { asilOverride: 'D' }),
      unit: '£M',
    },
    {
      parameter: 'Complexity (all modules: Medium vs Very High)',
      low:  _recomputeTotal(prog, { complexityOverride: 'Medium' }),
      base: summary.grandTotal,
      high: _recomputeTotal(prog, { complexityOverride: 'Very High' }),
      unit: '£M',
    },
    {
      parameter: 'Reuse Level (Heavy vs Fresh)',
      low:  _recomputeTotal(prog, { reuseOverride: 'Heavy' }),
      base: summary.grandTotal,
      high: _recomputeTotal(prog, { reuseOverride: 'Fresh' }),
      unit: '£M',
    },
    {
      parameter: 'Region (India vs USA Silicon Valley)',
      low:  _recomputeTotal(prog, { regionOverride: 'India' }),
      base: summary.grandTotal,
      high: _recomputeTotal(prog, { regionOverride: 'USA_SV' }),
      unit: '£M',
    },
    {
      parameter: 'Program Life (8 vs 14 years)',
      low:  _recomputeTotal(prog, { lifeOverride: 8 }),
      base: summary.grandTotal,
      high: _recomputeTotal(prog, { lifeOverride: 14 }),
      unit: '£M',
    },
    {
      parameter: 'Production Volume (150k vs 50k units/yr, per-vehicle)',
      low:  summary.grandTotal / Math.max(1, 150_000 * prog.programLifeYears),
      base: summary.perVehicle,
      high: summary.grandTotal / Math.max(1, 50_000 * prog.programLifeYears),
      unit: '£/vehicle',
    },
  ];

  const benchmarks: SWBenchmark[] = [
    { vehicle: 'BMW iX (2021–2026)',            totalM: 620,  perVehicle: 4_800, source: 'Berylls Strategy Advisors estimate, 2023' },
    { vehicle: 'Porsche Taycan (2019–2024)',    totalM: 480,  perVehicle: 5_200, source: 'SBD Automotive teardown + SW analysis' },
    { vehicle: 'Mercedes EQS (2021–2026)',      totalM: 710,  perVehicle: 5_500, source: 'McKinsey Future of Software in Automotive, 2022' },
    { vehicle: 'Range Rover (L460, 2022–2027)', totalM: 390,  perVehicle: 3_800, source: 'JLR investor reports + industry est.' },
    { vehicle: 'Tesla Model S (Gen 3 HW4)',     totalM: 850,  perVehicle: 3_200, source: 'Morgan Stanley Research, annualised amortised' },
    { vehicle: 'Audi Q8 e-tron (2023–2028)',   totalM: 520,  perVehicle: 4_600, source: 'VW Group Annual Report + EY SW cost model' },
    { vehicle: 'Lucid Air (2022–2027)',         totalM: 380,  perVehicle: 7_800, source: 'Low-volume amortisation — Lucid investor notes' },
    { vehicle: 'Premium SUV This Model',        totalM: summary.grandTotal / 1_000_000, perVehicle: summary.perVehicle, source: 'CostVision model — this calculation' },
  ];

  // NRE total for phase timeline
  const phases = buildPhases(summary.nreTotal);

  // Monte Carlo cost distribution
  const monteCarlo = runMonteCarlo(prog, summary);

  return { modules, summary, sensitivity, benchmarks, phases, monteCarlo, inputs: prog };
}

function _recomputeTotal(
  prog: SWProgramInputs,
  overrides: {
    asilOverride?:       ASILLevel;
    complexityOverride?: SWComplexity;
    reuseOverride?:      SWReuse;
    regionOverride?:     SWRegion;
    lifeOverride?:       number;
  }
): number {
  const p2: SWProgramInputs = {
    ...prog,
    region:           overrides.regionOverride ?? prog.region,
    programLifeYears: overrides.lifeOverride   ?? prog.programLifeYears,
    modules: prog.modules.map(m => ({
      ...m,
      asil:       overrides.asilOverride       ?? m.asil,
      complexity: overrides.complexityOverride ?? m.complexity,
      reuse:      overrides.reuseOverride      ?? m.reuse,
    })),
  };
  return computeSWProgram(p2, { summaryOnly: true }).summary.grandTotal;
}

// ─── Default program inputs ───────────────────────────────────────────────────

export function defaultSWProgramInputs(): SWProgramInputs {
  return {
    region:                  'UK',
    devSource:               'OEM_Internal',
    programLifeYears:        10,
    annualProductionVolume:  80_000,
    teamSeniorFraction:      0.50,
    overheadMultiplier:      1.60,
    includeMaintenanceCost:  true,
    includeCloudCost:        true,
    // baseRateGBP intentionally unset → driven by the rate library's ukBaseRatePerPM
    // unless the user explicitly overrides it in the UI.
    modules: SW_MODULES.map(m => ({
      moduleId:           m.id,
      enabled:            m.defaultEnabled !== false,
      asil:               m.defaultAsil,
      complexity:         m.defaultComplexity,
      reuse:              'Medium' as SWReuse,
      customPersonMonths: null,
    })),
  };
}
