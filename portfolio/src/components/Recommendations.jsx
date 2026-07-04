import { motion } from 'framer-motion'
import { Quote, Linkedin, MessageSquareQuote } from 'lucide-react'
import { Reveal } from './motion.jsx'
import { recommendations } from '../data.js'

const avatarColors = ['var(--accent)', 'var(--cyan)', 'var(--blue)']

export default function Recommendations() {
  return (
    <section className="section" id="praise">
      <div className="container">
        <div className="section-head">
          <Reveal>
            <span className="section-eyebrow"><MessageSquareQuote size={13} /> Recommendations</span>
            <h2 className="section-title">What colleagues and mentors say</h2>
            <p className="section-sub">
              <Linkedin size={15} style={{ verticalAlign: '-2px' }} /> Verbatim from LinkedIn
              recommendations by managers, mentors and teammates across Tata Technologies and beyond.
            </p>
          </Reveal>
        </div>

        <div className="rec-wall">
          {recommendations.map((r, i) => (
            <motion.figure
              key={r.name}
              className="panel rec-card"
              initial={{ opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '0px 0px -60px 0px' }}
              transition={{ duration: 0.55, delay: (i % 3) * 0.08, ease: [0.22, 1, 0.36, 1] }}
            >
              <Quote className="rec-quote-mark" size={26} aria-hidden="true" />
              <blockquote className="rec-quote">{r.quote}</blockquote>
              <figcaption className="rec-person">
                {r.photo ? (
                  <img className="rec-avatar rec-avatar-photo" src={r.photo} alt={r.name} loading="lazy" />
                ) : (
                  <span
                    className="rec-avatar"
                    style={{ background: avatarColors[i % avatarColors.length] }}
                    aria-hidden="true"
                  >
                    {r.initials}
                  </span>
                )}
                <span className="rec-meta">
                  <strong>{r.name}</strong>
                  <em>{r.role}</em>
                  <span className="rec-relation">{r.relation}</span>
                </span>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  )
}
