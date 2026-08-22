import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CFB_RESEARCH_NORMALIZED_DIR } from "../config/researchConfig";
import { americanOddsToImpliedProbability, devigProportional } from "../phase6/oddsMath";
import { buildMarketModelJoin } from "../phase6/marketDataLoader";
import type { MarketModelJoinRow } from "../phase6/types";
import type { CfbResearchGame } from "../types";
import { buildPhase7Context, ratingVolatility, getSnapshot, type Phase7Context } from "./contextSnapshot";
import { PHASE7_TEST_SEASONS } from "./config";
import { classifyMiss } from "./missCategories";
import { loadTeamNames } from "./teamNames";
import type { MissDatasetRow } from "./types";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..");

function loadSeasonGamesById(season: number): Map<string, CfbResearchGame> {
  const games = JSON.parse(
    readFileSync(resolve(REPO_ROOT, CFB_RESEARCH_NORMALIZED_DIR, String(season), "games.json"), "utf8"),
  ) as CfbResearchGame[];
  return new Map(games.map((g) => [g.gameId, g]));
}

/** Section 2 — one market row per game: prefer a "consensus" provider if present, else the alphabetically-first provider (deterministic, never arbitrary). */
function pickOneRowPerGame(rows: readonly MarketModelJoinRow[]): MarketModelJoinRow[] {
  const byGame = new Map<string, MarketModelJoinRow[]>();
  for (const row of rows) {
    const arr = byGame.get(row.gameId) ?? [];
    arr.push(row);
    byGame.set(row.gameId, arr);
  }
  const result: MarketModelJoinRow[] = [];
  for (const [, gameRows] of byGame) {
    const consensus = gameRows.find((r) => r.provider.toLowerCase() === "consensus");
    if (consensus) {
      result.push(consensus);
      continue;
    }
    const sorted = [...gameRows].sort((a, b) => a.provider.localeCompare(b.provider));
    result.push(sorted[0]);
  }
  return result;
}

function marketFairHomeWinProb(homeMoneyline: number | null, awayMoneyline: number | null): number | null {
  if (homeMoneyline === null || awayMoneyline === null) return null;
  const homeRaw = americanOddsToImpliedProbability(homeMoneyline);
  const awayRaw = americanOddsToImpliedProbability(awayMoneyline);
  return devigProportional(homeRaw, awayRaw).homeFair;
}

/**
 * Section 2 — builds the Phase 7 model-miss research table: one row per
 * FBS-vs-FBS game with a frozen Phase 4-6 prediction AND a market line.
 * Does NOT alter any Phase 0-6 artifact — reads only.
 */
export function buildMissDataset(context: Phase7Context = buildPhase7Context([...PHASE7_TEST_SEASONS])): MissDatasetRow[] {
  const joinRows = pickOneRowPerGame(buildMarketModelJoin());
  const gamesBySeason = new Map<number, Map<string, CfbResearchGame>>();
  const teamNamesBySeason = new Map<number, Map<string, string>>();

  function gamesFor(season: number): Map<string, CfbResearchGame> {
    if (!gamesBySeason.has(season)) gamesBySeason.set(season, loadSeasonGamesById(season));
    return gamesBySeason.get(season)!;
  }
  function teamNamesFor(season: number): Map<string, string> {
    if (!teamNamesBySeason.has(season)) teamNamesBySeason.set(season, loadTeamNames(season));
    return teamNamesBySeason.get(season)!;
  }

  const rows: MissDatasetRow[] = [];
  for (const join of joinRows) {
    const game = gamesFor(join.season).get(join.gameId);
    if (!game) continue;

    const marketMarginOpen = join.spreadOpen === null ? null : -join.spreadOpen;
    const marketMarginLatestObserved = join.spreadLatestObserved === null ? null : -join.spreadLatestObserved;
    const marketTotal = join.totalLatestObserved ?? join.totalOpen;
    const marketPHomeWinFair = marketFairHomeWinProb(join.homeMoneyline, join.awayMoneyline);

    const modelMarginError = Math.abs(join.modelProjectedMargin - join.actualMargin);
    const marketMarginError = marketMarginLatestObserved === null ? null : Math.abs(marketMarginLatestObserved - join.actualMargin);
    const modelTotalError = Math.abs(join.modelProjectedTotal - join.actualTotal);
    const marketTotalError = marketTotal === null ? null : Math.abs(marketTotal - join.actualTotal);
    const modelVsMarketDisagreement =
      marketMarginLatestObserved === null ? null : Math.abs(join.modelProjectedMargin - marketMarginLatestObserved);

    const homeSnap = getSnapshot(context, join.season, join.week, join.homeTeamExternalId);
    const awaySnap = getSnapshot(context, join.season, join.week, join.awayTeamExternalId);
    const preseason = context.preseasonInputsBySeason.get(join.season);
    const homePreseason = preseason?.get(join.homeTeamExternalId);
    const awayPreseason = preseason?.get(join.awayTeamExternalId);
    const priors = context.priorsBySeason.get(join.season);
    const homePrior = priors?.get(join.homeTeamExternalId);
    const awayPrior = priors?.get(join.awayTeamExternalId);

    const homePrevSeasonRating =
      homePreseason?.prevSeasonOffense !== null && homePreseason?.prevSeasonOffense !== undefined &&
      homePreseason?.prevSeasonDefense !== null && homePreseason?.prevSeasonDefense !== undefined
        ? 0.5 * (homePreseason.prevSeasonOffense + homePreseason.prevSeasonDefense)
        : null;
    const awayPrevSeasonRating =
      awayPreseason?.prevSeasonOffense !== null && awayPreseason?.prevSeasonOffense !== undefined &&
      awayPreseason?.prevSeasonDefense !== null && awayPreseason?.prevSeasonDefense !== undefined
        ? 0.5 * (awayPreseason.prevSeasonOffense + awayPreseason.prevSeasonDefense)
        : null;

    if (marketMarginError === null) continue; // classification requires a market comparison — never fabricate one

    const teamNames = teamNamesFor(join.season);

    rows.push({
      season: join.season,
      week: join.week,
      gameId: join.gameId,
      homeTeam: teamNames.get(join.homeTeamExternalId) ?? join.homeTeamExternalId,
      awayTeam: teamNames.get(join.awayTeamExternalId) ?? join.awayTeamExternalId,
      homeTeamExternalId: join.homeTeamExternalId,
      awayTeamExternalId: join.awayTeamExternalId,

      modelMargin: join.modelProjectedMargin,
      modelTotal: join.modelProjectedTotal,
      modelPHomeWin: join.modelPHomeWin,
      expectedHomeScore: join.modelExpectedHome,
      expectedAwayScore: join.modelExpectedAway,
      homeOffenseRating: homeSnap?.offense ?? null,
      homeDefenseRating: homeSnap?.defense ?? null,
      awayOffenseRating: awaySnap?.offense ?? null,
      awayDefenseRating: awaySnap?.defense ?? null,

      marketProvider: join.provider,
      marketMarginOpen,
      marketMarginLatestObserved,
      marketTotal,
      marketPHomeWinFair,

      actualMargin: join.actualMargin,
      actualTotal: join.actualTotal,
      winner: join.actualMargin > 0 ? "home" : "away",

      modelMarginError,
      marketMarginError,
      modelTotalError,
      marketTotalError,
      modelVsMarketDisagreement,

      homeGamesPlayedEnteringWeek: homeSnap?.gamesPlayedEnteringWeek ?? 0,
      awayGamesPlayedEnteringWeek: awaySnap?.gamesPlayedEnteringWeek ?? 0,
      homePriorOffenseTier: homePrior?.offenseTier ?? "UNKNOWN",
      homePriorDefenseTier: homePrior?.defenseTier ?? "UNKNOWN",
      awayPriorOffenseTier: awayPrior?.offenseTier ?? "UNKNOWN",
      awayPriorDefenseTier: awayPrior?.defenseTier ?? "UNKNOWN",
      homeReturningProductionOffense: homePreseason?.returningProductionOffense ?? null,
      awayReturningProductionOffense: awayPreseason?.returningProductionOffense ?? null,
      homeTalent: homePreseason?.talent ?? null,
      awayTalent: awayPreseason?.talent ?? null,
      homeTransitionTeam: homePrevSeasonRating === null,
      awayTransitionTeam: awayPrevSeasonRating === null,
      homeConference: game.homeConference,
      awayConference: game.awayConference,
      homePrevSeasonRating,
      awayPrevSeasonRating,
      homeRatingVolatility: ratingVolatility(context, join.season, join.week, join.homeTeamExternalId),
      awayRatingVolatility: ratingVolatility(context, join.season, join.week, join.awayTeamExternalId),

      missCategory: classifyMiss(modelMarginError, marketMarginError),
    });
  }

  return rows.sort((a, b) => a.season - b.season || a.week - b.week || a.gameId.localeCompare(b.gameId));
}
