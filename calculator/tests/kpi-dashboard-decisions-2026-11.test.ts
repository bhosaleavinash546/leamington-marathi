/**
 * KPI dashboard decisions approved 25 Nov 2026: D-8 sign-up by domain allowlist (A-01), A-11 option 2 (part numbers
 * folded, programme spelling variants counted). D-4 (owner withdraws / deletes with a reason) is in
 * tests/kpi-p2-a05-owner-powers.test.ts; the sign-up refusal over HTTP in tests/review-360.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { signupAllowed, signupDomains } from '../server/utils/signup-policy';
import { classifyRecords, dataQuality, type KpiRecord } from '../src/engine/kpi-dashboard';

describe('D-8: who may create an account', () => {
  it('closed by default; open to listed domains (case and a leading @ ignored) and to listed admins', () => {
    expect(signupAllowed('a@acme.com', {})).toBe(false);
    const env = { CV_SIGNUP_DOMAINS: ' ACME.com, @partner.co.uk ', ADMIN_EMAILS: 'boss@gmail.example' };
    expect(signupDomains(env)).toEqual(['acme.com', 'partner.co.uk']);
    expect(signupAllowed('Jo@Acme.com', env)).toBe(true);
    expect(signupAllowed('x@partner.co.uk', env)).toBe(true);
    expect(signupAllowed('x@sub.acme.com', env)).toBe(false);   // exact domain only
    expect(signupAllowed('x@acme.com.evil.example', env)).toBe(false);
    expect(signupAllowed('boss@gmail.example', env)).toBe(true);   // an admin can always register first
    expect(signupAllowed('other@gmail.example', env)).toBe(false);
  });
});

const rec = (id: string, p: Partial<KpiRecord>): KpiRecord => ({
  id, sourceTool: 'CSS System', sourceRef: id, ownerId: 'u1', ownerName: 'U', partNumber: 'P-1', componentName: 'Part', commodity: 'Casting',
  programme: 'L460', modelYear: 2027, powertrain: 'BEV', country: 'GB', status: 'completed', costingDate: '2026-10-01',
  createdAt: '2026-10-01T09:00:00Z', updatedAt: '2026-10-01T09:00:00Z', shouldCost: 5, shouldCcy: 'GBP', shouldTerms: 'DAP',
  currentCost: 6, currentCcy: 'GBP', currentTerms: 'DAP', currentSource: null, costUnit: 'piece', annualVolume: null, volumeValidated: false,
  savingStatus: null, savingPerPiece: null, savingCcy: null, fx: {}, gbpShould: 5, gbpCurrent: 6, gbpSaving: null, isTest: false, deleted: false, notes: '', ...p,
});

describe('A-11 option 2: programme spelling variants are counted, not merged', () => {
  it('Q900 / q900 on one part are two current applications and one data-quality variant', () => {
    const cls = classifyRecords([rec('a', { partNumber: 'P-16', programme: 'Q900' }), rec('b', { partNumber: 'P16', programme: 'q900', ownerId: 'u2' }),
      rec('c', { partNumber: 'P-17', programme: 'Q900' }), rec('d', { partNumber: 'P-18', programme: 'L460' })]);
    expect(cls.filter(r => r.role === 'current')).toHaveLength(4);
    const inc = cls.filter(r => !r.excluded);
    expect(dataQuality(cls, inc, []).programmeSpellingVariants).toBe(1);
  });
});
