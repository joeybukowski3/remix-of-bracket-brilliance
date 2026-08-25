import type { CfbGame, CfbGameStatus } from "../../../data/cfb/types";
import {
  CFB_EXTERNAL_TEAM_MAPPINGS,
  getJkbTeamIdForCfbdName,
} from "../../../data/cfb/externalTeamMapping";
import type {
  CfbPreseasonModelInputs,
  CfbPriorPerformanceInputs,
  CfbReturningProductionInputs,
  CfbRosterTalentInputs,
} from "../model";
import { computeOpponentAdjustedPerformance } from "./opponentAdjustment";
import { CFB_PIPELINE_CONFIG } from "./config";
import type {
  CfbdGame,
  CfbdGameTeamStats,
  CfbdReturningProduction,
  CfbdTalent,
  CfbdTeam,
  CfbHistoricalGameType,
  CfbNormalizedHistoricalGame,
  CfbPriorPerformanceQa,
  CfbTeamGamePerformance,
  CfbTransitionPriorFallback,
  CfbdTransitionTeamCache,
} from "./types";

export type CfbResolvedCfbdTeam = {
  jkbTeamId: string;
  cfbdId: number;
  cfbdName: string;
};

function average(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0) / known.length;
}

function safeRatio(numerator: number | null, denominator: number | null): number | null {
  return numerator === null || denominator === null || denominator <= 0
    ? null
    : numerator / denominator;
}

export function resolveCfbdFbsTeams(teams: readonly CfbdTeam[]): CfbResolvedCfbdTeam[] {
  const resolved = teams
    .map((team) => {
      const jkbTeamId = getJkbTeamIdForCfbdName(team.school);
      return jkbTeamId ? { jkbTeamId, cfbdId: team.id, cfbdName: team.school } : null;
    })
    .filter((row): row is CfbResolvedCfbdTeam => row !== null);

  const byJkb = new Set(resolved.map((row) => row.jkbTeamId));
  const byCfbdId = new Set(resolved.map((row) => row.cfbdId));
  const missing = CFB_EXTERNAL_TEAM_MAPPINGS.filter((mapping) => !byJkb.has(mapping.jkbTeamId));
  if (missing.length > 0 || resolved.length !== CFB_EXTERNAL_TEAM_MAPPINGS.length) {
    throw new Error(
      `CFBD team mapping incomplete: ${resolved.length}/${CFB_EXTERNAL_TEAM_MAPPINGS.length}; missing ${missing
        .map((mapping) => mapping.cfbdName)
        .join(", ")}`,
    );
  }
  if (byCfbdId.size !== resolved.length || byJkb.size !== resolved.length) {
    throw new Error("CFBD team mapping contains duplicate external or JKB team IDs");
  }
  return resolved.sort((a, b) => a.jkbTeamId.localeCompare(b.jkbTeamId));
}

function classifyGame(game: CfbdGame): CfbHistoricalGameType {
  const note = (game.notes ?? "").toLowerCase();
  if (game.playoff != null || /college football playoff|cfp|national championship/.test(note)) {
    return "playoff";
  }
  if (/\bchampionship(?: game)?\b/.test(note)) return "conference_championship";
  if (game.seasonType === "regular") return "regular";
  if (/\bbowl\b/.test(note)) return "bowl";
  return "other_postseason";
}

function isFcs(classification: string | null | undefined): boolean {
  return classification?.toLowerCase() === "fcs";
}

export function normalizeCfbdGames(
  games: readonly CfbdGame[],
  mappings: readonly CfbResolvedCfbdTeam[],
): CfbNormalizedHistoricalGame[] {
  const byCfbdId = new Map(mappings.map((row) => [row.cfbdId, row.jkbTeamId]));
  return games.map((game) => {
    const homeTeamId = byCfbdId.get(game.homeId) ?? getJkbTeamIdForCfbdName(game.homeTeam);
    const awayTeamId = byCfbdId.get(game.awayId) ?? getJkbTeamIdForCfbdName(game.awayTeam);
    return {
      gameId: String(game.id),
      season: game.season,
      week: game.week,
      date: game.startDate.slice(0, 10),
      homeTeamId,
      awayTeamId,
      homeExternalOpponentId: homeTeamId ? null : `cfbd:${game.homeId}`,
      awayExternalOpponentId: awayTeamId ? null : `cfbd:${game.awayId}`,
      homeScore: game.homePoints ?? null,
      awayScore: game.awayPoints ?? null,
      neutralSite: game.neutralSite,
      completed: game.completed,
      status: game.completed ? "final" : "scheduled",
      seasonType: game.seasonType,
      gameType: classifyGame(game),
      homeClassification: game.homeClassification ?? null,
      awayClassification: game.awayClassification ?? null,
      includesFcsOpponent: isFcs(game.homeClassification) || isFcs(game.awayClassification),
    };
  });
}

function normalizedCategory(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePassAttempts(value: string | undefined): number | null {
  if (!value) return null;
  const parts = value.split("-");
  return parseNumber(parts.length > 1 ? parts[parts.length - 1] : value);
}

function extractStats(stats: CfbdGameTeamStats["teams"][number]["stats"]) {
  const lookup = new Map(stats.map((row) => [normalizedCategory(row.category), row.stat]));
  const totalYards = parseNumber(lookup.get("totalyards"));
  const directPlays = parseNumber(
    lookup.get("totaloffensiveplays") ?? lookup.get("offensiveplays") ?? lookup.get("plays"),
  );
  const rushAttempts = parseNumber(lookup.get("rushingattempts"));
  const passAttempts = parsePassAttempts(
    lookup.get("completionattempts") ?? lookup.get("completionsattempts"),
  );
  const plays = directPlays ??
    (rushAttempts !== null && passAttempts !== null ? rushAttempts + passAttempts : null);
  const directYpp = parseNumber(lookup.get("yardsperplay"));
  return {
    totalYards,
    plays,
    yardsPerPlay: directYpp ?? safeRatio(totalYards, plays),
    turnovers: parseNumber(lookup.get("turnovers")),
  };
}

export function normalizeCfbdGamePerformance(
  statsGames: readonly CfbdGameTeamStats[],
  games: readonly CfbNormalizedHistoricalGame[],
  mappings: readonly CfbResolvedCfbdTeam[],
): CfbTeamGamePerformance[] {
  const gameById = new Map(games.map((game) => [game.gameId, game]));
  const byCfbdId = new Map(mappings.map((row) => [row.cfbdId, row.jkbTeamId]));
  const rows: CfbTeamGamePerformance[] = [];

  for (const statsGame of statsGames) {
    const game = gameById.get(String(statsGame.id));
    if (!game || !game.completed || statsGame.teams.length !== 2) continue;
    for (const teamRow of statsGame.teams) {
      const teamId = byCfbdId.get(teamRow.teamId) ?? getJkbTeamIdForCfbdName(teamRow.team);
      if (!teamId) continue;
      const opponentRow = statsGame.teams.find((candidate) => candidate !== teamRow);
      if (!opponentRow) continue;
      const opponentTeamId = byCfbdId.get(opponentRow.teamId) ?? getJkbTeamIdForCfbdName(opponentRow.team);
      const own = extractStats(teamRow.stats);
      const opponent = extractStats(opponentRow.stats);
      const isHome = teamRow.homeAway === "home";
      rows.push({
        gameId: String(statsGame.id),
        teamId,
        teamClassification: isHome ? game.homeClassification : game.awayClassification,
        opponentTeamId,
        opponentClassification: isHome ? game.awayClassification : game.homeClassification,
        points: teamRow.points ?? (isHome ? game.homeScore : game.awayScore),
        pointsAllowed: opponentRow.points ?? (isHome ? game.awayScore : game.homeScore),
        plays: own.plays,
        totalYards: own.totalYards,
        yardsPerPlay: own.yardsPerPlay,
        yardsPerPlayAllowed: opponent.yardsPerPlay,
        turnovers: own.turnovers,
      });
    }
  }
  return rows.sort((a, b) => a.gameId.localeCompare(b.gameId) || a.teamId.localeCompare(b.teamId));
}

export function normalizeCfbdTransitionPriorFallbacks(
  cache: CfbdTransitionTeamCache,
  mappings: readonly CfbResolvedCfbdTeam[],
  existingFbsGameIds: ReadonlySet<string>,
): CfbTransitionPriorFallback[] {
  return cache.teams.map((team) => {
    const gamesById = new Map(team.games.map((game) => [String(game.id), game]));
    const statsById = new Map(team.teamStats.map((game) => [String(game.id), game]));
    const games = normalizeCfbdGames([...gamesById.values()], mappings);
    const performances = normalizeCfbdGamePerformance(
      [...statsById.values()],
      games,
      mappings,
    ).filter((row) => row.teamId === team.teamId);
    const sourceGameIds = [...new Set(performances.map((row) => row.gameId))].sort();
    return {
      teamId: team.teamId,
      sourceClassification: team.sourceClassification,
      games,
      performances,
      sourceGameIds,
      overlappingFbsCacheGameIds: sourceGameIds.filter((gameId) => existingFbsGameIds.has(gameId)),
      duplicateGameIdsRemoved: team.games.length - gamesById.size,
    };
  });
}

function summarizePriorRows(
  teamId: string,
  rows: readonly CfbTeamGamePerformance[],
  games: readonly CfbNormalizedHistoricalGame[],
): { input: CfbPriorPerformanceInputs; qa: CfbPriorPerformanceQa } {
  const scores = rows.filter((row) => row.points !== null && row.pointsAllowed !== null);
  const wins = scores.filter((row) => (row.points as number) > (row.pointsAllowed as number)).length;
  const losses = scores.filter((row) => (row.points as number) < (row.pointsAllowed as number)).length;
  const rawOffense = average(rows.map((row) => row.yardsPerPlay));
  const rawDefense = average(rows.map((row) => row.yardsPerPlayAllowed));
  const fcsGames = rows.filter((row) => row.opponentClassification?.toLowerCase() === "fcs").length;
  const completedGameIds = new Set(games.filter((game) => game.completed).map((game) => game.gameId));
  return {
    input: {
      teamId,
      season: 2025,
      offensiveYardsPerPlay: rawOffense,
      defensiveYardsPerPlayAllowed: rawDefense,
      pointsPerGame: average(rows.map((row) => row.points)),
      pointsAllowedPerGame: average(rows.map((row) => row.pointsAllowed)),
      wins,
      losses,
      pointDifferentialPerGame: average(
        rows.map((row) =>
          row.points === null || row.pointsAllowed === null ? null : row.points - row.pointsAllowed,
        ),
      ),
    },
    qa: {
      teamId,
      priorPerformanceSource: null,
      rawOffense,
      rawDefense,
      opponentAdjustedOffense: null,
      opponentAdjustedDefense: null,
      games: rows.filter((row) => completedGameIds.has(row.gameId)).length,
      fbsGames: rows.filter((row) => row.opponentClassification?.toLowerCase() === "fbs").length,
      fcsGames,
    },
  };
}

function toPercent(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value) || value < 0) return null;
  if (value <= 1) return value * 100;
  return value <= 100 ? value : null;
}

export function buildPreseasonModelInputs(options: {
  teamIds: readonly string[];
  performances: readonly CfbTeamGamePerformance[];
  games: readonly CfbNormalizedHistoricalGame[];
  priorFallbacks?: readonly CfbTransitionPriorFallback[];
  returningProduction?: readonly CfbdReturningProduction[];
  talent?: readonly CfbdTalent[];
}): { inputs: CfbPreseasonModelInputs[]; qa: CfbPriorPerformanceQa[] } {
  const adjustment = computeOpponentAdjustedPerformance(options.teamIds, options.performances);
  const adjustedByTeam = new Map(adjustment.adjusted.map((row) => [row.teamId, row]));
  const fallbackByTeam = new Map((options.priorFallbacks ?? []).map((row) => [row.teamId, row]));
  const returningByTeam = new Map(
    (options.returningProduction ?? [])
      .map((row) => [getJkbTeamIdForCfbdName(row.team), row] as const)
      .filter((row): row is readonly [string, CfbdReturningProduction] => row[0] !== null),
  );
  const talentByTeam = new Map(
    (options.talent ?? [])
      .map((row) => [getJkbTeamIdForCfbdName(row.team), row] as const)
      .filter((row): row is readonly [string, CfbdTalent] => row[0] !== null),
  );
  const qa: CfbPriorPerformanceQa[] = [];

  const inputs = options.teamIds.map((teamId): CfbPreseasonModelInputs => {
    const fbsRows = options.performances.filter(
      (row) => row.teamId === teamId && row.teamClassification?.toLowerCase() === "fbs",
    );
    const standardSummary = summarizePriorRows(teamId, fbsRows, options.games);
    const fallback = fallbackByTeam.get(teamId);
    const useFallback = standardSummary.qa.games < CFB_PIPELINE_CONFIG.minimumGames && fallback !== undefined;
    const summary = useFallback
      ? summarizePriorRows(teamId, fallback.performances, fallback.games)
      : standardSummary;
    const opponentAdjusted = useFallback ? null : adjustedByTeam.get(teamId) ?? null;
    summary.qa.opponentAdjustedOffense =
      opponentAdjusted?.opponentAdjustedOffensiveEfficiency ?? null;
    summary.qa.opponentAdjustedDefense =
      opponentAdjusted?.opponentAdjustedDefensiveEfficiency ?? null;
    const hasAdjustedPrior =
      opponentAdjusted?.opponentAdjustedOffensiveEfficiency !== null &&
      opponentAdjusted?.opponentAdjustedOffensiveEfficiency !== undefined;
    const priorPerformanceMetadata: CfbPreseasonModelInputs["priorPerformanceMetadata"] =
      summary.qa.games === 0
        ? null
        : {
            source: useFallback
              ? "prior-fcs-fallback"
              : hasAdjustedPrior
                ? "prior-fbs-opponent-adjusted"
                : "prior-fbs-raw",
            sampleGames: summary.qa.games,
            sourceClassification: useFallback ? "fcs" : "fbs",
            sourceGameIds: useFallback
              ? fallback.sourceGameIds
              : [...new Set(fbsRows.map((row) => row.gameId))].sort(),
          };
    summary.qa.priorPerformanceSource = priorPerformanceMetadata;
    qa.push(summary.qa);

    const returning = returningByTeam.get(teamId);
    const returningInput: CfbReturningProductionInputs | null = returning
      ? {
          teamId,
          returningQuarterback: null,
          returningOffensiveStarters: null,
          returningDefensiveStarters: null,
          returningOffensiveProductionPct: toPercent(returning.percentPPA),
          returningDefensiveProductionPct: null,
        }
      : null;
    const talent = talentByTeam.get(teamId);
    const talentInput: CfbRosterTalentInputs | null = talent
      ? {
          teamId,
          recruitingTalentScore: null,
          transferPortalTalentScore: null,
          rosterCompositeScore: Number.isFinite(talent.talent) ? talent.talent : null,
        }
      : null;

    return {
      teamId,
      priorPerformance: summary.qa.games > 0 ? summary.input : null,
      priorPerformanceMetadata,
      opponentAdjusted,
      returningProduction: returningInput,
      rosterTalent: talentInput,
      coachingContinuity: null,
    };
  });
  return { inputs, qa };
}

const EMPTY_ODDS = Object.freeze({
  openingSpread: null,
  currentSpread: null,
  awayMoneyline: null,
  homeMoneyline: null,
  openingTotal: null,
  currentTotal: null,
});
const EMPTY_MODEL = Object.freeze({
  jkbProjectedSpread: null,
  jkbProjectedTotal: null,
  homeWinProbability: null,
  awayWinProbability: null,
  neutralPowerDifference: null,
  homeFieldAdjustment: null,
  jkbPowerLine: null,
});

export function normalizeCfbdSchedule(
  games: readonly CfbdGame[],
  mappings: readonly CfbResolvedCfbdTeam[],
): CfbGame[] {
  const byCfbdId = new Map(mappings.map((row) => [row.cfbdId, row.jkbTeamId]));
  return games.map((game) => {
    const dateTime = new Date(game.startDate);
    const status: CfbGameStatus = game.completed ? "final" : "scheduled";
    return {
      id: String(game.id),
      season: game.season,
      week: game.week,
      date: game.startDate.slice(0, 10),
      time: game.startTimeTBD || Number.isNaN(dateTime.valueOf())
        ? null
        : dateTime.toISOString().slice(11, 16),
      awayTeamId: byCfbdId.get(game.awayId) ?? `cfbd:${game.awayId}`,
      homeTeamId: byCfbdId.get(game.homeId) ?? `cfbd:${game.homeId}`,
      neutralSite: game.neutralSite,
      venue: game.venue ?? null,
      // Populated separately by mergeScheduleVenueLocations (needs a /venues
      // join by venueId) — never fabricated here.
      venueCity: null,
      venueState: null,
      tvNetwork: null,
      gameStatus: status,
      awayScore: game.awayPoints ?? null,
      homeScore: game.homePoints ?? null,
      odds: { ...EMPTY_ODDS },
      model: { ...EMPTY_MODEL },
    };
  });
}
