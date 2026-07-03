import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { profile, nav } from '../data.js'

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <motion.header
      className={`nav-header ${scrolled ? 'is-scrolled' : ''}`}
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <nav className="container nav" aria-label="Primary">
        <a href="#top" className="brand">
          <span className="brand-mark">{profile.initials}</span>
          <span className="brand-text">
            <strong>{profile.name}</strong>
            <em>Value &amp; Cost Engineering</em>
          </span>
        </a>

        <ul className="nav-links">
          {nav.map((n) => (
            <li key={n.id}>
              <a href={`#${n.id}`}>{n.label}</a>
            </li>
          ))}
        </ul>

        <a className="btn btn-primary nav-cta" href={`mailto:${profile.email}`}>
          Get in touch
        </a>

        <button
          className="nav-burger"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.ul
            className="nav-mobile"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28 }}
          >
            {nav.map((n) => (
              <li key={n.id}>
                <a href={`#${n.id}`} onClick={() => setOpen(false)}>
                  {n.label}
                </a>
              </li>
            ))}
            <li>
              <a href={`mailto:${profile.email}`} onClick={() => setOpen(false)}>
                Get in touch
              </a>
            </li>
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
