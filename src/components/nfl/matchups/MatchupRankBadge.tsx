import { getRankTierLabel, rankBadgeClass } from "@/lib/nfl/rankTier";

/**
 * Compact league-rank chip. The numeric rank is always rendered, so tier is
 * never communicated by colour alone; the tier name is exposed to assistive
 * technology via the accessible label.
 */
export default function MatchupRankBadge({
  rank,
  className = "",
}: {
  rank: number | null | undefined;
  className?: string;
}) {
  const hasRank = rank != null && Number.isFinite(rank);
  const tierLabel = getRankTierLabel(rank);

  return (
    <span
      className={`inline-flex min-w-[2.25rem] items-center justify-center rounded border px-1 py-0.5 text-[10px] font-black leading-none tabular-nums ${rankBadgeClass(rank)} ${className}`}
      title={hasRank ? `League rank ${rank} of 32 — ${tierLabel}` : "League rank unavailable"}
    >
      <span aria-hidden>{hasRank ? `#${rank}` : "—"}</span>
      <span className="sr-only">
        {hasRank ? `League rank ${rank} of 32, ${tierLabel}` : "League rank unavailable"}
      </span>
    </span>
  );
}
