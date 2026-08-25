import {
  NFL_QB_PASSING_FEATURE_ROW_SCHEMA_VERSION,
  type NflQbPassingFeatureRow,
  type NflWindowedRate,
} from "./types/qbPassingFeatures";
import type { NflQbPassingOutcome } from "./types/qbPassing";
import type { NflTeamPregameFeatures } from "./types/teamPregameFeatures";
import {
  selectLastNGames,
  selectPriorGamesAsOpponent,
  selectPriorGamesInSeason,
  selectPriorSeasonGamesAsOpponent,
  type NflTeamGameLogEntry,
} from "./teamPlayVolume";
import {
  selectPriorEpaGamesAsOpponent,
  selectPriorSeasonEpaGamesAsOpponent,
  sumEpaWindow,
  type NflTeamEpaGameLogEntry,
} from "./qbPassingEpaContext";
import { gameJoinKey, type NflGameJoinRecord } from "./historicalOutcomes";
import type { NflHistoricalMarketRow } from "./qbOpportunityFeatures";
import { marketKey } from "./qbOpportunityFeatures";

export type NflQbStatGameLogEntry = {
  playerId: string;
  season: number;
  week: number;
  team: string;
  attempts: number;
  completions: number;
  passingYards: number;
  gameDateUtc: string;
};

export function buildQbStatGameLog(
  outcomes: readonly NflQbPassingOutcome[],
  gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>,
): NflQbStatGameLogEntry[] {
  return outcomes.map((o) => {
    const join = gameJoinIndex.get(gameJoinKey(o.season, o.week, o.team));
    if (!join) throw new Error(`No schedule entry for ${o.team} season ${o.season} week ${o.week}.`);
    return {
      playerId: o.primaryQbPlayerId, season: o.season, week: o.week, team: o.team,
      attempts: o.primaryQbAttempts, completions: o.primaryQbCompletions, passingYards: o.primaryQbPassingYards,
      gameDateUtc: join.gameDateUtc,
    };
  });
}

function qbWindowedRates(games: readonly NflQbStatGameLogEntry[]): {
  attempts: number | null; ypa: number | null; completionPct: number | null; passingYardsPerGame: number | null;
} {
  if (games.length === 0) return { attempts: null, ypa: null, completionPct: null, passingYardsPerGame: null };
  const totalAttempts = games.reduce((s, g) => s + g.attempts, 0);
  const totalCompletions = games.reduce((s, g) => s + g.completions, 0);
  const totalYards = games.reduce((s, g) => s + g.passingYards, 0);
  return {
    attempts: totalAttempts / games.length,
    ypa: totalAttempts > 0 ? totalYards / totalAttempts : null,
    completionPct: totalAttempts > 0 ? totalCompletions / totalAttempts : null,
    passingYardsPerGame: totalYards / games.length,
  };
}

function qbRollingWindows(
  qbGameLog: readonly NflQbStatGameLogEntry[], playerId: string, season: number, beforeDateUtc: string,
) {
  const priorThisSeason = qbGameLog
    .filter((g) => g.playerId === playerId && g.season === season && g.gameDateUtc < beforeDateUtc)
    .sort((a, b) => a.gameDateUtc.localeCompare(b.gameDateUtc));
  const last3 = priorThisSeason.slice(Math.max(0, priorThisSeason.length - 3));
  const priorSeasonGames = qbGameLog.filter((g) => g.playerId === playerId && g.season === season - 1);

  const sp = qbWindowedRates(priorThisSeason);
  const l3 = qbWindowedRates(last3);
  const ps = qbWindowedRates(priorSeasonGames);

  return {
    gamesStartedPriorThisSeason: priorThisSeason.length,
    hasPriorSeasonStarts: priorSeasonGames.length > 0,
    qbAttemptsPerGame: { seasonPrior: sp.attempts, last3: l3.attempts, priorSeason: ps.attempts } as NflWindowedRate,
    yardsPerAttempt: { seasonPrior: sp.ypa, last3: l3.ypa, priorSeason: ps.ypa } as NflWindowedRate,
    completionPct: { seasonPrior: sp.completionPct, last3: l3.completionPct, priorSeason: ps.completionPct } as NflWindowedRate,
    passingYardsPerGame: { seasonPrior: sp.passingYardsPerGame, last3: l3.passingYardsPerGame, priorSeason: ps.passingYardsPerGame } as NflWindowedRate,
  };
}

function teamRates(pf: NflTeamPregameFeatures | undefined) {
  const empty: NflWindowedRate = { seasonPrior: null, last3: null, priorSeason: null };
  if (!pf) {
    return {
      offensivePlaysPerGame: empty, passAttemptsPerGame: empty,
      overallDropbackRate: empty, earlyDownNeutralPassRate: empty, passRateOverExpected: empty,
    };
  }
  return {
    offensivePlaysPerGame: { seasonPrior: pf.seasonPrior.offensivePlaysPerGame, last3: pf.last3.offensivePlaysPerGame, priorSeason: pf.priorSeason.offensivePlaysPerGame },
    passAttemptsPerGame: { seasonPrior: pf.seasonPrior.passAttemptsPerGame, last3: pf.last3.passAttemptsPerGame, priorSeason: pf.priorSeason.passAttemptsPerGame },
    overallDropbackRate: { seasonPrior: pf.seasonPrior.overallDropbackRate, last3: pf.last3.overallDropbackRate, priorSeason: pf.priorSeason.overallDropbackRate },
    earlyDownNeutralPassRate: { seasonPrior: pf.seasonPrior.earlyDownNeutralPassRate, last3: pf.last3.earlyDownNeutralPassRate, priorSeason: pf.priorSeason.earlyDownNeutralPassRate },
    passRateOverExpected: { seasonPrior: pf.seasonPrior.passRateOverExpected, last3: pf.last3.passRateOverExpected, priorSeason: pf.priorSeason.passRateOverExpected },
  };
}

function opponentAllowedRates(
  fullTeamGameLog: readonly NflTeamGameLogEntry[], opponent: string, season: number, beforeDateUtc: string,
) {
  const priorInSeason = selectPriorGamesAsOpponent(fullTeamGameLog, opponent, season, beforeDateUtc);
  const last3 = selectLastNGames(priorInSeason, 3);
  const priorSeasonGames = selectPriorSeasonGamesAsOpponent(fullTeamGameLog, opponent, season - 1);
  const rate = (games: typeof priorInSeason) => {
    if (games.length === 0) return { attempts: null, dropbackRate: null };
    const eligible = games.reduce((s, g) => s + g.eligiblePlays, 0);
    const pass = games.reduce((s, g) => s + g.passPlays, 0);
    return { attempts: pass / games.length, dropbackRate: eligible > 0 ? pass / eligible : null };
  };
  const sp = rate(priorInSeason);
  const l3 = rate(last3);
  const ps = rate(priorSeasonGames);
  return {
    passAttemptsPerGameAllowed: { seasonPrior: sp.attempts, last3: l3.attempts, priorSeason: ps.attempts } as NflWindowedRate,
    overallDropbackRateAllowed: { seasonPrior: sp.dropbackRate, last3: l3.dropbackRate, priorSeason: ps.dropbackRate } as NflWindowedRate,
  };
}

function epaAllowedRates(
  epaGameLog: readonly NflTeamEpaGameLogEntry[], opponent: string, season: number, beforeDateUtc: string,
): NflWindowedRate {
  const priorInSeason = selectPriorEpaGamesAsOpponent(epaGameLog, opponent, season, beforeDateUtc);
  const last3 = priorInSeason.slice(Math.max(0, priorInSeason.length - 3));
  const priorSeasonGames = selectPriorSeasonEpaGamesAsOpponent(epaGameLog, opponent, season - 1);
  return {
    seasonPrior: sumEpaWindow(priorInSeason).passEpaPerPlay,
    last3: sumEpaWindow(last3).passEpaPerPlay,
    priorSeason: sumEpaWindow(priorSeasonGames).passEpaPerPlay,
  };
}

export function buildQbPassingFeatureRow(
  outcome: NflQbPassingOutcome,
  args: {
    gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>;
    teamPregameFeaturesByKey: ReadonlyMap<string, NflTeamPregameFeatures>;
    fullTeamGameLog: readonly NflTeamGameLogEntry[];
    epaGameLog: readonly NflTeamEpaGameLogEntry[];
    marketByKey: ReadonlyMap<string, NflHistoricalMarketRow>;
    domeByGameId: ReadonlyMap<string, boolean>;
    qbStatGameLog: readonly NflQbStatGameLogEntry[];
  },
): NflQbPassingFeatureRow {
  const join = args.gameJoinIndex.get(gameJoinKey(outcome.season, outcome.week, outcome.team));
  if (!join) throw new Error(`No schedule entry for ${outcome.team} season ${outcome.season} week ${outcome.week}.`);

  const ownPf = args.teamPregameFeaturesByKey.get(`${outcome.season}|${outcome.week}|${outcome.team}`);
  const own = teamRates(ownPf);
  const opponentAllowed = opponentAllowedRates(args.fullTeamGameLog, outcome.opponent, outcome.season, join.gameDateUtc);
  const passEpaPerPlayAllowed = epaAllowedRates(args.epaGameLog, outcome.opponent, outcome.season, join.gameDateUtc);
  const market = args.marketByKey.get(marketKey(outcome.season, outcome.week, outcome.team));
  const qbRolling = qbRollingWindows(args.qbStatGameLog, outcome.primaryQbPlayerId, outcome.season, join.gameDateUtc);
  const isDome = outcome.gameId ? args.domeByGameId.get(outcome.gameId) ?? null : null;

  return {
    schemaVersion: NFL_QB_PASSING_FEATURE_ROW_SCHEMA_VERSION,
    season: outcome.season, week: outcome.week, gameId: outcome.gameId, team: outcome.team, opponent: outcome.opponent,
    primaryQbPlayerId: outcome.primaryQbPlayerId, primaryQbPlayerName: outcome.primaryQbPlayerName,
    target: { primaryQbPassingYards: outcome.primaryQbPassingYards },
    features: {
      opportunity: {
        offensivePlaysPerGame: own.offensivePlaysPerGame,
        passAttemptsPerGame: own.passAttemptsPerGame,
        qbAttemptsPerGame: qbRolling.qbAttemptsPerGame,
      },
      qbEfficiency: {
        yardsPerAttempt: qbRolling.yardsPerAttempt,
        completionPct: qbRolling.completionPct,
      },
      qbRollingPassingYardsPerGame: qbRolling.passingYardsPerGame,
      opponentPassDefense: {
        passAttemptsPerGameAllowed: opponentAllowed.passAttemptsPerGameAllowed,
        overallDropbackRateAllowed: opponentAllowed.overallDropbackRateAllowed,
        passEpaPerPlayAllowed,
      },
      proePassTendency: {
        overallDropbackRate: own.overallDropbackRate,
        earlyDownNeutralPassRate: own.earlyDownNeutralPassRate,
        passRateOverExpected: own.passRateOverExpected,
      },
      market: {
        spread: market?.spread ?? null,
        total: market?.total ?? null,
        impliedTeamTotal: market?.impliedTeamTotal ?? null,
        homeAway: market?.homeAway ?? join.homeAway,
        isDome,
      },
    },
    diagnostics: {
      instabilityCategory: outcome.instabilityCategory,
      primaryQbAttemptShare: outcome.primaryQbAttemptShare,
      hasPriorSeasonStarts: qbRolling.hasPriorSeasonStarts,
      gamesStartedPriorThisSeason: qbRolling.gamesStartedPriorThisSeason,
    },
  };
}
