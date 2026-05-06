import type { CSSProperties } from "react";

export default function MlbContextChip({ label, style }: { label: string; style?: CSSProperties }) {
  return (
    <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-[11px] font-medium text-foreground" style={style}>
      {label}
    </span>
  );
}
