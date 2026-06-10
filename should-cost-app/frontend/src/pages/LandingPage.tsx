import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

const FEATURES = [
  { icon: '📊', title: 'Should-Cost Engineering', desc: 'Build rigorous should-cost models by cost element — material, labor, overhead, logistics, and profit — with full version history.' },
  { icon: '🏭', title: 'Multi-Supplier Comparison', desc: 'Compare 3-5 supplier quotes side by side against your should-cost target. Instantly spot the best and worst performers per element.' },
  { icon: '📉', title: 'Waterfall Analytics', desc: 'Interactive bar and waterfall charts show exactly where variance originates. Drill from total variance to individual cost elements.' },
  { icon: '🤖', title: 'AI Analysis Agent', desc: 'LLM-powered analysis flags anomalies, generates clarifying questions, and recommends negotiation actions — in seconds.' },
  { icon: '🚗', title: '22 Automotive Systems', desc: 'Navigate parts using a three-level hierarchy covering every BIW, powertrain, ADAS, interior, and EV-specific system.' },
  { icon: '🔒', title: 'Supplier Portal', desc: 'Secure login for each supplier with data isolation. Suppliers submit structured breakdowns; procurement reviews and negotiates.' },
  { icon: '📋', title: 'Negotiation Threads', desc: 'Inline comments per cost element with internal/external visibility control. Full audit trail for every action taken.' },
  { icon: '⬇️', title: 'Excel Export', desc: 'One-click export of single or multi-supplier comparisons to colour-coded Excel workbooks, ready for stakeholder review.' },
];

const HOW_IT_WORKS = [
  { n: '01', title: 'Build Should-Cost', desc: 'Internal engineers break the part cost into elements: raw material, labor, overhead, tooling, logistics. Publish when ready.' },
  { n: '02', title: 'Invite Suppliers', desc: 'Suppliers receive secure portal access. They submit structured quotes matching the same cost elements as your model.' },
  { n: '03', title: 'Run Comparison', desc: 'Create a snapshot linking your should-cost to one or more supplier quotes. The system calculates element-level variance instantly.' },
  { n: '04', title: 'AI Insight + Negotiate', desc: 'The AI agent flags high-variance elements, generates questions, and recommends actions. Use the thread to negotiate inline.' },
];

const SYSTEMS = [
  'Vehicle Body & BIW', 'Exterior Systems & Trim', 'Chassis, Frame & Underbody',
  'Suspension Systems', 'Steering Systems', 'Braking Systems', 'Wheels & Tyres',
  'Powertrain – ICE', 'Powertrain – BEV/MHEV', 'Transmission & Driveline',
  'Fuel & Emission Systems', 'Thermal Management & HVAC', 'Interior Systems & Trim',
  'Seating Systems', 'Safety & Restraint Systems', 'ADAS & Driver Assistance',
  'Electrical & Electronics', 'Infotainment, HMI & Connectivity',
  'Comfort & Convenience', 'Wipers, Washers & Visibility',
  'NVH, Sealing & Corrosion', 'EV-Specific Advanced Systems',
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  return (
    <div className="landing">
      {/* ── Nav ── */}
      <nav className="landing-nav">
        <div className="landing-nav-logo">
          <span style={{ color: 'var(--accent)' }}>Cost</span>
          <span>IQ</span>
        </div>
        <div className="landing-nav-links">
          <button className="theme-toggle" data-on={theme === 'dark'} onClick={toggle} title="Toggle theme" />
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/login')}>Sign In</button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/signup')}>Get Started</button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-badge">
          <span className="pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
          Automotive Cost Engineering Platform
        </div>
        <h1>
          Know exactly what <span className="gradient-text">every part should cost</span> before the supplier quotes
        </h1>
        <p className="hero-desc">
          Build rigorous should-cost models, collect and compare supplier quotes from up to 5 vendors,
          and let AI surface the variance that matters — in one unified platform.
        </p>
        <div className="hero-cta">
          <button className="btn btn-primary btn-lg" onClick={() => navigate('/signup')}>
            Start Free Trial
          </button>
          <button className="btn btn-ghost btn-lg" onClick={() => navigate('/login')}>
            Sign In →
          </button>
        </div>

        <div className="hero-stats">
          <div className="hero-stat">
            <div className="hero-stat-num">22</div>
            <div className="hero-stat-lbl">Vehicle Systems</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-num">5×</div>
            <div className="hero-stat-lbl">Supplier Comparison</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-num">AI</div>
            <div className="hero-stat-lbl">Powered Analysis</div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="features">
        <div className="section-label">Platform Capabilities</div>
        <h2 className="section-title">Everything you need for cost engineering</h2>
        <p className="section-desc">
          From should-cost modelling to multi-supplier matrix to AI-driven negotiation —
          one platform, end-to-end.
        </p>
        <div className="features-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <div className="how-it-works">
        <div className="hiw-inner">
          <div className="section-label">Workflow</div>
          <h2 className="section-title">From target cost to signed PO</h2>
          <div className="hiw-steps">
            {HOW_IT_WORKS.map((s) => (
              <div key={s.n} className="hiw-step">
                <div className="hiw-step-num">{s.n}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Systems ── */}
      <section className="systems-showcase">
        <div className="section-label">Coverage</div>
        <h2 className="section-title">All 22 Automotive Systems</h2>
        <p className="section-desc">
          Navigate parts through a three-level hierarchy — system, subsystem, component —
          covering every assembly on a modern vehicle.
        </p>
        <div className="systems-grid">
          {SYSTEMS.map((s, i) => (
            <div key={s} className="system-chip">
              <div className="system-chip-num">{i + 1}</div>
              {s}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA Footer ── */}
      <div style={{
        padding: '80px 48px',
        textAlign: 'center',
        background: 'linear-gradient(135deg, var(--accent-glow), transparent)',
        borderTop: '1px solid var(--border)',
      }}>
        <h2 style={{ fontSize: 'clamp(24px,4vw,40px)', fontWeight: 900, letterSpacing: -0.5, marginBottom: 16 }}>
          Ready to take control of your cost structure?
        </h2>
        <p style={{ color: 'var(--text-2)', fontSize: 16, marginBottom: 32 }}>
          Join procurement and cost engineering teams who use CostIQ to negotiate with data.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button className="btn btn-primary btn-lg" onClick={() => navigate('/signup')}>Create Account</button>
          <button className="btn btn-secondary btn-lg" onClick={() => navigate('/login')}>Sign In</button>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '28px 48px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        color: 'var(--text-3)', fontSize: 13, flexWrap: 'wrap', gap: 12,
      }}>
        <div><strong style={{ color: 'var(--accent)' }}>CostIQ</strong> — Automotive Cost Engineering Platform</div>
        <div>© {new Date().getFullYear()} CostIQ. All rights reserved.</div>
      </footer>
    </div>
  );
}
