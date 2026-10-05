import { useSyncExternalStore } from 'react';
import type { ProgressEvent, RunPhase } from '../services/claude-service';
import type { RunStep } from '../components/analyze/RunPanel';

/**
 * ONE AI RUN AT A TIME, OWNED BY THE APP — NOT BY THE PAGE THAT STARTED IT.
 *
 * A generation runs for two to six minutes. It used to live inside the page
 * component, so navigating anywhere unmounted it and aborted the run (by
 * design: "leaving the page stops the bill"). The cost was worse than the
 * saving — an engineer who glanced at the marketplace mid-run threw the run
 * away and paid for a second one. The products our users know (ChatGPT Deep
 * Research, Copilot Workspace) keep the job going and say when it is done.
 *
 * So the run lives here. Pages start it and render it; the header shows a pill
 * while it runs ("Analyze · Reason · 2:31", with Cancel) and turns it into
 * "Results ready" when it finishes. Closing the TAB still stops the run and
 * the bill: the request dies with the document and the server aborts its
 * upstream call on that close. Every field shown is driven by a server event,
 * as before — nothing here estimates progress.
 */
export type RunKind = 'analyze' | 'prism' | 'prism-assembly';
export type RunStatus = 'running' | 'done' | 'error' | 'cancelled';

export interface RunInfo {
  id: number;
  kind: RunKind;
  /** e.g. "Analyze · Body-in-White" — shown in the header pill. */
  label: string;
  /** The page that started the run; the pill links back to it while running. */
  returnTo: string;
  startedAt: number;
  finishedAt?: number;
  phase: RunPhase;
  outTokens: number;
  steps: RunStep[];
  status: RunStatus;
  error?: string;
  /** Where to open the finished result. */
  openRoute?: string;
  cancelling: boolean;
  enableSearch: boolean;
  /** The originating page has taken the result (opened it); the pill clears. */
  consumed: boolean;
}

export interface RunContext {
  signal: AbortSignal;
  onProgress: (ev: ProgressEvent) => void;
}

/** Event types that imply a rail phase when the server did not name one. */
const PHASE_OF: Partial<Record<ProgressEvent['type'], RunPhase>> = { connecting: 'connect', searching: 'search', search_done: 'search', synthesizing: 'verify' };

let current: RunInfo | null = null;
let controller: AbortController | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const set = (patch: Partial<RunInfo>) => { if (current) { current = { ...current, ...patch }; emit(); } };

/** The same step logic the Analyze panel used, now shared by every run. */
export function reduceSteps(prev: RunStep[], event: ProgressEvent): RunStep[] {
  const markActiveDone = () => prev.map(s => s.status === 'active' ? { ...s, status: 'done' as const } : s);
  switch (event.type) {
    case 'connecting':
      return [{ id: 'connect', label: event.message || 'Connecting to the model…', status: 'active' }];
    case 'searching':
      return [...markActiveDone(), { id: `s-${event.searchNumber}`, label: `Searching: ${event.query?.slice(0, 55)}${(event.query?.length || 0) > 55 ? '…' : ''}`, status: 'active', detail: event.purpose?.replace('_', ' ') }];
    case 'search_done':
      return prev.map(s => s.id === `s-${event.searchNumber}` ? { ...s, status: 'done', detail: `${event.resultCount} result${event.resultCount !== 1 ? 's' : ''} found` } : s);
    case 'synthesizing':
      return [...markActiveDone(), { id: `synth-${prev.length}`, label: event.message || 'Checking and ranking the ideas…', status: 'active' }];
    case 'progress': {
      if (!event.message) return prev;
      // Lens-level and stage notes: a NEW line when it reports a finished unit
      // ("Lens …: 7 candidate ideas"), otherwise a detail on the running step.
      if (/^Lens\b|failed|candidate ideas/i.test(event.message)) return [...prev, { id: `p-${prev.length}`, label: event.message, status: /failed/i.test(event.message) ? 'error' : 'done' }];
      if (!prev.length) return [{ id: 'p-0', label: event.message, status: 'active' }];
      return prev.map((s, i) => i === prev.length - 1 && s.status === 'active' ? { ...s, detail: event.message } : s);
    }
    default:
      return prev;
  }
}

export function getRun(): RunInfo | null { return current; }

export function isRunning(): boolean { return current?.status === 'running'; }

/**
 * Start a run. Returns false (and starts nothing) if one is already running —
 * the caller says so; two concurrent generations would double the bill.
 * `exec` does the work and returns the route that shows the result.
 */
export function startRun(opts: { kind: RunKind; label: string; returnTo: string; enableSearch?: boolean; exec: (ctx: RunContext) => Promise<string | void> }): boolean {
  if (isRunning()) return false;
  controller = new AbortController();
  const id = ++seq;
  current = { id, kind: opts.kind, label: opts.label, returnTo: opts.returnTo, startedAt: Date.now(), phase: 'connect', outTokens: 0, steps: [], status: 'running', cancelling: false, enableSearch: !!opts.enableSearch, consumed: false };
  emit();
  const onProgress = (ev: ProgressEvent) => {
    if (!current || current.id !== id) return;
    const phase = ev.phase ?? PHASE_OF[ev.type];
    set({ phase: phase ?? current.phase, outTokens: ev.outTokens ?? current.outTokens, steps: reduceSteps(current.steps, ev) });
  };
  opts.exec({ signal: controller.signal, onProgress })
    .then(route => { if (current?.id === id) set({ status: 'done', finishedAt: Date.now(), openRoute: route || undefined, cancelling: false }); })
    .catch((err: unknown) => {
      if (current?.id !== id) return;
      if (err instanceof DOMException && err.name === 'AbortError') { set({ status: 'cancelled', finishedAt: Date.now(), cancelling: false }); return; }
      const message = err instanceof Error ? err.message : String(err);
      const unreachable = err instanceof TypeError || message.includes('ECONNREFUSED');
      set({ status: 'error', finishedAt: Date.now(), cancelling: false, error: unreachable ? 'Cannot reach the BrainSpark server. Start it with start-macos.command (or "npm run dev"), then retry.' : message });
    })
    .finally(() => { if (current?.id === id) controller = null; });
  return true;
}

export function cancelRun() {
  if (!current || current.status !== 'running' || !controller) return;
  set({ cancelling: true });
  controller.abort();
}

/** The result was opened (or the error/cancel acknowledged): clear the pill. */
export function consumeRun() {
  if (current && current.status !== 'running') { current = null; emit(); }
}

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

export function useRun(): RunInfo | null {
  return useSyncExternalStore(subscribe, getRun, getRun);
}
