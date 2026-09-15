import { useMemo, useState } from "react";
import MatchupTowerGrid from "@/components/nfl/matchups/MatchupTowerGrid";
import type { MatchupTowerMetricPresentation } from "@/components/nfl/matchups/MatchupTowerMetricCard";
import MatchupVisualMetricDetail from "@/components/nfl/matchups/MatchupVisualMetricDetail";
import { towerHeightFromRank } from "@/components/nfl/matchups/matchupVisualMath";
import type { MatchupVisualMetric } from "@/lib/nfl/matchupVisualizationModel";
import type { NflMatchupTeam } from "@/lib/nfl/matchups";

const ADVANTAGE_CHIP_RANK_THRESHOLD = 8;

/** Team-comparison adapter: all comparison/rank authority is already present on each visual metric. */
export function toTeamComparisonTowerMetrics({ metrics, away, home, awayColor, homeColor }: {
  metrics: readonly MatchupVisualMetric[];
  away: NflMatchupTeam;
  home: NflMatchupTeam;
  awayColor: string;
  homeColor: string;
}): MatchupTowerMetricPresentation[] {
  return metrics.map((metric) => {
    const leader = metric.leader === "away" ? away : metric.leader === "home" ? home : null;
    const leaderColor = metric.leader === "away" ? awayColor : homeColor;
    return {
      id: metric.id,
      label: metric.label,
      shortLabel: metric.shortLabel,
      away: {
        team: away, color: awayColor, identityLabel: away.abbr.toUpperCase(),
        formatted: metric.away.formatted, rank: metric.away.rank,
        heightPercent: towerHeightFromRank(metric.away.rank),
      },
      home: {
        team: home, color: homeColor, identityLabel: home.abbr.toUpperCase(),
        formatted: metric.home.formatted, rank: metric.home.rank,
        heightPercent: towerHeightFromRank(metric.home.rank),
      },
      badge: leader && metric.rankGap != null && metric.rankGap >= ADVANTAGE_CHIP_RANK_THRESHOLD
        ? { label: `${leader.abbr.toUpperCase()} +${metric.rankGap}`, color: leaderColor }
        : undefined,
    };
  });
}

export default function MatchupRankTowers({ metrics, away, home, awayColor, homeColor }: {
  metrics: readonly MatchupVisualMetric[];
  away: NflMatchupTeam;
  home: NflMatchupTeam;
  awayColor: string;
  homeColor: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeMetric = metrics.find((metric) => metric.id === activeId) ?? null;
  const towerMetrics = useMemo(() => toTeamComparisonTowerMetrics({ metrics, away, home, awayColor, homeColor }), [away, awayColor, home, homeColor, metrics]);

  return (
    <>
      <MatchupTowerGrid
        metrics={towerMetrics}
        title="Rank Towers"
        subtitle={`Selected ${metrics.length === 1 ? "metric" : "metrics"} · league rank comparison`}
        activeId={activeId}
        onActivate={(id) => setActiveId((previous) => previous === id ? null : id)}
      />
      {activeMetric && <MatchupVisualMetricDetail metric={activeMetric} away={away} home={home} className="mt-2" />}
    </>
  );
}
