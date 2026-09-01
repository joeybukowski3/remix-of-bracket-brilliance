import { expect, test } from "../playwright-fixture";

/**
 * Phase 9C — MLB inline prop-board table migration (analytics-safe).
 *
 * `/mlb/hr-props` and `/mlb/strikeout-props` host the inline desktop prop-board
 * tables migrated onto the shared `DenseTableScroller` +
 * `stickyDenseHeader` / `frozenDenseColumn` helpers. This spec asserts:
 *   - no document-level horizontal overflow at 320 / 768 / 1024 / 1440;
 *   - every visible dense scroll region is a real, keyboard-reachable region;
 *   - at 1440 any visible board table scrolls inside its region, not the page;
 *   - at 320 the mobile card fallback is the primary UX (the desktop board
 *     table is not rendered).
 *
 * Data-dependent: in a restricted environment these routes render an honest
 * empty/error state and the board table is absent. The overflow-containment
 * and no-desktop-table-at-320 assertions hold regardless.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";
const VIEWPORTS = [320, 768, 1024, 1440] as const;
const ROUTES = ["/mlb/hr-props", "/mlb/strikeout-props"] as const;

async function pageOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test("Phase 9C MLB prop boards contain overflow and expose accessible scrollers", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  for (const width of VIEWPORTS) {
    await page.setViewportSize({ width, height: width === 320 ? 720 : 900 });

    for (const route of ROUTES) {
      await page.goto(`${BASE_URL}${route}`);
      await page.waitForLoadState("networkidle").catch(() => undefined);

      await expect(page.locator(".vite-error-overlay")).toHaveCount(0);

      const scrollers = page.getByRole("region").filter({ has: page.locator("table") });
      const count = await scrollers.count();
      for (let i = 0; i < count; i += 1) {
        const scroller = scrollers.nth(i);
        if (await scroller.isVisible()) {
          await expect(scroller).toHaveAttribute("tabindex", "0");
        }
      }

      await expect.poll(() => pageOverflow(page)).toBeLessThanOrEqual(1);

      if (width === 320) {
        // Mobile card fallback is primary: the desktop board table region
        // must not be rendered.
        await expect(
          page.getByRole("region", { name: /prop board/i }),
        ).toHaveCount(0);
      }

      if (width === 320 || width === 1440) {
        await page.screenshot({
          path: testInfo.outputPath(`${route.replace(/\//g, "_")}-${width}.png`),
          fullPage: true,
        });
      }
    }
  }
});
