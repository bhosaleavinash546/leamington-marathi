/**
 * Patent search — real prior-art retrieval via the PatentsView Search API
 * (free API key: https://patentsview.org, US patent corpus).
 * ------------------------------------------------------------------
 * Powers the Patent Watch panel's upgrade from LLM-recalled patent claims
 * (explicitly unverifiable) to retrieved, citable patents with links. The
 * LLM's job shrinks to narrating design-around guidance GROUNDED in the
 * retrieved records — it never invents patent numbers.
 *
 * Dependency-injected (fetchImpl/env/now) like component-pricing.mjs so tests
 * run without a key or network. Results cached in-memory for 24h per query.
 */
import { tokenize } from './idea-index.mjs';

const API_URL = 'https://search.patentsview.org/api/v1/patent/';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const _cache = new Map();   // query → { at, results }

export function providerStatus({ env = process.env } = {}) {
  return { provider: 'patentsview', configured: !!(env.PATENTSVIEW_API_KEY || '').trim() };
}

/** Distinctive search terms from an idea title(+description) — short, deduped. */
export function buildPatentQuery(title, description = '') {
  const terms = [...new Set([...tokenize(title), ...tokenize(description)])];
  return terms.slice(0, 8).join(' ');
}

/**
 * Search patents for an idea. Returns { configured, query, patents } where
 * patents = [{ number, title, date, assignee, snippet, url }]. Unconfigured
 * (no key) returns configured:false and NO patents — the caller must degrade
 * honestly, never fabricate.
 */
export async function searchPatents(title, description = '', { max = 5 } = {}, deps = {}) {
  const { fetchImpl = fetch, env = process.env, now = () => Date.now() } = deps;
  const key = (env.PATENTSVIEW_API_KEY || '').trim();
  const query = buildPatentQuery(title, description);
  if (!key) return { configured: false, query, patents: [] };
  if (!query) return { configured: true, query, patents: [] };

  const cached = _cache.get(query);
  if (cached && now() - cached.at < CACHE_TTL_MS) return { configured: true, query, patents: cached.results, cached: true };

  const body = {
    q: { _or: [{ _text_any: { patent_title: query } }, { _text_any: { patent_abstract: query } }] },
    f: ['patent_id', 'patent_title', 'patent_date', 'patent_abstract', 'assignees.assignee_organization'],
    o: { size: Math.min(Math.max(1, max), 10) },
    s: [{ patent_date: 'desc' }],
  };
  const resp = await fetchImpl(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`PatentsView ${resp.status}`);
  const data = await resp.json();
  const patents = (data.patents || []).map(p => ({
    number: String(p.patent_id || ''),
    title: String(p.patent_title || '').slice(0, 200),
    date: String(p.patent_date || ''),
    assignee: String(p.assignees?.[0]?.assignee_organization || 'Unassigned').slice(0, 120),
    snippet: String(p.patent_abstract || '').slice(0, 320),
    url: p.patent_id ? `https://patents.google.com/patent/US${String(p.patent_id).replace(/^US/i, '')}` : '',
  })).filter(p => p.number);
  _cache.set(query, { at: now(), results: patents });
  return { configured: true, query, patents };
}

export function __resetPatentCacheForTest() { _cache.clear(); }
