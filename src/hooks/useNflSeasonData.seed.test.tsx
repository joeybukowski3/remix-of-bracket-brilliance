import { renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NflSeasonDataSeedContext, toNflSeasonData, useNflSeasonData, type NflSeasonData } from "./useNflSeasonData";

const SEED: NflSeasonData = toNflSeasonData({ teams: [] }, { games: [], _meta: { season: 2026 } as never }, { results: [] });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useNflSeasonData prerender seed", () => {
  it("starts loading and fetches when no seed is provided (the browser path)", () => {
    const fetchSpy = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useNflSeasonData(2026));
    expect(result.current).toEqual({ loading: true, error: null, data: null });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("renders the seeded season on the first render (the server-render path, where effects never run)", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    function Probe() {
      const state = useNflSeasonData(2026);
      return <span>{`${state.loading}|${state.data === SEED}`}</span>;
    }
    const html = renderToString(
      <NflSeasonDataSeedContext.Provider value={new Map([[2026, SEED]])}>
        <Probe />
      </NflSeasonDataSeedContext.Provider>,
    );
    expect(html).toContain("false|true");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ignores a seed for a different season", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <NflSeasonDataSeedContext.Provider value={new Map([[2025, SEED]])}>{children}</NflSeasonDataSeedContext.Provider>
    );
    const { result } = renderHook(() => useNflSeasonData(2026), { wrapper });
    expect(result.current.loading).toBe(true);
  });

  it("shapes season files exactly as the fetch path does", () => {
    expect(toNflSeasonData({}, {}, {})).toEqual({ teams: [], games: [], results: [], gamesMeta: null, resultsMeta: null });
  });
});
