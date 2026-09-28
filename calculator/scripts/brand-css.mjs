// Generates src/ui/styles/brand.css from src/brand/brand.json (I5).
// The app's light theme takes its accents and status colours from the brand;
// the dark theme keeps the brighter onDark variants of the same hues.
//   node scripts/brand-css.mjs            write the file
//   node scripts/brand-css.mjs --check    exit 1 if it is out of date
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = JSON.parse(readFileSync(join(ROOT, 'src/brand/brand.json'), 'utf8'));
const L = b.onLight, D = b.onDark, h = x => '#' + x;

const css = `/* GENERATED from src/brand/brand.json by scripts/brand-css.mjs — do not edit.
   One identity across the app and its documents (review I5): the decks, the
   rate-card workbook and the PDF export use the same brand colours. */
[data-theme="light"] {
  --accent: ${h(L.blue)};
  --accent-dark: ${h(L.navy)};
  --accent-light: ${h(L.blueTint)};
  --accent2: ${h(L.violet)};
  --accent3: ${h(L.teal)};
  --blue: ${h(L.blue)};      --blue-bg: ${h(L.blueTint)};
  --green: ${h(L.green)};    --green-bg: ${h(L.greenTint)};
  --amber: ${h(L.amber)};    --amber-bg: ${h(L.amberTint)};
  --red: ${h(L.red)};        --red-bg: ${h(L.redTint)};
  --brand-navy: ${h(L.navy)};
}
html:not([data-theme="light"]) {
  --accent: ${h(D.blue)};
  --accent2: ${h(D.violet)};
  --brand-navy: ${h(L.navy)};
}
`;
const out = join(ROOT, 'src/ui/styles/brand.css');
if (process.argv.includes('--check')) {
  const cur = (() => { try { return readFileSync(out, 'utf8'); } catch { return ''; } })();
  if (cur !== css) { console.error('brand.css is out of date — run node scripts/brand-css.mjs'); process.exit(1); }
  console.log('brand.css is up to date');
} else {
  writeFileSync(out, css);
  console.log('wrote', out);
}
