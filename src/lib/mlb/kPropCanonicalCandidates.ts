/**
 * kPropCanonicalCandidates.ts
 *
 * The canonical MLB X publisher's ONLY K candidate source. Reuses the exact
 * same production selection the Strikeout Props page's "Best K Prop Bets"
 * section (Top Over Plays / Top Under Plays) already renders --
 * buildPitcherStrikeoutRows (mlbSocialSelection.ts) feeding
 * buildKPropBestBets (kPropBestBets.ts) -- so the website and the canonical
 * X post can never disagree about which pitchers/sides qualify. This module
 * does NOT reselect, rerank, or recompute eligibility itself; it only maps
 * the site's own best-bet identities back onto their full row data (gameId,
 * gameStartTime, projectedIP, pitcherId) so the result can be handed to
 * composeSocialPostPlan (scripts/lib/mlb-social-composition.mjs) unchanged.
 *
 * Dependency-free like mlbSocialSelection.ts -- no React import -- so it can
 * run in a plain Node/tsx script (see
 * scripts/generate-mlb-k-production-candidates.ts).
 */
import { buildPitcherStrikeoutRows } from "./mlbSocialSelection";
import { buildKPropBestBets, type KBestBet } from "./kPropBestBets";
import type { HrDashboardBatter, HrDashboardGame, HrDashboardPitcher, PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";

/** Matches the site's own KBestBetsSection call (`buildKPropBestBets(rows, 3)`) exactly -- never a different cap here. */
export const CANONICAL_K_MAX_PER_SIDE = 3;

/**
 * Canonical K candidate row shape -- matches scripts/lib/mlb-social-composition.mjs's
 * toPostRow expectations for product "mlb-k-props" (same field names as
 * scripts/lib/mlb-social-plan-source.mjs's kFixturePool, used for
 * fixture/dry-run testing of the same composition path).
 */
export type CanonicalKCandidateRow = {
  pitcher: string;
  pitcherId: number | null;
  team: string;
  opponent: string;
  gameId: number | null;
  gameStartTime: string | null;
  kLine: number;
  projectedKs: number;
  projectedIP: number | null;
  direction: "OVER" | "UNDER";
  oddsOver: string | null;
  oddsUnder: string | null;
  /**
   * kScore/edge/valueScore are parity/audit fields only -- never consumed by
   * composeSocialPostPlan (toPostRow recomputes its own edge from
   * kLine/projectedKs). Sourced directly from the SAME KBestBet the site
   * itself rendered (bet.matchupScore / bet.projectionEdge / bet.valueScore),
   * never recomputed here, so a parity test comparing these fields against
   * buildKPropBestBets's own output can never drift from what this module
   * actually used to select the row.
   */
  kScore: number;
  edge: number;
  valueScore: number;
};

function rowIdentity(row: Pick<PitcherStrikeoutTeamRow, "gameKey" | "pitcher">) {
  return `${row.gameKey}::${row.pitcher}`;
}

function toCanonicalCandidate(bet: KBestBet, sourceRow: PitcherStrikeoutTeamRow): CanonicalKCandidateRow {
  return {
    pitcher: sourceRow.pitcher,
    pitcherId: sourceRow.pitcherId ?? null,
    team: sourceRow.team,
    opponent: sourceRow.opponent,
    gameId: sourceRow.gameId ?? null,
    gameStartTime: sourceRow.gameStartTime ?? null,
    kLine: bet.line,
    projectedKs: bet.projectedKs,
    projectedIP: sourceRow.projectedIP ?? null,
    direction: bet.side === "over" ? "OVER" : "UNDER",
    oddsOver: sourceRow.kOddsOver ?? null,
    oddsUnder: sourceRow.kOddsUnder ?? null,
    kScore: bet.matchupScore,
    edge: bet.projectionEdge,
    valueScore: bet.valueScore,
  };
}

/**
 * Builds the canonical K candidate pool from a raw slate payload -- the
 * union of the site's Top Over Plays and Top Under Plays, each row carrying
 * the full identity/timing fields the canonical composition layer needs.
 * Sorted by valueScore descending across BOTH sides combined (the same
 * ranking signal buildKPropBestBets already computes per side) so
 * composeSocialPostPlan's own top-N selection sees an already-ranked pool,
 * exactly as it expects from every other candidate source.
 *
 * Both Overs and Unders are eligible -- this is deliberately not
 * Overs-only.
 */
export function buildCanonicalKCandidatePool(
  batters: HrDashboardBatter[],
  games: HrDashboardGame[],
  pitchers: HrDashboardPitcher[],
): CanonicalKCandidateRow[] {
  const rows = buildPitcherStrikeoutRows(batters, games, pitchers);
  const rowsByIdentity = new Map(rows.map((row) => [rowIdentity(row), row]));

  const { overs, unders } = buildKPropBestBets(rows, CANONICAL_K_MAX_PER_SIDE);

  const candidates: CanonicalKCandidateRow[] = [];
  for (const bet of [...overs, ...unders]) {
    const sourceRow = rowsByIdentity.get(`${bet.gameKey}::${bet.pitcher}`);
    // Defensive only: every bet returned by buildKPropBestBets was itself
    // derived from `rows`, so this lookup cannot fail in practice. A bet
    // with no traceable source row is skipped rather than fabricated.
    if (!sourceRow) continue;
    candidates.push(toCanonicalCandidate(bet, sourceRow));
  }

  return candidates.sort((a, b) => b.valueScore - a.valueScore);
}
