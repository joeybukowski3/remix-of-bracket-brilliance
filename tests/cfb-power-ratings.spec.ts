import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8089";
const route = "/college-football/rankings";
test.describe.configure({ timeout: 90_000 });
const viewChecks = [
  { tab: "Power Ratings", header: "JKB Power" },
  { tab: "Offense", header: "PPG" },
  { tab: "Defense", header: "PA/G" },
  { tab: "Passing", header: "Pass Yds" },
  { tab: "Rushing", header: "Rush Yds" },
  { tab: "Situational", header: "3D Off" },
] as const;

for (const viewport of [
  { width: 390, height: 844 },
  { width: 430, height: 860 },
  { width: 768, height: 900 },
  { width: 1150, height: 900 },
  { width: 1440, height: 900 },
]) {
  test(`${viewport.width}px complete power-ratings workflow`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "College Football", level: 1 })).toBeVisible();
    const tableRegion = page.getByRole("region", { name: "College Football power ratings" });
    await expect(tableRegion).toBeVisible();
    await expect(page.getByRole("button", { name: "values" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("columnheader", { name: "JKB Power" })).toBeVisible();

    for (const check of viewChecks) {
      await page.getByRole("button", { name: check.tab }).click();
      await expect(page.getByRole("columnheader", { name: check.header })).toBeVisible();
      if (check.tab !== "Power Ratings") {
        await expect(page.getByText("2025 FINAL", { exact: false }).first()).toBeVisible();
      }
    }

    await page.getByRole("button", { name: "Offense" }).click();
    await page.getByPlaceholder("Search teams…").fill("Ohio State");
    const ohioPpg = page.locator('[data-team-id="osu"][data-metric-key="pointsPerGame"]');
    await expect(ohioPpg).toBeVisible();
    await expect(ohioPpg).not.toHaveText(/#/);
    await page.getByRole("button", { name: "ranks" }).click();
    await expect(ohioPpg).toHaveText(/^#\d+$/);
    const nationalRank = await ohioPpg.getAttribute("data-national-rank");
    expect(nationalRank).toBeTruthy();

    await page.getByLabel("Team field").selectOption("top25");
    await expect(ohioPpg).toHaveAttribute("data-national-rank", nationalRank!);
    await page.getByLabel("Team field").selectOption("conference");
    await page.getByLabel("Conference", { exact: true }).selectOption("big-ten");
    await expect(ohioPpg).toHaveAttribute("data-national-rank", nationalRank!);

    await page.getByPlaceholder("Search teams…").fill("");
    await page.getByLabel("Team field").selectOption("all");
    await expect(page.getByText("Showing 138 teams", { exact: false })).toBeVisible();
    await page.getByLabel("Team field").selectOption("top25");
    await expect(page.getByText("Showing 25 teams", { exact: false })).toBeVisible();
    await page.getByLabel("Team field").selectOption("conference");
    await page.getByLabel("Conference", { exact: true }).selectOption("sec");
    await expect(page.getByText(/Showing \d+ teams/)).toBeVisible();

    await page.getByLabel("Team A").selectOption({ label: "Georgia" });
    await page.getByLabel("Team B").selectOption({ label: "Alabama" });
    await page.getByRole("button", { name: "Compare" }).click();
    await expect(page.getByTestId("comparison-team-a")).toContainText("Georgia");
    await expect(page.getByTestId("comparison-team-b")).toContainText("Alabama");
    const comparison = page.getByRole("table", { name: "Team comparison" });
    for (const label of ["AP", "SOS Rem", "Pass Yds", "Rush Yds", "3D%"]) {
      await expect(comparison.getByRole("rowheader", { name: label, exact: true })).toBeVisible();
    }
    await expect(page.getByText("2025 FINAL", { exact: false }).first()).toBeVisible();

    const top25Shortcut = page.getByLabel("Top 25 matchups");
    const top25Options = await top25Shortcut.locator("option:not([disabled])").count();
    expect(top25Options).toBeGreaterThan(0);
    await top25Shortcut.selectOption({ index: 1 });
    const topAway = await page.getByLabel("Team A").inputValue();
    const topHome = await page.getByLabel("Team B").inputValue();
    expect(topAway).not.toBe(topHome);
    await expect(page.getByTestId("comparison-team-a")).toContainText(
      await page.getByLabel("Team A").locator("option:checked").textContent() ?? "",
    );

    await page.getByLabel("Quick matchup conference").selectOption("sec");
    const conferenceShortcut = page.getByLabel("Conference matchup");
    const conferenceOptions = await conferenceShortcut.locator("option:not([disabled])").count();
    expect(conferenceOptions).toBeGreaterThan(0);
    await conferenceShortcut.selectOption({ index: 1 });
    const conferenceAway = await page.getByLabel("Team A").inputValue();
    const conferenceHome = await page.getByLabel("Team B").inputValue();
    expect(conferenceAway).not.toBe(conferenceHome);
    await expect(page.getByTestId("comparison-team-b")).toContainText(
      await page.getByLabel("Team B").locator("option:checked").textContent() ?? "",
    );

    await page.getByRole("button", { name: "Offense" }).click();
    await page.getByRole("button", { name: "values" }).click();
    await page.getByLabel("Team field").selectOption("all");
    if (viewport.width === 390) {
      const overflow = await tableRegion.evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(overflow).toBeGreaterThan(100);
      const teamHeader = page.getByRole("columnheader", { name: "Team" });
      await tableRegion.evaluate((element) => { element.scrollLeft = 120; });
      const before = await teamHeader.boundingBox();
      await tableRegion.evaluate((element) => { element.scrollLeft = 360; });
      const after = await teamHeader.boundingBox();
      expect(before).not.toBeNull();
      expect(after).not.toBeNull();
      expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(2);
      await expect(page.getByRole("button", { name: "values" })).toBeVisible();
      await expect(page.getByRole("button", { name: "ranks" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Ohio State" })).toBeVisible();
    }

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    ).toBeLessThanOrEqual(1);
    await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`${viewport.width}.png`), fullPage: true });
  });
}
