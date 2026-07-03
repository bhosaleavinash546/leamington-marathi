import { motion } from 'framer-motion'
import { MapPin, Linkedin, Mail, ArrowUpRight, Sparkles } from 'lucide-react'
import { profile } from '../data.js'

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
}
const item = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
}

export default function Hero() {
  return (
    <section className="hero" id="top">
      <div className="container hero-grid">
        <motion.div className="hero-copy" variants={container} initial="hidden" animate="show">
          <motion.span className="hero-badge" variants={item}>
            <Sparkles size={14} /> Available for high-impact cost & value engineering
          </motion.span>

          <motion.h1 className="hero-name" variants={item}>
            {profile.name}
          </motion.h1>

          <motion.p className="hero-title" variants={item}>
            {profile.title}
          </motion.p>

          <motion.p className="hero-tagline" variants={item}>
            {profile.tagline}
          </motion.p>

          <motion.p className="hero-intro text-soft" variants={item}>
            {profile.intro}
          </motion.p>

          <motion.div className="hero-actions" variants={item}>
            <a className="btn btn-primary" href="#projects">
              View AI platforms <ArrowUpRight size={17} />
            </a>
            <a className="btn btn-ghost" href="#experience">
              Career journey
            </a>
          </motion.div>

          <motion.ul className="hero-meta" variants={item}>
            <li>
              <MapPin size={15} /> {profile.location}
            </li>
            <li>
              <a href={profile.linkedin} target="_blank" rel="noopener noreferrer">
                <Linkedin size={15} /> LinkedIn
              </a>
            </li>
            <li>
              <a href={`mailto:${profile.email}`}>
                <Mail size={15} /> Email
              </a>
            </li>
          </motion.ul>
        </motion.div>

        <motion.div
          className="hero-visual"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="hero-orbit">
            <motion.span
              className="orbit-ring ring-1"
              animate={{ rotate: 360 }}
              transition={{ duration: 26, repeat: Infinity, ease: 'linear' }}
            />
            <motion.span
              className="orbit-ring ring-2"
              animate={{ rotate: -360 }}
              transition={{ duration: 34, repeat: Infinity, ease: 'linear' }}
            />
            <div className={`hero-avatar ${profile.photo ? 'has-photo' : ''}`}>
              {profile.photo ? (
                <img src={profile.photo} alt={`${profile.name} headshot`} />
              ) : (
                <span>{profile.initials}</span>
              )}
            </div>
            {['VE', 'AI', 'TRIZ', 'VMA'].map((t, i) => (
              <motion.span
                key={t}
                className={`orbit-chip chip-${i + 1}`}
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3 + i * 0.4, repeat: Infinity, ease: 'easeInOut' }}
              >
                {t}
              </motion.span>
            ))}
          </div>

          <div className="hero-nowcard panel">
            <span className="now-dot" />
            <div>
              <strong>Now — {profile.currentCompany}</strong>
              <p className="text-soft">Propulsion cost optimisation, Gaydon UK</p>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div
        className="hero-scroll"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
      >
        <span>Scroll</span>
        <motion.span
          className="scroll-line"
          animate={{ scaleY: [0.3, 1, 0.3] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        />
      </motion.div>
    </section>
  )
}
