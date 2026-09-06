/**
 * The four /nfl/performance artifacts must load independently: a failure in
 * one family (most often health.json) must not blank the others.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useNflPerformanceData } from "./useNflPerformanceData";

const OVERVIEW = {
  performanceMeta: { generatedAt: "2026-09-05T12:00:00.000Z" },
  totals: { graded_games: 0 },
  props: { graded_props: 0 },
  sides: { graded_games: 0, market_direction_metric: {} },
};
const TOTALS = { performanceMeta: {}, summary: {}, buckets: {}, rows: [] };
const PROPS = { performanceMeta: {}, summary: {}, coverage: {}, rows: [] };

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useNflPerformanceData", () => {
  it("keeps overview/totals/props usable when health.json fails to load", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("health.json")) return Promise.reject(new Error("network"));
      if (url.includes("overview.json")) return Promise.resolve(jsonResponse(OVERVIEW));
      if (url.includes("totals.json")) return Promise.resolve(jsonResponse(TOTALS));
      if (url.includes("props.json")) return Promise.resolve(jsonResponse(PROPS));
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    const { result } = renderHook(() => useNflPerformanceData());

    await waitFor(() => {
      expect(result.current.overview.data).not.toBeNull();
      expect(result.current.totals.data).not.toBeNull();
      expect(result.current.props.data).not.toBeNull();
      expect(result.current.health.error).toBeTruthy();
    });
    expect(result.current.health.data).toBeNull();
  });

  it("reports a malformed artifact as an error without throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("overview.json")) return Promise.resolve(jsonResponse({ nonsense: true }));
      if (url.includes("totals.json")) return Promise.resolve(jsonResponse(TOTALS));
      if (url.includes("props.json")) return Promise.resolve(jsonResponse(PROPS));
      return Promise.resolve(jsonResponse({ totals: {}, props: {}, sides: {} }));
    });

    const { result } = renderHook(() => useNflPerformanceData());

    await waitFor(() => {
      expect(result.current.overview.error).toBeTruthy();
      expect(result.current.totals.data).not.toBeNull();
    });
  });
});
