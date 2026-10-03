/**
 * Which library grades each commodity form's material drop-down offers, keyed
 * by the <select> id and matched (case-insensitive) against a material's
 * `category`. Keeps a forging picker on billets and a moulding picker on resins
 * instead of all ~320 grades. A select id not listed offers the full catalogue.
 *
 * Kept out of main.ts because the rules must never pick a grade the form
 * cannot show: the form only accepts a value its list offers, and a rejected
 * value leaves the drop-down on its FIRST option. That is how a steel casting
 * was priced at the aluminium die-cast alloy's rate on screen (2 Oct 2026).
 * tests/material-scope-parity.test.ts checks every representative grade
 * against the drop-down it lands in.
 */
export const MATERIAL_SCOPE_BY_SELECT: Record<string, RegExp> = {
  'forge-mat': /Billet/i,                                                                    // closed-die forging → wrought billets
  'mach-mat':  /Billet|^Carbon Steel$|^Alloy Steel$|^Stainless Steel$|^Aluminium$|^Titanium$|Copper Alloy|Magnesium Alloy|Spring Steel|Engineering Plastic|Grey Cast Iron|Ductile Cast Iron/i, // machined from bar/billet, incl. continuous-cast iron bar
  'cast-mat':  /Cast|Iron|HPDC|Die Cast|Gravity\/Sand|Zinc Die|Magnesium Alloy|^Copper Alloy$/i, // foundry alloys (cast bronze sits under Copper Alloy)
  'cam-mat':   /Cast|Iron|HPDC|Die Cast|Gravity\/Sand|Zinc Die|Magnesium Alloy|^Copper Alloy$/i, // cast-and-machine = cast alloys
  'imm-mat':   /Thermoplastic|Engineering Plastic|Additive|Masterbatch/i,                    // injection-moulding resins
  'bm-mat':    /Blow Moulding|Thermoplastic Elastomer/i,                                      // blow-moulding grades
  'rm-mat':    /Rotational Moulding/i,
  'tf-mat':    /Thermoforming/i,
  'ext-mat':   /^Extrusion$/i,                                                                 // polymer grades only — /Extrusion/ also offered the aluminium billets (review, Oct 2026)
  'rub-mat':   /Rubber|Thermoplastic Elastomer/i,
  'sm-mat':    /Sheet|Spring Steel Strip/i,                                                   // sheet-metal grades
  'smf-mat':   /Sheet|Spring Steel Strip/i,
};
