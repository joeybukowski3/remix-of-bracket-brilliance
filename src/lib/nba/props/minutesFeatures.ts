/**
 * Pregame minutes features for minutes-v1 (Phase 2A).
 *
 * Built on `selectPriorGames`, the same leakage gate as v0: only competitive
 * games dated strictly before the cutoff. Team schedules are used only for
 * dates before the cutoff. Nothing here reads the target game's result.
 *
 * Absence semantics: game logs list appearances only, so a "missed" team game
 * is any team game, within the player's current same-season stint, without an
 * appearance. Injury, rest, a coach's decision and G League assignment are
 * indistinguishable.
 */
import { selectPriorGames, type PregameTarget } from "./features";
import { previousSeason } from "./seasonType";
import type { NbaPlayerGame } from "./types";

/** Recent games kept for the level estimate. */
const LEVEL_POOL_GAMES = 20;
/** Current-team games needed before the level uses only the current stint. */
const STINT_MIN_GAMES = 3;
const RECENT_TEAM_CHANGE_GAMES = 10;
/** Consecutive missed team games that count as an absence. */
export const ABSENCE_MIN_TEAM_GAMES = 3;
/** Appearances after a return that are still treated as a return ramp. */
export const RETURN_LOOKBACK_GAMES = 5;
const PRE_ABSENCE_GAMES = 10;
const PRE_ABSENCE_MIN_GAMES = 3;
const VOLATILITY_GAMES = 10;
const PARTICIPATION_TEAM_GAMES = 10;
/** Role-shift test: last k games vs up to 16 before them. */
const SHIFT_RECENT_GAMES = 4;
const SHIFT_BASELINE_MAX = 16;
const SHIFT_BASELINE_MIN = 6;
const SHIFT_MIN_Z = 2.5;
const SHIFT_MIN_MINUTES = 4;
const SD_FLOOR = 2;

export interface MeanSummary {
  games: number;
  mean: number;
}

export interface AbsenceReturn {
  /** Appearances since coming back (0 = the target is the first game back). */
  gamesSinceReturn: number;
  /** Team games missed in the absence. */
  absenceLength: number;
  /** Mean minutes in up to 10 appearances before the absence; null if fewer than 3. */
  preAbsence: MeanSummary | null;
}

export interface RoleShift {
  recentMean: number;
  baselineMean: number;
  diff: number;
  z: number;
  flagged: boolean;
}

export interface MinutesV1Features {
  priorGames: number;
  stintGames: number;
  teamChangedRecently: boolean;
  /** Minutes, newest first: current stint once it has 3+ games, else all prior games. */
  levelPool: number[];
  seasonTeam: MeanSummary | null;
  previousSeason: MeanSummary | null;
  absence: AbsenceReturn | null;
  roleShift: RoleShift | null;
  volatility: { games: number; sd: number } | null;
  /** Last <= 10 target-team games since the player's same-season stint began. */
  participation: { teamGames: number; played: number } | null;
}

const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

function sampleSd(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
}

const summarize = (values: readonly number[]): MeanSummary | null =>
  values.length > 0 ? { games: values.length, mean: mean(values) } : null;

function countBetween(dates: readonly string[], after: string, before: string): number {
  let count = 0;
  for (const date of dates) if (date > after && date < before) count += 1;
  return count;
}

/** Most recent absence among the last RETURN_LOOKBACK_GAMES same-season stint appearances. */
function detectAbsence(stintSeason: readonly NbaPlayerGame[], teamDates: readonly string[], cutoff: string): AbsenceReturn | null {
  let newer = cutoff;
  for (let i = 0; i < Math.min(stintSeason.length, RETURN_LOOKBACK_GAMES + 1); i += 1) {
    const gap = countBetween(teamDates, stintSeason[i].gameDate, newer);
    if (gap >= ABSENCE_MIN_TEAM_GAMES) {
      const before = stintSeason.slice(i, i + PRE_ABSENCE_GAMES).map((row) => row.minutes);
      return { gamesSinceReturn: i, absenceLength: gap, preAbsence: before.length >= PRE_ABSENCE_MIN_GAMES ? summarize(before) : null };
    }
    newer = stintSeason[i].gameDate;
  }
  return null;
}

function detectRoleShift(pool: readonly number[], absence: AbsenceReturn | null): RoleShift | null {
  const recent = pool.slice(0, SHIFT_RECENT_GAMES);
  const baseline = pool.slice(SHIFT_RECENT_GAMES, SHIFT_RECENT_GAMES + SHIFT_BASELINE_MAX);
  if (recent.length < SHIFT_RECENT_GAMES || baseline.length < SHIFT_BASELINE_MIN) return null;
  const k = recent.length;
  const m = baseline.length;
  const pooled = Math.sqrt(((k - 1) * sampleSd(recent) ** 2 + (m - 1) * sampleSd(baseline) ** 2) / (k + m - 2));
  const diff = mean(recent) - mean(baseline);
  const z = diff / (Math.max(pooled, SD_FLOOR) * Math.sqrt(1 / k + 1 / m));
  // A return ramp also depresses recent minutes; do not call it a role change.
  const inReturnRamp = absence !== null && absence.gamesSinceReturn < SHIFT_RECENT_GAMES;
  return { recentMean: mean(recent), baselineMean: mean(baseline), diff, z, flagged: !inReturnRamp && Math.abs(z) >= SHIFT_MIN_Z && Math.abs(diff) >= SHIFT_MIN_MINUTES };
}

function participationWindow(stintSeason: readonly NbaPlayerGame[], teamDates: readonly string[], cutoff: string) {
  if (stintSeason.length === 0) return null;
  const stintStart = stintSeason[stintSeason.length - 1].gameDate;
  const window = teamDates.filter((date) => date >= stintStart && date < cutoff).slice(-PARTICIPATION_TEAM_GAMES);
  const appeared = new Set(stintSeason.map((row) => row.gameDate));
  return { teamGames: window.length, played: window.filter((date) => appeared.has(date)).length };
}

export function computeMinutesV1Features(
  playerHistory: readonly NbaPlayerGame[],
  target: PregameTarget,
  teamGameDates: ReadonlyMap<number, readonly string[]>,
): MinutesV1Features {
  const prior = selectPriorGames(playerHistory, target);
  const stintEnd = prior.findIndex((row) => row.teamId !== target.teamId);
  const stint = stintEnd === -1 ? prior : prior.slice(0, stintEnd);
  const stintSeason = stint.filter((row) => row.season === target.season);
  const teamDates = (teamGameDates.get(target.teamId) ?? []).filter((date) => date < target.cutoffDate);
  const levelRows = stint.length >= STINT_MIN_GAMES ? stint : prior;
  const levelPool = levelRows.slice(0, LEVEL_POOL_GAMES).map((row) => row.minutes);
  const absence = detectAbsence(stintSeason, teamDates, target.cutoffDate);
  const prevSeason = previousSeason(target.season);
  const volatilityPool = levelPool.slice(0, VOLATILITY_GAMES);
  return {
    priorGames: prior.length,
    stintGames: stint.length,
    teamChangedRecently: stint.length < prior.length && stint.length < RECENT_TEAM_CHANGE_GAMES,
    levelPool,
    seasonTeam: summarize(stintSeason.map((row) => row.minutes)),
    previousSeason: summarize(prior.filter((row) => row.season === prevSeason && row.seasonType === "regular").map((row) => row.minutes)),
    absence,
    roleShift: detectRoleShift(levelPool, absence),
    volatility: volatilityPool.length >= 3 ? { games: volatilityPool.length, sd: sampleSd(volatilityPool) } : null,
    participation: participationWindow(stintSeason, teamDates, target.cutoffDate),
  };
}
