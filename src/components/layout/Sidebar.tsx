import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, PanelLeftClose, PanelLeftOpen, Settings, ChevronDown } from 'lucide-react';
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
  // Settings is ONE disclosure row, not four permanent links. The four links
  // plus Collapse plus the user card took ~260 px of a fixed footer, so on a
  // 900 px-tall window the tool list above it was clipped: Track and Learn
  // (Pipeline, Marketplace, Horizon, Help) sat out of sight with no scroll
  // affordance. It opens itself while you are on a settings page.
  const onSettings = SETTINGS_LINKS.some(l => l.route === location.pathname);
  const [settingsOpen, setSettingsOpen] = useState(onSettings);
  useEffect(() => { if (onSettings) setSettingsOpen(true); }, [onSettings]);

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
              <div className="px-2.5 pb-1.5 text-2xs font-bold uppercase tracking-widest text-slate-500">
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

      <div className="border-t border-white/8 px-2.5 py-2.5 space-y-0.5">
        {collapsed ? (
          <Link to={SETTINGS_LINKS[0].route} className={itemCls(onSettings)} title="Settings">
            <Settings size={16} className="shrink-0" />
          </Link>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setSettingsOpen(v => !v)}
              aria-expanded={settingsOpen}
              aria-controls="sidebar-settings"
              className={`w-full ${itemCls(onSettings && !settingsOpen)}`}
            >
              <Settings size={16} className="shrink-0" />
              <span className="flex-1 text-left">Settings</span>
              <ChevronDown size={14} className={`shrink-0 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {settingsOpen && (
              <div id="sidebar-settings" className="space-y-0.5 pl-3">
                {SETTINGS_LINKS.map(l => (
                  <Link key={l.id} to={l.route} className={itemCls(active(l.route))}>
                    <l.icon size={15} className="shrink-0" />
                    <span>{l.label}</span>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
        <div className={`flex items-center gap-2 pt-2 ${collapsed ? 'flex-col' : ''}`}>
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0 flex-1 px-2.5">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-navy-950 font-bold text-2xs shrink-0" aria-hidden="true">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-white text-xs font-semibold truncate">{user?.name}</p>
                <p className="text-slate-500 text-2xs truncate">{user?.email}</p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={toggle}
            className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
