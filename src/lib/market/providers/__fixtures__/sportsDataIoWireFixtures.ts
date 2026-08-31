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

/**
 * Verified-shape fixtures for the NFL v3 Odds `GameOddsByWeek`
 * ("Pre-Game Odds - by Week") response: an array of `GameInfo`, each carrying a
 * `PregameOdds` array of per-sportsbook `GameOdd` rows. Values are synthetic.
 *
 * Team abbreviation `AwayTeam`/`HomeTeam` and `DateTimeUTC` are present here to
 * mirror real SportsDataIO payloads (the api-evangelist mirror omits them; the
 * decoder tolerates their absence).
 */
function pregameOdd(
  sportsbook: string,
  sportsbookId: number,
  over: Partial<Record<string, number | string | null>> = {},
) {
  return {
    GameOddId: Math.floor(Math.random() * 1e7),
    Sportsbook: sportsbook,
    SportsbookId: sportsbookId,
    OddType: "pregame",
    Created: "2026-09-08T09:00:00",
    Updated: "2026-09-10T11:30:00",
    Unlisted: null,
    HomeMoneyLine: -160,
    AwayMoneyLine: 135,
    DrawMoneyLine: null,
    HomePointSpread: -3,
    AwayPointSpread: 3,
    HomePointSpreadPayout: -110,
    AwayPointSpreadPayout: -110,
    OverUnder: 44.5,
    OverPayout: -110,
    UnderPayout: -110,
    SportsbookUrl: null,
    ...over,
  };
}

export const NFL_GAME_INFO_ROW_SEA_NE = {
  ScoreId: 18001,
  Season: 2026,
  SeasonType: 1,
  Week: 1,
  Day: "2026-09-13T00:00:00",
  DateTime: "2026-09-13T16:25:00",
  DateTimeUTC: "2026-09-13T20:25:00",
  AwayTeam: "NE",
  HomeTeam: "SEA",
  AwayTeamName: "New England Patriots",
  HomeTeamName: "Seattle Seahawks",
  AwayTeamId: 7,
  HomeTeamId: 28,
  GlobalAwayTeamId: 10000007,
  GlobalHomeTeamId: 10000028,
  GlobalGameId: 10010100,
  GameId: 18001,
  Status: "Scheduled",
  PregameOdds: [
    pregameOdd("DraftKings", 7),
    pregameOdd("FanDuel", 19, { HomePointSpread: -2.5, AwayPointSpread: 2.5, OverUnder: 45 }),
  ],
  AlternateMarketPregameOdds: [],
  LiveOdds: [],
} as const;

/** Second week-1 game with only Eastern timestamps (no DateTimeUTC). */
export const NFL_GAME_INFO_ROW_KC_LAC_NO_UTC = {
  ScoreId: 18002,
  Season: 2026,
  SeasonType: 1,
  Week: 1,
  Day: "2026-09-14T00:00:00",
  DateTime: "2026-09-14T20:20:00",
  DateTimeUTC: null,
  AwayTeam: "KC",
  HomeTeam: "LAC",
  AwayTeamName: "Kansas City Chiefs",
  HomeTeamName: "Los Angeles Chargers",
  AwayTeamId: 12,
  HomeTeamId: 24,
  GlobalAwayTeamId: 10000012,
  GlobalHomeTeamId: 10000024,
  GameId: 18002,
  Status: "Scheduled",
  PregameOdds: [pregameOdd("DraftKings", 7, { HomeMoneyLine: 120, AwayMoneyLine: -142 })],
} as const;

/** A game that is NOT on the canonical fixture slate (filter test). */
export const NFL_GAME_INFO_ROW_OFF_SLATE = {
  ScoreId: 18003,
  Season: 2026,
  SeasonType: 1,
  Week: 1,
  DateTime: "2026-09-14T13:00:00",
  DateTimeUTC: "2026-09-14T17:00:00",
  AwayTeam: "DAL",
  HomeTeam: "NYG",
  AwayTeamName: "Dallas Cowboys",
  HomeTeamName: "New York Giants",
  AwayTeamId: 6,
  HomeTeamId: 26,
  GameId: 18003,
  Status: "Scheduled",
  PregameOdds: [pregameOdd("DraftKings", 7)],
} as const;

export const NFL_PRE_GAME_ODDS_BY_WEEK_PAYLOAD = [
  NFL_GAME_INFO_ROW_SEA_NE,
  NFL_GAME_INFO_ROW_KC_LAC_NO_UTC,
  NFL_GAME_INFO_ROW_OFF_SLATE,
];

/**
 * Identity shape of the **live** `GameOddsByWeek` response, verified against the
 * SportsDataIO NFL v3 Odds feed for 2026 Week 1 on 2026-08-31:
 *   - NO `AwayTeam` / `HomeTeam` abbreviation "Key";
 *   - NO `DateTimeUTC` (only the Eastern `DateTime` and date-only `Day`);
 *   - `AwayTeamName` / `HomeTeamName` populated with the SportsDataIO
 *     **abbreviation** ("SF", "LAR", "WAS"), not the full club name;
 *   - numeric `AwayTeamId` / `HomeTeamId` / `GlobalAwayTeamId` /
 *     `GlobalHomeTeamId` are SportsDataIO's own team ids.
 * Timestamps and score ids are the real Week 1 values; nothing else is stored.
 */
function liveGameInfoRow(row: {
  scoreId: number;
  awayName: string;
  homeName: string;
  awayId: number;
  homeId: number;
  day: string;
  dateTimeEastern: string;
}) {
  return {
    ScoreId: row.scoreId,
    Season: 2026,
    SeasonType: 1,
    Week: 1,
    Day: row.day,
    DateTime: row.dateTimeEastern,
    DateTimeUTC: null,
    AwayTeamName: row.awayName,
    HomeTeamName: row.homeName,
    AwayTeamId: row.awayId,
    HomeTeamId: row.homeId,
    GlobalAwayTeamId: row.awayId,
    GlobalHomeTeamId: row.homeId,
    GameId: row.scoreId,
    Status: "Scheduled",
    PregameOdds: [pregameOdd("DraftKings", 7)],
  } as const;
}

/** Live-shape ARI @ LAC (abbreviation in `AwayTeamName`, no `DateTimeUTC`). */
export const NFL_LIVE_GAME_INFO_ROW_ARI_LAC = liveGameInfoRow({
  scoreId: 19466,
  awayName: "ARI",
  homeName: "LAC",
  awayId: 1,
  homeId: 29,
  day: "2026-09-13T00:00:00",
  dateTimeEastern: "2026-09-13T16:25:00",
});

/** Live-shape WAS @ PHI, but with the documented FULL club name form. */
export const NFL_LIVE_GAME_INFO_ROW_WAS_PHI_FULLNAME = {
  ...liveGameInfoRow({
    scoreId: 19469,
    awayName: "Washington Commanders",
    homeName: "Philadelphia Eagles",
    awayId: 35,
    homeId: 26,
    day: "2026-09-13T00:00:00",
    dateTimeEastern: "2026-09-13T16:25:00",
  }),
} as const;

/**
 * All 16 live 2026 Week 1 provider identities in the live `GameOddsByWeek`
 * shape (abbreviation in `AwayTeamName` / `HomeTeamName`, Eastern `DateTime`
 * only). Real ScoreIds, team ids and kickoffs; synthetic odds.
 */
export const NFL_LIVE_GAME_ODDS_BY_WEEK_WEEK1_2026 = [
  liveGameInfoRow({ scoreId: 19454, awayName: "SF", homeName: "LAR", awayId: 31, homeId: 32, day: "2026-09-10T00:00:00", dateTimeEastern: "2026-09-10T20:35:00" }),
  liveGameInfoRow({ scoreId: 19455, awayName: "DAL", homeName: "NYG", awayId: 9, homeId: 23, day: "2026-09-13T00:00:00", dateTimeEastern: "2026-09-13T20:20:00" }),
  liveGameInfoRow({ scoreId: 19456, awayName: "DEN", homeName: "KC", awayId: 10, homeId: 16, day: "2026-09-14T00:00:00", dateTimeEastern: "2026-09-14T20:15:00" }),
  liveGameInfoRow({ scoreId: 19457, awayName: "NE", homeName: "SEA", awayId: 21, homeId: 30, day: "2026-09-09T00:00:00", dateTimeEastern: "2026-09-09T20:20:00" }),
  liveGameInfoRow({ scoreId: 19458, awayName: "CHI", homeName: "CAR", awayId: 6, homeId: 5, day: "2026-09-13T00:00:00", dateTimeEastern: "2026-09-13T13:00:00" }),
  liveGameInfoRow({ scoreId: 19459, awayName: "TB", homeName: "CIN", awayId: 33, homeId: 7, day: "2026-09-13T00:00:00", dateTimeEastern: "2026-09-13T13:00:00" }),
  liveGameInfoRow({ scoreId: 19460, awayName: "NO", homeName: "DET", awayId: 22, homeId: 11, day: "2026-09-13T00:00:00", dateTimeEastern: "2026-09-13T13:00:00" }),
  liveGameInfoRow({ scoreId: 19461, awayName: "BUF", homeName: "HOU", awayId: 4, homeId: 13, day: "2026-09-13T00:00:00", dateTimeEastern: "2026-09-13T13:00:00" }),
  liveGameInfoRow({ scoreId: 19462, awayName: "BAL", homeName: "IND", awayId: 3, homeId: 14, day: "2026-09-13T00:00:00", dateTimeEastern: "2026-09-13T13:00:00" }),
  liveGameInfoRow({ scoreId: 19463, awayName: "CLE", homeName: "JAX", awayId: 8, homeId: 15, day: "2026-09-13T00:00:00", dateTimeEastern: "2026-09-13T13:00:00" }),
  liveGameInfoRow({ scoreId: 19464, awayName: "ATL", homeName: "PIT", awayId: 2, homeId: 28, day: "2026-09-13T00:00:00", dateTimeEastern: "2026-09-13T13:00:00" }),
  liveGameInfoRow({ scoreId: 19465, awayName: "NYJ", homeName: "TEN", awayId: 24, homeId: 34, day: "2026-09-13T00:00:00", dateTimeEastern: "2026-09-13T13:00:00" }),
  NFL_LIVE_GAME_INFO_ROW_ARI_LAC,
  liveGameInfoRow({ scoreId: 19467, awayName: "MIA", homeName: "LV", awayId: 19, homeId: 25, day: "2026-09-13T00:00:00", dateTimeEastern: "2026-09-13T16:25:00" }),
  liveGameInfoRow({ scoreId: 19468, awayName: "GB", homeName: "MIN", awayId: 12, homeId: 20, day: "2026-09-13T00:00:00", dateTimeEastern: "2026-09-13T16:25:00" }),
  liveGameInfoRow({ scoreId: 19469, awayName: "WAS", homeName: "PHI", awayId: 35, homeId: 26, day: "2026-09-13T00:00:00", dateTimeEastern: "2026-09-13T16:25:00" }),
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
