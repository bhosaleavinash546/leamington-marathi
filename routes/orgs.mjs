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
import { addColumn } from '../db-migrate.mjs';

export const ROLES = ['owner', 'admin', 'member', 'viewer'];

/** An invite secret. 32 bytes base64url — the thing that actually grants the role. */
export const newInviteToken = () => crypto.randomBytes(32).toString('base64url');

/**
 * The org helpers, usable OUTSIDE the org routes.
 *
 * They started life as closures inside `registerOrgRoutes`, which was fine while
 * orgs were a standalone feature and wrong the moment another feature needed to
 * scope its data to a team. Lifting them here is what lets the DFM store ask
 * "which org does this user belong to, and what may they do in it" without
 * duplicating the query or importing a route handler.
 */
export function orgAccess(db) {
  // THE SCHEMA LIVES WITH THE HELPERS, not with the routes.
  //
  // registerDfmRoutes runs BEFORE registerOrgRoutes in server.mjs, so a backfill
  // that resolves users to orgs would have hit a table that did not exist yet —
  // and, being best-effort, would have swallowed the error and quietly migrated
  // nothing on the one boot where it mattered. Creating the tables here makes
  // the order irrelevant.
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
  // An invite is a SECRET, not an email address.
  //
  // Until Sept 2026 a pending row activated on bare email match the first time
  // that address signed in — and signup marks an account verified without ever
  // proving the address. So anyone who signed up as the invited email silently
  // took the invited role, including admin, which gates company DFM standards.
  // Claiming now requires the token the inviter shares out-of-band.
  addColumn(db, 'org_members', 'inviteToken', 'TEXT');
  addColumn(db, 'org_members', 'claimedAt', 'TEXT');

  /** Personal org on first touch — every user belongs somewhere from day one. */
  function ensurePersonalOrg(user) {
    const existing = db.prepare("SELECT o.* FROM orgs o JOIN org_members m ON m.orgId = o.id WHERE m.userId = ? AND m.status = 'active' ORDER BY o.createdAt LIMIT 1").get(user.id);
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

  const memberRole = (orgId, userId) => db
    .prepare("SELECT role FROM org_members WHERE orgId = ? AND userId = ? AND status = 'active'")
    .get(orgId, userId)?.role ?? null;

  const RANK = Object.fromEntries(ROLES.map((r, i) => [r, ROLES.length - i]));

  /**
   * The org a request acts in, and whether the user may do what they asked.
   *
   * `wantedOrgId` lets a caller name a team they belong to; without one, their
   * own workspace is used. Returns null rather than throwing so the caller can
   * answer 403 in its own words — and so a user who names an org they are NOT a
   * member of gets the same answer as one naming an org that does not exist.
   */
  function resolve(user, wantedOrgId, minRole = 'member') {
    if (!user) return null;
    const orgId = wantedOrgId || ensurePersonalOrg(user).id;
    const role = memberRole(orgId, user.id);
    if (!role || RANK[role] < RANK[minRole]) return null;
    return { orgId, role };
  }

  return { ensurePersonalOrg, memberRole, resolve, RANK };
}

export function registerOrgRoutes(app, { db, requireAuth, rateLimit }) {
  const access = orgAccess(db);   // also creates the schema, so order does not matter

  const { ensurePersonalOrg } = access;

  /**
   * Claim ONE invite with its token. The email must also match, so a leaked
   * token cannot be redeemed by a third party, but the token is what grants
   * the role — an address alone proves nothing while signup does not verify it.
   * Returns { ok, orgId, role } or { ok: false, reason }.
   */
  function claimInvite(user, token) {
    const t = String(token || '').trim();
    if (!t) return { ok: false, reason: 'An invite token is required.' };
    const row = db.prepare("SELECT orgId, email, role FROM org_members WHERE inviteToken = ? AND status = 'pending'").get(t);
    if (!row) return { ok: false, reason: 'That invite is not valid, or has already been used.' };
    if (row.email !== String(user.email || '').toLowerCase()) {
      return { ok: false, reason: 'That invite was issued to a different email address.' };
    }
    db.prepare("UPDATE org_members SET userId = ?, status = 'active', claimedAt = ?, inviteToken = NULL WHERE orgId = ? AND email = ?")
      .run(user.id, new Date().toISOString(), row.orgId, row.email);
    return { ok: true, orgId: row.orgId, role: row.role };
  }

  const roleIn = access.memberRole;

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
    const token = newInviteToken();
    try {
      db.prepare("INSERT INTO org_members (orgId, email, role, status, invitedBy, createdAt, inviteToken) VALUES (?,?,?,'pending',?,?,?)")
        .run(req.params.orgId, email, role, req.user.id, new Date().toISOString(), token);
    } catch { return res.status(409).json({ error: 'That email is already a member or invitee.' }); }
    // The token is returned ONCE, to the inviter, to pass on out of band. It is
    // the credential; the email address is only a check that it reached the
    // intended person.
    res.json({
      ok: true,
      inviteToken: token,
      note: 'Invite created. Send this token to that person — they claim it after signing up. An invite cannot be claimed by email address alone.',
    });
  });

  // Claim an invite. Rate-limited: the token is a secret, so guessing it must
  // cost something even though 32 random bytes are not guessable in practice.
  app.post('/api/orgs/invites/claim', requireAuth, rateLimit(20, 60 * 60 * 1000), (req, res) => {
    const result = claimInvite(req.user, req.body?.token);
    if (!result.ok) return res.status(400).json({ error: result.reason });
    res.json(result);
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

  return { ensurePersonalOrg, requireOrgRole, claimInvite };
}
