// CFB Model V2 Phase 6 — market comparison + edge calibration research.
// Consumes ONLY frozen Phase 5 model outputs (expectedHome/Away points,
// projectedMargin/Total, P(win), margin/total distributions) plus raw
// historical market lines (Work Unit 2). This is the ONE place in the
// entire research tree allowed to import market-line data — see
// architectureGuard.test.ts, which proves Phase 0-5 never import Phase 6
// and Phase 6 never writes back into any Phase 0-5 output.

export type CfbLineSemantic = "OPEN" | "LATEST_OBSERVED";

/** One (game, provider) market row, joined with the frozen Phase 5 model output for that game. */
export type MarketModelJoinRow = {
  gameId: string;
  season: number;
  week: number;
  provider: string;
  homeTeamExternalId: string;
  awayTeamExternalId: string;

  // Frozen Phase 5 outputs (never modified by anything in this module).
  modelExpectedHome: number;
  modelExpectedAway: number;
  modelProjectedMargin: number;
  modelProjectedTotal: number;
  modelPHomeWin: number;
  homeResidualPool: readonly number[];
  awayResidualPool: readonly number[];

  actualHomePoints: number;
  actualAwayPoints: number;
  actualMargin: number;
  actualTotal: number;

  spreadOpen: number | null;
  spreadLatestObserved: number | null;
  totalOpen: number | null;
  totalLatestObserved: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
};

export type SpreadEdgeRow = {
  gameId: string;
  season: number;
  week: number;
  provider: string;
  semantic: CfbLineSemantic;
  marketSpread: number; // home-team spread, negative = home favored (verified sign convention)
  marketImpliedHomeMargin: number; // = -marketSpread
  homeSpreadEdgePoints: number; // modelProjectedMargin - marketImpliedHomeMargin; positive = model likes home more than market
  pHomeCover: number;
  pAwayCover: number;
  pPush: number;
  homeCovered: boolean | null; // null = push
  modelPHomeWin: number;
};

export type TotalEdgeRow = {
  gameId: string;
  season: number;
  week: number;
  provider: string;
  semantic: CfbLineSemantic;
  marketTotal: number;
  totalEdgePoints: number; // modelProjectedTotal - marketTotal
  pOver: number;
  pUnder: number;
  wentOver: boolean | null; // null = push (exact match)
};

export type MoneylineEdgeRow = {
  gameId: string;
  season: number;
  week: number;
  provider: string;
  homeMoneyline: number;
  awayMoneyline: number;
  homeImpliedProbRaw: number;
  awayImpliedProbRaw: number;
  overround: number;
  homeImpliedProbFair: number;
  awayImpliedProbFair: number;
  modelPHomeWin: number;
  homeProbabilityEdge: number; // modelPHomeWin - homeImpliedProbFair
  homeEv: number; // modelPHomeWin * decimalOdds(homeMoneyline) - 1
  awayEv: number;
  homeWon: boolean;
};
