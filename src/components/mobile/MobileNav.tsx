import { useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Zap, ShoppingBag, Wrench, Settings, X } from 'lucide-react';
import { TOOL_GROUPS } from '../../config/tools';

const tabs = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { to: '/analyze', icon: Zap, label: 'Analyze' },
  { to: '/marketplace', icon: ShoppingBag, label: 'Ideas' },
  // 'Tools' is a launcher sheet (all registry tools), not a route.
  { to: '/mobile-settings', icon: Settings, label: 'Settings' },
];

export default function MobileNav() {
  const location = useLocation();
  const [toolsOpen, setToolsOpen] = useState(false);

  return (
    <>
      {/* Tool launcher sheet */}
      {toolsOpen && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-label="All tools">
          <div className="absolute inset-0 bg-black/60" onClick={() => setToolsOpen(false)} />
          <div
            className="absolute bottom-0 inset-x-0 rounded-t-2xl border-t border-white/10 max-h-[75vh] overflow-y-auto pb-safe"
            style={{ background: 'rgb(var(--navy-900))' }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <span className="text-white font-semibold text-sm">All tools</span>
              <button onClick={() => setToolsOpen(false)} className="p-2 -m-2 text-slate-400" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            {TOOL_GROUPS.map(group => (
              <div key={group.id} className="px-5 pb-3">
                <div className="pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500">{group.label}</div>
                <div className="grid grid-cols-2 gap-2">
                  {group.tools.map(t => (
                    <Link
                      key={t.id}
                      to={t.route}
                      onClick={() => setToolsOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-white/8 bg-white/5 text-[13px] font-medium text-slate-200"
                    >
                      <t.icon size={15} style={{ color: 'rgb(var(--gold-400))' }} />
                      <span className="truncate">{t.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <nav
        className="fixed bottom-0 inset-x-0 z-50 pb-safe"
        style={{ background: 'rgb(var(--navy-950))', borderTop: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-stretch h-14">
          {tabs.slice(0, 3).map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to || location.pathname.startsWith(to + '/');
            return (
              <NavLink
                key={to}
                to={to}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs transition-colors"
                style={{ color: active ? 'rgb(var(--gold-400))' : 'rgba(255,255,255,0.45)' }}
              >
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                <span className="font-medium">{label}</span>
              </NavLink>
            );
          })}
          <button
            onClick={() => setToolsOpen(v => !v)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs transition-colors"
            style={{ color: toolsOpen ? 'rgb(var(--gold-400))' : 'rgba(255,255,255,0.45)' }}
          >
            <Wrench size={20} strokeWidth={toolsOpen ? 2.2 : 1.8} />
            <span className="font-medium">Tools</span>
          </button>
          {tabs.slice(3).map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to || location.pathname.startsWith(to + '/');
            return (
              <NavLink
                key={to}
                to={to}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs transition-colors"
                style={{ color: active ? 'rgb(var(--gold-400))' : 'rgba(255,255,255,0.45)' }}
              >
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                <span className="font-medium">{label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </>
  );
}
