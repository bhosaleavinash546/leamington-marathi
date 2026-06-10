import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { PartMaster, AuthUser } from '../types';

interface BreakdownRow {
  costElement: string;
  category: string;
  value: string;
  basis: string;
}

const DEFAULT_ELEMENTS: BreakdownRow[] = [
  { costElement: 'Raw Material',          category: 'material',  value: '', basis: '$/kg' },
  { costElement: 'Bought-Out Components', category: 'material',  value: '', basis: '$/EA' },
  { costElement: 'Direct Labor',          category: 'labor',     value: '', basis: '$/hr' },
  { costElement: 'Manufacturing Overhead',category: 'overhead',  value: '', basis: '% of labor' },
  { costElement: 'Tooling Amortisation',  category: 'overhead',  value: '', basis: '$/EA' },
  { costElement: 'Logistics / Freight',   category: 'logistics', value: '', basis: '$/EA' },
  { costElement: 'Profit / Margin',       category: 'profit',    value: '', basis: '% of total' },
];

interface Props { user: AuthUser; }

export default function QuoteForm({ user }: Props) {
  const navigate = useNavigate();
  const [parts, setParts]     = useState<PartMaster[]>([]);
  const [partId, setPartId]   = useState('');
  const [rfqNumber, setRfqNumber] = useState('');
  const [annualVolume, setAnnualVolume] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [validityDate, setValidityDate] = useState('');
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>(DEFAULT_ELEMENTS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.get<PartMaster[]>('/should-cost').then((r) => {
      // Derive unique parts from should-cost records
      const unique = new Map<number, PartMaster>();
      // Backend returns SC headers; extract part info
      (r.data as unknown as Array<{ part_id: number; part_number: string; part_description?: string }>).forEach((sc) => {
        if (!unique.has(sc.part_id)) {
          unique.set(sc.part_id, { id: sc.part_id, part_number: sc.part_number, description: sc.part_description });
        }
      });
      setParts(Array.from(unique.values()));
    });
  }, []);

  const updateRow = (idx: number, field: keyof BreakdownRow, val: string) => {
    setBreakdown((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  };

  const totalPrice = breakdown.reduce((sum, r) => sum + (parseFloat(r.value) || 0), 0);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/quotes', {
        partId: parseInt(partId),
        supplierId: user.supplierId,
        rfqNumber: rfqNumber || undefined,
        annualVolume: annualVolume ? parseFloat(annualVolume) : undefined,
        currency,
        validityDate: validityDate || undefined,
        breakdown: breakdown
          .filter((r) => r.value !== '')
          .map((r, i) => ({
            costElement: r.costElement,
            category: r.category,
            value: parseFloat(r.value) || 0,
            basis: r.basis || undefined,
            sortOrder: i,
          })),
      });
      setSuccess(true);
      setTimeout(() => navigate('/portal'), 1500);
    } catch {
      setError('Failed to submit quote. Please check all fields and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 48 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
        <h2>Quote Submitted Successfully</h2>
        <p style={{ color: '#888', marginTop: 8 }}>Redirecting to your quotes…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/portal')} style={{ marginBottom: 8 }}>
            ← Back
          </button>
          <h1>Submit Supplier Quote</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card">
          <h2>Quote Details</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Part *</label>
              <select value={partId} onChange={(e) => setPartId(e.target.value)} required>
                <option value="">Select a part…</option>
                {parts.map((p) => (
                  <option key={p.id} value={p.id}>{p.part_number} — {p.description}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>RFQ Number</label>
              <input type="text" value={rfqNumber} onChange={(e) => setRfqNumber(e.target.value)} placeholder="RFQ-2024-001" />
            </div>
            <div className="form-group">
              <label>Annual Volume (EA)</label>
              <input type="number" value={annualVolume} onChange={(e) => setAnnualVolume(e.target.value)} placeholder="10000" min="1" />
            </div>
            <div className="form-group">
              <label>Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option>USD</option><option>EUR</option><option>GBP</option><option>INR</option><option>MXN</option>
              </select>
            </div>
            <div className="form-group">
              <label>Valid Until</label>
              <input type="date" value={validityDate} onChange={(e) => setValidityDate(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Cost Breakdown</h2>
          <p style={{ color: '#888', fontSize: 12, marginBottom: 16 }}>
            Enter the unit cost for each element. Leave blank to exclude from submission.
          </p>
          <table>
            <thead>
              <tr>
                <th>Cost Element</th>
                <th>Category</th>
                <th>Unit Cost ({currency})</th>
                <th>Basis</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((row, idx) => (
                <tr key={idx}>
                  <td><strong>{row.costElement}</strong></td>
                  <td>
                    <select value={row.category} onChange={(e) => updateRow(idx, 'category', e.target.value)} style={{ width: 130 }}>
                      <option value="material">Material</option>
                      <option value="labor">Labor</option>
                      <option value="overhead">Overhead</option>
                      <option value="logistics">Logistics</option>
                      <option value="profit">Profit</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={row.value}
                      onChange={(e) => updateRow(idx, 'value', e.target.value)}
                      placeholder="0.0000"
                      style={{ width: 120 }}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={row.basis}
                      onChange={(e) => updateRow(idx, 'basis', e.target.value)}
                      style={{ width: 120 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}><strong>Total Quote Price</strong></td>
                <td><strong>{totalPrice.toFixed(4)}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/portal')}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting || !partId}>
            {submitting ? 'Submitting…' : 'Submit Quote'}
          </button>
        </div>
      </form>
    </div>
  );
}
