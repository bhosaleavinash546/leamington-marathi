import { motion } from 'framer-motion'
import { Briefcase } from 'lucide-react'
import { Reveal } from './motion.jsx'
import { experience } from '../data.js'

export default function Experience() {
  return (
    <section className="section" id="experience">
      <div className="container">
        <div className="section-head">
          <Reveal>
            <span className="section-eyebrow"><Briefcase size={13} /> Experience</span>
            <h2 className="section-title">A decade turning cost into value</h2>
            <p className="section-sub">
              Progressive roles across three global automotive engineering leaders — from mechanical
              design to leading propulsion cost strategy.
            </p>
          </Reveal>
        </div>

        <div className="timeline">
          <motion.span
            className="timeline-spine"
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true, margin: '0px 0px -120px 0px' }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
          />
          {experience.map((job, i) => (
            <Reveal key={job.role + job.period} className="tl-item" delay={i * 0.05}>
              <span className="tl-node">
                <Briefcase size={13} />
              </span>
              <div className="panel tl-card">
                <div className="tl-top">
                  <div>
                    <h3 className="tl-role">{job.role}</h3>
                    <p className="tl-company">
                      <span className="accent">{job.company}</span> · {job.location}
                    </p>
                  </div>
                  <span className="tl-period">{job.period}</span>
                </div>
                <p className="tl-focus text-soft">{job.focus}</p>
                <ul className="tl-points">
                  {job.points.map((pt, j) => (
                    <li key={j}>{pt}</li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
