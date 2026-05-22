import type { CSSProperties } from "react";

export default function MlbContextChip({ label, style }: { label: string; style?: CSSProperties }) {
  return (
    <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-foreground" style={style}>
      {label}
    </span>
  );
}
