// Icons for the pipeline slide, rasterised once into a JSON blob.
//
// The deck generator must not depend on `sharp` and `react-icons` at build
// time: neither is a dependency of this project, they live in a scratch
// install, and a deck that cannot be regenerated six months from now because an
// optional npm package moved is a deck that quietly goes stale. So the PNGs are
// baked here and committed as data.
//
//   node scripts/make-deck-icons.mjs      (only when the icon set changes)
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const req = createRequire('/tmp/node_modules/');
const React = req('react');
const { renderToStaticMarkup } = req('react-dom/server');
const sharp = req('sharp');
const Fi = req('react-icons/fi');

// One icon per pipeline stage, chosen to read at 40 px on a projector rather
// than to be clever: a file, a cube, a ruler, a checklist, a price tag, a
// document.
const SET = {
  upload: Fi.FiUploadCloud,
  solid: Fi.FiBox,
  measure: Fi.FiCrosshair,
  judge: Fi.FiCheckSquare,
  price: Fi.FiDollarSign,
  report: Fi.FiFileText,
  assembly: Fi.FiLayers,
  clock: Fi.FiClock,
};

const out = {};
for (const [name, Icon] of Object.entries(SET)) {
  // White strokes: every icon on this slide sits inside a filled circle, so a
  // dark glyph would disappear. Rendering white once beats tinting later.
  const svg = renderToStaticMarkup(
    React.createElement(Icon, { size: 256, color: '#FFFFFF', strokeWidth: 2 }),
  );
  const png = await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer();
  out[name] = png.toString('base64');
}
writeFileSync(new URL('./deck-icons.json', import.meta.url), JSON.stringify(out));
console.log(`baked ${Object.keys(out).length} icons`);
