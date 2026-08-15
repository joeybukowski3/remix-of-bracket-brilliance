import { formatRankOrdinal } from "@/components/nfl/matchups/rankOrdinal";
import {
  MATCHUP_PRIMARY_BADGE,
  MATCHUP_PRIMARY_TEXT,
} from "@/components/nfl/matchups/matchupTypography";
import { getRankTierLabel, rankBadgeClass } from "@/lib/nfl/rankTier";
import { cn } from "@/lib/utils";

/** Neutral chip used for descriptive metrics that have no better/worse direction. */
const NEUTRAL_BADGE = "border-slate-300 bg-slate-100 text-slate-700";

/**
 * Compact league-rank chip. The numeric rank is always rendered, so tier is
 * never communicated by colour alone; the tier name is exposed to assistive
 * technology via the accessible label.
 *
 * `neutral` suppresses quality-tier colouring for context-only metrics such as
 * pass-play share or attempts per game — leading the league in pass attempts is
 * a play-style fact, not an "Elite" performance, and must not be coloured as one.
 *
 * An unranked metric renders nothing at all. A row for a metric the repository
 * cannot rank — an unavailable stat, or a season figure like the market win
 * total that has no league order — used to print an empty "—" chip, which cost
 * a full chip of height and carried no information. The value beside it already
 * says whether the metric is available.
 */
export default function MatchupRankBadge({
  rank,
  neutral = false,
  emphasis = "default",
  className = "",
}: {
  rank: number | null | undefined;
  neutral?: boolean;
  /**
   * "primary" renders the rank at the shared headline size, with the chip sized
   * to fit the number. Chosen with a prop rather than a className override so
   * the size is decided here instead of depending on class-merge order.
   */
  emphasis?: "default" | "primary";
  className?: string;
}) {
  const hasRank = rank != null && Number.isFinite(rank);
  if (!hasRank) return null;
  const tierLabel = getRankTierLabel(rank);

  const description = neutral
    ? `League rank ${rank} of 32, descriptive only`
    : `League rank ${rank} of 32, ${tierLabel}`;

  return (
    <span
      // Size comes from `emphasis`, not from a className override, so the chip
      // geometry and the type scale are chosen together and never depend on
      // class-merge order.
      className={cn(
        "inline-flex items-center justify-center border text-center tabular-nums",
        emphasis === "primary"
          ? `${MATCHUP_PRIMARY_BADGE} ${MATCHUP_PRIMARY_TEXT} font-extrabold leading-tight`
          : "min-w-[2.25rem] rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
        neutral ? NEUTRAL_BADGE : rankBadgeClass(rank),
        className
      )}
      title={description}
    >
      <span aria-hidden>{formatRankOrdinal(rank)}</span>
      <span className="sr-only">{description}</span>
    </span>
  );
}
