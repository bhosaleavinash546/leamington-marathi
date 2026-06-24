import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target, TrendingDown, ChevronRight, Edit3, Trash2,
  CheckCircle, Clock, AlertTriangle, ArrowRight, X,
  Save, Plus, BarChart3, TrendingUp, Award, Zap,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../hooks/useToast';

type VaveStage =
  | 'Identified'
  | 'Investigating'
  | 'Approved'
  | 'In Progress'
  | 'Validated'
  | 'Confirmed';

interface VaveAction {
  id: string;
  ideaTitle: string;
  ideaDescription: string;
  systemName: string;
  subassemblyName: string;
  partName: string;
  targetSaving: string;
  confirmedSaving: string;
  stage: VaveStage;
  owner: string;
  targetDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

const STAGES: { key: VaveStage; label: string; sublabel: string; color: string; bg: string; border: string; dot: string; icon: typeof CheckCircle }[] = [
  { key: 'Identified',  label: 'Identified',  sublabel: 'Idea spotted',         color: 'text-slate-300',  bg: 'bg-slate-500/10',  border: 'border-slate-500/20',  dot: 'bg-slate-400',   icon: Zap },
  { key: 'Investigating', label: 'Investigating', sublabel: 'Feasibility study', color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  dot: 'bg-amber-400',   icon: Clock },
  { key: 'Approved',   label: 'Approved',    sublabel: 'Approved to implement', color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   dot: 'bg-blue-400',    icon: CheckCircle },
  { key: 'In Progress', label: 'In Progress', sublabel: 'Implementation active', color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20', dot: 'bg-violet-400',  icon: ArrowRight },
  { key: 'Validated',  label: 'Validated',   sublabel: 'Saving confirmed pilot', color: 'text-teal-400',   bg: 'bg-teal-500/10',   border: 'border-teal-500/20',   dot: 'bg-teal-400',    icon: TrendingUp },
  { key: 'Confirmed',  label: 'Confirmed',   sublabel: 'In production saving',   color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20',  dot: 'bg-green-400',   icon: Award },
];

function parseSaving(v?: string): number {
  if (!v) return 0;
  const c = v.toLowerCase().replace(/[€£$¥₹,\s]/g, '');
  const m = c.match(/([\d.]+)\s*([mk]?)/);
  if (!m) return 0;
  return parseFloat(m[1]) * (m[2] === 'm' ? 1_000_000 : m[2] === 'k' ? 1_000 : 1);
}
function fmtSaving(n: number): string {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `€${Math.round(n / 1_000)}k`;
  return n > 0 ? `€${Math.round(n)}` : '—';
}

function StageTag({ stage }: { stage: VaveStage }) {
  const s = STAGES.find(x => x.key === stage) ?? STAGES[0];
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border ${s.bg} ${s.color} ${s.border}`}>
      {s.label}
    </span>
  );
}

interface EditPanelProps {
  action: VaveAction;
  onSave: (updates: Partial<VaveAction>) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

function EditPanel({ action, onSave, onDelete, onClose }: EditPanelProps) {
  const [form, setForm] = useState({
    stage: action.stage,
    owner: action.owner,
    targetDate: action.targetDate,
    targetSaving: action.targetSaving,
    confirmedSaving: action.confirmedSaving,
    notes: action.notes,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      stage: action.stage,
      owner: action.owner,
      targetDate: action.targetDate,
      targetSaving: action.targetSaving,
      confirmedSaving: action.confirmedSaving,
      notes: action.notes,
    });
  }, [action]);

  async function handleSave() {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  return (
    <motion.div
      initial={{ x: 360, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 360, opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 280 }}
      className="fixed right-0 top-0 bottom-0 w-96 bg-navy-900 border-l border-white/10 z-40 flex flex-col shadow-2xl"
    >
      <div className="flex items-center justify-between p-5 border-b border-white/8">
        <h3 className="text-white font-semibold text-sm">Edit VAVE Action</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/8 transition-colors">
          <X size={16} className="text-slate-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Idea</label>
          <p className="text-white text-sm leading-snug">{action.ideaTitle}</p>
          {action.systemName && (
            <p className="text-gold-500 text-xs mt-0.5">{action.systemName}{action.subassemblyName ? ` › ${action.subassemblyName}` : ''}</p>
          )}
        </div>

        <div>
          <label className="text-xs text-slate-500 mb-1.5 block">Stage</label>
          <div className="grid grid-cols-2 gap-1.5">
            {STAGES.map(s => (
              <button
                key={s.key}
                onClick={() => setForm(f => ({ ...f, stage: s.key }))}
                className={`px-2.5 py-1.5 rounded-lg text-xs border transition-colors text-left flex items-center gap-1.5 ${
                  form.stage === s.key
                    ? `${s.bg} ${s.color} ${s.border}`
                    : 'text-slate-500 border-white/10 hover:border-white/20'
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${form.stage === s.key ? s.dot : 'bg-slate-600'}`} />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Owner</label>
            <input
              value={form.owner}
              onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
              placeholder="e.g. A. Bhosale"
              className="w-full bg-navy-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/30"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Target Date</label>
            <input
              type="date"
              value={form.targetDate}
              onChange={e => setForm(f => ({ ...f, targetDate: e.target.value }))}
              className="w-full bg-navy-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/30"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Target Saving</label>
            <input
              value={form.targetSaving}
              onChange={e => setForm(f => ({ ...f, targetSaving: e.target.value }))}
              placeholder="e.g. €480k"
              className="w-full bg-navy-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/30"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Confirmed Saving</label>
            <input
              value={form.confirmedSaving}
              onChange={e => setForm(f => ({ ...f, confirmedSaving: e.target.value }))}
              placeholder="e.g. €440k (fill when validated)"
              className="w-full bg-navy-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/30"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Engineering progress, supplier discussions, blockers..."
              rows={3}
              className="w-full bg-navy-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/30 resize-none"
            />
          </div>
        </div>
      </div>

      <div className="p-5 border-t border-white/8 flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-950 font-semibold text-sm transition-all"
        >
          <Save size={14} />
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button
          onClick={onDelete}
          className="p-2.5 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors"
          title="Remove from tracker"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </motion.div>
  );
}

export default function VaveTrackerPage() {
  const { token } = useAuth();
  const [actions, setActions] = useState<VaveAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<VaveAction | null>(null);
  const [filterStage, setFilterStage] = useState<VaveStage | 'All'>('All');

  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchActions = useCallback(async () => {
    try {
      const r = await fetch('/api/vave-actions', { headers: authHeaders });
      if (r.ok) setActions(await r.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchActions(); }, [fetchActions]);

  async function handleSave(id: string, updates: Partial<VaveAction>) {
    const r = await fetch(`/api/vave-actions/${id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify(updates),
    });
    if (r.ok) {
      setActions(prev => prev.map(a => a.id === id ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a));
      toast.success('VAVE action updated');
      setSelected(prev => prev?.id === id ? { ...prev, ...updates, updatedAt: new Date().toISOString() } as VaveAction : prev);
    } else {
      toast.error('Failed to update action');
    }
  }

  async function handleDelete(id: string) {
    const r = await fetch(`/api/vave-actions/${id}`, { method: 'DELETE', headers: authHeaders });
    if (r.ok) {
      setActions(prev => prev.filter(a => a.id !== id));
      setSelected(null);
      toast.success('Action removed from tracker');
    }
  }

  // Funnel metrics
  const funnelStats = STAGES.map(stage => {
    const stageActions = actions.filter(a => a.stage === stage.key);
    const totalTarget = stageActions.reduce((s, a) => s + parseSaving(a.targetSaving), 0);
    const totalConfirmed = stageActions.reduce((s, a) => s + parseSaving(a.confirmedSaving), 0);
    return { ...stage, count: stageActions.length, totalTarget, totalConfirmed };
  });

  const totalConfirmed = funnelStats.find(s => s.key === 'Confirmed')?.totalTarget ?? 0;
  const totalPipeline = funnelStats.reduce((s, f) => s + f.totalTarget, 0);
  const totalValidated = funnelStats.slice(4).reduce((s, f) => s + f.totalTarget, 0);

  const displayed = filterStage === 'All' ? actions : actions.filter(a => a.stage === filterStage);

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                  <Target size={18} className="text-emerald-400" />
                </div>
                <h1 className="text-2xl font-black text-white">VAVE Tracker</h1>
              </div>
              <p className="text-slate-400 text-sm ml-11">Track approved cost-reduction ideas from identification to confirmed saving.</p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="px-3 py-1.5 rounded-lg bg-navy-900 border border-white/10 text-slate-400">
                {actions.length} action{actions.length !== 1 ? 's' : ''} tracked
              </div>
            </div>
          </div>
        </div>

        {/* Funnel summary */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-navy-900 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 size={14} className="text-slate-400" />
              <span className="text-slate-400 text-xs">Total Pipeline</span>
            </div>
            <div className="text-white text-xl font-bold">{fmtSaving(totalPipeline)}</div>
            <div className="text-slate-500 text-xs mt-0.5">{actions.length} ideas across all stages</div>
          </div>
          <div className="bg-navy-900 border border-teal-500/20 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={14} className="text-teal-400" />
              <span className="text-teal-400 text-xs">Validated +</span>
            </div>
            <div className="text-white text-xl font-bold">{fmtSaving(totalValidated)}</div>
            <div className="text-slate-500 text-xs mt-0.5">Validated & Confirmed stages</div>
          </div>
          <div className="bg-navy-900 border border-green-500/25 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Award size={14} className="text-green-400" />
              <span className="text-green-400 text-xs">Confirmed Saving</span>
            </div>
            <div className="text-white text-xl font-bold">{fmtSaving(totalConfirmed)}</div>
            <div className="text-slate-500 text-xs mt-0.5">In production</div>
          </div>
        </div>

        {/* Stage pipeline bar */}
        <div className="flex gap-1 mb-6 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => setFilterStage('All')}
            className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors ${
              filterStage === 'All'
                ? 'bg-white/10 text-white border-white/20'
                : 'text-slate-400 border-white/10 hover:border-white/20 hover:text-white'
            }`}
          >
            All stages
            <span className="text-slate-500">{actions.length}</span>
          </button>
          {funnelStats.map(s => (
            <button
              key={s.key}
              onClick={() => setFilterStage(s.key)}
              className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors ${
                filterStage === s.key
                  ? `${s.bg} ${s.color} ${s.border}`
                  : 'text-slate-400 border-white/10 hover:border-white/20'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${filterStage === s.key ? s.dot : 'bg-slate-600'}`} />
              {s.label}
              <span className={filterStage === s.key ? 'opacity-70' : 'text-slate-600'}>{s.count}</span>
            </button>
          ))}
        </div>

        {/* Actions list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-gold-500/30 border-t-gold-400 animate-spin" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <Target size={28} className="text-emerald-400/50" />
            </div>
            <h3 className="text-white font-semibold mb-2">No VAVE actions yet</h3>
            <p className="text-slate-500 text-sm max-w-sm mx-auto">
              {filterStage !== 'All'
                ? `No actions in "${filterStage}" stage. Move ideas here from the pipeline.`
                : 'Approve ideas in any analysis to add them here. Click "Track in VAVE" when marking an idea as Approved.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayed.map(action => {
              const stage = STAGES.find(s => s.key === action.stage) ?? STAGES[0];
              const StageIcon = stage.icon;
              const isSelected = selected?.id === action.id;
              return (
                <motion.div
                  key={action.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`bg-navy-900 border rounded-2xl p-4 cursor-pointer transition-all ${
                    isSelected ? 'border-gold-500/40 shadow-lg shadow-gold-500/5' : 'border-white/10 hover:border-white/20'
                  }`}
                  onClick={() => setSelected(isSelected ? null : action)}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${stage.bg} border ${stage.border}`}>
                      <StageIcon size={16} className={stage.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <h3 className="text-white font-medium text-sm leading-snug mb-1 truncate">{action.ideaTitle}</h3>
                          <div className="flex items-center gap-2 flex-wrap">
                            {action.systemName && (
                              <span className="text-gold-500 text-xs">{action.systemName}</span>
                            )}
                            {action.owner && (
                              <span className="text-slate-500 text-xs">· {action.owner}</span>
                            )}
                            {action.targetDate && (
                              <span className="text-slate-500 text-xs flex items-center gap-1">
                                <Clock size={9} />
                                {new Date(action.targetDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {action.confirmedSaving ? (
                            <div className="text-right">
                              <div className="text-green-400 font-semibold text-sm">{action.confirmedSaving}</div>
                              <div className="text-slate-600 text-xs">confirmed</div>
                            </div>
                          ) : action.targetSaving ? (
                            <div className="text-right">
                              <div className="text-slate-300 font-semibold text-sm">{action.targetSaving}</div>
                              <div className="text-slate-600 text-xs">target</div>
                            </div>
                          ) : null}
                          <StageTag stage={action.stage} />
                          <button
                            onClick={e => { e.stopPropagation(); setSelected(isSelected ? null : action); }}
                            className="p-1.5 rounded-lg hover:bg-white/8 transition-colors"
                          >
                            <Edit3 size={13} className="text-slate-500" />
                          </button>
                        </div>
                      </div>
                      {action.notes && (
                        <p className="text-slate-500 text-xs mt-1.5 leading-relaxed line-clamp-1">{action.notes}</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit panel */}
      <AnimatePresence>
        {selected && (
          <>
            <div
              className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm"
              onClick={() => setSelected(null)}
            />
            <EditPanel
              action={selected}
              onSave={updates => handleSave(selected.id, updates)}
              onDelete={() => handleDelete(selected.id)}
              onClose={() => setSelected(null)}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
