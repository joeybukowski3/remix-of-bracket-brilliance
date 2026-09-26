import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";
const widths = [1440, 1150, 1024, 768, 430, 390, 375];

for (const width of widths) {
  test(`betting splits tabs stay contained at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/nfl/betting-splits`);
    await expect(page.getByRole("heading", { name: "NFL Betting Splits" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Matchup distribution" })).toBeVisible();
    if (width < 768) {
      await expect(page.getByRole("region", { name: "Overview matchup cards" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Overview matchup cards" }).locator("article").first()).toBeVisible();
    } else {
      const table = page.getByRole("region", { name: "Overview matchup distribution" });
      await expect(table).toBeVisible();
      await expect(table.getByRole("columnheader", { name: "Spread betting splits" })).toBeVisible();
      await expect(table.getByRole("columnheader", { name: "Total betting splits" })).toBeVisible();
      await expect(table.getByRole("columnheader", { name: "Moneyline betting splits" })).toBeVisible();
    }
    const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await noOverflow();
    if (width === 1440 || width === 390) await page.screenshot({ path: testInfo.outputPath(`overview-${width}.png`), fullPage: true });
    for (const market of ["Spread", "Moneyline", "Total"]) {
      await page.getByRole("tab", { name: market }).click();
      await expect(page.getByRole("heading", { name: `${market} distribution` })).toBeVisible();
      await expect(page.getByRole("region", { name: width < 768 ? `${market.toLowerCase()} mobile rows` : `${market.toLowerCase()} betting splits` })).toBeVisible();
      await noOverflow();
      if ((width === 1440 && ["Spread", "Moneyline", "Total"].includes(market)) || (width === 390 && market === "Spread")) await page.screenshot({ path: testInfo.outputPath(`${market.toLowerCase()}-${width}.png`), fullPage: true });
    }
  });
}
