import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8089";
const route = "/nfl/matchups/new-england-patriots-at-seattle-seahawks";

for (const width of [390, 430, 768, 1440]) {
  test(`${width}px Stitch visualization shell stays substantial and viewport-safe`, async ({ page }) => {
    await page.setViewportSize({ width, height: width <= 430 ? 844 : 900 });
    await page.goto(`${baseUrl}${route}`);

    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    const spine = page.locator(".matchup-spine:visible");
    await expect(spine).toBeVisible();
    expect(await spine.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);

    await page.getByRole("tab", { name: "Team Comparison" }).click();
    const shell = page.locator(".matchup-visualization-shell");
    await expect(shell).toBeVisible();
    expect(await shell.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgb(15, 19, 28)");

    const towers = shell.locator(".matchup-rank-towers:visible");
    const towerViewport = towers.locator(".matchup-rank-towers__viewport");
    const firstCard = towers.locator("[data-rank-tower-group]").first();
    await expect(firstCard).toBeVisible();
    const cardBox = await firstCard.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(cardBox!.width).toBeGreaterThanOrEqual(width >= 1024 ? 199 : width >= 640 ? 175 : 163);
    expect(cardBox!.height).toBeGreaterThanOrEqual(width >= 1024 ? 250 : 210);

    if (width <= 430) {
      const initialTowerScroll = await towerViewport.evaluate((node) => ({
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
      }));
      expect(initialTowerScroll.scrollWidth).toBeGreaterThan(initialTowerScroll.clientWidth);
      await towerViewport.evaluate((node) => { node.scrollLeft = 100; });
      await expect.poll(() => towerViewport.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    }

    const metricsTrigger = shell.locator(".matchup-metrics-trigger:visible");
    await expect(metricsTrigger).toBeVisible();
    await metricsTrigger.click();
    await expect(page.locator(width <= 430 ? ".matchup-metrics-drawer" : ".matchup-metrics-popover")).toBeVisible();
    await page.keyboard.press("Escape");

    await shell.getByRole("tab", { name: "Profile", exact: true }).click();
    const profile = shell.locator(".matchup-signature-profile:visible");
    const profileViewport = profile.locator(".matchup-signature-profile__viewport");
    await expect(profile).toBeVisible();
    expect(await profile.locator(".matchup-signature-profile__plot").evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(240);

    if (width <= 430) {
      const profileScroll = await profileViewport.evaluate((node) => ({
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
      }));
      expect(profileScroll.scrollWidth).toBeGreaterThan(profileScroll.clientWidth);
      await profileViewport.evaluate((node) => { node.scrollLeft = 100; });
      await expect.poll(() => profileViewport.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    }

    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      errorOverlay: Boolean(document.querySelector(".vite-error-overlay")),
    }));
    expect(layout.overflow).toBeLessThanOrEqual(1);
    expect(layout.errorOverlay).toBe(false);
  });
}
