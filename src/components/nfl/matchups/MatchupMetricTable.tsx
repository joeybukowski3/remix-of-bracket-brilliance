import type { CSSProperties } from "react";
import type {
  MatchupDisplayMetric,
  MatchupDisplaySide,
} from "@/components/nfl/matchups/matchupDisplayMetrics";
import { formatRankOrdinal } from "@/components/nfl/matchups/rankOrdinal";
import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import { formatMetricDifference } from "@/components/nfl/matchups/matchupVisualMath";
import { buildComparisonRailModel } from "@/lib/nfl/matchupRailNormalization";
import { nflTeamColorFor } from "@/lib/nfl/nflTeamColor";
import { rankBadgeClass } from "@/lib/nfl/rankTier";
import { METRIC_NA } from "@/lib/nfl/matchupMetrics";
import type { NflMatchup } from "@/lib/nfl/matchups";
import { cn } from "@/lib/utils";

/**
 * The one comparison table shared by the Overview → Team Comparison Snapshot
 * (`variant="snapshot"`, compact bento density) and the Team Comparison tab
 * (`variant="detail"`, a larger type scale inside a centred max-width column).
 *
 * Both surfaces render this exact component so they cannot drift into two
 * visual systems. Every row is:
 *
 *   [ away rank ]        METRIC NAME        [ home rank ]
 *   ├─────────── one centred comparison bar ───────────┤
 *                     AWAY / HOME  +gap
 *
 *  - **Rank tiles show the league rank only.** Their colour comes solely from
 *    the canonical JKB 1–32 rank-tier scale (`rankBadgeClass` in
 *    `lib/nfl/rankTier.ts`) — never from which side wins the row, so rank 1 and
 *    rank 2 are both "elite" even when they face each other. The raw formatted
 *    value is kept on the tile's `title` for hover and never shown as the tile's
 *    text.
 *  - **The comparison bar** is a single neutral track with a fixed midpoint. One
 *    fill grows from the midpoint toward the favoured team, its length set by the
 *    existing presentation-only magnitude in `matchupRailNormalization.ts`
 *    (rank-differential, or a proportional raw-value gap when a rank is missing).
 *    The fill uses the favoured team's canonical colour (`nflTeamColorFor`),
 *    falling back to the sheet's neutral token when no colour resolves. A tie or
 *    a not-comparable row has no directional fill.
 *  - **The Edge** keeps the existing raw-stat-difference logic
 *    (`formatMetricDifference`) and the existing EVEN / N/A / "—" states.
 *
 * Presentation only. `comparison`, ranks and raw values are all read straight
 * off the resolved `MatchupDisplayMetric`; nothing is recomputed here.
 */

export type MatchupMetricTableVariant = "snapshot" | "detail";

/**
 * A table row. Every field but `contextLabel` comes straight off a resolved
 * `MatchupDisplayMetric`; `contextLabel` is an optional second line under the
 * metric name for a period tag ("2025 L8") or a pairing note.
 */
export type MatchupMetricTableRow = MatchupDisplayMetric & { contextLabel?: string };

/**
 * What the team value cell shows: the ordinal league rank when the metric is
 * ranked; "N/A" when genuinely unavailable; otherwise the raw figure as a last
 * resort for a present-but-unranked stat (a season total with no league order),
 * where a fabricated rank or a false "N/A" would both mislead.
 */
function rankText(side: MatchupDisplaySide): string {
  const ordinal = formatRankOrdinal(side.rank);
  if (ordinal) return ordinal;
  if (side.formatted === METRIC_NA) return METRIC_NA;
  return side.formatted;
}

function higherIsBetter(metric: MatchupDisplayMetric): boolean | null {
  if (metric.direction === "higher-is-better") return true;
  if (metric.direction === "lower-is-better") return false;
  return null;
}

function ValueCell({
  metric,
  side,
  abbr,
  projected,
}: {
  metric: MatchupDisplayMetric;
  side: "away" | "home";
  abbr: string;
  projected: boolean;
}) {
  const value = metric[side];
  const ranked = value.rank != null && Number.isFinite(value.rank);
  const title = ranked
    ? `${projected ? "Projected rank" : "League rank"} ${value.rank}${
        projected ? " among available teams" : " of 32"
      } · ${value.formatted}`
    : value.formatted;

  return (
    <span
      // Colour is governed solely by the league rank tier — never by the row
      // winner. An unranked cell falls back to the neutral tier styling.
      className={cn(
        "matchup-metric-table__value",
        ranked && rankBadgeClass(value.rank)
      )}
      data-ranked={ranked ? "true" : "false"}
      title={title}
    >
      <span className="matchup-metric-table__abbr" aria-hidden="true">
        {abbr.toUpperCase()}
      </span>
      <span className="sr-only">{abbr.toUpperCase()}: </span>
      <span className="matchup-metric-table__rank">{rankText(value)}</span>
    </span>
  );
}

/**
 * One neutral-track comparison bar with a fixed midpoint. Direction and
 * magnitude come from the existing rail normalization; the directional fill is
 * tinted with the favoured team's canonical colour.
 */
function ComparisonBar({
  metric,
  matchup,
}: {
  metric: MatchupDisplayMetric;
  matchup: NflMatchup;
}) {
  const model = buildComparisonRailModel({
    leftValue: metric.away.value,
    rightValue: metric.home.value,
    leftRank: metric.away.rank,
    rightRank: metric.home.rank,
    higherIsBetter: higherIsBetter(metric),
    comparison: metric.comparison,
  });

  const directional = model.side === "left" || model.side === "right";
  const favoured =
    model.side === "left" ? matchup.away : model.side === "right" ? matchup.home : null;
  const fill = favoured ? nflTeamColorFor(favoured) : null;
  const widthPercent = Math.round(model.magnitude * 50 * 10) / 10;

  const label =
    model.side === "left"
      ? `${matchup.away.abbr.toUpperCase()} advantage`
      : model.side === "right"
        ? `${matchup.home.abbr.toUpperCase()} advantage`
        : model.side === "even"
          ? "Even"
          : "Not compared";

  return (
    <span
      className="matchup-metric-table__bar"
      role="img"
      aria-label={`Comparison bar: ${label}`}
      data-side={model.side}
      data-basis={model.basis}
    >
      <span className="matchup-metric-table__bar-track" aria-hidden="true">
        {directional && (
          <span
            className={`matchup-metric-table__bar-fill matchup-metric-table__bar-fill--${model.side}`}
            style={
              {
                width: `${widthPercent}%`,
                "--bar-fill": fill ?? "var(--sheet-even)",
              } as CSSProperties
            }
          />
        )}
        <span className="matchup-metric-table__bar-tick" />
      </span>
    </span>
  );
}

function EdgeCell({
  metric,
  matchup,
  showDifference,
}: {
  metric: MatchupDisplayMetric;
  matchup: NflMatchup;
  /**
   * Whether the raw-stat gap is meaningful. False when the two team cells read
   * different underlying metrics (attacking vs defending win rates, offense vs
   * defense pairings) — there the Edge names the advantaged side only.
   */
  showDifference: boolean;
}) {
  const side =
    metric.comparison === "away"
      ? "away"
      : metric.comparison === "home"
        ? "home"
        : null;
  const team = side ? matchup[side] : null;
  const difference = showDifference ? formatMetricDifference(metric) : null;

  if (!team || !side) {
    // "EVEN" for a genuine tie, "N/A" for a data gap, "—" for a row with no
    // better/worse direction (descriptive/context-only) — never "N/A" for the
    // last case, which reads as missing data.
    const neutral =
      metric.comparison === "tie"
        ? "EVEN"
        : metric.comparison === "not-comparable"
          ? "—"
          : "N/A";
    return (
      <span
        className="matchup-metric-table__edge is-neutral"
        title={metric.comparison === "not-comparable" ? "Not compared" : undefined}
      >
        {neutral}
      </span>
    );
  }

  return (
    <span
      className={`matchup-metric-table__edge matchup-metric-table__edge--${side}`}
    >
      <NflTeamCrest team={team} side={side} size={16} />
      <b>{team.abbr.toUpperCase()}</b>
      {difference && <small>{difference}</small>}
    </span>
  );
}

export default function MatchupMetricTable({
  metrics,
  matchup,
  caption,
  variant = "snapshot",
  projected = false,
  edgeDifference = true,
}: {
  metrics: MatchupMetricTableRow[];
  matchup: NflMatchup;
  /** Screen-reader caption; the table is otherwise visually headed by its columns. */
  caption: string;
  variant?: MatchupMetricTableVariant;
  /** Projection lens — only changes the value cell's hover wording. */
  projected?: boolean;
  /**
   * Whether the Edge cell may show the raw-stat gap. Leave true when both team
   * cells read the same metric; set false when they read opposing metrics
   * (attacking vs defending), where only the advantaged side is meaningful.
   */
  edgeDifference?: boolean;
}) {
  return (
    <div className="matchup-metric-table" data-variant={variant}>
      <table>
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          <col className="matchup-metric-table__col--value" />
          <col className="matchup-metric-table__col--metric" />
          <col className="matchup-metric-table__col--value" />
          <col className="matchup-metric-table__col--edge" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" data-cell="away">
              {matchup.away.abbr.toUpperCase()}
            </th>
            <th scope="col" data-cell="metric">
              Metric
            </th>
            <th scope="col" data-cell="home">
              {matchup.home.abbr.toUpperCase()}
            </th>
            <th scope="col" data-cell="edge" className="sr-only">
              Edge
            </th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => (
            <tr key={metric.key}>
              <td data-cell="away">
                <ValueCell
                  metric={metric}
                  side="away"
                  abbr={matchup.away.abbr}
                  projected={projected}
                />
              </td>
              <th scope="row" data-cell="metric" title={metric.help}>
                <span className="matchup-metric-table__metric-name">
                  {metric.shortLabel ?? metric.label}
                </span>
                {metric.contextLabel && (
                  <span className="matchup-metric-table__context">{metric.contextLabel}</span>
                )}
              </th>
              <td data-cell="home">
                <ValueCell
                  metric={metric}
                  side="home"
                  abbr={matchup.home.abbr}
                  projected={projected}
                />
              </td>
              <td data-cell="bar">
                <ComparisonBar metric={metric} matchup={matchup} />
              </td>
              <td data-cell="edge">
                <EdgeCell metric={metric} matchup={matchup} showDifference={edgeDifference} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
