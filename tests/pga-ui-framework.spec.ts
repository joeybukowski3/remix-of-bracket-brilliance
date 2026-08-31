import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";
const viewports = [320, 768, 1024, 1440] as const;

async function expectNoPageOverflow(page: import("@playwright/test").Page) {
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )).toBeLessThanOrEqual(1);
}

test("PGA history and model tables contain overflow at framework viewports", async ({ page }, testInfo) => {
  test.setTimeout(120_000);

  for (const width of viewports) {
    await page.setViewportSize({ width, height: width < 1024 ? 844 : 1000 });
    await page.goto(`${baseUrl}/pga`);
    await expect(page.getByRole("heading", { name: "PGA Tournament Model" })).toBeVisible();
    await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
    await expectNoPageOverflow(page);

    if (width >= 1024) {
      const historyScroller = page.getByRole("region", { name: "PGA historical model rankings" });
      await expect(historyScroller).toBeVisible();
      await expect(historyScroller).toHaveAttribute("tabindex", "0");
    } else {
      await expect(page.getByRole("region", { name: "PGA historical model rankings" })).toBeHidden();
      await expect(page.locator("main article").first()).toBeVisible();
    }

    await page.screenshot({ path: testInfo.outputPath(`pga-history-${width}.png`), fullPage: true });

    await page.goto(`${baseUrl}/pga/rbc-heritage-2026-picks/model`);
    await expect(page.getByRole("heading", { name: "RBC Heritage 2026" })).toBeVisible();
    const modelScroller = page.getByRole("region", { name: "PGA model rankings" });
    await expect(modelScroller).toBeVisible();
    await expect(modelScroller).toHaveAttribute("tabindex", "0");
    await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
    await expectNoPageOverflow(page);

    const frozenGeometry = await modelScroller.evaluate((element) => {
      const firstRow = element.querySelector("tbody tr");
      const cells = firstRow?.querySelectorAll<HTMLElement>("td");
      if (!cells || cells.length < 2) return null;
      element.scrollLeft = Math.min(120, element.scrollWidth - element.clientWidth);
      const before = [cells[0].getBoundingClientRect().left, cells[1].getBoundingClientRect().left];
      element.scrollLeft = Math.min(240, element.scrollWidth - element.clientWidth);
      const after = [cells[0].getBoundingClientRect().left, cells[1].getBoundingClientRect().left];
      return {
        before: before.map(Math.round),
        after: after.map(Math.round),
        backgrounds: [getComputedStyle(cells[0]).backgroundColor, getComputedStyle(cells[1]).backgroundColor],
      };
    });
    expect(frozenGeometry).not.toBeNull();
    expect(frozenGeometry?.after).toEqual(frozenGeometry?.before);
    expect(frozenGeometry?.backgrounds.every((background) => background !== "rgba(0, 0, 0, 0)")).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`pga-model-${width}.png`), fullPage: true });
  }
});

test("PGA compact table keeps identity columns readable on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(`${baseUrl}/pga/custom`);
  await expect(page.getByText("Custom Model Builder", { exact: true })).toBeVisible();
  const scroller = page.getByRole("region", { name: "PGA compact rankings" });
  await expect(scroller).toBeVisible();
  await expect(scroller).toHaveAttribute("tabindex", "0");
  await expectNoPageOverflow(page);

  const positions = await scroller.evaluate((element) => {
    const cells = element.querySelectorAll<HTMLElement>("tbody tr:first-child td");
    const before = [cells[0].getBoundingClientRect().left, cells[1].getBoundingClientRect().left];
    element.scrollLeft = Math.min(240, element.scrollWidth - element.clientWidth);
    return {
      before: before.map(Math.round),
      after: [cells[0].getBoundingClientRect().left, cells[1].getBoundingClientRect().left].map(Math.round),
    };
  });
  expect(positions.after).toEqual(positions.before);
  await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("pga-compact-320.png"), fullPage: true });
});
