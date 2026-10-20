/**
 * Evaluation report shapes. Plain JSON-serializable data (no Maps, no
 * functions) so a report can be hashed, stored and diffed.
 */
import type { CalibrationBin, ErrorSummary, ProbabilityScore } from "./metrics";
import type { BaselinePriors } from "../projection";
import type { ProjectedStat } from "../types";
import type { AvailabilityModelId, ConditionalMethodId, FoldSpec } from "./types";

export type StatErrors = Record<ProjectedStat, ErrorSummary>;
export type ByMethod = Record<ConditionalMethodId, StatErrors>;

export interface SegmentSummary {
  n: number;
  byMethod: ByMethod;
}

/** Accuracy of conditional-on-playing projections, scored only on games the player played. */
export interface ConditionalSummary {
  targets: number;
  /** Each method on every target where it is defined. */
  byMethod: ByMethod;
  /** Share of targets where a method is undefined (no qualifying history). */
  missingRate: Record<ConditionalMethodId, number>;
  /** All methods on the identical subset where every method is defined. */
  commonSample: SegmentSummary;
  /** Common-sample results by segment name, then bucket. */
  segments: Record<string, Record<string, SegmentSummary>>;
}

/** Accuracy of P(player appears), scored only where participation was established. */
export interface AvailabilitySummary {
  universe: number;
  excluded: {
    unestablished: number;
    /** Unestablished absences by pregame status ("none" = no snapshot): where final-status coverage is thin. */
    unestablishedByStatus: Record<string, number>;
    playedOutsideUniverse: number;
  };
  /** Universe members with no pregame status snapshot before the cutoff. */
  withoutPregameStatus: number;
  byModel: Record<AvailabilityModelId, ProbabilityScore>;
  calibration: Record<AvailabilityModelId, CalibrationBin[]>;
  byStatus: Record<string, { n: number; observedRate: number }>;
  /** Established-universe minutes error with and without the availability probability. */
  unconditionalMinutes: { conditionalOnly: ErrorSummary; availabilityWeighted: ErrorSummary };
}

export interface Diagnostics {
  validationGamesScheduled: number;
  gamesWithoutResults: number;
  neutralSiteGames: number;
  /** Player rows whose game is absent from the schedule; they can never be used as history. */
  unscheduledRows: number;
  /** Availability snapshots dated at or after a game's cutoff and therefore ignored. */
  availabilityIgnoredAsLate: number;
  /** Pregame inputs found at or after their target's cutoff. Must be 0. */
  leakageInvariantViolations: number;
}

export interface FoldReport {
  spec: FoldSpec;
  trainingRows: number;
  priors: BaselinePriors;
  /** Participation rate learned from the training window and used as the v1 prior. */
  participationPrior: number;
  usageTerciles: [number, number] | null;
  conditional: { targets: number; byMethod: ByMethod };
  availability: { universe: number; byModel: Record<AvailabilityModelId, ProbabilityScore> };
}

export interface ReportBody {
  folds: FoldReport[];
  pooled: { conditional: ConditionalSummary; availability: AvailabilitySummary };
  diagnostics: Diagnostics;
  /** First and last feature-cutoff instants over scored validation games. */
  cutoffRange: { first: string; last: string } | null;
}
