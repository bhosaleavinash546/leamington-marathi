import { useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { motion } from 'framer-motion';
import {
  Calculator, TrendingDown, TrendingUp, DollarSign, Clock, Target,
  Percent, Package, Factory, TestTube, Wrench, ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

function fmt(n: number, decimals = 0): string {
  if (!isFinite(n) || isNaN(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `€${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `€${(n / 1_000).toFixed(decimals === 0 ? 0 : 1)}K`;
  return `€${n.toFixed(decimals)}`;
}

function fmtMonths(m: number): string {
  if (!isFinite(m) || isNaN(m) || m <= 0) return '—';
  if (m < 1) return '< 1 month';
  if (m >= 12) return `${(m / 12).toFixed(1)} yrs`;
  return `${Math.round(m)} months`;
}

interface SliderInputProps {
  label: string;
  icon: React.ElementType;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: string;
  isPercent?: boolean;
}

function SliderInput({ label, icon: Icon, value, onChange, min, max, step = 1, unit = '€', hint, isPercent }: SliderInputProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
          <Icon size={12} className="text-gold-400" /> {label}
        </label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={value}
            onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
            className="w-24 bg-navy-800 border border-white/10 rounded-lg px-2 py-1 text-white text-xs text-right font-mono focus:outline-none focus:border-gold-500/40"
          />
          <span className="text-slate-500 text-xs">{unit}</span>
        </div>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: '#f59e0b' }}
      />
      {hint && <p className="text-slate-600 text-xs">{hint}</p>}
    </div>
  );
}

function NumberInput({ label, icon: Icon, value, onChange, unit = '€', hint }: {
  label: string; icon: React.ElementType; value: number; onChange: (v: number) => void; unit?: string; hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
        <Icon size={12} className="text-gold-400" /> {label}
      </label>
      <div className="flex items-center gap-2">
        <span className="text-slate-500 text-xs w-4">{unit}</span>
        <input
          type="number"
          value={value}
          onChange={e => onChange(Math.max(0, Number(e.target.value)))}
          className="flex-1 bg-navy-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-gold-500/40 hover:border-white/20 transition-colors"
        />
      </div>
      {hint && <p className="text-slate-600 text-xs">{hint}</p>}
    </div>
  );
}

interface KPICardProps { label: string; value: string; sub?: string; color?: string; icon: React.ElementType; positive?: boolean | null; }
function KPICard({ label, value, sub, color = 'text-white', icon: Icon, positive }: KPICardProps) {
  return (
    <div className="bg-navy-800 border border-white/10 rounded-xl p-4 hover:border-gold-500/20 transition-all">
      <div className="flex items-start justify-between mb-1">
        <Icon size={14} className="text-gold-400 mt-0.5" />
        {positive !== null && positive !== undefined && (
          positive ? <TrendingUp size={12} className="text-green-400" /> : <TrendingDown size={12} className="text-red-400" />
        )}
      </div>
      <p className={`text-xl font-black ${color} leading-tight`}>{value}</p>
      <p className="text-slate-500 text-xs mt-0.5">{label}</p>
      {sub && <p className="text-slate-600 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

function CustomTooltip({ active, payload, label, isDark }: any) {
  if (!active || !payload?.length) return null;
  const bg = isDark ? 'bg-navy-800 border-white/15' : 'bg-white border-slate-200';
  const txt = isDark ? 'text-white' : 'text-slate-900';
  const neg = payload[0]?.value < 0;
  return (
    <div className={`${bg} ${txt} border rounded-xl px-3 py-2 shadow-xl text-xs`}>
      <p className="text-slate-400 mb-1">Year {label}</p>
      <p className={`font-bold ${neg ? 'text-red-400' : 'text-green-400'}`}>
        Cumulative: {fmt(payload[0]?.value ?? 0)}
      </p>
    </div>
  );
}

export default function BusinessCaseCalculator() {
  const { isDark } = useTheme();
  const [open, setOpen] = useState(false);

  // Cost parameters
  const [savingPerPart, setSavingPerPart] = useState(15);
  const [partsPerVehicle, setPartsPerVehicle] = useState(1);
  const [annualVolume, setAnnualVolume] = useState(50000);
  const [applicability, setApplicability] = useState(80);

  // Investment parameters
  const [nreInvestment, setNreInvestment] = useState(200000);
  const [toolingCost, setToolingCost] = useState(150000);
  const [tvCost, setTvCost] = useState(80000);
  const [prototypeCost, setPrototypeCost] = useState(50000);

  // Financial parameters
  const [timeline, setTimeline] = useState(12);
  const [discountRate, setDiscountRate] = useState(8);

  // Calculations
  const calc = useMemo(() => {
    const savingPerVehicle = savingPerPart * partsPerVehicle;
    const applicableVolume = annualVolume * (applicability / 100);
    const grossAnnualSaving = savingPerVehicle * applicableVolume;
    const totalInvestment = nreInvestment + toolingCost + tvCost + prototypeCost;
    const paybackMonths = totalInvestment > 0 && grossAnnualSaving > 0
      ? (totalInvestment / grossAnnualSaving) * 12 : Infinity;

    // NPV
    const r = discountRate / 100;
    const npv3 = grossAnnualSaving > 0
      ? [1, 2, 3].reduce((acc, y) => acc + grossAnnualSaving / Math.pow(1 + r, y), -totalInvestment)
      : -totalInvestment;
    const npv5 = grossAnnualSaving > 0
      ? [1, 2, 3, 4, 5].reduce((acc, y) => acc + grossAnnualSaving / Math.pow(1 + r, y), -totalInvestment)
      : -totalInvestment;

    const net3yr = grossAnnualSaving * 3 - totalInvestment;
    const net5yr = grossAnnualSaving * 5 - totalInvestment;
    const roi5yr = totalInvestment > 0 ? (net5yr / totalInvestment) * 100 : 0;

    // Cash flow chart data (cumulative)
    const cashFlowData = Array.from({ length: 6 }, (_, yr) => ({
      year: yr,
      cumulative: Math.round(yr === 0 ? -totalInvestment : grossAnnualSaving * yr - totalInvestment),
    }));

    // Year-by-year table
    const yearRows = Array.from({ length: 5 }, (_, i) => {
      const yr = i + 1;
      const annual = grossAnnualSaving;
      const cumulative = annual * yr - totalInvestment;
      return { yr, annual, cumulative };
    });

    return {
      savingPerVehicle, applicableVolume, grossAnnualSaving, totalInvestment,
      paybackMonths, npv3, npv5, net3yr, net5yr, roi5yr, cashFlowData, yearRows,
    };
  }, [savingPerPart, partsPerVehicle, annualVolume, applicability, nreInvestment, toolingCost, tvCost, prototypeCost, discountRate]);

  const axisColor = isDark ? '#475569' : '#94a3b8';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';

  return (
    <div className="mb-8">
      <div
        className="bg-navy-900 border border-white/10 rounded-2xl overflow-hidden hover:border-gold-500/20 transition-all"
      >
        {/* Header toggle */}
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between p-6 hover:bg-white/3 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gold-500/15 border border-gold-500/20 flex items-center justify-center">
              <Calculator size={20} className="text-gold-400" />
            </div>
            <div className="text-left">
              <h2 className="text-white font-bold text-lg">Business Case Calculator</h2>
              <p className="text-slate-400 text-sm">Build your investment justification with live financial modelling</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!open && calc.grossAnnualSaving > 0 && (
              <div className="hidden sm:flex items-center gap-4 text-xs">
                <span className="text-slate-400">Annual saving: <span className="text-green-400 font-bold">{fmt(calc.grossAnnualSaving)}</span></span>
                <span className="text-slate-400">Payback: <span className="text-gold-400 font-bold">{fmtMonths(calc.paybackMonths)}</span></span>
              </div>
            )}
            {open ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
          </div>
        </button>

        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="border-t border-white/10"
          >
            <div className="grid lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-white/10">

              {/* LEFT: Inputs */}
              <div className="p-6 space-y-6">
                {/* Cost parameters */}
                <div>
                  <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
                    <DollarSign size={12} className="text-gold-400" /> Cost Parameters
                  </h3>
                  <div className="space-y-5">
                    <SliderInput
                      label="Cost saving per part" icon={DollarSign}
                      value={savingPerPart} onChange={setSavingPerPart}
                      min={0.5} max={500} step={0.5}
                      hint="Estimated unit cost reduction from this idea"
                    />
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                        <Package size={12} className="text-gold-400" /> Parts per vehicle
                      </label>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setPartsPerVehicle(Math.max(1, partsPerVehicle - 1))} className="w-8 h-8 rounded-lg bg-navy-800 border border-white/10 text-white hover:border-gold-500/30 transition-colors font-bold">−</button>
                        <span className="text-white font-bold text-lg w-8 text-center">{partsPerVehicle}</span>
                        <button onClick={() => setPartsPerVehicle(partsPerVehicle + 1)} className="w-8 h-8 rounded-lg bg-navy-800 border border-white/10 text-white hover:border-gold-500/30 transition-colors font-bold">+</button>
                        <span className="text-slate-500 text-xs ml-1">qty on vehicle</span>
                      </div>
                    </div>
                    <SliderInput
                      label="Annual production volume" icon={Factory}
                      value={annualVolume} onChange={setAnnualVolume}
                      min={1000} max={500000} step={1000} unit="units"
                      hint="Total annual vehicle build volume"
                    />
                    <SliderInput
                      label="Vehicle applicability" icon={Percent}
                      value={applicability} onChange={setApplicability}
                      min={1} max={100} step={1} unit="%"
                      hint="% of build volume where this idea applies (e.g. 80% if not all variants)"
                    />
                  </div>
                </div>

                {/* Investment */}
                <div>
                  <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Wrench size={12} className="text-gold-400" /> Investment Required
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <NumberInput label="NRE / Engineering" icon={Target} value={nreInvestment} onChange={setNreInvestment} hint="Design, validation, suppliers" />
                    <NumberInput label="Tooling cost" icon={Wrench} value={toolingCost} onChange={setToolingCost} hint="Press tools, moulds, jigs" />
                    <NumberInput label="Test & Validation" icon={TestTube} value={tvCost} onChange={setTvCost} hint="DVT, regulatory, NCAP" />
                    <NumberInput label="Prototype / DV" icon={Package} value={prototypeCost} onChange={setPrototypeCost} hint="Build & test samples" />
                  </div>
                </div>

                {/* Financial */}
                <div>
                  <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
                    <TrendingUp size={12} className="text-gold-400" /> Financial Parameters
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                        <Clock size={12} className="text-gold-400" /> Timeline to SOP
                      </label>
                      <div className="flex items-center gap-2">
                        <input type="number" value={timeline} onChange={e => setTimeline(Math.max(1, Number(e.target.value)))}
                          className="flex-1 bg-navy-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-gold-500/40" />
                        <span className="text-slate-500 text-xs">months</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                        <Percent size={12} className="text-gold-400" /> Discount rate
                      </label>
                      <div className="flex items-center gap-2">
                        <input type="number" value={discountRate} min={1} max={30} onChange={e => setDiscountRate(Math.max(1, Number(e.target.value)))}
                          className="flex-1 bg-navy-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-gold-500/40" />
                        <span className="text-slate-500 text-xs">% pa</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Disclaimer */}
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/8 border border-amber-500/15">
                  <Info size={13} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-amber-300/70 text-xs">Estimates only. Validate with supplier RFQs and detailed engineering studies before business case submission.</p>
                </div>
              </div>

              {/* RIGHT: Results */}
              <div className="p-6 space-y-6">
                {/* KPI grid */}
                <div>
                  <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-4">Financial Outputs</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <KPICard
                      label="Annual Gross Saving"
                      value={fmt(calc.grossAnnualSaving)}
                      sub={`${calc.applicableVolume.toLocaleString()} applicable units`}
                      color="text-green-400"
                      icon={TrendingDown}
                      positive
                    />
                    <KPICard
                      label="Total Investment"
                      value={fmt(calc.totalInvestment)}
                      sub="NRE + tooling + T&V + proto"
                      color="text-red-400"
                      icon={DollarSign}
                      positive={false}
                    />
                    <KPICard
                      label="Payback Period"
                      value={fmtMonths(calc.paybackMonths)}
                      color={calc.paybackMonths < 24 ? 'text-green-400' : calc.paybackMonths < 48 ? 'text-gold-400' : 'text-red-400'}
                      icon={Clock}
                      positive={calc.paybackMonths < 36}
                    />
                    <KPICard
                      label="5-Year ROI"
                      value={isFinite(calc.roi5yr) ? `${calc.roi5yr.toFixed(0)}%` : '—'}
                      color={calc.roi5yr >= 200 ? 'text-green-400' : calc.roi5yr > 0 ? 'text-gold-400' : 'text-red-400'}
                      icon={Percent}
                      positive={calc.roi5yr > 0}
                    />
                    <KPICard
                      label="3-Year Net Saving"
                      value={fmt(calc.net3yr)}
                      sub="after total investment"
                      color={calc.net3yr >= 0 ? 'text-green-400' : 'text-red-400'}
                      icon={Target}
                      positive={calc.net3yr >= 0}
                    />
                    <KPICard
                      label="NPV at 3 Years"
                      value={fmt(calc.npv3)}
                      sub={`at ${discountRate}% discount rate`}
                      color={calc.npv3 >= 0 ? 'text-emerald-400' : 'text-red-400'}
                      icon={TrendingUp}
                      positive={calc.npv3 >= 0}
                    />
                  </div>
                </div>

                {/* Saving per vehicle */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/8 flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs">Cost saving per vehicle</p>
                    <p className="text-white font-bold text-lg">{fmt(calc.savingPerVehicle)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-400 text-xs">Saving per part × {partsPerVehicle} qty</p>
                    <p className="text-gold-400 text-sm font-medium">{fmt(savingPerPart)} × {partsPerVehicle}</p>
                  </div>
                </div>

                {/* Cumulative Cash Flow Chart */}
                <div>
                  <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-3">Cumulative Cash Flow (5-Year)</h3>
                  <ResponsiveContainer width="100%" height={170}>
                    <AreaChart data={calc.cashFlowData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                      <defs>
                        <linearGradient id="cfPositive" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#4ade80" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="cfNegative" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f87171" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f87171" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                      <XAxis dataKey="year" tickFormatter={v => `Yr ${v}`} tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={v => fmt(v)} tick={{ fill: axisColor, fontSize: 9 }} axisLine={false} tickLine={false} width={55} />
                      <ReferenceLine y={0} stroke={isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'} strokeDasharray="4 4" />
                      <Tooltip content={<CustomTooltip isDark={isDark} />} />
                      <Area
                        type="monotone" dataKey="cumulative"
                        stroke={calc.net5yr >= 0 ? '#4ade80' : '#f87171'}
                        strokeWidth={2}
                        fill={calc.net5yr >= 0 ? 'url(#cfPositive)' : 'url(#cfNegative)'}
                        dot={{ fill: calc.net5yr >= 0 ? '#4ade80' : '#f87171', r: 3 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Year-by-year table */}
                <div>
                  <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Year-by-Year Breakdown</h3>
                  <div className="rounded-xl overflow-hidden border border-white/8">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-white/5 border-b border-white/8">
                          <th className="text-left px-3 py-2 text-slate-500 font-medium">Year</th>
                          <th className="text-right px-3 py-2 text-slate-500 font-medium">Annual Saving</th>
                          <th className="text-right px-3 py-2 text-slate-500 font-medium">Cumulative (Net)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calc.yearRows.map(({ yr, annual, cumulative }) => (
                          <tr key={yr} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                            <td className="px-3 py-2 text-slate-400">Year {yr}</td>
                            <td className="px-3 py-2 text-right text-green-400 font-medium">{fmt(annual)}</td>
                            <td className={`px-3 py-2 text-right font-bold ${cumulative >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {fmt(cumulative)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
