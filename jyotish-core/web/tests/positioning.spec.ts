import { test, expect } from '@playwright/test';

/**
 * Workstream A deliverables (REVIEW-360 §1 A2), as behaviour.
 *
 * The gate itself — an outsider describes the product from POSITIONING.md and
 * the home screen — needs a human and cannot be automated. What can be pinned
 * down is everything mechanical around it: the one question appears exactly
 * once, the choice sticks and actually changes the sheet's default disclosure,
 * and a patrika URL without a birth invites rather than errors.
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

const COOKIE = (value: string) => ({
  name: 'jyotish_density',
  value,
  url: 'http://localhost:4300',
});

test.describe('workstream A: home, first run, density, empty state', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Not motion tests; one project's worth of runs is enough.
    test.skip(testInfo.project.name === 'reduced-motion', 'not motion-dependent');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  test('first visit: the statement, one question, then straight into the form', async ({
    page,
  }) => {
    await page.goto('/mr');
    // Five-second-test proxy: the masthead states what the product is before
    // anything is tapped.
    await expect(page.locator('.page__head h1')).toBeVisible();
    await expect(page.locator('.tagline')).toContainText('दृक्गणित');
    // The question is up and the form is not.
    await expect(page.locator('.first-run__question')).toBeVisible();
    await expect(page.locator('form.form')).toHaveCount(0);

    await page.getByRole('button', { name: /ज्योतिषी/ }).click();
    // Straight into the primary action — no second screen, no tour.
    await expect(page.locator('form.form')).toBeVisible();

    // The choice persists: a reload goes directly to the form.
    await page.reload();
    await expect(page.locator('form.form')).toBeVisible();
    await expect(page.locator('.first-run__question')).toHaveCount(0);
  });

  test('the choice is reversible from the same screen', async ({ page }) => {
    await page.context().addCookies([COOKIE('practitioner')]);
    await page.goto('/mr');
    await expect(page.locator('form.form')).toBeVisible();
    await page.getByRole('button', { name: 'मांडणी बदला' }).click();
    await expect(page.locator('.first-run__question')).toBeVisible();
  });

  test('practitioner density: the dense sections default open', async ({ page }) => {
    await page.context().addCookies([COOKIE('practitioner')]);
    await page.goto(`/mr/kundali?${BIRTH}`);
    await expect(page.locator('.patrika-table--graha')).toBeVisible();
    await expect(
      page.locator('section[aria-labelledby="graha-spashta"] details[open]'),
    ).toHaveCount(1);
  });

  test('seeker density: the same sections, folded — nothing removed', async ({ page }) => {
    await page.context().addCookies([COOKIE('seeker')]);
    await page.goto(`/mr/kundali?${BIRTH}`);
    // The table exists in the DOM (density is disclosure, not data)…
    await expect(page.locator('.patrika-table--graha')).toHaveCount(1);
    // …but is not unfolded.
    await expect(page.locator('.patrika-table--graha')).not.toBeVisible();
    // A tap on the heading opens it: the seeker is offered less, denied nothing.
    await page.locator('section[aria-labelledby="graha-spashta"] summary').click();
    await expect(page.locator('.patrika-table--graha')).toBeVisible();
  });

  test('a patrika URL without a birth is an invitation, not an error', async ({ page }) => {
    await page.goto('/mr/kundali');
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
    await expect(page.locator('.empty-state')).toBeVisible();
    const cta = page.locator('.empty-state .button-link');
    await expect(cta).toHaveAttribute('href', '/mr');
  });
});
