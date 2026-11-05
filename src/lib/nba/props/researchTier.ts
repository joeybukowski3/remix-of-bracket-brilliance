/**
 * Research tiers for the props board: which players have an established, steady role worth reading first.
 *
 * Browser-safe, no Node imports. A pure function of one player's season-to-date log as the board already carries it
 * (seasonStats.ts), which is built only from completed games strictly before the matchup, so a tier can never see the game it is
 * for. The same function scores the walk-forward evaluation, so the board and the evaluation cannot disagree about who is Core.
 *
 *  - Core: at least 25 minutes per game this season, minutes that pass the stability rule, and no open role flag.
 *  - Rotation: at least 20 minutes per game (everyone else who clears the primary-board bar, including a 25+ MPG player whose
 *    minutes are not steady or whose role has just changed; the flag says why).
 *  - Variable: under 20 minutes per game, or too few games this season to say.
 *
 * Stability rule (preliminary, not tuned): at least 4 of the last 5 completed games within +/-20% of the median of those five.
 * The thresholds are named constants below. Season minutes are this season only; last season is never used to rate a player.
 *
 * This ranks attention. It is not a projection input and changes no number the model produces.
 */
import type { PlayerRecentGame } from "./recentForm";
import type { SeasonStatsView } from "./seasonStats";

export const CORE_MIN_MPG = 25;
export const ROTATION_MIN_MPG = 20;
/** Fewest completed games this season before a player is tiered at all (the stability rule needs five). */
export const MIN_GAMES_FOR_TIER = 5;
/** The band around the five-game median, as a share of that median. */
export const STABLE_BAND = 0.2;
export const STABLE_WINDOW = 5;
/** Games within the band, of the five, that make minutes stable. */
export const STABLE_MIN_WITHIN = 4;
export const LONG_WINDOW = 10;

export type ResearchTier = "core" | "rotation" | "variable";
export const RESEARCH_TIERS: readonly ResearchTier[] = Object.freeze(["core", "rotation", "variable"] as const);

/** What the page may say about a player's situation. Order here is the order shown. */
export type ResearchFlag = "low-sample" | "no-minutes-log" | "unstable-minutes" | "recent-role-change" | "returning-from-absence" | "new-team" | "missed-games";

/** Flags that keep a 25+ MPG player out of Core. `missed-games` is information only. */
const CORE_BLOCKERS: ReadonlySet<ResearchFlag> = new Set(["low-sample", "no-minutes-log", "unstable-minutes", "recent-role-change", "returning-from-absence", "new-team"]);

export const FLAG_LABEL: Record<ResearchFlag, string> = {
  "low-sample": "Low sample",
  "no-minutes-log": "No minutes log",
  "unstable-minutes": "Unstable minutes",
  "recent-role-change": "Role change",
  "returning-from-absence": "Returning",
  "new-team": "New team",
  "missed-games": "Missed games",
};

export const FLAG_WHY: Record<ResearchFlag, string> = {
  "low-sample": `Fewer than ${MIN_GAMES_FOR_TIER} completed games this season: not enough to rate the role`,
  "no-minutes-log": "This board has no game-by-game minutes (built before they were carried): stability cannot be judged",
  "unstable-minutes": `Fewer than ${STABLE_MIN_WITHIN} of the last ${STABLE_WINDOW} games were within ${STABLE_BAND * 100}% of the five-game median minutes`,
  "recent-role-change": "Minutes over the last 5 games differ from the last 20 by 8 or more (the model's own role-change test)",
  "returning-from-absence": "Missed three or more team games before this one, so minutes may still be ramping (the model's own absence test)",
  "new-team": "Joined the current team within the last ten games",
  "missed-games": "Did not appear in some of the team's last games. Injury, rest, a coach's decision and a G League assignment look the same in this data",
};

const FLAG_ORDER: readonly ResearchFlag[] = Object.freeze(Object.keys(FLAG_LABEL) as ResearchFlag[]);

export const TIER_NAME: Record<ResearchTier, string> = { core: "Core", rotation: "Rotation", variable: "Variable" };

/** Tiers in research order, then a player with no tier (a board without season statistics) last. */
export const researchTierRank = (tier: ResearchTier | null): number => (tier === null ? RESEARCH_TIERS.length : RESEARCH_TIERS.indexOf(tier));

/** The middle value (the mean of the two middle values for an even count), without reordering the input; null for none. */
export function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface FiveGameStability {
  games: number;
  /** Median minutes of the last five completed games: the informational baseline for a steady player. */
  median: number;
  /** How many of the five were within the band around that median. */
  within: number;
  stable: boolean;
}

export interface LongWindow {
  games: number;
  median: number;
  min: number;
  max: number;
  sd: number;
  /** Games within +/-20% of this window's own median. */
  within: number;
}

export interface MinutesConsistency {
  /** Completed games in the log (at most the long window). */
  games: number;
  /** Null with fewer than five games: no verdict is given on a shorter run. */
  last5: FiveGameStability | null;
  last10: LongWindow | null;
}

const withinBand = (minutes: number, median: number): boolean => Math.abs(minutes - median) <= STABLE_BAND * median + 1e-9;

function sampleSd(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1));
}

/** Minutes consistency over the player's most recent completed games (the log is oldest to newest). */
export function minutesConsistency(recent: readonly Pick<PlayerRecentGame, "minutes">[]): MinutesConsistency {
  const minutes = recent.map((g) => g.minutes).slice(-LONG_WINDOW);
  const five = minutes.slice(-STABLE_WINDOW);
  const median5 = five.length === STABLE_WINDOW ? medianOf(five) : null;
  const last5: FiveGameStability | null =
    median5 === null
      ? null
      : (() => {
          const within = five.filter((m) => withinBand(m, median5)).length;
          return { games: five.length, median: median5, within, stable: within >= STABLE_MIN_WITHIN };
        })();
  const median10 = minutes.length >= STABLE_WINDOW ? medianOf(minutes) : null;
  const last10: LongWindow | null =
    median10 === null ? null : { games: minutes.length, median: median10, min: Math.min(...minutes), max: Math.max(...minutes), sd: sampleSd(minutes), within: minutes.filter((m) => withinBand(m, median10)).length };
  return { games: minutes.length, last5, last10 };
}

export interface ResearchProfile {
  tier: ResearchTier;
  /** Minutes per game this season to date; null before the first game. */
  mpg: number | null;
  /** Completed games this season behind it. */
  games: number;
  /** Median minutes of the last five games, when there are five: an informational baseline, not the model's minutes. */
  baselineMinutes: number | null;
  consistency: MinutesConsistency;
  /** Team games the player did not appear in, out of the team's last games; null when the board carries no availability. */
  missedTeamGames: { missed: number; of: number } | null;
  flags: ResearchFlag[];
  /** One sentence for a hover or a screen reader. */
  reason: string;
}

function flagsFor(view: SeasonStatsView, games: number, consistency: MinutesConsistency): ResearchFlag[] {
  const { availability } = view;
  const flags = new Set<ResearchFlag>();
  if (games < MIN_GAMES_FOR_TIER) flags.add("low-sample");
  else if (view.recentGames === undefined) flags.add("no-minutes-log");
  else if (consistency.last5 !== null && !consistency.last5.stable) flags.add("unstable-minutes");
  if (availability?.roleChange) flags.add("recent-role-change");
  if (availability?.returning) flags.add("returning-from-absence");
  if (availability?.teamChangedRecently) flags.add("new-team");
  if (availability && availability.teamGames > 0 && availability.played < availability.teamGames) flags.add("missed-games");
  return FLAG_ORDER.filter((flag) => flags.has(flag));
}

const oneDecimal = (n: number): string => n.toFixed(1);

function reasonFor(tier: ResearchTier, mpg: number | null, games: number, consistency: MinutesConsistency, flags: readonly ResearchFlag[]): string {
  if (mpg === null || games === 0) return "Variable: no completed game this season yet, so there is no role to rate.";
  const base = `${oneDecimal(mpg)} MPG over ${games} ${games === 1 ? "game" : "games"}`;
  if (flags.includes("low-sample")) return `Variable: ${base}; fewer than ${MIN_GAMES_FOR_TIER} games is too few to rate the role.`;
  const five = consistency.last5;
  const stability = five
    ? five.stable
      ? `${five.within} of the last ${STABLE_WINDOW} games within ${STABLE_BAND * 100}% of the ${oneDecimal(five.median)}-minute median`
      : `needs ${STABLE_MIN_WITHIN} of the last ${STABLE_WINDOW} games within ${STABLE_BAND * 100}% of the ${oneDecimal(five.median)}-minute median; had ${five.within}`
    : "no minutes log to judge stability";
  if (tier === "core") return `Core: ${base}; ${stability}.`;
  if (tier === "rotation") {
    const why = flags.filter((f) => CORE_BLOCKERS.has(f)).map((f) => FLAG_LABEL[f].toLowerCase());
    return mpg >= CORE_MIN_MPG ? `Rotation: ${base}, held out of Core (${why.join(", ")}); ${stability}.` : `Rotation: ${base}; ${stability}.`;
  }
  return `Variable: ${base}, under ${ROTATION_MIN_MPG} MPG.`;
}

/**
 * The research profile of one player from the board's season statistics, or null when the board carries none (a public board has
 * no minutes to judge by, so it has no tiers).
 */
export function researchProfile(view: SeasonStatsView | undefined | null): ResearchProfile | null {
  if (!view) return null;
  const current = view.current;
  const games = current?.games ?? 0;
  const mpg = current && current.games > 0 ? current.minutes / current.games : null;
  const consistency = minutesConsistency(view.recentGames ?? []);
  const flags = flagsFor(view, games, consistency);
  const blocked = flags.some((f) => CORE_BLOCKERS.has(f));
  const tier: ResearchTier = flags.includes("low-sample") || mpg === null ? "variable" : mpg >= CORE_MIN_MPG && !blocked ? "core" : mpg >= ROTATION_MIN_MPG ? "rotation" : "variable";
  const { availability } = view;
  return {
    tier,
    mpg,
    games,
    baselineMinutes: consistency.last5?.median ?? null,
    consistency,
    missedTeamGames: availability && availability.teamGames > 0 ? { missed: availability.teamGames - availability.played, of: availability.teamGames } : null,
    flags,
    reason: reasonFor(tier, mpg, games, consistency, flags),
  };
}
