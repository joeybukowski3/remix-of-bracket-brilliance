import { useId, useState } from "react";
import MatchupRankBadge from "@/components/nfl/matchups/MatchupRankBadge";
import NflComparisonRail from "@/components/nfl/matchups/NflComparisonRail";
import { describeMetricAdvantage } from "@/components/nfl/matchups/matchupDisplayMetrics";
import { METRIC_NA } from "@/lib/nfl/matchupMetrics";
import type { MetricComparison } from "@/lib/nfl/matchupCategoryAdvantage";
import { cn } from "@/lib/utils";

/**
 * Generic compact head-to-head row for the Team Comparison tab.
 *
 *   [ left value ]        METRIC LABEL        [ right value ]
 *   [ left rank  ]      advantage in words    [ right rank  ]
 *   ├───────────── single comparison rail ──────────────────┤
 *
 * Raw values are the prominent figure; each team's NFL rank sits directly
 * beneath its value and keeps the existing Joe Knows Ball rank-tier colouring
 * (via `MatchupRankBadge`). The label is centred and may wrap to two centred
 * lines. One continuous rail replaces the pair of independent bars.
 *
 * No comparison logic lives here or in any category component: the winner is
 * whatever `comparison` already says (or, absent that, is derived once inside
 * `matchupRailNormalization.ts`). The row communicates that winner three ways —
 * the words caption, the ranked badges, and the rail's `aria-label` — so it is
 * never conveyed by colour alone.
 *
 * The layout is single and fluid: it is built for ~390px first (fixed narrow
 * side columns, a flexible centre, no horizontal scroll) and simply widens on
 * larger screens.
 */
export type NflHeadToHeadMetricRowProps = {
  label: string;
  /** Shorter label used at the narrowest widths. */
  shortLabel?: string;
  /**
   * Optional context sub-label under the centred metric label — e.g. a period
   * tag such as "2025 L8". Purely descriptive; it never changes the comparison.
   */
  contextLabel?: string;
  help?: string;
  /** Pre-formatted display strings; `METRIC_NA` ("N/A") when genuinely missing. */
  leftValue: string;
  rightValue: string;
  leftRank: number | null;
  rightRank: number | null;
  /** Raw comparable values — only used to scale the rail when a rank is absent. */
  leftRawValue?: number | null;
  rightRawValue?: number | null;
  /** true = higher raw value better, false = lower better, null = context-only. */
  higherIsBetter: boolean | null;
  leftTeamName: string;
  rightTeamName: string;
  leftTeamAbbr: string;
  rightTeamAbbr: string;
  /** Existing per-metric winner authority. */
  comparison?: MetricComparison;
  projected?: boolean;
};

function RankLine({
  rank,
  neutral,
  align,
  teamName,
  projected,
}: {
  rank: number | null;
  neutral: boolean;
  align: "start" | "end";
  teamName: string;
  projected: boolean;
}) {
  if (rank == null || !Number.isFinite(rank)) {
    return (
      <span
        className={cn(
          "block text-[10px] font-semibold uppercase tracking-wide text-slate-400",
          align === "end" ? "text-right" : "text-left"
        )}
      >
        Unranked
        <span className="sr-only"> — {teamName}</span>
      </span>
    );
  }
  return (
    <span className={cn("flex", align === "end" ? "justify-end" : "justify-start")}>
      <MatchupRankBadge rank={rank} neutral={neutral} projected={projected} />
    </span>
  );
}

export default function NflHeadToHeadMetricRow({
  label,
  shortLabel,
  contextLabel,
  help,
  leftValue,
  rightValue,
  leftRank,
  rightRank,
  leftRawValue = null,
  rightRawValue = null,
  higherIsBetter,
  leftTeamName,
  rightTeamName,
  leftTeamAbbr,
  rightTeamAbbr,
  comparison = "not-comparable",
  projected = false,
}: NflHeadToHeadMetricRowProps) {
  const helpId = useId();
  const [helpOpen, setHelpOpen] = useState(false);

  const neutral = higherIsBetter === null;
  const advantage = describeMetricAdvantage(comparison, leftTeamAbbr, rightTeamAbbr);
  const advantageTone =
    comparison === "away" || comparison === "home" ? "text-slate-700" : "text-slate-500";

  const railLabel = `Comparison rail — ${label}${contextLabel ? ` (${contextLabel})` : ""}: ${
    comparison === "away"
      ? `${leftTeamName} advantage`
      : comparison === "home"
        ? `${rightTeamName} advantage`
        : comparison === "tie"
          ? "even"
          : "not compared"
  }. ${leftTeamName} ${leftValue}${
    leftRank != null ? `, rank ${leftRank} ${projected ? "among available teams" : "of 32"}` : ""
  }. ${rightTeamName} ${rightValue}${rightRank != null ? `, rank ${rightRank} ${projected ? "among available teams" : "of 32"}` : ""}.`;

  const valueClass = (value: string) =>
    cn(
      "block text-[15px] font-extrabold leading-none tabular-nums sm:text-[17px]",
      value === METRIC_NA ? "text-slate-400" : "text-slate-900"
    );

  return (
    <div className="nfl-h2h-row border-b border-slate-100 py-2.5 last:border-0">
      {/* The divider spans the full category width (outer div); the actual
          value/label/value + rail content is capped and centred from `sm` up so
          it reads as one comparison unit rather than stretching edge to edge.
          Below `sm` the cap is inert and the 390px layout is untouched. */}
      <div className="mx-auto w-full sm:max-w-[760px]">
      <div className="grid grid-cols-[3.75rem_minmax(0,1fr)_3.75rem] items-start gap-x-2 sm:grid-cols-[5rem_minmax(0,1fr)_5rem] sm:gap-x-4">
        {/* Left value + rank */}
        <div className="min-w-0 text-right">
          <span className={valueClass(leftValue)}>
            <span className="sr-only">{leftTeamName}: </span>
            {leftValue}
          </span>
          <span className="mt-1 block">
            <RankLine rank={leftRank} neutral={neutral} align="end" teamName={leftTeamName} projected={projected} />
          </span>
        </div>

        {/* Centre: label + advantage words */}
        <div className="min-w-0 px-0.5 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-[12px] font-extrabold uppercase leading-tight tracking-[0.02em] text-slate-800 sm:text-[13px]">
              <span className="sm:hidden">{shortLabel ?? label}</span>
              <span className="hidden sm:inline">{label}</span>
            </span>
            {help && (
              <button
                type="button"
                aria-expanded={helpOpen}
                aria-controls={helpId}
                aria-label={`What is ${label}?`}
                onClick={() => setHelpOpen((open) => !open)}
                className="relative inline-grid h-4 w-4 shrink-0 place-items-center rounded-full border border-slate-300 text-[9px] font-bold leading-none text-slate-600 transition-colors before:absolute before:-inset-3.5 before:content-[''] hover:border-emerald-600 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                i
              </button>
            )}
          </div>
          {contextLabel && (
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {contextLabel}
            </div>
          )}
          <div className={cn("mt-1 text-[11px] font-bold leading-4", advantageTone)}>
            {advantage}
          </div>
        </div>

        {/* Right value + rank */}
        <div className="min-w-0 text-left">
          <span className={valueClass(rightValue)}>
            <span className="sr-only">{rightTeamName}: </span>
            {rightValue}
          </span>
          <span className="mt-1 block">
            <RankLine rank={rightRank} neutral={neutral} align="start" teamName={rightTeamName} projected={projected} />
          </span>
        </div>
      </div>

      <div className="mt-2">
        <NflComparisonRail
          ariaLabel={railLabel}
          input={{
            leftValue: leftRawValue,
            rightValue: rightRawValue,
            leftRank,
            rightRank,
            higherIsBetter,
            comparison,
          }}
        />
      </div>

      {help && (
        <div
          id={helpId}
          hidden={!helpOpen}
          className="mt-2 rounded border-l-2 border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[12px] leading-4 text-slate-600"
        >
          {help}
        </div>
      )}
      </div>
    </div>
  );
}
