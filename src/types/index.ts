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

export type CostSavingType =
  | 'material' | 'process' | 'logistics' | 'complexity'
  | 'warranty' | 'tooling' | 'weight' | 'commonisation';

export type Difficulty = 'Low' | 'Medium' | 'High';
export type SystemLevel = 'Assembly' | 'Subassembly' | 'Part';

export type BodyStyle = 'hatchback' | 'sedan' | 'suv' | 'coupe' | 'pickup' | 'mpv' | 'crossover' | 'universal';
export type PlantRegion = 'germany' | 'uk' | 'czech' | 'spain' | 'mexico' | 'usa' | 'china' | 'india' | 'korea';
export type Currency = 'EUR' | 'GBP' | 'USD' | 'CNY';
export type ConfidenceLevel = 'verified' | 'benchmarked' | 'estimated' | 'theoretical';

export type AnnotationStatus = 'pending' | 'investigating' | 'approved' | 'rejected' | 'on-hold';

export interface IdeaAnnotation {
  status: AnnotationStatus;
  note: string;
  updatedAt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ProgressEvent {
  type: 'connecting' | 'searching' | 'search_done' | 'synthesizing' | 'complete' | 'error';
  message?: string;
  query?: string;
  purpose?: string;
  searchNumber?: number;
  resultCount?: number;
}

export interface CostSavingPotential {
  qualitative: string;
  percentage?: string;
  annualValue?: string;
  calculationBasis?: string;
}

export interface EvidenceSource {
  type: 'oem_press_release' | 'teardown' | 'patent' | 'industry_report' | 'supplier_data' | 'web_search' | 'regulatory';
  title: string;
  url?: string;
  year?: number;
  confidence: 'high' | 'medium' | 'low';
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
  searchDataUsed?: boolean;
  confidenceLevel?: ConfidenceLevel;
  evidenceSources?: EvidenceSource[];
  regulatoryContext?: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface SearchSource {
  query: string;
  purpose: string;
  results: SearchResult[];
  timestamp: string;
}

export interface AnalysisConfig {
  systemId: string;
  subassemblyId: string;
  partId?: string;
  vehicleType: string;
  bodyStyle?: BodyStyle;
  annualVolume?: number;
  plantRegion?: PlantRegion;
  currency?: Currency;
  programmeLengthYears?: number;
  cadFileName?: string;
  cadFileType?: string;
  additionalContext?: string;
  cadGeometry?: Record<string, unknown>;
  apiKey: string;
}

export interface AnalysisResult {
  id?: string;
  config: AnalysisConfig;
  ideas: CostReductionIdea[];
  sources: SearchSource[];
  summary: {
    totalIdeas: number;
    quickWins: number;
    programmeItems?: number;
    strategicItems: number;
    searchesPerformed: number;
  };
  generatedAt: string;
}
