/**
 * Phase 2 · A-05 follow-up (independent review, issue 3): the wording around the A-05 rule.
 *  - The owner's edit form on a reviewed / approved costing said "Changing the current cost sends this costing back
 *    for review", but the form sends the current status, so such a save is refused (400) unless the status is set to
 *    Completed. The note now says what to do.
 *  - The refusal named raw field ids ("currentCost") and read "a approved". It now uses the form's labels and the
 *    right article. The rule itself is unchanged (Stop 1 decision).
 */
import { describe, it, expect } from 'vitest';
import { editFormNote } from '../src/ui/kpi-dashboard/kpi-view';
import { resetRefusal } from '../server/utils/kpi-edit-wording';

describe('A-05 wording: edit-form note', () => {
  it('an owner on an approved or reviewed costing is told to set the status to Completed', () => {
    for (const s of ['approved', 'reviewed'] as const) {
      const t = editFormNote(false, s);
      expect(t).toMatch(/set the status to Completed/);
      expect(t).not.toMatch(/sends this costing back/);
    }
  });
  it('no such sentence for an admin or for a costing that is not admin-set', () => {
    expect(editFormNote(true, 'approved')).not.toMatch(/Completed/);
    expect(editFormNote(false, 'completed')).not.toMatch(/Completed/);
    expect(editFormNote(false, 'completed')).toMatch(/re-freezes only that value/);
  });
});

describe('A-05 wording: the 400 refusal', () => {
  it('uses field labels and the right article', () => {
    const m = resetRefusal(['currentCost', 'annualVolume'], 'approved');
    expect(m).toMatch(/^Changing the current cost and the annual volume returns an approved costing to Completed\./);
    expect(m).not.toMatch(/currentCost|annualVolume|a approved/);
    expect(resetRefusal(['programme'], 'reviewed')).toMatch(/^Changing the programme returns a reviewed costing to Completed\./);
    expect(resetRefusal(['partNumber', 'modelYear', 'powertrain'], 'approved')).toMatch(/^Changing the part number, the model year and the powertrain /);
  });
});
