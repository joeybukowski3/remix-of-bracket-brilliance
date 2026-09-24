import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8089";
const route = "/nfl/tds-allowed-by-position";
const WIDTHS = [1440, 1150, 1024, 768, 430, 390, 375] as const;
const HEADERS = ["QB PASS", "QB RUSH", "RB RUSH", "RB REC", "WR REC", "TE REC"];

for (const width of WIDTHS) {
  test(`${width}px: six scoring-method columns fit with no page-level horizontal scroll`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}${route}`);
    await expect(page.getByRole("button", { name: "Sort by QB PASS" })).toBeVisible();

    // Header order + compact two-line labels.
    const sortLabels = await page.getByRole("button", { name: /^Sort by / }).evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label")));
    expect(sortLabels).toEqual(["Sort by Team", "Sort by Opp", ...HEADERS.map((label) => `Sort by ${label}`)]);
    for (const label of HEADERS) {
      const [line1, line2] = label.split(" ");
      const button = page.getByRole("button", { name: `Sort by ${label}` });
      await expect(button.getByText(line1, { exact: true })).toBeVisible();
      await expect(button.getByText(line2, { exact: true })).toBeVisible();
    }

    const metrics = () =>
      page.evaluate(() => {
        const doc = document.documentElement;
        const cells = Array.from(document.querySelectorAll("tbody tr:first-child td")) as HTMLElement[];
        const metricCells = cells.slice(2);
        return {
          pageScrollWidth: doc.scrollWidth,
          innerWidth: window.innerWidth,
          rows: document.querySelectorAll("tbody tr").length,
          metricCellCount: metricCells.length,
          maxRight: Math.max(...cells.map((cell) => cell.getBoundingClientRect().right)),
          overflowingCells: metricCells.filter((cell) => cell.scrollWidth > cell.clientWidth + 1).length,
          // Every header (including the frozen TEAM/OPP ones): the sort button's content must stay inside its column.
          headerOverflow: (Array.from(document.querySelectorAll("thead th")) as HTMLElement[]).filter((th) => (th.querySelector("button") as HTMLElement).scrollWidth > (th.querySelector("button") as HTMLElement).clientWidth + 1).length,
          heatCells: metricCells.filter((cell) => {
            const color = getComputedStyle(cell).backgroundColor;
            return color !== "rgba(0, 0, 0, 0)" && color !== "transparent";
          }).length,
        };
      });

    // Rank mode.
    const rank = await metrics();
    expect(rank.rows).toBe(32);
    expect(rank.metricCellCount).toBe(6);
    expect(rank.pageScrollWidth).toBeLessThanOrEqual(rank.innerWidth);
    expect(rank.maxRight).toBeLessThanOrEqual(rank.innerWidth);
    expect(rank.overflowingCells).toBe(0);
    expect(rank.headerOverflow).toBe(0);
    expect(rank.heatCells).toBe(6);
    await page.screenshot({ path: testInfo.outputPath(`tds-allowed-${width}-rank.png`) });

    // Raw mode ("total (rank)") is the widest cell content.
    await page.getByRole("button", { name: "Raw" }).click();
    const raw = await metrics();
    expect(raw.pageScrollWidth).toBeLessThanOrEqual(raw.innerWidth);
    expect(raw.overflowingCells).toBe(0);
    expect(raw.heatCells).toBe(6);
    await page.screenshot({ path: testInfo.outputPath(`tds-allowed-${width}-raw.png`) });
  });
}

test("sorting and sample filters still work on the split columns", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}${route}`);
  await expect(page.getByRole("button", { name: "Sort by WR REC" })).toBeVisible();

  const firstTeam = () => page.locator("tbody tr:first-child td:first-child").innerText();
  const initial = await firstTeam();
  await page.getByRole("button", { name: "Sort by WR REC" }).click();
  const ascending = await firstTeam();
  await page.getByRole("button", { name: "Sort by WR REC" }).click();
  const descending = await firstTeam();
  expect(new Set([initial, ascending, descending]).size).toBeGreaterThan(1);
  expect(ascending).not.toBe(descending);

  for (const sample of ["2025", "Last 5", "Last 8", "2026"]) {
    await page.getByRole("button", { name: sample, exact: true }).click();
    await expect(page.getByRole("button", { name: sample, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("tbody tr")).toHaveCount(32);
  }

  // Opponent column still displays "@ ABC" / "vs ABC".
  const opponentText = await page.locator("tbody tr:first-child td:nth-child(2)").innerText();
  expect(opponentText).toMatch(/^(@|vs) [A-Z]{2,3}$/i);
});
