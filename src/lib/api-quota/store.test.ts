// @vitest-environment node
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ESSENTIAL, testAccount } from "./__fixtures__/accounts";
import { QuotaManager } from "./manager";
import { FileUsageStore, LockTimeoutError } from "./store";
import { QUOTA_CAS_RPC, QUOTA_READ_RPC, SupabaseUsageStore, QuotaStoreConflictError, type SupabaseFetch } from "./supabaseStore";
import { emptyUsageState, type AccountUsageState } from "./types";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "api-quota-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("FileUsageStore", () => {
  it("persists state across store instances", async () => {
    await new FileUsageStore(dir).transact("a:b", (s) => ({ state: { ...s, rollups: [{ month: "2026-10", sport: "nba", workflow: "w", endpoint: "/e", requests: 1, units: 1 }] }, result: null }));
    expect((await new FileUsageStore(dir).read("a:b")).rollups).toHaveLength(1);
    expect(await new FileUsageStore(dir).read("other")).toEqual(emptyUsageState());
  });

  it("never over-admits when separate store instances (separate runners) reserve concurrently", async () => {
    const account = testAccount({ windows: [{ kind: "day", limit: 15, source: "provider-docs" }], safetyReserve: 0 });
    const managers = Array.from({ length: 5 }, () => new QuotaManager({ accounts: [account], store: new FileUsageStore(dir, { retryDelayMs: 2 }) }));
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => managers[i % 5].reserve(account.accountId, ESSENTIAL, { units: 1, basis: "t" })));
    expect(results.filter((r) => r.allowed)).toHaveLength(15);
    expect((await new FileUsageStore(dir).read(account.accountId)).entries).toHaveLength(15);
  }, 30_000);

  it("times out on a live lock and breaks a stale one", async () => {
    const store = new FileUsageStore(dir, { lockTimeoutMs: 50, staleLockMs: 10_000, retryDelayMs: 5 });
    const lock = path.join(dir, "x.json.lock");
    await writeFile(lock, "999");
    await expect(store.transact("x", (s) => ({ state: s, result: 1 }))).rejects.toBeInstanceOf(LockTimeoutError);
    const old = new Date(Date.now() - 60_000);
    await utimes(lock, old, old);
    await expect(store.transact("x", (s) => ({ state: s, result: 2 }))).resolves.toBe(2);
  });

  it("skips the write for read-only outcomes and never deletes a lock it does not own", async () => {
    const store = new FileUsageStore(dir);
    await store.transact("ro", (s) => ({ state: s, result: null, changed: false }));
    await expect(readFile(path.join(dir, "ro.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    const lock = path.join(dir, "own.json.lock");
    await store.transact("own", (s) => {
      writeFileSync(lock, "someone-else");
      return { state: s, result: null };
    });
    expect(readFileSync(lock, "utf8")).toBe("someone-else");
  });

  it("does not write when the transaction throws", async () => {
    const store = new FileUsageStore(dir);
    await expect(store.transact("x", () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await store.read("x")).toEqual(emptyUsageState());
    await expect(store.transact("x", (s) => ({ state: s, result: "ok" }))).resolves.toBe("ok");
  });
});

/**
 * In-memory double of the two SQL functions (api_quota_read / api_quota_cas),
 * reproducing their semantics: CAS succeeds only when the stored version equals
 * the expected one, version 0 inserts only when absent, otherwise NULL. Every
 * call awaits a macrotask so concurrent transactions genuinely interleave.
 */
function fakeRpc() {
  const rows = new Map<string, { version: number; state: AccountUsageState }>();
  const calls: string[] = [];
  const fetchImpl: SupabaseFetch = async (url, init = {}) => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const name = url.replace("/rest/v1/rpc/", "");
    calls.push(name);
    const args = JSON.parse(String(init.body));
    if (name === QUOTA_READ_RPC) {
      const row = rows.get(args.p_account_id);
      return new Response(JSON.stringify(row ? [JSON.parse(JSON.stringify(row))] : []));
    }
    if (name !== QUOTA_CAS_RPC) return new Response("unknown rpc", { status: 404 });
    const current = rows.get(args.p_account_id);
    const matches = args.p_expected_version === 0 ? current === undefined : current?.version === args.p_expected_version;
    if (!matches) return new Response("null");
    const version = args.p_expected_version + 1;
    rows.set(args.p_account_id, { version, state: args.p_state });
    return new Response(JSON.stringify(version));
  };
  return { fetchImpl, rows, calls };
}

describe("SupabaseUsageStore", () => {
  const addRollup = (s: AccountUsageState) => ({ state: { ...s, rollups: [...s.rollups, { month: "m", sport: "s", workflow: "w", endpoint: "e", requests: 1, units: 1 }] }, result: s.rollups.length });

  it("goes only through the RPC functions, inserting at version 1 then advancing by one", async () => {
    const fake = fakeRpc();
    const store = new SupabaseUsageStore(fake.fetchImpl);
    expect(await store.transact("acct:1", addRollup)).toBe(0);
    expect(await store.transact("acct:1", addRollup)).toBe(1);
    expect(fake.rows.get("acct:1")?.version).toBe(2);
    expect(new Set(fake.calls)).toEqual(new Set([QUOTA_READ_RPC, QUOTA_CAS_RPC]));
  });

  it("never over-admits when many runners (separate managers and stores) reserve concurrently", async () => {
    const fake = fakeRpc();
    const account = testAccount({ windows: [{ kind: "day", limit: 12, source: "provider-docs" }], safetyReserve: 0 });
    const managers = Array.from({ length: 6 }, () => new QuotaManager({ accounts: [account], store: new SupabaseUsageStore(fake.fetchImpl, 100) }));
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) => managers[i % 6].reserve(account.accountId, ESSENTIAL, { units: 1, basis: "t" })));
    expect(results.filter((r) => r.allowed)).toHaveLength(12);
    expect(fake.rows.get(account.accountId)?.state.entries).toHaveLength(12);
  }, 30_000);

  it("skips the write for read-only outcomes", async () => {
    const fake = fakeRpc();
    await new SupabaseUsageStore(fake.fetchImpl).transact("a", (s) => ({ state: s, result: null, changed: false }));
    expect(fake.calls).toEqual([QUOTA_READ_RPC]);
  });

  it("gives up after repeated conflicts, and surfaces HTTP failures and bad versions", async () => {
    const alwaysConflict: SupabaseFetch = async (url) =>
      url.endsWith(QUOTA_READ_RPC) ? new Response(JSON.stringify([{ version: 1, state: emptyUsageState() }])) : new Response("null");
    await expect(new SupabaseUsageStore(alwaysConflict, 3).transact("a", addRollup)).rejects.toBeInstanceOf(QuotaStoreConflictError);
    const failing: SupabaseFetch = async () => new Response("no", { status: 401 });
    await expect(new SupabaseUsageStore(failing).read("a")).rejects.toThrow("HTTP 401");
    const skipping: SupabaseFetch = async (url) => (url.endsWith(QUOTA_READ_RPC) ? new Response("[]") : new Response("5"));
    await expect(new SupabaseUsageStore(skipping).transact("a", addRollup)).rejects.toThrow(/returned version 5/);
  });
});
