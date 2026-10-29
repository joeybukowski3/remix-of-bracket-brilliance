import { cn } from "@/lib/utils";
import type { SnapshotFreshness } from "@/lib/nba/props/hostedClient";

const stamp = (iso: string): string => `${iso.slice(0, 16).replace("T", " ")} UTC`;
const ago = (hours: number): string => (hours < 1 ? `${Math.max(1, Math.round(hours * 60))} min ago` : hours < 48 ? `${Math.round(hours)} h ago` : `${Math.round(hours / 24)} d ago`);

/** Source timestamps for the owner's hosted snapshot, with an unmissable flag when it is stale. */
export default function SnapshotStatus({ freshness }: { freshness: SnapshotFreshness }) {
  return (
    <div role="status" data-testid="snapshot-status" data-stale={freshness.isStale} className={cn("mb-3 rounded border px-3 py-2 text-[12px]", freshness.isStale ? "border-amber-400 bg-amber-50 text-amber-950" : "border-slate-200 bg-white text-slate-700")}>
      {freshness.isStale ? <p className="font-bold">STALE SNAPSHOT: {freshness.staleReasons.join("; ")}. Do not rely on these lines; publish a fresh snapshot.</p> : null}
      <p className="flex flex-wrap gap-x-4 gap-y-0.5">
        <span>Published <strong>{stamp(freshness.publishedAtUtc)}</strong> ({ago(freshness.publishedAgeHours)})</span>
        <span>Statistics retrieved <strong>{freshness.statisticsRetrievedUtc ? stamp(freshness.statisticsRetrievedUtc) : "unknown"}</strong></span>
        <span>
          Newest sportsbook line{" "}
          <strong>{freshness.newestLineCaptureUtc ? `${stamp(freshness.newestLineCaptureUtc)} (${ago(freshness.lineAgeHours ?? 0)})` : "none on this board"}</strong>
        </span>
      </p>
    </div>
  );
}
