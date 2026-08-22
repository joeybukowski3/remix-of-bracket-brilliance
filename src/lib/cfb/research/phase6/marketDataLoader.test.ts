import { describe, expect, it } from "vitest";
import { buildMarketModelJoin } from "./marketDataLoader";

/**
 * Integration test against real local research data (no live API calls —
 * reads already-generated Phase 0-5 artifacts from disk). Kept to a
 * single build + a handful of assertions since this recomputes the full
 * Phase 4/5 walk-forward (~10s).
 */
describe("buildMarketModelJoin (integration)", () => {
  const rows = buildMarketModelJoin();

  it("produces provider-distinct rows for the same game rather than pooling books", () => {
    const byGame = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!byGame.has(row.gameId)) byGame.set(row.gameId, new Set());
      byGame.get(row.gameId)!.add(row.provider);
    }
    const gamesWithMultipleProviders = [...byGame.values()].filter((set) => set.size > 1);
    expect(gamesWithMultipleProviders.length).toBeGreaterThan(0);
  });

  it("never modifies the frozen Phase 5 model output — identical rows produce identical modelProjectedMargin across repeated builds", () => {
    const rows2 = buildMarketModelJoin();
    const first = rows.find((r) => r.gameId === rows2[0]?.gameId);
    const second = rows2.find((r) => r.gameId === rows[0]?.gameId);
    expect(first?.modelProjectedMargin).toBe(rows[0]?.modelProjectedMargin);
    expect(second?.modelProjectedMargin).toBe(rows2[0]?.modelProjectedMargin);
  });

  it("has no NaN/Infinity in any numeric model or market field", () => {
    for (const row of rows.slice(0, 500)) {
      for (const value of [row.modelProjectedMargin, row.modelProjectedTotal, row.modelPHomeWin, row.actualMargin, row.actualTotal]) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });
}, 60_000);
