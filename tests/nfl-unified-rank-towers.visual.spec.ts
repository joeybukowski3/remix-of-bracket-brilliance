import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8089";
const routes = [
  "/nfl/matchups/new-england-patriots-at-seattle-seahawks",
  "/nfl/matchups/atlanta-falcons-at-pittsburgh-steelers",
];
const similarColorRoute = "/nfl/matchups/ny-giants-at-la-rams";
const FIT_METRIC_MAX = 6;
const REM = 16;

type ChartMetrics = { count: number; client: number; scroll: number; hint: boolean; towerW: number; plotH: number; labels: string[] };

async function measure(chart: Locator): Promise<ChartMetrics> {
  return chart.evaluate((node) => {
    const viewport = node.querySelector<HTMLElement>(".matchup-unified-chart__viewport")!;
    const zone = node.querySelector<HTMLElement>(".matchup-unified-chart__bar-zone")!;
    return {
      count: node.querySelectorAll("[data-rank-tower-group]").length,
      client: viewport.clientWidth,
      scroll: viewport.scrollWidth,
      hint: !!node.querySelector(".matchup-viz-swipe-hint"),
      towerW: zone.getBoundingClientRect().width,
      plotH: zone.getBoundingClientRect().height,
      labels: [...node.querySelectorAll(".matchup-unified-chart__caption")].map((el) => (el.textContent ?? "").trim()),
    };
  });
}

const pageOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const width of [390, 430, 768, 1150, 1440]) {
  for (const route of routes) {
    test(`${width}px ${route}: unified rank plot is responsive and contained`, async ({ page }, testInfo) => {
      test.setTimeout(60000);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("tab", { name: "Team Comparison" }).click();
      const chart = page.locator(".matchup-visualization-shell .matchup-unified-chart:visible").first();
      await expect(chart).toBeVisible();
      await expect(chart).toHaveAttribute("data-chart-surface", "light");
      await expect(chart.locator(".matchup-unified-chart__axis span")).toHaveCount(5);
      await expect(chart.locator(".matchup-rank-towers__card")).toHaveCount(0);
      const groups = chart.locator("[data-rank-tower-group]");
      expect(await groups.count()).toBeGreaterThan(1);
      await expect(groups.first().locator("[data-rank-tower]")).toHaveCount(2);

      const m = await measure(chart);
      const palette = await chart.evaluate((node) => {
        const chartStyle = getComputedStyle(node);
        const axisStyle = getComputedStyle(node.querySelector(".matchup-unified-chart__axis")!);
        return {
          surface: chartStyle.backgroundColor,
          text: chartStyle.color,
          axis: axisStyle.backgroundColor,
        };
      });
      expect(palette.surface).toBe("rgb(255, 255, 255)");
      expect(palette.text).toBe("rgb(23, 32, 51)");
      expect(palette.axis).toBe("rgb(241, 245, 249)");
      // Metric names stay visible and non-empty for every group.
      expect(m.labels.every((label) => label.length > 0)).toBe(true);
      for (const caption of await chart.locator(".matchup-unified-chart__caption").all()) await expect(caption).toBeVisible();

      // Swipe hint appears if and only if the chart actually overflows.
      const overflows = m.scroll - m.client > 1;
      expect(m.hint).toBe(overflows);
      if (m.count <= FIT_METRIC_MAX || width >= 768) expect(overflows).toBe(false);

      // Responsive tiers.
      if (width <= 480) {
        expect(m.towerW).toBeGreaterThanOrEqual(10);
        expect(m.towerW).toBeLessThanOrEqual(13.5);
        expect(m.plotH).toBeGreaterThanOrEqual(150);
        expect(m.plotH).toBeLessThanOrEqual(175);
      }
      if (width >= 1100) {
        expect(m.towerW).toBeGreaterThanOrEqual(1.5 * REM - 1);
        expect(m.plotH).toBeGreaterThanOrEqual(15 * REM - 1);
      }
      if (width >= 1440) {
        expect(m.towerW).toBeGreaterThanOrEqual(1.75 * REM - 1);
        expect(m.plotH).toBeGreaterThanOrEqual(17 * REM - 1);
      }
      expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
      await chart.screenshot({ path: testInfo.outputPath(`unified-rank-${width}.png`) });
    });
  }
}

for (const width of [390, 1440]) {
  test(`${width}px similar blue primaries use the Giants away accent consistently`, async ({ page }, testInfo) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}${similarColorRoute}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "Team Comparison" }).click();
    const chart = page.locator(".matchup-visualization-shell .matchup-unified-chart:visible").first();
    await expect(chart).toBeVisible();
    await expect(chart).toHaveAttribute("data-away-uses-alternate", "true");

    const colors = await chart.evaluate((node) => ({
      awayLegend: getComputedStyle(node.querySelector(".matchup-unified-chart__legend-swatch")!).backgroundColor,
      homeLegend: getComputedStyle(node.querySelectorAll(".matchup-unified-chart__legend-swatch")[1]).backgroundColor,
      awayTower: getComputedStyle(node.querySelector(".matchup-rank-towers__bar-fill")!).backgroundColor,
      homeTower: getComputedStyle(node.querySelectorAll(".matchup-rank-towers__bar-fill")[1]).backgroundColor,
    }));
    expect(colors).toEqual({
      awayLegend: "rgb(167, 25, 48)",
      homeLegend: "rgb(0, 53, 148)",
      awayTower: "rgb(167, 25, 48)",
      homeTower: "rgb(0, 53, 148)",
    });
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    await chart.screenshot({ path: testInfo.outputPath(`giants-rams-${width}.png`) });
  });
}

test("390px: six metrics fit while eight metrics scroll inside the light chart", async ({ page }, testInfo) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${baseUrl}${routes[0]}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Team Comparison" }).click();

  const successSection = page.locator("section", { hasText: "Success Rate by Period" }).first();
  await successSection.getByRole("tab", { name: "Towers" }).click();
  const successChart = successSection.locator(".matchup-unified-chart");
  await expect(successChart.locator("[data-rank-tower-group]")).toHaveCount(6);
  await expect(successChart).toHaveAttribute("data-fit", "true");
  const successMetrics = await measure(successChart);
  expect(successMetrics.scroll - successMetrics.client).toBeLessThanOrEqual(1);
  await successChart.screenshot({ path: testInfo.outputPath("success-rate-6-fit-390.png") });

  const shell = page.locator(".matchup-visualization-shell");
  await shell.getByRole("tab", { name: "Offense", exact: true }).click();
  const primaryChart = shell.locator(".matchup-unified-chart:visible").first();
  await expect(primaryChart.locator("[data-rank-tower-group]")).toHaveCount(8);
  await expect(primaryChart).not.toHaveAttribute("data-fit", "true");
  const selectedMetrics = await measure(primaryChart);
  expect(selectedMetrics.scroll).toBeGreaterThan(selectedMetrics.client);
  await expect(primaryChart.locator(".matchup-viz-swipe-hint")).toBeVisible();
  expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
  await primaryChart.screenshot({ path: testInfo.outputPath("selected-8-scroll-390.png") });
});

test("metric order is identical across breakpoints", async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}${routes[0]}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Team Comparison" }).click();
  const chart = page.locator(".matchup-visualization-shell .matchup-unified-chart:visible").first();
  await expect(chart).toBeVisible();
  const wide = (await measure(chart)).labels;
  await page.setViewportSize({ width: 390, height: 900 });
  expect((await measure(chart)).labels).toEqual(wide);
});

test("390px: every visible chart fits when small and scrolls internally when large", async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${baseUrl}${routes[0]}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Team Comparison" }).click();
  await expect(page.locator(".matchup-visualization-shell .matchup-unified-chart:visible").first()).toBeVisible();
  const charts = await page.locator(".matchup-unified-chart:visible").all();
  for (const chart of charts) {
    const m = await measure(chart);
    const overflows = m.scroll - m.client > 1;
    expect(m.hint).toBe(overflows);
    if (m.count <= FIT_METRIC_MAX) expect(overflows).toBe(false);
  }
  expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
});

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
