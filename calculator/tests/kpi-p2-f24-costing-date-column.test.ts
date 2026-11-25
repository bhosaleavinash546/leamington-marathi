/**
 * Phase 2 · F-24 (polish): the records-table column that shows the costing date is called "Costing date", not
 * "Created" (it never showed the created timestamp). The Excel / CSV keep both columns, "Costing date" and
 * "Created" (the real created timestamp), unchanged.
 */
import { describe, it, expect } from 'vitest';
import { TABLE_COLUMNS, recordsTableHtml, type RecordRowView } from '../src/ui/kpi-dashboard/kpi-builders';
import { RECORD_COLUMNS } from '../src/engine/kpi-dashboard';

const row = {
  id: 'rec-1', sourceTool: 'CostVision', sourceRef: 'sc-1', ownerName: 'A', partNumber: 'P', componentName: 'C', commodity: 'Casting', programme: 'L460',
  modelYear: 2027, powertrain: 'BEV', country: 'UK', status: 'completed', costingDate: '2026-10-01', createdAt: '2026-11-11T09:00:00Z', updatedAt: '2026-11-11T09:00:00Z',
  currentCost: 12, currentCcy: 'GBP', shouldCost: 10, shouldCcy: 'GBP', gbpCurrent: 12, gbpShould: 10, gapGbp: 2, gapPct: 16.7, role: 'current', eligible: true,
  ineligible: null, excluded: null, invalidReasons: [], fx: {},
} as unknown as RecordRowView;

describe('F-24: the records table says "Costing date"', () => {
  it('the costingDate column is labelled "Costing date" and no column is labelled "Created"', () => {
    expect(TABLE_COLUMNS.find(c => c.key === 'costingDate')?.label).toBe('Costing date');
    expect(TABLE_COLUMNS.some(c => c.label === 'Created')).toBe(false);
    const html = recordsTableHtml([row], 'costingDate', 'desc', 'gbp');
    expect(html).toContain('data-sort="costingDate">Costing date<');
    expect(html).toContain('01 Oct 2026');   // the cell is the costing date
  });
  it('the CSV keeps both columns', () => {
    expect(RECORD_COLUMNS.find(c => c.key === 'costingDate')?.label).toBe('Costing date');
    expect(RECORD_COLUMNS.find(c => c.key === 'createdAt')?.label).toBe('Created');
  });
});
