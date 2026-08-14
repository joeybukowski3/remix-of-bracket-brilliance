import MatchupRankBadge from "@/components/nfl/matchups/MatchupRankBadge";
import { rankCellClass } from "@/lib/nfl/rankTier";

/**
 * One team's value and its league rank, drawn as two pills.
 *
 * The same treatment `MatchupMetricRow` uses in Statistical Comparison, shared
 * so every row inside Unit Matchups reads identically whatever supplies it —
 * the conventional/EPA resolver, the RBSDM success-rate periods or the ESPN
 * trench periods. Before this, the three row types each rendered their own
 * washed cell, so a success-rate line read as a different kind of table from
 * the EPA line directly above it.
 *
 * Both pills take their tint from the same `rankTier` bands used everywhere
 * else: the value pill wears the faint `cell` wash, the rank pill the saturated
 * `badge`. The band definitions are untouched.
 *
 * This renders presentation only. It performs no comparison and takes no view
 * on which side is better — in Unit Matchups the two sides are different
 * metrics (a rushing offense against a rushing defense), so a leader here would
 * be a claim the data does not support.
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
  const tinted = !neutral && !unavailable;

  return (
    <div
      className={`flex flex-col gap-1 ${isAway ? "items-end text-right" : "items-start text-left"}`}
    >
      <span className="sr-only">{srText}</span>
      <span
        className={`inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-[13px] font-semibold leading-4 tabular-nums sm:text-sm ${
          tinted ? `${rankCellClass(rank)} border-slate-200/80` : "border-transparent"
        } ${unavailable ? "text-slate-600" : "text-slate-900"}`}
      >
        {formatted}
      </span>
      <MatchupRankBadge rank={rank} neutral={neutral} />
    </div>
  );
}
