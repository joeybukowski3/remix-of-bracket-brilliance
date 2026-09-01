/**
 * A tiny inline trend line for the betting line-movement table.
 *
 * Not a chart: no axes, no gridlines, no tooltip, no container. It plots only
 * the actual stored observation values it is handed — nothing is interpolated
 * or padded — and communicates direction alone. Fewer than two points is not a
 * trend, so it renders a muted dash instead.
 */
const WIDTH = 52;
const HEIGHT = 16;
const PAD = 2;

export default function MatchupBettingSparkline({
  values,
  label,
}: {
  values: number[];
  label: string;
}) {
  if (values.length < 2) {
    return (
      <span className="matchup-spark matchup-spark--empty" aria-hidden>
        —
      </span>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = values
    .map((value, index) => {
      const x = PAD + (index / (values.length - 1)) * (WIDTH - PAD * 2);
      const y = PAD + (1 - (value - min) / span) * (HEIGHT - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const drift = values[values.length - 1] - values[0];
  const direction =
    drift > 0 ? "matchup-spark--up" : drift < 0 ? "matchup-spark--down" : "matchup-spark--flat";

  return (
    <svg
      className={`matchup-spark ${direction}`}
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`${label}: ${values.length} observed points`}
    >
      <polyline points={points} fill="none" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
