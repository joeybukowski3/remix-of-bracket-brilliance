import { useState } from "react";
import MatchupSection from "@/components/nfl/matchups/MatchupSection";
import MatchupSegmentedControl from "@/components/nfl/matchups/MatchupSegmentedControl";
import MatchupComparisonGroup, { ComparisonHeader } from "@/components/nfl/matchups/MatchupComparisonGroup";
import MatchupComparisonRow from "@/components/nfl/matchups/MatchupComparisonRow";
import MatchupPendingNote, { PIPELINE_PENDING_COPY } from "@/components/nfl/matchups/MatchupPendingNote";
import { formatSigned } from "@/lib/nfl/guideData";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
import type { NflMatchupMetricGroup, NflMatchupMetricResolver } from "@/lib/nfl/matchupMetrics";
import type { NflMatchupSectionId } from "@/lib/nfl/matchupSections";

function pct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${formatSigned(value)}%`;
}

/**
 * Offense / Defense comparison section.
 *
 * The Joe Knows Ball unit rating leads as a populated summary row (this is real
 * repository data and is not affected by the sample controls). Everything below
 * it is the scaffolded conventional/advanced metric catalogue, which renders
 * "N/A" until the ingestion phases land.
 *
 * Subgroups are a segmented control below `lg` — one group visible at a time so
 * a 375px screen shows a readable list rather than a squeezed table. Desktop
 * shows all three groups stacked.
 */
export default function MatchupUnitComparison({
  id,
  matchup,
  groups,
  resolver,
  baselineLabel,
  baselineRank,
  baselineValue,
}: {
  id: Extract<NflMatchupSectionId, "offense" | "defense">;
  matchup: NflMatchup;
  groups: readonly NflMatchupMetricGroup[];
  resolver: NflMatchupMetricResolver;
  /** Label for the populated Joe Knows Ball summary row. */
  baselineLabel: string;
  baselineRank: (team: NflMatchupTeam) => number | null;
  baselineValue: (team: NflMatchupTeam) => number | null;
}) {
  const [activeGroup, setActiveGroup] = useState(groups[0]?.id ?? "");

  const options = groups.map((group) => ({
    value: group.id,
    label: group.label,
    // Drop the leading "Overall Offense"/"Pass Defense" qualifier on narrow
    // screens — the section heading already establishes the unit.
    shortLabel: group.label.replace(/\s*(Offense|Defense)\s*/i, "").trim() || group.label,
  }));

  return (
    <MatchupSection
      id={id}
      headerAside={
        <MatchupSegmentedControl
          options={options}
          value={activeGroup}
          onChange={setActiveGroup}
          ariaLabel={`${id === "offense" ? "Offense" : "Defense"} metric group`}
          size="sm"
          className="lg:hidden"
        />
      }
    >
      <ComparisonHeader matchup={matchup} />

      <div className="border-b border-slate-200 bg-emerald-50/30">
        <MatchupComparisonRow
          metricLabel={baselineLabel}
          help="Joe Knows Ball power model — the season baseline, independent of the sample controls."
          away={{ formattedValue: pct(baselineValue(matchup.away)), rank: baselineRank(matchup.away) }}
          home={{ formattedValue: pct(baselineValue(matchup.home)), rank: baselineRank(matchup.home) }}
          awayTeamName={matchup.away.teamName}
          homeTeamName={matchup.home.teamName}
        />
      </div>

      {groups.map((group) => (
        <div
          key={group.id}
          className={`pt-2 ${group.id === activeGroup ? "" : "hidden lg:block"}`}
        >
          <h3 className="mb-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            {group.label}
          </h3>
          <MatchupComparisonGroup
            matchup={matchup}
            metrics={group.metrics}
            resolver={resolver}
            showHeader={false}
          />
        </div>
      ))}

      <MatchupPendingNote>{PIPELINE_PENDING_COPY}</MatchupPendingNote>
    </MatchupSection>
  );
}
