import type { CfbResearchPlayCategory } from "./types";

/**
 * All Phase 1 research thresholds live here so they are centrally
 * documented and swappable — none of these are permanent Model V2 truths
 * (Sections 4, 6, 7, 8, 10 all call this out explicitly).
 */
export const CFB_PHASE1_METRICS_CONFIG = Object.freeze({
  // Section 4 — categories excluded from offensive/defensive efficiency metrics.
  ineligibleScrimmageCategories: Object.freeze<CfbResearchPlayCategory[]>([
    "punt",
    "kickoff",
    "field_goal",
    "pat",
    "penalty_no_play",
    "kneel",
    "spike",
    "administrative",
  ]),

  // Section 5 — minimum PPA coverage pct (0-100) for a team-game to be
  // flagged "metricsAvailable" for PPA-dependent metrics downstream.
  minimumUsablePpaCoveragePct: 50,

  // Section 6A — JKB PPA success.
  ppaSuccessThreshold: 0, // providerPpa > 0

  // Section 6B — JKB down/distance success (gain as % of distance needed).
  downDistanceSuccessThresholds: Object.freeze({ 1: 0.5, 2: 0.7, 3: 1.0, 4: 1.0 }) as Readonly<
    Record<number, number>
  >,

  // Passing-down definition (Section 6B candidate default): 2nd & 8+, 3rd/4th & 5+.
  passingDownRule: Object.freeze({ down2MinDistance: 8, down3Or4MinDistance: 5 }),

  // Section 7 — explosive-play thresholds (research defaults).
  explosivePassYards: 20,
  explosiveRushYards: 12,

  // Section 8 — situation-neutral pace.
  situationNeutral: Object.freeze({
    maxAbsScoreMargin: 16,
    excludeFinalSecondsOfHalf: 120,
    regulationOnly: true,
  }),

  // Section 10 — SCORE_QUARTER garbage-time thresholds (research defaults;
  // Q1 is never automatically garbage time regardless of margin).
  scoreQuarterThresholds: Object.freeze({ 2: 45, 3: 35, 4: 28 }) as Readonly<Record<number, number>>,

  // Section 10 — SOFT_WEIGHT: linear ramp-down of play weight between
  // rampStartMargin and rampFullZeroMargin (deliberately simple, per
  // "Do not overengineer this").
  softWeight: Object.freeze({ rampStartMargin: 21, rampFullZeroMargin: 45, minWeight: 0.1 }),
});
