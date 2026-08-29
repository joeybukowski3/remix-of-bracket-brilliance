/**
 * Shared metric cell for the /nfl/power-ratings board.
 *
 * One contract for every scored column — OFF, DEF, OVR, YPP, EPA, Success — and
 * for SoS. The Rankings/Ratings toggle only decides which of the two lines is
 * primary; it never changes which value drives the heat background.
 *
 *   Rankings:  primary = #rank        secondary = value
 *   Ratings:   primary = value        secondary = #rank
 *
 * Heat background is always a function of `value` (the underlying rating), never
 * of rank. A `null` value renders a single neutral "—" with no heat.
 */

export type MetricCellMode = "rankings" | "ratings";

export type MetricCellProps = {
  value: number | null;
  rank: number | null;
  mode: MetricCellMode;
  /** Format the raw value for display (e.g. one decimal, "12.8 avg"). */
  formatValue: (value: number) => string;
  /** Format the rank line (default `#{rank}`). */
  formatRank?: (rank: number) => string;
  /** Paint a green/red heat background from `value`. Off for SoS / rank-only. */
  heat?: boolean;
  /**
   * Heat scale bounds. Values are linearly mapped min→red, mid→neutral,
   * max→green. Defaults to the 1–99 public rating scale centred on 50.
   */
  heatMin?: number;
  heatMax?: number;
};

function heatStyle(value: number, min: number, max: number): { bg: string; fg: string } {
  const span = max - min;
  const t = span <= 0 ? 0.5 : Math.max(0, Math.min(1, (value - min) / span));
  if (t >= 0.5) {
    const k = (t - 0.5) * 2;
    return { bg: `rgba(22, 163, 74, ${0.1 + k * 0.32})`, fg: k > 0.55 ? "#0f5132" : "#166534" };
  }
  const k = (0.5 - t) * 2;
  return { bg: `rgba(220, 38, 38, ${0.1 + k * 0.32})`, fg: k > 0.55 ? "#7f1d1d" : "#991b1b" };
}

export function MetricCell({
  value,
  rank,
  mode,
  formatValue,
  formatRank = (r) => `#${r}`,
  heat = false,
  heatMin = 1,
  heatMax = 99,
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

  const style = heat ? (() => {
    const { bg } = heatStyle(value, heatMin, heatMax);
    return { background: bg };
  })() : undefined;
  const fg = heat ? heatStyle(value, heatMin, heatMax).fg : undefined;

  return (
    <td className="nfl-pr-heat" style={style}>
      <span className="nfl-pr-heatval nfl-pr-value-primary" style={fg ? { color: fg } : undefined}>
        {primary}
      </span>
      {secondary !== null && <span className="nfl-pr-heatrank nfl-pr-value-secondary">{secondary}</span>}
    </td>
  );
}
