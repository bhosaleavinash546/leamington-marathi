export function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function showToast(message: string, type: 'error' | 'warning' | 'info' = 'info'): void {
  const container = document.getElementById('toast-container') ?? (() => {
    const c = document.createElement('div');
    c.id = 'toast-container';
    c.style.cssText = 'position:fixed;top:12px;right:12px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:360px';
    document.body.appendChild(c);
    return c;
  })();
  const bg = type === 'error' ? '#c62828' : type === 'warning' ? '#e65100' : '#1565c0';
  const icon = type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ';
  const toast = document.createElement('div');
  toast.style.cssText = `background:${bg};color:#fff;border-radius:6px;padding:10px 14px;font-size:0.78rem;box-shadow:0 4px 12px rgba(0,0,0,0.25);display:flex;gap:8px;align-items:flex-start;animation:toastIn .2s ease`;
  toast.innerHTML = `<span style="font-weight:700;flex-shrink:0">${icon}</span><span>${escHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity .3s'; setTimeout(() => toast.remove(), 300); }, 6000);
}
