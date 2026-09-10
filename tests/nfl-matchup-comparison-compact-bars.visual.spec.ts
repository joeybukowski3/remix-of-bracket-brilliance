import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8089";
const route = "/nfl/matchups/new-england-patriots-at-seattle-seahawks";

const WIDTHS = [390, 768, 1440] as const;
const SHOT_DIR = process.env.SHOT_DIR ?? "test-results/compact-bars";

async function noBodyOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, "no horizontal body overflow").toBeLessThanOrEqual(1);
}

for (const width of WIDTHS) {
  test(`${width}px — Overview snapshot is a compact bento with bars and tier tiles`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1200 });
    await page.goto(`${baseUrl}${route}`);
    await expect(page.getByRole("heading", { name: "Team Comparison Snapshot" })).toBeVisible();

    const snapshot = page.locator(".matchup-snapshot");
    // Every category card carries a compact two-team header, away then home.
    const firstHeader = snapshot.locator(".matchup-comparison-team-header").first();
    await expect(firstHeader).toBeVisible();

    // A single comparison bar per comparable row.
    await expect(snapshot.locator(".matchup-metric-table__bar").first()).toBeVisible();

    // Rank tile shows an ordinal, never a raw decimal stat.
    const tileText = await snapshot.locator(".matchup-metric-table__value").first().innerText();
    expect(tileText).not.toMatch(/[+-]?\d\.\d/);

    // Section title centred.
    const align = await snapshot
      .locator(".matchup-snapshot__block h3")
      .first()
      .evaluate((el) => getComputedStyle(el).textAlign);
    expect(align).toBe("center");

    await noBodyOverflow(page);
    await page.screenshot({ path: `${SHOT_DIR}/` + `snapshot-${width}.png`, fullPage: true });
  });

  test(`${width}px — Team Comparison detail: centred title, capped width, tier tiles, team-colour bar`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1400 });
    await page.goto(`${baseUrl}${route}`);
    await page.getByRole("tab", { name: "Team Comparison" }).click();

    const heading = page.getByRole("heading", { name: "Statistical Comparison" });
    await expect(heading).toBeVisible();

    // On phones the categories are a collapsed accordion — open one.
    if (width < 640) {
      await page.getByRole("button", { name: /Overall Quality/ }).first().click();
    }

    // Detail table is a centred, capped column — not a full-width stretch.
    const table = page.locator('.matchup-metric-table[data-variant="detail"]').first();
    await expect(table).toBeVisible();
    const box = await table.boundingBox();
    expect(box).not.toBeNull();
    // 44rem cap (704px) plus a little slop — never a full-viewport stretch.
    expect(box!.width, "detail table capped near 44rem").toBeLessThanOrEqual(740);

    // Rank tile colour comes from the tier helper (emerald / red / amber / teal / orange),
    // never a winner/loser class.
    const tileClasses = await table
      .locator(".matchup-metric-table__value")
      .evaluateAll((els) => els.map((el) => el.className));
    expect(tileClasses.some((c) => /emerald|red|amber|teal|orange|slate/.test(c))).toBe(true);
    expect(tileClasses.some((c) => /is-winner|is-weaker/.test(c))).toBe(false);

    // Away stays left, home stays right in the header.
    const orientation = await page
      .locator(".matchup-comparison-team-header")
      .first()
      .evaluate((el) => el.textContent ?? "");
    expect(orientation.indexOf("NE")).toBeLessThan(orientation.indexOf("SEA"));

    // At least one directional bar with a resolved --bar-fill.
    const fill = table.locator(".matchup-metric-table__bar-fill").first();
    await expect(fill).toBeVisible();

    await noBodyOverflow(page);
    await page.screenshot({ path: `${SHOT_DIR}/` + `comparison-${width}.png`, fullPage: true });
  });
}

test("390px — team header sticks within the comparison section on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}${route}`);
  await page.getByRole("tab", { name: "Team Comparison" }).click();

  // Success Rate by Period always renders its sticky two-team header.
  await page.getByRole("heading", { name: "Success Rate by Period" }).scrollIntoViewIfNeeded();
  const header = page
    .locator("section", { hasText: "Success Rate by Period" })
    .locator(".matchup-comparison-team-header--sticky")
    .first();
  await expect(header).toBeVisible();
  const position = await header.evaluate((el) => getComputedStyle(el).position);
  expect(position).toBe("sticky");

  // Scroll until the section has passed the pin line, then the header must be
  // clamped just below the sticky tab bar rather than continuing to scroll away.
  await header.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(150);
  const box = await header.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(100);
  expect(box!.y).toBeLessThanOrEqual(140);
  await page.screenshot({ path: `${SHOT_DIR}/mobile-sticky-header.png` });
});

const OUTER_SECTIONS = [
  { label: "Success Rate by Period", heading: "Success Rate by Period" },
  { label: "Unit by unit", heading: "Offense vs Defense" },
  { label: "Line of scrimmage", heading: "Trenches" },
] as const;

for (const width of [390, 768, 1440] as const) {
  for (const { label: section, heading: headingName } of OUTER_SECTIONS) {
    test(`${width}px — ${section}: centred title + shared bar/tier-tile system`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1600 });
      await page.goto(`${baseUrl}${route}`);
      await page.getByRole("tab", { name: "Team Comparison" }).click();

      const region = page.locator("section", { hasText: section }).first();
      await region.scrollIntoViewIfNeeded();

      // Outer section heading is optically centred across the card.
      const heading = region.getByRole("heading", { name: headingName, exact: true }).first();
      const centred = await heading.evaluate((el) => {
        const card = el.closest("section")!;
        const h = el.getBoundingClientRect();
        const c = card.getBoundingClientRect();
        const headMid = h.left + h.width / 2;
        const cardMid = c.left + c.width / 2;
        return Math.abs(headMid - cardMid);
      });
      expect(centred, `${section} heading within 24px of card centre`).toBeLessThanOrEqual(24);

      await expect(region.locator(".matchup-metric-table__bar").first()).toBeVisible();
      await noBodyOverflow(page);
      const slug = section.toLowerCase().replace(/[^a-z]+/g, "-");
      await page.screenshot({ path: `${SHOT_DIR}/` + `${slug}-${width}.png` });
    });
  }
}
