/**
 * Restrained "not connected yet" copy shared by the placeholder sections.
 *
 * Deliberately rendered once per section rather than once per row: the brief
 * calls for clean `N/A` cells, not a "coming soon" badge on every metric.
 */
export default function MatchupPendingNote({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`mt-2 border-t border-dashed border-slate-200 pt-2 text-[11px] leading-4 text-slate-400 ${className}`}
    >
      {children}
    </p>
  );
}

/** Standard sentence for sections whose rows are scaffolded but unpopulated. */
export const PIPELINE_PENDING_COPY =
  "Detailed values populate when the matchup data pipeline is connected. No figures are estimated in the meantime.";

/**
 * Used by the offense/defense sections. Kept in step with what is actually
 * connected: EPA moved from "unavailable" to sourced in Phase 6, so it is no
 * longer listed among the pending rows.
 */
export const CONVENTIONAL_STATS_NOTE =
  "Conventional stats come from nflverse team-week data and reflect the selected sample. EPA is nflfastR play-by-play, aggregated over the same sample. Success rate is published by RBSDM and uses its own period policy shown on each row. First downs, third down and time of possession stay unavailable until a later data phase — they are never estimated.";
