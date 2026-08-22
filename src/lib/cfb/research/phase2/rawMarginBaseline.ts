import { loadSeasonGames } from "./loadTeamGameObservations";
import { fitMarginTranslation, predictMargin } from "./marginTranslation";
import type { WalkForwardPrediction } from "./types";
import type { CfbResearchGame } from "../types";

function isFbsVsFbsGame(game: CfbResearchGame): boolean {
  return (
    (game.homeClassification ?? "").toLowerCase() === "fbs" &&
    (game.awayClassification ?? "").toLowerCase() === "fbs"
  );
}

/**
 * Section 13 baseline #2: raw scoring-margin rating with simple HFA — no
 * opponent adjustment at all. rating(team) = average point differential
 * across the team's own completed games in the training window.
 */
export function runRawMarginBaseline(warmStartSeason: number, testSeasons: readonly number[]): WalkForwardPrediction[] {
  const allSeasons = [...new Set([warmStartSeason, ...testSeasons])].sort((a, b) => a - b);
  const gamesBySeason = new Map<number, CfbResearchGame[]>();
  for (const season of allSeasons) gamesBySeason.set(season, loadSeasonGames(season));

  function trainingGames(season: number, week: number): CfbResearchGame[] {
    const rows: CfbResearchGame[] = [];
    for (const [s, games] of gamesBySeason) {
      if (s < season) rows.push(...games);
      else if (s === season) rows.push(...games.filter((g) => g.week < week));
    }
    return rows.filter((g) => g.status === "final" && isFbsVsFbsGame(g));
  }

  function averageMargin(games: readonly CfbResearchGame[], teamId: string): number | null {
    const rows = games.filter((g) => g.homeExternalId === teamId || g.awayExternalId === teamId);
    if (rows.length === 0) return null;
    const total = rows.reduce((sum, g) => {
      const isHome = g.homeExternalId === teamId;
      return sum + ((isHome ? g.homeScore! : g.awayScore!) - (isHome ? g.awayScore! : g.homeScore!));
    }, 0);
    return total / rows.length;
  }

  const predictions: WalkForwardPrediction[] = [];

  for (const testSeason of testSeasons) {
    if (testSeason === warmStartSeason) continue;
    const testGames = (gamesBySeason.get(testSeason) ?? []).filter((g) => g.status === "final" && isFbsVsFbsGame(g));
    const weeks = [...new Set(testGames.map((g) => g.week))].sort((a, b) => a - b);

    for (const week of weeks) {
      const trainGames = trainingGames(testSeason, week);
      if (trainGames.length === 0) continue;

      const translationRows = trainGames
        .map((game) => {
          const home = averageMargin(trainGames, game.homeExternalId);
          const away = averageMargin(trainGames, game.awayExternalId);
          if (home === null || away === null || game.homeScore === null || game.awayScore === null) return null;
          return {
            ratingDifferential: home - away,
            actualMargin: game.homeScore - game.awayScore,
            isHome: true,
            isNeutral: game.neutralSite,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
      const coefficients = fitMarginTranslation(translationRows);

      for (const game of testGames.filter((g) => g.week === week)) {
        const home = averageMargin(trainGames, game.homeExternalId);
        const away = averageMargin(trainGames, game.awayExternalId);
        const ratingDifferential = home === null || away === null ? null : home - away;
        const predictedMargin =
          ratingDifferential === null ? null : predictMargin(ratingDifferential, true, game.neutralSite, coefficients);
        const actualMargin = game.homeScore === null || game.awayScore === null ? null : game.homeScore - game.awayScore;

        predictions.push({
          season: testSeason,
          week,
          gameId: game.gameId,
          homeTeamExternalId: game.homeExternalId,
          awayTeamExternalId: game.awayExternalId,
          ratingDifferential,
          predictedMargin,
          actualMargin,
        });
      }
    }
  }

  return predictions;
}
