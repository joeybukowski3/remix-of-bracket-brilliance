import { describe, expect, it } from "vitest";
import { computeRawTeamRating } from "../model";
import {
  buildPreseasonModelInputs,
  normalizeCfbdGamePerformance,
  normalizeCfbdGames,
  normalizeCfbdTransitionPriorFallbacks,
} from "./normalizeCfbd";
import type { CfbdGame, CfbdGameTeamStats, CfbdTransitionTeamCache } from "./types";

const mappings = [
  { jkbTeamId: "ala", cfbdId: 333, cfbdName: "Alabama" },
  { jkbTeamId: "uga", cfbdId: 61, cfbdName: "Georgia" },
  { jkbTeamId: "sac", cfbdId: 100, cfbdName: "Sacramento State" },
];

function rawGame(overrides: Partial<CfbdGame> = {}): CfbdGame {
  return {
    id: 1,
    season: 2025,
    week: 1,
    seasonType: "regular",
    startDate: "2025-08-30T16:00:00.000Z",
    startTimeTBD: false,
    completed: true,
    neutralSite: false,
    homeId: 333,
    homeTeam: "Alabama",
    homeClassification: "fbs",
    homePoints: 28,
    awayId: 61,
    awayTeam: "Georgia",
    awayClassification: "fbs",
    awayPoints: 21,
    ...overrides,
  };
}

describe("CFBD normalization", () => {
  it("retains regular, championship, bowl, playoff, and FCS classifications", () => {
    const normalized = normalizeCfbdGames(
      [
        rawGame(),
        rawGame({ id: 2, seasonType: "regular", notes: "SEC Championship" }),
        rawGame({ id: 3, seasonType: "postseason", notes: "Sugar Bowl" }),
        rawGame({ id: 4, seasonType: "postseason", playoff: { round: "quarterfinal" } }),
        rawGame({ id: 5, awayId: 999, awayTeam: "FCS Team", awayClassification: "fcs" }),
      ],
      mappings,
    );
    expect(normalized.map((game) => game.gameType)).toEqual([
      "regular",
      "conference_championship",
      "bowl",
      "playoff",
      "regular",
    ]);
    expect(normalized[4].includesFcsOpponent).toBe(true);
    expect(normalized[4].awayTeamId).toBeNull();
    expect(normalized[4].awayExternalOpponentId).toBe("cfbd:999");
  });

  it("normalizes only the selected performance statistics and derives yards per play", () => {
    const stats: CfbdGameTeamStats[] = [
      {
        id: 1,
        teams: [
          {
            teamId: 333,
            team: "Alabama",
            homeAway: "home",
            points: 28,
            stats: [
              { category: "totalYards", stat: "420" },
              { category: "rushingAttempts", stat: "35" },
              { category: "completionAttempts", stat: "20-30" },
              { category: "turnovers", stat: "1" },
            ],
          },
          {
            teamId: 61,
            team: "Georgia",
            homeAway: "away",
            points: 21,
            stats: [
              { category: "totalYards", stat: "360" },
              { category: "totalOffensivePlays", stat: "60" },
              { category: "turnovers", stat: "2" },
            ],
          },
        ],
      },
    ];
    const games = normalizeCfbdGames([rawGame()], mappings);
    const rows = normalizeCfbdGamePerformance(stats, games, mappings);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.teamId === "ala")).toMatchObject({
      plays: 65,
      yardsPerPlay: 420 / 65,
      yardsPerPlayAllowed: 6,
      turnovers: 1,
    });
  });

  it("uses a deduplicated prior-FCS fallback with explicit provenance and null optional inputs", () => {
    const transitionGame = (id: number): CfbdGame => rawGame({
      id,
      homeId: 100,
      homeTeam: "Sacramento State",
      homeClassification: "fcs",
      awayId: 900 + id,
      awayTeam: `FCS Opponent ${id}`,
      awayClassification: "fcs",
    });
    const transitionStats = (id: number): CfbdGameTeamStats => ({
      id,
      teams: [
        {
          teamId: 100,
          team: "Sacramento State",
          homeAway: "home",
          points: 28,
          stats: [
            { category: "totalYards", stat: "420" },
            { category: "rushingAttempts", stat: "35" },
            { category: "completionAttempts", stat: "20-30" },
            { category: "turnovers", stat: "1" },
          ],
        },
        {
          teamId: 900 + id,
          team: `FCS Opponent ${id}`,
          homeAway: "away",
          points: 14,
          stats: [
            { category: "totalYards", stat: "300" },
            { category: "rushingAttempts", stat: "30" },
            { category: "completionAttempts", stat: "15-20" },
            { category: "turnovers", stat: "2" },
          ],
        },
      ],
    });
    const cache: CfbdTransitionTeamCache = {
      schemaVersion: "jkb-cfbd-transition-team-cache-v1",
      provider: "CollegeFootballData.com API v2",
      season: 2025,
      fetchedAt: "2026-08-09T00:00:00.000Z",
      teams: [{
        teamId: "sac",
        team: "Sacramento State",
        sourceClassification: "fcs",
        games: [transitionGame(1), transitionGame(1), transitionGame(2)],
        teamStats: [transitionStats(1), transitionStats(1), transitionStats(2)],
      }],
    };
    const [fallback] = normalizeCfbdTransitionPriorFallbacks(cache, mappings, new Set(["1"]));
    expect(fallback.sourceGameIds).toEqual(["1", "2"]);
    expect(fallback.overlappingFbsCacheGameIds).toEqual(["1"]);
    expect(fallback.duplicateGameIdsRemoved).toBe(1);
    expect(fallback.performances).toHaveLength(2);

    const built = buildPreseasonModelInputs({
      teamIds: ["sac"],
      performances: [fallback.performances[0]],
      games: [fallback.games[0]],
      priorFallbacks: [fallback],
      returningProduction: [],
      talent: [],
    });
    const input = built.inputs[0];
    expect(input.priorPerformanceMetadata).toEqual({
      source: "prior-fcs-fallback",
      sampleGames: 2,
      sourceClassification: "fcs",
      sourceGameIds: ["1", "2"],
    });
    expect(input.opponentAdjusted).toBeNull();
    expect(input.returningProduction).toBeNull();
    expect(input.rosterTalent).toBeNull();
    expect(computeRawTeamRating(input).status).toBe("computed");
  });
});
