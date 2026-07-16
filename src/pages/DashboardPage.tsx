import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, TrendingDown, Clock, BarChart3, Lightbulb, ArrowRight, Star, BookOpen, Target, Activity, Trash2, Share2, CheckCircle, AlertCircle, XCircle, ClipboardList, GitMerge, Box, Image as ImageIcon, Sparkles } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { loadFullResult } from '../services/claude-service';
import { toast } from '../hooks/useToast';
import OnboardingBanner from '../components/OnboardingBanner';

interface PipelineKpi {
  totalPotential: number;
  confirmedSaving: number;
  inProgressSaving: number;
  gateSavings: Record<string, number>;
  gateCount: Record<string, number>;
  vehicleSavings: Record<string, number>;
  commoditySavings: Record<string, number>;
  yearTimeline: Record<string, number>;
  topIdeas: Array<{ id: string; ideaNumber: string; ideaTitle: string; totalAnnualSaving: number; gate: string; userName: string; commodityName: string }>;
  totalCases: number;
}

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
  annotations?: Record<string, { status: string }>;
  generatedAt: string;
}

const TIPS = [
  { icon: Target, tip: 'Start with high-volume parts — even 1% saving on 100k units compounds fast.', color: 'text-gold-400' },
  { icon: Lightbulb, tip: 'Enable web search for live market pricing data to validate savings estimates.', color: 'text-emerald-400' },
  { icon: BarChart3, tip: 'Export to PowerPoint for management reviews — each idea gets a dedicated slide.', color: 'text-blue-400' },
  { icon: Activity, tip: 'Analyse at part level for surgical precision, or subassembly for broader DFMA wins.', color: 'text-purple-400' },
];

// ── helpers shared between PipelineKpiSection and module ──────────────────────
const GATE_COLORS: Record<string, string> = { G0: '#94a3b8', G1: '#fbbf24', G2: '#60a5fa', G3: '#34d399' };
const PIE_COLORS = ['#f59e0b', '#60a5fa', '#34d399', '#a78bfa', '#fb923c'];
const GATE_DOT: Record<string, string> = { G0: 'bg-slate-400', G1: 'bg-amber-400', G2: 'bg-blue-400', G3: 'bg-green-400' };

function fmtM(n: number) {   // EUR — consistent with the app-wide default currency
  if (!n) return '£0';
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${Math.round(n)}`;
}

function PipelineKpiSection({ kpi }: { kpi: PipelineKpi }) {
  const gateData = ['G0', 'G1', 'G2', 'G3'].map((g) => ({
    name: g,
    saving: Math.round((kpi.gateSavings[g] || 0) / 1000),
    count: kpi.gateCount[g] || 0,
    fill: GATE_COLORS[g],
  }));
  const vehicleData = Object.entries(kpi.vehicleSavings)
    .map(([name, value]) => ({ name, value: Math.round(value / 1000) }))
    .sort((a, b) => b.value - a.value);
  const commData = Object.entries(kpi.commoditySavings)
    .map(([name, value]) => ({
      name: name.length > 16 ? name.slice(0, 14) + '…' : name,
      saving: Math.round(value / 1000),
    }))
    .sort((a, b) => b.saving - a.saving)
    .slice(0, 8);
  const yearData = Object.entries(kpi.yearTimeline)
    .map(([year, value]) => ({ year, saving: Math.round(value / 1000) }))
    .sort((a, b) => Number(a.year) - Number(b.year));

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 }} className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitMerge size={18} className="text-violet-400" />
          <h2 className="text-white font-bold text-lg">Idea Pipeline KPIs</h2>
          <span className="px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/25 text-violet-300 text-xs">{kpi.totalCases} ideas</span>
        </div>
        <Link to="/pipeline" className="flex items-center gap-1 text-violet-400 hover:text-violet-300 text-sm transition-colors">
          View Pipeline <ChevronRight size={14} />
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Portfolio', value: fmtM(kpi.totalPotential), color: 'text-gold-400', bg: 'bg-gold-500/8 border-gold-500/20' },
          { label: 'In Progress (G1+G2)', value: fmtM(kpi.inProgressSaving), color: 'text-info-400', bg: 'bg-info-500/8 border-info-500/20' },
          { label: 'Confirmed (G3)', value: fmtM(kpi.confirmedSaving), color: 'text-success-400', bg: 'bg-success-500/8 border-success-500/20' },
          { label: 'Idea Pipeline', value: `${kpi.totalCases} ideas`, color: 'text-violet-400', bg: 'bg-violet-500/8 border-violet-500/20' },
        ].map((k) => (
          <div key={k.label} className={`rounded-xl p-4 border ${k.bg}`}>
            <div className="text-slate-500 text-xs mb-1">{k.label}</div>
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-navy-900 border border-white/10 rounded-2xl p-5 shadow-card">
          <h3 className="text-white font-semibold text-sm mb-4">Gate-wise Savings (£k)</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={gateData} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#0f1629', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                labelStyle={{ color: '#fff' }}
                formatter={(v: any, _: any, entry: any) => [`${fmtM((Number(v) || 0) * 1000)} (${entry?.payload?.count ?? 0} ideas)`, 'Savings']}
              />
              <Bar dataKey="saving" radius={[4, 4, 0, 0]}>
                {gateData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-navy-900 border border-white/10 rounded-2xl p-5 shadow-card">
          <h3 className="text-white font-semibold text-sm mb-4">Vehicle-wise Annual Saving</h3>
          {vehicleData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={vehicleData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={2}>
                    {vehicleData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#0f1629', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                    formatter={(v: any) => [`${fmtM((Number(v) || 0) * 1000)}`, 'Annual saving']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1.5">
                {vehicleData.map((v, i) => (
                  <div key={v.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-slate-300">{v.name}</span>
                    <span className="text-slate-500 ml-auto">{fmtM(v.value * 1000)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-slate-600 text-sm">No vehicle data yet.</p>}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-navy-900 border border-white/10 rounded-2xl p-5 lg:col-span-1 shadow-card">
          <h3 className="text-white font-semibold text-sm mb-4">Commodity-wise (£k)</h3>
          {commData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={commData} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip
                  contentStyle={{ background: '#0f1629', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  formatter={(v: any) => [fmtM((Number(v) || 0) * 1000), 'Saving']}
                />
                <Bar dataKey="saving" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-slate-600 text-sm">No commodity data yet.</p>}
        </div>

        <div className="bg-navy-900 border border-white/10 rounded-2xl p-5 lg:col-span-1 shadow-card">
          <h3 className="text-white font-semibold text-sm mb-4">Savings Timeline (£k)</h3>
          {yearData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={yearData} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="year" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#0f1629', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  formatter={(v: any) => [fmtM((Number(v) || 0) * 1000), 'Annual saving']}
                />
                <Bar dataKey="saving" fill="#60a5fa" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-slate-600 text-sm">No timeline data yet.</p>}
        </div>

        <div className="bg-navy-900 border border-white/10 rounded-2xl p-5 lg:col-span-1 shadow-card">
          <h3 className="text-white font-semibold text-sm mb-4">Top Ideas by Saving</h3>
          <div className="space-y-2">
            {kpi.topIdeas.slice(0, 6).map((idea, i) => (
              <div key={idea.id} className="flex items-center gap-2.5">
                <span className="text-slate-600 text-xs w-4 flex-shrink-0">{i + 1}</span>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${GATE_DOT[idea.gate] || 'bg-slate-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium truncate">{idea.ideaTitle}</p>
                  <p className="text-slate-600 text-xs">{idea.ideaNumber}</p>
                </div>
                <span className="text-gold-400 text-xs font-bold flex-shrink-0">{fmtM(idea.totalAnnualSaving)}</span>
              </div>
            ))}
            {kpi.topIdeas.length === 0 && <p className="text-slate-600 text-sm">No ideas yet.</p>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

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
  const { user, token, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [recentAnalyses, setRecentAnalyses] = useState<RecentAnalysis[]>([]);
  const [serverProjects, setServerProjects] = useState<ServerProject[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [savingsPipeline, setSavingsPipeline] = useState({ total: 0, investigating: 0, approved: 0, committedSavings: 0, investigatingSavings: 0 });
  const [viewMode, setViewMode] = useState<'list' | 'rollup'>('list');
  const [pipelineKpi, setPipelineKpi] = useState<PipelineKpi | null>(null);

  // Compute annotation summary across all projects from localStorage
  const annotationStats = useMemo(() => {
    let approved = 0;
    let investigating = 0;
    let rejected = 0;

    // Collect all project ids: server projects + local analyses
    const projectIds = new Set<string>();
    serverProjects.forEach(p => projectIds.add(p.id));
    recentAnalyses.forEach(a => projectIds.add(a.id));

    // Also scan all localStorage keys for any brainspark_annotations_ entries
    // in case the user has projects not yet listed (edge case)
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('brainspark_annotations_')) {
          const id = key.replace('brainspark_annotations_', '');
          projectIds.add(id);
        }
      }
    } catch {}

    projectIds.forEach(id => {
      try {
        const raw = localStorage.getItem(`brainspark_annotations_${id}`);
        if (!raw) return;
        const parsed: Record<string, { status: string; note?: string }> = JSON.parse(raw);
        Object.values(parsed).forEach(ann => {
          const s = (ann.status || '').toLowerCase();
          if (s === 'approved') approved++;
          else if (s === 'investigating') investigating++;
          else if (s === 'rejected') rejected++;
        });
      } catch {}
    });

    const reviewed = approved + investigating + rejected;
    const total = serverProjects.reduce((s, p) => s + (p.summary?.totalIdeas || 0), 0)
      || recentAnalyses.reduce((s, a) => s + (a.ideasCount || 0), 0);

    return { approved, investigating, rejected, reviewed, total };
  }, [serverProjects, recentAnalyses]);

  useEffect(() => {
    // Load localStorage fallback
    try {
      const stored = localStorage.getItem('brainspark_recent_analyses');
      if (stored) setRecentAnalyses(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    if (!loading && token) {
      fetch('/api/projects', { headers: { Authorization: `Bearer ${token}` } })
        .then(async r => {
          if (r.status === 401) { signOut(); navigate('/auth'); return []; }
          if (!r.ok) return [];
          return r.json();
        })
        .then(data => setServerProjects(Array.isArray(data) ? data : []))
        .catch(() => {});

      fetch('/api/business-cases/kpi', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setPipelineKpi(data); })
        .catch(() => {});
    }
  }, [token, loading, signOut, navigate]);

  useEffect(() => {
    function parseAnnual(val?: string): number {
      if (!val) return 0;
      const c = (val || '').toLowerCase().replace(/[€€$¥₹,\s%]/g, '');
      const parts = c.split(/[–—]/);
      const parseOne = (s: string) => {
        const m = s.match(/([\d.]+)\s*([mk]?)/);
        if (!m) return 0;
        return parseFloat(m[1]) * (m[2] === 'm' ? 1_000_000 : m[2] === 'k' ? 1_000 : 1);
      };
      return parts.length >= 2 ? (parseOne(parts[0]) + parseOne(parts[1])) / 2 : parseOne(c);
    }

    let total = 0, investigating = 0, approved = 0, committedSavings = 0, investigatingSavings = 0;
    serverProjects.forEach(p => {
      let annotations: Record<string, { status: string }> = {};
      let ideas: Array<{ id: string; costSavingPotential?: { annualValue?: string } }> = [];
      const localAnnotationsRaw = localStorage.getItem(`brainspark_annotations_${p.id}`);
      let usedLocalAnnotations = false;
      if (localAnnotationsRaw) {
        try {
          const parsed = JSON.parse(localAnnotationsRaw);
          if (parsed && typeof parsed === 'object') { annotations = parsed; usedLocalAnnotations = true; }
        } catch {}
      }
      if (!usedLocalAnnotations && p.annotations) annotations = p.annotations;
      try { ideas = JSON.parse(localStorage.getItem(`brainspark_ideas_${p.id}`) || '[]'); } catch {}

      const ideaValueMap: Record<string, number> = {};
      ideas.forEach(i => { ideaValueMap[i.id] = parseAnnual(i.costSavingPotential?.annualValue); });

      total += p.summary?.totalIdeas || 0;
      Object.entries(annotations).forEach(([ideaId, ann]) => {
        const val = ideaValueMap[ideaId] || 0;
        if (ann.status === 'approved') { approved++; committedSavings += val; }
        if (ann.status === 'investigating') { investigating++; investigatingSavings += val; }
      });
    });
    setSavingsPipeline({ total, investigating, approved, committedSavings, investigatingSavings });
  }, [serverProjects]);

  async function deleteProject(id: string) {
    if (!token) return;
    setDeletingId(id);
    try {
      const r = await fetch(`/api/projects/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setServerProjects(prev => prev.filter(p => p.id !== id));
      else toast('Failed to delete project', 'error');
    } finally { setDeletingId(null); }
  }

  async function shareProject(id: string) {
    if (!token) return;
    setSharingId(id);
    try {
      const r = await fetch(`/api/projects/${id}/share`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiryDays: 30 }),
      });
      if (!r.ok) { toast('Failed to create share link', 'error'); return; }
      const data = await r.json();
      setShareUrl(`${window.location.origin}${data.shareUrl}`);
    } finally { setSharingId(null); }
  }

  async function openServerProject(id: string, p: ServerProject) {
    if (!token) return;
    try {
      const r = await fetch(`/api/projects/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) { toast('Could not load project — please try again', 'error'); return; }
      const project = await r.json();
      sessionStorage.setItem('analysisResult', JSON.stringify({
        id: project.id, config: project.config, ideas: project.ideas, sources: project.sources,
        summary: project.summary, generatedAt: project.generatedAt,
      }));
      sessionStorage.setItem('analysisSystemName', p.systemName);
      sessionStorage.setItem('analysisSubName', p.subassemblyName);
      if (Array.isArray(project.ideas)) {
        localStorage.setItem(`brainspark_ideas_${id}`, JSON.stringify(project.ideas));
      }
      navigate('/results');
    } catch { toast('Could not load project — please try again', 'error'); }
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

        {/* First-run feature tour (dismissible) */}
        <div className="!mt-0"><OnboardingBanner /></div>

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
              {firstName} <span className="text-gold-400" aria-hidden="true">👋</span>
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

        {/* ── Pipeline KPI Dashboard ── */}
        {pipelineKpi && pipelineKpi.totalCases > 0 && (
          <PipelineKpiSection kpi={pipelineKpi} />
        )}

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {[
            { icon: TrendingDown, label: 'Systems Covered', value: '13', sub: 'BIW to Next-Gen EV', color: 'text-gold-400', bg: 'bg-gold-500/10' },
            { icon: Lightbulb,   label: 'Parts Catalogued', value: '250+', sub: 'across all systems', color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { icon: BarChart3,   label: 'Projects Saved', value: String(serverProjects.length || recentAnalyses.length), sub: 'cloud-synced', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { icon: Star,        label: 'Total Ideas', value: String(serverProjects.reduce((s, p) => s + (p.summary?.totalIdeas || 0), 0) || '—'), sub: 'across all projects', color: 'text-purple-400', bg: 'bg-purple-500/10' },
          ].map(({ icon: Icon, label, value, sub, color, bg }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.07, duration: 0.38 }}
              whileHover={{ y: -3, transition: { duration: 0.15 } }}
              className="rounded-xl bg-navy-900 border border-white/8 p-5 flex items-start gap-4 shadow-card"
            >
              <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={18} className={color} />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{value}</p>
                <p className="text-xs text-slate-400 leading-tight">{label}</p>
                <p className="text-xs text-slate-600 leading-tight mt-0.5">{sub}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Generate ideas from your own part — CAD → Idea / Image → Idea */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12 }}
        >
          <div className="flex items-baseline gap-2 mb-3">
            <h2 className="text-white font-semibold">Generate ideas from your part</h2>
            <span className="text-slate-500 text-xs">Upload a part + its current condition → grounded cost-reduction ideas</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([
              { to: '/idea-studio?mode=cad', icon: Box, title: 'CAD → Idea', desc: 'Upload STL / STEP / DXF — geometry, features & DFMA feed the AI', accent: 'from-gold-500/15 to-amber-500/5', ring: 'border-gold-500/25', ic: 'text-gold-400' },
              { to: '/idea-studio?mode=image', icon: ImageIcon, title: 'Image → Idea', desc: 'Upload a photo or drawing — AI vision reads it, you add the specs', accent: 'from-teal-500/15 to-cyan-500/5', ring: 'border-teal-500/25', ic: 'text-teal-400' },
            ] as const).map(({ to, icon: Icon, title, desc, accent, ring, ic }) => (
              <button key={to} onClick={() => navigate(to)}
                className={`text-left rounded-2xl bg-gradient-to-br ${accent} border ${ring} p-5 hover:scale-[1.01] transition-transform shadow-card`}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-11 h-11 rounded-xl bg-navy-900/60 flex items-center justify-center flex-shrink-0"><Icon size={22} className={ic} /></div>
                  <span className="text-white font-bold text-lg">{title}</span>
                  <Sparkles size={15} className="text-gold-400 ml-auto" />
                </div>
                <p className="text-slate-400 text-sm leading-snug">{desc}</p>
              </button>
            ))}
          </div>
        </motion.div>

        {serverProjects.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="rounded-2xl bg-navy-900 border border-white/8 p-6 shadow-card"
          >
            <div className="flex items-center gap-2 mb-5">
              <TrendingDown size={16} className="text-emerald-400" />
              <h2 className="text-white font-semibold">Savings Pipeline</h2>
              <span className="text-slate-600 text-xs ml-auto">Ideas by workflow status across all projects</span>
            </div>
            <div className="flex items-end gap-1 h-20 mb-4">
              {[
                { label: 'Total Ideas', value: savingsPipeline.total, color: 'bg-blue-500', textColor: 'text-blue-400' },
                { label: 'Investigating', value: savingsPipeline.investigating, color: 'bg-amber-500', textColor: 'text-amber-400' },
                { label: 'Approved', value: savingsPipeline.approved, color: 'bg-emerald-500', textColor: 'text-emerald-400' },
              ].map((bar, i) => {
                const maxVal = savingsPipeline.total || 1;
                const heightPct = Math.max((bar.value / maxVal) * 100, 4);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end gap-2">
                    <span className={`text-xs font-bold ${bar.textColor}`}>{bar.value}</span>
                    <div className={`w-full rounded-t-lg ${bar.color}/70`} style={{ height: `${heightPct}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4">
              {[
                { label: 'Total Ideas', color: 'bg-blue-500', value: savingsPipeline.total },
                { label: 'Investigating', color: 'bg-amber-500', value: savingsPipeline.investigating },
                { label: 'Approved', color: 'bg-emerald-500', value: savingsPipeline.approved },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-1.5 text-xs text-slate-400">
                  <div className={`w-2 h-2 rounded-full ${item.color}`} />
                  {item.label}: <span className="text-white font-medium">{item.value}</span>
                </div>
              ))}
            </div>
            {(savingsPipeline.committedSavings > 0 || savingsPipeline.investigatingSavings > 0) && (
              <div className="mt-4 pt-4 border-t border-white/8 grid grid-cols-2 gap-4">
                <div className="p-3 rounded-xl bg-success-500/8 border border-success-500/15">
                  <div className="text-success-400 text-xs font-semibold uppercase tracking-wider mb-1">Committed Savings</div>
                  <div className="text-success-300 text-2xl font-black">
                    {savingsPipeline.committedSavings >= 1_000_000
                      ? `£${(savingsPipeline.committedSavings / 1_000_000).toFixed(1)}M`
                      : savingsPipeline.committedSavings >= 1_000
                      ? `£${Math.round(savingsPipeline.committedSavings / 1_000)}k`
                      : `£${Math.round(savingsPipeline.committedSavings)}`}/yr
                  </div>
                  <div className="text-slate-500 text-xs mt-0.5">{savingsPipeline.approved} approved idea{savingsPipeline.approved !== 1 ? 's' : ''}</div>
                </div>
                <div className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/15">
                  <div className="text-amber-400 text-xs font-semibold uppercase tracking-wider mb-1">Under Investigation</div>
                  <div className="text-amber-300 text-2xl font-black">
                    {savingsPipeline.investigatingSavings >= 1_000_000
                      ? `£${(savingsPipeline.investigatingSavings / 1_000_000).toFixed(1)}M`
                      : savingsPipeline.investigatingSavings >= 1_000
                      ? `£${Math.round(savingsPipeline.investigatingSavings / 1_000)}k`
                      : `£${Math.round(savingsPipeline.investigatingSavings)}`}/yr
                  </div>
                  <div className="text-slate-500 text-xs mt-0.5">{savingsPipeline.investigating} idea{savingsPipeline.investigating !== 1 ? 's' : ''}</div>
                </div>
              </div>
            )}
            {savingsPipeline.committedSavings === 0 && savingsPipeline.total > 0 && (
              <p className="mt-3 text-slate-600 text-xs">Open any project and annotate ideas as "Approved" to see your committed savings total here.</p>
            )}
          </motion.div>
        )}

        {/* Annotation Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.18 }}
          className="rounded-2xl bg-navy-900 border border-white/8 p-6 shadow-card"
        >
          <div className="flex items-center gap-2 mb-5">
            <ClipboardList size={16} className="text-gold-400" />
            <h2 className="text-white font-semibold">Annotation Summary</h2>
            <span className="text-slate-600 text-xs ml-auto">Ideas reviewed across all projects</span>
          </div>

          {annotationStats.reviewed === 0 ? (
            <p className="text-slate-500 text-sm">
              Start reviewing ideas — open any analysis and annotate ideas as Approved, Investigating, or Rejected.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4 mb-5">
                {/* Approved */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-success-500/8 border border-success-500/15">
                  <CheckCircle size={18} className="text-success-400 flex-shrink-0" />
                  <div>
                    <p className="text-success-300 text-xl font-bold leading-none">{annotationStats.approved}</p>
                    <p className="text-success-600 text-xs mt-0.5">Approved</p>
                  </div>
                </div>

                {/* Investigating */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/8 border border-amber-500/15">
                  <AlertCircle size={18} className="text-amber-400 flex-shrink-0" />
                  <div>
                    <p className="text-amber-300 text-xl font-bold leading-none">{annotationStats.investigating}</p>
                    <p className="text-amber-600 text-xs mt-0.5">Investigating</p>
                  </div>
                </div>

                {/* Rejected */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-danger-500/8 border border-danger-500/15">
                  <XCircle size={18} className="text-danger-400 flex-shrink-0" />
                  <div>
                    <p className="text-danger-300 text-xl font-bold leading-none">{annotationStats.rejected}</p>
                    <p className="text-danger-600 text-xs mt-0.5">Rejected</p>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              {annotationStats.total > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-slate-400 text-xs">
                      {annotationStats.reviewed} of {annotationStats.total} total ideas reviewed
                    </span>
                    <span className="text-slate-500 text-xs font-medium">
                      {Math.round((annotationStats.reviewed / annotationStats.total) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-navy-800 border border-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-400 transition-all duration-500"
                      style={{ width: `${Math.min((annotationStats.reviewed / annotationStats.total) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6">

          {/* Recent analyses */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="lg:col-span-2 rounded-2xl bg-navy-900 border border-white/8 p-6 shadow-card"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-gold-400" />
                <h2 className="text-white font-semibold">Recent Analyses</h2>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setViewMode('list')} className={`px-2 py-1 rounded text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-gold-500/20 text-gold-400' : 'text-slate-500 hover:text-white'}`}>List</button>
                <button onClick={() => setViewMode('rollup')} className={`px-2 py-1 rounded text-xs font-medium transition-colors ${viewMode === 'rollup' ? 'bg-gold-500/20 text-gold-400' : 'text-slate-500 hover:text-white'}`}>Rollup</button>
                {recentAnalyses.length > 0 && (
                  <button onClick={clearHistory} className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-400 transition-colors">
                    <Trash2 size={12} /> Clear
                  </button>
                )}
              </div>
            </div>

            {shareUrl && (
              <div className="mb-4 p-3 rounded-xl bg-success-500/10 border border-success-500/20 flex items-center gap-3">
                <span className="text-success-400 text-xs flex-1 truncate">{shareUrl}</span>
                <button onClick={() => { navigator.clipboard.writeText(shareUrl); }} className="text-xs text-success-400 hover:text-white border border-success-500/30 px-2 py-1 rounded-lg transition-colors">Copy</button>
                <button onClick={() => setShareUrl(null)} className="text-slate-500 hover:text-white transition-colors text-xs">✕</button>
              </div>
            )}
            {viewMode === 'rollup' && serverProjects.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-white/8">
                      <th className="text-left py-2 pr-4 font-medium">Programme / System</th>
                      <th className="text-right py-2 pr-2 font-medium">Ideas</th>
                      <th className="text-right py-2 pr-2 font-medium">Quick Wins</th>
                      <th className="text-right py-2 font-medium">Strategic</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serverProjects.map(p => (
                      <tr key={p.id} className="border-b border-white/5 hover:bg-white/3 cursor-pointer transition-colors" onClick={() => openServerProject(p.id, p)}>
                        <td className="py-2.5 pr-4">
                          <div className="text-white font-medium truncate max-w-[200px]">{p.systemName}</div>
                          {p.vehicleType && <div className="text-gold-500 text-xs truncate max-w-[200px]">{p.vehicleType}</div>}
                        </td>
                        <td className="text-right py-2.5 pr-2 text-blue-400 font-bold">{p.summary?.totalIdeas || 0}</td>
                        <td className="text-right py-2.5 pr-2 text-success-400">{p.summary?.quickWins || 0}</td>
                        <td className="text-right py-2.5 text-amber-400">{p.summary?.strategicItems || 0}</td>
                      </tr>
                    ))}
                    <tr className="font-bold text-slate-300">
                      <td className="py-2.5 pr-4 text-xs uppercase tracking-wider">Total</td>
                      <td className="text-right py-2.5 pr-2 text-blue-400">{serverProjects.reduce((s, p) => s + (p.summary?.totalIdeas || 0), 0)}</td>
                      <td className="text-right py-2.5 pr-2 text-success-400">{serverProjects.reduce((s, p) => s + (p.summary?.quickWins || 0), 0)}</td>
                      <td className="text-right py-2.5 text-amber-400">{serverProjects.reduce((s, p) => s + (p.summary?.strategicItems || 0), 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {viewMode === 'list' && (
              serverProjects.length === 0 && recentAnalyses.length === 0 ? (
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
                        <span className="text-xs text-success-400 font-medium">{p.summary?.totalIdeas || 0} ideas</span>
                        {p.summary?.quickWins > 0 && <span className="text-xs text-success-400">{p.summary.quickWins} QW</span>}
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
                        <span className="text-xs text-success-400 font-medium">{a.ideasCount} ideas</span>
                        <ChevronRight size={14} className="text-slate-600 group-hover:text-gold-400 transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
              )
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
            <div className="rounded-2xl bg-navy-900 border border-white/8 p-6 shadow-card">
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
            <div className="rounded-2xl bg-navy-900 border border-white/8 p-6 shadow-card">
              <div className="flex items-center gap-2 mb-4">
                <BookOpen size={16} className="text-emerald-400" />
                <h3 className="text-white font-semibold text-sm">What's New in v3.0.0</h3>
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
            ].map(({ label, system, sub, icon }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.42 + i * 0.09, duration: 0.4 }}
                whileHover={{ y: -4, boxShadow: '0 12px 32px rgba(0,0,0,0.35)', transition: { duration: 0.18 } }}
              >
                <Link
                  to="/analyze"
                  state={{ preselect: { system, subassembly: sub } }}
                  className="flex items-center gap-4 p-4 rounded-xl bg-navy-900 border border-white/8 hover:border-gold-500/30 transition-colors group shadow-card"
                >
                  <span className="text-2xl" aria-hidden="true">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium group-hover:text-gold-300 transition-colors truncate">{label}</p>
                    <p className="text-slate-500 text-xs truncate">{sub}</p>
                  </div>
                  <ChevronRight size={14} className="text-slate-600 group-hover:text-gold-400 transition-colors flex-shrink-0" />
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.div>

      </div>
    </div>
  );
}
