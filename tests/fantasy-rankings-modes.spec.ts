import { expect, test } from "../playwright-fixture";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

test("Fantasy defaults to the mobile weekly research board without overflow or a metric selector", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/fantasy-football`);

  await expect(page.getByRole("heading", { level: 1, name: "Weekly Fantasy Rankings" })).toBeVisible();
  await expect(page.getByRole("region", { name: "QB weekly fantasy research board" })).toBeVisible();
  await expect(page.getByText("Season PPG", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Trenches", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Weekly Rankings" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Rest of Season" })).toHaveAttribute("href", "/fantasy-football?view=ros");
  await expect(page.getByRole("button", { name: "How JKB Projections Work" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.screenshot({ path: testInfo.outputPath("weekly-mobile.png"), fullPage: true });
});

test("rest-of-season Legacy mobile is compact and retains expanded detail", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/fantasy-football?view=ros`);

  await expect(page.getByRole("heading", { level: 1, name: "2026 Rest-of-Season Rankings" })).toBeVisible();
  await page.getByRole("button", { name: "RB 85" }).click();
  await page.getByRole("button", { name: "Legacy board" }).click();
  await expect(page.getByRole("columnheader", { name: "Proj" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "AVG" })).toBeVisible();
  await page.getByRole("button", { name: "Show details for Jahmyr Gibbs" }).click();
  await expect(page.getByText("Touches Rk", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.screenshot({ path: testInfo.outputPath("ros-legacy-mobile.png"), fullPage: true });
});

test("desktop weekly rankings and NFL command center consume the synchronized artifact", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${BASE_URL}/fantasy-football/weekly-rankings?week=1`);
  await expect(page.getByRole("heading", { level: 1, name: "Weekly Fantasy Rankings" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  for (const header of ["RK", "OPPONENT", "PLAYER", "PROJ. PTS", "SEASON PPG", "L5 PPG", "MATCHUP GRADE", "OPP FPA SEASON", "OPP FPA L5", "TRENCHES", "EPA ADV.", "SUCCESS ADV."]) {
    await expect(page.getByRole("columnheader", { name: header })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Rest of Season" })).toHaveAttribute("href", "/fantasy-football?view=ros");
  await page.screenshot({ path: testInfo.outputPath("weekly-desktop.png"), fullPage: true });

  await page.goto(`${BASE_URL}/nfl?week=1`);
  await expect(page.getByRole("heading", { name: "Top Fantasy Picks — Week 1" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View full rankings" })).toHaveAttribute("href", "/fantasy-football/weekly-rankings?week=1");
  await page.screenshot({ path: testInfo.outputPath("nfl-command-center-desktop.png"), fullPage: true });
});

test("weekly research boards hold their position semantics across desktop and mobile", async ({ page }, testInfo) => {
  const positions = [
    { position: "QB", evidence: [] },
    { position: "RB", evidence: ["TOUCHES", "YPC", "REC TARGETS"] },
    { position: "WR", evidence: ["TARGET %", "AIR YARDS", "TARGETS/G"] },
    { position: "TE", evidence: ["TARGET %", "AIR YARDS", "TARGETS/G"] },
  ] as const;

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${BASE_URL}/fantasy-football/weekly-rankings?week=1`);
  await expect(page.getByRole("button", { name: "Stat View" })).toHaveAttribute("aria-pressed", "true");

  for (const { position, evidence } of positions) {
    await page.getByRole("button", { name: position, exact: true }).click();
    const board = page.getByRole("region", { name: `${position} weekly fantasy research board` });
    await expect(board).toHaveAttribute("data-display-mode", "stat");
    await expect(page.getByRole("table")).toBeVisible();
    for (const header of evidence) await expect(page.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
    await expect(page.getByText("RZ TOUCHES RK", { exact: true })).toHaveCount(0);
    await expect(page.locator("[data-player-name]").first()).toBeVisible();
    await expect(board.locator("tbody tr[data-player-id]").first().locator("td").nth(1).locator("[data-opponent-logo]")).toBeVisible();
    await expect.poll(() => page.locator("[data-player-name]").first().evaluate((name) => {
      const style = getComputedStyle(name);
      return style.textOverflow !== "ellipsis" && name.scrollHeight <= name.clientHeight;
    })).toBe(true);
    await expect(board.locator('[data-heat-tone="gold"]').first()).toBeVisible();
    await expect(board.locator('[data-heat-tone="strong-red"]').first()).toBeVisible();

    const tuplesBefore = await board.locator("tr[data-player-id]").evaluateAll((rows) => rows.map((row) => [
      row.getAttribute("data-player-id"),
      row.querySelector("[data-projected-fantasy-points]")?.getAttribute("data-projected-fantasy-points"),
    ]));
    if (position === "QB" || position === "RB") await page.screenshot({ path: testInfo.outputPath(`weekly-${position.toLowerCase()}-desktop-stat.png`) });

    await page.getByRole("button", { name: "Rank View" }).click();
    await expect(board).toHaveAttribute("data-display-mode", "rank");
    await expect(board.locator("tbody tr[data-player-id]").first().locator("td").nth(3)).toHaveText(/^#\d+$/);
    await expect(board.locator("tbody tr[data-player-id]").first().locator("td").nth(3)).toHaveAttribute("data-heat-tone", "gold");
    const tuplesAfter = await board.locator("tr[data-player-id]").evaluateAll((rows) => rows.map((row) => [
      row.getAttribute("data-player-id"),
      row.querySelector("[data-projected-fantasy-points]")?.getAttribute("data-projected-fantasy-points"),
    ]));
    expect(tuplesAfter).toEqual(tuplesBefore);
    if (position === "QB" || position === "RB") await page.screenshot({ path: testInfo.outputPath(`weekly-${position.toLowerCase()}-desktop-rank.png`) });

    await page.getByRole("button", { name: "Stat View" }).click();
    await page.getByRole("button", { name: /Show details for/ }).first().click();
    await expect(page.getByText("Underlying matchup components", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Samples / evidence" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Projection context summary" })).toBeVisible();
    await expect(page.getByText("Rank difference", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Weekly matchup edge rank", { exact: true }).first()).toBeVisible();
    if (position === "QB" || position === "RB") await page.screenshot({ path: testInfo.outputPath(`weekly-${position.toLowerCase()}-desktop-expanded.png`) });
  }

  const stickyHeader = page.locator("[data-weekly-desktop-sticky-header]");
  await page.locator("tr[data-player-id]").nth(30).scrollIntoViewIfNeeded();
  await expect(stickyHeader).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const nav = document.querySelector("header.sticky");
    const cell = document.querySelector("[data-weekly-desktop-sticky-header] th");
    if (!nav || !cell) return false;
    const navBottom = nav.getBoundingClientRect().bottom;
    const cellTop = cell.getBoundingClientRect().top;
    return cellTop >= navBottom - 1 && cellTop <= navBottom + 2 && getComputedStyle(cell).position === "sticky";
  })).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/fantasy-football/weekly-rankings?week=1`);

  for (const { position } of positions) {
    await page.getByRole("button", { name: position, exact: true }).click();
    const board = page.getByRole("region", { name: `${position} weekly fantasy research board` });
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(board.locator("[data-weekly-mobile-layout]")).toBeVisible();
    await expect(board.locator("[data-weekly-desktop-sticky-header]")).toHaveCount(0);
    await expect(page.getByText("Season PPG", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("FPA Season", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Success Adv", { exact: true }).first()).toBeVisible();
    await expect(board.locator("[data-mobile-weekly-card]").first().locator("[data-opponent-logo]")).toBeVisible();
    await expect(page.getByText("RZ Touches", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Matchup advantages").getByText(/^[+-]\d+$/).first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (position === "QB" || position === "RB") await page.screenshot({ path: testInfo.outputPath(`weekly-${position.toLowerCase()}-mobile-stat.png`) });

    await page.getByRole("button", { name: "Rank View" }).click();
    await expect(board).toHaveAttribute("data-display-mode", "rank");
    await expect(board.locator("[data-mobile-weekly-card]").first().locator('[data-display-rank="1"]').first().locator(":scope > div").nth(1)).toHaveText("#1");
    await expect(board.getByLabel("Matchup advantages").getByText(/^#\d+$/).first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (position === "QB" || position === "RB") await page.screenshot({ path: testInfo.outputPath(`weekly-${position.toLowerCase()}-mobile-rank.png`) });
    await page.getByRole("button", { name: "Stat View" }).click();
    if (position === "QB" || position === "RB") {
      await board.getByRole("button", { name: /Show details for/ }).first().click();
      const detail = board.locator("[data-weekly-expanded-detail]");
      await expect(detail).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await detail.evaluate((element) => element.scrollIntoView({ block: "start" }));
      await page.screenshot({ path: testInfo.outputPath(`weekly-${position.toLowerCase()}-mobile-expanded.png`) });
    }
  }
});

test("missing weekly artifact is explicit and never substitutes another week", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/fantasy-football/weekly-rankings?week=2`);
  await expect(page.getByRole("heading", { name: "Week 2 rankings are not available yet" })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("weekly-missing-mobile.png"), fullPage: true });
});

test("NFL command center remains usable at mobile width", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/nfl?week=1`);
  await expect(page.getByRole("heading", { name: "Top Fantasy Picks — Week 1" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Select NFL week" })).toHaveValue("1");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("nfl-command-center-mobile.png"), fullPage: true });
});
