import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Zap, ShoppingBag, Wrench, Settings } from 'lucide-react';

const tabs = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { to: '/analyze', icon: Zap, label: 'Analyze' },
  { to: '/marketplace', icon: ShoppingBag, label: 'Ideas' },
  { to: '/trends', icon: Wrench, label: 'Tools' },
  { to: '/mobile-settings', icon: Settings, label: 'Settings' },
];

export default function MobileNav() {
  const location = useLocation();
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 pb-safe"
      style={{ background: '#07111e', borderTop: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-stretch h-14">
        {tabs.map(({ to, icon: Icon, label }) => {
          const active = location.pathname === to || location.pathname.startsWith(to + '/');
          return (
            <NavLink
              key={to}
              to={to}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs transition-colors"
              style={{ color: active ? '#f59e0b' : 'rgba(255,255,255,0.45)' }}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
              <span className="font-medium">{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
