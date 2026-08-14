import MatchupRankBadge from "@/components/nfl/matchups/MatchupRankBadge";

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

  /**
   * The rank, promoted to the primary element.
   *
   * When there is no rank the formatted value takes its place at the same
   * position, so the inner edge always carries the cell's headline rather than
   * leaving a gap where a rank would have been.
   */
  const primary =
    rank == null || !Number.isFinite(rank) ? (
      <span className="text-[15px] font-bold leading-none tabular-nums text-slate-500">
        {formatted}
      </span>
    ) : (
      <MatchupRankBadge
        rank={rank}
        neutral={neutral}
        className="min-w-[2.75rem] px-2 py-1 text-[22px] leading-none"
      />
    );

  /** The raw value, demoted to a quiet companion. Omitted when it is the primary. */
  const secondary =
    rank == null || !Number.isFinite(rank) ? null : (
      <span
        className={`text-[11px] font-semibold leading-none tabular-nums ${
          unavailable ? "text-slate-500" : "text-slate-600"
        }`}
      >
        {formatted}
      </span>
    );

  /**
   * Space-between, not a cluster: the rank is pinned to the edge nearest the
   * centre metric column and the value to the outer edge, so which side a rank
   * belongs to stays unambiguous however wide either element renders.
   */
  return (
    <div className="flex w-full items-center justify-between gap-2">
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
