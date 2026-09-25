import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4174";
const route = "/nfl/matchups/houston-texans-at-indianapolis-colts";
const artifactPath = "**/data/nfl/betting-splits/current.json";

test.setTimeout(90_000);

for (const width of [1440, 1150, 1024, 768, 430, 390, 375]) {
  test(`matchup splits and surrounding controls fit at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}${route}`);
    await expect(page.getByRole("tab", { name: "Overview", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Team Comparison" }).click();
    await expect(page.getByRole("tab", { name: "Market Profile" })).toBeVisible();
    await page.getByRole("tab", { name: "Betting Splits" }).click();
    const section = page.getByRole("region", { name: "Betting Splits", exact: true });
    await expect(section).toBeVisible();
    for (const market of ["Spread", "Moneyline", "Total"]) {
      await expect(section.getByRole("region", { name: `${market} betting splits` })).toBeVisible();
    }
    await expect(section.getByText(/DraftKings Network/)).toBeVisible();
    const metrics = await page.evaluate(() => {
      const section = document.querySelector('section[aria-label="Betting Splits"]')!;
      const marketCards = [...section.querySelectorAll('section[aria-label$="betting splits"]')];
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        sectionOverflow: section.scrollWidth - section.clientWidth,
        cardOverflow: marketCards.map((card) => card.scrollWidth - card.clientWidth),
        columns: getComputedStyle(section.querySelector(".grid")!).gridTemplateColumns.split(" ").length,
        marketHeights: marketCards.map((card) => card.getBoundingClientRect().height),
        logoWidths: [...section.querySelectorAll("img")].map((logo) => logo.getBoundingClientRect().width),
      };
    });
    expect(metrics.overflow).toBeLessThanOrEqual(1);
    expect(metrics.sectionOverflow).toBeLessThanOrEqual(1);
    expect(metrics.cardOverflow.every((value) => value <= 1)).toBe(true);
    expect(metrics.columns).toBe(width >= 1024 ? 3 : 1);
    expect(Math.max(...metrics.marketHeights)).toBeLessThan(240);
    expect(metrics.logoWidths.every((value) => value <= 20)).toBe(true);
    if (width === 1440 || width === 390) {
      await section.scrollIntoViewIfNeeded();
      await section.screenshot({ path: testInfo.outputPath(`matchup-splits-section-${width}.png`) });
      await page.screenshot({ path: testInfo.outputPath(`matchup-splits-${width}.png`), fullPage: true });
    }
    await page.getByRole("tab", { name: "Betting Market Context" }).click();
    await expect(page.getByRole("region", { name: "Betting market context" })).toBeVisible();
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Team Comparison" })).toBeVisible();
  });
}

test("stale snapshot stays visible on a narrow matchup", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route(artifactPath, async (route) => {
    const response = await route.fetch();
    const artifact = await response.json();
    artifact._meta.sourceCapturedAt = "2026-09-24T14:47:13.329Z";
    await route.fulfill({ response, json: artifact });
  });
  await page.goto(`${baseUrl}${route}`);
  await page.getByRole("tab", { name: "Team Comparison" }).click();
  await page.getByRole("tab", { name: "Betting Splits" }).click();
  const section = page.getByRole("region", { name: "Betting Splits", exact: true });
  await expect(section.getByText(/Stale snapshot/)).toBeVisible();
  await expect(section.getByRole("region", { name: "Spread betting splits" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("matchup-splits-stale-390.png"), fullPage: true });
});

test("valid snapshot without the matchup shows the specific absence state", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route(artifactPath, async (route) => {
    const response = await route.fetch();
    const artifact = await response.json();
    artifact.games = artifact.games.filter((game: { gameId: string }) => game.gameId !== "2026_03_HOU_IND");
    artifact._meta.diagnostics.matchedEligibleGames -= 1;
    artifact._meta.diagnostics.missingEligibleGames += 1;
    artifact._meta.diagnostics.missingEligibleGameIds.push("2026_03_HOU_IND");
    await route.fulfill({ response, json: artifact });
  });
  await page.goto(`${baseUrl}${route}`);
  await page.getByRole("tab", { name: "Team Comparison" }).click();
  await page.getByRole("tab", { name: "Betting Splits" }).click();
  const section = page.getByRole("region", { name: "Betting Splits", exact: true });
  await expect(section.getByText(/not available for this matchup in the current pregame snapshot/)).toBeVisible();
  await expect(section.getByText(/currently unavailable/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("matchup-splits-missing-390.png"), fullPage: true });
});
