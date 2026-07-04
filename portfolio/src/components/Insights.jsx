import { useState, useCallback } from 'react'
import { Newspaper, Linkedin } from 'lucide-react'
import { Reveal } from './motion.jsx'
import Lightbox from './Lightbox.jsx'
import { insights } from '../data.js'

export default function Insights() {
  const [active, setActive] = useState(null)

  // Duplicate the list so the CSS marquee can loop seamlessly.
  const loop = [...insights, ...insights]

  const nav = useCallback((dir) => {
    setActive((i) => (i === null ? i : (i + dir + insights.length) % insights.length))
  }, [])

  return (
    <section className="section insights" id="insights">
      <div className="container">
        <div className="section-head">
          <Reveal>
            <span className="section-eyebrow"><Newspaper size={13} /> Insights</span>
            <h2 className="section-title">Value Engineering, shared publicly</h2>
            <p className="section-sub">
              A LinkedIn series on where cost really lives in a product — plus the SAVE
              International certification behind the method. Hover to pause; click to view full size,
              or open the original post on LinkedIn.
            </p>
          </Reveal>
        </div>
      </div>

      <div className="marquee" role="list" aria-label="LinkedIn value-engineering series">
        <div className="marquee-track">
          {loop.map((item, i) => {
            const real = i < insights.length
            return (
              <div className="marquee-card" role="listitem" key={i} aria-hidden={real ? undefined : 'true'}>
                <button
                  type="button"
                  className="marquee-open"
                  onClick={() => real && setActive(i % insights.length)}
                  tabIndex={real ? 0 : -1}
                >
                  <img src={item.src} alt={item.title} loading="lazy" />
                  <span className="marquee-cap">
                    <em>{item.tag}</em>
                    {item.title}
                  </span>
                </button>
                {real && item.href && (
                  <a
                    className="marquee-linkedin"
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Read "${item.title}" on LinkedIn`}
                    title="Read the full post on LinkedIn"
                  >
                    <Linkedin size={15} />
                  </a>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <Lightbox items={insights} index={active} onClose={() => setActive(null)} onNav={nav} />
    </section>
  )
}
