import type { CSSProperties } from "react";
import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import type { MatchupDisplayMetric } from "@/components/nfl/matchups/matchupDisplayMetrics";
import type { MatchupCategoryId } from "@/lib/nfl/matchupCategoryAdvantage";
import { SPINE_METRICS } from "@/lib/nfl/matchupCuratedMetrics";
import {
  toVisualMetric,
  type MatchupVisualMetric,
  type MatchupVisualSide,
} from "@/lib/nfl/matchupVisualizationModel";
import { nflTeamColorFor } from "@/lib/nfl/nflTeamColor";
import type { NflMatchup } from "@/lib/nfl/matchups";
import { cn } from "@/lib/utils";

const NEUTRAL_FILL = "#94a3b8";
const LEADER_CALLOUT_RANK_THRESHOLD = 8;

/** Minimum sliver so a real (non-missing) rank remains visible against its half-track. */
const MIN_BAR_PERCENT = 6;

function goodnessPercent(percentile: number | null): number | null {
  if (percentile == null) return null;
  return Math.max(MIN_BAR_PERCENT, (1 - percentile) * 100);
}

function SideReading({ side, align }: { side: MatchupVisualSide; align: "left" | "right" }) {
  return (
    <div className={cn("matchup-spine__reading", align === "right" && "is-home")}>
      <strong>{side.rank == null ? "N/A" : `#${side.rank}`}</strong>
      {side.formatted !== "N/A" && (
        <>
          <span aria-hidden>·</span>
          <span>{side.formatted}</span>
        </>
      )}
    </div>
  );
}

/** One bilateral rail: each team's rank quality grows outward from the center pivot. */
function SpineTrack({ awayPercentile, homePercentile }: { awayPercentile: number | null; homePercentile: number | null }) {
  const awayPercent = goodnessPercent(awayPercentile);
  const homePercent = goodnessPercent(homePercentile);

  return (
    <div className="matchup-spine__track" aria-hidden>
      <div className={cn("matchup-spine__track-half is-away", awayPercent == null && "is-missing")}>
        {awayPercent != null && <span className="matchup-spine__fill is-away" style={{ width: `${awayPercent}%` }} />}
      </div>
      <span className="matchup-spine__pivot" />
      <div className={cn("matchup-spine__track-half is-home", homePercent == null && "is-missing")}>
        {homePercent != null && <span className="matchup-spine__fill is-home" style={{ width: `${homePercent}%` }} />}
      </div>
    </div>
  );
}

function SpineRow({ metric }: { metric: MatchupVisualMetric }) {
  const leaderAbbr = metric.leader === "away" ? "AWAY" : metric.leader === "home" ? "HOME" : null;
  const showCallout = leaderAbbr != null && metric.rankGap != null && metric.rankGap >= LEADER_CALLOUT_RANK_THRESHOLD;

  return (
    <div className="matchup-spine__row">
      <div className="matchup-spine__row-meta">
        <SideReading side={metric.away} align="left" />
        <div className="matchup-spine__metric">
          <span>{metric.shortLabel}</span>
          {showCallout && <small className={cn(`is-${metric.leader}`)}>{leaderAbbr} +{metric.rankGap}</small>}
        </div>
        <SideReading side={metric.home} align="right" />
      </div>
      <SpineTrack awayPercentile={metric.away.percentile} homePercentile={metric.home.percentile} />
    </div>
  );
}

/**
 * The Spine — Overview's headline team-comparison visual.
 *
 * A fixed, curated set of ~6-8 metrics (`SPINE_METRICS`), never a
 * user-editable dropdown. Every value is read from the already-resolved
 * `categoryMetrics`; nothing here recomputes a rank, rating or winner.
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
    const row = categoryMetrics?.[entry.categoryId]?.find((candidate) => candidate.key === entry.metricId);
    if (!row) return null;
    return toVisualMetric(row, entry.categoryId);
  }).filter((metric): metric is MatchupVisualMetric => metric != null);

  const spineStyle = {
    "--spine-away": awayColor,
    "--spine-home": homeColor,
    "--spine-away-fill": `color-mix(in srgb, ${awayColor} 76%, white)`,
    "--spine-home-fill": `color-mix(in srgb, ${homeColor} 76%, white)`,
  } as CSSProperties;

  return (
    <section className="matchup-spine" style={spineStyle} aria-labelledby="matchup-spine-heading">
      <header className="matchup-spine__header">
        <div className="matchup-spine__team is-away">
          <NflTeamCrest team={matchup.away} side="away" size={32} />
          <div>
            <strong>{matchup.away.teamName}</strong>
            <span>{matchup.away.abbr.toUpperCase()} · Away</span>
          </div>
        </div>

        <div className="matchup-spine__title">
          <h2 id="matchup-spine-heading">The Spine</h2>
          <p>1 is best · 32 is worst</p>
        </div>

        <div className="matchup-spine__team is-home">
          <div>
            <strong>{matchup.home.teamName}</strong>
            <span>{matchup.home.abbr.toUpperCase()} · Home</span>
          </div>
          <NflTeamCrest team={matchup.home} side="home" size={32} />
        </div>
      </header>

      <div className="matchup-spine__rows">
        {rows.map((metric) => (
          <SpineRow key={metric.id} metric={metric} />
        ))}
      </div>
    </section>
  );
}
