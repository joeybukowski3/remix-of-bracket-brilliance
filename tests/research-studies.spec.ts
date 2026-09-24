import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

for (const width of [320, 390, 430, 768, 1150, 1440]) {
  test(`research index stays readable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/research-studies`);
    await expect(page.getByRole("heading", { level: 1, name: "Research Studies" })).toBeVisible();
    await expect(page.locator(".research-card")).toHaveCount(6);
    await expect(page.locator(".research-progression li")).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    if ([390, 768, 1440].includes(width)) await page.screenshot({ path: testInfo.outputPath(`research-index-${width}.png`), fullPage: true });
  });
}

test("study detail is readable and linked on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/research-studies/protection-vs-pass-rush`);
  await expect(page.getByRole("heading", { level: 1, name: "Protection Vulnerability × Pass-Rush Quality" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What didn’t hold up" })).toBeVisible();
  await expect(page.getByRole("img", { name: /5.02, 5.58, 6.11, 6.47, and 7.71 percent/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("research-detail-390.png"), fullPage: true });
});
