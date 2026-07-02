export type VolumeCategory = 'low' | 'medium' | 'high';
export type ComplexityLevel = 'low' | 'medium' | 'high';
export type HoleDensityLevel = 'low' | 'high';

export interface ProcessAdvisorInputs {
  annualVolume: number;
  thicknessMm: number;
  complexity: ComplexityLevel;
  holeDensity: HoleDensityLevel;
  materialFamily: 'steel' | 'stainless' | 'aluminium' | 'galvanised';
}

export interface SheetMetalProcessRecommendation {
  primaryProcess: string;
  formingProcess: string;
  processRoute: string[];
  suggestedMachineIds: string[];
  toolingBand: string;
  toleranceCapability: string;
  reason: string;
  volumeCategory: VolumeCategory;
}

export function classifyVolume(annualVolume: number): VolumeCategory {
  if (annualVolume < 1000) return 'low';
  if (annualVolume < 50000) return 'medium';
  return 'high';
}

export function adviseSheetMetalProcess(inputs: ProcessAdvisorInputs): SheetMetalProcessRecommendation {
  const volumeCategory = classifyVolume(inputs.annualVolume);

  if (volumeCategory === 'high' && inputs.thicknessMm <= 3) {
    return {
      primaryProcess: 'Progressive Stamping',
      formingProcess: 'Progressive Stamping',
      processRoute: ['Coil Feeding', 'Progressive Stamping', 'Inline Inspection'],
      suggestedMachineIds: ['press-schuler-400t', 'press-aida-200t'],
      toolingBand: '£50k–£250k (progressive die)',
      toleranceCapability: '±0.05–0.15 mm',
      reason: 'High volume favours progressive stamping — lowest piece cost once tooling amortized',
      volumeCategory,
    };
  }

  if (volumeCategory === 'medium' && inputs.holeDensity === 'high') {
    return {
      primaryProcess: 'Turret Punching',
      formingProcess: 'Press Brake Bending',
      processRoute: ['Turret Punching', 'Press Brake Bending', 'Deburring'],
      suggestedMachineIds: ['punch-amada-emz3610', 'brake-amada-hfe100'],
      toolingBand: '£2k–£10k (standard punch tooling)',
      toleranceCapability: '±0.1–0.2 mm',
      reason: 'High hole density favours punching over laser (lower cost per hit at medium volume)',
      volumeCategory,
    };
  }

  const isSpecialMaterial =
    inputs.materialFamily === 'stainless' || inputs.materialFamily === 'aluminium';

  let reason: string;
  if (volumeCategory === 'low') {
    reason = isSpecialMaterial
      ? 'laser produces clean dross-free edge on stainless/aluminium; no hard tooling needed at low volume'
      : 'low volume — no hard tooling needed; laser cutting minimises NRE';
  } else if (isSpecialMaterial) {
    reason = 'laser produces clean dross-free edge on stainless/aluminium';
  } else {
    reason = 'high complexity or medium volume without high hole density — laser offers flexibility with low tooling cost';
  }

  return {
    primaryProcess: 'Laser Cutting',
    formingProcess: 'Press Brake Bending',
    processRoute: ['Laser Cutting', 'Press Brake Bending', 'Deburring'],
    suggestedMachineIds: ['laser-trumpf-3030', 'brake-trumpf-5230'],
    toolingBand: '£500–£3k (nest programming only)',
    toleranceCapability: '±0.1–0.2 mm',
    reason,
    volumeCategory,
  };
}
