import { motion } from 'framer-motion'
import { BrainCircuit, ScanSearch, Gauge, ArrowUpRight } from 'lucide-react'
import { Reveal } from './motion.jsx'
import { projects } from '../data.js'

const icons = [BrainCircuit, ScanSearch, Gauge]

export default function Projects() {
  return (
    <section className="section" id="projects">
      <div className="container">
        <div className="section-head">
          <Reveal>
            <span className="section-eyebrow">AI Platforms</span>
            <h2 className="section-title">Turning engineering data into cost intelligence</h2>
            <p className="section-sub">
              Self-built, AI-powered platforms that convert images, CAD, drawings, PCB layouts and
              quotations into actionable cost and value insight — in a fraction of the traditional
              time.
            </p>
          </Reveal>
        </div>

        <div className="projects-grid">
          {projects.map((p, i) => {
            const Icon = icons[i % icons.length]
            return (
              <motion.article
                key={p.name}
                className="panel project-card"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '0px 0px -60px 0px' }}
                transition={{ duration: 0.6, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ y: -8 }}
              >
                <div className="project-top">
                  <span className="project-icon">
                    <Icon size={22} />
                  </span>
                  <span className="project-index">0{i + 1}</span>
                </div>
                <h3 className="project-name">{p.name}</h3>
                <p className="project-kind accent">{p.kind}</p>
                <p className="project-desc text-soft">{p.description}</p>
                <ul className="project-tags">
                  {p.tags.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <motion.span className="project-shine" aria-hidden />
              </motion.article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
