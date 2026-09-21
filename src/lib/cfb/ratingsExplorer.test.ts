import { describe, expect, it } from "vitest";
import {
  CFB_STATS_PREVIOUS_SEASON_BY_TEAM,
  getAllTeams,
} from "@/data/cfb";
import { getCfbRankTier } from "./rankTierPalette";
import {
  createRatingsExplorerContext,
  getRatingsViewDefinition,
} from "./ratingsExplorer";

describe("CFB ratings explorer presentation", () => {
  const teams = getAllTeams();
  const context = createRatingsExplorerContext(teams, 2025);

  it("uses competition ranks across the full FBS field for displayed rating ranks", () => {
    const offense = getRatingsViewDefinition("power").metrics.find(
      (metric) => metric.key === "offensiveRating",
    )!;
    const sorted = [...teams].sort(
      (a, b) => (b.ratings.offensiveRating ?? -Infinity) - (a.ratings.offensiveRating ?? -Infinity),
    );
    expect(offense.readRank(sorted[0], context)).toBe(1);
    expect(offense.readRank(sorted[0], context)).toBe(
      offense.readRank(sorted[0], createRatingsExplorerContext(teams.slice().reverse(), 2025)),
    );
  });

  it("preserves lower-is-better defensive rank direction from the season artifact", () => {
    const defense = getRatingsViewDefinition("defense").metrics.find(
      (metric) => metric.key === "pointsAllowedPerGame",
    )!;
    const available = teams.filter(
      (team) => CFB_STATS_PREVIOUS_SEASON_BY_TEAM[team.id].pointsAllowedPerGame != null,
    );
    const best = [...available].sort(
      (a, b) => CFB_STATS_PREVIOUS_SEASON_BY_TEAM[a.id].pointsAllowedPerGame!
        - CFB_STATS_PREVIOUS_SEASON_BY_TEAM[b.id].pointsAllowedPerGame!,
    )[0];
    const worst = [...available].sort(
      (a, b) => CFB_STATS_PREVIOUS_SEASON_BY_TEAM[b.id].pointsAllowedPerGame!
        - CFB_STATS_PREVIOUS_SEASON_BY_TEAM[a.id].pointsAllowedPerGame!,
    )[0];
    expect(defense.readRank(best, context)).toBe(1);
    expect(defense.readRank(worst, context)).toBeGreaterThan(defense.readRank(best, context)!);
    expect(getCfbRankTier(defense.readRank(best, context), teams.length)?.id).toBe("elite");
    expect(getCfbRankTier(defense.readRank(worst, context), teams.length)?.id).toMatch(/weak|poor/);
  });

  it("keeps missing values unranked and visually neutral", () => {
    const ap = getRatingsViewDefinition("power").metrics.find((metric) => metric.key === "apRank")!;
    const unranked = teams.find((team) => team.ratings.apRank == null)!;
    expect(ap.readValue(unranked, context)).toBeNull();
    expect(ap.readRank(unranked, context)).toBeNull();
    expect(ap.format(ap.readValue(unranked, context))).toBe("—");
    expect(getCfbRankTier(null, teams.length)).toBeNull();
  });

  it("formats stored 0-1 percentage ratios as user-facing percentages", () => {
    const thirdDown = getRatingsViewDefinition("offense").metrics.find(
      (metric) => metric.key === "thirdDownPct",
    )!;
    expect(thirdDown.format(0.417)).toBe("41.7%");
  });
});
