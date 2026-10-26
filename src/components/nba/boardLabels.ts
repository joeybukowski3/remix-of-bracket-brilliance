import type { BoardMarket, BoardSortKey } from "@/lib/nba/props/propsBoard";
import { marketRates, type SeasonBasis } from "@/lib/nba/props/seasonStats";

export const MARKET_LABEL: Record<BoardMarket, string> = { pts: "Points", reb: "Rebounds", ast: "Assists" };

export interface SeasonColumnDef {
  sortKey: BoardSortKey;
  label: string;
  title: string;
  digits: number;
  pick: (basis: SeasonBasis) => number | null;
}

/** Season figures shown in a market view: MPG, PPG and PTS/min always, then the market's own per-game and per-minute figures. */
export function seasonColumnDefs(market: BoardMarket): SeasonColumnDef[] {
  const base: SeasonColumnDef[] = [
    { sortKey: "seasonMpg", label: "MPG", title: "Minutes per game", digits: 1, pick: (b) => b.mpg },
    { sortKey: "seasonPpg", label: "PPG", title: "Points per game", digits: 1, pick: (b) => b.ppg },
    { sortKey: "seasonPtsPerMinute", label: "PTS/min", title: "Points per minute played", digits: 2, pick: (b) => b.ptsPerMinute },
  ];
  if (market === "reb") {
    return [...base, { sortKey: "seasonStatPerGame", label: "RPG", title: "Rebounds per game", digits: 1, pick: (b) => marketRates(b, "reb").perGame }, { sortKey: "seasonStatPerMinute", label: "REB/min", title: "Rebounds per minute played", digits: 2, pick: (b) => marketRates(b, "reb").perMinute }];
  }
  if (market === "ast") {
    return [...base, { sortKey: "seasonStatPerGame", label: "APG", title: "Assists per game", digits: 1, pick: (b) => marketRates(b, "ast").perGame }, { sortKey: "seasonStatPerMinute", label: "AST/min", title: "Assists per minute played", digits: 2, pick: (b) => marketRates(b, "ast").perMinute }];
  }
  return base;
}

