/** Section wall thickness off the main thread (0.2–0.8 s on a big cut) — see cad-section-thickness.ts. */
import { sectionThickness } from './cad-section-thickness.js';
import type { SectionResult } from './cad-section.js';

self.onmessage = (ev: MessageEvent<{ id: number; sections: SectionResult[] }>) => {
  const { id, sections } = ev.data;
  try {
    (self as unknown as Worker).postMessage({ id, results: sections.map(s => sectionThickness(s)) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
