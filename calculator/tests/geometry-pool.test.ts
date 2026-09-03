/**
 * The warm worker pool, exercised against a fake worker that speaks the same
 * JSON-lines protocol as `cad-geometry-engine.py --serve` but needs no OCP.
 *
 * What is pinned: never more than `size` workers; a bounded queue that fails
 * fast; a stuck worker is killed and only ITS job fails with 'timeout'; a
 * crashing worker fails only its own job with 'crashed' and is replaced; a
 * worker is recycled after `maxJobs`; results are routed by job id under
 * concurrency.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { join } from 'path';

process.env.PYTHON_BIN = 'python3';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type PoolMod = typeof import('../server/utils/geometry-pool.js');

async function makePool(opts: { size?: number; maxQueue?: number; maxJobs?: number }) {
  const mod: PoolMod = await import('../server/utils/geometry-pool.js');
  return new mod.GeometryPool({ ...opts, script: join(__dirname, 'fixtures', 'pool', 'fake-serve.py') });
}

const pools: Array<{ shutdown(): void }> = [];
afterAll(() => { for (const p of pools) p.shutdown(); });

describe('geometry pool', () => {
  it('answers jobs from warm workers and routes results by id under concurrency', async () => {
    const pool = await makePool({ size: 2 }); pools.push(pool);
    const jobs = Array.from({ length: 6 }, (_, i) => pool.run({ op: 'echo' as never, env: { CV_N: String(i) } }, 5000));
    const rs = await Promise.all(jobs);
    rs.forEach((r, i) => {
      expect(r.status).toBe('success');
      expect((r as unknown as { echo: { env: { CV_N: string } } }).echo.env.CV_N).toBe(String(i));
    });
    const pids = new Set(rs.map(r => (r as unknown as { pid: number }).pid));
    expect(pids.size).toBeLessThanOrEqual(2);          // never more than `size` workers
    expect(pool.snapshot.busy).toBe(0);
  }, 20_000);

  it('fails fast with queue_full beyond the bound instead of piling up', async () => {
    const pool = await makePool({ size: 1, maxQueue: 2 }); pools.push(pool);
    // Two jobs wait while the single worker starts; the third exceeds the bound.
    const slow = [pool.run({ op: 'sleep' as never, ms: 300 } as never, 5000), pool.run({ op: 'sleep' as never, ms: 300 } as never, 5000)];
    const refused = await pool.run({ op: 'echo' as never }, 5000);
    expect(refused.status).toBe('error');
    expect(refused.code).toBe('queue_full');
    const done = await Promise.all(slow);
    expect(done.every(r => r.status === 'success')).toBe(true);
  }, 20_000);

  it('kills a stuck worker and fails only that job with timeout; the pool keeps serving', async () => {
    const pool = await makePool({ size: 1 }); pools.push(pool);
    const stuck = await pool.run({ op: 'hang' as never }, 300);
    expect(stuck.status).toBe('error');
    expect(stuck.code).toBe('timeout');
    const next = await pool.run({ op: 'echo' as never }, 5000);
    expect(next.status).toBe('success');
    expect(pool.snapshot.timeouts).toBe(1);
  }, 20_000);

  it('a crashing worker fails its own job with crashed and is replaced', async () => {
    const pool = await makePool({ size: 1 }); pools.push(pool);
    const first = await pool.run({ op: 'echo' as never }, 5000);
    const pid1 = (first as unknown as { pid: number }).pid;
    const crashed = await pool.run({ op: 'crash' as never }, 5000);
    expect(crashed.status).toBe('error');
    expect(crashed.code).toBe('crashed');
    const after = await pool.run({ op: 'echo' as never }, 5000);
    expect(after.status).toBe('success');
    expect((after as unknown as { pid: number }).pid).not.toBe(pid1);
    expect(pool.snapshot.crashes).toBe(1);
  }, 20_000);

  it('recycles a worker after maxJobs', async () => {
    const pool = await makePool({ size: 1, maxJobs: 2 }); pools.push(pool);
    const a = await pool.run({ op: 'echo' as never }, 5000);
    const b = await pool.run({ op: 'echo' as never }, 5000);
    const c = await pool.run({ op: 'echo' as never }, 5000);
    expect((a as unknown as { pid: number }).pid).toBe((b as unknown as { pid: number }).pid);
    expect((c as unknown as { pid: number }).pid).not.toBe((a as unknown as { pid: number }).pid);
  }, 20_000);
});
