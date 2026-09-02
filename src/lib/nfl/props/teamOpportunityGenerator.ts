/**
 * WU4A team opportunity generator — orchestrates one (season, week)
 * team-opportunity artifact. No data loading (no `fs`/`fetch`): every input
 * is passed in already parsed, so it stays unit-testable without disk.
 *
 * Emits exactly one row per team per eligible REG game (home + away), never
 * allocating any opportunity to players — that is WU4B.
 */
import { buildGameJoinIndex, type NflGameJoinRecord, type NflPropRawGameRecord } from "./historicalOutcomes";
import { normalizeNflPropTeamAbbr } from "./types/identity";
import type { NflTeamGameLogEntry } from "./teamPlayVolume";
import type { NflHistoricalMarketRow } from "./qbOpportunityFeatures";
import { buildTeamOpportunityFeatureRowForTarget } from "./teamOpportunityFeatures";
import {
  assertTeamOpportunityCoherent,
  fitTeamOpportunityModel,
  predictTeamOpportunity,
  type NflFittedTeamOpportunityModel,
} from "./teamOpportunityModel";
import {
  NFL_TEAM_OPPORTUNITY_MODEL_NAME,
  NFL_TEAM_OPPORTUNITY_MODEL_VERSION,
  NFL_TEAM_OPPORTUNITY_PROJECTION_SCHEMA_VERSION,
  NFL_TEAM_OPPORTUNITY_TEMPORAL_CONTRACT,
  type NflTeamOpportunityArtifact,
  type NflTeamOpportunityFeatureRow,
  type NflTeamOpportunityRow,
} from "./types/teamOpportunity";

export type NflTeamOpportunitySources = {
  season: number;
  week: number;
  generatedAt: string;
  generationMode?: "currentWeek" | "historicalReplay";
  games: readonly (NflPropRawGameRecord & { neutralSite?: boolean })[];
  fullTeamGameLog: readonly NflTeamGameLogEntry[];
  marketByKey: ReadonlyMap<string, NflHistoricalMarketRow>;
  marketAvailable: boolean;
  /** Historical feature rows (with targets) for model fit; the generator drops the target week itself. */
  historicalRows: readonly NflTeamOpportunityFeatureRow[];
  trainingSeasons: readonly number[];
  archiveObserver?: {
    onFittedModel(model: NflFittedTeamOpportunityModel): void;
    onPrediction(input: { row: NflTeamOpportunityRow; featureRow: NflTeamOpportunityFeatureRow }): void;
  };
};

function distribution(values: readonly number[]): { min: number; max: number; mean: number } {
  if (values.length === 0) return { min: 0, max: 0, mean: 0 };
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    mean: values.reduce((s, v) => s + v, 0) / values.length,
  };
}

export function generateTeamOpportunityArtifact(sources: NflTeamOpportunitySources): NflTeamOpportunityArtifact {
  const { season, week, generatedAt } = sources;

  const notTargetWeek = (r: NflTeamOpportunityFeatureRow) => !(r.season === season && r.week === week);
  const trainRows = sources.historicalRows
    .filter(notTargetWeek)
    .filter((r) => sources.trainingSeasons.includes(r.season) && r.target != null);
  if (trainRows.length === 0) throw new Error("team opportunity: no training rows after filtering to training seasons / dropping target week");

  const fitted = fitTeamOpportunityModel(trainRows, NFL_TEAM_OPPORTUNITY_MODEL_VERSION);
  sources.archiveObserver?.onFittedModel(fitted);

  const gameJoinIndex = buildGameJoinIndex(sources.games);
  const targetGames = sources.games.filter(
    (g) => g.season === season && g.week === week && String(g.seasonType).toUpperCase() === "REG",
  );

  const rows: NflTeamOpportunityRow[] = [];
  const seen = new Set<string>();
  let coherenceViolations = 0;

  for (const game of targetGames) {
    const home = normalizeNflPropTeamAbbr(game.homeAbbr);
    const away = normalizeNflPropTeamAbbr(game.awayAbbr);
    if (!home || !away) throw new Error(`team opportunity: unresolved team code in schedule game ${game.gameId}`);
    const neutralSite = game.neutralSite === true;

    for (const [team, opponent, homeAway] of [
      [home, away, "home"],
      [away, home, "away"],
    ] as const) {
      const dedupeKey = `${game.gameId}|${team}`;
      if (seen.has(dedupeKey)) throw new Error(`team opportunity: duplicate team row ${dedupeKey}`);
      seen.add(dedupeKey);

      const join: NflGameJoinRecord | undefined = gameJoinIndex.get(`${season}|${week}|${team}`);
      if (!join) throw new Error(`team opportunity: no schedule join for ${team} ${season} week ${week}`);

      const featureRow = buildTeamOpportunityFeatureRowForTarget(
        { season, week, gameId: game.gameId, team, opponent, homeAway, neutralSite, gameDateUtc: join.gameDateUtc },
        { fullTeamGameLog: sources.fullTeamGameLog, marketByKey: sources.marketByKey },
      );

      const prediction = predictTeamOpportunity(fitted, featureRow);
      try {
        assertTeamOpportunityCoherent(prediction);
      } catch (error) {
        coherenceViolations += 1;
        throw error;
      }

      const noPriorSeasonHistory = !featureRow.diagnostics.hasPriorSeason && featureRow.diagnostics.gamesPlayedPriorThisSeason === 0;
      const marketContextAvailable = featureRow.features.market.spread != null && featureRow.features.market.total != null;

      const row: NflTeamOpportunityRow = {
        schemaVersion: NFL_TEAM_OPPORTUNITY_PROJECTION_SCHEMA_VERSION,
        season,
        week,
        gameId: game.gameId,
        team,
        opponent,
        homeAway,
        neutralSite,
        kickoff: join.gameDateUtc,
        generatedAt,
        modelName: NFL_TEAM_OPPORTUNITY_MODEL_NAME,
        modelVersion: fitted.modelVersion,
        status: noPriorSeasonHistory ? "eligibleInsufficientHistory" : "projected",
        projectedTeamPlays: prediction.projectedTeamPlays,
        projectedDropbackRate: prediction.projectedDropbackRate,
        projectedPassAttempts: prediction.projectedPassAttempts,
        projectedRushAttempts: prediction.projectedRushAttempts,
        flags: {
          noPriorSeasonHistory,
          opponentNoPriorSeasonHistory:
            !featureRow.diagnostics.opponentHasPriorSeason && featureRow.diagnostics.opponentGamesPriorThisSeason === 0,
          playsClampApplied: prediction.playsClampApplied,
          dropbackRateClampApplied: prediction.dropbackRateClampApplied,
          marketContextAvailable,
        },
        featureSnapshot: {
          teamOffense: featureRow.features.teamOffense,
          opponentDefense: featureRow.features.opponentDefense,
          market: featureRow.features.market,
        },
        diagnostics: {
          ...featureRow.diagnostics,
          playsBeforeClamp: prediction.playsBeforeClamp,
          dropbackRateBeforeClamp: prediction.dropbackRateBeforeClamp,
        },
      };
      rows.push(row);
      sources.archiveObserver?.onPrediction({ row, featureRow });
    }
  }

  rows.sort((a, b) => a.gameId.localeCompare(b.gameId) || a.team.localeCompare(b.team));

  const gamesResolved = new Set(rows.map((r) => r.gameId));
  const bothTeamsPresentForEveryGame = [...gamesResolved].every(
    (gameId) => rows.filter((r) => r.gameId === gameId).length === 2,
  );
  const plays = rows.map((r) => r.projectedTeamPlays);
  const passAttempts = rows.map((r) => r.projectedPassAttempts);
  const rushAttempts = rows.map((r) => r.projectedRushAttempts);
  const dropbackRates = rows.map((r) => r.projectedDropbackRate);
  const largestPlaysOutliers = [...rows]
    .sort((a, b) => Math.abs(b.projectedTeamPlays - fitted.constants.leagueMeanPlays) - Math.abs(a.projectedTeamPlays - fitted.constants.leagueMeanPlays))
    .slice(0, 5)
    .map((r) => ({ team: r.team, gameId: r.gameId, projectedTeamPlays: r.projectedTeamPlays }));

  return {
    schemaVersion: NFL_TEAM_OPPORTUNITY_PROJECTION_SCHEMA_VERSION,
    season,
    week,
    generatedAt,
    generationMode: sources.generationMode ?? "currentWeek",
    temporalContract: NFL_TEAM_OPPORTUNITY_TEMPORAL_CONTRACT,
    modelName: NFL_TEAM_OPPORTUNITY_MODEL_NAME,
    modelVersion: fitted.modelVersion,
    trainingSeasons: [...sources.trainingSeasons],
    marketSource: sources.marketAvailable ? "matchup-market.json (live current-week feed)" : "unavailable",
    rows,
    qa: {
      gamesExpected: targetGames.length,
      gamesResolved: gamesResolved.size,
      teamRowsEmitted: rows.length,
      eligibleInsufficientHistoryRows: rows.filter((r) => r.status === "eligibleInsufficientHistory").length,
      bothTeamsPresentForEveryGame,
      coherenceViolations,
      playsRange: distribution(plays),
      passAttemptsRange: distribution(passAttempts),
      rushAttemptsRange: distribution(rushAttempts),
      dropbackRateRange: distribution(dropbackRates),
      largestPlaysOutliers,
    },
  };
}
