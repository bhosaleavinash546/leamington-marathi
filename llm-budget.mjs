// Output-budget arithmetic for the long ideation call. Pure; no SDK, no I/O.
//
// Extended thinking on the flagship is `thinking.type: 'adaptive'` steered by
// `output_config.effort` — there is no token budget to set any more. What
// there IS: thinking tokens count against `max_tokens`. Measured on the real
// analysis prompt, the model spent an entire 2,500-token cap on thinking and
// never reached the tool call, so a fixed 24k ceiling that used to be all
// output is now shared, and the eight-idea tool output gets truncated or never
// begun. That surfaced as "No valid ideas could be generated" with no
// explanation. This module makes the budget explicit and testable.

/** Effort level implied by the legacy CV_THINKING_BUDGET number. */
export function effortFor(budgetTokens) {
  const b = Number(budgetTokens);
  if (!Number.isFinite(b) || b < 1024) return null;    // off
  if (b <= 8000) return 'low';
  if (b <= 16000) return 'medium';
  return 'high';
}

/** Output headroom reserved for thinking, on top of the base output budget. */
export function thinkingHeadroom(effort) {
  return { low: 8000, medium: 16000, high: 24000 }[effort] ?? 0;
}

/**
 * Request parameters for the ideation call.
 * @param {number} baseMaxTokens  tokens needed for the OUTPUT alone (the emit_ideas call)
 * @param {number|string} budgetTokens  CV_THINKING_BUDGET (0 / unset-like → thinking off)
 */
export function ideationParams(baseMaxTokens, budgetTokens) {
  const effort = effortFor(budgetTokens);
  if (!effort) return { max_tokens: baseMaxTokens, thinking: null, output_config: null, effort: null };
  return {
    max_tokens: baseMaxTokens + thinkingHeadroom(effort),
    thinking: { type: 'adaptive' },
    output_config: { effort },
    effort,
  };
}

/**
 * Did the call hit the output ceiling before delivering a usable tool result?
 * Returns a human-readable reason, or null when the result is usable.
 */
export function truncationReason(stopReason, toolBlock, maxTokens, thinkingOn) {
  const ideas = Array.isArray(toolBlock?.input?.ideas) ? toolBlock.input.ideas : null;
  if (stopReason !== 'max_tokens') return null;
  if (ideas && ideas.length > 0) return null;         // truncated but something survived — validator decides
  const where = toolBlock ? 'the idea list was cut off' : 'no idea list was started';
  return `The response hit the ${maxTokens.toLocaleString()}-token output limit and ${where}`
    + (thinkingOn ? ' — reasoning consumed the budget.' : '.');
}
