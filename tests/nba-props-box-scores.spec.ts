import { expect, test } from "../playwright-fixture";

/**
 * NBA props board: whole-row expansion, centered columns, the Vegas Line column and the Last 10 box-score tables.
 *
 * The invented demo board (`?demo=synthetic`) exists only on the Vite dev server, so run this against `npm run dev`:
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 npx playwright test tests/nba-props-box-scores.spec.ts
 * Set NBA_SHOT_DIR to also write screenshots there. Every figure here is invented; no analytics request is made.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080";
const DEMO = `${BASE_URL}/nba/props?demo=synthetic`;
const SHOT_DIR = process.env.NBA_SHOT_DIR;
const VIEWPORTS = [
  { name: "360", width: 360, height: 780 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 900 },
  { name: "1280", width: 1280, height: 900 },
  { name: "1440", width: 1440, height: 900 },
] as const;

type Page = import("@playwright/test").Page;
const pageOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const mainRow = (page: Page, name: string) => page.locator("[data-testid='board-row']").filter({ hasText: name }).first();
const detailOf = (page: Page, name: string) => mainRow(page, name).locator("xpath=following-sibling::tr[1]");
async function shot(page: Page, name: string) {
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false });
}
async function shotOf(locator: import("@playwright/test").Locator, name: string) {
  if (SHOT_DIR) await locator.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}
const align = (locator: import("@playwright/test").Locator) => locator.evaluate((el) => getComputedStyle(el).textAlign);

test.describe("row expansion, centered columns, Vegas Line and box scores", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DEMO, { waitUntil: "networkidle" });
    test.skip((await page.getByText(/SYNTHETIC DATA/).count()) === 0, "the synthetic demo board is only served by the dev server");
    await page.evaluate(() => localStorage.clear());
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("a click anywhere on the row opens it, a second click closes it, and the chevron turns", async ({ page }) => {
    const row = mainRow(page, "Demo Guard One");
    const chevron = row.getByTestId("row-toggle").locator("svg");
    await expect(row).toHaveCSS("cursor", "pointer");
    await row.getByTestId("col-mpg").click();
    await expect(row).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("row-detail")).toBeVisible();
    await expect(chevron).toHaveClass(/rotate-90/);
    await row.getByTestId("col-jkbProjection").click();
    await expect(row).toHaveAttribute("aria-expanded", "false");
    await expect(chevron).not.toHaveClass(/rotate-90/);
    await row.getByTestId("player-name").click();
    await expect(row).toHaveAttribute("aria-expanded", "true");
    await row.getByTestId("row-toggle").click();
    await expect(row).toHaveAttribute("aria-expanded", "false");
  });

  test("Enter and Space on the focused row toggle it, with a visible focus ring", async ({ page }) => {
    const row = mainRow(page, "Demo Wing Two");
    await row.focus();
    await expect(row).toBeFocused();
    const ring = await row.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(ring).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(row).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Space");
    await expect(row).toHaveAttribute("aria-expanded", "false");
    // Tab moves on to another row: one stop per row, not the row and its chevron.
    await page.keyboard.press("Tab");
    const focused = page.locator("[data-testid='board-row']:focus");
    await expect(focused).toHaveCount(1);
    await expect(focused).not.toContainText("Demo Wing Two");
  });

  test("the minutes field, its reset button and the sort headers do not toggle the row", async ({ page }) => {
    await page.getByTestId("columns-menu-trigger").click();
    await page.getByTestId("column-toggle-userMinutes").check();
    await page.keyboard.press("Escape");
    const row = mainRow(page, "Demo Guard One");
    const input = row.getByTestId("minutes-input");
    await input.click();
    await input.fill("36");
    await page.keyboard.press("Space");
    await page.keyboard.press("Enter");
    await expect(row).toHaveAttribute("aria-expanded", "false");
    await row.getByTestId("reset-minutes").click();
    await expect(row).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: "MPG" }).click();
    await expect(page.getByTestId("row-detail")).toHaveCount(0);
  });

  test("selecting text inside the row does not toggle it", async ({ page }) => {
    const row = mainRow(page, "Demo Guard One");
    const name = await row.getByTestId("player-name").boundingBox();
    if (!name) throw new Error("no player name box");
    await page.mouse.move(name.x + 2, name.y + name.height / 2);
    await page.mouse.down();
    await page.mouse.move(name.x + name.width - 2, name.y + name.height / 2, { steps: 6 });
    await page.mouse.up();
    expect(await page.evaluate(() => window.getSelection()?.toString().length ?? 0)).toBeGreaterThan(0);
    await expect(row).toHaveAttribute("aria-expanded", "false");
  });

  test("an open row stays open through a sort, and is still the row it was", async ({ page }) => {
    await mainRow(page, "Demo Guard One").getByTestId("col-mpg").click();
    await page.getByRole("button", { name: "MPG" }).click();
    await expect(mainRow(page, "Demo Guard One")).toHaveAttribute("aria-expanded", "true");
    await expect(detailOf(page, "Demo Guard One").getByTestId("player-box-table")).toBeVisible();
  });

  test("numeric headers and values are centered, the player is left, in the computed style", async ({ page }) => {
    const row = mainRow(page, "Demo Guard One");
    expect(await align(row.getByTestId("player-cell"))).toBe("left");
    for (const id of ["mpg", "perGame", "perMinute", "last10", "oppLast10", "matchup", "line", "jkbProjection"]) {
      expect(await align(row.getByTestId(`col-${id}`)), `${id} cell`).toBe("center");
      expect(await align(page.getByTestId(`head-${id}`)), `${id} head`).toBe("center");
    }
    expect(await row.getByTestId("col-mpg").evaluate((el) => getComputedStyle(el).fontVariantNumeric)).toContain("tabular-nums");
    // The value sits in the middle of its header, not at an edge.
    for (const id of ["line", "jkbProjection", "mpg"]) {
      const head = await page.getByTestId(`head-${id}`).boundingBox();
      const value = await row.getByTestId(`col-${id}`).locator("span, :scope").first().boundingBox();
      const cell = await row.getByTestId(`col-${id}`).boundingBox();
      expect(Math.abs((head?.x ?? 0) + (head?.width ?? 0) / 2 - ((cell?.x ?? 0) + (cell?.width ?? 0) / 2)), id).toBeLessThanOrEqual(1);
      expect(value).not.toBeNull();
    }
  });

  test("Vegas Line sits right before the JKB projection, shows the selected market's line, and N/A without one", async ({ page }) => {
    const heads = (await page.locator("thead th:visible").allTextContents()).map((h) => h.replace(/\s+/g, " ").trim());
    expect(heads[heads.indexOf("JKB proj") - 1]).toBe("Vegas Line");
    const row = mainRow(page, "Demo Guard One");
    await expect(row.getByTestId("col-line")).toHaveText("24.5");
    await page.getByRole("button", { name: "Rebounds" }).click();
    await expect(mainRow(page, "Demo Guard One").getByTestId("col-line")).toHaveText("3.5");
    await expect(mainRow(page, "Demo Bench Seven").getByTestId("col-line")).toHaveText("N/A");
    // The line sits immediately left of the projection.
    const line = await mainRow(page, "Demo Guard One").getByTestId("col-line").boundingBox();
    const jkb = await mainRow(page, "Demo Guard One").getByTestId("col-jkbProjection").boundingBox();
    expect(Math.abs((line?.x ?? 0) + (line?.width ?? 0) - (jkb?.x ?? 0))).toBeLessThanOrEqual(1);
  });

  test("the Vegas Line cannot be hidden from the Columns menu", async ({ page }) => {
    await page.getByTestId("columns-menu-trigger").click();
    await expect(page.getByTestId("column-toggle-line")).toBeChecked();
    await expect(page.getByTestId("column-toggle-line")).toBeDisabled();
  });

  test("the Player Last 10 table lists the games newest first with the selected market's result", async ({ page }) => {
    const detail = await openRow(page, "Demo Guard One");
    const table = detail.getByTestId("player-box-table");
    await expect(table.getByTestId("player-box-row")).toHaveCount(10);
    const dates = await table.getByTestId("player-box-row").evaluateAll((rows) => rows.map((r) => r.querySelector("td")?.textContent?.trim() ?? ""));
    const stamp = (d: string) => new Date(`${d}, 2026`).getTime();
    expect(dates.map(stamp)).toEqual([...dates.map(stamp)].sort((a, b) => b - a));
    await expect(table.getByRole("columnheader")).toHaveText(["Date", "Opp", "Result", "MIN", "PTS", "REB", "AST", "PTS vs line"]);
    await expect(detail.getByTestId("player-box-average")).toContainText("L10 avg");
    await page.getByRole("button", { name: "Assists" }).click();
    const again = await openRow(page, "Demo Guard One");
    await expect(again.getByTestId("player-box-table").getByRole("columnheader", { name: "AST vs line" })).toBeVisible();
    await expect(again.getByTestId("player-box-table").getByRole("columnheader", { name: "AST", exact: true })).toHaveCSS("font-weight", "700");
    for (const cell of await again.getByTestId("player-box-table").locator("tbody tr").first().locator("td").all()) {
      const name = (await cell.textContent())?.trim() ?? "";
      if (/^\d/.test(name)) expect(await align(cell), name).toBe("center");
    }
  });

  test("the Opponent Last 10 table groups games, opens to individual players, and flags incomplete coverage", async ({ page }) => {
    const detail = await openRow(page, "Demo Guard One");
    const table = detail.getByTestId("opp-box-table");
    await expect(table.getByTestId("opp-box-game")).toHaveCount(10);
    await expect(table.getByTestId("opp-box-player")).toHaveCount(0);
    await table.getByTestId("opp-box-game").first().click();
    const players = table.getByTestId("opp-box-player");
    expect(await players.count()).toBeGreaterThan(0);
    for (const p of await players.all()) await expect(p).toContainText("PG");
    await expect(table.getByTestId("opp-box-game").first()).toHaveAttribute("aria-expanded", "true");
    await detail.getByTestId("opp-box-expand-all").click();
    await expect(table.getByTestId("opp-box-game").nth(9)).toHaveAttribute("aria-expanded", "true");
    await expect(detail.getByTestId("opp-box-coverage-summary")).toContainText("Attributed minutes");
    await expect(table.locator("[data-incomplete='true']").first()).toContainText(/partial|not a shutout/);
    // The game rows never toggle the player row.
    await expect(mainRow(page, "Demo Guard One")).toHaveAttribute("aria-expanded", "true");
    await shotOf(detail.getByTestId("box-scores"), "box-scores-1280-expanded");
  });

  test("a game with no assigned positions is a gap, not a shutout", async ({ page }) => {
    const detail = await openRow(page, "Demo Big Four");
    const gap = detail.getByTestId("opp-box-game").filter({ hasText: "not a shutout" });
    await expect(gap).toHaveCount(1);
    await expect(gap.getByTestId("opp-box-subtotal-pts")).toHaveText("–");
    await expect(detail.getByTestId("opp-box-average")).toContainText("9 of 10 games with positions");
  });

  for (const viewport of VIEWPORTS) {
    test(`the open row with both box-score tables fits at ${viewport.name}px with no sideways page scroll`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(DEMO, { waitUntil: "networkidle" });
      const detail = await openRow(page, "Demo Guard One");
      await detail.getByTestId("opp-box-expand-all").click();
      await expect(detail.getByTestId("player-box-table")).toBeVisible();
      await expect(detail.getByTestId("opp-box-table")).toBeVisible();
      await expect.poll(() => pageOverflow(page)).toBeLessThanOrEqual(1);
      // Each box-score table fits its own card: nothing needs an inner scroll bar.
      for (const id of ["player-box-table", "opp-box-table"]) {
        const over = await detail.getByTestId(id).evaluate((el) => (el.parentElement?.scrollWidth ?? 0) - (el.parentElement?.clientWidth ?? 0));
        expect(over, id).toBeLessThanOrEqual(1);
      }
      // The selected-market result column steps aside on a phone, where the highlighted stat column says the same thing.
      const resultHead = detail.getByTestId("player-box-table").getByRole("columnheader", { name: /PTS vs line/ });
      if (viewport.width < 640) await expect(resultHead).toBeHidden();
      else await expect(resultHead).toBeVisible();
      await detail.scrollIntoViewIfNeeded();
      await shot(page, `box-scores-${viewport.name}`);
    });
  }

  test("the table on a phone shows player, matchup, Vegas Line and the projection, and opens by tapping the row", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(DEMO, { waitUntil: "networkidle" });
    await expect(page.locator("thead th:visible")).toHaveCount(4);
    await expect.poll(() => pageOverflow(page)).toBeLessThanOrEqual(1);
    await mainRow(page, "Demo Guard One").getByTestId("col-line").tap().catch(() => mainRow(page, "Demo Guard One").getByTestId("col-line").click());
    await expect(mainRow(page, "Demo Guard One")).toHaveAttribute("aria-expanded", "true");
    await expect(detailOf(page, "Demo Guard One").getByTestId("detail-last10")).toBeVisible();
    await shot(page, "table-phone-390");
  });

  test("makes no request to an odds service (analytics is blocked by the shared fixture)", async ({ page }) => {
    const hosts = new Set<string>();
    page.on("request", (request) => hosts.add(new URL(request.url()).hostname));
    await page.reload({ waitUntil: "networkidle" });
    await mainRow(page, "Demo Guard One").getByTestId("col-mpg").click();
    await page.getByRole("button", { name: "Rebounds" }).click();
    for (const host of hosts) expect(host, host).not.toMatch(/odds/i);
  });
});

async function openRow(page: Page, name: string) {
  const row = mainRow(page, name);
  if ((await row.getAttribute("aria-expanded")) !== "true") await row.getByTestId("col-line").click();
  return detailOf(page, name);
}
