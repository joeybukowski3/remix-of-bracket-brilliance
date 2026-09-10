import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DFS_COLUMNS_STORAGE_KEY, useDfsColumnVisibility } from "@/hooks/useDfsColumnVisibility";
import { dfsColumnForSortKey } from "@/lib/nfl/dfs/columnRegistry";

const salary = dfsColumnForSortKey("salary")!;
const player = dfsColumnForSortKey("player")!;

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("useDfsColumnVisibility", () => {
  it("defaults to every column visible on desktop", () => {
    const { result } = renderHook(() => useDfsColumnVisibility("desktop"));
    expect(result.current.isVisible("salary")).toBe(true);
    expect(result.current.isVisible("fantasyPpg")).toBe(true);
    expect(result.current.isCustomized).toBe(false);
  });

  it("defaults to the lean set on mobile", () => {
    const { result } = renderHook(() => useDfsColumnVisibility("mobile"));
    expect(result.current.isVisible("matchup")).toBe(true);
    expect(result.current.isVisible("salary")).toBe(false);
    expect(result.current.isVisible("fantasyPpg")).toBe(false);
  });

  it("toggles a column and persists it", () => {
    const { result } = renderHook(() => useDfsColumnVisibility("desktop"));
    act(() => result.current.toggle(salary));
    expect(result.current.isVisible("salary")).toBe(false);
    expect(window.localStorage.getItem(DFS_COLUMNS_STORAGE_KEY)).toContain("salary");
    // A fresh hook rehydrates from storage.
    const second = renderHook(() => useDfsColumnVisibility("desktop"));
    expect(second.result.current.isVisible("salary")).toBe(false);
  });

  it("never hides a mandatory column", () => {
    const { result } = renderHook(() => useDfsColumnVisibility("desktop"));
    act(() => result.current.toggle(player));
    expect(result.current.isVisible("player")).toBe(true);
  });

  it("ignores stale/unknown ids from storage", () => {
    window.localStorage.setItem(DFS_COLUMNS_STORAGE_KEY, JSON.stringify({ v: 1, hidden: ["salary", "nope", "player"] }));
    const { result } = renderHook(() => useDfsColumnVisibility("desktop"));
    expect(result.current.isVisible("salary")).toBe(false);
    expect(result.current.isVisible("player")).toBe(true);
    expect(result.current.isVisible("proj")).toBe(true);
  });

  it("resets to the layout defaults and clears storage", () => {
    const { result } = renderHook(() => useDfsColumnVisibility("desktop"));
    act(() => result.current.toggle(salary));
    expect(result.current.isCustomized).toBe(true);
    act(() => result.current.reset());
    expect(result.current.isVisible("salary")).toBe(true);
    expect(result.current.isCustomized).toBe(false);
    expect(window.localStorage.getItem(DFS_COLUMNS_STORAGE_KEY)).toBeNull();
  });

  it("survives a rejected v mismatch without throwing", () => {
    window.localStorage.setItem(DFS_COLUMNS_STORAGE_KEY, JSON.stringify({ v: 99, hidden: ["salary"] }));
    const { result } = renderHook(() => useDfsColumnVisibility("desktop"));
    expect(result.current.isVisible("salary")).toBe(true);
  });

  it("filters a view's columns by visibility in canonical order", () => {
    const { result } = renderHook(() => useDfsColumnVisibility("desktop"));
    act(() => result.current.toggle(salary));
    const ids = result.current.columnsForView("VALUE").map((column) => column.id);
    expect(ids[0]).toBe("player");
    expect(ids).not.toContain("salary");
  });
});
