import { test, expect, type Page } from '@playwright/test';

/**
 * The kundali draw-in (DESIGN.md §4.1).
 *
 * The guard is the part worth testing hardest. §4.1:
 *
 * > **Guard it**: fire only on first mount per chart id. Re-render, tab return,
 * > locale switch and theme switch must not replay it. Replaying a draw-in on
 * > every re-render is the most common motion bug in this class of app.
 *
 * Each of those four is a separate test below, because each fails differently: a
 * module-level guard survives a re-render and a theme switch but not the locale
 * switch, which is a full document navigation in this app.
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

/**
 * Wait until the draw-in has started.
 *
 * `page.goto` resolves on `load`, which is before hydration has run the effect,
 * and the whole sequence is over inside 800ms. Sampling at a fixed moment either
 * catches nothing yet or nothing left, so the tests wait for the transition
 * instead of guessing where it is.
 */
async function waitForDrawIn(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document.getAnimations().some((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        return target instanceof Element && target.closest('.kundali-svg') !== null;
      }),
    undefined,
    { timeout: 5000 },
  );
}

/** Animations currently attached to anything inside a chart. */
async function chartAnimations(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.getAnimations().filter((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        return target instanceof Element && target.closest('.kundali-svg') !== null;
      }).length,
  );
}

test.describe('chart draw-in', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'reduced-motion', 'the reduced path is its own spec');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  test('draws in on first arrival', async ({ page }) => {
    await page.goto(PATRIKA);
    await waitForDrawIn(page);
    expect(await chartAnimations(page), 'nothing animated on first mount').toBeGreaterThan(0);
  });

  test('the sequence respects the 800ms ceiling', async ({ page }) => {
    await page.goto(PATRIKA);
    await waitForDrawIn(page);
    const end = await page.evaluate(() =>
      Math.max(
        ...document
          .getAnimations()
          .filter((a) => {
            const target = (a.effect as KeyframeEffect | null)?.target;
            return target instanceof Element && target.closest('.kundali-svg') !== null;
          })
          .map((a) => {
            const timing = a.effect?.getComputedTiming();
            return Number(timing?.delay ?? 0) + Number(timing?.activeDuration ?? 0);
          }),
      ),
    );
    // --dur-chart-draw is 800ms and §3.2 calls it the one permitted exception to
    // the 500ms orchestration ceiling. Laid end to end §4.1's own four steps
    // overrun it, so the glyph stagger overlaps and compresses; this asserts the
    // compression actually holds.
    expect(end).toBeLessThanOrEqual(800);
  });

  test('does not replay on re-render', async ({ page }) => {
    await page.goto(PATRIKA);
    await page.waitForTimeout(1000);
    // Toggling the accessible table re-renders the component without changing
    // the chart.
    await page.locator('.kundali-table-wrap button').first().click();
    await page.locator('.kundali-table-wrap button').first().click();
    expect(await chartAnimations(page), 'the draw-in replayed on a re-render').toBe(0);
  });

  test('does not replay on a theme switch', async ({ page }) => {
    await page.goto(PATRIKA);
    await page.waitForTimeout(1000);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(200);
    expect(await chartAnimations(page), 'the draw-in replayed on a theme switch').toBe(0);
  });

  test('does not replay on a locale switch', async ({ page }) => {
    await page.goto(PATRIKA);
    await page.waitForTimeout(1000);
    // A full document navigation — the locale links are plain anchors. This is
    // the case a module-level guard silently fails.
    await page.goto(`/hi/kundali?${BIRTH}`);
    expect(await chartAnimations(page), 'the draw-in replayed on a locale switch').toBe(0);
  });

  test('a different chart still draws', async ({ page }) => {
    await page.goto(PATRIKA);
    await page.waitForTimeout(1000);
    const other = new URLSearchParams(BIRTH);
    other.set('date', '1985-03-02');
    await page.goto(`/mr/kundali?${other}`);
    await waitForDrawIn(page);
    expect(
      await chartAnimations(page),
      'the guard is too broad: a different birth did not draw',
    ).toBeGreaterThan(0);
  });

  test('glyphs are ordered by house, not by document order', async ({ page }) => {
    await page.goto(PATRIKA);
    await waitForDrawIn(page);
    // Per chart. The page carries Rashi *and* Navamsa, each staggered from its
    // own start, so pooling them compares house 1 of the second chart against
    // house 12 of the first and proves nothing.
    const charts = await page.evaluate(() =>
      [...document.querySelectorAll('.kundali-svg')].map((chart) =>
        [...chart.querySelectorAll<SVGElement>('.k-graha')]
          .map((glyph) => ({
            house: Number(glyph.dataset.house ?? 0),
            delay: Number(glyph.getAnimations()[0]?.effect?.getComputedTiming().delay ?? -1),
          }))
          .sort((a, b) => a.house - b.house),
      ),
    );
    expect(charts.length, 'no charts on the page').toBeGreaterThan(0);
    for (const glyphs of charts) {
      expect(glyphs.length, 'no graha glyphs carried a house').toBeGreaterThan(0);
      // Without this the test passes on a chart where `data-house` is absent
      // entirely: every house reads as 0, the sort is a no-op, and document
      // order is already ascending. It did, for one commit.
      expect(
        glyphs.every((glyph) => glyph.house >= 1 && glyph.house <= 12),
        'a graha glyph carries no data-house',
      ).toBe(true);
      // Not one element per house: a house holding more than two grahas wraps to
      // a second line, and both lines carry the same house. That is the stellium
      // case working, not a labelling bug.
      // §4.1: "Ordered by house, never random — the order itself teaches the
      // reading sequence." Later houses never start earlier.
      for (let i = 1; i < glyphs.length; i += 1) {
        expect(glyphs[i]!.delay, `house ${glyphs[i]!.house} started before ${glyphs[i - 1]!.house}`)
          .toBeGreaterThanOrEqual(glyphs[i - 1]!.delay);
      }
    }
  });
});

test.describe('chart draw-in under reduced motion', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'reduced-motion', 'needs the preference forced');
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('renders complete, instantly', async ({ page }) => {
    await page.goto(PATRIKA);
    expect(
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      'the preference is not in effect',
    ).toBe(true);
    // §3.4: "Chart draw-in: render complete, instantly." Not a faster draw-in —
    // none at all, and every glyph already at full opacity.
    expect(await chartAnimations(page)).toBe(0);
    const faded = await page.evaluate(
      () =>
        [...document.querySelectorAll<SVGElement>('.kundali-svg .k-graha')].filter(
          (glyph) => Number(getComputedStyle(glyph).opacity) < 1,
        ).length,
    );
    expect(faded, 'a glyph was left partly transparent').toBe(0);
  });
});
