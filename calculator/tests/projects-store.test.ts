import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  ensureProjectsTable, listProjects, getProject, saveProject, deleteProject, OwnershipError,
} from '../server/data/projects-store.js';

let db: Database.Database;
const T0 = '2026-06-01T00:00:00Z';
const T1 = '2026-06-02T00:00:00Z';

beforeEach(() => {
  db = new Database(':memory:');
  ensureProjectsTable(db);
});

describe('projects-store — basic CRUD', () => {
  it('saves and reads back a project', () => {
    saveProject(db, 'userA', { id: 'p1', kind: 'sw', name: 'Alpine EV', data: { region: 'UK' } }, T0);
    const p = getProject(db, 'userA', 'p1');
    expect(p?.name).toBe('Alpine EV');
    expect((p?.data as { region: string }).region).toBe('UK');
    expect(p?.createdAt).toBe(T0);
  });

  it('updates name/data and bumps updatedAt but preserves createdAt', () => {
    saveProject(db, 'userA', { id: 'p1', kind: 'sw', name: 'v1', data: { x: 1 } }, T0);
    const p = saveProject(db, 'userA', { id: 'p1', kind: 'sw', name: 'v2', data: { x: 2 } }, T1);
    expect(p.name).toBe('v2');
    expect((p.data as { x: number }).x).toBe(2);
    expect(p.createdAt).toBe(T0);
    expect(p.updatedAt).toBe(T1);
  });

  it('lists a user\'s projects newest-first and filters by kind', () => {
    saveProject(db, 'userA', { id: 'a', kind: 'sw', name: 'A' }, T0);
    saveProject(db, 'userA', { id: 'b', kind: 'pcb', name: 'B' }, T1);
    expect(listProjects(db, 'userA').map(p => p.id)).toEqual(['b', 'a']);
    expect(listProjects(db, 'userA', 'sw').map(p => p.id)).toEqual(['a']);
  });

  it('deletes a project and reports whether a row was removed', () => {
    saveProject(db, 'userA', { id: 'p1', kind: 'sw', name: 'X' }, T0);
    expect(deleteProject(db, 'userA', 'p1')).toBe(true);
    expect(getProject(db, 'userA', 'p1')).toBeNull();
    expect(deleteProject(db, 'userA', 'p1')).toBe(false); // already gone
  });
});

// ─── The security guarantee: strict per-user isolation ─────────────────────────

describe('projects-store — user isolation', () => {
  beforeEach(() => {
    saveProject(db, 'userA', { id: 'secret', kind: 'sw', name: 'A private', data: { a: 1 } }, T0);
  });

  it('user B cannot READ user A\'s project', () => {
    expect(getProject(db, 'userB', 'secret')).toBeNull();
    expect(listProjects(db, 'userB')).toHaveLength(0);
  });

  it('user B cannot DELETE user A\'s project', () => {
    expect(deleteProject(db, 'userB', 'secret')).toBe(false);
    expect(getProject(db, 'userA', 'secret')).not.toBeNull(); // still there
  });

  it('user B cannot OVERWRITE user A\'s project by reusing its id', () => {
    expect(() => saveProject(db, 'userB', { id: 'secret', kind: 'sw', name: 'hijack', data: { evil: true } }, T1))
      .toThrow(OwnershipError);
    const original = getProject(db, 'userA', 'secret');
    expect(original?.name).toBe('A private');
    expect((original?.data as { a: number }).a).toBe(1);
  });

  it('each user sees only their own list', () => {
    saveProject(db, 'userB', { id: 'bproj', kind: 'sw', name: 'B private' }, T1);
    expect(listProjects(db, 'userA').map(p => p.id)).toEqual(['secret']);
    expect(listProjects(db, 'userB').map(p => p.id)).toEqual(['bproj']);
  });
});

describe('projects-store — validation', () => {
  it('rejects a save missing id/kind/name', () => {
    expect(() => saveProject(db, 'userA', { id: '', kind: 'sw', name: 'x' }, T0)).toThrow();
    expect(() => saveProject(db, 'userA', { id: 'x', kind: '', name: 'x' }, T0)).toThrow();
    expect(() => saveProject(db, 'userA', { id: 'x', kind: 'sw', name: '' }, T0)).toThrow();
  });
});
