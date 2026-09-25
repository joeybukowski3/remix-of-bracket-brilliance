import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

for (const width of [1440, 390, 320]) {
  test(`weekly matchup trench columns remain readable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/nfl/matchups?week=1`);

    const scroller = page.getByRole("region", { name: /matchup matrix/i }).first();
    await expect(scroller.locator("table")).toBeVisible();
    const headers = await scroller.locator("tbody > tr").first().locator("[data-matrix-header-cell]").allTextContents();
    expect(headers).toEqual([
      "OVR", "Off EPA", "Off YPP", "Off SR", "Pass Block", "Run Block",
      "Def EPA", "Def YPP", "Def SR", "Pass Rush", "Run Stop",
    ]);
    const clippedHeaders = await scroller.locator("[data-matrix-header-cell] > span").evaluateAll(
      (labels) => labels.filter((label) => label.scrollWidth > label.clientWidth + 1).map((label) => label.textContent),
    );
    expect(clippedHeaders).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    const team = scroller.locator('[data-matrix-team-cell="away"]');
    await expect(team.locator("a")).toBeVisible();
    await expect(team.locator(width < 768 ? ".md\\:hidden" : ".md\\:inline")).toBeVisible();
    const before = await team.boundingBox();
    await scroller.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    const after = await team.boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(1);
    expect(after!.width).toBeGreaterThanOrEqual(width < 768 ? 95 : 140);
    await page.screenshot({ path: testInfo.outputPath(`weekly-matchups-${width}.png`) });
  });
}
