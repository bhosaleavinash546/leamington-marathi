import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useDfmMotion } from './motion';

export interface RailStep {
  id: string;
  label: string;
  /** What the user still has to do, shown only while this step is active. */
  hint?: string;
  done: boolean;
}

/**
 * THE GUIDED FLOW — Part → Process → Analyse → Results.
 *
 * This page asks for four things in order and used to say so only by the
 * position of two numbered badges buried in a long card. A part with no
 * material chosen ran a speculative sweep of every rule family, and nothing
 * on screen had said that a choice was outstanding.
 *
 * The rail states it. Every step's `done` is DERIVED FROM REAL STATE — a file
 * actually chosen, a material and process actually selected, an analysis that
 * actually returned — so the tick is a fact, never an encouragement. The
 * travelling indicator is a shared-layout animation: one element that moves
 * between steps, which is what makes the progression legible rather than four
 * independent highlights blinking on and off.
 */
export default function StepRail({
  steps,
  activeId,
  onJump,
}: {
  steps: RailStep[];
  activeId: string;
  onJump?: (id: string) => void;
}) {
  const m = useDfmMotion();

  return (
    <nav aria-label="Analysis progress" className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
      {steps.map((s, i) => {
        const active = s.id === activeId;
        const state = s.done ? 'done' : active ? 'active' : 'todo';
        return (
          <div key={s.id} className="flex items-center gap-1 sm:gap-2 shrink-0">
            {i > 0 && (
              <div className="w-4 sm:w-8 h-px bg-white/10" aria-hidden="true" />
            )}
            <button
              type="button"
              onClick={() => onJump?.(s.id)}
              aria-current={active ? 'step' : undefined}
              className="relative flex items-center gap-2 px-2 py-1.5 rounded-lg group focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/60"
            >
              {active && (
                <motion.span
                  layoutId="dfm-step-active"
                  transition={m.layout}
                  className="absolute inset-0 rounded-lg bg-gold-500/[0.09] ring-1 ring-gold-500/25"
                  aria-hidden="true"
                />
              )}
              <span className="dfm-datum relative" data-state={state}>
                {s.done ? <Check size={12} aria-hidden="true" /> : i + 1}
              </span>
              <span className="relative text-left">
                <span className={`block text-xs font-semibold whitespace-nowrap ${
                  active ? 'text-white' : s.done ? 'text-slate-300' : 'text-slate-500'
                }`}>{s.label}</span>
                {active && s.hint && (
                  <span className="hidden sm:block text-[10px] text-gold-400/80 whitespace-nowrap">{s.hint}</span>
                )}
              </span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}
