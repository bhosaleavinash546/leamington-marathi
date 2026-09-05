import { useIsNative } from '../hooks/useMobile';
import { useNavigate } from 'react-router-dom';
import { Server, LogOut, Info, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function MobileSettingsPage() {
  // These are the native app's own screens, but they are also reachable on
  // mobile WEB from the tab bar — where a fixed header sits above them and hid
  // the page heading. No header in the native shell, so the padding follows it.
  const native = useIsNative();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const rows = [
    {
      icon: Server,
      label: 'Server Connection',
      sub: 'Configure BrainSpark server URL',
      action: () => navigate('/server-settings'),
    },
  ];

  return (
    <div className={`min-h-screen pb-safe px-4 pb-6 ${native ? 'pt-safe pt-6' : 'pt-24'}`} style={{ background: 'rgb(var(--navy-950))' }}>
      <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
      {user && (
        <p className="text-sm mb-8" >
          Signed in as {user.email}
        </p>
      )}

      <div
        className="rounded-2xl overflow-hidden mb-5"
        style={{ border: '1px solid var(--hairline)' }}
      >
        {rows.map(({ icon: Icon, label, sub, action }, i) => (
          <button
            key={label}
            onClick={action}
            className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors"
            style={{
              background: i % 2 === 0 ? 'var(--tint)' : 'var(--tint)',
              borderBottom: i < rows.length - 1 ? '1px solid var(--hairline)' : undefined,
            }}
          >
            <div className="p-1.5 rounded-lg" style={{ background: 'rgba(245,158,11,0.12)' }}>
              <Icon size={18} className="text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{label}</p>
              <p className="text-xs truncate" >{sub}</p>
            </div>
            <ChevronRight size={16}  />
          </button>
        ))}
      </div>

      <div
        className="rounded-2xl overflow-hidden mb-5"
        style={{ border: '1px solid var(--hairline)' }}
      >
        <div className="flex items-center gap-3 px-5 py-4" style={{ background: 'var(--tint)' }}>
          <Info size={16}  />
          <div>
            <p className="text-xs font-medium" >BrainSpark Mobile</p>
            <p className="text-xs" >v2.1.0</p>
          </div>
        </div>
      </div>

      <button
        onClick={signOut}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium text-danger-400"
        style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)' }}
      >
        <LogOut size={16} />
        Sign Out
      </button>
    </div>
  );
}
