import type { CfbResearchGame, CfbResearchMarketLine, CfbResearchPlay, CfbResearchTeamSeason } from "../types";
import { collectUnresolvedTeamMappings } from "../validation/teamMappingValidation";

export type SeasonCoverageInput = {
  season: number;
  games: readonly CfbResearchGame[];
  plays: readonly CfbResearchPlay[];
  teamGameStatsGameIds: ReadonlySet<string>;
  teamSeasons: readonly CfbResearchTeamSeason[];
  marketLines: readonly CfbResearchMarketLine[];
  incomplete: boolean;
  incompleteReasons: readonly string[];
};

export type SeasonCoverageReport = {
  season: number;
  incomplete: boolean;
  incompleteReasons: readonly string[];
  gamesCount: number;
  finalGamesCount: number;
  fbsVsFbsGames: number;
  fbsVsFcsGames: number;
  pbpCoveredGames: number;
  totalPlays: number;
  providerPpaCoveragePct: number;
  providerSuccessCoveragePct: number;
  providerGarbageTimeCoveragePct: number;
  teamGameStatsCoveragePct: number;
  returningProductionCoveragePct: number;
  talentCoveragePct: number;
  bettingLineCoveragePct: number;
  providers: string[];
  unresolvedTeamMappingCount: number;
};

function pct(covered: number, total: number): number {
  return total === 0 ? 0 : Math.round((covered / total) * 10_000) / 100;
}

function classificationOf(value: string | null): string {
  return (value ?? "unknown").toLowerCase();
}

export function buildSeasonCoverageReport(input: SeasonCoverageInput): SeasonCoverageReport {
  const finalGames = input.games.filter((game) => game.status === "final");
  const fbsVsFbsGames = input.games.filter(
    (game) => classificationOf(game.homeClassification) === "fbs" && classificationOf(game.awayClassification) === "fbs",
  ).length;
  const fbsVsFcsGames = input.games.filter((game) => {
    const home = classificationOf(game.homeClassification);
    const away = classificationOf(game.awayClassification);
    return (home === "fbs" && away === "fcs") || (home === "fcs" && away === "fbs");
  }).length;

  const gameIdsWithPlays = new Set(input.plays.map((play) => play.gameId));
  const gameIdsWithLines = new Set(input.marketLines.map((line) => line.gameId));

  const teamSeasonsWithReturning = input.teamSeasons.filter(
    (row) => row.returningProductionPercentPpa !== null || row.returningProductionUsage !== null,
  ).length;
  const teamSeasonsWithTalent = input.teamSeasons.filter((row) => row.talentComposite !== null).length;

  return {
    season: input.season,
    incomplete: input.incomplete,
    incompleteReasons: input.incompleteReasons,
    gamesCount: input.games.length,
    finalGamesCount: finalGames.length,
    fbsVsFbsGames,
    fbsVsFcsGames,
    pbpCoveredGames: gameIdsWithPlays.size,
    totalPlays: input.plays.length,
    providerPpaCoveragePct: pct(input.plays.filter((p) => p.providerPpa !== null).length, input.plays.length),
    providerSuccessCoveragePct: pct(input.plays.filter((p) => p.providerSuccess !== null).length, input.plays.length),
    providerGarbageTimeCoveragePct: pct(
      input.plays.filter((p) => p.providerGarbageTime !== null).length,
      input.plays.length,
    ),
    teamGameStatsCoveragePct: pct(input.teamGameStatsGameIds.size, finalGames.length),
    returningProductionCoveragePct: pct(teamSeasonsWithReturning, input.teamSeasons.length),
    talentCoveragePct: pct(teamSeasonsWithTalent, input.teamSeasons.length),
    bettingLineCoveragePct: pct(gameIdsWithLines.size, finalGames.length),
    providers: [...new Set(input.marketLines.map((line) => line.provider))].sort(),
    unresolvedTeamMappingCount: collectUnresolvedTeamMappings(input.teamSeasons).length,
  };
}

export function buildResearchManifest(seasons: readonly SeasonCoverageReport[]): {
  schemaVersion: string;
  generatedAt: string;
  seasons: readonly SeasonCoverageReport[];
} {
  return {
    schemaVersion: "jkb-cfb-research-coverage-manifest-v1",
    generatedAt: new Date().toISOString(),
    seasons,
  };
}
