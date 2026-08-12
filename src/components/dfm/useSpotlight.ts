import { useCallback } from 'react';

/**
 * The light that follows the pointer across a panel.
 *
 * Two lines of maths and no React state on purpose: writing `--mx`/`--my`
 * straight onto the node keeps the effect off the render path entirely, so a
 * results page carrying forty panels and a live 3D viewport does not re-render
 * once per mouse move. The gradient that consumes the variables lives in
 * `.dfm-spot` (dfm.css), behind the panel's own `:hover`, and is a no-op when
 * the variables were never written — which is what makes it safe to attach to
 * anything.
 */
export function useSpotlight() {
  return useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, []);
}
