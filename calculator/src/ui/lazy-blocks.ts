/**
 * Build rarely-opened blocks when they are first shown (UI/UX review, Oct 2026, item 7).
 *
 * Every screen carried about 7,000 elements. A census showed most were in blocks
 * that are hidden nearly all the time: the Help centre (2,170 elements) and the demo
 * gallery (1,255). Their content now sits in `<template data-cv-lazy>` in index.html.
 * The browser parses it but builds no elements, and it is not styled, laid out or
 * found by queries. The first time the modal is shown, each template is replaced by
 * its content.
 *
 * Scripts inside a template (the help demo players, the guide picker) are recreated
 * before insertion so each runs once, after its own markup exists, as it did inline.
 * Each modal's shell (tabs, search box, close button, ids) stays live in the page, so
 * code that binds to it at load is unaffected.
 */

/** Replace every lazy template under `root` with its content. Idempotent. */
export function hydrate(root: ParentNode, doc: Document = document): number {
  const templates = Array.from(root.querySelectorAll<HTMLTemplateElement>('template[data-cv-lazy]'));
  for (const t of templates) {
    const frag = doc.importNode(t.content, true);
    frag.querySelectorAll('script').forEach(old => {
      const s = doc.createElement('script');
      for (const a of Array.from(old.attributes)) s.setAttribute(a.name, a.value);
      s.textContent = old.textContent;
      old.replaceWith(s);
    });
    t.replaceWith(frag);
  }
  return templates.length;
}

/** Hydrate `id` the first time it becomes visible (its inline style stops saying display:none). */
export function hydrateOnShow(id: string, doc: Document = document): void {
  const el = doc.getElementById(id);
  if (!el || !el.querySelector('template[data-cv-lazy]')) return;
  const check = () => {
    if (el.style.display === 'none' || getComputedStyle(el).display === 'none') return false;
    obs.disconnect();
    hydrate(el, doc);
    return true;
  };
  const obs = new MutationObserver(check);
  obs.observe(el, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  check();
}
