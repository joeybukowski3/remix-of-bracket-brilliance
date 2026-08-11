import { formatNullableNumber, formatRank } from "@/lib/cfb/format";
import { getCfbRatingHeatClass } from "@/lib/cfb/ratingPresentation";
import { cn } from "@/lib/utils";

type Props = {
  value?: number | null;
  rank?: number | null;
  /** Show as rank (#12) instead of decimal rating. */
  asRank?: boolean;
  digits?: number;
  className?: string;
  heat?: boolean;
};

export default function CollegeFootballRatingCell({
  value,
  rank,
  asRank = false,
  digits = 1,
  className,
  heat = true,
}: Props) {
  const display = asRank
    ? formatRank(rank ?? value)
    : formatNullableNumber(value, digits);

  return (
    <span
      className={cn(
        "inline-flex min-w-[2.25rem] items-center justify-center rounded px-1 py-0.5 font-semibold tabular-nums",
        heat && getCfbRatingHeatClass(value),
        className,
      )}
    >
      {display}
    </span>
  );
}
