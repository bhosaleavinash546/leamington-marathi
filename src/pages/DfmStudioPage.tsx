import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Upload, ShieldCheck, AlertTriangle, HelpCircle, FileDown, Table2,
  Ruler, Layers, Boxes, Info, CheckCircle2, MinusCircle, ChevronRight,
} from 'lucide-react';
import ButtonSpinner from '../components/ui/ButtonSpinner';
import CadViewer3D from '../components/CadViewer3D';
import { useAuth } from '../contexts/AuthContext';

// DFM / DFA Studio. Upload a STEP or IGES part and get a manufacturability
// analysis measured from the geometry, plus an assembly analysis when the file
// carries more than one solid.
//
// The page's job is to keep the honesty of the engines visible. Three things it
// must never do: show a score without its coverage, list findings without the
// rules that could NOT be checked, or print a cost figure the engines did not
// compute. Each has its own visible treatment below.

interface Finding {
  id: string; title: string; severity: 'high' | 'medium' | 'low';
  measure: string; measured?: number; unit: string; thresholdText: string;
  rationale: string; fix: string; source: string; status: string; reason?: string;
  cost?: {
    priced: boolean; basis?: string; changeDescription?: string;
    asDrawnEur?: number; improvedEur?: number; deltaEur?: number; annualDeltaEur?: number;
    reason?: string; externalGuideline?: string;
  };
}
interface ProcessResult {
  process: string; processName: string;
  findings: Finding[]; passed: Finding[]; notEvaluated: Finding[];
  ruleCount: number; evaluatedCount: number; coveragePct: number; score: number | null;
  impact?: { pricedCount: number; unpricedCount: number; perPartEur: number; annualEur: number; caveat: string | null };
}
interface DfmResponse {
  partName?: string;
  geometry?: Record<string, any>;
  dfm?: Record<string, any>;
  results: ProcessResult[];
  processFamily?: string | null;
  processFamilyBasis?: string;
  analysisLimits?: AnalysisLimit[];
}
interface AnalysisLimit { kind: string; severity: 'blocking' | 'warning'; message: string }
interface DfaResponse {
  decomposition?: Record<string, any>;
  dfa?: Record<string, any>;
  analysisLimits?: AnalysisLimit[];
}

const MATERIALS = ['', 'Aluminium A356 (cast)', 'Aluminium 6061', 'Steel (mild)', 'Steel (high-strength)', 'Stainless Steel 304', 'Zinc (ZAMAK 5)', 'Magnesium AZ31', 'ABS', 'PA66-GF30 (glass-filled)', 'Polypropylene (PP)'];
const COST_PROCESSES = ['', 'Die Casting (Aluminium)', 'Injection Moulding', 'Machining (CNC)', 'Stamping / Deep Drawing', 'Gravity Die Casting', 'Sand Casting'];
const REGIONS = ['Germany', 'UK', 'Czech Republic', 'Spain', 'Mexico', 'USA', 'China', 'India'];

type DfaQuestion = 'moves' | 'differentMaterial' | 'mustSeparate';
/** Boothroyd's three questions. Geometry proposes them; only a human can answer.
 *  Without this UI the engine never received answers, so the DFA index and the
 *  consolidation list were withheld for every user on every part. */
const DFA_QUESTIONS: { key: DfaQuestion; label: string; hint: string }[] = [
  { key: 'moves', label: 'Moves', hint: 'Does it move relative to parts already assembled?' },
  { key: 'differentMaterial', label: 'Material', hint: 'Must it be a different material for a fundamental reason?' },
  { key: 'mustSeparate', label: 'Separable', hint: 'Must it be separable for assembly or service?' },
];

const SEV_STYLE: Record<string, string> = {
  high: 'border-red-500/40 bg-red-500/10 text-red-300',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  low: 'border-teal-500/40 bg-teal-500/10 text-teal-300',
};

export default function DfmStudioPage() {
  const { token } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [material, setMaterial] = useState('');
  const [costProcess, setCostProcess] = useState('');
  const [region, setRegion] = useState('Germany');
  const [annualVolume, setAnnualVolume] = useState(120000);
  const [loading, setLoading] = useState<'' | 'dfm' | 'dfa'>('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<DfmResponse | null>(null);
  const [dfa, setDfa] = useState<DfaResponse | null>(null);
  const [exporting, setExporting] = useState<'' | 'pdf' | 'xlsx'>('');
  // Which findings the viewer paints onto the model. The analysis already
  // returns the face ids; a finding that says "2 undercut regions" without
  // showing WHERE leaves the engineer to hunt for them.
  const [highlight, setHighlight] = useState<'undercuts' | 'zeroDraft' | 'none'>('undercuts');
  const [answers, setAnswers] = useState<Record<number, Partial<Record<DfaQuestion, boolean>>>>({});

  const pick = useCallback((f: File | null) => {
    setFile(f); setResult(null); setDfa(null); setError(''); setAnswers({});
  }, []);

  async function post(path: string, extra: Record<string, string> = {}) {
    const fd = new FormData();
    fd.append('cadFile', file as File);
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    const r = await fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Analysis failed');
    return d;
  }

  async function analyse() {
    if (!file) { setError('Choose a STEP or IGES file first.'); return; }
    if (!token) { setError('Please sign in.'); return; }
    setLoading('dfm'); setError('');
    try {
      // weightKg is deliberately not sent: the server derives it from the
      // kernel-measured volume and the chosen material, so a value typed here
      // could silently disagree with the geometry the findings are based on.
      setResult(await post('/api/dfm/analyze', {
        material, costProcess, region, annualVolume: String(annualVolume),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally { setLoading(''); }
  }

  async function analyseAssembly(withAnswers = answers) {
    if (!file) { setError('Choose a STEP or IGES file first.'); return; }
    if (!token) { setError('Please sign in.'); return; }
    setLoading('dfa'); setError('');
    try {
      // Region drives the labour rate instead of a hard-coded EUR 42/hr, and the
      // confirmed answers are what let the engine release the DFA index.
      setDfa(await post('/api/dfm/dfa', { options: JSON.stringify({ region, answers: withAnswers }) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assembly analysis failed');
    } finally { setLoading(''); }
  }

  /** Answer one of the three questions for a part, then re-score immediately. */
  function answer(index: number, q: DfaQuestion, value: boolean) {
    const next = { ...answers, [index]: { ...(answers[index] || {}), [q]: value } };
    setAnswers(next);
    void analyseAssembly(next);
  }

  async function exportReport(kind: 'pdf' | 'xlsx') {
    if (!result) return;
    setExporting(kind);
    try {
      const mod = await import('../services/dfm-report');
      const payload = {
        ...result,
        fileName: file?.name,
        analysisLimits: [...(result.analysisLimits || []), ...(dfa?.analysisLimits || [])],
        dfa: dfa?.dfa ?? null,
        subject: { part: result.partName, material, process: costProcess },
      };
      if (kind === 'pdf') mod.exportDfmPdf(payload as never);
      else await mod.exportDfmXlsx(payload as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally { setExporting(''); }
  }

  const dfmBlock = result?.dfm ?? {};
  const wall = dfmBlock.wallThickness ?? {};
  const draft = dfmBlock.draft ?? {};
  const feats = dfmBlock.features ?? {};
  const highlightIds: number[] | null =
    highlight === 'undercuts' ? (draft.undercutFaceIds ?? null)
      : highlight === 'zeroDraft' ? (draft.zeroDraftFaceIds ?? null)
        : null;

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gold-500/15 border border-gold-500/25 mb-4">
            <ShieldCheck size={28} className="text-gold-400" />
          </div>
          <h1 className="text-4xl font-black text-white mb-3">DFM / DFA Studio</h1>
          <p className="text-slate-400 max-w-2xl mx-auto">
            Upload a 3D CAD part and get manufacturability measured from the geometry — draft, undercuts,
            wall thickness, features — checked against <span className="text-white">cited</span> design
            guidelines and priced by BrainSpark&apos;s <span className="text-gold-400">deterministic</span> cost engines.
          </p>
        </div>

        {/* Input */}
        <div className="bg-navy-900 border border-white/10 rounded-2xl p-6 mb-6">
          {/* The drop target stays a div because dragging has no keyboard
              equivalent — but the CHOOSE action is a real button, so the page is
              operable without a mouse. It was a bare div with onClick, which no
              keyboard or screen-reader user could reach at all. */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files?.[0] ?? null); }}
            className="border-2 border-dashed border-white/15 rounded-xl p-8 text-center cursor-pointer hover:border-gold-500/40 transition-colors"
          >
            <Upload size={28} className="mx-auto text-slate-500 mb-2" aria-hidden="true" />
            <p className="text-white text-sm font-medium">{file ? file.name : 'Drop a STEP or IGES file, or choose one'}</p>
            <p className="text-slate-500 text-xs mt-1">
              B-rep geometry only. An STL is a triangle mesh with no topology, so draft, undercuts and features cannot be measured from it.
            </p>
            <button type="button"
              onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
              className="mt-3 px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium
                         focus:outline-none focus:ring-2 focus:ring-gold-500/60"
            >
              {file ? 'Choose a different file' : 'Choose CAD file'}
            </button>
            <input ref={inputRef} type="file" accept=".step,.stp,.iges,.igs" className="hidden"
              tabIndex={-1} aria-hidden="true" onChange={e => pick(e.target.files?.[0] ?? null)} />
          </div>

          <div className="grid sm:grid-cols-4 gap-3 mt-4">
            <label className="text-xs text-slate-400">Material
              <select value={material} onChange={e => setMaterial(e.target.value)}
                className="mt-1 w-full bg-navy-800 border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/40">
                {MATERIALS.map(m => <option key={m} value={m}>{m || 'Not set (cost impact unavailable)'}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-400">Costing process
              <select value={costProcess} onChange={e => setCostProcess(e.target.value)}
                className="mt-1 w-full bg-navy-800 border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/40">
                {COST_PROCESSES.map(p => <option key={p} value={p}>{p || 'Not set'}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-400">Region
              <select value={region} onChange={e => setRegion(e.target.value)}
                className="mt-1 w-full bg-navy-800 border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/40">
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-400">Annual volume
              <input type="number" value={annualVolume} min={1}
                onChange={e => setAnnualVolume(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-full bg-navy-800 border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/40" />
            </label>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <button onClick={analyse} disabled={!file || loading !== ''}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gold-500 text-navy-950 font-semibold text-sm hover:bg-gold-400 transition-colors disabled:opacity-50">
              {loading === 'dfm' ? <ButtonSpinner size={14} /> : <Ruler size={15} />} Analyse manufacturability
            </button>
            <button onClick={() => void analyseAssembly()} disabled={!file || loading !== ''}
              title="Decompose an assembly into parts and score it for assembly"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-teal-500/30 bg-teal-500/10 text-teal-300 font-semibold text-sm hover:bg-teal-500/20 transition-colors disabled:opacity-50">
              {loading === 'dfa' ? <ButtonSpinner size={14} /> : <Boxes size={15} />} Analyse assembly (DFA)
            </button>
          </div>
          {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        </div>

        {result && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            {/* Export */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-white font-bold text-lg flex items-center gap-2">
                <Layers size={18} className="text-gold-400" /> {result.partName || file?.name}
              </h2>
              <div className="flex items-center gap-2">
                <button onClick={() => exportReport('pdf')} disabled={exporting !== ''}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gold-500/30 bg-gold-500/10 text-gold-300 hover:bg-gold-500/20 text-xs transition-colors disabled:opacity-50">
                  {exporting === 'pdf' ? <ButtonSpinner size={12} /> : <FileDown size={13} />} Export PDF
                </button>
                <button onClick={() => exportReport('xlsx')} disabled={exporting !== ''}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-xs transition-colors disabled:opacity-50">
                  {exporting === 'xlsx' ? <ButtonSpinner size={12} /> : <Table2 size={13} />} Export Excel
                </button>
              </div>
            </div>

            {/* Analysis limits. These flags were always produced by the engine
                and never shown: a part drawn in metres reported a 0.05 mm wall
                and three confident findings, with the unit warning invisible. */}
            {(result.analysisLimits?.length ?? 0) > 0 && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
                <p className="text-amber-300 font-semibold text-sm flex items-center gap-2 mb-2">
                  <AlertTriangle size={15} /> Analysis limits
                </p>
                <ul className="space-y-1.5">
                  {result.analysisLimits!.map((l, i) => (
                    <li key={i} className={`text-xs ${l.severity === 'blocking' ? 'text-amber-200' : 'text-amber-300/80'}`}>
                      {l.severity === 'blocking' && <span className="font-bold uppercase mr-1.5">Blocking:</span>}
                      {l.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 3D view with the findings painted onto the actual faces. The
                engine already returns undercutFaceIds / zeroDraftFaceIds. */}
            <div className="bg-navy-900 border border-white/10 rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <p className="text-slate-500 text-xs uppercase tracking-wider">Geometry — findings shown on the part</p>
                <div className="flex items-center gap-1.5" role="group" aria-label="Highlight findings on the model">
                  {([
                    ['undercuts', `Undercuts (${draft.undercutFaceCount ?? 0})`],
                    ['zeroDraft', `Zero-draft walls (${draft.zeroDraftFaceCount ?? 0})`],
                    ['none', 'None'],
                  ] as const).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setHighlight(k)} aria-pressed={highlight === k}
                      className={`px-2.5 py-1 rounded-lg text-[11px] border transition-colors ${
                        highlight === k
                          ? 'border-gold-500/50 bg-gold-500/15 text-gold-300'
                          : 'border-white/10 text-slate-400 hover:text-slate-200'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <CadViewer3D file={file} token={token} highlightFaceIds={highlightIds}
                className="h-[420px] rounded-xl overflow-hidden" />
              <p className="text-slate-600 text-[11px] mt-2">
                An undercut is occluded in both tool halves and buys a slide or a lifter. A zero-draft wall
                drags out but scuffs, and is fixable with a degree of taper. They are deliberately shown
                as different problems.
              </p>
            </div>

            {/* Measured geometry — the evidence the findings rest on */}
            <div className="bg-navy-900 border border-white/10 rounded-2xl p-5">
              <p className="text-slate-500 text-xs uppercase tracking-wider mb-3">Measured geometry</p>
              <div className="grid sm:grid-cols-4 gap-4 text-sm">
                <Metric label="Wall p5 / p50 / p95"
                  value={wall.p50Mm ? `${wall.p5Mm} / ${wall.p50Mm} / ${wall.p95Mm} mm` : 'not measured'} />
                <Metric label="Uniformity" value={wall.uniformity ?? '—'} />
                <Metric label="Draw direction"
                  value={draft.drawDirectionXYZ ? `[${draft.drawDirectionXYZ.join(', ')}]` : '—'}
                  hint="Chosen by sweeping candidate axes, not assumed" />
                <Metric label="Undercut regions" value={String(draft.undercutFaceCount ?? '—')}
                  hint="Occluded in both tool halves — needs a slide or lifter" />
                <Metric label="Wall area below min draft"
                  value={draft.wallAreaBelowMinDraftPct != null ? `${draft.wallAreaBelowMinDraftPct}%` : '—'}
                  hint="Drag faces: fixable with taper. Distinct from undercuts." />
                <Metric label="Features"
                  value={Object.entries(feats.counts ?? {}).map(([k, v]) => `${v}x ${k}`).join(', ') || 'none named'} />
                <Metric label="Unclassified area"
                  value={feats.unclassifiedAreaPct != null ? `${feats.unclassifiedAreaPct}%` : '—'}
                  hint="Surface the feature recogniser could not name" />
                <Metric label="Setups"
                  value={String(result.geometry?.setupAnalysis?.estimatedSetupCount ?? '—')} />
              </div>
            </div>

            {/* What the RECOGNISER itself says it cannot do. The engine has
                emitted this list since the feature shipped and nothing rendered
                it, so a reader had no way to tell "no ribs on this part" from
                "ribs with curved sides are not recognised". */}
            {Array.isArray(feats.knownLimits) && feats.knownLimits.length > 0 && (
              <details className="bg-navy-900 border border-white/10 rounded-2xl p-5 group">
                <summary className="text-slate-500 text-xs uppercase tracking-wider cursor-pointer
                                    marker:content-none flex items-center gap-2
                                    focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/60 rounded">
                  <ChevronRight size={13} className="transition-transform group-open:rotate-90" aria-hidden="true" />
                  What the feature recogniser cannot see ({feats.knownLimits.length})
                </summary>
                <ul className="mt-3 space-y-2">
                  {feats.knownLimits.map((l: string, i: number) => (
                    <li key={i} className="text-slate-400 text-xs flex gap-2">
                      <span className="text-slate-600 shrink-0" aria-hidden="true">·</span>{l}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/* Ribs, with the ratios the rules are actually written against.
                A "3x rib" count says nothing; the proportions are the finding. */}
            {Array.isArray(feats.ribs) && feats.ribs.length > 0 && (
              <div className="bg-navy-900 border border-white/10 rounded-2xl p-5">
                <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">
                  Recognised ribs
                </p>
                <p className="text-slate-600 text-[11px] mb-3">
                  Thickness is measured at the base, where the guideline applies — drafted sides
                  are opened out by the draft term rather than reported at mid-height.
                  {wall.p50Mm
                    ? ` Ratios are against the measured ${wall.p50Mm} mm nominal wall.`
                    : ' Wall thickness could not be measured, so no ratio is shown and the rib rules abstain.'}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-500 text-[11px] uppercase tracking-wider text-left">
                        <th className="py-1 pr-3 font-medium">#</th>
                        <th className="py-1 pr-3 font-medium">Thickness</th>
                        <th className="py-1 pr-3 font-medium">Height</th>
                        <th className="py-1 pr-3 font-medium">Length</th>
                        <th className="py-1 pr-3 font-medium">Draft/side</th>
                        <th className="py-1 pr-3 font-medium">t / wall</th>
                        <th className="py-1 font-medium">h / wall</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      {feats.ribs.map((r: any, i: number) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="py-1.5 pr-3 text-slate-500">{i + 1}</td>
                          <td className="py-1.5 pr-3 text-white">{r.thicknessMm} mm</td>
                          <td className="py-1.5 pr-3">{r.heightMm} mm</td>
                          <td className="py-1.5 pr-3">{r.lengthMm != null ? `${r.lengthMm} mm` : '—'}</td>
                          <td className="py-1.5 pr-3">{r.draftPerSideDeg}°</td>
                          <td className="py-1.5 pr-3">
                            {wall.p50Mm ? (r.thicknessMm / wall.p50Mm).toFixed(2) : '—'}
                          </td>
                          <td className="py-1.5">
                            {wall.p50Mm ? (r.heightMm / wall.p50Mm).toFixed(2) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Which rule families ran, and why. Without this a reader cannot
                tell a targeted analysis from a speculative sweep. */}
            {!result.processFamily && (
              <p className="text-amber-400/90 text-xs flex items-start gap-2">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                No costing process was chosen, so every rule family was run speculatively —
                some findings below will be for processes this part will never see. Pick a
                costing process to narrow it.
              </p>
            )}

            {/* Per-process results */}
            {result.results.filter(r => r.ruleCount > 0).map(r => (
              <div key={r.process} className="bg-navy-900 border border-white/10 rounded-2xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <h3 className="text-white font-semibold">{r.processName}</h3>
                  <div className="flex items-center gap-4 text-xs">
                    <span className={r.score == null ? 'text-slate-500' : r.score >= 80 ? 'text-emerald-400' : r.score >= 50 ? 'text-amber-400' : 'text-red-400'}>
                      Score {r.score == null ? 'not given' : `${r.score}/100`}
                    </span>
                    {/* Coverage always sits next to the score. A score without it
                        invites the reader to assume the whole catalogue ran. */}
                    <span className="text-slate-400">Coverage {r.coveragePct}% ({r.evaluatedCount}/{r.ruleCount})</span>
                    {r.impact?.annualEur ? <span className="text-emerald-400">€{r.impact.annualEur.toLocaleString()}/yr priced</span> : null}
                  </div>
                </div>

                {r.score == null && (
                  <p className="text-slate-500 text-xs mb-3 italic">
                    No rule in this family could be evaluated on this geometry, so no score is given.
                  </p>
                )}

                {r.findings.map(f => (
                  <div key={f.id} className={`rounded-xl border p-4 mb-3 ${SEV_STYLE[f.severity]}`}>
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <h4 className="text-white font-semibold text-sm">{f.title}</h4>
                      <span className="text-[10px] font-bold uppercase tracking-wider shrink-0">{f.severity}</span>
                    </div>
                    <p className="text-xs opacity-90 mb-2">
                      Measured <span className="font-semibold">{f.measured ?? '—'} {f.unit}</span> · guideline {f.thresholdText}
                    </p>
                    <p className="text-slate-300 text-sm leading-relaxed mb-2">{f.rationale}</p>
                    <p className="text-emerald-300 text-xs mb-2"><span className="text-slate-500">What to do:</span> {f.fix}</p>
                    {f.cost?.priced ? (
                      <p className="text-emerald-300 text-xs">
                        <span className="text-slate-500">Cost impact:</span> {f.cost.changeDescription} saves €{f.cost.deltaEur}/part
                        {f.cost.annualDeltaEur ? ` (€${f.cost.annualDeltaEur.toLocaleString()}/yr)` : ''} — {f.cost.basis}
                      </p>
                    ) : (
                      <p className="text-slate-500 text-xs">
                        <span className="text-slate-600">Not priced:</span> {f.cost?.reason}
                        {f.cost?.externalGuideline && <span className="block mt-1 text-amber-400/80 italic">{f.cost.externalGuideline}</span>}
                      </p>
                    )}
                    <p className="text-slate-600 text-[10px] mt-2">Source: {f.source}</p>
                  </div>
                ))}
                {/* Only an all-clear when something was actually checked. With
                    zero evaluated rules this would be a green tick on a family
                    nobody looked at. */}
                {!r.findings.length && r.evaluatedCount > 0 && (
                  <p className="text-emerald-400 text-sm flex items-center gap-2">
                    <CheckCircle2 size={15} /> No rule in this family was breached ({r.evaluatedCount} of {r.ruleCount} checked).
                  </p>
                )}
                {!r.findings.length && r.evaluatedCount === 0 && (
                  <p className="text-slate-500 text-sm flex items-center gap-2">
                    <MinusCircle size={15} /> Nothing in this family could be checked on this geometry — see below.
                  </p>
                )}

                {r.notEvaluated.length > 0 && (
                  <details className="mt-3">
                    <summary className="text-slate-400 text-xs cursor-pointer hover:text-slate-200 flex items-center gap-1.5">
                      <MinusCircle size={13} /> {r.notEvaluated.length} rule{r.notEvaluated.length === 1 ? '' : 's'} could NOT be checked — these are not passes
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {r.notEvaluated.map(n => (
                        <li key={n.id} className="text-slate-500 text-xs">· {n.title} — {n.reason}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {r.passed.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-emerald-500/80 text-xs cursor-pointer hover:text-emerald-300">
                      {r.passed.length} rule{r.passed.length === 1 ? '' : 's'} passed
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {r.passed.map(p => (
                        <li key={p.id} className="text-slate-500 text-xs">· {p.title} — {p.measured ?? '—'} {p.unit} against {p.thresholdText}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </motion.div>
        )}

        {/* DFA */}
        {dfa?.dfa && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="bg-navy-900 border border-white/10 rounded-2xl p-5 mt-5">
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2"><Boxes size={17} className="text-teal-400" /> Design for Assembly</h3>
            <div className="grid sm:grid-cols-4 gap-4 text-sm mb-4">
              <Metric label="Parts" value={String(dfa.dfa.totalParts)} />
              <Metric label="Assembly time" value={`${dfa.dfa.totalAssemblyTimeSec} s`} />
              <Metric label="Theoretical min"
                value={dfa.dfa.theoreticalMinParts == null ? 'withheld' : String(dfa.dfa.theoreticalMinParts)} />
              <Metric label="DFA index"
                value={dfa.dfa.designEfficiencyPct == null ? 'withheld' : `${dfa.dfa.designEfficiencyPct}%`} />
            </div>
            {!dfa.dfa.completeness?.indexAvailable && (
              <p className="text-amber-400/90 text-xs mb-3 flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {dfa.dfa.completeness?.note}
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-white/10">
                    <th className="text-left py-1.5 pr-3">#</th><th className="text-left pr-3">Part</th>
                    <th className="text-right pr-3">Off</th><th className="text-right pr-3">α+β</th>
                    <th className="text-right pr-3">Handle s</th><th className="text-right pr-3">Insert s</th>
                    <th className="text-right pr-3">Total s</th>
                    <th className="text-left pr-3">Fastener?</th>
                    <th className="text-left" colSpan={3}>Necessary? — answer all three to release the index</th>
                  </tr>
                </thead>
                <tbody>
                  {(dfa.dfa.rows || []).filter((r: any) => !r.skipped).map((r: any) => (
                    <tr key={r.index} className="border-b border-white/5 text-slate-300">
                      <td className="py-1.5 pr-3">{r.index}</td>
                      <td className="pr-3">{r.name}</td>
                      <td className="text-right pr-3">{r.groupSize}</td>
                      <td className="text-right pr-3">{r.symmetry?.totalDeg ?? '—'}</td>
                      <td className="text-right pr-3">{r.time?.handlingSec}</td>
                      <td className="text-right pr-3">{r.time?.insertionSec}</td>
                      <td className="text-right pr-3 font-semibold">{r.time?.totalSec}</td>
                      <td className="text-slate-500 pr-3">{r.fastener?.isFastener ? `probable (${r.fastener.confidence})` : '—'}</td>
                      {DFA_QUESTIONS.map(q => {
                        const v = answers[r.index]?.[q.key];
                        return (
                          <td key={q.key} className="pr-2 py-1">
                            <div className="flex items-center gap-0.5" role="group" aria-label={`${r.name}: ${q.hint}`}>
                              <span className="text-slate-600 text-[10px] mr-1">{q.label}</span>
                              {([['Y', true], ['N', false]] as const).map(([lbl, val]) => (
                                <button key={lbl} type="button" onClick={() => answer(r.index, q.key, val)}
                                  aria-pressed={v === val} title={q.hint}
                                  className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
                                    v === val
                                      ? (val ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                                             : 'border-slate-500/50 bg-slate-500/15 text-slate-300')
                                      : 'border-white/10 text-slate-600 hover:text-slate-300'}`}>
                                  {lbl}
                                </button>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-slate-600 text-[11px] mt-3 italic">
              α+β is measured by rotating each solid and intersecting it with itself, not inferred from inertia.
              Times use the {dfa.dfa.timeModel?.version} model — {dfa.dfa.timeModel?.basis}
            </p>
          </motion.div>
        )}

        {!result && !dfa && (
          <div className="bg-navy-900/60 border border-white/10 rounded-2xl p-5 text-slate-400 text-sm">
            <p className="flex items-start gap-2">
              <Info size={15} className="text-gold-400 shrink-0 mt-0.5" />
              <span>
                Findings are checked against published design guidelines with their source cited, and each carries a cost
                consequence computed by the same engines the rest of BrainSpark uses. Rules the geometry cannot answer are
                reported as <span className="text-white">not evaluated</span> — never as passes.
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-slate-500 text-[11px] uppercase tracking-wider flex items-center gap-1">
        {label}
        {/* The hint was a `title` on a span, which a screen reader never
            announces and a keyboard user can never reveal. The icon is now
            decorative and the text itself is in the accessibility tree. */}
        {hint && (
          <>
            <HelpCircle size={11} className="text-slate-600" aria-hidden="true" />
            <span className="sr-only">{hint}</span>
          </>
        )}
      </p>
      <p className="text-white font-semibold mt-0.5">{value}</p>
    </div>
  );
}
