import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

const toastQueue: Toast[] = [];
const listeners: Set<() => void> = new Set();

function notify() { listeners.forEach(fn => fn()); }

function dismissToast(id: string) {
  const idx = toastQueue.findIndex(t => t.id === id);
  if (idx !== -1) { toastQueue.splice(idx, 1); notify(); }
}

export function toast(message: string, type: ToastType = 'info') {
  const id = Math.random().toString(36).slice(2);
  toastQueue.push({ id, message, type });
  notify();
  setTimeout(() => dismissToast(id), 4000);
}

toast.success = (msg: string) => toast(msg, 'success');
toast.error   = (msg: string) => toast(msg, 'error');
toast.info    = (msg: string) => toast(msg, 'info');

const ICONS = { success: CheckCircle, error: AlertCircle, info: Info };
const STYLES = {
  success: 'bg-green-900/90 border-green-500/40 text-green-100',
  error:   'bg-red-900/90 border-red-500/40 text-red-100',
  info:    'bg-navy-800/90 border-gold-500/40 text-slate-100',
};

export function ToastContainer() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const fn = () => rerender(n => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  if (typeof window === 'undefined') return null;

  return createPortal(
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none" aria-live="polite" role="status">
      {[...toastQueue].map(t => {
        const Icon = ICONS[t.type];
        return (
          <div key={t.id} className={`toast-enter flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-2xl text-sm font-medium pointer-events-auto max-w-sm ${STYLES[t.type]}`}>
            <Icon size={16} className="flex-shrink-0" aria-hidden="true" />
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismissToast(t.id)} aria-label="Dismiss notification" className="p-0.5 rounded opacity-70 hover:opacity-100">
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}
