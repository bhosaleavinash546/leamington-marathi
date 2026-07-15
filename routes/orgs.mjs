// ─────────────────────────────────────────────────────────────────────────────
// Organisations & roles v1 — the audit's top SaaS-maturity gap ("pipeline and
// VAVE tracking are team features that currently have no team").
//
// Model: every user gets a personal org at first touch; owners invite members
// by email (pending until that email signs up); roles are owner/admin/member/
// viewer. Exposes requireOrgRole() for org-scoped features to build on.
// Deliberately v1: no org-scoped data migration yet — this is the substrate.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'crypto';

export const ROLES = ['owner', 'admin', 'member', 'viewer'];

export function registerOrgRoutes(app, { db, requireAuth, rateLimit }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS orgs (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, createdBy TEXT NOT NULL, createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS org_members (
      orgId TEXT NOT NULL, email TEXT NOT NULL, userId TEXT,
      role TEXT NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending')),
      invitedBy TEXT, createdAt TEXT NOT NULL,
      PRIMARY KEY (orgId, email)
    );
    CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(userId);
  `);

  // Personal org on first touch — every user belongs somewhere from day one.
  function ensurePersonalOrg(user) {
    const existing = db.prepare("SELECT o.* FROM orgs o JOIN org_members m ON m.orgId = o.id WHERE m.userId = ? AND m.status = 'active' LIMIT 1").get(user.id);
    if (existing) return existing;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare('INSERT INTO orgs (id, name, createdBy, createdAt) VALUES (?,?,?,?)')
        .run(id, `${user.name || user.email}'s workspace`, user.id, now);
      db.prepare("INSERT INTO org_members (orgId, email, userId, role, status, createdAt) VALUES (?,?,?,'owner','active',?)")
        .run(id, user.email, user.id, now);
    })();
    return db.prepare('SELECT * FROM orgs WHERE id = ?').get(id);
  }

  // Activate pending invites when a user shows up (call from any org endpoint).
  function claimPendingInvites(user) {
    db.prepare("UPDATE org_members SET userId = ?, status = 'active' WHERE email = ? AND status = 'pending'")
      .run(user.id, user.email);
  }

  function roleIn(orgId, userId) {
    return db.prepare("SELECT role FROM org_members WHERE orgId = ? AND userId = ? AND status = 'active'").get(orgId, userId)?.role ?? null;
  }

  /** Middleware factory for org-scoped features: requireOrgRole('admin'). */
  function requireOrgRole(minRole) {
    const rank = Object.fromEntries(ROLES.map((r, i) => [r, ROLES.length - i]));
    return (req, res, next) => {
      const orgId = req.params.orgId || req.body?.orgId;
      const role = orgId ? roleIn(orgId, req.user.id) : null;
      if (!role || rank[role] < rank[minRole]) return res.status(403).json({ error: 'Insufficient organisation role.' });
      req.orgRole = role;
      next();
    };
  }

  // ── Endpoints ──
  app.get('/api/orgs', requireAuth, (req, res) => {
    claimPendingInvites(req.user);
    ensurePersonalOrg(req.user);
    const rows = db.prepare(`
      SELECT o.id, o.name, m.role,
        (SELECT COUNT(*) FROM org_members mm WHERE mm.orgId = o.id AND mm.status = 'active') AS members
      FROM orgs o JOIN org_members m ON m.orgId = o.id
      WHERE m.userId = ? AND m.status = 'active'`).all(req.user.id);
    res.json(rows);
  });

  app.get('/api/orgs/:orgId/members', requireAuth, requireOrgRole('viewer'), (req, res) => {
    const rows = db.prepare('SELECT email, role, status, createdAt FROM org_members WHERE orgId = ? ORDER BY createdAt').all(req.params.orgId);
    res.json(rows);
  });

  app.post('/api/orgs/:orgId/invites', requireAuth, requireOrgRole('admin'), rateLimit(30, 60 * 60 * 1000), (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const role = ROLES.includes(req.body?.role) && req.body.role !== 'owner' ? req.body.role : 'member';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Valid email required.' });
    try {
      db.prepare("INSERT INTO org_members (orgId, email, role, status, invitedBy, createdAt) VALUES (?,?,?,'pending',?,?)")
        .run(req.params.orgId, email, role, req.user.id, new Date().toISOString());
    } catch { return res.status(409).json({ error: 'That email is already a member or invitee.' }); }
    res.json({ ok: true, note: 'Invite recorded — it activates when that email signs up (email delivery of invites arrives with the billing milestone).' });
  });

  app.patch('/api/orgs/:orgId/members/:email', requireAuth, requireOrgRole('owner'), (req, res) => {
    const role = ROLES.includes(req.body?.role) ? req.body.role : null;
    if (!role) return res.status(400).json({ error: `role must be one of ${ROLES.join(', ')}` });
    const email = String(req.params.email).toLowerCase();
    if (email === req.user.email && role !== 'owner') return res.status(400).json({ error: 'Owners cannot demote themselves (transfer ownership first).' });
    const r = db.prepare('UPDATE org_members SET role = ? WHERE orgId = ? AND email = ?').run(role, req.params.orgId, email);
    if (r.changes === 0) return res.status(404).json({ error: 'No such member.' });
    res.json({ ok: true });
  });

  return { ensurePersonalOrg, requireOrgRole };
}
