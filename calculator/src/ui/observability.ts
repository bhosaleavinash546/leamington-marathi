/**
 * Runtime error observability (client half).
 *
 * Installs global handlers for uncaught errors and unhandled promise rejections,
 * de-dupes and rate-limits them, attaches lightweight context (url, breadcrumbs,
 * user agent) and ships them to /api/telemetry/error. This is what tells you a
 * user hit an error in the wild — the CI smoke only catches crashes before merge.
 *
 * Dependency-free (no Sentry SDK → no bundle cost). The handlers never throw and
 * never suppress the original error, so they don't change app behaviour or hide
 * problems from the CI smoke.
 */

const MAX_REPORTS_PER_SESSION = 25;
const MAX_BREADCRUMBS = 20;

let _installed = false;
let _sent = 0;
const _seen = new Set<string>();
const _breadcrumbs: string[] = [];

/** Record a short user-action trail that accompanies the next error report. */
export function breadcrumb(message: string): void {
  try {
    _breadcrumbs.push(message.slice(0, 200));
    if (_breadcrumbs.length > MAX_BREADCRUMBS) _breadcrumbs.shift();
  } catch { /* never throw from telemetry */ }
}

interface ErrorReport {
  kind: string;
  message?: string;
  stack?: string;
  source?: string;
  line?: number;
  col?: number;
}

function send(report: ErrorReport): void {
  try {
    if (_sent >= MAX_REPORTS_PER_SESSION) return;
    const key = `${report.kind}:${report.message ?? ''}:${(report.stack ?? '').slice(0, 200)}`;
    if (_seen.has(key)) return;           // de-dupe identical errors
    _seen.add(key);
    _sent++;

    const body = JSON.stringify({
      ...report,
      message: report.message?.slice(0, 2000),
      stack: report.stack?.slice(0, 8000),
      url: location.href,
      ua: navigator.userAgent,
      ts: new Date().toISOString(),
      mode: import.meta.env.MODE,
      breadcrumbs: _breadcrumbs.slice(-10),
    });

    // sendBeacon survives page unload; fall back to keepalive fetch.
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/telemetry/error', new Blob([body], { type: 'application/json' }));
    } else {
      void fetch('/api/telemetry/error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => { /* offline / no backend — ignore */ });
    }
  } catch { /* telemetry must never break the app */ }
}

/** Install the global error + unhandledrejection handlers. Idempotent. */
export function initObservability(): void {
  if (_installed) return;
  _installed = true;

  window.addEventListener('error', (e: ErrorEvent) => {
    send({
      kind: 'error',
      message: e.message,
      stack: e.error instanceof Error ? e.error.stack : undefined,
      source: e.filename,
      line: e.lineno,
      col: e.colno,
    });
  });

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const r = e.reason;
    send({
      kind: 'unhandledrejection',
      message: r instanceof Error ? r.message : String(r),
      stack: r instanceof Error ? r.stack : undefined,
    });
  });
}
