import { useId, useState } from "react";
import MatchupRankBadge from "@/components/nfl/matchups/MatchupRankBadge";
import {
  describeMetricAdvantage,
  type MatchupDisplayMetric,
  type MatchupDisplaySide,
} from "@/components/nfl/matchups/matchupDisplayMetrics";
import { METRIC_NA } from "@/lib/nfl/matchupMetrics";
import { rankCellClass } from "@/lib/nfl/rankTier";

/**
 * One team's value for one metric.
 *
 * Drawn as two distinct pills — the value and its league rank — rather than a
 * washed cell containing loose text. Both take their tint from the same
 * `rankTier` bands the rest of the analyzer uses: the value pill wears the faint
 * `cell` wash and the rank pill the saturated `badge`, so the pair reads as one
 * object without the value competing with the rank for attention. The band
 * definitions themselves are untouched.
 *
 * Weight, not colour, marks the head-to-head leader: the side `metric.comparison`
 * already names is set heavier than the side that is not. That is a redundant
 * cue only — the row states its advantage in words beneath the label, and the
 * numeric rank is always printed, so neither the leader nor the tier is ever
 * carried by appearance alone.
 *
 * A context-only metric is drawn neutral: leading the league in pass attempts
 * is a play-style fact, not an "Elite" performance, and must not be coloured as
 * one. An unavailable value takes no tint either, so a missing number cannot
 * borrow a tier it does not have.
 */
function MetricSide({
  side,
  value,
  teamAbbr,
  teamName,
  metricLabel,
  neutral,
  isLeader,
}: {
  side: "away" | "home";
  value: MatchupDisplaySide;
  teamAbbr: string;
  teamName: string;
  metricLabel: string;
  neutral: boolean;
  /** True when `metric.comparison` already names this side as the leader. */
  isLeader: boolean;
}) {
  const isAway = side === "away";
  const unavailable = value.formatted === METRIC_NA;
  const tinted = !neutral && !unavailable;

  return (
    <div
      className={`flex items-center justify-between gap-2 sm:flex-col sm:items-stretch sm:justify-start sm:gap-1 ${
        isAway ? "sm:text-right" : "sm:text-left"
      } ${isAway ? "" : "flex-row-reverse sm:flex-col"}`}
    >
      {/* The abbreviation is the mobile row's only team label, so the stacked
          pair never leaves a reader guessing which number is whose. */}
      <span
        aria-hidden
        className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-600 sm:hidden"
      >
        {teamAbbr.toUpperCase()}
      </span>
      <span className="sr-only">
        {teamName} {metricLabel}:{" "}
      </span>
      <div className={isAway ? "sm:flex sm:justify-end" : "sm:flex sm:justify-start"}>
        <span
          className={`inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-[13px] leading-4 tabular-nums sm:text-sm ${
            isLeader ? "font-extrabold" : "font-semibold"
          } ${
            tinted ? `${rankCellClass(value.rank)} border-slate-200/80` : "border-transparent"
          } ${unavailable ? "text-slate-600" : "text-slate-900"}`}
        >
          {value.formatted}
        </span>
      </div>
      <div className={isAway ? "sm:flex sm:justify-end" : "sm:flex sm:justify-start"}>
        <MatchupRankBadge
          rank={value.rank}
          neutral={neutral}
          className={isLeader ? "font-extrabold" : ""}
        />
      </div>
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
  const neutral = metric.direction === "context-only" || metric.direction === "none";
  const advantage = describeMetricAdvantage(metric.comparison, awayAbbr, homeAbbr);
  const advantageTone =
    metric.comparison === "away" || metric.comparison === "home"
      ? "text-slate-700"
      : "text-slate-600";

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-slate-100 py-2 last:border-0 sm:grid-cols-[6.5rem_minmax(0,1fr)_6.5rem] sm:items-center sm:gap-2">
      <div className="order-first col-span-2 min-w-0 sm:order-none sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:text-center">
        <div className="flex items-center gap-1.5 sm:justify-center">
          <span className="text-[11px] font-bold leading-4 text-slate-700">
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
          className={`mt-0.5 text-[9px] font-bold uppercase leading-3 tracking-[0.06em] ${advantageTone}`}
        >
          {advantage}
        </div>
      </div>

      <div className="sm:col-start-1 sm:row-start-1">
        <MetricSide
          side="away"
          value={metric.away}
          teamAbbr={awayAbbr}
          teamName={awayTeamName}
          metricLabel={metric.label}
          neutral={neutral}
          isLeader={metric.comparison === "away"}
        />
      </div>

      <div className="sm:col-start-3 sm:row-start-1">
        <MetricSide
          side="home"
          value={metric.home}
          teamAbbr={homeAbbr}
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
          className="col-span-2 rounded border-l-2 border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[11px] leading-4 text-slate-600 sm:col-span-3 sm:row-start-2"
        >
          {metric.help}
        </div>
      )}
    </div>
  );
}
