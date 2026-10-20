/**
 * Pregame clock: when features freeze and when a result may be used.
 * The existing feature builders gate by game DATE; this layer gates by
 * INSTANT first, so same-day information cannot be proven pre-tipoff by date
 * alone.
 */
import { etGameDate } from "../canonical";
import type { CutoffPolicy, FoldSpec, ScheduledGame } from "./types";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function assertCutoffPolicy(policy: CutoffPolicy): void {
  if (!Number.isFinite(policy.leadMinutes) || policy.leadMinutes < 0) throw new Error(`Invalid cutoff lead ${policy.leadMinutes}`);
  if (!Number.isFinite(policy.resultLagMinutes) || policy.resultLagMinutes <= 0) throw new Error(`Invalid result lag ${policy.resultLagMinutes}`);
}

export const tipoffMs = (game: Pick<ScheduledGame, "tipoffUtc">): number => Date.parse(game.tipoffUtc);
export const cutoffMs = (game: Pick<ScheduledGame, "tipoffUtc">, policy: CutoffPolicy): number => tipoffMs(game) - policy.leadMinutes * MINUTE_MS;
export const resultAvailableMs = (game: Pick<ScheduledGame, "tipoffUtc">, policy: CutoffPolicy): number => tipoffMs(game) + policy.resultLagMinutes * MINUTE_MS;

/** Fails closed on a schedule the leakage gate could not trust. */
export function validateSchedule(schedule: readonly ScheduledGame[]): Map<string, ScheduledGame> {
  const byId = new Map<string, ScheduledGame>();
  for (const game of schedule) {
    if (byId.has(game.gameId)) throw new Error(`Duplicate scheduled game ${game.gameId}`);
    if (etGameDate(game.tipoffUtc) !== game.gameDate) throw new Error(`Game ${game.gameId}: gameDate ${game.gameDate} is not the Eastern date of ${game.tipoffUtc}`);
    const participants = game.participantTeamIds;
    const teamsOk = game.neutralSite
      ? game.homeTeamId === null && game.awayTeamId === null && participants !== undefined && participants[0] !== participants[1]
      : game.homeTeamId !== null && game.awayTeamId !== null && game.homeTeamId !== game.awayTeamId;
    if (!teamsOk) throw new Error(`Game ${game.gameId}: inconsistent home/away/neutral-site fields`);
    byId.set(game.gameId, game);
  }
  return byId;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export interface RollingFoldOptions {
  firstTrainStart: string;
  trainDays: number;
  validationDays: number;
  stepDays: number;
  /** Last date a validation window may include. */
  lastDate: string;
}

/** Fixed-length training windows rolling forward; validation windows never overlap. */
export function rollingFolds(options: RollingFoldOptions): FoldSpec[] {
  const { firstTrainStart, trainDays, validationDays, stepDays, lastDate } = options;
  for (const [name, value] of [["trainDays", trainDays], ["validationDays", validationDays], ["stepDays", stepDays]] as const) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  }
  if (!DATE_PATTERN.test(firstTrainStart) || !DATE_PATTERN.test(lastDate)) throw new Error("Fold dates must be YYYY-MM-DD");
  if (stepDays < validationDays) throw new Error("stepDays must be at least validationDays so validation windows do not overlap");
  const folds: FoldSpec[] = [];
  for (let k = 0; ; k += 1) {
    const trainStart = addDays(firstTrainStart, k * stepDays);
    const trainEnd = addDays(trainStart, trainDays - 1);
    const validationStart = addDays(trainEnd, 1);
    const validationEnd = addDays(validationStart, validationDays - 1);
    if (validationEnd > lastDate) return folds;
    folds.push({ name: `fold-${k + 1}`, trainStart, trainEnd, validationStart, validationEnd });
  }
}

/** Training strictly before validation; validation windows ascending and disjoint. */
export function assertFolds(folds: readonly FoldSpec[]): void {
  if (folds.length === 0) throw new Error("At least one fold is required");
  let previousEnd = "";
  for (const fold of folds) {
    if (!(fold.trainStart <= fold.trainEnd && fold.trainEnd < fold.validationStart && fold.validationStart <= fold.validationEnd)) {
      throw new Error(`Fold ${fold.name}: training must precede validation (${fold.trainStart}..${fold.trainEnd} | ${fold.validationStart}..${fold.validationEnd})`);
    }
    if (fold.validationStart <= previousEnd) throw new Error(`Fold ${fold.name}: validation window overlaps the previous fold`);
    previousEnd = fold.validationEnd;
  }
}
