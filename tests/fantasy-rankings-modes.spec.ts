import { expect, test } from "../playwright-fixture";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

test("Fantasy defaults to the mobile Rank View board without overflow or a metric selector", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/fantasy-football`);

  await expect(page.getByRole("heading", { level: 1, name: "Weekly Fantasy Rankings" })).toBeVisible();
  await expect(page.getByRole("region", { name: "QB weekly fantasy research board" })).toBeVisible();
  await expect(page.locator("[data-mobile-weekly-header]")).toContainText("SZN");
  const glossary = page.getByRole("region", { name: "Weekly Rankings stat glossary" });
  const glossaryToggle = glossary.getByRole("button", { name: "What do these stats mean?" });
  await expect(glossaryToggle).toHaveAttribute("aria-expanded", "false");
  await expect(glossary.getByText("Projected Points", { exact: true })).toBeHidden();
  await glossaryToggle.click();
  await expect(glossaryToggle).toHaveAttribute("aria-expanded", "true");
  for (const definition of ["Rank", "Projected Points", "Season PPG", "EPA Advantage", "Touches", "Target Share", "Targets/Game"]) {
    await expect(glossary.getByText(definition, { exact: true })).toBeVisible();
  }
  await expect(glossary.getByText(/#1 is best or most favorable/)).toBeVisible();
  await expect(glossary.getByText(/Gold = elite · Green = favorable · Neutral = middle · Red = unfavorable/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await glossaryToggle.click();
  await expect(glossaryToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Rank View" })).toHaveAttribute("aria-pressed", "true");
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
  const glossaryToggle = page.getByRole("button", { name: "What do these stats mean?" });
  await expect(glossaryToggle).toHaveAttribute("aria-expanded", "false");
  await glossaryToggle.click();
  await expect(page.getByText("WR / TE", { exact: true })).toBeVisible();
  await expect(page.getByText(/Weighted matchup score combining opponent fantasy points allowed/)).toBeVisible();
  await expect(page.getByText(/Great 85–100 · Good 70–84\.99/)).toBeVisible();
  await glossaryToggle.click();
  await expect(page.getByRole("table")).toBeVisible();
  for (const header of ["RK", "PLAYER", "OPP", "PROJ. PTS", "SEASON PPG", "L5 TREND", "MATCHUP", "OPP ALLOWED SZN", "OPP ALLOWED L5"]) {
    await expect(page.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
  }
  for (const header of ["TRENCHES", "EPA ADV.", "SUCCESS ADV."]) await expect(page.getByRole("columnheader", { name: header })).toBeVisible();
  await expect(page.getByRole("link", { name: "Rest of Season" })).toHaveAttribute("href", "/fantasy-football?view=ros");
  await page.screenshot({ path: testInfo.outputPath("weekly-desktop.png"), fullPage: true });

  await page.goto(`${BASE_URL}/nfl?week=1`);
  await expect(page.getByRole("heading", { name: "Top Fantasy Picks — Week 1" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View full rankings" })).toHaveAttribute("href", "/fantasy-football/weekly-rankings?week=1");
  await page.screenshot({ path: testInfo.outputPath("nfl-command-center-desktop.png"), fullPage: true });
});

test("weekly research boards hold their position semantics across desktop and mobile", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const positions = [
    { position: "QB", evidence: [], edges: ["TRENCHES", "EPA ADV.", "SUCCESS ADV."], mobile: ["TR", "EPA", "SR"] },
    { position: "RB", evidence: ["TOUCHES RK", "YPC RK", "REC TARGETS RK"], edges: ["TRENCHES"], mobile: ["TR", "TCH", "YPC", "TGT"] },
    { position: "WR", evidence: ["TARGET % RK", "AIR YARDS RK", "TARGETS/G RK"], edges: ["TRENCHES"], mobile: ["TR", "T%", "AY", "T/G"] },
    { position: "TE", evidence: ["TARGET % RK", "AIR YARDS RK", "TARGETS/G RK"], edges: ["TRENCHES"], mobile: ["TR", "T%", "AY", "T/G"] },
  ] as const;

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${BASE_URL}/fantasy-football/weekly-rankings?week=1`);
  await expect(page.getByRole("button", { name: "Rank View" })).toHaveAttribute("aria-pressed", "true");

  for (const { position, evidence, edges } of positions) {
    await page.getByRole("button", { name: position, exact: true }).click();
    const board = page.getByRole("region", { name: `${position} weekly fantasy research board` });
    await expect(board).toHaveAttribute("data-display-mode", "rank");
    await expect(page.getByRole("table")).toBeVisible();
    for (const header of evidence) await expect(page.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
    for (const header of edges) await expect(page.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
    if (position !== "QB") {
      await expect(page.getByRole("columnheader", { name: "EPA ADV." })).toHaveCount(0);
      await expect(page.getByRole("columnheader", { name: "SUCCESS ADV." })).toHaveCount(0);
    }
    await expect(page.getByText("RZ TOUCHES RK", { exact: true })).toHaveCount(0);
    await expect(page.locator("[data-player-name]").first()).toBeVisible();
    await expect(board.locator("tbody tr[data-player-id]").first().locator("td").nth(1).locator("[data-team-logo]")).toBeVisible();
    await expect(board.locator("tbody tr[data-player-id]").first().locator("[data-player-team-abbreviation]")).toHaveCount(0);
    await expect(board.locator("tbody tr[data-player-id]").first().locator("[data-opponent-logo]")).toHaveCount(0);
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
    await expect(board.locator("tbody tr[data-player-id]").first().locator("td").nth(3)).toHaveText(/^\d+\.\d$/);
    if (position === "QB" || position === "RB") await page.screenshot({ path: testInfo.outputPath(`weekly-${position.toLowerCase()}-desktop-rank.png`) });

    await page.getByRole("button", { name: "Stat View" }).click();
    await expect(board).toHaveAttribute("data-display-mode", "stat");
    await expect(board.locator("tbody tr[data-player-id]").first().locator("td").nth(3)).toHaveText(/^\d+\.\d$/);
    await expect(board.locator("tbody tr[data-player-id]").first().locator("td").nth(3)).toHaveAttribute("data-heat-tone", "gold");
    const tuplesAfter = await board.locator("tr[data-player-id]").evaluateAll((rows) => rows.map((row) => [
      row.getAttribute("data-player-id"),
      row.querySelector("[data-projected-fantasy-points]")?.getAttribute("data-projected-fantasy-points"),
    ]));
    expect(tuplesAfter).toEqual(tuplesBefore);
    if (position === "QB" || position === "RB") await page.screenshot({ path: testInfo.outputPath(`weekly-${position.toLowerCase()}-desktop-stat.png`) });

    await expect(board.locator("[data-matchup-grade-cell]").first()).toHaveAttribute("data-matchup-score");
    await expect(board.locator("[data-matchup-grade-cell]").first()).toHaveText(/Great|Good|Neutral|Tough|Very Tough/);
    await expect(board.locator("[data-matchup-grade-cell]").first()).toHaveText(/\d+/);
    await page.getByRole("button", { name: /Show details for/ }).first().click();
    await expect(page.getByText("Matchup details", { exact: true })).toBeVisible();
    await expect(board.locator("[data-composite-matchup]")).toContainText("Composite matchup");
    await expect(board.locator("[data-composite-matchup-score]")).toHaveText(/^\d+ \/ 100$/);
    await expect(board.locator("[data-composite-component]")).toHaveCount(5);
    await expect(page.getByRole("heading", { name: "Samples / evidence" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Projection context" })).toBeVisible();
    await expect(page.getByText("Rank difference", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Weekly matchup edge rank", { exact: true }).first()).toBeVisible();
    if (position === "QB" || position === "RB") await page.screenshot({ path: testInfo.outputPath(`weekly-${position.toLowerCase()}-desktop-expanded.png`) });
    await page.getByRole("button", { name: "Rank View" }).click();
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

  for (const { position, mobile } of positions) {
    await page.getByRole("button", { name: position, exact: true }).click();
    const board = page.getByRole("region", { name: `${position} weekly fantasy research board` });
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(board.locator("[data-weekly-mobile-layout]")).toBeVisible();
    await expect(board.locator("[data-weekly-desktop-sticky-header]")).toHaveCount(0);
    const header = board.locator("[data-mobile-weekly-header]");
    for (const acronym of ["SZN", "L5", "MU", "OA", "O5", ...mobile]) await expect(header).toContainText(acronym);
    for (const label of ["Rank", "Player", "Projected Points", "Season PPG", "Last 5 Trend", "Matchup", "Opp Allowed SZN", "Opp Allowed L5", "Trenches"]) {
      await expect(header.getByRole("columnheader", { name: label, exact: true })).toBeVisible();
    }
    await expect(board.locator("[data-mobile-weekly-row]").first().locator("[data-opponent-logo]")).toHaveCount(0);
    await expect(board.locator("[data-mobile-weekly-row]").first().locator("[data-player-team-abbreviation]")).toHaveCount(0);
    await expect(board.locator("[data-mobile-weekly-row]").first().locator("[data-team-logo]")).toBeVisible();
    await expect(page.getByText("RZ Touches", { exact: true })).toHaveCount(0);
    await expect(board.locator("[data-mobile-weekly-row]").first().locator("[data-projected-fantasy-points]")).toHaveText(/^\d+\.\d$/);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (position === "QB" || position === "RB") await page.screenshot({ path: testInfo.outputPath(`weekly-${position.toLowerCase()}-mobile-rank.png`) });

    await page.getByRole("button", { name: "Stat View" }).click();
    await expect(board).toHaveAttribute("data-display-mode", "stat");
    await expect(board.locator("[data-mobile-weekly-row]").first().locator("[data-projected-fantasy-points]")).toHaveText(/^\d+\.\d$/);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (position === "QB" || position === "RB") await page.screenshot({ path: testInfo.outputPath(`weekly-${position.toLowerCase()}-mobile-stat.png`) });
    if (position === "QB" || position === "RB") {
      await board.getByRole("button", { name: /Show details for/ }).first().click();
      await expect(board.getByRole("heading", { name: /.+/ }).first()).toBeVisible();
      for (const label of ["Season PPG", "Last 5 Trend", "Opponent Allowed Season", "Opponent Allowed Last 5", "Trenches"]) {
        await expect(board.getByText(label, { exact: true }).first()).toBeVisible();
      }
      const detail = board.locator("[data-weekly-expanded-detail]");
      await expect(detail).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await board.locator("[data-mobile-expanded-summary]").evaluate((element) => element.scrollIntoView({ block: "start" }));
      await page.evaluate(() => window.scrollBy(0, -100));
      await page.screenshot({ path: testInfo.outputPath(`weekly-${position.toLowerCase()}-mobile-expanded.png`) });
    }
    await page.getByRole("button", { name: "Rank View" }).click();
  }

  for (const { width, position } of [{ width: 375, position: "RB" }, { width: 360, position: "WR" }] as const) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${BASE_URL}/fantasy-football/weekly-rankings?week=1`);
    await page.getByRole("button", { name: position, exact: true }).click();
    const board = page.getByRole("region", { name: `${position} weekly fantasy research board` });
    const scroll = board.locator("[data-mobile-table-scroll]");
    const header = board.locator("[data-mobile-weekly-header]");
    const firstRowButton = board.locator("[data-mobile-weekly-row]").first().locator("button");
    await expect(board.locator("[data-mobile-weekly-row]").nth(7)).toBeAttached();
    await expect.poll(() => Promise.all([
      header.evaluate((element) => (element as HTMLElement).style.gridTemplateColumns),
      firstRowButton.evaluate((element) => (element as HTMLElement).style.gridTemplateColumns),
    ]).then(([headerGrid, rowGrid]) => headerGrid === rowGrid)).toBe(true);
    await expect.poll(() => header.locator(":scope > *").evaluateAll((headerCells, rowSelector) => {
      const rowCells = document.querySelectorAll(`${rowSelector} > *`);
      return headerCells.length === rowCells.length && headerCells.every((cell, index) => (
        Math.abs(cell.getBoundingClientRect().width - rowCells[index].getBoundingClientRect().width) < 0.1
      ));
    }, `[data-mobile-weekly-row]:first-of-type button`)).toBe(true);
    await expect.poll(() => scroll.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await scroll.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    await expect.poll(() => scroll.evaluate((element) => element.scrollLeft > 0)).toBe(true);
    for (const stickyKey of ["rank", "logo", "last-name"]) {
      await expect(header.locator(`[data-mobile-sticky="${stickyKey}"]`)).toHaveCSS("position", "sticky");
      await expect(firstRowButton.locator(`[data-mobile-sticky="${stickyKey}"]`)).toHaveCSS("position", "sticky");
    }
    const widthGlossaryToggle = page.getByRole("button", { name: "What do these stats mean?" });
    await widthGlossaryToggle.click();
    await expect(widthGlossaryToggle).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`weekly-${position.toLowerCase()}-mobile-${width}.png`) });
  }
});

test("desktop Weekly headers sort without changing authority or heat colors", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${BASE_URL}/fantasy-football/weekly-rankings?week=1`);
  const board = page.getByRole("region", { name: "QB weekly fantasy research board" });
  const dataRows = board.locator("tbody tr[data-player-id]");
  const headerCells = board.getByRole("columnheader");
  await expect(headerCells).toHaveCount(12);
  await expect(headerCells.locator("button")).toHaveCount(12);

  const authorityBefore = await dataRows.evaluateAll((rows) => rows.map((row) => ({
    id: row.getAttribute("data-player-id"),
    rank: row.querySelector("td")?.textContent,
    projection: row.querySelector("[data-projected-fantasy-points]")?.getAttribute("data-projected-fantasy-points"),
    seasonTone: row.querySelectorAll("td")[4]?.getAttribute("data-heat-tone"),
  })));

  await board.getByRole("button", { name: "PLAYER" }).click();
  await expect(board.getByRole("columnheader", { name: "PLAYER" })).toHaveAttribute("aria-sort", "ascending");
  const ascendingPlayers = await dataRows.locator("[data-player-name]").allTextContents();
  expect(ascendingPlayers).toEqual([...ascendingPlayers].sort((left, right) => left.localeCompare(right)));
  await board.getByRole("button", { name: "PLAYER" }).click();
  await expect(board.getByRole("columnheader", { name: "PLAYER" })).toHaveAttribute("aria-sort", "descending");
  expect(await dataRows.locator("[data-player-name]").allTextContents()).toEqual([...ascendingPlayers].reverse());

  await board.getByRole("button", { name: "PROJ. PTS" }).click();
  const projectionsDescending = await dataRows.locator("[data-projected-fantasy-points]").evaluateAll((cells) => cells.map((cell) => Number(cell.getAttribute("data-projected-fantasy-points"))));
  expect(projectionsDescending).toEqual([...projectionsDescending].sort((left, right) => right - left));
  await board.getByRole("button", { name: "PROJ. PTS" }).click();
  const projectionsAscending = await dataRows.locator("[data-projected-fantasy-points]").evaluateAll((cells) => cells.map((cell) => Number(cell.getAttribute("data-projected-fantasy-points"))));
  expect(projectionsAscending).toEqual([...projectionsAscending].sort((left, right) => left - right));

  const authorityAfter = await dataRows.evaluateAll((rows) => rows.map((row) => ({
    id: row.getAttribute("data-player-id"),
    rank: row.querySelector("td")?.textContent,
    projection: row.querySelector("[data-projected-fantasy-points]")?.getAttribute("data-projected-fantasy-points"),
    seasonTone: row.querySelectorAll("td")[4]?.getAttribute("data-heat-tone"),
  })));
  expect(new Map(authorityAfter.map((row) => [row.id, row]))).toEqual(new Map(authorityBefore.map((row) => [row.id, row])));

  for (const header of ["TRENCHES", "EPA ADV.", "SUCCESS ADV."]) {
    await board.getByRole("button", { name: header }).click();
    await expect(board.getByRole("columnheader", { name: header })).toHaveAttribute("aria-sort", "ascending");
  }

  await page.getByRole("button", { name: "RB", exact: true }).click();
  const rbBoard = page.getByRole("region", { name: "RB weekly fantasy research board" });
  await expect(rbBoard.getByRole("columnheader", { name: "RK", exact: true })).toHaveAttribute("aria-sort", "ascending");
  await rbBoard.getByRole("button", { name: "TRENCHES" }).click();
  await expect(rbBoard.getByRole("columnheader", { name: "TRENCHES" })).toHaveAttribute("aria-sort", "ascending");
  await rbBoard.getByRole("button", { name: "TOUCHES RK" }).click();
  await expect(rbBoard.getByRole("columnheader", { name: "TOUCHES RK" })).toHaveAttribute("aria-sort", "ascending");
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
