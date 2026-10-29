import { describe, expect, it } from "vitest";
import { buildDemoBoard } from "./__fixtures__/boardDemo";
import { HOSTED_BOARD_URL, LINES_STALE_AFTER_HOURS, NO_SNAPSHOT_REASON, SNAPSHOT_STALE_AFTER_HOURS, fetchHostedBoard, snapshotFreshness } from "./hostedClient";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const snapshot = { tier: "lines-only", publishedAtUtc: "2026-10-29T14:00:00Z", attribution: "Sportsbook lines: The Odds API.", notice: "Showing sportsbook lines only.", board: buildDemoBoard() };

describe("fetchHostedBoard", () => {
  it("returns the board, tier, attribution and notice on 200 with a plain GET: no credentials, no body, no custom cache mode", async () => {
    let seen: { url: string; init?: RequestInit } | undefined;
    const result = await fetchHostedBoard(async (url, init) => ((seen = { url, init }), json(200, snapshot)));
    expect(result).toMatchObject({ kind: "ready", tier: "lines-only", attribution: "Sportsbook lines: The Odds API.", notice: "Showing sportsbook lines only." });
    expect(seen?.url).toBe(HOSTED_BOARD_URL);
    expect(seen?.init?.method).toBeUndefined();
    expect(seen?.init?.body).toBeUndefined();
    expect(seen?.init?.credentials).toBeUndefined();
    expect(seen?.init?.cache).toBeUndefined();
  });

  it("accepts a full snapshot with no notice", async () => {
    const result = await fetchHostedBoard(async () => json(200, { ...snapshot, tier: "full", notice: null }));
    expect(result).toMatchObject({ kind: "ready", tier: "full", notice: null });
  });

  it("maps a JSON 404 to a missing snapshot and every other failure to unavailable", async () => {
    expect(await fetchHostedBoard(async () => json(404, { error: "no-snapshot" }))).toEqual({ kind: "empty", reason: NO_SNAPSHOT_REASON, snapshotMissing: true });
    for (const status of [401, 403, 429, 500, 502, 503]) expect(await fetchHostedBoard(async () => json(status, { error: "x" })), String(status)).toMatchObject({ kind: "empty", snapshotMissing: false });
  });

  it("treats an HTML app shell, a network error and a malformed body as unavailable, never as a board", async () => {
    const shell = new Response("<!doctype html><html></html>", { status: 200, headers: { "content-type": "text/html" } });
    expect(await fetchHostedBoard(async () => shell)).toMatchObject({ kind: "empty", snapshotMissing: false });
    expect(await fetchHostedBoard(async () => new Response("<html></html>", { status: 404 }))).toMatchObject({ kind: "empty", snapshotMissing: false });
    expect(await fetchHostedBoard(async () => { throw new TypeError("offline"); })).toMatchObject({ kind: "empty" });
    expect(await fetchHostedBoard(async () => json(200, { ...snapshot, tier: "everything" }))).toMatchObject({ kind: "empty" });
    expect(await fetchHostedBoard(async () => json(200, { ...snapshot, attribution: undefined }))).toMatchObject({ kind: "empty" });
    expect(await fetchHostedBoard(async () => json(200, { ...snapshot, board: { schemaVersion: "nope" } }))).toMatchObject({ kind: "empty" });
  });

  it("no longer exposes any sign-in, sign-out or credential handling", async () => {
    const client = await import("./hostedClient");
    expect(Object.keys(client).filter((name) => /sign|login|passphrase|password|session/i.test(name))).toEqual([]);
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
    expect(f.linesStale).toBe(false);
    expect(f.snapshotStale).toBe(false);
    expect(f.newestLineCaptureUtc).toBe("2026-10-29T17:00:00Z");
    expect(f.statisticsRetrievedUtc).toBe("2026-10-28T12:00:00Z");
    expect(f.publishedAgeHours).toBeCloseTo(0.5);
  });

  it("flags an old snapshot and old lines separately, each with its reason", () => {
    const oldSnapshot = snapshotFreshness(withLines("2026-10-29T17:30:00Z"), "2026-10-29T04:00:00Z", NOW);
    expect(oldSnapshot.isStale).toBe(true);
    expect(oldSnapshot.staleReasons).toEqual([`published more than ${SNAPSHOT_STALE_AFTER_HOURS} hours ago`]);
    expect([oldSnapshot.snapshotStale, oldSnapshot.linesStale]).toEqual([true, false]);
    const oldLines = snapshotFreshness(withLines("2026-10-29T10:00:00Z"), "2026-10-29T17:50:00Z", NOW);
    expect(oldLines.staleReasons).toEqual([`sportsbook lines captured more than ${LINES_STALE_AFTER_HOURS} hours ago`]);
    expect([oldLines.snapshotStale, oldLines.linesStale]).toEqual([false, true]);
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
