import { expect, test } from "../playwright-fixture";

/**
 * Phase 9B — MLB table-family migration (analytics-safe).
 *
 * Covers the MLB routes that host the tables migrated onto the shared
 * `DenseTableScroller` in Phase 9B: the HR / K +EV tables and the
 * performance-preview table family. Asserts page-level horizontal overflow
 * stays contained at 320 / 768 / 1024 / 1440 and that the shared accessible
 * scroll regions are keyboard-reachable wherever they render. Data-dependent
 * tables may render an honest empty/error state in a restricted environment;
 * the overflow-containment assertions hold regardless.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";
const VIEWPORTS = [320, 768, 1024, 1440] as const;

const ROUTES = [
  "/mlb/hr-props",
  "/mlb/strikeout-props",
  "/mlb/performance-preview",
] as const;

async function expectNoPageOverflow(page: import("@playwright/test").Page) {
  await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
}

test("Phase 9B MLB table routes contain overflow and expose accessible scrollers", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  for (const width of VIEWPORTS) {
    await page.setViewportSize({ width, height: width === 320 ? 720 : 900 });

    for (const route of ROUTES) {
      await page.goto(`${BASE_URL}${route}`);
      await page.waitForLoadState("networkidle").catch(() => undefined);

      // Any migrated dense scroller that is on the page must be a real,
      // keyboard-reachable region; wide content scrolls inside it, not the page.
      const scrollers = page.getByRole("region").filter({
        has: page.locator("table"),
      });
      const count = await scrollers.count();
      for (let i = 0; i < count; i += 1) {
        const scroller = scrollers.nth(i);
        if (await scroller.isVisible()) {
          await expect(scroller).toHaveAttribute("tabindex", "0");
        }
      }

      await expectNoPageOverflow(page);

      if (width === 320 || width === 1440) {
        await page.screenshot({
          path: testInfo.outputPath(
            `${route.replace(/\//g, "_")}-${width}.png`,
          ),
          fullPage: true,
        });
      }
    }
  }
});
