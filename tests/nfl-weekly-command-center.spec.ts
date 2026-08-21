import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

test("NFL Weekly Command Center desktop board renders the canonical Week 1 slate", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/nfl?week=1`);
  await expect(page.getByRole("heading", { name: "NFL Week 1" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Largest Gaps" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fantasy Leaders" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(16);
  await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("nfl-weekly-desktop.png"), fullPage: true });
});

test("NFL Weekly Command Center mobile board is compact and selector-driven", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/nfl?week=1`);
  const board = page.getByTestId("mobile-game-board");
  await expect(board).toBeVisible();
  await expect(board.locator("a")).toHaveCount(16);
  await expect(page.getByRole("group", { name: "Fantasy position" })).toBeVisible();
  await page.getByRole("button", { name: "WR", exact: true }).click();
  await expect(page.getByRole("button", { name: "WR", exact: true })).toHaveAttribute("aria-pressed", "true");
  const overflow = await board.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("nfl-weekly-mobile.png"), fullPage: true });
});
