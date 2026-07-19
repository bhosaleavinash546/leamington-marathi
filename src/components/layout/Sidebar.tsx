import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { TOOL_GROUPS, SETTINGS_LINKS, isAppRoute } from '../../config/tools';

const COLLAPSE_KEY = 'brainspark_sidebar_collapsed';

/**
 * Grouped workspace sidebar (desktop, authenticated app routes only).
 * Driven entirely by the tools registry — the one nav surface that shows the
 * whole suite. Collapsible to an icon rail; state persisted per device.
 */
export default function Sidebar() {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });

  if (!isAuthenticated || !isAppRoute(location.pathname)) return null;

  const toggle = () => {
    setCollapsed(v => {
      try { localStorage.setItem(COLLAPSE_KEY, v ? '0' : '1'); } catch { /* private mode */ }
      return !v;
    });
  };

  const initials = user?.name
    ? user.name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
    : 'U';
  const active = (route: string) => location.pathname === route;

  const itemCls = (on: boolean) =>
    `flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-colors ${
      collapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-[7px]'
    } ${on ? 'bg-gold-500/15 text-gold-400' : 'text-slate-400 hover:text-white hover:bg-white/5'}`;

  return (
    <aside
      className={`hidden lg:flex flex-col shrink-0 sticky top-0 h-screen pt-16 bg-navy-950 border-r border-white/8 transition-[width] duration-200 ${
        collapsed ? 'w-[64px]' : 'w-[228px]'
      }`}
      aria-label="Workspace navigation"
    >
      <div className="flex-1 overflow-y-auto px-2.5 py-4">
        <Link to="/dashboard" className={itemCls(active('/dashboard'))} title="Home">
          <Home size={17} className="shrink-0" />
          {!collapsed && <span>Home</span>}
        </Link>

        {TOOL_GROUPS.map(group => (
          <div key={group.id} className="mt-4">
            {!collapsed && (
              <div className="px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.09em] text-slate-600">
                {group.label}
              </div>
            )}
            {collapsed && <div className="mx-2 my-2 h-px bg-white/8" />}
            <div className="space-y-0.5">
              {group.tools.map(t => (
                <Link key={t.id} to={t.route} className={itemCls(active(t.route))} title={collapsed ? t.label : undefined}>
                  <t.icon size={17} className="shrink-0" />
                  {!collapsed && <span className="truncate">{t.label}</span>}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/8 px-2.5 py-3 space-y-0.5">
        {SETTINGS_LINKS.map(s => (
          <Link key={s.id} to={s.route} className={itemCls(active(s.route))} title={collapsed ? s.label : undefined}>
            <s.icon size={16} className="shrink-0" />
            {!collapsed && <span>{s.label}</span>}
          </Link>
        ))}
        <button
          onClick={toggle}
          className={`w-full ${itemCls(false)}`}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={16} className="shrink-0" /> : <PanelLeftClose size={16} className="shrink-0" />}
          {!collapsed && <span>Collapse</span>}
        </button>
        {!collapsed && (
          <div className="flex items-center gap-2.5 px-2.5 pt-2.5">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-navy-950 font-bold text-[11px] shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-semibold truncate">{user?.name}</p>
              <p className="text-slate-600 text-[10.5px] truncate">{user?.email}</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
