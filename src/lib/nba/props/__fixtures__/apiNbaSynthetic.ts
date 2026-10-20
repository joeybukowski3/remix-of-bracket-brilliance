/**
 * Synthetic API-NBA v2-shaped payloads with invented ids, names and values.
 * Shapes follow API-Sports' public docs; nothing here came from a live response.
 */
export const HOME = { id: 9101, code: "HME", name: "Home Synthetics" };
export const AWAY = { id: 9102, code: "AWY", name: "Away Synthetics" };
export const PROBE_GAME_ID = 777001;
export const EARLIER_GAME_ID = 777000;

/** 2024-01-16T00:30Z is 2024-01-15 19:30 in New York. */
export const syntheticGames = [
  {
    id: 776999,
    season: 2023,
    stage: 1,
    date: { start: "2023-10-10T23:00:00.000Z" },
    status: { long: "Finished", short: 3 },
    periods: { total: 4 },
    teams: { home: HOME, visitors: AWAY },
    scores: { home: { points: 99 }, visitors: { points: 98 } },
  },
  {
    id: EARLIER_GAME_ID,
    season: 2023,
    stage: 2,
    date: { start: "2023-12-01T00:00:00.000Z" },
    status: { long: "Finished", short: 3 },
    periods: { total: 4 },
    teams: { home: HOME, visitors: AWAY },
    scores: { home: { points: 101 }, visitors: { points: 95 } },
  },
  {
    id: PROBE_GAME_ID,
    season: 2023,
    stage: 2,
    date: { start: "2024-01-16T00:30:00.000Z" },
    status: { long: "Finished", short: 3 },
    periods: { total: 4 },
    teams: { home: HOME, visitors: AWAY },
    scores: { home: { points: 110 }, visitors: { points: 100 } },
  },
];

const MINUTES = ["36:30", "35:30", "34:00", "32:00", "30:00", "28:00", "24:00", "20:00"];
const HOME_POINTS = [20, 18, 16, 14, 14, 12, 10, 6];
const AWAY_POINTS = [20, 16, 14, 14, 12, 10, 8, 6];

function playerRow(playerId: number, team: typeof HOME, gameId: number, min: string | null, points: number | null, comment: string | null = null) {
  const stat = (v: number) => (points === null ? null : v);
  return {
    player: { id: playerId, firstname: "Synth", lastname: `Player${playerId}` },
    team,
    game: { id: gameId },
    points,
    pos: "G",
    min,
    fgm: stat(5), fga: stat(10), fgp: "50.0",
    ftm: stat(2), fta: stat(2), ftp: "100",
    tpm: stat(1), tpa: stat(3), tpp: "33.3",
    offReb: stat(1), defReb: stat(3), totReb: stat(4),
    assists: stat(3), pFouls: stat(2), steals: stat(1), turnovers: stat(1), blocks: stat(0),
    plusMinus: points === null ? null : "+5",
    comment,
  };
}

export function gamePlayerRows(gameId = PROBE_GAME_ID) {
  return [
    ...MINUTES.map((min, i) => playerRow(900001 + i, HOME, gameId, min, HOME_POINTS[i])),
    playerRow(900020, HOME, gameId, null, null, "DNP - Coach's Decision"),
    ...MINUTES.map((min, i) => playerRow(900101 + i, AWAY, gameId, min, AWAY_POINTS[i])),
    playerRow(900120, AWAY, gameId, null, null, "Inactive - Injury/Illness"),
  ];
}

const teamBox = (team: typeof HOME, points: number) => ({
  team,
  statistics: [{ points, fgm: 40, fga: 80, ftm: 16, fta: 16, tpm: 8, tpa: 24, offReb: 8, defReb: 24, totReb: 32, assists: 24, pFouls: 16, steals: 8, turnovers: 8, blocks: 0, plusMinus: "+10", min: "240:00" }],
});

export const gameTeamRows = () => [teamBox(HOME, 110), teamBox(AWAY, 100)];

export const teamSeasonRows = () => [...gamePlayerRows(EARLIER_GAME_ID), ...gamePlayerRows(PROBE_GAME_ID)].filter((r) => r.team.id === HOME.id);

export const envelope = (get: string, response: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ get, parameters: {}, errors: [], results: response.length, response, ...extra });

export const statusBody = (current: number, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    get: "status",
    parameters: [],
    errors: [],
    results: 1,
    response: {
      account: { firstname: "Synthetic", lastname: "Owner", email: "owner@example.invalid" },
      subscription: { plan: "Free", end: "2027-01-01T00:00:00+00:00", active: true },
      requests: { current, limit_day: 100 },
      ...extra,
    },
  });
