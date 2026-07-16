import { Link } from 'react-router-dom';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import {
  ArrowRight, Zap, BarChart3, FileDown, Upload, Cpu, Shield, ChevronRight,
  TrendingDown, TrendingUp, Activity, Globe, Layers, Award, RefreshCw,
  DollarSign, Target, CheckCircle2, Lightbulb, Star, Clock, Cog,
  Link2, Car, Plug, SlidersHorizontal, FlaskConical, Download
} from 'lucide-react';
import { AUTOMOTIVE_SYSTEMS } from '../data/automotive-catalog';
import { useEffect, useRef, useState } from 'react';

// ─── Animated Counter Hook ────────────────────────────────────────────────────

function useCounter(target: number, duration = 2000, startOnMount = true) {
  const [value, setValue] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (!startOnMount || started.current) return;
    started.current = true;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration, startOnMount]);
  return value;
}

// ─── Animated KPI Card ────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, suffix = '', prefix = '', trend, trendLabel, color, delay = 0,
}: {
  icon: typeof Zap; label: string; value: number; suffix?: string; prefix?: string;
  trend?: 'up' | 'down'; trendLabel?: string; color: string; delay?: number;
}) {
  const count = useCounter(value, 1800);
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      whileHover={{ y: -4, scale: 1.02, transition: { type: 'spring', stiffness: 380, damping: 28 } }}
      className="relative group overflow-hidden rounded-2xl bg-navy-900 border border-white/10 p-5 cursor-default"
    >
      {/* Hover glow */}
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-[0.06] transition-opacity duration-500 bg-gradient-to-br ${color}`} />
      <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${color} opacity-60 group-hover:opacity-100 transition-opacity`} />

      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg`}>
          <Icon size={18} className="text-white" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
            trend === 'up' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
          }`}>
            {trend === 'up' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {trendLabel}
          </div>
        )}
      </div>

      <div className="text-3xl font-black text-white mb-1 tabular-nums">
        {prefix}{count.toLocaleString()}{suffix}
      </div>
      <div className="text-slate-400 text-sm font-medium">{label}</div>
    </motion.div>
  );
}

// ─── Example Analyses ─────────────────────────────────────────────────────────

const ACTIVITY_ITEMS = [
  { system: 'Electric Drive Unit', action: '16 cost reduction ideas generated', saving: '£2.04M/yr', domain: 'Powertrain', color: 'text-gold-400' },
  { system: 'BIW Stamping', action: 'Hot-stamp consolidation opportunity', saving: '£0.94M/yr', domain: 'Body Structure', color: 'text-indigo-400' },
  { system: 'Battery Pack', action: 'CTP architecture benchmarking', saving: '£3.23M/yr', domain: 'Energy Storage', color: 'text-emerald-400' },
  { system: 'Transmission & Driveline', action: 'ZF 8HP fleet rebate analysis', saving: '£0.77M/yr', domain: 'Driveline', color: 'text-rose-400' },
  { system: 'Thermal & HVAC', action: 'Heat pump integration study', saving: '£1.36M/yr', domain: 'Thermal', color: 'text-cyan-400' },
  { system: 'Powertrain ICE', action: 'Turbo housing consolidation', saving: '£0.59M/yr', domain: 'Powertrain', color: 'text-orange-400' },
  { system: 'Interior Systems', action: 'IP carrier right-sizing', saving: '£1.1M/yr', domain: 'Interior', color: 'text-amber-400' },
  { system: 'Chassis & Frame', action: 'Aluminium knuckle topology optimisation', saving: '£0.42M/yr', domain: 'Chassis', color: 'text-blue-400' },
];

function ExampleAnalyses() {
  return (
    <div className="space-y-2">
      {ACTIVITY_ITEMS.map((item, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: i * 0.05 }}
          className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/8 hover:border-white/15 hover:bg-white/6 transition-all group cursor-default"
        >
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${item.color.replace('text-', 'bg-')} group-hover:scale-125 transition-transform`} />
          <div className="flex-1 min-w-0">
            <span className={`text-xs font-semibold ${item.color}`}>{item.system}</span>
            <p className="text-slate-400 text-xs">{item.action}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-green-400 text-xs font-bold">{item.saving}</div>
            <div className="text-slate-600 text-[10px]">{item.domain}</div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Commodity Ticker ─────────────────────────────────────────────────────────

interface LiveCommodity { key: string; label: string; value: number; unit: string; category: string; tier: string; }

const TIER_DOT: Record<string, string> = {
  exchange:   'bg-emerald-400',
  spot:       'bg-gold-400',
  indicative: 'bg-slate-500',
};

function useLivePrices() {
  const [items, setItems] = useState<LiveCommodity[]>([]);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/prices')
      .then(r => r.json())
      .then(data => {
        if (data.prices) {
          setItems(Object.entries(data.prices).map(([key, v]: [string, any]) => ({ key, ...v })));
          setLastRefresh(data.lastRefresh ?? null);
        }
      })
      .catch(() => {});
  }, []);
  return { items, lastRefresh };
}

function CommodityTicker({ items }: { items: LiveCommodity[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || items.length === 0) return;
    let offset = 0;
    const speed = 0.35;
    let raf: number;
    const tick = () => {
      offset -= speed;
      if (Math.abs(offset) >= el.scrollWidth / 2) offset = 0;
      el.style.transform = `translateX(${offset}px)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [items]);

  const displayItems = [...items, ...items];

  return (
    <div className="overflow-hidden relative">
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-navy-950 to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-navy-950 to-transparent z-10 pointer-events-none" />
      <div ref={ref} className="flex gap-8 whitespace-nowrap will-change-transform">
        {displayItems.map((c, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${TIER_DOT[c.tier] ?? 'bg-slate-500'}`} />
            <span className="text-slate-400 font-medium">{c.label}</span>
            <span className="text-white font-bold font-mono">{c.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
            <span className="text-slate-500">{c.unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


// ─── Benchmark Panel ──────────────────────────────────────────────────────────

const BENCHMARKS = [
  { label: 'ZF 8HP fleet rebate', value: '£272/unit', icon: Cog, domain: 'Transmission' },
  { label: 'BYD 8-in-1 EDU saving', value: '−30% BOM', icon: Zap, domain: 'EDU' },
  { label: 'CF propshaft vs steel', value: '−6 kg', icon: Link2, domain: 'Driveline' },
  { label: 'SiC die shrink (800V)', value: '−25% area', icon: Lightbulb, domain: 'Inverter' },
  { label: 'Al A380 diff housing', value: '−6.2 kg', icon: Car, domain: 'Chassis' },
  { label: 'Hairpin vs round-wire', value: '−15% Cu', icon: Plug, domain: 'Motor' },
];

// ─── Rotating Highlight Text ──────────────────────────────────────────────────

const HIGHLIGHTS = [
  'Luxury Off-Road SUVs', 'EV Battery Packs', 'Electric Drive Units',
  'BIW Structures', 'Driveline Systems', 'ADAS Integration',
];

function RotatingText() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % HIGHLIGHTS.length), 2800);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="relative inline-block">
      <motion.span
        key={idx}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.4 }}
        className="text-transparent bg-clip-text bg-gradient-to-r from-gold-400 via-gold-300 to-gold-500"
      >
        {HIGHLIGHTS[idx]}
      </motion.span>
    </span>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Cpu, title: 'AI-Powered Idea Generation', color: 'from-blue-500 to-indigo-600',
    desc: 'Claude AI generates technically deep cost reduction ideas at assembly, subassembly, and part level — specific to your selected system, region, and vehicle programme.',
  },
  {
    icon: Upload, title: 'CAD Geometry Analysis', color: 'from-emerald-500 to-teal-600',
    desc: 'Upload STL, STEP, DXF or images. The AI parses geometry, estimates volume/mass and returns DFMA score plus 5 priority design changes with cost impact.',
  },
  {
    icon: BarChart3, title: 'Cost Saving Quantification', color: 'from-amber-500 to-orange-600',
    desc: 'Each idea comes with saving %, annual value potential, implementation difficulty and time-to-implement — ready for business case presentation.',
  },
  {
    icon: FileDown, title: 'Excel, PowerPoint & PDF Export', color: 'from-purple-500 to-pink-600',
    desc: 'One-click export to 3-sheet Excel workbook, full slide-by-slide PowerPoint deck, or branded PDF report — all formatted for executive review.',
  },
  {
    icon: Shield, title: 'Risk & DFMA Intelligence', color: 'from-red-500 to-rose-600',
    desc: 'Every idea includes risk notes on NVH, safety, durability, regulatory compliance plus applied DFMA principles — no homework needed.',
  },
  {
    icon: Globe, title: 'Live Commodity Price Context', color: 'from-cyan-500 to-sky-600',
    desc: 'Reference commodity price data (LME aluminium, copper, NdFeB, SiC) is embedded in the analysis context — helping ground saving estimates in real market conditions. Verify latest prices at LME.com before presenting to management.',
  },
];

// ─── How It Works ─────────────────────────────────────────────────────────────

const HOW_IT_WORKS = [
  {
    step: '01',
    icon: SlidersHorizontal,
    title: 'Configure Your Programme',
    desc: 'Select a vehicle system, set production volume, choose region and currency, and optionally specify your OEM or direct competitor. Takes under 60 seconds.',
    color: 'from-blue-500 to-indigo-600',
  },
  {
    step: '02',
    icon: FlaskConical,
    title: 'AI Generates Ideas',
    desc: 'Claude AI cross-references teardown databases, patent analysis, supplier benchmarks and commodity prices to surface 15–20 targeted cost reduction opportunities.',
    color: 'from-gold-500 to-amber-600',
  },
  {
    step: '03',
    icon: Download,
    title: 'Review, Annotate & Export',
    desc: 'Annotate ideas as Approved, Investigating or Rejected. Chat with the AI for deeper analysis. Export a 3-sheet Excel workbook, full PowerPoint deck or branded PDF.',
    color: 'from-emerald-500 to-teal-600',
  },
];

// ─── KPI DATA ─────────────────────────────────────────────────────────────────

const KPI_CARDS = [
  { icon: Layers, label: 'Vehicle Systems', value: 13, suffix: '', prefix: '', trend: 'up' as const, trendLabel: 'All commodities', color: 'from-blue-500 to-indigo-600', delay: 0 },
  { icon: Lightbulb, label: 'Marketplace Cost Ideas', value: 1250, suffix: '+', prefix: '', trend: 'up' as const, trendLabel: 'Curated & benchmarked', color: 'from-gold-500 to-amber-600', delay: 0.1 },
  { icon: DollarSign, label: 'Avg Annual Value Found', value: 2.0, suffix: 'M', prefix: '£', trend: 'up' as const, trendLabel: 'Per analysis', color: 'from-emerald-500 to-teal-600', delay: 0.2 },
  { icon: Target, label: 'Cost Reduction Ideas Per Run', value: 15, suffix: '+', prefix: '', trend: undefined, trendLabel: 'Typically 12–20+', color: 'from-purple-500 to-pink-600', delay: 0.3 },
];

// ─── HomePage ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [activeSystem, setActiveSystem] = useState<string | null>(null);
  const { items: livePriceItems, lastRefresh: priceLastRefresh } = useLivePrices();
  const [ideaCount, setIdeaCount] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/marketplace/count')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && typeof d.count === 'number') setIdeaCount(d.count); })
      .catch(() => {});
  }, []);

  // Live marketplace count overrides the static KPI estimate when available.
  const kpiCards = KPI_CARDS.map(c =>
    c.label === 'Marketplace Cost Ideas' && ideaCount
      ? { ...c, value: ideaCount, suffix: '' }
      : c
  );

  return (
    <div className="min-h-screen bg-navy-950 overflow-hidden">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative pt-24 pb-12 px-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/4 w-[500px] h-[500px] bg-gold-500/4 rounded-full blur-3xl" />
          <div className="absolute top-40 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-500/40 to-transparent" />
          {/* Grid pattern */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="max-w-7xl mx-auto relative">
          <div className="text-center max-w-5xl mx-auto mb-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gold-500/10 border border-gold-500/20 text-gold-400 text-sm font-medium mb-7"
            >
              <Activity size={13} />
              <span>AI Cost Reduction Intelligence Platform</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.08 }}
              className="text-5xl md:text-6xl lg:text-7xl font-black text-white leading-[1.08] mb-5"
            >
              Intelligent Cost<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-400 via-amber-300 to-gold-500">
                Reduction Engine
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.16 }}
              className="text-xl text-slate-400 max-w-3xl mx-auto mb-3 leading-relaxed"
            >
              AI-powered VAVE intelligence for{' '}
              <RotatingText />
              {' '}— from concept to production cost targets.
            </motion.p>

            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.25 }}
              className="text-slate-500 text-sm mb-10"
            >
              Backed by benchmarks from BMW, BYD, Porsche, Huawei DriveONE, ZF, GKN, NIO, Rivian, Lucid, GM Ultium & more
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.28 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12"
            >
              <Link
                to="/analyze"
                className="group inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-bold text-lg transition-all hover:scale-105 shadow-2xl shadow-gold-500/30"
              >
                Start Analysis
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                to="/trends"
                className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl border border-white/15 text-slate-300 hover:text-white hover:border-gold-500/40 font-medium text-lg transition-all hover:bg-white/5"
              >
                <TrendingUp size={18} className="group-hover:text-gold-400 transition-colors" />
                View Trends
              </Link>
            </motion.div>
          </div>

          {/* ── Live KPI Dashboard ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {kpiCards.map((card) => (
              <KpiCard key={card.label} {...card} />
            ))}
          </div>

          {/* ── Commodity Ticker ───────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.6 }}
            className="rounded-xl bg-navy-900 border border-white/8 px-4 py-3 mb-8 overflow-hidden"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <BarChart3 size={10} />
                Live Commodity Prices
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[9px] text-slate-600">Exchange</span>
                <span className="w-1.5 h-1.5 rounded-full bg-gold-400 ml-2" />
                <span className="text-[9px] text-slate-600">Spot</span>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500 ml-2" />
                <span className="text-[9px] text-slate-600">Indicative</span>
              </div>
              <div className="flex-1 h-px bg-white/6" />
              {priceLastRefresh
                ? <span className="text-[10px] text-slate-600">Refreshed {new Date(priceLastRefresh).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                : <span className="text-[10px] text-slate-600">Daily auto-refresh</span>
              }
            </div>
            <CommodityTicker items={livePriceItems} />
          </motion.div>

          {/* ── Two-column: Live Feed + Benchmark Panel ────────────────── */}
          <div className="grid lg:grid-cols-2 gap-5 mb-4">

            {/* Live Activity Feed */}
            <motion.div
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.4 }}
              className="rounded-2xl bg-navy-900 border border-white/8 p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Lightbulb size={14} className="text-gold-400" />
                  <span className="text-white font-semibold text-sm">Example Analyses</span>
                </div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Illustrative</span>
              </div>
              <ExampleAnalyses />
            </motion.div>

            {/* Benchmark Savings Panel */}
            <motion.div
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.45 }}
              className="rounded-2xl bg-navy-900 border border-white/8 p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Award size={14} className="text-gold-400" />
                  <span className="text-white font-semibold text-sm">Verified Benchmark Savings</span>
                </div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Teardown benchmarks</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {BENCHMARKS.map((b, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.5 + i * 0.06 }}
                    whileHover={{ scale: 1.03, borderColor: 'rgba(245,158,11,0.3)', transition: { type: 'spring', stiffness: 380, damping: 28 } }}
                    className="p-3 rounded-xl bg-white/5 border border-white/8 cursor-default transition-all"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gold-500/15 flex items-center justify-center mb-2">
                      <b.icon size={15} className="text-gold-400" />
                    </div>
                    <div className="text-gold-400 font-bold text-sm">{b.value}</div>
                    <div className="text-slate-400 text-xs leading-tight mt-0.5">{b.label}</div>
                    <div className="text-slate-600 text-[10px] mt-1 uppercase tracking-wide">{b.domain}</div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── System Coverage ──────────────────────────────────────────────────── */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-400 text-xs font-medium mb-4">
              <Cog size={11} />
              Complete Vehicle Architecture Coverage
            </div>
            <h2 className="text-3xl font-bold text-white mb-3">System Coverage</h2>
            <p className="text-slate-400 text-sm">Select any system for instant AI-powered cost reduction analysis</p>
          </motion.div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {AUTOMOTIVE_SYSTEMS.map((system, i) => (
              <motion.div
                key={system.id}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.04 }}
              >
                <Link
                  to={`/analyze?system=${system.id}`}
                  onMouseEnter={() => setActiveSystem(system.id)}
                  onMouseLeave={() => setActiveSystem(null)}
                  className={`group block p-4 rounded-xl border transition-all duration-300 relative overflow-hidden ${
                    activeSystem === system.id
                      ? 'bg-white/8 border-gold-500/35 -translate-y-1.5 shadow-xl shadow-gold-500/10'
                      : 'bg-white/5 border-white/10 hover:bg-white/7 hover:border-white/20 hover:-translate-y-1'
                  }`}
                >
                  {/* Hover shimmer */}
                  <div className={`absolute inset-0 bg-gradient-to-br from-gold-500/5 to-transparent transition-opacity duration-300 ${activeSystem === system.id ? 'opacity-100' : 'opacity-0'}`} />

                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${system.color} flex items-center justify-center text-xl mb-3 group-hover:scale-110 transition-transform duration-200`}>
                    {system.icon}
                  </div>
                  <div className="text-white text-sm font-semibold leading-tight mb-1">{system.name}</div>
                  <div className="text-slate-500 text-xs">{system.subassemblies.length} subassemblies</div>
                  <div className={`mt-3 flex items-center text-gold-400 text-xs font-medium transition-all duration-200 ${activeSystem === system.id ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'}`}>
                    Analyze <ChevronRight size={12} className="ml-1" />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────────────────────── */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-400 text-xs font-medium mb-4">
              <Zap size={11} className="text-gold-400" />
              Three Steps to Results
            </div>
            <h2 className="text-3xl font-bold text-white mb-3">How It Works</h2>
            <p className="text-slate-400 text-sm">From blank page to executive-ready cost reduction report in minutes</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 relative">
            {/* Connector line (desktop only) */}
            <div className="hidden md:block absolute top-14 left-1/3 right-1/3 h-px bg-gradient-to-r from-white/8 via-gold-500/30 to-white/8 pointer-events-none" />

            {HOW_IT_WORKS.map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ duration: 0.45, delay: i * 0.12 }}
                className="relative p-6 rounded-2xl bg-navy-900 border border-white/8 hover:border-white/15 transition-all cursor-default group"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    <item.icon size={20} className="text-white" />
                  </div>
                  <span className="text-4xl font-black text-white/8 leading-none mt-1 select-none">{item.step}</span>
                </div>
                <h3 className="text-white font-semibold text-base mb-2">{item.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Platform Capabilities ─────────────────────────────────────────────── */}
      <section id="features" className="py-16 px-4 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-navy-900/60 to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-400 text-xs font-medium mb-4">
              <Star size={11} className="text-gold-400" />
              Platform Capabilities
            </div>
            <h2 className="text-3xl font-bold text-white mb-3">Everything You Need</h2>
            <p className="text-slate-400 text-sm">From initial idea generation to executive presentation — end to end</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ duration: 0.45, delay: i * 0.08 }}
                whileHover={{ y: -5, boxShadow: '0 20px 60px rgba(245,158,11,0.08)', transition: { type: 'spring', stiffness: 380, damping: 28 } }}
                className="group p-6 rounded-2xl bg-navy-900 border border-white/8 hover:border-gold-500/20 transition-all cursor-default relative overflow-hidden"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${f.color} opacity-0 group-hover:opacity-[0.04] transition-opacity duration-500`} />
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                  <f.icon size={22} className="text-white" />
                </div>
                <h3 className="text-white font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
                <div className="mt-4 flex items-center text-gold-400 text-xs font-medium opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-y-1 group-hover:translate-y-0">
                  <CheckCircle2 size={12} className="mr-1.5" />
                  Available now
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── OEM Intelligence Banner ───────────────────────────────────────────── */}
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="rounded-2xl bg-gradient-to-br from-navy-800 to-navy-900 border border-white/10 p-8 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-500/50 to-transparent" />
            <div className="absolute -top-32 right-0 w-64 h-64 bg-gold-500/4 rounded-full blur-3xl pointer-events-none" />

            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold-500/10 border border-gold-500/20 text-gold-400 text-xs font-medium mb-4">
                  <Globe size={11} />
                  Global OEM Intelligence
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">
                  Benchmarked Against World-Class OEMs
                </h2>
                <p className="text-slate-400 text-sm leading-relaxed mb-5">
                  Every idea is grounded in real benchmark data from teardowns, OEM press releases,
                  patent analysis and industry teardown reports — covering Chinese, European and US manufacturers.
                </p>
                <div className="flex flex-wrap gap-2">
                  {['BYD', 'BMW', 'Porsche', 'Tesla', 'NIO', 'Xiaomi', 'Huawei', 'ZF', 'GKN', 'Rivian', 'Lucid', 'GM Ultium'].map(oem => (
                    <span key={oem} className="px-2.5 py-1 rounded-lg bg-white/6 border border-white/10 text-slate-300 text-xs font-medium hover:border-gold-500/30 hover:text-gold-300 transition-colors cursor-default">
                      {oem}
                    </span>
                  ))}
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: '17+', label: 'OEM Brands', color: 'text-gold-400' },
                  { value: '13', label: 'Vehicle Domains', color: 'text-blue-400' },
                  { value: ideaCount ? `${ideaCount.toLocaleString()}` : '1,250+', label: 'Marketplace Ideas', color: 'text-emerald-400' },
                  { value: '3', label: 'Export Formats', color: 'text-purple-400' },
                ].map((s) => (
                  <motion.div
                    key={s.label}
                    whileHover={{ scale: 1.04 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                    className="p-4 rounded-xl bg-white/5 border border-white/8 hover:border-white/15 transition-all cursor-default"
                  >
                    <div className={`text-3xl font-black ${s.color} mb-1`}>{s.value}</div>
                    <div className="text-slate-500 text-xs font-medium">{s.label}</div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="p-10 rounded-3xl bg-gradient-to-br from-navy-800 to-navy-900 border border-gold-500/20 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-400 to-transparent" />
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-gold-500/6 rounded-full blur-3xl pointer-events-none" />

            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, repeatDelay: 2 }}
            >
              <Zap size={44} className="text-gold-400 mx-auto mb-5" />
            </motion.div>

            <h2 className="text-3xl font-bold text-white mb-4">Ready to Find Savings?</h2>
            <p className="text-slate-400 mb-8 max-w-xl mx-auto leading-relaxed">
              Start your first analysis in minutes. Select a vehicle system, configure your
              programme parameters, and let the AI surface technically credible, commercially
              validated cost opportunities.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/analyze"
                className="group inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-bold text-lg transition-all hover:scale-105 shadow-2xl shadow-gold-500/25"
              >
                Start Free Analysis
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                to="/trends"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl border border-white/15 text-slate-300 hover:text-white hover:border-white/25 font-medium text-lg transition-all"
              >
                <TrendingUp size={18} />
                Explore Trends
              </Link>
            </div>

            {/* Trust signals */}
            <div className="mt-8 pt-6 border-t border-white/8 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-500">
              <div className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-green-400" /> No credit card required</div>
              <div className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-green-400" /> Results in &lt;60 seconds</div>
              <div className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-green-400" /> Excel + PPT + PDF export</div>
              <div className="flex items-center gap-1.5"><Clock size={12} className="text-gold-400" /> Updated with 2025–26 benchmarks</div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
