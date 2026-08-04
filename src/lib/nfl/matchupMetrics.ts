/**
 * Metric catalogue for the NFL matchup analyzer.
 *
 * This module defines *what* the analyzer displays — keys, labels, raw-value
 * direction, formatting and grouping — separately from *where the numbers come
 * from*. Phase 1 ships the catalogue with no populated values: every detailed
 * metric resolves to `null` and renders "N/A".
 *
 * Phase 2 (TeamRankings conventional stats), Phase 3 (RBSDM efficiency) and
 * Phase 4 (ESPN line-of-scrimmage win rates) attach real values by supplying a
 * different `NflMatchupMetricResolver` — no component changes required.
 *
 * Direction metadata is declared here rather than inferred in the UI. It drives
 * labelling and future sorting; visual tier colour is always driven by league
 * rank (see rankTier.ts), so a lower-is-better metric colours correctly without
 * any special-casing in components.
 */

import type { NflDataWindow } from "@/lib/nfl/matchupSampleWindow";

/** How a raw value should be read. Rank-based colouring is unaffected by this. */
export type NflMetricDirection = "higher-is-better" | "lower-is-better" | "context-only";

/** Display formatting for a raw value once a pipeline supplies one. */
export type NflMetricFormat =
  | "epa" // 3dp, signed (e.g. +0.128)
  | "decimal1"
  | "decimal2"
  | "percent1" // already 0-100 (e.g. 45.2%)
  | "integer"
  | "clock" // mm:ss
  | "record"; // free text (e.g. "9-8", "10-6-1")

export type NflMatchupMetricDef = {
  key: string;
  label: string;
  /** Abbreviated label used where horizontal space is tight. */
  shortLabel?: string;
  direction: NflMetricDirection;
  format: NflMetricFormat;
  /** Plain-language explanation surfaced as a tooltip / help text. */
  help?: string;
};

export type NflMatchupMetricGroup = {
  id: string;
  label: string;
  metrics: readonly NflMatchupMetricDef[];
};

/**
 * A resolved metric for one team. `value === null` means genuinely unavailable —
 * consumers render "N/A" and never substitute a placeholder number.
 */
export type NflMatchupMetricValue = {
  key: string;
  value: number | null;
  /** League rank 1-32, or null when unavailable. Drives tier colour. */
  rank: number | null;
  /** Pre-formatted display string; "N/A" when the value is missing. */
  formattedValue: string;
  /** Provenance, e.g. "TeamRankings" / "RBSDM" / "ESPN". */
  source?: string;
  sampleWindow?: NflDataWindow;
  /** ISO timestamp of the underlying source fetch. */
  updatedAt?: string;
};

/**
 * Looks up one metric for one team. Returning `null` (rather than a zeroed
 * value) is the contract for "this pipeline is not connected yet".
 */
export type NflMatchupMetricResolver = (
  teamSlug: string,
  metricKey: string
) => NflMatchupMetricValue | null;

/**
 * Phase 1 resolver. The conventional/advanced/win-rate pipelines do not exist
 * yet, so every detailed metric is unavailable by construction. This is the
 * single place that guarantees no fabricated statistic can reach the UI.
 */
export const unavailableMetricResolver: NflMatchupMetricResolver = () => null;

/** Canonical "no data" display token used across the analyzer. */
export const METRIC_NA = "N/A";

/** The minimal shape one side of a comparison row needs to render. */
export type ComparisonSideValue = {
  formattedValue: string;
  rank: number | null;
};

/**
 * Normalize a resolver result into a renderable side value.
 * A missing metric becomes "N/A" with no rank, so it draws neutral styling
 * rather than borrowing a tier colour.
 */
export function toSideValue(metric: NflMatchupMetricValue | null): ComparisonSideValue {
  if (!metric) return { formattedValue: METRIC_NA, rank: null };
  return { formattedValue: metric.formattedValue, rank: metric.rank };
}

// ---------------------------------------------------------------------------
// Offense
// ---------------------------------------------------------------------------

export const OFFENSE_OVERALL_METRICS: readonly NflMatchupMetricDef[] = [
  { key: "off.epaPerPlay", label: "EPA / Play", direction: "higher-is-better", format: "epa", help: "Expected points added per offensive play." },
  { key: "off.successRate", label: "Success Rate", direction: "higher-is-better", format: "percent1", help: "Share of plays gaining enough yardage to stay on schedule." },
  { key: "off.yardsPerPlay", label: "Yards / Play", direction: "higher-is-better", format: "decimal2" },
  { key: "off.firstDownsPerPlay", label: "1st Downs / Play", shortLabel: "1st Downs / Play", direction: "higher-is-better", format: "percent1" },
  { key: "off.thirdDownConversion", label: "3rd Down Conversion", shortLabel: "3rd Down Conv", direction: "higher-is-better", format: "percent1" },
  { key: "off.pointsPerGame", label: "Points / Game", direction: "higher-is-better", format: "decimal1" },
  { key: "off.turnoversPerGame", label: "Turnovers / Game", direction: "lower-is-better", format: "decimal2", help: "Giveaways per game. Fewer is better." },
  { key: "off.timeOfPossession", label: "Avg Time of Possession", shortLabel: "Avg TOP", direction: "context-only", format: "clock", help: "Context only — time of possession is a style signal, not a quality signal." },
] as const;

export const OFFENSE_PASSING_METRICS: readonly NflMatchupMetricDef[] = [
  { key: "off.epaPerPass", label: "EPA / Pass", direction: "higher-is-better", format: "epa" },
  { key: "off.passSuccessRate", label: "Pass Success Rate", direction: "higher-is-better", format: "percent1" },
  { key: "off.passPlayRate", label: "Pass Play %", direction: "context-only", format: "percent1", help: "Context only — play-calling tendency, not efficiency." },
  { key: "off.passAttemptsPerGame", label: "Pass Attempts / Game", shortLabel: "Pass Att / Game", direction: "context-only", format: "decimal1", help: "Context only — volume, not efficiency." },
  { key: "off.yardsPerPassAttempt", label: "Passing Yards / Attempt", shortLabel: "Pass Yds / Att", direction: "higher-is-better", format: "decimal2" },
  { key: "off.passYardsPerGame", label: "Passing Yards / Game", shortLabel: "Pass Yds / Game", direction: "higher-is-better", format: "decimal1" },
  { key: "off.passBlockWinRate", label: "Pass Block Win Rate", shortLabel: "PBWR", direction: "higher-is-better", format: "percent1", help: "ESPN line-of-scrimmage win rate: share of pass snaps the line holds its block." },
  { key: "off.sacksAllowedPerGame", label: "Sacks Allowed / Game", shortLabel: "Sacks Allowed", direction: "lower-is-better", format: "decimal2" },
] as const;

export const OFFENSE_RUSHING_METRICS: readonly NflMatchupMetricDef[] = [
  { key: "off.epaPerRush", label: "EPA / Rush", direction: "higher-is-better", format: "epa" },
  { key: "off.rushSuccessRate", label: "Rush Success Rate", direction: "higher-is-better", format: "percent1" },
  { key: "off.rushPlayRate", label: "Rush Play %", direction: "context-only", format: "percent1", help: "Context only — play-calling tendency, not efficiency." },
  { key: "off.rushAttemptsPerGame", label: "Rush Attempts / Game", shortLabel: "Rush Att / Game", direction: "context-only", format: "decimal1", help: "Context only — volume, not efficiency." },
  { key: "off.yardsPerRushAttempt", label: "Rush Yards / Attempt", shortLabel: "Rush Yds / Att", direction: "higher-is-better", format: "decimal2" },
  { key: "off.rushYardsPerGame", label: "Rush Yards / Game", shortLabel: "Rush Yds / Game", direction: "higher-is-better", format: "decimal1" },
  { key: "off.runBlockWinRate", label: "Run Block Win Rate", shortLabel: "RBWR", direction: "higher-is-better", format: "percent1", help: "ESPN line-of-scrimmage win rate: share of run snaps the line wins its block." },
] as const;

export const OFFENSE_METRIC_GROUPS: readonly NflMatchupMetricGroup[] = [
  { id: "offense-overall", label: "Overall Offense", metrics: OFFENSE_OVERALL_METRICS },
  { id: "offense-passing", label: "Passing", metrics: OFFENSE_PASSING_METRICS },
  { id: "offense-rushing", label: "Rushing", metrics: OFFENSE_RUSHING_METRICS },
] as const;

// ---------------------------------------------------------------------------
// Defense
//
// Note: the source spreadsheet labels the defensive run-game win rate "Run
// Block Win Rate". That is the offensive metric's name; the defensive
// equivalent is Run Stop Win Rate and is labelled correctly here.
// ---------------------------------------------------------------------------

export const DEFENSE_OVERALL_METRICS: readonly NflMatchupMetricDef[] = [
  { key: "def.epaPerPlayAllowed", label: "EPA / Play Allowed", direction: "lower-is-better", format: "epa", help: "Expected points added allowed per play. Lower is better." },
  { key: "def.successRateAllowed", label: "Success Rate Allowed", shortLabel: "Success Rate Allowed", direction: "lower-is-better", format: "percent1" },
  { key: "def.yardsPerPlayAllowed", label: "Yards / Play Allowed", direction: "lower-is-better", format: "decimal2" },
  { key: "def.firstDownsPerPlayAllowed", label: "Opp 1st Downs / Play", direction: "lower-is-better", format: "percent1" },
  { key: "def.thirdDownConversionAllowed", label: "Opp 3rd Down Conversion", shortLabel: "Opp 3rd Down Conv", direction: "lower-is-better", format: "percent1" },
  { key: "def.pointsAllowedPerGame", label: "Points Allowed / Game", direction: "lower-is-better", format: "decimal1" },
  { key: "def.takeawaysPerGame", label: "Takeaways / Game", direction: "higher-is-better", format: "decimal2" },
] as const;

export const DEFENSE_PASS_METRICS: readonly NflMatchupMetricDef[] = [
  { key: "def.epaPerPassAllowed", label: "EPA / Pass Allowed", direction: "lower-is-better", format: "epa" },
  { key: "def.passSuccessRateAllowed", label: "Pass Success Rate Allowed", shortLabel: "Pass Success Allowed", direction: "lower-is-better", format: "percent1" },
  { key: "def.opponentPasserRating", label: "Opp Passer Rating", direction: "lower-is-better", format: "decimal1" },
  { key: "def.opponentYardsPerPassAttempt", label: "Opp Passing Yards / Attempt", shortLabel: "Opp Pass Yds / Att", direction: "lower-is-better", format: "decimal2" },
  { key: "def.opponentPassYardsPerGame", label: "Opp Passing Yards / Game", shortLabel: "Opp Pass Yds / Game", direction: "lower-is-better", format: "decimal1" },
  { key: "def.passRushWinRate", label: "Pass Rush Win Rate", shortLabel: "PRWR", direction: "higher-is-better", format: "percent1", help: "ESPN line-of-scrimmage win rate: share of pass snaps the rush beats its block." },
  { key: "def.sacksPerGame", label: "Sacks / Game", direction: "higher-is-better", format: "decimal2" },
] as const;

export const DEFENSE_RUN_METRICS: readonly NflMatchupMetricDef[] = [
  { key: "def.epaPerRushAllowed", label: "EPA / Rush Allowed", direction: "lower-is-better", format: "epa" },
  { key: "def.rushSuccessRateAllowed", label: "Rush Success Rate Allowed", shortLabel: "Rush Success Allowed", direction: "lower-is-better", format: "percent1" },
  { key: "def.opponentYardsPerRushAttempt", label: "Opp Yards / Rush Attempt", shortLabel: "Opp Yds / Rush", direction: "lower-is-better", format: "decimal2" },
  { key: "def.opponentRushAttemptsPerGame", label: "Opp Rush Attempts / Game", shortLabel: "Opp Rush Att / Game", direction: "context-only", format: "decimal1", help: "Context only — heavily driven by game script." },
  { key: "def.opponentRushYardsPerGame", label: "Opp Rushing Yards / Game", shortLabel: "Opp Rush Yds / Game", direction: "lower-is-better", format: "decimal1" },
  { key: "def.runStopWinRate", label: "Run Stop Win Rate", shortLabel: "RSWR", direction: "higher-is-better", format: "percent1", help: "ESPN line-of-scrimmage win rate: share of run snaps the front beats its block." },
] as const;

export const DEFENSE_METRIC_GROUPS: readonly NflMatchupMetricGroup[] = [
  { id: "defense-overall", label: "Overall Defense", metrics: DEFENSE_OVERALL_METRICS },
  { id: "defense-pass", label: "Pass Defense", metrics: DEFENSE_PASS_METRICS },
  { id: "defense-run", label: "Run Defense", metrics: DEFENSE_RUN_METRICS },
] as const;

// ---------------------------------------------------------------------------
// Offense vs Defense pairings
//
// Straight comparison only. No aggregate matchup score, projected advantage or
// weighted grade is derived from these pairings in this phase.
// ---------------------------------------------------------------------------

export type NflMetricPairing = {
  id: string;
  label: string;
  /** Metric shown for the team with the ball. */
  offenseKey: string;
  /** Opposing-defense metric shown alongside it. */
  defenseKey: string;
  help?: string;
};

export type NflMetricPairingGroup = {
  id: string;
  label: string;
  pairings: readonly NflMetricPairing[];
};

export const UNIT_BATTLE_GROUPS: readonly NflMetricPairingGroup[] = [
  {
    id: "unit-overall",
    label: "Overall",
    pairings: [
      { id: "epaPerPlay", label: "EPA / Play", offenseKey: "off.epaPerPlay", defenseKey: "def.epaPerPlayAllowed" },
      { id: "successRate", label: "Success Rate", offenseKey: "off.successRate", defenseKey: "def.successRateAllowed" },
      { id: "yardsPerPlay", label: "Yards / Play", offenseKey: "off.yardsPerPlay", defenseKey: "def.yardsPerPlayAllowed" },
      { id: "firstDowns", label: "1st Downs / Play", offenseKey: "off.firstDownsPerPlay", defenseKey: "def.firstDownsPerPlayAllowed" },
      { id: "thirdDown", label: "3rd Down Conversion", offenseKey: "off.thirdDownConversion", defenseKey: "def.thirdDownConversionAllowed" },
    ],
  },
  {
    id: "unit-passing",
    label: "Passing",
    pairings: [
      { id: "epaPerPass", label: "EPA / Pass", offenseKey: "off.epaPerPass", defenseKey: "def.epaPerPassAllowed" },
      { id: "passSuccess", label: "Pass Success Rate", offenseKey: "off.passSuccessRate", defenseKey: "def.passSuccessRateAllowed" },
      { id: "passYardsPerAtt", label: "Passing Yards / Attempt", offenseKey: "off.yardsPerPassAttempt", defenseKey: "def.opponentYardsPerPassAttempt" },
      { id: "pbwrVsPrwr", label: "Pass Block vs Pass Rush", offenseKey: "off.passBlockWinRate", defenseKey: "def.passRushWinRate" },
      { id: "sacks", label: "Sacks Allowed vs Sacks", offenseKey: "off.sacksAllowedPerGame", defenseKey: "def.sacksPerGame" },
    ],
  },
  {
    id: "unit-rushing",
    label: "Rushing",
    pairings: [
      { id: "epaPerRush", label: "EPA / Rush", offenseKey: "off.epaPerRush", defenseKey: "def.epaPerRushAllowed" },
      { id: "rushSuccess", label: "Rush Success Rate", offenseKey: "off.rushSuccessRate", defenseKey: "def.rushSuccessRateAllowed" },
      { id: "rushYardsPerAtt", label: "Rush Yards / Attempt", offenseKey: "off.yardsPerRushAttempt", defenseKey: "def.opponentYardsPerRushAttempt" },
      { id: "rbwrVsRswr", label: "Run Block vs Run Stop", offenseKey: "off.runBlockWinRate", defenseKey: "def.runStopWinRate" },
    ],
  },
] as const;

/** The four line-of-scrimmage battles surfaced in the Trenches section. */
export const TRENCH_BATTLES: readonly NflMetricPairing[] = [
  {
    id: "pass-protection",
    label: "Pass Block vs Pass Rush",
    offenseKey: "off.passBlockWinRate",
    defenseKey: "def.passRushWinRate",
    help: "Offensive line pass protection against the opposing pass rush.",
  },
  {
    id: "run-blocking",
    label: "Run Block vs Run Stop",
    offenseKey: "off.runBlockWinRate",
    defenseKey: "def.runStopWinRate",
    help: "Offensive line run blocking against the opposing run front.",
  },
] as const;

// ---------------------------------------------------------------------------
// Market profile (descriptive only — no projected line, no pick)
// ---------------------------------------------------------------------------

/**
 * Descriptive market profile.
 *
 * "Historical market spread" rather than "closing spread": the source publishes
 * one settled line per game and does not document it as an independently
 * verified sportsbook close, so the label must not overstate that.
 *
 * Only the two differentials are higher-is-better. Raw ATS and over/under
 * records are context-only — an over-heavy team is not thereby a better team.
 */
export const MARKET_PROFILE_METRICS: readonly NflMatchupMetricDef[] = [
  { key: "mkt.record", label: "W/L Record", direction: "context-only", format: "record" },
  { key: "mkt.atsRecord", label: "ATS Record", direction: "context-only", format: "record", help: "Wins-losses-pushes against the historical market spread." },
  { key: "mkt.pointDifferential", label: "Point Differential", direction: "higher-is-better", format: "decimal1", help: "Average scoring margin per game." },
  { key: "mkt.atsDifferential", label: "ATS Differential", direction: "higher-is-better", format: "decimal1", help: "Average margin against the historical market spread. Positive means the team beat its line." },
  { key: "mkt.atsDifferentialSplit", label: "ATS Differential (Home/Away)", shortLabel: "ATS Diff Home/Away", direction: "higher-is-better", format: "decimal1", help: "Average ATS margin at home and on the road. Neutral-site games are excluded from both." },
  { key: "mkt.homeAtsRecord", label: "Home ATS Record", shortLabel: "Home ATS", direction: "context-only", format: "record", help: "True home games only — neutral-site games are excluded." },
  { key: "mkt.awayAtsRecord", label: "Away ATS Record", shortLabel: "Away ATS", direction: "context-only", format: "record", help: "True road games only — neutral-site games are excluded." },
  { key: "mkt.overUnderRecord", label: "Over/Under Record", shortLabel: "O/U Record", direction: "context-only", format: "record", help: "Overs-unders-pushes against the historical market total." },
] as const;

// ---------------------------------------------------------------------------
// Injury impact
// ---------------------------------------------------------------------------

/**
 * Game designation from the official weekly report. `null` is a real state:
 * a player can appear on the report with a practice note and no designation.
 */
export type NflGameStatus = "OUT" | "DOUBTFUL" | "QUESTIONABLE";

/** Weekly practice participation. Separate from, and never a substitute for,
 *  the game designation. */
export type NflPracticeStatus = "DID_NOT_PARTICIPATE" | "LIMITED" | "FULL";

/**
 * Long-term roster status, deliberately generic.
 *
 * nflverse publishes no authoritative dictionary for its RES/* sub-codes, so
 * IR, PUP and NFI are NOT distinguished. Do not add them until that mapping is
 * confirmed. ACT / INA / DEV are never Reserve, and practice squad is never
 * presented as an injury.
 */
export type NflReserveStatus = "RESERVE";

/** Designations counted toward the "unavailable" snap-exposure bucket. */
export const UNAVAILABLE_GAME_STATUSES: readonly NflGameStatus[] = ["OUT", "DOUBTFUL"] as const;

/**
 * Positions excluded from injury exposure entirely — specialists whose snap
 * share is not comparable to offensive/defensive participation.
 */
export const EXCLUDED_INJURY_POSITIONS: readonly string[] = ["K", "P", "LS"] as const;

export type NflInjuryUnit = "offense" | "defense";

export type NflInjuryEntry = {
  playerId: string;
  playerName: string;
  position: string;
  /** Roster depth-chart label (OLB vs LB). Presentation only — never decides the unit. */
  depthChartPosition: string | null;
  unit: NflInjuryUnit;

  gameStatus: NflGameStatus | null;
  practiceStatus: NflPracticeStatus | null;
  reserveStatus: NflReserveStatus | null;
  injuryDescription: string | null;

  /**
   * Unit snap share in the team's most recent completed regular-season game,
   * 0-100. Null means the player did not dress — never assume 0.
   */
  lastGameSnapPct: number | null;
  /** Season-to-date unit snap share, 0-100. */
  seasonSnapPct: number | null;
};

/**
 * Summed snap share for a bucket. Deliberately *not* called "total snaps" —
 * it is overlapping exposure across players, not a share of team snaps.
 */
export type NflInjurySnapExposure = {
  unavailablePct: number;
  questionablePct: number;
};

/** Designation counts for the compact per-team summary. */
export type NflInjuryStatusCounts = {
  out: number;
  doubtful: number;
  questionable: number;
  reserve: number;
};

export type NflTeamInjuryProfile = {
  entries: readonly NflInjuryEntry[];
  summary: NflInjuryStatusCounts;
};

/** Looks up a team's injury profile. `null` means the feed is not connected. */
export type NflInjuryResolver = (teamSlug: string) => NflTeamInjuryProfile | null;

/** Resolver used when the injury artifact is missing or not yet available. */
export const unavailableInjuryResolver: NflInjuryResolver = () => null;

/** True when a player's position is a special-teams specialist. */
export function isExcludedInjuryPosition(position: string): boolean {
  return EXCLUDED_INJURY_POSITIONS.includes(position.toUpperCase());
}

/**
 * Which exposure bucket a designation falls into, or null when it counts in
 * neither. Reserve is shown for context but is not week-specific exposure.
 */
export function injuryExposureBucket(
  gameStatus: NflGameStatus | null
): "unavailable" | "questionable" | null {
  if (gameStatus == null) return null;
  if (UNAVAILABLE_GAME_STATUSES.includes(gameStatus)) return "unavailable";
  if (gameStatus === "QUESTIONABLE") return "questionable";
  return null;
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

const ALL_METRIC_DEFS: readonly NflMatchupMetricDef[] = [
  ...OFFENSE_OVERALL_METRICS,
  ...OFFENSE_PASSING_METRICS,
  ...OFFENSE_RUSHING_METRICS,
  ...DEFENSE_OVERALL_METRICS,
  ...DEFENSE_PASS_METRICS,
  ...DEFENSE_RUN_METRICS,
  ...MARKET_PROFILE_METRICS,
];

const METRIC_DEF_BY_KEY = new Map(ALL_METRIC_DEFS.map((def) => [def.key, def]));

export function getMetricDef(key: string): NflMatchupMetricDef | null {
  return METRIC_DEF_BY_KEY.get(key) ?? null;
}

/** Every metric key the analyzer knows about. Used by tests and future ingestion. */
export function getAllMetricKeys(): string[] {
  return ALL_METRIC_DEFS.map((def) => def.key);
}
