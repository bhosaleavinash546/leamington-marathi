/**
 * Sourced country service prices (round 30 Oct 2026): a country book's `services` entry — the same service priced in
 * the country and in the UK — sets that service's factor (local ÷ UK) in place of the factor derived from wage and
 * machine ratios, and the basis line says which one applied.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { COUNTRY_BOOKS, sourcedServiceFactor } from '../src/engine/country-books.js';
import { countryFactor, countryNote, heatTreatServiceFactor } from '../src/engine/regional-services.js';
import { toolroomFactorFor, REGIONAL_DATA } from '../src/engine/regional-rates.js';

const book = COUNTRY_BOOKS.HU!;
const saved = book.services;
afterEach(() => { book.services = saved; });

describe('sourced country service prices', () => {
  it('a sourced service outranks the derived factor, and says so', () => {
    const derivedTool = toolroomFactorFor('HU');
    const derivedHt = heatTreatServiceFactor('HU');
    book.services = {
      toolroom: { what: 'toolmaker shop rate', unit: 'per hour', localPerUnit: 21_888, ukGbpPerUnit: 62.5, basis: 'test', source: 'test', confidence: 'Low' },
      heatTreat: { what: 'quench & temper', unit: 'per kg', localPerUnit: 350, ukGbpPerUnit: 1.1, basis: 'test', source: 'test', confidence: 'Low' },
    };
    const fx = REGIONAL_DATA.HU.fxToGBP;
    expect(toolroomFactorFor('HU')).toBeCloseTo(21_888 / fx / 62.5, 4);
    expect(countryFactor('toolroom', 'HU')).toBeCloseTo(21_888 / fx / 62.5, 4);
    expect(countryFactor('heatTreat', 'HU')).toBeCloseTo(350 / fx / 1.1, 4);
    expect(countryNote('heatTreat', 'HU')).toMatch(/sourced: quench & temper Ft350 per kg v UK £1\.1 per kg/);
    expect(toolroomFactorFor('HU')).not.toBe(derivedTool);
    expect(countryFactor('heatTreat', 'HU')).not.toBe(derivedHt);
  });
  it('without one the factor is the derived ratio, labelled as derived; the UK and traded goods never move', () => {
    book.services = undefined;
    expect(sourcedServiceFactor('HU', 'toolroom')).toBeNull();
    expect(countryNote('process', 'HU')).toMatch(/derived from its wage and machine rates/);
    expect(countryFactor('toolroom', 'UK')).toBe(1);
    expect(countryFactor('global', 'HU')).toBe(1);
  });
});
