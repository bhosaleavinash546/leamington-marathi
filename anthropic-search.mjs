// ─────────────────────────────────────────────────────────────────────────────
// Anthropic's server-side web search, as Analyze uses it.
//
// Before 29 Sept 2026 the only web search was the app's own `web_search` tool
// backed by Brave — and with no Brave key it fell back to DuckDuckGo's
// instant-answer API, which returns nothing for engineering questions, so every
// search in a live run read "0 results found". Anthropic's tool runs the search
// on Anthropic's side, needs no second key, and is billed through the same
// account ($10 per 1,000 searches plus the tokens of the results read).
//
// The tool runs INSIDE one Messages response: the model's query arrives as a
// `server_tool_use` block and the results as a `web_search_tool_result` block
// in the same `content`. This module turns those blocks into the `sources`
// shape the rest of the pipeline (and the progress feed) already uses. Pure.
// ─────────────────────────────────────────────────────────────────────────────

/** Searches per Analyze run. Each is a cent; the cap bounds cost and time. */
export const MAX_WEB_SEARCHES = 5;

export function serverWebSearchTool(maxUses = MAX_WEB_SEARCHES) {
  return { type: 'web_search_20260209', name: 'web_search', max_uses: maxUses };
}

const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

/**
 * Searches in a response's content, paired with their results.
 *
 * A turn that PAUSES mid-search carries the query block without its result;
 * the result arrives in the resumed response. Such a query waits in `pending`
 * and is reported when its result lands — not recorded early as "0 results".
 *
 * @param {Array} content  response.content
 * @param {Set<string>} [seen]  ids already reported
 * @param {Map<string,string>} [pending]  id → query, awaiting a result block
 * @returns {Array<{id, query, results, error}>}
 */
export function harvestServerSearches(content, seen = new Set(), pending = new Map()) {
  const blocks = Array.isArray(content) ? content : [];
  for (const b of blocks) {
    if (b?.type === 'server_tool_use' && b.name === 'web_search' && !seen.has(b.id)) pending.set(b.id, String(b.input?.query ?? ''));
  }
  const out = [];
  for (const r of blocks) {
    if (r?.type !== 'web_search_tool_result' || seen.has(r.tool_use_id) || !pending.has(r.tool_use_id)) continue;
    const c = r.content;
    // Success is a LIST of results; an error is a single OBJECT with error_code.
    const results = Array.isArray(c)
      ? c.filter(x => x?.url).slice(0, 8).map(x => ({
          title: String(x.title || host(x.url)).slice(0, 160), url: x.url,
          snippet: x.page_age ? `Page age: ${x.page_age}` : '', source: host(x.url),
        }))
      : [];
    const error = !Array.isArray(c) && c && typeof c === 'object' ? String(c.error_code || 'search_error') : null;
    out.push({ id: r.tool_use_id, query: pending.get(r.tool_use_id), results, error });
    seen.add(r.tool_use_id); pending.delete(r.tool_use_id);
  }
  return out;
}

/**
 * Complete ideas from an emit_ideas call that was CUT OFF at max_tokens.
 *
 * The streamed tool input is JSON — `{"ideas":[{…},{…},{…` — and a cut-off
 * one does not parse, so the whole run used to be thrown away with every
 * complete idea in it (29 Sept 2026, live: "hit the 24,000-token output limit
 * and the idea list was cut off"). This keeps every idea whose object closed.
 * @returns {Array} the complete ideas (possibly empty)
 */
export function salvageIdeasFromPartialJson(partial) {
  const s = String(partial ?? '');
  const k = s.search(/"ideas"\s*:\s*\[/);
  if (k < 0) return [];
  const start = s.indexOf('[', k);
  let depth = 0, inString = false, escape = false, lastEnd = -1;
  for (let i = start + 1; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === '\\' && inString) { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0 && c === '}') lastEnd = i;
      if (depth < 0) break;          // the array itself closed
    }
  }
  if (lastEnd < 0) return [];
  try {
    const arr = JSON.parse(s.slice(start, lastEnd + 1) + ']');
    return Array.isArray(arr) ? arr.filter(x => x && typeof x === 'object') : [];
  } catch { return []; }
}
