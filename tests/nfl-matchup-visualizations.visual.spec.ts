import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8089";
const route = "/nfl/matchups/new-england-patriots-at-seattle-seahawks";

/** Parses `rgb(r, g, b)` / `rgba(r, g, b, a)` into a 0-255 channel tuple. */
function rgbChannels(rgb: string): [number, number, number] {
  const match = rgb.match(/(\d+(?:\.\d+)?)/g);
  if (!match || match.length < 3) throw new Error(`Unparseable colour: ${rgb}`);
  return [Number(match[0]), Number(match[1]), Number(match[2])];
}

/** Relative luminance (WCAG), used only to assert text reads as light-on-dark, not exact contrast math. */
function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

for (const width of [390, 430, 768, 1440]) {
  const isMobile = width < 768;

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

    if (isMobile) {
      // Rank Towers keep their internal horizontal swipe on mobile, with a
      // visible swipe hint and fade.
      const initialTowerScroll = await towerViewport.evaluate((node) => ({
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
      }));
      expect(initialTowerScroll.scrollWidth).toBeGreaterThan(initialTowerScroll.clientWidth);
      await expect(towers.locator(".matchup-viz-swipe-hint")).toBeVisible();
      await towerViewport.evaluate((node) => { node.scrollLeft = 100; });
      await expect.poll(() => towerViewport.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    } else {
      // Desktop/tablet: cards wrap into rows instead of swiping, so the
      // viewport never overflows and no swipe hint renders.
      const desktopTowerScroll = await towerViewport.evaluate((node) => ({
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
      }));
      expect(desktopTowerScroll.scrollWidth - desktopTowerScroll.clientWidth).toBeLessThanOrEqual(1);
      await expect(towers.locator(".matchup-viz-swipe-hint")).toHaveCount(0);
    }

    const metricsTrigger = shell.locator(".matchup-metrics-trigger:visible");
    await expect(metricsTrigger).toBeVisible();
    await metricsTrigger.click();
    await expect(page.locator(width <= 430 ? ".matchup-metrics-drawer" : ".matchup-metrics-popover")).toBeVisible();
    await page.keyboard.press("Escape");

    const profileTab = shell.getByRole("tab", { name: "Profile", exact: true });
    if (isMobile) {
      // Profile is a desktop/tablet-only view; mobile always falls back to
      // Rank Towers without exposing the toggle.
      await expect(profileTab).toHaveCount(0);
    } else {
      await profileTab.click();
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

      // Switch back so the rest of the test (All Metrics, category tabs) sees
      // the same Rank Towers state the mobile branch exercises.
      await shell.getByRole("tab", { name: "Rank Towers", exact: true }).click();
    }

    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      errorOverlay: Boolean(document.querySelector(".vite-error-overlay")),
    }));
    expect(layout.overflow).toBeLessThanOrEqual(1);
    expect(layout.errorOverlay).toBe(false);
  });

  test(`${width}px All Metrics, Data Window, Success Rate and Unit by Unit read correctly`, async ({ page }) => {
    await page.setViewportSize({ width, height: width <= 430 ? 900 : 1000 });
    await page.goto(`${baseUrl}${route}`);
    await page.getByRole("tab", { name: "Team Comparison" }).click();
    const shell = page.locator(".matchup-visualization-shell");
    await expect(shell).toBeVisible();

    // Data Window: a compact single-row disclosure, collapsed by default at
    // every width, never the old full-height green panel.
    const dataWindow = page.locator(".matchup-data-window");
    await expect(dataWindow).toBeVisible();
    expect(await dataWindow.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(false);
    const summaryHeight = await dataWindow.locator(".matchup-data-window__summary").evaluate((node) => node.getBoundingClientRect().height);
    expect(summaryHeight).toBeLessThanOrEqual(60);
    await expect(dataWindow.locator(".matchup-data-window__active")).toBeVisible();

    // All Metrics: closed by default on desktop/tablet, open by default on
    // mobile. Mobile keeps the existing compact side-by-side comparison rows;
    // desktop/tablet uses the complete registry as Tower + neutral context cards.
    const allMetrics = shell.locator(".matchup-all-metrics").first();
    await expect(allMetrics).toBeVisible();
    expect(await allMetrics.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(isMobile);
    if (isMobile) {
      await expect(allMetrics.locator(".matchup-comparison-card, .matchup-metric-table").first()).toBeVisible();
    } else {
      await allMetrics.locator("summary").click();
      await expect(allMetrics.locator(".matchup-rank-towers__card").first()).toBeVisible();
      // Context-only metrics render as neutral cards, never leader/tower semantics.
      const contextCard = allMetrics.locator(".matchup-context-metric").first();
      if (await contextCard.count()) {
        await expect(contextCard.locator(".matchup-rank-towers__advantage")).toHaveCount(0);
      }
    }

    // Success Rate by Period.
    const successSection = page.locator("section", { hasText: "Success Rate by Period" }).first();
    await successSection.scrollIntoViewIfNeeded();
    if (isMobile) {
      const toggle = successSection.locator(".matchup-mobile-view-control [role=\"tab\"]");
      await expect(toggle.first()).toBeVisible();
      await expect(successSection.locator(".matchup-mobile-view-control [role=\"tab\"][aria-selected=\"true\"]")).toHaveText("Comparison");
      // Comparison is the default: no Rank Towers card yet, the comparison grid is showing.
      await expect(successSection.locator(".matchup-rank-towers__card")).toHaveCount(0);
      await expect(successSection.locator(".matchup-comparison-card").first()).toBeVisible();
    } else {
      await expect(successSection.locator(".matchup-mobile-view-control")).toHaveCount(0);
      await expect(successSection.locator(".matchup-rank-towers__card").first()).toBeVisible();
    }

    // Unit by Unit.
    const unitSection = page.locator("section", { hasText: "Unit by unit" }).first();
    await unitSection.scrollIntoViewIfNeeded();
    if (isMobile) {
      await expect(unitSection.locator(".matchup-mobile-view-control [role=\"tab\"][aria-selected=\"true\"]")).toHaveText("Comparison");
      await expect(unitSection.locator(".matchup-rank-towers__card")).toHaveCount(0);
      await expect(unitSection.locator(".matchup-comparison-card").first()).toBeVisible();
    } else {
      await expect(unitSection.locator(".matchup-mobile-view-control")).toHaveCount(0);
      await expect(unitSection.locator(".matchup-rank-towers__card").first()).toBeVisible();
      // Attacking/defending identity is explicit in the pairing label, not only colour.
      await expect(unitSection.locator(".matchup-rank-towers__pairing").first()).toContainText(/OFF vs .* DEF|DEF vs .* OFF/);
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test(`${width}px Coaching / Sideline reads as light text on a dark panel`, async ({ page }) => {
    await page.setViewportSize({ width, height: width <= 430 ? 900 : 1000 });
    await page.goto(`${baseUrl}${route}`);
    await page.getByRole("tab", { name: "Team Comparison" }).click();
    const shell = page.locator(".matchup-visualization-shell");
    await shell.getByRole("tab", { name: "Coaching / Sideline" }).click();

    const dark = shell.locator(".nfl-coaching-comparison--dark").first();
    await expect(dark).toBeVisible();
    const coachName = dark.locator("[data-testid=\"nfl-coaching-away\"], [data-testid=\"nfl-coaching-home\"]").first();
    await expect(coachName).toBeVisible();

    // Read background/text colour off the coach row itself (not the section
    // wrapper), since that's the element that actually carries the
    // `bg-white`/`bg-slate-50` Tailwind classes this dark variant overrides.
    const [panelBg, textColor] = await Promise.all([
      coachName.evaluate((node) => getComputedStyle(node).backgroundColor),
      coachName.evaluate((node) => getComputedStyle(node).color),
    ]);
    // Dark theme: readable text is meaningfully lighter than the panel it sits on.
    expect(luminance(rgbChannels(textColor))).toBeGreaterThan(luminance(rgbChannels(panelBg)) + 40);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
  });
}
