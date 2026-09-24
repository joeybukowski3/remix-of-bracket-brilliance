import { expect, test } from "../playwright-fixture";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

for (const width of [768, 1150, 1440]) {
  test(`${width}px NFL navigation follows its responsive layout`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/nfl/standings`);

    const sidebar = page.locator('aside[aria-label="NFL platform navigation"]');
    const menu = page.getByRole("button", { name: "Open NFL menu" });
    await expect(page.getByRole("main")).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    if (width < 1280) {
      await expect(sidebar).toBeHidden();
      await expect(menu).toBeVisible();
      await menu.click();
      const drawer = page.getByRole("dialog");
      await expect(drawer.getByRole("link", { name: /Standings by Division/i })).toHaveAttribute("aria-current", "page");
      return;
    }

    await expect(sidebar).toBeVisible();
    await expect(menu).toBeHidden();
    await expect(sidebar.getByRole("link", { name: /Standings by Division/i })).toHaveAttribute("aria-current", "page");

    const layout = await page.evaluate(() => {
      const aside = document.querySelector<HTMLElement>('aside[aria-label="NFL platform navigation"]')!;
      const nav = aside.querySelector<HTMLElement>('nav[aria-label="NFL sitemap"]')!;
      const main = document.querySelector<HTMLElement>("main")!;
      const asideRect = aside.getBoundingClientRect();
      const mainRect = main.getBoundingClientRect();
      const sidebarElements = [aside, ...Array.from(aside.querySelectorAll("*")).filter((element): element is HTMLElement => element instanceof HTMLElement)];
      const innerWrappers = [aside, aside.firstElementChild, aside.firstElementChild?.firstElementChild, nav].map((element) => {
        const node = element as HTMLElement;
        const style = getComputedStyle(node);
        return {
          tag: node.tagName.toLowerCase(),
          className: node.className,
          overflowY: style.overflowY,
          position: style.position,
          maxHeight: style.maxHeight,
          scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight,
          bottom: node.getBoundingClientRect().bottom,
        };
      });
      const ancestors: Array<{ tag: string; className: string; overflowY: string; position: string; height: string; maxHeight: string; scrollHeight: number; clientHeight: number }> = [];
      for (let element: HTMLElement | null = aside; element; element = element.parentElement) {
        const style = getComputedStyle(element);
        ancestors.push({
          tag: element.tagName.toLowerCase(),
          className: element.className,
          overflowY: style.overflowY,
          position: style.position,
          height: style.height,
          maxHeight: style.maxHeight,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
        });
      }
      return {
        asideWidth: asideRect.width,
        besideMain: asideRect.right <= mainRect.left && Math.abs(asideRect.top - mainRect.top) < 1,
        scrollContainers: sidebarElements.filter((element) => ["auto", "scroll", "hidden"].includes(getComputedStyle(element).overflowY)).map((element) => element.tagName.toLowerCase()),
        innerWrappers,
        ancestors,
        navBottom: nav.getBoundingClientRect().bottom + window.scrollY,
        documentHeight: document.documentElement.scrollHeight,
      };
    });

    expect(layout.asideWidth).toBe(228);
    expect(layout.besideMain).toBe(true);
    expect(layout.scrollContainers).toEqual([]);
    expect(layout.innerWrappers.every((element) => element.scrollHeight === element.clientHeight && element.maxHeight === "none")).toBe(true);
    expect(layout.innerWrappers.at(-1)!.bottom).toBeLessThanOrEqual(layout.innerWrappers[2].bottom);
    expect(layout.ancestors[0].overflowY).toBe("visible");
    expect(layout.ancestors[0].scrollHeight).toBe(layout.ancestors[0].clientHeight);
    expect(layout.ancestors.slice(0, -2).every((element) => element.overflowY === "visible" && element.position !== "fixed" && element.position !== "sticky")).toBe(true);
    expect(layout.documentHeight).toBeGreaterThan(900);
    expect(layout.navBottom).toBeLessThanOrEqual(layout.documentHeight);

    const initialTop = await sidebar.evaluate((element) => element.getBoundingClientRect().top);
    await page.evaluate(() => window.scrollTo(0, 300));
    const movedTop = await sidebar.evaluate((element) => element.getBoundingClientRect().top);
    expect(movedTop).toBeCloseTo(initialTop - 300, 0);
    expect(await sidebar.evaluate((element) => element.scrollTop)).toBe(0);

    const lastLink = sidebar.getByRole("link", { name: /DFS Contest Analyzer/i });
    await lastLink.scrollIntoViewIfNeeded();
    await expect(lastLink).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });
}
