// @vitest-environment node
// Lives in api/_lib (underscore-prefixed) on purpose: Vercel deploys every other file under api/ as a function.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { HOSTED_SNAPSHOT_SCHEMA, buildEnvelope } from "../../../src/lib/nba/props/hosted/redact";
import { buildDemoBoard } from "../../../src/lib/nba/props/__fixtures__/boardDemo";
import type { PropsBoardArtifact } from "../../../src/lib/nba/props/propsBoard";
import { createHandlers, type HandlerDeps } from "./handlers";
import { SESSION_COOKIE, createFailureLimiter, hashPassphrase, issueSessionToken, readAccessConfig, verifySessionToken } from "./session";
import { createSupabaseSnapshotStore, type SnapshotStore } from "./snapshotStore";

const PASSPHRASE = "correct horse battery staple 42";
const SESSION_SECRET = "s".repeat(48);
const HOST = "www.joeknowsball.com";
const URL_ = `https://${HOST}/api/nba/props-board`;
const T0 = Date.UTC(2026, 9, 29, 15, 0, 0);

let passwordHash = "";
beforeAll(async () => {
  passwordHash = await hashPassphrase(PASSPHRASE);
});

const boardWithStats = (): PropsBoardArtifact => ({
  ...buildDemoBoard(),
  isSynthetic: false,
  sources: { lines: ["the-odds-api"], dvp: "hoopr-espn", dvpUpdatedUtc: null },
  privatePreview: { notice: "Private.", attribution: "test" },
});

function memoryStore(initial: unknown | null): SnapshotStore & { reads: number } {
  const state = { value: initial, reads: 0 };
  return {
    get reads() {
      return state.reads;
    },
    read: async () => {
      state.reads += 1;
      return state.value;
    },
    write: async (value) => {
      state.value = value;
    },
  };
}

function setup(overrides: Partial<HandlerDeps> = {}, snapshot: unknown | null = buildEnvelope(boardWithStats(), "lines-only", "2026-10-29T14:00:00Z")) {
  let clock = T0;
  const store = memoryStore(snapshot);
  const errors: string[] = [];
  const deps: HandlerDeps = {
    env: { NBA_PRIVATE_PASSWORD_HASH: passwordHash, NBA_PRIVATE_SESSION_SECRET: SESSION_SECRET },
    store: () => store,
    now: () => clock,
    limiter: createFailureLimiter(),
    logError: (message) => void errors.push(message),
    ...overrides,
  };
  return { handlers: createHandlers(deps), store, errors, advance: (ms: number) => void (clock += ms), cookieAt: (offsetMs = 0) => `${SESSION_COOKIE}=${issueSessionToken(SESSION_SECRET, T0 + offsetMs)}` };
}

const get = (cookie?: string) => new Request(URL_, { headers: cookie ? { cookie } : {} });
const login = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(URL_, { method: "POST", headers: { "content-type": "application/json", origin: `https://${HOST}`, host: HOST, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("GET: unauthorized access", () => {
  it("answers 401 without touching the store when there is no cookie", async () => {
    const { handlers, store } = setup();
    const response = await handlers.GET(get());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(store.reads).toBe(0);
  });

  it.each([
    ["garbage token", `${SESSION_COOKIE}=not-a-token`],
    ["token signed with another secret", `${SESSION_COOKIE}=${issueSessionToken("x".repeat(48), T0)}`],
    ["token with a tampered payload", `${SESSION_COOKIE}=${Buffer.from(JSON.stringify({ v: 1, exp: 9_999_999_999 })).toString("base64url")}.${issueSessionToken(SESSION_SECRET, T0).split(".")[1]}`],
    ["right value under the wrong cookie name", `jkb-nba=${issueSessionToken(SESSION_SECRET, T0)}`],
  ])("rejects a %s", async (_name, cookie) => {
    const { handlers, store } = setup();
    expect((await handlers.GET(get(cookie))).status).toBe(401);
    expect(store.reads).toBe(0);
  });

  it("rejects an expired session", async () => {
    const { handlers, advance, cookieAt } = setup();
    const cookie = cookieAt();
    advance(8 * 24 * 60 * 60 * 1000);
    expect((await handlers.GET(get(cookie))).status).toBe(401);
  });

  it("fails closed with 503 to everyone, even a valid cookie, when configuration is missing or weak", async () => {
    for (const env of [{}, { NBA_PRIVATE_PASSWORD_HASH: passwordHash }, { NBA_PRIVATE_PASSWORD_HASH: passwordHash, NBA_PRIVATE_SESSION_SECRET: "short" }, { NBA_PRIVATE_PASSWORD_HASH: "plaintext-password", NBA_PRIVATE_SESSION_SECRET: SESSION_SECRET }]) {
      const { handlers, store, cookieAt } = setup({ env });
      expect((await handlers.GET(get(cookieAt()))).status).toBe(503);
      expect((await handlers.POST(login({ passphrase: PASSPHRASE }))).status).toBe(503);
      expect(store.reads).toBe(0);
    }
  });
});

describe("GET: authorized", () => {
  it("serves the stored board with private, non-cacheable, non-indexable headers", async () => {
    const { handlers, cookieAt } = setup();
    const response = await handlers.GET(get(cookieAt()));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("vary")).toContain("Cookie");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("set-cookie")).toBeNull();
    const body = (await response.json()) as { tier: string; board: PropsBoardArtifact };
    expect(body.tier).toBe("lines-only");
    expect(body.board.entries.length).toBeGreaterThan(0);
  });

  it("re-applies the tier on read: statistics in a lines-only row are never returned", async () => {
    const tampered = { schemaVersion: HOSTED_SNAPSHOT_SCHEMA, tier: "lines-only", publishedAtUtc: "2026-10-29T14:00:00Z", board: boardWithStats() };
    const { handlers, cookieAt } = setup({}, tampered);
    const body = (await (await handlers.GET(get(cookieAt()))).json()) as { board: PropsBoardArtifact };
    expect(body.board.dvpRows).toEqual([]);
    expect(body.board.opponentRecent).toBeUndefined();
    expect(body.board.entries.every((entry) => entry.projection === null && !("seasonStats" in entry))).toBe(true);
  });

  it("answers 404 when nothing was published, and 502 with a fixed body when the store fails or holds something invalid", async () => {
    const empty = setup({}, null);
    expect((await empty.handlers.GET(get(empty.cookieAt()))).status).toBe(404);

    const broken = setup({ store: () => ({ read: async () => { throw new Error("connect ECONNREFUSED db.internal:5432 password=hunter2"); }, write: async () => undefined }) });
    const failed = await broken.handlers.GET(get(broken.cookieAt()));
    expect(failed.status).toBe(502);
    expect(await failed.text()).toBe(JSON.stringify({ error: "store-error" }));
    expect(broken.errors).toEqual(["nba-private: snapshot store read failed"]);

    const invalid = setup({}, { schemaVersion: "something-else" });
    expect((await invalid.handlers.GET(get(invalid.cookieAt()))).status).toBe(502);
    expect(invalid.errors[0]).toBe("nba-private: stored snapshot failed validation");
  });
});

describe("POST: sign in", () => {
  it("rejects a wrong passphrase with 401 and no cookie", async () => {
    const { handlers } = setup();
    const response = await handlers.POST(login({ passphrase: "wrong passphrase value" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("accepts the right passphrase and sets a host-only, HttpOnly, Secure, SameSite=Strict session cookie that then opens GET", async () => {
    const { handlers } = setup();
    const response = await handlers.POST(login({ passphrase: PASSPHRASE }));
    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie.startsWith(`${SESSION_COOKIE}=`)).toBe(true);
    for (const attribute of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/", "Max-Age="]) expect(setCookie).toContain(attribute);
    expect(setCookie).not.toMatch(/Domain=/i);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect((await handlers.GET(get(setCookie.split(";")[0]))).status).toBe(200);
  });

  it("refuses cross-origin and origin-less requests before checking the passphrase", async () => {
    const { handlers } = setup();
    expect((await handlers.POST(login({ passphrase: PASSPHRASE }, { origin: "https://evil.example" }))).status).toBe(403);
    const noOrigin = new Request(URL_, { method: "POST", headers: { "content-type": "application/json", host: HOST }, body: JSON.stringify({ passphrase: PASSPHRASE }) });
    expect((await handlers.POST(noOrigin)).status).toBe(403);
    const sameSite = new Request(URL_, { method: "POST", headers: { "content-type": "application/json", host: HOST, "sec-fetch-site": "same-origin" }, body: JSON.stringify({ passphrase: PASSPHRASE }) });
    expect((await handlers.POST(sameSite)).status).toBe(200);
  });

  it("rejects malformed, oversized and non-JSON bodies", async () => {
    const { handlers } = setup();
    expect((await handlers.POST(login("{not json"))).status).toBe(400);
    expect((await handlers.POST(login({ passphrase: 12345 }))).status).toBe(400);
    expect((await handlers.POST(login({ passphrase: "x".repeat(5000) }))).status).toBe(400);
    expect((await handlers.POST(login({ passphrase: PASSPHRASE }, { "content-length": "999999" }))).status).toBe(400);
    expect((await handlers.POST(login({ passphrase: PASSPHRASE }, { "content-type": "text/plain" }))).status).toBe(400);
  });

  it("blocks a client after repeated failures, even when the next passphrase is right, and resets after success elsewhere", async () => {
    const { handlers, advance } = setup();
    for (let i = 0; i < 5; i += 1) expect((await handlers.POST(login({ passphrase: "wrong passphrase value" }, { "x-real-ip": "203.0.113.9" }))).status).toBe(401);
    const blocked = await handlers.POST(login({ passphrase: PASSPHRASE }, { "x-real-ip": "203.0.113.9" }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("set-cookie")).toBeNull();
    expect((await handlers.POST(login({ passphrase: PASSPHRASE }, { "x-real-ip": "198.51.100.2" }))).status).toBe(200);
    advance(16 * 60 * 1000);
    expect((await handlers.POST(login({ passphrase: PASSPHRASE }, { "x-real-ip": "203.0.113.9" }))).status).toBe(200);
  });
});

describe("DELETE: sign out", () => {
  it("clears the cookie for same-origin requests only", async () => {
    const { handlers } = setup();
    const out = await handlers.DELETE(new Request(URL_, { method: "DELETE", headers: { origin: `https://${HOST}`, host: HOST } }));
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");
    const cross = await handlers.DELETE(new Request(URL_, { method: "DELETE", headers: { origin: "https://evil.example", host: HOST } }));
    expect(cross.status).toBe(403);
  });
});

describe("no secret reaches a response", () => {
  it("never echoes the passphrase, hash or session secret in any status", async () => {
    const { handlers, cookieAt } = setup();
    const responses = [
      await handlers.GET(get()),
      await handlers.GET(get(cookieAt())),
      await handlers.POST(login({ passphrase: "wrong passphrase value" })),
      await handlers.POST(login({ passphrase: PASSPHRASE })),
      await handlers.POST(login("{bad")),
      await setup({ env: {} }).handlers.GET(get()),
    ];
    for (const response of responses) {
      const text = await response.text();
      for (const secret of [PASSPHRASE, passwordHash, SESSION_SECRET]) expect(text).not.toContain(secret);
    }
  });
});

describe("session primitives", () => {
  it("expires tokens exactly at their expiry and ignores extra token segments", () => {
    const token = issueSessionToken(SESSION_SECRET, T0, 60);
    expect(verifySessionToken(token, SESSION_SECRET, T0 + 59_000)).toBe(true);
    expect(verifySessionToken(token, SESSION_SECRET, T0 + 60_000)).toBe(false);
    expect(verifySessionToken(`${token}.extra`, SESSION_SECRET, T0)).toBe(false);
  });

  it("rejects configuration whose hash is not an scrypt hash", () => {
    expect(readAccessConfig({ NBA_PRIVATE_PASSWORD_HASH: "scrypt$only-two", NBA_PRIVATE_SESSION_SECRET: SESSION_SECRET })).toBeNull();
    expect(readAccessConfig({ NBA_PRIVATE_PASSWORD_HASH: passwordHash, NBA_PRIVATE_SESSION_SECRET: SESSION_SECRET })).not.toBeNull();
  });

  it("refuses to hash a short passphrase", async () => {
    await expect(hashPassphrase("short")).rejects.toThrow(/at least/);
  });
});

describe("Supabase snapshot store", () => {
  it("reads and writes only the service-role REST path for the single snapshot row", async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    const fetchAdmin = vi.fn(async (requestPath: string, init?: RequestInit) => {
      calls.push({ path: requestPath, init });
      return new Response(JSON.stringify([{ envelope: { ok: true } }]), { status: 200 });
    });
    const store = createSupabaseSnapshotStore(fetchAdmin);
    expect(await store.read()).toEqual({ ok: true });
    await store.write({ ok: true });
    expect(calls[0].path).toBe("/rest/v1/nba_private_snapshots?id=eq.current&select=envelope&limit=1");
    expect(calls[1].path).toBe("/rest/v1/nba_private_snapshots?on_conflict=id");
    expect(JSON.parse(String(calls[1].init?.body))).toMatchObject({ id: "current", envelope: { ok: true } });
  });

  it("treats an empty table as no snapshot and a failed request as an error", async () => {
    expect(await createSupabaseSnapshotStore(async () => new Response("[]", { status: 200 })).read()).toBeNull();
    await expect(createSupabaseSnapshotStore(async () => new Response("no", { status: 500 })).read()).rejects.toThrow(/failed/);
  });
});

describe("migration", () => {
  const sql = readFileSync(path.resolve(__dirname, "../../../supabase/migrations/20261029_nba_private_snapshots.sql"), "utf8");
  const statements = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").toLowerCase();

  it("enables row level security, defines no policy and revokes the browser roles", () => {
    expect(statements).toContain("enable row level security");
    expect(statements).not.toContain("create policy");
    expect(statements).toMatch(/revoke all on table public\.nba_private_snapshots from anon, authenticated/);
    expect(statements).not.toMatch(/grant /);
  });
});
