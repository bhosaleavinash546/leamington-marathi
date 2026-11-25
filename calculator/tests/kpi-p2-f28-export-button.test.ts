/**
 * Phase 2 · F-28 (polish): the header's Export button has the same secondary style as the other header buttons
 * (Refresh, Admin). It was the page's only primary (filled accent) button, louder than the actions it sits with.
 */
import { describe, it, expect } from 'vitest';

describe('F-28: Export uses the secondary header style', () => {
  it('Export, Refresh and Admin share one class list', async () => {
    const { shell } = await import('../src/ui/kpi-dashboard/kpi-view');
    const html = shell();
    const cls = (act: string) => html.match(new RegExp(`<button type="button" class="([^"]+)" data-act="${act}"`))?.[1];
    expect(cls('export-menu')).toBe('btn btn-secondary btn-sm');
    expect(cls('export-menu')).toBe(cls('refresh'));
    expect(cls('export-menu')).toBe(cls('admin'));
    expect(html.slice(0, html.indexOf('</div>\n    </div>'))).not.toContain('btn-primary');
  });
});
