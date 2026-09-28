/**
 * Brand tokens for TypeScript: the app's PDF export and the rate-card workbook
 * builder read colours from here, and brand.css is generated from the same
 * brand.json for the app's light theme (I5: one identity across the app and
 * its documents).
 */
import brand from './brand.json';

export type BrandColour = keyof typeof brand.onLight;
export const BRAND = brand;

/** "16325C" → [22, 50, 92] (jsPDF colours). */
export function brandRgb(name: BrandColour): [number, number, number] {
  const h = brand.onLight[name];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** "16325C" → "FF16325C" (ExcelJS ARGB). */
export function brandArgb(name: BrandColour): string {
  return 'FF' + brand.onLight[name];
}
