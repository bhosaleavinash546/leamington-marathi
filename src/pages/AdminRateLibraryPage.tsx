import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Database, Download, Upload, RotateCcw, ShieldAlert, CheckCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ButtonSpinner from '../components/ui/ButtonSpinner';

interface FieldSpec { id: string; label: string; type: string }
interface Schema { materials: { key: string; fields: FieldSpec[] }; processes: { key: string; fields: FieldSpec[] }; regions: { key: string; fields: FieldSpec[] }; constants: { key: string; fields: FieldSpec[] } }
type Table = 'materials' | 'processes' | 'regions';
type Rows = Record<string, Record<string, unknown>>;
interface Payload { fieldSpecs: Schema; defaults: { materials: Rows; processes: Rows; regions: Rows; constants: Record<string, unknown> }; custom: Partial<Record<Table | 'constants', Rows>>; meta: { custom: boolean; updatedAt: string | null; updatedBy: string | null; summary: Record<string, number> } }
interface VErr { table?: string; row?: string; field?: string; message: string }

const TABLES: Table[] = ['materials', 'processes', 'regions'];
const cell = (v: unknown): string | number => Array.isArray(v) ? v.join('|') : (v as string | number);
const numEq = (a: unknown, b: unknown) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : String(a) === String(b);

export default function AdminRateLibraryPage() {
  const { token } = useAuth();
  const [data, setData] = useState<Payload | null>(null);
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<VErr[]>([]);
  const [msg, setMsg] = useState('');

  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setForbidden(null);
    const r = await fetch('/api/admin/rate-library', { headers: auth });
    if (r.status === 403) { const d = await r.json().catch(() => ({})); setForbidden(d.error || 'Admin access required.'); return; }
    if (r.ok) setData(await r.json());
  }, [token]);

  useEffect(() => { if (token) load(); }, [token, load]);

  // Build an Excel workbook pre-filled with the current active values (defaults +
  // existing custom) so the admin edits from real numbers.
  function downloadTemplate() {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    for (const t of TABLES) {
      const spec = data.fieldSpecs[t];
      const merged: Rows = { ...data.defaults[t] };
      for (const [k, v] of Object.entries(data.custom[t] || {})) merged[k] = { ...(merged[k] || {}), ...v };
      const header = [spec.key, ...spec.fields.map(f => f.label)];
      const rows = Object.entries(merged).map(([name, row]) => [name, ...spec.fields.map(f => cell(row[f.id]))]);
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      XLSX.utils.book_append_sheet(wb, ws, spec.key + 's');
    }
    const cs = data.fieldSpecs.constants;
    const cMerged = { ...(data.defaults.constants), ...(data.custom.constants || {}) } as Record<string, unknown>;
    const cRows = cs.fields.map(f => [f.label, cell(cMerged[f.id])]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Constant', 'Value'], ...cRows]), 'Constants');
    XLSX.writeFile(wb, 'costvision-rate-library.xlsx');
  }

  // Parse an uploaded workbook, diff every cell against the built-in default, and
  // send ONLY the changed/new values as the custom override.
  async function onUpload(file: File) {
    if (!data) return;
    setBusy(true); setErrors([]); setMsg('');
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const custom: Record<string, Rows> = { materials: {}, processes: {}, regions: {} };
      const constants: Record<string, unknown> = {};
      const labelToId = (spec: { fields: FieldSpec[] }) => Object.fromEntries(spec.fields.map(f => [f.label.toLowerCase(), f.id]));

      for (const t of TABLES) {
        const spec = data.fieldSpecs[t];
        const sheet = wb.Sheets[spec.key + 's'];
        if (!sheet) continue;
        const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1 });
        const [head, ...body] = aoa;
        if (!head) continue;
        const map = labelToId(spec);
        const colId = head.map((h, i) => i === 0 ? '__key' : map[String(h).trim().toLowerCase()]);
        for (const r of body) {
          const name = String(r[0] ?? '').trim();
          if (!name) continue;
          const def = data.defaults[t][name];
          const over: Record<string, unknown> = {};
          r.forEach((val, i) => {
            const id = colId[i];
            if (!id || id === '__key' || val === '' || val === undefined) return;
            const spc = spec.fields.find(f => f.id === id)!;
            const isText = spc.type === 'str' || spc.type === 'list';
            const parsed = isText ? String(val) : Number(val);
            const defVal = def ? (isText ? cell(def[id]) : def[id]) : undefined;
            if (!def || defVal === undefined || !numEq(parsed, defVal)) over[id] = parsed;   // only changed/new cells
          });
          if (Object.keys(over).length) custom[t][name] = over;
        }
      }
      const cSheet = wb.Sheets['Constants'];
      if (cSheet) {
        const map = labelToId(data.fieldSpecs.constants);
        for (const [label, value] of XLSX.utils.sheet_to_json<(string | number)[]>(cSheet, { header: 1 }).slice(1)) {
          const id = map[String(label).trim().toLowerCase()];
          if (id && value !== '' && value !== undefined && !numEq(Number(value), data.defaults.constants[id])) constants[id] = Number(value);
        }
      }
      await save({ ...custom, ...(Object.keys(constants).length ? { constants } : {}) });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not read that file.');
    } finally { setBusy(false); }
  }

  async function save(custom: Record<string, unknown>) {
    setBusy(true); setErrors([]); setMsg('');
    const r = await fetch('/api/admin/rate-library', { method: 'POST', headers: auth, body: JSON.stringify({ custom }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErrors(d.errors || [{ message: d.error || 'Save failed' }]); setBusy(false); return; }
    setMsg('Saved — your rate library is now active for all should-cost estimates.');
    await load(); setBusy(false);
  }

  async function revert() {
    setBusy(true); setErrors([]); setMsg('');
    await fetch('/api/admin/rate-library/revert', { method: 'POST', headers: auth });
    setMsg('Reverted to the built-in defaults.');
    await load(); setBusy(false);
  }

  if (forbidden) return (
    <div className="min-h-screen bg-navy-950 pt-24 px-4">
      <div className="max-w-lg mx-auto text-center bg-navy-900 border border-white/10 rounded-2xl p-8">
        <ShieldAlert size={32} className="text-amber-400 mx-auto mb-3" />
        <h1 className="text-white text-lg font-semibold mb-2">Admin access required</h1>
        <p className="text-slate-400 text-sm">{forbidden}</p>
      </div>
    </div>
  );

  const s = data?.meta.summary;
  const overrides = s ? s.materials + s.processes + s.regions + s.constants : 0;

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center flex-shrink-0"><Database size={22} className="text-teal-400" /></div>
          <div>
            <h1 className="text-2xl font-bold text-white">Rate Library</h1>
            <p className="text-slate-400 text-sm max-w-2xl mt-1">Upload your organisation's own material €/kg, machine &amp; process rates and region labour. Your values are merged over the built-in defaults and drive every should-cost estimate. Anything you don't provide keeps the shipped default.</p>
          </div>
        </div>

        {/* Active status */}
        <div className={`rounded-2xl border p-5 mb-6 ${data?.meta.custom ? 'bg-teal-500/8 border-teal-500/25' : 'bg-navy-900 border-white/10'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-semibold flex items-center gap-2">
                {data?.meta.custom ? <><CheckCircle size={16} className="text-teal-400" /> Custom library active</> : 'Built-in defaults active'}
              </p>
              {data?.meta.custom && s && (
                <p className="text-slate-400 text-xs mt-1">{s.materials} material · {s.processes} process · {s.regions} region · {s.constants} constant overrides
                  {data.meta.updatedAt && ` · updated ${new Date(data.meta.updatedAt).toLocaleString('en-GB')}${data.meta.updatedBy ? ` by ${data.meta.updatedBy}` : ''}`}</p>
              )}
            </div>
            {overrides > 0 && (
              <button onClick={revert} disabled={busy} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 disabled:opacity-40">
                <RotateCcw size={13} /> Revert to built-in
              </button>
            )}
          </div>
        </div>

        {/* Workflow */}
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-navy-900 border border-white/10 rounded-2xl p-5">
            <p className="text-white font-semibold mb-1 flex items-center gap-2"><Download size={15} className="text-teal-400" /> 1 · Download template</p>
            <p className="text-slate-400 text-xs mb-3">An Excel workbook pre-filled with the current values — Materials, Processes, Regions and Constants on separate sheets. Edit the numbers (percentages as fractions, e.g. 0.15).</p>
            <button onClick={downloadTemplate} disabled={!data || busy} className="text-sm px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 disabled:opacity-40">Download .xlsx template</button>
          </div>
          <div className="bg-navy-900 border border-white/10 rounded-2xl p-5">
            <p className="text-white font-semibold mb-1 flex items-center gap-2"><Upload size={15} className="text-teal-400" /> 2 · Upload your data</p>
            <p className="text-slate-400 text-xs mb-3">Only cells you changed (or new rows) are saved as overrides. Validated before anything is applied.</p>
            <label className={`inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-teal-600/80 hover:bg-teal-500 text-white font-medium cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
              {busy ? <ButtonSpinner /> : <Upload size={14} />} Upload .xlsx / .csv
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
            </label>
          </div>
        </div>

        {msg && <div className="mb-4 flex items-center gap-2 text-sm text-teal-300 bg-teal-500/10 border border-teal-500/25 rounded-xl px-4 py-3"><CheckCircle size={15} /> {msg}</div>}

        {errors.length > 0 && (
          <div className="mb-4 bg-danger-500/8 border border-danger-500/25 rounded-xl px-4 py-3">
            <p className="text-danger-300 text-sm font-semibold flex items-center gap-2 mb-2"><AlertTriangle size={15} /> {errors.length} validation issue{errors.length > 1 ? 's' : ''} — nothing was saved</p>
            <ul className="space-y-1 max-h-52 overflow-auto">
              {errors.slice(0, 40).map((e, i) => (
                <li key={i} className="text-danger-300/80 text-xs font-mono">{[e.table, e.row, e.field].filter(Boolean).join(' › ')}: {e.message}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-slate-600 text-xs">Tip: leave a cell unchanged to keep the shipped default. Add a new row (new material/process/region name) to extend the catalogue — new rows must have every column filled. Percentages are fractions (0.15 = 15%).</p>
      </div>
    </div>
  );
}
