import { jkbHeatStyle, weeklyRankHeatTone } from "@/lib/shared/jkbHeat";

/** League size for the shared JKB Heat 1-32 rank bands. */
const NFL_HEAT_POOL_SIZE = 32;

/**
 * OVR / OFF / DEF standings cell: league rank primary, current rating secondary,
 * washed with the shared JKB Heat tone for that rank (1 = best). Rank is always
 * printed, so quality is never conveyed by colour alone. A missing rank/rating
 * renders a plain em dash, never a fabricated tone.
 */
export default function RankHeatCell({
  rank,
  rating,
  label,
}: {
  rank: number | null;
  rating: number | null;
  /** "OVR" | "OFF" | "DEF" — used for the accessible title only. */
  label: string;
}) {
  if (rank === null || rating === null) return <span className="text-slate-400">{"—"}</span>;
  const tone = weeklyRankHeatTone(rank, NFL_HEAT_POOL_SIZE);
  const style = tone === "missing" ? undefined : jkbHeatStyle(tone);
  return (
    <span
      className="inline-flex min-w-[2.5rem] flex-col items-center rounded-md px-1 py-0.5 leading-tight tabular-nums"
      data-heat-tone={tone}
      style={style}
      title={`${label} rank ${rank} of ${NFL_HEAT_POOL_SIZE} · rating ${rating.toFixed(1)}`}
    >
      <span className="text-[13px] font-bold sm:text-sm">#{rank}</span>
      <span className="text-[10px] font-medium">{rating.toFixed(1)}</span>
    </span>
  );
}
