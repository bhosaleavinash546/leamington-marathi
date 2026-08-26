export interface MarketplaceIdeaRow {
  id: string;
  title: string;
  system: string;
  costSavingType: string;
  annualSaving: string;
  difficulty: string;
  timeToImplement: string;
  stars: number;
  votes?: number;
  verified: boolean | number;
  description: string;
  ideaData?: string | object | null;
  level?: string | null;
  origin?: 'curated' | 'community' | null;
}

export interface FilterState {
  searchQ?: string;
  commodity?: string;
  system?: string;
  difficulty?: string;
  level?: string;
  powertrain?: string;
  voltage?: string;
  theme?: boolean;
  sortBy?: string;
}

export function parseIdeaData(raw: string | object | null | undefined): any | null;
export function provenanceLabel(idea: MarketplaceIdeaRow, parsed: any | null): string;
export function benchmarkLine(parsed: any | null): string | null;
export function savingsLines(csp: any): string[];
export function ideaSections(idea: MarketplaceIdeaRow, parsed: any | null): [string, string][];
export function filterLine(f: FilterState): string;
export function verifiedSplit(ideas: Array<{ verified: boolean | number }> | null | undefined): { verified: number; unverified: number; total: number };
