/**
 * WU7B — single NFL betting-splits operational refresh.
 *
 * Orchestrates the already-built work units; it reimplements none of them:
 *   1. WU7A  loadCanonicalNflSlate  — narrow the nflverse schedule artifact
 *   2. WU6   runBettingSplitsCollection — discover / fetch / normalize / join / persist
 *   3. WU5   publishBettingSplitsArtifacts — project the private history to public JSON
 *
 * Dry-run performs steps 1-2 with `dryRun` propagated (no private writes, no
 * crosswalk writes) and skips step 3 entirely. A collection failure throws
 * before publish, so partial public artifacts can never be written.
 *
 * Only NFL is supported — the CFB SportsDataIO schedule and betting-splits
 * routes are unverified and intentionally absent.
 */

import {
  runBettingSplitsCollection,
  type BettingSplitsCollectionLogger,
  type BettingSplitsCollectionStore,
  type BettingSplitsRunReport,
} from "./collectBettingSplits";
import {
  loadCanonicalNflSlate,
  type CanonicalNflSlate,
} from "./nflBettingSplitsSlate";
import {
  publishBettingSplitsArtifacts,
  type PublishBettingSplitsResult,
} from "./bettingSplitsPublicArtifacts";
import type { BettingSplitFileStore } from "./bettingSplitsFileStore";
import type { SportsDataIoClient, SportsDataIoSeasonType } from "./providers/sportsDataIoClient";
import type { CanonicalNflTeam } from "../nfl/standings";

export type BettingSplitsRefreshStore = BettingSplitsCollectionStore &
  Pick<BettingSplitFileStore, "listAllSnapshots">;

export type RunBettingSplitsRefreshInput = {
  league: "nfl";
  season: number;
  week: number;
  seasonType: SportsDataIoSeasonType;
  dryRun: boolean;
  client: SportsDataIoClient;
  store: BettingSplitsRefreshStore;
  /** Parsed `public/data/nfl/<season>/games.json`. */
  gamesDocument: unknown;
  scheduleSource?: string;
  canonicalTeams?: readonly CanonicalNflTeam[];
  /** Directory the WU5 publisher writes public artifacts under. */
  publicRoot: string;
  /** Single clock for capturedAt (collection) and generatedAt (publish). */
  now?: () => string;
  kickoffToleranceMs?: number;
  logger?: BettingSplitsCollectionLogger;
};

export type BettingSplitsRefreshReport = {
  league: "nfl";
  season: number;
  week: number;
  seasonType: SportsDataIoSeasonType;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  scheduleSource: string;
  canonicalGames: number;
  collection: BettingSplitsRunReport;
  publishSkipped: boolean;
  publishedGames: number;
  publishedHistoryFiles: number;
  publishResult: PublishBettingSplitsResult | null;
};

const CFB_UNSUPPORTED_MESSAGE =
  "CFB is not supported by the betting-splits refresh: the SportsDataIO CFB " +
  "schedule and betting-splits-by-game routes are unverified and intentionally " +
  "not implemented. Only --league nfl is supported.";

export async function runBettingSplitsRefresh(
  input: RunBettingSplitsRefreshInput,
): Promise<BettingSplitsRefreshReport> {
  const startedAt = new Date().toISOString();
  const logger = input.logger ?? { info: () => {}, warn: () => {} };

  if ((input.league as string) !== "nfl") {
    throw new Error(CFB_UNSUPPORTED_MESSAGE);
  }

  const now = input.now ?? (() => new Date().toISOString());
  const capturedAt = now();

  // --- Step 1: canonical slate (WU7A) -------------------------------------
  const slate: CanonicalNflSlate = loadCanonicalNflSlate({
    season: input.season,
    week: input.week,
    seasonType: input.seasonType,
    gamesDocument: input.gamesDocument,
    source: input.scheduleSource,
  });
  logger.info(
    `Canonical slate: ${slate.games.length} ${slate.seasonType} game(s) for ` +
      `${slate.season} week ${slate.week} (source ${slate.source}).`,
  );

  // --- Step 2: collection (WU6) ------------------------------------------
  const collection = await runBettingSplitsCollection({
    league: "nfl",
    season: input.season,
    seasonType: input.seasonType,
    week: input.week,
    dryRun: input.dryRun,
    client: input.client,
    canonicalGames: slate.games,
    canonicalTeams: input.canonicalTeams,
    store: input.store,
    capturedAt,
    kickoffToleranceMs: input.kickoffToleranceMs,
    logger,
  });

  // --- Step 3: publish (WU5) — never on dry-run, never after a failure ---
  let publishResult: PublishBettingSplitsResult | null = null;
  if (input.dryRun) {
    logger.info("Dry-run: skipping public artifact publication.");
  } else {
    publishResult = await publishBettingSplitsArtifacts({
      store: input.store,
      publicRoot: input.publicRoot,
      generatedAt: now(),
    });
    logger.info(
      `Published ${publishResult.historyArtifactPaths.length} history artifact(s) ` +
        `and ${publishResult.currentArtifactPath}.`,
    );
  }

  return {
    league: "nfl",
    season: input.season,
    week: input.week,
    seasonType: input.seasonType,
    dryRun: input.dryRun,
    startedAt,
    finishedAt: new Date().toISOString(),
    scheduleSource: slate.source,
    canonicalGames: slate.games.length,
    collection,
    publishSkipped: input.dryRun,
    publishedGames: publishResult ? publishResult.historyArtifactPaths.length : 0,
    publishedHistoryFiles: publishResult
      ? publishResult.historyArtifactPaths.length
      : 0,
    publishResult,
  };
}

export { CFB_UNSUPPORTED_MESSAGE };
