import { describe, expect, it } from "vitest";
import { buildDemoBoard } from "./__fixtures__/boardDemo";
import { HOSTED_BOARD_URL, LINES_STALE_AFTER_HOURS, NO_SNAPSHOT_REASON, SNAPSHOT_STALE_AFTER_HOURS, fetchHostedBoard, signIn, signOut, snapshotFreshness } from "./hostedClient";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("fetchHostedBoard", () => {
  it("returns the board with its tier on 200 and sends same-origin credentials without caching", async () => {
    let init: RequestInit | undefined;
    const result = await fetchHostedBoard(async (_url, options) => {
      init = options;
      return json(200, { tier: "lines-only", publishedAtUtc: "2026-10-29T14:00:00Z", board: buildDemoBoard() });
    });
    expect(result.kind).toBe("ready");
    expect(init).toMatchObject({ credentials: "same-origin", cache: "no-store" });
  });

  it("maps 401 to login, a JSON 404 to a missing snapshot, 503 to unconfigured", async () => {
    expect(await fetchHostedBoard(async () => json(401, { error: "unauthorized" }))).toEqual({ kind: "login" });
    expect(await fetchHostedBoard(async () => json(404, { error: "no-snapshot" }))).toEqual({ kind: "empty", reason: NO_SNAPSHOT_REASON, snapshotMissing: true });
    expect(await fetchHostedBoard(async () => json(503, { error: "unavailable" }))).toMatchObject({ kind: "empty", snapshotMissing: false });
  });

  it("treats an HTML app shell, a network error and a malformed body as unavailable, never as a board", async () => {
    const shell = new Response("<!doctype html><html></html>", { status: 200, headers: { "content-type": "text/html" } });
    expect(await fetchHostedBoard(async () => shell)).toMatchObject({ kind: "empty", snapshotMissing: false });
    expect(await fetchHostedBoard(async () => new Response("<html></html>", { status: 404 }))).toMatchObject({ kind: "empty", snapshotMissing: false });
    expect(await fetchHostedBoard(async () => { throw new TypeError("offline"); })).toMatchObject({ kind: "empty" });
    expect(await fetchHostedBoard(async () => json(200, { tier: "everything", publishedAtUtc: "x", board: buildDemoBoard() }))).toMatchObject({ kind: "empty" });
    expect(await fetchHostedBoard(async () => json(200, { tier: "full", publishedAtUtc: "x", board: { schemaVersion: "nope" } }))).toMatchObject({ kind: "empty" });
  });
});

describe("signIn / signOut", () => {
  it("posts the passphrase as JSON to the one endpoint and reports failures without echoing it", async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    const ok = await signIn("a long passphrase value", async (url, init) => (seen.push({ url, init }), json(200, { ok: true })));
    expect(ok).toEqual({ ok: true });
    expect(seen[0].url).toBe(HOSTED_BOARD_URL);
    expect(seen[0].init).toMatchObject({ method: "POST", credentials: "same-origin" });
    const denied = await signIn("a long passphrase value", async () => json(401, { error: "unauthorized" }));
    expect(denied).toEqual({ ok: false, message: "That passphrase was not accepted." });
    expect(JSON.stringify(denied)).not.toContain("a long passphrase value");
    expect(await signIn("x", async () => json(429, {}))).toMatchObject({ ok: false, message: expect.stringMatching(/Too many/) });
  });

  it("sign-out issues a DELETE and swallows network errors", async () => {
    let method = "";
    await signOut(async (_url, init) => ((method = init?.method ?? ""), json(200, { ok: true })));
    expect(method).toBe("DELETE");
    await expect(signOut(async () => { throw new TypeError("offline"); })).resolves.toBeUndefined();
  });
});

describe("snapshotFreshness", () => {
  const NOW = Date.parse("2026-10-29T18:00:00Z");
  const withLines = (...captured: string[]) => {
    const board = buildDemoBoard();
    return { ...board, sources: { ...board.sources, dvpUpdatedUtc: "2026-10-28T12:00:00Z" }, entries: board.entries.map((entry, i) => ({ ...entry, line: captured[i] ? { sportsbook: "book", line: 10.5, overPrice: -110, underPrice: -110, capturedAtUtc: captured[i], freshness: "fresh" as const, ageMinutes: 1 } : null })) };
  };

  it("is fresh when the snapshot and the newest line are recent, and reports the newest capture across all entries", () => {
    const f = snapshotFreshness(withLines("2026-10-29T15:30:00Z", "2026-10-29T17:00:00Z", "2026-10-29T16:00:00Z"), "2026-10-29T17:30:00Z", NOW);
    expect(f.isStale).toBe(false);
    expect(f.newestLineCaptureUtc).toBe("2026-10-29T17:00:00Z");
    expect(f.statisticsRetrievedUtc).toBe("2026-10-28T12:00:00Z");
    expect(f.publishedAgeHours).toBeCloseTo(0.5);
  });

  it("flags an old snapshot and old lines separately, each with its reason", () => {
    const oldSnapshot = snapshotFreshness(withLines("2026-10-29T17:30:00Z"), "2026-10-29T04:00:00Z", NOW);
    expect(oldSnapshot.isStale).toBe(true);
    expect(oldSnapshot.staleReasons).toEqual([`published more than ${SNAPSHOT_STALE_AFTER_HOURS} hours ago`]);
    const oldLines = snapshotFreshness(withLines("2026-10-29T10:00:00Z"), "2026-10-29T17:50:00Z", NOW);
    expect(oldLines.staleReasons).toEqual([`sportsbook lines captured more than ${LINES_STALE_AFTER_HOURS} hours ago`]);
    expect(snapshotFreshness(withLines("2026-10-28T10:00:00Z"), "2026-10-28T10:30:00Z", NOW).staleReasons).toHaveLength(2);
  });

  it("does not call a board without lines stale for that reason, and never reports a negative age", () => {
    const f = snapshotFreshness(withLines(), "2026-10-29T19:00:00Z", NOW);
    expect(f.newestLineCaptureUtc).toBeNull();
    expect(f.lineAgeHours).toBeNull();
    expect(f.publishedAgeHours).toBe(0);
    expect(f.isStale).toBe(false);
  });
});
