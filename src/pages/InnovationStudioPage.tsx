import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, CheckCircle, XCircle, Layers, Cpu, Wand2, ArrowRight } from 'lucide-react';
import ButtonSpinner from '../components/ui/ButtonSpinner';
import { useAuth } from '../contexts/AuthContext';
import BusinessCaseModal from '../components/BusinessCaseModal';
import { toast } from '../hooks/useToast';

// Innovation Studio — one home for the structured idea-generation methods.
// Pick a method, describe the part in plain English, Generate. Deterministic
// methods (DFA, Value Engineering, Design-to-Cost) also accept structured input
// and show a real analysis before the ideas.

interface Method { id: string; name: string; tier: number; blurb: string; input: string; }
interface EngineCheck { direction: 'confirmed' | 'contradicted'; savingPct: number; }
interface Idea { lens: string; title: string; technicalDescription: string; costAngle: string; riskNotes?: string; engineCheck?: EngineCheck | null; }
interface Result { method: { id: string; name: string }; analysis: unknown; ideas: Idea[]; engineChecks?: { checked: number; confirmed: number; contradicted: number } | null; }

const METHODS: Method[] = [
  { id: 'triz', name: 'TRIZ', tier: 1, blurb: 'Break an engineering trade-off with 40 inventive principles.', input: 'contradiction' },
  { id: 'value-engineering', name: 'Value Engineering', tier: 1, blurb: 'Find functions where you pay a lot for little value.', input: 'part' },
  { id: 'dfa', name: 'DFA / Part Consolidation', tier: 1, blurb: 'Find deletable parts — theoretical minimum count.', input: 'parts' },
  { id: 'design-to-cost', name: 'Design-to-Cost', tier: 1, blurb: 'Work back from a price target; close the cost gap.', input: 'target' },
  { id: 'scamper', name: 'SCAMPER', tier: 2, blurb: 'Fast 7-verb creativity checklist — broad first pass.', input: 'part' },
  { id: 'morphological', name: 'Morphological', tier: 2, blurb: 'Explore different concepts by mixing sub-function options.', input: 'part' },
  { id: 'effects-trends', name: 'Effects & Trends', tier: 3, blurb: 'Deliver a function with a physical effect; jump a generation.', input: 'part' },
  { id: 'circularity', name: 'Design for Circularity', tier: 3, blurb: 'Cut cost and meet end-of-life rules (EU ELV).', input: 'part' },
];
const TIER_LABEL: Record<number, string> = { 1: 'Rigorous', 2: 'Fast lens', 3: 'Advanced' };

export default function InnovationStudioPage() {
  const { token } = useAuth();
  const [methodId, setMethodId] = useState('value-engineering');
  const [part, setPart] = useState('');
  const [system, setSystem] = useState('');
  const [material, setMaterial] = useState('');
  // structured (optional) inputs for deterministic methods
  const [partsText, setPartsText] = useState('');       // DFA: one part per line
  const [currentCost, setCurrentCost] = useState('');    // design-to-cost
  const [targetCost, setTargetCost] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [pipelineIdea, setPipelineIdea] = useState<Idea | null>(null);

  const method = METHODS.find(m => m.id === methodId)!;

  async function generate() {
    if (!token) { setError('Please sign in.'); return; }
    if (methodId === 'triz') {
      // TRIZ has its own contradiction-shaped flow — send users there.
      window.location.href = '/triz';
      return;
    }
    if (!part.trim()) { setError('Name the part or assembly to analyse.'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const apiKey = localStorage.getItem('brainspark_api_key') || undefined;
      const body: Record<string, unknown> = {
        method: methodId, apiKey,
        context: { part, system, material, annualVolume: 80000, region: 'germany' },
      };
      // attach optional structured input so the method can show a real analysis
      if (methodId === 'dfa' && partsText.trim()) {
        body.parts = partsText.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
          // "name | moves | material | separate"  (y flags) — or just a name
          const [name, ...flags] = line.split('|').map(s => s.trim());
          const f = flags.join(' ').toLowerCase();
          return { name, moves: /move|rotat|slide/.test(f), differentMaterial: /material|insulat|conduct/.test(f), mustSeparate: /separat|service|assembl/.test(f) };
        });
      }
      if (methodId === 'design-to-cost' && currentCost && targetCost) {
        body.currentCost = Number(currentCost);
        body.targetCost = Number(targetCost);
      }
      const r = await fetch('/api/innovate/resolve', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Idea generation failed.');
      setResult(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Idea generation failed.');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gold-500/15 border border-gold-500/25 mb-4">
            <Wand2 size={28} className="text-gold-400" />
          </div>
          <h1 className="text-4xl font-black text-white mb-3">Innovation Studio</h1>
          <p className="text-slate-400 max-w-2xl mx-auto">Eight structured methods for generating cost-reduction ideas. Each gives the AI a proven thinking framework — and every idea comes back <span className="text-gold-400">engine-checked</span>.</p>
        </div>

        {/* Method picker */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {METHODS.map(m => (
            <button key={m.id} onClick={() => { setMethodId(m.id); setResult(null); }}
              className={`text-left p-4 rounded-xl border transition-all ${methodId === m.id ? 'border-gold-500/50 bg-gold-500/10' : 'border-white/10 bg-navy-900 hover:border-white/25'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`font-semibold text-sm ${methodId === m.id ? 'text-gold-300' : 'text-white'}`}>{m.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-white/10 text-slate-500">{TIER_LABEL[m.tier]}</span>
              </div>
              <p className="text-slate-400 text-xs leading-snug">{m.blurb}</p>
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="bg-navy-900 border border-white/10 rounded-2xl p-6 mb-6">
          {methodId === 'triz' ? (
            <div className="text-center py-4">
              <p className="text-slate-300 text-sm mb-3">TRIZ works from a <span className="text-white">contradiction</span> ("lighter without losing stiffness"), so it has its own studio.</p>
              <a href="/triz" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-semibold text-sm transition-all">Open TRIZ Studio <ArrowRight size={16} /></a>
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-3 gap-3">
                <input value={part} onChange={e => setPart(e.target.value)} placeholder="Part / assembly (e.g. front knuckle)"
                  className="bg-navy-800 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/50" />
                <input value={system} onChange={e => setSystem(e.target.value)} placeholder="System (optional)"
                  className="bg-navy-800 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/40" />
                <input value={material} onChange={e => setMaterial(e.target.value)} placeholder="Current material (optional)"
                  className="bg-navy-800 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/40" />
              </div>

              {methodId === 'dfa' && (
                <div className="mt-3">
                  <label className="block text-xs text-slate-400 mb-1">Parts list (optional — one per line; add "| moves | material | service" flags for exact scoring)</label>
                  <textarea value={partsText} onChange={e => setPartsText(e.target.value)} rows={3}
                    placeholder={'e.g.\nhousing | service\ngear | moves\nspacer'}
                    className="w-full bg-navy-800 border border-white/15 rounded-lg px-3 py-2 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-gold-500/40 resize-none font-mono" />
                </div>
              )}
              {methodId === 'design-to-cost' && (
                <div className="grid sm:grid-cols-2 gap-3 mt-3">
                  <input value={currentCost} onChange={e => setCurrentCost(e.target.value)} type="number" placeholder="Current unit cost (£)"
                    className="bg-navy-800 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/40" />
                  <input value={targetCost} onChange={e => setTargetCost(e.target.value)} type="number" placeholder="Target unit cost (£)"
                    className="bg-navy-800 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/40" />
                </div>
              )}

              {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
              <button onClick={generate} disabled={loading}
                className="w-full mt-5 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-950 font-semibold transition-all">
                {loading ? <><ButtonSpinner size={16} /> Generating with {method.name}…</> : <><Sparkles size={18} /> Generate Ideas · {method.name}</>}
              </button>
            </>
          )}
        </div>

        {/* Results */}
        {result && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            {/* Deterministic analysis panel (method-specific, best-effort) */}
            {result.analysis != null && <AnalysisPanel methodId={result.method.id} analysis={result.analysis} />}

            <div>
              <h2 className="text-white font-bold text-lg flex items-center gap-2 mb-1"><Cpu size={18} className="text-gold-400" /> Generated Ideas · {result.method.name}</h2>
              {result.engineChecks && result.engineChecks.checked > 0 && (
                <p className="text-slate-500 text-xs mb-3">{result.engineChecks.checked} engine-checked · {result.engineChecks.confirmed} confirmed · {result.engineChecks.contradicted} contradicted</p>
              )}
              <div className="space-y-3 mt-3">
                {result.ideas.map((idea, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.05 }}
                    className="bg-navy-900 border border-white/10 rounded-2xl p-5 hover:border-gold-500/25 transition-all">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      {idea.lens && <span className="px-2 py-0.5 rounded-md bg-gold-500/10 border border-gold-500/20 text-gold-400 text-[11px] font-semibold">{idea.lens}</span>}
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
                      <button onClick={() => setPipelineIdea(idea)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors text-xs">
                        <Layers size={11} /> Add to Pipeline
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
            <p className="text-slate-600 text-xs text-center">Method structure is deterministic; every £ figure is engine-checked or labelled. Validate before commercial use.</p>
          </motion.div>
        )}

        {pipelineIdea && (
          <BusinessCaseModal
            ideaTitle={pipelineIdea.title}
            ideaSource={`innovation:${result?.method.id || methodId}`}
            systemName={system || (result ? result.method.name : method.name)}
            onClose={() => setPipelineIdea(null)}
            onSaved={() => { setPipelineIdea(null); toast('Added to Pipeline', 'success'); }}
          />
        )}
      </div>
    </div>
  );
}

// ── Deterministic-analysis renderers (best-effort, method-specific) ──────────
function AnalysisPanel({ methodId, analysis }: { methodId: string; analysis: unknown }) {
  const a = analysis as Record<string, unknown>;
  if (methodId === 'dfa' && typeof a.totalParts === 'number') {
    return (
      <div className="bg-navy-900 border border-white/10 rounded-2xl p-5">
        <p className="text-slate-500 text-xs uppercase tracking-wider mb-2">DFA analysis (Boothroyd-Dewhurst)</p>
        <div className="flex flex-wrap gap-2 text-sm">
          <Stat label="Parts" value={String(a.totalParts)} />
          <Stat label="Theoretical min" value={String(a.theoreticalMin)} gold />
          <Stat label="Design efficiency" value={`${a.designEfficiencyPct}%`} />
        </div>
        {Array.isArray(a.consolidationCandidates) && a.consolidationCandidates.length > 0 && (
          <p className="text-slate-400 text-xs mt-3">Deletable candidates: <span className="text-amber-300">{(a.consolidationCandidates as string[]).join(', ')}</span></p>
        )}
      </div>
    );
  }
  if (methodId === 'value-engineering' && Array.isArray(a.rows)) {
    return (
      <div className="bg-navy-900 border border-white/10 rounded-2xl p-5">
        <p className="text-slate-500 text-xs uppercase tracking-wider mb-3">Function value analysis</p>
        <div className="space-y-1.5">
          {(a.rows as { name: string; costPct: number; worthPct: number; valueIndex: number; verdict: string }[]).map((r, i) => (
            <div key={i} className="flex items-center justify-between text-xs gap-3">
              <span className="text-slate-300 flex-1 truncate">{r.name}</span>
              <span className="text-slate-500 font-mono">cost {r.costPct}% · worth {r.worthPct}%</span>
              <span className={`font-mono font-semibold ${r.valueIndex < 0.7 ? 'text-red-400' : r.valueIndex > 1.4 ? 'text-blue-400' : 'text-emerald-400'}`}>VI {r.valueIndex}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (methodId === 'design-to-cost' && typeof a.gap === 'number') {
    return (
      <div className="bg-navy-900 border border-white/10 rounded-2xl p-5">
        <p className="text-slate-500 text-xs uppercase tracking-wider mb-2">Cost-gap analysis</p>
        <div className="flex flex-wrap gap-2 text-sm">
          <Stat label="Current" value={`£${a.currentCost}`} />
          <Stat label="Target" value={`£${a.targetCost}`} />
          <Stat label="Gap to close" value={`£${a.gap} (${a.gapPct}%)`} gold />
        </div>
        {Array.isArray(a.allocations) && a.allocations.length > 0 && (
          <p className="text-slate-400 text-xs mt-3">Per-bucket targets: {(a.allocations as { name: string; target: number }[]).map(x => `${x.name} £${x.target}`).join(' · ')}</p>
        )}
      </div>
    );
  }
  if (methodId === 'morphological' && typeof a.totalCombinations === 'number') {
    return (
      <div className="bg-navy-900 border border-white/10 rounded-2xl p-5">
        <p className="text-slate-500 text-xs uppercase tracking-wider mb-2">Concept space</p>
        <p className="text-slate-300 text-sm">{a.totalCombinations} possible combinations across {(a.dimensions as { name: string }[]).map(d => d.name).join(' × ')}.</p>
      </div>
    );
  }
  return null;
}
function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <span className={`px-3 py-1.5 rounded-lg border ${gold ? 'bg-gold-500/10 border-gold-500/25 text-gold-300' : 'bg-white/5 border-white/10 text-slate-300'}`}>
      <span className="text-slate-500 mr-1.5">{label}</span>{value}
    </span>
  );
}
