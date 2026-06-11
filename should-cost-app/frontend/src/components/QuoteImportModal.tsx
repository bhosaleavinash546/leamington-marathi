import { useState, useRef, ChangeEvent } from 'react';
import api from '../utils/api';

interface PreviewRow {
  part_number: string;
  supplier_code: string;
  supplier_name: string;
  rfq_number: string;
  cost_element: string;
  category: string;
  value: string;
}

interface ImportResult {
  imported: number;
  created: string[];
  errors: string[];
}

interface Props {
  onClose: () => void;
  onImported: () => void;
}

const TEMPLATE_COLS = [
  'part_number','rfq_number','supplier_code','supplier_name','supplier_country',
  'annual_volume','currency','validity_date','cost_element','category','value','basis',
];

export default function QuoteImportModal({ onClose, onImported }: Props) {
  const fileRef           = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText]     = useState('');
  const [preview, setPreview]     = useState<PreviewRow[]>([]);
  const [fileName, setFileName]   = useState('');
  const [parseError, setParseError] = useState('');
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<ImportResult | null>(null);

  const downloadTemplate = async () => {
    setParseError('');
    try {
      // Fetch through the API client so the JWT Authorization header is sent.
      // A plain browser navigation would hit the protected route unauthenticated
      // and return "Missing or malformed Authorization header".
      const r = await api.get('/quotes/import/template', { responseType: 'blob' });
      const url = URL.createObjectURL(r.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'costlens_quote_template.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setParseError('Could not download the template. Please try again.');
    }
  };

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError('');
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      try {
        const rows = parseCsvPreview(text);
        setPreview(rows);
      } catch (err) {
        setParseError((err as Error).message);
        setPreview([]);
      }
    };
    reader.readAsText(file);
  };

  const parseCsvPreview = (raw: string): PreviewRow[] => {
    const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
    if (lines.length < 2) throw new Error('File needs a header row and at least one data row.');
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const missing = ['part_number','supplier_code','cost_element','value'].filter((c) => !headers.includes(c));
    if (missing.length > 0) throw new Error(`Missing columns: ${missing.join(', ')}`);

    const col = (row: string[], name: string) => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? (row[idx] ?? '').trim() : '';
    };

    return lines.slice(1)
      .filter((l) => l.trim() !== '')
      .map((line) => {
        const vals = line.split(',').map((v) => v.trim());
        return {
          part_number:   col(vals, 'part_number'),
          supplier_code: col(vals, 'supplier_code'),
          supplier_name: col(vals, 'supplier_name'),
          rfq_number:    col(vals, 'rfq_number'),
          cost_element:  col(vals, 'cost_element'),
          category:      col(vals, 'category'),
          value:         col(vals, 'value'),
        };
      });
  };

  const handleImport = async () => {
    if (!csvText) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await api.post<ImportResult>('/quotes/import', { csv: csvText });
      setResult(r.data);
      if (r.data.imported > 0) onImported();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Import failed.';
      setParseError(msg);
    } finally {
      setLoading(false);
    }
  };

  const quoteGroups = Array.from(
    new Set(preview.map((r) => `${r.part_number}|${r.supplier_code}|${r.rfq_number}`))
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
    }}>
      <div style={{
        background: 'var(--card)', borderRadius: 16, width: '90%', maxWidth: 800,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)', border: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Import Quotes from CSV</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
              Upload a CSV file to bulk-import supplier quotes into the system.
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-3)', lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* Step 1 — template */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>
              Step 1 — Download the CSV template
            </div>
            <button className="btn btn-secondary btn-sm" onClick={downloadTemplate} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              ⬇ Download Template (CSV)
            </button>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
              Required columns: <code style={{ fontSize: 10 }}>{TEMPLATE_COLS.join(' · ')}</code><br />
              One row per cost element. Multiple rows with the same <em>part_number + supplier_code + rfq_number</em> form one quote.
            </div>
          </div>

          {/* Step 2 — upload */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>
              Step 2 — Select your CSV file
            </div>
            <div
              style={{
                border: '2px dashed var(--border)', borderRadius: 10, padding: '24px 20px',
                textAlign: 'center', cursor: 'pointer', background: 'var(--bg)',
                transition: 'border-color 0.2s',
              }}
              onClick={() => fileRef.current?.click()}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
              {fileName
                ? <div style={{ fontWeight: 600, color: 'var(--accent)' }}>{fileName}</div>
                : <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Click to browse or drop your CSV here</div>}
            </div>
            <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleFile} />
          </div>

          {/* Parse error */}
          {parseError && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>
              {parseError}
            </div>
          )}

          {/* Preview */}
          {preview.length > 0 && !result && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>
                Step 3 — Preview ({quoteGroups.length} quotes · {preview.length} line items)
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 280, border: '1px solid var(--border)', borderRadius: 8 }}>
                <table style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      {['Part','Supplier','RFQ #','Cost Element','Category','Value'].map((h) => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 10px' }}><strong>{row.part_number}</strong></td>
                        <td style={{ padding: '6px 10px' }}>{row.supplier_name || row.supplier_code}</td>
                        <td style={{ padding: '6px 10px' }}>{row.rfq_number}</td>
                        <td style={{ padding: '6px 10px' }}>{row.cost_element}</td>
                        <td style={{ padding: '6px 10px' }}>
                          <span style={{ fontSize: 10, background: 'var(--accent)', color: '#fff', borderRadius: 4, padding: '2px 6px' }}>
                            {row.category}
                          </span>
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600 }}>{parseFloat(row.value).toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div style={{ marginBottom: 20 }}>
              <div style={{
                background: result.imported > 0 ? 'rgba(22,163,74,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${result.imported > 0 ? 'rgba(22,163,74,0.3)' : 'rgba(239,68,68,0.3)'}`,
                borderRadius: 10, padding: 16,
              }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: result.imported > 0 ? 'var(--success)' : 'var(--danger)', marginBottom: 8 }}>
                  {result.imported > 0 ? `✓ ${result.imported} quote${result.imported > 1 ? 's' : ''} imported successfully` : 'No quotes imported'}
                </div>
                {result.created.length > 0 && (
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-2)' }}>
                    {result.created.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                )}
                {result.errors.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)' }}>Errors ({result.errors.length}):</div>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 11, color: 'var(--danger)' }}>
                      {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={!csvText || loading || !!parseError || preview.length === 0}
            >
              {loading ? 'Importing…' : `Import ${quoteGroups.length > 0 ? quoteGroups.length + ' Quote' + (quoteGroups.length > 1 ? 's' : '') : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
