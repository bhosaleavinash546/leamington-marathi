import { Quote, BadgeCheck, GraduationCap, UserRound } from 'lucide-react'
import { Reveal, Counter, motion } from './motion.jsx'
import { profile, stats, certifications, education } from '../data.js'

export default function About() {
  return (
    <section className="section" id="about">
      <div className="container">
        {/* Stats band */}
        <div className="stats-band">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08} className="stat-cell">
              <div className="stat-value">
                <Counter to={s.value} suffix={s.suffix} />
              </div>
              <div className="stat-label text-soft">{s.label}</div>
            </Reveal>
          ))}
        </div>

        <div className="section-head" style={{ marginTop: 'clamp(48px,7vw,88px)' }}>
          <Reveal>
            <span className="section-eyebrow"><UserRound size={13} /> About</span>
            <h2 className="section-title">Engineering value, not just cutting cost</h2>
          </Reveal>
        </div>

        <div className="about-grid">
          <Reveal className="about-body">
            {profile.about.map((p, i) => (
              <p key={i} className="text-soft">
                {p}
              </p>
            ))}

            <motion.blockquote
              className="about-quote"
              initial={{ opacity: 0, x: -14 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <Quote size={20} className="qmark" />
              {profile.quote}
            </motion.blockquote>
          </Reveal>

          <div className="about-side">
            <Reveal className="panel about-card" delay={0.1}>
              <h3 className="about-card-title"><BadgeCheck size={18} className="accent" /> Certifications</h3>
              <ul className="cert-list">
                {certifications.map((c) => (
                  <li key={c}>
                    <span className="cert-tick">✓</span>
                    {c}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal className="panel about-card" delay={0.18}>
              <h3 className="about-card-title"><GraduationCap size={19} className="accent" /> Education</h3>
              <ul className="edu-list">
                {education.map((e) => (
                  <li key={e.school}>
                    <strong>{e.degree}</strong>
                    <span className="text-soft">{e.school}</span>
                    <em className="accent">{e.period}</em>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  )
}
