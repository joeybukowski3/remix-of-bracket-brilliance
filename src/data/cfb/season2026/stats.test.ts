import { describe, expect, it } from "vitest";
import { CFB_PROVENANCE, getAllTeams } from "../index";
import { CFB_FBS_TEAM_COUNT } from "../teamMetadata";
import {
  CFB_STATS_2026,
  CFB_STATS_2026_HAS_DATA,
  CFB_STATS_BY_TEAM,
  CFB_STATS_PREVIOUS_SEASON_BY_TEAM,
  CFB_STATS_PREVIOUS_SEASON_YEAR,
  CFB_STATS_RANKS_BY_TEAM,
} from "./stats";

/**
 * Contract tests for the committed CFBD-derived season-stats artifact
 * consumption. These must hold both in the current zero-completed-game
 * preseason state and once real 2026 stats exist, so they assert invariants
 * rather than hard-coded values.
 */
describe("committed 2026 season-stats artifact consumption", () => {
  it("covers exactly the 138 canonical FBS teams, no duplicates", () => {
    expect(CFB_STATS_2026).toHaveLength(CFB_FBS_TEAM_COUNT);
    expect(Object.keys(CFB_STATS_BY_TEAM)).toHaveLength(CFB_FBS_TEAM_COUNT);
    expect(new Set(CFB_STATS_2026.map((s) => s.teamId)).size).toBe(CFB_FBS_TEAM_COUNT);
  });

  it("gives every zero-game team a fully null stats row", () => {
    for (const stats of CFB_STATS_2026) {
      if (stats.gamesPlayed > 0) continue;
      expect(stats.pointsPerGame).toBeNull();
      expect(stats.yardsPerPlay).toBeNull();
      expect(stats.thirdDownPct).toBeNull();
      expect(stats.completionPct).toBeNull();
      expect(stats.opponentPointsPerPlay).toBeNull();
    }
  });

  it("is honestly empty in the current zero-completed-game preseason state", () => {
    // This assertion documents current reality as of this unit; once real
    // 2026 games are completed and the artifact is regenerated, this test
    // should be updated rather than silently left describing a stale state.
    if (!CFB_STATS_2026_HAS_DATA) {
      expect(CFB_STATS_2026.every((s) => s.gamesPlayed === 0)).toBe(true);
    }
  });

  it("flows through composeTeam onto CfbTeam.stats unchanged", () => {
    const teams = getAllTeams();
    expect(teams).toHaveLength(CFB_FBS_TEAM_COUNT);
    for (const team of teams) {
      expect(team.stats).toEqual(CFB_STATS_BY_TEAM[team.id]);
    }
  });

  it("never substitutes previous-season values into the current-season dataset", () => {
    for (const teamId of Object.keys(CFB_STATS_BY_TEAM)) {
      const current = CFB_STATS_BY_TEAM[teamId];
      const previous = CFB_STATS_PREVIOUS_SEASON_BY_TEAM[teamId];
      if (current.gamesPlayed === 0 && previous && previous.gamesPlayed > 0) {
        // The current-season row must stay null even though a previous-season
        // row with real data exists for the same team.
        expect(current.pointsPerGame).toBeNull();
      }
    }
  });

  it("labels the previous-season dataset with an explicit, different year", () => {
    if (CFB_STATS_PREVIOUS_SEASON_YEAR !== null) {
      expect(CFB_STATS_PREVIOUS_SEASON_YEAR).not.toBe(CFB_PROVENANCE.season);
      expect(CFB_STATS_PREVIOUS_SEASON_YEAR).toBe(CFB_PROVENANCE.season - 1);
    }
  });

  it("computes a rank only for teams with a non-null value for that metric", () => {
    for (const teamId of Object.keys(CFB_STATS_RANKS_BY_TEAM)) {
      const stats = CFB_STATS_BY_TEAM[teamId];
      const ranks = CFB_STATS_RANKS_BY_TEAM[teamId];
      if (stats.pointsPerGame === null) {
        expect(ranks.pointsPerGame).toBeUndefined();
      } else {
        expect(ranks.pointsPerGame).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe("CFB provenance — season-stats source", () => {
  it("reports statsSource consistently with whether real 2026 data exists", () => {
    expect(CFB_PROVENANCE.statsSource).toBe(CFB_STATS_2026_HAS_DATA ? "derived" : "unavailable");
  });
});
