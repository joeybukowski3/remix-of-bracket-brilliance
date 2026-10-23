import { expect, test } from "../playwright-fixture";

/**
 * NBA props board V1 (analytics-safe, production build served by `vite preview`).
 *
 * No NBA board is published (no statistics source has display rights), so the page must show its honest empty
 * state: it names projections and sportsbook lines, invents nothing, and stays within the viewport at every width.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";
const VIEWPORTS = [320, 768, 1024, 1440] as const;

test("/nba/props shows the empty state without overflow and without invented data", async ({ page }) => {
  test.setTimeout(120_000);
  for (const width of VIEWPORTS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${BASE_URL}/nba/props`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "No NBA props to show yet" })).toBeVisible();
    await expect(page.getByText(/projections built from box-score data whose license allows display/)).toBeVisible();
    await expect(page.getByText(/no player statistic, projection or line is invented/)).toBeVisible();
    await expect(page.getByText(/SYNTHETIC DATA/)).toHaveCount(0);
    await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(1);
  }
});

test("/nba/props empty state is reachable by keyboard", async ({ page }) => {
  await page.goto(`${BASE_URL}/nba/props`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "No NBA props to show yet" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});
