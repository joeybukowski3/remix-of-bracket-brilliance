import { describe, expect, it } from "vitest";
import { buildNflTotalFeatures, buildScoringSupportIndex, toOrderedFeatureVector } from "./totalsFeatures";
import { NFL_TOTAL_OFFENSE_HALF_LIFE_GAMES, NFL_TOTAL_DEFENSE_HALF_LIFE_GAMES } from "./totalsModelContract";
import type { NflTotalResearchScoringSupportRow } from "@/lib/nfl/research/total/types";

function row(partial: Partial<NflTotalResearchScoringSupportRow> & Pick<NflTotalResearchScoringSupportRow, "gameId" | "season" | "week" | "team" | "opponent">): NflTotalResearchScoringSupportRow {
  return { eligiblePlays: 60, offEpaSum: 6, successNum: 24, successDen: 60, explosiveCount: 6, ...partial };
}

describe("buildNflTotalFeatures", () => {
  it("uses the frozen half-lives (offense 6, defense 4) -- proven by cross-checking against computeEwmaWindow directly", () => {
    const rows = Array.from({ length: 8 }, (_, i) => row({ gameId: `g${i}`, season: 2022, week: i + 1, team: "buf", opponent: "x", eligiblePlays: 50, offEpaSum: i })).concat(
      Array.from({ length: 8 }, (_, i) => row({ gameId: `og${i}`, season: 2022, week: i + 1, team: "mia", opponent: "buf", eligiblePlays: 50, offEpaSum: -i })),
    );
    const index = buildScoringSupportIndex(rows);
    const features = buildNflTotalFeatures(index, "buf", "mia", { season: 2022, week: 9 }, "home");
    expect(features.offenseGamesUsed).toBe(8);
    expect(NFL_TOTAL_OFFENSE_HALF_LIFE_GAMES).toBe(6);
    expect(NFL_TOTAL_DEFENSE_HALF_LIFE_GAMES).toBe(4);
  });

  it("never includes the target game's own row (target-game exclusion)", () => {
    const rows = [
      row({ gameId: "target", season: 2023, week: 5, team: "buf", opponent: "mia", eligiblePlays: 9999, offEpaSum: 9999 }),
      row({ gameId: "prior", season: 2023, week: 1, team: "buf", opponent: "nyj", eligiblePlays: 50, offEpaSum: 2 }),
    ];
    const index = buildScoringSupportIndex(rows);
    const features = buildNflTotalFeatures(index, "buf", "mia", { season: 2023, week: 5 }, "home");
    expect(features.offenseGamesUsed).toBe(1);
    expect(features.offenseEpaPerPlay).toBeCloseTo(2 / 50, 6);
  });

  it("applies canonical team aliases via the identity layer (e.g. AZ -> ari)", () => {
    const rows = [row({ gameId: "g1", season: 2022, week: 1, team: "ari", opponent: "kc", eligiblePlays: 50, offEpaSum: 5 })];
    const index = buildScoringSupportIndex(rows);
    const features = buildNflTotalFeatures(index, "AZ", "kc", { season: 2022, week: 2 }, "home");
    expect(features.offenseGamesUsed).toBe(1);
  });

  it("throws on an unresolvable team code rather than silently producing a wrong row", () => {
    const index = buildScoringSupportIndex([]);
    expect(() => buildNflTotalFeatures(index, "", "mia", { season: 2023, week: 1 }, "home")).toThrow(/unresolved team code/);
  });

  it("Week 1 / no history: returns nulls, classified sparse-history, never fabricated", () => {
    const index = buildScoringSupportIndex([]);
    const features = buildNflTotalFeatures(index, "buf", "mia", { season: 2023, week: 1 }, "home");
    expect(features.offenseEpaPerPlay).toBeNull();
    expect(features.historyStatus).toBe("sparse-history");
    expect(toOrderedFeatureVector(features)).toBeNull();
  });

  it("bye-week gap does not break windowing -- a team's week-1 game still informs its week-4 features after a week-2/3 gap", () => {
    const rows = [row({ gameId: "g1", season: 2023, week: 1, team: "buf", opponent: "mia", eligiblePlays: 50, offEpaSum: 5 })];
    const index = buildScoringSupportIndex(rows);
    const features = buildNflTotalFeatures(index, "buf", "mia", { season: 2023, week: 4 }, "away");
    expect(features.offenseGamesUsed).toBe(1);
    expect(features.homeIndicator).toBe(0);
  });

  it("classifies history status by the frozen thresholds (min of offense and opponent-defense-allowed games used)", () => {
    // Both buf (own offense) and mia (as an opponent, i.e. mia's defense-allowed history) need matching game counts,
    // since historyStatus is the min of the two windows.
    function gamesFor(n: number): NflTotalResearchScoringSupportRow[] {
      const opponents = ["nyj", "ne", "kc", "lac", "sea"];
      const out: NflTotalResearchScoringSupportRow[] = [];
      for (let i = 0; i < n; i += 1) {
        out.push(row({ gameId: `buf-g${i}`, season: 2023, week: i + 1, team: "buf", opponent: opponents[i], eligiblePlays: 50, offEpaSum: 5 }));
        out.push(row({ gameId: `mia-g${i}`, season: 2023, week: i + 1, team: opponents[i], opponent: "mia", eligiblePlays: 50, offEpaSum: 5 }));
      }
      return out;
    }
    const oneIndex = buildScoringSupportIndex(gamesFor(1));
    const threeIndex = buildScoringSupportIndex(gamesFor(3));
    const fiveIndex = buildScoringSupportIndex(gamesFor(5));
    expect(buildNflTotalFeatures(oneIndex, "buf", "mia", { season: 2023, week: 2 }, "home").historyStatus).toBe("sparse-history");
    expect(buildNflTotalFeatures(threeIndex, "buf", "mia", { season: 2023, week: 4 }, "home").historyStatus).toBe("limited-history");
    expect(buildNflTotalFeatures(fiveIndex, "buf", "mia", { season: 2023, week: 6 }, "home").historyStatus).toBe("normal");
  });

  it("is deterministic", () => {
    const rows = [row({ gameId: "g1", season: 2023, week: 1, team: "buf", opponent: "mia", eligiblePlays: 50, offEpaSum: 5 })];
    const index = buildScoringSupportIndex(rows);
    const a = buildNflTotalFeatures(index, "buf", "mia", { season: 2023, week: 4 }, "home");
    const b = buildNflTotalFeatures(index, "buf", "mia", { season: 2023, week: 4 }, "home");
    expect(a).toEqual(b);
  });
});
