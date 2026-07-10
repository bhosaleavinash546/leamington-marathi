import Anthropic from '@anthropic-ai/sdk';

/**
 * Central AI-client factory — the enterprise control point for every LLM call.
 *
 * Two deployment controls (see docs/CostVision-Secure-Deployment-CAPEE-Integration.md):
 *
 *  • ANTHROPIC_BASE_URL  — private-endpoint routing (Option B). Point every AI
 *    call at an internal LLM gateway / Claude in the company's own cloud tenancy
 *    (AWS Bedrock / Google Vertex behind a private link). Same models, same
 *    quality — different, compliant plumbing. Config only; no code change.
 *
 *  • AIR_GAPPED=1        — the provable off-switch (Option A / sensitive
 *    programmes). Every LLM construction throws AirGappedError with a clear
 *    message, and the news/live-pricing fetchers go quiet, so security can run
 *    a witnessed deny-all-egress firewall test. The deterministic core (cost
 *    engines, CAD geometry, learning loop, drift monitor) is unaffected.
 *
 * All server code MUST obtain its client from createAnthropic() — never
 * `new Anthropic(...)` directly — so these controls cannot be bypassed.
 */

export class AirGappedError extends Error {
  constructor(feature = 'AI features') {
    super(`${feature} are disabled: this deployment is running in AIR-GAPPED mode (AIR_GAPPED=1). ` +
          'Deterministic costing, CAD geometry and the learning loop remain fully available.');
    this.name = 'AirGappedError';
  }
}

/** Read at call time (not import time) so tests and runtime flips behave predictably. */
export function isAirGapped(): boolean {
  return process.env.AIR_GAPPED === '1';
}

/** Human-readable description of the AI egress posture — logged at boot. */
export function aiEndpointDescription(): string {
  if (isAirGapped()) return 'AIR-GAPPED — all external AI/news/pricing calls disabled';
  const base = process.env.ANTHROPIC_BASE_URL;
  // Pointing at the public default is still the PUBLIC posture, however it was set.
  if (!base || /(^|\/\/)api\.anthropic\.com\/?$/.test(base)) {
    return 'PUBLIC api.anthropic.com (set ANTHROPIC_BASE_URL for private routing, AIR_GAPPED=1 to disable)';
  }
  return `PRIVATE endpoint — all AI calls routed to ${base}`;
}

/** The only sanctioned way to construct an LLM client. */
export function createAnthropic(apiKey?: string): Anthropic {
  if (isAirGapped()) throw new AirGappedError();
  return new Anthropic({
    ...(apiKey ? { apiKey } : {}),
    // Explicit (the SDK also reads the env var) so the control point is visible here.
    ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
  });
}
