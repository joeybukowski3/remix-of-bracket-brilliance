// @vitest-environment node
// Lives in api/_lib (underscore-prefixed) on purpose: Vercel deploys every other file under api/ as a function.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { HOSTED_SNAPSHOT_SCHEMA, buildEnvelope } from "../../../src/lib/nba/props/hosted/redact";
import { buildDemoBoard } from "../../../src/lib/nba/props/__fixtures__/boardDemo";
import type { PropsBoardArtifact } from "../../../src/lib/nba/props/propsBoard";
import { PUBLIC_CACHE_CONTROL, SNAPSHOT_MEMORY_TTL_MS, createHandlers, type HandlerDeps } from "./handlers";
import { SnapshotStoreError, createSupabaseSnapshotStore, type SnapshotStore } from "./snapshotStore";

const URL_ = "https://www.joeknowsball.com/api/nba/props-board";
const T0 = Date.UTC(2026, 9, 29, 15, 0, 0);

const boardWithStats = (): PropsBoardArtifact => ({
  ...buildDemoBoard(),
  isSynthetic: false,
  sources: { lines: ["the-odds-api"], dvp: "hoopr-espn", dvpUpdatedUtc: null },
  privatePreview: { notice: "Local builder notice: do not publish", attribution: "local" },
});

function memoryStore(initial: unknown | null): SnapshotStore & { reads: () => number; set: (value: unknown | null) => void } {
  const state = { value: initial, reads: 0 };
  return {
    reads: () => state.reads,
    set: (value) => void (state.value = value),
    read: async () => {
      state.reads += 1;
      return state.value;
    },
    write: async (value) => void (state.value = value),
  };
}

function setup(snapshot: unknown | null = buildEnvelope(boardWithStats(), "lines-only", "2026-10-29T14:00:00Z"), overrides: Partial<HandlerDeps> = {}) {
  let clock = T0;
  const store = memoryStore(snapshot);
  const errors: string[] = [];
  const handlers = createHandlers({ store: () => store, now: () => clock, logError: (message) => void errors.push(message), ...overrides });
  return { handlers, store, errors, advance: (ms: number) => void (clock += ms) };
}

describe("GET: public and unauthenticated", () => {
  it("serves the snapshot to anyone: no cookie, header or token is needed or looked at", async () => {
    const { handlers } = setup();
    const response = await handlers.GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { tier: string; publishedAtUtc: string; attribution: string; notice: string | null; board: PropsBoardArtifact };
    expect(body.tier).toBe("lines-only");
    expect(body.publishedAtUtc).toBe("2026-10-29T14:00:00Z");
    expect(body.attribution).toBe("Sportsbook lines: The Odds API.");
    expect(body.notice).toMatch(/lines only/i);
    expect(body.board.entries.length).toBeGreaterThan(0);
  });

  it("takes no request input at all, so nothing a caller sends can change what is read", () => {
    const { handlers } = setup();
    expect(handlers.GET.length).toBe(0);
    expect(Object.keys(handlers)).toEqual(["GET"]);
  });

  it("carries no login, session or cookie machinery", () => {
    const sources = ["handlers.ts", "snapshotStore.ts", "../../nba/props-board.ts"].map((file) => readFileSync(path.resolve(__dirname, file), "utf8")).join("\n");
    expect(sources).not.toMatch(/Set-Cookie|passphrase|scrypt|NBA_PRIVATE|SESSION|password/i);
  });
});

describe("GET: caching", () => {
  it("is cacheable by the CDN and revalidated by browsers, never indexed", async () => {
    const { handlers } = setup();
    const response = await handlers.GET();
    expect(response.headers.get("cache-control")).toBe(PUBLIC_CACHE_CONTROL);
    expect(PUBLIC_CACHE_CONTROL).toMatch(/s-maxage=\d+/);
    expect(PUBLIC_CACHE_CONTROL).toMatch(/stale-while-revalidate=\d+/);
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("reads the snapshot row once per window however many page views arrive, then again after the window", async () => {
    const { handlers, store, advance } = setup();
    for (let i = 0; i < 25; i += 1) expect((await handlers.GET()).status).toBe(200);
    expect(store.reads()).toBe(1);
    advance(SNAPSHOT_MEMORY_TTL_MS + 1);
    await handlers.GET();
    expect(store.reads()).toBe(2);
  });

  it("serves a newly published snapshot after the window", async () => {
    const { handlers, store, advance } = setup();
    expect(((await (await handlers.GET()).json()) as { publishedAtUtc: string }).publishedAtUtc).toBe("2026-10-29T14:00:00Z");
    store.set(buildEnvelope(boardWithStats(), "lines-only", "2026-10-29T16:00:00Z"));
    advance(SNAPSHOT_MEMORY_TTL_MS + 1);
    expect(((await (await handlers.GET()).json()) as { publishedAtUtc: string }).publishedAtUtc).toBe("2026-10-29T16:00:00Z");
  });

  it("never lets an error or an empty state be cached", async () => {
    const empty = setup(null);
    const missing = await empty.handlers.GET();
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store, max-age=0");
    const broken = setup(null, { store: () => ({ read: async () => { throw new Error("connect ECONNREFUSED db.internal:5432 password=hunter2"); }, write: async () => undefined }) });
    const failed = await broken.handlers.GET();
    expect(failed.status).toBe(502);
    expect(failed.headers.get("cache-control")).toBe("no-store, max-age=0");
  });
});

describe("GET: restricted fields stay out of public responses", () => {
  it("re-applies the stored tier on read: statistics in a lines-only row are never returned", async () => {
    const tampered = { schemaVersion: HOSTED_SNAPSHOT_SCHEMA, tier: "lines-only", publishedAtUtc: "2026-10-29T14:00:00Z", board: boardWithStats() };
    const { handlers } = setup(tampered);
    const text = await (await handlers.GET()).text();
    const body = JSON.parse(text) as { board: PropsBoardArtifact };
    expect(body.board.dvpRows).toEqual([]);
    expect(body.board.opponentRecent).toBeUndefined();
    expect(body.board.entries.every((entry) => entry.projection === null && !("seasonStats" in entry))).toBe(true);
    expect(text).not.toContain("hoopr-espn");
    expect(text).not.toMatch(/do not publish|privatePreview/);
  });

  it("drops the builder's private notice even from a full row", async () => {
    const { handlers } = setup({ schemaVersion: HOSTED_SNAPSHOT_SCHEMA, tier: "full", publishedAtUtc: "2026-10-29T14:00:00Z", board: boardWithStats() });
    const text = await (await handlers.GET()).text();
    expect(text).not.toMatch(/do not publish|privatePreview/);
    expect((JSON.parse(text) as { notice: string | null }).notice).toBeNull();
  });

  it("refuses a foreign, malformed or unknown-tier row with a fixed body and logs only a fixed message", async () => {
    for (const raw of [{ schemaVersion: "something-else" }, "text", { schemaVersion: HOSTED_SNAPSHOT_SCHEMA, tier: "everything", publishedAtUtc: "2026-10-29T14:00:00Z", board: boardWithStats() }]) {
      const { handlers, errors } = setup(raw);
      const response = await handlers.GET();
      expect(response.status).toBe(502);
      expect(await response.text()).toBe(JSON.stringify({ error: "store-error" }));
      expect(errors).toEqual(["nba-board: stored snapshot failed validation"]);
    }
  });

  it("answers store failures with a fixed body that leaks no connection detail", async () => {
    const { handlers, errors } = setup(null, { store: () => ({ read: async () => { throw new Error("connect ECONNREFUSED db.internal:5432 password=hunter2 key=FAKE_KEY_FOR_TEST"); }, write: async () => undefined }) });
    const response = await handlers.GET();
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(text).toBe(JSON.stringify({ error: "store-error" }));
    expect(errors).toEqual(["nba-board: snapshot store read failed (category=unclassified)"]);
    expect(text + errors.join("")).not.toMatch(/hunter2|FAKE_KEY|ECONNREFUSED/);
  });

  it("logs the HTTP status and code of a classified store failure, never the body", async () => {
    const { handlers, errors } = setup(null, { store: () => ({ read: async () => { throw new SnapshotStoreError("forbidden", 403, "42501"); }, write: async () => undefined }) });
    const response = await handlers.GET();
    expect(response.status).toBe(502);
    expect(await response.text()).toBe(JSON.stringify({ error: "store-error" }));
    expect(errors).toEqual(["nba-board: snapshot store read failed (category=forbidden status=403 code=42501)"]);
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
    expect(calls[0].path).toBe("/rest/v1/nba_board_snapshots?id=eq.current&select=envelope&limit=1");
    expect(calls[1].path).toBe("/rest/v1/nba_board_snapshots?on_conflict=id");
    expect(JSON.parse(String(calls[1].init?.body))).toMatchObject({ id: "current", envelope: { ok: true } });
  });

  it("treats an empty table as no snapshot and a failed request as an error", async () => {
    expect(await createSupabaseSnapshotStore(async () => new Response("[]", { status: 200 })).read()).toBeNull();
    await expect(createSupabaseSnapshotStore(async () => new Response("no", { status: 500 })).read()).rejects.toThrow(/failed/);
  });
});

describe("migration", () => {
  const sql = readFileSync(path.resolve(__dirname, "../../../supabase/migrations/20261029_nba_board_snapshots.sql"), "utf8");
  const statements = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").toLowerCase();

  it("keeps the table itself closed: RLS on, no policy, browser roles revoked, even though the page is public", () => {
    expect(statements).toContain("enable row level security");
    expect(statements).not.toContain("create policy");
    expect(statements).toMatch(/revoke all on table public\.nba_board_snapshots from anon, authenticated/);
    expect(statements).not.toMatch(/grant /);
  });
});

describe("the endpoint file", () => {
  it("exports GET only and never reads a key or a request body", () => {
    const text = readFileSync(path.resolve(__dirname, "../../nba/props-board.ts"), "utf8");
    expect(text).toMatch(/export async function GET\(\)/);
    expect(text).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    expect(text).not.toMatch(/request\.(json|text|formData)|searchParams/);
    expect(URL_).toContain("/api/nba/props-board");
  });
});
