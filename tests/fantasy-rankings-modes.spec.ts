import { expect, test } from "../playwright-fixture";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

test("Fantasy defaults to the mobile weekly research board without overflow or a metric selector", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/fantasy-football`);

  await expect(page.getByRole("heading", { level: 1, name: "Weekly Fantasy Rankings" })).toBeVisible();
  await expect(page.getByRole("region", { name: "QB weekly fantasy research board" })).toBeVisible();
  await expect(page.getByText("Season PPG", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Trenches", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Weekly Rankings" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Rest of Season" })).toHaveAttribute("href", "/fantasy-football?view=ros");
  await expect(page.getByRole("button", { name: "How JKB Projections Work" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.screenshot({ path: testInfo.outputPath("weekly-mobile.png"), fullPage: true });
});

test("rest-of-season Legacy mobile is compact and retains expanded detail", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/fantasy-football?view=ros`);

  await expect(page.getByRole("heading", { level: 1, name: "2026 Rest-of-Season Rankings" })).toBeVisible();
  await page.getByRole("button", { name: "RB 85" }).click();
  await page.getByRole("button", { name: "Legacy board" }).click();
  await expect(page.getByRole("columnheader", { name: "Proj" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "AVG" })).toBeVisible();
  await page.getByRole("button", { name: "Show details for Jahmyr Gibbs" }).click();
  await expect(page.getByText("Touches Rk", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.screenshot({ path: testInfo.outputPath("ros-legacy-mobile.png"), fullPage: true });
});

test("desktop weekly rankings and NFL command center consume the synchronized artifact", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${BASE_URL}/fantasy-football/weekly-rankings?week=1`);
  await expect(page.getByRole("heading", { level: 1, name: "Weekly Fantasy Rankings" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  for (const header of ["RK", "PLAYER", "PROJ. PTS", "SEASON PPG", "L5 PPG", "MATCHUP GRADE", "OPP FPA SEASON", "OPP FPA L5", "TRENCHES", "EPA ADV.", "SUCCESS ADV."]) {
    await expect(page.getByRole("columnheader", { name: header })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Rest of Season" })).toHaveAttribute("href", "/fantasy-football?view=ros");
  await page.screenshot({ path: testInfo.outputPath("weekly-desktop.png"), fullPage: true });

  await page.goto(`${BASE_URL}/nfl?week=1`);
  await expect(page.getByRole("heading", { name: "Top Fantasy Picks — Week 1" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View full rankings" })).toHaveAttribute("href", "/fantasy-football/weekly-rankings?week=1");
  await page.screenshot({ path: testInfo.outputPath("nfl-command-center-desktop.png"), fullPage: true });
});

test("weekly research boards hold their position semantics across desktop and mobile", async ({ page }, testInfo) => {
  const positions = [
    { position: "QB", evidence: [] },
    { position: "RB", evidence: ["TOUCHES RK", "RZ TOUCHES RK", "YPC RK", "REC TARGETS RK"] },
    { position: "WR", evidence: ["TARGET % RK", "AIR YARDS RK", "TARGETS/G RK"] },
    { position: "TE", evidence: ["TARGET % RK", "AIR YARDS RK", "TARGETS/G RK"] },
  ] as const;

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${BASE_URL}/fantasy-football/weekly-rankings?week=1`);

  for (const { position, evidence } of positions) {
    await page.getByRole("button", { name: position, exact: true }).click();
    await expect(page.getByRole("region", { name: `${position} weekly fantasy research board` })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    for (const header of evidence) {
      await expect(page.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
    }
    await page.getByRole("button", { name: /Show details for/ }).first().click();
    await expect(page.getByText("Underlying matchup components", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`weekly-${position.toLowerCase()}-desktop.png`) });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/fantasy-football/weekly-rankings?week=1`);

  for (const { position } of positions) {
    await page.getByRole("button", { name: position, exact: true }).click();
    await expect(page.getByRole("region", { name: `${position} weekly fantasy research board` })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByText("Season PPG", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("FPA Season", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Success Adv", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: /Show details for/ }).first().click();
    await expect(page.getByText("Underlying matchup components", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`weekly-${position.toLowerCase()}-mobile.png`) });
  }
});

test("missing weekly artifact is explicit and never substitutes another week", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/fantasy-football/weekly-rankings?week=2`);
  await expect(page.getByRole("heading", { name: "Week 2 rankings are not available yet" })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("weekly-missing-mobile.png"), fullPage: true });
});

test("NFL command center remains usable at mobile width", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/nfl?week=1`);
  await expect(page.getByRole("heading", { name: "Top Fantasy Picks — Week 1" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Select NFL week" })).toHaveValue("1");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("nfl-command-center-mobile.png"), fullPage: true });
});
