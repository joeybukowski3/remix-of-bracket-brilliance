import { describe, expect, it } from "vitest";
import {
  buildAvailabilitySection,
  buildFullGameContext,
  buildIdentity,
  buildJkbModelsSection,
  buildMarketSection,
  buildMatchupSection,
  buildPlayersSection,
  buildSchedule,
  buildSituational,
  buildTeamMetricsSection,
  buildTrendsSection,
  buildWeatherSection,
  type BuildFullGameContextInput,
  type DfsWeekArtifact,
  type GamesArtifact,
  type MatchupInjuriesArtifact,
  type MatchupProjectionsArtifact,
  type PowerRatingsArtifact,
  type TdPreviewArtifact,
  type TeamsArtifact,
  type TeamTotalsArtifact,
  type YardageProjectionsArtifact,
} from "./nfl-full-game-context";
import {
  validateGameContextPacket,
  validateGeneratedBeforeKickoff,
  validateJkbSpreadOrientation,
  validateNoPostgameFields,
  validateSpreadOrientation,
  validateTotalSanity,
} from "./nfl-game-context-validators";
import type { CurrentMarketView, LineMovementView } from "@/lib/nfl/bettingLinesView";

const TEAMS: TeamsArtifact = {
  teams: [
    { abbr: "bal", fullName: "Baltimore Ravens", division: "AFC North", conference: "AFC" },
    { abbr: "ind", fullName: "Indianapolis Colts", division: "AFC South", conference: "AFC" },
  ],
};

const GAMES: GamesArtifact = {
  games: [
    {
      gameId: "2026_01_BAL_IND",
      season: 2026,
      week: 1,
      seasonType: "REG",
      dateUtc: "2026-09-13T17:00:00.000Z",
      homeAbbr: "ind",
      awayAbbr: "bal",
      status: "scheduled",
      stadium: "Lucas Oil Stadium",
      isDome: null,
      neutralSite: false,
    },
  ],
};

describe("buildIdentity", () => {
  it("resolves identity from games.json + teams.json", () => {
    const identity = buildIdentity({ games: GAMES, teams: TEAMS, gameId: "2026_01_BAL_IND" });
    expect(identity).toEqual({
      gameId: "2026_01_BAL_IND",
      season: 2026,
      week: 1,
      seasonType: "REG",
      homeTeam: "ind",
      awayTeam: "bal",
      homeTeamFull: "Indianapolis Colts",
      awayTeamFull: "Baltimore Ravens",
    });
  });

  it("returns null for an unknown gameId (never fabricated)", () => {
    expect(buildIdentity({ games: GAMES, teams: TEAMS, gameId: "2026_01_XXX_YYY" })).toBeNull();
  });

  it("returns null when a team is unresolvable against teams.json", () => {
    const badTeams: TeamsArtifact = { teams: [{ abbr: "ind", fullName: "Indianapolis Colts", division: "AFC South", conference: "AFC" }] };
    expect(buildIdentity({ games: GAMES, teams: badTeams, gameId: "2026_01_BAL_IND" })).toBeNull();
  });
});

describe("buildSchedule", () => {
  it("is available with null rest days when there is no prior in-season game (week 1)", () => {
    const schedule = buildSchedule({ games: GAMES, gameId: "2026_01_BAL_IND" });
    expect(schedule?.restDays).toEqual({ home: null, away: null });
    expect(schedule?.shortWeek).toEqual({ home: false, away: false });
    expect(schedule?.venue.stadium).toBe("Lucas Oil Stadium");
    expect(schedule?.provenance_status).toBe("available");
  });

  it("computes rest days from the prior in-season game, never guessed", () => {
    const games: GamesArtifact = {
      games: [
        ...GAMES.games,
        {
          gameId: "2026_02_IND_XXX",
          season: 2026,
          week: 2,
          seasonType: "REG",
          dateUtc: "2026-09-17T00:15:00.000Z", // Thursday -- short week
          homeAbbr: "ind",
          awayAbbr: "xxx",
          status: "scheduled",
          stadium: "Lucas Oil Stadium",
          isDome: true,
          neutralSite: false,
        },
      ],
    };
    const schedule = buildSchedule({ games, gameId: "2026_02_IND_XXX" });
    expect(schedule?.restDays.home).toBe(3);
    expect(schedule?.shortWeek.home).toBe(true);
  });
});

describe("buildSituational", () => {
  it("computes divisionalGame from teams.json and revengeGame from a real prior-season result, never inferred", () => {
    const schedule = buildSchedule({ games: GAMES, gameId: "2026_01_BAL_IND" })!;
    const identity = buildIdentity({ games: GAMES, teams: TEAMS, gameId: "2026_01_BAL_IND" })!;

    const noPriorMeeting = buildSituational({ schedule, identity, teams: TEAMS, priorSeasonResults: [] });
    expect(noPriorMeeting.divisionalGame).toBe(false); // AFC North vs AFC South
    expect(noPriorMeeting.revengeGame).toBe(false);

    const withPriorMeeting = buildSituational({
      schedule,
      identity,
      teams: TEAMS,
      priorSeasonResults: [{ homeAbbr: "bal", awayAbbr: "ind" }],
    });
    expect(withPriorMeeting.revengeGame).toBe(true);
  });
});

describe("buildMarketSection", () => {
  const CURRENT_VIEW: CurrentMarketView = {
    sportsbook: { id: "betmgm", name: "BetMGM" },
    selectionReason: "priority",
    spread: { homeLine: -3, awayLine: 3, homePrice: -110, awayPrice: -110 },
    total: { line: 47.5, overPrice: -110, underPrice: -110 },
    moneyline: { homePrice: -150, awayPrice: 130 },
    capturedAt: "2026-09-09T14:00:00.000Z",
    providerUpdatedAt: "2026-09-09T13:00:00.000Z",
    firstObservedAt: "2026-09-01T12:00:00.000Z",
    lastObservedAt: "2026-09-09T14:00:00.000Z",
    artifactGeneratedAt: "2026-09-09T14:10:00.000Z",
    freshness: { level: "recent", basis: "providerUpdatedAt", basisAt: "2026-09-09T13:00:00.000Z", ageMs: 7200000, evaluatedAt: "2026-09-09T15:00:00.000Z" },
  };
  const MOVEMENT_VIEW: LineMovementView = {
    sportsbook: { id: "betmgm", name: "BetMGM" },
    spread: { firstObserved: -3.5, current: -3, move: 0.5, points: [], firstObservedAt: "2026-09-01T12:00:00.000Z", lastObservedAt: "2026-09-09T14:00:00.000Z" },
    total: { firstObserved: 46, current: 47.5, move: 1.5, points: [], firstObservedAt: "2026-09-01T12:00:00.000Z", lastObservedAt: "2026-09-09T14:00:00.000Z" },
  };

  it("is available and mirrors the selected sportsbook's line + movement, always carrying the opening-line caveat", () => {
    const market = buildMarketSection({ currentView: CURRENT_VIEW, movementView: MOVEMENT_VIEW });
    expect(market.provenance_status).toBe("available");
    expect(market.sportsbook).toBe("betmgm");
    expect(market.spread.homeLine).toBe(-3);
    expect(market.lineMovement.spread).toBe(0.5);
    expect(market.firstObserved.spread).toBe(-3.5);
    expect(market.openingLineCaveat).toBe(true);
  });

  it("is unavailable, never fabricated, when there is no current market view", () => {
    const market = buildMarketSection({ currentView: null, movementView: null });
    expect(market.provenance_status).toBe("unavailable");
    expect(market.spread.homeLine).toBeNull();
    expect(market.sportsbook).toBeNull();
  });
});

describe("buildJkbModelsSection", () => {
  const matchupProjections: MatchupProjectionsArtifact = {
    modelVersion: "jkb-power-number-v1.0.0",
    projections: { "2026_01_BAL_IND": { homeTeam: "ind", awayTeam: "bal", projectedHomeMargin: 3.008 } },
  };
  const teamTotals: TeamTotalsArtifact = {
    modelVersion: "jkb-nfl-total-ridge-v1.0.0",
    projections: { "2026_01_BAL_IND": { projectedGameTotal: 48.45 } },
  };

  it("derives a home-oriented projected spread and a signed model-market edge", () => {
    const jkb = buildJkbModelsSection({
      powerRatings: null,
      matchupProjections,
      teamTotals,
      gameId: "2026_01_BAL_IND",
      homeTeam: "ind",
      awayTeam: "bal",
      marketHomeSpread: -3,
      marketTotal: 47.5,
    });
    expect(jkb.projectedSpread.homeLine).toBeCloseTo(-3.008);
    expect(jkb.projectedSpread.favoredTeam).toBe("ind");
    expect(jkb.projectedTotal.line).toBe(48.45);
    expect(jkb.modelMarketEdge.spread).toBeCloseTo(-0.008);
    expect(jkb.modelMarketEdge.total).toBeCloseTo(0.95);
    expect(jkb.provenance_status).toBe("available");
  });

  it("power rating is unavailable, never backfilled from a different JKB artifact, when the ratings artifact is empty", () => {
    const emptyRatings: PowerRatingsArtifact = { ratings: [] };
    const jkb = buildJkbModelsSection({
      powerRatings: emptyRatings,
      matchupProjections: null,
      teamTotals: null,
      gameId: "2026_01_BAL_IND",
      homeTeam: "ind",
      awayTeam: "bal",
      marketHomeSpread: null,
      marketTotal: null,
    });
    expect(jkb.powerRating.home).toBeNull();
    expect(jkb.powerRating.away).toBeNull();
    expect(jkb.provenance_status).toBe("unavailable");
  });
});

describe("buildTeamMetricsSection", () => {
  it("sos is always honestly unavailable in WU1 (no Node-safe deterministic source exists yet)", () => {
    const teamMetrics = buildTeamMetricsSection({ epaWindow: null, yppWindow: null, homeTeam: "ind", awayTeam: "bal" });
    expect(teamMetrics.sos.provenance_status).toBe("unavailable");
    expect(teamMetrics.periodWindow).toBe("prior-season-full");
  });
});

describe("buildMatchupSection", () => {
  it("derives a pass/rush unit advantage from off/def yards-per-attempt when both teams resolve", () => {
    const metricsWindow = {
      teams: {
        ind: { through: null, metrics: { "off.yardsPerPassAttempt": [8.0, 30], "def.opponentYardsPerPassAttempt": [6.5, 30], "off.yardsPerRushAttempt": [4.0, 20], "def.opponentYardsPerRushAttempt": [4.5, 20] } },
        bal: { through: null, metrics: { "off.yardsPerPassAttempt": [7.5, 30], "def.opponentYardsPerPassAttempt": [7.0, 30], "off.yardsPerRushAttempt": [5.0, 20], "def.opponentYardsPerRushAttempt": [4.0, 20] } },
      },
    };
    const matchup = buildMatchupSection({ trenchSeasonData: null, trenchSeasonKey: null, metricsWindow, homeTeam: "ind", awayTeam: "bal" });
    expect(matchup.offenseVsDefense.passing).not.toBeNull();
    expect(matchup.offenseVsDefense.rushing).not.toBeNull();
  });

  it("is null (unavailable), not guessed, when a team is missing from the metrics window", () => {
    const matchup = buildMatchupSection({ trenchSeasonData: null, trenchSeasonKey: null, metricsWindow: null, homeTeam: "ind", awayTeam: "bal" });
    expect(matchup.offenseVsDefense.passing).toBeNull();
    expect(matchup.offenseVsDefense.rushing).toBeNull();
  });
});

describe("buildPlayersSection", () => {
  const yardageProjections: YardageProjectionsArtifact = {
    rows: [
      {
        gameId: "2026_01_BAL_IND",
        playerId: "gsis:1",
        playerName: "Lamar Jackson",
        team: "bal",
        position: "QB",
        market: "passing",
        projectedYards: 222.6,
        matchupScore: { matchupScore: 53.4 },
        hardCaseFlags: { multiQbRoleUncertain: true },
      },
    ],
  };
  const tdPreview: TdPreviewArtifact = {
    defaultWindow: "last8",
    players: [{ gameId: "2026_01_BAL_IND", playerId: "gsis:1", playerName: "Lamar Jackson", team: "bal", windows: { last8: { jkbTdScore: 61.2 } } }],
  };

  it("filters by gameId and reads the default TD-score window honestly", () => {
    const players = buildPlayersSection({ yardageProjections, tdPreview, gameId: "2026_01_BAL_IND" });
    expect(players.yardageProjections).toHaveLength(1);
    expect(players.yardageProjections[0].starterUncertain).toBe(true);
    expect(players.tdScores[0].tdScore).toBe(61.2);
    expect(players.tdScores[0].window).toBe("last8");
    expect(players.provenance_status).toBe("available");
  });

  it("is unavailable when neither artifact covers the game", () => {
    const players = buildPlayersSection({ yardageProjections: null, tdPreview: null, gameId: "2026_01_BAL_IND" });
    expect(players.provenance_status).toBe("unavailable");
  });
});

describe("buildAvailabilitySection", () => {
  const matchupInjuries: MatchupInjuriesArtifact = {
    isHistorical: true,
    dataSeason: 2025,
    dataWeek: 12,
    teams: {
      bal: { entries: [{ playerId: "00-1", playerName: "Rashod Bateman", position: "WR", gameStatus: "OUT" }] },
      ind: { entries: [] },
    },
  };
  const dfsWeek: DfsWeekArtifact = {
    roles: [{ playerId: "gsis:1", team: "bal", position: "QB", gameId: "2026_01_BAL_IND", depthRank: 1, starterEvidence: "confirmed", injuryFeedStale: true }],
  };

  it("honestly flags a stale (2025 week 12) injury feed for a 2026 game -- never silently treated as current", () => {
    const availability = buildAvailabilitySection({ matchupInjuries, dfsWeek, gameId: "2026_01_BAL_IND", homeTeam: "ind", awayTeam: "bal", currentSeason: 2026 });
    expect(availability.feedStale).toBe(true);
    expect(availability.provenance_status).toBe("stale");
    expect(availability.injuries[0].status).toBe("out");
    expect(availability.depthChart[0].depthRank).toBe(1);
  });

  it("is unavailable, not silently fresh, when no injury artifact exists", () => {
    const availability = buildAvailabilitySection({ matchupInjuries: null, dfsWeek: null, gameId: "2026_01_BAL_IND", homeTeam: "ind", awayTeam: "bal", currentSeason: 2026 });
    expect(availability.provenance_status).toBe("unavailable");
  });
});

describe("buildTrendsSection / buildWeatherSection", () => {
  it("trends is an empty array in WU1 -- no unvalidated trivia is ever injected", () => {
    expect(buildTrendsSection()).toEqual([]);
  });

  it("weather is always the explicit not_available contract", () => {
    const weather = buildWeatherSection();
    expect(weather.status).toBe("not_available");
    expect(weather.note).toMatch(/No internal NFL weather provider/);
  });
});

/* -------------------------------------------------------------------------- */
/* Full packet + validators, against a realistic BAL@IND fixture              */
/* -------------------------------------------------------------------------- */

function buildFixtureInput(overrides: Partial<BuildFullGameContextInput> = {}): BuildFullGameContextInput {
  return {
    games: GAMES,
    teams: TEAMS,
    gameId: "2026_01_BAL_IND",
    epaWindow: null,
    yppWindow: null,
    trenchSeasonData: null,
    trenchSeasonKey: null,
    coachingSnapshot: null,
    currentMarketView: {
      sportsbook: { id: "betmgm", name: "BetMGM" },
      selectionReason: "priority",
      spread: { homeLine: -3, awayLine: 3, homePrice: -110, awayPrice: -110 },
      total: { line: 47.5, overPrice: -110, underPrice: -110 },
      moneyline: { homePrice: -150, awayPrice: 130 },
      capturedAt: "2026-09-09T14:00:00.000Z",
      providerUpdatedAt: "2026-09-09T13:00:00.000Z",
      firstObservedAt: "2026-09-01T12:00:00.000Z",
      lastObservedAt: "2026-09-09T14:00:00.000Z",
      artifactGeneratedAt: "2026-09-09T14:10:00.000Z",
      freshness: { level: "recent", basis: "providerUpdatedAt", basisAt: "2026-09-09T13:00:00.000Z", ageMs: 7200000, evaluatedAt: "2026-09-09T15:00:00.000Z" },
    },
    lineMovementView: null,
    powerRatings: null,
    matchupProjections: {
      modelVersion: "jkb-power-number-v1.0.0",
      projections: { "2026_01_BAL_IND": { homeTeam: "ind", awayTeam: "bal", projectedHomeMargin: 3.008 } },
    },
    teamTotals: { modelVersion: "jkb-nfl-total-ridge-v1.0.0", projections: { "2026_01_BAL_IND": { projectedGameTotal: 48.45 } } },
    yardageProjections: null,
    tdPreview: null,
    matchupInjuries: null,
    dfsWeek: null,
    priorSeasonResults: [],
    provenanceSources: [{ logicalName: "games", path: "public/data/nfl/2026/games.json", contentHash: "abc123", generatedAt: "2026-09-10T00:00:00.000Z" }],
    generatedAt: "2026-09-11T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildFullGameContext + validators (BAL@IND fixture)", () => {
  it("builds a schema-valid, pregame-safe packet for the selected test game", () => {
    const result = buildFullGameContext(buildFixtureInput());
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const issues = validateGameContextPacket(result.packet, TEAMS);
    expect(issues).toEqual([]);
  });

  it("returns an error, not a partial packet, for an unknown gameId", () => {
    const result = buildFullGameContext(buildFixtureInput({ gameId: "2026_01_ZZZ_YYY" }));
    expect(result.status).toBe("error");
  });

  it("is deterministic across repeated builds from identical inputs (excluding generatedAt)", () => {
    const first = buildFullGameContext(buildFixtureInput());
    const second = buildFullGameContext(buildFixtureInput());
    expect(first).toEqual(second);
  });

  it("does not mutate any input artifact object", () => {
    const input = buildFixtureInput();
    const gamesSnapshot = JSON.stringify(input.games);
    const teamsSnapshot = JSON.stringify(input.teams);
    buildFullGameContext(input);
    expect(JSON.stringify(input.games)).toBe(gamesSnapshot);
    expect(JSON.stringify(input.teams)).toBe(teamsSnapshot);
  });

  it("validator catches a postgame-generated packet (generatedAt after kickoff)", () => {
    const result = buildFullGameContext(buildFixtureInput({ generatedAt: "2026-09-14T00:00:00.000Z" }));
    if (result.status !== "ok") throw new Error("expected ok");
    expect(validateGeneratedBeforeKickoff(result.packet)).toHaveLength(1);
  });

  it("validator catches a mis-oriented market spread", () => {
    const result = buildFullGameContext(
      buildFixtureInput({
        currentMarketView: {
          ...buildFixtureInput().currentMarketView!,
          spread: { homeLine: -3, awayLine: 3.5, homePrice: -110, awayPrice: -110 },
        },
      })
    );
    if (result.status !== "ok") throw new Error("expected ok");
    expect(validateSpreadOrientation(result.packet)).toHaveLength(1);
  });

  it("validator catches an implausible total line", () => {
    const result = buildFullGameContext(
      buildFixtureInput({
        currentMarketView: { ...buildFixtureInput().currentMarketView!, total: { line: 5, overPrice: -110, underPrice: -110 } },
      })
    );
    if (result.status !== "ok") throw new Error("expected ok");
    expect(validateTotalSanity(result.packet)).toHaveLength(1);
  });

  it("validator catches a JKB spread / model-market-edge mismatch", () => {
    const result = buildFullGameContext(buildFixtureInput());
    if (result.status !== "ok") throw new Error("expected ok");
    const corrupted = { ...result.packet, jkbModels: { ...result.packet.jkbModels, modelMarketEdge: { ...result.packet.jkbModels.modelMarketEdge, spread: 99 } } };
    expect(validateJkbSpreadOrientation(corrupted)).toHaveLength(1);
  });

  it("validator rejects an injected postgame field anywhere in the packet", () => {
    const result = buildFullGameContext(buildFixtureInput());
    if (result.status !== "ok") throw new Error("expected ok");
    const leaked = { ...result.packet, identity: { ...result.packet.identity, finalScore: "24-17" } } as unknown as typeof result.packet;
    expect(validateNoPostgameFields(leaked)).toHaveLength(1);
  });

  it("honestly represents missing weather and stale/incomplete injury data rather than hiding the gap", () => {
    const result = buildFullGameContext(
      buildFixtureInput({
        matchupInjuries: {
          isHistorical: true,
          dataSeason: 2025,
          dataWeek: 12,
          teams: { bal: { entries: [] }, ind: { entries: [] } },
        },
      })
    );
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.packet.weather.status).toBe("not_available");
    expect(result.packet.availability.feedStale).toBe(true);
    expect(result.packet.availability.provenance_status).toBe("stale");
  });
});
