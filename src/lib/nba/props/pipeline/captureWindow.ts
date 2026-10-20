/**
 * When a game's lines may be captured, and what a capture run should do about
 * each game. Pure; the caller supplies the clock.
 *
 * Window (minutes before scheduled tipoff):
 *   > earlyMinutes (240)         too early, never captured
 *   (preferred, early]           eligible but we wait: lines move toward tipoff
 *   [floor, preferred] (180..45)  captured; "in_window" down to 120, "late" below
 *   < floor (45)                 missed: recorded explicitly, never captured
 *
 * GitHub schedules run late or not at all, so an hourly cadence is expected to
 * land inside 120-180 and tolerate one dropped run by landing in "late".
 */
import { CAPTURE_BOUNDS, type AttemptOutcome, type NbaCaptureAttempt, type NbaPipelineGame } from "./contracts";

export interface CapturePolicy {
  earlyMinutes: number;
  preferredMinutes: number;
  inWindowMinMinutes: number;
  floorMinutes: number;
  /** A provider line older than this when captured is stored as stale and excluded from line trends. */
  maxLineAgeMinutes: number;
  /** Tries per game; only a "no market yet" outcome is retried. */
  maxAttemptsPerGame: number;
}

export const DEFAULT_CAPTURE_POLICY: CapturePolicy = Object.freeze({
  earlyMinutes: CAPTURE_BOUNDS.earliestMinutes,
  preferredMinutes: 180,
  inWindowMinMinutes: CAPTURE_BOUNDS.inWindowMinMinutes,
  floorMinutes: CAPTURE_BOUNDS.floorMinutes,
  maxLineAgeMinutes: 120,
  maxAttemptsPerGame: 2,
});

export type CaptureDecision =
  | { action: "capture"; window: "in_window" | "late"; minutesToTipoff: number }
  | { action: "wait"; minutesToTipoff: number; capturableAtUtc: string }
  | { action: "skip"; reason: "already_captured" | "postponed" | "not_scheduled" | "attempts_exhausted" | "missed_window"; minutesToTipoff: number };

const MINUTE_MS = 60_000;

export function assertCapturePolicy(policy: CapturePolicy): void {
  const ordered = policy.floorMinutes > 0 && policy.floorMinutes < policy.inWindowMinMinutes && policy.inWindowMinMinutes <= policy.preferredMinutes && policy.preferredMinutes <= policy.earlyMinutes;
  if (!ordered) throw new Error("Capture policy minutes must satisfy 0 < floor < inWindowMin <= preferred <= early");
  // The record itself refuses anything outside these bounds, so a policy may only narrow them.
  if (policy.floorMinutes < CAPTURE_BOUNDS.floorMinutes || policy.earlyMinutes > CAPTURE_BOUNDS.earliestMinutes || policy.inWindowMinMinutes !== CAPTURE_BOUNDS.inWindowMinMinutes) {
    throw new Error("Capture policy must stay within the contract bounds (floor >= 45, early <= 240, in-window boundary 120)");
  }
  if (policy.maxLineAgeMinutes <= 0 || !Number.isInteger(policy.maxAttemptsPerGame) || policy.maxAttemptsPerGame < 1) throw new Error("Invalid capture policy limits");
}

export interface GameCaptureState {
  /** Snapshots already stored for the game (any market). */
  snapshotsStored: number;
  /** Attempts already made, with the latest outcome. */
  attempts: number;
  lastOutcome: AttemptOutcome | null;
}

/** Outcomes where the provider was actually contacted; only these use up a game's tries. */
const CONTACTED: ReadonlySet<AttemptOutcome> = new Set(["captured", "deduplicated", "no_market", "stale_only", "error"]);

export function summarizeCaptureState(attempts: readonly NbaCaptureAttempt[], snapshotsStored: number): GameCaptureState {
  const contacted = attempts.filter((a) => CONTACTED.has(a.outcome)).sort((a, b) => a.atUtc.localeCompare(b.atUtc));
  return { snapshotsStored, attempts: contacted.length, lastOutcome: contacted.at(-1)?.outcome ?? null };
}

export function decideCapture(game: NbaPipelineGame, state: GameCaptureState, now: Date, policy: CapturePolicy = DEFAULT_CAPTURE_POLICY): CaptureDecision {
  const minutesToTipoff = (Date.parse(game.tipoffUtc) - now.getTime()) / MINUTE_MS;
  if (game.status === "postponed" || game.status === "cancelled") return { action: "skip", reason: "postponed", minutesToTipoff };
  if (game.status !== "scheduled") return { action: "skip", reason: "not_scheduled", minutesToTipoff };
  if (state.snapshotsStored > 0 || state.lastOutcome === "captured" || state.lastOutcome === "deduplicated") return { action: "skip", reason: "already_captured", minutesToTipoff };
  if (minutesToTipoff < policy.floorMinutes) return { action: "skip", reason: "missed_window", minutesToTipoff };
  if (state.attempts >= policy.maxAttemptsPerGame) return { action: "skip", reason: "attempts_exhausted", minutesToTipoff };
  if (minutesToTipoff > policy.preferredMinutes) {
    const capturableAt = new Date(Date.parse(game.tipoffUtc) - policy.preferredMinutes * MINUTE_MS).toISOString();
    return { action: "wait", minutesToTipoff, capturableAtUtc: capturableAt };
  }
  return { action: "capture", window: minutesToTipoff >= policy.inWindowMinMinutes ? "in_window" : "late", minutesToTipoff };
}
