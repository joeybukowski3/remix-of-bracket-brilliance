import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import type { MatchupDisplayMetric } from "@/components/nfl/matchups/matchupDisplayMetrics";
import type { MatchupCategoryId } from "@/lib/nfl/matchupCategoryAdvantage";
import { SPINE_METRICS } from "@/lib/nfl/matchupCuratedMetrics";
import { toVisualMetric, type MatchupVisualMetric } from "@/lib/nfl/matchupVisualizationModel";
import { nflTeamColorFor } from "@/lib/nfl/nflTeamColor";
import { NFL_RANK_TIER_UNKNOWN, rankBadgeClass } from "@/lib/nfl/rankTier";
import type { NflMatchup } from "@/lib/nfl/matchups";
import { cn } from "@/lib/utils";

const NEUTRAL_FILL = "#94a3b8";

/** Minimum sliver so a real (non-missing) advantage is always visible against the track, even at the worst rank. */
const MIN_BAR_PERCENT = 6;

function goodnessPercent(percentile: number | null): number | null {
  if (percentile == null) return null;
  return Math.max(MIN_BAR_PERCENT, (1 - percentile) * 100);
}

function RankBadge({ rank }: { rank: number | null }) {
  if (rank == null) {
    return (
      <span
        className={cn(
          "inline-flex h-5 min-w-[22px] items-center justify-center rounded border px-1 text-[9px] font-bold tabular-nums",
          NFL_RANK_TIER_UNKNOWN.badge
        )}
      >
        N/A
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-[22px] items-center justify-center rounded border px-1 text-[9px] font-bold tabular-nums",
        rankBadgeClass(rank)
      )}
    >
      {rank}
    </span>
  );
}

/**
 * One mirrored bar track. A missing rank never renders a real bar — no
 * width, no colour, no implied position — only a flat dashed placeholder, so
 * "no data" cannot be mistaken for "worst in the league".
 */
function SpineTrack({ side, percentile, color }: { side: "away" | "home"; percentile: number | null; color: string }) {
  const percent = goodnessPercent(percentile);
  if (percent == null) {
    return (
      <div className="h-2 w-full rounded-full border border-dashed border-slate-300 bg-slate-50" aria-hidden />
    );
  }
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200/70 ring-1 ring-inset ring-slate-200">
      <div
        className={cn("h-full", side === "away" ? "ml-auto rounded-l-full" : "rounded-r-full")}
        style={{ width: `${percent}%`, backgroundColor: color }}
      />
    </div>
  );
}

function SpineRow({
  metric,
  awayColor,
  homeColor,
}: {
  metric: MatchupVisualMetric;
  awayColor: string;
  homeColor: string;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_minmax(84px,124px)_1fr_auto] items-center gap-1.5 py-1.5 sm:gap-2">
      <RankBadge rank={metric.away.rank} />
      <SpineTrack side="away" percentile={metric.away.percentile} color={awayColor} />
      <div className="truncate text-center text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-600 sm:text-[11px]">
        {metric.shortLabel}
      </div>
      <SpineTrack side="home" percentile={metric.home.percentile} color={homeColor} />
      <RankBadge rank={metric.home.rank} />
    </div>
  );
}

/**
 * The Spine — Overview's headline team-comparison visual.
 *
 * A fixed, curated set of ~6-8 metrics (`SPINE_METRICS`), never a
 * user-editable dropdown. Every value is read from the already-resolved
 * `categoryMetrics` the page computes once; nothing here recomputes a rank,
 * a rating or a winner.
 */
export default function MatchupSpine({
  matchup,
  categoryMetrics,
}: {
  matchup: NflMatchup;
  categoryMetrics?: Partial<Record<MatchupCategoryId, MatchupDisplayMetric[]>>;
}) {
  const awayColor = nflTeamColorFor(matchup.away) ?? NEUTRAL_FILL;
  const homeColor = nflTeamColorFor(matchup.home) ?? NEUTRAL_FILL;

  const rows = SPINE_METRICS.map((entry) => {
    const row = categoryMetrics?.[entry.categoryId]?.find((r) => r.key === entry.metricId);
    if (!row) return null;
    return toVisualMetric(row, entry.categoryId);
  }).filter((metric): metric is MatchupVisualMetric => metric != null);

  return (
    <section className="matchup-spine rounded-xl border border-slate-200 bg-white p-3 sm:p-4" aria-labelledby="matchup-spine-heading">
      <h2 id="matchup-spine-heading" className="sr-only">
        Team Comparison
      </h2>

      <div className="mb-2 grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2">
          <NflTeamCrest team={matchup.away} side="away" size={28} />
          <span className="truncate text-[12px] font-bold text-slate-900">{matchup.away.teamName}</span>
        </div>
        <div className="flex items-center justify-end gap-2 text-right">
          <span className="truncate text-[12px] font-bold text-slate-900">{matchup.home.teamName}</span>
          <NflTeamCrest team={matchup.home} side="home" size={28} />
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {rows.map((metric) => (
          <SpineRow key={metric.id} metric={metric} awayColor={awayColor} homeColor={homeColor} />
        ))}
      </div>
    </section>
  );
}
