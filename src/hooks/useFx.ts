import { useEffect, useState } from 'react';
import { DEFAULT_DISPLAY_CURRENCY, type FxSnapshot } from '../lib/money';
import { readString, writeString } from '../lib/storage';

/**
 * ONE FX SNAPSHOT PER TAB.
 *
 * /api/fx is fetched once and shared by every Money component on every page,
 * refreshed after the server's own six-hour TTL. A failed fetch leaves `fx`
 * null, and every figure then renders in the engine's EUR with the reason —
 * the components never invent a rate.
 */
const TTL_MS = 6 * 60 * 60 * 1000;
let cache: { fx: FxSnapshot | null; at: number } = { fx: null, at: 0 };
let inflight: Promise<FxSnapshot | null> | null = null;
const listeners = new Set<(fx: FxSnapshot | null) => void>();

async function load(): Promise<FxSnapshot | null> {
  if (cache.fx && Date.now() - cache.at < TTL_MS) return cache.fx;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch('/api/fx');
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json() as FxSnapshot;
      cache = { fx: j, at: Date.now() };
    } catch {
      cache = { fx: null, at: Date.now() - TTL_MS + 60_000 };   // retry in a minute, not on every render
    } finally {
      inflight = null;
    }
    listeners.forEach(l => l(cache.fx));
    return cache.fx;
  })();
  return inflight;
}

export function useFx(): FxSnapshot | null {
  const [fx, setFx] = useState<FxSnapshot | null>(cache.fx);
  useEffect(() => {
    listeners.add(setFx);
    load().then(setFx);
    return () => { listeners.delete(setFx); };
  }, []);
  return fx;
}

/** Test seam: set the snapshot without a network. */
export function primeFx(fx: FxSnapshot | null) { cache = { fx, at: Date.now() }; listeners.forEach(l => l(fx)); }

// ── The reader's display currency ───────────────────────────────────────────
// A per-browser preference for the pages that have no run currency of their
// own (DFM, Prism, Harness, Innovation, CAD Diff). Results uses the run's
// currency instead, because the savings beside the engine figure are in it.
const KEY = 'brainspark_display_currency';
const EVT = 'brainspark-display-currency';

export function readDisplayCurrency(): string {
  const v = readString(KEY, DEFAULT_DISPLAY_CURRENCY).toUpperCase();
  return /^[A-Z]{3}$/.test(v) ? v : DEFAULT_DISPLAY_CURRENCY;
}

export function useDisplayCurrency(): [string, (c: string) => void] {
  const [cur, setCur] = useState<string>(readDisplayCurrency);
  useEffect(() => {
    const on = () => setCur(readDisplayCurrency());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  const set = (c: string) => {
    writeString(KEY, c.toUpperCase());
    window.dispatchEvent(new Event(EVT));   // every picker and figure on the page follows
  };
  return [cur, set];
}
