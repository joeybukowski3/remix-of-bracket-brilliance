import { formatCompositeScore } from "@/lib/pga/pgaModelHelpers";
import type { PgaTopProjection } from "@/lib/pga/pgaTypes";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function PgaTopProjectionsCard({ rows }: { rows: PgaTopProjection[] }) {
  return (
    <section className="rounded-[30px] bg-card p-5 shadow-[0_16px_36px_hsl(var(--foreground)/0.05)]">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Top Model Projections</p>
      <div className="mt-5 space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-4 rounded-[24px] bg-secondary/55 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {initials(row.player)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{row.player}</p>
                <p className="truncate text-xs text-muted-foreground">{row.note}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Rank {row.rank}</p>
              <p className="mt-2 text-sm font-semibold text-foreground">{formatCompositeScore(row.score)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
