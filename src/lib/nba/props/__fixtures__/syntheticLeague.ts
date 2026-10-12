/**
 * Seeded synthetic NBA-like league for minutes-model harness checks.
 *
 * It has known, injected effects (return-from-injury minutes ramp, mid-season
 * role shifts, trades, coach's-decision DNPs), so tests can check that a model
 * detects and corrects them. Results on this league are mechanism checks, not
 * evidence of real-world accuracy: the generator was written by the same
 * author as the model.
 */
import type { NbaPlayerGame, NbaTeamGame } from "../types";
import { playerGame, teamGame } from "./synthetic";

export interface SyntheticLeagueOptions {
  seed: number;
  seasons: string[];
  teams: number;
  playersPerTeam: number;
  gamesPerSeason: number;
  /** True minutes multipliers on the first games back from injury. */
  returnRamp: number[];
  injuryRatePerGame: number;
  roleShiftRatePerSeason: number;
  tradesPerSeason: number;
}

export const DEFAULT_SYNTHETIC_LEAGUE: SyntheticLeagueOptions = {
  seed: 20261012,
  seasons: ["2040-41", "2041-42", "2042-43", "2043-44"],
  teams: 8,
  playersPerTeam: 12,
  gamesPerSeason: 60,
  returnRamp: [0.72, 0.86, 0.95],
  injuryRatePerGame: 0.012,
  roleShiftRatePerSeason: 0.3,
  tradesPerSeason: 6,
};

interface SimPlayer {
  playerId: number;
  teamId: number;
  level: number;
  rates: { pts: number; reb: number; ast: number };
  injuredGamesLeft: number;
  gamesSinceReturn: number | null;
  shiftAtGame: number | null;
  shiftBy: number;
}

/** mulberry32: small, fast, deterministic. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(random: () => number, mean: number, sd: number): number {
  const u = Math.max(random(), 1e-12);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

function poisson(random: () => number, lambda: number): number {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = random();
  while (p > limit) {
    k += 1;
    p *= random();
  }
  return k;
}

const ROLE_LEVELS = [34, 33, 32, 31, 30, 25, 23, 21, 19, 12, 9, 6];
const sdFor = (level: number) => (level >= 28 ? 4 : level >= 15 ? 5 : 4);
const appearRateFor = (level: number) => (level >= 28 ? 0.97 : level >= 15 ? 0.94 : 0.8);
const clampMinutes = (value: number) => Math.min(Math.max(value, 0), 48);

function createPlayers(options: SyntheticLeagueOptions, random: () => number, teamIds: number[]): SimPlayer[] {
  return teamIds.flatMap((teamId, t) =>
    Array.from({ length: options.playersPerTeam }, (_, p) => ({
      playerId: 1000 + t * 100 + p,
      teamId,
      level: ROLE_LEVELS[p % ROLE_LEVELS.length] + normal(random, 0, 1.5),
      rates: { pts: 0.3 + 0.4 * random(), reb: 0.1 + 0.25 * random(), ast: 0.05 + 0.2 * random() },
      injuredGamesLeft: 0,
      gamesSinceReturn: null,
      shiftAtGame: null,
      shiftBy: 0,
    })),
  );
}

function startSeason(players: SimPlayer[], options: SyntheticLeagueOptions, random: () => number): void {
  for (const player of players) {
    player.level = Math.min(Math.max(player.level + normal(random, 0, 2), 4), 38);
    player.injuredGamesLeft = 0;
    player.gamesSinceReturn = null;
    const shifts = random() < options.roleShiftRatePerSeason;
    player.shiftAtGame = shifts ? 10 + Math.floor(random() * (options.gamesPerSeason - 20)) : null;
    player.shiftBy = (random() < 0.5 ? -1 : 1) * (6 + 6 * random());
  }
}

function tradePlayers(players: SimPlayer[], teamIds: number[], count: number, random: () => number): void {
  for (let i = 0; i < count; i += 1) {
    const player = players[Math.floor(random() * players.length)];
    const others = teamIds.filter((id) => id !== player.teamId);
    player.teamId = others[Math.floor(random() * others.length)];
    player.level = ROLE_LEVELS[Math.floor(random() * ROLE_LEVELS.length)] + normal(random, 0, 1.5);
  }
}

/** Advances injury state; returns the minutes multiplier if the player is available, else null. */
function availability(player: SimPlayer, options: SyntheticLeagueOptions, random: () => number): number | null {
  if (player.injuredGamesLeft > 0) {
    player.injuredGamesLeft -= 1;
    if (player.injuredGamesLeft === 0) player.gamesSinceReturn = 0;
    return null;
  }
  if (random() < options.injuryRatePerGame) {
    player.injuredGamesLeft = 3 + Math.floor(random() * 8);
    return null;
  }
  const g = player.gamesSinceReturn;
  if (g === null) return 1;
  player.gamesSinceReturn = g + 1 < options.returnRamp.length ? g + 1 : null;
  return options.returnRamp[g] ?? 1;
}

export interface SyntheticLeague {
  playerGames: NbaPlayerGame[];
  teamGames: NbaTeamGame[];
}

export function generateSyntheticLeague(options: SyntheticLeagueOptions = DEFAULT_SYNTHETIC_LEAGUE): SyntheticLeague {
  const random = seededRandom(options.seed);
  const teamIds = Array.from({ length: options.teams }, (_, i) => 1610612101 + i);
  const players = createPlayers(options, random, teamIds);
  const playerGames: NbaPlayerGame[] = [];
  const teamGames: NbaTeamGame[] = [];
  for (const season of options.seasons) {
    startSeason(players, options, random);
    const startYear = Number(season.slice(0, 4));
    const yy = String(startYear % 100).padStart(2, "0");
    let gameNumber = 0;
    for (let round = 0; round < options.gamesPerSeason; round += 1) {
      if (round === Math.floor(options.gamesPerSeason / 2)) tradePlayers(players, teamIds, options.tradesPerSeason, random);
      const gameDate = new Date(Date.UTC(startYear, 9, 20) + round * 2 * 86_400_000).toISOString().slice(0, 10);
      const order = [...teamIds].sort(() => random() - 0.5);
      for (let pair = 0; pair < order.length; pair += 2) {
        gameNumber += 1;
        const gameId = `002${yy}${String(gameNumber).padStart(5, "0")}`;
        for (const [teamId, isHome] of [[order[pair], true], [order[pair + 1], false]] as const) {
          let teamPts = 0;
          for (const player of players.filter((p) => p.teamId === teamId)) {
            if (player.shiftAtGame === round) player.level = Math.min(Math.max(player.level + player.shiftBy, 4), 38);
            const multiplier = availability(player, options, random);
            if (multiplier === null || random() > appearRateFor(player.level)) continue;
            const minutes = clampMinutes(normal(random, player.level, sdFor(player.level)) * multiplier);
            const stats = { pts: poisson(random, player.rates.pts * minutes), reb: poisson(random, player.rates.reb * minutes), ast: poisson(random, player.rates.ast * minutes) };
            teamPts += stats.pts;
            playerGames.push(playerGame({ gameId, gameDate, season, playerId: player.playerId, playerName: `Synthetic ${player.playerId}`, teamId, isHome, minutes, ...stats, oreb: 0, dreb: stats.reb, sourceSnapshotId: "synthetic" }));
          }
          teamGames.push(teamGame({ gameId, gameDate, season, teamId, isHome, pts: teamPts, sourceSnapshotId: "synthetic" }));
        }
      }
    }
  }
  return { playerGames, teamGames };
}
