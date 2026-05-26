import type { PlayerModelRow } from "@/lib/pga/pgaTypes";

function parseFinishNum(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = Number(String(v).trim().toUpperCase().replace(/^T/, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function finishCellBg(v: string | null | undefined): string {
  const n = parseFinishNum(v);
  if (n == null) return "";
  if (n <= 5)  return "bg-emerald-100 text-emerald-800 font-bold";
  if (n <= 15) return "bg-emerald-50 text-emerald-700 font-semibold";
  if (n <= 30) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-600";
}

function sgColor(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  if (v > 2.0) return "font-bold text-emerald-700";
  if (v > 0.8) return "font-semibold text-emerald-600";
  if (v > 0)   return "text-emerald-600";
  if (v > -0.5) return "text-foreground";
  return "text-red-500";
}

export default function PgaCourseHistoryTable({
  rows,
  courseName,
  years,
}: {
  rows: PlayerModelRow[];
  courseName: string;
  years: readonly string[];
}) {
  const noHistory = rows.filter((r) => !r.courseHistoryRounds);

  return (
    <section className="surface-card overflow-x-auto">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Course History</div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{courseName} — Historical Results</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Sorted by cumulative Course SG · {rows.length} players with history · color key: <span className="rounded bg-emerald-100 px-1 text-emerald-800 text-[10px] font-bold">Top 5</span>{" "}
            <span className="rounded bg-emerald-50 px-1 text-emerald-700 text-[10px]">Top 15</span>{" "}
            <span className="rounded bg-amber-50 px-1 text-amber-700 text-[10px]">Top 30</span>{" "}
            <span className="rounded bg-red-50 px-1 text-red-600 text-[10px]">30+</span>
          </p>
        </div>
      </div>

      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border/60 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            <th className="pb-2 pr-3 text-left w-8">#</th>
            <th className="pb-2 pr-6 text-left">Player</th>
            <th className="pb-2 px-2 text-center w-12">Rds</th>
            <th className="pb-2 px-2 text-center w-16">Course SG</th>
            <th className="pb-2 px-2 text-center w-14">Avg Fin</th>
            {years.map((y) => (
              <th key={y} className="pb-2 px-2 text-center w-14">{y}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {rows.map((row, i) => (
            <tr key={row.id} className={i % 2 === 1 ? "bg-secondary/20" : ""}>
              <td className="py-2 pr-3 text-xs font-semibold text-muted-foreground">{i + 1}</td>
              <td className="py-2 pr-6 font-medium text-foreground whitespace-nowrap">{row.player}</td>
              <td className="py-2 px-2 text-center text-xs text-foreground">
                {row.courseHistoryRounds ?? <span className="text-muted-foreground">—</span>}
              </td>
              <td className={`py-2 px-2 text-center text-sm tabular-nums ${sgColor(row.courseHistoryScore)}`}>
                {row.courseHistoryScore != null ? (row.courseHistoryScore > 0 ? "+" : "") + row.courseHistoryScore.toFixed(2) : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="py-2 px-2 text-center text-xs text-muted-foreground">
                {row.avgFinish != null ? row.avgFinish.toFixed(1) : "—"}
              </td>
              {row.recentFinishes.map((fin, fi) => (
                <td key={fi} className="py-2 px-2 text-center">
                  {fin ? (
                    <span className={`inline-block min-w-[36px] rounded px-1.5 py-0.5 text-xs ${finishCellBg(fin)}`}>
                      {fin}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40 text-xs">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {noHistory.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground border-t border-border/40 pt-3">
          {noHistory.length} field entrants have no recorded history at {courseName}: {noHistory.slice(0, 10).map((r) => r.player).join(", ")}{noHistory.length > 10 ? ` +${noHistory.length - 10} more` : ""}.
        </p>
      )}
    </section>
  );
}
