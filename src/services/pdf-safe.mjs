// ─────────────────────────────────────────────────────────────────────────────
// PDF text sanitizer — jsPDF's built-in fonts only encode WinAnsi (cp1252).
// Any character outside that set (arrows, ≈, Δ, ✓ …) makes jsPDF fall into a
// UTF-16 path that renders as mangled, letter-spaced garbage in the report
// ("i n s u l a t i o n  \" 2 0 - 3 0 %"). LLM-generated idea text uses those
// characters constantly (→ for "becomes", ↓ for "reduced"), so EVERY string
// entering a PDF export must pass through pdfSafe()/deepPdfSafe() first.
// Pure module (idea-classify.mjs pattern) so it unit-tests under node --test.
// ─────────────────────────────────────────────────────────────────────────────

// Meaning-preserving replacements for the characters LLM output actually uses.
const PDF_MAP = {
  '→': '->',  '←': '<-',  '⇒': '=>',  '⇐': '<=',
  '↔': '<->', '⇄': '<->', '↑': '+',   '↓': '-',
  '≈': '~',   '≤': '<=',  '≥': '>=',  '≠': '!=',
  '−': '-',   '⁄': '/',   '′': "'",   '″': '"',
  'Δ': 'delta', '∆': 'delta', 'μ': 'u', 'Ω': 'ohm',
  '✓': '',    '✔': '',    '✗': 'x',   '✘': 'x',
  '√': '',    '∞': 'inf', '₁': '1',   '₂': '2',
  '​': '',    ' ': ' ',   ' ': ' ',   ' ': ' ',
};

// cp1252 also maps these specific non-Latin-1 codepoints — they render fine.
const CP1252_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

/** Make a single string safe for jsPDF's WinAnsi fonts, preserving meaning. */
export function pdfSafe(input) {
  const s = String(input ?? '');
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code <= 0xFF || CP1252_EXTRA.has(ch)) { out += ch; continue; }
    const mapped = PDF_MAP[ch];
    out += mapped !== undefined ? mapped : '';   // unknown exotic char: drop, never garble
  }
  return out;
}

/** Deep-clone any value with every string sanitized — run report data through
 *  this ONCE at the top of a PDF export so wrapping/measuring/drawing all see
 *  clean text. Non-strings (numbers, booleans, null) pass through untouched. */
export function deepPdfSafe(value) {
  if (typeof value === 'string') return pdfSafe(value);
  if (Array.isArray(value)) return value.map(deepPdfSafe);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepPdfSafe(v);
    return out;
  }
  return value;
}
