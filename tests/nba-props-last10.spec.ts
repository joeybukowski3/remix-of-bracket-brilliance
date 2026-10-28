import { expect, test } from "../playwright-fixture";

/**
 * NBA props board: team identity, the visual hierarchy and the player / opponent last-ten charts, at phone, tablet and desktop widths.
 *
 * The invented demo board (`?demo=synthetic`) exists only on the Vite dev server, so run this against `npm run dev`:
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 npx playwright test tests/nba-props-last10.spec.ts
 * Set NBA_SHOT_DIR to also write screenshots there. Every figure here is invented; no analytics request is made.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080";
const DEMO = `${BASE_URL}/nba/props?demo=synthetic`;
const SHOT_DIR = process.env.NBA_SHOT_DIR;
const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 900 },
  { name: "1280", width: 1280, height: 900 },
  { name: "1440", width: 1440, height: 900 },
] as const;

type Page = import("@playwright/test").Page;
const pageOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const regionOverflow = (page: Page) => page.getByRole("region", { name: /player props: recent form/ }).evaluate((el) => el.scrollWidth - el.clientWidth);
const mainRow = (page: Page, name: string) => page.getByRole("row", { name: new RegExp(name) }).first();
async function openRow(page: Page, name: string) {
  await page.getByRole("button", { name: new RegExp(`Show details and minutes for ${name}`) }).click();
  return mainRow(page, name).locator("xpath=following-sibling::tr[1]");
}
async function shot(page: Page, name: string) {
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false });
}

test.describe("team identity, hierarchy and last-ten charts", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DEMO, { waitUntil: "networkidle" });
    test.skip((await page.getByText(/SYNTHETIC DATA/).count()) === 0, "the synthetic demo board is only served by the dev server");
    await page.evaluate(() => localStorage.clear());
  });

  for (const viewport of VIEWPORTS) {
    test(`the compact table, logos and colors fit and stay legible at ${viewport.name}px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(DEMO, { waitUntil: "networkidle" });
      await expect(page.getByTestId("props-board-table")).toBeVisible();
      await expect.poll(() => pageOverflow(page)).toBeLessThanOrEqual(1);
      expect(await regionOverflow(page)).toBeLessThanOrEqual(1);

      // A team logo (or its badge, offline) sits beside every name at 36px on a phone and 40px from the tablet width up.
      const logo = mainRow(page, "Demo Guard One").getByTestId("team-logo");
      await expect(logo).toBeVisible();
      const box = await logo.boundingBox();
      const expected = viewport.width >= 768 ? 40 : 36;
      expect(Math.round(box?.width ?? 0)).toBe(expected);
      expect(Math.round(box?.height ?? 0)).toBe(expected);

      // Rows stay compact: a 40px logo may not make a row taller than 64px on a tablet or desktop. A phone column is narrower,
      // so a three-word invented name wraps to three lines there (a real two-word name takes two): still under 90px.
      const rowBox = await mainRow(page, "Demo Guard One").boundingBox();
      expect(rowBox?.height ?? 999).toBeLessThanOrEqual(viewport.width >= 768 ? 64 : 90);

      // The default set, and the phone subset.
      const phone = viewport.width < 768;
      for (const id of ["matchup", "line", "jkbProjection"]) await expect(page.getByTestId(`col-${id}`).first()).toBeVisible();
      for (const id of ["mpg", "perGame", "last10", "oppLast10"]) {
        if (phone) await expect(page.getByTestId(`col-${id}`).first()).toBeHidden();
        else await expect(page.getByTestId(`col-${id}`).first()).toBeVisible();
      }
      await expect(page.getByRole("rowheader", { name: /Demo Guard One/ })).toBeInViewport();
      await shot(page, `table-${viewport.name}`);
    });
  }

  test("the player's own team colors the frozen cell, and both teams in one game differ", async ({ page }) => {
    const a = await mainRow(page, "Demo Guard One").getByTestId("player-cell").evaluate((el) => getComputedStyle(el).borderLeftColor);
    const b = await mainRow(page, "Demo Guard Five").getByTestId("player-cell").evaluate((el) => getComputedStyle(el).borderLeftColor);
    expect(a).not.toBe(b);
    expect(a).toBe("rgb(0, 107, 182)"); // NYK blue
    expect(b).toBe("rgb(0, 122, 51)"); // BOS green
  });

  test("a matchup is green or red with its arrow, word and rank, and the JKB projection is a navy pill", async ({ page }) => {
    await expect(mainRow(page, "Demo Big Four").getByTestId("col-matchup")).toContainText(/▲ Favorable #\d+/);
    await expect(mainRow(page, "Demo Guard One").getByTestId("col-matchup")).toContainText(/▼ Tough #\d+/);
    const green = await mainRow(page, "Demo Big Four").getByTestId("col-matchup").locator("span[title]").evaluate((el) => getComputedStyle(el).backgroundColor);
    const red = await mainRow(page, "Demo Guard One").getByTestId("col-matchup").locator("span[title]").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(green).not.toBe(red);
    const navy = await mainRow(page, "Demo Guard One").getByTestId("jkb-value").evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color }));
    expect(navy).toEqual({ bg: "rgb(30, 58, 138)", fg: "rgb(255, 255, 255)" });
  });

  for (const viewport of VIEWPORTS) {
    test(`both ten-game charts open in the row detail at ${viewport.name}px without overflow`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(DEMO, { waitUntil: "networkidle" });
      const detail = await openRow(page, "Demo Guard One");
      const player = detail.getByTestId("player-l10-chart");
      const opponent = detail.getByTestId("opp-l10-chart");
      await expect(player).toBeVisible();
      await expect(opponent).toBeVisible();
      await expect(player.getByTestId("player-l10-chart-bar")).toHaveCount(10);
      await expect(opponent.getByTestId("opp-l10-chart-bar")).toHaveCount(10);
      await expect.poll(() => pageOverflow(page)).toBeLessThanOrEqual(1);
      // Every bar is a usable touch target at least 20px wide, even at 320-390px.
      for (const bar of await player.getByTestId("player-l10-chart-bar").all()) expect((await bar.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(20);
      await expect(detail.getByLabel(/Your projected minutes for Demo Guard One/)).toBeVisible();
      await detail.scrollIntoViewIfNeeded();
      await shot(page, `detail-${viewport.name}`);
    });
  }

  test("tapping a bar writes the exact game underneath, and tapping again clears it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const detail = await openRow(page, "Demo Guard One");
    const bars = detail.getByTestId("player-l10-chart-bar");
    const readout = detail.getByTestId("player-l10-chart-readout");
    await bars.nth(9).click();
    await expect(readout).toContainText(/Oct \d+|Nov \d+/);
    await expect(readout).toContainText(/PTS/);
    await expect(readout).toContainText(/min/);
    await bars.nth(9).click();
    await expect(readout).toContainText(/PTS/);
    await bars.nth(2).click();
    await expect(bars.nth(2)).toHaveAttribute("aria-current", "true");
    await expect(bars.nth(9)).not.toHaveAttribute("aria-current");
    await page.getByRole("heading", { name: "NBA player props" }).click();
    await expect(readout).toContainText("Hover, focus or tap");
    await bars.nth(2).focus();
    await expect(readout).toContainText(/PTS/);
  });

  test("the opponent chart shows an honest small sample and a gap game", async ({ page }) => {
    const small = await openRow(page, "Demo Guard Five");
    await expect(small.getByTestId("opp-l10-chart-bar")).toHaveCount(4);
    await expect(small.getByTestId("opp-l10-summary")).toContainText(/small sample \(4 of 10\)/);
    const gap = await openRow(page, "Demo Big Four");
    await expect(gap.getByTestId("opp-l10-limits")).toContainText(/no attributed minutes shown as gaps/);
  });

  test("hovering a bar on a desktop writes its date, opponent and figure", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const detail = await openRow(page, "Demo Guard One");
    await detail.getByTestId("opp-l10-chart-bar").nth(0).hover();
    await expect(detail.getByTestId("opp-l10-chart-readout")).toContainText(/(vs|@) [A-Z]{3} · [\d.]+ PTS/);
  });
});
