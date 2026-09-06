import { buildComparisonRailModel, type RailInput } from "@/lib/nfl/matchupRailNormalization";

/**
 * One continuous head-to-head comparison rail for a single metric.
 *
 * The centre is parity. A single fill grows from the centre toward the
 * advantaged team's side, its length set by the presentation-only magnitude in
 * `matchupRailNormalization.ts` — never by comparing raw values from metrics
 * with different units. Direction (higher- vs lower-is-better) is already baked
 * into the league rank the magnitude reads, so nothing here special-cases it.
 *
 * The result is never carried by colour alone: the row states its advantage in
 * words beside the rail and always prints both numeric ranks, and this element
 * carries an `aria-label` describing the same outcome. Colours reuse the sheet's
 * away/home tokens so the fill matches the crest it points at, in both the light
 * and the dark-navy theme.
 */
export default function NflComparisonRail({
  input,
  ariaLabel,
}: {
  input: RailInput;
  /** Full sentence describing the advantage — e.g. "SEA advantage on EPA / Play". */
  ariaLabel: string;
}) {
  const model = buildComparisonRailModel(input);
  const widthPercent = model.magnitude * 50;
  const directional = model.side === "left" || model.side === "right";

  return (
    <div
      className="nfl-h2h-rail"
      role="img"
      aria-label={ariaLabel}
      data-side={model.side}
      data-basis={model.basis}
    >
      <div className="nfl-h2h-rail__track" aria-hidden="true">
        {directional && (
          <div
            className={`nfl-h2h-rail__fill nfl-h2h-rail__fill--${model.side}`}
            style={{ width: `${widthPercent}%` }}
          />
        )}
        <span className="nfl-h2h-rail__tick" />
      </div>
    </div>
  );
}
