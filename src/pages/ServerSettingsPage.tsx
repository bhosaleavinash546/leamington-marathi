import { useIsNative } from '../hooks/useMobile';
import { useState, useEffect } from 'react';
import { Server, CheckCircle, XCircle, Wifi, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ServerSettingsPage() {
  // These are the native app's own screens, but they are also reachable on
  // mobile WEB from the tab bar — where a fixed header sits above them and hid
  // the page heading. No header in the native shell, so the padding follows it.
  const native = useIsNative();
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState('');
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const v = localStorage.getItem('brainspark_server_url') || '';
    setUrl(v);
    setSaved(v);
  }, []);

  const handleSave = () => {
    const trimmed = url.trim().replace(/\/$/, '');
    localStorage.setItem('brainspark_server_url', trimmed);
    setSaved(trimmed);
    setStatus('idle');
  };

  const handleTest = async () => {
    setStatus('testing');
    setErrorMsg('');
    const base = url.trim().replace(/\/$/, '');
    try {
      const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        setStatus('ok');
      } else {
        setStatus('error');
        setErrorMsg(`Server returned ${r.status}`);
      }
    } catch (e: unknown) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : 'Connection failed');
    }
  };

  const handleClear = () => {
    setUrl('');
    setSaved('');
    localStorage.removeItem('brainspark_server_url');
    setStatus('idle');
  };

  const dirty = url.trim().replace(/\/$/, '') !== saved;

  return (
    <div className={`min-h-screen px-4 pb-6 ${native ? 'pt-safe pt-6' : 'pt-24'}`} style={{ background: 'rgb(var(--navy-950))' }}>
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm mb-6"
        
      >
        <ArrowLeft size={16} /> Back
      </button>

      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 rounded-xl" style={{ background: 'rgba(245,158,11,0.15)' }}>
          <Server size={24} className="text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Server Settings</h1>
          <p className="text-xs" >
            Connect to your BrainSpark server
          </p>
        </div>
      </div>

      <div
        className="rounded-2xl p-5 mb-5"
        style={{ background: 'var(--tint)', border: '1px solid var(--hairline)' }}
      >
        <label className="block text-sm font-medium mb-2" >
          Server URL
        </label>
        <input
          type="url"
          value={url}
          onChange={e => { setUrl(e.target.value); setStatus('idle'); }}
          placeholder="https://your-server.com"
          className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
          style={{
            background: 'var(--tint)',
            border: '1px solid var(--hairline)',
          }}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="url"
        />
        <p className="mt-2 text-xs" >
          Enter the base URL of your self-hosted BrainSpark backend (no trailing slash).
        </p>
      </div>

      {status === 'ok' && (
        <div className="flex items-center gap-2 mb-4 text-sm text-emerald-400">
          <CheckCircle size={16} /> Connected successfully
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-center gap-2 mb-4 text-sm text-red-400">
          <XCircle size={16} /> {errorMsg || 'Connection failed'}
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <button
          onClick={handleTest}
          disabled={!url.trim() || status === 'testing'}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
          style={{ background: 'rgb(var(--gold-500) / 0.15)', color: 'rgb(var(--gold-400))', border: '1px solid rgb(var(--gold-500) / 0.3)' }}
        >
          <Wifi size={16} />
          {status === 'testing' ? 'Testing…' : 'Test Connection'}
        </button>
        <button
          onClick={handleSave}
          disabled={!dirty}
          className="flex-1 py-3 rounded-xl text-sm font-bold transition-opacity disabled:opacity-40"
          style={{ background: 'rgb(var(--gold-500))', color: 'rgb(var(--navy-950))' }}
        >
          Save
        </button>
      </div>

      {saved && (
        <button
          onClick={handleClear}
          className="w-full py-2 rounded-xl text-sm transition-opacity"
          
        >
          Clear saved URL
        </button>
      )}

      <div
        className="mt-8 rounded-2xl p-4"
        style={{ background: 'var(--tint)', border: '1px solid var(--hairline)' }}
      >
        <p className="text-xs font-semibold mb-2" >How it works</p>
        <ul className="text-xs space-y-1" >
          <li>• The app talks to your own BrainSpark server over the internet.</li>
          <li>• Make sure port 3001 (or your configured port) is accessible from this device.</li>
          <li>• Changes take effect after the app restarts.</li>
        </ul>
      </div>
    </div>
  );
}
