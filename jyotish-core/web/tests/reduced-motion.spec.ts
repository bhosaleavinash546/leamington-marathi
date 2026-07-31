import { test, expect, type Page } from '@playwright/test';

/**
 * The `prefers-reduced-motion` acceptance criterion (DESIGN.md §3.4).
 *
 * > Ship a Playwright test that runs the whole flow with reduced motion forced
 * > and asserts no element has a non-zero transform mid-transition.
 *
 * Phase C's gate is that this passes *before* any animation is added, so it was
 * written against the motionless Phase B sheet and has to keep passing as the
 * motion foundation lands under it.
 *
 * The trap in a test like this is that it passes for the wrong reason: a page
 * with no motion at all satisfies "nothing is transformed mid-transition"
 * trivially, and would go on satisfying it if the reduced-motion path were
 * deleted. So the same flow runs under both projects in `playwright.config.ts`,
 * and `motion-is-actually-measurable` asserts the *harness* can see a transform
 * when one exists. Without that, this file is decoration.
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

/** Every screen a reader passes through — "the whole flow" in §3.4. */
const FLOW = [
  { name: 'form', path: '/mr' },
  { name: 'patrika', path: `/mr/kundali?${BIRTH}` },
  { name: 'patrika · hi', path: `/hi/kundali?${BIRTH}` },
  { name: 'patrika · en', path: `/en/kundali?${BIRTH}` },
];

/**
 * Elements whose transform is *changing* — the ones actually in transition.
 *
 * The first version flagged any non-identity transform, which conflated motion
 * with geometry: the panchang arc is rotated -90° so it fills from twelve
 * o'clock, a static attribute that never changes and moves nothing. §3.4 asks
 * that "no element has a non-zero transform mid-transition", and mid-transition
 * is the operative half. So two samples a few frames apart, and anything whose
 * transform differs between them is moving.
 */
async function movedElements(page: Page): Promise<string[]> {
  const snapshot = () =>
    page.evaluate(() => {
      const out: Record<string, string> = {};
      document.querySelectorAll<HTMLElement>('body *').forEach((element, index) => {
        const transform = getComputedStyle(element).transform;
        if (!transform || transform === 'none') return;
        const label =
          element.tagName.toLowerCase() +
          (element.id ? `#${element.id}` : '') +
          (typeof element.className === 'string' && element.className
            ? `.${element.className.trim().split(/\s+/).join('.')}`
            : '');
        out[`${index}:${label}`] = transform;
      });
      return out;
    });

  const first = await snapshot();
  await page.waitForTimeout(80);
  const second = await snapshot();
  return Object.keys(second)
    .filter((key) => first[key] !== undefined && first[key] !== second[key])
    .map((key) => `${key} → ${first[key]} then ${second[key]}`);
}

/** Anything still easing: a running CSS transition or Web Animation. */
async function runningAnimations(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target;
        const name = target ? target.tagName.toLowerCase() : 'unknown';
        const timing = a.effect?.getTiming();
        return `${name} (${String(timing?.duration ?? '?')}ms)`;
      }),
  );
}

test.describe('reduced motion', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'reduced-motion',
      'only meaningful with the preference forced',
    );
    // Applied explicitly. The context-level option is silently ignored in this
    // environment - see the note in playwright.config.ts.
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  for (const screen of FLOW) {
    test(`${screen.name}: nothing is transformed or easing`, async ({ page }) => {
      await page.goto(screen.path);
      await page.evaluate(() => document.fonts.ready);

      // Assert the precondition before the assertion. If the emulation is not
      // live this file passes while testing the ordinary path, which is the one
      // failure mode a reduced-motion test cannot afford.
      expect(
        await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
        'the reduced-motion preference is not actually in effect',
      ).toBe(true);

      // Sampled immediately after load rather than after settling: "mid-transition"
      // is the moment the assertion is about, and waiting for idle would let any
      // enter animation finish and hide itself.
      expect(await movedElements(page), 'transformed elements under reduced motion').toEqual([]);
      expect(await runningAnimations(page), 'running animations under reduced motion').toEqual([]);

      // And again after the page has had time to run anything deferred.
      await page.waitForTimeout(600);
      expect(await movedElements(page), 'transformed elements after settling').toEqual([]);
      expect(await runningAnimations(page), 'running animations after settling').toEqual([]);
    });
  }

  test('navigating between screens starts no transition', async ({ page }) => {
    await page.goto('/mr');
    await page.goto(`/mr/kundali?${BIRTH}`);
    expect(await runningAnimations(page), 'a page transition ran under reduced motion').toEqual([]);
    expect(await movedElements(page)).toEqual([]);
  });

  test('opening an evidence disclosure does not animate', async ({ page }) => {
    await page.goto(`/mr/kundali?${BIRTH}`);
    const summary = page.locator('.evidence > summary').first();
    await summary.click();
    expect(await runningAnimations(page), 'the disclosure eased open').toEqual([]);
    await expect(page.locator('.evidence[open]').first()).toBeVisible();
  });

  test('the motion tokens collapse rather than switching off', async ({ page }) => {
    // §3.4: "not a global `transition: none`". --dur-enter stays non-zero so a
    // transform-based enter becomes a crossfade of the same perceived weight,
    // and only the durations that should vanish do.
    await page.goto('/mr');
    const tokens = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        micro: s.getPropertyValue('--dur-micro').trim(),
        enter: s.getPropertyValue('--dur-enter').trim(),
        layout: s.getPropertyValue('--dur-layout').trim(),
        chart: s.getPropertyValue('--dur-chart-draw').trim(),
      };
    });
    expect(tokens.enter).toBe('120ms');
    expect(tokens.layout).toBe('120ms');
    expect(tokens.micro).toBe('0ms');
    expect(tokens.chart).toBe('0ms');
  });
});

test.describe('with motion allowed', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'reduced-motion',
      'this project exists to prove the reduced-motion run measures something',
    );
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  test('motion-is-actually-measurable', async ({ page }) => {
    await page.goto(`/mr/kundali?${BIRTH}`);
    // Drive a transform from outside the app: if the harness cannot see this,
    // every assertion in the file above is vacuous.
    await page.evaluate(async () => {
      const probe = document.createElement('div');
      probe.id = 'motion-probe';
      document.body.append(probe);
      probe.animate([{ transform: 'translateY(0px)' }, { transform: 'translateY(40px)' }], {
        duration: 4000,
        fill: 'forwards',
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    const moved = await movedElements(page);
    expect(moved.some((entry) => entry.includes('motion-probe'))).toBe(true);
    expect(await runningAnimations(page)).not.toEqual([]);
  });

  test('the tokens carry their full durations', async ({ page }) => {
    await page.goto('/mr');
    const enter = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--dur-enter').trim(),
    );
    expect(enter).toBe('200ms');
  });
});

test.describe('budget', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'reduced-motion', 'a bundle is the same either way');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  /**
   * §9: "JS on critical path < 120KB gzipped", and §3.3: "No animation library in
   * the first-paint path."
   *
   * Both were broken by the obvious way of wiring Motion up. `LazyMotion` defers
   * the *features* bundle but not its own core, so a provider wrapping the layout
   * put 53KB gzipped into the eager script set and took the critical path to
   * 180KB. Nothing failed: the build summary reported a plausible number and the
   * page worked. Only measuring the bytes the browser actually executes showed
   * it, which is why this is a test and not a note.
   */
  test('the critical path stays inside the budget and carries no animation library', async ({
    page,
  }) => {
    await page.goto(`/mr/kundali?${BIRTH}`);
    await page.waitForLoadState('networkidle');

    const scripts = await page.evaluate(() => {
      // `noModule` scripts are the legacy polyfills: a modern browser fetches but
      // never executes them, so they are not on this browser's critical path.
      const eager = [...document.querySelectorAll<HTMLScriptElement>('script[src]')]
        .filter((s) => !s.noModule)
        .map((s) => s.src);
      const timing = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      return eager.map((src) => {
        const entry = timing.find((t) => t.name === src);
        // encodedBodySize is the compressed transfer size, which is the unit the
        // budget is written in.
        return { src, bytes: entry?.encodedBodySize ?? 0 };
      });
    });

    const total = scripts.reduce((sum, s) => sum + s.bytes, 0);
    const detail = scripts
      .map((s) => `${s.src.split('/').pop()} ${(s.bytes / 1024).toFixed(1)}KB`)
      .join(', ');
    expect(total, `critical-path JS (${detail})`).toBeGreaterThan(0);
    expect(total, `critical-path JS (${detail})`).toBeLessThan(120 * 1024);

    // And the library itself is absent from every eagerly executed chunk.
    const carriesMotion = await page.evaluate(async (sources: string[]) => {
      for (const src of sources) {
        const body = await (await fetch(src)).text();
        if (body.includes('LazyMotion') || body.includes('domAnimation')) return src;
      }
      return null;
    }, scripts.map((s) => s.src));
    expect(carriesMotion, 'an eagerly executed chunk carries the animation library').toBeNull();
  });
});
