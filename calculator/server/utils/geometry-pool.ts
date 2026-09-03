/**
 * Warm geometry worker pool.
 *
 * Measured on eight real parts: `import cadquery` alone costs 2.9–4.0 s, and
 * for every part under about 1 MB that IS the whole measurement. A one-shot
 * spawn paid it on every call, two to four times per upload. A worker imports
 * OCP once, keeps a small LRU of loaded shapes, and answers jobs from stdin as
 * JSON lines — see `serve()` in cad-geometry-engine.py for the protocol.
 *
 * Contracts the pool keeps:
 *  - at most `size` Python processes alive (each ~300 MB RSS idle), never more;
 *  - a bounded queue — a burst beyond `maxQueue` fails fast with `queue_full`
 *    rather than piling promises up until the client aborts;
 *  - one timeout per job, passed INTO the worker so its own alarm fires before
 *    ours: a clean structured error beats a SIGKILL. If the worker still hangs
 *    (a native OCCT call cannot be interrupted) we kill and respawn it and fail
 *    only that job with code 'timeout';
 *  - a worker that exits fails its in-flight job with code 'crashed' and is
 *    respawned lazily on the next job; a job is never retried silently;
 *  - a worker is recycled after `maxJobs` jobs so a slow native leak cannot
 *    grow forever.
 *
 * `CV_GEOMETRY_POOL=0` disables the pool; the bridge then falls back to the
 * one-shot spawn it always had.
 */
import { spawn, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PYTHON_SCRIPT = join(__dirname, 'cad-geometry-engine.py');
export const PYTHON_BIN = process.env.PYTHON_BIN ?? 'python3';

export interface GeometryJob {
  op: 'analyze' | 'tessellate' | 'ping';
  path?: string;
  out?: string;
  withMeta?: boolean;
  env?: Record<string, string>;
}

export interface GeometryJobResult {
  status: 'success' | 'error';
  code?: string;
  error?: string;
  [k: string]: unknown;
}

interface Pending {
  id: string;
  job: GeometryJob;
  timeoutMs: number;
  resolve: (r: GeometryJobResult) => void;
}

class Worker {
  child: ChildProcess | null = null;
  ready = false;
  busy: Pending | null = null;
  jobsDone = 0;
  timer: NodeJS.Timeout | null = null;
  constructor(readonly pool: GeometryPool, readonly index: number) {}

  start(): Promise<boolean> {
    return new Promise((resolveStart) => {
      let settled = false;
      const done = (ok: boolean) => { if (!settled) { settled = true; resolveStart(ok); } };
      let child: ChildProcess;
      try {
        child = spawn(PYTHON_BIN, [this.pool.script, '--serve'], { env: { ...process.env }, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (err) {
        console.warn(`[geometry-pool] worker ${this.index} failed to spawn: ${err instanceof Error ? err.message : String(err)}`);
        done(false); return;
      }
      this.child = child;
      this.ready = false;
      // A write to a worker we have just killed raises EPIPE on the stdin
      // stream; without a listener that is an uncaught exception.
      child.stdin!.on('error', () => { /* handled by exit → onExit */ });
      const rl = createInterface({ input: child.stdout! });
      rl.on('line', (line) => {
        let msg: { ready?: boolean; id?: string | null; result?: GeometryJobResult };
        try { msg = JSON.parse(line) as typeof msg; } catch { return; }   // not for us
        if (msg.ready) { this.ready = true; done(true); return; }
        const p = this.busy;
        if (!p || (msg.id && msg.id !== p.id)) return;
        this.finish(p, msg.result ?? { status: 'error', code: 'crashed', error: 'worker returned no result' });
      });
      let stderr = '';
      child.stderr!.on('data', (d: Buffer) => { if (stderr.length < 4096) stderr += d.toString(); });
      child.on('error', (err) => {
        console.warn(`[geometry-pool] worker ${this.index} error: ${err.message}`);
        done(false);
        this.onExit('crashed', err.message);
      });
      child.on('exit', (code, signal) => {
        const why = signal ? `signal ${signal}` : `exit ${code}`;
        if (!this.ready) console.warn(`[geometry-pool] worker ${this.index} died before ready (${why}): ${stderr.slice(-400)}`);
        done(false);
        this.onExit('crashed', why);
      });
    });
  }

  private onExit(code: string, why: string): void {
    const p = this.busy;
    if (this.child) { this.child = null; }
    this.ready = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (p) { this.busy = null; p.resolve({ status: 'error', code, error: `geometry worker ${why}` }); }
    this.pool.onWorkerFree(this);
  }

  private finish(p: Pending, result: GeometryJobResult): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.busy = null;
    this.jobsDone++;
    p.resolve(result);
    if (this.jobsDone >= this.pool.maxJobs) {
      console.log(`[geometry-pool] recycling worker ${this.index} after ${this.jobsDone} jobs`);
      this.kill();
      return;   // onExit → onWorkerFree
    }
    this.pool.onWorkerFree(this);
  }

  run(p: Pending): void {
    this.busy = p;
    this.timer = setTimeout(() => {
      // The worker's own alarm should have fired first; if we are here a native
      // call is stuck. Kill; onExit fails this job with 'timeout'.
      console.warn(`[geometry-pool] worker ${this.index} stuck > ${p.timeoutMs} ms on ${p.job.op}; killing`);
      const stuck = this.busy;
      this.busy = null;
      if (stuck) stuck.resolve({ status: 'error', code: 'timeout', error: `Geometry engine timed out after ${p.timeoutMs / 1000}s` });
      this.kill();
    }, p.timeoutMs + 2000);
    const line = JSON.stringify({ id: p.id, timeoutMs: p.timeoutMs, ...p.job }) + '\n';
    try {
      this.child!.stdin!.write(line);
    } catch (err) {
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      this.busy = null;
      p.resolve({ status: 'error', code: 'crashed', error: `could not write to geometry worker: ${err instanceof Error ? err.message : String(err)}` });
      this.kill();
    }
  }

  kill(): void {
    const c = this.child;
    if (!c) return;
    // Mark dead NOW: the 'exit' event arrives later, and a job dispatched in
    // between would be written to a dying process.
    this.child = null;
    this.ready = false;
    try { c.kill('SIGKILL'); } catch { /* already gone */ }
  }
}

export class GeometryPool {
  readonly size: number;
  readonly maxQueue: number;
  readonly maxJobs: number;
  private workers: Worker[] = [];
  private queue: Pending[] = [];
  private starting = new Set<Worker>();
  private disabled = false;
  private stats = { jobs: 0, queued: 0, queueFull: 0, timeouts: 0, crashes: 0 };

  /** The worker script — injectable so tests can run a fake worker without OCP. */
  readonly script: string;
  constructor(opts: { size?: number; maxQueue?: number; maxJobs?: number; script?: string } = {}) {
    this.script = opts.script ?? PYTHON_SCRIPT;
    this.size = Math.max(1, opts.size ?? (parseInt(process.env.CV_MAX_PYTHON_PROCS ?? '2', 10) || 2));
    this.maxQueue = Math.max(1, opts.maxQueue ?? (parseInt(process.env.CV_GEOMETRY_QUEUE ?? '20', 10) || 20));
    this.maxJobs = Math.max(1, opts.maxJobs ?? (parseInt(process.env.CV_POOL_MAX_JOBS ?? '200', 10) || 200));
  }

  /** True once a worker has failed to reach 'ready' — the bridge falls back to one-shot spawns. */
  get unavailable(): boolean { return this.disabled; }
  get snapshot() {
    return { ...this.stats, workers: this.workers.length, busy: this.workers.filter(w => w.busy).length, queueLength: this.queue.length, disabled: this.disabled };
  }

  run(job: GeometryJob, timeoutMs: number): Promise<GeometryJobResult> {
    if (this.disabled) return Promise.resolve({ status: 'error', code: 'pool_unavailable', error: 'geometry pool unavailable' });
    if (this.queue.length >= this.maxQueue) {
      this.stats.queueFull++;
      return Promise.resolve({ status: 'error', code: 'queue_full', error: `geometry queue full (${this.maxQueue} waiting) — try again shortly` });
    }
    return new Promise((resolve) => {
      const p: Pending = { id: randomBytes(6).toString('hex'), job, timeoutMs, resolve: (r) => {
        if (r.code === 'timeout') this.stats.timeouts++;
        if (r.code === 'crashed') this.stats.crashes++;
        resolve(r);
      } };
      this.stats.jobs++;
      this.queue.push(p);
      this.stats.queued = Math.max(this.stats.queued, this.queue.length);
      this.pump();
    });
  }

  onWorkerFree(_w: Worker): void { this.pump(); }

  private pump(): void {
    if (!this.queue.length) return;
    // 1. an idle, ready worker
    const idle = this.workers.find(w => w.ready && !w.busy && w.child);
    if (idle) { idle.run(this.queue.shift()!); this.pump(); return; }
    // 2. room for another worker (dead ones are replaced in place)
    const alive = this.workers.filter(w => w.child);
    if (alive.length + this.starting.size < this.size) {
      const dead = this.workers.find(w => !w.child && !this.starting.has(w));
      const w = dead ?? new Worker(this, this.workers.length);
      if (!dead) this.workers.push(w);
      this.starting.add(w);
      void w.start().then((ok) => {
        this.starting.delete(w);
        if (!ok && !this.workers.some(x => x.ready)) {
          // Nothing ever came up: OCP is not installed here. Fail the queue
          // fast so the bridge can fall back, and stay out of the way.
          this.disabled = true;
          const q = this.queue.splice(0);
          for (const p of q) p.resolve({ status: 'error', code: 'pool_unavailable', error: 'geometry worker could not start' });
          return;
        }
        this.pump();
      });
    }
    // 3. otherwise wait for a finish/exit → onWorkerFree
  }

  /** Stop every worker (tests, shutdown). Pending jobs fail with 'crashed'. */
  shutdown(): void {
    for (const w of this.workers) w.kill();
    const q = this.queue.splice(0);
    for (const p of q) p.resolve({ status: 'error', code: 'crashed', error: 'pool shut down' });
  }
}

let shared: GeometryPool | null = null;
export function geometryPool(): GeometryPool {
  if (!shared) shared = new GeometryPool();
  return shared;
}
export const POOL_ENABLED = process.env.CV_GEOMETRY_POOL !== '0';
