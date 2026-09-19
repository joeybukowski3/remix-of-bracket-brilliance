import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8089";
const route = "/nfl/matchups/new-england-patriots-at-seattle-seahawks";

for (const width of [390, 1440]) {
  test(`${width}px trenches use two contained rank plots`, async ({ page }, testInfo) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "Team Comparison" }).click();

    const section = page.locator("#trenches");
    const charts = section.locator(".matchup-unified-chart");
    await expect(charts).toHaveCount(2);
    await expect(charts.first().getByRole("heading", { name: "NE Offense vs SEA Defense" })).toBeVisible();
    await expect(charts.last().getByRole("heading", { name: "SEA Offense vs NE Defense" })).toBeVisible();
    await expect(section.locator(".matchup-comparison-card")).toHaveCount(0);

    for (const chart of await charts.all()) {
      const groups = chart.locator("[data-rank-tower-group]");
      expect(await groups.count()).toBeGreaterThanOrEqual(2);
      for (const group of await groups.all()) {
        await expect(group.locator("[data-rank-tower]")).toHaveCount(2);
        await expect(group.locator(".matchup-unified-chart__value")).toHaveCount(2);
      }
      const viewport = chart.locator(".matchup-unified-chart__viewport");
      const dimensions = await viewport.evaluate((node) => ({ client: node.clientWidth, scroll: node.scrollWidth }));
      if (width === 390) {
        expect(dimensions.scroll).toBeGreaterThan(dimensions.client);
        await viewport.evaluate((node) => { node.scrollLeft = 100; });
        await expect.poll(() => viewport.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      } else if (width === 1440) {
        expect(dimensions.scroll - dimensions.client).toBeLessThanOrEqual(1);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await section.screenshot({ path: testInfo.outputPath("trenches.png") });
  });
}
