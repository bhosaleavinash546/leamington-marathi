// ============================================================
// AI Agent Service — Should-Cost vs Quote Analysis
//
// Currently MOCKED. To use a real LLM:
//   1. Set LLM_API_KEY and LLM_API_URL in .env
//   2. Replace the mock block inside callLLM() with a real HTTP call
//   3. Parse the JSON returned by the model using the same schema
// ============================================================

import { ComparisonDetail, AIInsight, AIInsightFlag } from '../models/types';

const PROMPT_VERSION = '1.0';

// ---------------------------------------------------------------
// Prompt template — injected with serialised comparison data
// ---------------------------------------------------------------
export function buildPrompt(details: ComparisonDetail[]): string {
  const rows = details
    .map(
      (d) =>
        `  - ${d.costElement} (${d.category ?? 'n/a'}): ` +
        `Should-Cost = ${d.shouldCostValue}, Quote = ${d.quoteValue}, ` +
        `Variance = ${d.variance} (${((d.variancePct ?? 0)).toFixed(1)}%)`
    )
    .join('\n');

  return `You are a senior cost-engineering analyst.

Below is a cost breakdown comparison between an internal Should-Cost estimate and a supplier quote.
Analyse each line item and respond ONLY in valid JSON matching this schema:

{
  "summary": "<2-3 sentence overall assessment>",
  "flags": [
    { "element": "<cost_element>", "reason": "<why flagged>", "severity": "low|medium|high" }
  ],
  "questions": ["<clarifying question 1>", "..."],
  "recommendations": ["<recommended action 1>", "..."]
}

Rules:
- Flag any element where the quote is more than 10% above the should-cost as 'high'.
- Flag elements 5–10% above as 'medium'.
- Flag elements where the quote is significantly (>15%) below should-cost; might indicate quality or scope gaps.
- Ask targeted questions to understand root cause of the largest variances.
- Recommendations must be actionable (e.g. "Request tooling cost justification", "Benchmark overhead rate").

Comparison data:
${rows}

Respond with valid JSON only — no markdown fences.`;
}

// ---------------------------------------------------------------
// callLLM — swap the mock block for a real HTTP call when ready
// ---------------------------------------------------------------
async function callLLM(prompt: string): Promise<Record<string, unknown>> {
  // ── REAL CALL (uncomment and fill in when you have an API key) ──────────────
  // const response = await fetch(process.env.LLM_API_URL!, {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     'x-api-key': process.env.LLM_API_KEY!,
  //     'anthropic-version': '2023-06-01',
  //   },
  //   body: JSON.stringify({
  //     model: 'claude-sonnet-4-6',
  //     max_tokens: 1024,
  //     messages: [{ role: 'user', content: prompt }],
  //   }),
  // });
  // const data = await response.json();
  // const text = data.content[0].text as string;
  // return JSON.parse(text) as Record<string, unknown>;
  // ─────────────────────────────────────────────────────────────────────────────

  // ── MOCK RESPONSE (remove when real call is active) ──────────────────────────
  console.log('[aiAgent] Mock LLM called. Prompt length:', prompt.length);
  return {
    summary:
      'The supplier quote is approximately 8% above the internal should-cost estimate. ' +
      'The primary driver is the Raw Material line which is 18% over target, suggesting ' +
      'possible grade substitution or margin loading. Labor and overhead are within tolerance.',
    flags: [
      {
        element: 'Raw Material',
        reason: 'Quote is 18% above should-cost. Verify material spec and market index used.',
        severity: 'high',
      },
      {
        element: 'Tooling Amortisation',
        reason: 'Quote is 12% above should-cost. Request tooling cost breakdown and life estimate.',
        severity: 'medium',
      },
      {
        element: 'Profit / Margin',
        reason: 'Quote margin (12%) is above the benchmark (8%) for this commodity.',
        severity: 'medium',
      },
    ],
    questions: [
      'Which material grade and market index was used to price the Raw Material line?',
      'What is the assumed annual volume for tooling amortisation?',
      'Is the quoted overhead rate site-specific or corporate blended?',
      'Does the quote include packaging and inbound freight?',
    ],
    recommendations: [
      'Request a detailed material cost breakdown with the specific alloy spec and current spot price.',
      'Benchmark overhead absorption rate against comparable facilities in the same region.',
      'Negotiate the profit margin toward the 8-9% commodity benchmark.',
      'Agree on an open-book clause for tooling costs exceeding $5,000.',
    ],
  };
  // ─────────────────────────────────────────────────────────────────────────────
}

// ---------------------------------------------------------------
// generateInsights — main entry point called by the controller
// ---------------------------------------------------------------
export async function generateInsights(
  snapshotId: number,
  details: ComparisonDetail[],
  userId?: string
): Promise<Omit<AIInsight, 'id' | 'generatedAt'>> {
  const prompt = buildPrompt(details);
  const raw = await callLLM(prompt);

  return {
    comparisonSnapshotId: snapshotId,
    modelUsed: process.env.LLM_MODEL ?? 'mock',
    promptVersion: PROMPT_VERSION,
    summary: raw['summary'] as string,
    flags: raw['flags'] as AIInsightFlag[],
    questions: raw['questions'] as string[],
    recommendations: raw['recommendations'] as string[],
    rawResponse: raw,
    generatedBy: userId,
  };
}
