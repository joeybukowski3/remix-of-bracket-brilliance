import { describe, expect, it, vi } from "vitest";
import { clock, NBA_PROBE, sequentialIds, testAccount } from "./__fixtures__/accounts";
import { guardedRequest, type FetchLike } from "./guardedRequest";
import { QuotaManager } from "./manager";
import { estimates, inspectApiSportsBody } from "./providers";
import { MemoryUsageStore } from "./store";

const URL_WITH_KEY = "https://example.invalid/games?season=2023&apiKey=SECRET";

function setup(overrides = {}) {
  const time = clock("2026-10-13T12:00:00Z");
  const account = testAccount(overrides);
  const manager = new QuotaManager({ accounts: [account], store: new MemoryUsageStore(), now: time.now, newId: sequentialIds() });
  return { manager, id: account.accountId, time };
}

const apiSportsResponse = (body: unknown, status = 200, remaining = 90) =>
  new Response(JSON.stringify(body), { status, headers: { "x-ratelimit-requests-limit": "100", "x-ratelimit-requests-remaining": String(remaining) } });

const statusEstimate = { units: 1, basis: "status", isUsageCheck: true };
const noSleep = async () => {};
const knownUsage = (manager: QuotaManager, id: string) =>
  manager.recordProviderUsage(id, [{ window: "day", observedAt: "2026-10-13T11:00:00.000Z", used: 0, remaining: 100, limit: 100 }]);

describe("guardedRequest", () => {
  it("does not call the network when the manager denies", async () => {
    const { manager, id } = setup({ liveApproval: null });
    const fetchImpl = vi.fn<FetchLike>();
    const result = await guardedRequest({ manager, accountId: id, consumer: NBA_PROBE, estimate: statusEstimate, url: URL_WITH_KEY, fetchImpl });
    expect(result).toMatchObject({ kind: "denied", denial: { code: "NOT_APPROVED" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("charges a 2xx call, records provider usage, and unblocks UNKNOWN usage", async () => {
    const { manager, id } = setup();
    const fetchImpl = vi.fn<FetchLike>(async () => apiSportsResponse({ errors: [], response: {} }, 200, 90));
    const result = await guardedRequest({ manager, accountId: id, consumer: NBA_PROBE, estimate: statusEstimate, url: URL_WITH_KEY, fetchImpl });
    expect(result).toMatchObject({ kind: "response", outcome: "ok", unitsCharged: 1 });
    const state = await manager.state(id);
    expect(state.snapshots).toEqual([expect.objectContaining({ window: "day", remaining: 90, limit: 100 })]);
    const next = await manager.reserve(id, NBA_PROBE, { units: 1, basis: "games" });
    expect(next.allowed).toBe(true);
  });

  it("classifies HTTP-200 provider errors and still charges them", async () => {
    const { manager, id } = setup();
    const fetchImpl: FetchLike = async () => apiSportsResponse({ errors: { plan: "Free plans do not have access to this season" }, response: [] });
    const result = await guardedRequest({ manager, accountId: id, consumer: NBA_PROBE, estimate: statusEstimate, url: URL_WITH_KEY, fetchImpl, inspectBody: inspectApiSportsBody });
    expect(result).toMatchObject({ kind: "response", outcome: "provider-error", unitsCharged: 1, detail: "plan: Free plans do not have access to this season" });
  });

  it("charges each retry attempt separately and never retries 429", async () => {
    const { manager, id } = setup();
    await manager.recordProviderUsage(id, [{ window: "day", observedAt: "2026-10-13T11:00:00.000Z", used: 0, remaining: 100, limit: 100 }]);
    const flaky = vi.fn<FetchLike>().mockResolvedValueOnce(new Response("", { status: 503 })).mockResolvedValueOnce(apiSportsResponse({ errors: [] }));
    const retried = await guardedRequest({ manager, accountId: id, consumer: NBA_PROBE, estimate: { units: 1, basis: "g" }, url: URL_WITH_KEY, fetchImpl: flaky, maxAttempts: 3, sleep: noSleep });
    expect(retried).toMatchObject({ kind: "response", httpStatus: 200, attempts: 2, unitsCharged: 2 });

    const limited = vi.fn<FetchLike>(async () => new Response("", { status: 429 }));
    const result = await guardedRequest({ manager, accountId: id, consumer: NBA_PROBE, estimate: { units: 1, basis: "g" }, url: URL_WITH_KEY, fetchImpl: limited, maxAttempts: 3, retryStatuses: [429, 503], sleep: noSleep });
    expect(result).toMatchObject({ kind: "response", httpStatus: 429, outcome: "http-error", attempts: 1 });
    expect(limited).toHaveBeenCalledTimes(1);
  });

  it("charges network failures at the estimate and keeps the URL out of the ledger", async () => {
    const { manager, id } = setup();
    const fetchImpl: FetchLike = async () => {
      throw new TypeError(`fetch failed for ${URL_WITH_KEY}`);
    };
    const result = await guardedRequest({ manager, accountId: id, consumer: NBA_PROBE, estimate: statusEstimate, url: URL_WITH_KEY, fetchImpl });
    expect(result).toMatchObject({ kind: "network-error", unitsCharged: 1 });
    expect(JSON.stringify(await manager.state(id))).not.toContain("SECRET");
  });

  it("uses the provider-reported per-call cost for x-requests-* providers", async () => {
    const { manager, id } = setup({ provider: "parlayapi", billingUnit: "credits" });
    const fetchImpl: FetchLike = async () => new Response("[]", { status: 200, headers: { "x-requests-used": "10", "x-requests-remaining": "990", "x-requests-last": "6" } });
    const result = await guardedRequest({ manager, accountId: id, consumer: { priority: "essential", attribution: { sport: "nfl", workflow: "w", endpoint: "/props" } }, estimate: { units: 3, basis: "props" }, url: URL_WITH_KEY, fetchImpl });
    expect(result).toMatchObject({ kind: "response", unitsCharged: 6 });
  });

  it("keeps a paid request settled when reading or inspecting the body fails", async () => {
    const { manager, id } = setup();
    const broken = { ok: true, status: 200, headers: new Headers(), text: async () => { throw new TypeError("aborted"); } } as unknown as Response;
    const result = await guardedRequest({ manager, accountId: id, consumer: NBA_PROBE, estimate: statusEstimate, url: URL_WITH_KEY, fetchImpl: async () => broken });
    expect(result).toMatchObject({ kind: "response", outcome: "network-error", unitsCharged: 1, settleFailed: false });
    const throwingInspect = await guardedRequest({
      manager, accountId: id, consumer: NBA_PROBE, estimate: statusEstimate, url: URL_WITH_KEY,
      fetchImpl: async () => apiSportsResponse({ errors: [] }),
      inspectBody: () => { throw new Error("bad"); },
    });
    expect(throwingInspect).toMatchObject({ kind: "response", outcome: "provider-error", detail: "body inspection failed: Error" });
    expect((await manager.state(id)).entries.every((e) => e.status === "settled")).toBe(true);
  });

  it("returns the response with settleFailed instead of throwing when settlement keeps failing", async () => {
    const { manager, id } = setup();
    vi.spyOn(manager, "settle").mockRejectedValue(new Error("store down"));
    const result = await guardedRequest({ manager, accountId: id, consumer: NBA_PROBE, estimate: statusEstimate, url: URL_WITH_KEY, fetchImpl: async () => apiSportsResponse({ errors: [] }) });
    expect(result).toMatchObject({ kind: "response", httpStatus: 200, settleFailed: true, unitsCharged: 1 });
    expect((await manager.state(id)).entries[0]).toMatchObject({ status: "reserved" });
  });

  it("reports units already charged when a later retry is denied, with exponential backoff", async () => {
    const { manager, id } = setup({ liveApproval: { id: "a", approvedBy: "u", approvedOn: "d", scope: "s", maxUnits: 2, expiresAt: null } });
    await knownUsage(manager, id);
    const sleeps: number[] = [];
    const result = await guardedRequest({
      manager, accountId: id, consumer: NBA_PROBE, estimate: { units: 1, basis: "g" }, url: URL_WITH_KEY,
      fetchImpl: async () => new Response("", { status: 503 }), maxAttempts: 5, retryDelayMs: 100,
      sleep: async (ms) => void sleeps.push(ms),
    });
    expect(result).toMatchObject({ kind: "denied", denial: { code: "APPROVAL_BUDGET_EXHAUSTED" }, unitsCharged: 2, attempts: 2 });
    expect(sleeps).toEqual([100, 200]);
  });

  it("charges every page of a paginated read and stops at the cap", async () => {
    const { manager, id } = setup({ provider: "parlayapi", billingUnit: "credits", windows: [{ kind: "month", limit: 10, source: "provider-docs" }], safetyReserve: 0 });
    const consumer = { priority: "essential" as const, attribution: { sport: "nfl", workflow: "w", endpoint: "/props" } };
    const fetchImpl = vi.fn<FetchLike>(async () => new Response("[]", { status: 200 }));
    const pages: string[] = [];
    for (let page = 0; page < 5; page += 1) {
      const result = await guardedRequest({ manager, accountId: id, consumer, estimate: estimates.parlayProps(1), url: `${URL_WITH_KEY}&offset=${page}`, fetchImpl });
      if (result.kind !== "response") break;
      pages.push(String(page));
    }
    expect(pages).toEqual(["0", "1", "2"]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const state = await manager.state(id);
    expect(state.entries.reduce((sum, e) => sum + (e.actualUnits ?? 0), 0)).toBe(9);
  });
});
