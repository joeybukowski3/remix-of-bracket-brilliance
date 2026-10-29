import { cn } from "@/lib/utils";
import { LINES_STALE_AFTER_HOURS, SNAPSHOT_STALE_AFTER_HOURS, type SnapshotFreshness } from "@/lib/nba/props/hostedClient";

const stamp = (iso: string): string => `${iso.slice(0, 16).replace("T", " ")} UTC`;
const ago = (hours: number): string => (hours < 1 ? `${Math.max(1, Math.round(hours * 60))} min ago` : hours < 48 ? `${Math.round(hours)} h ago` : `${Math.round(hours / 24)} d ago`);

/** Source timestamps for the published snapshot, with an unmissable warning when the odds or the snapshot are stale. */
export default function SnapshotStatus({ freshness, hasStatistics = true }: { freshness: SnapshotFreshness; hasStatistics?: boolean }) {
  return (
    <div role="status" data-testid="snapshot-status" data-stale={freshness.isStale} data-odds-stale={freshness.linesStale} className={cn("mb-3 rounded border px-3 py-2 text-[12px]", freshness.isStale ? "border-amber-400 bg-amber-50 text-amber-950" : "border-slate-200 bg-white text-slate-700")}>
      {freshness.linesStale ? (
        <p className="font-bold">STALE ODDS: these sportsbook lines were captured more than {LINES_STALE_AFTER_HOURS} hours ago and may have moved or been taken down. Check the book before relying on them.</p>
      ) : null}
      {freshness.snapshotStale ? <p className="font-bold">STALE DATA: this board was published more than {SNAPSHOT_STALE_AFTER_HOURS} hours ago and may not reflect the latest games, injuries or lineups.</p> : null}
      <p className="flex flex-wrap gap-x-4 gap-y-0.5">
        <span>Published <strong>{stamp(freshness.publishedAtUtc)}</strong> ({ago(freshness.publishedAgeHours)})</span>
        {hasStatistics ? <span>Statistics retrieved <strong>{freshness.statisticsRetrievedUtc ? stamp(freshness.statisticsRetrievedUtc) : "unknown"}</strong></span> : null}
        <span>
          Newest sportsbook line{" "}
          <strong>{freshness.newestLineCaptureUtc ? `${stamp(freshness.newestLineCaptureUtc)} (${ago(freshness.lineAgeHours ?? 0)})` : "none on this board"}</strong>
        </span>
      </p>
    </div>
  );
}
