import type { FantasyPosition } from "@/lib/fantasy/rankings";

/**
 * Phase 1 modeling dataset contract for true weekly fantasy point projections
 * (`projectedFantasyPoints`, QB/RB/WR/TE). This is a DATASET FOUNDATION artifact
 * only — it never carries a model prediction, only leakage-safe pregame
 * features and the realized `jkb-full-ppr-v1.0.0` outcome.
 *
 * Distinct from (do not conflate with):
 *  - ROS projected PPG / current-season PPG (public site display metrics)
 *  - baseline ranking score / matchup grade / PAR (productionAuthority.ts family)
 *  - the Phase B backtest's reduced ridge-regression feature set (featureRegistry.ts)
 *
 * Naming convention (see src/lib/fantasy/weekly/README.md "Phase B backtest
 * boundary" for the sibling convention this extends):
 *   - `<stat>SeasonPrior`  = mean of `<stat>` across the player's CURRENT
 *     season games strictly before week N (season-to-date rate, N-1 safe).
 *   - `<stat>Last3`        = mean of `<stat>` across the player's most recent
 *     up-to-3 CURRENT season games strictly before week N.
 *   - `priorSeason<Stat>`  = aggregate of `<Stat>` from the player's PREVIOUS
 *     NFL season (season - 1), entirely before the modeled season begins.
 */
export const WEEKLY_FANTASY_PROJECTION_TRAINING_ROW_SCHEMA_VERSION =
  "weekly-fantasy-projection-training-row-v2" as const;

export type StarterStatus = "unknown";

export type WeeklyFantasyProjectionTrainingRow = {
  schemaVersion: typeof WEEKLY_FANTASY_PROJECTION_TRAINING_ROW_SCHEMA_VERSION;

  // Identity / target
  season: number;
  week: number;
  playerId: string; // canonical "gsis:<id>"
  playerName: string;
  position: FantasyPosition;
  team: string;
  opponent: string;
  homeAway: "home" | "away";
  kickoff: string | null; // ISO date (nfldata gameday; no verified kickoff time pre-2023)

  // Phase 1B two-tier eligibility (see README "Phase 1B eligibility audit").
  // `historicalUniverseEligible` is the defensible roster-based research
  // universe inherited from `backtest/universe.ts` (week-effective ACT roster
  // status; RES/RET and non-ACT roster rows excluded). Injury-report status
  // is resolved in `injuryExclusionMode: "context-only"` -- it is NOT used to
  // exclude a row, because the source's `date_modified` cannot be proven to
  // precede kickoff (sampled values reach into the target week's game day).
  // Every row in this dataset already satisfies this by construction, so the
  // field is always `true` today; it is carried on the row so a future
  // loosened or tightened universe policy is self-describing per row rather
  // than only documented out-of-band.
  historicalUniverseEligible: boolean;
  // `projectionCandidate` is a STRICTLY leakage-safe (N-1 only) signal for
  // whether a player has enough prior usage to realistically be worth a
  // model-produced projection (as opposed to a deep-roster/practice-squad-
  // adjacent player who happens to be a roster-status zero). Derived only
  // from prior-season and current-season-to-date (strictly before week N)
  // rows -- never from week-N stats, snaps, or outcome.
  projectionCandidate: boolean;

  actualFantasyPoints: number; // jkb-full-ppr-v1.0.0

  // Historical prior policy (previous NFL season aggregates)
  hasPriorSeason: boolean;
  rookieOrNoPriorHistory: boolean;
  priorSeasonPpg: number | null;
  priorSeasonGames: number | null;
  priorSeasonAttempts: number | null;
  priorSeasonCarries: number | null;
  priorSeasonTargets: number | null;
  priorSeasonReceptions: number | null;
  priorSeasonSnapRate: number | null; // always null in v1; see README snap policy

  // Shared current-season features (N-1 only)
  gamesPlayedPrior: number;
  weeksSinceLastAppearance: number | null;
  seasonPpgPrior: number | null;
  last3PpgPrior: number | null;
  last5PpgPrior: number | null;
  teamChangedFromPriorSeason: boolean | null;

  // QB features
  passAttemptsSeasonPrior: number | null;
  passAttemptsLast3: number | null;
  passingYardsSeasonPrior: number | null;
  passingTdsSeasonPrior: number | null;
  interceptionsSeasonPrior: number | null;
  carriesSeasonPrior: number | null;
  rushingYardsSeasonPrior: number | null;
  rushingTdsSeasonPrior: number | null;

  // RB features
  carriesLast3: number | null;
  targetsSeasonPrior: number | null;
  targetsLast3: number | null;
  receptionsSeasonPrior: number | null;
  rushYardsSeasonPrior: number | null;
  receivingYardsSeasonPrior: number | null;
  targetShareSeasonPrior: number | null;

  // WR/TE features
  receivingAirYardsSeasonPrior: number | null;
  airYardsShareSeasonPrior: number | null;

  // Snap usage (only where GSIS<->PFR linkage is deterministic; see coverage report)
  snapShareSeasonPrior: number | null;
  snapShareLast3: number | null;
  snapCoverageAvailable: boolean;

  // Team features (N-1 only, from epa-team-game / stats-team-week)
  teamOffensiveEpaPrior: number | null;
  teamPassEpaPrior: number | null;
  teamRushEpaPrior: number | null;
  teamOffensivePlaysPrior: number | null;
  teamPassRatePrior: number | null;

  // Opponent features (N-1 only)
  opponentDefensiveEpaPrior: number | null;
  opponentPassDefenseEpaPrior: number | null;
  opponentRushDefenseEpaPrior: number | null;

  // Fantasy points allowed (leakage-safe, built from player-week outcomes)
  opponentPositionFpaPrior: number | null;
  opponentPositionFpaGamesPrior: number;
  opponentPositionFpaPriorSeason: number | null;

  // Schedule context
  shortWeek: boolean | null;
  byeReturn: boolean | null;
  restDays: number | null;

  // Starter/depth-chart policy
  starterStatus: StarterStatus;

  // Provenance / as-of metadata
  provenance: {
    generatedAt: string;
    sourceManifests: readonly {
      cache: string;
      season: number | null;
      filename: string;
      retrievedDateUtc: string;
      sha256: string;
    }[];
    scheduleSource: {
      url: string;
      retrievedAtUtc: string;
      sha256: string;
    };
  };
};
