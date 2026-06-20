import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, TrendingDown, Clock, BarChart3, Lightbulb, ArrowRight, Star, BookOpen, Target, Activity, Trash2, Share2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { loadFullResult } from '../services/claude-service';

interface RecentAnalysis {
  id: string;
  systemName: string;
  subassemblyName: string;
  partName?: string;
  ideasCount: number;
  date: string;
}

interface ServerProject {
  id: string;
  systemName: string;
  subassemblyName: string;
  partName?: string;
  vehicleType?: string;
  summary: { totalIdeas: number; quickWins: number; strategicItems: number };
  generatedAt: string;
}

const TIPS = [
  { icon: Target, tip: 'Start with high-volume parts — even 1% saving on 100k units compounds fast.', color: 'text-gold-400' },
  { icon: Lightbulb, tip: 'Enable web search for live market pricing data to validate savings estimates.', color: 'text-emerald-400' },
  { icon: BarChart3, tip: 'Export to PowerPoint for management reviews — each idea gets a dedicated slide.', color: 'text-blue-400' },
  { icon: Activity, tip: 'Analyse at part level for surgical precision, or subassembly for broader DFMA wins.', color: 'text-purple-400' },
];

const WHATS_NEW = [
  'ROI Auto-Ranking — sort ideas by Best ROI, Highest Savings, or Easiest First',
  'Status Filter — filter ideas by annotation status (Approved / Investigating / Rejected / On Hold)',
  'SQLite Database — cloud-synced project storage replaces localStorage-only history',
  'Project History — open, delete, and share any saved analysis from the Dashboard',
  'Idea Caching — identical analyses return instantly from a 7-day cache',
  'Multi-pass Deduplication — Refine runs automatically remove near-duplicate ideas',
  'Competitor Benchmarking — every idea now cites specific OEM/programme/year evidence',
  'Implementation Roadmap — 3-phase auto-grouped view inside every Results page',
  'Business Case PDF — Page 2 now shows ROI-ranked top ideas and phase summary boxes',
  'Team Sharing — generate a 30-day read-only share link for any analysis',
  'BOM Batch Analysis — upload an Excel BOM and analyse up to 20 parts at once',
  'Progressive Web App — install BrainSpark on mobile or desktop for offline access',
];

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [recentAnalyses, setRecentAnalyses] = useState<RecentAnalysis[]>([]);
  const [serverProjects, setServerProjects] = useState<ServerProject[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  useEffect(() => {
    // Load localStorage fallback
    try {
      const stored = localStorage.getItem('brainspark_recent_analyses');
      if (stored) setRecentAnalyses(JSON.parse(stored));
    } catch {}
    // Load server projects
    const token = (() => {
      try { return JSON.parse(localStorage.getItem('brainspark_auth') || '{}').token; } catch { return null; }
    })();
    if (token) {
      fetch('/api/projects', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : [])
        .then(data => setServerProjects(Array.isArray(data) ? data : []))
        .catch(() => {});
    }
  }, []);

  async function deleteProject(id: string) {
    const token = (() => {
      try { return JSON.parse(localStorage.getItem('brainspark_auth') || '{}').token; } catch { return null; }
    })();
    if (!token) return;
    setDeletingId(id);
    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setServerProjects(prev => prev.filter(p => p.id !== id));
    } finally { setDeletingId(null); }
  }

  async function shareProject(id: string) {
    const token = (() => {
      try { return JSON.parse(localStorage.getItem('brainspark_auth') || '{}').token; } catch { return null; }
    })();
    if (!token) return;
    setSharingId(id);
    try {
      const r = await fetch(`/api/projects/${id}/share`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiryDays: 30 }),
      });
      const data = await r.json();
      setShareUrl(`${window.location.origin}${data.shareUrl}`);
    } finally { setSharingId(null); }
  }

  async function openServerProject(id: string, p: ServerProject) {
    const token = (() => {
      try { return JSON.parse(localStorage.getItem('brainspark_auth') || '{}').token; } catch { return null; }
    })();
    if (!token) return;
    try {
      const r = await fetch(`/api/projects/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return;
      const project = await r.json();
      sessionStorage.setItem('analysisResult', JSON.stringify({
        id: project.id, config: project.config, ideas: project.ideas, sources: project.sources,
        summary: project.summary, generatedAt: project.generatedAt,
      }));
      sessionStorage.setItem('analysisSystemName', p.systemName);
      sessionStorage.setItem('analysisSubName', p.subassemblyName);
      navigate('/results');
    } catch {}
  }

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
            { icon: BarChart3,   label: 'Projects Saved', value: String(serverProjects.length || recentAnalyses.length), sub: 'cloud-synced', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { icon: Star,        label: 'Total Ideas', value: String(serverProjects.reduce((s, p) => s + (p.summary?.totalIdeas || 0), 0) || '—'), sub: 'across all projects', color: 'text-purple-400', bg: 'bg-purple-500/10' },
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

            {shareUrl && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
                <span className="text-emerald-400 text-xs flex-1 truncate">{shareUrl}</span>
                <button onClick={() => { navigator.clipboard.writeText(shareUrl); }} className="text-xs text-emerald-400 hover:text-white border border-emerald-500/30 px-2 py-1 rounded-lg transition-colors">Copy</button>
                <button onClick={() => setShareUrl(null)} className="text-slate-500 hover:text-white transition-colors text-xs">✕</button>
              </div>
            )}
            {serverProjects.length === 0 && recentAnalyses.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <img src="/brainspark-logo.svg" className="w-8 h-8 mx-auto mb-3 opacity-30" alt="" />
                <p className="text-sm">No analyses yet.</p>
                <p className="text-xs mt-1">Run your first analysis to see it here.</p>
                <Link to="/analyze" className="inline-flex items-center gap-1 mt-4 text-gold-400 text-sm hover:text-gold-300 transition-colors">
                  Start now <ChevronRight size={14} />
                </Link>
              </div>
            ) : serverProjects.length > 0 ? (
              <div className="space-y-3">
                {serverProjects.slice(0, 10).map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-4 rounded-xl bg-navy-800 border border-white/5 hover:border-gold-500/30 cursor-pointer transition-all group"
                    onClick={() => openServerProject(p.id, p)}>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium group-hover:text-gold-300 transition-colors truncate">
                        {p.systemName} › {p.subassemblyName}{p.partName ? ` › ${p.partName}` : ''}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5">
                        {p.vehicleType && <span className="text-gold-500 text-xs">{p.vehicleType}</span>}
                        <span className="text-slate-500 text-xs">{new Date(p.generatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <span className="text-xs text-emerald-400 font-medium">{p.summary?.totalIdeas || 0} ideas</span>
                      {p.summary?.quickWins > 0 && <span className="text-xs text-green-400">{p.summary.quickWins} QW</span>}
                      <button onClick={e => { e.stopPropagation(); shareProject(p.id); }}
                        disabled={sharingId === p.id}
                        className="p-1.5 rounded-lg hover:bg-white/8 text-slate-500 hover:text-blue-400 transition-colors">
                        <Share2 size={13} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); deleteProject(p.id); }}
                        disabled={deletingId === p.id}
                        className="p-1.5 rounded-lg hover:bg-white/8 text-slate-500 hover:text-red-400 transition-colors">
                        <Trash2 size={13} />
                      </button>
                      <ChevronRight size={14} className="text-slate-600 group-hover:text-gold-400 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {recentAnalyses.slice(0, 8).map((a) => (
                  <div
                    key={a.id}
                    onClick={() => {
                      const full = loadFullResult(a.id);
                      if (full) {
                        sessionStorage.setItem('analysisResult', JSON.stringify((full as {result: unknown}).result ?? full));
                        sessionStorage.setItem('analysisSystemName', a.systemName);
                        sessionStorage.setItem('analysisSubName', a.subassemblyName);
                        navigate('/results');
                      } else { navigate('/analyze'); }
                    }}
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
                <h3 className="text-white font-semibold text-sm">What's New in v3.0</h3>
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
