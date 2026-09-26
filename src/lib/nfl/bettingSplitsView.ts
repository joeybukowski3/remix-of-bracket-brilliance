import { bettingSplitsForGame, moneyGap, publicGap, type NflDkBettingSplitsArtifact, type NflDkBettingSplitsGame, type NflDkBettingSplitsSide, type NflDkSplitsAvailability } from "./bettingSplitsData";

export type SplitsMarket = "spread" | "moneyline" | "total";
export type SplitsRow = { game: NflDkBettingSplitsGame; market: SplitsMarket; side: NflDkBettingSplitsSide; gap: number; publicGap: number };
export type SplitsSignal = "strong" | "lean" | "balanced" | "public";
export const SPLITS_SIGNAL_LABEL: Record<SplitsSignal, string> = {
  strong: "Strong Money Gap", lean: "Money Lean", balanced: "Balanced", public: "Public Heavy",
};
export const SPLITS_SIGNAL_CLASS: Record<SplitsSignal, string> = {
  strong: "bg-emerald-50 text-emerald-800", lean: "bg-emerald-50 text-emerald-700",
  balanced: "bg-slate-100 text-slate-600", public: "bg-amber-50 text-amber-800",
};

export function formatSplitsLine(market: SplitsMarket, line: number | null): string {
  if (line === null) return "—";
  return `${market === "total" ? "" : line > 0 ? "+" : ""}${line}`;
}
export function formatSplitsOdds(odds: number): string { return odds > 0 ? `+${odds}` : String(odds); }
export function formatSplitsGap(gap: number): string { return `${gap > 0 ? "+" : ""}${gap} pp`; }

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

export type CompactSplitsSide = { side: string; handlePct: number; betsPct: number; moneyGap: number; signal: SplitsSignal; sharp: boolean };
export type CompactSplitsSummary = {
  state: "fresh" | "stale" | "missing" | "unavailable";
  spread: CompactSplitsSide | null;
  moneyline: CompactSplitsSide | null;
  total: CompactSplitsSide | null;
};

/** One descriptive handle-minus-bets leader per market, joined by canonical gameId. */
export function compactSplitsForGame(
  availability: Pick<NflDkSplitsAvailability, "artifact" | "freshness">,
  gameId: string,
): CompactSplitsSummary {
  const empty = { spread: null, moneyline: null, total: null };
  if (availability.freshness === "unavailable" || !availability.artifact) return { state: "unavailable", ...empty };
  const game = bettingSplitsForGame(availability.artifact, gameId);
  if (!game) return { state: "missing", ...empty };
  const strongest = (market: SplitsMarket): CompactSplitsSide => {
    const side = [...game.markets[market]].sort((a, b) => moneyGap(b) - moneyGap(a))[0];
    const gap = moneyGap(side);
    return {
      side: side.side === "away" ? game.away.toUpperCase() : side.side === "home" ? game.home.toUpperCase() : side.side === "over" ? "Over" : "Under",
      handlePct: side.handlePct,
      betsPct: side.betsPct,
      moneyGap: gap,
      signal: splitsSignal(gap),
      sharp: gap >= SPLITS_THRESHOLDS.moneyLean,
    };
  };
  return { state: availability.freshness, spread: strongest("spread"), moneyline: strongest("moneyline"), total: strongest("total") };
}

export type SplitsMatchupRow = {
  game: NflDkBettingSplitsGame;
  spread: SplitsFavorites;
  moneyline: SplitsFavorites;
  total: SplitsFavorites;
  strongest: SplitsRow;
  strongestHandlePct: number;
  strongestBetsPct: number;
};

export type SplitsFavorites = { handle: NflDkBettingSplitsSide; bets: NflDkBettingSplitsSide };

/** Tied percentages select away before home, or Over before Under, regardless of source order. */
function favorites(game: NflDkBettingSplitsGame, market: SplitsMarket): SplitsFavorites {
  const ordered = market === "total"
    ? [sideFor(game, market, "over"), sideFor(game, market, "under")]
    : [sideFor(game, market, "away"), sideFor(game, market, "home")];
  return {
    handle: ordered[1].handlePct > ordered[0].handlePct ? ordered[1] : ordered[0],
    bets: ordered[1].betsPct > ordered[0].betsPct ? ordered[1] : ordered[0],
  };
}

function sideFor(game: NflDkBettingSplitsGame, market: SplitsMarket, side: NflDkBettingSplitsSide["side"]): NflDkBettingSplitsSide {
  const found = game.markets[market].find((entry) => entry.side === side);
  if (!found) throw new Error(`Missing ${market} ${side} side for ${game.gameId}`);
  return found;
}

/** One complete, gameId-keyed distribution with its largest absolute handle minus bets discrepancy. */
export function splitsMatchupRows(artifact: NflDkBettingSplitsArtifact): SplitsMatchupRow[] {
  return artifact.games.map((game) => {
    const sides = (["spread", "moneyline", "total"] as const).flatMap((market) =>
      game.markets[market].map((side): SplitsRow => ({ game, market, side, gap: moneyGap(side), publicGap: publicGap(side) })));
    // Equal absolute gaps prefer the positive side, then market/side name; artifact order never breaks ties.
    const strongest = [...sides].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap) || b.gap - a.gap || stable(a, b))[0];
    return {
      game,
      spread: favorites(game, "spread"),
      moneyline: favorites(game, "moneyline"),
      total: favorites(game, "total"),
      strongest,
      strongestHandlePct: Math.max(...sides.map((row) => row.side.handlePct)),
      strongestBetsPct: Math.max(...sides.map((row) => row.side.betsPct)),
    };
  });
}

export type SplitsMatchupSortKey = "gap" | "matchup" | "handlePct" | "betsPct";
export function sortSplitsMatchupRows(rows: readonly SplitsMatchupRow[], key: SplitsMatchupSortKey, direction: "asc" | "desc"): SplitsMatchupRow[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const comparison = key === "matchup" ? `${a.game.away}:${a.game.home}`.localeCompare(`${b.game.away}:${b.game.home}`)
      : key === "gap" ? Math.abs(a.strongest.gap) - Math.abs(b.strongest.gap)
        : key === "handlePct" ? a.strongestHandlePct - b.strongestHandlePct : a.strongestBetsPct - b.strongestBetsPct;
    return comparison * factor || a.game.gameId.localeCompare(b.game.gameId);
  });
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
