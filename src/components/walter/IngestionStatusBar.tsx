import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import type { WalterCaptureType, WalterIngestionStatus, WalterWeekArtifact } from "@/lib/walter/types";
import { WALTER_CAPTURE_TYPES } from "@/lib/walter/types";

const CAPTURE_LABELS: Record<WalterCaptureType, string> = {
  wednesday: "Wed 2 AM",
  thursday: "Thu 12 PM",
  saturday: "Sat 11 PM",
  sunday: "Sun 11 AM",
};

/**
 * A capture only gets red/error treatment for genuine scrape problems: a
 * source page that failed to fetch, a discovered panel that failed to parse,
 * a parsed matchup that couldn't be matched to the canonical schedule, or the
 * same canonical game captured twice. Canonical games WalterFootball simply
 * hasn't published for free yet (`canonicalNotCaptured`) are an expected,
 * incomplete-source state, not a failure -- see scheduleCoverage.mjs.
 */
function hasRealWarning(entry?: WalterIngestionStatus): boolean {
  if (!entry || entry.status === "pending") return false;
  if (entry.status === "failed") return true;
  const coverage = entry.scheduleCoverage;
  if (!coverage) return entry.gamesFailed > 0;
  return (
    coverage.sourcePagesFetched < coverage.sourcePagesExpected ||
    coverage.panelsParsed < coverage.panelsDiscovered ||
    coverage.unmatchedParsed.length > 0 ||
    coverage.duplicateCanonicalMatches.length > 0
  );
}

function StatusIcon({ entry }: { entry?: WalterIngestionStatus }) {
  if (!entry || entry.status === "pending") return <CircleDashed className="h-4 w-4 text-slate-500" aria-hidden />;
  if (hasRealWarning(entry)) return <XCircle className="h-4 w-4 text-red-500" aria-hidden />;
  return <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />;
}

function CoverageDetails({ entry }: { entry: WalterIngestionStatus }) {
  const coverage = entry.scheduleCoverage;
  if (!coverage) {
    // Older manifests captured before scheduleCoverage existed -- fall back
    // to the raw counts rather than showing nothing.
    return <span className="text-slate-500">{entry.gamesWritten}/{entry.gamesDiscovered}</span>;
  }

  const showParsedLine = coverage.panelsParsed !== coverage.panelsDiscovered || coverage.panelsDiscovered !== coverage.canonicalMatched;

  return (
    <div className="flex flex-col text-xs text-slate-500">
      <span>
        Sources: {coverage.sourcePagesFetched}/{coverage.sourcePagesExpected}
      </span>
      <span>
        Captured: {coverage.canonicalMatched}/{coverage.canonicalWeekGameCount} games
      </span>
      {coverage.canonicalNotCaptured.length > 0 && <span>{coverage.canonicalNotCaptured.length} unavailable from public source</span>}
      {showParsedLine && (
        <span>
          Parsed: {coverage.panelsParsed}/{coverage.panelsDiscovered}
        </span>
      )}
      {coverage.unmatchedParsed.length > 0 && (
        <span className="text-red-400">{coverage.unmatchedParsed.length} parsed game(s) did not match the canonical schedule</span>
      )}
      {coverage.duplicateCanonicalMatches.length > 0 && (
        <span className="text-red-400">{coverage.duplicateCanonicalMatches.length} canonical game(s) captured more than once</span>
      )}
    </div>
  );
}

export function IngestionStatusBar({ artifact }: { artifact: WalterWeekArtifact }) {
  const lastSuccess = WALTER_CAPTURE_TYPES.filter((t) => artifact.ingestion[t]?.status === "ok" || artifact.ingestion[t]?.status === "partial")
    .map((t) => ({ type: t, capturedAt: artifact.ingestion[t]?.capturedAt ?? null }))
    .filter((e) => e.capturedAt)
    .sort((a, b) => new Date(b.capturedAt!).getTime() - new Date(a.capturedAt!).getTime())[0];

  const lastFailure = WALTER_CAPTURE_TYPES.filter((t) => artifact.ingestion[t]?.status === "failed")
    .map((t) => ({ type: t, capturedAt: artifact.ingestion[t]?.capturedAt ?? null }))
    .sort((a, b) => new Date(b.capturedAt ?? 0).getTime() - new Date(a.capturedAt ?? 0).getTime())[0];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-wrap gap-4 text-sm">
        {WALTER_CAPTURE_TYPES.map((type) => {
          const entry = artifact.ingestion[type];
          return (
            <div key={type} className="flex items-start gap-2">
              <StatusIcon entry={entry} />
              <div className="flex flex-col">
                <span className="text-slate-300">{CAPTURE_LABELS[type]}</span>
                {entry && entry.status !== "pending" ? <CoverageDetails entry={entry} /> : <span className="text-xs text-slate-500">Pending</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-6 text-xs text-slate-500">
        {lastSuccess && (
          <span>
            Last successful capture: <span className="text-slate-300">{CAPTURE_LABELS[lastSuccess.type]}</span>
            {" · "}
            {new Date(lastSuccess.capturedAt!).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} ET
          </span>
        )}
        {lastFailure && (
          <span className="text-red-400">
            Last failed capture: {CAPTURE_LABELS[lastFailure.type]}
            {lastFailure.capturedAt ? ` · ${new Date(lastFailure.capturedAt).toLocaleString("en-US", { timeZone: "America/New_York" })} ET` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
