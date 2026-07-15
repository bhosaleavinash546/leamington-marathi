// Single source of truth for the app version, injected at build time from
// package.json (vite `define`) with a safe fallback for tests/tools.
export const APP_VERSION: string =
  (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '3.1.0');
declare global {
  // Provided by vite.config.ts define
  const __APP_VERSION__: string | undefined;
}
