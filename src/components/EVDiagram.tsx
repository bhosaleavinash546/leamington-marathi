import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Play, Pause } from 'lucide-react';

// ── Timing constants ─────────────────────────────────────────────────────────
const T_WHEEL = 3.2;
const T_MOTOR = 0.72;
const T_SHAFT = 1.1;
const T_FLOW  = 1.6;
const T_PULSE = 2.4;

// ── Color constants ──────────────────────────────────────────────────────────
const CYAN   = '#22d3ee';
const VIOLET = '#a78bfa';
const GOLD   = '#fbbf24';
const GREEN  = '#4ade80';

const SPOKE_ANGLES = [0, 60, 120, 180, 240, 300];

// Wheel / motor spokes centered at local (0,0)
function Spokes({ color, r }: { color: string; r: number }) {
  return (
    <>
      {SPOKE_ANGLES.map(a => {
        const rad = (a * Math.PI) / 180;
        return (
          <line
            key={a}
            x1={0} y1={0}
            x2={Math.cos(rad) * r}
            y2={Math.sin(rad) * r}
            stroke={color}
            strokeWidth="0.6"
            opacity="0.6"
          />
        );
      })}
      <circle r={r * 0.26} fill={color} opacity="0.5" />
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EVDiagram() {
  const [playing, setPlaying] = useState(true);
  const prefersReduced        = useReducedMotion();
  const on                    = playing && !prefersReduced;

  // Shared transition builders
  const wheelTrans = on
    ? { duration: T_WHEEL, repeat: Infinity, ease: 'linear' as const }
    : { duration: 0 };
  const motorTrans = on
    ? { duration: T_MOTOR, repeat: Infinity, ease: 'linear' as const }
    : { duration: 0 };

  return (
    <div
      className="relative w-full select-none"
      style={{ aspectRatio: '16/10' }}
    >
      {/* ── Base image ── */}
      <img
        src="/ev-diagram.png"
        alt="BrainSpark EV cutaway diagram"
        className="absolute inset-0 w-full h-full object-contain"
        draggable={false}
      />

      {/* ── SVG animation overlay ── */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 160 100"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="ev-gc" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="1.3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="ev-gv" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="1.0" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* ── Battery pack outline & fill glow ── */}
        <motion.rect
          x="32" y="62" width="46" height="8" rx="1.5"
          fill="none" stroke={CYAN} strokeWidth="0.8"
          filter="url(#ev-gc)"
          animate={on ? { opacity: [0.3, 0.8, 0.3] } : { opacity: 0.45 }}
          transition={{ duration: T_PULSE, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.rect
          x="32.5" y="62.5" width="45" height="7" rx="1"
          fill={CYAN}
          animate={on ? { fillOpacity: [0.03, 0.13, 0.03] } : { fillOpacity: 0.07 }}
          transition={{ duration: T_PULSE, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
        />
        {/* battery cell dividers */}
        {[9, 18, 27, 36].map(dx => (
          <line
            key={dx}
            x1={32 + dx} y1="62.5"
            x2={32 + dx} y2="69.5"
            stroke={CYAN} strokeWidth="0.3" opacity="0.35"
          />
        ))}

        {/* ── Electricity flow: Battery → Inverter ── */}
        <motion.path
          d="M 78 66 C 86 60 91 61 96 64"
          fill="none" stroke={CYAN} strokeWidth="0.9" strokeDasharray="2.5 3.5"
          filter="url(#ev-gc)"
          animate={on ? { strokeDashoffset: [12, 0] } : { strokeDashoffset: 0 }}
          transition={{ duration: T_FLOW, repeat: Infinity, ease: 'linear' }}
        />

        {/* ── Electricity flow: Inverter → Motor ── */}
        <motion.path
          d="M 104 63.5 L 110 60.5"
          fill="none" stroke={VIOLET} strokeWidth="0.9" strokeDasharray="1.8 2.5"
          filter="url(#ev-gv)"
          animate={on ? { strokeDashoffset: [8, 0] } : { strokeDashoffset: 0 }}
          transition={{ duration: T_FLOW * 0.55, repeat: Infinity, ease: 'linear' }}
        />

        {/* ── Inverter box ── */}
        <motion.rect
          x="96" y="60" width="8" height="7" rx="1"
          stroke={GOLD} strokeWidth="0.6" fill={GOLD}
          animate={
            on
              ? { fillOpacity: [0.1, 0.28, 0.1], strokeOpacity: [0.5, 1, 0.5] }
              : { fillOpacity: 0.12, strokeOpacity: 0.6 }
          }
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* lightning bolt inside inverter */}
        <path
          d="M 101.5 61.5 L 100 64.5 L 101.8 64.5 L 100.2 66.5"
          fill="none" stroke={GOLD} strokeWidth="0.55" opacity="0.75"
        />

        {/* ── E-Motor (near front axle, right side of car) ── */}
        <g transform="translate(113, 63)">
          {/* housing rings */}
          <circle r="6"   fill="none" stroke={VIOLET} strokeWidth="0.4" opacity="0.2" />
          <circle r="5.2" fill="none" stroke={VIOLET} strokeWidth="0.6" strokeDasharray="0.8 4.2" opacity="0.3" />
          {/* spinning rotor */}
          <motion.g
            animate={on ? { rotate: 360 } : { rotate: 0 }}
            transition={motorTrans}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' } as React.CSSProperties}
          >
            <Spokes color={VIOLET} r={4.2} />
          </motion.g>
          {/* center glow */}
          <motion.circle
            r="1.4" fill={VIOLET}
            animate={on ? { opacity: [0.5, 1, 0.5] } : { opacity: 0.7 }}
            transition={{ duration: T_MOTOR * 2, repeat: Infinity }}
          />
        </g>

        {/* ── Drive shaft: motor hub down to axle level ── */}
        <motion.line
          x1="113" y1="68.5" x2="113" y2="73"
          stroke={GREEN} strokeWidth="1.4" strokeDasharray="1.8 1.8"
          animate={on ? { strokeDashoffset: [7.2, 0] } : { strokeDashoffset: 0 }}
          transition={{ duration: T_SHAFT * 0.55, repeat: Infinity, ease: 'linear' }}
        />

        {/* ── Front wheel (right side of car, ~72% from left) ── */}
        <g transform="translate(115, 73)">
          <circle r="10"  fill="none" stroke={CYAN} strokeWidth="0.4" opacity="0.18" />
          <circle r="9"   fill="none" stroke={CYAN} strokeWidth="0.45" opacity="0.25" />
          <motion.g
            animate={on ? { rotate: 360 } : { rotate: 0 }}
            transition={wheelTrans}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' } as React.CSSProperties}
          >
            <Spokes color={CYAN} r={7} />
          </motion.g>
        </g>

        {/* ── Rear wheel (left side of car, ~25% from left) ── */}
        <g transform="translate(40, 73)">
          <circle r="10"  fill="none" stroke={CYAN} strokeWidth="0.4" opacity="0.18" />
          <circle r="9"   fill="none" stroke={CYAN} strokeWidth="0.45" opacity="0.25" />
          <motion.g
            animate={on ? { rotate: 360 } : { rotate: 0 }}
            transition={wheelTrans}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' } as React.CSSProperties}
          >
            <Spokes color={CYAN} r={7} />
          </motion.g>
        </g>

        {/* ── Tech scan lines ── */}
        {[28, 50, 72].map((y, i) => (
          <motion.line
            key={i}
            x1="8" y1={y} x2="152" y2={y}
            stroke={CYAN} strokeWidth="0.18" strokeDasharray="5 10"
            animate={on ? { opacity: [0.05, 0.16, 0.05] } : { opacity: 0.05 }}
            transition={{ duration: 3.8, repeat: Infinity, delay: i * 1.0, ease: 'easeInOut' }}
          />
        ))}
      </svg>


      {/* ── Play / Pause toggle ── */}
      <motion.button
        onClick={() => setPlaying(v => !v)}
        className="absolute bottom-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center border z-10"
        style={{
          backgroundColor: 'rgba(2,6,23,0.72)',
          borderColor: `${CYAN}40`,
          color: CYAN,
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
        whileHover={{ scale: 1.15, borderColor: CYAN }}
        whileTap={{ scale: 0.88 }}
        title={playing ? 'Pause animations' : 'Resume animations'}
      >
        {playing ? <Pause size={11} /> : <Play size={11} />}
      </motion.button>
    </div>
  );
}
