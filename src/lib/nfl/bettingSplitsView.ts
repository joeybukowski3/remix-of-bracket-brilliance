import { moneyGap, publicGap, type NflDkBettingSplitsArtifact, type NflDkBettingSplitsGame, type NflDkBettingSplitsSide } from "./bettingSplitsData";

export type SplitsMarket = "spread" | "moneyline" | "total";
export type SplitsRow = { game: NflDkBettingSplitsGame; market: SplitsMarket; side: NflDkBettingSplitsSide; gap: number; publicGap: number };
export type SplitsSignal = "strong" | "lean" | "balanced" | "public";

/** Percentage-point thresholds for descriptive display only; no predictive meaning. */
export const SPLITS_THRESHOLDS = {
  strongMoneyGap: 20,
  moneyLean: 10,
  publicHeavy: -10,
  contrarianMaxBetsExclusive: 40,
  contrarianMinHandleExclusive: 50,
  consensusMinBets: 70,
  consensusMinHandle: 70,
} as const;

export function splitsSignal(gap: number): SplitsSignal {
  if (gap >= SPLITS_THRESHOLDS.strongMoneyGap) return "strong";
  if (gap >= SPLITS_THRESHOLDS.moneyLean) return "lean";
  if (gap <= SPLITS_THRESHOLDS.publicHeavy) return "public";
  return "balanced";
}

export function splitsRows(artifact: NflDkBettingSplitsArtifact, market?: SplitsMarket): SplitsRow[] {
  const markets: SplitsMarket[] = market ? [market] : ["spread", "moneyline", "total"];
  return artifact.games.flatMap((game) => markets.flatMap((name) => game.markets[name].map((side) => ({
    game, market: name, side, gap: moneyGap(side), publicGap: publicGap(side),
  }))));
}

const stable = (a: SplitsRow, b: SplitsRow) => a.game.gameId.localeCompare(b.game.gameId) || a.market.localeCompare(b.market) || a.side.side.localeCompare(b.side.side);
export function biggestMoneyGap(rows: readonly SplitsRow[]): SplitsRow[] {
  // One side per game/market keeps complementary percentages from duplicating a rank.
  const unique = new Map<string, SplitsRow>();
  for (const row of rows) {
    const key = `${row.game.gameId}:${row.market}`;
    if (!unique.has(key) || row.gap > unique.get(key)!.gap) unique.set(key, row);
  }
  return [...unique.values()].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap) || stable(a, b));
}
export const publicSides = (rows: readonly SplitsRow[]) => [...rows].sort((a, b) => b.side.betsPct - a.side.betsPct || stable(a, b));
export const sharpSides = (rows: readonly SplitsRow[]) => rows.filter((row) => row.gap >= SPLITS_THRESHOLDS.moneyLean).sort((a, b) => b.gap - a.gap || stable(a, b));
export const contrarianSides = (rows: readonly SplitsRow[]) => rows.filter((row) => row.side.betsPct < SPLITS_THRESHOLDS.contrarianMaxBetsExclusive && row.side.handlePct > SPLITS_THRESHOLDS.contrarianMinHandleExclusive).sort((a, b) => b.gap - a.gap || stable(a, b));
export const consensusSides = (rows: readonly SplitsRow[]) => rows.filter((row) => row.side.betsPct >= SPLITS_THRESHOLDS.consensusMinBets && row.side.handlePct >= SPLITS_THRESHOLDS.consensusMinHandle).sort((a, b) => b.side.betsPct + b.side.handlePct - a.side.betsPct - a.side.handlePct || stable(a, b));

export type SplitsSortKey = "handlePct" | "betsPct" | "gap" | "line" | "odds";
export function sortSplitsRows(rows: readonly SplitsRow[], key: SplitsSortKey, direction: "asc" | "desc"): SplitsRow[] {
  const value = (row: SplitsRow) => key === "gap" ? row.gap : key === "line" ? row.side.line ?? 0 : row.side[key];
  return [...rows].sort((a, b) => (value(a) - value(b)) * (direction === "asc" ? 1 : -1) || stable(a, b));
}
