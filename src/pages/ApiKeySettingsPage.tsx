// API key management.
//
// The server has stored encrypted per-user keys since it was written —
// api_credentials plus GET/POST/DELETE /api/settings/api-key — and nothing in
// the product ever called any of it. Thirteen pages instead read
// localStorage.brainspark_api_key directly, so a key had to be re-entered in
// every browser, never synced, and there was no way to see whether one was even
// configured. resolveApiKey() already prefers a request-body key and falls back
// to the stored one, so saving a key here makes every tool work everywhere
// without the browser holding it.
import { useEffect, useState } from 'react';
import { KeyRound, Loader2, Check, Trash2, ShieldCheck } from 'lucide-react';
import { getAuthToken } from '../services/auth';
import PageHeader from '../components/ui/PageHeader';

interface Status {
  configured: boolean;
  last4: string | null;
  since: string | null;
  serverFallback: boolean;
}

export default function ApiKeySettingsPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [entry, setEntry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const localKey = localStorage.getItem('brainspark_api_key') || '';

  async function load() {
    try {
      const r = await fetch('/api/settings/api-key', { headers });
      if (r.ok) setStatus(await r.json());
    } catch { /* status is best-effort; the form still works */ }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function save() {
    setBusy(true); setError(''); setSaved(false);
    try {
      const r = await fetch('/api/settings/api-key', { method: 'POST', headers, body: JSON.stringify({ apiKey: entry.trim() }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not save that key.');
      setEntry(''); setSaved(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that key.');
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setError(''); setSaved(false);
    try {
      const r = await fetch('/api/settings/api-key', { method: 'DELETE', headers });
      if (!r.ok) throw new Error('Could not remove the key.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the key.');
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-2xl mx-auto">
        <PageHeader
          icon={KeyRound}
          eyebrow="Settings"
          tone="neutral"
          title="API Key"
          subtitle="Stored encrypted against your account, so every tool works on every device without re-entering it."
        />

        <div className="bg-navy-900 border border-white/10 rounded-2xl p-6 space-y-5">
          {status && (
            <div className={`flex items-start gap-3 p-4 rounded-xl border ${status.configured ? 'bg-success-500/10 border-success-500/20' : 'bg-white/5 border-white/10'}`}>
              {status.configured
                ? <ShieldCheck size={18} className="text-success-400 flex-shrink-0 mt-0.5" />
                : <KeyRound size={18} className="text-slate-400 flex-shrink-0 mt-0.5" />}
              <div className="text-sm">
                {status.configured ? (
                  <>
                    <p className="text-white font-medium">
                      A key is saved to your account — ending <span className="tabular-nums">····{status.last4}</span>
                    </p>
                    {status.since && (
                      <p className="text-slate-500 text-xs mt-0.5">
                        Added {new Date(status.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-slate-300">
                    No key saved to your account.
                    {status.serverFallback
                      ? ' This server has its own key configured, so the tools will still run.'
                      : ' The AI features need one before they can run.'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* A key that exists only in this browser is the thing this page
              replaces, so say so rather than leaving the two silently split. */}
          {localKey && !status?.configured && (
            <div className="p-4 rounded-xl bg-gold-500/10 border border-gold-500/25 text-sm">
              <p className="text-gold-200 font-medium">This browser has a key saved locally.</p>
              <p className="text-slate-400 text-xs mt-1">
                It only works here, and it is not saved against your account. Paste it below to
                store it encrypted and have it follow you to any device.
              </p>
            </div>
          )}

          <label className="block">
            <span className="text-slate-400 text-xs">
              {status?.configured ? 'Replace with a new key' : 'Anthropic API key'}
            </span>
            <input
              type="password" value={entry} autoComplete="off" spellCheck={false}
              onChange={(e) => { setEntry(e.target.value); setSaved(false); }}
              placeholder="sk-ant-…"
              className="mt-1 w-full bg-navy-950 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm font-mono"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={save} disabled={busy || entry.trim().length < 20}
              className="flex items-center gap-2 bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-navy-950 font-semibold rounded-lg px-4 py-2 text-sm transition-colors"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {status?.configured ? 'Replace key' : 'Save key'}
            </button>
            {status?.configured && (
              <button
                onClick={remove} disabled={busy}
                className="flex items-center gap-2 border border-white/15 hover:bg-white/5 disabled:opacity-40 text-slate-300 rounded-lg px-4 py-2 text-sm transition-colors"
              >
                <Trash2 size={15} /> Remove
              </button>
            )}
            {saved && <span className="text-success-400 text-sm">Saved.</span>}
            {error && <span className="text-danger-400 text-sm">{error}</span>}
          </div>

          <p className="text-slate-500 text-xs leading-relaxed border-t border-white/10 pt-4 measure">
            The key is encrypted before storage and only its last four characters are ever
            read back — this page cannot show you the key again, and neither can the server.
            Requests you make from a tool that carries its own key still use that one; this is
            the fallback for everything else.
          </p>
        </div>
      </div>
    </div>
  );
}
