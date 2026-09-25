import { test, expect } from "../playwright-fixture";

const widths = [1440, 1150, 1024, 768, 430, 390, 375];
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4174";

for (const width of widths) {
  test(`NFL betting splits remains contained at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/nfl/betting-splits`);
    await expect(page.getByRole("heading", { name: "NFL Betting Splits" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
    await expect(page.getByText("Biggest Money Gap")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /Fresh|Stale/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/nfl-betting-splits-overview-${width}.png`, fullPage: true });
    await page.getByRole("tab", { name: "Spread" }).click();
    await expect(page.getByRole("region", { name: width < 640 ? "spread betting splits mobile" : "spread betting splits", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/nfl-betting-splits-${width}.png`, fullPage: true });
    for (const market of ["Moneyline", "Total"]) {
      await page.getByRole("tab", { name: market }).click();
      await expect(page.getByRole("region", { name: `${market.toLowerCase()} betting splits${width < 640 ? " mobile" : ""}`, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}

test("stale capture warning stays contained on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.route("**/data/nfl/betting-splits/current.json", async (route) => {
    const response = await route.fetch();
    const artifact = await response.json();
    artifact._meta.sourceCapturedAt = "2026-09-24T14:47:13.329Z";
    await route.fulfill({ response, json: artifact });
  });
  await page.goto(`${baseUrl}/nfl/betting-splits`);
  await expect(page.getByRole("alert")).toContainText("Stale betting splits");
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/nfl-betting-splits-stale-375.png", fullPage: true });
});
