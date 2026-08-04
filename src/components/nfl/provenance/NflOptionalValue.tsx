import { cn } from "@/lib/utils";

type NflOptionalValueProps = {
  value: string | number | null | undefined;
  unavailableLabel?: string;
  className?: string;
};

/** Omits only absent values. Numeric zero and consumer-supplied strings remain valid data. */
export default function NflOptionalValue({
  value,
  unavailableLabel,
  className,
}: NflOptionalValueProps) {
  if (value === null || value === undefined) {
    if (!unavailableLabel) return null;
    return (
      <span className={cn("text-slate-500", className)} data-value-state="unavailable">
        {unavailableLabel}
      </span>
    );
  }

  return (
    <span className={className} data-value-state="available">
      {value}
    </span>
  );
}
