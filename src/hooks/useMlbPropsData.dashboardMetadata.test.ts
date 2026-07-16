/**
 * Focused tests proving useMlbPropsData actually surfaces the normalized
 * nextRunAt/pendingGames fields end-to-end (fetch -> normalize -> hook
 * return), matching the safe-default contract documented at the call
 * site: `dashboard?.nextRunAt ?? null` / `dashboard?.pendingGames ?? []`.
 * No `any` casts remain for either field.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useMlbPropsData } from "./useMlbPropsData";

const RAW_WITH_METADATA = {
  date: "2026-07-16",
  generatedAt: "2026-07-16T09:32:34.452Z",
  games: [],
  pitchers: [],
  batters: [],
  nextRunAt: { time: "2026-07-16T13:00:00-04:00", label: "1:00 PM ET" },
  pendingGames: [{ matchup: "SEA @ TEX", gameKey: "SEA@TEX", missingPitcherSide: ["SEA"] }],
};

const RAW_WITHOUT_METADATA = {
  date: "2026-07-16",
  generatedAt: "2026-07-16T09:32:34.452Z",
  games: [],
  pitchers: [],
  batters: [],
};

const EMPTY_BEST_BETS = { date: "", generatedAt: "", bestBets: [], valueBets: [], longshots: [] };

function stubFetch(rawPayload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (String(url).includes("hr-props-raw.json")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(rawPayload) } as Response);
      }
      if (String(url).includes("hr-props-best-bets.json")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(EMPTY_BEST_BETS) } as Response);
      }
      // Reference-range artifact and anything else: fail closed, matching
      // the hook's own tolerant fetchRangeArtifact() catch path.
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
    }),
  );
}

describe("useMlbPropsData — dashboard schedule metadata plumbing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the normalized nextRunAt object when the raw payload provides one", async () => {
    stubFetch(RAW_WITH_METADATA);
    const { result } = renderHook(() => useMlbPropsData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.nextRunAt).toEqual({ time: "2026-07-16T13:00:00-04:00", label: "1:00 PM ET" });
  });

  it("returns the normalized pendingGames array when the raw payload provides one", async () => {
    stubFetch(RAW_WITH_METADATA);
    const { result } = renderHook(() => useMlbPropsData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pendingGames).toEqual([
      { matchup: "SEA @ TEX", gameKey: "SEA@TEX", gameId: null, venue: undefined, officialGameDate: undefined, gameStartTime: undefined, gameNumber: null, doubleHeader: undefined, missingPitcherSide: ["SEA"] },
    ]);
  });

  it("returns the safe defaults (nextRunAt: null, pendingGames: []) when the raw payload omits the metadata", async () => {
    stubFetch(RAW_WITHOUT_METADATA);
    const { result } = renderHook(() => useMlbPropsData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.nextRunAt).toBeNull();
    expect(result.current.pendingGames).toEqual([]);
  });

  it("returns the same safe defaults when the fetch fails entirely (dashboard stays null)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));
    const { result } = renderHook(() => useMlbPropsData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.dashboard).toBeNull();
    expect(result.current.nextRunAt).toBeNull();
    expect(result.current.pendingGames).toEqual([]);
  });
});
