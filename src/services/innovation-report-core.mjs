// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers behind the Innovation Studio report (PDF + Excel).
//
// Kept as plain .mjs, like pdf-safe.mjs, so node:test can exercise them with no
// build step. Nothing here knows about jsPDF or exceljs: verdictOf returns a
// semantic tone and the renderer picks the colour, so the honesty rule (a
// contradicted idea is labelled as loudly as a confirmed one) is decided once,
// in testable code, rather than in each exporter.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * camelCase / snake_case engine key → sentence-case heading.
 * `functionCostMatrix` → "Function cost matrix". An all-caps word is left
 * alone, so a key like `costGBP` keeps its unit rather than becoming "gbp".
 */
export function prettify(s) {
  const words = String(s ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => (w.length > 1 && w === w.toUpperCase() ? w : w.toLowerCase()));
  if (!words.length) return '';
  words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  return words.join(' ');
}

/**
 * Engine verdict → { label, tone, detail }.
 *
 * The engine stamps `{ direction, savingPct }`; other callers may carry a
 * free-text `status`/`verdict` and a `note`. All are read, so an idea the
 * engine actually judged is never reported as unchecked. An unrecognised
 * status is surfaced verbatim rather than being flattened into "unchecked" —
 * saying "we do not know what this means" beats silently claiming nothing
 * happened.
 */
export function verdictOf(idea) {
  const ec = idea && idea.engineCheck;
  const raw = String((ec && (ec.direction ?? ec.status ?? ec.verdict)) ?? '').toLowerCase();
  const saving = ec && typeof ec.savingPct === 'number' ? `engine-modelled saving ${ec.savingPct}%` : '';
  const detail = [saving, ec && ec.note].filter(Boolean).join(' — ');
  if (raw.includes('confirm')) return { label: 'ENGINE-CONFIRMED', tone: 'confirmed', detail };
  if (raw.includes('contradict')) return { label: 'ENGINE-CONTRADICTED', tone: 'contradicted', detail };
  if (raw) return { label: raw.toUpperCase().slice(0, 22), tone: 'other', detail };
  return {
    label: 'NOT ENGINE-CHECKED',
    tone: 'none',
    detail: 'The engine had no comparable basis to test this idea against.',
  };
}

/**
 * Array → { headers, rows } of strings; anything non-tabular → null.
 *
 * A list of plain values becomes a single column headed by `key`, so the caller
 * can recognise it and render a list instead of a one-column table.
 */
export function tabulate(v, key = 'value') {
  if (!Array.isArray(v) || !v.length) return null;
  if (typeof v[0] !== 'object' || v[0] === null) {
    return { headers: [key], rows: v.map(x => [String(x)]) };
  }
  const headers = [...new Set(v.flatMap(o => (o && typeof o === 'object' ? Object.keys(o) : [])))].slice(0, 6);
  if (!headers.length) return null;
  const rows = v.slice(0, 40).map(o => headers.map(h => {
    const cell = o && typeof o === 'object' ? o[h] : undefined;
    if (cell === null || cell === undefined) return '';
    return typeof cell === 'object' ? JSON.stringify(cell) : String(cell);
  }));
  return { headers, rows };
}

/**
 * Proportional column widths summing to `total`.
 *
 * Equal shares waste half the page on a two-digit percentage column while
 * truncating the verdict sentence beside it. Weight each column by the longest
 * string it must carry, with a floor so a narrow column stays readable and a
 * cap so one very long cell cannot starve the rest.
 */
export function columnWidths(t, total) {
  const n = t.headers.length;
  if (!n) return [];
  const weights = t.headers.map((h, i) => {
    const longest = t.rows.reduce((m, r) => Math.max(m, String(r[i] ?? '').length), String(h).length);
    return Math.min(Math.max(longest, 6), 46);
  });
  const sum = weights.reduce((a, b) => a + b, 0) || n;
  const min = Math.min(16, total / n);
  const raw = weights.map(w => Math.max(min, (w / sum) * total));
  const scale = total / raw.reduce((a, b) => a + b, 0);
  return raw.map(w => w * scale);
}

/** Filename-safe: strips the characters Windows and Excel both reject. */
export const safeName = s => String(s).replace(/[\\/:*?"<>|]/g, '-');

/** Excel sheet names cap at 31 chars and reject []:*?/\ */
export const sheetName = key => prettify(key).slice(0, 31).replace(/[[\]:*?/\\]/g, ' ').trim() || 'Sheet';
