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
  paybackMonths?: number | null;
}

/** Deterministic cost-engine cross-check stamped by the server (or null when the move is not engine-expressible). */
export interface EngineCheck {
  referenceCase: string;
  baselineEur: number;
  proposedEur: number;
  savingPct: number;
  direction: 'confirmed' | 'contradicted';
  basis: string;
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
  /** false = generated with live retrieval; true/undefined = sources are model-asserted, not independently verified. */
  evidenceUnverified?: boolean;
  validationFlags?: string[];
  regulatoryContext?: string;
  materialGrade?: string;
  qualityScore?: number;
  engineCheck?: EngineCheck | null;
  /** Closest existing marketplace idea when this one is a near-restatement. */
  priorArt?: { id: string; title: string; score: number };
  /** Resembles an idea this org previously approved/confirmed — powers a visible ranking boost. */
  tasteMatch?: { title: string; score: number };
  /** Titles of near-duplicate ideas folded into this one by the server dedup pass. */
  mergedTitles?: string[];
  /** Server-computed explainable value ranking (annual value × payback × quality × engine check × evidence × taste). */
  rank?: { score: number; basis: string };
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
  trizLens?: boolean;   // deprecated — kept for back-compat
  lenses?: string[];    // innovation lenses to apply (method ids)
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
