import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

async function expectNoPageOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectLightCellGrid(table: import("@playwright/test").Locator) {
  const grid = await table.evaluate((element) => {
    const header = element.querySelector("th");
    const cell = element.querySelector("tbody td");
    if (!header || !cell) return null;
    const headerStyle = getComputedStyle(header);
    const cellStyle = getComputedStyle(cell);
    return {
      background: getComputedStyle(element).backgroundColor,
      headerBottom: headerStyle.borderBottomWidth,
      headerRight: headerStyle.borderRightWidth,
      cellBottom: cellStyle.borderBottomWidth,
      cellRight: cellStyle.borderRightWidth,
    };
  });

  expect(grid).not.toBeNull();
  expect(grid?.headerBottom).toBe("1px");
  expect(grid?.headerRight).toBe("1px");
  expect(grid?.cellBottom).toBe("1px");
  expect(grid?.cellRight).toBe("1px");
}

async function expectMobileInitialAlignment(board: import("@playwright/test").Locator) {
  const geometry = await board.evaluate((element) => {
    const headers = element.querySelectorAll<HTMLElement>("[data-mobile-weekly-header]");
    const header = headers[0];
    const firstRow = element.querySelector<HTMLElement>("[data-mobile-weekly-row]");
    const rowGrid = firstRow?.querySelector<HTMLElement>("button");
    const scroll = element.querySelector<HTMLElement>("[data-mobile-table-scroll]");
    if (!header || !firstRow || !rowGrid || !scroll) return null;
    const headerRect = header.getBoundingClientRect();
    const rowRect = rowGrid.getBoundingClientRect();
    const headerCells = [...header.children].map((cell) => cell.getBoundingClientRect());
    const rowCells = [...rowGrid.children].map((cell) => cell.getBoundingClientRect());
    return {
      headerCount: headers.length,
      headerPrecedesRow: Boolean(header.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING),
      headerPosition: getComputedStyle(header).position,
      headerBottom: headerRect.bottom,
      rowTop: rowRect.top,
      headerTemplate: getComputedStyle(header).gridTemplateColumns,
      rowTemplate: getComputedStyle(rowGrid).gridTemplateColumns,
      headerWidths: headerCells.map((cell) => Math.round(cell.width)),
      rowWidths: rowCells.map((cell) => Math.round(cell.width)),
      scrollLeft: scroll.scrollLeft,
      scrolls: scroll.scrollWidth > scroll.clientWidth,
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry?.headerCount).toBe(1);
  expect(geometry?.headerPrecedesRow).toBe(true);
  expect(geometry?.headerPosition).toBe("static");
  expect(Math.abs((geometry?.headerBottom ?? 0) - (geometry?.rowTop ?? 0))).toBeLessThanOrEqual(1);
  expect(geometry?.headerTemplate).toBe(geometry?.rowTemplate);
  expect(geometry?.headerWidths).toEqual(geometry?.rowWidths);
  expect(geometry?.scrollLeft).toBe(0);
  expect(geometry?.scrolls).toBe(true);
}

test("Weekly rankings desktop uses the light fantasy grid without changing rank order", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/fantasy-football/weekly-rankings`);

  await expect(page.getByRole("heading", { name: "Weekly Fantasy Rankings" })).toBeVisible();
  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  await expect(table.locator('[data-team-logo="BUF"]').first()).toBeVisible();
  await expectLightCellGrid(table);

  const ranks = await table.locator("tbody > tr").evaluateAll((rows) =>
    rows.map((row) => Number(row.querySelector("td")?.textContent)).filter(Number.isFinite),
  );
  expect(ranks).toEqual(ranks.map((_, index) => index + 1));

  const firstPlayer = table.getByRole("button", { name: /^Show details for / }).first();
  await firstPlayer.click();
  await expect(table.getByText("Scoring environment", { exact: true })).toBeVisible();
  await expect(table.getByText("Projection FPA adjustment", { exact: true })).toBeVisible();
  await expect(table.getByText("Matchup details", { exact: true })).toBeVisible();
  for (const [category, accent] of [["trenches", "cyan"], ["epa", "violet"], ["success", "indigo"]] as const) {
    const card = table.locator(`[data-matchup-category='${category}']`);
    await expect(card).toHaveClass(new RegExp(accent));
    await expect(card.locator("[data-matchup-detail-value]")).toHaveCount(4);
  }
  await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
  await expectNoPageOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("fantasy-weekly-desktop.png"), fullPage: true });
});

test("Weekly rankings mobile uses one scrollable row with frozen identity columns and contained overflow", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/fantasy-football/weekly-rankings`);

  const board = page.getByRole("region", { name: "QB weekly fantasy research board" });
  await expect(board).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(board.locator('[data-team-logo="BUF"]').first()).toBeVisible();
  await expect(board.locator("[data-mobile-weekly-header]")).toContainText("PROJ");
  await expect(board.locator("[data-mobile-weekly-header]")).toContainText("SZN");
  const scrollArea = board.locator("[data-mobile-table-scroll]");
  const firstRow = board.locator("[data-mobile-weekly-row]").first();
  const firstProjection = firstRow.locator("[data-projected-fantasy-points]");
  await expect(firstProjection).toHaveText(/^\d+\.\d$/);
  await expectMobileInitialAlignment(board);
  await expect(board.locator("[data-player-team-abbreviation]")).toHaveCount(0);
  const projectionTuples = async () => board.locator("[data-mobile-weekly-row]").evaluateAll((rows) => rows.map((row) => [
    row.getAttribute("data-player-id"),
    row.querySelector("[data-mobile-sticky='rank']")?.textContent,
    row.querySelector("[data-projected-fantasy-points]")?.getAttribute("data-projected-fantasy-points"),
  ]));
  const tuplesBefore = await projectionTuples();
  const frozenBefore = await firstRow.evaluate((row) => {
    const scroll = row.closest("[data-mobile-table-scroll]")!;
    return ["rank", "logo", "last-name"].map((key) => {
      const rect = row.querySelector(`[data-mobile-sticky='${key}']`)!.getBoundingClientRect();
      return rect.left - scroll.getBoundingClientRect().left;
    });
  });
  await scrollArea.evaluate((element) => { element.scrollLeft = 240; });
  await expect.poll(() => scrollArea.evaluate((element) => element.scrollLeft)).toBeGreaterThan(150);
  const frozenAfter = await firstRow.evaluate((row) => {
    const scroll = row.closest("[data-mobile-table-scroll]")!;
    return ["rank", "logo", "last-name"].map((key) => {
      const rect = row.querySelector(`[data-mobile-sticky='${key}']`)!.getBoundingClientRect();
      return rect.left - scroll.getBoundingClientRect().left;
    });
  });
  expect(frozenAfter).toEqual(frozenBefore);
  expect(frozenAfter.map(Math.round)).toEqual([0, 30, 58]);
  expect(await firstRow.evaluate((row) => getComputedStyle(row).borderBottomWidth)).toBe("2px");

  const mahomesRow = board.getByRole("button", { name: "Show details for Patrick Mahomes II" });
  await expect(mahomesRow.locator("[data-player-name]")).toHaveText("Mahomes");
  await mahomesRow.click();
  const expandedContainer = board.locator("[data-mobile-expanded-container]");
  await expect(expandedContainer).toBeVisible();
  const expandedGeometry = await expandedContainer.evaluate((element) => {
    const scroll = element.closest<HTMLElement>("[data-mobile-table-scroll]")!;
    const elementRect = element.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    return {
      leftGap: Math.abs(elementRect.left - scrollRect.left),
      widthGap: Math.abs(elementRect.width - scroll.clientWidth),
    };
  });
  expect(expandedGeometry.leftGap).toBeLessThanOrEqual(1);
  expect(expandedGeometry.widthGap).toBeLessThanOrEqual(2);
  await expect(board.getByText("Final projected pts", { exact: true })).toBeVisible();
  await expect(board.getByRole("heading", { name: "Matchup details" })).toBeVisible();
  await expect(board.locator("[data-evidence-card]").first()).toBeVisible();
  await expect(board.locator("[data-matchup-category='trenches']")).toBeVisible();
  await expect(board.locator("[data-matchup-detail-value='team-rank']").first()).toHaveAttribute("data-quality-tone");
  await expect(board.locator("[data-matchup-detail-value='opponent-rank']").first()).toHaveAttribute("data-quality-tone");
  await expect(board.locator("[data-matchup-detail-value='rank-difference']").first()).toHaveAttribute("data-quality-tone");
  await expect(board.locator("[data-matchup-detail-value='edge-rank']").first()).toHaveAttribute("data-quality-tone");
  expect(await projectionTuples()).toEqual(tuplesBefore);
  await expectNoPageOverflow(page);
  await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("fantasy-weekly-mobile.png"), fullPage: true });

  for (const width of [390, 375, 360]) {
    for (const position of ["QB", "WR"] as const) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${baseUrl}/fantasy-football/weekly-rankings`);
      if (position === "WR") await page.getByRole("button", { name: "WR", exact: true }).click();
      const compactBoard = page.getByRole("region", { name: `${position} weekly fantasy research board` });
      await expect(compactBoard.locator("[data-mobile-weekly-row]").first()).toBeVisible();
      await expectMobileInitialAlignment(compactBoard);
      await expectNoPageOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`fantasy-weekly-${position.toLowerCase()}-${width}.png`), fullPage: true });
    }
  }
});

test("Weekly matchup details separate category accents from favorable and unfavorable quality tones", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/fantasy-football/weekly-rankings`);
  const board = page.getByRole("region", { name: "QB weekly fantasy research board" });
  const trenchCells = board.locator("tbody tr[data-player-id] > td:nth-child(10)");
  await expect(trenchCells.first()).toBeVisible();
  const edgeRanks = await trenchCells.evaluateAll((cells) => cells.map((cell) => Number(cell.getAttribute("data-display-rank"))).filter(Number.isFinite));
  const bestEdgeRank = Math.min(...edgeRanks);
  const worstEdgeRank = Math.max(...edgeRanks);
  expect(bestEdgeRank).toBe(1);
  expect(worstEdgeRank).toBeGreaterThanOrEqual(28);
  const favorableCell = board.locator(`tbody tr[data-player-id] > td:nth-child(10)[data-display-rank='${bestEdgeRank}']`).first();
  const unfavorableCell = board.locator(`tbody tr[data-player-id] > td:nth-child(10)[data-display-rank='${worstEdgeRank}']`).first();
  const favorableRow = favorableCell.locator("..");
  const unfavorableRow = unfavorableCell.locator("..");
  await expect(favorableRow).toBeVisible();
  await expect(unfavorableRow).toBeVisible();

  const favorableDifferenceTone = await favorableCell.getAttribute("data-heat-tone");
  expect(["gold", "dark-green", "green", "light-green"]).toContain(favorableDifferenceTone);
  await favorableRow.getByRole("button", { name: /^Show details for / }).click();
  const favorableDetail = board.locator("[data-weekly-expanded-detail]");
  await expect(favorableDetail.locator("[data-matchup-category='trenches'] [data-matchup-detail-value='rank-difference']")).toHaveAttribute("data-quality-tone", favorableDifferenceTone!);
  await expect(favorableDetail.locator("[data-matchup-category='trenches'] [data-matchup-detail-value='edge-rank']")).toHaveAttribute("data-quality-tone", "gold");
  await favorableDetail.screenshot({ path: testInfo.outputPath("fantasy-weekly-matchup-favorable.png") });
  await favorableRow.getByRole("button", { name: /^Hide details for / }).click();

  const unfavorableDifferenceTone = await unfavorableCell.getAttribute("data-heat-tone");
  expect(["light-red", "red", "strong-red"]).toContain(unfavorableDifferenceTone);
  await unfavorableRow.getByRole("button", { name: /^Show details for / }).click();
  const unfavorableDetail = board.locator("[data-weekly-expanded-detail]");
  await expect(unfavorableDetail.locator("[data-matchup-category='trenches'] [data-matchup-detail-value='rank-difference']")).toHaveAttribute("data-quality-tone", unfavorableDifferenceTone!);
  await expect(unfavorableDetail.locator("[data-matchup-category='trenches'] [data-matchup-detail-value='edge-rank']")).toHaveAttribute("data-quality-tone", "strong-red");
  await unfavorableDetail.screenshot({ path: testInfo.outputPath("fantasy-weekly-matchup-unfavorable.png") });
});

test("ROS desktop and mobile use the same light bordered table language", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/fantasy-football?view=ros`);

  await expect(page.getByRole("heading", { name: "2026 Rest-of-Season Rankings" })).toBeVisible();
  const overall = page.getByRole("region", { name: "Overall fantasy rankings" }).getByRole("table");
  await expect(overall.locator("[data-team-logo]").first()).toBeVisible();
  await expectLightCellGrid(overall);
  const glossaryTrigger = page.getByRole("button", { name: "Stats & Rankings Key" });
  await expect(glossaryTrigger).toHaveAttribute("aria-expanded", "false");
  await glossaryTrigger.click();
  await expect(page.getByText(/WR2 means 2nd among wide receivers.*RB4 means 4th among running backs/i)).toBeVisible();
  await expect(page.getByText(/no prior-season games are added/i)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("fantasy-ros-desktop-glossary.png"), fullPage: true });
  await glossaryTrigger.click();

  for (const [playerName, sample] of [["Jahmyr Gibbs", "8 games"], ["Garrett Wilson", "7 games"], ["Jaydon Blue", "5 games"]] as const) {
    const playerRow = overall.locator("tbody > tr").filter({ hasText: playerName }).first();
    await playerRow.getByRole("button", { name: `Show details for ${playerName}` }).click();
    await expect(playerRow.locator("xpath=following-sibling::tr[1]")).toContainText(`L8 sample: ${sample}`);
    await playerRow.getByRole("button", { name: `Hide details for ${playerName}` }).click();
  }
  const brooksRow = overall.locator("tbody > tr").filter({ hasText: "Jonathon Brooks" }).first();
  await expect(brooksRow.locator("td").nth(10)).toHaveText("N/A");
  await page.getByRole("region", { name: "Overall fantasy rankings" }).evaluate((element) => {
    element.scrollTop = 0;
    element.scrollLeft = 0;
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectNoPageOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("fantasy-ros-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const mobileOverall = page.getByRole("region", { name: "Overall fantasy rankings" });
  await expect(mobileOverall.getByRole("columnheader", { name: "L8 Pts Rk" })).toBeVisible();
  await expect(mobileOverall.getByRole("columnheader", { name: "ADP" })).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("fantasy-ros-mobile-overall.png"), fullPage: true });
  await page.getByRole("button", { name: "Stats & Rankings Key" }).click();
  await expect(page.getByText(/QB#, RB#, WR# and TE# are position-relative ranks/i)).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("fantasy-ros-mobile-glossary.png"), fullPage: true });
  await page.getByRole("button", { name: "Stats & Rankings Key" }).click();
  await page.getByRole("button", { name: "QB 31" }).click();
  const compact = page.getByRole("table");
  await expect(compact.locator('[data-team-logo="BUF"]').first()).toBeVisible();
  await expect(compact.getByRole("columnheader", { name: "PAR/G" })).toBeVisible();
  await expectLightCellGrid(compact);
  await expectNoPageOverflow(page);
  await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("fantasy-ros-mobile.png"), fullPage: true });
});
