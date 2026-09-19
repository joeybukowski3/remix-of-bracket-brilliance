import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`Points Allowed receiver columns at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/nfl/fantasy-points-allowed`);
    const table = page.getByRole("region", { name: "Fantasy points allowed by position" });
    await expect(table.locator("tbody tr")).toHaveCount(32);
    await expect(table.getByRole("button", { name: "Sort by Wide WR" })).toBeVisible();
    await expect(table.getByRole("button", { name: "Sort by Slot WR" })).toBeVisible();
    await expect(table.getByRole("button", { name: "Sort by WR", exact: true })).toHaveCount(0);

    for (const sample of ["2025", "Last 5", "Last 8"]) {
      await page.getByRole("button", { name: sample, exact: true }).click();
      await expect(table.getByRole("button", { name: "Sort by WR", exact: true })).toBeVisible();
      await expect(table.getByRole("button", { name: "Sort by Wide WR" })).toHaveCount(0);
      await expect(table.getByRole("button", { name: "Sort by Slot WR" })).toHaveCount(0);
      expect(await table.locator("tbody tr:first-child td").count()).toBe(6); // Team, Opp, QB, RB, WR, TE
    }

    await page.getByRole("button", { name: "Raw", exact: true }).click();
    const wrCell = table.locator("tbody tr:first-child td").nth(4);
    await expect(wrCell).toContainText(/\d+\.\d\s*\(\d+\)/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
}
