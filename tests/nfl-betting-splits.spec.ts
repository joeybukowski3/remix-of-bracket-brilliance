import { test, expect } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4174";

test("all market views stay contained at intermediate widths", async ({ page }) => {
  for (const width of [1150, 1024, 768, 430, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/nfl/betting-splits`);
    await expect(page.getByRole("heading", { name: "NFL Betting Splits" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /Fresh|Stale/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Matchup distribution" })).toBeVisible();
    for (const market of ["Spread", "Moneyline", "Total"]) {
      await page.getByRole("tab", { name: market }).click();
      await expect(page.getByRole("heading", { name: `${market} rankings` })).toBeVisible();
      await expect(page.getByRole("region", { name: "Money ranking" }).locator("tbody tr").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});
