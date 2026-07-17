/**
 * Focused tests for useMlbBvpHistory: the polling fetch hook backing the
 * display-only "AVG vs P" column and expandable history panel on
 * /mlb/hr-props and /mlb/batter-vs-pitcher.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { keyForBvpRow, useMlbBvpHistory } from "./useMlbBvpHistory";

function stubFetch(options: { ok: true; payload: unknown } | { ok: false } | { ok: "reject" }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      if (options.ok === "reject") return Promise.reject(new Error("network down"));
      if (!options.ok) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
      return Promise.resolve({ ok: true, json: () => Promise.resolve(options.payload) } as Response);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("keyForBvpRow", () => {
  it("builds the same key the generator would build for a batter/pitcher id pair", () => {
    expect(keyForBvpRow(665742, 605400)).toBe("665742|605400");
  });

  it("returns null when either id is missing, rather than building a partial key", () => {
    expect(keyForBvpRow(null, 605400)).toBeNull();
    expect(keyForBvpRow(665742, null)).toBeNull();
    expect(keyForBvpRow(undefined, undefined)).toBeNull();
  });
});

describe("useMlbBvpHistory", () => {
  it("starts loading with an empty history map", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { result } = renderHook(() => useMlbBvpHistory());
    expect(result.current.loading).toBe(true);
    expect(result.current.fileUnavailable).toBe(false);
    expect(result.current.historyByKey.size).toBe(0);
  });

  it("loads and indexes history entries by key on success", async () => {
    const entry = { key: "665742|605400", batterId: 665742, pitcherId: 605400, batter: "Juan Soto", pitcher: "Aaron Nola", career: { pa: 59, h: 11, avg: 0.262, hr: 5 }, last5y: null };
    stubFetch({ ok: true, payload: { generatedAt: "2026-07-17T00:00:00.000Z", source: "mlb_stats_api", date: "2026-07-17", history: [entry] } });

    const { result } = renderHook(() => useMlbBvpHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.fileUnavailable).toBe(false);
    expect(result.current.historyByKey.get("665742|605400")).toEqual(entry);
  });

  it("marks the file unavailable on a non-OK HTTP response, without throwing", async () => {
    stubFetch({ ok: false });
    const { result } = renderHook(() => useMlbBvpHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.fileUnavailable).toBe(true);
    expect(result.current.historyByKey.size).toBe(0);
  });

  it("marks the file unavailable when the fetch itself rejects (network failure), without throwing", async () => {
    stubFetch({ ok: "reject" });
    const { result } = renderHook(() => useMlbBvpHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.fileUnavailable).toBe(true);
  });

  it("treats a missing/non-array history field as an empty map rather than crashing", async () => {
    stubFetch({ ok: true, payload: { generatedAt: "2026-07-17T00:00:00.000Z", date: "2026-07-17" } });
    const { result } = renderHook(() => useMlbBvpHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.fileUnavailable).toBe(false);
    expect(result.current.historyByKey.size).toBe(0);
  });
});
