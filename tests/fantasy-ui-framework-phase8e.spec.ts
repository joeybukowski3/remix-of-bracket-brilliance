import { expect, test } from "../playwright-fixture";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";
const VIEWPORTS = [320, 768, 1024, 1440] as const;

async function expectNoPageOverflow(page: import("@playwright/test").Page) {
  await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )).toBeLessThanOrEqual(1);
}

test("Phase 8E Fantasy tables contain overflow at representative widths", async ({ page }, testInfo) => {
  test.setTimeout(120_000);

  for (const width of VIEWPORTS) {
    await page.setViewportSize({ width, height: width === 320 ? 720 : 900 });

    await page.goto(`${BASE_URL}/fantasy-football/weekly-rankings?week=1`);
    const weekly = page.getByRole("region", { name: "QB weekly fantasy research board" });
    await expect(weekly).toBeVisible();
    if (width < 1024) {
      const mobileScroller = page.getByRole("region", { name: "QB weekly fantasy rankings" });
      await expect(mobileScroller).toHaveAttribute("tabindex", "0");
      if (width === 320) {
        await expect.poll(() => mobileScroller.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        )).toBe(true);
      }
      await expect(weekly.locator('[data-mobile-sticky="last-name"]').first()).toHaveCSS("position", "sticky");
    } else {
      await expect(weekly.getByRole("table")).toBeVisible();
    }
    await expectNoPageOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`weekly-${width}.png`), fullPage: true });

    await page.goto(`${BASE_URL}/fantasy-football?view=ros`);
    const overall = page.getByRole("region", { name: "Overall fantasy rankings" });
    await expect(overall).toBeVisible();
    await expect(overall).toHaveAttribute("tabindex", "0");
    await expect(overall.getByRole("columnheader", { name: "PAR/G" })).toBeVisible();
    await expect(overall.getByRole("columnheader", { name: "ADP" })).toBeVisible();
    await expectNoPageOverflow(page);
    if (width === 320 || width === 1440) {
      await page.screenshot({ path: testInfo.outputPath(`ros-${width}.png`), fullPage: true });
    }

    await page.goto(`${BASE_URL}/fantasy-football/draft-preview`);
    const draft = page.getByRole("region", { name: "Draft preview board" });
    await expect(draft).toBeVisible();
    await expect(draft).toHaveAttribute("tabindex", "0");
    await expect(draft.getByRole("columnheader", { name: "JKB PAR/G" })).toBeVisible();
    await expect(draft.getByRole("columnheader", { name: "Model Rk" })).toBeVisible();
    await expect.poll(() => draft.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    )).toBe(true);
    await expectNoPageOverflow(page);
    if (width === 320 || width === 1440) {
      await page.screenshot({ path: testInfo.outputPath(`draft-${width}.png`), fullPage: true });
    }

    await page.goto(`${BASE_URL}/fantasy-football/points-allowed`);
    const allowed = page.getByRole("region", { name: "2025 fantasy points allowed by position" });
    await expect(allowed).toBeVisible();
    await expect(allowed).toHaveAttribute("tabindex", "0");
    await expect(allowed.getByRole("columnheader", { name: "Team" })).toBeVisible();
    await expectNoPageOverflow(page);
  }
});
