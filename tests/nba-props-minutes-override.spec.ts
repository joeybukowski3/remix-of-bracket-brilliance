import { expect, test } from "../playwright-fixture";

/**
 * NBA props board: season averages and manual minutes overrides, on desktop and mobile.
 *
 * The invented demo board (`?demo=synthetic`) exists only on the Vite dev server, so run this against `npm run dev`:
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 npx playwright test tests/nba-props-minutes-override.spec.ts
 * Against a production build the demo is absent and the spec skips itself. Every figure here is invented.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080";
const DEMO = `${BASE_URL}/nba/props?demo=synthetic`;
const VIEWPORTS = [
  { name: "mobile 320", width: 320, height: 700 },
  { name: "mobile 390", width: 390, height: 844 },
  { name: "tablet 768", width: 768, height: 900 },
  { name: "desktop 1440", width: 1440, height: 900 },
] as const;

const pageOverflow = (page: import("@playwright/test").Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe("minutes overrides and season averages", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DEMO, { waitUntil: "networkidle" });
    const hasDemo = await page.getByText(/SYNTHETIC DATA/).count();
    test.skip(hasDemo === 0, "the synthetic demo board is only served by the dev server");
  });

  for (const viewport of VIEWPORTS) {
    test(`works without sideways page scroll at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(DEMO, { waitUntil: "networkidle" });
      await expect(page.getByTestId("props-board-table")).toBeVisible();
      await expect.poll(() => pageOverflow(page)).toBeLessThanOrEqual(1);

      const region = page.getByRole("region", { name: /season averages, your minutes/ });
      const scrolls = await region.evaluate((el) => el.scrollWidth > el.clientWidth);
      if (viewport.width < 1500) expect(scrolls).toBe(true);

      const input = page.getByLabel(/Your projected minutes for Demo Guard One/);
      await input.scrollIntoViewIfNeeded();
      const box = await input.boundingBox();
      expect((box?.height ?? 0) >= 30).toBe(true);
      await input.fill("36");
      const row = page.getByRole("row", { name: /Demo Guard One/ });
      await expect(row.getByTestId("adjusted-projection")).toContainText(((26.1 * 36) / 34).toFixed(1));
      await expect(row.getByTestId("jkb-projection")).toHaveText("26.1");
      await expect.poll(() => pageOverflow(page)).toBeLessThanOrEqual(1);
    });
  }

  test("the player column stays in view while the table scrolls sideways on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(DEMO, { waitUntil: "networkidle" });
    const region = page.getByRole("region", { name: /season averages, your minutes/ });
    const name = page.getByRole("rowheader", { name: /Demo Guard One/ });
    const before = await name.boundingBox();
    await region.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    await expect.poll(async () => (await name.boundingBox())?.x ?? -999).toBeGreaterThanOrEqual((before?.x ?? 0) - 1);
    await expect(name).toBeInViewport();
  });

  test("adds the market's own per-game and per-minute columns, keeps season MPG, and keeps minutes when the market changes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel(/Your projected minutes for Demo Guard One/).fill("36");
    await page.getByRole("button", { name: "Rebounds" }).click();
    await expect(page.getByRole("columnheader", { name: /RPG/ })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /REB\/min/ })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /MPG/ })).toBeVisible();
    await expect(page.getByLabel(/Your projected minutes for Demo Guard One/)).toHaveValue("36");
    await expect(page.getByRole("row", { name: /Demo Guard One/ }).getByTestId("adjusted-projection")).toContainText(((3.8 * 36) / 34).toFixed(1));
    await page.getByRole("button", { name: "Assists" }).click();
    await expect(page.getByRole("columnheader", { name: /APG/ })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /AST\/min/ })).toBeVisible();
  });

  test("reset and reset all clear the overrides, and nothing is stored or sent", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => {
      if (r.method() !== "GET") requests.push(`${r.method()} ${r.url()}`);
    });
    const guard = page.getByLabel(/Your projected minutes for Demo Guard One/);
    const big = page.getByLabel(/Your projected minutes for Demo Big Four/);
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
    await expect(page.getByLabel(/Your projected minutes for Demo Guard One/)).toHaveValue("");
  });

  test("shows early-season and no-games players honestly", async ({ page }) => {
    const early = page.getByRole("row", { name: /Demo Wing Two/ });
    await expect(early.getByTestId("season-sample")).toContainText("2026-27 · 3 games");
    await expect(early.getByTestId("season-sample")).toContainText("2025-26 · 70 games");
    const none = page.getByRole("row", { name: /Demo Wing Six/ });
    await expect(none.getByTestId("season-sample")).toContainText("no games yet this season");
    await expect(none.getByTestId("season-mpg")).toContainText("—");
  });

  test("is operable by keyboard: the minutes field takes focus and the table region is reachable", async ({ page }) => {
    const input = page.getByLabel(/Your projected minutes for Demo Guard One/);
    await input.focus();
    await expect(input).toBeFocused();
    await page.keyboard.type("31.5");
    await expect(input).toHaveValue("31.5");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /Reset minutes for Demo Guard One/ })).toBeFocused();
  });
});
