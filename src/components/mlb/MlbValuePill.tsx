import type { ReactNode } from "react";

export default function MlbValuePill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "warning";
}) {
  const toneClass =
    tone === "positive"
      ? "bg-primary/10 text-primary"
      : tone === "warning"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        : "bg-secondary text-muted-foreground";

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium ${toneClass}`}>
      {children}
    </span>
  );
}
