import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Search, Calculator, Store, Map, GitMerge, TrendingUp } from 'lucide-react';

const STORAGE_KEY = 'brainspark_onboarded_v1';

const FEATURES = [
  { to: '/analyze',      icon: Search,     title: 'Analyze a Part',   desc: 'Generate cost-reduction ideas with the Chief Engineer AI' },
  { to: '/should-cost',  icon: Calculator, title: 'Should-Cost',      desc: 'Deterministic bottom-up part cost + P10/P50/P90' },
  { to: '/marketplace',  icon: Store,      title: 'Marketplace',      desc: '1,250+ curated ideas — filter by commodity & powertrain' },
  { to: '/vave-tracker', icon: Map,        title: 'VAVE Tracker',     desc: 'Track ideas through 6 delivery stages' },
  { to: '/pipeline',     icon: GitMerge,   title: 'Pipeline',         desc: 'G0–G3 business cases with ROI / IRR / payback' },
  { to: '/trends',       icon: TrendingUp, title: 'Trends',           desc: '13-domain knowledge base + live commodity prices' },
];

/**
 * First-run feature banner — surfaces the main capabilities so new users aren't
 * dropped in cold. Dismissed permanently via localStorage. Renders nothing once
 * dismissed.
 */
export default function OnboardingBanner() {
  const [show, setShow] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== '1'; } catch { return true; }
  });

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
    setShow(false);
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden mb-6"
        >
          <div className="relative bg-gradient-to-br from-navy-900 to-navy-800 border border-gold-500/20 rounded-2xl p-5">
            <button
              onClick={dismiss}
              aria-label="Dismiss welcome"
              className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60"
            >
              <X size={16} />
            </button>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={16} className="text-gold-400" />
              <h2 className="text-white font-bold">Welcome to BrainSpark</h2>
            </div>
            <p className="text-slate-400 text-sm mb-4">Your AI cost-engineering workspace. Here's where to start:</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {FEATURES.map(({ to, icon: Icon, title, desc }) => (
                <Link
                  key={to}
                  to={to}
                  className="group flex items-start gap-3 p-3 rounded-xl bg-white/4 border border-white/8 hover:border-gold-500/30 hover:bg-white/6 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/50"
                >
                  <div className="w-8 h-8 rounded-lg bg-gold-500/10 flex items-center justify-center flex-shrink-0">
                    <Icon size={15} className="text-gold-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-semibold group-hover:text-gold-300 transition-colors">{title}</p>
                    <p className="text-slate-500 text-xs leading-snug">{desc}</p>
                  </div>
                </Link>
              ))}
            </div>
            <button
              onClick={dismiss}
              className="mt-4 text-slate-500 hover:text-slate-300 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/50 rounded"
            >
              Got it — don't show again
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
