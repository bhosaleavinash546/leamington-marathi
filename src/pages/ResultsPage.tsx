import { useAiAvailable } from '../hooks/useAiAvailable';
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import TickNumber from '../components/dfm/TickNumber';
import ScoreRing from '../components/dfm/ScoreRing';
import { Money, FxNote } from '../components/ui/Money';
import {
  FileDown, FileSpreadsheet, Presentation, ArrowLeft,
  TrendingDown, Zap, AlertTriangle, CheckCircle, Clock,
  ChevronDown, ChevronUp, BarChart3, RefreshCw, Tag,
  Globe, ExternalLink, ChevronRight, Search, DollarSign, Calculator,
  ShieldCheck, BookOpen, FlaskConical, Lightbulb, Scale, Link2,
  MessageSquare, CheckSquare, XSquare, Bot, Send, Map, Share2, ClipboardList, X,
  Square, Store, Layers, ThumbsUp, FileSearch, LayoutGrid, Rows3
} from 'lucide-react';
import { usePageCommands } from '../lib/commands';
import PrismIcon from '../components/icons/PrismIcon';
import TypingDots from '../components/ui/TypingDots';
import ButtonSpinner from '../components/ui/ButtonSpinner';
import { AnalysisResult, CostReductionIdea, CostSavingType, Difficulty, SearchSource, ConfidenceLevel, EvidenceSource, IdeaAnnotation, AnnotationStatus, ChatMessage } from '../types';
import { exportToExcel, exportToPowerPoint, exportToPdf, exportRfqPdf } from '../services/export-service';
import ExportMenu, { type ExportItem } from '../components/ui/ExportMenu';
import { useAuth } from '../contexts/AuthContext';
import BusinessCaseModal from '../components/BusinessCaseModal';
import { generateCostReductionIdeas, sendChatMessage, loadFullResult } from '../services/claude-service';
import { notableFlags, verificationTally } from '../services/idea-provenance.mjs';
import { toast } from '../hooks/useToast';
import IdeasDashboard from '../components/results/IdeasDashboard';
import IdeasTable from '../components/results/IdeasTable';
import BusinessCaseCalculator from '../components/results/BusinessCaseCalculator';
import { getAuthToken } from '../services/auth';
import IdeaProvenanceBadges from '../components/IdeaProvenanceBadges';

const DIFFICULTY_CONFIG: Record<Difficulty, { color: string; bg: string; border: string; icon: typeof CheckCircle }> = {
  Low:    { color: 'text-success-400', bg: 'bg-success-500/10',  border: 'border-success-500/30',  icon: CheckCircle },
  Medium: { color: 'text-amber-400',   bg: 'bg-amber-500/10',    border: 'border-amber-500/30',    icon: Clock },
  High:   { color: 'text-danger-400',  bg: 'bg-danger-500/10',   border: 'border-danger-500/30',   icon: AlertTriangle },
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
  high:   'bg-success-400',
  medium: 'bg-amber-400',
  low:    'bg-danger-400',
};

const CONFIDENCE_CONFIG: Record<ConfidenceLevel, { label: string; color: string; bg: string; border: string; icon: typeof ShieldCheck; title: string }> = {
  verified:     { label: 'Verified',     color: 'text-success-400',  bg: 'bg-success-500/10',  border: 'border-success-500/30',  icon: ShieldCheck,   title: 'OEM confirmed in production' },
  benchmarked:  { label: 'Benchmarked',  color: 'text-info-400',     bg: 'bg-info-500/10',     border: 'border-info-500/30',     icon: BookOpen,      title: 'Teardown / industry study data' },
  estimated:    { label: 'Estimated',    color: 'text-amber-400',    bg: 'bg-amber-500/10',    border: 'border-amber-500/30',    icon: Calculator,    title: 'Cost-model / engineering estimate' },
  theoretical:  { label: 'Theoretical', color: 'text-purple-400',   bg: 'bg-purple-500/10',   border: 'border-purple-500/30',   icon: FlaskConical,  title: 'First-principles / analytical' },
};

const ANNOTATION_STATUS_CONFIG: Record<AnnotationStatus, { label: string; color: string; bg: string; border: string }> = {
  'pending':       { label: 'Not Reviewed', color: 'text-slate-400',    bg: 'bg-slate-500/10',   border: 'border-slate-500/20' },
  'investigating': { label: 'Investigating', color: 'text-amber-400',    bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  'approved':      { label: 'Approved',      color: 'text-success-400',  bg: 'bg-success-500/10', border: 'border-success-500/20' },
  'rejected':      { label: 'Rejected',      color: 'text-danger-400',   bg: 'bg-danger-500/10',  border: 'border-danger-500/20' },
  'on-hold':       { label: 'On Hold',       color: 'text-purple-400',   bg: 'bg-purple-500/10',  border: 'border-purple-500/20' },
};

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
    { label: 'Phase 1 — Quick Wins', sublabel: '0–6 months', color: 'text-success-400', bg: 'bg-success-500/10', border: 'border-success-500/20', dot: 'bg-success-400', ideas: ideas.filter(i => phaseFor(i) === 0) },
    { label: 'Phase 2 — Programme Plan', sublabel: '6–18 months', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', dot: 'bg-amber-400', ideas: ideas.filter(i => phaseFor(i) === 1) },
    { label: 'Phase 3 — Strategic', sublabel: '18+ months', color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20', dot: 'bg-violet-400', ideas: ideas.filter(i => phaseFor(i) === 2) },
  ];

  return (
    <div className="mb-8 rounded-2xl bg-navy-900 border border-white/10 overflow-hidden shadow-card">
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

function IdeaCard({ idea, index, annotation, onAnnotate, isSelected, onToggleSelect, currency }: {
  idea: CostReductionIdea;
  index: number;
  /** The run's currency: engine EUR figures are converted to it at display. */
  currency?: string;
  annotation?: IdeaAnnotation;
  onAnnotate: (a: IdeaAnnotation) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const aiAvailable = useAiAvailable();
  const { token } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [showAnnotation, setShowAnnotation] = useState(false);
  const [noteText, setNoteText] = useState(annotation?.note ?? '');
  const [showSensitivity, setShowSensitivity] = useState(false);
  const [volumeMul, setVolumeMul] = useState(1.0);
  const [commodityDelta, setCommodityDelta] = useState(0);
  const [patentLoading, setPatentLoading] = useState(false);
  const [patentResult, setPatentResult] = useState<string | null>(null);
  const [patentData, setPatentData] = useState<{ patents: { number: string; title: string; date: string; assignee: string; url: string }[]; grounded: boolean; providerConfigured: boolean; note?: string } | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showVavePrompt, setShowVavePrompt] = useState(false);
  const [vaveCreating, setVaveCreating] = useState(false);
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const diff = DIFFICULTY_CONFIG[idea.implementationDifficulty];

  async function handleStatusClick(status: AnnotationStatus) {
    if (status === 'rejected') {
      setShowRejectModal(true);
      return;
    }
    onAnnotate({ status, note: annotation?.note ?? noteText, updatedAt: new Date().toISOString() });
    if (status === 'approved') {
      setShowVavePrompt(true);
    } else {
      setShowVavePrompt(false);
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
    : '£';
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
      className={`bg-navy-900 border rounded-2xl overflow-hidden transition-ui cursor-default shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/60 ${isSelected ? 'border-gold-500/50 shadow-glow-gold' : 'border-white/10 hover:border-gold-500/25'}`}
      /* Keyboard: the card itself is a stop. Enter/Space expands, x selects;
         j/k between cards is handled by the list. Inner controls keep their own keys. */
      tabIndex={0}
      data-idea-card=""
      role="article"
      aria-label={`Idea ${index + 1}: ${idea.title}`}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(v => !v); }
        else if (e.key.toLowerCase() === 'x' && onToggleSelect) { e.preventDefault(); onToggleSelect(idea.id); }
      }}
    >
      <div className="p-5 pb-4">
        {/* Title row */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-start gap-3">
            {onToggleSelect && (
              <button
                onClick={e => { e.stopPropagation(); onToggleSelect(idea.id); }}
                className={`flex-shrink-0 self-center -m-2 inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${isSelected ? 'text-gold-400' : 'text-slate-500 hover:text-slate-400'}`}
                aria-label={isSelected ? 'Deselect idea' : 'Select idea'}
                aria-pressed={isSelected}
              >
                {isSelected ? <CheckSquare size={17} /> : <Square size={17} />}
              </button>
            )}
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
                <IdeaProvenanceBadges idea={idea} />
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
            <div className="text-success-400 font-bold text-sm">{idea.costSavingPotential.percentage || '—'}</div>
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
          aria-expanded={expanded}
          className="mt-2 -ml-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-gold-400 hover:text-gold-300 hover:bg-tint text-sm font-medium transition-colors"
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
              <span className="text-blue-400 text-xs font-semibold uppercase tracking-wider">Industry Benchmark: </span>
              <span className="text-slate-300 text-sm">{idea.benchmarkReference}</span>
            </div>
          )}

          {idea.engineCheck ? (
            <div className={`p-3 rounded-xl border ${idea.engineCheck.direction === 'confirmed' ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-danger-500/5 border-danger-500/15'}`}>
              <span className={`text-xs font-semibold uppercase tracking-wide ${idea.engineCheck.direction === 'confirmed' ? 'text-emerald-400' : 'text-danger-400'}`}>
                Engine Cross-Check — {idea.engineCheck.direction}:
              </span>{' '}
              <span className="text-slate-300 text-sm">
                <Money eur={idea.engineCheck.baselineEur} currency={currency} /> → <Money eur={idea.engineCheck.proposedEur} currency={currency} /> ({idea.engineCheck.savingPct > 0 ? '−' : '+'}{Math.abs(idea.engineCheck.savingPct)}%) on {idea.engineCheck.referenceCase}
              </span>
              <p className="text-slate-500 text-xs mt-1">{idea.engineCheck.basis}</p>
              <FxNote currency={currency} className="mt-1" />
              <p className="text-slate-500 text-xs mt-1">
                This is the engine&apos;s figure for its own reference case — it tests whether the
                change moves cost in the claimed direction, not whether the saving quoted above is
                the right size.
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-xl border bg-slate-500/5 border-slate-500/15">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Engine Cross-Check — not evaluated:
              </span>{' '}
              <span className="text-slate-300 text-sm">
                {idea.engineCheckReason ?? 'not expressible as a substitution, tolerance, assembly or harness change the engine can re-cost.'}
              </span>
              <p className="text-slate-500 text-xs mt-1">
                The saving above is AI-estimated. Validate before commercial use.
              </p>
            </div>
          )}

          {/* The model's own sums, recomputed from its stated basis. Unparsed is
              shown as unparsed — it is a limitation of the reader, not a verdict. */}
          {idea.arithmetic && (
            <div className={`p-3 rounded-xl border ${idea.arithmetic.status === 'consistent' ? 'bg-emerald-500/5 border-emerald-500/15' : idea.arithmetic.status === 'mismatch' ? 'bg-danger-500/5 border-danger-500/15' : 'bg-slate-500/5 border-slate-500/15'}`}>
              <span className={`text-xs font-semibold uppercase tracking-wide ${idea.arithmetic.status === 'consistent' ? 'text-emerald-400' : idea.arithmetic.status === 'mismatch' ? 'text-danger-400' : 'text-slate-400'}`}>
                Arithmetic check — {idea.arithmetic.status}:
              </span>{' '}
              <span className="text-slate-300 text-sm">{idea.arithmetic.note}.</span>
              {idea.arithmetic.basis && <p className="text-slate-500 text-xs mt-1">Read as: {idea.arithmetic.basis}</p>}
            </div>
          )}

          {/* The five engineering sections — depth over count. Only sections
              the model actually wrote get a heading. */}
          {idea.engineering && Object.keys(idea.engineering).length > 0 && (
            <div className="p-3 rounded-xl bg-teal-500/5 border border-teal-500/15">
              <span className="text-teal-300 text-xs font-semibold uppercase tracking-wider block mb-2">Engineering brief</span>
              <div className="space-y-2">
                {([
                  ['mechanism', 'Mechanism'], ['specDeltas', 'Spec deltas'], ['validationPlan', 'Validation plan'],
                  ['dfmImplications', 'DFM implications'], ['costBridge', 'Cost bridge'],
                ] as const).filter(([k]) => idea.engineering?.[k]).map(([k, label]) => (
                  <div key={k} className="text-sm">
                    <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">{label}: </span>
                    <span className="text-slate-300">{idea.engineering![k]}</span>
                  </div>
                ))}
              </div>
              {idea.depth && idea.depth.missing.length > 0 && (
                <p className="text-slate-500 text-xs mt-2">
                  Depth rubric {idea.depth.score}/100 — missing: {idea.depth.missing.map(m => `${m} (${idea.depth!.criteria[m]?.detail})`).join('; ')}.
                </p>
              )}
            </div>
          )}

          {(idea.mergedTitles?.length ?? 0) > 0 && (
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Merged near-duplicates: </span>
              <span className="text-slate-400 text-sm">{idea.mergedTitles!.join(' · ')}</span>
            </div>
          )}

          {(idea.critiques?.length ?? 0) > 0 && (
            <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/15">
              <span className="text-violet-300 text-xs font-semibold uppercase tracking-wider block mb-2">
                Expert panel review{typeof idea.eloRating === 'number' ? ` · tournament rating ${idea.eloRating}` : ''}
              </span>
              <div className="space-y-1.5">
                {idea.critiques!.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className={`flex-shrink-0 px-1.5 py-0.5 rounded font-medium ${c.verdict === 'challenge' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                      {c.personaName}
                    </span>
                    <span className="text-slate-400 leading-relaxed">{c.critique}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {idea.regulatoryContext && idea.regulatoryContext !== 'null' && (
            <div className="p-3 rounded-xl bg-danger-500/5 border border-danger-500/15 flex items-start gap-2">
              <Scale size={14} className="text-danger-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-danger-400 text-xs font-semibold uppercase tracking-wider block mb-0.5">Regulatory Driver</span>
                <span className="text-slate-300 text-sm">{idea.regulatoryContext}</span>
              </div>
            </div>
          )}

          {idea.evidenceSources && idea.evidenceSources.length > 0 && (() => {
            // Sources are only "found" evidence if generated with live retrieval;
            // otherwise they are the model's own recollection and must say so.
            const unverified = idea.evidenceUnverified !== false;
            return (
              <div>
                <h4 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Link2 size={12} /> Evidence Sources
                  {unverified && (
                    <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-2xs font-medium normal-case tracking-normal" title="These sources are suggested by the AI from its training data, not retrieved or independently verified. Enable web search to corroborate.">
                      <AlertTriangle size={10} /> AI-suggested · unverified
                    </span>
                  )}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {idea.evidenceSources.map((src, i) => {
                    const cfg = EVIDENCE_TYPE_CONFIG[src.type] || EVIDENCE_TYPE_CONFIG.web_search;
                    return (
                      <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${cfg.bg} ${unverified ? 'opacity-80' : ''}`}>
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${EVIDENCE_CONFIDENCE_DOT[src.confidence]}`} title={`${src.confidence} confidence`} />
                        <div>
                          <div className={`font-medium ${cfg.color}`}>{src.title}{src.year ? ` (${src.year})` : ''}</div>
                          <div className="text-slate-500 text-xs">{unverified ? `${cfg.label} · claimed` : cfg.label}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {unverified && (
                  <p className="text-slate-500 text-2xs mt-2">Citations are AI-proposed from training data. Turn on web search when generating to retrieve and corroborate sources.</p>
                )}
              </div>
            );
          })()}

          <div className="rounded-xl bg-violet-500/5 border border-violet-500/15 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={13} className="text-violet-400" />
                <span className="text-violet-300 text-xs font-semibold uppercase tracking-wider">Patent Watch</span>
              </div>
              <button
                onClick={async () => {
                  const apiKey = localStorage.getItem('brainspark_api_key') || '';
                  if ((!apiKey && !aiAvailable) || patentLoading) return;
                  setPatentLoading(true);
                  setPatentResult(null);
                  setPatentData(null);
                  try {
                    const r = await fetch('/api/patent-watch', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                      body: JSON.stringify({ title: idea.title, description: idea.technicalDescription, apiKey }),
                    });
                    const d = await r.json();
                    setPatentResult(d.analysis || d.error || 'No result');
                    if (Array.isArray(d.patents)) setPatentData({ patents: d.patents, grounded: !!d.grounded, providerConfigured: !!d.providerConfigured, note: d.note });
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
                {patentData && patentData.patents.length > 0 && (
                  <div className="mb-3 space-y-1.5">
                    <p className="text-emerald-400 text-2xs font-semibold uppercase tracking-wider">Retrieved patents (PatentsView, US corpus)</p>
                    {patentData.patents.map(p => (
                      <a key={p.number} href={p.url} target="_blank" rel="noopener noreferrer"
                        className="block p-2 rounded-lg bg-white/5 border border-white/10 hover:border-violet-500/30 transition-colors">
                        <span className="text-violet-300 text-xs font-mono">US{p.number}</span>
                        <span className="text-slate-500 text-xs"> · {p.date} · {p.assignee}</span>
                        <p className="text-slate-300 text-xs truncate">{p.title}</p>
                      </a>
                    ))}
                  </div>
                )}
                <p className="text-slate-300 text-xs leading-relaxed">{patentResult}</p>
                <div className="mt-3 p-2.5 rounded-lg bg-amber-500/8 border border-amber-500/20 flex items-start gap-2">
                  <AlertTriangle size={11} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-amber-300/80 text-xs leading-relaxed">
                    <strong>Not legal advice.</strong> {patentData?.note || 'AI-generated awareness check only.'} Always commission a formal Freedom-to-Operate opinion from a qualified patent attorney before engineering commitment.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-slate-500 text-xs">Searches the PatentsView US patent database when a key is configured (real, citable records), plus an AI risk narrative. Uses your AI key. <span className="text-amber-400">Awareness only — not legal FTO advice.</span></p>
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
                <div className="mt-2 flex items-center gap-2 p-2.5 rounded-xl bg-success-500/8 border border-success-500/20">
                  <ClipboardList size={14} className="text-success-400 flex-shrink-0" />
                  <span className="text-success-300 text-xs flex-1">Track this idea in the VAVE pipeline?</span>
                  <button
                    onClick={createVaveAction}
                    disabled={vaveCreating}
                    className="px-2.5 py-1 rounded-lg text-xs bg-success-500/20 text-success-300 border border-success-500/30 hover:bg-success-500/30 transition-colors disabled:opacity-50"
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
                <div className="mt-2 p-3 rounded-xl bg-danger-500/5 border border-danger-500/20 space-y-2">
                  <p className="text-danger-300 text-xs font-medium">Why is this idea rejected? (helps personalise future AI output)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {REJECTION_REASONS.map(r => (
                      <button
                        key={r.key}
                        onClick={() => setRejectReason(r.key)}
                        className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                          rejectReason === r.key
                            ? 'bg-danger-500/20 text-danger-300 border-danger-500/40'
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
                      className="px-3 py-1.5 rounded-lg text-xs bg-danger-500/20 text-danger-300 border border-danger-500/30 hover:bg-danger-500/30 transition-colors"
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
              <p className="text-slate-500 text-xs">Last updated: {new Date(annotation.updatedAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</p>
            )}
            <div className="pt-1">
              <button
                onClick={() => setShowPipelineModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors"
              >
                <ClipboardList size={12} /> Add to Pipeline
              </button>
            </div>
          </div>
        )}
        {showPipelineModal && (
          <BusinessCaseModal
            ideaTitle={idea.title}
            ideaSource="results"
            onClose={() => setShowPipelineModal(false)}
            onSaved={() => { setShowPipelineModal(false); toast('Added to Pipeline', 'success'); }}
          />
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
                <div className="flex justify-between text-slate-500 text-xs mt-1"><span>0.5×</span><span>2.0×</span></div>
              </div>
              {isMat && (
                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-slate-400">Commodity Price Change</span>
                    <span className={`font-semibold ${commodityDelta >= 0 ? 'text-danger-400' : 'text-success-400'}`}>{commodityDelta >= 0 ? '+' : ''}{commodityDelta}%</span>
                  </div>
                  <input type="range" min="-30" max="50" step="1" value={commodityDelta}
                    onChange={e => setCommodityDelta(Number(e.target.value))}
                    className="w-full h-1.5 accent-orange-400 cursor-pointer" />
                  <div className="flex justify-between text-slate-500 text-xs mt-1"><span>-30%</span><span>+50%</span></div>
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
                  <div className={`font-bold text-lg ${adjSav > baseSav ? 'text-success-400' : adjSav < baseSav ? 'text-danger-400' : 'text-white'}`}>{fmtV(adjSav, sym)}/yr</div>
                </div>
              </div>
              {!isMat && <p className="text-slate-500 text-xs">Commodity slider is only active for material cost saving ideas.</p>}
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
                        <span className="text-slate-500 flex-shrink-0">· {result.source}</span>
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
  const aiAvailable = useAiAvailable();
  const navigate = useNavigate();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loadError, setLoadError] = useState('');
  const [systemName, setSystemName] = useState('');
  const [subName, setSubName] = useState('');
  // The view lives in the URL (?q=&diff=&type=&status=&sort=&view=), so a
  // filtered view can be linked, bookmarked and survives a reload — the
  // saved-views pattern of Linear and Airtable, without a new store.
  const [params, setParams] = useSearchParams();
  const [filterDifficulty, setFilterDifficulty] = useState<Difficulty | 'All'>(() => (params.get('diff') as Difficulty) || 'All');
  const [filterType, setFilterType] = useState<CostSavingType | 'All'>(() => (params.get('type') as CostSavingType) || 'All');
  const [filterStatus, setFilterStatus] = useState<AnnotationStatus | 'All'>(() => (params.get('status') as AnnotationStatus) || 'All');
  const [sortBy, setSortBy] = useState<'default' | 'roi' | 'savings' | 'ease'>(() => (params.get('sort') as 'roi' | 'savings' | 'ease') || 'default');
  const [query, setQuery] = useState(() => params.get('q') || '');
  const [view, setView] = useState<'cards' | 'table'>(() => (params.get('view') === 'table' ? 'table' : 'cards'));
  useEffect(() => {
    const next = new URLSearchParams(params);
    const put = (k: string, v: string, dflt: string) => { if (v && v !== dflt) next.set(k, v); else next.delete(k); };
    put('q', query.trim(), ''); put('diff', filterDifficulty, 'All'); put('type', filterType, 'All');
    put('status', filterStatus, 'All'); put('sort', sortBy, 'default'); put('view', view, 'cards');
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [query, filterDifficulty, filterType, filterStatus, sortBy, view]);   // eslint-disable-line react-hooks/exhaustive-deps
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
  // One controller per reply. Stop aborts the fetch; the server aborts its
  // model call on the closed response, so the partial answer stays and the
  // rest is not billed. Leaving the page stops it too.
  const chatAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => chatAbortRef.current?.abort(), []);
  const [crossPollinatedIdeas, setCrossPollinatedIdeas] = useState<CostReductionIdea[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // The server no longer has this project (deleted, or a local-only run):
  // annotations stay on this device and sharing is refused with a reason,
  // instead of every action producing a 404 in the console.
  const [projectMissing, setProjectMissing] = useState(false);
  const [bulkAdding, setBulkAdding] = useState<'marketplace' | 'pipeline' | null>(null);
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
          loadFullResult(savedId).then(saved => {
            if (saved) {
              sessionStorage.setItem('analysisResult', JSON.stringify(saved));
              navigate('/results', { replace: true });
              return;
            }
            // Not on this device — it may still be a saved project on the server.
            // The ⌘K search links here by project id, and before this the link
            // fell through to the marketing home page.
            const token = getAuthToken();
            if (!token) { navigate('/analyze'); return; }
            fetch(`/api/projects/${encodeURIComponent(savedId)}`, { headers: { Authorization: `Bearer ${token}` } })
              .then(r => (r.ok ? r.json() : null))
              .then((proj: (AnalysisResult & { systemName?: string; subassemblyName?: string }) | null) => {
                if (!proj) { setLoadError('That analysis could not be found on this account.'); return; }
                sessionStorage.setItem('analysisResult', JSON.stringify(proj));
                sessionStorage.setItem('analysisSystemName', proj.systemName ?? '');
                sessionStorage.setItem('analysisSubName', proj.subassemblyName ?? '');
                navigate('/results', { replace: true });
              })
              .catch(() => setLoadError('Could not reach the server to open that analysis.'));
          });
          return;
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
        const authToken = getAuthToken();
        // A run the server never held (onServer === false) is not asked for;
        // one it has lost answers 404 once, after which nothing else is asked.
        if (parsed.onServer === false) setProjectMissing(true);
        if (authToken && parsed.onServer !== false) {
          // Only fall back to server annotations if local storage has none
          fetch(`/api/projects/${parsed.id}`, { headers: { Authorization: `Bearer ${authToken}` } })
            .then(r => { if (r.status === 404) { setProjectMissing(true); return null; } return r.ok ? r.json() : null; })
            .then(proj => {
              if (!proj) return;
              if (!hasLocalAnnotations && proj.annotations && Object.keys(proj.annotations).length > 0) {
                setAnnotations(proj.annotations);
                try { localStorage.setItem(`brainspark_annotations_${parsed.id}`, JSON.stringify(proj.annotations)); } catch {}
              }
              // Cross-pollinated ideas from other projects — only for a project the server has.
              return fetch(`/api/projects/${parsed.id}/cross-pollinate`, { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } })
                .then(r => r.ok ? r.json() : null)
                .then(data => { if (data?.ideas?.length > 0) setCrossPollinatedIdeas(data.ideas.slice(0, 3)); });
            })
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

  // ⌘K "This page" commands. The handlers are defined below the early return,
  // so the commands call through a ref that the render keeps current.
  const exportRef = useRef<Record<string, () => void>>({});
  usePageCommands(result ? [
    { id: 'res-pdf', group: 'This page', label: 'Export PDF report', keywords: 'download share print', icon: FileDown, run: () => exportRef.current.pdf?.() },
    { id: 'res-pptx', group: 'This page', label: 'Export PowerPoint deck', keywords: 'slides pptx presentation download', icon: Presentation, run: () => exportRef.current.pptx?.() },
    { id: 'res-excel', group: 'This page', label: 'Export Excel workbook', keywords: 'xlsx spreadsheet download', icon: FileSpreadsheet, run: () => exportRef.current.excel?.() },
    { id: 'res-rfq', group: 'This page', label: 'Export RFQ pack', keywords: 'quote supplier request', icon: ClipboardList, run: () => exportRef.current.rfq?.() },
    { id: 'res-view', group: 'This page', label: view === 'table' ? 'Show ideas as cards' : 'Show ideas as a table', keywords: 'view layout table cards', icon: view === 'table' ? LayoutGrid : Rows3, run: () => setView(v => v === 'table' ? 'cards' : 'table') },
  ] : [], [!!result, view]);

  if (!result) {
    // A failed open must say so rather than rendering a blank page.
    if (!loadError) return null;
    return (
      <div className="min-h-screen bg-navy-950 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertTriangle size={28} className="text-danger-400" />
        <p className="text-slate-300 text-sm" role="alert">{loadError}</p>
        <button onClick={() => navigate('/dashboard')} className="text-gold-400 hover:text-gold-300 text-sm underline underline-offset-2">
          Back to dashboard
        </button>
      </div>
    );
  }

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
      const q = query.trim().toLowerCase();
      const matchQuery = !q || `${idea.title} ${idea.technicalDescription} ${idea.materialGrade ?? ''}`.toLowerCase().includes(q);
      return matchDiff && matchType && matchStatus && matchQuery;
    })
    .sort((a, b) => {
      if (sortBy === 'roi') {
        // Server-stamped rank when available (annual value × payback × quality
        // × engine check × evidence × taste); legacy heuristic for old projects.
        const rA = a.rank?.score ?? parseAnnualValue(a.costSavingPotential.annualValue) / DIFF_RANK[a.implementationDifficulty];
        const rB = b.rank?.score ?? parseAnnualValue(b.costSavingPotential.annualValue) / DIFF_RANK[b.implementationDifficulty];
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
    // Prism runs append the evidence dossier as an appendix so every [E#]/[W#]
    // citation in the ideas resolves inside the document itself.
    const legend = systemName === 'Prism' ? sessionStorage.getItem('prismDossier') : null;
    try { await Promise.resolve(exportToPdf(result, systemName, subName, legend)); } finally { setExporting(null); }
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

  // One export menu instead of five coloured buttons. Order = how often each
  // is used for a management review; the RFQ pack says what it contains.
  const exportItems: ExportItem[] = [
    { id: 'pdf', label: 'PDF report', description: 'The full analysis for reading and sharing', icon: FileDown, onSelect: handlePdfExport, busy: exporting === 'pdf' },
    { id: 'pptx', label: 'PowerPoint deck', description: 'Slides for a management review', icon: Presentation, onSelect: handlePptxExport, busy: exporting === 'pptx' },
    { id: 'excel', label: 'Excel workbook', description: 'Summary, ideas and roadmap sheets', icon: FileSpreadsheet, onSelect: handleExcelExport, busy: exporting === 'excel' },
    { id: 'rfq', label: 'RFQ pack', description: 'Request-for-quote package of the approved ideas', icon: ClipboardList, onSelect: handleRfqExport, busy: exporting === 'rfq' },
  ];
  exportRef.current = Object.fromEntries(exportItems.map(it => [it.id, it.onSelect]));

  const handleAnnotate = (ideaId: string, annotation: IdeaAnnotation) => {
    const updated = { ...annotations, [ideaId]: annotation };
    setAnnotations(updated);
    if (result?.id) {
      try { localStorage.setItem(`brainspark_annotations_${result.id}`, JSON.stringify(updated)); } catch {}
      const authToken = getAuthToken();
      if (authToken && !projectMissing) {
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
    if (!apiKey && !aiAvailable) { toast('Add your Anthropic API key under Settings → API Key to ask about this analysis.', 'error'); return; }

    const userMsg: ChatMessage = { role: 'user', content: msg, timestamp: new Date().toISOString() };
    const newHistory = [...chatMessages, userMsg];
    setChatMessages([...newHistory, { role: 'assistant', content: '', timestamp: new Date().toISOString() }]);
    setChatInput('');
    setChatLoading(true);
    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;

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
        },
        // Prism runs leave their measured dossier in the session so the chat
        // answers waterfall/forensics questions from evidence, not memory.
        // Guarded on the run's own stamp — a later non-Prism analysis in the
        // same tab must not inherit a stale part's dossier.
        (systemName === 'Prism' && sessionStorage.getItem('prismDossier')) || undefined,
        controller.signal
      );
    } catch (err) {
      const stopped = err instanceof DOMException && err.name === 'AbortError';
      setChatMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = stopped
            ? { ...last, content: `${last.content}${last.content ? ' ' : ''}— stopped.` }
            : { ...last, content: `Error: ${err instanceof Error ? err.message : 'Chat failed'}` };
        }
        return updated;
      });
    } finally {
      setChatLoading(false);
      chatAbortRef.current = null;
    }
  };

  const quickWins = result.ideas.filter(i => i.implementationDifficulty === 'Low');
  const programmeItems = result.ideas.filter(i => i.implementationDifficulty === 'Medium');
  const strategicItems = result.ideas.filter(i => i.implementationDifficulty === 'High');
  const searchUsedCount = result.ideas.filter(i => i.searchDataUsed).length;

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleBulkAddToMarketplace() {
    const authToken = getAuthToken();
    if (!authToken) { toast('Sign in to add to Marketplace', 'error'); return; }
    const ideas = result!.ideas.filter(i => selectedIds.has(i.id));
    setBulkAdding('marketplace');
    let count = 0;
    for (const idea of ideas) {
      try {
        const r = await fetch('/api/marketplace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({
            title: idea.title,
            description: idea.technicalDescription,
            system: systemName || '',
            costSavingType: idea.costSavingTypes[0] || '',
            annualSaving: idea.costSavingPotential.annualValue || '',
            difficulty: idea.implementationDifficulty,
            timeToImplement: idea.timeToImplement || '',
            ideaData: JSON.stringify(idea),
          }),
        });
        if (r.ok) count++;
      } catch { /* continue on individual failure */ }
    }
    setBulkAdding(null);
    setSelectedIds(new Set());
    toast(`${count} idea${count !== 1 ? 's' : ''} added to Marketplace`, count > 0 ? 'success' : 'error');
  }

  async function handleBulkAddToPipeline() {
    const authToken = getAuthToken();
    if (!authToken) { toast('Sign in to add to Pipeline', 'error'); return; }
    const ideas = result!.ideas.filter(i => selectedIds.has(i.id));
    setBulkAdding('pipeline');
    let count = 0;
    for (const idea of ideas) {
      try {
        const notesParts = [
          `Auto-added from BrainSpark analysis (${result!.config.vehicleType || 'unknown vehicle'}).`,
          idea.costSavingPotential.annualValue ? `Estimated saving: ${idea.costSavingPotential.annualValue}.` : '',
          idea.timeToImplement ? `Timeline: ${idea.timeToImplement}.` : '',
        ].filter(Boolean);
        const r = await fetch('/api/business-cases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({
            ideaTitle: idea.title,
            ideaSource: 'analyze',
            commodityName: result!.config.vehicleType || '',
            systemName: systemName || '',
            vehicleData: [{ model: 'TBD', volume: 0, applicablePct: 100 }],
            savingPerPart: 0,
            toolingCost: 0,
            tvCost: 0,
            gate: 'G0',
            notes: notesParts.join(' '),
            ideaData: JSON.stringify(idea),
          }),
        });
        if (r.ok) count++;
      } catch { /* continue on individual failure */ }
    }
    setBulkAdding(null);
    setSelectedIds(new Set());
    toast(`${count} idea${count !== 1 ? 's' : ''} added to Pipeline as G0 cases`, count > 0 ? 'success' : 'error');
  }

  async function handleShare() {
    if (!result?.id) return;
    if (projectMissing) { toast('This analysis is not saved on the server, so it cannot be shared. Run it again while signed in to get a shareable copy.', 'error'); return; }
    const token = getAuthToken();
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
            <div className="mb-4 p-3 rounded-xl bg-info-500/10 border border-info-500/20 flex items-center gap-3">
              <span className="text-info-300 text-xs flex-1 truncate font-mono">{shareLink}</span>
              <button onClick={() => { navigator.clipboard.writeText(shareLink); toast('Copied!', 'success'); }} className="text-xs text-info-300 hover:text-white border border-info-500/30 px-2 py-1 rounded-lg transition-colors">Copy</button>
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
              <h1 className="text-3xl font-bold text-white">{systemName}</h1>
              <p className="text-slate-400 mt-1">{subName} — {result.generatedAt}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {result.id && (
                <button
                  onClick={handleShare}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-hairline bg-tint hover:bg-tint-strong text-slate-200 font-medium text-sm transition-colors"
                >
                  <Share2 size={16} aria-hidden="true" /> Share
                </button>
              )}
              <ExportMenu busy={!!exporting} items={exportItems} />
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
            <div key={stat.label} className="bg-navy-900 border border-white/10 rounded-2xl p-5 shadow-card">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-3`}>
                <stat.icon size={20} className="text-white" />
              </div>
              <div className="text-3xl font-bold text-white"><TickNumber value={stat.value} /></div>
              <div className="text-slate-500 text-sm mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Lens coverage (Prism): a two-lens run must never read like a full
            study. Which lenses ran, which the dossier offered but were not
            selected, and which returned nothing. */}
        {result.validation?.lenses && (() => {
          const l = result.validation.lenses;
          const total = l.run.length + l.skipped.length;
          return (
            <div className="mb-3 p-3 rounded-2xl bg-teal-500/5 border border-teal-500/15 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <PrismIcon size={16} className="text-teal-400 flex-shrink-0" />
              <span className="text-slate-300">
                <strong className="text-white">{l.run.length} of {total || l.run.length}</strong> evidence lens{total === 1 ? '' : 'es'} run
                {l.run.length > 0 && <span className="text-slate-500"> ({l.run.map(id => `${id}: ${l.ideasByLens[id] ?? 0}`).join(', ')})</span>}
              </span>
              {l.skipped.length > 0 && (
                <span className="text-amber-400" title="Lenses the dossier offered that were not selected — their levers were not explored in this batch.">
                  not explored: {l.skipped.join(', ')}
                </span>
              )}
              {l.empty.length > 0 && <span className="text-danger-400">returned nothing: {l.empty.join(', ')}</span>}
              {result.validation.deep && (
                <span className="text-slate-500 text-xs ml-auto">
                  {result.validation.deep.level === 'full' ? 'Deep mode' : 'Critique pass'}: {result.validation.deep.critiqued} critiqued, {result.validation.deep.refined} repaired
                </span>
              )}
            </div>
          );
        })()}

        {/* How much of this page has actually been verified.
            The per-idea badges say it one idea at a time; without the portfolio
            figure a reader cannot calibrate the set as a whole, and measured
            engine-check coverage is well under half. */}
        {(() => {
          const t = verificationTally(result.ideas);
          if (!t.total) return null;
          return (
            <div className="mb-5 p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-wrap items-center gap-x-5 gap-y-2">
              {/* The portfolio's verified share as a swept gauge — the same
                  dial the DFM Studio uses for its score, so a reader who
                  knows one knows the other. It lands on the measured ratio. */}
              <ScoreRing score={Math.round((t.confirmed / t.total) * 100)} size={64} label="engine-verified" sublabel={`${t.confirmed} of ${t.total}`} />
              <span className="text-slate-300 text-sm">
                <strong className="text-white">{t.confirmed} of {t.total}</strong> ideas engine-verified
              </span>
              {t.contradicted > 0 && (
                <span className="text-danger-400 text-sm">{t.contradicted} engine-contradicted</span>
              )}
              <span className="text-slate-500 text-sm">{t.unchecked} not engine-checked</span>
              {/* Corpus novelty, next to verification because they are the two
                  things a reader needs to calibrate the set. It is NOT the same
                  as the ideas differing from each other — a batch can be varied
                  and still be all known levers. */}
              {(() => {
                const echoes = result.ideas.filter(i => i.priorArt).length;
                if (!echoes) return null;
                return (
                  <span className="text-slate-500 text-sm" title="These closely match ideas already in the marketplace. Still valid — proven precedent is what the library is for — but they are not new thinking, and they now rank slightly below an equally valuable novel idea.">
                    {t.total - echoes} of {t.total} new to the library
                  </span>
                );
              })()}
              <span className="text-slate-500 text-xs ml-auto">
                Ideas the engine cannot re-cost are AI-estimated — validate before commercial use.
              </span>
            </div>
          );
        })()}

        {/* Quick wins highlight */}
        {quickWins.length > 0 && (
          <div className="mb-5 p-4 rounded-2xl bg-success-500/10 border border-success-500/20 flex items-center gap-3">
            <CheckCircle size={18} className="text-success-400 flex-shrink-0" />
            <span className="text-success-400 font-semibold">{quickWins.length} Quick Win{quickWins.length > 1 ? 's' : ''}</span>
            <span className="text-slate-400 text-sm">— Low implementation difficulty, fast-track for engineering review and supplier RFQ.</span>
          </div>
        )}

        {/* Web search notification */}
        {searchUsedCount > 0 && (
          <div className="mb-5 p-4 rounded-2xl bg-info-500/10 border border-info-500/20 flex items-center gap-3">
            <Globe size={18} className="text-info-400 flex-shrink-0" />
            <span className="text-info-300 text-sm">
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

        {/* Toolbar: one row — search, three filters, sort, count, view. It
            replaces two rows of ~20 chips; the choices are the same. */}
        {(() => {
          const sel = 'h-9 rounded-lg border border-hairline bg-tint px-2.5 text-sm text-slate-200 focus:outline-none focus:border-gold-500/50';
          const active = filterDifficulty !== 'All' || filterType !== 'All' || filterStatus !== 'All' || query.trim() !== '';
          return (
            <div className="mb-6 rounded-2xl border border-hairline bg-navy-900 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                  <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search ideas, grades…" aria-label="Search ideas"
                    className={`${sel} w-full pl-8`} />
                </div>
                <select aria-label="Filter by difficulty" value={filterDifficulty} onChange={e => setFilterDifficulty(e.target.value as Difficulty | 'All')} className={sel}>
                  <option value="All">Any difficulty</option>
                  {(['Low', 'Medium', 'High'] as const).map(d => <option key={d} value={d}>{d} difficulty</option>)}
                </select>
                <select aria-label="Filter by saving type" value={filterType} onChange={e => setFilterType(e.target.value as CostSavingType | 'All')} className={sel}>
                  <option value="All">Any saving type</option>
                  {(['material', 'process', 'tooling', 'weight', 'complexity', 'warranty', 'logistics', 'commonisation'] as const).map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
                </select>
                <select aria-label="Filter by status" value={filterStatus} onChange={e => setFilterStatus(e.target.value as AnnotationStatus | 'All')} className={sel}>
                  <option value="All">Any status</option>
                  {(['pending', 'investigating', 'approved', 'rejected', 'on-hold'] as const).map(st => <option key={st} value={st}>{ANNOTATION_STATUS_CONFIG[st].label}</option>)}
                </select>
                <select aria-label="Sort ideas" value={sortBy} onChange={e => setSortBy(e.target.value as 'default' | 'roi' | 'savings' | 'ease')} className={sel}>
                  <option value="default">Sort: AI order</option>
                  <option value="roi">Sort: best value</option>
                  <option value="savings">Sort: highest saving</option>
                  <option value="ease">Sort: easiest first</option>
                </select>
                <div role="group" aria-label="View" className="inline-flex h-9 rounded-lg border border-hairline overflow-hidden">
                  {(['cards', 'table'] as const).map(v => (
                    <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                      className={`inline-flex items-center gap-1.5 px-3 text-sm transition-colors ${view === v ? 'bg-gold-500/15 text-gold-400' : 'text-slate-400 hover:text-white'}`}>
                      {v === 'cards' ? <LayoutGrid size={14} aria-hidden="true" /> : <Rows3 size={14} aria-hidden="true" />}
                      {v === 'cards' ? 'Cards' : 'Table'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span aria-live="polite"><span className="text-slate-300 font-medium">{filtered.length}</span> of {result.ideas.length} ideas</span>
                {active && (
                  <button type="button" onClick={() => { setQuery(''); setFilterDifficulty('All'); setFilterType('All'); setFilterStatus('All'); }} className="text-gold-400 hover:underline">Clear filters</button>
                )}
                {sortBy === 'roi' && (
                  <span>Best value = annual saving × payback speed × validation quality × engine cross-check × evidence status{filtered.some(i => i.tasteMatch) ? ' × similarity to your approved ideas' : ''}.</span>
                )}
              </div>
            </div>
          );
        })()}

        {/* Bulk selection action bar */}
        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="sticky top-20 z-20 mb-4 flex flex-wrap items-center gap-3 p-3 rounded-2xl bg-navy-800 border border-gold-500/30 shadow-modal"
            >
              <div className="flex items-center gap-2 text-gold-400 font-semibold text-sm">
                <CheckSquare size={15} />
                {selectedIds.size} idea{selectedIds.size !== 1 ? 's' : ''} selected
              </div>
              <button
                onClick={() => setSelectedIds(new Set(filtered.map(i => i.id)))}
                className="text-xs text-slate-400 hover:text-white border border-white/15 px-2.5 py-1 rounded-lg transition-colors"
              >
                Select all {filtered.length}
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Clear
              </button>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={handleBulkAddToMarketplace}
                  disabled={!!bulkAdding}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-300 text-xs font-medium hover:bg-violet-500/25 disabled:opacity-50 transition-colors"
                >
                  {bulkAdding === 'marketplace' ? <ButtonSpinner size={12} /> : <Store size={13} />}
                  Add to Marketplace
                </button>
                <button
                  onClick={handleBulkAddToPipeline}
                  disabled={!!bulkAdding}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gold-500/15 border border-gold-500/30 text-gold-300 text-xs font-medium hover:bg-gold-500/25 disabled:opacity-50 transition-colors shadow-glow-gold"
                >
                  {bulkAdding === 'pipeline' ? <ButtonSpinner size={12} /> : <Layers size={13} />}
                  Add to Pipeline
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Ideas */}
        {filtered.length === 0 ? (
          <motion.div layout className="text-center py-12 text-slate-500">
            No ideas match the current filters.{' '}
            <button type="button" onClick={() => { setQuery(''); setFilterDifficulty('All'); setFilterType('All'); setFilterStatus('All'); }} className="text-gold-400 hover:underline">Clear filters</button>
          </motion.div>
        ) : view === 'table' ? (
          <IdeasTable ideas={filtered} annotations={annotations} statusLabel={st => ANNOTATION_STATUS_CONFIG[st as AnnotationStatus]?.label ?? st}
            selectedIds={selectedIds} onToggleSelect={toggleSelect} sortBy={sortBy} onSort={setSortBy} />
        ) : (
          <motion.div
            layout
            className="space-y-4 mb-8"
            role="group"
            aria-label="Cost-reduction ideas"
            onKeyDown={e => {
              if (!['j', 'k', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
              const t = e.target as HTMLElement;
              if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable) return;
              const cards = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-idea-card]')];
              const cur = cards.findIndex(c => c.contains(t));
              const next = (e.key === 'j' || e.key === 'ArrowDown') ? Math.min(cards.length - 1, cur + 1) : Math.max(0, cur - 1);
              if (cards[next] && next !== cur) { e.preventDefault(); cards[next].focus(); cards[next].scrollIntoView({ block: 'nearest' }); }
            }}
          >
            <div className="hidden lg:flex justify-end gap-3 text-2xs text-slate-600 -mb-2" aria-hidden="true">
              <span><kbd className="font-mono">j</kbd>/<kbd className="font-mono">k</kbd> move</span>
              <span><kbd className="font-mono">↵</kbd> expand</span>
              <span><kbd className="font-mono">x</kbd> select</span>
            </div>
            <AnimatePresence mode="popLayout" initial={false}>
              {filtered.map((idea, i) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  index={i}
                  annotation={annotations[idea.id]}
                  onAnnotate={(a) => handleAnnotate(idea.id, a)}
                  isSelected={selectedIds.has(idea.id)}
                  onToggleSelect={toggleSelect}
                  currency={result.config.currency}
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
                  <p className="text-slate-500 text-xs mb-3 uppercase tracking-wider font-medium">Suggested questions</p>
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
                {chatLoading ? (
                  <button
                    type="button"
                    onClick={() => chatAbortRef.current?.abort()}
                    aria-label="Stop the reply"
                    title="Stop. The model call is aborted; only what has streamed is billed."
                    className="w-10 h-10 flex-shrink-0 rounded-xl bg-white/5 hover:bg-danger-500/15 border border-white/15 hover:border-danger-500/40 flex items-center justify-center transition-colors"
                  >
                    <Square size={13} className="text-slate-300" />
                  </button>
                ) : (
                  <button
                    onClick={handleChat}
                    disabled={!chatInput.trim()}
                    aria-label="Send"
                    className="w-10 h-10 flex-shrink-0 rounded-xl bg-gold-500/15 hover:bg-gold-500/25 disabled:opacity-40 disabled:cursor-not-allowed border border-gold-500/25 flex items-center justify-center transition-colors"
                  >
                    <Send size={15} className="text-gold-400" />
                  </button>
                )}
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
                <div className="flex items-center gap-2 text-danger-400 text-sm">
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
                  className="flex items-center gap-2 px-6 py-2 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-sm transition-ui"
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
          <div className="flex flex-wrap gap-2">
            {exportItems.slice(0, 3).map(it => (
              <button key={it.id} onClick={it.onSelect} disabled={!!exporting}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-hairline bg-tint hover:bg-tint-strong disabled:opacity-50 text-slate-200 font-medium text-sm transition-colors">
                <it.icon size={16} aria-hidden="true" /> {it.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
