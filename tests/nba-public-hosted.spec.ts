import { expect, test } from "../playwright-fixture";
import { buildDemoBoard } from "../src/lib/nba/props/__fixtures__/boardDemo";
import { PUBLIC_TEXT, buildEnvelope, type HostedTier } from "../src/lib/nba/props/hosted/redact";

/**
 * The public NBA props page: it loads the published snapshot by itself, with no sign-in, and shows what the snapshot's tier
 * allows. /api/nba/props-board is mocked (no server, no database, no provider request). Run against the dev server:
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 npx playwright test tests/nba-public-hosted.spec.ts
 * Every figure is invented demo data; no analytics request is made.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080";
const API = "**/api/nba/props-board";
const VIEWPORTS = [
  { name: "320", width: 320, height: 700 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 900 },
  { name: "1280", width: 1280, height: 900 },
  { name: "1440", width: 1440, height: 900 },
] as const;

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString().replace(/\.\d{3}Z$/, "Z");

/** The response the server sends: the same projection it applies to a stored snapshot, plus the tier's public text. */
function snapshot(tier: HostedTier, opts: { publishedAtUtc?: string; lineCapturedAtUtc?: string } = {}) {
  const demo = { ...buildDemoBoard(), isSynthetic: false, privatePreview: { notice: "Local builder notice: do not publish", attribution: "local" } };
  const lineCapturedAtUtc = opts.lineCapturedAtUtc ?? iso(-30 * 60_000);
  demo.entries = demo.entries.map((entry) => (entry.line ? { ...entry, line: { ...entry.line, capturedAtUtc: lineCapturedAtUtc } } : entry));
  const { board } = buildEnvelope(demo, tier, opts.publishedAtUtc ?? iso(-20 * 60_000));
  return { tier, publishedAtUtc: opts.publishedAtUtc ?? iso(-20 * 60_000), attribution: PUBLIC_TEXT[tier].attribution, notice: PUBLIC_TEXT[tier].notice, board };
}
const serve = (page: import("@playwright/test").Page, body: unknown, status = 200) => page.route(API, (route) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }));

type Page = import("@playwright/test").Page;
const pageOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const mainRow = (page: Page, name: string) => page.getByRole("row", { name: new RegExp(name) }).first();
async function openRow(page: Page, name: string) {
  await page.getByRole("button", { name: new RegExp(`Show details and minutes for ${name}`) }).click();
  return mainRow(page, name).locator("xpath=following-sibling::tr[1]");
}

test.describe("loads by itself, with no sign-in", () => {
  test("a first-time visitor sees the board without any form, password field, cookie or credential", async ({ page, context }) => {
    const requests: Array<{ method: string; url: string; auth: boolean }> = [];
    page.on("request", (r) => requests.push({ method: r.method(), url: r.url(), auth: "authorization" in r.headers() || "cookie" in r.headers() }));
    await serve(page, snapshot("full"));
    await page.goto(`${BASE_URL}/nba/props`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("props-board-table")).toBeVisible();
    await expect(page.locator("input[type=password]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /sign in|sign out|log in/i })).toHaveCount(0);
    await expect(page.locator("input[type=file]")).toHaveCount(0);
    // The page and its API set no cookie of their own (third-party ad scripts elsewhere on the site are not ours).
    expect((await context.cookies()).filter((cookie) => new URL(BASE_URL).hostname.endsWith(cookie.domain.replace(/^\./, "")))).toEqual([]);
    const api = requests.filter((r) => r.url.includes("/api/nba/props-board"));
    expect(api.length).toBeGreaterThan(0);
    expect(api.every((r) => r.method === "GET" && !r.auth)).toBe(true);
    expect(requests.filter((r) => r.method !== "GET")).toEqual([]);
  });

  test("an empty snapshot shows a plain message, never a login", async ({ page }) => {
    await serve(page, { error: "no-snapshot" }, 404);
    await page.goto(`${BASE_URL}/nba/props`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "No NBA props to show yet" })).toBeVisible();
    await expect(page.getByText("No NBA props snapshot has been published yet.")).toBeVisible();
    await expect(page.locator("input[type=password]")).toHaveCount(0);
  });

  for (const status of [401, 500, 502]) {
    test(`a ${status} from the endpoint shows a plain message, never a login`, async ({ page }) => {
      await serve(page, { error: "x" }, status);
      await page.goto(`${BASE_URL}/nba/props`, { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: "No NBA props to show yet" })).toBeVisible();
      await expect(page.getByText("The NBA props board is not available right now.")).toBeVisible();
      await expect(page.locator("input[type=password]")).toHaveCount(0);
    });
  }
});

test.describe("what is public today: sportsbook lines only", () => {
  test("shows the lines, the lines-only notice and the Odds API credit, and nothing derived from the statistics source", async ({ page }) => {
    await serve(page, snapshot("lines-only"));
    await page.goto(`${BASE_URL}/nba/props`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("props-board-table")).toBeVisible();
    await expect(page.getByTestId("snapshot-notice")).toContainText("Showing sportsbook lines only");
    await expect(page.getByTestId("snapshot-attribution")).toHaveText("Sportsbook lines: The Odds API.");
    await expect(page.getByTestId("snapshot-status")).not.toContainText("Statistics retrieved");
    const content = await page.content();
    expect(content).not.toMatch(/hoopr|do not publish|private preview/i);
    await expect(page.getByTestId("col-line").first()).toBeVisible();
  });
});

test.describe("the complete board, when the snapshot carries it", () => {
  test("shows PTS/REB/AST, Vegas Line, JKB - Line, season stats, L5/L10, opponent L10, DvP and a local minutes override", async ({ page }) => {
    await serve(page, snapshot("full"));
    const writes: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET") writes.push(`${request.method()} ${request.url()}`);
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/nba/props`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("props-board-table")).toBeVisible();
    await expect(page.getByTestId("snapshot-attribution")).toContainText("hoopR");
    await expect(page.getByTestId("snapshot-attribution")).toContainText("The Odds API");
    await expect(page.getByTestId("snapshot-notice")).toHaveCount(0);

    for (const market of ["Points", "Rebounds", "Assists"]) {
      await page.getByRole("button", { name: market }).click();
      await expect(page.getByTestId("props-board-table")).toBeVisible();
    }
    await page.getByRole("button", { name: "Points" }).click();

    const heads = (await page.locator("thead th:visible").allTextContents()).map((h) => h.replace(/\s+/g, " ").trim());
    expect(heads[heads.indexOf("JKB proj") - 1]).toBe("Vegas Line");
    await page.getByTestId("columns-menu-trigger").click();
    await page.getByTestId("column-toggle-modelEdge").check();
    await page.keyboard.press("Escape");
    await expect(mainRow(page, "Demo Guard One").getByTestId("col-modelEdge")).toHaveText("+1.6");

    const detail = await openRow(page, "Demo Guard One");
    for (const id of ["mpg", "perGame", "perMinute", "last5", "last10", "oppLast10", "dvpAllowed", "line", "jkbMinutes"]) await expect(detail.getByTestId(`detail-${id}`)).toBeVisible();
    await detail.getByLabel(/Your projected minutes for Demo Guard One/).fill("36");
    await expect(detail.getByTestId("detail-adjustedProjection")).toContainText(((26.1 * 36) / 34).toFixed(1));
    await expect(mainRow(page, "Demo Guard One").getByTestId("override-chip")).toHaveText("36.0 min");
    await expect(mainRow(page, "Demo Guard One").getByTestId("col-jkbProjection")).toHaveText("26.1");

    await page.getByRole("tab", { name: "Defense vs. Position" }).click();
    await expect(page.getByRole("tab", { name: "Defense vs. Position" })).toHaveAttribute("aria-selected", "true");

    expect(writes).toEqual([]);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain("36");
  });
});

test.describe("freshness", () => {
  test("shows source timestamps and no warning when the snapshot and the odds are recent", async ({ page }) => {
    await serve(page, snapshot("full"));
    await page.goto(`${BASE_URL}/nba/props`, { waitUntil: "networkidle" });
    const status = page.getByTestId("snapshot-status");
    await expect(status).toHaveAttribute("data-stale", "false");
    await expect(status).toHaveAttribute("data-odds-stale", "false");
    await expect(status).not.toContainText("STALE");
    for (const label of ["Published", "Statistics retrieved", "Newest sportsbook line"]) await expect(status).toContainText(label);
    await expect(status).toContainText("30 min ago");
  });

  test("flags stale odds prominently when the lines were captured hours ago", async ({ page }) => {
    await serve(page, snapshot("full", { publishedAtUtc: iso(-20 * 60_000), lineCapturedAtUtc: iso(-9 * 3_600_000) }));
    await page.goto(`${BASE_URL}/nba/props`, { waitUntil: "networkidle" });
    const status = page.getByTestId("snapshot-status");
    await expect(status).toHaveAttribute("data-odds-stale", "true");
    await expect(status).toContainText("STALE ODDS");
    await expect(status).toContainText("may have moved");
    await expect(status).not.toContainText("STALE DATA");
  });

  test("flags a stale snapshot separately", async ({ page }) => {
    await serve(page, snapshot("full", { publishedAtUtc: iso(-30 * 3_600_000), lineCapturedAtUtc: iso(-30 * 60_000) }));
    await page.goto(`${BASE_URL}/nba/props`, { waitUntil: "networkidle" });
    const status = page.getByTestId("snapshot-status");
    await expect(status).toHaveAttribute("data-stale", "true");
    await expect(status).toContainText("STALE DATA");
    await expect(status).not.toContainText("STALE ODDS");
  });
});

test.describe("layout", () => {
  for (const tier of ["lines-only", "full"] as const) {
    for (const viewport of VIEWPORTS) {
      test(`${tier} board fits at ${viewport.name}px without sideways page scroll`, async ({ page }) => {
        await serve(page, snapshot(tier, { lineCapturedAtUtc: iso(-9 * 3_600_000) }));
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(`${BASE_URL}/nba/props`, { waitUntil: "networkidle" });
        await expect(page.getByTestId("props-board-table")).toBeVisible();
        await expect(page.getByTestId("snapshot-status")).toBeVisible();
        await expect.poll(() => pageOverflow(page)).toBeLessThanOrEqual(1);
      });
    }
  }

  test("on a 390px phone the full board's expanded row carries the detail and the minutes field", async ({ page }) => {
    await serve(page, snapshot("full"));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/nba/props`, { waitUntil: "networkidle" });
    const detail = await openRow(page, "Demo Guard One");
    for (const id of ["mpg", "last10", "oppLast10", "line", "jkbMinutes"]) await expect(detail.getByTestId(`detail-${id}`)).toBeVisible();
    const input = detail.getByLabel(/Your projected minutes for Demo Guard One/);
    await input.fill("34");
    await expect(detail.getByTestId("detail-adjustedProjection")).toBeVisible();
    await expect.poll(() => pageOverflow(page)).toBeLessThanOrEqual(1);
  });
});
