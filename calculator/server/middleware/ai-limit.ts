/**
 * Per-user rate limits on the routes that call a model.
 *
 * Every AI call costs money and a vision call costs a lot, and none of these
 * routes had a limit (CAD did). Off today — the JLR build is air-gapped — but
 * turning AI on (Option 3) must not also turn on an unmetered spend: one
 * script, or one stuck retry loop in a browser tab, could run up the bill.
 *
 * Keyed by the signed-in user, not the IP: behind a corporate proxy every
 * engineer shares one address, and a per-IP limit would let one person's
 * batch lock out the whole site. Falls back to the IP when there is no user.
 *
 * Budgets are per 10 minutes, set from what one engineer working normally
 * needs, with headroom. AI_RATE_LIMIT_SCALE multiplies them all (e.g. 2 for a
 * demo day, 0.5 to be tight) without a code change.
 */
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import type { AuthenticatedRequest } from './auth-middleware.js';

const WINDOW_MS = 10 * 60_000;

export const AI_BUDGETS = {
  chat: 60,         // assistant questions and the per-result commentary
  agent: 30,        // costing-agent turns (multi-step, larger prompts)
  pcbVision: 20,    // board photos: multi-image vision, the most expensive call
  dfm: 30,          // expert DFM commentary
  rfq: 20,          // reading RFQ free text
} as const;

export function aiLimit(kind: keyof typeof AI_BUDGETS) {
  const scale = Number(process.env.AI_RATE_LIMIT_SCALE) > 0 ? Number(process.env.AI_RATE_LIMIT_SCALE) : 1;
  const max = Math.max(1, Math.round(AI_BUDGETS[kind] * scale));
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const user = (req as AuthenticatedRequest).user?.userId;
      return user ? `${kind}:user:${user}` : `${kind}:ip:${ipKeyGenerator(req.ip ?? '')}`;
    },
    message: {
      error: `Too many AI requests (${max} per 10 minutes for this feature). Wait a few minutes and try again; `
        + 'costing, CAD geometry and exports are not limited.',
      code: 'AI_RATE_LIMITED',
    },
  });
}
