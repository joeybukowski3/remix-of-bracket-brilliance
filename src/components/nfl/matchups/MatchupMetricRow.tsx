import { useId, useState } from "react";
import CompactMatchupMetricRow from "@/components/nfl/matchups/CompactMatchupMetricRow";
import MatchupRankBadge from "@/components/nfl/matchups/MatchupRankBadge";
import {
  MATCHUP_METRIC_LABEL,
  MATCHUP_PRIMARY_TEXT,
  MATCHUP_ROW_AWAY_CELL,
  MATCHUP_ROW_HOME_CELL,
  MATCHUP_ROW_LABEL_CELL,
  MATCHUP_STAT_ROW_GRID,
  MATCHUP_VALUE_TEXT,
} from "@/components/nfl/matchups/matchupTypography";
import {
  describeMetricAdvantage,
  type MatchupDisplayMetric,
  type MatchupDisplaySide,
} from "@/components/nfl/matchups/matchupDisplayMetrics";
import { METRIC_NA } from "@/lib/nfl/matchupMetrics";
import { useIsCompactLayout } from "@/hooks/useIsCompactLayout";

/**
 * One team's rank and value for one metric.
 *
 * Rank leads at the shared headline size, with the raw value beside it as small
 * muted text — the same treatment Unit Matchups uses, so the two tables read as
 * one system rather than two scales. Tier colour is carried by the rank chip
 * alone; `rankTier.ts` is untouched.
 *
 * The head-to-head leader takes a soft ring rather than a heavier weight, since
 * both figures already sit at the headline weight. That is a redundant cue only
 * — the row states its advantage in words beneath the label and always prints
 * the numeric rank, so neither leader nor tier depends on appearance.
 *
 * A context-only metric is drawn neutral: leading the league in pass attempts
 * is a play-style fact, not an "Elite" performance. An unavailable value takes
 * no tier either, so a missing number cannot borrow one it does not have.
 */
function MetricSide({
  side,
  value,
  teamName,
  metricLabel,
  neutral,
  isLeader,
}: {
  side: "away" | "home";
  value: MatchupDisplaySide;
  teamName: string;
  metricLabel: string;
  neutral: boolean;
  /** True when `metric.comparison` already names this side as the leader. */
  isLeader: boolean;
}) {
  const isAway = side === "away";
  const unavailable = value.formatted === METRIC_NA;
  const hasRank = value.rank != null && Number.isFinite(value.rank);

  /**
   * Same rank-primary treatment as Unit Matchups, at the same shared size, so
   * the two tables read as one system. The leader keeps a soft ring rather than
   * a heavier weight, since both figures are already at the headline weight.
   */
  return (
    <div
      className={`flex w-full items-center gap-2.5 ${isAway ? "justify-end" : "justify-start"}`}
    >
      <span className="sr-only">
        {teamName} {metricLabel}:{" "}
      </span>
      {isAway && hasRank && (
        <span className={MATCHUP_VALUE_TEXT}>{value.formatted}</span>
      )}
      {hasRank ? (
        <MatchupRankBadge
          rank={value.rank}
          neutral={neutral}
          emphasis="primary"
          className={isLeader ? "ring-2 ring-slate-900/15" : ""}
        />
      ) : (
        <span
          className={`${MATCHUP_PRIMARY_TEXT} font-extrabold leading-tight ${
            unavailable ? "text-slate-400" : "text-slate-500"
          }`}
        >
          {value.formatted}
        </span>
      )}
      {!isAway && hasRank && (
        <span className={MATCHUP_VALUE_TEXT}>{value.formatted}</span>
      )}
    </div>
  );
}

/**
 * The analyzer's comparison row:
 *
 *   [away value + rank] · [metric label + advantage in words] · [home value + rank]
 *
 * Side columns are a fixed width from `sm` up, so values stay aligned down a
 * whole group however long the labels get. Below `sm` the same row becomes a
 * stacked pair with explicit team labels rather than a table that has to be
 * scrolled sideways.
 *
 * The advantage is always stated in words using the matchup's live
 * abbreviations — "Even", "Not compared" and "No data" included — so the result
 * never depends on a colour a reader may not perceive.
 *
 * Definitions open inline from a real `<button>` with `aria-expanded`, which
 * works under touch. A hover-only tooltip would be unreachable on a phone,
 * which is where the labels are shortest.
 */
export default function MatchupMetricRow({
  metric,
  awayAbbr,
  homeAbbr,
  awayTeamName,
  homeTeamName,
}: {
  metric: MatchupDisplayMetric;
  awayAbbr: string;
  homeAbbr: string;
  awayTeamName: string;
  homeTeamName: string;
}) {
  const helpId = useId();
  const [helpOpen, setHelpOpen] = useState(false);
  const isMobile = useIsCompactLayout("(max-width: 639px)");
  const neutral = metric.direction === "context-only" || metric.direction === "none";
  const advantage = describeMetricAdvantage(metric.comparison, awayAbbr, homeAbbr);
  const advantageTone =
    metric.comparison === "away" || metric.comparison === "home"
      ? "text-slate-700"
      : "text-slate-600";

  return (
    <div className="border-b border-slate-100 last:border-0">
      {isMobile ? (
      <CompactMatchupMetricRow
        label={metric.shortLabel ?? metric.label}
        away={{
          formatted: metric.away.formatted,
          rank: metric.away.rank,
          accessibleName: awayTeamName,
        }}
        home={{
          formatted: metric.home.formatted,
          rank: metric.home.rank,
          accessibleName: homeTeamName,
        }}
        winner={metric.comparison}
        advantageText={advantage}
        help={metric.help}
      />
      ) : (

      <div className={`grid py-1.5 ${MATCHUP_STAT_ROW_GRID}`}>
      <div className={`min-w-0 px-1 text-center sm:px-4 ${MATCHUP_ROW_LABEL_CELL}`}>
        <div className="flex items-center justify-center gap-1.5">
          {/* Matches the Unit Matchups row label, so the two tables read at the
              same scale rather than one looking like a footnote of the other. */}
          <span className={MATCHUP_METRIC_LABEL}>
            <span className="sm:hidden">{metric.shortLabel ?? metric.label}</span>
            <span className="hidden sm:inline">{metric.label}</span>
          </span>
          {metric.help && (
            <button
              type="button"
              aria-expanded={helpOpen}
              aria-controls={helpId}
              aria-label={`What is ${metric.label}?`}
              onClick={() => setHelpOpen((open) => !open)}
              /* The visible dot stays 16px, as the approved design draws it, but
                 a transparent pseudo-element extends the hit area to 44px so it
                 is comfortably tappable without altering the row's rhythm. */
              className="relative inline-grid h-4 w-4 shrink-0 place-items-center rounded-full border border-slate-300 text-[9px] font-bold leading-none text-slate-600 transition-colors before:absolute before:-inset-3.5 before:content-[''] hover:border-emerald-600 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              i
            </button>
          )}
        </div>
        {/* Compressed to a caption, never removed: the advantage must stay
            legible in words, not only as the heavier pill weight beside it. */}
        <div
          className={`mt-1 text-[13px] font-bold leading-4 ${advantageTone}`}
        >
          {advantage}
        </div>
      </div>

      <div className={`px-1 sm:px-3 ${MATCHUP_ROW_AWAY_CELL}`}>
        <MetricSide
          side="away"
          value={metric.away}
          teamName={awayTeamName}
          metricLabel={metric.label}
          neutral={neutral}
          isLeader={metric.comparison === "away"}
        />
      </div>

      <div className={`px-1 sm:px-3 ${MATCHUP_ROW_HOME_CELL}`}>
        <MetricSide
          side="home"
          value={metric.home}
          teamName={homeTeamName}
          metricLabel={metric.label}
          neutral={neutral}
          isLeader={metric.comparison === "home"}
        />
      </div>

      {metric.help && (
        <div
          id={helpId}
          hidden={!helpOpen}
          className="col-span-2 row-start-3 rounded border-l-2 sm:col-span-3 sm:row-start-2 border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[12px] leading-4 text-slate-600"
        >
          {metric.help}
        </div>
      )}
      </div>
      )}
    </div>
  );
}
