import type {
  MatchupDisplayMetric,
  MatchupDisplaySide,
} from "@/components/nfl/matchups/matchupDisplayMetrics";
import { formatRankOrdinal } from "@/components/nfl/matchups/rankOrdinal";
import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import { formatMetricDifference } from "@/components/nfl/matchups/matchupVisualMath";
import { METRIC_NA } from "@/lib/nfl/matchupMetrics";
import type { NflMatchup } from "@/lib/nfl/matchups";

/**
 * The one comparison table shared by the Overview → Team Comparison Snapshot
 * and the Team Comparison tab.
 *
 * Both surfaces render this exact component so they cannot drift into two
 * visual systems: same three-part row (AWAY rank ← METRIC → HOME rank), same
 * rank tiles, same winner / weaker treatment, same Edge treatment, same borders
 * and separators. They differ only by `variant` — a type-scale step — and by how
 * many of these tables the caller lays out around it.
 *
 * Each row reads TEAM rank ← METRIC → TEAM rank: the away rank tile on the
 * left, the metric name centred and visually dominant, the home rank tile on
 * the right. The edge / advantage sits directly beneath the metric name as a
 * compact secondary line — never as a rail bar and never as a raw stat value in
 * the primary row.
 *
 * Presentation only. Every number shown is read straight off the resolved
 * `MatchupDisplayMetric`:
 *
 *  - Team value cells show the **league rank only**. The raw formatted value is
 *    never removed from the model and stays on each cell's `title` for hover.
 *  - `comparison` is the existing per-metric winner authority — nothing is
 *    recomputed here.
 *  - The Edge cell keeps the existing raw-stat-difference logic
 *    (`formatMetricDifference`) and the existing EVEN / N/A states.
 *
 * The row is a CSS grid at every width (see `nflMatchupSheet.css`, keyed off the
 * `data-cell` attributes below): desktop and tablet lay the three parts across a
 * single line with the edge beneath the centred metric; phone keeps the exact
 * same arrangement at a compact scale — away rank | metric | home rank on top,
 * edge on a second line — so mobile is a responsive version of the same
 * component, not a different pattern.
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
  const winning = metric.comparison === side;
  const losing =
    (metric.comparison === "away" || metric.comparison === "home") && !winning;

  const ranked = value.rank != null && Number.isFinite(value.rank);
  const title = ranked
    ? `${projected ? "Projected rank" : "League rank"} ${value.rank}${
        projected ? " among available teams" : " of 32"
      } · ${value.formatted}`
    : value.formatted;

  return (
    <span
      className={`matchup-metric-table__value${winning ? " is-winner" : ""}${
        losing ? " is-weaker" : ""
      }`}
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
