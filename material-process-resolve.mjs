/**
 * CostVision — Free-text → catalogue resolver
 * ------------------------------------------------------------------
 * Maps a freely-typed material / manufacturing process onto a should-cost
 * catalogue key. Lives next to the engine and reads MATERIALS / PROCESSES
 * directly, so it CANNOT drift from the catalogue the way a hand-maintained
 * client-side copy did.
 *
 *   resolveMaterial('ductile cast iron') -> { key: 'Cast Iron (Ductile/GJS)', approx: true }
 *   resolveProcess('sand casting')       -> { key: 'Sand Casting', approx: true }
 *
 * Returns null when nothing sensible matches. `approx` is false for an exact
 * (case-insensitive) catalogue hit, true for a fuzzy/alias match.
 *
 * Pure & dependency-free apart from the engine catalogues.
 */
import { MATERIALS, PROCESSES } from './costing-engine.mjs';

const norm = (s) => String(s || '').trim().toLowerCase();

// Exact (case-insensitive) catalogue hit, else null.
function exact(typed, keys) {
  const t = norm(typed);
  return keys.find(k => k.toLowerCase() === t) || null;
}

export function resolveMaterial(typed, materials = MATERIALS) {
  const keys = Object.keys(materials);
  const t = norm(typed);
  if (!t) return null;
  const ex = exact(typed, keys);
  if (ex) return { key: ex, approx: false };
  const has = (kw) => keys.find(k => k.toLowerCase().includes(kw));
  let key = null;
  if (/grey iron|gray iron|grey cast|gray cast|\bgg\d|gg-?\d|gjl/.test(t)) key = has('cast iron (grey') || has('cast iron') || has('steel');
  else if (/iron|gjs|ggg|nodular|ductile|sg iron|spheroidal/.test(t)) key = has('ductile') || has('cast iron') || has('steel');
  else if (/titan|ti-?6al|ti6al|tc4|grade ?5 ti/.test(t)) key = has('titanium');
  else if (/zamak|zamac|\bzdc\b|\bzp\d|zinc alloy/.test(t)) key = has('zinc');
  else if (/brass|bronze|copper|cuzn|cusn|\bc\d{5}/.test(t)) key = has('brass') || has('copper');
  else if (/steel|dp\d|hsla|22mnb5|boron|ss30|stainless|c45|s355|crmo|mncr|nicr|nimo|42cr/.test(t)) {
    key = (has('stainless') && /stainless|304|316/.test(t)) ? has('stainless')
        : (has('high-strength') && /hsla|dp|boron|22mnb5|advanced|crmo|nicr|nimo|42cr|high.?strength/.test(t)) ? has('high-strength')
        : has('steel');
  }
  else if (/7075/.test(t)) key = has('7075') || has('alumin');
  else if (/a3\d\d|ac4|adc\d|alsi|silumin|\bal-?si|cast alumin/.test(t)) key = has('a356') || has('6061') || has('alumin');
  else if (/alumin|aluminum|\bal\b|60\d\d/.test(t)) key = has('6061') || has('alumin');
  else if (/magnes|\bmg\b|az\d\d|am\d\d|ae44/.test(t)) key = has('magnes');
  else if (/cfrp|carbon fib|carbon-fib|composite|gfrp|\bfrp\b|prepreg/.test(t)) key = has('cfrp') || has('carbon');
  else if (/glass.?fill|gf\d\d|\bgf\b|pa66/.test(t)) key = has('gf30') || has('pa66') || has('pa6') || has('nylon');
  else if (/pa6|nylon|polyamide/.test(t)) key = has('pa6') || has('nylon');
  else if (/pom|acetal|delrin/.test(t)) key = has('pom') || has('acetal');
  else if (/polycarb|\bpc\b|lexan|makrolon/.test(t)) key = has('polycarb') || has('(pc)');
  else if (/\babs\b/.test(t)) key = has('abs');
  else if (/\bpp\b|polyprop/.test(t)) key = has('polyprop') || has('pp');
  return key ? { key, approx: true } : null;
}

export function resolveProcess(typed, processes = PROCESSES) {
  const keys = Object.keys(processes);
  const t = norm(typed);
  if (!t) return null;
  const ex = exact(typed, keys);
  if (ex) return { key: ex, approx: false };
  const has = (kw) => keys.find(k => k.toLowerCase().includes(kw));
  let key = null;
  if (/stamp|sheet metal|press|deep draw|blank/.test(t)) key = has('stamp');
  else if (/roll form/.test(t)) key = has('roll form') || has('stamp');
  else if (/hydroform/.test(t)) key = has('hydroform');
  else if (/laser/.test(t)) key = has('laser');
  else if (/rtm|prepreg|autoclave|layup|lay-up|hand lai|composite mould|composite mold/.test(t)) key = has('composite');
  else if (/sand cast|green sand|sand mould|sand mold/.test(t)) key = has('sand casting') || has('casting');
  else if (/invest|lost wax|precision cast|shell mould|shell mold/.test(t)) key = has('investment') || has('casting');
  else if (/gravity|permanent mould|permanent mold|gdc\b|tilt pour/.test(t)) key = has('gravity die') || has('die casting (alumin') || has('casting');
  else if (/zinc die|zamak|\bzdc\b|zinc cast/.test(t)) key = has('die casting (zinc') || has('casting');
  else if (/hpdc|ldc|die.?cast|pressure die|pressure cast|squeeze cast/.test(t)) key = has('die casting (alumin') || has('casting');
  else if (/cast/.test(t)) key = has('sand casting') || has('die casting (alumin') || has('casting');
  else if (/cold forg/.test(t)) key = has('forging (cold') || has('forging');
  else if (/forg/.test(t)) key = has('forging (hot') || has('forging');
  else if (/machin|cnc|mill|turn|billet|vmc|hmc|lathe/.test(t)) key = has('machining');
  else if (/mould|mold|inject/.test(t)) key = has('injection') || has('moulding');
  else if (/extru/.test(t)) key = has('extrusion');
  else if (/spot weld|resistance weld/.test(t)) key = has('spot weld') || has('welding');
  else if (/weld|mig|tig|braze/.test(t)) key = has('mig') || has('welding');
  return key ? { key, approx: true } : null;
}
