import { expect, test } from "../playwright-fixture";
import { buildDemoBoard } from "../src/lib/nba/props/__fixtures__/boardDemo";
import { buildEnvelope } from "../src/lib/nba/props/hosted/redact";

/**
 * Hosted private NBA board: the sign-in gate and the signed-in board, with /api/nba/props-board mocked (no server, no database,
 * no provider request). Run against the dev server:
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 npx playwright test tests/nba-private-hosted.spec.ts
 * Every figure is invented demo data; no analytics request is made.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080";
const API = "**/api/nba/props-board";
const PASSPHRASE = "a long invented passphrase";

/** The same projection the server applies before storing and serving a snapshot. */
const envelope = (tier: "full" | "lines-only", publishedAtUtc = "2026-10-29T14:00:00Z") => {
  const board = { ...buildDemoBoard(), isSynthetic: false, privatePreview: { notice: "Local builder notice.", attribution: "Invented demo figures" } };
  const { board: projected } = buildEnvelope(board, tier, publishedAtUtc);
  return { tier, publishedAtUtc, board: projected };
};

test("an anonymous visitor sees only the sign-in form, and the board appears after signing in", async ({ page }) => {
  let signedIn = false;
  const requests: string[] = [];
  await page.route(API, async (route) => {
    const method = route.request().method();
    requests.push(method);
    if (method === "POST") {
      const posted = route.request().postDataJSON() as { passphrase?: string };
      signedIn = posted.passphrase === PASSPHRASE;
      return route.fulfill({ status: signedIn ? 200 : 401, contentType: "application/json", body: JSON.stringify(signedIn ? { ok: true } : { error: "unauthorized" }) });
    }
    if (method === "DELETE") {
      signedIn = false;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
    return signedIn
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(envelope("full")) })
      : route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "unauthorized" }) });
  });

  await page.goto(`${BASE_URL}/nba/props`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Private NBA board" })).toBeVisible();
  await expect(page.getByTestId("props-board-table")).toHaveCount(0);
  expect(await page.content()).not.toContain("Private hosted board for the owner only");

  await page.getByLabel("Passphrase").fill("not the passphrase");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("That passphrase was not accepted.");
  await expect(page.getByTestId("props-board-table")).toHaveCount(0);

  await page.getByLabel("Passphrase").fill(PASSPHRASE);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("props-board-table")).toBeVisible();
  await expect(page.getByText("Private hosted board for the owner only").first()).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Private NBA board" })).toBeVisible();
  expect(requests).toContain("DELETE");
});

test("a lines-only snapshot renders without statistics instead of failing", async ({ page }) => {
  const lineOnly = envelope("lines-only");
  lineOnly.board.entries = lineOnly.board.entries.slice(0, 3).map((entry) => ({ ...entry, projection: null, projectionUnavailableReason: "Withheld from the hosted board: the statistics source is not cleared for hosting.", positionLabel: null }));
  lineOnly.board.dvpRows = [];
  delete (lineOnly.board as { opponentRecent?: unknown }).opponentRecent;
  delete (lineOnly.board as { opponentBoxScores?: unknown }).opponentBoxScores;
  await page.route(API, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(lineOnly) }));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(`${BASE_URL}/nba/props`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("props-board-table")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a deployment without private access shows the plain empty state", async ({ page }) => {
  await page.route(API, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) }));
  await page.goto(`${BASE_URL}/nba/props`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "No NBA props to show yet" })).toBeVisible();
  await expect(page.getByLabel("Passphrase")).toHaveCount(0);
});

type Page = import("@playwright/test").Page;
const mainRow = (page: Page, name: string) => page.getByRole("row", { name: new RegExp(name) }).first();
async function openRow(page: Page, name: string) {
  await page.getByRole("button", { name: new RegExp(`Show details and minutes for ${name}`) }).click();
  return mainRow(page, name).locator("xpath=following-sibling::tr[1]");
}
const fullAt = (publishedAtUtc: string) => (page: Page) => page.route(API, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(envelope("full", publishedAtUtc)) }));

test.describe("the full hosted board", () => {
  test("loads with no manual file, shows the line comparison and detail tables, and applies a minutes override locally", async ({ page }) => {
    await fullAt(new Date().toISOString().replace(/\.\d{3}Z$/, "Z"))(page);
    const writes: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET") writes.push(`${request.method()} ${request.url()}`);
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/nba/props`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("props-board-table")).toBeVisible();
    await expect(page.getByText("Private hosted board for the owner only", { exact: false })).toBeVisible();
    await expect(page.getByText("no ESPN or SportsDataverse license", { exact: false })).toBeVisible();
    await expect(page.locator("input[type=file]")).toHaveCount(0);

    // Vegas Line sits directly before the projection; JKB - Line is a column choice.
    const heads = (await page.locator("thead th:visible").allTextContents()).map((h) => h.replace(/\s+/g, " ").trim());
    expect(heads[heads.indexOf("JKB proj") - 1]).toBe("Vegas Line");
    await page.getByTestId("columns-menu-trigger").click();
    await page.getByTestId("column-toggle-modelEdge").check();
    await page.keyboard.press("Escape");
    await expect(mainRow(page, "Demo Guard One").getByTestId("col-modelEdge")).toHaveText("+1.6");

    // Detail: player L5/L10 and opponent L10, DvP, season stats, and the minutes override with its adjusted comparison.
    const detail = await openRow(page, "Demo Guard One");
    for (const id of ["mpg", "perGame", "perMinute", "last5", "last10", "oppLast10", "dvpAllowed", "line", "jkbMinutes"]) await expect(detail.getByTestId(`detail-${id}`)).toBeVisible();
    const input = detail.getByLabel(/Your projected minutes for Demo Guard One/);
    await input.fill("36");
    await expect(detail.getByTestId("detail-adjustedProjection")).toContainText(((26.1 * 36) / 34).toFixed(1));
    await expect(mainRow(page, "Demo Guard One").getByTestId("override-chip")).toHaveText("36.0 min");
    // JKB's own projection is never changed by the override.
    await expect(mainRow(page, "Demo Guard One").getByTestId("col-jkbProjection")).toHaveText("26.1");

    // Defense vs. Position tab renders from the hosted board.
    await page.getByRole("tab", { name: "Defense vs. Position" }).click();
    await expect(page.getByRole("tab", { name: "Defense vs. Position" })).toHaveAttribute("aria-selected", "true");

    // The override stayed in the page: nothing was written to a server or to storage.
    expect(writes).toEqual([]);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain("36");
  });

  test("shows source timestamps and no warning for a fresh snapshot", async ({ page }) => {
    const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString().replace(/\.\d{3}Z$/, "Z");
    const body = envelope("full", iso(-20 * 60_000));
    body.board.entries = body.board.entries.map((entry) => (entry.line ? { ...entry, line: { ...entry.line, capturedAtUtc: iso(-30 * 60_000) } } : entry));
    await page.route(API, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }));
    await page.goto(`${BASE_URL}/nba/props`, { waitUntil: "networkidle" });
    const status = page.getByTestId("snapshot-status");
    await expect(status).toHaveAttribute("data-stale", "false");
    await expect(status).not.toContainText("STALE");
    await expect(status).toContainText("Published");
    await expect(status).toContainText("Statistics retrieved");
    await expect(status).toContainText("Newest sportsbook line");
    await expect(status).toContainText("30 min ago");
  });

  test("flags a stale snapshot prominently", async ({ page }) => {
    await fullAt("2026-10-27T12:00:00Z")(page);
    await page.goto(`${BASE_URL}/nba/props`, { waitUntil: "networkidle" });
    const status = page.getByTestId("snapshot-status");
    await expect(status).toHaveAttribute("data-stale", "true");
    await expect(status).toContainText("STALE SNAPSHOT");
    await expect(status).toContainText("published more than 12 hours ago");
  });
});
