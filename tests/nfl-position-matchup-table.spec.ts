import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`matchup table alignment and sticky stack at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/nfl/fantasy-points-allowed?view=matchups`);
    const region = page.getByRole("region", { name: "Fantasy position matchup comparison" });
    await expect(region.locator("tbody tr").first()).toBeVisible();

    const geometry = await region.evaluate((scroller) => {
      const table = scroller.querySelector("table")!;
      const groups = [...table.querySelectorAll<HTMLTableCellElement>('thead th[scope="colgroup"]')];
      const subheaders = [...table.querySelectorAll<HTMLTableCellElement>('thead tr[data-header-row="sub"] th')];
      const rows = [...table.querySelectorAll<HTMLElement>("tbody tr")];
      const badges = [...table.querySelectorAll<HTMLElement>("tbody td span.whitespace-nowrap")];
      return {
        alignment: groups.map((group, index) => {
          const groupRect = group.getBoundingClientRect();
          const first = subheaders[index * 3].getBoundingClientRect();
          const last = subheaders[index * 3 + 2].getBoundingClientRect();
          return [groupRect.left - first.left, groupRect.right - last.right];
        }),
        rowHeights: rows.map((row) => row.getBoundingClientRect().height),
        badgeOverflow: badges.filter((badge) => badge.scrollWidth > badge.clientWidth + 1).slice(0, 3).map((badge) => ({ text: badge.textContent, scroll: badge.scrollWidth, client: badge.clientWidth, cell: badge.closest("td")?.getBoundingClientRect().width })),
        localOverflow: scroller.scrollWidth > scroller.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    for (const edges of geometry.alignment) for (const delta of edges) expect(Math.abs(delta)).toBeLessThanOrEqual(1);
    expect(Math.max(...geometry.rowHeights) - Math.min(...geometry.rowHeights)).toBeLessThanOrEqual(1);
    expect(geometry.badgeOverflow).toEqual([]);
    expect(geometry.pageOverflow).toBeLessThanOrEqual(1);
    if (viewport.width === 390) expect(geometry.localOverflow).toBe(true);

    await region.evaluate((scroller) => window.scrollTo(0, window.scrollY + scroller.getBoundingClientRect().top + 120));
    const clone = page.getByTestId("position-matchup-sticky-header");
    await expect(clone).toBeVisible();
    const stack = await clone.evaluate((element) => {
      const rows = [...element.querySelectorAll("thead tr")].map((row) => row.getBoundingClientRect());
      const siteBottom = document.querySelector("header")!.getBoundingClientRect().bottom;
      return { top: element.getBoundingClientRect().top, siteBottom, gap: rows[1].top - rows[0].bottom };
    });
    expect(Math.abs(stack.top - stack.siteBottom)).toBeLessThanOrEqual(1);
    expect(Math.abs(stack.gap)).toBeLessThanOrEqual(1);
    if (viewport.width === 390) {
      await region.evaluate((scroller) => { scroller.scrollLeft = 120; });
      await expect.poll(() => clone.locator("div").first().evaluate((element) => getComputedStyle(element).transform)).not.toBe("none");
    }
    const frozen = await page.evaluate(() => {
      const sticky = document.querySelector<HTMLElement>('[data-testid="position-matchup-sticky-header"]')!;
      const live = document.querySelector<HTMLElement>('[aria-label="Fantasy position matchup comparison"]')!;
      const fixedHeaders = [...sticky.querySelectorAll<HTMLElement>("thead tr:first-child th")].slice(0, 2);
      const bodyCells = [...live.querySelectorAll<HTMLElement>("tbody tr:first-child td")].slice(0, 2);
      const group = sticky.querySelector<HTMLElement>('th[data-position-group="qb"]')!;
      const sub = sticky.querySelector<HTMLElement>('tr[data-header-row="sub"] th')!;
      return {
        frozenOffsets: fixedHeaders.map((cell, index) => cell.getBoundingClientRect().left - bodyCells[index].getBoundingClientRect().left),
        dividerOffset: group.getBoundingClientRect().left - sub.getBoundingClientRect().left,
        dividerWidths: [group, sub, live.querySelector<HTMLElement>('tbody td[data-position-group="qb"]')!].map((cell) => getComputedStyle(cell).borderLeftWidth),
      };
    });
    for (const delta of [...frozen.frozenOffsets, frozen.dividerOffset]) expect(Math.abs(delta)).toBeLessThanOrEqual(1);
    expect(frozen.dividerWidths).toEqual(["2px", "2px", "2px"]);
  });
}
