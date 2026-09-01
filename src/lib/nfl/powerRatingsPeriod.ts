/**
 * Canonical period resolver for the /nfl/power-ratings board.
 *
 * The board has one three-way period control — 2025 / 2026 / Last 8 — that is
 * independent of the Rankings/Ratings display toggle. Every data layer the
 * board reads (EPA overall, YPP overall, Success overall, Strength of Schedule,
 * Record) selects its sample through the mappings here, so a period means
 * exactly one thing across the whole page.
 *
 *   2025   full 2025 regular season
 *   2026   completed 2026 regular-season games only (nothing substituted when
 *          there are none)
 *   Last 8 each team's most recent 8 completed regular-season games, crossing
 *          the 2025/2026 boundary naturally
 *
 * The efficiency windows are the precomputed windows in matchup-epa.json /
 * matchup-metrics.json (see scripts/lib/nfl-matchup-metrics.mjs `WINDOW_SPECS`):
 *
 *   2025   -> "prior-season-full"  every completed 2025 game
 *   2026   -> "season-current"     every completed 2026 game, uncapped
 *   Last 8 -> "season-blend"       rolling 8, each completed 2026 game displaces
 *                                  one late-2025 game
 *
 * "season-blend" already implements the exact Last-8 rule the brief describes,
 * so there is no separate Last-8 selector anywhere in this feature — the shared
 * generator helper is the single definition of window membership and the
 * client reads the resulting `gameIds` straight out of the artifact.
 */

import type { SuccessPeriodKey } from "@/lib/nfl/successRateData";

export type PowerRatingsPeriod = "2025" | "2026" | "last8";

export const POWER_RATINGS_PERIODS: readonly PowerRatingsPeriod[] = ["2025", "2026", "last8"];

export const POWER_RATINGS_PERIOD_LABELS: Record<
  PowerRatingsPeriod,
  { tab: string; full: string }
> = {
  "2025": { tab: "2025", full: "2025 full regular season" },
  "2026": { tab: "2026", full: "2026 regular season to date" },
  last8: { tab: "Last 8", full: "each team's last 8 completed regular-season games" },
};

/** Window id in matchup-epa.json / matchup-metrics.json for a period. */
export function efficiencyWindowId(period: PowerRatingsPeriod): string {
  switch (period) {
    case "2025":
      return "prior-season-full";
    case "2026":
      return "season-current";
    case "last8":
      return "season-blend";
  }
}

/**
 * Success-rate artifact period key for a board period, or null when RBSDM has
 * no exactly-matching period.
 *
 * "Last 8" maps to RBSDM's `2025-last8` only while no 2026 regular-season game
 * has been played — at that point the final eight of 2025 *is* every team's
 * last eight. Once 2026 games exist the rolling window crosses the boundary and
 * RBSDM (which cannot express a per-team cross-season last-8 range) no longer
 * matches, so the caller must treat Success as unavailable for Last 8 rather
 * than show a stale 2025-only number. `completed2026Games` is the leaguewide
 * count of completed 2026 regular-season games.
 */
export function successPeriodKey(
  period: PowerRatingsPeriod,
  completed2026Games: number
): SuccessPeriodKey | null {
  switch (period) {
    case "2025":
      return "2025-season";
    case "2026":
      return "2026-season";
    case "last8":
      return completed2026Games > 0 ? null : "2025-last8";
  }
}
