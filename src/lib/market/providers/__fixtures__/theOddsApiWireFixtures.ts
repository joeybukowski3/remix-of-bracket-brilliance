/**
 * Hand-built The Odds API v4 `/odds` payload fixtures. Shaped exactly like the
 * documented response (retrieved 2026-08-31): Event[] with bookmakers ->
 * markets -> outcomes, bookmaker-level `last_update`, american prices.
 */

export const THE_ODDS_API_NFL_ODDS_FIXTURE = [
  {
    id: "evt-nfl-1",
    sport_key: "americanfootball_nfl",
    sport_title: "NFL",
    commence_time: "2026-09-07T17:00:00Z",
    home_team: "Seattle Seahawks",
    away_team: "New England Patriots",
    bookmakers: [
      {
        key: "draftkings",
        title: "DraftKings",
        last_update: "2026-09-01T06:02:11Z",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: "Seattle Seahawks", price: -140 },
              { name: "New England Patriots", price: 120 },
            ],
          },
          {
            key: "spreads",
            outcomes: [
              { name: "Seattle Seahawks", price: -110, point: -2.5 },
              { name: "New England Patriots", price: -110, point: 2.5 },
            ],
          },
          {
            key: "totals",
            outcomes: [
              { name: "Over", price: -108, point: 44.5 },
              { name: "Under", price: -112, point: 44.5 },
            ],
          },
        ],
      },
      {
        key: "fanduel",
        title: "FanDuel",
        last_update: "2026-09-01T06:00:00Z",
        markets: [
          {
            key: "spreads",
            outcomes: [
              { name: "Seattle Seahawks", price: -115, point: -3 },
              { name: "New England Patriots", price: -105, point: 3 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "evt-nfl-2",
    sport_key: "americanfootball_nfl",
    sport_title: "NFL",
    commence_time: "2026-09-07T20:25:00Z",
    home_team: "San Francisco 49ers",
    away_team: "Los Angeles Rams",
    bookmakers: [
      {
        key: "draftkings",
        title: "DraftKings",
        last_update: "2026-09-01T06:03:00Z",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: "San Francisco 49ers", price: -160 },
              { name: "Los Angeles Rams", price: 135 },
            ],
          },
        ],
      },
    ],
  },
] as const;
