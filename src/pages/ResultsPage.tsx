import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, animate } from 'framer-motion';
import {
  FileDown, FileSpreadsheet, Presentation, ArrowLeft, Filter,
  TrendingDown, Zap, AlertTriangle, CheckCircle, Clock,
  ChevronDown, ChevronUp, BarChart3, RefreshCw, Tag,
  Globe, ExternalLink, ChevronRight, Search, DollarSign, Calculator,
  ShieldCheck, BookOpen, FlaskConical, Lightbulb, Scale, Link2,
  MessageSquare, CheckSquare, XSquare, Bot, Send, Map, Share2, ClipboardList, X
} from 'lucide-react';
import TypingDots from '../components/ui/TypingDots';
import ButtonSpinner from '../components/ui/ButtonSpinner';
import { AnalysisResult, CostReductionIdea, CostSavingType, Difficulty, SearchSource, ConfidenceLevel, EvidenceSource, IdeaAnnotation, AnnotationStatus, ChatMessage } from '../types';
import { exportToExcel, exportToPowerPoint, exportToPdf, exportRfqPdf } from '../services/export-service';
import { useAuth } from '../contexts/AuthContext';
import { generateCostReductionIdeas, sendChatMessage, loadFullResult } from '../services/claude-service';
import { toast } from '../hooks/useToast';
import IdeasDashboard from '../components/results/IdeasDashboard';
import BusinessCaseCalculator from '../components/results/BusinessCaseCalculator';

const DIFFICULTY_CONFIG: Record<Difficulty, { color: string; bg: string; border: string; icon: typeof CheckCircle }> = {
  Low:    { color: 'text-green-400', bg: 'bg-green-500/10',  border: 'border-green-500/30',  icon: CheckCircle },
  Medium: { color: 'text-amber-400', bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  icon: Clock },
  High:   { color: 'text-red-400',   bg: 'bg-red-500/10',    border: 'border-red-500/30',    icon: AlertTriangle },
};

const TYPE_COLORS: Record<CostSavingType, string> = {
  material:      'bg-blue-500/15   text-blue-300   border-blue-500/25',
  process:       'bg-purple-500/15 text-purple-300 border-purple-500/25',
  logistics:     'bg-cyan-500/15   text-cyan-300   border-cyan-500/25',
  complexity:    'bg-pink-500/15   text-pink-300   border-pink-500/25',
  warranty:      'bg-orange-500/15 text-orange-300 border-orange-500/25',
  tooling:       'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
  weight:        'bg-teal-500/15   text-teal-300   border-teal-500/25',
  commonisation: 'bg-lime-500/15   text-lime-300   border-lime-500/25',
};

const LEVEL_COLORS: Record<string, string> = {
  Assembly:    'bg-violet-500/15 text-violet-300 border-violet-500/25',
  Subassembly: 'bg-sky-500/15    text-sky-300    border-sky-500/25',
  Part:        'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
};

const EVIDENCE_TYPE_CONFIG: Record<EvidenceSource['type'], { label: string; color: string; bg: string }> = {
  oem_press_release: { label: 'OEM Press Release', color: 'text-blue-300',   bg: 'bg-blue-500/10 border-blue-500/20' },
  teardown:          { label: 'Teardown Study',     color: 'text-emerald-300',bg: 'bg-emerald-500/10 border-emerald-500/20' },
  patent:            { label: 'Patent',             color: 'text-violet-300', bg: 'bg-violet-500/10 border-violet-500/20' },
  industry_report:   { label: 'Industry Report',   color: 'text-amber-300',  bg: 'bg-amber-500/10 border-amber-500/20' },
  supplier_data:     { label: 'Supplier Data',      color: 'text-cyan-300',   bg: 'bg-cyan-500/10 border-cyan-500/20' },
  web_search:        { label: 'Web Search',         color: 'text-slate-300',  bg: 'bg-slate-500/10 border-slate-500/20' },
  regulatory:        { label: 'Regulatory',         color: 'text-red-300',    bg: 'bg-red-500/10 border-red-500/20' },
};

const EVIDENCE_CONFIDENCE_DOT: Record<EvidenceSource['confidence'], string> = {
  high:   'bg-green-400',
  medium: 'bg-amber-400',
  low:    'bg-red-400',
};

const CONFIDENCE_CONFIG: Record<ConfidenceLevel, { label: string; color: string; bg: string; border: string; icon: typeof ShieldCheck; title: string }> = {
  verified:     { label: 'Verified',     color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/30',   icon: ShieldCheck,   title: 'OEM confirmed in production' },
  benchmarked:  { label: 'Benchmarked',  color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    icon: BookOpen,      title: 'Teardown / industry study data' },
  estimated:    { label: 'Estimated',    color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   icon: Calculator,    title: 'Cost-model / engineering estimate' },
  theoretical:  { label: 'Theoretical', color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/30',  icon: FlaskConical,  title: 'First-principles / analytical' },
};

const ANNOTATION_STATUS_CONFIG: Record<AnnotationStatus, { label: string; color: string; bg: string; border: string }> = {
  'pending':       { label: 'Not Reviewed', color: 'text-slate-400',   bg: 'bg-slate-500/10',  border: 'border-slate-500/20' },
  'investigating': { label: 'Investigating', color: 'text-amber-400',   bg: 'bg-amber-500/10',  border: 'border-amber-500/20' },
  'approved':      { label: 'Approved',      color: 'text-green-400',   bg: 'bg-green-500/10',  border: 'border-green-500/20' },
  'rejected':      { label: 'Rejected',      color: 'text-red-400',     bg: 'bg-red-500/10',    border: 'border-red-500/20' },
  'on-hold':       { label: 'On Hold',       color: 'text-purple-400',  bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
};

function CountUp({ to }: { to: number }) {
  const countRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = countRef.current;
    if (!node) return;
    const ctrl = animate(0, to, {
      duration: 0.7,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: v => { node.textContent = Math.round(v).toString(); },
    });
    return ctrl.stop;
  }, [to]);
  return <span ref={countRef}>0</span>;
}

const CHAT_FOLLOW_UPS = [
  'What tooling investment is needed?',
  'Which OEMs have proven this approach?',
  'What are the DFMEA / regulatory risks?',
  'Draft an RFQ scope for this idea.',
  'How long to first-off-tool?',
];

function RoadmapSection({ ideas }: { ideas: CostReductionIdea[] }) {
  const [open, setOpen] = useState(false);
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);

  function phaseFor(idea: CostReductionIdea): 0 | 1 | 2 {
    if (idea.implementationDifficulty === 'Low') return 0;
    if (idea.implementationDifficulty === 'High') return 2;
    // Medium difficulty: only use time string for extreme cases
    const t = idea.timeToImplement?.toLowerCase() || '';
    if (t.includes('0-3') || t.includes('1-3') || t.includes('immediate') || t.includes('quick')) return 0;
    if (t.includes('18') || t.includes('24') || t.includes('2 year') || t.includes('3 year') || t.includes('long-term')) return 2;
    return 1;
  }

  const phases = [
    { label: 'Phase 1 — Quick Wins', sublabel: '0–6 months', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', dot: 'bg-green-400', ideas: ideas.filter(i => phaseFor(i) === 0) },
    { label: 'Phase 2 — Programme Plan', sublabel: '6–18 months', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', dot: 'bg-amber-400', ideas: ideas.filter(i => phaseFor(i) === 1) },
    { label: 'Phase 3 — Strategic', sublabel: '18+ months', color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20', dot: 'bg-violet-400', ideas: ideas.filter(i => phaseFor(i) === 2) },
  ];

  return (
    <div className="mb-8 rounded-2xl bg-navy-900 border border-white/10 overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between p-5 hover:bg-white/3 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/25 flex items-center justify-center flex-shrink-0">
            <Map size={16} className="text-emerald-400" />
          </div>
          <div className="text-left">
            <span className="text-white font-semibold text-sm">Implementation Roadmap</span>
            <p className="text-slate-500 text-xs mt-0.5">Auto-phased by difficulty & timeline</p>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
      </button>
      {open && (
        <div className="border-t border-white/8 p-5">
          <div className="grid md:grid-cols-3 gap-4">
            {phases.map(phase => (
              <div key={phase.label} className={`rounded-xl ${phase.bg} border ${phase.border} p-4`}>
                <div className={`text-xs font-bold uppercase tracking-wider ${phase.color} mb-0.5`}>{phase.label}</div>
                <div className="text-slate-500 text-xs mb-3">{phase.sublabel} · {phase.ideas.length} idea{phase.ideas.length !== 1 ? 's' : ''}</div>
                <div className="space-y-2">
                  {(expandedPhase === phases.indexOf(phase) ? phase.ideas : phase.ideas.slice(0, 6)).map(idea => (
                    <div key={idea.id} className="flex items-start gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${phase.dot} mt-1.5 flex-shrink-0`} />
                      <span className="text-slate-300 text-xs leading-relaxed">{idea.title}</span>
                    </div>
                  ))}
                  {phase.ideas.length > 6 && (
                    <button
                      onClick={() => setExpandedPhase(expandedPhase === phases.indexOf(phase) ? null : phases.indexOf(phase))}
                      className={`text-xs ${phase.color} mt-1 hover:underline`}
                    >
                      {expandedPhase === phases.indexOf(phase) ? '▲ Show less' : `+${phase.ideas.length - 6} more…`}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const REJECTION_REASONS: { key: string; label: string }[] = [
  { key: 'already_tried',       label: 'Already tried / tested' },
  { key: 'not_applicable',      label: 'Not applicable to our platform' },
  { key: 'too_risky',           label: 'Risk too high' },
  { key: 'supplier_constraint', label: 'Supplier / tooling constraint' },
  { key: 'regulatory',          label: 'Regulatory / homologation blocker' },
  { key: 'cost_too_low',        label: 'Saving too small to pursue' },
  { key: 'other',               label: 'Other reason' },
];

function IdeaCard({ idea, index, annotation, onAnnotate }: {
  idea: CostReductionIdea;
  index: number;
  annotation?: IdeaAnnotation;
  onAnnotate: (a: IdeaAnnotation) => void;
}) {
  const { token } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [showAnnotation, setShowAnnotation] = useState(false);
  const [noteText, setNoteText] = useState(annotation?.note ?? '');
  const [showSensitivity, setShowSensitivity] = useState(false);
  const [volumeMul, setVolumeMul] = useState(1.0);
  const [commodityDelta, setCommodityDelta] = useState(0);
  const [patentLoading, setPatentLoading] = useState(false);
  const [patentResult, setPatentResult] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showVavePrompt, setShowVavePrompt] = useState(false);
  const [vaveCreating, setVaveCreating] = useState(false);
  const diff = DIFFICULTY_CONFIG[idea.implementationDifficulty];

  async function handleStatusClick(status: AnnotationStatus) {
    if (status === 'rejected') {
      setShowRejectModal(true);
      return;
    }
    onAnnotate({ status, note: annotation?.note ?? noteText, updatedAt: new Date().toISOString() });
    if (status === 'approved') {
      setShowVavePrompt(true);
    }
  }

  async function submitRejection() {
    const reason = rejectReason || 'other';
    onAnnotate({ status: 'rejected', note: annotation?.note ?? noteText, updatedAt: new Date().toISOString() });
    setShowRejectModal(false);
    setRejectReason('');
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ideaTitle: idea.title,
          systemName: '',
          subassemblyName: '',
          reason,
          category: idea.costSavingTypes?.[0] || 'other',
        }),
      });
    } catch { /* non-critical */ }
  }

  async function createVaveAction() {
    setVaveCreating(true);
    try {
      await fetch('/api/vave-actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ideaTitle: idea.title,
          ideaDescription: idea.technicalDescription || '',
          systemName: '',
          subassemblyName: '',
          partName: '',
          targetSaving: idea.costSavingPotential?.annualValue || '',
          stage: 'Identified',
        }),
      });
      toast('Added to VAVE Tracker', 'success');
    } catch {
      toast('Could not create VAVE action', 'error');
    } finally {
      setVaveCreating(false);
      setShowVavePrompt(false);
    }
  }

  function parseValLocal(val?: string): number {
    if (!val) return 0;
    const c = val.toLowerCase().replace(/[€£$¥₹,\s%]/g, '');
    const parts = c.split(/[–—]/);
    const parseOne = (s: string) => {
      const m = s.match(/([\d.]+)\s*([mk]?)/);
      if (!m) return 0;
      return parseFloat(m[1]) * (m[2] === 'm' ? 1_000_000 : m[2] === 'k' ? 1_000 : 1);
    };
    return parts.length >= 2 ? (parseOne(parts[0]) + parseOne(parts[1])) / 2 : parseOne(c);
  }
  function fmtV(n: number, sym: string): string {
    if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${sym}${Math.round(n / 1_000)}k`;
    return `${sym}${Math.round(n)}`;
  }

  const baseSav = parseValLocal(idea.costSavingPotential.annualValue);
  const sym = idea.costSavingPotential.annualValue?.includes('£') ? '£'
    : idea.costSavingPotential.annualValue?.includes('$') ? '$'
    : idea.costSavingPotential.annualValue?.includes('¥') ? '¥'
    : '€';
  const isMat = idea.costSavingTypes.includes('material');
  const adjSav = baseSav * volumeMul * (isMat ? 1 + commodityDelta / 100 : 1);
  const DiffIcon = diff.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94], delay: Math.min(index * 0.04, 0.4) } }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.18 } }}
      whileHover={{ y: -2, boxShadow: '0 8px 32px rgba(245,158,11,0.12)', transition: { type: 'spring', stiffness: 400, damping: 25 } }}
      className="bg-navy-900 border border-white/10 rounded-2xl overflow-hidden hover:border-gold-500/25 transition-all cursor-default"
    >
      <div className="p-5 pb-4">
        {/* Title row */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-gold-500/15 border border-gold-500/25 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-gold-400 font-bold text-sm">{index + 1}</span>
            </div>
            <div>
              <h3 className="text-white font-semibold text-base leading-tight">{idea.title}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {idea.searchDataUsed && (
                  <div className="flex items-center gap-1">
                    <Globe size={10} className="text-blue-400" />
                    <span className="text-blue-400 text-xs">Live web data</span>
                  </div>
                )}
                {idea.confidenceLevel && (() => {
                  const conf = CONFIDENCE_CONFIG[idea.confidenceLevel];
                  const ConfIcon = conf.icon;
                  return (
                    <div title={conf.title} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-xs font-medium ${conf.bg} ${conf.color} ${conf.border}`}>
                      <ConfIcon size={10} />
                      {conf.label}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
          <span className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${diff.bg} ${diff.color} ${diff.border}`}>
            <DiffIcon size={11} /> {idea.implementationDifficulty}
          </span>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${LEVEL_COLORS[idea.systemLevel] || ''}`}>{idea.systemLevel}</span>
          {idea.costSavingTypes.map(t => (
            <span key={t} className={`px-2 py-0.5 rounded-full border text-xs font-medium capitalize ${TYPE_COLORS[t] || ''}`}>{t}</span>
          ))}
        </div>

        {/* Cost metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 rounded-xl bg-white/5 mb-3">
          <div>
            <div className="flex items-center gap-1 text-slate-500 text-xs mb-0.5"><TrendingDown size={10} /> Saving Range</div>
            <div className="text-green-400 font-bold text-sm">{idea.costSavingPotential.percentage || '—'}</div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-slate-500 text-xs mb-0.5"><DollarSign size={10} /> Annual Value</div>
            <div className="text-gold-400 font-bold text-sm">{idea.costSavingPotential.annualValue || 'TBD'}</div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-slate-500 text-xs mb-0.5"><Calculator size={10} /> Basis</div>
            <div className="text-slate-400 text-xs leading-tight">{idea.costSavingPotential.calculationBasis || idea.costSavingPotential.qualitative.split(' ')[0]}</div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-slate-500 text-xs mb-0.5"><Clock size={10} /> Timeline</div>
            <div className="text-slate-300 font-medium text-sm">{idea.timeToImplement}</div>
          </div>
        </div>

        {/* Description preview */}
        <p className={`text-slate-400 text-sm leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}>
          {idea.technicalDescription}
        </p>

        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex items-center gap-1.5 text-gold-400 hover:text-gold-300 text-sm font-medium transition-colors"
        >
          {expanded ? <><ChevronUp size={14} /> Collapse</> : <><ChevronDown size={14} /> Full Technical Detail</>}
        </button>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-white/10 p-5 space-y-5">
          <div>
            <h4 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <BarChart3 size={12} /> Manufacturing & Assembly Impact
            </h4>
            <p className="text-slate-400 text-sm leading-relaxed">{idea.manufacturingImpact}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <h4 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Tag size={12} /> DFMA Principles Applied
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {idea.dfmaPrinciples.map(p => (
                  <span key={p} className="px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs">{p}</span>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertTriangle size={12} /> Risk & Impact Notes
              </h4>
              <p className="text-slate-400 text-sm leading-relaxed">{idea.riskNotes}</p>
            </div>
          </div>

          {idea.benchmarkReference && (
            <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/15">
              <span className="text-blue-400 text-xs font-semibold uppercase tracking-wide">Industry Benchmark: </span>
              <span className="text-slate-300 text-sm">{idea.benchmarkReference}</span>
            </div>
          )}

          {idea.regulatoryContext && idea.regulatoryContext !== 'null' && (
            <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/15 flex items-start gap-2">
              <Scale size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-red-400 text-xs font-semibold uppercase tracking-wide block mb-0.5">Regulatory Driver</span>
                <span className="text-slate-300 text-sm">{idea.regulatoryContext}</span>
              </div>
            </div>
          )}

          {idea.evidenceSources && idea.evidenceSources.length > 0 && (
            <div>
              <h4 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Link2 size={12} /> Evidence Sources
              </h4>
              <div className="flex flex-wrap gap-2">
                {idea.evidenceSources.map((src, i) => {
                  const cfg = EVIDENCE_TYPE_CONFIG[src.type] || EVIDENCE_TYPE_CONFIG.web_search;
                  return (
                    <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${cfg.bg}`}>
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${EVIDENCE_CONFIDENCE_DOT[src.confidence]}`} title={`${src.confidence} confidence`} />
                      <div>
                        <div className={`font-medium ${cfg.color}`}>{src.title}{src.year ? ` (${src.year})` : ''}</div>
                        <div className="text-slate-500 text-xs">{cfg.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-xl bg-violet-500/5 border border-violet-500/15 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={13} className="text-violet-400" />
                <span className="text-violet-300 text-xs font-semibold uppercase tracking-wider">Patent Watch</span>
              </div>
              <button
                onClick={async () => {
                  const apiKey = localStorage.getItem('brainspark_api_key') || '';
                  if (!apiKey || patentLoading) return;
                  setPatentLoading(true);
                  setPatentResult(null);
                  try {
                    const r = await fetch('/api/patent-watch', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ title: idea.title, description: idea.technicalDescription, apiKey }),
                    });
                    const d = await r.json();
                    setPatentResult(d.analysis || d.error || 'No result');
                  } catch { setPatentResult('Patent search failed. Check server connection.'); }
                  finally { setPatentLoading(false); }
                }}
                disabled={patentLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/15 border border-violet-500/25 text-violet-300 text-xs font-medium hover:bg-violet-500/25 transition-colors disabled:opacity-50"
              >
                {patentLoading ? <><span className="inline-block w-3 h-3 rounded-full border-2 border-violet-300/40 border-t-violet-300 animate-spin" />Searching...</> : <><Search size={12} />Search Patents</>}
              </button>
            </div>
            {patentResult ? (
              <>
                <p className="text-slate-300 text-xs leading-relaxed">{patentResult}</p>
                <div className="mt-3 p-2.5 rounded-lg bg-amber-500/8 border border-amber-500/20 flex items-start gap-2">
                  <AlertTriangle size={11} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-amber-300/80 text-xs leading-relaxed">
                    <strong>Not legal advice.</strong> This is an AI-generated awareness check only — Claude does not have real-time USPTO/EPO access and may cite inaccurate patent numbers. Always commission a formal Freedom-to-Operate opinion from a qualified patent attorney before engineering commitment.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-slate-500 text-xs">Click to search USPTO/EPO for patent risk on this idea. Uses your AI key. <span className="text-amber-400">AI awareness only — not legal FTO advice.</span></p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-white/5">
            <div>
              <div className="text-slate-500 text-xs">Qualitative Potential</div>
              <div className="text-white text-sm font-medium mt-0.5">{idea.costSavingPotential.qualitative}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs">Calculation Basis</div>
              <div className="text-white text-sm mt-0.5">{idea.costSavingPotential.calculationBasis || 'See annual value'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Annotation panel */}
      <div className="border-t border-white/5">
        <button
          onClick={() => setShowAnnotation(v => !v)}
          className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-white/3 transition-colors group"
        >
          <div className="flex items-center gap-2">
            <MessageSquare size={12} className="text-slate-500 group-hover:text-slate-400" />
            <span className="text-slate-500 text-xs group-hover:text-slate-400">
              {annotation?.status && annotation.status !== 'pending'
                ? ANNOTATION_STATUS_CONFIG[annotation.status].label
                : 'Add annotation'}
              {annotation?.note ? ' · Has notes' : ''}
            </span>
          </div>
          {annotation?.status && annotation.status !== 'pending' && (
            <span className={`px-2 py-0.5 rounded-full text-xs border ${ANNOTATION_STATUS_CONFIG[annotation.status].bg} ${ANNOTATION_STATUS_CONFIG[annotation.status].color} ${ANNOTATION_STATUS_CONFIG[annotation.status].border}`}>
              {ANNOTATION_STATUS_CONFIG[annotation.status].label}
            </span>
          )}
        </button>

        {showAnnotation && (
          <div className="px-5 pb-4 space-y-3 border-t border-white/5 pt-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">Implementation Status</label>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(ANNOTATION_STATUS_CONFIG) as AnnotationStatus[]).map(status => (
                  <button
                    key={status}
                    onClick={() => handleStatusClick(status)}
                    className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                      annotation?.status === status
                        ? `${ANNOTATION_STATUS_CONFIG[status].bg} ${ANNOTATION_STATUS_CONFIG[status].color} ${ANNOTATION_STATUS_CONFIG[status].border}`
                        : 'text-slate-500 border-white/10 hover:border-white/25'
                    }`}
                  >
                    {ANNOTATION_STATUS_CONFIG[status].label}
                  </button>
                ))}
              </div>

              {/* VAVE tracking prompt */}
              {showVavePrompt && (
                <div className="mt-2 flex items-center gap-2 p-2.5 rounded-xl bg-green-500/8 border border-green-500/20">
                  <ClipboardList size={14} className="text-green-400 flex-shrink-0" />
                  <span className="text-green-300 text-xs flex-1">Track this idea in the VAVE pipeline?</span>
                  <button
                    onClick={createVaveAction}
                    disabled={vaveCreating}
                    className="px-2.5 py-1 rounded-lg text-xs bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30 transition-colors disabled:opacity-50"
                  >
                    {vaveCreating ? 'Adding…' : 'Add to VAVE'}
                  </button>
                  <button onClick={() => setShowVavePrompt(false)} className="text-slate-500 hover:text-slate-300 transition-colors">
                    <X size={13} />
                  </button>
                </div>
              )}

              {/* Rejection reason modal */}
              {showRejectModal && (
                <div className="mt-2 p-3 rounded-xl bg-red-500/5 border border-red-500/20 space-y-2">
                  <p className="text-red-300 text-xs font-medium">Why is this idea rejected? (helps personalise future AI output)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {REJECTION_REASONS.map(r => (
                      <button
                        key={r.key}
                        onClick={() => setRejectReason(r.key)}
                        className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                          rejectReason === r.key
                            ? 'bg-red-500/20 text-red-300 border-red-500/40'
                            : 'text-slate-500 border-white/10 hover:border-white/25'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={submitRejection}
                      className="px-3 py-1.5 rounded-lg text-xs bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                    >
                      Confirm Rejection
                    </button>
                    <button
                      onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                      className="px-3 py-1.5 rounded-lg text-xs text-slate-500 border border-white/10 hover:border-white/25 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">Engineering Notes</label>
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onBlur={() => {
                  if (noteText !== (annotation?.note ?? '')) {
                    onAnnotate({ status: annotation?.status ?? 'pending', note: noteText, updatedAt: new Date().toISOString() });
                  }
                }}
                placeholder="e.g. Reviewed with Tier-1, feasible Q3 2026. Awaiting supplier quote from Gestamp..."
                rows={3}
                className="w-full bg-navy-800 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-slate-700 focus:outline-none focus:border-gold-500/30 resize-none text-xs leading-relaxed"
              />
            </div>
            {annotation?.updatedAt && (
              <p className="text-slate-600 text-xs">Last updated: {new Date(annotation.updatedAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</p>
            )}
          </div>
        )}
      </div>

      {baseSav > 0 && (
        <div className="border-t border-white/5">
          <button onClick={() => setShowSensitivity(v => !v)}
            className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-white/3 transition-colors group">
            <div className="flex items-center gap-2">
              <TrendingDown size={12} className="text-slate-500 group-hover:text-amber-400" />
              <span className="text-slate-500 text-xs group-hover:text-slate-400">Sensitivity Analysis</span>
            </div>
            <div className="flex items-center gap-2">
              {showSensitivity && <span className="text-amber-400 text-xs font-bold">{fmtV(adjSav, sym)}/yr adjusted</span>}
              {showSensitivity ? <ChevronUp size={12} className="text-slate-500" /> : <ChevronDown size={12} className="text-slate-500" />}
            </div>
          </button>
          {showSensitivity && (
            <div className="px-5 pb-5 space-y-4 border-t border-white/5 pt-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-slate-400">Volume Multiplier</span>
                  <span className="text-amber-400 font-semibold">{volumeMul.toFixed(1)}x ({volumeMul >= 1 ? '+' : ''}{Math.round((volumeMul - 1) * 100)}%)</span>
                </div>
                <input type="range" min="0.5" max="2" step="0.05" value={volumeMul}
                  onChange={e => setVolumeMul(Number(e.target.value))}
                  className="w-full h-1.5 accent-amber-400 cursor-pointer" />
                <div className="flex justify-between text-slate-600 text-xs mt-1"><span>0.5×</span><span>2.0×</span></div>
              </div>
              {isMat && (
                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-slate-400">Commodity Price Change</span>
                    <span className={`font-semibold ${commodityDelta >= 0 ? 'text-red-400' : 'text-green-400'}`}>{commodityDelta >= 0 ? '+' : ''}{commodityDelta}%</span>
                  </div>
                  <input type="range" min="-30" max="50" step="1" value={commodityDelta}
                    onChange={e => setCommodityDelta(Number(e.target.value))}
                    className="w-full h-1.5 accent-orange-400 cursor-pointer" />
                  <div className="flex justify-between text-slate-600 text-xs mt-1"><span>-30%</span><span>+50%</span></div>
                </div>
              )}
              <div className="p-3 rounded-xl bg-white/5 flex items-center justify-between">
                <div>
                  <div className="text-slate-500 text-xs">Base Annual Saving</div>
                  <div className="text-slate-300 font-semibold">{fmtV(baseSav, sym)}/yr</div>
                </div>
                <div className="text-slate-500 text-sm">→</div>
                <div className="text-right">
                  <div className="text-slate-500 text-xs">Adjusted Saving</div>
                  <div className={`font-bold text-lg ${adjSav > baseSav ? 'text-green-400' : adjSav < baseSav ? 'text-red-400' : 'text-white'}`}>{fmtV(adjSav, sym)}/yr</div>
                </div>
              </div>
              {!isMat && <p className="text-slate-600 text-xs">Commodity slider is only active for material cost saving ideas.</p>}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

function SourcesPanel({ sources }: { sources: SearchSource[] }) {
  const [open, setOpen] = useState(false);

  if (sources.length === 0) return null;

  const PURPOSE_COLORS: Record<string, string> = {
    material_cost:       'bg-green-500/15 text-green-300 border-green-500/25',
    technology_benchmark:'bg-blue-500/15  text-blue-300  border-blue-500/25',
    oem_practice:        'bg-purple-500/15 text-purple-300 border-purple-500/25',
    supplier_capability: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
    regulatory:          'bg-red-500/15   text-red-300   border-red-500/25',
  };

  const PURPOSE_LABELS: Record<string, string> = {
    material_cost: 'Material Cost',
    technology_benchmark: 'Tech Benchmark',
    oem_practice: 'OEM Practice',
    supplier_capability: 'Supplier Tech',
    regulatory: 'Regulation',
  };

  return (
    <div className="bg-navy-900 border border-white/10 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 hover:bg-white/3 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <Globe size={16} className="text-blue-400" />
          </div>
          <div className="text-left">
            <div className="text-white font-semibold text-sm">Live Web Intelligence Sources</div>
            <div className="text-slate-400 text-xs">{sources.length} searches performed — real-time data used to ground cost estimates</div>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-white/10 p-5 space-y-4">
          {sources.map((source, i) => (
            <div key={i} className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-white/3 border-b border-white/10">
                <Search size={13} className="text-slate-400 flex-shrink-0" />
                <span className="text-slate-300 text-sm flex-1 font-medium">"{source.query}"</span>
                <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${PURPOSE_COLORS[source.purpose] || 'bg-white/10 text-slate-400 border-white/20'}`}>
                  {PURPOSE_LABELS[source.purpose] || source.purpose}
                </span>
              </div>
              <div className="p-3 space-y-2">
                {source.results.filter(r => r.snippet).slice(0, 3).map((result, ri) => (
                  <div key={ri} className="flex items-start gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0 mt-1.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {result.url ? (
                          <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 font-medium truncate flex items-center gap-1">
                            {result.title?.slice(0, 55) || result.source}
                            <ExternalLink size={10} className="flex-shrink-0" />
                          </a>
                        ) : (
                          <span className="text-slate-400 font-medium">{result.title?.slice(0, 55)}</span>
                        )}
                        <span className="text-slate-600 flex-shrink-0">· {result.source}</span>
                      </div>
                      <p className="text-slate-500 leading-relaxed line-clamp-2">{result.snippet}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ResultsPage() {
  const navigate = useNavigate();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [systemName, setSystemName] = useState('');
  const [subName, setSubName] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState<Difficulty | 'All'>('All');
  const [filterType, setFilterType] = useState<CostSavingType | 'All'>('All');
  const [filterStatus, setFilterStatus] = useState<AnnotationStatus | 'All'>('All');
  const [sortBy, setSortBy] = useState<'default' | 'roi' | 'savings' | 'ease'>('default');
  const [exporting, setExporting] = useState<'excel' | 'pptx' | 'pdf' | 'rfq' | null>(null);
  const [annotations, setAnnotations] = useState<Record<string, IdeaAnnotation>>({});
  const [showRefine, setShowRefine] = useState(false);
  const [refineFocus, setRefineFocus] = useState('');
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState('');
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [crossPollinatedIdeas, setCrossPollinatedIdeas] = useState<CostReductionIdea[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('analysisResult');
      const sys = sessionStorage.getItem('analysisSystemName');
      const sub = sessionStorage.getItem('analysisSubName');
      if (!stored) {
        const params = new URLSearchParams(window.location.search);
        const savedId = params.get('id');
        if (savedId) {
          const saved = loadFullResult(savedId);
          if (saved) {
            sessionStorage.setItem('analysisResult', JSON.stringify(saved));
            navigate('/results', { replace: true });
            return;
          }
        }
        navigate('/analyze');
        return;
      }
      const parsed: AnalysisResult = JSON.parse(stored);
      setResult(parsed);
      setSystemName(sys || '');
      setSubName(sub || '');
      // Load saved annotations
      if (parsed.id) {
        const localAnnotationsRaw = localStorage.getItem(`brainspark_annotations_${parsed.id}`);
        const hasLocalAnnotations = Boolean(localAnnotationsRaw);
        try {
          if (localAnnotationsRaw) setAnnotations(JSON.parse(localAnnotationsRaw));
        } catch {}
        const authToken = (() => { try { return JSON.parse(localStorage.getItem('brainspark_auth') || '{}').token; } catch { return null; } })();
        if (authToken) {
          // Only fall back to server annotations if local storage has none
          fetch(`/api/projects/${parsed.id}`, { headers: { Authorization: `Bearer ${authToken}` } })
            .then(r => r.ok ? r.json() : null)
            .then(proj => {
              if (!hasLocalAnnotations && proj?.annotations && Object.keys(proj.annotations).length > 0) {
                setAnnotations(proj.annotations);
                try { localStorage.setItem(`brainspark_annotations_${parsed.id}`, JSON.stringify(proj.annotations)); } catch {}
              }
            })
            .catch(() => {});
          // Fetch cross-pollinated ideas from other projects
          fetch(`/api/projects/${parsed.id}/cross-pollinate`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${authToken}` },
          })
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data?.ideas?.length > 0) setCrossPollinatedIdeas(data.ideas.slice(0, 3)); })
            .catch(() => {});
        }
      }
    } catch {
      navigate('/analyze');
    }
  }, [navigate]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  if (!result) return null;

  function parseAnnualValue(val?: string): number {
    if (!val) return 0;
    const clean = val.toLowerCase().replace(/[€£$¥₹,\s%]/g, '');
    const parts = clean.split(/[–—]/);
    const parseOne = (s: string) => {
      const m = s.match(/([\d.]+)\s*([mk]?)/);
      if (!m) return 0;
      return parseFloat(m[1]) * (m[2] === 'm' ? 1_000_000 : m[2] === 'k' ? 1_000 : 1);
    };
    return parts.length >= 2 ? (parseOne(parts[0]) + parseOne(parts[1])) / 2 : parseOne(clean);
  }
  const DIFF_RANK: Record<Difficulty, number> = { Low: 1, Medium: 3, High: 9 };

  const filtered = result.ideas
    .filter(idea => {
      const matchDiff = filterDifficulty === 'All' || idea.implementationDifficulty === filterDifficulty;
      const matchType = filterType === 'All' || idea.costSavingTypes.includes(filterType);
      const ann = annotations[idea.id];
      const matchStatus = filterStatus === 'All' || (ann?.status ?? 'pending') === filterStatus;
      return matchDiff && matchType && matchStatus;
    })
    .sort((a, b) => {
      if (sortBy === 'roi') {
        const rA = parseAnnualValue(a.costSavingPotential.annualValue) / DIFF_RANK[a.implementationDifficulty];
        const rB = parseAnnualValue(b.costSavingPotential.annualValue) / DIFF_RANK[b.implementationDifficulty];
        return rB - rA;
      }
      if (sortBy === 'savings') return parseAnnualValue(b.costSavingPotential.annualValue) - parseAnnualValue(a.costSavingPotential.annualValue);
      if (sortBy === 'ease') return DIFF_RANK[a.implementationDifficulty] - DIFF_RANK[b.implementationDifficulty];
      return 0;
    });

  function getChatSuggestions(): string[] {
    const sugs: string[] = [];
    const ideas = result!.ideas;
    const pending = ideas.filter(i => !(annotations[i.id]?.status) || annotations[i.id]?.status === 'pending');
    const investigating = ideas.filter(i => annotations[i.id]?.status === 'investigating');
    const approved = ideas.filter(i => annotations[i.id]?.status === 'approved');
    const quickWinsPending = pending.filter(i => i.implementationDifficulty === 'Low');
    const highSavings = [...ideas].sort((a, b) =>
      parseAnnualValue(b.costSavingPotential.annualValue) - parseAnnualValue(a.costSavingPotential.annualValue)
    ).slice(0, 3);

    if (pending.length > 0 && approved.length === 0) sugs.push(`You have ${pending.length} unreviewed ideas — which should we tackle first?`);
    if (quickWinsPending.length > 0) sugs.push(`You have ${quickWinsPending.length} Quick Win ideas — summarise the implementation steps for each.`);
    if (investigating.length > 0) sugs.push(`${investigating.length} idea${investigating.length > 1 ? 's are' : ' is'} under investigation — what supplier data do we need?`);
    if (approved.length > 0) sugs.push(`Which of the ${approved.length} approved idea${approved.length > 1 ? 's' : ''} has the shortest payback period?`);
    if (highSavings.length > 0) sugs.push(`Tell me more about "${highSavings[0].title}" — what are the key risks?`);
    sugs.push('Which ideas have the strongest OEM benchmark evidence?');
    sugs.push('What is the realistic total savings if we implement all Quick Wins in 6 months?');
    return sugs.slice(0, 5);
  }

  const handleExcelExport = async () => {
    setExporting('excel');
    try { exportToExcel(result, systemName, subName); } finally { setExporting(null); }
  };

  const handlePptxExport = async () => {
    setExporting('pptx');
    try { await exportToPowerPoint(result, systemName, subName); } finally { setExporting(null); }
  };

  const handlePdfExport = async () => {
    setExporting('pdf');
    try { await Promise.resolve(exportToPdf(result, systemName, subName)); } finally { setExporting(null); }
  };

  const handleRfqExport = () => {
    const approved = result.ideas.filter(idea => (annotations[idea.id]?.status ?? 'pending') === 'approved');
    if (approved.length === 0) {
      toast('No approved ideas — annotate at least one idea as "Approved" to generate an RFQ package.', 'error');
      return;
    }
    setExporting('rfq');
    try { exportRfqPdf(result, systemName, subName, approved); } finally { setExporting(null); }
  };

  const handleAnnotate = (ideaId: string, annotation: IdeaAnnotation) => {
    const updated = { ...annotations, [ideaId]: annotation };
    setAnnotations(updated);
    if (result?.id) {
      try { localStorage.setItem(`brainspark_annotations_${result.id}`, JSON.stringify(updated)); } catch {}
      const authToken = (() => { try { return JSON.parse(localStorage.getItem('brainspark_auth') || '{}').token; } catch { return null; } })();
      if (authToken) {
        fetch(`/api/projects/${result.id}/annotations`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ annotations: updated }),
        }).catch(() => {});
      }
    }
  };

  function normTitle(t: string) {
    return t.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function isDuplicate(newTitle: string, existingTitles: string[]): boolean {
    const nt = normTitle(newTitle);
    const ntWords = new Set(nt.split(' ').filter(w => w.length > 4));
    for (const et of existingTitles) {
      const etWords = et.split(' ').filter(w => w.length > 4);
      const overlap = etWords.filter(w => ntWords.has(w)).length;
      if (overlap >= 2 && overlap / Math.max(etWords.length, ntWords.size) > 0.5) return true;
    }
    return false;
  }

  const handleRefine = async () => {
    if (!refineFocus.trim() || !result) return;
    const storedKey = localStorage.getItem('brainspark_api_key') || '';
    if (!storedKey) { setRefineError('API key not found. Return to Analyze page and run a fresh analysis.'); return; }
    setRefining(true);
    setRefineError('');
    try {
      const existingTitles = result.ideas.map(i => i.title);
      const refineConfig = {
        ...result.config,
        apiKey: storedKey,
        additionalContext: `${result.config.additionalContext ? result.config.additionalContext + '\n\n' : ''}REFINEMENT PASS: These ideas already exist — DO NOT repeat them (check title similarity, not just exact match): ${existingTitles.join(' | ')}. Generate only NEW and DIFFERENT ideas. Focus specifically on: ${refineFocus.trim()}`,
      };
      const { ideas: newIdeas, sources } = await generateCostReductionIdeas(
        refineConfig, systemName, subName, undefined, true, undefined
      );
      const existingNorm = existingTitles.map(normTitle);
      const deduped = newIdeas.filter(i => !isDuplicate(i.title, existingNorm));
      const ideas = deduped;
      setResult(prev => {
        if (!prev) return prev;
        const allIdeas = [...prev.ideas, ...ideas];
        return {
          ...prev,
          ideas: allIdeas,
          sources: [...(prev.sources || []), ...sources],
          summary: {
            totalIdeas: allIdeas.length,
            quickWins: allIdeas.filter(i => i.implementationDifficulty === 'Low').length,
            programmeItems: allIdeas.filter(i => i.implementationDifficulty === 'Medium').length,
            strategicItems: allIdeas.filter(i => i.implementationDifficulty === 'High').length,
            searchesPerformed: (prev.summary.searchesPerformed || 0) + sources.length,
          },
        };
      });
      setShowRefine(false);
      setRefineFocus('');
    } catch (err) {
      setRefineError(err instanceof Error ? err.message : 'Refinement failed');
    } finally {
      setRefining(false);
    }
  };

  const handleChat = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading || !result) return;
    const apiKey = localStorage.getItem('brainspark_api_key') || result.config.apiKey || '';
    if (!apiKey) return;

    const userMsg: ChatMessage = { role: 'user', content: msg, timestamp: new Date().toISOString() };
    const newHistory = [...chatMessages, userMsg];
    setChatMessages([...newHistory, { role: 'assistant', content: '', timestamp: new Date().toISOString() }]);
    setChatInput('');
    setChatLoading(true);

    try {
      await sendChatMessage(
        filtered,
        result.config,
        systemName,
        subName,
        newHistory.map(m => ({ role: m.role, content: m.content })),
        msg,
        apiKey,
        (chunk) => {
          setChatMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: last.content + chunk };
            }
            return updated;
          });
        }
      );
    } catch (err) {
      setChatMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = { ...last, content: `Error: ${err instanceof Error ? err.message : 'Chat failed'}` };
        }
        return updated;
      });
    } finally {
      setChatLoading(false);
    }
  };

  const quickWins = result.ideas.filter(i => i.implementationDifficulty === 'Low');
  const programmeItems = result.ideas.filter(i => i.implementationDifficulty === 'Medium');
  const strategicItems = result.ideas.filter(i => i.implementationDifficulty === 'High');
  const searchUsedCount = result.ideas.filter(i => i.searchDataUsed).length;

  async function handleShare() {
    if (!result?.id) return;
    const token = (() => { try { return JSON.parse(localStorage.getItem('brainspark_auth') || '{}').token; } catch { return null; } })();
    if (!token) { toast('Sign in to create share links', 'error'); return; }
    try {
      const r = await fetch(`/api/projects/${result.id}/share`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiryDays: 30 }),
      });
      if (!r.ok) { toast('Could not generate share link — please try again', 'error'); return; }
      const data = await r.json();
      const url = `${window.location.origin}${data.shareUrl}`;
      setShareLink(url);
      navigator.clipboard.writeText(url).then(() => toast('Share link copied to clipboard!', 'success')).catch(() => {});
    } catch { toast('Could not generate share link — please try again', 'error'); }
  }

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button onClick={() => navigate('/analyze')} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-6 transition-colors">
            <ArrowLeft size={16} /> New Analysis
          </button>

          {shareLink && (
            <div className="mb-4 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center gap-3">
              <span className="text-blue-300 text-xs flex-1 truncate font-mono">{shareLink}</span>
              <button onClick={() => { navigator.clipboard.writeText(shareLink); toast('Copied!', 'success'); }} className="text-xs text-blue-300 hover:text-white border border-blue-500/30 px-2 py-1 rounded-lg transition-colors">Copy</button>
              <button onClick={() => setShareLink(null)} className="text-slate-500 hover:text-white transition-colors text-xs">✕</button>
            </div>
          )}

          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-gold-400" />
                <span className="text-gold-400 text-sm font-medium">{result.config.vehicleType}</span>
                {result.summary.searchesPerformed > 0 && (
                  <span className="flex items-center gap-1 text-blue-400 text-xs font-medium">
                    <Globe size={11} /> {result.summary.searchesPerformed} live searches
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-black text-white">{systemName}</h1>
              <p className="text-slate-400 mt-1">{subName} — {result.generatedAt}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {result.id && (
                <button
                  onClick={handleShare}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-semibold text-sm transition-all hover:scale-105"
                >
                  <Share2 size={16} /> Share
                </button>
              )}
              <button
                onClick={handleExcelExport}
                disabled={!!exporting}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold text-sm transition-all hover:scale-105"
              >
                <FileSpreadsheet size={16} />
                {exporting === 'excel' ? 'Exporting...' : 'Excel'}
              </button>
              <button
                onClick={handlePptxExport}
                disabled={!!exporting}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold text-sm transition-all hover:scale-105"
              >
                <Presentation size={16} />
                {exporting === 'pptx' ? 'Exporting...' : 'PowerPoint'}
              </button>
              <button
                onClick={handlePdfExport}
                disabled={!!exporting}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white font-semibold text-sm transition-all hover:scale-105"
              >
                <FileDown size={16} />
                {exporting === 'pdf' ? 'Exporting...' : 'PDF'}
              </button>
              <button
                onClick={handleRfqExport}
                disabled={!!exporting}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white font-semibold text-sm transition-all hover:scale-105"
                title="Export RFQ package for all Approved ideas"
              >
                <ClipboardList size={16} />
                {exporting === 'rfq' ? 'Generating...' : 'RFQ Pack'}
              </button>
            </div>
          </div>
        </div>

        {/* Ideas Analytics Dashboard */}
        <IdeasDashboard ideas={result.ideas} />

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Ideas Generated', value: result.summary.totalIdeas, icon: Zap, color: 'from-blue-500 to-indigo-600' },
            { label: 'Quick Wins', value: quickWins.length, icon: CheckCircle, color: 'from-green-500 to-emerald-600' },
            { label: 'Programme Items', value: programmeItems.length, icon: Clock, color: 'from-gold-500 to-amber-600' },
            { label: 'Strategic Items', value: strategicItems.length, icon: TrendingDown, color: 'from-red-500 to-rose-600' },
          ].map((stat) => (
            <div key={stat.label} className="bg-navy-900 border border-white/10 rounded-2xl p-5">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-3`}>
                <stat.icon size={20} className="text-white" />
              </div>
              <div className="text-3xl font-black text-white"><CountUp to={stat.value} /></div>
              <div className="text-slate-500 text-sm mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Quick wins highlight */}
        {quickWins.length > 0 && (
          <div className="mb-5 p-4 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center gap-3">
            <CheckCircle size={18} className="text-green-400 flex-shrink-0" />
            <span className="text-green-400 font-semibold">{quickWins.length} Quick Win{quickWins.length > 1 ? 's' : ''}</span>
            <span className="text-slate-400 text-sm">— Low implementation difficulty, fast-track for engineering review and supplier RFQ.</span>
          </div>
        )}

        {/* Web search notification */}
        {searchUsedCount > 0 && (
          <div className="mb-5 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center gap-3">
            <Globe size={18} className="text-blue-400 flex-shrink-0" />
            <span className="text-blue-300 text-sm">
              <strong>{searchUsedCount} ideas</strong> are grounded in live internet data — current material costs, OEM benchmarks, and technology trends fetched during analysis.
            </span>
          </div>
        )}

        {/* Cross-pollination notification */}
        {crossPollinatedIdeas.length > 0 && (
          <div className="mb-5 p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20">
            <div className="flex items-start gap-3">
              <Lightbulb size={18} className="text-purple-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-purple-300 font-semibold text-sm">Cross-Programme Ideas Available</p>
                <p className="text-slate-400 text-sm mt-0.5">{crossPollinatedIdeas.length} idea{crossPollinatedIdeas.length !== 1 ? 's' : ''} from your other projects may apply here: {crossPollinatedIdeas.map(i => i.title).join(' · ')}</p>
              </div>
            </div>
          </div>
        )}

        {/* Filters + Sort */}
        <div className="flex flex-col gap-3 mb-6 p-4 bg-navy-900 border border-white/10 rounded-2xl">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-slate-400 text-sm font-medium flex-shrink-0">
              <Filter size={14} /> Filter:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['All', 'Low', 'Medium', 'High'] as const).map(d => (
                <motion.button key={d} onClick={() => setFilterDifficulty(d)}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${filterDifficulty === d ? 'bg-gold-500/20 text-gold-400 border-gold-500/30' : 'text-slate-400 border-white/10 hover:border-white/25 hover:text-white'}`}>
                  {d === 'All' ? 'All Difficulty' : d}
                </motion.button>
              ))}
            </div>
            <div className="w-px h-4 bg-white/10 hidden sm:block" />
            <div className="flex flex-wrap gap-1.5">
              {(['All', 'material', 'process', 'tooling', 'weight', 'complexity', 'warranty', 'logistics', 'commonisation'] as const).map(t => (
                <motion.button key={t} onClick={() => setFilterType(t)}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className={`px-3 py-1 rounded-lg text-xs font-medium border capitalize transition-colors ${filterType === t ? 'bg-gold-500/20 text-gold-400 border-gold-500/30' : 'text-slate-400 border-white/10 hover:border-white/25 hover:text-white'}`}>
                  {t === 'All' ? 'All Types' : t}
                </motion.button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-slate-500 text-xs">
              <RefreshCw size={11} /> {filtered.length}/{result.ideas.length}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/6">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-medium flex-shrink-0">
              <Tag size={12} /> Status:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['All', 'pending', 'investigating', 'approved', 'rejected', 'on-hold'] as const).map(s => (
                <motion.button key={s} onClick={() => setFilterStatus(s)}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${filterStatus === s ? 'bg-gold-500/20 text-gold-400 border-gold-500/30' : 'text-slate-400 border-white/10 hover:border-white/25 hover:text-white'}`}>
                  {s === 'All' ? 'All Status' : ANNOTATION_STATUS_CONFIG[s].label}
                </motion.button>
              ))}
            </div>
            <div className="w-px h-4 bg-white/10 hidden sm:block" />
            <div className="flex items-center gap-2 text-slate-400 text-xs font-medium flex-shrink-0">
              <BarChart3 size={12} /> Sort:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([['default', 'AI Order'], ['roi', 'Best ROI'], ['savings', 'Highest Savings'], ['ease', 'Easiest First']] as const).map(([key, label]) => (
                <motion.button key={key} onClick={() => setSortBy(key)}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${sortBy === key ? 'bg-violet-500/20 text-violet-400 border-violet-500/30' : 'text-slate-400 border-white/10 hover:border-white/25 hover:text-white'}`}>
                  {label}
                </motion.button>
              ))}
            </div>
          </div>
        </div>

        {/* Ideas */}
        {filtered.length === 0 ? (
          <motion.div layout className="text-center py-12 text-slate-500">No ideas match the current filters.</motion.div>
        ) : (
          <motion.div layout className="space-y-4 mb-8">
            <AnimatePresence mode="popLayout" initial={false}>
              {filtered.map((idea, i) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  index={i}
                  annotation={annotations[idea.id]}
                  onAnnotate={(a) => handleAnnotate(idea.id, a)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Implementation Roadmap */}
        <RoadmapSection ideas={result.ideas} />

        {/* Sources panel */}
        {result.sources?.length > 0 && (
          <div className="mb-8">
            <SourcesPanel sources={result.sources} />
          </div>
        )}

        {/* Business Case Calculator */}
        <BusinessCaseCalculator />

        {/* AI Chat */}
        <div className="mb-6 rounded-2xl bg-navy-900 border border-white/10 overflow-hidden">
          <button
            onClick={() => setChatOpen(v => !v)}
            className="w-full flex items-center justify-between p-5 hover:bg-white/3 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gold-500/20 border border-gold-500/25 flex items-center justify-center flex-shrink-0">
                <Bot size={16} className="text-gold-400" />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold text-sm">Ask the Chief Engineer</span>
                  {chatMessages.length > 0 && (
                    <span className="text-xs bg-gold-500/15 text-gold-400 px-2 py-0.5 rounded-full border border-gold-500/20">
                      {Math.ceil(chatMessages.length / 2)} exchange{chatMessages.length > 2 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="text-slate-400 text-xs">Follow-up questions about any of the {result.ideas.length} generated ideas</div>
              </div>
            </div>
            {chatOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
          </button>

          {chatOpen && (
            <div className="border-t border-white/10 flex flex-col">
              {/* Message history */}
              {chatMessages.length === 0 ? (
                <div className="p-5">
                  <p className="text-slate-500 text-xs mb-3 uppercase tracking-wide font-medium">Suggested questions</p>
                  <div className="flex flex-wrap gap-2">
                    {getChatSuggestions().map(s => (
                      <button
                        key={s}
                        onClick={() => setChatInput(s)}
                        className="px-3 py-1.5 rounded-lg bg-navy-800 border border-white/10 text-slate-300 text-xs hover:border-gold-500/30 hover:text-gold-300 transition-colors text-left"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="max-h-[420px] overflow-y-auto p-5 space-y-4">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex items-start gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'assistant' && (
                        <div className="w-6 h-6 rounded-full bg-gold-500/15 border border-gold-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                          <Bot size={12} className="text-gold-400" />
                        </div>
                      )}
                      <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-gold-500/12 border border-gold-500/18 text-white rounded-tr-sm'
                          : 'bg-navy-800 border border-white/10 text-slate-200 rounded-tl-sm'
                      }`}>
                        {msg.content || (chatLoading && i === chatMessages.length - 1
                          ? <span className="flex items-center gap-2 text-slate-500 py-0.5"><TypingDots /></span>
                          : null
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              )}

              {/* Follow-up chips — shown once there's at least one AI reply */}
              {chatMessages.some(m => m.role === 'assistant' && m.content) && (
                <div className="px-5 pb-1 flex flex-wrap gap-1.5">
                  {CHAT_FOLLOW_UPS.map(s => (
                    <button
                      key={s}
                      onClick={() => setChatInput(s)}
                      className="px-2.5 py-1 rounded-lg bg-navy-800 border border-white/8 text-slate-400 text-xs hover:text-slate-200 hover:border-white/20 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {/* Input row */}
              <div className="border-t border-white/8 p-4 flex gap-2 items-center">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChat(); } }}
                  placeholder="Ask about any idea, risk, or savings estimate…"
                  disabled={chatLoading}
                  className="flex-1 bg-navy-800 border border-white/15 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-gold-500/40 text-sm disabled:opacity-60"
                />
                <button
                  onClick={handleChat}
                  disabled={!chatInput.trim() || chatLoading}
                  className="w-10 h-10 flex-shrink-0 rounded-xl bg-gold-500/15 hover:bg-gold-500/25 disabled:opacity-40 disabled:cursor-not-allowed border border-gold-500/25 flex items-center justify-center transition-colors"
                >
                  {chatLoading
                    ? <ButtonSpinner size={15} />
                    : <Send size={15} className="text-gold-400" />
                  }
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Refine Analysis */}
        <div className="mb-6 rounded-2xl bg-navy-900 border border-white/10 overflow-hidden">
          <button
            onClick={() => setShowRefine(v => !v)}
            className="w-full flex items-center justify-between p-5 hover:bg-white/3 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                <RefreshCw size={16} className="text-violet-400" />
              </div>
              <div className="text-left">
                <div className="text-white font-semibold text-sm">Refine Analysis — Generate More Ideas</div>
                <div className="text-slate-400 text-xs">Focus the AI on a specific area to generate 8 additional ideas that complement this result</div>
              </div>
            </div>
            {showRefine
              ? <ChevronUp size={16} className="text-slate-400" />
              : <ChevronRight size={16} className="text-slate-400" />}
          </button>

          {showRefine && (
            <div className="border-t border-white/10 p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Focus Area <span className="text-slate-500 font-normal">(describe what you want the AI to explore differently)</span>
                </label>
                <textarea
                  value={refineFocus}
                  onChange={e => setRefineFocus(e.target.value)}
                  placeholder="e.g. Focus on tooling cost reduction and die consolidation opportunities. Explore Tier-2 India supplier alternatives. Prioritise ideas compatible with Euro NCAP 2026 side impact requirements."
                  rows={3}
                  className="w-full bg-navy-800 border border-white/15 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/50 resize-none text-sm"
                />
              </div>
              {refineError && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertTriangle size={14} /> {refineError}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowRefine(false); setRefineFocus(''); setRefineError(''); }}
                  className="px-4 py-2 rounded-xl border border-white/15 text-slate-400 hover:text-white text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={!refineFocus.trim() || refining}
                  onClick={handleRefine}
                  className="flex items-center gap-2 px-6 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all"
                >
                  {refining ? <><ButtonSpinner size={14} /> Generating…</> : <><Zap size={14} /> Generate More Ideas</>}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Export footer */}
        <div className="p-6 rounded-2xl bg-navy-900 border border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <div className="text-white font-semibold mb-1">Export for management presentation</div>
            <div className="text-slate-400 text-sm">Excel workbook (Summary + Ideas + Roadmap) or full PowerPoint deck</div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleExcelExport} disabled={!!exporting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold text-sm">
              <FileSpreadsheet size={16} /> Excel Workbook
            </button>
            <button onClick={handlePptxExport} disabled={!!exporting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold text-sm">
              <FileDown size={16} /> PowerPoint Deck
            </button>
            <button onClick={handlePdfExport} disabled={!!exporting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white font-semibold text-sm">
              <FileDown size={16} /> PDF Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
