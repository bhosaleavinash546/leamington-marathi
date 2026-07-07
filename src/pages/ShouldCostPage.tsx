import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calculator, ChevronDown, Cpu, ShieldCheck, Sparkles, Database } from 'lucide-react';
import ButtonSpinner from '../components/ui/ButtonSpinner';
import { useAuth } from '../contexts/AuthContext';
import { markOnboardingStep } from '../components/OnboardingChecklist';
import { CURRENCIES, COST_COMPONENTS, FALLBACK_MATERIALS, FALLBACK_PROCESSES, FALLBACK_REGIONS } from '../constants/costing';

interface CostComponent { value: number; pct: number; }
interface ShouldCostResult {
  engine: string;
  currency: string;
  symbol?: string;
  fx?: { base: string; rate: number; asOf: string | null; source: string; stale?: boolean } | null;
  calibration?: { applied: boolean; factor: number; quotes: number; source?: string };
  materialCost: string;
  processCost: string;
  overheadCost: string;
  totalShouldCost: string;
  totalValue: number;
  gapVsQuote?: string;
  breakdown: Record<string, CostComponent>;
  drivers: Record<string, number>;
  simulation: { p10: string; p50: string; p90: string; p10Value: number; p50Value: number; p90Value: number; stdev: number };
  volumeCurve?: { volume: number; unitCost: number; unitCostLabel: string }[];
  assumptions: string[];
  explanation: string;
  negotiationLeverage: string;
  materialPrice?: { live?: boolean; commodityLabel?: string; commodityPerKg?: number; effectivePerKg?: number; pricedAt?: string | null; note?: string; proxy?: boolean };
  route?: {
    operations: string[];
    lines: { op: string; conversion: number; tooling: number; scrapPct: number; outMassKg: number }[];
    rolledThroughputYield: number;
  } | null;
  carbon?: {
    materialKgCo2e: number; processKgCo2e: number; totalKgCo2e: number;
    cbam: { eur: number; basis: string } | null; basis: string;
  } | null;
}

interface CostDownAlt {
  material: string; process: string; region: string;
  total: number; saving: number; savingPct: number;
  rationale?: string; risk?: string;
}
interface CostDownResult {
  engine: string;
  baseline: { partName: string; material: string; process: string; region: string; totalShouldCost: number; currency: string };
  alternatives: CostDownAlt[];
  note: string;
}

const BREAKDOWN_META = COST_COMPONENTS.map(c => ({ key: c.key, label: c.label, color: c.text, bar: c.bar }));

// Downstream (conversion-only) operations offered as route steps — kept out of
// the primary-process dropdown, selectable as chips instead.
const SECONDARY_OPS = [
  'Machining (secondary ops)', 'Heat Treatment (batch)', 'E-coat (KTL)',
  'Powder Coating', 'Zinc Plating', 'Grinding (finish)', 'Washing & Final Inspection',
];

export default function ShouldCostPage() {
  const { token } = useAuth();
  const [materials, setMaterials] = useState<string[]>(FALLBACK_MATERIALS);
  const [processes, setProcesses] = useState<string[]>(FALLBACK_PROCESSES);
  const [regions, setRegions] = useState<string[]>(FALLBACK_REGIONS);

  const [partName, setPartName] = useState('');
  const [material, setMaterial] = useState(FALLBACK_MATERIALS[0]);
  const [process, setProcess] = useState(FALLBACK_PROCESSES[0]);
  const [weightKg, setWeightKg] = useState('');
  const [annualVolume, setAnnualVolume] = useState('');
  const [quotedCost, setQuotedCost] = useState('');
  const [region, setRegion] = useState(FALLBACK_REGIONS[0]);
  const [currency, setCurrency] = useState<string>(CURRENCIES[0]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ShouldCostResult | null>(null);
  const [error, setError] = useState('');
  const [teachPrice, setTeachPrice] = useState('');
  const [teachMsg, setTeachMsg] = useState('');
  const [teaching, setTeaching] = useState(false);
  const [costDown, setCostDown] = useState<CostDownResult | null>(null);
  const [cdLoading, setCdLoading] = useState(false);
  const [cdError, setCdError] = useState('');
  // Process-chain routing: optional downstream operations after the primary op.
  const [secondaryOps, setSecondaryOps] = useState<string[]>([]);
  const [toleranceClass, setToleranceClass] = useState('standard');
  const [surfaceFinish, setSurfaceFinish] = useState('standard');
  const [isAdmin, setIsAdmin] = useState(false);
  const [libraryCustom, setLibraryCustom] = useState(false);
  const calcReqRef = useRef(0);

  useEffect(() => {
    fetch('/api/should-cost/catalogue')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        if (Array.isArray(d.materials) && d.materials.length) { setMaterials(d.materials); setMaterial(d.materials[0]); }
        if (Array.isArray(d.processes) && d.processes.length) { setProcesses(d.processes); setProcess(d.processes[0]); }
        if (Array.isArray(d.regions) && d.regions.length) { setRegions(d.regions); setRegion(d.regions[0]); }
        if (d.library?.custom) setLibraryCustom(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch('/api/admin/rate-library/status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null).then(d => { if (d?.isAdmin) setIsAdmin(true); }).catch(() => {});
  }, [token]);

  async function handleCalc() {
    if (!partName || !weightKg || !annualVolume) { setError('Please fill in part name, weight, and annual volume.'); return; }
    if (!token) { setError('Please sign in to use the should-cost engine.'); return; }
    const reqId = ++calcReqRef.current;   // only the latest request may paint the result
    setLoading(true);
    setError('');
    setResult(null);
    try {
      // apiKey is optional — only used for AI narrative; the numbers are deterministic.
      const apiKey = localStorage.getItem('brainspark_api_key') || undefined;
      const r = await fetch('/api/should-cost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          partName, material, process, weightKg: Number(weightKg), annualVolume: Number(annualVolume),
          quotedCost: quotedCost ? Number(quotedCost) : undefined, region, currency, apiKey,
          // Multi-op routing + quality drivers (all optional)
          route: secondaryOps.length ? [process, ...secondaryOps] : undefined,
          toleranceClass: toleranceClass !== 'standard' ? toleranceClass : undefined,
          surfaceFinish: surfaceFinish !== 'standard' ? surfaceFinish : undefined,
        }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Request failed'); }
      const data = await r.json();
      if (reqId !== calcReqRef.current) return;   // a newer request (e.g. currency change) superseded this
      setResult(data);
      markOnboardingStep('shouldcost');
    } catch (e) {
      if (reqId !== calcReqRef.current) return;
      setError(e instanceof Error ? e.message : 'Calculation failed');
    } finally {
      if (reqId === calcReqRef.current) setLoading(false);
    }
  }

  // Feed a real supplier quote back so the engine learns this user's price
  // reality (the proprietary-data moat), then re-estimate with the new calibration.
  async function teachQuote() {
    const price = Number(teachPrice);
    if (!token || !(price > 0)) { setTeachMsg('Enter the real quoted price first.'); return; }
    setTeaching(true); setTeachMsg('');
    try {
      const r = await fetch('/api/should-cost/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ partName, material, process, weightKg: Number(weightKg), annualVolume: Number(annualVolume), region, currency, actualPrice: price }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not save the quote');
      setTeachMsg(`Learned — the engine is now calibrated from ${d.quotes} of your quote${d.quotes === 1 ? '' : 's'}.`);
      markOnboardingStep('teach');
      setTeachPrice('');
      await handleCalc();   // re-estimate with the updated calibration
    } catch (e) {
      setTeachMsg(e instanceof Error ? e.message : 'Could not save the quote');
    } finally { setTeaching(false); }
  }

  // Download the server-generated cost-breakdown-structure (.xlsx negotiation pack).
  const [exporting, setExporting] = useState(false);
  async function exportCbs(format: 'xlsx' | 'pptx' = 'xlsx') {
    if (!token || !weightKg || !annualVolume) return;
    setExporting(true);
    try {
      const r = await fetch(`/api/should-cost/export${format === 'pptx' ? '?format=pptx' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          partName, material, process, weightKg: Number(weightKg), annualVolume: Number(annualVolume), region, currency,
          quotedCost: quotedCost ? Number(quotedCost) : undefined,
          // Keep the export identical to the on-screen estimate: same route + drivers.
          route: secondaryOps.length ? [process, ...secondaryOps] : undefined,
          toleranceClass: toleranceClass !== 'standard' ? toleranceClass : undefined,
          surfaceFinish: surfaceFinish !== 'standard' ? surfaceFinish : undefined,
        }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Export failed'); }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${format === 'pptx' ? 'Negotiation' : 'CBS'}_${(partName || 'should-cost').replace(/[^\w.-]+/g, '_').slice(0, 60)}.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally { setExporting(false); }
  }

  // Agentic cost-down: the engine verifies every alternative the AI proposes.
  async function findCostDown() {
    if (!token || !weightKg || !annualVolume) { setCdError('Run a should-cost first.'); return; }
    setCdLoading(true); setCdError(''); setCostDown(null);
    try {
      const apiKey = localStorage.getItem('brainspark_api_key') || undefined;
      if (!apiKey) { setCdError('Add your Anthropic API key in settings to explore cost-down ideas (numbers stay engine-verified).'); return; }
      const r = await fetch('/api/cost-down', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ partName, material, process, weightKg: Number(weightKg), annualVolume: Number(annualVolume), region, apiKey }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Cost-down failed');
      setCostDown(d);
    } catch (e) {
      setCdError(e instanceof Error ? e.message : 'Cost-down failed');
    } finally { setCdLoading(false); }
  }

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-500/15 border border-teal-500/25 mb-4">
            <Calculator size={28} className="text-teal-400" />
          </div>
          <h1 className="text-4xl font-black text-white mb-3">Should-Cost Engine</h1>
          <p className="text-slate-400">Deterministic bottom-up cost modelling — <span className="text-teal-300">rate × time + mass × price</span>, computed in-engine, not guessed.</p>
          <div className="flex items-center justify-center gap-3 mt-3">
            {libraryCustom && <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/25"><Database size={11} /> Using your company rate library</span>}
            {isAdmin && <Link to="/admin/rate-library" className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border border-white/10 text-slate-300 hover:bg-white/5"><Database size={11} /> Manage rate library</Link>}
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Inputs */}
          <div className="bg-navy-900 rounded-2xl border border-white/10 p-6 space-y-4">
            <h2 className="text-white font-semibold mb-4 flex items-center gap-2"><Calculator size={16} className="text-teal-400" /> Part Parameters</h2>

            <div>
              <label htmlFor="sc-part" className="block text-xs text-slate-400 mb-1.5">Part / Component Name</label>
              <input id="sc-part" value={partName} onChange={e => setPartName(e.target.value)} placeholder="e.g. Front Door Inner Panel" className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-teal-500/40" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="sc-material" className="block text-xs text-slate-400 mb-1.5">Material</label>
                <div className="relative">
                  <select id="sc-material" value={material} onChange={e => setMaterial(e.target.value)} className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm appearance-none focus:outline-none focus:border-teal-500/40">
                    {materials.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-3 text-slate-500 pointer-events-none" />
                </div>
              </div>
              <div>
                <label htmlFor="sc-process" className="block text-xs text-slate-400 mb-1.5">Manufacturing Process</label>
                <div className="relative">
                  <select id="sc-process" value={process} onChange={e => setProcess(e.target.value)} className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm appearance-none focus:outline-none focus:border-teal-500/40">
                    {processes.filter(p => !SECONDARY_OPS.includes(p)).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-3 text-slate-500 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Process-chain routing: downstream operations after the primary op */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Secondary operations <span className="text-slate-600">(finished-part routing — optional)</span></label>
              <div className="flex flex-wrap gap-1.5">
                {SECONDARY_OPS.filter(op => processes.includes(op)).map(op => {
                  const on = secondaryOps.includes(op);
                  return (
                    <button key={op} type="button"
                      onClick={() => setSecondaryOps(s => on ? s.filter(x => x !== op) : [...s, op])}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] transition ${on ? 'bg-teal-500/20 border-teal-500/40 text-teal-200' : 'bg-white/4 border-white/10 text-slate-400 hover:bg-white/8'}`}>
                      {on ? '✓ ' : '+ '}{op.replace(' (secondary ops)', '').replace(' (batch)', '').replace(' (KTL)', '')}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quality drivers */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="sc-tol" className="block text-xs text-slate-400 mb-1.5">Tolerance class</label>
                <div className="relative">
                  <select id="sc-tol" value={toleranceClass} onChange={e => setToleranceClass(e.target.value)} className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm appearance-none focus:outline-none focus:border-teal-500/40">
                    <option value="standard">Standard (IT10+)</option>
                    <option value="tight">Tight (IT8–9)</option>
                    <option value="precision">Precision (≤IT7)</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-3 text-slate-500 pointer-events-none" />
                </div>
              </div>
              <div>
                <label htmlFor="sc-fin" className="block text-xs text-slate-400 mb-1.5">Surface finish</label>
                <div className="relative">
                  <select id="sc-fin" value={surfaceFinish} onChange={e => setSurfaceFinish(e.target.value)} className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm appearance-none focus:outline-none focus:border-teal-500/40">
                    <option value="standard">Standard</option>
                    <option value="fine">Fine (Ra ≤ 1.6)</option>
                    <option value="polished">Polished (Ra ≤ 0.4)</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-3 text-slate-500 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="sc-weight" className="block text-xs text-slate-400 mb-1.5">Part Weight (kg)</label>
                <input id="sc-weight" type="number" value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="e.g. 4.2" className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-teal-500/40" />
              </div>
              <div>
                <label htmlFor="sc-volume" className="block text-xs text-slate-400 mb-1.5">Annual Volume</label>
                <input id="sc-volume" type="number" value={annualVolume} onChange={e => setAnnualVolume(e.target.value)} placeholder="e.g. 80000" className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-teal-500/40" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="sc-region" className="block text-xs text-slate-400 mb-1.5">Plant Region</label>
                <div className="relative">
                  <select id="sc-region" value={region} onChange={e => setRegion(e.target.value)} className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm appearance-none focus:outline-none focus:border-teal-500/40">
                    {regions.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-3 text-slate-500 pointer-events-none" />
                </div>
              </div>
              <div>
                <label htmlFor="sc-currency" className="block text-xs text-slate-400 mb-1.5">Currency</label>
                <div className="relative">
                  <select id="sc-currency" value={currency} onChange={e => { setCurrency(e.target.value); setResult(null); calcReqRef.current++; }} className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm appearance-none focus:outline-none focus:border-teal-500/40">
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-3 text-slate-500 pointer-events-none" />
                </div>
              </div>
              <div>
                <label htmlFor="sc-quote" className="block text-xs text-slate-400 mb-1.5">Supplier Quote (optional)</label>
                <input id="sc-quote" type="number" value={quotedCost} onChange={e => setQuotedCost(e.target.value)} placeholder="e.g. 28.50" className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-teal-500/40" />
              </div>
            </div>

            {error && <p className="text-red-400 text-sm" role="alert">{error}</p>}

            <button onClick={handleCalc} disabled={loading || !partName || !weightKg || !annualVolume}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-semibold text-sm transition-all hover:scale-[1.02]">
              {loading ? <><ButtonSpinner size={16} /> Calculating...</> : <><Calculator size={16} /> Calculate Should-Cost</>}
            </button>
            <p className="text-slate-600 text-xs flex items-center gap-1.5"><ShieldCheck size={12} className="text-teal-500" /> Numbers are computed deterministically. An API key (optional) only adds an AI narrative.</p>
          </div>

          {/* Result */}
          <div className="bg-navy-900 rounded-2xl border border-white/10 p-6">
            {!result && !loading && (
              <div className="h-full flex flex-col items-center justify-center text-center py-12">
                <Calculator size={40} className="text-slate-700 mb-4" />
                <p className="text-slate-500 text-sm">Enter part parameters and click Calculate to see the bottom-up should-cost breakdown.</p>
              </div>
            )}
            {loading && (
              <div className="h-full flex flex-col items-center justify-center gap-3 py-12">
                <ButtonSpinner size={32} />
                <p className="text-slate-400 text-sm">Computing bottom-up cost model…</p>
              </div>
            )}
            {result && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-semibold flex items-center gap-2"><Calculator size={16} className="text-teal-400" /> Should-Cost Breakdown</h3>
                  <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/25">
                    <Cpu size={10} /> {result.engine === 'deterministic' ? 'Deterministic' : 'Deterministic + AI'}
                  </span>
                </div>

                {/* Total + Monte-Carlo band */}
                <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/25">
                  <div className="flex items-baseline justify-between">
                    <span className="text-slate-400 text-xs uppercase tracking-wider">Total Should-Cost / unit</span>
                    <span className="text-teal-300 font-black text-2xl">{result.totalShouldCost}</span>
                  </div>
                  {result.fx && (
                    <p className={`text-[10px] mt-1 ${result.fx.stale ? 'text-amber-400/80' : 'text-slate-500'}`}>
                      Converted at 1 {result.fx.base} = {result.fx.rate} {result.currency}
                      {result.fx.asOf ? ` · ${result.fx.source}, ${result.fx.asOf}` : ` · ${result.fx.source}`}
                      {result.fx.stale && ' · rates may be outdated (live feed unreachable)'}
                    </p>
                  )}
                  {result.calibration?.applied && (
                    <p className="text-[10px] mt-1 text-teal-300/90 flex items-center gap-1">
                      <Sparkles size={10} /> Calibrated from {result.calibration.quotes} of your quote{result.calibration.quotes === 1 ? '' : 's'} (×{result.calibration.factor}){result.calibration.source === 'global' ? ' · cross-process (no direct quotes for this process yet)' : ''}
                    </p>
                  )}
                  {result.simulation && (
                    <div className="mt-3">
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span>P10 {result.simulation.p10}</span>
                        <span className="text-slate-300 font-semibold">P50 {result.simulation.p50}</span>
                        <span>P90 {result.simulation.p90}</span>
                      </div>
                      <div className="relative h-2 rounded-full bg-navy-800 overflow-hidden">
                        <div className="absolute inset-y-0 bg-teal-500/30" style={{ left: '10%', right: '10%' }} />
                        <div className="absolute inset-y-0 w-0.5 bg-teal-300" style={{ left: `${pctPos(result.simulation.p50Value, result.simulation.p10Value, result.simulation.p90Value)}%` }} />
                      </div>
                      <p className="text-slate-500 text-[10px] mt-1">Monte-Carlo (2,000 runs): commodity ±15%, machine ±10%, cycle ±12%, scrap ±2pp · σ {result.symbol || result.currency}{result.simulation.stdev}</p>
                    </div>
                  )}
                </div>

                {/* Teach: feed a real quote so the engine learns this user's prices */}
                <div className="p-3 rounded-xl bg-navy-800/60 border border-white/10">
                  <p className="text-[11px] text-slate-400 mb-2">Know the real quoted price? Teach the engine — it learns your supplier reality and calibrates future estimates.</p>
                  <div className="flex items-center gap-2">
                    <input type="number" value={teachPrice} onChange={e => setTeachPrice(e.target.value)} placeholder={`Actual ${currency}/unit`}
                      className="flex-1 bg-navy-900 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-teal-500/40" />
                    <button onClick={teachQuote} disabled={teaching || !teachPrice}
                      className="text-xs px-3 py-1.5 rounded-lg bg-teal-600/80 hover:bg-teal-500 disabled:opacity-40 text-white font-medium transition-colors whitespace-nowrap">
                      {teaching ? 'Learning…' : 'Teach'}
                    </button>
                  </div>
                  {teachMsg && <p className="text-[10px] mt-1.5 text-teal-300/90">{teachMsg}</p>}
                </div>

                {/* Component breakdown */}
                <div className="space-y-1.5">
                  {BREAKDOWN_META.filter(m => result.breakdown[m.key]).map(m => {
                    const c = result.breakdown[m.key];
                    return (
                      <div key={m.key} className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 w-28 flex-shrink-0">{m.label}</span>
                        <div className="flex-1 h-4 rounded bg-navy-800 overflow-hidden">
                          <div className={`h-full ${m.bar}`} style={{ width: `${Math.max(1, c.pct)}%` }} />
                        </div>
                        <span className={`text-xs font-semibold w-20 text-right ${m.color}`}>{result.symbol || result.currency}{c.value.toFixed(2)}</span>
                        <span className="text-[10px] text-slate-500 w-10 text-right">{c.pct}%</span>
                      </div>
                    );
                  })}
                </div>

                {result.gapVsQuote && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <div className="text-emerald-400 text-sm font-semibold">Gap vs Supplier Quote: {result.gapVsQuote}</div>
                  </div>
                )}

                {/* Predictive volume-cost curve */}
                {result.volumeCurve && result.volumeCurve.length > 0 && (
                  <div>
                    <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Unit Cost vs Annual Volume</div>
                    <div className="space-y-1">
                      {(() => {
                        const max = Math.max(...result.volumeCurve!.map(p => p.unitCost));
                        return result.volumeCurve!.map(p => (
                          <div key={p.volume} className="flex items-center gap-3">
                            <span className="text-[11px] text-slate-500 w-16 text-right tabular-nums">{p.volume.toLocaleString()}</span>
                            <div className="flex-1 h-3.5 rounded bg-navy-800 overflow-hidden">
                              <div className="h-full bg-teal-500/70" style={{ width: `${max > 0 ? (p.unitCost / max) * 100 : 0}%` }} />
                            </div>
                            <span className="text-[11px] text-teal-300 font-semibold w-20 text-right tabular-nums">{p.unitCostLabel}</span>
                          </div>
                        ));
                      })()}
                    </div>
                    <p className="text-slate-600 text-[10px] mt-1">Tooling amortisation breakpoints — unit cost falls as fixed tooling spreads over volume.</p>
                  </div>
                )}
                <div>
                  <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Explanation</div>
                  <p className="text-slate-300 text-sm leading-relaxed">{result.explanation}</p>
                </div>
                {/* Multi-operation route breakdown */}
                {result.route && (
                  <div>
                    <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
                      Routing: {result.route.operations.join(' → ')}
                      <span className="ml-2 text-teal-400 normal-case font-normal">RTY {result.route.rolledThroughputYield}%</span>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-white/10">
                      <table className="w-full text-xs">
                        <thead><tr className="text-slate-500 bg-white/4">
                          <th className="text-left px-3 py-1.5 font-medium">Operation</th>
                          <th className="text-right px-3 py-1.5 font-medium">Conversion</th>
                          <th className="text-right px-3 py-1.5 font-medium">Tooling</th>
                          <th className="text-right px-3 py-1.5 font-medium">Scrap %</th>
                          <th className="text-right px-3 py-1.5 font-medium">Out mass kg</th>
                        </tr></thead>
                        <tbody>
                          {result.route.lines.map((l, i) => (
                            <tr key={i} className="border-t border-white/5 text-slate-300">
                              <td className="px-3 py-1.5">{l.op}</td>
                              <td className="px-3 py-1.5 text-right">{result.symbol || '€'}{l.conversion.toFixed(2)}</td>
                              <td className="px-3 py-1.5 text-right">{result.symbol || '€'}{l.tooling.toFixed(2)}</td>
                              <td className="px-3 py-1.5 text-right">{l.scrapPct}%</td>
                              <td className="px-3 py-1.5 text-right">{l.outMassKg}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* CO2e + CBAM (indicative) */}
                {result.carbon && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px]">
                      🌍 {result.carbon.totalKgCo2e} kg CO2e/part (material {result.carbon.materialKgCo2e} + process {result.carbon.processKgCo2e})
                    </span>
                    {result.carbon.cbam && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px]">
                        CBAM ≈ €{result.carbon.cbam.eur}/part if EU-imported
                      </span>
                    )}
                    <span className="text-slate-600 text-[10px]">{result.carbon.basis}</span>
                  </div>
                )}

                {result.assumptions?.length > 0 && (
                  <div>
                    <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Assumptions &amp; Cost Drivers</div>
                    <ul className="space-y-1">
                      {result.assumptions.map((a, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                          <div className="w-1 h-1 rounded-full bg-teal-400 mt-1.5 flex-shrink-0" />
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="p-3 rounded-xl bg-gold-500/10 border border-gold-500/20">
                  <div className="text-gold-400 text-xs font-semibold mb-1">Negotiation Leverage</div>
                  <p className="text-slate-300 text-xs leading-relaxed">{result.negotiationLeverage}</p>
                </div>

                {/* Export the cost-breakdown-structure (negotiation pack) */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => exportCbs('xlsx')}
                    disabled={exporting}
                    className="py-2.5 rounded-xl bg-white/5 border border-white/15 text-slate-200 text-sm font-semibold hover:bg-white/10 disabled:opacity-50 transition"
                  >
                    {exporting ? 'Generating…' : 'Export CBS (.xlsx)'}
                  </button>
                  <button
                    onClick={() => exportCbs('pptx')}
                    disabled={exporting}
                    className="py-2.5 rounded-xl bg-white/5 border border-white/15 text-slate-200 text-sm font-semibold hover:bg-white/10 disabled:opacity-50 transition"
                  >
                    {exporting ? 'Generating…' : 'Negotiation deck (.pptx)'}
                  </button>
                </div>

                {/* Agentic cost-down — engine-verified alternatives */}
                <div className="pt-2">
                  <button
                    onClick={findCostDown}
                    disabled={cdLoading}
                    className="w-full py-2.5 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-200 text-sm font-semibold hover:bg-teal-500/25 disabled:opacity-50 transition"
                  >
                    {cdLoading ? 'Exploring alternatives on the engine…' : 'Find cost-down ideas (engine-verified)'}
                  </button>
                  {cdError && <p className="text-red-400 text-xs mt-2">{cdError}</p>}
                  {costDown && (
                    <div className="mt-3 space-y-2">
                      <p className="text-slate-500 text-[11px]">{costDown.note}</p>
                      {costDown.alternatives.length === 0 ? (
                        <p className="text-slate-400 text-xs">No cheaper compatible alternative was found for this part — the current design is close to cost-optimal in the modelled space.</p>
                      ) : costDown.alternatives.map((a, i) => (
                        <div key={i} className="p-3 rounded-xl bg-white/4 border border-white/10">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-white text-sm font-medium">{a.material} · {a.process} · {a.region}</div>
                            <div className="text-emerald-400 text-sm font-bold whitespace-nowrap">−{costDown.baseline.currency === 'EUR' ? '€' : ''}{a.saving.toFixed(2)} ({a.savingPct}%)</div>
                          </div>
                          <div className="text-slate-500 text-[11px] mt-0.5">Engine should-cost €{a.total.toFixed(2)}/unit vs €{costDown.baseline.totalShouldCost.toFixed(2)} baseline</div>
                          {a.rationale && <p className="text-slate-300 text-xs mt-1.5">{a.rationale}</p>}
                          {a.risk && <p className="text-amber-300/80 text-[11px] mt-1">Risk: {a.risk}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </div>
        </div>
        <p className="text-center text-slate-600 text-xs">Bottom-up parametric estimate from CostVision rate libraries. Validate against detailed supplier breakdowns before commercial use.</p>
      </div>
    </div>
  );
}

// position (0-100%) of P50 marker within the P10–P90 visual band (clamped 10–90)
function pctPos(p50: number, p10: number, p90: number): number {
  if (p90 <= p10) return 50;
  const frac = (p50 - p10) / (p90 - p10);
  return 10 + Math.min(1, Math.max(0, frac)) * 80;
}
