import { API_BASE } from '@/lib/api';

/**
 * Proxy for dasha sub-periods, so the dasha tree can expand a level on demand.
 *
 * A four-level Vimshottari tree is 7380 nodes; shipping it with every chart would
 * be wasteful, and computing it in the browser is forbidden — CLAUDE.md N1 puts
 * every dasha date in the engine's hands. So the browser asks the server.
 */
export async function GET(request: Request): Promise<Response> {
  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams({
    lord: incoming.get('lord') ?? '',
    start_utc: incoming.get('start_utc') ?? '',
    end_utc: incoming.get('end_utc') ?? '',
    level: incoming.get('level') ?? '1',
  });
  const upstream = await fetch(`${API_BASE}/v1/dasha/subperiods?${query}`, {
    cache: 'no-store',
  });
  if (!upstream.ok) return Response.json([], { status: 200 });
  return Response.json(await upstream.json());
}
