import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { expect, test } from "../playwright-fixture";

const baseUrl = "http://127.0.0.1:4173";

test.beforeEach(async ({ page }) => {
  const root = resolve("dist");
  await page.route(`${baseUrl}/**`, async (route) => {
    const target = resolve(root, `.${decodeURIComponent(new URL(route.request().url()).pathname)}`);
    if (!target.startsWith(`${root}${sep}`)) return route.abort();
    const isFile = await stat(target).then((entry) => entry.isFile()).catch(() => false);
    const file = isFile ? target : resolve(root, "index.html");
    const mime: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
    await route.fulfill({ body: await readFile(file), contentType: mime[extname(file)] ?? "application/octet-stream" });
  });
  await page.route("https://a.espncdn.com/**", (route) => route.abort());
});

test("TD Scorer desktop route renders, filters, sorts, and expands both histories", async ({ page }, testInfo) => {
  const pageErrors: string[] = []; page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto(`${baseUrl}/nfl/td-scorer`);
  await expect(page.getByRole("heading", { level: 1, name: "TD Scorer" })).toBeVisible();
  await expect(page.getByText(/relative 0–100 player rating/i)).toBeVisible();
  await expect(page.getByTestId("touchdown-table-scroller").getByRole("table")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /JKB TD Score/ })).toHaveAttribute("aria-sort", "descending");
  await page.getByRole("button", { name: "RB", exact: true }).click();
  await expect(page.getByRole("button", { name: "RB", exact: true })).toHaveAttribute("aria-pressed", "true");
  const firstPlayer = page.locator("tbody tr[role=button]").first();
  await firstPlayer.click();
  await expect(page.getByText("Player game history").first()).toBeVisible();
  await expect(page.getByText("Opponent game history").first()).toBeVisible();
  expect(pageErrors).toEqual([]);
  await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("td-scorer-desktop.png"), fullPage: true });
});

test("TD Scorer mobile route contains horizontal table overflow without widening the page", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/nfl/td-scorer`);
  const scroller = page.getByTestId("touchdown-table-scroller");
  await expect(scroller).toBeVisible();
  expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const firstPlayer = page.locator("tbody tr[role=button]").first();
  await firstPlayer.focus(); await page.keyboard.press("Enter");
  await expect(page.getByTestId("touchdown-player-detail").first()).toBeVisible();
  await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("td-scorer-mobile.png"), fullPage: true });
});
