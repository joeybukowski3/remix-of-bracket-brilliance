import type { CSSProperties } from "react";
import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import type { NflMatchupTeam } from "@/lib/nfl/matchups";
import { cn } from "@/lib/utils";

const TEAM_CREST_SIZE = 18;

export type MatchupTowerSidePresentation = {
  team: NflMatchupTeam;
  color: string;
  identityLabel: string;
  formatted: string;
  rank: number | null;
  /** Final visual height supplied by an authoritative presentation adapter. */
  heightPercent: number | null;
};

export type MatchupTowerMetricPresentation = {
  id: string;
  label: string;
  shortLabel?: string;
  contextLabel?: string;
  pairingLabel?: string;
  away: MatchupTowerSidePresentation;
  home: MatchupTowerSidePresentation;
  /** Optional pre-resolved callout. This component never decides who leads. */
  badge?: { label: string; color: string };
};

function RankLabel({ rank, color }: { rank: number | null; color: string }) {
  return (
    <span className="matchup-rank-towers__rank" style={{ "--tower-team-color": color } as CSSProperties} data-rank-badge>
      {rank == null ? "N/A" : `#${rank}`}
    </span>
  );
}

function TowerBar({ heightPercent, color }: { heightPercent: number | null; color: string }) {
  if (heightPercent == null) {
    return <div className="matchup-rank-towers__bar-rail is-missing" aria-hidden data-rank-tower />;
  }
  return (
    <div className="matchup-rank-towers__bar-rail" aria-hidden data-rank-tower>
      <div className="matchup-rank-towers__bar-fill" style={{ height: `${heightPercent}%`, "--tower-team-color": color } as CSSProperties} />
    </div>
  );
}

function TowerSide({ side, crestSide }: { side: MatchupTowerSidePresentation; crestSide: "away" | "home" }) {
  return (
    <div className="matchup-rank-towers__team-stack">
      <RankLabel rank={side.rank} color={side.color} />
      <TowerBar heightPercent={side.heightPercent} color={side.color} />
      <span className="matchup-rank-towers__team-id">
        <NflTeamCrest team={side.team} side={crestSide} size={TEAM_CREST_SIZE} className="rank-tower-team-crest" />
        <span>{side.identityLabel}</span>
      </span>
    </div>
  );
}

export default function MatchupTowerMetricCard({ metric, active = false, onActivate }: {
  metric: MatchupTowerMetricPresentation;
  active?: boolean;
  onActivate?: () => void;
}) {
  const content = (
    <>
      <div className="matchup-rank-towers__card-header">
        <span className="matchup-rank-towers__metric-label">{metric.shortLabel ?? metric.label}</span>
        {metric.contextLabel && <span className="matchup-rank-towers__context">{metric.contextLabel}</span>}
        {metric.badge && (
          <span className="matchup-rank-towers__advantage" style={{ "--tower-leader-color": metric.badge.color } as CSSProperties}>
            {metric.badge.label}
          </span>
        )}
      </div>
      {metric.pairingLabel && <div className="matchup-rank-towers__pairing">{metric.pairingLabel}</div>}
      <div className="matchup-rank-towers__plot">
        <span aria-hidden className="matchup-rank-towers__gridline is-top" />
        <span aria-hidden className="matchup-rank-towers__gridline is-middle" />
        <div className="matchup-rank-towers__pair">
          <TowerSide side={metric.away} crestSide="away" />
          <TowerSide side={metric.home} crestSide="home" />
        </div>
      </div>
      <div className="matchup-rank-towers__values">
        <span>{metric.away.formatted}</span>
        <span aria-hidden>vs</span>
        <span>{metric.home.formatted}</span>
      </div>
    </>
  );
  const accessibleLabel = `${metric.pairingLabel ? `${metric.pairingLabel}, ` : ""}${metric.label}${metric.contextLabel ? `, ${metric.contextLabel}` : ""}: ${metric.away.identityLabel} ${metric.away.formatted}, ${metric.home.identityLabel} ${metric.home.formatted}`;

  if (onActivate) {
    return (
      <button type="button" onClick={onActivate} aria-pressed={active} aria-label={accessibleLabel} className={cn("matchup-rank-towers__card shrink-0 snap-center", active && "is-active")} data-rank-tower-group>
        {content}
      </button>
    );
  }
  return <article aria-label={accessibleLabel} className="matchup-rank-towers__card shrink-0 snap-center" data-rank-tower-group>{content}</article>;
}
