import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lightbulb, Sparkles, ArrowRight, CheckCircle, XCircle, Wand2, Cpu, Layers } from 'lucide-react';
import ButtonSpinner from '../components/ui/ButtonSpinner';
import { useAuth } from '../contexts/AuthContext';
import BusinessCaseModal from '../components/BusinessCaseModal';
import { toast } from '../hooks/useToast';

// The TRIZ Studio: type a trade-off in plain English, get inventive principles
// and concrete, engine-checked cost-reduction ideas. Deliberately one input.

interface Principle { id: number; name: string; hint: string; auto: string; }
interface EngineCheck { direction: 'confirmed' | 'contradicted'; savingPct: number; baselineEur: number; proposedEur: number; referenceCase: string; }
interface TrizIdea {
  principleId: number; title: string; technicalDescription: string;
  costAngle: string; riskNotes?: string; triz: Principle | null; engineCheck?: EngineCheck | null;
}
interface TrizResult {
  contradiction: { improving: { id: number; name: string }; worsening: { id: number; name: string }; restatement: string; basis: string };
  principles: Principle[];
  ideas: TrizIdea[];
  engineChecks?: { checked: number; confirmed: number; contradicted: number } | null;
}

const EXAMPLES = [
  'Make the suspension knuckle lighter without losing stiffness',
  'Reduce part count in the door module without hurting serviceability',
  'Use a cheaper material for the bracket without a NVH penalty',
  'Cut cooling-plate cost without reducing heat rejection',
  'Speed up the moulding cycle without losing surface quality',
];

const SYSTEMS = ['', 'Body Structure', 'Chassis', 'Battery Pack', 'EDU / E-Motor', 'Interior', 'Seats', 'HVAC', 'Wiring Harness', 'Braking System', 'Exterior'];

export default function TrizStudioPage() {
  const { token } = useAuth();
  const [contradiction, setContradiction] = useState('');
  const [part, setPart] = useState('');
  const [system, setSystem] = useState('');
  const [material, setMaterial] = useState('');
  const [showContext, setShowContext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<TrizResult | null>(null);
  const [pipelineIdea, setPipelineIdea] = useState<TrizIdea | null>(null);

  async function resolve() {
    if (contradiction.trim().length < 8) { setError('Describe the trade-off you want to break.'); return; }
    if (!token) { setError('Please sign in.'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const apiKey = localStorage.getItem('brainspark_api_key') || undefined;
      const r = await fetch('/api/triz/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ contradiction, apiKey, context: { part, system, material, annualVolume: 80000, region: 'germany' } }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'TRIZ resolution failed.');
      setResult(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'TRIZ resolution failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gold-500/15 border border-gold-500/25 mb-4">
            <Wand2 size={28} className="text-gold-400" />
          </div>
          <h1 className="text-4xl font-black text-white mb-3">TRIZ Innovation Studio</h1>
          <p className="text-slate-400 max-w-2xl mx-auto">
            Cost reduction is a game of trade-offs. Describe the one you want to <span className="text-white">break</span> — TRIZ maps it to the inventive principles that resolve it, then generates concrete, <span className="text-gold-400">engine-checked</span> ideas.
          </p>
        </div>

        {/* Input */}
        <div className="bg-navy-900 border border-white/10 rounded-2xl p-6 mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">The contradiction to break</label>
          <textarea
            value={contradiction}
            onChange={e => setContradiction(e.target.value)}
            rows={2}
            placeholder="e.g. make the knuckle lighter without losing stiffness"
            className="w-full bg-navy-800 border border-white/15 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/50 resize-none"
          />
          <div className="flex flex-wrap gap-2 mt-3">
            {EXAMPLES.map(ex => (
              <button key={ex} onClick={() => setContradiction(ex)}
                className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-400 text-xs hover:border-gold-500/40 hover:text-gold-300 transition-colors">
                {ex.length > 46 ? ex.slice(0, 44) + '…' : ex}
              </button>
            ))}
          </div>

          <button onClick={() => setShowContext(s => !s)} className="text-slate-500 text-xs mt-4 hover:text-slate-300">
            {showContext ? '− Hide' : '+ Add'} part context (optional — sharpens the ideas)
          </button>
          {showContext && (
            <div className="grid sm:grid-cols-3 gap-3 mt-3">
              <input value={part} onChange={e => setPart(e.target.value)} placeholder="Part (e.g. front knuckle)"
                className="bg-navy-800 border border-white/15 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/40" />
              <select value={system} onChange={e => setSystem(e.target.value)} aria-label="System"
                className="bg-navy-800 border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/40">
                {SYSTEMS.map(s => <option key={s} value={s}>{s || 'System (optional)'}</option>)}
              </select>
              <input value={material} onChange={e => setMaterial(e.target.value)} placeholder="Current material (optional)"
                className="bg-navy-800 border border-white/15 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/40" />
            </div>
          )}

          {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

          <button onClick={resolve} disabled={loading}
            className="w-full mt-5 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-950 font-semibold transition-all">
            {loading ? <><ButtonSpinner size={16} /> Resolving contradiction…</> : <><Sparkles size={18} /> Generate Innovative Ideas</>}
          </button>
        </div>

        {/* Results */}
        {result && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* The contradiction, mapped */}
            <div className="bg-navy-900 border border-white/10 rounded-2xl p-5">
              <p className="text-slate-500 text-xs uppercase tracking-wider mb-2">Contradiction (mapped to TRIZ parameters)</p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300">▲ Improve: {result.contradiction.improving.name}</span>
                <ArrowRight size={16} className="text-slate-600" />
                <span className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300">▼ Without worsening: {result.contradiction.worsening.name}</span>
              </div>
              <p className="text-slate-400 text-sm mt-3 italic">{result.contradiction.restatement}</p>
              <p className="text-slate-600 text-xs mt-1">Principles selected by {result.contradiction.basis}.</p>
            </div>

            {/* Recommended principles */}
            <div>
              <h2 className="text-white font-bold text-lg flex items-center gap-2 mb-3"><Lightbulb size={18} className="text-gold-400" /> Inventive Principles</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {result.principles.map(p => (
                  <div key={p.id} className="bg-navy-900 border border-white/10 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-6 h-6 rounded-md bg-gold-500/15 border border-gold-500/25 text-gold-400 text-xs font-bold flex items-center justify-center">{p.id}</span>
                      <span className="text-white font-semibold text-sm">{p.name}</span>
                    </div>
                    <p className="text-slate-400 text-xs leading-relaxed">{p.hint}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Costed ideas */}
            <div>
              <h2 className="text-white font-bold text-lg flex items-center gap-2 mb-1"><Cpu size={18} className="text-gold-400" /> Generated Ideas</h2>
              {result.engineChecks && result.engineChecks.checked > 0 && (
                <p className="text-slate-500 text-xs mb-3">{result.engineChecks.checked} engine-checked · {result.engineChecks.confirmed} confirmed · {result.engineChecks.contradicted} contradicted</p>
              )}
              <div className="space-y-3 mt-3">
                {result.ideas.map((idea, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.05 }}
                    className="bg-navy-900 border border-white/10 rounded-2xl p-5 hover:border-gold-500/25 transition-all">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        {idea.triz && <span className="px-2 py-0.5 rounded-md bg-gold-500/10 border border-gold-500/20 text-gold-400 text-[11px] font-semibold">P{idea.triz.id} · {idea.triz.name}</span>}
                      </div>
                      {idea.engineCheck && (
                        <span className={`flex items-center gap-1 text-xs font-medium ${idea.engineCheck.direction === 'confirmed' ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {idea.engineCheck.direction === 'confirmed' ? <CheckCircle size={13} /> : <XCircle size={13} />}
                          Engine {idea.engineCheck.direction} ({idea.engineCheck.savingPct > 0 ? '−' : '+'}{Math.abs(idea.engineCheck.savingPct)}%)
                        </span>
                      )}
                    </div>
                    <h3 className="text-white font-semibold mb-2">{idea.title}</h3>
                    <p className="text-slate-400 text-sm leading-relaxed mb-2">{idea.technicalDescription}</p>
                    <p className="text-teal-300 text-xs mb-1"><span className="text-slate-500">Cost angle:</span> {idea.costAngle}</p>
                    {idea.riskNotes && <p className="text-amber-300/80 text-xs mb-3"><span className="text-slate-500">Risk:</span> {idea.riskNotes}</p>}
                    <div className="flex justify-end">
                      <button
                        onClick={() => setPipelineIdea(idea)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors text-xs"
                      >
                        <Layers size={11} /> Add to Pipeline
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
            <p className="text-slate-600 text-xs text-center">Principles are deterministic TRIZ theory; every £ figure is engine-checked or labelled. Validate against detailed studies before commercial use.</p>
          </motion.div>
        )}

        {pipelineIdea && (
          <BusinessCaseModal
            ideaTitle={pipelineIdea.title}
            ideaSource="triz"
            systemName={system || (pipelineIdea.triz ? `TRIZ · P${pipelineIdea.triz.id} ${pipelineIdea.triz.name}` : 'TRIZ')}
            onClose={() => setPipelineIdea(null)}
            onSaved={() => { setPipelineIdea(null); toast('Added to Pipeline', 'success'); }}
          />
        )}

        {!result && !loading && (
          <p className="text-center text-slate-600 text-xs mt-8">40 classical inventive principles · 39 engineering parameters · deterministic contradiction matrix · engine-checked outputs</p>
        )}
      </div>
    </div>
  );
}
