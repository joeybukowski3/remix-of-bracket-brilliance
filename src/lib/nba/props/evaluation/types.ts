/**
 * Phase 4A evaluation framework: shared types.
 *
 * The framework consumes canonical datasets (NbaPlayerGame / NbaTeamGame plus
 * a schedule with tipoff instants and pregame availability snapshots) from any
 * source. A real source is accepted only through the license gate in runner.ts.
 */
import type { NbaAvailabilityRecord, NbaSourceId } from "../sources/types";
import type { NbaSeasonType } from "../seasonType";
import type { NbaPlayerGame, NbaTeamGame } from "../types";

export interface ScheduledGame {
  gameId: string;
  /** Eastern calendar date (YYYY-MM-DD); must equal the Eastern date of `tipoffUtc`. */
  gameDate: string;
  season: string;
  seasonType: NbaSeasonType;
  /** UTC instant with an explicit offset. */
  tipoffUtc: string;
  homeTeamId: number | null;
  awayTeamId: number | null;
  /** No home team (cup finals, international games). */
  neutralSite: boolean;
  /** Required for neutral-site games: the two teams, known from the schedule before tipoff. */
  participantTeamIds?: readonly [number, number];
}

/**
 * Post-game established non-participation: the source states the player did not
 * play. Without a box-score row or one of these, a player's absence is
 * UNESTABLISHED and is never scored as a zero-minute game.
 */
export interface FinalStatusRecord {
  gameId: string;
  playerId: number;
  teamId: number;
  status: "inactive" | "dnp" | "out";
}

export type DatasetProvenance =
  | { kind: "synthetic-generator"; generator: string; fixtureVersion: string; seed: number }
  | { kind: "source-snapshots"; snapshotIds: readonly string[] };

export interface EvaluationDataset {
  sourceId: NbaSourceId;
  playerGames: readonly NbaPlayerGame[];
  teamGames: readonly NbaTeamGame[];
  schedule: readonly ScheduledGame[];
  /** Pregame snapshots, each with the instant it was current. */
  availability: readonly NbaAvailabilityRecord[];
  finalStatuses: readonly FinalStatusRecord[];
  provenance: DatasetProvenance;
}

export interface CutoffPolicy {
  /** Features are frozen this many minutes before tipoff. */
  leadMinutes: number;
  /** A game's result may be used only this long after its tipoff (game length plus reporting delay). */
  resultLagMinutes: number;
}

/** Inclusive Eastern dates. Training strictly precedes validation. */
export interface FoldSpec {
  name: string;
  trainStart: string;
  trainEnd: string;
  validationStart: string;
  validationEnd: string;
}

export const CONDITIONAL_METHODS = ["previous_game", "last_5", "last_10", "season_to_date", "jkb_baseline_v0", "jkb_minutes_v1"] as const;
export type ConditionalMethodId = (typeof CONDITIONAL_METHODS)[number];
export const NAIVE_METHODS: readonly ConditionalMethodId[] = ["previous_game", "last_5", "last_10", "season_to_date"];

export const AVAILABILITY_MODELS = ["constant_rate", "history_rate", "status_aware"] as const;
export type AvailabilityModelId = (typeof AVAILABILITY_MODELS)[number];
