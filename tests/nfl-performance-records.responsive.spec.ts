import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

const noHorizontalOverflow = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const width of [1440, 390, 320]) {
  test(`props table and expanded box score fit at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/nfl/performance/props`);
    if (width < 768) {
      const list = page.getByTestId("nfl-props-mobile-list");
      await expect(list).toBeVisible();
      await list.locator("button").first().click();
      await expect(list.getByRole("region", { name: "Game and box score" })).toBeVisible();
      await expect(list.getByText("Final score").first()).toBeVisible();
      await expect(list.getByRole("table", { name: /box score/i })).toBeVisible();
      await expect(list.getByRole("table", { name: /box score/i }).getByRole("cell").first()).not.toHaveText("—");
    } else {
      const table = page.getByRole("region", { name: "Starter props performance table" });
      await expect(table).toBeVisible();
      await table.getByRole("button", { name: /^Expand details for/ }).first().click();
      await expect(table.getByRole("region", { name: "Game and box score" })).toBeVisible();
      await expect(table.getByRole("table", { name: /box score/i })).toBeVisible();
      await expect(table.getByRole("table", { name: /box score/i }).getByRole("cell").first()).not.toHaveText("—");
    }
    expect(await noHorizontalOverflow(page)).toBeLessThanOrEqual(1);
    await page.getByRole("region", { name: "Game and box score" }).screenshot({ path: testInfo.outputPath(`props-detail-${width}.png`) });
  });

  test(`sides records, week selector and filters work at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/nfl/performance/sides`);

    const summary = page.getByTestId("nfl-record-summary");
    await expect(summary).toBeVisible();
    await expect(page.getByTestId("nfl-record-ats-season")).toBeVisible();
    await expect(page.getByTestId("nfl-record-su-season")).toBeVisible();
    await expect(page.getByTestId("nfl-record-ats-week")).toHaveCount(0);

    // Records are visually primary: they sit above the model-quality KPIs.
    const summaryBox = await summary.boundingBox();
    const qualityBox = await page.getByRole("region", { name: "Model quality" }).boundingBox();
    expect(summaryBox!.y).toBeLessThan(qualityBox!.y);

    // One week control; selecting a week shows the weekly record and narrows the log.
    await expect(page.getByRole("group", { name: "Week" })).toHaveCount(1);
    const selector = page.getByTestId("nfl-week-selector");
    await selector.getByRole("button", { name: "W1" }).click();
    await expect(page.getByTestId("nfl-record-ats-week")).toBeVisible();
    await expect(page.getByTestId("nfl-record-su-week")).toBeVisible();
    await expect(page.getByTestId("nfl-sides-shown-count")).toContainText("Week 1 selected");
    await selector.getByRole("button", { name: "Season" }).click();
    await expect(page.getByTestId("nfl-record-ats-week")).toHaveCount(0);

    // Filters: collapsed disclosure on mobile, inline toolbar on desktop.
    const toggle = page.getByRole("button", { name: /^Filters/ });
    if (width < 768) {
      await expect(toggle).toBeVisible();
      await expect(page.getByLabel("ATS result")).toBeHidden();
      await toggle.click();
    } else {
      await expect(toggle).toBeHidden();
    }
    await page.getByLabel("ATS result").selectOption("WIN");
    await expect(page.getByRole("button", { name: "Clear filters" })).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByRole("button", { name: "Clear filters" })).toHaveCount(0);

    expect(await noHorizontalOverflow(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`sides-${width}.png`), fullPage: true });
  });

  test(`totals O/U record and week selector work at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/nfl/performance/totals`);

    await expect(page.getByTestId("nfl-record-ou-season")).toBeVisible();
    await page.getByTestId("nfl-week-selector").getByRole("button", { name: "W1" }).click();
    await expect(page.getByTestId("nfl-record-ou-week")).toBeVisible();
    await page.getByTestId("nfl-week-selector").getByRole("button", { name: "Season" }).click();
    await expect(page.getByTestId("nfl-record-ou-week")).toHaveCount(0);

    expect(await noHorizontalOverflow(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`totals-${width}.png`), fullPage: true });
  });
}
