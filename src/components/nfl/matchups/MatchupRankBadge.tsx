import { getRankTierLabel, rankBadgeClass } from "@/lib/nfl/rankTier";

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
 */
export default function MatchupRankBadge({
  rank,
  neutral = false,
  className = "",
}: {
  rank: number | null | undefined;
  neutral?: boolean;
  className?: string;
}) {
  const hasRank = rank != null && Number.isFinite(rank);
  const tierLabel = getRankTierLabel(rank);

  const description = !hasRank
    ? "League rank unavailable"
    : neutral
      ? `League rank ${rank} of 32, descriptive only`
      : `League rank ${rank} of 32, ${tierLabel}`;

  return (
    <span
      className={`inline-flex min-w-[2.25rem] items-center justify-center rounded border px-1 py-0.5 text-[10px] font-black leading-none tabular-nums ${
        neutral ? NEUTRAL_BADGE : rankBadgeClass(rank)
      } ${className}`}
      title={description}
    >
      <span aria-hidden>{hasRank ? `#${rank}` : "—"}</span>
      <span className="sr-only">{description}</span>
    </span>
  );
}
