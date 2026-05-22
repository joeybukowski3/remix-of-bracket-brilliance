import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export default function MlbValuePill({
  children,
  tone = "neutral",
  className,
  style,
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "warning";
  className?: string;
  style?: CSSProperties;
}) {
  const toneClass =
    tone === "positive"
      ? "bg-primary/10 text-primary"
      : tone === "warning"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        : "bg-secondary text-muted-foreground";

  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium", toneClass, className)} style={style}>
      {children}
    </span>
  );
}
