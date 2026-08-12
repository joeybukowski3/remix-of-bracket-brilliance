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
      className={`mt-2 border-t border-dashed border-slate-200 pt-2 text-[11px] leading-4 text-slate-600 ${className}`}
    >
      {children}
    </p>
  );
}

/**
 * Compact per-section attribution for the three statistical comparison sections.
 *
 * These sections previously each repeated the full four-sentence methodology
 * paragraph, so the same text appeared three times on one page. The methodology
 * now lives once in the page-level note below the sections
 * (`CONVENTIONAL_STATS_METHODOLOGY`); each section keeps only its source list,
 * which is what a reader actually needs in place.
 */
export const CONVENTIONAL_STATS_SOURCES = "Sources: nflverse team-week, nflfastR play-by-play, RBSDM.";

/** Stated once per page, beneath the sections it describes. */
export const CONVENTIONAL_STATS_METHODOLOGY =
  "Conventional stats come from nflverse team-week data and reflect the selected sample. EPA is nflfastR play-by-play, aggregated over the same sample. Success rate is published by RBSDM and uses its own period policy shown on each row. First downs, third down and time of possession stay unavailable until a later data phase — they are never estimated.";
