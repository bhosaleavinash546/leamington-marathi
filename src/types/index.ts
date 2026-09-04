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
  /** Which lever the engine priced: substitution | mass | tolerance | assembly | harness. */
  kind?: string;
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
  /** Prism: [E#]/[W#] dossier evidence lines this idea cites (validator-filtered). */
  evidenceRefs?: string[];
  /** Prism: which evidence lens generated this idea (vave/process/material/spec/commercial/benchmark). */
  lensId?: string;
  /** Deep-mode persona critiques (manufacturing / commercial / quality). */
  critiques?: { persona: string; personaName: string; verdict: 'strengthen' | 'challenge'; critique: string }[];
  /** Deep-mode Elo tournament stamps (bounded ×0.85–1.15 rank influence). */
  eloFactor?: number;
  eloRating?: number;
  /** Set when deep mode repaired this idea after an engine contradiction or panel challenges. */
  refined?: { fromTitle: string; note: string };
  /** Why engineCheck is null — always present when it is (no request, grade not in catalogue, nothing changed …). */
  engineCheckReason?: string;
  /** Technical-depth rubric: which of the six checkable ingredients of a deep idea are present. */
  depth?: { score: number; criteria: Record<string, { met: boolean; weight: number; detail: string }>; missing: string[] };
  /** Arithmetic re-check of the stated annual value against its own calculation basis. */
  arithmetic?: { status: 'consistent' | 'mismatch' | 'partial' | 'unparsed'; statedEur: { lo: number; hi: number; mid: number } | null; computedEur: number | null; deltaPct: number | null; basis: string | null; note: string; unpricedTerms?: string[] };
  /** The five engineering sections the prompt demands (depth over count). Absent keys were not supplied. */
  engineering?: { mechanism?: string; specDeltas?: string; validationPlan?: string; dfmImplications?: string; costBridge?: string };
  /** A specific grade named in the idea, and whether the engine catalogue can resolve it. */
  grade?: { named: string; catalogueKey: string | null; approx: boolean | null };
}

/** Server-side pipeline summary returned with every analysis (honest tallies, never inferred client-side). */
export interface AnalysisValidation {
  total?: number; kept?: number; dropped?: number; flagged?: number; avgQuality?: number;
  intraBatchMerged?: number;
  diversity?: { score: number; nearDupPairs: number };
  engineChecks?: { checked: number; confirmed: number; contradicted: number; unexpressible: number; byKind?: Record<string, number>; reasons?: Record<string, number> };
  arithmetic?: { consistent: number; mismatch: number; partial: number; unparsed: number };
  depth?: { n: number; min: number | null; median: number | null; max: number | null; spread: number | null; criteriaHitPct: Record<string, number> };
  deep?: { critiqued: number; challenges: number; eloMatches: number; refineAttempted: number; refined: number; level?: string };
  /** Prism lens coverage: which evidence lenses ran, which were available but not selected, which returned nothing. */
  lenses?: { run: string[]; skipped: string[]; empty: string[]; ideasByLens: Record<string, number> };
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
  /** Deliberation level. true/'full' = critique panel + Elo tournament + flagship repair (~3-5× tokens); 'critique' = panel + small-model repair (Prism default); 'off'/false = none. */
  deepMode?: boolean | 'critique' | 'full' | 'off';
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
  /** Pipeline summary from the server (lens coverage, engine/arithmetic/depth tallies). Absent on legacy saved results. */
  validation?: AnalysisValidation;
}
