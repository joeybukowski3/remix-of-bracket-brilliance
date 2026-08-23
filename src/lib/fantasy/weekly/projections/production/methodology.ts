import { WEEKLY_FANTASY_PROJECTION_MODEL_VERSION, getCurrentFrozenModelAuthority } from "../model/frozenSpec";
import { WEEKLY_FANTASY_PRODUCTION_CONTEXT_POLICY_VERSION } from "./context";
import type { FantasyPosition } from "@/lib/fantasy/rankings";

/**
 * PRODUCTION methodology authority for `weekly-fantasy-projection-v1` plus
 * the `weekly-fantasy-production-context-v1` policy layer. This is the ONLY
 * source the public copy (the "How JKB Projections Work" panel) may read
 * from. It is deliberately separate from, and never imports,
 * `../projections-v2/methodology.ts` / `METHODOLOGY.md` -- that file
 * documents REJECTED research (learned implied-team-total coefficients,
 * learned opponent-adjusted defense, QB calibration) and must never reach a
 * production consumer.
 *
 * Every claim below is derived directly from `frozenSpec.ts` (V1 baseline/
 * usage/team-context) so UI copy cannot drift from the actual frozen model
 * configuration: if a future model version changes what's active for a
 * position, this file's assertions (exercised by `methodology.test.ts`) fail
 * until the matrix below is updated to match. The scoring-environment and
 * opponent-FPA columns are always `true` for every position -- they are a
 * product-policy layer applied uniformly, not a per-position learned toggle.
 */
export const PRODUCTION_METHODOLOGY_MODEL_VERSION = WEEKLY_FANTASY_PROJECTION_MODEL_VERSION;
export const PRODUCTION_METHODOLOGY_CONTEXT_POLICY_VERSION = WEEKLY_FANTASY_PRODUCTION_CONTEXT_POLICY_VERSION;

export type MethodologyPositionRow = {
  position: FantasyPosition;
  baseline: true; // every position always has a baseline
  usage: boolean;
  teamContext: boolean;
  impliedTotal: true; // scoring-environment context is active for every position
  opponentFpa: true; // opponent-FPA context is active for every position
  /** Plain-language summary of what's active for this position, safe to render verbatim. */
  summary: string;
};

export const PRODUCTION_METHODOLOGY_POSITION_MATRIX: readonly MethodologyPositionRow[] = [
  {
    position: "QB",
    baseline: true, usage: false, teamContext: false, impliedTotal: true, opponentFpa: true,
    summary: "QB projections use the baseline plus team scoring environment and opponent matchup context. Tested usage and matchup-residual adjustments for QB did not clear JKB's historical validation and calibration requirements, so no learned usage adjustment is active.",
  },
  {
    position: "RB",
    baseline: true, usage: true, teamContext: true, impliedTotal: true, opponentFpa: true,
    summary: "RB projections start from the baseline and, once a player has current-season usage and team-context data, add a validated adjustment for recent usage (carries, targets, receptions) and team offensive context, plus team scoring environment and opponent matchup context.",
  },
  {
    position: "WR",
    baseline: true, usage: true, teamContext: false, impliedTotal: true, opponentFpa: true,
    summary: "WR projections start from the baseline and, once a player has current-season usage data, add a validated adjustment for recent usage (targets, receptions, air yards), plus team scoring environment and opponent matchup context.",
  },
  {
    position: "TE",
    baseline: true, usage: true, teamContext: false, impliedTotal: true, opponentFpa: true,
    summary: "TE projections start from the baseline and, once a player has current-season usage data, add a validated adjustment for recent usage (targets, receptions, air yards), plus team scoring environment and opponent matchup context.",
  },
];

export const PRODUCTION_METHODOLOGY_GENERAL_SUMMARY =
  "JKB projections combine a player's scoring baseline, validated player-usage adjustments where applicable (RB, WR, TE), team scoring environment from the market implied team total, and opponent fantasy points allowed vs. the player's position. Every learned model factor is tested on multiple historical NFL seasons before being promoted into production; the scoring-environment and opponent-matchup adjustments are small, bounded, deterministic policy adjustments layered on top.";

export const PRODUCTION_METHODOLOGY_YEAR_BLEND_NOTE =
  "Early in the season, opponent matchup strength relies mostly on the previous season. As new games are played, current-season results receive progressively more weight.";

export const PRODUCTION_METHODOLOGY_WEEK1_NOTE =
  "Week 1: the baseline is active for every position. Team scoring environment is active whenever current market data exists. Opponent matchup context uses last season's fantasy points allowed. RB, WR and TE usage adjustments remain inactive until current-season data exists.";

export const PRODUCTION_METHODOLOGY_WEEK2_NOTE =
  "Week 2 and later: validated RB, WR and TE usage adjustments activate automatically once a player has an actual pregame current-season usage feature available. Opponent matchup context automatically shifts weight toward current-season results as more games are played. QB never gets a learned usage adjustment, but scoring-environment and opponent-matchup context remain active.";

export const PRODUCTION_METHODOLOGY_DISCLAIMERS: readonly string[] = [
  "Scoring is JKB Full PPR.",
  "No target-week results, snaps, or stats are ever used -- only information known before kickoff.",
  "A learned model factor must be tested and validated against multiple historical NFL seasons before it can be added to a live projection.",
  "Team scoring environment and opponent-matchup adjustments are small, bounded, deterministic product-policy adjustments -- not learned/fit model coefficients -- and cannot overwhelm a player's baseline or usage-based projection.",
  "Injury-status adjustments are NOT active inputs to any current projection.",
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
