import { lazy, Suspense } from 'react'
import { Reveal } from './motion.jsx'
import { skillGroups } from '../data.js'

// Recharts is heavy — load it only when this section is reached.
const TenureChart = lazy(() => import('./Charts.jsx'))
const CompetencyChart = lazy(() =>
  import('./Charts.jsx').then((m) => ({ default: m.CompetencyChart })),
)

function ChartSkeleton() {
  return <div className="chart-skeleton" aria-hidden="true" />
}

export default function Expertise() {
  return (
    <section className="section" id="expertise">
      <div className="container">
        <div className="section-head">
          <Reveal>
            <span className="section-eyebrow">Expertise</span>
            <h2 className="section-title">Depth across domains, measured in impact</h2>
            <p className="section-sub">
              Thirteen years of tenure and a competency profile shaped by value engineering,
              should-costing, benchmarking and — increasingly — applied AI.
            </p>
          </Reveal>
        </div>

        <div className="charts-grid">
          <Reveal className="panel chart-card">
            <Suspense fallback={<ChartSkeleton />}>
              <TenureChart />
            </Suspense>
          </Reveal>

          <Reveal className="panel chart-card" delay={0.1}>
            <Suspense fallback={<ChartSkeleton />}>
              <CompetencyChart />
            </Suspense>
          </Reveal>
        </div>

        <div className="skills-grid">
          {skillGroups.map((g, i) => (
            <Reveal key={g.title} className="panel skill-card" delay={i * 0.07}>
              <h3 className="skill-title">{g.title}</h3>
              <ul className="chips">
                {g.items.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
