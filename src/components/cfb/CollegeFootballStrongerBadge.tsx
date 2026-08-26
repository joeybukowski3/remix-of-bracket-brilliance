import { Check } from "lucide-react";

type Props = {
  show: boolean;
  /** The stronger side's own team primary color — never a generic green. */
  color: string;
  className?: string;
};

/** Filled circular checkmark badge used across comparison rows to mark the stronger side. */
export default function CollegeFootballStrongerBadge({ show, color, className }: Props) {
  if (!show) return null;
  return (
    <span
      aria-hidden="true"
      data-testid="stronger-badge"
      className={className ?? "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white"}
      style={{ background: color }}
    >
      <Check className="h-2.5 w-2.5" strokeWidth={3} />
    </span>
  );
}
