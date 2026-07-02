import { AnalysisConfig, CostReductionIdea, SearchSource } from '../types';

export type ChatHistory = { role: 'user' | 'assistant'; content: string }[];

export interface ProgressEvent {
  type: 'connecting' | 'searching' | 'search_done' | 'synthesizing' | 'complete' | 'error';
  message?: string;
  query?: string;
  purpose?: string;
  searchNumber?: number;
  resultCount?: number;
  ideas?: unknown[];
  sources?: unknown[];
}

export interface AnalysisResponse {
  ideas: CostReductionIdea[];
  sources: SearchSource[];
  resultId: string;
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
  ideasCount: number,
  id?: string
): string {
  const resultId = id || Math.random().toString(36).slice(2);
  try {
    const stored = localStorage.getItem('brainspark_recent_analyses');
    const analyses = stored ? JSON.parse(stored) : [];
    analyses.unshift({
      id: resultId,
      systemName,
      subassemblyName,
      partName,
      ideasCount,
      date: new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }),
    });
    localStorage.setItem('brainspark_recent_analyses', JSON.stringify(analyses.slice(0, 20)));
  } catch {}
  return resultId;
}

export function saveFullResult(id: string, result: unknown, systemName: string, subName: string): void {
  try {
    const stored = localStorage.getItem('brainspark_full_results');
    const results: unknown[] = stored ? JSON.parse(stored) : [];
    results.unshift({ id, systemName, subName, result, savedAt: new Date().toISOString() });
    localStorage.setItem('brainspark_full_results', JSON.stringify(results.slice(0, 10)));
  } catch {}
}

export function loadFullResult(id: string): unknown | null {
  try {
    const stored = localStorage.getItem('brainspark_full_results');
    if (!stored) return null;
    const results: Array<{ id: string; result: unknown }> = JSON.parse(stored);
    return results.find(r => r.id === id)?.result ?? null;
  } catch {
    return null;
  }
}

export async function generateCostReductionIdeas(
  config: AnalysisConfig,
  systemName: string,
  subassemblyName: string,
  partName?: string,
  enableSearch = true,
  searchApiKey?: string,
  onProgress?: (event: ProgressEvent) => void
): Promise<AnalysisResponse> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  };
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
      cadGeometry: config.cadGeometry,
    }),
  });

  if (!response.ok) {
    let errorMsg = `Server error ${response.status}`;
    try { const err = await response.json(); errorMsg = err.error || errorMsg; } catch {}
    throw new Error(errorMsg);
  }

  if (!response.body) throw new Error('Streaming not supported by this browser or proxy.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';

    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line.startsWith('data: ')) continue;
      let data: ProgressEvent & { ideas?: CostReductionIdea[]; sources?: SearchSource[] };
      try {
        data = JSON.parse(line.slice(6));
      } catch {
        continue;
      }

      if (data.type === 'complete') {
        const ideas = (data as unknown as { ideas: CostReductionIdea[]; projectId?: string }).ideas;
        const sources = (data as unknown as { sources: SearchSource[]; projectId?: string }).sources;
        const serverProjectId = (data as unknown as { projectId?: string }).projectId;
        const resultId = saveRecentAnalysis(systemName, subassemblyName, partName, ideas.length, serverProjectId || undefined);
        return { ideas, sources, resultId };
      }
      if (data.type === 'error') {
        throw new Error(data.message || 'Analysis failed');
      }
      onProgress?.(data);
    }
  }

  throw new Error('Stream ended without a complete event.');
}

export async function sendChatMessage(
  ideas: CostReductionIdea[],
  config: AnalysisConfig,
  systemName: string,
  subassemblyName: string,
  history: ChatHistory,
  message: string,
  apiKey: string,
  onChunk: (text: string) => void
): Promise<string> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({ apiKey, ideas, config, systemName, subassemblyName, history, message }),
  });

  if (!response.ok) {
    let errorMsg = `Server error ${response.status}`;
    try { const err = await response.json(); errorMsg = err.error || errorMsg; } catch {}
    throw new Error(errorMsg);
  }

  if (!response.body) throw new Error('Streaming not supported by this browser or proxy.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line.startsWith('data: ')) continue;
      let data: { type: string; text?: string; message?: string };
      try { data = JSON.parse(line.slice(6)); } catch { continue; }
      if (data.type === 'chunk' && data.text) { fullText += data.text; onChunk(data.text); }
      if (data.type === 'error') throw new Error(data.message || 'Chat failed');
    }
  }
  return fullText;
}
