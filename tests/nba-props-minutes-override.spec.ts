import { expect, test } from "../playwright-fixture";

/**
 * NBA props board: the compact table, optional columns, expandable rows and manual minutes overrides, on desktop and mobile.
 *
 * The invented demo board (`?demo=synthetic`) exists only on the Vite dev server, so run this against `npm run dev`:
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 npx playwright test tests/nba-props-minutes-override.spec.ts
 * Against a production build the demo is absent and the spec skips itself. Every figure here is invented.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080";
const DEMO = `${BASE_URL}/nba/props?demo=synthetic`;
const VIEWPORTS = [
  { name: "mobile 320", width: 320, height: 700 },
  { name: "mobile 360", width: 360, height: 780 },
  { name: "mobile 390", width: 390, height: 844 },
  { name: "tablet 768", width: 768, height: 900 },
  { name: "desktop 1280", width: 1280, height: 900 },
  { name: "desktop 1440", width: 1440, height: 900 },
] as const;

type Page = import("@playwright/test").Page;
const pageOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const regionOverflow = (page: Page) => page.getByRole("region", { name: /player props: recent form/ }).evaluate((el) => el.scrollWidth - el.clientWidth);
const mainRow = (page: Page, name: string) => page.getByRole("row", { name: new RegExp(name) }).first();
/** Expands a player's detail row and returns it. */
async function openRow(page: Page, name: string) {
  await page.getByRole("button", { name: new RegExp(`Show details and minutes for ${name}`) }).click();
  return mainRow(page, name).locator("xpath=following-sibling::tr[1]");
}

test.describe("compact props table", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DEMO, { waitUntil: "networkidle" });
    const hasDemo = await page.getByText(/SYNTHETIC DATA/).count();
    test.skip(hasDemo === 0, "the synthetic demo board is only served by the dev server");
    await page.evaluate(() => localStorage.clear());
  });

  for (const viewport of VIEWPORTS) {
    test(`default columns fit without any sideways scroll at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(DEMO, { waitUntil: "networkidle" });
      await expect(page.getByTestId("props-board-table")).toBeVisible();
      await expect.poll(() => pageOverflow(page)).toBeLessThanOrEqual(1);
      // The table's own scroll region has nothing to scroll: that is the point of the compact set.
      if (viewport.width >= 360) expect(await regionOverflow(page)).toBeLessThanOrEqual(1);
      // Matchup, Vegas Line and the projection are on every screen; the season columns arrive with the tablet width, and PTS/MIN with the desktop's.
      for (const id of ["matchup", "line", "jkbProjection"]) await expect(page.getByTestId(`col-${id}`).first()).toBeVisible();
      for (const id of ["mpg", "perGame", "last10", "oppLast10"]) {
        if (viewport.width >= 768) await expect(page.getByTestId(`col-${id}`).first()).toBeVisible();
        else await expect(page.getByTestId(`col-${id}`).first()).toBeHidden();
      }
      if (viewport.width >= 1024) await expect(page.getByTestId("col-perMinute").first()).toBeVisible();
      else await expect(page.getByTestId("col-perMinute").first()).toBeHidden();
      // Vegas Line is immediately before the JKB projection, and its header and value are centered.
      const heads = await page.locator("thead th:visible").allTextContents();
      const trimmed = heads.map((h) => h.replace(/\s+/g, " ").trim());
      expect(trimmed[trimmed.indexOf("JKB proj") - 1]).toBe("Vegas Line");
    });
  }

  test("a 390px phone shows player, matchup, Vegas Line and projection, and the expanded row carries the rest, L10 included", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(DEMO, { waitUntil: "networkidle" });
    for (const id of ["last10", "oppLast10"]) await expect(page.getByTestId(`col-${id}`).first()).toBeHidden();
    const detail = await openRow(page, "Demo Guard One");
    for (const id of ["mpg", "perGame", "perMinute", "last5", "last10", "oppLast10", "dvpAllowed", "dvpPrior", "dvpCurrent", "line", "jkbMinutes"]) await expect(detail.getByTestId(`detail-${id}`)).toBeVisible();
    const input = detail.getByLabel(/Your projected minutes for Demo Guard One/);
    await expect(input).toBeVisible();
    await expect.poll(() => pageOverflow(page)).toBeLessThanOrEqual(1);
    const box = await input.boundingBox();
    expect((box?.height ?? 0) >= 30).toBe(true);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
  });

  test("the minutes field stays reachable on a phone even when Your min was chosen on a wide screen", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(DEMO, { waitUntil: "networkidle" });
    await page.getByTestId("columns-menu-trigger").click();
    await page.getByTestId("column-toggle-userMinutes").check();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("head-userMinutes")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("head-userMinutes")).toBeHidden();
    const detail = await openRow(page, "Demo Guard One");
    const input = detail.getByLabel(/Your projected minutes for Demo Guard One/);
    await expect(input).toBeVisible();
    await input.fill("36");
    await expect(detail.getByTestId("detail-adjustedProjection")).toContainText(((26.1 * 36) / 34).toFixed(1));
    await expect(mainRow(page, "Demo Guard One").getByTestId("override-chip")).toHaveText("36.0 min");
    await expect.poll(() => pageOverflow(page)).toBeLessThanOrEqual(1);
  });

  test("the Columns menu adds optional columns, which stay between visits and never include any figures", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(DEMO, { waitUntil: "networkidle" });
    await page.getByTestId("columns-menu-trigger").click();
    for (const id of ["line", "overUnder", "modelEdge"]) await page.getByTestId(`column-toggle-${id}`).check();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("head-line")).toBeVisible();
    await expect(mainRow(page, "Demo Guard One").getByTestId("col-modelEdge")).toHaveText("+1.6");
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    expect(stored).not.toContain("Demo");
    expect(stored).not.toContain("26.1");
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("head-line")).toBeVisible();
    await expect.poll(() => pageOverflow(page)).toBeLessThanOrEqual(1);
  });

  test("the player column stays in view while a wide table scrolls sideways", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto(DEMO, { waitUntil: "networkidle" });
    await page.getByTestId("columns-menu-trigger").click();
    for (const id of ["last5", "dvpAllowed", "dvpPrior", "dvpCurrent", "dvpGames", "line", "overUnder", "jkbMinutes", "modelEdge", "jkbTriple", "source"]) await page.getByTestId(`column-toggle-${id}`).check();
    await page.keyboard.press("Escape");
    expect(await regionOverflow(page)).toBeGreaterThan(0);
    await expect.poll(() => pageOverflow(page)).toBeLessThanOrEqual(1);
    const name = page.getByRole("rowheader", { name: /Demo Guard One/ });
    const before = await name.boundingBox();
    await page.getByRole("region", { name: /player props: recent form/ }).evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    await expect.poll(async () => (await name.boundingBox())?.x ?? -999).toBeGreaterThanOrEqual((before?.x ?? 0) - 1);
    await expect(name).toBeInViewport();
  });

  test("keeps minutes when the market changes, and the market's labels follow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const detail = await openRow(page, "Demo Guard One");
    await detail.getByLabel(/Your projected minutes for Demo Guard One/).fill("36");
    await expect(detail.getByTestId("detail-adjustedProjection")).toContainText(((26.1 * 36) / 34).toFixed(1));
    await expect(mainRow(page, "Demo Guard One").getByTestId("col-jkbProjection")).toHaveText("26.1");
    await page.getByRole("button", { name: "Rebounds" }).click();
    await expect(page.getByTestId("head-last10")).toContainText("L10 REB");
    const again = await openRow(page, "Demo Guard One");
    await expect(again.getByLabel(/Your projected minutes for Demo Guard One/)).toHaveValue("36");
    await expect(again.getByTestId("detail-adjustedProjection")).toContainText(((3.8 * 36) / 34).toFixed(1));
  });

  test("reset and reset all clear the overrides, and nothing but column ids is stored or sent", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => {
      if (r.method() !== "GET") requests.push(`${r.method()} ${r.url()}`);
    });
    const guard = (await openRow(page, "Demo Guard One")).getByLabel(/Your projected minutes for Demo Guard One/);
    const big = (await openRow(page, "Demo Big Four")).getByLabel(/Your projected minutes for Demo Big Four/);
    await guard.fill("36");
    await big.fill("20");
    await page.getByRole("button", { name: /Reset minutes for Demo Guard One/ }).click();
    await expect(guard).toHaveValue("");
    await expect(big).toHaveValue("20");
    await page.getByTestId("reset-all-minutes").click();
    await expect(big).toHaveValue("");
    await guard.fill("abc");
    await guard.blur();
    await expect(page.getByRole("alert")).toBeVisible();
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
    expect(requests).toEqual([]);
    await page.reload({ waitUntil: "networkidle" });
    const again = await openRow(page, "Demo Guard One");
    await expect(again.getByLabel(/Your projected minutes for Demo Guard One/)).toHaveValue("");
  });

  test("shows early-season and no-games players honestly", async ({ page }) => {
    await expect(mainRow(page, "Demo Wing Two").getByTestId("col-last10")).toContainText("15.3");
    await expect(mainRow(page, "Demo Wing Two").getByTestId("col-last10").getByRole("img", { name: /Only 3 games/ })).toBeVisible();
    await expect(mainRow(page, "Demo Wing Six").getByTestId("col-last10")).toHaveText("—");
    await expect(mainRow(page, "Demo Bench Seven").getByTestId("col-matchup")).toHaveText("N/A");
  });

  test("is operable by keyboard: the row expands with Enter, the minutes field takes focus and reset follows", async ({ page }) => {
    await mainRow(page, "Demo Guard One").focus();
    await page.keyboard.press("Enter");
    const input = page.getByLabel(/Your projected minutes for Demo Guard One/);
    await expect(input).toBeVisible();
    await input.focus();
    await page.keyboard.type("31.5");
    await expect(input).toHaveValue("31.5");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /Reset minutes for Demo Guard One/ })).toBeFocused();
  });
});
