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

const RANK_MEDALS: Record<number, string> = {
  1: "🥇",
  2: "🥈",
  3: "🥉",
};

export default function PgaTopProjectionsCard({ rows }: { rows: PgaTopProjection[] }) {
  return (
    <section className="rounded-[30px] bg-card p-5 shadow-[0_2px_12px_hsl(var(--foreground)/0.06)] ring-1 ring-border/60">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Model Top Picks
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground/70">
            Based on applied weights · updates live
          </p>
        </div>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
          Top 5
        </span>
      </div>

      <div className="mt-4 space-y-2.5">
        {rows.map((row, idx) => (
          <div
            key={row.id}
            className={`flex items-center justify-between gap-4 rounded-[20px] px-4 py-3 transition ${
              idx === 0
                ? "bg-emerald-50 ring-1 ring-emerald-200/70 dark:bg-emerald-950/25 dark:ring-emerald-900/50"
                : "bg-secondary/50 hover:bg-secondary/80"
            }`}
          >
            {/* Left: avatar + name */}
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  idx === 0
                    ? "bg-emerald-600 text-white"
                    : "bg-primary/10 text-primary"
                }`}
              >
                {initials(row.player)}
                {RANK_MEDALS[row.rank] && (
                  <span className="absolute -right-1 -top-1 text-sm leading-none">
                    {RANK_MEDALS[row.rank]}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{row.player}</p>
                <p className="truncate text-[11px] text-muted-foreground">{row.note}</p>
              </div>
            </div>

            {/* Right: rank pill + score */}
            <div className="shrink-0 text-right">
              <span
                className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  idx === 0
                    ? "bg-emerald-600 text-white"
                    : "bg-primary/10 text-primary"
                }`}
              >
                #{row.rank}
              </span>
              <p className="mt-1.5 font-mono text-sm font-semibold text-foreground">
                {formatCompositeScore(row.score)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
