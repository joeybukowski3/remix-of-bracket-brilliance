/**
 * API-NBA probe runner: mocked transport only. No test here can reach the network:
 * every request goes through an injected fetch, and the real registry has no approval.
 */
import { describe, expect, it, vi } from "vitest";
import { PROVIDER_ACCOUNTS } from "../../api-quota/accounts";
import { guardedRequest, type FetchLike } from "../../api-quota/guardedRequest";
import { QuotaManager } from "../../api-quota/manager";
import { MemoryUsageStore, type UsageStore } from "../../api-quota/store";
import type { LiveApproval } from "../../api-quota/types";
import { envelope, gamePlayerRows, gameTeamRows, PROBE_GAME_ID, statusBody, syntheticGames, teamSeasonRows } from "./__fixtures__/apiNbaSynthetic";
import {
  API_NBA_PROBE_ACCOUNT_ID,
  API_NBA_PROBE_APPROVAL_SCOPE,
  API_NBA_PROBE_MIN_INTERVAL_MS,
  API_NBA_PROBE_STEPS,
  chooseProbeGame,
  runApiNbaProbe,
  type ProbeDeps,
} from "./sources/apiNbaProbe";

const KEY = "SYNTHETICKEY0123456789abcdefABCD";
const START = "2026-10-20T12:00:00.000Z";

const approval = (overrides: Partial<LiveApproval> = {}): LiveApproval => ({
  id: "nba-probe-test",
  approvedBy: "test",
  approvedOn: "2026-10-20",
  scope: API_NBA_PROBE_APPROVAL_SCOPE,
  maxUnits: 10,
  expiresAt: "2026-10-27T00:00:00.000Z",
  ...overrides,
});

const accountsWith = (live: LiveApproval | null) => PROVIDER_ACCOUNTS.map((a) => (a.accountId === API_NBA_PROBE_ACCOUNT_ID ? { ...a, liveApproval: live } : a));

interface Call {
  path: string;
  params: Record<string, string>;
  atMs: number;
  openReservations: number;
  headers: Record<string, string>;
}

type Override = (call: Call, index: number) => Response | Error | undefined;

/** Synthetic API-Sports: counts every call (including /status) against a daily counter. */
function provider(manager: () => QuotaManager, now: () => Date, opts: { used0?: number; override?: Override; extraUsage?: number; extraHeaders?: Record<string, string> } = {}) {
  let used = opts.used0 ?? 3;
  const calls: Call[] = [];
  const fetchImpl = vi.fn<FetchLike>(async (url, init) => {
    const u = new URL(url);
    const params = Object.fromEntries(u.searchParams.entries());
    const state = await manager().state(API_NBA_PROBE_ACCOUNT_ID);
    const call: Call = { path: u.pathname, params, atMs: now().getTime(), openReservations: state.entries.filter((e) => e.status === "reserved").length, headers: { ...(init?.headers as Record<string, string>) } };
    calls.push(call);
    used += 1 + (opts.extraUsage ?? 0);
    const overridden = opts.override?.(call, calls.length - 1);
    if (overridden instanceof Error) throw overridden;
    if (overridden) return overridden;
    const headers = { "content-type": "application/json", "x-ratelimit-requests-limit": "100", "x-ratelimit-requests-remaining": String(100 - used), "x-ratelimit-limit": "10", "x-ratelimit-remaining": "9", ...opts.extraHeaders };
    const body =
      u.pathname === "/status"
        ? statusBody(used)
        : u.pathname === "/seasons"
          ? envelope("seasons", [2021, 2022, 2023, 2024, 2025])
          : u.pathname === "/games"
            ? envelope("games", params.season === "2023" ? syntheticGames : [])
            : u.pathname === "/games/statistics"
              ? envelope("games/statistics", gameTeamRows())
              : params.game
                ? envelope("players/statistics", gamePlayerRows())
                : envelope("players/statistics", teamSeasonRows());
    return new Response(body, { status: 200, headers });
  });
  return { fetchImpl, calls, used: () => used };
}

function setup(opts: { live?: LiveApproval | null; store?: UsageStore; claims?: Set<string>; used0?: number; override?: Override; extraUsage?: number; extraHeaders?: Record<string, string>; key?: string; steps?: ProbeDeps["steps"] } = {}) {
  let t = Date.parse(START);
  const now = () => new Date(t);
  const store = opts.store ?? new MemoryUsageStore();
  const manager = new QuotaManager({ accounts: accountsWith(opts.live === undefined ? approval() : opts.live), store, now });
  const api = provider(() => manager, now, opts);
  const written = new Map<string, string>();
  const logs: string[] = [];
  const claims = opts.claims ?? new Set<string>();
  const claimLog: { id: string; fetchesBefore: number }[] = [];
  const deps: ProbeDeps = {
    manager,
    apiKey: opts.key ?? KEY,
    fetchImpl: api.fetchImpl,
    writer: async (name, text) => {
      if (written.has(name)) throw new Error(`overwrite ${name}`);
      written.set(name, text);
    },
    log: (line) => logs.push(line),
    claimApproval: async (id) => {
      claimLog.push({ id, fetchesBefore: api.calls.length });
      if (claims.has(id)) throw Object.assign(new Error("exists"), { code: "EEXIST" });
      claims.add(id);
    },
    sleep: async (ms) => void (t += ms),
    now,
    runId: "run-test",
    steps: opts.steps,
  };
  return { deps, manager, store, api, written, logs, claims, claimLog, advance: (ms: number) => void (t += ms) };
}

const approvalUnits = async (manager: QuotaManager, id = "nba-probe-test") =>
  (await manager.state(API_NBA_PROBE_ACCOUNT_ID)).entries.filter((e) => e.approvalId === id && e.status !== "released").length;

const everythingWritten = (env: ReturnType<typeof setup>) => [...env.written.keys(), ...env.written.values(), ...env.logs].join("\n");

describe("API-NBA probe: refusal before any request", () => {
  it("refuses with the committed registry, which has no approval", async () => {
    const accounts = PROVIDER_ACCOUNTS.find((a) => a.accountId === API_NBA_PROBE_ACCOUNT_ID);
    expect(accounts?.liveApproval).toBeNull();
    const env = setup({ live: null });
    const result = await runApiNbaProbe(env.deps);
    expect(result).toMatchObject({ status: "refused", requestsAttempted: 0, abort: { code: "refused" } });
    expect(env.api.fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["over the cap", approval({ maxUnits: 11 }), /<= 10/],
    ["below the plan", approval({ maxUnits: 9 }), /below the 10-request plan/],
    ["without expiry", approval({ expiresAt: null }), /expiry/],
    ["expired", approval({ expiresAt: "2026-10-19T00:00:00.000Z" }), /expired/],
    ["too long", approval({ expiresAt: "2026-12-01T00:00:00.000Z" }), /14 days/],
    ["wrong scope", approval({ scope: "NBA backfill" }), /scope/],
  ])("refuses an approval %s", async (_label, live, message) => {
    const env = setup({ live });
    const result = await runApiNbaProbe(env.deps);
    expect(result.status).toBe("refused");
    expect(result.abort?.message).toMatch(message);
    expect(env.api.fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a missing or malformed key", async () => {
    for (const key of ["", "short", "has space in the key value 123456"]) {
      const env = setup({ key });
      expect((await runApiNbaProbe(env.deps)).status).toBe("refused");
      expect(env.api.fetchImpl).not.toHaveBeenCalled();
    }
  });

  it("refuses a plan longer than the hard cap even with a valid approval", async () => {
    const steps = [...API_NBA_PROBE_STEPS, API_NBA_PROBE_STEPS[1], API_NBA_PROBE_STEPS[1]];
    const env = setup({ steps });
    const result = await runApiNbaProbe(env.deps);
    expect(result.status).toBe("refused");
    expect(env.api.fetchImpl).not.toHaveBeenCalled();
  });
});

describe("API-NBA probe: a complete synthetic run", () => {
  it("makes exactly 10 reserved, spaced, retry-free requests and saves sanitized artifacts", async () => {
    const env = setup();
    const result = await runApiNbaProbe(env.deps);
    expect(result).toMatchObject({ status: "completed", requestsAttempted: 10, abort: null });
    expect(env.api.calls.map((c) => c.path)).toEqual(["/status", "/seasons", "/games", "/games", "/players/statistics", "/games/statistics", "/players/statistics", "/games", "/games", "/status"]);
    expect(env.api.calls[4].params).toEqual({ game: String(PROBE_GAME_ID) });
    expect(env.api.calls[6].params).toEqual({ team: "9101", season: "2023" });
    // Reserved before sent: exactly one open reservation while each request is in flight.
    expect(env.api.calls.every((c) => c.openReservations === 1)).toBe(true);
    for (let i = 1; i < env.api.calls.length; i += 1) expect(env.api.calls[i].atMs - env.api.calls[i - 1].atMs).toBeGreaterThanOrEqual(API_NBA_PROBE_MIN_INTERVAL_MS);
    // The key goes only in the request header.
    expect(env.api.calls.every((c) => c.headers["x-apisports-key"] === KEY)).toBe(true);
    expect(await approvalUnits(env.manager)).toBe(10);

    expect([...env.written.keys()]).toContain("01-status-initial.body.json");
    expect([...env.written.keys()]).toContain("run.json");
    expect(env.written.get("01-status-initial.body.json")).not.toContain("owner@example.invalid");
    expect(JSON.parse(env.written.get("01-status-initial.meta.json")!)).toMatchObject({ sanitized: ["response.account"], approvalId: "nba-probe-test", httpStatus: 200 });
    expect(everythingWritten(env)).not.toContain(KEY);
  });

  it("reports coverage, minutes precision, DNP rows, pagination and the quota delta", async () => {
    const env = setup();
    const { analysis } = await runApiNbaProbe(env.deps);
    expect(analysis?.seasonsListed).toEqual([2021, 2022, 2023, 2024, 2025]);
    expect(analysis?.seasonCoverage[0]).toMatchObject({ season: 2023, results: 3, byStage: { "1": 1, "2": 2 }, finishedStage2: 2, firstDate: "2023-10-10", lastDate: "2024-01-15", paging: null });
    expect(analysis?.gameBox).toMatchObject({
      playerRows: 18,
      dnpRows: 2,
      minutesFormats: { "minutes-seconds": 16, "whole-minutes": 0, absent: 2, unparseable: 0 },
      teamMinuteTotals: { "9101": 240, "9102": 240 },
      expectedTeamMinutes: 240,
      playerPointsByTeam: { "9101": 110, "9102": 100 },
      teamBoxPoints: { "9101": 110, "9102": 100 },
    });
    expect(analysis?.teamSeason).toMatchObject({ distinctGames: 2, includesProbeGame: true, probeGameRowsMatch: true });
    expect(analysis?.quota).toMatchObject({ baselineUsed: 4, finalUsed: 13, delta: 9, requestsAttempted: 10, unitsCharged: 10, interpretation: expect.stringMatching(/including \/status/) });
    expect(analysis?.normalization).toMatch(/DEFERRED/);
  });

  it("picks the first finished regular-season game on or after the target date", () => {
    expect(chooseProbeGame(envelope("games", syntheticGames))?.id).toBe(PROBE_GAME_ID);
    expect(chooseProbeGame(envelope("games", syntheticGames.slice(0, 2)))?.id).toBe(777000);
    expect(chooseProbeGame("not json")).toBeNull();
  });

  it("refuses a second run on the same approval", async () => {
    const store = new MemoryUsageStore();
    const first = setup({ store });
    await runApiNbaProbe(first.deps);
    const second = setup({ store });
    second.advance(3_600_000);
    const result = await runApiNbaProbe(second.deps);
    expect(result).toMatchObject({ status: "refused", abort: { message: expect.stringMatching(/already funded/) } });
    expect(second.api.fetchImpl).not.toHaveBeenCalled();
  });
});

const respond = (status: number, body: string, headers: Record<string, string> = {}) => new Response(body, { status, headers });

describe("API-NBA probe: aborts with conservative accounting", () => {
  it.each([
    ["plan restriction on 2025-26", (c: Call) => (c.params.season === "2025" ? respond(200, JSON.stringify({ errors: { plan: "Free plans do not have access to this season, try from 2021 to 2023." }, response: [] })) : undefined), "plan-restriction", 8],
    ["HTTP 500 (no retry)", (_c: Call, i: number) => (i === 2 ? respond(500, "{}") : undefined), "http-error", 3],
    ["HTTP 429 (no retry)", (_c: Call, i: number) => (i === 1 ? respond(429, "{}") : undefined), "rate-limited", 2],
    ["network failure", (_c: Call, i: number) => (i === 3 ? new TypeError("fetch failed") : undefined), "network-error", 4],
    ["non-JSON body", (_c: Call, i: number) => (i === 1 ? respond(200, "<html>maintenance</html>") : undefined), "provider-error", 2],
    ["schema drift", (c: Call) => (c.path === "/games/statistics" ? respond(200, envelope("games/statistics", [{ team: { id: 1 }, statistics: [] }])) : undefined), "invalid-response", 6],
    ["RapidAPI marker", (_c: Call, i: number) => (i === 1 ? respond(200, envelope("seasons", [2023]), { "x-rapidapi-proxy-response": "true" }) : undefined), "rapidapi-detected", 2],
    ["inactive subscription", (c: Call) => (c.path === "/status" ? respond(200, statusBody(4, { subscription: { plan: "Free", active: false } })) : undefined), "subscription-inactive", 1],
    ["missing probe game", (c: Call) => (c.path === "/games" ? respond(200, envelope("games", [])) : undefined), "unplannable-step", 4],
  ])("%s", async (_label, override, code, expectedCalls) => {
    const env = setup({ override });
    const result = await runApiNbaProbe(env.deps);
    expect(result).toMatchObject({ status: "aborted", abort: { code }, requestsAttempted: expectedCalls });
    expect(env.api.fetchImpl).toHaveBeenCalledTimes(expectedCalls);
    // Every attempted request, failed or not, stays charged against the approval.
    expect(await approvalUnits(env.manager)).toBe(expectedCalls);
    expect(env.written.has("run.json")).toBe(true);
    expect(everythingWritten(env)).not.toContain(KEY);
  });

  it("aborts when provider usage rises faster than the calls made", async () => {
    const env = setup({ extraUsage: 2 });
    const result = await runApiNbaProbe(env.deps);
    expect(result).toMatchObject({ status: "aborted", abort: { code: "unexpected-quota-usage" }, requestsAttempted: 2 });
  });

  it("aborts after the baseline /status when the daily window lacks headroom", async () => {
    const env = setup({ used0: 84 });
    const result = await runApiNbaProbe(env.deps);
    expect(result).toMatchObject({ status: "aborted", abort: { code: "insufficient-headroom" }, requestsAttempted: 1 });
  });

  it("never writes or logs the key, even when the provider echoes it", async () => {
    const env = setup({ override: (_c, i) => (i === 1 ? respond(200, envelope("seasons", [2023], { parameters: { key: KEY } })) : undefined) });
    const result = await runApiNbaProbe(env.deps);
    expect(result.abort?.code).toBe("artifact-write-failed");
    expect(everythingWritten(env)).not.toContain(KEY);
  });

  it("keeps a request charged when the ledger cannot settle it", async () => {
    const inner = new MemoryUsageStore();
    let failSettles = false;
    const store: UsageStore = {
      read: (id) => inner.read(id),
      transact: (id, fn) =>
        inner.transact(id, (state) => {
          const outcome = fn(state);
          const settledBefore = state.entries.filter((e) => e.status === "settled").length;
          if (failSettles && outcome.state.entries.filter((e) => e.status === "settled").length > settledBefore) throw new Error("disk full");
          return outcome;
        }),
    };
    const env = setup({
      store,
      override: (_c, i) => {
        failSettles = i === 1;
        return undefined;
      },
    });
    const result = await runApiNbaProbe(env.deps);
    expect(result).toMatchObject({ status: "aborted", abort: { code: "ledger-settle-failed" }, requestsAttempted: 2 });
    const open = (await env.manager.state(API_NBA_PROBE_ACCOUNT_ID)).entries.filter((e) => e.status === "reserved");
    expect(open).toHaveLength(1);
    expect(await approvalUnits(env.manager)).toBe(2);
  });

  it("counts a crashed run's unsettled reservation and refuses to start again", async () => {
    const env = setup();
    // A run killed mid-request leaves an open reservation behind.
    const crashed = await env.manager.reserve(API_NBA_PROBE_ACCOUNT_ID, { priority: "nonessential", attribution: { sport: "nba", workflow: "api-nba-coverage-probe", endpoint: "/status" } }, { units: 1, basis: "status", isUsageCheck: true });
    expect(crashed.allowed).toBe(true);
    const result = await runApiNbaProbe(env.deps);
    expect(result.status).toBe("refused");
    expect(env.api.fetchImpl).not.toHaveBeenCalled();
    env.advance(11 * 60_000);
    expect(await env.manager.reconcileOrphans(API_NBA_PROBE_ACCOUNT_ID)).toEqual({ orphaned: 1, unitsCharged: 1 });
    expect(await approvalUnits(env.manager)).toBe(1);
  });
});

describe("API-NBA probe: RapidAPI detection (2026-10-13 first-request abort)", () => {
  // Sanitized shape of the observed first response: HTTP 200 /status from the direct host with
  // per-minute and daily rate headers. The direct host also lists RapidAPI header names in CORS metadata.
  const CORS = {
    "access-control-allow-headers": "x-rapidapi-key, x-apisports-key, x-rapidapi-host",
    "access-control-expose-headers": "x-ratelimit-requests-limit, x-rapidapi-proxy-response",
  };
  const onStatus = (headers: Record<string, string>, body = statusBody(0)) => (c: Call) =>
    c.path === "/status"
      ? respond(200, body, {
          "content-type": "application/json",
          "x-ratelimit-limit": "10",
          "x-ratelimit-remaining": "9",
          "x-ratelimit-requests-limit": "100",
          "x-ratelimit-requests-remaining": "100",
          ...headers,
        })
      : undefined;
  const expectAbortAfterOne = async (env: ReturnType<typeof setup>, code = "rapidapi-detected") => {
    const result = await runApiNbaProbe(env.deps);
    expect(result).toMatchObject({ status: "aborted", requestsAttempted: 1, abort: { code, stepId: "status-initial" } });
    expect(env.api.fetchImpl).toHaveBeenCalledTimes(1);
    expect(await approvalUnits(env.manager)).toBe(1);
    expect(everythingWritten(env)).not.toContain(KEY);
    expect(everythingWritten(env)).not.toContain("owner@example.invalid");
    return result;
  };

  it("does not abort on CORS header-list mentions alone, and keeps them as diagnostics", async () => {
    const env = setup({ extraHeaders: CORS });
    const result = await runApiNbaProbe(env.deps);
    expect(result).toMatchObject({ status: "completed", abort: null, requestsAttempted: 10 });
    expect(result.steps.every((s) => s.rapidApiMarkers.length === 0)).toBe(true);
    expect(result.steps[0].corsRapidApiMentions.sort()).toEqual([
      "access-control-allow-headers=x-rapidapi-key,x-rapidapi-host",
      "access-control-expose-headers=x-rapidapi-proxy-response",
    ]);
    expect(everythingWritten(env)).not.toContain(KEY);
    expect(everythingWritten(env)).not.toContain("owner@example.invalid");
  });

  it("still aborts on x-rapidapi-region, even next to CORS mentions, without copying header values", async () => {
    const env = setup({ override: onStatus({ ...CORS, "x-rapidapi-region": "AWS - us-east-1", "x-rapidapi-user": "someone-private" }) });
    const result = await expectAbortAfterOne(env);
    expect(result.steps[0].rapidApiMarkers.sort()).toEqual(["x-rapidapi-region", "x-rapidapi-user"]);
    expect(everythingWritten(env)).not.toContain("someone-private");
  });

  it.each([
    ["server", { server: "RapidAPI-1.2.8" }, "server=RapidAPI-1.2.8"],
    ["via", { via: "1.1 rapidapi-gateway" }, "via=rapidapi-gateway"],
    ["legacy Mashape gateway header name", { "x-mashape-proxy-response": "true" }, "x-mashape-proxy-response"],
    ["CORS-named value in a non-CORS header", { "x-gateway": "x-rapidapi-host" }, "x-gateway=x-rapidapi-host"],
  ])("still aborts on RapidAPI gateway/routing evidence: %s", async (_label, headers, marker) => {
    const result = await expectAbortAfterOne(setup({ override: onStatus({ ...CORS, ...headers }) }));
    expect(result.steps[0].rapidApiMarkers).toEqual([marker]);
  });

  it("still aborts when the /status subscription or plan names RapidAPI", async () => {
    const body = statusBody(0, { subscription: { plan: "RapidAPI Basic", end: "2027-01-01T00:00:00+00:00", active: true } });
    const result = await expectAbortAfterOne(setup({ override: onStatus(CORS, body) }));
    expect(result.steps[0].rapidApiMarkers).toEqual(["status-body=RapidAPI"]);
  });

  it.each([
    ["RapidAPI", "https://api-nba-v1.p.rapidapi.com/status", "response-host=api-nba-v1.p.rapidapi.com"],
    ["another host", "https://example.invalid/status", "response-host=example.invalid"],
  ])("still aborts on a redirect to %s", async (_label, finalUrl, marker) => {
    const redirected = (c: Call) => {
      const response = onStatus(CORS)(c);
      if (response) Object.defineProperty(response, "url", { value: finalUrl });
      return response;
    };
    const result = await expectAbortAfterOne(setup({ override: redirected }));
    expect(result.steps[0].rapidApiMarkers).toEqual([marker]);
  });

  it("refuses a step whose URL would leave the direct host, before reserving or sending", async () => {
    const steps = [{ id: "status-initial", kind: "status" as const, path: "@api-nba-v1.p.rapidapi.com/status", params: () => ({}) }];
    const env = setup({ steps });
    const result = await runApiNbaProbe(env.deps);
    expect(result).toMatchObject({ status: "aborted", requestsAttempted: 0, abort: { code: "unexpected-host" } });
    expect(env.api.fetchImpl).not.toHaveBeenCalled();
    expect(await approvalUnits(env.manager)).toBe(0);
  });

  it("keeps the sanitized /status body when it aborts, without account details", async () => {
    const env = setup({ override: onStatus({ "x-rapidapi-region": "AWS - us-east-1" }) });
    const result = await expectAbortAfterOne(env);
    const body = env.written.get("01-status-initial.body.json") ?? "";
    expect(body).toContain('"plan":"Free"');
    expect(result.analysis?.status.initial).not.toBeNull();
    expect(result.analysis?.quota.interpretation).toMatch(/^UNKNOWN/);
  });
});

describe("API-NBA probe: single-use approval claim", () => {
  it("claims the approval once, before the first request", async () => {
    const env = setup();
    await runApiNbaProbe(env.deps);
    expect(env.claimLog).toEqual([{ id: "nba-probe-test", fetchesBefore: 0 }]);
  });

  it("does not claim when a no-network check refuses", async () => {
    const env = setup({ live: approval({ maxUnits: 11 }) });
    await runApiNbaProbe(env.deps);
    expect(env.claimLog).toEqual([]);
  });

  it("refuses a claimed approval even when its ledger entries are gone", async () => {
    const claims = new Set<string>();
    await runApiNbaProbe(setup({ claims, override: (_c, i) => (i === 0 ? respond(500, "{}") : undefined) }).deps);
    const fresh = setup({ claims, store: new MemoryUsageStore() });
    const result = await runApiNbaProbe(fresh.deps);
    expect(result).toMatchObject({ status: "refused", abort: { message: expect.stringMatching(/could not be claimed.*EEXIST/) } });
    expect(fresh.api.fetchImpl).not.toHaveBeenCalled();
  });
});

describe("API-NBA probe: the hard cap holds below the runner", () => {
  it("the quota manager denies an 11th approval-funded request without sending it", async () => {
    const env = setup();
    await runApiNbaProbe(env.deps);
    env.advance(60_000);
    const fetchImpl = vi.fn<FetchLike>();
    const extra = await guardedRequest({
      manager: env.manager,
      accountId: API_NBA_PROBE_ACCOUNT_ID,
      consumer: { priority: "nonessential", attribution: { sport: "nba", workflow: "api-nba-coverage-probe", endpoint: "/games" } },
      estimate: { units: 1, basis: "extra" },
      url: "https://example.invalid/games",
      fetchImpl,
    });
    expect(extra).toMatchObject({ kind: "denied", denial: { code: "APPROVAL_BUDGET_EXHAUSTED" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never exceeds 10 requests whichever step fails", async () => {
    for (let failAt = 0; failAt < 10; failAt += 1) {
      const env = setup({ override: (_c, i) => (i === failAt ? respond(503, "{}") : undefined) });
      const result = await runApiNbaProbe(env.deps);
      expect(env.api.fetchImpl.mock.calls.length).toBe(failAt + 1);
      expect(result.requestsAttempted).toBeLessThanOrEqual(10);
      expect(await approvalUnits(env.manager)).toBe(failAt + 1);
    }
  });
});
