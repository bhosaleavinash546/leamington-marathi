import { Link } from 'react-router-dom';
import { Mail, HelpCircle, ExternalLink } from 'lucide-react';
import { APP_VERSION } from '../../version';



export default function Footer() {
  return (
    <footer className="bg-navy-950 border-t border-white/10 py-10 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="grid sm:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img src="/brainspark-logo.svg" alt="BrainSpark" className="w-7 h-7" />
              <span className="text-white font-semibold text-sm">Brain<span className="text-gold-400">Spark</span></span>
              <span className="px-1.5 py-0.5 rounded bg-gold-500/15 border border-gold-500/25 text-gold-400 text-[10px] font-semibold">
                v{APP_VERSION}
              </span>
            </div>
            <p className="text-slate-500 text-xs leading-relaxed">
              AI-Powered Idea Generation Platform.<br />
              Confidential Internal Tool.
            </p>
          </div>

          {/* Links */}
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Navigation</p>
            <div className="space-y-2">
              {[
                { to: '/dashboard', label: 'Dashboard' },
                { to: '/analyze', label: 'Analyze' },
                { to: '/help', label: 'Help Centre' },
                { to: '/auth', label: 'Sign In' },
              ].map(({ to, label }) => (
                <Link key={to} to={to} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-xs transition-colors">
                  <ExternalLink size={10} /> {label}
                </Link>
              ))}
            </div>
          </div>

          {/* Contact */}
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
            <a
              href="mailto:avinash.bhosale8925@gmail.com"
              className="flex items-center gap-2 text-slate-500 hover:text-gold-400 text-xs transition-colors mb-1.5"
            >
              <Mail size={11} /> avinash.bhosale8925@gmail.com
            </a>
            <Link
              to="/help"
              className="flex items-center gap-2 text-slate-500 hover:text-gold-400 text-xs transition-colors"
            >
              <HelpCircle size={11} /> Help & Documentation
            </Link>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-6 border-t border-white/8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-slate-600 text-xs">
            © {new Date().getFullYear()} BrainSpark — All rights reserved
          </p>
          <p className="text-slate-600 text-xs text-center">
            Designed &amp; Created by{' '}
            <span className="text-gold-500/70 font-medium">Avinash Bhosale</span>
          </p>
          <p className="text-slate-700 text-xs">v{APP_VERSION}</p>
        </div>

      </div>
    </footer>
  );
}
