/**
 * Function stage — what the part is FOR, as a function-cost model.
 *
 * The AI drafts verb-noun functions, the part's real components/regions and an
 * allocation of cost to function, seeded by the engineer's description, the
 * confirmed vision observations and the measured geometry. The engineer edits
 * every cell. "Check" runs the deterministic FAST core (/api/innovate/fast-matrix)
 * and shows value indices; nothing here is a model's arithmetic. When "Use in
 * analysis" is on, the dossier recomputes the same matrix against the engine's
 * should-cost and gives the VA/VE lens its poor-value functions and trimming
 * questions — the evidence that lens never had before.
 */
import { useAiAvailable } from '../../hooks/useAiAvailable';
import { useEffect, useState } from 'react';
import { usePanelState, type PanelMemory } from './panel-memory';
import { Workflow, Loader2, Plus, Trash2, AlertTriangle, Calculator } from 'lucide-react';

export interface FunctionDraft {
  components: { name: string; costSharePct: number }[];
  functions: { name: string; worthPct: number }[];
  alloc: number[][];
}
interface FnRow { name: string; costPct: number; worthPct: number; valueIndex: number; verdict: string }

interface Props {
  token: string | null;
  apiKey: string;
  partName: string;
  partContext: string;
  observations: string[];
  geo: Record<string, unknown> | null;
  /** The confirmed draft (null = not used in the analysis). */
  onChange: (draft: FunctionDraft | null) => void;
  /** Page-owned memory so a remount restores the draft (PR-34). */
  memory?: PanelMemory;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + (Number(b) || 0), 0);
const round = (n: number) => Math.round(n * 10) / 10;

export default function FunctionModelPanel({ token, apiKey, partName, partContext, observations, geo, onChange, memory }: Props) {
  const aiAvailable = useAiAvailable();
  const [draft, setDraft] = usePanelState<FunctionDraft | null>(memory, 'fn.draft', null);
  // Off until the engineer confirms: the dossier calls this model
  // "engineer-confirmed" (Prism review PR-06).
  const [use, setUse] = usePanelState(memory, 'fn.use', false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [check, setCheck] = useState<FnRow[] | null>(null);
  const [checkError, setCheckError] = useState('');

  // A draft whose allocation rows or cost shares do not sum to 100% (±2) is
  // never passed on — it used to be quietly rescaled (70 + 70 → 50 + 50).
  const allocOk = (d: FunctionDraft) => d.alloc.every(r => Math.abs(sum(r) - 100) <= 2) && Math.abs(sum(d.components.map(c => c.costSharePct)) - 100) <= 2;
  useEffect(() => { onChange(draft && use && allocOk(draft) ? draft : null); }, [draft, use]);   // eslint-disable-line react-hooks/exhaustive-deps

  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  async function draftIt() {
    if (!apiKey && !aiAvailable) { setError('Add your Anthropic API key in Settings to draft functions.'); return; }
    setBusy(true); setError(''); setCheck(null);
    try {
      const r = await fetch('/api/part360/draft-functions', {
        method: 'POST', headers,
        body: JSON.stringify({ partName, context: partContext, observations, geo, apiKey }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Function draft failed');
      const fns = (d.functions ?? []) as { name: string; worthPct: number }[];
      const comps = (d.components ?? []) as { name: string; costSharePct: number }[];
      const alloc = comps.map((_, i) => fns.map((__, j) => Number(d.alloc?.[i]?.[j]) || 0));
      setDraft({ components: comps.map(c => ({ name: c.name, costSharePct: Number(c.costSharePct) || 0 })), functions: fns.map(f => ({ name: f.name, worthPct: Number(f.worthPct) || 0 })), alloc });
      setUse(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Function draft failed');
    } finally { setBusy(false); }
  }

  async function runCheck() {
    if (!draft) return;
    setCheckError(''); setCheck(null);
    try {
      const r = await fetch('/api/innovate/fast-matrix', {
        method: 'POST', headers,
        body: JSON.stringify({ components: draft.components.map(c => ({ name: c.name, cost: c.costSharePct })), functions: draft.functions, alloc: draft.alloc }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Check failed');
      setCheck(d.functions);
    } catch (e) { setCheckError(e instanceof Error ? e.message : 'Check failed'); }
  }

  const edit = (fn: (d: FunctionDraft) => void) => setDraft(prev => { if (!prev) return prev; const n = structuredClone(prev); fn(n); setCheck(null); return n; });
  const rowSums = draft?.alloc.map(r => round(sum(r))) ?? [];
  const badRows = rowSums.filter(s => Math.abs(s - 100) > 2).length;
  const worthSum = draft ? round(sum(draft.functions.map(f => f.worthPct))) : 0;

  return (
    <div className="dfm-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-white font-semibold text-sm flex items-center gap-2"><Workflow size={15} className="text-teal-400" /> What is it for — function-cost model</h3>
          <p className="text-2xs text-slate-500 mt-1 measure">
            AI drafts the part's functions and where its cost goes, from your description{observations.length ? `, ${observations.length} confirmed vision observations` : ''} and the measured geometry. Edit any cell; value indices are computed, not guessed.
          </p>
        </div>
        <button onClick={draftIt} disabled={busy}
          className="text-xs font-semibold px-3 py-2 rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20 flex items-center gap-1.5 disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Workflow size={13} />} {draft ? 'Draft again' : 'Draft functions with AI'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mb-2 flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{error}</p>}

      {draft && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 text-left">
                  <th className="py-1 pr-2 font-medium">Component / region</th>
                  <th className="py-1 px-1 font-medium text-right">Cost share %</th>
                  {draft.functions.map((f, j) => (
                    <th key={j} className="py-1 px-1 font-medium min-w-[110px]">
                      <input className="dfm-input !py-1 !text-2xs w-full" aria-label={`Function ${j + 1} name`} value={f.name} onChange={e => edit(d => { d.functions[j].name = e.target.value; })} />
                      <input className="dfm-input !py-1 !text-2xs w-full mt-1 text-right" type="number" min="0" aria-label={`Function ${j + 1} worth percent`} value={f.worthPct} onChange={e => edit(d => { d.functions[j].worthPct = Number(e.target.value); })} />
                    </th>
                  ))}
                  <th className="py-1 px-1 font-medium text-right">Row Σ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {draft.components.map((c, i) => (
                  <tr key={i} className="border-t border-hairline">
                    <td className="py-1 pr-2"><input className="dfm-input !py-1 !text-2xs w-full" aria-label={`Component ${i + 1} name`} value={c.name} onChange={e => edit(d => { d.components[i].name = e.target.value; })} /></td>
                    <td className="py-1 px-1"><input className="dfm-input !py-1 !text-2xs w-20 text-right" type="number" min="0" aria-label={`Component ${i + 1} cost share percent`} value={c.costSharePct} onChange={e => edit(d => { d.components[i].costSharePct = Number(e.target.value); })} /></td>
                    {draft.functions.map((_, j) => (
                      <td key={j} className="py-1 px-1"><input className="dfm-input !py-1 !text-2xs w-full text-right" type="number" min="0" max="100" aria-label={`Share of ${c.name || `component ${i + 1}`} serving ${draft.functions[j].name || `function ${j + 1}`}, percent`} value={draft.alloc[i][j]} onChange={e => edit(d => { d.alloc[i][j] = Number(e.target.value); })} /></td>
                    ))}
                    <td className={`py-1 px-1 text-right font-mono ${Math.abs(rowSums[i] - 100) > 2 ? 'text-red-400' : 'text-slate-400'}`}>{rowSums[i]}</td>
                    <td className="py-1 pl-1"><button aria-label={`Remove ${c.name || `component ${i + 1}`}`} onClick={() => edit(d => { d.components.splice(i, 1); d.alloc.splice(i, 1); })} className="text-slate-500 hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <button onClick={() => edit(d => { d.components.push({ name: '', costSharePct: 0 }); d.alloc.push(d.functions.map(() => 0)); })}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"><Plus size={13} /> Component</button>
            <button onClick={runCheck} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-hairline hover:border-teal-500/40 text-slate-200 flex items-center gap-1.5"><Calculator size={13} /> Check value indices</button>
            <label className="text-xs text-slate-300 flex items-center gap-2 ml-auto cursor-pointer">
              <input type="checkbox" checked={use} onChange={e => setUse(e.target.checked)} className="accent-teal-500" /> I have checked this model — use it in the analysis
            </label>
            {use && draft && !allocOk(draft) && <p className="w-full text-2xs text-amber-300">Not used: every allocation row and the cost shares must each sum to 100% (±2) before the model reaches the analysis.</p>}
          </div>
          {(badRows > 0 || Math.abs(worthSum - 100) > 2) && (
            <p className="text-2xs text-amber-400 mt-2">
              {badRows > 0 ? `${badRows} row${badRows === 1 ? '' : 's'} do not sum to 100% — the analysis will refuse the model until they do. ` : ''}
              {Math.abs(worthSum - 100) > 2 ? `Function worth sums to ${worthSum}% (it is normalised, but check the weights).` : ''}
            </p>
          )}
          {checkError && <p className="text-2xs text-red-400 mt-2">{checkError}</p>}
          {check && (
            <ul className="mt-3 space-y-1" aria-label="Value indices">
              {check.map(f => (
                <li key={f.name} className="text-xs flex flex-wrap gap-x-3">
                  <span className="text-white font-medium">{f.name}</span>
                  <span className="text-slate-400 font-mono">cost {f.costPct}% · worth {f.worthPct}% · VI {f.valueIndex}</span>
                  <span className={f.verdict.startsWith('poor') ? 'text-red-400' : f.verdict === 'under-served' ? 'text-amber-400' : 'text-teal-300'}>{f.verdict}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
