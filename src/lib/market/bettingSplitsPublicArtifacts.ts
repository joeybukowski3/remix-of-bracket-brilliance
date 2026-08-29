import path from "node:path";
import type {
  BettingLeague,
  BettingMoneylineSplit,
  BettingSpreadSplit,
  BettingSplitSnapshot,
  BettingTotalSplit,
} from "./bettingSplitsTypes";
import type { StoredBettingSplitSnapshot } from "./bettingSplitsPersistence";
import type { BettingSplitFileStore } from "./bettingSplitsFileStore";
import { toGameFileToken, writeFileAtomic } from "./bettingSplitsFsUtils";

/**
 * WU5 public browser artifacts.
 *
 * These are sanitized, deterministic projections of the private file-backed
 * history. They deliberately drop routing-only fields (`schemaVersion`,
 * `providerGameId`, storage `id`) while keeping every number and timestamp a
 * chart or table needs, including provenance so the UI can judge staleness.
 * `generatedAt` is publication time only and never stamps market data.
 */

export const BETTING_SPLITS_CURRENT_ARTIFACT_VERSION =
  "jkb-betting-splits-current-v1" as const;
export const BETTING_SPLITS_HISTORY_ARTIFACT_VERSION =
  "jkb-betting-splits-history-v1" as const;

export type PublicBettingSplitObservation = {
  provider: string;
  sportsbook: string | null;
  capturedAt: string;
  providerCreatedAt: string | null;
  providerLastSeenAt: string | null;
  firstObservedAt: string;
  lastObservedAt: string;
  contentHash: string | null;
  spread: BettingSpreadSplit | null;
  total: BettingTotalSplit | null;
  moneyline: BettingMoneylineSplit | null;
};

export type PublicBettingSplitGame = {
  league: BettingLeague;
  season: number;
  week: number | null;
  jkbGameId: string;
  awayTeamId: string;
  homeTeamId: string;
  kickoffUtc: string | null;
  books: PublicBettingSplitObservation[];
};

export type BettingSplitsCurrentArtifact = {
  schemaVersion: typeof BETTING_SPLITS_CURRENT_ARTIFACT_VERSION;
  generatedAt: string;
  games: PublicBettingSplitGame[];
};

export type BettingSplitsHistoryArtifact = {
  schemaVersion: typeof BETTING_SPLITS_HISTORY_ARTIFACT_VERSION;
  generatedAt: string;
  league: BettingLeague;
  season: number;
  jkbGameId: string;
  awayTeamId: string;
  homeTeamId: string;
  kickoffUtc: string | null;
  series: PublicBettingSplitObservation[];
};

type AnySnapshot = BettingSplitSnapshot | StoredBettingSplitSnapshot;

function compareText(left: string | null, right: string | null): number {
  return (left ?? "").localeCompare(right ?? "");
}

function compareSportsbook(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return left.localeCompare(right);
}

function observationOrder(left: AnySnapshot, right: AnySnapshot): number {
  return (
    Date.parse(left.firstObservedAt) - Date.parse(right.firstObservedAt) ||
    Date.parse(left.lastObservedAt) - Date.parse(right.lastObservedAt) ||
    compareText(left.contentHash, right.contentHash)
  );
}

function toObservation(snapshot: AnySnapshot): PublicBettingSplitObservation {
  return {
    provider: snapshot.provider,
    sportsbook: snapshot.sportsbook,
    capturedAt: snapshot.capturedAt,
    providerCreatedAt: snapshot.providerCreatedAt,
    providerLastSeenAt: snapshot.providerLastSeenAt,
    firstObservedAt: snapshot.firstObservedAt,
    lastObservedAt: snapshot.lastObservedAt,
    contentHash: snapshot.contentHash,
    spread: snapshot.spread,
    total: snapshot.total,
    moneyline: snapshot.moneyline,
  };
}

function gameKey(snapshot: AnySnapshot): string {
  return `${snapshot.league}::${snapshot.season}::${snapshot.jkbGameId}`;
}

function seriesKey(snapshot: AnySnapshot): string {
  const book = snapshot.sportsbook === null ? " consensus" : `book:${snapshot.sportsbook}`;
  return `${snapshot.provider}::${book}`;
}

function latestPerSeries(rows: readonly AnySnapshot[]): AnySnapshot[] {
  const newest = new Map<string, AnySnapshot>();
  for (const row of rows) {
    const key = `${gameKey(row)}::${seriesKey(row)}`;
    const current = newest.get(key);
    if (!current || observationOrder(current, row) < 0) newest.set(key, row);
  }
  return [...newest.values()];
}

/**
 * Build the "latest state per game / provider / sportsbook" artifact. Pass
 * `generatedAt` explicitly so the output is byte-deterministic in tests.
 */
export function buildBettingSplitsCurrentArtifact(input: {
  snapshots: readonly AnySnapshot[];
  generatedAt: string;
}): BettingSplitsCurrentArtifact {
  const byGame = new Map<string, PublicBettingSplitGame>();

  for (const snapshot of latestPerSeries(input.snapshots)) {
    const key = gameKey(snapshot);
    let game = byGame.get(key);
    if (!game) {
      game = {
        league: snapshot.league,
        season: snapshot.season,
        week: snapshot.week,
        jkbGameId: snapshot.jkbGameId,
        awayTeamId: snapshot.awayTeamId,
        homeTeamId: snapshot.homeTeamId,
        kickoffUtc: snapshot.kickoffUtc,
        books: [],
      };
      byGame.set(key, game);
    }
    game.books.push(toObservation(snapshot));
  }

  const games = [...byGame.values()]
    .map((game) => ({
      ...game,
      books: [...game.books].sort(
        (left, right) =>
          compareText(left.provider, right.provider) ||
          compareSportsbook(left.sportsbook, right.sportsbook),
      ),
    }))
    .sort((left, right) => {
      const leftKickoff = left.kickoffUtc ? Date.parse(left.kickoffUtc) : Number.POSITIVE_INFINITY;
      const rightKickoff = right.kickoffUtc ? Date.parse(right.kickoffUtc) : Number.POSITIVE_INFINITY;
      return (
        leftKickoff - rightKickoff ||
        compareText(left.jkbGameId, right.jkbGameId)
      );
    });

  return {
    schemaVersion: BETTING_SPLITS_CURRENT_ARTIFACT_VERSION,
    generatedAt: input.generatedAt,
    games,
  };
}

/**
 * Build one game's chronological history artifact. Every stored state period is
 * kept (an `A → B → A` move stays three entries); nothing is interpolated.
 */
export function buildBettingSplitsHistoryArtifact(input: {
  league: BettingLeague;
  season: number;
  jkbGameId: string;
  snapshots: readonly AnySnapshot[];
  generatedAt: string;
}): BettingSplitsHistoryArtifact {
  const relevant = input.snapshots.filter(
    (snapshot) =>
      snapshot.league === input.league &&
      snapshot.season === input.season &&
      snapshot.jkbGameId === input.jkbGameId,
  );

  const identity = relevant[0] ?? null;
  const series = [...relevant]
    .sort(
      (left, right) =>
        observationOrder(left, right) ||
        compareText(left.provider, right.provider) ||
        compareSportsbook(left.sportsbook, right.sportsbook),
    )
    .map(toObservation);

  return {
    schemaVersion: BETTING_SPLITS_HISTORY_ARTIFACT_VERSION,
    generatedAt: input.generatedAt,
    league: input.league,
    season: input.season,
    jkbGameId: input.jkbGameId,
    awayTeamId: identity?.awayTeamId ?? "",
    homeTeamId: identity?.homeTeamId ?? "",
    kickoffUtc: identity?.kickoffUtc ?? null,
    series,
  };
}

export type PublishBettingSplitsResult = {
  currentArtifactPath: string;
  historyArtifactPaths: string[];
};

/**
 * Read the whole private store and write the public artifacts under
 * `<publicRoot>/betting-splits-current.json` and
 * `<publicRoot>/betting-splits-history/<league>/<gameToken>.json`.
 */
export async function publishBettingSplitsArtifacts(input: {
  store: Pick<BettingSplitFileStore, "listAllSnapshots">;
  publicRoot: string;
  generatedAt: string;
}): Promise<PublishBettingSplitsResult> {
  const snapshots = await input.store.listAllSnapshots();
  const publicRoot = path.resolve(input.publicRoot);

  const currentArtifactPath = path.join(publicRoot, "betting-splits-current.json");
  await writeFileAtomic(
    currentArtifactPath,
    `${JSON.stringify(
      buildBettingSplitsCurrentArtifact({ snapshots, generatedAt: input.generatedAt }),
      null,
      2,
    )}\n`,
  );

  const games = new Map<string, { league: BettingLeague; season: number; jkbGameId: string }>();
  for (const snapshot of snapshots) {
    games.set(`${snapshot.league}::${snapshot.season}::${snapshot.jkbGameId}`, {
      league: snapshot.league,
      season: snapshot.season,
      jkbGameId: snapshot.jkbGameId,
    });
  }

  const historyArtifactPaths: string[] = [];
  for (const game of [...games.values()].sort(
    (left, right) =>
      left.league.localeCompare(right.league) ||
      left.season - right.season ||
      left.jkbGameId.localeCompare(right.jkbGameId),
  )) {
    const artifact = buildBettingSplitsHistoryArtifact({
      ...game,
      snapshots,
      generatedAt: input.generatedAt,
    });
    const filePath = path.join(
      publicRoot,
      "betting-splits-history",
      game.league,
      `${toGameFileToken(game.jkbGameId)}.json`,
    );
    await writeFileAtomic(filePath, `${JSON.stringify(artifact, null, 2)}\n`);
    historyArtifactPaths.push(filePath);
  }

  return { currentArtifactPath, historyArtifactPaths };
}
