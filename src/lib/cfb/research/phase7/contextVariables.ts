import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CFB_RESEARCH_NORMALIZED_DIR } from "../config/researchConfig";
import type { CfbResearchGame } from "../types";
import { MIN_BUCKET_SAMPLE_SIZE, PHASE7_TEST_SEASONS } from "./config";
import { mae } from "./statsUtils";
import type { MissDatasetRow } from "./types";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..");
const SHORT_REST_DAYS = 6;
const BYE_WEEK_REST_DAYS = 13;

type GameContext = {
  gameId: string;
  homeRestDays: number | null;
  awayRestDays: number | null;
  neutralSite: boolean;
  postseason: boolean;
  rematch: boolean; // same matchup (either order) occurred in the immediately prior season
};

/**
 * Section 20 — cheap deterministic context from schedule metadata already
 * on hand (kickoffUtc, neutralSite, gameType, home/away ids). Travel
 * distance is NOT computed: CFBD's /games response carries no venue
 * coordinates in this dataset, so it is reported as NOT AVAILABLE in the
 * public-information inventory rather than approximated.
 */
export function buildGameContextMap(testSeasons: readonly number[]): Map<string, GameContext> {
  const result = new Map<string, GameContext>();
  const gamesBySeason = new Map<number, CfbResearchGame[]>();
  const allSeasonsNeeded = [...new Set([...testSeasons, ...testSeasons.map((s) => s - 1)])];
  for (const season of allSeasonsNeeded) {
    try {
      const games = JSON.parse(
        readFileSync(resolve(REPO_ROOT, CFB_RESEARCH_NORMALIZED_DIR, String(season), "games.json"), "utf8"),
      ) as CfbResearchGame[];
      gamesBySeason.set(season, games);
    } catch {
      gamesBySeason.set(season, []);
    }
  }

  for (const season of testSeasons) {
    const games = (gamesBySeason.get(season) ?? []).filter((g) => g.status === "final" && g.kickoffUtc !== null);
    const prevSeasonGames = gamesBySeason.get(season - 1) ?? [];
    const matchupSet = new Set(
      prevSeasonGames.map((g) => [g.homeExternalId, g.awayExternalId].sort().join(":")),
    );

    const lastGameDateByTeam = new Map<string, Date>();
    const sorted = [...games].sort((a, b) => new Date(a.kickoffUtc!).getTime() - new Date(b.kickoffUtc!).getTime());

    for (const game of sorted) {
      const kickoff = new Date(game.kickoffUtc!);
      const homeLast = lastGameDateByTeam.get(game.homeExternalId);
      const awayLast = lastGameDateByTeam.get(game.awayExternalId);
      const homeRestDays = homeLast ? (kickoff.getTime() - homeLast.getTime()) / (1000 * 60 * 60 * 24) : null;
      const awayRestDays = awayLast ? (kickoff.getTime() - awayLast.getTime()) / (1000 * 60 * 60 * 24) : null;

      result.set(game.gameId, {
        gameId: game.gameId,
        homeRestDays,
        awayRestDays,
        neutralSite: game.neutralSite,
        postseason: game.gameType !== "regular",
        rematch: matchupSet.has([game.homeExternalId, game.awayExternalId].sort().join(":")),
      });

      lastGameDateByTeam.set(game.homeExternalId, kickoff);
      lastGameDateByTeam.set(game.awayExternalId, kickoff);
    }
  }
  return result;
}

export type ContextVariableRow = { label: string; n: number; modelMae: number | null; marketMae: number | null; modelMinusMarketMae: number | null };

function toRow(label: string, rows: readonly MissDatasetRow[]): ContextVariableRow {
  const modelMaeVal = mae(rows.map((r) => r.modelMarginError));
  const marketMaeVal = mae(rows.filter((r) => r.marketMarginError !== null).map((r) => r.marketMarginError as number));
  const enough = rows.length >= MIN_BUCKET_SAMPLE_SIZE;
  return {
    label,
    n: rows.length,
    modelMae: enough ? modelMaeVal : null,
    marketMae: enough ? marketMaeVal : null,
    modelMinusMarketMae: enough && modelMaeVal !== null && marketMaeVal !== null ? modelMaeVal - marketMaeVal : null,
  };
}

export type ContextVariableAnalysisResult = {
  byNeutralSite: ContextVariableRow[];
  byShortRest: ContextVariableRow[];
  byByeWeek: ContextVariableRow[];
  byPostseason: ContextVariableRow[];
  byRematch: ContextVariableRow[];
  travelDistance: "NOT_AVAILABLE_no_venue_coordinates_in_dataset";
};

export function buildContextVariableAnalysis(rows: readonly MissDatasetRow[]): ContextVariableAnalysisResult {
  const contextByGame = buildGameContextMap([...PHASE7_TEST_SEASONS]);
  const withContext = rows.map((r) => ({ row: r, ctx: contextByGame.get(r.gameId) }));

  const neutral = withContext.filter((x) => x.ctx?.neutralSite).map((x) => x.row);
  const nonNeutral = withContext.filter((x) => x.ctx && !x.ctx.neutralSite).map((x) => x.row);

  const isShortRest = (x: { ctx?: GameContext }) =>
    x.ctx && ((x.ctx.homeRestDays !== null && x.ctx.homeRestDays < SHORT_REST_DAYS) || (x.ctx.awayRestDays !== null && x.ctx.awayRestDays < SHORT_REST_DAYS));
  const shortRest = withContext.filter(isShortRest).map((x) => x.row);
  const normalRest = withContext.filter((x) => x.ctx && !isShortRest(x)).map((x) => x.row);

  const isByeWeek = (x: { ctx?: GameContext }) =>
    x.ctx && ((x.ctx.homeRestDays !== null && x.ctx.homeRestDays > BYE_WEEK_REST_DAYS) || (x.ctx.awayRestDays !== null && x.ctx.awayRestDays > BYE_WEEK_REST_DAYS));
  const byeWeek = withContext.filter(isByeWeek).map((x) => x.row);
  const noByeWeek = withContext.filter((x) => x.ctx && !isByeWeek(x)).map((x) => x.row);

  const postseason = withContext.filter((x) => x.ctx?.postseason).map((x) => x.row);
  const regularSeason = withContext.filter((x) => x.ctx && !x.ctx.postseason).map((x) => x.row);

  const rematch = withContext.filter((x) => x.ctx?.rematch).map((x) => x.row);
  const noRematch = withContext.filter((x) => x.ctx && !x.ctx.rematch).map((x) => x.row);

  return {
    byNeutralSite: [toRow("neutral_site", neutral), toRow("home_site", nonNeutral)],
    byShortRest: [toRow("short_rest_lt6_days", shortRest), toRow("normal_rest", normalRest)],
    byByeWeek: [toRow("coming_off_bye", byeWeek), toRow("no_bye", noByeWeek)],
    byPostseason: [toRow("postseason", postseason), toRow("regular_season", regularSeason)],
    byRematch: [toRow("rematch_of_prior_season", rematch), toRow("no_rematch", noRematch)],
    travelDistance: "NOT_AVAILABLE_no_venue_coordinates_in_dataset",
  };
}
