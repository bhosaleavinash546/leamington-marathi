import { AnalysisConfig, CostReductionIdea, SearchSource } from '../types';

export interface AnalysisResponse {
  ideas: CostReductionIdea[];
  sources: SearchSource[];
}

export async function generateCostReductionIdeas(
  config: AnalysisConfig,
  systemName: string,
  subassemblyName: string,
  partName?: string,
  enableSearch = true,
  searchApiKey?: string
): Promise<AnalysisResponse> {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config,
      systemName,
      subassemblyName,
      partName,
      enableSearch,
      searchApiKey,
    }),
  });

  if (!response.ok) {
    let errorMsg = `Server error ${response.status}`;
    try {
      const err = await response.json();
      errorMsg = err.error || errorMsg;
    } catch {}
    throw new Error(errorMsg);
  }

  return response.json();
}
