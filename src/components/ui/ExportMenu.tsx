import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Download, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * One export control. The results header used to carry five buttons in five
 * saturated colours (blue Share, green Excel, orange PowerPoint, red PDF,
 * violet RFQ) — every format shouting as loudly as the primary action, which
 * reads as a toolbar, not a product. The pattern the professional tools use
 * (Stripe, Linear, Notion) is one primary "Export" with a menu that names
 * what each format is for.
 *
 * Keyboard: Enter/Space/↓ opens and focuses the first item; ↑/↓ move; Esc
 * closes and returns focus to the button; Tab leaves.
 */
export interface ExportItem {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  onSelect: () => void;
  busy?: boolean;
  disabled?: boolean;
}

interface Props {
  items: ExportItem[];
  label?: ReactNode;
  busy?: boolean;
  className?: string;
}

export default function ExportMenu({ items, label = 'Export', busy = false, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    const first = menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])');
    first?.focus();
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const els = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])];
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btn.current?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } }}
        className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-semibold text-sm transition-colors"
      >
        {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
        {label}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label="Export formats"
          onKeyDown={onMenuKey}
          className="absolute right-0 z-popover mt-2 w-72 rounded-xl border border-hairline-strong bg-navy-900 p-1.5 shadow-xl shadow-black/30"
        >
          {items.map(it => (
            <button
              key={it.id}
              type="button"
              role="menuitem"
              disabled={it.disabled || it.busy}
              onClick={() => { setOpen(false); it.onSelect(); }}
              className="w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-tint focus:bg-tint focus:outline-none disabled:opacity-50 transition-colors"
            >
              {it.busy ? <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-slate-400" aria-hidden="true" /> : <it.icon size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />}
              <span className="min-w-0">
                <span className="block text-sm font-medium text-white">{it.label}</span>
                {it.description && <span className="block text-xs text-slate-400">{it.description}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
