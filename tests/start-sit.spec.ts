import { expect, test } from "../playwright-fixture";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";
const players = {
  a: { player_id: "a", full_name: "Josh Allen", position: "QB", team: "BUF", gsis_id: "00-0034857" },
  b: { player_id: "b", full_name: "Lamar Jackson", position: "QB", team: "BAL", gsis_id: "00-0034796" },
  c: { player_id: "c", full_name: "Jahmyr Gibbs", position: "RB", team: "DET", gsis_id: "00-0039139" },
  d: { player_id: "d", full_name: "Ja'Marr Chase", position: "WR", team: "CIN", gsis_id: "00-0036900" },
  k: { player_id: "k", full_name: "Sample Kicker", position: "K", team: "BUF" },
};

function mockSleeper(page: import("@playwright/test").Page) {
  return page.route("https://api.sleeper.app/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const leagueId = path.match(/\/league\/(l\d+)\//)?.[1];
    const body = path === "/v1/user/sample" ? { user_id: "u", username: "sample" }
      : path === "/v1/user/u/leagues/nfl/2026" ? Array.from({ length: 24 }, (_, index) => ({ league_id: `l${index + 1}`, name: `Work League ${index + 1}`, season: "2026", roster_positions: ["QB", "SUPER_FLEX", "FLEX", "K"], scoring_settings: { rec: 1 } }))
      : leagueId && path.endsWith("/rosters") ? [{ roster_id: 1, owner_id: "u", players: Object.keys(players), starters: ["a", "c", "d", "k"], settings: { wins: 2, losses: 1 } }]
      : leagueId && path.endsWith("/users") ? [{ user_id: "u", metadata: { team_name: "My Team" } }]
      : path === "/v1/players/nfl" ? players : null;
    return route.fulfill({ status: body ? 200 : 404, contentType: "application/json", body: JSON.stringify(body) });
  });
}

for (const width of [1440, 390]) {
  test(`Global JKB comparison supports four named players at ${width}px`, async ({ page }) => {
    await page.clock.install({ time: new Date("2026-09-24T16:00:00Z") });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${BASE_URL}/fantasy-football/start-sit`);
    await page.getByRole("button", { name: "Compare Players" }).click();
    for (const name of ["Joe Burrow", "Justin Jefferson", "Zay Flowers", "Omarion Hampton"]) {
      await page.getByRole("searchbox", { name: "Find a player" }).fill(name);
      await page.getByRole("option", { name: new RegExp(name) }).click();
    }
    await expect(page.getByRole("row", { name: /JKB projected points/ }).locator("td")).toHaveText(["20.3", "16.0", "10.9", "16.8"]);
    await expect(page.getByRole("row", { name: /JKB positional rank/ }).locator("td")).toHaveText(["#7", "#7", "#36", "#15"]);
    await expect(page.getByRole("row", { name: /EPA advantage/ }).locator("td")).toHaveText(["-2.0", "0.0", "13.0", "-5.0"]);
    await expect(page.getByRole("row", { name: /Success advantage/ }).locator("td")).toHaveText(["1.0", "1.0", "5.0", "-4.0"]);
    await page.getByRole("button", { name: /Player \+ Opponent Last 10 · Joe Burrow/ }).click();
    await expect(page.getByText("Loading Last 10 history…")).toBeHidden();
    await page.getByRole("button", { name: "Remove Zay Flowers" }).click();
    await page.getByRole("searchbox", { name: "Find a player" }).fill("Dalton Schultz");
    await page.getByRole("option", { name: /Dalton Schultz/ }).click();
    await expect(page.getByRole("row", { name: /JKB projected points/ }).locator("td")).toHaveText(["20.3", "16.0", "16.8", "6.4"]);
    await expect(page.getByRole("row", { name: /EPA advantage/ }).locator("td")).toHaveText(["-2.0", "0.0", "-5.0", "12.0"]);
    await expect(page.getByRole("row", { name: /Success advantage/ }).locator("td")).toHaveText(["1.0", "1.0", "-4.0", "3.0"]);
    await page.getByRole("button", { name: /Player \+ Opponent Last 10 · Dalton Schultz/ }).click();
    await expect(page.getByText("Loading Last 10 history…")).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test(`Compare Players works without Sleeper at ${width}px`, async ({ page }, testInfo) => {
    await page.clock.install({ time: new Date("2026-09-24T16:00:00Z") });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${BASE_URL}/fantasy-football/start-sit`);
    await expect(page.getByRole("heading", { level: 1, name: "Start/Sit" })).toBeVisible();
    await page.getByRole("button", { name: "Compare Players" }).click();
    await expect(page.getByText(/Search the full JKB weekly fantasy pool/)).toBeVisible();
    await page.getByRole("searchbox", { name: "Find a player" }).fill("Josh Allen");
    await page.getByRole("option", { name: /Josh Allen/ }).click();
    await page.getByRole("searchbox", { name: "Find a player" }).fill("Lamar Jackson");
    await page.getByRole("option", { name: /Lamar Jackson/ }).click();
    await expect(page.getByText(/JKB lean: Josh Allen/)).toBeVisible();
    await expect(page.getByRole("rowheader", { name: "EPA advantage" })).toBeVisible();
    await page.getByRole("button", { name: /Player \+ Opponent Last 10 · Josh Allen/ }).click();
    if (width === 390) {
      await expect(page.getByRole("button", { name: "Last 10", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Opponent Last 10", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Last 10", exact: true }).click();
      await expect(page.getByText("Loading Last 10 history…")).toBeHidden();
      await page.getByRole("button", { name: "Opponent Last 10", exact: true }).click();
      await expect(page.getByRole("heading", { name: /Defense — Last 10 vs QB/i })).toBeVisible();
    } else {
      await expect(page.getByRole("heading", { name: "Player Last 10" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Opponent Last 10" })).toBeVisible();
      await expect(page.getByText("Loading Last 10 history…")).toBeHidden();
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`start-sit-compare-${width}.png`), fullPage: true });
  });

  test(`Start/Sit leagues, roster totals and research at ${width}px`, async ({ page }, testInfo) => {
    await page.clock.install({ time: new Date("2026-09-24T16:00:00Z") });
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("jkb:sleeper-username:v1", "sample"));
    await mockSleeper(page);
    await page.goto(`${BASE_URL}/fantasy-football/start-sit`);
    await expect(page.getByText("Connected to Sleeper · @sample")).toBeVisible();
    await expect(page.getByRole("tab", { name: /Work League 24/ })).toBeAttached();
    await expect(page.getByRole("heading", { name: "Current Starting Roster" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Optimal Starting Roster" })).toBeVisible();
    await expect(page.getByText(/Total Projected Points:/)).toHaveCount(2);
    await expect(page.getByText(/1 roster players have no JKB projection/)).toBeVisible();
    const layout = await page.locator("[data-league-tiles]").evaluate((element) => ({ height: element.clientHeight, scrollHeight: element.scrollHeight, scrollWidth: element.scrollWidth, width: element.clientWidth }));
    if (width === 1440) { expect(layout.height).toBeLessThanOrEqual(192); expect(layout.scrollHeight).toBeGreaterThan(layout.height); expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width); }
    const matrix = page.locator("[data-start-sit-matrix-scroll]");
    const allenRow = matrix.getByRole("row").filter({ hasText: "Josh Allen" });
    await expect(allenRow.locator("td").nth(10)).not.toHaveText("N/A");
    await expect(allenRow.locator("td").nth(11)).not.toHaveText("N/A");
    await matrix.getByRole("button", { name: "Details for Josh Allen" }).click();
    if (width === 390) {
      await expect(page.getByRole("button", { name: "Last 10", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Last 10", exact: true }).click();
      await expect(page.getByText("Loading Last 10 history…")).toBeHidden();
      await page.getByRole("button", { name: "Opponent Last 10", exact: true }).click();
      await expect(page.getByRole("heading", { name: /Defense — Last 10 vs QB/i })).toBeVisible();
    } else {
      await expect(page.getByRole("heading", { name: "Player Last 10" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Opponent Last 10" })).toBeVisible();
      await expect(page.getByText("Loading Last 10 history…")).toBeHidden();
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`start-sit-teams-${width}.png`), fullPage: true });
    await page.getByRole("tab", { name: "RB", exact: true }).click();
    await expect(matrix.getByRole("row").filter({ hasText: "Jahmyr Gibbs" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}


