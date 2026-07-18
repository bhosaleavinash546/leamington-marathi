import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import {
  ArrowRight, TrendingUp, PlayCircle, Cpu, Upload, BarChart3, ShieldCheck,
  Lightbulb, CheckCircle2, ChevronRight, Layers, Sparkles, Gauge, LineChart,
} from 'lucide-react';
import { AUTOMOTIVE_SYSTEMS } from '../data/automotive-catalog';

// ─── Live commodity prices (real /api/prices data) ────────────────────────────
interface LiveCommodity { key: string; label: string; value: number; unit: string; tier: string; }
function useLivePrices() {
  const [items, setItems] = useState<LiveCommodity[]>([]);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/prices').then(r => r.json()).then(data => {
      if (data.prices) {
        setItems(Object.entries(data.prices).map(([key, v]: [string, any]) => ({ key, ...v })));
        setLastRefresh(data.lastRefresh ?? null);
      }
    }).catch(() => {});
  }, []);
  return { items, lastRefresh };
}

// ─── Static content ───────────────────────────────────────────────────────────
const OEMS = ['BMW', 'Mercedes-Benz', 'Audi', 'Porsche', 'Tesla', 'Rivian', 'Lucid'];

const BENTO = [
  {
    span: true, icon: Gauge, title: 'Deterministic should-cost engine',
    desc: 'Bottom-up piece price from real drivers — material, cycle, tooling, overhead — with live commodity prices and Monte-Carlo confidence bands. No black box.',
    bars: [60, 82, 45, 92, 70, 55, 84, 40, 74],
  },
  { icon: Sparkles, title: 'AI idea generation', desc: 'System-aware cost-down ideas, grounded in live prices and OEM benchmarks.' },
  { icon: Upload, title: 'Feature-based CAD-to-cost', desc: 'Upload a model or drawing — cost driven by the geometry itself.', cad: true },
  { icon: Cpu, title: 'Innovation methods', desc: 'Real engineering methods, built in.', chips: ['TRIZ', 'DFA / DFMA', 'Value Eng.', 'Design-to-Cost'] },
  { icon: LineChart, title: 'Analytics & pipeline', desc: 'ROI, confidence and a savings pipeline from idea to committed.' },
];

const STEPS = [
  { n: '1', title: 'Select or upload', desc: 'Pick a vehicle system or drop a CAD model. Set volume, region and currency.' },
  { n: '2', title: 'Generate & cost', desc: 'AI proposes cost-down ideas while the engine prices each one from first principles.' },
  { n: '3', title: 'Verify & decide', desc: 'Every figure is engine-stamped confirmed. Export to sourcing, track in the pipeline.' },
];

// ─── Small helpers ────────────────────────────────────────────────────────────
function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      className={className}
    >{children}</motion.div>
  );
}

const BAR = [
  { w: '46%', c: '#3a5882', label: 'Material 46%' },
  { w: '22%', c: '#E7B43C', label: 'Machine 22%' },
  { w: '9%', c: '#5b7189', label: 'Labour 9%' },
  { w: '12%', c: '#8aa0bd', label: 'Tooling 12%' },
  { w: '11%', c: '#b9c6d8', label: 'Overhead 11%' },
];

function ProductPanel() {
  return (
    <div className="relative">
      {/* AI idea-generation accent */}
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, delay: 0.55, type: 'spring', stiffness: 240, damping: 18 }}
        className="absolute -top-6 right-5 z-20 hidden lg:flex flex-col items-center gap-1.5 pointer-events-none"
      >
        <motion.div
          animate={{ y: [0, -5, 0] }} transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
          className="relative w-14 h-14 rounded-full bg-gradient-to-br from-gold-300 to-gold-600 flex items-center justify-center text-navy-950 shadow-xl shadow-gold-500/40"
        >
          <span className="absolute inset-0 rounded-full ring-8 ring-gold-400/10" />
          <Lightbulb size={26} strokeWidth={2} />
        </motion.div>
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-navy-950 bg-gold-400 px-2.5 py-1 rounded-full shadow-lg shadow-gold-500/30 whitespace-nowrap">
          <Sparkles size={11} /> +3 AI ideas
        </span>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 26, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
        className="rounded-2xl bg-navy-900 border border-white/10 p-5 shadow-2xl shadow-black/40"
      >
        <div className="mb-3">
          <div className="text-slate-300 text-[13px] font-semibold">Front subframe — HPDC Aluminium</div>
          <div className="flex items-center gap-2.5 mt-1">
            <div className="text-white text-3xl font-bold tracking-tight">£42.18 <span className="text-slate-500 text-sm font-medium">/ unit</span></div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Engine-verified
            </span>
          </div>
        </div>
        <div className="flex h-3 rounded-md overflow-hidden border border-white/5 my-3">
          {BAR.map((b, i) => <div key={i} style={{ width: b.w, background: b.c }} />)}
        </div>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11.5px] text-slate-400">
          {BAR.map((b, i) => (
            <span key={i} className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: b.c }} />{b.label}
            </span>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-white/10 space-y-2">
          {[['Material — A380, buy-to-fly 1.9×', '£19.40'], ['HPDC + machining cycle', '£9.28'], ['Tooling (amortised · 250k/yr)', '£5.06']].map(([k, v], i) => (
            <div key={i} className="flex justify-between text-[13px] text-slate-400"><span>{k}</span><b className="text-slate-200 font-semibold">{v}</b></div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2 text-[12.5px] text-gold-300 bg-gold-500/10 border border-gold-500/20 rounded-xl px-3 py-2.5">
          <Sparkles size={14} className="shrink-0 text-gold-400" />
          <span>AI proposed 3 alternatives · engine verified — best saves <b className="text-gold-200">£6.10 (14%)</b></span>
        </div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.5 }}
        className="hidden lg:block absolute -right-4 -bottom-5 rounded-xl bg-navy-800 border border-white/10 px-3 py-2 shadow-xl shadow-black/50"
      >
        <div className="text-[10px] uppercase tracking-wider text-slate-500">Confidence P10–P90</div>
        <div className="text-emerald-400 font-bold text-sm">£38.4 – £47.1</div>
      </motion.div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const { items: livePriceItems, lastRefresh } = useLivePrices();
  const [ideaCount, setIdeaCount] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/marketplace/count').then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && typeof d.count === 'number') setIdeaCount(d.count); }).catch(() => {});
  }, []);

  const METRICS = [
    { num: '13', em: '+', cap: 'Vehicle systems covered' },
    { num: '16', em: '%', cap: 'Feature-based cost error (vs 35% mass)' },
    { num: '100', em: '%', cap: 'Numbers engine-verified' },
    { num: 'Min', em: 's', cap: 'To a costed idea, not weeks' },
  ];

  return (
    <div data-theme="light" className="min-h-screen bg-navy-950">

      {/* ── HERO (dark band) ─────────────────────────────────────────────── */}
      <section data-theme="dark" className="relative bg-hero-gradient overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 right-[12%] w-[520px] h-[520px] bg-gold-500/5 rounded-full blur-3xl" />
          <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
            <defs><pattern id="g" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M 44 0 L 0 0 0 44" fill="none" stroke="white" strokeWidth="1" /></pattern></defs>
            <rect width="100%" height="100%" fill="url(#g)" />
          </svg>
        </div>
        <div className="max-w-6xl mx-auto px-6 lg:px-8 pt-28 pb-24 relative grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <motion.span
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-gold-400"
            ><span className="w-1.5 h-1.5 rounded-full bg-gold-400 ring-4 ring-gold-500/15" /> AI-Powered Cost Engineering</motion.span>

            <motion.h1
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.06 }}
              className="mt-5 text-4xl md:text-5xl lg:text-[3.35rem] font-semibold text-white leading-[1.07] tracking-[-0.022em]"
            >Take cost out of any vehicle part — with numbers you can <span className="text-gold-400">defend</span>.</motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.14 }}
              className="mt-5 text-lg text-slate-300 leading-relaxed max-w-xl"
            >BrainSpark generates whole-vehicle cost-reduction ideas and prices every one of them on a deterministic should-cost engine. Quote-ready savings in minutes, not weeks.</motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-8 flex flex-col sm:flex-row gap-3.5"
            >
              <Link to="/analyze" className="group inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-semibold transition-all hover:scale-[1.03] shadow-xl shadow-gold-500/25">
                Start a free analysis <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link to="/trends" className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white/5 border border-white/12 text-slate-200 hover:bg-white/10 font-semibold transition-all">
                <PlayCircle size={18} /> Watch 2-min demo
              </Link>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.32 }}
              className="mt-7 text-[13px] text-slate-500"
            >Benchmarked against <b className="text-slate-300 font-semibold">BMW · Mercedes-Benz · Audi · Porsche · Rivian · Lucid</b> &amp; more</motion.p>
          </div>
          <ProductPanel />
        </div>
      </section>

      {/* ── OEM trust strip ──────────────────────────────────────────────── */}
      <div className="border-b border-white/10 bg-navy-900">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 py-6 flex flex-wrap items-center justify-center gap-x-9 gap-y-3">
          <span className="text-[12px] uppercase tracking-[0.06em] font-semibold text-slate-500">Benchmarked against world-class OEMs</span>
          {OEMS.map(o => <span key={o} className="text-[16px] font-bold text-slate-400/70 tracking-tight">{o}</span>)}
        </div>
      </div>

      {/* ── BENTO features ───────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 lg:px-8 py-24">
        <Reveal className="max-w-2xl mb-11">
          <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-gold-400"><span className="w-1.5 h-1.5 rounded-full bg-gold-400 ring-4 ring-gold-500/15" /> The platform</span>
          <h2 className="mt-4 text-[2.1rem] font-semibold text-white tracking-[-0.02em] leading-tight">One platform for whole-vehicle cost intelligence</h2>
          <p className="mt-3 text-[17px] text-slate-400">From a part name or a CAD file to a defensible, quote-ready number — across every system and commodity.</p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-[200px]">
          {BENTO.map((t, i) => (
            <Reveal key={t.title} delay={i * 0.06} className={t.span ? 'md:col-span-2' : ''}>
              <div className="h-full rounded-2xl bg-navy-900 border border-white/10 p-6 flex flex-col hover:border-gold-500/25 hover:-translate-y-0.5 transition-all">
                <div className="w-9 h-9 rounded-[10px] bg-gold-500/12 text-gold-400 flex items-center justify-center mb-3.5"><t.icon size={18} /></div>
                <h3 className="text-white font-semibold text-[16.5px] tracking-[-0.01em] mb-1.5">{t.title}</h3>
                <p className="text-slate-400 text-[13.5px] leading-relaxed">{t.desc}</p>
                {t.bars && (
                  <div className="mt-auto flex items-end gap-1.5 h-14">
                    {t.bars.map((h, j) => <div key={j} style={{ height: `${h}%` }} className="flex-1 rounded-t bg-gradient-to-b from-gold-400 to-gold-600/70" />)}
                  </div>
                )}
                {t.cad && <div className="mt-auto h-16 rounded-[10px] border border-dashed border-white/12 bg-white/[0.02] flex items-center justify-center text-slate-500 text-[12px]">STEP · STL · DXF · PDF → cost</div>}
                {t.chips && <div className="mt-auto flex flex-wrap gap-1.5">{t.chips.map(c => <span key={c} className="text-[11.5px] font-semibold text-slate-300 bg-white/5 border border-white/10 px-2.5 py-1 rounded-md">{c}</span>)}</div>}
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── System coverage (real, links into /analyze) ──────────────────── */}
      <section className="border-y border-white/10 bg-navy-900/40">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 py-20">
          <Reveal className="text-center max-w-2xl mx-auto mb-10">
            <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-gold-400"><Layers size={13} /> Whole-vehicle coverage</span>
            <h2 className="mt-4 text-[2rem] font-semibold text-white tracking-[-0.02em]">Every system, one workflow</h2>
            <p className="mt-3 text-[16px] text-slate-400">Pick any system for instant AI-powered cost-reduction analysis.</p>
          </Reveal>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {AUTOMOTIVE_SYSTEMS.map((s, i) => (
              <Reveal key={s.id} delay={i * 0.02}>
                <Link to={`/analyze?system=${s.id}`} className="group flex items-center gap-3 p-3.5 rounded-xl bg-navy-900 border border-white/10 hover:border-gold-500/30 hover:-translate-y-0.5 transition-all">
                  <span className={`w-9 h-9 rounded-lg bg-gradient-to-br ${s.color} flex items-center justify-center text-base shrink-0`}>{s.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-white text-[13.5px] font-semibold leading-tight truncate">{s.name}</span>
                    <span className="block text-slate-500 text-[11.5px]">{s.subassemblies.length} subassemblies</span>
                  </span>
                  <ChevronRight size={15} className="ml-auto text-slate-600 group-hover:text-gold-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 lg:px-8 py-24">
        <Reveal className="text-center max-w-2xl mx-auto mb-12">
          <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-gold-400"><span className="w-1.5 h-1.5 rounded-full bg-gold-400 ring-4 ring-gold-500/15" /> How it works</span>
          <h2 className="mt-4 text-[2.1rem] font-semibold text-white tracking-[-0.02em]">From part to defensible saving in three steps</h2>
        </Reveal>
        <div className="grid md:grid-cols-3 gap-5">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1}>
              <div className="h-full p-6 rounded-2xl bg-navy-900 border border-white/10">
                <div className="w-9 h-9 rounded-[10px] bg-gold-500 text-navy-950 font-bold flex items-center justify-center mb-4">{s.n}</div>
                <h3 className="text-white font-semibold text-[16.5px] mb-1.5">{s.title}</h3>
                <p className="text-slate-400 text-[14px] leading-relaxed">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Metrics ──────────────────────────────────────────────────────── */}
      <section className="border-y border-white/10 bg-navy-900">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 py-16 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {METRICS.map((m, i) => (
            <Reveal key={m.cap} delay={i * 0.06}>
              <div className="text-[2.75rem] font-bold text-white tracking-[-0.03em] leading-none">{m.num}<em className="not-italic text-gold-400">{m.em}</em></div>
              <div className="mt-2 text-[13.5px] text-slate-400">{m.cap}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Trust callout ────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 lg:px-8 py-24">
        <Reveal>
          <div className="rounded-2xl bg-navy-900 border border-white/10 p-10 grid md:grid-cols-[1.3fr_1fr] gap-10 items-center">
            <div>
              <ShieldCheck size={26} className="text-gold-400 mb-4" />
              <p className="text-[22px] font-semibold text-white leading-snug tracking-[-0.01em]">"AI proposes, the deterministic engine verifies — so a saving we show a supplier is a number our engineers can <span className="text-gold-400">reproduce and defend</span>."</p>
              <p className="mt-4 text-[14px] text-slate-400">The trust architecture behind every BrainSpark figure</p>
            </div>
            <div className="text-center md:border-l border-white/10 md:pl-10">
              <div className="text-[3.75rem] font-extrabold text-gold-400 leading-none tracking-[-0.03em]">2×</div>
              <div className="mt-2 text-[14px] text-slate-400">more accurate than a mass-based estimate on held-out parts</div>
            </div>
          </div>
        </Reveal>

        {/* live commodity strip (real data) */}
        {livePriceItems.length > 0 && (
          <Reveal delay={0.1} className="mt-5">
            <div className="rounded-2xl bg-navy-900 border border-white/10 px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 size={12} className="text-slate-500" />
                <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Live commodity prices</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="flex-1" />
                {lastRefresh && <span className="text-[11px] text-slate-500">Refreshed {new Date(lastRefresh).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</span>}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {livePriceItems.slice(0, 9).map(c => (
                  <span key={c.key} className="inline-flex items-center gap-1.5 text-[12.5px]">
                    <span className="text-slate-400">{c.label}</span>
                    <span className="text-white font-mono font-semibold">{c.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                    <span className="text-slate-500">{c.unit}</span>
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        )}
      </section>

      {/* ── CTA band (dark) ──────────────────────────────────────────────── */}
      <section data-theme="dark" className="relative bg-hero-gradient overflow-hidden">
        <div className="absolute inset-0 pointer-events-none"><div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gold-500/12 rounded-full blur-3xl" /></div>
        <div className="max-w-3xl mx-auto px-6 text-center py-20 relative">
          <Reveal>
            <h2 className="text-[2.4rem] font-semibold text-white tracking-[-0.02em]">Put whole-vehicle cost intelligence to work</h2>
            <p className="mt-3.5 text-lg text-slate-300">Run a live pilot on one part family this week{ideaCount ? ` — start from ${ideaCount.toLocaleString()} benchmarked ideas` : ''}.</p>
            <div className="mt-7 flex flex-col sm:flex-row gap-3.5 justify-center">
              <Link to="/analyze" className="group inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-semibold transition-all hover:scale-[1.03] shadow-xl shadow-gold-500/25">
                Start a free analysis <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link to="/trends" className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white/5 border border-white/12 text-slate-200 hover:bg-white/10 font-semibold transition-all">
                <TrendingUp size={18} /> Explore trends
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12.5px] text-slate-400">
              {['Whole-vehicle coverage', 'Engine-verified numbers', 'Excel · PPT · PDF export'].map(t => (
                <span key={t} className="inline-flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-400" /> {t}</span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
