import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

for (const width of [390, 768, 1440]) {
  test(`${width}px trends scanner and matchup tab preserve identity without overflow`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.goto(`${baseUrl}/nfl/trends`);

    await expect(page.getByRole("heading", { name: "NFL Situational Trends" })).toBeVisible();
    const matchupCard = page.locator('article[data-qualifier-count]:not([data-qualifier-count="0"])').first();
    const matchupLink = matchupCard.getByRole("link", { name: /Matchup trends/i });
    await expect(matchupLink).toBeVisible();
    await expect(page.locator("[data-team]").first()).toBeVisible();
    await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    if (width === 390) {
      const firstCardHeight = await matchupCard.evaluate((element) => element.getBoundingClientRect().height);
      expect(firstCardHeight).toBeLessThan(720);
    }

    await matchupCard.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`${width}-trends-scanner.png`), fullPage: false });

    const href = await matchupLink.getAttribute("href");
    expect(href).toMatch(/#trends$/);
    await page.goto(`${baseUrl}${href}`);
    await expect(page.getByRole("heading", { name: "Situational Trends" })).toBeVisible();
    await expect(page.locator("article[data-tier]").first()).toBeVisible();
    await expect(page.locator("[data-team]").first()).toBeVisible();
    await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.locator("article[data-tier]").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`${width}-matchup-trends.png`), fullPage: false });
  });
}

test("desktop trend library exposes tier, category, metrics and expansion hierarchy", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${baseUrl}/nfl/trends`);
  await page.getByRole("tab", { name: "Trend Library" }).click();

  const firstTrend = page.locator("#nfl-trends-panel-library details").first();
  await expect(firstTrend).toBeVisible();
  await expect(firstTrend.getByText(/Full history/i).first()).toBeVisible();
  await expect(firstTrend.getByText(/Recent form/i).first()).toBeVisible();
  await firstTrend.locator("summary").click();
  await expect(firstTrend.getByText("Definition")).toBeVisible();
  await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("1440-trend-library.png"), fullPage: false });
});
