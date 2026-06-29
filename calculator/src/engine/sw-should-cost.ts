/**
 * Automotive Software Should-Cost Engine
 * Senior Chief Automotive Software Should-Cost Engineer model
 * Premium Luxury SUV — Full Software Stack (2024-2026)
 *
 * Covers 43 software modules across 7 categories:
 *  A. EV Powertrain & Battery   B. ADAS L2/L2+
 *  C. Infotainment & UX         D. Vehicle Domain Controllers
 *  E. Middleware & Platform      F. Cybersecurity
 *  G. OTA & Cloud Backend
 */

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
  totalNonRecurring:  number;  // NRE (dev + test + integration + tool + cyber + calibration)
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
  nreTotal:           number;  // dev + test + integration + toolchain + cybersec + calibration
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

/** ASIL development overhead multiplier (applied to dev cost) */
export const ASIL_DEV_MULT: Record<ASILLevel, number> = {
  QM: 1.00, A: 1.35, B: 1.80, C: 2.30, D: 3.20,
};

/** ASIL testing multiplier (testing cost as fraction of adjusted dev cost) */
export const ASIL_TEST_MULT: Record<ASILLevel, number> = {
  QM: 0.35, A: 0.55, B: 0.85, C: 1.20, D: 1.80,
};

/** Complexity multiplier for algorithm & implementation buckets */
export const COMPLEXITY_MULT: Record<SWComplexity, number> = {
  'Low': 0.60, 'Medium': 1.00, 'High': 1.70, 'Very High': 2.80,
};

/** Reuse factor (1.0 = fresh, 0.0 = zero effort) */
export const REUSE_FACTOR: Record<SWReuse, number> = {
  Fresh: 1.00, Light: 0.82, Medium: 0.60, Heavy: 0.35, Platform: 0.14,
};

/** Regional labour rate relative to UK senior blended (fully loaded £28k/PM) */
export const REGION_MULT: Record<SWRegion, number> = {
  UK:             1.00,
  EU:             0.95,
  USA_Detroit:    1.35,
  USA_SV:         1.85,
  China:          0.35,
  India:          0.20,
  Mexico:         0.28,
  Eastern_Europe: 0.45,
  Japan:          0.90,
};

/** DevSource quality/overhead multiplier */
export const DEV_SOURCE_MULT: Record<DevSource, number> = {
  OEM_Internal:   1.00,
  Tier1_Supplier: 0.88,
  Startup_OSS:    0.72,
};

const UK_PM_RATE_GBP = 28_000; // fully-loaded £/person-month baseline

// ─── Module Database (43 modules) ────────────────────────────────────────────

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
];

// ─── Cost Calculation Engine ──────────────────────────────────────────────────

function computeModuleCost(
  def:    SWModuleDef,
  input:  SWModuleInput,
  prog:   SWProgramInputs
): SWModuleCostResult {
  const seniorMult  = prog.teamSeniorFraction * 1.20 + (1 - prog.teamSeniorFraction) * 0.75;
  const regionRate  = UK_PM_RATE_GBP * REGION_MULT[prog.region] * DEV_SOURCE_MULT[prog.devSource]
                      * seniorMult * prog.overheadMultiplier;

  const asilDev    = ASIL_DEV_MULT[input.asil];
  const complexity = COMPLEXITY_MULT[input.complexity];
  const reuse      = REUSE_FACTOR[input.reuse];
  const testFrac   = ASIL_TEST_MULT[input.asil];

  const effectivePM = (input.customPersonMonths ?? def.basePersonMonths) * reuse;

  // Development sub-buckets. Complexity applied to algorithm bucket only.
  const devPM    = effectivePM * asilDev;
  const reqsPM   = devPM * 0.12;
  const archPM   = devPM * 0.14;
  const algoPM   = devPM * 0.22 * complexity;
  const implPM   = devPM * 0.37;
  const safetyPM = devPM * 0.15;

  const reqs   = reqsPM   * regionRate;
  const arch   = archPM   * regionRate;
  const algo   = algoPM   * regionRate;
  const impl   = implPM   * regionRate;
  const safety = safetyPM * regionRate;
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

  // Toolchain and IP licensing are now fully separate cost pools.
  const toolchain = def.annualToolLicenceGBP * prog.programLifeYears;
  const licensing = def.annualIPLicenceGBP   * prog.programLifeYears;

  // Physical/model calibration effort (dyno runs, proving ground, model fitting)
  const calibration = devTotal * def.calibrationFractionBase;

  const cloudCost   = prog.includeCloudCost
    ? def.annualCloudCostGBP * prog.programLifeYears : 0;
  const maintenance = prog.includeMaintenanceCost
    ? devTotal * (def.maintenancePctPerYear / 100) * prog.programLifeYears : 0;

  const totalNRE      = devTotal + testTotal + integration + toolchain + cybersec + calibration;
  const totalLifecycle = maintenance + cloudCost + licensing;
  const grandTotal     = totalNRE + totalLifecycle;
  const vehicles       = prog.annualProductionVolume * prog.programLifeYears;
  const perVehicle     = vehicles > 0 ? grandTotal / vehicles : 0;

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
    totalNonRecurring: totalNRE,
    totalLifecycle,
    grandTotal,
    perVehicle,
  };
}

// ─── Monte Carlo simulation ───────────────────────────────────────────────────

function runMonteCarlo(prog: SWProgramInputs, s: SWSummary, iterations = 1000): SWMonteCarlo {
  // Triangular distribution sampler
  function tri(a: number, m: number, b: number): number {
    const u = Math.random();
    const Fc = (m - a) / (b - a);
    if (u < Fc) return a + Math.sqrt(u * (b - a) * (m - a));
    return b - Math.sqrt((1 - u) * (b - a) * (b - m));
  }

  const totals: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const total =
      s.totalDevelopment   * tri(0.70, 1.00, 1.40) +
      s.totalTesting       * tri(0.75, 1.00, 1.35) +
      s.totalIntegration   * tri(0.70, 1.00, 1.40) +
      s.totalToolchain     * tri(0.85, 1.00, 1.25) +
      s.totalCybersecurity * tri(0.65, 1.00, 1.50) +
      s.totalCalibration   * tri(0.70, 1.00, 1.50) +
      s.totalMaintenance   * tri(0.75, 1.00, 1.35) +
      s.totalCloud         * tri(0.50, 1.00, 1.60) +
      s.totalLicensing     * tri(0.80, 1.00, 1.30);
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
  const enabledModules = prog.modules.filter(m => m.enabled);
  const modules: SWModuleCostResult[] = enabledModules.map(m => {
    const def = SW_MODULES.find(d => d.id === m.moduleId)!;
    return computeModuleCost(def, m, prog);
  });

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

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
    nreTotal:           0,
    grandTotal:         sum(modules.map(m => m.grandTotal)),
    totalPersonMonths:  sum(modules.map(m => m.personMonths)),
    perVehicle:         0,
    byCategory:         {} as Record<SWCategory, number>,
  };
  summary.nreTotal = summary.totalDevelopment + summary.totalTesting + summary.totalIntegration
                   + summary.totalToolchain + summary.totalCybersecurity + summary.totalCalibration;
  const vehicles = prog.annualProductionVolume * prog.programLifeYears;
  summary.perVehicle = vehicles > 0 ? summary.grandTotal / vehicles : 0;

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
    modules: SW_MODULES.map(m => ({
      moduleId:           m.id,
      enabled:            true,
      asil:               m.defaultAsil,
      complexity:         m.defaultComplexity,
      reuse:              'Medium' as SWReuse,
      customPersonMonths: null,
    })),
  };
}
