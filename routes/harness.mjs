// ─────────────────────────────────────────────────────────────────────────────
// Wiring-harness should-cost endpoint — same registration pattern as the other
// route modules. Deterministic (harness-cost.mjs); no LLM involved.
// ─────────────────────────────────────────────────────────────────────────────
import { computeHarnessCost } from '../harness-cost.mjs';
import { getActiveLibrary } from '../active-library.mjs';

export function registerHarnessRoutes(app, { requireAuth, rateLimit }) {
  app.post('/api/harness-cost', requireAuth, rateLimit(120, 60 * 60 * 1000), (req, res) => {
    try {
      const result = computeHarnessCost(req.body || {}, getActiveLibrary());
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e.message || 'Invalid harness parameters.' });
    }
  });
}
