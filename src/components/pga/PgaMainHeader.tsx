import { Link } from "react-router-dom";
import type { PgaTournamentMeta } from "@/lib/pga/pgaTypes";

export default function PgaMainHeader({
  meta,
  ctaLabel = "View Best Bets",
}: {
  meta: PgaTournamentMeta;
  ctaLabel?: string;
}) {
  return (
    <section className="rounded-[32px] bg-card px-6 py-6 shadow-[0_2px_12px_hsl(var(--foreground)/0.06)] ring-1 ring-border/60">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {meta.title}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-[1.85rem]">
            {meta.tournament}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{meta.venue}</p>
        </div>

        {/* Quick stats pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-foreground">
            {meta.fieldSize} golfers
          </span>
          <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-foreground">
            {meta.eventType}
          </span>
          <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-foreground">
            {meta.noCutLabel}
          </span>
        </div>
      </div>

      {/* Picks CTA */}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/50 pt-4">
        <p className="text-xs text-muted-foreground">
          Model weights drive the table below. Adjust them in the panel →
        </p>
        <Link
          to={meta.picksPath}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          {ctaLabel}
        </Link>
      </div>
    </section>
  );
}
