/**
 * WU6 betting-splits collection core.
 *
 * Pure orchestration with every IO seam injected (SportsDataIO client, canonical
 * slate, persistence store, capture clock). The CLI
 * (`scripts/market/collect-betting-splits.ts`) only wires real implementations
 * into {@link runBettingSplitsCollection}.
 *
 * Pipeline:
 *   SportsDataIO ScoresByWeek discovery
 *     -> candidate provider games (team identity + kickoff window)
 *       -> BettingSplitsByScoreId fetch (candidates only)
 *         -> wire decode (GameBettingSplit -> row DTOs)
 *           -> WU2 normalize (row DTOs -> provider-neutral split)
 *             -> WU3 canonical join (uses stored crosswalks; canonical week wins)
 *               -> WU4 store semantics (dedupe by content hash)
 *                 -> WU4 crosswalk upsert (verified provider<->JKB mapping)
 *
 * Dry-run performs discovery, fetch, decode, normalize and join, and produces a
 * full report, but writes nothing: no snapshot, no crosswalk, no public artifact.
 */

import {
  storeBettingSplitSnapshot,
  upsertBettingProviderGameCrosswalk,
} from "./bettingSplitsStore";
import { normalizeSportsDataIoBettingSplits } from "./providers/sportsDataIoBettingSplits";
import {
  decodeSportsDataIoBettingSplitsWire,
  SportsDataIoWireDecodeError,
} from "./providers/sportsDataIoBettingSplitsWire";
import {
  decodeSportsDataIoNflSchedule,
  selectScheduleCandidates,
  type SportsDataIoScheduleGame,
} from "./providers/sportsDataIoSchedule";
import type {
  SportsDataIoClient,
  SportsDataIoSeasonType,
} from "./providers/sportsDataIoClient";
import type { BettingProviderGameCrosswalk } from "./gameJoinTypes";
import type { BettingSplitPersistenceAdapter } from "./bettingSplitsPersistence";
import { joinNflBettingSplitToGame } from "../nfl/bettingSplitsGameJoin";
import type { NflGameRecord, CanonicalNflTeam } from "../nfl/standings";
import { normalizeNflTeamAbbr } from "../nfl/identity/identity";

export type BettingSplitsCollectionStore = BettingSplitPersistenceAdapter & {
  listAllCrosswalks(): Promise<
    ReadonlyArray<{
      league: string;
      provider: string;
      providerGameId: string;
      jkbGameId: string;
    }>
  >;
};

export type BettingSplitsCollectionLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
};

export type RunBettingSplitsCollectionInput = {
  league: "nfl" | "cfb";
  season: number;
  seasonType: SportsDataIoSeasonType;
  week: number;
  dryRun: boolean;
  client: SportsDataIoClient;
  /** Canonical JKB NFL schedule for `(season, week)`. */
  canonicalGames: readonly NflGameRecord[];
  canonicalTeams?: readonly CanonicalNflTeam[];
  store: BettingSplitsCollectionStore;
  /** Explicit capture instant for this observation batch (UTC ISO). */
  capturedAt: string;
  kickoffToleranceMs?: number;
  logger?: BettingSplitsCollectionLogger;
};

export type BettingSplitsRunReport = {
  league: "nfl" | "cfb";
  season: number;
  week: number;
  seasonType: SportsDataIoSeasonType;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;

  discoveredGames: number;
  candidateGames: number;
  splitRequests: number;
  providerRows: number;
  normalizedEvents: number;

  matched: number;
  inserted: number;
  extended: number;
  unmatched: number;
  ambiguous: number;
  rejected: number;

  crosswalkInserted: number;
  crosswalkVerified: number;
  crosswalkConflicts: number;

  qa: BettingSplitsQaEvidence[];
};

export type BettingSplitsQaEvidence = {
  providerGameId: string;
  jkbGameId: string | null;
  stage:
    | "candidate"
    | "fetch-failed"
    | "wire-decode-failed"
    | "wire-skipped"
    | "normalize-rejected"
    | "join"
    | "store";
  outcome: string;
  detail?: string;
};

const NON_RETRYABLE_LEAGUE_MESSAGE =
  "CFB betting-splits collection is not implemented: the SportsDataIO CFB " +
  "schedule and betting-splits-by-game routes could not be verified against an " +
  "authoritative machine-readable source. Only --league nfl is supported.";

function emptyReport(
  input: RunBettingSplitsCollectionInput,
  startedAt: string,
): BettingSplitsRunReport {
  return {
    league: input.league,
    season: input.season,
    week: input.week,
    seasonType: input.seasonType,
    dryRun: input.dryRun,
    startedAt,
    finishedAt: startedAt,
    discoveredGames: 0,
    candidateGames: 0,
    splitRequests: 0,
    providerRows: 0,
    normalizedEvents: 0,
    matched: 0,
    inserted: 0,
    extended: 0,
    unmatched: 0,
    ambiguous: 0,
    rejected: 0,
    crosswalkInserted: 0,
    crosswalkVerified: 0,
    crosswalkConflicts: 0,
    qa: [],
  };
}

/** Provider "SEA" / canonical "sea" both normalize onto the nflverse code. */
function normalizeNflTeamToken(value: string | null): string | null {
  if (value === null) return null;
  return normalizeNflTeamAbbr(value);
}

export async function runBettingSplitsCollection(
  input: RunBettingSplitsCollectionInput,
): Promise<BettingSplitsRunReport> {
  const startedAt = new Date().toISOString();
  const logger = input.logger ?? { info: () => {}, warn: () => {} };
  const report = emptyReport(input, startedAt);

  if (input.league !== "nfl") {
    throw new Error(NON_RETRYABLE_LEAGUE_MESSAGE);
  }
  if (!Number.isInteger(input.week) || input.week <= 0) {
    throw new Error(`week must be a positive integer; received ${input.week}.`);
  }
  if (Number.isNaN(Date.parse(input.capturedAt))) {
    throw new Error(`capturedAt must be a valid timestamp; received ${input.capturedAt}.`);
  }

  // --- Discovery ------------------------------------------------------------
  const schedulePayload = await input.client.getNflScoresByWeek(
    input.season,
    input.seasonType,
    input.week,
  );
  const providerGames = decodeSportsDataIoNflSchedule(schedulePayload);
  report.discoveredGames = providerGames.length;
  logger.info(`Discovered ${providerGames.length} provider games.`);

  const canonicalGamesForWeek = input.canonicalGames.filter(
    (game) => game.season === input.season && game.week === input.week,
  );

  const { candidates } = selectScheduleCandidates(
    providerGames,
    canonicalGamesForWeek.map((game) => ({
      league: "nfl" as const,
      season: game.season,
      week: game.week,
      jkbGameId: game.gameId,
      awayTeamId: normalizeNflTeamAbbr(game.awayAbbr) ?? game.awayAbbr,
      homeTeamId: normalizeNflTeamAbbr(game.homeAbbr) ?? game.homeAbbr,
      kickoffUtc: game.dateUtc,
      neutralSite: game.neutralSite,
    })),
    {
      kickoffToleranceMs: input.kickoffToleranceMs,
      normalizeTeam: normalizeNflTeamToken,
    },
  );

  // One request per distinct provider game, never per candidate pairing.
  const providerGamesToFetch = new Map<string, SportsDataIoScheduleGame>();
  for (const candidate of candidates) {
    providerGamesToFetch.set(
      candidate.providerGame.providerGameId,
      candidate.providerGame,
    );
    report.qa.push({
      providerGameId: candidate.providerGame.providerGameId,
      jkbGameId: candidate.canonicalGame.jkbGameId,
      stage: "candidate",
      outcome: candidate.matchedBy,
      detail:
        candidate.kickoffDeltaMinutes === null
          ? "kickoff delta unknown"
          : `kickoff delta ${candidate.kickoffDeltaMinutes.toFixed(1)}m`,
    });
  }
  report.candidateGames = providerGamesToFetch.size;
  logger.info(`Selected ${providerGamesToFetch.size} candidate games for split fetch.`);

  const existingCrosswalks = (await input.store.listAllCrosswalks())
    .filter((row) => row.league === "nfl")
    .map(
      (row): BettingProviderGameCrosswalk => ({
        league: "nfl",
        provider: row.provider,
        providerGameId: row.providerGameId,
        jkbGameId: row.jkbGameId,
      }),
    );

  // --- Per-candidate fetch -> decode -> normalize -> join -> store ----------
  for (const providerGame of providerGamesToFetch.values()) {
    report.splitRequests += 1;
    let payload: unknown;
    try {
      payload = await input.client.getNflBettingSplitsByScoreId(
        providerGame.providerGameId,
      );
    } catch (error) {
      report.qa.push({
        providerGameId: providerGame.providerGameId,
        jkbGameId: null,
        stage: "fetch-failed",
        outcome: "error",
        detail: (error as Error).message,
      });
      logger.warn(
        `Split fetch failed for provider game ${providerGame.providerGameId}: ${(error as Error).message}`,
      );
      continue;
    }

    let decoded;
    try {
      decoded = decodeSportsDataIoBettingSplitsWire(payload, { league: "nfl" });
    } catch (error) {
      if (!(error instanceof SportsDataIoWireDecodeError)) throw error;
      report.qa.push({
        providerGameId: providerGame.providerGameId,
        jkbGameId: null,
        stage: "wire-decode-failed",
        outcome: "error",
        detail: error.message,
      });
      logger.warn(
        `Wire decode failed for provider game ${providerGame.providerGameId}: ${error.message}`,
      );
      continue;
    }

    report.providerRows += decoded.rows.length;
    for (const skip of decoded.skipped) {
      report.qa.push({
        providerGameId: providerGame.providerGameId,
        jkbGameId: null,
        stage: "wire-skipped",
        outcome: skip.code,
        detail: skip.message,
      });
    }
    if (decoded.rows.length === 0) continue;

    const normalization = normalizeSportsDataIoBettingSplits(decoded.rows, {
      capturedAt: input.capturedAt,
    });
    for (const rejection of normalization.rejected) {
      report.qa.push({
        providerGameId: providerGame.providerGameId,
        jkbGameId: null,
        stage: "normalize-rejected",
        outcome: rejection.code,
        detail: rejection.message,
      });
    }
    report.normalizedEvents += normalization.normalized.length;

    for (const normalized of normalization.normalized) {
      const join = joinNflBettingSplitToGame(normalized, canonicalGamesForWeek, {
        crosswalks: existingCrosswalks,
        canonicalTeams: input.canonicalTeams,
        kickoffToleranceMs: input.kickoffToleranceMs,
      });

      if (join.status === "unmatched") {
        report.unmatched += 1;
        report.qa.push({
          providerGameId: providerGame.providerGameId,
          jkbGameId: null,
          stage: "join",
          outcome: `unmatched:${join.reason}`,
        });
        continue;
      }
      if (join.status === "ambiguous") {
        report.ambiguous += 1;
        report.qa.push({
          providerGameId: providerGame.providerGameId,
          jkbGameId: null,
          stage: "join",
          outcome: "ambiguous",
          detail: join.candidateGameIds.join(", "),
        });
        continue;
      }
      if (join.status === "rejected") {
        report.rejected += 1;
        report.qa.push({
          providerGameId: providerGame.providerGameId,
          jkbGameId: null,
          stage: "join",
          outcome: `rejected:${join.reason}`,
          detail: join.validationIssues?.join("; "),
        });
        continue;
      }

      report.matched += 1;
      const snapshot = join.snapshot;
      report.qa.push({
        providerGameId: providerGame.providerGameId,
        jkbGameId: snapshot.jkbGameId,
        stage: "join",
        outcome: "matched",
        detail: `canonical week ${snapshot.week ?? "null"}`,
      });

      if (input.dryRun) {
        report.qa.push({
          providerGameId: providerGame.providerGameId,
          jkbGameId: snapshot.jkbGameId,
          stage: "store",
          outcome: "dry-run:skipped",
        });
        continue;
      }

      const stored = await storeBettingSplitSnapshot(input.store, snapshot);
      if (stored.action === "inserted") report.inserted += 1;
      else report.extended += 1;
      report.qa.push({
        providerGameId: providerGame.providerGameId,
        jkbGameId: snapshot.jkbGameId,
        stage: "store",
        outcome: stored.action,
        detail: stored.contentHash.slice(0, 12),
      });

      const crosswalk = await upsertBettingProviderGameCrosswalk(input.store, {
        ...join.crosswalkCandidate,
        providerHomeTeamId: normalized.providerHomeTeamId,
        providerAwayTeamId: normalized.providerAwayTeamId,
        canonicalHomeTeamId: snapshot.homeTeamId,
        canonicalAwayTeamId: snapshot.awayTeamId,
        verifiedAt: input.capturedAt,
      });
      if (crosswalk.action === "inserted") {
        report.crosswalkInserted += 1;
        existingCrosswalks.push(join.crosswalkCandidate);
      } else if (crosswalk.action === "verified") {
        report.crosswalkVerified += 1;
      } else {
        report.crosswalkConflicts += 1;
        report.qa.push({
          providerGameId: providerGame.providerGameId,
          jkbGameId: snapshot.jkbGameId,
          stage: "store",
          outcome: "crosswalk-conflict",
          detail: `existing ${crosswalk.existingJkbGameId}`,
        });
      }
    }
  }

  report.finishedAt = new Date().toISOString();
  return report;
}

export { NON_RETRYABLE_LEAGUE_MESSAGE };
