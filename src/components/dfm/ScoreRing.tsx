import { useReducedMotion } from 'framer-motion';
import { scoreTone, TONE_TEXT, TONE_LABEL } from '../../lib/motion';

/**
 * THE SCORE, AS A SWEPT GAUGE.
 *
 * The page used to print "Score 62/100" in twelve-pixel text between two other
 * figures, which is the least a number can be shown. A dial reads at a glance
 * from across a review table — and the sweep is not decoration: the arc is
 * driven by CSS variables computed from the measured score, so it can only
 * ever land on the real value.
 *
 * A NULL score renders as an explicitly empty dial with "Not scored" under it.
 * The engine returns null when nothing could be evaluated, and a zero-filled
 * ring would read as a part that failed everything rather than one nobody
 * measured — the same three-state discipline the rules themselves keep.
 */
export default function ScoreRing({
  score,
  size = 92,
  label = 'DFM score',
  sublabel,
}: {
  score: number | null | undefined;
  size?: number;
  label?: string;
  sublabel?: string;
}) {
  const reduced = useReducedMotion();
  const tone = scoreTone(score);
  const has = tone !== 'none';
  const value = has ? Math.max(0, Math.min(100, Number(score))) : 0;

  const stroke = 6;
  const r = (size - stroke) / 2 - 1;
  const circumference = 2 * Math.PI * r;
  // The gauge is a 270° dial (a quarter left open at the bottom, like an
  // instrument face) so the reader can tell full-scale from nearly-full.
  const arc = 0.75;
  const total = circumference * arc;
  const offset = total * (1 - value / 100);

  const strokeClass =
    tone === 'good' ? 'stroke-emerald-400'
      : tone === 'watch' ? 'stroke-amber-400'
        : tone === 'poor' ? 'stroke-red-400' : 'stroke-slate-700';

  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true"
          /* Rotated so the dial opens at the bottom and fills clockwise. */
          style={{ transform: 'rotate(135deg)' }}>
          <circle
            cx={size / 2} cy={size / 2} r={r}
            className="dfm-gauge-track" fill="none" strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${total} ${circumference}`}
          />
          {has && (
            <circle
              // Re-keyed on the value so a fresh analysis re-sweeps rather
              // than silently jumping to the new number.
              key={value}
              cx={size / 2} cy={size / 2} r={r}
              className={`${strokeClass} ${reduced ? '' : 'dfm-gauge-value'}`}
              fill="none" strokeWidth={stroke} strokeLinecap="round"
              style={{
                strokeDasharray: `${total} ${circumference}`,
                strokeDashoffset: offset,
                // Consumed by the keyframes; a CSS animation outranks these
                // inline values while it plays and lands on exactly them.
                ['--dash-total' as string]: `${total}`,
                ['--dash-offset' as string]: `${offset}`,
              }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {has ? (
            <>
              <span className={`dfm-num font-black leading-none ${TONE_TEXT[tone]}`}
                style={{ fontSize: size * 0.30 }}>{Math.round(value)}</span>
              <span className="dfm-label text-slate-500 mt-0.5" style={{ fontSize: 8 }}>/ 100</span>
            </>
          ) : (
            <span className="text-slate-500 text-lg leading-none" aria-hidden="true">—</span>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <p className="dfm-label text-slate-500">{label}</p>
        <p className={`text-sm font-semibold ${TONE_TEXT[tone]}`}>{TONE_LABEL[tone]}</p>
        {sublabel && <p className="text-[11px] text-slate-500 mt-0.5">{sublabel}</p>}
      </div>
    </div>
  );
}
