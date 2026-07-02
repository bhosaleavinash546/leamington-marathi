import { describe, it, expect } from 'vitest';
import { errorReportSchema, summariseError } from '../server/routes/telemetry.js';

describe('errorReportSchema', () => {
  it('accepts a well-formed report', () => {
    const r = errorReportSchema.safeParse({
      kind: 'error', message: 'boom', stack: 'Error: boom\n  at f', source: 'app.js',
      line: 12, col: 3, url: 'https://x/y', ua: 'Mozilla', ts: '2026-06-30T00:00:00Z',
      mode: 'production', breadcrumbs: ['app:init', 'commodity:pcb_fab'],
    });
    expect(r.success).toBe(true);
  });

  it('requires kind', () => {
    expect(errorReportSchema.safeParse({ message: 'no kind' }).success).toBe(false);
  });

  it('bounds oversized fields (rejects a 9 KB stack / 3 KB message)', () => {
    expect(errorReportSchema.safeParse({ kind: 'error', stack: 'x'.repeat(9000) }).success).toBe(false);
    expect(errorReportSchema.safeParse({ kind: 'error', message: 'm'.repeat(3000) }).success).toBe(false);
  });

  it('caps the breadcrumb trail at 20 entries', () => {
    const many = Array.from({ length: 21 }, (_, i) => `b${i}`);
    expect(errorReportSchema.safeParse({ kind: 'error', breadcrumbs: many }).success).toBe(false);
  });

  it('rejects non-finite line numbers', () => {
    expect(errorReportSchema.safeParse({ kind: 'error', line: Infinity }).success).toBe(false);
  });
});

describe('summariseError', () => {
  it('includes kind, message, source location and url', () => {
    const s = summariseError({ kind: 'error', message: 'boom', source: 'app.js', line: 12, col: 3, url: 'https://x/y' });
    expect(s).toContain('error');
    expect(s).toContain('boom');
    expect(s).toContain('app.js:12:3');
    expect(s).toContain('https://x/y');
  });

  it('handles a missing message and source gracefully', () => {
    const s = summariseError({ kind: 'unhandledrejection' });
    expect(s).toContain('unhandledrejection');
    expect(s).toContain('(no message)');
  });
});
