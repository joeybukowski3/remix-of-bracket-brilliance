import { describe, expect, it } from "vitest";
import {
  buildSeasonStatsArtifact,
  type CfbdRawGame,
  type CfbdRawGameTeamStats,
} from "./buildSeasonStatsArtifact";
import { CFB_FBS_TEAM_COUNT } from "../../../data/cfb/teamMetadata";

const OHIO_TEAM_ROW = {
  teamId: 195,
  team: "Ohio",
  homeAway: "home" as const,
  points: 17,
  stats: [
    { category: "totalYards", stat: "350" },
    { category: "rushingYards", stat: "207" },
    { category: "rushingAttempts", stat: "43" },
    { category: "netPassingYards", stat: "143" },
    { category: "completionAttempts", stat: "11-15" },
    { category: "thirdDownEff", stat: "4-11" },
    { category: "turnovers", stat: "3" },
  ],
};

const UNLV_TEAM_ROW = {
  teamId: 2439,
  team: "UNLV",
  homeAway: "away" as const,
  points: 10,
  stats: [
    { category: "totalYards", stat: "280" },
    { category: "rushingYards", stat: "120" },
    { category: "rushingAttempts", stat: "30" },
    { category: "netPassingYards", stat: "160" },
    { category: "completionAttempts", stat: "14-25" },
    { category: "thirdDownEff", stat: "3-12" },
    { category: "turnovers", stat: "1" },
  ],
};

const IDAHO_STATE_FCS_ROW = {
  teamId: 304,
  team: "Idaho State",
  homeAway: "away" as const,
  points: 6,
  stats: [
    { category: "totalYards", stat: "150" },
    { category: "rushingAttempts", stat: "20" },
    { category: "completionAttempts", stat: "5-10" },
    { category: "turnovers", stat: "2" },
  ],
};

function baseGames(): CfbdRawGame[] {
  return [
    {
      id: 1,
      season: 2025,
      completed: true,
      homeId: 195,
      homeTeam: "Ohio",
      homeClassification: "fbs",
      awayId: 2439,
      awayTeam: "UNLV",
      awayClassification: "fbs",
    },
    {
      id: 2,
      season: 2025,
      completed: true,
      homeId: 195,
      homeTeam: "Ohio",
      homeClassification: "fbs",
      awayId: 304,
      awayTeam: "Idaho State",
      awayClassification: "fcs",
    },
    {
      id: 3,
      season: 2025,
      completed: false, // scheduled, not yet played
      homeId: 195,
      homeTeam: "Ohio",
      homeClassification: "fbs",
      awayId: 2439,
      awayTeam: "UNLV",
      awayClassification: "fbs",
    },
  ];
}

function baseGameTeamStats(): CfbdRawGameTeamStats[] {
  return [
    { id: 1, teams: [OHIO_TEAM_ROW, UNLV_TEAM_ROW] },
    {
      id: 2,
      teams: [
        { ...OHIO_TEAM_ROW, homeAway: "home" },
        IDAHO_STATE_FCS_ROW,
      ],
    },
  ];
}

describe("buildSeasonStatsArtifact", () => {
  it("produces exactly the canonical 138-team coverage with no duplicates", () => {
    const result = buildSeasonStatsArtifact({
      season: 2025,
      games: baseGames(),
      gameTeamStats: baseGameTeamStats(),
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.artifact.teams).toHaveLength(CFB_FBS_TEAM_COUNT);
    expect(new Set(result.artifact.teams.map((t) => t.teamId)).size).toBe(CFB_FBS_TEAM_COUNT);
  });

  it("only counts completed games", () => {
    const result = buildSeasonStatsArtifact({
      season: 2025,
      games: baseGames(),
      gameTeamStats: baseGameTeamStats(),
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Only game 1 and 2 are completed; game 3 has no stats row anyway.
    expect(result.artifact.diagnostics.completedGames).toBe(2);
    const ohio = result.artifact.teams.find((t) => t.teamId === "ohio");
    expect(ohio?.stats.gamesPlayed).toBe(2);
  });

  it("includes FBS-vs-FCS games in the FBS team's own season totals", () => {
    const result = buildSeasonStatsArtifact({
      season: 2025,
      games: baseGames(),
      gameTeamStats: baseGameTeamStats(),
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ohio = result.artifact.teams.find((t) => t.teamId === "ohio");
    // Ohio's 2 games: 17 pts vs UNLV, 17 pts vs Idaho State (reused fixture) = 34/2.
    expect(ohio?.stats.pointsPerGame).toBeCloseTo(17);
    expect(ohio?.stats.gamesPlayed).toBe(2);
  });

  it("does not publish a row for the FCS-only team itself", () => {
    const result = buildSeasonStatsArtifact({
      season: 2025,
      games: baseGames(),
      gameTeamStats: baseGameTeamStats(),
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.artifact.teams.some((t) => t.teamId === "idaho-state")).toBe(false);
  });

  it("gives every team with zero eligible games a null, gamesPlayed: 0 row", () => {
    const result = buildSeasonStatsArtifact({
      season: 2025,
      games: baseGames(),
      gameTeamStats: baseGameTeamStats(),
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const untouched = result.artifact.teams.find((t) => t.teamId === "ala");
    expect(untouched?.stats.gamesPlayed).toBe(0);
    expect(untouched?.stats.pointsPerGame).toBeNull();
  });

  it("fails closed on a season mismatch rather than silently filtering", () => {
    const result = buildSeasonStatsArtifact({
      season: 2025,
      games: [{ ...baseGames()[0], season: 2024 }],
      gameTeamStats: baseGameTeamStats(),
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).toMatch(/season mismatch/i);
  });

  it("skips a malformed team-stats row (not exactly 2 teams) without failing the whole build", () => {
    const result = buildSeasonStatsArtifact({
      season: 2025,
      games: baseGames(),
      gameTeamStats: [...baseGameTeamStats(), { id: 999, teams: [OHIO_TEAM_ROW] }],
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.artifact.diagnostics.skippedGames.some((row) => row.gameId === "999")).toBe(true);
  });

  it("attaches a competition rank per metric, direction-aware", () => {
    const result = buildSeasonStatsArtifact({
      season: 2025,
      games: baseGames(),
      gameTeamStats: baseGameTeamStats(),
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ohio = result.artifact.teams.find((t) => t.teamId === "ohio");
    const unlv = result.artifact.teams.find((t) => t.teamId === "unlv");
    // Ohio out-scores UNLV (17 vs 10) -> Ohio ranks ahead on pointsPerGame.
    expect(ohio?.ranks.pointsPerGame).toBeLessThan(unlv?.ranks.pointsPerGame ?? Infinity);
  });

  it("produces byte-identical output across repeated runs on the same input", () => {
    const run = () =>
      buildSeasonStatsArtifact({
        season: 2025,
        games: baseGames(),
        gameTeamStats: baseGameTeamStats(),
        generatedAt: "2026-01-01T00:00:00.000Z",
      });
    const a = run();
    const b = run();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
