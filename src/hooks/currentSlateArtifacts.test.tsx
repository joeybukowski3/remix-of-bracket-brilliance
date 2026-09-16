import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNflTouchdownPreview } from "./useNflTouchdownPreview";
import { useNflYardageProjections } from "./useNflYardageProjections";

vi.mock("./useNflSeasonData", () => ({ useNflSeasonData: () => ({ loading: false, error: null, data: { games: [
  { seasonType: "REG", week: 1, dateUtc: "2026-09-15T00:15:00Z" },
  { seasonType: "REG", week: 2, dateUtc: "2026-09-22T00:15:00Z" },
] } }) }));

beforeEach(() => vi.setSystemTime(new Date("2026-09-16T12:00:00Z")));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("current-slate artifact loaders", () => {
  it.each(["yardage", "touchdown"])("rejects Week 1 %s when the schedule resolves Week 2", async (kind) => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ schemaVersion: "nfl-touchdown-preview-v1", season: 2026, week: 1, rows: [], players: [] }) })));
    const { result } = renderHook(() => kind === "yardage" ? useNflYardageProjections(2026) : useNflTouchdownPreview(2026));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toContain("Week 2");
  });
  it.each(["yardage", "touchdown"])("loads current Week 2 %s", async (kind) => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ schemaVersion: "nfl-touchdown-preview-v1", season: 2026, week: 2, rows: [{ season: 2026, week: 2 }], players: [] }) })));
    const { result } = renderHook(() => kind === "yardage" ? useNflYardageProjections(2026) : useNflTouchdownPreview(2026));
    await waitFor(() => expect(result.current.data?.week).toBe(2));
    expect(result.current.error).toBeNull();
  });
});
