// ─── Process Taxonomy ─────────────────────────────────────────────────────────
// Reference/metadata for casting and machining process taxonomy.
// Not used in cost calculations directly — used for UI recommendations.

export interface CastingProcessInfo {
  name: string;
  category: string;
  materials: string[];
  applications: string[];
  advantages: string[];
  limitations: string[];
  variants?: Array<{ type: string; materials?: string[]; applications: string[] }> | string[];
}

export interface MachiningProcessInfo {
  name: string;
  subProcesses?: string[];
  tolerances?: string;
  surfaceFinish?: string;
  costDrivers: string[];
}

export interface GeometryLevel {
  level: 1 | 2 | 3 | 4 | 5;
  description: string;
  recommendedMachineType: string;
  typicalMachineIds: string[];  // IDs from rate library
}

export interface MachineSpec {
  machineId: string;      // e.g. 'mach-haas-vf2' (matches rate library ID)
  brand: string;
  model: string;
  type: '3-axis_mill' | '5-axis_mill' | '2-axis_turning' | 'mill_turn';
  travelMm?: [number, number, number];
  powerKw?: number;
  mhrGbp: number;    // target MHR from dataset
}

// ─── Casting Processes ────────────────────────────────────────────────────────

export const CASTING_PROCESSES: CastingProcessInfo[] = [
  {
    name: 'Sand Casting',
    category: 'Expendable Mold',
    materials: ['Cast Iron', 'Steel', 'Aluminium', 'Magnesium', 'Bronze', 'Brass'],
    applications: ['Engine blocks', 'Pump housings', 'Machine bases'],
    advantages: ['Low cost', 'Large parts', 'Versatile'],
    limitations: ['Rough surface finish', 'Lower accuracy'],
    variants: ['Green sand', 'Dry sand', 'No-bake', 'Shell molding', 'Cold-box'],
  },
  {
    name: 'Investment Casting',
    category: 'Expendable Mold',
    materials: ['Steel', 'Stainless Steel', 'Superalloys', 'Aluminium', 'Bronze'],
    applications: ['Turbine blades', 'Aerospace parts'],
    advantages: ['High precision', 'Thin walls'],
    limitations: ['High cost'],
  },
  {
    name: 'Plaster Mold Casting',
    category: 'Expendable Mold',
    materials: ['Aluminium', 'Magnesium', 'Zinc'],
    applications: ['Aircraft components'],
    advantages: ['Excellent surface finish'],
    limitations: ['Only for low-melting metals'],
  },
  {
    name: 'Ceramic Mold Casting',
    category: 'Expendable Mold',
    materials: ['Steel', 'Stainless Steel', 'Copper Alloys'],
    applications: ['Impellers', 'Valves'],
    advantages: ['High accuracy'],
    limitations: ['Higher cost'],
  },
  {
    name: 'Lost-Foam Casting',
    category: 'Foam-Based',
    materials: ['Aluminium', 'Cast Iron', 'Steel'],
    applications: ['Engine blocks'],
    advantages: ['No parting lines'],
    limitations: ['Foam pattern cost'],
  },
  {
    name: 'High-Pressure Die Casting',
    category: 'Permanent Mold',
    materials: ['Aluminium', 'Magnesium', 'Zinc'],
    applications: ['Automotive', 'Electronics'],
    advantages: ['High production rate', 'Good surface finish'],
    limitations: ['High tooling cost'],
  },
  {
    name: 'Gravity Die Casting',
    category: 'Permanent Mold',
    materials: ['Aluminium', 'Magnesium', 'Zinc'],
    applications: ['Pistons', 'Wheels', 'Structural parts'],
    advantages: ['Better properties than sand', 'Reusable mould'],
    limitations: ['Limited complexity'],
  },
  {
    name: 'Centrifugal Casting',
    category: 'Centrifugal',
    materials: ['Cast Iron', 'Steel'],
    applications: ['Pipes', 'Cylinders'],
    advantages: ['Dense, sound castings'],
    limitations: ['Limited to symmetric parts'],
  },
];

// ─── Machining Processes ──────────────────────────────────────────────────────

export const MACHINING_PROCESSES: MachiningProcessInfo[] = [
  {
    name: 'Turning',
    subProcesses: ['Straight turning', 'Facing', 'Grooving', 'Threading', 'Hard turning'],
    tolerances: 'IT6–IT10',
    surfaceFinish: 'Ra 0.8–3.2 µm',
    costDrivers: ['Diameter', 'Length', 'Tool wear', 'Chip control'],
  },
  {
    name: 'Milling',
    subProcesses: ['Face milling', 'End milling', 'Slotting', 'Pocketing', '3-axis', '5-axis'],
    tolerances: '±0.02–0.1 mm',
    surfaceFinish: 'Ra 0.4–1.6 µm',
    costDrivers: ['Toolpath complexity', 'Setups', 'Fixturing', 'Material hardness'],
  },
  {
    name: 'Drilling/Boring/Reaming',
    subProcesses: ['Twist drilling', 'Deep-hole drilling', 'Gun drilling', 'Boring', 'Reaming'],
    costDrivers: ['Hole depth', 'Diameter', 'Coolant pressure'],
  },
  {
    name: 'Grinding',
    subProcesses: ['Surface grinding', 'Cylindrical grinding', 'Centreless'],
    tolerances: 'IT4–IT6',
    surfaceFinish: 'Ra 0.1–0.4 µm',
    costDrivers: ['Slow MRR', 'Wheel wear'],
  },
  {
    name: 'EDM',
    subProcesses: ['Wire EDM', 'Sinker EDM'],
    tolerances: '±0.005 mm',
    costDrivers: ['Slow MRR', 'Electrode wear'],
  },
  {
    name: 'Laser Machining',
    subProcesses: ['Cutting', 'Drilling', 'Ablation'],
    costDrivers: ['Beam power', 'Assist gas'],
  },
  {
    name: 'Waterjet Machining',
    subProcesses: ['Pure waterjet', 'Abrasive waterjet'],
    costDrivers: ['Abrasive cost', 'Pump pressure'],
  },
];

// ─── Geometry Complexity Levels ───────────────────────────────────────────────

export const GEOMETRY_COMPLEXITY: GeometryLevel[] = [
  {
    level: 1,
    description: 'Simple 2D — external features only',
    recommendedMachineType: '3-axis',
    typicalMachineIds: ['mach-haas-vf2', 'mach-vmc3'],
  },
  {
    level: 2,
    description: '2.5D — pockets/slots/drilled holes',
    recommendedMachineType: '3-axis',
    typicalMachineIds: ['mach-haas-vf2', 'mach-vmc3', 'mach-drill'],
  },
  {
    level: 3,
    description: 'Multi-face — 4+ setups or indexed',
    recommendedMachineType: '4/5-axis (indexed)',
    typicalMachineIds: ['mach-haas-umc500', 'mach-vmc5'],
  },
  {
    level: 4,
    description: 'Angled features + freeform surfaces',
    recommendedMachineType: '5-axis continuous',
    typicalMachineIds: ['mach-dmg-dmu50', 'mach-haas-umc500'],
  },
  {
    level: 5,
    description: 'Complex organic/turbine geometry',
    recommendedMachineType: 'High-end 5-axis',
    typicalMachineIds: ['mach-dmg-dmu50'],
  },
];

// ─── Machine Specifications ───────────────────────────────────────────────────

export const MACHINE_SPECS: MachineSpec[] = [
  {
    machineId: 'mach-haas-vf2',
    brand: 'Haas',
    model: 'VF-2',
    type: '3-axis_mill',
    travelMm: [762, 406, 508],
    powerKw: 22,
    mhrGbp: 45,
  },
  {
    machineId: 'mach-dmg-dmu50',
    brand: 'DMG Mori',
    model: 'DMU 50',
    type: '5-axis_mill',
    travelMm: [500, 450, 400],
    powerKw: 20,
    mhrGbp: 95,
  },
  {
    machineId: 'mach-haas-umc500',
    brand: 'Haas',
    model: 'UMC-500',
    type: '5-axis_mill',
    travelMm: [610, 406, 406],
    powerKw: 22,
    mhrGbp: 75,
  },
  {
    machineId: 'mach-mazak-qt200',
    brand: 'Mazak',
    model: 'Quick Turn 200',
    type: '2-axis_turning',
    powerKw: 15,
    mhrGbp: 50,
  },
];

// ─── Recommendation Helper ────────────────────────────────────────────────────

/**
 * Return rate-library machine IDs appropriate for each complexity level.
 */
export function recommendMachineIds(level: 1 | 2 | 3 | 4 | 5): string[] {
  switch (level) {
    case 1:
    case 2:
      return ['mach-haas-vf2', 'mach-vmc3'];
    case 3:
      return ['mach-haas-umc500', 'mach-vmc5'];
    case 4:
    case 5:
      return ['mach-dmg-dmu50', 'mach-haas-umc500', 'mach-vmc5'];
  }
}
