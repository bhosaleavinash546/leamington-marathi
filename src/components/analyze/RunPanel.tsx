import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useHouseMotion } from '../../lib/motion';
import type { RunPhase } from '../../services/claude-service';
import ButtonSpinner from '../ui/ButtonSpinner';

export interface RunStep {
  id: string;
  label: string;
  detail?: string;
  status: 'pending' | 'active' | 'done' | 'error';
}

/**
 * THE LIVE RUN PANEL.
 *
 * A generation on the flagship model runs for minutes, and the old panel was
 * a list of one-line events under a spinner, so for most of that time it
 * showed "Connecting…" while the model was three minutes into reasoning. The
 * September 2026 review watched a user reload the page at 4 min 20 s — which
 * threw away the run and started another bill.
 *
 * Every element here is DRIVEN BY AN EVENT THE SERVER EMITTED, in keeping
 * with motion.ts rule 1: the rail advances when the stream says the phase
 * changed, the token figure is the server's own estimate and is labelled as
 * an estimate, and the clock is the only thing that moves on its own —
 * because time genuinely passes. Nothing is a progress bar that guesses.
 *
 * Cancel is real: it closes the response, and the server aborts its upstream
 * model call on that close (see /api/analyze), so the button stops the bill.
 */
const RAIL: Array<{ id: RunPhase; label: string; hint: string }> = [
  { id: 'connect', label: 'Connect', hint: 'Handshake with the model and the knowledge pack' },
  { id: 'search',  label: 'Search',  hint: 'Live web searches the model asked for' },
  { id: 'reason',  label: 'Reason',  hint: 'Extended thinking about the part, the levers and the trade-offs' },
  { id: 'write',   label: 'Write',   hint: 'Ideas streaming back as structured output' },
  { id: 'verify',  label: 'Verify',  hint: 'Critic, de-duplication, engine re-costing, ranking' },
];

function fmtClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function RunPanel({
  steps, phase, startedAt, outTokens, enableSearch, onCancel, cancelling,
}: {
  steps: RunStep[];
  phase: RunPhase;
  startedAt: number;
  outTokens: number;
  enableSearch: boolean;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const m = useHouseMotion();
  const rail = useMemo(() => RAIL.filter(r => enableSearch || r.id !== 'search'), [enableSearch]);
  const idx = Math.max(0, rail.findIndex(r => r.id === phase));
  const fill = rail.length > 1 ? idx / (rail.length - 1) : 0;

  // The clock is the one self-driven element: elapsed time is a fact.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // The panel mounts below the Generate button, often under the fold on a
  // laptop: bring it into view once, so the first thing seen after the click
  // is the rail moving, not a spinner in a button.
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => { rootRef.current?.scrollIntoView({ block: 'nearest', behavior: m.reduced ? 'auto' : 'smooth' }); }, [m.reduced]);

  // Newest event stays in view.
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [steps.length, steps[steps.length - 1]?.detail]);

  const active = rail[idx];

  return (
    <motion.section
      ref={rootRef}
      variants={m.panel} initial="hidden" animate="show"
      aria-label="Analysis in progress"
      className="rounded-2xl bg-navy-800 border border-white/10 overflow-hidden"
    >
      {/* Phase rail. The fill is a registered custom property (@property in
          index.css) so the track's width interpolates between phases instead
          of jumping — a plain custom property cannot animate. */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="run-dot" aria-hidden="true" />
            <span role="status" aria-live="polite" className="text-gold-400 font-medium text-sm truncate">
              {active.label}
              <span className="text-slate-500 font-normal"> — {active.hint}</span>
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-mono text-sm text-slate-300" aria-label="Elapsed time">{fmtClock(now - startedAt)}</span>
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              className="inline-flex items-center gap-1.5 min-h-[32px] px-3 rounded-lg text-xs font-medium text-slate-300 border border-white/10 hover:border-danger-500/40 hover:text-danger-400 transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/60"
              title="Stop the run. The server aborts the model call, so only the tokens already streamed are billed."
            >
              {cancelling ? <ButtonSpinner size={12} /> : <X size={13} />}
              {cancelling ? 'Stopping…' : 'Cancel run'}
            </button>
          </div>
        </div>

        <div className="run-rail" style={{ ['--run-fill' as string]: fill }} aria-hidden="true">
          <div className="run-rail-fill" />
        </div>
        <ol className="mt-2 grid text-2xs uppercase tracking-wider" style={{ gridTemplateColumns: `repeat(${rail.length}, minmax(0, 1fr))` }}>
          {rail.map((r, i) => (
            <li
              key={r.id}
              aria-current={i === idx ? 'step' : undefined}
              className={`${i === 0 ? 'text-left' : i === rail.length - 1 ? 'text-right' : 'text-center'} ${i < idx ? 'text-slate-400' : i === idx ? 'text-gold-400' : 'text-slate-500'}`}
            >
              {r.label}
            </li>
          ))}
        </ol>
      </div>

      {/* Event log — one row per event the server sent, in order. */}
      <div ref={logRef} className="border-t border-white/10 px-4 py-3 max-h-40 overflow-y-auto space-y-1.5">
        {steps.length === 0 && (
          <div className="text-xs text-slate-500">Waiting for the first event from the server…</div>
        )}
        {steps.map(step => (
          <div key={step.id} className="run-step flex items-start gap-2 text-xs">
            <span className={`flex-shrink-0 mt-0.5 font-mono ${
              step.status === 'done' ? 'text-success-400' :
              step.status === 'active' ? 'text-gold-400' :
              step.status === 'error' ? 'text-danger-400' : 'text-slate-500'
            }`} aria-hidden="true">
              {step.status === 'done' ? '✓' : step.status === 'active' ? '›' : step.status === 'error' ? '✕' : '○'}
            </span>
            <div className="flex-1 min-w-0">
              <span className={step.status === 'done' ? 'text-slate-400' : step.status === 'active' ? 'text-white' : 'text-slate-500'}>{step.label}</span>
              {step.detail && <span className="text-slate-500 ml-1">({step.detail})</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 px-4 py-2 flex items-center justify-between gap-3 text-2xs text-slate-500">
        <span>
          {outTokens > 0
            ? <><span className="font-mono text-slate-300">~{outTokens.toLocaleString()}</span> tokens written (estimate from streamed characters)</>
            : 'Token count appears once output starts streaming.'}
        </span>
        <span className="hidden sm:inline">Leaving this page cancels the run.</span>
      </div>
    </motion.section>
  );
}
