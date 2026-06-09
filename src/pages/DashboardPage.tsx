import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, TrendingDown, Clock, BarChart3, Lightbulb, ArrowRight, Star, BookOpen, Target, Activity, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface RecentAnalysis {
  id: string;
  systemName: string;
  subassemblyName: string;
  partName?: string;
  ideasCount: number;
  date: string;
}

const TIPS = [
  { icon: Target, tip: 'Start with high-volume parts — even 1% saving on 100k units compounds fast.', color: 'text-gold-400' },
  { icon: Lightbulb, tip: 'Enable web search for live market pricing data to validate savings estimates.', color: 'text-emerald-400' },
  { icon: BarChart3, tip: 'Export to PowerPoint for management reviews — each idea gets a dedicated slide.', color: 'text-blue-400' },
  { icon: Activity, tip: 'Analyse at part level for surgical precision, or subassembly for broader DFMA wins.', color: 'text-purple-400' },
];

const WHATS_NEW = [
  'Live internet-grounded cost estimates via agentic web search',
  '13 automotive systems — BIW, BEV, 800V, ADAS and more',
  'Chief Engineer AI persona with 30-year domain expertise',
  'Export to Excel (3-sheet) and PowerPoint (per-idea slides)',
  'Forgot password with email OTP and secure JWT sessions',
];

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [recentAnalyses, setRecentAnalyses] = useState<RecentAnalysis[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('brainspark_recent_analyses');
      if (stored) setRecentAnalyses(JSON.parse(stored));
    } catch {}
  }, []);

  function clearHistory() {
    localStorage.removeItem('brainspark_recent_analyses');
    setRecentAnalyses([]);
  }

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="min-h-screen bg-navy-950 pt-24 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-10">

        {/* Welcome banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="rounded-2xl bg-gradient-to-br from-navy-800 to-navy-900 border border-gold-500/20 p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6"
        >
          <div>
            <p className="text-slate-400 text-sm mb-1">{greeting},</p>
            <h1 className="text-3xl font-bold text-white">
              {firstName} <span className="text-gold-400">👋</span>
            </h1>
            <p className="text-slate-300 mt-2 max-w-md">
              Ready to find cost reduction opportunities? Select a vehicle system and let the Chief Engineer AI get to work.
            </p>
          </div>
          <Link
            to="/analyze"
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-semibold text-sm transition-all hover:scale-105 shadow-lg shadow-gold-500/25 whitespace-nowrap"
          >
            Start Analysis <ArrowRight size={16} />
          </Link>
        </motion.div>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {[
            { icon: TrendingDown, label: 'Systems Covered', value: '13', sub: 'BIW to Next-Gen EV', color: 'text-gold-400', bg: 'bg-gold-500/10' },
            { icon: Lightbulb,   label: 'Parts Catalogued', value: '260+', sub: 'across all systems', color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { icon: BarChart3,   label: 'Analyses Run', value: String(recentAnalyses.length), sub: 'this session', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { icon: Star,        label: 'Export Formats', value: '2', sub: 'Excel & PowerPoint', color: 'text-purple-400', bg: 'bg-purple-500/10' },
          ].map(({ icon: Icon, label, value, sub, color, bg }) => (
            <div key={label} className="rounded-xl bg-navy-900 border border-white/8 p-5 flex items-start gap-4">
              <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={18} className={color} />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{value}</p>
                <p className="text-xs text-slate-400 leading-tight">{label}</p>
                <p className="text-xs text-slate-600 leading-tight mt-0.5">{sub}</p>
              </div>
            </div>
          ))}
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6">

          {/* Recent analyses */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="lg:col-span-2 rounded-2xl bg-navy-900 border border-white/8 p-6"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-gold-400" />
                <h2 className="text-white font-semibold">Recent Analyses</h2>
              </div>
              {recentAnalyses.length > 0 && (
                <button onClick={clearHistory} className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-400 transition-colors">
                  <Trash2 size={12} /> Clear
                </button>
              )}
            </div>

            {recentAnalyses.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <img src="/brainspark-logo.svg" className="w-8 h-8 mx-auto mb-3 opacity-30" alt="" />
                <p className="text-sm">No analyses yet.</p>
                <p className="text-xs mt-1">Run your first analysis to see it here.</p>
                <Link to="/analyze" className="inline-flex items-center gap-1 mt-4 text-gold-400 text-sm hover:text-gold-300 transition-colors">
                  Start now <ChevronRight size={14} />
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recentAnalyses.slice(0, 8).map((a) => (
                  <div
                    key={a.id}
                    onClick={() => navigate('/analyze')}
                    className="flex items-center justify-between p-4 rounded-xl bg-navy-800 border border-white/5 hover:border-gold-500/30 cursor-pointer transition-all group"
                  >
                    <div>
                      <p className="text-white text-sm font-medium group-hover:text-gold-300 transition-colors">
                        {a.systemName} › {a.subassemblyName}{a.partName ? ` › ${a.partName}` : ''}
                      </p>
                      <p className="text-slate-500 text-xs mt-0.5">{a.date}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-emerald-400 font-medium">{a.ideasCount} ideas</span>
                      <ChevronRight size={14} className="text-slate-600 group-hover:text-gold-400 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Right column: tips + what's new */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="space-y-6"
          >
            {/* Pro tips */}
            <div className="rounded-2xl bg-navy-900 border border-white/8 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb size={16} className="text-gold-400" />
                <h3 className="text-white font-semibold text-sm">Pro Tips</h3>
              </div>
              <div className="space-y-3">
                {TIPS.map(({ icon: Icon, tip, color }) => (
                  <div key={tip} className="flex items-start gap-3">
                    <Icon size={14} className={`${color} mt-0.5 flex-shrink-0`} />
                    <p className="text-slate-400 text-xs leading-relaxed">{tip}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* What's new */}
            <div className="rounded-2xl bg-navy-900 border border-white/8 p-6">
              <div className="flex items-center gap-2 mb-4">
                <BookOpen size={16} className="text-emerald-400" />
                <h3 className="text-white font-semibold text-sm">What's New in v2.1</h3>
              </div>
              <ul className="space-y-2">
                {WHATS_NEW.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link to="/help" className="inline-flex items-center gap-1 mt-4 text-gold-400 text-xs hover:text-gold-300 transition-colors">
                View full changelog <ChevronRight size={12} />
              </Link>
            </div>
          </motion.div>
        </div>

        {/* Quick-start cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <h2 className="text-white font-semibold mb-4">Quick Start</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { label: 'BIW Body Structure', system: 'BIW Body-in-White', sub: 'Front End Module', icon: '🏗️' },
              { label: 'Battery Pack (BEV)', system: 'Powertrain BEV/MHEV', sub: 'Battery Pack & BMS', icon: '🔋' },
              { label: 'Front Suspension',  system: 'Chassis & Frame', sub: 'Front Suspension', icon: '⚙️' },
            ].map(({ label, system, sub, icon }) => (
              <Link
                key={label}
                to="/analyze"
                state={{ preselect: { system, subassembly: sub } }}
                className="flex items-center gap-4 p-4 rounded-xl bg-navy-900 border border-white/8 hover:border-gold-500/30 transition-all group"
              >
                <span className="text-2xl">{icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium group-hover:text-gold-300 transition-colors truncate">{label}</p>
                  <p className="text-slate-500 text-xs truncate">{sub}</p>
                </div>
                <ChevronRight size={14} className="text-slate-600 group-hover:text-gold-400 transition-colors flex-shrink-0" />
              </Link>
            ))}
          </div>
        </motion.div>

      </div>
    </div>
  );
}
