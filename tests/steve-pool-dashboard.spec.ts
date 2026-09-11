import { expect, test } from "../playwright-fixture";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`/steve renders the empty 2026 ledger on ${viewport.name}`, async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (/Failed to load resource|net::ERR_/.test(text)) return;
      consoleErrors.push(text);
    });

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`${BASE_URL}/steve`);

    await expect(page.getByRole("heading", { level: 1, name: "ChatGPT Pool Entry" })).toBeVisible();
    await expect(page.getByText("Started 3,600")).toBeVisible();
    await expect(page.getByText("No Week 1 wagers yet")).toBeVisible();
    await expect(page.getByText("No Side Pool prediction yet")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    await expect(page.getByText(/Veteran Pool/i)).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await page.screenshot({ path: testInfo.outputPath(`steve-${viewport.name}.png`), fullPage: true });
    expect(pageErrors, `page errors:\n${pageErrors.join("\n")}`).toEqual([]);
    expect(consoleErrors, `console errors:\n${consoleErrors.join("\n")}`).toEqual([]);
  });
}
