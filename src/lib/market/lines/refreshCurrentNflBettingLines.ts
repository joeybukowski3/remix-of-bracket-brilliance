/**
 * WU9 — NFL-only "refresh the current week's betting lines" orchestrator.
 *
 * Resolves the nearest upcoming NFL REG / postseason week from the canonical
 * nflverse schedule ({@link resolveNflBettingLinesSlate}), then hands that
 * slate to the existing WU8 refresh ({@link runBettingLineRefresh}). It adds no
 * new refresh logic. NFL is the only league it can touch.
 *
 * Offseason: when the resolver reports `no-slate`, the provider is never
 * constructed or called and the run is a clean no-op (exit 0) so no The Odds
 * API credit is spent.
 */

import { loadCanonicalNflSlate } from "./canonicalNflSlate";
import { normalizeNflTeamAbbr } from "../../nfl/identity/identity";
import { resolveTheOddsApiNflTeamId } from "./theOddsApiNflTeamIdentity";
import {
  resolveNflBettingLinesSlate,
  type NflBettingLinesResolvedSlate,
} from "./nflBettingLinesWeekResolver";
import {
  runBettingLineRefresh,
  type BettingLineRefreshReport,
  type BettingLineRefreshStore,
  type RunBettingLineRefreshInput,
} from "./refreshBettingLines";
import type { CanonicalBettingGame } from "./canonicalBettingGame";
import type { NflGameRecord } from "../../nfl/standings";
import type { TheOddsApiClient } from "../providers/theOddsApiClient";

export type RefreshCurrentNflBettingLinesLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
};

export type RefreshCurrentNflBettingLinesInput = {
  /**
   * Parsed `public/data/nfl/<season>/games.json` documents (current +
   * previous season is enough to cover January playoffs).
   */
  gamesDocuments: readonly unknown[];
  /** Human-readable provenance for the resolved-slate report. */
  scheduleSource: string;
  /** Lazily constructed so the offseason path never builds a provider client. */
  createClient: () => TheOddsApiClient;
  store: BettingLineRefreshStore;
  stateRoot: string;
  publicRoot: string;
  dryRun: boolean;
  now?: () => string;
  logger?: RefreshCurrentNflBettingLinesLogger;
  /** Test seam: override the resolver-relative clock. Defaults to `now`. */
  nowUtc?: string;
} & Pick<RunBettingLineRefreshInput, "kickoffToleranceMs">;

export type RefreshCurrentNflBettingLinesResult =
  | { status: "no-slate"; reason: string }
  | {
      status: "refreshed";
      slate: NflBettingLinesResolvedSlate;
      report: BettingLineRefreshReport;
    };

function toCanonicalBettingGames(
  games: readonly NflGameRecord[],
): CanonicalBettingGame[] {
  return games.map((game) => ({
    league: "nfl" as const,
    season: game.season,
    week: game.week,
    jkbGameId: game.gameId,
    awayTeamId: normalizeNflTeamAbbr(game.awayAbbr) ?? game.awayAbbr,
    homeTeamId: normalizeNflTeamAbbr(game.homeAbbr) ?? game.homeAbbr,
    kickoffUtc: game.dateUtc,
    neutralSite: game.neutralSite,
  }));
}

export async function refreshCurrentNflBettingLines(
  input: RefreshCurrentNflBettingLinesInput,
): Promise<RefreshCurrentNflBettingLinesResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const logger = input.logger ?? { info: () => {}, warn: () => {} };
  const nowUtc = input.nowUtc ?? now();

  const resolution = resolveNflBettingLinesSlate({
    gamesDocuments: input.gamesDocuments,
    nowUtc,
  });

  if (resolution.status === "no-slate") {
    logger.info(`no active/upcoming NFL slate: ${resolution.reason}`);
    return { status: "no-slate", reason: resolution.reason };
  }

  logger.info(
    `resolved slate: season ${resolution.season} week ${resolution.week} ` +
      `(${resolution.seasonType}) — ${resolution.futureGamesInWeek}/${resolution.totalGamesInWeek} ` +
      `game(s) still upcoming, next kickoff ${resolution.nextKickoffUtc}`,
  );

  const slate = loadCanonicalNflSlate({
    season: resolution.season,
    week: resolution.week,
    seasonType: resolution.seasonType,
    gamesDocument: { games: input.gamesDocuments.flatMap(gamesOf) },
    source: input.scheduleSource,
  });

  const report = await runBettingLineRefresh({
    league: "nfl",
    season: resolution.season,
    week: resolution.week,
    dryRun: input.dryRun,
    client: input.createClient(),
    store: input.store,
    canonicalGames: toCanonicalBettingGames(slate.games),
    resolveTeam: resolveTheOddsApiNflTeamId,
    stateRoot: input.stateRoot,
    publicRoot: input.publicRoot,
    kickoffToleranceMs: input.kickoffToleranceMs,
    // WU9 scheduled job MUST preserve the WU8 quota guard: default floor (50),
    // never allow-low-quota.
    allowLowQuota: false,
    now: input.now,
    logger,
  });

  return { status: "refreshed", slate: resolution, report };
}

function gamesOf(document: unknown): NflGameRecord[] {
  if (
    typeof document === "object" &&
    document !== null &&
    Array.isArray((document as { games?: unknown }).games)
  ) {
    return (document as { games: NflGameRecord[] }).games;
  }
  return [];
}
