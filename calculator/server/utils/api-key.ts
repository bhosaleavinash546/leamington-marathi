// Robust Anthropic API-key resolution shared by every AI route.
//
// Precedence: a USABLE server key (.env ANTHROPIC_API_KEY) wins; otherwise the
// per-request `x-api-key` header from the client. Crucially, a BLANK or
// PLACEHOLDER env value — e.g. the "sk-ant-..." left behind from copying
// .env.example — is treated as "not set" so it can't silently shadow a real key
// the user provided. That shadowing is the usual cause of the
// "Anthropic rejected the API key (invalid x-api-key)" error in CAD-to-Cost.

/** True when a key at least LOOKS real — has the Anthropic prefix, enough length,
 *  and isn't the .env.example placeholder. Not a validity check (Anthropic is the
 *  final judge); just enough to stop obvious junk from being used. */
export function isUsableKey(k: string | null | undefined): boolean {
  const s = (k ?? '').trim();
  return s.startsWith('sk-ant-') && s !== 'sk-ant-...' && s.length >= 24;
}

/** Resolve the API key for a request: a usable .env key first, then a usable
 *  `x-api-key` header, else whatever is present (so the caller's empty-check or
 *  the Anthropic error yields a clear message). */
export function resolveApiKey(req: { headers: Record<string, unknown> }): string {
  const env = (process.env.ANTHROPIC_API_KEY ?? '').trim();
  if (isUsableKey(env)) return env;
  const raw = req.headers['x-api-key'];
  const header = (Array.isArray(raw) ? raw[0] : (raw as string | undefined) ?? '').trim();
  if (isUsableKey(header)) return header;
  return env || header;
}

/** Whether the server itself has a usable .env key (for the health endpoint). */
export function hasUsableServerKey(): boolean {
  return isUsableKey(process.env.ANTHROPIC_API_KEY);
}
