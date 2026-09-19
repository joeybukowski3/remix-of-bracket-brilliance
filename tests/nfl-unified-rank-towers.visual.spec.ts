import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8089";
const routes = [
  "/nfl/matchups/new-england-patriots-at-seattle-seahawks",
  "/nfl/matchups/atlanta-falcons-at-pittsburgh-steelers",
];

for (const width of [390, 1150, 1440]) {
  for (const route of routes) {
    test(`${width}px ${route}: unified rank plot stays contained`, async ({ page }, testInfo) => {
      test.setTimeout(60000);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("tab", { name: "Team Comparison" }).click();
      const chart = page.locator(".matchup-visualization-shell .matchup-unified-chart:visible").first();
      await expect(chart).toBeVisible();
      await expect(chart.locator(".matchup-unified-chart__axis span")).toHaveCount(5);
      await expect(chart.locator(".matchup-rank-towers__card")).toHaveCount(0);
      const groups = chart.locator("[data-rank-tower-group]");
      expect(await groups.count()).toBeGreaterThan(1);
      await expect(groups.first().locator("[data-rank-tower]")).toHaveCount(2);
      const viewport = chart.locator(".matchup-unified-chart__viewport");
      const dimensions = await viewport.evaluate((node) => ({ client: node.clientWidth, scroll: node.scrollWidth }));
      if (width === 390) {
        expect(dimensions.scroll).toBeGreaterThan(dimensions.client);
        await viewport.evaluate((node) => { node.scrollLeft = 120; });
        await expect.poll(() => viewport.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      } else {
        expect(dimensions.scroll - dimensions.client).toBeLessThanOrEqual(1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await chart.screenshot({ path: testInfo.outputPath("unified-rank.png") });
    });
  }
}

test("metric selection changes the unified chart categories", async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}${routes[0]}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Team Comparison" }).click();
  const chart = page.locator(".matchup-visualization-shell .matchup-unified-chart:visible").first();
  const before = await chart.locator("[data-rank-tower-group]").count();
  await page.locator(".matchup-visualization-shell .matchup-metrics-trigger:visible").first().click();
  await page.locator(".matchup-metrics-popover [role='checkbox'][data-state='checked']").first().click();
  await expect(chart.locator("[data-rank-tower-group]")).toHaveCount(before - 1);
});
