import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8089";
const route = "/nfl/matchups/new-england-patriots-at-seattle-seahawks";

for (const width of [390, 430]) {
  for (const theme of ["light", "dark"] as const) {
    test(`${width}px ${theme} mobile comparison is compact and sticky`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript((selectedTheme) => {
        localStorage.setItem("jkb-nfl-matchup-theme", selectedTheme);
      }, theme);
      await page.goto(`${baseUrl}${route}`);
      await page.getByRole("tab", { name: "Team Comparison" }).click();
      await expect(page.getByLabel("Matchup team orientation")).toBeVisible();

      const compactRows = page.locator("[data-compact-matchup-row]:visible");
      await expect(compactRows.first()).toBeVisible();
      const rowHeights = await compactRows.evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
      expect(Math.max(...rowHeights)).toBeLessThanOrEqual(58);

      await page.getByRole("heading", { name: "Success Rate by Period" }).scrollIntoViewIfNeeded();
      await page.mouse.wheel(0, 500);
      const contextBox = await page.getByLabel("Matchup team orientation").boundingBox();
      expect(contextBox).not.toBeNull();
      expect(contextBox!.height).toBeGreaterThanOrEqual(36);
      expect(contextBox!.height).toBeLessThanOrEqual(44);
      expect(contextBox!.y).toBeGreaterThanOrEqual(112);
      expect(contextBox!.y).toBeLessThanOrEqual(124);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`${width}-${theme}-comparison.png`) });
    });
  }
}

for (const width of [1280, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`${width}px ${theme} desktop remains unchanged`, async ({ page }) => {
      await page.setViewportSize({ width, height: 960 });
      await page.addInitScript((selectedTheme) => {
        localStorage.setItem("jkb-nfl-matchup-theme", selectedTheme);
      }, theme);
      await page.goto(`${baseUrl}${route}`);
      await page.getByRole("tab", { name: "Team Comparison" }).click();
      await expect(page.locator(".matchup-comparison-density")).toBeVisible();
      await expect(page.getByLabel("Matchup team orientation")).toHaveCount(0);
      await expect(page.locator("[data-compact-matchup-row]")).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
    });
  }
}
