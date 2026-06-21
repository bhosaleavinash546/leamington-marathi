import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { SupplierQuoteHeader, AuthUser } from '../types';
import QuoteImportModal from './QuoteImportModal';

interface Props { user: AuthUser; }

interface SharedModel {
  id: number;
  part_number: string;
  part_description?: string;
  version: number;
  shared_by: string;
  shared_at: string;
  status: string;
  message?: string;
}

interface BreakdownRow {
  id: number;
  cost_element: string;
  category: string;
  value: number;
  basis?: string;
}

interface ResponseForm {
  [breakdownId: number]: { counter_value: string; response_text: string };
}

export default function SupplierPortal({ user }: Props) {
  const [quotes, setQuotes]       = useState<SupplierQuoteHeader[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [showChooser, setShowChooser] = useState(false);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'quotes' | 'shared'>('quotes');
  const [sharedModels, setSharedModels] = useState<SharedModel[]>([]);
  const [loadingShared, setLoadingShared] = useState(false);
  const [viewShareId, setViewShareId] = useState<number | null>(null);
  const [viewShareData, setViewShareData] = useState<{ share: SharedModel; breakdown: BreakdownRow[] } | null>(null);
  const [loadingShare, setLoadingShare] = useState(false);
  const [responseForm, setResponseForm] = useState<ResponseForm>({});
  const [submittingResponse, setSubmittingResponse] = useState(false);
  const [responseSuccess, setResponseSuccess] = useState(false);

  const isInternal = user.role === 'internal' || user.role === 'admin';

  // Suppliers go straight to the web form; internal users pick web-form vs CSV.
  const startNewQuote = () => {
    if (isInternal) setShowChooser(true);
    else navigate('/portal/new');
  };

  const loadQuotes = useCallback(() => {
    setLoading(true);
    api.get<SupplierQuoteHeader[]>('/quotes')
      .then((r) => setQuotes(r.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadQuotes(); }, [loadQuotes]);

  useEffect(() => {
    if (activeTab === 'shared' && user.role === 'supplier') {
      setLoadingShared(true);
      api.get<SharedModel[]>('/open-book/my-shares')
        .then((r) => setSharedModels(r.data))
        .catch(() => setSharedModels([]))
        .finally(() => setLoadingShared(false));
    }
  }, [activeTab, user.role]);

  const openShareView = async (share: SharedModel) => {
    setViewShareId(share.id);
    setLoadingShare(true);
    setResponseForm({});
    setResponseSuccess(false);
    try {
      const r = await api.get<BreakdownRow[]>(`/open-book/shares/${share.id}/breakdown`);
      setViewShareData({ share, breakdown: r.data });
    } catch {
      setViewShareData({ share, breakdown: [] });
    } finally {
      setLoadingShare(false);
    }
  };

  const submitResponse = async () => {
    if (!viewShareId) return;
    setSubmittingResponse(true);
    try {
      const lines = Object.entries(responseForm)
        .filter(([, v]) => v.counter_value !== '' || v.response_text !== '')
        .map(([id, v]) => ({
          breakdown_id: parseInt(id, 10),
          counter_value: v.counter_value !== '' ? parseFloat(v.counter_value) : undefined,
          response_text: v.response_text || undefined,
        }));
      await api.post(`/open-book/shares/${viewShareId}/responses`, { lines });
      setResponseSuccess(true);
      // refresh shared models
      const r = await api.get<SharedModel[]>('/open-book/my-shares');
      setSharedModels(r.data);
    } catch {
      /* ignore */
    } finally {
      setSubmittingResponse(false);
    }
  };

  if (loading) return <div className="loading">Loading quotes…</div>;

  return (
    <div>
      {showImport && (
        <QuoteImportModal
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); loadQuotes(); }}
        />
      )}

      {showChooser && (
        <div
          onClick={() => setShowChooser(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 16, width: '90%', maxWidth: 560,
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)', border: '1px solid var(--border)',
              padding: 28,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 19 }}>Submit a New Quote</h2>
              <button onClick={() => setShowChooser(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-3)', lineHeight: 1 }}>✕</button>
            </div>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-3)' }}>
              Choose how you'd like to enter the supplier quote.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <button
                onClick={() => { setShowChooser(false); navigate('/portal/new'); }}
                style={{
                  textAlign: 'left', cursor: 'pointer', borderRadius: 14,
                  border: '1px solid var(--border)', background: 'var(--bg)', padding: 20,
                  transition: 'border-color 0.15s, transform 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; }}
              >
                <div style={{ fontSize: 30, marginBottom: 10 }}>📝</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>Web Form</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                  Type a single quote with a cost-element breakdown directly into the system.
                </div>
              </button>
              <button
                onClick={() => { setShowChooser(false); setShowImport(true); }}
                style={{
                  textAlign: 'left', cursor: 'pointer', borderRadius: 14,
                  border: '1px solid var(--border)', background: 'var(--bg)', padding: 20,
                  transition: 'border-color 0.15s, transform 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; }}
              >
                <div style={{ fontSize: 30, marginBottom: 10 }}>📄</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>CSV Import</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                  Bulk-upload one or many quotes from a CSV file using the downloadable template.
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab bar - only show to suppliers */}
      {user.role === 'supplier' && (
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 0 }}>
          <button
            onClick={() => setActiveTab('quotes')}
            style={{
              padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
              background: 'none', borderBottom: activeTab === 'quotes' ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === 'quotes' ? 'var(--accent)' : 'var(--text-2)', marginBottom: -2,
            }}
          >
            My Quotes
          </button>
          <button
            onClick={() => setActiveTab('shared')}
            style={{
              padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
              background: 'none', borderBottom: activeTab === 'shared' ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === 'shared' ? 'var(--accent)' : 'var(--text-2)', marginBottom: -2,
            }}
          >
            📋 Shared Cost Models
          </button>
        </div>
      )}

      {(activeTab === 'quotes' || user.role !== 'supplier') && (
        <div>
          <div className="page-header">
            <div>
              <h1>{isInternal ? 'All Quotes' : 'My Quotes'}</h1>
              <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
                {isInternal
                  ? `${quotes.length} quote${quotes.length !== 1 ? 's' : ''} in system — ${user.fullName}`
                  : `Logged in as ${user.fullName} — ${user.email}`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {isInternal && (
                <button className="btn btn-secondary" onClick={() => setShowImport(true)}>
                  ⬆ Import CSV
                </button>
              )}
              <button className="btn btn-primary" onClick={startNewQuote}>
                + Submit New Quote
              </button>
            </div>
          </div>

          {quotes.length === 0 ? (
            <div className="card">
              <div className="empty">
                No quotes yet.{' '}
                {isInternal
                  ? <><button className="btn btn-secondary btn-sm" onClick={() => setShowImport(true)}>Import CSV</button>{' or '}</>
                  : null}
                <button className="btn btn-primary btn-sm" onClick={startNewQuote}>
                  Submit a quote
                </button>
              </div>
            </div>
          ) : (
            <div className="card">
              <table>
                <thead>
                  <tr>
                    <th>Part Number</th>
                    {isInternal && <th>Supplier</th>}
                    <th>RFQ #</th>
                    <th>Version</th>
                    <th>Total Price</th>
                    <th>Currency</th>
                    <th>Status</th>
                    <th>Valid Until</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => (
                    <tr key={q.id}>
                      <td>
                        <strong>{q.part_number}</strong>
                        <br />
                        <small style={{ color: '#888' }}>{q.part_description}</small>
                      </td>
                      {isInternal && <td style={{ fontSize: 12 }}>{q.supplier_name ?? '—'}</td>}
                      <td>{q.rfq_number ?? '—'}</td>
                      <td>v{q.version}</td>
                      <td>{q.total_price?.toFixed(2) ?? '—'}</td>
                      <td>{q.currency}</td>
                      <td>
                        <span className={`badge badge-${q.status}`}>{q.status}</span>
                      </td>
                      <td>{q.validity_date ? new Date(q.validity_date).toLocaleDateString() : '—'}</td>
                      <td>{q.submitted_at ? new Date(q.submitted_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!isInternal && (
            <div className="card" style={{ background: '#f0f0ff', border: '1px solid #c7c7ff' }}>
              <h3 style={{ color: '#4f46e5' }}>Quote Submission Guidelines</h3>
              <ul style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: '#555', marginTop: 8 }}>
                <li>Break down your price by cost element (Material, Labor, Overhead, Logistics, Profit).</li>
                <li>Ensure all values are in the currency specified in the RFQ.</li>
                <li>Attach any supporting documents to the RFQ response email.</li>
                <li>Quotes are valid for 90 days unless stated otherwise.</li>
                <li>Contact procurement if you need to revise a submitted quote.</li>
              </ul>
            </div>
          )}

          {isInternal && (
            <div className="card" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <h3 style={{ color: 'var(--accent)', marginBottom: 8 }}>Bulk Quote Import</h3>
              <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
                Import supplier quotes from a CSV file. Each row represents one cost element;
                rows with the same part number + supplier code + RFQ number are grouped into a single quote.
              </p>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(true)}>
                ⬆ Open Import Wizard
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'shared' && user.role === 'supplier' && (
        <div>
          <div className="page-header">
            <div>
              <h1>📋 Shared Cost Models</h1>
              <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>Open-book cost models shared with you by buyers</div>
            </div>
          </div>

          {loadingShared ? (
            <div className="loading">Loading shared models…</div>
          ) : sharedModels.length === 0 ? (
            <div className="card"><div className="empty">No cost models have been shared with you yet.</div></div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    <th style={{ padding: '11px 14px', textAlign: 'left' }}>Part</th>
                    <th style={{ padding: '11px 14px', textAlign: 'left' }}>Version</th>
                    <th style={{ padding: '11px 14px', textAlign: 'left' }}>Shared By</th>
                    <th style={{ padding: '11px 14px', textAlign: 'left' }}>Shared Date</th>
                    <th style={{ padding: '11px 14px', textAlign: 'left' }}>Status</th>
                    <th style={{ padding: '11px 14px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sharedModels.map((s) => (
                    <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 700 }}>
                        {s.part_number}
                        {s.part_description && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.part_description}</div>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>v{s.version}</td>
                      <td style={{ padding: '10px 14px' }}>{s.shared_by}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-3)' }}>{new Date(s.shared_at).toLocaleDateString('en-GB')}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: 'var(--accent-glow)', color: 'var(--accent)' }}>
                          {s.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <button className="btn btn-sm btn-primary" onClick={() => openShareView(s)}>
                          View & Respond
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* View & Respond Modal */}
      {viewShareId !== null && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) { setViewShareId(null); setViewShareData(null); setResponseSuccess(false); } }}
        >
          <div style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 720, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>
                  {viewShareData?.share.part_number} — v{viewShareData?.share.version}
                </div>
                {viewShareData?.share.message && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Message: {viewShareData.share.message}</div>
                )}
              </div>
              <button onClick={() => { setViewShareId(null); setViewShareData(null); setResponseSuccess(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-3)' }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {loadingShare ? (
                <div className="loading" style={{ padding: 32, textAlign: 'center' }}>Loading cost model…</div>
              ) : responseSuccess ? (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>Response submitted!</div>
                  <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => { setViewShareId(null); setViewShareData(null); setResponseSuccess(false); }}>Close</button>
                </div>
              ) : viewShareData && (
                <>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)' }}>
                        <th style={{ padding: '9px 12px', textAlign: 'left' }}>Cost Element</th>
                        <th style={{ padding: '9px 12px', textAlign: 'left' }}>Category</th>
                        <th style={{ padding: '9px 12px', textAlign: 'right' }}>Buyer's Value</th>
                        <th style={{ padding: '9px 12px', textAlign: 'right', minWidth: 100 }}>Your Counter</th>
                        <th style={{ padding: '9px 12px', textAlign: 'left', minWidth: 160 }}>Your Comment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewShareData.breakdown.map((b) => (
                        <tr key={b.id} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600 }}>{b.cost_element}</td>
                          <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-3)' }}>{b.category}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{Number(b.value).toFixed(4)}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type="number"
                              step="0.0001"
                              className="form-control"
                              style={{ minWidth: 90, padding: '4px 8px', fontSize: 12 }}
                              value={responseForm[b.id]?.counter_value ?? ''}
                              onChange={(e) => setResponseForm((prev) => ({ ...prev, [b.id]: { counter_value: e.target.value, response_text: prev[b.id]?.response_text ?? '' } }))}
                              placeholder="0.0000"
                            />
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type="text"
                              className="form-control"
                              style={{ padding: '4px 8px', fontSize: 12 }}
                              value={responseForm[b.id]?.response_text ?? ''}
                              onChange={(e) => setResponseForm((prev) => ({ ...prev, [b.id]: { counter_value: prev[b.id]?.counter_value ?? '', response_text: e.target.value } }))}
                              placeholder="Comment…"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>

            {viewShareData && !responseSuccess && !loadingShare && (
              <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => { setViewShareId(null); setViewShareData(null); }}>Cancel</button>
                <button className="btn btn-primary" disabled={submittingResponse} onClick={submitResponse}>
                  {submittingResponse ? 'Submitting…' : 'Submit Response'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
