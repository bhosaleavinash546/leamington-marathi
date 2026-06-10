import { useState } from 'react';
import { TrendingUp, Cpu, Wrench, Building2, ChevronRight } from 'lucide-react';
import {
  MFG_LEVERS,
  EDU_TRENDS,
  OEM_MOVES,
  EDU_COST_STRUCTURE,
  getTotalEduIdeas,
  EDU_COMPONENTS,
} from '../data/edu-knowledge-base';

type Tab = 'trends' | 'manufacturing' | 'oem';

const LEV_COLORS: Record<string, string> = {
  'Layout':        'bg-blue-500/10 text-blue-400 border-blue-500/30',
  'Test':          'bg-purple-500/10 text-purple-400 border-purple-500/30',
  'Assembly':      'bg-teal-500/10 text-teal-400 border-teal-500/30',
  'Quality':       'bg-green-500/10 text-green-400 border-green-500/30',
  'Automation':    'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  'Consolidation': 'bg-gold-500/10 text-gold-400 border-gold-500/30',
  'Logistics':     'bg-orange-500/10 text-orange-400 border-orange-500/30',
  'Energy':        'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  'Tooling':       'bg-red-500/10 text-red-400 border-red-500/30',
  'Process':       'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
  'Material':      'bg-amber-500/10 text-amber-400 border-amber-500/30',
  'Yield':         'bg-lime-500/10 text-lime-400 border-lime-500/30',
  'Standardization': 'bg-pink-500/10 text-pink-400 border-pink-500/30',
  'Spec opt.':     'bg-violet-500/10 text-violet-400 border-violet-500/30',
};

function getLevClass(lev: string) {
  return LEV_COLORS[lev] || 'bg-slate-500/10 text-slate-400 border-slate-500/30';
}

function getTrendStatusClass(status: string) {
  if (status.includes('>800V')) return 'bg-violet-500/10 text-violet-400 border-violet-500/30';
  if (status.startsWith('Mainstream')) return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
  if (status.startsWith('Emerging')) return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  return 'bg-teal-500/10 text-teal-400 border-teal-500/30';
}

export default function TrendsPage() {
  const [tab, setTab] = useState<Tab>('trends');
  const [mfgLevel, setMfgLevel] = useState<'edu' | 'sub' | 'part'>('edu');

  const totalMfgLevers =
    MFG_LEVERS.edu.items.length +
    MFG_LEVERS.sub.items.length +
    MFG_LEVERS.part.items.length;

  const totalTrends =
    EDU_TRENDS.unit.length +
    EDU_TRENDS.sub.length +
    EDU_TRENDS.part.length;

  const TABS: { id: Tab; label: string; icon: typeof TrendingUp }[] = [
    { id: 'trends', label: 'Industry Trends', icon: TrendingUp },
    { id: 'manufacturing', label: 'Manufacturing Levers', icon: Wrench },
    { id: 'oem', label: 'OEM Moves', icon: Building2 },
  ];

  return (
    <div className="min-h-screen bg-navy-950 pt-16">
      {/* Hero */}
      <div className="bg-gradient-to-b from-navy-900 to-navy-950 border-b border-white/8 px-4 py-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gold-500/15 border border-gold-500/30 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={22} className="text-gold-400" />
            </div>
            <div>
              <p className="text-gold-400 text-xs font-semibold uppercase tracking-widest mb-1">
                Electric Drive Unit · Value &amp; Manufacturing Engineering
              </p>
              <h1 className="text-3xl font-bold text-white mb-2">
                EDU Trends &amp; Manufacturing
              </h1>
              <p className="text-slate-400 text-sm max-w-2xl">
                Where the hyper-competitive EDU market is heading — industry trends at unit,
                sub-assembly and part level, three-level manufacturing levers, and the latest
                cost &amp; value-engineering moves from 13 OEMs (2025-26).
              </p>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Components', value: EDU_COMPONENTS.length },
              { label: 'VAVE ideas', value: getTotalEduIdeas() },
              { label: 'Mfg levers', value: totalMfgLevers },
              { label: 'Industry trends', value: totalTrends },
            ].map(({ label, value }) => (
              <div key={label} className="bg-navy-800/60 border border-white/8 rounded-xl px-4 py-3">
                <div className="text-2xl font-bold text-gold-400 font-mono">{value}</div>
                <div className="text-slate-500 text-xs uppercase tracking-widest mt-1">{label}</div>
              </div>
            ))}
          </div>

          {/* EDU Cost Structure */}
          <div className="mt-6 bg-navy-800/40 border border-white/8 rounded-xl p-4">
            <p className="text-slate-400 text-xs uppercase tracking-widest mb-3 font-semibold">
              Indicative EDU cost structure (800V SiC class)
            </p>
            <div className="flex rounded-lg overflow-hidden h-8">
              {EDU_COST_STRUCTURE.map((item) => (
                <div
                  key={item.name}
                  style={{ width: `${item.share}%`, backgroundColor: item.color }}
                  className="flex items-center justify-center text-white text-xs font-bold"
                  title={`${item.name}: ~${item.share}%`}
                >
                  {item.share >= 8 ? `${item.share}%` : ''}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {EDU_COST_STRUCTURE.map((item) => (
                <span key={item.name} className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                  {item.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="sticky top-16 z-30 bg-navy-900/95 backdrop-blur border-b border-white/8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1 py-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  tab === id
                    ? 'bg-gold-500/15 text-gold-400 border border-gold-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* ─── INDUSTRY TRENDS TAB ─── */}
        {tab === 'trends' && (
          <div className="space-y-10">
            {(
              [
                { key: 'unit', label: 'EDU / Unit Level', sub: 'Architecture, voltage class and integration' },
                { key: 'sub', label: 'Sub-Assembly Level', sub: 'Inverter, motor, gearbox, thermal and interface' },
                { key: 'part', label: 'Part Level', sub: 'Component-specific best practice' },
              ] as const
            ).map(({ key, label, sub }) => (
              <section key={key}>
                <div className="flex items-baseline gap-3 mb-4 pb-3 border-b border-white/8">
                  <h2 className="text-lg font-semibold text-white">{label}</h2>
                  <span className="text-slate-500 text-xs font-mono">{sub}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {EDU_TRENDS[key].map((trend) => (
                    <div
                      key={trend.t}
                      className={`bg-navy-800/50 border border-white/8 border-l-2 rounded-xl p-4 ${
                        trend.status.includes('>800V')
                          ? 'border-l-violet-500'
                          : trend.status.startsWith('Mainstream')
                          ? 'border-l-blue-500'
                          : 'border-l-amber-500'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${getTrendStatusClass(trend.status)}`}>
                          {trend.status}
                        </span>
                        <span className="text-xs font-semibold text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5 whitespace-nowrap">
                          {trend.save}
                        </span>
                      </div>
                      <p className="text-white text-sm font-semibold mb-2">{trend.t}</p>
                      <p className="text-slate-400 text-xs leading-relaxed">{trend.dir}</p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* ─── MANUFACTURING LEVERS TAB ─── */}
        {tab === 'manufacturing' && (
          <div>
            <div className="bg-navy-800/40 border border-white/8 border-l-2 border-l-gold-500 rounded-xl p-4 mb-6">
              <h2 className="text-lg font-semibold text-white mb-1">Manufacturing cost reduction</h2>
              <p className="text-slate-400 text-sm max-w-3xl">
                Process- and operations-driven cost levers, organised at three levels. These work
                alongside the component value-engineering ideas: design sets the floor, manufacturing
                realises it. Savings are directional indicators (labour, scrap, cycle-time, throughput,
                capital) for prioritisation.
              </p>
            </div>

            {/* Level selector */}
            <div className="flex gap-2 mb-6">
              {(
                [
                  { id: 'edu', label: 'EDU / Unit Level', count: MFG_LEVERS.edu.items.length },
                  { id: 'sub', label: 'Sub-Assembly', count: MFG_LEVERS.sub.items.length },
                  { id: 'part', label: 'Part Level', count: MFG_LEVERS.part.items.length },
                ] as const
              ).map(({ id, label, count }) => (
                <button
                  key={id}
                  onClick={() => setMfgLevel(id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                    mfgLevel === id
                      ? 'bg-gold-500/15 text-gold-400 border-gold-500/30'
                      : 'text-slate-400 border-white/10 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {label}
                  <span className="text-xs opacity-60">{count}</span>
                </button>
              ))}
            </div>

            {/* Level content */}
            {(['edu', 'sub', 'part'] as const).map((level) => (
              mfgLevel === level && (
                <div key={level}>
                  <div className="mb-4">
                    <h3 className="text-white font-semibold">{MFG_LEVERS[level].title}</h3>
                    <p className="text-slate-400 text-xs mt-0.5">{MFG_LEVERS[level].sub} · {MFG_LEVERS[level].items.length} levers</p>
                  </div>
                  <div className="grid gap-3">
                    {MFG_LEVERS[level].items.map((item, i) => (
                      <div
                        key={i}
                        className="bg-navy-800/50 border border-white/8 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2"
                      >
                        <div>
                          <p className="text-white text-sm font-semibold">{item.t}</p>
                          <p className="text-slate-400 text-xs mt-1">{item.note}</p>
                        </div>
                        <div className="flex sm:flex-col items-start sm:items-end gap-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getLevClass(item.lev)}`}>
                            {item.lev}
                          </span>
                          <span className="text-gold-400 text-xs font-semibold whitespace-nowrap">
                            {item.save}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ))}
          </div>
        )}

        {/* ─── OEM MOVES TAB ─── */}
        {tab === 'oem' && (
          <div>
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-white mb-1">OEM Latest Moves (2025-26)</h2>
              <p className="text-slate-400 text-sm max-w-3xl">
                Brand-by-brand deep dive — the newest electric-drive cost &amp; value-engineering
                levers, drawn from 2025-26 launches and teardowns.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {OEM_MOVES.map((oem) => (
                <div
                  key={oem.brand}
                  className="bg-navy-800/50 border border-white/8 border-l-2 border-l-gold-500 rounded-xl p-4"
                >
                  <div className="mb-3">
                    <p className="text-white font-bold text-base">{oem.brand}</p>
                    <p className="text-gold-500/80 text-xs font-mono uppercase tracking-wide mt-0.5">{oem.model}</p>
                  </div>
                  <ul className="space-y-2">
                    {oem.moves.map((move, i) => (
                      <li key={i} className="flex items-start gap-2 text-slate-400 text-xs leading-relaxed">
                        <ChevronRight size={12} className="text-gold-500 flex-shrink-0 mt-0.5" />
                        {move}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Disclaimer */}
            <div className="mt-8 border-t border-white/8 pt-5 text-slate-600 text-xs">
              Indicative engineering estimates against stated baselines — a prioritisation aid, not
              supplier quotes. Benchmark vehicles are illustrative and should be verified. Source:
              EDU Cost Engineer — VAVE &amp; Manufacturing Ideation. Author: Avinash Bhosale, Senior
              Cost Improvement Engineer (Propulsion).
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
