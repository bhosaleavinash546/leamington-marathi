import { Reveal } from './motion.jsx'
import { insights } from '../data.js'

export default function Insights() {
  // Duplicate the list so the CSS marquee can loop seamlessly.
  const loop = [...insights, ...insights]

  return (
    <section className="section insights" id="insights">
      <div className="container">
        <div className="section-head">
          <Reveal>
            <span className="section-eyebrow">Insights</span>
            <h2 className="section-title">Value Engineering, shared publicly</h2>
            <p className="section-sub">
              A LinkedIn series on where cost really lives in a product — plus the SAVE
              International certification behind the method. Hover to pause; click to open full size.
            </p>
          </Reveal>
        </div>
      </div>

      <div className="marquee" role="list" aria-label="LinkedIn value-engineering series">
        <div className="marquee-track">
          {loop.map((item, i) => (
            <a
              key={i}
              className="marquee-card"
              role="listitem"
              href={item.src}
              target="_blank"
              rel="noopener noreferrer"
              aria-hidden={i >= insights.length ? 'true' : undefined}
              tabIndex={i >= insights.length ? -1 : 0}
            >
              <img src={item.src} alt={item.title} loading="lazy" />
              <span className="marquee-cap">
                <em>{item.tag}</em>
                {item.title}
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
