import { Reveal } from './motion.jsx'
import { companies } from '../data.js'

// A slim credibility band of organisations worked with.
export default function LogoStrip() {
  return (
    <section className="logostrip" aria-label="Organisations worked with">
      <div className="container">
        <Reveal className="logostrip-inner">
          <span className="logostrip-label">Experience across</span>
          <ul className="logostrip-list">
            {companies.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  )
}
