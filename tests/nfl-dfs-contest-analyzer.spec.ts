import { fileURLToPath } from "node:url";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { expect, test } from "../playwright-fixture";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

// Optional static-build QA for environments that cannot bind a local server.
// Uses this workspace's dist and the same analytics-blocking fixture. No mocks
// of application data or behavior; browser requests read actual built artifacts.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-07T23:55:00Z"));
  if (process.env.PLAYWRIGHT_DFS_LOCAL_DIST !== "1") return;
  const root = resolve("dist");
  await page.route(`${BASE_URL}/**`, async (route) => {
    const path = resolve(root, `.${decodeURIComponent(new URL(route.request().url()).pathname)}`);
    if (!path.startsWith(`${root}${sep}`)) return route.abort();
    const exists = await stat(path).then((entry) => entry.isFile()).catch(() => false);
    const file = exists ? path : resolve(root, "index.html");
    const mime: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
    await route.fulfill({ body: await readFile(file), contentType: mime[extname(file)] ?? "application/octet-stream" });
  });
});

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
  const historyRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("yardage-history")) historyRequests.push(request.url());
  });
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
  expect(historyRequests).toHaveLength(0);

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

  // Generated lineups -- absent until the user asks for them, then all three
  // strategies with an explainable, rules-conformant roster.
  const lineups = page.getByRole("region", { name: "Generated Lineups" });
  await expect(lineups).toBeVisible();
  await expect(lineups.getByRole("tablist", { name: "Lineup strategy" })).toHaveCount(0);
  await lineups.getByRole("button", { name: /Generate Lineups/i }).click();
  const strategyTabs = lineups.getByRole("tablist", { name: "Lineup strategy" });
  await expect(strategyTabs).toBeVisible();
  for (const label of ["Highest Ceiling Lineup", "Highest Floor Lineup", "Balanced JKB Lineup"]) {
    await expect(strategyTabs.getByRole("tab", { name: label })).toBeVisible();
  }
  const lineupPanel = lineups.getByRole("tabpanel");
  await expect(lineupPanel).toContainText("Salary used");
  await expect(lineupPanel).toContainText(/\$\d{1,2},\d{3}/);
  await expect(lineupPanel).toContainText("JKB offense proj");
  await expect(lineupPanel).toContainText("8 offensive slots; DST has no JKB projection");
  await expect(lineupPanel).toContainText("DraftKings benchmark, not consensus");
  for (const slot of ["QB", "RB1", "RB2", "WR1", "WR2", "WR3", "TE", "FLEX", "DST"]) {
    await expect(lineupPanel.getByRole("cell", { name: slot, exact: true })).toBeVisible();
  }
  await expect(lineupPanel.getByRole("row", { name: /DST/ }).last()).toContainText(/no JKB proj/i);
  await lineups.getByText(/Generated-lineup methodology and limitations/i).click();
  await expect(lineups).toContainText(/transparent product heuristics/i);
  await expect(lineups).toContainText(/not calibrated DFS/i);
  await expect(lineups).toContainText("$50,000 salary cap");
  await strategyTabs.getByRole("tab", { name: "Highest Floor Lineup" }).click();
  await expect(lineups.getByRole("tabpanel")).toContainText(/stable workload and role certainty/i);
  await page.screenshot({ path: testInfo.outputPath("dfs-desktop-lineups.png"), fullPage: true });

  // Contest rules now carry the verified salary cap.
  await page.getByRole("button", { name: /Contest Rules -- NFL Classic/ }).click();
  await expect(summary).toContainText("$50,000");
  await expect(summary).toContainText(/Official DraftKings NFL rules/i);

  // Value Board + Rank Diff data
  const tableRegion = page.getByRole("region", { name: "DFS analyzer table" });
  await expect(tableRegion.getByRole("tab", { name: "Value Board" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("columnheader", { name: "Rank Diff" })).toBeVisible();
  const goffRow = tableRegion.getByRole("row", { name: /Jared Goff/ });
  await expect(goffRow).toBeVisible();
  await expect(goffRow).toContainText(/[+-]\d|E/); // a real Rank Diff value
  await expect(page.getByRole("columnheader", { name: "FPA", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "DEF VS AVG" })).toBeVisible();
  await expect(goffRow).toContainText(/\d\/\d+ Above/);
  expect(historyRequests).toHaveLength(1);
  expect(historyRequests[0]).toContain("week-01/index.json");

  // Position tab + expand a player -> research area
  await tableRegion.getByRole("tab", { name: "RB" }).click();
  const gibbsRow = tableRegion.getByRole("row", { name: /Jahmyr Gibbs/ });
  await expect(gibbsRow).toContainText("Optimizer: Eligible");
  await gibbsRow.getByRole("button", { name: /Expand Jahmyr Gibbs/ }).click();
  await expect(page.getByText("Season PPG", { exact: true })).toBeVisible();
  await expect(page.getByText("Opp Allowed (Season)", { exact: true })).toBeVisible();
  const history = page.getByRole("region", { name: "Historical yardage context" });
  await expect(history.getByRole("table")).toBeVisible();
  await expect(history).toContainText("entire position group");
  await expect(history.getByTitle("No archived line").first()).toHaveText("—");
  await history.getByRole("tab", { name: "Opponent Last 10" }).click();
  await expect(history).toContainText("Individual recorded offensive appearances");
  await expect(history.getByRole("table")).toContainText("Player avg");
  expect(historyRequests.filter((url) => url.endsWith("/RB.json"))).toHaveLength(1);
  await page.screenshot({ path: testInfo.outputPath("dfs-desktop-history.png"), fullPage: true });
  await gibbsRow.getByRole("button", { name: /Collapse/ }).click();
  await expect(history).toHaveCount(0);
  await gibbsRow.getByRole("button", { name: /Expand/ }).click();
  await expect(history.getByRole("table")).toBeVisible();
  expect(historyRequests.filter((url) => url.endsWith("/RB.json"))).toHaveLength(1);
  expect(historyRequests.some((url) => url.endsWith("/2026/yardage-history.json"))).toBe(false);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  // DST tab -> no fabricated JKB metrics
  await tableRegion.getByRole("tab", { name: "DST" }).click();
  const chiefsRow = tableRegion.getByRole("row", { name: /Chiefs/ });
  await expect(chiefsRow).toContainText(/No JKB DST projection/i);
  await expect(chiefsRow).toContainText(/DST Matchup Rank \d/);
  await expect(chiefsRow).toContainText("Coverage 80%");

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
  await expect(card).toContainText("Optimizer: Eligible");
  await expect(card).toContainText(/[+-]\d|E/); // Rank Diff
  await expect(card).toContainText("FPA TO POSITION");
  await expect(card).toContainText("DEF VS AVG");
  await expect(card).toContainText(/\d\/\d+ Above/);

  await card.getByRole("button").first().click();
  await expect(card).toContainText(/JKB Week RK/);
  await expect(card).toContainText(/JKB Pts\/\$1K/);
  const history = card.getByRole("region", { name: "Historical yardage context" });
  await expect(history.getByRole("table")).toBeVisible();
  await history.getByRole("tab", { name: "Opponent Last 10" }).click();
  await expect(history.getByRole("table")).toContainText("Player avg");
  await expect(history.getByTitle("No archived line").first()).toHaveText("—");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  // Generated lineups stay usable on a phone: no horizontal page overflow.
  const lineups = page.getByRole("region", { name: "Generated Lineups" });
  await lineups.getByRole("button", { name: /Generate Lineups/i }).click();
  await expect(lineups.getByRole("tabpanel")).toContainText("Salary used");
  await expect(lineups.getByRole("tabpanel")).toContainText("8 offensive slots; DST has no JKB projection");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.screenshot({ path: testInfo.outputPath("dfs-mobile.png"), fullPage: true });
});
