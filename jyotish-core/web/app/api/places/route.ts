import { API_BASE } from '@/lib/api';

/**
 * Proxy for the offline place lookup.
 *
 * Proxied rather than called directly from the browser so the API needs no CORS
 * origin for the birth-input screen, and so no third-party network request is ever
 * made from a page that handles birth data (CLAUDE.md 10).
 */
export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams.get('q') ?? '';
  if (q.trim().length < 2) return Response.json({ results: [] });
  const upstream = await fetch(
    `${API_BASE}/v1/places?q=${encodeURIComponent(q)}&limit=8`,
    { cache: 'no-store' },
  );
  if (!upstream.ok) return Response.json({ results: [] }, { status: 200 });
  return Response.json(await upstream.json());
}
