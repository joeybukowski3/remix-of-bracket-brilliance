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
      <div className="flex items-center gap-2">
        {icon ? (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-secondary text-slate-700 ring-1 ring-border/70">
            {icon}
          </span>
        ) : null}
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</div>
          <h2 className="text-sm font-bold tracking-tight text-foreground">{title}</h2>
        </div>
      </div>
      {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
    </div>
  );
}
