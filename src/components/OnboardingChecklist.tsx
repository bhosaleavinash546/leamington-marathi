import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X, CheckCircle2, Circle, Sparkles, ChevronUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// First-run guided checklist: three concrete actions that demonstrate the core
// loop (generate ideas → should-cost a part → teach a real quote). Progress is
// detected from the actions themselves (localStorage flags set by the pages),
// dismissible, and never shown again once completed or dismissed.

const KEY = 'brainspark_onboarding_v1';

interface Step { id: string; title: string; desc: string; to: string }
const STEPS: Step[] = [
  { id: 'generate', title: 'Generate your first ideas', desc: 'Pick a commodity and let the AI propose cost-reduction ideas with OEM benchmarks.', to: '/analyze' },
  { id: 'shouldcost', title: 'Should-cost a part', desc: 'Deterministic bottom-up price — material, cycle, tooling, overhead. No AI guesswork.', to: '/should-cost' },
  { id: 'teach', title: 'Teach the engine one real quote', desc: 'Enter a supplier price you know — every future estimate calibrates to your reality.', to: '/should-cost' },
];

interface OnbState { dismissed: boolean; done: Record<string, boolean> }
function load(): OnbState {
  try { return { dismissed: false, done: {}, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { dismissed: false, done: {} }; }
}
function save(s: OnbState) { localStorage.setItem(KEY, JSON.stringify(s)); }

/** Pages call this when the user completes a step (fire-and-forget). */
export function markOnboardingStep(id: 'generate' | 'shouldcost' | 'teach') {
  const s = load();
  if (s.done[id]) return;
  s.done[id] = true;
  save(s);
  window.dispatchEvent(new Event('onboarding-changed'));
}

/** Shared state for the two surfaces (header chip on desktop, pill on phones). */
function useOnboarding() {
  const { token } = useAuth();
  const location = useLocation();
  const [state, setState] = useState<OnbState>(load);
  useEffect(() => {
    const refresh = () => setState(load());
    window.addEventListener('onboarding-changed', refresh);
    return () => window.removeEventListener('onboarding-changed', refresh);
  }, []);
  const doneCount = STEPS.filter(s => state.done[s.id]).length;
  const allDone = doneCount === STEPS.length;
  const onHiddenRoute = ['/auth', '/', '/help', '/dashboard'].includes(location.pathname) || location.pathname.startsWith('/shared');
  // Only for signed-in users, on tool pages, until dismissed or completed.
  // Hidden on /dashboard too — its first-run state renders its own checklist.
  const visible = !!token && !state.dismissed && !allDone && !onHiddenRoute;
  const dismiss = () => { const s = { ...state, dismissed: true }; save(s); setState(s); };
  return { state, doneCount, visible, dismiss };
}

function ChecklistCard({ state, doneCount, onCollapse, onDismiss, className = '' }: { state: OnbState; doneCount: number; onCollapse: () => void; onDismiss: () => void; className?: string }) {
  return (
    <div className={`w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-gold-500/25 bg-navy-900/95 backdrop-blur shadow-popover p-4 ${className}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-gold-400" aria-hidden="true" />
          <span className="text-white text-sm font-semibold">Get started ({doneCount}/{STEPS.length})</span>
        </div>
        <div className="flex items-center gap-0.5 -mr-1.5 -mt-1.5">
          <button type="button" aria-label="Collapse" onClick={onCollapse} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-tint-strong transition-ui duration-micro ease-house">
            <ChevronUp size={15} className="rotate-180" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Dismiss onboarding" onClick={onDismiss} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-tint-strong transition-ui duration-micro ease-house">
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      <ol className="space-y-1">
        {STEPS.map(step => {
          const done = !!state.done[step.id];
          return (
            <li key={step.id}>
              <Link to={step.to} onClick={onCollapse} className={`flex items-start gap-2.5 rounded-xl p-2 min-h-[44px] transition-ui duration-micro ease-house ${done ? 'opacity-60' : 'hover:bg-white/5'}`}>
                {done
                  ? <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" aria-hidden="true" />
                  : <Circle size={16} className="text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />}
                <span>
                  <span className={`block text-xs font-medium ${done ? 'text-slate-400 line-through' : 'text-white'}`}>{step.title}</span>
                  {!done && <span className="block text-2xs text-slate-400 leading-snug mt-0.5">{step.desc}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Pill({ doneCount, onClick, className = '' }: { doneCount: number; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={false}
      className={`inline-flex items-center gap-2 min-h-[40px] pl-3 pr-2.5 rounded-full border border-gold-500/25 bg-navy-900/95 backdrop-blur text-sm font-semibold text-white transition-ui duration-micro ease-house hover:border-gold-500/45 hover:bg-navy-800 ${className}`}
    >
      <Sparkles size={14} className="text-gold-400" aria-hidden="true" />
      Get started
      <span className="text-2xs font-bold text-navy-950 bg-gold-400 rounded-full px-1.5 py-0.5 leading-none">{doneCount}/{STEPS.length}</span>
      <ChevronUp size={14} className="text-slate-400" aria-hidden="true" />
    </button>
  );
}

/**
 * DESKTOP: a chip in the header's right cluster that opens the checklist as a
 * popover under it. The review measured the old fixed card colliding with the
 * chat button; a header chip can never overlap page content.
 */
export function OnboardingHeaderChip() {
  const { state, doneCount, visible, dismiss } = useOnboarding();
  const [expanded, setExpanded] = useState(false);
  if (!visible) return null;
  return (
    <div className="relative hidden lg:block">
      <Pill doneCount={doneCount} onClick={() => setExpanded(v => !v)} className="min-h-[36px]" />
      {expanded && (
        <aside aria-label="Getting started" className="absolute right-0 top-full mt-2 z-popover">
          <ChecklistCard state={state} doneCount={doneCount} onCollapse={() => setExpanded(false)} onDismiss={dismiss} />
        </aside>
      )}
    </div>
  );
}

/**
 * PHONES: a pill docked bottom-left, clear of the tab bar (3.5 rem + safe
 * area) and of the chat button (bottom-right). Tapping it opens the card in
 * place. Hidden on desktop, where the header chip takes over.
 */
export default function OnboardingChecklist() {
  const { state, doneCount, visible, dismiss } = useOnboarding();
  const [expanded, setExpanded] = useState(false);
  if (!visible) return null;
  const dock = 'fixed z-popover left-4 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+0.75rem)] lg:hidden';
  return (
    <aside aria-label="Getting started" className={dock}>
      {expanded
        ? <ChecklistCard state={state} doneCount={doneCount} onCollapse={() => setExpanded(false)} onDismiss={dismiss} className="!max-w-[calc(100vw-6rem)]" />
        : <Pill doneCount={doneCount} onClick={() => setExpanded(true)} className="shadow-popover" />}
    </aside>
  );
}
