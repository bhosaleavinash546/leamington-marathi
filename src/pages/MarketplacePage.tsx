import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Store, Star, TrendingDown, Clock, ChevronDown, ChevronUp, CheckCircle,
  Lightbulb, ThumbsUp, ChevronRight, GitMerge, Layers,
} from 'lucide-react';
import BusinessCaseModal from '../components/BusinessCaseModal';
import IdeaDetailPanel from '../components/IdeaDetailPanel';
import { toast } from '../hooks/useToast';
import type { CostReductionIdea } from '../types';
import {
  COMMODITY_GROUPS, COLOR_TAB_ACTIVE, COLOR_BADGE, getCommodityForSystem,
  type CommodityColor, type CommodityGroup,
} from '../data/commodity-taxonomy';
import { classifyIdea, POWERTRAINS, VOLTAGES, type Powertrain, type Voltage } from '../data/idea-classify.mjs';

interface MarketplaceIdea {
  id: string;
  title: string;
  system: string;
  costSavingType: string;
  annualSaving: string;
  difficulty: string;
  timeToImplement: string;
  stars: number;
  votes?: number;
  verified: boolean;
  description: string;
  ideaData?: string | null;
  level?: string | null;
}

interface RecentAnalysis {
  id: string;
  systemName: string;
  subassemblyName: string;
  partName: string;
  ideasCount: number;
  timestamp: string;
}

// Status values are the canonical lowercase AnnotationStatus written by ResultsPage.
interface AnnotationEntry {
  status: 'approved' | 'investigating' | 'rejected' | 'pending' | 'on-hold';
  note?: string;
}

interface ApprovedIdeaInsight {
  title: string;
  systemName: string;
  status: 'approved' | 'investigating';
}

// Commodity taxonomy is the single source of truth in src/data/commodity-taxonomy.ts
const DIFFICULTIES = ['All', 'Low', 'Medium', 'High'];

// ─── Local-storage insights ───────────────────────────────────────────────────

function loadInsightsFromLocalStorage(): {
  approvedIdeas: ApprovedIdeaInsight[];
  totalApproved: number;
  projectCount: number;
} {
  try {
    const raw = localStorage.getItem('brainspark_recent_analyses');
    if (!raw) return { approvedIdeas: [], totalApproved: 0, projectCount: 0 };
    const analyses: RecentAnalysis[] = JSON.parse(raw);
    if (!Array.isArray(analyses) || analyses.length === 0)
      return { approvedIdeas: [], totalApproved: 0, projectCount: 0 };

    const collected: ApprovedIdeaInsight[] = [];
    let projectsWithAnnotations = 0;

    for (const analysis of analyses) {
      const annotRaw = localStorage.getItem('brainspark_annotations_' + analysis.id);
      if (!annotRaw) continue;
      const annotations: Record<string, AnnotationEntry> = JSON.parse(annotRaw);
      const entries = Object.entries(annotations).filter(
        ([, v]) => v.status === 'approved' || v.status === 'investigating'
      );
      if (entries.length > 0) {
        projectsWithAnnotations += 1;
        for (const [slug, v] of entries) {
          if (v.status === 'approved' || v.status === 'investigating') {
            collected.push({
              title: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
              systemName: analysis.systemName,
              status: v.status,
            });
          }
        }
      }
    }

    collected.sort(
      (a, b) =>
        (a.status === 'approved' ? -1 : 1) - (b.status === 'approved' ? -1 : 1)
    );

    return {
      approvedIdeas: collected.slice(0, 5),
      totalApproved: collected.filter(x => x.status === 'approved').length,
      projectCount: projectsWithAnnotations,
    };
  } catch {
    return { approvedIdeas: [], totalApproved: 0, projectCount: 0 };
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const [searchQ, setSearchQ] = useState('');
  const [filterCommodity, setFilterCommodity] = useState('All');
  const [filterSystem, setFilterSystem] = useState('All Systems');
  const [filterDiff, setFilterDiff] = useState('All');
  const [filterLevel, setFilterLevel] = useState('All');
  const [filterPowertrain, setFilterPowertrain] = useState<'All' | Powertrain>('All');
  const [filterVoltage, setFilterVoltage] = useState<'All' | Voltage>('All');
  const [ideas, setIdeas] = useState<MarketplaceIdea[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(true);
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitForm, setSubmitForm] = useState({
    title: '', system: '', costSavingType: '', annualSaving: '',
    difficulty: 'Medium', timeToImplement: '', description: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');
  const [pipelineIdea, setPipelineIdea] = useState<MarketplaceIdea | null>(null);
  const [expandedIdeaId, setExpandedIdeaId] = useState<string | null>(null);
  const [insights, setInsights] = useState<{
    approvedIdeas: ApprovedIdeaInsight[];
    totalApproved: number;
    projectCount: number;
  }>({ approvedIdeas: [], totalApproved: 0, projectCount: 0 });

  useEffect(() => {
    fetch('/api/marketplace')
      .then(r => (r.ok ? r.json() : []))
      .then(data => setIdeas(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingIdeas(false));

    // Prefer server-side annotations (cross-device); fall back to localStorage.
    const token = (() => { try { return JSON.parse(localStorage.getItem('brainspark_auth') || '{}').token; } catch { return null; } })();
    const local = loadInsightsFromLocalStorage();
    setInsights(local);
    if (token) {
      fetch('/api/projects', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => (r.ok ? r.json() : null))
        .then((projects) => {
          if (!Array.isArray(projects)) return;
          const collected: ApprovedIdeaInsight[] = [];
          let projectsWithAnnotations = 0;
          for (const p of projects) {
            const ann = (p.annotations && typeof p.annotations === 'object') ? p.annotations : {};
            const entries = Object.entries(ann).filter(([, v]: [string, any]) => v?.status === 'approved' || v?.status === 'investigating');
            if (entries.length > 0) projectsWithAnnotations += 1;
            for (const [slug, v] of entries as [string, any][]) {
              collected.push({
                title: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                systemName: p.systemName || '',
                status: v.status,
              });
            }
          }
          collected.sort((a, b) => (a.status === 'approved' ? -1 : 1) - (b.status === 'approved' ? -1 : 1));
          // Use server data if it found anything; otherwise keep the local fallback.
          if (collected.length > 0 || projectsWithAnnotations > 0) {
            setInsights({
              approvedIdeas: collected.slice(0, 5),
              totalApproved: collected.filter(x => x.status === 'approved').length,
              projectCount: projectsWithAnnotations,
            });
          }
        })
        .catch(() => {});
    }
  }, []);

  // ── Derived state ──────────────────────────────────────────────────────────

  // Resolve each idea's commodity key once (exact + keyword classifier) so no idea
  // is orphaned. Memoised over the loaded set.
  const commodityKeyOf = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const idea of ideas) map.set(idea.id, getCommodityForSystem(idea.system)?.key ?? null);
    return map;
  }, [ideas]);
  const inCommodity = (idea: MarketplaceIdea) =>
    filterCommodity === 'All' || commodityKeyOf.get(idea.id) === filterCommodity;

  // System dropdown: systems present in the data, scoped to the active commodity
  const availableSystems = (() => {
    const inScope = ideas.filter(inCommodity).map(i => i.system).filter(Boolean);
    return ['All Systems', ...Array.from(new Set(inScope)).sort()];
  })();

  // Per-commodity idea counts for tab badges
  const commodityCounts: Record<string, number> = {};
  for (const grp of COMMODITY_GROUPS) {
    commodityCounts[grp.key] =
      grp.key === 'All'
        ? ideas.length
        : ideas.filter(i => commodityKeyOf.get(i.id) === grp.key).length;
  }

  // Classify every idea once (powertrain + voltage) — memoised so it only re-runs
  // when the loaded idea set changes, not on every keystroke/filter toggle.
  const classification = useMemo(() => {
    const map = new Map<string, { powertrains: Powertrain[]; voltages: Voltage[] }>();
    for (const idea of ideas) map.set(idea.id, classifyIdea(idea));
    return map;
  }, [ideas]);

  // Sort + incremental rendering: 1,600 unvirtualised motion cards previously
  // rendered at once with delay=i*0.03 — card #900 faded in after 27 seconds.
  const [sortBy, setSortBy] = useState<'featured' | 'saving' | 'votes' | 'newest'>('featured');
  const [visibleCount, setVisibleCount] = useState(60);

  const parseSaving = (v: string) => {
    const m = /([\d.]+)\s*([MK]?)/i.exec(String(v || '').replace(/,/g, ''));
    if (!m) return 0;
    return parseFloat(m[1]) * (m[2].toUpperCase() === 'M' ? 1e6 : m[2].toUpperCase() === 'K' ? 1e3 : 1);
  };

  const filtered = ideas.filter(idea => {
    const matchQ =
      !searchQ ||
      idea.title.toLowerCase().includes(searchQ.toLowerCase()) ||
      idea.description.toLowerCase().includes(searchQ.toLowerCase());
    const matchCommodity = inCommodity(idea);
    const matchSys = filterSystem === 'All Systems' || idea.system === filterSystem;
    const matchDiff = filterDiff === 'All' || idea.difficulty === filterDiff;
    const matchLevel =
      filterLevel === 'All' ||
      (filterLevel === 'Part' && idea.level === 'part') ||
      (filterLevel === 'System' && idea.level !== 'part');
    const cls = classification.get(idea.id);
    const matchPowertrain =
      filterPowertrain === 'All' || !!cls?.powertrains.includes(filterPowertrain);
    const matchVoltage =
      filterVoltage === 'All' || !!cls?.voltages.includes(filterVoltage);
    return matchQ && matchCommodity && matchSys && matchDiff && matchLevel && matchPowertrain && matchVoltage;
  });

  const sorted = sortBy === 'featured' ? filtered : [...filtered].sort((a, b) => {
    if (sortBy === 'saving') return parseSaving(b.annualSaving) - parseSaving(a.annualSaving);
    if (sortBy === 'votes') return (b.votes || 0) - (a.votes || 0) || b.stars - a.stars;
    return String(b.id).localeCompare(String(a.id));   // newest ≈ latest pack ids
  });
  const visible = sorted.slice(0, visibleCount);

  // Counts for the powertrain / voltage chips (respecting the active commodity tab)
  const facetScope = ideas.filter(inCommodity);
  const powertrainCounts: Record<string, number> = { All: facetScope.length };
  const voltageCounts: Record<string, number> = { All: facetScope.length };
  for (const p of POWERTRAINS) powertrainCounts[p] = facetScope.filter(i => classification.get(i.id)?.powertrains.includes(p)).length;
  for (const v of VOLTAGES) voltageCounts[v] = facetScope.filter(i => classification.get(i.id)?.voltages.includes(v)).length;

  const approvedSystems = new Set(
    insights.approvedIdeas
      .filter(x => x.status === 'approved')
      .map(x => x.systemName.toLowerCase())
  );

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleCommodityChange(key: string) {
    setFilterCommodity(key);
    setFilterSystem('All Systems');
    setFilterPowertrain('All');
    setFilterVoltage('All');
  }

  async function handleSubmit() {
    if (!submitForm.title || !submitForm.description) return;
    setSubmitting(true);
    setSubmitMsg('');
    try {
      const token = (() => {
        try { return JSON.parse(localStorage.getItem('brainspark_auth') || '{}').token; }
        catch { return ''; }
      })();
      const r = await fetch('/api/marketplace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(submitForm),
      });
      const d = await r.json();
      setSubmitMsg(d.message || 'Submitted!');
      setSubmitForm({
        title: '', system: '', costSavingType: '', annualSaving: '',
        difficulty: 'Medium', timeToImplement: '', description: '',
      });
      setTimeout(() => { setShowSubmit(false); setSubmitMsg(''); }, 3000);
    } catch {
      setSubmitMsg('Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gold-500/15 border border-gold-500/25 mb-4">
            <Store size={28} className="text-gold-400" />
          </div>
          <h1 className="text-4xl font-black text-white mb-3">Idea Marketplace</h1>
          <p className="text-slate-400">
            Proven cost reduction ideas from the BrainSpark community — anonymised, validated, and ready to apply to your programme.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs">
            <CheckCircle size={11} /> Verified ideas confirmed in production by OEM engineering teams
          </div>
        </div>

        {/* Insights from Your Projects */}
        {insights.approvedIdeas.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex items-start gap-3 p-4 rounded-2xl bg-navy-900 border border-white/8"
          >
            <Lightbulb size={18} className="text-slate-500 mt-0.5 flex-shrink-0" />
            <p className="text-slate-500 text-sm">Annotate ideas in your analyses to see personalised insights here.</p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-2xl bg-navy-900 border border-gold-500/20"
          >
            <div className="flex items-center gap-2 mb-3">
              <ThumbsUp size={15} className="text-gold-400" />
              <h2 className="text-white font-semibold text-sm">Insights from Your Projects</h2>
              <span className="ml-auto flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gold-500/15 border border-gold-500/25 text-gold-400 text-xs font-medium">
                {insights.totalApproved} approved idea{insights.totalApproved !== 1 ? 's' : ''} across{' '}
                {insights.projectCount} project{insights.projectCount !== 1 ? 's' : ''}
              </span>
            </div>
            <ul className="space-y-1.5">
              {insights.approvedIdeas.map((idea, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-slate-300">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${idea.status === 'approved' ? 'bg-green-400' : 'bg-amber-400'}`} />
                  <span className="flex-1 truncate">{idea.title}</span>
                  <span className="text-slate-500 flex-shrink-0">{idea.systemName}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {/* ── Commodity tabs ── */}
        <div
          className="flex gap-2 mb-4 overflow-x-auto pb-1"
          style={{ scrollbarWidth: 'none' }}
        >
          {COMMODITY_GROUPS.map(grp => (
            <button
              key={grp.key}
              onClick={() => handleCommodityChange(grp.key)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                filterCommodity === grp.key
                  ? COLOR_TAB_ACTIVE[grp.color]
                  : 'text-slate-400 border-white/10 hover:border-white/25 hover:text-white'
              }`}
            >
              {grp.label}
              <span
                className={`inline-flex items-center justify-center min-w-[1.25rem] px-1 py-px rounded-full text-xs leading-none ${
                  filterCommodity === grp.key
                    ? 'bg-white/20 text-current'
                    : 'bg-white/5 text-slate-600'
                }`}
              >
                {commodityCounts[grp.key] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* ── Search + sub-filters ── */}
        <div className="flex flex-wrap gap-3 mb-6">
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Search ideas..."
            className="flex-1 min-w-[200px] bg-navy-900 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/30"
          />

          {/* System sub-filter */}
          <div className="relative">
            <select
              value={filterSystem}
              onChange={e => setFilterSystem(e.target.value)}
              className="bg-navy-900 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm appearance-none focus:outline-none focus:border-gold-500/30 pr-8"
            >
              {availableSystems.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-3.5 text-slate-500 pointer-events-none" />
          </div>

          {/* Difficulty buttons */}
          <div className="flex gap-1.5">
            {DIFFICULTIES.map(d => (
              <button
                key={d}
                onClick={() => setFilterDiff(d)}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  filterDiff === d
                    ? 'bg-gold-500/20 text-gold-400 border-gold-500/30'
                    : 'text-slate-400 border-white/10 hover:border-white/25 hover:text-white'
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Level buttons (part vs sub-assembly/system) */}
          <div className="flex gap-1.5">
            {['All', 'Part', 'System'].map(l => (
              <button
                key={l}
                onClick={() => setFilterLevel(l)}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  filterLevel === l
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                    : 'text-slate-400 border-white/10 hover:border-white/25 hover:text-white'
                }`}
                title={l === 'Part' ? 'Part-level ideas (single discrete component)' : l === 'System' ? 'Sub-assembly / system-level ideas' : 'All levels'}
              >
                {l === 'All' ? 'All Levels' : l}
              </button>
            ))}
          </div>
        </div>

        {/* Powertrain + Voltage facets */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider mr-1">Powertrain</span>
            {(['All', ...POWERTRAINS] as const).map(p => (
              <button
                key={p}
                onClick={() => setFilterPowertrain(p)}
                disabled={p !== 'All' && powertrainCounts[p] === 0}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                  filterPowertrain === p
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'text-slate-400 border-white/10 hover:border-white/25 hover:text-white'
                }`}
                title={p === 'All' ? 'All powertrains' : `${p}-specific ideas`}
              >
                {p === 'All' ? 'All' : p}
                <span className="ml-1 opacity-50">{p === 'All' ? powertrainCounts.All : powertrainCounts[p]}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider mr-1">Architecture</span>
            {(['All', ...VOLTAGES] as const).map(v => (
              <button
                key={v}
                onClick={() => setFilterVoltage(v)}
                disabled={v !== 'All' && voltageCounts[v] === 0}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                  filterVoltage === v
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                    : 'text-slate-400 border-white/10 hover:border-white/25 hover:text-white'
                }`}
                title={v === 'All' ? 'All architectures' : `${v} architecture ideas`}
              >
                {v === 'All' ? 'All' : v}
                <span className="ml-1 opacity-50">{v === 'All' ? voltageCounts.All : voltageCounts[v]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Results header */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-slate-500 text-sm">
            {filtered.length} idea{filtered.length !== 1 ? 's' : ''} · Community-submitted, anonymised
          </p>
          <button
            onClick={() => setShowSubmit(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold-500/15 border border-gold-500/25 text-gold-400 text-sm font-medium hover:bg-gold-500/25 transition-colors"
          >
            + Submit an Idea
          </button>
        </div>

        {/* Submit form */}
        {showSubmit && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="bg-navy-900 rounded-2xl border border-gold-500/20 p-5 mb-6 space-y-3"
          >
            <h3 className="text-white font-semibold">Share a Proven Idea</h3>
            <p className="text-slate-400 text-xs">
              Submit a cost reduction idea your team has proven in production. It will be reviewed before appearing publicly. All details are anonymised.
            </p>
            <input
              value={submitForm.title}
              onChange={e => setSubmitForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Idea title*"
              className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/30"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                value={submitForm.system}
                onChange={e => setSubmitForm(f => ({ ...f, system: e.target.value }))}
                placeholder="Vehicle system (e.g. Battery Pack)"
                className="bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/30"
              />
              <input
                value={submitForm.annualSaving}
                onChange={e => setSubmitForm(f => ({ ...f, annualSaving: e.target.value }))}
                placeholder="Annual saving (e.g. €500k)"
                className="bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/30"
              />
            </div>
            <textarea
              value={submitForm.description}
              onChange={e => setSubmitForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Technical description — what was changed, how it saved cost, any benchmark evidence*"
              rows={3}
              className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/30 resize-none"
            />
            {submitMsg && (
              <p className={`text-sm ${submitMsg.includes('failed') ? 'text-red-400' : 'text-green-400'}`}>
                {submitMsg}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={submitting || !submitForm.title || !submitForm.description}
                className="flex-1 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-950 font-semibold text-sm transition-all shadow-glow-gold"
              >
                {submitting ? 'Submitting…' : 'Submit for Review'}
              </button>
              <button
                onClick={() => setShowSubmit(false)}
                className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-400 text-sm hover:border-white/25 transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}

        {/* Ideas list */}
        {loadingIdeas ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-gold-500/30 border-t-gold-400 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-slate-500 text-xs">{sorted.length.toLocaleString()} idea{sorted.length === 1 ? '' : 's'} match</p>
              <label className="flex items-center gap-2 text-xs text-slate-400">
                Sort
                <select value={sortBy} onChange={e => { setSortBy(e.target.value as typeof sortBy); setVisibleCount(60); }}
                  className="bg-navy-900 border border-white/10 rounded-lg px-2 py-1.5 text-slate-200 text-xs">
                  <option value="featured">Featured</option>
                  <option value="saving">Highest saving</option>
                  <option value="votes">Most votes</option>
                  <option value="newest">Newest</option>
                </select>
              </label>
            </div>
            {visible.map((idea, i) => {
              const commodity = getCommodityForSystem(idea.system);
              return (
                <motion.div
                  key={idea.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 12) * 0.03 }}
                  className="bg-navy-900 border border-white/10 rounded-2xl p-5 hover:border-gold-500/25 transition-all"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <h3 className="text-white font-semibold text-base leading-tight">{idea.title}</h3>
                        {idea.verified && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs flex-shrink-0">
                            <CheckCircle size={9} /> Verified
                          </span>
                        )}
                        {approvedSystems.size > 0 && approvedSystems.has(idea.system.toLowerCase()) && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-green-400 text-xs flex-shrink-0">
                            <ThumbsUp size={9} /> Based on your approvals
                          </span>
                        )}
                      </div>

                      {/* Commodity > System breadcrumb */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {commodity && (
                          <>
                            <span className={`px-1.5 py-0.5 rounded text-xs border ${COLOR_BADGE[commodity.color]}`}>
                              {commodity.label}
                            </span>
                            <ChevronRight size={10} className="text-slate-600 flex-shrink-0" />
                          </>
                        )}
                        <span className="text-gold-500 text-xs">{idea.system}</span>
                        {idea.level === 'part' && (
                          <span className="px-1.5 py-0.5 rounded text-xs border bg-purple-500/10 text-purple-300 border-purple-500/25">Part-level</span>
                        )}
                        {classification.get(idea.id)?.powertrains.map(p => (
                          <span key={p} className="px-1.5 py-0.5 rounded text-xs border bg-emerald-500/10 text-emerald-300 border-emerald-500/25">{p}</span>
                        ))}
                        {classification.get(idea.id)?.voltages.map(v => (
                          <span key={v} className="px-1.5 py-0.5 rounded text-xs border bg-sky-500/10 text-sky-300 border-sky-500/25">{v}</span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-amber-400 text-xs font-medium flex-shrink-0">
                      <Star size={12} fill="currentColor" /> {idea.stars}
                    </div>
                  </div>

                  {/* Parsed idea data available — show rich expand section */}
                  {(() => {
                    const parsedIdea: CostReductionIdea | null = (() => {
                      try { return idea.ideaData ? JSON.parse(idea.ideaData) : null; } catch { return null; }
                    })();
                    const isExpanded = expandedIdeaId === idea.id;

                    return parsedIdea ? (
                      <>
                        {/* Collapsed: show short description only */}
                        <p className="text-slate-400 text-sm leading-relaxed mb-3 line-clamp-3">{parsedIdea.technicalDescription}</p>

                        {/* Expanded: full IdeaDetailPanel */}
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.22, ease: 'easeInOut' }}
                              className="overflow-hidden mb-3"
                            >
                              <div className="pt-1 border-t border-white/8 mt-2">
                                <IdeaDetailPanel idea={parsedIdea} />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <button
                          onClick={e => { e.stopPropagation(); setExpandedIdeaId(isExpanded ? null : idea.id); }}
                          className="flex items-center gap-1 text-gold-400 hover:text-gold-300 text-xs font-medium transition-colors mb-3"
                        >
                          {isExpanded ? <><ChevronUp size={12} /> Collapse</> : <><ChevronDown size={12} /> Full Technical Detail</>}
                        </button>
                      </>
                    ) : (
                      <p className="text-slate-400 text-sm leading-relaxed mb-4">{idea.description}</p>
                    );
                  })()}

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    <span className="text-success-400 font-semibold">{idea.annualSaving}/yr</span>
                    <span className={`px-2 py-0.5 rounded-full border ${
                      idea.difficulty === 'Low'
                        ? 'bg-success-500/10 text-success-400 border-success-500/30'
                        : idea.difficulty === 'Medium'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-danger-500/10 text-danger-400 border-danger-500/30'
                    }`}>
                      {idea.difficulty}
                    </span>
                    <span className="flex items-center gap-1"><Clock size={10} />{idea.timeToImplement}</span>
                    <span className="flex items-center gap-1"><TrendingDown size={10} />{idea.costSavingType}</span>
                    <button
                      onClick={async e => {
                        e.stopPropagation();
                        const token = (() => { try { return JSON.parse(localStorage.getItem('brainspark_auth') || '{}').token; } catch { return null; } })();
                        if (!token) { toast('Sign in to vote', 'error'); return; }
                        try {
                          const r = await fetch(`/api/marketplace/${idea.id}/vote`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
                          const d = await r.json();
                          if (r.ok) setIdeas(prev => prev.map(i => i.id === idea.id ? { ...i, votes: d.votes } : i));
                        } catch { /* best-effort */ }
                      }}
                      className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gold-500/30 bg-gold-500/10 text-gold-300 hover:bg-gold-500/20 transition-colors text-xs"
                      title="Vote for this idea"
                    >
                      ▲ {idea.votes || 0}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setPipelineIdea(idea); }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors text-xs"
                    >
                      <Layers size={11} /> Add to Pipeline
                    </button>
                  </div>
                </motion.div>
              );
            })}

            {sorted.length > visibleCount && (
              <button
                onClick={() => setVisibleCount(c => c + 120)}
                className="w-full py-3 rounded-2xl border border-white/10 bg-navy-900 text-slate-300 text-sm hover:border-gold-500/30 hover:text-gold-300 transition-colors"
              >
                Show more ({(sorted.length - visibleCount).toLocaleString()} remaining)
              </button>
            )}

            {filtered.length === 0 && (
              <div className="text-center py-16 text-slate-500">
                <Store size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No ideas match your filters.</p>
                {filterCommodity !== 'All' && (
                  <button
                    onClick={() => handleCommodityChange('All')}
                    className="mt-3 text-xs text-gold-400 hover:text-gold-300 underline underline-offset-2"
                  >
                    Show all commodities
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <p className="text-center text-slate-500 text-xs mt-8">
          Ideas are anonymised community contributions. Always validate applicability for your specific programme.
        </p>
      </div>

      <AnimatePresence>
        {pipelineIdea && (
          <BusinessCaseModal
            ideaTitle={pipelineIdea.title}
            ideaSource="marketplace"
            systemName={pipelineIdea.system}
            onClose={() => setPipelineIdea(null)}
            onSaved={() => { setPipelineIdea(null); toast('Added to Pipeline', 'success'); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
