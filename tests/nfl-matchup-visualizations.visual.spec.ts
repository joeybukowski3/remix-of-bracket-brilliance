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

for (const width of [390, 430, 768, 1150, 1440]) {
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
    const towerViewport = towers.locator(".matchup-unified-chart__viewport");
    const groups = towers.locator("[data-rank-tower-group]");
    const firstGroup = groups.first();
    const lastGroup = groups.last();
    await expect(firstGroup).toBeVisible();
    await expect(towers.locator(".matchup-rank-towers__card")).toHaveCount(0);
    const groupCount = await groups.count();
    expect(groupCount).toBeGreaterThan(1);
    await expect(towers).toHaveAttribute("data-metric-count", String(groupCount));
    for (const group of await groups.all()) {
      await expect(group.locator(".matchup-unified-chart__caption")).toBeVisible();
      await expect(group.locator(".matchup-unified-chart__value")).toHaveCount(2);
      for (const value of await group.locator(".matchup-unified-chart__value").all()) {
        await expect(value).toBeVisible();
      }
    }

    const fitMode = (await towers.getAttribute("data-fit")) === "true";
    const initialTowerScroll = await towerViewport.evaluate((node) => ({
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
    }));

    if (isMobile) {
      if (fitMode) {
        expect(groupCount).toBeLessThanOrEqual(6);
        expect(initialTowerScroll.scrollWidth - initialTowerScroll.clientWidth).toBeLessThanOrEqual(1);
        await expect(towers.locator(".matchup-viz-swipe-hint")).toHaveCount(0);

        const visibleBounds = await towerViewport.evaluate((viewport) => {
          const viewportBox = viewport.getBoundingClientRect();
          const metricGroups = viewport.querySelectorAll<HTMLElement>("[data-rank-tower-group]");
          const firstBox = metricGroups[0].getBoundingClientRect();
          const lastBox = metricGroups[metricGroups.length - 1].getBoundingClientRect();
          return {
            firstInset: firstBox.left - viewportBox.left,
            lastInset: viewportBox.right - lastBox.right,
          };
        });
        expect(visibleBounds.firstInset).toBeGreaterThanOrEqual(-1);
        expect(visibleBounds.lastInset).toBeGreaterThanOrEqual(-1);
        await expect(lastGroup).toBeVisible();
      } else {
        expect(groupCount).toBeGreaterThan(6);
        expect(initialTowerScroll.scrollWidth).toBeGreaterThan(initialTowerScroll.clientWidth);
        await expect(towers.locator(".matchup-viz-swipe-hint")).toBeVisible();
        await towerViewport.evaluate((node) => { node.scrollLeft = 100; });
        await expect.poll(() => towerViewport.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      }
    } else {
      // Desktop/laptop: metrics share one continuous plot without page overflow.
      if (width >= 1150) expect(initialTowerScroll.scrollWidth - initialTowerScroll.clientWidth).toBeLessThanOrEqual(1);
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
      if (width <= 480) {
        const teamHeader = allMetrics.locator(".matchup-comparison-team-header--sticky");
        const columnHeader = allMetrics.locator(".matchup-metric-table thead");
        const rows = allMetrics.locator(".matchup-metric-table tbody tr");
        await expect(teamHeader).toHaveCSS("position", "static");
        await expect(rows.first()).toBeVisible();
        await expect(rows.nth(1)).toBeVisible();

        const geometry = await Promise.all([
          teamHeader.boundingBox(),
          columnHeader.boundingBox(),
          rows.first().boundingBox(),
          rows.nth(1).boundingBox(),
        ]);
        const [teamBox, columnBox, firstRowBox, secondRowBox] = geometry;
        expect(teamBox).not.toBeNull();
        expect(columnBox).not.toBeNull();
        expect(firstRowBox).not.toBeNull();
        expect(secondRowBox).not.toBeNull();
        expect(teamBox!.y + teamBox!.height).toBeLessThanOrEqual(columnBox!.y + 1);
        expect(columnBox!.y + columnBox!.height).toBeLessThanOrEqual(firstRowBox!.y + 1);
        expect(firstRowBox!.y + firstRowBox!.height).toBeLessThanOrEqual(secondRowBox!.y + 1);
      }
    } else {
      await allMetrics.locator("summary").click();
      await expect(allMetrics.locator(".matchup-unified-chart [data-rank-tower-group]").first()).toBeVisible();
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
      await expect(successSection.locator(".matchup-unified-chart")).toHaveCount(0);
      await expect(successSection.locator(".matchup-comparison-card").first()).toBeVisible();
    } else {
      await expect(successSection.locator(".matchup-mobile-view-control")).toHaveCount(0);
      await expect(successSection.locator(".matchup-unified-chart").first()).toBeVisible();
    }

    // Unit by Unit.
    const unitSection = page.locator("section", { hasText: "Unit by unit" }).first();
    await unitSection.scrollIntoViewIfNeeded();
    if (isMobile) {
      await expect(unitSection.locator(".matchup-mobile-view-control [role=\"tab\"][aria-selected=\"true\"]")).toHaveText("Comparison");
      await expect(unitSection.locator(".matchup-unified-chart")).toHaveCount(0);
      await expect(unitSection.locator(".matchup-comparison-card").first()).toBeVisible();
    } else {
      await expect(unitSection.locator(".matchup-mobile-view-control")).toHaveCount(0);
      await expect(unitSection.locator(".matchup-unified-chart").first()).toBeVisible();
      await expect(unitSection.locator(".matchup-unified-chart__identity").first()).toContainText(/OFF|DEF/);
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

for (const width of [390, 430, 768, 1440] as const) {
  test(`${width}px tower identity keeps the legend while adapting the per-tower label`, async ({ page }) => {
    await page.setViewportSize({ width, height: width <= 430 ? 844 : 900 });
    await page.goto(`${baseUrl}${route}`);
    await page.getByRole("tab", { name: "Team Comparison" }).click();

    const towers = page.locator(".matchup-visualization-shell .matchup-rank-towers:visible");
    const firstTeam = towers.locator(".matchup-unified-chart__team").first();
    const identity = firstTeam.locator(".matchup-unified-chart__identity");
    const identityLabel = identity.locator(".matchup-unified-chart__identity-label");
    const firstLegendTeam = towers.locator(".matchup-unified-chart__legend > span").first();

    await expect(identity.locator(".rank-tower-team-crest")).toBeVisible();
    await expect(firstLegendTeam).toContainText(/NE.*Away/i);
    await expect(firstTeam).toHaveAttribute("aria-label", /New England|NE/i);
    if (width <= 480) {
      await expect(identityLabel).toBeHidden();
    } else {
      await expect(identityLabel).toBeVisible();
      await expect(identityLabel).toContainText("NE");
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
