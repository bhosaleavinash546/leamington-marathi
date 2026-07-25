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

/**
 * Patent filing velocity — filings per year matching a query, for the last
 * `years` FULL calendar years (oldest first). Powers Horizon's evidence layer:
 * a rising filing count is an observable signal that a technology shift is
 * accelerating. Counts only — trend classification is foresight.mjs's job
 * (math for numbers lives in one place).
 * Unconfigured (no key) returns { configured:false, counts: [] } — callers
 * degrade honestly, never fabricate a trend.
 */
export async function patentVelocity(query, { years = 5 } = {}, deps = {}) {
  const { fetchImpl = fetch, env = process.env, now = () => Date.now() } = deps;
  const key = (env.PATENTSVIEW_API_KEY || '').trim();
  const q = String(query || '').trim();
  if (!key) return { configured: false, query: q, counts: [] };
  if (!q) return { configured: true, query: q, counts: [] };

  const cacheKey = `velocity:${q}:${years}`;
  const cached = _cache.get(cacheKey);
  if (cached && now() - cached.at < CACHE_TTL_MS) return { configured: true, query: q, counts: cached.results, cached: true };

  const lastFullYear = new Date(now()).getFullYear() - 1;
  const counts = [];
  for (let year = lastFullYear - years + 1; year <= lastFullYear; year++) {
    const body = {
      q: {
        _and: [
          { _gte: { patent_date: `${year}-01-01` } },
          { _lte: { patent_date: `${year}-12-31` } },
          { _or: [{ _text_any: { patent_title: q } }, { _text_any: { patent_abstract: q } }] },
        ],
      },
      f: ['patent_id'],
      o: { size: 1 },
    };
    const resp = await fetchImpl(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) throw new Error(`PatentsView ${resp.status}`);
    const data = await resp.json();
    counts.push({ year, count: Number(data.total_hits ?? data.total_patent_count ?? 0) });
  }
  _cache.set(cacheKey, { at: now(), results: counts });
  return { configured: true, query: q, counts };
}

export function __resetPatentCacheForTest() { _cache.clear(); }
