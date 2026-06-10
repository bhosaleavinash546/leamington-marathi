import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import Logo from '../components/Logo';

const FEATURES = [
  { icon: '📊', title: 'Should-Cost Engineering', desc: 'Build rigorous should-cost models by cost element — material, labor, overhead, logistics, and profit — with full version history.' },
  { icon: '⚖',  title: 'Three-Way Cost Analysis', desc: 'Side-by-side view of Should-Cost, Current Live Price, and New Supplier Quotes. AI highlights overpayments and best-switch opportunities.' },
  { icon: '🏭', title: 'Multi-Supplier Comparison', desc: 'Compare 3-5 supplier quotes side by side against your should-cost target. Instantly spot the best and worst performers per element.' },
  { icon: '📉', title: 'Opportunity Dashboard', desc: 'Interactive system-wise dashboard showing variance between latest quotes and should-cost. Treemap, bar charts, and ranked parts list.' },
  { icon: '🤖', title: 'AI Analysis Agent', desc: 'LLM-powered analysis flags anomalies, identifies high cost-drivers by category, and recommends negotiation actions.' },
  { icon: '🚗', title: '22 Automotive Systems', desc: 'Navigate parts using a three-level hierarchy covering every BIW, powertrain, ADAS, interior, and EV-specific system.' },
  { icon: '🔒', title: 'Supplier Portal', desc: 'Secure login for each supplier with data isolation. Suppliers submit structured breakdowns; procurement reviews and negotiates.' },
  { icon: '⬇️', title: 'Excel Export', desc: 'One-click export of single or multi-supplier comparisons to colour-coded Excel workbooks, ready for stakeholder review.' },
];

const HOW_IT_WORKS = [
  { n: '01', title: 'Build Should-Cost', desc: 'Internal engineers break the part cost into elements: raw material, BOP, labor, overhead, tooling, logistics. Publish when ready.' },
  { n: '02', title: 'Record Current Price', desc: 'Enter what you currently pay the incumbent supplier — broken down by the same cost elements. This becomes your baseline.' },
  { n: '03', title: 'Collect Supplier Quotes', desc: 'Suppliers submit structured quotes via their secure portal. All versions are retained for trend analysis.' },
  { n: '04', title: 'AI Three-Way Analysis', desc: 'The platform highlights the biggest overpayments vs should-cost, cost-driver categories, and which new supplier offers the best saving.' },
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

// Vehicle programs data (mirrors DB seed)
const PROGRAMS = [
  {
    code: 'SUV1', name: 'Compact SUV Alpha',
    segment: 'Compact SUV', year: 2024, platform: 'MX-A1',
    desc: 'Entry-level compact crossover, FWD/AWD option, 5-seat',
    highlight: '#6366f1',
    systems: ['Vehicle Body & BIW', 'Suspension Systems', 'Powertrain – ICE', 'Transmission & Driveline', 'Braking Systems', 'Interior Systems & Trim', 'Infotainment, HMI & Connectivity', 'Electrical & Electronics'],
    stats: { parts: 312, sc: 22, quotes: 58 },
  },
  {
    code: 'SUV2', name: 'Mid-Size SUV Beta',
    segment: 'Mid-Size SUV', year: 2024, platform: 'MX-B1',
    desc: 'Mid-size AWD SUV, 5-seat, 2.0T turbocharged engine',
    highlight: '#f59e0b',
    systems: ['Vehicle Body & BIW', 'Chassis, Frame & Underbody', 'Suspension Systems', 'Steering Systems', 'Braking Systems', 'Powertrain – ICE', 'Thermal Management & HVAC', 'Seating Systems', 'ADAS & Driver Assistance', 'Safety & Restraint Systems'],
    stats: { parts: 487, sc: 34, quotes: 112 },
  },
  {
    code: 'SUV3', name: 'Full-Size SUV Gamma',
    segment: 'Full-Size SUV', year: 2025, platform: 'MX-C1',
    desc: '3-row full-size SUV, 7-seat, V6 engine, 4WD',
    highlight: '#10b981',
    systems: ['Vehicle Body & BIW', 'Exterior Systems & Trim', 'Chassis, Frame & Underbody', 'Suspension Systems', 'Powertrain – ICE', 'Transmission & Driveline', 'Fuel & Emission Systems', 'Interior Systems & Trim', 'Seating Systems', 'NVH, Sealing & Corrosion'],
    stats: { parts: 621, sc: 41, quotes: 94 },
  },
  {
    code: 'SUV4', name: 'Performance SUV Delta',
    segment: 'Performance SUV', year: 2025, platform: 'MX-D1',
    desc: 'High-performance twin-turbo AWD SUV with sport suspension',
    highlight: '#ef4444',
    systems: ['Vehicle Body & BIW', 'Suspension Systems', 'Steering Systems', 'Braking Systems', 'Powertrain – ICE', 'Transmission & Driveline', 'Wheels & Tyres', 'ADAS & Driver Assistance', 'Comfort & Convenience', 'Infotainment, HMI & Connectivity'],
    stats: { parts: 389, sc: 28, quotes: 71 },
  },
  {
    code: 'SUV5', name: 'Electric SUV Epsilon',
    segment: 'BEV SUV', year: 2026, platform: 'EV-X1',
    desc: 'Battery-electric SUV, 400V architecture, ~500 km range',
    highlight: '#06b6d4',
    systems: ['Vehicle Body & BIW', 'Powertrain – BEV/MHEV', 'EV-Specific Advanced Systems', 'Thermal Management & HVAC', 'ADAS & Driver Assistance', 'Electrical & Electronics', 'Infotainment, HMI & Connectivity', 'Safety & Restraint Systems', 'Braking Systems', 'Interior Systems & Trim'],
    stats: { parts: 534, sc: 47, quotes: 138 },
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [activeProgram, setActiveProgram] = useState<string | null>(null);

  const prog = PROGRAMS.find(p => p.code === activeProgram);

  return (
    <div className="landing">
      {/* ── Nav ── */}
      <nav className="landing-nav">
        <div className="landing-nav-logo" style={{ lineHeight: 0 }}>
          <Logo height={52} />
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
          Build rigorous should-cost models, compare current live prices against targets,
          and let AI surface the biggest cost-reduction opportunities — by system, by category, by part.
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
            <div className="hero-stat-num">3-Way</div>
            <div className="hero-stat-lbl">Cost Comparison</div>
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

      {/* ── Vehicle Program Filter ── */}
      <section style={{ padding: '80px 48px', background: 'var(--surface)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="section-label">Vehicle Programs</div>
          <h2 className="section-title" style={{ marginBottom: 8 }}>Explore by Program</h2>
          <p className="section-desc" style={{ marginBottom: 40 }}>
            Cost data is organised by vehicle program. Select a program to see which systems and assemblies are tracked.
          </p>

          {/* Program Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 28 }}>
            {PROGRAMS.map(p => {
              const isActive = activeProgram === p.code;
              return (
                <button
                  key={p.code}
                  onClick={() => setActiveProgram(isActive ? null : p.code)}
                  style={{
                    background: isActive ? p.highlight + '22' : 'var(--bg)',
                    border: `2px solid ${isActive ? p.highlight : 'var(--border)'}`,
                    borderRadius: 16,
                    padding: '20px 18px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                    transform: isActive ? 'translateY(-3px)' : 'none',
                    boxShadow: isActive ? `0 8px 24px ${p.highlight}33` : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 20, fontWeight: 900, color: p.highlight }}>{p.code}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: p.highlight, background: p.highlight + '22', borderRadius: 20, padding: '2px 8px' }}>{p.year}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4, lineHeight: 1.3 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.4 }}>{p.segment} · {p.platform}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: 'var(--text-3)', background: 'var(--bg-alt)', borderRadius: 6, padding: '2px 6px' }}>{p.stats.parts} parts</span>
                    <span style={{ fontSize: 10, color: 'var(--text-3)', background: 'var(--bg-alt)', borderRadius: 6, padding: '2px 6px' }}>{p.stats.sc} SC</span>
                    <span style={{ fontSize: 10, color: 'var(--text-3)', background: 'var(--bg-alt)', borderRadius: 6, padding: '2px 6px' }}>{p.stats.quotes} quotes</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Expanded Program Detail */}
          {prog && (
            <div style={{
              background: 'var(--bg)', borderRadius: 20, border: `2px solid ${prog.highlight}`,
              padding: '28px 32px', animation: 'fadeIn 0.2s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 28, fontWeight: 900, color: prog.highlight }}>{prog.code}</span>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)' }}>{prog.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{prog.desc}</div>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  {[
                    { label: 'Total Parts', value: prog.stats.parts },
                    { label: 'Should-Costs', value: prog.stats.sc },
                    { label: 'Quotes', value: prog.stats.quotes },
                  ].map(s => (
                    <div key={s.label} style={{ textAlign: 'center', padding: '12px 18px', background: prog.highlight + '15', borderRadius: 12 }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: prog.highlight }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1 }}>
                Systems Covered
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                {prog.systems.map(sys => (
                  <span key={sys} style={{
                    fontSize: 12, fontWeight: 600, color: prog.highlight,
                    background: prog.highlight + '18', borderRadius: 20,
                    padding: '5px 14px', border: `1px solid ${prog.highlight}44`,
                  }}>
                    {sys}
                  </span>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => navigate('/login')}
                  style={{ background: prog.highlight, borderColor: prog.highlight }}
                >
                  Open {prog.code} Dashboard →
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => navigate('/login')}
                >
                  Three-Way Analysis →
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="features">
        <div className="section-label">Platform Capabilities</div>
        <h2 className="section-title">Everything you need for cost engineering</h2>
        <p className="section-desc">
          From should-cost modelling to three-way comparison to AI-driven negotiation —
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
          Join procurement and cost engineering teams who use CostLens to negotiate with data.
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
        color: 'var(--text-3)',
        fontSize: 13,
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Logo height={32} />
            <span><strong style={{ color: 'var(--text-1)' }}>CostLens</strong> — Automotive Cost Engineering Platform</span>
          </div>
          <div>© {new Date().getFullYear()} CostLens. All rights reserved.</div>
        </div>
        <div style={{
          borderTop: '1px solid var(--border)',
          paddingTop: 14,
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--text-3)',
        }}>
          Designed &amp; developed by —{' '}
          <strong style={{ color: 'var(--text-2)' }}>Avinash Bhosale</strong>
          <span style={{ color: 'var(--text-3)', marginLeft: 6 }}>(Senior Cost Improvement Engineer)</span>
        </div>
      </footer>
    </div>
  );
}
