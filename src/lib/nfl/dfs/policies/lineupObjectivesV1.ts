/**
 * WU8 generated-lineup objective policy, v1.
 *
 * These are TRANSPARENT PRODUCT HEURISTICS chosen by hand, not calibrated
 * DFS expected-value coefficients and not fitted model weights. Nothing here
 * changes a JKB fantasy projection, an optimizer-eligibility decision, a DFS
 * rank, or a DST matchup score -- every input is read from an existing
 * authority and only re-weighted for lineup selection.
 *
 * Directionality rule: every component is normalized so that a HIGHER
 * normalized value is always better for the strategy that uses it.
 *
 * This file is the single source of truth for the weights the UI displays.
 * Do not restate a weight in copy; render it from here.
 */

export const LINEUP_OBJECTIVE_VERSION = "nfl-dfs-lineup-objective-v1" as const;

/** Strategy keys, in the order the UI presents them. */
export const LINEUP_STRATEGIES = ["ceiling", "floor", "balanced"] as const;
export type LineupStrategy = (typeof LINEUP_STRATEGIES)[number];

export const LINEUP_STRATEGY_LABELS: Record<LineupStrategy, string> = {
  ceiling: "Highest Ceiling Lineup",
  floor: "Highest Floor Lineup",
  balanced: "Balanced JKB Lineup",
};

export const LINEUP_STRATEGY_GOALS: Record<LineupStrategy, string> = {
  ceiling: "Maximize high-end scoring environment and upside evidence.",
  floor: "Maximize stable workload and role certainty.",
  balanced: "Blend projection, DK benchmark, usage, matchup, scoring environment and efficiency.",
};

/** Objective component keys. Every strategy uses a subset of these. */
export const OBJECTIVE_COMPONENTS = [
  "jkbProjection",
  "matchup",
  "scoringEnvironment",
  "upsideProxy",
  "usageRole",
  "workloadEvidence",
  "dkBenchmark",
  "salaryEfficiency",
  "dstMatchup",
] as const;
export type ObjectiveComponent = (typeof OBJECTIVE_COMPONENTS)[number];

export const OBJECTIVE_COMPONENT_LABELS: Record<ObjectiveComponent, string> = {
  jkbProjection: "JKB projected fantasy points",
  matchup: "Matchup context (EPA / success / trenches)",
  scoringEnvironment: "Team scoring environment (market implied team total)",
  upsideProxy: "Upside proxy (explosive-play evidence)",
  usageRole: "Usage and role",
  workloadEvidence: "Prior workload evidence (per game)",
  dkBenchmark: "DK Avg PPG benchmark",
  salaryEfficiency: "Salary efficiency (JKB points per $1K)",
  dstMatchup: "DST matchup percentile (WU6C)",
};

export const OBJECTIVE_COMPONENT_DEFINITIONS: Record<ObjectiveComponent, string> = {
  jkbProjection:
    "Canonical JKB Full PPR projectedFantasyPoints for the selected season/week. Never recomputed here.",
  matchup:
    "Mean of the available weekly-research matchup edges (offensive-unit rank minus opposing-unit rank, for EPA, success rate and trenches). Opponent fantasy points allowed is deliberately excluded because it is already inside the JKB projection.",
  scoringEnvironment:
    "Market implied team total from the production projection artifact's scoring-environment context, normalized across the distinct teams on the slate.",
  upsideProxy:
    "Explosive-play evidence from the weekly research companion: yards per carry and per-game touches (RB); air yards per game and target share (WR/TE). No red-zone or touchdown-probability data exists in this repository, so this is an upside PROXY, never TD equity. Unavailable for QB.",
  usageRole:
    "Projected weekly opportunity (carries and targets from the DFS lineup-context artifact) blended with a role-certainty ordinal derived from role class, role certainty and starter evidence. Missing opportunity is dropped and the remaining sub-weights are renormalized -- it is never read as zero.",
  workloadEvidence:
    "Realized point-in-time-safe workload per game from the weekly research companion's season sample: touches per game (RB), targets per game (WR/TE). Unavailable for QB.",
  dkBenchmark:
    "AvgPointsPerGame from the uploaded DraftKings CSV. A DraftKings benchmark over an unspecified window -- NOT a consensus projection and never blended into a JKB total.",
  salaryEfficiency: "JKB projected fantasy points per $1,000 of DraftKings salary.",
  dstMatchup:
    "The uploaded-slate DST matchup percentile from the WU6C DST Matchup Score v1 policy. Applies only to the DST slot.",
};

/**
 * Strategy weights. Each strategy's weights sum to 1.
 * Percentages in the product brief map 1:1 onto these fractions.
 */
export const LINEUP_STRATEGY_WEIGHTS: Record<LineupStrategy, Partial<Record<ObjectiveComponent, number>>> = {
  ceiling: {
    jkbProjection: 0.4,
    matchup: 0.2,
    scoringEnvironment: 0.15,
    upsideProxy: 0.15,
    salaryEfficiency: 0.1,
  },
  floor: {
    jkbProjection: 0.4,
    usageRole: 0.3,
    workloadEvidence: 0.15,
    matchup: 0.1,
    salaryEfficiency: 0.05,
  },
  balanced: {
    jkbProjection: 0.4,
    dkBenchmark: 0.2,
    usageRole: 0.15,
    matchup: 0.1,
    scoringEnvironment: 0.1,
    salaryEfficiency: 0.05,
  },
};

/**
 * Minimum share of a strategy's ORIGINAL weight that must be covered by
 * available components before a player receives a strategy score. Below this
 * the player keeps its optimizer eligibility and stays on the board, but has
 * no strategy score and cannot be selected for that strategy's lineup.
 */
export const MINIMUM_OBJECTIVE_COVERAGE = 0.7;

/** Sub-weights inside the composite `usageRole` component. Renormalized when a part is missing. */
export const USAGE_ROLE_SUBWEIGHTS = { opportunity: 0.6, roleCertainty: 0.4 } as const;

/**
 * Role-certainty ordinal, 0-100. These are DEFINED levels, not zero-fills:
 * "unknown" means no sourced role evidence, which is genuinely a weak floor
 * signal rather than a missing measurement.
 */
export const ROLE_CLASS_POINTS = { primary: 100, committee: 70, secondary: 45, unknown: 20, backup: 15 } as const;
export const ROLE_CERTAINTY_MODIFIERS = { sourced: 0, inferred: -10, unavailable: -20, conflicting: -30 } as const;

/**
 * DST never receives a fabricated fantasy projection. For every strategy the
 * DST slot contributes its WU6C DST matchup percentile (0-100), on the same
 * 0-100 scale as a normalized offensive strategy score.
 */
export const DST_OBJECTIVE = {
  component: "dstMatchup",
  label: "DST matchup percentile (WU6C)",
  definition:
    "The uploaded-slate DST matchup percentile from the WU6C DST Matchup Score v1 policy. It is a matchup composite, never a fantasy-point projection, and DK Avg PPG for DST is preserved as display-only benchmark context.",
} as const;

/**
 * Deterministic tie-breaking, applied in order. Documented here so the UI and
 * the tests read the same policy.
 */
export const LINEUP_TIE_BREAK_ORDER = [
  "Higher lineup objective score",
  "Higher JKB offense projected subtotal",
  "Lower salary remaining",
  "Lexicographically smallest sorted DraftKings ID sequence",
] as const;
