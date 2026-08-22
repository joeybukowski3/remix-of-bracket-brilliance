import { EXTREME_DISAGREEMENT_TOP_N_PER_SEASON } from "./config";
import type { ExtremeDisagreementRow, MissDatasetRow } from "./types";

/** Section 4 — top-N largest model-vs-market margin disagreements per season. */
export function buildExtremeDisagreementAudit(rows: readonly MissDatasetRow[]): ExtremeDisagreementRow[] {
  const withDisagreement = rows.filter(
    (r): r is MissDatasetRow & { modelVsMarketDisagreement: number; marketMarginLatestObserved: number } =>
      r.modelVsMarketDisagreement !== null && r.marketMarginLatestObserved !== null,
  );

  const bySeason = new Map<number, typeof withDisagreement>();
  for (const row of withDisagreement) {
    const arr = bySeason.get(row.season) ?? [];
    arr.push(row);
    bySeason.set(row.season, arr);
  }

  const result: ExtremeDisagreementRow[] = [];
  for (const [, seasonRows] of bySeason) {
    const top = [...seasonRows]
      .sort((a, b) => b.modelVsMarketDisagreement - a.modelVsMarketDisagreement)
      .slice(0, EXTREME_DISAGREEMENT_TOP_N_PER_SEASON);

    for (const row of top) {
      const probabilityGap = row.marketPHomeWinFair === null ? null : Math.abs(row.modelPHomeWin - row.marketPHomeWinFair);
      const talentDifferential =
        row.homeTalent === null || row.awayTalent === null ? null : row.homeTalent - row.awayTalent;
      const prevYearRatingDifferential =
        row.homePrevSeasonRating === null || row.awayPrevSeasonRating === null
          ? null
          : row.homePrevSeasonRating - row.awayPrevSeasonRating;
      const returningProductionDifferential =
        row.homeReturningProductionOffense === null || row.awayReturningProductionOffense === null
          ? null
          : row.homeReturningProductionOffense - row.awayReturningProductionOffense;

      const modelError = row.modelMarginError;
      const marketError = row.marketMarginError ?? Infinity;
      const closerSide: ExtremeDisagreementRow["closerSide"] =
        modelError < marketError ? "model" : modelError > marketError ? "market" : "tie";

      result.push({
        season: row.season,
        week: row.week,
        gameId: row.gameId,
        homeTeam: row.homeTeam,
        awayTeam: row.awayTeam,
        modelMargin: row.modelMargin,
        marketMargin: row.marketMarginLatestObserved,
        actualMargin: row.actualMargin,
        disagreementPoints: row.modelVsMarketDisagreement,
        modelPHomeWin: row.modelPHomeWin,
        marketPHomeWin: row.marketPHomeWinFair,
        probabilityGap,
        homePriorOffenseTier: row.homePriorOffenseTier,
        awayPriorOffenseTier: row.awayPriorOffenseTier,
        homeGamesPlayedEnteringWeek: row.homeGamesPlayedEnteringWeek,
        awayGamesPlayedEnteringWeek: row.awayGamesPlayedEnteringWeek,
        talentDifferential,
        prevYearRatingDifferential,
        returningProductionDifferential,
        homeRatingVolatility: row.homeRatingVolatility,
        awayRatingVolatility: row.awayRatingVolatility,
        closerSide,
      });
    }
  }

  return result.sort((a, b) => a.season - b.season || b.disagreementPoints - a.disagreementPoints);
}
