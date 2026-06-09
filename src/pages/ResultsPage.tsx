import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FileDown, FileSpreadsheet, Presentation, ArrowLeft, Filter,
  TrendingDown, Zap, AlertTriangle, CheckCircle, Clock,
  ChevronDown, ChevronUp, BarChart3, RefreshCw, Tag
} from 'lucide-react';
import { AnalysisResult, CostReductionIdea, CostSavingType, Difficulty } from '../types';
import { exportToExcel, exportToPowerPoint } from '../services/export-service';

const DIFFICULTY_CONFIG: Record<Difficulty, { color: string; bg: string; border: string; icon: typeof CheckCircle }> = {
  Low: { color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30', icon: CheckCircle },
  Medium: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: Clock },
  High: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: AlertTriangle },
};

const TYPE_COLORS: Record<CostSavingType, string> = {
  material: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  process: 'bg-purple-500/15 text-purple-300 border-purple-500/25',
  logistics: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  complexity: 'bg-pink-500/15 text-pink-300 border-pink-500/25',
  warranty: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
  tooling: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
  weight: 'bg-teal-500/15 text-teal-300 border-teal-500/25',
};

const LEVEL_COLORS: Record<string, string> = {
  Assembly: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  Subassembly: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
  Part: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
};

function IdeaCard({ idea, index }: { idea: CostReductionIdea; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const diff = DIFFICULTY_CONFIG[idea.implementationDifficulty];
  const DiffIcon = diff.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className="bg-navy-900 border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all"
    >
      {/* Header */}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-gold-500/15 border border-gold-500/25 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-gold-400 font-bold text-sm">{index + 1}</span>
            </div>
            <h3 className="text-white font-semibold text-base leading-tight">{idea.title}</h3>
          </div>
          <span className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${diff.bg} ${diff.color} ${diff.border}`}>
            <DiffIcon size={11} />
            {idea.implementationDifficulty}
          </span>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${LEVEL_COLORS[idea.systemLevel] || ''}`}>
            {idea.systemLevel}
          </span>
          {idea.costSavingTypes.map(t => (
            <span key={t} className={`px-2 py-0.5 rounded-full border text-xs font-medium capitalize ${TYPE_COLORS[t] || ''}`}>
              {t}
            </span>
          ))}
        </div>

        {/* Cost metrics row */}
        <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-white/5 mb-3">
          <div>
            <div className="text-slate-500 text-xs mb-0.5">Saving Range</div>
            <div className="text-green-400 font-semibold text-sm">{idea.costSavingPotential.percentage || '—'}</div>
          </div>
          <div>
            <div className="text-slate-500 text-xs mb-0.5">Annual Value</div>
            <div className="text-gold-400 font-semibold text-sm">{idea.costSavingPotential.annualValue || 'TBD'}</div>
          </div>
          <div>
            <div className="text-slate-500 text-xs mb-0.5">Timeline</div>
            <div className="text-slate-300 font-medium text-sm">{idea.timeToImplement}</div>
          </div>
        </div>

        <p className="text-slate-400 text-sm leading-relaxed line-clamp-3">
          {idea.technicalDescription}
        </p>

        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex items-center gap-1.5 text-gold-400 hover:text-gold-300 text-sm font-medium transition-colors"
        >
          {expanded ? <><ChevronUp size={14} /> Show Less</> : <><ChevronDown size={14} /> Show Full Details</>}
        </button>
      </div>

      {/* Expanded details */}
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
                  <span key={p} className="px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs">
                    {p}
                  </span>
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
              <span className="text-blue-400 text-xs font-semibold uppercase tracking-wide">Benchmark Reference: </span>
              <span className="text-slate-400 text-sm">{idea.benchmarkReference}</span>
            </div>
          )}

          <div className="p-3 rounded-xl bg-white/5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-slate-500 text-xs">Qualitative Potential</div>
                <div className="text-white text-sm font-medium mt-0.5">{idea.costSavingPotential.qualitative}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">Implementation Time</div>
                <div className="text-white text-sm font-medium mt-0.5">{idea.timeToImplement}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default function ResultsPage() {
  const navigate = useNavigate();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [systemName, setSystemName] = useState('');
  const [subName, setSubName] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState<Difficulty | 'All'>('All');
  const [filterType, setFilterType] = useState<CostSavingType | 'All'>('All');
  const [exporting, setExporting] = useState<'excel' | 'pptx' | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('analysisResult');
    const sys = sessionStorage.getItem('analysisSystemName');
    const sub = sessionStorage.getItem('analysisSubName');
    if (stored) {
      setResult(JSON.parse(stored));
      setSystemName(sys || '');
      setSubName(sub || '');
    } else {
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
    try {
      exportToExcel(result, systemName, subName);
    } finally {
      setExporting(null);
    }
  };

  const handlePptxExport = async () => {
    setExporting('pptx');
    try {
      await exportToPowerPoint(result, systemName, subName);
    } finally {
      setExporting(null);
    }
  };

  const quickWinIdeas = result.ideas.filter(i => i.implementationDifficulty === 'Low');
  const highImpactTypes = [...new Set(result.ideas.flatMap(i => i.costSavingTypes))];

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/analyze')}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm mb-6"
          >
            <ArrowLeft size={16} /> New Analysis
          </button>

          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-gold-400" />
                <span className="text-gold-400 text-sm font-medium">{result.config.vehicleType}</span>
              </div>
              <h1 className="text-3xl font-black text-white">{systemName}</h1>
              <p className="text-slate-400 mt-1">{subName} — {result.generatedAt}</p>
            </div>

            {/* Export buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleExcelExport}
                disabled={!!exporting}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold text-sm transition-all hover:scale-105"
              >
                <FileSpreadsheet size={16} />
                {exporting === 'excel' ? 'Exporting...' : 'Export Excel'}
              </button>
              <button
                onClick={handlePptxExport}
                disabled={!!exporting}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold text-sm transition-all hover:scale-105"
              >
                <Presentation size={16} />
                {exporting === 'pptx' ? 'Exporting...' : 'Export PowerPoint'}
              </button>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Ideas Generated', value: result.summary.totalIdeas, icon: Zap, color: 'from-blue-500 to-indigo-600' },
            { label: 'Quick Wins', value: result.summary.quickWins, icon: CheckCircle, color: 'from-green-500 to-emerald-600' },
            { label: 'Strategic Items', value: result.summary.strategicItems, icon: TrendingDown, color: 'from-gold-500 to-amber-600' },
            { label: 'Cost Types', value: highImpactTypes.length, icon: BarChart3, color: 'from-purple-500 to-pink-600' },
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

        {/* Quick wins banner */}
        {quickWinIdeas.length > 0 && (
          <div className="mb-6 p-4 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-start gap-3">
            <CheckCircle size={20} className="text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="text-green-400 font-semibold">{quickWinIdeas.length} Quick Win{quickWinIdeas.length > 1 ? 's' : ''} Identified</span>
              <span className="text-slate-400 text-sm ml-2">— low implementation difficulty, ready for fast-track engineering review.</span>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-navy-900 border border-white/10 rounded-2xl">
          <div className="flex items-center gap-2 text-slate-400 text-sm font-medium">
            <Filter size={14} /> Filters:
          </div>
          <div className="flex flex-wrap gap-2">
            {(['All', 'Low', 'Medium', 'High'] as const).map(d => (
              <button
                key={d}
                onClick={() => setFilterDifficulty(d)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${
                  filterDifficulty === d
                    ? 'bg-gold-500/20 text-gold-400 border-gold-500/30'
                    : 'text-slate-400 border-white/10 hover:border-white/20'
                }`}
              >
                {d === 'All' ? 'All Difficulty' : d}
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-white/10" />
          <div className="flex flex-wrap gap-2">
            {(['All', 'material', 'process', 'logistics', 'complexity', 'warranty', 'tooling', 'weight'] as const).map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors border capitalize ${
                  filterType === t
                    ? 'bg-gold-500/20 text-gold-400 border-gold-500/30'
                    : 'text-slate-400 border-white/10 hover:border-white/20'
                }`}
              >
                {t === 'All' ? 'All Types' : t}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 text-slate-500 text-xs">
            <RefreshCw size={12} />
            Showing {filtered.length} of {result.ideas.length}
          </div>
        </div>

        {/* Ideas grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            No ideas match the current filters.
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((idea, i) => (
              <IdeaCard key={idea.id} idea={idea} index={i} />
            ))}
          </div>
        )}

        {/* Export footer */}
        <div className="mt-10 p-6 rounded-2xl bg-navy-900 border border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <div className="text-white font-semibold mb-1">Ready to present these findings?</div>
            <div className="text-slate-400 text-sm">Export to a formatted Excel workbook or management presentation deck</div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleExcelExport}
              disabled={!!exporting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold text-sm transition-all"
            >
              <FileSpreadsheet size={16} />
              Excel Workbook
            </button>
            <button
              onClick={handlePptxExport}
              disabled={!!exporting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold text-sm transition-all"
            >
              <FileDown size={16} />
              PowerPoint Deck
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
