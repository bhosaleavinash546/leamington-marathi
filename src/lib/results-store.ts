/**
 * SAVED ANALYSES, ON THIS DEVICE.
 *
 * Full results used to live in one localStorage key, ten at a time. A large
 * run is 200–400 KB of JSON, so ten of them sat against the 5 MB quota and
 * the eleventh write failed silently — the analysis was still on screen,
 * but "Open" on the dashboard said it was no longer stored (September 2026
 * review). IndexedDB has no such ceiling in practice and stores objects
 * without stringifying them.
 *
 * Shape: one object store keyed by result id with an index on savedAt, kept
 * to the newest MAX. If IndexedDB is unavailable (blocked site data, some
 * private windows) the old localStorage path is the fallback, through the
 * helper that cannot throw. On first open, anything still in the old key is
 * moved across once and the key is removed.
 */
import { readJSON, writeJSON, remove } from './storage';

export interface SavedResult {
  id: string;
  systemName: string;
  subName: string;
  result: unknown;
  savedAt: string;
}

const DB_NAME = 'brainspark';
const STORE = 'results';
const VERSION = 1;
export const MAX_SAVED = 25;
const LEGACY_KEY = 'brainspark_full_results';

/** Newest-first, capped — the one rule both backends share. */
export function pruneToMax(records: SavedResult[], max = MAX_SAVED): SavedResult[] {
  return [...records].sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0)).slice(0, max);
}

function idb(): IDBFactory | null {
  try { return typeof indexedDB !== 'undefined' ? indexedDB : null; } catch { return null; }
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  const factory = idb();
  if (!factory) return (dbPromise = Promise.resolve(null));
  dbPromise = new Promise(resolve => {
    try {
      const req = factory.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('savedAt', 'savedAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise(resolve => {
    try {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      const req = run(store);
      let out: T | undefined;
      if (req) req.onsuccess = () => { out = req.result; };
      t.oncomplete = () => resolve(out);
      t.onerror = () => resolve(undefined);
      t.onabort = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
}

let migrated = false;
async function migrateLegacy(db: IDBDatabase) {
  if (migrated) return;
  migrated = true;
  const legacy = readJSON<SavedResult[]>(LEGACY_KEY, []);
  if (!Array.isArray(legacy) || !legacy.length) return;
  for (const rec of legacy) {
    if (rec && typeof rec.id === 'string') await tx(db, 'readwrite', s => s.put({ ...rec, savedAt: rec.savedAt || new Date(0).toISOString() }));
  }
  remove(LEGACY_KEY);
}

export async function putResult(rec: SavedResult): Promise<boolean> {
  const db = await open();
  if (!db) {
    return writeJSON(LEGACY_KEY, pruneToMax([rec, ...readJSON<SavedResult[]>(LEGACY_KEY, []).filter(r => r?.id !== rec.id)]));
  }
  await migrateLegacy(db);
  await tx(db, 'readwrite', s => s.put(rec));
  // Prune: everything beyond the newest MAX goes.
  const all = (await tx<SavedResult[]>(db, 'readonly', s => s.getAll())) ?? [];
  const keep = new Set(pruneToMax(all).map(r => r.id));
  for (const r of all) if (!keep.has(r.id)) await tx(db, 'readwrite', s => s.delete(r.id));
  return true;
}

export async function getResult(id: string): Promise<SavedResult | null> {
  const db = await open();
  if (!db) return readJSON<SavedResult[]>(LEGACY_KEY, []).find(r => r?.id === id) ?? null;
  await migrateLegacy(db);
  return (await tx<SavedResult | undefined>(db, 'readonly', s => s.get(id))) ?? null;
}

export async function listResults(): Promise<SavedResult[]> {
  const db = await open();
  if (!db) return pruneToMax(readJSON<SavedResult[]>(LEGACY_KEY, []));
  await migrateLegacy(db);
  return pruneToMax((await tx<SavedResult[]>(db, 'readonly', s => s.getAll())) ?? []);
}
