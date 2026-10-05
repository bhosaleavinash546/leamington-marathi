import { useId } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useHouseMotion } from '../../lib/motion';

export interface StepperStep {
  id: string;
  label: string;
  /** What the user still has to do, shown only while this step is active. */
  hint?: string;
  done: boolean;
}

/**
 * ONE STEPPER FOR EVERY GUIDED FLOW — Analyze, Prism, DFM Studio.
 *
 * The October 2026 review counted three: Analyze's coloured pills (gold
 * current, green done, grey to come), and the numbered datum rail Prism and
 * DFM shared from components/dfm. Three languages for "you are on step 2 of
 * 4". This is the rail, promoted and made theme-safe (tokens only, no white
 * alpha, no glow), so the flows read as one product.
 *
 * Every step's `done` is DERIVED FROM REAL STATE by the caller — a file
 * actually chosen, an analysis that actually returned — so a tick is a fact,
 * never encouragement. The active highlight is one shared-layout element that
 * travels between steps; `layoutId` is per instance so two steppers on one
 * screen never fight over it.
 */
export default function Stepper({
  steps,
  activeId,
  onJump,
  canJump,
  label = 'Progress',
  className = '',
}: {
  steps: StepperStep[];
  activeId: string;
  onJump?: (id: string) => void;
  /** Return false to make a step inert (e.g. a later wizard step not reached yet). */
  canJump?: (id: string) => boolean;
  /** Accessible name of the nav landmark. */
  label?: string;
  className?: string;
}) {
  const m = useHouseMotion();
  const layoutId = `stepper-${useId()}`;

  return (
    <nav aria-label={label} className={`flex items-center gap-1 sm:gap-2 overflow-x-auto [scrollbar-width:none] ${className}`}>
      {steps.map((s, i) => {
        const active = s.id === activeId;
        const state = s.done ? 'done' : active ? 'active' : 'todo';
        const jumpable = !!onJump && (canJump ? canJump(s.id) : true);
        return (
          <div key={s.id} className="flex items-center gap-1 sm:gap-2 shrink-0">
            {i > 0 && <div className={`w-4 sm:w-8 h-px ${steps[i - 1].done ? 'bg-success-500/40' : 'bg-tint-strong'}`} aria-hidden="true" />}
            <button
              type="button"
              onClick={() => jumpable && onJump?.(s.id)}
              disabled={!jumpable && !active}
              aria-current={active ? 'step' : undefined}
              className="relative flex items-center gap-2 min-h-[36px] px-2 py-1.5 rounded-lg disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/60"
            >
              {active && (
                <motion.span layoutId={layoutId} transition={m.layout}
                  className="absolute inset-0 rounded-lg bg-gold-500/10 ring-1 ring-gold-500/25" aria-hidden="true" />
              )}
              <span data-state={state}
                className={`relative inline-flex w-6 h-6 items-center justify-center rounded-md border text-2xs font-bold transition-colors ${
                  state === 'done' ? 'border-success-500/50 bg-success-500/15 text-success-400'
                  : state === 'active' ? 'border-gold-500/60 bg-gold-500/15 text-gold-400'
                  : 'border-hairline bg-tint text-slate-400'}`}>
                {s.done ? <Check size={12} aria-hidden="true" /> : i + 1}
              </span>
              <span className="relative text-left">
                <span className={`block text-xs font-semibold whitespace-nowrap ${active ? 'text-white' : s.done ? 'text-slate-300' : 'text-slate-500'}`}>{s.label}</span>
                {active && s.hint && <span className="hidden sm:block text-2xs text-gold-400 whitespace-nowrap">{s.hint}</span>}
              </span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}
