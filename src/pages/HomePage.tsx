import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Zap, BarChart3, FileDown, Upload, Cpu, Shield, ChevronRight } from 'lucide-react';
import { AUTOMOTIVE_SYSTEMS } from '../data/automotive-catalog';

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.1, ease: 'easeOut' } }),
};

const FEATURES = [
  {
    icon: Cpu,
    title: 'AI-Powered Idea Generation',
    desc: 'Claude AI generates technically deep cost reduction ideas at assembly, subassembly, and part level — specific to your selected system.',
    color: 'from-blue-500 to-indigo-600',
  },
  {
    icon: Upload,
    title: 'CAD Geometry Analysis',
    desc: 'Upload .STL or .IGS files. The AI contextualises geometry-specific improvements based on typical manufacturing issues.',
    color: 'from-emerald-500 to-teal-600',
  },
  {
    icon: BarChart3,
    title: 'Cost Saving Quantification',
    desc: 'Each idea comes with indicative saving percentage, annual value potential, and implementation difficulty rating.',
    color: 'from-amber-500 to-orange-600',
  },
  {
    icon: FileDown,
    title: 'Export to Excel & PowerPoint',
    desc: 'One-click export to formatted MS Excel workbook (3 sheets) and presentation-ready PowerPoint deck for management reviews.',
    color: 'from-purple-500 to-pink-600',
  },
  {
    icon: Shield,
    title: 'Risk & DFMA Intelligence',
    desc: 'Every idea includes risk notes covering NVH, safety, durability, and regulatory compliance, plus applied DFMA principles.',
    color: 'from-red-500 to-rose-600',
  },
  {
    icon: Zap,
    title: 'Full System Coverage',
    desc: 'Covers all major vehicle systems: BIW, EV Battery, EDU, Suspension, Interior, HVAC, ADAS, Paint, Closures, and more.',
    color: 'from-cyan-500 to-sky-600',
  },
];

const STATS = [
  { value: '10+', label: 'Vehicle Systems' },
  { value: '40+', label: 'Subassemblies' },
  { value: '7 Ideas', label: 'Per Analysis' },
  { value: 'Excel + PPT', label: 'Export Formats' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-navy-950 overflow-hidden">
      {/* Hero */}
      <section className="relative pt-24 pb-20 px-4">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/4 w-96 h-96 bg-gold-500/5 rounded-full blur-3xl" />
          <div className="absolute top-40 right-1/4 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl" />
          <div className="absolute -top-10 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-gold-500/30 to-transparent" />
        </div>

        <div className="max-w-6xl mx-auto text-center relative">
          <motion.div
            initial="hidden" animate="visible" variants={fadeUp} custom={0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gold-500/10 border border-gold-500/20 text-gold-400 text-sm font-medium mb-8"
          >
            <Zap size={14} />
            <span>AI-Powered Cost Reduction Intelligence</span>
          </motion.div>

          <motion.h1
            initial="hidden" animate="visible" variants={fadeUp} custom={1}
            className="text-5xl md:text-6xl lg:text-7xl font-black text-white leading-tight mb-6"
          >
            Intelligent Cost<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-400 to-gold-600">
              Reduction Engine
            </span>
          </motion.h1>

          <motion.p
            initial="hidden" animate="visible" variants={fadeUp} custom={2}
            className="text-xl text-slate-400 max-w-3xl mx-auto mb-10 leading-relaxed"
          >
            Generate technically deep, commercially viable cost reduction ideas for any automotive
            system — from premium luxury SUV BIW to EV battery packs — powered by Claude AI with
            DFMA and lean design intelligence.
          </motion.p>

          <motion.div
            initial="hidden" animate="visible" variants={fadeUp} custom={3}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              to="/analyze"
              className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-bold text-lg transition-all hover:scale-105 shadow-xl shadow-gold-500/25"
            >
              Start Analysis
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl border border-white/15 text-slate-300 hover:text-white hover:border-white/30 font-medium text-lg transition-all"
            >
              See Features
              <ChevronRight size={20} />
            </a>
          </motion.div>

          {/* Stats bar */}
          <motion.div
            initial="hidden" animate="visible" variants={fadeUp} custom={4}
            className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto"
          >
            {STATS.map((s) => (
              <div key={s.label} className="text-center p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="text-2xl font-black text-gold-400">{s.value}</div>
                <div className="text-xs text-slate-500 mt-1 font-medium">{s.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Visual car silhouette section */}
      <section className="py-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-navy-950 via-navy-900 to-navy-950" />
        <div className="max-w-5xl mx-auto px-4 relative">
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-br from-navy-800 to-navy-900 p-8 md:p-12">
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="flex-1">
                <div className="text-gold-400 text-sm font-semibold uppercase tracking-wider mb-3">Premium Luxury SUV Platform</div>
                <h2 className="text-3xl font-bold text-white mb-4">
                  Engineered for Next-Generation Vehicles
                </h2>
                <p className="text-slate-400 leading-relaxed mb-6">
                  From 800V EV architecture to advanced ADAS systems, our AI understands the
                  complexity of premium vehicle engineering — delivering ideas that balance
                  cost, quality, NVH, and regulatory compliance.
                </p>
                <Link
                  to="/analyze"
                  className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300 font-semibold transition-colors"
                >
                  Begin your analysis <ArrowRight size={16} />
                </Link>
              </div>
              {/* Abstract car visualization */}
              <div className="flex-shrink-0 w-64 h-48 relative">
                <svg viewBox="0 0 280 180" className="w-full h-full opacity-80">
                  <defs>
                    <linearGradient id="carGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#d97706" stopOpacity="0.4" />
                    </linearGradient>
                    <linearGradient id="glowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {/* SUV silhouette */}
                  <path d="M30 130 L30 105 L60 75 L90 60 L190 58 L230 70 L255 100 L260 130 Z"
                    fill="none" stroke="url(#carGrad)" strokeWidth="2.5" />
                  {/* Wheels */}
                  <circle cx="80" cy="130" r="22" fill="none" stroke="url(#carGrad)" strokeWidth="2" />
                  <circle cx="80" cy="130" r="12" fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.5" />
                  <circle cx="200" cy="130" r="22" fill="none" stroke="url(#carGrad)" strokeWidth="2" />
                  <circle cx="200" cy="130" r="12" fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.5" />
                  {/* Windows */}
                  <path d="M95 75 L95 100 L165 100 L165 75 Z" fill="none" stroke="#93c5fd" strokeWidth="1.5" opacity="0.5" />
                  <path d="M170 75 L170 100 L215 100 L210 75 Z" fill="none" stroke="#93c5fd" strokeWidth="1.5" opacity="0.5" />
                  {/* Ground glow */}
                  <ellipse cx="145" cy="150" rx="120" ry="12" fill="url(#glowGrad)" />
                  {/* Scan lines */}
                  <line x1="0" y1="130" x2="280" y2="130" stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="4,6" opacity="0.3" />
                  <line x1="0" y1="95" x2="280" y2="95" stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="4,6" opacity="0.15" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* System Categories */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-white mb-3">System Coverage</h2>
            <p className="text-slate-400">Complete vehicle system hierarchy — select any system for AI-powered analysis</p>
          </motion.div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {AUTOMOTIVE_SYSTEMS.map((system, i) => (
              <motion.div
                key={system.id}
                initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i * 0.05}
              >
                <Link
                  to={`/analyze?system=${system.id}`}
                  className="group block p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/8 hover:border-white/20 transition-all hover:-translate-y-1"
                >
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${system.color} flex items-center justify-center text-xl mb-3`}>
                    {system.icon}
                  </div>
                  <div className="text-white text-sm font-semibold leading-tight mb-1">{system.name}</div>
                  <div className="text-slate-500 text-xs leading-tight">{system.subassemblies.length} subassemblies</div>
                  <div className="mt-3 flex items-center text-gold-400 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    Analyze <ChevronRight size={12} className="ml-1" />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 px-4 bg-navy-900/50">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-white mb-3">Platform Capabilities</h2>
            <p className="text-slate-400">Everything you need to identify, quantify, and present cost reduction opportunities</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i * 0.1}
                className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition-all group"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <f.icon size={22} className="text-white" />
                </div>
                <h3 className="text-white font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
            className="p-10 rounded-3xl bg-gradient-to-br from-navy-800 to-navy-900 border border-gold-500/20 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold-400 to-transparent" />
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-60 h-60 bg-gold-500/5 rounded-full blur-3xl" />

            <Zap size={40} className="text-gold-400 mx-auto mb-5" />
            <h2 className="text-3xl font-bold text-white mb-4">Ready to Find Savings?</h2>
            <p className="text-slate-400 mb-8 max-w-xl mx-auto">
              Start your first analysis in minutes. Select a vehicle system, configure your parameters,
              and let the AI surface technically credible cost opportunities.
            </p>
            <Link
              to="/analyze"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-bold text-lg transition-all hover:scale-105 shadow-xl shadow-gold-500/25"
            >
              Start Free Analysis <ArrowRight size={20} />
            </Link>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
