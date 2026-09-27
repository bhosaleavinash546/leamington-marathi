import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { readString, writeString } from '../lib/storage';
import { DUR } from '../lib/motion';

export type Theme = 'dark' | 'light';

/** Where the change came from, so the reveal can grow out of the control. */
export interface ThemeOrigin { x: number; y: number }

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  toggleTheme: (origin?: ThemeOrigin) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  isDark: true,
  toggleTheme: () => {},
});

function getInitialTheme(): Theme {
  const t = readString('brainspark_theme', 'dark');
  return t === 'light' ? 'light' : 'dark';
}

type DocWithVT = Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    writeString('brainspark_theme', theme);
  }, [theme]);

  // Apply on first paint to prevent flash
  if (typeof window !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }

  /**
   * THE THEME REVEAL. Switching every surface at once is the biggest visual
   * event in the product, and it used to be a hard cut. With the View
   * Transitions API the browser snapshots the old page, the theme flips, and
   * the new page is revealed inside a circle that grows from the toggle — so
   * the eye follows the change from the control that caused it. Guarded three
   * ways: no API → plain swap; reduced-motion → plain swap; a transition
   * already running → plain swap (the API rejects a second one).
   */
  function toggleTheme(origin?: ThemeOrigin) {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    const doc = document as DocWithVT;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!doc.startViewTransition || reduced) { setTheme(next); return; }
    const x = origin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? 0;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    let vt: { ready: Promise<void> };
    try {
      vt = doc.startViewTransition(() => {
        // The DOM must be in its final state when the callback returns.
        flushSync(() => setTheme(next));
        document.documentElement.setAttribute('data-theme', next);
      });
    } catch { setTheme(next); return; }
    vt.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: DUR.draw * 1000, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    }).catch(() => { /* the swap already happened; only the reveal was lost */ });
  }

  return (
    <ThemeContext.Provider value={{ theme, isDark: theme === 'dark', toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
