import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import type { WalterCaptureType, WalterIngestionStatus, WalterWeekArtifact } from "@/lib/walter/types";
import { WALTER_CAPTURE_TYPES } from "@/lib/walter/types";

const CAPTURE_LABELS: Record<WalterCaptureType, string> = {
  wednesday: "Wed 2 AM",
  thursday: "Thu 12 PM",
  saturday: "Sat 11 PM",
  sunday: "Sun 11 AM",
};

function StatusIcon({ status }: { status: WalterIngestionStatus["status"] }) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />;
  if (status === "partial") return <XCircle className="h-4 w-4 text-amber-500" aria-hidden />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-red-500" aria-hidden />;
  return <CircleDashed className="h-4 w-4 text-slate-500" aria-hidden />;
}

function statusLabel(entry: WalterIngestionStatus): string {
  if (entry.status === "pending") return "Pending";
  return `${entry.gamesWritten}/${entry.gamesDiscovered}`;
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
            <div key={type} className="flex items-center gap-2">
              <StatusIcon status={entry?.status ?? "pending"} />
              <span className="text-slate-300">{CAPTURE_LABELS[type]}</span>
              <span className="text-slate-500">{entry ? statusLabel(entry) : "Pending"}</span>
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
