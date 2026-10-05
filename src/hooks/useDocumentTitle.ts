import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { TOOLS, SETTINGS_LINKS } from '../config/tools';

/**
 * One document title per page. Every route used to keep the index.html title
 * ("BrainSpark — AI Idea Generation Tool"), so twenty open tabs, the browser
 * history and every bookmark read identically — measured: 1 distinct title
 * across 27 routes. Titles come from the nav registry, so a new tool gets its
 * title with no extra wiring: "Should-Cost · BrainSpark".
 */
const EXTRA: Record<string, string> = {
  '/': 'BrainSpark — AI cost-engineering platform',
  '/auth': 'Sign in · BrainSpark',
  '/dashboard': 'Home · BrainSpark',
  '/results': 'Results · BrainSpark',
  '/server-settings': 'Server settings · BrainSpark',
  '/mobile-settings': 'App settings · BrainSpark',
};

export function titleForPath(pathname: string): string {
  if (EXTRA[pathname]) return EXTRA[pathname];
  const tool = TOOLS.find(t => t.route === pathname) ?? SETTINGS_LINKS.find(s => s.route === pathname);
  if (tool) return `${tool.label} · BrainSpark`;
  if (pathname.startsWith('/legal/')) return `${pathname.slice(7).replace(/^./, c => c.toUpperCase())} · BrainSpark`;
  if (pathname.startsWith('/shared/')) return 'Shared analysis · BrainSpark';
  return 'Page not found · BrainSpark';
}

export function useDocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => { document.title = titleForPath(pathname); }, [pathname]);
}
