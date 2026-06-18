import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FileDown, FileSpreadsheet, Presentation, ArrowLeft, Filter,
  TrendingDown, Zap, AlertTriangle, CheckCircle, Clock, Loader2,
  ChevronDown, ChevronUp, BarChart3, RefreshCw, Tag,
  Globe, ExternalLink, ChevronRight, Search, DollarSign, Calculator,
  ShieldCheck, BookOpen, FlaskConical, Lightbulb, Scale, Link2,
  MessageSquare, CheckSquare, XSquare
} from 'lucide-react';
import { AnalysisResult, CostReductionIdea, CostSavingType, Difficulty, SearchSource, ConfidenceLevel, EvidenceSource, IdeaAnnotation, AnnotationStatus } from '../types';
import { exportToExcel, exportToPowerPoint, exportToPdf } from '../services/export-service';
import { generateCostReductionIdeas } from '../services/claude-service';
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

function IdeaCard({ idea, index, annotation, onAnnotate }: {
  idea: CostReductionIdea;
  index: number;
  annotation?: IdeaAnnotation;
  onAnnotate: (a: IdeaAnnotation) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAnnotation, setShowAnnotation] = useState(false);
  const [noteText, setNoteText] = useState(annotation?.note ?? '');
  const diff = DIFFICULTY_CONFIG[idea.implementationDifficulty];
  const DiffIcon = diff.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}
      whileHover={{ y: -2, boxShadow: '0 8px 32px rgba(245,158,11,0.08)' }}
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
                    onClick={() => onAnnotate({ status, note: annotation?.note ?? noteText, updatedAt: new Date().toISOString() })}
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
  const [exporting, setExporting] = useState<'excel' | 'pptx' | 'pdf' | null>(null);
  const [annotations, setAnnotations] = useState<Record<string, IdeaAnnotation>>({});
  const [showRefine, setShowRefine] = useState(false);
  const [refineFocus, setRefineFocus] = useState('');
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState('');

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('analysisResult');
      const sys = sessionStorage.getItem('analysisSystemName');
      const sub = sessionStorage.getItem('analysisSubName');
      if (!stored) { navigate('/analyze'); return; }
      const parsed: AnalysisResult = JSON.parse(stored);
      setResult(parsed);
      setSystemName(sys || '');
      setSubName(sub || '');
      // Load saved annotations
      if (parsed.id) {
        try {
          const saved = localStorage.getItem(`brainspark_annotations_${parsed.id}`);
          if (saved) setAnnotations(JSON.parse(saved));
        } catch {}
      }
    } catch {
      navigate('/analyze');
    }
  }, [navigate]);

  if (!result) return null;

  const filtered = result.ideas.filter(idea => {
    const matchDiff = filterDifficulty === 'All' || idea.implementationDifficulty === filterDifficulty;
    const matchType = filterType === 'All' || idea.costSavingTypes.includes(filterType);
    return matchDiff && matchType;
  });

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

  const handleAnnotate = (ideaId: string, annotation: IdeaAnnotation) => {
    const updated = { ...annotations, [ideaId]: annotation };
    setAnnotations(updated);
    if (result?.id) {
      try {
        localStorage.setItem(`brainspark_annotations_${result.id}`, JSON.stringify(updated));
      } catch {}
    }
  };

  const handleRefine = async () => {
    if (!refineFocus.trim() || !result) return;
    const storedKey = localStorage.getItem('brainspark_api_key') || '';
    if (!storedKey) { setRefineError('API key not found. Return to Analyze page and run a fresh analysis.'); return; }
    setRefining(true);
    setRefineError('');
    try {
      const existingTitles = result.ideas.map(i => i.title).join('; ');
      const refineConfig = {
        ...result.config,
        apiKey: storedKey,
        additionalContext: `${result.config.additionalContext ? result.config.additionalContext + '\n\n' : ''}REFINEMENT: Generate DIFFERENT ideas from this prior set — ${existingTitles}. Focus specifically on: ${refineFocus.trim()}`,
      };
      const { ideas, sources } = await generateCostReductionIdeas(
        refineConfig, systemName, subName, undefined, true, undefined
      );
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
            strategicItems: allIdeas.filter(i => i.implementationDifficulty !== 'Low').length,
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

  const quickWins = result.ideas.filter(i => i.implementationDifficulty === 'Low');
  const searchUsedCount = result.ideas.filter(i => i.searchDataUsed).length;

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button onClick={() => navigate('/analyze')} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-6 transition-colors">
            <ArrowLeft size={16} /> New Analysis
          </button>

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
            <div className="flex gap-3">
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
            </div>
          </div>
        </div>

        {/* Ideas Analytics Dashboard */}
        <IdeasDashboard ideas={result.ideas} />

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Ideas Generated', value: result.summary.totalIdeas, icon: Zap, color: 'from-blue-500 to-indigo-600' },
            { label: 'Quick Wins', value: result.summary.quickWins, icon: CheckCircle, color: 'from-green-500 to-emerald-600' },
            { label: 'Strategic Items', value: result.summary.strategicItems, icon: TrendingDown, color: 'from-gold-500 to-amber-600' },
            { label: 'Web Searches', value: result.summary.searchesPerformed, icon: Globe, color: 'from-blue-500 to-cyan-600' },
          ].map((stat) => (
            <div key={stat.label} className="bg-navy-900 border border-white/10 rounded-2xl p-5">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-3`}>
                <stat.icon size={20} className="text-white" />
              </div>
              <div className="text-3xl font-black text-white">{stat.value}</div>
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

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-navy-900 border border-white/10 rounded-2xl">
          <div className="flex items-center gap-2 text-slate-400 text-sm font-medium flex-shrink-0">
            <Filter size={14} /> Filter:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(['All', 'Low', 'Medium', 'High'] as const).map(d => (
              <motion.button key={d} onClick={() => setFilterDifficulty(d)}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${filterDifficulty === d ? 'bg-gold-500/20 text-gold-400 border-gold-500/30' : 'text-slate-400 border-white/10 hover:border-white/25 hover:text-white'}`}>
                {d === 'All' ? 'All Difficulty' : d}
              </motion.button>
            ))}
          </div>
          <div className="w-px h-4 bg-white/10 hidden sm:block" />
          <div className="flex flex-wrap gap-1.5">
            {(['All', 'material', 'process', 'tooling', 'weight', 'complexity', 'warranty', 'logistics', 'commonisation'] as const).map(t => (
              <motion.button key={t} onClick={() => setFilterType(t)}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                className={`px-3 py-1 rounded-lg text-xs font-medium border capitalize transition-colors ${filterType === t ? 'bg-gold-500/20 text-gold-400 border-gold-500/30' : 'text-slate-400 border-white/10 hover:border-white/25 hover:text-white'}`}>
                {t === 'All' ? 'All Types' : t}
              </motion.button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-slate-500 text-xs">
            <RefreshCw size={11} /> {filtered.length}/{result.ideas.length}
          </div>
        </div>

        {/* Ideas */}
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500">No ideas match the current filters.</div>
        ) : (
          <div className="space-y-4 mb-8">
            {filtered.map((idea, i) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                index={i}
                annotation={annotations[idea.id]}
                onAnnotate={(a) => handleAnnotate(idea.id, a)}
              />
            ))}
          </div>
        )}

        {/* Sources panel */}
        {result.sources?.length > 0 && (
          <div className="mb-8">
            <SourcesPanel sources={result.sources} />
          </div>
        )}

        {/* Business Case Calculator */}
        <BusinessCaseCalculator />

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
                  {refining ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : <><Zap size={14} /> Generate 8 More Ideas</>}
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
