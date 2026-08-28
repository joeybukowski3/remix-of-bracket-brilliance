import { fileURLToPath } from "node:url";
import { expect, test } from "../playwright-fixture";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

// Sanitized DraftKings NFL Classic export whose games (NO@DET, DEN@KC) and
// player names line up with the committed 2026 Week 1 projection artifact, so
// the full analyzer flow renders real JKB ranks / Rank Diff without weakening
// production compatibility validation.
const FIXTURE_CSV = fileURLToPath(
  new URL("../src/lib/nfl/dfs/__fixtures__/draftkings-nfl-classic-week1-2026.csv", import.meta.url),
);

async function upload(page: import("@playwright/test").Page) {
  await page.locator('input[type="file"]').setInputFiles(FIXTURE_CSV);
  await expect(page.getByText(/rows parsed successfully/i)).toBeVisible();
}

test("NFL DFS analyzer completes the DraftKings upload journey without console errors", async ({ page }, testInfo) => {
  // Uncaught script errors only. Blocked third-party resources (analytics,
  // fonts, external logo CDN) surface as "Failed to load resource" console
  // noise under the analytics-blocking fixture and are not app defects.
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/Failed to load resource|net::ERR_/.test(text)) return;
    consoleErrors.push(text);
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${BASE_URL}/nfl/dfs?week=1`);
  await expect(page.getByRole("heading", { level: 1, name: "NFL DFS Contest Analyzer" })).toBeVisible();

  await upload(page);

  // Slate summary + readiness
  const summary = page.getByRole("region", { name: "Slate summary" });
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("NFL Classic");
  await expect(summary).toContainText("2 Games");
  await expect(summary).toContainText(/JKB Week 1/);
  await expect(summary).toContainText(/Ready|Ready with warnings/);

  // Scoring transparency disclosure — compact, collapsed by default
  const scoringToggle = page.getByRole("button", { name: /How JKB Proj compares to DraftKings scoring/i });
  await expect(scoringToggle).toHaveAttribute("aria-expanded", "false");
  await scoringToggle.click();
  await expect(page.getByText(/not\s+a\s+DraftKings-specific fantasy projection/i)).toBeVisible();
  await expect(page.getByRole("row", { name: /Interception/ })).toContainText("-1");
  await expect(page.getByRole("row", { name: /Interception/ })).toContainText("-2");
  await expect(page.getByRole("row", { name: /passing-yard bonus/ })).toContainText("none");
  await expect(page.getByRole("row", { name: /DST projection/ })).toContainText("no JKB projection");

  // Value Board + Rank Diff data
  const tableRegion = page.getByRole("region", { name: "DFS analyzer table" });
  await expect(tableRegion.getByRole("tab", { name: "Value Board" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("columnheader", { name: "Rank Diff" })).toBeVisible();
  const goffRow = page.getByRole("row", { name: /Jared Goff/ });
  await expect(goffRow).toBeVisible();
  await expect(goffRow).toContainText(/[+-]\d|E/); // a real Rank Diff value

  // Position tab + expand a player -> research area
  await tableRegion.getByRole("tab", { name: "RB" }).click();
  const gibbsRow = page.getByRole("row", { name: /Jahmyr Gibbs/ });
  await gibbsRow.getByRole("button", { name: /Expand Jahmyr Gibbs/ }).click();
  await expect(page.getByText("Season PPG", { exact: true })).toBeVisible();
  await expect(page.getByText("Opp Allowed (Season)", { exact: true })).toBeVisible();

  // DST tab -> no fabricated JKB metrics
  await tableRegion.getByRole("tab", { name: "DST" }).click();
  const chiefsRow = page.getByRole("row", { name: /Chiefs/ });
  await expect(chiefsRow).toContainText(/No JKB DST projection/i);

  await page.screenshot({ path: testInfo.outputPath("dfs-desktop.png"), fullPage: true });
  expect(pageErrors, `page errors:\n${pageErrors.join("\n")}`).toEqual([]);
  expect(consoleErrors, `console errors:\n${consoleErrors.join("\n")}`).toEqual([]);
});

test("NFL DFS analyzer mobile cards carry the core comparison fields", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/nfl/dfs?week=1`);
  await upload(page);

  await expect(page.getByRole("table")).toHaveCount(0);
  const tableRegion = page.getByRole("region", { name: "DFS analyzer table" });
  await tableRegion.getByRole("tab", { name: "QB" }).click();

  const card = page.getByRole("listitem").filter({ hasText: "Jared Goff" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("$"); // salary
  await expect(card).toContainText(/DK QB\d/); // DK positional rank
  await expect(card).toContainText(/JKB QB\d/); // JKB slate rank
  await expect(card).toContainText(/Proj \d/); // projection
  await expect(card).toContainText(/[+-]\d|E/); // Rank Diff

  await card.getByRole("button").first().click();
  await expect(card).toContainText(/JKB Week RK/);
  await expect(card).toContainText(/JKB Pts\/\$1K/);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.screenshot({ path: testInfo.outputPath("dfs-mobile.png"), fullPage: true });
});
