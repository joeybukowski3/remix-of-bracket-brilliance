import { Check } from "lucide-react";
import { useId, useState } from "react";
import { formatRankOrdinal } from "@/components/nfl/matchups/rankOrdinal";
import type { MetricComparison } from "@/lib/nfl/matchupCategoryAdvantage";

export type CompactMetricSide = {
  formatted: string;
  rank: number | null;
  accessibleName: string;
};

function CompactSide({
  side,
  value,
  winner,
}: {
  side: "away" | "home";
  value: CompactMetricSide;
  winner: MetricComparison;
}) {
  const rank = formatRankOrdinal(value.rank);
  const leads = winner === side;

  return (
    <div
      className={`matchup-compact-row__side matchup-compact-row__side--${side}${leads ? " is-leader" : ""}`}
      aria-label={`${value.accessibleName}: ${value.formatted}${rank ? `, league rank ${value.rank} of 32` : ""}`}
    >
      <span className="matchup-compact-row__value">{value.formatted}</span>
      <span className="matchup-compact-row__rank">
        {rank}
        {leads && <Check aria-hidden className="matchup-compact-row__check" />}
      </span>
    </div>
  );
}

/**
 * Presentation-only phone row shared by every matchup comparison surface.
 *
 * The caller supplies already-formatted values, ranks and the existing winner
 * authority. This component never resolves, compares, ranks or estimates a
 * metric. Desktop keeps each surface's existing table markup.
 */
export default function CompactMatchupMetricRow({
  label,
  sublabel,
  away,
  home,
  winner = "not-comparable",
  advantageText,
  help,
  className = "",
}: {
  label: string;
  sublabel?: string;
  away: CompactMetricSide;
  home: CompactMetricSide;
  winner?: MetricComparison;
  advantageText?: string;
  help?: string;
  className?: string;
}) {
  const helpId = useId();
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div className={`matchup-compact-row sm:hidden ${className}`} data-compact-matchup-row>
      <CompactSide side="away" value={away} winner={winner} />

      <div className="matchup-compact-row__metric">
        <div className="matchup-compact-row__label-line">
          <span>{label}</span>
          {help && (
            <button
              type="button"
              aria-expanded={helpOpen}
              aria-controls={helpId}
              aria-label={`What is ${label}?`}
              onClick={() => setHelpOpen((open) => !open)}
              className="matchup-compact-row__help"
            >
              i
            </button>
          )}
        </div>
        {sublabel && <small>{sublabel}</small>}
      </div>

      <CompactSide side="home" value={home} winner={winner} />

      <span className="sr-only">
        {advantageText ?? "No comparison winner is asserted for this row."}
      </span>

      {help && (
        <div id={helpId} hidden={!helpOpen} className="matchup-compact-row__help-copy">
          {help}
        </div>
      )}
    </div>
  );
}
