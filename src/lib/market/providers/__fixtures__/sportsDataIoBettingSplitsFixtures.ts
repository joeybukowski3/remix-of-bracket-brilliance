import type { SportsDataIoBettingSplitRowDto } from "../sportsDataIoBettingSplits";

export const SPORTSDATAIO_FIXTURE_CAPTURED_AT = "2026-09-10T16:00:00.000Z";

const NFL_EVENT = {
  League: "NFL",
  Season: 2026,
  Week: 1,
  GameId: 1001,
  AwayTeamId: 7,
  AwayTeamName: "New England",
  HomeTeamId: 28,
  HomeTeamName: "Seattle",
  KickoffUtc: "2026-09-13T20:25:00-00:00",
  Sportsbook: null,
  PercentageUnit: "percent",
  Created: "2026-09-08T14:00:00-00:00",
  LastSeen: "2026-09-10T15:58:00-00:00",
} as const;

const CFB_EVENT = {
  League: "NCAA Football",
  Season: 2026,
  Week: 5,
  GameId: "cfb-2001",
  AwayTeamId: "264",
  AwayTeamName: "Away State",
  HomeTeamId: "333",
  HomeTeamName: "Home Tech",
  KickoffUtc: "2026-10-03T23:30:00Z",
  Sportsbook: null,
  PercentageUnit: "fraction",
  Created: "2026-09-28T13:00:00Z",
  LastSeen: "2026-10-01T11:57:00Z",
} as const;

export const COMPLETE_NFL_SPORTSDATAIO_ROWS = [
  { ...NFL_EVENT, MarketType: "Spread", OutcomeType: "Home", SpreadLineConvention: "team-relative", Line: -3.5, BetPercentage: 64, MoneyPercentage: 58 },
  { ...NFL_EVENT, MarketType: "Spread", OutcomeType: "Away", SpreadLineConvention: "team-relative", Line: 3.5, BetPercentage: 36, MoneyPercentage: 42 },
  { ...NFL_EVENT, MarketType: "Total", OutcomeType: "Over", Line: 45.5, BetPercentage: 57, MoneyPercentage: 61 },
  { ...NFL_EVENT, MarketType: "Total", OutcomeType: "Under", Line: 45.5, BetPercentage: 43, MoneyPercentage: 39 },
  { ...NFL_EVENT, MarketType: "Moneyline", OutcomeType: "Home", Price: -175, BetPercentage: 63, MoneyPercentage: 59 },
  { ...NFL_EVENT, MarketType: "Moneyline", OutcomeType: "Away", Price: 150, BetPercentage: 37, MoneyPercentage: 41 },
] satisfies SportsDataIoBettingSplitRowDto[];

export const COMPLETE_CFB_SPORTSDATAIO_ROWS = [
  { ...CFB_EVENT, MarketType: "Spread", OutcomeType: "Home", SpreadLineConvention: "team-relative", Line: -2.5, BetPercentage: 0.54, MoneyPercentage: 0.63 },
  { ...CFB_EVENT, MarketType: "Spread", OutcomeType: "Away", SpreadLineConvention: "team-relative", Line: 2.5, BetPercentage: 0.46, MoneyPercentage: 0.37 },
  { ...CFB_EVENT, MarketType: "Total", OutcomeType: "Over", Line: 52.5, BetPercentage: 0.47, MoneyPercentage: 0.55 },
  { ...CFB_EVENT, MarketType: "Total", OutcomeType: "Under", Line: 52.5, BetPercentage: 0.53, MoneyPercentage: 0.45 },
  { ...CFB_EVENT, MarketType: "Moneyline", OutcomeType: "Home", Price: -155, BetPercentage: 0.57, MoneyPercentage: 0.62 },
  { ...CFB_EVENT, MarketType: "Moneyline", OutcomeType: "Away", Price: 130, BetPercentage: 0.43, MoneyPercentage: 0.38 },
] satisfies SportsDataIoBettingSplitRowDto[];

export const MISSING_COMPLEMENTARY_PERCENTAGE_ROWS = [
  { ...NFL_EVENT, MarketType: "Total", OutcomeType: "Over", Line: 47.5, BetPercentage: 57, MoneyPercentage: 62 },
  { ...NFL_EVENT, MarketType: "Total", OutcomeType: "Under", Line: 47.5, BetPercentage: null, MoneyPercentage: null },
] satisfies SportsDataIoBettingSplitRowDto[];

export const ONLY_SPREAD_SPORTSDATAIO_ROWS = COMPLETE_NFL_SPORTSDATAIO_ROWS.slice(0, 2);

export const UNKNOWN_MARKET_SPORTSDATAIO_ROWS = [
  ...ONLY_SPREAD_SPORTSDATAIO_ROWS,
  { ...NFL_EVENT, MarketType: "PlayerProp", OutcomeType: "Home", BetPercentage: 51, MoneyPercentage: 55 },
] satisfies SportsDataIoBettingSplitRowDto[];

export const UNKNOWN_OUTCOME_SPORTSDATAIO_ROWS = [
  ...ONLY_SPREAD_SPORTSDATAIO_ROWS,
  { ...NFL_EVENT, MarketType: "Total", OutcomeType: "Push", Line: 45.5, BetPercentage: 1, MoneyPercentage: 1 },
] satisfies SportsDataIoBettingSplitRowDto[];

export const BAD_PERCENTAGE_SPORTSDATAIO_ROWS = [
  { ...NFL_EVENT, MarketType: "Spread", OutcomeType: "Home", SpreadLineConvention: "team-relative", Line: -3.5, BetPercentage: 101, MoneyPercentage: 58 },
] satisfies SportsDataIoBettingSplitRowDto[];

export const CONFLICTING_TOTAL_LINE_SPORTSDATAIO_ROWS = [
  { ...NFL_EVENT, MarketType: "Total", OutcomeType: "Over", Line: 45.5, BetPercentage: 57, MoneyPercentage: 61 },
  { ...NFL_EVENT, MarketType: "Total", OutcomeType: "Under", Line: 46, BetPercentage: 43, MoneyPercentage: 39 },
] satisfies SportsDataIoBettingSplitRowDto[];

export const DUPLICATE_CONFLICTING_SIDE_SPORTSDATAIO_ROWS = [
  ...ONLY_SPREAD_SPORTSDATAIO_ROWS,
  { ...NFL_EVENT, MarketType: "Spread", OutcomeType: "Home", SpreadLineConvention: "team-relative", Line: -4, BetPercentage: 66, MoneyPercentage: 60 },
] satisfies SportsDataIoBettingSplitRowDto[];

export const MULTIPLE_SPORTSBOOK_SPORTSDATAIO_ROWS = [
  ...COMPLETE_NFL_SPORTSDATAIO_ROWS.map((row) => ({ ...row, Sportsbook: "Book Alpha" })),
  ...COMPLETE_NFL_SPORTSDATAIO_ROWS.map((row) => ({
    ...row,
    Sportsbook: "Book Beta",
    BetPercentage: row.BetPercentage == null ? null : row.BetPercentage - 1,
  })),
] satisfies SportsDataIoBettingSplitRowDto[];

/** No opening field is modeled because the endpoint contract is not locally verified. */
export const PROVIDER_OPENING_VALUE_ABSENT_SPORTSDATAIO_ROWS = ONLY_SPREAD_SPORTSDATAIO_ROWS;
