import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { useRun, cancelRun, consumeRun } from '../../lib/run-store';
import { toast } from '../../hooks/useToast';

const PHASE_LABEL: Record<string, string> = { connect: 'Connecting', search: 'Searching', reason: 'Reasoning', write: 'Writing', verify: 'Checking' };
const clock = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/**
 * The header pill for an AI run that is not on screen.
 *
 * While it runs: what is running, the stage the server last reported and the
 * elapsed clock — click to go back to it, × to cancel. When it finishes: a
 * "Results ready" pill (and a toast, and a ✓ in the tab title, and a system
 * notification if the user has already allowed them) — click to open. On the
 * page that owns the run the page itself shows the run, so the pill hides.
 */
export default function RunIndicator() {
  const run = useRun();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());
  const running = run?.status === 'running';
  useEffect(() => { if (!running) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [running]);

  const onOwnPage = !!run && pathname === run.returnTo;

  // Announce a finish that happened elsewhere, once.
  useEffect(() => {
    if (!run || run.status === 'running' || onOwnPage) return;
    if (run.status === 'done') {
      toast(`${run.label} is ready — open it from the header.`, 'success');
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) new Notification('BrainSpark — results ready', { body: run.label });
      } catch { /* notifications are a courtesy */ }
    } else if (run.status === 'error') {
      toast(`${run.label} failed: ${run.error}`, 'error');
    } else if (run.status === 'cancelled') {
      consumeRun();
    }
  }, [run?.status]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!run || onOwnPage) return null;
  if (run.status === 'running') {
    return (
      <div className="flex items-center rounded-full border border-gold-500/30 bg-gold-500/10 pl-1 pr-1 h-9" role="status" aria-live="polite">
        <button type="button" onClick={() => navigate(run.returnTo)} className="flex items-center gap-2 pl-2 pr-2 h-8 rounded-full text-sm text-gold-400 hover:bg-gold-500/10 transition-colors" title="Go back to the running analysis">
          <span className="run-dot" aria-hidden="true" />
          <span className="hidden md:inline font-medium max-w-[180px] truncate">{run.label}</span>
          <span className="text-xs text-slate-400">{PHASE_LABEL[run.phase] ?? 'Running'}</span>
          <span className="font-mono text-xs text-slate-300">{clock(now - run.startedAt)}</span>
        </button>
        <button type="button" onClick={cancelRun} disabled={run.cancelling} aria-label="Cancel the running analysis" title="Cancel — the server stops the model call"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-danger-400 hover:bg-tint transition-colors disabled:opacity-50">
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    );
  }
  if (run.status === 'done' && run.openRoute) {
    const route = run.openRoute;
    return (
      <button type="button" onClick={() => { const id = run.id; consumeRun(); navigate(route, { state: { fromRun: id } }); }}
        className="inline-flex items-center gap-2 h-9 px-3 rounded-full bg-gold-500 hover:bg-gold-400 text-navy-950 text-sm font-semibold transition-colors">
        <CheckCircle2 size={15} aria-hidden="true" /> <span className="hidden sm:inline">Results ready</span><span className="sm:hidden">Ready</span>
      </button>
    );
  }
  if (run.status === 'error') {
    return (
      <button type="button" onClick={() => navigate(run.returnTo)}
        className="inline-flex items-center gap-2 h-9 px-3 rounded-full border border-danger-500/30 bg-danger-500/10 text-danger-400 text-sm font-medium transition-colors" title={run.error}>
        <AlertTriangle size={15} aria-hidden="true" /> <span className="hidden sm:inline">Run failed</span>
      </button>
    );
  }
  return null;
}
