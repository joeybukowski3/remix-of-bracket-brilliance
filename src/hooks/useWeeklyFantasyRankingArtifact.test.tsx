import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loader = vi.hoisted(() => vi.fn());
vi.mock("@/lib/fantasy/weekly/artifactLoader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/fantasy/weekly/artifactLoader")>();
  return { ...actual, loadWeeklyFantasyRankingState: loader };
});

import { useWeeklyFantasyRankingArtifact } from "./useWeeklyFantasyRankingArtifact";

describe("useWeeklyFantasyRankingArtifact", () => {
  beforeEach(() => loader.mockReset());

  it("delegates season/week loading to the canonical loader and exposes its state", async () => {
    loader.mockResolvedValue({ status: "missing", season: 2026, week: 2, error: new Error("missing") });
    const { result } = renderHook(() => useWeeklyFantasyRankingArtifact(2026, 2));
    expect(result.current).toEqual({ status: "loading", season: 2026, week: 2 });
    await waitFor(() => expect(result.current.status).toBe("missing"));
    expect(loader).toHaveBeenCalledWith(2026, 2);
  });

  it("reloads when the selected week changes", async () => {
    loader.mockImplementation(async (_season: number, week: number) => ({ status: "missing", season: 2026, week, error: new Error("missing") }));
    const { rerender } = renderHook(({ week }) => useWeeklyFantasyRankingArtifact(2026, week), { initialProps: { week: 1 } });
    await waitFor(() => expect(loader).toHaveBeenCalledWith(2026, 1));
    rerender({ week: 3 });
    await waitFor(() => expect(loader).toHaveBeenCalledWith(2026, 3));
  });
});
