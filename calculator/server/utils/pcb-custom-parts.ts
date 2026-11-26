/**
 * Customer-specific parts (BMW inverter review, 27 Nov 2026). A part made to one customer's drawing — a custom-wound
 * gate-drive transformer "XFMRS 2539 BMW-8-15T", a bespoke connector, an OEM-numbered part — has no public price: the
 * tool prices it as its class equivalent, and that is a placeholder, not a should-cost of the part. It is said so on the
 * line, put first in the verify list and named in a warning: get a quote.
 *
 * A line is customer-specific when its BOM text says so (custom / customer part / bespoke / made to drawing), or its part
 * number carries a vehicle maker's name as a word (BMW-8-15T, VW-…), and the catalogue has no exact entry for it.
 */
type Line = Record<string, unknown>;

const SAYS_CUSTOM = /\bcustom(er)?[- ](specific|part|made|wound|winding|design(ed)?)\b|\bcustomer part\b|\bbespoke\b|\bmade to (the )?(customer'?s? )?drawing\b|\bOEM[- ]specific\b/i;
/** Vehicle makers whose name in a PART NUMBER marks an OEM-specific part — bounded by non-letters ("2539BMW-8" with the
 *  spaces taken out still reads; "FORDx" does not). Two-letter codes that are also units or prefixes (MB, GM) are left out. */
const OEM_IN_PN = /(^|[^A-Z])(BMW|VW|VAG|AUDI|PORSCHE|DAIMLER|MERCEDES|JLR|FORD|STELLANTIS|TOYOTA|TESLA|VOLVO|HYUNDAI|KIA|RENAULT|NISSAN|HONDA|BYD|GEELY|NIO)([^A-Z]|$)/;

export function isCustomerSpecific(l: Line): boolean {
  if (l.priceSource === 'catalogue' && l.catalogueExact === true) return false;   // a catalogued code has a public price
  const pn = String(l.partNumber ?? '').toUpperCase();
  const text = `${String(l.description ?? '')} ${String(l.manufacturer ?? '')}`;
  return SAYS_CUSTOM.test(text) || OEM_IN_PN.test(pn);
}

/** Marks the customer-specific lines (to verify, with the reason on the price note). Returns the part names for a warning. */
export function flagCustomParts(bom: Line[]): { bom: Line[]; names: string[] } {
  const names: string[] = [];
  const out = bom.map(l => {
    if (l.userCorrected === true || l.priceSource === 'user' || !isCustomerSpecific(l)) return l;
    names.push(String(l.partNumber || l.description || l.refDes));
    return { ...l, customPart: true, needsVerification: true,
      priceNote: `Customer-specific part — no public price; priced as its class equivalent, a placeholder: get a quote. · ${String(l.priceNote ?? '')}` };
  });
  return { bom: out, names };
}
