import { describe, expect, it } from "vitest";
import {
  countGameContextResolution,
  countPlayersWithMultipleTeamsInSeason,
  findDuplicateOutcomeKeys,
  summarizeSeasonCoverage,
} from "./historicalOutcomesQa";
import type { NflYardageOutcomeRow } from "./historicalOutcomes";

function row(overrides: Partial<NflYardageOutcomeRow["context"]> = {}): NflYardageOutcomeRow {
  return {
    schemaVersion: "nfl-yardage-outcome-row-v1",
    outcomeSchemaVersion: "nfl-yardage-outcome-v1",
    context: {
      schemaVersion: "nfl-prop-player-game-context-v1",
      season: 2025,
      week: 1,
      gameId: "2025_01_DAL_PHI",
      playerId: "gsis:00-0036389",
      playerName: "Jalen Hurts",
      team: "phi",
      opponent: "dal",
      position: "QB",
      homeAway: "home",
      gameDateUtc: "2025-09-05T00:20:00.000Z",
      spread: null,
      total: null,
      impliedTeamTotal: null,
      availabilityStatus: null,
      ...overrides,
    },
    outcomes: {
      passAttempts: 34,
      passingYards: 278,
      carries: 8,
      rushingYards: 45,
      targets: 0,
      receptions: 0,
      receivingYards: 0,
    },
    provenance: {
      source: "nflverse stats_player weekly",
      sourceSeason: 2025,
      sourceWeek: 1,
      gameContextSource: "public/data/nfl/<season>/games.json",
    },
  };
}

describe("findDuplicateOutcomeKeys", () => {
  it("returns empty for a unique row set", () => {
    expect(findDuplicateOutcomeKeys([row(), row({ week: 2 })])).toEqual([]);
  });

  it("finds an exact season/week/playerId duplicate", () => {
    expect(findDuplicateOutcomeKeys([row(), row()])).toEqual(["2025|1|gsis:00-0036389"]);
  });
});

describe("summarizeSeasonCoverage", () => {
  it("reports rows/players/week span per season and position", () => {
    const rows = [
      row({ week: 1 }),
      row({ week: 2 }),
      row({ week: 1, playerId: "gsis:other", position: "WR" }),
    ];
    const summary = summarizeSeasonCoverage(rows);
    expect(summary).toHaveLength(1);
    expect(summary[0].season).toBe(2025);
    const qb = summary[0].positions.find((entry) => entry.position === "QB");
    const wr = summary[0].positions.find((entry) => entry.position === "WR");
    expect(qb).toEqual({ position: "QB", rows: 2, players: 1, weeks: 2, minWeek: 1, maxWeek: 2 });
    expect(wr).toEqual({ position: "WR", rows: 1, players: 1, weeks: 1, minWeek: 1, maxWeek: 1 });
  });
});

describe("countPlayersWithMultipleTeamsInSeason", () => {
  it("counts a traded player once regardless of how many team changes occurred", () => {
    const rows = [
      row({ week: 1, team: "phi" }),
      row({ week: 8, team: "kc" }),
      row({ week: 15, team: "sf" }),
      row({ week: 1, playerId: "gsis:stable", team: "dal" }),
      row({ week: 2, playerId: "gsis:stable", team: "dal" }),
    ];
    expect(countPlayersWithMultipleTeamsInSeason(rows)).toBe(1);
  });
});

describe("countGameContextResolution", () => {
  it("splits resolved vs. unresolved game context", () => {
    const rows = [row(), row({ week: 2, gameId: null, homeAway: null, gameDateUtc: null })];
    expect(countGameContextResolution(rows)).toEqual({ resolved: 1, unresolved: 1 });
  });
});
