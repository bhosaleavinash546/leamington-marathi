import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, Check, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// ─── Constants & Types ────────────────────────────────────────────────────────

export const SUV_MODELS = ['SUV1', 'SUV2', 'SUV3', 'SUV4', 'SUV5'] as const;
export type SuvModel = typeof SUV_MODELS[number];

export interface VehicleEntry {
  model: SuvModel;
  volume: number;
  applicablePct: number;
}

export interface BusinessCase {
  id: string;
  userId: string;
  userName: string;
  ideaTitle: string;
  ideaSource: string;
  commodityName: string;
  systemName: string;
  vehicleData: VehicleEntry[];
  savingPerPart: number;
  totalAnnualSaving: number;
  toolingCost: number;
  tvCost: number;
  roi: number;
  irr: number;
  paybackMonths: number;
  implementationYear: number;
  implementationMonths: number;
  gate: 'G0' | 'G1' | 'G2' | 'G3';
  ideaNumber: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface BusinessCaseModalProps {
  ideaTitle: string;
  ideaSource?: string;
  commodityName?: string;
  systemName?: string;
  editMode?: boolean;
  initialData?: Partial<BusinessCase>;
  onClose: () => void;
  onSaved: (bc: BusinessCase) => void;
}

// ─── IRR (Newton-Raphson) ─────────────────────────────────────────────────────

function calcIRR(investment: number, annualSaving: number, years = 5): number {
  if (annualSaving <= 0 || investment <= 0) return 0;
  const cf = [-investment, ...Array(years).fill(annualSaving)];
  let r = 0.1;
  for (let i = 0; i < 200; i++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cf.length; t++) {
      const d = Math.pow(1 + r, t);
      npv += cf[t] / d;
      if (t > 0) dnpv -= (t * cf[t]) / (d * (1 + r));
    }
    if (Math.abs(npv) < 0.01) break;
    if (Math.abs(dnpv) < 0.0001) break;
    r = r - npv / dnpv;
    if (r < -0.999) r = -0.999;
    if (r > 100) r = 100;
  }
  return Math.round(r * 10000) / 100;
}

// ─── Gate Descriptions ────────────────────────────────────────────────────────

const GATE_INFO: Record<
  'G0' | 'G1' | 'G2' | 'G3',
  { label: string; desc: string; color: string; bg: string; border: string }
> = {
  G0: {
    label: 'G0',
    desc: 'Idea Generated — cost saving identified',
    color: 'text-slate-300',
    bg: 'bg-slate-500/15',
    border: 'border-slate-500/30',
  },
  G1: {
    label: 'G1',
    desc: 'Business case prepared and presented to CFT',
    color: 'text-amber-300',
    bg: 'bg-amber-500/15',
    border: 'border-amber-500/30',
  },
  G2: {
    label: 'G2',
    desc: 'Development WIP with engineering/implementation team',
    color: 'text-blue-300',
    bg: 'bg-blue-500/15',
    border: 'border-blue-500/30',
  },
  G3: {
    label: 'G3',
    desc: 'Implemented, final savings agreed with finance',
    color: 'text-green-300',
    bg: 'bg-green-500/15',
    border: 'border-green-500/30',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtGbp(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `£${n.toLocaleString('en-GB')}`;
  return `£${n.toFixed(0)}`;
}

const CURRENT_YEAR = new Date().getFullYear();

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-3 border ${
        highlight
          ? 'bg-gold-500/10 border-gold-500/25'
          : 'bg-navy-800 border-white/10'
      }`}
    >
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div
        className={`text-lg font-bold ${highlight ? 'text-gold-400' : 'text-white'}`}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BusinessCaseModal({
  ideaTitle,
  ideaSource = '',
  commodityName = '',
  systemName = '',
  editMode = false,
  initialData,
  onClose,
  onSaved,
}: BusinessCaseModalProps) {
  const { user, token } = useAuth();

  // ── Step state ──
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);

  // ── Step 1: Vehicle data ──
  const [selectedModels, setSelectedModels] = useState<Set<SuvModel>>(
    () =>
      new Set(
        initialData?.vehicleData?.map((v) => v.model) ?? ([] as SuvModel[])
      )
  );
  const [volumeMap, setVolumeMap] = useState<Record<string, number>>(
    () =>
      Object.fromEntries(
        (initialData?.vehicleData ?? []).map((v) => [v.model, v.volume])
      )
  );
  const [pctMap, setPctMap] = useState<Record<string, number>>(
    () =>
      Object.fromEntries(
        (initialData?.vehicleData ?? []).map((v) => [v.model, v.applicablePct])
      )
  );

  // ── Step 2: Cost data ──
  const [savingPerPart, setSavingPerPart] = useState<number>(
    initialData?.savingPerPart ?? 0
  );
  const [toolingCost, setToolingCost] = useState<number>(
    initialData?.toolingCost ?? 0
  );
  const [tvCost, setTvCost] = useState<number>(initialData?.tvCost ?? 0);
  const [implYear, setImplYear] = useState<number>(
    initialData?.implementationYear ?? CURRENT_YEAR + 1
  );
  const [implMonths, setImplMonths] = useState<number>(
    initialData?.implementationMonths ?? 12
  );

  // ── Step 3: Review ──
  const [gate, setGate] = useState<'G0' | 'G1' | 'G2' | 'G3'>(
    initialData?.gate ?? 'G0'
  );
  const [notes, setNotes] = useState<string>(initialData?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Derived metrics ──
  const vehicleData: VehicleEntry[] = useMemo(
    () =>
      SUV_MODELS.filter((m) => selectedModels.has(m)).map((m) => ({
        model: m,
        volume: volumeMap[m] ?? 0,
        applicablePct: pctMap[m] ?? 100,
      })),
    [selectedModels, volumeMap, pctMap]
  );

  const totalAnnualSaving = useMemo(
    () =>
      savingPerPart *
      vehicleData.reduce(
        (acc, v) => acc + v.volume * (v.applicablePct / 100),
        0
      ),
    [savingPerPart, vehicleData]
  );

  const investment = toolingCost + tvCost;

  const roi = useMemo(
    () =>
      investment === 0
        ? Infinity
        : (totalAnnualSaving / investment) * 100,
    [totalAnnualSaving, investment]
  );

  const paybackMonths = useMemo(
    () =>
      totalAnnualSaving === 0 ? Infinity : investment / (totalAnnualSaving / 12),
    [investment, totalAnnualSaving]
  );

  const irr = useMemo(
    () => calcIRR(investment, totalAnnualSaving),
    [investment, totalAnnualSaving]
  );

  // ── Navigation helpers ──
  function goNext() {
    if (step === 1) {
      if (selectedModels.size === 0) return;
      const allHaveVolume = Array.from(selectedModels).every(
        (m) => (volumeMap[m] ?? 0) > 0
      );
      if (!allHaveVolume) return;
    }
    setDirection(1);
    setStep((s) => s + 1);
  }

  function goBack() {
    setDirection(-1);
    setStep((s) => s - 1);
  }

  // ── Step 1 helpers ──
  function toggleModel(model: SuvModel) {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) {
        next.delete(model);
      } else {
        next.add(model);
        // Set defaults if not yet set
        if (!volumeMap[model]) {
          setVolumeMap((m) => ({ ...m, [model]: 0 }));
        }
        if (!pctMap[model]) {
          setPctMap((m) => ({ ...m, [model]: 100 }));
        }
      }
      return next;
    });
  }

  // ── Submit ──
  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);

    const payload = {
      ideaTitle,
      ideaSource,
      commodityName,
      systemName,
      vehicleData,
      savingPerPart,
      totalAnnualSaving,
      toolingCost,
      tvCost,
      roi: isFinite(roi) ? roi : 999999,
      irr,
      paybackMonths: isFinite(paybackMonths) ? paybackMonths : 0,
      implementationYear: implYear,
      implementationMonths: implMonths,
      gate,
      notes,
    };

    try {
      const method = editMode && initialData?.id ? 'PATCH' : 'POST';
      const url =
        editMode && initialData?.id
          ? `/api/business-cases/${initialData.id}`
          : '/api/business-cases';

      const r = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(err.message ?? `HTTP ${r.status}`);
      }

      const bc: BusinessCase = await r.json();
      onSaved(bc);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save business case');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Animation variants ──
  const variants = {
    enter: (d: number) => ({ x: d > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -40 : 40, opacity: 0 }),
  };

  // ── Preview text for step 1 ──
  const previewText = vehicleData
    .filter((v) => v.volume > 0)
    .map(
      (v) =>
        `${v.model} (${v.volume.toLocaleString('en-GB')} units, ${v.applicablePct}%)`
    )
    .join(' + ');

  const step1Valid =
    selectedModels.size > 0 &&
    Array.from(selectedModels).every((m) => (volumeMap[m] ?? 0) > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-navy-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col"
        style={{ scrollbarWidth: 'none' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 sticky top-0 bg-navy-900 z-10">
          <div>
            <h2 className="text-white font-semibold text-base">
              {editMode ? 'Edit Business Case' : 'Business Case Setup'}
            </h2>
            <p className="text-slate-500 text-xs mt-0.5 truncate max-w-xs">
              {ideaTitle}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-slate-500 text-xs">Step {step} of 3</span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/8 transition-colors"
            >
              <X size={16} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-6 pt-4">
          <div className="flex gap-1.5">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                  s <= step ? 'bg-gold-500' : 'bg-white/10'
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1">
            {['Vehicles', 'Cost Data', 'Review'].map((label, i) => (
              <span
                key={label}
                className={`text-xs ${i + 1 <= step ? 'text-gold-400' : 'text-slate-600'}`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 px-6 py-5 overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            {step === 1 && (
              <motion.div
                key="step1"
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2, ease: 'easeInOut' }}
              >
                <h3 className="text-white font-semibold mb-1">
                  Which vehicles does this apply to?
                </h3>
                <p className="text-slate-500 text-sm mb-4">
                  Select all applicable models and enter volumes.
                </p>

                {/* Vehicle toggle grid */}
                <div className="grid grid-cols-5 gap-2 mb-4">
                  {SUV_MODELS.map((model) => {
                    const active = selectedModels.has(model);
                    return (
                      <button
                        key={model}
                        onClick={() => toggleModel(model)}
                        className={`relative flex flex-col items-center justify-center p-3 rounded-xl border text-sm font-medium transition-all ${
                          active
                            ? 'bg-gold-500/15 border-gold-500/40 text-gold-400'
                            : 'bg-navy-800 border-white/10 text-slate-400 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        {active && (
                          <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-gold-500 flex items-center justify-center">
                            <Check size={9} className="text-navy-950" />
                          </div>
                        )}
                        <span className="text-xs text-slate-500 mb-0.5">Model</span>
                        <span>{model}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Per-vehicle volume inputs */}
                {selectedModels.size > 0 && (
                  <div className="space-y-3">
                    {SUV_MODELS.filter((m) => selectedModels.has(m)).map((model) => (
                      <div
                        key={model}
                        className="bg-navy-800 border border-white/10 rounded-xl p-3"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-gold-400 font-semibold text-sm">
                            {model}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">
                              Annual volume (units)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={volumeMap[model] ?? 0}
                              onChange={(e) =>
                                setVolumeMap((m) => ({
                                  ...m,
                                  [model]: Math.max(0, Number(e.target.value)),
                                }))
                              }
                              className="w-full bg-navy-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/30"
                              placeholder="e.g. 50000"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">
                              % Applicable
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={pctMap[model] ?? 100}
                              onChange={(e) =>
                                setPctMap((m) => ({
                                  ...m,
                                  [model]: Math.min(
                                    100,
                                    Math.max(1, Number(e.target.value))
                                  ),
                                }))
                              }
                              className="w-full bg-navy-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/30"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Preview line */}
                {previewText && (
                  <p className="text-slate-400 text-xs mt-3 leading-relaxed">
                    <span className="text-slate-500">Selected: </span>
                    {previewText}
                  </p>
                )}

                {selectedModels.size === 0 && (
                  <p className="text-amber-400/70 text-xs mt-2">
                    Select at least one vehicle to continue.
                  </p>
                )}
                {selectedModels.size > 0 && !step1Valid && (
                  <p className="text-amber-400/70 text-xs mt-2">
                    Enter a volume greater than 0 for each selected vehicle.
                  </p>
                )}
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2, ease: 'easeInOut' }}
              >
                <h3 className="text-white font-semibold mb-1">Cost Data</h3>
                <p className="text-slate-500 text-sm mb-4">
                  Enter the financial inputs for the business case.
                </p>

                <div className="space-y-4">
                  {/* Saving per part */}
                  <div>
                    <label className="text-xs text-slate-500 mb-1.5 block">
                      Saving per part
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                        £
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={savingPerPart}
                        onChange={(e) =>
                          setSavingPerPart(Math.max(0, Number(e.target.value)))
                        }
                        className="w-full bg-navy-800 border border-white/10 rounded-xl pl-8 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500/30"
                        placeholder="e.g. 4.50"
                      />
                    </div>
                  </div>

                  {/* Tooling cost */}
                  <div>
                    <label className="text-xs text-slate-500 mb-1.5 block">
                      Tooling cost
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                        £
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={toolingCost}
                        onChange={(e) =>
                          setToolingCost(Math.max(0, Number(e.target.value)))
                        }
                        className="w-full bg-navy-800 border border-white/10 rounded-xl pl-8 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500/30"
                        placeholder="e.g. 120000"
                      />
                    </div>
                  </div>

                  {/* T&V cost */}
                  <div>
                    <label className="text-xs text-slate-500 mb-1.5 block">
                      Test &amp; Validation cost
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                        £
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={tvCost}
                        onChange={(e) =>
                          setTvCost(Math.max(0, Number(e.target.value)))
                        }
                        className="w-full bg-navy-800 border border-white/10 rounded-xl pl-8 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500/30"
                        placeholder="e.g. 30000"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Implementation year */}
                    <div>
                      <label className="text-xs text-slate-500 mb-1.5 block">
                        Implementation year
                      </label>
                      <select
                        value={implYear}
                        onChange={(e) => setImplYear(Number(e.target.value))}
                        className="w-full bg-navy-800 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500/30"
                      >
                        {[2025, 2026, 2027, 2028, 2029, 2030].map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Implementation duration */}
                    <div>
                      <label className="text-xs text-slate-500 mb-1.5 block">
                        Duration (months)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={implMonths}
                        onChange={(e) =>
                          setImplMonths(
                            Math.min(60, Math.max(1, Number(e.target.value)))
                          )
                        }
                        className="w-full bg-navy-800 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500/30"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2, ease: 'easeInOut' }}
              >
                <h3 className="text-white font-semibold mb-1">
                  Review &amp; Submit
                </h3>
                <p className="text-slate-500 text-sm mb-4">
                  Confirm the metrics and select the gate before saving.
                </p>

                {/* Metrics grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <MetricCard
                    label="Total Annual Saving"
                    value={fmtGbp(totalAnnualSaving)}
                    highlight
                  />
                  <MetricCard
                    label="ROI"
                    value={
                      isFinite(roi) ? `${roi.toFixed(1)}%` : '∞'
                    }
                  />
                  <MetricCard
                    label="Payback"
                    value={
                      isFinite(paybackMonths)
                        ? `${paybackMonths.toFixed(1)} months`
                        : '—'
                    }
                  />
                  <MetricCard
                    label="IRR (5yr)"
                    value={investment > 0 ? `${irr.toFixed(1)}%` : '—'}
                  />
                  <MetricCard
                    label="Implementation"
                    value={`${implMonths}mo · ${implYear}`}
                  />
                  <MetricCard
                    label="Investment (Tooling + T&V)"
                    value={fmtGbp(investment)}
                  />
                </div>

                {/* Idea ID notice */}
                <div className="bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 mb-4 text-xs text-slate-500">
                  <span className="text-slate-400 font-medium">Idea ID: </span>
                  BS-{implYear}-NNNN — assigned on save
                </div>

                {/* Notes */}
                <div className="mb-4">
                  <label className="text-xs text-slate-500 mb-1.5 block">
                    Notes (optional)
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any additional context, assumptions or engineering notes..."
                    className="w-full bg-navy-800 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/30 resize-none"
                  />
                </div>

                {/* Gate selection */}
                <div className="mb-2">
                  <label className="text-xs text-slate-500 mb-2 block">
                    Gate
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['G0', 'G1', 'G2', 'G3'] as const).map((g) => {
                      const info = GATE_INFO[g];
                      const active = gate === g;
                      return (
                        <button
                          key={g}
                          onClick={() => setGate(g)}
                          className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                            active
                              ? `${info.bg} ${info.border} ${info.color}`
                              : 'bg-navy-800 border-white/10 text-slate-500 hover:border-white/20'
                          }`}
                        >
                          <div className="font-semibold text-sm mb-0.5">
                            {g}
                          </div>
                          <div className="text-xs opacity-80 leading-snug">
                            {info.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Error */}
                {submitError && (
                  <div className="mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                    {submitError}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between sticky bottom-0 bg-navy-900">
          <div>
            {step > 1 && (
              <button
                onClick={goBack}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:border-white/20 text-sm transition-colors"
              >
                <ChevronLeft size={15} />
                Back
              </button>
            )}
          </div>

          <div>
            {step < 3 ? (
              <button
                onClick={goNext}
                disabled={step === 1 && !step1Valid}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed text-navy-950 font-semibold text-sm transition-all"
              >
                Continue
                <ChevronRight size={15} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-950 font-semibold text-sm transition-all"
              >
                {submitting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Check size={15} />
                    Save Business Case
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
