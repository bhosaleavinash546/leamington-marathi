// ─────────────────────────────────────────────────────────────────────────────
// Marketplace routes: list, count, submit, vote. Extracted from server.mjs
// (de-monolith) — same pattern as routes/should-cost.mjs and routes/rate-library.mjs.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'crypto';
import { validate, SCHEMAS } from '../schemas.mjs';

export function registerMarketplaceRoutes(app, { db, requireAuth, rateLimit }) {
  app.get('/api/marketplace/count', (_req, res) => {
    try {
      const row = db.prepare("SELECT COUNT(*) AS c FROM marketplace_ideas WHERE status = 'approved'").get();
      res.json({ count: row.c });
    } catch { res.json({ count: 0 }); }
  });

  app.get('/api/marketplace', (req, res) => {
    try {
      const ideas = db.prepare("SELECT m.*, (SELECT COUNT(*) FROM idea_votes v WHERE v.ideaId = m.id) AS votes FROM marketplace_ideas m WHERE m.status = 'approved' ORDER BY m.stars DESC, m.createdAt DESC").all();
      res.json(ideas.map(i => ({ ...i, verified: !!i.verified })));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/marketplace', requireAuth, rateLimit(5, 60 * 60 * 1000), validate(SCHEMAS.marketplaceSubmit), (req, res) => {
    const { title, system, costSavingType, annualSaving, difficulty, timeToImplement, description, ideaData } = req.body;
    if (!title || !description) return res.status(400).json({ error: 'title and description required' });
    try {
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO marketplace_ideas (id,title,system,costSavingType,annualSaving,difficulty,timeToImplement,description,ideaData,submittedBy,verified,stars,status,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,0,0,"pending",?)')
        .run(id, title, system || '', costSavingType || '', annualSaving || '', difficulty || 'Medium', timeToImplement || '', description, ideaData || null, req.user.id, new Date().toISOString());
      res.json({ ok: true, message: 'Idea submitted for review. Thank you!' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Toggle a vote on a marketplace idea (one per user; second call removes it).
  app.post('/api/marketplace/:id/vote', requireAuth, rateLimit(60, 60 * 60 * 1000), (req, res) => {
    const idea = db.prepare("SELECT id FROM marketplace_ideas WHERE id = ? AND status = 'approved'").get(req.params.id);
    if (!idea) return res.status(404).json({ error: 'Idea not found.' });
    const existing = db.prepare('SELECT 1 FROM idea_votes WHERE ideaId = ? AND userId = ?').get(idea.id, req.user.id);
    if (existing) db.prepare('DELETE FROM idea_votes WHERE ideaId = ? AND userId = ?').run(idea.id, req.user.id);
    else db.prepare('INSERT INTO idea_votes (ideaId, userId, createdAt) VALUES (?,?,?)').run(idea.id, req.user.id, new Date().toISOString());
    const votes = db.prepare('SELECT COUNT(*) c FROM idea_votes WHERE ideaId = ?').get(idea.id).c;
    res.json({ ok: true, voted: !existing, votes });
  });
}
