// ─────────────────────────────────────────────────────────────────────────────
// BrainSpark Horizon — fetch-and-read for forward research (Phase 2).
//
// The Phase 0 review found the research layer had a ceiling it could never
// reach through: it reasoned over SEARCH SNIPPETS. A snippet is ~200 characters
// of marketing blurb chosen by a search engine to match a query — you cannot
// get "0.15 mm lamination at 960 MPa" or "€/kWh at 100k units" out of one, so
// no amount of prompting could make the output specific. The tool never once
// opened a page.
//
// This module opens the page. It is deliberately dependency-injected
// (`fetchImpl`) like component-pricing.mjs and patent-search.mjs, so the whole
// path is testable offline and the tests do not depend on the internet being up
// or on any third party's markup staying still.
//
// Safety is part of the contract, not an afterthought — this fetches URLs that
// ultimately came from a web search, i.e. from strangers:
//   • http/https only, and never a private, loopback or link-local host (SSRF)
//   • a byte cap enforced while STREAMING, so a hostile 2 GB response cannot
//     exhaust memory before the size check runs
//   • a wall-clock timeout per request
//   • HTML/text content types only
// A blocked or failed fetch degrades to `ok: false` with a stated reason. It
// never throws into the research pipeline and never silently becomes an empty
// document that the model might read as "the page said nothing".
// ─────────────────────────────────────────────────────────────────────────────

export const FETCH_DEFAULTS = {
  timeoutMs: 12_000,
  maxBytes: 2_000_000,   // 2 MB of HTML is far past any article
  maxChars: 20_000,      // extracted text handed to the model, per source
  concurrency: 4,
};

/** Hosts we must never fetch: loopback, link-local and RFC1918 space. Search
 *  results should never point here; if one does, something is wrong and the
 *  safe answer is to decline. */
const PRIVATE_HOST = /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|\[?fc00:|\[?fe80:)/i;

/** Redirect chain bound. Every hop is re-validated; this stops a loop. */
export const MAX_REDIRECTS = 4;

export function isFetchableUrl(u) {
  let url;
  try { url = new URL(String(u)); } catch { return { ok: false, reason: 'unparseable url' }; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: `unsupported scheme ${url.protocol}` };
  if (PRIVATE_HOST.test(url.hostname)) return { ok: false, reason: 'private or loopback host' };
  if (!url.hostname.includes('.')) return { ok: false, reason: 'not a public hostname' };
  return { ok: true, url: url.toString() };
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', deg: '°',
  micro: 'µ', times: '×', euro: '€', pound: '£', middot: '·', eacute: 'é',
};

export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}
function safeCodePoint(n) {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return '';
  try { return String.fromCodePoint(n); } catch { return ''; }
}

/** The document title, for citing a source by name rather than by bare URL. */
export function extractTitle(html) {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{2,300})["']/i.exec(html);
  if (og) return decodeEntities(og[1]).trim();
  const t = /<title[^>]*>([\s\S]{2,300}?)<\/title>/i.exec(html);
  return t ? decodeEntities(t[1]).replace(/\s+/g, ' ').trim() : '';
}

/**
 * Publication year, used to rank recency. Read from structured metadata first
 * (which is usually right) and only then from the URL path (which is a
 * convention, not a promise). Returns null when nothing states a year — and
 * null must stay null: guessing "probably recent" is how a 2016 page ends up
 * ranked as this year's frontier, the exact failure this feature exists to fix.
 */
export function publishedYearFrom(html, url = '') {
  const metas = [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["'](?:date|pubdate|publish-date|dc\.date)["'][^>]+content=["']([^"']+)["']/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
  ];
  for (const re of metas) {
    const m = re.exec(html);
    const y = m && /(19|20)\d{2}/.exec(m[1]);
    if (y) return Number(y[0]);
  }
  const inPath = /\/((?:19|20)\d{2})\/\d{1,2}\//.exec(String(url));
  if (inPath) return Number(inPath[1]);
  return null;
}

const STRIP_BLOCKS = /<(script|style|noscript|template|svg|nav|header|footer|aside|form|iframe|figure)\b[\s\S]*?<\/\1>/gi;

/**
 * HTML → readable text.
 *
 * Not a browser and not trying to be: it drops the furniture, prefers the
 * article body when the page marks one, turns block boundaries into newlines so
 * sentences do not fuse across headings, and caps the result. Good enough to
 * put real technical prose in front of the model, which is the entire point.
 */
export function extractReadable(html, { maxChars = FETCH_DEFAULTS.maxChars } = {}) {
  let s = String(html ?? '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(STRIP_BLOCKS, ' ');
  // Prefer the marked article body when there is one and it is substantial.
  const main = /<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(s);
  if (main && main[2].length > 600) s = main[2];
  s = s.replace(/<(p|div|section|li|tr|h[1-6]|br)\b[^>]*>/gi, '\n');
  s = s.replace(/<\/(p|div|section|li|tr|h[1-6])>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s.replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s.length > maxChars ? s.slice(0, maxChars) + '\n…[truncated]' : s;
}

/** Normalised form used for quote verification — whitespace and punctuation
 *  vary between what a model echoes and what the page literally contains. */
export function normaliseForMatch(s) {
  return String(s ?? '').toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[–—]/g, '-')
    // Symbols that carry meaning become tokens instead of vanishing, so "±5"
    // and "5" or "µm" and "m" are not the same quote (Oct 2026 review).
    .replace(/µ|μ/g, ' u').replace(/°/g, ' deg ').replace(/±/g, ' +- ')
    // Thousands separators: "1,200" and "1200" are the same number.
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
    .replace(/[^a-z0-9%€£$.,'\-\/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')   // the quotation marks around a quote are not part of it
    .trim();
}

/**
 * Did this quote actually come from this text?
 *
 * Used to enforce quote-or-drop on researched candidates. Exact substring
 * matching is too brittle (entities, spacing, an ellipsis the model added), so
 * a quote counts as supported when a long-enough normalised run of it appears
 * in the normalised source. Short quotes must match in full — a six-word
 * fragment matching "loosely" would verify nothing.
 */
export function quoteSupported(quote, text) {
  return matchQuote(quote, text).ok;
}

/** Numeric tokens of a normalised string. */
const numTokens = (s) => [...String(s).matchAll(/\d+(?:\.\d+)?/g)].map((m) => String(Number(m[0])));

/**
 * The quote check, with the reason. Oct 2026 review: 70% of the words in a
 * contiguous run validated the whole quote, so a changed number at either end
 * or an inserted "never" passed and the UI showed the model's edited words in
 * quotation marks. Now:
 *   • the contiguous run must cover ≥ 90% of the quote's words, and
 *   • EVERY number in the quote must lie inside the run that matched.
 * Returns { ok, exact, coverage, reason }.
 */
export function matchQuote(quote, text) {
  const q = normaliseForMatch(quote);
  const t = normaliseForMatch(text);
  if (!q || !t) return { ok: false, reason: 'empty quote or source' };
  if (q.length < 12) return { ok: false, reason: 'quote too short to prove anything' };
  if (t.includes(q)) return { ok: true, exact: true, coverage: 1 };
  const words = q.split(' ');
  if (words.length < 8) return { ok: false, reason: 'short quote not found verbatim' };
  const need = Math.max(7, Math.ceil(words.length * 0.9));
  const qNums = numTokens(q);
  for (let len = words.length - 1; len >= need; len--) {
    for (let start = 0; start + len <= words.length; start++) {
      const run = words.slice(start, start + len).join(' ');
      if (!t.includes(run)) continue;
      const runNums = new Set(numTokens(run));
      if (qNums.every((n) => runNums.has(n))) return { ok: true, exact: false, coverage: len / words.length };
      return { ok: false, reason: 'a number in the quote is not in the matched source text' };
    }
  }
  return { ok: false, reason: 'quote not found in the source (≥90% verbatim required)' };
}

/**
 * Fetch one URL and return its readable text.
 * Never throws: every failure mode comes back as `{ ok: false, error }` so the
 * caller can report honestly which sources were READ and which were not.
 */
export async function fetchArticle(url, opts = {}) {
  // Callers look pages up by the URL they ASKED for; a redirect (http→https,
  // www) used to make a page that was read look "could not be opened" because
  // only the final URL came back (Oct 2026 review).
  const out = await fetchArticleInner(url, opts);
  return { ...out, requestedUrl: String(url) };
}

async function fetchArticleInner(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = FETCH_DEFAULTS.timeoutMs,
  maxBytes = FETCH_DEFAULTS.maxBytes,
  maxChars = FETCH_DEFAULTS.maxChars,
} = {}) {
  const check = isFetchableUrl(url);
  if (!check.ok) return { url: String(url), ok: false, error: check.reason };
  if (typeof fetchImpl !== 'function') return { url: check.url, ok: false, error: 'no fetch implementation available' };

  // Follow redirects MANUALLY, re-checking each hop.
  //
  // With redirect:'follow' the guard above only ever saw the FIRST hostname, so
  // a search result that 302'd to 169.254.169.254 or to localhost was fetched
  // anyway (Sept 2026 review, R-5). isSafeWebhookUrl already worked this way;
  // this path did not. Each Location is re-validated by the same rules, and the
  // chain is bounded.
  let res, current = check.url;
  for (let hop = 0; ; hop++) {
    try {
      res = await fetchImpl(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': 'BrainSpark-Horizon/1.0 (technology foresight research)', Accept: 'text/html,application/xhtml+xml' },
      });
    } catch (e) {
      return { url: current, ok: false, error: `request failed: ${String(e?.message || e).slice(0, 120)}` };
    }
    const status = Number(res?.status ?? 0);
    if (status < 300 || status > 399) break;
    if (hop >= MAX_REDIRECTS) return { url: current, ok: false, status, error: `too many redirects (${MAX_REDIRECTS})` };
    const location = res.headers?.get?.('location');
    if (!location) break;
    let next;
    try { next = new URL(location, current).toString(); } catch { return { url: current, ok: false, status, error: 'unparseable redirect target' }; }
    const hopCheck = isFetchableUrl(next);
    if (!hopCheck.ok) return { url: current, ok: false, status, error: `redirect to a blocked host: ${hopCheck.reason}` };
    current = hopCheck.url;
  }
  if (!res?.ok) return { url: current, ok: false, status: res?.status ?? 0, error: `http ${res?.status ?? 'error'}` };
  // Everything downstream reports the FINAL url, which is what was read.
  check.url = current;

  const ctype = String(res.headers?.get?.('content-type') ?? '');
  if (ctype && !/text\/html|text\/plain|application\/xhtml/i.test(ctype)) {
    return { url: check.url, ok: false, status: res.status, error: `unreadable content-type ${ctype.split(';')[0]}` };
  }

  const html = await readCapped(res, maxBytes).catch((e) => ({ error: String(e?.message || e) }));
  if (typeof html !== 'string') return { url: check.url, ok: false, status: res.status, error: `body read failed: ${String(html?.error).slice(0, 120)}` };

  const text = extractReadable(html, { maxChars });
  if (text.length < 200) return { url: check.url, ok: false, status: res.status, error: 'page had no readable article text' };
  return {
    url: check.url,
    ok: true,
    status: res.status,
    title: extractTitle(html),
    publishedYear: publishedYearFrom(html, check.url),
    text,
    chars: text.length,
  };
}

/** Read a response body with a HARD byte cap applied while streaming, so an
 *  oversized or hostile response is abandoned rather than buffered whole. */
async function readCapped(res, maxBytes) {
  const body = res.body;
  if (!body || typeof body.getReader !== 'function') {
    const t = await res.text();
    return t.length > maxBytes ? t.slice(0, maxBytes) : t;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let out = '', total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value?.byteLength ?? 0;
    out += decoder.decode(value, { stream: true });
    if (total >= maxBytes) { try { await reader.cancel(); } catch { /* already gone */ } break; }
  }
  out += decoder.decode();
  return out;
}

/** Fetch several URLs with bounded concurrency, preserving input order. */
export async function fetchArticles(urls, opts = {}) {
  const list = [...new Set((urls ?? []).map((u) => String(u)))];
  const concurrency = Math.max(1, opts.concurrency ?? FETCH_DEFAULTS.concurrency);
  const out = new Array(list.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= list.length) return;
      out[i] = await fetchArticle(list[i], opts);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  return out.filter(Boolean);
}
