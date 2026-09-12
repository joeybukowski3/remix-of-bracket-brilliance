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
 * (`variant="detail"`, the approved larger presentation inside a centred
 * max-width column).
 *
 * Both surfaces render this exact component so they cannot drift into two
 * visual systems. Every row is:
 *
 *   [ away rank ]        METRIC NAME        [ home rank ]
 *   ├─────────── one centred comparison bar ───────────┤
 *          away raw value            home raw value        (detail only)
 *
 *  - **Rank tiles show the league rank only.** Their colour comes solely from
 *    the canonical JKB 1–32 rank-tier scale (`rankBadgeClass` in
 *    `lib/nfl/rankTier.ts`) — never from which side wins the row.
 *  - **The comparison bar** is a single neutral track with a fixed midpoint. One
 *    fill grows from the midpoint toward the favoured team, its length set by the
 *    existing presentation-only magnitude in `matchupRailNormalization.ts`. The
 *    fill uses the favoured team's canonical colour (`nflTeamColorFor`).
 *  - **Raw values** (detail variant) sit beneath their own side of the bar,
 *    using the pre-formatted strings straight off the resolved metric. The
 *    advantaged side may take its team-colour emphasis; nothing is recomputed.
 *  - **The Edge** keeps the existing raw-stat-difference logic
 *    (`formatMetricDifference`) and the existing EVEN / N/A / "—" states. In the
 *    detail variant it is retained for assistive tech (`sr-only`) since the raw
 *    values now carry the same signal visually.
 *
 * Presentation only. `comparison`, ranks and raw values are all read straight
 * off the resolved `MatchupDisplayMetric`; nothing is recomputed here.
 */

export type MatchupMetricTableVariant = "snapshot" | "detail";

export type MatchupMetricTableRow = MatchupDisplayMetric & { contextLabel?: string };

type RailModel = ReturnType<typeof buildComparisonRailModel>;

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

function railModelFor(metric: MatchupDisplayMetric): RailModel {
  return buildComparisonRailModel({
    leftValue: metric.away.value,
    rightValue: metric.home.value,
    leftRank: metric.away.rank,
    rightRank: metric.home.rank,
    higherIsBetter: higherIsBetter(metric),
    comparison: metric.comparison,
  });
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
      className={cn("matchup-metric-table__value", ranked && rankBadgeClass(value.rank))}
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

function ComparisonBar({
  metric,
  model,
  matchup,
}: {
  metric: MatchupDisplayMetric;
  model: RailModel;
  matchup: NflMatchup;
}) {
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

/** The raw value beneath one side of the bar (detail variant only). */
function rawValueText(side: MatchupDisplaySide): string {
  if (side.formatted === METRIC_NA || side.formatted == null || side.formatted === "") return "—";
  return side.formatted;
}

function RawValuesRow({ metric }: { metric: MatchupDisplayMetric }) {
  // The advantaged side's value takes the sheet's semantic away/home emphasis
  // token (readable in both themes) rather than the literal team colour, which
  // can be near-black for some franchises. The bar fill still carries the
  // canonical team colour.
  const awayNa = metric.away.formatted === METRIC_NA;
  const homeNa = metric.home.formatted === METRIC_NA;

  return (
    <td data-cell="vals">
      <span
        className={cn(
          "matchup-metric-table__val",
          awayNa && "matchup-metric-table__val--na",
          !awayNa && metric.comparison === "away" && "matchup-metric-table__val--lead-away"
        )}
      >
        {rawValueText(metric.away)}
      </span>
      <span
        className={cn(
          "matchup-metric-table__val",
          homeNa && "matchup-metric-table__val--na",
          !homeNa && metric.comparison === "home" && "matchup-metric-table__val--lead-home"
        )}
      >
        {rawValueText(metric.home)}
      </span>
    </td>
  );
}

function EdgeCell({
  metric,
  matchup,
  showDifference,
}: {
  metric: MatchupDisplayMetric;
  matchup: NflMatchup;
  showDifference: boolean;
}) {
  const side =
    metric.comparison === "away" ? "away" : metric.comparison === "home" ? "home" : null;
  const team = side ? matchup[side] : null;
  const difference = showDifference ? formatMetricDifference(metric) : null;

  if (!team || !side) {
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
    <span className={`matchup-metric-table__edge matchup-metric-table__edge--${side}`}>
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
  const isDetail = variant === "detail";

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
              {isDetail ? (
                <>
                  <span aria-hidden="true">Rank</span>
                  <span className="sr-only">{matchup.away.abbr.toUpperCase()} league rank</span>
                </>
              ) : (
                matchup.away.abbr.toUpperCase()
              )}
            </th>
            <th scope="col" data-cell="metric">
              {isDetail ? <span className="sr-only">Metric</span> : "Metric"}
            </th>
            <th scope="col" data-cell="home">
              {isDetail ? (
                <>
                  <span aria-hidden="true">Rank</span>
                  <span className="sr-only">{matchup.home.abbr.toUpperCase()} league rank</span>
                </>
              ) : (
                matchup.home.abbr.toUpperCase()
              )}
            </th>
            <th scope="col" data-cell="edge" className="sr-only">
              Edge
            </th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => {
            const model = railModelFor(metric);
            const unavailable =
              metric.away.formatted === METRIC_NA && metric.home.formatted === METRIC_NA;
            return (
              <tr
                key={metric.key}
                data-availability={unavailable ? "none" : "available"}
                data-context={metric.contextLabel ? "true" : "false"}
              >
                <td data-cell="away">
                  <ValueCell metric={metric} side="away" abbr={matchup.away.abbr} projected={projected} />
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
                  <ValueCell metric={metric} side="home" abbr={matchup.home.abbr} projected={projected} />
                </td>
                <td data-cell="bar">
                  <ComparisonBar metric={metric} model={model} matchup={matchup} />
                </td>
                {isDetail && <RawValuesRow metric={metric} />}
                <td data-cell="edge" className={isDetail ? "sr-only" : undefined}>
                  <EdgeCell metric={metric} matchup={matchup} showDifference={edgeDifference} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
