import type { ReactNode } from "react";

export default function MlbSectionHeader({
  eyebrow,
  title,
  icon,
  rightSlot,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  rightSlot?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {icon ? (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-slate-600 ring-1 ring-border/80 shrink-0">
            {icon}
          </span>
        ) : null}
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/80">{eyebrow}</div>
          <h2 className="text-sm font-bold tracking-tight text-foreground leading-snug">{title}</h2>
        </div>
      </div>
      {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
    </div>
  );
}
