import { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { CircuitBoard, Upload, Cpu, Calculator, Download, Trash2, Plus, AlertTriangle, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ButtonSpinner from '../components/ui/ButtonSpinner';

interface Line { refDes: string; type: string; label?: string; package: string; mount: 'SMT' | 'TH'; pins: number; qty: number; unitCost: number; lineCost?: number; unitCostOverride?: number }
interface Board { widthMm: number; heightMm: number; layers: number; finish: string; areaCm2?: number }
interface Cost {
  currency: string; board: Board; total: number; componentCost: number; fabCost: number; assemblyCost: number; overhead: number; volume: number;
  stats: { lineItems: number; uniquePartNos: number; totalPlacements: number; thLeads: number };
  breakdown: Record<string, { value: number; pct: number }>;
  lines: Line[]; note: string;
}

const FINISHES = ['hasl', 'leadfree_hasl', 'enig', 'osp', 'immersion_silver'];
const LAYERS = [1, 2, 4, 6, 8, 10];
const inp = 'w-full bg-navy-800 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-teal-500/40';

export default function PcbBomCostPage() {
  const { token } = useAuth();
  const [types, setTypes] = useState<Record<string, { label: string; mount: string; unit: number }>>({});
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [board, setBoard] = useState<Board>({ widthMm: 80, heightMm: 60, layers: 2, finish: 'hasl' });
  const [lines, setLines] = useState<Line[]>([]);
  const [cost, setCost] = useState<Cost | null>(null);
  const [volume, setVolume] = useState('1000');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/pcb-cost/catalogue').then(r => r.ok ? r.json() : null).then(d => { if (d?.classes) setTypes(d.classes); }).catch(() => {});
  }, []);

  const onFile = useCallback((f: File) => {
    if (!f.type.startsWith('image/')) { setError('Please upload a photo (PNG/JPG) of the PCB.'); return; }
    setFile(f); setError(''); setCost(null); setLines([]);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  }, []);

  async function extractAndCost() {
    if (!file || !token) return;
    const apiKey = localStorage.getItem('brainspark_api_key') || '';
    if (!apiKey) { setError('Add your Anthropic API key in Settings to read the board image.'); return; }
    setBusy(true); setError('');
    try {
      const b64 = preview.split(',')[1];
      const r = await fetch('/api/pcb-bom-cost', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageBase64: b64, mimeType: file.type, apiKey, volume: Number(volume) || 1000 }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Extraction failed');
      applyCost(d.cost);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not analyse the board.'); }
    finally { setBusy(false); }
  }

  function applyCost(c: Cost) {
    setCost(c);
    setBoard(c.board);
    setLines(c.lines.map(l => ({ ...l, unitCostOverride: l.unitCost })));
  }

  async function recost(nextLines = lines, nextBoard = board) {
    if (!token) return;
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/pcb-cost', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ board: nextBoard, volume: Number(volume) || 1000, components: nextLines.map(l => ({ refDes: l.refDes, type: l.type, package: l.package, mount: l.mount, pins: l.pins, qty: l.qty, unitCostOverride: l.unitCostOverride })) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Costing failed');
      setCost(d.cost);
      setLines(d.cost.lines.map((l: Line, i: number) => ({ ...l, unitCostOverride: nextLines[i]?.unitCostOverride ?? l.unitCost })));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not re-cost.'); }
    finally { setBusy(false); }
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l));
  }
  function addLine() { setLines(ls => [...ls, { refDes: '', type: 'resistor', package: '', mount: 'SMT', pins: 2, qty: 1, unitCost: 0, unitCostOverride: undefined }]); }
  function delLine(i: number) { setLines(ls => ls.filter((_, j) => j !== i)); }

  function exportXlsx() {
    if (!cost) return;
    const rows = lines.map(l => ({ RefDes: l.refDes, Type: l.type, Package: l.package, Mount: l.mount, Pins: l.pins, Qty: l.qty, 'Unit €': l.unitCostOverride ?? l.unitCost, 'Line €': +(((l.unitCostOverride ?? l.unitCost) * l.qty)).toFixed(3) }));
    rows.push({} as never);
    rows.push({ RefDes: 'Components', 'Line €': cost.componentCost } as never);
    rows.push({ RefDes: 'PCB fab', 'Line €': cost.fabCost } as never);
    rows.push({ RefDes: 'Assembly', 'Line €': cost.assemblyCost } as never);
    rows.push({ RefDes: 'Overhead', 'Line €': cost.overhead } as never);
    rows.push({ RefDes: `TOTAL /board @ ${cost.volume}/yr`, 'Line €': cost.total } as never);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'PCB BOM Cost');
    XLSX.writeFile(wb, 'BrainSpark_PCB_BOM_Cost.xlsx');
  }

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center flex-shrink-0"><CircuitBoard size={22} className="text-teal-400" /></div>
          <div>
            <h1 className="text-2xl font-bold text-white">PCB Image → BOM → Cost</h1>
            <p className="text-slate-400 text-sm max-w-2xl mt-1">Upload a photo of a circuit board. Claude Vision estimates a component BOM; a parametric model costs the board (components + PCB fab + SMT/TH assembly + overhead). Edit any line and re-cost.</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
          {/* Left: upload + BOM table */}
          <div className="space-y-4">
            {!cost && (
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
                onClick={() => fileRef.current?.click()}
                className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${dragOver ? 'border-teal-500/60 bg-teal-500/5' : 'border-white/15 hover:border-white/30'}`}>
                {preview ? <img src={preview} alt="PCB" className="max-h-64 mx-auto rounded-lg mb-3" /> : <Upload size={32} className="text-slate-500 mx-auto mb-3" />}
                <p className="text-white text-sm font-medium">{file ? file.name : 'Drop a PCB photo, or click to browse'}</p>
                <p className="text-slate-500 text-xs mt-1">Top-down, well-lit, in focus works best · PNG / JPG</p>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
              </div>
            )}

            {file && !cost && (
              <button onClick={extractAndCost} disabled={busy} className="w-full py-3 rounded-xl bg-teal-600/90 hover:bg-teal-500 disabled:opacity-40 text-white font-semibold flex items-center justify-center gap-2">
                {busy ? <><ButtonSpinner /> Reading the board…</> : <><Cpu size={16} /> Extract BOM & cost</>}
              </button>
            )}

            {error && <div className="flex items-start gap-2 text-sm text-danger-300 bg-danger-500/10 border border-danger-500/25 rounded-xl px-4 py-3"><AlertTriangle size={15} className="mt-0.5 flex-shrink-0" /> {error}</div>}

            {cost && (
              <div className="bg-navy-900 border border-white/10 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
                  <p className="text-white font-semibold text-sm flex items-center gap-2"><Calculator size={15} className="text-teal-400" /> Estimated BOM ({lines.length} lines)</p>
                  <div className="flex items-center gap-2">
                    <button onClick={addLine} className="text-xs px-2 py-1 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 flex items-center gap-1"><Plus size={12} /> Row</button>
                    <button onClick={() => recost()} disabled={busy} className="text-xs px-3 py-1 rounded-lg bg-teal-600/80 hover:bg-teal-500 text-white font-medium disabled:opacity-40">{busy ? 'Costing…' : 'Re-cost'}</button>
                  </div>
                </div>
                <div className="overflow-x-auto max-h-[560px]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-navy-900"><tr className="text-slate-500 text-left">
                      <th className="px-2 py-2 font-medium">Ref</th><th className="px-2 py-2 font-medium">Type</th><th className="px-2 py-2 font-medium">Pkg</th>
                      <th className="px-2 py-2 font-medium">Mnt</th><th className="px-2 py-2 font-medium">Pins</th><th className="px-2 py-2 font-medium">Qty</th>
                      <th className="px-2 py-2 font-medium text-right">Unit €</th><th className="px-2 py-2 font-medium text-right">Line €</th><th></th>
                    </tr></thead>
                    <tbody>
                      {lines.map((l, i) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="px-1 py-1"><input value={l.refDes} onChange={e => updateLine(i, { refDes: e.target.value })} className={`${inp} w-16`} /></td>
                          <td className="px-1 py-1">
                            <select value={l.type} onChange={e => updateLine(i, { type: e.target.value })} className={`${inp} w-32`}>
                              {Object.entries(types).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          </td>
                          <td className="px-1 py-1"><input value={l.package} onChange={e => updateLine(i, { package: e.target.value })} className={`${inp} w-16`} /></td>
                          <td className="px-1 py-1"><select value={l.mount} onChange={e => updateLine(i, { mount: e.target.value as 'SMT' | 'TH' })} className={`${inp} w-14`}><option>SMT</option><option>TH</option></select></td>
                          <td className="px-1 py-1"><input type="number" value={l.pins} onChange={e => updateLine(i, { pins: Number(e.target.value) })} className={`${inp} w-12`} /></td>
                          <td className="px-1 py-1"><input type="number" value={l.qty} onChange={e => updateLine(i, { qty: Number(e.target.value) })} className={`${inp} w-14`} /></td>
                          <td className="px-1 py-1"><input type="number" step="0.001" value={l.unitCostOverride ?? l.unitCost} onChange={e => updateLine(i, { unitCostOverride: Number(e.target.value) })} className={`${inp} w-16 text-right`} /></td>
                          <td className="px-2 py-1 text-right text-slate-300 font-mono">{(((l.unitCostOverride ?? l.unitCost) * l.qty)).toFixed(2)}</td>
                          <td className="px-1 py-1"><button onClick={() => delLine(i)} className="text-slate-600 hover:text-danger-400"><Trash2 size={13} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Right: board + cost summary */}
          <div className="space-y-4">
            <div className="bg-navy-900 border border-white/10 rounded-2xl p-4">
              <p className="text-white font-semibold text-sm mb-3">Board & volume</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-slate-400">Width (mm)<input type="number" value={board.widthMm} onChange={e => setBoard(b => ({ ...b, widthMm: Number(e.target.value) }))} className={`${inp} mt-1`} /></label>
                <label className="text-xs text-slate-400">Height (mm)<input type="number" value={board.heightMm} onChange={e => setBoard(b => ({ ...b, heightMm: Number(e.target.value) }))} className={`${inp} mt-1`} /></label>
                <label className="text-xs text-slate-400">Layers<select value={board.layers} onChange={e => setBoard(b => ({ ...b, layers: Number(e.target.value) }))} className={`${inp} mt-1`}>{LAYERS.map(n => <option key={n}>{n}</option>)}</select></label>
                <label className="text-xs text-slate-400">Finish<select value={board.finish} onChange={e => setBoard(b => ({ ...b, finish: e.target.value }))} className={`${inp} mt-1`}>{FINISHES.map(f => <option key={f} value={f}>{f.replace('_', ' ')}</option>)}</select></label>
                <label className="text-xs text-slate-400 col-span-2">Annual volume<input type="number" value={volume} onChange={e => setVolume(e.target.value)} className={`${inp} mt-1`} /></label>
              </div>
              {cost && <button onClick={() => recost()} disabled={busy} className="w-full mt-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm hover:bg-white/10 disabled:opacity-40">Apply & re-cost</button>}
            </div>

            {cost && (
              <div className="bg-teal-500/8 border border-teal-500/25 rounded-2xl p-4">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="text-slate-400 text-xs uppercase tracking-wider">Board cost / unit</span>
                  <span className="text-teal-300 font-black text-2xl">€{cost.total.toFixed(2)}</span>
                </div>
                <div className="space-y-1.5">
                  {Object.entries(cost.breakdown).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 text-xs">
                      <span className="text-slate-300 flex-1 capitalize">{k === 'fab' ? 'PCB fab' : k}</span>
                      <span className="text-slate-400 tabular-nums w-9 text-right">{v.pct}%</span>
                      <span className="text-slate-200 tabular-nums w-16 text-right font-mono">€{v.value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-white/10 text-[11px] text-slate-500 space-y-0.5">
                  <p>{cost.stats.totalPlacements} SMT placements · {cost.stats.thLeads} TH leads · {cost.board.areaCm2} cm² · {cost.board.layers}-layer {cost.board.finish}</p>
                  <p>@ {cost.volume.toLocaleString()} boards/yr</p>
                </div>
                <button onClick={exportXlsx} className="w-full mt-3 py-2 rounded-lg bg-teal-600/80 hover:bg-teal-500 text-white text-sm font-medium flex items-center justify-center gap-2"><Download size={14} /> Export .xlsx</button>
              </div>
            )}

            <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-navy-900/60 border border-white/8 rounded-xl px-3 py-2.5">
              <Info size={13} className="mt-0.5 flex-shrink-0" />
              <span>Indicative estimate. Vision infers component class, package and quantity — not exact part numbers — so unit prices are class averages at ~1k volume. Edit lines and re-cost for a firm figure.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
