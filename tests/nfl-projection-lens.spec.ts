import { readFileSync } from "node:fs";
import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8097";
const matchupUrl = "/nfl/matchups/baltimore-ravens-at-indianapolis-colts#comparison";
const artifactUrl = "**/data/nfl/2026/projected-matchup-metrics.json";

for (const width of [390, 1440]) {
  test(`${width}px BAL/IND projection isolates unavailable stats and restores observed data`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
    await page.route(artifactUrl, (route) => route.fulfill({ status: 404, body: "" }));
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${baseUrl}${matchupUrl}`);
    const panel = page.locator("#matchup-panel-comparison");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("img", { name: /Comparison rail — EPA \/ Play:.*Baltimore Ravens \+0\.050/ }).first()).toBeVisible();
    await panel.getByRole("tab", { name: "2026 Projection" }).click();
    await expect(panel.getByRole("heading", { name: "Statistical Comparison — 2026 Projection" })).toBeVisible();
    await expect(panel.getByText(/Season-stat projections are not yet published/)).toBeVisible();
    await expect(panel.getByRole("img", { name: /JKB Power Rating:.*54\.9.*60\.1/ })).toBeVisible();

    await expect(panel.getByRole("img", { name: /Comparison rail — EPA \/ Play:.*Baltimore Ravens \+0\.050/ })).toHaveCount(0);
    await expect(panel.getByRole("img", { name: /EPA \/ Play:.*Baltimore Ravens N\/A.*Indianapolis Colts N\/A/ })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Success Rate by Period" })).toHaveCount(0);
    await expect(panel.getByRole("switch")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`projection-${width}.png`), fullPage: true });
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    await expect(page.locator("#matchup-panel-overview").getByText(/2026 Projection:/)).toBeVisible();
    await page.getByRole("tab", { name: "Team Comparison", exact: true }).click();
    await panel.getByRole("tab", { name: "Season", exact: true }).click();
    await expect(panel.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    await expect(panel.getByRole("img", { name: /Comparison rail — EPA \/ Play:.*Baltimore Ravens \+0\.050/ }).first()).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Success Rate by Period" })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("published test projections use their own ranks and category counts", async ({ page }) => {
  const teams = JSON.parse(readFileSync("public/data/nfl/teams.json", "utf8")).teams as { id: string; abbr: string }[];
  // Synthetic fixture only: proves wiring, never writes a production artifact.
  const artifact = {
    schemaVersion: "nfl-projected-matchup-metrics-v1", season: 2026, horizon: "regular-season",
    asOf: "2026-09-01T00:00:00Z", generatedAt: "2026-09-02T00:00:00Z", projectionVersion: "synthetic-browser-test",
    metrics: { "off.epaPerPlay": { source: "Test only", producer: "Test only", modelVersion: "test-v1", definition: "Synthetic EPA/play", opponentAdjusted: false, dependsOnPowerRating: false } },
    teams: teams.map((team) => ({ teamId: team.id, abbr: team.abbr, metrics:
      team.abbr === "bal" ? { "off.epaPerPlay": { value: -.222, rank: 2 } } :
      team.abbr === "ind" ? { "off.epaPerPlay": { value: .333, rank: 1 } } : {},
    })),
  };
  await page.route(artifactUrl, (route) => route.fulfill({ json: artifact }));
  await page.goto(`${baseUrl}${matchupUrl}`);
  const panel = page.locator("#matchup-panel-comparison");
  await panel.getByRole("tab", { name: "2026 Projection" }).click();
  await expect(panel.getByRole("img", { name: /EPA \/ Play:.*-0\.222, rank 2 among available teams/ }).first()).toBeVisible();
  await expect(panel.getByRole("img", { name: /EPA \/ Play:.*\+0\.333, rank 1 among available teams/ }).first()).toBeVisible();
  await expect(panel.getByText("Leads 2 of 2", { exact: true }).first()).toBeVisible();
  await expect(panel.getByText(/synthetic-browser-test/)).toBeVisible();
});

