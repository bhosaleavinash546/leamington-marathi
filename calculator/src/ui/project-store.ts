/**
 * Client project store — one API for saved work that transparently uses the
 * server when the user is logged in, and falls back to localStorage when not.
 *
 * So a logged-in user's projects follow them across devices (server-scoped to
 * their account), while a logged-out user keeps today's offline behaviour with
 * no change. The store is built from injected dependencies (token, fetch,
 * storage, clock) so its fallback logic is fully unit-testable off-browser.
 */

export interface StoredProject {
  id: string;
  kind: string;
  name: string;
  data: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectStoreDeps {
  getToken: () => string | null;
  fetchFn: typeof fetch;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  now: () => string;
}

export interface ProjectStore {
  isAuthed(): boolean;
  mode(): 'cloud' | 'local';
  list(kind: string): Promise<StoredProject[]>;
  save(p: { id: string; kind: string; name: string; data?: unknown }): Promise<StoredProject>;
  remove(kind: string, id: string): Promise<void>;
}

export function createProjectStore(deps: ProjectStoreDeps): ProjectStore {
  const authed = () => Boolean(deps.getToken());
  const lsKey = (kind: string) => `cv-projects-${kind}`;

  function lsList(kind: string): StoredProject[] {
    try { return JSON.parse(deps.storage.getItem(lsKey(kind)) ?? '[]') as StoredProject[]; }
    catch { return []; }
  }
  function lsWrite(kind: string, arr: StoredProject[]): void {
    try { deps.storage.setItem(lsKey(kind), JSON.stringify(arr)); } catch { /* quota */ }
  }

  async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
    const res = await deps.fetchFn(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deps.getToken()}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`project sync failed (${res.status})`);
    return res.json() as Promise<T>;
  }

  return {
    isAuthed: authed,
    mode: () => (authed() ? 'cloud' : 'local'),

    async list(kind) {
      if (authed()) {
        const r = await api<{ projects: StoredProject[] }>('GET', `/api/projects?kind=${encodeURIComponent(kind)}`);
        return r.projects;
      }
      return lsList(kind);
    },

    async save(p) {
      if (authed()) {
        const r = await api<{ project: StoredProject }>('POST', '/api/projects', p);
        return r.project;
      }
      const now = deps.now();
      const arr = lsList(p.kind);
      const existing = arr.find(x => x.id === p.id);
      const rec: StoredProject = {
        id: p.id, kind: p.kind, name: p.name, data: p.data ?? {},
        createdAt: existing?.createdAt ?? now, updatedAt: now,
      };
      lsWrite(p.kind, [rec, ...arr.filter(x => x.id !== p.id)]);
      return rec;
    },

    async remove(kind, id) {
      if (authed()) { await api('DELETE', `/api/projects/${encodeURIComponent(id)}`); return; }
      lsWrite(kind, lsList(kind).filter(x => x.id !== id));
    },
  };
}

/** Default browser-backed instance. */
export const projectStore: ProjectStore = createProjectStore({
  getToken: () => (typeof localStorage !== 'undefined'
    ? localStorage.getItem('auth_token') ?? sessionStorage.getItem('auth_token')
    : null),
  fetchFn: (...args) => fetch(...args),
  storage: typeof localStorage !== 'undefined' ? localStorage : { getItem: () => null, setItem: () => {} },
  now: () => new Date().toISOString(),
});
