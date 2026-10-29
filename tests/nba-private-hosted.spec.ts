import { expect, test } from "../playwright-fixture";
import { buildDemoBoard } from "../src/lib/nba/props/__fixtures__/boardDemo";

/**
 * Hosted private NBA board: the sign-in gate and the signed-in board, with /api/nba/props-board mocked (no server, no database,
 * no provider request). Run against the dev server:
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 npx playwright test tests/nba-private-hosted.spec.ts
 * Every figure is invented demo data; no analytics request is made.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080";
const API = "**/api/nba/props-board";
const PASSPHRASE = "a long invented passphrase";

const envelope = (tier: "full" | "lines-only") => ({
  tier,
  publishedAtUtc: "2026-10-29T14:00:00Z",
  board: { ...buildDemoBoard(), isSynthetic: false, privatePreview: { notice: "Private hosted board for the owner only.", attribution: "Invented demo figures" } },
});

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
  expect(await page.content()).not.toContain("Private hosted board for the owner only.");

  await page.getByLabel("Passphrase").fill("not the passphrase");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("That passphrase was not accepted.");
  await expect(page.getByTestId("props-board-table")).toHaveCount(0);

  await page.getByLabel("Passphrase").fill(PASSPHRASE);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("props-board-table")).toBeVisible();
  await expect(page.getByText("Private hosted board for the owner only.")).toBeVisible();

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
