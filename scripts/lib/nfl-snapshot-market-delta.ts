/**
 * WU3.2 -- pure, deterministic market-delta computation. Input is always a
 * SnapshotMarketState already derived from JKB's deterministic market
 * artifact (scripts/lib/nfl-full-game-context.ts's GameContextMarket via
 * buildMarketSection) -- this module never fetches or re-derives a market
 * read itself, and no future AI model is ever asked to report line
 * movement; it is always computed here from real snapshot state.
 */

import type { SnapshotMarketRecord, SnapshotMarketState } from "./nfl-snapshot-types";

function numericDelta(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  return current - previous;
}

/**
 * Builds the full SnapshotMarketRecord (current state + delta against the
 * previous snapshot's market state) for one new snapshot. `previous` is
 * null for an "initial" snapshot -- every delta/previous field resolves to
 * null/false in that case, never a fabricated zero.
 */
export function computeMarketDelta(previous: SnapshotMarketState | null, current: SnapshotMarketState): SnapshotMarketRecord {
  if (!previous) {
    return {
      ...current,
      previousSpread: null,
      previousTotal: null,
      spreadDelta: null,
      totalDelta: null,
      moneylineHomeDelta: null,
      moneylineAwayDelta: null,
      sportsbookChanged: false,
      asOfDeltaMs: null,
    };
  }

  const previousAsOfMs = previous.asOf != null ? Date.parse(previous.asOf) : NaN;
  const currentAsOfMs = current.asOf != null ? Date.parse(current.asOf) : NaN;
  const asOfDeltaMs = Number.isFinite(previousAsOfMs) && Number.isFinite(currentAsOfMs) ? currentAsOfMs - previousAsOfMs : null;

  return {
    ...current,
    previousSpread: { ...previous.spread },
    previousTotal: previous.total.line,
    spreadDelta: numericDelta(current.spread.homeLine, previous.spread.homeLine),
    totalDelta: numericDelta(current.total.line, previous.total.line),
    moneylineHomeDelta: numericDelta(current.moneyline?.homePrice ?? null, previous.moneyline?.homePrice ?? null),
    moneylineAwayDelta: numericDelta(current.moneyline?.awayPrice ?? null, previous.moneyline?.awayPrice ?? null),
    sportsbookChanged: previous.sportsbook !== current.sportsbook,
    asOfDeltaMs,
  };
}
