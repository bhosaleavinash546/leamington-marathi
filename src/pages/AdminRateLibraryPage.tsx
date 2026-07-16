import { useState, useEffect, useCallback } from 'react';
import { downloadXlsx } from '../services/xlsx-write';
import { parseWorkbook } from '../services/safe-xlsx';
import { Database, Download, Upload, RotateCcw, ShieldAlert, CheckCircle, AlertTriangle, History, GitCompare } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ButtonSpinner from '../components/ui/ButtonSpinner';

interface FieldSpec { id: string; label: string; type: string }
interface Schema { materials: { key: string; fields: FieldSpec[] }; processes: { key: string; fields: FieldSpec[] }; regions: { key: string; fields: FieldSpec[] }; constants: { key: string; fields: FieldSpec[] } }
type Table = 'materials' | 'processes' | 'regions';
type Rows = Record<string, Record<string, unknown>>;
interface Payload { fieldSpecs: Schema; defaults: { materials: Rows; processes: Rows; regions: Rows; constants: Record<string, unknown> }; custom: Partial<Record<Table | 'constants', Rows>>; meta: { custom: boolean; updatedAt: string | null; updatedBy: string | null; summary: Record<string, number> } }
interface VErr { table?: string; row?: string; field?: string; message: string }
interface Version { version: number; action: string; note: string | null; updatedBy: string | null; updatedAt: string; summary: Record<string, number>; active: boolean }
interface Change { table: string; key: string; field: string; from: string; to: string }
interface ImpactRow { name: string; current: number; candidate: number; pct: number; quote: boolean }
interface Preview { ok: boolean; errors: VErr[]; warnings: VErr[]; diff: Change[]; impact: { rows: ImpactRow[]; count: number; meanAbsPct: number; maxPct: number } }

// Parse a spreadsheet cell to a number, tolerating European decimal commas
// ("1,5" → 1.5) and thousands separators ("1.234,56" or "1,234.56"). The
// right-most separator is treated as the decimal point.
function parseNum(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  let s = String(raw ?? '').trim().replace(/[€£$¥\s]/g, '');   // strip currency/space
  if (!s) return NaN;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) {
    // both present → the right-most separator is the decimal point
    const dec = lc > ld ? ',' : '.'; const thou = dec === ',' ? '.' : ',';
    s = s.split(thou).join('').replace(dec, '.');
  } else if (lc > -1) {
    // lone comma: thousands separator if there are several, or exactly 3 digits
    // follow the last one ("1,234"→1234); otherwise a European decimal ("1,5"→1.5).
    const commas = (s.match(/,/g) || []).length;
    const after = s.length - lc - 1;
    s = commas > 1 || after === 3 ? s.split(',').join('') : s.replace(',', '.');
  }
  return Number(s);
}

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
  const [errMsg, setErrMsg] = useState('');
  const [versions, setVersions] = useState<Version[]>([]);
  const [diffs, setDiffs] = useState<Record<number, Change[]>>({});
  const [candidate, setCandidate] = useState<Record<string, unknown> | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setForbidden(null); setErrMsg('');
    try {
      const r = await fetch('/api/admin/rate-library', { headers: auth });
      if (r.status === 403) { const d = await r.json().catch(() => ({})); setForbidden(d.error || 'Admin access required.'); return; }
      if (r.status === 401) { setForbidden('Your session has expired — please sign in again.'); return; }
      if (!r.ok) { setErrMsg('Could not load the rate library.'); return; }
      setData(await r.json());
      const rv = await fetch('/api/admin/rate-library/versions', { headers: auth });
      if (rv.ok) { const d = await rv.json(); setVersions(d.versions || []); }
    } catch { setErrMsg('Network error loading the rate library.'); }
  }, [token]);

  async function rollback(version: number) {
    setBusy(true); setErrors([]); setMsg(''); setErrMsg('');
    try {
      const r = await fetch('/api/admin/rate-library/rollback', { method: 'POST', headers: auth, body: JSON.stringify({ version }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErrMsg(d.error || `Rollback to v${version} failed.`); setBusy(false); return; }
      setMsg(`Rolled back to v${version} — now active for all estimates.`);
      setDiffs({}); await load();
    } catch { setErrMsg('Network error during rollback.'); }
    setBusy(false);
  }

  async function toggleDiff(version: number) {
    if (diffs[version]) { setDiffs(d => { const n = { ...d }; delete n[version]; return n; }); return; }
    const r = await fetch(`/api/admin/rate-library/versions/${version}/diff`, { headers: auth });
    if (r.ok) { const d = await r.json(); setDiffs(prev => ({ ...prev, [version]: d.changes || [] })); }
  }

  useEffect(() => { if (token) load(); }, [token, load]);

  // Build an Excel workbook pre-filled with the current active values (defaults +
  // existing custom) so the admin edits from real numbers.
  function downloadTemplate() {
    if (!data) return;
    const sheets = [];
    for (const t of TABLES) {
      const spec = data.fieldSpecs[t];
      const merged: Rows = { ...data.defaults[t] };
      for (const [k, v] of Object.entries(data.custom[t] || {})) merged[k] = { ...(merged[k] || {}), ...v };
      const header = [spec.key, ...spec.fields.map(f => f.label)];
      const rows = Object.entries(merged).map(([name, row]) => [name, ...spec.fields.map(f => cell(row[f.id]))]);
      sheets.push({ name: spec.key + 's', rows: [header, ...rows] });
    }
    const cs = data.fieldSpecs.constants;
    const cMerged = { ...(data.defaults.constants), ...(data.custom.constants || {}) } as Record<string, unknown>;
    const cRows = cs.fields.map(f => [f.label, cell(cMerged[f.id])]);
    sheets.push({ name: 'Constants', rows: [['Constant', 'Value'], ...cRows] });
    void downloadXlsx('costvision-rate-library.xlsx', sheets);
  }

  // Parse an uploaded workbook, diff every cell against the built-in default, and
  // send ONLY the changed/new values as the custom override.
  async function onUpload(file: File) {
    if (!data) return;
    setBusy(true); setErrors([]); setMsg('');
    try {
      // exceljs parse (safe path) — xlsx retained for template WRITING only.
      const parsedWb = await parseWorkbook(await file.arrayBuffer());
      const custom: Record<string, Rows> = { materials: {}, processes: {}, regions: {} };
      const constants: Record<string, unknown> = {};
      const labelToId = (spec: { fields: FieldSpec[] }) => Object.fromEntries(spec.fields.map(f => [f.label.toLowerCase(), f.id]));

      for (const t of TABLES) {
        const spec = data.fieldSpecs[t];
        const aoa = parsedWb.sheets[spec.key + 's'];
        if (!aoa) continue;
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
            const parsed = isText ? String(val) : parseNum(val);
            const defVal = def ? (isText ? cell(def[id]) : def[id]) : undefined;
            if (!def || defVal === undefined || !numEq(parsed, defVal)) over[id] = parsed;   // only changed/new cells
          });
          if (Object.keys(over).length) custom[t][name] = over;
        }
      }
      const cRows = parsedWb.sheets['Constants'];
      if (cRows) {
        const map = labelToId(data.fieldSpecs.constants);
        for (const [label, value] of cRows.slice(1)) {
          const id = map[String(label).trim().toLowerCase()];
          if (id && value !== '' && value !== undefined && !numEq(parseNum(value), data.defaults.constants[id])) constants[id] = parseNum(value);
        }
      }
      const built = { ...custom, ...(Object.keys(constants).length ? { constants } : {}) };
      await runPreview(built);   // stage it — admin reviews impact before applying
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Could not read that file.');
    } finally { setBusy(false); }
  }

  // Dry-run the candidate library: diff, plausibility warnings, and impact on
  // representative parts — shown before the admin commits.
  async function runPreview(custom: Record<string, unknown>) {
    setErrors([]); setMsg(''); setErrMsg('');
    const r = await fetch('/api/admin/rate-library/preview', { method: 'POST', headers: auth, body: JSON.stringify({ custom }) });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErrMsg(d.error || 'Could not preview the changes.'); return; }
    setCandidate(custom);
    setPreview(await r.json());
  }

  function cancelPreview() { setCandidate(null); setPreview(null); }

  async function applyCandidate() {
    if (!candidate) return;
    setBusy(true); setErrors([]); setMsg(''); setErrMsg('');
    try {
      const r = await fetch('/api/admin/rate-library', { method: 'POST', headers: auth, body: JSON.stringify({ custom: candidate }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErrors(d.errors || [{ message: d.error || 'Save failed' }]); setBusy(false); return; }
      setMsg('Applied — your rate library is now active for all should-cost estimates.');
      cancelPreview(); await load();
    } catch { setErrMsg('Network error while applying.'); }
    setBusy(false);
  }

  async function revert() {
    setBusy(true); setErrors([]); setMsg(''); setErrMsg('');
    try {
      const r = await fetch('/api/admin/rate-library/revert', { method: 'POST', headers: auth });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErrMsg(d.error || 'Revert failed.'); setBusy(false); return; }
      setMsg('Reverted to the built-in defaults.');
      await load();
    } catch { setErrMsg('Network error during revert.'); }
    setBusy(false);
  }

  if (forbidden) return (
    <div className="min-h-screen bg-navy-950 pt-24 px-4">
      <div className="lg:hidden max-w-3xl mx-auto mb-4 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200/90 text-xs">This data-dense workspace is best used on a desktop screen — editing tables here is cramped on mobile.</div>
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
            <p className="text-slate-400 text-sm max-w-2xl mt-1">Upload your organisation's own material €/kg, machine &amp; process rates and region labour. Rates are held in the engine's base currency (EUR) and converted to your display currency (£ by default) on every estimate. Your values are merged over the built-in defaults and drive every should-cost estimate. Anything you don't provide keeps the shipped default.</p>
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
            <p className="text-slate-400 text-xs mb-3">Only changed cells (or new rows) are staged. You'll see the diff, plausibility warnings and the impact on sample parts <em>before</em> applying.</p>
            <label className={`inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-teal-600/80 hover:bg-teal-500 text-white font-medium cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
              {busy ? <ButtonSpinner /> : <Upload size={14} />} Upload .xlsx / .csv
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
            </label>
          </div>
        </div>

        {/* Preview before apply */}
        {preview && candidate && (() => {
          const imp = preview.impact;
          const movers = [...imp.rows].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 6);
          const bigMove = Math.abs(imp.maxPct) >= 50;
          return (
            <div className="mb-6 rounded-2xl border border-teal-500/30 bg-navy-900 overflow-hidden">
              <div className="px-5 py-3 border-b border-white/8 bg-teal-500/5 flex items-center justify-between">
                <p className="text-white font-semibold flex items-center gap-2"><GitCompare size={16} className="text-teal-400" /> Review before applying</p>
                <div className="flex items-center gap-2">
                  <button onClick={cancelPreview} className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5">Cancel</button>
                  <button onClick={applyCandidate} disabled={busy || !preview.ok} title={preview.ok ? '' : 'Fix validation errors first'} className="text-xs px-3 py-1.5 rounded-lg bg-teal-600/80 hover:bg-teal-500 text-white font-medium disabled:opacity-40">{busy ? 'Applying…' : 'Apply changes'}</button>
                </div>
              </div>
              <div className="p-5 space-y-4">
                {preview.errors.length > 0 && (
                  <div className="bg-danger-500/8 border border-danger-500/25 rounded-xl px-4 py-3">
                    <p className="text-danger-300 text-sm font-semibold flex items-center gap-2 mb-1"><AlertTriangle size={14} /> {preview.errors.length} error{preview.errors.length > 1 ? 's' : ''} — fix before applying</p>
                    <ul className="space-y-0.5 max-h-40 overflow-auto">{preview.errors.slice(0, 30).map((e, i) => <li key={i} className="text-danger-300/80 text-xs font-mono">{[e.table, e.row, e.field].filter(Boolean).join(' › ')}: {e.message}</li>)}</ul>
                  </div>
                )}
                {preview.warnings.length > 0 && (
                  <div className="bg-amber-500/8 border border-amber-500/25 rounded-xl px-4 py-3">
                    <p className="text-amber-300 text-sm font-semibold flex items-center gap-2 mb-1"><AlertTriangle size={14} /> {preview.warnings.length} plausibility warning{preview.warnings.length > 1 ? 's' : ''} — you can still apply</p>
                    <ul className="space-y-0.5 max-h-40 overflow-auto">{preview.warnings.slice(0, 30).map((w, i) => <li key={i} className="text-amber-300/80 text-xs font-mono">{[w.table, w.row, w.field].filter(Boolean).join(' › ')}: {w.message}</li>)}</ul>
                  </div>
                )}

                {/* Impact */}
                <div>
                  <div className="flex items-baseline gap-3 mb-2">
                    <p className="text-white text-sm font-semibold">Impact on {imp.count} representative part{imp.count === 1 ? '' : 's'}</p>
                    <span className={`text-xs ${bigMove ? 'text-amber-300' : 'text-slate-400'}`}>avg |Δ| {imp.meanAbsPct}% · largest {imp.maxPct >= 0 ? '+' : ''}{imp.maxPct}%</span>
                  </div>
                  {bigMove && <p className="text-amber-300/80 text-xs mb-2">A change this large is often a decimal typo — confirm it's intended.</p>}
                  {imp.rows.length === 0 ? <p className="text-slate-500 text-xs">No comparable parts (add supplier quotes to preview against your own parts).</p> : (
                    <table className="w-full text-xs">
                      <thead><tr className="text-slate-500"><th className="text-left font-medium py-1">Part</th><th className="text-right font-medium py-1">Current</th><th className="text-right font-medium py-1">New</th><th className="text-right font-medium py-1">Δ</th></tr></thead>
                      <tbody>
                        {movers.map((r, i) => (
                          <tr key={i} className="border-t border-white/5">
                            <td className="py-1 text-slate-300 truncate max-w-[280px]">{r.name}{r.quote ? ' ·q' : ''}</td>
                            <td className="py-1 text-right text-slate-400 font-mono">€{r.current.toFixed(2)}</td>
                            <td className="py-1 text-right text-slate-200 font-mono">€{r.candidate.toFixed(2)}</td>
                            <td className={`py-1 text-right font-mono font-semibold ${Math.abs(r.pct) >= 50 ? 'text-amber-300' : r.pct === 0 ? 'text-slate-600' : 'text-teal-300'}`}>{r.pct >= 0 ? '+' : ''}{r.pct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Field changes */}
                <div>
                  <p className="text-white text-sm font-semibold mb-1">{preview.diff.length} field change{preview.diff.length === 1 ? '' : 's'} vs the active library</p>
                  {preview.diff.length > 0 && (
                    <table className="w-full text-xs"><tbody>
                      {preview.diff.slice(0, 40).map((c, i) => (
                        <tr key={i} className="border-b border-white/5 last:border-0">
                          <td className="py-1 pr-3 text-slate-500 whitespace-nowrap">{c.table} · {c.key}</td>
                          <td className="py-1 pr-3 text-slate-300 font-medium">{c.field}</td>
                          <td className="py-1 text-right font-mono"><span className="text-danger-300/80">{c.from}</span> <span className="text-slate-600">→</span> <span className="text-teal-300">{c.to}</span></td>
                        </tr>
                      ))}
                    </tbody></table>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {msg && <div className="mb-4 flex items-center gap-2 text-sm text-teal-300 bg-teal-500/10 border border-teal-500/25 rounded-xl px-4 py-3"><CheckCircle size={15} /> {msg}</div>}
        {errMsg && <div className="mb-4 flex items-center gap-2 text-sm text-danger-300 bg-danger-500/10 border border-danger-500/25 rounded-xl px-4 py-3"><AlertTriangle size={15} /> {errMsg}</div>}

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

        <p className="text-slate-600 text-xs mb-8">Tip: leave a cell unchanged to keep the shipped default. Add a new row (new material/process/region name) to extend the catalogue — new rows must have every column filled. Percentages are fractions (0.15 = 15%).</p>

        {/* Version history / audit trail */}
        {versions.length > 0 && (
          <div className="bg-navy-900 border border-white/10 rounded-2xl p-5">
            <p className="text-white font-semibold flex items-center gap-2 mb-1"><History size={16} className="text-teal-400" /> Version history</p>
            <p className="text-slate-500 text-xs mb-4">Every change is recorded. The top entry is live; roll back to any earlier version in one click.</p>
            <div className="space-y-2">
              {versions.map(v => {
                const counts = v.summary || {};
                const total = (counts.materials || 0) + (counts.processes || 0) + (counts.regions || 0) + (counts.constants || 0);
                return (
                  <div key={v.version} className={`rounded-xl border p-3 ${v.active ? 'bg-teal-500/8 border-teal-500/25' : 'border-white/8'}`}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-white font-mono text-sm font-semibold">v{v.version}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${v.action === 'upload' ? 'bg-blue-500/10 text-blue-300 border-blue-500/25' : v.action === 'rollback' ? 'bg-violet-500/10 text-violet-300 border-violet-500/25' : 'bg-slate-500/10 text-slate-300 border-slate-500/25'}`}>{v.action}</span>
                      {v.active && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/30">Active</span>}
                      <span className="text-slate-400 text-xs">{v.action === 'revert' ? 'built-in defaults' : `${total} override${total === 1 ? '' : 's'}`}</span>
                      <span className="text-slate-600 text-xs flex-1 min-w-0 truncate">{v.note ? `“${v.note}” · ` : ''}{v.updatedBy || '—'} · {new Date(v.updatedAt).toLocaleString('en-GB')}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => toggleDiff(v.version)} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5"><GitCompare size={12} /> {diffs[v.version] ? 'Hide' : 'Changes'}</button>
                        {!v.active && <button onClick={() => rollback(v.version)} disabled={busy} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-teal-500/30 text-teal-300 hover:bg-teal-500/10 disabled:opacity-40"><RotateCcw size={12} /> Roll back</button>}
                      </div>
                    </div>
                    {diffs[v.version] && (
                      <div className="mt-3 pt-3 border-t border-white/8">
                        {diffs[v.version].length === 0 ? <p className="text-slate-500 text-xs">No effective changes vs the previous version.</p> : (
                          <table className="w-full text-xs">
                            <tbody>
                              {diffs[v.version].map((c, i) => (
                                <tr key={i} className="border-b border-white/5 last:border-0">
                                  <td className="py-1 pr-3 text-slate-500 whitespace-nowrap">{c.table} · {c.key}</td>
                                  <td className="py-1 pr-3 text-slate-300 font-medium">{c.field}</td>
                                  <td className="py-1 text-right font-mono"><span className="text-danger-300/80">{c.from}</span> <span className="text-slate-600">→</span> <span className="text-teal-300">{c.to}</span></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
