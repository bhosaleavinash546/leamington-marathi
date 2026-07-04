import { motion } from 'framer-motion'
import { Mail, Linkedin, MapPin, Award, ArrowUpRight, Send } from 'lucide-react'
import { Reveal } from './motion.jsx'
import { profile, awards } from '../data.js'

export default function Contact() {
  return (
    <section className="section" id="contact">
      <div className="container">
        <div className="contact-layout">
          <Reveal className="panel awards-card">
            <h3 className="about-card-title">
              <Award size={18} className="accent" /> Honours &amp; Awards
            </h3>
            <ul className="awards-list">
              {awards.map((a, i) => (
                <motion.li
                  key={a}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: i * 0.06 }}
                >
                  {a}
                </motion.li>
              ))}
            </ul>
          </Reveal>

          <Reveal className="contact-cta" delay={0.1}>
            <span className="section-eyebrow"><Send size={13} /> Contact</span>
            <h2 className="contact-title">Let&apos;s engineer more value together</h2>
            <p className="text-soft contact-copy">
              Open to conversations on value engineering, should-costing, benchmarking, and applying
              AI to cost intelligence across the automotive industry.
            </p>
            <div className="contact-actions">
              <a className="btn btn-primary" href={`mailto:${profile.email}`}>
                <Mail size={17} /> {profile.email}
              </a>
              <a
                className="btn btn-ghost"
                href={profile.linkedin}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Linkedin size={17} /> Connect <ArrowUpRight size={15} />
              </a>
            </div>
            <p className="contact-loc text-soft">
              <MapPin size={15} /> {profile.location}
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
