import { cn } from "@/lib/utils";
import {
  NFL_SOURCE_KIND_LABELS,
  type NflSourceKind,
} from "@/lib/nfl/provenance";

const SOURCE_CLASSES: Record<NflSourceKind, string> = {
  model: "border-blue-200 bg-blue-50 text-blue-800",
  market: "border-amber-200 bg-amber-50 text-amber-800",
  "previous-season": "border-slate-200 bg-slate-100 text-slate-700",
  schedule: "border-cyan-200 bg-cyan-50 text-cyan-800",
  external: "border-violet-200 bg-violet-50 text-violet-800",
  editorial: "border-stone-200 bg-stone-100 text-stone-700",
  unavailable: "border-slate-200 bg-white text-slate-500",
};

type NflSourceTagProps = {
  kind: NflSourceKind;
  className?: string;
};

export default function NflSourceTag({ kind, className }: NflSourceTagProps) {
  const label = NFL_SOURCE_KIND_LABELS[kind];

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase leading-4 tracking-wider",
        SOURCE_CLASSES[kind],
        className,
      )}
      data-source-kind={kind}
    >
      {label}
    </span>
  );
}
