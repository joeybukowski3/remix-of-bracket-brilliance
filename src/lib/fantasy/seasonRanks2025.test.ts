import { describe, expect, it } from "vitest";
import parActualSource from "../../../data/fantasy/2025-par-actual.json";
import {
  SEASON_RANKS_2025,
  buildSeasonRanks2025,
  getSeasonRank2025,
} from "@/lib/fantasy/seasonRanks2025";
import type { FantasyParActualSourceRow } from "@/lib/fantasy/parActual2025";

const rawRows = parActualSource as readonly FantasyParActualSourceRow[];

function base(overrides: Partial<FantasyParActualSourceRow>): FantasyParActualSourceRow {
  return {
    Player: "Test",
    Team: "ATL",
    Position: "WR",
    "Source ID": "Test01",
    "2025 Games Played": 17,
    "2025 Fantasy Points": 100,
    "2025 PPG": 5.9,
    "2025 Replacement PPG": 1,
    "2025 PAR/G": 1,
    "2025 Season PAR": 1,
    ...overrides,
  };
}

describe("buildSeasonRanks2025", () => {
  it("ranks by points and by PPG independently", () => {
    // B outscores C in total but trails on a per-game basis.
    const index = buildSeasonRanks2025([
      base({ "Source ID": "A", "2025 Fantasy Points": 300, "2025 PPG": 20 }),
      base({ "Source ID": "B", "2025 Fantasy Points": 200, "2025 PPG": 12 }),
      base({ "Source ID": "C", "2025 Fantasy Points": 150, "2025 PPG": 15 }),
    ]);
    expect(index.get("A")).toMatchObject({ byPoints: 1, byPpg: 1 });
    expect(index.get("B")).toMatchObject({ byPoints: 2, byPpg: 3 });
    expect(index.get("C")).toMatchObject({ byPoints: 3, byPpg: 2 });
  });

  it("gives tied values the same rank and skips the next", () => {
    const index = buildSeasonRanks2025([
      base({ "Source ID": "A", "2025 Fantasy Points": 300, "2025 PPG": 20 }),
      base({ "Source ID": "B", "2025 Fantasy Points": 200, "2025 PPG": 10 }),
      base({ "Source ID": "C", "2025 Fantasy Points": 200, "2025 PPG": 5 }),
      base({ "Source ID": "D", "2025 Fantasy Points": 100, "2025 PPG": 1 }),
    ]);
    expect(index.get("B")!.byPoints).toBe(2);
    expect(index.get("C")!.byPoints).toBe(2);
    expect(index.get("D")!.byPoints).toBe(4);
  });

  it("ranks each position in its own pool", () => {
    const index = buildSeasonRanks2025([
      base({ "Source ID": "wr", Position: "WR", "2025 Fantasy Points": 100 }),
      base({ "Source ID": "te", Position: "TE", "2025 Fantasy Points": 50 }),
    ]);
    expect(index.get("wr")).toMatchObject({ byPoints: 1, position: "WR", poolSize: 1 });
    expect(index.get("te")).toMatchObject({ byPoints: 1, position: "TE", poolSize: 1 });
  });

  it("excludes players with no 2025 data from the pool entirely", () => {
    const index = buildSeasonRanks2025([
      base({ "Source ID": "A", "2025 Fantasy Points": 300 }),
      base({ "Source ID": "B", "2025 Fantasy Points": null, "2025 PPG": null }),
    ]);
    expect(index.has("B")).toBe(false);
    expect(index.get("A")!.poolSize).toBe(1);
  });

  it("counts null-Source-ID players in the pool but cannot look them up", () => {
    const index = buildSeasonRanks2025([
      base({ "Source ID": null, "2025 Fantasy Points": 400 }),
      base({ "Source ID": "A", "2025 Fantasy Points": 300 }),
    ]);
    // The unidentified player still occupies rank 1 ahead of A.
    expect(index.get("A")).toMatchObject({ byPoints: 2, poolSize: 2 });
    expect(index.size).toBe(1);
  });
});

describe("real 2025 finishes", () => {
  it("indexes every player that has both measures and a Source ID", () => {
    const expected = rawRows.filter(
      (r) => r["Source ID"] && r["2025 Fantasy Points"] != null && r["2025 PPG"] != null,
    ).length;
    expect(SEASON_RANKS_2025.size).toBe(expected);
  });

  it("puts the real points leaders at rank 1", () => {
    expect(getSeasonRank2025("NacuPu00")).toMatchObject({ byPoints: 1, byPpg: 1, position: "WR" });
    expect(getSeasonRank2025("McCaCh00")).toMatchObject({ byPoints: 1, byPpg: 1, position: "RB" });
    expect(getSeasonRank2025("AlleJo01")).toMatchObject({ byPoints: 1, byPpg: 1, position: "QB" });
  });

  it("separates a high-PPG player who missed games", () => {
    // Brock Bowers played 12 games: 11th in total points, 2nd in points per game.
    expect(getSeasonRank2025("BoweBr00")).toMatchObject({ byPoints: 11, byPpg: 2, position: "TE" });
  });

  it("agrees with a direct sort of the source file", () => {
    for (const position of ["QB", "RB", "WR", "TE"]) {
      const pool = rawRows.filter(
        (r) => r.Position === position && r["2025 Fantasy Points"] != null && r["2025 PPG"] != null,
      );
      const byPoints = [...pool].sort(
        (a, b) => b["2025 Fantasy Points"]! - a["2025 Fantasy Points"]!,
      );
      for (const [index, row] of byPoints.entries()) {
        if (!row["Source ID"]) continue;
        const rank = getSeasonRank2025(row["Source ID"])!;
        expect(rank.poolSize).toBe(pool.length);
        // Competition ranking, so a tie can sit above this row's sorted index.
        expect(rank.byPoints).toBeLessThanOrEqual(index + 1);
      }
    }
  });

  it("returns undefined without a Source ID or 2025 season", () => {
    expect(getSeasonRank2025(undefined)).toBeUndefined();
    expect(getSeasonRank2025("no-such-id")).toBeUndefined();
  });
});
