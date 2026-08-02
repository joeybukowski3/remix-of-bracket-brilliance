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
