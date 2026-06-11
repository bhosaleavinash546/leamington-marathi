import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { SupplierQuoteHeader, AuthUser } from '../types';
import QuoteImportModal from './QuoteImportModal';

interface Props { user: AuthUser; }

export default function SupplierPortal({ user }: Props) {
  const [quotes, setQuotes]       = useState<SupplierQuoteHeader[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showImport, setShowImport] = useState(false);
  const navigate = useNavigate();

  const isInternal = user.role === 'internal' || user.role === 'admin';

  const loadQuotes = useCallback(() => {
    setLoading(true);
    api.get<SupplierQuoteHeader[]>('/quotes')
      .then((r) => setQuotes(r.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadQuotes(); }, [loadQuotes]);

  if (loading) return <div className="loading">Loading quotes…</div>;

  return (
    <div>
      {showImport && (
        <QuoteImportModal
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); loadQuotes(); }}
        />
      )}

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
          <button className="btn btn-primary" onClick={() => navigate('/portal/new')}>
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
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/portal/new')}>
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
  );
}
