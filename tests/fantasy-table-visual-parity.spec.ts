import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

async function expectNoPageOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectLightCellGrid(table: import("@playwright/test").Locator) {
  const grid = await table.evaluate((element) => {
    const header = element.querySelector("th");
    const cell = element.querySelector("tbody td");
    if (!header || !cell) return null;
    const headerStyle = getComputedStyle(header);
    const cellStyle = getComputedStyle(cell);
    return {
      background: getComputedStyle(element).backgroundColor,
      headerBottom: headerStyle.borderBottomWidth,
      headerRight: headerStyle.borderRightWidth,
      cellBottom: cellStyle.borderBottomWidth,
      cellRight: cellStyle.borderRightWidth,
    };
  });

  expect(grid).not.toBeNull();
  expect(grid?.headerBottom).toBe("1px");
  expect(grid?.headerRight).toBe("1px");
  expect(grid?.cellBottom).toBe("1px");
  expect(grid?.cellRight).toBe("1px");
}

test("Weekly rankings desktop uses the light fantasy grid without changing rank order", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/fantasy-football/weekly-rankings`);

  await expect(page.getByRole("heading", { name: "Weekly Fantasy Rankings" })).toBeVisible();
  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  await expect(table.locator('[data-team-logo="BUF"]').first()).toBeVisible();
  await expectLightCellGrid(table);

  const ranks = await table.locator("tbody > tr").evaluateAll((rows) =>
    rows.map((row) => Number(row.querySelector("td")?.textContent)).filter(Number.isFinite),
  );
  expect(ranks).toEqual(ranks.map((_, index) => index + 1));

  const firstPlayer = table.getByRole("button", { name: /^Show details for / }).first();
  await firstPlayer.click();
  await expect(table.getByText("Scoring environment:")).toBeVisible();
  await expect(table.getByText("Opponent matchup:")).toBeVisible();
  await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
  await expectNoPageOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("fantasy-weekly-desktop.png"), fullPage: true });
});

test("Weekly rankings mobile keeps the compact grid, logos and contained overflow", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/fantasy-football/weekly-rankings`);

  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  expect(await table.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(350);
  expect(await table.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(350);
  await expect(table.locator('[data-team-logo="BUF"]').first()).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Proj Pts" })).toBeVisible();
  await expectLightCellGrid(table);
  await table.getByRole("button", { name: /^Show details for / }).first().click();
  await expect(table.getByText("Final projected pts:")).toBeVisible();
  await expect(table.getByText("Confidence:")).toBeVisible();
  await expectNoPageOverflow(page);
  await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("fantasy-weekly-mobile.png"), fullPage: true });
});

test("ROS desktop and mobile use the same light bordered table language", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/fantasy-football`);

  await expect(page.getByRole("heading", { name: "2026 Rest-of-Season Rankings" })).toBeVisible();
  const overall = page.getByRole("region", { name: "Overall fantasy rankings" }).getByRole("table");
  await expect(overall.locator("[data-team-logo]").first()).toBeVisible();
  await expectLightCellGrid(overall);
  await expectNoPageOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("fantasy-ros-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("button", { name: "QB 31" }).click();
  const compact = page.getByRole("table");
  await expect(compact.locator('[data-team-logo="BUF"]').first()).toBeVisible();
  await expect(compact.getByRole("columnheader", { name: "PAR/G" })).toBeVisible();
  await expectLightCellGrid(compact);
  await expectNoPageOverflow(page);
  await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("fantasy-ros-mobile.png"), fullPage: true });
});
