import type {
  BettingSplitHistoryQuery,
  BettingSplitSnapshot,
  BettingSplitStalenessOptions,
  BettingTeamSide,
  BettingTotalSide,
} from "./bettingSplitsTypes";

function moneyMinusBets(moneyPct: number | null, betPct: number | null): number | null {
  return moneyPct === null || betPct === null ? null : moneyPct - betPct;
}

export function getSpreadMoneyMinusBets(
  snapshot: BettingSplitSnapshot,
  side: BettingTeamSide,
): number | null {
  const spread = snapshot.spread;
  if (!spread) return null;

  return side === "home"
    ? moneyMinusBets(spread.homeMoneyPct, spread.homeBetPct)
    : moneyMinusBets(spread.awayMoneyPct, spread.awayBetPct);
}

export function getTotalMoneyMinusBets(
  snapshot: BettingSplitSnapshot,
  side: BettingTotalSide,
): number | null {
  const total = snapshot.total;
  if (!total) return null;

  return side === "over"
    ? moneyMinusBets(total.overMoneyPct, total.overBetPct)
    : moneyMinusBets(total.underMoneyPct, total.underBetPct);
}

export function getMoneylineMoneyMinusBets(
  snapshot: BettingSplitSnapshot,
  side: BettingTeamSide,
): number | null {
  const moneyline = snapshot.moneyline;
  if (!moneyline) return null;

  return side === "home"
    ? moneyMinusBets(moneyline.homeMoneyPct, moneyline.homeBetPct)
    : moneyMinusBets(moneyline.awayMoneyPct, moneyline.awayBetPct);
}

export function getCurrentSpreadForTeam(
  snapshot: BettingSplitSnapshot,
  teamId: string,
): number | null {
  if (!snapshot.spread) return null;
  if (teamId === snapshot.homeTeamId) return snapshot.spread.currentHomeLine;
  if (teamId === snapshot.awayTeamId) return snapshot.spread.currentAwayLine;
  return null;
}

export function getCurrentMoneylineForTeam(
  snapshot: BettingSplitSnapshot,
  teamId: string,
): number | null {
  if (!snapshot.moneyline) return null;
  if (teamId === snapshot.homeTeamId) return snapshot.moneyline.currentHomePrice;
  if (teamId === snapshot.awayTeamId) return snapshot.moneyline.currentAwayPrice;
  return null;
}

function timestampMs(value: string | Date, fieldName: string): number {
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new RangeError(`${fieldName} must be a valid timestamp.`);
  }
  return milliseconds;
}

export function isBettingSplitSnapshotStale(
  snapshot: BettingSplitSnapshot,
  options: BettingSplitStalenessOptions,
): boolean {
  if (!Number.isFinite(options.staleAfterMs) || options.staleAfterMs < 0) {
    throw new RangeError("staleAfterMs must be a finite, non-negative number.");
  }

  const freshnessTimestamp = snapshot.providerLastSeenAt ?? snapshot.lastObservedAt;
  return timestampMs(options.referenceTime, "referenceTime")
    - timestampMs(freshnessTimestamp, "freshness timestamp")
    > options.staleAfterMs;
}

function compareText(left: string | null, right: string | null): number {
  return (left ?? "").localeCompare(right ?? "");
}

function compareSnapshots(left: BettingSplitSnapshot, right: BettingSplitSnapshot): number {
  return Date.parse(left.capturedAt) - Date.parse(right.capturedAt)
    || Date.parse(left.lastObservedAt) - Date.parse(right.lastObservedAt)
    || compareText(left.league, right.league)
    || compareText(left.jkbGameId, right.jkbGameId)
    || compareText(left.provider, right.provider)
    || compareText(left.sportsbook, right.sportsbook)
    || compareText(left.providerGameId, right.providerGameId)
    || compareText(left.contentHash, right.contentHash)
    || JSON.stringify(left).localeCompare(JSON.stringify(right));
}

export function sortBettingSplitHistory(
  snapshots: readonly BettingSplitSnapshot[],
): BettingSplitSnapshot[] {
  return [...snapshots].sort(compareSnapshots);
}

export function getLatestBettingSplitSnapshot(
  snapshots: readonly BettingSplitSnapshot[],
): BettingSplitSnapshot | null {
  const sorted = sortBettingSplitHistory(snapshots);
  return sorted[sorted.length - 1] ?? null;
}

export function getBettingSplitHistoryForGame(
  snapshots: readonly BettingSplitSnapshot[],
  query: BettingSplitHistoryQuery,
): BettingSplitSnapshot[] {
  return sortBettingSplitHistory(snapshots.filter((snapshot) => (
    snapshot.league === query.league
    && snapshot.jkbGameId === query.jkbGameId
    && (query.provider === undefined || snapshot.provider === query.provider)
    && (query.sportsbook === undefined || snapshot.sportsbook === query.sportsbook)
  )));
}
