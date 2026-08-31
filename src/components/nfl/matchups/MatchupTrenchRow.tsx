import MatchupValuePills from "@/components/nfl/matchups/MatchupValuePills";
import CompactMatchupMetricRow from "@/components/nfl/matchups/CompactMatchupMetricRow";
import {
  MATCHUP_METRIC_LABEL,
  MATCHUP_PERIOD_CAPTION,
  MATCHUP_UNIT_ROW_GRID,
  MATCHUP_ROW_AWAY_CELL,
  MATCHUP_ROW_HOME_CELL,
  MATCHUP_ROW_LABEL_CELL,
} from "@/components/nfl/matchups/matchupTypography";
import type { TrenchResolver } from "@/lib/nfl/trenchMetricsData";
import {
  formatTrenchValue,
  trenchPeriodLabel,
  type TrenchMetricValue,
  type TrenchMetricsArtifact,
  type TrenchPeriodKey,
} from "@/lib/nfl/trenchMetricsData";
import { useIsCompactLayout } from "@/hooks/useIsCompactLayout";

export type TrenchPeriodValues = Partial<Record<TrenchPeriodKey, TrenchMetricValue | null>>;

/** Everything a section needs to render ESPN trench values for a matchup. */
export type MatchupTrenchConfig = {
  artifact: TrenchMetricsArtifact | null;
  periods: readonly TrenchPeriodKey[];
  resolve: TrenchResolver;
};

/**
 * One team's trench value for one period.
 *
 * Stacked value-over-rank, matching the conventional comparison rows these are
 * interleaved with in Offense vs Defense. Going inline from `sm` up pinned the
 * value to the outer edge and made a trench row read as a different kind of
 * table from the EPA row above it.
 *
 * Rank-tier colouring is driven by ESPN's official rank, which is the only rank
 * that exists here: ESPN publishes whole-number percentages but ranks on finer
 * internal precision, so a locally computed rank would be misleading.
 */
function TrenchPeriodSide({
  side,
  value,
  teamName,
  metricLabel,
  periodLabel,
}: {
  side: "away" | "home";
  value: TrenchMetricValue | null;
  teamName: string;
  metricLabel: string;
  periodLabel: string;
}) {
  return (
    <MatchupValuePills
      side={side}
      formatted={formatTrenchValue(value)}
      rank={value?.espnRank ?? null}
      unavailable={!value}
      srText={`${teamName} ${metricLabel} ${periodLabel}: `}
    />
  );
}

/**
 * Trench comparison row: one metric label, then one aligned line per visible
 * period.
 *
 * Seasons are shown separately and never blended, and a 2025 value is never
 * compared against a 2026 one — each line pairs the same period on both sides.
 * No trench score, edge, projection or winner is derived.
 */
export default function MatchupTrenchRow({
  metricLabel,
  shortLabel,
  help,
  showMetricLabel = true,
  artifact,
  periods,
  awayValues,
  homeValues,
  awayTeamName,
  homeTeamName,
}: {
  metricLabel: string;
  shortLabel?: string;
  help?: string;
  /** Trenches cards already title each battle, so the row label is suppressed there. */
  showMetricLabel?: boolean;
  artifact: TrenchMetricsArtifact | null;
  periods: readonly TrenchPeriodKey[];
  awayValues: TrenchPeriodValues;
  homeValues: TrenchPeriodValues;
  awayTeamName: string;
  homeTeamName: string;
}) {
  const isMobile = useIsCompactLayout("(max-width: 639px)");
  return (
    <div className="border-b border-slate-100 py-1.5 last:border-0">
      {showMetricLabel && !isMobile && (
      <div className="mb-0.5 text-center" title={help}>
        {shortLabel && shortLabel !== metricLabel ? (
          <>
            <span className={`block sm:hidden ${MATCHUP_METRIC_LABEL}`}>
              {shortLabel}
            </span>
            <span className={`hidden sm:block ${MATCHUP_METRIC_LABEL}`}>
              {metricLabel}
            </span>
          </>
        ) : (
          <span className={`block ${MATCHUP_METRIC_LABEL}`}>
            {metricLabel}
          </span>
        )}
      </div>
      )}

      {periods.map((period) => {
        const labels = trenchPeriodLabel(artifact, period);
        return (
          <div key={period}>
            {isMobile ? (
            <CompactMatchupMetricRow
              label={shortLabel ?? metricLabel}
              sublabel={labels.short}
              away={{
                formatted: formatTrenchValue(awayValues[period] ?? null),
                rank: awayValues[period]?.espnRank ?? null,
                accessibleName: awayTeamName,
              }}
              home={{
                formatted: formatTrenchValue(homeValues[period] ?? null),
                rank: homeValues[period]?.espnRank ?? null,
                accessibleName: homeTeamName,
              }}
              help={help}
            />
            ) : (
            <div className={`grid ${MATCHUP_UNIT_ROW_GRID}`}>
            <div className={`px-2 py-2 sm:px-4 ${MATCHUP_ROW_AWAY_CELL}`}>
              <TrenchPeriodSide
                side="away"
                value={awayValues[period] ?? null}
                teamName={awayTeamName}
                metricLabel={metricLabel}
                periodLabel={labels.label}
              />
            </div>
            <span className={`px-2 py-1 text-center sm:px-4 ${MATCHUP_PERIOD_CAPTION} ${MATCHUP_ROW_LABEL_CELL}`}>
              <span className="sm:hidden">{labels.short}</span>
              <span className="hidden sm:inline">{labels.label}</span>
            </span>
            <div className={`px-2 py-2 sm:px-4 ${MATCHUP_ROW_HOME_CELL}`}>
              <TrenchPeriodSide
                side="home"
                value={homeValues[period] ?? null}
                teamName={homeTeamName}
                metricLabel={metricLabel}
                periodLabel={labels.label}
              />
            </div>
            </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
