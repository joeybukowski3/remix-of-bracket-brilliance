import path from "node:path";
import { toGameFileToken, writeFileAtomic } from "./bettingLineFsUtils";
import type { BettingLineFileStore } from "./bettingLineFileStore";
import type {
  BettingLineLeague,
  BettingLineMoneyline,
  BettingLineSnapshot,
  BettingLineSpread,
  BettingLineTotal,
  StoredBettingLineSnapshot,
} from "./bettingLineTypes";

/**
 * WU8 browser-safe artifacts. Sanitized, deterministic projections of the
 * private JSONL history: routing-only fields (`schemaVersion`, storage `id`)
 * are dropped; every price, line, timestamp and the provider/sportsbook
 * attribution are kept. `generatedAt` is publication time only and never stamps
 * market data. No raw provider response is ever exposed.
 */

export const BETTING_LINES_CURRENT_ARTIFACT_VERSION =
  "jkb-betting-lines-current-v1" as const;
export const BETTING_LINES_HISTORY_ARTIFACT_VERSION =
  "jkb-betting-lines-history-v1" as const;

export type PublicBettingLineObservation = {
  provider: string;
  providerEventId: string;
  sportsbook: string;
  capturedAt: string;
  providerUpdatedAt: string | null;
  firstObservedAt: string;
  lastObservedAt: string;
  contentHash: string | null;
  spread: BettingLineSpread | null;
  total: BettingLineTotal | null;
  moneyline: BettingLineMoneyline | null;
};

export type PublicBettingLineGame = {
  league: BettingLineLeague;
  season: number;
  week: number | null;
  jkbGameId: string;
  awayTeamId: string;
  homeTeamId: string;
  kickoffUtc: string | null;
  books: PublicBettingLineObservation[];
};

export type BettingLinesCurrentArtifact = {
  schemaVersion: typeof BETTING_LINES_CURRENT_ARTIFACT_VERSION;
  generatedAt: string;
  games: PublicBettingLineGame[];
};

export type BettingLinesHistoryArtifact = {
  schemaVersion: typeof BETTING_LINES_HISTORY_ARTIFACT_VERSION;
  generatedAt: string;
  league: BettingLineLeague;
  season: number;
  jkbGameId: string;
  awayTeamId: string;
  homeTeamId: string;
  kickoffUtc: string | null;
  series: PublicBettingLineObservation[];
};

type AnySnapshot = BettingLineSnapshot | StoredBettingLineSnapshot;

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}

function observationOrder(left: AnySnapshot, right: AnySnapshot): number {
  return (
    Date.parse(left.firstObservedAt) - Date.parse(right.firstObservedAt) ||
    Date.parse(left.lastObservedAt) - Date.parse(right.lastObservedAt) ||
    compareText(left.contentHash ?? "", right.contentHash ?? "")
  );
}

function toObservation(snapshot: AnySnapshot): PublicBettingLineObservation {
  return {
    provider: snapshot.provider,
    providerEventId: snapshot.providerEventId,
    sportsbook: snapshot.sportsbook,
    capturedAt: snapshot.capturedAt,
    providerUpdatedAt: snapshot.providerUpdatedAt,
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
  return `${snapshot.provider}::${snapshot.sportsbook}`;
}

export function buildBettingLinesCurrentArtifact(input: {
  snapshots: readonly AnySnapshot[];
  generatedAt: string;
}): BettingLinesCurrentArtifact {
  const latest = new Map<string, AnySnapshot>();
  for (const snapshot of input.snapshots) {
    const key = `${gameKey(snapshot)}::${seriesKey(snapshot)}`;
    const current = latest.get(key);
    if (!current || observationOrder(current, snapshot) < 0) latest.set(key, snapshot);
  }

  const byGame = new Map<string, PublicBettingLineGame>();
  for (const snapshot of latest.values()) {
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
          compareText(left.sportsbook, right.sportsbook),
      ),
    }))
    .sort((left, right) => {
      const leftKickoff = left.kickoffUtc ? Date.parse(left.kickoffUtc) : Number.POSITIVE_INFINITY;
      const rightKickoff = right.kickoffUtc ? Date.parse(right.kickoffUtc) : Number.POSITIVE_INFINITY;
      return (
        leftKickoff - rightKickoff ||
        compareText(left.league, right.league) ||
        compareText(left.jkbGameId, right.jkbGameId)
      );
    });

  return {
    schemaVersion: BETTING_LINES_CURRENT_ARTIFACT_VERSION,
    generatedAt: input.generatedAt,
    games,
  };
}

export function buildBettingLinesHistoryArtifact(input: {
  league: BettingLineLeague;
  season: number;
  jkbGameId: string;
  snapshots: readonly AnySnapshot[];
  generatedAt: string;
}): BettingLinesHistoryArtifact {
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
        compareText(left.sportsbook, right.sportsbook),
    )
    .map(toObservation);

  return {
    schemaVersion: BETTING_LINES_HISTORY_ARTIFACT_VERSION,
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

export type PublishBettingLinesResult = {
  currentArtifactPath: string;
  historyArtifactPaths: string[];
};

export async function publishBettingLineArtifacts(input: {
  store: Pick<BettingLineFileStore, "listAllSnapshots">;
  publicRoot: string;
  generatedAt: string;
}): Promise<PublishBettingLinesResult> {
  const snapshots = await input.store.listAllSnapshots();
  const publicRoot = path.resolve(input.publicRoot);

  const currentArtifactPath = path.join(publicRoot, "betting-lines-current.json");
  await writeFileAtomic(
    currentArtifactPath,
    `${JSON.stringify(
      buildBettingLinesCurrentArtifact({ snapshots, generatedAt: input.generatedAt }),
      null,
      2,
    )}\n`,
  );

  const games = new Map<
    string,
    { league: BettingLineLeague; season: number; jkbGameId: string }
  >();
  for (const snapshot of snapshots) {
    games.set(gameKey(snapshot), {
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
    const artifact = buildBettingLinesHistoryArtifact({
      ...game,
      snapshots,
      generatedAt: input.generatedAt,
    });
    const filePath = path.join(
      publicRoot,
      "betting-lines-history",
      game.league,
      `${toGameFileToken(game.jkbGameId)}.json`,
    );
    await writeFileAtomic(filePath, `${JSON.stringify(artifact, null, 2)}\n`);
    historyArtifactPaths.push(filePath);
  }

  return { currentArtifactPath, historyArtifactPaths };
}
