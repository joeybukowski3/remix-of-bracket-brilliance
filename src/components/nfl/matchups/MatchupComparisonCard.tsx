import MatchupComparisonTeamHeader from "@/components/nfl/matchups/MatchupComparisonTeamHeader";
import MatchupMetricTable, {
  type MatchupMetricTableRow,
  type MatchupMetricTableVariant,
} from "@/components/nfl/matchups/MatchupMetricTable";
import type { NflMatchup } from "@/lib/nfl/matchups";
import { cn } from "@/lib/utils";

type Unit = "Offense" | "Defense";

/**
 * The shared comparison card used by both Overview and Team Comparison.
 *
 * Its structure is intentionally fixed: title band, compact team identity,
 * then the canonical metric table. Team Comparison may retain raw values via
 * the detail table variant, but it does not get a second card/header system.
 */
export default function MatchupComparisonCard({
  title,
  titleId,
  matchup,
  metrics,
  caption,
  variant = "snapshot",
  projected = false,
  edgeDifference = true,
  context,
  unit,
  possession,
  stickyHeader = false,
  className,
}: {
  title: string;
  titleId?: string;
  matchup: NflMatchup;
  metrics: MatchupMetricTableRow[] | MatchupMetricTableRow[][];
  caption: string;
  variant?: MatchupMetricTableVariant;
  projected?: boolean;
  edgeDifference?: boolean;
  context?: { away: string; home: string };
  unit?: { away: Unit; home: Unit };
  possession?: string;
  stickyHeader?: boolean;
  className?: string;
}) {
  const generatedTitleId = useId();
  const headingId = titleId ?? generatedTitleId;
  const tables = Array.isArray(metrics[0])
    ? (metrics as MatchupMetricTableRow[][])
    : [metrics as MatchupMetricTableRow[]];

  return (
    <section className={cn("matchup-comparison-card", className)} aria-labelledby={headingId}>
      <h3 id={headingId}>{title}</h3>
      <MatchupComparisonTeamHeader
        matchup={matchup}
        sticky={stickyHeader}
        context={context}
        unit={unit}
        possession={possession}
      />
      <div className={cn("matchup-comparison-card__tables", tables.length > 1 && "is-split")}>
        {tables.map((rows, index) => (
          <MatchupMetricTable
            key={index}
            variant={variant}
            metrics={rows}
            matchup={matchup}
            projected={projected}
            edgeDifference={edgeDifference}
            caption={tables.length > 1 ? `${caption}, part ${index + 1}` : caption}
          />
        ))}
      </div>
    </section>
  );
}
import { useId } from "react";
