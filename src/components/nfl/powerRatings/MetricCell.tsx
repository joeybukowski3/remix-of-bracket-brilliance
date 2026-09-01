/**
 * Shared metric cell for the /nfl/power-ratings board.
 *
 * One contract for every scored column — OFF, DEF, OVR, YPP, EPA, Success — and
 * for SoS. The Rankings/Ratings toggle only decides which of the two lines is
 * primary; it never changes the heat background.
 *
 *   Rankings:  primary = #rank        secondary = value
 *   Ratings:   primary = value        secondary = #rank
 *
 * Heat is resolved upstream by `buildPowerRatingsHeat` against the full team
 * population using the canonical shared JKB Heat scale (favorable-percentile
 * bands, gold → green → neutral slate → red). This component only paints the
 * style it is handed. A `null` value renders a single neutral "—" with no heat;
 * a missing heat resolution renders the value with no fill.
 */

export type MetricCellMode = "rankings" | "ratings";

/** Canonical shared JKB Heat cell style, from `buildPowerRatingsHeat`. */
export type MetricCellHeat = {
  backgroundColor: string;
  color: string;
  boxShadow: string;
};

export type MetricCellProps = {
  value: number | null;
  rank: number | null;
  mode: MetricCellMode;
  /** Format the raw value for display (e.g. one decimal, "12.8 avg"). */
  formatValue: (value: number) => string;
  /** Format the rank line (default `#{rank}`). */
  formatRank?: (rank: number) => string;
  /**
   * Resolved JKB Heat style for this cell, or `null` / omitted for a
   * context-only column or a cell whose value is missing from the population.
   */
  heat?: MetricCellHeat | null;
};

export function MetricCell({
  value,
  rank,
  mode,
  formatValue,
  formatRank = (r) => `#${r}`,
  heat = null,
}: MetricCellProps) {
  if (value === null || !Number.isFinite(value)) {
    return (
      <td className="nfl-pr-heat">
        <span className="nfl-pr-heatval nfl-pr-unavailable">—</span>
      </td>
    );
  }

  const valueText = formatValue(value);
  const rankText = rank !== null ? formatRank(rank) : null;
  const primaryIsRank = mode === "rankings";

  const primary = primaryIsRank ? rankText ?? valueText : valueText;
  const secondary = primaryIsRank ? (rankText ? valueText : null) : rankText;

  return (
    <td
      className={`nfl-pr-heat${heat ? " nfl-pr-heat--painted" : ""}`}
      style={
        heat
          ? { backgroundColor: heat.backgroundColor, color: heat.color, boxShadow: heat.boxShadow }
          : undefined
      }
    >
      <span className="nfl-pr-heatval nfl-pr-value-primary">{primary}</span>
      {secondary !== null && (
        <span className="nfl-pr-heatrank nfl-pr-value-secondary">{secondary}</span>
      )}
    </td>
  );
}
