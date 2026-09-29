// ─────────────────────────────────────────────────────────────────────────────
// What went wrong with an AI call, in words a user can act on.
//
// Every route used to turn a provider error into a fixed sentence: a 400 read
// "The AI request was rejected — please adjust inputs and retry", and several
// routes said "check your API key" for ANY provider status. The commonest 400
// in practice is an account with no credit left — the key is fine, the inputs
// are fine, and neither sentence points at the fix. Anthropic's own error
// message is safe to show (it carries no secret of ours) and says exactly
// what happened, so it is passed through, with a plain instruction for the
// cases a user can fix themselves.
// ─────────────────────────────────────────────────────────────────────────────

/** Anthropic's error type and message from an SDK error, or nulls. */
export function providerDetail(err) {
  const body = err?.error;
  let type = body?.error?.type ?? body?.type ?? null;
  let message = body?.error?.message ?? body?.message ?? null;
  if (!message && typeof err?.message === 'string') {
    // The SDK's message is "400 {json}" when the body was not parsed.
    const m = /\{[\s\S]*\}$/.exec(err.message);
    if (m) { try { const j = JSON.parse(m[0]); type = type ?? j?.error?.type ?? null; message = j?.error?.message ?? null; } catch { /* not JSON */ } }
  }
  if (type === 'error') type = null;
  return { type, message: typeof message === 'string' ? message.trim().slice(0, 400) : null };
}

/** A user-facing sentence for an AI-provider failure. */
export function describeLlmError(err) {
  const status = err?.status || err?.response?.status;
  const { message } = providerDetail(err);
  const why = message ? ` Anthropic says: "${message}"` : '';
  if (message && /credit balance|billing|purchase credits|plans\s*&\s*billing/i.test(message)) {
    return 'Your Anthropic account has run out of credit — the API key is valid, but Anthropic will not run requests until credit is added. Add credit at console.anthropic.com → Plans & Billing (or use a key from an account that has credit), then retry.';
  }
  if (status === 401) return `The Anthropic API key was rejected — check it in Settings (it may be mistyped, revoked or rotated).${why}`;
  if (status === 403) return `This API key is not allowed to make this request — check the key's workspace permissions in the Anthropic console.${why}`;
  if (status === 404) return `Anthropic could not find the model or endpoint this request uses.${why}`;
  if (status === 413) return `The request was too large for Anthropic to accept — try a smaller file or less context.${why}`;
  if (status === 400) return `Anthropic rejected the request.${why || ' No reason was given.'}`;
  if (status === 429) return `Anthropic's rate or usage limit was reached for this key — wait a minute and retry, or raise the limit in the Anthropic console.${why}`;
  if (status === 529 || status === 503) return 'The AI service is temporarily overloaded. Please retry shortly.';
  if (typeof status === 'number' && status >= 500) return `The AI service returned an error (${status}). Please retry shortly.`;
  // The SDK's connection failure is an APIConnectionError whose message is just
  // "Connection error." — test the class name as well as the text.
  if (/APIConnection|APIConnectionTimeout/.test(err?.name || err?.constructor?.name || '')
      || /timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|connection error|fetch failed/i.test(err?.message || '')) {
    return 'Could not reach Anthropic — check this computer\'s internet connection (or a proxy/firewall), then retry.';
  }
  return 'AI request failed. Please try again.';
}

/** True when the error came from the AI provider (has an HTTP status). */
export const isProviderError = (err) => typeof (err?.status || err?.response?.status) === 'number';
