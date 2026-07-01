/**
 * Per-user project store (server-side persistence).
 *
 * A single uniform store for every feature's saved work (universal should-cost
 * scenarios, SW should-cost configs, PCB analyses, …) keyed by `kind`. Every
 * query is scoped to the authenticated user's id, so one user can never read,
 * overwrite, or delete another user's projects.
 *
 * Pure data-access over a better-sqlite3 handle — no Express — so it unit-tests
 * against an in-memory database.
 */

import type { Database } from 'better-sqlite3';

export interface Project {
  id: string;
  kind: string;
  name: string;
  data: unknown;
  createdAt: string;
  updatedAt: string;
}

interface ProjectRow {
  id: string; user_id: string; kind: string; name: string;
  data: string; created_at: string; updated_at: string;
}

/** Create the table + index if absent. Called at server boot and in tests. */
export function ensureProjectsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      kind       TEXT NOT NULL,
      name       TEXT NOT NULL,
      data       TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_projects_user_kind ON projects(user_id, kind);
  `);
}

function toProject(r: ProjectRow): Project {
  let data: unknown = {};
  try { data = JSON.parse(r.data); } catch { /* corrupt row → empty */ }
  return { id: r.id, kind: r.kind, name: r.name, data, createdAt: r.created_at, updatedAt: r.updated_at };
}

/** List a user's projects, newest first, optionally filtered by kind. */
export function listProjects(db: Database, userId: string, kind?: string): Project[] {
  const rows = kind
    ? db.prepare('SELECT * FROM projects WHERE user_id = ? AND kind = ? ORDER BY updated_at DESC').all(userId, kind)
    : db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC').all(userId);
  return (rows as ProjectRow[]).map(toProject);
}

/** Fetch one project owned by the user, or null. */
export function getProject(db: Database, userId: string, id: string): Project | null {
  const row = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId) as ProjectRow | undefined;
  return row ? toProject(row) : null;
}

export class OwnershipError extends Error {}

/**
 * Insert or update a project for this user. If the id already exists and belongs
 * to a DIFFERENT user, throws OwnershipError (prevents cross-user overwrite).
 */
export function saveProject(
  db: Database,
  userId: string,
  input: { id: string; kind: string; name: string; data?: unknown },
  now: string,
): Project {
  if (!input.id || !input.kind || !input.name) throw new Error('id, kind and name are required');

  const owner = db.prepare('SELECT user_id, created_at FROM projects WHERE id = ?').get(input.id) as
    { user_id: string; created_at: string } | undefined;
  if (owner && owner.user_id !== userId) throw new OwnershipError('project belongs to another user');

  const createdAt = owner?.created_at ?? now;
  const data = JSON.stringify(input.data ?? {});
  db.prepare(`
    INSERT INTO projects (id, user_id, kind, name, data, created_at, updated_at)
    VALUES (@id, @userId, @kind, @name, @data, @createdAt, @now)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at
  `).run({ id: input.id, userId, kind: input.kind, name: input.name, data, createdAt, now });

  return { id: input.id, kind: input.kind, name: input.name, data: input.data ?? {}, createdAt, updatedAt: now };
}

/** Delete a project owned by the user. Returns true if a row was removed. */
export function deleteProject(db: Database, userId: string, id: string): boolean {
  const info = db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(id, userId);
  return info.changes > 0;
}
