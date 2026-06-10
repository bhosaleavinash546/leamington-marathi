import { Toast, ToastType } from '../hooks/useToast';

const ICONS: Record<ToastType, string> = {
  success: '✓', error: '✕', warning: '⚠', info: 'ℹ',
};
const COLORS: Record<ToastType, string> = {
  success: 'var(--success)', error: 'var(--danger)',
  warning: 'var(--warn)',    info:  'var(--accent)',
};

interface Props {
  toasts: Toast[];
  onRemove: (id: number) => void;
}

export default function ToastContainer({ toasts, onRemove }: Props) {
  if (!toasts.length) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--surface)',
          border: `1px solid var(--border)`,
          borderLeft: `4px solid ${COLORS[t.type]}`,
          borderRadius: 10, padding: '12px 16px',
          boxShadow: 'var(--shadow-lg)',
          minWidth: 280, maxWidth: 420,
          animation: 'fadeInUp 0.3s ease',
        }}>
          <span style={{ color: COLORS[t.type], fontWeight: 800, fontSize: 16 }}>
            {ICONS[t.type]}
          </span>
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{t.message}</span>
          <button
            onClick={() => onRemove(t.id)}
            style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 16, cursor: 'pointer', padding: '0 4px' }}
          >×</button>
        </div>
      ))}
    </div>
  );
}
