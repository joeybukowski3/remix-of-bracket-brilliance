/**
 * Seeded synthetic league for the Phase 4A evaluation framework.
 *
 * Invented ids and values only. It injects, with known truth, every mechanism
 * the framework must handle:
 *   - pregame availability snapshots (usable) AND later leaky ones, dated
 *     after the feature cutoff, that reveal the true status;
 *   - zero-minute DNP rows, post-game final statuses, and absences that are
 *     deliberately left unestablished;
 *   - mid-season trades, a neutral-site game, a scheduled game whose results
 *     are missing, and tipoffs whose UTC date differs from the Eastern date.
 *
 * Results on it are mechanism checks, not evidence of real-world accuracy:
 * the generator and the models share an author.
 */
import type { NbaAvailabilityRecord } from "../sources/types";
import type { EvaluationDataset, FinalStatusRecord, ScheduledGame } from "../evaluation/types";
import type { NbaPlayerGame, NbaTeamGame } from "../types";
import { seededRandom } from "./syntheticLeague";
import { playerGame, teamGame } from "./synthetic";

export const EVALUATION_FIXTURE_VERSION = "synthetic-eval-league-v1";
export const EVALUATION_GENERATOR = "generateEvaluationLeague";

export interface EvaluationLeagueOptions {
  seed: number;
  seasons: string[];
  teams: number;
  playersPerTeam: number;
  rounds: number;
  tradesPerSeason: number;
}

export const DEFAULT_EVALUATION_LEAGUE: EvaluationLeagueOptions = {
  seed: 20261019,
  seasons: ["2060-61", "2061-62"],
  teams: 8,
  playersPerTeam: 11,
  rounds: 40,
  tradesPerSeason: 3,
};

const ROLE_LEVELS = [34, 32, 31, 29, 26, 23, 20, 17, 13, 9, 6];
const TIP_TIMES_ET: ReadonlyArray<readonly [number, number]> = [[19, 0], [19, 30], [20, 0], [22, 0], [22, 30]];
const MINUTE_MS = 60_000;
const INJURY_RATE = 0.02;
const REST_RATE = 0.04;
const MISSING_PREGAME_RATE = 0.08;
const UNESTABLISHED_RATE = 0.08;
const RETURN_RAMP = [0.75, 0.9];
/** Pregame snapshot lead; later than this is "late" under the default 90-minute cutoff. */
const PREGAME_SNAPSHOT_MINUTES = 120;
const LATE_SNAPSHOT_MINUTES = 30;

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

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Eastern offset in hours (-4 or -5) on a calendar date. */
function etOffsetHours(date: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" }).formatToParts(new Date(`${date}T12:00:00Z`));
  return Number((parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-5").replace("GMT", ""));
}

function tipoffUtc(date: string, hour: number, minute: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour, minute) - etOffsetHours(date) * 3_600_000).toISOString();
}

interface SimPlayer {
  playerId: number;
  teamId: number;
  level: number;
  usage: number;
  rates: { reb: number; ast: number };
  injuredLeft: number;
  sinceReturn: number | null;
}

type State = "plays" | "injured" | "rest";

function nextState(player: SimPlayer, random: () => number): { state: State; multiplier: number } {
  if (player.injuredLeft > 0) {
    player.injuredLeft -= 1;
    if (player.injuredLeft === 0) player.sinceReturn = 0;
    return { state: "injured", multiplier: 1 };
  }
  if (random() < INJURY_RATE) {
    player.injuredLeft = 2 + Math.floor(random() * 6);
    return { state: "injured", multiplier: 1 };
  }
  if (random() < REST_RATE) return { state: "rest", multiplier: 1 };
  const g = player.sinceReturn;
  if (g === null) return { state: "plays", multiplier: 1 };
  player.sinceReturn = g + 1 < RETURN_RAMP.length ? g + 1 : null;
  return { state: "plays", multiplier: RETURN_RAMP[g] ?? 1 };
}

function pregameStatus(state: State, random: () => number): NbaAvailabilityRecord["status"] {
  const r = random();
  if (state === "injured") return r < 0.8 ? "out" : "questionable";
  if (state === "rest") return r < 0.5 ? "questionable" : "active";
  return r < 0.9 ? "active" : r < 0.97 ? "probable" : "questionable";
}

export function generateEvaluationLeague(options: EvaluationLeagueOptions = DEFAULT_EVALUATION_LEAGUE): EvaluationDataset {
  const random = seededRandom(options.seed);
  const teamIds = Array.from({ length: options.teams }, (_, i) => 1610612901 + i);
  const players: SimPlayer[] = teamIds.flatMap((teamId, t) =>
    Array.from({ length: options.playersPerTeam }, (_, p) => ({
      playerId: 5000 + t * 100 + p,
      teamId,
      level: ROLE_LEVELS[p % ROLE_LEVELS.length] + normal(random, 0, 1),
      usage: 0.3 + 0.3 * random(),
      rates: { reb: 0.08 + 0.2 * random(), ast: 0.04 + 0.16 * random() },
      injuredLeft: 0,
      sinceReturn: null,
    })),
  );
  const playerGames: NbaPlayerGame[] = [];
  const teamGames: NbaTeamGame[] = [];
  const schedule: ScheduledGame[] = [];
  const availability: NbaAvailabilityRecord[] = [];
  const finalStatuses: FinalStatusRecord[] = [];

  options.seasons.forEach((season, seasonIndex) => {
    const startYear = Number(season.slice(0, 4));
    const yy = String(startYear % 100).padStart(2, "0");
    let gameNumber = 0;
    for (const player of players) {
      player.level = Math.min(Math.max(player.level + normal(random, 0, 1.5), 4), 38);
      player.injuredLeft = 0;
      player.sinceReturn = null;
    }
    for (let round = 0; round < options.rounds; round += 1) {
      if (round === Math.floor(options.rounds / 2)) {
        for (let i = 0; i < options.tradesPerSeason; i += 1) {
          const traded = players[Math.floor(random() * players.length)];
          const others = teamIds.filter((id) => id !== traded.teamId);
          traded.teamId = others[Math.floor(random() * others.length)];
        }
      }
      const gameDate = new Date(Date.UTC(startYear, 9, 20) + round * 2 * 86_400_000).toISOString().slice(0, 10);
      const order = shuffle(teamIds, random);
      for (let pair = 0; pair < order.length; pair += 2) {
        gameNumber += 1;
        const gameId = `002${yy}${String(gameNumber).padStart(5, "0")}`;
        const [teamA, teamB] = [order[pair], order[pair + 1]];
        const [hour, minute] = TIP_TIMES_ET[Math.floor(random() * TIP_TIMES_ET.length)];
        const tip = tipoffUtc(gameDate, hour, minute);
        const neutral = seasonIndex === 0 && round === 20 && pair === 0;
        const dataGap = seasonIndex === options.seasons.length - 1 && round === 30 && pair === 2;
        schedule.push({ gameId, gameDate, season, seasonType: "regular", tipoffUtc: tip, homeTeamId: neutral ? null : teamA, awayTeamId: neutral ? null : teamB, neutralSite: neutral, ...(neutral ? { participantTeamIds: [teamA, teamB] as const } : {}) });
        const tipMs = Date.parse(tip);
        for (const [teamId, opponentId, isHome] of [[teamA, teamB, true], [teamB, teamA, false]] as const) {
          let teamPts = 0;
          for (const player of players.filter((p) => p.teamId === teamId)) {
            const { state, multiplier } = nextState(player, random);
            if (dataGap) continue;
            if (random() >= MISSING_PREGAME_RATE) {
              availability.push(record(gameId, gameDate, season, player, teamId, pregameStatus(state, random), tipMs - PREGAME_SNAPSHOT_MINUTES * MINUTE_MS));
            }
            if (state !== "plays" ? random() < 0.5 : random() < 0.1) {
              availability.push(record(gameId, gameDate, season, player, teamId, state === "plays" ? "active" : state === "injured" ? "out" : "dnp", tipMs - LATE_SNAPSHOT_MINUTES * MINUTE_MS));
            }
            if (state === "plays") {
              const minutes = Math.max(1, Math.min(48, Math.round(normal(random, player.level, player.level >= 28 ? 4 : 5) * multiplier * 10) / 10));
              const pts = poisson(random, 0.7 * player.usage * minutes);
              const reb = poisson(random, player.rates.reb * minutes);
              teamPts += pts;
              playerGames.push(
                playerGame({
                  gameId, gameDate, season, playerId: player.playerId, playerName: `Synthetic ${player.playerId}`, teamId, opponentTeamId: opponentId, isHome, minutes, pts, reb,
                  ast: poisson(random, player.rates.ast * minutes), oreb: 0, dreb: reb,
                  fga: poisson(random, 0.75 * player.usage * minutes), fta: poisson(random, 0.25 * player.usage * minutes), tov: poisson(random, 0.1 * player.usage * minutes),
                  sourceSnapshotId: "synthetic-eval",
                }),
              );
            } else if (state === "rest" && random() < 0.5) {
              playerGames.push(playerGame({ gameId, gameDate, season, playerId: player.playerId, playerName: `Synthetic ${player.playerId}`, teamId, opponentTeamId: opponentId, isHome, minutes: 0, pts: 0, reb: 0, ast: 0, oreb: 0, dreb: 0, fga: 0, fta: 0, tov: 0, sourceSnapshotId: "synthetic-eval" }));
            } else if (state === "rest" || random() >= UNESTABLISHED_RATE) {
              finalStatuses.push({ gameId, playerId: player.playerId, teamId, status: state === "rest" ? "dnp" : "out" });
            }
          }
          if (!dataGap) teamGames.push(teamGame({ gameId, gameDate, season, teamId, opponentTeamId: opponentId, isHome, pts: teamPts, sourceSnapshotId: "synthetic-eval" }));
        }
      }
    }
  });

  return {
    sourceId: "synthetic",
    playerGames,
    teamGames,
    schedule,
    availability,
    finalStatuses,
    provenance: { kind: "synthetic-generator", generator: EVALUATION_GENERATOR, fixtureVersion: EVALUATION_FIXTURE_VERSION, seed: options.seed },
  };
}

function record(gameId: string, gameDate: string, season: string, player: SimPlayer, teamId: number, status: NbaAvailabilityRecord["status"], asOfMs: number): NbaAvailabilityRecord {
  return {
    schemaVersion: "nba-availability-v1",
    gameId,
    gameDate,
    season,
    seasonType: "regular",
    playerId: player.playerId,
    teamId,
    status,
    starter: null,
    reason: null,
    asOfUtc: new Date(asOfMs).toISOString(),
    sourceSnapshotId: "synthetic-eval",
  };
}
