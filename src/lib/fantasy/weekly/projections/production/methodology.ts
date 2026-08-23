import { WEEKLY_FANTASY_PROJECTION_MODEL_VERSION, getCurrentFrozenModelAuthority } from "../model/frozenSpec";
import type { FantasyPosition } from "@/lib/fantasy/rankings";

/**
 * PRODUCTION methodology authority for `weekly-fantasy-projection-v1`. This
 * is the ONLY source public copy (the "How JKB Projections Work" panel) may
 * read from. It is deliberately separate from, and never imports,
 * `../projections-v2/methodology.ts` / `METHODOLOGY.md` -- that file
 * documents REJECTED research (implied team total, opponent-adjusted
 * defense, QB calibration) and must never reach a production consumer.
 *
 * Every claim below is derived directly from `frozenSpec.ts` so UI copy
 * cannot drift from the actual frozen model configuration: if a future model
 * version changes what's active for a position, this file's assertions
 * (exercised by `methodology.test.ts`) fail until the matrix below is
 * updated to match.
 */
export const PRODUCTION_METHODOLOGY_MODEL_VERSION = WEEKLY_FANTASY_PROJECTION_MODEL_VERSION;

export type MethodologyPositionRow = {
  position: FantasyPosition;
  baseline: true; // every position always has a baseline
  usage: boolean;
  teamContext: boolean;
  /** Plain-language summary of what's active for this position, safe to render verbatim. */
  summary: string;
};

export const PRODUCTION_METHODOLOGY_POSITION_MATRIX: readonly MethodologyPositionRow[] = [
  {
    position: "QB",
    baseline: true, usage: false, teamContext: false,
    summary: "QB projections use the baseline only. Tested usage and matchup adjustments for QB did not clear JKB's historical validation and calibration requirements, so none are active.",
  },
  {
    position: "RB",
    baseline: true, usage: true, teamContext: true,
    summary: "RB projections start from the baseline and, once a player has current-season usage and team-context data, add a validated adjustment for recent usage (carries, targets, receptions) and team offensive context.",
  },
  {
    position: "WR",
    baseline: true, usage: true, teamContext: false,
    summary: "WR projections start from the baseline and, once a player has current-season usage data, add a validated adjustment for recent usage (targets, receptions, air yards).",
  },
  {
    position: "TE",
    baseline: true, usage: true, teamContext: false,
    summary: "TE projections start from the baseline and, once a player has current-season usage data, add a validated adjustment for recent usage (targets, receptions, air yards).",
  },
];

export const PRODUCTION_METHODOLOGY_GENERAL_SUMMARY =
  "JKB starts with a player's expected fantasy scoring baseline and, once the season begins, adjusts eligible RB, WR and TE projections using validated recent usage and team-context signals. Every model factor is tested on multiple historical NFL seasons before being promoted into production.";

export const PRODUCTION_METHODOLOGY_WEEK1_NOTE =
  "Week 1: every position uses the baseline only, because no current-season usage exists yet for any player.";

export const PRODUCTION_METHODOLOGY_WEEK2_NOTE =
  "Week 2 and later: validated RB, WR and TE adjustments activate automatically once a player has an actual pregame current-season usage feature available. QB always remains baseline-only.";

export const PRODUCTION_METHODOLOGY_DISCLAIMERS: readonly string[] = [
  "Scoring is JKB Full PPR.",
  "No target-week results, snaps, or stats are ever used -- only information known before kickoff.",
  "A model factor must be tested and validated against multiple historical NFL seasons before it can be added to a live projection.",
  "Implied team total, opponent-adjusted defense strength, betting-market data, and injury-status adjustments are NOT active inputs to any current projection -- they were researched and did not clear validation.",
];

/**
 * Fails closed if a position's declared matrix row ever disagrees with the
 * frozen spec it's supposed to describe -- see `methodology.test.ts`.
 */
export function assertMethodologyMatchesFrozenSpec(): void {
  for (const row of PRODUCTION_METHODOLOGY_POSITION_MATRIX) {
    const spec = getCurrentFrozenModelAuthority(row.position);
    const usageActive = spec.state !== "BASELINE_ONLY" && spec.featureBlocks.includes("usage");
    const teamContextActive = spec.state !== "BASELINE_ONLY" && spec.featureBlocks.includes("teamContext");
    if (row.usage !== usageActive) {
      throw new Error(`Methodology matrix "usage" for ${row.position} (${row.usage}) does not match frozen spec (${usageActive}).`);
    }
    if (row.teamContext !== teamContextActive) {
      throw new Error(`Methodology matrix "teamContext" for ${row.position} (${row.teamContext}) does not match frozen spec (${teamContextActive}).`);
    }
  }
}
