import MatchupRankBadge from "@/components/nfl/matchups/MatchupRankBadge";
import {
  MATCHUP_PRIMARY_TEXT,
  MATCHUP_VALUE_TEXT,
} from "@/components/nfl/matchups/matchupTypography";

export {
  MATCHUP_METRIC_LABEL,
  MATCHUP_PRIMARY_TEXT,
} from "@/components/nfl/matchups/matchupTypography";


/**
 * One team's league rank and the raw value behind it, side by side.
 *
 * Rank leads. It is the figure a reader compares across a row — the only one
 * that means the same thing for a rushing offense and the rushing defense it
 * faces — so it is set large and keeps the saturated `rankTier` badge, while
 * the raw value sits beside it as small muted text. The tier bands themselves
 * are untouched.
 *
 * The pair is laid out space-between rather than clustered: the rank pins to
 * the edge nearest the centre metric column and the value to the outer edge, so
 * the reading order stays unambiguous whatever width either element takes.
 *
 * Shared by every row inside Unit Matchups and by Statistical Comparison, so a
 * success-rate line, a trench line and an EPA line all read as one table
 * whichever resolver supplied them.
 *
 * This renders presentation only. It performs no comparison and takes no view
 * on which side is better — in Unit Matchups the two sides are different
 * metrics (a rushing offense against a rushing defense), so a leader here would
 * be a claim the data does not support. There is deliberately no leader prop.
 */
export default function MatchupValuePills({
  side,
  formatted,
  rank,
  unavailable,
  neutral = false,
  srText,
}: {
  side: "away" | "home";
  /** Pre-formatted display string; the caller decides what "N/A" looks like. */
  formatted: string;
  rank: number | null;
  /** True when the value is genuinely missing, so no tier tint is borrowed. */
  unavailable: boolean;
  /** Suppresses quality-tier colouring for context-only metrics. */
  neutral?: boolean;
  /** Screen-reader prefix naming the team, metric and (where it applies) period. */
  srText: string;
}) {
  const isAway = side === "away";
  const hasRank = rank != null && Number.isFinite(rank);

  /**
   * The rank, promoted to the primary element.
   *
   * With no rank the formatted value takes its place at the same size and the
   * same position, so the inner edge always carries the cell's headline.
   */
  const primary = hasRank ? (
    <MatchupRankBadge rank={rank} neutral={neutral} emphasis="primary" />
  ) : (
    <span className={`${MATCHUP_PRIMARY_TEXT} font-extrabold leading-tight text-slate-400`}>
      {formatted}
    </span>
  );

  /** The raw value, demoted to a quiet companion. Omitted when it is the primary. */
  const secondary = hasRank ? (
    <span className={`${MATCHUP_VALUE_TEXT} ${unavailable ? "text-slate-400" : ""}`}>
      {formatted}
    </span>
  ) : null;

  /**
   * Both elements sit together against the inner edge — the side nearest the
   * centre metric column — rather than being pushed apart to the cell's outer
   * limits. The fixed side columns keep that edge in the same place down the
   * whole table, and a rank-less row keeps its headline in the same position
   * instead of drifting outward for want of a companion to push against.
   */
  return (
    <div
      className={`flex w-full items-center gap-3 ${isAway ? "justify-end" : "justify-start"}`}
    >
      <span className="sr-only">{srText}</span>
      {isAway ? (
        <>
          {secondary}
          {primary}
        </>
      ) : (
        <>
          {primary}
          {secondary}
        </>
      )}
    </div>
  );
}
