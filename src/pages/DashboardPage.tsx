import { useEffect, useState, useMemo, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ChevronRight, ArrowRight, Sparkles, Lightbulb, CheckCircle, Trash2, Share2,
  Zap, Calculator, Box, Target, Store, ShieldCheck, GitMerge,
} from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { loadFullResult } from '../services/claude-service';
import { toast } from '../hooks/useToast';
import { TOOL_GROUPS } from '../config/tools';

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

// ── helpers shared between PipelineKpiSection and module ──────────────────────
const GATE_COLORS: Record<string, string> = { G0: '#94a3b8', G1: '#fbbf24', G2: '#60a5fa', G3: '#34d399' };
const PIE_COLORS = ['#f59e0b', '#60a5fa', '#34d399', '#a78bfa', '#fb923c'];
const GATE_DOT: Record<string, string> = { G0: 'bg-slate-400', G1: 'bg-amber-400', G2: 'bg-blue-400', G3: 'bg-green-400' };

function fmtM(n: number) {   // GBP — the app-wide display currency
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
    <div className="space-y-5">
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
    </div>
  );
}

// Suggestion chips under the hero input — each deep-links into the right tool.
const HERO_CHIPS = [
  { icon: Zap,        label: 'Generate ideas for a system', to: '/analyze' },
  { icon: Calculator, label: 'Should-cost a part',          to: '/should-cost' },
  { icon: Box,        label: 'Upload CAD → instant cost',   to: '/cad-to-cost' },
  { icon: Target,     label: 'Resolve a trade-off with TRIZ', to: '/triz' },
  { icon: Store,      label: 'Browse proven ideas',         to: '/marketplace' },
];

// First-run checklist — mirrors the global OnboardingChecklist's tracked steps.
const SETUP_STEPS = [
  { id: 'generate',   label: 'Generate your first ideas', sub: 'Pick a vehicle system and let the AI propose savings', to: '/analyze' },
  { id: 'shouldcost', label: 'Should-cost a part',        sub: 'Get a defensible bottom-up cost in seconds',          to: '/should-cost' },
  { id: 'teach',      label: 'Teach the engine one real quote', sub: 'Calibrate estimates with a supplier price',      to: '/should-cost' },
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
  const [pipelineKpi, setPipelineKpi] = useState<PipelineKpi | null>(null);
  const [ask, setAsk] = useState('');

  // Compute annotation summary across all projects from localStorage
  const annotationStats = useMemo(() => {
    let approved = 0;
    let investigating = 0;
    let rejected = 0;

    const projectIds = new Set<string>();
    serverProjects.forEach(p => projectIds.add(p.id));
    recentAnalyses.forEach(a => projectIds.add(a.id));

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
      const c = (val || '').toLowerCase().replace(/[€€$¥₹£,\s%]/g, '');
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

  function openLocalAnalysis(a: RecentAnalysis) {
    if (loadFullResult(a.id)) navigate('/results');
    else toast('This analysis is no longer stored on this device.', 'error');
  }

  function submitAsk(e: FormEvent) {
    e.preventDefault();
    const q = ask.trim();
    // The typed brief prefills the analysis context — honest routing, no fake NL magic.
    navigate('/analyze', q ? { state: { prefillContext: q } } : undefined);
  }

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const hasData = serverProjects.length > 0 || recentAnalyses.length > 0;
  // Prefer the pipeline tool's server-side KPIs; fall back to annotation-derived savings.
  const committed = pipelineKpi?.confirmedSaving || savingsPipeline.committedSavings;
  const inFlight = pipelineKpi?.inProgressSaving || savingsPipeline.investigatingSavings;
  const ideaCount = savingsPipeline.total || annotationStats.total;
  const reviewedPct = annotationStats.total > 0 ? Math.round((annotationStats.reviewed / annotationStats.total) * 100) : 0;
  const projectCount = serverProjects.length || recentAnalyses.length;
  const topIdeas = pipelineKpi?.topIdeas?.slice(0, 3) ?? [];

  // First-run checklist state (shared with the global OnboardingChecklist).
  const doneSteps = useMemo(() => {
    try { return (JSON.parse(localStorage.getItem('brainspark_onboarding_v1') || '{}').done || {}) as Record<string, boolean>; }
    catch { return {} as Record<string, boolean>; }
  }, []);

  const recents: Array<{ id: string; title: string; sub: string; meta: string; onOpen: () => void; server?: ServerProject }> = serverProjects.length > 0
    ? serverProjects.slice(0, 6).map(p => ({
        id: p.id,
        title: p.systemName,
        sub: p.partName || p.subassemblyName,
        meta: `${p.summary?.totalIdeas ?? 0} ideas · ${new Date(p.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
        onOpen: () => openServerProject(p.id, p),
        server: p,
      }))
    : recentAnalyses.slice(0, 6).map(a => ({
        id: a.id,
        title: a.systemName,
        sub: a.partName || a.subassemblyName,
        meta: `${a.ideasCount} ideas · ${new Date(a.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
        onOpen: () => openLocalAnalysis(a),
      }));

  return (
    <div className="min-h-screen bg-navy-950 pt-24 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">

        {/* ── Hybrid AI hero ─────────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
          <h1 className="text-[22px] font-semibold text-white tracking-[-0.01em]">
            {greeting}, {firstName} <span className="text-slate-500 font-normal">— where shall we find savings today?</span>
          </h1>

          <form onSubmit={submitAsk} className="mt-4">
            <div className="flex items-center gap-3 rounded-2xl bg-navy-900 border border-gold-500/30 px-4 py-3.5 shadow-lg shadow-black/30 focus-within:border-gold-500/60 transition-colors">
              <Sparkles size={18} className="text-gold-400 shrink-0" />
              <input
                value={ask}
                onChange={e => setAsk(e.target.value)}
                placeholder="Describe a part, a system, or a cost problem — then start the analysis…"
                className="flex-1 bg-transparent text-[15px] text-white placeholder:text-slate-500 focus:outline-none min-w-0"
                aria-label="Start a cost analysis"
              />
              <button
                type="submit"
                className="w-9 h-9 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 flex items-center justify-center transition-colors shrink-0"
                aria-label="Start analysis"
              >
                <ArrowRight size={17} />
              </button>
            </div>
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            {HERO_CHIPS.map(c => (
              <Link
                key={c.label}
                to={c.to}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-300 text-xs font-medium hover:border-gold-500/30 hover:text-white transition-colors"
              >
                <c.icon size={12} className="text-gold-400" /> {c.label}
              </Link>
            ))}
          </div>
        </motion.div>

        {hasData ? (
          <>
            {/* ── Savings proof strip ───────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.08 }}
              className="mt-8 grid grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] gap-3.5"
            >
              <div className="col-span-2 lg:col-span-1 rounded-2xl bg-navy-900 border border-gold-500/20 p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Committed savings</div>
                <div className="text-[34px] font-bold text-white tracking-tight leading-tight mt-1">
                  {fmtM(committed)} <span className="text-sm font-medium text-slate-500">/yr</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {savingsPipeline.approved} approved ideas · <span className="text-gold-300">{fmtM(inFlight)} under investigation</span>
                </div>
              </div>
              {[
                { label: 'Ideas generated', value: String(ideaCount || '—'), sub: `${projectCount} saved ${projectCount === 1 ? 'analysis' : 'analyses'}` },
                { label: 'Reviewed', value: `${reviewedPct}%`, sub: `${annotationStats.reviewed} of ${annotationStats.total} ideas` },
                { label: 'Investigating', value: String(savingsPipeline.investigating || annotationStats.investigating), sub: 'ideas in review' },
              ].map(k => (
                <div key={k.label} className="rounded-2xl bg-navy-900 border border-white/8 p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">{k.label}</div>
                  <div className="text-[24px] font-bold text-white tracking-tight mt-1">{k.value}</div>
                  <div className="text-xs text-slate-500 mt-1">{k.sub}</div>
                </div>
              ))}
            </motion.div>

            {/* ── Next best actions ─────────────────────────────────────── */}
            {topIdeas.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.14 }} className="mt-8">
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-white font-semibold text-[15px]">Next best actions — top savings in your pipeline</h2>
                  <Link to="/pipeline" className="text-gold-400 hover:text-gold-300 text-xs font-semibold">View pipeline →</Link>
                </div>
                <div className="space-y-2.5">
                  {topIdeas.map(idea => (
                    <Link
                      key={idea.id}
                      to="/pipeline"
                      className="flex items-center gap-3.5 rounded-xl bg-navy-900 border border-white/8 hover:border-gold-500/25 px-4 py-3 transition-colors group"
                    >
                      <span className="w-9 h-9 rounded-lg bg-gold-500/12 text-gold-400 flex items-center justify-center shrink-0">
                        <Lightbulb size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-[13.5px] font-semibold truncate">{idea.ideaTitle}</p>
                        <p className="text-slate-500 text-xs mt-0.5">
                          {idea.commodityName || idea.ideaNumber}
                          <span className={`inline-block w-1.5 h-1.5 rounded-full mx-2 align-middle ${GATE_DOT[idea.gate] || 'bg-slate-500'}`} />
                          Gate {idea.gate}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-emerald-400 text-sm font-bold">{fmtM(idea.totalAnnualSaving)}/yr</div>
                        <div className="text-slate-600 text-[10px]">estimated</div>
                      </div>
                      <ChevronRight size={15} className="text-slate-600 group-hover:text-gold-400 transition-colors shrink-0" />
                    </Link>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── Recent analyses ───────────────────────────────────────── */}
            {recents.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.2 }} className="mt-8">
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-white font-semibold text-[15px]">Recent analyses</h2>
                  {recentAnalyses.length > 0 && serverProjects.length === 0 && (
                    <button
                      onClick={() => { localStorage.removeItem('brainspark_recent_analyses'); setRecentAnalyses([]); }}
                      className="text-slate-500 hover:text-slate-300 text-xs"
                    >Clear history</button>
                  )}
                </div>
                {shareUrl && (
                  <div className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-2.5 text-xs text-emerald-300">
                    <CheckCircle size={13} className="shrink-0" />
                    <span className="truncate">Share link (30 days): {shareUrl}</span>
                    <button
                      onClick={() => { navigator.clipboard?.writeText(shareUrl).then(() => toast('Link copied', 'success')).catch(() => {}); }}
                      className="ml-auto shrink-0 font-semibold text-emerald-200 hover:text-white"
                    >Copy</button>
                    <button onClick={() => setShareUrl(null)} className="shrink-0 text-emerald-400/70 hover:text-white">✕</button>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {recents.map(r => (
                    <div key={r.id} className="rounded-xl bg-navy-900 border border-white/8 hover:border-white/15 p-4 transition-colors group">
                      <button onClick={r.onOpen} className="block w-full text-left">
                        <p className="text-white text-[13.5px] font-semibold truncate">{r.title}</p>
                        <p className="text-slate-500 text-xs truncate mt-0.5">{r.sub}</p>
                        <p className="text-slate-600 text-[11px] mt-2">{r.meta}</p>
                      </button>
                      <div className="mt-2.5 pt-2.5 border-t border-white/6 flex items-center gap-3">
                        <button onClick={r.onOpen} className="text-gold-400 hover:text-gold-300 text-xs font-semibold">Open →</button>
                        {r.server && (
                          <>
                            <button
                              onClick={() => shareProject(r.id)}
                              disabled={sharingId === r.id}
                              className="ml-auto text-slate-500 hover:text-slate-300 disabled:opacity-40"
                              title="Share (30-day link)"
                            ><Share2 size={13} /></button>
                            <button
                              onClick={() => deleteProject(r.id)}
                              disabled={deletingId === r.id}
                              className="text-slate-500 hover:text-red-400 disabled:opacity-40"
                              title="Delete"
                            ><Trash2 size={13} /></button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── Pipeline detail (below the fold) ──────────────────────── */}
            {pipelineKpi && pipelineKpi.totalCases > 0 && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.26 }} className="mt-10">
                <PipelineKpiSection kpi={pipelineKpi} />
              </motion.div>
            )}
          </>
        ) : (
          <>
            {/* ── First-run: designed empty state ───────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.08 }}
              className="mt-8 grid lg:grid-cols-[1.35fr_1fr] gap-3.5"
            >
              <div className="min-w-0 rounded-2xl bg-navy-900 border border-white/8 p-5">
                <h2 className="text-white font-semibold text-[15px] mb-2">Get set up</h2>
                {SETUP_STEPS.map((s, i) => (
                  <Link key={s.id} to={s.to} className="flex items-center gap-3 py-2.5 border-b border-white/6 last:border-0 group">
                    {doneSteps[s.id]
                      ? <span className="w-6 h-6 rounded-full bg-emerald-500 text-navy-950 flex items-center justify-center shrink-0"><CheckCircle size={13} /></span>
                      : <span className="w-6 h-6 rounded-full border border-white/20 text-slate-500 flex items-center justify-center text-[11px] font-bold shrink-0">{i + 1}</span>}
                    <div className="min-w-0">
                      <p className={`text-[13px] font-semibold ${doneSteps[s.id] ? 'text-slate-500 line-through' : 'text-white'}`}>{s.label}</p>
                      <p className="text-slate-500 text-xs truncate">{s.sub}</p>
                    </div>
                    <ChevronRight size={14} className="ml-auto text-slate-600 group-hover:text-gold-400 transition-colors shrink-0" />
                  </Link>
                ))}
              </div>
              <div className="min-w-0 rounded-2xl bg-navy-900 border border-gold-500/20 p-5">
                <ShieldCheck size={20} className="text-gold-400 mb-3" />
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">Why teams use BrainSpark</div>
                <p className="text-[13px] text-slate-300 leading-relaxed">
                  AI proposes cost-reduction ideas.<br />
                  The deterministic engine verifies every number.<br />
                  <span className="text-gold-300 font-semibold">You get savings you can defend.</span>
                </p>
              </div>
            </motion.div>

            {/* ── Toolkit explorer ──────────────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.16 }} className="mt-8">
              <h2 className="text-white font-semibold text-[15px] mb-3">Explore the toolkit</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {TOOL_GROUPS.map(group => (
                  <div key={group.id}>
                    <div className="pb-1.5 text-[10px] font-bold uppercase tracking-[0.09em] text-slate-600">{group.label}</div>
                    <div className="space-y-2">
                      {group.tools.slice(0, 3).map(t => (
                        <Link
                          key={t.id}
                          to={t.route}
                          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-navy-900 border border-white/8 hover:border-gold-500/25 text-[12.5px] font-medium text-slate-300 hover:text-white transition-colors"
                        >
                          <t.icon size={14} className="text-gold-400 shrink-0" />
                          <span className="truncate">{t.label}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
