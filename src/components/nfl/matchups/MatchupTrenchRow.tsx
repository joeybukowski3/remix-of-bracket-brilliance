import MatchupRankBadge from "@/components/nfl/matchups/MatchupRankBadge";
import { rankCellClass } from "@/lib/nfl/rankTier";
import type { TrenchResolver } from "@/lib/nfl/trenchMetricsData";
import {
  formatTrenchValue,
  trenchPeriodLabel,
  type TrenchMetricValue,
  type TrenchMetricsArtifact,
  type TrenchPeriodKey,
} from "@/lib/nfl/trenchMetricsData";

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
  const isAway = side === "away";
  const unavailable = !value;

  return (
    <div
      className={`flex flex-col gap-0.5 rounded px-1 py-0.5 ${rankCellClass(
        value?.espnRank ?? null
      )} ${isAway ? "items-end text-right" : "items-start text-left"}`}
    >
      <span className="sr-only">
        {teamName} {metricLabel} {periodLabel}:{" "}
      </span>
      <span
        className={`text-[13px] font-bold leading-4 tabular-nums sm:text-sm ${
          unavailable ? "text-slate-400" : "text-slate-900"
        }`}
      >
        {formatTrenchValue(value)}
      </span>
      <MatchupRankBadge rank={value?.espnRank ?? null} />
    </div>
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
  return (
    <div className="border-b border-slate-100 py-1.5 last:border-0">
      {showMetricLabel && (
      <div className="mb-0.5 text-center" title={help}>
        {shortLabel && shortLabel !== metricLabel ? (
          <>
            <span className="block text-[10px] font-bold leading-3 text-slate-600 sm:hidden">
              {shortLabel}
            </span>
            <span className="hidden text-[11px] font-bold leading-4 text-slate-600 sm:block">
              {metricLabel}
            </span>
          </>
        ) : (
          <span className="block text-[10px] font-bold leading-3 text-slate-600 sm:text-[11px] sm:leading-4">
            {metricLabel}
          </span>
        )}
      </div>
      )}

      {periods.map((period) => {
        const labels = trenchPeriodLabel(artifact, period);
        return (
          <div
            key={period}
            className="grid grid-cols-[4.25rem_minmax(0,1fr)_4.25rem] items-center gap-1.5 sm:grid-cols-[6.5rem_minmax(0,1fr)_6.5rem] sm:gap-2"
          >
            <TrenchPeriodSide
              side="away"
              value={awayValues[period] ?? null}
              teamName={awayTeamName}
              metricLabel={metricLabel}
              periodLabel={labels.label}
            />
            <span className="text-center text-[9px] font-bold uppercase tracking-wide text-slate-400">
              <span className="sm:hidden">{labels.short}</span>
              <span className="hidden sm:inline">{labels.label}</span>
            </span>
            <TrenchPeriodSide
              side="home"
              value={homeValues[period] ?? null}
              teamName={homeTeamName}
              metricLabel={metricLabel}
              periodLabel={labels.label}
            />
          </div>
        );
      })}
    </div>
  );
}
