import { Link, useLocation } from 'react-router-dom';
import { Compass, Home, Search } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { TOOL_GROUPS } from '../config/tools';
import { useAuth } from '../contexts/AuthContext';

/**
 * A real "page not found". The catch-all route used to <Navigate to="/">, so a
 * mistyped or stale link (an old bookmark, a renamed tool) silently dropped a
 * signed-in engineer on the marketing landing page with no hint of what went
 * wrong. Now the URL stays put, the page says what happened, and the way back
 * is one click: the dashboard, the command palette, or any tool by group.
 */
export default function NotFoundPage() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-24 pb-16">
      <PageHeader icon={Compass} tone="neutral" eyebrow="Error 404" title="This page doesn’t exist"
        subtitle={<>Nothing lives at <code className="font-mono text-slate-300">{pathname}</code>. The link may be mistyped, or the page may have moved.</>} />
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to={user ? '/dashboard' : '/'} className="inline-flex items-center gap-2 rounded-xl bg-gold-500 hover:bg-gold-400 px-4 h-10 text-sm font-semibold text-navy-950 transition-colors">
          <Home size={16} aria-hidden="true" /> {user ? 'Go to your dashboard' : 'Go to the home page'}
        </Link>
        {user && (
          <span className="hidden sm:inline-flex items-center gap-2 rounded-xl border border-hairline bg-tint px-4 h-10 text-sm text-slate-300">
            <Search size={16} aria-hidden="true" /> Or press <kbd className="font-mono text-slate-200">⌘K</kbd> to jump to any tool
          </span>
        )}
      </div>
      {user && (
        <nav aria-label="All tools" className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {TOOL_GROUPS.map(g => (
            <div key={g.id}>
              <p className="text-2xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{g.label}</p>
              <ul className="space-y-1">
                {g.tools.map(t => (
                  <li key={t.id}>
                    <Link to={t.route} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-300 hover:text-white hover:bg-tint transition-colors">
                      <t.icon size={15} className="text-slate-500" aria-hidden="true" /> {t.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      )}
    </div>
  );
}
