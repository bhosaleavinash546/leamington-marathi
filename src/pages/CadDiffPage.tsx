import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion } from 'framer-motion';
import { GitCompare, Upload, X, Zap, ChevronRight } from 'lucide-react';
import ButtonSpinner from '../components/ui/ButtonSpinner';

interface DeltaIdea {
  title: string;
  delta: string;
  saving: string;
  difficulty: string;
  action: string;
}

export default function CadDiffPage() {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [descA, setDescA] = useState('');
  const [descB, setDescB] = useState('');
  const [loading, setLoading] = useState(false);
  const [ideas, setIdeas] = useState<DeltaIdea[]>([]);
  const [error, setError] = useState('');
  const [inputMode, setInputMode] = useState<'files' | 'text'>('files');

  const onDropA = useCallback((files: File[]) => setFileA(files[0] || null), []);
  const onDropB = useCallback((files: File[]) => setFileB(files[0] || null), []);

  const dropA = useDropzone({
    accept: { 'application/octet-stream': ['.step', '.stp', '.stl', '.dxf'] },
    maxFiles: 1,
    onDrop: onDropA,
  });

  const dropB = useDropzone({
    accept: { 'application/octet-stream': ['.step', '.stp', '.stl', '.dxf'] },
    maxFiles: 1,
    onDrop: onDropB,
  });

  async function handleCompare() {
    const apiKey = localStorage.getItem('brainspark_api_key') || '';
    if (!apiKey) { setError('No API key found — run an analysis on the Analyze page first.'); return; }

    const aDesc = inputMode === 'text' ? descA : (fileA ? `CAD file: ${fileA.name} (${(fileA.size / 1024).toFixed(0)} KB)` : '');
    const bDesc = inputMode === 'text' ? descB : (fileB ? `CAD file: ${fileB.name} (${(fileB.size / 1024).toFixed(0)} KB)` : '');

    if (!aDesc || !bDesc) { setError('Please provide both designs to compare.'); return; }

    setLoading(true);
    setError('');
    setIdeas([]);

    try {
      const r = await fetch('/api/cad-diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designA: aDesc, designB: bDesc, apiKey }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Comparison failed'); }
      const data = await r.json();
      setIdeas(data.ideas || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Comparison failed');
    } finally {
      setLoading(false);
    }
  }

  const canCompare = inputMode === 'files' ? (!!fileA && !!fileB) : (!!descA.trim() && !!descB.trim());

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-cyan-500/15 border border-cyan-500/25 mb-4">
            <GitCompare size={28} className="text-cyan-400" />
          </div>
          <h1 className="text-4xl font-black text-white mb-3">CAD Diff Analysis</h1>
          <p className="text-slate-400"><span className="text-slate-300">Describe each revision in text for best results</span> — the AI reasons over the differences you describe and generates targeted cost-reduction ideas. (File uploads compare metadata only, not geometry.)</p>
        </div>

        {/* Input mode toggle */}
        <div className="flex justify-center gap-2 mb-6">
          {(['files', 'text'] as const).map(mode => (
            <button key={mode} onClick={() => setInputMode(mode)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${inputMode === mode ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30' : 'text-slate-400 border border-white/10 hover:border-white/25'}`}>
              {mode === 'files' ? 'Upload CAD Files' : 'Describe Changes (Text)'}
            </button>
          ))}
        </div>

        {inputMode === 'files' ? (
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            {([
              { label: 'Design A — Current / Baseline', drop: dropA, file: fileA, setFile: setFileA, accent: 'blue' },
              { label: 'Design B — New / Proposed', drop: dropB, file: fileB, setFile: setFileB, accent: 'emerald' },
            ] as const).map(({ label, drop, file, setFile, accent }) => (
              <div key={label}>
                <p className="text-slate-300 text-sm font-medium mb-2">{label}</p>
                {file ? (
                  <div className={`flex items-center gap-3 p-4 rounded-2xl bg-${accent}-500/10 border border-${accent}-500/20`}>
                    <Zap size={16} className={`text-${accent}-400 flex-shrink-0`} />
                    <span className={`text-${accent}-300 text-sm flex-1 truncate`}>{file.name}</span>
                    <button onClick={() => setFile(null)}><X size={14} className="text-slate-500 hover:text-red-400" /></button>
                  </div>
                ) : (
                  <div {...drop.getRootProps()} className={`flex flex-col items-center justify-center gap-3 p-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${drop.isDragActive ? 'border-cyan-500/50 bg-cyan-500/5' : 'border-white/15 hover:border-white/30 hover:bg-white/3'}`}>
                    <input {...drop.getInputProps()} />
                    <Upload size={20} className="text-slate-500" />
                    <div className="text-center">
                      <p className="text-slate-400 text-sm">Drop STEP, STL or DXF</p>
                      <p className="text-slate-600 text-xs mt-1">or click to browse</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            {([
              { label: 'Design A — Describe Current Design', val: descA, set: setDescA },
              { label: 'Design B — Describe Proposed Changes', val: descB, set: setDescB },
            ] as const).map(({ label, val, set }) => (
              <div key={label}>
                <p className="text-slate-300 text-sm font-medium mb-2">{label}</p>
                <textarea value={val} onChange={e => set(e.target.value)} rows={8}
                  placeholder="e.g. Steel stamped bracket, 3 pieces welded, 4.2 kg, 6 M8 fasteners, tolerance ±0.5mm..."
                  className="w-full bg-navy-900 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-cyan-500/40 resize-none leading-relaxed" />
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}

        <button onClick={handleCompare} disabled={loading || !canCompare}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold transition-all hover:scale-[1.01]">
          {loading
            ? <><ButtonSpinner size={16} /> Analysing delta…</>
            : <><GitCompare size={18} /> Compare Designs &amp; Generate Ideas</>}
        </button>

        {ideas.length > 0 && (
          <div className="mt-8 space-y-4">
            <h2 className="text-white font-bold text-lg flex items-center gap-2">
              <ChevronRight size={18} className="text-cyan-400" /> {ideas.length} Delta-Driven Ideas
            </h2>
            {ideas.map((idea, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                className="bg-navy-900 border border-white/10 rounded-2xl p-5 hover:border-cyan-500/25 transition-all">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="text-white font-semibold">{idea.title}</h3>
                  <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                    idea.difficulty === 'Low' ? 'bg-green-500/10 text-green-400 border-green-500/30'
                    : idea.difficulty === 'Medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-red-500/10 text-red-400 border-red-500/30'
                  }`}>{idea.difficulty}</span>
                </div>
                <p className="text-cyan-400 text-xs mb-2 font-medium">Δ {idea.delta}</p>
                <p className="text-slate-400 text-sm leading-relaxed mb-3">{idea.action}</p>
                <div className="text-gold-400 text-sm font-semibold">{idea.saving}</div>
              </motion.div>
            ))}
          </div>
        )}

        {!loading && ideas.length === 0 && (
          <p className="text-center text-slate-600 text-xs mt-8">Enter both designs and click Compare — the AI reasons over your described differences and generates targeted cost-reduction ideas.</p>
        )}
      </div>
    </div>
  );
}
