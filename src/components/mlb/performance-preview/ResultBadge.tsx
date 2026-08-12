import { cn } from "@/lib/utils";

export type PreviewResultKind = "HIT" | "MISS" | "DNP" | "PENDING" | "UNRESOLVED";

const STYLES: Record<PreviewResultKind, string> = {
  HIT: "bg-emerald-100 text-emerald-800",
  MISS: "bg-slate-100 text-slate-600",
  DNP: "bg-slate-100 text-slate-400",
  PENDING: "bg-amber-100 text-amber-800",
  UNRESOLVED: "bg-rose-100 text-rose-700",
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
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", STYLES[kind])}>
      {kind}
    </span>
  );
}
