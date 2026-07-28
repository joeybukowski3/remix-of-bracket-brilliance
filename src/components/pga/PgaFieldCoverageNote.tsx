export type PgaFieldCoverage = {
  fieldCount?: number | null;
  modeledCount?: number | null;
  unmodeledCount?: number | null;
  coveragePct?: number | null;
  unmodeledPlayers?: string[] | null;
  reason?: string | null;
};

/**
 * Concise disclosure of official entrants the model does not cover.
 *
 * Entrants without current statistics are absent from every ranking and can
 * never be recommended, which nothing on the site previously said. Deliberately
 * one sentence with names behind a disclosure -- internal keys, timestamps and
 * schedule ids stay in the artifact and the workflow logs, not on the page.
 *
 * Renders nothing when coverage data is absent (legacy artifacts) or complete.
 */
export default function PgaFieldCoverageNote({
  coverage,
  className = "",
}: {
  coverage?: PgaFieldCoverage | null;
  className?: string;
}) {
  const fieldCount = coverage?.fieldCount ?? 0;
  const modeledCount = coverage?.modeledCount ?? 0;
  const unmodeledPlayers = coverage?.unmodeledPlayers ?? [];
  const unmodeledCount = coverage?.unmodeledCount ?? unmodeledPlayers.length;

  if (!fieldCount || !unmodeledCount) return null;

  return (
    <div className={`text-xs leading-6 text-gray-600 ${className}`}>
      <span className="font-semibold text-gray-700">Field coverage: </span>
      {modeledCount} of {fieldCount} official entrants have current statistics; {unmodeledCount}{" "}
      {unmodeledCount === 1 ? "is" : "are"} not modeled this week.
      {unmodeledPlayers.length ? (
        <details className="mt-1">
          <summary className="cursor-pointer font-semibold text-gray-700 underline decoration-dotted">
            Show unmodeled {unmodeledPlayers.length === 1 ? "entrant" : "entrants"}
          </summary>
          <p className="mt-1 text-gray-600">{unmodeledPlayers.join(", ")}.</p>
          {coverage?.reason ? <p className="mt-1 text-gray-500">Reason: {coverage.reason}.</p> : null}
        </details>
      ) : null}
    </div>
  );
}
