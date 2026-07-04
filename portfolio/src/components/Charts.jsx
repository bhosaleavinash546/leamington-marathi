import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts'
import { experienceChart, competencies } from '../data.js'

const barColors = ['#5b8def', '#4fd1c5', '#c8a24a']

function ChartTooltip({ active, payload, label, unit }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="chart-tip">
      <strong>{label}</strong>
      <span>
        {payload[0].value}
        {unit}
      </span>
    </div>
  )
}

// Lazily loaded so the ~350KB Recharts bundle doesn't block first paint.
export default function Charts() {
  return (
    <>
      <div className="chart-head">
        <h3>Tenure by organisation</h3>
        <span className="text-soft">Years of experience</span>
      </div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={experienceChart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <XAxis
              dataKey="org"
              tick={{ fill: '#a7b0c2', fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: '#212a3c' }}
              interval={0}
            />
            <YAxis tick={{ fill: '#8791a5', fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<ChartTooltip unit=" yrs" />} />
            <Bar dataKey="years" radius={[8, 8, 0, 0]} maxBarSize={64}>
              {experienceChart.map((_, i) => (
                <Cell key={i} fill={barColors[i % barColors.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

export function CompetencyChart() {
  return (
    <>
      <div className="chart-head">
        <h3>Core competencies</h3>
        <span className="text-soft">Self-assessed proficiency</span>
      </div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={260}>
          <RadarChart data={competencies} outerRadius="72%">
            <PolarGrid stroke="#212a3c" />
            <PolarAngleAxis dataKey="area" tick={{ fill: '#a7b0c2', fontSize: 11 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar dataKey="level" stroke="#c8a24a" fill="#c8a24a" fillOpacity={0.32} strokeWidth={2} />
            <Tooltip content={<ChartTooltip unit="%" />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}
