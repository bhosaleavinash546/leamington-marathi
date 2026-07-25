import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Telescope, Sparkles, Landmark, Factory, ChevronDown, ChevronUp, Radar } from 'lucide-react';
import ButtonSpinner from '../components/ui/ButtonSpinner';
import { useAuth } from '../contexts/AuthContext';

// BrainSpark Horizon — technology foresight for any part/commodity across
// ICE/MHEV/PHEV/BEV. Every number on this page is deterministic (curated
// register + S-curve/Bass/Wright cores); the AI writes the briefing only.

interface RegAnchor { id: string; name: string; year: number; region: string; effect: string; }
interface Projection { basis: string; adoption: Record<string, number>; costIndex: Record<string, number>; }
interface TechCard {
  id: string; name: string; commodity: string; powertrains: string[]; replaces: string;
  trl: number; adoptionPct: number; firstProduction?: string; drivers: string[];
  costTrend: string; players: string[]; note: string;
  phase: string; horizon: 'H1' | 'H2' | 'H3'; regPulled: boolean; momentum: number;
  confidence: 'committed' | 'probable' | 'speculative';
  regAnchorDetail: RegAnchor | null; projection: Projection;
}
interface HorizonWindow { label: string; from: number; to: number | null; }
interface ForesightResult {
  query: string; commodity: string | null; powertrain: string | null;
  matchedByTerms: boolean; count: number;
  windows: { H1: HorizonWindow; H2: HorizonWindow; H3: HorizonWindow };
  horizons: { H1: TechCard[]; H2: TechCard[]; H3: TechCard[] };
  anchors: RegAnchor[];
  narrative: { briefing: string; signals: Array<{ techId: string; watch: string }> } | null;
  narrativeNote?: string | null;
  note?: string;
}
interface Catalogue { commodities: string[]; powertrains: string[]; technologies: number; vintage: number; }

const EXAMPLES = ['BEV HV battery', 'EDU stator assembly', 'Inverter', 'Suspension', 'BIW underbody', 'Headlamps', 'Cockpit display', 'Seats', 'Wiring harness', 'HVAC / heat pump'];

const CONFIDENCE_STYLE: Record<TechCard['confidence'], string> = {
  committed: 'bg-gold-500/15 border-gold-500/30 text-gold-300',
  probable: 'bg-teal-500/10 border-teal-500/30 text-teal-300',
  speculative: 'bg-white/5 border-white/15 text-slate-400',
};
const PHASE_LABEL: Record<string, string> = {
  research: 'Research', demonstration: 'Demonstration', takeoff: 'Take-off', growth: 'Growth', mainstream: 'Mainstream',
};
const TREND_LABEL: Record<string, { text: string; cls: string }> = {
  'falling-fast': { text: 'cost ↓↓', cls: 'text-emerald-400' },
  falling: { text: 'cost ↓', cls: 'text-emerald-300' },
  flat: { text: 'cost →', cls: 'text-slate-400' },
  rising: { text: 'cost ↑', cls: 'text-amber-400' },
};

function TechCardView({ c, signal }: { c: TechCard; signal?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-navy-900 border border-white/10 rounded-2xl p-4 hover:border-gold-500/25 transition-all">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h3 className="text-white font-semibold text-sm leading-snug">{c.name}</h3>
        <span className={`shrink-0 px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wide ${CONFIDENCE_STYLE[c.confidence]}`}>{c.confidence}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] mb-2">
        <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">TRL {c.trl}</span>
        <span className="text-slate-400">{PHASE_LABEL[c.phase] ?? c.phase}</span>
        <span className={TREND_LABEL[c.costTrend]?.cls ?? 'text-slate-400'}>{TREND_LABEL[c.costTrend]?.text}</span>
        <span className="text-slate-500">{c.powertrains.join(' · ')}</span>
      </div>
      {/* Momentum bar — deterministic 0-100 */}
      <div className="flex items-center gap-2 mb-2" title="Momentum: maturity + adoption + cost trajectory + drivers + regulation + production evidence">
        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-gold-400" style={{ width: `${c.momentum}%` }} />
        </div>
        <span className="text-slate-500 text-[10px] w-14 text-right">momentum {c.momentum}</span>
      </div>
      <p className="text-slate-400 text-xs leading-relaxed mb-1.5">{c.note}</p>
      <p className="text-slate-500 text-[11px] mb-1"><span className="text-slate-600">Replaces:</span> {c.replaces}</p>
      {c.firstProduction && <p className="text-emerald-300/80 text-[11px] mb-1 flex items-center gap-1"><Factory size={11} className="shrink-0" /> {c.firstProduction}</p>}
      {c.regAnchorDetail && (
        <p className="text-gold-300/90 text-[11px] mb-1 flex items-center gap-1">
          <Landmark size={11} className="shrink-0" /> {c.regAnchorDetail.name} ({c.regAnchorDetail.year}){c.regPulled ? ' — pulls this forward' : ''}
        </p>
      )}
      {signal && <p className="text-teal-300 text-[11px] mb-1 flex items-center gap-1"><Radar size={11} className="shrink-0" /> Watch: {signal}</p>}
      <p className="text-slate-600 text-[11px]">{c.players.join(' · ')}</p>

      <button onClick={() => setOpen(o => !o)} className="mt-2 flex items-center gap-1 text-slate-500 text-[11px] hover:text-slate-300">
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {open ? 'Hide' : 'Show'} modelled projection
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-navy-800/70 border border-white/5 p-3">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-slate-500">
                <th className="text-left font-medium pb-1"> </th>
                <th className="text-right font-medium pb-1">Now</th>
                <th className="text-right font-medium pb-1">+3y</th>
                <th className="text-right font-medium pb-1">+5y</th>
                <th className="text-right font-medium pb-1">+8y</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              <tr>
                <td className="text-slate-500 py-0.5">Adoption %</td>
                <td className="text-right">{c.projection.adoption.now}</td>
                <td className="text-right">{c.projection.adoption.in3}</td>
                <td className="text-right">{c.projection.adoption.in5}</td>
                <td className="text-right">{c.projection.adoption.in8}</td>
              </tr>
              <tr>
                <td className="text-slate-500 py-0.5">Cost index</td>
                <td className="text-right">{c.projection.costIndex.now.toFixed(2)}</td>
                <td className="text-right">{c.projection.costIndex.in3.toFixed(2)}</td>
                <td className="text-right">{c.projection.costIndex.in5.toFixed(2)}</td>
                <td className="text-right">{c.projection.costIndex.in8.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-slate-600 text-[10px] mt-1.5">{c.projection.basis}</p>
        </div>
      )}
    </div>
  );
}

export default function ForesightPage() {
  const { token } = useAuth();
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [query, setQuery] = useState('');
  const [commodity, setCommodity] = useState('');
  const [powertrain, setPowertrain] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ForesightResult | null>(null);

  useEffect(() => {
    fetch('/api/foresight/catalogue').then(r => r.json()).then(setCatalogue).catch(() => {});
  }, []);

  async function predict() {
    if (!query.trim() && !commodity) { setError('Type a part or pick a commodity.'); return; }
    if (!token) { setError('Please sign in.'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const apiKey = localStorage.getItem('brainspark_api_key') || undefined;
      const r = await fetch('/api/foresight/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query, commodity: commodity || undefined, powertrain: powertrain || undefined, apiKey }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Foresight failed.');
      setResult(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Foresight failed.');
    } finally {
      setLoading(false);
    }
  }

  const signalFor = (id: string) => result?.narrative?.signals.find(s => s.techId === id)?.watch;
  const lanes: Array<{ key: 'H1' | 'H2' | 'H3'; title: string }> = [
    { key: 'H1', title: 'Horizon 1 — adopt/quote now' },
    { key: 'H2', title: 'Horizon 2 — plan the transition' },
    { key: 'H3', title: 'Horizon 3 — track, don’t commit' },
  ];

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gold-500/15 border border-gold-500/25 mb-4">
            <Telescope size={28} className="text-gold-400" />
          </div>
          <h1 className="text-4xl font-black text-white mb-3">BrainSpark Horizon</h1>
          <p className="text-slate-400 max-w-2xl mx-auto">
            Which technologies will reshape this part — and when? A curated register of {catalogue?.technologies ?? '60+'} technologies with automotive TRL, adoption and dated regulations, positioned by <span className="text-white">deterministic S-curve, Bass-diffusion and Wright's-law models</span>. The AI narrates; it never invents a number.
          </p>
        </div>

        {/* Input */}
        <div className="bg-navy-900 border border-white/10 rounded-2xl p-6 mb-6 max-w-4xl mx-auto">
          <div className="grid sm:grid-cols-[1fr_auto] gap-3">
            <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && predict()}
              placeholder='Part or assembly — e.g. "BEV HV battery", "stator", "headlamps"'
              className="bg-navy-800 border border-white/15 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/50" />
            <select value={commodity} onChange={e => setCommodity(e.target.value)} aria-label="Commodity"
              className="bg-navy-800 border border-white/15 rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:border-gold-500/40">
              <option value="">All commodities</option>
              {(catalogue?.commodities ?? []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-slate-500 text-xs mr-1">Powertrain:</span>
            {['', ...(catalogue?.powertrains ?? ['ICE', 'MHEV', 'PHEV', 'BEV'])].map(p => (
              <button key={p || 'all'} onClick={() => setPowertrain(p)}
                className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${powertrain === p ? 'bg-gold-500/15 border-gold-500/40 text-gold-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'}`}>
                {p || 'All'}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {EXAMPLES.map(ex => (
              <button key={ex} onClick={() => setQuery(ex)}
                className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-400 text-xs hover:border-gold-500/40 hover:text-gold-300 transition-colors">
                {ex}
              </button>
            ))}
          </div>
          {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
          <button onClick={predict} disabled={loading}
            className="w-full mt-5 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-950 font-semibold transition-all">
            {loading ? <><ButtonSpinner size={16} /> Mapping the horizon…</> : <><Sparkles size={18} /> Predict Future Technologies</>}
          </button>
        </div>

        {/* Results */}
        {result && result.count === 0 && (
          <p className="text-center text-slate-500 text-sm max-w-xl mx-auto">{result.note}</p>
        )}
        {result && result.count > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* Analyst briefing (LLM, grounded) or honest degradation note */}
            {result.narrative?.briefing && (
              <div className="bg-navy-900 border border-gold-500/20 rounded-2xl p-5 max-w-4xl mx-auto">
                <p className="text-slate-500 text-xs uppercase tracking-wider mb-2">Analyst briefing <span className="normal-case tracking-normal">(AI-written, grounded in the cards below)</span></p>
                <p className="text-slate-300 text-sm leading-relaxed">{result.narrative.briefing}</p>
              </div>
            )}
            {result.narrativeNote && <p className="text-center text-slate-500 text-xs max-w-xl mx-auto">{result.narrativeNote}</p>}

            {/* Regulatory anchors in play */}
            {result.anchors.length > 0 && (
              <div className="max-w-4xl mx-auto">
                <p className="text-slate-500 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5"><Landmark size={12} /> Regulations shaping this landscape (dated commitments, not predictions)</p>
                <div className="flex flex-wrap gap-2">
                  {result.anchors.map(a => (
                    <span key={a.id} title={a.effect} className="px-2.5 py-1 rounded-lg bg-gold-500/5 border border-gold-500/20 text-gold-300/90 text-xs">
                      {a.name} · {a.year} · {a.region}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Three horizon lanes */}
            <div className="grid lg:grid-cols-3 gap-4 items-start">
              {lanes.map(lane => (
                <div key={lane.key} className="bg-navy-900/50 border border-white/5 rounded-2xl p-3">
                  <div className="px-1 pb-2 mb-1 border-b border-white/5">
                    <h2 className="text-white font-bold text-sm">{lane.title}</h2>
                    <p className="text-slate-500 text-xs">{result.windows[lane.key].label} · {result.horizons[lane.key].length} technologies</p>
                  </div>
                  <div className="space-y-3 mt-2">
                    {result.horizons[lane.key].length === 0 && <p className="text-slate-600 text-xs px-1 py-2">Nothing in this window for this selection.</p>}
                    {result.horizons[lane.key].map(c => <TechCardView key={c.id} c={c} signal={signalFor(c.id)} />)}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-slate-600 text-xs text-center max-w-3xl mx-auto">{result.note}</p>
          </motion.div>
        )}

        {!result && !loading && (
          <p className="text-center text-slate-600 text-xs mt-8">
            Curated register · automotive TRL 1–9 · Bass diffusion (p=0.03, q=0.38) · Wright's-law cost curves · dated regulatory anchors · committed / probable / speculative confidence tiers
          </p>
        )}
      </div>
    </div>
  );
}
