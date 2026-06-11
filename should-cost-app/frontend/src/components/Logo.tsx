import { useId } from 'react';

interface LogoProps { height?: number; style?: React.CSSProperties }
interface MarkProps { size?: number;   style?: React.CSSProperties }
interface HeroProps { size?: number;   style?: React.CSSProperties }

/* ── LogoMark (44 × 44 icon) ──────────────────────────────── */
export function LogoMark({ size = 44, style }: MarkProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={style}>
      <defs>
        <linearGradient id={`${uid}c`} x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0C1829" />
          <stop offset="100%" stopColor="#1535A8" />
        </linearGradient>
        <linearGradient id={`${uid}b1`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
        <linearGradient id={`${uid}b2`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
        <linearGradient id={`${uid}b3`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C084FC" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
      </defs>

      {/* Card */}
      <rect width="44" height="44" rx="10" fill={`url(#${uid}c)`} />

      {/* 3 ascending bars — short (should-cost) → tall (overpriced) */}
      <rect x="6"  y="30" width="8" height="8"  rx="2" fill={`url(#${uid}b1)`} />
      <rect x="18" y="22" width="8" height="16" rx="2" fill={`url(#${uid}b2)`} />
      <rect x="30" y="14" width="8" height="24" rx="2" fill={`url(#${uid}b3)`} />

      {/* Cyan trend line connecting bar tops */}
      <polyline points="10,28 22,20 34,12" stroke="#22D3EE" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="10" cy="28" r="2" fill="#22D3EE" />
      <circle cx="22" cy="20" r="2" fill="#22D3EE" />
      <circle cx="34" cy="12" r="2" fill="#22D3EE" />

      {/* Lens overlay — upper-right */}
      <circle cx="34" cy="10" r="5" stroke="#22D3EE" strokeWidth="1.5" fill="none" opacity="0.75" />
      <line x1="37.5" y1="13.5" x2="41" y2="17" stroke="#22D3EE" strokeWidth="2"
            strokeLinecap="round" opacity="0.75" />
    </svg>
  );
}

/* ── Logo (full wordmark — default export) ─────────────────── */
export default function Logo({ height = 52, style }: LogoProps) {
  const markH = Math.round(height * 0.72);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, ...style }}>
      <LogoMark size={markH} />
      <div style={{ lineHeight: 1 }}>
        <div style={{
          fontSize: Math.round(height * 0.34),
          fontWeight: 900,
          letterSpacing: '-0.5px',
          color: 'var(--text-1)',
          fontFamily: 'var(--font)',
        }}>
          CostLens
        </div>
        <div style={{
          fontSize: Math.round(height * 0.17),
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase' as const,
          color: 'var(--accent-2)',
          marginTop: 2,
          fontFamily: 'var(--font)',
        }}>
          AI Cost Intelligence
        </div>
      </div>
    </div>
  );
}

/* ── HeroMark (hero section illustration) ──────────────────── */
export function HeroMark({ size = 340, style }: HeroProps) {
  const uid = useId().replace(/:/g, '');

  const bars = [
    { x: 72,  cx: 92,  h: 110, topY: 138, label: 'RM', grad: `url(#${uid}hb1)` },
    { x: 128, cx: 148, h: 136, topY: 112, label: 'MF', grad: `url(#${uid}hb2)` },
    { x: 184, cx: 204, h: 80,  topY: 168, label: 'OH', grad: `url(#${uid}hb3)` },
    { x: 240, cx: 260, h: 58,  topY: 190, label: 'LG', grad: `url(#${uid}hb4)` },
  ];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 340 340"
      fill="none"
      style={{ display: 'block', ...style }}
    >
      <defs>
        <linearGradient id={`${uid}hbg`} x1="0" y1="0" x2="340" y2="340" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#091320" />
          <stop offset="100%" stopColor="#0d1b34" />
        </linearGradient>
        <radialGradient id={`${uid}glow`} cx="50%" cy="30%" r="60%">
          <stop offset="0%" stopColor="#1D4ED8" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}hb1`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
        <linearGradient id={`${uid}hb2`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
        <linearGradient id={`${uid}hb3`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C084FC" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
        <linearGradient id={`${uid}hb4`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F472B6" />
          <stop offset="100%" stopColor="#BE185D" />
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width="340" height="340" rx="28" fill={`url(#${uid}hbg)`} />
      <rect width="340" height="340" rx="28" fill={`url(#${uid}glow)`} />

      {/* Dot grid */}
      {Array.from({ length: 48 }, (_, i) => {
        const row = Math.floor(i / 8);
        const col = i % 8;
        return (
          <circle key={i} cx={20 + col * 38} cy={22 + row * 38} r="1.5"
                  fill="#3B82F6" opacity="0.15" />
        );
      })}

      {/* Chart label */}
      <text x="36" y="70" fontSize="9" fontWeight="700" fill="#3D5170"
            fontFamily="Inter,sans-serif" letterSpacing="0.12em">
        COST BREAKDOWN ANALYSIS
      </text>

      {/* Axes */}
      <line x1="58" y1="84" x2="58" y2="248" stroke="#162236" strokeWidth="1.5" />
      <line x1="58" y1="248" x2="296" y2="248" stroke="#162236" strokeWidth="1.5" />

      {/* Grid lines */}
      {[84, 138, 193, 248].map((y, i) => (
        <line key={i} x1="62" y1={y} x2="292" y2={y}
              stroke="#162236" strokeWidth="0.75" strokeDasharray="4 4" />
      ))}

      {/* Bars */}
      {bars.map((b) => (
        <g key={b.label}>
          <rect x={b.x} y={b.topY} width="40" height={b.h} rx="4" fill={b.grad} opacity="0.92" />
          <text x={b.cx} y="262" fontSize="10" fontWeight="600" fill="#4B5E7A"
                textAnchor="middle" fontFamily="Inter,sans-serif">{b.label}</text>
        </g>
      ))}

      {/* Trend line (cyan) */}
      <polyline
        points={bars.map(b => `${b.cx},${b.topY}`).join(' ')}
        stroke="#22D3EE" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        fill="none"
      />
      {bars.map((b, i) => (
        <circle key={i} cx={b.cx} cy={b.topY} r="4" fill="#22D3EE" stroke="#091320" strokeWidth="1.5" />
      ))}

      {/* Magnifying lens (upper-right quadrant) */}
      <circle cx="272" cy="90" r="28" stroke="#22D3EE" strokeWidth="2.5"
              fill="rgba(34,211,238,0.06)" />
      <circle cx="264" cy="82" r="8" fill="white" opacity="0.04" />
      <line x1="292" y1="110" x2="310" y2="128" stroke="#22D3EE" strokeWidth="5"
            strokeLinecap="round" opacity="0.7" />

      {/* ─ Floating badges ─ */}
      {/* Savings (top-left) */}
      <rect x="24" y="80" width="90" height="22" rx="11"
            fill="rgba(4,120,87,0.22)" stroke="#34D399" strokeWidth="1" />
      <text x="69" y="95" fontSize="10" fontWeight="700" fill="#34D399"
            textAnchor="middle" fontFamily="Inter,sans-serif">↓ 18% Savings</text>

      {/* Bottom row chips */}
      <rect x="24"  y="272" width="90" height="26" rx="13"
            fill="rgba(29,78,216,0.2)" stroke="#3B82F6" strokeWidth="1" />
      <text x="69"  y="289" fontSize="10" fontWeight="700" fill="#60A5FA"
            textAnchor="middle" fontFamily="Inter,sans-serif">Should-Cost</text>

      <rect x="122" y="272" width="76" height="26" rx="13"
            fill="rgba(79,70,229,0.2)" stroke="#818CF8" strokeWidth="1" />
      <text x="160" y="289" fontSize="10" fontWeight="700" fill="#A78BFA"
            textAnchor="middle" fontFamily="Inter,sans-serif">Live Price</text>

      <rect x="206" y="272" width="66" height="26" rx="13"
            fill="rgba(34,211,238,0.12)" stroke="#22D3EE" strokeWidth="1" />
      <text x="239" y="289" fontSize="10" fontWeight="700" fill="#22D3EE"
            textAnchor="middle" fontFamily="Inter,sans-serif">AI Brief</text>
    </svg>
  );
}
