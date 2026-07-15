import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardList,
  Plus,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Send,
  Download,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import BusinessCaseModal, {
  type BusinessCase,
  SUV_MODELS,
} from '../components/BusinessCaseModal';
import IdeaDetailPanel from '../components/IdeaDetailPanel';
import type { CostReductionIdea } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Comment {
  id: string;
  userId: string;
  userName: string;
  comment: string;
  createdAt: string;
}

interface KpiData {
  totalPotential: number;
  confirmedSaving: number;
  inProgressSaving: number;
  gateSavings: Record<string, number>;
  gateCount: Record<string, number>;
  totalCases: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${Math.round(n)}`;
}

function fmtGate(g: string): {
  label: string;
  color: string;
  bg: string;
  border: string;
  desc: string;
} {
  const map: Record<
    string,
    { label: string; color: string; bg: string; border: string; desc: string }
  > = {
    G0: {
      label: 'G0',
      color: 'text-slate-300',
      bg: 'bg-slate-500/15',
      border: 'border-slate-500/30',
      desc: 'Idea Generated',
    },
    G1: {
      label: 'G1',
      color: 'text-amber-300',
      bg: 'bg-amber-500/15',
      border: 'border-amber-500/30',
      desc: 'Business Case',
    },
    G2: {
      label: 'G2',
      color: 'text-blue-300',
      bg: 'bg-blue-500/15',
      border: 'border-blue-500/30',
      desc: 'Development WIP',
    },
    G3: {
      label: 'G3',
      color: 'text-green-300',
      bg: 'bg-green-500/15',
      border: 'border-green-500/30',
      desc: 'Confirmed & Agreed',
    },
  };
  return (
    map[g] ?? {
      label: g,
      color: 'text-slate-300',
      bg: 'bg-slate-500/15',
      border: 'border-slate-500/30',
      desc: '',
    }
  );
}

const GATE_ORDER: Array<'G0' | 'G1' | 'G2' | 'G3'> = ['G0', 'G1', 'G2', 'G3'];

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase();
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-navy-900 border border-white/10 rounded-2xl p-4 animate-pulse shadow-card">
      <div className="flex items-start gap-3">
        <div className="w-20 h-5 bg-white/8 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-white/8 rounded w-3/4" />
          <div className="h-3 bg-white/5 rounded w-1/2" />
        </div>
        <div className="w-12 h-5 bg-white/8 rounded-full" />
      </div>
    </div>
  );
}

// ─── Gate Badge ───────────────────────────────────────────────────────────────

function GateBadge({ gate }: { gate: string }) {
  const info = fmtGate(gate);
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${info.bg} ${info.color} ${info.border}`}
    >
      {info.label}
    </span>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'xs' }) {
  const initials = getInitials(name);
  const dim = size === 'xs' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs';
  return (
    <div
      className={`${dim} rounded-full bg-gold-500/20 border border-gold-500/30 text-gold-400 font-semibold flex items-center justify-center flex-shrink-0`}
    >
      {initials}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: string;
}) {
  return (
    <div
      className={`bg-navy-900 border rounded-2xl p-4 shadow-card ${accent ? `border-${accent}/25` : 'border-white/10'}`}
    >
      <div className="text-slate-500 text-xs mb-1">{label}</div>
      <div
        className={`text-xl font-bold ${accent ? `text-${accent}` : 'text-white'}`}
      >
        {value}
      </div>
      <div className="text-slate-500 text-xs mt-0.5">{sub}</div>
    </div>
  );
}

// ─── Comments Section ─────────────────────────────────────────────────────────

function CommentsSection({
  caseId,
  comments,
  draft,
  submitting,
  onDraftChange,
  onSubmit,
}: {
  caseId: string;
  comments: Comment[] | undefined;
  draft: string;
  submitting: boolean;
  onDraftChange: (caseId: string, text: string) => void;
  onSubmit: (caseId: string) => void;
}) {
  if (!comments) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 size={16} className="animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="text-xs text-slate-500 font-medium mb-2 uppercase tracking-wide">
        Comments ({comments.length})
      </div>
      <div className="space-y-3 mb-3">
        {comments.length === 0 && (
          <p className="text-slate-600 text-xs">No comments yet. Be the first.</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <Avatar name={c.userName} size="xs" />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-slate-300 text-xs font-medium">
                  {c.userName}
                </span>
                <span className="text-slate-600 text-[10px]">
                  {timeAgo(c.createdAt)}
                </span>
              </div>
              <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">
                {c.comment}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <textarea
          rows={1}
          value={draft}
          onChange={(e) => onDraftChange(caseId, e.target.value)}
          placeholder="Add a comment…"
          className="flex-1 bg-navy-800 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-gold-500/30 resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSubmit(caseId);
            }
          }}
        />
        <button
          onClick={() => onSubmit(caseId)}
          disabled={submitting || !draft.trim()}
          className="px-3 py-2 rounded-lg bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-navy-950 transition-colors"
        >
          {submitting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const { user, token } = useAuth();

  const [cases, setCases] = useState<BusinessCase[]>([]);
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);

  const [filterGate, setFilterGate] = useState<'All' | 'G0' | 'G1' | 'G2' | 'G3'>('All');
  const [filterVehicle, setFilterVehicle] = useState('All');
  const [filterOwner, setFilterOwner] = useState('All');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);
  const [updatingGateId, setUpdatingGateId] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newIdeaTitle, setNewIdeaTitle] = useState('');
  const [showTitlePrompt, setShowTitlePrompt] = useState(false);

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token]
  );

  // ── Load data ──
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [casesRes, kpiRes] = await Promise.all([
        fetch('/api/business-cases', { headers: authHeaders() }),
        fetch('/api/business-cases/kpi', { headers: authHeaders() }),
      ]);
      if (casesRes.ok) setCases(await casesRes.json());
      if (kpiRes.ok) setKpi(await kpiRes.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Load comments on expand ──
  async function loadComments(id: string) {
    if (comments[id]) return;
    try {
      const r = await fetch(`/api/business-cases/${id}/comments`, {
        headers: authHeaders(),
      });
      if (r.ok) {
        const data: Comment[] = await r.json();
        setComments((prev) => ({ ...prev, [id]: data }));
      }
    } catch {
      setComments((prev) => ({ ...prev, [id]: [] }));
    }
  }

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      loadComments(id);
    }
  }

  // ── Comment submit ──
  async function submitComment(caseId: string) {
    const text = (commentDraft[caseId] ?? '').trim();
    if (!text) return;
    setSubmittingComment(caseId);
    try {
      const r = await fetch(`/api/business-cases/${caseId}/comments`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ comment: text }),
      });
      if (r.ok) {
        const newComment: Comment = await r.json();
        setComments((prev) => ({
          ...prev,
          [caseId]: [...(prev[caseId] ?? []), newComment],
        }));
        setCommentDraft((prev) => ({ ...prev, [caseId]: '' }));
      }
    } catch {
      /* ignore */
    } finally {
      setSubmittingComment(null);
    }
  }

  // ── Gate advancement ──
  async function updateGate(caseId: string, newGate: 'G0' | 'G1' | 'G2' | 'G3') {
    setUpdatingGateId(caseId);
    try {
      const r = await fetch(`/api/business-cases/${caseId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ gate: newGate }),
      });
      if (r.ok) {
        await loadData();
      }
    } catch {
      /* ignore */
    } finally {
      setUpdatingGateId(null);
    }
  }

  // ── Export to Excel ──
  async function exportExcel() {
    const rows = cases.map((c) => ({
      'Idea Number': c.ideaNumber,
      Title: c.ideaTitle,
      Owner: c.userName,
      Commodity: c.commodityName,
      Vehicles: c.vehicleData.map((v) => v.model).join(', '),
      'Saving/Part (£)': c.savingPerPart,
      'Total Annual Saving (£)': c.totalAnnualSaving,
      'Tooling (£)': c.toolingCost,
      'T&V (£)': c.tvCost,
      'ROI %': c.roi,
      'IRR %': c.irr,
      'Payback Months': c.paybackMonths,
      Gate: c.gate,
      Year: c.implementationYear,
      Notes: c.notes,
    }));
    const { downloadXlsx, objectsToAoa } = await import('../services/xlsx-write');
    await downloadXlsx(`idea-pipeline-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      { name: 'Pipeline', rows: objectsToAoa(rows) },
    ]);
  }

  // ── Filtered list ──
  const filteredCases = cases.filter((c) => {
    if (filterGate !== 'All' && c.gate !== filterGate) return false;
    if (
      filterVehicle !== 'All' &&
      !c.vehicleData.some((v) => v.model === filterVehicle)
    )
      return false;
    if (filterOwner !== 'All' && c.userName !== filterOwner) return false;
    return true;
  });

  // ── Unique owners ──
  const owners = Array.from(new Set(cases.map((c) => c.userName))).sort();

  // ── Gate stats ──
  const gateStats = (['G0', 'G1', 'G2', 'G3'] as const).map((g) => {
    const list = cases.filter((c) => c.gate === g);
    const total = list.reduce((s, c) => s + c.totalAnnualSaving, 0);
    return { gate: g, count: list.length, total };
  });

  // ── KPI fallback calcs ──
  const totalPotential =
    kpi?.totalPotential ??
    cases.reduce((s, c) => s + c.totalAnnualSaving, 0);
  const confirmedSaving =
    kpi?.confirmedSaving ??
    cases.filter((c) => c.gate === 'G3').reduce((s, c) => s + c.totalAnnualSaving, 0);
  const inProgressSaving =
    kpi?.inProgressSaving ??
    cases
      .filter((c) => c.gate === 'G1' || c.gate === 'G2')
      .reduce((s, c) => s + c.totalAnnualSaving, 0);

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-6xl mx-auto">

        {/* ── Header ── */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-9 h-9 rounded-xl bg-gold-500/15 border border-gold-500/25 flex items-center justify-center">
                <ClipboardList size={18} className="text-gold-400" />
              </div>
              <h1 className="text-2xl font-black text-white">Idea Pipeline</h1>
            </div>
            <p className="text-slate-400 text-sm ml-11">
              All team ideas tracked through G0 → G3 implementation gates
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportExcel}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:border-white/20 text-sm transition-colors"
            >
              <Download size={14} />
              Export
            </button>
            <button
              onClick={() => setShowTitlePrompt(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-semibold text-sm transition-all shadow-glow-gold"
            >
              <Plus size={15} />
              Add Business Case
            </button>
          </div>
        </div>

        {/* ── Title prompt mini modal ── */}
        <AnimatePresence>
          {showTitlePrompt && (
            <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-navy-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
              >
                <h3 className="text-white font-semibold mb-3">New Business Case</h3>
                <label className="text-xs text-slate-500 mb-1.5 block">Idea title</label>
                <input
                  autoFocus
                  value={newIdeaTitle}
                  onChange={(e) => setNewIdeaTitle(e.target.value)}
                  placeholder="e.g. Switch bracket from steel to aluminium"
                  className="w-full bg-navy-800 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/30 mb-4"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newIdeaTitle.trim()) {
                      setShowTitlePrompt(false);
                      setShowAddModal(true);
                    }
                  }}
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => { setShowTitlePrompt(false); setNewIdeaTitle(''); }}
                    className="px-4 py-2 rounded-xl border border-white/10 text-slate-400 hover:text-white text-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!newIdeaTitle.trim()}
                    onClick={() => {
                      setShowTitlePrompt(false);
                      setShowAddModal(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-navy-950 font-semibold text-sm transition-all shadow-glow-gold"
                  >
                    Continue
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <KpiCard
            label="Total Portfolio"
            value={fmtMoney(totalPotential)}
            sub={`across ${cases.length} idea${cases.length !== 1 ? 's' : ''}`}
          />
          <KpiCard
            label="In Progress (G1+G2)"
            value={fmtMoney(inProgressSaving)}
            sub="active development"
            accent="amber-400"
          />
          <KpiCard
            label="Confirmed Savings (G3)"
            value={fmtMoney(confirmedSaving)}
            sub="implemented & agreed"
            accent="green-400"
          />
        </div>

        {/* ── Gate filter tabs ── */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          <motion.button
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
            onClick={() => setFilterGate('All')}
            className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors ${
              filterGate === 'All'
                ? 'bg-white/10 text-white border-white/20'
                : 'text-slate-400 border-white/10 hover:border-white/20'
            }`}
          >
            All
            <span className="text-slate-500">{cases.length}</span>
          </motion.button>
          {gateStats.map(({ gate, count, total }) => {
            const info = fmtGate(gate);
            const active = filterGate === gate;
            return (
              <motion.button
                key={gate}
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
                onClick={() => setFilterGate(gate)}
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors ${
                  active
                    ? `${info.bg} ${info.color} ${info.border}`
                    : 'text-slate-400 border-white/10 hover:border-white/20'
                }`}
              >
                {gate}
                <span className={active ? 'opacity-70' : 'text-slate-600'}>
                  {count}
                </span>
                {count > 0 && (
                  <span className={`hidden sm:inline ${active ? 'opacity-60' : 'text-slate-600'}`}>
                    · {fmtMoney(total)}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* ── Filters bar ── */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <select
            value={filterVehicle}
            onChange={(e) => setFilterVehicle(e.target.value)}
            className="bg-navy-900 border border-white/10 rounded-lg px-3 py-2 text-slate-400 text-xs focus:outline-none focus:border-gold-500/30"
          >
            <option value="All">All vehicles</option>
            {SUV_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={filterOwner}
            onChange={(e) => setFilterOwner(e.target.value)}
            className="bg-navy-900 border border-white/10 rounded-lg px-3 py-2 text-slate-400 text-xs focus:outline-none focus:border-gold-500/30"
          >
            <option value="All">All owners</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        {/* ── Gate legend ── */}
        <div className="flex flex-wrap gap-2 mb-5">
          {(['G0', 'G1', 'G2', 'G3'] as const).map((g) => {
            const info = fmtGate(g);
            return (
              <span
                key={g}
                className={`text-xs px-2 py-0.5 rounded-full border ${info.bg} ${info.color} ${info.border}`}
              >
                {g}: {info.desc}
              </span>
            );
          })}
        </div>

        {/* ── Cases list ── */}
        {loading ? (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center mx-auto mb-4">
              <ClipboardList size={28} className="text-gold-400/50" />
            </div>
            <h3 className="text-white font-semibold mb-2">No ideas found</h3>
            <p className="text-slate-500 text-sm max-w-xs mx-auto">
              {cases.length === 0
                ? 'Add your first business case to get started.'
                : 'Try adjusting the filters.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCases.map((bc) => {
              const gateInfo = fmtGate(bc.gate);
              const isExpanded = expandedId === bc.id;
              const isOwner = user?.id === bc.userId;
              const gateIdx = GATE_ORDER.indexOf(bc.gate);
              const prevGate = gateIdx > 0 ? GATE_ORDER[gateIdx - 1] : null;
              const nextGate = gateIdx < GATE_ORDER.length - 1 ? GATE_ORDER[gateIdx + 1] : null;
              const isUpdating = updatingGateId === bc.id;

              return (
                <motion.div
                  key={bc.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`bg-navy-900 border rounded-2xl overflow-hidden transition-all shadow-card ${
                    isExpanded
                      ? 'border-gold-500/30 shadow-lg shadow-gold-500/5'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  {/* Card header row */}
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => toggleExpand(bc.id)}
                  >
                    {/* Row 1 */}
                    <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        {bc.ideaNumber && (
                          <span className="text-xs font-mono text-slate-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded-md flex-shrink-0">
                            {bc.ideaNumber}
                          </span>
                        )}
                        <span className="text-white font-semibold text-sm truncate">
                          {bc.ideaTitle}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <GateBadge gate={bc.gate} />
                        <div className="flex items-center gap-1.5">
                          <Avatar name={bc.userName} size="xs" />
                          <span className="text-slate-400 text-xs hidden sm:inline">
                            {bc.userName}
                          </span>
                        </div>
                        {isExpanded ? (
                          <ChevronUp size={15} className="text-slate-500" />
                        ) : (
                          <ChevronDown size={15} className="text-slate-500" />
                        )}
                      </div>
                    </div>

                    {/* Row 2 */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {bc.vehicleData.map((v) => (
                        <span
                          key={v.model}
                          className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-400"
                        >
                          {v.model}
                        </span>
                      ))}
                      {bc.savingPerPart > 0 && (
                        <span className="text-xs text-slate-500">
                          £{bc.savingPerPart.toFixed(2)}/part
                        </span>
                      )}
                      <span className="ml-auto text-gold-400 font-bold text-sm">
                        {fmtMoney(bc.totalAnnualSaving)}
                        <span className="text-slate-600 text-xs font-normal ml-1">
                          /yr
                        </span>
                      </span>
                      <span className="text-slate-600 text-xs">{bc.implementationYear}</span>
                    </div>
                  </div>

                  {/* Expanded section */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 border-t border-white/8 pt-4">
                          {/* Metrics grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                            {[
                              {
                                label: 'ROI',
                                value: isFinite(bc.roi)
                                  ? `${bc.roi.toFixed(1)}%`
                                  : '∞',
                              },
                              {
                                label: 'IRR (5yr)',
                                value: bc.irr > 0 ? `${bc.irr.toFixed(1)}%` : '—',
                              },
                              {
                                label: 'Payback',
                                value: isFinite(bc.paybackMonths)
                                  ? `${bc.paybackMonths.toFixed(1)}mo`
                                  : '—',
                              },
                              {
                                label: 'Investment',
                                value: fmtMoney(bc.toolingCost + bc.tvCost),
                              },
                              {
                                label: 'Duration',
                                value: `${bc.implementationMonths} months`,
                              },
                              {
                                label: 'Start Year',
                                value: String(bc.implementationYear),
                              },
                              ...(bc.commodityName
                                ? [{ label: 'Commodity', value: bc.commodityName }]
                                : []),
                              ...(bc.systemName
                                ? [{ label: 'System', value: bc.systemName }]
                                : []),
                            ].map((m) => (
                              <div
                                key={m.label}
                                className="bg-navy-800 border border-white/8 rounded-xl p-2.5"
                              >
                                <div className="text-slate-600 text-[10px] mb-0.5">
                                  {m.label}
                                </div>
                                <div className="text-white text-sm font-semibold">
                                  {m.value}
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Notes */}
                          {bc.notes && (
                            <div className="mb-4 text-slate-400 text-xs leading-relaxed bg-navy-800 rounded-xl px-3 py-2.5 border border-white/8">
                              {bc.notes}
                            </div>
                          )}

                          {/* Source idea full details */}
                          {bc.ideaData && (() => {
                            const parsedIdea: CostReductionIdea | null = (() => {
                              try { return JSON.parse(bc.ideaData!); } catch { return null; }
                            })();
                            return parsedIdea ? (
                              <div className="mb-4 rounded-xl border border-white/10 bg-navy-800/60 overflow-hidden">
                                <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8">
                                  <ClipboardList size={12} className="text-gold-400" />
                                  <span className="text-gold-400 text-xs font-semibold uppercase tracking-wider">Source Idea Details</span>
                                </div>
                                <div className="p-3">
                                  <IdeaDetailPanel idea={parsedIdea} />
                                </div>
                              </div>
                            ) : null;
                          })()}

                          {/* Per-vehicle breakdown */}
                          {bc.vehicleData.length > 0 && (
                            <div className="mb-4">
                              <div className="text-xs text-slate-500 font-medium mb-2 uppercase tracking-wide">
                                Vehicle Breakdown
                              </div>
                              <div className="bg-navy-800 rounded-xl border border-white/8 overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-white/8">
                                      <th className="text-left px-3 py-2 text-slate-600 font-medium">
                                        Model
                                      </th>
                                      <th className="text-right px-3 py-2 text-slate-600 font-medium">
                                        Volume
                                      </th>
                                      <th className="text-right px-3 py-2 text-slate-600 font-medium">
                                        %
                                      </th>
                                      <th className="text-right px-3 py-2 text-slate-600 font-medium">
                                        Vehicle Saving
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {bc.vehicleData.map((v) => {
                                      const vSaving =
                                        bc.savingPerPart *
                                        v.volume *
                                        (v.applicablePct / 100);
                                      return (
                                        <tr
                                          key={v.model}
                                          className="border-b border-white/5 last:border-0"
                                        >
                                          <td className="px-3 py-2 text-slate-300 font-medium">
                                            {v.model}
                                          </td>
                                          <td className="px-3 py-2 text-right text-slate-400">
                                            {v.volume.toLocaleString('en-GB')}
                                          </td>
                                          <td className="px-3 py-2 text-right text-slate-400">
                                            {v.applicablePct}%
                                          </td>
                                          <td className="px-3 py-2 text-right text-gold-400 font-semibold">
                                            {fmtMoney(vSaving)}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Gate advancement (owner only) */}
                          {isOwner && (
                            <div className="flex items-center gap-2 mb-4">
                              <span className="text-xs text-slate-600">Move gate:</span>
                              {prevGate && (
                                <motion.button
                                  whileTap={{ scale: 0.88 }}
                                  onClick={() => updateGate(bc.id, prevGate)}
                                  disabled={isUpdating}
                                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition-colors ${fmtGate(prevGate).bg} ${fmtGate(prevGate).color} ${fmtGate(prevGate).border} hover:opacity-80 disabled:opacity-40`}
                                >
                                  {isUpdating ? (
                                    <Loader2 size={11} className="animate-spin" />
                                  ) : (
                                    <ChevronLeft size={11} />
                                  )}
                                  {prevGate}
                                </motion.button>
                              )}
                              <span
                                className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${gateInfo.bg} ${gateInfo.color} ${gateInfo.border}`}
                              >
                                {bc.gate}
                              </span>
                              {nextGate && (
                                <motion.button
                                  whileTap={{ scale: 0.88 }}
                                  onClick={() => updateGate(bc.id, nextGate)}
                                  disabled={isUpdating}
                                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition-colors ${fmtGate(nextGate).bg} ${fmtGate(nextGate).color} ${fmtGate(nextGate).border} hover:opacity-80 disabled:opacity-40`}
                                >
                                  {nextGate}
                                  {isUpdating ? (
                                    <Loader2 size={11} className="animate-spin" />
                                  ) : (
                                    <ChevronRight size={11} />
                                  )}
                                </motion.button>
                              )}
                            </div>
                          )}

                          {/* Comments */}
                          <CommentsSection
                            caseId={bc.id}
                            comments={comments[bc.id]}
                            draft={commentDraft[bc.id] ?? ''}
                            submitting={submittingComment === bc.id}
                            onDraftChange={(id, text) =>
                              setCommentDraft((prev) => ({ ...prev, [id]: text }))
                            }
                            onSubmit={submitComment}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add Business Case Modal ── */}
      <AnimatePresence>
        {showAddModal && (
          <BusinessCaseModal
            ideaTitle={newIdeaTitle}
            onClose={() => {
              setShowAddModal(false);
              setNewIdeaTitle('');
            }}
            onSaved={() => {
              setShowAddModal(false);
              setNewIdeaTitle('');
              loadData();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
