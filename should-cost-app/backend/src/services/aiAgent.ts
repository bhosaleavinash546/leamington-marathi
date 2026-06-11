// ============================================================
// AI Agent Service — Should-Cost vs Quote Analysis
// Uses Anthropic Claude when ANTHROPIC_API_KEY is set,
// falls back to mock otherwise (dev / offline mode).
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { ComparisonDetail, AIInsight, AIInsightFlag } from '../models/types';

const PROMPT_VERSION = '2.0';

let _client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// ---------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------
export function buildComparisonPrompt(details: ComparisonDetail[]): string {
  const rows = details
    .map(
      (d) =>
        `  - ${d.costElement} (${d.category ?? 'n/a'}): ` +
        `Should-Cost = ${d.shouldCostValue}, Quote = ${d.quoteValue}, ` +
        `Variance = ${d.variance} (${(d.variancePct ?? 0).toFixed(1)}%)`
    )
    .join('\n');

  return `You are a senior cost-engineering analyst in the automotive industry.

Below is a cost breakdown comparison between an internal Should-Cost estimate and a supplier quote.
Analyse each line item and respond ONLY in valid JSON matching this schema:

{
  "summary": "<2-3 sentence overall assessment with specific numbers>",
  "confidence": <integer 1-5>,
  "flags": [
    { "element": "<cost_element>", "reason": "<why flagged>", "severity": "low|medium|high" }
  ],
  "questions": ["<targeted question for supplier>"],
  "recommendations": ["<specific actionable recommendation>"]
}

Rules:
- Flag any element where quote > should-cost by more than 10% as 'high'.
- Flag 5-10% above as 'medium'.
- Flag elements >15% BELOW should-cost — may indicate quality/scope gaps.
- Questions must be targeted to the largest variances.
- Recommendations must be actionable (e.g. "Request tooling cost justification and tool life estimate").
- Confidence: 5 = high-quality data, 1 = sparse/unreliable data.

Comparison data:
${rows}

Respond with valid JSON only — no markdown fences.`;
}

export function buildShouldCostPrompt(
  partDescription: string,
  commodity: string,
  annualVolume: number,
  currency: string,
  processNotes?: string
): string {
  return `You are a senior automotive cost engineer with 15+ years of experience in should-cost modelling.

Part: "${partDescription}"
Commodity: ${commodity}
Annual Volume: ${annualVolume.toLocaleString()} units/year
Currency: ${currency}
${processNotes ? `Process notes: ${processNotes}` : ''}

Propose a realistic should-cost breakdown for this part. Respond ONLY in valid JSON:

{
  "total_cost": <number>,
  "currency": "${currency}",
  "basis": "<brief justification of methodology>",
  "breakdown": [
    {
      "cost_element": "<element name>",
      "category": "RAW_MATERIAL|BOP|MANUFACTURING|OVERHEAD|LOGISTICS|TOOLING|PROFIT",
      "value": <number>,
      "basis": "<unit basis e.g. $/kg, $/hr, % of cost>",
      "notes": "<optional brief note>"
    }
  ]
}

Guidelines:
- Use realistic industry benchmarks for this commodity and volume tier.
- Typical category split for a stamped steel part: RAW_MATERIAL 35-45%, MANUFACTURING 20-28%, OVERHEAD 10-15%, LOGISTICS 5-8%, TOOLING 5-10%, PROFIT 6-10%.
- Adjust splits for the actual commodity (castings, electronics, rubber, etc.).
- Values must sum to total_cost.
- Include 5-8 cost elements.

Respond with valid JSON only — no markdown fences.`;
}

export function buildWeeklyDigestPrompt(data: {
  openOpportunities: number;
  totalSavingsIdentified: number;
  negotiationsOpenThisWeek: number;
  negotiationsDueThisWeek: number;
  staleShouldCosts: number;
  newQuotesThisWeek: number;
  topOpportunity: { part: string; supplier: string; saving: number } | null;
  currency: string;
}): string {
  return `You are a cost-engineering AI assistant. Write a concise weekly digest (5 bullets max) for an automotive cost engineering team.

Data for this week:
- Open savings opportunities: ${data.openOpportunities}
- Total savings identified: ${data.currency} ${data.totalSavingsIdentified.toLocaleString()}
- Active negotiations: ${data.negotiationsOpenThisWeek} (${data.negotiationsDueThisWeek} due this week)
- Stale should-costs (>12 months old): ${data.staleShouldCosts}
- New supplier quotes received: ${data.newQuotesThisWeek}
${data.topOpportunity ? `- Top opportunity: ${data.topOpportunity.part} with ${data.topOpportunity.supplier} — ${data.currency} ${data.topOpportunity.saving.toLocaleString()} potential saving` : ''}

Write a professional, action-oriented summary as plain text bullet points. Be specific with numbers. No fluff. End with one priority action for the week.`;
}

export function buildNLSearchPrompt(
  question: string,
  schemaHint: string
): string {
  return `You are a PostgreSQL expert. Convert the following natural-language question into a safe, read-only SQL query.

Database tables available:
${schemaHint}

Question: "${question}"

Rules:
- Return ONLY a JSON object: { "sql": "<query>", "label": "<short description>" }
- The SQL must be a SELECT only — no INSERT/UPDATE/DELETE/DROP.
- Use table aliases. Limit results to 50 rows unless the question implies otherwise.
- Join part_master, supplier, should_cost_header, supplier_quote_header as needed.
- Do not use subqueries that reference non-existent columns.

Respond with valid JSON only — no markdown fences.`;
}

// ---------------------------------------------------------------
// Core LLM call — streaming and non-streaming
// ---------------------------------------------------------------
export async function callClaude(prompt: string): Promise<string> {
  const client = getClient();
  if (!client) return callMock(prompt);

  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = msg.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude');
  return block.text;
}

export async function* streamClaude(prompt: string): AsyncGenerator<string> {
  const client = getClient();
  if (!client) {
    // Stream mock response token by token
    const mockText = JSON.stringify(getMockInsight());
    for (const ch of mockText) {
      yield ch;
      await new Promise((r) => setTimeout(r, 2));
    }
    return;
  }

  const stream = client.messages.stream({
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield event.delta.text;
    }
  }
}

// ---------------------------------------------------------------
// Mock fallback (used when ANTHROPIC_API_KEY not set)
// ---------------------------------------------------------------
function getMockInsight() {
  return {
    summary:
      'The supplier quote is approximately 8% above the internal should-cost estimate. ' +
      'The primary driver is the Raw Material line which is 18% over target, suggesting ' +
      'possible grade substitution or margin loading. Labour and overhead are within tolerance.',
    confidence: 3,
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
      'Agree on an open-book clause for tooling costs exceeding £5,000.',
    ],
  };
}

function callMock(_prompt: string): string {
  console.log('[aiAgent] Mock mode — set ANTHROPIC_API_KEY for real Claude.');
  return JSON.stringify(getMockInsight());
}

// ---------------------------------------------------------------
// generateInsights — main entry called by aiController
// ---------------------------------------------------------------
export async function generateInsights(
  snapshotId: number,
  details: ComparisonDetail[],
  userId?: string
): Promise<Omit<AIInsight, 'id' | 'generatedAt'>> {
  const prompt = buildComparisonPrompt(details);
  const rawText = await callClaude(prompt);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    throw new Error('Claude returned non-JSON response');
  }

  return {
    comparisonSnapshotId: snapshotId,
    modelUsed: process.env.ANTHROPIC_API_KEY
      ? (process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6')
      : 'mock',
    promptVersion: PROMPT_VERSION,
    summary: parsed['summary'] as string,
    flags: parsed['flags'] as AIInsightFlag[],
    questions: parsed['questions'] as string[],
    recommendations: parsed['recommendations'] as string[],
    rawResponse: parsed,
    generatedBy: userId,
  };
}
