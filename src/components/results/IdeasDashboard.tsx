import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { CostReductionIdea, CostSavingType } from '../../types';
import { useChartTheme } from '../../lib/chart-theme';
import { ChartCard, ChartTooltip, axisProps, categoryAxisProps, gridProps, valueLabelStyle, BAR_MAX, RADIUS_H, RADIUS_V } from '../charts/ChartKit';

interface Props { ideas: CostReductionIdea[]; }

const TYPE_LABEL: Record<CostSavingType, string> = {
  material: 'Material', process: 'Process', logistics: 'Logistics', complexity: 'Complexity',
  warranty: 'Warranty', tooling: 'Tooling', weight: 'Weight', commonisation: 'Commonisation',
};

/**
 * THE RESULTS ANALYTICS — four single-series charts and the summary.
 *
 * Every chart here is ONE series (a count per category), so every bar is one
 * colour and the category is read from the axis (DECISIONS 123). The saving-
 * lever chart was a donut; an idea carries several levers, so the counts do
 * not add up to the idea total and a part-of-whole shape misstated them. It is
 * a sorted bar chart, and its subtitle says the bars overlap.
 */
export default function IdeasDashboard({ ideas }: Props) {
  const t = useChartTheme();

  const typeData = useMemo(() => {
    const counts: Record<string, number> = {};
    ideas.forEach(idea => idea.costSavingTypes.forEach(k => { counts[k] = (counts[k] || 0) + 1; }));
    return Object.entries(counts)
      .map(([k, value]) => ({ name: TYPE_LABEL[k as CostSavingType] ?? k, value }))
      .sort((a, b) => b.value - a.value);
  }, [ideas]);

  const diffData = useMemo(() => {
    const c: Record<string, number> = { Low: 0, Medium: 0, High: 0 };
    ideas.forEach(i => { if (i.implementationDifficulty in c) c[i.implementationDifficulty]++; });
    return Object.entries(c).map(([name, value]) => ({ name, value }));
  }, [ideas]);

  const levelData = useMemo(() => {
    const c: Record<string, number> = { Part: 0, Subassembly: 0, Assembly: 0 };
    ideas.forEach(i => { if (i.systemLevel in c) c[i.systemLevel]++; });
    return Object.entries(c).map(([name, value]) => ({ name, value }));
  }, [ideas]);

  const qualData = useMemo(() => {
    const c: Record<string, number> = { 'Very High': 0, High: 0, Medium: 0, Low: 0 };
    ideas.forEach(i => {
      const q = i.costSavingPotential.qualitative || '';
      const key = q.startsWith('Very') ? 'Very High' : q.startsWith('High') ? 'High' : q.startsWith('Low') ? 'Low' : 'Medium';
      c[key]++;
    });
    return Object.entries(c).map(([name, value]) => ({ name, value }));
  }, [ideas]);

  if (ideas.length === 0) return null;

  const tooltip = <Tooltip cursor={{ fill: t.cursor }} content={<ChartTooltip t={t} unit=" ideas" />} />;
  const quickWins = ideas.filter(i => i.implementationDifficulty === 'Low').length;
  const summary = [
    { label: 'Ideas', value: ideas.length },
    { label: 'Quick wins (low difficulty)', value: quickWins },
    { label: 'Strategic (medium / high)', value: ideas.length - quickWins },
    { label: 'Web-grounded', value: ideas.filter(i => i.searchDataUsed).length },
    { label: 'Engine-confirmed', value: ideas.filter(i => i.engineCheck?.direction === 'confirmed').length },
    { label: 'Not engine-checked', value: ideas.filter(i => !i.engineCheck).length },
  ];

  const Columns = ({ data }: { data: Array<{ name: string; value: number }> }) => (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={data} margin={{ top: 20, right: 4, left: -24, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid {...gridProps(t)} />
        <XAxis dataKey="name" {...categoryAxisProps(t)} />
        <YAxis {...axisProps(t)} allowDecimals={false} />
        {tooltip}
        <Bar dataKey="value" name="Ideas" fill={t.accent} radius={RADIUS_V} maxBarSize={BAR_MAX} isAnimationActive={false}>
          <LabelList dataKey="value" position="top" style={valueLabelStyle(t)} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-tint-strong flex items-center justify-center">
          <BarChart3 size={16} className="text-slate-300" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-white font-semibold text-lg">Ideas at a glance</h2>
          <p className="text-slate-400 text-xs">{ideas.length} ideas in this analysis</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ChartCard title="Ideas by saving lever" subtitle="An idea can use several levers, so the bars add up to more than the idea count.">
            <ResponsiveContainer width="100%" height={Math.max(160, typeData.length * 30)}>
              <BarChart data={typeData} layout="vertical" margin={{ top: 0, right: 32, left: 0, bottom: 0 }} barCategoryGap="25%">
                <CartesianGrid {...gridProps(t, false)} />
                <XAxis type="number" {...axisProps(t)} allowDecimals={false} />
                <YAxis type="category" dataKey="name" {...categoryAxisProps(t)} axisLine={false} width={104} />
                {tooltip}
                <Bar dataKey="value" name="Ideas" fill={t.accent} radius={RADIUS_H} maxBarSize={18} isAnimationActive={false}>
                  <LabelList dataKey="value" position="right" style={valueLabelStyle(t)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ChartCard title="Summary">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
            {summary.map(s => (
              <div key={s.label}>
                <dd className="text-[28px] font-semibold leading-none text-white">{s.value}</dd>
                <dt className="text-xs text-slate-500 mt-1.5 leading-snug">{s.label}</dt>
              </div>
            ))}
          </dl>
        </ChartCard>

        <ChartCard title="Implementation difficulty"><Columns data={diffData} /></ChartCard>
        <ChartCard title="Idea level"><Columns data={levelData} /></ChartCard>
        <ChartCard title="Saving potential (AI rating)"><Columns data={qualData} /></ChartCard>
      </div>
    </div>
  );
}
