import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { SHORTCUTS_EVENT } from '../../lib/commands';

/**
 * THE `?` SHEET — every keyboard shortcut in one place.
 *
 * The shortcuts existed (⌘K, the palette's arrows, j/k/x on Results, the
 * Export menu's arrows) but were each documented only where they work, in
 * hint text a newcomer had to already be looking at. Press `?` anywhere that
 * is not a text field, or pick "Keyboard shortcuts" in ⌘K. Only shortcuts
 * that exist in the code are listed; a test checks the sheet against them.
 */
const GROUPS: Array<{ title: string; rows: Array<[string[], string]> }> = [
  { title: 'Everywhere', rows: [
    [['⌘', 'K'], 'Search tools, run actions (Ctrl K on Windows)'],
    [['?'], 'Show this sheet'],
    [['Esc'], 'Close a menu, dialog or the palette'],
  ] },
  { title: 'Command palette', rows: [
    [['↑', '↓'], 'Move between rows'],
    [['Home', 'End'], 'First / last row'],
    [['↵'], 'Run the action or open the row'],
  ] },
  { title: 'Results — idea cards', rows: [
    [['j', 'k'], 'Next / previous idea'],
    [['↵'], 'Expand the focused idea'],
    [['x'], 'Select the focused idea'],
  ] },
  { title: 'Menus (Export and others)', rows: [
    [['↑', '↓'], 'Move between items'],
    [['↵'], 'Choose'],
  ] },
];

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
};

export default function ShortcutSheet() {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const show = () => { returnTo.current = document.activeElement as HTMLElement | null; setOpen(true); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target)) { e.preventDefault(); show(); }
    };
    window.addEventListener(SHORTCUTS_EVENT, show);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener(SHORTCUTS_EVENT, show); window.removeEventListener('keydown', onKey); };
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
      // Keep Tab inside the dialog: its only control is Close.
      if (e.key === 'Tab') { e.preventDefault(); closeRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); returnTo.current?.focus?.(); };
  }, [open]);

  if (!open) return null;
  // Portalled to <body>: it is mounted inside the header, whose backdrop-filter
  // makes it the containing block for `fixed` — the sheet was clipped to it.
  return createPortal(
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-navy-950/70" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="shortcut-sheet-title"
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-hairline bg-navy-900 shadow-popover p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 id="shortcut-sheet-title" className="text-white font-semibold text-lg">Keyboard shortcuts</h2>
          <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close keyboard shortcuts"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-tint transition-colors">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-5">
          {GROUPS.map(g => (
            <section key={g.title}>
              <h3 className="text-2xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{g.title}</h3>
              <dl className="space-y-1.5">
                {g.rows.map(([keys, what]) => (
                  <div key={what} className="flex items-center justify-between gap-4 text-sm">
                    <dt className="text-slate-300">{what}</dt>
                    <dd className="flex gap-1 shrink-0">
                      {keys.map(k => <kbd key={k} className="min-w-[24px] text-center font-mono text-xs text-slate-200 border border-hairline bg-tint rounded px-1.5 py-0.5">{k}</kbd>)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
