import type { ReactNode } from "react";
import { getRankHeatmapStyle } from "@/lib/pga/pgaHeatmap";

type Props = {
  value: number | string | null;
  maxRank: number;
  className?: string;
  children?: ReactNode;
};

export default function PgaHeatmapCell({ value, maxRank, className = "", children }: Props) {
  const numericValue = typeof value === "number" ? value : null;

  return (
    <span
      className={`inline-flex min-w-[2.4rem] justify-center rounded-xl px-2 py-1 text-sm font-medium tabular-nums ${className}`}
      style={getRankHeatmapStyle(numericValue, maxRank)}
    >
      {children ?? value ?? "—"}
    </span>
  );
}
