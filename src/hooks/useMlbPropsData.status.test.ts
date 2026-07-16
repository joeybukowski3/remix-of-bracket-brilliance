/**
 * Focused hook lifecycle/status tests for the useMlbPropsData ->
 * deriveMlbDataStatus integration: error field, hasCompletedInitialFetch,
 * error-preserving polling, status derivation, the real `stale` field, and
 * the propDate cast removal.
 *
 * IMPORTANT: deriveMlbDataStatus compares a payload's `date` against
 * today's real America/New_York date via `new Date()` inside the hook (no
 * injectable clock at the hook level). Every fixture that should resolve
 * to a "same slate" status therefore uses `todayEtDate()` computed at test
 * run time, not a hardcoded date -- a hardcoded date would silently start
 * failing the day after it was written.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMlbPropsData } from "./useMlbPropsData";

function todayEtDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

// Guaranteed to never equal "today" for the practical lifetime of this
// test suite -- avoids relying on the injected-clock behavior this hook
// deliberately doesn't have.
const PAST_DATE = "2020-01-01";
const FUTURE_DATE = "2099-01-01";

// normalizeHrBestBetsPayload always includes slatePreview (null unless a
// full {slateOverview, modelNote} pair is present) -- included here so
// toEqual comparisons match the normalizer's real output shape exactly.
const EMPTY_BEST_BETS = { date: "", generatedAt: "", slatePreview: null, bestBets: [], valueBets: [], longshots: [] };
function bestBetsPayload(overrides: Record<string, unknown> = {}) {
  return { ...EMPTY_BEST_BETS, ...overrides };
}

const VALID_GAME = {
  gameKey: "BAL@CHC",
  matchup: "BAL @ CHC",
  awayTeam: "BAL",
  homeTeam: "CHC",
  stadium: "Wrigley Field",
  roofType: "Open",
  temperature: 78,
  precipitation: 0,
  windSpeed: 6,
  windDirection: "SW",
  conditions: "Clear",
  parkFactor: 1.0,
};

const VALID_PITCHER = {
  gameKey: "BAL@CHC",
  pitcher: "Justin Steele",
  pitcherId: 1,
  team: "CHC",
  opponent: "BAL",
  hand: "L",
  ballpark: "Wrigley Field",
  parkFactor: 1.0,
  xera: 3.5,
  hardHitRate: 40,
  flyBallRate: 35,
  barrelRate: 7,
  kRate: 22,
  bbRate: 8,
  whiffRate: 24,
  last7HR: 1,
  hrPerStart: 0.8,
  hrVs: 55,
  hitsVs: 62,
  kVs: 50,
};

function validBatter(lineupStatus: "confirmed" | "projected" | "unknown" = "confirmed") {
  return {
    gameKey: "BAL@CHC",
    playerId: 1,
    gameId: 1,
    lineupStatus,
    battingOrder: 3,
    starterConfirmed: lineupStatus === "confirmed",
    position: "C",
    player: "Adley Rutschman",
    team: "BAL",
    opponent: "CHC",
    opposingPitcher: "Justin Steele",
    opposingPitcherId: 1,
    pitcherHand: "L",
    ballpark: "Wrigley Field",
    parkFactor: 1.0,
    atBats: 300,
    barrelRate: 9.5,
    hardHitRate: 44,
    exitVelo: 90,
    iso: 0.18,
    hrFBRatio: 10,
    pullRate: 40,
    xba: 0.26,
    kRate: 18,
    bbRate: 10,
    whiffRate: 24,
    last7HR: 1,
    last30HR: 3,
    opposingPitcherHrVs: 55,
    opposingPitcherHitsVs: 62,
    opposingPitcherKVs: 50,
    weatherBoost: 0,
    hrScore: 60,
    hrScoreRank: 1,
    angleTags: [],
  };
}

function rawPayload(overrides: Record<string, unknown> = {}) {
  return {
    date: todayEtDate(),
    generatedAt: "2026-07-16T09:32:34.452Z",
    games: [VALID_GAME],
    pitchers: [VALID_PITCHER],
    batters: [validBatter("confirmed")],
    nextRunAt: null,
    pendingGames: [],
    ...overrides,
  };
}

/** Stubs fetch for a single round: dashboard + best-bets each independently controllable, range-artifact always fails closed (matches production tolerance). */
function stubRound(options: {
  dashboard?: { ok: true; payload: unknown } | { ok: false } | { ok: "reject" };
  bestBets?: { ok: true; payload: unknown } | { ok: false } | { ok: "reject" };
}) {
  const dashboard = options.dashboard ?? { ok: true, payload: rawPayload() };
  const bestBets = options.bestBets ?? { ok: true, payload: bestBetsPayload() };

  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const href = String(url);
      if (href.includes("hr-props-raw.json")) {
        if (dashboard.ok === "reject") return Promise.reject(new Error("network down"));
        if (!dashboard.ok) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
        return Promise.resolve({ ok: true, json: () => Promise.resolve(dashboard.payload) } as Response);
      }
      if (href.includes("hr-props-best-bets.json")) {
        if (bestBets.ok === "reject") return Promise.reject(new Error("network down"));
        if (!bestBets.ok) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
        return Promise.resolve({ ok: true, json: () => Promise.resolve(bestBets.payload) } as Response);
      }
      // Reference-range artifact and anything else: fail closed.
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
    }),
  );
}

const POLL_INTERVAL_MS = 10 * 60 * 1000;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useMlbPropsData — initial fetch lifecycle", () => {
  it("1. initial state before the first fetch settles: loading true, hasCompletedInitialFetch false, error null, status loading", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); // never resolves
    const { result } = renderHook(() => useMlbPropsData());
    expect(result.current.loading).toBe(true);
    expect(result.current.hasCompletedInitialFetch).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.status).toEqual({ kind: "loading" });
  });

  it("2. successful initial fetch settles to loading:false, hasCompletedInitialFetch:true, error:null, dashboard populated, status derived", async () => {
    stubRound({ dashboard: { ok: true, payload: rawPayload() } });
    const { result } = renderHook(() => useMlbPropsData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasCompletedInitialFetch).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.dashboard).not.toBeNull();
    expect(result.current.status.kind).toBe("current");
  });

  it("3. initial network failure: dashboard/bestBets stay null, error is set, status is error with hasLastKnownData false", async () => {
    stubRound({ dashboard: { ok: "reject" }, bestBets: { ok: "reject" } });
    const { result } = renderHook(() => useMlbPropsData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dashboard).toBeNull();
    expect(result.current.bestBets).toBeNull();
    expect(result.current.error).toBe("Unable to load MLB model data.");
    expect(result.current.status).toMatchObject({ kind: "error", hasLastKnownData: false });
  });

  it("4. a non-200 dashboard response on the initial fetch is an error, not unavailable or no-games-scheduled", async () => {
    stubRound({ dashboard: { ok: false } });
    const { result } = renderHook(() => useMlbPropsData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Unable to load MLB model data.");
    expect(result.current.status.kind).toBe("error");
  });

  // normalizeHrDashboardPayload's only null-returning branch is
  // "not an array and not a record" (isRecord fails) -- there is no plain
  // JS object shape it currently rejects outright, since any record
  // defaults its missing/malformed fields rather than returning null. The
  // two tests below exercise that single guard with two different
  // malformed JSON root values (a string, and a JSON null) to prove the
  // fetchDashboardOutcome fix applies regardless of which kind of
  // unusable body triggers it, not because the normalizer has two
  // distinct rejection paths.
  it("21. an initial HTTP-200 response with parseable but non-object dashboard JSON is treated as an error, never a null success", async () => {
    stubRound({ dashboard: { ok: true, payload: "unexpected string response" } });
    const { result } = renderHook(() => useMlbPropsData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dashboard).toBeNull();
    expect(result.current.error).toBe("Unable to load MLB model data.");
    expect(result.current.status).toMatchObject({ kind: "error", hasLastKnownData: false });
  });

  it("22. an initial HTTP-200 response whose JSON body normalizeHrDashboardPayload rejects (JSON null) is also treated as an error", async () => {
    stubRound({ dashboard: { ok: true, payload: null } });
    const { result } = renderHook(() => useMlbPropsData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dashboard).toBeNull();
    expect(result.current.error).toBe("Unable to load MLB model data.");
    expect(result.current.status).toMatchObject({ kind: "error", hasLastKnownData: false });
  });

  it("5a. successful empty-slate payload with a valid nextRunAt returns waiting-for-slate", async () => {
    stubRound({
      dashboard: {
        ok: true,
        payload: rawPayload({ games: [], pitchers: [], batters: [], nextRunAt: { time: "2026-07-16T13:00:00-04:00", label: "1:00 PM ET" } }),
      },
    });
    const { result } = renderHook(() => useMlbPropsData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dashboard).not.toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.status.kind).toBe("waiting-for-slate");
  });

  it("5b. successful empty-slate payload without a valid nextRunAt returns no-games-scheduled", async () => {
    stubRound({ dashboard: { ok: true, payload: rawPayload({ games: [], pitchers: [], batters: [], nextRunAt: null }) } });
    const { result } = renderHook(() => useMlbPropsData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.status.kind).toBe("no-games-scheduled");
  });

  it("6. current-slate payload with a fully confirmed lineup returns status current", async () => {
    stubRound({ dashboard: { ok: true, payload: rawPayload({ batters: [validBatter("confirmed")] }) } });
    const { result } = renderHook(() => useMlbPropsData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status.kind).toBe("current");
    expect(result.current.stale).toBe(false);
  });

  it("7. current-slate payload with a projected (unconfirmed) lineup returns status lineup-pending", async () => {
    stubRound({ dashboard: { ok: true, payload: rawPayload({ batters: [validBatter("projected")] }) } });
    const { result } = renderHook(() => useMlbPropsData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toMatchObject({ kind: "lineup-pending", confirmedCount: 0, totalCount: 1 });
    expect(result.current.stale).toBe(false);
  });

  it("7b. current-slate payload with a mixed confirmed/projected lineup also returns lineup-pending", async () => {
    stubRound({
      dashboard: {
        ok: true,
        payload: rawPayload({
          batters: [validBatter("confirmed"), { ...validBatter("projected"), playerId: 2, player: "Second Batter" }],
        }),
      },
    });
    const { result } = renderHook(() => useMlbPropsData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toMatchObject({ kind: "lineup-pending", confirmedCount: 1, totalCount: 2 });
  });

  it("8. a prior-slate payload returns status stale (direction past) and stale:true", async () => {
    stubRound({ dashboard: { ok: true, payload: rawPayload({ date: PAST_DATE }) } });
    const { result } = renderHook(() => useMlbPropsData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toMatchObject({ kind: "stale", direction: "past" });
    expect(result.current.stale).toBe(true);
  });

  it("9. a future-slate payload returns status stale with direction future, and stale:true", async () => {
    stubRound({ dashboard: { ok: true, payload: rawPayload({ date: FUTURE_DATE }) } });
    const { result } = renderHook(() => useMlbPropsData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toMatchObject({ kind: "stale", direction: "future" });
    expect(result.current.stale).toBe(true);
  });

  it("16. missing nextRunAt/pendingGames metadata keeps the safe defaults (pendingGames: [], nextRunAt: null)", async () => {
    const { nextRunAt: _n, pendingGames: _p, ...withoutMetadata } = rawPayload();
    stubRound({ dashboard: { ok: true, payload: withoutMetadata } });
    const { result } = renderHook(() => useMlbPropsData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pendingGames).toEqual([]);
    expect(result.current.nextRunAt).toBeNull();
  });

  it("17. propDate returns the typed dashboard date with no `any` cast involved", async () => {
    stubRound({ dashboard: { ok: true, payload: rawPayload({ date: todayEtDate() }) } });
    const { result } = renderHook(() => useMlbPropsData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.propDate).toBe(todayEtDate());
  });

  it("propDate is null before any dashboard has loaded", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { result } = renderHook(() => useMlbPropsData());
    expect(result.current.propDate).toBeNull();
  });
});

describe("useMlbPropsData — polling: error preservation and recovery", () => {
  it("10. a poll failure after a successful fetch retains the previous dashboard and reports a refresh error", async () => {
    vi.useFakeTimers();
    stubRound({ dashboard: { ok: true, payload: rawPayload() } });

    const { result } = renderHook(() => useMlbPropsData());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.loading).toBe(false);
    expect(result.current.dashboard).not.toBeNull();
    const dashboardBeforeFailure = result.current.dashboard;

    stubRound({ dashboard: { ok: "reject" }, bestBets: { ok: "reject" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); });

    expect(result.current.dashboard).toBe(dashboardBeforeFailure);
    expect(result.current.error).toBe("Unable to refresh MLB model data.");
  });

  it("10b. the same poll-failure scenario derives status:error with hasLastKnownData true (not the pre-failure status)", async () => {
    vi.useFakeTimers();
    stubRound({ dashboard: { ok: true, payload: rawPayload() } });

    const { result } = renderHook(() => useMlbPropsData());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.loading).toBe(false);

    stubRound({ dashboard: { ok: "reject" }, bestBets: { ok: "reject" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); });

    expect(result.current.status).toMatchObject({ kind: "error", hasLastKnownData: true });
    expect(result.current.error).toBe("Unable to refresh MLB model data.");
  });

  it("11. a poll failure followed by a successful recovery clears the error and restores a non-error status", async () => {
    vi.useFakeTimers();
    // Round 1: initial failure, no prior data.
    stubRound({ dashboard: { ok: "reject" }, bestBets: { ok: "reject" } });
    const { result } = renderHook(() => useMlbPropsData());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.error).toBe("Unable to load MLB model data.");
    expect(result.current.dashboard).toBeNull();

    // Round 2 (poll): recovers.
    stubRound({ dashboard: { ok: true, payload: rawPayload() } });
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); });

    expect(result.current.error).toBeNull();
    expect(result.current.dashboard).not.toBeNull();
    expect(result.current.status.kind).not.toBe("error");
    expect(result.current.status.kind).toBe("current");
  });

  it("12. a successful recovery with the SAME generatedAt as the pre-failure payload still clears the previous error", async () => {
    vi.useFakeTimers();
    const payload = rawPayload({ generatedAt: "2026-07-16T09:32:34.452Z" });

    // Round 1: success, establishes lastGeneratedAt.
    stubRound({ dashboard: { ok: true, payload } });
    const { result } = renderHook(() => useMlbPropsData());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.error).toBeNull();
    const dashboardAfterRound1 = result.current.dashboard;

    // Round 2: failure.
    stubRound({ dashboard: { ok: "reject" }, bestBets: { ok: "reject" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); });
    expect(result.current.error).toBe("Unable to refresh MLB model data.");
    expect(result.current.dashboard).toBe(dashboardAfterRound1);

    // Round 3: recovers with the identical generatedAt (dedupe-eligible).
    stubRound({ dashboard: { ok: true, payload } });
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); });

    expect(result.current.error).toBeNull();
    expect(result.current.status.kind).not.toBe("error");
  });

  it("13. a best-bets-only failure retains the dashboard update and the previous best bets, with a partial-failure error", async () => {
    vi.useFakeTimers();
    const round1BestBets = bestBetsPayload({ generatedAt: "round-1" });
    stubRound({ dashboard: { ok: true, payload: rawPayload() }, bestBets: { ok: true, payload: round1BestBets } });

    const { result } = renderHook(() => useMlbPropsData());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.bestBets).toEqual(round1BestBets);

    // Round 2: dashboard succeeds (new generatedAt so it's not deduped), best-bets fails.
    stubRound({
      dashboard: { ok: true, payload: rawPayload({ generatedAt: "2026-07-16T10:00:00.000Z" }) },
      bestBets: { ok: false },
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); });

    expect(result.current.dashboard?.generatedAt).toBe("2026-07-16T10:00:00.000Z");
    expect(result.current.bestBets).toEqual(round1BestBets); // preserved, not cleared
    expect(result.current.error).toBe("MLB model data loaded, but best bets could not be refreshed.");
  });

  it("14. a dashboard failure with an (unused) best-bets success leaves both dashboard and best bets exactly as before, with the refresh error", async () => {
    vi.useFakeTimers();
    const round1BestBets = bestBetsPayload({ generatedAt: "round-1" });
    stubRound({ dashboard: { ok: true, payload: rawPayload() }, bestBets: { ok: true, payload: round1BestBets } });

    const { result } = renderHook(() => useMlbPropsData());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const dashboardAfterRound1 = result.current.dashboard;

    // Round 2: dashboard fails; best-bets WOULD succeed, but per this hook's
    // documented design (dashboard is primary), a dashboard-round failure
    // does not apply any best-bets result at all this round.
    stubRound({ dashboard: { ok: "reject" }, bestBets: { ok: true, payload: bestBetsPayload({ generatedAt: "round-2-unused" }) } });
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); });

    expect(result.current.dashboard).toBe(dashboardAfterRound1);
    expect(result.current.bestBets).toEqual(round1BestBets);
    expect(result.current.error).toBe("Unable to refresh MLB model data.");
  });

  it("15. an unchanged dashboard generatedAt with a changed best-bets payload still updates best bets", async () => {
    vi.useFakeTimers();
    const payload = rawPayload({ generatedAt: "2026-07-16T09:32:34.452Z" });
    const round1BestBets = bestBetsPayload({ generatedAt: "round-1" });
    stubRound({ dashboard: { ok: true, payload }, bestBets: { ok: true, payload: round1BestBets } });

    const { result } = renderHook(() => useMlbPropsData());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const dashboardAfterRound1 = result.current.dashboard;

    // Round 2: identical dashboard payload (same generatedAt, dedupe-skips
    // the dashboard state write) but a genuinely different best-bets payload.
    const round2BestBets = bestBetsPayload({ generatedAt: "round-2" });
    stubRound({ dashboard: { ok: true, payload }, bestBets: { ok: true, payload: round2BestBets } });
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); });

    expect(result.current.dashboard).toEqual(dashboardAfterRound1);
    expect(result.current.bestBets).toEqual(round2BestBets);
    expect(result.current.error).toBeNull();
  });

  it("20. derived row builders still receive the retained dashboard's data after a poll failure (not reset to empty)", async () => {
    vi.useFakeTimers();
    stubRound({ dashboard: { ok: true, payload: rawPayload() } });

    const { result } = renderHook(() => useMlbPropsData());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.games.length).toBeGreaterThan(0);
    expect(result.current.pitchers.length).toBeGreaterThan(0);
    expect(result.current.batters.length).toBeGreaterThan(0);

    stubRound({ dashboard: { ok: "reject" }, bestBets: { ok: "reject" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); });

    expect(result.current.games.length).toBeGreaterThan(0);
    expect(result.current.pitchers.length).toBeGreaterThan(0);
    expect(result.current.batters.length).toBeGreaterThan(0);
  });

  it("23. a valid initial fetch followed by an HTTP-200 normalized-null poll retains the prior dashboard/arrays and reports a refresh error", async () => {
    vi.useFakeTimers();
    stubRound({ dashboard: { ok: true, payload: rawPayload() } });

    const { result } = renderHook(() => useMlbPropsData());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.dashboard).not.toBeNull();
    const dashboardBeforeFailure = result.current.dashboard;
    const gamesBeforeFailure = result.current.games;
    const pitchersBeforeFailure = result.current.pitchers;
    const battersBeforeFailure = result.current.batters;

    // Round 2: HTTP-200, parseable, but a shape normalizeHrDashboardPayload rejects.
    stubRound({ dashboard: { ok: true, payload: "unexpected string response" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); });

    expect(result.current.dashboard).toBe(dashboardBeforeFailure);
    expect(result.current.games).toEqual(gamesBeforeFailure);
    expect(result.current.pitchers).toEqual(pitchersBeforeFailure);
    expect(result.current.batters).toEqual(battersBeforeFailure);
    expect(result.current.error).toBe("Unable to refresh MLB model data.");
    expect(result.current.status).toMatchObject({ kind: "error", hasLastKnownData: true });
  });

  it("24. a normalized-null dashboard failure with a successful (changed) best-bets response still treats the round as a dashboard failure -- best bets unchanged, error not cleared", async () => {
    vi.useFakeTimers();
    const round1BestBets = bestBetsPayload({ generatedAt: "round-1" });
    stubRound({ dashboard: { ok: true, payload: rawPayload() }, bestBets: { ok: true, payload: round1BestBets } });

    const { result } = renderHook(() => useMlbPropsData());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const dashboardAfterRound1 = result.current.dashboard;
    expect(result.current.bestBets).toEqual(round1BestBets);

    // Round 2: dashboard normalizes to null; best bets would succeed if
    // applied, but per the existing dashboard-failure policy (test #14)
    // it is left untouched this round -- neither applied nor blamed.
    stubRound({
      dashboard: { ok: true, payload: null },
      bestBets: { ok: true, payload: bestBetsPayload({ generatedAt: "round-2-unused" }) },
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); });

    expect(result.current.dashboard).toBe(dashboardAfterRound1);
    expect(result.current.bestBets).toEqual(round1BestBets);
    expect(result.current.error).toBe("Unable to refresh MLB model data.");
  });

  it("25a. a valid recovery after a normalized-null failure with no prior data populates the dashboard and clears the error", async () => {
    vi.useFakeTimers();
    // Round 1: normalized-null failure, nothing has ever loaded.
    stubRound({ dashboard: { ok: true, payload: "unexpected string response" } });
    const { result } = renderHook(() => useMlbPropsData());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.dashboard).toBeNull();
    expect(result.current.error).toBe("Unable to load MLB model data.");

    // Round 2: recovers with a valid payload -- dashboard updates for the first time.
    stubRound({ dashboard: { ok: true, payload: rawPayload() } });
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); });

    expect(result.current.error).toBeNull();
    expect(result.current.dashboard).not.toBeNull();
    expect(result.current.status.kind).toBe("current");
  });

  it("25b. a valid recovery after a normalized-null failure, with the SAME generatedAt as the pre-failure success, dedupes the dashboard write but still clears the error", async () => {
    vi.useFakeTimers();
    const payload = rawPayload({ generatedAt: "2026-07-16T09:32:34.452Z" });

    // Round 1: success, establishes lastGeneratedAt and a retained dashboard.
    stubRound({ dashboard: { ok: true, payload } });
    const { result } = renderHook(() => useMlbPropsData());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const dashboardAfterRound1 = result.current.dashboard;
    expect(result.current.error).toBeNull();

    // Round 2: normalized-null failure.
    stubRound({ dashboard: { ok: true, payload: null } });
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); });
    expect(result.current.dashboard).toBe(dashboardAfterRound1);
    expect(result.current.error).toBe("Unable to refresh MLB model data.");

    // Round 3: recovers with the identical generatedAt (dedupe-eligible).
    stubRound({ dashboard: { ok: true, payload } });
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); });

    expect(result.current.dashboard).toBe(dashboardAfterRound1); // deduped, same reference
    expect(result.current.error).toBeNull();
    expect(result.current.status.kind).not.toBe("error");
  });
});

describe("useMlbPropsData — unmount safety", () => {
  it("18. unmounting during an in-flight initial request causes no errors and no further state updates", async () => {
    let resolveFetch: (() => void) | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = () => resolve({ ok: true, json: () => Promise.resolve(rawPayload()) } as Response);
          }),
      ),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { unmount } = renderHook(() => useMlbPropsData());
    unmount();

    // Resolve the in-flight fetch AFTER unmount -- the `active` guard must
    // prevent any subsequent setState call from doing anything observable.
    expect(() => resolveFetch?.()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const reactActWarnings = consoleError.mock.calls.filter((call) => String(call[0]).includes("not wrapped in act"));
    expect(reactActWarnings).toHaveLength(0);
    consoleError.mockRestore();
  });

  it("19. the 10-minute poll interval is cleaned up on unmount (no fetch after unmount)", async () => {
    vi.useFakeTimers();
    stubRound({ dashboard: { ok: true, payload: rawPayload() } });

    const { result, unmount } = renderHook(() => useMlbPropsData());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.loading).toBe(false);

    const fetchMock = globalThis.fetch as unknown as { mock: { calls: unknown[] } };
    const callCountAtUnmount = fetchMock.mock.calls.length;

    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2); });

    expect(fetchMock.mock.calls.length).toBe(callCountAtUnmount);
  });
});
