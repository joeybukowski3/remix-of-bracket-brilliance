/**
 * A viewer's manual minutes override: browser-safe arithmetic, no persistence.
 *
 * Two different numbers come out of an override and are kept apart everywhere they are shown:
 *   - the ADJUSTED JKB projection scales the model's own projection to the new minutes:
 *       adjusted = JKB projection x user minutes / JKB projected minutes
 *   - the SEASON-RATE estimate ignores the model and multiplies the new minutes by the player's season rate:
 *       estimate = user minutes x season stat per minute
 * The JKB projection itself is never modified; the original and the adjusted values are both available, and so are the
 * differences from a sportsbook line. Overrides live only in the page's memory: nothing here writes anywhere.
 *
 * Every function returns null rather than a number it cannot support: a missing value, a zero or negative denominator, an
 * input outside 0-48 minutes, or a result that is not finite.
 */
export const MIN_USER_MINUTES = 0;
export const MAX_USER_MINUTES = 48;

export type MinutesInput = { kind: "empty" } | { kind: "valid"; minutes: number } | { kind: "invalid"; reason: string };

const NUMERIC = /^\d{0,3}(\.\d*)?$/;

/** Rounds to one decimal, half away from zero, without the usual binary-fraction surprises (24.45 -> 24.5). */
export const roundToTenth = (value: number): number => Math.round((value + Number.EPSILON) * 10) / 10;

/** Reads what the viewer typed. Blank clears the override; anything that is not 0-48 minutes is invalid and never applied. */
export function parseMinutesInput(text: string): MinutesInput {
  const trimmed = text.trim();
  if (trimmed === "") return { kind: "empty" };
  if (!NUMERIC.test(trimmed) || trimmed === ".") return { kind: "invalid", reason: "Enter minutes as a number, for example 32.5" };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { kind: "invalid", reason: "Enter minutes as a number, for example 32.5" };
  if (value < MIN_USER_MINUTES || value > MAX_USER_MINUTES) return { kind: "invalid", reason: `Minutes must be between ${MIN_USER_MINUTES} and ${MAX_USER_MINUTES}` };
  return { kind: "valid", minutes: roundToTenth(value) };
}

const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);

/** adjusted = JKB projection x user minutes / JKB projected minutes. Null without a usable original or a positive original minutes. */
export function adjustProjection(jkbProjection: number | null | undefined, jkbMinutes: number | null | undefined, userMinutes: number | null | undefined): number | null {
  if (!finite(jkbProjection) || !finite(jkbMinutes) || !finite(userMinutes)) return null;
  if (!(jkbMinutes > 0) || userMinutes < MIN_USER_MINUTES || userMinutes > MAX_USER_MINUTES || jkbProjection < 0) return null;
  const adjusted = (jkbProjection * userMinutes) / jkbMinutes;
  return Number.isFinite(adjusted) ? adjusted : null;
}

/** estimate = user minutes x season stat per minute. Null without a usable rate or minutes. */
export function seasonRateEstimate(userMinutes: number | null | undefined, statPerMinute: number | null | undefined): number | null {
  if (!finite(userMinutes) || !finite(statPerMinute)) return null;
  if (userMinutes < MIN_USER_MINUTES || userMinutes > MAX_USER_MINUTES || statPerMinute < 0) return null;
  return userMinutes * statPerMinute;
}

/** value minus line (positive leans Over); null unless both exist. */
export function differenceFromLine(value: number | null | undefined, line: number | null | undefined): number | null {
  return finite(value) && finite(line) ? value - line : null;
}

export interface OverrideView {
  /** The applied override, or null when none is active (blank or invalid input). */
  userMinutes: number | null;
  adjustedProjection: number | null;
  adjustedDifference: number | null;
  seasonRateEstimate: number | null;
  seasonRateDifference: number | null;
}

export const NO_OVERRIDE: OverrideView = Object.freeze({ userMinutes: null, adjustedProjection: null, adjustedDifference: null, seasonRateEstimate: null, seasonRateDifference: null });

export function overrideView(args: { jkbProjection: number | null; jkbMinutes: number | null; line: number | null; seasonPerMinute: number | null; userMinutes: number | null }): OverrideView {
  const { userMinutes } = args;
  if (!finite(userMinutes)) return NO_OVERRIDE;
  const adjustedProjection = adjustProjection(args.jkbProjection, args.jkbMinutes, userMinutes);
  const estimate = seasonRateEstimate(userMinutes, args.seasonPerMinute);
  return {
    userMinutes,
    adjustedProjection,
    adjustedDifference: differenceFromLine(adjustedProjection, args.line),
    seasonRateEstimate: estimate,
    seasonRateDifference: differenceFromLine(estimate, args.line),
  };
}

/** What the viewer typed, by player. Immutable updates: the previous map is never changed. */
export type MinutesDrafts = Readonly<Record<string, string>>;

export const setDraft = (drafts: MinutesDrafts, key: string, text: string): MinutesDrafts => (text === "" ? clearDraft(drafts, key) : { ...drafts, [key]: text });

export function clearDraft(drafts: MinutesDrafts, key: string): MinutesDrafts {
  if (!(key in drafts)) return drafts;
  const { [key]: _removed, ...rest } = drafts;
  return rest;
}

export const clearAllDrafts = (): MinutesDrafts => ({});

/** The valid, applied minutes by player; invalid and blank drafts are not overrides. */
export function appliedMinutes(drafts: MinutesDrafts): ReadonlyMap<string, number> {
  const applied = new Map<string, number>();
  for (const [key, text] of Object.entries(drafts)) {
    const parsed = parseMinutesInput(text);
    if (parsed.kind === "valid") applied.set(key, parsed.minutes);
  }
  return applied;
}

/** One key per player and game, shared by all three markets so an override follows the player when the market changes. */
export const playerOverrideKey = (entry: { gameKey: string; playerName: string }): string => `${entry.gameKey}|${entry.playerName.trim().toLowerCase()}`;
