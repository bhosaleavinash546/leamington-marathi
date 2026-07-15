import { useEffect, useRef } from 'react';

/**
 * Dialog accessibility in one hook: Escape closes, focus moves into the modal
 * on open and returns to the opener on close, and Tab is trapped inside.
 * Attach the returned ref to the modal panel and spread `dialogProps` on it.
 */
export function useModalA11y(onClose: () => void) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (!panel) return;

    const focusables = () => Array.from(panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
    (focusables()[0] ?? panel).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (els.length === 0) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    panelRef,
    dialogProps: { role: 'dialog', 'aria-modal': true as const, tabIndex: -1 },
  };
}
