/// <reference types="vite/client" />

/**
 * Resolves the correct API base URL for the current runtime:
 *   - Web browser (dev or prod):  '' → relative paths like /api/auth
 *   - Capacitor native shell:     VITE_API_BASE env var (set in .env.mobile)
 *
 * Usage:  import { apiBase } from '../api-base';
 *         fetch(apiBase + '/api/auth/signin', ...)
 */
export const apiBase: string =
  typeof window !== 'undefined' && (window as Window & { Capacitor?: unknown }).Capacitor
    ? (import.meta.env.VITE_API_BASE as string | undefined) ?? ''
    : '';
