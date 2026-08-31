/**
 * WU8 — free daily NFL / CFB odds snapshot refresh.
 *
 * One provider request per league snapshot (The Odds API league-wide `/odds`),
 * decoded to per-book rows, joined to JKB canonical games, deduped into a
 * file-backed JSONL history, and projected to browser-safe artifacts. Dry-run
 * calls the provider and reports but writes nothing (private or public). A
 * provider or decode failure throws before any write, so partial artifacts are
 * impossible.
 *
 * It orchestrates the WU8 modules; it reimplements none of them.
 */

import {
  createInMemoryBettingLinePersistence,
  storeBettingLineSnapshot,
  type StoreBettingLineOutcome,
} from "./bettingLineStore";
import {
  joinTheOddsApiBookLine,
  type BettingLineJoinResult,
  type BettingLineTeamResolver,
} from "./bettingLineGameJoin";
import { decodeTheOddsApiOdds } from "../providers/theOddsApiWire";
import {
  publishBettingLineArtifacts,
  type PublishBettingLinesResult,
} from "./bettingLinePublicArtifacts";
import {
  assertQuotaHeadroom,
  readQuotaState,
  writeQuotaState,
  type BettingLineQuotaState,
} from "./bettingLineQuotaGuard";
import type { BettingLineFileStore } from "./bettingLineFileStore";
import type {
  BettingLinePersistenceAdapter,
} from "./bettingLineStore";
import type { CanonicalBettingGame } from "../gameJoinTypes";
import type { BettingLineLeague } from "./bettingLineTypes";
import type { TheOddsApiClient, TheOddsApiQuota } from "../providers/theOddsApiClient";

export type BettingLineRefreshStore = BettingLinePersistenceAdapter &
  Pick<BettingLineFileStore, "listAllSnapshots">;

export type BettingLineRefreshLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
};

export type RunBettingLineRefreshInput = {
  league: BettingLineLeague;
  season: number;
  /** Slate week — used for the report only; canonical games are pre-filtered. */
  week: number | null;
  dryRun: boolean;
  client: TheOddsApiClient;
  store: BettingLineRefreshStore;
  /** Canonical games for this league/season/week, already narrowed by the caller. */
  canonicalGames: readonly CanonicalBettingGame[];
  resolveTeam: BettingLineTeamResolver;
  /** Directory that owns the private quota-state file. */
  stateRoot: string;
  /** Directory the public artifacts are written under. */
  publicRoot: string;
  now?: () => string;
  kickoffToleranceMs?: number;
  quotaFloor?: number;
  allowLowQuota?: boolean;
  logger?: BettingLineRefreshLogger;
  idFactory?: () => string;
};

export type BettingLineRefreshReport = {
  league: BettingLineLeague;
  season: number;
  week: number | null;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  canonicalGames: number;
  providerEvents: number;
  bookmakerRows: number;
  matchedGames: number;
  unmatchedGames: number;
  unmatchedRows: number;
  ambiguousRows: number;
  rejectedRows: number;
  inserted: number;
  extended: number;
  unchanged: number;
  rejected: number;
  quotaLastCost: number | null;
  quotaUsed: number | null;
  quotaRemaining: number | null;
  publishSkipped: boolean;
  publishedGames: number;
  publishedHistoryFiles: number;
  publishResult: PublishBettingLinesResult | null;
};

function countProviderEvents(rows: ReturnType<typeof decodeTheOddsApiOdds>): number {
  return new Set(rows.map((row) => row.providerEventId)).size;
}

export async function runBettingLineRefresh(
  input: RunBettingLineRefreshInput,
): Promise<BettingLineRefreshReport> {
  const startedAt = new Date().toISOString();
  const logger = input.logger ?? { info: () => {}, warn: () => {} };
  const now = input.now ?? (() => new Date().toISOString());
  const capturedAt = now();

  // --- Quota guard: refuse to spend if the last run left us below the floor ---
  const lastKnown: BettingLineQuotaState | null = await readQuotaState(input.stateRoot);
  assertQuotaHeadroom({
    lastKnown,
    floor: input.quotaFloor,
    allowLowQuota: input.allowLowQuota ?? false,
  });

  // --- One provider request for the whole league ---------------------------
  const { events, quota } = await input.client.getCurrentOdds({
    league: input.league,
    regions: ["us"],
    markets: ["h2h", "spreads", "totals"],
    oddsFormat: "american",
  });
  logQuota(logger, quota);

  const rows = decodeTheOddsApiOdds(events);
  const providerEvents = countProviderEvents(rows);
  logger.info(
    `Decoded ${rows.length} bookmaker row(s) across ${providerEvents} provider event(s).`,
  );

  // --- Join every book row to a canonical game ----------------------------
  const results: BettingLineJoinResult[] = rows.map((row) =>
    joinTheOddsApiBookLine({
      row,
      league: input.league,
      canonicalGames: input.canonicalGames,
      resolveTeam: input.resolveTeam,
      capturedAt,
      kickoffToleranceMs: input.kickoffToleranceMs,
    }),
  );

  const matched = results.filter(
    (result): result is Extract<BettingLineJoinResult, { status: "matched" }> =>
      result.status === "matched",
  );
  const unmatchedRows = results.filter((result) => result.status === "unmatched").length;
  const ambiguousRows = results.filter((result) => result.status === "ambiguous").length;
  const rejectedRows = results.filter((result) => result.status === "rejected").length;

  const matchedGameIds = new Set(matched.map((result) => result.snapshot.jkbGameId));

  // --- Persist (skipped on dry-run) -------------------------------------
  const counts: Record<StoreBettingLineOutcome, number> = {
    inserted: 0,
    extended: 0,
    unchanged: 0,
  };
  let rejected = 0;

  if (input.dryRun) {
    logger.info("Dry-run: no private history, quota-state, or public artifact will be written.");
  } else {
    for (const result of matched) {
      const outcome = await storeBettingLineSnapshot({
        adapter: input.store,
        snapshot: result.snapshot,
        idFactory: input.idFactory,
      });
      counts[outcome.outcome] += 1;
    }
    rejected = rejectedRows;
  }

  // --- Publish (skipped on dry-run, and only after a clean persist) -----
  let publishResult: PublishBettingLinesResult | null = null;
  if (!input.dryRun) {
    await writeQuotaState(input.stateRoot, quota, input.league, now);
    publishResult = await publishBettingLineArtifacts({
      store: input.store,
      publicRoot: input.publicRoot,
      generatedAt: now(),
    });
    logger.info(
      `Published betting-lines-current.json and ${publishResult.historyArtifactPaths.length} history artifact(s).`,
    );
  }

  return {
    league: input.league,
    season: input.season,
    week: input.week,
    dryRun: input.dryRun,
    startedAt,
    finishedAt: new Date().toISOString(),
    canonicalGames: input.canonicalGames.length,
    providerEvents,
    bookmakerRows: rows.length,
    matchedGames: matchedGameIds.size,
    unmatchedGames:
      input.canonicalGames.length -
      new Set(
        input.canonicalGames
          .filter((game) => matchedGameIds.has(game.jkbGameId))
          .map((game) => game.jkbGameId),
      ).size,
    unmatchedRows,
    ambiguousRows,
    rejectedRows,
    inserted: counts.inserted,
    extended: counts.extended,
    unchanged: counts.unchanged,
    rejected,
    quotaLastCost: quota.lastCost,
    quotaUsed: quota.used,
    quotaRemaining: quota.remaining,
    publishSkipped: input.dryRun,
    publishedGames: publishResult ? publishResult.historyArtifactPaths.length : 0,
    publishedHistoryFiles: publishResult ? publishResult.historyArtifactPaths.length : 0,
    publishResult,
  };
}

function logQuota(logger: BettingLineRefreshLogger, quota: TheOddsApiQuota): void {
  logger.info(
    `The Odds API quota — lastCost ${quota.lastCost ?? "?"}, used ${quota.used ?? "?"}, ` +
      `remaining ${quota.remaining ?? "?"}.`,
  );
}

export { createInMemoryBettingLinePersistence };
