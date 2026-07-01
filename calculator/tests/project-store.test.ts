import { describe, it, expect } from 'vitest';
import { createProjectStore, type ProjectStoreDeps } from '../src/ui/project-store.js';

function fakeStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, _m: m };
}

/** Records fetch calls and returns queued JSON responses. */
function fakeFetch(responses: unknown[]) {
  const calls: Array<{ url: string; method?: string; headers?: Record<string,string>; body?: unknown }> = [];
  let i = 0;
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method, headers: init?.headers as Record<string,string>, body: init?.body ? JSON.parse(init.body as string) : undefined });
    const payload = responses[i++] ?? {};
    return { ok: true, status: 200, json: async () => payload } as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const NOW = '2026-06-10T00:00:00Z';

describe('project-store — logged OUT (localStorage fallback)', () => {
  function make() {
    const storage = fakeStorage();
    const store = createProjectStore({ getToken: () => null, fetchFn: fakeFetch([]).fn, storage, now: () => NOW } as ProjectStoreDeps);
    return { store, storage };
  }

  it('reports local mode and no auth', () => {
    const { store } = make();
    expect(store.isAuthed()).toBe(false);
    expect(store.mode()).toBe('local');
  });

  it('save then list round-trips through localStorage', async () => {
    const { store } = make();
    await store.save({ id: 'p1', kind: 'sw', name: 'Alpine', data: { region: 'UK' } });
    const list = await store.list('sw');
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Alpine');
    expect((list[0].data as { region: string }).region).toBe('UK');
  });

  it('save is an upsert that preserves createdAt', async () => {
    const storage = fakeStorage();
    let clock = '2026-06-10T00:00:00Z';
    const store = createProjectStore({ getToken: () => null, fetchFn: fakeFetch([]).fn, storage, now: () => clock });
    await store.save({ id: 'p1', kind: 'sw', name: 'v1' });
    clock = '2026-06-11T00:00:00Z';
    await store.save({ id: 'p1', kind: 'sw', name: 'v2' });
    const list = await store.list('sw');
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('v2');
    expect(list[0].createdAt).toBe('2026-06-10T00:00:00Z');
    expect(list[0].updatedAt).toBe('2026-06-11T00:00:00Z');
  });

  it('remove deletes only the target and keeps kinds separate', async () => {
    const { store } = make();
    await store.save({ id: 'a', kind: 'sw', name: 'A' });
    await store.save({ id: 'b', kind: 'sw', name: 'B' });
    await store.save({ id: 'c', kind: 'pcb', name: 'C' });
    await store.remove('sw', 'a');
    expect((await store.list('sw')).map(p => p.id)).toEqual(['b']);
    expect((await store.list('pcb')).map(p => p.id)).toEqual(['c']);
  });
});

describe('project-store — logged IN (server API)', () => {
  it('list hits GET /api/projects with the kind and a Bearer token', async () => {
    const ff = fakeFetch([{ projects: [{ id: 'x', kind: 'sw', name: 'Cloud', data: {}, createdAt: NOW, updatedAt: NOW }] }]);
    const store = createProjectStore({ getToken: () => 'TOK', fetchFn: ff.fn, storage: fakeStorage(), now: () => NOW });
    expect(store.mode()).toBe('cloud');
    const list = await store.list('sw');
    expect(list[0].name).toBe('Cloud');
    expect(ff.calls[0].url).toBe('/api/projects?kind=sw');
    expect(ff.calls[0].method).toBe('GET');
    expect(ff.calls[0].headers?.Authorization).toBe('Bearer TOK');
  });

  it('save POSTs the project to /api/projects and returns the server copy', async () => {
    const ff = fakeFetch([{ ok: true, project: { id: 'p1', kind: 'sw', name: 'Srv', data: { a: 1 }, createdAt: NOW, updatedAt: NOW } }]);
    const store = createProjectStore({ getToken: () => 'TOK', fetchFn: ff.fn, storage: fakeStorage(), now: () => NOW });
    const p = await store.save({ id: 'p1', kind: 'sw', name: 'Srv', data: { a: 1 } });
    expect(p.name).toBe('Srv');
    expect(ff.calls[0].method).toBe('POST');
    expect(ff.calls[0].url).toBe('/api/projects');
    expect(ff.calls[0].body).toMatchObject({ id: 'p1', kind: 'sw', name: 'Srv' });
  });

  it('remove issues DELETE /api/projects/:id', async () => {
    const ff = fakeFetch([{ ok: true }]);
    const store = createProjectStore({ getToken: () => 'TOK', fetchFn: ff.fn, storage: fakeStorage(), now: () => NOW });
    await store.remove('sw', 'p1');
    expect(ff.calls[0].method).toBe('DELETE');
    expect(ff.calls[0].url).toBe('/api/projects/p1');
  });

  it('does NOT touch localStorage when authed', async () => {
    const storage = fakeStorage();
    const ff = fakeFetch([{ ok: true, project: { id: 'p1', kind: 'sw', name: 'S', data: {}, createdAt: NOW, updatedAt: NOW } }]);
    const store = createProjectStore({ getToken: () => 'TOK', fetchFn: ff.fn, storage, now: () => NOW });
    await store.save({ id: 'p1', kind: 'sw', name: 'S' });
    expect(storage._m.size).toBe(0);
  });
});
