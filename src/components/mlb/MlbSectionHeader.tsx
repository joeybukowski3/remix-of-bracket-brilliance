import type { ReactNode } from "react";

export default function MlbSectionHeader({
  eyebrow,
  title,
  subtitle,
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
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-1.5">
          {icon ? (
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-secondary text-slate-700 ring-1 ring-border/70">
              {icon}
            </span>
          ) : null}
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{eyebrow}</div>
        </div>
        <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-foreground sm:text-xl">{title}</h2>
        {subtitle ? <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{subtitle}</p> : null}
      </div>
      {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
    </div>
  );
}
