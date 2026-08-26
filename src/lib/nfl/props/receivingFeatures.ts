import { NFL_RECEIVING_FEATURE_ROW_SCHEMA_VERSION, type NflReceivingFeatureRow, type NflWindowedRate } from "./types/receivingFeatures";
import type { NflReceivingOutcome } from "./types/receivingOutcome";
import type { NflTeamPregameFeatures } from "./types/teamPregameFeatures";
import { selectLastNGames, selectPriorGamesAsOpponent, selectPriorGamesInSeason, selectPriorSeasonGamesAsOpponent, type NflTeamGameLogEntry } from "./teamPlayVolume";
import { selectPriorEpaGamesAsOpponent, selectPriorSeasonEpaGamesAsOpponent, sumEpaWindow, type NflTeamEpaGameLogEntry } from "./qbPassingEpaContext";
import { gameJoinKey, type NflGameJoinRecord } from "./historicalOutcomes";
import type { NflHistoricalMarketRow } from "./qbOpportunityFeatures";
import { marketKey } from "./qbOpportunityFeatures";

export type NflAirYardsSupplement = { airYards: number };

export type NflPlayerReceivingStatLogEntry = {
  playerId: string;
  season: number;
  week: number;
  team: string;
  targets: number;
  receptions: number;
  receivingYards: number;
  targetShare: number | null;
  airYards: number | null;
  gameDateUtc: string;
};

export function buildPlayerReceivingStatLog(
  outcomes: readonly NflReceivingOutcome[],
  gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>,
  airYardsByPlayerWeek: ReadonlyMap<string, NflAirYardsSupplement>,
): NflPlayerReceivingStatLogEntry[] {
  const log: NflPlayerReceivingStatLogEntry[] = [];
  for (const o of outcomes) {
    const join = gameJoinIndex.get(gameJoinKey(o.season, o.week, o.team));
    if (!join) continue;
    const airYards = airYardsByPlayerWeek.get(`${o.playerId}|${o.season}|${o.week}`)?.airYards ?? (o.targets === 0 ? 0 : null);
    log.push({
      playerId: o.playerId, season: o.season, week: o.week, team: o.team,
      targets: o.targets, receptions: o.receptions, receivingYards: o.receivingYards,
      targetShare: o.targetShare, airYards, gameDateUtc: join.gameDateUtc,
    });
  }
  return log;
}

/** Team-game leading-receiver target share, from every eligible receiving row -- the receiving analog of Phase 5's top-RB carry share. */
export function buildTeamTopTargetShareByGameTeam(outcomes: readonly NflReceivingOutcome[]): Map<string, number> {
  const byGameTeam = new Map<string, number[]>();
  for (const o of outcomes) {
    if (o.targetShare == null) continue;
    const key = `${o.gameId}|${o.team}`;
    const shares = byGameTeam.get(key) ?? [];
    shares.push(o.targetShare);
    byGameTeam.set(key, shares);
  }
  const result = new Map<string, number>();
  for (const [key, shares] of byGameTeam) result.set(key, Math.max(...shares));
  return result;
}

function windowRates(games: readonly NflPlayerReceivingStatLogEntry[]): { targets: number | null; ypt: number | null; rpt: number | null; ypr: number | null; targetShare: number | null; adot: number | null; airYardsShare: number | null } {
  if (games.length === 0) return { targets: null, ypt: null, rpt: null, ypr: null, targetShare: null, adot: null, airYardsShare: null };
  const totalTargets = games.reduce((s, g) => s + g.targets, 0);
  const totalReceptions = games.reduce((s, g) => s + g.receptions, 0);
  const totalYards = games.reduce((s, g) => s + g.receivingYards, 0);
  const totalAirYards = games.reduce((s, g) => s + (g.airYards ?? 0), 0);
  const airYardsGames = games.filter((g) => g.airYards != null);
  const sharesWithValue = games.map((g) => g.targetShare).filter((v): v is number => v != null);
  return {
    targets: totalTargets / games.length,
    ypt: totalTargets > 0 ? totalYards / totalTargets : null,
    rpt: totalTargets > 0 ? totalReceptions / totalTargets : null,
    ypr: totalReceptions > 0 ? totalYards / totalReceptions : null,
    targetShare: sharesWithValue.length > 0 ? sharesWithValue.reduce((s, v) => s + v, 0) / sharesWithValue.length : null,
    adot: totalTargets > 0 && airYardsGames.length === games.length ? totalAirYards / totalTargets : null,
    airYardsShare: null, // computed team-relative separately if ever needed; not built this phase (see doc)
  };
}

function playerRollingWindows(log: readonly NflPlayerReceivingStatLogEntry[], playerId: string, season: number, beforeDateUtc: string) {
  const priorThisSeason = log
    .filter((g) => g.playerId === playerId && g.season === season && g.gameDateUtc < beforeDateUtc)
    .sort((a, b) => a.gameDateUtc.localeCompare(b.gameDateUtc));
  const last3 = priorThisSeason.slice(Math.max(0, priorThisSeason.length - 3));
  const priorSeasonGames = log.filter((g) => g.playerId === playerId && g.season === season - 1);
  const sp = windowRates(priorThisSeason);
  const l3 = windowRates(last3);
  const ps = windowRates(priorSeasonGames);
  return {
    gamesWithTargetsPriorThisSeason: priorThisSeason.length,
    hasPriorSeasonTargets: priorSeasonGames.length > 0,
    targetsPerGame: { seasonPrior: sp.targets, last3: l3.targets, priorSeason: ps.targets } as NflWindowedRate,
    yardsPerTarget: { seasonPrior: sp.ypt, last3: l3.ypt, priorSeason: ps.ypt } as NflWindowedRate,
    receptionsPerTarget: { seasonPrior: sp.rpt, last3: l3.rpt, priorSeason: ps.rpt } as NflWindowedRate,
    yardsPerReception: { seasonPrior: sp.ypr, last3: l3.ypr, priorSeason: ps.ypr } as NflWindowedRate,
    targetShare: { seasonPrior: sp.targetShare, last3: l3.targetShare, priorSeason: ps.targetShare } as NflWindowedRate,
    adot: { seasonPrior: sp.adot, last3: l3.adot, priorSeason: ps.adot } as NflWindowedRate,
  };
}

function teamPassRates(pf: NflTeamPregameFeatures | undefined) {
  const empty: NflWindowedRate = { seasonPrior: null, last3: null, priorSeason: null };
  if (!pf) return { passAttemptsPerGame: empty, overallDropbackRate: empty, passRateOverExpected: empty };
  return {
    passAttemptsPerGame: { seasonPrior: pf.seasonPrior.passAttemptsPerGame, last3: pf.last3.passAttemptsPerGame, priorSeason: pf.priorSeason.passAttemptsPerGame },
    overallDropbackRate: { seasonPrior: pf.seasonPrior.overallDropbackRate, last3: pf.last3.overallDropbackRate, priorSeason: pf.priorSeason.overallDropbackRate },
    passRateOverExpected: { seasonPrior: pf.seasonPrior.passRateOverExpected, last3: pf.last3.passRateOverExpected, priorSeason: pf.priorSeason.passRateOverExpected },
  };
}

function opponentTargetsAllowedRate(fullTeamGameLog: readonly NflTeamGameLogEntry[], opponent: string, season: number, beforeDateUtc: string): NflWindowedRate {
  const priorInSeason = selectPriorGamesAsOpponent(fullTeamGameLog, opponent, season, beforeDateUtc);
  const last3 = selectLastNGames(priorInSeason, 3);
  const priorSeasonGames = selectPriorSeasonGamesAsOpponent(fullTeamGameLog, opponent, season - 1);
  const rate = (games: typeof priorInSeason) => (games.length > 0 ? games.reduce((s, g) => s + g.passPlays, 0) / games.length : null);
  return { seasonPrior: rate(priorInSeason), last3: rate(last3), priorSeason: rate(priorSeasonGames) };
}

function opponentPassEpaAllowedRate(epaGameLog: readonly NflTeamEpaGameLogEntry[], opponent: string, season: number, beforeDateUtc: string): NflWindowedRate {
  const priorInSeason = selectPriorEpaGamesAsOpponent(epaGameLog, opponent, season, beforeDateUtc);
  const last3 = priorInSeason.slice(Math.max(0, priorInSeason.length - 3));
  const priorSeasonGames = selectPriorSeasonEpaGamesAsOpponent(epaGameLog, opponent, season - 1);
  return {
    seasonPrior: sumEpaWindow(priorInSeason).passEpaPerPlay,
    last3: sumEpaWindow(last3).passEpaPerPlay,
    priorSeason: sumEpaWindow(priorSeasonGames).passEpaPerPlay,
  };
}

/** Live variant of `buildReceivingFeatureRow` for an unplayed target game -- see `qbPassingFeatures.ts`'s `buildQbPassingFeatureRowForTarget` header for why this exists. */
export function buildReceivingFeatureRowForTarget(
  target: { season: number; week: number; gameId: string; team: string; opponent: string; playerId: string; playerName: string; position: NflReceivingFeatureRow["diagnostics"]["position"]; gameDateUtc: string; homeAway: "home" | "away" },
  args: {
    teamPregameFeaturesByKey: ReadonlyMap<string, NflTeamPregameFeatures>;
    fullTeamGameLog: readonly NflTeamGameLogEntry[];
    passEpaGameLog: readonly NflTeamEpaGameLogEntry[];
    marketByKey: ReadonlyMap<string, NflHistoricalMarketRow>;
    domeByGameId: ReadonlyMap<string, boolean>;
    playerReceivingStatLog: readonly NflPlayerReceivingStatLogEntry[];
    teamTopTargetShareByGameTeam: ReadonlyMap<string, number>;
  },
): Omit<NflReceivingFeatureRow, "target" | "diagnostics"> & { diagnostics: Omit<NflReceivingFeatureRow["diagnostics"], "zeroTargetFlag" | "membershipSource"> } {
  const teamEnv = teamPassRates(args.teamPregameFeaturesByKey.get(`${target.season}|${target.week}|${target.team}`));
  const targetsAllowed = opponentTargetsAllowedRate(args.fullTeamGameLog, target.opponent, target.season, target.gameDateUtc);
  const passEpaAllowed = opponentPassEpaAllowedRate(args.passEpaGameLog, target.opponent, target.season, target.gameDateUtc);
  const market = args.marketByKey.get(marketKey(target.season, target.week, target.team));
  const isDome = args.domeByGameId.get(target.gameId) ?? null;
  const playerRolling = playerRollingWindows(args.playerReceivingStatLog, target.playerId, target.season, target.gameDateUtc);

  const teamPriorGames = selectLastNGames(selectPriorGamesInSeason(args.fullTeamGameLog, target.team, target.season, target.gameDateUtc), 3);
  const concentrationValues = teamPriorGames
    .map((g) => args.teamTopTargetShareByGameTeam.get(`${g.gameId}|${g.team}`))
    .filter((v): v is number => v != null);
  const recentConcentration = concentrationValues.length > 0 ? concentrationValues.reduce((s, v) => s + v, 0) / concentrationValues.length : null;

  return {
    schemaVersion: NFL_RECEIVING_FEATURE_ROW_SCHEMA_VERSION,
    season: target.season, week: target.week, gameId: target.gameId, team: target.team, opponent: target.opponent,
    playerId: target.playerId, playerName: target.playerName,
    features: {
      playerUsage: { targetsPerGame: playerRolling.targetsPerGame, targetShare: playerRolling.targetShare },
      playerEfficiency: { yardsPerTarget: playerRolling.yardsPerTarget, receptionsPerTarget: playerRolling.receptionsPerTarget, yardsPerReception: playerRolling.yardsPerReception },
      airYards: { adot: playerRolling.adot, airYardsShare: { seasonPrior: null, last3: null, priorSeason: null } },
      teamEnvironment: teamEnv,
      targetConcentration: { recentTeamTopTargetShareConcentration: { seasonPrior: recentConcentration, last3: recentConcentration, priorSeason: null } },
      opponentPassDefense: { targetsPerGameAllowed: targetsAllowed, passEpaPerPlayAllowed: passEpaAllowed },
      market: {
        spread: market?.spread ?? null, total: market?.total ?? null, impliedTeamTotal: market?.impliedTeamTotal ?? null,
        homeAway: market?.homeAway ?? target.homeAway, isDome,
      },
    },
    diagnostics: {
      position: target.position, gamesWithTargetsPriorThisSeason: playerRolling.gamesWithTargetsPriorThisSeason,
      hasPriorSeasonTargets: playerRolling.hasPriorSeasonTargets,
    },
  };
}

export function buildReceivingFeatureRow(
  outcome: NflReceivingOutcome,
  args: {
    gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>;
    teamPregameFeaturesByKey: ReadonlyMap<string, NflTeamPregameFeatures>;
    fullTeamGameLog: readonly NflTeamGameLogEntry[];
    passEpaGameLog: readonly NflTeamEpaGameLogEntry[];
    marketByKey: ReadonlyMap<string, NflHistoricalMarketRow>;
    domeByGameId: ReadonlyMap<string, boolean>;
    playerReceivingStatLog: readonly NflPlayerReceivingStatLogEntry[];
    teamTopTargetShareByGameTeam: ReadonlyMap<string, number>;
  },
): NflReceivingFeatureRow {
  const join = args.gameJoinIndex.get(gameJoinKey(outcome.season, outcome.week, outcome.team));
  if (!join) throw new Error(`No schedule entry for ${outcome.team} season ${outcome.season} week ${outcome.week}.`);

  const teamEnv = teamPassRates(args.teamPregameFeaturesByKey.get(`${outcome.season}|${outcome.week}|${outcome.team}`));
  const targetsAllowed = opponentTargetsAllowedRate(args.fullTeamGameLog, outcome.opponent, outcome.season, join.gameDateUtc);
  const passEpaAllowed = opponentPassEpaAllowedRate(args.passEpaGameLog, outcome.opponent, outcome.season, join.gameDateUtc);
  const market = args.marketByKey.get(marketKey(outcome.season, outcome.week, outcome.team));
  const isDome = outcome.gameId ? args.domeByGameId.get(outcome.gameId) ?? null : null;
  const playerRolling = playerRollingWindows(args.playerReceivingStatLog, outcome.playerId, outcome.season, join.gameDateUtc);

  const teamPriorGames = selectLastNGames(selectPriorGamesInSeason(args.fullTeamGameLog, outcome.team, outcome.season, join.gameDateUtc), 3);
  const concentrationValues = teamPriorGames
    .map((g) => args.teamTopTargetShareByGameTeam.get(`${g.gameId}|${g.team}`))
    .filter((v): v is number => v != null);
  const recentConcentration = concentrationValues.length > 0 ? concentrationValues.reduce((s, v) => s + v, 0) / concentrationValues.length : null;

  return {
    schemaVersion: NFL_RECEIVING_FEATURE_ROW_SCHEMA_VERSION,
    season: outcome.season, week: outcome.week, gameId: outcome.gameId, team: outcome.team, opponent: outcome.opponent,
    playerId: outcome.playerId, playerName: outcome.playerName,
    target: { receivingYards: outcome.receivingYards },
    features: {
      playerUsage: { targetsPerGame: playerRolling.targetsPerGame, targetShare: playerRolling.targetShare },
      playerEfficiency: { yardsPerTarget: playerRolling.yardsPerTarget, receptionsPerTarget: playerRolling.receptionsPerTarget, yardsPerReception: playerRolling.yardsPerReception },
      airYards: { adot: playerRolling.adot, airYardsShare: { seasonPrior: null, last3: null, priorSeason: null } },
      teamEnvironment: teamEnv,
      targetConcentration: { recentTeamTopTargetShareConcentration: { seasonPrior: recentConcentration, last3: recentConcentration, priorSeason: null } },
      opponentPassDefense: { targetsPerGameAllowed: targetsAllowed, passEpaPerPlayAllowed: passEpaAllowed },
      market: {
        spread: market?.spread ?? null, total: market?.total ?? null, impliedTeamTotal: market?.impliedTeamTotal ?? null,
        homeAway: market?.homeAway ?? join.homeAway, isDome,
      },
    },
    diagnostics: {
      position: outcome.position, gamesWithTargetsPriorThisSeason: playerRolling.gamesWithTargetsPriorThisSeason,
      hasPriorSeasonTargets: playerRolling.hasPriorSeasonTargets, zeroTargetFlag: outcome.zeroTargetFlag,
      membershipSource: outcome.membershipSource,
    },
  };
}
