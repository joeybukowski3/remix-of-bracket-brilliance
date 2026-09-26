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
    for (const title of ["Highest Public Sides", "Sharp Sides", "Contrarian Sides"]) {
      const section = page.getByRole("region", { name: title });
      await expect(section.getByRole("heading", { name: title })).toBeVisible();
      if (width < 768) {
        const first = section.locator("article").first();
        await expect(first).toContainText("Handle");
        await expect(first).toContainText("Bets");
        await expect(first).toContainText("Gap");
      } else {
        await expect(section.getByRole("columnheader", { name: "Side / Number" })).toBeVisible();
        await expect(section.getByRole("columnheader", { name: "Gap" })).toBeVisible();
      }
    }
    if (width < 768) {
      await expect(page.getByRole("region", { name: "Overview matchup cards" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Overview matchup cards" }).locator("article").first()).toBeVisible();
    } else {
      const table = page.getByRole("region", { name: "Overview matchup distribution" });
      await expect(table).toBeVisible();
      await expect(table.getByRole("columnheader", { name: "Spread betting splits" })).toBeVisible();
      await expect(table.getByRole("columnheader", { name: "Total betting splits" })).toBeVisible();
      await expect(table.getByRole("columnheader", { name: "Moneyline betting splits" })).toBeVisible();
      await expect(table.getByRole("columnheader", { name: "Total", exact: true })).toBeVisible();
      await expect(table.getByRole("columnheader", { name: /Sharp Indicator/ })).toBeVisible();
      for (const market of ["Spread", "Total", "Moneyline"]) for (const metric of ["Handle", "Bets"]) await expect(table.getByRole("button", { name: `Sort by ${market} ${metric} Favorite` })).toBeVisible();
    }
    const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await noOverflow();
    if (width === 1440 || width === 390) await page.screenshot({ path: testInfo.outputPath(`overview-${width}.png`), fullPage: true });
    for (const market of ["Spread", "Moneyline", "Total"]) {
      await page.getByRole("tab", { name: market }).click();
      await expect(page.getByRole("heading", { name: `${market} distribution` })).toBeVisible();
      await expect(page.getByRole("region", { name: width < 768 ? `${market.toLowerCase()} mobile rows` : `${market.toLowerCase()} betting splits` })).toBeVisible();
      if (market === "Total") {
        await expect(page.locator('[data-total-side="over"]:visible').first()).toBeVisible();
        await expect(page.locator('[data-total-side="under"]:visible').first()).toBeVisible();
      }
      if (market === "Spread" && width >= 768) {
        const headers = await page.getByRole("region", { name: "spread betting splits" }).getByRole("columnheader").allTextContents();
        expect(headers.slice(0, 3).map((text) => text.trim())).toEqual(["Team", "Line", "Opp"]);
      }
      if (width < 768 && market !== "Total") {
        const cards = page.getByRole("region", { name: `${market.toLowerCase()} mobile rows` }).locator("article");
        const logoMarks = cards.first().locator("[data-team-logo]");
        await expect(logoMarks).toHaveCount(2);
        await expect(logoMarks.first()).toHaveAttribute("data-team-logo", /^[A-Z]{2,3}$/);
        await expect(cards.first()).toContainText(/@|vs/);
        await expect(cards.first()).toContainText("Money Gap");
      }
      await noOverflow();
      if (width === 1440 || (width === 390 && (market === "Spread" || market === "Total"))) await page.screenshot({ path: testInfo.outputPath(`${market.toLowerCase()}-${width}.png`), fullPage: true });
    }
  });
}
