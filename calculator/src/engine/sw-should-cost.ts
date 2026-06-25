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
  annualToolLicenceGBP:      number;   // toolchain & IP licences, per year per program
  annualCloudCostGBP:        number;   // cloud infra, per year operational
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
  totalNonRecurring:  number;  // NRE (development + testing + integration + tool + cyber)
  totalLifecycle:     number;  // maintenance + cloud over program life
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
    annualToolLicenceGBP: 85_000, annualCloudCostGBP: 0,
    notes: 'ASIL-D per ISO 26262. Vector DaVinci, MATLAB/Simulink TargetLink. Safety-critical gateway. 2–3 yr development cycle.',
  },
  {
    id: 'cell_balancing', name: 'Cell Balancing Algorithms', shortName: 'Cell Balancing',
    category: 'A', categoryLabel: 'EV Powertrain & Battery',
    description: 'Active/passive balancing algorithms, balancing current control, energy routing optimisation.',
    defaultAsil: 'C', defaultComplexity: 'High', basePersonMonths: 20,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.38, integrationFractionBase: 0.12, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 22_000, annualCloudCostGBP: 0,
    notes: 'ASIL-C. Tightly coupled to cell chemistry model. Requires HIL bench with actual cells.',
  },
  {
    id: 'soc_soh_soe', name: 'SOC/SOH/SOE Estimation Models', shortName: 'SOC/SOH/SOE',
    category: 'A', categoryLabel: 'EV Powertrain & Battery',
    description: 'Electrochemical & data-driven (ML) State of Charge, Health, Energy estimation. Kalman, EKF, neural network approaches.',
    defaultAsil: 'C', defaultComplexity: 'Very High', basePersonMonths: 42,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: false,
    testingFractionBase: 0.42, integrationFractionBase: 0.14, maintenancePctPerYear: 14,
    annualToolLicenceGBP: 45_000, annualCloudCostGBP: 120_000,
    notes: 'Proprietary ML models. Cloud training infrastructure. Critical for range display accuracy. Ongoing cloud retraining.',
  },
  {
    id: 'thermal_mgmt', name: 'Battery Thermal Management Software', shortName: 'Thermal Mgmt',
    category: 'A', categoryLabel: 'EV Powertrain & Battery',
    description: 'Thermal control loops, coolant pump/valve actuation, fast-charge thermal preconditioning, cabin integration.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 30,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.35, integrationFractionBase: 0.15, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 30_000, annualCloudCostGBP: 0,
    notes: 'ASIL-B. Coupled to HVAC system. Climate chamber HIL essential.',
  },
  {
    id: 'fast_charge', name: 'Fast-Charging Control Software', shortName: 'Fast Charge',
    category: 'A', categoryLabel: 'EV Powertrain & Battery',
    description: 'CCS/CHAdeMO/OCPP protocol stacks, dynamic power curve management, thermal derating during charge.',
    defaultAsil: 'C', defaultComplexity: 'High', basePersonMonths: 25,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.38, integrationFractionBase: 0.14, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 18_000, annualCloudCostGBP: 30_000,
    notes: 'ASIL-C. ISO 15118 protocol licensing. OCPP backend integration. Charging network API security.',
  },
  {
    id: 'edu_control', name: 'EDU (Electric Drive Unit) Control Software', shortName: 'EDU Control',
    category: 'A', categoryLabel: 'EV Powertrain & Battery',
    description: 'Integrated electric drive unit control, dual-motor torque vectoring, multi-speed gearbox integration, creep & one-pedal drive.',
    defaultAsil: 'D', defaultComplexity: 'Very High', basePersonMonths: 65,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: true,
    testingFractionBase: 0.42, integrationFractionBase: 0.20, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 95_000, annualCloudCostGBP: 0,
    notes: 'ASIL-D. Tightly coupled to VCU. Real-time control at <250µs cycle. TargetLink/ASCET required.',
  },
  {
    id: 'inverter_ctrl', name: 'Inverter Control Algorithms', shortName: 'Inverter Ctrl',
    category: 'A', categoryLabel: 'EV Powertrain & Battery',
    description: 'Space Vector PWM, switching frequency optimisation, dead-time compensation, EMI management, demagnetisation protection.',
    defaultAsil: 'D', defaultComplexity: 'Very High', basePersonMonths: 45,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.42, integrationFractionBase: 0.18, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 75_000, annualCloudCostGBP: 0,
    notes: 'ASIL-D. FPGA-accelerated control loop. Simulation-first (PLECS/MATLAB Power Systems).',
  },
  {
    id: 'motor_ctrl', name: 'Motor Control (FOC/DTC/SVPWM)', shortName: 'Motor Control',
    category: 'A', categoryLabel: 'EV Powertrain & Battery',
    description: 'Field-oriented control, direct torque control, sensorless rotor position estimation, flux linkage tables, temperature derating.',
    defaultAsil: 'D', defaultComplexity: 'Very High', basePersonMonths: 42,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.42, integrationFractionBase: 0.18, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 70_000, annualCloudCostGBP: 0,
    notes: 'ASIL-D. Motor characterisation dyno testing mandatory. Coupled to inverter firmware.',
  },
  {
    id: 'regen_braking', name: 'Regenerative Braking Software', shortName: 'Regen Braking',
    category: 'A', categoryLabel: 'EV Powertrain & Battery',
    description: 'Brake blending control, hydraulic-electric transition, ABS/ESC coordination, one-pedal tuning, driver feel calibration.',
    defaultAsil: 'C', defaultComplexity: 'High', basePersonMonths: 20,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.38, integrationFractionBase: 0.16, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 25_000, annualCloudCostGBP: 0,
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
    annualToolLicenceGBP: 180_000, annualCloudCostGBP: 850_000,
    notes: 'Largest ADAS component. DNN training on GPU clusters. ASIL-B decomposition. NCAP/Euro NCAP scenario coverage critical. Ongoing cloud retraining.',
  },
  {
    id: 'radar_processing', name: 'Radar Processing Stack', shortName: 'Radar Proc.',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'FMCW radar DSP, CFAR detection, Doppler processing, angle estimation, object tracking and classification.',
    defaultAsil: 'B', defaultComplexity: 'Very High', basePersonMonths: 60,
    hasMLContent: true, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.45, integrationFractionBase: 0.16, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 90_000, annualCloudCostGBP: 80_000,
    notes: 'ASIL-B. Requires anechoic chamber + track testing. Multi-target tracking Kalman filter. Cross-range resolution improvement critical.',
  },
  {
    id: 'ultrasonic', name: 'Ultrasonic Processing Software', shortName: 'Ultrasonic',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'Short-range object detection, parking guidance, cross-traffic alert, time-of-flight processing for 12-16 sensors.',
    defaultAsil: 'B', defaultComplexity: 'Medium', basePersonMonths: 15,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.35, integrationFractionBase: 0.12, maintenancePctPerYear: 8,
    annualToolLicenceGBP: 12_000, annualCloudCostGBP: 0,
    notes: 'ASIL-B for AEB trigger path. Relatively mature technology — significant IP available.',
  },
  {
    id: 'sensor_fusion', name: 'Sensor Fusion Engine', shortName: 'Sensor Fusion',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'Multi-modal object fusion (camera + radar + lidar if fitted), probabilistic world model, occupancy grid, track management.',
    defaultAsil: 'C', defaultComplexity: 'Very High', basePersonMonths: 95,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: false,
    testingFractionBase: 0.50, integrationFractionBase: 0.22, maintenancePctPerYear: 16,
    annualToolLicenceGBP: 120_000, annualCloudCostGBP: 200_000,
    notes: 'ASIL-C. The architectural heart of ADAS. Extended Kalman Filter + deep learning hybrid. Cross-sensor timing alignment critical.',
  },
  {
    id: 'path_planning', name: 'Path Planning Algorithms', shortName: 'Path Planning',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'Behaviour prediction, trajectory generation, cost-function optimisation, comfort/safety trade-off. HD map integration where applicable.',
    defaultAsil: 'C', defaultComplexity: 'Very High', basePersonMonths: 80,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: false,
    testingFractionBase: 0.50, integrationFractionBase: 0.20, maintenancePctPerYear: 16,
    annualToolLicenceGBP: 95_000, annualCloudCostGBP: 150_000,
    notes: 'ASIL-C. Novel research area — simulation-first (CARLA/LGSVL). Scenario coverage requires >500M virtual km.',
  },
  {
    id: 'control_algos', name: 'Control Algorithms (ACC / LKA / AEB)', shortName: 'ACC/LKA/AEB',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'Longitudinal ACC, lateral LKA, emergency AEB, FCW, emergency steering. Control law design, tuning, gain scheduling.',
    defaultAsil: 'D', defaultComplexity: 'High', basePersonMonths: 65,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.48, integrationFractionBase: 0.18, maintenancePctPerYear: 14,
    annualToolLicenceGBP: 80_000, annualCloudCostGBP: 0,
    notes: 'AEB is ASIL-D (brake actuation). LKA/ACC typically ASIL-C. Regulation: UN-ECE R152/R151/R130. MIL→SIL→HIL→vehicle mandatory.',
  },
  {
    id: 'driver_monitor', name: 'Driver Monitoring Software (DMS)', shortName: 'Driver Monitor',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'Gaze tracking, drowsiness detection, attention estimation, hands-on-wheel detection. IR camera + CNN inference.',
    defaultAsil: 'B', defaultComplexity: 'Very High', basePersonMonths: 55,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.45, integrationFractionBase: 0.16, maintenancePctPerYear: 14,
    annualToolLicenceGBP: 85_000, annualCloudCostGBP: 180_000,
    notes: 'ASIL-B (alert pathway). GDPR/biometric data handling critical. Regulatory mandate (UN-ECE R79 amendment). Cloud retraining on diverse demographics.',
  },
  {
    id: 'highway_assist', name: 'Highway Assist / Traffic Jam Assist', shortName: 'Highway Assist',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'Combined longitudinal + lateral control for highway driving, hands-off monitoring, lane change assist, automated speed adaptation.',
    defaultAsil: 'C', defaultComplexity: 'Very High', basePersonMonths: 75,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: false,
    testingFractionBase: 0.50, integrationFractionBase: 0.22, maintenancePctPerYear: 16,
    annualToolLicenceGBP: 100_000, annualCloudCostGBP: 220_000,
    notes: 'ASIL-C. Integrates all ADAS features into L2+ use case. OTA updates critical for consumer perception. Euro NCAP 2026 mandatory.',
  },

  // ── CATEGORY C: Infotainment, Connectivity & UX ──────────────────────────
  {
    id: 'ivi_os', name: 'IVI Operating System (Android Automotive / QNX)', shortName: 'IVI OS',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: 'Android Automotive OS or QNX BSP integration, platform services, GPU driver optimisation, boot time optimisation, security hardening.',
    defaultAsil: 'QM', defaultComplexity: 'Very High', basePersonMonths: 160,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.35, integrationFractionBase: 0.22, maintenancePctPerYear: 18,
    annualToolLicenceGBP: 280_000, annualCloudCostGBP: 120_000,
    notes: 'Google AAOS licence fee (~$25/vehicle) or QNX royalty. Largest team. Continuous OS updates mandatory (security). Boot < 4s target.',
  },
  {
    id: 'navigation', name: 'Navigation Stack', shortName: 'Navigation',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: 'Routing engine, map rendering, offline capability, real-time traffic (HERE/TomTom), EV routing with charge planning.',
    defaultAsil: 'QM', defaultComplexity: 'High', basePersonMonths: 42,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: false,
    testingFractionBase: 0.30, integrationFractionBase: 0.14, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 55_000, annualCloudCostGBP: 380_000,
    notes: 'Map data licence: HERE ~£8-15/vehicle/yr OR TomTom similar. Real-time traffic API cloud cost significant at scale.',
  },
  {
    id: 'voice_assistant', name: 'Vehicle Voice Assistant', shortName: 'Voice Assistant',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: 'Wake word detection, ASR (on-device + cloud), NLU, TTS, vehicle function control, 3rd-party assistant integration (Alexa/Google).',
    defaultAsil: 'QM', defaultComplexity: 'Very High', basePersonMonths: 65,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.35, integrationFractionBase: 0.18, maintenancePctPerYear: 16,
    annualToolLicenceGBP: 95_000, annualCloudCostGBP: 450_000,
    notes: 'On-device ASR engines (Cerence, SoundHound) licence ~£15/vehicle. Cloud NLU significant. Multi-language adds 40% cost.',
  },
  {
    id: 'tcu_software', name: 'Telematics Control Unit (TCU) Software', shortName: 'TCU Software',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: '5G/LTE modem management, emergency call (eCall), remote diagnostics, remote access, V2X readiness, OBD-II data relay.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 30,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.38, integrationFractionBase: 0.15, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 35_000, annualCloudCostGBP: 90_000,
    notes: 'eCall path ASIL-B per EU regulation. 3GPP modem certification adds cost. Cloud backend for remote commands mandatory.',
  },
  {
    id: 'connectivity_stack', name: 'Bluetooth / WiFi / 5G Connectivity Stack', shortName: 'Connectivity',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: 'BT5.x stack (audio, phone), WiFi 6/6E AP+client, 5G SA/NSA modem driver integration, hotspot management.',
    defaultAsil: 'QM', defaultComplexity: 'High', basePersonMonths: 30,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: true,
    testingFractionBase: 0.30, integrationFractionBase: 0.12, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 40_000, annualCloudCostGBP: 20_000,
    notes: 'Qualcomm/NXP modem IP licensing. PTCRB/GCF certification. BT SIG licence fees. Regulatory testing (FCC/CE) significant.',
  },
  {
    id: 'hmi_framework', name: 'App Framework & HMI Layer', shortName: 'HMI Framework',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: 'UI framework (Qt/Flutter/React Native Automotive), instrument cluster rendering, haptics, multi-screen management, UX design system.',
    defaultAsil: 'QM', defaultComplexity: 'Very High', basePersonMonths: 85,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.30, integrationFractionBase: 0.15, maintenancePctPerYear: 14,
    annualToolLicenceGBP: 65_000, annualCloudCostGBP: 0,
    notes: 'Qt licence ~£180k/yr for automotive. UI/UX design iteration is costly. 60fps rendering on large displays. Dark mode, accessibility compliance.',
  },

  // ── CATEGORY D: Vehicle Domain Controllers ────────────────────────────────
  {
    id: 'body_control', name: 'Body Control Software', shortName: 'Body Control',
    category: 'D', categoryLabel: 'Vehicle Domain Controllers',
    description: 'Lighting control, power windows/mirrors/sunroof, door locks, wiper logic, ambient lighting, comfort features state machines.',
    defaultAsil: 'B', defaultComplexity: 'Medium', basePersonMonths: 45,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.32, integrationFractionBase: 0.14, maintenancePctPerYear: 8,
    annualToolLicenceGBP: 28_000, annualCloudCostGBP: 0,
    notes: 'Partially ASIL-B (exterior lighting). High breadth of features. AUTOSAR Classic. HIL test bench for all actuators.',
  },
  {
    id: 'chassis_control', name: 'Chassis Control Software', shortName: 'Chassis Control',
    category: 'D', categoryLabel: 'Vehicle Domain Controllers',
    description: 'Air suspension, CDC (Continuous Damping Control), active anti-roll bars, 4WS (rear steering), hill-hold, terrain modes.',
    defaultAsil: 'C', defaultComplexity: 'High', basePersonMonths: 60,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.40, integrationFractionBase: 0.18, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 55_000, annualCloudCostGBP: 0,
    notes: 'ASIL-C (active suspension failure modes). 4WS requires ASIL-D for full-authority steering. Extensive proving ground calibration.',
  },
  {
    id: 'gateway_ecu', name: 'Gateway ECU Software', shortName: 'Gateway ECU',
    category: 'D', categoryLabel: 'Vehicle Domain Controllers',
    description: 'CAN/LIN/FlexRay/Ethernet routing, signal translation, diagnostic gateway, firewall, network management master.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 28,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: true,
    testingFractionBase: 0.35, integrationFractionBase: 0.16, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 35_000, annualCloudCostGBP: 0,
    notes: 'ASIL-B. Security gateway per UN-ECE R155. Vector CANdb++ and autosar tool suite required.',
  },
  {
    id: 'zonal_arch', name: 'Zonal Architecture Software', shortName: 'Zonal Arch.',
    category: 'D', categoryLabel: 'Vehicle Domain Controllers',
    description: 'Zone controller software, power distribution management, ECU consolidation logic, 100BASE-T1 Ethernet backbone management.',
    defaultAsil: 'B', defaultComplexity: 'Very High', basePersonMonths: 65,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: true,
    testingFractionBase: 0.38, integrationFractionBase: 0.20, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 75_000, annualCloudCostGBP: 0,
    notes: 'Cutting-edge architecture (BMW NCA, Mercedes MBOSx). AUTOSAR Adaptive. Consolidates 70+ ECUs to ~5 zone controllers.',
  },
  {
    id: 'vehicle_motion', name: 'Vehicle Motion Management (VMM)', shortName: 'VMM',
    category: 'D', categoryLabel: 'Vehicle Domain Controllers',
    description: 'Unified torque arbitration, coordinated chassis & propulsion control, stability control, oversteer/understeer management, tyre model.',
    defaultAsil: 'C', defaultComplexity: 'Very High', basePersonMonths: 80,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.45, integrationFractionBase: 0.22, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 90_000, annualCloudCostGBP: 0,
    notes: 'ASIL-C. The "software chassis". MBD mandatory. Extensive proving ground programme. CarSim/VI-CRT simulation toolchain.',
  },

  // ── CATEGORY E: Middleware & Platform ────────────────────────────────────
  {
    id: 'autosar_classic', name: 'AUTOSAR Classic BSW & Integration', shortName: 'AUTOSAR Classic',
    category: 'E', categoryLabel: 'Middleware & Platform',
    description: 'AUTOSAR Classic BSW configuration (Vector DaVinci, ETAS ISOLAR), OS (OSEK/VDX), COM stack, run-time environment (RTE) integration.',
    defaultAsil: 'C', defaultComplexity: 'High', basePersonMonths: 45,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.35, integrationFractionBase: 0.20, maintenancePctPerYear: 8,
    annualToolLicenceGBP: 220_000, annualCloudCostGBP: 0,
    notes: 'Vector DaVinci + EB tresos licences ~£200-300k/yr. Mainly integration work. High toolchain cost dominates.',
  },
  {
    id: 'autosar_adaptive', name: 'AUTOSAR Adaptive Platform', shortName: 'AUTOSAR Adaptive',
    category: 'E', categoryLabel: 'Middleware & Platform',
    description: 'ara::com service-oriented communication, execution management, update management (UCM), PHM, crypto API, DDS integration.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 60,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.38, integrationFractionBase: 0.22, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 180_000, annualCloudCostGBP: 30_000,
    notes: 'Vector MICROSAR Adaptive or EB corbos. Growing importance with zonal E/E. Security hardening of POSIX/Linux base required.',
  },
  {
    id: 'rtos', name: 'RTOS & OS Porting', shortName: 'RTOS',
    category: 'E', categoryLabel: 'Middleware & Platform',
    description: 'OSEK/VDX, FreeRTOS, or commercial RTOS BSP integration, task scheduling optimisation, interrupt management, memory protection.',
    defaultAsil: 'C', defaultComplexity: 'Medium', basePersonMonths: 12,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.35, integrationFractionBase: 0.14, maintenancePctPerYear: 6,
    annualToolLicenceGBP: 45_000, annualCloudCostGBP: 0,
    notes: 'Mostly licensed (ETAS, QNX, Green Hills). Internal effort mainly BSP porting and configuration.',
  },
  {
    id: 'diagnostics', name: 'Diagnostics (UDS / OBD-II)', shortName: 'Diagnostics',
    category: 'E', categoryLabel: 'Middleware & Platform',
    description: 'UDS (ISO 14229), OBD-II (SAE J1979), DTC definition, diagnostic service implementation, DEXT generation, coding routines.',
    defaultAsil: 'A', defaultComplexity: 'Medium', basePersonMonths: 25,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: false,
    testingFractionBase: 0.30, integrationFractionBase: 0.14, maintenancePctPerYear: 8,
    annualToolLicenceGBP: 30_000, annualCloudCostGBP: 25_000,
    notes: 'ISO 14229 mandatory. CANoe (Vector) for all diagnostic testing. ODX/PDXF toolchain. Cloud DTC telemetry growing.',
  },
  {
    id: 'comm_stacks', name: 'CAN / LIN / FlexRay / Ethernet Communication Stacks', shortName: 'Comm. Stacks',
    category: 'E', categoryLabel: 'Middleware & Platform',
    description: 'AUTOSAR ComStack configuration, CAN-XL support, Automotive Ethernet (10/100BASE-T1), signal routing, PDU mapping, SOME/IP.',
    defaultAsil: 'B', defaultComplexity: 'Medium', basePersonMonths: 20,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.30, integrationFractionBase: 0.14, maintenancePctPerYear: 8,
    annualToolLicenceGBP: 50_000, annualCloudCostGBP: 0,
    notes: 'Mainly AUTOSAR configuration (Vector DaVinci NetworkDesigner). CANdb++ management. SOME/IP middleware growing.',
  },
  {
    id: 'time_sync', name: 'Time Synchronisation & Network Management', shortName: 'Time Sync / NM',
    category: 'E', categoryLabel: 'Middleware & Platform',
    description: 'gPTP (IEEE 802.1AS) for Ethernet time sync, CAN NM master, sleep/wake management, partial networking.',
    defaultAsil: 'A', defaultComplexity: 'Low', basePersonMonths: 14,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.28, integrationFractionBase: 0.12, maintenancePctPerYear: 6,
    annualToolLicenceGBP: 18_000, annualCloudCostGBP: 0,
    notes: 'Critical for sensor fusion temporal alignment. AUTOSAR NM fully handled by BSW. Mainly validation effort.',
  },

  // ── CATEGORY F: Cybersecurity ─────────────────────────────────────────────
  {
    id: 'secure_boot', name: 'Secure Boot & Root of Trust', shortName: 'Secure Boot',
    category: 'F', categoryLabel: 'Cybersecurity (ISO 21434)',
    description: 'Hardware Security Module (HSM) integration, key provisioning, boot chain verification, anti-rollback, attestation.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 20,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.45, integrationFractionBase: 0.20, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 40_000, annualCloudCostGBP: 45_000,
    notes: 'UN-ECE R155 mandatory. NXP/Infineon HSM IP. Key injection in production (takt-time impact). Penetration testing annual.',
  },
  {
    id: 'encryption', name: 'Encryption Modules & Crypto Stack', shortName: 'Encryption',
    category: 'F', categoryLabel: 'Cybersecurity (ISO 21434)',
    description: 'AES-256, RSA-2048, ECC, TLS 1.3 for V2X/cloud, AUTOSAR Crypto Stack, hardware crypto acceleration.',
    defaultAsil: 'B', defaultComplexity: 'Medium', basePersonMonths: 15,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: true,
    testingFractionBase: 0.40, integrationFractionBase: 0.14, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 25_000, annualCloudCostGBP: 0,
    notes: 'Wolfssl/mbedTLS licence. AUTOSAR CSM configuration. Quantum-safe migration roadmap starting 2026.',
  },
  {
    id: 'ids', name: 'Intrusion Detection System (IDS)', shortName: 'IDS / IDPS',
    category: 'F', categoryLabel: 'Cybersecurity (ISO 21434)',
    description: 'In-vehicle network anomaly detection, CAN message monitoring, rate-limiting, VSOC integration, event reporting to cloud.',
    defaultAsil: 'QM', defaultComplexity: 'High', basePersonMonths: 28,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.42, integrationFractionBase: 0.18, maintenancePctPerYear: 16,
    annualToolLicenceGBP: 55_000, annualCloudCostGBP: 90_000,
    notes: 'UN-ECE R155 triage requirement. ARGUS/Upstream/GuardKnox IP options. VSOC cloud monitoring significant ongoing cost.',
  },
  {
    id: 'secure_ota', name: 'Secure OTA Software Update Framework', shortName: 'Secure OTA',
    category: 'F', categoryLabel: 'Cybersecurity (ISO 21434)',
    description: 'Delta update generation, signature verification, rollback protection, update orchestration, bandwidth management.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 20,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.40, integrationFractionBase: 0.18, maintenancePctPerYear: 14,
    annualToolLicenceGBP: 50_000, annualCloudCostGBP: 120_000,
    notes: 'Integrated with AUTOSAR UCM. Excelfore / Airbiquity OTA platform licence option. Delta compression reduces data cost.',
  },
  {
    id: 'key_mgmt', name: 'Key Management System', shortName: 'Key Management',
    category: 'F', categoryLabel: 'Cybersecurity (ISO 21434)',
    description: 'Certificate lifecycle management, PKI integration, key derivation, secure key storage, provisioning infrastructure.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 15,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.40, integrationFractionBase: 0.14, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 35_000, annualCloudCostGBP: 80_000,
    notes: 'PKI infrastructure cloud-hosted. Certificate provisioning at end-of-line (EoL). Annual re-keying capability needed.',
  },

  // ── CATEGORY G: OTA & Cloud Backend ──────────────────────────────────────
  {
    id: 'ota_manager', name: 'OTA Update Manager (Vehicle-side)', shortName: 'OTA Manager',
    category: 'G', categoryLabel: 'OTA & Cloud Backend',
    description: 'Vehicle-side update campaign execution, ECU coordination, rollback, consent management, network condition handling.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 30,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.38, integrationFractionBase: 0.18, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 40_000, annualCloudCostGBP: 180_000,
    notes: 'AUTOSAR UCM Adapter. Must handle fleet-wide rollout with A/B validation. Backend campaign management is major cloud cost.',
  },
  {
    id: 'cloud_backend', name: 'Cloud Backend Services', shortName: 'Cloud Backend',
    category: 'G', categoryLabel: 'OTA & Cloud Backend',
    description: 'Vehicle connectivity backend, API gateway, device shadow, remote command, data lake, microservices architecture (AWS/Azure/GCP).',
    defaultAsil: 'QM', defaultComplexity: 'Very High', basePersonMonths: 65,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.32, integrationFractionBase: 0.16, maintenancePctPerYear: 20,
    annualToolLicenceGBP: 80_000, annualCloudCostGBP: 1_200_000,
    notes: 'Largest cloud cost. Scales with fleet size. AWS IoT Core / Azure IoT Hub. SLA-driven infrastructure. DevOps-heavy.',
  },
  {
    id: 'data_pipeline', name: 'Data Pipeline & Telemetry', shortName: 'Data Pipeline',
    category: 'G', categoryLabel: 'OTA & Cloud Backend',
    description: 'In-vehicle data collection agent, edge pre-processing, telemetry streaming, data lake ingestion, GDPR/data governance.',
    defaultAsil: 'QM', defaultComplexity: 'High', basePersonMonths: 30,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: true,
    testingFractionBase: 0.30, integrationFractionBase: 0.14, maintenancePctPerYear: 14,
    annualToolLicenceGBP: 45_000, annualCloudCostGBP: 320_000,
    notes: 'GDPR consent management. Apache Kafka / Kinesis streaming. Data used for ML model improvement and warranty analytics.',
  },
  {
    id: 'fleet_mgmt', name: 'Fleet Management & Analytics Software', shortName: 'Fleet Mgmt',
    category: 'G', categoryLabel: 'OTA & Cloud Backend',
    description: 'Fleet health dashboard, predictive maintenance, usage analytics, dealer portal, subscription management, over-the-air campaign tools.',
    defaultAsil: 'QM', defaultComplexity: 'Medium', basePersonMonths: 20,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: false,
    testingFractionBase: 0.28, integrationFractionBase: 0.12, maintenancePctPerYear: 16,
    annualToolLicenceGBP: 30_000, annualCloudCostGBP: 200_000,
    notes: 'SaaS platform option (Bright Box, Verizon Connect) vs in-house. Dealer portal requires API licensing. Predictive ML adds value.',
  },
];

// ─── Cost Calculation Engine ──────────────────────────────────────────────────

function computeModuleCost(
  def:    SWModuleDef,
  input:  SWModuleInput,
  prog:   SWProgramInputs
): SWModuleCostResult {
  const regionRate  = UK_PM_RATE_GBP * REGION_MULT[prog.region] * DEV_SOURCE_MULT[prog.devSource];
  const asilDev     = ASIL_DEV_MULT[input.asil];
  const complexity  = COMPLEXITY_MULT[input.complexity];
  const reuse       = REUSE_FACTOR[input.reuse];
  const testFrac    = ASIL_TEST_MULT[input.asil];

  const effectivePM = (input.customPersonMonths ?? def.basePersonMonths) * reuse;

  // Development sub-buckets (fractions of total dev effort)
  const devPM = effectivePM * asilDev;
  const reqsPM  = devPM * 0.12;
  const archPM  = devPM * 0.14;
  const algoPM  = devPM * 0.22 * complexity; // complexity multiplied here
  const implPM  = devPM * 0.37;
  const safetyPM= devPM * 0.15;             // pure safety compliance work

  const reqs   = reqsPM  * regionRate;
  const arch   = archPM  * regionRate;
  const algo   = algoPM  * regionRate;
  const impl   = implPM  * regionRate;
  const safety = safetyPM * regionRate;
  const devTotal = reqs + arch + algo + impl + safety;

  // Testing breakdown (fractions of dev cost at ASIL)
  const testTotal = devTotal * testFrac;
  const silCost   = testTotal * 0.30;
  const milCost   = def.hasMLContent ? testTotal * 0.18 : testTotal * 0.08;
  const hilCost   = testTotal * 0.35;
  const regCost   = testTotal * 0.10;
  const penCost   = def.hasCybersecRequirement ? testTotal * 0.08 : 0;
  const scenCost  = def.category === 'B' ? testTotal * 0.09 : 0;

  const integration    = devTotal * def.integrationFractionBase;
  const cybersec       = def.hasCybersecRequirement ? devTotal * 0.08 : 0;
  const toolchain      = def.annualToolLicenceGBP * prog.programLifeYears;
  const licensing      = def.annualToolLicenceGBP * 0.4 * prog.programLifeYears; // IP/SW licences
  const cloudCost      = prog.includeCloudCost
    ? def.annualCloudCostGBP * prog.programLifeYears : 0;
  const maintenance    = prog.includeMaintenanceCost
    ? devTotal * (def.maintenancePctPerYear / 100) * prog.programLifeYears : 0;

  const totalNRE    = devTotal + testTotal + integration + toolchain + cybersec;
  const totalLifecycle = maintenance + cloudCost + licensing;
  const grandTotal  = totalNRE + totalLifecycle;
  const vehicles    = prog.annualProductionVolume * prog.programLifeYears;
  const perVehicle  = vehicles > 0 ? grandTotal / vehicles : 0;

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
    totalNonRecurring: totalNRE,
    totalLifecycle,
    grandTotal,
    perVehicle,
  };
}

export function computeSWProgram(prog: SWProgramInputs): SWProgramResult {
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
    grandTotal:         sum(modules.map(m => m.grandTotal)),
    totalPersonMonths:  sum(modules.map(m => m.personMonths)),
    perVehicle:         0,
    byCategory:         {} as Record<SWCategory, number>,
  };
  const vehicles = prog.annualProductionVolume * prog.programLifeYears;
  summary.perVehicle = vehicles > 0 ? summary.grandTotal / vehicles : 0;

  for (const cat of ['A','B','C','D','E','F','G'] as SWCategory[]) {
    summary.byCategory[cat] = sum(modules.filter(m => m.category === cat).map(m => m.grandTotal));
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
      parameter: 'Production Volume (50k vs 150k units/yr)',
      low:  summary.grandTotal / Math.max(1, 50_000 * prog.programLifeYears),
      base: summary.perVehicle,
      high: summary.grandTotal / Math.max(1, 150_000 * prog.programLifeYears),
      unit: '£/vehicle',
    },
  ];

  const benchmarks: SWBenchmark[] = [
    { vehicle: 'BMW iX (2021–2026)', totalM: 620, perVehicle: 4_800, source: 'Berylls Strategy Advisors estimate, 2023' },
    { vehicle: 'Porsche Taycan (2019–2024)', totalM: 480, perVehicle: 5_200, source: 'SBD Automotive teardown + SW analysis' },
    { vehicle: 'Mercedes EQS (2021–2026)', totalM: 710, perVehicle: 5_500, source: 'McKinsey Future of Software in Automotive, 2022' },
    { vehicle: 'Range Rover (L460, 2022–2027)', totalM: 390, perVehicle: 3_800, source: 'JLR investor reports + industry est.' },
    { vehicle: 'Tesla Model S (Gen 3 HW4)', totalM: 850, perVehicle: 3_200, source: 'Morgan Stanley Research, annualised amortised' },
    { vehicle: 'Audi Q8 e-tron (2023–2028)', totalM: 520, perVehicle: 4_600, source: 'VW Group Annual Report + EY SW cost model' },
    { vehicle: 'Lucid Air (2022–2027)', totalM: 380, perVehicle: 7_800, source: 'Low-volume amortisation — Lucid investor notes' },
    { vehicle: 'Premium SUV This Model', totalM: summary.grandTotal / 1_000_000, perVehicle: summary.perVehicle, source: 'CostVision model — this calculation' },
  ];

  return { modules, summary, sensitivity, benchmarks, inputs: prog };
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
    region:            overrides.regionOverride ?? prog.region,
    programLifeYears:  overrides.lifeOverride   ?? prog.programLifeYears,
    modules: prog.modules.map(m => ({
      ...m,
      asil:       overrides.asilOverride       ?? m.asil,
      complexity: overrides.complexityOverride ?? m.complexity,
      reuse:      overrides.reuseOverride      ?? m.reuse,
    })),
  };
  return computeSWProgram(p2).summary.grandTotal;
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
