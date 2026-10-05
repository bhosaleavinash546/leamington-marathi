import { useEffect, useState } from 'react';
import { getAuthToken } from '../services/auth';

/**
 * Is ANY Anthropic key available to this user — in this browser, saved
 * (encrypted) against the account, or configured on the server?
 *
 * Every AI tool used to gate on `localStorage.brainspark_api_key` alone. Since
 * keys moved to the account (Settings → API Key) the server resolves
 * request → account → server env, but the pages did not know: a user who saved
 * their key in Settings and opened Prism on a new device was told "Add your
 * Anthropic API key in Settings" — the thing they had just done — and Run
 * buttons stayed disabled. Pages keep sending only a REAL local key (an empty
 * one makes the server fall back); this hook only decides whether to block.
 *
 * Unknown (status still loading, offline, signed out) counts as available: a
 * false block is worse than letting the server answer, and the server's
 * "No API key configured" error is explicit.
 */
type Status = { configured: boolean; serverFallback: boolean } | null;
let cache: Status | undefined;
let inflight: Promise<Status> | null = null;
const listeners = new Set<(s: Status) => void>();

function fetchStatus(): Promise<Status> {
  if (cache !== undefined) return Promise.resolve(cache);
  if (inflight) return inflight;
  const token = getAuthToken();
  if (!token) return Promise.resolve(null);
  inflight = fetch('/api/settings/api-key', { headers: { Authorization: `Bearer ${token}` } })
    .then(r => (r.ok ? r.json() : null))
    .then((d): Status => (d ? { configured: !!d.configured, serverFallback: !!d.serverFallback } : null))
    .catch(() => null)
    .then(s => { cache = s; inflight = null; listeners.forEach(l => l(s)); return s; });
  return inflight;
}

/** Call after saving or removing the account key so every page re-asks. */
export function invalidateAiKeyStatus() { cache = undefined; void fetchStatus(); }

function localKey(): string {
  try { return localStorage.getItem('brainspark_api_key') || ''; } catch { return ''; }
}

export function useAiAvailable(): boolean {
  const [status, setStatus] = useState<Status | undefined>(cache);
  useEffect(() => {
    listeners.add(setStatus);
    if (cache === undefined) void fetchStatus().then(setStatus); else setStatus(cache);
    return () => { listeners.delete(setStatus); };
  }, []);
  if (localKey().trim()) return true;
  if (status === undefined || status === null) return true;   // unknown → let the server decide
  return status.configured || status.serverFallback;
}

/** Where the key will come from — for wording, not for gating. */
export type AiKeySource = 'local' | 'account' | 'server' | 'none' | 'unknown';
export function useAiKeySource(): AiKeySource {
  const [status, setStatus] = useState<Status | undefined>(cache);
  useEffect(() => {
    listeners.add(setStatus);
    if (cache === undefined) void fetchStatus().then(setStatus); else setStatus(cache);
    return () => { listeners.delete(setStatus); };
  }, []);
  if (localKey().trim()) return 'local';
  if (status === undefined || status === null) return 'unknown';
  return status.configured ? 'account' : status.serverFallback ? 'server' : 'none';
}
