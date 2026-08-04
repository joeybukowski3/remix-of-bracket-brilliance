import NflSourceTag from "@/components/nfl/provenance/NflSourceTag";
import {
  formatNflMetadataTimestamp,
  type NflProvenanceViewModel,
} from "@/lib/nfl/provenance";
import { cn } from "@/lib/utils";

type NflProvenanceDetailsProps = {
  provenance: NflProvenanceViewModel;
  className?: string;
};

type ValidationTone = "neutral" | "positive" | "warning" | "negative";

const VALIDATION_CLASSES: Record<ValidationTone, string> = {
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
  positive: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  negative: "border-red-200 bg-red-50 text-red-800",
};

function getNflValidationTone(status: string): ValidationTone {
  const normalized = status.trim().toLowerCase();
  if (/^(failed|invalid|error|rejected)$/.test(normalized)) return "negative";
  if (/^(warning|warn|partial|provisional|draft|pending|stage[- ]?\d+)$/.test(normalized)) return "warning";
  if (/^(validated|verified|passed|complete)$/.test(normalized)) return "positive";
  return "neutral";
}

export function NflValidationStatus({ status }: { status: string | null | undefined }) {
  const label = status?.trim();
  if (!label) return null;
  const tone = getNflValidationTone(label);

  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full whitespace-normal break-words rounded-full border px-2 py-0.5 text-[10px] font-bold leading-4",
        VALIDATION_CLASSES[tone],
      )}
      data-validation-tone={tone}
    >
      Validation: {label}
    </span>
  );
}

export default function NflProvenanceDetails({
  provenance,
  className,
}: NflProvenanceDetailsProps) {
  const metadata = [
    provenance.season != null ? `Season ${provenance.season}` : null,
    provenance.week != null ? `Week ${provenance.week}` : null,
    provenance.generatedAt ? `Generated ${formatNflMetadataTimestamp(provenance.generatedAt)}` : null,
    provenance.retrievedAt ? `Retrieved ${formatNflMetadataTimestamp(provenance.retrievedAt)}` : null,
    provenance.sourceUpdatedAt ? `Source updated ${formatNflMetadataTimestamp(provenance.sourceUpdatedAt)}` : null,
  ].filter((item): item is string => item !== null);

  return (
    <div
      aria-label="Data provenance"
      className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px] leading-4 text-slate-500", className)}
    >
      <NflSourceTag kind={provenance.sourceKind} />
      {provenance.sourceLabel ? (
        <span className="min-w-0 break-words font-semibold text-slate-600">{provenance.sourceLabel}</span>
      ) : null}
      {metadata.map((item) => (
        <span className="break-words" key={item}>{item}</span>
      ))}
      <NflValidationStatus status={provenance.validationStatus} />
    </div>
  );
}
