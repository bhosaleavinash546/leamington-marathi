import { defineConfig } from '@playwright/test';

/**
 * Playwright config for the motion tests (DESIGN.md Phase C).
 *
 * Two projects, deliberately: the reduced-motion criterion in §3.4 is a
 * *comparison*, not an absolute. "No element has a non-zero transform
 * mid-transition" is trivially true of a page with no motion at all, so the same
 * flow runs with motion allowed too — that run is what proves the reduced run is
 * measuring something.
 *
 * `reducedMotion` is set here as project metadata and applied per test with
 * `page.emulateMedia`, not relied on as a context option. In this environment the
 * context option is accepted and silently ignored: `matchMedia('(prefers-reduced-
 * motion: reduce)')` stays false and the whole suite runs in full motion while
 * reporting itself as the reduced-motion project. A reduced-motion test that
 * quietly tests the normal path is worse than no test, so the spec asserts the
 * preference is live before it asserts anything else.
 *
 * The chromium binary is the one this environment ships; `CHROMIUM_PATH`
 * overrides it. No browser download.
 */
const executablePath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const PORT = Number(process.env.PLAYWRIGHT_PORT || 4300);

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: { executablePath, args: ['--no-sandbox'] },
    // The diamond needs the width the desktop layout gives it for the
    // side-by-side comparison. §7's mobile layout and §3.3's "profile on a
    // throttled device" are Phase D and G work, not a user-agent string here.
    viewport: { width: 1280, height: 900 },
  },
  // The project name *is* the setting. `reducedMotion` is not a valid `use`
  // option in this version - the type checker rejects it and the runtime ignored
  // it silently, which is how the suite came to run in full motion while
  // reporting itself as the reduced-motion project. Each spec calls
  // `page.emulateMedia` itself and asserts the preference took.
  projects: [{ name: 'reduced-motion' }, { name: 'full-motion' }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/tokens`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
