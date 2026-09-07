import { readFileSync } from "node:fs";
import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8097";
const url = `${baseUrl}/nfl/matchups/baltimore-ravens-at-indianapolis-colts#comparison`;
const read = (path: string) => JSON.parse(readFileSync(`public/data/nfl/${path}`, "utf8"));

for (const width of [390, 1440]) {
  test(`${width}px distinct blended, projected, current, recent and historical lenses`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
    await page.route("**/data/nfl/2026/projected-matchup-metrics.json", (route) => route.fulfill({ status: 404, body: "" }));
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    const panel = page.locator("#matchup-panel-comparison");
    const historicEpa = panel.getByRole("img", { name: /EPA \/ Play:.*Baltimore Ravens \+0\.050/ }).first();
    await expect(historicEpa).toBeVisible();
    await panel.getByRole("tab", { name: "2026 Blended", exact: true }).click();
    await expect(panel.getByRole("heading", { name: "Statistical Comparison — 2026 Blended" })).toBeVisible();
    await expect(panel.getByText(/fading the projection prior/)).toBeVisible();
    await expect(panel.getByText(/BAL: 100% projection \/ 0% observed/)).toBeVisible();
    await expect(panel.getByRole("img", { name: /JKB Power Rating:.*54\.9.*60\.1/ })).toBeVisible();
    await expect(panel.getByRole("img", { name: /EPA \/ Play:.*Baltimore Ravens N\/A.*Indianapolis Colts N\/A/ })).toBeVisible();
    await expect(panel.locator("#comparison-overall-trigger")).toHaveAccessibleName(/leading 1 of 1 comparable metrics/);
    await expect(panel.getByRole("switch")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`blended-${width}.png`), fullPage: true });
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    await expect(page.locator("#matchup-panel-overview").getByText("2026 Blended:", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Team Comparison", exact: true }).click();
    await panel.getByRole("tab", { name: "2026 Projection", exact: true }).click();
    await expect(panel.getByRole("heading", { name: "Statistical Comparison — 2026 Projection" })).toBeVisible();
    await panel.getByRole("tab", { name: "2026 Season", exact: true }).click();
    await expect(panel.getByRole("heading", { name: "Statistical Comparison — 2026 Season" })).toBeVisible();
    await expect(panel.getByRole("img", { name: /EPA \/ Play:.*Baltimore Ravens N\/A.*Indianapolis Colts N\/A/ })).toBeVisible();
    await panel.getByRole("tab", { name: "2025 Season", exact: true }).click();
    const epa = read("matchup-epa.json").windows["prior-season-full"].teams.bal.totals.offense;
    const formatted = (epa.offEpa / epa.offPlays).toFixed(3);
    await expect(panel.getByRole("img", { name: new RegExp(`EPA / Play:.*Baltimore Ravens \\+${formatted.replace(".", "\\.")}`) }).first()).toBeVisible();
    await panel.getByRole("tab", { name: "Last 5", exact: true }).click();
    await expect(panel.getByRole("tab", { name: "Last 5", exact: true })).toHaveAttribute("aria-selected", "true");
    await panel.getByRole("tab", { name: "Season", exact: true }).click();
    await expect(panel.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    await expect(historicEpa).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("synthetic live sources blend unequal team samples and rank the resulting values", async ({ page }) => {
  const teams = read("teams.json").teams as { id: string; abbr: string }[];
  const results = read("2026/results.json");
  const result = (gameId: string, awayAbbr: string) => ({ gameId, season: 2026, week: 3, seasonType: "REG", final: true, homeAbbr: "bal", awayAbbr, homeScore: 21, awayScore: 10, winner: "bal" });
  results.results = [result("test-a", "ind"), result("test-b", "atl")];
  results._meta.generatedAt = "2026-09-25T00:00:00Z";
  const epa = read("matchup-epa.json");
  const team = (ids: string[], value: number) => ({ gamesIncluded: ids.length, gameIds: ids, seasons: [2026], through: { season: 2026, week: 3, dateUtc: results._meta.generatedAt },
    metrics: { "off.epaPerPlay": [value, 32] }, totals: { offense: { offEpa: value * 100, offPlays: 100 } } });
  epa.windows["season-current"] = { mode: "season", includePriorSeason: false, teams: { bal: team(["test-a", "test-b"], .8), ind: team(["test-a"], .1) } };
  epa._meta.generatedAt = results._meta.generatedAt;
  const projected = { schemaVersion: "nfl-projected-matchup-metrics-v1", season: 2026, horizon: "regular-season", generatedAt: "2026-09-01T00:00:00Z", asOf: "2026-09-01T00:00:00Z", projectionVersion: "synthetic-only",
    metrics: { "off.epaPerPlay": { source: "test", producer: "test", modelVersion: "test", definition: "test EPA/play", opponentAdjusted: false, dependsOnPowerRating: false } },
    teams: teams.map((t) => ({ teamId: t.id, abbr: t.abbr, metrics: t.abbr === "bal" ? { "off.epaPerPlay": { value: .1, rank: 2 } } : t.abbr === "ind" ? { "off.epaPerPlay": { value: .2, rank: 1 } } : {} })) };
  await page.route("**/data/nfl/2026/results.json", (route) => route.fulfill({ json: results }));
  await page.route("**/data/nfl/matchup-epa.json", (route) => route.fulfill({ json: epa }));
  await page.route("**/data/nfl/2026/projected-matchup-metrics.json", (route) => route.fulfill({ json: projected }));
  await page.goto(url);
  const panel = page.locator("#matchup-panel-comparison");
  await panel.getByRole("tab", { name: "2026 Blended", exact: true }).click();
  await expect(panel.getByText(/BAL: 60% projection \/ 40% observed.*IND: 80% projection \/ 20% observed/)).toBeVisible();
  await expect(panel.getByRole("img", { name: /EPA \/ Play:.*Baltimore Ravens \+0\.380, rank 1 among available teams/ }).first()).toBeVisible();
  await expect(panel.getByRole("img", { name: /EPA \/ Play:.*Indianapolis Colts \+0\.180, rank 2 among available teams/ }).first()).toBeVisible();
  await panel.getByRole("tab", { name: "2026 Projection", exact: true }).click();
  await expect(panel.getByRole("img", { name: /EPA \/ Play:.*Baltimore Ravens \+0\.100, rank 2/ }).first()).toBeVisible();
  await panel.getByRole("tab", { name: "2026 Season", exact: true }).click();
  await expect(panel.getByRole("img", { name: /EPA \/ Play:.*Baltimore Ravens \+0\.800/ }).first()).toBeVisible();
});
