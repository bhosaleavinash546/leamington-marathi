// ─────────────────────────────────────────────────────────────────────────────
// BrainSpark Horizon — patents as a first-class technical evidence class (DR-1).
//
// Without access to paid engineering databases (SAE Mobilus, IEEE, Elsevier),
// patents are the richest FREE source of genuine engineering detail there is.
// A granted claim set states materials, gauges, tolerances, temperatures,
// process windows and assembly sequences with a precision trade press never
// reaches, and it does so years before production. `patent-search.mjs` already
// finds patents; it returns a 320-character abstract, which is a snippet by
// another name. This module mines them.
//
// What it adds:
//   • full-document retrieval (via foresight-fetch, so the same SSRF guards,
//     byte caps and timeouts apply — patent URLs are still URLs)
//   • claim-section isolation: the claims are where the enforceable technical
//     limits live, and they read very differently from the marketing-flavoured
//     abstract
//   • deterministic technical-parameter extraction — dimensions, temperatures,
//     percentages, pressures, rates — so a reader can see at a glance whether a
//     document actually carries numbers or merely gestures at them
//   • an assignee/date view for reading WHO is filing and WHEN, which is the
//     part of patent evidence that speaks to momentum
//
// Everything degrades honestly: no PATENTSVIEW_API_KEY means `configured:false`
// and an empty set, never an invented filing.
// ─────────────────────────────────────────────────────────────────────────────
import { fetchArticles } from './foresight-fetch.mjs';

/** Units worth catching. Deliberately conservative: a false positive here
 *  becomes a "this document is technical" claim that the document cannot pay
 *  for. Ordered longest-first so 'kW/kg' wins over 'kg'. */
const UNIT_PATTERNS = [
  { kind: 'energy-density', re: /\b(\d+(?:\.\d+)?)\s?(Wh\/kg|Wh\/L|kWh\/kg)\b/gi },
  { kind: 'power-density', re: /\b(\d+(?:\.\d+)?)\s?(kW\/kg|W\/kg|kW\/L)\b/gi },
  { kind: 'conductivity', re: /\b(\d+(?:\.\d+)?)\s?(W\/mK|W\/m·K|W\/m-K)\b/gi },
  { kind: 'pressure', re: /\b(\d+(?:\.\d+)?)\s?(MPa|GPa|kPa|bar|psi)\b/g },
  { kind: 'temperature', re: /\b(-?\d+(?:\.\d+)?)\s?°?\s?(°C|degrees C|K)\b/g },
  { kind: 'dimension', re: /\b(\d+(?:\.\d+)?)\s?(mm|µm|um|micron|microns|nm|cm)\b/gi },
  { kind: 'rate', re: /\b(\d+(?:\.\d+)?)\s?(C-rate|C rate|rpm|Hz|kHz)\b/gi },
  // No trailing \b here: '%' is not a word character, so '%\b' can never match
  // and every percentage in every document was being silently dropped — caught
  // by the module's own smoke test on a claim reading "reduced by 22%".
  { kind: 'proportion', re: /(\d+(?:\.\d+)?)\s?(wt%|vol%|%)/g },
];

/**
 * Pull technical parameters out of a document.
 *
 * Deterministic and testable: no model decides whether "0.15 mm" is a
 * dimension. Returns at most `max` distinct parameters with the sentence each
 * came from, so every number stays attached to the claim that made it.
 */
export function extractParameters(text, { max = 24 } = {}) {
  const src = String(text ?? '');
  if (!src) return [];
  const sentences = src.split(/(?<=[.;:])\s+|\n+/);
  const seen = new Set();
  const out = [];
  for (const sentence of sentences) {
    if (out.length >= max) break;
    for (const { kind, re } of UNIT_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(sentence)) !== null) {
        const value = `${m[1]} ${m[2]}`.replace(/\s+/g, ' ').trim();
        const key = `${kind}:${value.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ kind, value, context: sentence.replace(/\s+/g, ' ').trim().slice(0, 240) });
        if (out.length >= max) break;
      }
      if (out.length >= max) break;
    }
  }
  return out;
}

/**
 * Isolate the claim section of a patent document.
 *
 * Claims are the enforceable technical limits and are where the real numbers
 * live; descriptions wander and abstracts sell. Returns null when the document
 * does not look like it contains claims, rather than returning the whole page
 * and calling it claims — the caller must be able to tell the difference.
 */
export function extractClaims(text) {
  const src = String(text ?? '');
  if (!src) return null;
  // Patent pages mark the section in a small number of predictable ways.
  const start = /\n\s*(claims?|what is claimed is|we claim|i claim)\s*[:.]?\s*\n/i.exec(src);
  if (!start) return null;
  const from = start.index + start[0].length;
  const rest = src.slice(from);
  // Claims usually end where the description or citations begin.
  const end = /\n\s*(description|detailed description|references cited|patent citations|similar documents|priority and related applications)\s*\n/i.exec(rest);
  const claims = (end ? rest.slice(0, end.index) : rest).trim();
  if (claims.length < 120) return null;
  return claims.slice(0, 12_000);
}

/** Registrable-ish origin for a URL, used for independence checks. */
export function originOf(url) {
  try {
    const h = new URL(String(url)).hostname.toLowerCase().replace(/^www\./, '');
    const parts = h.split('.');
    // Handle the common two-level public suffixes without shipping a full PSL.
    const twoLevel = /\.(co|com|org|net|gov|ac|edu)\.[a-z]{2}$/.test(h);
    return parts.slice(twoLevel ? -3 : -2).join('.');
  } catch { return ''; }
}

/**
 * Mine patents for a subject: find them, open the best of them, isolate claims,
 * and extract the parameters they state.
 *
 * `searchPatents` and `fetchImpl` are injected so this tests offline and so the
 * caller controls cost. Unconfigured provider ⇒ `configured:false` with an
 * empty list and a stated reason.
 */
export async function minePatents(subject, {
  searchPatents, fetchImpl = null, max = 6, read = 4, patentDeps = {},
} = {}) {
  const q = String(subject ?? '').trim();
  if (!q || typeof searchPatents !== 'function') {
    return { configured: false, patents: [], read: 0, note: 'Patent search is not available in this run.' };
  }
  let res;
  try {
    res = await searchPatents(q, '', { max }, patentDeps);
  } catch (e) {
    return { configured: false, patents: [], read: 0, note: `Patent search failed: ${String(e?.message || e).slice(0, 120)}` };
  }
  if (!res?.configured) {
    return {
      configured: false, patents: [], read: 0,
      note: 'No PatentsView API key is configured, so the single richest FREE source of technical detail was not searched. Set PATENTSVIEW_API_KEY to include patent claims in research.',
    };
  }
  const found = (res.patents ?? []).filter((p) => p?.url);
  if (!found.length) return { configured: true, patents: [], read: 0, note: 'Patent search returned no matches for this subject.' };

  // Open the most recent few — recency matters more than relevance rank here,
  // because an old patent describes a technology that already shipped.
  const ordered = [...found].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const toRead = fetchImpl ? ordered.slice(0, read) : [];
  const articles = toRead.length ? await fetchArticles(toRead.map((p) => p.url), { fetchImpl, maxChars: 30_000 }) : [];
  const byUrl = new Map(articles.filter((a) => a?.ok).map((a) => [a.url, a]));

  const patents = ordered.map((p) => {
    const art = byUrl.get(p.url);
    const claims = art ? extractClaims(art.text) : null;
    // Parameters come from the claims when we have them, and from the abstract
    // otherwise — with `basis` recording which, so nobody mistakes an abstract
    // skim for a claim reading.
    const basis = claims ? 'claims' : art ? 'full text' : 'abstract';
    const params = extractParameters(claims ?? art?.text ?? p.snippet ?? '');
    return {
      ...p,
      origin: originOf(p.url),
      read: Boolean(art),
      claims: claims ? claims.slice(0, 6000) : null,
      parameters: params,
      parameterBasis: basis,
      year: Number(String(p.date).slice(0, 4)) || null,
    };
  });

  const readCount = patents.filter((p) => p.read).length;
  return {
    configured: true,
    patents,
    read: readCount,
    note: fetchImpl
      ? `${readCount} of ${patents.length} patents were opened; parameters from ${patents.filter((p) => p.parameterBasis === 'claims').length} claim sets.`
      : `${patents.length} patents found; none opened (no fetch capability in this run), so parameters come from abstracts only.`,
  };
}

/** Filing momentum by year and assignee — who is investing, and when.
 *  Counts only; no trend adjective is asserted here (that judgement lives in
 *  foresight.mjs, which already owns patentTrend). */
export function filingProfile(patents) {
  const byYear = {};
  const byAssignee = {};
  for (const p of patents ?? []) {
    if (p.year) byYear[p.year] = (byYear[p.year] ?? 0) + 1;
    const a = String(p.assignee || 'Unassigned').trim();
    if (a && a !== 'Unassigned') byAssignee[a] = (byAssignee[a] ?? 0) + 1;
  }
  return {
    byYear,
    topAssignees: Object.entries(byAssignee).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, n]) => ({ name, filings: n })),
    span: (() => {
      const ys = Object.keys(byYear).map(Number).sort((a, b) => a - b);
      return ys.length ? { from: ys[0], to: ys.at(-1) } : null;
    })(),
  };
}
