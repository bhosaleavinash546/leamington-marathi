export interface Part {
  id: string;
  name: string;
  description: string;
}

export interface Subassembly {
  id: string;
  name: string;
  description: string;
  icon: string;
  parts: Part[];
}

export interface System {
  id: string;
  name: string;
  category: 'mechanical' | 'electrical' | 'electronics' | 'ev' | 'ice' | 'body' | 'interior' | 'chassis';
  description: string;
  icon: string;
  color: string;
  subassemblies: Subassembly[];
}

export type CostSavingType = 'material' | 'process' | 'logistics' | 'complexity' | 'warranty' | 'tooling' | 'weight';
export type Difficulty = 'Low' | 'Medium' | 'High';
export type SystemLevel = 'Assembly' | 'Subassembly' | 'Part';

export interface CostSavingPotential {
  qualitative: string;
  percentage?: string;
  annualValue?: string;
}

export interface CostReductionIdea {
  id: string;
  title: string;
  technicalDescription: string;
  manufacturingImpact: string;
  costSavingTypes: CostSavingType[];
  costSavingPotential: CostSavingPotential;
  implementationDifficulty: Difficulty;
  riskNotes: string;
  dfmaPrinciples: string[];
  systemLevel: SystemLevel;
  timeToImplement: string;
  benchmarkReference?: string;
}

export interface AnalysisConfig {
  systemId: string;
  subassemblyId: string;
  partId?: string;
  vehicleType: string;
  cadFileName?: string;
  cadFileType?: string;
  additionalContext?: string;
  apiKey: string;
}

export interface AnalysisResult {
  config: AnalysisConfig;
  ideas: CostReductionIdea[];
  summary: {
    totalIdeas: number;
    totalPotentialSaving: string;
    quickWins: number;
    strategicItems: number;
  };
  generatedAt: string;
}
