import { expect, test } from "../playwright-fixture";
import { readFileSync } from "node:fs";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";
const widths = [1440, 1150, 1024, 768, 430, 390, 375];
const artifact = JSON.parse(readFileSync("public/data/nfl/betting-splits/current.json", "utf8"));
const schedule = JSON.parse(readFileSync("public/data/nfl/2026/games.json", "utf8"));
const boardUrl = `${baseUrl}/nfl/matchups?week=${artifact._meta.week}`;
const missingBefore = schedule.games.filter((game: { week: number; gameId: string }) =>
  game.week === artifact._meta.week && !artifact.games.some((row: { gameId: string }) => row.gameId === game.gameId)
).length;

for (const width of widths) {
  test(`weekly betting splits stays contained at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/data/nfl/betting-splits/current.json", async (route) => {
      const sample = structuredClone(artifact);
      const [away, home] = sample.games[0].markets.spread;
      away.handlePct = 70;
      away.betsPct = 50;
      home.handlePct = 30;
      home.betsPct = 50;
      await route.fulfill({ json: sample });
    });
    await page.goto(boardUrl);
    const card = page.locator("[data-matrix-game]").first();
    const splits = card.locator("[data-matchup-compact-splits]");
    await expect(splits).toBeVisible();
    await expect(page.locator("[data-splits-provenance]")).toContainText("DraftKings Network");
    await expect(page.locator("[data-splits-provenance]")).toContainText(/Fresh|Stale/);
    await expect(splits.locator("[aria-label^='Spread:']")).toBeVisible();
    await expect(splits.locator("[aria-label^='Moneyline:']")).toBeVisible();
    await expect(splits.locator("[aria-label^='Total:']")).toBeVisible();
    await expect(page.locator("[data-matchup-compact-splits] [aria-label*='Money Gap'], [data-matchup-compact-splits] [aria-label*='Money Lean']").first()).toBeVisible();
    await expect(card.locator("[data-matchup-summary-strip]")).toBeVisible();
    await expect(card.locator("[data-matrix-team-cell='away'] img")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const cardBox = await card.boundingBox();
    const splitsBox = await splits.boundingBox();
    expect(cardBox && splitsBox).toBeTruthy();
    expect(splitsBox!.x + splitsBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);
    expect(splitsBox!.height).toBeLessThanOrEqual(width < 430 ? 56 : 38);
    if (width === 1440 || width === 390) await page.screenshot({ path: testInfo.outputPath(`weekly-splits-${width}.png`), fullPage: true });
  });
}

test("matchup link still navigates from a card with splits", async ({ page }) => {
  await page.goto(boardUrl);
  const card = page.locator("[data-matrix-game]").first();
  await expect(card.locator("[data-matchup-compact-splits]")).toBeVisible();
  const link = card.getByRole("link", { name: /view matchup breakdown/i });
  const href = await link.getAttribute("href");
  await link.click();
  expect(new URL(page.url()).pathname).toBe(href);
});

test("stale capture remains visible in the board", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route("**/data/nfl/betting-splits/current.json", async (route) => {
    const response = await route.fetch();
    const sample = await response.json();
    sample._meta.sourceCapturedAt = new Date(Date.parse(sample._meta.sourceCapturedAt) - 24 * 60 * 60 * 1000).toISOString();
    await route.fulfill({ response, json: sample });
  });
  await page.goto(boardUrl);
  await expect(page.locator("[data-splits-provenance]")).toContainText("Stale");
  await expect(page.locator("[data-matchup-compact-splits][data-splits-state='stale']").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("weekly-splits-stale-390.png"), fullPage: true });
});

test("unavailable artifact and absent game use neutral dashes", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route("**/data/nfl/betting-splits/current.json", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto(boardUrl);
  await expect(page.locator("[data-splits-provenance]")).toContainText("Unavailable");
  const unavailable = page.locator("[data-matchup-compact-splits]").first();
  await expect(unavailable).toHaveAttribute("data-splits-state", "unavailable");
  await expect(unavailable.locator("[aria-label$='unavailable']")).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath("weekly-splits-unavailable-390.png"), fullPage: true });
});

test("valid artifact without a board game shows missing state", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route("**/data/nfl/betting-splits/current.json", async (route) => {
    const response = await route.fetch();
    const sample = await response.json();
    sample.games[0].gameId = `${sample.games[0].gameId}_UNUSED`;
    await route.fulfill({ response, json: sample });
  });
  await page.goto(boardUrl);
  await expect(page.locator("[data-matchup-compact-splits][data-splits-state='missing']")).toHaveCount(missingBefore + 1);
  await expect(page.locator("[data-matchup-compact-splits][data-splits-state='missing']").last().locator("[aria-label$='not in the current pregame snapshot']")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("weekly-splits-missing-390.png"), fullPage: true });
});
