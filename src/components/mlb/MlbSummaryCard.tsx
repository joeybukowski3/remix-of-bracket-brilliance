import type { MlbSummaryCardData } from "@/lib/mlb/mlbTypes";
import MlbValuePill from "@/components/mlb/MlbValuePill";

export default function MlbSummaryCard({ card }: { card: MlbSummaryCardData }) {
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-border/60 shadow-[0_10px_24px_hsl(var(--foreground)/0.04)]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{card.label}</div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="text-base font-semibold text-foreground">{card.value}</div>
        <MlbValuePill tone={card.tone}>{card.note}</MlbValuePill>
      </div>
    </div>
  );
}
