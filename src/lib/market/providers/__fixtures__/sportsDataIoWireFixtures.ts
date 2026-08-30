/**
 * Verified-shape fixtures for the WU6 SportsDataIO discovery + wire decoders.
 *
 * Field names and nesting mirror the SportsDataIO NFL v3 Scores `Score` schema
 * and NFL v3 Odds `GameBettingSplit` / `BettingMarketSplit` / `BettingSplit`
 * schemas (api-evangelist/sportsdataio OpenAPI, retrieved 2026-08-30). Values are
 * synthetic. No real API response is stored.
 */

/** One row of a `ScoresByWeek` response (NFL week 1, 2026). */
export const NFL_SCORE_ROW_SEA_NE = {
  GameKey: "202610100",
  SeasonType: 1,
  Season: 2026,
  Week: 1,
  Date: "2026-09-13T16:25:00",
  AwayTeam: "NE",
  HomeTeam: "SEA",
  AwayTeamID: 7,
  HomeTeamID: 28,
  GlobalGameID: 10010100,
  GlobalAwayTeamID: 10000007,
  GlobalHomeTeamID: 10000028,
  Day: "2026-09-13T00:00:00",
  DateTime: "2026-09-13T16:25:00",
  DateTimeUTC: "2026-09-13T20:25:00",
  Status: "Scheduled",
  StadiumID: 39,
  ScoreID: 18001,
} as const;

/** A second week-1 game with only Eastern timestamps (no DateTimeUTC). */
export const NFL_SCORE_ROW_KC_LAC_NO_UTC = {
  SeasonType: 1,
  Season: 2026,
  Week: 1,
  Date: "2026-09-14T20:20:00",
  AwayTeam: "KC",
  HomeTeam: "LAC",
  AwayTeamID: 12,
  HomeTeamID: 24,
  Day: "2026-09-14T00:00:00",
  DateTime: "2026-09-14T20:20:00",
  DateTimeUTC: null,
  Status: "Scheduled",
  ScoreID: 18002,
} as const;

/** A game that is NOT on the canonical fixture slate (used for filter tests). */
export const NFL_SCORE_ROW_OFF_SLATE = {
  SeasonType: 1,
  Season: 2026,
  Week: 1,
  Date: "2026-09-14T13:00:00",
  AwayTeam: "DAL",
  HomeTeam: "NYG",
  AwayTeamID: 6,
  HomeTeamID: 26,
  DateTime: "2026-09-14T13:00:00",
  DateTimeUTC: "2026-09-14T17:00:00",
  Status: "Scheduled",
  ScoreID: 18003,
} as const;

export const NFL_SCORES_BY_WEEK_PAYLOAD = [
  NFL_SCORE_ROW_SEA_NE,
  NFL_SCORE_ROW_KC_LAC_NO_UTC,
  NFL_SCORE_ROW_OFF_SLATE,
];

function fullGameSplit(
  betType: string,
  splits: Array<{
    BettingOutcomeType: string;
    BetPercentage: number | null;
    MoneyPercentage: number | null;
  }>,
) {
  return {
    BettingMarketID: Math.floor(Math.random() * 1e6),
    BettingEventID: 500123,
    BettingMarketTypeID: 1,
    BettingMarketType: "Game Line",
    BettingBetTypeID: 1,
    BettingBetType: betType,
    BettingPeriodTypeID: 1,
    BettingPeriodType: "Full Game",
    TeamID: null,
    TeamKey: null,
    PlayerID: null,
    PlayerName: null,
    BettingSplits: splits.map((split) => ({
      BettingMarketSplitID: Math.floor(Math.random() * 1e6),
      BettingMarketID: 1,
      BettingOutcomeTypeID: 1,
      ...split,
      Created: "2026-09-08T10:00:00",
      LastSeen: "2026-09-10T11:58:00",
    })),
  };
}

/** A complete verified `GameBettingSplit` for ScoreID 18001 (SEA vs NE). */
export const NFL_GAME_BETTING_SPLIT_18001 = {
  ScoreId: 18001,
  GameKey: "202610100",
  SeasonType: 1,
  Season: 2026,
  Week: 1,
  Date: "2026-09-13T16:25:00",
  AwayTeam: "NE",
  HomeTeam: "SEA",
  BettingMarketSplits: [
    fullGameSplit("Spread", [
      { BettingOutcomeType: "Home", BetPercentage: 64, MoneyPercentage: 58 },
      { BettingOutcomeType: "Away", BetPercentage: 36, MoneyPercentage: 42 },
    ]),
    fullGameSplit("Moneyline", [
      { BettingOutcomeType: "Home", BetPercentage: 63, MoneyPercentage: 59 },
      { BettingOutcomeType: "Away", BetPercentage: 37, MoneyPercentage: 41 },
    ]),
    fullGameSplit("Total Points", [
      { BettingOutcomeType: "Over", BetPercentage: 57, MoneyPercentage: 61 },
      { BettingOutcomeType: "Under", BetPercentage: 43, MoneyPercentage: 39 },
    ]),
    // Noise the decoder must skip:
    {
      ...fullGameSplit("Passing Yards", [
        { BettingOutcomeType: "Over", BetPercentage: 55, MoneyPercentage: 55 },
      ]),
      BettingMarketType: "Player Prop",
      PlayerID: 900123,
      PlayerName: "Sample Quarterback",
    },
    {
      ...fullGameSplit("Spread", [
        { BettingOutcomeType: "Home", BetPercentage: 50, MoneyPercentage: 50 },
      ]),
      BettingPeriodType: "1st Half",
    },
  ],
};

/** ScoreID 18002 (KC vs LAC) — spread + total only, no moneyline. */
export const NFL_GAME_BETTING_SPLIT_18002 = {
  ScoreId: 18002,
  SeasonType: 1,
  Season: 2026,
  Week: 1,
  Date: "2026-09-14T20:20:00",
  AwayTeam: "KC",
  HomeTeam: "LAC",
  BettingMarketSplits: [
    fullGameSplit("Spread", [
      { BettingOutcomeType: "Home", BetPercentage: 45, MoneyPercentage: 40 },
      { BettingOutcomeType: "Away", BetPercentage: 55, MoneyPercentage: 60 },
    ]),
    fullGameSplit("Total Points", [
      { BettingOutcomeType: "Over", BetPercentage: 52, MoneyPercentage: 54 },
      { BettingOutcomeType: "Under", BetPercentage: 48, MoneyPercentage: 46 },
    ]),
  ],
};
