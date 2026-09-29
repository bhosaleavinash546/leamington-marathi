// ─────────────────────────────────────────────────────────────────────────────
// Parsers for the Innovation Studio's typed inputs — pure, so they are tested
// rather than trusted.
//
// DFA lines. "name | flag | flag …" where each flag says why the part must
// exist (Boothroyd-Dewhurst's three questions). The page used to test the
// joined flags with a bare keyword regex, so "clip | same material as housing"
// set different-material TRUE and "doesn't move" set moves TRUE — a deletable
// part became "necessary" (Innovation review, 29 Sept 2026). Now:
//   • positional y/n answers are accepted: "spacer | n | n | n"
//   • otherwise each flag is read on its own, and a NEGATED flag says nothing
// ─────────────────────────────────────────────────────────────────────────────

const YES = /^(y|yes|true|1|✓|x)$/i;
const NO = /^(n|no|false|0|✗|-)$/i;
const NEGATION = /\b(no|not|non|never|none|doesn'?t|does not|isn'?t|is not|same|fixed|static|without)\b/i;
const MOVES = /\b(mov\w*|rotat\w*|slid\w*|pivot\w*|articulat\w*|spin\w*)\b/i;
const MATERIAL = /\b(material|insulat\w*|conduct\w*|dielectric|elastomer\w*|seal\w*)\b/i;
const SEPARATE = /\b(separat\w*|service\w*|serviceable|remov\w*|replac\w*|assembl\w*|disassembl\w*)\b/i;

/** One DFA line → { name, moves, differentMaterial, mustSeparate } or null. */
export function parseDfaLine(line) {
  const parts = String(line ?? '').split('|').map(s => s.trim());
  const name = parts.shift();
  if (!name) return null;
  const flags = parts.filter(Boolean);
  if (flags.length === 3 && flags.every(f => YES.test(f) || NO.test(f))) {
    return { name, moves: YES.test(flags[0]), differentMaterial: YES.test(flags[1]), mustSeparate: YES.test(flags[2]) };
  }
  const said = (re) => flags.some(f => re.test(f) && !NEGATION.test(f));
  return { name, moves: said(MOVES), differentMaterial: said(MATERIAL), mustSeparate: said(SEPARATE) };
}

export function parseDfaLines(text) {
  return String(text ?? '').split('\n').map(l => l.trim()).filter(Boolean).map(parseDfaLine).filter(Boolean);
}
