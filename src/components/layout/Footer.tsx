import { Link } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import { APP_VERSION } from '../../version';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Two footers, on purpose.
 *
 * Signed OUT: the marketing footer — who made this, how to reach them, where
 * to sign in. Signed IN: a one-line status bar. The review found the marketing
 * footer (author bio, "AI-Powered Idea Generation Platform", a Sign In link)
 * rendering under every authenticated page; a workspace ends where the work
 * ends, and a Sign In link inside a signed-in app is a small lie.
 */
export default function Footer() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <StatusBar />;
  return <MarketingFooter />;
}

function StatusBar() {
  return (
    <footer className="border-t border-white/8 bg-navy-950 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-10 flex items-center justify-between gap-4 text-2xs text-slate-500">
        <p className="truncate">
          <span className="text-slate-400">BrainSpark</span> v{APP_VERSION} · math for numbers, AI for judgement
        </p>
        <nav aria-label="Footer" className="flex items-center gap-4 shrink-0">
          <Link to="/help" className="inline-flex items-center gap-1 hover:text-slate-200 transition-colors duration-micro ease-house"><HelpCircle size={11} aria-hidden="true" /> Help</Link>
          <Link to="/legal/privacy" className="hover:text-slate-200 transition-colors duration-micro ease-house">Privacy</Link>
          <Link to="/legal/terms" className="hover:text-slate-200 transition-colors duration-micro ease-house">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}

function MarketingFooter() {
  return (
    <footer className="bg-navy-950 border-t border-white/10 py-10 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid sm:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img src="/brainspark-logo.svg" alt="" aria-hidden="true" className="w-7 h-7" />
              <span className="text-white font-semibold text-sm">Brain<span className="text-gold-400">Spark</span></span>
            </div>
            <p className="text-slate-500 text-xs leading-relaxed">
              AI cost-engineering for automotive.<br />
              Confidential internal tool.
            </p>
          </div>
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Navigation</p>
            <div className="space-y-2">
              {[
                { to: '/', label: 'Home' },
                { to: '/help', label: 'Help Centre' },
                { to: '/auth', label: 'Sign In' },
              ].map(({ to, label }) => (
                <Link key={to} to={to} className="block text-slate-500 hover:text-slate-300 text-xs transition-colors duration-micro ease-house">
                  {label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Contact</p>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-gold-500/20">
                <span className="text-navy-950 font-bold text-xs">AB</span>
              </div>
              <div>
                <p className="text-white text-xs font-semibold">Avinash Bhosale</p>
                <p className="text-slate-500 text-xs">Tool Author & Designer</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-slate-500 text-xs">
              <Link to="/legal/privacy" className="hover:text-gold-400 transition-colors duration-micro ease-house">Privacy</Link>
              <span aria-hidden="true">·</span>
              <Link to="/legal/terms" className="hover:text-gold-400 transition-colors duration-micro ease-house">Terms</Link>
            </div>
          </div>
        </div>
        <div className="pt-6 border-t border-white/8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} BrainSpark — All rights reserved</p>
          <p>Designed &amp; created by <span className="text-gold-500/80 font-medium">Avinash Bhosale</span></p>
          <p>v{APP_VERSION}</p>
        </div>
      </div>
    </footer>
  );
}
