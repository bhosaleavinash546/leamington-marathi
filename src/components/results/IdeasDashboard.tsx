import { useMemo } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import { BarChart3, PieChart as PieIcon, TrendingDown, Layers } from 'lucide-react';
import { CostReductionIdea, CostSavingType } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';

interface Props { ideas: CostReductionIdea[]; }

const TYPE_META: Record<CostSavingType, { label: string; color: string }> = {
  material:      { label: 'Material',       color: '#60a5fa' },
  process:       { label: 'Process',        color: '#a78bfa' },
  logistics:     { label: 'Logistics',      color: '#22d3ee' },
  complexity:    { label: 'Complexity',     color: '#f472b6' },
  warranty:      { label: 'Warranty',       color: '#fb923c' },
  tooling:       { label: 'Tooling',        color: '#818cf8' },
  weight:        { label: 'Weight',         color: '#2dd4bf' },
  commonisation: { label: 'Commonisation',  color: '#a3e635' },
};

const DIFF_COLORS: Record<string, string> = {
  Low: '#4ade80', Medium: '#fbbf24', High: '#f87171',
};
const LEVEL_COLORS: Record<string, string> = {
  Assembly: '#c084fc', Subassembly: '#38bdf8', Part: '#34d399',
};
const QUAL_COLORS: Record<string, string> = {
  'Very High': '#4ade80', 'High': '#86efac', 'Medium': '#fbbf24', 'Low': '#f87171',
};

function ChartCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-navy-900 border border-white/10 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={15} className="text-gold-400" />
        <h3 className="text-white font-semibold text-sm">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function CustomTooltip({ active, payload, label, isDark }: any) {
  if (!active || !payload?.length) return null;
  const bg = isDark ? 'bg-navy-800 border-white/15' : 'bg-white border-slate-200';
  const txt = isDark ? 'text-white' : 'text-slate-900';
  const sub = isDark ? 'text-slate-400' : 'text-slate-500';
  return (
    <div className={`${bg} ${txt} border rounded-xl px-3 py-2 shadow-xl text-xs`}>
      {label && <p className={`${sub} mb-1`}>{label}</p>}
      {payload.map((p: any) => (
        <p key={p.dataKey || p.name} className="font-semibold">
          <span style={{ color: p.fill || p.color }}>{p.name ?? p.dataKey}: </span>
          {p.value}
        </p>
      ))}
    </div>
  );
}

export default function IdeasDashboard({ ideas }: Props) {
  const { isDark } = useTheme();

  const typeData = useMemo(() => {
    const counts: Record<string, number> = {};
    ideas.forEach(idea => {
      idea.costSavingTypes.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
    });
    return Object.entries(counts)
      .map(([key, value]) => ({ name: TYPE_META[key as CostSavingType]?.label ?? key, value, color: TYPE_META[key as CostSavingType]?.color ?? '#94a3b8' }))
      .sort((a, b) => b.value - a.value);
  }, [ideas]);

  const diffData = useMemo(() => {
    const counts: Record<string, number> = { Low: 0, Medium: 0, High: 0 };
    ideas.forEach(i => { counts[i.implementationDifficulty]++; });
    return Object.entries(counts).map(([name, value]) => ({ name, value, color: DIFF_COLORS[name] }));
  }, [ideas]);

  const levelData = useMemo(() => {
    const counts: Record<string, number> = { Assembly: 0, Subassembly: 0, Part: 0 };
    ideas.forEach(i => { counts[i.systemLevel]++; });
    return Object.entries(counts).map(([name, value]) => ({ name, value, color: LEVEL_COLORS[name] }));
  }, [ideas]);

  const qualData = useMemo(() => {
    const counts: Record<string, number> = {};
    ideas.forEach(i => {
      const q = i.costSavingPotential.qualitative.split(' ')[0] + (i.costSavingPotential.qualitative.includes('Very') ? ' High' : '');
      const key = i.costSavingPotential.qualitative.startsWith('Very') ? 'Very High'
                : i.costSavingPotential.qualitative.startsWith('High') ? 'High'
                : i.costSavingPotential.qualitative.startsWith('Low') ? 'Low' : 'Medium';
      counts[key] = (counts[key] || 0) + 1;
    });
    return ['Very High', 'High', 'Medium', 'Low']
      .map(name => ({ name, value: counts[name] || 0, color: QUAL_COLORS[name] }))
      .filter(d => d.value > 0);
  }, [ideas]);

  if (ideas.length === 0) return null;

  const axisColor = isDark ? '#475569' : '#94a3b8';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const tooltipProps = { content: <CustomTooltip isDark={isDark} /> };

  return (
    <div className="mb-8">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-gold-500/15 flex items-center justify-center">
          <BarChart3 size={16} className="text-gold-400" />
        </div>
        <div>
          <h2 className="text-white font-bold text-lg">Ideas Analytics Dashboard</h2>
          <p className="text-slate-400 text-xs">Visual breakdown of {ideas.length} generated cost reduction ideas</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Doughnut: Type distribution */}
        <ChartCard title="Cost Saving Type Distribution" icon={PieIcon}>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={typeData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
              >
                {typeData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} opacity={0.9} />
                ))}
              </Pie>
              <Tooltip {...tooltipProps} />
            </PieChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2">
            {typeData.map(d => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                <span className="text-slate-400">{d.name}</span>
                <span className="text-white font-semibold">{d.value}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        {/* Bar: Difficulty */}
        <ChartCard title="Implementation Difficulty" icon={TrendingDown}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={diffData} barCategoryGap="30%" margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="name" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip {...tooltipProps} />
              <Bar dataKey="value" name="Ideas" radius={[6, 6, 0, 0]}>
                {diffData.map((d, i) => <Cell key={i} fill={d.color} />)}
                <LabelList dataKey="value" position="top" style={{ fill: isDark ? '#e2e8f0' : '#0f172a', fontSize: 11, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Bar: Level */}
        <ChartCard title="Analysis Level" icon={Layers}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={levelData} barCategoryGap="30%" margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="name" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip {...tooltipProps} />
              <Bar dataKey="value" name="Ideas" radius={[6, 6, 0, 0]}>
                {levelData.map((d, i) => <Cell key={i} fill={d.color} />)}
                <LabelList dataKey="value" position="top" style={{ fill: isDark ? '#e2e8f0' : '#0f172a', fontSize: 11, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

      </div>

      {/* Second row: Qualitative potential */}
      {qualData.length > 0 && (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Saving Potential Rating" icon={BarChart3}>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={qualData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                <XAxis type="number" tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                <Tooltip {...tooltipProps} />
                <Bar dataKey="value" name="Ideas" radius={[0, 6, 6, 0]}>
                  {qualData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  <LabelList dataKey="value" position="right" style={{ fill: isDark ? '#e2e8f0' : '#0f172a', fontSize: 11, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Quick summary KPIs */}
          <div className="bg-navy-900 border border-white/10 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingDown size={15} className="text-gold-400" />
              <h3 className="text-white font-semibold text-sm">Ideas Summary</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Total Ideas', value: ideas.length, color: 'text-white' },
                { label: 'Quick Wins (Low difficulty)', value: ideas.filter(i => i.implementationDifficulty === 'Low').length, color: 'text-green-400' },
                { label: 'Strategic (Medium/High)', value: ideas.filter(i => i.implementationDifficulty !== 'Low').length, color: 'text-gold-400' },
                { label: 'Web-Grounded Ideas', value: ideas.filter(i => i.searchDataUsed).length, color: 'text-blue-400' },
                { label: 'Material/Process', value: ideas.filter(i => i.costSavingTypes.some(t => t === 'material' || t === 'process')).length, color: 'text-purple-400' },
                { label: 'Tooling & Weight', value: ideas.filter(i => i.costSavingTypes.some(t => t === 'tooling' || t === 'weight')).length, color: 'text-teal-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="p-3 rounded-xl bg-white/5 border border-white/5">
                  <p className={`text-2xl font-black ${color}`}>{value}</p>
                  <p className="text-slate-500 text-xs leading-tight mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
