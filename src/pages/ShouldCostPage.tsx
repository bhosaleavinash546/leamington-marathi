import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calculator, ChevronDown, Cpu, ShieldCheck } from 'lucide-react';
import ButtonSpinner from '../components/ui/ButtonSpinner';
import { useAuth } from '../contexts/AuthContext';

const CURRENCIES = ['EUR', 'GBP', 'USD', 'CNY'];

// Fallback catalogues (overridden by /api/should-cost/catalogue on mount)
const FALLBACK_MATERIALS = ['Steel (mild)', 'Steel (high-strength)', 'Stainless Steel 304', 'Aluminium 6061', 'Aluminium 7075', 'Magnesium AZ31', 'Polypropylene (PP)', 'PA6 (Nylon)', 'ABS', 'CFRP (Carbon Fibre)'];
const FALLBACK_PROCESSES = ['Stamping / Deep Drawing', 'Roll Forming', 'Hydroforming', 'Laser Cutting + Bending', 'Die Casting (Aluminium)', 'Die Casting (Zinc)', 'Injection Moulding', 'Forging (Hot)', 'Forging (Cold)', 'Machining (CNC)', 'Extrusion', 'MIG Welding Assembly', 'Resistance Spot Welding'];
const FALLBACK_REGIONS = ['Germany', 'UK', 'Czech Republic', 'Spain', 'Mexico', 'USA', 'China', 'India', 'Korea'];

interface CostComponent { value: number; pct: number; }
interface ShouldCostResult {
  engine: string;
  currency: string;
  materialCost: string;
  processCost: string;
  overheadCost: string;
  totalShouldCost: string;
  totalValue: number;
  gapVsQuote?: string;
  breakdown: Record<string, CostComponent>;
  drivers: Record<string, number>;
  simulation: { p10: string; p50: string; p90: string; p10Value: number; p50Value: number; p90Value: number; stdev: number };
  assumptions: string[];
  explanation: string;
  negotiationLeverage: string;
}

const BREAKDOWN_META: { key: string; label: string; color: string; bar: string }[] = [
  { key: 'material',  label: 'Material',          color: 'text-blue-400',   bar: 'bg-blue-500' },
  { key: 'machine',   label: 'Machine',           color: 'text-purple-400', bar: 'bg-purple-500' },
  { key: 'labour',    label: 'Labour',            color: 'text-pink-400',   bar: 'bg-pink-500' },
  { key: 'setup',     label: 'Setup',             color: 'text-cyan-400',   bar: 'bg-cyan-500' },
  { key: 'tooling',   label: 'Tooling (amort.)',  color: 'text-indigo-400', bar: 'bg-indigo-500' },
  { key: 'overhead',  label: 'Overhead',          color: 'text-amber-400',  bar: 'bg-amber-500' },
  { key: 'sgaProfit', label: 'SG&A / Profit',     color: 'text-emerald-400',bar: 'bg-emerald-500' },
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
  const [currency, setCurrency] = useState(CURRENCIES[0]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ShouldCostResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/should-cost/catalogue')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        if (Array.isArray(d.materials) && d.materials.length) { setMaterials(d.materials); setMaterial(d.materials[0]); }
        if (Array.isArray(d.processes) && d.processes.length) { setProcesses(d.processes); setProcess(d.processes[0]); }
        if (Array.isArray(d.regions) && d.regions.length) { setRegions(d.regions); setRegion(d.regions[0]); }
      })
      .catch(() => {});
  }, []);

  async function handleCalc() {
    if (!partName || !weightKg || !annualVolume) { setError('Please fill in part name, weight, and annual volume.'); return; }
    if (!token) { setError('Please sign in to use the should-cost engine.'); return; }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      // apiKey is optional — only used for AI narrative; the numbers are deterministic.
      const apiKey = localStorage.getItem('brainspark_api_key') || undefined;
      const r = await fetch('/api/should-cost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ partName, material, process, weightKg: Number(weightKg), annualVolume: Number(annualVolume), quotedCost: quotedCost ? Number(quotedCost) : undefined, region, currency, apiKey }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Request failed'); }
      const data = await r.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Calculation failed');
    } finally {
      setLoading(false);
    }
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
                    {processes.map(p => <option key={p} value={p}>{p}</option>)}
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
                  <select id="sc-currency" value={currency} onChange={e => setCurrency(e.target.value)} className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm appearance-none focus:outline-none focus:border-teal-500/40">
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
                      <p className="text-slate-500 text-[10px] mt-1">Monte-Carlo (2,000 runs): commodity ±15%, machine ±10%, cycle ±12%, scrap ±2pp · σ {result.currency} {result.simulation.stdev}</p>
                    </div>
                  )}
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
                        <span className={`text-xs font-semibold w-20 text-right ${m.color}`}>{result.currency} {c.value.toFixed(2)}</span>
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
                <div>
                  <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Explanation</div>
                  <p className="text-slate-300 text-sm leading-relaxed">{result.explanation}</p>
                </div>
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
