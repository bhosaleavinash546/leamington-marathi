// ─────────────────────────────────────────────────────────────────────────────
// NUMBERS IN AI PROSE MUST EXIST IN THE DATA THE PROSE WAS GIVEN.
//
// Horizon's narration prompt says "never introduce a number". A prompt is a
// request, not a guarantee (Oct 2026 review: nothing checked it, and the signal
// schema even asked for "a price threshold"). This is the guarantee: every
// numeric token in the model's text is looked up in the text the model was
// grounded on; a sentence (or a signal) carrying a number that is not there is
// dropped, and the drop is counted so the UI can say so. Deterministic, pure,
// no model call.
// ─────────────────────────────────────────────────────────────────────────────

/** Numeric tokens, normalised: "1,200" → "1200", "12.0" → "12", "45%" → "45". */
export function numberTokens(text) {
  const out = new Set();
  for (const m of String(text ?? '').matchAll(/\d+(?:[.,]\d+)*/g)) {
    let t = m[0];
    // A comma followed by exactly three digits is a thousands separator.
    t = t.replace(/,(?=\d{3}(?!\d))/g, '');
    t = t.replace(',', '.');
    const n = Number(t);
    if (!Number.isFinite(n)) continue;
    out.add(String(n));
  }
  return out;
}

/** Sentences of `text` whose every number appears in `allowed` (a Set from numberTokens). */
export function keepGroundedSentences(text, allowed) {
  const parts = String(text ?? '').split(/(?<=[.!?])\s+/);
  const kept = [];
  let dropped = 0;
  for (const s of parts) {
    const nums = [...numberTokens(s)];
    if (nums.every((n) => allowed.has(n))) kept.push(s);
    else dropped++;
  }
  return { text: kept.join(' ').trim(), dropped };
}

/**
 * Ground a { briefing, signals[] } narrative against the card text it was
 * written from. `cardTextById` maps techId → that card's prompt line; a signal
 * is checked against its own card, the briefing against all of them.
 */
export function groundNarrative(narrative, allText, cardTextById = {}) {
  const allowedAll = numberTokens(allText);
  const b = keepGroundedSentences(narrative?.briefing ?? '', allowedAll);
  let droppedSignals = 0;
  const signals = (narrative?.signals ?? []).filter((s) => {
    const allowed = numberTokens(cardTextById[s.techId] ?? '');
    const ok = [...numberTokens(s.watch)].every((n) => allowed.has(n));
    if (!ok) droppedSignals++;
    return ok;
  });
  return {
    ...narrative,
    briefing: b.text,
    signals,
    numbersChecked: { droppedSentences: b.dropped, droppedSignals },
  };
}
