import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

for (const width of [1440, 390]) {
  test(`betting splits layout and controls at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/nfl/betting-splits`);
    await expect(page.getByRole("heading", { name: "NFL Betting Splits" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
    const noPageOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const overview = page.getByRole("region", { name: width < 768 ? "Overview matchup cards" : "Overview matchup distribution" });
    await expect(overview).toBeVisible();
    await expect(overview.locator("[data-splits-game-id]").first()).toBeVisible();
    await expect(overview.getByText("Money", { exact: true }).first()).toBeVisible();
    await expect(overview.getByText("Tickets", { exact: true }).first()).toBeVisible();
    await noPageOverflow();
    await page.screenshot({ path: testInfo.outputPath(`overview-${width}.png`), fullPage: true });

    for (const market of ["Spread", "Moneyline", "Total"]) {
      await page.getByRole("tab", { name: market }).click();
      await expect(page.getByRole("heading", { name: `${market} rankings` })).toBeVisible();
      await expect(page.getByRole("region", { name: "Money ranking" })).toBeVisible();
      if (width >= 768) await expect(page.getByRole("region", { name: "Tickets ranking" })).toBeVisible();
      const moneyRows = page.getByRole("region", { name: "Money ranking" }).locator("tbody tr");
      await expect(moneyRows.first()).toBeVisible();
      if (market === "Total") {
        await expect(page.getByRole("region", { name: "Money ranking" }).getByText("Over", { exact: true }).first()).toBeVisible();
        await expect(page.getByRole("region", { name: "Money ranking" }).getByText("Under", { exact: true }).first()).toBeVisible();
      }
      await page.getByRole("combobox", { name: "Sort ranking rows" }).selectOption("lowest");
      await expect(moneyRows.first()).toBeVisible();
      await page.getByRole("combobox", { name: "Sort ranking rows" }).selectOption("az");
      if (width < 768) {
        await page.getByRole("button", { name: "Tickets" }).click();
        await expect(page.getByRole("region", { name: "Tickets ranking" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Tickets" })).toHaveAttribute("aria-pressed", "true");
      }
      await noPageOverflow();
      await page.screenshot({ path: testInfo.outputPath(`${market.toLowerCase()}-${width}.png`), fullPage: true });
    }
  });
}

test("stale warning remains visible without mobile overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
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
});

for (const width of [1440, 390]) {
  test(`canonical NFL logo failures keep reserved slots at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    let failImages!: () => void;
    const pendingFailure = new Promise<void>((resolve) => { failImages = resolve; });
    await page.route("**/i/teamlogos/nfl/500/**", async (route) => {
      await pendingFailure;
      await route.abort();
    });
    await page.goto(`${baseUrl}/nfl/betting-splits`, { waitUntil: "domcontentloaded" });
    const overview = page.getByRole("region", { name: width < 768 ? "Overview matchup cards" : "Overview matchup distribution" });
    const firstGame = overview.locator("[data-splits-game-id]").first();
    const logo = firstGame.locator('img[src*="/teamlogos/nfl/500/"]').first();
    await expect(logo).toBeVisible();
    const beforeLogo = await logo.boundingBox();
    const beforeGame = await firstGame.boundingBox();
    await expect(logo).toHaveAttribute("src", /\/nfl\/500\/[a-z]+\.png$/);
    failImages();
    const fallback = firstGame.locator("div.rounded-full").first();
    await expect(fallback).toBeVisible();
    await expect(firstGame.locator('img[src*="/teamlogos/nfl/500/"]')).toHaveCount(0);
    const afterLogo = await fallback.boundingBox();
    const afterGame = await firstGame.boundingBox();
    expect(beforeLogo && afterLogo && beforeGame && afterGame).toBeTruthy();
    expect(Math.round(afterLogo!.width)).toBe(Math.round(beforeLogo!.width));
    expect(Math.round(afterLogo!.height)).toBe(Math.round(beforeLogo!.height));
    expect(Math.abs(afterGame!.height - beforeGame!.height)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`logo-fallback-${width}.png`), fullPage: true });

    await page.getByRole("tab", { name: "Spread" }).click();
    const ranking = page.getByRole("region", { name: "Money ranking" });
    await expect(ranking.locator("div.rounded-full").first()).toBeVisible();
    const rankingLogo = await ranking.locator("div.rounded-full").first().boundingBox();
    expect(Math.round(rankingLogo!.width)).toBe(16);
    expect(Math.round(rankingLogo!.height)).toBe(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
