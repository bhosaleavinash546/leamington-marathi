import { useNavigate } from 'react-router-dom';
import { Server, LogOut, Info, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function MobileSettingsPage() {
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
    <div className="min-h-screen pt-safe pb-safe px-4 py-6" style={{ background: '#07111e' }}>
      <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
      {user && (
        <p className="text-sm mb-8" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Signed in as {user.email}
        </p>
      )}

      <div
        className="rounded-2xl overflow-hidden mb-5"
        style={{ border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {rows.map(({ icon: Icon, label, sub, action }, i) => (
          <button
            key={label}
            onClick={action}
            className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors"
            style={{
              background: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.015)',
              borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.06)' : undefined,
            }}
          >
            <div className="p-1.5 rounded-lg" style={{ background: 'rgba(245,158,11,0.12)' }}>
              <Icon size={18} className="text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{label}</p>
              <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{sub}</p>
            </div>
            <ChevronRight size={16} style={{ color: 'rgba(255,255,255,0.3)' }} />
          </button>
        ))}
      </div>

      <div
        className="rounded-2xl overflow-hidden mb-5"
        style={{ border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-center gap-3 px-5 py-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <Info size={16} style={{ color: 'rgba(255,255,255,0.3)' }} />
          <div>
            <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>BrainSpark Mobile</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>v2.1.0</p>
          </div>
        </div>
      </div>

      <button
        onClick={signOut}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium"
        style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
      >
        <LogOut size={16} />
        Sign Out
      </button>
    </div>
  );
}
