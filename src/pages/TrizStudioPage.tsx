import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lightbulb, Sparkles, ArrowRight, CheckCircle, XCircle, Wand2, Cpu, Layers, FileDown, Table2, Scissors, SplitSquareHorizontal, Gauge
} from 'lucide-react';
import ButtonSpinner from '../components/ui/ButtonSpinner';
import { useAuth } from '../contexts/AuthContext';
import BusinessCaseModal from '../components/BusinessCaseModal';
import { toast } from '../hooks/useToast';
import PageHeader from '../components/ui/PageHeader';

// The TRIZ Studio: type a trade-off in plain English, get inventive principles
// and concrete, engine-checked cost-reduction ideas. Deliberately one input.

interface Principle { id: number; name: string; hint: string; auto: string; }
interface EngineCheck { direction: 'confirmed' | 'contradicted'; savingPct: number; baselineEur: number; proposedEur: number; referenceCase: string; }
interface TrizIdea {
  /** Why engineCheck is null — the pipeline always states it. */
  engineCheckReason?: string;
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

// ── THE THREE ROUTES INTO TRIZ ──────────────────────────────────────────────
//
// They are not three flavours of the same thing; they are different tools with
// different reliability, and the tab text says so.
//
// `contradiction` is the classical technical-contradiction route. It depends on
// mapping free text onto Altshuller's 39 generic parameters, and that step is
// the documented soft spot of the method — published work puts the share of
// real problems that fit those parameters at roughly 10-15%, and two engineers
// mapping the same problem often pick different parameters.
//
// `separation` and `trim` do not use that mapping at all, which is exactly why
// they were added: more inventive yield without inheriting the weak step.
type Mode = 'contradiction' | 'separation' | 'trim';

const MODES: { id: Mode; label: string; blurb: string }[] = [
  { id: 'contradiction', label: 'Break a trade-off', blurb: 'Two properties fight each other — improving one worsens the other.' },
  { id: 'separation', label: 'One property, two values', blurb: 'A single property must be high AND low at once. Resolved by separation — no parameter mapping involved.' },
  { id: 'trim', label: 'Delete a part', blurb: 'List what each component does, and TRIZ trimming says which could go and who picks up the job.' },
];

interface TrimFn { carrier: string; fn: string; object: string; rank: string; cost: string }

const BLANK_FN: TrimFn = { carrier: '', fn: '', object: '', rank: 'useful', cost: '' };

export default function TrizStudioPage() {
  const { token } = useAuth();
  const [mode, setMode] = useState<Mode>('contradiction');
  // Physical-contradiction inputs
  const [property, setProperty] = useState('');
  const [mustBeHigh, setMustBeHigh] = useState('');
  const [mustBeLow, setMustBeLow] = useState('');
  const [sepResult, setSepResult] = useState<any>(null);
  // Trimming inputs — a small function model, entered as rows
  const [trimRows, setTrimRows] = useState<TrimFn[]>([{ ...BLANK_FN }, { ...BLANK_FN }]);
  const [trimResult, setTrimResult] = useState<any>(null);
  const [contradiction, setContradiction] = useState('');
  const [part, setPart] = useState('');
  const [system, setSystem] = useState('');
  const [material, setMaterial] = useState('');
  const [showContext, setShowContext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<TrizResult | null>(null);
  const [pipelineIdea, setPipelineIdea] = useState<TrizIdea | null>(null);
  const [exporting, setExporting] = useState<'' | 'pdf' | 'xlsx'>('');

  // Same report generator as the Innovation Studio — TRIZ is one of its methods,
  // it just has its own page. The contradiction and the principles applied
  // become the "method analysis" block; a principle becomes the idea's lens.
  async function exportReport(kind: 'pdf' | 'xlsx') {
    if (!result) return;
    setExporting(kind);
    try {
      const mod = await import('../services/innovation-report');
      const payload = {
        method: { id: 'triz', name: 'TRIZ — contradiction resolution' },
        analysis: {
          improving: result.contradiction.improving.name,
          worsening: result.contradiction.worsening.name,
          restatement: result.contradiction.restatement,
          selectionBasis: result.contradiction.basis,
          principlesApplied: result.principles.map(p => ({ id: p.id, principle: p.name, hint: p.hint })),
        },
        ideas: result.ideas.map(i => ({
          lens: i.triz ? `P${i.triz.id} · ${i.triz.name}` : `Principle ${i.principleId}`,
          title: i.title,
          technicalDescription: i.technicalDescription,
          costAngle: i.costAngle,
          riskNotes: i.riskNotes,
          engineCheck: i.engineCheck,
        })),
        engineChecks: result.engineChecks,
        subject: { part, system, material },
      };
      if (kind === 'pdf') mod.exportInnovationPdf(payload);
      else await mod.exportInnovationXlsx(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting('');
    }
  }

  /** Shared POST + error handling for the three routes. */
  async function post(path: string, body: Record<string, unknown>) {
    const apiKey = localStorage.getItem('brainspark_api_key') || undefined;
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...body, apiKey, context: { part, system, material, annualVolume: 80000, region: 'germany' } }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Request failed.');
    return d;
  }

  async function separate() {
    if (property.trim().length < 2) { setError('Name the property that has to be both high and low.'); return; }
    if (!token) { setError('Please sign in.'); return; }
    setLoading(true); setError(''); setSepResult(null);
    try {
      setSepResult(await post('/api/triz/separate', { property, mustBeHigh, mustBeLow }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Separation failed.');
    } finally { setLoading(false); }
  }

  async function trim() {
    // Only complete rows count. A half-filled row is a typo, not a function,
    // and sending it would earn a validation error from the core anyway.
    const functions = trimRows
      .filter(r => r.carrier.trim() && r.fn.trim() && r.object.trim())
      .map(r => ({ carrier: r.carrier.trim(), function: r.fn.trim(), object: r.object.trim(), rank: r.rank }));
    if (functions.length === 0) { setError('Add at least one complete row: what a component does, and what it does it to.'); return; }
    if (!token) { setError('Please sign in.'); return; }
    // Costs are optional throughout — the core reports "no cost" rather than
    // guessing, and the UI must not quietly send zeros in their place.
    const costs = trimRows
      .filter(r => r.carrier.trim() && r.cost.trim() !== '' && Number.isFinite(Number(r.cost)))
      .map(r => ({ name: r.carrier.trim(), cost: Number(r.cost) }));
    setLoading(true); setError(''); setTrimResult(null);
    try {
      setTrimResult(await post('/api/triz/trim', { functions, costs: costs.length ? costs : undefined }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Trimming failed.');
    } finally { setLoading(false); }
  }

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
        <PageHeader
          tool="triz"
          title="TRIZ Innovation Studio"
          subtitle={<>Cost reduction is a game of trade-offs. Describe the one you want to <span className="text-white">break</span> — TRIZ maps it to the inventive principles that resolve it, then generates concrete, <span className="text-gold-400">engine-checked</span> ideas.</>}
        />

        {/* Which tool. Three genuinely different instruments, not three
            wordings of one — so the blurb under the tabs changes with it. */}
        <div className="flex flex-wrap gap-2 mb-3" role="tablist" aria-label="TRIZ tool">
          {MODES.map(m => (
            <button key={m.id} role="tab" aria-selected={mode === m.id}
              onClick={() => { setMode(m.id); setError(''); }}
              className={`px-3.5 py-2 rounded-xl border text-sm transition-colors ${
                mode === m.id
                  ? 'border-gold-500/50 bg-gold-500/15 text-gold-300'
                  : 'border-white/10 bg-navy-900 text-slate-400 hover:text-slate-200'}`}>
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-slate-500 text-xs mb-4">{MODES.find(m => m.id === mode)!.blurb}</p>

        {/* ── One property, two values (physical contradiction) ───────────── */}
        {mode === 'separation' && (
          <div className="bg-navy-900 border border-white/10 rounded-2xl p-6 mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">The property that must be both</label>
            <input value={property} onChange={e => setProperty(e.target.value)}
              placeholder="e.g. wall thickness"
              className="w-full bg-navy-800 border border-white/15 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/50" />
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              <input value={mustBeHigh} onChange={e => setMustBeHigh(e.target.value)}
                placeholder="…must be HIGH because (e.g. carries the bolt load)"
                className="bg-navy-800 border border-white/15 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/40" />
              <input value={mustBeLow} onChange={e => setMustBeLow(e.target.value)}
                placeholder="…must be LOW because (e.g. mass and material cost)"
                className="bg-navy-800 border border-white/15 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/40" />
            </div>
            {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
            <button onClick={separate} disabled={loading}
              className="w-full mt-5 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-950 font-semibold transition-ui">
              {loading ? <><ButtonSpinner size={16} /> Separating…</> : <><Sparkles size={18} /> Resolve by Separation</>}
            </button>
          </div>
        )}

        {/* ── Delete a part (trimming) ────────────────────────────────────── */}
        {mode === 'trim' && (
          <div className="bg-navy-900 border border-white/10 rounded-2xl p-6 mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-1">What each component does</label>
            <p className="text-slate-500 text-xs mb-3">
              One row per job: the component, the verb, and what it acts on. Cost is optional —
              leave it blank and the ranking simply says it does not know rather than guessing.
            </p>
            <div className="space-y-2">
              {trimRows.map((row, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <input value={row.carrier} onChange={e => setTrimRows(rs => rs.map((r, j) => j === i ? { ...r, carrier: e.target.value } : r))}
                    placeholder="component" aria-label={`Component ${i + 1}`}
                    className="col-span-3 bg-navy-800 border border-white/15 rounded-lg px-2.5 py-2 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-gold-500/40" />
                  <input value={row.fn} onChange={e => setTrimRows(rs => rs.map((r, j) => j === i ? { ...r, fn: e.target.value } : r))}
                    placeholder="does what (verb)" aria-label={`Function ${i + 1}`}
                    className="col-span-3 bg-navy-800 border border-white/15 rounded-lg px-2.5 py-2 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-gold-500/40" />
                  <input value={row.object} onChange={e => setTrimRows(rs => rs.map((r, j) => j === i ? { ...r, object: e.target.value } : r))}
                    placeholder="to what" aria-label={`Object ${i + 1}`}
                    className="col-span-3 bg-navy-800 border border-white/15 rounded-lg px-2.5 py-2 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-gold-500/40" />
                  <select value={row.rank} onChange={e => setTrimRows(rs => rs.map((r, j) => j === i ? { ...r, rank: e.target.value } : r))}
                    aria-label={`Rank ${i + 1}`}
                    className="col-span-2 bg-navy-800 border border-white/15 rounded-lg px-1.5 py-2 text-white text-xs focus:outline-none focus:border-gold-500/40">
                    <option value="useful">useful</option>
                    <option value="harmful">harmful</option>
                    <option value="excessive">excessive</option>
                    <option value="insufficient">insufficient</option>
                  </select>
                  <input value={row.cost} onChange={e => setTrimRows(rs => rs.map((r, j) => j === i ? { ...r, cost: e.target.value } : r))}
                    placeholder="£" inputMode="decimal" aria-label={`Cost ${i + 1}`}
                    className="col-span-1 bg-navy-800 border border-white/15 rounded-lg px-1.5 py-2 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-gold-500/40" />
                </div>
              ))}
            </div>
            <button onClick={() => setTrimRows(rs => [...rs, { ...BLANK_FN }])}
              className="text-slate-500 text-xs mt-3 hover:text-slate-300">+ Add a row</button>
            {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
            <button onClick={trim} disabled={loading}
              className="w-full mt-5 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-950 font-semibold transition-ui">
              {loading ? <><ButtonSpinner size={16} /> Trimming…</> : <><Scissors size={18} /> Find What Can Go</>}
            </button>
          </div>
        )}

        {/* Input */}
        {mode === 'contradiction' && (
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
            className="w-full mt-5 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-950 font-semibold transition-ui">
            {loading ? <><ButtonSpinner size={16} /> Resolving contradiction…</> : <><Sparkles size={18} /> Generate Innovative Ideas</>}
          </button>
        </div>
        )}

        {/* Results */}
        {mode === 'contradiction' && result && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* The contradiction, mapped */}
            <div className="bg-navy-900 border border-white/10 rounded-2xl p-5">
              <p className="text-slate-500 text-xs uppercase tracking-wider mb-2">Contradiction (mapped to TRIZ parameters)</p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300">▲ Improve: {result.contradiction.improving.name}</span>
                <ArrowRight size={16} className="text-slate-500" />
                <span className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300">▼ Without worsening: {result.contradiction.worsening.name}</span>
              </div>
              <p className="text-slate-400 text-sm mt-3 italic">{result.contradiction.restatement}</p>
              <p className="text-slate-500 text-xs mt-1">Principles selected by {result.contradiction.basis}.</p>
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
              <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
                <h2 className="text-white font-bold text-lg flex items-center gap-2"><Cpu size={18} className="text-gold-400" /> Generated Ideas</h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => exportReport('pdf')} disabled={exporting !== ''}
                    title="Branded PDF report: the contradiction, the principles applied, every idea in full, and each engine-check verdict."
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gold-500/30 bg-gold-500/10 text-gold-300 hover:bg-gold-500/20 text-xs transition-colors disabled:opacity-50">
                    {exporting === 'pdf' ? <ButtonSpinner size={12} /> : <FileDown size={13} />} Export PDF
                  </button>
                  <button onClick={() => exportReport('xlsx')} disabled={exporting !== ''}
                    title="Formatted Excel workbook: summary, filterable idea table, and the principles applied."
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-xs transition-colors disabled:opacity-50">
                    {exporting === 'xlsx' ? <ButtonSpinner size={12} /> : <Table2 size={13} />} Export Excel
                  </button>
                </div>
              </div>
              {result.engineChecks && result.engineChecks.checked > 0 && (
                <p className="text-slate-500 text-xs mb-3">{result.engineChecks.checked} engine-checked · {result.engineChecks.confirmed} confirmed · {result.engineChecks.contradicted} contradicted</p>
              )}
              <div className="space-y-3 mt-3">
                {result.ideas.map((idea, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.05 }}
                    className="bg-navy-900 border border-white/10 rounded-2xl p-5 hover:border-gold-500/25 transition-ui">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        {idea.triz && <span className="px-2 py-0.5 rounded-md bg-gold-500/10 border border-gold-500/20 text-gold-400 text-2xs font-semibold">P{idea.triz.id} · {idea.triz.name}</span>}
                      </div>
                      {idea.engineCheck ? (
                        <span className={`flex items-center gap-1 text-xs font-medium ${idea.engineCheck.direction === 'confirmed' ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {idea.engineCheck.direction === 'confirmed' ? <CheckCircle size={13} /> : <XCircle size={13} />}
                          Engine {idea.engineCheck.direction} ({idea.engineCheck.savingPct > 0 ? '−' : '+'}{Math.abs(idea.engineCheck.savingPct)}%)
                        </span>
                      ) : (
                        // A silent gap reads as a pass — say the engine did not look.
                        <span title={idea.engineCheckReason ? `Why: ${idea.engineCheckReason}` : 'Not expressible as a substitution, tolerance, assembly or harness change the engine can price. The saving is AI-estimated.'}
                          className="flex items-center gap-1 text-xs font-medium text-slate-400">
                          <Gauge size={13} /> Not engine-checked
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
            <p className="text-slate-500 text-xs text-center">Principles are deterministic TRIZ theory; every £ figure is engine-checked or labelled. Validate against detailed studies before commercial use.</p>
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

        {/* ── Separation results ─────────────────────────────────────────── */}
        {mode === 'separation' && sepResult && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="bg-navy-900 border border-white/10 rounded-2xl p-5">
              <p className="text-slate-500 text-xs uppercase tracking-wider mb-2">The physical contradiction</p>
              <p className="text-white text-sm">{sepResult.contradiction.statement}</p>
              {/* The whole reason this route exists — say it out loud. */}
              <p className="text-emerald-400/80 text-xs mt-2">{sepResult.basis}</p>
            </div>

            <div>
              <h2 className="text-white font-bold text-lg flex items-center gap-2 mb-3">
                <SplitSquareHorizontal size={18} className="text-gold-400" /> Four ways to separate
              </h2>
              <div className="space-y-3">
                {sepResult.strategies.map((s: any) => (
                  <div key={s.id} className="bg-navy-900 border border-white/10 rounded-xl p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                      <span className="text-white font-semibold text-sm">{s.name}</span>
                      {/* Published principle lists differ; the grade travels
                          with the recommendation rather than being implied. */}
                      <span className="text-slate-500 text-2xs uppercase tracking-wider">
                        {s.sourceStatus === 'industry-consensus' ? 'industry consensus, lists vary by source' : s.sourceStatus}
                      </span>
                    </div>
                    <p className="text-slate-300 text-xs mb-2">{s.question}</p>
                    <p className="text-teal-300 text-xs mb-2">{s.cost}</p>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {s.principles.map((p: Principle) => (
                        <span key={p.id} title={p.hint}
                          className="px-2 py-0.5 rounded-md bg-gold-500/10 border border-gold-500/20 text-gold-400 text-2xs">
                          {p.id} {p.name}
                        </span>
                      ))}
                    </div>
                    <ul className="text-slate-500 text-xs space-y-0.5">
                      {s.examples.map((ex: string) => <li key={ex}>· {ex}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {Array.isArray(sepResult.ideas) && sepResult.ideas.length > 0 && (
              <div>
                <h2 className="text-white font-bold text-lg flex items-center gap-2 mb-3"><Cpu size={18} className="text-gold-400" /> Ideas</h2>
                <div className="space-y-3">
                  {sepResult.ideas.map((idea: any, i: number) => (
                    <div key={i} className="bg-navy-900 border border-white/10 rounded-2xl p-5">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="text-white font-semibold">{idea.title}</h3>
                        {idea.engineCheck ? (
                          <span className={`flex items-center gap-1 text-xs font-medium shrink-0 ${idea.engineCheck.direction === 'confirmed' ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {idea.engineCheck.direction === 'confirmed' ? <CheckCircle size={13} /> : <XCircle size={13} />}
                            Engine {idea.engineCheck.direction}
                          </span>
                        ) : (
                          <span title={idea.engineCheckReason ? `Why: ${idea.engineCheckReason}` : 'The engine could not price this move; the saving is AI-estimated.'}
                            className="flex items-center gap-1 text-xs font-medium shrink-0 text-slate-400">
                            <Gauge size={13} /> Not engine-checked
                          </span>
                        )}
                      </div>
                      <p className="text-slate-400 text-sm leading-relaxed mb-2">{idea.technicalDescription}</p>
                      {idea.costAngle && <p className="text-teal-300 text-xs"><span className="text-slate-500">Cost angle:</span> {idea.costAngle}</p>}
                      {idea.riskNotes && <p className="text-amber-300/80 text-xs mt-1"><span className="text-slate-500">Risk:</span> {idea.riskNotes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="text-slate-500 text-xs text-center">{sepResult.note}</p>
          </motion.div>
        )}

        {/* ── Trimming results ───────────────────────────────────────────── */}
        {mode === 'trim' && trimResult && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="bg-navy-900 border border-white/10 rounded-2xl p-5">
              <p className="text-slate-500 text-xs uppercase tracking-wider mb-2">Trimming candidates — worst first by cost released</p>
              {/* The tool refuses to rank by a number it does not have, and
                  the reader is told which situation they are in. */}
              <p className="text-slate-400 text-xs">
                {trimResult.analysis.costed
                  ? <>Total costed: <span className="text-white">{trimResult.analysis.totalCost}</span> per part.</>
                  : 'No costs were given, so candidates are listed alphabetically rather than by value — the order is not a priority.'}
                {trimResult.analysis.componentsWithoutCost.length > 0 && trimResult.analysis.costed && (
                  <> No cost for: {trimResult.analysis.componentsWithoutCost.join(', ')}.</>
                )}
              </p>
              {trimResult.droppedCandidates > 0 && (
                <p className="text-amber-400/80 text-xs mt-2">
                  {trimResult.droppedCandidates} further candidate(s) were analysed but not sent for redistribution — the list is capped worst-first to keep the request answerable.
                </p>
              )}
            </div>

            <div className="space-y-3">
              {trimResult.analysis.candidates.map((c: any) => {
                const idea = (trimResult.ideas || []).find((x: any) => x.carrier === c.carrier);
                return (
                  <div key={c.carrier} className="bg-navy-900 border border-white/10 rounded-2xl p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                      <h3 className="text-white font-semibold">{c.carrier}</h3>
                      <span className="text-xs text-slate-400">
                        {c.costReleased != null
                          ? <span className="text-emerald-400">releases {c.costReleased}/part</span>
                          : <span className="text-slate-500">cost not given</span>}
                        {' · '}
                        {c.questionsToAnswer === 0
                          ? <span className="text-emerald-400">no useful function — pure gain</span>
                          : `${c.questionsToAnswer} question${c.questionsToAnswer === 1 ? '' : 's'} to answer`}
                      </span>
                    </div>
                    {c.note && <p className="text-emerald-400/80 text-xs mb-2">{c.note}</p>}
                    <div className="space-y-2 mb-3">
                      {c.functions.map((f: any, k: number) => (
                        <div key={k} className="text-xs">
                          <span className="text-slate-300">{f.function} → {f.object}</span>
                          <span className="text-slate-500"> [{f.rank}]</span>
                          {f.rules.map((r: any) => (
                            <p key={r.id} className="text-slate-500 mt-0.5 pl-3">
                              <span className="text-gold-500/80">[{r.id}]</span> {r.question}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                    {idea && (
                      <div className="border-t border-white/10 pt-3">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded-md text-2xs font-semibold ${idea.trimmable ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-300' : 'bg-slate-500/10 border border-slate-500/25 text-slate-400'}`}>
                            {idea.trimmable ? 'Trimmable' : 'Keep — nothing can take the function'}
                          </span>
                          {idea.trimmingRule && <span className="text-slate-500 text-2xs">{idea.trimmingRule}</span>}
                          {idea.newCarrier && <span className="text-slate-400 text-2xs">→ {idea.newCarrier}</span>}
                        </div>
                        <p className="text-slate-400 text-sm leading-relaxed">{idea.technicalDescription}</p>
                        {idea.riskNotes && <p className="text-amber-300/80 text-xs mt-1"><span className="text-slate-500">Risk:</span> {idea.riskNotes}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-slate-500 text-xs text-center">{trimResult.note}</p>
          </motion.div>
        )}

        {/* WHAT IS ACTUALLY IN THE BOX. This line used to claim a
            "deterministic contradiction matrix"; the core holds 20 curated
            classical pairs and an affinity model for the rest, and says so in
            its own header comment. Every recommendation already reports which
            of the two it used — the summary line should not contradict it. */}
        {!result && !sepResult && !trimResult && !loading && (
          <p className="text-center text-slate-500 text-xs mt-8 measure mx-auto">40 classical inventive principles · 39 engineering parameters · 3 trimming rules · 4 separation strategies · engine-checked outputs</p>
        )}
      </div>
    </div>
  );
}
