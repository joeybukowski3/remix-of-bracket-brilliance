import { cn } from "@/lib/utils";

export type PreviewResultKind = "HIT" | "MISS" | "DNP" | "PENDING" | "UNRESOLVED";

const STYLES: Record<PreviewResultKind, string> = {
  HIT: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  MISS: "bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200",
  DNP: "bg-slate-50 text-slate-400 ring-1 ring-inset ring-slate-200",
  PENDING: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  UNRESOLVED: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
};

const DOT_STYLES: Record<PreviewResultKind, string> = {
  HIT: "bg-emerald-500",
  MISS: "bg-slate-400",
  DNP: "bg-slate-300",
  PENDING: "bg-amber-500",
  UNRESOLVED: "bg-rose-500",
};

/** Maps the raw model/grading status strings used across HR, numerology, and Sin City records to one of the five display kinds. */
export function classifyResultStatus(status: string | null | undefined, hitFlag?: boolean): PreviewResultKind {
  if (hitFlag) return "HIT";
  switch (status) {
    case "hit":
    case "final-hit":
      return "HIT";
    case "miss":
      return "MISS";
    case "did_not_play":
    case "did-not-play":
      return "DNP";
    case "pending":
      return "PENDING";
    case "final":
      return hitFlag ? "HIT" : "MISS";
    default:
      return "UNRESOLVED";
  }
}

export default function ResultBadge({ kind }: { kind: PreviewResultKind }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", STYLES[kind])}>
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT_STYLES[kind])} aria-hidden="true" />
      {kind}
    </span>
  );
}
