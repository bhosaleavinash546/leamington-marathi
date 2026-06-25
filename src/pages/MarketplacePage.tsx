import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Store, Star, TrendingDown, Clock, ChevronDown, ChevronUp, CheckCircle,
  Lightbulb, ThumbsUp, ChevronRight, GitMerge, Layers,
} from 'lucide-react';
import BusinessCaseModal from '../components/BusinessCaseModal';
import IdeaDetailPanel from '../components/IdeaDetailPanel';
import { toast } from '../hooks/useToast';
import type { CostReductionIdea } from '../types';

interface MarketplaceIdea {
  id: string;
  title: string;
  system: string;
  costSavingType: string;
  annualSaving: string;
  difficulty: string;
  timeToImplement: string;
  stars: number;
  verified: boolean;
  description: string;
  ideaData?: string | null;
}

interface RecentAnalysis {
  id: string;
  systemName: string;
  subassemblyName: string;
  partName: string;
  ideasCount: number;
  timestamp: string;
}

interface AnnotationEntry {
  status: 'Approved' | 'Investigating' | 'Rejected';
  note?: string;
}

interface ApprovedIdeaInsight {
  title: string;
  systemName: string;
  status: 'Approved' | 'Investigating';
}

// ─── Commodity taxonomy ────────────────────────────────────────────────────────

type CommodityColor = 'slate' | 'blue' | 'violet' | 'green' | 'teal' | 'orange' | 'amber' | 'sky' | 'indigo';

interface CommodityGroup {
  label: string;
  key: string;
  color: CommodityColor;
  systems: string[];
}

const COMMODITY_GROUPS: CommodityGroup[] = [
  {
    label: 'All Commodities',
    key: 'All',
    color: 'slate',
    systems: [],
  },
  {
    label: 'Battery & BMS',
    key: 'Battery',
    color: 'blue',
    systems: [
      'Battery Pack', 'Battery Pack Assembly', 'Battery Modules', 'Battery Cells',
      'Pack Thermal Management', 'Battery Management System', 'Pack Safety & Protection',
      'Pack Structural & NVH', 'HV Distribution',
    ],
  },
  {
    label: 'Electric Drive (EDU)',
    key: 'EDU',
    color: 'violet',
    systems: [
      'EDU / Electric Drive Unit', 'EDU Housing Assembly', 'Electric Motor Stator',
      'Electric Motor Rotor', 'Motor Cooling', 'Inverter Assembly',
      'Gearbox & Reduction Drive', 'EDU Lubrication', 'EDU Thermal Management',
      'EDU HV Interfaces', 'Control & Sensing', '800V System Level', 'EDU Rotor',
    ],
  },
  {
    label: 'Chassis',
    key: 'Chassis',
    color: 'green',
    systems: ['Chassis'],
  },
  {
    label: 'Driveline',
    key: 'Driveline',
    color: 'teal',
    systems: ['Driveline'],
  },
  {
    label: 'BIW / Body Structure',
    key: 'BIW',
    color: 'orange',
    systems: ['Body Structure'],
  },
  {
    label: 'Interior',
    key: 'Interior',
    color: 'amber',
    systems: ['Interior', 'Acoustic / NVH'],
  },
  {
    label: 'Exterior',
    key: 'Exterior',
    color: 'sky',
    systems: ['Exterior', 'Lighting', 'Sealing / Glazing'],
  },
  {
    label: 'Electrical',
    key: 'Electrical',
    color: 'indigo',
    systems: ['Electrical Architecture', 'Thermal Management'],
  },
];

// Tailwind colour classes — must be written as complete strings (no dynamic construction)
const COLOR_TAB_ACTIVE: Record<CommodityColor, string> = {
  slate:  'bg-slate-500/20 text-slate-200 border-slate-400/40',
  blue:   'bg-blue-500/20 text-blue-400 border-blue-500/40',
  violet: 'bg-violet-500/20 text-violet-400 border-violet-500/40',
  green:  'bg-green-500/20 text-green-400 border-green-500/40',
  teal:   'bg-teal-500/20 text-teal-400 border-teal-500/40',
  orange: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  amber:  'bg-amber-500/20 text-amber-400 border-amber-500/40',
  sky:    'bg-sky-500/20 text-sky-400 border-sky-500/40',
  indigo: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40',
};

const COLOR_BADGE: Record<CommodityColor, string> = {
  slate:  'bg-slate-500/10 text-slate-400 border-slate-500/20',
  blue:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
  violet: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  green:  'bg-green-500/10 text-green-400 border-green-500/20',
  teal:   'bg-teal-500/10 text-teal-400 border-teal-500/20',
  orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  amber:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  sky:    'bg-sky-500/10 text-sky-400 border-sky-500/20',
  indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
};

const DIFFICULTIES = ['All', 'Low', 'Medium', 'High'];

function getCommodityForSystem(system: string): CommodityGroup | null {
  for (const grp of COMMODITY_GROUPS) {
    if (grp.key !== 'All' && grp.systems.includes(system)) return grp;
  }
  return null;
}

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
        ([, v]) => v.status === 'Approved' || v.status === 'Investigating'
      );
      if (entries.length > 0) {
        projectsWithAnnotations += 1;
        for (const [slug, v] of entries) {
          if (v.status === 'Approved' || v.status === 'Investigating') {
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
        (a.status === 'Approved' ? -1 : 1) - (b.status === 'Approved' ? -1 : 1)
    );

    return {
      approvedIdeas: collected.slice(0, 5),
      totalApproved: collected.filter(x => x.status === 'Approved').length,
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
    setInsights(loadInsightsFromLocalStorage());
  }, []);

  // ── Derived state ──────────────────────────────────────────────────────────

  const selectedCommodity =
    COMMODITY_GROUPS.find(g => g.key === filterCommodity) ?? COMMODITY_GROUPS[0];

  // System dropdown: only show systems that exist in loaded data, scoped to commodity
  const availableSystems = (() => {
    const inData = new Set(ideas.map(i => i.system));
    if (filterCommodity === 'All') {
      return ['All Systems', ...Array.from(inData).sort()];
    }
    return [
      'All Systems',
      ...selectedCommodity.systems.filter(s => inData.has(s)),
    ];
  })();

  // Per-commodity idea counts for tab badges
  const commodityCounts: Record<string, number> = {};
  for (const grp of COMMODITY_GROUPS) {
    commodityCounts[grp.key] =
      grp.key === 'All'
        ? ideas.length
        : ideas.filter(i => grp.systems.includes(i.system)).length;
  }

  const filtered = ideas.filter(idea => {
    const matchQ =
      !searchQ ||
      idea.title.toLowerCase().includes(searchQ.toLowerCase()) ||
      idea.description.toLowerCase().includes(searchQ.toLowerCase());
    const matchCommodity =
      filterCommodity === 'All' || selectedCommodity.systems.includes(idea.system);
    const matchSys = filterSystem === 'All Systems' || idea.system === filterSystem;
    const matchDiff = filterDiff === 'All' || idea.difficulty === filterDiff;
    return matchQ && matchCommodity && matchSys && matchDiff;
  });

  const approvedSystems = new Set(
    insights.approvedIdeas
      .filter(x => x.status === 'Approved')
      .map(x => x.systemName.toLowerCase())
  );

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleCommodityChange(key: string) {
    setFilterCommodity(key);
    setFilterSystem('All Systems');
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
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${idea.status === 'Approved' ? 'bg-green-400' : 'bg-amber-400'}`} />
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
            {filtered.map((idea, i) => {
              const commodity = getCommodityForSystem(idea.system);
              return (
                <motion.div
                  key={idea.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
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
                      onClick={e => { e.stopPropagation(); setPipelineIdea(idea); }}
                      className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors text-xs"
                    >
                      <Layers size={11} /> Add to Pipeline
                    </button>
                  </div>
                </motion.div>
              );
            })}

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

        <p className="text-center text-slate-700 text-xs mt-8">
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
