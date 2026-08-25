import { NFL_RUSHING_FEATURE_ROW_SCHEMA_VERSION, type NflRushingFeatureRow, type NflWindowedRate } from "./types/rushingFeatures";
import type { NflRushingOutcome } from "./types/rushingOutcome";
import type { NflTeamPregameFeatures } from "./types/teamPregameFeatures";
import { selectLastNGames, selectPriorGamesAsOpponent, selectPriorGamesInSeason, selectPriorSeasonGamesAsOpponent, type NflTeamGameLogEntry } from "./teamPlayVolume";
import { selectPriorEpaGamesAsOpponent, selectPriorSeasonEpaGamesAsOpponent, sumEpaWindow, type NflTeamEpaGameLogEntry } from "./qbPassingEpaContext";
import { gameJoinKey, type NflGameJoinRecord } from "./historicalOutcomes";
import type { NflHistoricalMarketRow } from "./qbOpportunityFeatures";
import { marketKey } from "./qbOpportunityFeatures";

export type NflPlayerRushingStatLogEntry = {
  playerId: string;
  season: number;
  week: number;
  team: string;
  carries: number;
  rushingYards: number;
  carryShare: number | null;
  gameDateUtc: string;
};

export function buildPlayerRushingStatLog(
  outcomes: readonly NflRushingOutcome[],
  gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>,
): NflPlayerRushingStatLogEntry[] {
  const log: NflPlayerRushingStatLogEntry[] = [];
  for (const o of outcomes) {
    const join = gameJoinIndex.get(gameJoinKey(o.season, o.week, o.team));
    if (!join) continue;
    log.push({ playerId: o.playerId, season: o.season, week: o.week, team: o.team, carries: o.carries, rushingYards: o.rushingYards, carryShare: o.carryShare, gameDateUtc: join.gameDateUtc });
  }
  return log;
}

/** Team-game leading-RB carry share, from every RB row in the outcome set -- a committee-concentration proxy. */
export function buildTeamTopRbCarryShareByGameTeam(outcomes: readonly NflRushingOutcome[]): Map<string, number> {
  const byGameTeam = new Map<string, number[]>();
  for (const o of outcomes) {
    if (o.position !== "RB" || o.carryShare == null) continue;
    const key = `${o.gameId}|${o.team}`;
    const shares = byGameTeam.get(key) ?? [];
    shares.push(o.carryShare);
    byGameTeam.set(key, shares);
  }
  const result = new Map<string, number>();
  for (const [key, shares] of byGameTeam) result.set(key, Math.max(...shares));
  return result;
}

function windowRates(games: readonly NflPlayerRushingStatLogEntry[]): { carries: number | null; ypc: number | null; carryShare: number | null } {
  if (games.length === 0) return { carries: null, ypc: null, carryShare: null };
  const totalCarries = games.reduce((s, g) => s + g.carries, 0);
  const totalYards = games.reduce((s, g) => s + g.rushingYards, 0);
  const sharesWithValue = games.map((g) => g.carryShare).filter((v): v is number => v != null);
  return {
    carries: totalCarries / games.length,
    ypc: totalCarries > 0 ? totalYards / totalCarries : null,
    carryShare: sharesWithValue.length > 0 ? sharesWithValue.reduce((s, v) => s + v, 0) / sharesWithValue.length : null,
  };
}

function playerRollingWindows(log: readonly NflPlayerRushingStatLogEntry[], playerId: string, season: number, beforeDateUtc: string) {
  const priorThisSeason = log
    .filter((g) => g.playerId === playerId && g.season === season && g.gameDateUtc < beforeDateUtc)
    .sort((a, b) => a.gameDateUtc.localeCompare(b.gameDateUtc));
  const last3 = priorThisSeason.slice(Math.max(0, priorThisSeason.length - 3));
  const priorSeasonGames = log.filter((g) => g.playerId === playerId && g.season === season - 1);
  const sp = windowRates(priorThisSeason);
  const l3 = windowRates(last3);
  const ps = windowRates(priorSeasonGames);
  return {
    gamesWithCarriesPriorThisSeason: priorThisSeason.length,
    hasPriorSeasonCarries: priorSeasonGames.length > 0,
    carriesPerGame: { seasonPrior: sp.carries, last3: l3.carries, priorSeason: ps.carries } as NflWindowedRate,
    yardsPerCarry: { seasonPrior: sp.ypc, last3: l3.ypc, priorSeason: ps.ypc } as NflWindowedRate,
    carryShare: { seasonPrior: sp.carryShare, last3: l3.carryShare, priorSeason: ps.carryShare } as NflWindowedRate,
  };
}

function teamRushRates(pf: NflTeamPregameFeatures | undefined) {
  const empty: NflWindowedRate = { seasonPrior: null, last3: null, priorSeason: null };
  if (!pf) return { rushAttemptsPerGame: empty, overallDropbackRate: empty, passRateOverExpected: empty };
  return {
    rushAttemptsPerGame: { seasonPrior: pf.seasonPrior.rushAttemptsPerGame, last3: pf.last3.rushAttemptsPerGame, priorSeason: pf.priorSeason.rushAttemptsPerGame },
    overallDropbackRate: { seasonPrior: pf.seasonPrior.overallDropbackRate, last3: pf.last3.overallDropbackRate, priorSeason: pf.priorSeason.overallDropbackRate },
    passRateOverExpected: { seasonPrior: pf.seasonPrior.passRateOverExpected, last3: pf.last3.passRateOverExpected, priorSeason: pf.priorSeason.passRateOverExpected },
  };
}

function opponentRushAllowedRate(fullTeamGameLog: readonly NflTeamGameLogEntry[], opponent: string, season: number, beforeDateUtc: string): NflWindowedRate {
  const priorInSeason = selectPriorGamesAsOpponent(fullTeamGameLog, opponent, season, beforeDateUtc);
  const last3 = selectLastNGames(priorInSeason, 3);
  const priorSeasonGames = selectPriorSeasonGamesAsOpponent(fullTeamGameLog, opponent, season - 1);
  const rate = (games: typeof priorInSeason) => (games.length > 0 ? games.reduce((s, g) => s + g.rushPlays, 0) / games.length : null);
  return { seasonPrior: rate(priorInSeason), last3: rate(last3), priorSeason: rate(priorSeasonGames) };
}

function opponentRushEpaAllowedRate(epaGameLog: readonly NflTeamEpaGameLogEntry[], opponent: string, season: number, beforeDateUtc: string): NflWindowedRate {
  const priorInSeason = selectPriorEpaGamesAsOpponent(epaGameLog, opponent, season, beforeDateUtc);
  const last3 = priorInSeason.slice(Math.max(0, priorInSeason.length - 3));
  const priorSeasonGames = selectPriorSeasonEpaGamesAsOpponent(epaGameLog, opponent, season - 1);
  return {
    seasonPrior: sumEpaWindow(priorInSeason).passEpaPerPlay,
    last3: sumEpaWindow(last3).passEpaPerPlay,
    priorSeason: sumEpaWindow(priorSeasonGames).passEpaPerPlay,
  };
}

export function buildRushingFeatureRow(
  outcome: NflRushingOutcome,
  args: {
    gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>;
    teamPregameFeaturesByKey: ReadonlyMap<string, NflTeamPregameFeatures>;
    fullTeamGameLog: readonly NflTeamGameLogEntry[];
    rushEpaGameLog: readonly NflTeamEpaGameLogEntry[];
    marketByKey: ReadonlyMap<string, NflHistoricalMarketRow>;
    domeByGameId: ReadonlyMap<string, boolean>;
    playerRushingStatLog: readonly NflPlayerRushingStatLogEntry[];
    teamTopRbCarryShareByGameTeam: ReadonlyMap<string, number>;
  },
): NflRushingFeatureRow {
  const join = args.gameJoinIndex.get(gameJoinKey(outcome.season, outcome.week, outcome.team));
  if (!join) throw new Error(`No schedule entry for ${outcome.team} season ${outcome.season} week ${outcome.week}.`);

  const teamEnv = teamRushRates(args.teamPregameFeaturesByKey.get(`${outcome.season}|${outcome.week}|${outcome.team}`));
  const rushAttemptsAllowed = opponentRushAllowedRate(args.fullTeamGameLog, outcome.opponent, outcome.season, join.gameDateUtc);
  const rushEpaAllowed = opponentRushEpaAllowedRate(args.rushEpaGameLog, outcome.opponent, outcome.season, join.gameDateUtc);
  const market = args.marketByKey.get(marketKey(outcome.season, outcome.week, outcome.team));
  const isDome = outcome.gameId ? args.domeByGameId.get(outcome.gameId) ?? null : null;
  const playerRolling = playerRollingWindows(args.playerRushingStatLog, outcome.playerId, outcome.season, join.gameDateUtc);

  // Recent team committee concentration: average leading-RB share over the TEAM'S own last 3 games strictly before this one.
  const teamPriorGames = selectLastNGames(selectPriorGamesInSeason(args.fullTeamGameLog, outcome.team, outcome.season, join.gameDateUtc), 3);
  const concentrationValues = teamPriorGames
    .map((g) => args.teamTopRbCarryShareByGameTeam.get(`${g.gameId}|${g.team}`))
    .filter((v): v is number => v != null);
  const recentTeamTopCarryShareConcentration = concentrationValues.length > 0
    ? concentrationValues.reduce((s, v) => s + v, 0) / concentrationValues.length
    : null;

  return {
    schemaVersion: NFL_RUSHING_FEATURE_ROW_SCHEMA_VERSION,
    season: outcome.season, week: outcome.week, gameId: outcome.gameId, team: outcome.team, opponent: outcome.opponent,
    playerId: outcome.playerId, playerName: outcome.playerName,
    target: { rushingYards: outcome.rushingYards },
    features: {
      playerUsage: { carriesPerGame: playerRolling.carriesPerGame, carryShare: playerRolling.carryShare },
      playerEfficiency: { yardsPerCarry: playerRolling.yardsPerCarry },
      teamEnvironment: teamEnv,
      opponentRushDefense: { rushAttemptsPerGameAllowed: rushAttemptsAllowed, rushEpaPerPlayAllowed: rushEpaAllowed },
      market: {
        spread: market?.spread ?? null, total: market?.total ?? null, impliedTeamTotal: market?.impliedTeamTotal ?? null,
        homeAway: market?.homeAway ?? join.homeAway, isDome,
      },
    },
    diagnostics: {
      position: outcome.position, isQb: outcome.position === "QB",
      gamesWithCarriesPriorThisSeason: playerRolling.gamesWithCarriesPriorThisSeason,
      hasPriorSeasonCarries: playerRolling.hasPriorSeasonCarries,
      recentTeamTopCarryShareConcentration,
    },
  };
}
