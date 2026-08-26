/**
 * Book classification for Phase 10B canonical NFL yardage-market selection.
 *
 * ParlayAPI's NFL feed mixes three fundamentally different product types
 * under one `bookmaker` field: real two-sided sportsbooks (DraftKings),
 * a peer-to-peer exchange (Novig), and DFS pick'em products (PrizePicks,
 * Sleeper) whose "lines" are single-sided projections with different
 * limits/market structure than a sportsbook prop. Only the approved
 * sportsbook allowlist may source the v1 canonical reference line -- see
 * `nfl-prop-line-selection.mjs`. The other categories are retained for QA
 * only and must never be silently substituted as if equivalent.
 */

/** Deterministic priority order for canonical line selection, most preferred first. */
export const APPROVED_SPORTSBOOKS = Object.freeze([
  "draftkings",
  "fanduel",
  "betmgm",
  "caesars",
  "pinnacle",
  "bovada",
]);

const APPROVED_SPORTSBOOK_SET = new Set(APPROVED_SPORTSBOOKS);
const EXCHANGES = new Set(["novig"]);
const DFS_PICKEM = new Set(["prizepicks", "sleeper", "underdog"]);

/** @returns {"sportsbook"|"exchange"|"dfs"|"unknown"} */
export function classifyBook(bookmaker) {
  const key = String(bookmaker ?? "").trim().toLowerCase();
  if (APPROVED_SPORTSBOOK_SET.has(key)) return "sportsbook";
  if (EXCHANGES.has(key)) return "exchange";
  if (DFS_PICKEM.has(key)) return "dfs";
  return "unknown";
}

export function isApprovedSportsbook(bookmaker) {
  return APPROVED_SPORTSBOOK_SET.has(String(bookmaker ?? "").trim().toLowerCase());
}
