import {
  NFL_QB_OPPORTUNITY_FEATURE_ROW_SCHEMA_VERSION,
  type NflQbOpportunityFeatureRow,
  type NflWindowedRate,
} from "./types/qbOpportunityFeatures";
import type { NflQbOpportunityOutcome } from "./types/qbOpportunity";
import type { NflTeamPregameFeatures } from "./types/teamPregameFeatures";
import {
  selectLastNGames,
  selectPriorGamesAsOpponent,
  selectPriorGamesInSeason,
  selectPriorSeasonGames,
  selectPriorSeasonGamesAsOpponent,
  sumPlayVolumeWindow,
  type NflTeamGameLogEntry,
} from "./teamPlayVolume";
import { gameJoinKey, type NflGameJoinRecord } from "./historicalOutcomes";

export type NflHistoricalMarketRow = {
  season: number;
  week: number;
  team: string;
  spread: number | null;
  total: number | null;
  impliedTeamTotal: number | null;
  homeAway: "home" | "away";
};

export type NflQbGameLogEntry = {
  playerId: string;
  season: number;
  week: number;
  team: string;
  attempts: number;
  gameDateUtc: string;
};

export function marketKey(season: number, week: number, team: string): string {
  return `${season}|${week}|${team}`;
}

/** Chronological per-QB log of the games he was the PRIMARY passer in. */
export function buildQbGameLog(
  outcomes: readonly NflQbOpportunityOutcome[],
  gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>,
): NflQbGameLogEntry[] {
  return outcomes.map((o) => {
    const join = gameJoinIndex.get(gameJoinKey(o.season, o.week, o.team));
    if (!join) {
      throw new Error(`No schedule entry for ${o.team} season ${o.season} week ${o.week} (QB opportunity outcome).`);
    }
    return {
      playerId: o.primaryQbPlayerId,
      season: o.season,
      week: o.week,
      team: o.team,
      attempts: o.primaryQbAttempts,
      gameDateUtc: join.gameDateUtc,
    };
  });
}

/** Builds one team's team-volume/pass-tendency windowed-rate bundle from an already-built Phase 2 pregame-features row. */
function teamRates(pf: NflTeamPregameFeatures | undefined): {
  offensivePlaysPerGame: NflWindowedRate;
  passAttemptsPerGame: NflWindowedRate;
  rushAttemptsPerGame: NflWindowedRate;
  overallDropbackRate: NflWindowedRate;
  earlyDownNeutralPassRate: NflWindowedRate;
  passRateOverExpected: NflWindowedRate;
} {
  const empty: NflWindowedRate = { seasonPrior: null, last3: null, priorSeason: null };
  if (!pf) {
    return {
      offensivePlaysPerGame: empty, passAttemptsPerGame: empty, rushAttemptsPerGame: empty,
      overallDropbackRate: empty, earlyDownNeutralPassRate: empty, passRateOverExpected: empty,
    };
  }
  return {
    offensivePlaysPerGame: {
      seasonPrior: pf.seasonPrior.offensivePlaysPerGame, last3: pf.last3.offensivePlaysPerGame, priorSeason: pf.priorSeason.offensivePlaysPerGame,
    },
    passAttemptsPerGame: {
      seasonPrior: pf.seasonPrior.passAttemptsPerGame, last3: pf.last3.passAttemptsPerGame, priorSeason: pf.priorSeason.passAttemptsPerGame,
    },
    rushAttemptsPerGame: {
      seasonPrior: pf.seasonPrior.rushAttemptsPerGame, last3: pf.last3.rushAttemptsPerGame, priorSeason: pf.priorSeason.rushAttemptsPerGame,
    },
    overallDropbackRate: {
      seasonPrior: pf.seasonPrior.overallDropbackRate, last3: pf.last3.overallDropbackRate, priorSeason: pf.priorSeason.overallDropbackRate,
    },
    earlyDownNeutralPassRate: {
      seasonPrior: pf.seasonPrior.earlyDownNeutralPassRate, last3: pf.last3.earlyDownNeutralPassRate, priorSeason: pf.priorSeason.earlyDownNeutralPassRate,
    },
    passRateOverExpected: {
      seasonPrior: pf.seasonPrior.passRateOverExpected, last3: pf.last3.passRateOverExpected, priorSeason: pf.priorSeason.passRateOverExpected,
    },
  };
}

function opponentAllowedRates(
  gameLog: readonly NflTeamGameLogEntry[],
  opponent: string,
  season: number,
  beforeDateUtc: string,
): { offensivePlaysPerGameAllowed: NflWindowedRate; passAttemptsPerGameAllowed: NflWindowedRate; overallDropbackRateAllowed: NflWindowedRate } {
  const priorInSeason = selectPriorGamesAsOpponent(gameLog, opponent, season, beforeDateUtc);
  const last3 = selectLastNGames(priorInSeason, 3);
  const priorSeasonGames = selectPriorSeasonGamesAsOpponent(gameLog, opponent, season - 1);
  const sp = sumPlayVolumeWindow(priorInSeason);
  const l3 = sumPlayVolumeWindow(last3);
  const ps = sumPlayVolumeWindow(priorSeasonGames);
  return {
    offensivePlaysPerGameAllowed: { seasonPrior: sp.offensivePlaysPerGame, last3: l3.offensivePlaysPerGame, priorSeason: ps.offensivePlaysPerGame },
    passAttemptsPerGameAllowed: { seasonPrior: sp.passAttemptsPerGame, last3: l3.passAttemptsPerGame, priorSeason: ps.passAttemptsPerGame },
    overallDropbackRateAllowed: { seasonPrior: sp.overallDropbackRate, last3: l3.overallDropbackRate, priorSeason: ps.overallDropbackRate },
  };
}

function qbRoleFeatures(
  qbGameLog: readonly NflQbGameLogEntry[],
  playerId: string,
  team: string,
  season: number,
  beforeDateUtc: string,
) {
  const priorThisSeason = qbGameLog
    .filter((g) => g.playerId === playerId && g.season === season && g.gameDateUtc < beforeDateUtc)
    .sort((a, b) => a.gameDateUtc.localeCompare(b.gameDateUtc));
  const last3 = selectLastNGames(priorThisSeason, 3);
  const priorSeasonGames = qbGameLog.filter((g) => g.playerId === playerId && g.season === season - 1);
  const avg = (games: readonly NflQbGameLogEntry[]) =>
    games.length > 0 ? games.reduce((s, g) => s + g.attempts, 0) / games.length : null;
  const isFirstStartForTeamThisSeason = !priorThisSeason.some((g) => g.team === team);

  return {
    attemptsPerGameSeasonPrior: avg(priorThisSeason),
    attemptsPerGameLast3: avg(last3),
    attemptsPerGamePriorSeason: avg(priorSeasonGames),
    gamesStartedPriorThisSeason: priorThisSeason.length,
    hasPriorSeasonStarts: priorSeasonGames.length > 0,
    isFirstStartForTeamThisSeason,
  };
}

export function buildQbOpportunityFeatureRow(
  outcome: NflQbOpportunityOutcome,
  args: {
    gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>;
    teamPregameFeaturesByKey: ReadonlyMap<string, NflTeamPregameFeatures>;
    fullTeamGameLog: readonly NflTeamGameLogEntry[];
    marketByKey: ReadonlyMap<string, NflHistoricalMarketRow>;
    qbGameLog: readonly NflQbGameLogEntry[];
    split: "train" | "select" | "holdout";
  },
): NflQbOpportunityFeatureRow {
  const join = args.gameJoinIndex.get(gameJoinKey(outcome.season, outcome.week, outcome.team));
  if (!join) throw new Error(`No schedule entry for ${outcome.team} season ${outcome.season} week ${outcome.week}.`);

  const ownPf = args.teamPregameFeaturesByKey.get(`${outcome.season}|${outcome.week}|${outcome.team}`);
  const own = teamRates(ownPf);
  const opponentAllowed = opponentAllowedRates(args.fullTeamGameLog, outcome.opponent, outcome.season, join.gameDateUtc);
  const market = args.marketByKey.get(marketKey(outcome.season, outcome.week, outcome.team));
  const qbRole = qbRoleFeatures(args.qbGameLog, outcome.primaryQbPlayerId, outcome.team, outcome.season, join.gameDateUtc);

  return {
    schemaVersion: NFL_QB_OPPORTUNITY_FEATURE_ROW_SCHEMA_VERSION,
    season: outcome.season,
    week: outcome.week,
    gameId: outcome.gameId,
    team: outcome.team,
    opponent: outcome.opponent,
    primaryQbPlayerId: outcome.primaryQbPlayerId,
    primaryQbPlayerName: outcome.primaryQbPlayerName,
    target: { primaryQbAttempts: outcome.primaryQbAttempts },
    features: {
      teamVolume: {
        offensivePlaysPerGame: own.offensivePlaysPerGame,
        passAttemptsPerGame: own.passAttemptsPerGame,
        rushAttemptsPerGame: own.rushAttemptsPerGame,
      },
      passTendency: {
        overallDropbackRate: own.overallDropbackRate,
        earlyDownNeutralPassRate: own.earlyDownNeutralPassRate,
        passRateOverExpected: own.passRateOverExpected,
      },
      opponent: opponentAllowed,
      market: {
        spread: market?.spread ?? null,
        total: market?.total ?? null,
        impliedTeamTotal: market?.impliedTeamTotal ?? null,
        homeAway: market?.homeAway ?? join.homeAway,
      },
      qbRole,
    },
    diagnostics: {
      instabilityCategory: outcome.instabilityCategory,
      primaryQbAttemptShare: outcome.primaryQbAttemptShare,
    },
    split: args.split,
  };
}
