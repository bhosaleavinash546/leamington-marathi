import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { SupplierQuoteHeader, AuthUser } from '../types';

interface Props { user: AuthUser; }

export default function SupplierPortal({ user }: Props) {
  const [quotes, setQuotes] = useState<SupplierQuoteHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get<SupplierQuoteHeader[]>('/quotes')
      .then((r) => setQuotes(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading quotes…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>My Quotes</h1>
          <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
            Logged in as {user.fullName} — {user.email}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/portal/new')}>
          + Submit New Quote
        </button>
      </div>

      {quotes.length === 0 ? (
        <div className="card">
          <div className="empty">
            No quotes submitted yet.{' '}
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/portal/new')}>
              Submit your first quote
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Part Number</th>
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
    </div>
  );
}
