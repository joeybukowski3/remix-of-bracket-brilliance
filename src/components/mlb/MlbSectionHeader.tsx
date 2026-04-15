import type { ReactNode } from "react";

export default function MlbSectionHeader({
  eyebrow,
  title,
  subtitle,
  rightSlot,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</div>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-foreground sm:text-2xl">{title}</h2>
        {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">{subtitle}</p> : null}
      </div>
      {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
    </div>
  );
}
