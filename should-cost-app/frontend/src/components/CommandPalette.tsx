import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

interface NLResult {
  label: string;
  rows: Record<string, unknown>[];
  count: number;
}

const QUICK_NAV = [
  { label: '📊 Dashboard',           path: '/dashboard' },
  { label: '🎯 Opportunity',          path: '/opportunity' },
  { label: '⚖ Three-Way Analysis',   path: '/three-way' },
  { label: '🌐 Cross-Model',          path: '/cross-model' },
  { label: '🤝 Negotiations',         path: '/negotiations' },
  { label: '🏆 Supplier Scorecard',   path: '/scorecard' },
  { label: '🏗 Should-Costs',         path: '/should-costs' },
];

export default function CommandPalette() {
  const [open, setOpen]         = useState(false);
  const [query, setQuery]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<NLResult | null>(null);
  const [error, setError]       = useState('');
  const inputRef                = useRef<HTMLInputElement>(null);
  const navigate                = useNavigate();

  // Open on Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResult(null);
      setError('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const r = await api.post<NLResult>('/ai/nl-search', { question: query });
      setResult(r.data);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const navAndClose = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        className="cmd-palette-trigger"
        onClick={() => setOpen(true)}
        title="Command palette (⌘K)"
      >
        🔍 Search <kbd>⌘K</kbd>
      </button>
    );
  }

  const filteredNav = QUICK_NAV.filter(
    (n) => !query || n.label.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="cmd-palette-backdrop" onClick={() => setOpen(false)}>
      <div className="cmd-palette" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-palette-input-row">
          <span style={{ fontSize: 18, marginRight: 8 }}>🔍</span>
          <input
            ref={inputRef}
            className="cmd-palette-input"
            placeholder="Ask anything… e.g. 'show parts where overpay > 20%'"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {loading && <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 8 }}>Thinking…</span>}
          {query && !loading && (
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 8 }} onClick={handleSearch}>
              Search
            </button>
          )}
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>

        {error && (
          <div style={{ padding: '10px 16px', color: 'var(--danger)', fontSize: 13 }}>{error}</div>
        )}

        {/* Quick nav — shown when no NL results yet */}
        {!result && filteredNav.length > 0 && (
          <div className="cmd-palette-section">
            <div className="cmd-palette-section-label">Quick Navigation</div>
            {filteredNav.map((n) => (
              <button key={n.path} className="cmd-palette-item" onClick={() => navAndClose(n.path)}>
                {n.label}
                <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>{n.path}</span>
              </button>
            ))}
          </div>
        )}

        {/* NL search results */}
        {result && (
          <div className="cmd-palette-section">
            <div className="cmd-palette-section-label">
              {result.label} — {result.count} row{result.count !== 1 ? 's' : ''}
            </div>
            {result.rows.length === 0 ? (
              <div style={{ padding: '12px 16px', color: 'var(--text-3)', fontSize: 13 }}>No results found.</div>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      {Object.keys(result.rows[0]).map((k) => (
                        <th key={k} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                          {k.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                        {Object.values(row).map((v, j) => (
                          <td key={j} style={{ padding: '6px 10px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                            {v == null ? '—' : String(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-3)', display: 'flex', gap: 16 }}>
          <span><kbd>↵</kbd> to search</span>
          <span><kbd>Esc</kbd> to close</span>
          <span>Powered by Claude AI</span>
        </div>
      </div>
    </div>
  );
}
