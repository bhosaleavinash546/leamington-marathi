import { useEffect, useSyncExternalStore } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * ⌘K RUNS ACTIONS, NOT ONLY NAVIGATION.
 *
 * The palette could jump to a tool and find content. Linear, Vercel and Raycast
 * set the expectation that it also DOES things: "New analysis", "Export PDF",
 * "Open last result", "Switch theme". Two sources feed it:
 *
 *   - global commands, built by the palette from app state (the run store, the
 *     theme, the last result) — always available where they make sense;
 *   - page commands, which a page registers while it is mounted
 *     (`usePageCommands`) — Results offers its exports and its view switch.
 *     They unregister on unmount, so the palette never offers an action whose
 *     page is gone.
 *
 * A command is only listed when it can run (`when` is evaluated by whoever
 * builds it), so the palette never shows a disabled row to explain itself.
 */
export interface Command {
  id: string;
  label: string;
  /** Extra words that should match ("pdf", "download"). */
  keywords?: string;
  /** Right-aligned hint: a shortcut or what it acts on. */
  hint?: string;
  icon?: LucideIcon;
  /** Group heading in the palette. */
  group: 'Actions' | 'This page';
  run: () => void;
}

/**
 * Rank commands for a query. Empty query → up to three of the page's commands,
 * then global ones, capped. Otherwise: label prefix > word prefix > substring in
 * label > substring in keywords; ties keep their given order.
 */
export function rankCommands(commands: Command[], query: string, limit = 6): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    // At most three page commands, so the global ones ("New analysis", a
    // running job's Cancel) are never crowded out of the empty palette.
    const page = commands.filter(c => c.group === 'This page').slice(0, 3);
    return [...page, ...commands.filter(c => c.group !== 'This page')].slice(0, limit);
  }
  const scored = commands.map((c, i) => {
    const l = c.label.toLowerCase();
    const k = (c.keywords ?? '').toLowerCase();
    const s = l.startsWith(q) ? 4 : l.split(/[\s/·—-]+/).some(w => w.startsWith(q)) ? 3 : l.includes(q) ? 2 : k.split(/\s+/).some(w => w.startsWith(q)) || k.includes(q) ? 1 : 0;
    return { c, s, i };
  }).filter(x => x.s > 0);
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  return scored.slice(0, limit).map(x => x.c);
}

// ── Page-scoped registry ──────────────────────────────────────────────────
const owned = new Map<symbol, Command[]>();
let pageCommands: Command[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function setPageCommands(owner: symbol, cmds: Command[] | null) {
  if (cmds) owned.set(owner, cmds); else owned.delete(owner);
  pageCommands = [...owned.values()].flat();
  emit();
}

export function getPageCommands(): Command[] { return pageCommands; }

export function usePageCommandList(): Command[] {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getPageCommands, getPageCommands);
}

/**
 * Register commands for as long as the calling component is mounted. Pass a
 * fresh array each render; `deps` decides when the registration refreshes
 * (labels or availability that depend on state).
 */
export function usePageCommands(cmds: Command[], deps: unknown[]) {
  useEffect(() => {
    const owner = Symbol('page-commands');
    setPageCommands(owner, cmds);
    return () => setPageCommands(owner, null);
  }, deps);   // eslint-disable-line react-hooks/exhaustive-deps
}

/** The shortcut sheet listens for this; the palette and the `?` key fire it. */
export const SHORTCUTS_EVENT = 'brainspark:shortcuts';
export function openShortcutSheet() { window.dispatchEvent(new Event(SHORTCUTS_EVENT)); }
