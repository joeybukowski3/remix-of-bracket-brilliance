/**
 * Focused tests for useNflBettingLines: the fetch hook backing the later NFL
 * matchup current-market + line-movement UI. The current artifact is required;
 * the per-game history file is optional and degrades to movement: null.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNflBettingLines } from "./useNflBettingLines";

const GAME_ID = "2026_01_NE_SEA";

const CURRENT = {
  schemaVersion: "jkb-betting-lines-current-v1",
  generatedAt: "2026-08-31T12:31:48.198Z",
  games: [
    {
      league: "nfl",
      season: 2026,
      week: 1,
      jkbGameId: GAME_ID,
      awayTeamId: "ne",
      homeTeamId: "sea",
      kickoffUtc: "2026-09-10T00:20:00.000Z",
      books: [
        {
          provider: "the-odds-api",
          providerEventId: "evt",
          sportsbook: "fanduel",
          capturedAt: "2026-08-31T12:19:50.302Z",
          providerUpdatedAt: "2026-08-31T12:31:09.000Z",
          firstObservedAt: "2026-08-31T12:19:50.302Z",
          lastObservedAt: "2026-08-31T12:31:47.237Z",
          contentHash: "hash",
          spread: { homeLine: -3.5, awayLine: 3.5, homePrice: -110, awayPrice: -110 },
          total: { line: 44.5, overPrice: -110, underPrice: -110 },
          moneyline: { homePrice: -190, awayPrice: 160 },
        },
        {
          provider: "the-odds-api",
          providerEventId: "evt",
          sportsbook: "draftkings",
          capturedAt: "2026-08-31T12:19:50.302Z",
          providerUpdatedAt: "2026-08-31T12:31:12.000Z",
          firstObservedAt: "2026-08-31T12:19:50.302Z",
          lastObservedAt: "2026-08-31T12:31:47.237Z",
          contentHash: "hash2",
          spread: { homeLine: -3, awayLine: 3, homePrice: -110, awayPrice: -110 },
          total: { line: 45, overPrice: -110, underPrice: -110 },
          moneyline: { homePrice: -175, awayPrice: 150 },
        },
      ],
    },
  ],
};

const HISTORY = {
  schemaVersion: "jkb-betting-lines-history-v1",
  generatedAt: "2026-08-31T12:31:48.198Z",
  league: "nfl",
  season: 2026,
  jkbGameId: GAME_ID,
  awayTeamId: "ne",
  homeTeamId: "sea",
  kickoffUtc: "2026-09-10T00:20:00.000Z",
  series: [
    {
      provider: "the-odds-api",
      providerEventId: "evt",
      sportsbook: "draftkings",
      capturedAt: "2026-08-31T09:00:00.000Z",
      providerUpdatedAt: "2026-08-31T09:00:00.000Z",
      firstObservedAt: "2026-08-31T09:00:00.000Z",
      lastObservedAt: "2026-08-31T09:30:00.000Z",
      contentHash: "h1",
      spread: { homeLine: -2, awayLine: 2, homePrice: -110, awayPrice: -110 },
      total: { line: 44, overPrice: -110, underPrice: -110 },
      moneyline: { homePrice: -135, awayPrice: 115 },
    },
    {
      provider: "the-odds-api",
      providerEventId: "evt",
      sportsbook: "draftkings",
      capturedAt: "2026-08-31T12:00:00.000Z",
      providerUpdatedAt: "2026-08-31T12:00:00.000Z",
      firstObservedAt: "2026-08-31T12:00:00.000Z",
      lastObservedAt: "2026-08-31T12:31:47.237Z",
      contentHash: "h2",
      spread: { homeLine: -3, awayLine: 3, homePrice: -110, awayPrice: -110 },
      total: { line: 45, overPrice: -110, underPrice: -110 },
      moneyline: { homePrice: -175, awayPrice: 150 },
    },
  ],
};

type FetchPlan = {
  current?: { ok: boolean; body?: unknown };
  history?: { ok: boolean; body?: unknown } | "reject";
};

function stubFetch(plan: FetchPlan): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const isHistory = url.includes("betting-lines-history");
      const entry = isHistory ? plan.history : plan.current;
      if (entry === "reject") return Promise.reject(new Error("network down"));
      if (!entry) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
      return Promise.resolve({
        ok: entry.ok,
        status: entry.ok ? 200 : 500,
        json: () => Promise.resolve(entry.body ?? {}),
      } as Response);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useNflBettingLines", () => {
  it("stays idle (not loading) with no game id", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { result } = renderHook(() => useNflBettingLines(null));
    expect(result.current).toEqual({ loading: false, error: null, current: null, movement: null });
  });

  it("selects DraftKings and derives movement for the same book", async () => {
    stubFetch({ current: { ok: true, body: CURRENT }, history: { ok: true, body: HISTORY } });
    const { result } = renderHook(() => useNflBettingLines(GAME_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.current?.sportsbook.id).toBe("draftkings");
    expect(result.current.current?.spread?.homeLine).toBe(-3);
    expect(result.current.movement?.sportsbook.id).toBe("draftkings");
    expect(result.current.movement?.spread?.move).toBe(-1);
    expect(result.current.movement?.total?.move).toBe(1);
  });

  it("degrades to movement: null when the history file is missing", async () => {
    stubFetch({ current: { ok: true, body: CURRENT } });
    const { result } = renderHook(() => useNflBettingLines(GAME_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.current?.sportsbook.id).toBe("draftkings");
    expect(result.current.movement).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("degrades to movement: null when the history fetch rejects", async () => {
    stubFetch({ current: { ok: true, body: CURRENT }, history: "reject" });
    const { result } = renderHook(() => useNflBettingLines(GAME_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.current).not.toBeNull();
    expect(result.current.movement).toBeNull();
  });

  it("surfaces an error when the current artifact is unavailable", async () => {
    stubFetch({});
    const { result } = renderHook(() => useNflBettingLines(GAME_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/unavailable/i);
    expect(result.current.current).toBeNull();
  });

  it("surfaces an error when the current artifact is malformed", async () => {
    stubFetch({ current: { ok: true, body: { nope: true } } });
    const { result } = renderHook(() => useNflBettingLines(GAME_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/malformed/i);
  });

  it("returns null current for a game absent from the artifact", async () => {
    stubFetch({ current: { ok: true, body: CURRENT }, history: { ok: true, body: HISTORY } });
    const { result } = renderHook(() => useNflBettingLines("2026_01_DAL_NYG"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.current).toBeNull();
    expect(result.current.movement).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
