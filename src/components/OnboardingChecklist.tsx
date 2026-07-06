import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X, CheckCircle2, Circle, Sparkles } from 'lucide-react';
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

export default function OnboardingChecklist() {
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
  // Only for signed-in users, on main pages, until dismissed/completed.
  if (!token || state.dismissed || allDone) return null;
  if (['/auth', '/', '/help'].includes(location.pathname) || location.pathname.startsWith('/shared')) return null;

  return (
    <div className="fixed bottom-20 right-4 lg:bottom-6 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-gold-500/25 bg-navy-900/95 backdrop-blur shadow-2xl p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-gold-400" />
          <span className="text-white text-sm font-semibold">Get started ({doneCount}/{STEPS.length})</span>
        </div>
        <button
          aria-label="Dismiss onboarding"
          onClick={() => { const s = { ...state, dismissed: true }; save(s); setState(s); }}
          className="text-slate-500 hover:text-slate-300"
        >
          <X size={15} />
        </button>
      </div>
      <ol className="space-y-2">
        {STEPS.map(step => {
          const done = !!state.done[step.id];
          return (
            <li key={step.id}>
              <Link to={step.to} className={`flex items-start gap-2.5 rounded-xl p-2 -m-1 transition ${done ? 'opacity-60' : 'hover:bg-white/5'}`}>
                {done
                  ? <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                  : <Circle size={16} className="text-slate-600 mt-0.5 shrink-0" />}
                <span>
                  <span className={`block text-xs font-medium ${done ? 'text-slate-400 line-through' : 'text-white'}`}>{step.title}</span>
                  {!done && <span className="block text-[11px] text-slate-500 leading-snug mt-0.5">{step.desc}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
