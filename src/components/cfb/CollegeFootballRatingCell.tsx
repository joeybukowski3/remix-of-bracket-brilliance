import {
  formatNullableNumber,
  formatRank,
  rankHeatStyle,
} from "@/lib/cfb/format";
import { cn } from "@/lib/utils";

type Props = {
  value?: number | null;
  rank?: number | null;
  /** Show as rank (#12) instead of decimal rating. */
  asRank?: boolean;
  digits?: number;
  teamCount?: number;
  className?: string;
  heat?: boolean;
};

export default function CollegeFootballRatingCell({
  value,
  rank,
  asRank = false,
  digits = 1,
  teamCount = 138,
  className,
  heat = true,
}: Props) {
  const display = asRank
    ? formatRank(rank ?? value)
    : formatNullableNumber(value, digits);
  const heatRank = asRank ? (rank ?? value) : rank;
  const style = heat ? rankHeatStyle(heatRank, teamCount) : undefined;

  return (
    <span
      className={cn(
        "inline-flex min-w-[2.25rem] items-center justify-center rounded px-1 py-0.5 font-semibold tabular-nums",
        className,
      )}
      style={style}
    >
      {display}
    </span>
  );
}
