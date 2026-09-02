/**
 * WU4A team opportunity model — point-in-time-safe feature builder.
 *
 * Every window (`seasonPrior`, `last3`) uses only the team's own games with
 * a kickoff strictly before the target game's kickoff, within the same
 * season; `priorSeason` uses only the entirely-prior season. Opponent
 * "allowed" windows are read off the SAME compact play-volume records via
 * the opponent field — never a new source — matching `teamPlayVolume.ts`.
 * No counter from the target game itself can enter any window. See the
 * adversarial leakage tests in `teamOpportunityFeatures.test.ts`.
 *
 * This module reuses `teamPlayVolume.ts` selectors and does not duplicate
 * window/cutoff logic.
 */
import {
  selectLastNGames,
  selectPriorGamesAsOpponent,
  selectPriorGamesInSeason,
  selectPriorSeasonGames,
  selectPriorSeasonGamesAsOpponent,
  sumPlayVolumeWindow,
  type NflTeamGameLogEntry,
} from "./teamPlayVolume";
import type { NflRollingWindowVolumeTendency } from "./types/teamPregameFeatures";
import { gameJoinKey, type NflGameJoinRecord } from "./historicalOutcomes";
import type { NflHistoricalMarketRow } from "./qbOpportunityFeatures";
import { marketKey } from "./qbOpportunityFeatures";
import {
  NFL_TEAM_OPPORTUNITY_FEATURE_ROW_SCHEMA_VERSION,
  type NflTeamOpportunityFeatureRow,
  type NflTeamOpportunityFeatures,
  type NflTeamOpportunityTarget,
  type NflWindowedScalar,
} from "./types/teamOpportunity";

const RECENT_WINDOW_SIZE = 3;

export type NflTeamOpportunityTargetGame = {
  season: number;
  week: number;
  gameId: string;
  team: string;
  opponent: string;
  homeAway: "home" | "away";
  neutralSite: boolean;
  gameDateUtc: string;
};

export type NflTeamOpportunityFeatureDeps = {
  fullTeamGameLog: readonly NflTeamGameLogEntry[];
  marketByKey: ReadonlyMap<string, NflHistoricalMarketRow>;
};

/** `null` when the window has no games or the counter's denominator is zero. */
function windowScalar(
  window: NflRollingWindowVolumeTendency,
  pick: (w: NflRollingWindowVolumeTendency) => number | null,
): number | null {
  return window.gamesIncluded > 0 ? pick(window) : null;
}

function teamWindows(
  fullTeamGameLog: readonly NflTeamGameLogEntry[],
  team: string,
  season: number,
  beforeDateUtc: string,
): {
  priorInSeason: NflRollingWindowVolumeTendency;
  last3: NflRollingWindowVolumeTendency;
  priorSeason: NflRollingWindowVolumeTendency;
  gamesPlayedPriorThisSeason: number;
  hasPriorSeason: boolean;
} {
  const prior = selectPriorGamesInSeason(fullTeamGameLog, team, season, beforeDateUtc);
  const priorSeasonGames = selectPriorSeasonGames(fullTeamGameLog, team, season - 1);
  return {
    priorInSeason: sumPlayVolumeWindow(prior),
    last3: sumPlayVolumeWindow(selectLastNGames(prior, RECENT_WINDOW_SIZE)),
    priorSeason: sumPlayVolumeWindow(priorSeasonGames),
    gamesPlayedPriorThisSeason: prior.length,
    hasPriorSeason: priorSeasonGames.length > 0,
  };
}

function opponentAllowedWindows(
  fullTeamGameLog: readonly NflTeamGameLogEntry[],
  opponent: string,
  season: number,
  beforeDateUtc: string,
): {
  priorInSeason: NflRollingWindowVolumeTendency;
  last3: NflRollingWindowVolumeTendency;
  priorSeason: NflRollingWindowVolumeTendency;
  gamesPriorThisSeason: number;
  hasPriorSeason: boolean;
} {
  const prior = selectPriorGamesAsOpponent(fullTeamGameLog, opponent, season, beforeDateUtc);
  const priorSeasonGames = selectPriorSeasonGamesAsOpponent(fullTeamGameLog, opponent, season - 1);
  return {
    priorInSeason: sumPlayVolumeWindow(prior),
    last3: sumPlayVolumeWindow(selectLastNGames(prior, RECENT_WINDOW_SIZE)),
    priorSeason: sumPlayVolumeWindow(priorSeasonGames),
    gamesPriorThisSeason: prior.length,
    hasPriorSeason: priorSeasonGames.length > 0,
  };
}

function scalar(
  windows: { priorInSeason: NflRollingWindowVolumeTendency; last3: NflRollingWindowVolumeTendency; priorSeason: NflRollingWindowVolumeTendency },
  pick: (w: NflRollingWindowVolumeTendency) => number | null,
): NflWindowedScalar {
  return {
    seasonPrior: windowScalar(windows.priorInSeason, pick),
    last3: windowScalar(windows.last3, pick),
    priorSeason: windowScalar(windows.priorSeason, pick),
  };
}

function buildFeatures(target: NflTeamOpportunityTargetGame, deps: NflTeamOpportunityFeatureDeps): {
  features: NflTeamOpportunityFeatures;
  diagnostics: NflTeamOpportunityFeatureRow["diagnostics"];
} {
  const team = teamWindows(deps.fullTeamGameLog, target.team, target.season, target.gameDateUtc);
  const opp = opponentAllowedWindows(deps.fullTeamGameLog, target.opponent, target.season, target.gameDateUtc);
  const market = deps.marketByKey.get(marketKey(target.season, target.week, target.team)) ?? null;

  const features: NflTeamOpportunityFeatures = {
    teamOffense: {
      offensivePlaysPerGame: scalar(team, (w) => w.offensivePlaysPerGame),
      dropbackRate: scalar(team, (w) => w.overallDropbackRate),
      rushAttemptsPerGame: scalar(team, (w) => w.rushAttemptsPerGame),
      passAttemptsPerGame: scalar(team, (w) => w.passAttemptsPerGame),
      earlyDownNeutralPassRate: scalar(team, (w) => w.earlyDownNeutralPassRate),
      passRateOverExpected: scalar(team, (w) => w.passRateOverExpected),
    },
    opponentDefense: {
      offensivePlaysPerGameAllowed: scalar(opp, (w) => w.offensivePlaysPerGame),
      dropbackRateAllowed: scalar(opp, (w) => w.overallDropbackRate),
    },
    market: {
      spread: market?.spread ?? null,
      total: market?.total ?? null,
      impliedTeamTotal: market?.impliedTeamTotal ?? null,
      isHome: target.homeAway === "home" ? 1 : 0,
      isNeutralSite: target.neutralSite ? 1 : 0,
    },
  };

  return {
    features,
    diagnostics: {
      gamesPlayedPriorThisSeason: team.gamesPlayedPriorThisSeason,
      hasPriorSeason: team.hasPriorSeason,
      opponentGamesPriorThisSeason: opp.gamesPriorThisSeason,
      opponentHasPriorSeason: opp.hasPriorSeason,
    },
  };
}

export function buildTeamOpportunityFeatureRowForTarget(
  target: NflTeamOpportunityTargetGame,
  deps: NflTeamOpportunityFeatureDeps,
): NflTeamOpportunityFeatureRow {
  const { features, diagnostics } = buildFeatures(target, deps);
  return {
    schemaVersion: NFL_TEAM_OPPORTUNITY_FEATURE_ROW_SCHEMA_VERSION,
    season: target.season,
    week: target.week,
    gameId: target.gameId,
    team: target.team,
    opponent: target.opponent,
    homeAway: target.homeAway,
    neutralSite: target.neutralSite,
    gameDateUtc: target.gameDateUtc,
    features,
    diagnostics,
  };
}

/**
 * Historical row: identical features to the live builder, plus the resolved
 * target read from the compact play-volume record for the SAME game. The
 * target is never consulted while building features.
 */
export function buildTeamOpportunityFeatureRow(
  actual: {
    gameId: string;
    season: number;
    week: number;
    team: string;
    opponent: string;
    eligiblePlays: number;
    passPlays: number;
    rushPlays: number;
  },
  gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>,
  deps: NflTeamOpportunityFeatureDeps,
  neutralSiteByGameId: ReadonlyMap<string, boolean>,
): NflTeamOpportunityFeatureRow {
  if (actual.eligiblePlays !== actual.passPlays + actual.rushPlays) {
    throw new Error(
      `Malformed play-volume record ${actual.gameId}/${actual.team}: eligible_plays (${actual.eligiblePlays}) != pass_plays + rush_plays (${actual.passPlays + actual.rushPlays}).`,
    );
  }
  if (actual.eligiblePlays <= 0 || actual.passPlays < 0 || actual.rushPlays < 0) {
    throw new Error(`Malformed play-volume record ${actual.gameId}/${actual.team}: non-positive eligible_plays or negative counter.`);
  }
  const join = gameJoinIndex.get(gameJoinKey(actual.season, actual.week, actual.team));
  if (!join) {
    throw new Error(
      `No schedule entry for ${actual.team} season ${actual.season} week ${actual.week} (game ${actual.gameId}).`,
    );
  }
  const target: NflTeamOpportunityTargetGame = {
    season: actual.season,
    week: actual.week,
    gameId: actual.gameId,
    team: actual.team,
    opponent: actual.opponent,
    homeAway: join.homeAway,
    neutralSite: neutralSiteByGameId.get(actual.gameId) ?? false,
    gameDateUtc: join.gameDateUtc,
  };
  const row = buildTeamOpportunityFeatureRowForTarget(target, deps);
  const targetValues: NflTeamOpportunityTarget = {
    offensivePlays: actual.eligiblePlays,
    dropbackRate: actual.passPlays / actual.eligiblePlays,
    passAttempts: actual.passPlays,
    rushAttempts: actual.rushPlays,
  };
  return { ...row, target: targetValues };
}
