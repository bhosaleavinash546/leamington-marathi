import { AnalysisConfig, CostReductionIdea, SearchSource } from '../types';

export interface AnalysisResponse {
  ideas: CostReductionIdea[];
  sources: SearchSource[];
}

function getAuthToken(): string | null {
  try {
    const stored = localStorage.getItem('brainspark_auth');
    if (stored) {
      const { token } = JSON.parse(stored);
      return token ?? null;
    }
  } catch {}
  return null;
}

export function saveRecentAnalysis(
  systemName: string,
  subassemblyName: string,
  partName: string | undefined,
  ideasCount: number
) {
  try {
    const stored = localStorage.getItem('brainspark_recent_analyses');
    const analyses = stored ? JSON.parse(stored) : [];
    analyses.unshift({
      id: Math.random().toString(36).slice(2),
      systemName,
      subassemblyName,
      partName,
      ideasCount,
      date: new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }),
    });
    localStorage.setItem('brainspark_recent_analyses', JSON.stringify(analyses.slice(0, 20)));
  } catch {}
}

export async function generateCostReductionIdeas(
  config: AnalysisConfig,
  systemName: string,
  subassemblyName: string,
  partName?: string,
  enableSearch = true,
  searchApiKey?: string
): Promise<AnalysisResponse> {
  const token = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers,
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

  const result: AnalysisResponse = await response.json();
  saveRecentAnalysis(systemName, subassemblyName, partName, result.ideas.length);
  return result;
}
