import { describe, expect, it } from "vitest";
import { buildGsisToPfr, buildSnapIndex, laggingPriorWeeks, parseSnapCountRows, pointInTimeSnapFeatures, rawGsisId, type SnapCountRow } from "./pointInTimeSnap";

const row = (season: number, week: number, pct: number | null, snaps = 50, id = "P1", team = "buf"): SnapCountRow => ({ season, week, pfrPlayerId: id, team, position: "WR", offenseSnaps: snaps, offensePct: pct });

describe("point-in-time snap features", () => {
  const rows = [row(2025, 16, 0.9), row(2025, 17, 0.8), row(2025, 18, 0.03), row(2026, 1, 0.7), row(2026, 2, 0.8), row(2026, 3, 0.1)];
  const index = buildSnapIndex(rows);

  it("uses only games strictly before the target week (target and later weeks never leak)", () => {
    const f = pointInTimeSnapFeatures(index, "P1", { season: 2026, week: 3 });
    expect(f.snapShareL3).toBeCloseTo((0.03 + 0.7 + 0.8) / 3, 10);
    expect(f.gamesPlayedSeasonPrior).toBe(2);
    expect(f.lastGame).toEqual({ season: 2026, week: 2, team: "buf" });
    expect(f.sourceGames.every((g) => g.season < 2026 || g.week < 3)).toBe(true);
    const w2 = pointInTimeSnapFeatures(index, "P1", { season: 2026, week: 2 });
    expect(w2.snapShareL3).toBeCloseTo((0.8 + 0.03 + 0.7) / 3, 10);
  });
  it("crosses the season boundary and is null with no prior games", () => {
    const w1 = pointInTimeSnapFeatures(index, "P1", { season: 2026, week: 1 });
    expect(w1.snapShareL3).toBeCloseTo((0.9 + 0.8 + 0.03) / 3, 10);
    expect(w1.snapShareSeasonToDate).toBeNull();
    expect(pointInTimeSnapFeatures(index, "P1", { season: 2025, week: 16 })).toMatchObject({ available: false, snapShareL3: null, gamesUsedL3: 0 });
    expect(pointInTimeSnapFeatures(index, null, { season: 2026, week: 3 }).available).toBe(false);
    expect(pointInTimeSnapFeatures(index, "UNKNOWN", { season: 2026, week: 3 }).available).toBe(false);
  });
  it("is invariant to corrupting the target and later rows", () => {
    const corrupted = buildSnapIndex(rows.map((r) => (r.season === 2026 && r.week >= 3 ? { ...r, offensePct: 0.999, offenseSnaps: 999 } : r)));
    expect(pointInTimeSnapFeatures(corrupted, "P1", { season: 2026, week: 3 })).toEqual(pointInTimeSnapFeatures(index, "P1", { season: 2026, week: 3 }));
  });
  it("parses REG rows only, validates numerics, keeps the higher share for duplicate weeks", () => {
    const parsed = parseSnapCountRows([
      { game_type: "REG", pfr_player_id: "A", season: "2026", week: "1", team: "BUF", position: "WR", offense_snaps: "40", offense_pct: "0.61" },
      { game_type: "POST", pfr_player_id: "A", season: "2026", week: "19", team: "BUF", position: "WR", offense_snaps: "40", offense_pct: "0.61" },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ team: "buf", offensePct: 0.61 });
    expect(() => parseSnapCountRows([{ game_type: "REG", pfr_player_id: "A", season: "2026", week: "1", offense_snaps: "x", offense_pct: "0.5" }])).toThrow();
    expect(() => parseSnapCountRows([{ game_type: "REG", pfr_player_id: "A", season: "2026", week: "1", offense_snaps: "4", offense_pct: "1.7" }])).toThrow();
    const dup = buildSnapIndex([row(2026, 1, 0.2, 10, "D", "nyj"), row(2026, 1, 0.6, 30, "D", "buf")]);
    expect(dup.get("D")).toHaveLength(1);
    expect(dup.get("D")![0].offensePct).toBe(0.6);
  });
  it("maps GSIS ids to PFR ids and flags lagging prior weeks", () => {
    expect(buildGsisToPfr([{ gsis_id: "00-1", pfr_id: "AbcD01" }, { gsis_id: "00-2", pfr_id: "" }]).get("00-1")).toBe("AbcD01");
    expect(rawGsisId("gsis:00-1")).toBe("00-1");
    expect(rawGsisId("pfr:X")).toBeNull();
    const many = Array.from({ length: 1200 }, (_, i) => row(2026, 1, 0.5, 10, `X${i}`));
    expect(laggingPriorWeeks(many, 2026, 3)).toEqual([2]);
  });
});
