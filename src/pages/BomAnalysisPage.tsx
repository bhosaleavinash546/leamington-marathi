import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, X, Zap, AlertCircle, CheckCircle, BarChart3, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseWorkbook, parseCsv } from '../services/safe-xlsx';
import ButtonSpinner from '../components/ui/ButtonSpinner';
import { AUTOMOTIVE_SYSTEMS, getSystemById, getSubassemblyById } from '../data/automotive-catalog';

interface BomRow {
  systemId: string;
  subassemblyId: string;
  partId?: string;
  partName: string;
  quantity?: number;
}

interface BomResult {
  partName: string;
  ideasCount: number;
  quickWins: number;
  topIdea?: string;
  topSaving?: string;
}

export default function BomAnalysisPage() {
  const [rows, setRows] = useState<BomRow[]>([]);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('brainspark_api_key') || '');
  const [vehicleType, setVehicleType] = useState('Automotive');
  const [results, setResults] = useState<BomResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [currentPart, setCurrentPart] = useState('');
  const [cancelled, setCancelled] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const onDrop = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    (async () => {
      try {
        // Parse uploads with exceljs/CSV (safe path) — xlsx is kept for WRITING only.
        let data: (string | number)[][];
        if (/\.csv$/i.test(file.name)) {
          data = parseCsv(await file.text());
        } else {
          const parsedWb = await parseWorkbook(await file.arrayBuffer());
          data = parsedWb.sheets[parsedWb.sheetNames[0]] || [];
        }
        const parsed: BomRow[] = [];
        // Try to auto-detect columns: systemId, subassemblyId, partName
        const header = data[0]?.map(c => String(c).toLowerCase().trim()) || [];
        const sysCol = header.findIndex(h => h.includes('system'));
        const subCol = header.findIndex(h => h.includes('sub') || h.includes('assembly'));
        const partCol = header.findIndex(h => h.includes('part') || h.includes('component'));
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (!row || row.length < 2) continue;
          const systemName = String(row[sysCol >= 0 ? sysCol : 0] || '').trim();
          const subName = String(row[subCol >= 0 ? subCol : 1] || '').trim();
          const partName = String(row[partCol >= 0 ? partCol : 2] || subName).trim();
          if (!systemName) continue;
          // Find matching system/subassembly
          const sys = AUTOMOTIVE_SYSTEMS.find(s => s.name.toLowerCase().includes(systemName.toLowerCase()) || systemName.toLowerCase().includes(s.name.toLowerCase().split(' ')[0]));
          const sub = sys?.subassemblies.find(s => s.name.toLowerCase().includes(subName.toLowerCase()) || subName.toLowerCase().includes(s.name.toLowerCase().split(' ')[0]));
          parsed.push({
            systemId: sys?.id || 'unknown',
            subassemblyId: sub?.id || 'unknown',
            partName: partName || subName || systemName,
          });
        }
        const MAX_BOM_ROWS = 100; // batch cap to bound API cost/time
        if (parsed.length > MAX_BOM_ROWS) {
          setRows(parsed.slice(0, MAX_BOM_ROWS));
          setError(`Loaded the first ${MAX_BOM_ROWS} of ${parsed.length} parts (batch cap). Split larger BOMs across runs.`);
        } else {
          setRows(parsed);
          setError('');
        }
      } catch { setError('Failed to parse file. Please use the template format.'); }
    })();
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'text/csv': ['.csv'] }, maxFiles: 1,
  });

  function cancelAnalysis() {
    abortRef.current?.abort();
    setCancelled(true);
  }

  function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['System Name', 'Subassembly Name', 'Part / Component Name', 'Quantity'],
      ['BIW Body-in-White', 'Front End Module', 'Front Bumper Beam', '1'],
      ['Chassis & Frame', 'Front Suspension', 'Front Knuckle / Upright', '2'],
      ['Powertrain BEV/MHEV', 'Battery Pack & BMS', 'Cell Module Housing', '4'],
    ]);
    ws['!cols'] = [{ wch: 30 }, { wch: 28 }, { wch: 32 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'BOM');
    XLSX.writeFile(wb, 'BrainSpark_BOM_Template.xlsx');
  }

  async function runBomAnalysis() {
    if (!rows.length || !apiKey.trim()) return;
    setRunning(true);
    setResults([]);
    setProgress(0);
    setError('');
    const token = (() => { try { return JSON.parse(localStorage.getItem('brainspark_auth') || '{}').token; } catch { return null; } })();
    const batchResults: BomResult[] = [];

    const controller = new AbortController();
    abortRef.current = controller;
    setCancelled(false);

    for (let i = 0; i < rows.length; i++) {
      if (controller.signal.aborted) break;
      const row = rows[i];
      setCurrentPart(row.partName);
      setProgress(Math.round(((i) / rows.length) * 100));
      try {
        const sys = getSystemById(row.systemId);
        const sub = getSubassemblyById(row.systemId, row.subassemblyId);
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            config: { systemId: row.systemId, subassemblyId: row.subassemblyId, vehicleType, apiKey },
            systemName: sys?.name || row.partName,
            subassemblyName: sub?.name || row.partName,
            partName: row.partName,
            enableSearch: false,
          }),
          signal: controller.signal,
        });
        if (!response.ok) continue;
        const text = await response.text();
        // parse SSE complete event
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'complete' && data.ideas) {
              const ideas = data.ideas as Array<{ title: string; implementationDifficulty: string; costSavingPotential: { annualValue?: string } }>;
              batchResults.push({
                partName: row.partName,
                ideasCount: ideas.length,
                quickWins: ideas.filter(i => i.implementationDifficulty === 'Low').length,
                topIdea: ideas[0]?.title,
                topSaving: ideas[0]?.costSavingPotential.annualValue,
              });
            }
          } catch {}
        }
      } catch (err) {
        if (controller.signal.aborted) break;
        batchResults.push({ partName: row.partName, ideasCount: 0, quickWins: 0 });
      }
    }
    setResults(batchResults);
    setProgress(100);
    setCurrentPart('');
    setRunning(false);
  }

  function exportBomResults() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Part / Component', 'Total Ideas', 'Quick Wins', 'Top Idea', 'Top Annual Saving'],
      ...results.map(r => [r.partName, r.ideasCount, r.quickWins, r.topIdea || '—', r.topSaving || '—']),
    ]);
    ws['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 14 }, { wch: 60 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, ws, 'BOM Analysis');
    XLSX.writeFile(wb, `BrainSpark_BOM_Analysis_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  return (
    <div className="min-h-screen bg-navy-950 pt-24 pb-16 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white mb-2">BOM Batch Analysis</h1>
          <p className="text-slate-400">Upload a Bill of Materials to analyse multiple parts in one run. Up to 100 parts per batch.</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          {/* Upload */}
          <div className="rounded-2xl bg-navy-900 border border-white/10 p-6 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Upload BOM</h2>
              <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-xs text-gold-400 hover:text-gold-300 transition-colors">
                <Download size={13} /> Template
              </button>
            </div>
            <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isDragActive ? 'border-gold-500/50 bg-gold-500/5' : 'border-white/15 hover:border-white/30'}`}>
              <input {...getInputProps()} />
              <Upload size={32} className="mx-auto mb-3 text-slate-500" />
              <p className="text-slate-300 text-sm font-medium">{isDragActive ? 'Drop file here' : 'Drag & drop or click to upload'}</p>
              <p className="text-slate-600 text-xs mt-1">Excel (.xlsx) or CSV — max 20 rows</p>
            </div>
            {error && <p className="text-red-400 text-sm mt-3 flex items-center gap-1.5"><AlertCircle size={14} />{error}</p>}
          </div>

          {/* Settings */}
          <div className="rounded-2xl bg-navy-900 border border-white/10 p-6 space-y-4 shadow-card">
            <h2 className="text-white font-semibold">Settings</h2>
            <div>
              <label className="text-slate-400 text-sm mb-1.5 block">Anthropic API Key</label>
              <input type="password" value={apiKey} onChange={e => { setApiKey(e.target.value); localStorage.setItem('brainspark_api_key', e.target.value); }}
                className="w-full bg-navy-800 border border-white/15 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500/40" placeholder="sk-ant-..." />
            </div>
            <div>
              <label className="text-slate-400 text-sm mb-1.5 block">Vehicle Type</label>
              <input value={vehicleType} onChange={e => setVehicleType(e.target.value)}
                className="w-full bg-navy-800 border border-white/15 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500/40" placeholder="e.g. SUV B-segment" />
            </div>
          </div>
        </div>

        {/* Parsed rows preview */}
        {rows.length > 0 && (
          <div className="mb-6 rounded-2xl bg-navy-900 border border-white/10 p-6 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">{rows.length} Parts Detected</h2>
              <button onClick={() => setRows([])} className="text-slate-500 hover:text-white transition-colors"><X size={16} /></button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-navy-800">
                  <span className="text-gold-400 text-xs font-bold w-5 text-right flex-shrink-0">{i + 1}</span>
                  <FileText size={13} className="text-slate-500 flex-shrink-0" />
                  <span className="text-slate-300 text-sm">{r.partName}</span>
                </div>
              ))}
            </div>
            <button
              onClick={runBomAnalysis}
              disabled={running || !apiKey.trim()}
              className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-navy-950 font-bold transition-all shadow-glow-gold"
            >
              {running ? <><ButtonSpinner size={18} /> Analysing {rows.length} parts…</> : <><Zap size={18} /> Run BOM Analysis</>}
            </button>
            {running && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>{currentPart}</span><span>{progress}%</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-gold-500 to-amber-400 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-2 flex justify-center">
                  <button
                    onClick={cancelAnalysis}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-sm font-medium transition-colors"
                  >
                    <X size={14} /> Cancel Analysis
                  </button>
                </div>
              </div>
            )}
            {cancelled && (
              <p className="text-amber-400 text-sm text-center mt-2">Analysis cancelled — {results.length} part{results.length !== 1 ? 's' : ''} completed.</p>
            )}
          </div>
        )}

        {/* Results */}
        <AnimatePresence>
          {results.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-navy-900 border border-white/10 p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <BarChart3 size={18} className="text-gold-400" />
                  <h2 className="text-white font-semibold">BOM Analysis Results</h2>
                </div>
                <button onClick={exportBomResults} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors">
                  <Download size={15} /> Export Excel
                </button>
              </div>
              <div className="space-y-3">
                {results.map((r, i) => (
                  <motion.div key={r.partName} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className="p-4 rounded-xl bg-navy-800 border border-white/5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium text-sm">{r.partName}</p>
                        {r.topIdea && <p className="text-slate-400 text-xs mt-0.5 truncate">Top idea: {r.topIdea}</p>}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-center">
                          <div className="text-gold-400 font-bold text-lg">{r.ideasCount}</div>
                          <div className="text-slate-600 text-xs">ideas</div>
                        </div>
                        <div className="text-center">
                          <div className="text-green-400 font-bold text-lg">{r.quickWins}</div>
                          <div className="text-slate-600 text-xs">QW</div>
                        </div>
                        {r.ideasCount > 0 && <CheckCircle size={16} className="text-green-400" />}
                      </div>
                    </div>
                    {r.topSaving && <p className="text-emerald-400 text-xs mt-1">Est. saving: {r.topSaving}/yr</p>}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
