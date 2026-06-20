import { useState } from 'react';
import { motion } from 'framer-motion';
import { Calculator, ChevronDown, Loader2 } from 'lucide-react';

const MATERIALS = ['Steel (mild)', 'Steel (high-strength)', 'Aluminium 6061', 'Aluminium 7075', 'Magnesium AZ31', 'Polypropylene (PP)', 'PA6 (Nylon)', 'ABS', 'CFRP (Carbon Fibre)', 'Stainless Steel 304'];
const PROCESSES = ['Stamping / Deep Drawing', 'Die Casting (Aluminium)', 'Die Casting (Zinc)', 'Injection Moulding', 'Roll Forming', 'Hydroforming', 'Laser Cutting + Bending', 'Forging (Hot)', 'Forging (Cold)', 'Machining (CNC)', 'MIG Welding Assembly', 'Resistance Spot Welding', 'Extrusion'];
const REGIONS = ['UK', 'Germany', 'Czech Republic', 'Spain', 'Mexico', 'USA', 'China', 'India', 'Korea'];
const CURRENCIES = ['EUR', 'GBP', 'USD', 'CNY'];

interface ShouldCostResult {
  materialCost: string;
  processCost: string;
  overheadCost: string;
  totalShouldCost: string;
  gapVsQuote?: string;
  explanation: string;
  assumptions: string[];
  negotiationLeverage: string;
}

export default function ShouldCostPage() {
  const [partName, setPartName] = useState('');
  const [material, setMaterial] = useState(MATERIALS[0]);
  const [process, setProcess] = useState(PROCESSES[0]);
  const [weightKg, setWeightKg] = useState('');
  const [annualVolume, setAnnualVolume] = useState('');
  const [quotedCost, setQuotedCost] = useState('');
  const [region, setRegion] = useState(REGIONS[0]);
  const [currency, setCurrency] = useState(CURRENCIES[0]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ShouldCostResult | null>(null);
  const [error, setError] = useState('');

  async function handleCalc() {
    const apiKey = localStorage.getItem('brainspark_api_key') || '';
    if (!apiKey) { setError('No API key found. Run an analysis first on the Analyze page.'); return; }
    if (!partName || !weightKg || !annualVolume) { setError('Please fill in part name, weight, and annual volume.'); return; }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const r = await fetch('/api/should-cost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partName, material, process, weightKg: Number(weightKg), annualVolume: Number(annualVolume), quotedCost: quotedCost ? Number(quotedCost) : undefined, region, currency, apiKey }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Request failed'); }
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
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-500/15 border border-teal-500/25 mb-4">
            <Calculator size={28} className="text-teal-400" />
          </div>
          <h1 className="text-4xl font-black text-white mb-3">Should-Cost Engine</h1>
          <p className="text-slate-400">Parametric bottom-up cost modelling — understand what a part <em>should</em> cost before your next supplier negotiation.</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Inputs */}
          <div className="bg-navy-900 rounded-2xl border border-white/10 p-6 space-y-4">
            <h2 className="text-white font-semibold mb-4 flex items-center gap-2"><Calculator size={16} className="text-teal-400" /> Part Parameters</h2>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Part / Component Name</label>
              <input value={partName} onChange={e => setPartName(e.target.value)} placeholder="e.g. Front Door Inner Panel" className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-teal-500/40" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Material</label>
                <div className="relative">
                  <select value={material} onChange={e => setMaterial(e.target.value)} className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm appearance-none focus:outline-none focus:border-teal-500/40">
                    {MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-3 text-slate-500 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Manufacturing Process</label>
                <div className="relative">
                  <select value={process} onChange={e => setProcess(e.target.value)} className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm appearance-none focus:outline-none focus:border-teal-500/40">
                    {PROCESSES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-3 text-slate-500 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Part Weight (kg)</label>
                <input type="number" value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="e.g. 4.2" className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-teal-500/40" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Annual Volume</label>
                <input type="number" value={annualVolume} onChange={e => setAnnualVolume(e.target.value)} placeholder="e.g. 80000" className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-teal-500/40" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Plant Region</label>
                <div className="relative">
                  <select value={region} onChange={e => setRegion(e.target.value)} className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm appearance-none focus:outline-none focus:border-teal-500/40">
                    {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-3 text-slate-500 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Currency</label>
                <div className="relative">
                  <select value={currency} onChange={e => setCurrency(e.target.value)} className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm appearance-none focus:outline-none focus:border-teal-500/40">
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-3 text-slate-500 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Supplier Quote (optional)</label>
                <input type="number" value={quotedCost} onChange={e => setQuotedCost(e.target.value)} placeholder="e.g. 28.50" className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-teal-500/40" />
              </div>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button onClick={handleCalc} disabled={loading || !partName || !weightKg || !annualVolume}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-semibold text-sm transition-all hover:scale-[1.02]">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Calculating...</> : <><Calculator size={16} /> Calculate Should-Cost</>}
            </button>
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
                <Loader2 size={32} className="text-teal-400 animate-spin" />
                <p className="text-slate-400 text-sm">AI is building your should-cost model…</p>
              </div>
            )}
            {result && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <h3 className="text-white font-semibold flex items-center gap-2"><Calculator size={16} className="text-teal-400" /> Should-Cost Breakdown</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Material Cost', value: result.materialCost, color: 'text-blue-400' },
                    { label: 'Process Cost', value: result.processCost, color: 'text-purple-400' },
                    { label: 'Overhead / Margin', value: result.overheadCost, color: 'text-amber-400' },
                    { label: 'Total Should-Cost', value: result.totalShouldCost, color: 'text-teal-400' },
                  ].map(item => (
                    <div key={item.label} className="p-3 rounded-xl bg-white/5 border border-white/8">
                      <div className="text-slate-500 text-xs mb-1">{item.label}</div>
                      <div className={`font-bold text-lg ${item.color}`}>{item.value}</div>
                    </div>
                  ))}
                </div>
                {result.gapVsQuote && (
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <div className="text-emerald-400 text-sm font-semibold">Gap vs Supplier Quote: {result.gapVsQuote}</div>
                  </div>
                )}
                <div>
                  <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Explanation</div>
                  <p className="text-slate-300 text-sm leading-relaxed">{result.explanation}</p>
                </div>
                {result.assumptions && result.assumptions.length > 0 && (
                  <div>
                    <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Assumptions</div>
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
        <p className="text-center text-slate-600 text-xs">Should-cost is an engineering estimate based on parametric models. Always validate with detailed supplier breakdown analysis.</p>
      </div>
    </div>
  );
}
