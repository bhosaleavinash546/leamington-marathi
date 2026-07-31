import { test, expect, type Page } from '@playwright/test';

/**
 * The राशी ⇄ नवमांश migration (DESIGN.md §4.2) — the app's one orchestrated moment.
 *
 * > each graha glyph travels from its D1 house to its D9 house … Grahas whose
 * > house is unchanged do not move (they hold — which is itself information).
 *
 * The thing worth testing is not "an animation happened". It is that the glyphs
 * arrive **where the engine says they belong**: a migration that moves everything
 * to a plausible-looking place is exactly as pretty and completely wrong. So the
 * destinations are checked against the D9 chart's own rendering.
 */

const BIRTH = new URLSearchParams({
  name: 'नमुना',
  date: '1990-08-17',
  time: '05:42',
  time_accuracy: 'exact',
  place: 'पुणे',
  lat: '18.5204',
  lon: '73.8567',
  tz: 'Asia/Kolkata',
});
const PATRIKA = `/mr/kundali?${BIRTH}`;

/** Which house each graha occupies in a given chart, read from the DOM. */
async function housesOf(page: Page, varga: 'D1' | 'D9'): Promise<Record<string, number>> {
  return page.evaluate((v) => {
    const out: Record<string, number> = {};
    const slot = document.querySelector(`.charts__slot[data-varga="${v}"]`);
    for (const span of slot?.querySelectorAll<SVGTSpanElement>('.k-graha [data-graha]') ?? []) {
      const text = span.closest('.k-graha') as SVGElement | null;
      if (span.dataset.graha && text?.dataset.house) {
        out[span.dataset.graha] = Number(text.dataset.house);
      }
    }
    return out;
  }, varga);
}

test.describe('D1 to D9 migration', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'reduced-motion', 'the reduced path is its own spec');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(PATRIKA);
    await page.waitForTimeout(1000); // let the draw-in finish
    // Focus first. The migration is D1 <-> D9; entering focus from "compare" is
    // a layout change, and the charts only share a box once focused.
    await page.getByRole('button', { name: 'राशी कुंडली' }).click();
    await page.waitForTimeout(200);
  });

  test('grahas fly, and land where the D9 chart puts them', async ({ page }) => {
    const d1 = await housesOf(page, 'D1');
    const d9 = await housesOf(page, 'D9');
    const shouldMove = Object.keys(d1).filter((key) => d9[key] !== undefined && d9[key] !== d1[key]);
    expect(shouldMove.length, 'this birth has no graha that changes house').toBeGreaterThan(0);

    await page.getByRole('button', { name: 'नवमांश कुंडली' }).click();

    // Mid-flight: clones exist, one per graha that changes house.
    await page.waitForFunction(() => document.querySelectorAll('.graha-flight__glyph').length > 0, {
      timeout: 3000,
    });
    expect(await page.locator('.graha-flight__glyph').count(), 'no graha left its house').toBe(
      shouldMove.length,
    );

    // The assertion that matters: each clone is aimed at where the *D9 chart*
    // actually puts that graha, measured live in the layout it is flying into.
    // A migration that moves everything somewhere plausible is exactly as pretty
    // and completely wrong.
    const aim = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.graha-flight__glyph')].map((clone) => {
        const key = clone.dataset.graha!;
        const frames = clone.getAnimations()[0]?.effect as KeyframeEffect | undefined;
        const last = frames?.getKeyframes().at(-1)?.transform as string | undefined;
        const [dx, dy] = [...(last ?? '').matchAll(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/g)]
          .at(-1)!
          .slice(1)
          .map(Number);
        const landing = [
          parseFloat(clone.style.left) - window.scrollX + (dx ?? 0),
          parseFloat(clone.style.top) - window.scrollY + (dy ?? 0),
        ];
        const real = document
          .querySelector(`.charts__slot[data-varga="D9"] [data-graha="${key}"]`)!
          .getBoundingClientRect();
        return {
          key,
          landing,
          actual: [real.left + real.width / 2, real.top + real.height / 2],
        };
      }),
    );
    expect(aim.length).toBe(shouldMove.length);
    for (const { key, landing, actual } of aim) {
      expect(Math.abs(landing[0]! - actual[0]!), `${key} aimed at the wrong x`).toBeLessThan(2);
      expect(Math.abs(landing[1]! - actual[1]!), `${key} aimed at the wrong y`).toBeLessThan(2);
    }

    // And the layer cleans up after itself.
    await page.waitForFunction(
      () => document.querySelectorAll('.graha-flight__glyph').length === 0,
      { timeout: 3000 },
    );
    const stillHidden = await page.evaluate(
      () =>
        [
          ...document.querySelectorAll<SVGTSpanElement>(
            '.charts__slot[data-varga="D9"] .k-graha [data-graha]',
          ),
        ].filter((span) => span.style.visibility === 'hidden').length,
    );
    expect(stillHidden, 'a graha was left hidden after landing').toBe(0);
  });

  test('a graha in the same house in both does not move', async ({ page }) => {
    // Most births move every graha between D1 and D9, so the default one leaves
    // this requirement untested. Search a few until one holds; a skip here would
    // read as "passing" for a branch nothing had exercised.
    const candidates = ['1990-08-17', '1985-03-02', '1972-11-30', '2001-06-21', '1966-01-09'];
    let d1: Record<string, number> = {};
    let d9: Record<string, number> = {};
    let found = false;
    for (const date of candidates) {
      const params = new URLSearchParams(BIRTH);
      params.set('date', date);
      await page.goto(`/mr/kundali?${params}`);
      await page.waitForTimeout(600);
      d1 = await housesOf(page, 'D1');
      d9 = await housesOf(page, 'D9');
      if (Object.keys(d1).some((key) => d9[key] === d1[key])) {
        await page.getByRole('button', { name: 'राशी कुंडली' }).click();
        await page.waitForTimeout(200);
        found = true;
        break;
      }
    }
    expect(found, `no birth among ${candidates.join(', ')} holds a graha`).toBe(true);

    await page.getByRole('button', { name: 'नवमांश कुंडली' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.graha-flight__glyph').length > 0, {
      timeout: 3000,
    });
    const flying = await page.locator('.graha-flight__glyph').count();
    const moved = Object.keys(d1).filter((key) => d9[key] !== undefined && d9[key] !== d1[key]);
    // §4.2: holding still is information. A held graha must not be given a clone.
    expect(flying, 'a graha that holds was animated anyway').toBe(moved.length);
  });

  test('the flight uses the orchestration duration, not longer', async ({ page }) => {
    await page.getByRole('button', { name: 'नवमांश कुंडली' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.graha-flight__glyph').length > 0, {
      timeout: 3000,
    });
    const durations = await page.evaluate(() =>
      [...document.querySelectorAll('.graha-flight__glyph')].flatMap((glyph) =>
        glyph.getAnimations().map((a) => Number(a.effect?.getComputedTiming().duration ?? 0)),
      ),
    );
    expect(durations.length).toBeGreaterThan(0);
    // §3.2: --dur-orch is 500ms and is "the ceiling" for an orchestrated reveal.
    for (const duration of durations) expect(duration).toBeLessThanOrEqual(500);
  });
});

test.describe('D1 to D9 migration under reduced motion', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'reduced-motion', 'needs the preference forced');
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('is a hard cut — nothing flies', async ({ page }) => {
    await page.goto(PATRIKA);
    expect(
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    ).toBe(true);
    await page.getByRole('button', { name: 'राशी कुंडली' }).click();
    await page.getByRole('button', { name: 'नवमांश कुंडली' }).click();
    await page.waitForTimeout(300);
    // §3.4: "D1→D9 morph: hard cut with a 120ms crossfade." No flight layer at all.
    expect(await page.locator('.graha-flight__glyph').count()).toBe(0);
    await expect(page.locator('.charts--D9')).toBeVisible();
  });
});
