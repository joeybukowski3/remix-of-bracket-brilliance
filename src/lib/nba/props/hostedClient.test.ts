import { describe, expect, it } from "vitest";
import { buildDemoBoard } from "./__fixtures__/boardDemo";
import { HOSTED_BOARD_URL, NO_SNAPSHOT_REASON, fetchHostedBoard, signIn, signOut } from "./hostedClient";

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
