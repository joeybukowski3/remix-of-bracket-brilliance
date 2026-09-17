/**
 * Canonical DFS practical-pool restriction.
 *
 * Sits above the WU3 optimizer-eligibility pipeline (see optimizerEligibility.ts)
 * as a stricter, purely presentational/selection gate:
 *
 *   base optimizer eligibility + DFS practical pool eligibility = selectable DFS player
 *
 * This never adjusts a JKB projection, a JKB Weekly Position Rank, a matchup
 * model, or a DraftKings scoring rule -- it only decides whether an
 * already-ranked player belongs in the practical DFS board/optimizer/lineup
 * pool at all. Intentionally biased toward false negatives: a fringe player
 * who might theoretically be usable is hidden rather than cluttering the
 * board with backups that would never realistically be rostered.
 *
 * The rank used is the same canonical JKB Weekly Position Rank
 * (`jkbWeeklyPositionRank`) already displayed in the DFS table -- this module
 * never recomputes or reinterprets that rank.
 */

import type { DfsEnrichedAnalyzerRow } from "./slateAnalyzer";

/** V1 hard position rank caps. Change here only -- never duplicate these values elsewhere. */
export const DFS_POSITION_RANK_CAPS: Readonly<Record<"QB" | "RB" | "WR" | "TE", number>> = {
  QB: 24,
  RB: 50,
  WR: 72,
  TE: 30,
};

/** DK CSV statuses that are definitively unavailable, independent of freshness/staleness policy. */
const DEFINITIVELY_UNAVAILABLE_DK_STATUSES = new Set(["OUT", "IR"]);

/** Role-context availability outcomes (see roleContext.ts) treated as definitively unavailable. */
const DEFINITIVELY_UNAVAILABLE_ROLE_STATUSES = new Set(["out", "reserve"]);

function isDefinitivelyUnavailable(row: DfsEnrichedAnalyzerRow): boolean {
  const dkStatus = row.dkStatus?.trim().toUpperCase();
  if (dkStatus && DEFINITIVELY_UNAVAILABLE_DK_STATUSES.has(dkStatus)) return true;
  if (row.kind === "offense" && row.roleContext?.availability != null
    && DEFINITIVELY_UNAVAILABLE_ROLE_STATUSES.has(row.roleContext.availability)) return true;
  return false;
}

/**
 * Whether a row belongs in the practical DFS candidate pool: the board, the
 * optimizer's candidate pool, and generated-lineup validation all defer to
 * this single rule so a player outside the pool never clutters the board and
 * never unexpectedly appears in a generated lineup.
 *
 * DST is intentionally exempt from the rank cap -- all valid slate defenses
 * are kept -- but is still subject to definitive-unavailability exclusion.
 */
export function isDfsCandidatePoolPlayer(row: DfsEnrichedAnalyzerRow): boolean {
  if (isDefinitivelyUnavailable(row)) return false;
  if (row.kind === "dst") return true;
  const cap = DFS_POSITION_RANK_CAPS[row.position];
  // No canonical JKB Weekly Position Rank to evaluate against the cap: prefer
  // the false negative and exclude, per the practical-pool design goal.
  if (row.jkbWeeklyPositionRank == null) return false;
  return row.jkbWeeklyPositionRank <= cap;
}

/** Restricts a row set to the practical DFS candidate pool. Order is preserved. */
export function filterDfsCandidatePool<T extends DfsEnrichedAnalyzerRow>(rows: readonly T[]): T[] {
  return rows.filter(isDfsCandidatePoolPlayer);
}
